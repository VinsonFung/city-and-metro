'use strict';
// 色盲辅助只处理显示，不改线路原色、交通计算、存档或建设线型。
(function (CM) {
  const U = CM.U;
  const PALETTE = ['#0072b2', '#d55e00', '#009e73', '#9c4f96', '#9a6700', '#5145a0', '#006b70', '#555555'];
  const DARK = ['#56b4e9', '#f0a550', '#70cba4', '#dfa5d1', '#edc44e', '#aaa0ee', '#60cbd0', '#e0e0e0'];
  const STATUS = ['#0072b2', '#a66a00', '#9951a0', '#44235b'];
  const DASH = ['', '9 4', '2 4', '10 3 2 3', '5 3', '12 4', '2 3 7 3', '6 3 2 3'];
  const DASH_NAME = ['实线', '长虚线', '点线', '点划线', '短虚线', '宽虚线', '点长线', '短点划线'];
  const colors = new Map(), rgb = new Map();
  const group = function (target, sources) { for (const source of sources.split(' ')) { colors.set(source, target); rgb.set(U.hex2rgb(source).join(','), U.hex2rgb(target)); } };
  group(STATUS[0], '#33a660 #2fa36b #2f9d64 #2e9d57 #1aa266 #14a252 #289f5a #28a05a #1f8fbf #2166cc #3468d6');
  group(STATUS[1], '#f2bf3a #f27a24 #e8a33a #f0a020 #eca032 #f0963c #ef8a3a');
  group(STATUS[2], '#d3203a #d63031 #d93a3a #d93636 #d63636 #d73027 #d73031 #d63434 #d63030 #d93030 #c62828 #c0392b #e03131 #d93a3a');
  group(STATUS[2], '#f27a24');
  group(STATUS[3], '#7a1f1f #d3203a');
  group('#145780', '#1b7837 #1b8c46');
  group('#5298bc', '#5aae61 #5ab464');
  group('#a6cee2', '#acdc8c #a0d682');
  group('#e0edf5', '#ffe296 #ffd6aa');
  group('#6d9fc5', '#f99e4c #ec7048');
  group('#184b7d', '#de5434 #b41822');
  const nightColors = { '#0072b2': '#56b4e9', '#a66a00': '#edc44e', '#9951a0': '#dfa5d1', '#44235b': '#aa87d1', '#145780': '#84c9ec', '#5298bc': '#5196bd', '#a6cee2': '#315979', '#e0edf5': '#22466b', '#6d9fc5': '#6d9fc5', '#184b7d': '#b4def4' };
  const nightRGB = new Map(Object.keys(nightColors).map(function (c) { return [U.hex2rgb(c).join(','), U.hex2rgb(nightColors[c])]; }));
  const night = function () { return document.documentElement.dataset.theme === 'dark'; };
  const display = function (c) { return night() ? (nightColors[c] || c) : c; };
  const enabled = function () { return !!(CM.Settings && CM.Settings.get('colorBlind')); };
  const A = {
    enabled: enabled,
    flag: function () { return enabled() ? 'cb' : 'normal'; },
    palette: function () { return (night() ? DARK : PALETTE).slice(); },
    statuses: function () { return STATUS.map(display); },
    number: function (line) { return CM.Metro && line.name ? CM.Metro.lineBadge(line) : String(line.num || line.id || '?'); },
    line: function (line) {
      if (!line) return '#555555';
      if (!enabled()) return line.color;
      // 预测摘要可能只带线路 id；取显示时的编号，不能误把全网对象 id 当成线路编号。
      if (!line.num && line.id && CM.game) {
        const net = CM.game.draft ? CM.game.draft.net : CM.game.net;
        line = net.lines[line.id] || CM.game.net.lines[line.id] || line;
      }
      const n = Number.isFinite(+line.num) && +line.num > 0 ? Math.floor(+line.num) : (parseInt(String(line.id || '').slice(1), 10) || 1);
      return (night() ? DARK : PALETTE)[((n - 1) % PALETTE.length + PALETTE.length) % PALETTE.length];
    },
    color: function (value) {
      if (!enabled() || typeof value !== 'string') return value;
      const c = value.toLowerCase(), hex = c.match(/^(#[\da-f]{6})([\da-f]{2})?$/);
      if (hex) return display(colors.get(hex[1]) || hex[1]) + (hex[2] || '');
      const m = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/);
      if (m) { const col = A.rgb([+m[1], +m[2], +m[3]]); return m[4] === undefined ? 'rgb(' + col.join(',') + ')' : 'rgba(' + col.join(',') + ',' + m[4] + ')'; }
      return value;
    },
    rgb: function (value) { if (!enabled()) return value; const c = rgb.get(value.join(',')) || value; return night() ? (nightRGB.get(c.join(',')) || c) : c; },
    ramp: function (stops, t) { return U.ramp(enabled() ? stops.map(function (s) { return [s[0], A.rgb(s[1])]; }) : stops, t); },
    mix: function (a, b, t) { return U.mixc(A.rgb(a), A.rgb(b), t); },
    category: function (index, original) { return enabled() ? (night() ? DARK : PALETTE)[index % PALETTE.length] : original; },
    dash: function (index) { return enabled() ? DASH[index % DASH.length] : ''; },
    dashName: function (index) { return DASH_NAME[index % DASH_NAME.length]; },
    pointOn: function (points, fraction) {
      let total = 0; for (let i = 1; i < points.length; i++) total += U.dist(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
      let left = total * fraction;
      for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i], d = U.dist(a[0], a[1], b[0], b[1]); if (d > 0 && left <= d) return [a[0] + (b[0] - a[0]) * left / d, a[1] + (b[1] - a[1]) * left / d]; left -= d; }
      return points[points.length - 1];
    },
    ink: function (color) {
      if (!enabled()) return '#ffffff';
      const c = U.hex2rgb(color).map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722 > 0.179 ? '#000000' : '#ffffff';
    },
    // 线图 / 地图编号：同色重复时仍可按数字区分，字色按底色亮度选择。
    svgBadge: function (line, x, y) {
      const text = U.esc(A.number(line)), w = Math.max(22, text.length * 8 + 10), col = A.line(line);
      return '<g class="a11y-line-id" data-line="' + U.esc(line.id) + '"><rect x="' + (x - w / 2).toFixed(2) + '" y="' + (y - 9).toFixed(2) + '" width="' + w + '" height="18" rx="6" fill="' + col + '" stroke="#fff" stroke-width="2"/><text x="' + x.toFixed(2) + '" y="' + (y + 4).toFixed(2) + '" text-anchor="middle" font-size="12" font-weight="800" fill="' + A.ink(col) + '">' + text + '</text></g>';
    },
    patternCSS: function (index) { return enabled() ? ['repeating-linear-gradient(45deg,transparent 0 4px,rgba(255,255,255,.7) 4px 5px)', 'repeating-linear-gradient(-45deg,transparent 0 4px,rgba(255,255,255,.7) 4px 5px)', 'repeating-linear-gradient(0deg,transparent 0 4px,rgba(255,255,255,.7) 4px 5px)', 'radial-gradient(rgba(255,255,255,.8) 1px,transparent 1.5px)'][index % 4] : ''; },
  };
  CM.Accessibility = A;
})(window.CM);
