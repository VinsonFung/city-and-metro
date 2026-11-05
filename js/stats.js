'use strict';
// 统计面板：概览指标卡 + 交通 / 城市 / 财政 / 线路图表（SVG，悬停十字线与提示、图例、表格视图）
(function (CM) {
  const AX = CM.Accessibility;
  const U = CM.U;
  const h = U.h;
  // 分类色（固定顺序，不循环）：浅色 / 深色各自一套
  const PALETTE = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  };
  const TABS = [['overview', '概览', 'chart'], ['traffic', '交通', 'metro'], ['econ', '经济', 'trend'], ['finance', '财政', 'wallet'], ['milestones', '城市纪事', 'book']];
  let patternSerial = 0;
  let ui = null, tab = 'overview', range = 'all', isOpen = false, charts = [], body = null, sig = '';

  function pal() { return AX.enabled() ? AX.palette() : PALETTE[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light']; }
  function game() { return ui && ui.g ? ui.g() : CM.game; }
  function esc(s) { return U.esc ? U.esc(String(s)) : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- 数据 ----------
  function liveRec(g) {
    const d = g.model.daily || {}, tot = g.city.totals();
    return {
      y: g.clock.y, m: g.clock.m, d: g.clock.d, live: true, pop: tot.pop, jobs: tot.jobs, share: d.metroShare || 0,
      cong: d.cong || 1, commute: d.commute || 0, riders: d.metro || 0, sat: g.econ.sat, funds: g.econ.isFree() ? null : g.econ.funds, debt: g.econ.isFree() ? null : g.econ.debtTotal(), capex: g.econ.isFree() ? null : g.econ.capex,
      coverage: d.coverage || 0, stations: g.compiled.stations.length, crowd: d.crowdShare || 0,
    };
  }
  function timeline(g) {
    let H = g.history.slice();
    H.push(liveRec(g));
    if (range !== 'all') H = H.slice(-(+range) - 1);
    return H;
  }
  function recLabel(r) { return r.live ? '当前 · ' + r.y + '年' + r.m + '月' + r.d + '日' : r.y + '年' + r.m + '月'; }
  function pick(H, key) { return H.map(function (r) { const v = r[key]; return v == null || !isFinite(v) ? null : v; }); }

  // ---------- 刻度 ----------
  function niceTicks(lo, hi, n) {
    if (!(hi > lo)) { hi = lo + (Math.abs(lo) || 1); }
    const step0 = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), r = step0 / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
    const t = []; for (let v = a; v <= b + step * 1e-6; v += step) t.push(+v.toFixed(10));
    return { lo: a, hi: b, ticks: t };
  }

  // ---------- 图表外壳：标题、副标题、图例、表格切换、提示框 ----------
  function shell(o, legendItems) {
    const card = h('div', { class: 'chart-card' + (o.wide ? ' wide' : '') });
    const plot = h('div', { class: 'ch-plot' });
    const tip = h('div', { class: 'ch-tip' });
    const tbl = h('div', { class: 'ch-tbl', style: { display: 'none' } });
    let tableOn = false;
    const tBtn = null;
    card.append(h('div', { class: 'ch-head' }, o.icon ? CM.icon(o.icon, 16, 'muted') : null, h('div', { class: 'ch-title' }, o.title), tBtn));
    if (o.sub) card.appendChild(h('div', { class: 'ch-sub' }, o.sub));
    if (legendItems && legendItems.length >= 2) card.appendChild(h('div', { class: 'ch-legend' }, legendItems.map(function (it, k) { return h('span', null, AX.enabled() && !it.sq ? h('span', { html: '<svg width="28" height="12" aria-hidden="true"><path d="M1 6H27" stroke="' + it.color + '" stroke-width="2.5" stroke-dasharray="' + AX.dash(k) + '"/></svg>' }) : h('i', { class: it.sq ? 'sq' : '', style: { background: it.color, backgroundImage: AX.enabled() && it.sq ? AX.patternCSS(k) : '', backgroundSize: '8px 8px' } }), it.name + (AX.enabled() && !it.sq ? '（' + AX.dashName(k) + '）' : '')); })));
    card.append(plot, tbl);
    return { card: card, plot: plot, tip: tip };
  }
  function showTip(sh, html, x, y) {
    const tip = sh.tip;
    tip.innerHTML = html; tip.style.opacity = '1';
    const W = sh.plot.clientWidth, tw = tip.offsetWidth;
    tip.style.left = (x + 14 + tw > W ? Math.max(0, x - tw - 14) : x + 14) + 'px';
    tip.style.top = Math.max(0, y) + 'px';
  }
  function hideTip(sh) { sh.tip.style.opacity = '0'; }
  function tipRows(title, rows) {
    return '<div class="tt">' + esc(title) + '</div>' + rows.map(function (r) { return '<div class="tr">' + (r.color ? '<i style="background:' + r.color + '"></i>' : '') + '<span>' + esc(r.name) + '</span><b style="margin-left:auto;padding-left:10px">' + esc(r.v) + '</b></div>'; }).join('');
  }
  function emptyState(sh, text) { sh.plot.innerHTML = ''; sh.plot.appendChild(h('div', { class: 'empty-chart' }, text)); }

  // ---------- 折线 / 面积图（单一纵轴） ----------
  function lineChart(o) {
    const sh = shell(Object.assign({}, o, { table: function () { return seriesTable(o); } }), o.series.map(function (s) { return { name: s.name, color: s.color }; }));
    const draw = function () {
      const n = o.labels.length;
      let cnt = 0, lo = Infinity, hi = -Infinity;
      for (const s of o.series) for (const v of s.vals) if (v != null) { cnt++; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (cnt < 2 || n < 2) { emptyState(sh, o.empty || '至少需要两个月的记录。继续运营后这里会显示趋势。'); return; }
      if (o.min0 !== false) lo = Math.min(0, lo);
      if (o.refs) for (const r of o.refs) { if (r.v > hi) hi = r.v; if (r.v < lo) lo = r.v; }
      if (o.max != null) hi = Math.min(Math.max(hi, lo + 1e-6), o.max);
      if (o.int && hi - lo < 4) hi = lo + 4;      // 计数类数据：刻度取整数
      const W = Math.max(260, sh.plot.clientWidth || 420), Hh = o.height || 170;
      const pl = 48, pr = 14, pt = 10, pb = 22;
      const nt = niceTicks(lo, hi, 4);
      const X = function (i) { return pl + i / (n - 1) * (W - pl - pr); };
      const Y = function (v) { return pt + (1 - (v - nt.lo) / (nt.hi - nt.lo)) * (Hh - pt - pb); };
      const af = o.axisFmt || o.fmt;
      let s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" height="' + Hh + '" font-size="10.5">';
      for (const t of nt.ticks) {
        const y = Y(t).toFixed(1);
        s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(' + (t === 0 ? '--line-strong' : '--line') + ')" stroke-width="1"/>';
        s += '<text x="' + (pl - 6) + '" y="' + y + '" dy="3.5" text-anchor="end" style="fill:var(--muted)">' + esc(af(t)) + '</text>';
      }
      const nx = Math.min(6, n), seen = {};
      for (let q = 0; q < nx; q++) {
        const i = Math.round(q / (nx - 1) * (n - 1)); if (seen[i]) continue; seen[i] = 1;
        const lab = o.xs[i], anc = q === 0 ? 'start' : (q === nx - 1 ? 'end' : 'middle');
        s += '<text x="' + X(i).toFixed(1) + '" y="' + (Hh - 5) + '" text-anchor="' + anc + '" style="fill:var(--muted)">' + esc(lab) + '</text>';
      }
      if (o.refs) for (const r of o.refs) {
        const y = Y(r.v).toFixed(1);
        s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--faint)" stroke-dasharray="4 4" stroke-width="1"/>';
        s += '<text x="' + (W - pr) + '" y="' + y + '" dy="-4" text-anchor="end" style="fill:var(--muted)">' + esc(r.label) + '</text>';
      }
      o.series.forEach(function (sr, seriesIndex) {
        let d = '', pen = false, first = -1, last = -1;
        for (let i = 0; i < n; i++) {
          const v = sr.vals[i];
          if (v == null) { pen = false; continue; }
          const x = X(i).toFixed(1), y = Y(v).toFixed(1);
          if (!pen) { d += 'M' + x + ' ' + y; pen = true; if (first < 0) first = i; }
          else if (o.step) d += 'H' + x + 'V' + y; else d += 'L' + x + ' ' + y;
          last = i;
        }
        if (o.area && o.series.length === 1 && first >= 0) {
          const y0 = Y(Math.max(nt.lo, 0)).toFixed(1);
          s += '<path d="' + d + 'L' + X(last).toFixed(1) + ' ' + y0 + 'L' + X(first).toFixed(1) + ' ' + y0 + 'Z" fill="' + sr.color + '" fill-opacity="0.1"/>';
        }
        s += '<path d="' + d + '" fill="none" stroke="' + sr.color + '"' + (AX.enabled() ? ' stroke-dasharray="' + AX.dash(seriesIndex) + '"' : '') + ' stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
        if (last >= 0) s += '<circle cx="' + X(last).toFixed(1) + '" cy="' + Y(sr.vals[last]).toFixed(1) + '" r="4" fill="' + sr.color + '" style="stroke:var(--surface-solid)" stroke-width="2"/>';
      });
      s += '<g class="hov" style="display:none"><line y1="' + pt + '" y2="' + (Hh - pb) + '" style="stroke:var(--line-strong)" stroke-width="1"/>' + o.series.map(function (sr) { return '<circle r="4.5" fill="' + sr.color + '" style="stroke:var(--surface-solid)" stroke-width="2"/>'; }).join('') + '</g>';
      s += '<rect x="' + pl + '" y="0" width="' + (W - pl - pr) + '" height="' + Hh + '" fill="transparent"/></svg>';
      sh.plot.innerHTML = s; sh.plot.appendChild(sh.tip);
      const hov = sh.plot.querySelector('.hov'), hl = hov.querySelector('line'), dots = hov.querySelectorAll('circle');
      sh.plot.onmousemove = function (e) {
        const r = sh.plot.getBoundingClientRect(), sx = (e.clientX - r.left) * W / r.width;
        const i = U.clamp(Math.round((sx - pl) / (W - pl - pr) * (n - 1)), 0, n - 1);
        const x = X(i);
        hov.style.display = ''; hl.setAttribute('x1', x); hl.setAttribute('x2', x);
        const rows = [];
        o.series.forEach(function (sr, k) {
          const v = sr.vals[i];
          if (v == null) { dots[k].style.display = 'none'; } else { dots[k].style.display = ''; dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', Y(v)); }
          rows.push({ name: sr.name, color: sr.color, v: v == null ? '—' : o.fmt(v) });
        });
        showTip(sh, tipRows(o.tips[i], rows), x * r.width / W, 4);
      };
      sh.plot.onmouseleave = function () { hov.style.display = 'none'; hideTip(sh); };
    };
    charts.push(draw);
    sh.card._draw = draw;
    return sh.card;
  }
  function seriesTable(o) {
    const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '时间'), o.series.map(function (s) { return h('th', null, s.name); })));
    for (let i = o.labels.length - 1, c = 0; i >= 0 && c < 240; i--, c++) t.appendChild(h('tr', null, h('td', null, o.tips[i]), o.series.map(function (s) { return h('td', null, s.vals[i] == null ? '—' : o.fmt(s.vals[i])); })));
    return t;
  }

  // ---------- 堆叠柱状图（正值；段间留 2px 间隙） ----------
  function stackChart(o) {
    const sh = shell(Object.assign({}, o, { table: function () {
      const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, o.periodName || '时间'), o.series.map(function (s) { return h('th', null, s.name); }), h('th', null, '合计')));
      for (let i = o.labels.length - 1; i >= 0; i--) { let tot = 0; for (const s of o.series) tot += s.vals[i] || 0; t.appendChild(h('tr', null, h('td', null, o.labels[i]), o.series.map(function (s) { return h('td', null, o.fmt(s.vals[i] || 0)); }), h('td', null, o.fmt(tot)))); }
      return t;
    } }), o.series.map(function (s) { return { name: s.name, color: s.color, sq: true }; }));
    const draw = function () {
      const n = o.labels.length;
      if (!n) { emptyState(sh, o.empty || '尚无完整月份的记录。'); return; }
      const tots = o.labels.map(function (_, i) { let t = 0; for (const s of o.series) t += Math.max(0, s.vals[i] || 0); return t; });
      const hi = Math.max.apply(null, tots);
      const W = Math.max(260, sh.plot.clientWidth || 420), Hh = o.height || 180;
      const pl = 48, pr = 10, pt = 10, pb = 22;
      const patternPrefix = 'cb-stack-' + (++patternSerial);
      const nt = niceTicks(0, hi > 0 ? hi : 1, 4);
      const Y = function (v) { return pt + (1 - v / nt.hi) * (Hh - pt - pb); };
      const slot = (W - pl - pr) / n, bw = Math.max(2, Math.min(26, slot * 0.68));
      const X = function (i) { return pl + slot * (i + 0.5); };
      let s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" height="' + Hh + '" font-size="10.5">';
      if (AX.enabled()) s += '<defs>' + o.series.map(function (sr, k) { const shapes = ['<path d="M-2 2L2-2M0 8L8 0M6 10L10 6"/>', '<path d="M-2 6L2 10M0 0L8 8M6-2L10 2"/>', '<path d="M0 4H8"/>', '<circle cx="4" cy="4" r="1" fill="#fff"/>']; return '<pattern id="' + patternPrefix + '-' + k + '" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="' + sr.color + '"/><g stroke="#fff" stroke-opacity=".7" stroke-width="1">' + shapes[k % 4] + '</g></pattern>'; }).join('') + '</defs>';
      for (const t of nt.ticks) { const y = Y(t).toFixed(1); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(' + (t === 0 ? '--line-strong' : '--line') + ')"/><text x="' + (pl - 6) + '" y="' + y + '" dy="3.5" text-anchor="end" style="fill:var(--muted)">' + esc(o.axisFmt(t)) + '</text>'; }
      const nx = Math.min(n, Math.max(2, Math.floor((W - pl) / 64))), seen = {};
      for (let q = 0; q < nx; q++) { const i = nx === 1 ? 0 : Math.round(q / (nx - 1) * (n - 1)); if (seen[i]) continue; seen[i] = 1; s += '<text x="' + X(i).toFixed(1) + '" y="' + (Hh - 5) + '" text-anchor="middle" style="fill:var(--muted)">' + esc(o.xs[i]) + '</text>'; }
      for (let i = 0; i < n; i++) {
        let acc = 0;
        s += '<g class="col" data-i="' + i + '">';
        o.series.forEach(function (sr, k) {
          const v = Math.max(0, sr.vals[i] || 0); if (v <= 0) return;
          const y1 = Y(acc), y2 = Y(acc + v); acc += v;
          let top = y2, hh = y1 - y2;
          if (acc < tots[i] - 1e-9 && hh > 3) { top += 2; hh -= 2; }
          s += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.8, hh).toFixed(1) + '" rx="' + Math.min(3, bw / 4) + '" fill="' + (AX.enabled() ? 'url(#' + patternPrefix + '-' + k + ')' : sr.color) + '"/>';
        });
        s += '</g>';
      }
      s += '<rect class="hit" x="' + pl + '" y="0" width="' + (W - pl - pr) + '" height="' + Hh + '" fill="transparent"/></svg>';
      sh.plot.innerHTML = s; sh.plot.appendChild(sh.tip);
      const cols = sh.plot.querySelectorAll('.col');
      sh.plot.onmousemove = function (e) {
        const r = sh.plot.getBoundingClientRect(), sx = (e.clientX - r.left) * W / r.width;
        const i = U.clamp(Math.floor((sx - pl) / slot), 0, n - 1);
        cols.forEach(function (c, k) { c.style.opacity = k === i ? '1' : '0.45'; });
        const rows = o.series.map(function (sr) { return { name: sr.name, color: sr.color, v: o.fmt(sr.vals[i] || 0) }; });
        rows.push({ name: '合计', v: o.fmt(tots[i]) });
        showTip(sh, tipRows(o.labels[i], rows), X(i) * r.width / W, 4);
      };
      sh.plot.onmouseleave = function () { cols.forEach(function (c) { c.style.opacity = '1'; }); hideTip(sh); };
    };
    charts.push(draw);
    return sh.card;
  }

  // ---------- 增长率柱状图（正负柱；游戏结果、预测与史实参考分开标识） ----------
  // o.items: [{ lab, x, v（游戏结果或预测）, fc（是否预测）, ref: { v, kind } }]
  function growthChart(o) {
    const P = pal();
    const legend = [{ name: '游戏结果（实际增长）', color: P[0], sq: true }, { name: '本年预测', color: P[3], sq: true }];
    if (o.refLabel) legend.push({ name: o.refLabel + '（参考）', color: P[1] });
    const sh = shell(o, legend);
    const draw = function () {
      const items = o.items, n = items.length;
      if (!n) { emptyState(sh, o.empty || '第一个完整年度在明年 1 月结算后显示。'); return; }
      let lo = 0, hi = 0.02;
      for (const it of items) { if (it.v != null) { lo = Math.min(lo, it.v); hi = Math.max(hi, it.v); } if (it.ref) { lo = Math.min(lo, it.ref.v); hi = Math.max(hi, it.ref.v); } }
      const W = Math.max(260, sh.plot.clientWidth || 420), Hh = o.height || 180, pl = 44, pr = 10, pt = 10, pb = 22;
      const nt = niceTicks(lo, hi, 4);
      const Y = function (v) { return pt + (1 - (v - nt.lo) / (nt.hi - nt.lo)) * (Hh - pt - pb); };
      const slot = (W - pl - pr) / n, bw = Math.max(2, Math.min(22, slot * 0.62));
      const X = function (i) { return pl + slot * (i + 0.5); };
      let s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" height="' + Hh + '" font-size="10.5">';
      s += '<defs><pattern id="fcHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="' + P[3] + '" fill-opacity="0.25"/><line x1="0" y1="0" x2="0" y2="5" stroke="' + P[3] + '" stroke-width="2"/></pattern></defs>';
      for (const t of nt.ticks) { const y = Y(t).toFixed(1); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(' + (Math.abs(t) < 1e-9 ? '--line-strong' : '--line') + ')"/><text x="' + (pl - 6) + '" y="' + y + '" dy="3.5" text-anchor="end" style="fill:var(--muted)">' + esc(Math.round(t * 100) + '%') + '</text>'; }
      const nx = Math.min(n, Math.max(2, Math.floor((W - pl) / 54))), seen = {};
      for (let q = 0; q < nx; q++) { const i = nx === 1 ? 0 : Math.round(q / (nx - 1) * (n - 1)); if (seen[i]) continue; seen[i] = 1; s += '<text x="' + X(i).toFixed(1) + '" y="' + (Hh - 5) + '" text-anchor="middle" style="fill:var(--muted)">' + esc(items[i].x) + '</text>'; }
      const y0 = Y(0);
      items.forEach(function (it, i) {
        s += '<g class="col">';
        if (it.v != null) {
          const y1 = Y(it.v), top = Math.min(y0, y1), hh = Math.max(0.8, Math.abs(y1 - y0));
          s += '<rect x="' + (X(i) - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="' + Math.min(3, bw / 4) + '" fill="' + (it.fc ? 'url(#fcHatch)' : (it.v >= 0 ? P[0] : P[7])) + '"' + (it.fc ? ' stroke="' + P[3] + '" stroke-dasharray="3 2"' : '') + '/>';
        }
        if (it.ref) {
          const yr = Y(it.ref.v).toFixed(1);
          if (it.ref.kind === 'period') s += '<line x1="' + (X(i) - slot / 2).toFixed(1) + '" x2="' + (X(i) + slot / 2).toFixed(1) + '" y1="' + yr + '" y2="' + yr + '" stroke="' + P[1] + '" stroke-width="2" stroke-dasharray="4 3"/>';
          else s += '<path d="M' + X(i).toFixed(1) + ' ' + (yr - 4.5) + 'l4.5 4.5-4.5 4.5-4.5-4.5z" fill="' + P[1] + '" style="stroke:var(--surface-solid)" stroke-width="1.2"/>';
        }
        s += '</g>';
      });
      s += '<rect class="hit" x="' + pl + '" y="0" width="' + (W - pl - pr) + '" height="' + Hh + '" fill="transparent"/></svg>';
      sh.plot.innerHTML = s; sh.plot.appendChild(sh.tip);
      const cols = sh.plot.querySelectorAll('.col');
      sh.plot.onmousemove = function (e) {
        const r = sh.plot.getBoundingClientRect(), sx = (e.clientX - r.left) * W / r.width;
        const i = U.clamp(Math.floor((sx - pl) / slot), 0, n - 1), it = items[i];
        cols.forEach(function (c, k) { c.style.opacity = k === i ? '1' : '0.5'; });
        const rows = [{ name: it.fc ? '本年预测' : '游戏结果', color: it.fc ? P[3] : P[0], v: it.v == null ? '—' : (it.v * 100).toFixed(1) + '%' }];
        if (it.ref) rows.push({ name: o.refLabel + (it.ref.kind === 'period' ? '（' + it.ref.from + '–' + it.ref.to + ' 年平均）' : ''), color: P[1], v: (it.ref.kind === 'year' ? '' : '约 ') + (it.ref.v * 100).toFixed(1) + '%' });
        showTip(sh, tipRows(it.lab, rows), X(i) * r.width / W, 4);
      };
      sh.plot.onmouseleave = function () { cols.forEach(function (c) { c.style.opacity = '1'; }); hideTip(sh); };
    };
    charts.push(draw);
    return sh.card;
  }

  // ---------- 横向条形图（排名；线路用线路自身颜色） ----------
  function hbarChart(o) {
    const sh = shell(Object.assign({}, o, { table: function () {
      const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, o.nameCol || '名称'), h('th', null, o.valCol || '数值'), o.extraCol ? h('th', null, o.extraCol) : null));
      for (const it of o.items) t.appendChild(h('tr', null, h('td', null, it.name), h('td', null, o.fmt(it.v)), o.extraCol ? h('td', null, it.extra || '') : null));
      return t;
    } }), null);
    const draw = function () {
      sh.plot.innerHTML = '';
      if (!o.items.length) { emptyState(sh, o.empty || '暂无数据'); return; }
      const max = Math.max.apply(null, o.items.map(function (it) { return it.v; })) || 1;
      const box = h('div', { class: 'hbars' });
      o.items.forEach(function (it, k) {
        const row = h('div', { class: 'hbar-row' },
          h('div', { class: 'hbar-name' }, it.sw ? h('i', { style: { background: it.sw } }) : null, h('span', null, it.name)),
          h('div', { class: 'hbar-track' }, h('div', { class: 'hbar-fill', style: { width: Math.max(0.6, it.v / max * 100) + '%', background: it.color } })),
          h('div', { class: 'hbar-val' }, o.fmt(it.v)));
        row.addEventListener('mouseenter', function () { const r = sh.plot.getBoundingClientRect(), rr = row.getBoundingClientRect(); showTip(sh, tipRows(it.name, it.tip || [{ name: o.valCol || '数值', v: o.fmt(it.v) }]), rr.left - r.left + rr.width * 0.45, rr.bottom - r.top + 2); });
        row.addEventListener('mouseleave', function () { hideTip(sh); });
        box.appendChild(row);
      });
      sh.plot.append(box, sh.tip);
    };
    charts.push(draw);
    return sh.card;
  }

  // ---------- 指标卡（含迷你趋势线） ----------
  function kpi(o) {
    const vals = o.vals.filter(function (v) { return v != null; });
    const el = h('div', { class: 'kpi' + (o.onclick ? ' clickable' : ''), onclick: o.onclick || null },
      h('div', { class: 'top' }, h('span', { class: 'badge ' + o.badge }, CM.icon(o.icon)), o.label),
      h('div', { class: 'val' }, o.value, o.unit ? h('small', null, ' ' + o.unit) : null));
    if (o.delta) el.appendChild(h('div', { class: 'delta ' + o.delta.cls }, o.delta.text));
    else el.appendChild(h('div', { class: 'delta muted' }, o.note || ' '));
    if (vals.length >= 2) {
      const W = 200, Hh = 34, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), sp = hi - lo;
      const pts = vals.map(function (v, i) { return [(i / (vals.length - 1) * (W - 6) + 3).toFixed(1), (sp > 1e-9 ? Hh - 4 - (v - lo) / sp * (Hh - 8) : Hh / 2).toFixed(1)]; });
      const c = pal()[0];
      const d = 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join('L');
      const svg = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none"><path d="' + d + 'L' + pts[pts.length - 1][0] + ' ' + Hh + 'L' + pts[0][0] + ' ' + Hh + 'Z" fill="' + c + '" fill-opacity="0.1"/><path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
      el.appendChild(h('div', { class: 'spark', html: svg }));
    } else el.appendChild(h('div', { style: { height: '36px' } }));
    return el;
  }
  // 与约一年前比较；better: 'up' 越大越好 / 'down' 越小越好
  function delta(H, key, better, fmt) {
    const n = H.length; if (n < 2) return null;
    const cur = H[n - 1][key]; let k = Math.max(0, n - 13);
    while (k < n - 1 && (H[k][key] == null)) k++;
    const prev = H[k][key];
    if (cur == null || prev == null || k >= n - 1) return null;
    const dv = cur - prev;
    const span = n - 1 - k >= 12 ? '较一年前' : '较 ' + H[k].y + '年' + H[k].m + '月';
    if (Math.abs(dv) < 1e-9) return { text: span + ' 持平', cls: 'muted' };
    const good = better === 'up' ? dv > 0 : dv < 0;
    return { text: span + ' ' + (dv > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(dv)), cls: good ? 'good' : 'bad' };
  }

  // ---------- 各页 ----------
  function axisPeople(v) { return Math.abs(v) >= 1e4 ? (v / 1e4).toFixed(Math.abs(v) >= 1e5 || v === 0 ? 0 : 1) + '万' : String(Math.round(v)); }
  function axisPct(v) { return Math.round(v * 100) + '%'; }
  // 货币时期（巴黎）：图表数值换算为当期显示货币（坐标刻度按显示值取整），提示框再按显示值格式化
  function DV() { return (CM.CFG.money && CM.CFG.money.div) || 1; }
  function cv(v) { return v == null ? v : v / DV(); }
  function fm(v) { return U.fmtMoney(v * DV()); }
  function axisYi(v) { return v === 0 ? '0' : (v / 10000).toFixed(Math.abs(v) >= 1e5 ? 0 : 1) + '亿'; }
  function xsOf(H) {
    const span = H.length;
    return H.map(function (r) { return r.live ? '当前' : (span > 30 ? String(r.y) : (r.y % 100 < 10 ? '0' : '') + r.y % 100 + '.' + r.m); });
  }
  function ts(H, title, sub, list, extra) {
    return lineChart(Object.assign({ title: title, sub: sub, labels: H, xs: xsOf(H), tips: H.map(recLabel), series: list }, extra));
  }

  // 线路与车站客流排名（概览、交通页共用）
  function lineItems(g) {
    const mnet = g.model.net, sd = g.model.dailyStale ? null : g.model.stDaily;
    if (!mnet || !sd || !mnet.C.routes.length) return [];
    const byLine = new Map();
    mnet.C.routes.forEach(function (rt, i) {
      let o = byLine.get(rt.lineId); if (!o) { o = { name: rt.line ? rt.line.name : rt.label, color: AX.line(rt.line || { id: rt.lineId, color: rt.color }), v: 0 }; byLine.set(rt.lineId, o); }
      o.v += sd.routeBoard[i] || 0;
    });
    return Array.from(byLine.values()).sort(function (a, b) { return b.v - a.v; }).map(function (o) { return { name: o.name, v: o.v, color: o.color }; });
  }
  function stationItems(g) {
    const mnet = g.model.net, sd = g.model.dailyStale ? null : g.model.stDaily, P = pal();
    if (!mnet || !sd) return [];
    const C = mnet.C, st = [];
    for (let k = 0; k < C.stations.length; k++) st.push({ k: k, v: (sd.inn[k] || 0) + (sd.out[k] || 0) + (sd.xfer[k] || 0) });
    st.sort(function (a, b) { return b.v - a.v; });
    return st.slice(0, 8).filter(function (o) { return o.v > 0; }).map(function (o) {
      return { name: C.stations[o.k].name, v: o.v, color: P[0], tip: [{ name: '进站', v: U.fmtPeople(sd.inn[o.k]) }, { name: '出站', v: U.fmtPeople(sd.out[o.k]) }, { name: '换乘', v: U.fmtPeople(sd.xfer[o.k]) }] };
    });
  }
  const peopleFmt = function (v) { return U.fmtPeople(v) + ' 人次'; };

  function pageOverview(g, el) {
    const H = timeline(g), P = pal(), cur = H[H.length - 1], free = g.econ.isFree();
    const grid = h('div', { class: 'kpi-grid' });
    const last36 = function (k) { return pick(H.slice(-37), k); };
    grid.append(
      kpi({ icon: 'train', badge: 'b-teal', label: '地铁日客运量', value: U.fmtPeople(cur.riders), unit: '人次', vals: last36('riders'), delta: delta(H, 'riders', 'up', U.fmtPeople), onclick: function () { go('traffic'); } }),
      kpi({ icon: 'metro', badge: 'b-teal', label: '地铁分担率', value: U.fmtPct(cur.share, 1), vals: last36('share'), delta: delta(H, 'share', 'up', function (v) { return (v * 100).toFixed(1) + ' 个百分点'; }), onclick: function () { go('traffic'); } }),
      kpi({ icon: 'car', badge: cur.cong < 1.25 ? 'b-green' : (cur.cong < 1.6 ? 'b-orange' : 'b-red'), label: '道路拥堵指数', value: cur.cong.toFixed(2), vals: last36('cong'), delta: delta(H, 'cong', 'down', function (v) { return v.toFixed(2); }), onclick: function () { go('traffic'); } }),
      kpi({ icon: cur.sat >= 60 ? 'smile' : (cur.sat >= 40 ? 'meh' : 'frown'), badge: cur.sat >= 60 ? 'b-green' : (cur.sat >= 40 ? 'b-orange' : 'b-red'), label: '市民满意度', value: Math.round(cur.sat), unit: '/ 100', vals: last36('sat'), delta: delta(H, 'sat', 'up', function (v) { return v.toFixed(1); }) }),
      kpi({ icon: 'people', badge: 'b-blue', label: '城市人口', value: U.fmtPeople(cur.pop), vals: last36('pop'), delta: delta(H, 'pop', 'up', U.fmtPeople) }),
      free ? kpi({ icon: 'station', badge: 'b-slate', label: '车站 · 覆盖人口', value: String(cur.stations), unit: '站 · ' + U.fmtPct(cur.coverage, 0), vals: last36('coverage'), delta: delta(H, 'coverage', 'up', function (v) { return (v * 100).toFixed(1) + ' 个百分点'; }) })
        : kpi({ icon: 'coin', badge: 'b-gold', label: '可用资金', value: U.fmtMoney(cur.funds), vals: last36('funds'), delta: delta(H, 'funds', 'up', function (v) { return U.fmtMoney(v); }), onclick: function () { go('finance'); } }));
    el.appendChild(grid);
    const cg = h('div', { class: 'chart-grid' });
    cg.append(
      ts(H, '地铁日客运量', '日均乘车人次（周平均；v1.9 之前的记录为典型工作日）', [{ name: '地铁日客运量', color: P[0], vals: pick(H, 'riders') }], { fmt: peopleFmt, axisFmt: axisPeople, area: true, int: true, icon: 'train' }),
      hbarChart({ title: '各线路日客运量', sub: '日均上车人次（周平均）', icon: 'route', items: lineItems(g), fmt: function (v) { return U.fmtPeople(v); }, empty: '还没有运营中的线路。' }));
    el.appendChild(cg);
  }

  function pageTraffic(g, el) {
    const H = timeline(g), P = pal();
    const cg = h('div', { class: 'chart-grid' });
    cg.append(
      ts(H, '地铁分担率与覆盖率', '分担率：地铁出行占全部出行；覆盖率：步行 15 分钟可达车站的人口', [{ name: '分担率', color: P[0], vals: pick(H, 'share') }, { name: '覆盖率', color: P[2], vals: pick(H, 'coverage') }], { fmt: function (v) { return U.fmtPct(v, 1); }, axisFmt: axisPct, icon: 'metro' }),
      ts(H, '道路拥堵指数', '1.00 为畅通；高于 1.25 拥堵，高于 1.60 严重拥堵', [{ name: '拥堵指数', color: P[1], vals: pick(H, 'cong') }], { fmt: function (v) { return v.toFixed(2); }, axisFmt: function (v) { return v.toFixed(1); }, min0: false, icon: 'traffic', refs: [{ v: 1.25, label: '拥堵' }, { v: 1.6, label: '严重' }] }),
      ts(H, '平均通勤时间', '家到工作地的门到门时间', [{ name: '平均通勤', color: P[6], vals: pick(H, 'commute') }], { fmt: function (v) { return v.toFixed(1) + ' 分钟'; }, axisFmt: function (v) { return Math.round(v) + '分'; }, min0: false, icon: 'timer' }),
      hbarChart({ title: '客流最高的车站', sub: '进站 + 出站 + 换乘，前 8 名', icon: 'station', items: stationItems(g), fmt: function (v) { return U.fmtPeople(v); }, empty: '车站客流计算中…' }));
    el.appendChild(cg);
  }

  function pageFinance(g, el) {
    const P = pal(), E = g.econ;
    const H = timeline(g);
    let rows = E.ledger.map(function (r) { return { lab: r.y + '年' + r.m + '月', x: (r.y % 100 < 10 ? '0' : '') + r.y % 100 + '.' + r.m, r: r }; });
    if (E.ledger.length > 36) {
      const by = new Map();
      for (const r of E.ledger) { let a = by.get(r.y); if (!a) { a = { y: r.y, grant: 0, fare: 0, reward: 0, construction: 0, demolition: 0, upgrade: 0, relocation: 0, ops: 0, bond: 0, interest: 0, principal: 0, penalty: 0, ppp: 0, pppOut: 0, todCost: 0, fleetSale: 0 }; by.set(r.y, a); } for (const k in a) if (k !== 'y') a[k] += r[k] || 0; }
      rows = Array.from(by.values()).map(function (a) { return { lab: a.y + '年', x: String(a.y), r: a }; });
      // 车站商业按年合计（上面的科目表没有它）
      const cy = new Map(); for (const r of E.ledger) cy.set(r.y, (cy.get(r.y) || 0) + (r.commerce || 0));
      for (const o of rows) o.r.commerce = cy.get(o.r.y) || 0;
    }
    const inc = function (r) { return (r.grant || 0) + (r.fare || 0) + (r.reward || 0) + (r.commerce || 0) + (r.ppp || 0) + (r.fleetSale || 0); };
    const exp = function (r) { return (r.construction || 0) + (r.demolition || 0) + (r.upgrade || 0) + (r.relocation || 0) + (r.ops || 0) + (r.todCost || 0) + (r.pppOut || 0); };
    const svc = function (r) { return (r.interest || 0) + (r.principal || 0) + (r.penalty || 0); };
    const anyDebt = E.ledger.some(function (r) { return r.bond || svc(r); }) || E.bonds.length;
    const cg = h('div', { class: 'chart-grid' });
    cg.append(
      ts(H, '资金与债务', '一般资金为负时需尽快扭亏（长期负余额会导致挑战失败）；建设专项资金只能用于建设', [{ name: '一般资金', color: P[3], vals: pick(H, 'funds').map(cv) }].concat(anyDebt ? [{ name: '建设专项资金', color: P[2], vals: pick(H, 'capex').map(cv) }, { name: '债务余额', color: P[6], vals: pick(H, 'debt').map(cv) }] : []), { fmt: fm, axisFmt: axisYi, area: !anyDebt, icon: 'coin', refs: [{ v: 0, label: '' }] }),
      lineChart({ title: '收入与支出', sub: (E.ledger.length > 36 ? '按年' : '按月') + '合计：财政收入 = 拨款 + 票款 + 车站商业 + 政府合同 + 奖励（借款不计入）；支出 = 建设 + 运营（含车站商业成本）+ 合同支出' + (anyDebt ? '；偿债 = 利息 + 本金 + 逾期费用' : ''), icon: 'wallet', labels: rows, xs: rows.map(function (o) { return o.x; }), tips: rows.map(function (o) { return o.lab; }), series: [{ name: '财政收入', color: P[2], vals: rows.map(function (o) { return cv(inc(o.r)); }) }, { name: '建设与运营支出', color: P[1], vals: rows.map(function (o) { return cv(exp(o.r)); }) }].concat(anyDebt ? [{ name: '偿债', color: P[6], vals: rows.map(function (o) { return cv(svc(o.r)); }) }] : []), fmt: fm, axisFmt: axisYi, empty: '尚无完整月份的记录。' }));
    el.appendChild(cg);
    // 车站商业（TOD，v2.3）：开发情况、营运收入构成、票款与商业收入的走势、收入最高的车站
    if (CM.TOD) {
      const T = CM.TOD, mn = g.model.net, sd = g.model.dailyStale ? null : g.model.stDaily, C = mn ? mn.C : null, dev = [];
      if (C && sd) C.stations.forEach(function (s, k) {
        const st = g.net.stations[s.id]; if (!st || !st.tod || k >= sd.inn.length) return;
        const flow = sd.inn[k] + sd.out[k] + sd.xfer[k], hub = C.stationLines[k].size >= 2;
        dev.push({ name: st.name, lv: st.tod, flow: flow, hub: hub, month: (T.stationDaily(st.tod, flow, hub, g.clock.y, g) - T.stationCost(st.tod, g.clock.y, st.size, hub)) * 30.4 });
      });
      dev.sort(function (a, b) { return b.month - a.month; });
      const L12 = E.ledger.slice(-12), sum = function (k) { return L12.reduce(function (a, r) { return a + (r[k] || 0); }, 0); };
      const com = sum('commerce') - sum('todCost'), fare = sum('fare'), ops = sum('ops'), monthly = dev.reduce(function (a, o) { return a + o.month; }, 0);
      const lvN = [0, 0, 0, 0]; for (const o of dev) lvN[o.lv]++;
      el.appendChild(h('div', { class: 'fs-h' }, CM.icon('bag', 16), h('b', null, '车站商业（TOD）'), h('span', { class: 'tiny muted' }, '高客流车站的广告、商铺与上盖物业收入；在车站详情或地图快捷按钮中开发')));
      const kg = h('div', { class: 'kpi-grid' });
      kg.append(
        kpi({ icon: 'bag', badge: 'b-gold', label: '已开发车站', value: String(dev.length), unit: '站', vals: [], note: dev.length ? '广告 ' + lvN[1] + ' · 商业街 ' + lvN[2] + ' · 站城一体 ' + lvN[3] : '在车站详情或地图快捷按钮中开发' }),
        kpi({ icon: 'coin', badge: monthly < 0 ? 'b-red' : 'b-green', label: '车站商业月净收益', value: fm(monthly), vals: E.ledger.slice(-12).map(function (r) { return (r.commerce || 0) - (r.todCost || 0); }), note: '收入减运营与维护成本，按当前客流估算' }),
        kpi({ icon: 'wallet', badge: 'b-blue', label: '近一年营运收入中的商业占比', value: fare + com > 0 ? U.fmtPct(com / (fare + com), 1) : '—', vals: [], note: ops > 0 ? '（票款 + 商业）覆盖运营费用 ' + U.fmtPct((fare + com) / ops, 0) : '尚无运营费用' }));
      el.appendChild(kg);
      const tg = h('div', { class: 'chart-grid' });
      tg.append(
        lineChart({ title: '票款与车站商业收入', sub: (E.ledger.length > 36 ? '按年' : '按月') + '合计；两者合计越接近运营费用，越不依赖拨款', icon: 'bag', labels: rows, xs: rows.map(function (o) { return o.x; }), tips: rows.map(function (o) { return o.lab; }),
          series: [{ name: '票款', color: P[0], vals: rows.map(function (o) { return cv(o.r.fare || 0); }) }, { name: '车站商业', color: P[4] || P[3], vals: rows.map(function (o) { return cv(o.r.commerce || 0); }) }, { name: '运营费用', color: P[1], vals: rows.map(function (o) { return cv(o.r.ops || 0); }) }],
          fmt: fm, axisFmt: axisYi, empty: '尚无完整月份的记录。' }),
        hbarChart({ title: '商业净收益最高的车站', sub: '每月估算（按周平均客流，扣除运营与维护成本）；换乘站收入 ×' + T.HUB, icon: 'station', fmt: fm, valCol: '每月净收益',
          items: dev.slice(0, 8).map(function (o) { return { name: o.name, v: o.month, color: ['', P[2], P[3], P[4] || P[0]][o.lv], tip: [{ name: '开发等级', v: T.LEVELS[o.lv].name }, { name: '日客流', v: U.fmtPeople(o.flow) + ' 人次' }, { name: '每月净收益', v: fm(o.month) }].concat(o.hub ? [{ name: '换乘站', v: '×' + T.HUB }] : []) }; }),
          empty: '还没有开发商业空间的车站。高客流车站可以在车站详情或地图快捷按钮中开发。' }));
      el.appendChild(tg);
    }
  }
  // ---------- 城市经济：GDP、增长率（游戏结果 / 预测 / 史实参考分开）、地方财政与地铁拨款、交通与周期 ----------
  function pageEcon(g, el) {
    const P = pal(), mv = CM.Macro && g.macro ? CM.Macro.view(g) : null;
    if (!mv) { el.appendChild(h('div', { class: 'empty-chart' }, '本地图没有启用城市经济模拟。')); return; }
    const st = mv.st, c = mv.cfg, recs = st.rec, L = mv.last, fc = mv.fc, free = g.econ.isFree();
    const base = CM.CFG.econBase || CM.CFG.START.y;
    const big = CM.UI.fmtBig, pctS = CM.UI.pctS;
    const grid = h('div', { class: 'kpi-grid' });
    const vals = function (k) { return recs.slice(-12).map(function (r) { return r[k]; }); };
    grid.append(
      kpi({ icon: 'trend', badge: 'b-violet', label: (L ? L.y : fc.y) + ' 年地图范围 GDP' + (L ? '' : '（预测）'), value: big(L ? L.nom : fc.nom), vals: vals('nom'), note: L && L.part ? '接入当年（' + L.n + ' 个月）' : (L ? '名义值，按当年价格' : '第一个完整年度明年 1 月结算') }),
      kpi({ icon: 'pulse', badge: mv.env.cls === 'good' ? 'b-green' : (mv.env.cls === 'bad' ? 'b-red' : (mv.env.cls === 'warn' ? 'b-orange' : 'b-blue')), label: (L && L.growth != null ? L.y + ' 年实际增长' : fc.y + ' 年预测增长'), value: L && L.growth != null ? pctS(L.growth) : pctS(fc.growth), vals: vals('growth'), note: '当前经济环境：' + mv.env.label + (L ? ' · ' + L.y + ' 年价格涨幅 ' + pctS(L.infl) : '') }),
      kpi({ icon: 'people', badge: 'b-blue', label: '人均 GDP', value: L ? U.fmtInt(cv(L.nom * 1e4 / Math.max(1, L.pop))) : U.fmtInt(cv(fc.nom * 1e4 / Math.max(1, g.city.totals().pop))), unit: CM.CFG.money.unit, vals: recs.slice(-12).map(function (r) { return r.nom / Math.max(1, r.pop); }), note: '地图范围常住人口' }),
      kpi({ icon: 'bank', badge: 'b-gold', label: '地方财政收入', value: L ? big(L.rev) : '待结算', vals: vals('rev'), note: L ? '为预期的 ' + Math.round(L.fRaw * 100) + '% · ' + (mv.fisc ? mv.fisc.y + ' 年财力 ×' + mv.fisc.f.toFixed(2) : '') : '' }),
      kpi({ icon: 'metro', badge: 'b-teal', label: '交通对经济', value: pctS(mv.te.eff - 1, 2), vals: vals('te'), note: '当前交通效率 ' + pctS(mv.te.now - 1, 2) }),
      kpi({ icon: 'bolt', badge: mv.shocks.length ? 'b-orange' : 'b-slate', label: '经济事件', value: String(mv.shocks.length), unit: '项影响中', vals: [], note: mv.shocks.length ? mv.shocks.map(function (s) { return s.ev.title.replace(/^模拟：/, ''); }).slice(0, 2).join('、') : (mv.sim ? '模拟阶段' : '暂无') }));
    el.appendChild(grid);
    const cg = h('div', { class: 'chart-grid' });
    const rows = recs.map(function (r) { return { lab: r.y + ' 年' + (r.part ? '（' + r.n + ' 个月）' : '') + (r.sim ? ' · 模拟' : ''), x: String(r.y), r: r }; });
    const fcRow = { lab: fc.y + ' 年 · 预测', x: String(fc.y), r: null };
    const all = rows.concat([fcRow]);
    cg.append(lineChart({ title: '地图范围 GDP', sub: '名义值按当年价格；实际值按 ' + base + ' 年价格（剔除价格变化）。最后一点为本年预测', icon: 'trend', labels: all, xs: all.map(function (o) { return o.x; }), tips: all.map(function (o) { return o.lab; }),
      series: [{ name: '名义 GDP', color: P[0], vals: rows.map(function (o) { return cv(o.r.nom); }).concat([cv(fc.nom)]) }, { name: '实际 GDP（' + base + ' 年价格）', color: P[2], vals: rows.map(function (o) { return cv(o.r.real); }).concat([cv(fc.real)]) }],
      fmt: function (v) { return big(v * DV()); }, axisFmt: function (v) { return v >= 1e8 ? (v / 1e8).toFixed(1) + '万亿' : (v / 1e4).toFixed(0) + '亿'; }, empty: '至少需要两个年度的记录。' }));
    const items = recs.map(function (r) { return { lab: r.y + ' 年', x: String(r.y), v: r.growth == null ? null : r.growth, ref: CM.Macro.refAt(c, r.y) }; });
    items.push({ lab: fc.y + ' 年（预测，不含尚未发生的事件）', x: String(fc.y), v: fc.growth, fc: true, ref: CM.Macro.refAt(c, fc.y) });
    cg.append(growthChart({ title: '实际增长率', sub: '柱：本局地图范围的游戏结果（虚线柱为本年预测）' + (c.ref ? '；橙色：' + c.ref.label + '（全国 / 地区口径的近似参考，菱形为当年值，虚线为时期平均）' : ''), icon: 'chart', items: items, refLabel: c.ref ? c.ref.label : null, wide: false }));
    const anyGrant = !free && g.econ.ledger.length;
    const byY = {};
    for (const r of g.econ.ledger) byY[r.y] = (byY[r.y] || 0) + (r.grant || 0);
    cg.append(lineChart({ title: free ? '地方财政收入' : '地方财政收入与地铁拨款', sub: 'GDP 不等于财政收入；拨款只占财政收入的一部分' + (anyGrant ? '（拨款为当年已发放合计）' : ''), icon: 'bank', labels: rows, xs: rows.map(function (o) { return o.x; }), tips: rows.map(function (o) { return o.lab; }),
      series: [{ name: '地方财政收入', color: P[3], vals: rows.map(function (o) { return cv(o.r.rev); }) }].concat(anyGrant ? [{ name: '地铁拨款', color: P[1], vals: rows.map(function (o) { return byY[o.r.y] != null ? cv(byY[o.r.y]) : null; }) }] : []),
      fmt: function (v) { return big(v * DV()); }, axisFmt: function (v) { return v >= 1e8 ? (v / 1e8).toFixed(1) + '万亿' : (v / 1e4).toFixed(0) + '亿'; }, empty: '至少需要两个年度的记录。' }));
    cg.append(lineChart({ title: '交通效率与经济周期', sub: '交通效率：已计入 GDP 的生产率影响；周期与事件：经济周期与事件冲击使 GDP 偏离趋势的幅度', icon: 'pulse', labels: rows, xs: rows.map(function (o) { return o.x; }), tips: rows.map(function (o) { return o.lab; }),
      series: [{ name: '交通效率', color: P[2], vals: rows.map(function (o) { return o.r.te - 1; }) }, { name: '周期与事件', color: P[7], vals: rows.map(function (o) { return (1 + o.r.gap) * o.r.shock - 1; }) }],
      fmt: function (v) { return pctS(v, 2); }, axisFmt: function (v) { return (v * 100).toFixed(0) + '%'; }, min0: false, refs: [{ v: 0, label: '' }], empty: '至少需要两个年度的记录。' }));
    el.appendChild(cg);
  }

  // ---------- 城市纪事：里程碑书页（文字 + 简笔画）、翻页与时间轴 ----------
  let msFilter = 'all', msAt = null, msFlip = null;
  // 简笔画的笔触：轻微抖动的墨线（SVG 滤镜，全局一份）
  function ensureSketchDefs() {
    if (document.getElementById('sk-defs')) return;
    const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    d.id = 'sk-defs'; d.setAttribute('width', '0'); d.setAttribute('height', '0'); d.setAttribute('aria-hidden', 'true');
    d.style.position = 'absolute';
    d.innerHTML = '<filter id="skf" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>';
    document.body.appendChild(d);
  }
  // 简笔画（200×130）：墨线为当前文字色，.w 为类别色淡彩，.c 为类别色线条，.wf 为纸色填充
  const WAVES = function (y) { let s = 'M12 ' + y; for (let x = 12; x < 186; x += 24) s += 'c4-4 8-4 12 0s8 4 12 0'; return s; };
  const SK = {
    city: '<circle class="w" cx="146" cy="56" r="22"/><path d="M146 24v-7M168 36l5-5M124 36l-5-5M178 56h7M107 56h7"/><path d="M18 110h164"/><path d="M28 110V72h16v38M44 110V58h18v52M62 110V84h12v26M86 110V64h18v46M104 110V78h12v32M122 110V52h16v58M138 110V88h14v22M160 110V74h16v36"/><path d="M50 66h6M50 76h6M50 86h6M128 62h4M128 72h4M128 82h4M92 74h6M92 84h6"/>',
    train: '<path d="M22 120V68a78 56 0 0 1 156 0v52"/><rect class="w" x="66" y="40" width="68" height="64" rx="12"/><rect x="66" y="40" width="68" height="64" rx="12"/><rect x="76" y="50" width="48" height="22" rx="4"/><path d="M100 50v22M86 34h28"/><circle cx="81" cy="88" r="4"/><circle cx="119" cy="88" r="4"/><path d="M78 104l-16 16M122 104l16 16M58 120h84"/>',
    xfer: '<path class="c" d="M14 40C70 40 120 92 186 92" stroke-width="7"/><path d="M14 94C70 94 120 40 186 40" stroke-width="7" opacity=".45"/><circle class="wf" cx="100" cy="66" r="16"/><path d="M92 62h15l-4-4M108 71H93l4 4"/>',
    cross: '<path class="w" d="M10 96h180v26H10z"/><path d="' + WAVES(106) + '"/><path d="M10 74h180"/><path d="M30 74c20-34 50-34 70 0c20-34 50-34 70 0"/><path d="M30 74v24M100 74v24M170 74v24"/><rect class="w" x="54" y="57" width="72" height="14" rx="5"/><rect x="54" y="57" width="72" height="14" rx="5"/><path d="M64 63h8M80 63h8M96 63h8M112 63h8"/>',
    loop: '<ellipse class="c" cx="100" cy="66" rx="74" ry="42" stroke-width="6"/><rect x="70" y="52" width="16" height="30" rx="2"/><rect x="92" y="42" width="16" height="40" rx="2"/><rect x="114" y="56" width="16" height="26" rx="2"/><circle class="wf" cx="26" cy="66" r="6"/><circle class="wf" cx="174" cy="66" r="6"/><circle class="wf" cx="100" cy="24" r="6"/><circle class="wf" cx="100" cy="108" r="6"/>',
    km: '<path d="M58 124L94 28M142 124L106 28"/><path d="M65 108h70M71 91h58M77 76h46M82 63h36M87 51h26M91 41h18"/><path d="M160 116V72"/><rect class="w" x="146" y="54" width="32" height="18" rx="3"/><rect x="146" y="54" width="32" height="18" rx="3"/><path d="M154 63h16"/><path d="M18 116h40M142 116h40"/>',
    network: '<path class="c" d="M18 100L70 60h60l52-36" stroke-width="5"/><path d="M28 22l42 38 40 40 72 4" stroke-width="5" opacity=".5"/><path d="M130 60l22 50" stroke-width="5" opacity=".3"/><circle class="wf" cx="70" cy="60" r="8"/><circle class="wf" cx="130" cy="60" r="7"/><circle class="wf" cx="110" cy="100" r="6"/><circle class="wf" cx="18" cy="100" r="5"/><circle class="wf" cx="182" cy="24" r="5"/>',
    people: '<path d="M18 114h164"/><path d="M24 114V80h14v34M38 114V66h16v48M138 114V72h16v42M154 114V86h12v28M166 114V62h14v52" opacity=".5"/><circle cx="78" cy="60" r="8"/><path d="M78 68v24M78 76l-12 9M78 76l12 9M78 92l-9 18M78 92l9 18"/><circle class="w" cx="104" cy="52" r="9"/><circle cx="104" cy="52" r="9"/><path d="M104 61v30M104 70l-13 11M104 70l13 11M104 91l-10 19M104 91l10 19"/><circle cx="128" cy="64" r="7"/><path d="M128 71v21M128 78l-10 8M128 78l10 8M128 92l-8 18M128 92l8 18"/>',
    ride: '<path d="M14 100h172"/><rect class="w" x="22" y="30" width="156" height="52" rx="10"/><rect x="22" y="30" width="156" height="52" rx="10"/><path d="M36 42h22v20H36zM68 42h22v20H68zM110 42h22v20h-22zM142 42h22v20h-22z"/><path d="M99 36v42M22 72h156"/><circle cx="56" cy="106" r="4"/><path d="M56 110v12"/><circle cx="96" cy="104" r="4"/><path d="M96 108v14"/><circle cx="140" cy="106" r="4"/><path d="M140 110v12"/>',
    pie: '<circle cx="78" cy="66" r="40"/><path class="w" d="M78 66V26a40 40 0 0 1 38 28z"/><path d="M78 66V26M78 66l38-12"/><circle cx="150" cy="44" r="10"/><path d="M150 54v32M150 64l-16 13M150 64l16 13M150 86l-12 24M150 86l12 24"/>',
    pin: '<circle cx="100" cy="64" r="54" stroke-dasharray="5 7" opacity=".5"/><circle class="w" cx="100" cy="64" r="34"/><circle cx="100" cy="64" r="34" opacity=".6"/><path class="wf" d="M100 92c-14-16-22-26-22-38a22 22 0 0 1 44 0c0 12-8 22-22 38z"/><circle cx="100" cy="54" r="8"/>',
    tower: '<path d="M100 8v18M85 120L100 26l15 94M74 120h52M91 70h18M88 92h24M95 48h10"/><path class="w" d="M89 60h22v10H89z"/><path d="M28 120V92h20v28M152 120V84h22v36M16 120h168"/>',
    stadium: '<ellipse class="w" cx="100" cy="80" rx="78" ry="30"/><ellipse cx="100" cy="80" rx="78" ry="30"/><ellipse cx="100" cy="76" rx="52" ry="16"/><path d="M22 80v14c0 16 35 28 78 28s78-12 78-28V80"/><path d="M40 54V36M160 54V36M34 36h12M154 36h12"/>',
    station: '<path d="M18 112h164"/><rect class="w" x="34" y="58" width="132" height="54"/><rect x="34" y="58" width="132" height="54"/><path d="M24 60l76-36 76 36"/><circle cx="100" cy="44" r="9"/><path d="M100 39v5l3 2"/><path d="M54 78h18v34M90 78h20v34M128 78h18v34"/>',
    reclaim: '<path class="w" d="M66 84c12-16 42-24 72-20 20 3 36 10 46 20v20H66z"/><path d="M66 84c12-16 42-24 72-20 20 3 36 10 46 20"/><path d="' + WAVES(98) + '"/><path d="' + WAVES(114) + '"/><path d="M120 66V18M120 18h48M120 30l12-12M162 18v20M158 38h8M112 66h16"/>',
    news: '<rect class="w" x="40" y="20" width="120" height="94" rx="4"/><rect x="40" y="20" width="120" height="94" rx="4"/><path d="M52 34h96" stroke-width="5"/><path d="M52 50h42M52 60h42M52 70h42M52 82h96M52 92h96M52 102h68"/><rect x="104" y="46" width="44" height="28" rx="2"/><path d="M108 70l10-11 8 7 6-5 12 9"/>',
    road: '<path d="M18 100h164"/><path d="M78 100l20-60M122 100l-20-60"/><path d="M100 92v-7M100 78v-7M100 64v-6M100 52v-4"/><circle class="w" cx="152" cy="40" r="14"/><path d="M30 100c10-14 22-18 34-12M140 100c8-10 20-12 30-6" opacity=".5"/>',
  };
  function sketchKind(r) {
    const id = r.id || '';
    if (id === 'start') return 'city';
    if (id === 'inherit' || id === 'first-line') return 'train';
    if (id === 'first-xfer') return 'xfer';
    if (id === 'first-cross') return 'cross';
    if (id === 'first-loop') return 'loop';
    if (id === 'blank') return 'road';
    const pre = id.split('-')[0];
    if (pre === 'km') return 'km';
    if (pre === 'lines') return 'network';
    if (pre === 'pop') return 'people';
    if (pre === 'ride') return 'ride';
    if (pre === 'share') return 'pie';
    if (pre === 'cover') return 'pin';
    if (pre === 'reclaim') return 'reclaim';
    const t = r.title || '';
    if (pre === 'lm') {
      const lm = (CM.DATA.landmarks || []).find(function (l) { return 'lm-' + (l.id || '') === id; });
      const k = lm ? lm.kind : '';
      return k === 'stadium' ? 'stadium' : (k === 'rail' ? 'station' : 'tower');
    }
    if (/奥运|亚运|竞技|体育/.test(t)) return 'stadium';
    if (/站|新干线|铁路/.test(t)) return 'station';
    if (/塔|大厦|落成/.test(t)) return 'tower';
    if (/填海|海港|隧道/.test(t)) return 'cross';
    return 'news';
  }
  function sketch(r) { return '<svg class="sk" viewBox="0 0 200 130" aria-hidden="true"><g filter="url(#skf)">' + SK[sketchKind(r)] + '</g></svg>'; }

  function pageMilestones(g, el) {
    const MS = CM.Milestones; if (!MS) return;
    ensureSketchDefs();
    const CAT = MS.CAT, all = MS.state(g).list.slice();
    const list = all.filter(function (r) { return msFilter === 'all' || r.cat === msFilter; });
    const per = window.innerWidth < 820 ? 1 : 2;
    const real = all.filter(function (r) { return r.id !== 'start'; });
    const counts = {}; for (const r of all) counts[r.cat] = (counts[r.cat] || 0) + 1;
    const lastSpread = function () { return Math.max(0, Math.floor((list.length - 1) / per) * per); };
    if (msAt == null || msAt >= list.length) msAt = lastSpread();
    msAt = Math.floor(msAt / per) * per;
    // 顶部：书名、数量与分类筛选
    const chips = h('div', { class: 'fchips' }, [['all', '全部', null]].concat(Object.keys(CAT).map(function (k) { return [k, CAT[k].name, CAT[k].color]; })).map(function (o) {
      return h('button', { class: 'fchip' + (msFilter === o[0] ? ' on' : ''), 'data-silent': '1', onclick: function () { if (msFilter === o[0]) return; msFilter = o[0]; msAt = null; CM.Sound && CM.Sound.play('soft'); refresh(true); } },
        o[2] ? h('i', { style: { background: o[2] } }) : null, o[1], h('small', null, String(o[0] === 'all' ? all.length : (counts[o[0]] || 0))));
    }));
    el.appendChild(h('div', { class: 'ms-head2' },
      h('div', { class: 'ms-ttl' }, h('span', { class: 'badge b-gold' }, CM.icon('book')),
        h('div', null, h('h3', null, (CM.DATA.city || '城市') + '纪事'), h('small', null, real.length ? real.length + ' 个里程碑 · 最近：' + real[real.length - 1].title : '首条地铁开通、人口与客流跨越关口时，都会写进这本纪事'))),
      chips));
    if (!list.length) { el.appendChild(h('div', { class: 'empty-chart' }, '这一类还没有里程碑。')); return; }

    // 书：每页一个里程碑（宽屏两页一开），左右翻页
    const book = h('div', { class: 'book' + (per === 1 ? ' single' : '') });
    const prev = h('button', { class: 'book-nav', 'data-tip': '上一页', 'data-key': '←', 'aria-label': '上一页', onclick: function () { flip(-1); } }, CM.icon('arrowL'));
    const next = h('button', { class: 'book-nav', 'data-tip': '下一页', 'data-key': '→', 'aria-label': '下一页', onclick: function () { flip(1); } }, CM.icon('arrowR'));
    const tag = function (r) { return r.tag === '史实' ? h('span', { class: 'tag hist' }, '史实') : (r.tag === '模拟' ? h('span', { class: 'tag sim' }, '模拟') : null); };
    const pageEl = function (r, i) {
      const c = CAT[r.cat] || CAT.history;
      return h('article', { class: 'pg' + (r.big ? ' big' : ''), style: { '--mc': c.color } },
        h('div', { class: 'pg-top' }, h('span', { class: 'pg-date' }, r.y + ' 年 ' + r.m + ' 月'), h('span', { class: 'pg-cat' }, h('i'), c.name)),
        h('div', { class: 'pg-art', html: sketch(r) }),
        h('h3', { class: 'pg-title' }, r.title),
        r.desc ? h('p', { class: 'pg-desc' }, r.desc) : null,
        h('div', { class: 'pg-foot' }, tag(r), h('span', { class: 'grow' }), h('span', { class: 'pg-no' }, '— ' + (i + 1) + ' —')));
    };
    const blankEl = function () {
      const nx = MS.next(g);
      return h('article', { class: 'pg blank', style: { '--mc': CAT.metro.color } },
        h('div', { class: 'pg-top' }, h('span', { class: 'pg-date' }, '下一页'), h('span', { class: 'pg-cat' }, h('i'), '未完待续')),
        h('div', { class: 'pg-art', html: sketch({ id: 'blank' }) }),
        h('h3', { class: 'pg-title' }, '未完待续'),
        h('p', { class: 'pg-desc' }, '新的线路、人口与客流关口，都会写进这本纪事。'),
        nx.length ? h('div', { class: 'pg-goals' }, nx.slice(0, 3).map(function (o) {
          const f = U.clamp(o.cur / o.goal, 0, 1);
          return h('div', null, h('span', null, '下一个 · ' + o.label), h('b', null, o.text), h('div', { class: 'ms-bar' }, h('i', { style: { width: (f * 100).toFixed(1) + '%', background: o.color } })));
        })) : null);
    };
    // 翻页（v2.3）：真实的书页翻动——旧的一页绕书脊转过去，正面是旧页、背面是新页，下面露出新的一页；
    // 连续翻页时先把上一次翻页收尾。减少动态效果时直接换页
    let turning = null;
    const pagesAt = function (at) { const a = []; for (let k = 0; k < per; k++) { const i = at + k; a.push(i < list.length ? pageEl(list[i], i) : blankEl()); } return a; };
    const drawBook = function (dir, from) {
      if (turning) turning();
      prev.disabled = msAt <= 0; next.disabled = msAt + per >= list.length;
      const now = pagesAt(msAt);
      if (!dir || from == null || CM.Settings.reducedMotion()) { book.replaceChildren(h('div', { class: 'spread' }, now)); return; }
      const old = pagesAt(from), face = function (cls, pg) { return h('div', { class: 'face ' + cls }, pg || null); };
      const sp = h('div', { class: 'spread turning' });
      let leaf;
      if (per === 2) {
        if (dir > 0) { sp.append(old[0], now[1]); leaf = h('div', { class: 'leaf next' }, face('front', old[1]), face('back', now[0])); }
        else { sp.append(now[0], old[1]); leaf = h('div', { class: 'leaf prev' }, face('front', old[0]), face('back', now[1])); }
      } else { sp.append(now[0]); leaf = h('div', { class: 'leaf full ' + (dir > 0 ? 'next' : 'prev') }, face('front', old[0]), face('back')); }
      sp.appendChild(leaf);
      book.replaceChildren(sp);
      requestAnimationFrame(function () { requestAnimationFrame(function () { leaf.classList.add('go'); }); });
      let timer = 0;
      const finish = function () { clearTimeout(timer); if (turning === finish) turning = null; if (sp.isConnected) book.replaceChildren(h('div', { class: 'spread' }, pagesAt(msAt))); };
      timer = setTimeout(finish, 780);
      turning = finish;
    };
    // 时间轴：每个里程碑一个点（等间距），年份变化处标年份；当前一开的点高亮，点击跳到对应页
    const track = h('div', { class: 'tl-track' });
    const dots = [];
    let py = null;
    list.forEach(function (r, i) {
      const c = CAT[r.cat] || CAT.history;
      const b = h('button', { class: 'tl-dot' + (r.big ? ' big' : ''), role: 'tab', 'data-silent': '1', 'data-tip': r.y + '年' + r.m + '月 · ' + r.title, style: { '--mc': c.color }, onclick: function () { go2(Math.floor(i / per) * per); } }, h('i'));
      dots.push(b);
      track.appendChild(h('div', { class: 'tl-it' + (r.y !== py ? ' yr' : '') }, h('span', { class: 'tl-y' }, r.y !== py ? String(r.y) : ''), b));
      py = r.y;
    });
    const tlBox = h('div', { class: 'tl-box' }, track);
    const syncTl = function (smooth) {
      dots.forEach(function (d, i) { d.classList.toggle('on', i >= msAt && i < msAt + per); });
      const d = dots[msAt]; if (!d) return;
      const x = d.parentNode.offsetLeft - tlBox.clientWidth / 2 + 20;
      if (tlBox.scrollTo) tlBox.scrollTo({ left: Math.max(0, x), behavior: smooth ? 'smooth' : 'auto' }); else tlBox.scrollLeft = x;
    };
    const go2 = function (at) {
      at = U.clamp(at, 0, lastSpread());
      if (at === msAt) return;
      const dir = at > msAt ? 1 : -1, from = msAt;
      msAt = at; CM.Sound && CM.Sound.play('swoosh');
      drawBook(dir, from); syncTl(true);
    };
    const flip = function (dir) { go2(msAt + dir * per); };
    msFlip = flip;
    // 拖动 / 轻扫翻页
    let sx = null;
    book.addEventListener('pointerdown', function (e) { sx = e.clientX; });
    book.addEventListener('pointerup', function (e) { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) flip(dx < 0 ? 1 : -1); });
    el.appendChild(h('div', { class: 'book-area' }, prev, book, next));
    el.appendChild(h('div', { class: 'tl-wrap' }, h('div', { class: 'tl-h' }, CM.icon('calYear', 15), '时间轴', h('span', { class: 'tiny muted' }, '　点击跳到对应页；← → 或左右轻扫翻页')), tlBox));
    drawBook(0);
    requestAnimationFrame(function () { syncTl(false); });
  }
  const PAGES = { overview: pageOverview, traffic: pageTraffic, econ: pageEcon, finance: pageFinance, milestones: pageMilestones };
  const NOTES = {
    milestones: '只记录关键节点：地铁建设的「第一次」与里程关口、客流与分担率关口、人口关口、本地图的重大历史事件、地标落成与填海成陆。',
    econ: '按年记录：每年 1 月结算上一年。游戏结果为本局地图范围的模拟值；预测只包含已经发生的事件；参考数据为全国或地区口径的近似值，与地图范围数据分开显示。',
    _: '按月记录，最后一点为当前值；客流为周平均日（5 个工作日 + 2 个周末日）的模拟结果，v1.9 之前的记录为典型工作日口径（不重算）。悬停图表查看数值。',
  };

  // ---------- 外框：窗口与标签只建一次；切换标签或刷新数据只替换内容区（不重播入场动画，图表同步绘制，不闪动） ----------
  let win = null, tabBtns = {}, tabInd = null;
  function build() {
    const root = ui.statsEl;
    root.innerHTML = '';
    tabBtns = {};
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    tabInd = h('span', { class: 'tabs-ind' });
    tabs.appendChild(tabInd);
    for (const t of TABS) {
      const b = h('button', { role: 'tab', 'data-silent': '1', onclick: function () { go(t[0]); } }, CM.icon(t[2]), h('span', null, t[1]));
      tabBtns[t[0]] = b; tabs.appendChild(b);
    }
    const head = h('div', { class: 'stats-head' }, h('span', { class: 'badge b-blue' }, CM.icon('chart')), h('h2', null, '城市统计'), tabs, h('div', { class: 'grow' }),
      h('button', { class: 'hbtn', 'data-tip': '关闭', 'data-key': 'Esc', onclick: function () { Stats.close(); } }, CM.icon('close')));
    body = h('div', { class: 'stats-body' });
    win = h('div', { class: 'stats-win', onclick: function (e) { e.stopPropagation(); } }, head, body);
    root.appendChild(win);
    root.onclick = function () { Stats.close(); };
  }
  function syncTabs(g, instant) {
    const free = g.econ.isFree(), eco = !!(g.macro && CM.Macro);
    if ((tab === 'finance' && free) || (tab === 'econ' && !eco)) tab = 'overview';
    for (const k in tabBtns) {
      tabBtns[k].style.display = (k === 'finance' && free) || (k === 'econ' && !eco) ? 'none' : '';
      tabBtns[k].classList.toggle('on', k === tab); tabBtns[k].setAttribute('aria-selected', k === tab ? 'true' : 'false');
    }
    const b = tabBtns[tab];
    if (!b || !b.offsetWidth) return;
    if (instant) tabInd.style.transition = 'none';
    tabInd.style.width = b.offsetWidth + 'px'; tabInd.style.transform = 'translateX(' + b.offsetLeft + 'px)';
    tabInd.classList.add('ready');
    if (instant) { void tabInd.offsetWidth; tabInd.style.transition = ''; }
  }
  function renderBody(g, swap, keepScroll) {
    charts = [];
    if (!PAGES[tab]) tab = 'overview';
    const page = h('div', { class: 'stats-page' + (swap ? ' swap-in' : '') });
    PAGES[tab](g, page);
    page.appendChild(h('div', { class: 'tiny muted stats-note' }, NOTES[tab] || NOTES._));
    const st = keepScroll ? body.scrollTop : 0;
    body.replaceChildren(page);
    body.dataset.tab = tab;
    redrawCharts();
    body.scrollTop = st;
    sig = signature(g);
  }
  function render() {
    const g = game(); if (!g || !ui) return;
    if (!win || !ui.statsEl.contains(win)) build();
    syncTabs(g, true);
    renderBody(g, false, true);
  }
  function go(t) {
    if (t === tab) return;
    const g = game(); if (!g) return;
    tab = t; CM.Sound && CM.Sound.play('soft');
    syncTabs(g, false);
    renderBody(g, true, false);
  }
  // 需要重画的条件：图表最后一点是“当前”值（标注到日）；纪事页只随里程碑与主题变化
  function signature(g) {
    const th = document.documentElement.dataset.theme + '|' + AX.flag(), n = g.milestones ? g.milestones.list.length : 0;
    if (tab === 'milestones') return 'ms|' + n + '|' + th + '|' + (window.innerWidth < 820 ? 1 : 2);
    if (tab === 'econ') return 'ec|' + g.clock.y + '-' + g.clock.m + '|' + (g.macro ? g.macro.rec.length + '|' + g.macro.gv : '') + '|' + th;
    return g.clock.y + '-' + g.clock.m + '-' + g.clock.d + '|' + (g.model.dailyStale ? 0 : 1) + '|' + g.history.length + '|' + g.econ.ledger.length + '|' + g.netVersion + '|' + th + '|' + n;
  }
  function redrawCharts() { for (const d of charts) d(); }
  let rT = null;
  window.addEventListener('resize', function () {
    if (!isOpen) return;
    clearTimeout(rT);
    rT = setTimeout(function () { const g = game(); if (!g) return; if (signature(g) !== sig) renderBody(g, false, true); else redrawCharts(); syncTabs(g, true); }, 120);
  });
  // 纪事页：← → 翻页（统计面板打开时优先于地图平移）
  window.addEventListener('keydown', function (e) {
    if (!isOpen || tab !== 'milestones' || !msFlip || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    e.preventDefault(); e.stopPropagation();
    msFlip(e.key === 'ArrowRight' ? 1 : -1);
  }, true);
  function refresh(swap) { const g = game(); if (g && isOpen) renderBody(g, !!swap, false); }

  const Stats = {
    open: function (u, t) { ui = u; if (t) { tab = t; if (t === 'milestones') msAt = null; } isOpen = true; ui.statsEl.classList.remove('hidden'); build(); render(); },
    close: function () { if (!isOpen) return; isOpen = false; if (ui) { ui.statsEl.classList.add('hidden'); CM.Sound && CM.Sound.play('close'); } },
    isOpen: function () { return isOpen; },
    redraw: function () { if (isOpen) render(); },
    tick: function () { const g = game(); if (!isOpen || !g) return; if (signature(g) !== sig) renderBody(g, false, true); },
  };
  CM.Stats = Stats;
})(window.CM);
