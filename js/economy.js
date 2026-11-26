'use strict';
// 经营：资金、拨款、票款、运营费用、满意度、失败判定；任务：历史参考任务与动态任务
(function (CM) {
  const U = CM.U, CFG = CM.CFG, D = CM.DATA;

  // 月度账本。科目严格区分：
  //   财政收入 grant 拨款 · fare 票款 · reward 任务奖励
  //   融资到账 bond（债券募集，进入建设专项资金，不算收入）
  //   建设支出 construction · demolition · upgrade · relocation（其中 capexUse 为专项资金支付的部分）
  //   运营成本 ops · 利息 interest · 本金偿还 principal · 逾期费用 penalty
  //   v2.5：车站商业（TOD）运营成本 todCost · 政府合同收入 ppp（建设补助、可用性付费、客流保底、退还保证金）· 合同支出 pppOut（保证金、地价、超额分成、违约金）
  function blankMonth(y, m, funds, capex) {
    return { y: y, m: m, start: funds, grant: 0, fare: 0, construction: 0, demolition: 0, upgrade: 0, relocation: 0, ops: 0, reward: 0,
      bond: 0, interest: 0, principal: 0, penalty: 0, capexUse: 0, capexStart: capex || 0, days: 0, wdDays: 0, weDays: 0, end: funds, commerce: 0, todCost: 0, ppp: 0, pppOut: 0, fleetSale: 0 };
  }
  const BUILD_KINDS = ['construction', 'demolition', 'upgrade', 'relocation'];
  const MONEY_EPS = 1e-7;   // 内部单位是万元；只忽略浮点误差，不能把不足 0.5 万的真实债务清零
  Economy.BUILD_KINDS = BUILD_KINDS;
  Economy.MONEY_EPS = MONEY_EPS;

  function Economy(mode, y, m) {
    this.mode = mode;
    this.funds = mode === 'free' ? 0 : CFG.economy.startFunds;   // 一般资金（拨款、票款等；运营、利息与还本只能从这里支付）
    this.capex = 0;            // 建设专项资金：债券募集，只能用于地铁建设及改扩建
    this.bonds = [];           // 已发行的债券
    this.bondIssued = {};      // 每年已发行额 { 年份: { local, ct } }
    this.overdue = 0;          // 逾期未付的本息
    this.overdueMonths = 0;    // 连续存在逾期的月数
    this.overdueParts = { interest: 0, principal: 0, penalty: 0 };   // 逾期的构成（偿还时分别记入利息、本金、费用）
    this.flow = [];            // 资金流水
    this.bondSeq = 1;
    this.fare = Economy.defaultFare();
    this.cross = {};           // 城市连接：各接驳口的跨境附加费（v2.7），键为设施 id
    this.cur = blankMonth(y, m, this.funds, 0);
    this.ledger = [];
    this.sat = CFG.economy.startSat;
    this.mods = [];
    this.negMonths = 0; this.lowSatMonths = 0;
    this.failed = null;
    this.lastDay = null;
    this.satFactors = null;
    this.fisc = null;          // 财力系数 { y, f }（城市经济每年 1 月设定）
    this.quoteFn = null;       // 新发债券的利率报价（城市经济提供；不保存）
    this.fareAuto = null; if (mode !== 'free') this.setFareAuto(true, y);   // 随物价自动调价默认开启（v3.0 玩家建议）；读档时按存档里的设置
  }
  CM.Economy = Economy;
  // 财政收入不含借款。运营补贴和跨境附加费已分别计入拨款与票款。
  Economy.incomeOf = function (row) {
    return (row.grant || 0) + (row.fare || 0) + (row.reward || 0) + (row.commerce || 0) + (row.ppp || 0) + (row.fleetSale || 0);
  };
  Economy.opsOf = function (row) { return (row.ops || 0) + (row.todCost || 0); };

  Economy.prototype.isFree = function () { return this.mode === 'free'; };
  Economy.prototype.spend = function (kind, amount) {
    if (amount <= 0) return;
    this.cur[kind] = (this.cur[kind] || 0) + amount;
    if (!this.isFree()) this.funds -= amount;
  };
  Economy.prototype.income = function (kind, amount) {
    this.cur[kind] = (this.cur[kind] || 0) + amount;
    if (!this.isFree()) this.funds += amount;
  };
  // ======================== 车站商业开发（TOD，v2.3） ========================
  // 玩家只决定是否开发及投入等级；收入按车站的日进出站与换乘人次（当天日型）× 每人次收益，换乘站有枢纽溢价。
  // 每人次收益以本城默认票价为基准、随价格指数上涨；客流很大时边际收益递减（商铺面积有限）。
  // 投入为同年中型地下站造价的比例 × 车站规模（换乘站面积更大、投入更多），一次支付、不退还。
  // 数值目标（v2.3 平衡）：日客流约 1 万人次的普通站，三级分别约 3 / 6 / 9 年回本；大型换乘枢纽约 1.5 / 2.5 / 4 年
  // v2.5「经营不善也会亏钱」：开发后每年有运营、维护与财务成本（累计投入的 6% / 4.5% / 3.5%），日客流低于约 1,500 / 2,300 / 3,000 人次
  // 的车站入不敷出（日客流 1 万人次的普通站约 3 / 7 / 14 年回本，大型枢纽仍很快）；商业街与站城一体的收入随城市经济周期涨落，衰退时更容易亏损
  const TOD = CM.TOD = {
    LEVELS: [
      { name: '未开发', k: 0, cost: 0, upkeep: 0, cyc: 0 },
      { name: '广告与便利店', k: 0.06, cost: 0.0045, upkeep: 0.06, cyc: 0.4, desc: '站内灯箱广告与便利店' },
      { name: '站内商业街', k: 0.15, cost: 0.022, upkeep: 0.045, cyc: 0.75, desc: '通道与站厅的连续商铺' },
      { name: '站城一体开发', k: 0.3, cost: 0.075, upkeep: 0.035, cyc: 1, desc: '车站上盖与周边物业联合开发' },
    ],
    HUB: 1.25,   // 两条及以上线路的换乘站
    SIZE: { S: 0.7, M: 1, L: 1.5, XL: 2 },
    pi: function (y) { return U.priceIndex(y, CFG.cost.inflation, CFG.econBase || 1990); },
    cost: function (level, y, size, hub) { return TOD.LEVELS[level].cost * CFG.cost.station.underground.M * (TOD.SIZE[size] || 1) * (hub ? 1.3 : 1) * TOD.pi(y); },
    // 经济周期系数：城市经济的商业系数（约 0.7–1.25），按等级的敏感度折算；没有城市经济的地图为 1。每月缓存一次
    cycle: function (g, level) {
      if (!g || !CM.Macro || !g.macro) return 1;
      const ym = g.ym(); if (!g._todCyc || g._todCyc.ym !== ym) { const f = CM.Macro.cityFactors(g); g._todCyc = { ym: ym, com: f ? U.clamp(f.com, 0.7, 1.25) : 1 }; }
      return 1 + (g._todCyc.com - 1) * TOD.LEVELS[level].cyc;
    },
    // 单站日收入（万元）：flow 为当天进出站 + 换乘人次（12 万人次以上逐渐饱和）；g 给出时计入经济周期
    stationDaily: function (level, flow, hub, y, g) { return flow / (1 + flow / 120000) * CFG.fareDefault.flat * TOD.LEVELS[level].k * (CFG.economy.todK || 1) * (hub ? TOD.HUB : 1) * TOD.pi(y) / 10000 * (g ? TOD.cycle(g, level) : 1); },
    // 单站日成本（万元）：累计投入（到该等级为止）× 年成本率 ÷ 365
    stationCost: function (level, y, size, hub) { return level ? TOD.cost(level, y, size, hub) * TOD.LEVELS[level].upkeep / 365 : 0; },
    // 全网当天的商业收入与成本（万元）
    daily: function (g, dt) {
      const m = g.model, C = m.net ? m.net.C : null, sd = dt === 'we' ? m.stDailyWe : m.stDailyWk, out = { rev: 0, cost: 0 }; if (!C) return out;
      const y = g.clock.y, live = sd && !m.dailyStale;
      for (let i = 0; i < C.stations.length; i++) {
        const s = g.net.stations[C.stations[i].id], lv = s && s.tod; if (!lv) continue;
        const hub = C.stationLines[i].size >= 2;
        if (live && i < sd.inn.length) out.rev += TOD.stationDaily(lv, sd.inn[i] + sd.out[i] + sd.xfer[i], hub, y, g);
        out.cost += TOD.stationCost(lv, y, s.size, hub);
      }
      return out;
    },
  };
  // 价格指数以本地图的价格基年（CFG.econBase）为 1，涨幅可分段
  Economy.prototype.costIndex = function (year) { return U.priceIndex(year, CFG.cost.inflation, CFG.econBase || 1990); };
  Economy.prototype.opsIndex = function (year) { return U.priceIndex(year, CFG.ops.inflation, CFG.econBase || 1990); };

  // 每日结算：票款与运营费用，按当天的日类型（工作日 / 周末）的模拟结果逐日累计（v1.9 起；之前按典型工作日）
  // cross：当天的跨境附加费（元，v2.7），计入票款，并单独记一笔供账目显示
  Economy.prototype.day = function (daily, compiled, year, dt, cross) {
    const crossWan = daily && daily.ready && cross > 0 ? cross / 10000 : 0;
    const fareWan = daily && daily.ready ? daily.fare / 10000 + crossWan : 0;
    if (crossWan) this.cur.crossFee = (this.cur.crossFee || 0) + crossWan;
    const ops = this.dailyOps(daily, compiled, year);
    this.income('fare', fareWan);
    this.spend('ops', ops);
    this.cur.days++;
    if (dt === 'we') this.cur.weDays = (this.cur.weDays || 0) + 1; else if (dt === 'wd') this.cur.wdDays = (this.cur.wdDays || 0) + 1;
    this.lastDay = { fare: fareWan, ops: ops, dt: dt || null };
  };

  Economy.prototype.dailyOps = function (daily, compiled, year) {
    if (!daily || !compiled) return 0;
    // 车厢公里按车型运营成本系数加权，旧的统计结果回退到普通车厢公里。
    const km = daily.carKmW ?? daily.carKm ?? 0;
    const stationCost = compiled.stations.reduce(function (cost, station) { return cost + CFG.ops.stationDaily[station.size]; }, 0);
    return (km * CFG.ops.carKmCost + stationCost) * this.opsIndex(year);
  };

  // 拨款与满意度调整（mods）：until 为最后一个生效的月份（含当月），N 个月的效果记为 ym + N − 1
  // 财力系数（城市经济，macro.js）：上一年实际地方财政收入 ÷ 预期，每年 1 月确定一次；没有城市经济的地图为 1
  Economy.prototype.fiscalFactor = function () { return this.fisc && isFinite(this.fisc.f) ? this.fisc.f : 1; };
  // 基础额度：按城市与年代设定的地铁资金基数（不含财力、满意度与任务调整）。
  // 历史末年（通常 2020 年）之后：以末年额度为基数，按城市经济的预期地方财政收入增长（macro.js syncEcon 提供 revIdx；
  // v2.1 第二轮：原来只按固定表每年约 1.7% 增长，跟不上城市财力与运营成本，后期入不敷出）。没有城市经济的地图仍按表
  Economy.prototype.grantQuota = function (y, m) {
    const t = y + ((m || 1) - 1) / 12, R = this.revIdx;
    if (!R || t <= R.he) return U.interp(CFG.economy.grantBase, t) * (CM.Eras ? CM.Eras.finance(t).grant : 1);
    return U.interp(CFG.economy.grantBase, R.he) * R.f(t);
  };
  Economy.prototype.grantFor = function (y, m) {
    const ym = U.ymIndex(y, m);
    let f = 0.6 + 0.8 * this.sat / 100, mf = 1;
    for (const md of this.mods) if (md.kind === 'grant' && md.until >= ym) mf *= md.factor;
    return this.grantQuota(y, m) * this.fiscalFactor() * f * this.rateFactor() * Math.max(CFG.economy.grantModFloor || 0.6, mf);
  };
  // 履约信誉系数（v2.5，corp.js）：政府合同开放后，拨款随地铁公司的履约信誉 ×0.95–1.05；开放前为 1
  Economy.prototype.rateFactor = function () { return this.rate && isFinite(this.rate.f) ? this.rate.f : 1; };
  Economy.prototype.grantFactors = function (y, m) {
    const ym = U.ymIndex(y, m);
    const list = [];
    if (this.fisc) list.push({ label: '财力系数（' + (this.fisc.y || y) + ' 年预算）', f: this.fiscalFactor(), kind: 'fisc' });
    list.push({ label: '满意度系数（' + Math.round(this.sat) + '）', f: 0.6 + 0.8 * this.sat / 100, kind: 'sat' });
    if (this.rate) list.push({ label: '履约信誉（' + this.rate.grade + ' 级 · ' + this.rate.score + ' 分）', f: this.rateFactor(), kind: 'corp' });
    for (const md of this.mods) if (md.kind === 'grant' && md.until >= ym) list.push({ label: md.reason + '（至 ' + Math.floor(md.until / 12) + '年' + (md.until % 12 + 1) + '月）', f: md.factor, kind: 'task' });
    return list;
  };
  // 新月份：先开新账（期初 = 上月期末），任务奖励等记入新月；再发放本月拨款
  Economy.prototype.openMonth = function (y, m) { this.cur = blankMonth(y, m, this.funds, this.capex); };
  Economy.prototype.payGrant = function (y, m) {
    if (!this.isFree()) {
      const v = this.grantFor(y, m); this.income('grant', v); this.log('grant', v, 'gen', '政府拨款', { y: y, m: m, d: 1 });
      const sub = this.opsSubsidy();
      if (sub > 0) { this.income('grant', sub); this.cur.opsSub = sub; this.log('grant', sub, 'gen', '运营补贴（上月运营缺口的 ' + U.fmtPct(Economy.opsSubRate(), 0) + '）', { y: y, m: m, d: 1 }); }
    }
    else this.cur.grant = 0;
  };
  // 早期网页版可能把未发完拨款的月初当作推进完成并保存。
  Economy.prototype.restoreOpeningGrant = function (clock) {
    const { y, m, d } = clock, last = this.ledger[this.ledger.length - 1];
    if (d !== 1) return;
    const prior = this.cur;
    // 旧版可能在上月封账后、新月开账前保存。只有能确认当前行是同一张已封账的账单时才补开新月。
    if (last?.closed && prior.closed && prior.y === last.y && prior.m === last.m &&
        U.ymIndex(last.y, last.m) + 1 === U.ymIndex(y, m) &&
        last.days === U.daysInMonth(last.y, last.m) && Number.isFinite(this.funds) && last.end === this.funds &&
        (last.capexEnd || 0) === this.capex && JSON.stringify(last) === JSON.stringify(prior)) {
      this.openMonth(y, m);
    }
    const cur = this.cur;
    if (this.mode !== 'challenge' || this.failed || cur.y !== y || cur.m !== m ||
        cur.closed || cur.days !== 0 || cur.grant !== 0 || !last?.closed ||
        U.ymIndex(last.y, last.m) + 1 !== U.ymIndex(y, m)) return;
    if (this.flow.some(function (entry) { return entry.kind === 'grant' && entry.y === y && entry.m === m; })) return;
    const quota = this.grantFor(y, m);
    if (!Number.isFinite(quota) || quota <= 0) return;
    this.payGrant(y, m);
    this.serviceDebt(y, m);
  };
  // 运营补贴（v3.1 平衡：后期线网越修越大、郊区线路客流少，运营费用吃掉全部拨款，「后期一直亏钱」）：
  // 上月票款抵不了运营费用（列车运行与车站，不含车站商业）时，政府按财力系数补上缺口的一部分（默认一半），随月初拨款发放。
  // 只补一半：客流差的线路仍然亏钱，提高客流和票款覆盖率依然有回报；线网小、票款够用时几乎没有补贴
  Economy.opsSubRate = function () { const k = CFG.economy.opsSubsidy; return k != null ? U.clamp(+k || 0, 0, 1) : 0.5; };
  Economy.prototype.opsSubsidy = function () {
    const k = Economy.opsSubRate(), L = this.ledger[this.ledger.length - 1];
    if (!(k > 0) || !L) return 0;
    const gap = (L.ops || 0) - (L.fare || 0);
    return gap > MONEY_EPS ? gap * k * this.fiscalFactor() : 0;
  };
  Economy.prototype.startMonth = function (y, m) { this.openMonth(y, m); this.payGrant(y, m); };
  // 封账：记录期末并归档；之后的收支一律记入下一个月
  // 推进报告：扣除开始时的当月已入账金额，并计入到达月已发生的收支。
  Economy.prototype.summarizeAdvance = function (from, to, startingMonth) {
    const first = U.ymIndex(from[0], from[1]), last = U.ymIndex(to[0], to[1]);
    const totals = { income: 0, ops: 0, build: 0, debt: 0, bond: 0, contractOut: 0, capexUse: 0 };
    const add = function (r, sign) {
      totals.income += sign * Economy.incomeOf(r);
      totals.ops += sign * Economy.opsOf(r);
      totals.build += sign * BUILD_KINDS.reduce(function (sum, k) { return sum + (r[k] || 0); }, 0);
      totals.debt += sign * ((r.interest || 0) + (r.principal || 0) + (r.penalty || 0));
      totals.bond += sign * (r.bond || 0);
      totals.contractOut += sign * (r.pppOut || 0);
      totals.capexUse += sign * (r.capexUse || 0);
    };
    const inPeriod = function (r) { const ym = U.ymIndex(r.y, r.m); return ym >= first && ym <= last; };
    for (const r of this.ledger) if (inPeriod(r)) add(r, 1);
    if (this.cur && !this.cur.closed && inPeriod(this.cur)) add(this.cur, 1);
    if (startingMonth && inPeriod(startingMonth)) add(startingMonth, -1);
    return totals;
  };

  Economy.prototype.closeMonth = function () {
    this.cur.end = this.funds;
    this.cur.capexEnd = this.capex;
    this.cur.debtEnd = this.debtTotal();
    this.cur.overdueEnd = this.overdue;
    // 票款与运营费用逐日结算，在流水中按月汇总为两条
    if (!this.isFree()) {
      const c = this.cur, when = { y: c.y, m: c.m, d: U.daysInMonth(c.y, c.m) };
      if (c.fare > 0.5) this.log('fare', c.fare, 'gen', '本月票款（' + c.days + ' 天' + (c.wdDays || c.weDays ? '：' + (c.wdDays || 0) + ' 个工作日、' + (c.weDays || 0) + ' 个周末日' : '') + '）', when);
      if (c.commerce > 0.5) this.log('commerce', c.commerce, 'gen', '本月车站商业收入（广告与租金）', when);
      if (c.todCost > 0.5) this.log('ops', -c.todCost, 'gen', '本月车站商业运营与维护成本', when);
      if (c.ops > 0.5) this.log('ops', -c.ops, 'gen', '本月运营成本（' + c.days + ' 天）', when);
    }
    this.cur.closed = true;
    this.ledger.push(this.cur);
    if (this.ledger.length > 600) this.ledger.shift();
    return this.cur;
  };

  // 满意度（0–100）：通勤、覆盖、拥堵、票价负担、拥挤。daily 为周平均日（5 个工作日 + 2 个周末日加权），
  // 通勤时间按工作日（model.dailyWk）；opts.protect：交通模型升级过渡期，满意度不下降
  Economy.prototype.updateSatisfaction = function (daily, model, y, m, opts) {
    if (!daily || !daily.ready) return;
    const vot = U.interp(CFG.choice.vot, y);
    const wk = model && model.dailyWk && model.dailyWk.ready ? model.dailyWk : daily;
    const f = [];
    f.push({ label: '平均通勤时间（工作日 ' + Math.round(wk.commute) + ' 分钟）', v: 14 * U.clamp((40 - wk.commute) / 15, -1, 1) });
    f.push({ label: '地铁覆盖（' + U.fmtPct(daily.coverage, 0) + ' 人口）', v: 12 * U.clamp(daily.coverage / 0.5, 0, 1) });
    f.push({ label: '道路拥堵（周平均指数 ' + daily.cong.toFixed(2) + '）', v: -14 * U.clamp((daily.cong - 1.25) / 0.8, 0, 1) });
    const burden = daily.metro > 1 ? daily.avgFare / (vot * 0.35) : 0;
    f.push({ label: '票价负担（平均 ' + U.cur(daily.avgFare).toFixed(U.cur(daily.avgFare) < 10 ? 2 : 1) + ' ' + CFG.money.unit + '）', v: -9 * U.clamp((burden - 1) / 2, 0, 1) });
    f.push({ label: '车厢拥挤（周平均超载客公里 ' + U.fmtPct(daily.crowdShare, 0) + '）', v: -9 * U.clamp(daily.crowdShare / 0.25, 0, 1) });
    const ym = U.ymIndex(y, m);
    for (const md of this.mods) if (md.kind === 'sat' && md.until >= ym) f.push({ label: md.reason, v: md.delta });
    // 历史事件的满意度效果（v2.2，如大型国际活动），按时间计算
    if (CM.Eras) for (const x of CM.Eras.satBonus(y + (m - 1) / 12)) if (Math.abs(x.v) > 0.05) f.push({ label: x.label, v: x.v });
    let target = 55;
    for (const x of f) target += x.v;
    target = U.clamp(target, 0, 100);
    const next = U.clamp(this.sat + (target - this.sat) * 0.25, 0, 100);
    const prot = !!(opts && opts.protect) && next < this.sat;
    this.sat = prot ? this.sat : next;
    this.satFactors = { base: 55, factors: f, target: target, basis: 'avg', protected: prot };
  };

  // 失败判定（仅经营挑战）。protect：交通模型升级过渡期，满意度不足的月数不累计
  Economy.prototype.checkFailure = function (y, protect) {
    if (this.isFree() || this.failed) return null;
    const E = CFG.economy;
    const limit = E.debtLimit * this.costIndex(y);
    this.negMonths = this.funds < 0 ? this.negMonths + 1 : 0;
    this.lowSatMonths = this.sat < E.satFail ? (protect ? this.lowSatMonths : this.lowSatMonths + 1) : 0;
    const reasons = [];
    if (this.funds < limit) reasons.push('资金低于负债下限（' + U.fmtMoney(this.funds) + '，下限 ' + U.fmtMoney(limit) + '）');
    if (this.negMonths >= E.negMonthsLimit) reasons.push('连续 ' + this.negMonths + ' 个月负余额（上限 ' + E.negMonthsLimit + ' 个月）');
    if (this.lowSatMonths >= E.satFailMonths) reasons.push('居民满意度连续 ' + this.lowSatMonths + ' 个月低于 ' + E.satFail + '，交通持续恶化');
    if (reasons.length) { this.failed = { reasons: reasons, funds: this.funds }; return this.failed; }
    return null;
  };
  Economy.prototype.warnings = function () {
    if (this.isFree()) return [];
    const E = CFG.economy, out = [];
    if (this.negMonths > 0) out.push({ level: this.negMonths >= E.negMonthsLimit * 0.6 ? 'danger' : 'warn', text: '财政预警：已连续 ' + this.negMonths + ' 个月负余额（满 ' + E.negMonthsLimit + ' 个月挑战失败）' });
    if (this.lowSatMonths > 0) out.push({ level: this.lowSatMonths >= E.satFailMonths * 0.6 ? 'danger' : 'warn', text: '交通预警：满意度已连续 ' + this.lowSatMonths + ' 个月低于 ' + E.satFail + '（满 ' + E.satFailMonths + ' 个月挑战失败）' });
    // 票价不会自动随物价调整：实际水平跌到开局时的四成以下才常驻提醒；七成以下每三年在 1 月提醒一次（见 fareYearly）
    const y = this.cur && this.cur.y;
    if (y && this.fare.flat > 0) {
      const real = this.fareReal(y);
      if (real < 0.4) out.push({ level: 'warn', text: '票价预警：票价没有随物价调整，实际价值只剩开局时的 ' + Math.round(real * 100) + '%，可在地铁芯的「票价管理」调整票价' });
    }
    return out;
  };
  // 票价实际水平：起步价 ÷ 物价参考票价（开局票价按物价折算到当年）
  Economy.prototype.fareReal = function (y) { return this.fare.flat / CM.Model.fareRef(y); };
  // 调价对满意度的影响（v2.6.1）：涨幅超过上次调价以来的物价涨幅越多，市民越不满，持续 6 个月；不超过物价涨幅的上调只有轻微影响，降价没有影响
  Economy.prototype.fareHikeEffect = function (f, y) {
    const a = Tasks.fareLevel(this.fare), b = Tasks.fareLevel(f);
    if (!(a > 0) || !(b > a * 1.001)) return 0;
    const y0 = this.fareMark != null ? this.fareMark : CFG.START.y, allowed = this.costIndex(y) / this.costIndex(y0) - 1, over = Math.max(0, b / a - 1 - allowed);
    return -U.clamp(0.5 + over * 20, 0.5, 8);
  };
  // 应用新票价。auto：随物价自动调价，不改变自动调价的基准
  Economy.prototype.setFare = function (f, y, m, auto) {
    const fx = this.fareHikeEffect(f, y), ym = U.ymIndex(y, m);
    if (fx < 0) {
      const md = this.mods.find(function (x) { return x.fareHike && x.until >= ym; });
      if (md) { md.delta = Math.max(-10, md.delta + fx); md.until = ym + 5; }
      else this.mods.push({ kind: 'sat', delta: fx, until: ym + 5, reason: '票价上调', fareHike: true });
    }
    this.fare = f; this.fareMark = y + (m - 1) / 12;
    if (this.fareAuto && !auto) this.setFareAuto(true, y);
    return fx;
  };
  // 随物价自动调价（v2.6.1）：记下开启时的票价与物价，每年 1 月按物价涨幅调整
  Economy.prototype.setFareAuto = function (on, y) {
    this.fareAuto = on ? { flat: this.fare.flat, inc: this.fare.inc || 0, cap: this.fare.cap || 0, idx: this.costIndex(y) } : null;
  };
  // 每年 1 月：自动调价；没开时票价实际水平低于七成，每三年提醒一次（资金不限时不提醒）。返回 { changed, real, remind }
  Economy.prototype.fareYearly = function (y, m) {
    const out = { changed: false, real: this.fareReal(y), remind: false }, A = this.fareAuto;
    if (A) {
      const k = this.costIndex(y) / A.idx, st = CFG.fareRange.step, q = function (v) { return +(Math.round(v / st) * st).toFixed(6); }, f = Object.assign({}, this.fare);
      f.flat = q(A.flat * k);
      if (f.mode === 'dist') { f.inc = q(A.inc * k); if (A.cap > 0) f.cap = q(A.cap * k); }
      if (f.flat > this.fare.flat || (f.inc || 0) > (this.fare.inc || 0)) { this.setFare(f, y, m, true); out.changed = true; out.real = this.fareReal(y); }
    } else if (!this.isFree() && out.real < 0.7 && !(this.fareNote > y)) { this.fareNote = y + 3; out.remind = true; }
    return out;
  };

  // ======================== 资金流水 ========================
  // kind：grant / fare / ops / reward / build / bond / interest / principal / penalty / overdue / repay；acct：gen 一般资金、capex 建设专项资金
  Economy.prototype.log = function (kind, amount, acct, note, when) {
    if (this.isFree()) return;
    const w = when || this._now || { y: this.cur.y, m: this.cur.m, d: 1 };
    this.flow.push({ y: w.y, m: w.m, d: w.d || 1, kind: kind, amount: amount, acct: acct, note: note, bal: this.funds, cap: this.capex });
    if (this.flow.length > 400) this.flow.splice(0, this.flow.length - 400);
  };

  // ======================== 建设支出：先用建设专项资金，不足部分用一般资金 ========================
  // 零费用操作（如拆除既有设施）在负余额时也允许，便于止损。
  Economy.prototype.canAffordBuild = function (amount) { return this.isFree() || amount <= MONEY_EPS || Math.max(0, this.funds) + Math.max(0, this.capex) >= amount; };
  Economy.prototype.spendBuild = function (byKind, note, when, side) {
    let total = 0; for (const k of BUILD_KINDS) total += byKind[k] || 0;
    if (total <= 0) return { total: 0, capex: 0, gen: 0 };
    for (const k of BUILD_KINDS) if (byKind[k] > 0) this.cur[k] = (this.cur[k] || 0) + byKind[k];
    if (!side) this.built = (this.built || 0) + total;   // 累计建设支出（含自由建造），也供未结算的旧预算任务沿用。车站商业开发不计入。
    if (this.isFree()) return { total: total, capex: 0, gen: 0 };
    const use = Math.min(Math.max(0, this.capex), total), gen = total - use;
    this.capex -= use; this.funds -= gen; this.cur.capexUse = (this.cur.capexUse || 0) + use;
    if (use > 0.5) this.log('build', -use, 'capex', (note || '地铁建设') + '（专项资金）', when);
    if (gen > 0.5) this.log('build', -gen, 'gen', (note || '地铁建设') + (use > 0.5 ? '（专项不足部分）' : ''), when);
    return { total: total, capex: use, gen: gen };
  };

  // ======================== 债券融资（仅经营挑战） ========================
  // 地方债：利率较低、额度较大；城投债：利率较高、额度较小。利率在发行时按当年利率固定，6 年期另加期限溢价。
  // 年度发行额度与总债务上限按当年基础月拨款的倍数计算（随城市与年代变化），只能用于地铁建设及改扩建。
  const BOND_DEF = {
    local: { name: '地方债', desc: '由城市政府发行，利率较低、额度较大' },
    ct: { name: '城投债', desc: '由城市建设投资公司发行，利率较高、额度较小，有逾期时暂停发行' },
  };
  Economy.BOND_DEF = BOND_DEF;
  Economy.prototype.bondCfg = function () { return CFG.economy.bonds || null; };
  Economy.prototype.canBorrow = function () { return !this.isFree() && !!this.bondCfg(); };
  // 当年基础月拨款（含财力系数，不含满意度与任务调整）：融资额度与债务上限按此计算
  Economy.prototype.baseGrant = function (y) { return this.grantQuota(y, 1) * this.fiscalFactor(); };
  // 新发行债券的利率报价：有城市经济时按经济环境与财政状况浮动（macro.js）；已发行债券按合同利率，不受影响
  Economy.prototype.bondQuote = function (kind, y, term) {
    if (this.quoteFn) { try { const q = this.quoteFn(kind, y, term); if (q && isFinite(q.rate)) return q; } catch (e) { console.error(e); } }
    const B = this.bondCfg(); if (!B) return { rate: 0, parts: [] };
    const local = U.interp(B.local.rate, y);
    const parts = [{ k: 'base', label: '基准利率（' + y + ' 年市场水平）', v: local }];
    let r = local;
    if (kind === 'ct') { const sp = B.ct.rate ? U.interp(B.ct.rate, y) - local : (B.ct.spread || 0.015); parts.push({ k: 'ct', label: '城投债利差', v: sp }); r += sp; }
    if (term === 6) { const tp = B.term6 || 0.004; parts.push({ k: 'term', label: '6 年期期限溢价', v: tp }); r += tp; }
    return { rate: r, parts: parts };
  };
  Economy.prototype.bondRate = function (kind, y, term) { return this.bondQuote(kind, y, term).rate; };
  Economy.prototype.bondQuota = function (kind, y) { const B = this.bondCfg(); return B ? B[kind].quotaMonths * this.baseGrant(y) : 0; };
  Economy.prototype.bondCap = function (kind, y) { const B = this.bondCfg(); return B ? B[kind].capMonths * this.baseGrant(y) : 0; };
  Economy.prototype.issuedIn = function (kind, y) { const a = this.bondIssued[y]; return a ? (a[kind] || 0) : 0; };
  Economy.prototype.outstanding = function (kind) { let s = 0; for (const b of this.bonds) if (!b.done && (!kind || b.kind === kind)) s += b.amount; return s; };
  // 已到期但尚未偿还的本金仍占用债务上限，不能通过逾期腾出发行空间。
  Economy.prototype.principalDebt = function (kind) { let s = this.outstanding(kind); for (const b of this.bonds) if (b.done && (!kind || b.kind === kind)) s += b.principalArrears || 0; return s; };
  Economy.prototype.bondSettled = function (b) { return !!b.done && (b.interestArrears || 0) <= MONEY_EPS && (b.principalArrears || 0) <= MONEY_EPS; };
  Economy.prototype.debtTotal = function () { return this.outstanding() + this.overdue; };
  // 融资限制：有逾期时暂停城投债；逾期满 6 个月暂停全部发行
  Economy.prototype.bondBlock = function (kind) {
    if (!this.canBorrow()) return '只有经营挑战可以发行债券';
    if (this.failed) return '经营挑战已失败';
    if (this.overdueMonths >= 6) return '逾期已满 ' + this.overdueMonths + ' 个月，暂停全部债券发行（还清逾期后恢复）';
    if (kind === 'ct' && this.overdue > MONEY_EPS) return '存在逾期债务，城投债暂停发行（还清逾期后恢复）';
    return null;
  };
  Economy.prototype.bondRoom = function (kind, y) {
    return Math.max(0, Math.min(this.bondQuota(kind, y) - this.issuedIn(kind, y), this.bondCap(kind, y) - this.principalDebt(kind)));
  };
  Economy.prototype.issueBond = function (kind, term, amount, when) {
    if (!BOND_DEF[kind]) return { ok: false, error: '债券类型无效' };
    const y = when.y, block = this.bondBlock(kind);
    if (block) return { ok: false, error: block };
    if (term !== 3 && term !== 6) return { ok: false, error: '期限只能是 3 年或 6 年' };
    amount = Math.round(amount);
    if (!(amount > 0)) return { ok: false, error: '发行金额必须大于 0' };
    const room = this.bondRoom(kind, y);
    if (amount > room + MONEY_EPS) return { ok: false, error: '超出本年度可发行额度（剩余 ' + U.fmtMoney(room) + '）' };
    const q = this.bondQuote(kind, y, term), rate = q.rate;
    // 合同利率在发行时固定，并记录当时的报价构成（之后的市场与财政变化不影响已发行债券）
    const b = { id: 'B' + (this.bondSeq++), kind: kind, amount: amount, rate: rate, term: term, issued: [when.y, when.m, when.d || 1], ym0: U.ymIndex(when.y, when.m), paidYears: 0, interestPaid: 0, interestArrears: 0, principalArrears: 0, done: false,
      quote: q.parts.map(function (p) { return [p.label, Math.round(p.v * 1e6) / 1e6]; }) };
    this.bonds.push(b);
    (this.bondIssued[y] || (this.bondIssued[y] = { local: 0, ct: 0 }))[kind] += amount;
    this.capex += amount;
    this.cur.bond = (this.cur.bond || 0) + amount;
    this.log('bond', amount, 'capex', BOND_DEF[kind].name + ' ' + term + ' 年期 · 年利率 ' + (rate * 100).toFixed(2) + '%', when);
    return { ok: true, bond: b };
  };
  // 从一般资金付款：只用正的余额；不足部分记为逾期
  Economy.prototype.payFromFunds = function (kind, amount, note, when, bond) {
    if (amount <= 0) return 0;
    const paid = Math.min(Math.max(0, this.funds), amount);
    if (paid > 0) { this.funds -= paid; this.cur[kind] = (this.cur[kind] || 0) + paid; this.log(kind, -paid, 'gen', note, when); }
    const short = amount - paid;
    if (bond && kind === 'interest') bond.interestPaid = (bond.interestPaid || 0) + paid;
    if (short > MONEY_EPS) {
      const P = this.odParts(); this.overdue += short; P[kind] = (P[kind] || 0) + short;
      if (bond) bond[kind + 'Arrears'] = (bond[kind + 'Arrears'] || 0) + short;
      this.log('overdue', -short, 'gen', note + '：资金不足，转为逾期', when);
    }
    return paid;
  };
  // 每月（拨款发放后）：先偿还旧逾期，再支付到期的利息与本金，最后按逾期月数收取逾期费用。
  // paidYears 记录已结算的付息期数（含转逾期）；实际付款单独记录，跨周年补齐遗漏的期次。
  Economy.prototype.serviceDebt = function (y, m) {
    if (this.isFree() || !this.bonds) return;
    const ym = U.ymIndex(y, m), when = { y: y, m: m, d: 1 };
    if (this._svc === ym) return;
    this._svc = ym;
    // 偿还旧逾期：按费用、利息、本金的顺序，分别记入对应科目
    if (this.overdue > MONEY_EPS && this.funds > 0) {
      const P = this.odParts();
      for (const k of ['penalty', 'interest', 'principal']) {
        const pay = Math.min(Math.max(0, this.funds), P[k] || 0); if (pay <= 0) continue;
        this.funds -= pay; P[k] -= pay; this.overdue -= pay; this.cur[k] = (this.cur[k] || 0) + pay;
        // 逾期还款也要回写到债券，不能一直显示为未付，或把从未支付的利息显示为已付。
        if (k === 'interest' || k === 'principal') {
          let left = pay;
          for (const b of this.bonds) {
            const key = k + 'Arrears', take = Math.min(left, b[key] || 0);
            if (take <= 0) continue;
            b[key] = Math.max(0, b[key] - take); left -= take;
            if (k === 'interest') b.interestPaid = (b.interestPaid || 0) + take;
            if (this.bondSettled(b)) b.repaid = [y, m];
            if (left <= MONEY_EPS) break;
          }
        }
        this.log('repay', -pay, 'gen', '偿还逾期' + { penalty: '费用', interest: '利息', principal: '本金' }[k], when);
      }
      if (this.overdue <= MONEY_EPS) { this.overdue = 0; this.overdueParts = { interest: 0, principal: 0, penalty: 0 }; }
    }
    for (const b of this.bonds) {
      const dueYears = Math.min(b.term, Math.floor((ym - b.ym0) / 12));
      if (b.done || dueYears <= b.paidYears) continue;
      const name = BOND_DEF[b.kind].name + ' ' + b.id + '（' + b.issued[0] + '年' + b.issued[1] + '月发行）';
      const it = b.amount * b.rate;
      for (let k = b.paidYears + 1; k <= dueYears; k++) {
        b.paidYears = k;
        this.payFromFunds('interest', it, name + ' 第 ' + k + ' 年利息', when, b);
      }
      if (dueYears >= b.term) {
        b.done = true;
        this.payFromFunds('principal', b.amount, name + ' 到期还本', when, b);
        if (this.bondSettled(b)) b.repaid = [y, m];
      }
    }
    if (this.overdue > MONEY_EPS) {
      this.overdueMonths++;
      const rate = this.overdueMonths >= 12 ? 0.02 : (this.overdueMonths >= 6 ? 0.015 : 0.01);
      this.payFromFunds('penalty', this.overdue * rate, '逾期费用（月 ' + (rate * 100).toFixed(1) + '%，已逾期 ' + this.overdueMonths + ' 个月）', when);
    } else { this.overdue = 0; this.overdueMonths = 0; this.overdueParts = { interest: 0, principal: 0, penalty: 0 }; }
  };
  // 未来偿债预测：按年汇总已发行债券的利息与到期本金（不含尚未发生的逾期费用）
  Economy.prototype.odParts = function () {
    if (!this.overdueParts) {
      let interest = 0, principal = 0;
      for (const b of this.bonds) { interest += b.interestArrears || 0; principal += b.principalArrears || 0; }
      this.overdueParts = { interest: interest, principal: principal, penalty: Math.max(0, (this.overdue || 0) - interest - principal) };
    }
    return this.overdueParts;
  };
  Economy.prototype.debtForecast = function (y, m, years) {
    const ym = U.ymIndex(y, m), rows = [];
    for (let k = 0; k < years; k++) rows.push({ y: y + k, interest: 0, principal: 0 });
    for (const b of this.bonds) {
      if (b.done) continue;
      for (let k = b.paidYears + 1; k <= b.term; k++) {
        const t = b.ym0 + 12 * k; if (t < ym) continue;
        const r = rows[Math.floor(t / 12) - y]; if (!r) continue;
        r.interest += b.amount * b.rate;
        if (k === b.term) r.principal += b.amount;
      }
    }
    return rows;
  };

  Economy.prototype.serialize = function () {
    return { mode: this.mode, funds: this.funds, fare: this.fare, cross: this.cross, cur: this.cur, ledger: this.ledger, sat: this.sat, mods: this.mods, negMonths: this.negMonths, lowSatMonths: this.lowSatMonths, failed: this.failed, satFactors: this.satFactors, lastDay: this.lastDay,
      capex: this.capex, bonds: this.bonds, bondIssued: this.bondIssued, overdue: this.overdue, overdueParts: this.overdueParts || null, overdueMonths: this.overdueMonths, flow: this.flow, bondSeq: this.bondSeq, svc: this._svc == null ? null : this._svc,
      fisc: this.fisc || null, built: this.built || 0, rate: this.rate || undefined, fareMark: this.fareMark != null ? this.fareMark : undefined, fareAuto: this.fareAuto || undefined, fareNote: this.fareNote || undefined };
  };
  Economy.restore = function (s) {
    const e = new Economy(s.mode, s.cur.y, s.cur.m);
    Object.assign(e, { funds: s.funds, fare: Economy.normFare(s.fare), cross: {}, cur: s.cur, ledger: s.ledger || [], sat: s.sat, mods: s.mods || [], negMonths: s.negMonths || 0, lowSatMonths: s.lowSatMonths || 0, failed: s.failed || null, satFactors: s.satFactors || null, lastDay: s.lastDay || null,
      capex: s.capex || 0, bonds: s.bonds || [], bondIssued: s.bondIssued || {}, overdue: s.overdue || 0, overdueParts: s.overdueParts || null, overdueMonths: s.overdueMonths || 0, flow: s.flow || [], bondSeq: s.bondSeq || 1, built: s.built || 0 });
    for (const id of Object.keys(s.cross || {})) if (Number.isFinite(s.cross[id]) && s.cross[id] >= 0) e.cross[id] = s.cross[id];
    e._svc = s.svc == null ? null : s.svc;
    e.fareMark = Number.isFinite(s.fareMark) ? s.fareMark : null;   // 没调过价（含旧存档）：物价涨幅从开局算起，读档不改变
    const fa = s.fareAuto;
    e.fareAuto = fa && Number.isFinite(fa.idx) && fa.idx > 0 && ['flat', 'inc', 'cap'].every(function (k) { return Number.isFinite(fa[k]) && fa[k] >= 0; }) ? { flat: fa.flat, inc: fa.inc, cap: fa.cap, idx: fa.idx } : null;
    e.fareNote = Number.isFinite(s.fareNote) ? s.fareNote : 0;
    e.fisc = s.fisc && isFinite(s.fisc.f) ? { y: s.fisc.y, f: s.fisc.f } : null;   // 1.7 及更早的存档没有财力系数，按 1 处理
    e.rate = s.rate && isFinite(s.rate.f) ? { score: s.rate.score, grade: s.rate.grade, f: s.rate.f } : null;   // 2.4 及更早没有政府合同
    // 1.6 及更早的正式存档没有债券，默认债务为零。早期 1.7 开发档可能只保存逾期总账，
    // 没有每券构成：从较晚发行的债券开始分摊剩余逾期，保留总额、已用额度与现金余额。
    const P = e.odParts();
    for (const kind of ['interest', 'principal']) {
      const key = kind + 'Arrears';
      let remaining = Math.max(0, (P[kind] || 0) - e.bonds.reduce(function (sum, b) { return sum + (b[key] || 0); }, 0));
      for (let i = e.bonds.length - 1; i >= 0; i--) {
        const b = e.bonds[i];
        if (b[key] != null) continue;
        const due = kind === 'interest' ? b.amount * b.rate * Math.min(b.term, b.paidYears || 0) : (b.done ? b.amount : 0);
        b[key] = Math.min(remaining, due); remaining -= b[key];
        if (kind === 'interest') b.interestPaid = Math.max(0, Math.min(due, b.interestPaid == null ? due : b.interestPaid) - b[key]);
      }
    }
    for (const b of e.bonds) {
      if (!e.bondSettled(b)) delete b.repaid;
      const seq = /^B(\d+)$/.exec(b.id);
      if (seq) e.bondSeq = Math.max(e.bondSeq, Number(seq[1]) + 1);
    }
    // 旧存档的账本没有新科目：补零，保证收支汇总不出现 NaN
    for (const r of e.ledger.concat([e.cur])) for (const k of ['bond', 'interest', 'principal', 'penalty', 'capexUse', 'commerce', 'todCost', 'ppp', 'pppOut', 'fleetSale']) if (r[k] == null) r[k] = 0;
    return e;
  };
  // 票价（v2.1 第二轮）：统一票价 { mode: 'flat', flat } 或按里程计费 { mode: 'dist', flat 起步价, km0 起步里程, step 每段公里, inc 每段加价, cap 封顶（0 不封顶） }。
  // 统一票价存档读入后与原来完全相同；更早版本的里程计价存档（没有 km0 字段）仍按起步价换算为统一票价
  const fareQ = function (v, lo, hi) { const R = CFG.fareRange; return U.clamp(+(Math.round(v / R.step) * R.step).toFixed(6), lo, hi); };
  // 读档时规范票价。fareRange.scale 的地图（巴黎）滑块上限随物价放大，fareRange.max 只是价格基年的上限，读档时不按它截断——
  // 否则 1960 年约 80 法郎的票价读档后变成 1 法郎
  Economy.normFare = function (f) {
    const R = CFG.fareRange, D = CFG.fareDist, newDist = !!f && f.mode === 'dist' && f.km0 != null, max = R.scale ? Infinity : R.max;
    let v = f ? (f.mode === 'flat' || newDist ? f.flat : f.base) : CFG.fareDefault.flat;
    if (!isFinite(v)) v = CFG.fareDefault.flat;
    if (!newDist) return { mode: 'flat', flat: U.clamp(Math.round(v / R.step) * R.step, R.min, max) };
    const num = function (x, d) { x = +x; return isFinite(x) ? x : d; };
    const flat = fareQ(v, R.min, max), cap = fareQ(num(f.cap, 0), 0, max * 5);
    return { mode: 'dist', flat: flat, km0: U.clamp(num(f.km0, D.km0), 0, 50), step: U.clamp(num(f.step, D.step), 0.5, 50),
      inc: fareQ(num(f.inc, 0), 0, max), cap: cap > 0 ? Math.max(flat, cap) : 0 };
  };
  // 新开局的票价：按里程计费，起步价沿用本图默认票价，加价与封顶按起步价的比例取整；
  // fareDefault.dist 为 false 的地图（巴黎地铁历来单一票价）仍为统一票价
  Economy.defaultFare = function () {
    const R = CFG.fareRange, D = CFG.fareDist, f0 = CFG.fareDefault.flat;
    if (CM.mapId === 'pa' || CFG.fareDefault.dist === false || !D) return { mode: 'flat', flat: f0 };
    return { mode: 'dist', flat: f0, km0: D.km0, step: D.step, inc: Math.max(R.step, fareQ(f0 * D.inc, 0, R.max)), cap: fareQ(f0 * D.cap, 0, R.max * 5) };
  };
  // 票价对满意度的影响（与月度满意度计算同一公式）
  Economy.fareSatEffect = function (fare, year) {
    const vot = U.interp(CFG.choice.vot, year);
    const burden = fare / (vot * 0.35);
    return -9 * U.clamp((burden - 1) / 2, 0, 1);
  };

  // ======================== 任务 ========================
  function Tasks() {
    this.active = []; this.done = []; this.failed = [];
    this.issued = {};
    this.nextDyn = 0; this.seq = 1;
  }
  CM.Tasks = Tasks;

  // ======================== 线路与车站收支（v3.0 玩家建议：地铁芯「财务」栏） ========================
  // 估算口径（每月，万）：票款按乘客公里分到各线路、按进站人次 × 全网平均票价分到各车站；列车运营费按各路线的车厢公里分摊（车型系数按 1 计）；
  // 车站运营费按规模，换乘站在各线路间平分；商业收入与成本取车站商业开发（TOD）。改名和商业升级会即时修改正式车站。
  const Finance = { _c: null };
  Finance.compute = function (g) {
    const m = g.model, net = m.net, C = net ? net.C : null, day = m.dailyStale ? null : m.daily, sd = m.dailyStale ? null : m.stDaily, ui = CM.ui;
    const key = g.ym() + ':' + (C ? m.cycles : 0) + ':' + g.netVersion;
    const cached = Finance._c;
    if (cached && cached.ready && cached.key === key && cached.C === C && cached.day === day && cached.sd === sd && cached.stations.every(function (row) {
      const s = g.net.stations[row.id];
      return s && s.name === row.name && s.size === row.size && (s.tod || 0) === row.lv;
    })) return cached;
    const out = { key: key, C: C, day: day, sd: sd, ready: false, lines: [], stations: [], tot: { fare: 0, com: 0, train: 0, station: 0, todCost: 0 } };
    Finance._c = out;
    if (!C || !day || !sd || !ui) return out;
    const oi = g.econ.opsIndex(g.clock.y), avgFare = day.avgFare || 0, W = CFG.trips.weekWeights, plan = m.fleetOf ? m.fleetOf(net) : null;
    // 各路线的乘客公里与车厢公里（工作日、周末按周权重）
    const pkm = new Float64Array(net.R), ckm = new Float64Array(net.R);
    for (const [dt, w] of [['wd', W.wd], ['we', W.we]]) {
      const res = m.resultsFor(dt); if (!res) continue;
      for (let p = 0; p < 4; p++) {
        const P = res.per[p]; if (!P || !P.load || P.load.length !== net.nE) continue;
        const hh = m.pHours[p];
        for (let r = 0; r < net.R; r++) {
          const re = net.rideEdge[r], rt = C.routes[r], fp = plan && plan[r];
          let s = 0; for (let q = 0; q < re.length; q++) s += (P.load[re[q]] || 0) * net.eKm[re[q]];
          pkm[r] += s * hh * w;
          const fd = P.freqDir && P.freqDir.length === 2 * net.R ? P.freqDir[2 * r] + P.freqDir[2 * r + 1] : 2 * (P.freq[r] || 0);
          ckm[r] += fd * (rt.lenM / 1000) * (fp ? fp.cars : rt.cars) * (p === 3 ? 5 : hh) * w;
        }
      }
    }
    let pkmT = 0, ckmT = 0; for (let r = 0; r < net.R; r++) { pkmT += pkm[r]; ckmT += ckm[r]; }
    const fareM = (day.fare || 0) / 10000 * 30.4, trainM = ckmT * CFG.ops.carKmCost * oi * 30.4;
    // 车站
    const byId = new Map();
    C.stations.forEach(function (st, k) {
      if (!C.serviced[k]) return;
      const s = g.net.stations[st.id]; if (!s) return;
      const I = ui.todInfo(st.id), lv = s.tod || 0, nL = Math.max(1, C.stationLines[k].size);
      const fare = (sd.inn[k] || 0) * avgFare * 30.4 / 10000, com = I && lv ? I.month(lv) : 0, ops = (CFG.ops.stationDaily[s.size] || 0) * oi * 30.4, todCost = I && lv ? I.cost(lv) : 0;
      const row = { id: st.id, name: s.name, size: s.size, lines: Array.from(C.stationLines[k]), flow: (sd.inn[k] || 0) + (sd.out[k] || 0) + (sd.xfer[k] || 0), inn: sd.inn[k] || 0, lv: lv, fare: fare, com: com, ops: ops, todCost: todCost, net: fare + com - ops - todCost, nL: nL };
      out.stations.push(row); byId.set(st.id, row);
      out.tot.com += com; out.tot.station += ops; out.tot.todCost += todCost;
    });
    // 线路
    const lines = new Map();
    for (let r = 0; r < net.R; r++) {
      const lid = C.routes[r].lineId; let L = lines.get(lid);
      if (!L) lines.set(lid, L = { lid: lid, L: g.net.lines[lid], pkm: 0, ckm: 0, riders: 0, stations: new Set() });
      L.pkm += pkm[r]; L.ckm += ckm[r]; L.riders += sd.routeBoard ? sd.routeBoard[r] || 0 : 0;
      for (const sid of C.routes[r].stIds) L.stations.add(sid);
    }
    lines.forEach(function (L) {
      if (!L.L) return;
      let st = 0, com = 0, todCost = 0; L.stations.forEach(function (sid) { const s = byId.get(sid); if (s) { st += s.ops / s.nL; com += s.com / s.nL; todCost += s.todCost / s.nL; } });
      const fare = pkmT > 0 ? fareM * L.pkm / pkmT : 0, train = ckmT > 0 ? trainM * L.ckm / ckmT : 0;
      out.lines.push({ lid: L.lid, L: L.L, riders: L.riders, nst: L.stations.size, fare: fare, train: train, station: st, com: com, todCost: todCost, cost: train + st + todCost, net: fare + com - train - st - todCost, rec: train + st > 0 ? fare / (train + st) : 0 });
    });
    out.tot.fare = fareM; out.tot.train = trainM;
    out.ready = true;
    return out;
  };
  CM.Finance = Finance;

  // 网络连通分量（线路 + 站外换乘）
  function stationComponents(C, acc, activeRoutes) {
    const N = C.stations.length, par = new Int32Array(N);
    const serviced = activeRoutes ? new Uint8Array(N) : C.serviced;
    for (let i = 0; i < N; i++) par[i] = i;
    const find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const uni = function (a, b) { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    C.routes.forEach(function (r, i) {
      if (activeRoutes && !activeRoutes(i)) return;
      for (const s of r.stIdx) { if (activeRoutes) serviced[s] = 1; uni(r.stIdx[0], s); }
    });
    if (acc) for (const t of acc.transfers) if (!activeRoutes || (serviced[t.a] && serviced[t.b])) uni(t.a, t.b);
    return { find: find, serviced: serviced };
  }
  Tasks.stationComponents = stationComponents;
  // 同上，但不能经过 avoid 一带的车站（「不经市中心」）：只有相邻两站都在范围外才算连通
  function componentsAvoiding(C, acc, avoid) {
    const N = C.stations.length, par = new Int32Array(N), out = new Uint8Array(N);
    for (let i = 0; i < N; i++) { par[i] = i; out[i] = U.dist(C.stations[i].x, C.stations[i].y, avoid.x, avoid.y) > avoid.r ? 1 : 0; }
    const find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const uni = function (a, b) { if (out[a] && out[b]) { a = find(a); b = find(b); if (a !== b) par[a] = b; } };
    for (const r of C.routes) { const st = r.stIdx; for (let k = 1; k < st.length; k++) uni(st[k - 1], st[k]); if (r.loop && st.length > 2) uni(st[st.length - 1], st[0]); }
    if (acc) for (const t of acc.transfers) uni(t.a, t.b);
    return { find: find, serviced: C.serviced };
  }

  // 统计口径（v1.9）：通勤、上学与高峰类目标用工作日数据，旅游与商业休闲类可用周末数据，长期客流目标用周平均
  Tasks.BASIS = { wd: '工作日', we: '周末', avg: '周平均（5 个工作日 + 2 个周末日）', wdAM: '工作日早高峰', wdPeak: '工作日高峰小时', ledger: '上月实际账目', net: '线路连通', cover: '步行 15 分钟覆盖' };
  // 一个月的经营覆盖率：（票款 + 车站商业净收入）÷ 运营费用（v2.5 起扣除车站商业的运营与维护成本）
  Tasks.recoveryOf = function (r) { return r && r.ops > 0 ? ((r.fare || 0) + (r.commerce || 0) - (r.todCost || 0)) / r.ops : 0; };
  // 任务未完成的后果（v2.3 平衡）：历史参考任务按原规则（拨款 ×0.85，12 个月，满意度 −6）；
  // 系统按城市现状发布的动态任务较轻（拨款 ×0.92，6 个月，满意度 −3），后期多项任务同时到期时不至于连续重罚
  Tasks.failPenalty = function (t) {
    const E = CFG.economy;
    return t && t.kind === 'dyn' ? { factor: E.failDynGrantFactor || 0.92, months: E.failDynMonths || 6, sat: E.failDynSat || -3 } : { factor: E.failGrantFactor, months: E.failGrantMonths, sat: E.failSat };
  };
  Tasks.basisOf = function (t) {
    switch (t.type) {
      case 'connect': return 'net';
      case 'coverage': case 'zoneCov': return 'cover';
      case 'zoneCong': return 'wdAM';
      case 'stationCrowd': return 'wdPeak';
      case 'ridership': return t.basis || 'avg';
      case 'recovery': return 'ledger';
      case 'facShare': return t.basis || 'avg';
      default: return null;
    }
  };
  // 重要设施任务的口径：枢纽按周平均，上学、就医、商务与会展按工作日，商圈、景点、公园与体育场馆按周末
  Tasks.facBasis = function (f) {
    if (f.T.hub) return 'avg';
    if (f.t === 'uni' || f.t === 'hosp' || f.t === 'cbd' || f.t === 'venue') return 'wd';
    return 'we';
  };
  // 设施能否由玩家接驳（v2.2 修正）：场地边缘约 600 m 内存在可以合法设站的位置（含风景区景区站与未开放区域规则）；
  // 只为能完成的设施发布接驳任务。结果按设施与年份缓存
  // v3.3 玩家反馈（珠海渔女的任务修不了地铁）：能设站还不够，那里还要有步行道路（与客流模型的进站规则一致：车站所在格的四角
  // 或 2 格内有步行路口），设施的出入口也要接上道路（fn.link：立在海中礁石上的雕像、没有街道的农田里的区域设施都接不上）
  const servCache = new Map(); let servWalk = null;
  const walkable = function (city, x, y) {
    const w = city.walk; if (!w) return true;
    const VW = city.VW, ci = Math.floor(x), cj = Math.floor(y), lim = CM.CFG.walk.maxAccessM * 0.5;
    const deg = function (i, j) { return i < 0 || j < 0 || i >= VW || j * VW + i >= w.deg.length ? 0 : w.deg[j * VW + i]; };
    if (deg(ci, cj) || deg(ci + 1, cj) || deg(ci, cj + 1) || deg(ci + 1, cj + 1)) return true;
    for (let j = cj - 2; j <= cj + 3; j++) for (let i = ci - 2; i <= ci + 3; i++) if (deg(i, j) && U.dist(x, y, i, j) * CM.CFG.CELL_M * 1.3 <= lim) return true;
    return false;
  };
  Tasks.facServable = function (city, f, fn) {
    if (f.ext) return true;
    if (servWalk !== city.walk) { servCache.clear(); servWalk = city.walk; }   // 街道随城市发展增加：步行网络重建后重新判断
    if (fn && fn.link && fn.ids) { const k = fn.ids.indexOf(f.id); if (k >= 0 && !fn.link[k]) return false; }
    const key = city.uid + ':' + f.id + ':' + city.terrainVer + ':' + city.lockVer + ':' + (city.unlockAll ? 1 : 0);
    if (servCache.has(key)) return servCache.get(key);
    const lm = f.lmK >= 0 ? CM.DATA.landmarks[f.lmK] : null;
    const R = (lm ? Math.max(lm.w || 0, lm.d || 0) / 2 / CM.CFG.CELL_M : Math.max(0.5, f.r || 0)) + 2.4;
    let ok = false;
    for (let dy = -R; dy <= R && !ok; dy += 0.5) for (let dx = -R; dx <= R && !ok; dx += 0.5) {
      if (dx * dx + dy * dy > R * R) continue;
      if (CM.Metro.checkSite(city, f.x + dx, f.y + dy, 'underground').ok && walkable(city, f.x + dx, f.y + dy)) ok = true;
    }
    if (servCache.size > 400) servCache.clear();
    servCache.set(key, ok);
    return ok;
  };
  // 票价门槛（v2.4 玩家反馈：把票价临时调到 0 再调回来，就能完成拥堵与设施接驳任务）：按 10 km 行程的票价比较；
  // 这两类任务记下发布时的票价水平，票价低于它的月份不计入样本与连续月数——任务要靠线网完成
  Tasks.FARE_GATED = { zoneCong: 1, facShare: 1 };
  Tasks.fareLevel = function (f) {
    if (!f) return 0;
    let v = f.flat || 0;
    if (f.mode === 'dist' && f.inc > 0 && f.step > 0) { v += Math.max(0, Math.ceil((10 - (f.km0 || 0)) / f.step - 1e-9)) * f.inc; if (f.cap > 0) v = Math.min(v, f.cap); }
    return v;
  };
  Tasks.fareCheap = function (t, g) { return !!Tasks.FARE_GATED[t.type] && t.fare0 != null && Tasks.fareLevel(g.econ.fare) < t.fare0 * 0.95 - 1e-9; };
  // 到最近运营车站的距离（格）
  Tasks.netDist = function (g, x, y) {
    const C = g.compiled; let d = Infinity;
    C.stations.forEach(function (s, i) { if (C.serviced[i]) { const v = U.dist(s.x, s.y, x, y); if (v < d) d = v; } });
    return d;
  };
  Tasks.facShareOf = function (model, f, basis) {
    const s = model.facStats(f.id, basis); if (!s) return null;
    const vol = f.T.hub ? s.inn + s.out : s.inn, m = f.T.hub ? s.innM + s.outM : s.innM;
    return { vol: vol, share: vol > 0 ? m / vol : 0 };
  };

  // 设施的运营状态（v2.8 玩家反馈：虹桥站、世博园 2010 年才启用，任务到期时判「不在运营」，这一项根本完成不了）。
  // wait：还没到启用日期；idle：日期到了但还没进入交通计算（场地未成陆、地标未落成等）；on：在运营；closed / gone：已停用或不存在
  Tasks.FAC_SETTLE = 3;   // 运营结果至少在设施启用 3 个月后才结算
  const ymOf = function (yr) { return Math.ceil(yr * 12 - 1e-6); };
  const ymWords = function (ym) { return Math.floor(ym / 12) + ' 年 ' + (ym % 12 + 1) + ' 月'; };
  const ymPair = function (ym) { return [Math.floor(ym / 12), ym % 12 + 1]; };
  Tasks.facState = function (f, g) {
    if (!f) return 'gone';
    const yr = g.year();
    if (f.close != null && yr >= f.close) return 'closed';
    if (yr < f.open) return 'wait';
    return g.model.facIndex(f.id) >= 0 ? 'on' : 'idle';
  };
  Tasks.facUnavailable = function (f, g) {
    const m = g.model;
    return !!(g.city.walk && m.fn && m.trafficReady() && !Tasks.facServable(g.city, f, m.fn));
  };
  // 截止时间至少放到设施启用后 FAC_SETTLE 个月，发布和旧档都只往后调。
  Tasks.alignFacDeadline = function (t) {
    if (!t.deadline || !CM.Fac) return;
    const list = t.type === 'facShare' ? [t] : (t.type === 'combo' ? t.parts.filter(function (p) { return p.type === 'facShare'; }) : []);
    let need = -Infinity, who = null;
    for (const p of list) {
      const f = CM.Fac.byId(p.fac); if (!f || !(f.open > -1e8)) continue;
      const v = Math.min(ymOf(f.open) + Tasks.FAC_SETTLE, f.close != null ? ymOf(f.close) - 1 : Infinity);
      if (v > need) { need = v; who = f; }
    }
    if (who && need > U.ymIndex(t.deadline[0], t.deadline[1])) {
      t.deadline = ymPair(need);
      t.facDelay = who.name + ' ' + ymWords(ymOf(who.open)) + '启用，运营结果要启用后才能统计，截止时间放到 ' + ymWords(need);
    }
  };
  // 动态任务的发布门槛（v3.1 玩家反馈：武汉 2004 年前后就要求把地铁修到光谷、沌口——离线网十几公里、沿线还没多少人，修过去一定亏钱）。
  // 带地点的动态任务、本城任务、阶段目标、事件任务与城市难题都要过门槛：
  // ① 够得着：任务里最远的地点离运营车站不超过「可达范围」——约 3 km 加上线网长度的十分之一，最多 20 km。线网越大，越远的任务才出现；
  //    还没有运营车站时从全城人口与岗位最密的片区算起。
  // ② 有人：地点附近 1.5 km 内的人口与岗位至少为 3000，且达到全城有人居住或工作的地点加权平均值的 12%。
  //    锚点取半径内人口与岗位最多的位置，区域取区域里最多的位置；连接几处的任务看各处的平均值；任务里有设施（机场、车站、码头、大学、
  //    体育场馆、会展、景点，或锚点半径内有这类设施）的客流来自设施本身，不看人口。地图数据写 gate: 'reach' 的任务只看够不够得着。
  // 过了门槛的候选按距离加权抽取（离线网越近越容易抽中），任务大致从近到远、从易到难出现
  Tasks.GATE = { baseKm: 3, perKm: 0.1, maxKm: 20, catchKm: 1.5, share: 0.12, minCatch: 3000, facTypes: { air: 1, rail: 1, port: 1, uni: 1, stadium: 1, venue: 1, scenic: 1 } };
  Tasks.gate = function (g) {
    const C = g.compiled, city = g.city, W = city.W, H = city.H, G = Tasks.GATE, R = G.catchKm * 1000 / CFG.CELL_M;
    let km = 0; if (C && C.segs) C.segs.forEach(function (cs) { if (cs.g) km += cs.g.lenM / 1000; });
    const catchMemo = new Map(), distanceMemo = new Map(), regionMemo = new Map();
    const catchAt = function (x, y) {
      const key = x + ',' + y;
      if (catchMemo.has(key)) return catchMemo.get(key);
      let s = 0;
      for (let j = Math.max(0, Math.floor(y - R)); j <= Math.min(H - 1, Math.floor(y + R)); j++) for (let i = Math.max(0, Math.floor(x - R)); i <= Math.min(W - 1, Math.floor(x + R)); i++) {
        const dx = i + 0.5 - x, dy = j + 0.5 - y; if (dx * dx + dy * dy > R * R) continue;
        const k = j * W + i; s += city.pop[k] + city.jobs[k];
      }
      catchMemo.set(key, s);
      return s;
    };
    const st = []; if (C && C.stations) C.stations.forEach(function (s, i) { if (C.serviced[i]) st.push(s); });
    // 全城居民与岗位所在处的平均值：按交通小区中心取样，以小区人口与岗位加权
    const md = g.model;
    let totalWeight = 0, totalCatchment = 0, busiest = -1, peak = 0;
    if (md?.zPop) for (let z = 0; z < md.Z; z++) {
      const weight = md.zPop[z] + md.zJobs[z];
      if (!(weight > 0)) continue;
      totalWeight += weight;
      totalCatchment += weight * catchAt(md.zCx[z], md.zCy[z]);
      if (weight > peak) { busiest = z; peak = weight; }
    }
    const typ = totalWeight > 0 ? totalCatchment / totalWeight : 0;
    const dist = function (x, y) {
      if (!st.length) return busiest < 0 ? 0 : U.dist(md.zCx[busiest], md.zCy[busiest], x, y);
      const key = x + ',' + y;
      if (distanceMemo.has(key)) return distanceMemo.get(key);
      let d = Infinity;
      for (const s of st) d = Math.min(d, U.dist(s.x, s.y, x, y));
      distanceMemo.set(key, d);
      return d;
    };
    // 锚点：任务只要求在锚点半径内设站，取半径内人口与岗位最多的位置（中心、半径一半与边上各 8 个方向）
    const best = function (p) {
      let v = catchAt(p.x, p.y); if (!p.r) return v;
      for (const f of [0.5, 1]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; v = Math.max(v, catchAt(p.x + Math.cos(a) * p.r * f, p.y + Math.sin(a) * p.r * f)); }
      return v;
    };
    const self = { km: km, reach: Math.min(G.maxKm, G.baseKm + km * G.perKm) * 1000 / CFG.CELL_M, need: Math.max(G.minCatch, typ * G.share), dist: dist, catchAt: catchAt, best: best };
    // 候选任务的门槛：gap 为最远地点离线网的距离（格），ok 为两项都满足；w 为抽取权重（离线网越远越小）
    // 有人：任务里有设施（客流来自设施本身），或其余地点的人口与岗位平均够得上门槛（连接几处的任务看沿线整体，不要求每一站都有人，
    // 如换乘用的欣澳、线路尽头人还少的阿文图拉）；只有一处地点的（片区、区域覆盖）就看这一处
    self.check = function (t, slack) {
      const pts = Tasks.points(g, t, regionMemo); let gap = 0, sum = 0, n = 0, fac = false;
      for (const p of pts) { gap = Math.max(gap, dist(p.x, p.y)); if (p.fac) fac = true; else { sum += best(p); n++; } }
      // 地图数据写 gate: 'reach' 的任务（带动开发：片区开放当时还没人，任务就是要把线修进去，如广州 2014 年增城撤市设区）只看够不够得着
      const low = t.gate !== 'reach' && !fac && n > 0 && sum / n < self.need;
      const gapKm = gap * CFG.CELL_M / 1000;
      return { ok: gap <= self.reach * (slack || 1) && !low, gap: gap, low: low, w: 1 / Math.pow(1 + gapKm / 2, 2) };
    };
    return self;
  };
  // 任务涉及的地点：锚点、设施、片区（拥堵 / 覆盖任务）、区域（按人口与岗位加权的中心），复合任务逐项收集
  Tasks.points = function (g, t, regionMemo = new Map()) {
    const out = [], city = g.city, model = g.model, FT = Tasks.GATE.facTypes;
    let hubs = null;
    // 设施本身提供客流，设施附近的锚点只检查距离。
    const nearHub = function (p, r) {
      if (!hubs) hubs = CM.Fac ? CM.Fac.list(city).filter(function (f) { return !f.ext && FT[f.t]; }) : [];
      return hubs.some(function (f) { return U.dist(p.x, p.y, f.x, f.y) <= Math.max(1, r); });
    };
    const visit = function (o) {
      if (!o || typeof o !== 'object') return;
      const f = o.fac && CM.Fac ? CM.Fac.byId(o.fac) : null;
      for (const a of o.anchors || []) { const p = Array.isArray(a) ? Tasks.placeOf(a[0]) : a, r = Array.isArray(a) ? a[1] || 3 : (a && a.r) || 3; if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out.push({ x: p.x, y: p.y, r: r, fac: !!(f && (p.name === f.name || U.dist(p.x, p.y, f.x, f.y) < 0.5)) || nearHub(p, r) }); }
      if (f && !f.ext) out.push({ x: f.x, y: f.y, fac: true });
      if (o.zone != null && model && model.zCx && Number.isFinite(model.zCx[o.zone])) out.push({ x: model.zCx[o.zone], y: model.zCy[o.zone] });
      // 区域：每个区域单独取一处——区域里附近人口与岗位最多的位置（每 2 格取样）。以前几个区域合在一起取加权中心，
      // 会落在两片住区之间（如香港荃湾与沙田之间的郊野公园），区域本身有人也过不了门槛
      for (const rid of o.regions || []) {
        if (regionMemo.has(rid)) { const cached = regionMemo.get(rid); if (cached) out.push(cached); continue; }
        const W = city.W, R6 = Tasks.GATE.catchKm * 1000 / CFG.CELL_M; let bx = -1, by = 0, bv = -1, cx = 0, cy = 0, n = 0;
        for (let j = 0; j < city.H; j += 2) for (let i = 0; i < W; i += 2) {
          const k = j * W + i, r = city.regions[city.region[k]]; if (!r || r.id !== rid) continue;
          cx += i + 0.5; cy += j + 0.5; n++;
          if (city.pop[k] + city.jobs[k] <= 0) continue;
          let v = 0;
          for (let b = Math.max(0, Math.floor(j - R6)); b <= Math.min(city.H - 1, Math.floor(j + R6)); b += 2) for (let a = Math.max(0, Math.floor(i - R6)); a <= Math.min(W - 1, Math.floor(i + R6)); a += 2) { const dx = a - i, dy = b - j; if (dx * dx + dy * dy <= R6 * R6) { const q = b * W + a; v += city.pop[q] + city.jobs[q]; } }
          if (v > bv) { bv = v; bx = i + 0.5; by = j + 0.5; }
        }
        const point = bx >= 0 ? { x: bx, y: by } : n ? { x: cx / n, y: cy / n } : null;
        regionMemo.set(rid, point);
        if (point) out.push(point);
      }
      if (o.place && isFinite(o.x) && isFinite(o.y)) out.push({ x: o.x, y: o.y });
      for (const p of o.parts || []) visit(p);
    };
    visit(t);
    return out;
  };
  // 任务的地点在截止前能不能建站：半径内要有已开放、或截止 12 个月前按参考年份开放的陆地（台北淡水 1997 年才开放，1991 年发布的 4 年期任务完成不了）
  Tasks.anchorsOpenBy = function (g, anchors, dlYm) {
    const c = g.city, lk = c.lockState(), W = c.W, H = c.H;
    return (anchors || []).every(function (a0) {
      const a = Array.isArray(a0) ? Tasks.placeOf(a0[0]) : a0, R = (Array.isArray(a0) ? a0[1] : a0 && a0.r) || 3;
      if (!a || !isFinite(a.x)) return true;
      for (let j = Math.max(0, Math.floor(a.y - R)); j <= Math.min(H - 1, Math.floor(a.y + R)); j++) for (let i = Math.max(0, Math.floor(a.x - R)); i <= Math.min(W - 1, Math.floor(a.x + R)); i++) {
        if (U.dist(i + 0.5, j + 0.5, a.x, a.y) > R) continue;
        const k = j * W + i;
        if (c.landMax[k] >= 0.5 && (!lk.mask[k] || (lk.year[k] && lk.year[k] * 12 <= dlYm - 12))) return true;
      }
      return false;
    });
  };
  // 票价显示（去掉「/次」），用于提示玩家要把票价调回多少
  const fareWords = function (v) { return CM.UI && CM.UI.fmtFare ? CM.UI.fmtFare(v).replace('/次', '') : String(+v.toFixed(2)); };

  Tasks.prototype.evaluate = function (t, g, activeRoutes) {
    const C = g.compiled, model = g.model, acc = model.net ? model.net.acc : null;
    if (t.type === 'connect') {
      const comp = t.avoid ? componentsAvoiding(C, acc, t.avoid) : stationComponents(C, acc, activeRoutes);
      const anchorSets = t.anchors.map(function (a) {
        const set = [];
        C.stations.forEach(function (s, i) { if (comp.serviced[i] && U.dist(s.x, s.y, a.x, a.y) <= a.r) set.push(i); });
        return set;
      });
      const hits = anchorSets.map(function (s) { return s.length > 0; });
      let ok = false;
      if (hits.length && hits.every(Boolean)) {
        const roots = anchorSets.map(function (s) { return new Set(s.map(comp.find)); });
        for (const r of roots[0]) if (roots.every(function (S) { return S.has(r); })) { ok = true; break; }
      }
      const n = hits.filter(Boolean).length;
      return { ok: ok, value: ok ? 1 : n / (t.anchors.length + 1), text: t.anchors.map(function (a, i) { return (hits[i] ? '✓ ' : '✗ ') + a.name; }).join('；') + (hits.every(Boolean) && !ok ? (t.avoid ? '（目前只能经过' + t.avoid.name + '才连得上）' : '（车站尚未连通）') : '') + (t.avoid && ok ? ' · 不经' + t.avoid.name : '') };
    }
    if (t.type === 'coverage') {
      const v = acc ? acc.coverage : 0;
      return { ok: v >= t.target, value: v / t.target, text: '当前覆盖 ' + U.fmtPct(v) + ' / 目标 ' + U.fmtPct(t.target, 0) };
    }
    if (t.type === 'zoneCong' && t.metric==='carShare') {
      const v=model.zoneTraffic(t.zone).carShare,cheap=Tasks.fareCheap(t,g);
      return{ok:v<=t.target&&!cheap,cheap,met:v<=t.target,fare0:t.fare0,value:U.clamp((t.start-v)/Math.max(.001,t.start-t.target),0,1),text:'片区工作日早高峰汽车出行占比 '+U.fmtPct(v,1)+' / 目标 ≤ '+U.fmtPct(t.target,1)+(cheap?'（票价低于任务发布时，本月不计）':''),sample:v};
    }
    if (t.type === 'zoneCong') {
      const v = g.zoneCong(t.zone, 'wd');
      return { ok: v <= t.target, value: U.clamp((t.start - v) / Math.max(0.01, t.start - t.target), 0, 1), text: '工作日早高峰拥堵指数 ' + v.toFixed(2) + ' / 目标 ≤ ' + t.target.toFixed(2) };
    }
    if (t.type === 'zoneCov') {
      const v = acc ? acc.zCov[t.zone] : 0;
      return { ok: v >= t.target, value: v / t.target, text: '该片区覆盖 ' + U.fmtPct(v) + ' / 目标 ' + U.fmtPct(t.target, 0) };
    }
    if (t.type === 'stationCrowd') {
      const i = C.sIndex.get(t.station);
      if (i === undefined) return { ok: false, value: 0, text: '车站已拆除' };
      const sd = model.stDailyWk || model.stDaily;
      if (!sd || model.dailyStale) return { ok: false, value: 0, text: '客流计算中' };
      if (!stationPeakRunning(g, i)) return { ok: false, value: 0, text: '早高峰没有列车运行' };
      const peak = sd.peak[i] || 0;
      const cap = CFG.metro.stationCap[C.stations[i].size];
      const v = peak / cap;
      return { ok: v <= t.target, value: U.clamp((t.start - v) / Math.max(0.01, t.start - t.target), 0, 1), text: '工作日高峰负荷 ' + U.fmtPct(v, 0) + ' / 目标 ≤ ' + U.fmtPct(t.target, 0) };
    }
    if (t.type === 'ridership') {
      const b = Tasks.basisOf(t), d = model.dailyFor ? model.dailyFor(b) : model.daily;
      const v = d ? d.metro : 0;
      return { ok: v >= t.target, value: v / t.target, text: (b === 'wd' ? '工作日' : (b === 'we' ? '周末' : '日均（周平均）')) + '客运量 ' + U.fmtPeople(v) + ' / 目标 ' + U.fmtPeople(t.target) };
    }
    if (t.type === 'facShare') {
      const f = CM.Fac && CM.Fac.byId(t.fac), st = t.noFac ? 'closed' : Tasks.facState(f, g);
      if (st === 'gone' || st === 'closed') return { ok: false, na: true, value: 0, text: (f ? f.name + ' 已停用' : '设施已不存在') + '，这一项不再考核' };
      if (st === 'wait') return { ok: false, wait: true, value: 0, text: f.name + ' 将于 ' + ymWords(ymOf(f.open)) + '启用，启用后开始统计' };
      if (st === 'idle') return { ok: false, wait: true, value: 0, text: f.name + ' 还没有投入使用，投入后开始统计' };
      if (Tasks.facUnavailable(f, g)) return { ok: false, na: true, value: 0, text: f.name + ' 附近暂无法接驳，这一项不再考核' };
      const r = Tasks.facShareOf(model, f, t.basis);
      if (!r) return { ok: false, value: 0, text: '客流计算中' };
      const cheap = Tasks.fareCheap(t, g);
      return { ok: r.share >= t.target && !cheap, cheap: cheap, met: r.share >= t.target, fare0: t.fare0, value: U.clamp(r.share / t.target, 0, 1), text: (t.kind ? f.name + ' ' : '') + (t.basis === 'we' ? '周末' : (t.basis === 'wd' ? '工作日' : '周平均')) + '乘地铁' + (f.T.hub ? '接驳' : '到访') + '比例 ' + U.fmtPct(r.share, 0) + ' / 目标 ' + U.fmtPct(t.target, 0) + (cheap ? '（票价低于任务发布时，本月不计）' : '') };
    }
    if (t.type === 'recovery') {
      // 票款与车站商业收入（v2.3 起计入 TOD 收入）÷ 运营费用
      const last = g.econ.ledger[g.econ.ledger.length - 1];
      const v = Tasks.recoveryOf(last);
      return { ok: v >= t.target, value: v / t.target, text: '上月（票款 + 车站商业）/ 运营费用 ' + U.fmtPct(v, 0) + ' / 目标 ' + U.fmtPct(t.target, 0) + (t.sustain ? '（需连续 ' + t.sustain + ' 个月，已 ' + (t.streak || 0) + ' 个月）' : '') };
    }
    // ---- v2.3 可选挑战与城市策略难题 ----
    if (t.type === 'budgetConnect') {
      const c = this.evaluate(Object.assign({}, t, { type: 'connect' }), g), bill = budgetStatus(t, g);
      return { ok: c.ok && !bill.over, dead: bill.over, value: bill.over ? 0 : c.value, text: c.text + ' · ' + bill.text };
    }
    if (t.type === 'lineCrowd') {
      const L = g.net.lines[t.line]; if (!L) return { ok: false, dead: true, value: 0, text: '线路已拆除' };
      const cr = Tasks.crowdOf(g).find(function (x) { return x.lid === t.line; });
      if (!cr) return { ok: false, value: 0, text: '客流计算中' };
      if (cr.noTrain) return { ok: false, value: 0, text: L.name + ' 早高峰没有列车运行，配属列车后才能统计满载率' };
      const S = g.model.net.C.stations, sa = S[cr.a], sb = S[cr.b];
      return { ok: cr.lf <= t.target, value: U.clamp((t.start - cr.lf) / Math.max(0.01, t.start - t.target), 0, 1), text: L.name + ' 最拥挤区段' + (sa && sb ? '「' + sa.name + '—' + sb.name + '」' : '') + '早高峰满载率 ' + U.fmtPct(cr.lf, 0) + ' / 目标 ≤ ' + U.fmtPct(t.target, 0) };
    }
    if (t.type === 'lineCars') {
      const L = g.net.lines[t.line]; if (!L) return { ok: false, dead: true, value: 0, text: '线路已拆除' };
      const rs = C.routes.filter(function (r) { return r.lineId === t.line; }); if (!rs.length) return { ok: false, value: 0, text: '线路未运营' };
      const cars = Math.min.apply(null, rs.map(function (r) { return r.cars; }));
      return { ok: cars >= t.target, value: U.clamp((cars - t.start) / Math.max(1, t.target - t.start), 0, 1), text: L.name + ' 列车编组 ' + cars + ' 节 / 目标 ' + t.target + ' 节（受沿线最小车站限制）' };
    }
    if (t.type === 'fiscal') {
      const last = g.econ.ledger[g.econ.ledger.length - 1], v = last && last.ops > 0 ? last.fare / last.ops : 0;
      const km = CM.Milestones ? CM.Milestones.netInfo(g).km : 0, over = km > t.kmCap + 0.05;
      return { ok: v >= t.target && !over, value: over ? 0 : U.clamp(v / t.target, 0, 1), text: '上月票款/运营费用 ' + U.fmtPct(v, 0) + ' / 目标 ' + U.fmtPct(t.target, 0) + ' · 线网 ' + U.fmtNum(km, 1) + ' km / 上限 ' + U.fmtNum(t.kmCap, 1) + ' km' + (over ? '（超出里程上限，本月不计）' : '') };
    }
    if (t.type === 'lineEff') {
      const L = g.net.lines[t.line]; if (!L) return { ok: false, dead: true, value: 0, text: '线路已拆除' };
      if (t.mode === 'suburban') {   // 市郊线路：按沿线覆盖率（v3.0）
        const v = Tasks.lineCoverage(g, t.line), ok = v >= t.target - Number.EPSILON;
        const gain = Math.max(Number.EPSILON, t.target - t.start), progress = ok ? 1 : U.clamp((v - t.start) / gain, 0, 1);
        return { ok: ok, value: progress, text: L.name + ' 沿线 1.5 km 内步行可达本线车站的居民 ' + U.fmtPct(v, 1) + ' / 目标 ' + U.fmtPct(t.target, 1) };
      }
      const s = Tasks.lineStats(g).get(t.line); if (!s) return { ok: false, value: 0, text: '客流计算中' };
      const v = s.riders / Math.max(0.1, s.km);
      return { ok: v >= t.target, value: U.clamp((v - t.start) / Math.max(1, t.target - t.start), 0, 1), text: L.name + ' 每公里日客流 ' + U.fmtPeople(v) + ' 人次 / 目标 ' + U.fmtPeople(t.target) + ' 人次' };
    }
    if (t.type === 'regionCov') {
      const v = Tasks.regionCoverage(g, t.regions);
      return { ok: v >= t.target, value: U.clamp(v / t.target, 0, 1), text: (t.areaName || '目标片区') + '步行 15 分钟可达地铁的人口 ' + U.fmtPct(v, 0) + ' / 目标 ' + U.fmtPct(t.target, 0) };
    }
    if (t.type === 'xferHub') {
      let n = 0; if (C.stationLines) C.stationLines.forEach(function (s) { if (s.size >= 2) n++; });
      return { ok: n >= t.target, value: U.clamp(n / t.target, 0, 1), text: '换乘站 ' + n + ' 座 / 目标 ' + t.target + ' 座' };
    }
    const done = this.evaluatePart(t, g);
    return done || { ok: false, value: 0, text: '' };
  };
  // ======================== 复合任务 ========================
  // 一个任务同时考核几方面（Tasks.PART_KIND）。parts 的每一项都是一个条件（type 可以是上面任何一种单项任务，也可以是下面的新判定）；
  // 全部达成才算完成。core 项（原任务的目标）是主体：到期时主体已达成、其余未达成，算「部分完成」：奖励打折，不扣拨款。
  // 各城市的方案在 taskplans.js，按任务编号套用；已经发布的旧任务（含旧存档）保持原样
  Tasks.PART_KIND = { net: '网络形态', reach: '覆盖范围', ops: '运营结果', fin: '成本收益', dev: '发展效果' };
  Tasks.PARTIAL = 0.6;   // 部分完成的奖励比例；满奖励是原任务的 1.5 倍，只完成主体也比原来只差一点
  const TRAFFIC_PART = { ridership: 1, facShare: 1, share: 1, lineRiders: 1, lineLoad: 1, netLoad: 1, regionShare: 1, regionCommute: 1, xferShare: 1, todNet: 1, regionPull: 1, lineCrowd: 1, lineEff: 1, zoneCong: 1, stationCrowd: 1 };
  Tasks.trafficCombo = function (t) { return t.type === 'combo' && t.parts.some(function (p) { return TRAFFIC_PART[p.type]; }); };
  // 地名 → 位置：任务自己的锚点、地名表、其他任务的同名锚点
  Tasks.placeOf = function (name, own) {
    for (const a of own || []) if (a && a.name === name && isFinite(a.x)) return a;
    const p = (D.places || []).find(function (q) { return q[0] === name; });
    if (p) return { name: name, x: p[1], y: p[2] };
    for (const t of (D.histTasks || []).concat(D.dynTasks || [], D.scenarios || [])) for (const a of t.anchors || []) if (a && a.name === name && isFinite(a.x)) return a;
    return null;
  };
  // 套用城市方案：原任务的目标成为主体，附加方案里的条件
  Tasks.withPlan = function (g, h) {
    const P = CM.TaskPlans && CM.TaskPlans[g.mapId], plan = P && P[h.id];
    if (!plan || h.type === 'combo') return h;
    const t = JSON.parse(JSON.stringify(h)), own = (h.anchors || []).filter(function (a) { return !Array.isArray(a); });
    const scAnchors = (h.anchors || []).filter(Array.isArray).map(function (a) { const q = Tasks.placeOf(a[0]); return q ? { name: a[0], x: q.x, y: q.y, r: a[1] || 3 } : null; }).filter(Boolean);
    const place = function (o) {
      if (o.at === undefined) return o;
      const q = Tasks.placeOf(o.at, own.concat(scAnchors));
      if (!q) { console.warn('任务方案找不到地点：' + o.at); return null; }
      o.x = q.x; o.y = q.y; o.place = o.at; return o;
    };
    const type0 = h.type === 'budgetConnect' ? 'connect' : h.type, base = Object.assign({ core: true, type: plan.base || type0, kind: plan.baseKind || (type0 === 'coverage' || type0 === 'regionCov' ? 'reach' : 'net') }, JSON.parse(JSON.stringify(plan.baseProps || {})));
    for (const k of ['target', 'regions', 'areaName', 'line', 'start']) if (h[k] !== undefined && base[k] === undefined) base[k] = h[k];
    if (plan.avoid) { const q = Tasks.placeOf(plan.avoid[0], own.concat(scAnchors)); if (q) base.avoid = { name: plan.avoid[0], x: q.x, y: q.y, r: plan.avoid[1] }; else console.warn('任务方案找不到地点：' + plan.avoid[0]); }
    if (base.at !== undefined) place(base);
    const parts = [base];
    if (h.type === 'budgetConnect') parts.push({ kind: 'fin', type: 'budget', budgetX: h.budgetX || 1.2 });
    for (const p of JSON.parse(JSON.stringify(plan.parts || []))) { const q = place(p); if (q) parts.push(q); }
    t.type = 'combo'; t.parts = parts;
    if (plan.desc) t.desc = plan.desc;
    if (plan.tips) t.tips = plan.tips;
    if (plan.sustain) t.sustain = plan.sustain;
    const X = plan.rewardX || (plan.parts && plan.parts.length ? 1.5 : 1);
    if (t.reward) t.reward *= X;
    if (t.rewardMonths) t.rewardMonths *= X;
    return t;
  };
  // 发布（或接受）时记下基准：预算、物价年份、人口岗位、票价
  // 任务锚点或设施在风景区内，且目标半径没有可按期建设的景区外陆地时，改为可选。
  const SCENIC_TASK_RULE = 2;
  Tasks.scenicOf = function (g, t) {
    const city = g.city; if (!city || !city.regions || !city.region) return null;
    const WATER = CM.LU.WATER, deadlineYear = t.deadline ? t.deadline[0] : -Infinity;
    let lock = null;
    const at = function (x, y, r) {
      if (!isFinite(x) || !isFinite(y)) return null;
      const c0 = city.cellAt(x, y); if (c0 < 0) return null;
      const rg = city.regions[city.region[c0]]; if (!rg || !rg.scenic) return null;
      const R = Math.max(0.5, r);
      const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(city.W - 1, Math.floor(x + R));
      const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(city.H - 1, Math.floor(y + R));
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const c = j * city.W + i;
        if (city.lu[c] === WATER || city.regions[city.region[c]].scenic) continue;
        const dx = x - U.clamp(x, i, i + 1), dy = y - U.clamp(y, j, j + 1);
        if (dx * dx + dy * dy > R * R) continue;
        if (!lock) lock = city.lockState();
        if (!lock.mask[c] || (lock.year[c] && lock.year[c] <= deadlineYear)) return null;
      }
      return rg.name || '风景区';
    };
    for (const o of [t].concat(t.parts || [])) {
      for (const a of o.anchors || []) { const n = a && at(a.x, a.y, a.r || 3); if (n) return n; }
      if (o.place !== undefined) { const n = at(o.x, o.y, o.r || 3); if (n) return n; }
      if (o.fac) { const f = CM.Fac && CM.Fac.byId(o.fac); const n = f && at(f.x, f.y, 400 / CFG.CELL_M); if (n) return n; }
    }
    return null;
  };
  Tasks.prepare = function (t, g, issuing = false) {
    Tasks.alignFacDeadline(t);
    if (issuing && t.type === 'budgetConnect') t.budgetFrom = g.buildSeq || 0;
    // 旧任务在新规则下补判一次，已经标为可选的任务保留原待遇。
    if ((t.kind === 'hist' || t.kind === 'dyn') && t.scenicChecked !== SCENIC_TASK_RULE && g.city && g.city.region) {
      t.scenicChecked = SCENIC_TASK_RULE;
      const name = t.optional === 'scenic' ? null : Tasks.scenicOf(g, t);
      if (name) { t.optional = 'scenic'; t.scenicName = name; }
    }
    if (t.type !== 'combo') return t;
    const anchors = t.anchors || [], ready = g.model.trafficReady();
    for (const p of t.parts) {
      if (p.base0 == null && ready && (p.gain || p.drop)) {
        const v = Tasks.partValue(p, g);
        if (v != null) { p.base0 = v; p.target = p.gain ? v + p.gain : v * (1 - p.drop); }
      }
      if (p.type === 'budget') {
        if (issuing) p.budgetFrom = g.buildSeq || 0;
        else if (p.budgetFrom == null && p.spent0 == null) p.spent0 = g.econ.built || 0;
        if (!(p.budget > 0)) p.budget = Tasks.roundMoney(Tasks.estimateLink(g, anchors) * (p.budgetX || 1.2));
      }
      else if (p.type === 'lineCost') { if (p.y0 == null) p.y0 = g.clock.y; if (!(p.budget > 0)) p.budget = Tasks.roundMoney(Tasks.estimateLink(g, anchors) * (p.x || 1)); }
      else if (p.type === 'facShare') { if (p.fare0 == null) p.fare0 = Tasks.fareLevel(g.econ.fare); const f = CM.Fac && CM.Fac.byId(p.fac); if (f && !p.basis) p.basis = Tasks.facBasis(f); }
    }
    return t;
  };
  // 相对目标用到的当前值：全市分担率、片区乘地铁比例、片区平均通勤
  Tasks.partValue = function (p, g) {
    const model = g.model;
    if (p.type === 'share') return (model.daily && model.daily.metroShare) || 0;
    if (p.type === 'regionShare') {
      const fd = model.facData('wd'); if (!fd) return null;
      const w = zoneWeights(g, p.regions); let a = 0, b = 0;
      for (let z = 0; z < model.Z; z++) { a += fd.metro[z] * w[z]; b += fd.trips[z] * w[z]; }
      return b > 0 ? a / b : 0;
    }
    if (p.type === 'regionCommute') {
      const P = model.resultsFor('wd').per[0], w = zoneWeights(g, p.regions); let a = 0, b = 0;
      if (P.zCW) for (let z = 0; z < model.Z; z++) { a += P.zCT[z] * w[z]; b += P.zCW[z] * w[z]; }
      return b > 0 ? a / b : null;
    }
    return null;
  };
  // 经过 anchors 各处的路线：优先全部经过，否则取经过最多的；i0、i1 是最靠外两处在路线上的位置
  Tasks.routeThrough = function (g, anchors) {
    const C = g.compiled; let best = null, bn = -1;
    for (const r of C.routes) {
      if (r.svc) continue;
      let n = 0;
      for (const a of anchors) if (r.stIdx.some(function (i) { const s = C.stations[i]; return U.dist(s.x, s.y, a.x, a.y) <= a.r; })) n++;
      if (n > bn) { bn = n; best = r; }
    }
    if (!best) return { route: null, n: 0, all: false };
    let i0 = Infinity, i1 = -1;
    for (const a of anchors) best.stIdx.forEach(function (i, k) { const s = C.stations[i]; if (U.dist(s.x, s.y, a.x, a.y) <= a.r) { i0 = Math.min(i0, k); i1 = Math.max(i1, k); } });
    return { route: best, n: bn, all: bn === anchors.length, i0: i0, i1: i1 };
  };
  function budgetStatus(t, g) {
    const scoped = Number.isSafeInteger(t.budgetFrom);
    const spent = scoped ? Tasks.sectionSpend(g, t.anchors || [], t.budgetFrom, t.avoid) :
      Math.max(0, (g.econ.built || 0) - (t.spent0 || 0));
    const over = spent > t.budget + 0.5;
    const prefix = scoped ? "这段线路已花 " : "已花 ";
    return { over, text: prefix + U.fmtMoney(spent) + " / 预算 " + U.fmtMoney(t.budget) + (over ? "（已超预算）" : "") };
  }

  // 在连接最多锚点的网内，按区间长度找实际连接，允许沿步行换乘换线。
  Tasks.sectionSpend = function (g, anchors, from, avoid) {
    const C = g.compiled, M = CM.Metro, net = g.net, N = C.stations.length;
    if (!anchors.length || !N) return 0;
    const acc = g.model.net?.C === C ? g.model.net.acc : null;
    const comp = avoid ? componentsAvoiding(C, acc, avoid) : stationComponents(C, acc);
    const permitted = C.stations.map((s, i) => comp.serviced[i] && (!avoid || U.dist(s.x, s.y, avoid.x, avoid.y) > avoid.r));
    const groups = new Map();
    for (const a of anchors) {
      const matches = new Map();
      C.stations.forEach((s, i) => {
        if (!permitted[i]) return;
        const d = U.dist(s.x, s.y, a.x, a.y);
        if (d > a.r) return;
        const root = comp.find(i);
        if (!matches.has(root)) matches.set(root, []);
        matches.get(root).push({ i, d });
      });
      for (const [root, points] of matches) {
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(points);
      }
    }
    let targets = [];
    for (const group of groups.values()) if (group.length > targets.length) targets = group;
    if (!targets.length) return 0;
    const first = targets[0].reduce((a, b) => b.d < a.d ? b : a).i;
    const edges = Array.from({ length: N }, () => []);
    const link = (a, b, m, refs) => {
      if (!permitted[a] || !permitted[b] || a === b) return;
      const len = Math.max(1, m || 0);
      edges[a].push({ i: b, len, refs }); edges[b].push({ i: a, len, refs });
    };
    for (const r of C.routes) {
      if (r.svc) continue;
      for (let i = 0; i < r.legSegs.length; i++) {
        link(r.stIdx[i], r.stIdx[(i + 1) % r.stIdx.length], r.legLenM?.[i], r.legSegs[i]);
      }
    }
    for (const tr of acc?.transfers || []) link(tr.a, tr.b, tr.m);
    const dist = new Float64Array(N).fill(Infinity), prev = new Array(N), heap = new U.Heap(N);
    dist[first] = 0; heap.push(0, first);
    while (heap.n) {
      const i = heap.pop(), d = heap.lastKey;
      if (d > dist[i]) continue;
      for (const e of edges[i]) if (d + e.len < dist[e.i]) {
        dist[e.i] = d + e.len; prev[e.i] = { i, refs: e.refs }; heap.push(dist[e.i], e.i);
      }
    }
    const stations = new Set(), tracks = new Set();
    const cost = asset => (asset?.buildPayments || []).reduce((v, [seq, , amount]) => seq > from ? v + amount : v, 0);
    let total = 0;
    for (const candidates of targets) {
      const nearest = candidates.reduce((a, b) => dist[b.i] + b.d * CFG.CELL_M < dist[a.i] + a.d * CFG.CELL_M ? b : a);
      if (!Number.isFinite(dist[nearest.i])) continue;
      for (let i = nearest.i; !stations.has(i); i = prev[i].i) {
        stations.add(i); total += cost(net.stations[C.stations[i].id]);
        if (!prev[i]) break;
        for (const ref of prev[i].refs || []) {
          const s = net.segments[ref.id]; if (!s) continue;
          const key = M.trackKey(s);
          if (!tracks.has(key)) { tracks.add(key); total += cost(s); }
        }
      }
    }
    return total;
  };
  const inRegions = function (g, ids) { const city = g.city, set = new Set(ids); return function (x, y) { const rg = city.regionAt(x, y); return !!rg && set.has(rg.id); }; };
  // 交通小区落在指定片区内的比例（小区可能跨片区）
  const zoneWeights = function (g, ids) {
    const m = g.model, city = g.city, key = ids.join(','), cache = m._zoneW || (m._zoneW = new Map());
    if (cache.has(key)) return cache.get(key);
    const ks = new Set(); city.regions.forEach(function (r, k) { if (ids.indexOf(r.id) >= 0) ks.add(k); });
    const w = new Float32Array(m.Z);
    for (let z = 0; z < m.Z; z++) { const cells = m.zoneCells[z]; if (!cells || !cells.length) continue; let n = 0; for (const c of cells) if (ks.has(city.region[c])) n++; w[z] = n / cells.length; }
    cache.set(key, w);
    return w;
  };
  // 已开发的车站商业：座数与每月净收益（ids 为空时统计全网）
  Tasks.todStats = function (g, ids) {
    const C = g.model.net ? g.model.net.C : null, sd = g.model.stDaily, T = CM.TOD, y = g.clock.y, inside = ids ? inRegions(g, ids) : null;
    let n = 0, net = 0;
    if (!C || !T) return { n: 0, net: 0 };
    for (const id in g.net.stations) {
      const s = g.net.stations[id], lv = s.tod || 0, k = C.sIndex.get(id);
      if (!lv || k === undefined || !C.serviced[k] || (inside && !inside(s.x, s.y))) continue;
      const flow = sd && k < sd.inn.length ? sd.inn[k] + sd.out[k] + sd.xfer[k] : 0, hub = !!(C.stationLines[k] && C.stationLines[k].size >= 2);
      n++; net += (T.stationDaily(lv, flow, hub, y, g) - T.stationCost(lv, y, s.size, hub)) * 30.4;
    }
    return { n: n, net: net };
  };
  const pointInPoly = function (x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside; }
    return inside;
  };
  Tasks.prototype.evaluatePart = function (t, g) {
    const C = g.compiled, model = g.model, acc = model.net ? model.net.acc : null, M = CM.Metro, self = this, pct = function (v, d) { return U.fmtPct(v, d == null ? 0 : d); };
    const atMost = function (v, target) { return U.clamp(target / Math.max(v, 1e-6), 0, 1); };
    switch (t.type) {
      case 'combo': {
        const hasCore = t.parts.some(function (p) { return p.core; });
        const parts = t.parts.map(function (p, i) {
          const r = self.evaluate(p.anchors ? p : Object.assign({ anchors: t.anchors }, p), g);
          return { kind: p.kind || 'net', core: !!p.core || (!hasCore && i === 0), ok: !!r.ok, value: r.ok ? 1 : U.clamp(r.value || 0, 0, 1), text: r.text, dead: !!r.dead, na: !!r.na, wait: !!r.wait, cheap: !!r.cheap, met: !!r.met, fare0: r.fare0 };
        });
        // 设施已停用的一项不再考核（na）：不计入完成条件和进度；其余条件照常
        const live = parts.filter(function (p) { return !p.na; });
        // 主体全被免除时，剩余条件须全部完成；空的主体集合不能触发部分奖励。
        return { ok: live.length > 0 && live.every(function (p) { return p.ok; }), coreOk: live.some(function (p) { return p.core; }) && live.every(function (p) { return !p.core || p.ok; }), dead: live.some(function (p) { return p.core && p.dead; }), wait: live.some(function (p) { return p.wait; }), value: live.reduce(function (s, p) { return s + p.value; }, 0) / Math.max(1, live.length), parts: parts,
          text: parts.map(function (p) { return (p.na ? '— ' : p.ok ? '✓ ' : '✗ ') + p.text; }).join('；') };
      }
      // ---- 网络形态 ----
      case 'direct': {   // 各处由同一条线直达，不用换乘
        const rt = Tasks.routeThrough(g, t.anchors), names = t.anchors.map(function (a) { return a.name; }).join('、');
        return { ok: rt.all, value: rt.n / (t.anchors.length + 1), text: '同一条线直达：' + names + (rt.all ? '（' + rt.route.line.name + '）' : rt.n > 1 ? '（同一条线上已有 ' + rt.n + ' 处）' : '') };
      }
      case 'loop': {   // 环线：环绕 around、足够长，并串起一头在环内、一头在环外的放射线
        let best = null;
        for (const r of C.routes) {
          if (!r.loop || r.svc) continue;
          const poly = r.stIdx.map(function (i) { return C.stations[i]; }), others = new Set(), onRing = new Set(r.stIdx);
          for (const i of r.stIdx) C.stationLines[i].forEach(function (l) { if (l !== r.lineId) others.add(l); });
          if (acc) for (const tr of acc.transfers) if (onRing.has(tr.a) && C.stationLines[tr.b]) C.stationLines[tr.b].forEach(function (l) { if (l !== r.lineId) others.add(l); });
          let radials = 0;
          others.forEach(function (l) {
            let inn = false, out = false;
            for (const q of C.routes) if (q.lineId === l && !q.svc) for (const k of q.stIdx) { if (onRing.has(k)) continue; if (pointInPoly(C.stations[k].x, C.stations[k].y, poly)) inn = true; else out = true; }
            if (inn && out) radials++;
          });
          const km = r.lenM / 1000, around = t.x == null || pointInPoly(t.x, t.y, poly), score = Math.min(1, km / t.minKm) * 0.4 + Math.min(1, radials / t.minRadials) * 0.4 + (around ? 0.2 : 0);
          if (!best || score > best.score) best = { km: km, around: around, radials: radials, score: score, name: r.line.name };
        }
        if (!best) return { ok: false, value: 0, text: '还没有环线（目标：' + t.minKm + ' km 以上，环绕' + (t.label || t.place) + '，串起 ' + t.minRadials + ' 条放射线）' };
        return { ok: best.km >= t.minKm && best.around && best.radials >= t.minRadials, value: best.score, text: best.name + ' 环长 ' + U.fmtNum(best.km, 1) + ' km / 目标 ' + t.minKm + ' km · ' + (best.around ? '环绕' : '未环绕') + (t.label || t.place) + ' · 串起放射线 ' + best.radials + ' 条 / 目标 ' + t.minRadials + ' 条' };
      }
      case 'hub': {   // 某处的车站有几条线路交汇
        let n = 0;
        C.stations.forEach(function (s, i) { if (C.serviced[i] && U.dist(s.x, s.y, t.x, t.y) <= (t.r || 3)) n = Math.max(n, C.stationLines[i] ? C.stationLines[i].size : 0); });
        return { ok: n >= t.lines, value: n / t.lines, text: t.place + '换乘线路 ' + n + ' 条 / 目标 ' + t.lines + ' 条' };
      }
      case 'cross': {   // 跨越水面的轨道段数（共线只算一次）
        const seen = new Set(); let n = 0;
        C.segs.forEach(function (cs) { if (cs.g.waterM >= (t.minM || 100)) { const k = M.trackKey(cs.seg); if (!seen.has(k)) { seen.add(k); n++; } } });
        return { ok: n >= t.target, value: n / t.target, text: (t.label || '跨水轨道') + ' ' + n + ' 段 / 目标 ' + t.target + ' 段' };
      }
      case 'typeKm': {   // 某种建设方式的线路长度（共线只算一次）
        const seen = new Set(), types = [].concat(t.seg); let km = 0;
        C.segs.forEach(function (cs) { if (types.indexOf(cs.seg.type) >= 0) { const k = M.trackKey(cs.seg); if (!seen.has(k)) { seen.add(k); km += cs.g.lenM / 1000; } } });
        return { ok: km >= t.target, value: km / t.target, text: types.map(function (x) { return CFG.metro.typeName[x]; }).join('或') + '线路 ' + U.fmtNum(km, 1) + ' km / 目标 ' + t.target + ' km' };
      }
      case 'spacing': {   // 平均站距：anchors 所在的线路，或片区内的全部区段
        let avg = 0, label = '';
        if (t.regions) {
          const inside = inRegions(g, t.regions); let len = 0, n = 0;
          C.segs.forEach(function (cs) { const a = C.net.stations[cs.seg.a], b = C.net.stations[cs.seg.b]; if (a && b && inside(a.x, a.y) && inside(b.x, b.y)) { len += cs.g.lenM; n++; } });
          if (!n) return { ok: false, value: 0, text: (t.areaName || '片区') + '内还没有轨道（平均站距目标 ≤ ' + t.max + ' m）' };
          avg = len / n; label = t.areaName + '平均站距 ';
        } else {
          const rt = Tasks.routeThrough(g, t.anchors);
          if (!rt.all || rt.route.stIdx.length < 2) return { ok: false, value: 0, text: '线路建成后计算平均站距（目标 ' + (t.max ? '≤ ' + t.max : '≥ ' + t.min) + ' m）' };
          avg = rt.route.lenM / (rt.route.stIdx.length - (rt.route.loop ? 0 : 1)); label = rt.route.line.name + ' 平均站距 ';
        }
        const okMax = !t.max || avg <= t.max, okMin = !t.min || avg >= t.min;
        return { ok: okMax && okMin, value: okMax && okMin ? 1 : t.max ? atMost(avg, t.max) : U.clamp(avg / t.min, 0, 1), text: label + Math.round(avg) + ' m / 目标 ' + (t.max ? '≤ ' + t.max : '≥ ' + t.min) + ' m' };
      }
      case 'lineSpeed': {
        const rt = Tasks.routeThrough(g, t.anchors);
        if (!rt.all) return { ok: false, value: 0, text: '线路建成后检查运行速度（目标 ≥ ' + t.kmh + ' km/h）' };
        return { ok: rt.route.kmh >= t.kmh, value: rt.route.kmh / t.kmh, text: rt.route.line.name + ' 运行速度 ' + rt.route.kmh + ' km/h / 目标 ≥ ' + t.kmh + ' km/h' };
      }
      case 'lineTrain': {   // 列车编组：目标下限（重铁）或上限（中运量）
        const rt = Tasks.routeThrough(g, t.anchors);
        if (!rt.all) return { ok: false, value: 0, text: '线路建成后检查列车编组（目标 ' + (t.max ? '不超过 ' + t.max : '不少于 ' + t.min) + ' 节）' };
        const cars = rt.route.cars, ok = (!t.min || cars >= t.min) && (!t.max || cars <= t.max);
        return { ok: ok, value: ok ? 1 : t.min ? cars / t.min : atMost(cars, t.max), text: rt.route.line.name + ' 列车 ' + cars + ' 节 / 目标 ' + (t.max ? '≤ ' + t.max : '≥ ' + t.min) + ' 节' };
      }
      case 'noStation': {   // 片区内不能有运营车站
        const inside = inRegions(g, t.regions); let n = 0;
        C.stations.forEach(function (s, i) { if (C.serviced[i] && inside(s.x, s.y)) n++; });
        return { ok: n === 0, value: n ? 0 : 1, text: t.areaName + '内的车站 ' + n + ' 座 / 目标 0 座' };
      }
      case 'coTrack': {   // 共线运营（直通运转）的轨道长度
        const seen = new Set(); let km = 0;
        C.segs.forEach(function (cs) { if (cs.coLines) { const k = M.trackKey(cs.seg); if (!seen.has(k)) { seen.add(k); km += cs.g.lenM / 1000; } } });
        return { ok: km >= t.target, value: km / t.target, text: '共线直通的轨道 ' + U.fmtNum(km, 1) + ' km / 目标 ' + t.target + ' km' };
      }
      // ---- 运营结果 ----
      case 'share': {
        const v = Tasks.partValue(t, g) || 0;
        if (t.target == null) return { ok: false, value: 0, text: '客流计算中' };
        return { ok: v >= t.target, value: t.base0 != null ? U.clamp((v - t.base0) / Math.max(0.001, t.target - t.base0), 0, 1) : v / t.target, text: '全市地铁分担率 ' + pct(v, 1) + ' / 目标 ' + pct(t.target, 1) + (t.base0 != null ? '（发布时 ' + pct(t.base0, 1) + '）' : '') };
      }
      case 'lineRiders': {   // 经过 anchors 的线路每公里日客流
        const rt = Tasks.routeThrough(g, t.anchors);
        if (!rt.all) return { ok: false, value: 0, text: '线路建成后统计客流（目标每公里 ' + U.fmtPeople(t.perKm) + ' 人次/日）' };
        const s = Tasks.lineStats(g).get(rt.route.lineId);
        if (!s) return { ok: false, value: 0, text: '客流计算中' };
        const v = s.riders / Math.max(0.1, s.km);
        return { ok: v >= t.perKm, value: v / t.perKm, text: rt.route.line.name + ' 每公里日客流 ' + U.fmtPeople(v) + ' 人次 / 目标 ' + U.fmtPeople(t.perKm) + ' 人次' };
      }
      case 'lineLoad': {   // 经过 anchors 的线路最拥挤区段的早高峰满载率
        const rt = Tasks.routeThrough(g, t.anchors);
        if (!rt.all) return { ok: false, value: 0, text: '线路建成后统计满载率（目标 ≤ ' + pct(t.target) + '）' };
        const cr = Tasks.crowdOf(g).find(function (x) { return x.lid === rt.route.lineId; });
        if (!cr) return { ok: false, value: 0, text: '客流计算中' };
        if (cr.noTrain) return { ok: false, value: 0, text: rt.route.line.name + ' 早高峰没有列车运行，配属列车后才能统计满载率' };
        return { ok: cr.lf <= t.target, value: atMost(cr.lf, t.target), text: rt.route.line.name + ' 早高峰最高满载率 ' + pct(cr.lf) + ' / 目标 ≤ ' + pct(t.target) };
      }
      case 'netLoad': {   // 全网最拥挤区段的早高峰满载率
        const cr = Tasks.crowdOf(g)[0];
        if (!cr) return { ok: false, value: 0, text: '客流计算中' };
        if (cr.noTrain) return { ok: false, value: 0, text: '全网早高峰都没有列车运行，配属列车后才能统计满载率' };
        return { ok: cr.lf <= t.target, value: atMost(cr.lf, t.target), text: '全网早高峰最高满载率 ' + pct(cr.lf) + ' / 目标 ≤ ' + pct(t.target) };
      }
      case 'regionShare': {   // 片区居民的出行乘地铁的比例（工作日全天）
        const v = Tasks.partValue(t, g);
        if (v == null || t.target == null) return { ok: false, value: 0, text: '客流计算中' };
        return { ok: v >= t.target, value: t.base0 != null ? U.clamp((v - t.base0) / Math.max(0.001, t.target - t.base0), 0, 1) : v / t.target, text: t.areaName + '居民出行乘地铁 ' + pct(v, 1) + ' / 目标 ' + pct(t.target, 1) + (t.base0 != null ? '（发布时 ' + pct(t.base0, 1) + '）' : '') };
      }
      case 'regionCommute': {   // 住在片区的人平均通勤时间（工作日早高峰，门到门）
        const v = Tasks.partValue(t, g);
        if (v == null || t.target == null) return { ok: false, value: 0, text: '客流计算中' };
        return { ok: v <= t.target, value: t.base0 != null ? U.clamp((t.base0 - v) / Math.max(0.01, t.base0 - t.target), 0, 1) : atMost(v, t.target), text: t.areaName + '居民平均通勤 ' + U.fmtNum(v, 1) + ' 分钟 / 目标 ≤ ' + U.fmtNum(t.target, 1) + ' 分钟' + (t.base0 != null ? '（发布时 ' + U.fmtNum(t.base0, 1) + ' 分钟）' : '') };
      }
      case 'xferShare': {   // 全网换乘客流里，发生在指定片区的比例（越低说明换乘越分散）
        const sd = model.stDaily, MC = model.net ? model.net.C : null;
        if (!sd || !MC || model.dailyStale) return { ok: false, value: 0, text: '客流计算中' };
        const inside = inRegions(g, t.regions); let a = 0, b = 0;
        MC.stations.forEach(function (s, i) { const v = sd.xfer[i] || 0; b += v; if (inside(s.x, s.y)) a += v; });
        if (b <= 0) return { ok: false, value: 0, text: '还没有换乘客流' };
        const v = a / b;
        return { ok: v <= t.target, value: atMost(v, t.target), text: '换乘客流在' + t.areaName + '的比例 ' + pct(v) + ' / 目标 ≤ ' + pct(t.target) };
      }
      // ---- 成本收益 ----
      case 'budget': {
        const bill = budgetStatus(t, g);
        return { ok: !bill.over, dead: bill.over, value: bill.over ? 0 : 1, text: bill.text };
      }
      case 'lineCost': {   // 这段线路（anchors 之间）按发布当年物价的造价：改用高架、取直、少设站都能省钱，改建后重新计算
        const rt = Tasks.routeThrough(g, t.anchors);
        if (!rt.all) return { ok: false, value: 0, text: '线路建成后核算造价（目标 ≤ ' + U.fmtMoney(t.budget) + '）' };
        const r = rt.route, y = t.y0 || g.clock.y; let v = 0;
        for (let k = rt.i0; k <= rt.i1; k++) { const st = C.stations[r.stIdx[k]]; if (st) v += M.stationCost(st.type, st.size, y); if (k < rt.i1) for (const ref of r.legSegs[k] || []) { const cs = C.segs.get(ref.id); if (cs) v += M.trackCost(cs.g, cs.seg.type, y); } }
        return { ok: v <= t.budget, value: atMost(v, t.budget), text: '这段线路造价 ' + U.fmtMoney(v) + ' / 目标 ≤ ' + U.fmtMoney(t.budget) };
      }
      case 'todNet': {   // 车站商业（站城开发）：座数与每月净收益
        const s = Tasks.todStats(g, t.regions), okN = s.n >= (t.stations || 1), okV = s.net > (t.net || 0);
        return { ok: okN && okV, value: (Math.min(1, s.n / (t.stations || 1)) + (okV ? 1 : 0)) / 2, text: (t.areaName || '全网') + '站城开发 ' + s.n + ' 座 / 目标 ' + (t.stations || 1) + ' 座 · 每月净收益 ' + (s.net < 0 ? '−' : '') + U.fmtMoney(Math.abs(s.net)) + (t.net ? ' / 目标 ≥ ' + U.fmtMoney(t.net) : '（需为正）') };
      }
      // ---- 发展效果 ----
      case 'regionPull': {   // 片区内带动较强的车站（与地图上「地铁带动」的标注同一标准：换乘、客流和商业开发都能提高）。自然增长不修地铁也会涨，不作为考核
        const P = g.metroPull ? g.metroPull() : null, inside = inRegions(g, t.regions); let n = 0;
        if (P) for (const s of P.all) if (s.k * P.w >= 0.45 && inside(s.x, s.y)) n++;
        return { ok: n >= t.target, value: n / t.target, text: t.areaName + '带动较强的车站 ' + n + ' 座 / 目标 ' + t.target + ' 座' };
      }
    }
    return null;
  };
  // 工作日早高峰各区段的满载情况（任务、地铁芯和线路详情共用这一份）：满载率 = 区间断面客流 ÷ 线路运力（发车频率 × 定员，v2.5 定员按车队，环线两个方向分别计）。
  // 没有列车运行的路线（列车都调走了、手动设为 0，或全部跑在加开的交路上）没有运力，满载率无从谈起：标 noTrain，不再除以兜底的 1 得出几十万 %
  Tasks.LF_MAX = 9.99;
  const stationPeakRunning = function (g, i) {
    const m = g.model, n = m.net, routes = g.compiled.stationRoutes[i];
    if (!n || !routes) return false;
    const peak = m.resultsFor('wd').per[0];
    return routes.some(function (r) { return CM.Model.boardFreq(peak, n, r) > 0; });
  };
  Tasks.crowdSections = function (g, lid) {
    const m = g.model, net = m.net, out = []; if (!net || !net.R || !m.trafficReady()) return out;
    const P = m.resultsFor('wd').per[0]; if (!P.load || P.load.length !== net.nE) return out;
    // 共用区间（v3.0）：大小交路、支线在同一区间只列一行，断面客流与运力都按本线各路线合计
    const grp = new Map(), done = new Set();
    if (net.sharedSec) net.sharedSec.forEach(function (L, i) { for (const x of L) grp.set(x.e, i); });
    for (let r = 0; r < net.R; r++) {
      const rt = net.C.routes[r]; if (lid != null && rt.lineId !== lid) continue;
      const re = net.rideEdge[r], capT = m.capOf(r, net), n = rt.stIdx.length;
      for (let q = 0; q < re.length; q++) {
        let load = P.load[re[q]] || 0, f = CM.Model.dirFreq(P, net, r, q), capH = f * capT, label = rt.label, shared = 0;
        const gi = grp.get(re[q]);
        if (gi !== undefined) {
          if (done.has(gi)) continue; done.add(gi);
          load = 0; capH = 0; f = 0; const rs = new Set();
          for (const x of net.sharedSec[gi]) { const fx = CM.Model.dirFreq(P, net, x.r, x.d); load += P.load[x.e] || 0; f += fx; capH += fx * m.capOf(x.r, net); rs.add(x.r); }
          shared = rs.size; label = rt.line.name + '（' + shared + ' 个交路合计）';
        }
        const k = q >> 1, on = capH >= 1;
        out.push({ lid: rt.lineId, r: r, q: q, leg: k, a: rt.stIdx[k], b: rt.stIdx[(k + 1) % n], rev: !!(q & 1), label: label, load: load, f: f, capH: capH, lf: on ? Math.min(Tasks.LF_MAX, load / capH) : 0, noTrain: !on, cars: rt.cars, shared: shared });
      }
    }
    return out;
  };
  // 各线路最拥挤的区段，按满载率从高到低。一条线只要还有交路在跑就只看在跑的交路；整条线都没有列车时 noTrain（满载率记 0，不进过载排行，也不发拥挤任务）
  Tasks.crowdOf = function (g) {
    const out = new Map();
    for (const s of Tasks.crowdSections(g)) {
      const cur = out.get(s.lid);
      if (!cur || (cur.noTrain && !s.noTrain) || (cur.noTrain === s.noTrain && (s.noTrain ? s.load > cur.load : s.lf > cur.lf))) out.set(s.lid, s);
    }
    return Array.from(out.values()).sort(function (x, y) { return y.lf - x.lf; });
  };
  // 各线路的日客流（周平均上车人次）与线路长度
  Tasks.lineStats = function (g) {
    const m = g.model, sd = m.stDaily, out = new Map();
    if (!sd || !sd.routeBoard || !m.net || m.dailyStale) return out;
    m.net.C.routes.forEach(function (rt, r) { const s = out.get(rt.lineId) || { riders: 0, km: 0 }; s.riders += sd.routeBoard[r] || 0; out.set(rt.lineId, s); });
    g.compiled.segs.forEach(function (cs) { const s = out.get(cs.seg.line); if (s && cs.g) s.km += cs.g.lenM / 1000; });
    return out;
  };
  // 线路沿线覆盖率（v3.0，「重新跑满」的市郊线路判定）：线路轨道两侧 1.5 km 走廊内的居民中，步行 15 分钟可达本线车站的比例
  Tasks.SUBURBAN_COVERAGE_LIMIT = 0.9;
  Tasks.lineCoverage = function (g, lid) {
    const city = g.city, net = g.model.net, acc = net ? net.acc : null; if (!acc || !net.C) return 0;
    const C = net.C, W = city.W, H = city.H, R = 6, inC = new Uint8Array(city.N);
    for (const rt of C.routes) { if (rt.lineId !== lid) continue; for (let i = 0; i < rt.pts.length; i += 2) { const px = rt.pts[i][0], py = rt.pts[i][1]; for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(H - 1, Math.floor(py + R)); y++) for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(W - 1, Math.floor(px + R)); x++) if ((x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py) <= R * R) inC[y * W + x] = 1; } }
    // 使用本线各站的步行树。每个可达的街道路口覆盖相邻地块，距离与接驳模型口径相同。
    for (let k = 0; k < C.stations.length; k++) {
      if (!C.serviced[k] || !C.stationLines[k].has(lid) || !acc.trees[k]) continue;
      const st = C.stations[k], c0 = city.cellAt(st.x, st.y), tree = acc.trees[k];
      const sx = c0 % W, sy = Math.floor(c0 / W);
      const x0 = Math.max(0, sx - 6), x1 = Math.min(W - 1, sx + 6);
      const y0 = Math.max(0, sy - 6), y1 = Math.min(H - 1, sy + 6);
      for (let q = 0; q < tree.verts.length; q++) {
        if (tree.dist[q] + CFG.walk.cellExtraM > CFG.walk.maxAccessM) continue;
        const v = tree.verts[q], vx = v % city.VW, vy = Math.floor(v / city.VW);
        for (let y = Math.max(y0, vy - 1); y <= Math.min(y1, vy); y++) for (let x = Math.max(x0, vx - 1); x <= Math.min(x1, vx); x++) {
          const c = y * W + x;
          if (inC[c]) inC[c] = 2;
        }
      }
    }
    let tot = 0, cov = 0;
    for (let c = 0; c < city.N; c++) { if (!inC[c]) continue; const p = city.pop[c]; tot += p; if (inC[c] === 2) cov += p; }
    return tot > 0 ? cov / tot : 0;
  };
  // 指定片区的人口里，步行 15 分钟可达运营车站的比例
  Tasks.regionCoverage = function (g, ids) {
    const city = g.city, acc = g.model.net ? g.model.net.acc : null; if (!acc) return 0;
    const ks = new Set(); city.regions.forEach(function (r, k) { if (ids.indexOf(r.id) >= 0) ks.add(k); });
    let tot = 0, cov = 0;
    for (let c = 0; c < city.N; c++) { if (!ks.has(city.region[c])) continue; const p = city.pop[c]; tot += p; if (acc.cellWalk[c] <= CFG.walk.maxAccessM) cov += p; }
    return tot > 0 ? cov / tot : 0;
  };

  // Review samples belong to this exact input and are never reused after a change.
  Tasks.prototype.trafficReviewState=function(g){
    const m=g.model;let s=this._trafficReview;
    if(!s||s.net!==m.net||s.od!==m.od||s.year!==m.year||s.fare!==CM.Model.fareKey(m.fare)||s.ym!==g.ym())s=this._trafficReview={net:m.net,od:m.od,year:m.year,fare:CM.Model.fareKey(m.fare),ym:g.ym(),values:new Map()};
    return s;
  };
  Tasks.prototype.reviewValue=function(t,g){
    if(t.type==='ridership'){const d=g.model.dailyFor(Tasks.basisOf(t));return d?d.metro:null;}
    if(t.type==='facShare'){const f=CM.Fac.byId(t.fac),r=f&&Tasks.facShareOf(g.model,f,t.basis);return r?r.share:null;}
    if(t.type==='stationCrowd'){const i=g.compiled.sIndex.get(t.station),s=g.model.stDailyWk;return i===undefined||!s||!stationPeakRunning(g,i)?null:(s.peak[i]||0)/CFG.metro.stationCap[g.compiled.stations[i].size];}
    if(t.type==='zoneCong'){
      if(t.metric!=='carShare')return g.zoneCong(t.zone,'wd');
      const a=(t.samples||[]).filter(x=>x.ym>=g.ym()-2&&x.ym<g.ym()).slice(-2);
      return(a.reduce((n,x)=>n+x.value,0)+g.model.zoneTraffic(t.zone).carShare)/(a.length+1);
    }
    return null;
  };
  Tasks.prototype.sampleTrafficReview=function(g){
    const s=this.trafficReviewState(g);
    for(const t of this.active)if(['zoneCong','stationCrowd','ridership','facShare'].includes(t.type)){
      const value=this.reviewValue(t,g);if(!Number.isFinite(value))continue;
      const a=s.values.get(t.id)||[];if(a.length&&a[a.length-1].cycle===g.model.cycles)continue;
      a.push({cycle:g.model.cycles,value});s.values.set(t.id,a.slice(-3));
    }
  };
  Tasks.prototype.reviewSafe=function(t,g){
    const a=this.trafficReviewState(g).values.get(t.id);if(!a||a.length<3)return false;
    const values=a.map(x=>x.value),last=values[values.length-1],spread=Math.max(...values)-Math.min(...values);
    const floor=t.type==='ridership'?Math.max(1,t.target*.02):((t.type==='stationCrowd'||(t.type==='zoneCong'&&t.metric!=='carShare'))?.03:.005);
    return Math.abs(last-t.target)>Math.max(floor,spread*2);
  };
  // 正在等结论的交通任务，最近三轮是否都已明显越过门槛（是则不必算满，v2.6）。复合任务没有单一门槛，仍算满
  Tasks.prototype.reviewsSettled=function(g){
    let any=false;
    for(const t of this.active){
      if(t.type==='combo'&&t.evaluatedYM!==g.ym()&&(t.parts||[]).some(function(p){return p.kind==='ops';}))return false;
      if(t.evaluatedYM===g.ym()||!['zoneCong','stationCrowd','ridership','facShare'].includes(t.type))continue;
      if(!this.nearTrafficThreshold(t,g,this.evaluate(t,g)))continue;
      any=true;if(!this.reviewSafe(t,g))return false;
    }
    return any;
  };
  Tasks.prototype.startTrafficReview=function(t,g){
    g.model.reviewObserver=()=>this.sampleTrafficReview(g);g.model.reviewEnough=()=>this.reviewsSettled(g);this.sampleTrafficReview(g);return g.model.requestReview(Tasks.basisOf(t));
  };

  Tasks.prototype.nearTrafficThreshold=function(t,g,ev){
    // 只在这个月真要下结论时才复核（达成或到期）：进度到九成但还没达成时不必算到严格收敛，否则任务多的后期几乎每月都要多算 12 轮（v2.6）
    const ym=g.ym();let near=ev.ok||ym>=U.ymIndex(t.deadline[0],t.deadline[1]);
    if(t.type==='zoneCong'&&t.metric==='carShare'){
      const samples=(t.samples||[]).filter(x=>x.ym>=ym-2&&x.ym<ym).slice(-2),avg=(samples.reduce((n,x)=>n+x.value,0)+ev.sample)/(samples.length+1);
      near=near||avg<=t.target+.005;
    }
    return near;
  };
  Tasks.prototype.prepareTrafficReviews=function(g){
    if(!g.model.trafficReady())return;
    for(const t of this.active)if(t.evaluatedYM!==g.ym()&&['zoneCong','stationCrowd','ridership','facShare'].includes(t.type)){
      const basis=Tasks.basisOf(t);if(!g.model.trafficVerified(basis)&&this.nearTrafficThreshold(t,g,this.evaluate(t,g))&&!this.reviewSafe(t,g))this.startTrafficReview(t,g);
    }
  };

  // 任务节奏（v3.2 玩家反馈：任务期限太长、任务栏里同时五六个任务、任务出现时要建的地方还没开放、一上来就太难）：
  //  · 同时进行的任务（不含玩家自己接受的可选挑战）最多 maxActive 个，多出来的历史与事件任务排队，轮到时再发；
  //  · 历史参考任务最早在截止前 histWindow 个月出现（截止年份仍按史实；以前开局就挂出、七八年甚至十年才到期），期限至少 minLeft 个月；
  //    地点还没开放时等开放再发（截止相应顺延）；
  //  · 动态任务期限按 dynScale 缩短（不少于 dynMin 个月）；
  //  · 上手阶段（Tasks.ramp：开局头 rampYears 年、线网不到 rampStations 座车站）动态任务的目标降低，不出拥堵与收支类任务
  Tasks.PACE = { maxActive: 3, histWindow: 36, minLeft: 12, histLate: 24, dynScale: 0.75, dynMin: 12, rampYears: 8, rampStations: 16 };
  // 动态任务结束后的冷却（v3.4 玩家反馈：任务不要重复）：同一地点或设施完成或失败后 10 年不再发（失败的原样再发也算重复），同名的片区（几个小区同叫
  // 「某某街道一带」）一并算；同类任务完成后 1 年、失败后 2 年
  Tasks.COOL = { place: [120, 120], type: [12, 24] };
  // 任务涉及的全部锚点（含复合任务各分项）
  const hasPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const anchorsOf = function (t) {
    const points = (t.anchors || []).map(a => Array.isArray(a) ? Tasks.placeOf(a[0]) : a).filter(hasPoint);
    for (const p of t.parts || []) points.push(...anchorsOf(p));
    return points;
  };
  Tasks.coolDown = function (T, t, ym, complete) {
    const c = T.cool || (T.cool = {}), k = complete ? 0 : 1;
    c[t.coolKey || t.type] = ym + Tasks.COOL.place[k];
    Tasks.coolPlace(T, t, ym, complete);
    if (t.title) c['title:' + t.title] = ym + Tasks.COOL.place[k];
    c['type:' + t.type] = ym + Tasks.COOL.type[k];
  };
  // 同一处的不同说法（v3.4 玩家反馈：「情侣路与珠海渔女」的设施任务和「情侣路一带」的片区任务各发一遍）：片区任务取片区中心、
  // 设施任务取设施位置记为任务地点（spot），进行中的任务地点与锚点 1.2 km 内不再发片区与设施任务；有地点或锚点的任务结束后，
  // 这些地点按 COOL.place 冷却（cool 里的 at:x,y），期间附近同样不发。车站拥挤、线路类任务不算地点
  const SPOT_KM = 1.2;
  Tasks.spotOf = function (t, g) {
    if (hasPoint(t.spot)) return t.spot;
    const m = g && g.model; if (!m) return null;
    if ((t.type === 'zoneCov' || t.type === 'zoneCong') && Number.isInteger(t.zone) && t.zone >= 0 && t.zone < m.Z && m.zCx && m.zCy) {
      const p = { x: m.zCx[t.zone], y: m.zCy[t.zone] }; if (hasPoint(p)) return p;
    }
    const f = t.fac && m.fn && m.fn.list.find(q => q.id === t.fac);
    if (hasPoint(f) && !f.ext) return { x: f.x, y: f.y };
    return null;
  };
  Tasks.coolPlace = function (T, t, ym, complete) {
    const c = T.cool || (T.cool = {}), until = ym + Tasks.COOL.place[complete ? 0 : 1], pts = anchorsOf(t), sp = t.spot;
    if (hasPoint(sp)) pts.push(sp);
    for (const k in c) if (k.slice(0, 3) === 'at:' && !(c[k] > ym)) delete c[k];   // 过期的地点冷却顺手清掉
    for (const p of pts) { const k = 'at:' + p.x.toFixed(1) + ',' + p.y.toFixed(1); c[k] = Math.max(c[k] || 0, until); }
  };
  Tasks.prototype.cooledNear = function (x, y, ym) {
    const c = this.cool || {}, lim = SPOT_KM * 1000 / CFG.CELL_M;
    for (const k in c) { if (k.slice(0, 3) !== 'at:' || !(c[k] > ym)) continue; const p = k.slice(3).split(','); if (U.dist(x, y, +p[0], +p[1]) <= lim) return true; }
    return false;
  };
  Tasks.mainCount = function (T) { return T.active.filter(function (t) { return t.kind !== 'opt'; }).length; };
  Tasks.ramp = function (g, T) {
    const P = Tasks.PACE, C = g.compiled; let st = 0;
    if (C && C.stations) C.stations.forEach(function (s, i) { if (C.serviced[i]) st++; });
    const y0 = T && T.startYM != null ? T.startYM : g.ym();
    return U.clamp(Math.max((g.ym() - y0) / (12 * P.rampYears), st / P.rampStations), 0, 1);
  };
  // 任务去重（v3.4 玩家反馈：同一组地点被阶段目标、历史任务、本城任务各发一遍）：两项任务的锚点一一配对，相距 0.8 km 以内算同一处
  // （口岸、站前这类挤在一起的地点一一配对，不会因为都在附近就算重复）
  const SAME_KM = 0.8;
  Tasks.sameAnchors = function (A, B) {
    const lim = SAME_KM * 1000 / CFG.CELL_M;
    const matches = A.map(a => B.flatMap((b, i) => U.dist(a.x, a.y, b.x, b.y) <= lim ? [i] : []));
    const owners = new Map();
    const pair = (a, seen) => {
      for (const b of matches[a]) {
        if (seen.has(b)) continue;
        seen.add(b);
        if (!owners.has(b) || pair(owners.get(b), seen)) { owners.set(b, a); return true; }
      }
      return false;
    };
    matches.forEach((_, i) => pair(i, new Set()));
    return owners.size;
  };
  // 和这项任务重复的进行中、已完成或失败的任务：进行中的有两处相同就先不发（done 为假）；它的地点都已被完成的任务连过、没有新去处，
  // 或全在一项失败的任务里时不必再发（done 为真）。多出新地点的（如把线延伸到更远的大学城）照常发布
  Tasks.prototype.dupOf = function (t) {
    const A = anchorsOf(t); if (A.length < 2) return null;
    for (const o of this.active) if (o !== t && Tasks.sameAnchors(A, anchorsOf(o)) >= 2) return { task: o, done: false };
    // 已完成：其中一项完成的任务有两处相同，且每个地点都已被完成的任务连过（如只多出一个早就通车的关闸），没有新去处
    let best = null, bn = 0; const doneA = [];
    for (const o of this.done) { if (o.partial) continue; const B = anchorsOf(o), n = Tasks.sameAnchors(A, B); if (n > bn) { bn = n; best = o; } for (const b of B) doneA.push(b); }
    if (bn >= 2 && Tasks.sameAnchors(A, doneA) >= A.length) return { task: best, done: true };
    // 失败过的同一件事（v3.4 玩家反馈：任务不要重复）：地点全在一项失败的任务里（同样的几处或其中几处），不再换个名目重发
    for (const o of this.failed) if (Tasks.sameAnchors(A, anchorsOf(o)) >= A.length) return { task: o, done: true };
    return null;
  };
  // 某处是否已经是进行中的连线任务要去的地方（泛泛的覆盖、减堵、设施接驳任务不再在这里重复发布）
  Tasks.prototype.targeted = function (x, y, g) {
    const lim2 = SPOT_KM * 1000 / CFG.CELL_M;
    return this.active.some(function (t) {
      if (anchorsOf(t).some(function (a) { return U.dist(x, y, a.x, a.y) <= Math.max(lim2, a.r || 0); })) return true;
      const sp = Tasks.spotOf(t, g); return !!sp && U.dist(x, y, sp.x, sp.y) <= lim2;   // 片区、设施任务的地点
    });
  };
  Tasks.prototype.monthly = function (g) {
    const y = g.clock.y, m = g.clock.m, ym = U.ymIndex(y, m), P = Tasks.PACE;
    const out = [];
    const challenge = g.econ.mode === 'challenge';
    if (this.startYM == null) this.startYM = U.ymIndex(g.startYear || CFG.START.y, 1);
    // 发布历史参考任务（节奏见 Tasks.PACE）。等待中的记在 issued['hw:id']（开始等待的月份，随存档保存）
    for (const h of D.histTasks) {
      if (this.issued[h.id]) continue;
      const ap = U.ymIndex(h.appear[0], h.appear[1]), dl0 = U.ymIndex(h.deadline[0], h.deadline[1]), waited = this.issued['hw:' + h.id];
      if (ym < ap) continue;
      if (ym > (waited == null ? dl0 : dl0 + P.histLate)) {
        this.issued[h.id] = 1; delete this.issued['hw:' + h.id]; continue;
      }   // 旧存档：截止已过、也没在排队的不补发
      if (waited == null && ym < dl0 - P.histWindow) continue;               // 离截止还很远：先不出现
      const tp = Tasks.withPlan(g, h);
      const dup = this.dupOf(tp);
      if (dup && dup.done) { this.issued[h.id] = 1; delete this.issued['hw:' + h.id]; continue; }   // 同样的地点已经连过（阶段目标或本城任务完成了）：不再发
      const ready = !dup && Tasks.mainCount(this) < P.maxActive && Tasks.anchorsOpenBy(g, anchorsOf(tp), ym + 12);   // 名额已满、地点还没开放或正在做同样的事：排队
      if (!ready) {
        if (waited == null) this.issued['hw:' + h.id] = ym;
        continue;
      }
      this.issued[h.id] = 1; delete this.issued['hw:' + h.id];
      const t = Object.assign({ kind: 'hist', status: 'active', issuedAt: [y, m], streak: 0 }, JSON.parse(JSON.stringify(tp)));
      if (dl0 < ym + P.minLeft) { t.deadline = ymPair(ym + P.minLeft); t.delayNote = '排队或等地点开放后才发布，期限顺延到 ' + t.deadline[0] + ' 年 ' + t.deadline[1] + ' 月（原为 ' + h.deadline[0] + ' 年 ' + h.deadline[1] + ' 月）'; }
      t.reward = t.reward * g.econ.costIndex(y);
      Tasks.prepare(t, g, true);
      this.active.push(t);
      out.push({ type: 'issued', task: t });
    }
    // 历史事件引发的任务：在事件发生且通过发布门槛后发布，任务卡保留原事件。
    // 规则同本城动态任务（未完成拨款 ×0.92、6 个月）；奖励按发布时的基础月拨款 × rewardMonths（约 1 个月，与本城动态任务相当）；事件发生时已经达成的当月即完成。
    // 旧存档已过事件日期 2 个月以上的不补发。
    // 发布门槛（v3.1 玩家反馈，见 Tasks.gate）：地点离线网太远或附近还没人时先记下、不发，等线网修近、人口长起来再发（起因照写）；
    // 等到事件后 months 个月仍过不了门槛就不再发。等待中的事件记在 issued['evw:id']（随存档保存）
    let G = null;
    if (!g.tutorial) for (const e of D.events || []) {
      const sp = e.task; if (!sp || this.issued['ev:' + sp.id]) continue;
      const ey = U.ymIndex(e.y, e.m || 1); if (ym < ey) continue;
      if (this.issued['evw:' + sp.id] == null) {
        if (ym - ey > 2) { this.issued['ev:' + sp.id] = 1; continue; }
        this.issued['evw:' + sp.id] = ey;
      }
      const tp = Tasks.withPlan(g, sp), dup = this.dupOf(tp);
      if (dup?.done) { this.issued['ev:' + sp.id] = 1; delete this.issued['evw:' + sp.id]; continue; }
      const dl = ym + Math.max(P.dynMin, Math.round((sp.months || 36) * P.dynScale));
      if (ym - ey >= (sp.months || 36)) {
        this.issued['ev:' + sp.id] = 1;
        delete this.issued['evw:' + sp.id];
        continue;
      }
      if (dup || Tasks.mainCount(this) >= P.maxActive || !(G || (G = Tasks.gate(g))).check(tp).ok) continue;
      this.issued['ev:' + sp.id] = 1; delete this.issued['evw:' + sp.id];
      const t = Object.assign({ kind: 'dyn', status: 'active', issuedAt: [y, m], streak: 0, coolKey: 'ev:' + sp.id, cityId: sp.id, cause: e.title }, JSON.parse(JSON.stringify(tp)));
      // 锚点可写 [地名, 半径]：按地名表与其他任务的同名锚点定位，找不到地名的不发布
      const locate = function (list) { return list.map(function (a) { if (!Array.isArray(a)) return a; const q = Tasks.placeOf(a[0]); return q ? { name: a[0], x: q.x, y: q.y, r: a[1] || 3 } : null; }); };
      let lost = false;
      for (const o of [t].concat(t.parts || [])) if (o.anchors) { o.anchors = locate(o.anchors); if (o.anchors.some(function (a) { return !a; })) lost = true; }
      if (lost) { console.warn('事件任务找不到地点：' + sp.id); continue; }
      t.id = 'd' + (this.seq++); t.deadline = [Math.floor(dl / 12), dl % 12 + 1];
      t.reward = (t.rewardMonths || 1) * g.econ.grantQuota(y, m);
      delete t.months; delete t.rewardMonths;
      if (t.type === 'facShare') { const f = CM.Fac && CM.Fac.byId(t.fac); if (!f) continue; t.fare0 = Tasks.fareLevel(g.econ.fare); if (!t.basis) t.basis = Tasks.facBasis(f); }
      Tasks.prepare(t, g, true);
      this.active.push(t);
      out.push({ type: 'issued', task: t });
    }
    // 开局当月尝试发布上手任务，名额空出后再发新任务。
    if (!this.nextDyn) this.nextDyn = ym;
    if (!D.noDynTasks && ym >= this.nextDyn && Tasks.mainCount(this) < P.maxActive && this.active.filter(function (t) { return t.kind === 'dyn'; }).length < 2) {
      const t = this.generate(g);
      if (t) { this.active.push(t); out.push({ type: 'issued', task: t }); }
      this.nextDyn = ym + 6;
    }
    // 可选挑战与城市策略难题（v2.3）：只提出，由玩家决定是否接受
    for (const o of this.offerMonthly(g)) out.push(o);
    // 评估。交通模型升级过渡期（旧存档升级当月）：未达标时不清零连续月数，到期任务顺延 1 个月，不判失败
    const transit = g.inTransition ? g.inTransition(ym) : false;
    for (const t of this.active.slice()) {
      if(t.evaluatedYM===ym)continue;
      // 单设施或全部设施均退役时撤销；复合任务只免除退役子项，保留其余目标。
      const retired = function (p) {
        if (p.type === 'facShare') { const f = CM.Fac && CM.Fac.byId(p.fac); return !f || p.noFac || (f.close != null && g.year() >= f.close) || (Tasks.facState(f, g) === 'on' && Tasks.facUnavailable(f, g)); }
        return p.type === 'combo' && p.parts.length > 0 && p.parts.every(retired);
      };
      if (retired(t)) {
        t.status = 'withdrawn'; t.closedAt = [y, m]; this.active.splice(this.active.indexOf(t), 1);
        this.adjusted = (this.adjusted || []).concat([t]).slice(-60);
        out.push({ type: 'withdrawn', task: t }); continue;
      }
      Tasks.prepare(t,g);   // 发布时交通结果还没好的相对目标，在这里补记基准
      const comboTraffic=Tasks.trafficCombo(t);
      if(comboTraffic&&!g.model.trafficReady()){
        if(ym>=U.ymIndex(t.deadline[0],t.deadline[1])){const n=ym+1;t.deadline=[Math.floor(n/12),n%12+1];}
        g.taskRecheckYM=ym;t.graced='交通结果正在更新，保留进度并顺延到期评估';continue;
      }
      if(['zoneCong','stationCrowd','ridership','facShare'].includes(t.type)&&!g.model.trafficReady()){
        if(ym>=U.ymIndex(t.deadline[0],t.deadline[1])){const n=ym+1;t.deadline=[Math.floor(n/12),n%12+1];}
        g.taskRecheckYM=ym;t.graced='交通结果正在更新，保留进度并顺延到期评估';continue;
      }
      if((t.type==='lineCrowd'||t.type==='lineEff')&&!g.model.trafficReady()){
        if(ym>=U.ymIndex(t.deadline[0],t.deadline[1])){const n=ym+1;t.deadline=[Math.floor(n/12),n%12+1];}
        g.taskRecheckYM=ym;t.graced='交通结果正在更新，保留进度并顺延到期评估';continue;
      }
      if (Tasks.FARE_GATED[t.type] && t.fare0 == null) t.fare0 = Tasks.fareLevel(g.econ.fare);   // 旧存档的进行中任务：以现在的票价为门槛
      const ev = this.evaluate(t, g), due = ym >= U.ymIndex(t.deadline[0], t.deadline[1]);
      // 到期时设施日期已到、却还没投入使用（场地未成陆、地标未落成等）：顺延，最多等 12 个月，之后这一项不再考核
      if (due && ev.wait) {
        t.waitN = (t.waitN || 0) + 1;
        if (t.waitN <= 12) { t.deadline = ymPair(ym + 1); t.graced = '设施还没投入使用，运营结果顺延到投入后结算'; t.progress = ev; continue; }
        if (t.type === 'combo') { for (const p of t.parts) if (p.type === 'facShare') { const f1 = CM.Fac.byId(p.fac); if (Tasks.facState(f1, g) !== 'on') p.noFac = true; } }
        else t.noFac = true;
        g.taskRecheckYM = ym; continue;
      }
      // 指标已经达标、只差票价（低于任务发布时）：这不是交通结果的波动。到期时说明原因并顺延，把票价调回去还能结算；最多 3 次
      const fareOnly = t.type === 'combo' ? (ev.parts || []).some(function (p) { return p.cheap; }) && ev.parts.every(function (p) { return p.na || p.ok || (p.cheap && p.met); }) : !!(ev.cheap && ev.met);
      if (due && fareOnly) {
        const fare0 = t.type === 'combo' ? Math.max.apply(null, ev.parts.filter(function (p) { return p.cheap; }).map(function (p) { return p.fare0 || 0; })) : t.fare0;
        if ((t.fareWait || 0) < 3) {
          t.fareWait = (t.fareWait || 0) + 1; t.deadline = ymPair(ym + 1); t.progress = ev;
          t.graced = '指标已达标，但票价低于任务发布时，本月不计。10 公里票价调回 ' + fareWords(fare0 * 0.95) + ' 以上，下月重新结算';
          continue;
        }
        t.fareWhy = '指标已达标，但到期时票价仍低于任务发布时（现 ' + fareWords(Tasks.fareLevel(g.econ.fare)) + ' / 发布时 ' + fareWords(fare0) + '），按规则不计';
      }
      if(!fareOnly&&['zoneCong','stationCrowd','ridership','facShare'].includes(t.type)){
        const near=this.nearTrafficThreshold(t,g,ev),basis=Tasks.basisOf(t);
        if(near&&!g.model.trafficVerified(basis)&&!this.reviewSafe(t,g)){
          this.startTrafficReview(t,g);
          if(!g.model.reviewComplete(basis)){g.taskRecheckYM=ym;t.graced='交通目标正在复核，暂不奖惩';continue;}
          // Strict stability or a clear margin outside recent variation permits a decision.
          // 最多顺延 3 个月：结果一直在门槛附近时按当前结果结算，任务不会无限挂着，也不会每月多算一轮复核
          if(!this.reviewSafe(t,g)&&(t.graceN=(t.graceN||0)+1)<=3){
            if(ym>=U.ymIndex(t.deadline[0],t.deadline[1])){const n=ym+1;t.deadline=[Math.floor(n/12),n%12+1];}
            t.graced='交通结果仍有波动，保留进度并顺延到期评估';continue;
          }
        }
      }
      // 复合任务要结算时先确认交通结果已稳定，不因一时波动拿到奖励或判定未达成
      if(comboTraffic&&!fareOnly&&(ev.ok||ym>=U.ymIndex(t.deadline[0],t.deadline[1]))&&!g.model.trafficVerified('avg')){
        this.startTrafficReview({basis:'avg',type:'ridership'},g);
        if(!g.model.reviewComplete('avg')){g.taskRecheckYM=ym;t.graced='交通目标正在复核，暂不奖惩';continue;}
      }
      delete t.graced;delete t.graceN;
      t.evaluatedYM=ym;
      t.progress = ev;
      let complete = false;
      if(t.type==='zoneCong'&&t.metric==='carShare'){
        t.samples=t.samples||[];if(!ev.cheap&&(!t.samples.length||t.samples[t.samples.length-1].ym!==ym))t.samples.push({ym,value:ev.sample});
        t.samples=t.samples.filter(x=>x.ym>=ym-2).slice(-3);const average=t.samples.length?t.samples.reduce((v,x)=>v+x.value,0)/t.samples.length:ev.sample;
        ev.ok=!ev.cheap&&t.samples.length>=3&&average<=t.target;ev.text+=' · 近 '+t.samples.length+' 个月平均 '+U.fmtPct(average,1);
        t.streak=t.samples.length;complete=ev.ok;
      }
      if (ev.ok) {
        t.streak = (t.streak || 0) + 1;
        if (!t.sustain || t.streak >= t.sustain) complete = true;
      } else if (!transit) t.streak = 0;
      if (!complete && transit && ym >= U.ymIndex(t.deadline[0], t.deadline[1])) {
        const nd = ym + 1; t.deadline = [Math.floor(nd / 12), nd % 12 + 1]; t.graced = '交通模型升级过渡：期限顺延 1 个月';
      }
      if (complete || ym >= U.ymIndex(t.deadline[0], t.deadline[1])) this.rememberPlace(t, g, complete);
      if (complete) {
        out.push(this.complete(t, g, ev, 1));
      } else if (t.type === 'combo' && ev.coreOk && !ev.dead && ym >= U.ymIndex(t.deadline[0], t.deadline[1])) {
        // 部分完成：主体目标已达成、其余未达成。按比例给奖励，不扣拨款
        t.status = 'done'; t.partial = true; t.closedAt = [y, m]; t.reward *= Tasks.PARTIAL;
        this.active.splice(this.active.indexOf(t), 1); this.done.push(t);
        if (challenge) { g.econ.income('reward', t.reward); g.econ.log('reward', t.reward, 'gen', '任务奖励（部分完成）：' + t.title, { y: y, m: m, d: 1 }); g.econ.mods.push({ kind: 'sat', delta: 2, until: ym + 5, reason: '部分完成任务「' + t.title + '」' }); }
        if (t.kind === 'opt' && t.coolKey) { this.cool = this.cool || {}; this.cool[t.coolKey] = ym + 36; }
        out.push({ type: 'done', task: t });
      } else if (t.optional && ym >= U.ymIndex(t.deadline[0], t.deadline[1])) {
        // 可选任务（风景区）到期未完成：不记失败、不罚，移入调整记录
        t.status = 'lapsed'; t.closedAt = [y, m]; this.active.splice(this.active.indexOf(t), 1);
        this.adjusted = this.adjusted || []; this.adjusted.push(t); this.adjusted = this.adjusted.slice(-60);
        out.push({ type: 'lapsed', task: t });
      } else if (ym >= U.ymIndex(t.deadline[0], t.deadline[1]) || (t.kind === 'opt' && ev.dead)) {
        t.status = 'failed'; t.closedAt = [y, m]; if (ev.dead) t.why = ev.text;
        this.active.splice(this.active.indexOf(t), 1); this.failed.push(t);
        if (t.kind === 'opt') {
          // 可选挑战：自己选的目标，未完成只小幅降低满意度，不打折拨款
          if (challenge) g.econ.mods.push({ kind: 'sat', delta: -2, until: ym + 5, reason: '可选挑战未完成：' + t.title });
          if (t.coolKey) { this.cool = this.cool || {}; this.cool[t.coolKey] = ym + 24; }
        } else if (challenge) {
          const P = Tasks.failPenalty(t);
          g.econ.mods.push({ kind: 'grant', factor: P.factor, until: ym + P.months - 1, reason: '任务未完成：' + t.title });
          g.econ.mods.push({ kind: 'sat', delta: P.sat, until: ym + P.months - 1, reason: '任务未完成：' + t.title });
        }
        out.push({ type: 'failed', task: t });
      }
    }
    if (this.done.length > 60) this.done.splice(0, this.done.length - 60);
    if (this.failed.length > 60) this.failed.splice(0, this.failed.length - 60);
    return out;
  };

  Tasks.prototype.rememberPlace = function (t, g, complete) {
    if (t.kind === 'opt') return;
    if (!t.spot) t.spot = Tasks.spotOf(t, g) || undefined;
    if (t.kind === 'dyn') Tasks.coolDown(this, t, g.ym(), complete);
    else Tasks.coolPlace(this, t, g.ym(), complete);
  };
  Tasks.prototype.complete = function (t, g, result, day) {
    const y = g.clock.y, m = g.clock.m, ym = U.ymIndex(y, m);
    t.progress = result; t.status = 'done'; t.closedAt = [y, m]; t.evaluatedYM = ym;
    this.active.splice(this.active.indexOf(t), 1);
    this.done.push(t);
    if (this.done.length > 60) this.done.shift();
    this.cool = this.cool || {};
    this.rememberPlace(t, g, true);
    if (t.kind === 'opt' && t.coolKey) this.cool[t.coolKey] = ym + 36;
    if (g.econ.mode === 'challenge') {
      g.econ.income('reward', t.reward);
      g.econ.log('reward', t.reward, 'gen', '任务奖励：' + t.title, { y: y, m: m, d: day });
      g.econ.mods.push({ kind: 'sat', delta: 4, until: ym + 5, reason: '完成任务「' + t.title + '」' });
    }
    return { type: 'done', task: t };
  };

  // 只即时结算不依赖客流与连续月份的连通任务。
  Tasks.prototype.quickCheck = function (g) {
    const out = [];
    if (g.tutorial) return out;
    for (const t of this.active.slice()) {
      if (t.sustain || (t.type !== 'connect' && t.type !== 'budgetConnect')) continue;
      let ev;
      try { ev = this.evaluate(t, g); }
      catch (error) { console.error('连通任务即时评估失败', error); continue; }
      if (ev.ok && !ev.cheap) out.push(this.complete(t, g, ev, g.clock.d));
    }
    return out;
  };

  // 金额目标使用两位有效数字，最大取整单位为千。早期伦敦币值较小，需要保留低于千的造价目标与合同估价。
  Tasks.roundMoney = function (v) {
    if (!(v > 0)) return 0;
    const p = Math.min(1000, Math.pow(10, Math.floor(Math.log10(v)) - 1));
    return +(Math.max(p, Math.round(v / p) * p)).toPrecision(6);
  };
  Tasks.prototype.generate = function (g) {
    const y = g.clock.y, m = g.clock.m, model = g.model, city = g.city;
    const acc = model.net ? model.net.acc : null;
    const ci = g.econ.costIndex(y) * (CFG.economy.rewardScale || 1);   // 奖励按本城价格水平
    const dl = function (months) { const t = U.ymIndex(y, m) + months; return [Math.floor(t / 12), t % 12 + 1]; };
    const rng = new U.RNG((y * 13 + m * 7 + this.seq * 31) >>> 0);
    const ym = U.ymIndex(y, m);
    const cool = this.cool || (this.cool = {});
    const active = this.active;
    const availablePlace = (x, y) => !this.targeted(x, y, g) && !this.cooledNear(x, y, ym);
    const named = title => !(cool['title:' + title] > ym) && !active.some(t => t.title === title);
    const free = function (key, type) { return !(cool[key] > ym) && !(cool['type:' + type] > ym) && !active.some(function (t) { return (t.coolKey || t.type) === key; }); };
    // 线路、车站拥挤类任务（v2.5 玩家反馈：太多）：明显过载才发布，全局冷却 3 年且同时只有一个；日常的过载由地铁芯提醒处理
    const crowdFree = !(cool.crowd > ym) && !active.some(function (t) { return t.type === 'stationCrowd' || t.type === 'lineCrowd'; });
    const cands = [], G = Tasks.gate(g), rp = Tasks.ramp(g, this), ease = 0.6 + 0.4 * rp;
    // 可替代需求不足、尚未有可用地铁服务的片区优先发布覆盖任务。

    // 拥堵热点（排除近期出过任务的片区）
    let worst=-1,bestPotential=0;
    const zoneOpen=function(z){let n=0,o=0;for(const c of model.zoneCells[z]){if(city.landFrac[c]<.5)continue;n++;if(!city.cellLocked(c)&&!city.regions[city.region[c]].scenic)o++;}return n>0&&o>=n/2;};   // 可建设范围按格判断（v2.2）
    if(model.trafficReady())for(let z=0;z<model.Z;z++){
      if(model.zPop[z]+model.zJobs[z]<3000||!zoneOpen(z)||!free('cong:'+z,'zoneCong')||g.zoneCong(z)<1.25||!availablePlace(model.zCx[z],model.zCy[z])||!named('减少「'+g.zoneName(z)+'」高峰汽车出行'))continue;
      if(G.dist(model.zCx[z],model.zCy[z])>12 || !G.check({ zone: z }).ok)continue;   // v2.4：离运营车站 3 km 以上的片区不发拥堵任务（偏远片区靠覆盖任务）
      const v=model.zoneTraffic(z),potential=model.zoneOpportunity(z)/Math.max(1,v.trips);
      if(v.trips>100&&potential>=.06&&potential>bestPotential){worst=z;bestPotential=potential;}
    }
    if(worst>=0 && rp>=0.5){
      // v2.4 平衡：降幅按可替代的出行估算、更温和（一两处车站或一段延伸就能做到），票价低于发布时的月份不计
      const v=model.zoneTraffic(worst),drop=U.clamp(bestPotential*.12,.008,.03)*ease,target=Math.max(0,v.carShare-drop);
      cands.push({type:'zoneCong',metric:'carShare',coolKey:'cong:'+worst,zone:worst,spot:{x:model.zCx[worst],y:model.zCy[worst]},start:v.carShare,target,sustain:3,samples:[],fare0:Tasks.fareLevel(g.econ.fare),title:'减少「'+g.zoneName(worst)+'」高峰汽车出行',desc:'让工作日早高峰汽车出行占比降低 '+(drop*100).toFixed(1)+' 个百分点（近 3 个月平均，降价月份不计）。',months:30,reward:90000*ci});   // v3.0：高难任务提高奖励
    }
    // 覆盖空白：在人口足够且可达的片区中，优先选择人口多、离线网近的片区。
    if (acc) {
      let best = -1, bp = 0, bs = 0;
      for (let z = 0; z < model.Z; z++) {
        const p = model.zPop[z];
        if (p <= 12000 || acc.zCov[z] >= 0.2 || !zoneOpen(z) || !free('cov:' + z, 'zoneCov') || !availablePlace(model.zCx[z], model.zCy[z]) || !named('为「' + g.zoneName(z) + '」提供地铁服务')) continue;
        const ck = G.check({ zone: z }), s = p * ck.w;
        if (ck.ok && s > bs) { bs = s; bp = p; best = z; }
      }
      if (best >= 0) {
        const target = Math.round((0.35 + 0.15 * rp) * 20) / 20;
        cands.push({ type: 'zoneCov', coolKey: 'cov:' + best, zone: best, spot: { x: model.zCx[best], y: model.zCy[best] }, target: target, title: '为「' + g.zoneName(best) + '」提供地铁服务', desc: '该片区人口约 ' + U.fmtPeople(bp) + '，尚无地铁覆盖。使片区 ' + Math.round(target * 100) + '% 以上的居民与岗位步行 15 分钟可达车站。', months: 30, reward: 50000 * ci });
      }
    }
    // 车站拥挤
    const sdw = model.stDailyWk || model.stDaily;
    if (sdw && !model.dailyStale && g.compiled.stations.length && crowdFree) {
      let bs = -1, br = 0;
      g.compiled.stations.forEach(function (s, i) {
        if (!free('st:' + s.id, 'stationCrowd') || !stationPeakRunning(g, i)) return;
        const r = sdw.peak[i] / CFG.metro.stationCap[s.size];
        if (r > br) { br = r; bs = i; }
      });
      if (bs >= 0 && br > 1.2) {
        const s = g.compiled.stations[bs];
        cands.push({ type: 'stationCrowd', coolKey: 'st:' + s.id, station: s.id, start: br, target: 0.9, title: '缓解「' + s.name + '」车站拥挤', desc: '工作日高峰时段车站负荷已达 ' + U.fmtPct(br, 0) + '。可升级车站或分流客流，使高峰负荷降至 90% 以下。统计口径：工作日高峰小时。', months: 12, reward: 30000 * ci });
      }
    }
    // 客流增长（v2.3 平衡）：线网越成熟（分担率越高）增幅要求越低——成熟线网两年再涨两成很难做到
    if (model.daily && model.daily.metro > 20000 && free('ridership', 'ridership')) {
      const sh = model.daily.metroShare || 0, gr = Math.round((sh < 0.08 ? 0.2 : (sh < 0.15 ? 0.12 : 0.08)) * ease * 100) / 100;
      cands.push({ type: 'ridership', basis: 'avg', target: Math.round(model.daily.metro * (1 + gr) / 1000) * 1000, title: '提升地铁客运量', desc: '在期限内使日均地铁客运量较当前提高 ' + Math.round(gr * 100) + '%（可通过新线、延长线、换乘或调整票价实现）。统计口径：周平均（5 个工作日 + 2 个周末日）。', months: 24, reward: 40000 * ci });
    }
    // 经营：票款覆盖（v2.3 平衡）：目标按近 3 个月的实际覆盖率提高一截（最高 70%），不再一律要求 70%——
    // 大线网的运营费用随物价上涨，票价长期不变时覆盖率很低，固定目标几乎必然失败、反复扣减拨款
    if (g.econ.mode === 'challenge' && rp >= 0.5 && model.daily && model.daily.metro > 50000 && free('recovery', 'recovery')) {
      const L3 = g.econ.ledger.slice(-3), cur = L3.length ? L3.reduce(function (a, r) { return a + Tasks.recoveryOf(r); }, 0) / L3.length : 0;
      if (cur >= 0.15 && cur < 0.66) {
        const tg = Math.min(0.7, Math.ceil((cur + Math.max(0.06, cur * 0.25)) * 20) / 20);
        cands.push({ type: 'recovery', target: tg, start: cur, sustain: 3, title: '改善运营收支', desc: '连续 3 个月（票款 + 车站商业收入）不低于运营费用的 ' + Math.round(tg * 100) + '%（近 3 个月约 ' + Math.round(cur * 100) + '%）。可以适当提高票价、开发高客流车站的商业空间，或提高线路客流强度。', months: 24, reward: 40000 * ci });
      }
    }
    // 重要设施的地铁接驳（v1.9）：到访量较大、乘地铁比例很低的设施；口径按设施类型（见 Tasks.facBasis）
    if (model.facDaily && model.fn && model.net && g.compiled.stations.length) {
      let best = null;
      for (const f of model.fn.list) {
        if (!free('fac:' + f.id, 'facShare') || !Tasks.facServable(g.city, f, model.fn) || (f.close != null && f.close < g.clock.y + 3) || (!f.ext && (G.dist(f.x, f.y) > G.reach || !availablePlace(f.x, f.y)))) continue;
        const basis = Tasks.facBasis(f), r = Tasks.facShareOf(model, f, basis);
        if (!r || r.vol < 3000 || r.share > 0.12) continue;
        const dNet = f.ext ? 0 : Tasks.netDist(g, f.x, f.y), score = r.vol * (1 - r.share) / (1 + dNet / 16);
        if (!best || score > best.score) best = { f: f, basis: basis, r: r, score: score, dNet: dNet };
      }
      if (best && best.dNet > 16 && !best.f.ext) {
        // v2.4 玩家反馈（番禺、香港新界等）：离线网 4 km 以上的设施，要把比例拉上去只能修好几条又长又空的线。
        // 改为「接入线网」：在设施附近设站并连到现有线网即可完成，偏远地区一条线就够
        const f = best.f, C0 = g.compiled; let ns = -1, nd = Infinity;
        C0.stations.forEach(function (s, i) { if (C0.serviced[i]) { const d = U.dist(s.x, s.y, f.x, f.y); if (d < nd) { nd = d; ns = i; } } });
        if (ns >= 0) {
          const s = C0.stations[ns], lm = f.lmK >= 0 ? CM.DATA.landmarks[f.lmK] : null, r = (lm ? Math.max(lm.w || 0, lm.d || 0) / 2 / CFG.CELL_M : Math.max(0.5, f.r || 0)) + 2.4;
          cands.push({ type: 'connect', coolKey: 'fac:' + f.id, fac: f.id, spot: { x: f.x, y: f.y }, title: '把「' + f.name + '」接入线网',
            desc: f.name + '每天约 ' + U.fmtPeople(best.r.vol) + ' 人次到访，离最近的车站约 ' + U.fmtNum(nd * CFG.CELL_M / 1000, 1) + ' km。在附近设站并接入线网即可。',
            anchors: [{ name: f.name, x: f.x, y: f.y, r: +r.toFixed(2) }, { name: s.name, x: s.x, y: s.y, r: 1.2 }], months: 36, reward: 35000 * ci });
        }
      } else if (best) {
        // 目标（v2.4 平衡）：比现在高 6 个百分点，并争取达到「全市分担率 + 5 个百分点」（上限 16%）；离线网 2 km 以上的只要求高 5 个百分点
        const cs = (model.daily && model.daily.metroShare) || 0;
        const f = best.f, raw = best.dNet > 8 ? best.r.share + 0.05 : Math.max(best.r.share + 0.06, Math.min(0.16, cs + 0.05)), target = Math.round((best.r.share + (raw - best.r.share) * ease) * 100) / 100;
        const what = f.T.hub ? '接驳出行' : '到访出行';
        cands.push({ type: 'facShare', coolKey: 'fac:' + f.id, fac: f.id, spot: f.ext ? undefined : { x: f.x, y: f.y }, basis: best.basis, start: best.r.share, target: target, fare0: Tasks.fareLevel(g.econ.fare), title: '地铁服务「' + f.name + '」',
          desc: f.name + '每天约 ' + U.fmtPeople(best.r.vol) + ' 人次' + what + '，乘地铁只有 ' + U.fmtPct(best.r.share, 0) + '，目标 ' + U.fmtPct(target, 0) + '（降价月份不计）。',
          months: 30, reward: 65000 * ci });
      }
    }
    // 本城专属动态任务（D.dynTasks）：在年份窗口内各发布一次，已满足的不发布
    const self = this;
    for (const tp0 of (D.dynTasks || []).concat(CM.Eras ? CM.Eras.goals() : [])) {   // v2.2：历史阶段目标同样作为本城任务，在阶段时间内发布
      const tp = Tasks.withPlan(g, tp0);
      if (this.issued['dyn:' + tp.id] || ym < U.ymIndex(tp.from[0], tp.from[1]) || ym > U.ymIndex(tp.to[0], tp.to[1]) || !free('city:' + tp.id, tp.type)) continue;
      if (!Tasks.anchorsOpenBy(g, tp.anchors, ym + (tp.months || 0))) continue;   // 地点在截止前开放不了：先不发布，等开放临近时再发
      const c = Object.assign({ coolKey: 'city:' + tp.id, cityId: tp.id }, JSON.parse(JSON.stringify(tp)), { reward: tp.reward * ci });
      delete c.from; delete c.to; delete c.id;
      const dup = this.dupOf(c); if (dup) { if (dup.done) this.issued['dyn:' + tp.id] = 1; continue; }
      const ck = G.check(c);
      if (!ck.ok || this.evaluate(c, g).ok) continue;
      c.w = 2 * ck.w; cands.push(c);   // 权重加倍，让本城任务更常出现
    }
    if (!cands.length) return null;
    // 按权重抽取：带地点的任务离线网越远权重越小（见 Tasks.gate），近处、容易的先出现
    let tot = 0; for (const x of cands) { if (x.w == null) x.w = G.check(x).w; tot += x.w; }
    let pick = rng.next() * tot, c = cands[cands.length - 1];
    for (const x of cands) { pick -= x.w; if (pick < 0) { c = x; break; } }
    delete c.w;
    if (c.cityId) self.issued['dyn:' + c.cityId] = 1;
    if (c.type === 'stationCrowd') cool.crowd = ym + 36;
    const t = Object.assign({ id: 'd' + (this.seq++), kind: 'dyn', status: 'active', issuedAt: [y, m], deadline: dl(Math.max(Tasks.PACE.dynMin, Math.round((c.months || 24) * Tasks.PACE.dynScale))), streak: 0 }, c);
    return Tasks.prepare(t, g, true);
  };

  Tasks.prototype.rebaseCongestion=function(g){
    for(const t of this.active.slice())if(t.type==='zoneCong'&&t.metric!=='carShare'){
      const v=g.model.zoneTraffic(t.zone),room=g.model.zoneOpportunity(t.zone)/Math.max(1,v.trips);
      t.legacyGoal={start:t.start,target:t.target,streak:t.streak||0,title:t.title,desc:t.desc,deadline:t.deadline&&t.deadline.slice(),progress:t.progress?JSON.parse(JSON.stringify(t.progress)):null};t.metric='carShare';t.start=v.carShare;t.target=Math.max(0,v.carShare-Math.min(.025,room*.15));t.samples=[];t.streak=0;
      t.title='减少「'+g.zoneName(t.zone)+'」高峰汽车出行';t.desc='降低片区工作日早高峰汽车出行占比，按最近 3 个月平均值评估。旧指标与历史进度已保留，重新建立评估窗口。';
      if(room<.015){
        const cov=g.model.net.acc.zCov[t.zone]||0;
        if(cov<.8){t.type='zoneCov';delete t.metric;delete t.sustain;t.start=cov;t.target=Math.min(.85,cov+.15);t.title='改善「'+g.zoneName(t.zone)+'」地铁覆盖';t.desc='该片区当前缺少可替代的地铁行程，目标调整为增加地铁覆盖，不要求消除无法控制的过境拥堵。';}
        else{t.status='withdrawn';t.closedAt=[g.clock.y,g.clock.m];this.active.splice(this.active.indexOf(t),1);this.adjusted=this.adjusted||[];this.adjusted.push(t);this.adjusted=this.adjusted.slice(-60);continue;}
      }
      const ym=Math.max(g.ym(),U.ymIndex(t.deadline[0],t.deadline[1]))+3;t.deadline=[Math.floor(ym/12),ym%12+1];t.graced='交通模型更新：旧目标保留在历史记录中，期限延长 3 个月，新评估窗口内不立即判失败';
    }
  };

  // ======================== 可选挑战与城市策略难题（v2.3） ========================
  // 中后期不再只是「再修一条线」：系统按现状提出可选挑战（既有线路扩容、拥挤区段优化、财政压力下的网络调整、
  // 城市扩张后老线路效率下降），各城市另有按年代出现的策略难题（如香港的高成本与跨海）。玩家自行接受或忽略；
  // 接受后才开始计时，完成奖励更高，未完成只小幅降低满意度、不打折拨款。同时最多 2 个待选、2 个进行中
  Tasks.OPT = { offers: 2, active: 2, life: 6, every: 6, firstAfter: 24 };
  Tasks.THEME = { lineCrowd: '拥挤区段优化', fiscal: '财政压力下的网络调整', lineEff: '城市扩张后的老线路' };
  // 城市策略难题的锚点按地名取位置（D.places），找不到地名的难题不发布
  const placeAt = function (name) { const p = (D.places || []).find(function (q) { return q[0] === name; }); return p ? { x: p[1], y: p[2] } : null; };
  // 预算挑战：按各锚点之间直线修地下线的粗略造价（含过水附加与 M 型车站）乘以 budgetX 作为预算，逼玩家权衡形式、走向与站数
  // 金额目标取整（v2.9 修复）：一万以上（内部单位）照旧取整到千，更小的保留两位有效数字。以前一律取整到千，
  // 早期伦敦、开罗等物价低的城市，线路造价目标和预算会变成 0（「目标 ≤ 0 万英镑」），政府合同的估算投资也是 0
  Tasks.roundMoney = function (v) {
    if (!(v > 0)) return 0;
    const p = Math.min(1000, Math.pow(10, Math.floor(Math.log10(v)) - 1));
    return +(Math.max(p, Math.round(v / p) * p)).toPrecision(6);
  };
  Tasks.estimateLink = function (g, anchors) {
    const y = g.clock.y, ci = g.econ.costIndex(y), city = g.city, Cst = CFG.cost;
    let km = 0, waterKm = 0;
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1], b = anchors[i], d = U.dist(a.x, a.y, b.x, b.y), n = Math.max(2, Math.ceil(d * 2));
      km += d * CFG.CELL_M / 1000;
      for (let k = 0; k < n; k++) { const c = city.cellAt(a.x + (b.x - a.x) * (k + 0.5) / n, a.y + (b.y - a.y) * (k + 0.5) / n); if (c >= 0 && city.lu[c] === CM.LU.WATER) waterKm += d / n * CFG.CELL_M / 1000; }
    }
    return ci * (km * Cst.trackPerKm.underground + waterKm * Cst.riverPerKm.underground + anchors.length * Cst.station.underground.M);
  };
  Tasks.prototype.offerCands = function (g) {
    const out = [], ym = g.ym(), y = g.clock.y, self = this, cool = this.cool || (this.cool = {});
    let G = null;
    const gm = g.econ.grantQuota(y, g.clock.m);   // 基础月拨款已使用本城货币
    const free = function (key) { return !(cool['opt:' + key] > ym) && !self.active.some(function (t) { return t.coolKey === 'opt:' + key; }) && !(self.offers || []).some(function (o) { return o.coolKey === 'opt:' + key; }); };
    // 城市策略难题（D.scenarios）：在年份窗口内各提出一次
    for (const s0 of D.scenarios || []) {
      const s = Tasks.withPlan(g, s0);
      if (this.issued['sc:' + s.id] || ym < U.ymIndex(s.from[0], s.from[1]) || ym > U.ymIndex(s.to[0], s.to[1])) continue;
      if (s.challengeOnly && g.econ.mode !== 'challenge') continue;
      if (!Tasks.anchorsOpenBy(g, s.anchors, ym + (s.months || 48))) continue;
      const c = { type: s.type, scenario: s.id, theme: s.theme, title: s.title, desc: s.desc, tips: s.tips || [], months: s.months || 48, reward: (s.rewardMonths || 3) * gm, coolKey: 'opt:sc:' + s.id };
      if (s.type === 'combo') {
        c.parts = s.parts;
        const an0 = (s.anchors || []).map(function (a) { if (!Array.isArray(a)) return a; const p = Tasks.placeOf(a[0]); return p ? { name: a[0], x: p.x, y: p.y, r: a[1] || 3 } : null; });
        if (an0.some(function (a) { return !a; })) continue;
        if (an0.length) c.anchors = an0;
        if (s.parts.some(function (p) { return p.regions && p.kind === 'reach' && !g.city.regions.some(function (r, k) { return p.regions.indexOf(r.id) >= 0 && g.city.regionOpen[k]; }); })) continue;
        Tasks.prepare(c, g);
        if (this.evaluate(c, g).ok) continue;
      } else if (s.type === 'budgetConnect') {
        // 锚点：[地名, 半径]（按 D.places 定位）或带坐标的对象
        const an = s.anchors.map(function (a) { if (!Array.isArray(a)) return a; const p = placeAt(a[0]); return p ? { name: a[0], x: p.x, y: p.y, r: a[1] || 3 } : null; });
        if (an.some(function (a) { return !a; })) continue;
        c.anchors = an; c.budget = Tasks.roundMoney(Tasks.estimateLink(g, an) * (s.budgetX || 1.2));
        if (this.evaluate(Object.assign({}, c, { type: 'connect' }), g).ok) continue;
      } else if (s.type === 'regionCov') {
        c.regions = s.regions; c.areaName = s.areaName; c.target = s.target;
        if (!g.city.regions.some(function (r, k) { return s.regions.indexOf(r.id) >= 0 && g.city.regionOpen[k]; })) continue;
        if (Tasks.regionCoverage(g, s.regions) >= s.target * 0.9) continue;
      } else if (s.type === 'xferHub') {
        c.target = s.target; if (this.evaluate(c, g).ok) continue;
      } else if (s.type === 'lineCrowd') {
        const lines = s.line === 'inherited' ? Object.keys(g.net.lines).filter(function (lid) { return M_inherited(g, lid); }) : null;
        const cr = Tasks.crowdOf(g).find(function (x) { return !lines || lines.indexOf(x.lid) >= 0; });
        if (!cr || cr.lf < (s.minLF || 0.95)) continue;
        Object.assign(c, { line: cr.lid, start: cr.lf, target: s.target || 1, sustain: 3, title: s.title.replace('{line}', g.net.lines[cr.lid].name) });
      } else continue;
      const dup = this.dupOf(c); if (dup) { if (dup.done) this.issued['sc:' + s.id] = 1; continue; }
      if (!(G || (G = Tasks.gate(g))).check(Object.assign({ gate: s.gate }, c), 1.3).ok) continue;
      out.push(c);
    }
    // 通用中后期挑战（开局两年后）：只针对现有线网
    const crowd = Tasks.crowdOf(g);
    const top = crowd[0];
    const crowdFree = !(cool.crowd > ym) && !self.active.some(function (t) { return t.type === 'stationCrowd' || t.type === 'lineCrowd'; }) && !(self.offers || []).some(function (o) { return o.type === 'lineCrowd'; });   // 同动态任务：明显过载才提出，全局冷却 3 年
    if (top && top.lf > 1.2 && crowdFree && free('crowd:' + top.lid)) {
      const L = g.net.lines[top.lid], S = g.model.net.C.stations, a = S[top.a], b = S[top.b];
      out.push({ type: 'lineCrowd', line: top.lid, start: top.lf, target: 1, sustain: 3, coolKey: 'opt:crowd:' + top.lid, months: 24, reward: 2 * gm, theme: Tasks.THEME.lineCrowd,
        title: '疏解「' + L.name + '」最拥挤区段', desc: L.name + ' 的「' + (a ? a.name : '') + '—' + (b ? b.name : '') + '」早高峰满载率已达 ' + U.fmtPct(top.lf, 0) + '，列车已挤不下。不修新线也可以：把它降到 100% 以下并保持 3 个月。',
        tips: ['升级沿线最小的车站，列车就能加长编组', '在拥挤区段两端做换乘，引导乘客换到平行线路', '把支线拆成独立线路或减少共线，空出班次'] });
    }
    if (g.econ.mode === 'challenge' && free('fiscal')) {
      const last = g.econ.ledger[g.econ.ledger.length - 1];
      const recovery = last && last.ops > 0 ? last.fare / last.ops : 1;
      const km = CM.Milestones ? CM.Milestones.netInfo(g).km : 0;
      if (recovery < 0.6 && km > 15) {
        const target = Math.min(0.9, Math.round((recovery + 0.15) * 20) / 20);
        const kmCap = Math.round(km * 1.05 * 10) / 10;
        out.push({ type: 'fiscal', target, sustain: 3, kmCap, coolKey: 'opt:fiscal', months: 30, reward: 3 * gm, theme: Tasks.THEME.fiscal,
          title: '不扩张也能减亏', desc: '票款只够付 ' + U.fmtPct(recovery, 0) + ' 的运营费。在线网不超过 ' + U.fmtNum(kmCap, 1) + ' km 的前提下，把票款覆盖率提高到 ' + U.fmtPct(target, 0) + ' 并保持 3 个月。',
          tips: ['调整票价：小步上调起步价或每段加价，观察客流', '缩小客流很少的车站规模，节省车站运营费（缩站不退款）', '用换乘和贯通把客流引到已有线路上，而不是再修新线'] });
      }
    }
    // 城市扩张后的老线路：与 2–4 年前（线路长度基本不变）相比，每公里客流下降 15% 以上
    const stats = Tasks.lineStats(g), hist = this.lineHist || {};
    for (const lid in hist) {
      const s = stats.get(lid), L = g.net.lines[lid]; if (!s || !L || !free('eff:' + lid)) continue;
      const old = hist[lid].find(function (r) { return ym - r[0] >= 24 && ym - r[0] <= 48 && Math.abs(r[2] - s.km) <= Math.max(0.5, r[2] * 0.05); });
      if (!old || old[1] <= 0) continue;
      const was = old[1] / Math.max(0.1, old[2]), now = s.riders / Math.max(0.1, s.km);
      if (now >= was * 0.85) continue;
      out.push({ type: 'lineEff', line: lid, start: now, target: Math.round(was * 0.95), coolKey: 'opt:eff:' + lid, months: 36, reward: 3 * gm, modes: true, theme: Tasks.THEME.lineEff,
        title: '让「' + L.name + '」重新跑满', desc: '城市向新区扩张后，' + L.name + ' 每公里的日客流从 ' + U.fmtPeople(was) + ' 降到 ' + U.fmtPeople(now) + ' 人次。线路还在，客流却搬走了：让它回到 ' + U.fmtPeople(was * 0.95) + ' 人次以上。接受时可以按市郊线路考核，改为看沿线居民的覆盖率。',
        tips: ['打开「城市发展」图层，看人口与岗位搬到了哪里', '把线路端点延伸到新开发的片区，或与通往新区的线路换乘', '与相邻线路贯通，减少换乘，让老线路承接新的客流'] });
      break;
    }
    return out;
  };
  const M_inherited = function (g, lid) { for (const id in g.net.segments) { const s = g.net.segments[id]; if (s.line === lid && s.inherited) return true; } return false; };
  // 每月：记录各线路客流（每年 1 月一次），按节奏提出可选挑战，清理过期的待选
  Tasks.prototype.offerMonthly = function (g) {
    const out = [], ym = g.ym(), O = Tasks.OPT;
    if (D.noDynTasks || !g.model.trafficReady()) return out;
    if (g.clock.m === 1) {
      const hist = this.lineHist || (this.lineHist = {});
      Tasks.lineStats(g).forEach(function (s, lid) { const a = hist[lid] || (hist[lid] = []); if (!a.length || a[a.length - 1][0] !== ym) a.push([ym, Math.round(s.riders), +s.km.toFixed(2)]); if (a.length > 8) a.shift(); });
      for (const lid in hist) if (!g.net.lines[lid]) delete hist[lid];
    }
    this.offers = (this.offers || []).filter(function (o) { return ym <= o.expiresYM; });
    if (!this.nextOffer) this.nextOffer = ym + O.firstAfter;
    if (ym < this.nextOffer || this.offers.length >= O.offers || this.active.filter(function (t) { return t.kind === 'opt'; }).length >= O.active) return out;
    const cands = this.offerCands(g); if (!cands.length) return out;
    // 城市策略难题优先，其余按出现顺序（越靠前越紧迫）
    const c = cands.find(function (x) { return x.scenario; }) || cands[0];
    const o = Object.assign({ id: 'o' + (this.seq++), kind: 'offer', offeredAt: [g.clock.y, g.clock.m], expiresYM: ym + O.life }, c);
    if (o.scenario) this.issued['sc:' + o.scenario] = 1;
    if (o.type === 'lineCrowd') { this.cool = this.cool || {}; this.cool.crowd = ym + 36; }
    this.offers.push(o); this.nextOffer = ym + O.every;
    out.push({ type: 'offer', task: o });
    return out;
  };
  // 接受：从现在开始计时；预算类记下当前累计建设支出
  Tasks.prototype.accept = function (g, id, opts) {
    const k = (this.offers || []).findIndex(function (o) { return o.id === id; }); if (k < 0) return null;
    const o = this.offers[k], suburban = o.type === 'lineEff' && opts && opts.mode === 'suburban';
    const coverage = suburban ? Tasks.lineCoverage(g, o.line) : 0;
    if (suburban && coverage >= Tasks.SUBURBAN_COVERAGE_LIMIT) return null;
    this.offers.splice(k, 1);
    const ym = g.ym(), dl = ym + o.months;
    const t = Object.assign({}, o, { kind: 'opt', status: 'active', issuedAt: [g.clock.y, g.clock.m], deadline: [Math.floor(dl / 12), dl % 12 + 1], streak: 0 });
    delete t.expiresYM; delete t.modes;
    // 「重新跑满」（v3.0 玩家建议）：玩家选市区线路（每公里客流，原判定）或市郊线路（沿线覆盖率，目标为接受时 +12 个百分点，最高 90%）
    if (suburban) {
      const L = g.net.lines[t.line];
      t.mode = 'suburban'; t.start = coverage; t.target = Math.min(Tasks.SUBURBAN_COVERAGE_LIMIT, coverage + 0.12);
      t.desc = (L ? L.name : '这条线') + ' 按市郊线路考核：沿线 1.5 km 内步行 15 分钟可达本线车站的居民从 ' + U.fmtPct(coverage, 1) + ' 提高到 ' + U.fmtPct(t.target, 1) + '。';
      t.tips = ['在沿线居民多、离车站远的地方加站（在轨道上插站）', '把车站挪到住宅区中心，出入口离居民更近', '延伸到线路末端附近新开发的居住区'];
    } else if (t.type === 'lineEff') t.mode = 'urban';
    if (t.type === 'combo') for (const p of t.parts) { delete p.base0; delete p.fare0; delete p.spent0; delete p.y0; if (p.gain || p.drop) delete p.target; }
    Tasks.prepare(t, g, true);
    this.active.push(t);
    return t;
  };
  Tasks.prototype.decline = function (g, id) {
    const k = (this.offers || []).findIndex(function (o) { return o.id === id; }); if (k < 0) return;
    const o = this.offers.splice(k, 1)[0]; this.cool = this.cool || {}; this.cool[o.coolKey] = g.ym() + 24;
  };

  Tasks.prototype.serialize = function () { return { active: this.active, done: this.done, failed: this.failed, issued: this.issued, nextDyn: this.nextDyn, seq: this.seq, cool: this.cool || {}, adjusted:this.adjusted||[], offers: this.offers || [], nextOffer: this.nextOffer || 0, lineHist: this.lineHist || {}, startYM: this.startYM }; };
  Tasks.restore = function (s) {
    const t = Object.assign(new Tasks(), s);
    if (Array.isArray(t.offers)) t.offers = t.offers.filter(function (o) { return o.type !== 'lineCars'; });
    return t;
  };
})(window.CM);
