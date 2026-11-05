'use strict';
// 城市里程碑：只记录城市发展与地铁建设中最关键的节点（首条线路、首座换乘站、首次跨江、里程与客流跨越整数关口、
// 人口跨越关口、本地图的重大历史事件与地标落成）。记录随存档保存；旧存档按历史记录补记可推断的节点。
(function (CM) {
  const U = CM.U, CFG = CM.CFG, M = CM.Metro, D = CM.DATA;

  const CAT = {
    metro: { name: '地铁建设', color: '#1e6fd9' },
    ride: { name: '客流', color: '#0f9488' },
    city: { name: '城市发展', color: '#d97706' },
    history: { name: '历史事件', color: '#7c4dcc' },
  };
  const POP = [1e5, 2e5, 3e5, 5e5, 7e5, 1e6, 1.5e6, 2e6, 2.5e6, 3e6, 4e6, 5e6, 6e6, 7e6, 8e6, 9e6, 1e7, 1.2e7, 1.5e7, 2e7];
  const RIDE = [1e5, 3e5, 5e5, 1e6, 2e6, 3e6, 5e6, 8e6, 1e7];
  const KM = [10, 50, 100, 200, 300, 500, 800];
  const LINES = [5, 10, 15, 20];
  const SHARE = [0.1, 0.2, 0.3, 0.4, 0.5];
  const fmtN = function (v) { return v >= 1e8 ? U.fmtNum(v / 1e8, 1) + ' 亿' : (v >= 1e4 ? (v / 1e4 >= 100 ? Math.round(v / 1e4) : U.fmtNum(v / 1e4, v % 1e4 ? 1 : 0)) + ' 万' : String(Math.round(v))); };

  function state(g) { if (!g.milestones) g.milestones = { list: [], done: {} }; return g.milestones; }
  function add(g, id, o, when) {
    const st = state(g); if (st.done[id]) return null;
    st.done[id] = 1;
    const w = when || g.clock;
    const r = Object.assign({ id: id, y: w.y, m: w.m, d: w.d || 1 }, o);
    st.list.push(r);
    st.list.sort(function (a, b) { return (a.y - b.y) || (a.m - b.m) || ((a.d || 1) - (b.d || 1)); });
    if (!when && g.emit) g.emit('milestone', r);
    return r;
  }

  // 同一系列一次跨过多个关口（如一次建成多条线路）：都记入城市纪事，只为最高的关口弹出庆祝
  function series(g, arr, ok, id, make) {
    const st = state(g), hit = arr.filter(function (k) { return ok(k) && !st.done[id + k]; });
    hit.forEach(function (k, i) { add(g, id + k, make(k), i < hit.length - 1 ? g.clock : undefined); });
  }
  // ---------- 网络状态 ----------
  function netInfo(g) {
    const C = g.compiled, net = g.net;
    let km = 0, crossM = 0, river = null;
    if (C && C.segs) C.segs.forEach(function (cs) {
      if (!cs.g) return;
      km += cs.g.lenM / 1000;
      if (cs.g.waterM > 30 && cs.g.waterM > crossM) {
        crossM = cs.g.waterM;
        const a = net.stations[cs.seg.a], b = net.stations[cs.seg.b];
        if (a && b) river = g.city.riverNameAt((a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    });
    let lines = 0, loop = null, xfer = null, first = null;
    for (const lid of M.sortIds(Object.keys(net.lines))) {
      const tp = M.lineTopo(net, lid);
      if (!tp.stations || tp.stations.length < 2 || tp.topo === 'invalid' || tp.topo === 'empty') continue;
      lines++;
      if (!first) first = { L: net.lines[lid], tp: tp };
      if (tp.topo === 'loop' && !loop) loop = net.lines[lid];
    }
    for (const id in net.stations) if (M.stationLines(net, id).length >= 2) { xfer = net.stations[id]; break; }
    return { km: km, lines: lines, river: river, crossM: crossM, loop: loop, xfer: xfer, first: first };
  }

  // 建设确认后：地铁建设类里程碑
  function onNetwork(g) {
    const n = netInfo(g);
    if (n.first && !(g.mapInit && g.mapInit.metro)) {
      const tp = n.first.tp, a = g.net.stations[tp.stations[0]], b = g.net.stations[tp.stations[tp.stations.length - 1]];
      add(g, 'first-line', { cat: 'metro', icon: 'train', big: true, title: (D.city || '城市') + '第一条地铁开通', desc: n.first.L.name + (a && b ? ' ' + a.name + '—' + b.name : '') + '，' + tp.stations.length + ' 座车站' });
    }
    if (n.xfer) add(g, 'first-xfer', { cat: 'metro', icon: 'network', title: '第一座换乘站', desc: '「' + n.xfer.name + '」连接 ' + M.stationLines(g.net, n.xfer.id).map(function (l) { return g.net.lines[l].name; }).join('、') });
    if (n.river) add(g, 'first-cross', { cat: 'metro', icon: 'route', big: true, title: '地铁首次跨越' + n.river, desc: '跨水区段约 ' + U.fmtKm(n.crossM) + '，两岸由地铁直接相连' });
    if (n.loop) add(g, 'first-loop', { cat: 'metro', icon: 'route', title: '第一条环线建成', desc: n.loop.name + '首尾相接，形成环线' });
    series(g, KM, function (k) { return n.km >= k; }, 'km-', function (k) { return { cat: 'metro', icon: 'metro', big: k >= 100, title: '地铁总里程突破 ' + k + ' 公里', desc: '目前 ' + n.lines + ' 条线路，共 ' + U.fmtNum(n.km, 1) + ' km' }; });
    series(g, LINES, function (k) { return n.lines >= k; }, 'lines-', function (k) { return { cat: 'metro', icon: 'network', title: '地铁线路达到 ' + k + ' 条', desc: '网络总里程 ' + U.fmtNum(n.km, 0) + ' km' }; });
  }

  // 每月：城市与客流类里程碑
  function onMonth(g) {
    const d = g.model.daily || {}, tot = g.city.totals(), st = state(g);
    const pop0 = st.pop0 || (st.pop0 = g.history.length ? g.history[0].pop : tot.pop);
    series(g, POP, function (k) { return k > pop0 * 1.04 && tot.pop >= k; }, 'pop-', function (k) { return { cat: 'city', icon: 'people', big: k >= 1e6 && k % 1e6 === 0 && k >= pop0 * 1.3, title: '城市人口突破 ' + fmtN(k), desc: '地图范围内常住人口约 ' + U.fmtPeople(tot.pop) }; });
    // 开局既有地铁（如东京银座线）：开局时已达到的客流门槛不再记为里程碑
    if (g.mapInit && g.mapInit.metro && st.ride0 == null) {
      st.ride0 = d.metro || 0; st.share0 = d.metroShare || 0;
      for (const k of RIDE) if (k <= st.ride0 * 1.1) st.done['ride-' + k] = 1;
      for (const k of SHARE) if (k <= st.share0 * 1.1) st.done['share-' + k] = 1;
    }
    if (g.compiled.stations.length) {
      series(g, RIDE, function (k) { return (d.metro || 0) >= k; }, 'ride-', function (k) { return { cat: 'ride', icon: 'people', big: k >= 1e6, title: '地铁日客运量突破 ' + fmtN(k) + ' 人次', desc: '日均（周平均）' + U.fmtPeople(d.metro) + ' 人次，分担率 ' + U.fmtPct(d.metroShare || 0, 1) }; });
      series(g, SHARE, function (k) { return (d.metroShare || 0) >= k; }, 'share-', function (k) { return { cat: 'ride', icon: 'metro', title: '地铁分担率达到 ' + Math.round(k * 100) + '%', desc: '每 ' + Math.round(1 / k) + ' 次出行就有 1 次乘地铁' }; });
      if ((d.coverage || 0) >= 0.5) add(g, 'cover-50', { cat: 'ride', icon: 'station', title: '地铁覆盖过半人口', desc: U.fmtPct(d.coverage, 0) + ' 的居民步行 15 分钟可到达地铁站' });
    }
  }
  // 历史事件（本地图事件表中的重大事件）
  function onEvent(g, e, k) {
    if (!e || k === 0 || e.noMilestone) return;
    add(g, 'ev-' + (e.id || k), { cat: 'history', icon: 'flag', tag: e.tag, title: e.title, desc: e.desc || '' });
  }
  // 重大地标落成：高楼（≥ 300 m）与大型公共建筑
  const BIG = ['tvtower', 'expo', 'opera', 'stadium', 'rail', 'conference', 'lattice'];
  function onLandmarks(g, before) {
    D.landmarks.forEach(function (lm, k) {
      if (before[k] || !g.city.landmarkOn[k] || lm.year <= CFG.START.y) return;
      if (!((lm.h || 0) >= 300 || BIG.indexOf(lm.kind) >= 0 || lm.major)) return;
      // 已有同年历史事件提到该地标时不重复记录
      if ((D.events || []).some(function (e) { return e.y === lm.year && e.title.indexOf(lm.name) >= 0; })) return;
      add(g, 'lm-' + (lm.id || k), { cat: 'city', icon: 'building', title: lm.name + '落成', desc: lm.h ? '高约 ' + lm.h + ' m，成为城市新的地标。' : '新的城市地标出现在地图上，周边的出行也会随之增加。' });
    });
  }
  // 系统填海形成的新土地
  function onReclaim(g, r) { if (r.minor) return; add(g, 'reclaim-' + r.id, { cat: 'city', icon: 'map', big: !!r.big, title: '填海成陆：' + r.name, desc: r.desc || '' }); }
  // 开局：起点与（若有）接管的既有地铁
  function onStart(g) {
    add(g, 'start', { cat: 'history', icon: 'flag', title: (g.startYear || CFG.START.y) + ' 年 · ' + (D.city || '城市') + '，从这里开始', desc: g.startYear ? '自由建造：从 ' + g.startYear + ' 年开始，此前的城市发展按历史资料推演。' : ((D.events && D.events[0] && D.events[0].desc) || '') });
    if (g.mapInit && g.mapInit.metro) add(g, 'inherit', { cat: 'metro', icon: 'train', big: true, title: '接管既有地铁', desc: g.mapInit.metro });
  }
  // 历史发展阶段（v2.2）：阶段开始（背景为史实 / 估算）与上一阶段的总结（游戏模拟结果）；记在城市纪事，不弹出庆祝
  function onEra(g, era, rec, kind) {
    if (!era) return;
    if (kind === 'end') add(g, 'eraend-' + era.id, { cat: 'city', icon: 'chart', title: '阶段总结：' + era.name, desc: rec && rec.text ? rec.text : '', tag: '模拟' }, g.clock);
    else add(g, 'era-' + era.id, { cat: 'history', icon: 'calYear', big: true, title: '进入「' + era.name + '」', desc: era.summary || '', tag: era.tag || '史实' }, g.clock);
  }
  // 旧存档：按月度历史补记可推断的里程碑（日期取首次达到的月份），其余按当前状态补记
  function backfill(g) {
    if (g.milestones) return;
    const st = state(g), H = g.history || [];
    const t0 = H.length ? { y: H[0].y, m: H[0].m, d: 1 } : g.clock;
    add(g, 'start', { cat: 'history', icon: 'flag', title: (H.length ? H[0].y : CFG.START.y) + ' 年 · ' + (D.city || '城市') + '，从这里开始', desc: '' }, t0);
    st.pop0 = H.length ? H[0].pop : g.city.totals().pop;
    for (const r of H) {
      const w = { y: r.y, m: r.m, d: 1 };
      for (const k of POP) if (k > st.pop0 * 1.04 && r.pop >= k) add(g, 'pop-' + k, { cat: 'city', icon: 'people', title: '城市人口突破 ' + fmtN(k), desc: '地图范围内常住人口约 ' + U.fmtPeople(r.pop) }, w);
      if (r.stations > 1) add(g, 'first-line', { cat: 'metro', icon: 'train', big: true, title: (D.city || '城市') + '第一条地铁开通', desc: '' }, w);
      for (const k of RIDE) if ((r.riders || 0) >= k) add(g, 'ride-' + k, { cat: 'ride', icon: 'people', title: '地铁日客运量突破 ' + fmtN(k) + ' 人次', desc: '' }, w);
      for (const k of SHARE) if ((r.share || 0) >= k) add(g, 'share-' + k, { cat: 'ride', icon: 'metro', title: '地铁分担率达到 ' + Math.round(k * 100) + '%', desc: '' }, w);
      if ((r.coverage || 0) >= 0.5) add(g, 'cover-50', { cat: 'ride', icon: 'station', title: '地铁覆盖过半人口', desc: '' }, w);
    }
    (D.events || []).forEach(function (e, k) {
      if (k === 0 || e.noMilestone || !g.firedEvents || !g.firedEvents[k]) return;
      add(g, 'ev-' + (e.id || k), { cat: 'history', icon: 'flag', tag: e.tag, title: e.title, desc: e.desc || '' }, { y: e.y, m: e.m, d: 1 });
    });
    // 网络类：无法推断日期的按读档时补记（不弹出提示）
    const n = netInfo(g), now = { y: g.clock.y, m: g.clock.m, d: g.clock.d };
    if (n.xfer) add(g, 'first-xfer', { cat: 'metro', icon: 'network', title: '第一座换乘站', desc: '「' + n.xfer.name + '」（读档时补记）' }, now);
    if (n.river) add(g, 'first-cross', { cat: 'metro', icon: 'route', title: '地铁首次跨越' + n.river, desc: '（读档时补记）' }, now);
    if (n.loop) add(g, 'first-loop', { cat: 'metro', icon: 'route', title: '第一条环线建成', desc: n.loop.name + '（读档时补记）' }, now);
    for (const k of KM) if (n.km >= k) add(g, 'km-' + k, { cat: 'metro', icon: 'metro', title: '地铁总里程突破 ' + k + ' 公里', desc: '（读档时补记）' }, now);
  }
  // 下一个目标：给统计页的进度卡
  function next(g) {
    const d = g.model.daily || {}, tot = g.city.totals(), n = netInfo(g), st = state(g), out = [];
    const nx = function (arr, v, pre) { for (const k of arr) if (!st.done[pre + k] && k > v) return k; return null; };
    const p = nx(POP, tot.pop, 'pop-'); if (p) out.push({ icon: 'people', label: '人口', cur: tot.pop, goal: p, text: U.fmtPeople(tot.pop) + ' / ' + fmtN(p), color: CAT.city.color });
    const k = nx(KM, n.km, 'km-'); if (k) out.push({ icon: 'metro', label: '地铁里程', cur: n.km, goal: k, text: U.fmtNum(n.km, 1) + ' / ' + k + ' km', color: CAT.metro.color });
    const r = nx(RIDE, d.metro || 0, 'ride-'); if (r) out.push({ icon: 'train', label: '日客运量', cur: d.metro || 0, goal: r, text: U.fmtPeople(d.metro || 0) + ' / ' + fmtN(r), color: CAT.ride.color });
    const s = nx(SHARE, d.metroShare || 0, 'share-'); if (s) out.push({ icon: 'chart', label: '分担率', cur: d.metroShare || 0, goal: s, text: U.fmtPct(d.metroShare || 0, 1) + ' / ' + Math.round(s * 100) + '%', color: CAT.ride.color });
    return out;
  }

  CM.Milestones = { CAT: CAT, state: state, onNetwork: onNetwork, onMonth: onMonth, onEvent: onEvent, onLandmarks: onLandmarks, onReclaim: onReclaim, onStart: onStart, onEra: onEra, backfill: backfill, next: next, netInfo: netInfo };
})(window.CM);
