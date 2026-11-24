/*
 * Coaster Physics Tuning Launcher v13.8
 * 現行ゲーム 1.4.0 のエンジンに v10.2 系拡張モジュールと物理・形状調整を統合。
 * 現行8種類の仕掛けを維持し、設置上限128個・コース長5,000mを復元する。
 * 3モード／都市・建築・フライト／モデル配置・保存機能は既存のネイティブUIに接続する。
 */
(async () => {
  'use strict';

  const ROOT = 'https://raw.githubusercontent.com/supermanone-boop/jet-coaster-game-addon-https-games.it-monozukuri.com-coaster-/refs/heads/main/';
  const BASE_URL = ROOT + 'Coaster_Expansion_Standalone_v13_3.js';
  const WRAPPER_KEY = '__coasterPhysicsTuningWrapperV138';

  function show(message, error = false) {
    let box = document.getElementById('coaster-physics-tuning-status');
    if (!box) {
      box = document.createElement('div');
      box.id = 'coaster-physics-tuning-status';
      box.style.cssText = 'position:fixed;z-index:2147483647;top:10px;left:10px;right:10px;padding:12px 14px;border-radius:9px;background:#172235;color:#fff;font:14px/1.5 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 3px 18px #0006';
      (document.body || document.documentElement).appendChild(box);
    }
    box.style.background = error ? '#852b2b' : '#172235';
    box.textContent = message;
  }

  function replaceOnce(source, before, after, label) {
    const at = source.indexOf(before);
    if (at < 0) throw new Error(label + ' の位置が見つかりません。現行ローダーの構造が変わっています。');
    if (source.indexOf(before, at + before.length) >= 0) throw new Error(label + ' が複数あります。安全のため停止しました。');
    return source.slice(0, at) + after + source.slice(at + before.length);
  }

  try {
    if (!location.hostname.endsWith('it-monozukuri.com') || !location.pathname.startsWith('/coaster/')) {
      throw new Error('「ジェットコースターを作ろう！」の /coaster/ ページで実行してください。');
    }
    if (window[WRAPPER_KEY] || window.__coasterExpansionStandaloneV133 || window.__coasterExpansionStandaloneV135 || window.__coasterExpansionStandaloneV136 || window.__coasterExpansionStandaloneV137 || window.__coasterExpansionStandaloneV138 || window.__coasterExpansionLauncherV102) {
      throw new Error('既存の拡張ランタイムが起動中です。再読み込みしてから実行してください。');
    }

    show('現行ゲーム用ローダーと本体モジュールを準備しています…');
    const response = await fetch(BASE_URL, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('既存ローダーの取得に失敗しました（HTTP ' + response.status + '）。');
    let loader = await response.text();
    if (!loader.includes('Coaster Expansion Standalone v13.3')) {
      throw new Error('ベースローダーが想定した v13.3 ではありません。');
    }

    loader = replaceOnce(
      loader,
      "const KEY = '__coasterExpansionStandaloneV133';",
      "const KEY = '__coasterExpansionStandaloneV138';",
      '起動キー'
    );
    loader = loader.replaceAll('v13.3', 'v13.8');
    loader = loader.replace('v13.2 は既に起動しています', 'v13.8 は既に起動しています');

    // track.js にある既存の LOOP_LEN / LOOP_W と、トンネル・ロールの長さ定義を
    // 同じモジュール内から安全に変更できるようにする。新しいギミック自体は作らない。
    const trackTail = '    return source;\n  }\n  function patchCodec(source) {';
    const trackTailPatched = `    source = patchTrackPhysics(source);
    return source;
  }
  function patchCodec(source) {`;
    loader = replaceOnce(loader, trackTail, trackTailPatched, 'track.js の物理パラメータ接続');

    const injectedHelpers = String.raw`
  function patchTrackPhysics(source) {
    // v10.2 の設置上限・最大コース長を現行 1.4.0 の track.js に移植する。
    // GIMMICKS 自体は現行版の8種類を保持し、1コースあたりの設置上限だけ128へ戻す。
    function setExportedNumeric(name, value) {
      const re = new RegExp('(export\\s+(?:const|let)\\s+' + name + '\\s*=\\s*)([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))(\\s*;)','g');
      const matches = [...source.matchAll(re)];
      if (matches.length !== 1) throw new Error('現行 track.js の ' + name + ' 定義が一意に見つかりません。旧拡張の上限を安全に統合できません。');
      source = source.replace(re, (_, before, _old, after) => before + String(value) + after);
    }
    setExportedNumeric('MAX_GIMMICKS', 128);
    setExportedNumeric('MAX_LEN', 5000);
    // LOOP_LEN / LOOP_W がある本体では、同じ loopShape() の計算値を更新する。
    // 定数名が異なる更新版でも、LOOP_* の長さ・幅系を自動検出する。
    const number = '([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';
    const findLoopConstant = (kind) => {
      const re = new RegExp('(?:export\\s+)?(const|let)\\s+(LOOP_[A-Z0-9_]*(?:' + kind + '))\\s*=\\s*' + number + '\\s*;');
      return source.match(re);
    };
    const loopLength = findLoopConstant('LEN|LENGTH|SIZE|RADIUS|HEIGHT');
    const loopWidth = findLoopConstant('W|WIDTH');
    const loopLengthName = loopLength && loopLength[2];
    const loopWidthName = loopWidth && loopWidth[2];
    if (!loopLengthName || !loopWidthName) {
      throw new Error('現行 track.js の LOOP_LEN / LOOP_W が見つかりません。宙返り調整を安全に適用できません。');
    }
    const makeMutable = (match) => {
      if (!match || match[1] !== 'const') return;
      const name = match[2];
      const re = new RegExp('(export\\s+)(const\\s+)' + name + '(\\s*=)');
      source = source.replace(re, '$1let ' + name + '$3');
    };
    makeMutable(loopLength);
    makeMutable(loopWidth);

    // トンネル・ひねりは現行 GIMMICKS / 専用テーブルの len/length を直接変更する。
    // 数値定数で実装された世代にも対応できるよう、公開・非公開の長さ定数を mutable 化する。
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
    if (loopLengthName) {
      const widthExpr = loopWidthName ? loopWidthName : 'undefined';
      const cacheReset = /\blet\s+loopShapeCache\s*=/.test(source) ? 'if (typeof loopShapeCache !== "undefined") loopShapeCache = null;' : '';
      exports.push(
        'export function getCoasterLoopDimensions() { return { length: ' + loopLengthName + ', width: ' + widthExpr + ' }; }',
        'export function setCoasterLoopDimensions(length, width) { const l = Number(length); if (!Number.isFinite(l)) throw new TypeError("loop length must be finite"); ' +
          loopLengthName + ' = Math.max(12, Math.min(800, l)); ' +
          (loopWidthName ? 'const w = Number(width); if (!Number.isFinite(w)) throw new TypeError("loop width must be finite"); ' + loopWidthName + ' = Math.max(0.5, Math.min(80, w)); ' : '') +
          cacheReset + ' return { length: ' + loopLengthName + ', width: ' + widthExpr + ' }; }'
      );
    }
    if (dynamicNames.length) {
      const cases = dynamicNames.map(name => 'case "' + name + '": ' + name + ' = n; return n;').join('\n');
      exports.push('export function setCoasterFeatureLength(name, value) { const n = Number(value); if (!Number.isFinite(n)) throw new TypeError("feature length must be finite"); switch (name) {\n' + cases + '\ndefault: throw new Error("unknown feature length: " + name); } }');
      exports.push('export const COASTER_FEATURE_LENGTH_KEYS = ' + JSON.stringify(dynamicNames) + ';');
    }
    if (exports.length) source += '\n\n// Coaster Physics Tuning v13.8\n' + exports.join('\n') + '\n';
    return source;
  }

  function patchWaterMain(source) {
    const ctor = /const\s+water\s*=\s*new\s+Particles\(\s*(\d+)\s*,\s*([\d.]+)\s*,\s*true\s*\)\s*;/;
    const cm = source.match(ctor);
    if (!cm) throw new Error('現行 main.js の水パーティクル初期化が見つかりません。水量を安全に変更できません。');
    const baseCapacity = Number(cm[1]);
    const particleScale = Number(cm[2]);
    const maxCapacity = Math.min(24000, Math.max(baseCapacity, Math.round(baseCapacity * 4)));
    const waterInit = 'const ceWaterAmount = () => { const n = Number(window.__coasterPhysicsTuning && window.__coasterPhysicsTuning.waterAmount); return Number.isFinite(n) ? Math.max(0.25, Math.min(4, n)) : 1; };\nconst water = new Particles(' + maxCapacity + ', ' + particleScale + ', true);';
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
    for (const [pattern, replacement, label] of replacements) {
      if (!pattern.test(source)) throw new Error('現行 main.js の「' + label + '」処理が見つかりません。水量設定を適用できません。');
      source = source.replace(pattern, replacement);
    }
    return source;
  }

  function patchSimSource(source) {
    // 乗客の G 耐性 j と、気絶蓄積を始めるしきい値の両方を倍率化する。
    const riderScale = '(Number(window.__coasterPhysicsTuning && window.__coasterPhysicsTuning.riderStrength) || 1)';
    const faintPatterns = [
      {
        pattern: /if\s*\(\s*car\.gUf\s*>\s*\(\s*sup\s*\?\s*([\d.]+)\s*:\s*([\d.]+)\s*\)\s*\)\s*r\.faintT\s*\+=\s*dt\s*;/,
        replace: match => 'if (car.gUf > (sup ? ' + match[1] + ' : ' + match[2] + ') * ' + riderScale + ') r.faintT += dt;'
      },
      {
        pattern: /if\s*\(\s*car\.gUf\s*>\s*([\d.]+)\s*\)\s*r\.faintT\s*\+=\s*dt\s*;/,
        replace: match => 'if (car.gUf > ' + match[1] + ' * ' + riderScale + ') r.faintT += dt;'
      }
    ];
    let faintAdjusted = false;
    for (const variant of faintPatterns) {
      const match = source.match(variant.pattern);
      if (!match) continue;
      source = source.replace(variant.pattern, variant.replace(match));
      faintAdjusted = true;
      break;
    }
    if (!faintAdjusted) {
      throw new Error('現行 sim.js の乗客の気絶しきい値が想定と異なります。安全のため起動を中止しました。');
    }
    if (!/up\s*>\s*b\.v\s*\*\s*r\.j/.test(source) || !/side\s*>\s*b\.l\s*\*\s*r\.j/.test(source)) {
      throw new Error('現行 sim.js の乗客耐力判定が想定と異なります。乗客強度を安全に適用できません。');
    }
    if (!/this\.mat\s*=\s*MATS\s*\[\s*design\.mat\s*\]/.test(source)) {
      throw new Error('現行 sim.js のレール素材参照が想定と異なります。レール強度を安全に適用できません。');
    }
    return source;
  }

  function installPhysicsTuning(api) {
    if (!api || !api.Sim || !api.Sim.prototype || !api.trackModule) {
      throw new Error('物理調整用ランタイムAPIが不足しています。現行本体との接続を確認してください。');
    }
    const dock = document.getElementById('coaster-expansion-tools');
    if (!dock) throw new Error('既存アドオンの編集UIが見つかりません。拡張モジュールの初期化を確認してください。');
    const nav = dock.querySelector('.ce-nav');
    if (!nav) throw new Error('既存アドオンのタブ列が見つかりません。');
    if (dock.querySelector('#ce-physics-tuning-panel')) return;

    const DEFAULTS = { railStrength: 100, tunnelLength: 2, waterAmount: 2.5, loopSize: 1.8, twistLength: 2, riderStrength: 10 };
    const LIMITS = {
      railStrength: [1, 100], tunnelLength: [0.5, 5], waterAmount: [0.25, 4],
      loopSize: [0.5, 4], twistLength: [0.5, 5], riderStrength: [1, 20]
    };
    const STORAGE = 'coaster_physics_tuning_v138';
    const LEGACY_STORAGE_KEYS = ['coaster_physics_tuning_v137', 'coaster_physics_tuning_v136', 'coaster_physics_tuning_v135'];
    const clampValue = (key, value) => {
      const limits = LIMITS[key];
      const n = Number(value);
      return Math.max(limits[0], Math.min(limits[1], Number.isFinite(n) ? n : DEFAULTS[key]));
    };
    let settings = { ...DEFAULTS };
    try {
      const legacy = LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
      const saved = JSON.parse(localStorage.getItem(STORAGE) || legacy || 'null');
      if (saved && typeof saved === 'object') {
        for (const key of Object.keys(DEFAULTS)) if (saved[key] != null) settings[key] = clampValue(key, saved[key]);
      }
    } catch (_) {}
    window.__coasterPhysicsTuning = { ...settings };

    const track = api.trackModule;

    function findLengthEntries(expression) {
      const found = [];
      const seen = new WeakSet();
      for (const [exportName, table] of Object.entries(track)) {
        if (!table || typeof table !== 'object') continue;
        if (!/GIMMICK|TUNNEL|TWIST|ROLL|FEATURE/i.test(exportName)) continue;
        const records = Array.isArray(table) ? table.entries() : Object.entries(table);
        for (const [key, definition] of records) {
          if (!definition || typeof definition !== 'object' || seen.has(definition)) continue;
          const field = Number.isFinite(Number(definition.len)) ? 'len' : Number.isFinite(Number(definition.length)) ? 'length' : null;
          if (!field) continue;
          const label = exportName + ' ' + key + ' ' + String(definition.id || definition.t || definition.type || definition.name || definition.label || '');
          if (expression.test(label)) {
            seen.add(definition);
            found.push({ id: exportName + '.' + key, object: definition, field, base: Number(definition[field]) });
          }
        }
      }
      return found;
    }
    const tunnelEntries = findLengthEntries(/tunnel|トンネル/i);
    const twistEntries = findLengthEntries(/twist|roll|barrel|corkscrew|ひねり|ロール/i);
    const loopEntries = findLengthEntries(/loop|inversion|宙返り|ループ/i).filter(entry => entry.base > 0);
    const constantNames = Array.isArray(track.COASTER_FEATURE_LENGTH_KEYS) ? track.COASTER_FEATURE_LENGTH_KEYS : Object.keys(track).filter(name => /^(?:TUNNEL|TWIST|ROLL|BARREL)(?:_.*)?(?:LEN|LENGTH)$|^(?:TUNNEL|TWIST|ROLL|BARREL)(?:LEN|LENGTH)$/i.test(name));
    const constantTunnelNames = constantNames.filter(name => /TUNNEL/i.test(name));
    const constantTwistNames = constantNames.filter(name => /(TWIST|ROLL|BARREL)/i.test(name));
    const baseConstants = new Map(constantNames.map(name => [name, Number(track[name])]).filter(([, value]) => Number.isFinite(value)));
    const loopDimensions = typeof track.getCoasterLoopDimensions === 'function' ? track.getCoasterLoopDimensions() : null;
    const baseLoopLength = loopDimensions && Number(loopDimensions.length);
    const baseLoopWidth = loopDimensions && Number(loopDimensions.width);
    const canLoop = typeof track.setCoasterLoopDimensions === 'function' && Number.isFinite(baseLoopLength) || loopEntries.length > 0;
    const canTunnel = tunnelEntries.length > 0 || constantTunnelNames.length > 0;
    const canTwist = twistEntries.length > 0 || constantTwistNames.length > 0;
    const missingFeatures = [!canLoop && '宙返り', !canTunnel && 'トンネル', !canTwist && 'ひねり'].filter(Boolean);
    if (missingFeatures.length) throw new Error('現行 track.js で長さ定義を確認できません：' + missingFeatures.join('・'));

    // Sim ごとに素材オブジェクトを分離し、元の MATS を壊さずに耐力を倍率化する。
    // checkLoads は dry-run と本走行の両方で使われるため、予想と実際の判定がそろう。
    const proto = api.Sim.prototype;
    const patchSymbol = Symbol.for('coaster.physics.tuning.v137.checkLoads');
    if (typeof proto.checkLoads !== 'function') throw new Error('Sim.checkLoads が見つかりません。');
    if (!proto[patchSymbol]) {
      const originalCheckLoads = proto.checkLoads;
      const simBases = new WeakMap();
      const riderBases = new WeakMap();
      proto.checkLoads = function (dt) {
        if (this.mat && typeof this.mat === 'object') {
          let base = simBases.get(this);
          if (!base) {
            base = { v: Number(this.mat.v) || 1, l: Number(this.mat.l) || 1 };
            this.mat = { ...this.mat };
            simBases.set(this, base);
          }
          const config = window.__coasterPhysicsTuning || DEFAULTS;
          const railScale = clampValue('railStrength', config.railStrength);
          this.mat.v = base.v * railScale;
          this.mat.l = base.l * railScale;
        }
        const riders = Array.isArray(this.riders)
          ? this.riders
          : (Array.isArray(this.cars) ? this.cars.flatMap(car => car.riders || []) : []);
        const riderScale = clampValue('riderStrength', (window.__coasterPhysicsTuning || DEFAULTS).riderStrength);
        for (const rider of riders) {
          if (!rider || typeof rider !== 'object' || !Number.isFinite(Number(rider.j))) continue;
          if (!riderBases.has(rider)) riderBases.set(rider, Number(rider.j));
          rider.j = riderBases.get(rider) * riderScale;
        }
        return originalCheckLoads.call(this, dt);
      };
      Object.defineProperty(proto, patchSymbol, { value: true });
    }

    const specs = [
      ['railStrength', 'レール強度', '倍', 1, 100, 1, true],
      ['tunnelLength', 'トンネルの長さ', '倍', 0.5, 5, 0.1, canTunnel],
      ['waterAmount', '水・水しぶきの量', '倍', 0.25, 4, 0.25, true],
      ['loopSize', '宙返りの大きさ', '倍', 0.5, 4, 0.1, canLoop],
      ['twistLength', 'ひねりの長さ', '倍', 0.5, 5, 0.1, canTwist],
      ['riderStrength', 'お客様の体の強さ', '倍', 1, 20, 0.5, true]
    ];

    const style = document.createElement('style');
    style.id = 'ce-physics-tuning-style';
    style.textContent = [
      '#coaster-expansion-tools .ce-physics-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
      '#coaster-expansion-tools .ce-physics-card{min-width:0;padding:9px;border:1px solid #d8e0e4;border-radius:8px;background:#f8faf9}',
      '#coaster-expansion-tools .ce-physics-card label{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;color:#2b3a55;font-size:12px;font-weight:700}',
      '#coaster-expansion-tools .ce-physics-card input[type=number]{box-sizing:border-box;width:112px;max-width:100%;min-height:38px;padding:7px 9px;border:1px solid #b9c7d1;border-radius:7px;background:#fff;color:#172b40;font:700 15px system-ui;font-variant-numeric:tabular-nums;text-align:right}',
      '#coaster-expansion-tools .ce-physics-card input[type=number]:focus{outline:2px solid #6d9bc0;outline-offset:1px}',
      '#coaster-expansion-tools .ce-physics-card input[type=number]:disabled{opacity:.4;background:#eef1f3}',
      '#coaster-expansion-tools .ce-physics-unit{font-size:11px;color:#52687a;margin-left:4px}',
      '#coaster-expansion-tools .ce-physics-note{font-size:11px;line-height:1.5;color:#66798a}',
      '#coaster-expansion-tools .ce-physics-actions{display:flex;flex-wrap:wrap;gap:7px}',
      '#coaster-expansion-tools .ce-physics-actions button{min-height:32px;padding:5px 10px;font:700 12px system-ui}',
      '@media(max-width:520px){#coaster-expansion-tools .ce-physics-grid{grid-template-columns:1fr}}'
    ].join('\n');
    document.head.appendChild(style);
    nav.insertAdjacentHTML('beforeend', '<button type="button" class="chip" data-tab="physics" aria-selected="false">数値・形状調整</button>');

    const panel = document.createElement('div');
    panel.id = 'ce-physics-tuning-panel';
    panel.className = 'ce-panel';
    panel.dataset.panel = 'physics';
    panel.hidden = true;
    panel.innerHTML = '<div class="ce-note">数値を直接入力して、既存ゲーム本体の物理・線路パラメータを調整します。入力確定または Enter で適用され、このブラウザに保存されます。</div>' +
      '<div class="ce-physics-grid">' + specs.map(([key, label, unit, min, max, step, available]) =>
        '<section class="ce-physics-card"><label for="ce-physics-input-' + key + '"><span>' + label + '</span>' +
        '<span><input id="ce-physics-input-' + key + '" type="number" inputmode="decimal" data-physics="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + settings[key] + '" aria-label="' + label + '"' + (available ? '' : ' disabled') + '><span class="ce-physics-unit">' + unit + '</span></span>' +
        '</label></section>'
      ).join('') + '</div>' +
      '<div class="ce-physics-actions"><button type="button" class="chip" data-physics-reset>初期設定に戻す</button></div>' +
      '<div class="ce-status note" data-physics-status role="status"></div>' +
      '<div class="ce-physics-note">レール強度・乗客耐久力・水量は走行中も反映。宙返り・トンネル・ひねりの形状は次にコースを組み直したときに反映されます。入力可能範囲は各欄の min / max に従います。トンネル・宙返り・ひねりが無効なら、現行 track.js に対応するネイティブ長さ定義が見つかっていません。</div>';
    dock.appendChild(panel);

    const status = panel.querySelector('[data-physics-status]');
    function persist() {
      try { localStorage.setItem(STORAGE, JSON.stringify(settings)); } catch (_) {}
    }
    function updateLength(entries, multiplier) {
      for (const entry of entries) entry.object[entry.field] = entry.base * multiplier;
    }
    function updateConstants(names, multiplier) {
      if (!names.length || typeof track.setCoasterFeatureLength !== 'function') return;
      for (const name of names) track.setCoasterFeatureLength(name, baseConstants.get(name) * multiplier);
    }
    function formatNumber(value) {
      return String(Number(Number(value).toFixed(3)));
    }
    function renderValues() {
      for (const [key] of specs) {
        const input = panel.querySelector('[data-physics="' + key + '"]');
        if (input) input.value = formatNumber(settings[key]);
      }
    }
    function apply() {
      window.__coasterPhysicsTuning = { ...settings };
      if (typeof track.setCoasterLoopDimensions === 'function' && Number.isFinite(baseLoopLength)) {
        track.setCoasterLoopDimensions(baseLoopLength * settings.loopSize, Number.isFinite(baseLoopWidth) ? baseLoopWidth * settings.loopSize : undefined);
      } else updateLength(loopEntries, settings.loopSize);
      updateLength(tunnelEntries, settings.tunnelLength);
      updateLength(twistEntries, settings.twistLength);
      updateConstants(constantTunnelNames, settings.tunnelLength);
      updateConstants(constantTwistNames, settings.twistLength);
      persist();
      renderValues();
      const loopInfo = canLoop ? settings.loopSize + '倍' : '現行本体に長さ定義なし';
      const tunnelInfo = canTunnel ? settings.tunnelLength + '倍' : '現行本体に長さ定義なし';
      const twistInfo = canTwist ? settings.twistLength + '倍' : '現行本体に長さ定義なし';
      status.textContent = '適用中：レール ' + settings.railStrength + '倍／乗客 ' + settings.riderStrength + '倍／トンネル ' + tunnelInfo + '／水 ' + settings.waterAmount + '倍／宙返り ' + loopInfo + '／ひねり ' + twistInfo;
    }
    panel.querySelectorAll('input[type="number"][data-physics]').forEach(input => {
      const commit = () => {
        const key = input.dataset.physics;
        // 空欄や途中入力は確定扱いにせず、最後の有効値を維持する。
        if (input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) {
          input.value = formatNumber(settings[key]);
          return;
        }
        settings[key] = clampValue(key, input.valueAsNumber);
        apply();
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          input.blur();
        }
      });
    });
    panel.querySelector('[data-physics-reset]').addEventListener('click', () => {
      settings = { ...DEFAULTS };
      apply();
    });
    apply();
    console.info('[Coaster Physics Tuning v13.8] installed', {
      maxGimmicks: 128, maxCourseLength: 5000,
      tunnelDefinitions: tunnelEntries.map(entry => entry.id).concat(constantTunnelNames),
      twistDefinitions: twistEntries.map(entry => entry.id).concat(constantTwistNames),
      settings
    });
  }
`;

    loader = replaceOnce(loader, '  const importRE =', injectedHelpers + '\n  const importRE =', '物理調整機能の追加');
    loader = replaceOnce(loader, '    let patchedMain = mainSource;', '    let patchedMain = patchWaterMain(mainSource);', '現行 main.js の水量処理');
    loader = replaceOnce(
      loader,
      'get sim() { return co ? co.sim : null; }, get cameraMode() { return cam.mode; },',
      'get sim() { return co ? co.sim : null; }, get trackModule() { return COASTER_TRACK; }, get cameraMode() { return cam.mode; },',
      '現行 track.js のランタイム参照'
    );
    loader = replaceOnce(
      loader,
      '      source = source.replace(/import\\.meta\\.url/g, JSON.stringify(url));',
      "      if (url === new URL('sim.js', GAME_BASE).href) source = patchSimSource(source);\n      source = source.replace(/import\\.meta\\.url/g, JSON.stringify(url));",
      '現行 sim.js の乗客耐久判定'
    );
    loader = replaceOnce(
      loader,
      '    await import(blobMap.get(gameMainUrl));',
      '    await import(blobMap.get(gameMainUrl));\n    await installPhysicsTuning(window.__coasterExpansionRuntime);',
      '既存編集UIへの物理調整タブ追加'
    );

    loader = loader.replace(
      "console.info('[Coaster Expansion Standalone v13.8] 起動完了：現行ゲーム '",
      "console.info('[Coaster Expansion + Physics Tuning v13.8] 起動完了：現行ゲーム '"
    );

    const blobUrl = URL.createObjectURL(new Blob([loader], { type: 'text/javascript;charset=utf-8' }));
    window[WRAPPER_KEY] = { version: '13.7', startedAt: Date.now(), blobUrl };
    await import(blobUrl);
    if (!window.__coasterExpansionStandaloneV138 || !window.__coasterExpansionRuntime) {
      throw new Error('現行ゲーム／既存拡張の起動確認に失敗しました。ページを再読み込みしてください。');
    }
    document.getElementById('coaster-physics-tuning-status')?.remove();
  } catch (error) {
    console.error('[Coaster Physics Tuning Launcher v13.8]', error);
    show('起動エラー：' + (error && error.message ? error.message : error) + '\n\nページを再読み込みすると元のゲームに戻ります。', true);
  }
})();
