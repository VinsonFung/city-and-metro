'use strict';
// 建设效果归因（v2.3）：把建成后的对照结果（g.impactReport）或草案预测解读成玩家关心的几个数字，
// 并回答「为什么花了这么多钱，拥堵却没有改善？」——连接了哪些住宅与就业、哪些车站客流不足、拥堵道路离新线多远、
// 改乘地铁的出行有多少来自汽车、新增运营成本与票款谁大。只解读已发布的模拟结果，不改变模拟。
(function (CM) {
  const U = CM.U, CFG = CM.CFG, h = U.h, ic = function (n, s) { return CM.icon(n, s); };
  const Impact = {};
  CM.Impact = Impact;
  const WALK = CFG.walk.maxAccessM / CFG.CELL_M;   // 步行 15 分钟约 4.5 格

  // 运营费用口径（与 Economy.day 相同）：开通前后全网车站的日运营费；列车车公里在对照结果中（carKm）
  Impact.opsInputs = function (g, beforeC, afterC) {
    const oi = g.econ.opsIndex(g.clock.y);
    const sd = function (C) { let s = 0; if (C) for (const st of C.stations) s += CFG.ops.stationDaily[st.size] || 0; return s * oi; };
    return { oi: oi, st0: sd(beforeC), st1: sd(afterC) };
  };

  // 车站步行范围内的人口与岗位（按交通小区中心，约 1 km² 一块）
  function catchment(model, st) {
    let pop = 0, jobs = 0;
    for (let z = 0; z < model.Z; z++) {
      const d = U.dist(model.zCx[z], model.zCy[z], st.x, st.y);
      if (d > WALK) continue;
      const w = d < WALK * 0.6 ? 1 : 1 - (d - WALK * 0.6) / (WALK * 0.4);
      pop += model.zPop[z] * w; jobs += model.zJobs[z] * w;
    }
    return { pop: pop, jobs: jobs };
  }
  // 沿线直达的通勤：起点小区与终点小区分别靠近本次线路上的不同车站（通勤需求表 t[0]）
  function directCommute(model, stations) {
    const od = model.od; if (!od || !od.t || !stations.length) return null;
    const Z = model.Z, near = new Int32Array(Z).fill(-1);
    for (let z = 0; z < Z; z++) {
      let best = WALK, k = -1;
      for (let i = 0; i < stations.length; i++) { const d = U.dist(model.zCx[z], model.zCy[z], stations[i].x, stations[i].y); if (d < best) { best = d; k = i; } }
      near[z] = k;
    }
    let tot = 0, direct = 0;
    const t0 = od.t[0];
    for (let z = 0; z < Z; z++) {
      if (near[z] < 0) continue;
      for (let k = od.start[z]; k < od.start[z + 1]; k++) {
        const d = od.dest[k], v = t0[k] || 0; if (!(v > 0)) continue;
        tot += v;
        if (d < Z && near[d] >= 0 && near[d] !== near[z]) direct += v;
      }
    }
    return tot > 0 ? { share: direct / tot, trips: direct } : null;
  }

  // r：impactReport 或预测结果（base / draft 为周平均日汇总）；ops 为运营费用口径（预测时由调用方给出）
  Impact.analyze = function (r, g, opts) {
    opts = opts || {};
    const a = r.base, b = r.draft; if (!a || !b) return null;
    const model = g.model, ops = r.ops || opts.ops || { oi: g.econ.opsIndex(g.clock.y), st0: 0, st1: 0 };
    const k = {
      share: (b.metroShare - a.metroShare) * 100,
      commute: (b.commute || 0) - (a.commute || 0),
      metro: b.metro - a.metro,
      car: b.car - a.car,
      cong0: a.congAM != null ? a.congAM : a.cong, cong1: b.congAM != null ? b.congAM : b.cong,
      fare: ((b.fare || 0) - (a.fare || 0)) / 10000,
      ops: ((b.carKm || 0) - (a.carKm || 0)) * CFG.ops.carKmCost * ops.oi + ops.st1 - ops.st0,
      induced: Math.max(0, (b.indM || 0) - (a.indM || 0)),
      carAll: a.car || 0,
    };
    k.net = k.fare - k.ops;
    k.netYear = k.net * 365;
    k.recover = k.ops > 0.0001 ? k.fare / k.ops : null;
    k.congDelta = k.cong1 - k.cong0;
    // 车站：客流、步行范围的人口与岗位、居住型 / 就业型（与全市「岗位 ÷ 人口」相比：明显偏低为居住，明显偏高为就业）
    const tot = g.city.totals(), cityR = tot.jobs / Math.max(1, tot.pop);
    const st = (r.stations || []).map(function (s) {
      const c = catchment(model, s), q = c.jobs / Math.max(1, c.pop) / Math.max(0.05, cityR);
      return Object.assign({}, s, { pop: c.pop, jobs: c.jobs, type: c.pop + c.jobs < 3000 ? 'thin' : (q < 0.75 ? 'home' : (q > 1.3 ? 'work' : 'mix')) });
    });
    const flows = st.map(function (s) { return s.flow; });
    const avg = flows.length ? flows.reduce(function (s, v) { return s + v; }, 0) / flows.length : 0;
    // 客流不足：明显低于本次线路的平均水平（不到四成）
    const weak = st.length >= 3 ? st.filter(function (s) { return s.flow < avg * 0.4; }).sort(function (x, y) { return x.flow - y.flow; }) : [];
    const homes = st.filter(function (s) { return s.type === 'home'; }), works = st.filter(function (s) { return s.type === 'work'; });
    const dc = directCommute(model, st);
    const connects = homes.length > 0 && works.length > 0 && (!dc || dc.share >= 0.08);
    // 拥堵道路离本次线路的车站多远
    const hot = (r.hot || []).map(function (x) {
      let d = Infinity; for (const s of st) d = Math.min(d, U.dist(s.x, s.y, x.x, x.y));
      return Object.assign({}, x, { km: d * CFG.CELL_M / 1000 });
    });
    const farHot = hot.filter(function (x) { return x.km > 2 && x.vc0 >= 1.35; });
    const maxLF = (r.lineLF || []).reduce(function (m, x) { return Math.max(m, x.lf); }, 0);
    const lineKm = (r.lineLF || []).reduce(function (m, x) { return Math.max(m, x.km || 0); }, 0);
    const riders = (r.lines || []).reduce(function (s, l) { return s + Math.max(0, (l.after || 0) - (l.before || 0)); }, 0);
    const fromCar = k.metro > 1 ? U.clamp(-k.car / k.metro, 0, 1) : 0;
    const congFlat = k.congDelta > -0.003;

    const reasons = [], tips = [];
    const names = function (list) { return list.slice(0, 3).map(function (s) { return s.name; }).join('」「'); };
    // ---- 正面因素 ----
    if (connects) reasons.push(['good', 'home', dc && dc.share >= 0.08 ? '连接了住宅与就业中心：「' + names(homes) + '」一带的居民可直达「' + names(works) + '」，沿线直达的通勤约占沿线通勤的 ' + U.fmtPct(dc.share, 0) : '连接了住宅与就业中心：「' + names(homes) + '」与「' + names(works) + '」在同一条线上']);
    else if (st.length && !works.length) reasons.push(['warn', 'home', '沿线以居住为主，缺少就业中心：早高峰乘客多为单向，列车回程空载']);
    else if (st.length && !homes.length && works.length) reasons.push(['warn', 'briefcase','沿线以就业为主，住宅区较少：上班的人还要从别处换乘过来']);
    if (k.metro > 1) reasons.push([fromCar >= 0.5 ? 'good' : 'info', 'car', '每天新增地铁出行约 ' + U.fmtPeople(k.metro) + ' 人次，其中约 ' + U.fmtPct(fromCar, 0) + ' 原本开车或乘坐其他交通' + (k.induced > 0.5 ? '，另有约 ' + U.fmtPeople(k.induced) + ' 人次是可达性改善后新增的购物、休闲出行' : '')]);
    if (r.roads && r.roads.length && !congFlat) reasons.push(['good', 'road', '「' + r.roads[0].name + '」早高峰拥堵指数 ' + r.roads[0].vc0.toFixed(2) + ' → ' + r.roads[0].vc1.toFixed(2)]);
    // 地铁出行习惯（v2.3）：这里只是开通当月的效果，之后几年还会慢慢变好
    if (st.length && CFG.habit) reasons.push(['info', 'trend', '这是开通当月的效果：新站周边居民的出行习惯会在约 ' + CFG.habit.years + ' 年内逐步转向地铁，客流还会慢慢增长、沿线道路继续缓解（拥堵图层 →「拥堵变化」→「建设以来」）']);
    // ---- 负面因素 ----
    if (weak.length) {
      const ends = weak.filter(function (s) { return s.end; });
      const list = ends.length ? ends : weak;
      reasons.push(['bad', 'station', (ends.length ? '外围车站' : '部分车站') + '「' + names(list) + '」客流不足：日均约 ' + U.fmtPeople(list[0].flow) + ' 人次，全线平均约 ' + U.fmtPeople(avg) + ' 人次']);
      tips.push(['station', ends.length ? '外围车站可以等周边开发后再建，或缩小规模；先把线路修到人口与岗位更密的地方' : '低客流车站可以缩小规模或取消，节省车站运营费']);
    }
    if (k.ops > 0.0001) reasons.push([k.net >= 0 ? 'good' : 'bad', 'coin', '每天新增票款约 ' + U.fmtMoney(k.fare) + '，新增运营成本约 ' + U.fmtMoney(k.ops) + (k.net >= 0 ? '，有盈余' : '，每年约亏损 ' + U.fmtMoney(-k.netYear))]);
    if (k.recover != null && k.recover < 0.6) reasons.push(['info', 'bank', '城市地铁大多要靠拨款补贴运营：票款覆盖新增成本的 ' + U.fmtPct(k.recover, 0) + '。客流越集中、车站越少而精，覆盖率越高']);
    if (k.net < 0 && !weak.length && lineKm > 0 && riders / Math.max(1, lineKm) < 3000) tips.push(['ticket', '线路客流强度不高（每公里每天约 ' + U.fmtPeople(riders / Math.max(1, lineKm)) + ' 人次）：可以与既有线换乘、延伸到人口密集区，或适当提高票价']);
    if (congFlat) {
      if (farHot.length) {
        reasons.push(['bad', 'road', '最拥堵的「' + farHot[0].name + '」（拥堵指数 ' + farHot[0].vc0.toFixed(2) + '）离新线最近的车站约 ' + U.fmtNum(farHot[0].km, 1) + ' km，新线分流不到这条路上的车流']);
        tips.push(['lyFlow', '打开「出行方向」图层，看「' + farHot[0].name + '」上的车从哪里来、往哪里去，沿这个方向修线']);
      }
      if (k.carAll > 0 && -k.car / k.carAll < 0.01) reasons.push(['warn', 'car', '改乘地铁的出行只占全市非地铁出行的 ' + U.fmtPct(Math.max(0, -k.car) / k.carAll, 1) + '，对整体道路拥堵影响有限']);
      if (k.metro > 1 && fromCar < 0.4) reasons.push(['warn', 'people','新增乘客多数原本步行或乘坐其他公共交通，开车的人改乘不多']);
      { const bg = CM.Eras ? CM.Eras.bg(g.year()) : null; if (bg && bg.keep >= 0.3) reasons.push(['info', 'road', '这个年代道路需求旺盛：路面空出来后，约 ' + U.fmtPct(bg.keep, 0) + ' 又被公交、货车和新增的小汽车占满，地铁未必能让路上明显变空']); }
    }
    if (maxLF > 1) {
      reasons.push(['bad', 'people', '早高峰最拥挤区段满载率约 ' + U.fmtPct(maxLF, 0) + '，拥挤降低了地铁的吸引力']);
      tips.push(['station', '升级沿线车站以加长编组，或修平行线、支线分流']);
    }
    if (k.commute > 0.05) reasons.push(['warn', 'clock', '平均通勤时间略增约 ' + U.fmtNum(k.commute, 1) + ' 分钟：部分居民为了省钱改乘地铁，算上步行与候车比开车慢一些；道路越堵、线路越直，地铁越省时间']);
    if (!tips.length && k.share > 0) tips.push(['route', '效果不错：可以在客流最大的车站做换乘，或把线路延伸到新开发的片区']);

    // ---- 一句话结论：正面因素 + 但是 + 结果 ----
    let pos = connects ? '新线路有效连接住宅与就业中心' : (k.share >= 0.3 ? '新线路吸引了不少出行改乘地铁' : (k.metro > 1 ? '新线路带来了新的地铁客流' : '这次建设对出行的影响很小'));
    let neg = '';
    if (weak.length && k.net < 0) neg = (weak.some(function (s) { return s.end; }) ? '但外围车站客流不足' : '但部分车站客流不足') + '，导致新增运营成本高于票款收入';
    else if (k.net < 0 && k.ops > 0.0001) neg = '但客流强度还不够，新增运营成本高于票款收入';
    else if (congFlat && farHot.length) neg = '但最拥堵的道路离新线较远，道路拥堵没有明显改善';
    else if (congFlat && k.metro > 1) neg = '但改乘地铁的车流相对全市很少，道路拥堵改善不明显';
    else if (maxLF > 1) neg = '但早高峰列车过于拥挤，限制了吸引力';
    else if (k.ops > 0.0001 && k.net >= 0) neg = '票款收入足以覆盖新增运营成本';
    const verdict = pos + (neg ? '，' + neg : '') + '。';
    return { k: k, stations: st, avg: avg, weak: weak, hot: hot, maxLF: maxLF, reasons: reasons, tips: tips, verdict: verdict, connects: connects, dc: dc };
  };

  // 数字从旧值滚动到新值（减少动态效果时直接显示）；元素插入页面后才开始计时（效果卡可能稍后才弹出）
  Impact.count = function (el, from, to, fmt, ms) {
    if (CM.Settings.reducedMotion() || !isFinite(from) || !isFinite(to)) { el.textContent = fmt(to); return; }
    const made = performance.now(), dur = ms || 1100; let t0 = 0;
    const step = function (now) {
      if (!el.isConnected) { if (t0 || now - made > 15000) { el.textContent = fmt(to); return; } requestAnimationFrame(step); return; }
      if (!t0) t0 = now;
      const t = U.clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = fmt(from); requestAnimationFrame(step);
  };

  // 四个关键数字：地铁出行分担、平均通勤、日客运量、运营盈亏
  Impact.kpis = function (A, pred) {
    const k = A.k, wrap = h('div', { class: 'imp-kpis' });
    const chip = function (label, icon, from, to, fmt, delta, cls, note) {
      const v = h('b', { class: 'imp-v' });
      const el = h('div', { class: 'imp-kpi ' + cls }, h('div', { class: 'imp-k' }, ic(icon, 14), label), v, h('div', { class: 'imp-d' }, delta), note ? h('div', { class: 'imp-n' }, note) : null);
      wrap.appendChild(el);
      Impact.count(v, from, to, fmt);
    };
    const pp = function (x) { return (x >= 0 ? '↑ ' : '↓ ') + U.fmtNum(Math.abs(x), 1) + ' 个百分点'; };
    chip('地铁出行分担', 'train', A.share0 * 100, A.share1 * 100, function (v) { return U.fmtNum(v, 1) + '%'; }, Math.abs(k.share) < 0.05 ? '变化不明显' : pp(k.share), k.share >= 0.05 ? 'good' : (k.share <= -0.05 ? 'bad' : 'muted'));
    chip('平均通勤时间', 'clock', A.comm0, A.comm1, function (v) { return U.fmtNum(v, 1) + ' 分钟'; }, Math.abs(k.commute) < 0.05 ? '变化不明显' : (k.commute < 0 ? '↓ ' : '↑ ') + U.fmtNum(Math.abs(k.commute), 1) + ' 分钟', k.commute <= -0.05 ? 'good' : (k.commute >= 0.05 ? 'bad' : 'muted'));
    chip('日均地铁客运量', 'people', A.metro0, A.metro1, function (v) { return U.fmtPeople(v) + ' 人次'; }, (k.metro >= 0 ? '+' : '−') + U.fmtPeople(Math.abs(k.metro)) + ' 人次', k.metro > 0.5 ? 'good' : 'muted');
    if (k.ops > 0.0001 || Math.abs(k.fare) > 0.0001) chip(pred ? '预计运营盈亏（年）' : '运营盈亏（年）', 'coin', 0, k.netYear, function (v) { return (v >= 0 ? '盈余 ' : '亏损 ') + U.fmtMoney(Math.abs(v)); }, '票款 ' + U.fmtMoney(k.fare * 365) + ' · 成本 ' + U.fmtMoney(k.ops * 365), k.net >= 0 ? 'good' : 'bad', k.recover != null ? '票款覆盖成本 ' + U.fmtPct(k.recover, 0) : null);
    return wrap;
  };

  // 完整解读：结论、原因、可以尝试、沿线车站客流
  Impact.view = function (ui, r, opts) {
    opts = opts || {};
    const g = ui.g(), A = Impact.analyze(r, g, opts); if (!A) return h('div');
    A.share0 = r.base.metroShare; A.share1 = r.draft.metroShare; A.comm0 = r.base.commute || 0; A.comm1 = r.draft.commute || 0; A.metro0 = r.base.metro; A.metro1 = r.draft.metro;
    const box = h('div', { class: 'imp' });
    if (!opts.noKpi) box.appendChild(Impact.kpis(A, opts.pred));
    box.appendChild(h('div', { class: 'imp-why' }, h('div', { class: 'imp-q' }, ic('help', 15), opts.pred ? '预计会怎样，为什么？' : '为什么出现这个结果？'), h('p', { class: 'imp-verdict' }, A.verdict),
      h('ul', { class: 'imp-reasons' }, A.reasons.map(function (x) { return h('li', { class: 'lv-' + x[0] }, ic(x[1], 14), h('span', null, x[2])); }))));
    if (A.tips.length) box.appendChild(h('div', { class: 'imp-tips' }, h('div', { class: 'imp-q' }, ic('sparkle', 15), '可以尝试'),
      h('ul', null, A.tips.map(function (x) { return h('li', null, ic(x[0], 14), h('span', null, x[1])); }))));
    if (A.stations.length && !opts.compact) {
      const mx = Math.max(1, ...A.stations.map(function (s) { return s.flow; }));
      const weakIds = new Set(A.weak.map(function (s) { return s.id; }));
      const TYPE = { home: '居住', work: '就业', mix: '混合', thin: '人少' };
      box.appendChild(ui.sec('imp-st', '沿线车站日客流（周平均）', A.stations.length + ' 座', function () {
        return h('div', { class: 'imp-bars' }, A.stations.map(function (s) {
          return h('div', { class: 'imp-bar' + (weakIds.has(s.id) ? ' weak' : ''), onclick: function () { if (g.net.stations[s.id]) ui.select({ kind: 'station', id: s.id }); ui.flyTo(s.x, s.y, Math.max(ui.R.cam.zoom, 22)); } },
            h('span', { class: 'imp-bn' }, s.name), h('span', { class: 'imp-bt tiny' }, TYPE[s.type]),
            h('span', { class: 'imp-bw' }, h('i', { style: { width: (s.flow / mx * 100).toFixed(1) + '%' } })), h('b', { class: 'imp-bv' }, U.fmtPeople(s.flow)));
        }));
      }, !!opts.open));
    }
    return box;
  };

  // 开通效果卡（教程首条线路等）：动画数字 + 一句话结论，可打开完整报告
  Impact.card = function (ui, r, opts) {
    opts = opts || {};
    const g = ui.g(), A = Impact.analyze(r, g); if (!A) return;
    A.share0 = r.base.metroShare; A.share1 = r.draft.metroShare; A.comm0 = r.base.commute || 0; A.comm1 = r.draft.commute || 0; A.metro0 = r.base.metro; A.metro1 = r.draft.metro;
    const close = function () { ui.closeScreen(); if (opts.onClose) opts.onClose(); };
    const card = h('div', { class: 'card imp-card' },
      h('div', { class: 'imp-hero' }, h('span', { class: 'imp-burst' }, ic('sparkle', 22)), h('div', { class: 'grow' }, h('div', { class: 'tiny muted' }, opts.kicker || '建设效果'), h('h2', null, opts.title || '新线路开通了！'))),
      Impact.kpis(A, false),
      h('p', { class: 'imp-verdict' }, A.verdict),
      opts.extra || null,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: function () { ui.closeScreen(); ui.openPage('impact', null, { root: true }); if (opts.onReport) opts.onReport(); } }, ic('chart', 14), '查看建设效果报告'),
        h('button', { class: 'btn primary', onclick: close }, opts.ok || '继续', ic('chev', 14))));
    ui.openScreen(card, close, 'imp-screen');
    if (CM.Sound) CM.Sound.play('fanfare');
  };
})(window.CM);
