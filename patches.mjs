  function patchTrackPhysics(source) {
    function setExportedNumeric(name, value) {
      const re = new RegExp('(export\\s+(?:const|let)\\s+' + name + '\\s*=\\s*)([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))(\\s*;)', 'g');
      const matches = [...source.matchAll(re)];
      if (matches.length !== 1) throw new Error('現行 track.js の ' + name + ' 定義が一意に見つかりません。');
      source = source.replace(re, (_, before, _old, after) => before + String(value) + after);
    }
    setExportedNumeric('MAX_GIMMICKS', 128);
    // 5kmのコース長制限は撤去。1e12mは実用上到達しない安全側の比較値。
    setExportedNumeric('MAX_LEN', 1000000000000);
    setExportedNumeric('H_MAX', 100000);
    const fieldRe = /export\s+const\s+FIELD\s*=\s*\{\s*x0\s*:\s*[-+]?\d+(?:\.\d+)?\s*,\s*x1\s*:\s*[-+]?\d+(?:\.\d+)?\s*,\s*z0\s*:\s*[-+]?\d+(?:\.\d+)?\s*,\s*z1\s*:\s*[-+]?\d+(?:\.\d+)?\s*\}\s*;/;
    if (!fieldRe.test(source)) throw new Error('現行 track.js の FIELD 範囲を特定できません。');
    // 初期状態はゲーム標準の140×96m。拡張はUIから行い、いつでも標準へ戻せる。
    source = source.replace(fieldRe, 'export const FIELD = { x0: -70, x1: 70, z0: -48, z1: 48 };');
    source += `\n// v14.2: selectable field size; 140 restores the exact native 140x96m field.\nexport function getCoasterFieldSize() { return (Math.abs(FIELD.x0 + 70) < 1e-6 && Math.abs(FIELD.x1 - 70) < 1e-6 && Math.abs(FIELD.z0 + 48) < 1e-6 && Math.abs(FIELD.z1 - 48) < 1e-6) ? 140 : Math.max(FIELD.x1 - FIELD.x0, FIELD.z1 - FIELD.z0); }\nexport function setCoasterFieldSize(value) { const n = Number(value); if (!Number.isFinite(n)) throw new TypeError('field size must be finite'); if (Math.round(n) === 140) { FIELD.x0 = -70; FIELD.x1 = 70; FIELD.z0 = -48; FIELD.z1 = 48; return { width: 140, height: 96, ...FIELD }; } const size = Math.max(150, Math.min(16000, Math.round(n / 10) * 10)); const half = size / 2; FIELD.x0 = -half; FIELD.x1 = half; FIELD.z0 = -half; FIELD.z1 = half; return { width: size, height: size, ...FIELD }; }\n`;

    const number = '([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';
    const findLoopConstant = (kind) => {
      const re = new RegExp('(?:export\\s+)?(const|let)\\s+(LOOP_[A-Z0-9_]*(?:' + kind + '))\\s*=\\s*' + number + '\\s*;');
      return source.match(re);
    };
    const loopLength = findLoopConstant('LEN|LENGTH|SIZE|RADIUS|HEIGHT');
    const loopWidth = findLoopConstant('W|WIDTH');
    const loopLengthName = loopLength && loopLength[2];
    const loopWidthName = loopWidth && loopWidth[2];
    if (!loopLengthName || !loopWidthName) throw new Error('現行 track.js の宙返り寸法定義が見つかりません。');
    const makeMutable = (match) => {
      if (!match || match[1] !== 'const') return;
      const name = match[2];
      const re = new RegExp('(export\\s+)(const\\s+)' + name + '(\\s*=)');
      source = source.replace(re, '$1let ' + name + '$3');
    };
    makeMutable(loopLength); makeMutable(loopWidth);
    const dynamicNames = [];
    const constantRe = /export\s+(const|let)\s+([A-Z0-9_]+)\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))\s*;/g;
    let match;
    while ((match = constantRe.exec(source))) {
      const name = match[2];
      const isTunnel = /TUNNEL/.test(name) && /(LEN|LENGTH)/.test(name);
      const isTwist = /(TWIST|ROLL|BARREL)/.test(name) && /(LEN|LENGTH)/.test(name);
      if ((isTunnel || isTwist) && !/(MAX|MIN|DEFAULT|BASE)/.test(name)) dynamicNames.push(name);
    }
    for (const name of dynamicNames) {
      const re = new RegExp('(export\\s+)(const\\s+)' + name + '(\\s*=)');
      source = source.replace(re, '$1let ' + name + '$3');
    }
    const exports = [];
    const cacheReset = /\blet\s+loopShapeCache\s*=/.test(source) ? 'if (typeof loopShapeCache !== "undefined") loopShapeCache = null;' : '';
    exports.push(
      'export function getCoasterLoopDimensions() { return { length: ' + loopLengthName + ', width: ' + loopWidthName + ' }; }',
      'export function setCoasterLoopDimensions(length, width) { const l = Number(length), w = Number(width); if (!Number.isFinite(l) || !Number.isFinite(w)) throw new TypeError("loop dimensions must be finite"); ' + loopLengthName + ' = Math.max(12, Math.min(800, l)); ' + loopWidthName + ' = Math.max(0.5, Math.min(80, w)); ' + cacheReset + ' return { length: ' + loopLengthName + ', width: ' + loopWidthName + ' }; }'
    );
    if (dynamicNames.length) {
      const cases = dynamicNames.map(name => 'case "' + name + '": ' + name + ' = n; return n;').join('\n');
      exports.push('export function setCoasterFeatureLength(name, value) { const n = Number(value); if (!Number.isFinite(n)) throw new TypeError("feature length must be finite"); switch (name) {\n' + cases + '\ndefault: throw new Error("unknown feature length: " + name); } }');
      exports.push('export const COASTER_FEATURE_LENGTH_KEYS = ' + JSON.stringify(dynamicNames) + ';');
    } else exports.push('export const COASTER_FEATURE_LENGTH_KEYS = [];');
    source += '\n// Coaster Physics Tuning v14.2\n' + exports.join('\n') + '\n';
    return source;
  }

  function patchCodecV14(source) {
    const vm = source.match(/\bconst\s+VER\s*=\s*(\d+)\s*;/);
    if (!vm) throw new Error('codec.js の保存形式バージョンが見つかりません。');
    const oldVersion = Number(vm[1]);
    if (oldVersion > 1) throw new Error('未対応の codec.js が読み込まれました。');
    source = source.replace(vm[0], 'const VER = 6;\nconst MATERIAL_VER = 4;\nconst HEIGHT_VER = 5;\nconst POINTS_VER = 6;\nconst MAX_POINTS = 20000;\nconst MAX_DESIGN_CHARS = 2000000;');
    source = source.replace(/const\s+OX\s*=\s*80\s*;/, 'const OX = 8000;');
    const encodeHead = /(const\s+out\s*=\s*\[\s*VER\s*,\s*)\(?\s*d\.mat\s*&\s*3\s*\)?\s*\|\s*\(\s*\(\s*d\.bar\s*&\s*3\s*\)\s*<<\s*2\s*\)\s*\|\s*\(\s*\(\s*d\.start\s*&\s*3\s*\)\s*<<\s*4\s*\)(\s*,\s*d\.cars\s*&\s*7\s*\])/;
    if (!encodeHead.test(source)) throw new Error('codec.js の素材・拘束・スタート符号化を認識できません。');
    source = source.replace(encodeHead, (_, a, b) => `${a}(d.mat & 15) | ((d.bar & 3) << 4) | ((d.start & 3) << 6)${b}`);
    const heightWriter = /for\s*\(let\s+k\s*=\s*0\s*;\s*k\s*<\s*H_SAMPLES\s*;\s*k\+\+\)\s*out\.push\(Math\.round\(Math\.min\(H_MAX,\s*Math\.max\(H_MIN,\s*d\.hs\[k\]\s*\?\?\s*2\)\)\s*\*\s*2\)\)\s*;/;
    if (!heightWriter.test(source)) throw new Error('codec.js の高さ書き込み形式を認識できません。');
    source = source.replace(heightWriter, 'for (let k = 0; k < H_SAMPLES; k++) { const hv = Math.round(Math.min(H_MAX, Math.max(H_MIN, d.hs[k] ?? 2)) * 2); out.push((hv >>> 16) & 255, (hv >>> 8) & 255, hv & 255); }');
    if (!source.includes('const pts = d.pts.slice(0, 1500);')) throw new Error('codec.js の点数書き込み位置が見つかりません。');
    source = source.replace('const pts = d.pts.slice(0, 1500);', 'const pts = d.pts.slice(0, MAX_POINTS);');
    if (!source.includes('out.push(pts.length >> 8, pts.length & 255);')) throw new Error('codec.js の点数ヘッダーが見つかりません。');
    source = source.replace('out.push(pts.length >> 8, pts.length & 255);', 'out.push((pts.length >>> 24) & 255, (pts.length >>> 16) & 255, (pts.length >>> 8) & 255, pts.length & 255);');
    source = source.replace(/if\s*\(!str\s*\|\|\s*str\.length\s*>\s*6000\s*\)\s*return\s+null\s*;/, 'if (!str || str.length > MAX_DESIGN_CHARS) return null;');
    const verLine = /if\s*\(\s*ver\s*>\s*VER\s*\)\s*return\s+newer\(\)\s*;\s*if\s*\(\s*ver\s*!==\s*VER\s*\)\s*return\s+null\s*;/;
    if (!verLine.test(source)) throw new Error('codec.js の古い保存形式互換判定を認識できません。');
    source = source.replace(verLine, 'if (ver > VER) return newer(); if (ver < 1) return null;');
    const dataHead = /const\s+d\s*=\s*\{\s*mat\s*:\s*f\s*&\s*3\s*,\s*bar\s*:\s*\(\s*f\s*>>\s*2\s*\)\s*&\s*3\s*,\s*start\s*:\s*\(\s*f\s*>>\s*4\s*\)\s*&\s*3\s*,\s*cars\s*:\s*rd\(\)\s*,\s*gm\s*:\s*\[\s*\]\s*,\s*hs\s*:\s*\[\s*\]\s*,\s*pts\s*:\s*\[\s*\]\s*\};/;
    if (!dataHead.test(source)) throw new Error('codec.js の素材・コースデータ読み込み形式を認識できません。');
    source = source.replace(dataHead, 'const d = { mat: ver >= MATERIAL_VER ? (f & 15) : (f & 3), bar: ver >= MATERIAL_VER ? ((f >> 4) & 3) : ((f >> 2) & 3), start: ver >= MATERIAL_VER ? ((f >> 6) & 3) : ((f >> 4) & 3), cars: rd(), gm: [], hs: [], pts: [] };');
    const heightReader = /for \(let k = 0; k < H_SAMPLES; k\+\+\) d\.hs\.push\(Math\.min\(H_MAX, Math\.max\(H_MIN, rd\(\) \/ 2\)\)\);/;
    if (!heightReader.test(source)) throw new Error('codec.js の高さ読み込み形式を認識できません。');
    source = source.replace(heightReader, 'for (let k = 0; k < H_SAMPLES; k++) { const hv = ver >= HEIGHT_VER ? (rd() * 65536 + rd() * 256 + rd()) : rd(); d.hs.push(Math.min(H_MAX, Math.max(H_MIN, hv / 2))); }');
    const pointCount = /const\s+n\s*=\s*\(\s*rd\(\)\s*<<\s*8\s*\)\s*\|\s*rd\(\)\s*;/;
    if (!pointCount.test(source)) throw new Error('codec.js の点数読み込み形式を認識できません。');
    source = source.replace(pointCount, 'const n = ver >= POINTS_VER ? (rd() * 0x1000000 + rd() * 0x10000 + rd() * 256 + rd()) : ((rd() << 8) | rd());');
    source = source.replace('if (n < 2 || n > 1500) return null;', 'if (n < 2 || n > MAX_POINTS) return null;');
    if (!source.includes('if (n < 2 || n > MAX_POINTS) return null;')) throw new Error('codec.js の点数検証を拡張できません。');
    const coord = /const\s+x\s*=\s*px\s*\/\s*2\s*-\s*OX\s*;\s*const\s+z\s*=\s*pz\s*\/\s*2\s*-\s*OX\s*;/;
    if (!coord.test(source)) throw new Error('codec.js の座標復元形式を認識できません。');
    source = source.replace(coord, 'const coordOX = ver >= HEIGHT_VER ? OX : 80; const x = px / 2 - coordOX; const z = pz / 2 - coordOX; if (ver >= HEIGHT_VER ? (Math.abs(x) > 8000.5 || Math.abs(z) > 8000.5) : (x < FIELD.x0 - 1 || x > FIELD.x1 + 1 || z < FIELD.z0 - 1 || z > FIELD.z1 + 1)) return null;');
    // 新形式(v5+)は現在の敷地サイズに依存させない。v14.1で作った大きな設計を標準敷地へ縮小後も読める。
    source = source.replace('if (x < FIELD.x0 - 1 || x > FIELD.x1 + 1 || z < FIELD.z0 - 1 || z > FIELD.z1 + 1) return null;\n      d.pts.push([x, z]);', 'd.pts.push([x, z]);');
    if (source.includes('if (x < FIELD.x0 - 1 || x > FIELD.x1 + 1 || z < FIELD.z0 - 1 || z > FIELD.z1 + 1) return null;\n      d.pts.push([x, z]);')) throw new Error('codec.js の二重敷地チェックを除去できません。');
    // Bound the Douglas-Peucker work in 384-point chunks to avoid quadratic pauses on mobile.
    const simplifyRe = /export function simplify\(pts, tol = 0\.35\) \{[\s\S]*?\n\}\n\n\/\/ 物理の版/;
    if (!simplifyRe.test(source)) throw new Error('codec.js の simplify() を特定できません。');
    const fastSimplify = `export function simplify(pts, tol = 0.35) {
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

// 物理の版`;
    source = source.replace(simplifyRe, fastSimplify);
    return source;
  }

  function patchEditorView(source) {
    // Editor は mapView / fitMapView を実装していなかったため、現行キャンバス内へ追加。
    const ctorAnchor = '    this.step = 1;';
    if (!source.includes(ctorAnchor)) throw new Error('editor.js の Editor 初期化位置が見つかりません。');
    source = source.replace(ctorAnchor, ctorAnchor + '\n    this.mapView = { cx: 0, cz: 0, zoom: 0.006 };\n    this._mapViewInitialized = false;\n    this.heightViewMax = null;\n    this.panPointerId = null;\n    this.panStart = null;');
    const inputAnchor = "    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.cv.addEventListener(ev, (e) => this.up(e));";
    if (!source.includes(inputAnchor)) throw new Error('editor.js のポインターイベント位置が見つかりません。');
    source = source.replace(inputAnchor, inputAnchor + '\n    this.installExpandedViewTools();');

    const viewMethods = String.raw`  installExpandedViewTools() {
    if (!this.cvWrap || this.cvWrap.querySelector('.ed-v141-viewtools')) return;
    const computed = getComputedStyle(this.cvWrap);
    if (computed.position === 'static') this.cvWrap.style.position = 'relative';
    const tools = document.createElement('div');
    tools.className = 'ed-exp-viewtools ed-v141-viewtools';
    tools.style.cssText = 'position:absolute;z-index:9;top:8px;right:8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;max-width:calc(100% - 16px);padding:5px;touch-action:manipulation';
    tools.innerHTML = '<div data-map-tools style="display:flex;flex-wrap:wrap;gap:4px;align-items:center"><b style="font:700 11px system-ui">地図</b><button type="button" data-vview="zoom-in" aria-label="拡大">＋</button><button type="button" data-vview="zoom-out" aria-label="縮小">−</button><button type="button" data-vview="fit-track">コース全体</button><button type="button" data-vview="fit-field">敷地全体</button><button type="button" data-vview="left">←</button><button type="button" data-vview="up">↑</button><button type="button" data-vview="down">↓</button><button type="button" data-vview="right">→</button><span data-vview-scale style="font:10px system-ui;color:#536779"></span></div><label data-height-tools hidden style="display:flex;gap:4px;align-items:center;font:700 11px system-ui">高さ目盛り<select data-height-scale style="max-width:118px;height:29px;border:1px solid #bac8d1;border-radius:6px;background:white;color:#24374b"><option value="auto">自動</option><option value="60">60 m</option><option value="100">100 m</option><option value="300">300 m</option><option value="600">600 m</option><option value="1000">1,000 m</option><option value="5000">5,000 m</option><option value="10000">10,000 m</option><option value="50000">50,000 m</option><option value="100000">100,000 m</option></select></label><style>.ed-v141-viewtools button{min-width:29px;padding:3px 6px;border:1px solid #c4d0d8;border-radius:6px;background:#fff;color:#2b3a55;font:700 11px system-ui}.ed-v141-viewtools select{font:11px system-ui}@media(max-width:520px){.ed-v141-viewtools{left:8px;right:8px;justify-content:flex-start}.ed-v141-viewtools button{min-width:26px;padding:2px 5px}}</style>';
    this.cvWrap.appendChild(tools);
    this.viewTools = tools;
    tools.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-vview]');
      if (!button) return;
      event.preventDefault(); event.stopPropagation();
      const action = button.dataset.vview;
      if (action === 'zoom-in') this.zoomMap(1.5);
      else if (action === 'zoom-out') this.zoomMap(1 / 1.5);
      else if (action === 'fit-track') this.fitMapView();
      else if (action === 'fit-field') this.fitFieldView();
      else if (['left','right','up','down'].includes(action)) this.panMap(action);
    });
    const select = tools.querySelector('[data-height-scale]');
    select.value = String(this.heightViewMax || 'auto');
    select.addEventListener('change', () => {
      this.heightViewMax = select.value === 'auto' ? null : Number(select.value);
      this.draw();
    });
    this.cv.addEventListener('wheel', (event) => {
      if (this.step !== 1) return;
      event.preventDefault();
      const [sx, sy] = this.pos(event);
      this.zoomMap(event.deltaY < 0 ? 1.18 : 1 / 1.18, sx, sy);
    }, { passive: false });
    this.cv.addEventListener('contextmenu', (event) => event.preventDefault());
  }
  updateViewTools() {
    if (!this.viewTools) return;
    const map = this.viewTools.querySelector('[data-map-tools]');
    const height = this.viewTools.querySelector('[data-height-tools]');
    if (map) map.hidden = this.step !== 1;
    if (height) height.hidden = this.step === 1;
    const scale = this.viewTools.querySelector('[data-vview-scale]');
    if (scale && this.step === 1 && this.mapView) scale.textContent = '×' + Number(this.mapView.zoom || 0).toFixed(3);
  }
  fitFieldView() {
    if (!this.W || !this.H) return;
    const rot = this.H > this.W * 1.15, pad = 26;
    const fw = FIELD.x1 - FIELD.x0, fh = FIELD.z1 - FIELD.z0;
    const refW = rot ? 96 : 140, refH = rot ? 140 : 96;
    const baseK = Math.min((this.W - pad * 2) / refW, (this.H - pad * 2) / refH);
    const fitK = Math.min((this.W - pad * 2) / (rot ? fh : fw), (this.H - pad * 2) / (rot ? fw : fh));
    this.mapView = { cx: (FIELD.x0 + FIELD.x1) / 2, cz: (FIELD.z0 + FIELD.z1) / 2, zoom: Math.max(0.00001, fitK / Math.max(baseK, 1e-9)) };
    this.draw();
    this.updateViewTools();
  }
  fitMapView() {
    const pts = this.design && Array.isArray(this.design.pts) ? this.design.pts : [];
    if (pts.length < 2) return this.fitFieldView();
    const xs = pts.map(p => Number(p[0])).filter(Number.isFinite);
    const zs = pts.map(p => Number(p[1])).filter(Number.isFinite);
    if (xs.length < 2 || zs.length < 2) return this.fitFieldView();
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const padX = Math.max(50, (maxX - minX) * 0.08), padZ = Math.max(50, (maxZ - minZ) * 0.08);
    const rot = this.H > this.W * 1.15, pad = 26;
    const bw = Math.max(100, maxX - minX + padX * 2), bh = Math.max(100, maxZ - minZ + padZ * 2);
    const refW = rot ? 96 : 140, refH = rot ? 140 : 96;
    const baseK = Math.min((this.W - pad * 2) / refW, (this.H - pad * 2) / refH);
    const fitK = Math.min((this.W - pad * 2) / (rot ? bh : bw), (this.H - pad * 2) / (rot ? bw : bh));
    this.mapView = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, zoom: Math.max(0.00001, fitK / Math.max(baseK, 1e-9)) };
    this.draw();
    this.updateViewTools();
  }
  zoomMap(factor, sx = this.W / 2, sy = this.H / 2) {
    if (!this.mapView) this.fitFieldView();
    const before = this.mapXf(), world = before.toW(sx, sy);
    const nextZoom = Math.max(0.00001, Math.min(8, Number(this.mapView.zoom || 1) * factor));
    const next = { ...this.mapView, zoom: nextZoom };
    const rot = this.H > this.W * 1.15, pad = 14;
    const refW = rot ? 96 : 140, refH = rot ? 140 : 96;
    const k = Math.min((this.W - pad * 2) / refW, (this.H - pad * 2) / refH) * nextZoom;
    if (rot) { next.cx = world[0] + (sy - this.H / 2) / k; next.cz = world[1] - (sx - this.W / 2) / k; }
    else { next.cx = world[0] - (sx - this.W / 2) / k; next.cz = world[1] - (sy - this.H / 2) / k; }
    this.mapView = next;
    this.draw();
    this.updateViewTools();
  }
  panMap(direction) {
    if (!this.mapView) this.fitFieldView();
    const xSpan = (this.W / Math.max(this.mapXf().k, 1e-9)) * 0.18;
    const zSpan = (this.H / Math.max(this.mapXf().k, 1e-9)) * 0.18;
    const rot = this.H > this.W * 1.15;
    const dx = direction === 'left' ? -xSpan : direction === 'right' ? xSpan : 0;
    const dz = direction === 'up' ? -zSpan : direction === 'down' ? zSpan : 0;
    this.mapView = { ...this.mapView, cx: this.mapView.cx + (rot ? -dz : dx), cz: this.mapView.cz + (rot ? dx : dz) };
    this.draw();
    this.updateViewTools();
  }
`;
    const mapAnchor = '  // 上から見た図の座標\n  mapXf() {';
    if (!source.includes(mapAnchor)) throw new Error('editor.js の mapXf() 挿入位置が見つかりません。');
    source = source.replace(mapAnchor, viewMethods + '\n  // 上から見た図の座標\n  mapXf() {');

    source = source.replace('const { k, toS, rot } = this.mapXf();', 'const { k, toS, toW, rot } = this.mapXf();');
    const oldMapXf = /  mapXf\(\) \{[\s\S]*?\n  \}\n  \/\/ 2 つの角から/;
    const newMapXf = String.raw`  mapXf() {
    const pad = 14;
    const rot = this.H > this.W * 1.15;
    const refW = rot ? 96 : 140, refH = rot ? 140 : 96;
    if (!this.mapView) this.mapView = { cx: 0, cz: 0, zoom: Math.min(140 / (FIELD.x1 - FIELD.x0), 96 / (FIELD.z1 - FIELD.z0)) };
    const view = this.mapView;
    const baseK = Math.min((this.W - pad * 2) / refW, (this.H - pad * 2) / refH);
    const k = Math.max(1e-9, baseK * Math.max(0.00001, Number(view.zoom) || 1));
    const cx = Number(view.cx) || 0, cz = Number(view.cz) || 0;
    if (rot) return { k, baseK, rot, toS: (x,z) => [this.W / 2 + (z - cz) * k, this.H / 2 - (x - cx) * k], toW: (sx,sy) => [cx - (sy - this.H / 2) / k, cz + (sx - this.W / 2) / k] };
    return { k, baseK, rot, toS: (x,z) => [this.W / 2 + (x - cx) * k, this.H / 2 + (z - cz) * k], toW: (sx,sy) => [cx + (sx - this.W / 2) / k, cz + (sy - this.H / 2) / k] };
  }
  // 2 つの角から`;
    if (!oldMapXf.test(source)) throw new Error('editor.js の mapXf() 本体を置換できません。');
    source = source.replace(oldMapXf, newMapXf);

    const oldSide = /  sideXf\(\) \{[\s\S]*?\n  \}\n\n  draw\(\) \{/;
    const newSide = String.raw`  sideXf() {
    const padL=34,padR=12,padT=this.step>=3?30:16,padB=26,w=this.W-padL-padR,h=this.H-padT-padB;
    const actual = this.design && Array.isArray(this.design.hs) ? Math.max(2, ...this.design.hs.map(Number).filter(Number.isFinite)) : 2;
    const automatic = Math.max(300, Math.ceil((actual * 1.18) / 50) * 50);
    const Hmax = Math.min(H_MAX, Math.max(60, Number(this.heightViewMax) || automatic));
    return { x0:padL,y0:padT,w,h,hMax:Hmax,ux:u=>padL+u*w,hy:hh=>padT+h-(hh/Hmax)*h,toU:sx=>clamp((sx-padL)/w,0,1),toH:sy=>clamp(((padT+h-sy)/h)*Hmax,H_MIN,H_MAX) };
  }

  draw() {`;
    if (!oldSide.test(source)) throw new Error('editor.js の sideXf() 本体を置換できません。');
    source = source.replace(oldSide, newSide);

    // Grid density must be proportional to zoom; a 16km field cannot draw a 10m full-field grid.
    const oldGrid = /    \/\/ 方眼（10 m）\n    c\.strokeStyle = GRID;[\s\S]*?    \/\/ 敷地の枠（生け垣）/;
    const newGrid = String.raw`    // ズームに合わせた可変方眼。画面内だけ描き、16km全域の細線ループを避ける。
    c.strokeStyle = GRID; c.lineWidth = 1;
    const corners = [[0,0],[this.W,0],[this.W,this.H],[0,this.H]].map(([sx,sy])=>toW(sx,sy));
    const vx0 = Math.max(FIELD.x0, Math.min(...corners.map(p=>p[0]))), vx1 = Math.min(FIELD.x1, Math.max(...corners.map(p=>p[0])));
    const vz0 = Math.max(FIELD.z0, Math.min(...corners.map(p=>p[1]))), vz1 = Math.min(FIELD.z1, Math.max(...corners.map(p=>p[1])));
    const rawStep = 52 / Math.max(k, 1e-6), p10 = Math.pow(10, Math.floor(Math.log10(Math.max(1,rawStep)))), q = rawStep / p10;
    const gridStep = Math.max(1, (q <= 1 ? 1 : q <= 2 ? 2 : q <= 5 ? 5 : 10) * p10);
    for (let x = Math.ceil(vx0 / gridStep) * gridStep; x <= vx1; x += gridStep) { const a=toS(x,vz0),b=toS(x,vz1); c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke(); }
    for (let z = Math.ceil(vz0 / gridStep) * gridStep; z <= vz1; z += gridStep) { const a=toS(vx0,z),b=toS(vx1,z); c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke(); }
    // 敷地の枠（生け垣）`;
    if (!oldGrid.test(source)) throw new Error('editor.js の地図グリッドを置換できません。');
    source = source.replace(oldGrid, newGrid);

    // Height chart: use an adaptive grid count instead of 10m across 100km.
    const oldHeightGrid = /    for \(let h = 0; h <= H_MAX; h \+= 10\) \{[\s\S]*?      c\.fillText\(`\$\{h\}m`, X\.x0 - 4, y\);\n    \}/;
    const newHeightGrid = String.raw`    const hStepRaw = X.hMax / 10, hPow = Math.pow(10, Math.floor(Math.log10(Math.max(1,hStepRaw))));
    const hQ = hStepRaw / hPow, hStep = Math.max(1, (hQ <= 1 ? 1 : hQ <= 2 ? 2 : hQ <= 5 ? 5 : 10) * hPow);
    for (let h = 0; h <= X.hMax; h += hStep) { const y=X.hy(h); c.beginPath(); c.moveTo(X.x0,y); c.lineTo(X.x0+X.w,y); c.stroke(); c.fillText(String(h.toLocaleString())+'m',X.x0-4,y); }`;
    if (!oldHeightGrid.test(source)) throw new Error('editor.js の高さグリッドを置換できません。');
    source = source.replace(oldHeightGrid, newHeightGrid);
    source = source.replace('if (d.pts.length > 1400 || polyLen(d.pts) > MAX_LEN)', 'if (d.pts.length > 20000)');
    source = source.replace('if (polyLen(pts) > MAX_LEN) return;', 'if (pts.length > 20000) return;');
    source = source.replace('全長の上限（約${MAX_LEN}m）です。これ以上は描けません', '点数の安全上限（20,000点）に達しました。コースを分けて描いてください');
    if (!source.includes('d.pts.length > 20000)')) throw new Error('editor.js の点数上限を拡張できません。');

    // Pan gesture (Shift + drag on desktop, middle/right drag as alternatives).
    const downAnchor = '    if (this.pid != null) return;';
    const panDown = String.raw`    if (this.step === 1 && this.pid == null && (e.shiftKey || e.button === 1 || e.button === 2)) {
      this.panPointerId = e.pointerId; const [sx,sy]=this.pos(e); this.panStart={sx,sy,cx:this.mapView.cx,cz:this.mapView.cz};
      this.cv.setPointerCapture?.(e.pointerId); return;
    }
    if (this.pid != null) return;`;
    if (!source.includes(downAnchor)) throw new Error('editor.js の down() 操作位置が見つかりません。');
    source = source.replace(downAnchor, panDown);
    const moveAnchor = '    if (!this.drawing || e.pointerId !== this.pid) return;';
    const panMove = String.raw`    if (this.panPointerId === e.pointerId && this.panStart) {
      e.preventDefault(); const [sx,sy]=this.pos(e); const dx=sx-this.panStart.sx,dy=sy-this.panStart.sy; const X=this.mapXf();
      this.mapView={...this.mapView,cx:this.panStart.cx-(X.rot?-dy:dx)/X.k,cz:this.panStart.cz-(X.rot?dx:dy)/X.k}; this.draw(); return;
    }
    if (!this.drawing || e.pointerId !== this.pid) return;`;
    if (!source.includes(moveAnchor)) throw new Error('editor.js の move() 操作位置が見つかりません。');
    source = source.replace(moveAnchor, panMove);
    const upAnchor = '    if (e.pointerId !== this.pid) return;';
    const panUp = String.raw`    if (e.pointerId === this.panPointerId) { this.panPointerId=null; this.panStart=null; return; }
    if (e.pointerId !== this.pid) return;`;
    if (!source.includes(upAnchor)) throw new Error('editor.js の up() 操作位置が見つかりません。');
    source = source.replace(upAnchor, panUp);

    // Initialize to a fit-to-field view on first actual canvas size, and update toolbar visibility.
    const resizeAnchor = '    this.H = Math.max(10, r.height);';
    if (!source.includes(resizeAnchor)) throw new Error('editor.js の resize() サイズ確定位置が見つかりません。');
    source = source.replace(resizeAnchor, resizeAnchor + '\n    if (!this._mapViewInitialized) { this.fitFieldView(); this._mapViewInitialized = true; }');
    const drawAnchor = '    c.fillRect(0, 0, this.W, this.H);';
    if (!source.includes(drawAnchor)) throw new Error('editor.js の draw() 描画開始位置が見つかりません。');
    source = source.replace(drawAnchor, drawAnchor + '\n    this.updateViewTools();');

    return source;
  }

  function patchWorld(source) {
    const fieldHighlight = `    x.fillStyle = 'rgba(255,255,255,0.06)';
    x.fillRect(fx(FIELD.x0), fx(FIELD.z0), (FIELD.x1 - FIELD.x0) * k, (FIELD.z1 - FIELD.z0) * k);`;
    const clippedHighlight = `    // 320mの公園テクスチャ内に敷地が収まる場合だけハイライトを描く。16kmの範囲で全画面を白く塗りつぶさない。
    if (FIELD.x0 >= -S / 2 && FIELD.x1 <= S / 2 && FIELD.z0 >= -S / 2 && FIELD.z1 <= S / 2) {
      x.fillStyle = 'rgba(255,255,255,0.06)';
      x.fillRect(fx(FIELD.x0), fx(FIELD.z0), (FIELD.x1 - FIELD.x0) * k, (FIELD.z1 - FIELD.z0) * k);
    }`;
    if (!source.includes(fieldHighlight)) throw new Error('world.js の敷地ハイライトを特定できません。');
    source = source.replace(fieldHighlight, clippedHighlight);
    const fieldPath = `    x.strokeStyle = S0.path;
    x.lineWidth = 5 * k;
    x.strokeRect(fx(FIELD.x0 - 6), fx(FIELD.z0 - 6), (FIELD.x1 - FIELD.x0 + 12) * k, (FIELD.z1 - FIELD.z0 + 12) * k);`;
    const clippedPath = `    // 外周園路は中央の公園テクスチャ内に敷地が収まるときだけ描く。
    if (FIELD.x0 >= -S / 2 + 6 && FIELD.x1 <= S / 2 - 6 && FIELD.z0 >= -S / 2 + 6 && FIELD.z1 <= S / 2 - 6) {
      x.strokeStyle = S0.path;
      x.lineWidth = 5 * k;
      x.strokeRect(fx(FIELD.x0 - 6), fx(FIELD.z0 - 6), (FIELD.x1 - FIELD.x0 + 12) * k, (FIELD.z1 - FIELD.z0 + 12) * k);
    }`;
    if (!source.includes(fieldPath)) throw new Error('world.js の敷地園路を特定できません。');
    source = source.replace(fieldPath, clippedPath);

    const groundAnchor = '  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshLambertMaterial({ map: tex }));\n  ground.rotation.x = -Math.PI / 2;\n  g.add(ground);';
    if (!source.includes(groundAnchor)) throw new Error('world.js の公園地面を特定できません。');
    const groundExtended = groundAnchor + `
  // 中央の既存公園・各マップはそのまま保持し、外側だけを小さな反復芝テクスチャで延長。
  const extent = 16600; // 敷地サイズを後から16kmへ広げても地面の下地を作り直さずに済む固定カバー。
  const farTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = S0.grass[0]; x.fillRect(0, 0, w, h);
    // 道路・建物を捏造せず、現在のテーマ色で自然な濃淡だけをつける。
    let seed = 0x5f3759df;
    const rand = () => { seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) | 0; return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < 700; i++) {
      const r = 2 + rand() * 10, px = rand() * w, py = rand() * h;
      x.fillStyle = i % 3 ? 'rgba(255,255,255,0.025)' : 'rgba(18,48,12,0.04)';
      x.beginPath(); x.ellipse(px, py, r * (0.6 + rand()), r * (0.35 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2); x.fill();
    }
  });
  farTex.wrapS = THREE.RepeatWrapping; farTex.wrapT = THREE.RepeatWrapping;
  farTex.repeat.set(extent / 128, extent / 128);
  const wideGround = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), new THREE.MeshLambertMaterial({ map: farTex }));
  wideGround.rotation.x = -Math.PI / 2; wideGround.position.y = -0.45; wideGround.name = 'CoasterWideGround'; g.add(wideGround);`;
    source = source.replace(groundAnchor, groundExtended);

    const hedgeAnchor = '  const ex = FIELD.x1 + 4;\n  const ez = FIELD.z1 + 4;';
    if (!source.includes(hedgeAnchor)) throw new Error('world.js の外周生け垣を特定できません。');
    source = source.replace(hedgeAnchor, '  // 細かな電飾・植栽は中央公園だけで生成し、16kmの敷地で大量のオブジェクトを作らない。\n  const ex = Math.min(FIELD.x1 + 4, 170);\n  const ez = Math.min(FIELD.z1 + 4, 170);');

    const materialAnchor = '  const lk = pick && pick.rail ? { ...pick, spine: LOOK[mat].spine ? pick.spine : null } : LOOK[mat];';
    if (!source.includes(materialAnchor)) throw new Error('world.js の線路素材LOOK参照を特定できません。');
    const materialReplacement = `  const baseLook = LOOK[mat] || (String(mat).startsWith('platinum-diamond')
    ? { rail: '#e7edf4', tie: '#657383', spine: '#f7fbff', sup: '#c6d0da', sup2: '#929eaa' }
    : LOOK.steel);
  const lk = pick && pick.rail
    ? { ...baseLook, ...pick, tie: pick.tie || baseLook.tie, spine: baseLook.spine ? (pick.spine ?? baseLook.spine) : null, sup: pick.sup || baseLook.sup, sup2: pick.sup2 || baseLook.sup2 }
    : baseLook;`;
    source = source.replace(materialAnchor, materialReplacement);

    const burstRe = /      if \(this\.list\.length >= this\.max\) this\.list\.shift\(\);\n      const a = Math\.random\(\) \* Math\.PI \* 2;\n      const s = Math\.random\(\) \* speed;\n      this\.list\.push\(\{ x, y, z, vx: Math\.cos\(a\) \* s, vy: up \* \(0\.5 \+ Math\.random\(\)\), vz: Math\.sin\(a\) \* s, t: 0, life: life \* \(0\.6 \+ Math\.random\(\) \* 0\.6\), c, grav \}\);/;
    if (!burstRe.test(source)) throw new Error('world.js の水パーティクルburst()を特定できません。');
    source = source.replace(burstRe, `      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      const particle = { x, y, z, vx: Math.cos(a) * s, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s, t: 0, life: life * (0.6 + Math.random() * 0.6), c, grav };
      if (this.list.length >= this.max) { this.wi = ((this.wi || 0) + 1) % this.max; this.list[this.wi] = particle; }
      else this.list.push(particle);`);
    return source;
  }

  function patchExpansionSource(source) {
    const oldSize = '<label>サイズ<select data-size><option value="1.5">標準 ×1.5</option><option value="3" selected>広い ×3</option><option value="4.5">特大 ×4.5</option><option value="6">最大 ×6</option></select></label>';
    const newSize = '<label>サイズ<select data-size><option value="1.5">標準 ×1.5</option><option value="3" selected>広い ×3</option><option value="4.5">特大 ×4.5</option><option value="6">最大 ×6</option><option value="10">超大型 ×10</option><option value="20">巨大 ×20</option><option value="32">最大級 ×32</option></select></label><label>敷地サイズ (m)<input type="number" data-field-size min="140" max="16000" step="10" value="140" inputmode="numeric"></label><button type="button" class="chip" data-action="field-size">範囲を適用</button>';
    if (!source.includes(oldSize)) throw new Error('拡張UIのコースサイズ欄を見つけられません。');
    source = source.replace(oldSize, newSize);
    source = source.replace('敷地：1,200m × 1,200m／手描きコース上限：5,000m。', '敷地は標準140×96mから最大16,000mまで変更可能。手描きコースの距離上限はありません（端末性能・保存容量による実用上限があります）。');
    source = source.replace('min="0.1" max="4" step="0.1" data-path-scale', 'min="0.1" max="32" step="0.1" data-path-scale');
    source = source.replace('Number($(\'[data-path-scale]\').value) || 1, 0.1, 4)', 'Number($(\'[data-path-scale]\').value) || 1, 0.1, 32)');
    source = source.replace('Number($(a === \'path-x\' ? \'[data-path-x]\' : \'[data-path-z]\').value) || 0, -600, 600)', 'Number($(a === \'path-x\' ? \'[data-path-x]\' : \'[data-path-z]\').value) || 0, -8000, 8000)');
    source = source.replace('min="-10000" max="10000" step="10" data-alt-offset', 'min="-100000" max="100000" step="10" data-alt-offset');
    source = source.replace("Number($('[data-alt-offset]').value) || 0, -10000, 10000)", "Number($('[data-alt-offset]').value) || 0, -100000, 100000)");
    if (!source.includes("Number($('[data-alt-offset]').value) || 0, -100000, 100000)")) throw new Error('高度オフセットの実処理上限を拡張できません。');
    source = source.replace("else if(a==='fit-field'){editor.mapView={cx:0,cz:0,zoom:0.105};editor.draw();}", "else if(a==='fit-field'){editor.fitFieldView();}else if(a==='field-size'){applyFieldSize();}");

    const insertAnchor = '  function applyPreset() {';
    if (!source.includes(insertAnchor)) throw new Error('拡張UIの敷地範囲処理挿入位置が見つかりません。');
    const fieldFunction = String.raw`  function applyFieldSize() {
    const input = $('[data-field-size]');
    const wanted = Number(input && input.value);
    if (!Number.isFinite(wanted) || wanted < 140 || wanted > 16000) { status('敷地サイズは140〜16,000mで指定してください。', true); return; }
    const result = api.trackModule && typeof api.trackModule.setCoasterFieldSize === 'function' ? api.trackModule.setCoasterFieldSize(wanted) : null;
    if (!result) throw new Error('現行 track.js に敷地範囲APIがありません。');
    const pts = editor.design && Array.isArray(editor.design.pts) ? editor.design.pts : [];
    const outside = pts.some(p => p[0] < result.x0 || p[0] > result.x1 || p[1] < result.z0 || p[1] > result.z1);
    if (input) input.value = String(result.width);
    // 範囲変更では既存コースの座標を削除・縮小しない。
    if (outside && typeof editor.fitMapView === 'function') editor.fitMapView(); else editor.fitFieldView();
    status('敷地を ' + result.width.toLocaleString() + 'm × ' + result.height.toLocaleString() + 'm に変更しました。既存コースは変更していません。' + (outside ? ' 現在のコースの一部は敷地外に残っています。' : ''));
  }
`;
    source = source.replace(insertAnchor, fieldFunction + insertAnchor);
    const initAnchor = '  const statusEl = $(\'[data-status]\');';
    if (source.includes(initAnchor)) source = source.replace(initAnchor, initAnchor + "\n  const initialFieldSize = api.trackModule && api.trackModule.getCoasterFieldSize ? api.trackModule.getCoasterFieldSize() : 140;\n  if ($('[data-field-size]')) $('[data-field-size]').value = String(initialFieldSize);");
    if (!source.includes("else if(a==='field-size'){applyFieldSize();}")) throw new Error('敷地範囲ボタンのイベント接続に失敗しました。');
    if (!source.includes('敷地は標準140×96m')) throw new Error('拡張UIの敷地サイズ説明を更新できません。');

    // The renderer must not present an artificial fixed maximum.
    const statsOld = "$('[data-track-stats]').textContent = `走行ルート 約${Math.round(full).toLocaleString()}m（手描き ${Math.round(l).toLocaleString()}m）／ 使用幅 ${Math.round(w)} × ${Math.round(h)}m ／ 上限 ${MAX_LEN.toLocaleString()}m`;";
    const statsNew = "$('[data-track-stats]').textContent = `走行ルート 約${Math.round(full).toLocaleString()}m（手描き ${Math.round(l).toLocaleString()}m）／ 使用幅 ${Math.round(w)} × ${Math.round(h)}m`;";
    if (!source.includes(statsOld)) throw new Error('コース長表示を更新できません。');
    source = source.replace(statsOld, statsNew);

    // Replace hard 8,192-point checks/decimators with a larger, explicit memory-safety ceiling.
    source = source.replaceAll('8192', '20000');
    // Imported projects remain valid after shrinking the active field; world coordinate limit is fixed by the codec.
    source = source.replaceAll('p[0]<FIELD.x0||p[0]>FIELD.x1||p[1]<FIELD.z0||p[1]>FIELD.z1', 'Math.abs(p[0])>8000||Math.abs(p[1])>8000');
    source = source.replaceAll('p[0] < FIELD.x0 || p[0] > FIELD.x1 || p[1] < FIELD.z0 || p[1] > FIELD.z1', 'Math.abs(p[0]) > 8000 || Math.abs(p[1]) > 8000');
    // 範囲を縮小しても、既存の大きなコースを編集操作で標準敷地に押し込まない。
    source = source.replace('const dx = clamp(wantX, FIELD.x0 + 4 - minX, FIELD.x1 - 4 - maxX);', 'const dx = clamp(wantX, -8000 - minX, 8000 - maxX);');
    source = source.replace('const dz = clamp(wantZ, FIELD.z0 + 4 - minZ, FIELD.z1 - 4 - maxZ);', 'const dz = clamp(wantZ, -8000 - minZ, 8000 - maxZ);');
    source = source.replace('const next = transformed.map(([x, z]) => [clamp(x + dx, FIELD.x0 + 2, FIELD.x1 - 2), clamp(z + dz, FIELD.z0 + 2, FIELD.z1 - 2)]);', 'const next = transformed.map(([x, z]) => [clamp(x + dx, -8000, 8000), clamp(z + dz, -8000, 8000)]);');
    // Keep long transformations; MAX_LEN is now only a practically unreachable safety sentinel.
    source = source.replace('if (polyLen(next) > MAX_LEN + 1) throw new Error(`変形後のコース長が${MAX_LEN.toLocaleString()}mを超えます`);', 'if (next.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 8000 || Math.abs(p[1]) > 8000)) throw new Error(\'コースが拡張座標範囲（±8,000m）を超えています\');');

    // Bound the expansion tool's Douglas-Peucker work to 384-point chunks.
    const simplifyRe = /  function simplifyPath\(points, tolerance\) \{[\s\S]*?\n  \}\n  function report\(text\)/;
    if (!simplifyRe.test(source)) throw new Error('拡張の簡略化処理を特定できません。');
    const fastPathSimplify = `  function simplifyPath(points, tolerance) {
    if (points.length < 3) return points.map(p => p.slice());
    const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
    const chunk = 384;
    for (let base = 0; base < points.length - 1; base += chunk) {
      const end = Math.min(points.length - 1, base + chunk), stack = [[base, end]]; keep[base] = 1; keep[end] = 1;
      while (stack.length) {
        const [a, b] = stack.pop(); if (b <= a + 1) continue;
        const p0 = points[a], p1 = points[b], dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz) || 1;
        let best = -1, bestDist = tolerance;
        for (let i = a + 1; i < b; i++) { const p = points[i]; const dist = Math.abs(dx * (p0[1] - p[1]) - (p0[0] - p[0]) * dz) / len; if (dist > bestDist) { bestDist = dist; best = i; } }
        if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
      }
    }
    return points.filter((_, i) => keep[i]).map(p => p.slice());
  }
  function report(text)`;
    source = source.replace(simplifyRe, fastPathSimplify);
    return source;
  }

  function patchSimSource(source) {
    const riderScale = '(Number(window.__coasterPhysicsTuning && window.__coasterPhysicsTuning.riderStrength) || 1)';
    const faintPatterns = [
      { pattern: /if\s*\(\s*car\.gUf\s*>\s*\(\s*sup\s*\?\s*([\d.]+)\s*:\s*([\d.]+)\s*\)\s*\)\s*r\.faintT\s*\+=\s*dt\s*;/, replace: match => 'if (car.gUf > (sup ? ' + match[1] + ' : ' + match[2] + ') * ' + riderScale + ') r.faintT += dt;' },
      { pattern: /if\s*\(\s*car\.gUf\s*>\s*([\d.]+)\s*\)\s*r\.faintT\s*\+=\s*dt\s*;/, replace: match => 'if (car.gUf > ' + match[1] + ' * ' + riderScale + ') r.faintT += dt;' }
    ];
    let faintAdjusted = false;
    for (const variant of faintPatterns) { const match = source.match(variant.pattern); if (match) { source = source.replace(variant.pattern, variant.replace(match)); faintAdjusted = true; break; } }
    if (!faintAdjusted) throw new Error('現行 sim.js の乗客の気絶しきい値を確認できません。');
    if (!/up\s*>\s*b\.v\s*\*\s*r\.j/.test(source) || !/side\s*>\s*b\.l\s*\*\s*r\.j/.test(source)) throw new Error('現行 sim.js の乗客耐力判定が想定と異なります。');
    if (!/this\.mat\s*=\s*MATS\s*\[\s*design\.mat\s*\]/.test(source)) throw new Error('現行 sim.js のレール素材参照が想定と異なります。');
    if (!source.includes('const MAX_T = 160;')) throw new Error('160秒制限の定義を特定できません。');
    source = source.replace('const MAX_T = 160;', 'const MAX_T = 86400; // 実走行の安全監視は24時間。160秒で終了させない。\nconst AUTO_TEST_MAX_T = 160; // エディター内の自動試算だけは計算量を制限。');
    source = source.replace('runToEnd(maxT = MAX_T + 20)', 'runToEnd(maxT = AUTO_TEST_MAX_T + 20)');
    source = source.replaceAll('sim.t < MAX_T + 20', 'sim.t < AUTO_TEST_MAX_T + 20');
    const boostBrake = '    if ((fl & F.BOOST) && this.v < BOOST_V && this.v > 0) a += BOOST_A;\n    if ((fl & F.BRAKE) && this.v > BRAKE_V) a -= BRAKE_A;';
    const adjustable = `    const tuning = typeof window !== 'undefined' ? (window.__coasterPhysicsTuning || {}) : {};
    const boostRaw = Number(tuning.boostStrength), brakeRaw = Number(tuning.brakeStrength);
    const boostScale = Number.isFinite(boostRaw) ? Math.max(0, Math.min(5, boostRaw)) : 1;
    const brakeScale = Number.isFinite(brakeRaw) ? Math.max(0, Math.min(5, brakeRaw)) : 1;
    if ((fl & F.BOOST) && this.v < BOOST_V * boostScale && this.v > 0) a += BOOST_A * boostScale;
    if ((fl & F.BRAKE) && this.v > BRAKE_V) a -= BRAKE_A * brakeScale;`;
    if (!source.includes(boostBrake)) throw new Error('ブースター／ブレーキの物理処理を特定できません。');
    source = source.replace(boostBrake, adjustable);
    return source;
  }

  function patchWaterMain(source) {
    const ctor = /const\s+water\s*=\s*new\s+Particles\(\s*(\d+)\s*,\s*([\d.]+)\s*,\s*true\s*\)\s*;/;
    const cm = source.match(ctor);
    if (!cm) throw new Error('現行 main.js の水パーティクル初期化が見つかりません。');
    const baseCapacity = Number(cm[1]), particleScale = Number(cm[2]);
    const waterInit = 'const ceWaterAmount = () => { const n = Number(window.__coasterPhysicsTuning && window.__coasterPhysicsTuning.waterAmount); return Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 1; };\nconst water = new Particles(' + baseCapacity + ', ' + particleScale + ', true);';
    source = source.replace(ctor, waterInit);
    const replacements = [
      [/Math\.round\(380\s*\*\s*k\s*\+\s*140\)/, 'Math.round((380 * k + 140) * ceWaterAmount())', '大きな水しぶき'],
      [/frontSplash\(f,\s*v,\s*160\)/, 'frontSplash(f, v, Math.round(160 * ceWaterAmount()))', '前方の水しぶき'],
      [/frontSplash\(lf,\s*sv,\s*Math\.round\(3\s*\+\s*6\s*\*\s*k\)\)/, 'frontSplash(lf, sv, Math.round((3 + 6 * k) * ceWaterAmount()))', '連続する水しぶき'],
      [/Math\.round\(5\s*\+\s*14\s*\*\s*k\)/, 'Math.round((5 + 14 * k) * ceWaterAmount())', '水の翼'],
      [/addDrops\(45,\s*1\.2\)/, 'addDrops(Math.round(45 * ceWaterAmount()), 1.2)', '視点の水滴'],
      [/Math\.random\(\)\s*>\s*dt\s*\*\s*14/, 'Math.random() > dt * 14 * ceWaterAmount()', '水のカーテン'],
      [/water\.burst\((f\.x\s*\+\s*f\.tx\s*\*\s*4\s*,\s*2\s*,\s*f\.z\s*\+\s*f\.tz\s*\*\s*4\s*,\s*)30(\s*,)/, 'water.burst($1Math.round(30 * ceWaterAmount())$2', '水しぶきの霧']
    ];
    for (const [pattern, replacement, label] of replacements) { if (!pattern.test(source)) throw new Error('現行 main.js の「' + label + '」処理が見つかりません。'); source = source.replace(pattern, replacement); }
    return source;
  }

export { patchTrackPhysics, patchCodecV14, patchEditorView, patchWorld, patchExpansionSource, patchSimSource, patchWaterMain };
