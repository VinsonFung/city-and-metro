'use strict';
// 各城任务的复合条件（economy.js 的 Tasks.withPlan 按任务编号套用）：原任务的目标成为主体，这里再加上这座城市真正要考核的东西。
// base：把主体换成更严格的判定（如 direct：同一条线直达）；avoid：[地点, 半径（格）] 连通时不能经过这一带；
// parts：附加条件，kind 分网络形态 net、覆盖范围 reach、运营结果 ops、成本收益 fin、发展效果 dev；
// at：地点名（任务锚点、地名表或其他任务的同名锚点）。只影响之后发布的任务，已发布的任务保持原样。
(function (CM) {
  const part = function (kind, type, o) { return Object.assign({ kind: kind, type: type }, o); };
  // 网络形态
  const hub = function (at, lines) { return part('net', 'hub', { at: at, lines: lines }); };
  const cross = function (target, minM, label) { return part('net', 'cross', { target: target, minM: minM, label: label }); };
  const km = function (seg, target) { return part('net', 'typeKm', { seg: seg, target: target }); };
  const spaceMax = function (max) { return part('net', 'spacing', { max: max }); };
  const spaceMin = function (min) { return part('net', 'spacing', { min: min }); };
  const areaSpace = function (regions, areaName, max) { return part('net', 'spacing', { regions: regions, areaName: areaName, max: max }); };
  const speed = function (kmh) { return part('net', 'lineSpeed', { kmh: kmh }); };
  const cars = function (min) { return part('net', 'lineTrain', { min: min }); };
  const carsMax = function (max) { return part('net', 'lineTrain', { max: max }); };
  const noSt = function (regions, areaName) { return part('net', 'noStation', { regions: regions, areaName: areaName }); };
  const coTrack = function (target) { return part('net', 'coTrack', { target: target }); };
  const hubs = function (target) { return part('net', 'xferHub', { target: target }); };
  // 覆盖范围
  const regCov = function (regions, areaName, target) { return part('reach', 'regionCov', { regions: regions, areaName: areaName, target: target }); };
  // 运营结果
  const fac = function (id, target) { return part('ops', 'facShare', { fac: id, target: target }); };
  // 相对目标：比任务发布时提高 gain（分担率）或缩短 drop（通勤），在哪个年代、什么局面下都合理
  const share = function (gain) { return part('ops', 'share', { gain: gain }); };
  const riders = function (perKm) { return part('ops', 'lineRiders', { perKm: perKm }); };
  const load = function (target) { return part('ops', 'lineLoad', { target: target }); };
  const netLoad = function (target) { return part('ops', 'netLoad', { target: target }); };
  const regShare = function (regions, areaName, gain) { return part('ops', 'regionShare', { regions: regions, areaName: areaName, gain: gain }); };
  const commute = function (regions, areaName, drop) { return part('ops', 'regionCommute', { regions: regions, areaName: areaName, drop: drop }); };
  const xferOut = function (regions, areaName, target) { return part('ops', 'xferShare', { regions: regions, areaName: areaName, target: target }); };
  // 成本收益
  const cost = function (x) { return part('fin', 'lineCost', { x: x }); };
  const recov = function (target) { return part('fin', 'recovery', { target: target }); };
  const tod = function (regions, areaName, stations) { return part('fin', 'todNet', { regions: regions, areaName: areaName, stations: stations }); };
  // 发展效果
  const pull = function (regions, areaName, target) { return part('dev', 'regionPull', { regions: regions, areaName: areaName, target: target }); };

  CM.TaskPlans = {
    // 广州：老城与天河双中心、跨珠江、大学城、亚运
    gz: {
      h1: { base: 'direct', parts: [riders(10000)] },
      h2: { base: 'direct', parts: [cross(1, 100, '跨珠江轨道')] },
      h3: { parts: [regCov(['panyu_n'], '番禺', 0.08)] },
      h4: { parts: [fac('gz_unicity', 0.15)] },
      h5: { parts: [fac('gz_thty', 0.12), netLoad(1.2)] },
      h6: { parts: [hub('广州火车站一带', 2)] },
      h7: { parts: [fac('gz_tower', 0.12)] },
      'gz-sc1': { parts: [riders(8000)] },
      'gz-sc2': { parts: [regCov(['panyu_n'], '番禺', 0.1)] },
      'gz-g1': { base: 'direct' },
      'gz-g2': { parts: [cross(2, 100, '跨珠江轨道')] },
      'gz-g3': { parts: [hub('珠江新城', 2)] },
      'gz-g4': { parts: [commute(['panyu_n'], '番禺', 0.08)] },
      'gz-g5': { parts: [fac('gz_pzhz', 0.15)] },
      'gz-g6': { parts: [pull(['luogang'], '萝岗·科学城', 1)] },
      'gz-g7': { parts: [fac('gz_south', 0.2)] },
    },
    // 深圳：东西走廊、就业中心西移、机场与高铁枢纽、填海新城
    sz: {
      sz1: { base: 'direct', parts: [riders(10000)] },
      sz2: { parts: [fac('sz_ftport', 0.15)] },
      sz3: { base: 'direct', parts: [fac('sz_keji', 0.12)] },
      sz4: { parts: [fac('sz_t12', 0.1)] },
      sz5: { parts: [fac('sz_uni', 0.12), netLoad(1.2)] },
      sz7: { parts: [hub('深圳北站', 2), fac('sz_north', 0.2)] },
      sz8: { parts: [regCov(['qianhai', 'houhai'], '前海与后海', 0.2)] },
      sz9: { parts: [fac('sz_bantian', 0.15)] },
      sz10: { parts: [speed(90), fac('sz_t3', 0.15)] },
      sz11: { parts: [regCov(['guangming'], '光明', 0.15)] },
      'sz-g2': { base: 'direct' },
      'sz-g3': { parts: [fac('sz_keji', 0.2)] },
      'sz-g4': { parts: [fac('sz_qh', 0.2)] },
      'sz-sc1': { parts: [riders(8000)] },
    },
    // 杭州：不碰西湖、跨钱塘江、新城东进
    hz: {
      hz1: { base: 'direct', parts: [cross(1, 500, '跨钱塘江轨道'), noSt(['westlake'], '西湖风景名胜区')] },
      hz2: { parts: [regCov(['xiaoshan'], '萧山', 0.2)] },
      hz3: { parts: [fac('hz_xiasha', 0.12)] },
      hz4: { parts: [fac('hz_zjg', 0.12)] },
      hz5: { parts: [hub('杭州东站', 2), fac('hz_east', 0.2)] },
      hz6: { parts: [noSt(['westlake'], '西湖风景名胜区'), fac('hz_hubin', 0.15)] },
      hz7: { parts: [fac('hz_olympic', 0.12)] },
      'hz-sc1': { parts: [noSt(['westlake'], '西湖风景名胜区')] },
      'hz-sc2': { parts: [pull(['qjxc', 'binjiang'], '钱江新城与滨江', 2)] },
      'hz-g1': { base: 'direct' },
      'hz-g2': { parts: [commute(['weilai'], '未来科技城', 0.08)] },
      'hz-g3': { parts: [cross(2, 500, '跨钱塘江轨道')] },
      'hz-g4': { parts: [hub('杭州东站', 2)] },
    },
    // 武汉：高架开篇、两江三镇、光谷
    wh: {
      wh1: { parts: [km('elevated', 6), cost(0.85)] },
      wh2: { base: 'direct', parts: [cross(1, 500, '跨长江轨道')] },
      wh3: { parts: [fac('wh_station', 0.2)] },
      wh4: { parts: [cross(2, 100, '跨江轨道')] },
      wh5: { parts: [regCov(['hankou'], '汉口老城', 0.35), regCov(['hanyang'], '汉阳', 0.25), regCov(['wuchang'], '武昌', 0.3)], desc: '2016 年底前，步行 15 分钟可到达地铁站的人口不低于全市人口的 30%，而且汉口、汉阳、武昌三镇都要覆盖到，不能只顾一处。' },
      wh6: { parts: [fac('wh_sports', 0.12)] },
      wh7: { parts: [cross(4, 300, '跨江轨道')] },
      whd1: { parts: [cross(1, 500, '跨长江轨道')] },
      whd2: { parts: [fac('wh_hust', 0.15)] },
      whd3: { parts: [commute(['houhu'], '后湖', 0.08)] },
      'wh-sc1': { parts: [cross(2, 300, '跨江轨道')] },
      'wh-sc2': { parts: [commute(['guanggu'], '光谷', 0.08)] },
      'wh-g1': { parts: [commute(['zhuankou'], '沌口', 0.08)] },
      'wh-g2': { parts: [pull(['airport'], '王家墩商务区', 1)] },
      'wh-g3': { parts: [cross(1, 100, '跨江轨道')] },
    },
    // 香港：铁路加物业、新市镇、高分担率、不靠补贴
    hk: {
      hk1: { base: 'direct', parts: [cross(1, 500, '跨海轨道'), cars(8)] },
      hk2: { parts: [regShare(['kt'], '观塘区', 0.04)] },
      hk3: { parts: [regCov(['tw'], '荃湾新市镇', 0.3), tod(['tw', 'kwt'], '荃湾与葵青', 1)] },
      hk4: { base: 'direct', parts: [regCov(['central', 'wanchai', 'eastern'], '港岛北岸', 0.5)] },
      hk5: { parts: [regCov(['st'], '沙田新市镇', 0.3), tod(['st'], '沙田新市镇', 1)], desc: '连接沙田与九龙塘，穿越狮子山时可以建设山体隧道。铁路要带动新市镇：沙田的人步行能到车站，站城商业也要赚钱。' },
      hk6: { parts: [recov(0.75)], sustain: 3, desc: '回归前，步行 15 分钟可到达地铁站的人口不低于全市人口的 50%，经营也要站得住：票款加车站商业连续 3 个月达到运营费用的 75%。' },
      hk7: { parts: [regCov(['tko'], '将军澳新市镇', 0.3), tod(['tko'], '将军澳新市镇', 1)] },
      'hk-sc1': { parts: [cars(8)] },
      'hk-sc2': { parts: [tod(['tw', 'st'], '荃湾与沙田', 2)], desc: '新市镇隔着山与市区相望，人口快速增长，进城只能挤公路与隧道。铁路加物业是香港的办法：让荃湾、沙田接近一半的居民步行就能到地铁站，并在新市镇开发站城商业，形成正收益。', tips: ['穿山隧道很贵：一条线只穿一次山', '新市镇内部站点放在屋邨最集中的地方', '客流大的新市镇车站先做商业开发，收益才能转正'] },
      'hk-g1': { parts: [regCov(['tm'], '屯门新市镇', 0.3)] },
      'hk-g2': { parts: [regCov(['yl'], '元朗·天水围', 0.3)] },
      'hk-g3': { parts: [fac('hk_disney', 0.2)] },
      'hk-g4': { parts: [fac('hk_kle', 0.15), pull(['airport'], '启德发展区', 1)] },
    },
    // 台北：盆地三河、高架中运量、织网换乘、不经台北车站
    tp: {
      tp1: { base: 'direct', parts: [riders(15000)] },
      tp2: { base: 'direct', parts: [km('elevated', 5), carsMax(4)], desc: '连接木栅、东区与松山机场航站楼一侧。这是一条高架中运量线路：列车不超过 4 节，小半径穿过城区。机场照常运营，范围内只能地下设站或地下穿越。' },
      tp3: { base: 'direct', parts: [cross(1, 100, '跨淡水河轨道')] },
      tp4: { parts: [hub('忠孝复兴', 2), fac('tp_xinyi_shop', 0.15)] },
      tp5: { parts: [cross(1, 100, '跨淡水河轨道'), regCov(['sanchong'], '三重·芦洲', 0.3)] },
      tp6: { parts: [cross(1, 50, '跨新店溪轨道'), regCov(['zhongyong'], '中和·永和', 0.3)] },
      tp7: { parts: [fac('tp_nhsp', 0.12)] },
      tp8: { parts: [hub('台北车站', 2), fac('tp_station', 0.25)] },
      tp9: { parts: [share(0.02)] },
      tpd1: { parts: [cross(1, 100, '跨淡水河轨道')] },
      tpd2: { parts: [regCov(['xindian'], '新店', 0.3)] },
      tpd3: { parts: [fac('tp_nangang', 0.15)] },
      tpd4: { avoid: ['台北车站', 8] },
      'tp-sc1': { parts: [hub('台北车站', 2), xferOut(['zhongzheng'], '台北车站一带', 0.5)], desc: '台北盆地被淡水河、基隆河与新店溪环绕，人口都挤在盆地里，走廊多而短。一条长线覆盖不了，要靠几条线交织、互相换乘：建成 4 座换乘站，而且换乘客流不能都压在台北车站。' },
      'tp-sc2': { parts: [cross(1, 100, '跨淡水河轨道')] },
      'tp-g1': { parts: [km(['elevated', 'surface'], 5)] },
      'tp-g2': { parts: [pull(['newland'], '基隆河新生地', 1)] },
      'tp-g3': { parts: [regCov(['xizhi'], '汐止', 0.25)] },
      'tp-g4': { parts: [regCov(['linkou'], '林口·龟山', 0.2)] },
    },
    // 巴黎：五百米一站、塞纳河、快线与长站距、大巴黎不经市中心
    pa: {
      pa1: { base: 'direct', parts: [spaceMax(800)] },
      pa2: { parts: [km('elevated', 1.5), spaceMax(800)], desc: '沿旧包税人城墙的林荫大道，连接星形广场、克利希广场、巴尔贝斯、斯大林格勒与民族广场。这段地势起伏，可以像当年一样修成高架。' },
      pa3: { base: 'direct', parts: [cross(1, 50, '跨塞纳河轨道'), spaceMax(800)] },
      pa4: { parts: [hub('协和', 2)] },
      pa5: { parts: [areaSpace(['centre', 'grandsbd'], '中心区与右岸', 700)] },
      pa6: { parts: [regCov(['sudouest', 'estproche'], '近郊', 0.2)] },
      pa7: { parts: [hub('歌剧院', 2)] },
      pa8: { parts: [share(0.03)] },
      pa9: { base: 'direct', parts: [spaceMin(1500)], desc: '新商务区需要快速、长站距的东西向干线：由同一条线连接拉德芳斯、星形广场、奥柏与民族广场，平均站距不少于 1.5 km。' },
      pa10: { parts: [netLoad(1.1)] },
      pa11: { base: 'direct', parts: [fac('pa_prg', 0.15)] },
      pa12: { parts: [fac('pa_sdf', 0.2)] },
      pa13: { avoid: ['沙特莱', 14], parts: [spaceMin(1200)] },
      pad1: { parts: [hub('北站', 2)] },
      pad2: { parts: [regCov(['nordind'], '北郊工业带', 0.25)] },
      pad4: { parts: [fac('pa_villette', 0.12)] },
      pad5: { avoid: ['沙特莱', 14] },
      'pa-sc1': { parts: [areaSpace(['centre', 'grandsbd', 'rivegauche', 'faubourgs'], '巴黎老城', 700)] },
      'pa-sc2': { parts: [spaceMin(1800)] },
      'pa-g2': { parts: [regCov(['sarcelles'], '萨塞勒', 0.2)] },
    },
    // 上海：超大客流、越江、高架环线、世博与虹桥枢纽
    sh: {
      sh1: { base: 'direct', parts: [riders(15000)] },
      sh2: { base: 'direct', parts: [cross(1, 200, '跨黄浦江轨道')] },
      sh3: { parts: [km('elevated', 10)] },
      sh4: { parts: [netLoad(1.3)] },
      sh5: { parts: [fac('sh_expo2010', 0.25), hub('人民广场', 3)] },
      sh6: { parts: [regCov(['yangpu'], '杨浦', 0.3)] },
      sh7: { parts: [hub('虹桥站', 2), fac('sh_hqstation', 0.25)] },
      sh8: { parts: [netLoad(1.2)] },
      sh9: { avoid: ['陆家嘴', 8], parts: [regCov(['jinqiao'], '金桥·张江', 0.3)] },
      sh10: { parts: [fac('sh_disney', 0.15)] },
      shd1: { parts: [cross(2, 200, '跨黄浦江轨道')] },
      shd2: { parts: [fac('sh_gubei', 0.15)] },
      shd3: { parts: [commute(['dachang'], '大场·顾村', 0.08)] },
      'sh-sc1': { parts: [cross(1, 200, '跨黄浦江轨道')] },
      'sh-g1': { parts: [fac('sh_zj', 0.15)] },
      'sh-g2': { parts: [fac('sh_south', 0.2)] },
      'sh-g3': { base: 'direct' },
      'sh-g4': { base: 'direct' },
    },
    // 北京：长安街、环线串放射、城铁、奥运与机场、摊大饼的北部
    bj: {
      bj1: { base: 'direct', parts: [hub('西单', 2)] },
      bj2: { parts: [km(['elevated', 'surface'], 12), cost(0.9)], desc: '回龙观、上地与望京的居民需要进城。连接西直门、五道口、上地、回龙观与东直门。北部空地多，可以像城市铁路那样走地面和高架，把造价压下来。' },
      bj3: { parts: [km(['elevated', 'surface'], 6), regCov(['tongzhou'], '通州', 0.15)] },
      bj4: { base: 'direct', parts: [load(1.2)] },
      bj5: { parts: [fac('bj_olypark', 0.15)] },
      bj6: { base: 'direct', parts: [speed(100), fac('bj_pek', 0.15)] },
      bj7: { parts: [hub('北京南站', 2), fac('bj_south', 0.2)] },
      bj8: { parts: [xferOut(['jiucheng'], '旧城', 0.75)] },
      bj9: { parts: [netLoad(1.2)] },
      bjd1: { parts: [load(1.2)] },
      bjd2: { parts: [commute(['wangjing'], '望京', 0.08)] },
      bjd3: { parts: [fac('bj_sd', 0.15)] },
      'bj-sc1': { parts: [commute(['changping'], '回龙观与天通苑', 0.08)] },
      'bj-sc2': { base: 'loop', baseProps: { at: '王府井', label: '旧城', minKm: 35, minRadials: 4 }, parts: [hubs(12), xferOut(['jiucheng'], '旧城', 0.6)],
        desc: '北京的道路是一环套一环，地铁也需要环线把放射线串起来，乘客不必都挤进旧城换乘。修一条环绕旧城、35 km 以上的大环线，与至少 4 条放射线换乘（一头在环内、一头在环外），全网 12 座以上换乘站，旧城的换乘客流降到六成以下。',
        tips: ['在三环、四环附近再修一条环线，比开局的 2 号线大一圈', '环线与每条放射线都相交换乘', '换乘站建成大型站，留足换乘能力'] },
      'bj-g1': { parts: [commute(['changping'], '回龙观与天通苑', 0.08)] },
      'bj-g2': { parts: [commute(['tongzhou'], '通州', 0.08)] },
      'bj-g3': { parts: [pull(['daxing'], '亦庄·大兴', 1)] },
      'bj-g4': { parts: [fac('bj_fzx', 0.15)] },
    },
    // 伦敦：过河、郊区化、战后重建、码头区
    ld: {
      ld01: { base: 'direct', parts: [riders(4000), recov(0.6)] },
      ld02: { parts: [km(['surface', 'elevated'], 3), cost(1)] },
      ld03: { base: 'direct', parts: [areaSpace(['westend', 'citylondon'], '历史城区', 1000)] },
      ld04: { base: 'direct', parts: [cross(1, 100, '过河隧道')] },
      ld05: { base: 'loop', baseProps: { at: '大波特兰街', label: '市中心', minKm: 18, minRadials: 1 }, parts: [hubs(4)],
        desc: '两条线的尽头相隔不远，两家公司却互不相让。把线路连成一个绕过市中心、18 km 以上的环，至少串起 1 条放射线，全网有 4 座以上换乘站。',
        tips: ['环的北边沿尤斯顿路，南边沿泰晤士河', '历史城区只能走地下，要留足造价', '环上多留换乘站，后面的线路都要接进来'] },
      ld06: { parts: [regCov(['eastend'], '东区', 0.25)] },
      ld07: { base: 'direct', parts: [cross(1, 100, '过河隧道'), load(1.3)] },
      ld08: { base: 'direct', parts: [cross(1, 100, '过河隧道'), fac('ld_wat', 0.1)] },
      ld1: { base: 'direct', parts: [hub('银行', 2), riders(6000)] },
      ld2: { base: 'direct', parts: [cross(1, 100, '过河隧道')] },
      ld3: { base: 'direct', parts: [hub('国王十字-圣潘克拉斯', 2)] },
      ld4: { parts: [pull(['barnet'], '巴尼特·亨登', 0.8)] },
      ld5: { parts: [areaSpace(['westend', 'citylondon'], '历史城区', 900)] },
      ld6: { base: 'direct', parts: [cross(1, 100, '过河隧道'), regCov(['merton'], '温布尔登·默顿', 0.2)] },
      ld7: { parts: [km(['surface', 'elevated'], 4), pull(['enfield'], '恩菲尔德', 0.6)] },
      ld8: { base: 'direct', parts: [cost(1.1)] },
      ld9: { parts: [regCov(['eastend'], '东区', 0.5), recov(0.7)] },
      ld10: { base: 'direct', parts: [hub('国王十字-圣潘克拉斯', 3), load(1.2)] },
      ld11: { base: 'direct', parts: [fac('ld_lhr', 0.12)] },
      ld12: { parts: [km(['elevated', 'surface'], 5), cost(0.8), pull(['isledogs'], '狗岛', 0.6)] },
      ld13: { base: 'direct', parts: [cross(3, 100, '过河隧道'), fac('ld_cw', 0.2)] },
      ld14: { parts: [xferOut(['citylondon', 'westend'], '历史城区', 0.8)] },
      ld15: { parts: [fac('ld_oly', 0.15), regCov(['stratford'], '斯特拉特福·利河谷', 0.5)] },
      ld16: { base: 'direct', parts: [speed(100), cars(8), load(1.1)] },
      ldd1: { parts: [hubs(8)] },
      ldd2: { parts: [km(['surface', 'elevated'], 6), pull(['metroland'], '大都会乡土', 0.6)] },
      ldd3: { parts: [fac('ld_parkroyal', 0.12)] },
      ldd4: { parts: [cost(1)] },
      ldd5: { parts: [xferOut(['citylondon'], '伦敦城', 0.85)] },
      'ld-sc1': { parts: [cross(3, 100, '过河隧道')] },
      'ld-sc2': { parts: [km(['elevated', 'surface'], 4)] },
      'ld-g1': { parts: [fac('ld_cw', 0.15)] },
      'ld-g2': { parts: [regShare(['stratford'], '斯特拉特福', 0.05)] },
    },
    // 东京：通勤地狱、副都心、直通运转、跨湾
    tk: {
      tk1: { base: 'direct', parts: [riders(8000)] },
      tk2: { parts: [hub('上野', 2)] },
      tk3: { base: 'direct', parts: [cross(1, 100, '跨隅田川轨道')] },
      tk4: { parts: [netLoad(1.6)] },
      tk5: { parts: [hub('新宿', 2), fac('tk_fukutoshin', 0.15)] },
      tk6: { parts: [cross(1, 300, '跨东京湾轨道'), fac('tk_odaiba', 0.15)] },
      tk7: { parts: [netLoad(1.3), coTrack(5)] },
      'tk-sc2': { avoid: ['东京站', 12], parts: [hub('新宿', 2)] },
      'tk-g1': { parts: [hub('北千住', 2)] },
      'tk-g2': { parts: [regCov(['yokohama'], '横滨北部', 0.15)] },
      'tk-g3': { parts: [regCov(['koto'], '江东', 0.35)] },
      'tk-g4': { parts: [cross(1, 300, '跨东京湾轨道')] },
    },
  };
})(window.CM);
