'use strict';
// 历史发展阶段（v2.2）：各地图在 DATA.eras 中描述若干阶段——时间、背景（史实 / 估算）、片区人口与就业的增长倾向、
// 就业与人口疏解、主要出行走廊、各目的出行强度与通勤距离、阶段目标。本模块把它们按时间平滑混合成直接可用的系数：
// · city.growMonth：片区增长权重与疏解（只改变增长在空间上的分配，总量仍按人口与岗位曲线；地铁对总量的影响仍以
//   growth.metroBoostMax 为上限，历史增长与地铁带来的增长不重复计算）
// · sim.js：各目的出行率、距离衰减与区域间走廊（改变去向，不凭空增加出行）；背景交通（电车、普通铁路、渡轮与步行）
// · 历史事件 fx：以事件日期为起点的限时效果（片区开发、大型活动的出行高峰、满意度），按时间计算，不依赖是否已触发，
//   因此不会重复结算，读档、跳月与自定义起始年份结果一致
// · 每月结算时记录阶段开始与结束，阶段结束时生成总结（g.eraLog，随存档保存）
(function (CM) {
  const U = CM.U, D = CM.DATA;
  const Eras = {};
  CM.Eras = Eras;
  const TRANS = 1.5;   // 阶段交界前后各 1.5 年平滑过渡（smoothstep），不在某一年突然改变
  const smooth = function (x) { x = U.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const list = function () { return D.eras || []; };
  Eras.enabled = function () { return list().length > 0; };

  // 时刻 t（年，含小数）各阶段的权重
  Eras.weights = function (t) {
    const L = list(), n = L.length; if (!n) return null;
    const w = new Array(n).fill(0);
    let i = 0; while (i + 1 < n && t >= L[i + 1].from) i++;
    w[i] = 1;
    if (i + 1 < n && t > L[i + 1].from - TRANS) { const a = smooth((t - (L[i + 1].from - TRANS)) / (2 * TRANS)); w[i] = 1 - a; w[i + 1] = a; }
    else if (i > 0 && t < L[i].from + TRANS) { const a = smooth((t - (L[i].from - TRANS)) / (2 * TRANS)); w[i - 1] = 1 - a; w[i] = a; }
    return w;
  };
  // 当前所处阶段（权重最大者）
  Eras.index = function (t) { const w = Eras.weights(t); if (!w) return -1; let b = 0; for (let k = 1; k < w.length; k++) if (w[k] >= w[b]) b = k; return b; };
  Eras.current = function (t) { const k = Eras.index(t); return k >= 0 ? list()[k] : null; };
  Eras.endOf = function (k) { const L = list(); return k + 1 < L.length ? L[k + 1].from : null; };

  // 历史事件的限时效果：事件日期起 years / months 内全效，之后 fade 年内线性减弱
  const evStart = function (e) { return e.y + ((e.m || 1) - 1) / 12; };
  const fxLevel = function (t, t0, dur, fade) {
    const age = t - t0, eps = 1e-9;   // 月界的两种小数年表示可能相差浮点尾数
    if (age < -eps) return 0;
    if (age < dur - eps) return 1;
    return fade > 0 ? U.clamp(1 - Math.max(0, age - dur) / fade, 0, 1) : 0;
  };
  // 城市经济事件（CFG.macro.events，如疫情）也可带出行效果；经济影响仍由 macro.js 结算
  const macroEvents = function () { const c = CM.CFG && CM.CFG.macro; return c && typeof c === 'object' && c.events ? c.events.filter(function (e) { return e.fx; }) : []; };
  const evFx = function (t, key) {
    const out = [];
    for (const e of (D.events || []).concat(macroEvents())) {
      const f = e.fx && e.fx[key]; if (!f) continue;
      const t0 = evStart(e), dur = f.years != null ? f.years : (f.months || 1) / 12, lv = fxLevel(t, t0, dur, f.fade != null ? f.fade : (key === 'grow' ? 2 : 0));
      if (lv > 0) out.push({ f: f, lv: lv, e: e });
    }
    return out;
  };
  const blendMap = function (w, pick) {   // 加权几何平均：Π m_i^{w_i}
    const L = list(), acc = {};
    for (let k = 0; k < L.length; k++) {
      if (!w[k]) continue;
      const m = pick(L[k]) || {};
      for (const id in m) acc[id] = (acc[id] || 0) + w[k] * Math.log(Math.max(1e-3, m[id]));
    }
    // 未在某阶段列出的片区该阶段视为 1（ln 1 = 0），上面的累加已体现
    const out = {}; for (const id in acc) out[id] = Math.exp(acc[id]); return out;
  };

  // 片区增长系数与疏解（按月缓存）：pop / jobs 为增长权重倍数；relocJ / relocP 为每月迁出的比例（就业中心迁移、旧城疏解）
  Eras.regionFactors = function (city, t) {
    const key = Math.round(t * 12) + ':' + city.regions.length;
    if (city._eraF && city._eraF.key === key) return city._eraF;
    const R = city.regions.length, pop = new Float32Array(R).fill(1), jobs = new Float32Array(R).fill(1), relocJ = new Float32Array(R), relocP = new Float32Array(R);
    const idx = new Map(); city.regions.forEach(function (r, k) { idx.set(r.id, k); });
    const w = Eras.weights(t);
    if (w) {
      const P = blendMap(w, function (e) { return e.grow && e.grow.pop; }), J = blendMap(w, function (e) { return e.grow && e.grow.jobs; });
      for (const id in P) if (idx.has(id)) pop[idx.get(id)] = P[id];
      for (const id in J) if (idx.has(id)) jobs[idx.get(id)] = J[id];
      const L = list();
      for (let k = 0; k < L.length; k++) {
        if (!w[k]) continue;
        const rl = L[k].relocate || {};
        for (const id in rl.jobs || {}) if (idx.has(id)) relocJ[idx.get(id)] += w[k] * rl.jobs[id];
        for (const id in rl.pop || {}) if (idx.has(id)) relocP[idx.get(id)] += w[k] * rl.pop[id];
      }
    }
    for (const x of evFx(t, 'grow')) {
      const ids = [].concat(x.f.region);
      for (const id of ids) { if (!idx.has(id)) continue; const k = idx.get(id); if (x.f.pop) pop[k] *= Math.pow(x.f.pop, x.lv); if (x.f.jobs) jobs[k] *= Math.pow(x.f.jobs, x.lv); }
    }
    // 提前布局的回报（v2.6）：开发开始时已经通地铁的片区，之后若干年增长更快
    for (const f of D.foresight || []) {
      const st = city.foresight && city.foresight[f.id]; if (!st || !st.hit || !f.grow) continue;
      const lv = fxLevel(t, f.ym[0] + (f.ym[1] - 1) / 12, f.grow.years, 2); if (!(lv > 0)) continue;
      for (const id of [].concat(f.grow.region)) { if (!idx.has(id)) continue; const k = idx.get(id); if (f.grow.pop) pop[k] *= Math.pow(f.grow.pop, lv); if (f.grow.jobs) jobs[k] *= Math.pow(f.grow.jobs, lv); }
    }
    city._eraF = { key: key, pop: pop, jobs: jobs, relocJ: relocJ, relocP: relocP };
    return city._eraF;
  };

  // 出行需求系数：rate 各目的出行率倍数（hw sc sh md lz）、decayHW / decayHO 距离衰减长度倍数、hub 枢纽接驳倍数、
  // corr 区域间走廊 [{a, b, f}]（作用于通勤与购物的去向）；叠加大型活动等历史事件的出行高峰（fx.demand）
  const PK = ['hw', 'sc', 'sh', 'md', 'lz'];
  Eras.demand = function (t) {
    const w = Eras.weights(t), L = list();
    const out = { rate: [1, 1, 1, 1, 1], decayHW: 1, decayHO: 1, hub: 1, corr: [] };
    if (w) {
      const lnr = [0, 0, 0, 0, 0]; let lhw = 0, lho = 0, lhub = 0;
      const pairs = new Map();
      for (let k = 0; k < L.length; k++) {
        if (!w[k]) continue;
        const d = L[k].demand || {};
        PK.forEach(function (p, q) { if (d[p]) lnr[q] += w[k] * Math.log(d[p]); });
        if (d.decayHW) lhw += w[k] * Math.log(d.decayHW);
        if (d.decayHO) lho += w[k] * Math.log(d.decayHO);
        if (d.hub) lhub += w[k] * Math.log(d.hub);
        for (const c of L[k].corridors || []) { const key = c.a + '|' + c.b; pairs.set(key, (pairs.get(key) || 0) + w[k] * Math.log(c.f)); }
      }
      out.rate = lnr.map(Math.exp); out.decayHW = Math.exp(lhw); out.decayHO = Math.exp(lho); out.hub = Math.exp(lhub);
      pairs.forEach(function (v, key) { const ab = key.split('|'); if (Math.abs(v) > 1e-4) out.corr.push({ a: ab[0], b: ab[1], f: Math.exp(v) }); });
    }
    for (const x of evFx(t, 'demand')) {
      PK.forEach(function (p, q) { if (x.f[p]) out.rate[q] *= Math.pow(x.f[p], x.lv); });
      if (x.f.hub) out.hub *= Math.pow(x.f.hub, x.lv);
    }
    return out;
  };
  // 历史事件的满意度效果（如大型活动期间的城市自豪感、灾害），按时间计算
  Eras.satBonus = function (t) { return evFx(t, 'sat').map(function (x) { return { label: x.e.title, v: (x.f.v || 0) * x.lv }; }); };
  // 财政与造价的事件效果（v2.6，fx.finance：战争时期拨款减少、造价提高）。按时间计算，读档与跳月结果一致；只有用到的地图才逐事件计算
  const NO_FIN = { grant: 1, cost: 1 };
  let finCache = null;
  Eras.finance = function (t) {
    if (!finCache || finCache.ev !== D.events) finCache = { ev: D.events, any: (D.events || []).some(function (e) { return e.fx && e.fx.finance; }), t: null, v: NO_FIN };
    if (!finCache.any) return NO_FIN;
    if (finCache.t === t) return finCache.v;
    let grant = 1, cost = 1;
    for (const x of evFx(t, 'finance')) { if (x.f.grant) grant *= Math.pow(x.f.grant, x.lv); if (x.f.cost) cost *= Math.pow(x.f.cost, x.lv); }
    finCache.t = t; finCache.v = { grant: grant, cost: cost };
    return finCache.v;
  };
  // 一次性的打击（v2.6，fx.strike：空袭、疏散）：事件触发的当月按比例减少所列片区的人口与岗位，只结算一次（随 firedEvents 记录）。
  // 之后的恢复与迁移交给人口曲线与片区增长，所以战后重建是一个可见的过程
  Eras.applyStrike = function (g, e) {
    const s = e.fx && e.fx.strike; if (!s) return null;
    const city = g.city, ids = new Set([].concat(s.region));
    let dp = 0, dj = 0;
    for (let c = 0; c < city.N; c++) {
      if (!ids.has(city.regions[city.region[c]].id)) continue;
      const p = city.pop[c] * (s.pop || 0), j = city.jobs[c] * (s.jobs || 0);
      if (p > 0) { city.pop[c] -= p; dp += p; }
      if (j > 0) { city.jobs[c] -= j; dj += j; }
    }
    return { pop: dp, jobs: dj };
  };
  // 提前布局（v2.6，D.foresight）：到某个日期检查某一带是否已经有更早建成的车站。有：发一笔开发商出资、之后增长更快；没有：只记录一句。
  // 每项只判定一次，结果随存档保存（g.foresight）
  Eras.foresightMonth = function (g, y, m) {
    const L = D.foresight; if (!L) return [];
    const done = g.foresight || (g.foresight = {}), out = [], M = CM.Metro, net = g.net;
    for (const f of L) {
      if (done[f.id] || U.ymIndex(y, m) < U.ymIndex(f.ym[0], f.ym[1])) continue;
      // 旧存档或较晚开局时已经过了判定日期：只标记，不补发消息与奖励
      if (U.ymIndex(y, m) - U.ymIndex(f.ym[0], f.ym[1]) > 1) { done[f.id] = { hit: false, st: null, y: y, m: m, late: true }; g.city.foresight = done; continue; }
      const before = U.ymIndex(f.before, 1); let hit = null;
      for (const id in net.stations) {
        const s = net.stations[id]; if (U.dist(s.x, s.y, f.x, f.y) > f.r || !s.built || U.ymIndex(s.built[0], s.built[1] || 1) >= before) continue;
        if (M.stationLines(net, id).length) { hit = s; break; }
      }
      done[f.id] = { hit: !!hit, st: hit ? hit.name : null, y: y, m: m };
      let reward = 0;
      if (hit && f.rewardMonths) { reward = g.econ.grantQuota(y, m) / Eras.finance(y + (m - 1) / 12).grant * f.rewardMonths; g.econ.income('reward', reward); g.econ.log('reward', reward, 'gen', '提前布局：' + f.title, { y: y, m: m, d: 1 }); }
      g.city.foresight = done;
      out.push({ f: f, hit: hit, reward: reward });
    }
    return out;
  };
  // 事件效果说明（记入城市纪事，标明为模拟影响）
  const DK = { hw: '通勤出行', sc: '上学出行', sh: '购物出行', md: '就医出行', lz: '休闲出行', hub: '枢纽客流' };
  const durText = function (f, def) { return f.years != null ? '此后 ' + f.years + ' 年内' : '此后 ' + (f.months || def) + ' 个月内'; };
  Eras.fxNote = function (e, only) {   // only：只描述这些效果（日期页列出仍在生效的部分）
    const f = e.fx; if (!f) return '';
    const parts = [];
    const rn = function (id) { const r = (D.regions || []).concat(D.defaultRegion ? [D.defaultRegion] : []).find(function (x) { return x.id === id; }); return r ? String(r.name).replace(/（.*）/, '') : id; };
    if (f.grow && (!only || only.has('grow'))) {
      const g = f.grow, up = (g.pop || 1) >= 1 && (g.jobs || 1) >= 1;
      const what = g.pop && g.jobs ? '人口与岗位增长' : g.pop ? '人口增长' : '岗位增长';
      parts.push(durText(g, 12) + '，' + [].concat(g.region).map(rn).join('、') + what + (up ? '加快' : '放缓'));
    }
    if (f.demand && (!only || only.has('demand'))) {
      const d = f.demand, items = [];
      for (const k in DK) if (d[k] && d[k] !== 1) items.push(DK[k] + (d[k] > 1 ? '增加' : '减少'));
      if (items.length) parts.push(durText(d, 1) + '，' + items.join('、'));
    }
    if (f.sat && f.sat.v && (!only || only.has('sat'))) parts.push(durText(f.sat, 1) + '，市民满意度' + (f.sat.v > 0 ? '提高' : '下降'));
    if (f.finance && (!only || only.has('finance'))) {
      const items = [];
      if (f.finance.grant && f.finance.grant !== 1) items.push('地铁拨款' + (f.finance.grant < 1 ? '减少约 ' : '增加约 ') + Math.round(Math.abs(1 - f.finance.grant) * 100) + '%');
      if (f.finance.cost && f.finance.cost !== 1) items.push('建设造价' + (f.finance.cost > 1 ? '提高约 ' : '降低约 ') + Math.round(Math.abs(f.finance.cost - 1) * 100) + '%');
      if (items.length) parts.push(durText(f.finance, 12) + '，' + items.join('、'));
    }
    if (f.car && !only) parts.push('此后开车成本提高约 ' + Math.round((f.car.k - 1) * 100) + '%');
    if (f.strike && !only) {
      const s = f.strike, items = [];
      if (s.pop) items.push('人口减少约 ' + Math.round(s.pop * 100) + '%');
      if (s.jobs) items.push('岗位减少约 ' + Math.round(s.jobs * 100) + '%');
      if (items.length) parts.push('当月' + [].concat(s.region).map(rn).join('、') + items.join('、'));
    }
    return parts.length ? '（模拟影响：' + parts.join('；') + '）' : '';
  };
  // 事件效果的简短标签（「历史时刻」卡片）：[{ icon, text, up, region }]
  Eras.fxChips = function (f) {
    if (!f) return [];
    const out = [];
    const rn = function (id) { const r = (D.regions || []).concat(D.defaultRegion ? [D.defaultRegion] : []).find(function (x) { return x.id === id; }); return r ? String(r.name).replace(/（.*）/, '') : id; };
    const dur = function (x, def) { return x.years != null ? x.years + ' 年内' : (x.months || def) + ' 个月内'; };
    if (f.grow) {
      const g = f.grow, up = (g.pop || 1) >= 1 && (g.jobs || 1) >= 1, ids = [].concat(g.region);
      out.push({ icon: 'building', up: up, region: ids[0], text: ids.map(rn).join('、') + ' ' + (g.pop && g.jobs ? '人口与岗位' : g.pop ? '人口' : '岗位') + (up ? '增长加快' : '增长放缓') + ' · ' + dur(g, 12) });
    }
    if (f.demand) {
      const d = f.demand, ups = [], downs = [];
      for (const k in DK) if (d[k] && d[k] !== 1) (d[k] > 1 ? ups : downs).push(DK[k].replace(/出行|客流/, ''));
      if (ups.length) out.push({ icon: 'people', up: true, text: ups.join('、') + '出行增加 · ' + dur(d, 1) });
      if (downs.length) out.push({ icon: 'people', up: false, text: downs.join('、') + '出行减少 · ' + dur(d, 1) });
    }
    if (f.sat && f.sat.v) out.push({ icon: f.sat.v > 0 ? 'smile' : 'frown', up: f.sat.v > 0, text: '满意度' + (f.sat.v > 0 ? '提高' : '下降') + ' · ' + dur(f.sat, 1) });
    if (f.finance) {
      if (f.finance.grant && f.finance.grant !== 1) out.push({ icon: 'coin', up: f.finance.grant > 1, text: '地铁拨款' + (f.finance.grant < 1 ? '减少约 ' : '增加约 ') + Math.round(Math.abs(1 - f.finance.grant) * 100) + '% · ' + dur(f.finance, 12) });
      if (f.finance.cost && f.finance.cost !== 1) out.push({ icon: 'coin', up: f.finance.cost < 1, text: '建设造价' + (f.finance.cost > 1 ? '提高约 ' : '降低约 ') + Math.round(Math.abs(f.finance.cost - 1) * 100) + '% · ' + dur(f.finance, 12) });
    }
    if (f.car) out.push({ icon: 'car', up: true, text: '开车成本提高约 ' + Math.round((f.car.k - 1) * 100) + '%' });
    if (f.strike) {
      const s = f.strike, ids = [].concat(s.region), items = [];
      if (s.pop) items.push('人口减少约 ' + Math.round(s.pop * 100) + '%');
      if (s.jobs) items.push('岗位减少约 ' + Math.round(s.jobs * 100) + '%');
      if (items.length) out.push({ icon: 'people', up: false, region: ids[0], text: ids.map(rn).join('、') + ' ' + items.join('、') });
    }
    return out;
  };
  Eras.macroFx = function (id) { const e = macroEvents().find(function (x) { return x.id === id; }); return e ? e.fx : null; };
  Eras.macroNote = function (id) { const e = macroEvents().find(function (x) { return x.id === id; }); return e ? Eras.fxNote(e) : ''; };

  // 背景交通（不由玩家经营、不占用道路的公共交通与步行：电车、公共马车、普通铁路、渡轮）：
  // share 非地铁出行中背景交通的比例，speed 平均速度（km/h，含步行接驳），wait 候车与换乘（分钟），fare 单程票价（内部货币）
  Eras.bg = function (t) {
    const B = D.bg; if (!B) return null;
    const share = U.interp(B.share, t); if (!(share > 0)) return null;
    return { share: U.clamp(share, 0, 0.95), speed: U.interp(B.speed, t), wait: U.interp(B.wait, t), fare: B.fare ? U.interp(B.fare, t) : 0, name: B.name || '背景交通', keep: B.roadKeep ? U.interp(B.roadKeep, t) : 0 };
  };

  // 阶段目标：转为本城专属动态任务（economy.js），只在该阶段的时间窗口内发布
  Eras.goals = function () {
    const L = list(), out = [];
    L.forEach(function (e, k) {
      const to = k + 1 < L.length ? L[k + 1].from : (e.to || e.from + 15);
      for (const gl of e.goals || []) out.push(Object.assign({}, gl, { title: '阶段目标：' + gl.title, era: e.id, from: [Math.floor(gl.from || e.from), 1], to: [Math.floor((gl.to || to) - 0.01), 12] }));
    });
    return out;
  };

  // 日期页「发展阶段」：当前阶段、过渡、片区增长倾向（只列已开放片区）、主要出行走廊、生效中的事件影响、背景交通、阶段目标
  Eras.view = function (g) {
    const t = g.year(), L = list(), k = Eras.index(t); if (k < 0) return null;
    const w = Eras.weights(t), city = g.city, nm = function (r) { return String(r.name).replace(/（.*）/, ''); };
    let trans = null;
    for (let i = 0; i < w.length; i++) if (i !== k && w[i] > 0.02) trans = { era: L[i], next: i > k };
    const F = Eras.regionFactors(city, t);
    const rank = function (arr, up) {
      const out = [];
      city.regions.forEach(function (r, i) { if (city.regionOpen[i] && (up ? arr[i] > 1.05 : arr[i] < 0.95)) out.push([nm(r), arr[i]]); });
      out.sort(function (a, b) { return up ? b[1] - a[1] : a[1] - b[1]; });
      return out.slice(0, 4).map(function (x) { return x[0]; });
    };
    const byId = new Map(city.regions.map(function (r) { return [r.id, r]; }));
    const dm = Eras.demand(t);
    const corr = dm.corr.filter(function (c) { return c.f > 1.02 && byId.has(c.a) && byId.has(c.b); }).sort(function (a, b) { return b.f - a.f; })
      .slice(0, 4).map(function (c) { return nm(byId.get(c.a)) + '—' + nm(byId.get(c.b)); });
    const fx = [];
    const act = new Map();
    for (const key of ['grow', 'demand', 'sat', 'finance']) for (const x of evFx(t, key)) { if (!act.has(x.e)) act.set(x.e, new Set()); act.get(x.e).add(key); }
    act.forEach(function (keys, e) { fx.push({ title: e.title || (CM.Macro && CM.Macro.LIB[e.id] ? CM.Macro.LIB[e.id].title : ''), note: Eras.fxNote(e, keys).replace(/^（模拟影响：|）$/g, '') }); });
    const goals = Eras.goals().filter(function (gl) { return gl.era === L[k].id; }).map(function (gl) {
      const T = g.tasks, find = function (arr) { return (arr || []).find(function (x) { return x.cityId === gl.id; }); };
      const st = find(T.active) ? '进行中' : find(T.done) ? '已完成' : find(T.failed) ? '未完成' : T.issued['dyn:' + gl.id] ? '已发布' : '待发布';
      return { title: gl.title, state: st };
    });
    return { era: L[k], to: Eras.endOf(k), trans: trans, popUp: rank(F.pop, true), popDown: rank(F.pop, false), jobUp: rank(F.jobs, true), jobDown: rank(F.jobs, false),
      decayHW: dm.decayHW, corr: corr, fx: fx, bg: Eras.bg(t), goals: goals, log: (g.eraLog || []).filter(function (r) { return r.text; }) };
  };

  // ---------- 阶段记录与总结 ----------
  // 已开发用地：住宅、商业、工业、混合、公共设施与地标用地（农田、水面、山地、公园与机场不计）
  let DEV = null;   // 用地类型表在 city.js 载入后才有（CM.LU），首次使用时建立
  const devCell = function (city, c) {
    if (!DEV) { DEV = new Uint8Array(16); for (const k of ['RES', 'COM', 'IND', 'MIX', 'INST', 'LANDMARK']) DEV[CM.LU[k]] = 1; }
    return DEV[city.lu[c]] === 1;
  };
  const snap = function (g) {
    const tot = g.city.totals(), d = g.model.daily || {}, C = g.compiled, city = g.city;
    let km = 0; for (const id in g.net.segments) { const cs = C && C.segs.get(id); km += (cs ? cs.g : CM.Metro.segGeom(g.net, g.net.segments[id], city)).lenM / 1000; }   // 编译结果里已有区段几何
    const R = city.regions.length, rp = new Array(R).fill(0), rj = new Array(R).fill(0), rd = new Array(R).fill(0);
    let dev = 0;
    for (let c = 0; c < city.N; c++) { const k = city.region[c]; const dv = devCell(city, c) ? 1 : 0; dev += dv; if (k < R) { rp[k] += city.pop[c]; rj[k] += city.jobs[c]; rd[k] += dv; } }
    return { ym: g.ym(), y: g.clock.y, m: g.clock.m, pop: Math.round(tot.pop), jobs: Math.round(tot.jobs), dev: dev, metro: Math.round(d.metro || 0), share: +(d.metroShare || 0).toFixed(4), km: +km.toFixed(1), cov: +((g.model.net && g.model.net.acc && g.model.net.acc.coverage) || 0).toFixed(4), stations: C ? C.stations.length : 0,
      rp: rp.map(Math.round), rj: rj.map(Math.round), rd: rd, ids: city.regions.map(function (r) { return r.id; }) };
  };
  // ---------- 城市发展对比基准（v2.2 阶段可视化） ----------
  // 按 4 × 4 格（约 1 km）的方块记录人口、岗位与已开发用地格数；g.eraBase 为当前阶段开始时，g.startBase 为本局开始规划时
  const BS = 4;
  const blockGrid = function (city) {
    const bw = Math.ceil(city.W / BS), bh = Math.ceil(city.H / BS), n = bw * bh;
    const p = new Float64Array(n), j = new Float64Array(n), d = new Int32Array(n);
    for (let y = 0; y < city.H; y++) for (let x = 0; x < city.W; x++) {
      const c = y * city.W + x, b = Math.floor(y / BS) * bw + Math.floor(x / BS);
      p[b] += city.pop[c]; j[b] += city.jobs[c]; if (devCell(city, c)) d[b]++;
    }
    return { bw: bw, bh: bh, p: p, j: j, d: d };
  };
  const mkBase = function (g, id) {
    const B = blockGrid(g.city), s = snap(g);
    return { id: id || null, y: g.clock.y, m: g.clock.m, bw: B.bw, bh: B.bh, p: Array.from(B.p, Math.round), j: Array.from(B.j, Math.round), d: Array.from(B.d),
      pop: s.pop, jobs: s.jobs, dev: s.dev, km: s.km, cov: s.cov, rp: s.rp, rj: s.rj, rd: s.rd, ids: s.ids };
  };
  // 开局与读档时补齐基准（旧存档从读档时刻开始比较，并注明）
  Eras.ensureBases = function (g, joined) {
    if (!g.startBase) { g.startBase = mkBase(g, null); if (joined) g.startBase.joined = true; }
    if (Eras.enabled() && (!g.eraBase || g.eraBase.id !== Eras.current(g.year()).id)) { g.eraBase = mkBase(g, Eras.current(g.year()).id); if (joined) g.eraBase.joined = true; }
  };
  // 扩图前没有新增区域的历史快照。以载入时刻建立新范围的比较基准，
  // 保留已完成阶段总结，避免把新增地图的人口误记成经营期间的增长。
  Eras.rebaseMap = function (g) {
    const era = Eras.current(g.year());
    g.startBase = mkBase(g, null); g.startBase.joined = true;
    g.eraBase = mkBase(g, era && era.id); g.eraBase.joined = true;
    const active = (g.eraLog || []).slice().reverse().find(r => !r.end);
    if (active) { active.start = snap(g); active.joined = true; }
  };
  // 与基准相比的变化：方块值（人口、岗位为人，用地为 km²）与片区排行
  Eras.change = function (g, which, key) {
    const base = which === 'start' ? g.startBase : g.eraBase; if (!base) return null;
    const city = g.city, B = blockGrid(city);
    if (B.bw !== base.bw || B.bh !== base.bh) return null;
    const src = key === 'jobs' ? [B.j, base.j] : key === 'land' ? [B.d, base.d] : [B.p, base.p];
    const n = B.bw * B.bh, v = new Float32Array(n), scale = key === 'land' ? CM.CFG.CELL_M * CM.CFG.CELL_M / 1e6 : 1;
    for (let b = 0; b < n; b++) v[b] = (src[0][b] - src[1][b]) * scale;
    return { base: base, bw: B.bw, bh: B.bh, bs: BS, v: v, key: key };
  };
  // 本阶段的重点发展片区（v2.3「城市发展」图层还没有可见变化时显示）：阶段数据中人口 / 岗位增长倍数大于 1 的已开放片区，
  // w 为按片区序号的 0–1 权重（倍数越大越深），list 为标注用
  Eras.devPlan = function (g) {
    if (!Eras.enabled()) return null;
    const e = Eras.current(g.year()), gr = (e && e.grow) || {}, key = (CM.R && CM.R.layerOpt.devK) || 'pop';
    const src = key === 'jobs' ? [gr.jobs] : key === 'land' ? [gr.pop, gr.jobs] : [gr.pop];
    const city = g.city, w = new Float32Array(city.regions.length), list = [];
    let mx = 1;
    city.regions.forEach(function (r, k) { let f = 1; for (const s of src) if (s && s[r.id] > f) f = s[r.id]; if (f > 1 && city.regionOpen[k] && !r.scenic) { w[k] = f; mx = Math.max(mx, f); } });
    city.regions.forEach(function (r, k) { if (w[k] > 0) { list.push({ k: k, name: String(r.name).replace(/（.*）/, ''), f: w[k], x: r.cx, y: r.cy }); w[k] = mx > 1 ? (w[k] - 1) / (mx - 1) : 1; } });
    list.sort(function (a, b) { return b.f - a.f; });
    return list.length ? { era: e, w: w, list: list.slice(0, 5) } : null;
  };
  // 片区排行：本阶段（或本局）以来人口、岗位、新开发用地变化最多的片区
  Eras.regionChange = function (g, which) {
    const base = which === 'start' ? g.startBase : g.eraBase; if (!base) return null;
    const now = snap(g), out = [], cell = CM.CFG.CELL_M * CM.CFG.CELL_M / 1e6;
    for (let k = 0; k < now.ids.length; k++) {
      const rg = g.city.regions[k]; if (!rg || rg.scenic) continue;
      const ia = base.ids.indexOf(now.ids[k]);
      const p0 = ia >= 0 ? base.rp[ia] : 0, j0 = ia >= 0 ? base.rj[ia] : 0, d0 = ia >= 0 && base.rd ? base.rd[ia] : 0;
      out.push({ k: k, name: String(rg.name).replace(/（.*）/, ''), dp: now.rp[k] - p0, dj: now.rj[k] - j0, dl: (now.rd[k] - d0) * cell, p: now.rp[k], j: now.rj[k] });
    }
    return { base: base, now: now, list: out, dl: (now.dev - (base.dev || 0)) * cell };
  };
  const pct = function (a, b) { return a > 0 ? Math.round((b / a - 1) * 100) : 0; };
  // 阶段总结：人口、岗位、地铁客运与分担率的变化，增长最快的片区（人口 / 就业），地铁里程
  Eras.summary = function (rec) {
    const a = rec.start, b = rec.end; if (!a || !b) return '';
    const grow = function (key) {
      const out = [];
      for (let k = 0; k < b.ids.length; k++) { const ia = a.ids.indexOf(b.ids[k]); const va = ia >= 0 ? a[key][ia] : 0, vb = b[key][k]; if (vb - va > 0) out.push([k, vb - va]); }
      out.sort(function (x, y) { return y[1] - x[1]; });
      return out.slice(0, 3).map(function (x) { const id = b.ids[x[0]], rg = (D.regions || []).concat(D.defaultRegion ? [D.defaultRegion] : []).find(function (r) { return r.id === id; }); return String(rg ? rg.name : id).replace(/（.*）/, ''); });
    };
    const parts = ['人口 ' + U.fmtPeople(a.pop) + ' → ' + U.fmtPeople(b.pop) + '（' + U.fmtSigned(pct(a.pop, b.pop), 0) + '%）', '岗位 ' + U.fmtPeople(a.jobs) + ' → ' + U.fmtPeople(b.jobs)];
    parts.push(b.km > 0 ? '地铁 ' + U.fmtNum(a.km, 0) + ' → ' + U.fmtNum(b.km, 0) + ' km，日客运 ' + U.fmtPeople(b.metro) + ' 人次，分担率 ' + U.fmtPct(b.share, 1) + (b.cov != null ? '，步行可达地铁的人口 ' + U.fmtPct(a.cov || 0, 0) + ' → ' + U.fmtPct(b.cov, 0) : '') : '本阶段没有地铁');
    const gp = grow('rp'), gj = grow('rj');
    if (gp.length) parts.push('人口增长最多：' + gp.join('、'));
    if (gj.length) parts.push('岗位增长最多：' + gj.join('、'));
    return parts.join('；') + '。';
  };
  // 每月结算后调用：进入新阶段时记录上一阶段的结束与总结、新阶段的开始（只记录一次，随存档保存）
  Eras.month = function (g) {
    if (!Eras.enabled()) return null;
    const L = list(), k = Eras.index(g.year());
    const log = g.eraLog || (g.eraLog = []);
    const last = log[log.length - 1];
    if (last && last.id === L[k].id) return null;
    if (last && !last.end) { last.end = snap(g); last.text = Eras.summary(last); }
    if (log.some(function (r) { return r.id === L[k].id; })) return null;
    const rec = { id: L[k].id, start: snap(g) };
    log.push(rec);
    g.eraBase = mkBase(g, L[k].id);   // 新阶段的对比基准（日期页与「城市发展」图层）
    return { era: L[k], prev: last || null, first: !last };
  };
  // 读档：旧存档没有阶段记录时从当前阶段开始记录（不补造过去的总结）
  Eras.attach = function (g) { if (!Eras.enabled() || g.eraLog) return; g.eraLog = [{ id: Eras.current(g.year()).id, start: snap(g), joined: true }]; };
  Eras.byId = function (id) { return list().find(function (e) { return e.id === id; }) || null; };
  Eras.list = list;
})(window.CM);
