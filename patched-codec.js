// codec.js — 設計（上から描いた道・高さ・しかけ・設定）を、URL に載せる短い文字列にする・戻す
// 同じ文字列からは同じ線路・同じ結果になる（シミュレーションは決まった種の乱数で動く）。
// 形：1 バイト目が版。数は 0.5 m 単位に丸める。点は前の点との差を可変長の整数で詰める。
// 点の後ろに装飾（見た目）の 2 バイト（線路の色・車両の色 / 乗る人・景色 を 3 ビットずつ）。
// 装飾は後から足したので、無ければ今の見た目にする（古いリンクも開け、古い版のゲームは余りを読まない）。
// その後ろにマップの 1 バイト（1.1.1 で足した。無ければいつもの遊園地）、
// さらに線路の色・車両の色・乗る人の番号の上の 2 ビットずつの 1 バイト（1.1.3。テーマの見た目で 8 個を超えたため）。
import { H_SAMPLES, H_MAX, H_MIN, FIELD, GIMMICK_KEYS, MATS, BARS, STARTS, MAX_GIMMICKS, MAX_CARS, MAPS, PHYS } from './track.js';
import { cleanLook, defaultLook } from './looks.js';

const VER = 6;
const MATERIAL_VER = 4;
const HEIGHT_VER = 5;
const POINTS_VER = 6;
const MAX_POINTS = 20000;
const MAX_DESIGN_CHARS = 2000000;
// 機能の番号：コースの文字列に入れる「このコースを開くのに要る機能」。しかけ・素材・見た目・値を足して、前の版のゲームでは
// 正しく開けなくなるときは 1 つ上げる（前の版のゲームは「新しいバージョンのコースです」と出して、最新にするよう案内する）。
// 1 = 1.3.0（ひねり・水しぶき・トンネル・垂直落下・物理の版 2）。末尾に足す値は、この後ろに足していく
export const FEAT = 1;
const OX = 8000; // x, z をプラスにするためのずらし（m）

function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function varint(out, v) {
  v = v < 0 ? -v * 2 - 1 : v * 2; // ジグザグ
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}
function readVarint(r) {
  let v = 0;
  let sh = 0;
  for (;;) {
    if (r.i >= r.b.length) throw new Error('short');
    const b = r.b[r.i++];
    v |= (b & 0x7f) << sh;
    if (!(b & 0x80)) break;
    sh += 7;
    if (sh > 28) throw new Error('long');
  }
  return v & 1 ? -(v + 1) / 2 : v / 2;
}

// 道の点を間引く（2 m 以上離し、ほぼ直線の所は Douglas-Peucker で落とす）
export function simplify(pts, tol = 0.35) {
  if (!Array.isArray(pts) || pts.length < 3) return Array.isArray(pts) ? pts.slice() : [];
  const a = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], q = a[a.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 2) a.push(p);
  }
  const last = pts[pts.length - 1];
  if (a[a.length - 1] !== last) a.push(last);
  if (a.length < 3) return a;
  const keep = new Uint8Array(a.length); keep[0] = keep[a.length - 1] = 1;
  const chunk = 384;
  for (let base = 0; base < a.length - 1; base += chunk) {
    const end = Math.min(a.length - 1, base + chunk), stack = [[base, end]]; keep[base] = 1; keep[end] = 1;
    while (stack.length) {
      const [i, j] = stack.pop(); if (j <= i + 1) continue;
      const [x0, z0] = a[i], [x1, z1] = a[j], L = Math.hypot(x1 - x0, z1 - z0) || 1;
      let best = -1, bd = tol;
      for (let k = i + 1; k < j; k++) {
        const p = a[k];
        const d = Math.abs((x1 - x0) * (z0 - p[1]) - (x0 - p[0]) * (z1 - z0)) / L;
        if (d > bd) { bd = d; best = k; }
      }
      if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
    }
  }
  return a.filter((_, i) => keep[i]);
}

// 物理の版：知らない版（これより新しいゲームで作ったコース）は今の版で計算する
export const cleanPhys = (v) => (Number.isInteger(v) && v >= 1 && v <= PHYS ? v : PHYS);
export const cleanMap = (m) => (Number.isInteger(m) && m >= 0 && m < MAPS.length ? m : 0);

export function encode(d) {
  const out = [VER, (d.mat & 15) | ((d.bar & 3) << 4) | ((d.start & 3) << 6), d.cars & 7];
  const gm = (d.gm || []).slice(0, MAX_GIMMICKS);
  out.push(gm.length);
  for (const g of gm) {
    const u = Math.round(Math.min(1, Math.max(0, g.u)) * 4095);
    out.push(GIMMICK_KEYS.indexOf(g.t), u >> 8, u & 255);
  }
  for (let k = 0; k < H_SAMPLES; k++) { const hv = Math.round(Math.min(H_MAX, Math.max(H_MIN, d.hs[k] ?? 2)) * 2); out.push((hv >>> 16) & 255, (hv >>> 8) & 255, hv & 255); }
  const pts = d.pts.slice(0, MAX_POINTS);
  out.push((pts.length >>> 24) & 255, (pts.length >>> 16) & 255, (pts.length >>> 8) & 255, pts.length & 255);
  let px = 0;
  let pz = 0;
  for (const [x, z] of pts) {
    const qx = Math.round((x + OX) * 2);
    const qz = Math.round((z + OX) * 2);
    varint(out, qx - px);
    varint(out, qz - pz);
    px = qx;
    pz = qz;
  }
  const lk = cleanLook(d.look);
  // トンネルの見た目（1.4.0）は、空いていた上の 2 ビットに 2 ビットずつ（下位を 4 バイト目、上位を 2 バイト目）。前の版のゲームでは無視される
  out.push((lk.rail & 7) | ((lk.car & 7) << 3), (lk.rider & 7) | (lk.scene << 3) | ((lk.tunnel >> 2) << 6));
  out.push(cleanMap(d.map));
  out.push((lk.rail >> 3) | ((lk.car >> 3) << 2) | ((lk.rider >> 3) << 4) | ((lk.tunnel & 3) << 6));
  out.push(cleanPhys(d.pv ?? PHYS));
  out.push(FEAT);
  return b64(out);
}

// 壊れた・いじられた文字列は null を返す。
// このゲームより新しい版で作られたコース（知らないしかけ・素材・必要な機能の番号が大きい）も null を返し、info.newer を true にする
// （呼ぶ側は「新しいバージョンのコースです。最新にしてください」と出す。1.3.0〜）
export function decode(str, info = {}) {
  info.newer = false;
  const newer = () => {
    info.newer = true;
    return null;
  };
  try {
    if (!str || str.length > MAX_DESIGN_CHARS) return null;
    const b = unb64(str);
    const r = { b, i: 0 };
    const rd = () => {
      if (r.i >= b.length) throw new Error('short');
      return b[r.i++];
    };
    const ver = rd();
    if (ver > VER) return newer(); if (ver < 1) return null;
    const f = rd();
    const d = { mat: ver >= MATERIAL_VER ? (f & 15) : (f & 3), bar: ver >= MATERIAL_VER ? ((f >> 4) & 3) : ((f >> 2) & 3), start: ver >= MATERIAL_VER ? ((f >> 6) & 3) : ((f >> 4) & 3), cars: rd(), gm: [], hs: [], pts: [] };
    if (d.mat >= MATS.length || d.bar >= BARS.length || d.start >= STARTS.length) return newer();
    if (d.cars < 1) return null;
    if (d.cars > MAX_CARS) return newer();
    const ng = rd();
    if (ng > MAX_GIMMICKS) return newer();
    for (let k = 0; k < ng; k++) {
      const t = GIMMICK_KEYS[rd()];
      const u = ((rd() << 8) | rd()) / 4095;
      if (!t) return newer();
      d.gm.push({ t, u });
    }
    for (let k = 0; k < H_SAMPLES; k++) { const hv = ver >= HEIGHT_VER ? (rd() * 65536 + rd() * 256 + rd()) : rd(); d.hs.push(Math.min(H_MAX, Math.max(H_MIN, hv / 2))); }
    const n = ver >= POINTS_VER ? (rd() * 0x1000000 + rd() * 0x10000 + rd() * 256 + rd()) : ((rd() << 8) | rd());
    if (n < 2 || n > MAX_POINTS) return null;
    let px = 0;
    let pz = 0;
    for (let k = 0; k < n; k++) {
      px += readVarint(r);
      pz += readVarint(r);
      const coordOX = ver >= HEIGHT_VER ? OX : 80; const x = px / 2 - coordOX; const z = pz / 2 - coordOX; if (ver >= HEIGHT_VER ? (Math.abs(x) > 8000.5 || Math.abs(z) > 8000.5) : (x < FIELD.x0 - 1 || x > FIELD.x1 + 1 || z < FIELD.z0 - 1 || z > FIELD.z1 + 1)) return null;
      d.pts.push([x, z]);
    }
    d.look = defaultLook();
    let tunHi = 0; // トンネルの見た目の上位 2 ビット（1.4.0）
    if (r.i + 2 <= b.length) {
      const a = b[r.i++];
      const c = b[r.i++];
      d.look = cleanLook({ rail: a & 7, car: (a >> 3) & 7, rider: c & 7, scene: (c >> 3) & 7 });
      tunHi = c >> 6;
    }
    d.map = r.i < b.length ? cleanMap(b[r.i++]) : 0;
    if (r.i < b.length) {
      const e = b[r.i++];
      const l = d.look;
      d.look = cleanLook({ ...l, rail: l.rail | ((e & 3) << 3), car: l.car | (((e >> 2) & 3) << 3), rider: l.rider | (((e >> 4) & 3) << 3), tunnel: (tunHi << 2) | (e >> 6) });
    }
    // 物理の版（1.3.0）。無ければ 1（1.2.x までに作ったコース）
    if (r.i < b.length) {
      const pv = b[r.i++];
      if (pv > PHYS) return newer();
      d.pv = cleanPhys(pv);
    } else d.pv = 1;
    // このコースを開くのに要る機能の番号（1.3.0〜）。ゲームの FEAT より大きければ、新しい版のコース
    if (r.i < b.length && b[r.i++] > FEAT) return newer();
    return d;
  } catch (e) {
    return null;
  }
}

// 丸めた形にそろえる（自分の画面とシェア先で、同じ数から計算するため）。返す形には、丸めた点の並びの印（normed）を付ける。
// すでに丸めた点の並びのまま（normed が今の点と同じ：シェアのリンク・お気に入り・走らせたコースの「なおす」で、道を描き直していない）なら、
// 間引きをもう一度かけない。間引きは 1 回かけた形にもう一度かけると、さらに点が減って別のコースになる（1.2.x までは、シェア先・
// お気に入りから走らせると、多くのコースで結果が変わっていた）。つづきから（描いている途中の形を保存したもの）は印がないので、前と同じく 1 回かける
export const ptsKey = (pts) => pts.map((p) => `${p[0]},${p[1]}`).join(';');
export function normalize(d) {
  const same = d.normed && d.normed === ptsKey(d.pts);
  const q = same ? decode(encode(d)) : decode(encode({ ...d, pts: simplify(d.pts) }));
  if (q) q.normed = ptsKey(q.pts);
  return q;
}
