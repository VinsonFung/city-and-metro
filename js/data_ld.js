'use strict';
// 伦敦 · 1860 场景（v2.6）。地理来自 OpenStreetMap（geo_ld.js，现代数据；英文地名按 scripts/osm-names-ld.txt 转为简体中文），本文件补充 1860 年起的区域开放、
// 道路通车年份、人口就业中心、地标、重要设施、历史事件、本地任务与英镑经营参数。坐标单位为格（250 m），用 ll(纬度, 经度)（WGS-84）换算。
// 1860 年世界上还没有一条地铁（大都会铁路当年开工，1863 年通车），所以没有可接管的线路：由玩家修第一条。真实线路只作史实背景，不会自动出现。
// 地图特色（data.traits）：泰晤士河与历史城区（只能走地下、造价更高）；码头区衰落与金丝雀码头崛起；
// 地铁、公交、电车与市郊铁路的竞争（D.bg.modes、roadKeep）；两次世界大战对人口、岗位、财政与客流的影响（事件 fx.strike、fx.finance、fx.demand）。
// 真实性：历史事件、地标落成年份与主要道路通车年份为史实参考；人口与就业分布、增长曲线、物价指数（参考英国消费价格的公开统计取近似值）、造价、票价、拨款、GDP 与利率为估算；2020 年之后为模拟。
// 不收录军事设施：诺索尔特等军用机场与军事用地范围内的地名、绿地名称和小路已在地理数据生成时剔除。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.ld; if (!G) return;
  const U = CM.U;
  const P = G.proj, ll = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const poly = function (pts) { return pts.map(function (p) { return ll(p[0], p[1]); }); };
  const R4 = function (n, s, w, e) { return poly([[n, w], [n, e], [s, e], [s, w]]); };
  const at = function (lat, lon, o) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const anchor = function (name, lat, lon, r) { const p = ll(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };
  // 任务与设施按 OSM 同名车站校正位置（地铁站优先，其次铁路车站）
  const ST = {}; for (const k of [0, 1]) for (const p of G.places || []) if (p[3] === k && !ST[p[0]]) ST[p[0]] = p;

  // ---------------- 物价 ----------------
  // 英国消费价格年涨幅（近似值，按公开统计取整）：UK_R[i] 为 1860 + i 年内的涨幅。1873–1896 年的长期通缩使 1900 年物价略低于 1860 年，之后到 2020 年约涨一百多倍（量级与公开换算一致）
  const Y0 = 1860;
  const UK_R = [
    0.02, 0.01, -0.01, -0.02, 0.01, 0.01, 0.02, 0.02, -0.01, -0.01,                                   // 1860–1869
    0, 0.02, 0.05, 0.02, -0.02, -0.02, -0.01, 0, -0.03, -0.03,                                        // 1870–1879
    0.01, -0.02, 0, -0.01, -0.03, -0.03, -0.02, -0.01, 0, 0.01,                                       // 1880–1889
    0.01, 0.01, -0.01, -0.01, -0.03, -0.01, 0, 0.01, 0.01, 0,                                         // 1890–1899
    0.03, -0.01, 0, 0.01, 0, 0, 0.01, 0.01, -0.02, 0.01, 0.01, 0.01, 0.03, 0,                        // 1900–1913
    0.02, 0.12, 0.18, 0.25, 0.22, 0.1, 0.15, -0.09, -0.19, -0.03, 0.01, 0.01, -0.01, -0.02, 0, -0.01, // 1914–1929
    -0.03, -0.06, -0.02, -0.02, 0, 0.01, 0.01, 0.04, 0.02, 0.03,                                      // 1930–1939
    0.17, 0.1, 0.04, 0.02, 0.02, 0.02, 0.03, 0.07, 0.08, 0.03,                                        // 1940–1949
    0.03, 0.09, 0.09, 0.03, 0.02, 0.04, 0.05, 0.04, 0.03, 0.01,                                       // 1950–1959
    0.01, 0.03, 0.04, 0.02, 0.03, 0.05, 0.04, 0.02, 0.05, 0.05,                                       // 1960–1969
    0.06, 0.09, 0.07, 0.09, 0.16, 0.24, 0.17, 0.16, 0.08, 0.13,                                       // 1970–1979
    0.18, 0.12, 0.09, 0.05, 0.05, 0.06, 0.03, 0.04, 0.05, 0.08,                                       // 1980–1989
    0.1, 0.06, 0.04, 0.03, 0.02, 0.03, 0.02, 0.03, 0.03, 0.02,                                        // 1990–1999
    0.03, 0.02, 0.02, 0.03, 0.03, 0.03, 0.03, 0.04, 0.04, 0,                                          // 2000–2009
    0.05, 0.05, 0.03, 0.03, 0.02, 0.01, 0.02, 0.04, 0.03, 0.03, 0.015,                                // 2010–2020
  ];
  const UK_INFL = UK_R.map(function (r, i) { return [Y0 + i, r]; });
  // 造价与运营费相对物价的实际上涨（估算）：1950 年以前电气化与设备进步抵消了大部分人工上涨，之后才明显高于物价
  const LONG_INFL = 0.02, COST_PREM = function (y) { return y < 1950 ? 0.005 : 0.015; }, OPS_PREM = function (y) { return y < 1950 ? 0.003 : 0.018; };
  const COST_INFL = UK_R.map(function (r, i) { return [Y0 + i, r + COST_PREM(Y0 + i)]; }).concat([[2021, LONG_INFL + COST_PREM(2021)]]);
  const OPS_INFL = UK_R.map(function (r, i) { return [Y0 + i, r + OPS_PREM(Y0 + i)]; }).concat([[2021, LONG_INFL + OPS_PREM(2021)]]);
  const level = function (y, prem) { let f = 1; for (let t = Y0; t < y; t++) f *= 1 + (t - Y0 < UK_R.length ? UK_R[t - Y0] : LONG_INFL) + (prem ? prem(t) : 0); return f; };
  const nominal = function (real, years, prem) { return years.map(function (y) { return [y, +(U.interp(real, y) * level(y, prem || 0)).toPrecision(4)]; }); };
  const YEARS = []; for (let y = Y0; y <= 2020; y += 2) YEARS.push(y); YEARS.push(2030, 2050);

  // 背景交通（估算）：非地铁出行里，不占道路的部分。modes 为各方式占非地铁出行的比例，share 为它们的合计；busShare 为道路出行中公共汽车的比例（其余是出租车、私家车与货车）。
  // roadKeep：改乘地铁的人空出的路面被其他车辆占满的比例——早年来自公交与电车的竞争，战后来自被压抑的小汽车需求，2003 年拥堵费之后才明显下降
  const MODES = [
    { id: 'tram', name: '有轨电车', color: '#c9a227', share: [[1860, 0], [1870, 0], [1885, 0.06], [1900, 0.1], [1912, 0.2], [1925, 0.22], [1935, 0.17], [1945, 0.14], [1952, 0], [2000, 0], [2020, 0.01]] },
    { id: 'rail', name: '市郊铁路', color: '#5d7a9a', share: [[1860, 0.05], [1880, 0.1], [1900, 0.15], [1930, 0.16], [1941, 0.14], [1950, 0.15], [1975, 0.12], [2000, 0.14], [2020, 0.17]] },
    { id: 'walk', name: '步行与自行车', color: '#8ea86a', share: [[1860, 0.58], [1880, 0.44], [1900, 0.3], [1925, 0.2], [1939, 0.13], [1941, 0.3], [1946, 0.22], [1955, 0.14], [1975, 0.1], [2003, 0.13], [2020, 0.17]] },
  ];
  const shareYears = []; for (let y = Y0; y <= 2020; y += 2) shareYears.push(y); shareYears.push(1941, 1946, 1952); shareYears.sort(function (a, b) { return a - b; });
  const BG_SHARE = shareYears.map(function (y) { return [y, +MODES.reduce(function (s, m) { return s + U.interp(m.share, y); }, 0).toFixed(3)]; });

  const data = {
    city: '伦敦', terrainRevision: 1, riverName: '泰晤士河', hsrYear: 2007,
    stages: [[1900, '维多利亚时代'], [1914, '爱德华时代'], [1919, '第一次世界大战'], [1939, '两次大战之间'], [1945, '第二次世界大战'], [1960, '战后重建'], [1981, '产业衰退'], [1997, '码头区再生']], stageLast: '全球金融之都',
    eras: [
      { id: 'ld-e0', from: 1860, name: '维多利亚时代', tag: '史实',
        summary: '史实：1860 年大都会铁路开工，1863 年世界第一条地铁通车，蒸汽机车牵引；1868 年区域铁路开通，1884 年内环线闭合，1890 年世界第一条深层电气化地铁开通（史实背景，本局的地铁由你规划）。估算：城市几乎全靠步行，人口挤在老城与河岸两边，火车站把旅客放在城边，马车与公共马车堵满进城的街道；铁路沿线的近郊刚开始发展。',
        grow: { pop: { citylondon: 0.15, westend: 0.6, eastend: 1.1, kensington: 1.8, hamfulham: 1.6, camden: 1.2, hackney: 1.5, southbank: 1.2, battersea: 1.7, lewisham: 1.5, walthamforest: 1.3, haringey: 1.3, newham: 1.6 }, jobs: { citylondon: 1.5, westend: 1.3, isledogs: 1.5, royaldocks: 1.7, wapping: 1.1, stratford: 1.3 } },
        relocate: { pop: { citylondon: 0.0012 } }, demand: { decayHW: 0.6, decayHO: 0.7 },
        corridors: [{ a: 'eastend', b: 'citylondon', f: 1.2 }, { a: 'southbank', b: 'citylondon', f: 1.2 }, { a: 'marylebone', b: 'citylondon', f: 1.15 }] },
      { id: 'ld-e1', from: 1900, name: '爱德华时代', tag: '史实',
        summary: '史实：1900 年中央伦敦铁路通车（“两便士地铁”），1905 年内环线电气化，1906–1907 年三条深层地铁相继开通（史实背景，本局的地铁由你规划）。估算：城内人口趋于饱和，新增人口落在铁路沿线的近郊，码头区和东区的岗位仍在增长。',
        grow: { pop: { citylondon: 0.3, westend: 0.6, eastend: 0.9, walthamforest: 1.5, haringey: 1.4, newham: 1.5, battersea: 1.3, ealing: 1.3 }, jobs: { citylondon: 1.3, westend: 1.3, isledogs: 1.3, royaldocks: 1.4, surreydocks: 1.2 } },
        relocate: { pop: { citylondon: 0.0006 } }, demand: { decayHW: 0.8, decayHO: 0.85 },
        corridors: [{ a: 'eastend', b: 'citylondon', f: 1.15 }, { a: 'walthamforest', b: 'citylondon', f: 1.1 }, { a: 'southbank', b: 'citylondon', f: 1.15 }] },
      { id: 'ld-e2', from: 1914, name: '第一次世界大战', tag: '史实',
        summary: '史实：1914 年 8 月战争爆发，大量男子入伍，女性走进工厂与车站；1915 年起齐柏林飞艇空袭伦敦，市民躲进地铁站；伍利奇兵工厂雇用近十万人。估算：民用建设停滞，东部与河畔的军工岗位增加，购物与休闲出行减少。',
        grow: { jobs: { greenwich: 1.8, royaldocks: 1.3, ealing: 1.3, citylondon: 0.8 } }, demand: { sh: 0.85, lz: 0.7, decayHW: 0.85 } },
      { id: 'ld-e3', from: 1919, name: '两次大战之间', tag: '史实',
        summary: '史实：贝肯特里、圣赫利尔等市议会住宅区动工；1924 年起大都会铁路宣传“大都会乡土”；1933 年伦敦客运局成立，统一地铁、公交与电车；北环路与西大道开通，皇家公园与大西路两侧工厂林立。估算：郊区半独立住宅沿地铁线迅速蔓延，通勤距离明显变长。',
        grow: { pop: { metroland: 1.9, hillingdon: 1.8, barnet: 1.8, enfield: 1.8, barkingdag: 2, redbridge: 1.6, merton: 1.5, sutton: 1.5, bexley: 1.6, bromley: 1.4, havering: 1.4, citylondon: 0.3, westend: 0.5, eastend: 0.6 }, jobs: { ealing: 1.6, hounslow: 1.4, metroland: 1.4, citylondon: 1.1, westend: 1.2 } },
        relocate: { pop: { citylondon: 0.0008, eastend: 0.0004 } }, demand: { lz: 1.1, decayHW: 1.0 },
        corridors: [{ a: 'metroland', b: 'westend', f: 1.2 }, { a: 'barnet', b: 'citylondon', f: 1.15 }, { a: 'barkingdag', b: 'citylondon', f: 1.1 }] },
      { id: 'ld-e4', from: 1939, name: '第二次世界大战', tag: '史实',
        summary: '史实：1939 年 9 月儿童疏散；1940 年 9 月起德军连续空袭伦敦（伦敦大轰炸），东区与码头区损失最重，数十万人夜宿地铁站台；地铁扩建计划搁置。估算：人口大幅减少，建设几乎停止，上学、购物与休闲出行骤减，汽油配给让汽车几乎退出街道。',
        grow: { jobs: { ealing: 1.3, greenwich: 1.4, citylondon: 0.6 } }, demand: { sc: 0.55, sh: 0.7, lz: 0.5, decayHW: 0.85 } },
      { id: 'ld-e5', from: 1945, name: '战后重建', tag: '史实',
        summary: '史实：1944 年大伦敦规划提出绿带与新城；1948 年伦敦交通国有化，奥运会在温布利举行；1951 年英国节在南岸举办，1952 年最后一辆电车停驶；工党政府大建公共住房，人口向外疏解。估算：城内重建缓慢，配给制下资金紧张，地铁只能完成战前留下的工程。',
        grow: { pop: { eastend: 1.2, citylondon: 0.4, southbank: 1.1, bexley: 1.3, havering: 1.5, redbridge: 1.2, outer: 1.3 }, jobs: { citylondon: 1.2, westend: 1.2, royaldocks: 1.2, isledogs: 1.1, ealing: 1.2 } },
        relocate: { pop: { eastend: 0.0004, southbank: 0.0003 } }, demand: { sh: 0.95, decayHW: 1.05 },
        corridors: [{ a: 'havering', b: 'citylondon', f: 1.1 }, { a: 'southbank', b: 'westend', f: 1.1 }] },
      { id: 'ld-e6', from: 1960, name: '产业衰退', tag: '史实',
        summary: '史实：集装箱让泰晤士河上的老码头失去优势，东印度码头 1967 年、圣凯瑟琳码头 1968 年、萨里码头 1969 年、西印度与米尔沃尔码头 1980 年、皇家码头 1981 年相继关闭；西大道两侧的工厂纷纷外迁；人口从 800 多万降到 660 万；1969 年维多利亚线开通。估算：东伦敦的岗位大量流失，小汽车成为主要出行方式，地铁新增的客流很快被道路上新增的车流抵消。',
        grow: { pop: { citylondon: 0.3, eastend: 0.6, isledogs: 0.4, surreydocks: 0.4, royaldocks: 0.5, outer: 1.5, hillingdon: 1.2 }, jobs: { isledogs: 0.2, royaldocks: 0.2, surreydocks: 0.15, wapping: 0.3, greenwich: 0.5, ealing: 0.7, citylondon: 1.2, westend: 1.3 } },
        relocate: { pop: { eastend: 0.0008, southbank: 0.0005, isledogs: 0.001, surreydocks: 0.001 }, jobs: { isledogs: 0.004, royaldocks: 0.004, surreydocks: 0.005, wapping: 0.003, greenwich: 0.0008, ealing: 0.0006, eastend: 0.0006 } },
        demand: { lz: 1.05, decayHW: 1.15 }, corridors: [{ a: 'metroland', b: 'citylondon', f: 1.1 }, { a: 'hillingdon', b: 'westend', f: 1.1 }] },
      { id: 'ld-e7', from: 1981, name: '码头区再生', tag: '史实',
        summary: '史实：1981 年成立伦敦码头区开发公司，狗岛设企业区；1986 年“金融大爆炸”；1987 年码头区轻轨通车，1988 年金丝雀码头开工，1991 年一号广场落成；1994 年英吉利海峡隧道开通；伦敦人口开始回升。估算：金融岗位向城东溢出，废弃码头改造成写字楼与公寓，只有接上地铁的片区才长得起来。',
        grow: { pop: { isledogs: 2, surreydocks: 2, wapping: 2, royaldocks: 1.6, eastend: 1.2, citylondon: 0.6 }, jobs: { isledogs: 3.5, citylondon: 1.4, westend: 1.2, hillingdon: 1.5, royaldocks: 1.3 } },
        demand: { lz: 1.1, decayHW: 1.2, hub: 1.05 }, corridors: [{ a: 'isledogs', b: 'citylondon', f: 1.4 }, { a: 'surreydocks', b: 'isledogs', f: 1.25 }, { a: 'eastend', b: 'isledogs', f: 1.25 }],
        goals: [{ id: 'ld-g1', from: 1985, type: 'connect', months: 60, reward: 45000, title: '把狗岛接进城', desc: '金丝雀码头要把几万个岗位搬到狗岛，可这里交通极差。用地铁连接金丝雀码头与银行。', anchors: [anchor('金丝雀码头', 51.5054, -0.0195, 3), anchor('银行', 51.5133, -0.0886, 3)] }] },
      { id: 'ld-e8', from: 1997, name: '全球金融之都', tag: '史实',
        summary: '史实：1999 年朱比利线延伸通车，2000 年大伦敦政府成立；2003 年中心区开征拥堵费，道路车流下降约两成；2005 年伦敦赢得奥运；2012 年奥运会在斯特拉特福举行；2022 年伊丽莎白线开通。估算：人口恢复增长，地铁、自行车与公交重新占据上风，岗位继续向城市东部集中。',
        grow: { pop: { stratford: 2, royaldocks: 1.6, greenwichpen: 2, eastend: 1.4, southbank: 1.2, hackney: 1.3 }, jobs: { isledogs: 2.2, stratford: 2, citylondon: 1.3, westend: 1.1, southbank: 1.2, hackney: 1.2 } },
        demand: { lz: 1.15, decayHW: 1.2, hub: 1.1 }, corridors: [{ a: 'stratford', b: 'isledogs', f: 1.2 }, { a: 'stratford', b: 'citylondon', f: 1.2 }, { a: 'hillingdon', b: 'westend', f: 1.1 }],
        goals: [{ id: 'ld-g2', from: 2005, type: 'connect', months: 72, reward: 55000, title: '奥运之路', desc: '2012 年奥运会主场在斯特拉特福。用地铁连接斯特拉特福与国王十字。', anchors: [anchor('斯特拉特福', 51.5416, -0.0033, 3), anchor('国王十字-圣潘克拉斯', 51.5308, -0.1238, 3)] }] },
      { id: 'ld-e9', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '模拟：此后的发展按模型推演，不代表真实历史。估算：城市东部继续成长，中心城区保持稳定。',
        grow: { pop: { stratford: 1.4, royaldocks: 1.4, greenwichpen: 1.3 }, jobs: { isledogs: 1.3, stratford: 1.3, royaldocks: 1.3 } },
        demand: { lz: 1.1, decayHW: 1.1 }, corridors: [{ a: 'royaldocks', b: 'isledogs', f: 1.15 }] },
    ],
    // 城市特色（traits.js，规则见《地图设计与城市特色机制.md》）：造价、限制与提前布局都由这里展开。新条目加在末尾
    traits: [
      { use: 'conserve', level: 'heavy', star: true, icon: 'bridge', label: '泰晤士河与历史城区', text: '过河隧道昂贵；伦敦城与西区只能走地下，古建周围还有地下保护范围，拆迁也更贵',
        regions: ['westend', 'citylondon', 'greenwichheritage'], guards: [{ lm: 'ld_stpauls', r: 1.3 }, { lm: 'ld_abbey', r: 1.3 }, { lm: 'ld_tower', r: 1.2 }, { lm: 'ld_buckingham', r: 1 }],
        why: '伦敦城、威斯敏斯特和海事格林尼治是最密集的历史城区，早期地铁只能沿街道和河岸挖掘；圣保罗大教堂等古建受到严格保护。' },
      // 码头关闭之后，码头区不再是工业用地：之后这里长出的是办公楼和住宅
      { use: 'transition', existing: true, span: [1967, 2006], star: true, icon: 'building', label: '码头区的衰落与崛起', text: '码头 1960–1981 年间相继关闭，提前修到狗岛的线路等来金丝雀码头', region: ['isledogs', 'surreydocks', 'wapping', 'royaldocks'],
        replan: [{ year: 1981.5, region: 'isledogs', plan: 'cbd', maxHeight: [[1860, 40], [1981, 40], [1985, 250]] }, { year: 1981.5, region: 'surreydocks', plan: 'res' }, { year: 1981.5, region: 'wapping', plan: 'mix' }, { year: 1985, region: 'royaldocks', plan: 'mix' }, { year: 1997, region: 'greenwichpen', plan: 'mix' }, { year: 2006, region: 'stratford', plan: 'mix' }],
        why: '集装箱运输让老码头失去竞争力，1967–1981 年间东伦敦的码头相继关闭；1981 年成立的码头区开发公司把这里改造成金融区和住宅。' },
      { use: 'foresight', level: 'heavy', label: '金丝雀码头', id: 'ld-cw', pos: ll(51.5040, -0.0190), ym: [1985, 10], before: 1981, r: 7, region: 'isledogs', title: '金丝雀码头选址狗岛',
        hit: '北美开发商看中了几十年前就通车的{st}站：有了现成的地铁，就敢把金融区搬到废弃的码头上。一条当年没人坐的线路，开始变成全城最重要的线路之一。',
        miss: '开发商决定在狗岛建设金丝雀码头，可这里还没有地铁。岗位很快就要来了，你得赶工把线路修到这里。',
        why: '1980 年代中期，北美开发商选定狗岛建设金丝雀码头。' },
      { use: 'foresight', level: 'mid', label: '2012 奥运主场', id: 'ld-stf', pos: ll(51.5416, -0.0033), ym: [2005, 7], before: 1990, r: 7, region: 'stratford', title: '伦敦赢得 2012 年奥运会',
        hit: '奥运会选在斯特拉特福，早已通车的{st}站让这片老工业区一夜之间成了全城的新枢纽。',
        miss: '奥运会选在斯特拉特福，这片老工业区的地铁还远远不够，七年内要补上。',
        why: '2005 年 7 月，伦敦赢得 2012 年奥运会主办权，主场馆选在斯特拉特福的老工业区。' },
      { use: 'war', existing: true, span: [1914, 1945], star: true, icon: 'flag', label: '两次世界大战', text: '伦敦大轰炸毁掉成片街区、人口骤减、拨款锐减，战后重建要花几十年', why: '1940–1941 年的伦敦大轰炸毁掉东区和码头区的大片街区，数十万人夜宿地铁站台；两次大战期间地铁建设几乎停顿。' },
      { use: 'rival', existing: true, label: '电车、市郊铁路与公交', why: '伦敦在地铁之外一直有密集的市郊铁路，电车运营到 1952 年，公共汽车承担大量短途出行。' },
      { use: 'modeChart', existing: true, why: '各方式比重为估算，反映电车退出、小汽车普及和 2000 年代公交回升的趋势。' },
      { use: 'roadRefill', existing: true, why: '伦敦中心区的道路需求长期旺盛，到 2003 年开征拥堵费后才明显回落。' },
      { use: 'carLimit', existing: true, span: [2003, 9999], label: '2003 年拥堵费', why: '2003 年 2 月，中心区开征拥堵费。' },
      { use: 'investWindow', existing: true, span: [1935, 1939], label: '新工程计划', why: '1935 年的新工程计划由政府担保融资，延伸中央线和北线。' },
      { use: 'austerity', existing: true, span: [1976, 1980], label: '1976 年财政危机', why: '1976 年英国向国际货币基金组织贷款，公共投资大幅削减。' },
      { use: 'megaEvent', existing: true, label: '三届奥运会', why: '伦敦在 1908、1948、2012 年三次举办奥运会。' },
      { use: 'crossing', label: '泰晤士河', why: '泰晤士河把城市分成南北两岸，过河隧道的造价远高于普通隧道。' },
      { use: 'currency', label: '英镑十进制', why: '1971 年 2 月英镑改为十进制，此前票价按先令与便士计。' },
      { use: 'heightCap', why: '20 世纪中叶以前伦敦中心区建筑高度受到严格限制。' },
      { use: 'finance', flavor: 'uk' },
    ],
    bgViz: {
      tram: { p: [[1860, 0], [1870, 0], [1885, 0.08], [1900, 0.12], [1912, 0.28], [1930, 0.26], [1938, 0.14], [1950, 0.08], [1952.5, 0]] },
      ferries: [{ name: '泰晤士河汽船', river: '泰晤士河', from: 1860, to: 2050, n: 4, color: '#f2ede0', pts: [ll(51.4847, -0.2181), ll(51.4823, -0.1760), ll(51.4889, -0.1272), ll(51.5012, -0.1228), ll(51.5098, -0.1044), ll(51.5068, -0.0756), ll(51.5061, -0.0400), ll(51.4850, -0.0100), ll(51.5000, 0.0050)] }],
    },
    bg: { name: '电车、市郊铁路与步行', share: BG_SHARE, modes: MODES,
      busShare: [[1860, 0.72], [1900, 0.78], [1925, 0.72], [1945, 0.7], [1952, 0.62], [1960, 0.4], [1975, 0.22], [2003, 0.2], [2020, 0.28]],
      roadKeep: [[1860, 0.75], [1900, 0.72], [1930, 0.68], [1950, 0.6], [1965, 0.62], [1985, 0.6], [2003, 0.42], [2020, 0.35]],
      speed: [[1860, 5.5], [1900, 8], [1925, 11], [1950, 14], [1975, 20], [2020, 22]], wait: [[1860, 3], [1900, 4], [1950, 6], [1975, 8], [2020, 6]], fare: nominal([[1860, 0.005], [1900, 0.0055], [1950, 0.0055], [2020, 0.0045]], YEARS) },
    briefing: {
      lead: '1860 年的伦敦是世界上最大的城市，也是世界上最堵的城市：约 300 万人挤在泰晤士河两岸，每天几十万人步行或坐公共马车进城。国会刚批准一个大胆的主意：在街道底下修铁路。世界上还没有一条地铁。',
      modes: [['metro', '地铁', '世界上还没有地铁。真实历史上大都会铁路今年开工，1863 年通车；本局由你规划第一条线，真实线路不会自动出现。'], ['bus', '公共马车', '马拉公共马车和出租马车塞满主要街道，城门口常常一堵就是一小时。它们和地铁抢的是同一批乘客，后来还有电车和机动巴士。'], ['rail', '铁路', '国会不许铁路进入市中心，终点站只能停在城市边缘，旅客下车后还要穿城。列车本身不参与模拟，车站会产生市内接驳出行。'], ['road', '道路', '街道狭窄，历史城区不能修高架。堤岸、塔桥与新街道要到后来才陆续出现。']],
    },
    airport: null,
    // 希思罗跑道（位置按 OSM）：1946 年启用；伦敦城市机场 1987 年；克罗伊登机场 1920–1959 年
    runways: [{ a: ll(51.4775, -0.4850), b: ll(51.4777, -0.4333), from: 1946 }, { a: ll(51.4649, -0.4341), b: ll(51.4648, -0.4823), from: 1946 }, { a: ll(51.5055, 0.0457), b: ll(51.5049, 0.0650), from: 1987.8 }],
    regions: [
      // 风景区与公园
      { id: 'hydepark', name: '海德公园', geo: { park: '海德公园' }, scenic: true, open: null, relief: 0 },
      { id: 'kensingtongardens', name: '肯辛顿花园', geo: { park: '肯辛顿花园' }, scenic: true, open: null, relief: 0 },
      { id: 'regentspark', name: '摄政公园', geo: { park: '摄政公园' }, scenic: true, open: null, relief: 0 },
      { id: 'hampsteadheath', name: '汉普斯特德荒野', geo: { park: '汉普斯特德荒野' }, scenic: true, open: null, relief: 0 },
      { id: 'richmondpark', name: '里士满公园', geo: { park: '里士满公园' }, scenic: true, open: null, relief: 0 },
      { id: 'bushypark', name: '布希公园', geo: { park: '布希公园' }, scenic: true, open: null, relief: 0 },
      { id: 'kewgardens', name: '邱园', poly: R4(51.4890, 51.4720, -0.3080, -0.2935), scenic: true, open: null, relief: 0, lockNote: '世界文化遗产，不可开发，地下也不能设站' },
      { id: 'greenwichpark', name: '格林尼治公园', geo: { park: '格林尼治公园' }, scenic: true, open: null, relief: 0 },
      // 机场：重要交通枢纽，范围内可以地下设站与地下穿越
      { id: 'heathrow', name: '希思罗机场', poly: poly([[51.4820, -0.4960], [51.4820, -0.4180], [51.4590, -0.4180], [51.4560, -0.4620], [51.4590, -0.4960]]), open: null, hub: true, lockNote: '机场用地不开发', note: '1946 年起为伦敦的民用机场（史实）；重要交通枢纽：范围内可以地下设站与地下穿越' },
      { id: 'cityairport', name: '伦敦城市机场', poly: R4(51.5070, 51.5015, 0.0400, 0.0760), open: null, hub: true, lockNote: '机场用地不开发', note: '1987 年在废弃的皇家码头之间启用（史实）' },
      // 历史城区
      { id: 'westend', name: '西区与威斯敏斯特（历史城区）', poly: poly([[51.5155, -0.1590], [51.5165, -0.1190], [51.5150, -0.1130], [51.5095, -0.1130], [51.5060, -0.1210], [51.4950, -0.1230], [51.4950, -0.1420], [51.5020, -0.1520]]), open: 1860, plan: 'cbd', note: '议会大厦、白厅、苏荷与梅费尔：街道与地下都布满古建基础和早年的下水道（史实）' },
      { id: 'citylondon', name: '伦敦城（历史城区）', district: ['伦敦城'], open: 1860, plan: 'cbd', note: '罗马城墙以来的老城，今天仍是世界金融中心之一（史实）' },
      { id: 'greenwichheritage', name: '海事格林尼治（历史城区）', poly: R4(51.4850, 51.4770, -0.0100, 0.0030), open: 1860, plan: 'mix', note: '世界文化遗产：旧皇家海军学院与皇家天文台（史实）' },
      // 码头区：开局时是全世界最繁忙的港口之一，1960–1981 年间相继关闭，之后再生
      { id: 'isledogs', name: '狗岛（西印度与米尔沃尔码头）', poly: poly([[51.5125, -0.0330], [51.5125, -0.0030], [51.4990, 0.0005], [51.4850, -0.0040], [51.4850, -0.0240], [51.4990, -0.0340]]), open: 1860, plan: 'ind', maxHeight: [[1860, 30]], note: '西印度码头 1802 年开港，1980 年关闭；1988 年金丝雀码头在原址动工（史实）' },
      { id: 'royaldocks', name: '皇家码头（银敦·北伍利奇）', poly: poly([[51.5155, 0.0090], [51.5155, 0.0880], [51.5040, 0.0880], [51.4980, 0.0590], [51.5030, 0.0100]]), open: 1860, plan: 'ind', note: '世界最大的封闭码头群，1981 年关闭（史实）' },
      { id: 'surreydocks', name: '萨里码头（罗瑟希德）', poly: poly([[51.5050, -0.0610], [51.5090, -0.0340], [51.4965, -0.0290], [51.4880, -0.0310], [51.4880, -0.0600]]), open: 1860, plan: 'ind', note: '木材码头，1969 年关闭（史实）' },
      { id: 'wapping', name: '沃平·莱姆豪斯', poly: R4(51.5135, 51.5040, -0.0720, -0.0270), open: 1860, plan: 'resind', note: '伦敦码头与圣凯瑟琳码头一带（史实）' },
      { id: 'greenwichpen', name: '格林尼治半岛', poly: R4(51.5070, 51.4890, -0.0060, 0.0240), open: 1860, plan: 'ind', note: '煤气厂旧址，1999 年建成千禧巨蛋（史实）' },
      { id: 'stratford', name: '斯特拉特福·利河谷', poly: R4(51.5560, 51.5240, -0.0340, 0.0130), open: 1860, plan: 'ind', note: '铁路工厂与化工厂聚集的老工业区，2012 年奥运会在此举行（史实）' },
      // 伦敦自治市
      { id: 'marylebone', name: '马里波恩·帕丁顿', streets: ['威斯敏斯特市'], open: 1860, plan: 'mix' },
      { id: 'camden', name: '卡姆登·伊斯灵顿', streets: ['卡姆登区', '伊斯灵顿区'], open: 1860, plan: 'oldmix' },
      { id: 'kensington', name: '肯辛顿·切尔西', streets: ['肯辛顿-切尔西区'], open: 1860, plan: 'mix' },
      { id: 'hamfulham', name: '哈默史密斯·富勒姆', streets: ['哈默史密斯-富勒姆区'], open: 1860, plan: 'resind' },
      { id: 'eastend', name: '东区（陶尔哈姆莱茨）', streets: ['陶尔哈姆莱茨区'], open: 1860, plan: 'resind' },
      { id: 'hackney', name: '哈克尼', streets: ['哈克尼区'], open: 1860, plan: 'resind' },
      { id: 'southbank', name: '南岸（萨瑟克·兰贝斯）', streets: ['萨瑟克区', '兰贝斯区'], open: 1860, plan: 'resind' },
      { id: 'battersea', name: '巴特西·旺兹沃思', streets: ['旺兹沃思区'], open: 1860, plan: 'res' },
      { id: 'greenwich', name: '格林尼治·伍利奇', streets: ['格林尼治区'], open: 1860, plan: 'resind' },
      { id: 'lewisham', name: '刘易舍姆', streets: ['刘易舍姆区'], open: 1865, plan: 'res' },
      { id: 'newham', name: '纽汉（西汉姆·东汉姆）', streets: ['纽汉区'], open: 1865, plan: 'resind' },
      { id: 'walthamforest', name: '沃尔瑟姆斯托·莱顿', streets: ['沃尔瑟姆森林区'], open: 1870, plan: 'res' },
      { id: 'haringey', name: '哈林盖·托特纳姆', streets: ['哈林盖区'], open: 1870, plan: 'res' },
      { id: 'metroland', name: '大都会乡土（布伦特·哈罗）', streets: ['布伦特区', '哈罗区', '三河区', '沃特福德', '赫茨米尔'], open: 1880, plan: 'res', note: '1915 年起大都会铁路用“大都会乡土”宣传沿线的郊区住宅（史实）' },
      { id: 'ealing', name: '伊灵·皇家公园', streets: ['伊灵区'], open: 1875, plan: 'resind' },
      { id: 'hounslow', name: '豪恩斯洛·奇西克', streets: ['豪恩斯洛区'], open: 1880, plan: 'resind' },
      { id: 'richmond', name: '里士满·特威克纳姆', streets: ['泰晤士河畔里士满区'], open: 1870, plan: 'res' },
      { id: 'merton', name: '温布尔登·默顿', streets: ['默顿区'], open: 1880, plan: 'res' },
      { id: 'hillingdon', name: '希灵登·阿克斯布里奇', streets: ['希灵登区'], open: 1895, plan: 'res', note: '1904 年地铁通到阿克斯布里奇（史实）' },
      { id: 'barnet', name: '巴尼特·亨登', streets: ['巴尼特区'], open: 1900, plan: 'res', note: '1907 年深层地铁通到戈尔德斯格林，田野很快变成住宅区（史实）' },
      { id: 'croydon', name: '克罗伊登', streets: ['克罗伊登区'], open: 1875, plan: 'resind' },
      { id: 'kingston', name: '泰晤士河畔金斯顿', streets: ['泰晤士河畔金斯顿区'], open: 1885, plan: 'res' },
      { id: 'redbridge', name: '伊尔福德·雷德布里奇', streets: ['雷德布里奇区'], open: 1895, plan: 'res' },
      { id: 'barkingdag', name: '巴金·达格纳姆', streets: ['巴金-达格纳姆区'], open: 1920, plan: 'resind', note: '1921 年起建设贝肯特里住宅区，当时世界最大的公共住房区；1931 年福特汽车厂投产（史实）' },
      { id: 'sutton', name: '萨顿·圣赫利尔', streets: ['萨顿区'], open: 1925, plan: 'res' },
      { id: 'bromley', name: '布罗姆利', streets: ['布罗姆利区'], open: 1905, plan: 'res' },
      { id: 'enfield', name: '恩菲尔德', streets: ['恩菲尔德区'], open: 1925, plan: 'res', note: '1933 年皮卡迪利线通到科克福斯特斯（史实）' },
      { id: 'bexley', name: '贝克斯利', streets: ['贝克斯利区'], open: 1930, plan: 'res' },
      { id: 'havering', name: '罗姆福德·黑弗灵', streets: ['黑弗灵区'], open: 1932, plan: 'res' },
    ],
    defaultRegion: { id: 'outer', name: '外围地区', open: 1950, plan: 'res' },
    plans: CM.DATA.plans,
    maxHeight: [[1860, 25], [1956, 30], [1965, 110], [1990, 150], [2010, 200]],
    // 1860 年人口与就业中心（估算，人/km²；r 约为影响半径 km）：人几乎都住在走得到工作地点的地方
    centers: [
      at(51.5150, -0.0900, { pop: 38000, jobs: 90000, r: 0.9 }),    // 伦敦城
      at(51.5120, -0.1350, { pop: 45000, jobs: 50000, r: 1.1 }),    // 西区、苏荷
      at(51.5000, -0.1300, { pop: 22000, jobs: 30000, r: 0.7 }),    // 白厅、威斯敏斯特
      at(51.5220, -0.1100, { pop: 55000, jobs: 30000, r: 1.0 }),    // 霍尔本、克勒肯维尔
      at(51.5330, -0.1300, { pop: 45000, jobs: 10000, r: 1.1 }),    // 圣潘克拉斯、萨默斯镇
      at(51.5400, -0.1000, { pop: 35000, jobs: 6000, r: 1.1 }),     // 伊斯灵顿
      at(51.5220, -0.1550, { pop: 45000, jobs: 12000, r: 1.1 }),    // 马里波恩
      at(51.5180, -0.1800, { pop: 22000, jobs: 4000, r: 1.0 }),     // 帕丁顿
      at(51.5000, -0.1900, { pop: 12000, jobs: 2000, r: 1.1 }),     // 肯辛顿
      at(51.4880, -0.1700, { pop: 25000, jobs: 4000, r: 0.9 }),     // 切尔西
      at(51.4930, -0.2250, { pop: 6000, jobs: 1500, r: 0.8 }),      // 哈默史密斯
      at(51.4780, -0.2000, { pop: 3000, jobs: 500, r: 0.7 }),       // 富勒姆
      at(51.5270, -0.0650, { pop: 75000, jobs: 25000, r: 1.1 }),    // 肖尔迪奇、贝思纳尔格林
      at(51.5150, -0.0550, { pop: 80000, jobs: 30000, r: 1.1 }),    // 白教堂、斯特普尼
      at(51.5080, -0.0400, { pop: 45000, jobs: 24000, r: 1.0 }),    // 沃平、莱姆豪斯
      at(51.5100, -0.0150, { pop: 20000, jobs: 12000, r: 0.9 }),    // 波普拉
      at(51.4970, -0.0150, { pop: 2000, jobs: 6000, r: 0.8 }),      // 狗岛
      at(51.5450, -0.0550, { pop: 12000, jobs: 2000, r: 1.1 }),     // 哈克尼
      at(51.5000, -0.0900, { pop: 65000, jobs: 35000, r: 1.0 }),    // 萨瑟克、博罗
      at(51.4850, -0.1150, { pop: 28000, jobs: 8000, r: 1.1 }),     // 兰贝斯、肯宁顿
      at(51.4950, -0.0650, { pop: 45000, jobs: 18000, r: 0.9 }),    // 伯蒙德西
      at(51.4720, -0.0750, { pop: 12000, jobs: 2000, r: 1.0 }),     // 坎伯韦尔、佩卡姆
      at(51.4700, -0.1650, { pop: 5000, jobs: 1500, r: 0.8 }),      // 巴特西
      at(51.4600, -0.1250, { pop: 6000, jobs: 800, r: 0.9 }),       // 布里克斯顿、克拉珀姆
      at(51.4550, -0.1900, { pop: 4000, jobs: 800, r: 0.7 }),       // 旺兹沃思
      at(51.4700, -0.0300, { pop: 6000, jobs: 2000, r: 0.9 }),      // 刘易舍姆、德特福德
      at(51.4800, 0.0000, { pop: 16000, jobs: 6000, r: 0.8 }),      // 格林尼治
      at(51.4900, 0.0650, { pop: 14000, jobs: 14000, r: 0.8 }),     // 伍利奇
      at(51.5150, 0.0150, { pop: 6000, jobs: 4000, r: 0.9 }),       // 西汉姆、坎宁镇
      at(51.5350, 0.0550, { pop: 800, jobs: 200, r: 0.5 }),         // 东汉姆
      at(51.5400, 0.0000, { pop: 6000, jobs: 3000, r: 0.8 }),       // 斯特拉特福
      at(51.5750, -0.0200, { pop: 800, jobs: 100, r: 0.6 }),        // 莱顿、沃尔瑟姆斯托
      at(51.5900, -0.0700, { pop: 2500, jobs: 400, r: 0.7 }),       // 托特纳姆
      at(51.5850, -0.1150, { pop: 1000, jobs: 200, r: 0.6 }),       // 霍恩西
      at(51.5550, -0.1750, { pop: 3000, jobs: 500, r: 0.7 }),       // 汉普斯特德
      at(51.5450, -0.2350, { pop: 400, jobs: 100, r: 0.5 }),        // 威尔斯登
      at(51.5130, -0.3050, { pop: 1500, jobs: 300, r: 0.6 }),       // 伊灵
      at(51.5080, -0.2700, { pop: 800, jobs: 200, r: 0.5 }),        // 阿克顿
      at(51.4900, -0.2600, { pop: 2500, jobs: 500, r: 0.6 }),       // 奇西克
      at(51.4600, -0.3000, { pop: 5000, jobs: 1000, r: 0.7 }),      // 里士满
      at(51.4100, -0.3000, { pop: 5000, jobs: 1500, r: 0.7 }),      // 金斯顿
      at(51.4200, -0.2050, { pop: 1500, jobs: 200, r: 0.6 }),       // 温布尔登
      at(51.3750, -0.1000, { pop: 6000, jobs: 1800, r: 0.8 }),      // 克罗伊登
      at(51.4050, 0.0150, { pop: 2000, jobs: 500, r: 0.5 }),        // 布罗姆利
      at(51.6500, -0.2000, { pop: 2500, jobs: 400, r: 0.5 }),       // 巴尼特
      at(51.6520, -0.0800, { pop: 2500, jobs: 500, r: 0.5 }),       // 恩菲尔德
      at(51.5800, -0.3350, { pop: 800, jobs: 150, r: 0.5 }),        // 哈罗
      at(51.5460, -0.4800, { pop: 3000, jobs: 800, r: 0.5 }),       // 阿克斯布里奇
      at(51.5580, 0.0750, { pop: 800, jobs: 100, r: 0.5 }),         // 伊尔福德
      at(51.5800, 0.1800, { pop: 2500, jobs: 500, r: 0.5 }),        // 罗姆福德
      at(51.4700, -0.3700, { pop: 3000, jobs: 500, r: 0.6 }),       // 豪恩斯洛
      at(51.5400, 0.0800, { pop: 3000, jobs: 800, r: 0.6 }),        // 巴金
      at(51.3600, -0.1950, { pop: 800, jobs: 150, r: 0.5 }),        // 萨顿
    ],
    rural: { pop: 100, jobs: 30 },
    // 道路通车年份（名称前缀匹配；1860 年已有的街道按所在区域开放年份出现）
    roadYears: {
      '维多利亚堤岸': 1870, '阿尔伯特堤岸': 1869, '切尔西堤岸': 1874, '维多利亚女王街': 1871, '沙夫茨伯里大道': 1886, '查令十字路': 1887,
      '北环路': 1930, '南环路': 1930, '西大道': 1932, '东大道': 1924, '大西路': 1925, '大西南路': 1935, '大剑桥路': 1924, '金斯顿绕城路': 1927, '锡德卡普绕城路': 1926, '巴尼特绕城路': 1929, '巴尼特大道': 1929, '沃特福德大道': 1927, '亨登大道': 1927, '西北大道': 1930, '彻特西路': 1933, '珀利大道': 1925, '纽汉大道': 1990,
      '西路高架': 1970, 'M4 高速公路': 1965, 'M1 高速公路': 1967, 'M3 高速公路': 1974, 'M11 高速公路': 1977, 'M25 高速公路': 1986, 'A40(M) 高架快速路': 1970, '东横贯路': 1973, '西横贯路': 1970,
      '布莱克沃尔隧道北引道': 1967, '布莱克沃尔隧道南引道': 1967, '莱姆豪斯连接隧道': 1993, '罗瑟希德隧道': 1908, '布莱克沃尔隧道': 1897, '锡尔弗敦隧道': 2025, '阿斯彭大道': 1993, '皇家阿尔伯特大道': 1999, '皇家码头路': 1990, '国王大道': 1905, '奥德维奇': 1905,
    },
    bridgeYears: { '塔桥': 1894, '黑衣修士桥': 1869, '威斯敏斯特桥': 1862, '兰贝斯桥': 1862, '阿尔伯特桥': 1873, '旺兹沃思桥': 1873, '奇西克桥': 1933, '特威克纳姆桥': 1933 }, bridgeDefaultYear: 1860,
    simRoads: [],
    landmarks: [
      Object.assign(at(51.4995, -0.1248), { id: 'ld_bigben', name: '议会大厦与大本钟', w: 90, d: 280, rot: 8, year: 1860, kind: 'palace', style: 'gothic', h: 96 }),
      Object.assign(at(51.4993, -0.1273), { id: 'ld_abbey', name: '威斯敏斯特教堂', w: 100, d: 60, rot: 8, year: 1745, kind: 'church', h: 69 }),
      Object.assign(at(51.5138, -0.0984), { id: 'ld_stpauls', name: '圣保罗大教堂', w: 150, d: 76, year: 1710, kind: 'dome', style: 'white', h: 111 }),
      Object.assign(at(51.5081, -0.0759), { id: 'ld_tower', name: '伦敦塔', w: 200, d: 200, year: 1285, kind: 'palace', style: 'keep' }),
      Object.assign(at(51.5055, -0.0754), { id: 'ld_towerbridge', name: '塔桥', w: 520, d: 50, rot: 8, year: 1894, kind: 'bridge2', h: 65 }),
      Object.assign(at(51.5014, -0.1419), { id: 'ld_buckingham', name: '白金汉宫', w: 150, d: 110, year: 1837, kind: 'palace' }),
      Object.assign(at(51.5194, -0.1270), { id: 'ld_bm', name: '大英博物馆', w: 180, d: 160, year: 1852, kind: 'museum' }),
      Object.assign(at(51.4967, -0.1764), { id: 'ld_nhm', name: '自然历史博物馆', w: 210, d: 110, year: 1881, kind: 'museum' }),
      Object.assign(at(51.5009, -0.1774), { id: 'ld_rah', name: '皇家阿尔伯特音乐厅', w: 83, d: 72, year: 1871, kind: 'concert' }),
      Object.assign(at(51.4769, 0.0005), { id: 'ld_observatory', name: '皇家天文台', w: 60, d: 50, year: 1675, kind: 'traditional' }),
      Object.assign(at(51.4832, -0.0060), { id: 'ld_onc', name: '旧皇家海军学院', w: 240, d: 200, year: 1712, kind: 'palace', style: 'white' }),
      Object.assign(at(51.4037, -0.3376), { id: 'ld_hampton', name: '汉普顿宫', w: 220, d: 190, year: 1529, kind: 'palace', style: 'keep' }),
      Object.assign(at(51.5943, -0.1300), { id: 'ld_ally', name: '亚历山德拉宫', w: 280, d: 120, year: 1875, kind: 'palace' }),
      Object.assign(at(51.4816, -0.1446), { id: 'ld_battersea', name: '巴特西发电站', w: 170, d: 150, year: 1933, kind: 'factory', h: 103 }),
      Object.assign(at(51.5076, -0.0994), { id: 'ld_tate', name: '河岸发电站（泰特现代美术馆）', w: 200, d: 80, year: 1952, kind: 'factory', h: 99 }),
      Object.assign(at(51.5215, -0.1389), { id: 'ld_bt', name: '邮政塔（BT 塔）', w: 40, d: 40, year: 1964, kind: 'tvtower', style: 'needle', h: 177 }),
      Object.assign(at(51.5062, -0.1160), { id: 'ld_rfh', name: '皇家节日大厅', w: 110, d: 70, year: 1951, kind: 'concert' }),
      Object.assign(at(51.5033, -0.1196), { id: 'ld_eye', name: '伦敦眼', w: 135, d: 30, year: 2000, kind: 'wheel', h: 135 }),
      Object.assign(at(51.5129, -0.0827), { id: 'ld_lloyds', name: '劳合社大楼', w: 70, d: 60, year: 1986, kind: 'skyscraper', h: 95 }),
      Object.assign(at(51.5145, -0.0803), { id: 'ld_gherkin', name: '圣玛丽斧街 30 号（小黄瓜）', w: 56, d: 56, year: 2004, kind: 'skyscraper', h: 180 }),
      Object.assign(at(51.5045, -0.0865), { id: 'ld_shard', name: '碎片大厦', w: 60, d: 60, year: 2012, kind: 'skyscraper', h: 310 }),
      Object.assign(at(51.5114, -0.0836), { id: 'ld_walkie', name: '芬丘奇街 20 号（对讲机）', w: 60, d: 50, year: 2014, kind: 'skyscraper', h: 160 }),
      Object.assign(at(51.5135, -0.0825), { id: 'ld_tower42', name: '42 号大厦（国民西敏寺大厦）', w: 50, d: 50, year: 1980, kind: 'skyscraper', h: 183 }),
      Object.assign(at(51.5049, -0.0195), { id: 'ld_ocs', name: '加拿大广场一号', w: 60, d: 60, year: 1991, kind: 'skyscraper', h: 235 }),
      Object.assign(at(51.5030, -0.0172), { id: 'ld_hsbc', name: '汇丰大厦（金丝雀码头）', w: 60, d: 50, year: 2002, kind: 'skyscraper', h: 200 }),
      Object.assign(at(51.5030, 0.0032), { id: 'ld_o2', name: '千禧巨蛋（O2 体育馆）', w: 365, d: 365, year: 1999, kind: 'dome', style: 'white', h: 50 }),
      Object.assign(at(51.5560, -0.2795), { id: 'ld_wembley', name: '温布利球场', w: 300, d: 250, year: 1923, kind: 'stadium' }),
      Object.assign(at(51.5383, -0.0166), { id: 'ld_olympic', name: '伦敦碗（奥林匹克体育场）', w: 280, d: 240, year: 2011, kind: 'stadium' }),
      Object.assign(at(51.4560, -0.3415), { id: 'ld_twick', name: '特威克纳姆球场', w: 250, d: 220, year: 1909, kind: 'stadium' }),
      Object.assign(at(51.4340, -0.2144), { id: 'ld_wimbledon', name: '全英草地网球俱乐部', w: 300, d: 300, year: 1922, kind: 'stadium' }),
      Object.assign(at(51.5300, -0.1250), { id: 'ld_stpancras', name: '圣潘克拉斯车站', w: 240, d: 210, year: 1868, kind: 'rail', style: 'gothic' }),
      Object.assign(at(51.5320, -0.1233), { id: 'ld_kingscross', name: '国王十字车站', w: 180, d: 220, year: 1852, kind: 'rail' }),
      Object.assign(at(51.5167, -0.1769), { id: 'ld_paddington', name: '帕丁顿车站', w: 230, d: 170, year: 1854, kind: 'rail' }),
      Object.assign(at(51.5031, -0.1132), { id: 'ld_waterloo', name: '滑铁卢车站', w: 300, d: 240, year: 1848, kind: 'rail' }),
      Object.assign(at(51.4952, -0.1441), { id: 'ld_victoria', name: '维多利亚车站', w: 300, d: 200, year: 1860, kind: 'rail' }),
      Object.assign(at(51.5188, -0.0814), { id: 'ld_liverpool', name: '利物浦街车站', w: 240, d: 180, year: 1874, kind: 'rail' }),
      Object.assign(at(51.5281, -0.1337), { id: 'ld_euston', name: '尤斯顿车站', w: 240, d: 220, year: 1837, kind: 'rail' }),
      Object.assign(at(51.5246, -0.1340), { id: 'ld_ucl', name: '伦敦大学学院', w: 300, d: 300, year: 1826, kind: 'campus' }),
      Object.assign(at(51.4988, -0.1749), { id: 'ld_imperial', name: '帝国理工学院', w: 300, d: 300, year: 1907, kind: 'campus' }),
    ],
    // 重要设施（见 facility.js）：位置与启用 / 停用年份为史实参考（位置近似）；规模均为估算。枢纽 pax 只计长途与城际列车、机场旅客中经地面交通出入的部分（万人次/日）
    facilities: [
      { id: 'ld_cro', n: '克罗伊登机场', t: 'air', at: ll(51.3560, -0.1160), y0: [1920, 3], y1: [1959, 9], pax: [[1920, 0.005], [1930, 0.03], [1939, 0.05], [1946, 0.06], [1959, 0.02]], note: '两次大战之间伦敦的主要机场，1959 年关闭。' },
      { id: 'ld_lhr', n: '希思罗机场', t: 'air', at: ll(51.4700, -0.4540), y0: [1946, 5], pax: [[1946, 0.02], [1955, 0.3], [1965, 1], [1977, 2.4], [1990, 4.2], [2000, 6.8], [2008, 7.4], [2019, 8.2], [2030, 8.5]], note: '1946 年启用，1977 年皮卡迪利线通到这里（史实背景，本局由你规划）。需求点设在中央航站区。' },
      { id: 'ld_lcy', n: '伦敦城市机场', t: 'air', at: ll(51.5048, 0.0496), y0: [1987, 10], pax: [[1987.8, 0.03], [2000, 0.4], [2019, 0.7], [2030, 0.8]] },
      { id: 'ld_lgw', n: '盖特威克机场（南部接驳）', t: 'air', ext: ['S', 30], at: ll(51.3580, -0.1200), y0: [1958, 6], pax: [[1958.5, 0.1], [1980, 1], [2000, 2.5], [2019, 3.6], [2030, 3.8]], note: '盖特威克机场在地图南缘以南约 30 km，此处为布莱顿干线方向出图的接驳点。' },
      { id: 'ld_kx', n: '国王十字车站', t: 'rail', lm: 'ld_kingscross', pax: [[1860, 0.2], [1900, 0.6], [1960, 0.9], [2020, 2]] },
      { id: 'ld_stp', n: '圣潘克拉斯车站', t: 'rail', lm: 'ld_stpancras', pax: [[1868, 0.15], [1900, 0.5], [1960, 0.6], [2007, 0.8], [2008, 2], [2030, 2.6]], note: '2007 年 11 月起欧洲之星由滑铁卢改到这里。' },
      { id: 'ld_pad', n: '帕丁顿车站', t: 'rail', lm: 'ld_paddington', pax: [[1860, 0.2], [1900, 0.6], [1960, 0.8], [2020, 1.8]] },
      { id: 'ld_wat', n: '滑铁卢车站', t: 'rail', lm: 'ld_waterloo', pax: [[1860, 0.3], [1900, 1], [1960, 1.5], [2020, 2.5]] },
      { id: 'ld_vic', n: '维多利亚车站', t: 'rail', lm: 'ld_victoria', pax: [[1860, 0.1], [1900, 0.9], [1960, 1.3], [2020, 2.2]] },
      { id: 'ld_lst', n: '利物浦街车站', t: 'rail', lm: 'ld_liverpool', pax: [[1874, 0.4], [1900, 1.1], [1960, 1.5], [2020, 2.6]] },
      { id: 'ld_eus', n: '尤斯顿车站', t: 'rail', lm: 'ld_euston', pax: [[1860, 0.25], [1900, 0.5], [1960, 0.8], [2020, 1.6]] },
      { id: 'ld_lbg', n: '伦敦桥车站', t: 'rail', at: ll(51.5052, -0.0860), pax: [[1860, 0.4], [1900, 1], [1960, 1.4], [2020, 2.4]] },
      { id: 'ld_chx', n: '查令十字车站', t: 'rail', at: ll(51.5080, -0.1247), y0: [1864, 1], pax: [[1864, 0.2], [1900, 0.7], [1960, 0.9], [2020, 1.2]] },
      { id: 'ld_ucl', n: '伦敦大学学院', t: 'uni', lm: 'ld_ucl', w: [[1860, 0.003], [1900, 0.008], [1960, 0.015], [2020, 0.04]] },
      { id: 'ld_kcl', n: '伦敦国王学院', t: 'uni', at: ll(51.5115, -0.1160), w: [[1860, 0.002], [1900, 0.006], [2020, 0.03]] },
      { id: 'ld_imperial', n: '帝国理工学院', t: 'uni', lm: 'ld_imperial', y0: 1907, w: [[1907, 0.004], [2020, 0.025]] },
      { id: 'ld_lse', n: '伦敦政治经济学院', t: 'uni', at: ll(51.5144, -0.1165), y0: 1895, w: [[1900, 0.002], [2020, 0.015]] },
      { id: 'ld_qm', n: '伦敦玛丽女王大学', t: 'uni', at: ll(51.5246, -0.0398), y0: 1887, w: [[1900, 0.002], [2020, 0.02]] },
      { id: 'ld_guys', n: '盖伊医院', t: 'hosp', at: ll(51.5032, -0.0868), w: 0.04 },
      { id: 'ld_barts', n: '圣巴塞洛缪医院', t: 'hosp', at: ll(51.5175, -0.1000), w: 0.035 },
      { id: 'ld_thomas', n: '圣托马斯医院', t: 'hosp', at: ll(51.4985, -0.1190), y0: 1871, w: 0.04 },
      { id: 'ld_royal', n: '皇家伦敦医院', t: 'hosp', at: ll(51.5186, -0.0595), w: 0.04 },
      { id: 'ld_kings', n: '国王学院医院', t: 'hosp', at: ll(51.4682, -0.0938), y0: 1913, w: 0.035 },
      { id: 'ld_oxford', n: '牛津街', t: 'shop', at: ll(51.5152, -0.1420), p: { sh: 0.8, lz: 0.2 }, w: 0.08 },
      { id: 'ld_regent', n: '摄政街', t: 'shop', at: ll(51.5105, -0.1390), w: 0.04 },
      { id: 'ld_harrods', n: '骑士桥（哈罗德百货）', t: 'shop', at: ll(51.4994, -0.1632), w: [[1860, 0.008], [1900, 0.03]] },
      { id: 'ld_cg', n: '科文特花园', t: 'shop', at: ll(51.5117, -0.1234), p: { sh: 0.4, lz: 0.6 }, w: [[1900, 0.02], [1980, 0.035]] },
      { id: 'ld_soho', n: '苏荷', t: 'shop', at: ll(51.5136, -0.1340), p: { sh: 0.2, lz: 0.8 }, w: 0.03 },
      { id: 'ld_croydonc', n: '克罗伊登市中心', t: 'shop', at: ll(51.3740, -0.0990), y0: 1960, w: 0.02 },
      { id: 'ld_westfield', n: '西田购物中心（牧人丛林）', t: 'shop', at: ll(51.5072, -0.2212), y0: [2008, 10], w: 0.03 },
      { id: 'ld_westfield2', n: '西田购物中心（斯特拉特福）', t: 'shop', at: ll(51.5430, -0.0060), y0: [2011, 9], w: 0.035 },
      { id: 'ld_city', n: '伦敦金融城', t: 'cbd', at: ll(51.5145, -0.0870), w: [[1860, 0.05], [1900, 0.06], [1950, 0.06], [1986, 0.07], [2020, 0.09]] },
      { id: 'ld_whitehall', n: '白厅政府机关', t: 'cbd', at: ll(51.5040, -0.1270), w: [[1900, 0.02], [2020, 0.02]] },
      { id: 'ld_docks', n: '西印度与米尔沃尔码头', t: 'cbd', at: ll(51.4990, -0.0200), y1: [1980, 12], w: [[1860, 0.025], [1900, 0.035], [1955, 0.04], [1967, 0.02], [1980, 0.002]], note: '二战后仍很繁忙，集装箱时代到来后一路衰落，1980 年关闭。' },
      { id: 'ld_royalw', n: '皇家码头', t: 'cbd', at: ll(51.5065, 0.0500), y1: [1981, 12], w: [[1860, 0.008], [1880, 0.02], [1900, 0.03], [1955, 0.04], [1970, 0.015], [1981, 0.002]] },
      { id: 'ld_arsenal', n: '伍利奇皇家兵工厂', t: 'cbd', at: ll(51.4935, 0.0720), y1: [1967, 9], w: [[1860, 0.012], [1900, 0.02], [1916, 0.06], [1920, 0.02], [1940, 0.04], [1946, 0.012], [1967, 0.004]], note: '一战高峰时雇用近十万人，1967 年关闭。' },
      { id: 'ld_parkroyal', n: '皇家公园工业区', t: 'cbd', at: ll(51.5290, -0.2750), y0: 1920, w: [[1920, 0.005], [1950, 0.025], [1980, 0.012], [2020, 0.012]] },
      { id: 'ld_cw', n: '金丝雀码头', t: 'cbd', at: ll(51.5050, -0.0190), y0: [1991, 8], w: [[1991, 0.012], [2000, 0.04], [2010, 0.08], [2020, 0.1]], note: '1991 年一号广场落成，之后成为欧洲最大的金融商务区之一。' },
      { id: 'ld_brit', n: '大英博物馆', t: 'scenic', lm: 'ld_bm', w: 0.03 },
      { id: 'ld_towerf', n: '伦敦塔', t: 'scenic', lm: 'ld_tower', w: 0.03 },
      { id: 'ld_palace', n: '白金汉宫', t: 'scenic', lm: 'ld_buckingham', w: 0.025 },
      { id: 'ld_parl', n: '议会大厦与威斯敏斯特教堂', t: 'scenic', lm: 'ld_bigben', w: 0.03 },
      { id: 'ld_stp2', n: '圣保罗大教堂', t: 'scenic', lm: 'ld_stpauls', w: 0.02 },
      { id: 'ld_nhmf', n: '南肯辛顿博物馆区', t: 'scenic', lm: 'ld_nhm', w: 0.03 },
      { id: 'ld_greenw', n: '格林尼治', t: 'scenic', lm: 'ld_observatory', w: 0.02 },
      { id: 'ld_kew', n: '邱园', t: 'scenic', at: ll(51.4787, -0.2956), r: 1.5, w: 0.012 },
      { id: 'ld_eyef', n: '伦敦眼', t: 'scenic', lm: 'ld_eye', y0: 2000, w: 0.03 },
      { id: 'ld_tatef', n: '泰特现代美术馆', t: 'scenic', lm: 'ld_tate', y0: [2000, 5], w: 0.03 },
      { id: 'ld_hamptonf', n: '汉普顿宫', t: 'scenic', lm: 'ld_hampton', w: 0.008 },
      { id: 'ld_cpalace', n: '水晶宫', t: 'scenic', at: ll(51.4225, -0.0735), y1: [1936, 11], w: 0.02, note: '1854 年迁到南伦敦的玻璃巨构，1936 年毁于大火。' },
      { id: 'ld_hyde', n: '海德公园', t: 'park', at: ll(51.5073, -0.1657), r: 2, w: 0.025 },
      { id: 'ld_regents', n: '摄政公园与动物园', t: 'park', at: ll(51.5313, -0.1570), r: 1.6, w: 0.02 },
      { id: 'ld_hamp', n: '汉普斯特德荒野', t: 'park', at: ll(51.5608, -0.1650), r: 1.6, w: 0.012 },
      { id: 'ld_rich', n: '里士满公园', t: 'park', at: ll(51.4420, -0.2750), r: 2, w: 0.01 },
      { id: 'ld_white08', n: '1908 年奥运会（白城体育场）', t: 'stadium', at: ll(51.5130, -0.2280), y0: [1908, 5], y1: [1985, 1], w: [[1908.3, 0.03], [1908.9, 0.03], [1909, 0.006], [1985, 0.006]], note: '1908 年奥运会主场，也是英法博览会的场地，1985 年拆除。' },
      { id: 'ld_wemb', n: '温布利球场', t: 'stadium', lm: 'ld_wembley', w: [[1923, 0.015], [1948.5, 0.015], [1948.6, 0.04], [1948.7, 0.015], [2020, 0.02]], note: '1923 年“白马决赛”，1948 年奥运会主场，2007 年重建。' },
      { id: 'ld_oly', n: '伦敦碗（奥林匹克公园）', t: 'stadium', lm: 'ld_olympic', y0: [2012, 7], w: [[2012.5, 0.06], [2012.7, 0.06], [2012.8, 0.012]], note: '2012 年奥运会主场。' },
      { id: 'ld_twk', n: '特威克纳姆球场', t: 'stadium', lm: 'ld_twick', w: 0.008 },
      { id: 'ld_wim', n: '全英草地网球俱乐部', t: 'stadium', lm: 'ld_wimbledon', w: 0.006 },
      { id: 'ld_emp', n: '1924 年大英帝国博览会', t: 'venue', at: ll(51.5590, -0.2800), r: 1.4, y0: [1924, 4], y1: [1925, 10], w: 0.05, note: '两年间约 2700 万人次参观，地铁与铁路专门开行接驳列车。' },
      { id: 'ld_fest', n: '1951 年英国节', t: 'venue', at: ll(51.5062, -0.1160), r: 1.2, y0: [1951, 5], y1: [1951, 9], w: 0.05, note: '战后第一场全国庆典，南岸的废墟上建起穹顶馆与皇家节日大厅。' },
      { id: 'ld_earl', n: '伯爵府展览中心', t: 'venue', at: ll(51.4895, -0.1990), y0: 1937, y1: 2014, w: 0.01 },
      { id: 'ld_excel', n: '伦敦国际会展中心（ExCeL）', t: 'venue', at: ll(51.5082, 0.0290), y0: [2000, 11], w: 0.012 },
      { id: 'ld_o2f', n: 'O2 体育馆', t: 'venue', lm: 'ld_o2', y0: [2007, 6], w: 0.015 },
      { id: 'ld_rahf', n: '皇家阿尔伯特音乐厅', t: 'venue', lm: 'ld_rah', w: 0.006 },
    ],
    districtLabels: [['伦敦城', ['伦敦城']], ['威斯敏斯特', ['威斯敏斯特市']], ['肯辛顿', ['肯辛顿-切尔西区']], ['卡姆登', ['卡姆登区']], ['伊斯灵顿', ['伊斯灵顿区']], ['哈克尼', ['哈克尼区']], ['陶尔哈姆莱茨', ['陶尔哈姆莱茨区']], ['萨瑟克', ['萨瑟克区']], ['兰贝斯', ['兰贝斯区']], ['旺兹沃思', ['旺兹沃思区']], ['哈默史密斯', ['哈默史密斯-富勒姆区']], ['格林尼治', ['格林尼治区']], ['刘易舍姆', ['刘易舍姆区']], ['纽汉', ['纽汉区']], ['布伦特', ['布伦特区']], ['伊灵', ['伊灵区']], ['巴尼特', ['巴尼特区']], ['克罗伊登', ['克罗伊登区']]],
    // 纪事（只能在末尾追加：已发生记录按序号保存）
    events: [
      { y: 1860, m: 1, tag: '史实', title: '1860 年的伦敦', desc: '约 300 万人挤在泰晤士河两岸，是世界最大的城市。街道被马车堵死，世界上还没有一条地铁，由你来修第一条。' },
      { y: 1860, m: 3, tag: '史实', title: '史实背景：大都会铁路开工', desc: '工人沿着新路挖开街道，修好隧道再盖回去。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 1863, m: 1, tag: '史实', title: '史实背景：世界第一条地铁通车', desc: '帕丁顿到法灵顿的大都会铁路通车，第一天就有约 4 万人搭乘，蒸汽机车在隧道里喷着烟。' },
      { y: 1865, m: 4, tag: '史实', title: '巴泽尔杰特的下水道启用', desc: '“大恶臭”之后修建的下水道网开始运转，城市不再因霍乱成批死人。1866 年东区最后一次霍乱大流行夺走约 5500 人。', fx: { sat: { v: 0.5, months: 12 } } },
      { y: 1866, m: 5, tag: '史实', title: '奥弗伦-格尼银行倒闭', desc: '这场金融恐慌让许多铁路公司破产，地铁工程也融不到钱。', fx: { finance: { grant: 0.7, years: 2, fade: 1 } } },
      { y: 1868, m: 12, tag: '史实', title: '史实背景：区域铁路开通', desc: '南肯辛顿到威斯敏斯特的线路开通，后来与大都会铁路一起组成内环线。' },
      { y: 1869, m: 12, tag: '史实', title: '史实背景：列车穿过泰晤士隧道', desc: '布鲁内尔父子 1843 年建成的人行隧道改走火车，东伦敦铁路把两岸连了起来。' },
      { y: 1870, m: 7, tag: '史实', title: '维多利亚堤岸完工', desc: '泰晤士河北岸填出一条宽阔的新路，下面埋着下水道和地铁隧道。' },
      { y: 1870, m: 8, tag: '史实', title: '《电车法》与初等教育法', desc: '马拉有轨电车开始在近郊铺开，工人第一次坐得起车；同年开始普及小学教育。', fx: { grow: { region: ['hackney', 'lewisham', 'walthamforest', 'southbank'], pop: 1.15, years: 12 } } },
      { y: 1871, m: 8, tag: '史实', title: '《银行假日法》', desc: '公共假日让工人也有了出游的日子，周末和假日的出行多了起来。', fx: { demand: { lz: 1.04, years: 5 } } },
      { y: 1873, m: 10, tag: '史实', title: '长期萧条开始', desc: '物价和利润连续二十多年下跌，农民涌入城市，伦敦的人口增长却更快了。' },
      { y: 1884, m: 10, tag: '史实', title: '史实背景：内环线闭合', desc: '大都会铁路和区域铁路这对冤家终于接上，蒸汽列车绕城一圈。' },
      { y: 1888, m: 8, tag: '史实', title: '开膛手杰克与伦敦郡议会', desc: '白教堂的连环凶案让全世界看到了东区的贫困，第二年伦敦郡议会成立，城市第一次有了统一的政府。' },
      { y: 1889, m: 8, tag: '史实', title: '码头大罢工', desc: '十万码头工人罢工五周，争取每小时 6 便士，泰晤士河上的货物堆积如山。', fx: { grow: { region: ['isledogs', 'royaldocks', 'wapping'], jobs: 0.85, years: 2 }, demand: { hw: 0.95, months: 2 } } },
      { y: 1890, m: 11, tag: '史实', title: '史实背景：世界第一条深层电气地铁', desc: '城市与南伦敦铁路开通，隧道埋得更深，不再挖开街道，也不再有煤烟。此后的地铁都走这条路。' },
      { y: 1894, m: 6, tag: '史实', title: '塔桥开通', desc: '东伦敦第一次有了不用坐船就能过河的桥，大船来时桥面会抬起来。' },
      { y: 1897, m: 5, tag: '史实', title: '布莱克沃尔隧道通车', desc: '当时世界上最长的水下隧道，让马车能在码头区两岸往来。' },
      { y: 1900, m: 1, tag: '史实', title: '1900 年：世纪之交', desc: '大伦敦范围内已有约 620 万人。电力正在取代蒸汽，一批深层地铁即将开工。' },
      { y: 1900, m: 7, tag: '史实', title: '史实背景：中央伦敦铁路通车', desc: '牧人丛林到银行的“两便士地铁”通车，全程票价 2 便士。本局的新线由你规划，真实线路不会自动出现。' },
      { y: 1901, m: 1, tag: '史实', title: '维多利亚女王去世', desc: '爱德华七世继位，爱德华时代开始；美国金融家耶基斯正在收购伦敦的地铁公司。' },
      { y: 1905, m: 7, tag: '史实', title: '内环线电气化', desc: '隧道里的蒸汽与煤烟终于消失，乘客明显增加。', fx: { demand: { lz: 1.05, hw: 1.03, years: 3 } } },
      { y: 1908, m: 7, tag: '史实', title: '第四届奥运会与英法博览会', desc: '白城体育场同时举办奥运会和博览会，半年里约有 800 万人次参观。', fx: { demand: { lz: 1.12, months: 4 }, sat: { v: 1, months: 6 } } },
      { y: 1910, m: 5, tag: '史实', title: '机动巴士取代马拉公共马车', desc: 'B 型巴士投入运营，第二年最后一辆马拉公共马车停驶。公交的速度翻了一番，开始和地铁抢客。' },
      { y: 1914, m: 8, tag: '史实', title: '第一次世界大战爆发', desc: '大量男子入伍，女性走进车站与工厂，民用建设几乎全部停止。', fx: { finance: { grant: 0.5, cost: 1.25, years: 4.25, fade: 1 }, demand: { sh: 0.85, lz: 0.75, years: 4.25, fade: 1 }, sat: { v: -1, months: 18 } } },
      { y: 1915, m: 5, tag: '史实', title: '齐柏林飞艇空袭伦敦', desc: '飞艇与之后的轰炸机造成上千人死伤，市民第一次躲进地铁站过夜。', fx: { strike: { region: ['eastend', 'citylondon'], pop: 0.01, jobs: 0.005 }, demand: { lz: 0.8, sh: 0.9, months: 6 }, sat: { v: -2, months: 6 } } },
      { y: 1918, m: 11, tag: '史实', title: '停战与西班牙流感', desc: '战争结束，物价已比战前翻倍；流感又夺走了伦敦约两万人的生命。', fx: { demand: { hw: 0.9, sh: 0.8, lz: 0.7, months: 3, fade: 1 } } },
      { y: 1921, m: 7, tag: '史实', title: '贝肯特里住宅区动工', desc: '伦敦郡议会在巴金东部建设世界最大的公共住房区，十年内住进十万人。', fx: { grow: { region: 'barkingdag', pop: 2, years: 12 } } },
      { y: 1924, m: 4, tag: '史实', title: '大英帝国博览会', desc: '温布利的博览会两年吸引约 2700 万人次，大都会线专门开行接驳列车，沿线的“大都会乡土”越发热门。', fx: { demand: { lz: 1.1, months: 18 }, grow: { region: 'metroland', pop: 1.3, years: 6 } } },
      { y: 1926, m: 5, tag: '史实', title: '大罢工', desc: '全国大罢工持续九天，地铁、公交与铁路几乎全部停运，志愿者上街驾驶巴士。', fx: { demand: { hw: 0.75, sh: 0.7, lz: 0.6, months: 1 }, sat: { v: -2, months: 3 } } },
      { y: 1928, m: 1, tag: '史实', title: '泰晤士河大洪水', desc: '风暴潮涌入威斯敏斯特一带，14 人溺亡，河畔的地下室与地铁站被淹。', fx: { strike: { region: ['westend', 'kensington', 'hamfulham'], pop: 0.002 }, demand: { hw: 0.92, months: 1 }, sat: { v: -1.5, months: 4 } } },
      { y: 1933, m: 7, tag: '史实', title: '伦敦客运局成立', desc: '地铁、公交与电车统一由一个公共机构经营，弗兰克·皮克主持统一的车站设计与线路图。此后郊区地铁与公交开始配合而不是竞争。', fx: { sat: { v: 1, months: 12 } } },
      { y: 1935, m: 6, tag: '史实', title: '新工程计划', desc: '政府担保贷款，用于把中央线、北线与贝克卢线延伸到郊区。', fx: { finance: { grant: 1.4, years: 4 } } },
      { y: 1936, m: 11, tag: '史实', title: '水晶宫毁于大火', desc: '南伦敦山顶的玻璃巨构一夜烧毁，几十公里外都能看见火光。' },
      { y: 1939, m: 9, tag: '史实', title: '第二次世界大战爆发与儿童大疏散', desc: '近一百五十万儿童、孕妇与教师在几天内撤离城市，地铁与铁路几乎全部用于疏散。新工程计划搁置。', fx: { strike: { region: ['eastend', 'citylondon', 'southbank', 'camden', 'hackney', 'westend', 'isledogs', 'wapping'], pop: 0.15 }, finance: { grant: 0.5, cost: 1.35, years: 6, fade: 2 }, demand: { sc: 0.45, sh: 0.8, lz: 0.6, years: 6, fade: 2 }, sat: { v: -2, months: 24 } } },
      { y: 1940, m: 9, tag: '史实', title: '伦敦大轰炸（1940–1941）', desc: '德军连续 57 个夜晚轰炸伦敦，东区与码头区成片被毁；数十万人夜宿地铁站台，巴勒姆、银行等车站被直接命中。', fx: { strike: { region: ['eastend', 'isledogs', 'wapping', 'surreydocks', 'royaldocks', 'newham', 'southbank', 'citylondon'], pop: 0.18, jobs: 0.2 }, demand: { hw: 0.75, sh: 0.6, lz: 0.4, months: 9, fade: 1 }, sat: { v: -3, months: 12 } } },
      { y: 1944, m: 6, tag: '史实', title: 'V1 与 V2 飞弹', desc: '飞弹落在伦敦南部与东部，又有约百万人离开城市。', fx: { strike: { region: ['lewisham', 'croydon', 'southbank', 'battersea', 'eastend'], pop: 0.06, jobs: 0.04 }, demand: { lz: 0.7, months: 9 }, sat: { v: -2, months: 9 } } },
      { y: 1945, m: 5, tag: '史实', title: '欧战胜利', desc: '战争结束，疏散的人们陆续回城。东区约三分之一的住房被毁，重建要花几十年。', fx: { sat: { v: 2, months: 6 }, grow: { region: ['eastend', 'southbank', 'citylondon'], pop: 1.2, years: 6 } } },
      { y: 1946, m: 5, tag: '史实', title: '希思罗机场启用', desc: '原本的军用计划改为民用机场，第一批航班从帐篷候机楼起飞。', fx: { grow: { region: ['hounslow', 'hillingdon'], jobs: 1.3, years: 10 } } },
      { y: 1948, m: 1, tag: '史实', title: '伦敦交通国有化', desc: '战后财政紧张，配给制还要持续到 1954 年，地铁只能做最必要的维修。', fx: { finance: { grant: 0.7, years: 5, fade: 2 } } },
      { y: 1948, m: 7, tag: '史实', title: '“节俭奥运会”', desc: '第十四届奥运会在温布利举行，运动员自带毛巾，住在军营和学校里。', fx: { demand: { lz: 1.1, months: 2 }, sat: { v: 1, months: 6 } } },
      { y: 1951, m: 5, tag: '史实', title: '英国节', desc: '南岸的废墟上建起穹顶馆与皇家节日大厅，城市重新有了信心。', fx: { demand: { lz: 1.08, months: 5 }, sat: { v: 1.5, months: 8 }, grow: { region: 'southbank', jobs: 1.15, years: 6 } } },
      { y: 1952, m: 7, tag: '史实', title: '最后一辆电车停驶', desc: '“最后一周”之后，伦敦的电车全部换成柴油巴士。路上的车变多了，也更挤了。' },
      { y: 1952, m: 12, tag: '史实', title: '伦敦大烟雾', desc: '浓雾笼罩全城五天，巴士要由人提灯引路，约四千人死亡，推动了 1956 年《清洁空气法》。', fx: { demand: { sh: 0.75, lz: 0.6, months: 1 }, sat: { v: -2, months: 6 } } },
      { y: 1953, m: 2, tag: '史实', title: '北海大洪水', desc: '风暴潮袭击泰晤士河口，东部沿河地区受灾，后来促成了泰晤士河水闸的建设。', fx: { strike: { region: ['royaldocks', 'barkingdag'], pop: 0.005 }, sat: { v: -1, months: 3 } } },
      { y: 1967, m: 9, tag: '史实', title: '东印度码头关闭', desc: '集装箱运输让上游的老码头失去竞争力，东伦敦的码头开始一座接一座关闭，几万个岗位随之消失。', fx: { grow: { region: ['eastend', 'isledogs', 'royaldocks'], jobs: 0.6, pop: 0.8, years: 10 }, sat: { v: -0.5, months: 12 } } },
      { y: 1969, m: 3, tag: '史实', title: '史实背景：维多利亚线开通', desc: '伦敦半个多世纪以来第一条穿越市中心的新线路。本局的新线由你规划。' },
      { y: 1971, m: 2, tag: '史实', title: '英镑十进制', desc: '1 英镑不再是 20 先令、240 便士，而是 100 新便士。票价改用新便士显示，账目不变。' },
      { y: 1976, m: 9, tag: '史实', title: '财政危机与国际货币基金组织贷款', desc: '英国向国际货币基金组织借款，公共投资大幅削减。', fx: { finance: { grant: 0.8, years: 3, fade: 1 } } },
      { y: 1980, m: 10, tag: '史实', title: '西印度与米尔沃尔码头关闭', desc: '狗岛只剩下废弃的水面与仓库，失业率一度超过三成。', fx: { sat: { v: -0.5, months: 12 } } },
      { y: 1981, m: 7, tag: '史实', title: '伦敦码头区开发公司成立', desc: '中央政府接管东伦敦的规划权，狗岛设企业区，免税、免规划审批。', fx: { grow: { region: ['isledogs', 'surreydocks', 'wapping'], pop: 1.3, jobs: 1.3, years: 8 } } },
      { y: 1982, m: 10, tag: '史实', title: '泰晤士河水闸完工', desc: '横跨伍利奇河段的十扇闸门保护城市不再被风暴潮淹没（1984 年正式启用）。' },
      { y: 1986, m: 10, tag: '史实', title: '金融大爆炸', desc: '伦敦证券交易所放开监管，外资银行涌入，需要的是金融城装不下的大开间写字楼。', fx: { grow: { region: ['citylondon', 'isledogs'], jobs: 1.25, years: 6 } } },
      { y: 1987, m: 8, tag: '史实', title: '史实背景：码头区轻轨通车', desc: '无人驾驶的小型轻轨连接狗岛与城市边缘，通车不久运力就跟不上了。本局的线路由你规划。' },
      { y: 1987, m: 11, tag: '史实', title: '国王十字地铁站大火', desc: '木质扶梯起火，31 人遇难。此后地铁全面禁烟，木质设施逐步拆除，运营与安全投入大增。', fx: { sat: { v: -2, months: 12 }, demand: { lz: 0.95, months: 6 } } },
      { y: 1991, m: 8, tag: '史实', title: '加拿大广场一号落成', desc: '235 米的大楼成为当时英国最高建筑，第二年开发商破产，直到朱比利线延伸才真正复苏。', fx: { grow: { region: 'isledogs', jobs: 1.3, years: 10 } } },
      { y: 1994, m: 11, tag: '史实', title: '欧洲之星通车', desc: '英吉利海峡隧道开通，从滑铁卢三小时到巴黎。' },
      { y: 1999, m: 12, tag: '史实', title: '史实背景：朱比利线延伸通车', desc: '11 座气派的新车站把威斯敏斯特、伦敦桥、金丝雀码头和斯特拉特福连在一起。本局的线路由你规划。' },
      { y: 2003, m: 2, tag: '史实', title: '中心区开征拥堵费', desc: '进入中心区的车辆每天 5 英镑，车流当年下降约两成，公交与地铁的客流随之增加。玩家的地铁第一次真正让道路变空。', fx: { demand: { hw: 1.02, years: 3 }, sat: { v: 0.5, months: 12 } } },
      { y: 2005, m: 7, tag: '史实', title: '七七爆炸案', desc: '三列地铁与一辆巴士遭炸弹袭击，52 人遇难。第二天起乘客陆续回到地铁，但几个月里客流明显偏低。', fx: { demand: { hw: 0.92, sh: 0.85, lz: 0.75, months: 4, fade: 1 }, sat: { v: -2, months: 6 } } },
      { y: 2007, m: 11, tag: '史实', title: '欧洲之星改到圣潘克拉斯', desc: '高铁一号线全线通车，到巴黎只要两小时十五分。' },
      { y: 2012, m: 7, tag: '史实', title: '伦敦奥运会', desc: '伦敦第三次举办奥运会，主场在斯特拉特福的老工业区上。比赛期间地铁创下客流纪录。', fx: { demand: { lz: 1.3, hub: 1.1, months: 2 }, sat: { v: 2, months: 8 }, grow: { region: 'stratford', pop: 1.3, jobs: 1.4, years: 8 } } },
      { y: 2016, m: 6, tag: '史实', title: '英国公投决定脱欧', desc: '部分金融岗位外迁的讨论持续多年，城市人口与投资增长放缓。', fx: { grow: { region: ['citylondon', 'isledogs'], jobs: 0.9, years: 5 } } },
      { y: 2020, m: 3, tag: '史实', title: '新冠肺炎疫情', desc: '全国封城，地铁客流一度下降九成五，部分车站关闭；居家办公此后成为常态。', fx: { demand: { hw: 0.35, sc: 0.3, sh: 0.5, md: 0.8, lz: 0.25, hub: 0.2, months: 4, fade: 2 }, sat: { v: -2, months: 12 } } },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后人口、道路和区域变化按模拟规则推演，不代表真实历史。' },
      { y: 2022, m: 5, tag: '史实', title: '史实背景：伊丽莎白线开通', desc: '横贯东西的大容量铁路终于通车，比原计划晚了近四年。本局的线路由你规划。' },
    ],
    // 本地历史主题任务：参考伦敦地铁的发展需求，不要求复刻真实线路走向（奖励单位：万英镑，1860 年价格，按年份折算）
    histTasks: [
      { id: 'ld01', appear: [1860, 1], deadline: [1866, 12], type: 'connect', reward: 60, title: '世界第一条地铁', desc: '国会不让铁路进市中心，旅客下了火车还要穿城。在新路底下修一条地铁，把几座终点站连起来：连接帕丁顿、埃奇韦尔路、贝克街、大波特兰街、尤斯顿广场、国王十字-圣潘克拉斯与法灵顿。', anchors: [anchor('帕丁顿', 51.5154, -0.1755, 3), anchor('埃奇韦尔路', 51.5199, -0.1679, 3), anchor('贝克街', 51.5226, -0.1571, 3), anchor('大波特兰街', 51.5238, -0.1439, 3), anchor('尤斯顿广场', 51.5258, -0.1359, 3), anchor('国王十字-圣潘克拉斯', 51.5308, -0.1238, 3), anchor('法灵顿', 51.5203, -0.1053, 3)] },
      { id: 'ld02', appear: [1862, 1], deadline: [1872, 12], type: 'connect', reward: 50, title: '通往哈默史密斯', desc: '西边的田野正在变成住宅区。把线路从帕丁顿延伸出去：连接帕丁顿、韦斯特伯恩公园、拉德布罗克格罗夫、牧人丛林市场与哈默史密斯。城外可以走地面，省下不少钱。', anchors: [anchor('帕丁顿', 51.5154, -0.1755, 3), anchor('韦斯特伯恩公园', 51.5210, -0.2010, 3), anchor('拉德布罗克格罗夫', 51.5172, -0.2107, 3), anchor('牧人丛林市场', 51.5058, -0.2265, 3), anchor('哈默史密斯', 51.4920, -0.2239, 3)] },
      { id: 'ld03', appear: [1865, 1], deadline: [1876, 12], type: 'connect', reward: 70, title: '沿着河岸进城', desc: '新修的维多利亚堤岸正好能埋隧道。连接南肯辛顿、斯隆广场、维多利亚、威斯敏斯特、河堤、黑衣修士与市长官邸。', anchors: [anchor('南肯辛顿', 51.4941, -0.1738, 3), anchor('斯隆广场', 51.4924, -0.1565, 3), anchor('维多利亚', 51.4965, -0.1447, 3), anchor('威斯敏斯特', 51.5010, -0.1250, 3), anchor('河堤', 51.5074, -0.1223, 3), anchor('黑衣修士', 51.5119, -0.1037, 3), anchor('市长官邸', 51.5122, -0.0940, 3)] },
      { id: 'ld04', appear: [1866, 1], deadline: [1878, 12], type: 'connect', reward: 60, title: '从河底过去', desc: '布鲁内尔的泰晤士隧道一直只能走人。让火车穿过去，把东区和南岸连起来：连接白教堂、沃平、罗瑟希德与新十字。', anchors: [anchor('白教堂', 51.5194, -0.0612, 3), anchor('沃平', 51.5043, -0.0558, 3), anchor('罗瑟希德', 51.5010, -0.0521, 3), anchor('新十字', 51.4767, -0.0327, 3)] },
      { id: 'ld05', appear: [1870, 1], deadline: [1888, 12], type: 'connect', reward: 110, title: '绕城一圈', desc: '两条线的尽头相隔不远，两家公司却互不相让。把它们连成一个环，绕过整个市中心：连接贝克街、利物浦街、塔丘、威斯敏斯特与肯辛顿高街。', anchors: [anchor('贝克街', 51.5226, -0.1571, 3), anchor('利物浦街', 51.5178, -0.0823, 3), anchor('塔丘', 51.5098, -0.0766, 3), anchor('威斯敏斯特', 51.5010, -0.1250, 3), anchor('肯辛顿高街', 51.5009, -0.1925, 3)] },
      { id: 'ld06', appear: [1875, 1], deadline: [1890, 12], type: 'coverage', target: 0.15, reward: 90, title: '地铁覆盖一成五人口', desc: '1890 年前，步行 15 分钟可到达地铁站的人口不低于全图人口的 15%。' },
      { id: 'ld07', appear: [1884, 1], deadline: [1895, 12], type: 'connect', reward: 90, title: '更深的隧道', desc: '再也挖不开街道了。用盾构在黏土层深处修一条线，穿过泰晤士河：连接斯托克韦尔、肯宁顿、象堡、博罗与银行。', anchors: [anchor('斯托克韦尔', 51.4722, -0.1229, 3), anchor('肯宁顿', 51.4884, -0.1053, 3), anchor('象堡', 51.4943, -0.1001, 3), anchor('博罗', 51.5011, -0.0943, 3), anchor('银行', 51.5133, -0.0886, 3)] },
      { id: 'ld08', appear: [1892, 1], deadline: [1902, 12], type: 'connect', reward: 60, title: '滑铁卢的通勤者', desc: '每天几万人在滑铁卢下车，再走路过河去金融城。连接滑铁卢与银行。', anchors: [anchor('滑铁卢', 51.5033, -0.1148, 3), anchor('银行', 51.5133, -0.0886, 3)] },
      { id: 'ld1', appear: [1900, 1], deadline: [1906, 12], type: 'connect', reward: 90, title: '两便士地铁', desc: '牛津街上人流如织，却只有马车。沿牛津街到金融城修一条东西向的电气地铁：连接牧人丛林、诺丁山门、邦德街、牛津圆环、霍尔本与银行。', anchors: [anchor('牧人丛林', 51.5046, -0.2187, 3), anchor('诺丁山门', 51.5090, -0.1960, 3), anchor('邦德街', 51.5142, -0.1494, 3), anchor('牛津圆环', 51.5152, -0.1415, 3), anchor('霍尔本', 51.5174, -0.1200, 3), anchor('银行', 51.5133, -0.0886, 3)] },
      { id: 'ld2', appear: [1902, 1], deadline: [1910, 12], type: 'connect', reward: 80, title: '南北穿城：过河到象堡', desc: '滑铁卢与南岸的乘客要到西区去。连接贝克街、牛津圆环、皮卡迪利圆环、查令十字、滑铁卢与象堡。过河段只能走隧道。', anchors: [anchor('贝克街', 51.5226, -0.1571, 3), anchor('牛津圆环', 51.5152, -0.1415, 3), anchor('皮卡迪利圆环', 51.5098, -0.1342, 3), anchor('查令十字', 51.5074, -0.1275, 3), anchor('滑铁卢', 51.5033, -0.1148, 3), anchor('象堡', 51.4943, -0.1001, 3)] },
      { id: 'ld3', appear: [1902, 6], deadline: [1912, 12], type: 'connect', reward: 90, title: '西区到北伦敦', desc: '连接哈默史密斯、骑士桥、皮卡迪利圆环、霍尔本、国王十字-圣潘克拉斯与芬斯伯里公园。', anchors: [anchor('哈默史密斯', 51.4920, -0.2239, 3), anchor('骑士桥', 51.5015, -0.1607, 3), anchor('皮卡迪利圆环', 51.5098, -0.1342, 3), anchor('霍尔本', 51.5174, -0.1200, 3), anchor('国王十字-圣潘克拉斯', 51.5308, -0.1238, 3), anchor('芬斯伯里公园', 51.5642, -0.1065, 3)] },
      { id: 'ld4', appear: [1904, 1], deadline: [1913, 12], type: 'connect', reward: 80, title: '通往汉普斯特德', desc: '把地铁穿过北部高地修到田野里去：连接查令十字、尤斯顿、卡姆登镇、汉普斯特德与戈尔德斯格林。沿线的房子会跟着地铁长出来。', anchors: [anchor('查令十字', 51.5074, -0.1275, 3), anchor('尤斯顿', 51.5282, -0.1337, 3), anchor('卡姆登镇', 51.5392, -0.1426, 3), anchor('汉普斯特德', 51.5568, -0.1780, 3), anchor('戈尔德斯格林', 51.5724, -0.1941, 3)] },
      { id: 'ld5', appear: [1912, 1], deadline: [1925, 12], type: 'coverage', target: 0.3, reward: 100, title: '地铁覆盖三成人口', desc: '1925 年前，步行 15 分钟可到达地铁站的人口不低于全图人口的 30%。', },
      { id: 'ld6', appear: [1919, 1], deadline: [1930, 12], type: 'connect', reward: 110, title: '向南到莫登', desc: '南伦敦的通勤者只能靠市郊铁路和电车。连接银行、肯宁顿、克拉珀姆公地、图廷百老汇与莫登。', anchors: [anchor('银行', 51.5133, -0.0886, 3), anchor('肯宁顿', 51.4884, -0.1053, 3), anchor('克拉珀姆公地', 51.4617, -0.1383, 3), anchor('图廷百老汇', 51.4275, -0.1680, 3), anchor('莫登', 51.4022, -0.1948, 3)] },
      { id: 'ld7', appear: [1925, 1], deadline: [1936, 12], type: 'connect', reward: 110, title: '北到科克福斯特斯', desc: '芬斯伯里公园的换乘早已挤不下，公交与电车公司还反对延伸。连接芬斯伯里公园、伍德格林、萨斯盖特与科克福斯特斯。', anchors: [anchor('芬斯伯里公园', 51.5642, -0.1065, 3), anchor('伍德格林', 51.5975, -0.1097, 3), anchor('萨斯盖特', 51.6323, -0.1277, 3), anchor('科克福斯特斯', 51.6517, -0.1496, 3)] },
      { id: 'ld8', appear: [1934, 1], deadline: [1940, 8], type: 'connect', reward: 120, title: '新工程计划：向东到伊尔福德', desc: '战前最大的地铁扩建计划，要把郊区住宅区接进城。连接利物浦街、贝思纳尔格林、斯特拉特福、莱顿与甘茨山。战争一旦爆发，工程就会搁置。', anchors: [anchor('利物浦街', 51.5178, -0.0823, 3), anchor('贝思纳尔格林', 51.5270, -0.0555, 3), anchor('斯特拉特福', 51.5416, -0.0033, 3), anchor('莱顿', 51.5566, -0.0053, 3), anchor('甘茨山', 51.5765, 0.0663, 3)] },
      { id: 'ld9', appear: [1946, 1], deadline: [1960, 12], type: 'coverage', target: 0.45, reward: 120, title: '战后重建：覆盖四成五人口', desc: '1960 年前，步行 15 分钟可到达地铁站的人口不低于全图人口的 45%。重建要花钱，也要等拨款恢复。' },
      { id: 'ld10', appear: [1955, 1], deadline: [1971, 12], type: 'connect', reward: 180, title: '市中心的新干线', desc: '半个世纪没有新线穿过市中心，老线路挤得要命。连接沃尔瑟姆斯托中央、七姐妹、芬斯伯里公园、国王十字-圣潘克拉斯、牛津圆环、维多利亚与布里克斯顿。', anchors: [anchor('沃尔瑟姆斯托中央', 51.5830, -0.0197, 3), anchor('七姐妹', 51.5822, -0.0749, 3), anchor('芬斯伯里公园', 51.5642, -0.1065, 3), anchor('国王十字-圣潘克拉斯', 51.5308, -0.1238, 3), anchor('牛津圆环', 51.5152, -0.1415, 3), anchor('维多利亚', 51.4965, -0.1447, 3), anchor('布里克斯顿', 51.4627, -0.1145, 3)] },
      { id: 'ld11', appear: [1968, 1], deadline: [1979, 12], type: 'connect', reward: 180, title: '直达希思罗', desc: '世界上最繁忙的国际机场还没有地铁。连接希思罗机场、哈顿十字、西豪恩斯洛与哈默史密斯。', anchors: [anchor('希思罗机场', 51.4700, -0.4540, 4), anchor('哈顿十字', 51.4669, -0.4233, 3), anchor('西豪恩斯洛', 51.4735, -0.3866, 3), anchor('哈默史密斯', 51.4920, -0.2239, 3)] },
      { id: 'ld12', appear: [1982, 1], deadline: [1993, 12], type: 'connect', reward: 200, title: '码头区的轻轨', desc: '废弃的码头需要一条便宜的轻轨才能招来开发商。连接银行、莱姆豪斯、金丝雀码头与岛屿花园。沿旧铁路走高架可以省下很多钱。', anchors: [anchor('银行', 51.5133, -0.0886, 3), anchor('莱姆豪斯', 51.5125, -0.0397, 3), anchor('金丝雀码头', 51.5054, -0.0195, 3), anchor('岛屿花园', 51.4880, -0.0083, 3)] },
      { id: 'ld13', appear: [1990, 1], deadline: [1999, 12], type: 'connect', reward: 260, title: '千禧年：朱比利线', desc: '千禧巨蛋年底开幕，金丝雀码头的大楼也等着地铁救活。连接威斯敏斯特、滑铁卢、伦敦桥、金丝雀码头、北格林尼治与斯特拉特福。', anchors: [anchor('威斯敏斯特', 51.5010, -0.1250, 3), anchor('滑铁卢', 51.5033, -0.1148, 3), anchor('伦敦桥', 51.5052, -0.0860, 3), anchor('金丝雀码头', 51.5054, -0.0195, 3), anchor('北格林尼治', 51.5005, 0.0039, 3), anchor('斯特拉特福', 51.5416, -0.0033, 3)] },
      { id: 'ld14', appear: [1985, 1], deadline: [2000, 12], type: 'coverage', target: 0.6, reward: 240, title: '千禧年：覆盖六成人口', desc: '2000 年前，步行 15 分钟可到达地铁站的人口不低于全图人口的 60%。' },
      { id: 'ld15', appear: [2005, 7], deadline: [2012, 7], type: 'connect', reward: 280, title: '2012 年奥运会', desc: '奥运会开幕前，连接斯特拉特福、西汉姆、坎宁镇、金丝雀码头与伦敦城市机场。', anchors: [anchor('斯特拉特福', 51.5416, -0.0033, 3), anchor('西汉姆', 51.5287, 0.0056, 3), anchor('坎宁镇', 51.5147, 0.0082, 3), anchor('金丝雀码头', 51.5054, -0.0195, 3), anchor('伦敦城市机场', 51.5035, 0.0495, 3)] },
      { id: 'ld16', appear: [2008, 1], deadline: [2022, 12], type: 'connect', reward: 340, title: '横贯东西的大容量铁路', desc: '老线路的隧道太小，再也提不了运力。修一条又大又快的新线：连接希思罗机场、帕丁顿、邦德街、托特纳姆法院路、法灵顿、利物浦街与金丝雀码头。', anchors: [anchor('希思罗机场', 51.4700, -0.4540, 4), anchor('帕丁顿', 51.5154, -0.1755, 3), anchor('邦德街', 51.5142, -0.1494, 3), anchor('托特纳姆法院路', 51.5165, -0.1310, 3), anchor('法灵顿', 51.5203, -0.1053, 3), anchor('利物浦街', 51.5178, -0.0823, 3), anchor('金丝雀码头', 51.5054, -0.0195, 3)] },
    ],
    dynTasks: [
      { id: 'ldd1', from: [1866, 1], to: [1900, 12], type: 'connect', months: 48, reward: 40000, title: '终点站之间', desc: '火车的终点站都在城市边缘，旅客要穿城换乘。连接帕丁顿、尤斯顿、国王十字-圣潘克拉斯与利物浦街。', anchors: [anchor('帕丁顿', 51.5154, -0.1755, 3), anchor('尤斯顿', 51.5282, -0.1337, 3), anchor('国王十字-圣潘克拉斯', 51.5308, -0.1238, 3), anchor('利物浦街', 51.5178, -0.0823, 3)] },
      { id: 'ldd2', from: [1920, 1], to: [1939, 6], type: 'connect', months: 48, reward: 45000, title: '大都会乡土', desc: '大都会铁路一边修线一边卖地。连接贝克街、温布利公园与鲁伊斯利普，让田野长成郊区。', anchors: [anchor('贝克街', 51.5226, -0.1571, 3), anchor('温布利公园', 51.5635, -0.2795, 3), anchor('鲁伊斯利普', 51.5715, -0.4213, 3)] },
      { id: 'ldd3', from: [1935, 1], to: [1960, 12], type: 'connect', months: 48, reward: 40000, title: '西部工业走廊', desc: '大西路与西大道两侧的工厂雇了几十万工人。连接皇家公园、北阿克顿与牧人丛林。', anchors: [anchor('皇家公园', 51.5270, -0.2841, 3), anchor('北阿克顿', 51.5237, -0.2597, 3), anchor('牧人丛林', 51.5046, -0.2187, 3)] },
      { id: 'ldd4', from: [1985, 1], to: [2005, 12], type: 'connect', months: 48, reward: 45000, title: '南岸的复兴', desc: '滑铁卢、河岸区与伦敦桥一带的旧仓库变成了画廊与餐馆。连接滑铁卢、南华克与伦敦桥。', anchors: [anchor('滑铁卢', 51.5033, -0.1148, 3), anchor('萨瑟克', 51.5040, -0.1050, 3), anchor('伦敦桥', 51.5052, -0.0860, 3)] },
      { id: 'ldd5', from: [2005, 1], to: [2020, 12], type: 'connect', months: 48, reward: 50000, title: '东伦敦的环线', desc: '老东伦敦线与北伦敦线连起来，就是一条不经市中心的环线。连接白教堂、道尔斯顿枢纽、海布里-伊斯灵顿与克拉珀姆枢纽。', anchors: [anchor('白教堂', 51.5194, -0.0612, 3), anchor('道尔斯顿枢纽', 51.5461, -0.0752, 3), anchor('海布里-伊斯灵顿', 51.5461, -0.1034, 3), anchor('克拉珀姆枢纽', 51.4641, -0.1703, 3)] },
    ],
    taskNote: '历史主题任务参考伦敦 1860 年起的发展需求（第一条地铁、内环线、深层地铁、过河、郊区延伸、战后重建、希思罗、码头区与奥运），不要求按真实地铁线路建设，只需满足目标描述。',
    scenarios: [
      { id: 'ld-sc1', theme: '伦敦：河的那一边', title: '让南岸也有地铁', type: 'regionCov', from: [1905, 1], to: [1950, 12], months: 120, rewardMonths: 4,
        regions: ['southbank', 'battersea'], areaName: '南岸与巴特西', target: 0.45,
        desc: '河北岸的地铁密如蛛网，南伦敦却几乎只能坐市郊铁路和电车：过河隧道太贵，地下水又多。让南岸与巴特西四成半的居民步行就能到地铁站。',
        tips: ['过河段尽量短，垂直穿过泰晤士河', '市郊铁路已经覆盖的地方先别修，去填它们的空白', '滑铁卢、伦敦桥两个大枢纽要接上'] },
      { id: 'ld-sc2', theme: '伦敦：下注码头区', title: '在废墟上修一条线', type: 'budgetConnect', from: [1955, 1], to: [1984, 12], months: 96, rewardMonths: 5, budgetX: 1.3,
        anchors: [anchor('银行', 51.5133, -0.0886, 3), anchor('莱姆豪斯', 51.5125, -0.0397, 3), anchor('金丝雀码头', 51.5054, -0.0195, 3)],
        desc: '码头正在一座接一座关闭，所有人都说东伦敦没有前途。用有限的预算修一条线，从银行一直通到狗岛。现在几乎没人坐，等写字楼长出来就不一样了。',
        tips: ['出了城可以沿旧铁路走高架，省下隧道钱', '站距拉长，先保证能到', '一旦 1985 年前通车，开发商自己会找上门'] },
    ],
    dataNote: [
      ['真实地理', 'hist', '泰晤士河与码头、道路与桥梁、铁路、公园、自治市边界与地名来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），为现代数据，按 250 m 网格投影；英文地名按中文译名表转为简体中文，无中文译名的对象不显示名称；军事用地范围内的地名、绿地名称与小路已剔除。'],
      ['史实参考', 'hist', '地铁通车年份（只作史实背景）、地标落成年份、主要道路通车年份、码头关闭年份、两次世界大战与伦敦大轰炸、拥堵费、奥运会、货币十进制。'],
      ['估算', 'est', '1860 年人口与就业分布、人口增长曲线、物价指数（参考英国消费价格的公开统计取近似值）、战争造成的人口与岗位损失、拨款与造价变化、公交电车与市郊铁路的比重、造价、票价、运营费用、地图范围 GDP 与利率。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。公交、电车与市郊铁路不参与乘客运营模拟，只按比重分走一部分出行；地面铁路按真实线位阻隔步行与小路；真实的地铁线路不会自动出现。'],
      ['', '', '模拟结果不得作为真实伦敦交通规划预测。'],
    ],
    // 线路配色参考伦敦地铁
    lineColorsNice: ['#e32017', '#ffd300', '#00782a', '#f3a9bb', '#a0a5a9', '#751056', '#000000', '#003688', '#0098d4', '#95cdba', '#b36305', '#00a4a7', '#ee7c0e', '#6950a1'],
    places: (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; }),
  };
  // 位置校正：与 OSM 车站同名的设施与任务锚点，改用车站位置（相距 3 km 以内时）
  const nearSt = function (name, x, y) { const p = ST[name.replace(/（.*?）/g, '')]; return p && Math.hypot(p[1] - x, p[2] - y) < 12 ? p : null; };
  for (const f of data.facilities) if (f.at && !f.ext) { const p = nearSt(f.n, f.at[0], f.at[1]); if (p) f.at = [p[1], p[2]]; }
  for (const t of data.histTasks.concat(data.dynTasks, data.scenarios)) for (const a of t.anchors || []) { if (Array.isArray(a)) continue; const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }
  for (const er of data.eras) for (const gl of er.goals || []) for (const a of gl.anchors || []) { const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }
  for (const lm of data.landmarks) lm.real = true;

  // 拨款：按「每年可建地下线公里数」折算（估算），再乘造价指数。
  // 战争与财政危机的影响由事件 fx.finance 表示，这里不重复计入
  const KM_YEAR = [[1860, 3], [1880, 3], [1890, 3.5], [1900, 4], [1914, 4], [1920, 3], [1930, 4], [1939, 4], [1947, 2], [1960, 2], [1968, 3.5], [1980, 3.5], [1990, 5], [2005, 6], [2012, 8], [2050, 8]];
  const grantBase = YEARS.map(function (y) { return [y, +(U.interp(KM_YEAR, y) / 12 * 22 * level(y, COST_PREM)).toPrecision(4)]; });

  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'ld', name: '伦敦', title: '伦敦 · 1860', sub: '真实地理 · 1860 年起 · 英镑 · 修世界第一条地铁',
    desc: '从 1860 年世界最大的城市开始：世界上还没有一条地铁，第一条由你来修。蒸汽与电气、泰晤士河与历史城区、两次世界大战、码头区的衰落与金丝雀码头的崛起，都会改变这张线网的价值。',
    facts: [['范围', '49 km × 35 km'], ['起始', '1860 年'], ['人口', '约 300 万'], ['货币', '英镑'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 1, scenario: 'ld-1860',
    region: '英国', tagline: '修世界第一条地铁', difficulty: 4, tags: ['无地铁开局', '一百六十年跨度', '两次大战'],
    intro: '1860 年的伦敦，街道被马车堵死，火车进不了市中心，世界上还没有一条地铁。你要在狭窄的历史城区底下挖第一条隧道，看着蒸汽换成电力，一次次穿过泰晤士河，和公共马车、电车、巴士、市郊铁路抢乘客。两次世界大战会炸毁东区、掏空财政；码头关闭之后，一条早早修到狗岛的线路，也许会在几十年后变成全城最重要的线路。',
    features: [['train', '世界第一条地铁', '世界上还没有地铁，第一条由你来修，从蒸汽一路走到电气']],
    highlights: [[1863, '世界第一条地铁'], [1890, '第一条深层电气地铁'], [1908, '第一次伦敦奥运会'], [1933, '伦敦客运局成立'], [1940, '伦敦大轰炸'], [1952, '最后一辆电车'], [1981, '码头区开发公司'], [1991, '加拿大广场一号'], [2003, '拥堵费'], [2012, '第三次伦敦奥运会']],
    geo: G, data: data,
    econ: { devOffset: 0, money: 1 },
    cfg: {
      W: 196, H: 140, START: { y: 1860, m: 1, d: 1, minute: 360 },
      // 工作周：20 世纪上半叶周六上午上班很普遍（史实），比例为估算；中小学周六不上课
      workWeek: { sat: [[1860, 1], [1900, 0.9], [1919, 0.75], [1946, 0.6], [1960, 0.35], [1970, 0.2], [2000, 0.15]], school: [[1860, 0]] },
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[1860, 3.0e6], [1870, 3.7e6], [1880, 4.6e6], [1890, 5.4e6], [1900, 6.2e6], [1911, 7.1e6], [1921, 7.4e6], [1931, 8.1e6], [1939, 8.6e6], [1941, 6.9e6], [1945, 7.0e6], [1951, 8.1e6], [1961, 7.9e6], [1971, 7.4e6], [1981, 6.7e6], [1991, 6.8e6], [2001, 7.2e6], [2011, 8.1e6], [2020, 8.8e6], [2050, 9.8e6], [2300, 10e6]], histEnd: 2020, jobsRatio: [[1860, 0.46], [1900, 0.47], [1939, 0.5], [1950, 0.55], [1981, 0.6], [2000, 0.62], [2020, 0.68]] }),
      // 货币：内部记账单位为万英镑；1971 年 2 月十进制之前，票价按先令与便士显示（1 英镑 = 240 便士）
      money: { code: 'GBP', unit: '英镑', wan: '万英镑', yi: '亿英镑', sym: '£', pence: true,
        eras: [{ from: [1971, 2], code: 'GBP', unit: '英镑', wan: '万英镑', yi: '亿英镑', sym: '£', pence: false }] },
      econBase: 1860,
      // 造价（万英镑，1860 年价格）：地铁每公里约 22 万英镑（参考大都会铁路约 6 km、总造价约 130 万英镑的量级，含车站）；过河隧道另加（地下水与气闸施工）
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 22, surface: 5, elevated: 11 },
        riverPerKm: { underground: 60, surface: 28, elevated: 28 },
        hillPerKm: 12, protectedPerKm: 10,
        station: { underground: { S: 4, M: 6.5, L: 11 }, elevated: { S: 2.4, M: 3.6, L: 5.6 }, surface: { S: 1.2, M: 2, L: 3.2 } },
        demolishPerCell: 45,
        // 历史城区：隧道与车站按倍数计，guard / stationGuard 为古建周围的地下保护范围，demolish 为拆迁倍数
        inflation: COST_INFL,
      }),
      ops: Object.assign({}, CM.CFG.ops, { carKmCost: 0.0000018, stationDaily: { S: 0.00025, M: 0.00042, L: 0.00072 }, inflation: OPS_INFL }),
      // 票价：1863 年大都会铁路三等车约 3 便士（史实），约合 0.0125 英镑
      fareDefault: { mode: 'flat', flat: 0.0125, dist: false }, fareRange: { min: 0, max: 0.05, step: 0.0005, scale: true },
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 300, grantBase: grantBase, debtLimit: -180, rewardScale: 0.00089,
        bonds: { local: { rate: [[1860, 0.032], [1900, 0.028], [1914, 0.04], [1920, 0.055], [1930, 0.04], [1935, 0.03], [1946, 0.028], [1958, 0.05], [1970, 0.09], [1974, 0.15], [1981, 0.15], [1985, 0.105], [1990, 0.11], [1995, 0.08], [2000, 0.05], [2008, 0.045], [2012, 0.018], [2015, 0.018], [2020, 0.005], [2023, 0.04], [2050, 0.03]], quotaMonths: 6, capMonths: 30 }, ct: { spread: 0.012, quotaMonths: 4, capMonths: 18 }, term6: 0.003 } }),
      // 出行选择（估算）：实际值以 1860 年英镑计，再按物价水平换成当年英镑。早年的「道路出行」主要是公共马车、电车与出租马车
      choice: Object.assign({}, CM.CFG.choice, {
        carAccess: 7,
        vot: nominal([[1860, 0.012], [1900, 0.0165], [1913, 0.019], [1929, 0.025], [1938, 0.0275], [1946, 0.025], [1950, 0.03], [1960, 0.044], [1973, 0.077], [1990, 0.105], [2008, 0.127], [2020, 0.132], [2050, 0.165]], YEARS),
        carCostPerKm: nominal([[1860, 0.0025], [1900, 0.00275], [1920, 0.003], [1930, 0.0033], [1950, 0.003], [1960, 0.0033], [1975, 0.0034], [1990, 0.0036], [2005, 0.0039], [2020, 0.0041], [2050, 0.0044]], YEARS),
        parking: nominal([[1860, 0], [1950, 0], [1960, 0.0044], [1975, 0.014], [1990, 0.025], [2003, 0.04], [2020, 0.05], [2050, 0.055]], YEARS),
        occupancy: [[1860, 6], [1920, 4.5], [1935, 3], [1952, 2.4], [1960, 1.8], [1975, 1.5], [1990, 1.4], [2050, 1.35]],
        hoRate: [[1860, 0.1], [1900, 0.14], [1930, 0.18], [1960, 0.24], [1990, 0.38], [2020, 0.45], [2050, 0.5]],
        workerRate: [[1860, 0.36], [1950, 0.42], [1990, 0.45], [2050, 0.48]],
        distDecayHW: [[1860, 2.4], [1900, 3.5], [1930, 5], [1960, 6.5], [1990, 8.5], [2030, 10]],
        distDecayHO: [[1860, 1.5], [1900, 2], [1960, 3], [1990, 4], [2030, 5]],
        purposeShare: { sc: [[1860, 0.1], [1880, 0.18], [1900, 0.22], [1960, 0.26], [1990, 0.2], [2020, 0.17], [2050, 0.15]], md: [[1860, 0.03], [1900, 0.04], [1960, 0.05], [1990, 0.07], [2020, 0.08], [2050, 0.1]], lz: [[1860, 0.12], [1900, 0.18], [1960, 0.22], [1990, 0.3], [2020, 0.36], [2050, 0.38]] },
      }),
      // 道路通行能力（估算）：1950–60 年代拓宽与快速路使通行能力上升；2000 年代起道路空间逐步让给公交与自行车（拥堵费）
      road: Object.assign({}, CM.CFG.road, { capGrowth: [[1860, 0.55], [1900, 0.65], [1925, 0.85], [1940, 1.0], [1960, 1.3], [1975, 1.6], [1990, 1.7], [2003, 1.75], [2020, 1.55], [2040, 1.5]] }),
      // 城市经济（macro.js）：1860 年地图范围 GDP 约 1.3 亿英镑（估算，约占英国的两成）
      macro: {
        area: '地图范围（大伦敦大部分地区）', region: '英国',
        gdp0: 13000, revRatio: [[1860, 0.05], [1900, 0.06], [1950, 0.1], [1980, 0.13], [2020, 0.15]], revElastic: 1.4,
        prod: [[1860, 0.012], [1873, 0.012], [1874, 0.009], [1900, 0.009], [1913, 0.009], [1914, 0.006], [1919, 0.012], [1929, 0.012], [1930, 0.006], [1938, 0.016], [1939, 0.01], [1946, 0.016], [1950, 0.024], [1960, 0.026], [1973, 0.024], [1974, 0.012], [1980, 0.018], [1990, 0.021], [2000, 0.022], [2008, 0.009], [2020, 0.008], [2050, 0.009]],
        infl: UK_INFL, longRun: { infl: LONG_INFL }, histEnd: 2020,
        ref: { label: '英国实际 GDP 增速', src: '公开统计的时期平均与重点年份（近似值）', periods: [[1860, 1873, 0.022], [1874, 1899, 0.019], [1900, 1913, 0.014], [1920, 1929, 0.019], [1930, 1938, 0.021], [1950, 1973, 0.029], [1974, 1990, 0.019], [1991, 2007, 0.027], [2010, 2019, 0.019]], points: [[1921, -0.1], [1931, -0.051], [1975, -0.015], [1980, -0.02], [1991, -0.012], [2009, -0.042], [2020, -0.095]] },
        struct: { trade: 0.65, fin: 0.85, ind: 0.45, tour: 0.6, prop: 0.65 },
        events: [
          { id: 'panic1866', y: 1866, m: 5, kind: 'fin', scope: '全国', title: '1866 年金融恐慌', desc: '奥弗伦-格尼银行倒闭，利率升到 10%，铁路投资大幅收缩。', lv: [-0.012, -0.015, -0.006, 0] },
          { id: 'depr1873', y: 1873, m: 10, kind: 'fin', scope: '国际', title: '长期萧条', desc: '物价与利润持续下跌，增长放缓，不过工资的购买力在上升。', lv: [-0.004, -0.008, -0.008, -0.006, -0.004, 0] },
          { id: 'baring1890', y: 1890, m: 11, kind: 'fin', scope: '全国', title: '巴林银行危机', desc: '巴林银行险些倒闭，英格兰银行出手救助，投资一度冷却。', lv: [-0.004, -0.006, 0] },
          { id: 'ww1_1914', y: 1914, m: 8, kind: 'war', scope: '国际', title: '第一次世界大战', desc: '劳动力应征入伍，民用生产与投资让位于战争，国债急剧上升。', lv: [-0.02, -0.05, -0.05, -0.04, -0.03, -0.02, 0] },
          { id: 'flu1918', y: 1918, m: 10, kind: 'epi', scope: '国际', title: '西班牙流感', desc: '流感在战争末期席卷城市，工厂与商店一度停业。', lv: [-0.008, 0] },
          { id: 'slump1920', y: 1920, m: 12, kind: 'fin', scope: '全国', title: '1920–21 年衰退', desc: '战后繁荣破灭，英国经历了历史上最严重的一次产出下降。', lv: [-0.03, -0.09, -0.05, -0.02, 0] },
          { id: 'strike1926', y: 1926, m: 5, kind: 'local', scope: '全国', title: '大罢工', desc: '全国大罢工与煤矿停工拖累生产。', lv: [-0.02, 0] },
          { id: 'depr1930', y: 1930, m: 1, kind: 'fin', scope: '国际', title: '大萧条', desc: '出口锐减、失业飙升；1931 年英国放弃金本位，伦敦与东南部比北方恢复得快。', lv: [-0.015, -0.05, -0.05, -0.03, -0.01, 0] },
          { id: 'ww2_1939', y: 1939, m: 9, kind: 'war', scope: '国际', title: '第二次世界大战', desc: '战争动员几乎吞没了全部资源，伦敦遭受连续轰炸，出口与民用投资几乎停止。', lv: [-0.01, -0.08, -0.12, -0.12, -0.12, -0.13, -0.1, -0.05, -0.02, 0] },
          { id: 'recon1948', y: 1948, m: 4, kind: 'boom', scope: '国际', title: '马歇尔计划与战后复苏', desc: '美国援助与出口恢复推动重建，配给制逐步取消。', lv: [0.005, 0.01, 0.01, 0.005, 0] },
          { id: 'deval1967', y: 1967, m: 11, kind: 'fin', scope: '全国', title: '英镑贬值', desc: '英镑对美元贬值 14%，紧缩政策随之而来。', lv: [-0.004, -0.004, 0] },
          { id: 'oil1973', y: 1973, m: 10 },
          { id: 'imf1976', y: 1976, m: 9, kind: 'fin', scope: '全国', title: '财政危机', desc: '英国向国际货币基金组织借款，公共投资削减。', lv: [-0.006, -0.008, -0.004, 0] },
          { id: 'oil1979', y: 1979, m: 1, scale: 0.8 },
          { id: 'recess1980', y: 1980, m: 3, kind: 'fin', scope: '全国', title: '1980–81 年衰退', desc: '高利率与高汇率下制造业大量关闭，东伦敦与西部工业带受创最重。', lv: [-0.02, -0.03, -0.015, 0] },
          { id: 'bigbang1986', y: 1986, m: 10, kind: 'boom', scope: '本地', title: '金融大爆炸', desc: '金融监管放开后，外资银行涌入伦敦，写字楼与岗位快速增长。', lv: [0.005, 0.012, 0.012, 0.006, 0] },
          { id: 'erm1992', y: 1990, m: 7, kind: 'fin', scope: '全国', title: '1990 年代初衰退与退出欧洲汇率机制', desc: '房地产泡沫破灭，1992 年“黑色星期三”英镑退出汇率机制，之后经济反而复苏。', lv: [-0.01, -0.02, -0.012, -0.004, 0] },
          { id: 'dotcom2001', y: 2001, m: 4, scale: 0.6 },
          { id: 'gfc2008', y: 2008, m: 9, scale: 1.3 },
          { id: 'brexit2016', y: 2016, m: 6, kind: 'policy', scope: '全国', title: '脱欧公投', desc: '不确定性拖累投资，部分金融岗位外迁。', lv: [-0.003, -0.004, -0.004, -0.002, 0] },
          { id: 'covid2020', y: 2020, m: 3, scale: 1.8, desc: '全国封城，旅游、零售与餐饮业停摆，2020 年英国经济收缩近一成。' },
        ],
      },
    },
    cam: { cx: 108, cy: 71, zoom: 16 },
  });
})(window.CM);
