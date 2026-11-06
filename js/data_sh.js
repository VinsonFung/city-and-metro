'use strict';
// 上海 · 1990 场景。地理来自 OpenStreetMap（geo_sh.js，现代数据），本文件补充 1990 年起的区域开放（按街道与区划分）、越江桥隧与高架道路通车年份、
// 人口就业中心、地标、重要设施、历史事件、本地任务与人民币经营参数。坐标单位为格（250 m），用 ll(纬度, 经度) 换算。
// 真实性：浦东开发开放、陆家嘴开发、越江桥隧与高架通车年份、地标落成年份、世博会与虹桥枢纽为史实参考；1990 年人口与就业分布、增长曲线、造价、票价与拨款为估算；2020 年之后为模拟。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.sh; if (!G) return;
  // 本文件的经纬度按国内地图常用的 GCJ-02 坐标填写，换算为 OSM 使用的 WGS-84 后再投影
  const P = G.proj, ll = function (lat, lon) { const w = CM.U.gcj2wgs(lat, lon); return [+((w[1] - P.lon0) * P.kx).toFixed(2), +((P.lat0 - w[0]) * P.ky).toFixed(2)]; };
  // 取自 OpenStreetMap 的地标位置（WGS-84，不再换算）
  const llW = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const atW = function (lat, lon, o) { const p = llW(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const poly = function (pts) { return pts.map(function (p) { return ll(p[0], p[1]); }); };
  const at = function (lat, lon, o) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const anchor = function (name, lat, lon, r) { const p = ll(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };
  const anchorW = function (name, lat, lon, r) { const p = llW(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };   // OSM 坐标（WGS-84）

  // 虹桥机场飞行区（近似）、陆家嘴金融贸易区核心（近似）、虹桥商务区（近似，机场以西）
  const hongqiao = poly([[31.2160, 121.3285], [31.2160, 121.3500], [31.1790, 121.3500], [31.1790, 121.3285]]);
  const lujiazui = poly([[31.2455, 121.4960], [31.2455, 121.5130], [31.2330, 121.5200], [31.2275, 121.5110], [31.2300, 121.4990]]);
  const hqcbd = poly([[31.2100, 121.3100], [31.2100, 121.3280], [31.1830, 121.3280], [31.1830, 121.3100]]);

  const data = {
    city: '上海', riverName: '黄浦江', seaName: '长江口', hsrYear: 2010,
    stages: [[1993, '无地铁时代'], [2000, '浦东开发初期'], [2010, '迎世博建设期']], stageLast: '超大城市网络化时期',
    // 历史发展阶段（v2.2，eras.js）：summary 中「史实」可查证，「估算」为模型设定的发展倾向；grow 只改变人口与岗位增长的去向（总量仍按人口曲线），
    // relocate 为每月疏解比例，corridors 为片区间通勤与购物去向倍数，demand 为出行强度与距离倍数，goals 为阶段目标（本城任务）
    eras: [
      { id: 'sh-e1', from: 1990, name: '无地铁时代', tag: '史实',
        summary: '史实：1990 年 4 月宣布开发开放浦东；浦西老城区十分拥挤，过黄浦江主要依靠轮渡与打浦路隧道，1991 年南浦大桥通车。估算：旧区改造把居民迁往普陀、徐汇、长宁的新村，就业仍集中在黄浦与静安。',
        grow: { pop: { huangpu: 0.5, jingan: 0.6, hongkou: 0.8, putuo: 1.2, xuhui: 1.2, changning: 1.2, pdriver: 1.3 }, jobs: { huangpu: 1.3, jingan: 1.2, xuhui: 1.1, pdriver: 1.2 } },
        relocate: { pop: { huangpu: 0.0006, jingan: 0.0004 } },
        demand: { decayHW: 0.85 }, corridors: [{ a: 'pdriver', b: 'huangpu', f: 1.15 }] },
      { id: 'sh-e2', from: 1993, name: '浦东开发初期', tag: '史实',
        summary: '史实：1993 年陆家嘴、金桥与张江开始建设，杨浦大桥通车，地铁 1 号线南段试运营（史实背景，不会自动建成）；1999 年浦东国际机场启用。估算：陆家嘴与浦东沿江的岗位快速增长，浦西旧区居民大量迁往外围新村，跨江通勤成为主要的新增出行。',
        grow: { pop: { huangpu: 0.5, jingan: 0.6, pdriver: 1.5, jinqiao: 1.4, putuo: 1.3, xinzhuang: 1.4, wusong: 1.1, changning: 1.2 }, jobs: { lujiazui: 2.4, jinqiao: 1.8, waigaoqiao: 1.6, xuhui: 1.3, changning: 1.3 } },
        relocate: { pop: { huangpu: 0.0008, jingan: 0.0005 } },
        demand: { decayHW: 1.05 },
        corridors: [{ a: 'pdriver', b: 'huangpu', f: 1.2 }, { a: 'lujiazui', b: 'huangpu', f: 1.2 }, { a: 'jinqiao', b: 'yangpu', f: 1.1 }, { a: 'xinzhuang', b: 'xuhui', f: 1.15 }],
        goals: [{ id: 'sh-g1', from: 1996, type: 'connect', months: 48, reward: 45000, title: '张江高科技园区', desc: '张江高科技园区招商引资，科研人员需要往返陆家嘴与浦西。用地铁连接张江与陆家嘴。', anchors: [anchor('张江', 31.2030, 121.5870, 4), anchor('陆家嘴', 31.2380, 121.5000, 3)] }] },
      { id: 'sh-e3', from: 2000, name: '迎世博建设期', tag: '史实',
        summary: '史实：2002 年上海获得 2010 年世博会主办权，卢浦大桥（2003 年）、上海南站（2006 年）建成，2008 年上海环球金融中心落成。估算：陆家嘴成为金融中心，宝山、闵行、嘉定与浦东外围出现大型居住区，平均通勤距离明显变长。',
        grow: { pop: { dachang: 1.5, minhang: 1.4, xinzhuang: 1.3, beicai: 1.5, jiading: 1.3, chuansha: 1.2, pudong: 1.3, huangpu: 0.5, jingan: 0.6 }, jobs: { lujiazui: 2.0, jinqiao: 1.5, xuhui: 1.3, jingan: 1.2, huangpu: 0.9 } },
        relocate: { pop: { huangpu: 0.0006 } },
        demand: { sh: 1.05, decayHW: 1.15 },
        corridors: [{ a: 'lujiazui', b: 'jingan', f: 1.15 }, { a: 'dachang', b: 'jingan', f: 1.15 }, { a: 'minhang', b: 'xuhui', f: 1.15 }, { a: 'beicai', b: 'lujiazui', f: 1.15 }],
        goals: [{ id: 'sh-g2', from: 2005, type: 'connect', months: 48, reward: 45000, title: '莘庄与上海南站', desc: '上海南站启用后，莘庄、梅陇的居民经南站换乘进城。用地铁连接莘庄与上海南站。', anchors: [anchor('莘庄', 31.1110, 121.3850, 3), anchor('上海南站', 31.1540, 121.4300, 3)] }] },
      { id: 'sh-e4', from: 2010, name: '超大城市网络化时期', tag: '史实',
        summary: '史实：2010 年 3 月虹桥综合交通枢纽启用、5 月世博会开幕；2015 年上海中心大厦落成，2018 年起每年举办进口博览会。估算：虹桥商务区成长为西部中心，就业向陆家嘴、虹桥、张江等多个中心扩散，郊区与中心城之间的长距离通勤增加。',
        grow: { pop: { pudong: 1.4, jiading: 1.3, minhang: 1.3, dachang: 1.2, chuansha: 1.2, huangpu: 0.5, jingan: 0.6 }, jobs: { hqcbd: 2.2, lujiazui: 1.5, jinqiao: 1.5, xuhui: 1.3, huangpu: 0.85 } },
        relocate: { jobs: { huangpu: 0.0004 } },
        demand: { sh: 1.08, lz: 1.1, decayHW: 1.2, hub: 1.15 },
        corridors: [{ a: 'hqcbd', b: 'jingan', f: 1.15 }, { a: 'jinqiao', b: 'lujiazui', f: 1.15 }, { a: 'pudong', b: 'lujiazui', f: 1.15 }, { a: 'jiading', b: 'putuo', f: 1.15 }],
        goals: [{ id: 'sh-g3', from: 2013, type: 'connect', months: 48, reward: 45000, title: '前滩商务区', desc: '世博会后，黄浦江南段的前滩发展为新的商务区。用地铁连接前滩与陆家嘴。', anchors: [anchor('前滩', 31.1500, 121.4700, 4), anchor('陆家嘴', 31.2380, 121.5000, 3)] },
          { id: 'sh-g4', type: 'connect', months: 48, reward: 45000, title: '张江与金桥', desc: '张江与金桥的产业园区之间缺少直达交通。用地铁连接张江与金桥。', anchors: [anchor('张江', 31.2030, 121.5870, 4), anchor('金桥', 31.2650, 121.5900, 4)] }] },
      { id: 'sh-e5', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '模拟：此后的发展按模型推演，不代表真实历史。估算：浦东外围、嘉定与虹桥继续成长，中心城人口保持稳定。',
        grow: { pop: { pudong: 1.3, jiading: 1.3, chuansha: 1.2, huangpu: 0.6 }, jobs: { hqcbd: 1.4, jinqiao: 1.3, pudong: 1.3, huangpu: 0.9 } },
        demand: { lz: 1.1, decayHW: 1.2 }, corridors: [{ a: 'pudong', b: 'jinqiao', f: 1.1 }] },
    ],
    briefing: {
      lead: '1990 年的上海还没有地铁。七百多万人挤在黄浦江西岸的老城区，公交车厢塞得满满当当；对岸的浦东还是农田与码头，黄浦江上一座大桥也没有。4 月，浦东开发开放的消息就要宣布。',
      modes: [['metro', '地铁', '尚无地铁。真实的地铁 1 号线 1993 年开始试运营，本局由你规划，真实线路不会自动出现。'], ['bus', '公交与自行车', '公交线路严重超载，自行车是通勤主力，高峰时市中心道路拥堵。'], ['bridge', '越江', '黄浦江上没有桥，过江只能走打浦路隧道、延安东路隧道或乘轮渡；南浦大桥 1991 年底才通车。'], ['rail', '铁路', '1987 年启用的上海站是主要铁路枢纽。列车本身不参与模拟，车站与虹桥机场会产生市内接驳出行，地面铁路会阻隔步行。']],
    },
    // 虹桥机场照常运营：用地不开发，范围内只能地下设站与地下穿越（同台北松山机场的规则）
    airport: { name: '虹桥机场', closeYear: 9999, buildable: 'underground', runway: [llW(31.2131, 121.3355), llW(31.1826, 121.3371)] },   // v2.2：跑道按 OSM 坐标（原数据走向偏斜）
    // 虹桥机场第二跑道（v2.2，OSM 坐标）：在原跑道以西约 365 m，2010 年 3 月启用（史实）
    runways: [{ a: llW(31.1834, 121.3332), b: llW(31.2130, 121.3316), from: 2010.2 }],
    regions: [
      { id: 'airport', name: '虹桥机场', poly: hongqiao, open: 1990, plan: 'res', note: '民用机场照常运营，用地不开发；范围内可以地下设站与地下穿越' },
      { id: 'lujiazui', name: '陆家嘴金融贸易区', poly: lujiazui, open: 1993, plan: 'cbd', note: '1990 年浦东开发开放，1993 年起陆家嘴金融贸易区大规模建设（史实）' },
      { id: 'hqcbd', name: '虹桥商务区', poly: hqcbd, open: 2009, plan: 'cbd', note: '2010 年虹桥综合交通枢纽启用，周边建设虹桥商务区（史实）' },
      { id: 'huangpu', name: '黄浦（外滩·人民广场·老城厢）', district: ['黄浦区'], open: 1990, plan: 'oldmix' },
      { id: 'jingan', name: '静安（南京西路·闸北）', district: ['静安区'], open: 1990, plan: 'mix' },
      { id: 'xuhui', name: '徐汇（徐家汇·漕河泾）', district: ['徐汇区'], open: 1990, plan: 'mix' },
      { id: 'changning', name: '长宁（中山公园·古北）', district: ['长宁区'], open: 1990, plan: 'res' },
      { id: 'putuo', name: '普陀（长寿路·曹杨）', district: ['普陀区'], open: 1992, plan: 'resind' },
      { id: 'hongkou', name: '虹口（四川北路·北外滩）', district: ['虹口区'], open: 1990, plan: 'oldmix' },
      { id: 'yangpu', name: '杨浦（工业区·五角场）', district: ['杨浦区'], open: 1992, plan: 'resind' },
      { id: 'pdriver', name: '浦东沿江（塘桥·洋泾·上钢）', streets: ['潍坊新村街道', '陆家嘴街道', '塘桥街道', '洋泾街道', '南码头路街道', '周家渡街道', '上钢新村街道', '东明路街道', '浦兴路街道', '沪东新村街道', '金杨新村街道'], open: 1992, plan: 'resind' },
      { id: 'jinqiao', name: '金桥·张江', streets: ['金桥镇', '张江镇', '唐镇', '花木街道'], open: 1994, plan: 'ind', pop: 8.7e6, note: '金桥出口加工区与张江高科技园区（史实）' },
      { id: 'waigaoqiao', name: '高桥·外高桥', streets: ['高桥镇', '高行镇', '高东镇', '曹路镇'], open: 1996, plan: 'ind', pop: 9.0e6, note: '1990 年设立外高桥保税区（史实）' },
      { id: 'beicai', name: '北蔡·三林', streets: ['北蔡镇', '三林镇', '康桥镇'], open: 2000, plan: 'res', pop: 10.5e6 },
      { id: 'pudong', name: '浦东其他地区', district: ['浦东新区'], open: 2005, plan: 'res', pop: 12.35e6 },
      { id: 'wusong', name: '吴淞·张庙', streets: ['吴淞街道', '张庙街道', '友谊路街道', '淞南镇', '高境镇', '庙行镇'], open: 1995, plan: 'resind' },
      { id: 'dachang', name: '大场·顾村', streets: ['大场镇', '顾村镇', '杨行镇', '罗店镇', '月浦镇'], open: 2000, plan: 'res', pop: 10.5e6 },
      { id: 'xinzhuang', name: '莘庄·七宝·梅陇', streets: ['莘庄镇', '七宝镇', '梅陇镇', '古美街道', '新虹街道', '虹桥镇', '华漕镇', '浦锦街道'], open: 1996, plan: 'res', pop: 9e6, note: '1992 年上海县与闵行区合并，莘庄、七宝一带大规模建设住宅（史实）' },
      { id: 'minhang', name: '闵行其他地区', district: ['闵行区'], open: 2002, plan: 'res', pop: 11.5e6 },
      { id: 'chuansha', name: '川沙·合庆', streets: ['川沙新镇', '合庆镇'], open: 2000, plan: 'res', pop: 10.3e6, note: '1993 年川沙县并入浦东新区；1999 年浦东国际机场在其东侧建成（史实）' },
      // 上海迪士尼度假区（v2.2，OSM 坐标）：乐园、迪士尼小镇与星愿公园；2016 年 6 月开园，之前为预留用地（乐园用地不分配普通住宅与就业）
      { id: 'disney', name: '上海迪士尼度假区', park: true, open: 2016, plan: 'res', poly: [[31.1506, 121.6497], [31.1506, 121.6626], [31.1455, 121.6697], [31.1375, 121.6697], [31.1375, 121.6557], [31.1411, 121.6497]].map(function (p) { return llW(p[0], p[1]); }), note: '2016 年 6 月上海迪士尼乐园开园（史实）；同年 4 月地铁 11 号线迪士尼站启用（史实）' },
      { id: 'jiading', name: '嘉定（江桥·真新）', district: ['嘉定区'], open: 2005, plan: 'res', pop: 12.35e6 },
    ],
    defaultRegion: { id: 'outer', name: '外围地区', open: 2008, plan: 'res', pop: 13.95e6 },
    plans: CM.DATA.plans,
    // 1990 年人口与就业中心（估算，人/km²；r 约为影响半径 km）
    centers: [
      at(31.2360, 121.4800, { pop: 45000, jobs: 90000, r: 1.2 }),   // 外滩、南京东路、人民广场
      at(31.2260, 121.4900, { pop: 70000, jobs: 30000, r: 0.9 }),   // 老城厢、豫园
      at(31.2250, 121.4500, { pop: 40000, jobs: 40000, r: 1.0 }),   // 静安寺、南京西路
      at(31.2180, 121.4700, { pop: 55000, jobs: 35000, r: 1.1 }),   // 淮海路、卢湾
      at(31.1950, 121.4370, { pop: 30000, jobs: 25000, r: 1.2 }),   // 徐家汇
      at(31.2220, 121.4200, { pop: 35000, jobs: 15000, r: 1.1 }),   // 曹家渡、中山公园
      at(31.2500, 121.4600, { pop: 45000, jobs: 25000, r: 1.2 }),   // 闸北、上海站
      at(31.2600, 121.4850, { pop: 50000, jobs: 20000, r: 1.2 }),   // 四川北路、虹口
      at(31.2650, 121.5200, { pop: 30000, jobs: 30000, r: 1.5 }),   // 杨浦工业区
      at(31.3000, 121.5100, { pop: 12000, jobs: 12000, r: 1.2 }),   // 五角场
      at(31.2400, 121.4200, { pop: 30000, jobs: 15000, r: 1.4 }),   // 长寿路、曹杨
      at(31.2100, 121.4000, { pop: 20000, jobs: 10000, r: 1.4 }),   // 长宁、古北
      at(31.2350, 121.5100, { pop: 25000, jobs: 15000, r: 1.4 }),   // 浦东沿江
      at(31.1800, 121.5000, { pop: 15000, jobs: 20000, r: 1.3 }),   // 上钢、周家渡
      at(31.3800, 121.4900, { pop: 8000, jobs: 15000, r: 1.8 }),    // 吴淞、宝钢
      at(31.1700, 121.4300, { pop: 15000, jobs: 10000, r: 1.3 }),   // 漕河泾、田林
      // v2.1 扩大范围（1990 年估算）
      at(31.1900, 121.7000, { pop: 8000, jobs: 5000, r: 0.9 }),     // 川沙镇
    ],
    rural: { pop: 800, jobs: 150 },
    // 越江桥隧与高架道路通车年份（名称前缀匹配；1990 年已有的道路按所在区域开放年份出现）。1990 年黄浦江上还没有桥；
    // OSM 中杨浦、徐浦大桥分别并入「内环高架路」「外环高速」。越江桥隧、内环与南北高架为史实，部分高架与快速路为近似年份
    roadYears: {
      '南浦大桥': 1991, '杨浦大桥': 1993, '徐浦大桥': 1997, '卢浦大桥': 2003, '打浦路隧道': 1971, '延安东路隧道': 1988, '外环隧道': 2003, '复兴东路隧道': 2004,
      '大连路隧道': 2003, '翔殷路隧道': 2005, '新建路隧道': 2009, '人民路隧道': 2009, '西藏南路隧道': 2010, '龙耀路隧道': 2010, '上中路隧道': 2009, '军工路隧道': 2011,
      '长江路隧道': 2016, '周家嘴路隧道': 2019, '江浦路隧道': 2021, '北横通道': 2021, '外滩隧道': 2010, '郊环隧道': 2009,
      '内环高架路': 1994, '南北高架': 1995, '延安高架路': 1999, '逸仙高架路': 1999, '中环路': 2006, '外环高速': 2003, '上海绕城高速': 2009,
      '沪嘉高速': 1988, '京沪高速': 1996, '沪昆高速': 1998, '沪渝高速': 2002, '沪金高速': 2000, '沪崇高速': 2009, '沪翔高速': 2011,
      '杨高路': 1992, '世纪大道': 2000, '罗山路': 1997, '龙东大道': 1998, '龙东高架路': 2008, '罗山高架路': 2005, '华夏高架路': 2009, '军工高架路': 2007,
      '北翟高架路': 2015, '嘉闵高架路': 2014, '虹梅高架路': 2014, '崧泽高架路': 2015, '度假区高架路': 2016, '五洲大道': 2011, '世博大道': 2010,
    },
    bridgeYears: {}, bridgeDefaultYear: 1990,
    simRoads: [],
    landmarks: [
      Object.assign(atW(31.2395, 121.4850), { id: 'sh_bund', name: '外滩建筑群', w: 1200, d: 50, rot: -96, year: 1937, kind: 'bund' }),
      Object.assign(atW(31.2356, 121.4670), { id: 'sh_park', name: '国际饭店', w: 40, d: 40, year: 1934, kind: 'skyscraper', h: 83 }),
      Object.assign(atW(31.2261, 121.4485), { id: 'sh_expoctr', name: '上海展览中心', w: 200, d: 150, year: 1955, kind: 'palace', style: 'spire', h: 110 }),
      Object.assign(atW(31.2289, 121.4878), { id: 'sh_yuyuan', name: '豫园·城隍庙', w: 300, d: 250, year: 1577, kind: 'traditional' }),
      Object.assign(atW(31.2254, 121.4407), { id: 'sh_jingan', name: '静安寺', w: 150, d: 120, year: 1900, kind: 'temple' }),
      Object.assign(atW(31.2436, 121.4399), { id: 'sh_jade', name: '玉佛寺', w: 150, d: 180, year: 1918, kind: 'temple' }),
      Object.assign(atW(31.1771, 121.4471), { id: 'sh_longhua', name: '龙华寺', w: 160, d: 220, year: 977, kind: 'pagoda', h: 41 }),
      Object.assign(at(31.1932, 121.4370), { id: 'sh_xjh', name: '徐家汇天主堂', w: 90, d: 40, year: 1910, kind: 'church' }),
      Object.assign(atW(31.2517, 121.4532), { id: 'sh_station', name: '上海站', w: 300, d: 120, year: 1987, kind: 'rail' }),
      Object.assign(atW(31.2981, 121.4979), { id: 'sh_fudan', name: '复旦大学', w: 900, d: 700, year: 1905, kind: 'campus' }),
      Object.assign(atW(31.2847, 121.4974), { id: 'sh_tongji', name: '同济大学', w: 900, d: 800, year: 1952, kind: 'campus' }),
      Object.assign(at(31.2005, 121.4370), { id: 'sh_sjtu', name: '上海交通大学（徐汇）', w: 600, d: 500, year: 1896, kind: 'campus', style: 'palace' }),
      Object.assign(atW(31.2286, 121.4018), { id: 'sh_ecnu', name: '华东师范大学', w: 800, d: 600, year: 1951, kind: 'campus' }),
      Object.assign(atW(31.2415, 121.4968), { id: 'sh_pearl', name: '东方明珠广播电视塔', w: 100, d: 100, year: 1994, kind: 'tvtower', style: 'pearl', h: 468 }),
      Object.assign(atW(31.2302, 121.4710), { id: 'sh_museum', name: '上海博物馆', w: 120, d: 120, year: 1996, kind: 'museum', style: 'ding' }),
      Object.assign(atW(31.1833, 121.4374), { id: 'sh_stadium', name: '上海体育场', w: 300, d: 270, year: 1997, kind: 'stadium' }),
      Object.assign(atW(31.2315, 121.4673), { id: 'sh_gt', name: '上海大剧院', w: 120, d: 100, year: 1998, kind: 'concert' }),
      Object.assign(atW(31.2373, 121.5014), { id: 'sh_jinmao', name: '金茂大厦', w: 70, d: 70, year: 1999, kind: 'skyscraper', style: 'jinmao', h: 420.5 }),
      Object.assign(atW(31.2733, 121.4763), { id: 'sh_hongkou', name: '虹口足球场', w: 220, d: 180, year: 1999, kind: 'stadium' }),
      Object.assign(atW(31.2119, 121.5634), { id: 'sh_sniec', name: '上海新国际博览中心', w: 600, d: 500, year: 2001, kind: 'expo' }),
      Object.assign(atW(31.1553, 121.4266), { id: 'sh_south', name: '上海南站', w: 300, d: 300, year: 2006, kind: 'rail', style: 'round' }),
      Object.assign(atW(31.2366, 121.5030), { id: 'sh_swfc', name: '上海环球金融中心', w: 60, d: 60, year: 2008, kind: 'skyscraper', style: 'swfc', h: 492 }),
      Object.assign(atW(31.1960, 121.3162), { id: 'sh_hqstation', name: '虹桥站', w: 600, d: 400, rot: 90, year: 2010, kind: 'rail' }),
      Object.assign(atW(31.1865, 121.4899), { id: 'sh_cnpav', name: '中国馆', w: 140, d: 140, year: 2010, kind: 'museum', style: 'crown' }),
      Object.assign(atW(31.2356, 121.5013), { id: 'sh_tower', name: '上海中心大厦', w: 80, d: 80, year: 2015, kind: 'skyscraper', style: 'shtower', h: 632 }),
      Object.assign(atW(31.1463, 121.6560), { id: 'sh_disney', name: '上海迪士尼乐园', w: 1150, d: 900, h: 60, year: 2016, kind: 'themepark', style: 'castle' }),   // 约 91 公顷，奇幻童话城堡约 60 m
    ],
    // 重要设施（见 facility.js）：位置与启用 / 停用年份为史实参考（位置近似）；规模均为估算。
    // 枢纽 pax：市内接驳出行（汽车 + 地铁，万人次/日）；浦东国际机场在地图东缘以东约 9 km，于川沙一带设出图接驳点。
    facilities: [
      { id: 'sh_station', n: '上海站', t: 'rail', lm: 'sh_station', pax: [[1990, 5], [2000, 8], [2010, 10], [2019, 9]] },
      { id: 'sh_south', n: '上海南站', t: 'rail', lm: 'sh_south', y0: [2006, 7], pax: [[2006.5, 2], [2010, 4], [2019, 4]] },
      { id: 'sh_west', n: '上海西站', t: 'rail', at: ll(31.2625, 121.4040), pax: [[1990, 0.5], [2010, 1], [2019, 1.5]] },
      { id: 'sh_hqstation', n: '虹桥站', t: 'rail', lm: 'sh_hqstation', y0: [2010, 7], pax: [[2010.5, 4], [2015, 10], [2019, 14], [2030, 16]], note: '2010 年 7 月虹桥综合交通枢纽启用，京沪高铁 2011 年通车。' },
      { id: 'sh_disney', n: '上海迪士尼乐园', t: 'scenic', lm: 'sh_disney', y0: [2016, 6], w: [[2016.5, 0.045], [2019, 0.05], [2020, 0.025], [2021, 0.04], [2023, 0.05]], we: 1.9, note: '主题乐园：周末与假日客流明显高于工作日（估算）；位于浦东川沙，2016 年 6 月开园。' },
      { id: 'sh_pvgair', n: '浦东机场（川沙接驳）', t: 'air', ext: ['E', 9],at: ll(31.1900, 121.7000), y0: [1999, 9], pax: [[1999.7, 0.4], [2005, 2], [2010, 3.8], [2019, 7], [2030, 8]], note: '浦东国际机场 1999 年 9 月建成通航，在地图东缘以东约 9 km。此处为迎宾高速、磁浮与机场方向轨道交通出图的接驳点。' },
      { id: 'sh_hqair', n: '虹桥机场', t: 'air', at: llW(31.1965, 121.3425), rw: [llW(31.2131, 121.3355), llW(31.1826, 121.3371)], pax: [[1990, 1.4], [1999.8, 3.5], [2000, 2.5], [2005, 4.9], [2010, 8.5], [2019, 12.5], [2030, 13]], note: '1999 年浦东国际机场（地图东缘以外）启用后国际航线逐步迁出；2010 年 T2 航站楼启用。' },
      { id: 'sh_fudan', n: '复旦大学', t: 'uni', lm: 'sh_fudan', w: 0.035 },
      { id: 'sh_tongji', n: '同济大学', t: 'uni', lm: 'sh_tongji', w: 0.03 },
      { id: 'sh_sjtu', n: '上海交通大学（徐汇）', t: 'uni', lm: 'sh_sjtu', w: 0.02 },
      { id: 'sh_ecnu', n: '华东师范大学', t: 'uni', lm: 'sh_ecnu', w: 0.025 },
      { id: 'sh_sufe', n: '上海财经大学', t: 'uni', at: ll(31.3075, 121.4985), w: 0.012 },
      { id: 'sh_shu', n: '上海大学（宝山）', t: 'uni', at: ll(31.3160, 121.3920), y0: 1999, w: 0.02 },
      { id: 'sh_ecust', n: '华东理工大学', t: 'uni', at: ll(31.1440, 121.4235), w: 0.015 },
      { id: 'sh_dhu', n: '东华大学（延安路）', t: 'uni', at: llW(31.20622, 121.41055), w: 0.01 },
      { id: 'sh_ruijin', n: '瑞金医院', t: 'hosp', at: ll(31.2115, 121.4680), w: 0.06 },
      { id: 'sh_huashan', n: '华山医院', t: 'hosp', at: ll(31.2155, 121.4425), w: 0.05 },
      { id: 'sh_zhongshan', n: '中山医院', t: 'hosp', at: ll(31.1990, 121.4535), w: 0.06 },
      { id: 'sh_renji', n: '仁济医院', t: 'hosp', at: llW(31.23559, 121.47956), w: 0.04 },
      { id: 'sh_changhai', n: '长海医院', t: 'hosp', at: ll(31.3070, 121.5260), w: 0.04 },
      { id: 'sh_xinhua', n: '新华医院', t: 'hosp', at: ll(31.2720, 121.5205), w: 0.04 },
      { id: 'sh_six', n: '第六人民医院', t: 'hosp', at: llW(31.18040, 121.41788), w: 0.04 },
      { id: 'sh_dongfang', n: '东方医院', t: 'hosp', at: llW(31.23954, 121.50792), w: 0.03 },
      { id: 'sh_njd', n: '南京东路', t: 'shop', at: ll(31.2365, 121.4790), w: [[1990, 0.08], [2010, 0.06]] },
      { id: 'sh_njx', n: '南京西路', t: 'shop', at: ll(31.2290, 121.4560), w: [[1990, 0.03], [2000, 0.05]] },
      { id: 'sh_hh', n: '淮海中路', t: 'shop', at: ll(31.2185, 121.4630), w: 0.05 },
      { id: 'sh_xjh', n: '徐家汇商圈', t: 'shop', at: ll(31.1950, 121.4365), w: [[1990, 0.02], [2000, 0.05]] },
      { id: 'sh_yuyuan', n: '豫园商城', t: 'shop', at: ll(31.2275, 121.4920), p: { sh: 0.5, lz: 0.5 }, w: 0.03 },
      { id: 'sh_scb', n: '四川北路', t: 'shop', at: ll(31.2620, 121.4830), w: 0.025 },
      { id: 'sh_zsgy', n: '中山公园商圈', t: 'shop', at: ll(31.2210, 121.4170), y0: 1999, w: 0.025 },
      { id: 'sh_wjc', n: '五角场', t: 'shop', at: ll(31.3000, 121.5145), w: [[1990, 0.008], [2006, 0.035]] },
      { id: 'sh_zd', n: '陆家嘴商圈', t: 'shop', at: ll(31.2365, 121.5020), y0: 2002, w: 0.03 },
      { id: 'sh_xtd', n: '新天地', t: 'shop', at: ll(31.2190, 121.4750), y0: 2001, p: { sh: 0.5, lz: 0.5 }, w: 0.02 },
      { id: 'sh_bund', n: '外滩金融区', t: 'cbd', at: ll(31.2385, 121.4870), w: 0.02 },
      { id: 'sh_ljz', n: '陆家嘴金融贸易区', t: 'cbd', at: ll(31.2380, 121.5050), y0: 1993, w: [[1993, 0.003], [2000, 0.02], [2010, 0.045], [2020, 0.055]] },
      { id: 'sh_njxc', n: '南京西路商务区', t: 'cbd', at: ll(31.2295, 121.4560), w: [[1990, 0.005], [2000, 0.02]] },
      { id: 'sh_gubei', n: '虹桥开发区（古北）', t: 'cbd', at: ll(31.2050, 121.3990), w: 0.01 },
      { id: 'sh_chj', n: '漕河泾开发区', t: 'cbd', at: ll(31.1700, 121.4000), w: 0.012 },
      { id: 'sh_zj', n: '张江高科技园区', t: 'cbd', at: ll(31.2030, 121.5900), y0: 1992, w: [[1992, 0.002], [2010, 0.025]] },
      { id: 'sh_hqcbd', n: '虹桥商务区', t: 'cbd', at: llW(31.19319, 121.31114), y0: 2010, w: [[2010, 0.003], [2020, 0.02]] },
      { id: 'sh_bundv', n: '外滩', t: 'scenic', lm: 'sh_bund', w: 0.06 },
      { id: 'sh_pearl', n: '东方明珠', t: 'scenic', lm: 'sh_pearl', w: 0.03 },
      { id: 'sh_yy', n: '豫园', t: 'scenic', lm: 'sh_yuyuan', w: 0.03 },
      { id: 'sh_museum', n: '人民广场与上海博物馆', t: 'scenic', lm: 'sh_museum', w: 0.02 },
      { id: 'sh_jingan', n: '静安寺', t: 'scenic', lm: 'sh_jingan', w: 0.01 },
      { id: 'sh_jade', n: '玉佛寺', t: 'scenic', lm: 'sh_jade', w: 0.01 },
      { id: 'sh_longhua', n: '龙华寺', t: 'scenic', lm: 'sh_longhua', w: 0.008 },
      { id: 'sh_tzf', n: '田子坊', t: 'scenic', at: ll(31.2090, 121.4680), y0: 2006, w: 0.008 },
      { id: 'sh_zoo', n: '上海动物园', t: 'scenic', at: ll(31.1920, 121.3600), w: 0.012 },
      { id: 'sh_cnpav', n: '中国馆（中华艺术宫）', t: 'scenic', lm: 'sh_cnpav', y0: [2010, 11], w: 0.008 },
      { id: 'sh_rmgy', n: '人民公园', t: 'park', at: ll(31.2320, 121.4725), w: 0.012 },
      { id: 'sh_zsp', n: '中山公园', t: 'park', at: llW(31.22332, 121.41562), w: 0.01 },
      { id: 'sh_century', n: '世纪公园', t: 'park', at: llW(31.21880, 121.54863), y0: 2000, w: 0.012 },
      { id: 'sh_luxun', n: '鲁迅公园', t: 'park', at: ll(31.2710, 121.4815), w: 0.01 },
      { id: 'sh_gq', n: '共青森林公园', t: 'park', at: llW(31.32082, 121.54799), w: 0.008 },
      { id: 'sh_cf', n: '长风公园', t: 'park', at: ll(31.2280, 121.3920), w: 0.008 },
      { id: 'sh_stadium', n: '上海体育场', t: 'stadium', lm: 'sh_stadium', w: 0.015 },
      { id: 'sh_gym', n: '上海体育馆', t: 'stadium', at: llW(31.18328, 121.43371), w: 0.008 },
      { id: 'sh_hongkou', n: '虹口足球场', t: 'stadium', lm: 'sh_hongkou', w: 0.01 },
      { id: 'sh_yuanshen', n: '源深体育中心', t: 'stadium', at: ll(31.2290, 121.5260), w: 0.005 },
      { id: 'sh_expo2010', n: '2010 年上海世博会', t: 'venue', at: ll(31.1860, 121.4900), r: 2.4, y0: [2010, 5], y1: [2010, 11], w: 0.12, note: '2010 年 5 月 1 日至 10 月 31 日，参观人次约 7300 万。' },
      { id: 'sh_expoctr', n: '上海展览中心', t: 'venue', lm: 'sh_expoctr', w: 0.008 },
      { id: 'sh_sniec', n: '上海新国际博览中心', t: 'venue', lm: 'sh_sniec', w: 0.02 },
      { id: 'sh_icc', n: '上海国际会议中心', t: 'venue', at: llW(31.24145, 121.49245), y0: 1999, w: 0.005 },
      { id: 'sh_gt', n: '上海大剧院', t: 'venue', lm: 'sh_gt', w: 0.006 },
      { id: 'sh_mbcc', n: '世博文化中心', t: 'venue', at: ll(31.1890, 121.4970), y0: [2010, 5], w: 0.008 },
    ],
    districtLabels: [['黄浦', ['黄浦区']], ['静安', ['静安区']], ['徐汇', ['徐汇区']], ['长宁', ['长宁区']], ['普陀', ['普陀区']], ['虹口', ['虹口区']], ['杨浦', ['杨浦区']], ['浦东', ['浦东新区']], ['宝山', ['宝山区']], ['闵行', ['闵行区']], ['嘉定', ['嘉定区']]],
    // 纪事（只能在末尾追加：已发生记录按序号保存）
    events: [
      { y: 1990, m: 1, tag: '史实', title: '1990 年的上海', desc: '市区人口约 740 万，城市集中在黄浦江西岸；浦东大多是农田、工厂与码头，黄浦江上没有一座大桥；没有地铁，公交车厢严重超载。' },
      { y: 1990, m: 4, tag: '史实', title: '浦东开发开放', desc: '中央宣布开发开放浦东，陆家嘴、金桥、外高桥与张江陆续设立开发区。', fx: { grow: { region: ['pdriver', 'lujiazui'], jobs: 1.4, years: 6 } } },
      { y: 1991, m: 12, tag: '史实', title: '南浦大桥通车', desc: '黄浦江上的第一座大桥，浦西与浦东之间不再只靠隧道与轮渡。' },
      { y: 1993, m: 5, tag: '史实', title: '史实背景：地铁 1 号线南段试运营', desc: '锦江乐园至徐家汇段试运营，1995 年全线通车。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 1993, m: 10, tag: '史实', title: '杨浦大桥通车', desc: '当时世界跨度最大的斜拉桥，连接杨浦与浦东。' },
      { y: 1994, m: 10, tag: '史实', title: '东方明珠落成', desc: '高 468 m 的广播电视塔成为浦东开发的标志。' },
      { y: 1994, m: 12, tag: '史实', title: '内环高架路贯通', desc: '城市快速路开始成网，1995 年南北高架通车。' },
      { y: 1996, m: 10, tag: '史实', title: '上海博物馆新馆开放', desc: '人民广场改造为市民广场，周边陆续建成大剧院与城市规划展示馆。' },
      { y: 1997, m: 10, tag: '史实', title: '上海体育场启用', desc: '为第八届全国运动会建成的 8 万座体育场。' },
      { y: 1999, m: 8, tag: '史实', title: '金茂大厦落成', desc: '高 420.5 m，当时中国最高的建筑。' },
      { y: 1999, m: 9, tag: '史实', title: '浦东国际机场启用', desc: '新机场在地图范围以外，国际航线逐步从虹桥机场迁出。' },
      { y: 2002, m: 12, tag: '史实', title: '获得 2010 年世博会主办权', desc: '黄浦江两岸的工厂与码头开始动迁，规划建设世博园区。' },
      { y: 2003, m: 6, tag: '史实', title: '卢浦大桥通车', desc: '连接卢湾与浦东的钢拱桥。' },
      { y: 2006, m: 7, tag: '史实', title: '上海南站启用', desc: '圆形屋顶的新站房成为城市南部的交通枢纽。' },
      { y: 2008, m: 8, tag: '史实', title: '上海环球金融中心落成', desc: '高 492 m，顶部的梯形开口成为陆家嘴天际线的标志。' },
      { y: 2010, m: 3, tag: '史实', title: '虹桥综合交通枢纽启用', desc: '机场、高铁、地铁与长途客运集于一处，城市西部出现新的交通中心。', fx: { grow: { region: 'hqcbd', jobs: 1.5, years: 6 } } },
      { y: 2010, m: 5, tag: '史实', title: '2010 年上海世博会开幕', desc: '184 天里参观人次约 7300 万，园区横跨黄浦江两岸。', fx: { demand: { hub: 1.1, months: 6 }, sat: { v: 2, months: 6 } } },
      { y: 2015, m: 12, tag: '史实', title: '上海中心大厦落成', desc: '高 632 m，中国最高的建筑。' },
      { y: 2016, m: 6, tag: '史实', title: '上海迪士尼乐园开园', desc: '浦东川沙的主题乐园与度假区开园，带来大量周末与假日的休闲出行；地铁 11 号线迪士尼站同年 4 月启用。' },
      { y: 2018, m: 11, tag: '史实', title: '首届中国国际进口博览会', desc: '在虹桥的国家会展中心（地图范围外附近）举行。', fx: { demand: { hub: 1.1, months: 1 } } },
      { y: 2020, m: 1, tag: '史实', title: '新冠肺炎疫情', desc: '春节后城市活动大幅减少，客流骤降，之后逐步恢复。', fx: { demand: { sc: 0.7, sh: 0.75, lz: 0.6, hub: 0.5, months: 3, fade: 1 } } },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后人口、道路和区域变化按模拟规则推演，不代表真实历史。' },
    ],
    // 本地历史主题任务：参考上海的发展需求，不要求复刻真实线路走向（奖励单位：万元，1990 年价格）
    histTasks: [
      { id: 'sh1', appear: [1990, 3], deadline: [1995, 12], type: 'connect', reward: 250000, title: '南北主轴', desc: '连接上海站、人民广场、徐家汇与锦江乐园，为最拥挤的南北走廊建设第一条地铁。', anchors: [anchor('上海站', 31.2495, 121.4560, 3), anchor('人民广场', 31.2330, 121.4750, 3), anchor('徐家汇', 31.1940, 121.4370, 3), anchor('锦江乐园', 31.1420, 121.4140, 3)] },
      { id: 'sh2', appear: [1993, 1], deadline: [2000, 12], type: 'connect', reward: 300000, title: '越过黄浦江：东西主轴', desc: '连接中山公园、静安寺、人民广场、陆家嘴与龙阳路。过黄浦江需要建设越江隧道。', anchors: [anchor('中山公园', 31.2190, 121.4180, 3), anchor('静安寺', 31.2230, 121.4460, 3), anchor('人民广场', 31.2330, 121.4750, 3), anchor('陆家嘴', 31.2380, 121.5020, 3), anchor('龙阳路', 31.2030, 121.5570, 3)] },
      { id: 'sh3', appear: [1995, 1], deadline: [2001, 12], type: 'connect', reward: 250000, title: '西部高架环线', desc: '沿铁路线建设一条高架线路，连接漕溪路、宜山路、中山公园、上海站与江湾镇。', anchors: [anchor('漕溪路', 31.1730, 121.4330, 3), anchor('宜山路', 31.1860, 121.4230, 3), anchor('中山公园', 31.2190, 121.4180, 3), anchor('上海站', 31.2495, 121.4560, 3), anchor('江湾镇', 31.2930, 121.4800, 3)] },
      { id: 'sh4', appear: [2000, 1], deadline: [2007, 12], type: 'coverage', target: 0.3, reward: 300000, title: '地铁覆盖三成人口', desc: '2007 年底前，步行 15 分钟可到达地铁站的人口不低于全市人口的 30%。' },
      { id: 'sh5', appear: [2003, 1], deadline: [2010, 4], type: 'connect', reward: 300000, title: '世博会', desc: '世博会开幕前，连接世博园区、陆家嘴与人民广场。', anchors: [anchor('世博园', 31.1865, 121.4925, 3), anchor('陆家嘴', 31.2380, 121.5020, 3), anchor('人民广场', 31.2330, 121.4750, 3)] },
      { id: 'sh6', appear: [2005, 1], deadline: [2010, 12], type: 'connect', reward: 250000, title: '五角场与江湾', desc: '连接五角场、同济大学、四川北路与人民广场。', anchors: [anchor('五角场', 31.3000, 121.5145, 3), anchor('同济大学', 31.2830, 121.5025, 3), anchor('四川北路', 31.2610, 121.4840, 3), anchor('人民广场', 31.2330, 121.4750, 3)] },
      { id: 'sh7', appear: [2007, 1], deadline: [2010, 3], type: 'connect', reward: 250000, title: '虹桥综合交通枢纽', desc: '枢纽启用前，连接虹桥站、中山公园与人民广场。', anchors: [anchor('虹桥站', 31.1945, 121.3215, 3), anchor('中山公园', 31.2190, 121.4180, 3), anchor('人民广场', 31.2330, 121.4750, 3)] },
      { id: 'sh8', appear: [2010, 1], deadline: [2016, 12], type: 'coverage', target: 0.6, reward: 300000, title: '地铁覆盖六成人口', desc: '2016 年底前，步行 15 分钟可到达地铁站的人口不低于全市人口的 60%。' },
      { id: 'sh9', appear: [2012, 1], deadline: [2020, 12], type: 'connect', reward: 200000, title: '浦东腹地', desc: '不经陆家嘴，连接金桥、张江与世纪公园。', anchors: [anchor('金桥', 31.2620, 121.5850, 3), anchor('张江', 31.2030, 121.5900, 3), anchor('世纪公园', 31.2170, 121.5485, 3)] },
      { id: 'sh10', appear: [2013, 1], deadline: [2016, 12], type: 'connect', reward: 200000, title: '迪士尼接驳', desc: '乐园开园前，连接上海迪士尼乐园、秀沿路与龙阳路，让游客从市区直达度假区。', anchors: [anchorW('上海迪士尼乐园', 31.1434, 121.6637, 3), anchorW('秀沿路', 31.1403, 121.5942, 3), anchor('龙阳路', 31.2030, 121.5570, 3)] },
    ],
    dynTasks: [
      { id: 'shd1', from: [1993, 1], to: [2003, 12], type: 'connect', months: 36, reward: 40000, title: '浦东沿江过江通勤', desc: '浦东沿江的居民每天过江上班。连接塘桥、东昌路与外滩。', anchors: [anchor('塘桥', 31.2190, 121.5190, 3), anchor('东昌路', 31.2330, 121.5100, 3), anchor('外滩', 31.2385, 121.4870, 3)] },
      { id: 'shd2', from: [1998, 1], to: [2010, 12], type: 'connect', months: 36, reward: 35000, title: '古北与虹桥开发区', desc: '连接古北、虹桥路与徐家汇。', anchors: [anchor('古北', 31.2010, 121.3980, 3), anchor('虹桥路', 31.1980, 121.4210, 3), anchor('徐家汇', 31.1940, 121.4370, 3)] },
      { id: 'shd3', from: [2005, 1], to: [2018, 12], type: 'connect', months: 36, reward: 40000, title: '宝山大型居住区', desc: '连接大场、上海大学与上海站。', anchors: [anchor('大场', 31.2950, 121.4100, 3), anchor('上海大学', 31.3160, 121.3920, 3), anchor('上海站', 31.2495, 121.4560, 3)] },
    ],
    taskNote: '历史主题任务参考上海 1990 年起的发展需求（南北与东西主轴、越江、浦东开发、世博会与虹桥枢纽），不要求按真实线路走向建设，只需满足目标描述。',
    // 城市策略难题（v2.3，可选挑战）
    scenarios: [
      { id: 'sh-sc1', theme: '上海：浦东开发与越江', title: '把浦西接进浦东腹地', type: 'budgetConnect', from: [1993, 1], to: [2004, 12], months: 60, rewardMonths: 3, budgetX: 1.2,
        anchors: [['静安寺', 3], ['陆家嘴', 3], ['龙阳路', 3]],
        desc: '黄浦江把上海分成浦西与浦东，越江隧道造价高；浦东腹地还是一片待开发的土地。用有限预算从浦西中心穿江，直达浦东的龙阳路。',
        tips: ['黄浦江只过一次，选江面较窄处', '浦东未开发的路段可以用地面或高架', '陆家嘴设大站，留好以后的换乘'] },
      { id: 'sh-sc2', theme: '上海：超大客流', title: '为「{line}」减压', type: 'lineCrowd', line: 'busiest', from: [2005, 1], to: [2035, 12], months: 24, rewardMonths: 3, minLF: 1.0, target: 1.0,
        desc: '线网越大，换乘越多，客流越往几条骨干线上挤。不靠新线也能做到：把这条线最拥挤区段的早高峰满载率降到 100% 以下并保持 3 个月。',
        tips: ['升级沿线车站，列车加长到 8 节', '在拥挤区段两端设换乘，引导乘客走平行线', '贯通或拆分线路，减少乘客在拥挤站换乘'] },
    ],
    dataNote: [
      ['真实地理', 'hist', '黄浦江、苏州河与长江口、道路与桥隧、铁路、公园、街道边界与地名来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），为现代数据，按 250 m 网格投影。'],
      ['史实参考', 'hist', '浦东开发开放（1990 年）、陆家嘴与各开发区设立年份、越江桥隧与高架道路通车年份、地标落成年份、世博会与虹桥综合交通枢纽。'],
      ['估算', 'est', '1990 年人口与就业分布、人口增长曲线、出行率、时间价值、造价、票价、运营费用与拨款、地图范围 GDP。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。普通铁路、高速铁路与磁浮不参与乘客出行与运营模拟，车站与虹桥机场只模拟市内接驳出行；地面铁路按真实线位阻隔步行与小路；真实的上海地铁不会自动出现。'],
      ['', '', '模拟结果不得作为真实上海交通规划预测。'],
    ],
    // 线路配色参考上海地铁
    lineColorsNice: ['#e3002b', '#8cc220', '#fcd600', '#461d84', '#944d9a', '#d40068', '#ed6f00', '#0094d8', '#87caed', '#c6afd4', '#871c2b', '#007a60', '#e999c0', '#626020', '#bca886', '#98d1c0', '#bc796f', '#c4984f'],
    places: (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; }),
  };
  // 位置校正：与 OSM 地铁站同名的设施与任务锚点，改用车站位置（相距 3 km 以内时；手填坐标的误差可达数百米）
  const ST = {}; for (const p of G.places || []) if (p[3] === 0 && !ST[p[0]]) ST[p[0]] = p;
  const nearSt = function (name, x, y) { const p = ST[name.replace(/（.*?）/g, '')]; return p && Math.hypot(p[1] - x, p[2] - y) < 12 ? p : null; };
  for (const f of data.facilities) if (f.at) { const p = nearSt(f.n, f.at[0], f.at[1]); if (p) f.at = [p[1], p[2]]; }
  for (const t of data.histTasks.concat(data.dynTasks)) for (const a of t.anchors || []) { const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }

  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'sh', name: '上海', title: '上海 · 1990', sub: '真实地理 · 1990 年起 · 人民币',
    desc: '从 1990 年尚无地铁的上海开始：七百多万人挤在浦西，黄浦江上没有一座桥，浦东开发开放即将宣布。陆家嘴、虹桥枢纽与世博会将陆续到来，地铁要追上中国最大城市的扩张。',
    facts: [['范围', '38 km × 38 km'], ['起始', '1990 年'], ['人口', '约 830 万'], ['货币', '人民币（元）'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 2, extent: { from: 1, dx: 0, dy: 0, oldW: 124, oldH: 136, note: '地图向东扩大到川沙、曹路，向南扩大到梅陇、康桥一带', oldRegionIds: ['airport', 'lujiazui', 'hqcbd', 'huangpu', 'jingan', 'xuhui', 'changning', 'putuo', 'hongkou', 'yangpu', 'pdriver', 'jinqiao', 'waigaoqiao', 'beicai', 'pudong', 'wusong', 'dachang', 'xinzhuang', 'minhang', 'jiading', 'outer'], oldLandmarkIds: ['sh_bund', 'sh_park', 'sh_expoctr', 'sh_yuyuan', 'sh_jingan', 'sh_jade', 'sh_longhua', 'sh_xjh', 'sh_station', 'sh_fudan', 'sh_tongji', 'sh_sjtu', 'sh_ecnu', 'sh_pearl', 'sh_museum', 'sh_stadium', 'sh_gt', 'sh_jinmao', 'sh_hongkou', 'sh_sniec', 'sh_south', 'sh_swfc', 'sh_hqstation', 'sh_cnpav', 'sh_tower'] }, scenario: 'sh-1990',
    region: '中国内地', tagline: '浦江两岸，从零开始的超大网络', difficulty: 3, tags: ['无地铁开局', '越江', '超大城市'],
    intro: '1990 年的上海，七百多万人挤在黄浦江西岸，公交车厢里人贴着人；对岸的浦东还是农田与码头，江上一座桥也没有。4 月，浦东开发开放的消息传来。你要从第一条南北线开始，跨过黄浦江，跟上一座超大城市三十年的扩张。',
    features: [['bridge', '黄浦江越江', '越江段可以建设隧道或桥梁，1990 年江上还没有桥'], ['building', '陆家嘴天际线', '东方明珠、金茂、环球金融中心与上海中心按年份出现'], ['map', '浦东开发', '陆家嘴、金桥、外高桥与张江陆续开放'], ['flag', '世博会与虹桥枢纽', '历史任务跟随城市大事']],
    highlights: [[1990, '浦东开发开放'], [1991, '南浦大桥通车'], [1994, '东方明珠落成'], [2010, '虹桥枢纽启用、世博会开幕'], [2015, '上海中心大厦落成']],
    geo: G, data: data,
    econ: { devOffset: 2, money: 1 },   // 出行选择参数：上海 1990 年约对应广州样本 1992 年的发展阶段
    cfg: {
      W: 152, H: 152, START: { y: 1990, m: 1, d: 1, minute: 360 },
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[1990, 8.3e6], [1995, 9.0e6], [2000, 10.6e6], [2005, 12.6e6], [2010, 14.8e6], [2015, 15.7e6], [2020, 16.3e6], [2030, 16.9e6], [2050, 17.2e6], [2300, 17.5e6]], histEnd: 2020, jobsRatio: [[1990, 0.56], [2000, 0.55], [2010, 0.58], [2020, 0.6]] }),
      money: { code: 'CNY', unit: '元', wan: '万元', yi: '亿元', sym: '¥' },
      econBase: 1990,
      // 造价（万元，1990 年价格；估算，参考地铁 1 号线约 16 km、总投资约 54 亿元的量级）：软土地基，越江隧道附加较高
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 25000, surface: 5000, elevated: 11000 },
        riverPerKm: { underground: 30000, surface: 20000, elevated: 20000 },
        station: { underground: { S: 12000, M: 20000, L: 32000 }, elevated: { S: 7000, M: 11000, L: 17000 }, surface: { S: 4000, M: 7000, L: 10000 } },
        demolishPerCell: 40000,
      }),
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 450000, grantBase: [[1990, 22000], [1995, 40000], [2000, 60000], [2005, 120000], [2010, 180000], [2015, 220000], [2020, 250000], [2050, 350000]], debtLimit: -300000, rewardScale: 1.5 }),
      // 城市经济（macro.js）：1990 年地图范围 GDP 约 650 亿元（估算：上海全市约 780 亿元，地图覆盖中心城区与浦东主要开发区）；
      // 1994 年分税制改革前地方财政收入占比很高；浦东开发与金融、贸易中心建设带动 1990 年代起的高速增长
      macro: {
        area: '地图范围（中心城区、浦东主要开发区与近郊）', region: '中国内地',
        gdp0: 7290000, revRatio: [[1990, 0.25], [1994, 0.15], [2003, 0.18], [2010, 0.2], [2020, 0.2], [2040, 0.18]], revElastic: 1.5,
        prod: [[1990, 0.03], [1991, 0.08], [1993, 0.11], [1997, 0.09], [2000, 0.085], [2005, 0.085], [2008, 0.07], [2011, 0.06], [2015, 0.05], [2019, 0.045], [2025, 0.032], [2035, 0.02], [2050, 0.014], [2080, 0.012]],
        infl: 'cn', longRun: { infl: 0.02 }, histEnd: 2020, ref: 'cn',
        struct: { trade: 0.75, fin: 0.65, ind: 0.6, tour: 0.5, prop: 0.65 },
        events: [
          { id: 'pudong1990', y: 1990, m: 4, kind: 'open', scope: '本地', title: '浦东开发开放', desc: '浦东新区设立，外资、金融与贸易机构大量进入，上海重新成为全国的经济中心。', lv: [0.002, 0.006, 0.012, 0.018, 0.022, 0.024], keep: true },
          { id: 'nanxun1992', y: 1992, m: 1 },
          { id: 'tight1993', y: 1993, m: 6 },
          { id: 'asia1997', y: 1997, m: 7, scale: 0.6 },
          { id: 'wto2001', y: 2001, m: 12 },
          { id: 'sars2003', y: 2003, m: 4, scale: 0.4 },
          { id: 'tight2004', y: 2004, m: 4 },
          { id: 'gfc2008', y: 2008, m: 9, desc: '外贸与航运骤降，上海的出口制造业与港口受到明显冲击。' },
          { id: 'stim2008', y: 2008, m: 11 },
          { id: 'expo2010', y: 2010, m: 5, kind: 'boom', scope: '本地', title: '世博会', desc: '世博会带动旅游、会展与城市更新，园区周边加快开发。', lv: [0.004, 0.003, 0] },
          { id: 'cnstock2015', y: 2015, m: 6 },
          { id: 'trade2018', y: 2018, m: 7 },
          { id: 'covid2020', y: 2020, m: 1, scale: 0.8 },
        ],
      },
    },
    cam: { cx: 63, cy: 80, zoom: 16 },
  });
})(window.CM);
