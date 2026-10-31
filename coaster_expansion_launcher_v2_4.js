(async () => {
  'use strict';

  const REPO_RAW = 'https://raw.githubusercontent.com/supermanone-boop/jet-coaster-game-addon-https-games.it-monozukuri.com-coaster-/refs/heads/main/';
  const REQUIRED = ['main.js', 'track.js', 'editor.js', 'world.js', 'codec.js', 'coaster_expansion.js', 'sim.js'];
  const KEY = '__coasterExpansionLauncherV24';

  function showMessage(message, isError = false) {
    let box = document.getElementById('coaster-expansion-launcher-message');
    if (!box) {
      box = document.createElement('div');
      box.id = 'coaster-expansion-launcher-message';
      box.style.cssText = 'position:fixed;z-index:2147483647;left:10px;right:10px;top:10px;padding:12px 14px;border-radius:9px;background:#152238;color:#fff;font:14px/1.5 system-ui;box-shadow:0 3px 18px #0005;white-space:pre-wrap;overflow-wrap:anywhere';
      document.body.appendChild(box);
    }
    box.style.background = isError ? '#8b2525' : '#152238';
    box.textContent = message;
  }

  try {
    if (!location.hostname.endsWith('it-monozukuri.com') || !location.pathname.startsWith('/coaster/')) {
      throw new Error('「ジェットコースターを作ろう！」の /coaster/ ページで実行してください。');
    }
    if (window[KEY]) throw new Error('起動処理はすでに実行されています。ページを再読み込みしてから再実行してください。');

    showMessage('v2.4（走行時間制限の撤廃）の拡張ファイルを取得しています…');
    const loaded = await Promise.all(REQUIRED.map(async (name) => {
      const response = await fetch(REPO_RAW + name, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${name} の取得に失敗しました（HTTP ${response.status}）。GitHubのmainブランチ直下に7ファイルがあるか確認してください。`);
      return [name, await response.text()];
    }));
    const source = Object.fromEntries(loaded);

    const jsBase = new URL('js/', location.href).href;
    const gameFile = (name) => new URL(name, jsBase).href;
    const threeURL = new URL('../../crowded-train-3d/js/vendor/three.module.min.js', jsBase).href;
    const analyticsURL = new URL('../../common/analytics.js', jsBase).href;
    const blobURL = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const replaceImports = (code, paths) => code.replace(/(\bfrom\s*)(["'])([^"']+)\2/g, (all, prefix, quote, specifier) => {
      return Object.prototype.hasOwnProperty.call(paths, specifier)
        ? prefix + quote + paths[specifier] + quote
        : all;
    });

    const urls = {};
    urls.track = blobURL(source['track.js']);
    urls.codec = blobURL(replaceImports(source['codec.js'], {
      './track.js': urls.track,
      './looks.js': gameFile('looks.js')
    }));
    urls.sim = blobURL(replaceImports(source['sim.js'], {
      './track.js': urls.track,
      './codec.js': urls.codec
    }));
    urls.expansion = blobURL(source['coaster_expansion.js']);

    urls.world = blobURL(replaceImports(source['world.js'], {
      '../../crowded-train-3d/js/vendor/three.module.min.js': threeURL,
      './track.js': urls.track,
      './themes.js': gameFile('themes.js'),
      './sim.js': urls.sim,
      './looks.js': gameFile('looks.js')
    }));

    urls.editor = blobURL(replaceImports(source['editor.js'], {
      './track.js': urls.track,
      './fix.js': gameFile('fix.js'),
      './themes.js': gameFile('themes.js'),
      './sim.js': urls.sim,
      './audio.js': gameFile('audio.js'),
      './looks.js': gameFile('looks.js')
    }));

    let mainSource = source['main.js'];
    const frameMarker = '\nfunction tick(dt, render = true) {';
    const bootMarker = '  requestAnimationFrame(frame);\n}\nboot();';
    if (!mainSource.includes(frameMarker) || !mainSource.includes('function frame(now) {') || !mainSource.includes(bootMarker)) {
      throw new Error('main.js の描画ループ構造を確認できません。アップロードしたファイルが拡張版か確認してください。');
    }
    mainSource = mainSource.replace(frameMarker, '\nwindow.__coasterExpansionFrame = frame;\nfunction tick(dt, render = true) {');
    mainSource = mainSource.replace(bootMarker, '  requestAnimationFrame(frame);\n  window.__coasterExpansionBooted = true;\n}\nboot();');
    urls.main = blobURL(replaceImports(mainSource, {
      '../../crowded-train-3d/js/vendor/three.module.min.js': threeURL,
      './audio.js': gameFile('audio.js'),
      '../../common/analytics.js': analyticsURL,
      './track.js': urls.track,
      './sim.js': urls.sim,
      './world.js': urls.world,
      './looks.js': gameFile('looks.js'),
      './editor.js': urls.editor,
      './codec.js': urls.codec,
      './fix.js': gameFile('fix.js'),
      './coaster_expansion.js': urls.expansion,
      './favs.js': gameFile('favs.js')
    }));

    const nativeRAF = window.requestAnimationFrame.bind(window);
    window.__coasterExpansionFrame = null;
    window.__coasterExpansionBooted = false;
    window.requestAnimationFrame = function (callback, ...args) {
      if (typeof callback === 'function' && callback.name === 'frame' && callback !== window.__coasterExpansionFrame) return 0;
      return nativeRAF(callback, ...args);
    };

    const oldBody = document.body;
    const newBody = oldBody.cloneNode(true);
    oldBody.replaceWith(newBody);

    showMessage('v2.4のゲーム本体を起動しています…');
    await import(urls.main);
    await new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (window.__coasterExpansionBooted) return resolve();
        if (Date.now() - started > 8000) return reject(new Error('ゲーム本体の起動完了を確認できませんでした。ページを再読み込みして再試行してください。'));
        setTimeout(check, 60);
      };
      check();
    });

    window[KEY] = { urls, version: '2.3' };
    const msg = document.getElementById('coaster-expansion-launcher-message');
    if (msg) msg.remove();
    console.info('[Coaster Expansion] v2.4 起動完了（走行時間制限なし）');
  } catch (error) {
    console.error('[Coaster Expansion Launcher v2.4]', error);
    showMessage(`起動エラー：${error && error.message ? error.message : error}\n\n読込後に発生したエラーの場合は、ページを再読み込みすると元のゲームに戻ります。`, true);
  }
})();
