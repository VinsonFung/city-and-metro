'use strict';
// 键位（v2.1）：全部快捷键集中定义，可在「设置 → 键位」自定义，保存在设置 keys 中。
// 按键按物理位置（KeyboardEvent.code）记录，不受输入法、大小写与 Shift 改变字符的影响；组合键写作 Ctrl+Shift+KeyZ。
// 每个操作最多两组按键；Esc（暂停菜单 / 返回）与 F11（全屏）固定，不可占用
(function (CM) {
  const GROUPS = [['time', '时间'], ['tool', '建设工具'], ['build', '建设草案'], ['camera', '镜头'], ['view', '视图'], ['ui', '界面']];
  // [操作, 名称, 分组, 默认按键]
  const ACTIONS = [
    ['pause', '暂停 / 继续', 'time', ['Space']],
    ['speed1', '正常速度（1×）', 'time', ['Digit1']],
    ['speed2', '3 倍速', 'time', ['Digit2']],
    ['speed3', '8 倍速', 'time', ['Digit3']],
    ['speed4', '24 倍速', 'time', ['Digit4']],
    ['time.peakSlow', '高峰慢放', 'time', ['KeyP']],
    ['jumpQuarter', '推进 3 个月', 'time', ['Comma']],
    ['jumpMonth', '推进 1 个月', 'time', ['Period']],
    ['jumpYear', '推进 1 年', 'time', ['Shift+Period']],
    ['tool.select', '选择', 'tool', ['KeyV']],
    ['tool.station', '建站', 'tool', ['KeyB']],
    ['tool.line', '绘线', 'tool', ['KeyL']],
    ['tool.edit', '修改', 'tool', ['KeyE']],
    ['tool.demolish', '拆除', 'tool', ['Delete', 'KeyX']],
    ['tool.measure', '测距', 'tool', ['KeyO']],
    ['build.finish', '结束本次绘线', 'build', ['Enter']],
    ['build.back', '撤回转弯点 / 草案上一步', 'build', ['Backspace']],
    ['build.undo', '撤销', 'build', ['Ctrl+KeyZ']],
    ['build.redo', '重做', 'build', ['Ctrl+KeyY', 'Ctrl+Shift+KeyZ']],
    ['build.confirm', '确认建设', 'build', ['Ctrl+Enter']],
    ['cam.up', '向上平移', 'camera', ['KeyW', 'ArrowUp']],
    ['cam.down', '向下平移', 'camera', ['KeyS', 'ArrowDown']],
    ['cam.left', '向左平移', 'camera', ['KeyA', 'ArrowLeft']],
    ['cam.right', '向右平移', 'camera', ['KeyD', 'ArrowRight']],
    ['cam.zoomIn', '放大', 'camera', ['Equal', 'NumpadAdd']],
    ['cam.zoomOut', '缩小', 'camera', ['Minus', 'NumpadSubtract']],
    ['cam.fit', '显示全图', 'camera', ['KeyF']],
    ['view.toggle', '切换 2D / 2.5D', 'view', ['KeyT']],
    ['view.under', '地下视图', 'view', ['KeyU']],
    ['view.netmap', '线路示意图', 'view', ['KeyK']],
    ['view.layer', '下一个分析图层', 'view', ['KeyC']],
    ['view.layerPrev', '上一个分析图层', 'view', ['Shift+KeyC']],
    ['view.grid', '经纬网格', 'view', ['KeyR']],
    ['view.gridSnap', '网格吸附', 'view', ['Shift+KeyR']],
    ['ui.search', '搜索', 'ui', ['Slash']],
    ['ui.tasks', '任务', 'ui', ['KeyJ']],
    ['ui.stats', '城市统计', 'ui', ['KeyG']],
    ['ui.save', '保存进度', 'ui', ['Ctrl+KeyS']],
    ['ui.theme', '浅色 / 深色模式', 'ui', ['KeyN']],
    ['ui.sound', '开关音效', 'ui', ['KeyM']],
    ['ui.hideUI', '沉浸模式（隐藏界面）', 'ui', ['KeyH']],
    ['ui.help', '操作说明', 'ui', ['F1']],
    ['ui.settings', '设置', 'ui', ['F10']],
  ];
  const RESERVED = { Escape: 'Esc 固定用于暂停菜单、返回与关闭', F11: 'F11 固定用于全屏', Tab: 'Tab 用于在界面控件间切换' };
  const BROWSER = new Set(['F5', 'F6', 'F12', 'Ctrl+KeyL', 'Ctrl+KeyR', 'Ctrl+Shift+KeyR', 'Ctrl+KeyW', 'Ctrl+Shift+KeyW', 'Ctrl+KeyT', 'Ctrl+Shift+KeyT', 'Ctrl+KeyN', 'Ctrl+Shift+KeyN', 'Ctrl+KeyJ', 'Ctrl+KeyP', 'Ctrl+Shift+KeyI', 'Ctrl+Shift+KeyJ', 'Ctrl+Shift+KeyC', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+F4']);
  const MODS = { ShiftLeft: 1, ShiftRight: 1, ControlLeft: 1, ControlRight: 1, AltLeft: 1, AltRight: 1, MetaLeft: 1, MetaRight: 1, OSLeft: 1, OSRight: 1 };
  const NAMES = {
    Space: '空格', Enter: 'Enter', NumpadEnter: '小键盘 Enter', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Slash: '/', Backslash: '\\', Equal: '=', Minus: '−', Period: '.', Comma: ',', Semicolon: ';', Quote: '\'',
    BracketLeft: '[', BracketRight: ']', Backquote: '`', NumpadAdd: '小键盘 +', NumpadSubtract: '小键盘 −', NumpadMultiply: '小键盘 ×', NumpadDivide: '小键盘 ÷', NumpadDecimal: '小键盘 .', IntlBackslash: '\\',
  };
  const byId = {};
  ACTIONS.forEach(function (a) { byId[a[0]] = { id: a[0], name: a[1], group: a[2], def: a[3] }; });

  const Keys = { GROUPS: GROUPS, ACTIONS: ACTIONS.map(function (a) { return byId[a[0]]; }), RESERVED: RESERVED };
  CM.Keys = Keys;
  Keys.reserved = function (combo) { const code = String(combo).split('+').pop(); return RESERVED[code] || (BROWSER.has(combo) ? '该按键由浏览器或系统使用，请选择其他按键' : null); };
  const valid = function (combo) { return typeof combo === 'string' && /^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:Key[A-Z]|Digit[0-9]|Numpad\w+|Arrow(?:Up|Down|Left|Right)|F[1-9][0-9]?|Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Slash|Backslash|Equal|Minus|Period|Comma|Semicolon|Quote|BracketLeft|BracketRight|Backquote|IntlBackslash)$/.test(combo) && !Keys.reserved(combo); };
  let lookup = null, bindings = null;
  const custom = function () { const k = CM.Settings && CM.Settings.get('keys'); return k && typeof k === 'object' ? k : {}; };
  function resolve() {
    if (lookup) return;
    lookup = new Map(); bindings = {};
    const cfg = custom();
    for (const a of Keys.ACTIONS) bindings[a.id] = [];
    for (const isCustom of [true, false]) for (const a of Keys.ACTIONS) {
      const raw = cfg[a.id], clean = Array.isArray(raw) ? raw.filter(valid).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).slice(0, 2) : null;
      const customized = !!clean && (!raw.length || clean.length > 0);
      if (customized !== isCustom) continue;
      for (const combo of customized ? clean : a.def) if (!lookup.has(combo)) { lookup.set(combo, a.id); bindings[a.id].push(combo); }
    }
  }
  Keys.get = function (id) { resolve(); return (bindings[id] || []).slice(); };
  Keys.isDefault = function (id) { const a = byId[id], c = Keys.get(id); return !!a && c.length === a.def.length && c.every(function (v, i) { return v === a.def[i]; }); };
  Keys.set = function (id, combos) {
    if (!byId[id] || !Array.isArray(combos) || combos.some(function (c) { return !valid(c); })) return false;
    combos = combos.filter(function (c, i) { return combos.indexOf(c) === i; }).slice(0, 2);
    const k = Object.assign({}, custom());
    for (const a of Keys.ACTIONS) if (a.id !== id) {
      const old = Keys.get(a.id), next = old.filter(function (c) { return combos.indexOf(c) < 0; });
      if (next.length !== old.length) k[a.id] = next;
    }
    const def = byId[id].def;
    if (combos.length === def.length && combos.every(function (c, i) { return c === def[i]; })) delete k[id]; else k[id] = combos.slice(0, 2);
    CM.Settings.set('keys', k);
    return true;
  };
  Keys.reset = function (id) { if (byId[id]) Keys.set(id, byId[id].def); };
  Keys.resetAll = function () { CM.Settings.set('keys', {}); };
  Keys.invalidate = function () { lookup = null; bindings = null; };
  // 按下的组合键（只按了修饰键时为 null）
  Keys.comboOf = function (e) {
    const code = e.code || '';
    if (!code || MODS[code]) return null;
    let s = '';
    if (e.ctrlKey || e.metaKey) s += 'Ctrl+';
    if (e.altKey) s += 'Alt+';
    if (e.shiftKey) s += 'Shift+';
    return s + code;
  };
  // 组合键 → 操作（同一组合键只对应一个操作，设置时会解除冲突）
  Keys.match = function (e) {
    resolve();
    const c = Keys.comboOf(e);
    if (!c) return null;
    return lookup.get(c) || (e.shiftKey && lookup.get(c.replace('Shift+', '')) === 'view.layer' ? 'view.layer' : null);
  };
  // 持续平移匹配物理键及组合键；没有专用 Shift 绑定时保留原有 Shift+平移操作。
  Keys.held = function (id, codes, mods) {
    mods = mods || {};
    for (const c of Keys.get(id)) {
      const parts = c.split('+'), code = parts.pop();
      const shifted = !!mods.shift === parts.includes('Shift') || (!!mods.shift && !parts.includes('Shift') && !Keys.owner((mods.ctrl ? 'Ctrl+' : '') + (mods.alt ? 'Alt+' : '') + 'Shift+' + code));
      if (codes.has(code) && !!mods.ctrl === parts.includes('Ctrl') && !!mods.alt === parts.includes('Alt') && shifted) return true;
    }
    return false;
  };
  Keys.owner = function (combo, except) { for (const a of Keys.ACTIONS) if (a.id !== except && Keys.get(a.id).indexOf(combo) >= 0) return a; return null; };
  Keys.codeLabel = function (code) {
    if (NAMES[code]) return NAMES[code];
    let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
    m = /^Digit(\d)$/.exec(code); if (m) return m[1];
    m = /^Numpad(\d)$/.exec(code); if (m) return '小键盘 ' + m[1];
    return code;
  };
  Keys.label = function (combo) {
    if (!combo) return '';
    const parts = combo.split('+'), code = parts.pop();
    return parts.concat([Keys.codeLabel(code)]).join('+');
  };
  // 提示用：第一组按键（未设置时为空）
  Keys.hint = function (id) { const c = Keys.get(id); return c.length ? Keys.label(c[0]) : ''; };
  Keys.hints = function (id, sep) { return Keys.get(id).map(Keys.label).join(sep || ' / '); };
  Keys.name = function (id) { return byId[id] ? byId[id].name : id; };
  if (CM.Settings) CM.Settings.on(function (k) { if (k === 'keys') { Keys.invalidate(); if (Keys.onChange) Keys.onChange(); } });
})(window.CM);
