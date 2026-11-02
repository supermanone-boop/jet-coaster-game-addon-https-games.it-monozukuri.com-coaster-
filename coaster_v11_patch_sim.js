// Coaster Expansion v11 native-game compatibility patch
export function patchSim(src){
  // The native ride still uses its own physics and 12+ gimmick handlers. Only remove the old hard stop.
  src=src.replace(/\s*else\s+if\s*\(this\.t\s*>\s*MAX_T\)\s*this\.finish\(['"]stuck['"]\);/g,'');
  src=src.replace(/\s*if\s*\(this\.t\s*>\s*MAX_T\)\s*this\.finish\(['"]stuck['"]\);/g,'');
  return src;
}
