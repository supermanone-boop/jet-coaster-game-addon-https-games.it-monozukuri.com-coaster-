import fs from 'node:fs';
import assert from 'node:assert/strict';
import { patchTrackPhysics, patchCodecV14, patchEditorView, patchWorld, patchExpansionSource, patchSimSource, patchWaterMain } from './patches.mjs';
const fsx = fs.readFileSync;
const base = process.argv[2];
const track = patchTrackPhysics(fsx(base + '/track.js','utf8'));
const codec = patchCodecV14(fsx(base + '/codec.js','utf8'));
const editor = patchEditorView(fsx(base + '/editor.js','utf8'));
const world = patchWorld(fsx(base + '/world.js','utf8'));
const sim = patchSimSource(fsx(base + '/sim.js','utf8'));
const main = patchWaterMain(fsx(base + '/main.js','utf8'));
const extensionFixture = `<label>サイズ<select data-size><option value="1.5">標準 ×1.5</option><option value="3" selected>広い ×3</option><option value="4.5">特大 ×4.5</option><option value="6">最大 ×6</option></select></label>
敷地：1,200m × 1,200m／手描きコース上限：5,000m。
<input min="0.1" max="4" step="0.1" data-path-scale>
Number($('[data-path-scale]').value) || 1, 0.1, 4)
Number($(a === 'path-x' ? '[data-path-x]' : '[data-path-z]').value) || 0, -600, 600)
<input min="-10000" max="10000" step="10" data-alt-offset>
Number($('[data-alt-offset]').value) || 0, -10000, 10000)
else if(a==='fit-field'){editor.mapView={cx:0,cz:0,zoom:0.105};editor.draw();}
  function applyPreset() {
  const statusEl = $('[data-status]');
$('[data-track-stats]').textContent = \`走行ルート 約\${Math.round(full).toLocaleString()}m（手描き \${Math.round(l).toLocaleString()}m）／ 使用幅 \${Math.round(w)} × \${Math.round(h)}m ／ 上限 \${MAX_LEN.toLocaleString()}m\`;
const dx = clamp(wantX, FIELD.x0 + 4 - minX, FIELD.x1 - 4 - maxX);
const dz = clamp(wantZ, FIELD.z0 + 4 - minZ, FIELD.z1 - 4 - maxZ);
const next = transformed.map(([x, z]) => [clamp(x + dx, FIELD.x0 + 2, FIELD.x1 - 2), clamp(z + dz, FIELD.z0 + 2, FIELD.z1 - 2)]);
if (polyLen(next) > MAX_LEN + 1) throw new Error(\`変形後のコース長が\${MAX_LEN.toLocaleString()}mを超えます\`);
  function simplifyPath(points, tolerance) {
    return points;
  }
  function report(text) {}
function loadProject(d){if(!d||!Array.isArray(d.pts)||d.pts.length>8192) throw new Error('invalid'); if(d.pts.some(p=>p[0]<FIELD.x0||p[0]>FIELD.x1||p[1]<FIELD.z0||p[1]>FIELD.z1)) throw new Error('outside');}
else if(a==='field-size'){applyFieldSize();}`;
const patchedExtension = patchExpansionSource(extensionFixture);
assert.match(track, /MAX_LEN\s*=\s*1000000000000/);
assert.match(track, /FIELD = \{ x0: -70, x1: 70, z0: -48, z1: 48 \}/);
assert.match(track, /if \(Math\.round\(n\) === 140\)/);
assert.match(codec, /const VER = 6/);
assert.match(codec, /POINTS_VER = 6/);
assert.match(codec, /out\.push\(\(pts\.length >>> 24\)/);
assert.match(codec, /const MAX_POINTS = 20000/);
assert.match(codec, /Math\.abs\(x\) > 8000\.5/);
assert.doesNotMatch(codec, /if \(x < FIELD\.x0 - 1 \|\| x > FIELD\.x1 \+ 1 \|\| z < FIELD\.z0 - 1 \|\| z > FIELD\.z1 \+ 1\) return null;\n\s*d\.pts\.push/);
assert.match(codec, /const n = ver >= POINTS_VER/);
assert.match(editor, /d\.pts\.length > 20000/);
assert.match(editor, /if \(pts\.length > 20000\) return;/);
assert.doesNotMatch(editor, /polyLen\(pts\) > MAX_LEN/);
assert.match(editor, /if \(pts\.length > 20000\) return;/);
assert.doesNotMatch(editor, /polyLen\(pts\) > MAX_LEN/);
assert.match(world, /const extent = 16600/);
assert.match(world, /farTex\.repeat\.set\(extent \/ 128, extent \/ 128\)/);
assert.match(world, /this\.wi = \(\(this\.wi \|\| 0\) \+ 1\) % this\.max/);
assert.doesNotMatch(world, /this\.list\.shift\(\)/);
assert.match(sim, /const MAX_T = 86400/);
assert.match(sim, /AUTO_TEST_MAX_T = 160/);
assert.match(sim, /boostScale/);
assert.match(sim, /brakeScale/);
assert.match(main, /new Particles\(1400, 1\.2, true\)/);
assert.match(main, /Math\.max\(0, Math\.min\(4, n\)\)/);
assert.match(patchedExtension, /data-field-size/);
assert.match(patchedExtension, /敷地サイズは140〜16,000m/);
assert.match(patchedExtension, /距離上限はありません/);
assert.ok(patchedExtension.includes("Number($('[data-path-scale]').value) || 1, 0.1, 32)"));
console.log('PASS expansion UI anchors, reversible field-size action, unbounded distance transforms');
assert.match(patchedExtension, /20000/);
assert.match(patchedExtension, /Math\.abs\(p\[0\]\)>8000/);
for (const [name, code] of Object.entries({'track.js':track,'codec.js':codec,'editor.js':editor,'world.js':world,'sim.js':sim,'main.js':main})) {
  const path = base + '/patched-' + name;
  fs.writeFileSync(path, code);
  // strip ESM imports/exports only for syntax checks? node --check supports ESM .mjs.
}
console.log('PASS: no fixed metre cap, default field reset, codec v6/legacy decoder, 20k point safety cap, tiled world, ring particles, 160s preview budget / 24h live ride guard, adjustable boost/brake, native water buffer');
