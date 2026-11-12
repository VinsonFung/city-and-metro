'use strict';
// 武汉 · 2000 场景。地理来自 OpenStreetMap（geo_wh.js，现代数据），本文件补充 2000 年起的区域开放（按街道与区划分）、过江桥隧与快速路通车年份、
// 人口就业中心、地标、重要设施、历史事件、本地任务与人民币经营参数。坐标单位为格（250 m），用 ll(纬度, 经度) 换算。
// 真实性：过江桥隧通车年份、光谷与王家墩商务区开发、武汉站启用、地标落成年份、2020 年封城为史实参考；2000 年人口与就业分布、增长曲线、造价、票价与拨款为估算；2020 年之后为模拟。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.wh; if (!G) return;
  // 本文件的经纬度按国内地图常用的 GCJ-02 坐标填写，换算为 OSM 使用的 WGS-84 后再投影
  const P = G.proj, ll = function (lat, lon) { const w = CM.U.gcj2wgs(lat, lon); return [+((w[1] - P.lon0) * P.kx).toFixed(2), +((P.lat0 - w[0]) * P.ky).toFixed(2)]; };
  // 取自 OpenStreetMap 的地标位置（WGS-84，不再换算）
  const llW = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const atW = function (lat, lon, o) { const p = llW(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const poly = function (pts) { return pts.map(function (p) { return ll(p[0], p[1]); }); };
  const at = function (lat, lon, o) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const anchor = function (name, lat, lon, r) { const p = ll(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };

  // 王家墩商务区的城市发展范围（近似）；不展示原址的特殊设施。
  // 天河机场（1995 年 4 月启用；v2.2 地图向北扩大后完整位于图内，OSM 坐标，范围为近似）：民用机场，用地不开发
  const tianhe = [[30.7704, 114.1917], [30.7974, 114.2194], [30.8014, 114.2261], [30.7941, 114.2276], [30.7898, 114.2220], [30.7860, 114.2260], [30.7906, 114.2342], [30.7860, 114.2448], [30.7804, 114.2427], [30.7683, 114.2334], [30.7543, 114.2160], [30.7503, 114.2043], [30.7555, 114.2025], [30.7638, 114.1915]].map(function (p) { return llW(p[0], p[1]); });
  const wangjiadun = poly([[30.6215, 114.2465], [30.6215, 114.2600], [30.6110, 114.2700], [30.5995, 114.2690], [30.5995, 114.2515], [30.6105, 114.2445]]);

  const data = {
    // 城市特色（traits.js，规则见《地图设计与城市特色机制.md》）。新条目加在末尾，已触发事件按序号记录
    traits: [
      { use: 'crossing', star: true, icon: 'bridge', label: '两江三镇', text: '长江与汉江把城市分成三镇，越江线路最贵，也最有价值', why: '2012 年以前武汉没有过江地铁，三镇之间只靠桥梁、隧道和轮渡。' },
      { use: 'disaster', level: 'mid', star: true, icon: 'wave', label: '2016 年特大内涝', text: '一周暴雨让城区大面积积水，出行骤降、满意度下滑',
        on: { y: 2016, m: 7, title: '特大暴雨与内涝', desc: '6 月底到 7 月初，武汉一周降雨超过 560 毫米，破了气象记录，城区大面积积水，交通严重受阻。' }, why: '2016 年 6 月 30 日至 7 月 6 日，武汉周降雨量超过 560 毫米，为有气象记录以来最高。' },
      { use: 'foresight', level: 'mid', star: true, icon: 'chart', label: '光谷提前布局', text: '光谷爆发前就通地铁，能得到开发商出资，片区也长得更快', id: 'wh-gg', pos: [112.96, 135.96], ym: [2010, 1], before: 2008, r: 7, region: 'guanggu', title: '东湖成为国家自主创新示范区',
        hit: '东湖高新区获批国家自主创新示范区，早已通车的{st}站让光谷的企业和人才一下子多了起来。', miss: '东湖高新区获批国家自主创新示范区，光谷的人越来越多，可这里还没有地铁。',
        why: '2009 年 12 月，东湖高新区获批国家自主创新示范区，光谷进入快速增长期。' },
      { use: 'foresight', level: 'light', label: '武汉站提前布局', id: 'wh-st', at: 'wh_station', ym: [2009, 12], before: 2008, r: 7, region: 'hongshan', title: '武汉站启用',
        hit: '武广高铁开通，早已通车的{st}站让旅客一下车就能换乘地铁。', miss: '武广高铁开通，武汉站还没有地铁，旅客只能换公交和出租车。', why: '2009 年 12 月武广高铁开通，武汉站同时启用。' },
      { use: 'guard', level: 'light', label: '三镇古建', guards: ['wh_yhl', 'wh_customs', 'wh_qingchuan', 'wh_guiyuan', 'wh_baotong'], why: '黄鹤楼、晴川阁、归元寺和宝通寺是武汉的历史名胜，汉口保留着江汉关等近代建筑。不划整片历史城区，因为真实的轻轨 1 号线就是高架穿过汉口。' },
      { use: 'transition', level: 'light', label: '硚口古田转型', region: 'qiaokou', close: { y: 2013, m: 3, title: '古田老工业区转型', desc: '硚口古田一带曾是化工企业密集的老工业区，工厂陆续外迁，片区转向总部办公和文化创意园区。' }, replan: [{ year: 2014, region: 'qiaokou', plan: 'mix' }], why: '古田曾是武汉化工企业密集的地区，2010 年代逐步转型。' },
      { use: 'megaEvent', level: 'light', label: '2019 军运会', bid: { y: 2015, m: 5, title: '武汉获得世界军人运动会承办权', desc: '国际军体理事会决定由武汉承办 2019 年第七届世界军人运动会，地铁建设随之提速。' }, open: [2019, 10], why: '2015 年 5 月，武汉获得 2019 年第七届世界军人运动会承办权。' },
      { use: 'scenic', label: '东湖', why: '东湖风景区不能开发，线路要绕湖或从地下穿过。' },
      { use: 'finance', flavor: 'cn' },
    ],
    city: '武汉', terrainRevision: 2, riverName: '长江', hsrYear: 2009,
    terrainCorrection: {
      title: '武汉水域校正', summary: '武汉水域已校正，原有车站和线路保留',
      desc: '校正汉阳一处河渠的异常宽度，恢复被误判为水域的陆地；地图范围、原有车站、线路、资金、债务及已结算历史保留。',
    },
    stages: [[2004, '无地铁时代'], [2012, '轻轨时代'], [2017, '过江地铁时代']], stageLast: '地铁网络化时期',
    // 历史发展阶段（v2.2，eras.js）：summary 中「史实」可查证，「估算」为模型设定的发展倾向；grow 只改变人口与岗位增长的去向（总量仍按人口曲线），
    // relocate 为每月疏解比例，corridors 为片区间通勤与购物去向倍数，demand 为出行强度与距离倍数，goals 为阶段目标（本城任务）
    eras: [
      { id: 'wh-e1', from: 2000, name: '无地铁时代', tag: '史实',
        summary: '史实：长江与汉江把城市分为汉口、汉阳、武昌三镇，过江依靠长江大桥、长江二桥与轮渡；汉口是商业中心，武昌集中高校与机关，青山是武钢所在的工业区。估算：汉口老城人口趋于饱和，洪山与江岸成为主要的新增居住地。',
        grow: { pop: { hankou: 0.7, hongshan: 1.3, jiangan: 1.2, qiaokou: 1.1, wuchang: 0.9 }, jobs: { hankou: 1.1, wuchang: 1.1, zhuankou: 1.3 } },
        demand: { decayHW: 0.9 }, corridors: [{ a: 'hankou', b: 'wuchang', f: 1.1 }] },
      { id: 'wh-e2', from: 2004, name: '轻轨时代', tag: '史实',
        summary: '史实：2001 年「武汉·中国光谷」获批；2004 年轻轨 1 号线通车（史实背景，不会自动建成）；2008 年长江隧道通车，2009 年武广高铁开通、武汉站启用。估算：光谷与沌口开发区的岗位快速增长，后湖、南湖等大型居住区形成，三镇之间的过江通勤增加。',
        grow: { pop: { hankou: 0.6, houhu: 1.6, hongshan: 1.4, guanggu: 1.4, hanyang: 1.2, dongxihu: 1.2 }, jobs: { guanggu: 2.0, zhuankou: 1.8, hankou: 0.9 } },
        relocate: { jobs: { hankou: 0.0004 } },
        demand: { sc: 1.05, decayHW: 1.05 },
        corridors: [{ a: 'hankou', b: 'wuchang', f: 1.15 }, { a: 'houhu', b: 'hankou', f: 1.15 }, { a: 'hongshan', b: 'guanggu', f: 1.15 }],
        goals: [{ id: 'wh-g1', type: 'connect', months: 48, reward: 40000, title: '沌口汽车城通勤', desc: '沌口开发区的汽车工厂吸引大量工人，他们多住在汉阳老城区。用地铁连接沌口与钟家村。', anchors: [anchor('沌口', 30.4950, 114.1700, 4), anchor('钟家村', 30.5500, 114.2700, 3)] }] },
      { id: 'wh-e3', from: 2012, name: '过江地铁时代', tag: '史实',
        summary: '史实：2012 年首条过江地铁通车（史实背景）；王家墩商务区在旧机场地块建设，二七长江大桥（2011 年）与鹦鹉洲长江大桥（2014 年）通车。估算：就业向王家墩、光谷与沌口等多个中心分散，汉阳四新与东西湖开始大规模建设。',
        grow: { pop: { sixin: 1.6, dongxihu: 1.3, guanggu: 1.4, houhu: 1.3, panlong: 1.3, hankou: 0.6 }, jobs: { airport: 2.0, guanggu: 1.8, zhuankou: 1.4, sixin: 1.3, hankou: 0.85 } },
        relocate: { jobs: { hankou: 0.0005 } },
        demand: { sh: 1.05, decayHW: 1.1, hub: 1.1 },
        corridors: [{ a: 'airport', b: 'hankou', f: 1.15 }, { a: 'guanggu', b: 'wuchang', f: 1.15 }, { a: 'zhuankou', b: 'hanyang', f: 1.15 }, { a: 'hankou', b: 'wuchang', f: 1.1 }],
        goals: [{ id: 'wh-g2', type: 'connect', months: 48, reward: 45000, title: '王家墩商务区', desc: '旧机场地块建成新的商务区，与汉口老商圈之间往来频繁。用地铁连接王家墩与江汉路。', anchors: [anchor('王家墩', 30.6050, 114.2600, 4), anchor('江汉路', 30.5800, 114.2880, 3)] }] },
      { id: 'wh-e4', from: 2017, name: '地铁网络化时期', tag: '史实',
        summary: '史实：2019 年 10 月第七届世界军人运动会在武汉举行；2020 年初新冠肺炎疫情暴发，武汉封城 76 天。估算：光谷、四新与东西湖继续成长，长距离跨区通勤增加；疫情期间出行大幅减少，恢复需要一年左右。',
        grow: { pop: { guanggu: 1.4, sixin: 1.3, caidian: 1.2, panlong: 1.3, hankou: 0.6 }, jobs: { guanggu: 1.8, airport: 1.5, zhuankou: 1.3, hankou: 0.8 } },
        relocate: { jobs: { hankou: 0.0004 } },
        demand: { lz: 1.08, decayHW: 1.15 },
        corridors: [{ a: 'guanggu', b: 'wuchang', f: 1.2 }, { a: 'sixin', b: 'hanyang', f: 1.15 }, { a: 'panlong', b: 'hankou', f: 1.15 }],
        goals: [{ id: 'wh-g3', type: 'connect', months: 48, reward: 45000, title: '四新新城', desc: '四新新城的居民需要过汉江、长江去上班。用地铁连接四新与钟家村。', anchors: [anchor('四新', 30.5100, 114.2100, 4), anchor('钟家村', 30.5500, 114.2700, 3)] }] },
      { id: 'wh-e5', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '模拟：此后的发展按模型推演，不代表真实历史。估算：光谷东部、四新与东西湖继续成长，汉口老城保持稳定。',
        grow: { pop: { guanggu: 1.3, sixin: 1.2, dongxihu: 1.2, caidian: 1.2, hankou: 0.7 }, jobs: { guanggu: 1.5, airport: 1.3, sixin: 1.2, hankou: 0.85 } },
        demand: { lz: 1.1, decayHW: 1.15 }, corridors: [{ a: 'guanggu', b: 'wuchang', f: 1.15 }] },
    ],
    briefing: {
      lead: '2000 年的武汉还没有地铁。长江与汉江把城市分成汉口、武昌、汉阳三镇，过江只能挤上长江大桥、长江二桥或轮渡；汉口的高架轻轨正在建设。',
      modes: [['metro', '地铁', '尚无地铁。真实的轻轨 1 号线 2004 年通车，本局由你规划，真实线路不会自动出现。'], ['bus', '公交与轮渡', '公交线路拥挤，过江高峰时长江大桥严重拥堵，轮渡仍是不少人的通勤方式。'], ['bridge', '过江', '长江上只有长江大桥（1957 年）与长江二桥（1995 年），白沙洲大桥当年 9 月通车。'], ['rail', '铁路', '汉口站与武昌站承担对外铁路交通。列车本身不参与模拟，车站会产生市内接驳出行，地面铁路会阻隔步行。']],
    },
    airport: null,
    // 天河机场跑道（v2.2）：第一跑道 1995 年 4 月启用（史实），第二跑道按 2016 年（年份为近似）
    runways: [{ a: llW(30.7722, 114.1964), b: llW(30.7952, 114.2199), from: 1995.3 }, { a: llW(30.7576, 114.2108), b: llW(30.7820, 114.2357), from: 2016 }],
    regions: [
      { id: 'donghu', name: '东湖风景区', scenic: true, open: null, geo: { admin: '东湖生态旅游风景区' }, relief: 140 },   // 湖岸丘陵（磨山约 140 m）
      { id: 'guanggu', name: '光谷（东湖新技术开发区）', geo: { admin: '东湖新技术开发区' }, open: 2004, plan: 'ind', note: '2001 年「武汉·中国光谷」获批建设（史实）' },
      { id: 'airport', name: '王家墩商务区', poly: wangjiadun, open: 2007, plan: 'cbd', note: '2007 年起建设王家墩中央商务区（史实）' },
      { id: 'hankou', name: '汉口老城（江汉路·汉正街）', streets: ['民族街道', '花楼街道', '水塔街道', '民权街道', '满春街道', '民意街道', '前进街道', '大智街道', '一元街道', '车站街道', '四唯街道', '永清街道', '汉正街道', '汉中街道', '六角亭街道'], district: ['江汉区'], open: 2000, plan: 'oldmix' },
      { id: 'houhu', name: '后湖·塔子湖', streets: ['后湖街道', '塔子湖街道', '谌家矶街道'], open: 2003, plan: 'res', pop: 6e6, note: '2000 年代后湖、百步亭一带建成大型居住区（史实）' },
      { id: 'jiangan', name: '江岸（二七·台北·丹水池）', district: ['江岸区'], open: 2000, plan: 'resind' },
      { id: 'qiaokou', name: '硚口（宗关·古田·长丰）', district: ['硚口区'], open: 2000, plan: 'resind' },
      { id: 'sixin', name: '四新', streets: ['四新街道', '江堤街道'], open: 2010, plan: 'res', pop: 7.55e6, note: '2010 年代四新新城开发（史实）' },
      { id: 'hanyang', name: '汉阳（钟家村·王家湾）', district: ['汉阳区'], open: 2000, plan: 'resind' },
      { id: 'wuchang', name: '武昌（司门口·中南·积玉桥）', district: ['武昌区'], open: 2000, plan: 'mix' },
      { id: 'qingshan', name: '青山（武钢）', district: ['青山区'], open: 2004, plan: 'ind' },
      { id: 'hongshan', name: '洪山（街道口·徐东·南湖）', district: ['洪山区'], open: 2002, plan: 'mix' },
      { id: 'zhuankou', name: '沌口（经济技术开发区）', district: ['武汉经济技术开发区'], open: 2004, plan: 'ind' },
      { id: 'dongxihu', name: '东西湖（吴家山·金银湖）', district: ['东西湖区'], open: 2007, plan: 'resind', pop: 6.7e6 },
      { id: 'caidian', name: '蔡甸', district: ['蔡甸区'], open: 2011, plan: 'res', pop: 8.1e6 },
      // v2.1 扩大范围：北部的盘龙城与天河机场、西北角的孝感（境外）
      { id: 'tianhe', name: '天河机场', poly: tianhe, open: null, hub: true, lockNote: '民用机场照常运营，用地不开发', note: '重要交通枢纽：范围内可以地下设站与地下穿越（v2.2）' },
      { id: 'xiaogan', name: '孝感（境外）', district: ['孝南区'], open: null, lockNote: '孝感市，不属于武汉的建设范围' },
      { id: 'panlong', name: '盘龙城（黄陂南部）', district: ['黄陂区'], open: 2010, plan: 'res', pop: 7.5e6, note: '2000 年代中期起盘龙城一带建成大型居住区（史实）' },
    ],
    defaultRegion: { id: 'outer', name: '外围地区', open: 2013, plan: 'res', pop: 8.6e6 },
    plans: CM.DATA.plans,
    // 2000 年人口与就业中心（估算，人/km²；r 约为影响半径 km）
    centers: [
      at(30.5820, 114.2880, { pop: 45000, jobs: 60000, r: 1.1 }),   // 江汉路、中山大道
      at(30.5700, 114.2700, { pop: 40000, jobs: 50000, r: 1.0 }),   // 汉正街
      at(30.5850, 114.2700, { pop: 30000, jobs: 35000, r: 1.0 }),   // 武广、中山公园
      at(30.6050, 114.2650, { pop: 20000, jobs: 15000, r: 1.2 }),   // 新华路、汉口站
      at(30.6000, 114.3000, { pop: 35000, jobs: 20000, r: 1.2 }),   // 大智路、解放公园
      at(30.5800, 114.2400, { pop: 25000, jobs: 20000, r: 1.3 }),   // 宗关、古田
      at(30.5520, 114.2650, { pop: 30000, jobs: 18000, r: 1.2 }),   // 钟家村、归元寺
      at(30.5550, 114.2150, { pop: 10000, jobs: 8000, r: 1.3 }),    // 王家湾
      at(30.5450, 114.3050, { pop: 40000, jobs: 35000, r: 1.2 }),   // 司门口、首义
      at(30.5400, 114.3350, { pop: 25000, jobs: 30000, r: 1.1 }),   // 中南路、水果湖
      at(30.5750, 114.3250, { pop: 25000, jobs: 12000, r: 1.2 }),   // 徐家棚、积玉桥
      at(30.5250, 114.3550, { pop: 25000, jobs: 20000, r: 1.3 }),   // 街道口、珞喻路
      at(30.6300, 114.3850, { pop: 25000, jobs: 30000, r: 1.6 }),   // 青山、红钢城
      at(30.5050, 114.4050, { pop: 8000, jobs: 8000, r: 1.6 }),     // 关山
      at(30.5000, 114.1700, { pop: 3000, jobs: 8000, r: 1.6 }),     // 沌口
      at(30.5050, 114.3000, { pop: 6000, jobs: 6000, r: 1.3 }),     // 白沙洲
      // v2.1 扩大范围（2000 年估算）
      at(30.6400, 114.1300, { pop: 8000, jobs: 6000, r: 1.2 }),     // 吴家山（东西湖）
      at(30.7000, 114.2650, { pop: 3000, jobs: 2000, r: 1.2 }),     // 盘龙城
    ],
    rural: { pop: 600, jobs: 150 },
    // 道路与过江桥隧通车年份（名称前缀匹配；2000 年已有的道路按所在区域开放年份出现）。长江大桥与隧道为史实，部分高架、隧道与新建大道为近似年份
    roadYears: {
      '武汉长江大桥': 1957, '武汉长江二桥': 1995, '白沙洲长江大桥': 2000, '天兴洲长江大桥': 2009, '二七长江大桥': 2011, '鹦鹉洲长江大桥': 2014, '杨泗港长江大桥': 2019,
      '武汉长江隧道': 2008, '长江隧道': 2008, '武汉长江公铁隧道': 2018, '江汉桥': 1955, '知音桥': 1999, '月湖桥': 1997, '晴川桥': 2000, '长丰桥': 2005, '古田桥': 2014, '汉江湾桥': 2017,
      '三环线': 2007, '二环线': 2014, '四环线': 2019, '机场高速': 1995, '机场二高速': 2010, '汉蔡高速': 2003, '武鄂高速': 2008, '岱黄高速': 2007, '硚孝高速': 2013, '武监高速': 2015,
      '江北快速路': 2010, '杨泗港快速': 2019, '雄楚大道高架': 2016, '友谊大道高架': 2015, '珞狮南路高架': 2014, '解放大道高架': 2014, '光谷大道高架': 2015, '和平大道红钢城高架': 2016,
      '大学园路高架': 2017, '发展大道高架': 2009, '白沙洲大道高架': 2008, '白沙洲高架': 2008, '水果湖隧道': 2013, '东湖隧道': 2015, '中山路隧道': 2013, '首义隧道': 2013,
      '马房山隧道': 2015, '中一路隧道': 2015, '国博大道': 2011, '临江大道': 2014, '四新大道': 2011,
    },
    bridgeYears: {}, bridgeDefaultYear: 2000,
    simRoads: [],
    landmarks: [
      Object.assign(atW(30.5471, 114.2971), { id: 'wh_yhl', name: '黄鹤楼', w: 60, d: 60, year: 1985, kind: 'tower', style: 'yellowcrane' }),
      Object.assign(atW(30.5580, 114.2751), { id: 'wh_tv', name: '龟山电视塔', w: 50, d: 50, year: 1986, kind: 'tvtower', style: 'needle', h: 221 }),
      Object.assign(atW(30.5587, 114.2799), { id: 'wh_qingchuan', name: '晴川阁', w: 80, d: 60, year: 1986, kind: 'traditional' }),
      Object.assign(atW(30.5478, 114.2537), { id: 'wh_guiyuan', name: '归元寺', w: 180, d: 180, year: 1658, kind: 'temple' }),
      Object.assign(atW(30.5786, 114.2920), { id: 'wh_customs', name: '江汉关大楼', w: 60, d: 50, year: 1924, kind: 'palace', style: 'clock', h: 46 }),
      Object.assign(atW(30.5352, 114.3360), { id: 'wh_baotong', name: '宝通寺洪山宝塔', w: 120, d: 160, year: 1307, kind: 'pagoda', h: 43 }),
      Object.assign(atW(30.5374, 114.3604), { id: 'wh_whu', name: '武汉大学', w: 1200, d: 900, year: 1932, kind: 'campus', style: 'palace' }),
      Object.assign(atW(30.5202, 114.4135), { id: 'wh_hust', name: '华中科技大学', w: 1500, d: 1200, year: 1953, kind: 'campus' }),
      Object.assign(atW(30.6205, 114.2510), { id: 'wh_hankou', name: '汉口站', w: 400, d: 200, year: 1991, kind: 'rail' }),
      Object.assign(atW(30.5310, 114.3124), { id: 'wh_wuchang', name: '武昌站', w: 300, d: 160, year: 1917, kind: 'rail' }),
      Object.assign(at(30.6075, 114.4245), { id: 'wh_station', name: '武汉站', w: 700, d: 450, rot: 90, year: 2009, kind: 'rail' }),
      Object.assign(atW(30.5025, 114.1661), { id: 'wh_sports', name: '武汉体育中心', w: 300, d: 260, year: 2002, kind: 'stadium' }),
      Object.assign(atW(30.5634, 114.2541), { id: 'wh_qintai', name: '琴台大剧院', w: 200, d: 160, year: 2007, kind: 'concert' }),
      Object.assign(atW(30.5968, 114.2670), { id: 'wh_minsheng', name: '民生银行大厦', w: 60, d: 50, year: 2007, kind: 'skyscraper', h: 331 }),
      Object.assign(at(30.5395, 114.2440), { id: 'wh_expo', name: '武汉国际博览中心', w: 600, d: 400, year: 2011, kind: 'expo' }),
      Object.assign(atW(30.59664, 114.23967), { id: 'wh_center', name: '武汉中心', w: 70, d: 70, year: 2019, kind: 'skyscraper', h: 438 }),
    ],
    // 重要设施（见 facility.js）：位置与启用 / 停用年份为史实参考（位置近似）；规模均为估算。
    // 枢纽 pax：市内接驳出行（汽车 + 地铁，万人次/日）；天河机场位于图内北部（1995 年启用），航站区附近设枢纽。
    facilities: [
      { id: 'wh_tianhe', n: '天河机场', t: 'air', at: llW(30.77252, 114.21171), rw: [llW(30.7722, 114.1964), llW(30.7952, 114.2199)], pax: [[2000, 0.35], [2005, 0.75], [2010, 1.6], [2019, 3], [2030, 3.6]], note: '1995 年 4 月启用，承担武汉的民航。v2.2 地图向北扩大后机场完整位于图内，需求点设在两条跑道之间的航站区，机场跑道一带不开发。' },
      { id: 'wh_hankou', n: '汉口站', t: 'rail', lm: 'wh_hankou', pax: [[2000, 4], [2010, 6], [2019, 8], [2030, 8.5]] },
      { id: 'wh_wuchang', n: '武昌站', t: 'rail', lm: 'wh_wuchang', pax: [[2000, 4], [2010, 4], [2019, 4.5]] },
      { id: 'wh_station', n: '武汉站', t: 'rail', lm: 'wh_station', y0: [2009, 12], pax: [[2010, 2], [2015, 6], [2019, 8], [2030, 9]], note: '2009 年 12 月武广高速铁路开通，武汉站启用。' },
      { id: 'wh_whu', n: '武汉大学', t: 'uni', lm: 'wh_whu', w: 0.04 },
      { id: 'wh_hust', n: '华中科技大学', t: 'uni', lm: 'wh_hust', w: 0.04 },
      { id: 'wh_ccnu', n: '华中师范大学', t: 'uni', at: llW(30.52043, 114.35630), w: 0.02 },
      { id: 'wh_whut', n: '武汉理工大学', t: 'uni', at: ll(30.5160, 114.3530), w: 0.018 },
      { id: 'wh_cug', n: '中国地质大学', t: 'uni', at: llW(30.52164, 114.39559), w: 0.015 },
      { id: 'wh_znufe', n: '中南财经政法大学', t: 'uni', at: llW(30.47643, 114.38017), y0: 2005, w: 0.015 },
      { id: 'wh_hubu', n: '湖北大学', t: 'uni', at: ll(30.5800, 114.3300), w: 0.012 },
      { id: 'wh_jhun', n: '江汉大学', t: 'uni', at: llW(30.51723, 114.15266), y0: 2004, w: 0.01 },
      { id: 'wh_tongji', n: '同济医院', t: 'hosp', at: ll(30.5815, 114.2610), w: 0.06 },
      { id: 'wh_xiehe', n: '协和医院', t: 'hosp', at: llW(30.58669, 114.26929), w: 0.06 },
      { id: 'wh_renmin', n: '武汉大学人民医院', t: 'hosp', at: llW(30.53778, 114.29390), w: 0.045 },
      { id: 'wh_zhongnan', n: '中南医院', t: 'hosp', at: ll(30.5545, 114.3510), w: 0.04 },
      { id: 'wh_central', n: '武汉市中心医院', t: 'hosp', at: ll(30.5880, 114.2925), w: 0.035 },
      { id: 'wh_jhl', n: '江汉路步行街', t: 'shop', at: llW(30.58308, 114.28628), w: 0.05 },
      { id: 'wh_hzj', n: '汉正街', t: 'shop', at: ll(30.5700, 114.2700), p: { sh: 0.9, lz: 0.1 }, w: [[2000, 0.06], [2015, 0.03]] },
      { id: 'wh_wg', n: '武广商圈', t: 'shop', at: ll(30.5835, 114.2700), w: 0.04 },
      { id: 'wh_smk', n: '司门口·户部巷', t: 'shop', at: ll(30.5465, 114.3040), p: { sh: 0.6, lz: 0.4 }, w: 0.02 },
      { id: 'wh_xudong', n: '徐东商圈', t: 'shop', at: llW(30.59044, 114.34020), y0: 2003, w: 0.02 },
      { id: 'wh_ggsq', n: '光谷商圈', t: 'shop', at: ll(30.5055, 114.4000), y0: 2005, w: [[2005, 0.01], [2015, 0.04]] },
      { id: 'wh_chuhe', n: '楚河汉街', t: 'shop', at: ll(30.5600, 114.3440), y0: [2011, 9], p: { sh: 0.6, lz: 0.4 }, w: 0.03 },
      { id: 'wh_wjw', n: '王家湾商圈', t: 'shop', at: llW(30.56312, 114.20418), y0: 2006, w: 0.02 },
      { id: 'wh_jsdd', n: '建设大道金融街', t: 'cbd', at: ll(30.6000, 114.2810), w: 0.02 },
      { id: 'wh_cbd', n: '王家墩中央商务区', t: 'cbd', at: llW(30.60480, 114.24260), y0: 2010, w: [[2010, 0.003], [2020, 0.02]] },
      { id: 'wh_ovc', n: '光谷软件园与金融港', t: 'cbd', at: ll(30.4950, 114.4150), y0: 2005, w: [[2005, 0.005], [2020, 0.025]] },
      { id: 'wh_zbl', n: '中北路商务区', t: 'cbd', at: ll(30.5600, 114.3430), y0: 2008, w: 0.01 },
      { id: 'wh_yhl', n: '黄鹤楼', t: 'scenic', lm: 'wh_yhl', w: 0.03 },
      { id: 'wh_donghu', n: '东湖风景区', t: 'scenic', at: llW(30.56513, 114.36891), r: 2.5, w: 0.04 },
      { id: 'wh_guiyuan', n: '归元寺', t: 'scenic', lm: 'wh_guiyuan', w: 0.012 },
      { id: 'wh_jiangtan', n: '汉口江滩', t: 'scenic', at: llW(30.59260, 114.30110), y0: 2002, w: 0.012 },
      { id: 'wh_museum', n: '湖北省博物馆', t: 'scenic', at: llW(30.5637, 114.3597), w: 0.01 },
      { id: 'wh_zsgy', n: '中山公园', t: 'park', at: ll(30.5880, 114.2735), w: 0.01 },
      { id: 'wh_jfgy', n: '解放公园', t: 'park', at: ll(30.6080, 114.2990), w: 0.01 },
      { id: 'wh_sports', n: '武汉体育中心', t: 'stadium', lm: 'wh_sports', w: [[2002, 0.012], [2019.7, 0.012], [2019.8, 0.03], [2019.9, 0.012]], note: '2019 年 10 月第七届世界军人运动会主会场。' },
      { id: 'wh_xhl', n: '新华路体育场', t: 'stadium', at: llW(30.58905, 114.26820), w: 0.006 },
      { id: 'wh_hsg', n: '洪山体育馆', t: 'stadium', at: llW(30.54851, 114.32885), w: 0.004 },
      { id: 'wh_icec', n: '武汉国际会展中心', t: 'venue', at: llW(30.58206, 114.26821), y0: 2001, w: 0.008 },
      { id: 'wh_expo', n: '武汉国际博览中心', t: 'venue', lm: 'wh_expo', w: 0.012 },
      { id: 'wh_qintai', n: '琴台大剧院', t: 'venue', lm: 'wh_qintai', w: 0.005 },
    ],
    districtLabels: [['汉口', ['江汉区']], ['江岸', ['江岸区']], ['硚口', ['硚口区']], ['汉阳', ['汉阳区']], ['武昌', ['武昌区']], ['青山', ['青山区']], ['洪山', ['洪山区']], ['东西湖', ['东西湖区']], ['光谷', ['东湖新技术开发区']], ['沌口', ['武汉经济技术开发区']]],
    // 纪事（只能在末尾追加：已发生记录按序号保存）
    events: [
      { y: 2000, m: 1, tag: '史实', title: '2000 年的武汉', desc: '主城区人口约 450 万，汉口、武昌、汉阳三镇被长江与汉江分隔，过江交通高度依赖长江大桥与长江二桥；没有地铁，出行依靠公交、轮渡与自行车。' },
      { y: 2000, m: 9, tag: '史实', title: '白沙洲长江大桥通车', desc: '第三座长江大桥连接武昌白沙洲与汉阳，分流长江大桥的过江交通。' },
      { y: 2001, m: 2, tag: '史实', title: '「武汉·中国光谷」获批', desc: '东湖新技术开发区以光电子产业为核心，关山一带开始成为新的产业中心。', fx: { grow: { region: 'guanggu', jobs: 1.5, years: 6 } } },
      { y: 2004, m: 7, tag: '史实', title: '史实背景：轻轨 1 号线通车', desc: '汉口黄浦路至宗关的高架轻轨通车。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 2007, m: 6, tag: '史实', title: '王家墩商务区开发', desc: '汉口中部开始建设王家墩中央商务区。', fx: { grow: { region: 'airport', jobs: 1.5, years: 8 } } },
      { y: 2008, m: 12, tag: '史实', title: '武汉长江隧道通车', desc: '万里长江第一条公路隧道连接汉口与武昌。' },
      { y: 2009, m: 12, tag: '史实', title: '武广高速铁路开通，武汉站启用', desc: '武汉进入高铁时代，杨春湖畔的武汉站成为新的交通枢纽。' },
      { y: 2011, m: 12, tag: '史实', title: '二七长江大桥通车', desc: '连接汉口二七路与武昌徐家棚，是二环线的一部分。' },
      { y: 2012, m: 12, tag: '史实', title: '史实背景：首条过江地铁通车', desc: '地铁 2 号线从汉口穿过长江到达光谷。' },
      { y: 2014, m: 12, tag: '史实', title: '鹦鹉洲长江大桥通车', desc: '连接汉阳鹦鹉洲与武昌白沙洲，二环线随之贯通。' },
      { y: 2019, m: 10, tag: '史实', title: '第七届世界军人运动会', desc: '来自 100 多个国家和地区的运动员在武汉参赛，主会场为武汉体育中心。', fx: { demand: { lz: 1.2, hub: 1.1, months: 1 }, sat: { v: 1.5, months: 6 } } },
      { y: 2020, m: 1, tag: '史实', title: '新冠肺炎疫情与武汉封城', desc: '1 月 23 日起离汉通道关闭，城市停摆 76 天，4 月 8 日解除封控。', fx: { demand: { hw: 0.4, sc: 0.2, sh: 0.45, md: 0.7, lz: 0.2, hub: 0.15, months: 3, fade: 1 }, sat: { v: -2, months: 6 } } },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后人口、道路和区域变化按模拟规则推演，不代表真实历史。' },
    ],
    // 本地历史主题任务：参考武汉的发展需求，不要求复刻真实线路走向（奖励单位：万元，2000 年价格）
    histTasks: [
      { id: 'wh1', appear: [2000, 6], deadline: [2005, 12], type: 'connect', reward: 40000, title: '汉口轨道交通', desc: '连接黄浦路、循礼门与宗关，为汉口老城提供第一条轨道交通。可以考虑建设高架线路以节省造价。', anchors: [anchor('黄浦路', 30.6130, 114.3070, 3), anchor('循礼门', 30.5920, 114.2770, 3), anchor('宗关', 30.5790, 114.2420, 3)] },
      { id: 'wh2', appear: [2003, 1], deadline: [2012, 12], type: 'connect', reward: 70000, title: '首条过江地铁', desc: '连接汉口火车站、江汉路、洪山广场、街道口与光谷广场。过长江段需要建设越江隧道。', anchors: [anchor('汉口火车站', 30.6180, 114.2560, 3), anchor('江汉路', 30.5825, 114.2885, 3), anchor('洪山广场', 30.5445, 114.3330, 3), anchor('街道口', 30.5275, 114.3540, 3), anchor('光谷广场', 30.5055, 114.3990, 3)] },
      { id: 'wh3', appear: [2006, 1], deadline: [2014, 12], type: 'connect', reward: 50000, title: '武汉站接驳', desc: '新的武汉站启用后，连接武汉站、徐家棚与武昌站。', anchors: [anchor('武汉站', 30.6075, 114.4245, 3), anchor('徐家棚', 30.5800, 114.3290, 3), anchor('武昌站', 30.5300, 114.3170, 3)] },
      { id: 'wh4', appear: [2008, 1], deadline: [2016, 12], type: 'connect', reward: 50000, title: '汉阳过汉江', desc: '连接王家湾、钟家村与江汉路，跨过汉江把汉阳接入汉口中心。', anchors: [anchor('王家湾', 30.5575, 114.2120, 3), anchor('钟家村', 30.5530, 114.2700, 3), anchor('江汉路', 30.5825, 114.2885, 3)] },
      { id: 'wh5', appear: [2010, 1], deadline: [2016, 12], type: 'coverage', target: 0.3, reward: 60000, title: '地铁覆盖三成人口', desc: '2016 年底前，步行 15 分钟可到达地铁站的人口不低于全市人口的 30%。' },
      { id: 'wh6', appear: [2014, 1], deadline: [2019, 9], type: 'connect', reward: 50000, title: '军运会主会场', desc: '军运会开幕前，连接武汉体育中心、王家湾与汉口火车站。', anchors: [anchor('武汉体育中心', 30.5085, 114.1885, 3), anchor('王家湾', 30.5575, 114.2120, 3), anchor('汉口火车站', 30.6180, 114.2560, 3)] },
      { id: 'wh7', appear: [2015, 1], deadline: [2020, 12], type: 'coverage', target: 0.5, reward: 70000, title: '地铁覆盖一半人口', desc: '2020 年底前，步行 15 分钟可到达地铁站的人口不低于全市人口的 50%。' },
    ],
    dynTasks: [
      { id: 'whd1', from: [2002, 1], to: [2012, 12], type: 'connect', months: 36, reward: 40000, title: '武昌—汉口过江通勤', desc: '每天大量通勤者往返两岸。连接中南路、积玉桥与江汉路。', anchors: [anchor('中南路', 30.5400, 114.3350, 3), anchor('积玉桥', 30.5680, 114.3150, 3), anchor('江汉路', 30.5825, 114.2885, 3)] },
      { id: 'whd2', from: [2005, 1], to: [2015, 12], type: 'connect', months: 36, reward: 35000, title: '光谷大学城', desc: '连接光谷广场、华中科技大学与街道口。', anchors: [anchor('光谷广场', 30.5055, 114.3990, 3), anchor('华中科技大学', 30.5120, 114.4130, 3), anchor('街道口', 30.5275, 114.3540, 3)] },
      { id: 'whd3', from: [2008, 1], to: [2018, 12], type: 'connect', months: 36, reward: 35000, title: '后湖居住区', desc: '后湖、百步亭的大型社区通勤需求大。连接后湖、三阳路与江汉路。', anchors: [anchor('后湖', 30.6450, 114.3050, 3), anchor('三阳路', 30.5960, 114.3030, 3), anchor('江汉路', 30.5825, 114.2885, 3)] },
    ],
    taskNote: '历史主题任务参考武汉 2000 年起的发展需求（汉口轨道交通、过江、武汉站、汉阳、军运会），不要求按真实线路走向建设，只需满足目标描述。',
    // 城市策略难题（v2.3，可选挑战）
    scenarios: [
      { id: 'wh-sc1', theme: '武汉：两江三镇', title: '一张网走遍三镇', type: 'budgetConnect', from: [2002, 1], to: [2015, 12], months: 72, rewardMonths: 4, budgetX: 1.25,
        anchors: [['江汉路', 3], ['钟家村', 3], ['积玉桥', 3]],
        desc: '长江与汉江把武汉分成汉口、汉阳、武昌三镇，每过一次江都是一大笔钱。用有限预算把三镇连进同一张网。',
        tips: ['两次过江都选江面最窄处', '三镇各有一座换乘站，以后别的线也能接上', '汉阳段距离短，一两站就够'] },
      { id: 'wh-sc2', theme: '武汉：远离中心的光谷', title: '把地铁修进光谷', type: 'regionCov', from: [2008, 1], to: [2022, 12], months: 60, rewardMonths: 3,
        regions: ['guanggu'], areaName: '光谷', target: 0.45,
        desc: '光谷是离三镇中心最远的就业新城，岗位与学生增长很快，进城通勤距离长。让光谷接近一半的人步行就能到地铁站。',
        tips: ['光谷广场一带人最密，先在这里设站', '远距离线路站距可以拉长，提高速度', '与洪山、街道口的线路换乘，比单独修长线便宜'] },
    ],
    dataNote: [
      ['真实地理', 'hist', '长江、汉江与湖泊水系、道路与桥隧、铁路、公园与风景区、街道边界与地名来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），为现代数据，按 250 m 网格投影。'],
      ['史实参考', 'hist', '过江桥隧与快速路通车年份、光谷与王家墩商务区开发、武汉站启用、地标落成年份、2020 年封城。'],
      ['估算', 'est', '2000 年人口与就业分布、人口增长曲线、出行率、时间价值、造价、票价、运营费用与拨款、地图范围 GDP。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。普通铁路与高速铁路不参与乘客出行与运营模拟，只模拟车站的市内接驳出行；地面铁路按真实线位阻隔步行与小路；真实的武汉地铁不会自动出现。'],
      ['', '', '模拟结果不得作为真实武汉交通规划预测。'],
    ],
    // 线路配色参考武汉地铁
    lineColorsNice: ['#3080b7', '#ec83a8', '#c8a64a', '#8dc21f', '#a7354b', '#008b54', '#f08c00', '#9b8bb6', '#2a6b9c', '#c9d200', '#5a3f92'],
    places: (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; }),
  };
  // 位置校正：与 OSM 地铁站同名的设施与任务锚点，改用车站位置（相距 3 km 以内时；手填坐标的误差可达数百米）
  const ST = {}; for (const p of G.places || []) if (p[3] === 0 && !ST[p[0]]) ST[p[0]] = p;
  const nearSt = function (name, x, y) { const p = ST[name.replace(/（.*?）/g, '')]; return p && Math.hypot(p[1] - x, p[2] - y) < 12 ? p : null; };
  for (const f of data.facilities) if (f.at) { const p = nearSt(f.n, f.at[0], f.at[1]); if (p) f.at = [p[1], p[2]]; }
  for (const t of data.histTasks.concat(data.dynTasks)) for (const a of t.anchors || []) { const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }

  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'wh', name: '武汉', title: '武汉 · 2000', sub: '真实地理 · 2000 年起 · 人民币',
    desc: '从 2000 年尚无地铁的武汉开始：长江与汉江把城市分成三镇，过江通道屈指可数。光谷、武汉站与王家墩商务区将陆续出现，三镇需要用越江线路连成一体。',
    facts: [['范围', '38 km × 39 km'], ['起始', '2000 年'], ['人口', '约 559 万'], ['货币', '人民币（元）'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 4, extent: [{ from: 1, dx: 16, dy: 48, oldW: 120, oldH: 96, newW: 152, newH: 144, note: '地图向北扩大到盘龙城、天河机场，向西到吴家山，向东到武钢、左岭一带', oldRegionIds: ['donghu', 'guanggu', 'airport', 'hankou', 'houhu', 'jiangan', 'qiaokou', 'sixin', 'hanyang', 'wuchang', 'qingshan', 'hongshan', 'zhuankou', 'dongxihu', 'caidian', 'outer'], oldLandmarkIds: ['wh_yhl', 'wh_tv', 'wh_qingchuan', 'wh_guiyuan', 'wh_customs', 'wh_baotong', 'wh_whu', 'wh_hust', 'wh_hankou', 'wh_wuchang', 'wh_station', 'wh_sports', 'wh_qintai', 'wh_minsheng', 'wh_expo', 'wh_center'] },
      // 第 2 版与第 3 版格网相同（只调整了展示，见 maps.js），第 3→4 版向北扩大到天河机场北侧
      { from: 3, dx: 0, dy: 12, oldW: 152, oldH: 144, note: '地图向北扩大，天河机场完整位于图内',
        oldRegionIds: ['donghu', 'guanggu', 'airport', 'hankou', 'houhu', 'jiangan', 'qiaokou', 'sixin', 'hanyang', 'wuchang', 'qingshan', 'hongshan', 'zhuankou', 'dongxihu', 'caidian', 'tianhe', 'xiaogan', 'panlong', 'outer'] }], scenario: 'wh-2000',
    region: '中国内地', tagline: '两江三镇，用地铁连成一城', difficulty: 2, tags: ['无地铁开局', '越江', '湖泊'],
    intro: '2000 年的武汉，长江与汉江把城市分成汉口、武昌、汉阳三镇，过江只能挤上两座长江大桥或轮渡。东湖与大大小小的湖泊占去许多土地，光谷、武汉站与王家墩商务区就要出现。你的任务是用越江线路把三镇连成一座城。',
    features: [['wave', '百湖之市', '东湖风景区不可开发，线路要绕湖或穿湖']],
    highlights: [[2001, '「中国光谷」获批'], [2007, '王家墩商务区开发'], [2008, '武汉长江隧道通车'], [2009, '武汉站启用'], [2019, '城市更新']],
    geo: G, data: data,
    econ: { devOffset: -6, money: 1 },   // 出行选择参数：武汉 2000 年约对应广州样本 1994 年的发展阶段
    cfg: {
      W: 152, H: 156, START: { y: 2000, m: 1, d: 1, minute: 360 },   // v2.2：向北扩大 12 格，天河机场完整位于图内
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[2000, 5.59e6], [2005, 6.4e6], [2010, 7.8e6], [2015, 9.1e6], [2020, 10.5e6], [2030, 11.6e6], [2050, 12.4e6], [2300, 12.9e6]], histEnd: 2020, jobsRatio: [[2000, 0.5], [2010, 0.55], [2020, 0.57], [2040, 0.59]] }),
      money: { code: 'CNY', unit: '元', wan: '万元', yi: '亿元', sym: '¥' },
      econBase: 2000,
      // 造价（万元，2000 年价格；估算，参考轻轨 1 号线一期约 10 km、20 余亿元的量级）：长江越江隧道附加较高
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 45000, surface: 8000, elevated: 15000 },
        riverPerKm: { underground: 35000, surface: 25000, elevated: 25000 },
        hillPerKm: 12000, protectedPerKm: 7000,
        station: { underground: { S: 20000, M: 32000, L: 50000 }, elevated: { S: 9000, M: 13000, L: 20000 }, surface: { S: 6000, M: 10000, L: 15000 } },
        demolishPerCell: 40000,
      }),
      ops: Object.assign({}, CM.CFG.ops, { carKmCost: 0.0012, stationDaily: { S: 2, M: 3.4, L: 6 } }),
      fareDefault: { mode: 'flat', flat: 2 }, fareRange: { min: 0, max: 10, step: 0.1, scale: true },
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 400000, grantBase: [[2000, 20000], [2005, 35000], [2010, 70000], [2015, 110000], [2020, 130000], [2050, 180000]], debtLimit: -250000, rewardScale: 1.3 }),
      // 城市经济（macro.js）：2000 年地图范围 GDP 约 1000 亿元（估算：武汉全市约 1200 亿元，地图覆盖主城区、光谷与沌口）；
      // 重工业（钢铁、汽车）比重高，2005 年后「中部崛起」带动高速增长（体现在生产率趋势中）
      macro: {
        area: '地图范围（三镇主城区、光谷与沌口）', region: '中国内地',
        gdp0: 12400000, revRatio: [[2000, 0.12], [2010, 0.16], [2020, 0.17], [2040, 0.16]], revElastic: 1.5,
        prod: [[2000, 0.085], [2005, 0.095], [2010, 0.095], [2014, 0.075], [2018, 0.06], [2020, 0.045], [2030, 0.028], [2050, 0.015], [2080, 0.012]],
        infl: 'cn', longRun: { infl: 0.02 }, histEnd: 2020, ref: 'cn',
        struct: { trade: 0.4, fin: 0.35, ind: 0.65, tour: 0.4, prop: 0.55 },
        events: [
          { id: 'wto2001', y: 2001, m: 12, scale: 0.7 },
          { id: 'sars2003', y: 2003, m: 4, scale: 0.3 },
          { id: 'tight2004', y: 2004, m: 4 },
          { id: 'gfc2008', y: 2008, m: 9, scale: 0.6 },
          { id: 'stim2008', y: 2008, m: 11, scale: 1.2, desc: '基建投资与「中部崛起」政策带动武汉的地铁、桥梁与新城建设。' },
          { id: 'cnstock2015', y: 2015, m: 6 },
          { id: 'trade2018', y: 2018, m: 7, scale: 0.7 },
          { id: 'wh2019', y: 2019, m: 10, kind: 'boom', scope: '本地', title: '军运会与城市更新', desc: '为军运会集中改造道路、场馆与城市环境。', lv: [0.002, 0.002, 0] },
          { id: 'covid2020', y: 2020, m: 1, scale: 2.8, desc: '1 月 23 日起武汉封城 76 天，一季度经济大幅收缩，全年地区生产总值下降约 4.7%，之后逐步恢复。' },
        ],
      },
    },
    cam: { cx: 77, cy: 110, zoom: 16 },
  });
})(window.CM);
