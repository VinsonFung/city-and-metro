'use strict';
// 新加坡 · 1980 场景。地理来自 OpenStreetMap（geo_sg.js，现代数据），本文件补充 1980 年起的历史海岸线（填海）、片区开放、道路通车年份、
// 人口就业中心、地标、历史事件、本地任务与新加坡元经营参数。坐标单位为格（250 m），用 ll(纬度, 经度) 换算。
// 真实性：填海工程的年代、机场、关卡、新镇与规划文件、地标落成年份为史实参考；填海范围和裕廊岛原有小岛为对照现代海岸画出的近似范围；
// 1980 年人口与就业分布、增长曲线、造价与票价为估算。境内暂不开放的用地按年份开放（v2.9），开放前不写用途、没有人口岗位和出行，内部道路与地名已剔除。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.sg; if (!G) return;
  const P = G.proj, ll = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const poly = function (pts) { return pts.map(function (p) { return ll(p[0], p[1]); }); };
  const at = function (lat, lon, o) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const anchor = function (name, lat, lon, r) { const p = ll(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };
  // 裕廊岛成岛前的小岛（位置与大小为近似）：在填海范围里留成开局就有的陆地
  const islet = function (lat, lon, a, b) { return poly([[lat + a, lon], [lat + a * 0.5, lon + b], [lat - a * 0.5, lon + b], [lat - a, lon], [lat - a * 0.5, lon - b], [lat + a * 0.5, lon - b]]); };

  // 填海分期（范围为近似，按大体成陆的年份）。多边形可以伸到海里，只有现代为陆地的部分才算
  const reclaim = [
    { id: 'tanahmerah', name: '丹那美拉海岸', year: 1985, minor: true, sea: '新加坡海峡', desc: '', poly: poly([[1.3180, 103.9450], [1.3300, 103.9760], [1.3140, 103.9880], [1.3000, 103.9880], [1.3000, 103.9450]]) },
    { id: 'marinas', name: '滨海南', year: 1985, big: true, sea: '新加坡海峡', desc: '市中心南面的海面成为陆地，后来的滨海湾金融区、滨海湾金沙和滨海湾花园都在这片土地上。', poly: poly([[1.2838, 103.8540], [1.2895, 103.8625], [1.2870, 103.8700], [1.2810, 103.8790], [1.2660, 103.8650], [1.2620, 103.8480], [1.2700, 103.8480], [1.2745, 103.8490], [1.2780, 103.8505], [1.2815, 103.8525]]) },
    { id: 'tuas1', name: '大士一期', year: 1988, dev: false, sea: '柔佛海峡', desc: '大士海岸向外推进，新的工业用地从这里开始。', poly: poly([[1.3510, 103.6286], [1.3200, 103.6400], [1.3060, 103.6550], [1.2980, 103.6550], [1.2980, 103.6150], [1.3250, 103.6100]]) },
    { id: 'marinae', name: '滨海东', year: 1992, sea: '新加坡海峡', desc: '滨海湾东侧的填海完成，新加坡河与加冷河的出海口被围成今天的滨海湾。', poly: poly([[1.2870, 103.8700], [1.2895, 103.8625], [1.2995, 103.8650], [1.3000, 103.8800], [1.2920, 103.8890], [1.2810, 103.8790]]) },
    { id: 'changi1', name: '樟宜东部', year: 1993, dev: false, sea: '新加坡海峡', desc: '樟宜机场跑道东侧继续填海，为后来的扩建预留用地。', poly: poly([[1.3140, 103.9880], [1.3140, 104.0020], [1.3562, 104.0201], [1.3760, 104.0120], [1.3760, 104.0080], [1.3619, 104.0070], [1.3288, 103.9930]]) },
    { id: 'jie', name: '裕廊岛东部', year: 1996, dev: false, big: true, sea: '新加坡海峡', desc: '1995 年起，亚逸查湾、美里茂、亚逸美宝和实拉雅几座小岛之间的海面被填平，开始连成一座岛。', poly: poly([[1.2965, 103.7000], [1.2965, 103.7250], [1.2800, 103.7450], [1.2580, 103.7450], [1.2580, 103.7000]]), holes: [islet(1.2830, 103.7170, 0.0045, 0.0065), islet(1.2790, 103.7020, 0.0045, 0.0055), islet(1.2700, 103.7130, 0.0035, 0.0070), islet(1.2740, 103.7320, 0.0055, 0.0060)] },
    { id: 'tuas2', name: '大士南', year: 1996, dev: false, sea: '新加坡海峡', desc: '大士继续向南填海，炼油、化工和重工业迁到更远的海边。', poly: poly([[1.2980, 103.6100], [1.2980, 103.6550], [1.2720, 103.6550], [1.2720, 103.6000]]) },
    { id: 'ppt1', name: '巴西班让码头东段', year: 1996, dev: false, minor: true, sea: '新加坡海峡', desc: '', poly: poly([[1.2890, 103.7720], [1.2750, 103.7950], [1.2600, 103.7950], [1.2600, 103.7720]]) },
    { id: 'jic', name: '裕廊岛中部', year: 2000, dev: false, big: true, sea: '新加坡海峡', desc: '佩塞克和沙基拉一带填平，裕廊岛 2000 年 10 月正式开放，长堤把它和主岛连了起来。', poly: poly([[1.2880, 103.6735], [1.2965, 103.7000], [1.2480, 103.7000], [1.2480, 103.6880], [1.2650, 103.6735]]), holes: [islet(1.2790, 103.6895, 0.0040, 0.0050), islet(1.2860, 103.6860, 0.0025, 0.0030), islet(1.2560, 103.6985, 0.0035, 0.0060)] },
    { id: 'sentosac', name: '升涛湾', year: 2004, sea: '新加坡海峡', desc: '圣淘沙东端填海建成的滨水住宅区。', poly: poly([[1.2540, 103.8320], [1.2540, 103.8470], [1.2380, 103.8470], [1.2380, 103.8320]]) },
    { id: 'changi2', name: '樟宜东扩', year: 2004, dev: false, sea: '新加坡海峡', desc: '樟宜海岸再向东推进，后来规划的第五航站楼和第三条跑道都在这里。', poly: poly([[1.3080, 104.0020], [1.3080, 104.0700], [1.3760, 104.0700], [1.3760, 104.0120], [1.3562, 104.0201], [1.3140, 104.0020]]) },
    { id: 'jiw', name: '裕廊岛西部', year: 2005, dev: false, sea: '新加坡海峡', desc: '裕廊岛继续向西扩展，石化企业沿岛成片布局。', poly: poly([[1.2745, 103.6490], [1.2800, 103.6600], [1.2880, 103.6735], [1.2650, 103.6735], [1.2480, 103.6880], [1.2400, 103.6880], [1.2400, 103.6650], [1.2640, 103.6490]]) },
    { id: 'tuas3', name: '大士景观', year: 2006, dev: false, sea: '新加坡海峡', desc: '大士继续向南填海，海边的重工业用地不断增加。', poly: poly([[1.2720, 103.5950], [1.2720, 103.6550], [1.2450, 103.6550], [1.2450, 103.5950]]) },
    { id: 'ppt2', name: '巴西班让码头西段', year: 2008, dev: false, minor: true, sea: '新加坡海峡', desc: '', poly: poly([[1.2880, 103.7440], [1.2890, 103.7720], [1.2600, 103.7720], [1.2600, 103.7440]]) },
    { id: 'jis', name: '裕廊岛南部', year: 2009, dev: false, big: true, sea: '新加坡海峡', desc: '七座小岛合并而成的裕廊岛大体完工，面积约 30 平方公里，比原定计划提前约二十年。', poly: poly([[1.2400, 103.6490], [1.2400, 103.6950], [1.2150, 103.6950], [1.2150, 103.6490]]) },
    { id: 'tuasport', name: '大士港', year: 2021, dev: false, big: true, sea: '新加坡海峡', desc: '大士港第一期的填海和码头投入使用，全国的集装箱码头将陆续集中到这里。', poly: poly([[1.2450, 103.5950], [1.2450, 103.6600], [1.2140, 103.6600], [1.2140, 103.5950]]) },
  ];

  const data = {
    // 城市特色（traits.js，规则见《地图设计与城市特色机制.md》）。新条目加在末尾，已触发事件按序号记录
    traits: [
      { use: 'portal', star: true, icon: 'bridge', label: '跨境通勤', text: '每天有大批柔佛居民经兀兰和大士过境上班，修到接驳口才能把他们接上地铁', why: '新柔长堤 1924 年通车，大士第二通道 1998 年启用；两处关卡是世界上最繁忙的陆路口岸之一，大量住在柔佛的人每天到新加坡上班。' },
      { use: 'reclaim', star: true, icon: 'wave', label: '向海要地', text: '滨海南、裕廊岛、大士和樟宜按年份由海变陆，1980 年的裕廊岛还是几座小岛', why: '新加坡的国土面积因填海增加了约四分之一：滨海南和滨海东 1970 至 1990 年代成陆，七座小岛 1995 至 2009 年合并成裕廊岛，大士一路向南推进到今天的大士港。' },
      { use: 'relocate', star: true, icon: 'building', label: '组屋新镇与区域中心', text: '人口从老城搬进新镇，岗位从市中心向淡滨尼、兀兰和裕廊东分散，通勤方向随年代变化', why: '建屋发展局自 1960 年代起建设新镇，大巴窑、宏茂桥、勿洛较早成形；1991 年概念规划提出在淡滨尼、兀兰、裕廊东和实里达设区域中心，把岗位带到靠近住家的地方。' },
      { use: 'foresight', level: 'mid', label: '滨海湾提前布局', id: 'sg-marina', at: 'sg_mbs', ym: [2005, 4], before: 2005, r: 7, region: 'marina_bay', title: '政府决定兴建综合度假村',
        hit: '政府决定在滨海湾兴建综合度假村，早已通车的{st}站让这片新金融区一开始就有了地铁。', miss: '政府决定在滨海湾兴建综合度假村，这片新土地还没有地铁，要尽快补上。',
        why: '2005 年 4 月新加坡政府宣布兴建两座综合度假村，滨海湾随后成为新的金融和旅游中心。' },
      { use: 'foresight', level: 'light', label: '榜鹅 21 提前布局', id: 'sg-punggol', pos: ll(1.4053, 103.9023), ym: [1996, 8], before: 1996, r: 7, region: 'punggol', title: '榜鹅 21 计划公布',
        hit: '榜鹅 21 计划公布，早已通车的{st}站让这座海滨新镇从一开始就接上了地铁。', miss: '榜鹅 21 计划公布，这一带还是农场和甘榜，地铁要跟上新镇的建设。',
        why: '1996 年 8 月国庆群众大会上，时任总理吴作栋宣布榜鹅 21 计划，要把榜鹅建成新一代海滨新镇。' },
      { use: 'foresight', level: 'mid', label: '裕廊湖区提前布局', id: 'sg-jld', pos: ll(1.3331, 103.7423), ym: [2008, 12], before: 2008, r: 7, region: 'jurong_e', title: '裕廊湖区总体规划',
        hit: '裕廊湖区成为第二中央商务区，早已通车的{st}站让这里抢先聚起了写字楼和商场。', miss: '裕廊湖区成为第二中央商务区，这一带的地铁还不够用。',
        why: '2008 年总体规划提出把裕廊湖区发展为市中心以外最大的商务区。' },
      { use: 'newDistrict', label: '盛港与榜鹅新镇', why: '1990 年代末起，东北部的盛港和榜鹅成片建成，是最晚开发的一批大型新镇。' },
      { use: 'transition', level: 'light', label: '新加坡河整治', region: 'riverside', close: { y: 1983, m: 9, title: '驳船迁离新加坡河', desc: '新加坡河的驳船全部迁到巴西班让，河岸的货仓开始闲置。' }, renew: { y: 1993, m: 1, title: '克拉码头重新开放', desc: '整治后的河岸货仓改建成餐饮和娱乐街区，驳船码头和克拉码头重新热闹起来。' }, replan: [{ year: 1993, region: 'riverside', plan: 'mix' }], why: '1977 至 1987 年新加坡河完成整治，驳船 1983 年迁走；1990 年代河岸的旧货仓陆续改建。' },
      { use: 'transition', level: 'light', label: '南部海港搬迁', region: 'keppel', close: { y: 2027, m: 1, tag: '模拟', title: '模拟：市区码头迁往大士', desc: '丹戎巴葛、吉宝和布拉尼的码头租约到期，港务陆续迁往大士。这里按公开规划模拟。' }, renew: { y: 2032, m: 1, tag: '模拟', title: '模拟：大南部滨水区开发', desc: '腾空的码头用地开始改建成住宅、办公和休闲区。这里按公开规划模拟。' }, replan: [{ year: 2032, region: 'keppel', plan: 'mix' }], why: '2013 年政府宣布把全部集装箱码头集中到大士，腾出的南部海滨称为大南部滨水区；市区码头的租约 2027 年到期。' },
      { use: 'carLimit', level: 'mid', label: '拥车证', on: { y: 1990, m: 5, title: '实行拥车证制度', desc: '买车先要投标取得拥车证，车辆总数开始受配额控制。' }, why: '新加坡自 1990 年 5 月起实行车辆配额制度，拥车证通过投标取得。' },
      { use: 'carLimit', level: 'light', label: '电子道路收费', on: { y: 1998, m: 4, title: '电子道路收费启用', desc: '进入市中心和主要快速路按时段自动收费，取代 1975 年起的区域通行证。' }, why: '1998 年 4 月电子道路收费系统启用，取代 1975 年起实行的区域通行证计划。' },
      { use: 'investWindow', level: 'mid', label: '地铁工程上马', on: { y: 1982, m: 5, title: '政府批准兴建地铁', desc: '经过两年多“全巴士还是地铁”的大辩论，政府决定兴建地铁系统，首期约 50 亿新元、67 公里。' }, years: 8, why: '1982 年 5 月政府决定兴建地铁，第一期工程约 50 亿新元，1990 年全部完成。' },
      { use: 'investWindow', level: 'light', label: '陆路交通总蓝图', on: { y: 2008, m: 2, title: '公布陆路交通总蓝图', desc: '政府宣布到 2020 年把铁路网扩大约一倍，此后多年持续投入。' }, years: 12, why: '2008 年陆路交通总蓝图提出把铁路网从约 138 公里扩大到约 278 公里。' },
      { use: 'accident', level: 'mid', label: '尼诰大道塌陷', on: { y: 2004, m: 4, title: '尼诰大道塌陷事故', desc: '环线工地的隧道支撑结构失效，尼诰大道一段路面塌陷，造成 4 人死亡，地下工程规范随之收紧。' }, why: '2004 年 4 月 20 日环线工程发生尼诰大道塌陷事故，造成 4 人死亡，线路被迫改道。' },
      { use: 'scenic', label: '集水区与乌敏岛', why: '中央集水区和武吉知马保存着新加坡仅存的大片原生雨林，地铁只能从地下穿过；乌敏岛保留了甘榜风貌和仄爪哇湿地，2001 年政府因保育呼声暂缓了那里的填海。' },
      { use: 'guard', level: 'light', label: '古迹保护', guards: ['sg_raffles', 'sg_standrew', 'sg_sultan', 'sg_thk', 'sg_mariamman'], why: '莱佛士酒店、圣安德烈座堂、苏丹回教堂、天福宫和马里安曼兴都庙都是国家古迹，周围的地下施工受到严格限制。' },
      { use: 'finance', flavor: 'sg' },
    ],
    city: '新加坡', riverName: '新加坡河', seaName: '新加坡海峡', hsrYear: 2100,
    stages: [[1987, '新镇起步期'], [1996, '地铁成网期'], [2005, '区域中心期'], [2013, '滨海湾时代']], stageLast: '裕廊湖区时代',
    // 历史发展阶段（eras.js）：grow 只改变人口与岗位增长的去向（总量仍按人口曲线），relocate 为每月疏解比例，corridors 为片区间通勤与购物去向倍数
    eras: [
      { id: 'sg-e1', from: 1980, name: '新镇起步期', tag: '史实',
        summary: '史实：约三分之二的人口已住进组屋，大巴窑、宏茂桥和勿洛成形，淡滨尼刚开始动工；岗位集中在莱佛士坊、丹戎巴葛港和裕廊工业区；1982 年政府才决定修地铁。估算：新增人口流向宏茂桥、勿洛、裕廊西和淡滨尼，岗位继续集中在市中心和裕廊。',
        grow: { pop: { cbd: 0.4, rochor: 0.5, riverside: 0.5, toapayoh: 0.55, amk: 0.8, bedok: 0.8, jurong_w: 1.7, jurong_e: 0.6, tampines: 2.2, clementi: 1.1, hougang: 1.2 }, jobs: { cbd: 1.6, orchard: 1.2, marina_centre: 1.3, boonlay: 1.8, pioneer: 1.4, jurong_e: 1.2, kallang: 1.1 } },
        demand: { decayHW: 0.95 }, corridors: [{ a: 'amk', b: 'cbd', f: 1.2 }, { a: 'toapayoh', b: 'cbd', f: 1.2 }, { a: 'bedok', b: 'cbd', f: 1.2 }, { a: 'jurong_w', b: 'boonlay', f: 1.25 }],
        goals: [{ id: 'sg-g1', type: 'connect', months: 48, reward: 40000, title: '新镇接到市中心', desc: '大巴窑是最早成形的新镇之一，每天大批居民进城上班。用地铁连接大巴窑、诺维娜与多美歌。', anchors: [anchor('大巴窑', 1.3326, 103.8471, 3), anchor('诺维娜', 1.3205, 103.8439, 3), anchor('多美歌', 1.2996, 103.8456, 3)] }] },
      { id: 'sg-e2', from: 1987, name: '地铁成网期', tag: '史实',
        summary: '史实：1987 年第一段地铁通车，1990 年首期全线完工；同年实行拥车证；1991 年概念规划提出区域中心，要把岗位带到新镇附近；裕廊和大士的工业继续外扩。估算：淡滨尼、义顺和裕廊西的人口增长最快，市中心仍是最大的就业中心，但工业岗位向西集中。',
        grow: { pop: { cbd: 0.35, tampines: 2.2, yishun: 1.5, jurong_w: 1.7, jurong_e: 0.5, woodlands: 1.7, bukitbatok: 1.3, cck: 1.5, pasirris: 1.7, toapayoh: 0.45, amk: 0.55, bedok: 0.7 }, jobs: { cbd: 1.5, marina_centre: 1.4, orchard: 1.1, boonlay: 1.6, pioneer: 1.8, tuas: 4, tampines: 1.2 } },
        relocate: { pop: { rochor: 0.0003, riverside: 0.0003 } },
        demand: { sc: 1.05, decayHW: 1.05 },
        corridors: [{ a: 'tampines', b: 'cbd', f: 1.2 }, { a: 'yishun', b: 'cbd', f: 1.15 }, { a: 'jurong_w', b: 'cbd', f: 1.1 }, { a: 'cck', b: 'boonlay', f: 1.2 }],
        goals: [{ id: 'sg-g2', type: 'connect', months: 48, reward: 50000, title: '淡滨尼进城', desc: '淡滨尼的人口增长最快，也最缺地铁。用地铁连接淡滨尼、勿洛与巴耶利峇。', anchors: [anchor('淡滨尼', 1.3542, 103.9441, 3), anchor('勿洛', 1.3240, 103.9300, 3), anchor('巴耶利峇', 1.3175, 103.8927, 3)] }] },
      { id: 'sg-e3', from: 1996, name: '区域中心期', tag: '史实',
        summary: '史实：淡滨尼和兀兰的区域中心相继成形，大士第二通道 1998 年通车，裕廊岛 2000 年开放；榜鹅和盛港开始成片建设；亚洲金融危机和非典冲击了经济。估算：岗位继续向区域中心分散，东北新镇的人口快速增长，工业和石化岗位集中到大士和裕廊岛。',
        grow: { pop: { sengkang: 3.2, punggol: 3.2, woodlands: 1.5, pasirris: 1.2, bukitpanjang: 1.4, cck: 1.3, cbd: 0.3, toapayoh: 0.4, amk: 0.5, bedok: 0.6, jurong_e: 0.5, queenstown: 0.6 }, jobs: { cbd: 1.5, tampines: 1.5, woodlands: 1.4, jurong_e: 1.3, boonlay: 0.9, pioneer: 1.4, tuas: 7, jurong_island: 5, changi_v: 1.4, novena: 1.2 } },
        relocate: { jobs: { cbd: 0.0001 }, pop: { rochor: 0.0002 } },
        demand: { sh: 1.05, decayHW: 1.08, hub: 1.05 },
        corridors: [{ a: 'sengkang', b: 'cbd', f: 1.2 }, { a: 'punggol', b: 'cbd', f: 1.15 }, { a: 'woodlands', b: 'yishun', f: 1.1 }, { a: 'tampines', b: 'changi_v', f: 1.15 }],
        goals: [{ id: 'sg-g3', type: 'connect', months: 48, reward: 60000, title: '东北新镇', desc: '盛港和榜鹅的组屋陆续入住，需要直达市区的线路。用地铁连接榜鹅、盛港与实龙岗。', anchors: [anchor('榜鹅', 1.4053, 103.9023, 3), anchor('盛港', 1.3917, 103.8954, 3), anchor('实龙岗', 1.3498, 103.8727, 3)] }] },
      { id: 'sg-e4', from: 2005, name: '滨海湾时代', tag: '史实',
        summary: '史实：2005 年政府决定兴建综合度假村，滨海湾金沙和滨海湾金融中心 2010 年落成，滨海湾花园 2012 年开放；纬壹科技城和樟宜商业园吸引知识型岗位；环线分段通车。估算：滨海湾成为增长最快的就业区，岗位继续向区域中心和科技园分散。',
        grow: { pop: { punggol: 4.2, sengkang: 2.2, cbd: 0.35, marina_south: 1.2, toapayoh: 0.5, amk: 0.5, bedok: 0.6, jurong_e: 0.5, bukittimah: 1.1 }, jobs: { marina_bay: 3.8, cbd: 1.1, marina_centre: 1.2, queenstown: 1.5, changi_v: 1.5, jurong_e: 1.4, tampines: 1.3, boonlay: 0.8, tuas: 6, jurong_island: 5 } },
        relocate: { jobs: { cbd: 0.0001 } },
        demand: { sh: 1.08, lz: 1.15, decayHW: 1.1, hub: 1.1 },
        corridors: [{ a: 'bedok', b: 'marina_bay', f: 1.2 }, { a: 'sengkang', b: 'marina_bay', f: 1.15 }, { a: 'cbd', b: 'marina_bay', f: 1.25 }],
        goals: [{ id: 'sg-g4', type: 'connect', months: 48, reward: 70000, title: '滨海湾接入线网', desc: '滨海湾的写字楼陆续入驻，需要和老金融区直接连通。用地铁连接海湾舫、滨海湾与莱佛士坊。', anchors: [anchor('海湾舫', 1.2826, 103.8597, 3), anchor('滨海湾', 1.2755, 103.8553, 3), anchor('莱佛士坊', 1.2835, 103.8518, 3)] }] },
      { id: 'sg-e5', from: 2013, name: '裕廊湖区时代', tag: '史实',
        summary: '史实：市区线和汤申—东海岸线分段通车，裕廊湖区开始建设第二中央商务区，第四航站楼 2017 年启用，大士港 2022 年开始运作。估算：裕廊东和市中心以外的就业区增长更快，榜鹅和登加成为新增人口的主要去向，跨境通勤持续增加。',
        grow: { pop: { punggol: 3.4, tengah: 2.4, sengkang: 1.5, cbd: 0.4, marina_south: 1.3, toapayoh: 0.55, amk: 0.55, bedok: 0.6, jurong_e: 0.6, bukittimah: 1.2 }, jobs: { jurong_e: 1.8, marina_bay: 2.6, punggol: 1.6, boonlay: 0.8, tuas: 7, jurong_island: 3.5, woodlands: 1.2, queenstown: 1.3, cbd: 1, changi_v: 1.3 } },
        relocate: { jobs: { cbd: 0.0001 } },
        demand: { sh: 1.08, lz: 1.18, decayHW: 1.12, hub: 1.12 },
        corridors: [{ a: 'jurong_w', b: 'jurong_e', f: 1.25 }, { a: 'woodlands', b: 'marina_bay', f: 1.15 }, { a: 'punggol', b: 'marina_bay', f: 1.15 }],
        goals: [{ id: 'sg-g5', type: 'connect', months: 48, reward: 75000, title: '第二中央商务区', desc: '裕廊东的岗位快速增长，需要东西方向都有地铁。用地铁连接裕廊东、裕华园与湖畔。', anchors: [anchor('裕廊东', 1.3331, 103.7423, 3), anchor('裕华园', 1.3424, 103.7325, 3), anchor('湖畔', 1.3442, 103.7207, 3)] }] },
      { id: 'sg-e6', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '模拟：此后的发展按模型推演，不代表真实历史。估算：登加、榜鹅和大南部滨水区继续成长，市中心保持稳定，跨境通勤随新柔地铁继续增加。',
        grow: { pop: { tengah: 1.8, punggol: 1.4, keppel: 1.5, marina_south: 1.3, cbd: 0.5 }, jobs: { jurong_e: 1.8, keppel: 1.8, tuas: 4, jurong_island: 1.5, woodlands: 1.3, marina_bay: 1.3, cbd: 0.8 } },
        demand: { lz: 1.1, decayHW: 1.12 }, corridors: [{ a: 'woodlands', b: 'cbd', f: 1.1 }] },
    ],
    briefing: {
      lead: '1980 年的新加坡还没有地铁。约三分之二的人住在组屋新镇，岗位集中在莱佛士坊、丹戎巴葛港和裕廊工业区，每天的通勤全靠巴士。政府正在争论要不要修地铁。',
      modes: [['metro', '地铁', '尚无地铁。真实的第一段 1987 年才通车，本局由你规划，真实线路不会自动出现。'], ['bus', '巴士', '新加坡巴士公司是主要的公共交通，乌节路和市中心高峰时段拥挤。'], ['bridge', '长堤与关卡', '新柔长堤是通往柔佛的唯一陆路，兀兰关卡每天都有大批通勤者过境。'], ['plane', '机场搬迁', '国际航班还在巴耶利峇，樟宜机场 1981 年 7 月启用后全部迁走。']],
    },
    airport: null,
    linkRoadYears: true,   // 无名匝道跟随相连的晚通车快速路
    seaZones: [{ name: '柔佛海峡', poly: poly([[1.5000, 103.5900], [1.5000, 104.1000], [1.3700, 104.1000], [1.3950, 104.0300], [1.4000, 103.9500], [1.3600, 103.8000], [1.3300, 103.7000], [1.3000, 103.5900]]) }],
    lockEnclaves: true,   // 岛屿地图：被已开放片区和海面包围的片区，到年份才能建设
    // 民用跑道：樟宜第一跑道 1981 年、第二跑道 1984 年启用，第三跑道按规划模拟；实里达为民用机场（史实）
    runways: [{ a: ll(1.3822, 103.9915), b: ll(1.3490, 103.9775), from: 1981.5 }, { a: ll(1.3619, 103.9990), b: ll(1.3288, 103.9850), from: 1984 }, { a: ll(1.3459, 104.0254), b: ll(1.3155, 104.0126), from: 2035 }, { a: ll(1.4228, 103.8715), b: ll(1.4082, 103.8619), from: 1980 }],
    regions: [
      // 机场与暂不开放的用地（多边形优先于行政区）。暂不开放的用地不写用途，开放前没有人口、岗位和出行
      { id: 'changi_air', name: '樟宜机场', poly: poly([[1.3860, 103.9760], [1.3885, 103.9820], [1.3880, 103.9915], [1.3760, 104.0130], [1.3580, 104.0300], [1.3100, 104.0120], [1.3100, 103.9880], [1.3290, 103.9720], [1.3560, 103.9680]]), open: null, hub: true, empty: true, lockNote: '民用机场照常运营，用地不开发', note: '1981 年 7 月启用（史实）；重要交通枢纽：范围内可以地下设站与地下穿越' },
      // 境内暂不开放的用地（v2.9）：按年份开放，开放前没有人口、岗位和用途说明，开放后按规划发展；年份按公开的长期规划估算，未公布的按模拟
      { id: 'lock_w', name: '登加北部', poly: poly([[1.3740, 103.6954], [1.3706, 103.7077], [1.3735, 103.7136], [1.3813, 103.7192], [1.3977, 103.7242], [1.4030, 103.7172], [1.4041, 103.7094], [1.4021, 103.7007]]), open: 2045, empty: true, sim: true, plan: 'newtown', note: '远期城镇用地（模拟）' },
      { id: 'lock_e', name: '巴耶利峇东部', poly: poly([[1.3405, 103.8985], [1.3389, 103.9020], [1.3429, 103.9159], [1.3677, 103.9250], [1.3797, 103.9183], [1.3780, 103.9144], [1.3562, 103.9018], [1.3481, 103.8985]]), open: 2035, empty: true, sim: true, plan: 'newtown', note: '按长期规划 2030 年代腾出、改建新镇（年份为模拟）' },
      { id: 'lock_n', name: '三巴旺南部', poly: poly([[1.4229, 103.7962], [1.4147, 103.8064], [1.4172, 103.8197], [1.4190, 103.8226], [1.4349, 103.8244], [1.4437, 103.8120]]), open: 2040, empty: true, sim: true, plan: 'res', note: '远期城镇用地（模拟）' },
      { id: 'bukom', name: '毛广岛', poly: poly([[1.2430, 103.7320], [1.2430, 103.7900], [1.2150, 103.7900], [1.2150, 103.7320]]), open: 1980, plan: 'ind', noGen: true, island: true, note: '炼油工业岛（史实），要修过海隧道才能接上线网' },
      { id: 'tekong', name: '德光岛', poly: poly([[1.4380, 104.0190], [1.4380, 104.0900], [1.3840, 104.0900], [1.3840, 104.0190]]), open: 2045, empty: true, sim: true, island: true, plan: 'res', note: '离岛，远期城镇用地（模拟）' },
      // 风景与生态保护
      { id: 'ubin', name: '乌敏岛', scenic: true, relief: 75, open: null, host: 'pasirris', island: true, poly: poly([[1.4250, 103.9300], [1.4250, 103.9970], [1.3960, 103.9970], [1.3960, 103.9300]]), note: '保留甘榜风貌和仄爪哇湿地的生态保护岛（史实）' },
      { id: 'central_nr', name: '中央集水区', scenic: true, open: null, geo: { reserve: '中央集水区自然保护区' }, district: ['中央集水区'], relief: 160 },
      { id: 'bukit_nr', name: '武吉知马自然保护区', scenic: true, open: null, geo: { reserve: '武吉知马自然保护区' }, relief: 163 },
      { id: 'buloh', name: '双溪布洛湿地', scenic: true, relief: 0, open: null, geo: { reserve: '双溪布洛湿地保护区' } },
      { id: 'kranji_m', name: '克兰芝沼泽', scenic: true, relief: 0, open: null, geo: { reserve: '克兰芝沼泽' } },
      { id: 'sentosa', name: '圣淘沙', scenic: true, relief: 70, open: null, host: 'redhill', streets: ['圣淘沙'], note: '度假岛，运营中的景点约 600 m 内可以建地下车站（史实：1972 年更名，此后开发为度假地）' },
      { id: 'south_isles', name: '南部群岛', scenic: true, relief: 0, open: null, host: 'redhill', island: true, streets: ['南部群岛'], note: '离岛，随红山一带开放；运营中的景点附近可以建地下车站，要修过海隧道才能接上线网' },
      { id: 'west_catch', name: '西部集水区', district: ['西部集水区'], open: 2040, empty: true, sim: true, plan: 'res', note: '集水区以外的陆地远期改作城镇用地（模拟）' },
      { id: 'limchukang', name: '林厝港', district: ['林厝港'], open: 2030, empty: true, sim: true, plan: 'resind', note: '农业区，按长期规划 2030 年代起改作农业科技与城镇用地（年份为模拟）' },
      // 开局开放：市中心和较早发展的片区
      { id: 'cbd', name: '市中心（莱佛士坊·丹戎巴葛）', district: ['市中心'], open: 1980, plan: 'cbd', note: '新加坡最大的就业中心（史实）' },
      { id: 'marina_centre', name: '滨海中心', streets: ['滨海中心'], open: 1980, plan: 'cbd', note: '1970 年代填海形成，1980 年代起建成酒店和商场（史实）' },
      { id: 'riverside', name: '新加坡河沿岸', district: ['新加坡河', '博物馆', '欧南'], open: 1980, plan: 'oldmix', note: '老商业区和牛车水一带（史实）' },
      { id: 'rochor', name: '梧槽（武吉士·小印度）', district: ['梧槽'], open: 1980, plan: 'oldmix' },
      { id: 'orchard', name: '乌节路', district: ['乌节', '纽顿'], open: 1980, plan: 'cbd', note: '全国最繁华的商业街（史实）' },
      { id: 'tanglin', name: '东陵·里峇峇利', district: ['东陵', '里峇峇利'], open: 1980, plan: 'res' },
      { id: 'keppel', name: '吉宝与丹戎巴葛港', streets: ['港口', '大南部滨水区'], open: 1980, plan: 'port', note: '集装箱码头所在地，租约 2027 年到期（史实）' },
      { id: 'redhill', name: '红山·中峇鲁', district: ['红山'], open: 1980, plan: 'res' },
      { id: 'queenstown', name: '女皇镇', district: ['女皇镇'], open: 1980, plan: 'res', note: '新加坡第一座卫星镇（史实）' },
      { id: 'kallang', name: '加冷', district: ['加冷'], open: 1980, plan: 'mix' },
      { id: 'geylang', name: '芽笼', district: ['芽笼'], open: 1980, plan: 'oldmix' },
      { id: 'novena', name: '诺维娜', district: ['诺维娜'], open: 1980, plan: 'mix' },
      { id: 'toapayoh', name: '大巴窑', district: ['大巴窑'], open: 1980, plan: 'res', note: '1960 年代建成的组屋新镇（史实）' },
      { id: 'bishan', name: '碧山', district: ['碧山'], open: 1980, plan: 'res', note: '1980 年代成片开发（史实）' },
      { id: 'amk', name: '宏茂桥', district: ['宏茂桥'], open: 1980, plan: 'res', note: '1973 年起建设的组屋新镇（史实）' },
      // 向外连片开放
      { id: 'bedok', name: '勿洛', district: ['勿洛'], open: 1981, plan: 'res', note: '1970 年代建成的组屋新镇（史实）' },
      { id: 'marine', name: '马林百列', district: ['马林百列'], open: 1981, plan: 'res', note: '建在东海岸填海土地上的住宅区（史实）' },
      { id: 'clementi', name: '金文泰', district: ['金文泰'], open: 1981, plan: 'res' },
      { id: 'bukittimah', name: '武吉知马', district: ['武吉知马'], open: 1981, plan: 'res' },
      { id: 'serangoon', name: '实龙岗', district: ['实龙岗'], open: 1982, plan: 'res' },
      { id: 'hougang', name: '后港', district: ['后港'], open: 1982, plan: 'res' },
      { id: 'jurong_e', name: '裕廊东', district: ['裕廊东'], open: 1982, plan: 'mix', note: '后来的裕廊湖区和第二中央商务区（史实）' },
      { id: 'jurong_w', name: '裕廊西', district: ['裕廊西'], open: 1983, plan: 'res' },
      { id: 'boonlay', name: '文礼（裕廊工业区）', district: ['文礼'], open: 1983, plan: 'ind', noGen: true, note: '1960 年代起开发的工业区（史实）' },
      { id: 'tampines', name: '淡滨尼', district: ['淡滨尼'], open: 1983, plan: 'newtown', note: '1978 年起建设，后来的东部区域中心（史实）' },
      { id: 'yishun', name: '义顺', district: ['义顺'], open: 1984, plan: 'res' },
      { id: 'bukitbatok', name: '武吉巴督', district: ['武吉巴督'], open: 1984, plan: 'res' },
      { id: 'mandai', name: '万礼', district: ['万礼'], open: 1985, plan: 'res', note: '新加坡动物园所在地（史实）' },
      { id: 'woodlands', name: '兀兰', district: ['兀兰'], open: 1985, plan: 'newtown', note: '北部区域中心，紧邻新柔长堤（史实）' },
      { id: 'paya', name: '巴耶利峇', district: ['巴耶利峇'], open: 1985, plan: 'mix' },
      { id: 'changi_v', name: '樟宜（商业园·樟宜角）', district: ['樟宜'], open: 1985, plan: 'res' },
      { id: 'pioneer', name: '先驱', district: ['先驱'], open: 1985, plan: 'ind', noGen: true },
      { id: 'tuas', name: '大士', district: ['大士'], open: 1985, plan: 'ind', noGen: true, island: true, note: '填海形成的重工业区，西面是大士第二通道（史实）' },
      { id: 'bukitpanjang', name: '武吉班让', district: ['武吉班让'], open: 1986, plan: 'res' },
      { id: 'cck', name: '蔡厝港', district: ['蔡厝港'], open: 1986, plan: 'res' },
      { id: 'pasirris', name: '巴西立', district: ['巴西立'], open: 1988, plan: 'res', note: '1980 年代末起建设的海滨新镇（史实）' },
      { id: 'sengkang', name: '盛港', district: ['盛港'], open: 1990, plan: 'newtown', note: '1990 年代末起成片建设（史实）' },
      { id: 'punggol', name: '榜鹅', district: ['榜鹅'], open: 1990, plan: 'newtown', note: '1996 年公布榜鹅 21 计划（史实）' },
      { id: 'sungei_kadut', name: '双溪加株', district: ['双溪加株'], open: 1990, plan: 'ind', noGen: true },
      { id: 'marina_bay', name: '滨海湾（金融区）', streets: ['海湾舫'], district: ['海峡景'], open: 1992, plan: 'cbd', note: '2010 年前后成为新的金融和旅游中心（史实）' },
      { id: 'sembawang', name: '三巴旺', district: ['三巴旺'], open: 1992, plan: 'resind' },
      { id: 'marina_south', name: '滨海南', district: ['滨海南'], open: 1995, plan: 'mix', note: '滨海湾花园 2012 年在这里开放（史实）' },
      { id: 'seletar', name: '实里达', district: ['实里达'], open: 2000, plan: 'ind', noGen: true, note: '实里达航空园（史实）' },
      { id: 'jurong_island', name: '裕廊岛', streets: ['裕廊岛与毛广岛'], open: 2000, plan: 'ind', noGen: true, note: '七座小岛合并而成的石化工业岛，2000 年 10 月开放（史实）' },
      { id: 'tengah', name: '登加', district: ['登加'], open: 2018, plan: 'newtown', note: '2018 年公布的“森林镇”（史实）' },
      { id: 'marina_east', name: '滨海东', district: ['滨海东'], open: 2030, plan: 'mix', note: '长期规划中的滨水住宅区（模拟）' },
      { id: 'simpang', name: '三邦', district: ['三邦'], open: 2035, plan: 'newtown', note: '长期规划的新镇（模拟）' },
      { id: 'changi_bay', name: '樟宜湾', district: ['樟宜湾'], open: 2035, plan: 'ind', noGen: true },
    ],
    defaultRegion: { id: 'outer', name: '柔佛（境外）', open: null, empty: true, lockNote: '马来西亚柔佛州，不属于新加坡的建设范围' },
    plans: CM.DATA.plans,
    // 1980 年人口与就业中心（估算，人/km²；r 约为影响半径 km）。全国约 241 万人
    centers: [
      at(1.2840, 103.8510, { pop: 5000, jobs: 170000, r: 0.7 }),    // 莱佛士坊
      at(1.2780, 103.8460, { pop: 16000, jobs: 75000, r: 0.8 }),    // 珊顿道、丹戎巴葛
      at(1.2815, 103.8430, { pop: 52000, jobs: 42000, r: 0.8 }),    // 牛车水
      at(1.3020, 103.8570, { pop: 42000, jobs: 30000, r: 1.0 }),    // 武吉士、甘榜格南
      at(1.3070, 103.8510, { pop: 38000, jobs: 15000, r: 0.8 }),    // 小印度
      at(1.2930, 103.8530, { pop: 8000, jobs: 60000, r: 0.7 }),     // 市政区
      at(1.3040, 103.8320, { pop: 10000, jobs: 55000, r: 1.0 }),    // 乌节路
      at(1.3340, 103.8500, { pop: 40000, jobs: 9000, r: 1.3 }),     // 大巴窑
      at(1.3700, 103.8490, { pop: 30000, jobs: 6000, r: 1.5 }),     // 宏茂桥
      at(1.2950, 103.8030, { pop: 38000, jobs: 8000, r: 1.3 }),     // 女皇镇
      at(1.2850, 103.8220, { pop: 42000, jobs: 10000, r: 1.2 }),    // 红山、中峇鲁
      at(1.2700, 103.8320, { pop: 3000, jobs: 42000, r: 0.9 }),     // 丹戎巴葛港、吉宝
      at(1.3120, 103.8720, { pop: 30000, jobs: 12000, r: 1.4 }),    // 加冷
      at(1.3180, 103.8650, { pop: 6000, jobs: 26000, r: 0.8 }),     // 加冷工业
      at(1.3160, 103.8950, { pop: 28000, jobs: 7000, r: 1.2 }),     // 芽笼士乃
      at(1.3030, 103.9060, { pop: 26000, jobs: 3000, r: 1.0 }),     // 马林百列
      at(1.3240, 103.9300, { pop: 32000, jobs: 5000, r: 1.4 }),     // 勿洛
      at(1.3150, 103.7650, { pop: 24000, jobs: 4000, r: 1.1 }),     // 金文泰
      at(1.3440, 103.7100, { pop: 18000, jobs: 8000, r: 1.5 }),     // 裕廊西、文礼
      at(1.3150, 103.7050, { pop: 1500, jobs: 36000, r: 1.9 }),     // 裕廊工业区
      at(1.3330, 103.7420, { pop: 7000, jobs: 10000, r: 1.0 }),     // 裕廊东
      at(1.3300, 103.8000, { pop: 9000, jobs: 2500, r: 1.6 }),      // 武吉知马
      at(1.3650, 103.8650, { pop: 13000, jobs: 3000, r: 1.2 }),     // 实龙岗花园
      at(1.3700, 103.8900, { pop: 11000, jobs: 2000, r: 1.5 }),     // 后港
      at(1.3330, 103.8950, { pop: 9000, jobs: 12000, r: 1.2 }),     // 麦波申、大成
      at(1.4370, 103.7870, { pop: 11000, jobs: 4000, r: 1.3 }),     // 兀兰
      at(1.4480, 103.8180, { pop: 6000, jobs: 12000, r: 1.2 }),     // 三巴旺船厂
      at(1.3530, 103.9450, { pop: 3000, jobs: 1000, r: 1.3 }),      // 淡滨尼
      at(1.3790, 103.7620, { pop: 7000, jobs: 2000, r: 1.4 }),      // 武吉班让
      at(1.4290, 103.8350, { pop: 4000, jobs: 1500, r: 1.2 }),      // 义顺
      at(1.3800, 103.9800, { pop: 1500, jobs: 2500, r: 1.0 }),      // 樟宜村
    ],
    rural: { pop: 120, jobs: 30 },
    // 道路通车年份（史实参考，部分为约数）；没有写的道路随所在区域开放
    // 铁路通车年份（线路名或前缀 → 年份，或 [通车, 停运]）：开局后才通车或停运的线路，按公开通车时间整理
    railYears: { '马来亚铁道': [1903, 2011] },
    roadYears: {
      '东海岸公园大道': 1981, '泛岛快速公路': 1981, '武吉知马快速公路': 1986, '实里达快速公路': 1986, '亚逸拉惹快速公路': 1988, '中央快速公路': 1989, '淡滨尼快速公路': 1989, '克兰芝快速公路': 1994,
      '大士第二通道': 1998, '第二通道高速公路': 1998, '圣淘沙门户路': 1992, '裕廊岛长堤': 1999, '裕廊岛大道': 2000, '圣淘沙门户隧道': 1992, '加冷—巴耶利峇快速公路': 2008, '滨海沿岸快速公路': 2013, '滨海沿岸通道': 2013,
    },
    bridgeYears: {}, bridgeDefaultYear: 1980,
    simRoads: [],
    // 代表性的渡轮航线：两端都是地图上标注的码头（v2.9）
    bgViz: { ferries: [
      { name: '南部岛屿渡轮（滨海南—圣约翰岛）', piers: ['滨海南码头', '圣约翰岛码头'], from: 2006, n: 2, color: '#f4f1e8', pts: [[119.35, 97.26], [113.96, 119.6]] },
      { name: '乌敏岛渡轮（樟宜角—乌敏岛）', piers: ['樟宜角码头', '乌敏岛码头'], n: 2, color: '#f4f1e8', pts: [[174.81, 43.13], [162.66, 38.33]] },
    ] },
    landmarks: [
      Object.assign(at(1.2810, 103.8475), { id: 'sg_thk', name: '天福宫', w: 60, d: 50, year: 1842, kind: 'temple' }),
      Object.assign(at(1.2827, 103.8452), { id: 'sg_mariamman', name: '马里安曼兴都庙', w: 50, d: 40, year: 1827, kind: 'temple' }),
      Object.assign(at(1.2923, 103.8523), { id: 'sg_standrew', name: '圣安德烈座堂', w: 90, d: 40, year: 1861, kind: 'church' }),
      Object.assign(at(1.2947, 103.8546), { id: 'sg_raffles', name: '莱佛士酒店', w: 130, d: 90, year: 1887, kind: 'colonial' }),
      Object.assign(at(1.3022, 103.8590), { id: 'sg_sultan', name: '苏丹回教堂', w: 60, d: 60, year: 1928, kind: 'dome' }),
      Object.assign(at(1.2903, 103.8515), { id: 'sg_ngs', name: '政府大厦（今国家美术馆）', w: 150, d: 90, year: 1929, kind: 'colonial' }),
      Object.assign(at(1.2730, 103.8383), { id: 'sg_tprs', name: '丹戎巴葛火车站', w: 120, d: 60, year: 1932, kind: 'colonial' }),
      Object.assign(at(1.2868, 103.8545), { id: 'sg_merlion', name: '鱼尾狮', w: 30, d: 30, year: 1972, kind: 'memorial', shore: true }),
      Object.assign(at(1.2853, 103.8493), { id: 'sg_ocbc', name: '华侨银行中心', w: 76, d: 40, year: 1976, kind: 'skyscraper', h: 198 }),
      Object.assign(at(1.2963, 103.7773), { id: 'sg_nus', name: '新加坡国立大学', w: 1400, d: 1100, year: 1980, kind: 'campus' }),
      Object.assign(at(1.3483, 103.6830), { id: 'sg_ntu', name: '南洋理工大学', w: 1500, d: 1300, year: 1981, kind: 'campus' }),
      Object.assign(at(1.2844, 103.8509), { id: 'sg_oub', name: '莱佛士坊一号（华联银行大厦）', w: 90, d: 66, year: 1986, kind: 'skyscraper', h: 280 }),
      Object.assign(at(1.2936, 103.8532), { id: 'sg_raffles_city', name: '莱佛士城', w: 130, d: 110, year: 1986, kind: 'skyscraper', h: 226 }),
      Object.assign(at(1.3008, 103.8744), { id: 'sg_indoor', name: '新加坡室内体育馆', w: 180, d: 140, year: 1989, kind: 'stadium' }),
      Object.assign(at(1.2854, 103.8508), { id: 'sg_uob', name: '大华银行大厦', w: 96, d: 58, year: 1992, kind: 'skyscraper', h: 280 }),
      Object.assign(at(1.3026, 103.8347), { id: 'sg_ngeeann', name: '义安城', w: 200, d: 120, year: 1993, kind: 'skyscraper', h: 150 }),
      Object.assign(at(1.2832, 103.8508), { id: 'sg_republic', name: '共和大厦', w: 97, d: 94, year: 1995, kind: 'skyscraper', h: 280 }),
      Object.assign(at(1.2953, 103.8590), { id: 'sg_suntec', name: '新达城', w: 320, d: 260, year: 1997, kind: 'skyscraper', h: 190 }),
      Object.assign(at(1.3353, 103.9602), { id: 'sg_expo', name: '新加坡博览中心', w: 620, d: 300, year: 1999, kind: 'expo' }),
      Object.assign(at(1.2897, 103.8557), { id: 'sg_esplanade', name: '滨海艺术中心', w: 240, d: 140, year: 2002, kind: 'opera' }),
      Object.assign(at(1.2962, 103.8497), { id: 'sg_smu', name: '新加坡管理大学', w: 300, d: 220, year: 2005, kind: 'campus' }),
      Object.assign(at(1.2894, 103.8631), { id: 'sg_flyer', name: '新加坡摩天观景轮', w: 170, d: 170, year: 2008, kind: 'memorial' }),
      Object.assign(at(1.2807, 103.8710), { id: 'sg_barrage', name: '滨海堤坝', w: 350, d: 60, year: 2008, kind: 'hall' }),
      Object.assign(at(1.3040, 103.8320), { id: 'sg_ion', name: '爱雍·乌节', w: 180, d: 110, year: 2009, kind: 'skyscraper', h: 218 }),
      Object.assign(at(1.2796, 103.8544), { id: 'sg_mbfc', name: '滨海湾金融中心', w: 280, d: 220, year: 2010, kind: 'skyscraper', h: 245 }),
      Object.assign(at(1.2837, 103.8607), { id: 'sg_mbs', name: '滨海湾金沙', w: 340, d: 120, year: 2010, kind: 'skyscraper', h: 200 }),
      Object.assign(at(1.2559, 103.8203), { id: 'sg_rws', name: '圣淘沙名胜世界', w: 300, d: 200, year: 2010, kind: 'themepark' }),
      Object.assign(at(1.2825, 103.8642), { id: 'sg_gardens', name: '滨海湾花园', w: 480, d: 320, year: 2012, kind: 'dome' }),
      Object.assign(at(1.3044, 103.8743), { id: 'sg_sportshub', name: '新加坡体育城', w: 320, d: 280, year: 2014, kind: 'stadium' }),
      Object.assign(at(1.2770, 103.8456), { id: 'sg_guoco', name: '丰隆大厦', w: 70, d: 50, year: 2016, kind: 'skyscraper', h: 290 }),
      Object.assign(at(1.3602, 103.9897), { id: 'sg_jewel', name: '星耀樟宜', w: 220, d: 200, year: 2019, kind: 'dome' }),
    ],
    // 重要设施（见 facility.js）：位置与启用 / 停用年份为史实参考（位置近似）；规模均为估算。
    // 枢纽 pax：市内接驳出行（汽车 + 地铁，万人次/日）。接驳口只有接驳口上的车站算接通，图外是柔佛，不做成地图
    facilities: [
      { id: 'sg_gate_wl', n: '兀兰接驳口', t: 'rail', gate: true, ext: ['N', 0], to: '新山（柔佛）', at: ll(1.4459, 103.7686), pax: [[1980, 1.2], [1990, 3.5], [2000, 8], [2010, 13], [2019, 18], [2027, 22], [2040, 26]], note: '新柔长堤 1924 年通车，是通往柔佛的主要陆路；规模为估算。2027 年起按新柔地铁通车模拟增加。' },
      { id: 'sg_gate_tu', n: '大士接驳口', t: 'rail', gate: true, ext: ['W', 0], to: '柔佛（第二通道）', at: ll(1.3481, 103.6366), y0: [1998, 1], pax: [[1998, 1.5], [2005, 3], [2010, 4.5], [2019, 6.5], [2040, 9]], note: '大士第二通道 1998 年 1 月通车；规模为估算。' },
      { id: 'sg_payalebar', n: '巴耶利峇机场', t: 'air', at: ll(1.3535, 103.9015), y1: [1981, 7], pax: [[1980, 0.8], [1981.5, 0.9]], note: '1955 年启用的国际机场，1981 年 7 月民航全部迁往樟宜。' },
      { id: 'sg_changi', n: '樟宜机场', label: '新加坡樟宜机场', t: 'air', at: ll(1.3575, 103.9885), rw: [ll(1.3822, 103.9915), ll(1.3490, 103.9775)], y0: [1981, 7], pax: [[1981.5, 0.9], [1990, 2.2], [2000, 4], [2010, 6.5], [2019, 9.5], [2030, 12]], note: '1981 年 7 月启用，第二航站楼 1990 年、第三航站楼 2008 年启用。' },
      { id: 'sg_t4', n: '樟宜机场第四航站楼', t: 'air', at: ll(1.3388, 103.9843), rw: [ll(1.3619, 103.9990), ll(1.3288, 103.9850)], y0: [2017, 10], pax: [[2017.8, 0.8], [2019, 1.3], [2030, 2]], note: '2017 年 10 月启用。' },
      { id: 'sg_seletar', n: '实里达机场', t: 'air', at: ll(1.4146, 103.8715), rw: [ll(1.4228, 103.8715), ll(1.4082, 103.8619)], pax: [[1980, 0.02], [2018, 0.1], [2030, 0.15]], note: '新加坡第一座民用机场，今天主要服务区域航班和公务机。' },
      { id: 'sg_tprail', n: '丹戎巴葛火车站', t: 'rail', lm: 'sg_tprs', y1: [2011, 7], pax: [[1980, 0.4], [2011.5, 0.3]], note: '马来亚铁路的终点站，2011 年 7 月终点站迁往兀兰。' },
      { id: 'sg_wtrain', n: '兀兰火车关卡', t: 'rail', at: ll(1.4450, 103.7700), y0: [2011, 7], pax: [[2011.5, 0.2], [2030, 0.3]], note: '2011 年 7 月起成为马来亚铁路在新加坡的终点。' },
      { id: 'sg_nus', n: '新加坡国立大学', t: 'uni', lm: 'sg_nus', w: 0.05 },
      { id: 'sg_ntu', n: '南洋理工大学', t: 'uni', lm: 'sg_ntu', w: 0.03 },
      { id: 'sg_smu', n: '新加坡管理大学', t: 'uni', lm: 'sg_smu', y0: [2005, 7], w: 0.012 },
      { id: 'sg_ngeeann_poly', n: '义安理工学院', t: 'uni', at: ll(1.3331, 103.7742), w: 0.02 },
      { id: 'sg_sp', n: '新加坡理工学院', t: 'uni', at: ll(1.3090, 103.7776), w: 0.02 },
      { id: 'sg_tp', n: '淡马锡理工学院', t: 'uni', at: ll(1.3450, 103.9317), y0: [1990, 7], w: 0.015 },
      { id: 'sg_sgh', n: '新加坡中央医院', t: 'hosp', at: ll(1.2795, 103.8347), w: 0.07 },
      { id: 'sg_ttsh', n: '陈笃生医院', t: 'hosp', at: ll(1.3213, 103.8462), w: 0.06 },
      { id: 'sg_nuh', n: '国立大学医院', t: 'hosp', at: ll(1.2943, 103.7832), y0: [1985, 6], w: 0.05 },
      { id: 'sg_kk', n: '竹脚妇幼医院', t: 'hosp', at: ll(1.3105, 103.8468), w: 0.03 },
      { id: 'sg_cgh', n: '樟宜综合医院', t: 'hosp', at: ll(1.3404, 103.9491), y0: [1997, 3], w: 0.045 },
      { id: 'sg_ktph', n: '邱德拔医院', t: 'hosp', at: ll(1.4243, 103.8386), y0: [2010, 3], w: 0.04 },
      { id: 'sg_ntfgh', n: '黄廷方综合医院', t: 'hosp', at: ll(1.3334, 103.7455), y0: [2015, 7], w: 0.04 },
      { id: 'sg_orchard', n: '乌节路商圈', t: 'shop', at: ll(1.3040, 103.8330), w: [[1980, 0.12], [2010, 0.1], [2030, 0.08]] },
      { id: 'sg_bugis', n: '武吉士商圈', t: 'shop', at: ll(1.2998, 103.8559), w: [[1980, 0.03], [1995, 0.05], [2020, 0.05]] },
      { id: 'sg_chinatown', n: '牛车水', t: 'shop', at: ll(1.2838, 103.8438), p: { sh: 0.6, lz: 0.4 }, w: [[1980, 0.06], [2020, 0.035]] },
      { id: 'sg_littleindia', n: '小印度', t: 'shop', at: ll(1.3064, 103.8507), p: { sh: 0.7, lz: 0.3 }, w: 0.025 },
      { id: 'sg_tpcentral', n: '大巴窑镇中心', t: 'shop', at: ll(1.3320, 103.8485), w: 0.022 },
      { id: 'sg_amkhub', n: '宏茂桥镇中心', t: 'shop', at: ll(1.3694, 103.8483), w: 0.022 },
      { id: 'sg_bedokc', n: '勿洛镇中心', t: 'shop', at: ll(1.3248, 103.9292), w: 0.02 },
      { id: 'sg_tampinesc', n: '淡滨尼区域中心', t: 'shop', at: ll(1.3525, 103.9447), y0: [1990, 1], w: [[1990, 0.012], [2000, 0.04], [2020, 0.05]] },
      { id: 'sg_jurongc', n: '裕廊东商圈', t: 'shop', at: ll(1.3336, 103.7432), y0: [1990, 1], w: [[1990, 0.008], [2000, 0.022], [2013, 0.03], [2020, 0.05]] },
      { id: 'sg_causeway', n: '兀兰区域中心', t: 'shop', at: ll(1.4360, 103.7860), y0: [1998, 10], w: [[1998.8, 0.012], [2010, 0.025], [2020, 0.03]] },
      { id: 'sg_sengkangc', n: '盛港镇中心', t: 'shop', at: ll(1.3920, 103.8951), y0: [2003, 1], w: [[2003, 0.006], [2020, 0.02]] },
      { id: 'sg_punggolc', n: '榜鹅镇中心', t: 'shop', at: ll(1.4065, 103.9022), y0: [2007, 1], w: [[2007, 0.004], [2020, 0.018]] },
      { id: 'sg_marinasq', n: '滨海中心商圈', t: 'shop', at: ll(1.2913, 103.8575), y0: [1986, 1], w: [[1986, 0.02], [2000, 0.04]] },
      { id: 'sg_vivo', n: '怡丰城', t: 'shop', at: ll(1.2644, 103.8221), y0: [2006, 10], w: 0.03 },
      { id: 'sg_jewelshop', n: '星耀樟宜商场', t: 'shop', lm: 'sg_jewel', y0: [2019, 4], p: { sh: 0.6, lz: 0.4 }, w: 0.018 },
      // 不同时期的就业热点
      { id: 'sg_raffles', n: '莱佛士坊金融区', t: 'cbd', at: ll(1.2844, 103.8514), w: [[1980, 0.14], [2005, 0.12], [2020, 0.09]] },
      { id: 'sg_shenton', n: '珊顿道', t: 'cbd', at: ll(1.2770, 103.8480), w: [[1980, 0.05], [2020, 0.05]] },
      { id: 'sg_marinabay', n: '滨海湾金融区', t: 'cbd', at: ll(1.2796, 103.8545), y0: [2005, 1], w: [[2005, 0.003], [2012, 0.04], [2020, 0.08]] },
      { id: 'sg_jurongind', n: '裕廊工业区', t: 'cbd', at: ll(1.3150, 103.7050), r: 2.4, w: [[1980, 0.06], [2000, 0.05], [2020, 0.035]] },
      { id: 'sg_tuasind', n: '大士工业区', t: 'cbd', at: ll(1.3150, 103.6450), r: 2.4, y0: [1988, 1], w: [[1988, 0.003], [2005, 0.025], [2020, 0.03]] },
      { id: 'sg_jurongisland', n: '裕廊岛化工区', t: 'cbd', at: ll(1.2750, 103.7100), r: 2.2, y0: [2000, 10], w: [[2000.8, 0.003], [2010, 0.018], [2020, 0.02]] },
      { id: 'sg_tampinesrc', n: '淡滨尼商务区', t: 'cbd', at: ll(1.3520, 103.9420), y0: [1995, 1], w: [[1995, 0.004], [2020, 0.02]] },
      { id: 'sg_woodlandsrc', n: '兀兰商务区', t: 'cbd', at: ll(1.4375, 103.7880), y0: [2000, 1], w: [[2000, 0.002], [2020, 0.012]] },
      { id: 'sg_jld', n: '裕廊湖区商务区', t: 'cbd', at: ll(1.3331, 103.7423), y0: [2009, 1], w: [[2009, 0.004], [2020, 0.03], [2035, 0.06]] },
      { id: 'sg_cbp', n: '樟宜商业园', t: 'cbd', at: ll(1.3351, 103.9652), y0: [1998, 1], w: [[1998, 0.002], [2020, 0.018]] },
      { id: 'sg_onenorth', n: '纬壹科技城', t: 'cbd', at: ll(1.2998, 103.7873), y0: [2001, 12], w: [[2002, 0.002], [2020, 0.022]] },
      { id: 'sg_paya', n: '巴耶利峇中央', t: 'cbd', at: ll(1.3168, 103.8934), y0: [2012, 1], w: [[2012, 0.002], [2020, 0.014]] },
      { id: 'sg_merlion', n: '鱼尾狮公园', t: 'scenic', lm: 'sg_merlion', w: 0.02 },
      { id: 'sg_gardens', n: '滨海湾花园', t: 'scenic', lm: 'sg_gardens', y0: [2012, 6], w: 0.05 },
      { id: 'sg_mbs', n: '滨海湾金沙', t: 'scenic', lm: 'sg_mbs', y0: [2010, 4], p: { sh: 0.3, lz: 0.7 }, w: 0.05 },
      { id: 'sg_flyer', n: '新加坡摩天观景轮', t: 'scenic', lm: 'sg_flyer', y0: [2008, 3], w: 0.01 },
      { id: 'sg_zoo', n: '新加坡动物园', t: 'scenic', at: ll(1.4037, 103.7944), w: 0.03 },
      { id: 'sg_birdparadise', n: '飞禽天堂', t: 'scenic', at: ll(1.4055, 103.7814), y0: [2023, 5], w: 0.012 },
      { id: 'sg_birdpark', n: '裕廊飞禽公园', t: 'scenic', at: ll(1.3187, 103.7064), y1: [2023, 1], w: 0.012 },
      { id: 'sg_botanic', n: '新加坡植物园', t: 'scenic', at: ll(1.3147, 103.8161), w: 0.025 },
      { id: 'sg_sentosa', n: '圣淘沙西罗索海滩', t: 'scenic', at: ll(1.2543, 103.8130), w: [[1980, 0.012], [1995, 0.025], [2020, 0.025]] },
      { id: 'sg_rws', n: '圣淘沙名胜世界', t: 'scenic', lm: 'sg_rws', y0: [2010, 1], p: { sh: 0.2, lz: 0.8 }, w: [[2010, 0.04], [2020, 0.055]] },
      { id: 'sg_imbiah', n: '圣淘沙英比奥', t: 'scenic', noModel: true, at: ll(1.2550, 103.8168), y0: [1991, 1], w: 0.012 },
      { id: 'sg_ecp', n: '东海岸公园', t: 'park', at: ll(1.3047, 103.9223), w: 0.04 },
      { id: 'sg_bishanp', n: '碧山—宏茂桥公园', t: 'park', at: ll(1.3629, 103.8415), y0: [1988, 1], w: 0.012 },
      { id: 'sg_macritchie', n: '麦里芝蓄水池公园', t: 'park', at: ll(1.3433, 103.8337), w: 0.012 },
      { id: 'sg_westcoast', n: '西海岸公园', t: 'park', at: ll(1.2935, 103.7675), w: 0.01 },
      { id: 'sg_stadium', n: '国家体育场', t: 'stadium', at: ll(1.3044, 103.8743), y1: [2007, 7], w: 0.015, note: '1973 年启用，2007 年停用，原址后来建成新加坡体育城。' },
      { id: 'sg_sportshub', n: '新加坡体育城', t: 'stadium', lm: 'sg_sportshub', y0: [2014, 6], w: 0.018 },
      { id: 'sg_indoor', n: '新加坡室内体育馆', t: 'stadium', lm: 'sg_indoor', w: 0.008 },
      { id: 'sg_expo', n: '新加坡博览中心', t: 'venue', lm: 'sg_expo', w: 0.02 },
      { id: 'sg_suntecv', n: '新达城会展中心', t: 'venue', lm: 'sg_suntec', y0: [1995, 9], w: 0.016 },
    ],
    districtLabels: [],
    // 纪事（只能在末尾追加：已发生记录按序号保存）
    events: [
      { y: 1980, m: 1, tag: '史实', title: '1980 年的新加坡', desc: '全国约 241 万人，约三分之二住在组屋；岗位集中在莱佛士坊、丹戎巴葛港和裕廊工业区；通勤全靠巴士，没有地铁。' },
      { y: 1980, m: 6, tag: '史实', title: '全巴士方案还是地铁', desc: '哈佛大学的顾问团队建议只发展巴士，主张修地铁的一方认为巴士迟早不够用，“交通大辩论”持续到 1982 年。' },
      { y: 1981, m: 7, tag: '史实', title: '樟宜机场启用', desc: '7 月 1 日樟宜机场启用，民航航班全部从巴耶利峇迁走。', fx: { grow: { region: 'changi_v', jobs: 1.3, years: 8 } } },
      { y: 1983, m: 10, tag: '史实', title: '成立临时地铁局', desc: '负责规划和建设地铁系统的临时机构成立，第二年工程全面展开。' },
      { y: 1987, m: 11, tag: '史实', title: '史实背景：第一段地铁通车', desc: '11 月 7 日，杨厝港至大巴窑段通车。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 1990, m: 7, tag: '史实', title: '史实背景：首期地铁全线完工', desc: '南北线和东西线首期工程完工，全长 67 公里。' },
      { y: 1990, m: 11, tag: '史实', title: '樟宜机场第二航站楼启用', desc: '航空枢纽的地位进一步巩固，机场周边的物流和航空岗位持续增加。' },
      { y: 1991, m: 9, tag: '史实', title: '概念规划提出区域中心', desc: '1991 年概念规划提出在淡滨尼、兀兰、裕廊东和实里达设区域中心，把岗位带到靠近住家的地方。', fx: { grow: { region: 'tampines', jobs: 1.3, years: 10 } } },
      { y: 1995, m: 9, tag: '史实', title: '成立陆路交通管理局', desc: '分散的陆路交通机构合并，统一负责铁路、道路和公共交通规划。' },
      { y: 1996, m: 8, tag: '史实', title: '盛港与榜鹅开始成片建设', desc: '东北部的农场和甘榜陆续迁走，新一代组屋新镇开始动工。', fx: { grow: { region: ['sengkang', 'punggol'], pop: 1.3, years: 10 } } },
      { y: 1998, m: 1, tag: '史实', title: '大士第二通道通车', desc: '连接大士和柔佛的第二条跨海通道通车，西部工业区的跨境通勤开始增加。', fx: { grow: { region: 'tuas', jobs: 1.2, years: 6 } } },
      { y: 2000, m: 10, tag: '史实', title: '裕廊岛正式开放', desc: '几座小岛连成的裕廊岛正式开放，炼油和石化企业向这里集中。', fx: { grow: { region: 'jurong_island', jobs: 1.5, years: 10 } } },
      { y: 2001, m: 12, tag: '史实', title: '暂缓填海仄爪哇', desc: '乌敏岛东端的仄爪哇湿地原定填海，政府因保育呼声决定暂缓。' },
      { y: 2002, m: 10, tag: '史实', title: '滨海艺术中心开幕', desc: '滨海湾畔的艺术中心开幕，这一带开始成为新的城市客厅。' },
      { y: 2003, m: 6, tag: '史实', title: '史实背景：东北线通车', desc: '世界上最早的全自动重轨地铁线路之一通车，把盛港和榜鹅接到了市中心。' },
      { y: 2008, m: 1, tag: '史实', title: '樟宜机场第三航站楼启用', desc: '机场客运能力再上一个台阶。' },
      { y: 2008, m: 11, tag: '史实', title: '滨海堤坝启用', desc: '滨海湾被堤坝围成淡水蓄水池，也成了市民休闲的新去处。' },
      { y: 2010, m: 4, tag: '史实', title: '滨海湾金沙开业', desc: '滨海湾金沙和滨海湾金融中心相继落成，滨海湾成为新的金融和旅游中心。', fx: { grow: { region: 'marina_bay', jobs: 1.5, years: 8 } }, task: { id: 'sg-e1', type: 'facShare', fac: 'sg_mbs', target: 0.15, months: 48, rewardMonths: 1, title: '滨海湾金沙的客流', desc: '滨海湾金沙在填海地上开业，酒店、会展和商场的客流很大。让到金沙的人里有 15% 坐地铁。' } },
      { y: 2010, m: 8, tag: '史实', title: '首届青年奥运会', desc: '首届夏季青年奥运会在新加坡举行。' },
      { y: 2011, m: 7, tag: '史实', title: '马来亚铁路迁往兀兰', desc: '丹戎巴葛火车站停止运营，终点站迁往兀兰，岛内的铁路用地归还新加坡。' },
      { y: 2012, m: 6, tag: '史实', title: '滨海湾花园开放', desc: '滨海南的填海土地上建起大型花园，成为最受欢迎的景点之一。' },
      { y: 2017, m: 10, tag: '史实', title: '樟宜机场第四航站楼启用', desc: '第四航站楼启用，机场南侧增加新的客流。' },
      { y: 2019, m: 4, tag: '史实', title: '星耀樟宜开业', desc: '机场第一航站楼前的室内瀑布和商场开业，成为新的旅游目的地。', task: { id: 'sg-e2', type: 'facShare', fac: 'sg_jewelshop', target: 0.12, months: 36, rewardMonths: 1, title: '星耀樟宜的访客', desc: '星耀樟宜开业，不坐飞机的市民也专程去看室内瀑布。让到星耀樟宜的人里有 12% 坐地铁。' } },
      { y: 2021, m: 1, tag: '模拟', title: '进入模拟发展阶段', desc: '此后人口、道路和区域变化按模拟规则推演，不代表真实历史。' },
      { y: 2027, m: 1, tag: '模拟', title: '模拟：新柔地铁通车', desc: '连接兀兰北和新山的跨境轨道按公开计划通车，兀兰的过境客流继续增加。这里按公开计划模拟。' },
    ],
    // 本地历史主题任务：参考新加坡的发展需求，不要求复刻真实线路走向（奖励单位：万新元）
    histTasks: [
      { id: 'sg1', appear: [1982, 6], deadline: [1990, 6], type: 'connect', reward: 50000, title: '第一条线：宏茂桥进城', desc: '连接宏茂桥、大巴窑与政府大厦，把最大的新镇和市中心接起来。', anchors: [anchor('宏茂桥', 1.3700, 103.8495, 3), anchor('大巴窑', 1.3326, 103.8471, 3), anchor('政府大厦', 1.2930, 103.8527, 3)] },
      { id: 'sg2', appear: [1984, 1], deadline: [1991, 12], type: 'connect', reward: 50000, title: '东西主轴：勿洛到市中心', desc: '东部的组屋新镇通勤量很大。连接勿洛、巴耶利峇、加冷与政府大厦。', anchors: [anchor('勿洛', 1.3240, 103.9300, 3), anchor('巴耶利峇', 1.3175, 103.8927, 3), anchor('加冷', 1.3114, 103.8714, 3), anchor('政府大厦', 1.2930, 103.8527, 3)] },
      { id: 'sg3', appear: [1985, 1], deadline: [1992, 12], type: 'connect', reward: 60000, title: '向西到裕廊', desc: '裕廊工业区的工人大多住在市区和西部新镇。连接裕廊东、金文泰、女皇镇与欧南园。', anchors: [anchor('裕廊东', 1.3331, 103.7423, 3), anchor('金文泰', 1.3161, 103.7659, 3), anchor('女皇镇', 1.2946, 103.8058, 3), anchor('欧南园', 1.2803, 103.8395, 3)] },
      { id: 'sg4', appear: [1986, 1], deadline: [1996, 12], type: 'connect', reward: 60000, title: '修到长堤边', desc: '每天大批柔佛居民从兀兰过境上班。修到兀兰接驳口，再和义顺接到同一张线网。', anchors: [anchor('兀兰接驳口', 1.4459, 103.7686, 1.2), anchor('兀兰', 1.4370, 103.7869, 3), anchor('义顺', 1.4295, 103.8350, 3)] },
      { id: 'sg5', appear: [1990, 1], deadline: [1999, 12], type: 'coverage', target: 0.28, reward: 70000, title: '覆盖主要新镇', desc: '步行 15 分钟可到达地铁站的人口不低于全国人口的 28%。' },
      { id: 'sg6', appear: [1992, 1], deadline: [2002, 2], type: 'connect', reward: 60000, title: '机场接入市区', desc: '连接樟宜机场、淡滨尼与巴耶利峇，让旅客不必再靠公路进城。', anchors: [anchor('樟宜机场', 1.3574, 103.9886, 3), anchor('淡滨尼', 1.3542, 103.9441, 3), anchor('巴耶利峇', 1.3175, 103.8927, 3)] },
      { id: 'sg7', appear: [1996, 1], deadline: [2005, 12], type: 'connect', reward: 60000, title: '东北新镇进城', desc: '盛港和榜鹅的组屋陆续入住。连接榜鹅、盛港、实龙岗与多美歌。', anchors: [anchor('榜鹅', 1.4053, 103.9023, 3), anchor('盛港', 1.3917, 103.8954, 3), anchor('实龙岗', 1.3498, 103.8727, 3), anchor('多美歌', 1.2996, 103.8456, 3)] },
      { id: 'sg8', appear: [1998, 6], deadline: [2008, 12], type: 'connect', reward: 60000, title: '第二通道接上西部', desc: '第二通道开通后，大士的跨境通勤快速增加。修到大士接驳口，再和文礼、裕廊东接到同一张线网。', anchors: [anchor('大士接驳口', 1.3481, 103.6366, 1.2), anchor('文礼', 1.3386, 103.7061, 3), anchor('裕廊东', 1.3331, 103.7423, 3)] },
      { id: 'sg9', appear: [2002, 1], deadline: [2010, 4], type: 'connect', reward: 70000, title: '滨海湾接入线网', desc: '滨海湾的金融区和度假村正在兴建。连接海湾舫、滨海湾与莱佛士坊。', anchors: [anchor('海湾舫', 1.2826, 103.8597, 3), anchor('滨海湾', 1.2755, 103.8553, 3), anchor('莱佛士坊', 1.2835, 103.8518, 3)] },
      { id: 'sg10', appear: [2004, 1], deadline: [2011, 3], type: 'connect', reward: 60000, title: '通往圣淘沙', desc: '名胜世界开业前，连接名胜世界、港湾与欧南园，岛上只能建地下车站。', anchors: [anchor('名胜世界', 1.2555, 103.8224, 1.1), anchor('港湾', 1.2653, 103.8215, 3), anchor('欧南园', 1.2803, 103.8395, 3)] },
      { id: 'sg11', appear: [2006, 1], deadline: [2014, 12], type: 'connect', reward: 70000, title: '外环不进市中心', desc: '放射线都挤在市中心。连接波那维斯达、碧山和巴耶利峇，让跨区通勤不必进城换乘。', anchors: [anchor('波那维斯达', 1.3072, 103.7900, 3), anchor('碧山', 1.3510, 103.8490, 3), anchor('巴耶利峇', 1.3175, 103.8927, 3)] },
      { id: 'sg12', appear: [2010, 1], deadline: [2019, 12], type: 'connect', reward: 70000, title: '裕廊湖区对外连接', desc: '第二中央商务区需要南北方向的线路。连接裕廊东、武吉巴督与蔡厝港。', anchors: [anchor('裕廊东', 1.3331, 103.7423, 3), anchor('武吉巴督', 1.3490, 103.7497, 3), anchor('蔡厝港', 1.3853, 103.7443, 3)] },
      { id: 'sg13', appear: [2014, 1], deadline: [2022, 12], type: 'connect', reward: 80000, title: '北部快线', desc: '兀兰的区域中心和跨境客流都在增长，连接兀兰、宏茂桥与莱佛士坊。', anchors: [anchor('兀兰', 1.4370, 103.7869, 3), anchor('宏茂桥', 1.3700, 103.8495, 3), anchor('莱佛士坊', 1.2835, 103.8518, 3)] },
    ],
    dynTasks: [
      { id: 'sgd1', from: [1988, 1], to: [2005, 12], type: 'connect', months: 36, reward: 40000, title: '裕廊工业区上班路', desc: '裕廊西的居民大多在工业区上班。连接裕廊西、文礼与裕廊东。', anchors: [anchor('裕廊西', 1.3492, 103.7083, 4), anchor('文礼', 1.3386, 103.7061, 3), anchor('裕廊东', 1.3331, 103.7423, 3)] },
      { id: 'sgd2', from: [1992, 1], to: [2012, 12], type: 'connect', months: 36, reward: 40000, title: '后港进城', desc: '后港和实龙岗的人口持续增长。连接后港、实龙岗与小印度。', anchors: [anchor('后港', 1.3708, 103.8912, 3), anchor('实龙岗', 1.3498, 103.8727, 3), anchor('小印度', 1.3066, 103.8491, 3)] },
      { id: 'sgd3', from: [2000, 1], to: [2020, 12], type: 'connect', months: 36, reward: 40000, title: '科技走廊', desc: '纬壹科技城和国大一带的岗位快速增加。连接纬壹、肯特岗与港湾。', anchors: [anchor('纬壹', 1.2998, 103.7873, 3), anchor('肯特岗', 1.2935, 103.7845, 3), anchor('港湾', 1.2653, 103.8215, 3)] },
      { id: 'sgd4', from: [2008, 1], to: [2024, 12], type: 'connect', months: 36, reward: 40000, title: '东部商业园', desc: '樟宜商业园的岗位越来越多。连接博览、淡滨尼与勿洛。', anchors: [anchor('博览', 1.3351, 103.9627, 3), anchor('淡滨尼', 1.3542, 103.9441, 3), anchor('勿洛', 1.3240, 103.9300, 3)] },
    ],
    taskNote: '历史主题任务参考新加坡 1980 年起的发展需求（新镇进城、裕廊工业区、长堤与第二通道、机场、滨海湾、圣淘沙），不要求按真实线路走向建设，只需满足目标描述。',
    // 城市策略难题（可选挑战）
    scenarios: [
      { id: 'sg-sc1', theme: '新加坡：跨境通勤', title: '把长堤接到宏茂桥', type: 'budgetConnect', from: [1990, 1], to: [2006, 12], months: 60, rewardMonths: 3, budgetX: 1.2,
        anchors: [['兀兰', 3], ['义顺', 3], ['宏茂桥', 3]],
        desc: '跨境通勤者每天从兀兰进来，北部却没有直达市区的线路。用有限的预算修出这条南北走廊。',
        tips: ['北段可以走高架，比地下便宜得多', '绕开中央集水区，别把钱花在穿山上', '先修到义顺，再分段延伸到接驳口'] },
      { id: 'sg-sc2', theme: '新加坡：填海新城', title: '让滨海湾用上地铁', type: 'regionCov', from: [2005, 1], to: [2018, 12], months: 48, rewardMonths: 3,
        regions: ['marina_bay', 'marina_south'], areaName: '滨海湾与滨海南', target: 0.5,
        desc: '滨海湾的写字楼和度假村越来越多，地铁却还集中在老金融区。让这里一半以上的人步行就能到地铁站。',
        tips: ['打开「地铁覆盖」图层，看新填海区哪里是空白', '从莱佛士坊延伸过来，比另起一条新线便宜', '海湾南侧的客流主要在周末'] },
    ],
    dataNote: [
      ['真实地理', 'hist', '水系、道路与桥隧、铁路、公园与林地、规划区边界与地名来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），为现代数据，按 250 m 网格投影。海岸线由规划区边界还原，乌敏岛和德光岛的轮廓为近似。'],
      ['史实参考', 'hist', '填海工程的年代、樟宜机场跑道与航站楼、长堤与第二通道、新镇与概念规划、地标落成年份。'],
      ['估算', 'est', '填海范围和裕廊岛原有小岛（对照现代海岸画出的近似范围）、1980 年人口与就业分布、人口增长曲线、跨境客流、出行率、时间价值、造价、票价与运营费用。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。柔佛不做成地图，跨境出行只在接驳口生成；境内暂不开放的用地按年份开放（多为模拟年份），开放前没有人口、岗位和出行，也不显示设施；真实的新加坡地铁不会自动出现。'],
      ['', '', '模拟结果不得作为真实新加坡交通规划预测。'],
    ],
    // 线路配色参考新加坡地铁
    lineColorsNice: ['#d42e12', '#009645', '#9900aa', '#fa9e0d', '#005ec4', '#9d5b25', '#0099aa', '#748477', '#e60073', '#2dccd3', '#7a8b3c', '#b5651d'],
    reclaim: reclaim,
  };

  data.places = (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; });
  // 地铁站的坐标以 OSM 为准：任务锚点和同名设施对齐到最近的同名车站
  const ST = {}; for (const p of data.places) if (p[3] <= 1 && !ST[p[0]]) ST[p[0]] = p;
  const nearSt = function (name, x, y) { const p = ST[name.replace(/（.*?）/g, '')]; return p && Math.hypot(p[1] - x, p[2] - y) < 12 ? p : null; };
  for (const t of data.histTasks.concat(data.dynTasks)) for (const a of t.anchors || []) { const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }

  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'sg', name: '新加坡', title: '新加坡 · 1980', sub: '真实地理 · 1980 年起 · 新加坡元',
    desc: '从 1980 年尚无地铁的新加坡开始：岗位集中在莱佛士坊和裕廊工业区，人们住进一座座组屋新镇。海面按年份变成滨海湾和裕廊岛，柔佛的通勤者每天从兀兰和大士过境。',
    facts: [['范围', '55 km × 31 km'], ['起始', '1980 年'], ['人口', '约 241 万'], ['货币', '新加坡元'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 1, scenario: 'sg-1980',
    region: '新加坡', tagline: '组屋新镇，填海成城', difficulty: 3, tags: ['无地铁开局', '填海造地', '跨境通勤'],
    intro: '1980 年的新加坡还没有地铁。岗位集中在莱佛士坊、丹戎巴葛港和裕廊工业区，人们住进大巴窑、宏茂桥和勿洛这样的组屋新镇，每天靠巴士通勤。接下来四十年，滨海湾和裕廊岛从海上长出来，淡滨尼、兀兰、榜鹅相继成形，柔佛的通勤者每天从长堤过境。你要从第一条线开始，把这座岛连起来。',
    features: [['plane', '机场搬迁', '1981 年民航从巴耶利峇迁到樟宜，航站楼按真实年份启用'], ['tree', '圣淘沙与乌敏岛', '圣淘沙的景点可以建地下车站；乌敏岛完整保留，不能设站']],
    highlights: [[1981, '樟宜机场启用'], [1987, '第一段地铁通车'], [1998, '大士第二通道通车'], [2000, '裕廊岛正式开放'], [2010, '滨海湾金沙开业']],
    geo: G, data: data,
    econ: { devOffset: 22, money: 0.3 },   // 出行选择参数：新加坡 1980 年约对应广州样本 2002 年的发展阶段；时间价值等按新加坡元换算
    cfg: {
      W: 220, H: 124, START: { y: 1980, m: 1, d: 1, minute: 360 },
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[1980, 2.41e6], [1985, 2.74e6], [1990, 3.05e6], [1995, 3.52e6], [2000, 4.03e6], [2005, 4.27e6], [2010, 5.08e6], [2015, 5.54e6], [2020, 5.69e6], [2030, 6.2e6], [2050, 6.7e6], [2300, 7e6]], histEnd: 2020, jobsRatio: [[1980, 0.45], [1990, 0.51], [2000, 0.53], [2010, 0.61], [2020, 0.63], [2040, 0.62]] }),
      // 工作周：私营企业长期五天半，公共部门 2004 年起五天（史实）；比例为估算
      workWeek: { sat: [[1980, 0.85], [2003.9, 0.55], [2004.1, 0.3], [2020, 0.15]], school: [[1980, 0]] },
      money: { code: 'SGD', unit: '新元', wan: '万新元', yi: '亿新元', sym: 'S$' },
      econBase: 1980,
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 7000, surface: 1400, elevated: 2800 },   // 估算：首期地铁约 50 亿新元、67 公里（约 20 公里地下），含车站约 7,500 万新元/公里
        riverPerKm: { underground: 5000, surface: 4000, elevated: 4000 },   // 跨海隧道与桥梁附加
        hillPerKm: 2500, protectedPerKm: 2000,
        station: { underground: { S: 5000, M: 8000, L: 12500 }, elevated: { S: 2600, M: 4200, L: 6500 }, surface: { S: 1600, M: 2600, L: 4000 } },
        demolishPerCell: 12000,
        inflation: [[1980, 0.06], [1985, 0.02], [1990, 0.05], [1998, 0], [2004, 0.06], [2012, 0.04], [2020, 0.03]],
      }),
      ops: Object.assign({}, CM.CFG.ops, { carKmCost: 0.0004, stationDaily: { S: 0.5, M: 0.9, L: 1.6 }, inflation: [[1980, 0.04], [2000, 0.02], [2020, 0.025]] }),
      fareDefault: { mode: 'flat', flat: 0.5 }, fareRange: { min: 0, max: 3, step: 0.05, scale: true },
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 120000, grantBase: [[1980, 7000], [1985, 10000], [1990, 14000], [2000, 24000], [2010, 46000], [2020, 70000], [2050, 115000]], debtLimit: -100000, rewardScale: 0.47 }),
      // 城市经济（macro.js）：1980 年全国 GDP 约 259 亿新元；外贸、炼油和转口比重高，后来金融和生物医药成为主要动力
      macro: {
        area: '地图范围（新加坡全国）', region: '新加坡',
        gdp0: 2590000, revRatio: [[1980, 0.2], [2000, 0.18], [2020, 0.16], [2040, 0.16]], revElastic: 1.2,
        prod: [[1980, 0.05], [1990, 0.05], [2000, 0.035], [2010, 0.03], [2020, 0.02], [2030, 0.015], [2050, 0.012]],
        infl: [[1980, 0.085], [1981, 0.082], [1982, 0.039], [1983, 0.012], [1984, 0.026], [1985, 0.005], [1986, -0.014], [1987, 0.005], [1988, 0.015], [1989, 0.024], [1990, 0.034], [1991, 0.034], [1992, 0.023], [1993, 0.023], [1994, 0.031], [1995, 0.017], [1996, 0.014], [1997, 0.02], [1998, -0.003], [1999, 0], [2000, 0.013], [2001, 0.01], [2002, -0.004], [2003, 0.005], [2004, 0.017], [2005, 0.005], [2006, 0.01], [2007, 0.021], [2008, 0.066], [2009, 0.006], [2010, 0.028], [2011, 0.052], [2012, 0.046], [2013, 0.024], [2014, 0.01], [2015, -0.005], [2016, -0.005], [2017, 0.006], [2018, 0.004], [2019, 0.006], [2020, -0.002]],
        longRun: { infl: 0.02 }, histEnd: 2020,
        struct: { trade: 0.95, fin: 0.7, ind: 0.6, tour: 0.45, prop: 0.5 },
        events: [
          { id: 'crash1987', y: 1987, m: 10 },
          { id: 'asia1997', y: 1997, m: 7, desc: '金融危机席卷东南亚，新加坡元贬值，出口和地产同时受挫，1998 年经济出现衰退。' },
          { id: 'dotcom2001', y: 2001, m: 3, scale: 1.3, desc: '全球电子需求骤降，占新加坡制造业很大比重的电子业首当其冲。' },
          { id: 'sars2003', y: 2003, m: 3, fx: { demand: { sc: 0.8, sh: 0.8, lz: 0.6, hub: 0.5, months: 3, fade: 1 } } },
          { id: 'gfc2008', y: 2008, m: 9, scale: 1.2 },
          { id: 'covid2020', y: 2020, m: 2, scale: 0.8, fx: { demand: { sc: 0.7, sh: 0.8, lz: 0.6, hub: 0.3, months: 3, fade: 1 } } },
        ],
      },
    },
    cam: { cx: 113, cy: 84, zoom: 15 },
  });
})(window.CM);
