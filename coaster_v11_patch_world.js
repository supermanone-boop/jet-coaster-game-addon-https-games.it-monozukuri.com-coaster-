// Coaster Expansion v11 native-game compatibility patch
export function patchWorld(src){
  src=src.replace('const S = 320;\n  const PX = 3;', 'const S = Math.max(320, Math.ceil(Math.max(FIELD.x1 - FIELD.x0, FIELD.z1 - FIELD.z0) + 80));\n  const PX = S > 500 ? 0.75 : 3;');
  src=src.replace('const sq = (w) => (140 / 256) / ((2 * Math.PI * 260) / w);','const SKY_RADIUS = Math.max(260, (FIELD.x1 - FIELD.x0) * 1.4);\n  const sq = (w) => (140 / 256) / ((2 * Math.PI * SKY_RADIUS) / w);');
  src=src.replace('new THREE.CylinderGeometry(260, 260, 140, 32, 1, true)','new THREE.CylinderGeometry(SKY_RADIUS, SKY_RADIUS, 140, 64, 1, true)');
  src=src.replace('const w = 0.7 + y * 0.06;', 'const w = Math.min(14, 0.7 + y * 0.022);');
  src=src.replace('const steps = Math.max(1, Math.floor(y / 3));','const bracePitch = y > 300 ? 30 : y > 100 ? 18 : y > 45 ? 9 : 3;\n        const steps = Math.max(1, Math.min(24, Math.ceil(y / bracePitch)));');
  return src;
}
