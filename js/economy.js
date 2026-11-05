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
  }
  CM.Economy = Economy;

  Economy.prototype.isFree = function () { return this.mode === 'free'; };
  // 只检查新增的现金支出：零费用操作（如拆除既有设施）在负余额时也允许，便于止损
  Economy.prototype.canAfford = function (amount) { return this.isFree() || amount <= MONEY_EPS || this.funds >= amount; };
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
    SIZE: { S: 0.7, M: 1, L: 1.5 },
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
  Economy.prototype.day = function (daily, compiled, year, dt) {
    const fareWan = daily && daily.ready ? daily.fare / 10000 : 0;
    let ops = 0;
    if (daily && compiled) {
      const oi = this.opsIndex(year);
      ops += (daily.carKmW != null ? daily.carKmW : daily.carKm) * CFG.ops.carKmCost * oi;   // v2.5：车厢公里按车型的运营成本系数加权
      for (const s of compiled.stations) ops += CFG.ops.stationDaily[s.size] * oi;
    }
    this.income('fare', fareWan);
    this.spend('ops', ops);
    this.cur.days++;
    if (dt === 'we') this.cur.weDays = (this.cur.weDays || 0) + 1; else if (dt === 'wd') this.cur.wdDays = (this.cur.wdDays || 0) + 1;
    this.lastDay = { fare: fareWan, ops: ops, dt: dt || null };
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
    if (!this.isFree()) { const v = this.grantFor(y, m); this.income('grant', v); this.log('grant', v, 'gen', '政府拨款', { y: y, m: m, d: 1 }); }
    else this.cur.grant = 0;
  };
  Economy.prototype.startMonth = function (y, m) { this.openMonth(y, m); this.payGrant(y, m); };
  // 封账：记录期末并归档；之后的收支一律记入下一个月
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
    // 票价不会自动随物价调整：实际价值（按造价指数折回价格基年）跌破开局默认票价的一半时提醒（长时间跨度、物价变化大的地图，如巴黎）
    const f0 = CFG.fareDefault && CFG.fareDefault.flat, y = this.cur && this.cur.y;
    if (CFG.fareRange && CFG.fareRange.scale && f0 > 0 && y && this.fare.flat > 0) {
      const real = this.fare.flat / this.costIndex(y) / f0;
      if (real < 0.5) out.push({ level: 'warn', text: '票价预警：票价没有随物价调整，实际价值只剩开局时的 ' + Math.round(real * 100) + '%，可在财政页调整票价' });
    }
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
  Economy.prototype.canAffordBuild = function (amount) { return this.isFree() || amount <= MONEY_EPS || Math.max(0, this.funds) + Math.max(0, this.capex) >= amount; };
  Economy.prototype.spendBuild = function (byKind, note, when, side) {
    let total = 0; for (const k of BUILD_KINDS) total += byKind[k] || 0;
    if (total <= 0) return { total: 0, capex: 0, gen: 0 };
    for (const k of BUILD_KINDS) if (byKind[k] > 0) this.cur[k] = (this.cur[k] || 0) + byKind[k];
    if (!side) this.built = (this.built || 0) + total;   // 累计建设支出（v2.3，含自由建造）：预算类挑战按接受后的增量计算；车站商业开发（side）不计入
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
    return { mode: this.mode, funds: this.funds, fare: this.fare, cur: this.cur, ledger: this.ledger, sat: this.sat, mods: this.mods, negMonths: this.negMonths, lowSatMonths: this.lowSatMonths, failed: this.failed, satFactors: this.satFactors, lastDay: this.lastDay,
      capex: this.capex, bonds: this.bonds, bondIssued: this.bondIssued, overdue: this.overdue, overdueParts: this.overdueParts || null, overdueMonths: this.overdueMonths, flow: this.flow, bondSeq: this.bondSeq, svc: this._svc == null ? null : this._svc,
      fisc: this.fisc || null, built: this.built || 0, rate: this.rate || undefined };
  };
  Economy.restore = function (s) {
    const e = new Economy(s.mode, s.cur.y, s.cur.m);
    Object.assign(e, { funds: s.funds, fare: Economy.normFare(s.fare), cur: s.cur, ledger: s.ledger || [], sat: s.sat, mods: s.mods || [], negMonths: s.negMonths || 0, lowSatMonths: s.lowSatMonths || 0, failed: s.failed || null, satFactors: s.satFactors || null, lastDay: s.lastDay || null,
      capex: s.capex || 0, bonds: s.bonds || [], bondIssued: s.bondIssued || {}, overdue: s.overdue || 0, overdueParts: s.overdueParts || null, overdueMonths: s.overdueMonths || 0, flow: s.flow || [], bondSeq: s.bondSeq || 1, built: s.built || 0 });
    e._svc = s.svc == null ? null : s.svc;
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

  // 网络连通分量（线路 + 站外换乘）
  function stationComponents(C, acc) {
    const N = C.stations.length, par = new Int32Array(N);
    for (let i = 0; i < N; i++) par[i] = i;
    const find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const uni = function (a, b) { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    for (const r of C.routes) for (let k = 1; k < r.stIdx.length; k++) uni(r.stIdx[0], r.stIdx[k]);
    if (acc) for (const t of acc.transfers) uni(t.a, t.b);
    return { find: find, serviced: C.serviced };
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
  const servCache = new Map();
  Tasks.facServable = function (city, f) {
    if (f.ext) return true;
    const key = city.uid + ':' + f.id + ':' + city.terrainVer + ':' + city.lockVer + ':' + (city.unlockAll ? 1 : 0);
    if (servCache.has(key)) return servCache.get(key);
    const lm = f.lmK >= 0 ? CM.DATA.landmarks[f.lmK] : null;
    const R = (lm ? Math.max(lm.w || 0, lm.d || 0) / 2 / CM.CFG.CELL_M : Math.max(0.5, f.r || 0)) + 2.4;
    let ok = false;
    for (let dy = -R; dy <= R && !ok; dy += 0.5) for (let dx = -R; dx <= R && !ok; dx += 0.5) {
      if (dx * dx + dy * dy > R * R) continue;
      if (CM.Metro.checkSite(city, f.x + dx, f.y + dy, 'underground').ok) ok = true;
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

  Tasks.prototype.evaluate = function (t, g) {
    const C = g.compiled, model = g.model, acc = model.net ? model.net.acc : null;
    if (t.type === 'connect') {
      const comp = t.avoid ? componentsAvoiding(C, acc, t.avoid) : stationComponents(C, acc);
      const anchorSets = t.anchors.map(function (a) {
        const set = [];
        C.stations.forEach(function (s, i) { if (C.serviced[i] && U.dist(s.x, s.y, a.x, a.y) <= a.r) set.push(i); });
        return set;
      });
      const hits = anchorSets.map(function (s) { return s.length > 0; });
      let ok = false;
      if (hits.every(Boolean)) {
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
      return{ok:v<=t.target&&!cheap,cheap,value:U.clamp((t.start-v)/Math.max(.001,t.start-t.target),0,1),text:'片区工作日早高峰汽车出行占比 '+U.fmtPct(v,1)+' / 目标 ≤ '+U.fmtPct(t.target,1)+(cheap?'（票价低于任务发布时，本月不计）':''),sample:v};
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
      const peak = sd && !model.dailyStale ? sd.peak[i] || 0 : 0;
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
      const f = CM.Fac && CM.Fac.byId(t.fac);
      if (!f || model.facIndex(t.fac) < 0) return { ok: false, value: 0, text: '设施目前不在运营' };
      const r = Tasks.facShareOf(model, f, t.basis);
      if (!r) return { ok: false, value: 0, text: '客流计算中' };
      const cheap = Tasks.fareCheap(t, g);
      return { ok: r.share >= t.target && !cheap, cheap: cheap, value: U.clamp(r.share / t.target, 0, 1), text: (t.kind ? f.name + ' ' : '') + (t.basis === 'we' ? '周末' : (t.basis === 'wd' ? '工作日' : '周平均')) + '乘地铁' + (f.T.hub ? '接驳' : '到访') + '比例 ' + U.fmtPct(r.share, 0) + ' / 目标 ' + U.fmtPct(t.target, 0) + (cheap ? '（票价低于任务发布时，本月不计）' : '') };
    }
    if (t.type === 'recovery') {
      // 票款与车站商业收入（v2.3 起计入 TOD 收入）÷ 运营费用
      const last = g.econ.ledger[g.econ.ledger.length - 1];
      const v = Tasks.recoveryOf(last);
      return { ok: v >= t.target, value: v / t.target, text: '上月（票款 + 车站商业）/ 运营费用 ' + U.fmtPct(v, 0) + ' / 目标 ' + U.fmtPct(t.target, 0) + (t.sustain ? '（需连续 ' + t.sustain + ' 个月，已 ' + (t.streak || 0) + ' 个月）' : '') };
    }
    // ---- v2.3 可选挑战与城市策略难题 ----
    if (t.type === 'budgetConnect') {
      const c = this.evaluate(Object.assign({}, t, { type: 'connect' }), g), spent = Math.max(0, (g.econ.built || 0) - (t.spent0 || 0)), over = spent > t.budget + 0.5;
      return { ok: c.ok && !over, dead: over, value: over ? 0 : c.value, text: c.text + ' · 已花 ' + U.fmtMoney(spent) + ' / 预算 ' + U.fmtMoney(t.budget) + (over ? '（已超预算）' : '') };
    }
    if (t.type === 'lineCrowd') {
      const L = g.net.lines[t.line]; if (!L) return { ok: false, dead: true, value: 0, text: '线路已拆除' };
      const cr = Tasks.crowdOf(g).find(function (x) { return x.lid === t.line; });
      if (!cr) return { ok: false, value: 0, text: '客流计算中' };
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
  Tasks.prepare = function (t, g) {
    if (t.type !== 'combo') return t;
    const anchors = t.anchors || [], ready = g.model.trafficReady();
    for (const p of t.parts) {
      if (p.base0 == null && ready && (p.gain || p.drop)) {
        const v = Tasks.partValue(p, g);
        if (v != null) { p.base0 = v; p.target = p.gain ? v + p.gain : v * (1 - p.drop); }
      }
      if (p.type === 'budget') { if (p.spent0 == null) p.spent0 = g.econ.built || 0; if (p.budget == null) p.budget = Math.round(Tasks.estimateLink(g, anchors) * (p.budgetX || 1.2) / 1000) * 1000; }
      else if (p.type === 'lineCost') { if (p.y0 == null) p.y0 = g.clock.y; if (p.budget == null) p.budget = Math.round(Tasks.estimateLink(g, anchors) * (p.x || 1) / 1000) * 1000; }
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
          return { kind: p.kind || 'net', core: !!p.core || (!hasCore && i === 0), ok: !!r.ok, value: r.ok ? 1 : U.clamp(r.value || 0, 0, 1), text: r.text, dead: !!r.dead };
        });
        return { ok: parts.every(function (p) { return p.ok; }), coreOk: parts.every(function (p) { return !p.core || p.ok; }), dead: parts.some(function (p) { return p.core && p.dead; }), value: parts.reduce(function (s, p) { return s + p.value; }, 0) / parts.length, parts: parts,
          text: parts.map(function (p) { return (p.ok ? '✓ ' : '✗ ') + p.text; }).join('；') };
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
        return { ok: cr.lf <= t.target, value: atMost(cr.lf, t.target), text: rt.route.line.name + ' 早高峰最高满载率 ' + pct(cr.lf) + ' / 目标 ≤ ' + pct(t.target) };
      }
      case 'netLoad': {   // 全网最拥挤区段的早高峰满载率
        const cr = Tasks.crowdOf(g)[0];
        if (!cr) return { ok: false, value: 0, text: '客流计算中' };
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
      case 'budget': {   // 任务发布以来的建设支出
        const spent = Math.max(0, (g.econ.built || 0) - (t.spent0 || 0)), over = spent > t.budget + 0.5;
        return { ok: !over, dead: over, value: over ? 0 : 1, text: '已花 ' + U.fmtMoney(spent) + ' / 预算 ' + U.fmtMoney(t.budget) + (over ? '（已超预算）' : '') };
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
  // 工作日早高峰各线路最拥挤的区段（满载率 = 区间断面客流 ÷ 线路运力），按满载率从高到低
  Tasks.crowdOf = function (g) {
    const m = g.model, net = m.net; if (!net || !net.R || !m.trafficReady()) return [];
    const P = m.resultsFor('wd').per[0], out = new Map();
    for (let r = 0; r < net.R; r++) {
      const rt = net.C.routes[r], re = net.rideEdge[r], capT = m.capOf(r, net);   // v2.5：定员按车队，环线两个方向的频率分别计
      for (let q = 0; q < re.length; q++) {
        const lf = P.load[re[q]] / Math.max(1, CM.Model.dirFreq(P, net, r, q) * capT), cur = out.get(rt.lineId);
        if (!cur || lf > cur.lf) { const k = q >> 1; out.set(rt.lineId, { lid: rt.lineId, lf: lf, a: rt.stIdx[k], b: rt.stIdx[(k + 1) % rt.stIdx.length], cars: rt.cars }); }
      }
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
    if(t.type==='stationCrowd'){const i=g.compiled.sIndex.get(t.station),s=g.model.stDailyWk;return i===undefined||!s?null:(s.peak[i]||0)/CFG.metro.stationCap[g.compiled.stations[i].size];}
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

  Tasks.prototype.monthly = function (g) {
    const y = g.clock.y, m = g.clock.m, ym = U.ymIndex(y, m);
    const out = [];
    const challenge = g.econ.mode === 'challenge';
    // 发布历史参考任务
    for (const h of D.histTasks) {
      if (this.issued[h.id]) continue;
      if (ym < U.ymIndex(h.appear[0], h.appear[1])) continue;
      this.issued[h.id] = 1;
      if (ym > U.ymIndex(h.deadline[0], h.deadline[1])) continue;
      const t = Object.assign({ kind: 'hist', status: 'active', issuedAt: [y, m], streak: 0 }, JSON.parse(JSON.stringify(Tasks.withPlan(g, h))));
      t.reward = t.reward * g.econ.costIndex(y);
      Tasks.prepare(t, g);
      this.active.push(t);
      out.push({ type: 'issued', task: t });
    }
    // 动态任务（开局一年后开始）
    if (!this.nextDyn) this.nextDyn = ym + 12;
    if (!D.noDynTasks && ym >= this.nextDyn && this.active.filter(function (t) { return t.kind === 'dyn'; }).length < 2 && g.compiled.stations.length >= 0) {
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
      // 复合条件也可能包含已停用的设施；未来开放的设施不算停用。
      const retired = function (p) {
        if (p.type === 'facShare') { const f = CM.Fac && CM.Fac.byId(p.fac); return !f || (f.close != null && g.year() >= f.close); }
        return p.type === 'combo' && p.parts.some(retired);
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
      const ev = this.evaluate(t, g);
      if(['zoneCong','stationCrowd','ridership','facShare'].includes(t.type)){
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
      if(comboTraffic&&(ev.ok||ym>=U.ymIndex(t.deadline[0],t.deadline[1]))&&!g.model.trafficVerified('avg')){
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
      if (t.kind === 'dyn' && (complete || ym >= U.ymIndex(t.deadline[0], t.deadline[1]))) {
        this.cool = this.cool || {};
        this.cool[t.coolKey || t.type] = ym + (complete ? 24 : 36);
        this.cool['type:' + t.type] = ym + (complete ? 6 : 18);
      }
      if (complete) {
        t.status = 'done'; t.closedAt = [y, m];
        this.active.splice(this.active.indexOf(t), 1); this.done.push(t);
        if (challenge) { g.econ.income('reward', t.reward); g.econ.log('reward', t.reward, 'gen', '任务奖励：' + t.title, { y: y, m: m, d: 1 }); g.econ.mods.push({ kind: 'sat', delta: 4, until: ym + 5, reason: '完成任务「' + t.title + '」' }); }
        if (t.kind === 'opt' && t.coolKey) { this.cool = this.cool || {}; this.cool[t.coolKey] = ym + 36; }
        out.push({ type: 'done', task: t });
      } else if (t.type === 'combo' && ev.coreOk && !ev.dead && ym >= U.ymIndex(t.deadline[0], t.deadline[1])) {
        // 部分完成：主体目标已达成、其余未达成。按比例给奖励，不扣拨款
        t.status = 'done'; t.partial = true; t.closedAt = [y, m]; t.reward *= Tasks.PARTIAL;
        this.active.splice(this.active.indexOf(t), 1); this.done.push(t);
        if (challenge) { g.econ.income('reward', t.reward); g.econ.log('reward', t.reward, 'gen', '任务奖励（部分完成）：' + t.title, { y: y, m: m, d: 1 }); g.econ.mods.push({ kind: 'sat', delta: 2, until: ym + 5, reason: '部分完成任务「' + t.title + '」' }); }
        if (t.kind === 'opt' && t.coolKey) { this.cool = this.cool || {}; this.cool[t.coolKey] = ym + 36; }
        out.push({ type: 'done', task: t });
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

  Tasks.prototype.generate = function (g) {
    const y = g.clock.y, m = g.clock.m, model = g.model, city = g.city;
    const acc = model.net ? model.net.acc : null;
    const ci = g.econ.costIndex(y) * (CFG.economy.rewardScale || 1);   // 奖励按本城价格水平
    const dl = function (months) { const t = U.ymIndex(y, m) + months; return [Math.floor(t / 12), t % 12 + 1]; };
    const rng = new U.RNG((y * 13 + m * 7 + this.seq * 31) >>> 0);
    const ym = U.ymIndex(y, m);
    const cool = this.cool || (this.cool = {});
    const active = this.active;
    const free = function (key, type) { return !(cool[key] > ym) && !(cool['type:' + type] > ym) && !active.some(function (t) { return (t.coolKey || t.type) === key; }); };
    // 线路、车站拥挤类任务（v2.5 玩家反馈：太多）：明显过载才发布，全局冷却 3 年且同时只有一个；日常的过载由地铁芯提醒处理
    const crowdFree = !(cool.crowd > ym) && !active.some(function (t) { return t.type === 'stationCrowd' || t.type === 'lineCrowd'; });
    const cands = [];
    // 可替代需求不足、尚未有可用地铁服务的片区优先发布覆盖任务。

    // 拥堵热点（排除近期出过任务的片区）
    let worst=-1,bestPotential=0;
    const zoneOpen=function(z){let n=0,o=0;for(const c of model.zoneCells[z]){if(city.landFrac[c]<.5)continue;n++;if(!city.cellLocked(c)&&!city.regions[city.region[c]].scenic)o++;}return n>0&&o>=n/2;};   // 可建设范围按格判断（v2.2）
    if(model.trafficReady())for(let z=0;z<model.Z;z++){
      if(model.zPop[z]+model.zJobs[z]<3000||!zoneOpen(z)||!free('cong:'+z,'zoneCong')||g.zoneCong(z)<1.25)continue;
      if(Tasks.netDist(g,model.zCx[z],model.zCy[z])>12)continue;   // v2.4：离运营车站 3 km 以上的片区不发拥堵任务（偏远片区靠覆盖任务）
      const v=model.zoneTraffic(z),potential=model.zoneOpportunity(z)/Math.max(1,v.trips);
      if(v.trips>100&&potential>=.06&&potential>bestPotential){worst=z;bestPotential=potential;}
    }
    if(worst>=0){
      // v2.4 平衡：降幅按可替代的出行估算、更温和（一两处车站或一段延伸就能做到），票价低于发布时的月份不计
      const v=model.zoneTraffic(worst),drop=U.clamp(bestPotential*.12,.008,.03),target=Math.max(0,v.carShare-drop);
      cands.push({type:'zoneCong',metric:'carShare',coolKey:'cong:'+worst,zone:worst,start:v.carShare,target,sustain:3,samples:[],fare0:Tasks.fareLevel(g.econ.fare),title:'减少「'+g.zoneName(worst)+'」高峰汽车出行',desc:'让工作日早高峰汽车出行占比降低 '+(drop*100).toFixed(1)+' 个百分点（近 3 个月平均，降价月份不计）。',months:30,reward:60000*ci});
    }
    // 覆盖空白
    if (acc) {
      let best = -1, bp = 0;
      for (let z = 0; z < model.Z; z++) {
        const p = model.zPop[z];
        if (p > bp && acc.zCov[z] < 0.2 && zoneOpen(z) && free('cov:' + z, 'zoneCov')) { bp = p; best = z; }
      }
      if (best >= 0 && bp > 12000) {
        cands.push({ type: 'zoneCov', coolKey: 'cov:' + best, zone: best, target: 0.5, title: '为「' + g.zoneName(best) + '」提供地铁服务', desc: '该片区人口约 ' + U.fmtPeople(bp) + '，尚无地铁覆盖。使片区 50% 以上的居民与岗位步行 15 分钟可达车站。', months: 30, reward: 50000 * ci });
      }
    }
    // 车站拥挤
    const sdw = model.stDailyWk || model.stDaily;
    if (sdw && !model.dailyStale && g.compiled.stations.length && crowdFree) {
      let bs = -1, br = 0;
      g.compiled.stations.forEach(function (s, i) {
        if (!free('st:' + s.id, 'stationCrowd')) return;
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
      const sh = model.daily.metroShare || 0, gr = sh < 0.08 ? 0.2 : (sh < 0.15 ? 0.12 : 0.08);
      cands.push({ type: 'ridership', basis: 'avg', target: Math.round(model.daily.metro * (1 + gr) / 1000) * 1000, title: '提升地铁客运量', desc: '在期限内使日均地铁客运量较当前提高 ' + Math.round(gr * 100) + '%（可通过新线、延长线、换乘或调整票价实现）。统计口径：周平均（5 个工作日 + 2 个周末日）。', months: 24, reward: 40000 * ci });
    }
    // 经营：票款覆盖（v2.3 平衡）：目标按近 3 个月的实际覆盖率提高一截（最高 70%），不再一律要求 70%——
    // 大线网的运营费用随物价上涨，票价长期不变时覆盖率很低，固定目标几乎必然失败、反复扣减拨款
    if (g.econ.mode === 'challenge' && model.daily && model.daily.metro > 50000 && free('recovery', 'recovery')) {
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
        if (!free('fac:' + f.id, 'facShare') || !Tasks.facServable(g.city, f) || (f.close != null && f.close < g.clock.y + 3)) continue;
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
          cands.push({ type: 'connect', coolKey: 'fac:' + f.id, fac: f.id, title: '把「' + f.name + '」接入线网',
            desc: f.name + '每天约 ' + U.fmtPeople(best.r.vol) + ' 人次到访，离最近的车站约 ' + U.fmtNum(nd * CFG.CELL_M / 1000, 1) + ' km。在附近设站并接入线网即可。',
            anchors: [{ name: f.name, x: f.x, y: f.y, r: +r.toFixed(2) }, { name: s.name, x: s.x, y: s.y, r: 1.2 }], months: 36, reward: 35000 * ci });
        }
      } else if (best) {
        // 目标（v2.4 平衡）：比现在高 6 个百分点，并争取达到「全市分担率 + 5 个百分点」（上限 16%）；离线网 2 km 以上的只要求高 5 个百分点
        const cs = (model.daily && model.daily.metroShare) || 0;
        const f = best.f, raw = best.dNet > 8 ? best.r.share + 0.05 : Math.max(best.r.share + 0.06, Math.min(0.16, cs + 0.05)), target = Math.round(raw * 100) / 100;
        const what = f.T.hub ? '接驳出行' : '到访出行';
        cands.push({ type: 'facShare', coolKey: 'fac:' + f.id, fac: f.id, basis: best.basis, start: best.r.share, target: target, fare0: Tasks.fareLevel(g.econ.fare), title: '地铁服务「' + f.name + '」',
          desc: f.name + '每天约 ' + U.fmtPeople(best.r.vol) + ' 人次' + what + '，乘地铁只有 ' + U.fmtPct(best.r.share, 0) + '，目标 ' + U.fmtPct(target, 0) + '（降价月份不计）。',
          months: 30, reward: 45000 * ci });
      }
    }
    // 本城专属动态任务（D.dynTasks）：在年份窗口内各发布一次，已满足的不发布
    const self = this;
    for (const tp0 of (D.dynTasks || []).concat(CM.Eras ? CM.Eras.goals() : [])) {   // v2.2：历史阶段目标同样作为本城任务，在阶段时间内发布
      const tp = Tasks.withPlan(g, tp0);
      if (this.issued['dyn:' + tp.id] || ym < U.ymIndex(tp.from[0], tp.from[1]) || ym > U.ymIndex(tp.to[0], tp.to[1]) || !free('city:' + tp.id, tp.type)) continue;
      const c = Object.assign({ coolKey: 'city:' + tp.id, cityId: tp.id }, JSON.parse(JSON.stringify(tp)), { reward: tp.reward * ci });
      delete c.from; delete c.to; delete c.id;
      if (this.evaluate(c, g).ok) continue;
      cands.push(c, c);   // 权重加倍，让本城任务更常出现
    }
    if (!cands.length) return null;
    const c = cands[Math.floor(rng.next() * cands.length)];
    if (c.cityId) self.issued['dyn:' + c.cityId] = 1;
    if (c.type === 'stationCrowd') cool.crowd = ym + 36;
    const t = Object.assign({ id: 'd' + (this.seq++), kind: 'dyn', status: 'active', issuedAt: [y, m], deadline: dl(c.months), streak: 0 }, c);
    return Tasks.prepare(t, g);
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
  Tasks.THEME = { lineCrowd: '拥挤区段优化', lineCars: '既有线路扩容', fiscal: '财政压力下的网络调整', lineEff: '城市扩张后的老线路' };
  // 城市策略难题的锚点按地名取位置（D.places），找不到地名的难题不发布
  const placeAt = function (name) { const p = (D.places || []).find(function (q) { return q[0] === name; }); return p ? { x: p[1], y: p[2] } : null; };
  // 预算挑战：按各锚点之间直线修地下线的粗略造价（含过水附加与 M 型车站）乘以 budgetX 作为预算，逼玩家权衡形式、走向与站数
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
    const gm = g.econ.grantQuota(y, g.clock.m) * (CFG.economy.rewardScale || 1);   // 奖励按本城当年的基础月拨款折算（各城货币与年代一致）
    const free = function (key) { return !(cool['opt:' + key] > ym) && !self.active.some(function (t) { return t.coolKey === 'opt:' + key; }) && !(self.offers || []).some(function (o) { return o.coolKey === 'opt:' + key; }); };
    // 城市策略难题（D.scenarios）：在年份窗口内各提出一次
    for (const s0 of D.scenarios || []) {
      const s = Tasks.withPlan(g, s0);
      if (this.issued['sc:' + s.id] || ym < U.ymIndex(s.from[0], s.from[1]) || ym > U.ymIndex(s.to[0], s.to[1])) continue;
      if (s.challengeOnly && g.econ.mode !== 'challenge') continue;
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
        c.anchors = an; c.budget = Math.round(Tasks.estimateLink(g, an) * (s.budgetX || 1.2) / 1000) * 1000;
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
    const tight = crowd.find(function (x) { return x.lf > 1 && x.cars < 8 && free('cars:' + x.lid); });
    if (tight) {
      const L = g.net.lines[tight.lid];
      out.push({ type: 'lineCars', line: tight.lid, start: tight.cars, target: 8, coolKey: 'opt:cars:' + tight.lid, months: 24, reward: 1.5 * gm, theme: Tasks.THEME.lineCars,
        title: '把「' + L.name + '」扩容到 8 节编组', desc: L.name + ' 早高峰满载率 ' + U.fmtPct(tight.lf, 0) + '，但列车只有 ' + tight.cars + ' 节——编组受沿线最小车站限制。把沿线车站都升级为大型站，让列车加长到 8 节。',
        tips: ['在线路详情的车站列表里找出小型、中型车站', '升级车站进入草案，按差价计费', '客流不大的车站也要升级，否则整条线的编组被它卡住'] });
    }
    if (g.econ.mode === 'challenge' && free('fiscal')) {
      const last = g.econ.ledger[g.econ.ledger.length - 1], rec = last && last.ops > 0 ? last.fare / last.ops : 1, km = CM.Milestones ? CM.Milestones.netInfo(g).km : 0;
      if (rec < 0.6 && km > 15) {
        const target = Math.min(0.9, Math.round((rec + 0.15) * 20) / 20);
        out.push({ type: 'fiscal', target: target, sustain: 3, kmCap: Math.round(km * 1.05 * 10) / 10, coolKey: 'opt:fiscal', months: 30, reward: 3 * gm, theme: Tasks.THEME.fiscal,
          title: '不扩张也能减亏', desc: '票款只够付 ' + U.fmtPct(rec, 0) + ' 的运营费。在线网不超过 ' + U.fmtNum(km * 1.05, 1) + ' km 的前提下，把票款覆盖率提高到 ' + U.fmtPct(target, 0) + ' 并保持 3 个月。',
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
      out.push({ type: 'lineEff', line: lid, start: now, target: Math.round(was * 0.95), coolKey: 'opt:eff:' + lid, months: 36, reward: 2 * gm, theme: Tasks.THEME.lineEff,
        title: '让「' + L.name + '」重新跑满', desc: '城市向新区扩张后，' + L.name + ' 每公里的日客流从 ' + U.fmtPeople(was) + ' 降到 ' + U.fmtPeople(now) + ' 人次。线路还在，客流却搬走了：让它回到 ' + U.fmtPeople(was * 0.95) + ' 人次以上。',
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
  Tasks.prototype.accept = function (g, id) {
    const k = (this.offers || []).findIndex(function (o) { return o.id === id; }); if (k < 0) return null;
    const o = this.offers.splice(k, 1)[0], ym = g.ym(), dl = ym + o.months;
    const t = Object.assign({}, o, { kind: 'opt', status: 'active', issuedAt: [g.clock.y, g.clock.m], deadline: [Math.floor(dl / 12), dl % 12 + 1], streak: 0 });
    delete t.expiresYM;
    if (t.type === 'budgetConnect') t.spent0 = g.econ.built || 0;
    if (t.type === 'combo') for (const p of t.parts) { delete p.base0; delete p.fare0; delete p.spent0; delete p.y0; if (p.gain || p.drop) delete p.target; }
    Tasks.prepare(t, g);
    this.active.push(t);
    return t;
  };
  Tasks.prototype.decline = function (g, id) {
    const k = (this.offers || []).findIndex(function (o) { return o.id === id; }); if (k < 0) return;
    const o = this.offers.splice(k, 1)[0]; this.cool = this.cool || {}; this.cool[o.coolKey] = g.ym() + 24;
  };

  Tasks.prototype.serialize = function () { return { active: this.active, done: this.done, failed: this.failed, issued: this.issued, nextDyn: this.nextDyn, seq: this.seq, cool: this.cool || {}, adjusted:this.adjusted||[], offers: this.offers || [], nextOffer: this.nextOffer || 0, lineHist: this.lineHist || {} }; };
  Tasks.restore = function (s) { const t = new Tasks(); Object.assign(t, s); return t; };
})(window.CM);
