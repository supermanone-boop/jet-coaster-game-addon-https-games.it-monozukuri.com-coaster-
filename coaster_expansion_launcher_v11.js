(async()=>{
'use strict';
const ROOT='https://raw.githubusercontent.com/supermanone-boop/jet-coaster-game-addon-https.games.it-monozukuri.com-coaster-/refs/heads/main/';
const ADDON=['coaster_expansion.js','coaster_architecture.js','coaster_city_flight.js','coaster_codec_v3.js','coaster_freecam_patch_v11.js','coaster_v11_patch_track.js','coaster_v11_patch_world.js','coaster_v11_patch_sim.js','coaster_v11_patch_editor.js'];
const KEY='__coasterExpansionLauncherV11';
const show=(msg,bad=false)=>{let el=document.getElementById('coaster-expansion-launcher-message');if(!el){el=document.createElement('div');el.id='coaster-expansion-launcher-message';el.style.cssText='position:fixed;z-index:2147483647;left:10px;right:10px;top:10px;padding:12px 14px;border-radius:9px;background:#152238;color:#fff;font:14px/1.5 system-ui;box-shadow:0 3px 18px #0005;white-space:pre-wrap;overflow-wrap:anywhere';document.body.appendChild(el);}el.style.background=bad?'#8b2525':'#152238';el.textContent=msg;};
const blob=code=>URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
const imports=(code,paths)=>code.replace(/(\bfrom\s*)(["'])([^"']+)\2/g,(all,p,q,spec)=>Object.prototype.hasOwnProperty.call(paths,spec)?p+q+paths[spec]+q:all);
const get=(url,label)=>fetch(url,{cache:'no-store',credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error(`${label}: HTTP ${r.status}`);return r.text();});
function mustReplace(src,oldText,newText,label){if(src.includes(newText))return src;if(!src.includes(oldText))throw new Error(`${label} の本体コード位置を確認できません。ゲーム更新後の構造と互換性がありません。`);return src.replace(oldText,newText);}
function patchMain(src,freecam){
  if(!/import\s*\{[^}]*\bEditor\b[^}]*\}\s*from\s*['"]\.\/editor\.js['"];?/.test(src))throw new Error('main.js の Editor import が見つかりません。');
  if(!src.includes("import { installCoasterExpansion } from './coaster_expansion.js';")){
    const updateImport=/^import[^\n]*from\s*['"]\.\.\/\.\.\/common\/update-check\.js['"];?$/m;
    const newsImport=/^import[^\n]*from\s*['"]\.\/news\.js['"];?$/m;
    const anchor=updateImport.test(src)?updateImport:newsImport;
    if(!anchor.test(src))throw new Error('main.js の import 領域が確認できません。');
    src=src.replace(anchor,m=>m+"\nimport { installCoasterExpansion } from './coaster_expansion.js';");
  }
  src=src.replace(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/track\.js['"];?/, (all,fields)=>{const names=fields.split(',').map(x=>x.trim()).filter(Boolean);if(!names.includes('MAX_LEN'))names.push('MAX_LEN');if(!names.includes('polyLen'))names.push('polyLen');return `import { ${names.join(', ')} } from './track.js';`});
  if(!src.includes("window.__coasterPendingStartMode = 'choose';")){
    src=src.replace('function toTitle() {\n  sound.roll(0);', "function toTitle() {\n  sound.roll(0);\n  window.__coasterPendingStartMode='choose';\n  if(typeof window.__coasterHideStartModePicker==='function')window.__coasterHideStartModePicker();\n  if(typeof window.__coasterClearStartModeWorld==='function')window.__coasterClearStartModeWorld();");
    const old=`document.getElementById('btn-start').addEventListener('click', () => {\n  sound.sfx('tap');\n  favId = null;\n  editor.setIncidents([]);\n  openEditor(newDesign(), 1);\n});`;
    const repl=`window.__coasterPendingStartMode='choose';\ndocument.getElementById('btn-start').addEventListener('click', () => {\n  const selectedMode=window.__coasterPendingStartMode||'choose';window.__coasterPendingStartMode='choose';\n  sound.sfx('tap');favId=null;editor.setIncidents([]);\n  const mode=selectedMode==='choose'?'normal':selectedMode;\n  const prepared=typeof window.__coasterCreateStartDesign==='function'?window.__coasterCreateStartDesign(mode):null;\n  openEditor(prepared||newDesign(),1);\n  if(typeof window.__coasterAfterStartMode==='function')window.__coasterAfterStartMode(mode);\n});`;
    if(src.includes(old))src=src.replace(old,repl);
    else if(!src.includes("__coasterAfterStartMode(mode)"))throw new Error('main.js の開始ボタンの構造が一致しません。');
  }
  if(!src.includes('const freeCamState = {')){
    src=src.replace(/const CAM_MODES\s*=\s*\[([^\]]*)\];/, (all,items)=>/['"]free['"]/.test(items)?all:`const CAM_MODES = [${items.trim()}, 'free'];`);
    src=src.replace(/const CAM_NAMES\s*=\s*\{([^}]*)\};/, (all,items)=>/\bfree\s*:/.test(items)?all:`const CAM_NAMES = {${items.trim()}, free: '自由' };`);
    if(!src.includes('const freeCamState = {') && freecam && src.includes('function setMode(m) {')){
      src=src.replace('function setMode(m) {', freecam+'\nfunction setMode(m) {');
      src=src.replace('  const lead = sim.cars[0];\n  const f = lead.f;', "  const lead = sim.cars[0];\n  if(cam.mode==='free'){updateFreeCamera(dt);return;}\n  const f = lead.f;");
      src=src.replace("  ui.favs.hidden = m !== 'favs';", "  ui.favs.hidden = m !== 'favs';\n  freeCamPanel.hidden=!(m==='ride'&&cam.mode==='free');\n  if(m!=='ride')clearFreeCamMoves();");
      src=src.replace("  ui.camBtn.textContent = `🎥 ${CAM_NAMES[cam.mode]}`;\n  cam.shotT = 0;\n  sound.sfx('tap');", "  ui.camBtn.textContent = `🎥 ${CAM_NAMES[cam.mode]}`;\n  if(cam.mode==='free')activateFreeCamera();else{freeCamPanel.hidden=true;clearFreeCamMoves();}\n  freeCamPanel.hidden=!(mode==='ride'&&cam.mode==='free');\n  cam.shotT = 0;\n  sound.sfx('tap');");
      src=src.replace('  if (cam.pos.y < 1.2) cam.pos.y = 1.2;', '  if (cam.pos.y < 1.2) cam.pos.y = 1.2;\n  const wantedFar=Math.max(2400,Math.abs(cam.pos.y)*3+2400,co?co.tr.maxH*4+2400:2400);\n  if(wantedFar>camera.far){camera.far=wantedFar;camera.updateProjectionMatrix();if(scene3d.fog)scene3d.fog.far=Math.max(scene3d.fog.far,wantedFar*.75);}');
      src=src.replace('new THREE.PerspectiveCamera(55, 1, 0.3, 700)', 'new THREE.PerspectiveCamera(55, 1, 0.3, 2400)');
    }
  }
  if(!src.includes('let extensionFrameHook = null;')){
    src=src.replace('function tick(dt, render = true) {', `let extensionFrameHook=null;\nfunction tick(dt,render=true){\n  if(extensionFrameHook){try{extensionFrameHook(dt);}catch(error){console.error('[Coaster Expansion frame hook]',error);extensionFrameHook=null;}if(extensionFrameHook){if(render)renderer.render(scene3d,camera);return;}}`);
  }
  if(!src.includes('const coasterExpansionRuntime = {')){
    const runtime=`\n// v11: native game logic remains in place; this API exposes only extension hooks.\nconst coasterExpansionRuntime={\n  get editor(){return editor;},get co(){return co;},get scene3d(){return scene3d;},get camera(){return camera;},get renderer(){return renderer;},get THREE(){return THREE;},get mode(){return mode;},get sim(){return co?co.sim:null;},get cameraMode(){return cam.mode;},get paused(){return !!player.paused;},get playbackSpeed(){return speed;},\n  setFrameHook(fn){if(fn!=null&&typeof fn!=='function')throw new TypeError('フレームフックは関数またはnullを指定してください');extensionFrameHook=fn||null;return !!extensionFrameHook;},clearFrameHook(){extensionFrameHook=null;},\n  setCameraMode(name){if(!CAM_MODES.includes(name))throw new Error('未対応のカメラモードです');cam.mode=name;if(name==='free')activateFreeCamera();else{freeCamPanel.hidden=true;clearFreeCamMoves();}ui.camBtn.textContent=\`🎥 \${CAM_NAMES[name]}\`;cam.shotT=0;return cam.mode;},\n  setPlaybackSpeed(value){const v=Number(value);if(!SPEEDS.includes(v))throw new Error('再生速度は0.5 / 1 / 2 / 4倍から選んでください');setSpeed(v);return speed;},\n  setPaused(value){if(mode!=='ride')return false;if(co&&co.sim.mode==='done'&&!value)player.pending=0;player.paused=!!value;refreshPlay();return player.paused;},togglePlayback(){if(mode!=='ride')return false;togglePlay();return player.paused;},\n  normalize,buildTrack,prepare,Sim,createTrackExportGroup(design=editor.design){if(!design||!Array.isArray(design.pts)||design.pts.length<2)throw new Error('書き出すコースがありません');const tr=prepare(design,buildTrack),look=cleanLook(design.look),built=buildTrackMeshes(tr,look.rail,false);built.group.name='EditedCoasterTrack';return {group:built.group,track:tr};}\n};\nwindow.__coasterExpansionRuntime=coasterExpansionRuntime;\ninstallCoasterExpansion(coasterExpansionRuntime,{FIELD,MAX_LEN,randomStroke,polyLen,autoHeights,H_SAMPLES,STARTS});\nwindow.__coasterExpansionFrame=frame;window.__coasterExpansionBooted=true;\n`;
    src+=runtime;
  }
  return src;
}
try{
  if(!location.hostname.endsWith('it-monozukuri.com')||!location.pathname.startsWith('/coaster/'))throw new Error('「ジェットコースターを作ろう！」の /coaster/ ページで実行してください。');
  if(window[KEY])throw new Error('v11はすでに起動しています。再読み込みしてから実行してください。');
  show('v11：現行ゲーム本体と拡張ファイルを取得しています…');
  const jsBase=new URL('js/',location.href).href,gameFile=n=>new URL(n,jsBase).href;
  const gameNames=['main.js','track.js','editor.js','world.js','sim.js','codec.js','looks.js','fix.js','audio.js','favs.js','news.js','themes.js'];
  const gameEntries=await Promise.all(gameNames.map(async n=>[n,await get(gameFile(n),`ゲーム本体 ${n}`)]));
  const addonEntries=await Promise.all(ADDON.map(async n=>[n,await get(ROOT+n,`拡張 ${n}`)]));
  const native=Object.fromEntries(gameEntries),addon=Object.fromEntries(addonEntries);
  const patchTrackModule=await import(blob(addon['coaster_v11_patch_track.js']));
  const patchWorldModule=await import(blob(addon['coaster_v11_patch_world.js']));
  const patchSimModule=await import(blob(addon['coaster_v11_patch_sim.js']));
  const patchEditorModule=await import(blob(addon['coaster_v11_patch_editor.js']));
  native['track.js']=patchTrackModule.patchTrack(native['track.js']);
  native['world.js']=patchWorldModule.patchWorld(native['world.js']);
  native['sim.js']=patchSimModule.patchSim(native['sim.js']);
  native['editor.js']=patchEditorModule.patchEditor(native['editor.js']);
  const threeURL=new URL('../../crowded-train-3d/js/vendor/three.module.min.js',jsBase).href;
  const analyticsURL=new URL('../../common/analytics.js',jsBase).href;
  const updateURL=new URL('../../common/update-check.js',jsBase).href;
  const urls={};
  urls.track=blob(native['track.js']);
  const codecNative=native['codec.js']||'';
  const needsV3=/const\s+VER\s*=\s*1\s*;/.test(codecNative);
  urls.codec=needsV3?blob(imports(addon['coaster_codec_v3.js'],{'./track.js':urls.track,'./looks.js':gameFile('looks.js')})):blob(imports(codecNative,{'./track.js':urls.track,'./looks.js':gameFile('looks.js')}));
  urls.sim=blob(imports(native['sim.js'],{'./track.js':urls.track,'./codec.js':urls.codec}));
  urls.world=blob(imports(native['world.js'],{'../../crowded-train-3d/js/vendor/three.module.min.js':threeURL,'./track.js':urls.track,'./sim.js':urls.sim,'./themes.js':gameFile('themes.js'),'./looks.js':gameFile('looks.js')}));
  urls.editor=blob(imports(native['editor.js'],{'./track.js':urls.track,'./sim.js':urls.sim,'./fix.js':gameFile('fix.js'),'./themes.js':gameFile('themes.js'),'./audio.js':gameFile('audio.js'),'./looks.js':gameFile('looks.js')}));
  urls.architecture=blob(addon['coaster_architecture.js']);
  urls.cityFlight=blob(imports(addon['coaster_city_flight.js'],{'./coaster_architecture.js':urls.architecture}));
  urls.expansion=blob(imports(addon['coaster_expansion.js'],{'./coaster_architecture.js':urls.architecture,'./coaster_city_flight.js':urls.cityFlight}));
  const patchedMain=patchMain(native['main.js'],addon['coaster_freecam_patch_v11.js']);
  urls.main=blob(imports(patchedMain,{'../../crowded-train-3d/js/vendor/three.module.min.js':threeURL,'./audio.js':gameFile('audio.js'),'../../common/analytics.js':analyticsURL,'./track.js':urls.track,'./sim.js':urls.sim,'./world.js':urls.world,'./looks.js':gameFile('looks.js'),'./editor.js':urls.editor,'./codec.js':urls.codec,'./fix.js':gameFile('fix.js'),'./coaster_expansion.js':urls.expansion,'./favs.js':gameFile('favs.js'),'./news.js':gameFile('news.js'),'../../common/update-check.js':updateURL}));
  const nativeRAF=window.requestAnimationFrame.bind(window);
  window.__coasterExpansionFrame=null;window.__coasterExpansionBooted=false;
  window.requestAnimationFrame=function(callback,...args){if(typeof callback==='function'&&callback.name==='frame'&&callback!==window.__coasterExpansionFrame)return 0;return nativeRAF(callback,...args);};
  const body=document.body;body.replaceWith(body.cloneNode(true));show('v11：現行ゲーム本体へ互換パッチを適用しています…');
  await import(urls.main);
  await new Promise((resolve,reject)=>{const start=Date.now();const check=()=>{if(window.__coasterExpansionBooted&&document.getElementById('rc-course-mode-buttons'))return resolve();if(Date.now()-start>20000)return reject(new Error('起動確認に失敗しました。ページを再読み込みしてください。'));setTimeout(check,120);};check();});
  window[KEY]={urls,version:'11.0',nativePreserved:true};
  const el=document.getElementById('coaster-expansion-launcher-message');if(el)el.remove();
  console.info('[Coaster Expansion] v11.0 起動完了：本体の新仕掛け・評価を維持／山岳地形修正／全建物の都市マップ');
}catch(error){console.error('[Coaster Expansion Launcher v11]',error);show(`起動エラー：${error.message||error}\n\nページを再読み込みすると元のゲームに戻ります。`,true);}
})();