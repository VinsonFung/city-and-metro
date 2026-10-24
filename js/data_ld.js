'use strict';
// 伦敦 · 1990 场景。地理来自 OpenStreetMap（geo_ld.js，现代数据），本文件补充 1990 年起的区域开放、码头区再开发、
// 道路与桥梁年份、人口就业中心、地标、历史事件、本地任务与英镑经营参数。坐标单位为格（250 m），用 ll(纬度, 经度) 换算。
// 开局只有 1990 年仍在运营的东伦敦线（地铁，7 站）交给玩家；其余地铁网作为背景存在，不自动生成后来的线位。
// 真实性：码头区再开发（1981 LDDC）、金丝雀码头、银禧线延伸、拥堵费、奥运与伊丽莎白线的年份为史实参考（范围为近似）；
// 1990 年人口与就业分布、增长曲线、造价与票价为估算。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.ld; if (!G) return;
  const P = G.proj, ll = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const at = function (lat, lon, o) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const poly = function (pts) { return pts.map(function (p) { return ll(p[0], p[1]); }); };
  const anchor = function (name, lat, lon, r) { const p = ll(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };
  const st = function (name, lat, lon, size, year) { const p = ll(lat, lon); return [name, p[0], p[1], size, year]; };

  // 码头区：狗岛与皇家码头（1981 年伦敦码头区开发公司成立后逐步再开发；范围为近似）
  const isleOfDogs = poly([[51.5120, -0.0300], [51.5120, -0.0020], [51.4980, -0.0020], [51.4900, -0.0120], [51.4930, -0.0300]]);
  const canaryWharf = poly([[51.5075, -0.0245], [51.5075, -0.0135], [51.5015, -0.0135], [51.5015, -0.0245]]);
  const royalDocks = poly([[51.5155, 0.0050], [51.5155, 0.0480], [51.4980, 0.0480], [51.4980, 0.0050]]);

  const data = {
    city: '伦敦', riverName: '泰晤士河', seaName: '泰晤士河口', hsrYear: 2003,
    stages: [[1992, '码头区再开发期'], [2003, '拥堵费与奥运前期'], [2012, '后奥运时期']], stageLast: '大伦敦都会期',
    briefing: {
      lead: '1990 年的伦敦：撒切尔时代进入尾声，码头区（Docklands）正在废墟上重建，金丝雀码头的第一座塔楼刚刚封顶。地铁网已经运营了 127 年，但你接手的只有东部那段被忽视的东伦敦线；泰晤士河以南的公共交通仍然单薄。',
      modes: [
        ['metro', '地铁（东伦敦线，由你接管）', '肖迪奇—新十字门 7 站已在运营，票款与运营费照常结算；可以延长、改建或拆除，不收历史建设费。其余地铁线路作为背景存在，不参与模拟。'],
        ['rail', '国铁', '滑铁卢、利物浦街、维多利亚等车站承担大部分通勤。列车本身不参与模拟，但车站会产生市内接驳出行，地面铁路会阻隔步行。'],
        ['bridge', '过河', '泰晤士河上有塔桥、伦敦桥、滑铁卢桥等桥梁，隧道较少；地面过河基本依靠桥梁。'],
        ['road', '道路与拥堵', '1990 年的伦敦还没有拥堵费，内环道路在高峰时段严重拥堵。'],
      ],
    },
    // 没有仍在使用的机场类禁建区：伦敦城市机场在地图东部，范围按普通区域处理
    airport: { name: '伦敦城市机场', closeYear: 9999, buildable: 'underground', runway: [ll(51.5040, 0.0400), ll(51.5055, 0.0600)] },
    regions: [
      // 保护林地与大型公园（按 OSM 名称匹配）；open:null 表示永久不开放建设
      { id: 'heath', name: '汉普斯特德荒野', scenic: true, open: null, geo: { park: 'Hampstead Heath' } },
      { id: 'richmondpk', name: '里士满公园', scenic: true, open: null, geo: { park: 'Richmond Park' } },
      { id: 'wimbledon', name: '温布尔登公地', scenic: true, open: null, woodMin: 0.55 },
      // 码头区（1981 年起再开发）：金丝雀码头在上层（先匹配），狗岛其余部分与皇家码头随后
      { id: 'canarywharf', name: '金丝雀码头', poly: canaryWharf, open: 1991, plan: 'cbd', note: '1988 年动工，1991 年第一座塔楼封顶，1992 年公司破产后由财团接管（史实）' },
      { id: 'docklands', name: '狗岛·码头区', poly: isleOfDogs, open: 1981, plan: 'resind', note: '1981 年伦敦码头区开发公司（LDDC）成立，仓库与船坞逐步转为住宅、办公与轻轨（史实）' },
      { id: 'royaldocks', name: '皇家码头（贝克顿·银城）', poly: royalDocks, open: 1995, plan: 'resind', note: '皇家船坞 1981 年起关闭，1990 年代开发为办公、会展与住宅（史实）' },
      { id: 'greenwichpen', name: '格林尼治半岛', poly: poly([[51.4930, -0.0100], [51.4930, 0.0080], [51.4820, 0.0080], [51.4820, -0.0100]]), open: 1997, plan: 'newtown', note: '1997 年起半岛与千禧穹顶（后为 O2）开发（史实）' },
      // 伦敦城市机场（1987 年启用）：继续运营、用地不开发，范围内只允许地下设站与地下穿越
      { id: 'airport', name: '伦敦城市机场', poly: poly([[51.5090, 0.0380], [51.5090, 0.0640], [51.4990, 0.0640], [51.4990, 0.0380]]), open: 1990, plan: 'res', note: '1987 年启用的城市机场，主要服务码头区与金融城的商务旅客；跑道与航站区不开发' },
      // 内伦敦各区（按 OSM 行政区名匹配）：1990 年已建成
      { id: 'city', name: '伦敦城（金融城）', district: ['City of London'], open: 1990, plan: 'cbd' },
      { id: 'westminster', name: '西敏', district: ['City of Westminster'], open: 1990, plan: 'cbd' },
      { id: 'camden', name: '卡姆登', district: ['London Borough of Camden'], open: 1990, plan: 'mix' },
      { id: 'islington', name: '伊斯灵顿', district: ['London Borough of Islington'], open: 1990, plan: 'mix' },
      { id: 'hackney', name: '哈克尼', district: ['London Borough of Hackney'], open: 1990, plan: 'resind' },
      { id: 'towerhamlets', name: '塔村（白教堂·波普拉）', district: ['London Borough of Tower Hamlets'], open: 1990, plan: 'resind' },
      { id: 'southwark', name: '萨瑟克', district: ['London Borough of Southwark'], open: 1990, plan: 'mix' },
      { id: 'lambeth', name: '兰贝斯', district: ['London Borough of Lambeth'], open: 1990, plan: 'mix' },
      { id: 'kensington', name: '肯辛顿与切尔西', district: ['Royal Borough of Kensington and Chelsea'], open: 1990, plan: 'cbd' },
      { id: 'hammersmith', name: '哈默史密斯与富勒姆', district: ['London Borough of Hammersmith and Fulham'], open: 1990, plan: 'mix' },
      { id: 'wandsworth', name: '旺兹沃思', district: ['London Borough of Wandsworth'], open: 1990, plan: 'res' },
      { id: 'lewisham', name: '刘易舍姆', district: ['London Borough of Lewisham'], open: 1990, plan: 'res' },
      { id: 'greenwich', name: '格林尼治', district: ['Royal Borough of Greenwich'], open: 1990, plan: 'resind' },
      { id: 'newham', name: '纽汉（斯特拉特福·东汉姆）', district: ['London Borough of Newham'], open: 1990, plan: 'resind' },
      { id: 'brent', name: '布伦特（温布利·哈勒斯登）', district: ['London Borough of Brent'], open: 1990, plan: 'res' },
      // 外伦敦：1990 年以后逐步开放
      { id: 'ealing', name: '伊灵', district: ['London Borough of Ealing'], open: 1995, plan: 'res' },
      { id: 'hounslow', name: '豪恩斯洛', district: ['London Borough of Hounslow'], open: 1995, plan: 'resind' },
      { id: 'richmond', name: '里士满', district: ['London Borough of Richmond upon Thames'], open: 1995, plan: 'res' },
      { id: 'merton', name: '默顿（温布尔登·图廷）', district: ['London Borough of Merton'], open: 1995, plan: 'res' },
      { id: 'walthamforest', name: '沃尔瑟姆福雷斯特', district: ['London Borough of Waltham Forest'], open: 1995, plan: 'res' },
      { id: 'haringey', name: '哈林盖（托特纳姆）', district: ['London Borough of Haringey'], open: 1995, plan: 'res' },
      { id: 'croydon', name: '克罗伊登', district: ['London Borough of Croydon'], open: 2000, plan: 'res' },
      { id: 'redbridge', name: '雷德布里奇（伊尔福德）', district: ['London Borough of Redbridge'], open: 2000, plan: 'res' },
      { id: 'barking', name: '巴金与达格纳姆', district: ['London Borough of Barking and Dagenham'], open: 2000, plan: 'resind' },
      { id: 'bexley', name: '贝克斯利', district: ['London Borough of Bexley'], open: 2000, plan: 'res' },
    ],
    defaultRegion: { id: 'outer', name: '外围（布罗姆利·哈弗林等）', open: 2005, plan: 'res' },
    plans: CM.DATA.plans,

    // 1990 年人口与就业中心（估算，人/km²；r 约为影响半径 km）
    centers: [
      at(51.5155, -0.0922, { pop: 6000, jobs: 120000, r: 0.9 }),   // 伦敦城
      at(51.5100, -0.1250, { pop: 14000, jobs: 60000, r: 0.9 }),   // 西敏、白厅
      at(51.5152, -0.1419, { pop: 12000, jobs: 30000, r: 0.8 }),   // 牛津街
      at(51.5178, -0.0823, { pop: 9000, jobs: 45000, r: 0.8 }),    // 利物浦街
      at(51.5194, -0.1270, { pop: 12000, jobs: 18000, r: 0.8 }),   // 布卢姆斯伯里
      at(51.5308, -0.1240, { pop: 10000, jobs: 20000, r: 0.8 }),   // 国王十字、圣潘克拉斯
      at(51.5033, -0.1132, { pop: 12000, jobs: 25000, r: 0.9 }),   // 滑铁卢
      at(51.5049, -0.0863, { pop: 11000, jobs: 30000, r: 0.8 }),   // 伦敦桥、萨瑟克
      at(51.5154, -0.1755, { pop: 12000, jobs: 22000, r: 0.9 }),   // 帕丁顿
      at(51.4995, -0.1630, { pop: 18000, jobs: 12000, r: 1.0 }),   // 肯辛顿
      at(51.4870, -0.1700, { pop: 22000, jobs: 8000, r: 1.1 }),    // 切尔西、巴特西
      at(51.5050, -0.0190, { pop: 4000, jobs: 15000, r: 0.8 }),    // 金丝雀码头（1991 年起）
      at(51.5077, -0.0173, { pop: 14000, jobs: 6000, r: 1.0 }),    // 波普拉
      at(51.5194, -0.0597, { pop: 18000, jobs: 12000, r: 1.0 }),   // 白教堂
      at(51.5416, -0.0033, { pop: 16000, jobs: 10000, r: 1.1 }),   // 斯特拉特福
      at(51.5260, -0.0780, { pop: 20000, jobs: 8000, r: 1.0 }),    // 贝思纳尔绿地、肖迪奇
      at(51.5362, -0.0390, { pop: 16000, jobs: 5000, r: 1.0 }),    // 弓、维多利亚公园
      at(51.4826, -0.0074, { pop: 12000, jobs: 6000, r: 1.0 }),    // 格林尼治
      at(51.4760, -0.0200, { pop: 10000, jobs: 5000, r: 1.1 }),    // 德特福德
      at(51.4880, 0.0700, { pop: 14000, jobs: 5000, r: 1.2 }),     // 伍利奇、泰晤士米德
      at(51.4760, -0.0325, { pop: 16000, jobs: 6000, r: 1.0 }),    // 新十字
      at(51.4610, -0.1150, { pop: 26000, jobs: 6000, r: 1.2 }),    // 布里克斯顿
      at(51.4640, -0.1380, { pop: 24000, jobs: 5000, r: 1.2 }),    // 克拉珀姆
      at(51.4300, -0.1300, { pop: 24000, jobs: 5000, r: 1.3 }),    // 斯特里特姆
      at(51.4700, -0.0700, { pop: 22000, jobs: 4000, r: 1.2 }),    // 佩克姆
      at(51.4450, -0.0200, { pop: 22000, jobs: 5000, r: 1.3 }),    // 刘易舍姆、卡特福德
      at(51.5150, -0.1000, { pop: 16000, jobs: 16000, r: 1.0 }),   // 克莱肯韦尔、法灵顿
      at(51.5330, -0.1050, { pop: 22000, jobs: 8000, r: 1.1 }),    // 伊斯灵顿、天使
      at(51.5390, -0.1430, { pop: 24000, jobs: 7000, r: 1.2 }),    // 卡姆登镇
      at(51.5460, -0.1900, { pop: 24000, jobs: 6000, r: 1.2 }),    // 基尔伯恩
      at(51.5520, -0.1600, { pop: 20000, jobs: 4000, r: 1.2 }),    // 汉普斯特德
      at(51.5520, -0.2980, { pop: 24000, jobs: 8000, r: 1.3 }),    // 温布利
      at(51.5360, -0.2450, { pop: 26000, jobs: 6000, r: 1.3 }),    // 哈勒斯登
      at(51.5130, -0.2100, { pop: 24000, jobs: 7000, r: 1.2 }),    // 牧者丛、阿克顿
      at(51.5280, -0.2600, { pop: 22000, jobs: 5000, r: 1.2 }),    // 伊灵
      at(51.4950, -0.2450, { pop: 20000, jobs: 4000, r: 1.2 }),    // 豪恩斯洛、布伦特福德
      at(51.4560, -0.2000, { pop: 20000, jobs: 5000, r: 1.2 }),    // 旺兹沃思、图廷
      at(51.4210, -0.2060, { pop: 20000, jobs: 5000, r: 1.2 }),    // 温布尔登、默顿
      at(51.4450, -0.0200, { pop: 24000, jobs: 6000, r: 1.3 }),    // 刘易舍姆、卡特福德
      at(51.5600, -0.0700, { pop: 24000, jobs: 5000, r: 1.3 }),    // 托特纳姆、沃尔瑟姆斯托
      at(51.5590, 0.0130, { pop: 24000, jobs: 6000, r: 1.3 }),     // 伊尔福德、莱顿
      at(51.5400, 0.0800, { pop: 20000, jobs: 4000, r: 1.3 }),     // 巴金、达格纳姆
    ],
    rural: { pop: 500, jobs: 120 },
    // 1990 年后通车的快速道路与主要桥梁（参考）；未列出的道路与桥梁视为 1990 年已有
    roadYears: {
      'M11': 1979, 'M25': 1986, 'A13': 1999, 'A12': 1999, 'A406': 1993, 'A102': 1991, 'A1(M)': 1984,
      'Docklands Highway': 1993, 'Aspen Way': 1993, 'Limehouse Link': 1993, 'Blackwall Tunnel Approach': 1993,
      'A1306': 1995, 'A112': 1997, 'Wennington Interchange': 1999, 'A1020': 1993,
    },
    bridgeYears: {
      '塔桥': 1894, '伦敦桥': 1973, '滑铁卢桥': 1945, '西敏桥': 1862, '兰贝斯桥': 1932, '沃克斯霍尔桥': 1906,
      '切尔西桥': 1937, '阿尔伯特桥': 1873, '巴特西桥': 1890, '旺兹沃思桥': 1940, '普特尼桥': 1729,
      '哈默史密斯桥': 1827, '邱桥': 1903, '里士满桥': 1777, '特威克纳姆桥': 1933, '金士顿桥': 1828,
      '黑衣修士桥': 1869, '千禧桥': 2000, '银禧桥': 2000, '格林尼治隧道': 1902, '伍利奇隧道': 1966,
      '达特福德跨河大桥': 1991, '伊丽莎白二世大桥': 1991, '银城隧道': 1993, '狗岛隧道': 1993,
    },
    bridgeDefaultYear: 1990,
    simRoads: [
      { n: '银城隧道复线（模拟规划）', c: 4, y: 2028, p: [[96, 46], [96, 49]] },
      { n: '泰晤士河口过河通道（模拟规划）', c: 4, y: 2035, p: [[118, 12], [118, 34]] },
    ],

    // 历史建筑与重要地标（受保护，不得拆除）。x,y 为场地中心（格），w/d 为场地宽与深（米），rot 为朝向（度），h 为高度（米）
    landmarks: [
      Object.assign(at(51.5081, -0.0759), { id: 'ld_tower', name: '伦敦塔', w: 280, d: 240, year: 1078, kind: 'tower', h: 27 }),
      Object.assign(at(51.5138, -0.0984), { id: 'ld_stpauls', name: '圣保罗大教堂', w: 160, d: 120, year: 1710, kind: 'church', h: 111 }),
      Object.assign(at(51.4993, -0.1273), { id: 'ld_abbey', name: '西敏寺', w: 130, d: 90, year: 1745, kind: 'church', h: 69 }),
      Object.assign(at(51.4990, -0.1262), { id: 'ld_palace', name: '国会大厦', w: 130, d: 260, year: 1870, kind: 'colonial', h: 45 }),
      Object.assign(at(51.5002, -0.1258), { id: 'ld_bigben', name: '大本钟（伊丽莎白塔）', w: 22, d: 22, year: 1859, kind: 'tower', h: 96 }),
      Object.assign(at(51.5014, -0.1419), { id: 'ld_buckingham', name: '白金汉宫', w: 200, d: 160, year: 1837, kind: 'colonial', h: 24 }),
      Object.assign(at(51.5194, -0.1270), { id: 'ld_british', name: '大英博物馆', w: 300, d: 250, year: 1759, kind: 'museum', h: 25 }),
      Object.assign(at(51.5089, -0.1283), { id: 'ld_ngallery', name: '国家美术馆', w: 180, d: 120, year: 1838, kind: 'gallery', h: 22 }),
      Object.assign(at(51.5117, -0.1240), { id: 'ld_covent', name: '考文特花园', w: 160, d: 130, year: 1830, kind: 'hall', h: 20 }),
      Object.assign(at(51.4967, -0.1764), { id: 'ld_nhm', name: '自然历史博物馆', w: 200, d: 160, year: 1881, kind: 'museum', h: 30 }),
      Object.assign(at(51.4966, -0.1722), { id: 'ld_vam', name: '维多利亚与艾伯特博物馆', w: 220, d: 180, year: 1857, kind: 'museum', h: 28 }),
      Object.assign(at(51.5009, -0.1774), { id: 'ld_albert', name: '皇家阿尔伯特音乐厅', w: 100, d: 100, year: 1871, kind: 'hall', h: 41 }),
      Object.assign(at(51.5308, -0.1260), { id: 'ld_stpancras', name: '圣潘克拉斯车站', w: 220, d: 120, year: 1868, kind: 'rail', h: 30 }),
      Object.assign(at(51.5308, -0.1233), { id: 'ld_kingscross', name: '国王十字车站', w: 200, d: 120, year: 1852, kind: 'rail', h: 25 }),
      Object.assign(at(51.5031, -0.1132), { id: 'ld_waterloo', name: '滑铁卢车站', w: 300, d: 160, year: 1848, kind: 'rail', h: 25 }),
      Object.assign(at(51.5178, -0.0823), { id: 'ld_liverpool', name: '利物浦街车站', w: 250, d: 130, year: 1874, kind: 'rail', h: 25 }),
      Object.assign(at(51.5154, -0.1755), { id: 'ld_paddington', name: '帕丁顿车站', w: 260, d: 120, year: 1854, kind: 'rail', h: 24 }),
      Object.assign(at(51.4952, -0.1441), { id: 'ld_victoria', name: '维多利亚车站', w: 280, d: 140, year: 1860, kind: 'rail', h: 24 }),
      Object.assign(at(51.5049, -0.0863), { id: 'ld_londonbridge', name: '伦敦桥车站', w: 250, d: 130, year: 1836, kind: 'rail', h: 24 }),
      Object.assign(at(51.5129, -0.0825), { id: 'ld_lloyds', name: '劳埃德大厦', w: 100, d: 90, year: 1986, kind: 'box', h: 95 }),
      Object.assign(at(51.5200, -0.0937), { id: 'ld_barbican', name: '巴比肯中心', w: 220, d: 180, year: 1982, kind: 'box', h: 40 }),
      Object.assign(at(51.5058, -0.1168), { id: 'ld_festival', name: '皇家节日大厅', w: 140, d: 110, year: 1951, kind: 'concert', h: 30 }),
      Object.assign(at(51.5070, -0.1140), { id: 'ld_national', name: '国家剧院', w: 130, d: 110, year: 1976, kind: 'box', h: 35 }),
      Object.assign(at(51.5049, -0.0196), { id: 'ld_onecanada', name: '加拿大广场一号', w: 90, d: 90, year: 1991, kind: 'skyscraper', h: 235 }),
      Object.assign(at(51.5036, -0.0176), { id: 'ld_hsbc', name: '汇丰大厦', w: 90, d: 90, year: 2002, kind: 'skyscraper', h: 200 }),
      Object.assign(at(51.5145, -0.0803), { id: 'ld_gherkin', name: '圣玛丽斧街 30 号（小黄瓜）', w: 70, d: 70, year: 2004, kind: 'skyscraper', h: 180 }),
      Object.assign(at(51.5045, -0.0865), { id: 'ld_shard', name: '碎片大厦', w: 80, d: 80, year: 2012, kind: 'skyscraper', h: 310 }),
      Object.assign(at(51.5033, -0.1196), { id: 'ld_eye', name: '伦敦眼', w: 130, d: 130, year: 2000, kind: 'tvtower', h: 135 }),
      Object.assign(at(51.5076, -0.0994), { id: 'ld_tate', name: '泰特现代美术馆', w: 200, d: 150, year: 2000, kind: 'gallery', h: 30 }),
      Object.assign(at(51.4911, -0.1279), { id: 'ld_tatebritain', name: '泰特英国美术馆', w: 160, d: 120, year: 1897, kind: 'gallery', h: 25 }),
      Object.assign(at(51.4957, -0.1087), { id: 'ld_iwm', name: '帝国战争博物馆', w: 160, d: 120, year: 1936, kind: 'museum', h: 25 }),
      Object.assign(at(51.4817, -0.1448), { id: 'ld_battersea', name: '巴特西发电站', w: 160, d: 130, year: 1933, kind: 'box', h: 100 }),
      Object.assign(at(51.5030, 0.0032), { id: 'ld_o2', name: 'O2 体育馆（千禧穹顶）', w: 250, d: 250, year: 1999, kind: 'stadium', h: 50 }),
      Object.assign(at(51.5387, -0.0166), { id: 'ld_olympic', name: '伦敦体育场', w: 300, d: 260, year: 2012, kind: 'stadium', h: 60 }),
      Object.assign(at(51.5560, -0.2795), { id: 'ld_wembley', name: '温布利球场', w: 280, d: 240, year: 1923, kind: 'stadium', h: 40 }),
      Object.assign(at(51.4769, -0.0005), { id: 'ld_observatory', name: '格林尼治天文台', w: 90, d: 70, year: 1675, kind: 'tower', h: 20 }),
      Object.assign(at(51.4827, -0.0053), { id: 'ld_naval', name: '皇家海军学院', w: 240, d: 180, year: 1873, kind: 'colonial', h: 30 }),
      Object.assign(at(51.5940, -0.1300), { id: 'ld_alexandra', name: '亚历山大宫', w: 180, d: 160, year: 1873, kind: 'box', h: 30 }),
      Object.assign(at(51.5077, -0.0237), { id: 'ld_museumdock', name: '伦敦码头区博物馆', w: 100, d: 80, year: 1982, kind: 'museum', h: 20 }),
      Object.assign(at(51.4826, -0.0074), { id: 'ld_greenwichuni', name: '格林尼治大学（旧皇家海军学院）', w: 300, d: 240, year: 1890, kind: 'campus', h: 25 }),
    ],

    // 重要设施（v1.9，见 facility.js）：位置按真实地理（近似）、启用/停用年份为史实参考；规模均为估算——
    // 枢纽 pax 为市内接驳出行（汽车 + 地铁，到达与离开合计，万人次/日）；其他 w 为占全市同类出行吸引的比例。
    // 地图范围外的希思罗、盖特威克、斯坦斯特德机场不模拟。
    facilities: [
      { id: 'ld_waterloo', n: '滑铁卢车站', t: 'rail', lm: 'ld_waterloo', pax: [[1990, 9], [1994, 10], [2007, 11], [2015, 12], [2030, 12]] },
      { id: 'ld_liverpool', n: '利物浦街车站', t: 'rail', lm: 'ld_liverpool', pax: [[1990, 6.5], [2000, 7], [2015, 8], [2030, 8]] },
      { id: 'ld_victoria', n: '维多利亚车站', t: 'rail', lm: 'ld_victoria', pax: [[1990, 7], [2000, 7.5], [2015, 8], [2030, 8]] },
      { id: 'ld_paddington', n: '帕丁顿车站', t: 'rail', lm: 'ld_paddington', pax: [[1990, 4], [1998, 5], [2008, 6], [2030, 6]] },
      { id: 'ld_kingscross', n: '国王十字车站', t: 'rail', lm: 'ld_kingscross', pax: [[1990, 4], [2007, 5], [2015, 6], [2030, 6]] },
      { id: 'ld_stpancras', n: '圣潘克拉斯车站', t: 'rail', lm: 'ld_stpancras', pax: [[1990, 2], [2007, 3.5], [2015, 4], [2030, 4]], note: '2007 年成为高速铁路（HS1）终点。' },
      { id: 'ld_londonbridge', n: '伦敦桥车站', t: 'rail', lm: 'ld_londonbridge', pax: [[1990, 5], [2010, 6], [2030, 6]] },
      { id: 'ld_charingcross', n: '查令十字车站', t: 'rail', at: ll(51.5080, -0.1247), pax: [[1990, 3.5], [2000, 3.5], [2030, 3]] },
      { id: 'ld_cannon', n: '坎农街车站', t: 'rail', at: ll(51.5113, -0.0902), pax: [[1990, 2.5], [2000, 2.5], [2030, 2]] },
      { id: 'ld_euston', n: '尤斯顿车站', t: 'rail', at: ll(51.5286, -0.1336), pax: [[1990, 3], [2000, 3], [2030, 3.5]] },
      { id: 'ld_fenchurch', n: '芬乔奇街车站', t: 'rail', at: ll(51.5117, -0.0785), pax: [[1990, 1.5], [2000, 1.5], [2030, 1.5]] },
      { id: 'ld_marylebone', n: '马里波恩车站', t: 'rail', at: ll(51.5225, -0.1631), pax: [[1990, 1], [2000, 1.2], [2030, 1.2]] },
      { id: 'ld_lcy', n: '伦敦城市机场', t: 'air', at: ll(51.5048, 0.0495), pax: [[1990, 0.05], [1995, 0.1], [2005, 0.2], [2015, 0.45], [2030, 0.5]], note: '1987 年启用，主要服务码头区与金融城的商务旅客；希思罗、盖特威克在地图范围外。' },
      { id: 'ld_ucl', n: '伦敦大学学院', t: 'uni', at: ll(51.5246, -0.1340), w: 0.025 },
      { id: 'ld_imperial', n: '帝国理工学院', t: 'uni', at: ll(51.4988, -0.1749), w: 0.022 },
      { id: 'ld_lse', n: '伦敦政治经济学院', t: 'uni', at: ll(51.5144, -0.1165), w: 0.018 },
      { id: 'ld_kcl', n: '伦敦国王学院', t: 'uni', at: ll(51.5115, -0.1160), w: 0.018 },
      { id: 'ld_qmul', n: '玛丽女王大学', t: 'uni', at: ll(51.5245, -0.0400), w: 0.012 },
      { id: 'ld_cityuni', n: '伦敦城市大学', t: 'uni', at: ll(51.5270, -0.1024), w: 0.01 },
      { id: 'ld_greenwichuni', n: '格林尼治大学', t: 'uni', lm: 'ld_greenwichuni', w: 0.012 },
      { id: 'ld_uel', n: '东伦敦大学', t: 'uni', at: ll(51.5075, 0.0665), w: 0.008 },
      { id: 'ld_stthomas', n: '圣托马斯医院', t: 'hosp', at: ll(51.4989, -0.1187), w: 0.05 },
      { id: 'ld_uclh', n: '伦敦大学学院医院', t: 'hosp', at: ll(51.5245, -0.1350), w: 0.045 },
      { id: 'ld_guys', n: '盖伊医院', t: 'hosp', at: ll(51.5033, -0.0876), w: 0.045 },
      { id: 'ld_barts', n: '圣巴塞洛缪医院', t: 'hosp', at: ll(51.5175, -0.1000), w: 0.03 },
      { id: 'ld_royallondon', n: '皇家伦敦医院', t: 'hosp', at: ll(51.5180, -0.0590), w: 0.03 },
      { id: 'ld_kingshosp', n: '国王学院医院', t: 'hosp', at: ll(51.4680, -0.0930), w: 0.03 },
      { id: 'ld_gosh', n: '大奥蒙德街儿童医院', t: 'hosp', at: ll(51.5221, -0.1200), w: 0.02 },
      { id: 'ld_royalfree', n: '皇家自由医院', t: 'hosp', at: ll(51.5536, -0.1650), w: 0.025 },
      { id: 'ld_oxford', n: '牛津街商圈', t: 'shop', at: ll(51.5152, -0.1419), r: 1.0, w: [[1990, 0.06], [2000, 0.055], [2015, 0.05]] },
      { id: 'ld_covent', n: '考文特花园商圈', t: 'shop', lm: 'ld_covent', w: 0.02 },
      { id: 'ld_harrods', n: '骑士桥·哈罗德百货', t: 'shop', at: ll(51.4994, -0.1632), w: 0.02 },
      { id: 'ld_canaryshop', n: '金丝雀码头商业区', t: 'shop', at: ll(51.5049, -0.0190), y0: 1991, w: [[1991, 0.005], [2002, 0.02], [2015, 0.03]] },
      { id: 'ld_westfield', n: '韦斯特菲尔德（白城）', t: 'shop', at: ll(51.5075, -0.2210), y0: 2008, w: [[2008, 0.02], [2015, 0.03]] },
      { id: 'ld_city', n: '伦敦城（金融城）', t: 'cbd', at: ll(51.5155, -0.0922), r: 1.2, w: [[1990, 0.05], [2000, 0.055]] },
      { id: 'ld_canary', n: '金丝雀码头商务区', t: 'cbd', at: ll(51.5050, -0.0190), y0: [1991, 5], w: [[1991, 0.004], [2000, 0.02], [2010, 0.03]] },
      { id: 'ld_westminster', n: '西敏·白厅', t: 'cbd', at: ll(51.4995, -0.1270), w: 0.02 },
      { id: 'ld_tower', n: '伦敦塔', t: 'scenic', lm: 'ld_tower', w: 0.02 },
      { id: 'ld_stpauls', n: '圣保罗大教堂', t: 'scenic', lm: 'ld_stpauls', w: 0.012 },
      { id: 'ld_abbey', n: '西敏寺', t: 'scenic', lm: 'ld_abbey', w: 0.012 },
      { id: 'ld_palace', n: '国会大厦与大本钟', t: 'scenic', lm: 'ld_palace', w: 0.015 },
      { id: 'ld_buckingham', n: '白金汉宫', t: 'scenic', lm: 'ld_buckingham', w: 0.015 },
      { id: 'ld_british', n: '大英博物馆', t: 'scenic', lm: 'ld_british', w: 0.018 },
      { id: 'ld_ngallery', n: '国家美术馆', t: 'scenic', lm: 'ld_ngallery', w: 0.01 },
      { id: 'ld_nhm', n: '自然历史博物馆', t: 'scenic', lm: 'ld_nhm', w: 0.012 },
      { id: 'ld_tate', n: '泰特现代美术馆', t: 'scenic', lm: 'ld_tate', w: [[1990, 0], [2000, 0.015]] },
      { id: 'ld_eye', n: '伦敦眼', t: 'scenic', lm: 'ld_eye', w: [[1990, 0], [2000, 0.02]] },
      { id: 'ld_observatory', n: '格林尼治天文台', t: 'scenic', lm: 'ld_observatory', w: 0.01 },
      { id: 'ld_hyde', n: '海德公园', t: 'park', at: ll(51.5073, -0.1657), r: 1.4, w: 0.03 },
      { id: 'ld_regents', n: '摄政公园', t: 'park', at: ll(51.5313, -0.1569), r: 1.0, w: 0.018 },
      { id: 'ld_heath', n: '汉普斯特德荒野', t: 'park', at: ll(51.5608, -0.1630), r: 1.2, w: 0.012 },
      { id: 'ld_greenwichpark', n: '格林尼治公园', t: 'park', at: ll(51.4769, -0.0010), r: 1.0, w: 0.01 },
      { id: 'ld_victoriapark', n: '维多利亚公园', t: 'park', at: ll(51.5362, -0.0390), r: 0.9, w: 0.008 },
      { id: 'ld_batterseapark', n: '巴特西公园', t: 'park', at: ll(51.4795, -0.1570), r: 0.8, w: 0.008 },
      { id: 'ld_wembley', n: '温布利球场', t: 'stadium', lm: 'ld_wembley', w: 0.015 },
      { id: 'ld_emirates', n: '阿联酋航空球场（阿森纳）', t: 'stadium', at: ll(51.5549, -0.1084), y0: 2006, w: 0.008 },
      { id: 'ld_stamford', n: '斯坦福桥球场（切尔西）', t: 'stadium', at: ll(51.4817, -0.1909), w: 0.008 },
      { id: 'ld_olympic', n: '伦敦体育场', t: 'stadium', lm: 'ld_olympic', w: 0.01 },
      { id: 'ld_o2', n: 'O2 体育馆', t: 'venue', lm: 'ld_o2', w: [[1990, 0], [2000, 0.012], [2007, 0.015]] },
      { id: 'ld_excel', n: 'ExCeL 会展中心', t: 'venue', at: ll(51.5079, 0.0290), y0: 2000, w: [[2000, 0.008], [2012, 0.012]] },
      { id: 'ld_earlscourt', n: '伯爵宫会展中心', t: 'venue', at: ll(51.4887, -0.1980), y1: [2015, 1], w: 0.008, note: '2015 年起停用并改建。' },
      { id: 'ld_barbican', n: '巴比肯中心', t: 'venue', lm: 'ld_barbican', w: 0.006 },
    ],

    districtLabels: [
      ['伦敦城', ['City of London']], ['西敏', ['City of Westminster']], ['卡姆登', ['London Borough of Camden']],
      ['伊斯灵顿', ['London Borough of Islington']], ['哈克尼', ['London Borough of Hackney']],
      ['塔村', ['London Borough of Tower Hamlets']], ['萨瑟克', ['London Borough of Southwark']],
      ['兰贝斯', ['London Borough of Lambeth']], ['纽汉', ['London Borough of Newham']],
      ['格林尼治', ['Royal Borough of Greenwich']], ['刘易舍姆', ['London Borough of Lewisham']],
      ['旺兹沃思', ['London Borough of Wandsworth']], ['布伦特', ['London Borough of Brent']],
    ],

    // 城市发展事件（tag：史实 / 估算 / 模拟）
    events: [
      { y: 1990, m: 1, tag: '史实', title: '1990 年的伦敦', desc: '大伦敦约 640 万人。地铁网已运营 127 年，但东部码头区在 1980 年代仍大片荒废；1981 年成立的伦敦码头区开发公司正在推进重建，金丝雀码头第一座塔楼即将封顶。' },
      { y: 1990, m: 3, tag: '史实', title: '人头税抗议', desc: '社区收费（人头税）在英格兰与威尔士实施，3 月 31 日特拉法加广场发生大规模抗议。' },
      { y: 1991, m: 5, tag: '史实', title: '金丝雀码头第一座塔楼封顶', desc: '加拿大广场一号高 235 米，是当时英国最高的建筑。' },
      { y: 1992, m: 9, tag: '史实', title: '黑色星期三', desc: '英国退出欧洲汇率机制，英镑大幅贬值；随后金丝雀码头公司进入破产管理，由财团接管。' },
      { y: 1993, m: 3, tag: '史实', title: '银禧线延伸开工', desc: '从绿园经西敏、滑铁卢、伦敦桥到金丝雀码头与斯特拉特福的延伸线开工（1999 年通车）。' },
      { y: 1994, m: 5, tag: '史实', title: '英法海底隧道通车', desc: '滑铁卢国际车站启用，伦敦与巴黎、布鲁塞尔之间的列车开始运行。' },
      { y: 1997, m: 5, tag: '史实', title: '工党政府与伦敦市长公投', desc: '新政府承诺设立大伦敦政府，7 月举行全民公投并通过。' },
      { y: 1999, m: 5, tag: '史实', title: '银禧线延伸分段通车', desc: '绿园—北格林尼治段率先通车，2000 年 1 月全线开通至斯特拉特福。' },
      { y: 2000, m: 7, tag: '史实', title: '大伦敦政府成立', desc: '伦敦市长与伦敦议会开始运作，交通、规划与经济发展由市级统筹。' },
      { y: 2003, m: 2, tag: '史实', title: '伦敦拥堵费', desc: '市中心对工作日白天行驶的车辆收费，是伦敦交通政策的重要转折。' },
      { y: 2007, m: 11, tag: '史实', title: '高速铁路 HS1 全线通车', desc: '圣潘克拉斯国际车站启用，欧洲之星由滑铁卢迁入。' },
      { y: 2008, m: 9, tag: '史实', title: '全球金融危机', desc: '金融业集中的伦敦城与金丝雀码头受到严重冲击。' },
      { y: 2012, m: 7, tag: '史实', title: '伦敦奥运会', desc: '主会场设在斯特拉特福，东伦敦迎来大规模交通与城市更新。' },
      { y: 2016, m: 6, tag: '史实', title: '脱欧公投', desc: '英国公投决定退出欧盟，金融与服务业的前景出现长期不确定性。' },
      { y: 2020, m: 3, tag: '史实', title: '新冠肺炎疫情', desc: '通勤客流骤降，地铁与公交一度大幅削减班次。' },
      { y: 2022, m: 5, tag: '史实', title: '伊丽莎白线全线通车', desc: '横贯铁路连接雷丁、希思罗与申菲尔德，穿过市中心新增的隧道段。' },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后人口、道路和区域变化按模拟规则推演，不代表真实历史。' },
    ],
    // 本地历史主题任务：参考伦敦 1990 年起的实际发展需求，不要求复刻真实线路（奖励单位：万英镑）
    histTasks: [
      { id: 'ld1', appear: [1990, 3], deadline: [1999, 12], type: 'connect', reward: 420000, title: '码头区进城', desc: '把狗岛与金丝雀码头接进地铁网：在伦敦桥与坎宁镇之间建立一条跨河走廊。', anchors: [anchor('伦敦桥', 51.5049, -0.0863, 3), anchor('金丝雀码头', 51.5049, -0.0196, 3), anchor('坎宁镇', 51.5146, 0.0080, 4)] },
      { id: 'ld2', appear: [1993, 1], deadline: [1999, 12], type: 'connect', reward: 520000, title: '银禧线延伸', desc: '1999 年银禧线延伸通车前，连接绿园、西敏、滑铁卢与斯特拉特福。', anchors: [anchor('绿园', 51.5068, -0.1426, 3), anchor('西敏', 51.5010, -0.1250, 3), anchor('滑铁卢', 51.5031, -0.1132, 3), anchor('斯特拉特福', 51.5416, -0.0033, 3)] },
      { id: 'ld3', appear: [1995, 1], deadline: [2005, 12], type: 'connect', reward: 380000, title: '皇家码头与贝克顿', desc: '皇家船坞关闭后开发为办公与住宅，需要轨道交通连接银城与贝克顿。', anchors: [anchor('银城', 51.5030, 0.0620, 4), anchor('贝克顿', 51.5140, 0.0740, 4), anchor('坎宁镇', 51.5146, 0.0080, 4)] },
      { id: 'ld4', appear: [1997, 1], deadline: [2007, 12], type: 'connect', reward: 320000, title: '格林尼治半岛', desc: '千禧穹顶与半岛开发需要接驳：连接北格林尼治、格林尼治与加拿大水。', anchors: [anchor('北格林尼治', 51.5005, 0.0030, 3), anchor('格林尼治', 51.4780, -0.0150, 3), anchor('加拿大水', 51.4978, -0.0497, 3)] },
      { id: 'ld5', appear: [2003, 1], deadline: [2012, 6], type: 'coverage', target: 0.35, reward: 480000, title: '奥运前的覆盖', desc: '2012 年奥运会前，步行 15 分钟可到达地铁站的人口不低于 35%。' },
      { id: 'ld6', appear: [2005, 1], deadline: [2012, 12], type: 'connect', reward: 420000, title: '斯特拉特福枢纽', desc: '奥运会前把斯特拉特福与伦敦城、金丝雀码头连成一线。', anchors: [anchor('斯特拉特福', 51.5416, -0.0033, 3), anchor('伦敦城', 51.5155, -0.0922, 4), anchor('金丝雀码头', 51.5049, -0.0196, 3)] },
      { id: 'ld7', appear: [2015, 1], deadline: [2022, 6], type: 'connect', reward: 560000, title: '横贯铁路走廊', desc: '参考伊丽莎白线：把帕丁顿、邦德街、利物浦街与金丝雀码头连成一条东西向走廊。', anchors: [anchor('帕丁顿', 51.5154, -0.1755, 3), anchor('邦德街', 51.5142, -0.1494, 3), anchor('利物浦街', 51.5178, -0.0823, 3), anchor('金丝雀码头', 51.5049, -0.0196, 3)] },
      { id: 'ld8', appear: [2008, 1], deadline: [2018, 12], type: 'connect', reward: 300000, title: '东伦敦线北延', desc: '2010 年东伦敦线北延至达尔斯顿与海布里。把肖迪奇、达尔斯顿与海布里连入网络。', anchors: [anchor('肖迪奇', 51.5237, -0.0755, 3), anchor('达尔斯顿', 51.5460, -0.0750, 3), anchor('海布里与伊斯灵顿', 51.5462, -0.1030, 3)] },
    ],
    // 本城动态经营任务：年份窗口内按城市状况各发布一次（奖励单位：万英镑，按物价调整）
    dynTasks: [
      { id: 'ldd1', from: [1992, 1], to: [2005, 12], type: 'connect', months: 36, reward: 90000, title: '码头区通勤', desc: '金丝雀码头的写字楼陆续启用，通勤者需要跨过泰晤士河。连接金丝雀码头、伦敦桥与利物浦街。', anchors: [anchor('金丝雀码头', 51.5049, -0.0196, 3), anchor('伦敦桥', 51.5049, -0.0863, 3), anchor('利物浦街', 51.5178, -0.0823, 3)] },
      { id: 'ldd2', from: [1998, 1], to: [2012, 12], type: 'connect', months: 36, reward: 80000, title: '南岸走廊', desc: '泰晤士河南岸的居住区与市中心的联系。连接布里克斯顿、滑铁卢与伦敦桥。', anchors: [anchor('布里克斯顿', 51.4610, -0.1150, 3), anchor('滑铁卢', 51.5031, -0.1132, 3), anchor('伦敦桥', 51.5049, -0.0863, 3)] },
      { id: 'ldd3', from: [2005, 1], to: [2018, 12], type: 'connect', months: 30, reward: 70000, title: '奥运走廊', desc: '奥运会前后，斯特拉特福与纽汉的客流增长。连接斯特拉特福、西汉姆与坎宁镇。', anchors: [anchor('斯特拉特福', 51.5416, -0.0033, 3), anchor('西汉姆', 51.5287, 0.0050, 3), anchor('坎宁镇', 51.5146, 0.0080, 3)] },
      { id: 'ldd4', from: [2010, 1], to: [2025, 12], type: 'connect', months: 48, reward: 110000, title: '南郊走廊', desc: '外伦敦南部的人口增长带来了新的通勤需求。不经市中心，连接刘易舍姆、温布尔登与布里克斯顿。', anchors: [anchor('刘易舍姆', 51.4450, -0.0200, 4), anchor('温布尔登', 51.4210, -0.2060, 3), anchor('布里克斯顿', 51.4610, -0.1150, 3)] },
    ],
    taskNote: '历史主题任务参考伦敦 1990 年起的实际发展需求（码头区再开发、银禧线延伸、皇家码头、格林尼治半岛、奥运与横贯铁路），不要求按真实线路建设，只需满足目标描述。',
    dataNote: [
      ['真实地理', 'hist', '泰晤士河与码头、道路与桥梁、铁路与地铁、公园与林地、行政区（伦敦自治市）边界、地名与地标场地来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），2026-10-24 经 Overpass API 取数、按 250 m 网格投影（转换见 scripts/fetch-osm.mjs 与 scripts/geo-import.mjs）；OSM 为现代数据，按 1990 年场景作历史近似。'],
      ['史实参考', 'hist', '1990 年东伦敦线的运营区间（肖迪奇—新十字门）、1981 年码头区开发公司、金丝雀码头（1988 动工、1991 封顶、1992 破产接管）、1992 年黑色星期三、1994 年海底隧道、1999 年银禧线延伸、2003 年拥堵费、2008 年金融危机、2012 年奥运会、2016 年脱欧与 2022 年伊丽莎白线的年份。码头区与皇家码头的再开发范围、填海前的岸线均为近似。'],
      ['估算', 'est', '1990 年人口与就业分布、人口增长曲线、出行率、时间价值、造价、票价与运营费用（英镑）。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。铁路与地铁的历史线网不参与模拟（开局只有东伦敦线由玩家运营）；真实的后续地铁线路不会自动出现。'],
      ['', '', '模拟结果不得作为真实伦敦交通规划预测。'],
    ],
    // 开局已运营的地铁：1990 年仍在运营的东伦敦线（肖迪奇—新十字门），属于玩家，不收历史建设费
    initialNetwork: {
      year: 1933, note: '东伦敦线（1869 年开通，1990 年时属伦敦地铁东伦敦线）',
      lines: [{ name: '东伦敦线', color: '#f0672a', type: 'elevated', year: 1933, stations: [
        st('肖迪奇', 51.5237, -0.0755, 'M', 1869), st('白教堂', 51.5194, -0.0597, 'M', 1876), st('沙德韦尔', 51.5113, -0.0560, 'S', 1876),
        st('沃平', 51.5043, -0.0559, 'S', 1869), st('罗瑟希德', 51.5008, -0.0415, 'S', 1869),
        st('萨里码头', 51.4933, -0.0476, 'S', 1884), st('新十字门', 51.4753, -0.0402, 'M', 1871),
      ] }],
    },
    // 线路配色参考伦敦地铁与码头区轻轨
    lineColorsNice: ['#B36305', '#E32017', '#FFD300', '#00782A', '#F3A9BB', '#A0A5A9', '#9B0056', '#000000', '#003688', '#0098D4', '#00A4A7', '#6950A1', '#EE7C0E', '#84B817'],
    places: (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; }),
  };

  const INF = [[1990, 0.07], [1991, 0.05], [1993, 0.03], [1996, 0.025], [2000, 0.02], [2005, 0.022], [2008, 0.035], [2012, 0.025], [2016, 0.015], [2020, 0.012], [2030, 0.02], [2050, 0.02]];
  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'ld', name: '伦敦', title: '伦敦 · 1990', sub: '真实地理 · 1990 年起 · 英镑',
    desc: '从 1990 年的伦敦开始：地铁网已经运营了一百多年，但你接手的只有东部那段被忽视的东伦敦线。码头区正在废墟上重建，金丝雀码头即将崛起，泰晤士河把城市分成两半。路网由你继续规划。',
    facts: [['范围', '30 km × 24 km'], ['起始', '1990 年'], ['人口', '约 640 万'], ['货币', '英镑（GBP）'], ['既有地铁', '东伦敦线 7 站'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 1, scenario: 'ld-1990',
    region: '英国', tagline: '接管东伦敦线，重建码头区', difficulty: 4, tags: ['已有地铁', '过河', '再开发'],
    intro: '1990 年的伦敦正处在转折点：撒切尔时代进入尾声，码头的仓库与船坞正在变成写字楼与公寓。地铁网已有 127 年历史，但东部只有一条 7 站的小线；过河要靠桥梁，高峰时内环道路几乎瘫痪。你要用这条线把金丝雀码头、皇家码头与斯特拉特福接进城市，再面对奥运与横贯铁路带来的新需求。',
    features: [['train', '既有东伦敦线', '开局接管肖迪奇—新十字门 7 站，不收历史建设费'], ['bridge', '泰晤士河与码头', '河面宽阔，过河要建隧道或桥梁，码头区水道交错'], ['building', '码头区再开发', '狗岛、皇家码头、格林尼治半岛按年份开放，金丝雀码头 1991 年崛起'], ['coin', '英镑经营', '造价、票价、拨款与债券按英镑计算，1990 年代利率较高']],
    highlights: [[1992, '黑色星期三与码头区破产'], [1994, '英法海底隧道通车'], [1999, '银禧线延伸通车'], [2003, '伦敦拥堵费'], [2012, '伦敦奥运会'], [2022, '伊丽莎白线通车']],
    geo: G, data: data,
    econ: { devOffset: 25, money: 8.5 },   // 出行选择参数：伦敦 1990 年约对应广州样本 2015 年的发展阶段；时间价值等按英镑换算
    cfg: {
      W: 120, H: 96, START: { y: 1990, m: 1, d: 1, minute: 360 },
      // 工作周：英国长期实行五天工作周（史实）
      workWeek: { sat: [[1990, 0]], school: [[1990, 0]] },
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[1990, 6.1e6], [1995, 6.2e6], [2000, 6.8e6], [2005, 7.2e6], [2010, 7.8e6], [2015, 8.5e6], [2020, 8.9e6], [2030, 9.4e6], [2050, 9.9e6], [2300, 10.2e6]], histEnd: 2020, jobsRatio: [[1990, 0.55], [2000, 0.6], [2020, 0.63], [2040, 0.64]] }),
      money: { code: 'GBP', unit: '英镑', wan: '万英镑', yi: '亿英镑', sym: '£' },
      econBase: 1990,
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 22000, surface: 3500, elevated: 9000 },
        riverPerKm: { underground: 16000, surface: 12000, elevated: 12000 },   // 泰晤士河：河底隧道 / 跨河桥梁附加
        hillPerKm: 8000, protectedPerKm: 6000,
        station: { underground: { S: 9000, M: 15000, L: 24000 }, elevated: { S: 5000, M: 8000, L: 13000 }, surface: { S: 3000, M: 5000, L: 8000 } },
        demolishPerCell: 22000,
        inflation: INF,
      }),
      ops: Object.assign({}, CM.CFG.ops, { carKmCost: 0.0012, stationDaily: { S: 2.2, M: 3.8, L: 6.5 }, inflation: INF }),
      fareDefault: { mode: 'flat', flat: 1.2 }, fareRange: { min: 0, max: 4, step: 0.1 },
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 700000, grantBase: [[1990, 35000], [1995, 45000], [2000, 52000], [2010, 60000], [2020, 70000], [2050, 95000]], debtLimit: -420000, rewardScale: 8.5,
        // 英镑债券：1990 年代初利率较高，1992 年退出汇率机制后回落，2008 年后长期低息
        bonds: { local: { rate: [[1990, 0.115], [1992, 0.09], [1993, 0.075], [1996, 0.078], [2000, 0.053], [2003, 0.045], [2008, 0.045], [2012, 0.018], [2020, 0.003], [2030, 0.03], [2050, 0.04]], quotaMonths: 6, capMonths: 30 }, ct: { spread: 0.015, quotaMonths: 4, capMonths: 18 }, term6: 0.003 } }),
      // 城市经济（macro.js）：1990 年地图范围 GVA 约 520 亿英镑（估算，大伦敦约占全英四分之一）；
      // 金融与房地产比重高，对全球金融周期敏感
      macro: {
        area: '地图范围（大伦敦内区、码头区与内环郊区）', region: '英国',
        gdp0: 5200000, revRatio: [[1990, 0.14], [2000, 0.16], [2010, 0.18], [2020, 0.19], [2040, 0.19]], revElastic: 1.5,
        prod: [[1990, 0.02], [1995, 0.025], [2000, 0.028], [2007, 0.02], [2009, 0.005], [2012, 0.012], [2019, 0.01], [2025, 0.009], [2050, 0.012], [2080, 0.01]],
        infl: 'uk', longRun: { infl: 0.02 }, histEnd: 2020, ref: 'uk',
        struct: { trade: 0.55, fin: 0.95, ind: 0.3, tour: 0.55, prop: 0.8 },
        events: [
          { id: 'uk1990', y: 1990, m: 7 },
          { id: 'blackwed1992', y: 1992, m: 9 },
          { id: 'dotcom2001', y: 2001, m: 3, scale: 0.6 },
          { id: 'gfc2008', y: 2008, m: 9, scale: 1.25 },
          { id: 'brexit2016', y: 2016, m: 6 },
          { id: 'covid2020', y: 2020, m: 3, scale: 1.2 },
        ],
      },
    },
    cam: { cx: 62, cy: 44, zoom: 18 },
  });
})(window.CM);
