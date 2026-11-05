'use strict';
// 新手教程地图「青湾」：约 12 km × 10 km 的虚构小城（48 × 40 格，每格 250 m），青江自西向东穿城而过。
// 地理数据按与 geo_gz.js 相同的格式生成（坐标经 Geo.enc 编码后由 Geo.init 统一解码），城市规则数据与 data_gz.js 结构一致。
(function (CM) {
  const U = CM.U, CFG = CM.CFG, enc = CM.Geo.enc;
  const W = 48, H = 40;

  // ---------------- 青江：中心线（Catmull-Rom 平滑）与宽度 ----------------
  const RC = [[-1, 24.0], [4, 23.6], [9, 22.6], [14, 21.8], [19, 21.9], [24, 22.8], [29, 22.9], [34, 21.6], [39, 20.4], [44, 20.1], [49, 20.4]];
  const riverY = function (x) {
    const t = U.clamp((x + 1) / 5, 0, RC.length - 1.0001), k = Math.floor(t), f = t - k;
    const y = function (i) { return RC[U.clamp(i, 0, RC.length - 1)][1]; };
    const p0 = y(k - 1), p1 = y(k), p2 = y(k + 1), p3 = y(k + 2);
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  };
  const riverHW = function (x) { return 0.74 + 0.1 * Math.sin(x * 0.27 + 1); };
  const bankN = function (x) { return riverY(x) - riverHW(x); }, bankS = function (x) { return riverY(x) + riverHW(x); };
  const LAKE = { x: 16.5, y: 11.7, rx: 1.0, ry: 0.62 };
  const CREEK = [[37.6, -0.2], [37.2, 4], [36.5, 8], [36.2, 12], [36.6, 16], [37.0, 20.4]];

  // 名称表（序号 0 为空名）
  const NM = [''];
  const ni = function (s) { if (!s) return 0; let i = NM.indexOf(s); if (i < 0) { i = NM.length; NM.push(s); } return i; };
  const flat = function (pts) { const a = []; for (const p of pts) a.push(p[0], p[1]); return a; };
  const ring = function (pts) { return 'o' + enc(flat(pts)); };
  const ellipse = function (cx, cy, rx, ry, n, wob, seed) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, r = 1 + (wob || 0) * (U.hash2(k, seed || 1, 9) - 0.5) * 2;
      out.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
    }
    return out;
  };
  const along = function (x0, x1, fy, step) { const out = []; for (let x = x0; x <= x1 + 1e-6; x += step || 1) out.push([x, fy(x)]); return out; };
  const distSeg = function (px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; const t = l2 ? U.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0; return Math.hypot(px - ax - dx * t, py - ay - dy * t); };

  // ---------------- 水系 ----------------
  const water = [];
  const top = along(-0.6, 48.6, bankN, 0.5), bot = along(-0.6, 48.6, bankS, 0.5).reverse();
  water.push([ni('青江'), ring(top.concat(bot))]);
  water.push([ni('镜湖'), ring(ellipse(LAKE.x, LAKE.y, LAKE.rx, LAKE.ry, 24, 0.08, 3))]);
  water.push([ni('东涌'), 0.22, enc(flat(CREEK))]);
  const inWater = function (x, y, m) {
    m = m || 0;
    if (Math.abs(y - riverY(x)) < riverHW(x) + m) return true;
    const dx = (x - LAKE.x) / (LAKE.rx + m), dy = (y - LAKE.y) / (LAKE.ry + m);
    if (dx * dx + dy * dy < 1.1) return true;
    for (let k = 0; k + 1 < CREEK.length; k++) if (distSeg(x, y, CREEK[k][0], CREEK[k][1], CREEK[k + 1][0], CREEK[k + 1][1]) < 0.14 + m) return true;
    return false;
  };

  // ---------------- 公园、风景区、林地 ----------------
  const PARKS = [
    ['人民公园', [[14.4, 10.4], [18.6, 10.4], [18.6, 13.1], [14.4, 13.1]]],
    ['滨江公园', along(20.2, 26.6, function (x) { return bankN(x) - 1.55; }, 0.8).concat(along(20.2, 26.6, function (x) { return bankN(x) - 0.62; }, 0.8).reverse())],
    ['南岸湿地公园', [[8.2, 27.3], [12.0, 27.3], [12.3, 29.0], [8.0, 29.1]]],
    ['东湖公园', [[32.2, 15.0], [34.4, 15.0], [34.4, 17.2], [32.2, 17.2]]],
  ];
  const parks = PARKS.map(function (p) { return [ni(p[0]), ring(p[1])]; });
  const HILL = ellipse(42.2, 6.2, 3.9, 3.6, 28, 0.12, 7);
  const reserves = [[ni('凤凰山风景区'), ring(HILL)]];
  const woods = [
    [ni(''), ring(ellipse(42.2, 6.2, 4.8, 4.5, 28, 0.15, 11))],
    [ni(''), ring([[0, 34.5], [4.5, 35.2], [5.5, 40], [0, 40]])],
    [ni(''), ring([[0, 0], [3.5, 0], [3.0, 2.2], [0, 3.0]])],
    [ni(''), ring([[45.5, 34], [48, 33], [48, 40], [44, 40]])],
  ];
  const inPark = function (x, y) {
    if (x > 14.4 && x < 18.6 && y > 10.4 && y < 13.1) return true;
    if (x > 32.2 && x < 34.4 && y > 15 && y < 17.2) return true;
    if (x > 8.1 && x < 12.2 && y > 27.3 && y < 29.0) return true;
    if (x > 20.2 && x < 26.6 && y > bankN(x) - 1.55 && y < bankN(x) - 0.62) return true;
    const dx = (x - 42.2) / 4.0, dy = (y - 6.2) / 3.7; return dx * dx + dy * dy < 1;
  };

  // ---------------- 道路 ----------------
  const roads = [];
  const road = function (name, cls, flags, pts) { roads.push([ni(name), cls, flags || 0, enc(flat(pts))]); };
  // 南北向道路：北段 + 跨江桥梁 + 南段
  const nsRoad = function (x, y0, y1, cls, nName, bName, sName) {
    const a = bankN(x) - 0.6, b = bankS(x) + 0.6;
    if (y0 < a) road(nName, cls, 0, [[x, y0], [x, a]]);
    road(bName, cls, 1, [[x, a], [x, b]]);
    if (y1 > b) road(sName, cls, 0, [[x, b], [x, y1]]);
  };
  // 环城快速路（两处跨江）
  road('环城快速路', 4, 0, [[5, bankN(5) - 0.6], [5, 9.5], [5.8, 7.6], [8.5, 6.5], [31, 6.5], [33.8, 7.6], [35, 10], [35, bankN(35) - 0.6]]);
  road('东江大桥', 4, 1, [[35, bankN(35) - 0.6], [35, bankS(35) + 0.6]]);
  road('环城快速路', 4, 0, [[35, bankS(35) + 0.6], [35, 29.5], [33.6, 32.1], [31, 33], [8.5, 33], [6, 32], [5, 30], [5, bankS(5) + 0.6]]);
  road('西江大桥', 4, 1, [[5, bankS(5) + 0.6], [5, bankN(5) - 0.6]]);
  road('东部快速路', 4, 0, [[35, 17.2], [39, 17.4], [43, 17.6], [48, 17.7]]);
  // 主干道
  road('中山路', 3, 0, [[0, 14], [48, 14]]);
  road('解放路', 3, 0, [[2, 10], [35, 10]]);
  road('滨江路', 3, 0, along(0, 48, function (x) { return bankN(x) - 0.55; }, 1));
  road('江南路', 3, 0, along(0, 48, function (x) { return bankS(x) + 0.55; }, 1));
  road('南环路', 3, 0, [[0, 29.5], [48, 29.5]]);
  nsRoad(19, 0, 40, 3, '人民北路', '青江大桥', '人民南路');
  nsRoad(27, 0, 40, 3, '建设路', '青江二桥', '江湾大道');
  road('西关路', 3, 0, [[10, 6.5], [10, bankN(10) - 0.55]]);
  road('东关大道', 3, 0, [[31, 6.5], [31, bankN(31) - 0.55]]);
  road('科技园路', 3, 0, [[40, bankS(40) + 0.55], [40, 40]]);
  // 次干道
  road('文昌路', 2, 0, [[14, 6.5], [14, bankN(14) - 0.55]]);
  road('府前路', 2, 0, [[23, 6.5], [23, bankN(23) - 0.55]]);
  road('青年路', 2, 0, [[5, 17.8], [35, 17.8]]);
  road('北站路', 2, 0, [[6, 4.6], [33, 4.6]]);
  road('东风路', 2, 0, [[35, 10.5], [48, 10.5]]);
  road('工业路', 2, 0, [[41.5, 10.5], [41.5, bankN(41.5) - 0.55]]);
  road('南岸一路', 2, 0, [[5, 26.8], [35, 26.8]]);
  road('南岸二路', 2, 0, [[13, bankS(13) + 0.55], [13, 33]]);
  road('南岸三路', 2, 0, [[23, bankS(23) + 0.55], [23, 33]]);
  road('湾景路', 2, 0, [[31, bankS(31) + 0.55], [31, 33]]);
  road('学院路', 2, 0, [[35, 32.5], [48, 32.5]]);
  // 铁路
  const rail = [[ni('青湾铁路'), 0, enc(flat([[0, 2.4], [12, 2.6], [24, 2.9], [36, 2.4], [48, 1.6]]))]];

  // 支路：0.5 格（125 m）方格，避开水面、公园与风景区、主要道路；随机留出较大的街坊
  const AX = [5, 10, 14, 19, 23, 27, 31, 35, 40, 41.5], AY = [4.6, 6.5, 10, 10.5, 14, 17.8, 26.8, 29.5, 32.5, 33];
  const streets = [];
  const near = function (v, arr) { for (const a of arr) if (Math.abs(v - a) < 0.18) return true; return false; };
  const ok = function (x, y) { return !inWater(x, y, 0.12) && !inPark(x, y) && !(y < 3.3 && y > 1.6); };
  const runLine = function (vert, c, a0, a1, seed) {
    let cur = [];
    for (let t = a0; t <= a1 + 1e-6; t += 1) {
      const x = vert ? c : t, y = vert ? t : c;
      const skip = U.hash2(Math.floor(t / 2), Math.round(c * 4), seed) < 0.1;
      if (ok(x, y) && !skip) cur.push(x, y);
      else { if (cur.length >= 4) streets.push(enc(cur)); cur = []; }
    }
    if (cur.length >= 4) streets.push(enc(cur));
  };
  for (let x = 1.25; x < W - 0.5; x += 0.5) if (!near(x, AX)) runLine(true, x, 0.5, H - 0.5, 41);
  for (let y = 0.75; y < H - 0.5; y += 0.5) if (!near(y, AY)) runLine(false, y, 0.5, W - 0.5, 43);

  // ---------------- 行政区界（街道）：区域由它们组合 ----------------
  const northPoly = function (x0, x1, yTop) { return [[x0, yTop], [x1, yTop]].concat(along(x0, x1, riverY, 0.5).reverse()); };
  const southPoly = function (x0, x1, yBot) { return along(x0, x1, riverY, 0.5).concat([[x1, yBot], [x0, yBot]]); };
  const admin = [
    [8, ni('北站街道'), ring([[4, 0.3], [35.5, 0.3], [35.5, 6.5], [4, 6.5]])],
    [8, ni('老城街道'), ring(northPoly(12, 26, 6.5))],
    [8, ni('西关街道'), ring(northPoly(2, 12, 6.5))],
    [8, ni('东关街道'), ring(northPoly(26, 35.5, 6.5))],
    [8, ni('东部街道'), ring(northPoly(35.5, 47.6, 9.0))],
    [8, ni('南岸街道'), ring(southPoly(4, 30, 34.5))],
    [8, ni('科技园街道'), ring(southPoly(30, 46.5, 37))],
  ];

  // ---------------- 地名（车站命名参考） ----------------
  const places = [
    ['青湾站', 18.5, 4.9, 1], ['北站路', 12.5, 5.0, 3], ['铁路新村', 25, 4.9, 3], ['北郊', 8, 1.6, 2], ['东郊', 46, 4.2, 2],
    ['北门', 19.3, 8.2, 3], ['解放路口', 23.3, 10.3, 3], ['文昌', 13.6, 8.8, 3], ['人民公园', 16.6, 13.5, 3], ['钟楼', 18.4, 15.4, 3],
    ['府前', 22.2, 14.6, 3], ['文庙', 14.9, 16.6, 3], ['青年路', 20.6, 18.0, 3], ['滨江', 18.7, 20.3, 3], ['码头', 23.8, 20.4, 3], ['大南门', 15.6, 19.6, 3],
    ['西关', 7.4, 15.2, 3], ['西门', 11.3, 13.4, 3], ['西村', 6.2, 10.4, 3], ['荷花塘', 7.4, 19.6, 3], ['西郊', 2.4, 12.6, 2],
    ['东关', 30.4, 13.4, 3], ['东门', 26.6, 15.0, 3], ['东风', 33.2, 9.6, 3], ['新河浦', 29.0, 18.8, 3], ['东湖', 33.3, 14.3, 3],
    ['东涌', 37.6, 13.0, 3], ['东部工业区', 40.2, 15.6, 3], ['机械厂', 44.3, 12.6, 3], ['电厂', 45.6, 16.8, 3], ['凤凰山', 41.2, 11.2, 3],
    ['江南村', 12.0, 24.8, 3], ['南岸', 19.6, 25.4, 3], ['江湾', 26.4, 25.0, 3], ['新城中心', 19.6, 28.0, 3], ['湿地公园', 10.2, 26.4, 3],
    ['南苑', 14.2, 31.0, 3], ['南环', 22.4, 30.6, 3], ['南山', 8.4, 31.6, 3], ['体育中心', 29.6, 27.0, 3], ['江湾中心', 24.6, 27.4, 3],
    ['会展中心', 33.4, 24.8, 3], ['科技园', 37.6, 26.4, 3], ['青湾大学', 43.4, 33.4, 3], ['学院路', 37.8, 32.0, 3], ['东江口', 45.0, 23.2, 3],
    ['西江口', 2.4, 26.6, 2], ['南郊', 20.0, 37.6, 2], ['大学城南', 40.6, 37.6, 2], ['江湾新村', 27.6, 31.8, 3],
  ];

  const GEO = { names: NM, water: water, roads: roads, streets: streets.join('!'), rail: rail, parks: parks, reserves: reserves, woods: woods, admin: admin, places: places };

  // ---------------- 城市规则数据（结构同 data_gz.js） ----------------
  const DATA = {
    city: '青湾', riverName: '青江', tutorial: true, noDynTasks: true, fictional: true,
    stages: [[2003, '起步期'], [2008, '科技园开发期']], stageLast: '城市扩张期',
    // 历史发展阶段（v2.2，eras.js；青湾为虚构城市）：grow 只改变人口与岗位增长的去向，corridors 为片区间通勤与购物去向倍数
    eras: [
      { id: 'tu-e1', from: 2000, name: '起步期', tag: '虚构',
        summary: '虚构：城市集中在青江北岸的老城、西关与东关，东部工业区提供大量岗位。估算：老城趋于饱和，新增人口主要落在西关、东关与北站片区。',
        grow: { pop: { oldtown: 0.7, xiguan: 1.2, dongguan: 1.2, beizhan: 1.2 }, jobs: { oldtown: 1.2, eastind: 1.3 } } },
      { id: 'tu-e2', from: 2003, name: '科技园开发期', tag: '虚构',
        summary: '虚构：科技园与大学城在南岸东部开放建设。估算：科技园的岗位与学生快速增加，南岸新区成为新的居住地，跨江通勤增加。',
        grow: { pop: { nanan: 1.5, tech: 1.5, oldtown: 0.6 }, jobs: { tech: 2.0, nanan: 1.3 } },
        demand: { sc: 1.1 }, corridors: [{ a: 'tech', b: 'oldtown', f: 1.15 }, { a: 'nanan', b: 'oldtown', f: 1.1 }] },
      { id: 'tu-e3', from: 2008, name: '城市扩张期', tag: '虚构',
        summary: '虚构：江湾中心落成，城市向外围扩张。估算：南岸新区的商务岗位增加，外围地区开始成为居住地。',
        grow: { pop: { outer: 1.3, nanan: 1.3, tech: 1.2, oldtown: 0.6 }, jobs: { nanan: 1.5, tech: 1.4, oldtown: 0.9 } },
        demand: { decayHW: 1.1 }, corridors: [{ a: 'nanan', b: 'oldtown', f: 1.15 }] },
    ],
    dataNote: [['虚构设定', 'info', '青湾是为新手教程设计的虚构小城：地形、道路、地名、人口与历史事件均为虚构，不对应任何真实城市。'], ['模拟', 'sim', '城市发展、居民出行、道路拥堵、客流与财政为游戏模拟结果。']],
    airport: { name: '', closeYear: 9999 },
    regions: [
      { id: 'fhs', name: '凤凰山风景区', geo: { reserve: '凤凰山风景区' }, open: null, scenic: true },
      { id: 'oldtown', name: '老城区（钟楼·府前）', streets: ['老城街道'], open: 2000, plan: 'oldmix' },
      { id: 'xiguan', name: '西关', streets: ['西关街道'], open: 2000, plan: 'res' },
      { id: 'dongguan', name: '东关', streets: ['东关街道'], open: 2000, plan: 'mix' },
      { id: 'beizhan', name: '北站片区', streets: ['北站街道'], open: 2000, plan: 'resind' },
      { id: 'eastind', name: '东部工业区', streets: ['东部街道'], open: 2000, plan: 'ind' },
      { id: 'nanan', name: '南岸新区', streets: ['南岸街道'], open: 2000, plan: 'newtown' },
      { id: 'tech', name: '科技园（大学城）', streets: ['科技园街道'], open: 2003, plan: 'mix', pop: 4.7e5, note: '青江南岸东部的科技园与大学城开始开发' },
    ],
    defaultRegion: { id: 'outer', name: '外围地区', open: 2008, plan: 'res', pop: 5.6e5 },
    plans: CM.DATA.plans,
    // v2.3：老城（钟楼、府前、青年路一带）为就业中心，江南为居住区，教程主线「连接两岸」在住宅与就业图层上一目了然
    centers: [
      { x: 19.8, y: 15.2, pop: 18000, jobs: 95000, r: 1.2 },
      { x: 15.0, y: 15.5, pop: 14000, jobs: 6000, r: 1.6 },
      { x: 7.5, y: 15.5, pop: 26000, jobs: 8000, r: 2.0 },
      { x: 30.5, y: 13.0, pop: 18000, jobs: 16000, r: 1.8 },
      { x: 17.0, y: 5.6, pop: 9000, jobs: 12000, r: 1.4 },
      { x: 17.5, y: 26.5, pop: 9000, jobs: 3000, r: 1.7 },
      { x: 41.0, y: 15.5, pop: 3000, jobs: 13000, r: 1.6 },
      { x: 26.5, y: 25.5, pop: 5000, jobs: 2500, r: 1.2 },
    ],
    rural: { pop: 500, jobs: 100 },
    roadYears: {
      '环城快速路': 1998, '东部快速路': 2004, '中山路': 1950, '解放路': 1950, '滨江路': 1985, '江南路': 1995, '南环路': 1998, '人民北路': 1950, '人民南路': 1980,
      '建设路': 1970, '江湾大道': 1998, '西关路': 1960, '东关大道': 1985, '科技园路': 2003, '文昌路': 1950, '府前路': 1950, '青年路': 1970, '北站路': 1978,
      '东风路': 1990, '工业路': 1990, '南岸一路': 1996, '南岸二路': 1998, '南岸三路': 1998, '湾景路': 2003, '学院路': 2003,
    },
    bridgeYears: { '青江大桥': 1972, '青江二桥': 1998, '东江大桥': 1998, '西江大桥': 1998 },
    bridgeDefaultYear: 1998,
    simRoads: [],
    landmarks: [
      { id: 'qw_zl', name: '钟楼', x: 18.2, y: 15.7, w: 60, d: 60, year: 1928, kind: 'tower' },
      { id: 'qw_zhan', name: '青湾火车站', x: 18.5, y: 3.75, w: 420, d: 150, year: 1978, kind: 'rail' },
      { id: 'qw_ty', name: '青湾体育中心', x: 29.6, y: 28.3, w: 460, d: 380, year: 1995, kind: 'stadium' },
      { id: 'qw_dx', name: '青湾大学', x: 43.6, y: 35.2, w: 900, d: 700, rot: 8, year: 1985, kind: 'campus' },
      { id: 'qw_jw', name: '江湾中心', x: 25.0, y: 25.6, w: 80, d: 80, year: 2008, kind: 'skyscraper', h: 260, style: 'west' },
    ],
    // 重要设施（虚构，v1.9 见 facility.js）：规模为游戏设定
    facilities: [
      { id: 'qw_rail', n: '青湾火车站', t: 'rail', lm: 'qw_zhan', pax: [[1978, 0.4], [2000, 0.6], [2010, 0.9], [2030, 1.2]] },
      { id: 'qw_univ', n: '青湾大学', t: 'uni', lm: 'qw_dx', w: 0.04 },
      { id: 'qw_hosp', n: '青湾市人民医院', t: 'hosp', at: [20.6, 18.0], w: 0.15 },
      { id: 'qw_hosp2', n: '南岸医院', t: 'hosp', at: [19.6, 28.0], y0: 2005, w: 0.08 },
      { id: 'qw_fuqian', n: '府前商业街', t: 'shop', at: [22.2, 14.6], w: 0.08 },
      { id: 'qw_jwzx', n: '江湾中心商务区', t: 'cbd', at: [24.6, 27.4], y0: 2008, w: [[2008, 0.01], [2015, 0.04]] },
      { id: 'qw_zl', n: '钟楼', t: 'scenic', lm: 'qw_zl', w: 0.03 },
      { id: 'qw_park', n: '人民公园', t: 'park', at: [16.6, 13.5], w: 0.04 },
      { id: 'qw_wet', n: '湿地公园', t: 'park', at: [10.2, 26.4], r: 1.5, w: 0.02 },
      { id: 'qw_ty', n: '青湾体育中心', t: 'stadium', lm: 'qw_ty', w: 0.03 },
      { id: 'qw_expo', n: '青湾会展中心', t: 'venue', at: [33.4, 24.8], y0: 2005, w: 0.02 },
    ],
    districtLabels: [['老城', ['老城街道']], ['西关', ['西关街道']], ['东关', ['东关街道']], ['北站', ['北站街道']], ['南岸', ['南岸街道']], ['科技园', ['科技园街道']], ['东部', ['东部街道']]],
    events: [
      { y: 2000, m: 1, tag: '虚构', title: '欢迎来到青湾', desc: '青湾是一座约 42 万人的虚构小城，青江从城中穿过，城市集中在北岸的老城、西关与东关，尚无地铁。' },
      { y: 2003, m: 1, tag: '虚构', title: '科技园开始开发', desc: '青江南岸东部的科技园与大学城对外开放建设。' },
      { y: 2008, m: 1, tag: '虚构', title: '江湾中心落成', desc: '南岸出现城市新的地标高楼。' },
    ],
    histTasks: [],
    lineColorsNice: ['#e4002b', '#0072ce', '#f6a800', '#00a651', '#8e44ad', '#00a8a8', '#d35400', '#c2185b', '#5c6bc0', '#7cb342', '#8d6e63', '#26a69a'],
    places: places.map(function (p) { return [p[0], p[1], p[2], p[3]]; }),
  };

  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'tutorial', name: '青湾', title: '新手教程 · 青湾', sub: '虚构小城 · 13 步主线任务', tutorial: true,
    region: '虚构', tagline: '十二分钟上手规划与运营', difficulty: 1, tags: ['新手推荐', '不限资金'],
    intro: '一座约 42 万人的虚构小城，青江从城中穿过。从连接南岸居民区与老城就业中心开始，13 步主线、约 12 分钟学会规划、建设、管理线路、扩大线网和经营。开通后能看到分担率、通勤时间与运营收支的变化，以及为什么。跟随列车与进阶小课可在之后选学。',
    features: [['flag', '一个明确的目标', '连接两岸、管理线路与经营，约 12 分钟'], ['chart', '马上看到效果', '开通动画、数字变化与建设效果报告'], ['sparkle', '不限资金', '自由建造，放心尝试'], ['coin', '图文财政小课', '11 页手绘小图讲清楚钱从哪来、花在哪里']],
    highlights: [[2000, '欢迎来到青湾'], [2003, '科技园开放'], [2008, '江湾中心落成']],
    desc: '一座约 42 万人的虚构小城，青江从城中穿过。13 步主线带你连接两岸，学会规划、预测、建设、运行和查看效果，再用地铁芯管理线路、购车、扩大线网与了解经营；之后可选学跟随列车与进阶小课。',
    facts: [['范围', '12 km × 10 km'], ['起始', '2000 年'], ['人口', '约 42 万'], ['类型', '虚构城市'], ['模式', '自由建造（不限资金）']],
    modes: ['free'],
    geo: GEO, data: DATA,
    cfg: {
      W: W, H: H, START: { y: 2000, m: 1, d: 1, minute: 6 * 60 },
      workWeek: { sat: [[2000, 0]], school: [[2000, 0]] },   // 虚构城市：双休日
      growth: Object.assign({}, CFG.growth, { popCurve: [[2000, 4.2e5], [2005, 4.9e5], [2010, 5.7e5], [2015, 6.3e5], [2020, 6.8e5], [2030, 7.5e5], [2050, 8.2e5], [2300, 9.0e5]], histEnd: 2000 }),
    },
    cam: { cx: 19, cy: 15, zoom: 24 },
    kind: 'fictional', mapVersion: 1, scenario: 'tutorial-2000',
  });
})(window.CM);
