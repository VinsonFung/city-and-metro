'use strict';
// 城市连接（v2.7，数据来自 traits.js 的 cityLink 机制）：相邻两张地图各算各的，边境上的接驳口接通后：
//  · 过境旅客可以乘地铁，可以单独设跨境附加费（Model.crossMin 折合进站分钟，Economy.day 计入票款）；
//  · 可以切换到对岸最新的存档（只切同一模式：经营挑战只看经营挑战，自由建造只看自由建造）；
//  · 对岸存档的线网半透明地叠在图内看得到的范围。对岸的线网只读，不参与模拟，也不写进当前存档。
// 这里不判断具体城市，换一对相邻城市只要在地图数据里声明 cityLink。
(function (CM) {
  const CFG = CM.CFG, KEY = 'cm1.linkOverlay';
  const info = function () { return CM.DATA.cityLink || null; };
  const facs = function (g) { if (!info() || !CM.Fac) return []; return CM.Fac.list(g.city).filter(function (f) { return f.ext && f.ext.gate; }); };
  // 各接驳口的状态：是否开放、是否接通、附加费、乘地铁的过境旅客（人次/日）
  const gates = function (g) {
    const yr = g.year();
    return facs(g).map(function (f) {
      const open = CM.Fac.active(f, yr, g.city), lk = open ? CM.Fac.extLink(f, g) : null;
      const s = open ? g.model.facStats(f.id, 'avg') : null;
      return { f: f, open: open, link: lk, fee: g.econ.cross[f.id] || 0, riders: s ? s.innM + s.outM : 0, total: s ? s.inn + s.out : 0 };
    });
  };
  const connected = function (g) { const yr = g.year(); return facs(g).some(function (f) { return CM.Fac.active(f, yr, g.city) && !!CM.Fac.extLink(f, g); }); };
  // 当天的跨境附加费（元）：没接通的接驳口没有地铁乘客，自然是 0。每天都要算，不收费时不做任何查询
  const dayIncome = function (g, dt) {
    const c = g.econ.cross; let sum = 0;
    for (const id in c) { const s = c[id] > 0 ? g.model.facStats(id, dt) : null; if (s) sum += c[id] * (s.innM + s.outM); }
    return sum;
  };
  // 对岸最新的存档：只看同一模式，备份不算
  const latest = function (mode) {
    const L = info(); if (!L || !CM.Save) return null;
    // 分组顺序可能由升级前备份决定；跨进度比较正常存档的时间。
    let best = null;
    for (const G of CM.Save.list(L.map)) { if (G.mode !== mode) continue; for (const s of G.slots) if (s.kind !== 'backup' && (!best || s.savedAt > best.savedAt)) best = s; }
    return best;
  };
  const modeName = function (mode) { return mode === 'free' ? '自由建造' : '经营挑战'; };
  // 切换到对岸：先保存当前城市（保存失败时留在原地，见 backToMenu），再读对岸存档；对岸没有同模式的存档就到它的开局页面
  const switchTo = function (ui) {
    const g = ui.g(), L = info(); if (!g || !L) return;
    const s = latest(g.mode), mode = g.mode;
    ui.backToMenu(function () {
      if (s) ui.loadSlot(s.slotId);
      else { ui.showMapSelect(L.map); ui.toast(L.name + '还没有' + modeName(mode) + '的存档，可以从这里开局', 'info'); }
    });
  };

  // 图内对岸城市的范围（地图数据的 region）：接通后点击进入对岸
  const at = function (g, x, y) {
    const L = info(); if (!L || !L.region || g.preview || g.tutorial) return false;
    const r = g.city.regionAt(x, y); return !!r && r.id === L.region && connected(g);
  };
  const hoverTip = function (g, x, y) { if (!at(g, x, y)) return null; const L = info(); return { title: '进入' + L.name, lines: ['口岸已接通：点击切换到' + L.name + '（' + modeName(g.mode) + '）'] }; };
  const offer = function (ui) {
    const g = ui.g(), L = info(); if (!g || !L) return;
    const s = latest(g.mode), mn = modeName(g.mode);
    ui.confirm('进入' + L.name + '？', s ? '先保存当前进度，再读取' + L.name + '最新的' + mn + '存档「' + s.name + '」（' + s.date[0] + ' 年 ' + s.date[1] + ' 月）。两座城市各算各的，时间不同步。' : L.name + '还没有' + mn + '的存档。先保存当前进度，再到' + L.name + '的开局页面。', s ? '进入' + L.name : '前往开局', function () { switchTo(ui); }, false, 'map');
  };

  // ---------------- 对岸线网 ----------------
  const st = { g: null, nv: -1, ym: -1, checkedAt: -Infinity, key: null, loading: null, data: null, failedKey: null, retryAt: 0 };
  const clearPreview = function () { st.data = null; st.key = null; st.loading = null; st.failedKey = null; st.retryAt = 0; };
  const visible = function () { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
  const setVisible = function (on) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* 存储不可用时只是记不住 */ } st.nv = -1; };
  // 对岸的格坐标换算到本图：经纬度为中介，只留碰到本图范围的部分
  const convert = function (pv, L, meta) {
    const Pa = CM.MAPS[L.map].geo.proj, Pb = CM.GEO.proj, W = CFG.W, H = CFG.H;
    const tx = function (x) { return (Pa.lon0 + x / Pa.kx - Pb.lon0) * Pb.kx; }, ty = function (y) { return (Pb.lat0 - (Pa.lat0 - y / Pa.ky)) * Pb.ky; };
    const inside = function (x, y) { return x >= -2 && y >= -2 && x <= W + 2 && y <= H + 2; };
    const segs = [], dots = [];
    for (const s of pv.segs) {
      const p = new Float32Array(s[2].length); let hit = false;
      for (let i = 0; i + 1 < s[2].length; i += 2) {
        p[i] = tx(s[2][i]); p[i + 1] = ty(s[2][i + 1]);
        // 两端都在图外的长区段也可能穿过地图；最终由画布按地图边界裁剪。
        if (inside(p[i], p[i + 1]) || (i >= 2 && Math.max(p[i - 2], p[i]) >= -2 && Math.min(p[i - 2], p[i]) <= W + 2 && Math.max(p[i - 1], p[i + 1]) >= -2 && Math.min(p[i - 1], p[i + 1]) <= H + 2)) hit = true;
      }
      if (hit) segs.push({ c: s[0], p: p });
    }
    for (let i = 0; i + 1 < pv.st.length; i += 2) { const x = tx(pv.st[i]), y = ty(pv.st[i + 1]); if (inside(x, y)) dots.push(x, y); }
    return { segs: segs, dots: new Float32Array(dots), lines: pv.lines, stations: pv.stations, clock: pv.clock || null, name: meta.name || '', shown: segs.length };
  };
  const refresh = function (g) {
    const L = info(), s = latest(g.mode);
    if (!s) { clearPreview(); return; }
    const key = g.id + '|' + s.slotId + '|' + s.savedAt;
    if (st.key === key || st.loading === key || (st.failedKey === key && performance.now() < st.retryAt)) return;
    st.loading = key; st.data = null;
    CM.Save.linePreview(s.slotId).then(function (pv) {
      if (st.loading !== key || CM.game !== g) return;
      const current = latest(g.mode);
      if (!visible() || !connected(g) || !current || g.id + '|' + current.slotId + '|' + current.savedAt !== key) { clearPreview(); return; }
      st.loading = null; st.key = key; st.data = convert(pv, L, s);
      st.failedKey = null;
      if (CM.ui && CM.ui.opsApp && CM.ui.opsApp.state().root === 'gates') CM.ui.opsApp.refresh();
    }).catch(function (e) {
      if (st.loading !== key) return;
      st.loading = null; st.key = null; st.data = null; st.failedKey = key; st.retryAt = performance.now() + 10000;
      console.warn('对岸存档读不出来，不显示线网', e);
    });
  };
  // 线网变化时看一下是否接通；读对岸存档只在接通后、换了存档时做一次，结果缓存
  const tick = function (g) {
    if (st.g !== g) { st.g = g; st.nv = -1; st.ym = -1; clearPreview(); }
    const ym = Math.floor(g.year() * 12 + 1e-6), now = performance.now();
    if (st.nv === g.netVersion && st.ym === ym && now - st.checkedAt < 2000) return;
    st.nv = g.netVersion; st.ym = ym; st.checkedAt = now;
    if (visible() && connected(g)) refresh(g); else clearPreview();
  };
  // 叠加层：半透明，裁到地图范围内，不接受点击
  const P0 = {};
  const draw = function (R, ctx, alpha) {
    if (st.g && st.g !== CM.game) { st.g = null; st.nv = -1; st.ym = -1; clearPreview(); }
    const g = R.game; if (!g || g !== CM.game || g.preview || !info() || alpha <= 0.02 || !g.compiled) return;
    tick(g);
    const d = st.data; if (!d || !d.segs.length || !visible()) return;
    const W = CFG.W, H = CFG.H, lw = Math.max(1.4, R.lineWidthPx() * 0.7);
    ctx.save();
    ctx.beginPath();
    [[0, 0], [W, 0], [W, H], [0, H]].forEach(function (c, i) { const q = R.P(c[0], c[1], 0, {}); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.closePath(); ctx.clip();
    ctx.globalAlpha = alpha * 0.45; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = lw;
    for (const s of d.segs) {
      ctx.beginPath();
      for (let i = 0; i + 1 < s.p.length; i += 2) { const q = R.P(s.p[i], s.p[i + 1], 0, P0); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
      ctx.strokeStyle = s.c; ctx.stroke();
    }
    if (R.z >= 6) {
      const r = Math.max(1.6, lw * 0.7);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(60,72,90,.9)'; ctx.lineWidth = 1;
      for (let i = 0; i + 1 < d.dots.length; i += 2) { const q = R.P(d.dots[i], d.dots[i + 1], 0, P0); ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
  };
  CM.CityLink = {
    info: info, gates: gates, connected: connected, dayIncome: dayIncome, latest: latest, modeName: modeName, switchTo: switchTo, at: at, hoverTip: hoverTip, offer: offer,
    draw: draw, clear: function () { st.g = null; st.nv = -1; st.ym = -1; clearPreview(); }, visible: visible, setVisible: setVisible, overlay: function () { return st.data; }, loading: function () { return !!st.loading; },
    // 附加费滑块的范围：跟票价滑块同一套，按当年物价放大
    feeRange: function (g) { const R = CM.fareRangeNow(g); return { min: 0, max: Math.max(R.step, R.max), step: R.step }; },
  };
})(window.CM);
