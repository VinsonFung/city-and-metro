'use strict';
// 地图：广州（真实地理）与新手教程「青湾」（虚构小城）。
// 各模块在加载时引用同一个 CM.DATA 对象，切换地图时替换它的内容，同时替换 CM.GEO（地理数据源）与网格尺寸、起始日期、人口曲线等参数。
(function (CM) {
  const CFG = CM.CFG, U = CM.U;
  // 随地图切换的配置项：格网、起始日期、人口增长、货币与价格基年、建设与运营成本、票价、财政、城市经济、出行选择与道路参数
  const CFG_KEYS = ['W', 'H', 'START', 'growth', 'money', 'econBase', 'cost', 'ops', 'fareDefault', 'fareRange', 'economy', 'macro', 'choice', 'road', 'workWeek'];
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
      facts: [['范围', '30 km × 24 km'], ['起始', '1990 年'], ['人口', '约 300 万'], ['货币', '人民币（元）'], ['模式', '经营挑战 / 自由建造']],
      modes: ['challenge', 'free'], kind: 'real', mapVersion: 1, scenario: 'gz-1990',
      // 地图选择页：地区、一句话特色、介绍、特色卡、大事年表、难度（1–4）
      region: '中国内地', tagline: '珠江两岸，从第一条线开始', difficulty: 2, tags: ['无地铁开局', '越江', '新区开放'],
      intro: '1990 年的广州还没有一公里地铁。老城的街巷挤满公交与自行车，天河才刚刚起步，珠江新城仍是一片农田。你要在老城与天河之间画下第一条线，再跟着城市一路向东、向南跨过珠江。',
      features: [['bridge', '珠江越江', '珠江把城市分成两岸，越江段可以建隧道或桥梁'], ['map', '27 个片区逐年开放', '珠江新城、番禺、大学城按真实年份开放'], ['building', '33 处真实地标', '中山纪念堂、广州塔、东塔按落成年份出现'], ['flag', '7 项历史任务', '参考广州地铁的发展需求，不要求复刻真实线路']],
      highlights: [[1993, '珠江新城开始规划'], [1996, '广州东站建成'], [2000, '番禺撤市设区'], [2004, '新白云机场与大学城启用'], [2010, '亚运会，广州塔落成']],
      geo: CM.GEO, data: Object.assign({}, CM.DATA),
      cfg: GZ_CFG,
      cam: { cx: 30, cy: 41, zoom: 18 },
    },
  };
  // 其他地图（教程与新增城市）由各自的数据文件登记为 CM.MAP_LIST；未写的配置项沿用广州样本
  for (const m of CM.MAP_LIST || []) {
    const cfg = Object.assign({}, GZ_CFG);
    if (m.econ) Object.assign(cfg, CM.deriveChoice(m.econ.devOffset || 0, m.econ.money || 1));
    Object.assign(cfg, m.cfg);
    // 城市经济：只在真实城市启用；没有专门参数的真实地图使用通用参数（'auto'），教程等虚构地图不启用
    cfg.macro = m.kind === 'real' ? (m.cfg.macro || 'auto') : null;
    m.cfg = cfg;
    MAPS[m.id] = m;
  }
  // 地图数据指纹：格网、要素数量与名称表（用于存档识别与诊断；内容修订须同时提高 mapVersion）
  for (const id in MAPS) {
    const m = MAPS[id], G = m.geo;
    m.mapVersion = m.mapVersion || 1;
    m.fp = U.fnv([id, m.cfg.W, m.cfg.H, (G.water || []).length, (G.roads || []).length, (G.names || []).length, (m.data.regions || []).map(function (r) { return r.id; }).join(',')].join('|'));
  }
  CM.MAPS = MAPS;
  // 选择列表由易到难；同难度保留既有城市顺序，新地图按登记顺序接在同档末尾。
  const mapOrder = ['tutorial', 'gz', 'hz', 'hk', 'tp', 'tk', 'ld'];
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

  // 地图缩略图：水系、主要道路与铁路（不切换当前地图，直接解码该地图的数据），按主题配色，结果缓存
  const thumbs = {};
  CM.mapThumb = function (id, theme) {
    const key = id + ':' + theme;
    if (thumbs[key]) return thumbs[key];
    const m = MAPS[id]; if (!m) return null;
    const G = m.geo, dec = CM.Geo.dec, Wc = m.cfg.W, Hc = m.cfg.H;
    const S = Math.min(640 / Wc, 400 / Hc), cv = document.createElement('canvas');
    cv.width = Math.round(Wc * S); cv.height = Math.round(Hc * S);
    const c = cv.getContext('2d'), dark = theme === 'dark';
    c.fillStyle = dark ? '#1b2533' : '#eef3f0'; c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(S, 0, 0, S, 0, 0);
    const poly = function (rows, col) {
      c.fillStyle = col; c.beginPath();
      for (const row of rows) for (let k = 1; k < row.length; k++) { if (typeof row[k] !== 'string') continue; const p = dec(row[k], 1); c.moveTo(p[0], p[1]); for (let q = 2; q < p.length; q += 2) c.lineTo(p[q], p[q + 1]); }
      c.fill('evenodd');
    };
    poly(G.woods || [], dark ? '#22362f' : '#dbe9dc');
    poly(G.reserves || [], dark ? '#2a4238' : '#c9dfcc');
    poly(G.parks || [], dark ? '#264034' : '#cfe6cf');
    poly((G.water || []).filter(function (r) { return typeof r[1] !== 'number'; }), dark ? '#2b4f78' : '#a9cdeb');
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of G.water || []) if (typeof r[1] === 'number') { const p = dec(r[2]); c.strokeStyle = dark ? '#2b4f78' : '#a9cdeb'; c.lineWidth = Math.max(r[1], 0.25); c.beginPath(); c.moveTo(p[0], p[1]); for (let q = 2; q < p.length; q += 2) c.lineTo(p[q], p[q + 1]); c.stroke(); }
    for (const r of G.rail || []) { if (r[1] & 2) continue; const p = dec(r[2]); c.strokeStyle = dark ? '#5b6676' : '#9aa3ae'; c.lineWidth = 0.18; c.beginPath(); c.moveTo(p[0], p[1]); for (let q = 2; q < p.length; q += 2) c.lineTo(p[q], p[q + 1]); c.stroke(); }
    for (const cls of [3, 4]) for (const r of G.roads || []) {
      if (r[1] !== cls || (r[2] & 6)) continue;
      const p = dec(r[3]); c.strokeStyle = dark ? (cls === 4 ? '#b8964a' : '#6f7b8c') : (cls === 4 ? '#f0b54a' : '#c4ccd6'); c.lineWidth = cls === 4 ? 0.45 : 0.3;
      c.beginPath(); c.moveTo(p[0], p[1]); for (let q = 2; q < p.length; q += 2) c.lineTo(p[q], p[q + 1]); c.stroke();
    }
    thumbs[key] = cv.toDataURL('image/png');
    return thumbs[key];
  };
})(window.CM);
