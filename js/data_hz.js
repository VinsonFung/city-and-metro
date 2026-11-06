'use strict';
// 杭州 · 2000 场景。地理来自 OpenStreetMap（geo_hz.js，现代数据），本文件补充 2000 年起的区域开放（按街道划分）、道路与过江桥隧通车年份、
// 人口就业中心、地标、历史事件、本地任务与人民币经营参数。坐标单位为格（250 m），用 ll(纬度, 经度) 换算。
// 真实性：撤市设区、钱江新城、过江大桥与城市快速路通车年份、地标落成年份为史实参考；2000 年人口与就业分布、增长曲线、造价与票价为估算。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.hz; if (!G) return;
  const P = G.proj, ll = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const poly = function (pts) { return pts.map(function (p) { return ll(p[0], p[1]); }); };
  const at = function (lat, lon, o) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const anchor = function (name, lat, lon, r) { const p = ll(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };

  // 钱江新城核心区（近似）。未展示的特殊设施不保留名称、边界或专用表现。
  const qjxc = poly([[30.2620, 120.2000], [30.2620, 120.2150], [30.2500, 120.2320], [30.2360, 120.2260], [30.2380, 120.2050]]);

  const data = {
    city: '杭州', riverName: '钱塘江', hsrYear: 2010,
    stages: [[2001, '西湖时代'], [2010, '沿江开发期'], [2016, '跨江发展期']], stageLast: '钱塘江时代',
    // 历史发展阶段（v2.2，eras.js）：summary 中「史实」可查证，「估算」为模型设定的发展倾向；grow 只改变人口与岗位增长的去向（总量仍按人口曲线），
    // relocate 为每月疏解比例，corridors 为片区间通勤与购物去向倍数，demand 为出行强度与距离倍数，goals 为阶段目标（本城任务）
    eras: [
      { id: 'hz-e1', from: 2000, name: '西湖时代', tag: '史实',
        summary: '史实：城市围绕西湖与京杭运河展开，湖滨、武林是商业中心，滨江与下沙的开发区刚刚起步；没有地铁。估算：西湖周边受风貌与限高保护，新增人口主要落在运河两岸、城西文教区与江干。',
        grow: { pop: { center: 0.6, chengzhan: 0.8, gongshu: 1.3, wenjiao: 1.3, jianggan: 1.2, xiacheng: 1.1 }, jobs: { center: 1.0, wenjiao: 1.2, binjiang: 1.3, xiasha: 1.3 } },
        demand: { decayHW: 0.9 }, corridors: [{ a: 'center', b: 'wenjiao', f: 1.1 }] },
      { id: 'hz-e2', from: 2001, name: '沿江开发期', tag: '史实',
        summary: '史实：2001 年萧山、余杭撤市设区，钱江新城开始建设；下沙高教园区陆续迁入高校，浙江大学紫金港校区 2002 年启用。估算：岗位向钱江新城与滨江转移，城西与城北成为主要的新增居住地，上学出行增加。',
        grow: { pop: { center: 0.55, xihuwest: 1.4, gongshu: 1.3, xiasha: 1.5, binjiang: 1.3, chengdong: 1.1 }, jobs: { qjxc: 2.0, binjiang: 1.7, xiasha: 1.4, xiaoshan: 1.2, center: 0.85 } },
        relocate: { jobs: { center: 0.0004 } },
        demand: { sc: 1.1, decayHW: 1.05 },
        corridors: [{ a: 'center', b: 'qjxc', f: 1.15 }, { a: 'xiasha', b: 'center', f: 1.1 }, { a: 'binjiang', b: 'center', f: 1.15 }],
        goals: [{ id: 'hz-g1', type: 'connect', months: 48, reward: 40000, title: '湖滨与钱江新城', desc: '钱江新城开始承接行政与商务功能，与湖滨老中心之间往来增多。用地铁连接湖滨与钱江新城。', anchors: [anchor('湖滨', 30.2580, 120.1640, 3), anchor('钱江新城', 30.2450, 120.2100, 4)] }] },
      { id: 'hz-e3', from: 2010, name: '跨江发展期', tag: '史实',
        summary: '史实：2011 年西湖列入世界遗产名录；2012 年地铁 1 号线通车（史实背景，不会自动建成）；2013 年杭州东站枢纽启用。估算：城东新城与滨江的岗位快速增长，城西的未来科技城成为新的就业组团，跨江通勤增加。',
        grow: { pop: { center: 0.5, chengdong: 1.4, xihuwest: 1.3, binjiang: 1.3, xiaoshan: 1.3, linping: 1.2 }, jobs: { qjxc: 1.8, binjiang: 1.8, weilai: 1.8, chengdong: 1.5, center: 0.8 } },
        relocate: { jobs: { center: 0.0005 }, pop: { center: 0.0003 } },
        demand: { sh: 1.05, lz: 1.1, decayHW: 1.1, hub: 1.1 },
        corridors: [{ a: 'binjiang', b: 'center', f: 1.2 }, { a: 'xiaoshan', b: 'qjxc', f: 1.2 }, { a: 'weilai', b: 'wenjiao', f: 1.15 }, { a: 'chengdong', b: 'qjxc', f: 1.15 }],
        goals: [{ id: 'hz-g2', type: 'connect', months: 48, reward: 45000, title: '未来科技城通勤', desc: '互联网企业在未来科技城集聚，员工多住在城西与文教区。用地铁连接未来科技城与文三路一带。', anchors: [anchor('未来科技城', 30.2880, 120.0200, 5), anchor('文三路一带', 30.2780, 120.1350, 4)] }] },
      { id: 'hz-e4', from: 2016, name: '钱塘江时代', tag: '史实',
        summary: '史实：2016 年 9 月 G20 峰会在杭州举行，城市随后进入亚运会筹办期（亚运会延至 2023 年举行）。估算：钱江新城与对岸的钱江世纪城形成双中心，滨江、萧山与未来科技城的岗位继续增长，老城人口缓慢外迁。',
        grow: { pop: { center: 0.5, xiaoshan: 1.4, linping: 1.3, weilai: 1.4, liangzhu: 1.2, chengdong: 1.2 }, jobs: { qjxc: 1.4, binjiang: 1.6, xiaoshan: 1.5, weilai: 1.8, center: 0.75 } },
        relocate: { jobs: { center: 0.0005 }, pop: { center: 0.0004 } },
        demand: { sh: 1.08, lz: 1.15, decayHW: 1.15 },
        corridors: [{ a: 'xiaoshan', b: 'qjxc', f: 1.25 }, { a: 'binjiang', b: 'qjxc', f: 1.2 }, { a: 'weilai', b: 'center', f: 1.15 }, { a: 'linping', b: 'chengdong', f: 1.15 }],
        goals: [{ id: 'hz-g3', type: 'connect', months: 48, reward: 45000, title: '钱江两岸双中心', desc: '钱江世纪城与钱江新城隔江相望，两岸商务往来频繁。用地铁连接钱江新城与钱江世纪城。', anchors: [anchor('钱江新城', 30.2450, 120.2100, 4), anchor('钱江世纪城', 30.2370, 120.2600, 4)] },
          { id: 'hz-g4', type: 'connect', months: 48, reward: 45000, title: '临平接入城东', desc: '临平的居民大量到城东与钱江新城上班。用地铁连接临平与杭州东站。', anchors: [anchor('临平', 30.4200, 120.3000, 4), anchor('杭州东站', 30.2900, 120.2130, 3)] }] },
      { id: 'hz-e5', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '模拟：此后的发展按模型推演，不代表真实历史。估算：城西科创走廊、萧山与临平继续成长，老城保持稳定。',
        grow: { pop: { weilai: 1.3, xiaoshan: 1.3, linping: 1.3, fuyang: 1.2, center: 0.6 }, jobs: { weilai: 1.5, xiaoshan: 1.3, binjiang: 1.3, center: 0.8 } },
        demand: { lz: 1.1, decayHW: 1.15 }, corridors: [{ a: 'weilai', b: 'qjxc', f: 1.15 }] },
    ],
    briefing: {
      lead: '2000 年的杭州还没有地铁。城市围着西湖与京杭运河展开，出行依靠公交与自行车；钱塘江南岸的滨江与萧山尚在起步，过江只有三座大桥。',
      modes: [['metro', '地铁', '尚无地铁，你将规划杭州的第一条线路。'], ['bus', '公交与自行车', '主城区道路狭窄，高峰拥堵集中在武林、湖滨与城站一带。'], ['bridge', '过江', '钱塘江上只有钱塘江大桥、彭埠大桥与西兴大桥，越江交通紧张。'], ['rail', '铁路', '城站（杭州站）1999 年刚完成改建，是主要的铁路枢纽。列车本身不参与模拟，但车站会产生市内接驳出行，地面铁路会阻隔步行。']],
    },
    airport: null,
    // 萧山机场跑道（v2.2）：第一跑道 2000 年 12 月、第二跑道 2012 年 12 月启用（史实）
    runways: [{ a: ll(30.2382, 120.4083), b: ll(30.2521, 120.4397), from: 2000.95 }, { a: ll(30.2221, 120.4178), b: ll(30.2369, 120.4511), from: 2012.95 }],
    regions: [
      { id: 'xsair', name: '萧山机场', poly: poly([[30.2550, 120.4403], [30.2550, 120.4463], [30.2523, 120.4488], [30.2465, 120.4522], [30.2406, 120.4596], [30.2353, 120.4535], [30.2192, 120.4171], [30.2183, 120.4093], [30.2249, 120.4106], [30.2271, 120.4016], [30.2314, 120.3991], [30.2344, 120.3989], [30.2394, 120.4052]]), open: null, hub: true, lockNote: '民用机场照常运营，用地不开发', note: '2000 年 12 月启用（史实）；重要交通枢纽：范围内可以地下设站与地下穿越（v2.2）' },
      { id: 'westlake', name: '西湖风景名胜区', scenic: true, open: null, geo: { reserve: '杭州西湖风景名胜区' }, relief: 360 },   // relief：三维山体的最高高度（米）
      { id: 'xixi', name: '西溪湿地', park: true, open: 2006, plan: 'res', geo: { reserve: '西溪国家湿地公园' }, note: '湿地保护区，保留为绿地' },
      { id: 'jianqiao', name: '城东待开发区', streets: ['笕桥街道'], open: 2005, plan: 'res' },
      { id: 'qjxc', name: '钱江新城', poly: qjxc, open: 2001, plan: 'cbd', note: '2001 年起建设钱江新城，杭州由「西湖时代」走向「钱塘江时代」（史实）' },
      { id: 'center', name: '湖滨·武林（老城中心）', streets: ['湖滨街道', '清波街道', '小营街道', '天水街道', '武林街道', '长庆街道', '潮鸣街道'], open: 2000, plan: 'cbd' },
      { id: 'chengzhan', name: '城站·南星', streets: ['望江街道', '紫阳街道', '南星街道'], open: 2000, plan: 'oldmix' },
      { id: 'xiacheng', name: '朝晖·文晖·石桥', streets: ['朝晖街道', '文晖街道', '东新街道', '石桥街道'], open: 2000, plan: 'mix' },
      { id: 'gongshu', name: '拱墅（运河两岸）', streets: ['米市巷街道', '湖墅街道', '小河街道', '和睦街道', '大关街道', '拱宸桥街道', '上塘街道', '祥符街道', '康桥街道', '半山街道'], open: 2000, plan: 'resind' },
      { id: 'jianggan', name: '江干（采荷·凯旋·四季青）', streets: ['采荷街道', '凯旋街道', '闸弄口街道', '四季青街道'], open: 2000, plan: 'res' },
      { id: 'wenjiao', name: '西湖区（文教区·黄龙）', streets: ['北山街道', '西溪街道', '翠苑街道', '文新街道', '古荡街道', '西湖街道', '灵隐街道'], open: 2000, plan: 'campus' },
      { id: 'binjiang', name: '滨江（高新区）', district: ['滨江区'], open: 2000, plan: 'mix', note: '1996 年设立滨江区，发展高新技术产业（史实）' },
      // 大江东与萧山东部（v2.2 地图向东扩大后位于图内）：比下沙、萧山城区晚开发
      { id: 'dajiangdong', name: '大江东（河庄·义蓬）', streets: ['河庄街道', '义蓬街道', '新湾街道', '临江街道', '前进街道'], open: 2012, plan: 'ind', pop: 6.5e6, note: '2010 年设立大江东产业集聚区（史实）' },
      { id: 'xiaoshane', name: '萧山东部（瓜沥·靖江·南阳）', streets: ['瓜沥镇', '靖江街道', '南阳街道', '衙前镇', '党湾镇', '益农镇'], open: 2006, plan: 'resind', pop: 5.0e6, note: '萧山机场周边与东部镇街，2000 年代中期起随机场与产业园区发展（估算）' },
      { id: 'xiasha', name: '下沙（开发区·高教园区）', district: ['钱塘区'], open: 2004, plan: 'ind', note: '下沙经济技术开发区与高教园区（史实）' },
      { id: 'xiaoshan', name: '萧山', district: ['萧山区'], open: 2002, plan: 'resind', note: '2001 年 3 月萧山撤市设区（史实）' },
      { id: 'chengdong', name: '城东（彭埠·笕桥·丁兰·九堡）', streets: ['彭埠街道', '笕桥街道', '丁兰街道', '九堡街道'], open: 2004, plan: 'res', pop: 4.6e6, note: '城东新城与杭州东站枢纽开发（史实）' },
      { id: 'xihuwest', name: '城西（蒋村·留下·三墩·转塘）', streets: ['蒋村街道', '留下街道', '三墩镇', '转塘街道', '双浦镇'], open: 2007, plan: 'res', pop: 5.1e6 },
      // v2.1 扩大范围：余杭、临平与富阳（区域开放年份为史实参考）
      { id: 'linping', name: '临平（余杭城区·乔司·星桥）', streets: ['南苑街道', '临平街道', '东湖街道', '星桥街道', '乔司街道', '崇贤街道', '仁和街道', '塘栖镇', '许村镇'], district: ['临平区'], open: 2008, pop: 5.5e6, plan: 'resind', note: '2001 年 3 月余杭撤市设区，临平为区政府所在地（史实）' },
      { id: 'liangzhu', name: '良渚·瓶窑', streets: ['良渚街道', '瓶窑镇'], open: 2009, plan: 'res', pop: 5.5e6, note: '2000 年代良渚一带建成大型居住区（史实）' },
      { id: 'weilai', name: '未来科技城（五常·闲林·仓前）', streets: ['五常街道', '闲林街道', '仓前街道', '余杭街道', '中泰街道'], open: 2011, plan: 'mix', pop: 6.15e6, note: '2011 年起建设杭州未来科技城（史实）' },
      { id: 'fuyang', name: '富阳（银湖）', district: ['富阳区'], open: 2014, plan: 'res', pop: 6.7e6, note: '2014 年富阳撤市设区（史实）' },
    ],
    defaultRegion: { id: 'outer', name: '外围（海宁·柯桥等）', open: 2012, plan: 'res', pop: 6.1e6 },
    plans: CM.DATA.plans,
    // 2000 年人口与就业中心（估算，人/km²；r 约为影响半径 km）
    centers: [
      at(30.2620, 120.1680, { pop: 30000, jobs: 60000, r: 1.2 }),   // 武林、湖滨
      at(30.2450, 120.1760, { pop: 35000, jobs: 25000, r: 1.2 }),   // 城站、清河坊
      at(30.2850, 120.1700, { pop: 30000, jobs: 15000, r: 1.2 }),   // 朝晖、文晖
      at(30.3000, 120.1500, { pop: 25000, jobs: 12000, r: 1.4 }),   // 湖墅、大关
      at(30.2780, 120.1350, { pop: 25000, jobs: 25000, r: 1.3 }),   // 文教区、黄龙
      at(30.2650, 120.1950, { pop: 28000, jobs: 8000, r: 1.1 }),    // 采荷、凯旋
      at(30.3200, 120.1800, { pop: 8000, jobs: 15000, r: 1.5 }),    // 半山、石桥（工业）
      at(30.2850, 120.1150, { pop: 15000, jobs: 6000, r: 1.2 }),    // 古荡、翠苑
      at(30.2250, 120.1700, { pop: 12000, jobs: 10000, r: 1.0 }),   // 南星、闸口
      at(30.2100, 120.2100, { pop: 3000, jobs: 3000, r: 1.5 }),     // 滨江
      at(30.1650, 120.2650, { pop: 20000, jobs: 12000, r: 1.5 }),   // 萧山城区
      at(30.3050, 120.3350, { pop: 2000, jobs: 4000, r: 1.6 }),     // 下沙
      at(30.3000, 120.2100, { pop: 5000, jobs: 4000, r: 1.4 }),     // 笕桥、彭埠
      // v2.1 扩大范围（2000 年估算）
      at(30.4200, 120.3000, { pop: 15000, jobs: 8000, r: 1.5 }),    // 临平
      at(30.3800, 120.2700, { pop: 4000, jobs: 4000, r: 1.3 }),     // 乔司
      at(30.3650, 120.0300, { pop: 3000, jobs: 1500, r: 1.5 }),     // 良渚
      at(30.2800, 120.0300, { pop: 2500, jobs: 1500, r: 1.5 }),     // 五常、闲林
    ],
    rural: { pop: 600, jobs: 150 },
    roadYears: {
      '钱塘江大桥': 1937, '彭埠大桥': 1991, '复兴大桥': 2004, '之江大桥': 2013, '九堡大桥': 2012, '文晖大桥': 1998,
      '中河高架路': 1999, '上塘高架路': 2002, '秋石高架路': 2006, '德胜快速路': 2006, '时代高架路': 2009, '留石高架路': 2015,
      '东湖高架路': 2018, '莫干山高架路': 2019, '通城高架路': 2010, '空港高架路': 2016, '塘新线高架路': 2018, '彩虹快速路': 2019,
      '风情快速路': 2017, '风情大道快速路': 2017, '钱塘快速路': 2019, '紫之隧道': 2016, '庆春隧道': 2010, '钱江路隧道': 2014,
      '望江隧道': 2020, '博奥隧道': 2015, '文一路隧道': 2018, '文一西路隧道': 2018, '紫金港路隧道': 2018, '紫金港路南隧道': 2018,
      '之江路隧道': 2016, '西湖隧道': 2003, '万松岭隧道': 2004, '吉庆山隧道': 2004, '五老峰隧道': 2004, '玉皇山隧道': 2004,
      '九曜山隧道': 2004, '灵溪隧道': 2013, '九里松隧道': 2015, '西山隧道': 2006, '江南大道地下隧道': 2016,
      '杭州绕城高速': 2003, '杭甬高速': 1996, '沪昆高速': 1998, '机场高速': 2000, '长深高速': 2008, '杭长宜高速': 2010,
    },
    bridgeYears: {}, bridgeDefaultYear: 2000,
    simRoads: [],
    landmarks: [
      Object.assign(at(30.19830, 120.12661), { id: 'hz_liuhe', name: '六和塔', w: 60, d: 60, year: 1900, kind: 'pagoda', h: 60 }),
      Object.assign(at(30.2420, 120.0990), { id: 'hz_lingyin', name: '灵隐寺', w: 200, d: 300, year: 1950, kind: 'temple' }),
      Object.assign(at(30.26656, 120.11834), { id: 'hz_zju', name: '浙江大学（玉泉）', w: 900, d: 700, year: 1928, kind: 'campus' }),
      Object.assign(at(30.2437, 120.1826), { id: 'hz_station', name: '杭州站', w: 300, d: 160, year: 1999, kind: 'rail' }),
      // v2.3 位置校正：体育场在黄龙路以西、天目山路与曙光路之间（原坐标偏东约 1 km）
      Object.assign(at(30.2698, 120.1288), { id: 'hz_huanglong', name: '黄龙体育中心', w: 400, d: 300, year: 2000, kind: 'stadium' }),
      Object.assign(at(30.23388, 120.14501), { id: 'hz_leifeng', name: '雷峰塔', w: 70, d: 70, year: 2002, kind: 'pagoda', h: 72 }),
      Object.assign(at(30.30508, 120.07534), { id: 'hz_zjg', name: '浙江大学（紫金港）', w: 1600, d: 1300, year: 2002, kind: 'campus' }),
      Object.assign(at(30.24662, 120.21099), { id: 'hz_opera', name: '杭州大剧院', w: 260, d: 160, year: 2004, kind: 'opera' }),
      Object.assign(at(30.2464, 120.2108), { id: 'hz_icc', name: '杭州国际会议中心', w: 120, d: 120, year: 2008, kind: 'hall' }),
      Object.assign(at(30.2906, 120.2128), { id: 'hz_east', name: '杭州东站', w: 700, d: 450, rot: 90, year: 2013, kind: 'rail' }),
      Object.assign(at(30.2290, 120.2280), { id: 'hz_olympic', name: '杭州奥体中心体育场', w: 380, d: 360, year: 2018, kind: 'stadium' }),
    ],
    // 重要设施（v1.9，见 facility.js）：位置与启用/停用年份为史实参考（位置近似）；规模均为估算。
    // 枢纽 pax：市内接驳出行（汽车 + 地铁，万人次/日）；萧山国际机场位于图内东部（v2.2）；杭州西站在地图范围外，不模拟。
    facilities: [
      { id: 'hz_station', n: '杭州站（城站）', t: 'rail', lm: 'hz_station', pax: [[2000, 4.5], [2010, 6.5], [2013, 4], [2020, 3.5]] },
      { id: 'hz_east', n: '杭州东站', t: 'rail', lm: 'hz_east', y0: [2013, 7], pax: [[2013.5, 6], [2015, 9], [2019, 12], [2030, 13]] },
      { id: 'hz_west', n: '杭州西站', t: 'rail', at: ll(30.3008, 119.9840), y0: [2022, 9], pax: [[2022.7, 1.5], [2025, 3], [2030, 4]], note: '2022 年 9 月随湖杭高铁启用，位于城西科创走廊北端（旅客量为估算）。' },
      { id: 'hz_south', n: '杭州南站（萧山）', t: 'rail', at: ll(30.1790, 120.2970), pax: [[2000, 0.6], [2012, 0.8], [2013, 0.2], [2018.9, 0.2], [2019, 3], [2030, 4]], note: '2013–2018 年改建期间旅客很少，2019 年新站启用。' },
      { id: 'hz_xsair', n: '萧山机场', t: 'air', at: ll(30.2400, 120.4300), rw: [ll(30.2382, 120.4083), ll(30.2521, 120.4397)], y0: [2000, 12], pax: [[2000.95, 1], [2005, 2], [2010, 3.2], [2019, 5], [2030, 6]], note: '萧山国际机场，v2.2 地图向东扩大后位于图内。2000 年 12 月机场启用后产生往返机场的出行；需求点设在两条跑道之间的航站区。' },
      { id: 'hz_zju', n: '浙江大学（玉泉）', t: 'uni', lm: 'hz_zju', w: 0.025 },
      { id: 'hz_zjg', n: '浙江大学（紫金港）', t: 'uni', lm: 'hz_zjg', w: [[2002, 0.02], [2010, 0.035]] },
      { id: 'hz_xiasha', n: '下沙高教园区', t: 'uni', at: ll(30.3100, 120.3500), r: 2.5, y0: 2001, w: [[2001, 0.015], [2010, 0.05]] },
      { id: 'hz_binjiang', n: '滨江高教园区', t: 'uni', at: ll(30.2120, 120.2100), r: 1.8, y0: 2003, w: [[2003, 0.008], [2010, 0.025]] },
      { id: 'hz_zjut', n: '浙江工业大学（朝晖）', t: 'uni', at: ll(30.2930, 120.1640), w: 0.012 },
      { id: 'hz_zy1', n: '浙大一院', t: 'hosp', at: ll(30.25800, 120.17350), w: 0.06 },
      { id: 'hz_zy2', n: '浙大二院', t: 'hosp', at: ll(30.25333, 120.17331), w: 0.055 },
      { id: 'hz_zjph', n: '浙江省人民医院', t: 'hosp', at: ll(30.28755, 120.16392), w: 0.045 },
      { id: 'hz_srrsh', n: '邵逸夫医院', t: 'hosp', at: ll(30.2620, 120.2050), w: 0.04 },
      { id: 'hz_hz1', n: '杭州市第一人民医院', t: 'hosp', at: ll(30.25721, 120.16202), w: 0.035 },
      { id: 'hz_hubin', n: '湖滨商圈', t: 'shop', at: ll(30.2580, 120.1660), w: [[2000, 0.05], [2010, 0.06]] },
      { id: 'hz_wulin', n: '武林商圈', t: 'shop', at: ll(30.2740, 120.1670), w: 0.045 },
      { id: 'hz_hefang', n: '河坊街·吴山', t: 'shop', at: ll(30.2430, 120.1700), p: { sh: 0.5, lz: 0.5 }, w: 0.02 },
      { id: 'hz_qjxc', n: '钱江新城商务区', t: 'cbd', at: ll(30.2470, 120.2110), y0: [2001, 7], w: [[2001.5, 0.002], [2010, 0.02], [2020, 0.035]] },
      { id: 'hz_westlake', n: '西湖风景区（湖滨）', t: 'scenic', at: ll(30.2560, 120.1600), r: 2, w: 0.08 },
      { id: 'hz_lingyin', n: '灵隐寺', t: 'scenic', lm: 'hz_lingyin', w: 0.02 },
      { id: 'hz_leifeng', n: '雷峰塔', t: 'scenic', lm: 'hz_leifeng', w: 0.015 },
      { id: 'hz_liuhe', n: '六和塔', t: 'scenic', at: ll(30.19830, 120.12661), w: 0.006 },
      { id: 'hz_xixi', n: '西溪国家湿地公园', t: 'park', at: ll(30.26730, 120.06326), r: 2, y0: [2005, 5], w: 0.02 },
      { id: 'hz_songcheng', n: '宋城', t: 'scenic', at: ll(30.17215, 120.09416), w: 0.012 },
      { id: 'hz_zoo', n: '杭州动物园', t: 'scenic', at: ll(30.21568, 120.13046), w: 0.01 },
      { id: 'hz_gongchen', n: '拱宸桥·大运河', t: 'scenic', at: ll(30.32046, 120.13392), w: 0.008 },
      { id: 'hz_huanglong', n: '黄龙体育中心', t: 'stadium', lm: 'hz_huanglong', w: 0.015 },
      { id: 'hz_olympic', n: '杭州奥体中心', t: 'stadium', lm: 'hz_olympic', w: 0.01 },
      { id: 'hz_expo', n: '杭州国际博览中心', t: 'venue', at: ll(30.2310, 120.2360), y0: [2016, 9], w: 0.01 },
      { id: 'hz_icc', n: '杭州国际会议中心', t: 'venue', lm: 'hz_icc', w: 0.005 },
    ],
    districtLabels: [['武林', ['武林街道', '天水街道', '长庆街道', '潮鸣街道']], ['湖滨', ['湖滨街道', '清波街道', '小营街道']], ['城站', ['紫阳街道', '望江街道', '南星街道']], ['朝晖', ['朝晖街道', '文晖街道']], ['拱墅', ['湖墅街道', '米市巷街道', '小河街道', '大关街道', '和睦街道', '拱宸桥街道']], ['文教区', ['北山街道', '西溪街道', '翠苑街道', '文新街道', '古荡街道']], ['江干', ['采荷街道', '凯旋街道', '闸弄口街道']], ['钱江新城', ['四季青街道']], ['城东', ['彭埠街道', '笕桥街道', '丁兰街道', '九堡街道']], ['滨江', ['西兴街道', '长河街道', '浦沿街道']], ['萧山', ['城厢街道', '北干街道', '蜀山街道']], ['下沙', ['下沙街道', '白杨街道']], ['三墩', ['三墩镇']], ['转塘', ['转塘街道']]],
    events: [
      { y: 2000, m: 1, tag: '史实', title: '2000 年的杭州', desc: '市区人口约 300 万，城市集中在西湖东岸与京杭运河两侧，钱塘江南岸的滨江与萧山尚待开发；没有地铁，出行依靠公交与自行车。' },
      { y: 2001, m: 3, tag: '史实', title: '萧山、余杭撤市设区', desc: '杭州市区面积大幅扩大，城市开始跨江发展。', fx: { grow: { region: ['xiaoshan', 'linping'], pop: 1.3, years: 4 } } },
      { y: 2001, m: 7, tag: '史实', title: '钱江新城开始建设', desc: '沿钱塘江北岸建设新的城市中心，杭州由「西湖时代」走向「钱塘江时代」。', fx: { grow: { region: 'qjxc', jobs: 1.6, years: 8 } } },
      { y: 2002, m: 10, tag: '史实', title: '雷峰塔重建落成', desc: '在原塔遗址上重建，西湖南线景区随之整治开放。' },
      { y: 2011, m: 6, tag: '史实', title: '西湖列入世界遗产名录', desc: '杭州西湖文化景观列入联合国教科文组织世界遗产名录。', fx: { demand: { lz: 1.1, months: 24 }, sat: { v: 1, months: 12 } } },
      { y: 2013, m: 7, tag: '史实', title: '杭州东站枢纽启用', desc: '高速铁路主要在新的杭州东站停靠，城东新城加快发展。', fx: { grow: { region: 'chengdong', pop: 1.2, jobs: 1.4, years: 6 } } },
      { y: 2014, m: 6, tag: '史实', title: '大运河列入世界遗产名录', desc: '京杭大运河杭州段是其中的重要组成部分。' },
      { y: 2016, m: 9, tag: '史实', title: 'G20 杭州峰会', desc: '二十国集团领导人峰会在杭州国际博览中心举行。', fx: { demand: { hw: 0.75, sc: 0.75, lz: 0.8, months: 1 }, sat: { v: 1.5, months: 6 } } },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后人口、道路和区域变化按模拟规则推演，不代表真实历史。' },
      // v2.2 新增（追加在末尾，保持已有事件的序号与存档一致）
      { y: 2022, m: 9, tag: '史实', title: '杭州西站启用', desc: '湖杭高铁开通，城西科创走廊北端形成新的铁路枢纽。', fx: { grow: { region: 'weilai', pop: 1.15, jobs: 1.2, years: 5 } } },
      { y: 2023, m: 9, tag: '史实', title: '杭州亚运会', desc: '第 19 届亚运会在杭州举行（原定 2022 年，延期一年），主场馆位于钱塘江南岸的奥体中心。', fx: { demand: { lz: 1.25, hub: 1.15, months: 1 }, sat: { v: 2, months: 6 } } },
    ],
    // 本地历史主题任务：参考杭州的发展需求，不要求复刻真实线路走向（奖励单位：万元）
    histTasks: [
      { id: 'hz1', appear: [2002, 1], deadline: [2012, 12], type: 'connect', reward: 60000, title: '跨越钱塘江', desc: '连接武林广场、城站与滨江，第一条跨越钱塘江的地铁。过江段可以建设越江隧道。', anchors: [anchor('武林广场', 30.2723, 120.1651, 3), anchor('城站', 30.2437, 120.1826, 3), anchor('滨江', 30.2085, 120.2120, 3)] },
      { id: 'hz2', appear: [2001, 6], deadline: [2012, 12], type: 'connect', reward: 50000, title: '萧山接入市区', desc: '撤市设区后，连接萧山城区、滨江与钱江新城。', anchors: [anchor('萧山', 30.1650, 120.2650, 3), anchor('滨江', 30.2085, 120.2120, 3), anchor('钱江新城', 30.2465, 120.2125, 3)] },
      { id: 'hz3', appear: [2003, 1], deadline: [2014, 12], type: 'connect', reward: 50000, title: '下沙高教园区', desc: '连接下沙、九堡与钱江新城。', anchors: [anchor('下沙', 30.3080, 120.3400, 3), anchor('九堡', 30.3060, 120.2700, 3), anchor('钱江新城', 30.2465, 120.2125, 3)] },
      { id: 'hz4', appear: [2003, 1], deadline: [2012, 12], type: 'connect', reward: 40000, title: '紫金港新校区', desc: '连接浙江大学紫金港校区、黄龙与武林广场。', anchors: [anchor('紫金港', 30.3040, 120.0855, 3), anchor('黄龙', 30.2683, 120.1395, 3), anchor('武林广场', 30.2723, 120.1651, 3)] },
      { id: 'hz5', appear: [2010, 1], deadline: [2015, 12], type: 'connect', reward: 50000, title: '杭州东站枢纽', desc: '新的杭州东站启用后，连接东站、武林广场与城站。', anchors: [anchor('杭州东站', 30.2906, 120.2128, 3), anchor('武林广场', 30.2723, 120.1651, 3), anchor('城站', 30.2437, 120.1826, 3)] },
      { id: 'hz6', appear: [2010, 1], deadline: [2016, 8], type: 'coverage', target: 0.3, reward: 70000, title: '迎接 G20 峰会', desc: '2016 年 9 月峰会前，步行 15 分钟可到达地铁站的人口不低于全市人口的 30%。' },
      { id: 'hz7', appear: [2016, 1], deadline: [2023, 8], type: 'connect', reward: 60000, title: '亚运会：奥体中心', desc: '连接杭州奥体中心、钱江新城与杭州东站。', anchors: [anchor('奥体中心', 30.2290, 120.2280, 3), anchor('钱江新城', 30.2465, 120.2125, 3), anchor('杭州东站', 30.2906, 120.2128, 3)] },
    ],
    taskNote: '历史主题任务参考杭州 2000 年起的发展需求（跨江、撤市设区、高教园区、东站枢纽、G20 与亚运会），不要求按真实线路走向建设，只需满足目标描述。',
    // 城市策略难题（v2.3，可选挑战）
    scenarios: [
      { id: 'hz-sc1', theme: '杭州：西湖保护与钱塘江', title: '过江，但别碰西湖', type: 'budgetConnect', from: [2002, 1], to: [2014, 12], months: 60, rewardMonths: 3, budgetX: 1.2,
        anchors: [['武林广场', 3], ['城站', 3], ['江陵路', 3]],
        desc: '西湖风景区不能随意设站，穿越还要付环境保护费；钱塘江隧道又很贵。用有限的预算把老城中心接到江对岸的滨江。',
        tips: ['沿湖东侧的老城走，不穿过风景区', '过江选江面较窄的位置，一次过江', '老城段站距可以短，滨江段可以长'] },
      { id: 'hz-sc2', theme: '杭州：新城与老城', title: '让钱江新城和滨江用上地铁', type: 'regionCov', from: [2008, 1], to: [2020, 12], months: 48, rewardMonths: 3,
        regions: ['qjxc', 'binjiang'], areaName: '钱江新城与滨江', target: 0.5,
        desc: '城市跨过钱塘江向东、向南发展，新城的人口和岗位越来越多，地铁却还集中在湖滨老城。让新城一半以上的人步行就能到地铁站。',
        tips: ['打开「地铁覆盖」图层，看新城哪里是空白', '新城道路宽、街区大，站点要放在人口最密处', '用支线或延伸线接入，比另起一条新线便宜'] },
    ],
    dataNote: [
      ['真实地理', 'hist', '钱塘江与西湖水系、道路与桥隧、铁路、公园与风景区、街道边界与地名来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），为现代数据，按 250 m 网格投影。'],
      ['史实参考', 'hist', '萧山、余杭撤市设区（2001 年）、钱江新城与城东新城开发、过江大桥与城市快速路通车年份、地标落成年份。'],
      ['估算', 'est', '2000 年人口与就业分布、人口增长曲线、出行率、时间价值、造价、票价与运营费用。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。普通铁路与高速铁路不参与乘客出行与运营模拟，车站与民用机场的旅客量为估算、只模拟其市内接驳出行；地面铁路按真实线位阻隔步行与小路；真实的杭州地铁不会自动出现。'],
      ['', '', '模拟结果不得作为真实杭州交通规划预测。'],
    ],
    // 线路配色参考杭州地铁
    lineColorsNice: ['#e2231a', '#f39800', '#ffd400', '#00a651', '#00a0e9', '#0062ac', '#8f3f97', '#a3154d', '#a0522d', '#8fc31f', '#e4007f', '#00b2a9'],
    places: (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; }),
  };

  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'hz', name: '杭州', title: '杭州 · 2000', sub: '真实地理 · 2000 年起 · 人民币',
    desc: '从 2000 年尚无地铁的杭州开始：城市围绕西湖与运河，钱塘江南岸的滨江、萧山即将并入市区。西湖风景区与西溪湿地不能开发，跨越钱塘江需要建设越江隧道。',
    facts: [['范围', '47 km × 34 km'], ['起始', '2000 年'], ['人口', '约 420 万'], ['货币', '人民币（元）'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 4, extent: [{ from: 1, dx: 32, dy: 36, oldW: 112, oldH: 88, newW: 144, newH: 136, note: '地图向西扩大到余杭（闲林、五常方向），向北到良渚与临平方向，向南多覆盖萧山城区', oldRegionIds: ['westlake', 'xixi', 'jianqiao', 'qjxc', 'center', 'chengzhan', 'xiacheng', 'gongshu', 'jianggan', 'wenjiao', 'binjiang', 'xiasha', 'xiaoshan', 'chengdong', 'xihuwest', 'outer'], oldLandmarkIds: ['hz_liuhe', 'hz_lingyin', 'hz_zju', 'hz_station', 'hz_huanglong', 'hz_leifeng', 'hz_zjg', 'hz_opera', 'hz_icc', 'hz_east', 'hz_olympic'] },
      // 第 2 版与第 3 版格网相同（只调整了展示，见 maps.js），第 3→4 版向东扩大到萧山机场
      { from: 3, dx: 0, dy: 0, oldW: 144, oldH: 136, note: '地图向东扩大到萧山机场与大江东一带',
        oldRegionIds: ['westlake', 'xixi', 'jianqiao', 'qjxc', 'center', 'chengzhan', 'xiacheng', 'gongshu', 'jianggan', 'wenjiao', 'binjiang', 'xiasha', 'xiaoshan', 'chengdong', 'xihuwest', 'linping', 'liangzhu', 'weilai', 'fuyang', 'outer'] }],
    scenario: 'hz-2000',
    region: '中国内地', tagline: '从西湖时代走向钱塘江时代', difficulty: 2, tags: ['无地铁开局', '越江', '风景区'],
    intro: '2000 年的杭州围着西湖与运河生长，还没有地铁。一年后萧山、余杭并入市区，钱江新城在江边破土，城市开始跨过钱塘江。西湖风景区与西溪湿地不能开发，你要在湖山与新城之间找到线路的走法。',
    features: [['wave', '钱塘江越江', '江面宽阔，越江隧道造价不低'], ['mountain', '西湖不可开发', '风景区只能从地下穿过，或绕行'], ['building', '钱江新城与东站', '新中心与高铁枢纽随年份出现'], ['flag', 'G20 与亚运会', '历史任务跟随城市大事']],
    highlights: [[2001, '萧山、余杭撤市设区'], [2001, '钱江新城开工'], [2002, '雷峰塔重建'], [2013, '杭州东站枢纽启用'], [2016, 'G20 杭州峰会']],
    geo: G, data: data,
    econ: { devOffset: 3, money: 1 },   // 出行选择参数：杭州 2000 年约对应广州样本 2003 年的发展阶段
    cfg: {
      W: 188, H: 136, START: { y: 2000, m: 1, d: 1, minute: 360 },   // v2.2：向东扩大 44 格到萧山机场
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[2000, 4.2e6], [2005, 4.9e6], [2010, 5.9e6], [2015, 6.8e6], [2020, 8.3e6], [2030, 9.3e6], [2050, 10.1e6], [2300, 10.7e6]], histEnd: 2020, jobsRatio: [[2000, 0.52], [2010, 0.56], [2020, 0.58], [2040, 0.6]] }),
      money: { code: 'CNY', unit: '元', wan: '万元', yi: '亿元', sym: '¥' },
      econBase: 2000,
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 50000, surface: 9000, elevated: 20000 },
        riverPerKm: { underground: 30000, surface: 22000, elevated: 22000 },   // 钱塘江越江隧道 / 跨江桥梁附加
        hillPerKm: 15000, protectedPerKm: 8000,
        station: { underground: { S: 22000, M: 35000, L: 55000 }, elevated: { S: 12000, M: 19000, L: 28000 }, surface: { S: 7000, M: 11000, L: 16000 } },
        demolishPerCell: 50000,
      }),
      ops: Object.assign({}, CM.CFG.ops, { carKmCost: 0.0013, stationDaily: { S: 2.2, M: 3.8, L: 6.5 } }),
      fareDefault: { mode: 'flat', flat: 3 }, fareRange: { min: 0, max: 10, step: 0.1, scale: true },
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 500000, grantBase: [[2000, 25000], [2005, 40000], [2010, 75000], [2015, 100000], [2020, 120000], [2050, 180000]], debtLimit: -300000, rewardScale: 1.6 }),
      // 城市经济（macro.js）：2000 年地图范围 GDP 约 800 亿元（估算：杭州全市约 1380 亿元，地图覆盖主城与钱江两岸）；
      // 民营经济与外贸活跃，旅游消费比重高；数字经济在 2010 年代成为增长动力（体现在生产率趋势中）
      macro: {
        area: '地图范围（主城、西湖周边、钱江两岸与滨江）', region: '中国内地',
        gdp0: 11200000, revRatio: [[2000, 0.15], [2010, 0.19], [2020, 0.2], [2040, 0.18]], revElastic: 1.5,
        prod: [[2000, 0.085], [2005, 0.085], [2008, 0.07], [2011, 0.06], [2015, 0.052], [2020, 0.04], [2030, 0.025], [2050, 0.015], [2080, 0.012]],
        infl: 'cn', longRun: { infl: 0.02 }, histEnd: 2020, ref: 'cn',
        struct: { trade: 0.6, fin: 0.35, ind: 0.5, tour: 0.6, prop: 0.5 },
        events: [
          { id: 'wto2001', y: 2001, m: 12, desc: '关税下降、外资准入放宽，浙江的民营制造业与外贸进入快速扩张期。' },
          { id: 'sars2003', y: 2003, m: 4, scale: 0.6 },
          { id: 'tight2004', y: 2004, m: 4 },
          { id: 'gfc2008', y: 2008, m: 9, desc: '外需骤降冲击浙江的出口加工业，杭州的外贸与制造业订单明显减少。' },
          { id: 'stim2008', y: 2008, m: 11 },
          { id: 'cnstock2015', y: 2015, m: 6 },
          { id: 'g20_2016', y: 2016, m: 9 },
          { id: 'trade2018', y: 2018, m: 7 },
          { id: 'covid2020', y: 2020, m: 1, scale: 0.6, fx: { demand: { sc: 0.7, sh: 0.8, lz: 0.6, hub: 0.5, months: 3, fade: 1 } } },
        ],
      },
    },
    cam: { cx: 74, cy: 78, zoom: 16 },
  });
})(window.CM);
