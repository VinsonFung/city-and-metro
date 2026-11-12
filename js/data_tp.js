'use strict';
// 台北 · 1990 场景。地理来自 OpenStreetMap（geo_tp.js，现代数据），本文件补充 1990 年起的区域开放（按区划分）、基隆河截弯取直新生地、
// 道路通车年份、人口就业中心、地标、历史事件、本地任务与新台币经营参数。坐标单位为格（250 m），用 ll(纬度, 经度) 换算。
// 开局没有任何捷运线路或车站，历史上的在建工程也不预先生成，路网完全由玩家规划。
// 真实性：行政区调整、截弯取直、市府迁移、地标落成与重大活动年份为史实参考（范围为近似）；1990 年人口与就业分布、增长曲线、造价与票价为估算。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.tp; if (!G) return;
  const P = G.proj, ll = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const poly = function (pts) { return pts.map(function (p) { return ll(p[0], p[1]); }); };
  const at = function (lat, lon, o) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const anchor = function (name, lat, lon, r) { const p = ll(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };

  // 松山机场（仍在使用的民用机场，范围为近似）
  const songshan = poly([[25.0748, 121.5345], [25.0752, 121.5520], [25.0730, 121.5700], [25.0655, 121.5705], [25.0628, 121.5560], [25.0622, 121.5440], [25.0655, 121.5345]]);
  // 基隆河截弯取直（1991–1993）后的旧河道新生地：大直、内湖（近似）
  const newland = [
    poly([[25.0868, 121.5440], [25.0870, 121.5640], [25.0790, 121.5662], [25.0762, 121.5452]]),
    poly([[25.0722, 121.5722], [25.0725, 121.5950], [25.0632, 121.5962], [25.0628, 121.5752]]),
  ];
  // 信义计划区与新板特区（近似）
  const xinyi = poly([[25.0418, 121.5575], [25.0418, 121.5722], [25.0300, 121.5722], [25.0300, 121.5575]]);
  const xinban = poly([[25.0188, 121.4555], [25.0188, 121.4685], [25.0098, 121.4685], [25.0098, 121.4555]]);

  const data = {
    // 城市特色（traits.js，规则见《地图设计与城市特色机制.md》）。新条目加在末尾，已触发事件按序号记录
    traits: [
      { use: 'railProperty', level: 'light', star: true, icon: 'building', label: '联合开发', text: '捷运站与周边土地联合开发：车站商业更赚钱，新线也更常带开发权', why: '台北捷运以联合开发的方式，把车站出入口和周边土地与民间合作开发。' },
      { use: 'disaster', level: 'heavy', star: true, icon: 'wave', label: '纳莉台风', text: '2001 年洪水灌入捷运，三个月才完全恢复，出行骤降、满意度下滑',
        on: { y: 2001, m: 9, title: '纳莉台风淹没捷运', desc: '纳莉台风带来的洪水灌入台北捷运，16 座车站、南港机厂和行控中心进水，板南线全线停驶，到 12 月才全部恢复。' }, why: '2001 年 9 月纳莉台风使 16 座捷运车站淹水，系统分阶段复驶，12 月 15 日全线恢复。' },
      { use: 'foresight', level: 'mid', star: true, icon: 'chart', label: '新板与信义提前布局', text: '开发启动前就通捷运，能得到开发商出资，片区也长得更快', id: 'tp-xinban', at: 'tp_banqiao', ym: [1999, 7], before: 1997, r: 7, region: 'xinban', title: '新板特区开发',
        hit: '板桥车站启用，早已通车的{st}站让新板特区一开始就有了捷运。', miss: '板桥车站启用，新板特区的高楼开始动工，可这里还没有捷运。', why: '1999 年 7 月板桥车站启用，周边的新板特区开始开发。' },
      { use: 'foresight', level: 'mid', label: '信义计划区提前布局', id: 'tp-101', at: 'tp_101', ym: [1998, 1], before: 1996, r: 7, region: 'xinyi', title: '台北金融大楼筹建',
        hit: '信义计划区筹建全台最高的大楼，早已通车的{st}站让这里成了新的办公中心。', miss: '信义计划区筹建全台最高的大楼，可这里还没有捷运。', why: '信义计划区 1990 年代成形，台北金融大楼（后来的台北 101）1998–1999 年前后动工，2004 年底落成。' },
      { use: 'transition', level: 'light', label: '内湖与南港转型', region: ['neihu', 'nangang'], renew: { y: 2000, m: 1, title: '内湖与南港转向科技园区', desc: '基隆河沿岸的内湖、南港工业区陆续转型，科技公司和软件园区进驻。' }, replan: [{ year: 2001, region: 'neihu', plan: 'mix' }, { year: 2001, region: 'nangang', plan: 'mix' }], why: '台北市政府陆续规划内湖科技园区和南港经贸园区。' },
      { use: 'scenic', label: '阳明山与盆地山地', why: '阳明山国家公园与盆地周边山地不能开发。' },
      { use: 'crossing', label: '三条河', why: '淡水河、新店溪和基隆河分隔盆地，过河要建隧道或桥梁。' },
      { use: 'finance', flavor: 'tw' },
    ],
    city: '台北', riverName: '淡水河', seaName: '台湾海峡', hsrYear: 2007,
    stages: [[1994, '盆地老城时期'], [2004, '东区与信义时期'], [2011, '双城发展期']], stageLast: '大台北都会时期',
    // 历史发展阶段（v2.2，eras.js）：summary 中「史实」可查证，「估算」为模型设定的发展倾向；grow 只改变人口与岗位增长的去向（总量仍按人口曲线），
    // relocate 为每月疏解比例，corridors 为片区间通勤与购物去向倍数，demand 为出行强度与距离倍数，goals 为阶段目标（本城任务）
    eras: [
      { id: 'tp-e1', from: 1990, name: '盆地老城时期', tag: '史实',
        summary: '史实：城市集中在台北车站、西门町与大稻埕一带，淡水线铁路 1988 年停驶，捷运正在施工，道路因施工与机车交通十分拥挤；1993 年基隆河截弯取直完工。估算：台北市人口趋于饱和，新增人口主要落在三重、中和、永和与新庄等新北各区。',
        grow: { pop: { zhongzheng: 0.6, oldtown: 0.6, daan: 0.8, zhongshan: 0.8, sanchong: 1.3, zhongyong: 1.3, xinzhuang: 1.3, banqiao: 1.2, xindian: 1.2, neihu: 1.2 }, jobs: { zhongzheng: 1.2, zhongshan: 1.2, daan: 1.2, songshan: 1.3, xinyi: 1.3 } },
        demand: { decayHW: 0.9 }, corridors: [{ a: 'sanchong', b: 'zhongzheng', f: 1.1 }, { a: 'zhongyong', b: 'daan', f: 1.1 }],
        goals: [{ id: 'tp-g1', to: 1997, type: 'connect', months: 48, reward: 40000, title: '淡水通勤', desc: '淡水线铁路停驶后，淡水与北投的居民只能搭公车进城。用地铁连接淡水与北投。', anchors: [anchor('淡水', 25.1680, 121.4450, 3), anchor('北投', 25.1320, 121.4980, 3)] }] },
      { id: 'tp-e2', from: 1994, name: '东区与信义时期', tag: '史实',
        summary: '史实：1994 年台北市政府迁入信义计划区，基隆河新生地（大直、内湖）开发，1996 年起捷运陆续通车（史实背景，不会自动建成），1999 年板桥车站启用。估算：商务岗位由西区向东区与信义计划区转移，内湖、南港形成科技园区，新北的通勤人口持续增加。',
        grow: { pop: { newland: 1.5, neihu: 1.4, banqiao: 1.3, xinzhuang: 1.3, tucheng: 1.3, xizhi: 1.3, zhongzheng: 0.6, oldtown: 0.5 }, jobs: { xinyi: 2.0, xinyiq: 1.4, songshan: 1.3, neihu: 1.6, newland: 1.4, oldtown: 0.8 } },
        relocate: { jobs: { oldtown: 0.0004 } },
        demand: { decayHW: 1.05 },
        corridors: [{ a: 'xinyi', b: 'banqiao', f: 1.1 }, { a: 'neihu', b: 'zhongshan', f: 1.15 }, { a: 'xinyi', b: 'zhongyong', f: 1.1 }],
        goals: [{ id: 'tp-g2', type: 'connect', months: 48, reward: 40000, title: '基隆河新生地', desc: '截弯取直后的大直新生地开始开发，居民与上班族需要进入中山区。用地铁连接大直与中山。', anchors: [anchor('大直', 25.0800, 121.5450, 3), anchor('中山', 25.0520, 121.5200, 3)] }] },
      { id: 'tp-e3', from: 2004, name: '双城发展期', tag: '史实',
        summary: '史实：2004 年台北 101 落成，2007 年台湾高铁通车至台北，2008 年南港展览馆启用，2010 年举办台北国际花卉博览会、台北县改制为新北市。估算：信义计划区与内湖成为主要就业中心，新板特区在板桥形成新北的商务中心，汐止与南港的人口增长。',
        grow: { pop: { xizhi: 1.4, nangang: 1.3, linkou: 1.3, sanxia: 1.3, tamsui: 1.3, shulin: 1.2, zhongzheng: 0.6, oldtown: 0.6 }, jobs: { xinyi: 1.6, neihu: 1.6, nangang: 1.5, xinban: 1.8, oldtown: 0.8 } },
        relocate: { jobs: { oldtown: 0.0003 } },
        demand: { sh: 1.05, lz: 1.05, decayHW: 1.1 },
        corridors: [{ a: 'xizhi', b: 'neihu', f: 1.15 }, { a: 'xinban', b: 'zhongyong', f: 1.1 }, { a: 'nangang', b: 'xinyi', f: 1.1 }],
        goals: [{ id: 'tp-g3', type: 'connect', months: 48, reward: 45000, title: '汐止与南港', desc: '汐止的大型社区居民每天到南港与内湖上班，联外道路十分拥挤。用地铁连接汐止与南港。', anchors: [anchor('汐止', 25.0680, 121.6600, 4), anchor('南港', 25.0520, 121.6070, 3)] }] },
      { id: 'tp-e4', from: 2011, name: '大台北都会时期', tag: '史实',
        summary: '史实：2017 年桃园机场捷运通车（史实背景，不会自动建成），同年举办台北世界大学运动会。估算：林口、淡海等新市镇与新庄副都心成长，新北各区之间的横向出行增加，台北市中心人口保持稳定。',
        grow: { pop: { linkou: 1.5, tamsui: 1.4, sanxia: 1.3, xinzhuang: 1.2, zhongzheng: 0.7, oldtown: 0.6 }, jobs: { xinban: 1.4, neihu: 1.3, nangang: 1.4, xinzhuang: 1.3, linkou: 1.3 } },
        demand: { sh: 1.05, lz: 1.08, decayHW: 1.15 },
        corridors: [{ a: 'linkou', b: 'xinzhuang', f: 1.15 }, { a: 'xinban', b: 'xinzhuang', f: 1.1 }, { a: 'zhongyong', b: 'banqiao', f: 1.1 }],
        goals: [{ id: 'tp-g4', type: 'connect', months: 48, reward: 45000, title: '林口新市镇', desc: '林口新市镇入住人口快速增加，居民多到新庄与台北上班。用地铁连接林口与新庄。', anchors: [anchor('林口', 25.0770, 121.3900, 4), anchor('新庄', 25.0360, 121.4520, 3)] }] },
      { id: 'tp-e5', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '模拟：此后的发展按模型推演，不代表真实历史。估算：新北的新市镇继续成长，就业在信义、内湖、南港与新板之间分散。',
        grow: { pop: { linkou: 1.3, tamsui: 1.3, sanxia: 1.2, oldtown: 0.7 }, jobs: { nangang: 1.3, xinban: 1.3, neihu: 1.2 } },
        demand: { lz: 1.1, decayHW: 1.15 }, corridors: [{ a: 'linkou', b: 'banqiao', f: 1.1 }] },
    ],
    briefing: {
      lead: '1990 年的台北还没有捷运。盆地里住着约 500 万人，公车与机车挤满了忠孝东路与中山北路；纵贯铁路的台北车站一年前刚完成地下化，基隆河还在大直、内湖一带弯弯曲曲地流过。',
      modes: [['metro', '捷运', '尚无捷运线路与车站，你将从零规划台北的整个路网。'], ['bus', '公车与机车', '公车是主要的公共交通，机车数量快速增长，市区高峰拥堵严重。'], ['bridge', '过河', '淡水河、新店溪与基隆河把盆地分成数块，过河只能依靠桥梁。'], ['rail', '铁路', '纵贯铁路穿城而过，台北车站 1989 年完成地下化。列车本身不参与模拟，但车站会产生市内接驳出行，地面段会阻隔步行。']],
    },
    // 松山机场（v1.9 起）：机场继续运营、用地不开发，但范围内可以地下设站与地下穿越（跑道与航站区不能建地面或高架设施）
    airport: { name: '松山机场', closeYear: 9999, buildable: 'underground', runway: [ll(25.0712, 121.5395), ll(25.0672, 121.5652)] },
    // 区域：阳明山与盆地周边山地（按林地覆盖）→ 松山机场 → 新生地与新区 → 各区（OSM 区界）→ 外围
    regions: [
      { id: 'yms', name: '阳明山国家公园', scenic: true, open: null, geo: { reserve: '阳明山国家公园' }, relief: 720 },   // relief：三维山体的最高高度（米）
      { id: 'hills', name: '盆地周边山地', scenic: true, open: null, woodMin: 0.6, relief: 420 },
      { id: 'airport', name: '松山机场', poly: songshan, open: 1990, plan: 'res', note: '民用机场继续运营，用地不开发；范围内可以地下设站与地下穿越（v1.9 起）' },
      { id: 'guandu', name: '关渡自然公园', park: true, open: 1995, plan: 'res', geo: { park: '关渡自然公园' }, note: '湿地保护区，保留为绿地' },
      { id: 'newland', name: '基隆河新生地（大直·内湖）', poly: newland, open: 1994, plan: 'mix', note: '1991–1993 年基隆河截弯取直，旧河道整理为新的城市用地（史实，范围为近似）' },
      { id: 'xinyi', name: '信义计划区', poly: xinyi, open: 1990, plan: 'cbd', note: '1980 年代起规划为台北新都心，1994 年台北市政府迁入（史实）' },
      { id: 'xinban', name: '新板特区', poly: xinban, open: 1999, plan: 'cbd', note: '1999 年板桥车站启用，周边铁路用地开发为新板特区（史实）' },
      { id: 'zhongzheng', name: '中正区（台北车站·博爱特区）', district: ['中正区'], open: 1990, plan: 'cbd' },
      { id: 'oldtown', name: '大同·万华（大稻埕·艋舺）', district: ['大同区', '万华区'], open: 1990, plan: 'oldmix' },
      { id: 'zhongshan', name: '中山区', district: ['中山区'], open: 1990, plan: 'mix' },
      { id: 'daan', name: '大安区', district: ['大安区'], open: 1990, plan: 'mix' },
      { id: 'songshan', name: '松山区', district: ['松山区'], open: 1990, plan: 'mix' },
      { id: 'xinyiq', name: '信义区', district: ['信义区'], open: 1990, plan: 'res' },
      { id: 'wenshan', name: '文山区（景美·木栅）', district: ['文山区'], open: 1992, plan: 'res' },
      { id: 'shilin', name: '士林区', district: ['士林区'], open: 1993, plan: 'res' },
      { id: 'beitou', name: '北投区', district: ['北投区'], open: 1995, plan: 'res' },
      { id: 'neihu', name: '内湖区', district: ['内湖区'], open: 1994, plan: 'resind', note: '内湖科技园区 1990 年代起开发（史实）' },
      { id: 'nangang', name: '南港区', district: ['南港区'], open: 1993, plan: 'resind' },
      { id: 'banqiao', name: '板桥', district: ['板桥区'], open: 1994, plan: 'mix' },
      { id: 'sanchong', name: '三重·芦洲', district: ['三重区', '芦洲区'], open: 1993, plan: 'resind' },
      { id: 'zhongyong', name: '中和·永和', district: ['中和区', '永和区'], open: 1994, plan: 'res' },
      { id: 'xinzhuang', name: '新庄', district: ['新庄区'], open: 1996, plan: 'resind' },
      { id: 'xindian', name: '新店', district: ['新店区'], open: 1995, plan: 'res' },
      { id: 'tucheng', name: '土城', district: ['土城区'], open: 1997, plan: 'resind' },
      { id: 'xizhi', name: '汐止', district: ['汐止区'], open: 1999, plan: 'resind' },
      // v2.1 扩大范围：盆地边缘的淡水、林口台地、树林·莺歌·三峡与基隆七堵
      { id: 'keelung', name: '七堵·安乐（基隆）', district: ['七堵区', '安乐区'], open: 2003, plan: 'resind' },
      { id: 'shulin', name: '树林·莺歌', district: ['树林区', '莺歌区'], open: 2000, plan: 'resind', pop: 5.95e6 },
      { id: 'tamsui', name: '淡水·八里', district: ['淡水区', '八里区'], open: 1997, plan: 'res', pop: 5.75e6, note: '淡水新市镇 1990 年代后期起开发（史实）' },
      { id: 'linkou', name: '林口·龟山', district: ['林口区', '龟山区'], open: 2002, plan: 'resind', pop: 6.0e6, note: '林口新市镇 1990 年代后期起大规模开发（史实）' },
      { id: 'sanxia', name: '三峡', district: ['三峡区'], open: 2005, plan: 'res', pop: 6.15e6, note: '台北大学三峡校区与北大特定区 2000 年代起开发（史实）' },
    ],
    defaultRegion: { id: 'outer', name: '外围（五股·泰山·深坑·北海岸等）', open: 2003, plan: 'res', pop: 6.05e6 },
    plans: CM.DATA.plans,
    // 1990 年人口与就业中心（估算，人/km²；r 约为影响半径 km）
    centers: [
      at(25.0450, 121.5130, { pop: 25000, jobs: 70000, r: 1.2 }),   // 台北车站、西门、博爱特区
      at(25.0350, 121.5000, { pop: 35000, jobs: 15000, r: 1.0 }),   // 万华（艋舺）
      at(25.0600, 121.5130, { pop: 32000, jobs: 15000, r: 1.1 }),   // 大同（大稻埕）
      at(25.0520, 121.5330, { pop: 25000, jobs: 45000, r: 1.2 }),   // 中山、南京东路
      at(25.0418, 121.5500, { pop: 30000, jobs: 50000, r: 1.3 }),   // 东区（忠孝东路）
      at(25.0290, 121.5400, { pop: 35000, jobs: 20000, r: 1.3 }),   // 大安
      at(25.0500, 121.5700, { pop: 28000, jobs: 15000, r: 1.2 }),   // 松山
      at(25.0330, 121.5650, { pop: 15000, jobs: 10000, r: 1.0 }),   // 信义
      at(25.0180, 121.5300, { pop: 30000, jobs: 12000, r: 1.0 }),   // 公馆、古亭
      at(24.9950, 121.5550, { pop: 15000, jobs: 4000, r: 1.4 }),    // 景美、木栅
      at(25.0930, 121.5250, { pop: 22000, jobs: 8000, r: 1.2 }),    // 士林
      at(25.1310, 121.5000, { pop: 12000, jobs: 4000, r: 1.3 }),    // 北投
      at(25.0800, 121.5900, { pop: 10000, jobs: 4000, r: 1.4 }),    // 内湖
      at(25.0530, 121.6080, { pop: 10000, jobs: 8000, r: 1.1 }),    // 南港
      at(25.0130, 121.4630, { pop: 30000, jobs: 12000, r: 1.6 }),   // 板桥
      at(25.0620, 121.4900, { pop: 35000, jobs: 15000, r: 1.4 }),   // 三重
      at(25.0000, 121.4950, { pop: 28000, jobs: 10000, r: 1.4 }),   // 中和
      at(25.0090, 121.5160, { pop: 45000, jobs: 8000, r: 0.9 }),    // 永和
      at(25.0370, 121.4500, { pop: 20000, jobs: 15000, r: 1.5 }),   // 新庄
      at(24.9730, 121.5390, { pop: 15000, jobs: 5000, r: 1.3 }),    // 新店
      at(25.0850, 121.4700, { pop: 15000, jobs: 3000, r: 1.0 }),    // 芦洲
      at(24.9800, 121.4450, { pop: 10000, jobs: 10000, r: 1.3 }),   // 土城
      at(25.0640, 121.6450, { pop: 8000, jobs: 6000, r: 1.0 }),     // 汐止
      // v2.1 扩大范围（1990 年估算）
      at(25.1690, 121.4410, { pop: 12000, jobs: 5000, r: 1.0 }),    // 淡水老街
      at(24.9910, 121.4200, { pop: 15000, jobs: 8000, r: 1.1 }),    // 树林
      at(24.9580, 121.3650, { pop: 9000, jobs: 6000, r: 0.9 }),     // 莺歌（老街在西缘外侧，取镇区东部）
      at(24.9340, 121.3690, { pop: 7000, jobs: 3000, r: 0.9 }),     // 三峡
      at(25.0770, 121.3910, { pop: 3000, jobs: 1500, r: 1.0 }),     // 林口
      at(25.0930, 121.6940, { pop: 9000, jobs: 4000, r: 0.9 }),     // 七堵
    ],
    rural: { pop: 500, jobs: 150 },
    // 1990 年后通车的快速道路与高速公路（参考）；未列出的道路与跨河桥梁视为 1990 年已有
    roadYears: {
      '福尔摩沙高速公路': 1996, '台北联络线': 1996, '市民大道高架道路': 1997, '信义快速道路': 2002, '环东大道': 2003,
      '东西向快速公路 八里新店线': 2005, '蒋渭水高速公路': 2006, '南港联络道': 2006, '五股土城线': 2008, '洲美快速道路': 2009,
    },
    bridgeYears: {}, bridgeDefaultYear: 1990,
    simRoads: [],
    landmarks: [
      Object.assign(at(25.0372, 121.4999), { id: 'tp_longshan', name: '龙山寺', w: 100, d: 120, year: 1900, kind: 'temple' }),
      Object.assign(at(25.0400, 121.5119), { id: 'tp_office', name: '总统府', w: 140, d: 130, year: 1919, kind: 'colonial' }),
      Object.assign(at(25.0173, 121.5397), { id: 'tp_ntu', name: '台湾大学', w: 1200, d: 1000, year: 1928, kind: 'campus' }),
      Object.assign(at(25.0490, 121.5520), { id: 'tp_stadium', name: '台北田径场', w: 260, d: 300, year: 1956, kind: 'stadium' }),
      Object.assign(at(25.1024, 121.5485), { id: 'tp_palace', name: '故宫博物院', w: 300, d: 200, year: 1965, kind: 'museum' }),
      Object.assign(at(25.0630, 121.5338), { id: 'tp_xingtian', name: '行天宫', w: 80, d: 100, year: 1967, kind: 'temple' }),
      Object.assign(at(25.0400, 121.5600), { id: 'tp_sysmh', name: '国父纪念馆', w: 300, d: 300, year: 1972, kind: 'hall' }),
      Object.assign(at(25.0790, 121.5262), { id: 'tp_grand', name: '圆山大饭店', w: 160, d: 80, year: 1973, kind: 'traditional' }),
      Object.assign(at(25.0346, 121.5218), { id: 'tp_cks', name: '中正纪念堂', w: 600, d: 500, year: 1980, kind: 'memorial' }),
      Object.assign(at(25.0724, 121.5246), { id: 'tp_tfam', name: '台北市立美术馆', w: 120, d: 120, year: 1983, kind: 'gallery' }),
      Object.assign(at(25.0330, 121.5605), { id: 'tp_twtc', name: '台北世界贸易中心', w: 260, d: 200, year: 1986, kind: 'expo' }),
      Object.assign(at(25.0478, 121.5170), { id: 'tp_station', name: '台北车站', w: 300, d: 200, year: 1989, kind: 'rail' }),
      Object.assign(at(25.0461, 121.5150), { id: 'tp_skm', name: '新光人寿保险摩天大楼', w: 60, d: 60, year: 1993, kind: 'skyscraper', h: 245 }),
      Object.assign(at(25.0375, 121.5637), { id: 'tp_cityhall', name: '台北市政府', w: 200, d: 160, year: 1994, kind: 'skyscraper', h: 50 }),
      Object.assign(at(25.0140, 121.4637), { id: 'tp_banqiao', name: '板桥车站', w: 260, d: 150, year: 1999, kind: 'rail' }),
      Object.assign(at(25.0336, 121.5648), { id: 'tp_101', name: '台北101', w: 160, d: 160, year: 2004, kind: 'skyscraper', h: 508, style: 'taipei101' }),
      Object.assign(at(25.0516, 121.5498), { id: 'tp_arena', name: '台北小巨蛋', w: 220, d: 200, year: 2005, kind: 'box' }),
      Object.assign(at(25.0560, 121.6175), { id: 'tp_nangang', name: '南港展览馆', w: 300, d: 150, year: 2008, kind: 'expo' }),
    ],
    // 重要设施（v1.9，见 facility.js）：位置与启用/停用年份为史实参考（位置近似）；规模均为估算。
    // 枢纽 pax：市内接驳出行（汽车 + 捷运，万人次/日），铁路只计城际（台铁长途、高铁）旅客；桃园机场在地图范围外，不模拟。
    facilities: [
      { id: 'tp_station', n: '台北车站', t: 'rail', lm: 'tp_station', pax: [[1989, 5], [2000, 6], [2007, 8], [2015, 11], [2030, 12]] },
      { id: 'tp_banqiao', n: '板桥车站', t: 'rail', lm: 'tp_banqiao', pax: [[1999, 1.5], [2007, 3], [2015, 4.5], [2030, 5]] },
      { id: 'tp_songshan_rail', n: '松山车站', t: 'rail', at: ll(25.0493, 121.5781), pax: [[1990, 1], [2008, 1.5], [2030, 2]] },
      { id: 'tp_nangang_rail', n: '南港车站', t: 'rail', at: ll(25.0530, 121.6070), pax: [[1990, 0.4], [2008, 0.6], [2016.5, 2], [2030, 2.5]], note: '2016 年 7 月高铁延伸至南港。' },
      { id: 'tp_tpe', n: '桃园机场（林口接驳）', t: 'air', ext: ['W', 13],at: ll(25.0610, 121.3700), pax: [[1990, 1.8], [2000, 3], [2010, 4], [2019, 6.5], [2030, 7.5]], note: '桃园国际机场（2006 年前称中正国际机场，1979 年启用）在地图西缘以西约 13 km。此处为机场方向的高速公路与轨道交通出图的接驳点。' },
      { id: 'tp_tsa', n: '松山机场', t: 'air', at: ll(25.0630, 121.5520), pax: [[1990, 1.85], [1997, 4], [2003, 3], [2007, 2], [2009, 1.2], [2012, 1.5], [2019, 1.6], [2030, 1.7]], note: '国内航线 1990 年代快速增长，2007 年高铁通车后大幅减少，2008 年起增开两岸与东北亚城市航线。' },
      { id: 'tp_ntu', n: '台湾大学', t: 'uni', lm: 'tp_ntu', w: 0.03 },
      { id: 'tp_ntnu', n: '台湾师范大学', t: 'uni', at: ll(25.0262, 121.5276), w: 0.015 },
      { id: 'tp_nccu', n: '政治大学', t: 'uni', at: ll(24.98021, 121.57496), w: 0.015 },
      { id: 'tp_ntut', n: '台北科技大学', t: 'uni', at: ll(25.0430, 121.5355), w: 0.012 },
      { id: 'tp_fju', n: '辅仁大学', t: 'uni', at: ll(25.0360, 121.4320), w: 0.012 },
      { id: 'tp_ntuh', n: '台大医院', t: 'hosp', at: ll(25.0405, 121.5190), w: 0.06 },
      { id: 'tp_vghtpe', n: '台北荣民总医院', t: 'hosp', at: ll(25.1200, 121.5205), w: 0.05 },
      { id: 'tp_tsgh_old', n: '三军总医院（汀州院区）', t: 'hosp', at: ll(25.0195, 121.5240), y1: 2000, w: 0.04 },
      { id: 'tp_tsgh', n: '三军总医院（内湖）', t: 'hosp', at: ll(25.0720, 121.5900), y0: 2000, w: 0.045 },
      { id: 'tp_mmh', n: '马偕纪念医院', t: 'hosp', at: ll(25.0580, 121.5225), w: 0.04 },
      { id: 'tp_cgmh', n: '台北长庚纪念医院', t: 'hosp', at: ll(25.0575, 121.5480), w: 0.04 },
      { id: 'tp_femh', n: '亚东纪念医院', t: 'hosp', at: ll(25.0105, 121.4520), w: 0.035 },
      { id: 'tp_ximen', n: '西门町', t: 'shop', at: ll(25.0420, 121.5070), w: 0.05 },
      { id: 'tp_east', n: '东区（忠孝东路）', t: 'shop', at: ll(25.0418, 121.5450), w: [[1990, 0.05], [2000, 0.06]] },
      { id: 'tp_xinyi_shop', n: '信义商圈', t: 'shop', at: ll(25.0365, 121.5670), w: [[1990, 0.005], [1997, 0.02], [2004, 0.05]] },
      { id: 'tp_shilin', n: '士林夜市', t: 'shop', at: ll(25.0880, 121.5240), p: { sh: 0.4, lz: 0.6 }, w: 0.03 },
      { id: 'tp_gongguan', n: '公馆商圈', t: 'shop', at: ll(25.0140, 121.5340), w: 0.015 },
      { id: 'tp_nanjing', n: '南京东路商务区', t: 'cbd', at: ll(25.0520, 121.5440), w: 0.02 },
      { id: 'tp_xinban', n: '新板特区', t: 'cbd', at: ll(25.0130, 121.4640), y0: 1999, w: [[1999, 0.004], [2010, 0.02]] },
      { id: 'tp_nhsp', n: '内湖科技园区', t: 'cbd', at: ll(25.0790, 121.5750), y0: 1997, w: [[1997, 0.003], [2008, 0.012]] },
      { id: 'tp_palace', n: '故宫博物院', t: 'scenic', lm: 'tp_palace', w: 0.015 },
      { id: 'tp_cks', n: '中正纪念堂', t: 'scenic', lm: 'tp_cks', w: 0.012 },
      { id: 'tp_sysmh', n: '国父纪念馆', t: 'scenic', lm: 'tp_sysmh', w: 0.008 },
      { id: 'tp_longshan', n: '龙山寺', t: 'scenic', lm: 'tp_longshan', w: 0.01 },
      { id: 'tp_xingtian', n: '行天宫', t: 'scenic', lm: 'tp_xingtian', w: 0.008 },
      { id: 'tp_101', n: '台北101 观景台', t: 'scenic', lm: 'tp_101', w: 0.012 },
      { id: 'tp_daan', n: '大安森林公园', t: 'park', at: ll(25.0300, 121.5360), y0: 1994, r: 1.2, w: 0.02 },
      { id: 'tp_yms', n: '阳明山公园', t: 'scenic', at: ll(25.1550, 121.5400), w: 0.02 },
      { id: 'tp_beitou', n: '北投温泉', t: 'scenic', at: ll(25.1370, 121.5080), w: 0.012 },
      { id: 'tp_zoo', n: '台北市立动物园', t: 'scenic', at: ll(24.99535, 121.58615), w: 0.015 },
      { id: 'tp_huashan', n: '华山1914 文化创意园区', t: 'scenic', at: ll(25.0440, 121.5290), y0: 2007, w: 0.006 },
      { id: 'tp_arena', n: '台北小巨蛋', t: 'stadium', lm: 'tp_arena', w: 0.01 },
      { id: 'tp_stadium', n: '台北田径场', t: 'stadium', lm: 'tp_stadium', w: 0.006 },
      { id: 'tp_dome', n: '台北大巨蛋', t: 'stadium', at: ll(25.0440, 121.5610), y0: [2023, 12], w: 0.008 },
      { id: 'tp_twtc', n: '台北世界贸易中心', t: 'venue', lm: 'tp_twtc', w: 0.012 },
      { id: 'tp_nangang', n: '南港展览馆', t: 'venue', lm: 'tp_nangang', w: 0.008 },
    ],
    districtLabels: [['中正', ['中正区']], ['大同', ['大同区']], ['万华', ['万华区']], ['中山', ['中山区']], ['大安', ['大安区']], ['松山', ['松山区']], ['信义', ['信义区']], ['板桥', ['板桥区']], ['三重', ['三重区']], ['中和', ['中和区']], ['永和', ['永和区']], ['新庄', ['新庄区']], ['芦洲', ['芦洲区']]],
    events: [
      { y: 1990, m: 1, tag: '史实', title: '1990 年的台北', desc: '台北盆地内约 500 万人，城市集中在淡水河以东的老城与东区，河西的三重、板桥、新庄人口快速增长；没有捷运，出行依靠公车与机车。' },
      { y: 1990, m: 3, tag: '史实', title: '台北市行政区调整为 12 区', desc: '原 16 个区合并调整为中正、大同、中山、松山、大安、万华、信义、士林、北投、内湖、南港、文山 12 区。' },
      { y: 1993, m: 12, tag: '史实', title: '基隆河截弯取直完工', desc: '大直、内湖一带的弯曲河道被拉直，旧河道整理为新的城市用地，1994 年起开放开发。', fx: { grow: { region: 'newland', pop: 1.3, jobs: 1.5, years: 8 } } },
      { y: 1994, m: 10, tag: '史实', title: '台北市政府迁入信义计划区', desc: '市政中心东移，信义计划区成为台北的新都心。', fx: { grow: { region: 'xinyi', jobs: 1.8, years: 10 } } },
      { y: 1999, m: 7, tag: '史实', title: '板桥车站启用', desc: '铁路板桥站地下化并启用新站，周边的新板特区开始开发。', fx: { grow: { region: 'xinban', jobs: 1.6, years: 8 } } },
      { y: 2004, m: 12, tag: '史实', title: '台北101 落成', desc: '高 508 米，当时世界最高的建筑。' },
      { y: 2007, m: 3, tag: '史实', title: '台湾高铁通车至台北', desc: '高速铁路经板桥进入台北车站，台北到高雄最快约 90 分钟。' },
      { y: 2008, m: 3, tag: '史实', title: '南港展览馆启用', desc: '台北的展览中心向东延伸到南港。', fx: { grow: { region: 'nangang', jobs: 1.3, years: 6 } } },
      { y: 2010, m: 11, tag: '史实', title: '台北国际花卉博览会', desc: '在圆山、新生、美术、大佳四个园区举行，展期约半年。', fx: { demand: { lz: 1.15, months: 6 }, sat: { v: 1, months: 6 } } },
      { y: 2010, m: 12, tag: '史实', title: '台北县改制为新北市', desc: '盆地西侧的板桥、三重、中和、新庄等地成为新北市的行政区。' },
      { y: 2017, m: 8, tag: '史实', title: '台北世界大学运动会', desc: '第 29 届夏季世界大学运动会在台北举行。', fx: { demand: { lz: 1.1, months: 1 }, sat: { v: 1, months: 3 } } },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后人口、道路和区域变化按模拟规则推演，不代表真实历史。' },
      // v2.2 新增（追加在末尾，保持已有事件的序号与存档一致）
      { y: 2017, m: 3, tag: '史实', title: '史实背景：桃园机场捷运通车', desc: '台北车站经新庄、林口通往桃园国际机场的机场捷运通车（不属于玩家经营的地铁网络）。', fx: { grow: { region: 'linkou', pop: 1.2, years: 5 } } },
    ],
    // 本地历史主题任务：参考台北的发展需求，不要求复刻真实捷运线路（奖励单位：万新台币）
    histTasks: [
      { id: 'tp1', appear: [1990, 6], deadline: [2000, 12], type: 'connect', reward: 250000, title: '南北主轴', desc: '连接士林、台北车站与公馆，这是盆地里南北向最繁忙的走廊。', anchors: [anchor('士林', 25.0930, 121.5260, 3), anchor('台北车站', 25.0478, 121.5170, 3), anchor('公馆', 25.0147, 121.5343, 3)] },
      { id: 'tp2', appear: [1990, 6], deadline: [2000, 12], type: 'connect', reward: 220000, title: '木栅到松山机场', desc: '连接木栅、东区与松山机场航站楼一侧。机场照常运营，范围内只能地下设站或地下穿越。', anchors: [anchor('木栅', 24.9983, 121.5732, 3), anchor('忠孝复兴', 25.0418, 121.5438, 3), anchor('松山机场', 25.0629, 121.5517, 3)] },
      { id: 'tp3', appear: [1992, 1], deadline: [2002, 12], type: 'connect', reward: 250000, title: '东西主轴：板桥到东区', desc: '跨过淡水河，连接板桥、西门町与东区。', anchors: [anchor('板桥', 25.0140, 121.4637, 3), anchor('西门町', 25.0421, 121.5080, 3), anchor('忠孝复兴', 25.0418, 121.5438, 3)] },
      { id: 'tp4', appear: [1994, 1], deadline: [2004, 12], type: 'connect', reward: 220000, title: '信义新都心', desc: '市政府迁入信义计划区后，连接市政府、东区与台北车站。', anchors: [anchor('市政府', 25.0410, 121.5650, 3), anchor('忠孝复兴', 25.0418, 121.5438, 3), anchor('台北车站', 25.0478, 121.5170, 3)] },
      { id: 'tp5', appear: [1995, 1], deadline: [2006, 12], type: 'connect', reward: 200000, title: '三重与芦洲', desc: '河西人口最密集的三重、芦洲需要跨河进城的轨道交通。', anchors: [anchor('芦洲', 25.0850, 121.4640, 3), anchor('三重', 25.0635, 121.4880, 3), anchor('中山', 25.0527, 121.5204, 3)] },
      { id: 'tp6', appear: [1996, 1], deadline: [2008, 12], type: 'connect', reward: 180000, title: '中和与永和', desc: '跨过新店溪，连接中和、永和与古亭。', anchors: [anchor('中和', 24.9930, 121.5050, 3), anchor('永和', 25.0080, 121.5160, 3), anchor('古亭', 25.0263, 121.5228, 3)] },
      { id: 'tp7', appear: [2000, 1], deadline: [2010, 12], type: 'connect', reward: 200000, title: '内湖科技园区通勤', desc: '连接内湖科技园区、松山机场与南港（机场范围内只能地下设站或地下穿越）。', anchors: [anchor('内湖科技园区', 25.0790, 121.5750, 3), anchor('松山机场', 25.0629, 121.5517, 3), anchor('南港', 25.0520, 121.6070, 3)] },
      { id: 'tp8', appear: [2004, 1], deadline: [2008, 12], type: 'connect', reward: 250000, title: '高铁转乘', desc: '高铁通车前后，连接南港、台北车站与板桥三座高铁车站。', anchors: [anchor('南港', 25.0520, 121.6070, 3), anchor('台北车站', 25.0478, 121.5170, 3), anchor('板桥', 25.0140, 121.4637, 3)] },
      { id: 'tp9', appear: [2005, 1], deadline: [2010, 10], type: 'coverage', target: 0.35, reward: 300000, title: '迎接花博', desc: '2010 年 11 月花博开幕前，步行 15 分钟可到达捷运站的人口不低于 35%。' },
    ],
    // 本城动态经营任务：年份窗口内按城市状况各发布一次（奖励单位：万新台币，按物价调整）
    dynTasks: [
      { id: 'tpd1', from: [1995, 1], to: [2010, 12], type: 'connect', months: 36, reward: 40000, title: '新庄进城', desc: '新庄的通勤者每天挤过淡水河上的桥梁。连接新庄、三重与台北车站。', anchors: [anchor('新庄', 25.0360, 121.4520, 3), anchor('三重', 25.0635, 121.4880, 3), anchor('台北车站', 25.0478, 121.5170, 3)] },
      { id: 'tpd2', from: [1998, 1], to: [2015, 12], type: 'connect', months: 36, reward: 35000, title: '新店与景美', desc: '连接新店、景美与公馆。', anchors: [anchor('新店', 24.9580, 121.5375, 3), anchor('景美', 24.9927, 121.5410, 3), anchor('公馆', 25.0147, 121.5343, 3)] },
      { id: 'tpd3', from: [2008, 3], to: [2018, 12], type: 'connect', months: 30, reward: 30000, title: '南港展览馆接驳', desc: '展会期间人潮集中。连接南港展览馆与市政府。', anchors: [anchor('南港展览馆', 25.0560, 121.6175, 3), anchor('市政府', 25.0410, 121.5650, 3)] },
      { id: 'tpd4', from: [2011, 1], to: [2025, 12], type: 'connect', months: 48, reward: 60000, title: '新北环状走廊', desc: '新北市改制后，河西各区之间的往来增多。不经台北车站，连接新庄、板桥、中和与新店。', anchors: [anchor('新庄', 25.0360, 121.4520, 3), anchor('板桥', 25.0140, 121.4637, 3), anchor('中和', 24.9990, 121.4950, 3), anchor('新店', 24.9673, 121.5413, 3)] },
    ],
    taskNote: '历史主题任务参考台北 1990 年起的发展需求（南北与东西主轴、河西卫星城、信义新都心、高铁转乘与花博），不要求按真实捷运线路建设，只需满足目标描述。',
    // 城市策略难题（v2.3，可选挑战）
    scenarios: [
      { id: 'tp-sc1', theme: '台北：盆地与三河', title: '织一张换乘网', type: 'xferHub', from: [1994, 1], to: [2010, 12], months: 72, rewardMonths: 3, target: 4,
        desc: '台北盆地被淡水河、基隆河与新店溪环绕，人口都挤在盆地里，走廊多而短。一条长线覆盖不了，要靠几条线交织、互相换乘：建成 4 座换乘站。',
        tips: ['在台北车站、忠孝复兴这类交汇处安排换乘', '每条新线至少与旧线相交一次', '共站换乘最方便，站外步行 500 米内也能换乘'] },
      { id: 'tp-sc2', theme: '台北：河西卫星城', title: '跨过淡水河进板桥', type: 'budgetConnect', from: [1995, 1], to: [2008, 12], months: 60, rewardMonths: 3, budgetX: 1.2,
        anchors: [['板桥', 3], ['西门', 3], ['台北车站', 3]],
        desc: '板桥、三重等卫星城隔着淡水河，与台北市区之间只有几座拥挤的大桥。用有限预算把板桥接到西门与台北车站。',
        tips: ['过河选最窄处，一次过河', '河西人口密集，站点放在老街中心', '台北车站做换乘，别再绕进市区'] },
    ],
    dataNote: [
      ['真实地理', 'hist', '淡水河、新店溪与基隆河水系、道路与桥梁、铁路、公园与山地、区界与地名来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），为现代数据，按 250 m 网格投影。'],
      ['史实参考', 'hist', '1990 年台北市行政区调整、基隆河截弯取直（1991–1993）、市府迁入信义计划区（1994）、板桥车站（1999）、地标落成与重大活动年份。新生地范围为近似。'],
      ['估算', 'est', '1990 年人口与就业分布、人口增长曲线、出行率、时间价值、造价、票价与运营费用（新台币）。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。铁路与高速铁路不参与乘客出行与运营模拟，车站与松山机场的旅客量为估算、只模拟其市内接驳出行；地面铁路按现代线位阻隔步行（历史上地下化之前的平交道不另作区分）；真实的台北捷运不会自动出现。'],
      ['', '', '模拟结果不得作为真实台北交通规划预测。'],
    ],
    // 线路配色参考台北捷运
    lineColorsNice: ['#c48c31', '#e3002c', '#008659', '#f8b61c', '#0070bd', '#ffdb00', '#8246af', '#77bc1f', '#e5554f', '#00a0e9', '#a3154d', '#6d6e71'],
    places: (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; }),
  };

  const INF = [[1990, 0.04], [1996, 0.02], [2001, 0.005], [2008, 0.02], [2012, 0.01]];
  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'tp', name: '台北', title: '台北 · 1990', sub: '真实地理 · 1990 年起 · 新台币',
    desc: '从 1990 年尚无捷运的台北开始：淡水河、新店溪与基隆河把盆地分成数块，河西的三重、板桥、中和人口稠密，阳明山与盆地周边山地不能开发。路网完全由你规划。',
    facts: [['范围', '34 km × 30 km'], ['起始', '1990 年'], ['人口', '约 533 万（盆地及周边）'], ['货币', '新台币（TWD）'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 2, extent: { from: 1, dx: 16, dy: 16, oldW: 104, oldH: 88, note: '地图四周各扩大约 4 km，覆盖盆地边缘的走廊（淡水、汐止、土城、新店方向）', oldRegionIds: ['yms', 'hills', 'airport', 'guandu', 'newland', 'xinyi', 'xinban', 'zhongzheng', 'oldtown', 'zhongshan', 'daan', 'songshan', 'xinyiq', 'wenshan', 'shilin', 'beitou', 'neihu', 'nangang', 'banqiao', 'sanchong', 'zhongyong', 'xinzhuang', 'xindian', 'tucheng', 'xizhi', 'outer'], oldLandmarkIds: ['tp_longshan', 'tp_office', 'tp_ntu', 'tp_stadium', 'tp_palace', 'tp_xingtian', 'tp_sysmh', 'tp_grand', 'tp_cks', 'tp_tfam', 'tp_twtc', 'tp_station', 'tp_skm', 'tp_cityhall', 'tp_banqiao', 'tp_101', 'tp_arena', 'tp_nangang'] },
    scenario: 'tp-1990',
    region: '中国台湾', tagline: '盆地里的第一条捷运', difficulty: 3, tags: ['无捷运开局', '跨河', '高密度'],
    intro: '1990 年的台北还没有捷运，公车与机车塞满了盆地里的每一条干道。淡水河两岸都住满了人，河西的永和是全台最拥挤的城市之一。你要从零画出整张路网：先打通南北与东西两条主轴，再跨过河去连接三重、板桥与中和。',
    features: [['wave', '三条河流', '淡水河、新店溪与基隆河分隔盆地，过河要建隧道或桥梁']],
    highlights: [[1993, '基隆河截弯取直完工'], [1994, '市政府迁入信义计划区'], [2004, '台北101 落成'], [2007, '台湾高铁通车'], [2010, '台北花博']],
    geo: G, data: data,
    econ: { devOffset: 20, money: 3.5 },   // 出行选择参数：台北 1990 年约对应广州样本 2010 年的发展阶段；时间价值等按新台币换算
    cfg: {
      W: 136, H: 120, START: { y: 1990, m: 1, d: 1, minute: 360 },
      // 工作周：1998 年起隔周休二日、2001 年起全面周休二日（史实）
      workWeek: { sat: [[1990, 1], [1998, 1], [1998.1, 0.5], [2000.9, 0.5], [2001, 0]], school: [[1990, 1], [1998, 1], [1998.1, 0.5], [2000.9, 0.5], [2001, 0]] },
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[1990, 5.33e6], [1995, 5.7e6], [2000, 5.95e6], [2005, 6.1e6], [2010, 6.22e6], [2015, 6.35e6], [2020, 6.42e6], [2040, 6.47e6], [2300, 6.47e6]], histEnd: 2020, jobsRatio: [[1990, 0.5], [2000, 0.52], [2020, 0.55], [2040, 0.56]] }),
      money: { code: 'TWD', unit: '新台币', wan: '万新台币', yi: '亿新台币', sym: 'NT$' },
      econBase: 1990,
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 150000, surface: 25000, elevated: 60000 },
        riverPerKm: { underground: 80000, surface: 60000, elevated: 60000 },   // 淡水河、新店溪、基隆河：河底隧道 / 跨河桥梁附加
        hillPerKm: 50000, protectedPerKm: 25000,
        station: { underground: { S: 60000, M: 100000, L: 160000 }, elevated: { S: 30000, M: 50000, L: 80000 }, surface: { S: 18000, M: 30000, L: 45000 } },
        demolishPerCell: 150000,
        inflation: INF,
      }),
      ops: Object.assign({}, CM.CFG.ops, { carKmCost: 0.004, stationDaily: { S: 6, M: 10, L: 18 }, inflation: INF }),
      fareDefault: { mode: 'flat', flat: 20 }, fareRange: { min: 0, max: 80, step: 1, scale: true },
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 1600000, grantBase: [[1990, 80000], [1996, 100000], [2000, 110000], [2010, 130000], [2020, 150000], [2050, 220000]], debtLimit: -1000000, rewardScale: 5.3,
        // 新台币债券：1990 年代初利率较高，2000 年代起长期低息
        bonds: { local: { rate: [[1990, 0.095], [1995, 0.07], [2000, 0.055], [2002, 0.03], [2005, 0.022], [2010, 0.015], [2020, 0.008], [2050, 0.015]], quotaMonths: 6, capMonths: 30 }, ct: { spread: 0.015, quotaMonths: 4, capMonths: 18 }, term6: 0.003 } }),
      // 城市经济（macro.js）：1990 年地图范围 GDP 约 1.35 万亿新台币（估算，台北盆地约占全台人口四分之一、产出约三成）；
      // 电子与出口产业比重高，对全球科技需求变化敏感；亚洲金融危机期间受冲击较小
      macro: {
        area: '地图范围（台北盆地：台北市与新北市沿河各区）', region: '中国台湾',
        gdp0: 143900000, revRatio: [[1990, 0.2], [2000, 0.16], [2010, 0.14], [2020, 0.15], [2040, 0.15]], revElastic: 1.4,
        prod: [[1990, 0.055], [1997, 0.05], [2000, 0.04], [2010, 0.03], [2020, 0.025], [2030, 0.018], [2050, 0.012], [2080, 0.01]],
        infl: 'tw', longRun: { infl: 0.015 }, histEnd: 2020, ref: 'tw',
        struct: { trade: 0.75, fin: 0.45, ind: 0.65, tour: 0.35, prop: 0.55 },
        events: [
          { id: 'tw1990', y: 1990, m: 2 },
          { id: 'asia1997', y: 1997, m: 7, scale: 0.35, desc: '周边货币大幅贬值，台湾凭借外汇储备与较低外债受冲击相对较小，出口与股市仍有波动。' },
          { id: 'quake1999', y: 1999, m: 9 },
          { id: 'dotcom2001', y: 2001, m: 3, lv: [-0.035, -0.02, -0.008, 0], desc: '全球电子产品需求骤降，台湾经济出现数十年来的首次负增长。' },
          { id: 'sars2003', y: 2003, m: 4, scale: 0.7 },
          { id: 'gfc2008', y: 2008, m: 9 },
          { id: 'covid2020', y: 2020, m: 1, scale: 0.2, desc: '疫情初期防控较早，出口与电子产业需求旺盛，经济仍保持增长。', fx: { demand: { lz: 0.9, hub: 0.4, months: 12, fade: 1 } } },
        ],
      },
    },
    cam: { cx: 66, cy: 66, zoom: 18 },
  });
})(window.CM);
