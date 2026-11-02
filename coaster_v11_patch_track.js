// Coaster Expansion v11 native-game compatibility patch
export function patchTrack(src){
  if(!/export\s+const\s+FIELD\s*=/.test(src)||!/export\s+const\s+MAX_GIMMICKS\s*=/.test(src))throw new Error('track.js の基本定義が見つかりません。');
  src=src.replace(/export\s+const\s+FIELD\s*=\s*\{[^}]+\};/, 'export const FIELD = { x0: -600, x1: 600, z0: -600, z1: 600 };');
  src=src.replace(/export\s+const\s+H_MAX\s*=\s*[^;]+;/, 'export const H_MAX = Infinity;');
  src=src.replace(/export\s+const\s+MAX_GIMMICKS\s*=\s*\d+\s*;/, 'export const MAX_GIMMICKS = 128;');
  src=src.replace(/export\s+const\s+MAX_LEN\s*=\s*\d+\s*;/, 'export const MAX_LEN = 5000;');
  // Replace only the support-spacing function; native gimmick objects and their definitions remain untouched.
  const start=src.indexOf('function makeSupports(tr) {');
  if(start>=0){const end=src.indexOf('\n}',start);if(end>start){const old=src.slice(start,end+2);const repl=`function makeSupports(tr) {\n  tr.supports = [];\n  let nextAt = 0;\n  for (let i = 0; i < tr.n; i++) {\n    if (tr.fl[i] & (F.STATION | F.GAP)) continue;\n    if (tr.uy[i] < 0.45) continue;\n    const y = Math.max(0, tr.py[i] - tr.uy[i] * 0.55);\n    if (y < 0.6 || i < nextAt) continue;\n    const spacing = y < 30 ? 6 : y < 80 ? 10 : y < 180 ? 16 : y < 350 ? 24 : y < 700 ? 36 : 48;\n    tr.supports.push(i);\n    nextAt = i + Math.max(1, Math.round(spacing / DS));\n  }\n}`;src=src.slice(0,start)+repl+src.slice(end+2);}}
  return src;
}
