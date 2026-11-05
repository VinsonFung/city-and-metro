'use strict';
// 城市轨道交通公司（v2.5）：经营挑战中逐步开放的政府招标与 PPP 合同（简化模型）。
// 玩家经营一家承担公共服务责任、有投资自主权和商业开发能力的地铁公司：政府按城市需要提出项目招标，玩家可以投标、
// 放弃投标，或不接合同、自主建设。普通政府任务仍是任务；只有含明确投资、风险分担与长期履约安排的项目才作为 PPP 合同。
// 各城市参照的制度不同（中国内地 PPP、香港铁路＋物业、台北联合开发、巴黎特许经营、东京公私合作），游戏统一用同一套简化规则。
// 计算只在月初结算时进行，复用任务的连通、满载率与车站客流结果，不增加每帧与每日的负担
(function (CM) {
  const U = CM.U, CFG = CM.CFG, h = U.h;
  const Corp = CM.Corp = {};
  // 开放条件（开局满 3 年、线网 12 km、到了本城参照制度出现的年份）、招标节奏与违约后果
  const RULE = Corp.RULE = { months: 36, km: 12, every: 10, open: 2, active: 3, life: 6, bond: 0.02, fail: { grant: 0.9, months: 12, sat: -3 } };
  const TYPE = Corp.TYPE = {
    line: { name: '新线 PPP', icon: 'route', ops: 120 },
    tod: { name: '铁路＋物业', icon: 'building', ops: 120 },
    upgrade: { name: '扩容改造 PPP', icon: 'train', ops: 96 },
  };
  // 投标方案（按估算投资 E 的比例）：sub 开通时的建设补助；ap 运营期可用性付费合计（按月平均支付）；
  // mrg 客流保底（实际低于预测的 lo 时，政府补差额对应票款的 k）；share 超额分成（高于 hi 时，公司交出超出部分票款的 k）；
  // 铁路＋物业另有地价 land（签约时付）、物业收益 prop 与持有成本 hold（运营期按月，收益随客流与经济周期波动）
  const OPTS = {
    // 平衡（v2.5）：新线合同政府支付合计约为估算投资的 80% / 65% / 45%，公司另得票款并承担超支与客流风险；
    // 扩容合同没有建设补助，8 年可用性付费合计为投资的 1.25 / 1.12 / 1.0 倍（相当于分期回收、略有回报）
    line: [
      { key: 'safe', name: '稳健报价', sub: 0.35, ap: 0.45, mrg: { lo: 0.7, k: 0.6 }, share: { hi: 1.3, k: 0.5 }, win: 0.35 },
      { key: 'std', name: '标准报价', sub: 0.25, ap: 0.40, mrg: { lo: 0.6, k: 0.5 }, share: { hi: 1.4, k: 0.4 }, win: 0.55 },
      { key: 'low', name: '竞争报价', sub: 0.15, ap: 0.30, mrg: null, share: { hi: 1.6, k: 0.3 }, win: 0.78 }],
    tod: [
      { key: 'safe', name: '稳健报价', sub: 0.12, ap: 0.22, land: 0.08, prop: 0.6, hold: 0.25, win: 0.35 },
      { key: 'std', name: '标准报价', sub: 0.08, ap: 0.18, land: 0.08, prop: 0.6, hold: 0.25, win: 0.55 },
      { key: 'low', name: '竞争报价', sub: 0.04, ap: 0.10, land: 0.08, prop: 0.6, hold: 0.25, win: 0.78 }],
    upgrade: [
      { key: 'safe', name: '稳健报价', sub: 0, ap: 1.25, win: 0.35 },
      { key: 'std', name: '标准报价', sub: 0, ap: 1.12, win: 0.55 },
      { key: 'low', name: '竞争报价', sub: 0, ap: 1.0, win: 0.78 }],
  };

  const FLAVOR = {
    cn: { name: 'PPP 特许经营', from: 2002, note: '参照中国内地 2000 年代起的地铁 PPP 与特许经营' },
    hk: { name: '铁路＋物业', from: 1980, note: '参照香港以沿线物业开发收益支持铁路建设的做法' },
    tw: { name: '联合开发与 BOT', from: 1990, note: '参照台北捷运的联合开发与 BOT' },
    fr: { name: '特许经营', from: 1900, note: '参照巴黎市建设隧道、由运营公司特许经营地铁的做法' },
    jp: { name: '公私合作', from: 1970, note: '参照日本地方政府与民间企业合资建设、运营轨道的做法' }
  };
  const MAP_FLAVOR={gz:'cn',hz:'cn',wh:'cn',sh:'cn',bj:'cn',hk:'hk',tp:'tw',pa:'fr',tk:'jp'};
  Corp.flavor = function (g) { return g ? FLAVOR[MAP_FLAVOR[g.mapId]] || null : null; };
  Corp.enabled = function (g) { return !!g && !!g.econ && g.econ.mode === 'challenge' && !g.tutorial && !CM.DATA.noDynTasks && !!Corp.flavor(g); };
  Corp.grade = function (r) { return r >= 80 ? 'A' : (r >= 60 ? 'B' : (r >= 40 ? 'C' : 'D')); };
  // 履约信誉与拨款：50 分 ×1.00，100 分 ×1.05，0 分 ×0.95
  Corp.grantFactor = function (r) { return 0.95 + 0.1 * U.clamp(r, 0, 100) / 100; };
  Corp.winChance = function (o, r) { return U.clamp(o.win + (r - 60) * 0.004, 0.1, 0.92); };
  const netKm = function (g) { return CM.Milestones ? CM.Milestones.netInfo(g).km : 0; };
  Corp.unlockState = function (g) {
    const F = Corp.flavor(g), S = CFG.START, months = g.ym() - U.ymIndex(S.y, S.m || 1), km = netKm(g);
    const need = [
      { label: '开局满 3 年', ok: months >= RULE.months, cur: '已 ' + U.fmtNum(Math.max(0, months) / 12, 1) + ' 年' },
      { label: '线网 ' + RULE.km + ' km 以上', ok: km >= RULE.km, cur: U.fmtNum(km, 1) + ' km' },
      { label: F ? F.from + ' 年起（本城参照制度）' : '本城未启用', ok: !!F && g.clock.y >= F.from, cur: '现在 ' + g.clock.y + ' 年' }];
    return { ok: need.every(function (x) { return x.ok; }), need: need };
  };
  const ymText = function (t) { return Math.floor(t / 12) + '年' + (t % 12 + 1) + '月'; };
  const when = function (g) { return { y: g.clock.y, m: g.clock.m, d: 1 }; };
  const say = function (g, title, desc, kind) { g.logEvent({ tag: '合同', title: title, desc: desc || '' }); g.emit('toast', { kind: kind || 'info', text: title, ppp: true }); };
  const hash = function (s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };

  // ---------------- 招标 ----------------
  // 片区可建设（与动态任务同一判定：一半以上陆地已开放、非风景区）
  const zoneOpen = function (g, z) {
    const city = g.city; let n = 0, o = 0;
    for (const c of g.model.zoneCells[z]) { if (city.landFrac[c] < 0.5) continue; n++; if (!city.cellLocked(c) && !city.regions[city.region[c]].scenic) o++; }
    return n > 0 && o >= n / 2;
  };
  const catchment = function (city, x, y, r) {
    let s = 0; const W = city.W, r2 = r * r;
    for (let j = Math.max(0, Math.floor(y - r)); j <= Math.min(city.H - 1, Math.floor(y + r)); j++)
      for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(W - 1, Math.floor(x + r)); i++) { const dx = i + 0.5 - x, dy = j + 0.5 - y; if (dx * dx + dy * dy <= r2) { const c = j * W + i; s += city.pop[c] + city.jobs[c]; } }
    return s;
  };
  // 政府的客流预测：本市运营车站每天的进站人次 ÷ 车站周边约 600 m 的人口与岗位，乘以目标片区的人口与岗位，再乐观一成
  const forecast = function (g, ctx, area) {
    const C = ctx.C, sd = ctx.sd; if (!C || !sd) return 0;
    let inn = 0, cat = 0, n = 0;
    for (let i = 0; i < C.stations.length && i < sd.inn.length; i++) if (C.serviced[i]) { const s = C.stations[i]; inn += sd.inn[i]; cat += catchment(g.city, s.x, s.y, 2.4); n++; }
    if (n < 4 || cat <= 0) return 0;
    return Math.max(500, Math.round(inn / cat * catchment(g.city, area.x, area.y, area.r + 1.5) * 1.1 / 100) * 100);
  };
  // 与进行中的任务、招标、合同重叠的地点不再招标
  const taken = function (g, P, x, y) {
    const near = function (a, d) { return a && U.dist(a.x, a.y, x, y) < d; };
    for (const t of g.tasks.active) { if (t.anchors && t.anchors.some(function (a) { return near(a, 6); })) return true; if (t.zone != null && near({ x: g.model.zCx[t.zone], y: g.model.zCy[t.zone] }, 6)) return true; }
    for (const t of P.tenders.concat(P.contracts)) if (near(t.area, 8)) return true;
    return false;
  };
  const siteOK = function (city, a) { for (let k = 0; k < 9; k++) { const ang = k * 0.7, d = k ? a.r * 0.6 : 0; if (CM.Metro.checkSite(city, a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, 'underground').ok) return true; } return false; };
  const lineCand = function (g, P, ctx) {
    const m = g.model, acc = m.net && m.net.acc, C = ctx.C, ym = g.ym(); if (!acc || !C) return null;
    let best = null;
    for (let z = 0; z < m.Z; z++) {
      const pj = m.zPop[z] + m.zJobs[z]; if (pj < 15000 || acc.zCov[z] > 0.25 || P.cool['z:' + z] > ym || !zoneOpen(g, z)) continue;
      const x = m.zCx[z], y = m.zCy[z]; if (taken(g, P, x, y)) continue;
      let ns = -1, nd = Infinity;
      for (let i = 0; i < C.stations.length; i++) if (C.serviced[i]) { const d = U.dist(C.stations[i].x, C.stations[i].y, x, y); if (d < nd) { nd = d; ns = i; } }
      if (ns < 0 || nd < 8 || nd > 48) continue;   // 离线网 2–12 km
      const score = pj * (1 - acc.zCov[z]) / (1 + nd / 40);
      if (!best || score > best.score) best = { z: z, ns: ns, nd: nd, score: score, pj: pj };
    }
    if (!best) return null;
    const s = C.stations[best.ns], area = { name: g.zoneName(best.z), x: +m.zCx[best.z].toFixed(2), y: +m.zCy[best.z].toFixed(2), r: 3 };
    if (!siteOK(g.city, area)) { P.cool['z:' + best.z] = ym + 24; return null; }
    const hub = { name: s.name, x: s.x, y: s.y, r: 1.2 }, km = best.nd * CFG.CELL_M / 1000, ci = g.econ.costIndex(g.clock.y);
    const E = Math.round((CM.Tasks.estimateLink(g, [hub, area]) + Math.max(0, Math.round(km / 1.4) - 1) * CFG.cost.station.underground.M * ci) / 1000) * 1000;
    return { z: best.z, area: area, anchors: [hub, area], km: km, est: E, pj: best.pj, buildM: U.clamp(Math.round((24 + 5 * km) / 6) * 6, 30, 72) };
  };
  const upgradeCand = function (g, P) {
    const ym = g.ym(), ci = g.econ.costIndex(g.clock.y), C = g.compiled;
    for (const x of CM.Tasks.crowdOf(g)) {
      if (x.lf < 0.95 || x.cars >= 8 || P.cool['l:' + x.lid] > ym) continue;
      if (g.tasks.active.concat(g.tasks.offers || []).some(function (t) { return t.line === x.lid; }) || P.tenders.concat(P.contracts).some(function (t) { return t.line === x.lid; })) continue;
      const L = g.net.lines[x.lid]; if (!L) continue;
      let E = 0, n = 0; const seen = new Set();
      for (const r of C.routes) if (r.lineId === x.lid) for (const k of r.stIdx) {
        const s = C.stations[k], tbl = CFG.cost.station[s.type] || CFG.cost.station.underground;
        if (s.size !== 'L' && !seen.has(k)) { seen.add(k); E += (tbl.L - tbl[s.size]) * ci; n++; }
      }
      if (E <= 0) continue;
      return { line: x.lid, lf: x.lf, cars: x.cars, n: n, est: Math.round(E * 1.1 / 1000) * 1000 };
    }
    return null;
  };
  const makeTender = function (g, P, ctx) {
    const ym = g.ym(), rng = new U.RNG(hash(g.seed + ':' + ym + ':' + P.seq));
    const kinds = rng.next() < 0.35 ? ['upgrade', 'line'] : ['line', 'upgrade'];
    for (const kind of kinds) {
      let t = null;
      if (kind === 'line') {
        const c = lineCand(g, P, ctx); if (!c) continue;
        const tod = rng.next() < (CFG.economy.todTender || 0.3), type = tod ? 'tod' : 'line', F = forecast(g, ctx, c.area);
        if (!tod && F <= 0) continue;
        t = { type: type, area: c.area, anchors: c.anchors, zone: c.z, est: c.est, buildM: c.buildM, forecast: F,
          title: '「' + c.area.name + '」' + (tod ? '铁路＋物业项目' : '新线 PPP 项目'),
          desc: c.area.name + '约 ' + U.fmtPeople(c.pj) + ' 人口与岗位，还没有地铁。政府招标：公司投资建设连到「' + c.anchors[0].name + '」一带的线路（约 ' + U.fmtNum(c.km, 1) + ' km），并运营 ' + TYPE[type].ops / 12 + ' 年。' +
            (tod ? '补助较少，换取片区的物业开发权：收益随客流与经济周期波动，经营不善会亏损。' : '') };
      } else {
        const c = upgradeCand(g, P); if (!c) continue;
        const L = g.net.lines[c.line];
        t = { type: 'upgrade', line: c.line, cars0: c.cars, est: c.est, buildM: 30, forecast: 0,
          title: '「' + L.name + '」扩容改造 PPP',
          desc: L.name + ' 早高峰满载率 ' + U.fmtPct(c.lf, 0) + '，列车只有 ' + c.cars + ' 节。公司投资把沿线 ' + c.n + ' 座车站升级为大型站、列车加长到 8 节；政府不给建设补助，改造完成后按可用性付费分 8 年支付。' };
      }
      t.id = 'P' + (P.seq++); t.offered = ym; t.expires = ym + RULE.life; t.bid = null;
      return Corp.terms(t);
    }
    return null;
  };
  // 按类型与估算投资给出三档投标方案（金额在招标时确定，合同期内不随物价调整）
  Corp.terms = function (t) {
    const ops = t.opsM = TYPE[t.type].ops, E = t.est;
    t.opts = OPTS[t.type].map(function (o) {
      return { key: o.key, name: o.name, win: o.win, sub: Math.round(o.sub * E), apM: o.ap * E / ops, apT: Math.round(o.ap * E), mrg: o.mrg || null, share: o.share || null,
        bond: Math.round(RULE.bond * E), land: Math.round((o.land || 0) * E), propM: (o.prop || 0) * E / ops, holdM: (o.hold || 0) * E / ops };
    });
    return t;
  };

  // ---------------- 履约 ----------------
  const context = function (g) {
    const m = g.model, C = m.net ? m.net.C : g.compiled, sd = m.stDaily && !m.dailyStale ? m.stDaily : null;
    const crowd = new Map(); for (const x of CM.Tasks.crowdOf(g)) crowd.set(x.lid, Math.max(crowd.get(x.lid) || 0, x.lf));
    const f = CM.Macro && g.macro ? CM.Macro.cityFactors(g) : null;
    return { C: C, sd: sd, crowd: crowd, fare: (m.daily && m.daily.avgFare) || 0, cyc: f ? U.clamp(f.com, 0.7, 1.25) : 1 };
  };
  const areaIdx = function (ctx, a) { const C = ctx.C, out = []; if (!C || !a) return out; for (let i = 0; i < C.stations.length; i++) if (C.serviced[i] && U.dist(C.stations[i].x, C.stations[i].y, a.x, a.y) <= a.r + 0.5) out.push(i); return out; };
  const scope = function (g, c) {
    if (c.type === 'upgrade') return g.tasks.evaluate({ type: 'lineCars', line: c.line, target: 8, start: c.cars0 }, g);
    return g.tasks.evaluate({ type: 'connect', anchors: c.anchors }, g);
  };
  const kpis = function (g, c, ctx) {
    const sc = scope(g, c), idx = c.type === 'upgrade' ? [] : areaIdx(ctx, c.area);
    const lines = new Set(c.type === 'upgrade' ? [c.line] : []);
    for (const i of idx) for (const l of ctx.C.stationLines[i] || []) lines.add(l);
    let lf = 0; lines.forEach(function (l) { lf = Math.max(lf, ctx.crowd.get(l) || 0); });
    const lim = c.type === 'upgrade' ? 1.0 : 1.1;
    let inn = 0; if (ctx.sd) for (const i of idx) inn += ctx.sd.inn[i] || 0;
    return { conn: !!sc.ok, lf: lf, lim: lim, crowd: lf <= lim, n: (sc.ok ? 1 : 0) + (lf <= lim ? 1 : 0), inn: inn, r: c.forecast > 0 && ctx.sd ? inn / c.forecast : null };
  };
  // 物业收益与持有成本记入车站商业收入 / 成本（月末流水按月汇总），其余逐笔记入合同收支
  const pay = function (g, c, key, v, note) { if (!(v > 0.05)) return; const prop = key === 'prop'; g.econ.income(prop ? 'commerce' : 'ppp', v); c.paid[key] = (c.paid[key] || 0) + v; if (!prop) g.econ.log('ppp', v, 'gen', note + '：' + c.title, when(g)); };
  const charge = function (g, c, key, v, note) { if (!(v > 0.05)) return; const hold = key === 'hold'; g.econ.spend(hold ? 'todCost' : 'pppOut', v); c.paid[key] = (c.paid[key] || 0) + v; if (!hold) g.econ.log('pppOut', -v, 'gen', note + '：' + c.title, when(g)); };
  const close = function (g, P, c, status, why) {
    c.status = status; c.closed = g.ym(); if (why) c.why = why;
    P.contracts.splice(P.contracts.indexOf(c), 1); P.closed.push(c); if (P.closed.length > 30) P.closed.shift();
  };
  const fail = function (g, P, c, why, quit) {
    const ym = g.ym(), F = RULE.fail;
    if (c.phase === 'ops') charge(g, c, 'fine', 0.03 * c.est, '违约金');   // 运营期违约：保证金已退还，另付违约金
    g.econ.mods.push({ kind: 'grant', factor: F.grant, until: ym + F.months - 1, reason: '合同违约：' + c.title });
    g.econ.mods.push({ kind: 'sat', delta: F.sat, until: ym + 5, reason: '合同违约：' + c.title });
    P.rating = U.clamp(P.rating - (quit ? 10 : 15), 0, 100);
    if (c.area && c.zone != null) P.cool['z:' + c.zone] = ym + 36;
    if (c.line) P.cool['l:' + c.line] = ym + 36;
    close(g, P, c, 'failed', why);
    say(g, (quit ? '退出合同：' : '合同违约：') + c.title, why + '。' + (c.phase === 'build' ? '履约保证金不予退还，' : '支付违约金，') + '未来 ' + F.months + ' 个月拨款 ×' + F.grant + '，履约信誉下降。', 'bad');
  };
  const open = function (g, P, c) {
    const ym = g.ym(), early = c.deadline - ym;
    c.phase = 'ops'; c.opened = ym; c.opsEnd = ym + c.opsM;
    pay(g, c, 'sub', c.opt.sub, '建设补助');
    pay(g, c, 'refund', c.opt.bond, '退还履约保证金');
    P.rating = U.clamp(P.rating + 6 + (early >= 6 ? 2 : 0), 0, 100);
    say(g, '合同项目开通：' + c.title, (early > 0 ? '提前 ' + early + ' 个月' : '按期') + '完成建设，收到建设补助 ' + U.fmtMoney(c.opt.sub) + '，进入 ' + c.opsM / 12 + ' 年运营期：每月按服务考核收取可用性付费。', 'good');
  };
  const step = function (g, P, c, ctx) {
    const ym = g.ym();
    if (c.phase === 'build') {
      const ev = scope(g, c); c.prog = { v: ev.value, text: ev.text, ok: !!ev.ok };
      if (ev.ok) { open(g, P, c); return; }
      if (ev.dead) fail(g, P, c, '线路已拆除');
      else if (ym >= c.deadline) fail(g, P, c, '到 ' + ymText(c.deadline) + ' 仍未完成建设');
      return;
    }
    const k = kpis(g, c, ctx), apF = k.n === 2 ? 1 : (k.n === 1 ? 0.7 : 0.3);
    c.kpi = { conn: k.conn, lf: +k.lf.toFixed(3), lim: k.lim, crowd: k.crowd, f: apF, r: k.r == null ? null : +k.r.toFixed(3), inn: Math.round(k.inn) };
    pay(g, c, 'ap', c.opt.apM * apF, '可用性付费' + (apF < 1 ? '（考核扣减 ' + Math.round((1 - apF) * 100) + '%）' : ''));
    if (apF < 1) c.paid.cut = (c.paid.cut || 0) + c.opt.apM * (1 - apF);
    // 客流风险分担：按本月实际天数、全网平均每次票价折算
    if (k.r != null) {
      const days = U.daysInMonth(g.clock.y, g.clock.m === 1 ? 12 : g.clock.m - 1), base = c.forecast * days * ctx.fare / 10000;
      if (c.opt.mrg && k.r < c.opt.mrg.lo) pay(g, c, 'mrg', (c.opt.mrg.lo - k.r) * base * c.opt.mrg.k, '客流保底补偿');
      if (c.opt.share && k.r > c.opt.share.hi) charge(g, c, 'share', (k.r - c.opt.share.hi) * base * c.opt.share.k, '超额客流分成');
      // 铁路＋物业：物业收益随片区客流（活力）与经济周期，持有成本固定；客流低迷或经济下行时亏损
      if (c.opt.propM > 0) { pay(g, c, 'prop', c.opt.propM * U.clamp(k.r, 0, 1.6) * ctx.cyc, '物业开发收益'); charge(g, c, 'hold', c.opt.holdM, '物业持有与运营成本'); }
      c.hist = (c.hist || []).concat([[ym, +k.r.toFixed(3)]]).slice(-24);
    }
    c.offline = k.conn ? 0 : (c.offline || 0) + 1;
    P.rating = U.clamp(P.rating + (k.n === 2 ? 0.25 : -1.5), 0, 100);
    if (c.offline >= 3) { fail(g, P, c, '服务连续 3 个月中断'); return; }
    if (k.n < 2 && !c.warned) { c.warned = ym; say(g, '合同考核未达标：' + c.title, (k.conn ? '' : '合同范围内的服务中断；') + (k.crowd ? '' : '最拥挤区段早高峰满载率 ' + U.fmtPct(k.lf, 0) + '，高于 ' + U.fmtPct(k.lim, 0) + '；') + '本月可用性付费只付 ' + Math.round(apF * 100) + '%。', 'warn'); }
    if (k.n === 2) c.warned = 0;
    if (ym >= c.opsEnd) {
      P.rating = U.clamp(P.rating + 5, 0, 100); close(g, P, c, 'done');
      say(g, '合同期满：' + c.title, '运营期结束，项目按合同移交。累计收到政府支付 ' + U.fmtMoney((c.paid.sub || 0) + (c.paid.ap || 0) + (c.paid.mrg || 0)) + '，履约信誉提升。', 'good');
    }
  };

  // ---------------- 月度结算（game.monthGen 在任务之后、拨款之前调用） ----------------
  const fresh = function (g) { return { v: 1, since: g.ym(), rating: 60, tenders: [], contracts: [], closed: [], seq: 1, next: g.ym(), cool: {} }; };
  Corp.monthly = function (g) {
    if (!Corp.enabled(g)) return;
    const ym = g.ym();
    if (!g.corp) {
      if (!g.model.trafficReady() || !Corp.unlockState(g).ok) return;
      g.corp = fresh(g);
      const F = Corp.flavor(g);
      say(g, '地铁公司开始承接政府合同', '政府开始以招标方式提出建设需求（' + F.name + '，游戏采用简化模型）。可以投标、放弃，或不接合同、自主建设；按期完成并通过考核会获得补助与长期付费，违约会扣减拨款。', 'good');
    }
    const P = g.corp; if (P.ym === ym) return; P.ym = ym;
    const ctx = context(g), E = g.econ;
    // 评标：投标后的下一个月初公布，结果按投标确定（读档不会改变）
    for (const t of P.tenders.slice()) {
      if (!t.bid || t.bid.ym >= ym) continue;
      P.tenders.splice(P.tenders.indexOf(t), 1);
      // 兼容旧档中超额待评标的项目：不超限签约、不扣保证金，也不扣信誉。
      if (P.contracts.length >= RULE.active) {
        t.status = 'cancelled'; t.closed = ym; t.why = '履约名额已满，本次投标取消，未扣费且不影响信誉';
        P.closed.push(t); if (P.closed.length > 30) P.closed.shift();
        say(g, '投标取消：' + t.title, t.why); continue;
      }
      const o = t.opts.find(function (x) { return x.key === t.bid.opt; }), p = t.bid.p;
      if (new U.RNG(hash(g.seed + ':' + t.id)).next() < p) {
        const c = Object.assign({}, t, { opt: o, signed: ym, deadline: ym + t.buildM, phase: 'build', paid: {}, status: 'active' });
        delete c.opts; delete c.bid; delete c.expires;
        P.contracts.push(c);
        charge(g, c, 'bond', o.bond, '履约保证金');
        if (o.land) charge(g, c, 'land', o.land, '物业开发权地价');
        say(g, '中标：' + t.title, '以「' + o.name + '」中标。' + ymText(c.deadline) + ' 前完成建设' + (t.type === 'upgrade' ? '（全线 8 节编组）' : '（连通「' + t.anchors.map(function (a) { return a.name; }).join('」与「') + '」）') + '，已付履约保证金 ' + U.fmtMoney(o.bond) + (o.land ? '、地价 ' + U.fmtMoney(o.land) : '') + '。', 'good');
      } else {
        t.status = 'lost'; t.closed = ym; P.closed.push(t); if (P.closed.length > 30) P.closed.shift();
        if (t.zone != null) P.cool['z:' + t.zone] = ym + 18; if (t.line) P.cool['l:' + t.line] = ym + 18;
        say(g, '未中标：' + t.title, '项目由其他公司承接。也可以不接合同，自主建设这一带的线路。');
      }
    }
    for (const c of P.contracts.slice()) step(g, P, c, ctx);
    // 到期未投标的招标撤下
    P.tenders = P.tenders.filter(function (t) { if (t.bid || ym <= t.expires) return true; if (t.zone != null) P.cool['z:' + t.zone] = ym + 12; if (t.line) P.cool['l:' + t.line] = ym + 12; return false; });
    if (ym >= P.next && P.tenders.length < RULE.open && P.contracts.length < RULE.active && g.model.trafficReady()) {
      const t = makeTender(g, P, ctx);
      if (t) { P.tenders.push(t); say(g, '新的招标：' + t.title, t.desc); }
      P.next = ym + (t ? RULE.every : 3);
    }
    E.rate = { score: Math.round(P.rating), grade: Corp.grade(P.rating), f: Corp.grantFactor(P.rating) };
  };
  // 投标与退出（界面调用）
  Corp.bid = function (g, id, key) {
    const P = g.corp, t = P && P.tenders.find(function (x) { return x.id === id; }); if (!t || t.bid) return { error: '招标已结束' };
    if (P.contracts.length + P.tenders.filter(function (x) { return !!x.bid; }).length >= RULE.active) return { error: '履约和待评标的项目合计最多 ' + RULE.active + ' 个' };
    const o = t.opts.find(function (x) { return x.key === key; }); if (!o) return { error: '方案不存在' };
    if (g.econ.funds < o.bond + o.land) return { error: '一般资金不足以支付履约保证金' + (o.land ? '与地价' : '') + '（' + U.fmtMoney(o.bond + o.land) + '）' };
    t.bid = { opt: key, ym: g.ym(), p: Corp.winChance(o, P.rating) };
    g.logEvent({ tag: '合同', title: '投标：' + t.title, desc: o.name + '，中标概率约 ' + U.fmtPct(t.bid.p, 0) + '，下月初公布结果。' });
    return { ok: true, t: t };
  };
  Corp.pass = function (g, id) {
    const P = g.corp, k = P ? P.tenders.findIndex(function (x) { return x.id === id && !x.bid; }) : -1; if (k < 0) return;
    const t = P.tenders.splice(k, 1)[0];
    if (t.zone != null) P.cool['z:' + t.zone] = g.ym() + 18; if (t.line) P.cool['l:' + t.line] = g.ym() + 18;
  };
  Corp.quit = function (g, id) {
    const P = g.corp, c = P && P.contracts.find(function (x) { return x.id === id; }); if (!c) return;
    fail(g, P, c, '公司主动退出', true);
    g.econ.rate = { score: Math.round(P.rating), grade: Corp.grade(P.rating), f: Corp.grantFactor(P.rating) };
  };
  // 本年合同收支（界面）
  Corp.yearSums = function (g) {
    const y = g.clock.y, E = g.econ; let inc = 0, out = 0;
    for (const r of E.ledger.concat([E.cur])) if (r.y === y) { inc += r.ppp || 0; out += r.pppOut || 0; }
    return { inc: inc, out: out };
  };

  // ================= 地图：合同页打开时标出招标与合同的片区、走向 =================
  // 只在任务页「合同」标签打开时绘制（几个圆与虚线），平时不占用每帧时间
  Corp.drawOverlay = function (ctx, R, ui) {
    const g = ui.g(), P = g && g.corp, top = ui.stack[ui.stack.length - 1];
    if (!P || !top || top.kind !== 'tasks' || ui.taskTab !== 'ppp' || ui.right.classList.contains('closed')) return;
    const items = P.tenders.map(function (t) { return [t, 'tender']; }).concat(P.contracts.map(function (c) { return [c, c.phase]; }));
    ctx.save(); ctx.font = CM.MAP_TYPE.place; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const it of items) {
      const t = it[0], a = t.area; if (!a || !t.anchors) continue;
      const col = it[1] === 'tender' ? '#2f6fa8' : (it[1] === 'ops' ? '#1f9254' : '#c98200');
      const c = R.P(a.x, a.y, 0), e = R.P(a.x + a.r, a.y, 0), rr = Math.max(14, Math.hypot(e.x - c.x, e.y - c.y)), hb = R.P(t.anchors[0].x, t.anchors[0].y, 0);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(hb.x, hb.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      const raw = (it[1] === 'tender' ? '招标' : (it[1] === 'ops' ? '运营' : '建设')) + ' · ' + TYPE[t.type].name, label = CM.I18n ? CM.I18n.text(raw) : raw, w = ctx.measureText(label).width + 16, ly = c.y - rr - 14;
      ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(c.x - w / 2, ly - 10, w, 20, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(label, c.x, ly + 0.5);
    }
    ctx.restore();
  };

  // ================= 界面：任务页「合同」标签 =================
  const UI = CM.UI, ic = CM.icon;
  // 投标方案的现金流（按年）：投资按建设期平摊、开通年收补助并退保证金、运营期每年可用性付费（铁路＋物业另计按预测客流的物业净收益）
  const flows = function (t, o) {
    const by = Math.ceil(t.buildM / 12), oy = Math.ceil(t.opsM / 12), n = by + oy, v = new Array(n).fill(0);
    v[0] -= o.bond + (o.land || 0);
    for (let k = 0; k < by; k++) v[k] -= t.est / by;
    v[by - 1] += o.sub + o.bond;
    for (let k = by; k < n; k++) v[k] += (o.apM + (o.propM || 0) - (o.holdM || 0)) * 12;
    return v;
  };
  const chart = function (t, o) {
    const v = flows(t, o), W = 236, H = 54, n = v.length, bw = W / n, mx = Math.max.apply(null, v.map(Math.abs)) || 1;
    let cum = 0, cmin = 0, cmax = 0; const cs = v.map(function (x) { cum += x; cmin = Math.min(cmin, cum); cmax = Math.max(cmax, cum); return cum; });
    const z = H * mx / (2 * mx), y = function (x) { return z - x / mx * (H / 2 - 3); };
    const cr = Math.max(Math.abs(cmin), Math.abs(cmax)) || 1, yc = function (x) { return z - x / cr * (H / 2 - 3); };
    let s = '<svg class="pp-cf" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="' + W + '" y1="' + z + '" y2="' + z + '" class="z"/>';
    v.forEach(function (x, k) { const y0 = Math.min(y(x), z), hh = Math.max(1, Math.abs(y(x) - z)); s += '<rect x="' + (k * bw + 1).toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + hh.toFixed(1) + '" class="' + (x < 0 ? 'neg' : 'pos') + '"/>'; });
    s += '<polyline class="cum" points="' + cs.map(function (c, k) { return ((k + 0.5) * bw).toFixed(1) + ',' + yc(c).toFixed(1); }).join(' ') + '"/></svg>';
    return h('div', { class: 'pp-cfw', html: s });
  };
  const riskText = function (o) {
    const a = [];
    if (o.mrg) a.push('客流低于预测 ' + Math.round(o.mrg.lo * 100) + '%：政府补差额的 ' + Math.round(o.mrg.k * 100) + '%');
    else if (!o.propM) a.push('无客流保底');
    if (o.share) a.push('高于 ' + Math.round(o.share.hi * 100) + '%：超出部分交 ' + Math.round(o.share.k * 100) + '%');
    if (o.propM) a.push('物业收益随客流与经济周期，可能亏损');
    return a.join('；');
  };
  // 客流对比预测：保底线、预测线与分成线
  const gauge = function (r, o) {
    const pct = function (x) { return (U.clamp(x / 2, 0, 1) * 100).toFixed(1) + '%'; };
    return h('div', { class: 'pp-gauge' },
      h('div', { class: 'pp-gbar' },
        o.mrg ? h('i', { class: 'lo', style: { left: pct(o.mrg.lo) }, 'data-tip': '保底线 ' + Math.round(o.mrg.lo * 100) + '%' }) : null,
        h('i', { class: 'mid', style: { left: '50%' }, 'data-tip': '政府预测' }),
        o.share ? h('i', { class: 'hi', style: { left: pct(o.share.hi) }, 'data-tip': '分成线 ' + Math.round(o.share.hi * 100) + '%' }) : null,
        r != null ? h('b', { class: 'now' + (o.mrg && r < o.mrg.lo ? ' low' : (o.share && r > o.share.hi ? ' high' : '')), style: { left: pct(r) } }) : null),
      h('div', { class: 'pp-gl tiny muted' }, h('span', null, '0'), h('span', null, '预测'), h('span', null, '2 倍')));
  };
  // 合同时间线：建设期（签约 → 开通期限）与运营期，标出当前月份
  const timeline = function (c, ym) {
    const a = c.signed, b = c.phase === 'ops' ? c.opened : c.deadline, e = (c.phase === 'ops' ? c.opened : c.deadline) + c.opsM, span = Math.max(1, e - a);
    const w = function (x) { return (U.clamp(x / span, 0, 1) * 100).toFixed(1) + '%'; };
    return h('div', { class: 'pp-tl' },
      h('div', { class: 'pp-tlbar' }, h('i', { class: 'b', style: { width: w(b - a) } }), h('i', { class: 'o', style: { left: w(b - a), width: w(e - b) } }), h('b', { class: 'now', style: { left: w(ym - a) } })),
      h('div', { class: 'pp-tll tiny muted' }, h('span', null, ymText(a) + ' 签约'), h('span', null, (c.phase === 'ops' ? ymText(b) + ' 开通' : ymText(b) + ' 前开通')), h('span', null, ymText(e) + ' 期满')));
  };
  const typeTag = function (t) { return h('span', { class: 'tag pp-' + t.type }, TYPE[t.type].name); };
  const locBtns = function (self, g, t) {
    const out = [];
    if (t.anchors) for (const a of t.anchors) out.push(h('button', { class: 'tk-anchor', 'data-tip': '在地图上定位「' + a.name + '」', onclick: function () { self.locatePoint(a.x, a.y, a.name, a.r || 2); } }, ic('locate', 13), a.name));
    if (t.line && g.net.lines[t.line]) out.push(h('button', { class: 'tk-anchor', onclick: function () { self.openPage('line', t.line); } }, ic('route', 13), g.net.lines[t.line].name));
    return out.length ? h('div', { class: 'tk-anchors' }, out) : null;
  };
  UI.prototype.corpTab = function (body) {
    const g = this.g(), self = this, ym = g.ym(), F = Corp.flavor(g), P = g.corp;
    const done = function () { g.touch(); self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage(); };
    if (!P) {
      const st = Corp.unlockState(g);
      body.appendChild(h('div', { class: 'pp-lock' }, h('span', { class: 'badge b-blue' }, ic('briefcase')),
        h('div', { class: 'grow' }, h('b', null, '政府合同尚未开放'), h('div', { class: 'tiny muted' }, '满足以下条件后，政府开始以招标方式提出建设需求（' + F.name + '，简化模型）：')),
        h('ul', { class: 'pp-need' }, st.need.map(function (x) { return h('li', { class: x.ok ? 'ok' : '' }, ic(x.ok ? 'check' : 'hourglass', 13), h('span', { class: 'grow' }, x.label), h('small', { class: 'muted' }, x.cur)); }))));
      body.appendChild(rules(this));
      return;
    }
    // 公司概况：履约信誉、拨款系数与本年合同收支
    const ys = Corp.yearSums(g), gr = Corp.grade(P.rating), city = CM.DATA.city || '';
    body.appendChild(h('div', { class: 'pp-head' },
      h('div', { class: 'pp-co' }, h('span', { class: 'badge b-blue' }, ic('briefcase')), h('div', { class: 'grow' }, h('b', null, city + '地铁公司'), h('div', { class: 'tiny muted' }, F.name + ' · 简化模型'))),
      h('div', { class: 'pp-rate' }, h('div', { class: 'pp-grade g' + gr }, gr),
        h('div', { class: 'grow' }, h('div', { class: 'row between tiny' }, h('span', null, '履约信誉 ' + Math.round(P.rating)), h('span', { class: 'muted' }, '拨款 ×' + Corp.grantFactor(P.rating).toFixed(3))),
          h('div', { class: 'pp-rbar' }, h('i', { style: { width: U.clamp(P.rating, 0, 100) + '%' } }), [40, 60, 80].map(function (x) { return h('s', { style: { left: x + '%' } }); })),
          h('div', { class: 'tiny muted' }, '信誉影响中标概率与每月拨款；按期开通、通过考核会提高，违约会大幅降低'))),
      h('div', { class: 'pp-kpis' },
        h('div', null, h('small', null, '履约中'), h('b', null, P.contracts.length + ' / ' + RULE.active)),
        h('div', null, h('small', null, g.clock.y + ' 年合同收入'), h('b', { class: 'good' }, U.fmtMoney(ys.inc))),
        h('div', null, h('small', null, g.clock.y + ' 年合同支出'), h('b', { class: ys.out > 0.5 ? 'bad' : '' }, U.fmtMoney(ys.out))))));
    // 招标中
    body.appendChild(h('div', { class: 'fl-h tk-sech' }, ic('megaphone', 14), '招标中 · ' + P.tenders.length));
    if (!P.tenders.length) body.appendChild(h('div', { class: 'note' }, '暂无招标。政府约每 ' + RULE.every + ' 个月按城市需要提出一个项目' + (P.next > ym ? '（下次约 ' + ymText(P.next) + '）' : '') + '；不接合同也可以自主建设。'));
    for (const t of P.tenders) {
      const c = h('div', { class: 'tk-card pp-card pp-tender' + (t.bid ? ' bid' : '') });
      c.appendChild(h('div', { class: 'tk-top' }, h('span', { class: 'badge b-blue' }, ic(TYPE[t.type].icon)),
        h('div', { class: 'grow' }, h('div', { class: 'tk-meta' }, typeTag(t), h('span', { class: 'tiny muted' }, t.bid ? '已投标' : (t.expires > ym ? '还可投标 ' + (t.expires - ym) + ' 个月' : '本月截止投标'))), h('b', { class: 'tk-title' }, t.title))));
      c.appendChild(h('div', { class: 'tk-desc' }, t.desc));
      c.appendChild(h('div', { class: 'pp-facts' },
        h('div', null, h('small', null, '估算投资'), h('b', null, U.fmtMoney(t.est))),
        h('div', null, h('small', null, '建设期（月）'), h('b', null, String(t.buildM))),
        h('div', null, h('small', null, '运营期（年）'), h('b', null, String(t.opsM / 12))),
        t.forecast ? h('div', { 'data-tip': '片区车站每天的进站人次：政府按本市车站的客流与片区人口、岗位估算，偏乐观' }, h('small', null, '预测进站 / 日'), h('b', null, U.fmtPeople(t.forecast))) : null));
      const lb = locBtns(self, g, t); if (lb) c.appendChild(lb);
      const opts = h('div', { class: 'pp-opts' });
      for (const o of t.opts) {
        const p = Corp.winChance(o, P.rating), mine = t.bid && t.bid.opt === o.key, gov = o.sub + o.apT;
        opts.appendChild(h('div', { class: 'pp-opt' + (mine ? ' on' : '') },
          h('div', { class: 'row between' }, h('b', null, o.name), h('span', { class: 'tiny muted', 'data-tip': '按当前履约信誉估算' }, '中标约 ' + U.fmtPct(t.bid && mine ? t.bid.p : p, 0))),
          h('div', { class: 'pp-wbar' }, h('i', { style: { width: (p * 100).toFixed(0) + '%' } })),
          chart(t, o),
          h('div', { class: 'pp-terms tiny' },
            o.sub ? h('div', null, '建设补助 ', h('b', null, U.fmtMoney(o.sub)), '（开通时）') : h('div', null, '无建设补助'),
            h('div', null, '可用性付费 ', h('b', null, U.fmtMoney(o.apM)), ' / 月'),
            o.propM ? h('div', null, '物业收益约 ', h('b', null, U.fmtMoney(o.propM)), ' / 月，持有成本 ', h('b', null, U.fmtMoney(o.holdM))) : null,
            h('div', { class: 'muted' }, '政府支付合计 ' + U.fmtMoney(gov) + '（投资的 ' + Math.round(gov / Math.max(1, t.est) * 100) + '%）'),
            h('div', { class: 'muted' }, riskText(o)),
            h('div', { class: 'muted' }, '保证金 ' + U.fmtMoney(o.bond) + (o.land ? ' · 地价 ' + U.fmtMoney(o.land) : ''))),
          t.bid ? (mine ? h('span', { class: 'tag good' }, '已投标 · 下月初公布') : null)
            : h('button', { class: 'btn sm' + (o.key === 'std' ? ' primary' : ''), onclick: function () { const r = Corp.bid(g, t.id, o.key); if (r.error) self.toast(r.error, 'bad'); else { if (CM.Sound) CM.Sound.play('contract'); self.toast('已投标「' + t.title + '」：' + o.name + '，下月初公布结果', 'good'); done(); } } }, '按此投标')));
      }
      c.appendChild(opts);
      c.appendChild(h('div', { class: 'pp-legend tiny muted' }, h('i', { class: 'neg' }), '公司投入', h('i', { class: 'pos' }), '政府支付' + (t.type === 'tod' ? ' / 物业净收益' : ''), h('i', { class: 'cum' }), '累计（不含票款）'));
      if (!t.bid) c.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'grow tiny muted' }, '不投标没有惩罚；也可以不接合同，自主建设。'), h('button', { class: 'btn sm ghost', onclick: function () { Corp.pass(g, t.id); done(); } }, '放弃投标')));
      body.appendChild(c);
    }
    // 履约中
    body.appendChild(h('div', { class: 'fl-h tk-sech' }, ic('report', 14), '履约中 · ' + P.contracts.length));
    if (!P.contracts.length) body.appendChild(h('div', { class: 'note' }, '还没有履约中的合同。'));
    for (const c of P.contracts) {
      const o = c.opt, left = c.phase === 'build' ? c.deadline - ym : c.opsEnd - ym, urg = c.phase === 'build' && left <= 6 ? ' hot' : (c.phase === 'build' && left <= 12 ? ' warm' : '');
      const card = h('div', { class: 'tk-card pp-card' + urg + (c.phase === 'ops' && c.kpi && c.kpi.f === 1 ? ' ok' : '') });
      card.appendChild(h('div', { class: 'tk-top' }, h('span', { class: 'badge b-blue' }, ic(TYPE[c.type].icon)),
        h('div', { class: 'grow' }, h('div', { class: 'tk-meta' }, typeTag(c), h('span', { class: 'tag ' + (c.phase === 'ops' ? 'good' : 'info') }, c.phase === 'ops' ? '运营期' : '建设期'), h('span', { class: 'tiny muted' }, o.name)), h('b', { class: 'tk-title' }, c.title)),
        c.phase === 'build' ? this.taskRing(c.prog ? c.prog.v : 0, '') : null));
      card.appendChild(timeline(c, ym));
      if (c.phase === 'build') {
        card.appendChild(h('div', { class: 'tk-goal' }, ic('target', 14), h('span', null, c.prog ? c.prog.text : (c.type === 'upgrade' ? '全线列车加长到 8 节' : '连通各处并开通运营'))));
        card.appendChild(h('div', { class: 'tk-tl' }, ic('hourglass', 13), h('b', null, left > 0 ? '距开通期限 ' + left + ' 个月' : '本月到期'), h('span', { class: 'muted' }, '开通时收建设补助 ' + U.fmtMoney(o.sub) + '，退还保证金 ' + U.fmtMoney(o.bond))));
      } else {
        const k = c.kpi || {};
        card.appendChild(h('div', { class: 'tk-stakes' },
          h('span', { class: 'tk-chip ' + (k.conn === false ? 'bad' : 'good') }, ic(k.conn === false ? 'close' : 'check', 13), '服务连通'),
          h('span', { class: 'tk-chip ' + (k.crowd === false ? 'bad' : 'good'), 'data-tip': '合同线路最拥挤区段的早高峰满载率' }, ic(k.crowd === false ? 'close' : 'check', 13), '拥挤 ' + (k.lf != null ? U.fmtPct(k.lf, 0) : '—') + ' / ' + U.fmtPct(k.lim || 1.1, 0)),
          h('span', { class: 'tk-chip' }, ic('coin', 13), '本月付费 ' + Math.round((k.f == null ? 1 : k.f) * 100) + '%')));
        if (c.forecast) {
          card.appendChild(h('div', { class: 'row between tiny', style: { marginTop: '8px' } }, h('span', null, '片区车站进站 ' + (k.inn != null ? U.fmtPeople(k.inn) : '—') + ' / 预测 ' + U.fmtPeople(c.forecast) + ' 人次/日'), h('b', null, k.r != null ? U.fmtPct(k.r, 0) : '—')));
          card.appendChild(gauge(k.r, o));
        }
        card.appendChild(h('div', { class: 'tk-tl' }, ic('hourglass', 13), h('b', null, '运营期还剩 ' + Math.max(0, left) + ' 个月'), h('span', { class: 'muted' }, '可用性付费 ' + U.fmtMoney(o.apM) + ' / 月，按考核支付')));
      }
      const pd = c.paid || {};
      const rows = [['已收补助与付费', (pd.sub || 0) + (pd.ap || 0) + (pd.mrg || 0), 'good'], [pd.refund ? '保证金（已退还）' : '已付保证金', pd.bond || 0, ''], ['地价', pd.land || 0, ''], ['考核扣减', pd.cut || 0, 'bad'], ['超额分成', pd.share || 0, 'bad']];
      if (o.propM) rows.push(['物业净收益', (pd.prop || 0) - (pd.hold || 0), (pd.prop || 0) >= (pd.hold || 0) ? 'good' : 'bad']);
      card.appendChild(h('div', { class: 'pp-money' }, rows.filter(function (r) { return Math.abs(r[1]) > 0.05 || r[0] === '已收补助与付费'; }).map(function (r) { return h('div', null, h('small', null, r[0]), h('b', { class: r[2] }, (r[1] < 0 ? '−' : '') + U.fmtMoney(Math.abs(r[1])))); })));
      const acts = [];
      const lb = locBtns(self, g, c); if (lb) card.appendChild(lb);
      if (c.phase === 'build') acts.push(h('button', { class: 'btn sm ghost danger', onclick: function () {
        self.confirm('退出合同？', '保证金不予退还，未来 ' + RULE.fail.months + ' 个月拨款 ×' + RULE.fail.grant + '，满意度与履约信誉下降。已建的线路照常归公司运营。', '退出合同', function () { Corp.quit(g, c.id); done(); }, true, 'warn');
      } }, '退出合同'));
      if (acts.length) card.appendChild(h('div', { class: 'row', style: { marginTop: '6px', justifyContent: 'flex-end' } }, acts));
      body.appendChild(card);
    }
    // 已结束
    if (P.closed.length) body.appendChild(this.sec('pp-closed', '已结束', P.closed.length + ' 项', function () {
      const b = h('div');
      for (const c of P.closed.slice().reverse()) {
        const st = { done: ['check', '期满移交', 'ok'], cancelled: ['close', '投标已取消', ''], failed: ['close', '违约', 'fail'], lost: ['close', '未中标', 'fail'] }[c.status] || ['close', '', 'fail'];
        b.appendChild(h('div', { class: 'tk-row ' + st[2] }, h('span', { class: 'tk-res' }, ic(st[0], 14)),
          h('div', { class: 'grow' }, h('div', { class: 'tk-meta' }, typeTag(c), h('span', { class: 'tiny muted' }, st[1])), h('b', null, c.title),
            h('div', { class: 'tiny muted' }, ymText(c.closed) + (c.why ? ' · ' + c.why : '') + (c.paid ? ' · 累计收到 ' + U.fmtMoney((c.paid.sub || 0) + (c.paid.ap || 0) + (c.paid.mrg || 0)) : '')))));
      }
      return b;
    }, false, 'calYear'));
    body.appendChild(rules(this));
  };
  // 规则说明（简化模型）
  const rules = function (ui) {
    const g = ui.g(), F = Corp.flavor(g);
    return ui.sec('pp-rule', '简化模型说明', '', function () {
      return h('div', { class: 'note' }, h('ul', { class: 'tk-tips' },
        h('li', null, F.note + '；不同国家与年代的真实制度差别很大，游戏统一用一套简化规则，不代表任何真实合同。'),
        h('li', null, '普通政府任务仍是任务；只有含投资、风险分担与长期履约的项目才作为合同招标。可以投标、放弃，或不接合同、自主建设。'),
        h('li', null, '中标后公司出资建设：按期开通收建设补助、退保证金；运营期每月考核服务连通与拥挤，未达标按比例扣减可用性付费。'),
        h('li', null, '新线合同按政府预测分担客流风险：低于保底线由政府补差，高于分成线要上交一部分。铁路＋物业合同的物业收益随客流与经济周期波动，可能亏损。'),
        h('li', null, '到期未开通、服务连续 3 个月中断或主动退出即违约：保证金不退（运营期另付违约金），拨款 ×' + RULE.fail.grant + '（' + RULE.fail.months + ' 个月），满意度与信誉下降。')));
    }, false, 'info');
  };
})(window.CM);
