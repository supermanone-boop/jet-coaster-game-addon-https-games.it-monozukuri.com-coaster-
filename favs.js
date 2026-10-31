// favs.js — お気に入りのコース（ブラウザの localStorage に保存する）
// 1 件は { id, name, code（codec.js の encode の文字列）, at（保存した時刻 ms） }。新しいものを先頭に置く
const KEY = 'rc_favs';
export const MAX_FAVS = 30;
export const MAX_NAME = 20;

export function loadFavs() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(a)) return [];
    return a.filter((f) => f && typeof f.id === 'string' && typeof f.code === 'string' && typeof f.name === 'string');
  } catch (e) {
    return [];
  }
}
// 保存できたら true（容量いっぱい・プライベートブラウズなどで失敗したら false）
export function saveFavs(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_FAVS)));
    return true;
  } catch (e) {
    return false;
  }
}
export const newFavId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// 「コース 1」「コース 2」…のうち、まだ使っていない名前
export function nextFavName(list) {
  const used = new Set(list.map((f) => f.name));
  for (let k = 1; ; k++) if (!used.has(`コース ${k}`)) return `コース ${k}`;
}
export const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
