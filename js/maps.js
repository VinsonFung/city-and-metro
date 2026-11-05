'use strict';
// 地图：广州（真实地理）与新手教程「青湾」（虚构小城）。
// 各模块在加载时引用同一个 CM.DATA 对象，切换地图时替换它的内容，同时替换 CM.GEO（地理数据源）与网格尺寸、起始日期、人口曲线等参数。
(function (CM) {
  const CFG = CM.CFG, U = CM.U;
  // 随地图切换的配置项：格网、起始日期、人口增长、货币与价格基年、建设与运营成本、票价、财政、城市经济、出行选择与道路参数
  const CFG_KEYS = ['W', 'H', 'ZONE', 'START', 'growth', 'money', 'econBase', 'cost', 'ops', 'fareDefault', 'fareRange', 'economy', 'macro', 'choice', 'road', 'workWeek'];
  const GZ_CFG = {}; for (const k of CFG_KEYS) GZ_CFG[k] = k === 'START' ? Object.assign({}, CFG.START) : CFG[k];
  // 出行选择参数按「发展阶段对应年份」平移并按本城货币缩放：devOffset 为广州曲线年份减本城年份，money 为本城货币相对广州曲线的倍数
  const shift = function (curve, off, k) { return curve.map(function (p) { return [p[0] - off, p[1] * (k || 1)]; }); };
  CM.deriveChoice = function (off, money) {
    const ch = GZ_CFG.choice;
    return {
      choice: Object.assign({}, ch, { vot: shift(ch.vot, off, money), carCostPerKm: shift(ch.carCostPerKm, off, money), parking: shift(ch.parking, off, money), occupancy: shift(ch.occupancy, off), hoRate: shift(ch.hoRate, off), workerRate: shift(ch.workerRate, off), distDecayHW: shift(ch.distDecayHW, off), distDecayHO: shift(ch.distDecayHO, off),
        purposeShare: { sc: shift(ch.purposeShare.sc, off), md: shift(ch.purposeShare.md, off), lz: shift(ch.purposeShare.lz, off) } }),
      road: Object.assign({}, GZ_CFG.road, { capGrowth: shift(GZ_CFG.road.capGrowth, off) }),
    };
  };
  const MAPS = {
    gz: {
      id: 'gz', name: '广州', title: '广州 · 1990', sub: '真实地理 · 1990 年起 · 人民币',
      desc: '从 1990 年尚无地铁的广州开始：珠江水系、道路与桥梁、街道边界和地标都来自真实地理，区域按历史年份逐步开放，并有参考广州地铁发展的历史任务。',
      facts: [['范围', '30 km × 36 km'], ['起始', '1990 年'], ['人口', '约 328 万'], ['货币', '人民币（元）'], ['模式', '经营挑战 / 自由建造']],
      // 第 2 版（v2.1）：向北扩大 16 格到同和、京溪，向南扩大 32 格到市桥与广州南站；旧存档载入时迁移（见 extentMigration）
      modes: ['challenge', 'free'], kind: 'real', mapVersion: 2, scenario: 'gz-1990',
      extent: { from: 1, dx: 0, dy: 16, oldW: 120, oldH: 96, note: '地图向北扩大到同和、京溪，向南扩大到市桥与广州南站',
        oldRegionIds: ['bys', 'hls', 'airport', 'oldcity', 'cbd', 'tianhe_w', 'sanyuanli', 'fangcun', 'haizhu_n', 'huangpu', 'changzhou', 'kaifaqu', 'tianhe_e', 'haizhu_s', 'tianhe_n', 'baiyun_n', 'baiyun_w', 'tonghe', 'panyu_n', 'pazhou', 'guanzhou', 'longdong', 'tianhe_ne', 'unicity', 'luogang', 'foshan', 'panyu_e', 'outer'],
        oldLandmarkIds: ['zsjnt', 'zhl', 'cjc', 'gxs', 'lrs', 'hss', 'wxg', 'sssx', 'sm', 'nyw', 'njs', 'lsly', 'hhg', 'yxst', 'hpjx', 'sysu', 'scut', 'jnu', 'thty', 'gzzhan', 'gzdz', 'tcity', 'citic', 'xhyyt', 'gdmsg', 'pzhz', 'bycc', 'gzt', 'ifc', 'opera', 'gdmus', 'gzlib', 'ctf'] },
      // 地图选择页：地区、一句话特色、介绍、特色卡、大事年表、难度（1–4）
      region: '中国内地', tagline: '珠江两岸，从第一条线开始', difficulty: 2, tags: ['无地铁开局', '越江', '新区开放'],
      intro: '1990 年的广州还没有一公里地铁。老城的街巷挤满公交与自行车，天河才刚刚起步，珠江新城仍是一片农田。你要在老城与天河之间画下第一条线，再跟着城市一路向东、向南跨过珠江。',
      features: [['bridge', '珠江越江', '珠江把城市分成两岸，越江段可以建隧道或桥梁'], ['map', '27 个片区逐年开放', '珠江新城、番禺、大学城按真实年份开放'], ['building', '33 处真实地标', '中山纪念堂、广州塔、东塔按落成年份出现'], ['flag', '7 项历史任务', '参考广州地铁的发展需求，不要求复刻真实线路']],
      highlights: [[1993, '珠江新城开始规划'], [1996, '广州东站建成'], [2000, '番禺撤市设区'], [2004, '新白云机场与大学城启用'], [2010, '亚运会，广州塔落成']],
      geo: CM.GEO, data: Object.assign({}, CM.DATA),
      cfg: GZ_CFG,
      cam: { cx: 30, cy: 57, zoom: 18 },
    },
  };
  // 其他地图（教程与新增城市）由各自的数据文件登记为 CM.MAP_LIST；未写的配置项沿用广州样本
  // 交通小区边长（v2.6）：交通计算量随小区数的平方增长。现有地图都是 4 格（约 1 km）；更大的地图没有指定时自动放大，
  // 让全图小区数保持在同一量级（约 2000 个以内），跳月速度与内存不随地图面积成倍增长。边长须能整除地图宽高
  const autoZone = function (W, H) {
    for (const z of [4, 6, 8, 10, 12, 16, 20, 24]) if (W % z === 0 && H % z === 0 && W * H / (z * z) <= 2200) return z;
    return 4;
  };
  CM.autoZone = autoZone;
  for (const m of CM.MAP_LIST || []) {
    const cfg = Object.assign({}, GZ_CFG);
    if (m.econ) Object.assign(cfg, CM.deriveChoice(m.econ.devOffset || 0, m.econ.money || 1));
    Object.assign(cfg, m.cfg);
    if (m.cfg.ZONE == null) cfg.ZONE = autoZone(cfg.W, cfg.H);
    // 城市经济：只在真实城市启用；没有专门参数的真实地图使用通用参数（'auto'），教程等虚构地图不启用
    cfg.macro = m.kind === 'real' ? (m.cfg.macro || 'auto') : null;
    m.cfg = cfg;
    MAPS[m.id] = m;
  }
  // 地图数据指纹：格网、要素数量与名称表；范围修订提高 mapVersion，原范围内的地形校正由 terrainRevision 识别。
  for (const id in MAPS) {
    const m = MAPS[id], G = m.geo;
    m.mapVersion = m.mapVersion || 1;
    m.fp = U.fnv([id, m.cfg.W, m.cfg.H, (G.water || []).length, (G.roads || []).length, (G.names || []).length, (m.data.regions || []).map(function (r) { return r.id; }).join(',')].join('|'));
  }
  // 位置校正（v2.3 玩家反馈：杭州站位置错位）：部分手填坐标取自国内地图（GCJ-02 坐标系），比 OSM（WGS-84）偏东南 400–600 m。
  // 铁路车站地标、铁路枢纽设施对齐 OSM 同名火车站（800 m 内）；任务与阶段目标的锚点对齐 OSM 同名地铁站（750 m 内）。
  // 只按名称精确匹配，与 OSM 已经一致的不变；上海、武汉的数据文件此前已对设施与锚点做过同样的校正
  (function () {
    const strip = function (s) { return String(s).replace(/（.*?）/g, '').trim(); };
    for (const id in MAPS) {
      const m = MAPS[id]; if (m.kind !== 'real' || !m.geo || !m.geo.places) continue;
      const byName = [new Map(), new Map()];
      for (const p of m.geo.places) if (p[3] === 0 || p[3] === 1) { const t = byName[p[3]]; if (!t.has(p[0])) t.set(p[0], []); t.get(p[0]).push(p); }
      const near = function (names, type, x, y, r) { let best = null; for (const n of names) for (const p of byName[type].get(n) || []) { const d = U.dist(p[1], p[2], x, y); if (d <= r && (!best || d < best.d)) best = { d: d, x: p[1], y: p[2] }; } return best; };
      const railNames = function (s) { s = strip(s); return [s, s.replace(/火车站$|站$/, ''), s.replace(/站$/, '')]; };
      for (const lm of m.data.landmarks || []) if (lm.kind === 'rail') { const b = near(railNames(lm.name), 1, lm.x, lm.y, 3.2); if (b && b.d > 0.4) { lm.x = b.x; lm.y = b.y; } }
      for (const f of m.data.facilities || []) if (f.at && f.t === 'rail') { const b = near(railNames(f.n), 1, f.at[0], f.at[1], 3.6); if (b && b.d > 0.4) f.at = [b.x, b.y]; }
      const anchors = function (list) { for (const a of list || []) { const b = near([strip(a.name), strip(a.name).replace(/一带$/, '')], 0, a.x, a.y, 3) || near(railNames(a.name), 1, a.x, a.y, 3); if (b && b.d > 0.4) { a.x = b.x; a.y = b.y; } } };
      for (const t of (m.data.histTasks || []).concat(m.data.dynTasks || [])) anchors(t.anchors);
      for (const e of m.data.eras || []) for (const t of e.goals || []) anchors(t.anchors);
    }
  })();
  // 地图范围扩展的存档迁移（地图版本升级）：spec = { from, dx, dy, oldW, oldH, oldRegionIds, oldLandmarkIds, note }。
  // dx / dy 为新格网中原地图左上角的位置（格，须为交通小区边长 4 的倍数，投影系数不变）。只改解析出的存档副本：
  //  · 城市逐格数据放入新格网对应位置，新增范围标记为待生成（载入时按存档年份生成，见 City.fillNewCells）；
  //  · 区域与地标状态改为按 id 对应（存档没有 id 时用旧版本的 id 列表补上）；
  //  · 车站、轨道控制点、任务锚点平移；片区编号（动态任务与冷却记录）按新格网换算；
  //  · 城市经济在载入后按新增范围的岗位比例调整统计口径（见 game.js），资金、债务、任务、历史记录保持不变。
  // spec 也可以是按版本排列的数组（v2.2：香港第 2 版再向西扩大为第 3 版），旧存档依次迁移；每步的新格网尺寸为 newW / newH，缺省为当前地图尺寸
  CM.extentMigration = function (specs) {
    const ZN = CFG.ZONE, list = (Array.isArray(specs) ? specs : [specs]).slice().sort(function (a, b) { return a.from - b.from; });
    for (const spec of list) if (spec.dx % ZN || spec.dy % ZN) throw new Error('地图扩展偏移须为交通小区边长的倍数');
    return function (p, from) {
      const steps = list.filter(function (s) { return s.from >= from; });
      if (!steps.length || steps[0].from !== from) throw new Error('不支持从第 ' + from + ' 版迁移');
      for (const spec of steps) migrateStep(p, spec, from);
      return p;
    };
  };
  function migrateStep(p, spec, from0) {
    const ZN = CFG.ZONE, from = spec.from;
    {
      const m = MAPS[p.meta.map || 'gz'], W = spec.newW || m.cfg.W, H = spec.newH || m.cfg.H, oW = spec.oldW, oH = spec.oldH, dx = spec.dx, dy = spec.dy;
      if (dx < 0 || dy < 0 || dx + oW > W || dy + oH > H) throw new Error('新旧格网尺寸不匹配');
      const C = p.city;
      // 逐格数据（前一步迁移留下的待生成标记一并平移）
      const keys = ['pop', 'jobs', 'bh', 'taken', 'lu', 'street', 'urbanYear'];
      const prevFill = C.fillNew ? U.unpackTyped(C.fillNew) : null;
      for (const k of keys) {
        const a = U.unpackTyped(C[k]);
        if (a.length !== oW * oH) throw new Error('城市数据尺寸与第 ' + from + ' 版地图不符');
        const b = new a.constructor(W * H);
        for (let j = 0; j < oH; j++) b.set(a.subarray(j * oW, (j + 1) * oW), (j + dy) * W + dx);
        C[k] = U.packTyped(b, C[k].t || (a instanceof Float32Array ? 'f32' : a instanceof Uint16Array ? 'u16' : 'u8'));
      }
      const fill = new Uint8Array(W * H).fill(1);
      for (let j = 0; j < oH; j++) { if (prevFill && prevFill.length === oW * oH) fill.set(prevFill.subarray(j * oW, (j + 1) * oW), (j + dy) * W + dx); else fill.fill(0, (j + dy) * W + dx, (j + dy) * W + dx + oW); }
      C.fillNew = U.packTyped(fill, 'u8'); if (!prevFill) C.fillYear = p.clock.y;
      if (!C.regionIds) C.regionIds = spec.oldRegionIds;
      if (!C.landmarkIds) C.landmarkIds = spec.oldLandmarkIds;
      // 坐标平移
      // 车站的上次付费选址（site）随坐标一起平移，否则迁移后的微调会被误算为搬迁
      const sh = function (o) { if (o && typeof o.x === 'number') { o.x += dx; o.y += dy; } if (o && Array.isArray(o.site)) o.site = [o.site[0] + dx, o.site[1] + dy]; };
      for (const id in p.net.stations) sh(p.net.stations[id]);
      for (const id in p.net.segments) { const s = p.net.segments[id]; if (s.pts) s.pts = s.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; }); }
      // 片区编号
      const oZW = oW / ZN, nZW = W / ZN, zmap = function (z) { return ((z / oZW) | 0) * nZW + (z % oZW) + dx / ZN + (dy / ZN) * nZW; };
      const fixTask = function (t) { if (!t) return; if (t.anchors) t.anchors.forEach(sh); if (typeof t.zone === 'number') t.zone = zmap(t.zone); if (typeof t.coolKey === 'string') t.coolKey = t.coolKey.replace(/^(cong|cov):(\d+)$/, function (s0, a, z) { return a + ':' + zmap(+z); }); };
      const T = p.tasks;
      for (const list of [T.active, T.done, T.failed]) (list || []).forEach(fixTask);
      if (T.cool) { const nc = {}; for (const k in T.cool) nc[k.replace(/^(cong|cov):(\d+)$/, function (s0, a, z) { return a + ':' + zmap(+z); })] = T.cool[k]; T.cool = nc; }
      // 城市经济：载入后按新增范围调整统计口径（连续迁移时原范围随后续步骤平移）
      if (p.macro) { const ar = p.macro.areaRebase; if (ar && ar.oldBox && from > from0) { ar.oldBox[0] += dx; ar.oldBox[1] += dy; } else p.macro.areaRebase = { from: from, oldBox: [dx, dy, oW, oH] }; }
      const prevNote = p.mapUpgrade && from > from0 ? p.mapUpgrade.note : '';
      p.mapUpgrade = { from: from0, to: m.mapVersion, at: [p.clock.y, p.clock.m, p.clock.d], note: (prevNote ? prevNote + '；' : '') + (spec.note || '') };
    }
  }
  // 声明了范围扩展（extent）的地图：旧版本存档按扩展规格迁移
  for (const id in MAPS) if (MAPS[id].extent && !MAPS[id].migrate) MAPS[id].migrate = CM.extentMigration(MAPS[id].extent);
  // 杭州、武汉：第 2→3 版只调整了展示（格网、区域编号与玩家线网不变），第 2 版存档按第 3 版继续迁移；
  // v2.2 起第 3→4 版向外扩大（萧山机场、天河机场，见各自的 extent）
  for (const id of ['hz','wh']) {
    const mp=MAPS[id],steps=mp.migrate;
    mp.migrate=function(payload,from){
      if(from!==1&&from!==2&&from!==3)throw new Error('不支持的地图数据版本');
      return steps(payload,from===2?3:from);
    };
  }
  CM.MAPS = MAPS;
  // 选择列表由易到难；同难度保留既有城市顺序，新地图按登记顺序接在同档末尾。
  const mapOrder = ['tutorial', 'gz', 'hz', 'hk', 'tp', 'tk'];
  for (const id of Object.keys(MAPS)) if (mapOrder.indexOf(id) < 0) mapOrder.push(id);
  const mapRank = new Map(mapOrder.map(function (id, i) { return [id, i]; }));
  CM.MAP_ORDER = mapOrder.filter(function (id) { return MAPS[id]; }).sort(function (a, b) {
    return (MAPS[a].difficulty || 2) - (MAPS[b].difficulty || 2) || mapRank.get(a) - mapRank.get(b);
  });
  CM.mapId = 'gz';
  CM.useMap = function (id) {
    const m = MAPS[id] || MAPS.gz;
    if (CM.mapId === m.id && CM.GEO === m.geo) return m;
    CM.mapId = m.id;
    for (const k of Object.keys(CM.DATA)) delete CM.DATA[k];
    Object.assign(CM.DATA, m.data);
    CM.GEO = m.geo;
    for (const k of CFG_KEYS) CFG[k] = k === 'START' ? Object.assign({}, m.cfg.START) : m.cfg[k];
    if (CM.Geo) CM.Geo.init();
    if (CM.Metro && CM.Metro.clearCaches) CM.Metro.clearCaches();
    return m;
  };
  CM.curMap = function () { return MAPS[CM.mapId] || MAPS.gz; };
  // 货币时期：cfg.money.eras = [{ from: [年, 月], unit, wan, yi, sym, code, div }, …]（div 为每 1 显示单位折合的内部记账单位）。
  // 内部金额（资金、债务、票价、造价、账本）始终使用开局货币记账，不因货币改革改写；显示、票价滑块与图表按当期货币折算
  CM.moneyAt = function (mp, y, m) {
    const base = mp.cfg.money; if (!base || !base.eras) return base;
    let cur = base; const ym = U.ymIndex(y, m || 1);
    for (const e of base.eras) if (ym >= U.ymIndex(e.from[0], e.from[1] || 1)) cur = e;
    if (cur === base) return base;
    return Object.assign({}, base, cur, { eras: base.eras, baseUnit: base.unit });
  };
  CM.applyMoneyEra = function (y, m) {
    const mo = CM.moneyAt(CM.curMap(), y, m), prev = CFG.money;
    CFG.money = mo;
    return !prev || prev.code !== mo.code || (prev.div || 1) !== (mo.div || 1);
  };
  // 票价滑块范围（当前显示货币）：fareRange.scale 时按本城造价指数随年代放大（长时间跨度、物价变化大的地图），再按货币时期折算，步长取整到 1-2-5
  const nice = function (v) { const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
  CM.fareRangeNow = function (g) {
    const R = CFG.fareRange, div = (CFG.money && CFG.money.div) || 1;
    if (!R.scale || !g) return div === 1 ? R : { min: R.min / div, max: R.max / div, step: R.step / div };
    const k = g.econ.costIndex(g.clock.y) / div, step = nice(R.step * k);
    return { min: 0, max: Math.max(step * 4, Math.round(R.max * k / step) * step), step: step };
  };

  // 地图缩略图：水系、主要道路与铁路（不切换当前地图，直接解码该地图的数据），按主题配色，结果缓存。
  // v2.4：以前打开选择地图时逐张同步画图并编码（每张数十至数百毫秒，打开列表明显卡一下）。现在画图分成小段（生成器，每段几毫秒），
  // 编码交给 toBlob 在后台完成；主菜单空闲时预先生成，选图列表拿到就显示
  const thumbs = {}, pend = {};
  const drawThumb = function* (id, theme, hd) {
    const m = MAPS[id];
    const G = m.geo, dec = CM.Geo.dec, Wc = m.cfg.W, Hc = m.cfg.H;
    const S = hd ? Math.min(1800 / Wc, 1200 / Hc) : Math.min(640 / Wc, 400 / Hc), cv = document.createElement('canvas');
    cv.width = Math.round(Wc * S); cv.height = Math.round(Hc * S);
    // CPU 位图（之后要编码成图片）；分段之间先提交已记录的绘制命令（同 render.js 的 flushCanvas：跨帧分段绘制时 Chromium 可能丢掉整段命令）
    const c = cv.getContext('2d', { willReadFrequently: true }), dark = theme === 'dark', sync = function () { c.getImageData(0, 0, 1, 1); };
    c.fillStyle = dark ? '#1b2533' : '#eef3f0'; c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(S, 0, 0, S, 0, 0);
    let n = 0;
    const poly = function* (rows, col) {
      c.fillStyle = col; c.beginPath();
      for (const row of rows) { for (let k = 1; k < row.length; k++) { if (typeof row[k] !== 'string') continue; const p = dec(row[k], 1); c.moveTo(p[0], p[1]); for (let q = 2; q < p.length; q += 2) c.lineTo(p[q], p[q + 1]); } if (++n % 150 === 0) { sync(); yield; } }
      c.fill('evenodd');
    };
    const line = function (p) { c.beginPath(); c.moveTo(p[0], p[1]); for (let q = 2; q < p.length; q += 2) c.lineTo(p[q], p[q + 1]); c.stroke(); };
    yield* poly(G.woods || [], dark ? '#22362f' : '#dbe9dc');
    yield* poly(G.reserves || [], dark ? '#2a4238' : '#c9dfcc');
    yield* poly(G.parks || [], dark ? '#264034' : '#cfe6cf');
    yield* poly((G.water || []).filter(function (r) { return typeof r[1] !== 'number'; }), dark ? '#2b4f78' : '#a9cdeb');
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of G.water || []) if (typeof r[1] === 'number') { c.strokeStyle = dark ? '#2b4f78' : '#a9cdeb'; c.lineWidth = Math.max(r[1], 0.25); line(dec(r[2])); if (++n % 150 === 0) { sync(); yield; } }
    for (const r of G.rail || []) { if (r[1] & 2) continue; c.strokeStyle = dark ? '#5b6676' : '#9aa3ae'; c.lineWidth = 0.18; line(dec(r[2])); if (++n % 150 === 0) { sync(); yield; } }
    for (const cls of hd ? [2, 3, 4] : [3, 4]) for (const r of G.roads || []) {
      if (r[1] !== cls || (r[2] & 6)) continue;
      c.strokeStyle = dark ? (cls === 4 ? '#b8964a' : cls === 3 ? '#6f7b8c' : '#4f5a68') : (cls === 4 ? '#f0b54a' : cls === 3 ? '#c4ccd6' : '#d6dce3'); c.lineWidth = cls === 4 ? 0.45 : cls === 3 ? 0.3 : 0.2;
      line(dec(r[3])); if (++n % 150 === 0) { sync(); yield; }
    }
    sync();
    return cv;
  };
  const finish = function (it) { let r = it.next(); while (!r.done) r = it.next(); return r.value; };
  // 同步取得（必须马上有图时；有缓存直接返回）
  CM.mapThumb = function (id, theme) {
    const key = id + ':' + theme;
    if (thumbs[key]) return thumbs[key];
    if (!MAPS[id]) return null;
    thumbs[key] = finish(drawThumb(id, theme)).toDataURL('image/jpeg', 0.9);
    return thumbs[key];
  };
  CM.mapThumbReady = function (id, theme, hd) { return thumbs[id + ':' + theme + (hd ? ':hd' : '')] || null; };
  // 后台生成：空闲时分段画图，toBlob 编码，结果为对象 URL
  const idle = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 400 }); } : function (f) { setTimeout(function () { f({ timeRemaining: function () { return 6; } }); }, 16); };
  // 画图（不编码）：结果是画布，可直接绘制或后台编码。每段至少做几毫秒——画面持续动画、
  // 空闲回调只能超时触发时（剩余时间为 0）也照常推进（v2.4 以前此时每 0.4 秒才画一小段，城市画面要等好几秒）
  const drawn = {}, pendDraw = {};
  CM.mapThumbDraw = function (id, theme, hd) {
    const key = id + ':' + theme + (hd ? ':hd' : '');
    if (drawn[key]) return Promise.resolve(drawn[key]);
    if (pendDraw[key]) return pendDraw[key];
    if (!MAPS[id]) return Promise.resolve(null);
    const it = drawThumb(id, theme, hd);
    return (pendDraw[key] = new Promise(function (res) {
      const step = function (dl) {
        const t0 = performance.now(), budget = dl.didTimeout ? 8 : Math.max(4, dl.timeRemaining() - 1);
        let r = it.next();
        while (!r.done && performance.now() - t0 < budget) r = it.next();
        if (!r.done) { idle(step); return; }
        drawn[key] = r.value; delete pendDraw[key]; res(r.value);
      };
      idle(step);
    }));
  };
  CM.mapThumbAsync = function (id, theme, hd) {
    const key = id + ':' + theme + (hd ? ':hd' : '');
    if (thumbs[key]) return Promise.resolve(thumbs[key]);
    if (pend[key]) return pend[key];
    if (!MAPS[id]) return Promise.resolve(null);
    return (pend[key] = CM.mapThumbDraw(id, theme, hd).then(function (cv) {
      return new Promise(function (res) {
        // 编码完成后画布不再保留（展示使用对象 URL）
        const done = function (url) { thumbs[key] = url; delete pend[key]; delete drawn[key]; res(url); };
        if (cv.toBlob) cv.toBlob(function (b) { done(b ? URL.createObjectURL(b) : cv.toDataURL('image/jpeg', 0.9)); }, 'image/jpeg', 0.9);
        else done(cv.toDataURL('image/jpeg', 0.9));
      });
    }));
  };
  // 图片元素先空着，缩略图就绪后淡入（列表、城市海报、简报共用）
  CM.thumbInto = function (img, id, theme) {
    const u = CM.mapThumbReady(id, theme);
    if (u) { img.src = u; return img; }
    img.classList.add('thumb-wait');
    CM.mapThumbAsync(id, theme).then(function (url) { if (url) { img.src = url; img.classList.remove('thumb-wait'); } });
    return img;
  };
  // 主菜单空闲时依次预生成全部地图的缩略图
  CM.prewarmThumbs = function (theme) {
    const ids = CM.MAP_ORDER.slice(); let i = 0;
    const next = function () { if (i < ids.length) CM.mapThumbAsync(ids[i++], theme).then(next); };
    next();
  };
})(window.CM);
