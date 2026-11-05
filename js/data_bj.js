'use strict';
// 北京 · 1990，社区自定义空白路网场景。现实中北京当时已有地铁。
// 地形和道路使用现代 OSM / WGS-84；规划片区边界、人口就业、价格和客流为游戏估算。
// 历史事件来源与重建方法见 docs/beijing-map.md。区域开放是游戏阶段，不是建城年份。
(function (CM) {
  const G = CM.GEOS.bj, P = G.proj;
  const ll = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const at = function (lat, lon, props) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, props); };
  const box = function (south, west, north, east) { return [ll(north, west), ll(north, east), ll(south, east), ll(south, west)]; };
  const anchor = function (name, lat, lon, r) { return at(lat, lon, { name: name, r: r || 3 }); };
  const data = {
    city: '北京', riverName: '永定河', hsrYear: 2008,
    stages: [[1999, '老城与新中心'], [2008, '迎奥运建设期'], [2019, '多中心通勤']], stageLast: '双机场时代',
    eras: [
      { id: 'bj-e1', from: 1990, name: '老城与新中心', tag: '史实参考',
        summary: '史实：北京已拥有地铁，1996 年北京西站启用。玩法：本场景采用空白路网，重新规划东西骨干与老城接驳；人口、岗位和区域开放为估算。',
        grow: { pop: { oldwest: 0.8, oldeast: 0.8, fengtai: 1.3, haidian: 1.3 }, jobs: { cbd: 1.7, zhongguancun: 1.5 } },
        corridors: [{ a: 'oldeast', b: 'cbd', f: 1.2 }, { a: 'fengtai', b: 'oldwest', f: 1.2 }] },
      { id: 'bj-e2', from: 1999, name: '迎奥运建设期', tag: '史实参考',
        summary: '史实：1999 年国务院批复建设中关村科技园区，2008 年北京举办夏季奥运会。估算：科研园区与北部居住区扩张，奥林匹克公园和首都机场的接驳需求增长。',
        grow: { pop: { huitian: 1.8, wangjing: 1.5, oldwest: 0.6, oldeast: 0.6 }, jobs: { zhongguancun: 1.8, cbd: 1.8, olympic: 1.3 } },
        demand: { decayHW: 1.15 }, corridors: [{ a: 'huitian', b: 'zhongguancun', f: 1.4 }, { a: 'wangjing', b: 'cbd', f: 1.3 }],
        goals: [{ id: 'bj-g1', from: 2001, type: 'connect', months: 60, reward: 60000, title: '回天通勤走廊', desc: '把回龙观、天通苑与中关村连起来，分担北部居住区的通勤。', anchors: [anchor('回龙观', 40.070, 116.330, 5), anchor('天通苑', 40.073, 116.413, 5), anchor('中关村', 39.983, 116.310, 4)] }] },
      { id: 'bj-e3', from: 2008, name: '多中心通勤', tag: '史实参考',
        summary: '史实：2008 年北京奥运会举办、新北京南站投入运营。估算：国贸、中关村、望京和亦庄吸引就业，轨道网络需要兼顾长距离通勤与铁路换乘。',
        grow: { pop: { tongzhou: 1.6, yizhuang: 1.4, huitian: 1.3 }, jobs: { cbd: 1.6, wangjing: 1.6, yizhuang: 1.7 } },
        demand: { decayHW: 1.2, hub: 1.15 }, corridors: [{ a: 'tongzhou', b: 'cbd', f: 1.4 }, { a: 'fengtai', b: 'yizhuang', f: 1.2 }],
        goals: [{ id: 'bj-g2', type: 'connect', months: 60, reward: 60000, title: '亦庄产业通勤', desc: '连接北京南站、宋家庄与亦庄，服务东南部产业区。', anchors: [anchor('北京南站', 39.865, 116.379, 4), anchor('宋家庄', 39.845, 116.422, 4), anchor('亦庄', 39.800, 116.493, 5)] }] },
      { id: 'bj-e4', from: 2019, name: '双机场时代', tag: '史实参考',
        summary: '史实：2019 年 9 月大兴国际机场投运。玩法：大兴机场在地图南边界外，以接驳口产生客流；首都机场位于地图内，两座机场均需接入城区。',
        grow: { pop: { tongzhou: 1.3, yizhuang: 1.2 }, jobs: { tongzhou: 1.5, yizhuang: 1.4, wangjing: 1.3 } },
        demand: { hub: 1.2 }, corridors: [{ a: 'tongzhou', b: 'cbd', f: 1.3 }] },
      { id: 'bj-e5', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '2021 年之后的人口、就业、经济和交通按游戏模型推演，不代表北京实际发展。',
        grow: { pop: { tongzhou: 1.2, yizhuang: 1.2, oldwest: 0.7, oldeast: 0.7 }, jobs: { zhongguancun: 1.3, wangjing: 1.2, yizhuang: 1.3 } }, demand: { decayHW: 1.2 } },
    ],
    briefing: {
      lead: '从 1990 年开始，重新画出你自己的北京地铁。先串起西单、王府井、北京站与国贸，再延伸到中关村、回龙观、通州和亦庄。本场景从空白路网开局；现实中当时北京已拥有地铁。',
      modes: [['metro', '自定义空白路网', '既有的北京地铁不预建，后续线路也不会自动出现。经营挑战与自由建造都由你规划。'], ['bus', '环路与放射路', '现代 OpenStreetMap 道路作为地理底图，路网开放按游戏年代近似处理；不是 1990 年道路档案复原。'], ['tree', '古都与水系', '故宫、天坛、颐和园与湖泊占用土地，线路要照顾景区与周边居民。'], ['rail', '铁路与机场', '北京西站、新北京南站与奥运设施按年份出现；首都机场位于图内，大兴机场在南边界外接驳。']],
    },
    airport: { name: '首都国际机场', closeYear: 9999, buildable: 'underground', runway: [ll(40.096, 116.584), ll(40.058, 116.588)] },
    runways: [{ a: ll(40.096, 116.602), b: ll(40.061, 116.606), from: 1990 }, { a: ll(40.079, 116.617), b: ll(40.044, 116.621), from: 2008 }],
    regions: [
      { id: 'airport', name: '首都国际机场', poly: box(40.033, 116.575, 40.107, 116.632), open: 1990, plan: 'res', note: '机场用地保留，只允许地下建设' },
      { id: 'summerpalace', name: '颐和园', geo: { park: '颐和园' }, poly: box(39.981, 116.258, 40.006, 116.284), open: 1990, plan: 'res', park: true },
      { id: 'xishan', name: '西山风景区', poly: [[0, 0], ll(40.07, 116.23), ll(39.98, 116.22), ll(39.935, 116.16), [0, 95]], open: 1990, plan: 'res', scenic: true },
      { id: 'forbidden', name: '故宫与景山', poly: box(39.912, 116.384, 39.929, 116.402), open: 1990, plan: 'res', park: true },
      { id: 'temple', name: '天坛公园', poly: box(39.871, 116.398, 39.891, 116.418), open: 1990, plan: 'res', park: true },
      { id: 'olympic', name: '奥林匹克公园', poly: box(39.979, 116.377, 40.026, 116.407), open: 2001, plan: 'mix', note: '开放年份是迎奥运建设的游戏阶段' },
      { id: 'zhongguancun', name: '中关村与高校区', poly: box(39.968, 116.285, 40.025, 116.355), open: 1990, plan: 'mix' },
      { id: 'cbd', name: '国贸与朝阳商务区', poly: box(39.889, 116.432, 39.943, 116.490), open: 1990, plan: 'cbd' },
      { id: 'wangjing', name: '望京与酒仙桥', poly: box(39.963, 116.450, 40.019, 116.523), open: 1995, plan: 'mix' },
      { id: 'huitian', name: '回龙观与天通苑', poly: box(40.035, 116.290, 40.115, 116.450), open: 1999, plan: 'res' },
      { id: 'tongzhou', name: '通州与北运河', poly: box(39.825, 116.600, 39.955, 116.680), open: 2000, plan: 'res' },
      { id: 'yizhuang', name: '亦庄开发区', poly: box(39.765, 116.460, 39.835, 116.570), open: 1994, plan: 'ind' },
      { id: 'oldwest', name: '西城与西单', poly: box(39.878, 116.340, 39.955, 116.391), open: 1990, plan: 'oldmix' },
      { id: 'oldeast', name: '东城与王府井', poly: box(39.878, 116.391, 39.955, 116.440), open: 1990, plan: 'oldmix' },
      { id: 'haidian', name: '海淀与西直门', poly: box(39.935, 116.230, 40.040, 116.377), open: 1990, plan: 'mix' },
      { id: 'shijingshan', name: '石景山与五棵松', poly: box(39.890, 116.140, 39.950, 116.310), open: 1990, plan: 'resind' },
      { id: 'fengtai', name: '丰台与南城', poly: box(39.790, 116.230, 39.905, 116.460), open: 1990, plan: 'resind' },
      { id: 'chaoyang', name: '朝阳外围', poly: box(39.840, 116.420, 40.045, 116.600), open: 1993, plan: 'res' },
    ],
    defaultRegion: { id: 'outer', name: '近郊发展区', open: 2005, plan: 'res' },
    plans: CM.DATA.plans,
    centers: [
      at(39.914, 116.367, { pop: 35000, jobs: 60000, r: 2.1 }),
      at(39.915, 116.410, { pop: 40000, jobs: 60000, r: 1.7 }),
      at(39.938, 116.406, { pop: 40000, jobs: 25000, r: 1.7 }),
      at(39.891, 116.365, { pop: 45000, jobs: 25000, r: 1.7 }),
      at(39.908, 116.455, { pop: 20000, jobs: 45000, r: 1.7 }),
      at(39.983, 116.310, { pop: 17000, jobs: 25000, r: 2.0 }),
      at(39.943, 116.350, { pop: 30000, jobs: 28000, r: 1.8 }),
      at(39.907, 116.277, { pop: 22000, jobs: 18000, r: 2.0 }),
      at(39.906, 116.210, { pop: 18000, jobs: 20000, r: 1.7 }),
      at(39.859, 116.285, { pop: 20000, jobs: 18000, r: 2.0 }),
      at(39.868, 116.405, { pop: 25000, jobs: 18000, r: 1.6 }),
      at(39.980, 116.410, { pop: 18000, jobs: 15000, r: 1.7 }),
      at(39.905, 116.650, { pop: 7000, jobs: 5000, r: 1.3 }),
      at(39.990, 116.470, { pop: 3000, jobs: 2000, r: 1.5 }),
    ],
    rural: { pop: 550, jobs: 120 },
    // 道路底图为现代数据，未指定道路由片区开放年份近似确定。
    roadYears: { '长安街': 1990, '复兴路': 1990, '建国路': 1990, '二环': 1990, '三环': 1990 },
    bridgeYears: {}, bridgeDefaultYear: 1990, simRoads: [],
    landmarks: [
      at(39.915, 116.391, { id: 'bj_palace', name: '故宫', w: 750, d: 960, year: 1420, kind: 'traditional' }),
      at(39.881, 116.400, { id: 'bj_temple', name: '天坛祈年殿', w: 180, d: 180, year: 1420, kind: 'temple' }),
      at(39.994, 116.268, { id: 'bj_summer', name: '颐和园佛香阁', w: 160, d: 180, year: 1894, kind: 'pagoda', h: 41 }),
      at(39.948, 116.417, { id: 'bj_lama', name: '雍和宫', w: 150, d: 350, year: 1744, kind: 'temple' }),
      at(39.940, 116.390, { id: 'bj_drum', name: '鼓楼', w: 60, d: 45, year: 1420, kind: 'traditional' }),
      at(39.990, 116.306, { id: 'bj_pku', name: '北京大学', w: 850, d: 750, year: 1952, kind: 'campus' }),
      at(40.003, 116.321, { id: 'bj_tsinghua', name: '清华大学', w: 900, d: 1000, year: 1911, kind: 'campus' }),
      at(39.900, 116.427, { id: 'bj_station', name: '北京站', w: 350, d: 130, year: 1959, kind: 'rail' }),
      at(39.895, 116.321, { id: 'bj_west', name: '北京西站', w: 450, d: 180, year: 1996, kind: 'rail' }),
      at(39.865, 116.379, { id: 'bj_south', name: '北京南站', w: 450, d: 350, year: 2008, kind: 'rail' }),
      at(39.9928, 116.390, { id: 'bj_nest', name: '国家体育场（鸟巢）', w: 330, d: 290, year: 2008, kind: 'stadium' }),
      at(39.991, 116.383, { id: 'bj_cube', name: '国家游泳中心（水立方）', w: 180, d: 180, year: 2008, kind: 'expo' }),
      at(39.918, 116.300, { id: 'bj_tower', name: '中央广播电视塔', w: 100, d: 100, year: 1992, kind: 'tvtower', h: 405 }),
    ],
    facilities: [
      { id: 'bj_station', n: '北京站', t: 'rail', lm: 'bj_station', pax: [[1990, 2.2], [2000, 2.8], [2019, 3.0]] },
      { id: 'bj_west', n: '北京西站', t: 'rail', lm: 'bj_west', y0: [1996, 1], pax: [[1996, 2.5], [2010, 4.5], [2019, 5.0]] },
      { id: 'bj_south', n: '北京南站', t: 'rail', lm: 'bj_south', y0: [2008, 8], pax: [[2008.58, 2.0], [2015, 4.0], [2019, 5.0]] },
      { id: 'bj_capital', n: '首都国际机场', t: 'air', at: ll(40.079, 116.592), r: 1.8, pax: [[1990, 0.6], [2000, 2.0], [2008, 5.0], [2019, 9.0], [2030, 8.0]] },
      { id: 'bj_capital_t3', n: '首都机场 T3', t: 'air', at: ll(40.052, 116.615), y0: [2008, 3], r: 1.8, pax: [[2008.17, 1.5], [2019, 3.0], [2030, 3.5]] },
      { id: 'bj_daxing', n: '大兴国际机场', t: 'air', at: ll(39.775, 116.410), ext: ['S', 28], y0: [2019, 9], pax: [[2019.67, 1.0], [2025, 4.0], [2035, 6.0]], note: '地图南边界外约 28 km；接通边界接驳口即可服务。客流为游戏估算。' },
      { id: 'bj_pku', n: '北京大学', t: 'uni', lm: 'bj_pku', w: 0.045 },
      { id: 'bj_tsinghua', n: '清华大学', t: 'uni', lm: 'bj_tsinghua', w: 0.045 },
      { id: 'bj_ruc', n: '中国人民大学', t: 'uni', at: ll(39.970, 116.310), w: 0.03 },
      { id: 'bj_bnu', n: '北京师范大学', t: 'uni', at: ll(39.961, 116.360), w: 0.03 },
      { id: 'bj_union', n: '北京协和医院', t: 'hosp', at: ll(39.911, 116.411), w: 0.06 },
      { id: 'bj_tongren', n: '北京同仁医院', t: 'hosp', at: ll(39.901, 116.411), w: 0.05 },
      { id: 'bj_301', n: '解放军总医院', t: 'hosp', at: ll(39.901, 116.272), w: 0.05 },
      { id: 'bj_xidan', n: '西单商圈', t: 'shop', at: ll(39.914, 116.367), w: 0.08 },
      { id: 'bj_wangfujing', n: '王府井商圈', t: 'shop', at: ll(39.915, 116.410), w: 0.08 },
      { id: 'bj_guomao', n: '国贸商务区', t: 'cbd', at: ll(39.908, 116.455), w: [[1990, 0.03], [2008, 0.08]] },
      { id: 'bj_zgc', n: '中关村', t: 'cbd', at: ll(39.983, 116.310), w: [[1990, 0.025], [2000, 0.06]] },
      { id: 'bj_palace', n: '故宫', t: 'scenic', lm: 'bj_palace', w: 0.06 },
      { id: 'bj_temple', n: '天坛', t: 'scenic', lm: 'bj_temple', w: 0.025 },
      { id: 'bj_summer', n: '颐和园', t: 'scenic', lm: 'bj_summer', w: 0.04 },
      { id: 'bj_beihai', n: '北海公园', t: 'park', at: ll(39.929, 116.383), w: 0.02 },
      { id: 'bj_chaoyangpark', n: '朝阳公园', t: 'park', at: ll(39.949, 116.475), w: 0.02 },
      { id: 'bj_nest', n: '国家体育场（鸟巢）', t: 'stadium', lm: 'bj_nest', y0: [2008, 8], w: 0.025 },
      { id: 'bj_cube', n: '国家游泳中心（水立方）', t: 'stadium', lm: 'bj_cube', y0: [2008, 8], w: 0.015 },
      { id: 'bj_olympics', n: '2008 年北京奥运会', t: 'venue', at: ll(39.993, 116.390), r: 3, y0: [2008, 8], y1: [2008, 9], w: 0.16 },
    ],
    districtLabels: [],
    events: [
      { y: 1990, m: 1, tag: '场景', title: '重新规划北京', desc: '现实中北京已有地铁。本局以空白路网开始，地形来自现代地图，区域开放与经济参数为游戏估算。' },
      { y: 1996, m: 1, tag: '史实', title: '北京西站启用', desc: '北京西站投入运营，为城市西部带来铁路接驳需求。' },
      { y: 1999, m: 6, tag: '史实', title: '中关村科技园区获批', desc: '中关村科技园区进入新的发展阶段。', fx: { grow: { region: 'zhongguancun', jobs: 1.4, years: 6 } } },
      { y: 2008, m: 8, tag: '史实', title: '北京奥运会与新北京南站', desc: '奥运场馆、首都机场和铁路枢纽带来集中的接驳需求。', fx: { demand: { lz: 1.25, hub: 1.2, months: 1 }, sat: { v: 2, months: 3 } } },
      { y: 2019, m: 9, tag: '史实', title: '大兴国际机场投运', desc: '南边界外的大兴机场接驳口开始产生客流，连接它与城区。' },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后的城市变化按游戏模型推演。' },
    ],
    histTasks: [
      { id: 'bj1', appear: [1990, 3], deadline: [1996, 12], type: 'connect', reward: 250000, title: '长安街东西骨干', desc: '连接西单、王府井与国贸，为中心城建立东西向骨干。', anchors: [anchor('西单', 39.908, 116.367), anchor('王府井', 39.908, 116.410), anchor('国贸', 39.908, 116.455)] },
      { id: 'bj2', appear: [1993, 1], deadline: [2000, 12], type: 'connect', reward: 220000, title: '北京站与北京西站', desc: '连接两座铁路枢纽，为跨城旅客提供市内换乘。', anchors: [anchor('北京站', 39.900, 116.427, 4), anchor('北京西站', 39.895, 116.321, 4)] },
      { id: 'bj3', appear: [1999, 1], deadline: [2006, 12], type: 'connect', reward: 230000, title: '中关村科教走廊', desc: '连接西直门、中关村与清华大学。', anchors: [anchor('西直门', 39.941, 116.349), anchor('中关村', 39.983, 116.310, 4), anchor('清华大学', 40.003, 116.321, 4)] },
      { id: 'bj4', appear: [2001, 7], deadline: [2008, 7], type: 'connect', reward: 300000, title: '迎接北京奥运会', desc: '奥运会前连接东直门、奥林匹克公园与首都机场。', anchors: [anchor('东直门', 39.941, 116.428, 4), anchor('奥林匹克公园', 39.996, 116.390, 5), anchor('首都机场', 40.079, 116.592, 5)] },
      { id: 'bj5', appear: [2008, 1], deadline: [2013, 12], type: 'connect', reward: 220000, title: '南站高铁接驳', desc: '把北京南站、西单与北京站接入同一个网络。', anchors: [anchor('北京南站', 39.865, 116.379, 4), anchor('西单', 39.908, 116.367), anchor('北京站', 39.900, 116.427, 4)] },
      { id: 'bj6', appear: [2010, 1], deadline: [2018, 12], type: 'connect', reward: 250000, title: '向东连接通州', desc: '连接国贸、四惠与通州，服务东部通勤。', anchors: [anchor('国贸', 39.908, 116.455), anchor('四惠', 39.908, 116.493, 4), anchor('通州', 39.905, 116.650, 5)] },
      { id: 'bj7', appear: [2019, 9], deadline: [2026, 12], type: 'connect', reward: 280000, title: '大兴机场方向', desc: '从北京南站延伸到地图南边界的大兴机场接驳口。', anchors: [anchor('北京南站', 39.865, 116.379, 4), { name: '大兴机场接驳口', x: ll(39.775, 116.410)[0], y: 163.9, r: 3 }] },
    ],
    dynTasks: [],
    taskNote: '北京本地任务参考城市发展与接驳需求；本局自定义空白路网，不要求复刻真实线路。',
    dataNote: [
      ['真实地理', 'hist', '道路、铁路、水面、河渠、公园与地名来自现代 OpenStreetMap（© OpenStreetMap 贡献者，ODbL 1.0），统一使用 WGS-84 投影，每格 250 m。'],
      ['史实参考', 'hist', '北京西站 1996 年启用、中关村科技园区 1999 年获批、2008 年北京奥运会与新北京南站、2019 年大兴机场投运。'],
      ['估算', 'est', '规划片区为近似多边形，不是行政边界；人口、就业、片区与道路开放年份、机场客流、票价、造价、财政及经济参数均为游戏估算。地标使用游戏通用建筑模型。'],
      ['模拟', 'sim', '1990 年北京现实中已拥有地铁，本场景从空白路网开始。2021 年之后按模型推演，地图范围不覆盖北京市全域；大兴机场通过南边界接驳。'],
    ],
    lineColorsNice: ['#a4343a', '#004b87', '#d45328', '#008c95', '#a05eb5', '#b58500', '#ffc56e', '#009b77', '#97d700', '#0092bc', '#d986ba', '#a8b400', '#f4da40', '#ca9a8e', '#653279', '#2b774a'],
    places: (G.places || []).map(function (p) { return p.slice(); }),
  };
  // 同名轨道站点以 OSM 位置校正，避免手填锚点落在相邻湖泊或隔离地块。
  // 站名只用于定位与自动命名，不会预建真实地铁线路。
  const stops = new Map((G.places || []).filter(function (p) { return p[3] === 0; }).map(function (p) { return [p[0], p]; }));
  for (const t of data.histTasks.concat(data.eras.reduce(function (out, e) { return out.concat(e.goals || []); }, []))) {
    for (const a of t.anchors || []) {
      const p = stops.get(a.name);
      if (p && Math.hypot(p[1] - a.x, p[2] - a.y) < 12) { a.x = p[1]; a.y = p[2]; }
    }
  }
  const railNames = { bj_station: '北京', bj_west: '北京西', bj_south: '北京南' };
  for (const lm of data.landmarks) if (railNames[lm.id]) {
    const p = (G.places || []).find(function (p) { return p[3] === 1 && p[0] === railNames[lm.id]; });
    if (p) { lm.x = p[1]; lm.y = p[2]; }
  }
  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'bj', name: '北京', title: '北京 · 1990', sub: '真实地理 · 自定义空白路网 · 人民币',
    desc: '从长安街与老城出发，规划通往中关村、奥林匹克公园、通州、亦庄与两座机场的轨道交通。1990 年起，自定义空白路网。',
    facts: [['范围', '48 km × 41 km'], ['起始', '1990 年'], ['人口', '约 650 万（范围内估算）'], ['货币', '人民币（元）'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 1, scenario: 'bj-1990',
    region: '中国内地', tagline: '从长安街到双机场，画出你的北京', difficulty: 3, tags: ['空白路网', '环路放射', '双机场'],
    intro: '古都的湖泊、宫苑和环路间，西单与王府井拥挤繁忙，中关村与国贸正在成长。你可以重新规划北京的第一条线路，再迎接奥运会、铁路枢纽与双机场时代。现实中 1990 年北京已拥有地铁；本图采用自定义空白路网。',
    features: [['map', '老城与环路', '真实道路水系与近似规划片区，兼顾古都和外围通勤'], ['building', '科教与商务中心', '连接中关村、国贸、望京、通州和亦庄'], ['plane', '双机场接驳', '首都机场在图内，大兴机场 2019 年开启边界接驳'], ['flag', '7 项城市任务', '东西骨干、科教走廊、奥运接驳与铁路枢纽']],
    highlights: [[1990, '自定义空白路网开局'], [1996, '北京西站启用'], [1999, '中关村科技园区获批'], [2008, '奥运会与新北京南站'], [2019, '大兴国际机场投运']],
    geo: G, data: data, econ: { devOffset: 0, money: 1 },
    cfg: {
      W: 192, H: 164, START: { y: 1990, m: 1, d: 1, minute: 360 },
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[1990, 6.5e6], [1995, 7.2e6], [2000, 8.5e6], [2005, 10.5e6], [2010, 12.5e6], [2015, 14e6], [2020, 14.5e6], [2030, 15e6], [2050, 15.5e6], [2300, 16e6]], histEnd: 2020, jobsRatio: [[1990, 0.52], [2000, 0.54], [2010, 0.57], [2020, 0.59]] }),
      money: { code: 'CNY', unit: '元', wan: '万元', yi: '亿元', sym: '¥' }, econBase: 1990,
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 500000, grantBase: [[1990, 24000], [1995, 40000], [2000, 65000], [2005, 130000], [2010, 180000], [2020, 240000], [2050, 320000]], debtLimit: -300000, rewardScale: 1.5 }),
      macro: { area: '地图范围（中心城区与部分近郊，估算）', region: '中国内地', gdp0: 4000000, revRatio: [[1990, 0.2], [1994, 0.15], [2010, 0.19], [2020, 0.2]], revElastic: 1.4,
        prod: [[1990, 0.04], [1993, 0.09], [2000, 0.08], [2008, 0.07], [2015, 0.05], [2025, 0.03], [2050, 0.015], [2080, 0.012]], infl: 'cn', longRun: { infl: 0.02 }, histEnd: 2020, ref: 'cn',
        struct: { trade: 0.5, fin: 0.7, ind: 0.45, tour: 0.7, prop: 0.6 }, events: [] },
    },
    cam: { cx: ll(39.928, 116.395)[0], cy: ll(39.928, 116.395)[1], zoom: 16 },
  });
})(window.CM);
