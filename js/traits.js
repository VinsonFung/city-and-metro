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
      { demand: { hw: 0.95, sh: 0.9, lz: 0.8, months: 1 }, sat: { v: -0.5, months: 3 } },
      { demand: { hw: 0.85, sh: 0.75, lz: 0.6, months: 1, fade: 0.25 }, sat: { v: -1, months: 6 } },
      { demand: { hw: 0.7, sc: 0.8, sh: 0.6, lz: 0.5, months: 3, fade: 1 }, sat: { v: -2, months: 9 }, cost: 1.1 },
    ],
    accident: [{ sat: -1, cost: 1.05 }, { sat: -1.5, cost: 1.1 }, { sat: -2.5, cost: 1.2 }],
    war: [
      { grant: 0.75, cost: 1.15, pop: 0.02, jobs: 0.02, demand: { hw: 0.9, sh: 0.8, lz: 0.7, months: 6, fade: 1 }, sat: -1 },
      { grant: 0.6, cost: 1.25, pop: 0.06, jobs: 0.08, demand: { hw: 0.8, sh: 0.65, lz: 0.5, months: 9, fade: 1 }, sat: -1.5 },
      { grant: 0.5, cost: 1.3, pop: 0.15, jobs: 0.2, demand: { hw: 0.7, sh: 0.55, lz: 0.4, months: 12, fade: 1 }, sat: -3 },
    ],
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
      const o = typeof g === 'string' ? { lm: g } : g, lm = (D.landmarks || []).find(function (l) { return l.id === o.lm; });
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
    const bad = []; for (const g of ids || []) { const id = typeof g === 'string' ? g : g.lm; if (!(D.landmarks || []).some(function (l) { return l.id === id; })) bad.push('地标不存在：' + id); }
    return bad;
  };
  const needEvent = function (spec, D) {
    if (!spec || spec.title) return [];
    return (D.events || []).some(function (x) { return x.y === spec.y && (x.m || 1) === (spec.m || 1); }) ? [] : ['事件不存在：' + spec.y + '-' + spec.m];
  };
  const hasData = function (ok, msg) { return ok ? [] : [msg]; };

  // 融资制度（政府合同的名称与开放年份，corp.js 读取）
  const FLAVOR = {
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
      effect: function () { return '出行骤降、满意度下降，之后恢复'; },
      needs: function (t, D) { return needEvent(t.on, D); },
      build: function (t, c) {
        const T = TIER.disaster[lv(t)], e = eventAt(c.D, t.on);
        e.fx.demand = T.demand; e.fx.sat = T.sat;
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
    roadRefill: { mod: 'transport', name: '道路回填', effect: function () { return '地铁空出的路面有一部分会被其他车辆重新占满'; },
      needs: function (t, D) { return hasData(D.bg && D.bg.roadKeep, '没有道路回填数据'); } },
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
      const s = net.stations[id]; if (!s.built || U.dist(s.x, s.y, f.x, f.y) > f.r || U.ymIndex(s.built[0], s.built[1] || 1) >= before) continue;
      if (M.stationLines(net, id).length) return { good: true, text: '已经就位：' + s.name + '站' };
    }
    const left = f.before - g.clock.y;
    return left > 0 ? { text: '还有 ' + left + ' 年：' + f.before + ' 年前通车才算数' } : { text: '已经来不及抢先了' };
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
        return { use: t.use, label: t.label || def.name, kind: def.name, star: !!t.star, text: t.text, state: stateOf(t, g), effect: def.effect(t), why: t.why, place: placeOf(t), hint: t.use === 'foresight' ? foresightHint(t, g) : t.foresight ? foresightHint(t.foresight, g) : null };
      }) });
    }
    return out;
  };
  CM.Traits = { MODULES: MODULES, LIB: LIB, TIER: TIER, FLAVOR: FLAVOR, compile: compile, validate: validate, cards: cards, view: view, stops: stops };
})(window.CM);
