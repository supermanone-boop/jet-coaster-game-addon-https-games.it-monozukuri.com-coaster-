/*
 * Coaster Expansion Standalone v13.0
 * One-file launcher for the current coaster game.
 * Keeps the existing expansion modules (architecture / city flight / expansion)
 * and loads current game modules from /coaster/js instead of the old fork.
 */
(async () => {
  'use strict';
  const ROOT = 'https://raw.githubusercontent.com/supermanone-boop/jet-coaster-game-addon-https-games.it-monozukuri.com-coaster-/refs/heads/main/';
  const EXT_NAMES = ['coaster_expansion.js', 'coaster_architecture.js', 'coaster_city_flight.js'];
  const GAME_BASE = new URL('js/', location.href).href;
  const KEY = '__coasterExpansionStandaloneV13';
  const madeBlobs = [];
  let savedRAF = null;
  let savedBody = null;
  let bodyWasSwapped = false;
  let suppressedGameFrame = null;

  function status(message, error = false) {
    let box = document.getElementById('coaster-expansion-standalone-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'coaster-expansion-standalone-status';
      box.style.cssText = 'position:fixed;z-index:2147483647;top:10px;left:10px;right:10px;padding:12px 14px;border-radius:9px;background:#172235;color:#fff;font:14px/1.5 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 3px 18px #0006';
      (document.body || document.documentElement).appendChild(box);
    }
    box.style.background = error ? '#852b2b' : '#172235';
    box.textContent = message;
  }
  const makeBlob = source => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript;charset=utf-8' }));
    madeBlobs.push(url);
    return url;
  };
  const fail = error => {
    console.error('[Coaster Expansion Standalone v13]', error);
    status('起動エラー：' + (error?.message || error) + '\nページを再読み込みすると元のゲームに戻ります。', true);
  };
  function replaceOnce(source, before, after, label) {
    const at = source.indexOf(before);
    if (at < 0) throw new Error(label + ' の位置が見つかりません。現行ゲームの構造が変わっています。');
    if (source.indexOf(before, at + before.length) >= 0) throw new Error(label + ' が複数あります。安全のため中止しました。');
    return source.slice(0, at) + after + source.slice(at + before.length);
  }
  function findArrayEnd(source, open) {
    let depth = 0, quote = '', escape = false, lineComment = false, blockComment = false;
    for (let i = open; i < source.length; i++) {
      const c = source[i], n = source[i + 1];
      if (lineComment) { if (c === '\n') lineComment = false; continue; }
      if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++; } continue; }
      if (quote) {
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === quote) quote = '';
        continue;
      }
      if (c === '/' && n === '/') { lineComment = true; i++; continue; }
      if (c === '/' && n === '*') { blockComment = true; i++; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '[') depth++;
      else if (c === ']' && --depth === 0) return i;
    }
    return -1;
  }
  function appendArray(source, exportName, rows) {
    const re = new RegExp('export\\s+const\\s+' + exportName + '\\s*=\\s*\\[');
    const match = re.exec(source);
    if (!match) throw new Error('track.js の ' + exportName + ' 配列が見つかりません。');
    const open = source.indexOf('[', match.index);
    const close = findArrayEnd(source, open);
    if (close < 0) throw new Error(exportName + ' 配列の終端を解析できません。');
    const existing = source.slice(open + 1, close);
    if (existing.includes('platinum-diamond') || existing.includes("id: 'rope'") || existing.includes('id: "rope"')) {
      throw new Error(exportName + ' に追加素材が既に存在します。二重追加を防いで停止しました。');
    }
    const trimmed = existing.trimEnd();
    const comma = trimmed && !trimmed.endsWith(',') ? ',' : '';
    return source.slice(0, close) + comma + '\n' + rows + '\n' + source.slice(close);
  }
  function patchTrack(source) {
    const materials = [
      "  { id: 'platinum-diamond', name: '白金ダイヤモンド', v: 14, l: 9, cascade: 1, cost: 120 }"
    ];
    for (let level = 1; level <= 10; level++) {
      const multiplier = (level + 1) ** 2;
      materials.push(`  { id: 'platinum-diamond-${level}', name: '白金ダイヤモンド＋${level}', v: ${14 * multiplier}, l: ${9 * multiplier}, cascade: 1, cost: ${120 * multiplier} }`);
    }
    source = appendArray(source, 'MATS', materials.join(',\n'));
    source = appendArray(source, 'BARS', "  { id: 'rope', name: 'ロープ拘束', v: 5.2, l: 6.3, hold: 0.98, cost: 130 }");
    return source;
  }
  function patchCodec(source) {
    const versionMatch = source.match(/\bconst\s+VER\s*=\s*(\d+)\s*;/);
    if (!versionMatch) throw new Error('codec.js の保存形式バージョンが見つかりません。');
    const oldVersion = Number(versionMatch[1]);
    const newVersion = Math.max(4, oldVersion + 1);
    source = source.replace(versionMatch[0], `const VER = ${newVersion};`);

    const encodePattern = /(\[\s*VER\s*,\s*)\(?\s*d\.mat\s*&\s*3\s*\)?\s*\|\s*\(\s*\(\s*d\.bar\s*&\s*3\s*\)\s*<<\s*2\s*\)\s*\|\s*\(\s*\(\s*d\.start\s*&\s*3\s*\)\s*<<\s*4\s*\)(\s*,\s*d\.cars\s*&\s*7\s*\])/;
    if (!encodePattern.test(source)) throw new Error('codec.js の共有コード書き込み形式が想定と異なります。');
    source = source.replace(encodePattern, '$1(d.mat & 15) | ((d.bar & 3) << 4) | ((d.start & 3) << 6)$2');

    const decodePattern = /((?:const|let)\s+d\s*=\s*\{\s*)mat\s*:\s*f\s*&\s*3\s*,\s*bar\s*:\s*\(\s*f\s*>>\s*2\s*\)\s*&\s*3\s*,\s*start\s*:\s*\(\s*f\s*>>\s*4\s*\)\s*&\s*3\s*,\s*cars\s*:\s*rd\(\)\s*,\s*gm\s*:\s*\[\s*\]\s*,\s*hs\s*:\s*\[\s*\]\s*,\s*pts\s*:\s*\[\s*\]\s*\};/;
    if (!decodePattern.test(source)) throw new Error('codec.js の共有コード読み込み形式が想定と異なります。');
    source = source.replace(decodePattern, `$1mat: version >= ${newVersion} ? (f & 15) : (f & 3), bar: version >= ${newVersion} ? ((f >> 4) & 3) : ((f >> 2) & 3), start: version >= ${newVersion} ? ((f >> 6) & 3) : ((f >> 4) & 3), cars: rd(), gm: [], hs: [], pts: [] };`);

    // codec のバージョン変数は version / ver / v のいずれの表記にも対応する。
    // ネストした includes(...) も扱えるよう、if 条件の括弧を走査して固定リスト検査を更新する。
    let guardUpdated = false;
    let scanAt = 0;
    while (scanAt < source.length) {
      const ifRegex = /\bif\s*\(/g;
      ifRegex.lastIndex = scanAt;
      const found = ifRegex.exec(source);
      if (!found) break;
      const open = source.indexOf('(', found.index);
      let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false, close = -1;
      for (let i = open; i < source.length; i++) {
        const c = source[i], n = source[i + 1];
        if (lineComment) { if (c === '\n') lineComment = false; continue; }
        if (blockComment) { if (c === '*' && n === '/') { blockComment = false; i++; } continue; }
        if (quote) {
          if (escaped) { escaped = false; continue; }
          if (c === '\\') { escaped = true; continue; }
          if (c === quote) quote = '';
          continue;
        }
        if (c === '/' && n === '/') { lineComment = true; i++; continue; }
        if (c === '/' && n === '*') { blockComment = true; i++; continue; }
        if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) { close = i; break; }
      }
      if (close < 0) throw new Error('codec.js の if 条件を解析できません。');
      const condition = source.slice(open + 1, close);
      const after = source.slice(close + 1);
      const returnNull = after.match(/^(\s*)return\s+null\s*;/);
      if (returnNull) {
        let variable = (condition.match(/\b(version|ver|v)\b/) || [])[1];
        if (!variable) {
          const includesArg = condition.match(/\.(?:includes|has)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/);
          if (includesArg) variable = includesArg[1];
        }
        const isVersionGuard = variable && (
          /\bVER\b/.test(condition) ||
          /(?:!==?|===?)\s*\d+/.test(condition) ||
          /\[[^\]]*\d[^\]]*\]\s*\.\s*(?:includes|has)\s*\(/.test(condition)
        );
        if (isVersionGuard) {
          const replacement = `if (${variable} < 1 || ${variable} > VER) return null;`;
          const begin = found.index;
          const finish = close + 1 + returnNull[0].length;
          source = source.slice(0, begin) + replacement + source.slice(finish);
          guardUpdated = true;
          scanAt = begin + replacement.length;
          break;
        }
      }
      scanAt = close + 1;
    }
    if (!guardUpdated) {
      const hasRangeGuard = /\b(?:version|ver|v)\s*<\s*1/.test(source) && /\b(?:version|ver|v)\s*>\s*VER/.test(source);
      const hasSwitchGuard = /switch\s*\(\s*(?:version|ver|v)\s*\)/.test(source) && /case\s+VER\s*:/.test(source);
      if (!hasRangeGuard && !hasSwitchGuard) throw new Error('codec.js のバージョン検査を安全に特定できません。');
    }
    return source;
  }
  function checkEditor(source) {
    if (!/\bMATS\.map\s*\(/.test(source)) throw new Error('editor.js の素材一覧が MATS 配列連動ではありません。');
    if (!/\bBARS\.map\s*\(/.test(source)) throw new Error('editor.js の拘束具一覧が BARS 配列連動ではありません。');
    return source;
  }
  const importRE = /\bfrom\s*(['"])([^'"]+)\1|\bimport\s*(?:\(\s*)?(['"])([^'"]+)\3/g;
  function getImports(source) {
    const list = [];
    let match;
    importRE.lastIndex = 0;
    while ((match = importRE.exec(source))) list.push(match[2] || match[4]);
    return list;
  }
  function rewriteImports(source, originalUrl, blobMap) {
    return source.replace(/(\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])([^'"]+)\2/g, (all, prefix, quote, specifier) => {
      let resolved;
      try { resolved = new URL(specifier, originalUrl).href; } catch { return all; }
      return prefix + quote + (blobMap.get(resolved) || resolved) + quote;
    });
  }

  try {
    if (!location.hostname.endsWith('it-monozukuri.com') || !location.pathname.startsWith('/coaster/')) {
      throw new Error('「ジェットコースターを作ろう！」の /coaster/ ページで実行してください。');
    }
    if (window[KEY]) throw new Error('v13.0 は既に起動しています。再読み込みしてください。');
    status('現行ゲームの本体JSを取得しています…');

    const gameMainUrl = new URL('main.js', GAME_BASE).href;
    const extensionUrls = Object.fromEntries(EXT_NAMES.map(name => [name, ROOT + name]));
    const sources = new Map();

    async function fetchSource(url, label) {
      if (sources.has(url)) return sources.get(url);
      const response = await fetch(url, { cache: 'no-store', credentials: url.startsWith(location.origin) ? 'same-origin' : 'omit' });
      if (!response.ok) throw new Error(label + ' の取得に失敗しました（HTTP ' + response.status + '）。');
      const source = await response.text();
      sources.set(url, source);
      return source;
    }

    const mainSource = await fetchSource(gameMainUrl, '現行 main.js');
    const version = mainSource.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (!version) throw new Error('現行 main.js のバージョンを確認できません。');
    if (!mainSource.includes("import { watchUpdate } from '../../common/update-check.js';")) {
      throw new Error('現行 main.js の import 構造が想定と異なります。');
    }

    status('旧拡張の都市・建築・フライト機能を読み込んでいます…');
    await Promise.all(EXT_NAMES.map(name => fetchSource(extensionUrls[name], name)));

    // 旧版のゲーム本体を使わず、既存の拡張3モジュールだけを現行本体へ接続する。
    const archUrl = extensionUrls['coaster_architecture.js'];
    const flightUrl = extensionUrls['coaster_city_flight.js'];
    const expansionUrl = extensionUrls['coaster_expansion.js'];

    const patchTargets = new Map();
    for (const name of ['track.js', 'codec.js', 'editor.js']) {
      const url = new URL(name, GAME_BASE).href;
      await fetchSource(url, name);
      let source = sources.get(url);
      if (name === 'track.js') source = patchTrack(source);
      if (name === 'codec.js') source = patchCodec(source);
      if (name === 'editor.js') source = checkEditor(source);
      patchTargets.set(url, source);
    }

    // main.js に旧拡張の初期化口を追加。既存のゲーム処理は削除・置換しない。
    let patchedMain = mainSource;
    const importAnchor = "const QS = new URLSearchParams(location.search);";
    patchedMain = replaceOnce(patchedMain, importAnchor,
      `import * as COASTER_TRACK from './track.js';\n${importAnchor}`,
      '拡張用 track.js import');

    // 旧拡張で使っていた自由カメラを現行 main.js にも残す。
    patchedMain = replaceOnce(patchedMain,
      "const CAM_MODES = ['auto', 'chase', 'pov'];",
      "const CAM_MODES = ['auto', 'chase', 'pov', 'free'];",
      '自由カメラモード');
    patchedMain = replaceOnce(patchedMain,
      "const CAM_NAMES = { auto: '中継', chase: '追いかけ', pov: '先頭車' };",
      "const CAM_NAMES = { auto: '中継', chase: '追いかけ', pov: '先頭車', free: '自由カメラ' };\n" + String.raw`const freeCamState = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 40, move: { forward:false, back:false, left:false, right:false, up:false, down:false }, drag:null };
const freeCamPanel = document.createElement('section');
freeCamPanel.id = 'rc-free-camera';
freeCamPanel.hidden = true;
freeCamPanel.style.cssText = 'position:fixed;z-index:2147483642;right:10px;bottom:12px;width:min(260px,calc(100vw - 20px));box-sizing:border-box;padding:10px;border:1px solid #64748b;border-radius:11px;background:rgba(15,23,42,.95);color:#fff;box-shadow:0 4px 20px #0007;font:12px/1.4 system-ui,sans-serif';
freeCamPanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px"><b>自由カメラ</b><button type="button" data-fc-action="auto">自動へ戻る</button></div><div data-fc-look style="padding:12px 6px;margin-bottom:7px;border-radius:7px;background:#26364d;text-align:center;touch-action:none;user-select:none">ここをドラッグして見回す</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px"><button data-fc-move="forward">前進 ↑</button><button data-fc-move="up">上昇 ＋</button><button data-fc-move="back">後退 ↓</button><button data-fc-move="left">左 ←</button><button data-fc-action="reset">車両付近へ</button><button data-fc-move="right">右 →</button><span></span><button data-fc-move="down">下降 −</button><span></span></div><label style="display:block;margin-top:8px">移動速度 <input data-fc-speed type="range" min="1" max="250" value="40" style="width:100%"><output data-fc-speed-label>40 m/s</output></label><style>#rc-free-camera button{min-height:30px;padding:5px 7px;border:1px solid #94a3b8;border-radius:6px;background:#f8fafc;color:#172033;font:700 11px system-ui}#rc-free-camera[hidden]{display:none!important}</style>';
document.body.appendChild(freeCamPanel);
function clearFreeCamMoves(){ for (const k of Object.keys(freeCamState.move)) freeCamState.move[k]=false; }
function activateFreeCamera(){ const d=cam.look.clone().sub(cam.pos).normalize(); if(d.lengthSq()<0.0001)d.set(1,0,0); freeCamState.pos.copy(cam.pos); freeCamState.yaw=Math.atan2(d.z,d.x); freeCamState.pitch=Math.asin(clamp(d.y,-0.98,0.98)); clearFreeCamMoves(); freeCamPanel.hidden=mode!=='ride'; }
function updateFreeCamera(dt){ const step=Math.min(0.1,Math.max(0,dt))*freeCamState.speed; const y=freeCamState.yaw,p=freeCamState.pitch; const f=new THREE.Vector3(Math.cos(y)*Math.cos(p),Math.sin(p),Math.sin(y)*Math.cos(p)); const r=new THREE.Vector3(-Math.sin(y),0,Math.cos(y)); const m=freeCamState.move; freeCamState.pos.addScaledVector(f,(Number(m.forward)-Number(m.back))*step).addScaledVector(r,(Number(m.right)-Number(m.left))*step); freeCamState.pos.y+=(Number(m.up)-Number(m.down))*step; cam.pos.copy(freeCamState.pos); cam.look.copy(freeCamState.pos).add(f); camera.position.copy(cam.pos); camera.up.set(0,1,0); camera.lookAt(cam.look); }
freeCamPanel.querySelectorAll('[data-fc-move]').forEach(b=>{const k=b.dataset.fcMove;b.addEventListener('pointerdown',e=>{e.preventDefault();freeCamState.move[k]=true;try{b.setPointerCapture(e.pointerId)}catch(_){}});['pointerup','pointercancel','lostpointercapture'].forEach(t=>b.addEventListener(t,()=>freeCamState.move[k]=false));});
document.addEventListener('pointerup',clearFreeCamMoves);
const fcLook=freeCamPanel.querySelector('[data-fc-look]');
fcLook.addEventListener('pointerdown',e=>{e.preventDefault();freeCamState.drag={id:e.pointerId,x:e.clientX,y:e.clientY};try{fcLook.setPointerCapture(e.pointerId)}catch(_){}});
fcLook.addEventListener('pointermove',e=>{const d=freeCamState.drag;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;freeCamState.yaw-=dx*.006;freeCamState.pitch=Math.max(-1.48,Math.min(1.48,freeCamState.pitch-dy*.006));});
['pointerup','pointercancel','lostpointercapture'].forEach(t=>fcLook.addEventListener(t,()=>freeCamState.drag=null));
freeCamPanel.querySelector('[data-fc-speed]').addEventListener('input',e=>{freeCamState.speed=Number(e.target.value);freeCamPanel.querySelector('[data-fc-speed-label]').textContent=freeCamState.speed+' m/s';});
freeCamPanel.querySelector('[data-fc-action="auto"]').addEventListener('click',()=>{cam.mode='auto';cam.shotT=0;freeCamPanel.hidden=true;clearFreeCamMoves();ui.camBtn.textContent='🎥 '+CAM_NAMES.auto;});
freeCamPanel.querySelector('[data-fc-action="reset"]').addEventListener('click',()=>{const f=co&&co.sim&&co.sim.cars[0]&&co.sim.cars[0].f;if(!f)return;freeCamState.pos.set(f.x-f.tx*24+f.rx*10,f.y+12,f.z-f.tz*24+f.rz*10);const d=new THREE.Vector3(f.x-freeCamState.pos.x,f.y+2-freeCamState.pos.y,f.z-freeCamState.pos.z).normalize();freeCamState.yaw=Math.atan2(d.z,d.x);freeCamState.pitch=Math.asin(Math.max(-.98,Math.min(.98,d.y)));});` ,
      '自由カメラUI・操作');
    patchedMain = replaceOnce(patchedMain,
      '  let mode = cam.mode;\n',
      "  let mode = cam.mode;\n  if (mode === 'free') { updateFreeCamera(dt); return; }\n",
      '自由カメラ描画');
    patchedMain = patchedMain.replace("  ui.favs.hidden = m !== 'favs';\n", "  ui.favs.hidden = m !== 'favs';\n  freeCamPanel.hidden = !(m === 'ride' && cam.mode === 'free');\n  if (m !== 'ride') clearFreeCamMoves();\n");
    patchedMain = replaceOnce(patchedMain,
      "  cam.mode = CAM_MODES[(CAM_MODES.indexOf(cam.mode) + 1) % CAM_MODES.length];\n",
      "  cam.mode = CAM_MODES[(CAM_MODES.indexOf(cam.mode) + 1) % CAM_MODES.length];\n  if (cam.mode === 'free') activateFreeCamera(); else { freeCamPanel.hidden = true; clearFreeCamMoves(); }\n",
      'カメラボタン操作');

    const titleCleanup = `function toTitle() {\n  sound.roll(0);`;
    if (patchedMain.includes(titleCleanup)) {
      patchedMain = patchedMain.replace(titleCleanup, `function toTitle() {\n  sound.roll(0);\n  window.__coasterPendingStartMode = 'choose';\n  if (typeof window.__coasterClearStartModeWorld === 'function') window.__coasterClearStartModeWorld();`);
    }

    const tickAnchor = 'function tick(dt, render = true) {';
    patchedMain = replaceOnce(patchedMain, tickAnchor,
      `let extensionFrameHook = null;\nfunction tick(dt, render = true) {\n  if (extensionFrameHook) {\n    try { extensionFrameHook(dt); }\n    catch (error) { console.error('[Coaster Expansion frame hook]', error); extensionFrameHook = null; }\n    if (extensionFrameHook) { if (render) renderer.render(scene3d, camera); return; }\n  }`,
      'フレーム拡張フック');

    // 3つの開始モードを拡張側が提供する場合、タイトルの開始ボタンをその選択UIへ渡す。
    const startButtonBlock = `document.getElementById('btn-start').addEventListener('click', () => {\n  sound.sfx('tap');\n  favId = null;\n  editor.setIncidents([]);\n  openEditor(newDesign(), 1);\n});`;
    if (patchedMain.includes(startButtonBlock)) {
      patchedMain = patchedMain.replace(startButtonBlock, `window.__coasterPendingStartMode = 'choose';\ndocument.getElementById('btn-start').addEventListener('click', () => {\n  sound.sfx('tap');\n  const selected = window.__coasterPendingStartMode || 'choose';\n  window.__coasterPendingStartMode = 'choose';\n  if (selected === 'choose' && typeof window.__coasterShowStartModePicker === 'function') { window.__coasterShowStartModePicker(); return; }\n  favId = null;\n  editor.setIncidents([]);\n  const d = typeof window.__coasterCreateStartDesign === 'function' ? window.__coasterCreateStartDesign(selected) : null;\n  openEditor(d || newDesign(), 1);\n  if (typeof window.__coasterAfterStartMode === 'function') window.__coasterAfterStartMode(selected);\n});`);
    }

    // フォントの相対URLはBlob URLではなく、元の /coaster/js/ を基準にする。
    patchedMain = patchedMain.replace(/new URL\(f, import\.meta\.url\)/g, `new URL(f, ${JSON.stringify(gameMainUrl)})`);
    const bootMarker = '  requestAnimationFrame(frame);\n}\nboot();';
    patchedMain = replaceOnce(patchedMain, bootMarker,
      '  requestAnimationFrame(frame);\n  window.__coasterExpansionBooted = true;\n}\nwindow.__coasterExpansionFrame = frame;\nboot();',
      'ゲーム起動マーカー');

    // 拡張ランタイムは main.js 内の非公開変数へアクセスできる同じモジュールスコープで初期化する。
    const runtimeBridge = `\nconst CE_MAX_LEN = Number.isFinite(COASTER_TRACK.MAX_LEN) ? COASTER_TRACK.MAX_LEN : 5000;\nconst CE_POLY_LEN = typeof COASTER_TRACK.polyLen === 'function' ? COASTER_TRACK.polyLen : (pts) => { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]); return d; };\nconst coasterExpansionRuntime = {\n  get editor() { return editor; }, get co() { return co; }, get scene3d() { return scene3d; }, get camera() { return camera; }, get renderer() { return renderer; }, get THREE() { return THREE; }, get mode() { return mode; }, get sim() { return co ? co.sim : null; }, get cameraMode() { return cam.mode; }, get paused() { return !!player.paused; }, get playbackSpeed() { return speed; },\n  setFrameHook(fn) { if (fn != null && typeof fn !== 'function') throw new TypeError('frame hook must be a function or null'); extensionFrameHook = fn || null; return !!extensionFrameHook; },\n  clearFrameHook() { extensionFrameHook = null; },\n  setCameraMode(name) { if (!CAM_MODES.includes(name)) throw new Error('unsupported camera mode: ' + name); cam.mode = name; if (name === 'free') activateFreeCamera(); else { freeCamPanel.hidden = true; clearFreeCamMoves(); } ui.camBtn.textContent = '🎥 ' + CAM_NAMES[name]; cam.shotT = 0; return cam.mode; },\n  setPlaybackSpeed(value) { const v = Number(value); if (!SPEEDS.includes(v)) throw new Error('unsupported playback speed'); setSpeed(v); return speed; },\n  setPaused(value) { if (mode !== 'ride') return false; if (co && co.sim.mode === 'done' && !value) player.pending = 0; player.paused = !!value; refreshPlay(); return player.paused; },\n  togglePlayback() { if (mode !== 'ride') return false; togglePlay(); return player.paused; },\n  normalize, buildTrack, prepare, Sim,\n  createTrackExportGroup(design = editor.design) { if (!design || !Array.isArray(design.pts) || design.pts.length < 2) throw new Error('no track to export'); const tr = prepare(design, buildTrack); const look = cleanLook(design.look); const built = buildTrackMeshes(tr, look.rail, false, look.tunnel); built.group.name = 'EditedCoasterTrack'; return { group: built.group, track: tr }; }\n};\nwindow.__coasterExpansionRuntime = coasterExpansionRuntime;\nwindow.__coasterExpansionInit = (async () => {\n  const extension = await import(${JSON.stringify('__COASTER_EXPANSION_BLOB__')});\n  const exportedFunctions = Object.values(extension).filter(value => typeof value === 'function');
  const discoveredInstaller = Object.entries(extension).find(([name, value]) => typeof value === 'function' && /install|init|setup|mount|activate|boot|start/i.test(name));
  const defaultObject = extension.default && typeof extension.default === 'object' ? extension.default : null;
  const candidate = extension.installCoasterExpansion || extension.initCoasterExpansion || extension.installExpansion || extension.install || extension.init || extension.default || (defaultObject && (defaultObject.install || defaultObject.init)) || (discoveredInstaller && discoveredInstaller[1]) || (exportedFunctions.length === 1 ? exportedFunctions[0] : null);\n  if (typeof candidate === 'function') {\n    await candidate(coasterExpansionRuntime, { FIELD, MAX_LEN: CE_MAX_LEN, randomStroke, polyLen: CE_POLY_LEN, autoHeights, H_SAMPLES, STARTS });\n  } else if (candidate && typeof candidate.install === 'function') {\n    await candidate.install(coasterExpansionRuntime, { FIELD, MAX_LEN: CE_MAX_LEN, randomStroke, polyLen: CE_POLY_LEN, autoHeights, H_SAMPLES, STARTS });\n  } else if (!window.__coasterExpansionInstalled && !document.getElementById('rc-course-mode-buttons')) {\n    throw new Error('拡張モジュールに初期化関数が見つかりません。export: ' + Object.keys(extension).join(', '));\n  }\n  window.__coasterExpansionInstalled = true;\n})();\nawait window.__coasterExpansionInit;\nif (typeof window.__coasterShowStartModePicker !== 'function') {\n  window.__coasterShowStartModePicker = () => {\n    let panel = document.getElementById('rc-course-mode-buttons');\n    if (!panel) { panel = document.createElement('div'); panel.id = 'rc-course-mode-buttons'; panel.style.cssText = 'position:fixed;z-index:2147483645;inset:0;display:flex;align-items:center;justify-content:center;background:#0009;padding:18px'; panel.innerHTML = '<div style=\"width:min(340px,100%);padding:18px;border-radius:14px;background:#172235;color:#fff;font:14px system-ui;text-align:center\"><b style=\"font-size:18px\">コースモードを選択</b><div style=\"display:grid;gap:9px;margin-top:14px\"><button data-mode=\"normal\">通常モード</button><button data-mode=\"mountain\">山岳モード</button><button data-mode=\"city\">都市モード</button><button data-mode=\"cancel\">キャンセル</button></div></div><style>#rc-course-mode-buttons button{padding:12px;border:0;border-radius:8px;font-weight:700;background:#e8f1ff;color:#172235}#rc-course-mode-buttons[hidden]{display:none}</style>'; document.body.appendChild(panel); panel.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const mode=b.dataset.mode;if(mode==='cancel'){panel.remove();return;}window.__coasterPendingStartMode=mode;panel.remove();document.getElementById('btn-start')?.click();})); }\n    panel.hidden = false;\n  };\n}\nif (typeof window.__coasterClearStartModeWorld !== 'function') window.__coasterClearStartModeWorld = () => {};\n`;
    patchedMain += runtimeBridge;

    // 全ゲームモジュールと3つの拡張モジュールを依存関係順にBlob化する。
    const originalSource = new Map(sources);
    originalSource.set(gameMainUrl, patchedMain);
    for (const [url, source] of patchTargets) originalSource.set(url, source);

    const blobMap = new Map();
    const visiting = new Set();
    async function buildModule(url) {
      if (blobMap.has(url)) return blobMap.get(url);
      if (visiting.has(url)) throw new Error('循環 import を検出しました: ' + url);
      visiting.add(url);
      let source = originalSource.get(url);
      if (source == null) {
        const response = await fetch(url, { cache: 'no-store', credentials: url.startsWith(location.origin) ? 'same-origin' : 'omit' });
        if (!response.ok) throw new Error('依存JSを取得できません: ' + url);
        source = await response.text();
        originalSource.set(url, source);
      }
      source = source.replace(/import\.meta\.url/g, JSON.stringify(url));
      const deps = getImports(source);
      for (const spec of deps) {
        let resolved;
        try { resolved = new URL(spec, url).href; } catch { continue; }
        const insideGame = resolved.startsWith(GAME_BASE);
        const insideExtension = resolved.startsWith('https://raw.githubusercontent.com/supermanone-boop/jet-coaster-game-addon-https-games.it-monozukuri.com-coaster-/refs/heads/main/');
        if (blobMap.has(resolved)) continue;
        if (!insideGame && !insideExtension) continue;
        if (!originalSource.has(resolved)) {
          const response = await fetch(resolved, { cache: 'no-store', credentials: insideGame ? 'same-origin' : 'omit' });
          if (!response.ok) throw new Error('依存JSの取得に失敗しました: ' + resolved + ' (HTTP ' + response.status + ')');
          originalSource.set(resolved, await response.text());
        }
        await buildModule(resolved);
      }
      source = rewriteImports(source, url, blobMap);
      const blobUrl = makeBlob(source);
      blobMap.set(url, blobUrl);
      visiting.delete(url);
      return blobUrl;
    }

    status('現行本体・以前の拡張機能を依存順に結合しています…');
    // 現行ゲームの各モジュールを先に作り、旧拡張が ./track.js 等を参照しても現行版へ向ける。
    const currentModuleNames = ['track.js', 'sim.js', 'world.js', 'looks.js', 'editor.js', 'codec.js', 'fix.js', 'favs.js', 'news.js', 'audio.js'];
    for (const name of currentModuleNames) await buildModule(new URL(name, GAME_BASE).href);
    if (!blobMap.has(new URL('track.js', GAME_BASE).href)) throw new Error('track.js の結合に失敗しました。');

    const addonBase = new URL('.', expansionUrl).href;
    for (const name of currentModuleNames) {
      const currentUrl = new URL(name, GAME_BASE).href;
      const addonUrl = new URL(name, addonBase).href;
      if (blobMap.has(currentUrl)) blobMap.set(addonUrl, blobMap.get(currentUrl));
    }
    const expansionBlobUrl = await buildModule(expansionUrl);
    patchedMain = patchedMain.replace('__COASTER_EXPANSION_BLOB__', expansionBlobUrl);
    originalSource.set(gameMainUrl, patchedMain);
    await buildModule(gameMainUrl);
    if (!blobMap.has(gameMainUrl)) throw new Error('main.js の結合に失敗しました。');

    savedRAF = window.requestAnimationFrame;
    const nativeRAF = savedRAF.bind(window);
    window.__coasterExpansionFrame = null;
    window.__coasterExpansionBooted = false;
    window.requestAnimationFrame = function (callback, ...args) {
      if (typeof callback === 'function' && callback.name === 'frame' && callback !== window.__coasterExpansionFrame) {
        if (!suppressedGameFrame) suppressedGameFrame = callback;
        return 0;
      }
      return nativeRAF(callback, ...args);
    };
    savedBody = document.body;
    savedBody.replaceWith(savedBody.cloneNode(true));
    bodyWasSwapped = true;
    status('拡張機能を保った改造版を起動しています…');
    await import(blobMap.get(gameMainUrl));

    await new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (window.__coasterExpansionBooted) return resolve();
        if (Date.now() - started > 20000) return reject(new Error('起動確認に失敗しました。ページを再読み込みしてください。'));
        setTimeout(check, 100);
      };
      check();
    });

    window[KEY] = { version: '13.0', gameVersion: version[1], blobUrls: madeBlobs, moduleUrls: [...blobMap.keys()] };
    document.getElementById('coaster-expansion-standalone-status')?.remove();
    console.info('[Coaster Expansion Standalone v13] 起動完了：現行ゲーム ' + version[1] + ' / 旧拡張3モジュール保持 / 白金ダイヤモンド+10 / ロープ / 共有コードv4');
  } catch (error) {
    if (bodyWasSwapped && savedBody && document.body !== savedBody) {
      try { document.body.replaceWith(savedBody); } catch (_) {}
    }
    if (savedRAF) {
      window.requestAnimationFrame = savedRAF;
      if (suppressedGameFrame) {
        try { window.requestAnimationFrame(suppressedGameFrame); } catch (_) {}
      }
    }
    fail(error);
  }
})();
