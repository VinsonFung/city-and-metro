'use strict';
// 模拟阶段的城市新项目与大型活动（v3.5）：史料末年（CFG.growth.histEnd）之后，各城按存档种子定期公布
// · 城市新项目：新城、科学城、产业园、大学园区、医疗中心。公示时选好地点（离线网不远、还没有车站、有道路通达、
//   大片项目选人少的地方），预留规划用地；按时间表启用后从全城迁入人口与岗位（全城总量不变）并出现对应设施。
//   启用前在附近设站通车算「提前布局」：有开发商出资（配套任务奖励），之后片区发展更快。
// · 大型活动：国际运动会、国际博览会、国际音乐节。提前数年宣布在已有的体育场、会展中心或公园举办，筹办期间拨款略增；
//   活动期间场馆出现从全城前来的观众（枢纽类设施，按人次计），配套任务考核观众乘地铁的比例；开幕与闭幕当晚在场馆放烟花。
// 都是通用机制：地点按城市现状选取，名称取附近地名，地图数据不必另写；内容标为模拟。状态随存档保存（g.plan）。
// 只在实际游玩时生成（自定义开局年份的快速推演不生成），教程与虚构地图不生成。
(function (CM) {
  const U = CM.U, CFG = CM.CFG, D = CM.DATA;
  const SP = {};
  CM.SimPlan = SP;

  // 城市新项目：r 范围半径（格）；lead 公示到启用的月数；years 迁入持续年数；pop / jobs 迁入总量 [占全城比例, 下限, 上限]；
  // mix 规划用地（范围内尚未开发的格）；fac 启用后出现的设施；reward 配套任务奖励（月基础拨款）；empty 选人少的地方，people 选附近有人的地方；
  // noPlans 不选这些规划的片区（新城不进工业区、港口，产业园不进商务区与老城等）
  const KINDS = {
    newtown: { suf: '新城', w: 3, r: 7, lead: [48, 60], years: 14, pop: [0.0045, 25000, 90000], jobs: [0.0012, 6000, 25000], mix: [['RES', 0.7], ['MIX', 0.2], ['COM', 0.1]], fac: { t: 'shop', suf: '新城中心', w: 0.01 }, reward: 3, empty: true, noPlans: ['ind', 'port', 'expo', 'campus', 'cbd'] },
    sci: { suf: '科学城', w: 2, r: 6, lead: [42, 54], years: 12, pop: [0.0015, 8000, 30000], jobs: [0.004, 15000, 60000], mix: [['COM', 0.45], ['MIX', 0.35], ['RES', 0.2]], fac: { t: 'cbd', suf: '科学城', w: 0.008 }, reward: 3, empty: true, noPlans: ['port', 'expo'] },
    ind: { suf: '产业园', w: 2, r: 6, lead: [36, 48], years: 10, pop: [0.0005, 3000, 12000], jobs: [0.003, 10000, 40000], mix: [['IND', 0.8], ['MIX', 0.1], ['COM', 0.1]], fac: null, reward: 2, empty: true, noPlans: ['cbd', 'expo', 'campus', 'oldmix'] },
    uni: { suf: '大学园区', w: 1.5, r: 3, lead: [36, 48], years: 8, pop: [0.0006, 4000, 12000], jobs: [0.0004, 2000, 6000], mix: [['INST', 0.6], ['RES', 0.4]], fac: { t: 'uni', suf: '大学园区', w: 0.012 }, reward: 1.5, people: true, noPlans: ['ind', 'port', 'expo'] },
    hosp: { suf: '医疗中心', w: 1.5, r: 2, lead: [30, 40], years: 6, pop: [0, 0, 0], jobs: [0.0004, 1500, 5000], mix: [['INST', 0.7], ['RES', 0.3]], fac: { t: 'hosp', suf: '医疗中心', w: 0.02 }, reward: 1, people: true, noPlans: ['ind', 'port', 'expo'] },
  };
  // 大型活动：venues 可用的场馆类别；months 持续月数；mon 开幕月份；visit 每天观众人次 [占全城人口比例, 下限, 上限]；
  // target 观众乘地铁的比例目标；lead 宣布到开幕的月数；grant 筹办期间拨款倍数
  const EVENTS = {
    games: { suf: '国际运动会', w: 4, venues: ['stadium'], months: 1, mon: [8, 9, 10, 11], visit: [0.01, 60000, 220000], target: 0.35, reward: 2, lead: [36, 48], grant: 1.06 },
    expo: { suf: '国际博览会', w: 3, venues: ['venue'], months: 3, mon: [5], visit: [0.006, 40000, 150000], target: 0.3, reward: 2.5, lead: [42, 54], grant: 1.06 },
    music: { suf: '国际音乐节', w: 3, venues: ['stadium', 'park'], months: 1, mon: [7, 10], visit: [0.003, 25000, 70000], target: 0.3, reward: 1, lead: [24, 36], grant: 1 },
  };
  // 节奏：首个项目 / 活动在进入模拟阶段后几个月公布；之后每隔 every 个月；同时在建的项目不超过 projMax；选不到地点时 retry 个月后再试；
  // sep 与其他项目、活动场馆的最小距离（格）
  const PACE = { projFirst: [4, 14], projEvery: [24, 36], projMax: 2, evFirst: [10, 30], evEvery: [48, 72], retry: 6, sep: 14 };

  const ymPair = function (ym) { return [Math.floor(ym / 12), ym % 12 + 1]; };
  const ymOf = function (p) { return U.ymIndex(p[0], p[1]); };
  const ymWords = function (p) { return p[0] + ' 年 ' + p[1] + ' 月'; };
  const rng = function (g, ym, salt) { return new U.RNG((((g.seed | 0) * 31 + ym * 7919 + salt * 104729) >>> 0) || 1); };
  const rint = function (r, ab) { return ab[0] + Math.floor(r.next() * (ab[1] - ab[0] + 1)); };
  const amount = function (spec, base) { return spec[0] > 0 ? Math.round(U.clamp(base * spec[0], spec[1], spec[2]) / 100) * 100 : 0; };
  // 按权重打乱的类别顺序（先抽到的先试）
  const order = function (T, r) {
    const keys = Object.keys(T), out = [];
    while (keys.length) {
      let tot = 0; for (const k of keys) tot += T[k].w;
      let v = r.next() * tot, i = 0;
      for (; i < keys.length - 1; i++) { v -= T[keys[i]].w; if (v < 0) break; }
      out.push(keys.splice(i, 1)[0]);
    }
    return out;
  };

  SP.enabled = function (g) { return !!g && !g.tutorial && !D.fictional && !D.noDynTasks; };
  // 读档与结算恢复时接上：城市持有项目清单（城市增长与设施表要用），恢复规划用地
  SP.attach = function (g) {
    if (!g || !g.city) return;
    g.city.simPlan = g.plan || null;
    SP.sync(g.city);
  };
  SP.sync = function (city) {
    const P = city.simPlan;
    city.planFac = P ? P.items.filter(function (it) { return it.fac; }).map(function (it) { return it.fac; }) : null;
    city.planFacVer = (city.planFacVer || 0) + 1;
    applyLU(city);
    registerNames(city);
  };

  // 英文界面：项目名称整体登记到本地图的英文名表（地名取已有英文名，没有时按拼音），不再逐字拆开翻译
  const EN = { newtown: 'New Town', sci: 'Science City', ind: 'Industrial Park', uni: 'University Campus', hosp: 'Medical Centre' }, EN_FAC = { newtown: 'New Town Centre' };
  function registerNames(city) {
    const M0 = CM.I18N_EN_MAP, P = city.simPlan; if (!M0 || !P || !CM.mapId) return;
    const M = M0[CM.mapId] || (M0[CM.mapId] = {});
    for (const it of P.items) {
      if (it.k !== 'proj' || !it.place || !EN[it.kind]) continue;
      const pe = M[it.place] || (CM.I18N_EN && CM.I18N_EN[it.place]) || (CM.I18n && CM.I18n.name ? CM.I18n.name(it.place) : it.place);
      if (!M[it.name]) M[it.name] = pe + ' ' + EN[it.kind];
      if (it.fac && !M[it.fac.n]) M[it.fac.n] = pe + ' ' + (EN_FAC[it.kind] || EN[it.kind]);
    }
  }
  // 范围内的格（陆地）
  const disk = function (city, x, y, R) {
    const out = [], W = city.W;
    for (let j = Math.max(0, Math.floor(y - R)); j <= Math.min(city.H - 1, Math.floor(y + R)); j++) for (let i = Math.max(0, Math.floor(x - R)); i <= Math.min(W - 1, Math.floor(x + R)); i++) {
      const d = U.dist(i + 0.5, j + 0.5, x, y); if (d > R) continue;
      out.push(j * W + i);
    }
    return out;
  };
  // 项目范围内尚未开发的格改为项目的规划用地（只影响乡村格的开发容量；已有城区不变）。按格号取固定的随机数，读档后结果相同
  function applyLU(city) {
    const P = city.simPlan, LU = CM.LU; if (!P || !LU || !city.plan) return;
    for (const it of P.items) {
      if (it.k !== 'proj') continue;
      const K = KINDS[it.kind]; if (!K) continue;
      for (const c of disk(city, it.x, it.y, it.r)) {
        const p = city.plan[c], L = city.lu[c];
        const k = city.region[c], rg = city.regions[k];
        if (L !== LU.RURAL || p === LU.WATER || p === LU.PARK || p === LU.HILL || p === LU.AIRPORT || !city.regionOpen[k] || rg.scenic || rg.empty || rg.hub || rg.passOnly || city.cellLocked(c)) continue;
        const v = U.hash2(c % city.W, (c / city.W) | 0, (city.seed | 0) + 97);
        let acc = 0, pick = LU[K.mix[0][0]];
        for (const m of K.mix) { acc += m[1]; if (v <= acc) { pick = LU[m[0]]; break; } }
        city.plan[c] = pick;
      }
    }
  }

  // 名称：附近的城镇、街道或村落名（去掉「街道」「镇」等通名），没有时用片区名
  const STRIP = /(街道办事处|街道|社区|地区|管理区|新村|镇|乡|村)$/;
  function nameNear(g, x, y, suf, used) {
    const PL = (CM.GEO && CM.GEO.places) || [], cand = [];
    for (const p of PL) {
      if (p[3] !== 2 && p[3] !== 3) continue;
      const d = U.dist(p[1], p[2], x, y); if (d > 14) continue;
      let n = String(p[0]); const s = n.replace(STRIP, ''); if (s.length >= 2) n = s;
      cand.push([d + (p[3] === 3 ? 2 : 0) + (/[·（(\/]/.test(n) ? 6 : 0), n]);   // 「人和·钟落潭」这类合称排在后面
    }
    cand.sort(function (a, b) { return a[0] - b[0]; });
    for (const c of cand) if (!used.has(c[1] + suf)) return [c[1] + suf, c[1]];
    const rg = g.city.regionAt(x, y), base = rg ? String(rg.name).replace(/（.*）/, '').replace(STRIP, '') : (D.city || '');
    let n = base + suf, k = 2; while (used.has(n)) n = base + suf + ' ' + (k++);
    return [n, base];
  }
  const usedNames = function (g) {
    const s = new Set();
    for (const it of g.plan.items) s.add(it.name);
    for (const f of CM.Fac ? CM.Fac.list(g.city) : []) s.add(f.name);
    return s;
  };

  // ---------------- 城市新项目 ----------------
  // 选址：格网每 3 格取一处候选。须在已开放、可建设的片区，范围内大部分是可开发的陆地且有道路通达；离运营车站不太近（还没有车站）、
  // 也不超出任务的可达范围；与其他项目、活动场馆相隔 PACE.sep 格。大片项目（新城、科学城、产业园）选开发度低的地方，
  // 大学园区与医疗中心选附近有人、3.5 km 内没有同类设施的地方。按离线网的距离加权（近处容易选中）
  function place(g, kind, r) {
    const city = g.city, K = KINDS[kind], LU = CM.LU, W = city.W, H = city.H, R = K.r;
    const RA = city.roadAccess(), G = CM.Tasks.gate(g), facs = CM.Fac ? CM.Fac.list(city) : [];
    const avoid = [];
    for (const it of g.plan.items) if (it.status !== 'done' || it.k === 'proj') avoid.push([it.x, it.y, it.k === 'proj' && it.kind === kind && it.status !== 'done' ? 24 : PACE.sep]);
    for (const f of D.foresight || []) if (isFinite(f.x) && isFinite(f.y) && U.ymIndex(f.ym[0], f.ym[1]) > g.ym()) avoid.push([f.x, f.y, PACE.sep]);
    const same = K.fac ? facs.filter(function (f) { return f.t === K.fac.t && !f.ext; }) : [];
    let best = null, bs = 0;
    for (let y = R; y < H - R; y += 3) for (let x = R; x < W - R; x += 3) {
      const cx = x + 0.5, cy = y + 0.5, c0 = city.cellAt(cx, cy); if (c0 < 0) continue;
      const k0 = city.region[c0], rg0 = city.regions[k0];
      if (!city.regionOpen[k0] || rg0.scenic || rg0.hub || rg0.empty || city.cellLocked(c0) || city.landMax[c0] < 0.5 || K.noPlans.indexOf(rg0.plan || 'res') >= 0) continue;
      if (avoid.some(function (a) { return U.dist(a[0], a[1], cx, cy) < a[2]; })) continue;
      const d = G.dist(cx, cy); if (d < R + 2 || d > G.reach) continue;
      if (K.people && same.some(function (f) { return U.dist(f.x, f.y, cx, cy) < 14; })) continue;
      let n = 0, land = 0, ra = 0, pj = 0;
      for (const c of disk(city, cx, cy, R)) {
        n++;
        const L = city.lu[c], k = city.region[c], rg = city.regions[k];
        if (city.landMax[c] < 0.5 || L === LU.WATER || L === LU.HILL || L === LU.PARK || L === LU.AIRPORT || L === LU.LANDMARK || !city.regionOpen[k] || rg.scenic || rg.empty || K.noPlans.indexOf(rg.plan || 'res') >= 0 || city.cellLocked(c)) continue;
        land++; if (RA[c]) ra++; pj += city.pop[c] + city.jobs[c];
      }
      if (land < n * 0.6 || ra < land * 0.4) continue;
      let s = 1 / Math.pow(1 + d * CFG.CELL_M / 1000 / 4, 2);
      if (K.empty) { const dev = pj / Math.max(1, land * 2000); if (dev > 0.22) continue; s *= 1 - dev; }
      if (K.people) { const ct = G.catchAt(cx, cy); if (ct < G.need * 1.5) continue; s *= Math.min(2, ct / (G.need * 3)); }
      s *= 0.6 + 0.8 * U.hash2(x, y, (g.seed | 0) + g.ym());
      if (s > bs) { bs = s; best = [cx, cy]; }
    }
    return best;
  }
  function newProject(g, ym, r) {
    const P = g.plan, city = g.city;
    if (P.items.filter(function (it) { return it.k === 'proj' && it.status === 'ann'; }).length >= PACE.projMax) return false;
    for (const kind of order(KINDS, r)) {
      const at = place(g, kind, r); if (!at) continue;
      const K = KINDS[kind], used = usedNames(g), nm = nameNear(g, at[0], at[1], K.suf, used), name = nm[0], tot = city.totals();
      const open = ym + rint(r, K.lead), ar = K.empty ? K.r : K.r + 1;
      const it = { id: 'p' + (P.seq++), k: 'proj', kind: kind, name: name, place: nm[1], x: +at[0].toFixed(2), y: +at[1].toFixed(2), r: K.r, ar: ar, ann: ymPair(ym), open: ymPair(open),
        pop: amount(K.pop, tot.pop), jobs: amount(K.jobs, tot.jobs), years: K.years, status: 'ann', task: { st: 'wait' } };
      if (K.fac) {
        const fn = K.fac.suf === K.suf ? name : name.slice(0, name.length - K.suf.length) + K.fac.suf;
        it.fac = { id: 'plan-' + it.id, n: fn, t: K.fac.t, at: [it.x, it.y], y0: it.open, w: K.fac.w, plan: it.id, note: '模拟阶段的城市新项目（非真实设施），' + ymWords(it.open) + '启用' };
      }
      const km = U.fmtNum(ar * CFG.CELL_M / 1000, 1) + ' km';
      it.desc = name + '预计 ' + ymWords(it.open) + '启用，规划' + (it.pop ? '迁入居民约 ' + U.fmtPeople(it.pop) + '、' : '') + '岗位约 ' + U.fmtPeople(it.jobs) + '。启用前在 ' + km + ' 内设站并通车，可获开发商出资，此后 ' + K.years + ' 年片区发展更快。';
      it.taskSpec = { type: 'connect', anchors: [{ name: name, x: it.x, y: it.y, r: ar }], coolKey: 'plan:' + it.id, plan: it.id, cause: '城市新项目「' + name + '」公示',
        title: '「' + name + '」启用前通地铁', desc: it.desc, deadline: it.open, rewardMonths: K.reward };
      P.items.push(it);
      SP.sync(city);
      const title = '城市新项目公示：' + name;
      g.logEvent({ tag: '模拟', title: title, desc: it.desc });
      g.emit('histEvent', { y: ym >= 0 ? Math.floor(ym / 12) : g.clock.y, m: ym % 12 + 1, tag: '模拟', title: title, desc: it.desc, fx: null });
      return true;
    }
    return false;
  }
  // 启用：判定启用前是否已有车站（范围内、当月及以前建成、在线路上），记录结果；没有发出配套任务（名额一直满）却已通车的，启用时补发开发商出资
  function openProject(g, it, y, m) {
    const net = g.net, M = CM.Metro, a = ymOf(it.open);
    let hit = null;
    for (const id in net.stations) {
      const s = net.stations[id];
      if (s.v || !s.built || U.dist(s.x, s.y, it.x, it.y) > it.ar || U.ymIndex(s.built[0], s.built[1] || 1) > a) continue;
      if (M.stationLines(net, id).length) { hit = s; break; }
    }
    it.status = 'open'; it.hit = !!hit; it.st = hit ? hit.name : null;
    let reward = 0;
    // 已发布的任务由任务系统结算，同一个项目只付一笔开发商出资。
    if (hit && it.task?.st !== 'on' && g.econ.mode === 'challenge') {
      reward = (KINDS[it.kind] ? KINDS[it.kind].reward : 1) * g.econ.grantQuota(y, m);
      g.econ.income('reward', reward); g.econ.log('reward', reward, 'gen', '开发商出资：' + it.name, { y: y, m: m, d: 1 });
    }
    const K = KINDS[it.kind] || { years: it.years };
    const desc = hit
      ? it.name + '启用时，地铁已经通到「' + hit.name + '」站。' + (reward > 0 ? '开发商出资 ' + U.fmtMoney(reward) + '。' : '') + '此后 ' + K.years + ' 年这里的人口与岗位增长更快。'
      : it.name + '启用了，附近还没有地铁：先搬来的居民与公司只能开车或坐公交。之后修到这里仍有客流，只是错过了开发商出资。';
    const title = '城市新项目启用：' + it.name;
    g.logEvent({ tag: '模拟', title: title, desc: desc });
    g.emit('toast', { kind: hit ? 'good' : 'info', text: title + (hit ? '：地铁已经通到这里' : '：附近还没有地铁') });
  }

  // ---------------- 大型活动 ----------------
  // 场馆：已在运营的体育场、会展中心或公园（地图数据里的真实设施，不含按片区生成的设施与项目设施），10 年内没办过活动，离线网不超出任务可达范围的 1.3 倍
  function pickVenue(g, E, r) {
    const city = g.city, yr = g.year(), G = CM.Tasks.gate(g), ym = g.ym();
    const usedRecently = function (id) { return g.plan.items.some(function (it) { return it.k === 'event' && it.venue === id && ymOf(it.start) > ym - 120; }); };
    let best = null, bs = 0;
    for (const f of CM.Fac.list(city)) {
      if (E.venues.indexOf(f.t) < 0 || f.ext || f.gen || f.plan || !CM.Fac.active(f, yr, city) || usedRecently(f.id)) continue;
      if (G.dist(f.x, f.y) > G.reach * 1.3) continue;
      if (g.plan.items.some(function (it) { return it.k === 'event' && it.status !== 'done' && U.dist(it.x, it.y, f.x, f.y) < PACE.sep; })) continue;
      const s = (f.lmK >= 0 ? 1.5 : 1) * (0.5 + r.next());
      if (s > bs) { bs = s; best = f; }
    }
    return best;
  }
  // 地图数据里已有的大型活动（带出行高峰的事件，如真实举办的运动会）前后 3 年内不再安排
  // 避开地图数据里写好的大事：带需求或财政冲击的纪事前后五年（如计划中的奥运会之后不紧接着办一届运动会），
  // 场馆活动（v3.6 venueEvents）里单场观众 5 万人次以上的前后三年
  const authoredNear = function (ym) {
    if ((D.events || []).some(function (e) { return e.fx && (e.fx.demand || e.fx.finance) && Math.abs(U.ymIndex(e.y, e.m || 1) - ym) < 60; })) return true;
    const y = Math.floor(ym / 12);
    return (D.venueEvents || []).some(function (v) { return typeof v.visit === 'number' && v.visit >= 5e4 && v.from <= y + 3 && (v.to || 2100) >= y - 3; });
  };
  function newEvent(g, ym, r) {
    const P = g.plan, city = g.city;
    for (const kind of order(EVENTS, r)) {
      const E = EVENTS[kind], v = pickVenue(g, E, r); if (!v) continue;
      let s = ym + rint(r, E.lead); while (E.mon.indexOf(s % 12 + 1) < 0) s++;
      if (authoredNear(s)) continue;
      const e = s + E.months - 1, V = amount(E.visit, city.totals().pop), vn = CM.Fac.shortName(v);
      const name = Math.floor(s / 12) + ' 年' + (D.city || '') + E.suf;
      const it = { id: 'e' + (P.seq++), k: 'event', kind: kind, name: name, venue: v.id, vname: vn, x: +v.x.toFixed(2), y: +v.y.toFixed(2), ann: ymPair(ym), start: ymPair(s), end: ymPair(e),
        visit: V, target: E.target, status: 'ann', task: { st: 'wait' } };
      it.fac = { id: 'plan-' + it.id, n: name, t: 'event', at: [it.x, it.y], y0: it.start, y1: ymPair(e + 1), pax: [[0, +(2 * V / 1e4).toFixed(2)]], r: 0.8, plan: it.id, note: '模拟阶段的大型活动（非真实历史），观众从全城前来' };
      const span = E.months > 1 ? ymWords(it.start) + '至 ' + ymWords(it.end) : ymWords(it.start);
      it.desc = (D.city || '') + '获得「' + name + '」主办权，' + span + '在' + vn + '举行，预计每天约 ' + U.fmtPeople(V) + ' 人次观众。活动期间观众乘地铁的比例达到 ' + U.fmtPct(E.target, 0) + ' 即为办好：在场馆附近设站、加开列车，或从市中心直达，都有帮助。';
      it.taskSpec = { type: 'eventShare', fac: it.fac.id, win: [it.start, it.end], target: E.target, anchors: [{ name: vn, x: it.x, y: it.y, r: 3.2 }], spot: { x: it.x, y: it.y },
        coolKey: 'plan:' + it.id, plan: it.id, cause: '获得「' + name + '」主办权', title: '办好「' + name + '」', desc: it.desc, deadline: it.end, rewardMonths: E.reward };
      P.items.push(it);
      SP.sync(city);
      if (E.grant > 1 && g.econ.mode === 'challenge') g.econ.mods.push({ kind: 'grant', factor: E.grant, until: s - 1, reason: '筹办「' + name + '」' });
      const title = '获得「' + name + '」主办权';
      g.logEvent({ tag: '模拟', title: title, desc: it.desc });
      g.emit('histEvent', { y: Math.floor(ym / 12), m: ym % 12 + 1, tag: '模拟', title: title, desc: it.desc, fx: null });
      return true;
    }
    return false;
  }
  // 活动结果：配套任务记录的观众乘地铁比例（活动期间的最好一个月）
  const eventShare = function (g, it) {
    const id = it.task && it.task.id; if (!id) return null;
    const T = g.tasks, t = T.active.concat(T.done, T.failed, T.adjusted || []).find(function (q) { return q.id === id; });
    return t && t.best != null ? t.best : null;
  };

  // ---------------- 每月 ----------------
  SP.month = function (g, y, m) {
    if (!SP.enabled(g) || y <= CFG.growth.histEnd) return;
    const ym = U.ymIndex(y, m);
    let P = g.plan;
    if (!P) {
      const r0 = rng(g, ym, 1);
      P = g.plan = { v: 1, seq: 1, nextP: ym + rint(r0, PACE.projFirst), nextE: ym + rint(r0, PACE.evFirst), items: [] };
      SP.attach(g);
    }
    if (g.city.simPlan !== P) SP.attach(g);
    for (const it of P.items) {
      if (it.k === 'proj') {
        if (it.status === 'ann' && ym >= ymOf(it.open)) openProject(g, it, y, m);
        else if (it.status === 'open' && ym >= ymOf(it.open) + it.years * 12) it.status = 'done';
      } else if (it.k === 'event') {
        if (it.status === 'ann' && ym >= ymOf(it.start)) {
          it.status = 'on';
          const title = '大型活动「' + it.name + '」开幕';
          g.logEvent({ tag: '模拟', title: title, desc: it.vname + '迎来大批观众，' + (EVENTS[it.kind] && EVENTS[it.kind].months > 1 ? '活动持续到 ' + ymWords(it.end) + '。' : '活动持续约一个月。') });
          g.emit('toast', { kind: 'info', text: title + '：观众从全城赶往' + it.vname });
        } else if (it.status === 'on' && ym > ymOf(it.end)) {
          it.status = 'done';
          const sh = eventShare(g, it); it.share = sh;
          const ok = sh != null && sh >= it.target;
          const desc = sh == null ? '活动期间没有得到观众出行的统计结果。' : '活动期间观众乘地铁的比例为 ' + U.fmtPct(sh, 0) + '（目标 ' + U.fmtPct(it.target, 0) + '）。' + (ok ? '地铁把观众顺利送进送出，市民和来客都很满意。' : '不少观众被堵在路上，报纸批评交通组织不力。');
          g.logEvent({ tag: '模拟', title: '大型活动「' + it.name + '」闭幕', desc: desc });
        }
      }
    }
    const r = rng(g, ym, 7);
    if (ym >= P.nextP) P.nextP = ym + (newProject(g, ym, r) ? rint(r, PACE.projEvery) : PACE.retry);
    if (ym >= P.nextE) P.nextE = ym + (newEvent(g, ym, r) ? rint(r, PACE.evEvery) : PACE.retry);
    applyLU(g.city);   // 片区规划调整（D.replan）可能改写过这些格，每月补回
  };

  // ---------------- 城市增长：启用后的项目从全城迁入人口与岗位（全城总量不变） ----------------
  // 迁入量按启用后的月份递减（前几年多），已提前通地铁的项目多三成。迁入落在范围内有道路通达、还有容量的格，越靠近中心越多，
  // 单月不超过这些格剩余容量的 8%；等量从范围以外的全城各格按比例减去。返回有变化的格（城市化与楼高随之更新）
  let markBuf = null;
  SP.grow = function (city, year, capR, capJ, RA) {
    const P = city.simPlan; if (!P) return null;
    const ym = Math.round(year * 12), list = [];
    for (const it of P.items) {
      if (it.k !== 'proj' || it.status !== 'open') continue;
      const age = ym - ymOf(it.open), n = it.years * 12;
      if (age < 0 || age >= n) continue;
      const tau = n * 0.4, S = (1 - Math.exp(-n / tau)) / (1 - Math.exp(-1 / tau)), f = Math.exp(-age / tau) / S, k = it.hit ? 1.3 : 1;
      list.push({ it: it, dp: it.pop * f * k, dj: it.jobs * f * k });
    }
    if (!list.length) return null;
    const N = city.N;
    if (!markBuf || markBuf.length !== N) markBuf = new Uint8Array(N);
    const mark = markBuf, changed = [], touched = [];
    for (const q of list) {
      const it = q.it; q.cells = disk(city, it.x, it.y, it.r);
      for (const c of q.cells) if (!mark[c]) { mark[c] = 1; touched.push(c); }
    }
    let oP = 0, oJ = 0, addP = 0, addJ = 0;
    for (let c = 0; c < N; c++) if (!mark[c]) { oP += city.pop[c]; oJ += city.jobs[c]; }
    for (const { it, cells, dp, dj } of list) {
      const wR = [], wJ = [];
      let sR = 0, sJ = 0;
      for (const c of cells) {
        const near = 1 - 0.6 * U.dist((c % city.W) + 0.5, ((c / city.W) | 0) + 0.5, it.x, it.y) / it.r;
        const rr = RA[c] ? Math.max(0, capR[c] - city.pop[c]) * near : 0, rj = RA[c] ? Math.max(0, capJ[c] - city.jobs[c]) * near : 0;
        wR.push(rr); wJ.push(rj); sR += rr; sJ += rj;
      }
      const ap = Math.min(dp, sR * 0.08, Math.max(0, oP * 0.02 - addP));
      const aj = Math.min(dj, sJ * 0.08, Math.max(0, oJ * 0.02 - addJ));
      cells.forEach(function (c, i) {
        const vp = sR > 0 ? ap * wR[i] / sR : 0, vj = sJ > 0 ? aj * wJ[i] / sJ : 0;
        if (vp + vj > 0) { city.pop[c] += vp; city.jobs[c] += vj; changed.push(c); }
      });
      addP += ap; addJ += aj;
    }
    const fp = oP > 0 ? 1 - addP / oP : 1, fj = oJ > 0 ? 1 - addJ / oJ : 1;
    if (fp < 1 || fj < 1) for (let c = 0; c < N; c++) if (!mark[c]) { city.pop[c] *= fp; city.jobs[c] *= fj; }
    for (const c of touched) mark[c] = 0;
    return changed;
  };

  // ---------------- 配套任务（economy.js 的 Tasks.monthly 发布） ----------------
  SP.pendingTasks = function (g) {
    const P = g && g.plan; if (!P || !SP.enabled(g)) return [];
    return P.items.filter(function (it) { return it.task && it.task.st === 'wait' && it.taskSpec; });
  };
  SP.taskIssued = function (g, it, id) { it.task = { st: 'on', id: id }; delete it.taskSpec; };
  SP.taskSkipped = function (g, it) { it.task = { st: 'skip' }; delete it.taskSpec; };

  // ---------------- 烟花：活动开幕的头三天与闭幕前两天，晚上在场馆上空 ----------------
  SP.fireworks = function (g) {
    const P = g && g.plan; if (!P) return null;
    const ym = g.ym(), d = g.clock.d, dim = new Date(g.clock.y, g.clock.m, 0).getDate(), out = [];
    for (const it of P.items) {
      if (it.k !== 'event' || it.status !== 'on') continue;
      if ((ym === ymOf(it.start) && d <= 3) || (ym === ymOf(it.end) && d >= dim - 1)) out.push([it.x, it.y]);
    }
    return out.length ? out : null;
  };
})(window.CM);
