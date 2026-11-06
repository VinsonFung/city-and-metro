'use strict';
// 列车采购与运营（v2.5）：玩家按车型与编组购买整列列车，分配给线路的各个运营交路（支线单独、环线分两个方向），
// 每个时段（早高峰、平峰、晚高峰、夜间）投入的列车数决定发车频率。智能调度只调度已有列车，不够时低运力运行并提示购买；
// 手动模式由玩家设定每个时段投入几列。新线与延长按最低服务水平随线配车（计入建设费）；列车可调往其他线路，出售按残值回收。
// 车型按城市与年代开放：各城市有代表性的真实车型（参数为游戏化的近似值），另有各城市通用的虚构车型
(function (CM) {
  const U = CM.U, CFG = CM.CFG, h = U.h;
  const F = CM.Fleet = {};
  const PN = ['早高峰', '平峰', '晚高峰', '夜间'];
  F.PERIODS = PN;
  // ---------------- 车型 ----------------
  // cap：每节定员（人）；price：每节价格（万元，1990 年价格、按本城造价水平折算，购买时再乘当年造价指数）；
  // ops：车厢公里运营成本系数（同一年代常见的车型约 1.0，新车型更省）；life：设计寿命（年，超龄后运营成本 ×1.25）；max：最长编组；kmh：最高速度（只作说明）；
  // look：外观（年代式样、车身、色带、车顶、窗；'line' 表示用线路色）；maps：只在这些城市出售（空为通用车型）
  const LOOK = {
    wood: { era: 'early', body: '#5a2e24', band: 'line', roof: '#3a3634', win: '#f4d9a2' },
    green: { era: 'early', body: '#355e3b', band: '#9b2335', roof: '#2e3033', win: '#f4d9a2' },
    classicLine: { era: 'classic', body: 'line', band: '#efe6cc', roof: '#4d5257', win: '#fff3d6' },
    steel: { era: 'modern', body: '#c4ccd4', band: 'line', roof: '#9aa3ad', win: '#ffffff' },
    white: { era: 'modern', body: '#eef0ee', band: 'line', roof: '#b8c0c8', win: '#ffffff' },
    paint: { era: 'current', body: 'line', band: '#26303b', roof: 'line', win: '#ffffff' },
    whiteNew: { era: 'current', body: '#f2f4f6', band: 'line', roof: '#d5dbe2', win: '#ffffff' },
    future: { era: 'future', body: '#f1f4f7', band: 'line', roof: '#e3e8ee', win: '#d8f2ff' },
  };
  const M = function (o) { return Object.assign({ maps: null, max: 8, life: 30, kmh: 80 }, o, { look: Object.assign({}, LOOK[o.look] || LOOK.steel, o.lookX || {}) }); };
  const MODELS = F.MODELS = [
    // 通用车型（虚构）：各城市都能买，按年代更替
    M({ id: 'gen-early', name: '早期木质电动车', short: '木质车', from: 1900, to: 1938, cap: 170, price: 110, ops: 1.05, life: 35, max: 6, kmh: 50, look: 'wood', desc: '木质车身、通风顶，车厢小、运营费用高' }),
    M({ id: 'gen-classic', name: '战后钢制通勤车', short: '钢制车', from: 1936, to: 1974, cap: 220, price: 170, ops: 1.03, life: 32, max: 6, kmh: 70, look: 'classicLine', desc: '全钢车身、整车涂装' }),
    M({ id: 'gen-steel', name: '不锈钢 B 型车', short: 'B 型车', from: 1968, to: 2015, cap: 250, price: 300, ops: 1, kmh: 80, look: 'steel', desc: '车宽 2.8 m 的标准地铁车' }),
    M({ id: 'gen-a', name: '大运量 A 型车', short: 'A 型车', from: 1985, to: 9999, cap: 310, price: 420, ops: 0.96, kmh: 80, look: 'white', desc: '车宽 3 m、每节 5 对车门的大运量车' }),
    M({ id: 'gen-eco', name: '节能变频车', short: '节能车', from: 2008, to: 9999, cap: 300, price: 460, ops: 0.85, kmh: 100, look: 'paint', desc: '永磁电机与再生制动，运营费用低' }),
    M({ id: 'gen-auto', name: '全自动无人驾驶车', short: '无人驾驶车', from: 2025, to: 9999, cap: 320, price: 540, ops: 0.75, kmh: 120, look: 'future', desc: '无人驾驶、贯通客室，运营费用最低' }),
    // 广州
    M({ id: 'gz-a1', maps: ['gz'], name: '广州地铁 A1 型（西门子）', short: 'A1 型', from: 1995, to: 2004, cap: 310, price: 560, ops: 0.97, max: 6, look: 'white', desc: '1 号线引进车，白色车身配线路色带' }),
    M({ id: 'gz-l4', maps: ['gz'], name: '广州地铁直线电机 L4 型', short: 'L4 型', from: 2005, to: 2016, cap: 240, price: 420, ops: 0.93, max: 6, kmh: 90, look: 'paint', desc: '4、5 号线直线电机车，爬坡与过弯能力强' }),
    M({ id: 'gz-a8', maps: ['gz'], name: '广州地铁 A 型（国产 8 节）', short: '国产 A 型', from: 2010, to: 9999, cap: 310, price: 400, ops: 0.88, look: 'whiteNew', desc: '国产化 A 型车，可编 8 节' }),
    // 杭州
    M({ id: 'hz-b1', maps: ['hz'], name: '杭州地铁 B 型（1 号线）', short: '1 号线 B 型', from: 2010, to: 9999, cap: 250, price: 380, ops: 0.92, max: 6, look: 'whiteNew', desc: '杭州首批地铁车' }),
    M({ id: 'hz-a', maps: ['hz'], name: '杭州地铁 A 型', short: '杭州 A 型', from: 2017, to: 9999, cap: 310, price: 420, ops: 0.86, look: 'paint', desc: '后期线路的大运量车' }),
    // 武汉
    M({ id: 'wh-b1', maps: ['wh'], name: '武汉轨道交通 1 号线 B 型', short: '1 号线 B 型', from: 2003, to: 2014, cap: 250, price: 360, ops: 0.98, max: 6, look: 'steel', desc: '高架轻轨线的首批车辆' }),
    M({ id: 'wh-a', maps: ['wh'], name: '武汉地铁 A 型', short: '武汉 A 型', from: 2012, to: 9999, cap: 310, price: 410, ops: 0.88, look: 'whiteNew', desc: '大运量线路车型' }),
    // 香港
    M({ id: 'hk-m', maps: ['hk'], name: '港铁 M-Train（都城嘉慕）', short: 'M-Train', from: 1977, to: 1995, cap: 330, price: 520, ops: 1, life: 40, look: 'steel', lookX: { band: '#c8102e' }, desc: '修正早期系统的不锈钢车，红色色带' }),
    M({ id: 'hk-k', maps: ['hk'], name: '港铁 K-Stock（现代 Rotem）', short: 'K-Stock', from: 2001, to: 2012, cap: 330, price: 560, ops: 0.93, look: 'whiteNew', desc: '将军澳线与东涌线的新车' }),
    M({ id: 'hk-q', maps: ['hk'], name: '港铁 Q-Train（中车长客）', short: 'Q-Train', from: 2020, to: 9999, cap: 330, price: 520, ops: 0.84, look: 'paint', desc: '更新换代的新列车' }),
    // 台北
    M({ id: 'tp-c301', maps: ['tp'], name: '台北捷运 C301 型（川崎重工）', short: 'C301', from: 1994, to: 2004, cap: 290, price: 560, ops: 0.98, max: 6, look: 'steel', lookX: { band: '#1a5aa6' }, desc: '高运量系统首批车辆' }),
    M({ id: 'tp-c371', maps: ['tp'], name: '台北捷运 C371 型', short: 'C371', from: 2004, to: 2013, cap: 290, price: 520, ops: 0.92, max: 6, look: 'whiteNew', desc: '新庄线、芦洲线等的车辆' }),
    M({ id: 'tp-c381', maps: ['tp'], name: '台北捷运 C381 型', short: 'C381', from: 2012, to: 9999, cap: 290, price: 500, ops: 0.86, max: 6, look: 'paint', desc: '信义线、松山线的新车' }),
    // 巴黎
    M({ id: 'pa-m1', maps: ['pa'], name: '巴黎地铁 M1 木质车', short: 'M1', from: 1900, to: 1910, cap: 160, price: 100, ops: 1.05, life: 30, max: 6, kmh: 40, look: 'wood', desc: '1900 年开通时的木质车厢' }),
    M({ id: 'pa-st', maps: ['pa'], name: '巴黎地铁 Sprague-Thomson', short: 'Sprague', from: 1908, to: 1937, cap: 180, price: 120, ops: 1, life: 50, max: 6, kmh: 70, look: 'green', desc: '全钢车身，墨绿涂装，服役半个多世纪' }),
    M({ id: 'pa-mp59', maps: ['pa'], name: '巴黎地铁 MP 59（胶轮）', short: 'MP 59', from: 1956, to: 1966, cap: 210, price: 220, ops: 0.98, max: 6, look: 'classicLine', lookX: { body: '#2c5aa0', band: '#e9e5d6' }, desc: '胶轮车，加速快、噪声小' }),
    M({ id: 'pa-mf67', maps: ['pa'], name: '巴黎地铁 MF 67', short: 'MF 67', from: 1967, to: 1978, cap: 220, price: 220, ops: 0.97, max: 6, look: 'classicLine', lookX: { body: '#3c6fb4', band: '#f0eee6' }, desc: '钢轮车的大规模更新' }),
    M({ id: 'pa-mf77', maps: ['pa'], name: '巴黎地铁 MF 77', short: 'MF 77', from: 1978, to: 1990, cap: 230, price: 260, ops: 0.95, max: 6, look: 'white', desc: '白色车身，7、8、13 号线' }),
    M({ id: 'pa-mp89', maps: ['pa'], name: '巴黎地铁 MP 89（胶轮）', short: 'MP 89', from: 1995, to: 2007, cap: 230, price: 320, ops: 0.9, max: 6, look: 'whiteNew', desc: '贯通客室的胶轮车，14 号线无人驾驶' }),
    M({ id: 'pa-mf01', maps: ['pa'], name: '巴黎地铁 MF 01', short: 'MF 01', from: 2008, to: 2018, cap: 240, price: 340, ops: 0.86, max: 6, look: 'whiteNew', desc: '钢轮线路的新一代车' }),
    M({ id: 'pa-mp14', maps: ['pa'], name: '巴黎地铁 MP 14', short: 'MP 14', from: 2019, to: 9999, cap: 240, price: 380, ops: 0.78, max: 8, look: 'future', desc: '全自动运行的胶轮车' }),
    // 上海
    M({ id: 'sh-ac01', maps: ['sh'], name: '上海地铁 AC01 型（德国制造）', short: 'AC01', from: 1993, to: 1999, cap: 310, price: 600, ops: 0.98, look: 'white', lookX: { band: '#d52b1e' }, desc: '1 号线首批引进车' }),
    M({ id: 'sh-a', maps: ['sh'], name: '上海地铁 A 型（国产化）', short: '上海 A 型', from: 2003, to: 9999, cap: 310, price: 420, ops: 0.9, look: 'whiteNew', desc: '国产化后的大运量车' }),
    M({ id: 'sh-16', maps: ['sh'], name: '上海地铁 16 号线快车型', short: '16 号线快车', from: 2013, to: 9999, cap: 300, price: 480, ops: 0.9, kmh: 120, look: 'paint', desc: '最高 120 km/h 的郊区快线车' }),
    // 北京
    M({ id: 'bj-dk', maps: ['bj'], name: '北京地铁 DK 系列（长春客车厂）', short: 'DK 系列', from: 1969, to: 2000, cap: 240, price: 200, ops: 1, max: 6, look: 'classicLine', desc: '1 号线、环线的早期国产车' }),
    M({ id: 'bj-sfm04', maps: ['bj'], name: '北京地铁 SFM04 型', short: 'SFM04', from: 2002, to: 2008, cap: 250, price: 340, ops: 0.96, max: 6, look: 'steel', desc: '13 号线、八通线的不锈钢车' }),
    M({ id: 'bj-b', maps: ['bj'], name: '北京地铁 B 型（4 号线等）', short: '北京 B 型', from: 2008, to: 9999, cap: 250, price: 360, ops: 0.9, look: 'whiteNew', desc: '奥运前后新线的车型' }),
    M({ id: 'bj-a', maps: ['bj'], name: '北京地铁 A 型（6 号线、14 号线）', short: '北京 A 型', from: 2012, to: 9999, cap: 310, price: 420, ops: 0.88, look: 'paint', desc: '大运量干线车' }),
    // 东京
    M({ id: 'tk-1000', maps: ['tk'], name: '东京地下铁道 1000 形', short: '1000 形', from: 1927, to: 1938, cap: 170, price: 120, ops: 1, life: 40, max: 6, kmh: 50, look: 'classicLine', lookX: { era: 'early', body: '#f2b100', band: '#3a3634' }, desc: '银座线开通时的黄色车' }),
    M({ id: 'tk-300', maps: ['tk'], name: '营团 300 形（丸之内线）', short: '300 形', from: 1953, to: 1962, cap: 210, price: 200, ops: 1, max: 6, look: 'classicLine', lookX: { body: '#d13a33', band: '#f2f0e6' }, desc: '红色车身配白带' }),
    M({ id: 'tk-2000', maps: ['tk'], name: '营团 2000 形（银座线）', short: '2000 形', from: 1958, to: 1968, cap: 200, price: 190, ops: 1, max: 6, look: 'classicLine', lookX: { body: '#f5b301', band: '#5a4a2c' }, desc: '银座线的黄色车' }),
    M({ id: 'tk-5000', maps: ['tk'], name: '营团 5000 系（不锈钢）', short: '5000 系', from: 1964, to: 1981, cap: 250, price: 260, ops: 0.97, look: 'steel', desc: '东西线等的不锈钢车' }),
    M({ id: 'tk-01', maps: ['tk'], name: '营团 01 系', short: '01 系', from: 1983, to: 1997, cap: 220, price: 300, ops: 0.94, max: 6, look: 'steel', desc: '银座线的新一代车' }),
    M({ id: 'tk-05', maps: ['tk'], name: '营团 05 系', short: '05 系', from: 1988, to: 2004, cap: 250, price: 320, ops: 0.92, look: 'steel', desc: '东西线的铝合金车' }),
    M({ id: 'tk-10000', maps: ['tk'], name: '东京地铁 10000 系', short: '10000 系', from: 2006, to: 2016, cap: 250, price: 380, ops: 0.88, look: 'whiteNew', desc: '有乐町线、副都心线' }),
    M({ id: 'tk-n1000', maps: ['tk'], name: '东京地铁 1000 系（复古涂装）', short: '新 1000 系', from: 2012, to: 2017, cap: 220, price: 360, ops: 0.86, max: 6, look: 'paint', lookX: { body: '#f2b100', band: '#3a3634' }, desc: '银座线的复古黄色新车' }),
    M({ id: 'tk-13000', maps: ['tk'], name: '东京地铁 13000 系', short: '13000 系', from: 2016, to: 9999, cap: 250, price: 400, ops: 0.84, look: 'paint', desc: '日比谷线的新车' }),
  ];
  // 始终保留原文，交给共享翻译层显示，切换语言后可恢复且不改存档。
  F.nameOf = function (m) { return m.name; };
  F.shortOf = function (m) { return m.short; };
  F.descOf = function (m) { return m.desc; };
  const BY = new Map(MODELS.map(function (m) { return [m.id, m]; }));
  F.model = function (id) { return BY.get(id) || BY.get('gen-a'); };
  // 本城当年可以买的车型（本城真实车型在前）
  F.available = function (mapId, y) {
    return MODELS.filter(function (m) { return y >= m.from && y <= m.to && (!m.maps || m.maps.indexOf(mapId) >= 0); }).sort(function (a, b) { return (a.maps ? 0 : 1) - (b.maps ? 0 : 1) || b.from - a.from; });
  };
  // 本城以后才开放的车型（按开放年份，同年本城车型在前）：购车界面与车队总览提前展示
  F.upcoming = function (mapId, y) {
    return MODELS.filter(function (m) { return m.from > y && (!m.maps || m.maps.indexOf(mapId) >= 0); }).sort(function (a, b) { return a.from - b.from || (a.maps ? 0 : 1) - (b.maps ? 0 : 1); });
  };
  // 推荐车型（随线配车用）：本城当年最新的真实车型，没有则用通用车型里最新的
  // need：线路运行速度超过 80 km/h 时，车型的最高速度不能低于它（v2.5）
  F.recommend = function (mapId, y, need) {
    const a = F.available(mapId, y);
    if (need > 80) { const fast = a.filter(function (m) { return m.kmh >= need; }); if (fast.length) return fast[0]; }
    return a[0] || BY.get('gen-early');
  };
  // 线路运行速度能否选用：80 km/h 及以下不限车型；更高的速度要当年买得到足够快的车型，否则给出最早开放的年份
  F.speedOpen = function (mapId, y, kmh) {
    if (kmh <= 80 || F.available(mapId, y).some(function (m) { return m.kmh >= kmh; })) return { ok: true };
    const later = F.upcoming(mapId, y).filter(function (m) { return m.kmh >= kmh; });
    return { ok: false, year: later.length ? later[0].from : null };
  };
  // 列车能否在这条路线上运行：编组不超过站台，最高速度不低于线路运行速度（只对高于 80 km/h 的线路要求）
  const tooSlow = function (t, rt) { return rt.kmh > 80 && F.model(t.model).kmh < rt.kmh; };
  // 某年代的车型（旧存档与开局既有线路的车队）：当年可买的推荐车型；早于所有车型时取最早的通用车
  F.eraModel = function (mapId, y) {
    const a = F.available(mapId, y); if (a.length) return a[0];
    const own = MODELS.filter(function (m) { return (!m.maps || m.maps.indexOf(mapId) >= 0) && m.from <= y; }).sort(function (a, b) { return b.from - a.from; });
    return own[0] || BY.get('gen-early');
  };
  // 价格：每节价格 × 节数 × 本城造价水平 × 当年造价指数
  const scale = function () { return (CFG.cost.station.underground.M || 25000) / 25000; };
  F.price = function (g, m, cars, y) { return m.price * cars * scale() * g.econ.costIndex(y || g.clock.y); };
  const ageY = function (g, t) { return Math.max(0, (g.ym() - (t.bought || g.ym())) / 12); };
  F.age = ageY;
  // 残值：买价的 75% 起，按设计寿命直线折旧，最低 8%（买了马上卖也要损失约四分之一）
  F.residual = function (g, t) { const m = F.model(t.model); return (t.cost || 0) * Math.max(0.08, 0.75 * (1 - ageY(g, t) / m.life)); };
  F.opsF = function (g, t) { const m = F.model(t.model); return m.ops * (ageY(g, t) > m.life ? 1.25 : 1); };
  F.capOf = function (t) { return F.model(t.model).cap * t.cars; };

  // ---------------- 交路（线路的运营方向）与车队计划 ----------------
  // 普通线路与支线：每条路线一个全程交路（以终点站标识）；环线：顺行 cw、逆行 ccw 两个交路；玩家加开的交路以 v 开头（环线另带方向）
  F.svcId = function (rt, d) { if (rt.svc) return rt.loop ? rt.svc + (d ? ':ccw' : ':cw') : rt.svc; return rt.loop ? (d ? 'ccw' : 'cw') : rt.stIds[rt.stIds.length - 1]; };
  F.svcName = function (rt, d) { return rt.loop ? rt.label + (d ? '（逆行）' : '（顺行）') : rt.label; };
  const routesOfLine = function (C) { const m = new Map(); C.routes.forEach(function (rt, r) { let a = m.get(rt.lineId); if (!a) m.set(rt.lineId, a = []); a.push(r); }); return m; };
  // 列车所在的交路：环线按方向；其他按终点站，终点改了（延长）就找经过原终点的路线，再找不到视为失去交路，退回车辆段
  const placeOf = function (C, rs, t) {
    const r0 = C.routes[rs[0]];
    // 加开的交路：交路已取消时列车回到本线的全程交路
    if (t.svc && /^v\d/.test(t.svc)) {
      const key = t.svc.split(':')[0];
      for (const r of rs) if (C.routes[r].svc === key) return { r: r, d: t.svc.slice(-3) === 'ccw' ? 1 : 0 };
      return { r: rs[0], d: 0 };
    }
    if (r0.loop) return { r: rs[0], d: t.svc === 'ccw' ? 1 : 0 };
    if (t.svc) {
      for (const r of rs) { const s = C.routes[r].stIds; if (!C.routes[r].svc && s[s.length - 1] === t.svc) return { r: r, d: 0 }; }
      for (const r of rs) if (!C.routes[r].svc && C.routes[r].stIds.indexOf(t.svc) >= 0) return { r: r, d: 0 };
      return null;
    }
    return { r: rs[0], d: 0 };
  };
  // 最低服务水平所需的列车（早高峰）：按周转时间
  F.floorNeed = function (rt) { return Math.max(1, Math.ceil(CM.Model.serviceFloor(rt, 0) * rt.cycleSec / 3600 - 1e-6)); };
  const cache = new WeakMap();
  // 线网 net 各路线的车队计划：avail 各方向可用列车数，cap / cars / opsF 平均定员、编组与成本系数，units 各方向的列车（画面用），
  // manual 手动模式各方向各时段投入数，blocked 编组超过站台长度、不能上线的列车数。草案线网（预测）按随线配车补足最低需要
  F.plan = function (g, net) {
    const fl = g.fleet; if (!fl || !net || !net.C) return null;
    const hit = cache.get(net); if (hit && hit.ver === fl.ver && hit.ym === g.ym()) return hit.plan;
    const C = net.C, draft = C.net !== g.net, byLine = routesOfLine(C), y = g.clock.y;
    const plan = C.routes.map(function (rt) { return { avail: [0, 0], units: [[], []], cap: rt.cap, cars: rt.cars, opsF: rt.opsK || 1, manual: null, blocked: 0, slow: 0, floor: F.floorNeed(rt) }; });
    for (const t of fl.trains) {
      if (!t.line) continue; const rs = byLine.get(t.line); if (!rs) continue;
      const pos = placeOf(C, rs, t); if (!pos) continue;
      const rt = C.routes[pos.r], fp = plan[pos.r];
      if (t.cars > rt.cars) { fp.blocked++; continue; }
      if (tooSlow(t, rt)) { fp.slow++; continue; }
      fp.units[pos.d].push({ id: t.id, m: F.model(t.model), cars: t.cars, cap: F.capOf(t), ops: F.opsF(g, t) });
    }
    C.routes.forEach(function (rt, r) {
      const fp = plan[r], nd = rt.loop ? 2 : 1;
      let n = 0, cap = 0, cars = 0, ops = 0;
      for (let d = 0; d < nd; d++) {
        fp.units[d].sort(function (a, b) { return b.cap - a.cap; });
        fp.avail[d] = fp.units[d].length;
        for (const u of fp.units[d]) { n++; cap += u.cap; cars += u.cars; ops += u.ops; }
      }
      if (nd === 1) { fp.avail[1] = fp.avail[0]; fp.units[1] = fp.units[0]; }
      if (draft && !rt.svc) {   // 预测：随线配车会把全程交路的列车补到最低需要（用推荐车型）；加开的交路由玩家配车
        const m = F.recommend(g.mapId, y, rt.kmh), c = Math.min(rt.cars, m.max);
        for (let d = 0; d < nd; d++) { const add = Math.max(0, fp.floor - fp.avail[d]); fp.avail[d] += add; n += add; cap += add * m.cap * c; cars += add * c; ops += add * m.ops; }
        if (nd === 1) fp.avail[1] = fp.avail[0];
      }
      if (n) { fp.cap = cap / n; fp.cars = cars / n; fp.opsF = ops / n * (rt.opsK || 1); }
      const o = fl.ops[rt.lineId];
      if (o && o.mode === 'manual') {
        fp.manual = [0, 1].map(function (d) { const s = o.n && o.n[F.svcId(rt, rt.loop ? d : 0)]; return [0, 1, 2, 3].map(function (p) { return s && s[p] != null ? Math.min(s[p], fp.avail[d]) : fp.avail[d]; }); });
      }
    });
    cache.set(net, { ver: fl.ver, ym: g.ym(), plan: plan });
    return plan;
  };
  // 车队变化：版本加一、模拟立即按新的列车数重算频率与费用、界面刷新
  const changed = function (g) { g.fleet.ver++; g.model.applyFleet(); g.touch(); g.emit('fleet'); };
  F.changed = changed;
  const newTrain = function (g, mdl, cars, cost, line, svc, bought) {
    const fl = g.fleet, t = { id: 'T' + (fl.seq++), model: mdl.id, cars: cars, bought: bought == null ? g.ym() : bought, cost: Math.round(cost), line: line || null, svc: svc || null };
    fl.trains.push(t); return t;
  };

  // ---------------- 建立车队（新局开局的既有线路、旧存档） ----------------
  // 按当前各时段实际发车所需的列车再留一成备用（至少 1 列），车型取线路开通年代的车型，视为已有资产（不扣钱）
  F.ensure = function (g) {
    if (!g || g.preview) return;
    const bootstrap = !g.fleet;
    if (bootstrap) {
      g.fleet = { v: 1, ver: 1, seq: 1, trains: [], ops: {}, note: {} };
      const net = g.model.net, C = net && net.C, res = g.model.results || g.model.ctxs;
      if (C) C.routes.forEach(function (rt, r) {
        const built = (CM.Agents && CM.Agents.lineBuiltYear(g.net, rt.lineId)) || CFG.START.y, by = Math.max(built, g.clock.y - 25), m0 = g.net.lines[rt.lineId] && g.net.lines[rt.lineId].model0, mdl = (m0 && MODELS.find(function (x) { return x.id === m0; })) || F.eraModel(g.mapId, by), cars = Math.min(rt.cars, mdl.max);
        for (let d = 0; d < (rt.loop ? 2 : 1); d++) {
          let f = 0; for (const dt of ['wd', 'we']) for (const P of res[dt].per) if (P && P.freq && P.freq.length === C.routes.length) f = Math.max(f, P.freqDir && P.freqDir.length === 2 * C.routes.length ? P.freqDir[2 * r + d] : P.freq[r]);
          const need = Math.max(F.floorNeed(rt), Math.ceil(f * rt.cycleSec / 3600 - 1e-6)), n = need + Math.max(1, Math.round(need * 0.1));
          for (let i = 0; i < n; i++) newTrain(g, mdl, cars, F.price(g, mdl, cars, by), rt.lineId, F.svcId(rt, d), U.ymIndex(by, 1));
        }
      });
    }
    const beforeSync = g.fleet.ver;
    F.sync(g);
    g.model.fleetSource = function (net) { return F.plan(g, net); };
    if (bootstrap || g.fleet.ver !== beforeSync) g.model.applyFleet();
  };
  // 拆除线路后车队整理：线路已不存在的列车回到车辆段
  F.sync = function (g) {
    const fl = g.fleet; if (!fl) return 0; let n = 0, remapped = false;
    const C = g.compiled, byLine = routesOfLine(C);
    for (const t of fl.trains) {
      if (!t.line) continue;
      const rs = byLine.get(t.line), pos = rs && placeOf(C, rs, t);
      if (!g.net.lines[t.line] || !pos) { t.line = null; t.svc = null; n++; continue; }
      const svc = F.svcId(C.routes[pos.r], pos.d);
      if (svc !== t.svc) {
        const o = fl.ops[t.line];
        if (o && o.n && o.n[t.svc] && !o.n[svc]) o.n[svc] = o.n[t.svc].slice();
        t.svc = svc; remapped = true;
      }
    }
    for (const lid in fl.ops) if (!g.net.lines[lid]) delete fl.ops[lid];
    if (n || remapped) fl.ver++;
    if (n) g.logEvent({ tag: '运营', title: n + ' 列列车回到车辆段', desc: '线路调整后没有归属的列车停入车辆段，可以调往其他线路或出售。' });
    return n;
  };

  // ---------------- 随线配车（草案） ----------------
  // 新线与延长后，各交路的列车补到早高峰最低服务水平所需：先用车辆段闲置（及因拆除、贯通而空出）的列车，不够再按推荐车型购买，费用计入建设
  F.draftExtra = function (g, ev) {
    const fl = g.fleet; if (!fl || !g.draft || !ev) return;
    const C = g.draftCompiled(); if (!C) return;
    const byLine = routesOfLine(C), y = g.clock.y, have = C.routes.map(function () { return [0, 0]; });
    const idle = [], onSvc = new Set();   // onSvc：有列车跑在加开交路上的线路，全程交路可以不配车
    for (const t of fl.trains) {
      const rs = t.line && byLine.get(t.line);
      if (!rs) { idle.push(t); continue; }
      const pos = placeOf(C, rs, t); if (!pos) { idle.push(t); continue; }
      const rt = C.routes[pos.r];
      if (t.cars <= rt.cars && !tooSlow(t, rt)) { have[pos.r][pos.d]++; if (rt.svc) onSvc.add(t.line); }
    }
    const adds = []; let total = 0;
    C.routes.forEach(function (rt, r) {
      if (rt.svc || onSvc.has(rt.lineId)) return;   // 随线配车只补全程交路
      const mdl = F.recommend(g.mapId, y, rt.kmh);
      for (let d = 0; d < (rt.loop ? 2 : 1); d++) {
        let short = F.floorNeed(rt) - have[r][d]; if (short <= 0) continue;
        const use = [];
        for (let i = idle.length - 1; i >= 0 && short > 0; i--) if (idle[i].cars <= rt.cars && !tooSlow(idle[i], rt)) { use.push(idle[i].id); idle.splice(i, 1); short--; }
        const cars = Math.min(rt.cars, mdl.max), cost = short > 0 ? F.price(g, mdl, cars, y) * short : 0;
        adds.push({ line: rt.lineId, svc: F.svcId(rt, d), name: F.svcName(rt, d), use: use, buy: short, model: mdl.id, cars: cars, cost: cost });
        total += cost;
      }
    });
    ev.fleetAdd = adds;
    for (const a of adds) {
      if (a.cost > 0.5) { ev.items.push({ kind: 'construction', label: '随线配属列车 · ' + a.name + '：' + a.buy + ' 列（' + F.model(a.model).short + ' ' + a.cars + ' 节）', amount: a.cost, ref: a.line }); }
      if (a.use.length) ev.notes = (ev.notes || []).concat(['调用闲置列车 ' + a.use.length + ' 列给 ' + a.name]);
    }
    ev.total += total; ev.byKind.construction += total;
  };
  F.applyAdd = function (g, adds) {
    if (!g.fleet || !adds) return;
    for (const a of adds) {
      for (const id of a.use) { const t = g.fleet.trains.find(function (x) { return x.id === id; }); if (t) { t.line = a.line; t.svc = a.svc; } }
      const m = F.model(a.model), each = a.buy > 0 ? a.cost / a.buy : 0;
      for (let i = 0; i < a.buy; i++) newTrain(g, m, a.cars, each, a.line, a.svc);
    }
  };

  // ---------------- 玩家操作 ----------------
  F.buy = function (g, lid, svc, modelId, cars, n) {
    const m = F.model(modelId), y = g.clock.y;
    if (y < m.from || y > m.to || (m.maps && m.maps.indexOf(g.mapId) < 0)) return { error: F.nameOf(m) + ' 现在买不到' };
    if (cars > m.max) return { error: F.shortOf(m) + ' 最长 ' + m.max + ' 节' };
    const cost = F.price(g, m, cars, y) * n;
    if (!g.econ.isFree() && !g.econ.canAffordBuild(cost)) return { error: '资金不足：需要 ' + U.fmtMoney(cost) };
    g.econ.spendBuild({ construction: cost }, '购置列车：' + m.short + ' ' + cars + ' 节 × ' + n + ' 列', { y: y, m: g.clock.m, d: g.clock.d }, true);
    for (let i = 0; i < n; i++) newTrain(g, m, cars, cost / n, lid, svc);
    g.logEvent({ tag: '运营', title: '购置列车：' + m.short + ' × ' + n, desc: (lid && g.net.lines[lid] ? '配属 ' + g.net.lines[lid].name + '，' : '停入车辆段，') + cars + ' 节编组，共 ' + U.fmtMoney(cost) + '。' });
    changed(g); return { ok: true, cost: cost };
  };
  F.sell = function (g, ids) {
    let v = 0, n = 0;
    g.fleet.trains = g.fleet.trains.filter(function (t) { if (ids.indexOf(t.id) < 0) return true; v += F.residual(g, t); n++; return false; });
    if (!n) return { error: '没有可出售的列车' };
    if (!g.econ.isFree()) { g.econ.income('fleetSale', v); g.econ.log('fleetSale', v, 'gen', '出售旧列车 ' + n + ' 列（按残值）', { y: g.clock.y, m: g.clock.m, d: g.clock.d }); }
    g.logEvent({ tag: '运营', title: '出售列车 ' + n + ' 列', desc: '按残值回收 ' + U.fmtMoney(v) + '。' });
    changed(g); return { ok: true, value: v, n: n };
  };
  F.move = function (g, ids, lid, svc) {
    let n = 0;
    for (const t of g.fleet.trains) if (ids.indexOf(t.id) >= 0) { t.line = lid || null; t.svc = lid ? svc : null; n++; }
    if (n) changed(g); return n;
  };
  // 车辆段智能分配（v2.6.1 玩家反馈）：闲置列车一列一列分给高峰缺口比例最大的交路，只分站台放得下、速度够的车，优先运力大的车；
  // 手动调度的线路由玩家自己安排，不参与。只返回方案，不改动车队
  F.allocPlan = function (g) {
    const needs = [], idle = g.fleet.trains.filter(function (t) { return !t.line; }).sort(function (a, b) { return F.capOf(b) - F.capOf(a); }), total = idle.length;
    for (const lid of CM.Metro.sortIds(Object.keys(g.net.lines))) {
      const o = g.fleet.ops[lid]; if (o && o.mode === 'manual') continue;
      for (const s of F.lineInfo(g, lid) || []) if (s.short > 0) needs.push({ lid: lid, svc: s.id, name: s.name, rt: s.rt, avail: s.avail, need: s.peakNeed, short: s.short, maxCars: s.maxCars, ids: [], stuck: false });
    }
    const fit = function (t, x) { return t.cars <= x.maxCars && (x.rt.kmh <= 80 || F.model(t.model).kmh >= x.rt.kmh); };
    for (;;) {
      let best = null, bs = 0;
      for (const x of needs) { if (x.short <= 0 || x.stuck) continue; const v = x.short / Math.max(1, x.need) + x.short * 1e-3; if (v > bs) { bs = v; best = x; } }
      if (!best) break;
      const i = idle.findIndex(function (t) { return fit(t, best); });
      if (i < 0) { best.stuck = true; continue; }
      best.ids.push(idle[i].id); idle.splice(i, 1); best.short--;
    }
    return { needs: needs, moved: total - idle.length, left: idle.length, unmet: needs.reduce(function (a, x) { return a + x.short; }, 0) };
  };
  F.applyAlloc = function (g, plan) {
    const by = new Map(); for (const x of plan.needs) for (const id of x.ids) by.set(id, x);
    if (!by.size) return 0;
    for (const t of g.fleet.trains) { const x = by.get(t.id); if (x) { t.line = x.lid; t.svc = x.svc; } }
    g.logEvent({ tag: '运营', title: '车辆段分配列车 ' + by.size + ' 列', desc: plan.needs.filter(function (x) { return x.ids.length; }).map(function (x) { return x.name + ' +' + x.ids.length; }).join('、') + '。' });
    changed(g); return by.size;
  };
  // 分配后还差的列车：按推荐车型配齐（编组取站台允许的最长）
  F.fillCost = function (g, plan) {
    const y = g.clock.y, rows = []; let cost = 0;
    for (const x of plan.needs) { if (x.short <= 0) continue; const m = F.recommend(g.mapId, y, x.rt.kmh), cars = Math.min(x.maxCars, m.max), c = F.price(g, m, cars, y) * x.short; rows.push({ x: x, m: m, cars: cars, n: x.short, cost: c }); cost += c; }
    return { rows: rows, cost: cost };
  };
  F.setMode = function (g, lid, mode) {
    const o = g.fleet.ops[lid] || (g.fleet.ops[lid] = { mode: 'auto', n: {} });
    o.mode = mode === 'manual' ? 'manual' : 'auto';
    changed(g);
  };
  F.setManual = function (g, lid, svc, p, n) {
    const o = g.fleet.ops[lid] || (g.fleet.ops[lid] = { mode: 'manual', n: {} });
    o.n = o.n || {}; const a = o.n[svc] || (o.n[svc] = [null, null, null, null]); a[p] = Math.max(0, Math.round(n));
    changed(g);
  };

  // ---------------- 运行交路（v2.5 玩家反馈：快慢车、区间车） ----------------
  // 只改运营组织：不收费、立即生效，同时写入正式线网与草案。新交路没有列车，由玩家购买或调入后开行；取消的交路列车回到全程交路
  const applyServices = function (g, lid, list, seq) {
    CM.ui.setLineLook(lid, { svcs: list.length ? list : undefined, svcSeq: seq });
    g.refreshOperations();
  };
  F.MAX_SERVICES = 6;
  F.saveService = function (g, lid, sv) {
    if (g.jumping || g.pending) return { error: '正在结算，请稍候' };
    const L = g.net.lines[lid]; if (!L) return { error: '线路不存在' };
    const list = (L.svcs || []).slice(); let seq = L.svcSeq || 0;
    if (sv.id) { const k = list.findIndex(function (x) { return x.id === sv.id; }); if (k < 0) return { error: '交路不存在' }; list[k] = sv; }
    else { if (list.length >= F.MAX_SERVICES) return { error: '每条线路最多加开 ' + F.MAX_SERVICES + ' 个交路' }; sv.id = 'v' + (++seq); list.push(sv); }
    applyServices(g, lid, list, seq);
    g.logEvent({ tag: '运营', title: L.name + ' 调整运行交路', desc: '「' + sv.name + '」已生效：配属列车后开行。' });
    return { ok: true, id: sv.id };
  };
  F.removeService = function (g, lid, id) {
    if (g.jumping || g.pending) return { error: '正在结算，请稍候' };
    const L = g.net.lines[lid]; if (!L) return { error: '线路不存在' };
    const o = g.fleet && g.fleet.ops[lid];
    if (o && o.n) for (const k of Object.keys(o.n)) if (k.split(':')[0] === id) delete o.n[k];
    applyServices(g, lid, (L.svcs || []).filter(function (x) { return x.id !== id; }), L.svcSeq || 0);
    return { ok: true };
  };

  // ---------------- 线路运营概况（界面与提示共用） ----------------
  // 各交路：可用列车、编组超长、各时段（工作日）实际投入与所需列车、发车间隔、运力与最大断面客流
  F.lineInfo = function (g, lid) {
    const net = g.model.net; if (!net) return null;
    const C = net.C, plan = F.plan(g, net), res = g.model.resultsFor('wd'), out = [];
    C.routes.forEach(function (rt, r) {
      if (rt.lineId !== lid) return;
      const fp = plan && plan[r], re = net.rideEdge[r];
      for (let d = 0; d < (rt.loop ? 2 : 1); d++) {
        const per = [0, 1, 2, 3].map(function (p) {
          const P = res && res.per[p]; if (!P || !P.freq || P.freq.length !== net.R) return null;
          const f = P.freqDir && P.freqDir.length === 2 * net.R ? P.freqDir[2 * r + d] : P.freq[r], need = P.needDir && P.needDir.length === 2 * net.R ? P.needDir[2 * r + d] : f;
          let mx = 0; for (let q = 0; q < re.length; q++) if ((!rt.loop || (q & 1) === d) && P.load[re[q]] > mx) mx = P.load[re[q]];
          const cap = fp ? fp.cap : rt.cap;
          return { f: f, need: need, run: Math.max(0, Math.ceil(f * rt.cycleSec / 3600 - 0.05)), needN: Math.max(0, Math.ceil(need * rt.cycleSec / 3600 - 0.05)), capH: f * cap, load: mx, lf: f > 0 ? mx / (f * cap) : (mx > 0 ? 9 : 0) };
        });
        const units = fp ? fp.units[d] : [];
        let peakNeed = 0; for (const x of per) if (x) peakNeed = Math.max(peakNeed, x.needN);
        out.push({ r: r, d: d, rt: rt, id: F.svcId(rt, d), name: F.svcName(rt, d), avail: fp ? fp.avail[d] : 0, blocked: fp ? (rt.loop ? (d ? 0 : fp.blocked) : fp.blocked) : 0, units: units, per: per, cycleMin: rt.cycleSec / 60, maxCars: rt.cars, floor: F.floorNeed(rt), peakNeed: peakNeed, short: rt.svc && !(fp && fp.avail[d]) ? 0 : Math.max(0, peakNeed - (fp ? fp.avail[d] : 0)), svc: rt.svc || null, skipped: rt.skipped || 0, stops: rt.stIds.length, slow: fp ? (rt.loop && d ? 0 : fp.slow) : 0 });
      }
    });
    // 全程交路可以不配车：本线有列车跑在加开的交路上时不算缺车（每条线路至少有一个交路在运行即可）
    if (out.some(function (x) { return x.svc && x.avail > 0; })) for (const x of out) if (!x.svc && !x.avail) { x.short = 0; x.peakNeed = 0; }
    return out;
  };
  // 线路上的列车（按交路）与车辆段闲置列车
  F.trainsOf = function (g, lid, svc) { return g.fleet.trains.filter(function (t) { return t.line === lid && (svc == null || t.svc === svc); }); };

  // ---------------- 每月：运力不足与超龄提示 ----------------
  F.monthly = function (g) {
    const fl = g.fleet; if (!fl || !g.model.trafficReady()) return;
    const ym = g.ym(), note = fl.note || (fl.note = {});
    if (fl.autoAlloc) { const p = F.allocPlan(g); if (p.moved) F.applyAlloc(g, p); }
    for (const lid in g.net.lines) {
      const o = fl.ops[lid]; if (o && o.mode === 'manual') continue;
      const info = F.lineInfo(g, lid); if (!info) continue;
      let short = 0; for (const s of info) short += s.short;
      if (short > 0 && !(note['short:' + lid] > ym)) {
        note['short:' + lid] = ym + 6;
        const L = g.net.lines[lid];
        g.logEvent({ tag: '运营', title: L.name + ' 高峰运力不足', desc: '智能调度已用上全部配属列车，高峰还差约 ' + short + ' 列，车厢会更拥挤、候车更久。可以购买列车，或从客流较少的线路调车。' });
        g.emit('toast', { kind: 'warn', text: L.name + ' 高峰运力不足：还差约 ' + short + ' 列车', fleet: lid });
      }
    }
    if (g.clock.m === 1) {
      const old = fl.trains.filter(function (t) { return ageY(g, t) > F.model(t.model).life; }).length;
      if (old && !(note.old > ym)) { note.old = ym + 12; g.logEvent({ tag: '运营', title: old + ' 列列车超过设计寿命', desc: '超龄列车的运营与维护费用 ×1.25。可以出售旧车（按残值），换购新车型。' }); }
      const y = g.clock.y, fresh = MODELS.filter(function (m) { return m.from === y && (!m.maps || m.maps.indexOf(g.mapId) >= 0); });
      if (fresh.length && !(note.newY >= y)) {
        note.newY = y;
        g.logEvent({ tag: '运营', title: '新车型开放：' + fresh.map(function (m) { return m.name; }).join('、'), desc: '可以在线路的「列车运营」分页购买。车队页列出以后开放的车型。' });
        g.emit('toast', { kind: 'info', text: '新车型开放：' + fresh.map(function (m) { return m.short; }).join('、'), models: true });
      }
    }
  };

  // ---------------- 车型侧视图（购车界面） ----------------
  F.sideSVG = function (m, line, w) {
    const L = m.look, pick = function (c) { return c === 'line' ? line : c; }, body = pick(L.body), band = pick(L.band), roof = pick(L.roof), W = w || 168, H = 40;
    const ends = { early: 'square', classic: 'round', modern: 'square', current: 'round', future: 'pointed' }[L.era] || 'round';
    const car = function (x, first) {
      const cw = 74, r = ends === 'round' ? 7 : 3;
      let s = '<rect x="' + x + '" y="9" width="' + cw + '" height="22" rx="' + r + '" fill="' + body + '" stroke="#1f2731" stroke-width="0.8"/>';
      s += '<rect x="' + (x + 1) + '" y="7" width="' + (cw - 2) + '" height="3.5" rx="1.5" fill="' + roof + '"/>';
      if (L.era === 'early') s += '<rect x="' + (x + 12) + '" y="4.5" width="' + (cw - 24) + '" height="3" rx="1" fill="' + roof + '"/>';
      s += '<rect x="' + (x + 2) + '" y="' + (L.era === 'current' ? 13 : 22) + '" width="' + (cw - 4) + '" height="' + (L.era === 'current' ? 8 : 3) + '" fill="' + band + '" opacity="' + (L.era === 'future' ? 0.9 : 1) + '"/>';
      for (let i = 0; i < 4; i++) s += '<rect x="' + (x + 6 + i * 17) + '" y="13" width="10" height="6" rx="1" fill="#2b3a4a" opacity="0.85"/>';
      for (const fx of [0.3, 0.7]) s += '<rect x="' + (x + cw * fx - 3) + '" y="13" width="6" height="16" fill="none" stroke="#1f2731" stroke-width="0.5" opacity="0.6"/>';
      s += '<rect x="' + (x + 8) + '" y="31" width="14" height="3" rx="1" fill="#39424d"/><rect x="' + (x + cw - 22) + '" y="31" width="14" height="3" rx="1" fill="#39424d"/>';
      if (first && ends === 'pointed') s += '<path d="M' + (x + cw) + ' 9 Q' + (x + cw + 10) + ' 14 ' + (x + cw + 8) + ' 31 L' + (x + cw) + ' 31 Z" fill="' + body + '" stroke="#1f2731" stroke-width="0.8"/>';
      if (first) s += '<rect x="' + (x + cw - 5) + '" y="12" width="4" height="7" rx="1" fill="#2b3a4a"/>';
      return s;
    };
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true"><line x1="0" y1="35.5" x2="' + W + '" y2="35.5" stroke="#9aa5b2" stroke-width="1"/>' + car(4, false) + car(82, true) + '</svg>';
  };

  // ================= 界面 =================
  const UI = CM.UI, ic = CM.icon, AX = CM.Accessibility;
  const groupTrains = function (g, list) {
    const m = new Map();
    for (const t of list.slice().sort(function (a, b) { return ageY(g, b) - ageY(g, a); })) { const k = t.model + '|' + t.cars; let a = m.get(k); if (!a) m.set(k, a = { m: F.model(t.model), cars: t.cars, ids: [], old: 0, value: 0 }); a.ids.push(t.id); a.value += F.residual(g, t); if (ageY(g, t) > a.m.life) a.old++; }
    return Array.from(m.values()).sort(function (a, b) { return b.ids.length - a.ids.length; });
  };
  const lineColor = function (g, lid) { const L = g.net.lines[lid]; return L ? AX.line(L) : '#2f6fa8'; };
  // 线路详情「列车运营」分页
  const sfx = function (n) { if (CM.Sound) CM.Sound.play(n); };
  UI.prototype.lineOpsTab = function (el, lid) {
    const g = this.g(), self = this, fl = g.fleet, o = fl.ops[lid] || { mode: 'auto' }, manual = o.mode === 'manual', info = F.lineInfo(g, lid) || [];
    const done = function () { self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage(); };
    el.appendChild(h('div', { class: 'fo-mode' },
      h('div', { class: 'seg-ctl sm' }, [['auto', '智能调度'], ['manual', '手动设定']].map(function (x) { return h('button', { class: (manual ? 'manual' : 'auto') === x[0] ? 'on' : '', 'data-silent': '1', onclick: function () { if ((manual ? 'manual' : 'auto') !== x[0]) { sfx('toggle'); F.setMode(g, lid, x[0]); done(); } } }, x[1]); })),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm ghost', onclick: function () { if (self.opsApp) self.opsApp.go('fleet'); else self.openPage('fleet', null, { root: true }); } }, ic('train', 14), '车队总览')));
    el.appendChild(h('div', { class: 'note' }, manual ? '手动：每个时段投入几列由你设定（不超过配属列车）。多投入发车更密、运营费用更高；投入太少车厢拥挤、候车变长。' : '智能调度：在配属列车范围内按客流与最低服务水平安排各时段投入的列车；列车不够时低运力运行，车厢拥挤、候车变长。'));
    el.appendChild(this.lineSpeedBlock(lid));
    if (!info.length) { el.appendChild(h('div', { class: 'note' }, '线路运营后在这里安排列车。')); return; }
    // 运行交路：全程站站停之外可以加开快车、区间车，各交路分别配车
    const kindOf = function (s) { return !s.svc ? '全程站站停' : (s.rt.stIds.length ? (s.skipped ? '停靠 ' + s.stops + ' 站 · 通过 ' + s.skipped + ' 站' : '区间 · ' + s.stops + ' 站') : ''); };
    const allStops = info.filter(function (s) { return !s.svc; });
    el.appendChild(h('div', { class: 'fl-h fo-svc-head' }, h('span', { class: 'grow' }, '运行交路 ', h('span', { class: 'tiny muted' }, (info.filter(function (s) { return s.svc; }).length ? info.length + ' 个' : '默认全程站站停'))),
      h('button', { class: 'btn sm', 'data-tip': '加开快车（跳站）或区间车（只跑一段）。只改运营组织，不收费', onclick: function () { self.showServiceEditor(lid); } }, ic('plus', 14), '新增交路')));
    const peakByBase = new Map();
    for (const s of info) { const x = s.per[0]; if (x && (s.d === 0)) { const b = s.rt.baseId != null ? s.rt.baseId : s.rt.id; peakByBase.set(b, (peakByBase.get(b) || 0) + x.f); } }
    peakByBase.forEach(function (f) { if (f > CFG.metro.fMax + 0.5) el.appendChild(self.callout('warn', 'warn', '同一条轨道上早高峰合计约 ' + U.fmtNum(f, 1) + ' 列/时，超过上限 ' + CFG.metro.fMax + ' 列/时：减少投入的列车或加长编组。')); });
    let avail = 0, short = 0, blocked = 0; for (const s of info) { avail += s.avail; short += s.short; blocked += s.blocked; }
    const all = F.trainsOf(g, lid), grp = groupTrains(g, all);
    el.appendChild(h('div', { class: 'fo-sum' },
      h('div', null, h('small', null, '配属列车'), h('b', null, all.length + ' 列')),
      h('div', null, h('small', null, '高峰需要'), h('b', { class: short ? 'bad' : '' }, info.reduce(function (s, x) { return s + x.peakNeed; }, 0) + ' 列')),
      h('div', null, h('small', null, '车型'), h('b', null, grp.length ? grp.map(function (x) { return F.shortOf(x.m); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('、') : '—'))));
    if (short && !manual) el.appendChild(this.callout('warn', 'warn', h('span', null, '高峰运力不足：还差约 ' + short + ' 列。智能调度只调度已有列车，可以购买列车，或从客流较少的线路调车。')));
    if (blocked) el.appendChild(this.callout('bad', 'warn', blocked + ' 列列车编组超过本线站台长度，不能上线：升级沿线车站，或调往其他线路、出售。'));
    const slowN = info.reduce(function (a, x) { return a + (x.slow || 0); }, 0);
    if (slowN) el.appendChild(this.callout('bad', 'warn', slowN + ' 列列车的最高速度低于本线运行速度，不能上线：购买更快的车型，或把列车调往其他线路、出售。'));
    // 配属列车：按车型与编组分组，可调回车辆段或出售
    const pl = F.plan(g, g.model.net) || [], onRoute = new Set();
    const unitRow = function (x, warn) {
      const out = function (k) { sfx('trainMove'); F.move(g, x.ids.slice(-k), null, null); self.toast('已调回车辆段 ' + k + ' 列', 'info'); done(); };
      return h('div', { class: 'fo-unit' },
        h('span', { class: 'fo-pic', html: F.sideSVG(x.m, lineColor(g, lid), 84) }),
        h('div', { class: 'grow' }, h('b', null, F.shortOf(x.m) + ' · ' + x.cars + ' 节 × ' + x.ids.length), h('small', { class: warn ? 'bad' : '' }, warn || ('每列定员 ' + U.fmtInt(x.m.cap * x.cars) + ' 人' + (x.old ? ' · ' + x.old + ' 列超龄' : '')))),
        h('button', { class: 'btn sm ghost', 'data-tip': '调回车辆段（之后可配给其他线路）', onclick: function () { if (x.ids.length === 1) out(1); else self.showTrainQty({ title: '调回车辆段 · ' + F.shortOf(x.m), icon: 'train', max: x.ids.length, btn: '调出', note: function (k) { return k + ' 列调回车辆段，之后可配给其他线路。'; }, apply: out }); } }, '调出'),
        h('button', { class: 'btn sm ghost', 'data-tip': '按残值出售，每列约 ' + U.fmtMoney(x.value / x.ids.length), onclick: function () { self.showTrainSell(x, done); } }, '出售'));
    };
    for (const s of info) {
      const card = h('div', { class: 'fo-svc' });
      card.appendChild(h('div', { class: 'fo-svc-kind' }, h('span', { class: 'tiny muted grow' }, kindOf(s)),
        s.svc ? h('button', { class: 'btn sm ghost', onclick: function () { self.showServiceEditor(lid, s.svc); } }, ic('pencil', 13), '编辑') : null,
        s.svc && (s.d === 0 || !s.rt.loop) ? h('button', { class: 'btn sm ghost', 'data-tip': '取消这个交路，列车回到全程交路', onclick: function () { const r = F.removeService(g, lid, s.svc); if (r.error) self.toast(r.error, 'bad'); else { sfx('serviceDel'); self.toast('已取消交路，列车回到全程交路', 'info'); done(); } } }, ic('close', 13), '取消') : null));
      card.appendChild(h('div', { class: 'fo-svc-h' }, h('span', { class: 'swatch', style: { background: lineColor(g, lid) } }), h('b', { class: 'grow' }, s.name),
        h('span', { class: 'tag' }, '周转 ' + Math.round(s.cycleMin) + ' 分钟'), h('span', { class: 'tag' }, '最长 ' + s.maxCars + ' 节')));
      const ids = new Set((pl[s.r] ? pl[s.r].units[s.d] : []).map(function (u) { return u.id; })); ids.forEach(function (id) { onRoute.add(id); });
      const gs = groupTrains(g, all.filter(function (t) { return ids.has(t.id); }));
      const units = h('div', { class: 'fo-units' });
      if (!gs.length) units.appendChild(h('div', { class: 'note' }, '这个交路还没有列车。'));
      for (const x of gs) units.appendChild(unitRow(x));
      card.appendChild(units);
      // 分时段（工作日）：投入列车、发车间隔、运力与最大断面客流
      const tbl = h('table', { class: 'tbl fo-tbl' }, h('tr', null, h('th', null, '时段'), h('th', null, '投入'), h('th', null, '间隔'), h('th', null, '运力/时'), h('th', null, '满载')));
      s.per.forEach(function (x, p) {
        if (!x) return;
        let cell;
        if (manual) {
          const cur = o.n && o.n[s.id] && o.n[s.id][p] != null ? Math.min(o.n[s.id][p], s.avail) : s.avail;
          const set = function (v) { F.setManual(g, lid, s.id, p, U.clamp(v, 0, s.avail)); done(); };
          cell = h('span', { class: 'fo-step' }, h('button', { class: 'iconbtn', disabled: cur <= 0 ? true : null, 'aria-label': '减少', onclick: function () { set(cur - 1); } }, ic('minus', 14)), h('b', null, String(cur)), h('button', { class: 'iconbtn', disabled: cur >= s.avail ? true : null, 'aria-label': '增加', onclick: function () { set(cur + 1); } }, ic('plus', 14)));
        } else cell = h('span', null, h('b', null, String(Math.min(x.run, s.avail))), x.needN > s.avail ? h('small', { class: 'bad' }, ' / 需 ' + x.needN) : null);   // 只有配属列车不够时才标出还需要几列
        tbl.appendChild(h('tr', null, h('td', null, PN[p]), h('td', null, cell), h('td', null, x.f > 0.05 ? U.fmtNum(60 / x.f, 1) + ' 分' : '停运'), h('td', null, U.fmtInt(x.capH)), h('td', { class: x.lf > 1 ? 'bad' : '' }, x.f > 0.05 ? U.fmtPct(x.lf, 0) : '—')));
      });
      card.appendChild(h('div', { class: 'tbl-wrap' }, tbl));
      card.appendChild(h('div', { class: 'row', style: { gap: '6px', marginTop: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn sm primary', onclick: function () { self.showTrainShop(lid, s.id, s.name, s.maxCars); } }, ic('plus', 14), '购买列车'),
        h('button', { class: 'btn sm', onclick: function () { self.showTrainTransfer(lid, s.id, s.name, s.maxCars); } }, ic('route', 14), '调入列车'),
        h('span', { class: 'grow tiny muted' }, '配属 ' + s.avail + ' 列 · 最低服务需要 ' + s.floor + ' 列')));
      el.appendChild(card);
    }
    // 编组超过站台长度、不能上线的列车
    const off = groupTrains(g, all.filter(function (t) { return !onRoute.has(t.id); }));
    if (off.length) {
      const lineKmh = CM.Metro.lineKmh(g.net.lines[lid]);
      el.appendChild(h('div', { class: 'fl-h' }, '不能上线的列车'));
      for (const x of off) el.appendChild(unitRow(x, lineKmh > 80 && x.m.kmh < lineKmh ? '最高 ' + x.m.kmh + ' km/h，低于本线 ' + lineKmh + ' km/h，调往其他线路或出售' : '编组超过本线站台长度，调往其他线路或出售'));
    }
    el.appendChild(this.sec('fo-rule', '列车运营说明', '', function () {
      return h('div', { class: 'note' }, h('ul', { class: 'tk-tips' },
        h('li', null, '发车频率由投入的列车数决定：间隔 ≈ 周转时间 ÷ 投入列车数，最小 2 分钟；支线单独配车，环线两个方向分别配车。'),
        h('li', null, '买车按车型与编组整列购买，编组不能超过沿线最小车站的站台长度；车型按城市与年代开放。'),
        h('li', null, '运营按车厢公里计费，老车型与超龄列车更费钱；出售按残值回收（买价的 75% 起逐年折旧，最低 8%）。'),
        h('li', null, '新线与延长按最低服务水平随线配车，费用计入建设；车辆段有闲置列车时先用闲置列车。'),
        h('li', null, '运行速度：速度越低，允许的转弯半径越小（40 km/h 约 100 m，120 km/h 约 600 m）；高于 80 km/h 的线路要用足够快的车型，运营费用也更高。'),
        h('li', null, '运行交路：快车跳过的车站不停车，节省时间但服务变少；区间车集中运力在客流大的一段。各交路分别配车，同一条轨道合计最多 ' + CFG.metro.fMax + ' 列/时，游戏不模拟越行。')));
    }, false, 'info'));
  };
  // 线路运行速度（v2.5 玩家反馈）：进入草案，确认后生效；改了速度的线路全线复核转弯半径，提速按全线长度计改造费
  UI.prototype.lineSpeedBlock = function (lid) {
    const g = this.g(), self = this, MM = CM.Metro, net = g.draft ? g.draft.net : g.net, L = net.lines[lid], cur = MM.lineKmh(L), y = g.clock.y;
    let tight = Infinity; for (const s of MM.lineSegs(net, lid)) { const v = MM.segGeom(net, s, g.city).minRadiusM; if (isFinite(v)) tight = Math.min(tight, v); }
    const ctl = h('div', { class: 'seg-ctl sm' }, CFG.metro.speedGrades.map(function (x) {
      const open = F.speedOpen(g.mapId, y, x.kmh), over = isFinite(tight) && tight < x.minR, on = cur === x.kmh;
      const tip = x.kmh + ' km/h：最小转弯半径 ' + x.minR + ' m，运营成本 ×' + x.ops.toFixed(2) + (x.track ? '，轨道造价附加 ' + Math.round(x.track * 100) + '%' : '') + (open.ok ? '' : '；需要最高速度不低于 ' + x.kmh + ' km/h 的车型' + (open.year ? '（' + open.year + ' 年起开放）' : '')) + (over ? '；本线最急处约 ' + Math.round(tight) + ' m，要先放缓弯道' : '');
      return h('button', { class: on ? 'on' : '', disabled: on || open.ok ? null : true, 'data-tip': tip, 'data-silent': '1', onclick: function () {
        if (on) return;
        const r = g.edit(function (n) { const l = n.lines[lid]; if (!l) return { error: '线路不存在' }; if (x.kmh === 80) delete l.speed; else l.speed = x.kmh; });
        if (r.error) self.toast(r.error, 'bad'); else { sfx(x.kmh > cur ? 'speedUp' : 'speedDown'); self.toast((L.name || '') + ' 运行速度改为 ' + x.kmh + ' km/h，确认建设后生效', 'info'); self.rerenderPage(); }
      } }, String(x.kmh));
    }));
    const G = MM.speedGrade(L);
    return h('div', { class: 'fo-speed' }, h('div', { class: 'fo-speed-h' }, h('b', { class: 'grow' }, '运行速度'), ctl, h('span', { class: 'tiny muted' }, 'km/h')),
      h('div', { class: 'tiny muted' }, '最小转弯半径 ' + G.minR + ' m' + (isFinite(tight) ? ' · 本线最急处约 ' + Math.round(tight) + ' m' : '') + ' · 运营成本 ×' + G.ops.toFixed(2)));
  };
  // 新增或编辑运行交路：选类型、区间与停靠站，预览用时后保存
  UI.prototype.showServiceEditor = function (lid, id) {
    const g = this.g(), self = this, MM = CM.Metro, C = g.compiled, net = g.net, L = net.lines[lid], tp = C.topo.get(lid);
    const bases = C.routes.filter(function (r) { return r.lineId === lid && !r.svc; });
    if (!L || !tp || !bases.length) { this.toast('线路运营后才能设置交路', 'bad'); return; }
    const old = id ? (L.svcs || []).find(function (x) { return x.id === id; }) : null, loop = tp.topo === 'loop', box = h('div');
    const xfer = function (sid) { const k = C.sIndex.get(sid); return k != null && C.stationLines[k].size > 1; };
    let ri = 0, ia = 0, ib = bases[0].stIds.length - 1, skip = new Set(), kind = 'express', named = false, name = '大站快车';
    if (old) {
      const plan = MM.svcStops(tp, old); name = old.name; named = true; skip = new Set(old.skip || []);
      if (plan) { ri = plan.ri; if (!loop) { ia = plan.ia; ib = plan.ib; } }
      kind = skip.size ? 'express' : 'short';
    }
    const base = function () { return bases[ri]; }, nameOf = function (sid) { return net.stations[sid].name; };
    const autoName = function () { if (!named) name = kind === 'express' ? '大站快车' : '区间车（' + nameOf(base().stIds[ia]) + '—' + nameOf(base().stIds[ib]) + '）'; };
    const preset = function (mode) {
      skip = new Set(); const st = base().stIds;
      for (let i = ia + 1; i < ib; i++) if (mode === 'alt' ? (i - ia) % 2 === 1 && !xfer(st[i]) : (mode === 'xfer' ? !xfer(st[i]) : false)) skip.add(st[i]);
    };
    if (!old) {
      if (loop) preset('alt'); else { ib = bases[0].stIds.length - 1; preset('alt'); }
      autoName();
    }
    const svOf = function () {
      const st = base().stIds, last = st.length - 1, sk = []; for (let i = loop ? 1 : ia + 1; i < (loop ? st.length : ib); i++) if (skip.has(st[i])) sk.push(st[i]);
      const sv = { id: old ? old.id : null, name: name.trim() || '加开交路', skip: sk };
      if (!loop) { if (ia > 0) sv.from = st[ia]; if (ib < last) sv.to = st[ib]; }
      if (bases.length > 1) sv.via = st[last];
      return sv;
    };
    const draw = function () {
      box.replaceChildren();
      const st = base().stIds, sv = svOf(), plan = MM.svcStops(tp, Object.assign({}, sv)), trial = plan ? MM.patternRoute(C, L, bases[plan.ri], sv, plan) : null;
      box.appendChild(h('div', { class: 'fo-sv-row' }, h('small', null, '类型'),
        h('div', { class: 'seg-ctl sm' }, [['express', '快车（跳站）'], ['short', '区间车']].filter(function (o) { return !loop || o[0] === 'express'; }).map(function (o) {
          return h('button', { class: kind === o[0] ? 'on' : '', 'data-silent': '1', onclick: function () {
            kind = o[0];
            if (kind === 'short') { const n = st.length, a = Math.floor(n * 0.2), b = Math.max(a + 1, Math.ceil(n * 0.8) - 1); ia = a; ib = Math.min(n - 1, b); skip = new Set(); }
            else { ia = 0; ib = st.length - 1; preset('alt'); }
            autoName(); draw();
          } }, o[1]);
        }))));
      const nameIn = h('input', { type: 'text', value: name, maxlength: 16, 'aria-label': '交路名称', placeholder: '交路名称' });
      nameIn.addEventListener('input', function () { name = nameIn.value; named = true; });
      box.appendChild(h('div', { class: 'fo-sv-row' }, h('small', null, '名称'), nameIn));
      if (bases.length > 1) {
        const sel = h('select', { 'aria-label': '支线方向' });
        bases.forEach(function (r, i) { sel.appendChild(h('option', { value: String(i), selected: i === ri ? 'selected' : null }, r.label)); });
        sel.addEventListener('change', function () { ri = +sel.value; ia = 0; ib = bases[ri].stIds.length - 1; skip = new Set(); autoName(); draw(); });
        box.appendChild(h('div', { class: 'fo-sv-row' }, h('small', null, '方向'), sel));
      }
      if (!loop) {
        const pick = function (label, cur, lo, hi, set) {
          const sel = h('select', { 'aria-label': label });
          for (let i = lo; i <= hi; i++) sel.appendChild(h('option', { value: String(i), selected: i === cur ? 'selected' : null }, nameOf(st[i])));
          sel.addEventListener('change', function () { set(+sel.value); autoName(); draw(); });
          return h('div', { class: 'fo-sv-row' }, h('small', null, label), sel);
        };
        box.appendChild(pick('起点站', ia, 0, ib - 1, function (v) { ia = v; }));
        box.appendChild(pick('终点站', ib, ia + 1, st.length - 1, function (v) { ib = v; }));
      }
      // 停靠站：点选切换；两端必须停靠
      const lo = loop ? 0 : ia, hi = loop ? st.length - 1 : ib, chips = h('div', { class: 'fo-sv-stops' });
      for (let i = lo; i <= hi; i++) {
        const sid = st[i], fixed = loop ? i === 0 : (i === ia || i === ib), stop = fixed || !skip.has(sid);
        chips.appendChild(h('button', { class: 'fo-sv-stop' + (stop ? ' on' : '') + (xfer(sid) ? ' xfer' : ''), disabled: fixed ? true : null, 'aria-pressed': stop ? 'true' : 'false', 'data-tip': fixed ? '起讫站必须停靠' : (stop ? '点击改为通过不停' : '点击改为停靠'), 'data-silent': '1', onclick: function () {
          if (skip.has(sid)) skip.delete(sid); else skip.add(sid);
          kind = skip.size ? 'express' : (ia > 0 || ib < st.length - 1 ? 'short' : kind); draw();
        } }, nameOf(sid)));
      }
      box.appendChild(h('div', { class: 'fo-sv-row top' }, h('small', null, '停靠站'), h('div', { class: 'grow' }, chips,
        h('div', { class: 'row', style: { gap: '6px', marginTop: '6px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm ghost', onclick: function () { preset('all'); kind = ia > 0 || ib < st.length - 1 ? 'short' : kind; draw(); } }, '全部停靠'),
          h('button', { class: 'btn sm ghost', onclick: function () { preset('alt'); kind = 'express'; autoName(); draw(); } }, '隔站停靠'),
          h('button', { class: 'btn sm ghost', onclick: function () { preset('xfer'); kind = 'express'; autoName(); draw(); } }, '只停换乘站')))));
      // 预览：单程用时、周转与开行所需列车
      const same = !sv.skip.length && !sv.from && !sv.to;
      if (trial) {
        const b = bases[plan.ri], a0 = loop ? 0 : plan.ia, a1 = loop ? b.legSec.length : plan.ib, dw = CFG.metro.dwell;
        let localSec = 0; for (let i = a0; i < a1; i++) localSec += b.legSec[i]; localSec += dw * Math.max(0, a1 - a0 - (loop ? 0 : 1));
        const expSec = trial.runSec + dw * Math.max(0, trial.stIds.length - (loop ? 0 : 2));
        box.appendChild(h('div', { class: 'fo-sum' },
          h('div', null, h('small', null, '停靠'), h('b', null, trial.stIds.length + ' 站'), trial.skipped ? h('small', { class: 'muted' }, '通过 ' + trial.skipped + ' 站') : null),
          h('div', null, h('small', null, '单程'), h('b', null, U.fmtNum(expSec / 60, 1) + ' 分钟'), h('small', { class: 'muted' }, '站站停 ' + U.fmtNum(localSec / 60, 1) + ' 分钟')),
          h('div', null, h('small', null, '周转'), h('b', null, Math.round(trial.cycleSec / 60) + ' 分钟'), h('small', { class: 'muted' }, '每小时 6 列约需 ' + Math.ceil(6 * trial.cycleSec / 3600) + ' 列')),
          h('div', null, h('small', null, '编组上限'), h('b', null, trial.cars + ' 节'))));
      }
      if (same) box.appendChild(h('div', { class: 'callout warn' }, '这样设置与全程站站停相同：请缩短区间或选择要通过的车站。'));
      box.appendChild(h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: function () { self.closeScreen(); self.rerenderPage(); } }, '取消'),
        h('button', { class: 'btn primary', disabled: same || !trial ? true : null, onclick: function () {
          const r = F.saveService(g, lid, svOf());
          if (r.error) { self.toast(r.error, 'bad'); return; }
          sfx('service');
          self.toast(old ? '已更新交路' : '已加开交路：购买或调入列车后开行', 'good');
          self.closeScreen(); self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage();
        } }, ic('check', 14), old ? '保存' : '加开')));
      if (CM.I18n) CM.I18n.localize(box);
    };
    draw();
    this.openScreen(h('div', { class: 'card wide' }, this.cardHead('route', 'b-blue', (old ? '编辑交路 · ' : '新增交路 · ') + L.name), h('div', { class: 'note' }, '只改运营组织，不收费、立即生效；交路在配属列车后开行。'), box), function () { self.closeScreen(); self.rerenderPage(); });
  };
  // 数量输入（v2.6.1 玩家反馈）：可以直接输入数字，也可以点加减；onChange 收到 1…max 的整数
  const qtyInput = function (val, max, onChange) {
    const inp = h('input', { class: 'fo-qty', type: 'number', min: 1, max: max, step: 1, 'aria-label': '数量' });
    inp.value = val;
    const set = function (v, typing) { const k = U.clamp(Math.round(+v) || 1, 1, max); if (!typing) inp.value = k; onChange(k); return k; };
    inp.addEventListener('input', function () { if (inp.value !== '') set(inp.value, true); });
    inp.addEventListener('blur', function () { set(inp.value || 1); });
    const el = h('span', { class: 'fo-step' },
      h('button', { class: 'iconbtn', 'aria-label': '减少', onclick: function () { set((+inp.value || 1) - 1); } }, ic('minus', 14)), inp,
      h('button', { class: 'iconbtn', 'aria-label': '增加', onclick: function () { set((+inp.value || 0) + 1); } }, ic('plus', 14)));
    return { el: el, set: set, inp: inp };
  };
  // 数量对话框：一次调出或出售多列
  UI.prototype.showTrainQty = function (o) {
    const self = this, noteEl = h('div', { class: 'note' });
    let n = 1;
    const upd = function () { noteEl.textContent = o.note(n); if (CM.I18n) CM.I18n.localize(noteEl); };
    const q = qtyInput(1, o.max, function (k) { n = k; upd(); });
    upd();
    this.openScreen(h('div', { class: 'card' }, this.cardHead(o.icon, 'b-blue', o.title),
      h('div', { class: 'fo-qty-row' }, h('small', null, '数量'), q.el, h('span', { class: 'tiny muted' }, '共 ' + o.max + ' 列'), h('button', { class: 'btn sm ghost', onclick: function () { q.set(o.max); } }, '全部')),
      noteEl,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', onclick: function () { self.closeScreen(); } }, '取消'), h('button', { class: 'btn primary', onclick: function () { self.closeScreen(); o.apply(n); } }, ic('check', 14), o.btn))), function () { self.closeScreen(); });
    q.inp.focus(); q.inp.select();
  };
  // 出售一组列车：先卖最旧的，按残值回收
  UI.prototype.showTrainSell = function (x, done) {
    const g = this.g(), self = this;
    const worth = function (k) { const pick = x.ids.slice(0, k); let v = 0; for (const t of g.fleet.trains) if (pick.indexOf(t.id) >= 0) v += F.residual(g, t); return v; };
    this.showTrainQty({ title: '出售列车 · ' + F.shortOf(x.m) + ' ' + x.cars + ' 节', icon: 'train', max: x.ids.length, btn: '出售', note: function (k) { return '先卖最旧的 ' + k + ' 列，按残值回收约 ' + U.fmtMoney(worth(k)) + '。'; },
      apply: function (k) { const r = F.sell(g, x.ids.slice(0, k)); if (r.ok) { sfx('trainSell'); self.toast('已出售 ' + r.n + ' 列，回收 ' + U.fmtMoney(r.value), 'good'); } done(); } });
  };
  // 车辆段智能分配：先看方案再确认；分配后还差的可以一次买够
  UI.prototype.showFleetAlloc = function () {
    const g = this.g(), self = this, plan = F.allocPlan(g), fill = F.fillCost(g, plan), box = h('div');
    const finish = function () { self.closeScreen(); self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage(); };
    if (!plan.needs.length) box.appendChild(h('div', { class: 'note' }, h('span', null, '各线高峰运力都够，不需要调车。'), plan.left ? h('span', null, '车辆段的 ' + plan.left + ' 列继续闲置。') : null));
    else {
      const t = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '交路'), h('th', null, '配属'), h('th', null, '高峰需要'), h('th', null, '调入'), h('th', null, '还差')));
      for (const x of plan.needs) t.appendChild(h('tr', null, h('td', null, h('span', { class: 'swatch', style: { background: lineColor(g, x.lid), marginRight: '6px' } }), x.name), h('td', null, String(x.avail)), h('td', null, String(x.need)), h('td', { class: x.ids.length ? 'good' : '' }, x.ids.length ? '+' + x.ids.length : '—'), h('td', { class: x.short ? 'bad' : '' }, String(x.short))));
      box.appendChild(h('div', { class: 'tbl-wrap' }, t));
      box.appendChild(h('div', { class: 'note' }, h('span', null, plan.left ? '车辆段可分配 ' + plan.moved + ' 列，剩 ' + plan.left + ' 列。' : '车辆段可分配 ' + plan.moved + ' 列。'), h('span', null, plan.unmet ? '分配后还差 ' + plan.unmet + ' 列。' : '分配后高峰运力够用。'), plan.left && plan.unmet ? h('span', null, '剩下的列车编组超过站台长度或速度不够，不能上线。') : null));
    }
    box.appendChild(h('div', { class: 'modal-actions' },
      h('button', { class: 'btn', onclick: function () { self.closeScreen(); } }, plan.needs.length ? '取消' : '完成'),
      fill.rows.length ? h('button', { class: 'btn', disabled: g.econ.canAffordBuild(fill.cost) ? null : true, 'data-tip': g.econ.canAffordBuild(fill.cost) ? '缺的列车按推荐车型购买并配属' : '资金不足：需要 ' + U.fmtMoney(fill.cost), onclick: function () {
        F.applyAlloc(g, plan);
        for (const r of fill.rows) { const res = F.buy(g, r.x.lid, r.x.svc, r.m.id, r.cars, r.n); if (res.error) { self.toast(res.error, 'bad'); break; } }
        sfx('trainBuy'); self.toast('已分配并买够缺口，约 ' + U.fmtMoney(fill.cost), 'good'); finish();
      } }, '分配并买够缺口（约 ' + U.fmtMoney(fill.cost) + '）') : null,
      plan.moved ? h('button', { class: 'btn primary', onclick: function () { const k = F.applyAlloc(g, plan); sfx('trainMove'); self.toast('已分配 ' + k + ' 列到缺车的线路', 'good'); finish(); } }, ic('check', 14), '按此分配') : null));
    if (CM.I18n) CM.I18n.localize(box);
    this.openScreen(h('div', { class: 'card wide' }, this.cardHead('train', 'b-blue', '智能分配列车'), h('div', { class: 'note' }, '把车辆段的闲置列车分给高峰缺口最大的线路，手动调度的线路不参与。'), box), function () { self.closeScreen(); });
  };
  // 购买列车（lid 为空时买入车辆段）
  UI.prototype.showTrainShop = function (lid, svc, svcName, maxCars) {
    const lineKmh = lid ? CM.Metro.lineKmh(this.g().net.lines[lid]) : 80, fast = function (m) { return lineKmh <= 80 || m.kmh >= lineKmh; };   // 高于 80 km/h 的线路只能用足够快的车型
    const g = this.g(), self = this, y = g.clock.y, list = F.available(g.mapId, y).filter(fast), soon = F.upcoming(g.mapId, y).filter(fast), col = lineColor(g, lid);
    let sel = list[0], cars = Math.min(maxCars, sel ? sel.max : 6), n = 1;
    const gap = function () { if (!lid) return F.allocPlan(g).unmet; const s = (F.lineInfo(g, lid) || []).find(function (x) { return x.id === svc; }); return s ? s.short : 0; };
    const box = h('div');
    // 车型卡片：未开放的车型变灰、不能选，标出开放年份
    const card = function (m, lock) {
      const kids = [h('span', { class: 'fo-pic', html: F.sideSVG(m, col, 168) }), h('b', null, F.nameOf(m)),
        lock ? h('span', { class: 'fo-lock' }, ic('lock', 12), h('span', null, m.from + ' 年开放'), h('span', null, '还有 ' + (m.from - y) + ' 年'))
          : h('span', { class: 'tiny muted' }, (m.maps ? '本市车型' : '通用车型') + ' · ' + m.from + (m.to < 9999 ? '–' + m.to : ' 年起')),
        h('span', { class: 'tiny' }, '每节 ' + m.cap + ' 人 · ' + m.kmh + ' km/h · 运营成本 ×' + m.ops.toFixed(2)),
        h('span', { class: 'tiny muted' }, F.descOf(m))];
      if (lock) return h('div', { class: 'fo-model locked' }, kids);
      return h('button', { class: 'fo-model' + (m === sel ? ' on' : ''), onclick: function () { sel = m; cars = Math.min(maxCars, m.max, Math.max(cars, 4)); draw(); } }, kids);
    };
    const draw = function () {
      box.replaceChildren();
      const grid = h('div', { class: 'fo-shop' });
      for (const m of list) grid.appendChild(card(m, false));
      if (soon.length) {
        grid.appendChild(h('div', { class: 'fo-shop-h' }, ic('lock', 13), '即将开放的车型（' + soon.length + '）'));
        for (const m of soon) grid.appendChild(card(m, true));
      }
      box.appendChild(grid);
      if (!sel) { box.appendChild(h('div', { class: 'note' }, '这一年没有可以购买的车型。')); return; }
      const opts = [4, 6, 8].filter(function (c) { return c <= Math.min(maxCars, sel.max); });
      if (opts.indexOf(cars) < 0) cars = opts[opts.length - 1] || 4;
      const each = F.price(g, sel, cars, y), totEl = h('b', null, U.fmtMoney(each * n));
      // 买得起的最多列数（资金不限时不提示）
      let afford = 999;
      if (!g.econ.isFree()) { afford = 0; while (afford < 999 && g.econ.canAffordBuild(each * (afford + 1))) afford++; }
      const q = qtyInput(n, 999, function (k) { n = k; totEl.textContent = U.fmtMoney(each * n); totEl.classList.toggle('bad', n > afford); if (CM.I18n) CM.I18n.localize(totEl); });
      totEl.classList.toggle('bad', n > afford);
      const need = gap();
      box.appendChild(h('div', { class: 'fo-buy' },
        h('div', null, h('small', null, '编组'), h('div', { class: 'seg-ctl sm' }, opts.map(function (c) { return h('button', { class: c === cars ? 'on' : '', 'data-silent': '1', onclick: function () { cars = c; draw(); } }, c + ' 节'); }))),
        h('div', null, h('small', null, '数量（列）'), q.el, h('div', { class: 'fo-presets' },
          h('button', { class: 'btn xs ghost', onclick: function () { q.set(n + 5); } }, '+5'), h('button', { class: 'btn xs ghost', onclick: function () { q.set(n + 10); } }, '+10'),
          need > 0 ? h('button', { class: 'btn xs ghost', 'data-tip': lid ? '这个交路高峰还差的列车数' : '全网分配完闲置列车后还差的列车数', onclick: function () { q.set(need); } }, '补足缺口 ' + need) : null,
          afford < 999 && afford > 0 ? h('button', { class: 'btn xs ghost', onclick: function () { q.set(afford); } }, '最多 ' + afford) : null)),
        h('div', null, h('small', null, '每列'), h('b', null, U.fmtMoney(each)), h('small', { class: 'muted' }, '定员 ' + U.fmtInt(sel.cap * cars) + ' 人')),
        h('div', null, h('small', null, '合计'), totEl)));
      if (!opts.length) box.appendChild(h('div', { class: 'callout warn' }, '本线站台最长 ' + maxCars + ' 节，' + F.shortOf(sel) + ' 没有合适的编组。'));
      box.appendChild(h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', onclick: function () { self.closeScreen(); } }, '取消'),
        h('button', { class: 'btn primary', disabled: !opts.length ? true : null, onclick: function () {
          const r = F.buy(g, lid, svc, sel.id, cars, n);
          if (r.error) { self.toast(r.error, 'bad'); return; }
          sfx('trainBuy');
          self.toast('已购买 ' + F.shortOf(sel) + ' ' + cars + ' 节 × ' + n + ' 列，' + (lid ? '配属' + svcName : '停入车辆段'), 'good');
          self.closeScreen(); self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage();
          if (!lid && F.allocPlan(g).moved) self.showFleetAlloc();   // 买入车辆段后直接看分配方案
        } }, ic('check', 14), '购买')));
      if (CM.I18n) CM.I18n.localize(box);
    };
    draw();
    this.openScreen(h('div', { class: 'card wide' }, this.cardHead('train', 'b-blue', lid ? '购买列车 · ' + svcName : '购买列车 · 车辆段'), h('div', { class: 'note' }, lid ? '本线站台最长 ' + maxCars + ' 节（受沿线最小车站限制）。买到的整列列车直接配属这个交路；车型按城市与年代开放。' : '买入后停在车辆段，可以按客流智能分配到缺车的线路。编组超过站台长度的列车不能上线，先看线路允许的编组；车型按城市与年代开放。'), box), function () { self.closeScreen(); });
  };
  // 调入列车：车辆段与其他线路的列车（按线路、车型与编组分组）
  UI.prototype.showTrainTransfer = function (lid, svc, svcName, maxCars) {
    const g = this.g(), self = this, box = h('div');
    const draw = function () {
      box.replaceChildren();
      const src = new Map();
      for (const t of g.fleet.trains) { if (t.line === lid && t.svc === svc) continue; const k = (t.line || '') + '|' + (t.line ? t.svc : ''); let a = src.get(k); if (!a) src.set(k, a = { line: t.line, svc: t.line ? t.svc : null, list: [] }); a.list.push(t); }
      const keys = Array.from(src.keys()).sort(function (a, b) { return (a[0] === '|' ? -1 : 0) - (b[0] === '|' ? -1 : 0); });
      if (!keys.length) box.appendChild(h('div', { class: 'note' }, '没有其他列车可以调入。'));
      for (const k of keys) {
        const s = src.get(k), L = s.line && g.net.lines[s.line];
        let use = '';
        if (L) { const inf = F.lineInfo(g, s.line) || [], av = inf.reduce(function (a, x) { return a + x.avail; }, 0), nd = inf.reduce(function (a, x) { return a + x.peakNeed; }, 0); use = '高峰需要 ' + nd + ' / 配属 ' + av + (av > nd ? '，约 ' + (av - nd) + ' 列富余' : ''); }
        const svcLabel = L && s.svc ? (F.lineInfo(g, s.line) || []).filter(function (x) { return x.id === s.svc; }).map(function (x) { return x.name; })[0] : null;
        box.appendChild(h('div', { class: 'fl-h' }, svcLabel || (L ? L.name : '车辆段（闲置）'), use ? h('span', { class: 'tiny muted', style: { marginLeft: '8px' } }, use) : null));
        const lineKmh = CM.Metro.lineKmh(g.net.lines[lid]);
        for (const x of groupTrains(g, s.list)) {
          const tooLong = x.cars > maxCars, slow = lineKmh > 80 && x.m.kmh < lineKmh, ok = !tooLong && !slow;
          box.appendChild(h('div', { class: 'fo-unit' },
            h('span', { class: 'fo-pic', html: F.sideSVG(x.m, lineColor(g, lid), 84) }),
            h('div', { class: 'grow' }, h('b', null, F.shortOf(x.m) + ' · ' + x.cars + ' 节 × ' + x.ids.length), ok ? null : h('small', { class: 'bad' }, tooLong ? '编组超过本线站台长度（最长 ' + maxCars + ' 节）' : '最高 ' + x.m.kmh + ' km/h，低于本线运行速度 ' + lineKmh + ' km/h')),
            h('button', { class: 'btn sm', disabled: ok ? null : true, onclick: function () { sfx('trainMove'); F.move(g, [x.ids[x.ids.length - 1]], lid, svc); draw(); self.markUnsaved(); } }, '调入 1 列'),
            x.ids.length > 1 ? h('button', { class: 'btn sm ghost', disabled: ok ? null : true, onclick: function () { sfx('trainMove'); F.move(g, x.ids.slice(), lid, svc); draw(); self.markUnsaved(); } }, '全部') : null));
        }
      }
      box.appendChild(h('div', { class: 'modal-actions' }, h('button', { class: 'btn primary', onclick: function () { self.closeScreen(); self.scheduleAutosave(); self.rerenderPage(); } }, '完成')));
      if (CM.I18n) CM.I18n.localize(box);
    };
    draw();
    this.openScreen(h('div', { class: 'card wide' }, this.cardHead('route', 'b-blue', '调入列车 · ' + svcName), h('div', { class: 'note' }, '把车辆段的闲置列车或其他线路富余的列车调到这个交路，立即生效、不收费。'), box), function () { self.closeScreen(); self.rerenderPage(); });
  };
  // 车队总览
  UI.prototype.page_fleet = function () {
    const g = this.g(), self = this, fl = g.fleet; if (!fl) return null;
    const el = h('div'), old = fl.trains.filter(function (t) { return ageY(g, t) > F.model(t.model).life; }).length;
    let value = 0; for (const t of fl.trains) value += F.residual(g, t);
    const depot = fl.trains.filter(function (t) { return !t.line; });
    el.appendChild(h('div', { class: 'fo-sum' },
      h('div', null, h('small', null, '列车'), h('b', null, fl.trains.length + ' 列')),
      h('div', null, h('small', null, '车辆段闲置'), h('b', null, depot.length + ' 列')),
      h('div', null, h('small', null, '残值合计'), h('b', null, U.fmtMoney(value))),
      h('div', null, h('small', null, '超龄'), h('b', { class: old ? 'bad' : '' }, old + ' 列'))));
    const tbl = h('table', { class: 'tbl' }, h('tr', null, h('th', null, '线路'), h('th', null, '配属'), h('th', null, '高峰需要'), h('th', null, '运营')));
    for (const lid of M_sort(Object.keys(g.net.lines))) {
      const L = g.net.lines[lid], inf = F.lineInfo(g, lid) || [], av = inf.reduce(function (a, x) { return a + x.avail; }, 0), nd = inf.reduce(function (a, x) { return a + x.peakNeed; }, 0), o = fl.ops[lid];
      tbl.appendChild(h('tr', { class: 'clickable', onclick: function () { if (self.opsApp) self.opsApp.go('lines', lid); else self.openObj('line', lid, 'ops'); } }, h('td', null, h('span', { class: 'swatch', style: { background: AX.line(L), marginRight: '6px' } }), L.name), h('td', null, String(av)), h('td', { class: nd > av ? 'bad' : '' }, String(nd)), h('td', null, o && o.mode === 'manual' ? '手动' : '智能')));
    }
    el.appendChild(h('div', { class: 'tbl-wrap' }, tbl));
    el.appendChild(h('div', { class: 'fl-h fo-svc-head', style: { marginTop: '10px' } }, h('span', { class: 'grow' }, '车辆段'),
      h('button', { class: 'btn sm', onclick: function () { self.showTrainShop(null, null, '车辆段', 8); } }, ic('plus', 14), '购买入库'),
      h('button', { class: 'btn sm primary', onclick: function () { self.showFleetAlloc(); } }, ic('train', 14), '智能分配')));
    const auto = !!fl.autoAlloc;
    el.appendChild(h('div', { class: 'fo-auto' }, h('span', { class: 'grow' }, h('b', null, '每月自动分配闲置列车'), h('small', null, '每月初把车辆段的列车分给缺车的线路，不会自动买车')),
      h('button', { class: 'switch' + (auto ? ' on' : ''), role: 'switch', 'aria-checked': auto ? 'true' : 'false', 'aria-label': '每月自动分配闲置列车', onclick: function () { fl.autoAlloc = !fl.autoAlloc; sfx('toggle'); self.markUnsaved(); self.rerenderPage(); } }, h('i'))));
    if (!depot.length) el.appendChild(h('div', { class: 'note' }, '没有闲置列车。线路调整后没有归属的列车、从线路调回的列车和买入车辆段的列车停在这里。'));
    const refresh = function () { self.markUnsaved(); self.scheduleAutosave(); self.rerenderPage(); };
    for (const x of groupTrains(g, depot)) el.appendChild(h('div', { class: 'fo-unit' },
      h('span', { class: 'fo-pic', html: F.sideSVG(x.m, '#2f6fa8', 84) }),
      h('div', { class: 'grow' }, h('b', null, F.shortOf(x.m) + ' · ' + x.cars + ' 节 × ' + x.ids.length), h('small', null, '残值约 ' + U.fmtMoney(x.value) + (x.old ? ' · ' + x.old + ' 列超龄' : ''))),
      h('button', { class: 'btn sm ghost', onclick: function () { self.showTrainSell(x, refresh); } }, '出售')));
    el.appendChild(h('div', { class: 'note', style: { marginTop: '8px' } }, '在线路的「列车运营」分页也可以调入车辆段的列车，或为单个交路买车。'));
    // 车型一览：当年在售与以后开放的车型
    const y = g.clock.y, ml = h('div', { class: 'fo-units' });
    for (const m of F.available(g.mapId, y).concat(F.upcoming(g.mapId, y))) {
      const on = m.from <= y;
      ml.appendChild(h('div', { class: 'fo-unit' + (on ? '' : ' locked') },
        h('span', { class: 'fo-pic', html: F.sideSVG(m, '#2f6fa8', 60) }),
        h('div', { class: 'grow' }, h('b', null, F.nameOf(m)), h('small', null, '每节 ' + m.cap + ' 人 · 运营成本 ×' + m.ops.toFixed(2))),
        on ? h('small', { class: 'good fo-st' }, '在售') : h('span', { class: 'fo-lock fo-st' }, ic('lock', 12), m.from + ' 年开放')));
    }
    el.appendChild(h('div', { class: 'fl-h', style: { marginTop: '12px' } }, '车型一览'));
    el.appendChild(ml);
    el.appendChild(h('div', { class: 'note' }, '车型按城市与年代开放：开放当年 1 月会发出通知，已停产的车型不再列出。'));
    return { title: '车队', el: el };
  };
  const M_sort = function (ids) { return CM.Metro.sortIds(ids); };
})(window.CM);
