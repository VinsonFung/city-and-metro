'use strict';
// 城市特色机制库（v2.6）：八个模块的通用机制。网页版规则见根目录 PRD.md 的 v2.6、v2.7 章节。
// 地图只在 data.traits 里声明「用哪个机制、在哪里、什么时候、多强、史实依据」，这里把它展开成底层已有的字段
// （heritage、replan、foresight、事件 fx、造价与拨款参数），引擎里不写按城市判断的玩法。
// 没有 build 的机制只是说明：底层数据已经在地图文件里（风景区、越江造价、填海、背景交通等），needs 检查数据确实存在。
// 兼容：事件只追加到 D.events 末尾（已触发记录按序号），已有事件只补 fx；新条目要加在 traits 清单末尾。
(function (CM) {
  const U = CM.U;
  const MODULES = {
    plan: { name: '城市规划与保护', icon: 'building' },
    geo: { name: '地理环境与工程', icon: 'mountain' },
    dev: { name: '城市发展与产业转型', icon: 'factory' },
    policy: { name: '政策与城市投资', icon: 'coin' },
    event: { name: '历史事件与经济冲击', icon: 'flag' },
    transport: { name: '交通结构与竞争', icon: 'road' },
    hub: { name: '城市枢纽与大型活动', icon: 'train' },
    land: { name: '土地价值与站城开发', icon: 'chart' },
  };
  const LV = { light: 0, mid: 1, heavy: 2 };
  // 强度三档：城市只能选档，不写数字。重档的保护与提前布局即伦敦的现值
  const TIER = {
    conserve: [{ tunnel: 1.1, station: 1.1, demolish: 1.3 }, { tunnel: 1.2, station: 1.15, demolish: 1.5 }, { tunnel: 1.35, station: 1.3, demolish: 2 }],
    guard: [{ guard: 1.3, stationGuard: 1.2, demolish: 1.3 }, { guard: 1.6, stationGuard: 1.4, demolish: 1.5 }, { guard: 1.8, stationGuard: 1.6, demolish: 2 }],
    invest: [1.1, 1.2, 1.35],
    austerity: [0.9, 0.8, 0.5],
    boom: [1.1, 1.2, 1.35],
    property: [{ k: 1.15, tender: 0.4 }, { k: 1.4, tender: 0.5 }, { k: 2, tender: 0.6 }],
    car: [1.05, 1.1, 1.2],   // 实测：成本每提高 10%，同一线网的日客运量约多 7.5%
    foresight: [{ months: 3, jobs: 1.15, pop: 1.1, years: 8 }, { months: 4, jobs: 1.3, pop: 1.3, years: 10 }, { months: 8, jobs: 1.5, pop: 1.3, years: 14 }],
    // 产业转型：停产当月岗位与人口减少，转型前增长放缓，转型后增长加快
    transition: [
      { hitJobs: 0.1, hitPop: 0, slowJobs: 0.85, slowPop: 0.95, upJobs: 1.15, upPop: 1.1, years: 8 },
      { hitJobs: 0.2, hitPop: 0.02, slowJobs: 0.7, slowPop: 0.9, upJobs: 1.3, upPop: 1.2, years: 10 },
      { hitJobs: 0.35, hitPop: 0.05, slowJobs: 0.6, slowPop: 0.8, upJobs: 1.5, upPop: 1.3, years: 12 },
    ],
    disaster: [
      { demand: { hw: 0.95, sh: 0.9, lz: 0.8, months: 1 }, sat: { v: -0.5, months: 3 }, repair: { share: 0.04, cap: 2 } },
      { demand: { hw: 0.85, sh: 0.75, lz: 0.6, months: 1, fade: 0.25 }, sat: { v: -1, months: 6 }, repair: { share: 0.08, cap: 4 } },
      { demand: { hw: 0.7, sc: 0.8, sh: 0.6, lz: 0.5, months: 3, fade: 1 }, sat: { v: -2, months: 9 }, cost: 1.1, repair: { share: 0.15, cap: 6 } },
    ],
    accident: [{ sat: -1, cost: 1.05 }, { sat: -1.5, cost: 1.1 }, { sat: -2.5, cost: 1.2 }],
    war: [
      { grant: 0.75, cost: 1.15, pop: 0.02, jobs: 0.02, demand: { hw: 0.9, sh: 0.8, lz: 0.7, months: 6, fade: 1 }, sat: -1 },
      { grant: 0.6, cost: 1.25, pop: 0.06, jobs: 0.08, demand: { hw: 0.8, sh: 0.65, lz: 0.5, months: 9, fade: 1 }, sat: -1.5 },
      { grant: 0.5, cost: 1.3, pop: 0.15, jobs: 0.2, demand: { hw: 0.7, sh: 0.55, lz: 0.4, months: 12, fade: 1 }, sat: -3 },
    ],
    // 考古发现（v3.0）：p 每处工点发现遗址的概率；fee 调查与保护费占该工点造价的比例，cap 单次草案的上限（月基础拨款）；
    // find 发现中有展示价值的比例，k 附近景点的游客吸引倍数（发现后第 1 年起 10 年，之后两年回落）
    archaeo: [{ p: 0.1, fee: 0.15, cap: 1, find: 0.35, k: 1.12 }, { p: 0.16, fee: 0.25, cap: 1.5, find: 0.45, k: 1.2 }, { p: 0.24, fee: 0.35, cap: 2, find: 0.55, k: 1.3 }],
  };
  const lv = function (t) { return LV[t.level] != null ? LV[t.level] : 1; };
  const ymYear = function (y, m) { return y + ((m || 1) - 1) / 12; };
  const pct = function (k) { return Math.round(Math.abs(k - 1) * 100); };
  const num = function (k) { return String(Math.round(k * 100) / 100); };

  // 事件：指定日期已有事件就补 fx（不改标题和说明）；没有且给了标题就追加到末尾
  const eventAt = function (D, spec) {
    D.events = D.events || [];
    let e = D.events.find(function (x) { return x.y === spec.y && (x.m || 1) === (spec.m || 1) && (!spec.title || x.title === spec.title); });
    if (!e && !spec.title) throw new Error('机制指向的事件不存在：' + spec.y + '-' + spec.m);
    if (!e) { e = { y: spec.y, m: spec.m || 1, tag: spec.tag || '史实', title: spec.title, desc: spec.desc || '' }; D.events.push(e); }
    e.fx = e.fx || {};
    return e;
  };
  const setCost = function (c, patch) {
    const H = Object.assign({ tunnel: 1, station: 1, guard: 1, stationGuard: 1, demolish: 1 }, c.cfg.cost.heritage || {}, patch);
    H.demolish = Math.max((c.cfg.cost.heritage || {}).demolish || 1, patch.demolish || 1);
    c.cfg.cost = Object.assign({}, c.cfg.cost, { heritage: H });
  };
  const addGuards = function (t, c) {
    const D = c.D; D.heritage = D.heritage || { guards: [] };
    for (const g of t.guards || []) {
      const o = typeof g === 'string' ? { lm: g } : g;
      // 城墙等线状遗址（v3.1）：沿 D.walls 的线位两侧 r 格内只能走地下
      if (o.wall) { const w = (D.walls || []).find(function (x) { return x.id === o.wall; }); D.heritage.guards.push({ wall: o.wall, r: o.r || 0.5, name: o.name || (w ? w.name : o.wall) + '地下保护范围' }); continue; }
      const lm = (D.landmarks || []).find(function (l) { return l.id === o.lm; });
      D.heritage.guards.push({ lm: o.lm, r: o.r || 1.2, name: o.name || (lm ? lm.name : o.lm) + '地下保护范围' });
    }
    if (t.guards && t.guards.length) setCost(c, TIER.guard[lv(t)]);
  };
  const addForesight = function (t, c) {
    const D = c.D, T = TIER.foresight[lv(t)];
    let x = t.pos ? t.pos[0] : null, y = t.pos ? t.pos[1] : null;
    if (t.at) { const lm = (D.landmarks || []).find(function (l) { return l.id === t.at; }); if (lm) { x = lm.x; y = lm.y; } }
    D.foresight = D.foresight || [];
    D.foresight.push({ id: t.id, x: x, y: y, ym: t.ym, before: t.before, r: t.r || 7, rewardMonths: T.months, grow: { region: t.region, jobs: T.jobs, pop: T.pop, years: T.years }, title: t.title, hit: t.hit, miss: t.miss });
    t._from = ymYear(t.ym[0], t.ym[1]);
  };
  // 拨款或造价的限时变化，挂在事件上
  const addFinance = function (t, c, f) {
    const e = eventAt(c.D, t.on);
    e.fx.finance = Object.assign({ years: t.years, fade: t.fade != null ? t.fade : 1 }, f);
    t._from = ymYear(e.y, e.m); t._to = t._from + t.years;
  };
  // 小汽车成本曲线：从某年起乘以 k（阶跃，之后各点同比）
  const stepCurve = function (curve, year, k) {
    const out = [];
    for (const p of curve) if (p[0] < year) out.push(p.slice());
    out.push([year - 0.001, U.interp(curve, year)], [year, U.interp(curve, year) * k]);
    for (const p of curve) if (p[0] > year) out.push([p[0], p[1] * k]);
    return out;
  };
  const needRegions = function (ids, D) {
    const bad = []; for (const id of [].concat(ids || [])) if (!(D.regions || []).some(function (r) { return r.id === id; })) bad.push('片区不存在：' + id);
    return bad;
  };
  const needLandmarks = function (ids, D) {
    const bad = []; for (const g of ids || []) {
      if (g && g.wall) { if (!(D.walls || []).some(function (w) { return w.id === g.wall; })) bad.push('城墙不存在：' + g.wall); continue; }   // 线状遗址（城墙）
      const id = typeof g === 'string' ? g : g.lm; if (!(D.landmarks || []).some(function (l) { return l.id === id; })) bad.push('地标不存在：' + id);
    }
    return bad;
  };
  const damageArea = function (A) { return Array.isArray(A) ? A.length >= 3 && A.every(function (p) { return Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]); }) : !!(A && isFinite(A.x) && isFinite(A.y) && A.r > 0); };
  const needEvent = function (spec, D) {
    if (!spec || spec.title) return [];
    return (D.events || []).some(function (x) { return x.y === spec.y && (x.m || 1) === (spec.m || 1); }) ? [] : ['事件不存在：' + spec.y + '-' + spec.m];
  };
  const hasData = function (ok, msg) { return ok ? [] : [msg]; };

  // 融资制度（政府合同的名称与开放年份，corp.js 读取）
  const FLAVOR = {
    au: { name: '公私合作（PPP）', from: 2000, note: '参照新南威尔士州以公私合作建设和运营轨道的做法：机场线由私营公司投资，西北地铁的运营与车辆采用公私合作合同' },
    us: { name: '公共机构与联邦资金', from: 1968, note: '参照纽约大都会运输署以发债、专项税和联邦拨款支持资本计划的做法' },
    sg: { name: '政府投资与特许运营', from: 1987, note: '参照新加坡政府出资建设、运营商持牌经营地铁的做法' },
    cn: { name: 'PPP 特许经营', from: 2002, note: '参照中国内地 2000 年代起的地铁 PPP 与特许经营' },
    hk: { name: '铁路＋物业', from: 1980, note: '参照香港以沿线物业开发收益支持铁路建设的做法' },
    tw: { name: '联合开发与 BOT', from: 1990, note: '参照台北捷运的联合开发与 BOT' },
    fr: { name: '特许经营', from: 1900, note: '参照巴黎市建设隧道、由运营公司特许经营地铁的做法' },
    uk: { name: '公私合作（PFI）', from: 1992, note: '参照伦敦地铁的公私合作：朱比利线延伸、码头区轻轨与伊丽莎白线都有私人资金或开发商出资' },
    jp: { name: '公私合作', from: 1970, note: '参照日本地方政府与民间企业合资建设、运营轨道的做法' },
  };

  const LIB = {
    conserve: { mod: 'plan', name: '历史城区',
      effect: function (t, c) { const T = TIER.conserve[lv(t)]; return '只能走地下；隧道 ×' + num(T.tunnel) + '，车站 ×' + num(T.station) + '，拆迁 ×' + num(T.demolish); },
      needs: function (t, D) { return needRegions(t.regions, D).concat(needLandmarks(t.guards, D)); },
      build: function (t, c) {
        for (const id of t.regions) { const r = c.D.regions.find(function (x) { return x.id === id; }); if (r) r.heritage = true; }
        c.D.heritage = c.D.heritage || { guards: [] };
        setCost(c, TIER.conserve[lv(t)]);
        addGuards(t, c);
      } },
    guard: { mod: 'plan', name: '古建保护范围',
      effect: function (t) { const T = TIER.guard[lv(t)]; return '古建周围只能走地下；隧道 ×' + num(T.guard) + '，车站 ×' + num(T.stationGuard); },
      needs: function (t, D) { return needLandmarks(t.guards, D); },
      build: addGuards },
    // 考古发现（v3.0）：历史城区与古建保护范围内的地下工程，在确认建设草案时逐个工点判定一次（不按月随机，跳年不增加计算）。
    // 结果由存档种子和工点位置决定，同一工点不会重复判定；发现后另付调查与保护费，不延误工期，有展示价值的发现让附近景点的游客增加一段时间
    archaeo: { mod: 'plan', name: '考古发现',
      effect: function (t) {
        const T = TIER.archaeo[lv(t)];
        return '确认保护区内的地下工程时判定：每处工点约 ' + Math.round(T.p * 100) + '% 可能发现遗址，另付该处造价约 ' + Math.round(T.fee * 100) + '% 的调查与保护费（每次最多 ' + num(T.cap) + ' 个月拨款），不影响工期；约 ' + Math.round(T.find * 100) + '% 的发现有展示价值，附近景点的游客增加约 ' + pct(T.k) + '%，持续约 10 年';
      },
      needs: function (t, D) { return hasData((D.traits || []).some(function (x) { return x.use === 'conserve' || (x.use === 'guard' && x.guards && x.guards.length); }), '没有历史城区或古建保护范围').concat(needRegions(t.regions, D)); },
      build: function (t, c) { c.D.archaeo = { level: lv(t), regions: t.regions || null, near: t.near || 2.5 }; } },
    scenic: { mod: 'plan', name: '风景与生态保护', effect: function () { return '不能开发；地下穿越另收环境费，景区内通常不能设站'; },
      needs: function (t, D) { return hasData((D.regions || []).some(function (r) { return r.scenic; }), '没有风景区'); } },
    heightCap: { mod: 'plan', name: '限高', effect: function () { return '建筑高度受限，只改变城市外观'; },
      needs: function (t, D) { return hasData(D.maxHeight || (D.regions || []).some(function (r) { return r.maxHeight; }), '没有限高数据'); } },
    crossing: { mod: 'geo', name: '越江跨海', effect: function () { return '水下隧道与桥梁每公里另加造价'; },
      needs: function (t, D, cfg) { return hasData(cfg.cost && cfg.cost.riverPerKm, '没有越江造价'); } },
    mountain: { mod: 'geo', name: '山地隧道', effect: function () { return '山体段只能走地下，并另加造价'; },
      needs: function (t, D) { return hasData((D.regions || []).some(function (r) { return r.scenic; }), '没有山地区域'); } },
    reclaim: { mod: 'geo', name: '填海造地', effect: function () { return '新土地按年份成陆，之后才能开发和建站'; },
      needs: function (t, D) { return hasData(D.reclaim && D.reclaim.length, '没有填海数据'); } },
    newDistrict: { mod: 'dev', name: '新区开发', effect: function () { return '新区按真实年份开放，开发期内增长加快'; },
      needs: function (t, D) { return hasData((D.events || []).some(function (e) { return e.fx && e.fx.grow; }), '没有片区增长事件'); } },
    relocate: { mod: 'dev', name: '疏解与副中心', effect: function () { return '老城人口与岗位向外迁移，新中心增长加快'; },
      needs: function (t, D) { return hasData((D.eras || []).some(function (e) { return e.relocate; }), '没有疏解数据'); } },
    transition: { mod: 'dev', name: '产业转型',
      effect: function (t) { const T = TIER.transition[lv(t)]; return t.close || t.existing ? '停产时岗位减少，改变规划后增长加快' : '规划改变，之后增长加快约 ' + pct(T.upJobs) + '%'; },
      needs: function (t, D) { return needRegions(t.region, D).concat(needEvent(t.close, D), needEvent(t.renew, D), (t.replan || []).reduce(function (a, r) { return a.concat(needRegions(r.region, D), D.plans && D.plans[r.plan] ? [] : ['规划类型不存在：' + r.plan]); }, [])); },
      build: function (t, c) {
        const D = c.D, T = TIER.transition[lv(t)], ids = [].concat(t.region || []);
        for (const r of t.replan || []) { D.replan = D.replan || []; D.replan.push(r); }
        if (t.replan && t.replan.length && !t.span) t._to = t.replan[t.replan.length - 1].year + T.years;
        if (t.existing) return;
        const up = { region: ids, jobs: T.upJobs, pop: T.upPop, years: T.years };
        if (t.close) {
          const e = eventAt(D, t.close);
          e.fx.strike = { region: ids, jobs: T.hitJobs, pop: T.hitPop };
          e.fx.grow = t.renew ? { region: ids, jobs: T.slowJobs, pop: T.slowPop, years: Math.max(1, t.renew.y - t.close.y) } : up;
          t._from = ymYear(e.y, e.m);
        }
        if (t.renew) { const e = eventAt(D, t.renew); e.fx.grow = up; if (!t.close) t._from = ymYear(e.y, e.m); }
      } },
    investWindow: { mod: 'policy', name: '投资窗口',
      effect: function (t) { return t.existing ? '限时增加轨道投资' : '限时拨款增加约 ' + pct(TIER.invest[lv(t)]) + '%'; },
      needs: function (t, D) { return needEvent(t.on, D); },
      build: function (t, c) { addFinance(t, c, { grant: TIER.invest[lv(t)] }); } },
    austerity: { mod: 'policy', name: '财政紧缩',
      effect: function (t) { return t.existing ? '限时削减轨道资金' : '限时拨款减少约 ' + pct(TIER.austerity[lv(t)]) + '%'; },
      needs: function (t, D) { return needEvent(t.on, D); },
      build: function (t, c) { addFinance(t, c, { grant: TIER.austerity[lv(t)] }); } },
    currency: { mod: 'policy', name: '货币改革', effect: function () { return '账目与票价按当期货币显示，内部金额不变'; },
      needs: function (t, D, cfg) { return hasData(cfg.money && cfg.money.eras, '没有货币时期'); } },
    war: { mod: 'event', name: '战争',
      effect: function (t) { return '片区人口与岗位骤减，拨款减少、造价上涨，之后要花多年恢复'; },
      needs: function (t, D) { return (t.events || []).reduce(function (a, e) { return a.concat(needEvent(e, D), needRegions(e.regions, D)); }, []); },
      build: function (t, c) {
        for (const w of t.events || []) {
          const T = TIER.war[LV[w.level] != null ? LV[w.level] : 1], e = eventAt(c.D, w);
          e.fx.finance = w.tableGrant ? { cost: T.cost, years: w.years, fade: 1 } : { grant: T.grant, cost: T.cost, years: w.years, fade: 1 };
          e.fx.demand = T.demand;
          e.fx.sat = { v: T.sat, months: 12 };
          if (w.regions) e.fx.strike = { region: w.regions, pop: T.pop, jobs: T.jobs };
          const a = ymYear(e.y, e.m); if (t._from == null) t._from = a; t._to = a + w.years;
        }
      } },
    disaster: { mod: 'event', name: '灾害',
      effect: function (t) { return '出行骤降、满意度下降，之后恢复' + (t.damage ? '；范围内高架与地面的轨道、车站受损，按重建造价的约 ' + Math.round(TIER.disaster[lv(t)].repair.share * 100) + '% 一次付清维修费' : ''); },
      needs: function (t, D) { return needEvent(t.on, D).concat(t.damage && !damageArea(t.damage.area) ? ['damage.area 要写多边形（格坐标，至少 3 点）或 { x, y, r }'] : []); },
      build: function (t, c) {
        const T = TIER.disaster[lv(t)], e = eventAt(c.D, t.on);
        e.fx.demand = T.demand; e.fx.sat = T.sat;
        // 受损范围（v3.1）：事件当月按范围内裸露的轨道与车站结算一次维修费（Damage.apply），不停运
        if (t.damage) e.fx.damage = { area: t.damage.area, types: t.damage.types || ['elevated', 'surface'], share: T.repair.share, cap: T.repair.cap };
        if (T.cost) e.fx.finance = { cost: T.cost, years: 1, fade: 1 };
        t._from = ymYear(e.y, e.m); t._to = t._from + (T.demand.months || 1) / 12 + (T.demand.fade || 0);
      } },
    accident: { mod: 'event', name: '工程事故',
      effect: function (t) { return '满意度下降，之后两年造价上升约 ' + pct(TIER.accident[lv(t)].cost) + '%'; },
      needs: function (t, D) { return needEvent(t.on, D); },
      build: function (t, c) {
        const T = TIER.accident[lv(t)], e = eventAt(c.D, t.on);
        e.fx.sat = { v: T.sat, months: 12 }; e.fx.finance = { cost: T.cost, years: 2, fade: 1 };
        t._from = ymYear(e.y, e.m); t._to = t._from + 2;
      } },
    rival: { mod: 'transport', name: '既有公交竞争', effect: function () { return '铁路、电车、渡轮或步行分走一部分客流，比重随年代变化'; },
      needs: function (t, D) { return hasData(D.bg, '没有背景交通'); } },
    modeChart: { mod: 'transport', name: '出行结构图', effect: function () { return '发展阶段页显示各种方式的比重变化'; },
      needs: function (t, D) { return hasData(D.bg && D.bg.modes, '没有分方式数据'); } },
    // 铁路与渡轮走廊（v2.9）：bg.lines 按真实线路声明普通铁路和渡轮（车站、走向、开停年月、速度、班次、票价类别），按站点分走沿线出行（bgnet.js）
    corridors: { mod: 'transport', name: '铁路与渡轮走廊', effect: function () { return '真实的铁路和渡轮按线路与车站分走沿线出行；离车站越近、线路越直，竞争越强，线路照顾不到的地方地铁潜力更大'; },
      needs: function (t, D) { return hasData(D.bg && D.bg.lines && D.bg.lines.length, '没有背景交通线路'); } },
    // 既有铁路接管与现代化改造（v3.0）：lines 里写一两条指定的既有铁路（车站、区间、地面图上的铁路名、开放年月、费用倍数、背景交通扣减），
    // 到年份后可以按区间接管：一次付清，立即得到轨道、车站和基础车队（takeover.js）。on 是接管开放当月的事件
    railTakeover: { mod: 'transport', name: '既有铁路接管',
      effect: function (t) { const R = (t.lines || [])[0], y = R && R.open ? (Array.isArray(R.open) ? R.open[0] : R.open) : ''; return (y ? y + ' 年起' : '') + '可以按区间接管指定的既有铁路：按当年物价一次付清接管与现代化改造费，立即得到轨道、车站和基础车队并投入运营；没接管的区段照常作为背景铁路'; },
      needs: function (t, D) {
        const out = [], L = t.lines || [];
        if (!L.length || L.length > 2) out.push('要写一到两条线路');
        for (const R of L) {
          if (!R.id || !R.name || !R.short || !R.open || !R.rail || !R.rail.length || !R.stops || R.stops.length < 2 || !R.routes || !R.routes.length) { out.push('线路缺编号、名称、开放年月、铁路名、车站或区间：' + (R.id || '?')); continue; }
          const ids = new Set(); for (const s of R.stops) { if (!s.id || !s.n || !s.at) out.push(R.id + ' 的车站缺编号、站名或位置'); if (ids.has(s.id)) out.push(R.id + ' 的车站编号重复：' + s.id); ids.add(s.id); }
          for (const r of R.routes) for (const id of r.stops) if (!ids.has(id)) out.push(R.id + ' 的区间引用了不存在的车站：' + id);
        }
        return out;
      },
      build: function (t, c) { c.D.takeover = t.lines; if (t.on) eventAt(c.D, t.on); const R = t.lines[0]; t._from = Array.isArray(R.open) ? ymYear(R.open[0], R.open[1]) : R.open; } },
    roadRefill: { mod: 'transport', name: '道路回填', effect: function () { return '地铁空出的路面有一部分会被其他车辆重新占满'; },
      needs: function (t, D) { return hasData(D.bg && D.bg.roadKeep, '没有道路回填数据'); } },
    // 路面公交竞争（v3.0）：背景交通写了 bg.road（每位乘客占用的路面，相对小汽车乘客）时，公交与小巴走道路、和汽车一起堵，
    // 行程时间按拥堵后的车速（bg.slow 倍）加候车；地铁分走的乘客多来自公交与小巴，路面只空出一部分
    roadTransit: { mod: 'transport', name: '路面公交竞争',
      effect: function () { return '公交和小巴与汽车一起走道路、一起堵；它们载客多、占路少，改乘地铁的人多来自公交和小巴，所以路面只空出一部分'; },
      needs: function (t, D) { return hasData(D.bg && D.bg.road, '没有路面公交数据'); } },
    carLimit: { mod: 'transport', name: '限车政策',
      effect: function (t) { return t.existing ? '开车成本上升，改乘地铁的人增加' : '开车成本提高约 ' + pct(TIER.car[lv(t)]) + '%，改乘地铁的人增加'; },
      needs: function (t, D) { return needEvent(t.on, D); },
      build: function (t, c) {
        const k = TIER.car[lv(t)], e = eventAt(c.D, t.on), yr = ymYear(e.y, e.m);
        e.fx.car = { k: k };
        c.cfg.choice = Object.assign({}, c.cfg.choice, { carCostPerKm: stepCurve(c.cfg.choice.carCostPerKm, yr, k) });
        t._from = yr;
      } },
    hubMove: { mod: 'hub', name: '枢纽迁移', effect: function () { return '旧机场关闭后，用地重新开发'; },
      needs: function (t, D) { return hasData(D.airport && D.airport.closeYear, '没有迁移的机场'); } },
    portal: { mod: 'hub', name: '图外接驳', effect: function () { return '接通接驳口后，图外的机场或跨境客流才能乘地铁'; },
      needs: function (t, D) { return hasData((D.facilities || []).some(function (f) { return f.ext; }), '没有图外设施'); } },
    // 城市连接（v2.7）：两张相邻的地图各算各的，在边境设接驳口。接通后过境旅客可以乘地铁、可以收跨境附加费、可以切换到对岸（只切同一模式的存档），
    // 并在地图上半透明地看到对岸最新存档的线网。对岸的线网只读，不参与模拟。每个接驳口写 id、n、to、at、dir、y、pax，可选 title、desc、tag 生成事件
    cityLink: { mod: 'hub', name: '城市连接',
      effect: function () { return '接通边境的接驳口后，过境旅客可以乘地铁，可以单独设跨境附加费，能切换到对岸，也能看到对岸的线网'; },
      needs: function (t) { return hasData(t.map && t.name && t.gates && t.gates.length, '城市连接缺对岸地图或接驳口'); },
      build: function (t, c) {
        const D = c.D; D.facilities = D.facilities || []; const ids = [];
        for (const q of t.gates) {
          D.facilities.push({ id: q.id, n: q.n, t: 'rail', gate: true, ext: [q.dir || 'S', 0], to: q.to, at: q.at, y0: q.y, pax: q.pax, note: q.note || '' });
          if (q.title) eventAt(D, { y: q.y[0], m: q.y[1], title: q.title, desc: q.desc || '', tag: q.tag });
          ids.push(q.id);
        }
        D.cityLink = { map: t.map, name: t.name, gates: ids, ach: t.ach || null, region: t.region || null };   // region：图内对岸城市的片区，接通后点击可以进入对岸
        t._from = ymYear(t.gates[0].y[0], t.gates[0].y[1]);
      } },
    // 旅游客流（v3.0）：标了 tour 的景点，游客量按 D.tourism 的年份曲线起落（写明区间的历史事件与旅游业发展），由地铁接到景点就有游客的票款
    tourism: { mod: 'hub', name: '旅游客流',
      effect: function (t, c) {
        const D = (c && c.D) || CM.DATA, T = D.tourism || [], lo = T.reduce(function (a, p) { return p[1] < a[1] ? p : a; }, [0, 9]), hi = T.reduce(function (a, p) { return p[1] > a[1] ? p : a; }, [0, 0]);
        return '景点的游客随旅游业起落' + (T.length ? '（低谷约为基准的 ' + Math.round(lo[1] * 100) + '%，高峰约 ' + Math.round(hi[1] * 100) + '%）' : '') + '；地铁接到景点，就有不靠通勤的票款';
      },
      needs: function (t, D) { return hasData(D.tourism && D.tourism.length && (D.facilities || []).some(function (f) { return f.tour; }), '没有旅游曲线或旅游景点'); } },
    megaEvent: { mod: 'hub', name: '大型活动',
      effect: function (t) { return t.existing ? '活动带来出行高峰与专项任务' : '从获得主办权到开幕，拨款增加约 ' + pct(TIER.invest[lv(t)]) + '%；开幕时有出行高峰' + (t.foresight ? '；' + t.foresight.before + ' 年前通到场馆一带可以得到出资' : ''); },
      needs: function (t, D) { return needEvent(t.bid, D).concat(t.foresight ? needLandmarks(t.foresight.at ? [t.foresight.at] : [], D).concat(needRegions(t.foresight.region, D)) : []); },
      build: function (t, c) {
        const e = eventAt(c.D, t.bid), a = ymYear(e.y, e.m), b = ymYear(t.open[0], t.open[1]);
        e.fx.finance = { grant: TIER.invest[lv(t)], years: Math.round((b - a) * 10) / 10, fade: 1 };
        t._from = a; t._to = b;
        if (t.foresight) addForesight(t.foresight, c);
      } },
    railProperty: { mod: 'land', name: '沿线物业',
      effect: function (t) { const T = TIER.property[lv(t)]; return '车站商业收入 ×' + num(T.k) + '，铁路＋物业合同约占新线招标的 ' + Math.round(T.tender * 100) + '%'; },
      build: function (t, c) { const T = TIER.property[lv(t)]; c.cfg.economy = Object.assign({}, c.cfg.economy, { todK: T.k, todTender: T.tender }); } },
    foresight: { mod: 'land', name: '提前布局',
      effect: function (t) { const T = TIER.foresight[lv(t)]; return t.ym[0] + ' 年判定：已有 ' + t.before + ' 年前建成的车站，就得到 ' + T.months + ' 个月拨款的出资，片区增长更快'; },
      needs: function (t, D) { return needLandmarks(t.at ? [t.at] : [], D).concat(needRegions(t.region, D)); },
      build: addForesight },
    landBoom: { mod: 'land', name: '地价冲击',
      effect: function (t) { return '限时造价上升约 ' + pct(TIER.boom[lv(t)]) + '%'; },
      needs: function (t, D) { return needEvent(t.on, D); },
      build: function (t, c) { addFinance(t, c, { cost: TIER.boom[lv(t)] }); } },
    // 融资制度是所有真实城市的基础机制，不在特色页列出
    finance: { base: true, mod: 'policy', name: '融资制度', effect: function () { return ''; },
      needs: function (t) { return hasData(FLAVOR[t.flavor], '未知的融资制度：' + t.flavor); },
      build: function (t, c) { c.D.corpFlavor = t.flavor; } },
  };

  // 展开：m.cfg 换成本图自己的副本，不影响共用的默认值
  const compile = function (m) {
    const L = m.data && m.data.traits; if (!L || !L.length) return;
    m.cfg = Object.assign({}, m.cfg);
    const c = { m: m, D: m.data, cfg: m.cfg };
    for (const t of L) {
      if (t.span) { t._from = t.span[0]; t._to = t.span[1]; }
      const def = LIB[t.use]; if (!def || !def.build) continue;
      if (t.existing && t.use !== 'transition') continue;
      def.build(t, c);
    }
  };
  // 校验（scripts/prepare-game.mjs 调用）：片区与地标存在、事件与日期有效、招牌不超过 3 项、有史实依据
  const validate = function (m) {
    const L = (m.data && m.data.traits) || [], D = m.data, S = m.cfg.START.y, out = [];
    if (m.kind === 'real' && !L.some(function (t) { return t.use === 'finance'; })) out.push('真实城市必须声明融资制度');
    let stars = 0;
    const inRange = function (y, what) { if (y < S || y > 2060) out.push(what + '不在模拟范围内：' + y); };
    for (const t of L) {
      const def = LIB[t.use];
      if (!def) { out.push('未知机制：' + t.use); continue; }
      if (t.level && LV[t.level] == null) out.push(t.use + '：未知强度 ' + t.level);
      if (!def.base && !t.why) out.push(t.use + '：缺史实依据');
      if (t.star) { stars++; if (!t.text) out.push(t.use + '：招牌缺一句话介绍'); }
      if (def.needs) for (const e of def.needs(t, D, m.cfg)) out.push(t.use + '：' + e);
      if (t.use === 'foresight') { inRange(t.ym[0], '判定日期'); inRange(t.before, '最晚通车年份'); if (t.before > t.ym[0]) out.push('foresight：最晚通车年份晚于判定日期'); }
      if (t.use === 'megaEvent' && !t.existing) { inRange(t.bid.y, '主办权日期'); if (t.foresight) inRange(t.foresight.before, '最晚通车年份'); }
      if (t.use === 'cityLink') {
        const other = CM.MAPS && CM.MAPS[t.map], back = other && other.data && other.data.cityLink;
        if (!other) out.push('cityLink：对岸地图不存在：' + t.map); else if (!back || back.map !== m.id) out.push('cityLink：对岸地图没有连回来：' + t.map);
        for (const q of t.gates || []) { inRange(q.y[0], '接驳口开放日期'); if (!q.at || !q.pax || !q.to) out.push('cityLink：接驳口缺位置、客流或去向：' + q.id); }
        if (t.region) for (const e of needRegions([t.region], D)) out.push('cityLink：' + e);
      }
    }
    if (stars > 3) out.push('招牌超过 3 项：' + stars);
    return out;
  };
  // 地图卡片的招牌：[图标, 标题, 一句话]
  const cards = function (m) {
    return ((m.data && m.data.traits) || []).filter(function (t) { return t.star; }).map(function (t) { const def = LIB[t.use]; return [t.icon || MODULES[def.mod].icon, t.label || def.name, t.text]; });
  };
  // 状态：长期 / 未到 / 生效中 / 已结束；提前布局显示判定结果
  const stateOf = function (t, g) {
    const now = g.year();
    if (t.use === 'foresight') {
      const r = g.foresight && g.foresight[t.id];
      if (r) return r.hit ? { cls: 'good', text: '已提前布局' } : { cls: '', text: '未赶上' };
      return { cls: 'info', text: t.ym[0] + ' 年判定' };
    }
    if (t._from == null) return { cls: 'info', text: '长期生效' };
    if (now < t._from - 1e-6) return { cls: '', text: Math.floor(t._from) + ' 年起' };
    if (t._to != null && now >= t._to) return { cls: '', text: '已过去' };
    return { cls: 'good', text: '生效中' };
  };
  // 提前布局的进度：离判定还有多久、现在算不算数（只读线网，打开页面时算一次）
  const foresightHint = function (t, g) {
    const f = (CM.DATA.foresight || []).find(function (q) { return q.id === t.id; }); if (!f) return null;
    const r = g.foresight && g.foresight[t.id];
    if (r) return r.late ? null : r.hit ? { good: true, text: '开发启动时已有' + r.st + '站' } : null;
    const M = CM.Metro, net = g.net, before = U.ymIndex(f.before, 1);
    for (const id in net.stations) {
      const s = net.stations[id]; if (s.v || !s.built || U.dist(s.x, s.y, f.x, f.y) > f.r || U.ymIndex(s.built[0], s.built[1] || 1) >= before) continue;
      if (M.stationLines(net, id).length) return { good: true, text: '已经就位：' + s.name + '站' };
    }
    const left = f.before - g.clock.y;
    return left > 0 ? { text: '还有 ' + left + ' 年：' + f.before + ' 年前通车才算数' } : { text: '已经来不及抢先了' };
  };
  // 铁路接管的进度（只读线网）
  const takeoverHint = function (t, g) {
    const TK = CM.Takeover; if (!TK) return null;
    const parts = []; let any = false;
    for (const R of t.lines || []) { const s = TK.stats(g.net, R, g.year()); if (s.taken > 0) any = true; parts.push(R.short + ' ' + (s.taken > 0 ? '已接管 ' + U.fmtNum(s.taken, 1) + ' / ' + U.fmtNum(s.all, 1) + ' km' : '尚未接管')); }
    return { good: any, text: parts.join('；') };
  };
  // 定位到地图：片区或地点
  const placeOf = function (t) {
    const D = CM.DATA, lm = function (id) { return (D.landmarks || []).find(function (l) { return l.id === id; }); };
    const fs = t.use === 'foresight' ? t : t.foresight;
    if (fs) { const f = (D.foresight || []).find(function (q) { return q.id === fs.id; }); if (f) return { x: f.x, y: f.y, r: f.r, label: fs.title }; }
    if (t.regions && t.regions.length) return { region: t.regions[0] };
    if (t.region) return { region: [].concat(t.region)[0] };
    const g0 = t.guards && t.guards[0]; if (g0) { const L = lm(typeof g0 === 'string' ? g0 : g0.lm); if (L) return { x: L.x, y: L.y, r: 1.4, label: L.name }; }
    if (t.use === 'scenic') { const r = (D.regions || []).find(function (q) { return q.scenic; }); if (r) return { region: r.id }; }
    return null;
  };
  // 特色线上的车站：有明确年份的机制，一项可以有几站（主办权与开幕、停产与转型）
  const stopsOf = function (t) {
    const label = t.label || LIB[t.use].name, one = function (d, sub) { return { y: d.y, m: d.m || 1, label: label, sub: sub || '', use: t.use, t: t }; };
    if (t.use === 'foresight') return [one({ y: t.ym[0], m: t.ym[1] })];
    if (t.use === 'megaEvent' && t.bid) return [one(t.bid, '获主办权'), one({ y: t.open[0], m: t.open[1] }, '开幕')];
    if (t.use === 'war' && t.events) return t.events.map(function (e) { return one(e); });    if (t.use === 'transition' && !t.existing) { const o = []; if (t.close) o.push(one(t.close, '停产')); if (t.renew) o.push(one(t.renew, '转型')); return o; }
    if (t.on) return [one(t.on)];
    if (t.span) return [one({ y: t.span[0], m: 1 })];
    return [];
  };
  const stops = function () {
    const out = [];
    for (const t of CM.DATA.traits || []) if (LIB[t.use] && !LIB[t.use].base) out.push.apply(out, stopsOf(t));
    return out.sort(function (a, b) { return a.y + a.m / 12 - b.y - b.m / 12; });
  };
  // 特色页：按模块分组，只列本城选用的机制（融资制度等基础机制不列）
  const view = function (g) {
    const L = (CM.DATA.traits || []).filter(function (t) { return LIB[t.use] && !LIB[t.use].base; }), out = [];
    for (const k in MODULES) {
      const items = L.filter(function (t) { return LIB[t.use].mod === k; }); if (!items.length) continue;
      out.push({ id: k, name: MODULES[k].name, icon: MODULES[k].icon, items: items.map(function (t) {
        const def = LIB[t.use];
        return { use: t.use, label: t.label || def.name, kind: def.name, star: !!t.star, text: t.text, state: stateOf(t, g), effect: def.effect(t), why: t.why, place: placeOf(t), hint: t.use === 'foresight' ? foresightHint(t, g) : t.foresight ? foresightHint(t.foresight, g) : t.use === 'railTakeover' ? takeoverHint(t, g) : null,
          open: t.use === 'railTakeover' && t.lines && t.lines[0] ? ['takeover', t.lines[0].id] : null };
      }) });
    }
    return out;
  };
  // ======================== 考古发现（v3.0） ========================
  // 只在确认建设草案时判定：草案在保护区内的地下工点逐个取一次稳定随机数（存档编号 × 工点所在格），读档重来结果不变，判定过的工点记入 g.digs。
  // 发现后一次付清调查与保护费（单次有上限），工期不变；有展示价值的发现让附近的旅游景点在明确的年份区间内多吸引游客（Fac.share 读取 DATA._finds）
  const Arch = {};
  const SITE_M = 1000;   // 保护区内的地下区间每约 1 km 算一处工点
  const KINDS = ['古代建筑基址', '陶器与钱币窖藏', '古代墓葬', '古代水渠遗迹', '城墙与城门基础', '石刻与雕像残件'];
  Arch.on = function () { return !!(CM.DATA && CM.DATA.archaeo); };
  Arch.tier = function () { return TIER.archaeo[CM.DATA.archaeo.level]; };
  const inZone = function (city, c) {
    if (c < 0 || !city.heritage || !city.heritage[c]) return false;
    const A = CM.DATA.archaeo; if (!A.regions || city.heritage[c] === 2) return true;
    return A.regions.indexOf(city.regions[city.region[c]].id) >= 0;
  };
  const roll = function (g, c, salt) { return parseInt(U.fnv((g.id || g.seed) + ':' + c + ':' + salt), 16) / 4294967296; };   // 字符串哈希：相邻格号的结果互不相关
  // 只统计本次挖掘：新增地下站台、搬迁的地下车站及新建或改线的地下区间
  Arch.sites = function (g, ev) {
    const d = g.draft; if (!Arch.on() || !d || !g.city.heritage) return [];
    const Mt = CM.Metro, city = g.city, net = d.net, off = g.net, year = g.clock.y, out = [], dug = g.digs || {};
    const H = CM.CFG.cost.heritage || {}, km = CM.CFG.cost.trackPerKm.underground * Mt.costIndex(year) / 1000;
    const add = function (c, x, y, name, cost) { if (dug[c] || out.some(function (s) { return s.c === c; })) return; out.push({ c: c, x: x, y: y, name: name, cost: cost }); };
    const reset = new Set(ev.siteReset || []);
    for (const id in net.stations) {
      const s = net.stations[id], o = off.stations[id];
      if (s.v || !Mt.stationLevels(net, id).includes('underground')) continue;   // 虚拟节点没有车站开挖
      if (o && !reset.has(id) && Mt.stationLevels(off, id).includes('underground')) continue;
      const c = city.cellAt(s.x, s.y); if (!inZone(city, c)) continue;
      const cost = Mt.stationCost('underground', s.size, year);
      const works = s.type === 'underground'
        ? cost + Mt.heritageStationFee(city, s.x, s.y, s.type, s.size, year)
        : cost * (CM.CFG.metro.levelFactor || 0.6);
      add(c, s.x, s.y, s.name + '站', works);
    }
    const existingTracks = new Set(Object.values(off.segments).filter(function (s) { return s.type === 'underground'; }).map(Mt.trackKey));
    const checkedTracks = new Set();
    for (const id in net.segments) {
      const s = net.segments[id], o = off.segments[id];
      if (s.type !== 'underground') continue;
      const key = Mt.trackKey(s);
      if ((!o || o.line !== s.line) && existingTracks.has(key)) continue;
      const gm = Mt.segGeom(net, s, city), P = gm.pts, cum = gm.cum;
      const oldGeom = o && o.type === s.type ? Mt.segGeom(off, o, city) : null;
      if (oldGeom === gm) continue;
      if (checkedTracks.has(key)) continue;
      checkedTracks.add(key);
      // 改线、插站和拆站后，仍在原隧道里的部分不产生新工点。
      const oldTunnels = (s.base || []).filter(function (id) {
        return off.segments[id] && off.segments[id].type === 'underground';
      }).map(function (id) { return Mt.segGeom(off, off.segments[id], city).pts; });
      if (oldGeom) oldTunnels.push(oldGeom.pts);
      let run = 0, mark = null;
      const flush = function () { if (mark && run >= 150) add(mark[0], mark[1], mark[2], city.heritageName(mark[0]) + '隧道工点', run * km * (city.heritage[mark[0]] === 2 ? H.guard || 1 : H.tunnel || 1)); run = 0; mark = null; };
      for (let i = 0; i + 1 < P.length; i++) {
        const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2, c = city.cellAt(mx, my);
        if (!inZone(city, c) || oldTunnels.some(function (pts) { return U.distToPoly(mx, my, pts) < 1 / CM.CFG.CELL_M; })) { flush(); continue; }
        run += (cum[i + 1] - cum[i]) * CM.CFG.CELL_M;
        if (!mark && run >= SITE_M * 0.4) mark = [c, mx, my];   // 工点取这一段的中部
        if (run >= SITE_M) flush();
      }
      flush();
    }
    return out;
  };
  // 草案面板的提示：工点数、至少发现一处的概率、最多要付的调查与保护费
  Arch.risk = function (g, ev) {
    const S = Arch.sites(g, ev); if (!S.length) return null;
    const T = Arch.tier(); let none = 1, fee = 0;
    for (const s of S) { none *= 1 - T.p; fee += s.cost * T.fee; }
    return { n: S.length, p: 1 - none, fee: Math.min(fee, T.cap * g.econ.grantQuota(g.clock.y, g.clock.m)) };
  };
  // 有展示价值的发现：附近（默认 2.5 km 内）运营中的旅游景点，按年份区间提高吸引力
  const tourFac = function (g, x, y) {
    const Fac = CM.Fac; if (!Fac) return null;
    const r = (CM.DATA.archaeo.near || 2.5) * 1000 / CM.CFG.CELL_M, yr = g.year();
    let best = null, bd = r;
    for (const f of Fac.list()) { if (!f.tour || f.ext || !Fac.active(f, yr, g.city)) continue; const dd = U.dist(x, y, f.x, f.y); if (dd < bd) { bd = dd; best = f; } }
    return best;
  };
  Arch.judge = function (g, ev) {
    const S = Arch.sites(g, ev); if (!S.length) return null;
    const T = Arch.tier(), y = g.clock.y, m = g.clock.m, t = y + (m - 1) / 12, dug = g.digs || (g.digs = {});
    const found = [];
    let fee = 0;
    for (const s of S) {
      dug[s.c] = 1;
      if (roll(g, s.c, 7919) >= T.p) continue;
      fee += s.cost * T.fee;
      const f = roll(g, s.c, 104729) < T.find ? tourFac(g, s.x, s.y) : null;
      found.push({ id: 'ar' + y + '-' + m + '-' + s.c, y: y, m: m, x: +s.x.toFixed(2), yy: +s.y.toFixed(2), site: s.name, kind: KINDS[Math.floor(roll(g, s.c, 31337) * KINDS.length)], fee: 0, fac: f ? f.id : null, facName: f ? CM.Fac.shortName(f) : null, k: f ? T.k : 1, from: +(t + 1).toFixed(3), to: +(t + 11).toFixed(3) });
    }
    if (!found.length) return { finds: [], fee: 0, sites: S.length };
    fee = Math.min(fee, T.cap * g.econ.grantQuota(y, m));
    found.forEach(function (q) { q.fee = fee / found.length; });
    g.econ.spendBuild({ construction: fee }, '考古调查与保护（' + found.length + ' 处）', { y: y, m: m, d: g.clock.d });
    g.finds = (g.finds || []).concat(found);
    Arch.attach(g);
    for (const q of found) g.logEvent({ tag: '特色', title: '考古发现：' + q.site, desc: '施工中发现' + q.kind + '，另付调查与保护费' + U.fmtMoney(q.fee) + '，工期不变。' + (q.fac ? '出土文物就近展示，' + q.facName + '的游客从 ' + Math.floor(q.from) + ' 年起增加，约持续到 ' + Math.floor(q.to) + ' 年。' : '文物移交博物馆收藏。') });
    return { finds: found, fee: fee, sites: S.length };
  };
  // 景点吸引倍数：发现后第 1 年起到第 11 年为 k，之后两年回落；同一景点叠加不超过 1.5 倍
  Arch.facK = function (id, yr) {
    let k = 1;
    for (const q of CM.DATA._finds || []) {
      if (q.fac !== id || yr < q.from) continue;
      k *= yr < q.to ? q.k : yr < q.to + 2 ? 1 + (q.k - 1) * (1 - (yr - q.to) / 2) : 1;
    }
    return Math.min(1.5, k);
  };
  // 开局与读档时接上本局的发现（地图数据对象跨局复用，必须每局重设）
  Arch.attach = function (g) { if (CM.DATA) CM.DATA._finds = (g && g.finds) || null; };

  // ---------- 灾害维修（v3.1）：写了 damage 的灾害事件当月结算一次 ----------
  // 范围内（多边形或圆）按 types 所列建设方式（默认高架、地面）的轨道按落在范围内的长度、车站按所在位置，计重建造价（当年造价指数），
  // 乘本档比例，封顶为若干个月的基础拨款；共线轨道只算一次。线路照常运营，地下部分不受影响
  const Damage = {};
  const inArea = function (A, x, y) {
    if (!Array.isArray(A)) return U.dist(x, y, A.x, A.y) <= A.r;
    let c = false; for (let i = 0, j = A.length - 1; i < A.length; j = i++) { const a = A[i], b = A[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
    return c;
  };
  // 按每段实际进入范围的长度计量，航点插值密度不影响维修费。
  function damagedLength(area, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (!length) return 0;
    if (!Array.isArray(area)) {
      const x = area.x - a[0], y = area.y - a[1];
      const offset = (x * dy - y * dx) / length;
      const half = area.r * area.r - offset * offset;
      if (half <= 0) return 0;
      const mid = (x * dx + y * dy) / length, reach = Math.sqrt(half);
      return Math.max(0, Math.min(length, mid + reach) - Math.max(0, mid - reach));
    }
    const cuts = [0, 1];
    for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
      const p = area[j], q = area[i], ex = q[0] - p[0], ey = q[1] - p[1];
      const cross = dx * ey - dy * ex;
      if (!cross) continue;
      const px = p[0] - a[0], py = p[1] - a[1];
      const t = (px * ey - py * ex) / cross, u = (px * dy - py * dx) / cross;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);
    let fraction = 0;
    for (let i = 1; i < cuts.length; i++) {
      const mid = (cuts[i - 1] + cuts[i]) / 2;
      if (inArea(area, a[0] + dx * mid, a[1] + dy * mid)) fraction += cuts[i] - cuts[i - 1];
    }
    return length * fraction;
  }
  Damage.apply = function (g, e) {
    const d = e.fx && e.fx.damage, M = CM.Metro; if (!d || !g.net || !M) return null;
    const net = g.net, yr = g.year(), types = d.types || ['elevated', 'surface'], seen = new Set();
    let km = 0, nst = 0, fee = 0;
    for (const id in net.segments) {
      const s = net.segments[id]; if (types.indexOf(s.type) < 0) continue;
      const k = M.trackKey(s); if (seen.has(k)) continue; seen.add(k);
      const gm = M.segGeom(net, s, g.city), pts = gm.pts || []; if (!gm.lenM) continue;
      let length = 0;
      for (let i = 1; i < pts.length; i++) length += damagedLength(d.area, pts[i - 1], pts[i]);
      if (!length) continue;
      const affectedM = Math.min(gm.lenM, length * CM.CFG.CELL_M);
      km += affectedM / 1000;
      fee += M.trackCost(gm, s.type, yr) * affectedM / gm.lenM;
    }
    for (const id in net.stations) {
      const s = net.stations[id]; if (s.v || !inArea(d.area, s.x, s.y)) continue;
      const exposed = (s.lv ? M.stationLevels(net, id) : [s.type]).filter(t => types.includes(t));
      if (!exposed.length) continue;
      nst++;
      for (const t of exposed) fee += M.stationCost(t, s.size, yr) * (t === s.type ? 1 : CM.CFG.metro.levelFactor || 0.6);
    }
    if (!(fee > 0)) return { fee: 0, km: 0, stations: 0 };
    fee = Math.min(fee * d.share, d.cap * g.econ.grantQuota(g.clock.y, g.clock.m));
    g.econ.spendBuild({ construction: fee }, e.title + '：灾后维修（' + nst + ' 座车站、' + km.toFixed(1) + ' km 轨道）', { y: g.clock.y, m: g.clock.m, d: g.clock.d });
    return { fee: fee, km: km, stations: nst };
  };
  Damage.note = function (r) { return r && r.fee > 0 ? ' 地铁受损：' + r.stations + ' 座高架或地面车站、' + r.km.toFixed(1) + ' km 轨道需要维修，维修费 ' + U.fmtMoney(r.fee) + '，线路照常运营。' : ''; };
  CM.Traits = { MODULES: MODULES, LIB: LIB, TIER: TIER, FLAVOR: FLAVOR, compile: compile, validate: validate, cards: cards, view: view, stops: stops, Arch: Arch, Damage: Damage };
})(window.CM);
