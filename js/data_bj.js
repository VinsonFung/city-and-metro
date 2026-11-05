'use strict';
// 北京 · 1990 场景（v2.4）。地理来自 OpenStreetMap（geo_bj.js，现代数据），本文件补充 1990 年起的区域开放（按区与街道划分）、环路与快速路
// 通车年份、人口就业中心、地标、重要设施、历史事件、本地任务与人民币经营参数。坐标单位为格（250 m），用 llW(纬度, 经度)（WGS-84）换算。
// 开局接管 1 号线（苹果园—复兴门）与环线（2 号线），与东京开局接管银座线相同。不收录任何军事设施与军用机场（西郊、南苑），
// 地理数据生成时已剔除军事用地范围内的地名与道路。
// 真实性：环路与快速路通车年份、地铁开通年份（只作史实背景，不会自动建成）、中关村与 CBD 开发、亚运会与奥运会、地标落成年份为史实参考；
// 1990 年人口与就业分布、增长曲线、造价、票价与拨款为估算；2020 年之后为模拟。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.bj; if (!G) return;
  const P = G.proj;
  const llW = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const atW = function (lat, lon, o) { const p = llW(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const anchor = function (name, lat, lon, r) { const p = llW(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };
  const poly = function (pts) { return pts.map(function (p) { return llW(p[0], p[1]); }); };
  // 开局线路的车站：先按 OSM 同名地铁站的位置（相距 1.5 km 以内），找不到时用这里给的坐标
  const ST = {}; for (const p of G.places || []) if (p[3] === 0 && !ST[p[0]]) ST[p[0]] = p;
  const st = function (name, lat, lon, size, year) { const p = llW(lat, lon), q = ST[name]; const use = q && Math.hypot(q[1] - p[0], q[2] - p[1]) < 6 ? [q[1], q[2]] : p; return [name, use[0], use[1], size || 'M', year]; };

  // 首都国际机场（民用；跑道按 OSM，范围为近似）：用地不开发，范围内可以地下设站
  const shoudu = poly([[40.1000, 116.5650], [40.1000, 116.6230], [40.0560, 116.6230], [40.0440, 116.6100], [40.0440, 116.5850], [40.0600, 116.5650]]);
  // 故宫（世界文化遗产）：不可开发，地下也不设站（风景区规则）
  const gugong = poly([[39.9240, 116.3905], [39.9240, 116.4033], [39.9125, 116.4033], [39.9125, 116.3905]]);

  const data = {
    city: '北京', terrainRevision: 1, riverName: '永定河', hsrYear: 2008,
    stages: [[1999, '亚运时代'], [2004, '扩张与申奥'], [2009, '奥运建设期'], [2017, '网络化时期']], stageLast: '疏解与副中心时期',
    eras: [
      { id: 'bj-e1', from: 1990, name: '亚运时代', tag: '史实',
        summary: '史实：1990 年 9 月第十一届亚运会在北京举行，亚运村与奥林匹克体育中心在北四环外建成；地铁只有 1 号线（苹果园—复兴门）与环线（2 号线），二环、三环陆续贯通。估算：旧城人口趋于饱和，朝阳、海淀与丰台的单位大院和新建小区成为主要的新增居住地。',
        grow: { pop: { jiucheng: 0.6, chaoyang: 1.3, haidian: 1.2, fengtai: 1.2, yayun: 1.4 }, jobs: { jiucheng: 1.1, cbd: 1.2, zgc: 1.2 } },
        demand: { decayHW: 0.9 }, corridors: [{ a: 'jiucheng', b: 'haidian', f: 1.1 }, { a: 'jiucheng', b: 'chaoyang', f: 1.1 }] },
      { id: 'bj-e2', from: 1999, name: '扩张与申奥', tag: '史实',
        summary: '史实：1999 年复八线通车，1 号线贯通长安街（史实背景，不会自动建成）；1999 年中关村科技园区设立；回龙观、天通苑等大型经济适用房社区开工；2001 年北京申奥成功，四环、五环相继通车。估算：岗位向中关村、上地与 CBD 集中，北部新建大社区带来很长的进城通勤。',
        grow: { pop: { jiucheng: 0.5, changping: 1.8, wangjing: 1.6, chaoyang: 1.3, fengtai: 1.2 }, jobs: { zgc: 1.8, shangdi: 1.8, cbd: 1.6, jiucheng: 0.9 } },
        relocate: { pop: { jiucheng: 0.0004 } },
        demand: { decayHW: 1.05 },
        corridors: [{ a: 'changping', b: 'shangdi', f: 1.2 }, { a: 'changping', b: 'jiucheng', f: 1.1 }, { a: 'wangjing', b: 'cbd', f: 1.15 }],
        goals: [{ id: 'bj-g1', type: 'connect', months: 48, reward: 45000, title: '回龙观到上地', desc: '回龙观的居民大多在上地、中关村的科技企业上班。用地铁连接回龙观与上地。', anchors: [anchor('回龙观', 40.0700, 116.3350, 4), anchor('上地', 40.0330, 116.3190, 3)] }] },
      { id: 'bj-e3', from: 2004, name: '奥运建设期', tag: '史实',
        summary: '史实：2007 年 5 号线通车，2008 年 7 月 10 号线一期、8 号线奥运支线与机场线通车，北京南站启用（史实背景）；8 月第二十九届奥运会在北京举行。估算：奥林匹克公园、望京与 CBD 快速成长，东部与北部的通勤流向中心汇聚。',
        grow: { pop: { changping: 1.6, wangjing: 1.4, tongzhou: 1.3, aoyun: 1.4, jiucheng: 0.5 }, jobs: { cbd: 1.8, aoyun: 1.5, zgc: 1.5, shangdi: 1.4, jiucheng: 0.85 } },
        relocate: { pop: { jiucheng: 0.0005 } },
        demand: { lz: 1.05, decayHW: 1.1, hub: 1.05 },
        corridors: [{ a: 'tongzhou', b: 'cbd', f: 1.2 }, { a: 'aoyun', b: 'jiucheng', f: 1.1 }, { a: 'changping', b: 'shangdi', f: 1.15 }],
        goals: [{ id: 'bj-g2', type: 'connect', months: 48, reward: 50000, title: '通州到国贸', desc: '通州的居民每天沿京通快速路进城，国贸是最大的目的地。用地铁连接通州与国贸。', anchors: [anchor('通州北苑', 39.9050, 116.6230, 4), anchor('国贸', 39.9085, 116.4600, 3)] }] },
      { id: 'bj-e4', from: 2009, name: '网络化时期', tag: '史实',
        summary: '史实：2009 年起 4 号线、大兴线、亦庄线、9 号线、6 号线、14 号线等相继通车（史实背景），线网从几条线扩展为网络；亦庄经济技术开发区与望京成为新的就业中心。估算：职住分离加剧，长距离通勤与换乘客流快速增长，老城继续疏解。',
        grow: { pop: { tongzhou: 1.5, daxing: 1.5, changping: 1.3, fengtai: 1.2, jiucheng: 0.5 }, jobs: { cbd: 1.5, wangjing: 1.5, daxing: 1.6, zgc: 1.3, jiucheng: 0.8 } },
        relocate: { pop: { jiucheng: 0.0005 }, jobs: { jiucheng: 0.0003 } },
        demand: { sh: 1.05, decayHW: 1.15, hub: 1.1 },
        corridors: [{ a: 'daxing', b: 'cbd', f: 1.15 }, { a: 'tongzhou', b: 'cbd', f: 1.2 }, { a: 'wangjing', b: 'cbd', f: 1.1 }],
        goals: [{ id: 'bj-g3', type: 'connect', months: 48, reward: 50000, title: '亦庄开发区通勤', desc: '亦庄的工厂与研发中心吸引大量通勤者，他们多住在城南与城东。用地铁连接亦庄与宋家庄。', anchors: [anchor('亦庄', 39.7950, 116.5050, 4), anchor('宋家庄', 39.8460, 116.4280, 3)] }] },
      { id: 'bj-e5', from: 2017, name: '疏解与副中心时期', tag: '史实',
        summary: '史实：2017 年新版城市总体规划提出疏解非首都功能；2019 年城市副中心行政办公区在通州启用、大兴国际机场通航；2022 年北京举办冬奥会。估算：中心城区人口缓慢下降，通州副中心与南部、东部承接新增岗位与人口。',
        grow: { pop: { tongzhou: 1.8, daxing: 1.3, jiucheng: 0.4, haidian: 0.8, chaoyang: 0.9 }, jobs: { tongzhou: 2.0, daxing: 1.3, cbd: 1.2, jiucheng: 0.7 } },
        relocate: { pop: { jiucheng: 0.0006 }, jobs: { jiucheng: 0.0005 } },
        demand: { lz: 1.05, decayHW: 1.15 },
        corridors: [{ a: 'tongzhou', b: 'cbd', f: 1.25 }, { a: 'tongzhou', b: 'jiucheng', f: 1.1 }],
        goals: [{ id: 'bj-g4', type: 'connect', months: 48, reward: 55000, title: '城市副中心', desc: '行政办公区迁到通州后，副中心与中心城区之间往来频繁。用地铁连接副中心与东单。', anchors: [anchor('城市副中心', 39.9050, 116.7300, 4), anchor('东单', 39.9080, 116.4180, 3)] }] },
      { id: 'bj-e6', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '模拟：此后的发展按模型推演，不代表真实历史。估算：副中心与南部继续成长，中心城区保持稳定。',
        grow: { pop: { tongzhou: 1.4, daxing: 1.2, jiucheng: 0.6 }, jobs: { tongzhou: 1.5, daxing: 1.2, jiucheng: 0.8 } },
        demand: { lz: 1.08, decayHW: 1.15 }, corridors: [{ a: 'tongzhou', b: 'cbd', f: 1.2 }] },
    ],
    briefing: {
      inherit: true,
      lead: '1990 年的北京，地铁只有两条：1 号线从苹果园到复兴门，环线（2 号线）沿二环绕旧城一圈。亚运会就要开幕，三环正在贯通，城市即将向四面八方扩张。',
      modes: [['train', '地铁：1 号线与环线（由你接管）', '苹果园—复兴门的 1 号线与环线（2 号线）共 29 站已在运营，在复兴门换乘。票款与运营费照常结算，可以延长、改建或拆除，不收历史建设费；真实的复八线、13 号线等不会自动出现。'], ['bus', '公交与自行车', '自行车是最主要的通勤方式，公交线路拥挤，长安街上车流与自行车流交织。'], ['road', '环路', '二环快速路正在改造，三环 1994 年全线贯通，四环、五环要到 2000 年代才通车。'], ['rail', '铁路', '北京站与永定门站（后来的北京南站）承担对外铁路交通，北京西站 1996 年启用。列车本身不参与模拟，车站会产生市内接驳出行。']],
    },
    airport: null,
    // 首都国际机场跑道（民用，位置按 OSM）：东跑道 18L/36R 1958 年建成、西跑道 18R/36L 1999 年、第三跑道 01/19 2008 年（年份为近似）
    runways: [{ a: llW(40.0555, 116.6001), b: llW(40.0895, 116.5948), from: 1958 }, { a: llW(40.1021, 116.5696), b: llW(40.0734, 116.5742), from: 1999 }, { a: llW(40.0929, 116.6123), b: llW(40.0589, 116.6176), from: 2008 }],
    initialNetwork: {
      year: 1990, note: '1 号线（1971 年起分段通车）与环线（1984 年起分段通车、1987 年成环）',
      lines: [
        { name: '1 号线', color: '#c23a30', type: 'underground', year: 1971, stations: [
          st('苹果园', 39.9269, 116.1776, 'M', 1971), st('古城', 39.9077, 116.1904, 'S', 1971), st('八角游乐园', 39.9074, 116.2124, 'S', 1971),
          st('八宝山', 39.9073, 116.2360, 'S', 1971), st('玉泉路', 39.9074, 116.2532, 'S', 1971), st('五棵松', 39.9074, 116.2741, 'M', 1971),
          st('万寿路', 39.9074, 116.2945, 'S', 1971), st('公主坟', 39.9071, 116.3097, 'M', 1971), st('军事博物馆', 39.9074, 116.3216, 'M', 1971),
          st('木樨地', 39.9073, 116.3378, 'S', 1971), st('南礼士路', 39.9073, 116.3524, 'S', 1971), st('复兴门', 39.9070, 116.3568, 'L', 1971)] },
        { name: '2 号线', color: '#0b5aa2', type: 'underground', year: 1984, loop: true, stations: [
          st('西直门', 39.9406, 116.3554, 'L', 1984), st('车公庄', 39.9322, 116.3542, 'M', 1984), st('阜成门', 39.9234, 116.3563, 'M', 1984),
          st('复兴门', 39.9070, 116.3568, 'L', 1984), st('长椿街', 39.8992, 116.3634, 'M', 1971), st('宣武门', 39.8993, 116.3747, 'M', 1971),
          st('和平门', 39.8998, 116.3843, 'M', 1971), st('前门', 39.9000, 116.3977, 'L', 1971), st('崇文门', 39.9010, 116.4170, 'M', 1971),
          st('北京站', 39.9045, 116.4271, 'L', 1971), st('建国门', 39.9086, 116.4352, 'L', 1984), st('朝阳门', 39.9244, 116.4347, 'M', 1984),
          st('东四十条', 39.9339, 116.4339, 'M', 1984), st('东直门', 39.9410, 116.4338, 'L', 1984), st('雍和宫', 39.9493, 116.4169, 'M', 1984),
          st('安定门', 39.9495, 116.4083, 'M', 1984), st('鼓楼大街', 39.9494, 116.3939, 'M', 1984), st('积水潭', 39.9488, 116.3725, 'M', 1984)] },
      ],
    },
    regions: [
      { id: 'gugong', name: '故宫', poly: gugong, scenic: true, open: null, lockNote: '世界文化遗产，不可开发，地下也不能设站' },
      { id: 'yiheyuan', name: '颐和园', geo: { park: '颐和园' }, scenic: true, open: null },
      { id: 'yuanmingyuan', name: '圆明园', geo: { park: '圆明园遗址公园' }, scenic: true, open: null },
      { id: 'tiantan', name: '天坛', geo: { park: '天坛公园' }, scenic: true, open: null },
      { id: 'shoudu', name: '首都国际机场', poly: shoudu, open: null, hub: true, lockNote: '民用机场照常运营，用地不开发', note: '重要交通枢纽：范围内可以地下设站与地下穿越' },
      { id: 'cbd', name: 'CBD（国贸·建外）', streets: ['建外街道', '呼家楼街道'], open: 1990, plan: 'cbd', note: '1993 年总体规划提出建设中央商务区，2000 年代大规模建设（史实）' },
      { id: 'zgc', name: '中关村', streets: ['中关村街道', '海淀街道'], open: 1990, plan: 'mix', note: '1988 年起设立北京市新技术产业开发试验区，1999 年成为中关村科技园区（史实）' },
      { id: 'shangdi', name: '上地·清河', streets: ['上地街道', '清河街道', '西三旗街道'], open: 1995, plan: 'ind', note: '1990 年代上地信息产业基地建设（史实）' },
      { id: 'aoyun', name: '奥林匹克公园', streets: ['奥运村街道'], open: 2002, plan: 'mix', note: '2002 年起建设奥林匹克公园（史实）' },
      { id: 'yayun', name: '亚运村', streets: ['亚运村街道', '大屯街道'], open: 1990, plan: 'res', note: '1990 年亚运会运动员村（史实）' },
      { id: 'wangjing', name: '望京', streets: ['望京街道'], open: 1996, plan: 'res', pop: 7.4e6, note: '1990 年代后期望京建成大型居住区（史实）' },
      { id: 'jiucheng', name: '旧城（东城·西城）', district: ['东城区', '西城区'], open: 1990, plan: 'oldmix' },
      { id: 'haidian', name: '海淀', district: ['海淀区'], open: 1990, plan: 'mix' },
      { id: 'chaoyang', name: '朝阳', district: ['朝阳区'], open: 1990, plan: 'resind' },
      { id: 'fengtai', name: '丰台', district: ['丰台区'], open: 1990, plan: 'resind' },
      { id: 'shijingshan', name: '石景山', district: ['石景山区'], open: 1990, plan: 'ind' },
      { id: 'changping', name: '回龙观·天通苑（昌平）', district: ['昌平区'], open: 1999, plan: 'res', pop: 8.4e6, note: '1999 年起回龙观、天通苑经济适用房社区建设（史实）' },
      { id: 'tongzhou', name: '通州', district: ['通州区'], open: 1996, plan: 'res', pop: 7.5e6, note: '2015 年起建设城市副中心（史实）' },
      { id: 'daxing', name: '亦庄·大兴', district: ['大兴区'], open: 2000, plan: 'resind', pop: 8.2e6, note: '北京经济技术开发区（亦庄）1992 年设立（史实）' },
      { id: 'shunyi', name: '顺义（机场周边）', district: ['顺义区'], open: 2005, plan: 'res', pop: 1.05e7 },
      { id: 'mentougou', name: '门头沟', district: ['门头沟区'], open: 2008, plan: 'res', pop: 1.2e7 },
    ],
    defaultRegion: { id: 'outer', name: '外围地区', open: 2010, plan: 'res', pop: 1.25e7 },
    plans: CM.DATA.plans,
    // 1990 年人口与就业中心（估算，人/km²；r 约为影响半径 km）
    centers: [
      atW(39.9140, 116.4110, { pop: 30000, jobs: 60000, r: 1.2 }),   // 王府井、东单
      atW(39.9100, 116.3700, { pop: 30000, jobs: 50000, r: 1.2 }),   // 西单、复兴门内
      atW(39.8960, 116.3960, { pop: 36000, jobs: 30000, r: 1.1 }),   // 前门、大栅栏
      atW(39.9280, 116.4250, { pop: 32000, jobs: 25000, r: 1.2 }),   // 东四、朝阳门内
      atW(39.9320, 116.3700, { pop: 30000, jobs: 22000, r: 1.2 }),   // 西四、新街口
      atW(39.8850, 116.4150, { pop: 28000, jobs: 15000, r: 1.3 }),   // 崇文门外、天坛北
      atW(39.8870, 116.3750, { pop: 30000, jobs: 15000, r: 1.2 }),   // 宣武门外、菜市口
      atW(39.9080, 116.4500, { pop: 15000, jobs: 30000, r: 1.2 }),   // 建国门外
      atW(39.9330, 116.4550, { pop: 15000, jobs: 12000, r: 1.3 }),   // 三里屯、东直门外
      atW(39.9800, 116.3150, { pop: 18000, jobs: 22000, r: 1.6 }),   // 中关村、海淀镇
      atW(39.9070, 116.2900, { pop: 15000, jobs: 12000, r: 1.5 }),   // 公主坟、五棵松
      atW(39.9650, 116.4100, { pop: 22000, jobs: 12000, r: 1.3 }),   // 和平里、安贞
      atW(39.8600, 116.2900, { pop: 10000, jobs: 9000, r: 1.5 }),    // 丰台
      atW(39.9100, 116.2000, { pop: 9000, jobs: 16000, r: 1.5 }),    // 石景山、首钢
      atW(39.9950, 116.4050, { pop: 8000, jobs: 5000, r: 1.2 }),     // 亚运村
      atW(39.9050, 116.6550, { pop: 8000, jobs: 6000, r: 1.5 }),     // 通州镇
      atW(39.9700, 116.4950, { pop: 9000, jobs: 15000, r: 1.3 }),    // 酒仙桥电子城
      atW(39.8650, 116.4300, { pop: 6000, jobs: 3000, r: 1.0 }),     // 方庄
    ],
    rural: { pop: 500, jobs: 120 },
    // 环路与快速路通车年份（名称前缀匹配；1990 年已有的道路按所在区域开放年份出现）。环路按全线贯通的年份（近似），部分快速路为近似年份
    roadYears: {
      '北二环': 1992, '东二环': 1992, '南二环': 1992, '西二环': 1992,
      '北三环': 1994, '东三环': 1994, '南三环': 1994, '西三环': 1994,
      '北四环': 2001, '东四环': 2001, '南四环': 2001, '西四环': 2001,
      '北五环': 2003, '东五环': 2003, '南五环': 2003, '西五环': 2003,
      '首都机场高速': 1993, '机场高速': 1993, '机场第二高速': 2008, '机场北线高速': 2009, '京通快速路': 1996, '京哈高速': 1999, '京沈高速': 1999,
      '京承高速': 2002, '京藏高速': 1998, '京开高速': 1996, '京津塘高速': 1993, '京津高速': 2008, '京港澳高速': 1987, '京石高速': 1987, '京新高速': 2008,
      '平安大街': 1999, '两广路': 1999, '广渠路': 2009, '莲花池东路': 1998, '学院南路': 1999, '安立路': 1990, '万泉河路': 1997, '姚家园路': 2010,
    },
    bridgeYears: {}, bridgeDefaultYear: 1980,
    simRoads: [],
    landmarks: [
      Object.assign(atW(39.9087, 116.3975), { id: 'bj_tam', name: '天安门', w: 120, d: 40, year: 1651, kind: 'traditional' }),
      Object.assign(atW(39.9163, 116.3972), { id: 'bj_gugong', name: '故宫', w: 750, d: 960, year: 1420, kind: 'palace' }),
      Object.assign(atW(39.8822, 116.4066), { id: 'bj_qnd', name: '天坛祈年殿', w: 90, d: 90, year: 1420, kind: 'temple' }),
      Object.assign(atW(39.9481, 116.4168), { id: 'bj_yonghe', name: '雍和宫', w: 120, d: 400, year: 1744, kind: 'temple' }),
      Object.assign(atW(39.9420, 116.3907), { id: 'bj_gulou', name: '钟鼓楼', w: 60, d: 140, year: 1420, kind: 'traditional' }),
      Object.assign(atW(39.9183, 116.3897), { id: 'bj_baita', name: '北海白塔', w: 40, d: 40, year: 1651, kind: 'pagoda', h: 36 }),
      Object.assign(atW(39.9995, 116.2755), { id: 'bj_fxg', name: '颐和园佛香阁', w: 60, d: 60, year: 1891, kind: 'pagoda', h: 41 }),
      Object.assign(atW(39.9055, 116.3970), { id: 'bj_museum', name: '中国国家博物馆', w: 300, d: 200, year: 1959, kind: 'museum' }),
      Object.assign(atW(39.9024, 116.4272), { id: 'bj_bjz', name: '北京站', w: 220, d: 120, year: 1959, kind: 'rail' }),
      Object.assign(atW(39.8949, 116.3212), { id: 'bj_west', name: '北京西站', w: 500, d: 200, year: 1996, kind: 'rail' }),
      Object.assign(atW(39.8652, 116.3786), { id: 'bj_south', name: '北京南站', w: 500, d: 350, year: 2008, kind: 'rail', style: 'round' }),
      Object.assign(atW(39.9442, 116.3533), { id: 'bj_north', name: '北京北站', w: 260, d: 120, year: 1905, kind: 'rail' }),
      Object.assign(atW(39.9917, 116.3070), { id: 'bj_pku', name: '北京大学', w: 1200, d: 900, year: 1952, kind: 'campus', style: 'palace' }),
      Object.assign(atW(40.0030, 116.3260), { id: 'bj_thu', name: '清华大学', w: 1600, d: 1300, year: 1911, kind: 'campus' }),
      Object.assign(atW(39.9205, 116.3008), { id: 'bj_tvtower', name: '中央广播电视塔', w: 60, d: 60, year: 1992, kind: 'tvtower', style: 'needle', h: 405 }),
      Object.assign(atW(39.9136, 116.4613), { id: 'bj_jg', name: '京广中心', w: 60, d: 60, year: 1990, kind: 'skyscraper', h: 208 }),
      Object.assign(atW(39.9090, 116.4590), { id: 'bj_wtc3', name: '国贸三期', w: 70, d: 70, year: 2010, kind: 'skyscraper', h: 330 }),
      Object.assign(atW(39.9152, 116.4646), { id: 'bj_cctv', name: '中央电视台总部大楼', w: 160, d: 160, year: 2012, kind: 'skyscraper', h: 234 }),
      Object.assign(atW(39.9118, 116.4590), { id: 'bj_citic', name: '中信大厦', w: 78, d: 78, year: 2018, kind: 'skyscraper', h: 528 }),
      Object.assign(atW(39.9930, 116.3964), { id: 'bj_nest', name: '国家体育场', w: 330, d: 220, year: 2008, kind: 'stadium' }),
      Object.assign(atW(39.9930, 116.3880), { id: 'bj_cube', name: '国家游泳中心', w: 177, d: 177, year: 2008, kind: 'box' }),
      Object.assign(atW(39.9045, 116.3893), { id: 'bj_ncpa', name: '国家大剧院', w: 212, d: 144, year: 2007, kind: 'dome', style: 'white' }),
      Object.assign(atW(39.9300, 116.4470), { id: 'bj_gti', name: '北京工人体育场', w: 260, d: 220, year: 1959, kind: 'stadium' }),
      Object.assign(atW(39.9986, 116.3838), { id: 'bj_cnc', name: '国家会议中心', w: 400, d: 150, year: 2008, kind: 'conference' }),
      Object.assign(atW(39.9405, 116.3380), { id: 'bj_expo', name: '北京展览馆', w: 200, d: 120, year: 1954, kind: 'palace', style: 'spire' }),
      Object.assign(atW(39.9070, 116.3170), { id: 'bj_csmt', name: '中华世纪坛', w: 120, d: 120, year: 2000, kind: 'memorial' }),
      Object.assign(atW(39.9930, 116.4740), { id: 'bj_wjsoho', name: '望京SOHO', w: 80, d: 80, year: 2014, kind: 'skyscraper', h: 200 }),
      Object.assign(atW(39.8580, 116.6750), { id: 'bj_universal', name: '北京环球度假区', w: 900, d: 700, year: 2021, kind: 'themepark', style: 'castle' }),
      Object.assign(atW(39.8669, 116.4881), { id: 'bj_happy', name: '北京欢乐谷', w: 500, d: 400, year: 2006, kind: 'themepark' }),
    ],
    // 重要设施（见 facility.js）：位置与启用年份为史实参考（位置近似），规模为估算。
    // 首都机场位于图内东北角（航站区设枢纽）；大兴国际机场 2019 年 9 月通航，在地图南缘以南约 35 km，设接驳口
    facilities: [
      { id: 'bj_pek', n: '首都国际机场', t: 'air', at: llW(40.0790, 116.6030), pax: [[1990, 0.25], [2000, 0.8], [2008, 2.2], [2019, 4], [2030, 4.2]], note: '首都国际机场 1958 年建成，1980 年、1999 年、2008 年先后启用新航站楼。需求点设在航站区。' },
      { id: 'bj_pkx', n: '大兴国际机场（南部接驳）', t: 'air', ext: ['S', 35], at: llW(39.7520, 116.4100), y0: [2019, 9], pax: [[2019.7, 0.5], [2022, 1.5], [2030, 3]], note: '大兴国际机场 2019 年 9 月通航，在地图南缘以南约 35 km。此处为大兴机场高速与机场线方向出图的接驳点。' },
      { id: 'bj_bjz', n: '北京站', t: 'rail', lm: 'bj_bjz', pax: [[1990, 8], [2000, 9], [2010, 8], [2019, 7]] },
      { id: 'bj_west', n: '北京西站', t: 'rail', lm: 'bj_west', y0: [1996, 1], pax: [[1996, 4], [2005, 9], [2019, 11], [2030, 11]] },
      { id: 'bj_south', n: '北京南站', t: 'rail', lm: 'bj_south', y0: [2008, 8], pax: [[2008.6, 3], [2012, 8], [2019, 10], [2030, 10]], note: '2008 年 8 月京津城际铁路开通，北京南站启用。' },
      { id: 'bj_north', n: '北京北站', t: 'rail', lm: 'bj_north', pax: [[1990, 1], [2009, 1.5], [2019, 3]] },
      { id: 'bj_pku', n: '北京大学', t: 'uni', lm: 'bj_pku', w: 0.035 },
      { id: 'bj_thu', n: '清华大学', t: 'uni', lm: 'bj_thu', w: 0.035 },
      { id: 'bj_ruc', n: '中国人民大学', t: 'uni', at: llW(39.9700, 116.3130), w: 0.02 },
      { id: 'bj_bnu', n: '北京师范大学', t: 'uni', at: llW(39.9620, 116.3660), w: 0.02 },
      { id: 'bj_buaa', n: '北京航空航天大学', t: 'uni', at: llW(39.9810, 116.3480), w: 0.02 },
      { id: 'bj_bit', n: '北京理工大学', t: 'uni', at: llW(39.9590, 116.3160), w: 0.015 },
      { id: 'bj_bupt', n: '北京邮电大学', t: 'uni', at: llW(39.9610, 116.3560), w: 0.012 },
      { id: 'bj_bjtu', n: '北京交通大学', t: 'uni', at: llW(39.9454, 116.3372), w: 0.012 },
      { id: 'bj_muc', n: '中央民族大学', t: 'uni', at: llW(39.9500, 116.3220), w: 0.01 },
      { id: 'bj_xiehe', n: '北京协和医院', t: 'hosp', at: llW(39.9130, 116.4150), w: 0.06 },
      { id: 'bj_pkuh1', n: '北京大学第一医院', t: 'hosp', at: llW(39.9300, 116.3780), w: 0.04 },
      { id: 'bj_pkuh', n: '北京大学人民医院', t: 'hosp', at: llW(39.9370, 116.3540), w: 0.04 },
      { id: 'bj_pkuh3', n: '北京大学第三医院', t: 'hosp', at: llW(39.9820, 116.3570), w: 0.045 },
      { id: 'bj_cyh', n: '北京朝阳医院', t: 'hosp', at: llW(39.9240, 116.4510), w: 0.04 },
      { id: 'bj_yy', n: '北京友谊医院', t: 'hosp', at: llW(39.8830, 116.3940), w: 0.035 },
      { id: 'bj_zr', n: '中日友好医院', t: 'hosp', at: llW(39.9730, 116.4270), y0: 1984, w: 0.04 },
      { id: 'bj_tt', n: '北京天坛医院', t: 'hosp', at: llW(39.8400, 116.4080), w: 0.04 },
      { id: 'bj_tr', n: '北京同仁医院', t: 'hosp', at: llW(39.9010, 116.4180), w: 0.035 },
      { id: 'bj_wfj', n: '王府井', t: 'shop', at: llW(39.9140, 116.4110), p: { sh: 0.7, lz: 0.3 }, w: 0.06 },
      { id: 'bj_xd', n: '西单', t: 'shop', at: llW(39.9080, 116.3740), w: 0.05 },
      { id: 'bj_qm', n: '前门大栅栏', t: 'shop', at: llW(39.8960, 116.3960), p: { sh: 0.5, lz: 0.5 }, w: 0.03 },
      { id: 'bj_slt', n: '三里屯', t: 'shop', at: llW(39.9340, 116.4550), y0: 2008, p: { sh: 0.5, lz: 0.5 }, w: [[2008, 0.015], [2015, 0.035]] },
      { id: 'bj_zgcs', n: '中关村商圈', t: 'shop', at: llW(39.9830, 116.3150), w: 0.03 },
      { id: 'bj_wdk', n: '五道口', t: 'shop', at: llW(39.9920, 116.3380), y0: 2003, w: 0.015 },
      { id: 'bj_gmall', n: '国贸商城', t: 'shop', at: llW(39.9090, 116.4600), w: 0.025 },
      { id: 'bj_cbd', n: 'CBD（国贸）', t: 'cbd', at: llW(39.9110, 116.4560), w: [[1990, 0.008], [2000, 0.02], [2010, 0.04]] },
      { id: 'bj_fin', n: '金融街', t: 'cbd', at: llW(39.9140, 116.3600), y0: 1993, w: [[1993, 0.005], [2005, 0.03]] },
      { id: 'bj_zgc', n: '中关村科技园', t: 'cbd', at: llW(39.9800, 116.3100), w: [[1990, 0.005], [2000, 0.02], [2015, 0.03]] },
      { id: 'bj_sd', n: '上地信息产业基地', t: 'cbd', at: llW(40.0420, 116.3060), y0: 1995, w: [[1995, 0.004], [2010, 0.025]] },
      { id: 'bj_wj', n: '望京商务区', t: 'cbd', at: llW(39.9960, 116.4740), y0: 2005, w: [[2005, 0.005], [2015, 0.02]] },
      { id: 'bj_yz', n: '亦庄开发区', t: 'cbd', at: llW(39.7950, 116.5050), y0: 1994, w: [[1994, 0.003], [2010, 0.02]] },
      { id: 'bj_fzx', n: '城市副中心行政办公区', t: 'cbd', at: llW(39.9050, 116.7300), y0: [2019, 1], w: [[2019, 0.01], [2025, 0.02]] },
      { id: 'bj_gugong', n: '故宫', t: 'scenic', lm: 'bj_gugong', w: 0.05 },
      { id: 'bj_tiantan', n: '天坛', t: 'scenic', at: llW(39.8820, 116.4100), r: 1.5, w: 0.025 },
      { id: 'bj_yhy', n: '颐和园', t: 'scenic', at: llW(39.9990, 116.2750), r: 2, w: 0.03 },
      { id: 'bj_ymy', n: '圆明园', t: 'scenic', at: llW(40.0080, 116.2980), r: 1.8, w: 0.015 },
      { id: 'bj_bh', n: '北海与什刹海', t: 'scenic', at: llW(39.9300, 116.3850), w: 0.025 },
      { id: 'bj_nlgx', n: '南锣鼓巷', t: 'scenic', at: llW(39.9370, 116.4030), y0: 2006, w: 0.015 },
      { id: 'bj_yonghe', n: '雍和宫', t: 'scenic', lm: 'bj_yonghe', w: 0.01 },
      { id: 'bj_olypark', n: '奥林匹克公园', t: 'scenic', at: llW(39.9970, 116.3920), y0: 2008, w: [[2008, 0.03], [2012, 0.02]] },
      { id: 'bj_universal', n: '北京环球度假区', t: 'scenic', lm: 'bj_universal', w: 0.03 },
      { id: 'bj_happy', n: '北京欢乐谷', t: 'scenic', lm: 'bj_happy', w: 0.012 },
      { id: 'bj_cyp', n: '朝阳公园', t: 'park', at: llW(39.9420, 116.4800), w: 0.01 },
      { id: 'bj_yyt', n: '玉渊潭公园', t: 'park', at: llW(39.9160, 116.3200), w: 0.01 },
      { id: 'bj_trt', n: '陶然亭公园', t: 'park', at: llW(39.8736, 116.3751), w: 0.008 },
      { id: 'bj_olyf', n: '奥林匹克森林公园', t: 'park', at: llW(40.0208, 116.3855), y0: 2008, w: 0.012 },
      { id: 'bj_nest', n: '国家体育场', t: 'stadium', lm: 'bj_nest', w: [[2008, 0.012], [2008.6, 0.04], [2008.7, 0.012]], note: '2008 年 8 月奥运会开闭幕式在此举行。' },
      { id: 'bj_gti', n: '北京工人体育场', t: 'stadium', lm: 'bj_gti', w: 0.01 },
      { id: 'bj_wks', n: '五棵松体育馆', t: 'stadium', at: llW(39.9070, 116.2740), y0: 2008, w: 0.006 },
      { id: 'bj_sdtyg', n: '首都体育馆', t: 'stadium', at: llW(39.9388, 116.3212), w: 0.005 },
      { id: 'bj_ao', n: '奥林匹克体育中心', t: 'stadium', at: llW(39.9870, 116.4000), y0: 1990, w: [[1990, 0.008], [1990.7, 0.03], [1990.8, 0.008]], note: '1990 年第十一届亚运会主会场。' },
      { id: 'bj_cnc', n: '国家会议中心', t: 'venue', lm: 'bj_cnc', w: 0.008 },
      { id: 'bj_ciec', n: '中国国际展览中心（三元桥）', t: 'venue', at: llW(39.9620, 116.4510), w: 0.006 },
      { id: 'bj_expo', n: '北京展览馆', t: 'venue', lm: 'bj_expo', w: 0.004 },
      { id: 'bj_ncpa', n: '国家大剧院', t: 'venue', lm: 'bj_ncpa', w: 0.005 },
    ],
    districtLabels: [['东城', ['东城区']], ['西城', ['西城区']], ['朝阳', ['朝阳区']], ['海淀', ['海淀区']], ['丰台', ['丰台区']], ['石景山', ['石景山区']], ['通州', ['通州区']], ['大兴', ['大兴区']], ['昌平', ['昌平区']]],
    // 纪事（只能在末尾追加：已发生记录按序号保存）
    events: [
      { y: 1990, m: 1, tag: '史实', title: '1990 年的北京', desc: '中心城区人口约 630 万；地铁只有 1 号线与环线，自行车是最主要的通勤方式；二环正在改造为快速路，三环尚未贯通。你从这两条线开始经营。' },
      { y: 1990, m: 9, tag: '史实', title: '第十一届亚运会', desc: '亚运会在北京举行，亚运村、奥林匹克体育中心与北四环一带同时建成。', fx: { demand: { lz: 1.2, hub: 1.1, months: 1 }, sat: { v: 1.5, months: 6 } } },
      { y: 1992, m: 9, tag: '史实', title: '二环路全线建成快速路', desc: '北京第一条城市快速环路，沿旧城城墙旧址环绕。' },
      { y: 1994, m: 1, tag: '史实', title: '三环路全线贯通', desc: '三环成为中心城区与近郊之间的主要交通环线。' },
      { y: 1996, m: 1, tag: '史实', title: '北京西站启用', desc: '亚洲规模最大的铁路客运站之一，承担京广、京九方向的客流。', fx: { grow: { region: 'fengtai', jobs: 1.2, years: 4 } } },
      { y: 1999, m: 6, tag: '史实', title: '中关村科技园区设立', desc: '中关村成为国家高新技术产业园区，海淀、上地一带的岗位快速增长。', fx: { grow: { region: 'zgc', jobs: 1.5, years: 6 } } },
      { y: 1999, m: 9, tag: '史实', title: '史实背景：复八线通车', desc: '1 号线向东延伸贯通长安街。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 2001, m: 7, tag: '史实', title: '北京申办 2008 年奥运会成功', desc: '奥运场馆与城市交通建设随之加速。', fx: { grow: { region: 'aoyun', jobs: 1.5, years: 7 } } },
      { y: 2003, m: 4, tag: '史实', title: '非典疫情', desc: '春季非典疫情使出行骤减，学校停课、商场冷清，约三个月后恢复。', fx: { demand: { hw: 0.6, sc: 0.3, sh: 0.5, md: 0.8, lz: 0.3, hub: 0.3, months: 3, fade: 1 }, sat: { v: -1.5, months: 4 } } },
      { y: 2008, m: 7, tag: '史实', title: '史实背景：奥运交通线路通车', desc: '10 号线一期、8 号线奥运支线与机场线通车。本局的地铁由你规划。' },
      { y: 2008, m: 8, tag: '史实', title: '第二十九届奥运会', desc: '奥运会在北京举行，期间实行单双号限行。', fx: { demand: { lz: 1.25, hub: 1.15, hw: 0.95, months: 1 }, sat: { v: 2, months: 6 } } },
      { y: 2015, m: 7, tag: '史实', title: '规划建设北京城市副中心', desc: '通州成为城市副中心，市级机关陆续迁入。', fx: { grow: { region: 'tongzhou', jobs: 1.6, years: 8 } } },
      { y: 2019, m: 9, tag: '史实', title: '大兴国际机场通航', desc: '新机场位于地图以南约 35 km，承担北京的第二个国际航空枢纽。' },
      { y: 2020, m: 1, tag: '史实', title: '新冠肺炎疫情', desc: '春节后出行大幅减少，之后反复，2023 年起逐步恢复。', fx: { demand: { hw: 0.6, sc: 0.3, sh: 0.55, md: 0.8, lz: 0.35, hub: 0.25, months: 4, fade: 1 }, sat: { v: -1.5, months: 6 } } },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后人口、道路和区域变化按模拟规则推演，不代表真实历史。' },
      { y: 2022, m: 2, tag: '史实', title: '北京冬奥会', desc: '北京成为第一座同时举办过夏季与冬季奥运会的城市。', fx: { demand: { lz: 1.1, months: 1 }, sat: { v: 1, months: 4 } } },
    ],
    // 本地历史主题任务：参考北京地铁的发展需求，不要求复刻真实线路走向（奖励单位：万元，1990 年价格）
    histTasks: [
      { id: 'bj1', appear: [1990, 6], deadline: [2000, 12], type: 'connect', reward: 50000, title: '贯通长安街', desc: '1 号线停在复兴门，长安街东段还没有地铁。连接复兴门、西单、王府井、建国门与国贸。', anchors: [anchor('复兴门', 39.9070, 116.3568, 3), anchor('西单', 39.9070, 116.3740, 3), anchor('王府井', 39.9080, 116.4110, 3), anchor('建国门', 39.9086, 116.4352, 3), anchor('国贸', 39.9085, 116.4600, 3)] },
      { id: 'bj2', appear: [1997, 1], deadline: [2003, 12], type: 'connect', reward: 60000, title: '北部新区的城市铁路', desc: '回龙观、上地与望京的居民需要进城。连接西直门、五道口、上地、回龙观与东直门。', anchors: [anchor('西直门', 39.9406, 116.3554, 3), anchor('五道口', 39.9930, 116.3380, 3), anchor('上地', 40.0330, 116.3190, 3), anchor('回龙观', 40.0700, 116.3350, 3), anchor('东直门', 39.9410, 116.4338, 3)] },
      { id: 'bj3', appear: [2000, 1], deadline: [2004, 12], type: 'connect', reward: 45000, title: '通往通州', desc: '通州的居民沿京通快速路进城，连接四惠、管庄与通州北苑。', anchors: [anchor('四惠', 39.9085, 116.4950, 3), anchor('管庄', 39.9090, 116.5950, 3), anchor('通州北苑', 39.9050, 116.6230, 3)] },
      { id: 'bj4', appear: [2002, 1], deadline: [2008, 6], type: 'connect', reward: 60000, title: '南北客运走廊', desc: '天通苑的大型社区与城南都缺少轨道交通。连接天通苑、雍和宫、东单与宋家庄。', anchors: [anchor('天通苑', 40.0750, 116.4130, 3), anchor('雍和宫', 39.9493, 116.4169, 3), anchor('东单', 39.9080, 116.4180, 3), anchor('宋家庄', 39.8460, 116.4280, 3)] },
      { id: 'bj5', appear: [2004, 1], deadline: [2008, 7], type: 'connect', reward: 55000, title: '奥运场馆', desc: '奥运会开幕前，连接奥林匹克公园、北土城与鼓楼大街。', anchors: [anchor('奥林匹克公园', 39.9990, 116.3920, 3), anchor('北土城', 39.9770, 116.3940, 3), anchor('鼓楼大街', 39.9494, 116.3939, 3)] },
      { id: 'bj6', appear: [2004, 1], deadline: [2008, 7], type: 'connect', reward: 55000, title: '机场轨道交通', desc: '奥运会开幕前，连接东直门、三元桥与首都机场航站区。', anchors: [anchor('东直门', 39.9410, 116.4338, 3), anchor('三元桥', 39.9610, 116.4560, 3), anchor('首都机场', 40.0790, 116.6030, 4)] },
      { id: 'bj7', appear: [2006, 1], deadline: [2012, 12], type: 'connect', reward: 50000, title: '北京南站接驳', desc: '京津城际铁路开通后，北京南站的旅客需要进城。连接北京南站、宣武门与西单。', anchors: [anchor('北京南站', 39.8652, 116.3786, 3), anchor('宣武门', 39.8993, 116.3747, 3), anchor('西单', 39.9070, 116.3740, 3)] },
      { id: 'bj8', appear: [2008, 1], deadline: [2013, 12], type: 'coverage', target: 0.35, reward: 70000, title: '地铁覆盖三成五人口', desc: '2013 年底前，步行 15 分钟可到达地铁站的人口不低于全市人口的 35%。' },
      { id: 'bj9', appear: [2014, 1], deadline: [2020, 12], type: 'coverage', target: 0.55, reward: 80000, title: '地铁覆盖过半人口', desc: '2020 年底前，步行 15 分钟可到达地铁站的人口不低于全市人口的 55%。' },
    ],
    dynTasks: [
      { id: 'bjd1', from: [2003, 1], to: [2015, 12], type: 'connect', months: 36, reward: 40000, title: '天通苑的早高峰', desc: '天通苑是亚洲最大的居住区之一，早高峰进城极其拥挤。连接天通苑与立水桥、惠新西街南口。', anchors: [anchor('天通苑', 40.0750, 116.4130, 3), anchor('立水桥', 40.0520, 116.4110, 3), anchor('惠新西街南口', 39.9760, 116.4170, 3)] },
      { id: 'bjd2', from: [2005, 1], to: [2016, 12], type: 'connect', months: 36, reward: 40000, title: '望京到 CBD', desc: '望京的居民大多在 CBD 上班。连接望京、三元桥与国贸。', anchors: [anchor('望京', 39.9980, 116.4690, 3), anchor('三元桥', 39.9610, 116.4560, 3), anchor('国贸', 39.9085, 116.4600, 3)] },
      { id: 'bjd3', from: [2006, 1], to: [2018, 12], type: 'connect', months: 36, reward: 40000, title: '西二旗软件园', desc: '上地、西二旗的科技企业聚集了大量程序员，他们多住在回龙观与清河。连接西二旗、回龙观与清河。', anchors: [anchor('西二旗', 40.0530, 116.3060, 3), anchor('回龙观', 40.0700, 116.3350, 3), anchor('清河', 40.0300, 116.3380, 3)] },
    ],
    taskNote: '历史主题任务参考北京 1990 年起的发展需求（长安街、北部城市铁路、通州、南北走廊、奥运、机场线、北京南站），不要求按真实线路走向建设，只需满足目标描述。',
    // 城市策略难题（v2.4，可选挑战）
    scenarios: [
      { id: 'bj-sc1', theme: '北京：摊大饼的城市', title: '把北部大社区接进城', type: 'regionCov', from: [2003, 1], to: [2018, 12], months: 60, rewardMonths: 3,
        regions: ['changping'], areaName: '回龙观与天通苑', target: 0.4,
        desc: '回龙观与天通苑住了上百万人，岗位却在城里与上地，早高峰进城通勤极长。让这两片大社区接近四成的居民步行就能到地铁站。',
        tips: ['大社区里人最密的中心先设站', '一条南北线串起社区中心，再接到城里的换乘站', '站距可以拉长，提高进城速度'] },
      { id: 'bj-sc2', theme: '北京：环线与放射线', title: '以环串放射', type: 'xferHub', from: [2005, 1], to: [2022, 12], months: 72, rewardMonths: 4, target: 12,
        desc: '北京的道路是一环套一环，地铁也需要环线把放射线串起来，乘客不必都挤进旧城换乘。全网建成 12 座以上的换乘站。',
        tips: ['在三环、四环附近再修一条环线', '环线与每条放射线都相交换乘', '换乘站建成大型站，留足换乘能力'] },
    ],
    dataNote: [
      ['真实地理', 'hist', '河湖水系、道路、铁路、公园、街道边界与地名来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），为现代数据，按 250 m 网格投影；军事用地范围内的地名、绿地名称与小路已剔除，不收录任何军事设施。'],
      ['史实参考', 'hist', '1990 年的 1 号线与环线、环路与快速路通车年份、中关村与 CBD 开发、亚运会与奥运会、北京西站与北京南站启用、城市副中心、地标落成年份。'],
      ['估算', 'est', '1990 年人口与就业分布、人口增长曲线、出行率、时间价值、造价、票价、运营费用与拨款、地图范围 GDP。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。普通铁路不参与乘客出行与运营模拟，只模拟车站的市内接驳出行；真实的北京地铁（除开局接管的两条线）不会自动出现。'],
      ['', '', '模拟结果不得作为真实北京交通规划预测。'],
    ],
    // 线路配色参考北京地铁
    lineColorsNice: ['#c23a30', '#0b5aa2', '#f9e700', '#008e9c', '#a6217f', '#d29700', '#f6c582', '#009b6b', '#8fc31f', '#009bc0', '#ed796b', '#d5a7a1'],
    places: (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; }),
  };
  // 位置校正：与 OSM 地铁站同名的设施与任务锚点，改用车站位置（相距 3 km 以内时；手填坐标的误差可达数百米）
  const nearSt = function (name, x, y) { const p = ST[name.replace(/（.*?）/g, '')]; return p && Math.hypot(p[1] - x, p[2] - y) < 12 ? p : null; };
  for (const f of data.facilities) if (f.at && !f.ext) { const p = nearSt(f.n, f.at[0], f.at[1]); if (p) f.at = [p[1], p[2]]; }
  for (const t of data.histTasks.concat(data.dynTasks)) for (const a of t.anchors || []) { const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }
  for (const er of data.eras) for (const gl of er.goals || []) for (const a of gl.anchors || []) { const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }

  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'bj', name: '北京', title: '北京 · 1990', sub: '真实地理 · 1990 年起 · 人民币 · 已有 1 号线与环线',
    desc: '从 1990 年只有两条地铁的北京开始：你接管 1 号线与环线，城市即将沿着一圈圈环路向外扩张。中关村、CBD、奥运会与城市副中心将陆续到来。',
    facts: [['范围', '51 km × 39 km'], ['起始', '1990 年'], ['人口', '约 630 万'], ['货币', '人民币（元）'], ['既有地铁', '1 号线与环线 29 站'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 1, scenario: 'bj-1990',
    region: '中国内地', tagline: '一环套一环，接管两条线的首都', difficulty: 3, tags: ['已有地铁', '环路', '奥运'],
    intro: '1990 年的北京，地铁只有两条：1 号线从苹果园开到复兴门，环线沿着旧城墙的位置绕城一圈。亚运会就要开幕，自行车流填满长安街。接下来是二环到五环一圈圈向外，中关村、CBD、北部大社区与城市副中心一个接一个出现。你要在一座摊大饼的城市里织出一张网。',
    features: [['train', '开局接管 1 号线与环线', '29 站、约 39 km，复兴门换乘，票款与运营费照常结算'], ['road', '一环套一环', '二环到五环按年份贯通，城市沿环路向外扩张'], ['building', '中关村与 CBD', '新的就业中心与北部大社区按年份出现'], ['flag', '9 项历史任务', '从贯通长安街到奥运与机场线']],
    highlights: [[1990, '亚运会'], [1999, '中关村科技园区设立'], [2001, '申奥成功'], [2008, '北京奥运会'], [2015, '规划建设城市副中心'], [2022, '北京冬奥会']],
    geo: G, data: data,
    econ: { devOffset: 1, money: 1 },   // 出行选择参数：北京 1990 年约对应广州样本 1991 年的发展阶段
    cfg: {
      W: 204, H: 156, START: { y: 1990, m: 1, d: 1, minute: 360 },
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[1990, 6.3e6], [1995, 7.0e6], [2000, 8.6e6], [2005, 10.6e6], [2010, 13.2e6], [2015, 14.0e6], [2020, 13.9e6], [2030, 14.3e6], [2050, 14.6e6], [2300, 14.8e6]], histEnd: 2020, jobsRatio: [[1990, 0.58], [2000, 0.58], [2010, 0.62], [2020, 0.64]] }),
      money: { code: 'CNY', unit: '元', wan: '万元', yi: '亿元', sym: '¥' },
      econBase: 1990,
      // 造价（万元，1990 年价格；估算，参考复八线约 13.5 km、总投资约 56 亿元的量级）：旧城地下管线与文物多，地下造价较高
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 28000, surface: 5000, elevated: 11000 },
        riverPerKm: { underground: 20000, surface: 15000, elevated: 15000 },
        station: { underground: { S: 13000, M: 21000, L: 34000 }, elevated: { S: 7000, M: 11000, L: 17000 }, surface: { S: 4000, M: 7000, L: 10000 } },
        demolishPerCell: 45000,
      }),
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 450000, grantBase: [[1990, 24000], [1995, 42000], [2000, 65000], [2005, 130000], [2010, 200000], [2015, 240000], [2020, 270000], [2050, 360000]], debtLimit: -320000, rewardScale: 1.5 }),
      // 城市经济（macro.js）：1990 年地图范围 GDP 约 430 亿元（估算：北京全市约 500 亿元，地图覆盖中心城区与近郊主要开发区）；
      // 首都功能与科技、金融服务业比重高，2008 年奥运建设与 2015 年后的疏解体现在生产率趋势与事件中
      macro: {
        area: '地图范围（中心城区、近郊与亦庄、通州）', region: '中国内地',
        gdp0: 4300000, revRatio: [[1990, 0.2], [1994, 0.13], [2003, 0.16], [2010, 0.18], [2020, 0.18], [2040, 0.17]], revElastic: 1.5,
        prod: [[1990, 0.04], [1992, 0.09], [1995, 0.09], [2000, 0.09], [2005, 0.09], [2008, 0.07], [2011, 0.065], [2015, 0.055], [2019, 0.045], [2025, 0.032], [2035, 0.02], [2050, 0.014], [2080, 0.012]],
        infl: 'cn', longRun: { infl: 0.02 }, histEnd: 2020, ref: 'cn',
        struct: { trade: 0.55, fin: 0.7, ind: 0.45, tour: 0.6, prop: 0.65 },
        events: [
          { id: 'asiad1990', y: 1990, m: 9, kind: 'boom', scope: '本地', title: '亚运会', desc: '亚运会带动场馆、道路与酒店建设。', lv: [0.003, 0.002, 0] },
          { id: 'nanxun1992', y: 1992, m: 1 },
          { id: 'tight1993', y: 1993, m: 6 },
          { id: 'asia1997', y: 1997, m: 7, scale: 0.5 },
          { id: 'wto2001', y: 2001, m: 12 },
          { id: 'sars2003', y: 2003, m: 4, scale: 0.6 },
          { id: 'tight2004', y: 2004, m: 4 },
          { id: 'oly2008', y: 2008, m: 8, kind: 'boom', scope: '本地', title: '北京奥运会', desc: '奥运会带动旅游、会展与城市更新。', lv: [0.004, 0.002, 0] },
          { id: 'gfc2008', y: 2008, m: 9, scale: 0.6 },
          { id: 'stim2008', y: 2008, m: 11 },
          { id: 'cnstock2015', y: 2015, m: 6 },
          { id: 'trade2018', y: 2018, m: 7, scale: 0.6 },
          { id: 'covid2020', y: 2020, m: 1, scale: 0.8 },
        ],
      },
    },
    cam: { cx: 82, cy: 78, zoom: 16 },
  });
})(window.CM);
