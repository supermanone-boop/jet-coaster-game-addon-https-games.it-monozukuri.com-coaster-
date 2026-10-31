// fix.js — ① の道の手直しの手伝い（カーブで起きる事故を、カーブをゆるくして直す）
// 走らせるときと同じ物理で確かめながら、事故の起きたカーブの前後の描いた線を、なめらかな曲線（エルミート曲線）に置きかえる。
// 置きかえる範囲を少しずつ広げ、その所の事故がなくなる、いちばん小さな直し方を使う。
// 高さ（hs）・しかけ（gm）は道のりの割合で持っているので、道の長さが変わっても、同じ所に残るように並べ直す。
// THREE を使わないので node でも動く（tools/coaster/fix.mjs で確かめる）
import { pathOf, polyLen, profileAt, FIELD, G, F, MATS } from './track.js';
import { Sim } from './sim.js';
import { normalize } from './codec.js';

const STEP = 1.5; // 描いた線を並べ直す間隔（m）。editor.js の resample と同じ
const ENDS = 8; // 描いた線の両はしから何点は動かさないか（駅とのつなぎを変えないため）

export function resample(pts, step = STEP) {
  const out = [pts[0].slice()];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    let t = step - acc;
    while (t <= l) {
      out.push([ax + ((bx - ax) * t) / l, az + ((bz - az) * t) / l]);
      t += step;
    }
    acc = l - (t - step);
  }
  const last = pts[pts.length - 1];
  const q = out[out.length - 1];
  if (Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.3) out.push(last.slice());
  return out;
}

// 走らせるときと同じ形で走らせ、カーブで起きた事故（線路が折れた・横に飛ばされた）を探す
// 返す issues：{ x, z, hg（その所の横向きの G の見込み）, type }。カーブでない所の事故は other に数える
export function examine(design, buildTrack) {
  const d = normalize(design) || design;
  const dryTr = buildTrack(d, null);
  const dry = new Sim(dryTr, d, { dry: true });
  dry.runToEnd();
  const vEst = dry.vEst;
  const tr = buildTrack(d, vEst);
  const sim = new Sim(tr, d);
  const r = sim.runToEnd();
  const issues = [];
  let other = 0;
  for (const e of sim.events) {
    if (e.type !== 'break' && e.type !== 'eject') continue;
    if (issues.some((o) => Math.hypot(o.x - e.x, o.z - e.z) < 10)) continue;
    const i = nearestTr(tr, e.x, e.y, e.z);
    const hg = curveG(tr, vEst, i);
    if (hg >= 1.2 && !(tr.fl[i] & 64)) issues.push({ x: tr.px[i], z: tr.pz[i], hg, type: e.type, i });
    else other++;
  }
  return { r, issues, other, tr, vEst, clashes: tr.clashes.length };
}
function nearestTr(tr, x, y, z) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < tr.n; i++) {
    const d = (tr.px[i] - x) ** 2 + (tr.py[i] - y) ** 2 * 0.3 + (tr.pz[i] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
// 上から見たカーブの半径と速さから、横向きの G の見込み（前後 4 m の中でいちばん大きいもの）
function curveG(tr, vEst, i) {
  let best = 0;
  const K = 8; // 点の間隔 0.5 m × 8 = 4 m
  for (let j = i - 8; j <= i + 8; j++) {
    const a = tr.wrap ? tr.wrap(j - K) : Math.max(0, j - K);
    const b = tr.wrap ? tr.wrap(j) : j;
    const c = tr.wrap ? tr.wrap(j + K) : Math.min(tr.n - 1, j + K);
    const R = circumR([tr.px[a], tr.pz[a]], [tr.px[b], tr.pz[b]], [tr.px[c], tr.pz[c]]);
    const v = vEst ? vEst[b] || 0 : 0;
    best = Math.max(best, (v * v) / (R * G));
  }
  return best;
}
// 上から見たカーブの半径（前後 4 m の中でいちばん小さいもの）。走らせた結果の事故がカーブで起きたかを見分ける
export function curveRadius(tr, i) {
  let best = Infinity;
  const K = 8;
  for (let j = i - 8; j <= i + 8; j++) {
    const a = tr.wrap(j - K);
    const b = tr.wrap(j);
    const c = tr.wrap(j + K);
    best = Math.min(best, circumR([tr.px[a], tr.pz[a]], [tr.px[b], tr.pz[b]], [tr.px[c], tr.pz[c]]));
  }
  return best;
}
function circumR(a, b, c) {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return cross < 1e-6 ? Infinity : (ab * bc * ca) / (2 * cross);
}

// 描いた線の a〜b 番目を、両はしの位置と向きを保ったなめらかな曲線に置きかえる（c：曲線のふくらみ）
function easeRange(pts, a, b, c) {
  const P0 = pts[a];
  const P1 = pts[b];
  const t0 = unit(pts[Math.min(a + 1, pts.length - 1)], pts[Math.max(a - 1, 0)]);
  const t1 = unit(pts[Math.min(b + 1, pts.length - 1)], pts[Math.max(b - 1, 0)]);
  const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]) * c;
  const n = Math.max(2, Math.round(((b - a) * STEP) / STEP));
  const mid = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h10 = t ** 3 - 2 * t ** 2 + t;
    const h01 = -2 * t ** 3 + 3 * t ** 2;
    const h11 = t ** 3 - t ** 2;
    mid.push([h00 * P0[0] + h10 * L * t0[0] + h01 * P1[0] + h11 * L * t1[0], h00 * P0[1] + h10 * L * t0[1] + h01 * P1[1] + h11 * L * t1[1]]);
  }
  return resample([...pts.slice(0, a + 1), ...mid, ...pts.slice(b)]);
}
function unit(p, q) {
  const dx = p[0] - q[0];
  const dz = p[1] - q[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}
const inField = (pts) => pts.every(([x, z]) => x >= FIELD.x0 + 2 && x <= FIELD.x1 - 2 && z >= FIELD.z0 + 2 && z <= FIELD.z1 - 2);

// 道が変わっても、高さ・しかけが同じ所に残るように、道のりの割合を並べ直す。
// 置きかえた範囲の始まり（A）と終わり（B）が、古い道・新しい道のどこにあるかを探し、その間を伸び縮みさせる
function remap(design, oldPath, newPath, A, B) {
  const Lo = polyLen(oldPath);
  const Ln = polyLen(newPath);
  const at = (path, p) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = (path[i][0] - p[0]) ** 2 + (path[i][1] - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return polyLen(path.slice(0, best + 1));
  };
  const ao = at(oldPath, A);
  const bo = Math.max(ao + 1, at(oldPath, B));
  const an = at(newPath, A);
  const bn = Math.max(an + 1, at(newPath, B));
  // 新しい道の m（m）→ 古い道の m
  const back = (m) => (m <= an ? (m * ao) / (an || 1) : m <= bn ? ao + ((m - an) * (bo - ao)) / (bn - an) : bo + ((m - bn) * (Lo - bo)) / (Ln - bn || 1));
  const fwd = (m) => (m <= ao ? (m * an) / (ao || 1) : m <= bo ? an + ((m - ao) * (bn - an)) / (bo - ao) : bn + ((m - bo) * (Ln - bn)) / (Lo - bo || 1));
  const out = { ...design };
  if (design.hs && design.hs.length >= 2) {
    const n = design.hs.length;
    out.hs = Array.from({ length: n }, (_, k) => profileAt(design.hs, back((k / (n - 1)) * Ln) / Lo));
  }
  if (design.gm) out.gm = design.gm.map((g) => ({ ...g, u: Math.min(0.995, Math.max(0, fwd(g.u * Lo) / Ln)) }));
  return out;
}

// 1 か所を直す：その所の描いた線の前後を、狭い範囲から順に広げてなめらかにし、その所の事故がなくなる直し方を返す
function fixSpot(design, issue, buildTrack, base, deadline) {
  const pts = resample(design.pts);
  // 事故の所にいちばん近い描いた線の点
  let j = 0;
  let bd = Infinity;
  pts.forEach(([x, z], i) => {
    const d = (x - issue.x) ** 2 + (z - issue.z) ** 2;
    if (d < bd) {
      bd = d;
      j = i;
    }
  });
  // 描いた線から遠い所（駅へのつなぎ・発射のあとのゆるいカーブ）は、描いた線では直せない
  if (bd > 10 * 10) return null;
  const oldPath = pathOf(design);
  for (const half of [8, 12, 17, 23, 30, 38, 48]) {
    for (const c of [1.0, 1.35]) {
      if (Date.now() > deadline) return null;
      const a = Math.max(ENDS, j - half);
      const b = Math.min(pts.length - 1 - ENDS, j + half);
      if (b - a < 4) return null;
      const np = easeRange(pts, a, b, c);
      if (!inField(np)) continue;
      const cand0 = { ...design, pts: np };
      const cand = remap(cand0, oldPath, pathOf(cand0), pts[a], pts[b]);
      const ex = examine(cand, buildTrack);
      // 線路どうしがぶつかる所が増える直し方は使わない
      if (ex.clashes > base.clashes) continue;
      // その所（前後 20 m）で事故が起きなくなったら、この直し方にする（先の別のカーブで起きるのは、次に直す）
      if (!ex.issues.some((o) => Math.hypot(o.x - issue.x, o.z - issue.z) < 20)) return { design: cand, ex };
    }
  }
  return null;
}

// カーブの事故を、起きる順に直していく。
// 返す：{ design（直した設計。直せなかったら元のまま）, fixed（直した所の数）, spots（直した所）, left（直せなかったカーブの事故）, other（カーブ以外の事故）, r（直したあとの結果） }
export function fixCurves(design, buildTrack, { budgetMs = 3000, maxSpots = 10 } = {}) {
  const deadline = Date.now() + budgetMs;
  let cur = design;
  let ex = examine(cur, buildTrack);
  let fixed = 0;
  const spots = [];
  const skip = [];
  for (let k = 0; k < maxSpots; k++) {
    const issue = ex.issues.find((o) => !skip.some((s) => Math.hypot(s.x - o.x, s.z - o.z) < 15));
    if (!issue) break;
    // 直した所のすぐ先（25 m 以内）でまた起きた：事故が同じカーブの少し先へずれただけ（形では直しきれない）。
    // 1.0.12 までは、これも「直した」と数えて同じカーブを何度も直し、結局直らなかった（オーナーの指摘：直せそうなのに何もしてくれない）
    if (spots.some((p) => Math.hypot(p.x - issue.x, p.z - issue.z) < 25)) {
      skip.push(issue);
      continue;
    }
    const f = fixSpot(cur, issue, buildTrack, ex, deadline);
    if (!f) {
      skip.push(issue);
      if (Date.now() > deadline) break;
      continue;
    }
    cur = f.design;
    ex = f.ex;
    fixed++;
    spots.push({ x: issue.x, z: issue.z });
  }
  return { design: cur, fixed, spots, left: ex.issues.length, other: ex.other, r: ex.r };
}

// 「カーブを安全な形に整える」：急なカーブをゆるくして、全体の形を整える（事故を必ずなくすものではない。しかけは足さない）。
// 高さを描いていないときは、半径 14 m より急なカーブをゆるくする。高さを描いたあとは、予想の速さで、
// 横向きの G が線路の横の強さの 7 割（鉄製で約 2.7 G）を超えるカーブも、その速さで曲がれる半径までゆるくする。
// いちばん急な所から順に、置きかえる範囲を広げながらなめらかにし、届かなくても少しでもゆるくなれば使う
const BASE_R = 14;
export function smoothCurves(design, buildTrack, withSpeed = false, { maxSpots = 20, budgetMs = 1500 } = {}) {
  const deadline = Date.now() + budgetMs;
  let cur = design;
  let pts = resample(design.pts);
  // 描いた線の点ごとの、ゆるくしたい半径
  let need = () => BASE_R;
  let clashes0 = 0;
  if (withSpeed) {
    const d = normalize(design) || design;
    const tr = buildTrack(d, null);
    const dry = new Sim(tr, d, { dry: true });
    dry.runToEnd();
    clashes0 = tr.clashes.length;
    const hgMax = MATS[d.mat ?? 1].l * 0.7;
    need = (p) => {
      let bi = 0;
      let bd = Infinity;
      for (let i = tr.stEnd; i < tr.n; i += 2) {
        const q = (tr.px[i] - p[0]) ** 2 + (tr.pz[i] - p[1]) ** 2;
        if (q < bd) {
          bd = q;
          bi = i;
        }
      }
      // 宙返りの中・高い所を通る線（ほかの道の上を越える所）は見ない
      if (tr.fl[bi] & F.LOOP) return BASE_R;
      const v = dry.vEst[bi] || 0;
      return Math.max(BASE_R, (v * v) / (G * hgMax));
    };
  }
  const radius = (q, i) => circumR(q[i - 3], q[i], q[i + 3]);
  const skip = new Set();
  let fixed = 0;
  const spots = [];
  for (let k = 0; k < maxSpots && Date.now() < deadline; k++) {
    // いちばん「ゆるくしたい半径 ÷ いまの半径」が大きい所
    let worst = -1;
    let wv = 1;
    for (let i = ENDS + 3; i < pts.length - ENDS - 3; i++) {
      if (skip.has(Math.round(i / 6))) continue;
      const v = need(pts[i]) / radius(pts, i);
      if (v > wv) {
        wv = v;
        worst = i;
      }
    }
    if (worst < 0) break;
    const want = need(pts[worst]);
    const cands = [];
    for (const half of [6, 9, 13, 18, 24, 32]) {
      const a = Math.max(ENDS, worst - half);
      const b = Math.min(pts.length - 1 - ENDS, worst + half);
      if (b - a < 4) break;
      const np = easeRange(pts, a, b, 1.0);
      if (!inField(np)) continue;
      // 置きかえた所（と前後）のいちばん急な所
      const nb = a + (np.length - (pts.length - b));
      let r2 = Infinity;
      for (let i = Math.max(3, a - 3); i <= Math.min(np.length - 4, nb + 3); i++) r2 = Math.min(r2, radius(np, i));
      const wr = radius(pts, worst);
      if (r2 < wr * 1.15) continue;
      cands.push({ np, a, b, r2 });
      if (r2 >= want) break;
    }
    // 大きく直すものから順に、線路どうしがぶつかる所が増えないものを使う（せまい折り返しは、となりの線路に当たらない所まで）
    let best = null;
    let next = null;
    for (const c of cands.reverse()) {
      const n = remap({ ...cur, pts: c.np }, pathOf(cur), pathOf({ ...cur, pts: c.np }), pts[c.a], pts[c.b]);
      if (withSpeed && buildTrack(normalize(n) || n, null).clashes.length > clashes0) continue;
      best = c;
      next = n;
      break;
    }
    if (!best) {
      skip.add(Math.round(worst / 6));
      continue;
    }
    spots.push({ x: pts[worst][0], z: pts[worst][1] });
    cur = next;
    pts = best.np;
    fixed++;
  }
  return { design: cur, fixed, spots };
}
