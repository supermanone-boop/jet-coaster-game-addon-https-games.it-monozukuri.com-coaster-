// audio.js — 合成音の効果音（チェーンのカタカタ・走る音・風・悲鳴・崩れる音・歓声・ファンファーレなど）
// BGM はなし。走る音と風は鳴らしっぱなしのノードの音量を、速さに合わせて変える。
// iPhone の不具合よけ（裏から戻ると 'interrupted'、アプリを切り替えると無音）はスキル web-audio と同じ形

const MUTE_KEY = 'rc_muted';
const TOUCH = navigator.maxTouchPoints > 0;
let ctx = null;
let master = null;
let muted = false;
let stale = false;
let noiseBuf = null;
let roll = null; // { src, lp, g, hp, wg } 走る音と風
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* 使えない環境 */ }

function resume() {
  if (muted || !ctx) return;
  if (ctx.state !== 'running') ctx.resume()?.catch(() => {});
}
function rebuild() {
  ctx.close()?.catch(() => {});
  ctx = null;
  master = null;
  noiseBuf = null;
  roll = null; // 古い ctx のノードは捨てる
  stale = false;
}
function unlock() {
  if (stale && ctx) rebuild();
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (muted) ctx.suspend()?.catch(() => {});
  }
  resume();
}
function pause() {
  if (!ctx) return;
  ctx.suspend()?.catch(() => {});
  if (TOUCH) stale = true;
}
function wake() {
  if (!stale) resume();
}
document.addEventListener('visibilitychange', () => (document.hidden ? pause() : wake()));
addEventListener('pageshow', () => wake());
for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, () => unlock(), { capture: true, passive: true });

function ac() {
  if (!ctx || muted) return null;
  resume();
  return ctx;
}

function tone(freq, t0, dur, { type = 'square', vol = 0.2, slide = 0, vib = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  const t = c.currentTime + t0;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  if (vib) {
    const l = c.createOscillator();
    const lg = c.createGain();
    l.frequency.value = 7;
    lg.gain.value = freq * vib;
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(t0, dur, { vol = 0.2, type = 'lowpass', freq = 1200, q = 0.7, slide = 0, attack = 0.005 } = {}) {
  const c = ac();
  if (!c || !noiseBuf) return;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  const t = c.currentTime + t0;
  f.frequency.setValueAtTime(freq, t);
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

// 走る音（低いゴー）と風（高いシュー）を速さに合わせる。sp = m/s、0 で止める
function setRoll(sp, rough = 0) {
  const c = ac();
  if (!c || !noiseBuf) return;
  if (!roll) {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    const g = c.createGain();
    g.gain.value = 0;
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1500;
    hp.Q.value = 0.5;
    const wg = c.createGain();
    wg.gain.value = 0;
    src.connect(lp).connect(g).connect(master);
    src.connect(hp).connect(wg).connect(master);
    src.start();
    roll = { src, lp, g, hp, wg };
  }
  const t = c.currentTime;
  const k = Math.min(1, sp / 30);
  roll.g.gain.setTargetAtTime(sp > 0.3 ? 0.08 + k * 0.35 + rough * 0.1 : 0, t, 0.08);
  roll.lp.frequency.setTargetAtTime(120 + k * 500 + rough * 300, t, 0.08);
  roll.wg.gain.setTargetAtTime(sp > 8 ? (k - 0.25) * 0.18 : 0, t, 0.1);
  roll.hp.frequency.setTargetAtTime(900 + k * 1600, t, 0.1);
}

export const sound = {
  get muted() { return muted; },
  setMuted(v) {
    muted = v;
    try { localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (e) { /* 保存できなくても続ける */ }
    if (master) master.gain.value = v ? 0 : 0.5;
    if (v) ctx?.suspend()?.catch(() => {});
    else unlock();
  },
  unlock,
  roll: setRoll,
  sfx(name, k = 1) {
    switch (name) {
      case 'tap':
        tone(900, 0, 0.04, { type: 'square', vol: 0.05 });
        break;
      case 'pop': // しかけを置く
        tone(N(76), 0, 0.08, { type: 'square', vol: 0.1, slide: 1.5 });
        break;
      case 'erase':
        tone(N(64), 0, 0.12, { type: 'triangle', vol: 0.12, slide: 0.5 });
        break;
      case 'draw': // 描く音（ペンのこすれ）
        noise(0, 0.05, { vol: 0.03, type: 'bandpass', freq: 3000 + Math.random() * 2000, q: 2 });
        break;
      case 'build': // 組み立て：カン
        tone(N(84 + Math.floor(Math.random() * 5)), 0, 0.06, { type: 'square', vol: 0.05 });
        noise(0, 0.04, { vol: 0.05, type: 'highpass', freq: 3000 });
        break;
      case 'bell': // 発車ベル
        for (let i = 0; i < 6; i++) tone(N(88), i * 0.12, 0.1, { type: 'square', vol: 0.06 });
        break;
      case 'chain': // カタン
        noise(0, 0.03, { vol: 0.22, type: 'bandpass', freq: 1800, q: 4 });
        tone(140, 0, 0.04, { type: 'square', vol: 0.05 });
        break;
      case 'launch': // 発射：ギューン
        tone(80, 0, 1.6, { type: 'sawtooth', vol: 0.14, slide: 8 });
        noise(0, 1.4, { vol: 0.25, type: 'bandpass', freq: 400, slide: 6, q: 1 });
        break;
      case 'boost':
        tone(120, 0, 0.9, { type: 'sawtooth', vol: 0.1, slide: 5 });
        noise(0, 0.8, { vol: 0.18, type: 'bandpass', freq: 600, slide: 4 });
        break;
      case 'brake': // シューッ
        noise(0, 0.9, { vol: 0.2, type: 'highpass', freq: 3500, attack: 0.05 });
        break;
      case 'scream': { // キャー（k = 人数の目安）
        const n = Math.min(4, Math.max(1, Math.round(k)));
        for (let i = 0; i < n; i++) {
          const f = 900 + Math.random() * 600;
          tone(f, i * 0.07, 0.9 + Math.random() * 0.4, { type: 'sine', vol: 0.06, slide: 0.8 + Math.random() * 0.3, vib: 0.03 });
          tone(f * 2.02, i * 0.07, 0.8, { type: 'sine', vol: 0.02, slide: 0.85, vib: 0.03 });
        }
        break;
      }
      case 'yahoo': // ヤッホー！（楽しい声）
        tone(N(79), 0, 0.15, { type: 'triangle', vol: 0.08, slide: 1.2 });
        tone(N(84), 0.15, 0.3, { type: 'triangle', vol: 0.08, slide: 0.9 });
        break;
      case 'airtime': // ふわっ
        tone(N(84), 0, 0.35, { type: 'sine', vol: 0.08, slide: 1.5 });
        break;
      case 'eject': // ひゅーーーん（上がっていく）
        tone(500, 0, 1.2, { type: 'triangle', vol: 0.14, slide: 3 });
        tone(1200, 0, 0.9, { type: 'sine', vol: 0.05, slide: 1.4, vib: 0.04 });
        break;
      case 'star': // キラーン
        [96, 100, 103, 108].forEach((n, i) => tone(N(n), i * 0.06, 0.25, { type: 'square', vol: 0.06 }));
        break;
      case 'crack': // 線路が折れる：バキッ
        noise(0, 0.25, { vol: 0.5, type: 'highpass', freq: 1500 });
        tone(90, 0, 0.4, { type: 'sawtooth', vol: 0.2, slide: 0.4 });
        noise(0.05, 0.8, { vol: 0.25, type: 'bandpass', freq: 300, q: 3, slide: 0.5 });
        break;
      case 'crash': // ガッシャーン
        noise(0, 1.2, { vol: 0.6, type: 'lowpass', freq: 2500, slide: 0.2 });
        noise(0, 0.5, { vol: 0.3, type: 'highpass', freq: 4000 });
        tone(60, 0, 0.8, { type: 'sine', vol: 0.4, slide: 0.5 });
        for (let i = 0; i < 6; i++) tone(1500 + Math.random() * 2500, 0.1 + i * 0.07, 0.15, { type: 'square', vol: 0.03 });
        break;
      case 'creak': // ギギギ…（崩れ始め）
        tone(70 + Math.random() * 30, 0, 0.8, { type: 'sawtooth', vol: 0.08, slide: 0.7, vib: 0.08 });
        break;
      case 'thud': // ズシーン
        noise(0, 0.6, { vol: 0.35 * Math.min(1, k), type: 'lowpass', freq: 300, slide: 0.4 });
        tone(50, 0, 0.5, { type: 'sine', vol: 0.3 * Math.min(1, k), slide: 0.6 });
        break;
      case 'bump': // ボヨン（人が地面で弾む）
        tone(220, 0, 0.18, { type: 'triangle', vol: 0.12, slide: 0.6 });
        break;
      case 'splash': // ザブーン
        noise(0, 0.9, { vol: 0.4, type: 'bandpass', freq: 1200, q: 0.6, slide: 0.4 });
        for (let i = 0; i < 5; i++) tone(1800 + Math.random() * 1500, 0.1 + i * 0.05, 0.08, { type: 'sine', vol: 0.04 });
        break;
      case 'cheer': // 観客の歓声
        noise(0, 1.8, { vol: 0.12 * k, type: 'bandpass', freq: 1100, q: 0.8, attack: 0.3 });
        noise(0, 1.6, { vol: 0.06 * k, type: 'bandpass', freq: 2400, q: 1.5, attack: 0.3 });
        break;
      case 'gasp': // 観客「えーっ！」
        noise(0, 1.0, { vol: 0.1, type: 'bandpass', freq: 700, q: 1.2, attack: 0.1, slide: 0.7 });
        break;
      case 'land': // ガシャン（着地）
        noise(0, 0.3, { vol: 0.4, type: 'lowpass', freq: 1500 });
        tone(110, 0, 0.25, { type: 'square', vol: 0.12, slide: 0.6 });
        break;
      case 'great': // 大成功のファンファーレ
        [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.55], [84, 0.7]].forEach(([n, t]) => tone(N(n), t, 0.3, { type: 'square', vol: 0.1 }));
        [[48, 0], [55, 0.36], [60, 0.7]].forEach(([n, t]) => tone(N(n), t, 0.45, { type: 'triangle', vol: 0.22 }));
        break;
      case 'ok':
        [[72, 0], [76, 0.14], [79, 0.28]].forEach(([n, t]) => tone(N(n), t, 0.3, { type: 'square', vol: 0.08 }));
        break;
      case 'fail': // ぷぁ〜ん
        [[67, 0], [66, 0.35], [65, 0.7]].forEach(([n, t]) => tone(N(n), t, 0.4, { type: 'sawtooth', vol: 0.07, vib: 0.02 }));
        tone(N(64), 1.05, 0.9, { type: 'sawtooth', vol: 0.07, vib: 0.05, slide: 0.9 });
        break;
      case 'bigfail': // じゃじゃーん
        [[48, 0], [51, 0], [54, 0]].forEach(([n, t]) => tone(N(n), t, 1.4, { type: 'sawtooth', vol: 0.09 }));
        noise(0, 1.2, { vol: 0.2, type: 'lowpass', freq: 600 });
        tone(N(36), 0, 1.6, { type: 'square', vol: 0.1 });
        break;
      default:
    }
  },
};
