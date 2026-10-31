// looks.js — 装飾（見た目の選択）。線路の色・車両の色・乗る人・景色
// 走りには影響しない（sim.js の seedOf に入れない）。URL では点の後ろの 2 バイトに入る（codec.js）。
// どれも 0 番が「何も選ばないときの今の見た目」。1 項目 3 ビット（8 個まで）。線路・車両・乗る人は、
// テーマ（ハロウィン・クリスマス…）の分を足すので、マップの後ろの 1 バイトに上の 2 ビットずつを足す（32 個まで。1.1.3）。

// 線路の色。0 は素材ごとの色（world.js の LOOK）
export const RAIL_LOOKS = [
  { id: 'auto', name: 'おまかせ', sw: 'linear-gradient(135deg,#9a9aa2 0 33%,#e84a5f 33% 66%,#f8c040 66%)' },
  { id: 'red', name: '赤', sw: '#e8384f', rail: '#e8384f', spine: '#e8384f', tie: '#2a2a32', sup: '#f2f2f2', sup2: '#d8d8de' },
  { id: 'blue', name: '青', sw: '#2f7ae8', rail: '#2f7ae8', spine: '#2f7ae8', tie: '#f2f2f2', sup: '#f8d040', sup2: '#e0b830' },
  { id: 'green', name: '緑', sw: '#3ab05a', rail: '#3ab05a', spine: '#3ab05a', tie: '#2a2a32', sup: '#f4e8c8', sup2: '#d8ccb0' },
  { id: 'pink', name: 'ピンク', sw: '#ff7ab0', rail: '#ff7ab0', spine: '#ff7ab0', tie: '#ffffff', sup: '#b8e4ff', sup2: '#98c8e8' },
  { id: 'black', name: '黒', sw: '#2a2a32', rail: '#2a2a32', spine: '#2a2a32', tie: '#e84a5f', sup: '#3a3a44', sup2: '#2a2a32' },
  // テーマ（1.1.3）
  { id: 'halloween', name: 'ハロウィン', sw: 'linear-gradient(135deg,#f07818 0 50%,#6a2a9a 50%)', rail: '#f07818', spine: '#6a2a9a', tie: '#1e1a22', sup: '#3a2a48', sup2: '#2a1e34' },
  { id: 'xmas', name: 'クリスマス', sw: 'linear-gradient(135deg,#e8384f 0 50%,#2a8a3a 50%)', rail: '#e8384f', spine: '#2a8a3a', tie: '#ffffff', sup: '#f4f4f4', sup2: '#e8384f' },
  { id: 'sakura', name: '桜', sw: 'linear-gradient(135deg,#ff9ac0 0 50%,#ffffff 50%)', rail: '#ff9ac0', spine: '#ffffff', tie: '#8a5a3a', sup: '#fce4ec', sup2: '#f4b8cc' },
  { id: 'summer', name: '夏', sw: 'linear-gradient(135deg,#20b8e8 0 50%,#f8d040 50%)', rail: '#20b8e8', spine: '#f8d040', tie: '#ffffff', sup: '#ffffff', sup2: '#20b8e8' },
];
// 車両の色。0 は車両ごとに違う色（world.js の CAR_COLORS）、5 は車体を虹のしまにする
export const CAR_LOOKS = [
  { id: 'mix', name: 'いろいろ', sw: 'linear-gradient(135deg,#e84a5f 0 33%,#3aa0ff 33% 66%,#f8b800 66%)' },
  { id: 'red', name: '赤', sw: '#e8384f', c: '#e8384f' },
  { id: 'blue', name: '青', sw: '#2f7ae8', c: '#2f7ae8' },
  { id: 'gold', name: '金', sw: '#e8b830', c: '#e8b830' },
  { id: 'black', name: '黒', sw: '#2a2a30', c: '#2a2a30' },
  { id: 'rainbow', name: '虹', sw: 'linear-gradient(180deg,#e8384f,#ff9a30,#f8d040,#4ac060,#3a8ae8,#9a5ad8)' },
  // テーマ（1.1.3）。trim：ふちの色、face：車体の前にかぼちゃの顔
  { id: 'pumpkin', name: 'かぼちゃ', sw: '#ee7618', c: '#ee7618', trim: '#3a8a2a', face: true },
  { id: 'xmas', name: 'クリスマス', sw: 'linear-gradient(180deg,#ffffff 0 25%,#e8384f 25%)', c: '#e8384f', trim: '#ffffff', bells: true },
  // petals：横に桜の花、stripes：横にスイカのしま
  { id: 'sakura', name: '桜', sw: 'radial-gradient(circle,#ffffff 0 30%,#ff9ac0 30%)', c: '#ff9ac0', trim: '#ffffff', petals: true },
  { id: 'suika', name: 'スイカ', sw: 'linear-gradient(180deg,#e8384f 0 25%,#2a8a3a 25%)', c: '#3a9a3a', trim: '#e8384f', stripes: true },
];
export const RIDER_LOOKS = [
  { id: 'human', name: '人', icon: '🧑' },
  { id: 'cat', name: 'ネコ', icon: '🐱' },
  { id: 'dog', name: 'イヌ', icon: '🐶' },
  { id: 'rabbit', name: 'ウサギ', icon: '🐰' },
  { id: 'panda', name: 'パンダ', icon: '🐼' },
  { id: 'robot', name: 'ロボット', icon: '🤖' },
  // テーマ（1.1.3）
  { id: 'jack', name: 'かぼちゃ', icon: '🎃' },
  { id: 'ghost', name: 'おばけ', icon: '👻' },
  { id: 'santa', name: 'サンタ', icon: '🎅' },
  { id: 'reindeer', name: 'トナカイ', icon: '🦌' },
  { id: 'chick', name: 'ひよこ', icon: '🐤' },
  { id: 'aloha', name: 'アロハ', icon: '😎' },
];
export const SCENE_LOOKS = [
  { id: 'day', name: '昼', icon: '☀️' },
  { id: 'sunset', name: '夕焼け', icon: '🌇' },
  { id: 'night', name: '夜', icon: '🌙' },
  { id: 'snow', name: '雪', icon: '⛄' },
];

export const defaultLook = () => ({ rail: 0, car: 0, rider: 0, scene: 0 });

// 範囲外・欠けた値は 0 に戻す
export function cleanLook(l) {
  const f = (v, list) => (Number.isInteger(v) && v >= 0 && v < list.length ? v : 0);
  return { rail: f(l?.rail, RAIL_LOOKS), car: f(l?.car, CAR_LOOKS), rider: f(l?.rider, RIDER_LOOKS), scene: f(l?.scene, SCENE_LOOKS) };
}
export const isDefaultLook = (l) => !l || (!l.rail && !l.car && !l.rider && !l.scene);
