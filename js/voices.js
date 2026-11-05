'use strict';
// 乘客之声（v2.3）：右下角的满意度入口与乘客反馈。每条反馈都来自模拟数据——片区的地铁步行覆盖、新开车站、
// 站外换乘的步行距离与天地换乘、车站与区间的高峰拥挤、票价负担、道路拥堵、重要设施的接驳与最近一次建设的效果——
// 按受影响的人数排序。同一月份、同一线网生成的内容固定（措辞按对象与月份选取：同一位市民每月换个说法，关注后能看到新动态），不是随机抽取
(function (CM) {
  const U = CM.U, CFG = CM.CFG, h = U.h, ic = function (n, s) { return CM.icon(n, s); };
  const pick = function (arr, seed) { return arr[Math.abs(seed | 0) % arr.length]; };
  const hash = function (s) { let x = 2166136261; for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
  const short = function (s) { return String(s || '').replace(/（.*?）/g, '').replace(/一带$/, ''); };
  // 发帖人：按话题与地点生成固定的昵称与头像颜色
  const ROLE = {
    cover: ['打工人', '早起通勤族', '带娃的妈妈', '退休阿姨', '老街坊'],
    newst: ['新住户', '上班族', '大学生', '老街坊', '通勤小王'],
    xfer: ['换乘达人', '通勤族', '拖箱子的旅客', '腿脚不便的阿伯'],
    crowd: ['早高峰幸存者', '挤地铁的上班族', '学生党', '沙丁鱼本鱼'],
    fare: ['精打细算的上班族', '学生党', '退休阿姨'],
    road: ['开车上班的', '公交司机', '出租车师傅', '骑车通勤族'],
    fac: ['带老人看病的', '周末逛街的', '来旅游的', '看球的球迷'],
    line: ['通勤族', '上班族', '线路粉丝'],
    city: ['本地市民', '老街坊', '城市观察员'],
  };
  const AVA = ['#e4572e', '#2e86ab', '#7a5195', '#16a085', '#f18f01', '#c0392b', '#3b8ea5', '#8e44ad', '#2f9e44', '#d35400'];
  const HANDLE = { cover: 'home', newst: 'newbie', xfer: 'transfer', crowd: 'rushhour', fare: 'budget', road: 'driver', fac: 'weekend', line: 'commuter', city: 'citizen' };
  const author = function (topic, place, seed, role) { const nick = (place ? short(place) : '') + (role || pick(ROLE[topic] || ROLE.city, seed)); return { nick: nick, color: AVA[seed % AVA.length], ch: nick.charAt(0), handle: '@' + (HANDLE[topic] || 'rider') + '_' + (1000 + seed % 9000) }; };
  // 设施类反馈的发帖人按设施类型（医院、商圈、景点、球场、大学…）
  const FAC_ROLE = { hosp: '带老人看病的', shop: '周末逛街的', cbd: '写字楼上班族', scenic: '来旅游的', park: '周末遛娃的', stadium: '看球的球迷', venue: '看展的', uni: '大学生' };
  // 反馈措辞：每个话题两三种说法，按对象稳定选取
  const SAY = {
    cover: ['{p}住了这么多人，最近的地铁站还要走二十多分钟，什么时候能修到我们这儿？', '每天从{p}出门先挤公交再换地铁，单程一个多小时。', '{p}这边连个地铁站都没有，下雨天出门太难了。'],
    newst: ['我家附近终于有地铁了！{s}站开通，出门走几分钟就到。', '{s}站开通后上班少走好远，早上能多睡二十分钟。', '第一次从{s}站坐地铁，车站很新，人也不多。'],
    xfer: ['在{s}换乘到{t}要出站走 {m} 米再进站，太绕了。', '{s}和{t}要是能在一个站里换乘就好了，现在要走 {m} 米。'],
    level: ['在{s}站换乘要上下好几层，每次多走两三分钟。', '{s}站换乘的楼梯太长了，提着东西很累。'],
    crowd: ['早高峰{s}站排队进站排到了出口外面。', '{s}站早上人太多了，闸机前挤成一团。'],
    linecrowd: ['{l}早高峰太挤了，在{s}站等了两趟才挤上去。', '{l}从{s}到{t}这段车厢里转身都难，能不能加车？'],
    linegood: ['{l}准点又快，从{s}坐到{t}很省心。', '每天坐{l}通勤，比以前开车稳定多了。'],
    fare: ['票价有点贵，每天来回要 {f}。', '地铁是方便，可每月光车费就要不少钱。'],
    road: ['{r}早高峰堵得动不了，要是有地铁就好了。', '每天在{r}上堵半小时，羡慕住在地铁边的同事。'],
    roadok: ['{r}最近好像没那么堵了，地铁分走了不少人。'],
    fac: ['去{x}还得打车或转好几趟公交，附近没有地铁站。', '{x}离最近的地铁站太远了，希望能修过去。'],
    impact: ['新线开通后，地铁出行多了 {d}，身边越来越多人改坐地铁。', '新线开通以后上班终于不用堵在路上了。'],
    satlow: ['地铁修得太慢了，城市都长这么大了。', '希望地铁规划多听听乘客的声音。'],
    sathigh: ['这几年坐地铁越来越方便了，给地铁点个赞。', '地铁越修越好，出门基本不用开车了。'],
  };
  // 同一话题的多条反馈依次换用不同说法
  let used = {};
  const say = function (arr, seed) { const k = arr[0]; used[k] = used[k] == null ? seed % arr.length : used[k] + 1; return arr[used[k] % arr.length]; };
  const fill = function (t, v) { return t.replace(/\{(\w)\}/g, function (m, k) { return v[k] != null ? v[k] : ''; }); };
  const Voices = { cache: null };
  // 生成本月的反馈（周平均日、工作日早高峰等已发布结果）；kind：bad 吐槽 / good 点赞 / idea 建议
  Voices.generate = function (g) {
    const m = g.model; if (!m.trafficReady() || !m.net) return [];
    const key = g.ym() + ':' + g.netVersion + ':' + (g.impactReport && g.impactReport.version || 0);
    if (Voices.cache && Voices.cache.g === g && Voices.cache.key === key) return Voices.cache.list;
    const out = [], C = m.net.C, acc = m.net.acc, ym = g.ym(), sd = m.stDailyWk || m.stDaily;
    used = {};
    // 回复里用到的小工具：片区最近的运营车站、车站的线路、道路的早高峰拥堵指数
    const nearSt = function (z) { const cells = m.zoneCells[z] || []; let x = 0, y = 0; for (const c of cells) { x += c % g.city.W + 0.5; y += Math.floor(c / g.city.W) + 0.5; } if (!cells.length) return null; x /= cells.length; y /= cells.length; let best = null, bd = 1e9; C.stations.forEach(function (s, k) { if (!C.serviced[k]) return; const dd = U.dist(s.x, s.y, x, y); if (dd < bd) { bd = dd; best = s.name; } }); return best ? { name: best, km: bd * CFG.CELL_M / 1000 } : null; };
    const lineNames = function (i) { return Array.from(C.stationLines[i] || []).map(function (l) { return g.net.lines[l] ? g.net.lines[l].name : ''; }).filter(Boolean); };
    const roadCi = function (name) { const Pw = m.resultsFor('wd').per[0]; let num = 0, den = 0; for (const L of m.road.links) { if (L.name !== name) continue; for (let k = 0; k < 2; k++) { const a = 2 * L.id + k, v = Pw.arcVol[a]; num += v * L.lenM * Pw.arcTime[a] / m.road.arcT0[a]; den += v * L.lenM; } } return den > 0 ? num / den : 1; };
    // dd：可附的随手涂鸦（话题与图上的文字），约四成动态带图，按动态固定
    // meta：回复里引用的模拟数据（客流、负荷、步行距离等），见 Voices.replies
    // 发帖人的身份按话题与地点（道路、线路、设施）固定：同一片区、同一座车站的市民每月都是同一个人，可以关注（v2.3）
    const post = function (kind, topic, text, people, at, tags, place, role, dd, meta) {
      const seed = hash(topic + text), likes = Math.max(3, Math.round(Math.sqrt(Math.max(0, people)) * 1.6 + seed % 17));
      const who = author(topic, place, hash(topic + '|' + (place || (at && (at.road || at.line || at.fac)) || '') + '|' + (role || '')), role);
      out.push({ id: seed, ym: ym, kind: kind, topic: topic, text: text, at: at || null, tags: tags, place: place || '', who: who, w: people, dd: dd || null, meta: meta || {},
        likes: likes, replies: Math.round(Math.sqrt(Math.max(0, people)) / 6 + seed % 9), reposts: Math.round(likes * (0.12 + (seed % 7) / 40)), views: likes * (14 + seed % 23), ago: 1 + seed % 26 });
    };
    // 片区覆盖：人口多但步行 15 分钟内没有车站
    const gaps = [];
    for (let z = 0; z < m.Z; z++) if (m.zPop[z] > 6000 && (acc.zCov[z] || 0) < 0.15) gaps.push(z);
    gaps.sort(function (a, b) { return m.zPop[b] - m.zPop[a]; });
    for (const z of gaps.slice(0, 3)) { const p = g.zoneName(z).replace(/（.*?）/, '').replace(/一带$/, ''); post('bad', 'cover', fill(say(SAY.cover, z + ym), { p: p }), m.zPop[z], { zone: z }, ['覆盖'], p, null, ['cover'], { p: p, pop: m.zPop[z], near: nearSt(z) }); }
    // 新开车站（近 6 个月）
    const fresh = [];
    C.stations.forEach(function (s, i) { const st = g.net.stations[s.id]; if (st && st.built && ym - U.ymIndex(st.built[0], st.built[1]) <= 6 && C.serviced[i]) fresh.push(i); });
    fresh.sort(function (a, b) { return (sd ? sd.inn[b] : 0) - (sd ? sd.inn[a] : 0); });
    for (const i of fresh.slice(0, 3)) { const s = C.stations[i]; post('good', 'newst', fill(say(SAY.newst, hash(s.id) + ym), { s: s.name }), sd ? sd.inn[i] : 2000, { station: s.id }, ['新站'], s.name, null, ['newst', { s: s.name }], { s: s.name, flow: sd ? sd.inn[i] + sd.out[i] : 0, lines: lineNames(i) }); }
    // 站外换乘：步行超过 250 m
    const xs = acc.transfers.filter(function (t) { return t.a < t.b && t.m > 250; }).sort(function (a, b) { return b.m - a.m; });
    for (const t of xs.slice(0, 2)) { const a = C.stations[t.a], b = C.stations[t.b], flow = sd ? sd.xfer[t.a] + sd.xfer[t.b] : 1000; post(hash(a.id) % 3 ? 'bad' : 'idea', 'xfer', fill(say(SAY.xfer, hash(a.id + b.id) + ym), { s: a.name, t: b.name, m: Math.round(t.m) }), flow + 800, { station: a.id }, ['换乘'], a.name, null, ['xfer', { s: a.name, t: b.name, m: Math.round(t.m) }], { s: a.name, t: b.name, m: Math.round(t.m), xf: flow }); }
    // 天地换乘（不同层站台）
    C.stations.forEach(function (s, i) { const lv = C.stLevels && C.stLevels[i]; if (lv && lv.length > 1 && sd && sd.xfer[i] > 3000 && out.filter(function (p) { return p.topic === 'xfer'; }).length < 3) post('bad', 'xfer', fill(say(SAY.level, hash(s.id) + ym), { s: s.name }), sd.xfer[i], { station: s.id }, ['换乘'], s.name, null, ['level'], { s: s.name, xf: sd.xfer[i], levels: true }); });
    // 车站高峰拥挤
    if (sd) {
      const crowd = [];
      C.stations.forEach(function (s, i) { const r = (sd.peak[i] || 0) / CFG.metro.stationCap[s.size]; if (r > 0.9) crowd.push([i, r]); });
      crowd.sort(function (a, b) { return b[1] - a[1]; });
      for (const c of crowd.slice(0, 2)) { const s = C.stations[c[0]]; post('bad', 'crowd', fill(say(SAY.crowd, hash(s.id) + ym), { s: s.name }), sd.inn[c[0]] + sd.out[c[0]], { station: s.id }, ['拥挤'], s.name, null, ['crowd', { s: s.name }], { s: s.name, peak: sd.peak[c[0]], cap: CFG.metro.stationCap[s.size], size: s.size }); }
    }
    // 线路：最挤的区段与表现好的线路
    const lc = CM.Tasks ? CM.Tasks.crowdOf(g) : [], ls = CM.Tasks ? CM.Tasks.lineStats(g) : new Map();
    for (const x of lc) {
      const L = g.net.lines[x.lid], a = C.stations[x.a], b = C.stations[x.b]; if (!L || !a || !b) continue;
      const riders = (ls.get(x.lid) || {}).riders || 0;
      if (x.lf > 1) post('bad', 'crowd', fill(say(SAY.linecrowd, hash(x.lid) + ym), { l: L.name, s: a.name, t: b.name }), riders, { line: x.lid }, ['拥挤', L.name], '', null, ['crowd', { s: a.name }], { l: L.name, s: a.name, t: b.name, lf: x.lf, riders: riders });
      else if (x.lf < 0.75 && riders > 20000 && out.filter(function (p) { return p.topic === 'line'; }).length < 2) post('good', 'line', fill(say(SAY.linegood, hash(x.lid) + ym), { l: L.name, s: a.name, t: b.name }), riders / 2, { line: x.lid }, [L.name], '', null, ['line', { l: L.name }], { l: L.name, riders: riders, lf: x.lf });
    }
    // 票价负担（与满意度同一公式）
    const sf = g.econ.satFactors, d = m.daily || {};
    const fv = sf ? (sf.factors.find(function (f) { return /票价负担/.test(f.label); }) || {}).v || 0 : 0;
    if (fv < -1.5 && d.metro > 0) { const f2 = U.cur(d.avgFare * 2).toFixed(1); post('bad', 'fare', fill(say(SAY.fare, ym), { f: f2 + ' ' + CFG.money.unit }), d.metro * 0.3, null, ['票价'], '', null, ['fare', { f: f2 }], { f: U.cur(d.avgFare).toFixed(2) }); }
    // 道路拥堵：工作日早高峰最拥堵的主要道路（按拥堵车公里）
    const road = m.road, P = m.resultsFor('wd').per[0], byName = new Map();
    for (const L of road.links) { if (!L.name || L.cls < 3) continue; for (let k = 0; k < 2; k++) { const a = 2 * L.id + k, x = P.arcTime[a] / road.arcT0[a]; if (x < 1.35) continue; byName.set(L.name, (byName.get(L.name) || 0) + P.arcVol[a] * L.lenM / 1000 * (x - 1)); } }
    Array.from(byName.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 2).forEach(function (e) { const name = g.city.roadNames[e[0]]; if (name) post('bad', 'road', fill(say(SAY.road, hash(name) + ym), { r: name }), e[1] * 2, { road: name }, ['堵车'], '', null, ['road', { r: name }], { r: name, ci: roadCi(e[0]) }); });
    const ir = g.impactReport;
    if (ir && ir.status === 'done' && ym - U.ymIndex(ir.at[0], ir.at[1]) <= 3) {
      if (ir.roads && ir.roads.length) post('good', 'road', fill(SAY.roadok[0], { r: ir.roads[0].name }), 6000, { road: ir.roads[0].name }, ['堵车'], '', null, ['roadok'], { r: ir.roads[0].name, ok: true });
      const ds = (ir.draft.metroShare - ir.base.metroShare) * 100;
      if (ds > 0.2) post('good', 'line', fill(say(SAY.impact, ym), { d: U.fmtNum(ds, 1) + ' 个百分点' }), ir.draft.metro - ir.base.metro, null, ['新线'], '', null, ['impact'], { share: ir.draft.metroShare, add: ir.draft.metro - ir.base.metro });
    }
    // 重要设施：到访量大但乘地铁比例很低
    if (m.fn && CM.Tasks) {
      const fs = [];
      for (const f of m.fn.list) { if (f.T.hub) continue; const r = CM.Tasks.facShareOf(m, f, CM.Tasks.facBasis(f)); if (r && r.vol > 4000 && r.share < 0.08) fs.push([f, r.vol, r.share]); }
      fs.sort(function (a, b) { return b[1] - a[1]; });
      for (const x of fs.slice(0, 2)) post('idea', 'fac', fill(say(SAY.fac, hash(x[0].id) + ym), { x: x[0].name }), x[1], { fac: x[0].id }, ['接驳'], '', FAC_ROLE[x[0].t], ['fac', { x: short(x[0].name) }], { x: short(x[0].name), vol: x[1], share: x[2] });
    }
    // 总体口碑
    if (g.econ.sat >= 75) post('good', 'city', pick(SAY.sathigh, ym), 5000, null, ['点赞'], CM.DATA.city, null, ['line', {}], { sat: g.econ.sat, share: d.metroShare || 0 });
    else if (g.econ.sat < 45) post('bad', 'city', pick(SAY.satlow, ym), 5000, null, ['建议'], CM.DATA.city, null, null, { sat: g.econ.sat, share: d.metroShare || 0 });
    out.sort(function (a, b) { return b.likes - a.likes; });
    const list = out.slice(0, 14);
    // 配图：按动态固定约三成带图，同一种涂鸦只出现一次；靠前的几条里至少一条带图
    const usedPic = new Set();
    for (const p of list) if (p.dd && p.id % 10 < 4 && !usedPic.has(p.dd[0])) { p.pic = p.dd; usedPic.add(p.dd[0]); }
    if (!list.slice(0, 4).some(function (p) { return p.pic; })) { const f = list.slice(0, 4).find(function (p) { return p.dd; }); if (f) f.pic = f.dd; }
    archive(g, list);
    Voices.cache = { g: g, key: key, list: list };
    return list;
  };
  // 关注市民（v2.3）：关注后，他们每月的新动态存进存档（每人最多 12 条），在「关注」里随时回看；随存档保存
  const ARCH = 12;
  const BIO = { cover: '住在{p}，盼着地铁修到家门口', newst: '常在{p}站进出', xfer: '每天在{p}站换乘', crowd: '每天早高峰挤地铁', fare: '精打细算过日子', road: '每天在路上通勤', fac: '常去{p}', line: '每天坐地铁通勤', city: '关心城市发展的{p}市民' };
  const bioOf = function (p) { return fill(BIO[p.topic] || BIO.city, { p: short(p.place) || (p.meta && (p.meta.x || p.meta.r || p.meta.l)) || '' }).replace(/^住在，|^常去$/, ''); };
  const keep = function (p) { return { id: p.id, ym: p.ym, kind: p.kind, topic: p.topic, text: p.text, tags: p.tags, at: p.at, place: p.place, meta: p.meta, pic: p.pic || null, likes: p.likes, replies: p.replies, reposts: p.reposts, views: p.views, ago: p.ago }; };
  const archive = function (g, list) {
    const F = Voices.follows(g);
    for (const p of list) { const f = F[p.who.handle]; if (!f || f.posts.some(function (q) { return q.id === p.id; })) continue; f.posts.unshift(keep(p)); if (f.posts.length > ARCH) f.posts.length = ARCH; }
  };
  Voices.bioOf = bioOf;
  Voices.follows = function (g) { return (g && g.voices && g.voices.follow) || {}; };
  Voices.isFollowed = function (g, hd) { return !!Voices.follows(g)[hd]; };
  Voices.setFollow = function (g, p, on) {
    const V = g.voices || (g.voices = { follow: {}, seen: 0 }), hd = p.who.handle;
    if (!on) { delete V.follow[hd]; return false; }
    if (!V.follow[hd]) { V.follow[hd] = { who: { nick: p.who.nick, color: p.who.color, ch: p.who.ch, handle: hd }, bio: bioOf(p), since: g.ym(), posts: [] }; archive(g, Voices.generate(g)); }
    return true;
  };
  // 某位市民的动态：本月的加上关注后存下的，新的在前
  Voices.postsOf = function (g, hd) {
    const f = Voices.follows(g)[hd], arch = f ? f.posts : [];
    // 与存档里同一条动态（措辞相同）按第一次出现的月份显示
    const out = Voices.generate(g).filter(function (p) { return p.who.handle === hd; }).map(function (p) { const q = arch.find(function (x) { return x.id === p.id; }); return q && q.ym < p.ym ? Object.assign({}, p, { ym: q.ym, ago: q.ago }) : p; });
    for (const q of arch) if (!out.some(function (p) { return p.id === q.id; })) out.push(Object.assign({ who: f.who }, q));
    return out.sort(function (a, b) { return (b.ym || 0) - (a.ym || 0) || a.ago - b.ago; });
  };
  // 关注的人在上次打开「关注」之后发的新动态数（关注当月已有的动态不算）
  Voices.newCount = function (g) {
    const F = Voices.follows(g), seen = (g.voices && g.voices.seen) || 0; let n = 0;
    for (const k in F) for (const q of F[k].posts) if (q.ym > Math.max(seen, F[k].since)) n++;
    return n;
  };
  Voices.badCount = function (g) { return Voices.generate(g).filter(function (p) { return p.kind === 'bad'; }).length; };
  // 评论区（v2.3）：每条动态两三条回复，内容引用同一份模拟数据（片区人口与最近车站、车站负荷、换乘步行、线路满载率、
  // 道路拥堵指数、设施到访与地铁比例、票价……），运营方账号对其中一部分作出说明。按动态固定，不随机
  const RP = {
    cover: ['{p}这一片住着约 {pop}人，离最近的「{st}」站直线还有 {km} km。', '+1，每天出门光走到车站就要二十多分钟。'],
    coverOff: '已收到。{p}的居住人口与通勤需求已经记录，线网规划会优先研究这一带。',
    newst: ['{s}站开通后，日均进出站约 {flow}人次，比想象中热闹。', '在这里还能换乘 {lines}，方便多了。', '终于不用再转两趟公交了！'],
    xfer: ['{m} 米大约要走 {min} 分钟，加上进出闸机更久。', '同感，{s}和{t}要是能同站换乘就好了。'],
    xferOff: '两站之间步行约 {min} 分钟，每天约 {xf}人次在这里换乘，已转交规划研究同站换乘。',
    level: ['天地换乘要走一段垂直通道，高峰时电梯口排长队。', '每天约 {xf}人次在{s}站换乘，确实该优化。'],
    crowd: ['{s}站高峰小时进出站约 {peak} 人次，设计容量 {cap}，负荷 {pct}。', '建议把{s}站扩建成大型站。', '我现在都提前二十分钟出门。'],
    crowdOff: '高峰时段已加派站务疏导客流；车站扩建与列车加长正在评估。',
    lineCrowd: ['{l}最挤的一段早高峰满载率约 {lf}。', '{l}每天上车约 {riders}人次，不挤才怪。', '能不能升级沿线车站，把列车加长？'],
    lineGood: ['{l}每天上车约 {riders}人次，早高峰最挤的区段满载率也只有 {lf}。', '同感，换乘也方便。'],
    impact: ['地铁出行分担率已经到 {share}。', '新线开通后，每天多了约 {add}人次坐地铁。'],
    fare: ['平均每次乘车约 {f} 元。', '能不能出个月票或学生优惠？', '票款也要养活运营，地铁本来就不太赚钱。'],
    road: ['{r}早高峰拥堵指数约 {ci}（1.0 为畅通，1.6 以上为严重拥堵）。', '坐地铁至少能准时到。'],
    roadOk: ['{r}最近确实顺多了。', '车少了，公交也快了。'],
    fac: ['{x}每天约 {vol}人次到访，坐地铁来的只有 {share}。', '附近要是有站，周末肯定更方便。'],
    city: ['本月乘客满意度 {sat} 分，地铁分担率 {share}。', '同意！'],
  };
  const fillN = function (t, v) { return t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : ''; }); };
  Voices.replies = function (g, p) {
    const M = p.meta || {}, out = [], off = { nick: (CM.DATA.city || '') + '地铁', handle: '@metro_official', color: 'var(--x-blue)', ch: '', official: true };
    const add = function (tpl, v, official) {
      const sd = hash(p.id + ':' + out.length);
      out.push({ id: sd, who: official ? off : author(p.topic, null, sd), text: fillN(tpl, v), ago: Math.max(1, p.ago - sd % Math.max(1, p.ago)), likes: Math.max(1, Math.round(p.likes * (0.04 + (sd % 30) / 100))), official: !!official });
    };
    const pct = function (v) { return U.fmtPct(v, 0); }, ppl = function (v) { return U.fmtPeople(v); };
    switch (p.topic) {
      case 'cover': { const nr = M.near || {}; const v = { p: M.p || p.place, pop: ppl(M.pop || 0), st: nr.name || '', km: nr.km != null ? U.fmtNum(nr.km, 1) : '?' }; if (nr.name) add(RP.cover[0], v); add(RP.cover[1], v); add(RP.coverOff, v, true); break; }
      case 'newst': { const v = { s: M.s, flow: ppl(M.flow || 0), lines: (M.lines || []).join('、') }; add(RP.newst[0], v); if ((M.lines || []).length > 1) add(RP.newst[1], v); add(RP.newst[2], v); break; }
      case 'xfer': if (M.levels) { const v = { s: M.s, xf: ppl(M.xf || 0) }; add(RP.level[0], v); add(RP.level[1], v); } else { const v = { s: M.s, t: M.t, m: M.m, min: Math.ceil((M.m || 0) / CFG.walk.mPerMin), xf: ppl(M.xf || 0) }; add(RP.xfer[0], v); add(RP.xfer[1], v); add(RP.xferOff, v, true); } break;
      case 'crowd': if (M.l) { const v = { l: M.l, lf: pct(M.lf || 0), riders: ppl(M.riders || 0) }; add(RP.lineCrowd[0], v); add(RP.lineCrowd[1], v); add(RP.lineCrowd[2], v); } else { const v = { s: M.s, peak: U.fmtInt(M.peak || 0), cap: U.fmtInt(M.cap || 0), pct: pct((M.peak || 0) / Math.max(1, M.cap || 1)) }; add(RP.crowd[0], v); add(RP.crowd[1], v); add(RP.crowdOff, v, true); } break;
      case 'line': if (M.l) { const v = { l: M.l, riders: ppl(M.riders || 0), lf: pct(M.lf || 0) }; add(RP.lineGood[0], v); add(RP.lineGood[1], v); } else { const v = { share: pct(M.share || 0), add: ppl(Math.max(0, M.add || 0)) }; add(RP.impact[0], v); add(RP.impact[1], v); } break;
      case 'fare': { const v = { f: M.f }; add(RP.fare[0], v); add(RP.fare[1], v); add(RP.fare[2], v, true); break; }
      case 'road': { const v = { r: M.r, ci: (M.ci || 1).toFixed(2) }; if (M.ok) { add(RP.roadOk[0], v); add(RP.roadOk[1], v); } else { add(RP.road[0], v); add(RP.road[1], v); } break; }
      case 'fac': { const v = { x: M.x, vol: ppl(M.vol || 0), share: pct(M.share || 0) }; add(RP.fac[0], v); add(RP.fac[1], v); break; }
      default: { const v = { sat: Math.round(M.sat || g.econ.sat), share: pct(M.share || 0) }; add(RP.city[0], v); add(RP.city[1], v); }
    }
    return out;
  };
  CM.Voices = Voices;

  // ======================== 「地铁圈」App：乘客之声（v2.3，仿社交平台） ========================
  // 点右下角满意度入口，窗口从入口处放大打开（像打开手机 App）；按 Esc、点「回到城市」或窗口外收回入口。
  // 左栏导航；中间时间线：运营方置顶动态（满意度与投票）+ 乘客动态（话题标签、偶尔附随手涂鸦）；右栏搜索、满意度构成与热议话题
  const SVG = function (d, cls) { return '<svg viewBox="0 0 24 24" class="' + (cls || 'vx-i') + '" aria-hidden="true">' + d + '</svg>'; };
  const XI = {
    reply: SVG('<path d="M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z"/>'),
    repost: SVG('<path d="M4 9l3-3 3 3"/><path d="M7 6v9a2 2 0 0 0 2 2h6"/><path d="M20 15l-3 3-3-3"/><path d="M17 18V9a2 2 0 0 0-2-2H9"/>'),
    like: SVG('<path d="M12 19.5s-7.5-4.6-7.5-10A4 4 0 0 1 12 7a4 4 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"/>'),
    views: SVG('<path d="M5 19v-7M10 19V6M15 19v-9M20 19v-4"/>'),
    verified: SVG('<path class="vb" d="M12 2.5l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 21.5l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z"/><path class="ck" d="M8.3 12.2l2.5 2.5 4.9-5"/>', 'vx-ver'),
  };
  const KIND = { bad: '吐槽', good: '点赞', idea: '建议' };
  const sfx = function (n) { if (CM.Sound) CM.Sound.play(n); };
  const num = function (n) { n = Math.round(n); return n >= 1e4 ? U.fmtPeople(n) : String(n); };
  const clean = function (s) { return String(s || '').replace(/（.*?）/g, ''); };
  CM.UI.prototype.openVoicesApp = function (view) {
    const g = this.g(); if (!g) return;
    if (this.voApp) { if (view) this.voApp.show(view); else this.voApp.close(); return; }
    const self = this, st = { f: this._voF || 'all', q: '', view: view || 'feed' }, I18 = function (el) { if (CM.I18n) CM.I18n.localize(el); return el; };
    const liked = this._voLiked || (this._voLiked = new Set()), shared = this._voShared || (this._voShared = new Set());
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 英文界面：头像上的字取翻译后名字的首字母（单个汉字没法翻译）；分句之间补空格
    const en = !!CM.I18n && CM.I18n.get() === 'en', sp = en ? ' ' : '';
    const AV = function (who) { if (!en) return who.ch; const t = CM.I18n.text(who.nick).replace(/[^A-Za-z]/g, ''); return (t.charAt(0) || '·').toUpperCase(); };
    let closing = false, list = [];
    const back = h('div', { class: 'vx-back', onclick: function () { close(); } });
    const app = h('div', { class: 'vx-app', role: 'dialog', 'aria-modal': 'true', 'aria-label': '地铁圈 · 乘客之声', tabindex: '-1' });
    const search = h('input', { type: 'search', class: 'vx-q', placeholder: '搜索动态、地点或 #话题', 'aria-label': '搜索动态', autocomplete: 'off' });
    search.addEventListener('input', function () { st.q = search.value.trim(); drawFeed(); });
    const tl = h('main', { class: 'vx-tl' }), head = h('div', { class: 'vx-head' }), feed = h('div', { class: 'vx-feed' }), side = h('aside', { class: 'vx-side' });
    tl.append(head, feed);
    // 关闭 App 后再执行（定位、打开详情），地图不被窗口挡住
    const then = function (fn) { return function () { close(fn); }; };
    const setQ = function (q) { st.q = q; search.value = q; app.classList.remove('side-open'); if (st.view !== 'feed') setView('feed'); else drawFeed(); tl.scrollTop = 0; };
    // 视图：feed 时间线、following 关注的市民、sat 居民满意度（原指标详情页，融入 App），以及从中打开的 post 帖子与评论区、user 市民主页；
    // 打开帖子或主页时记下来处，左上角的返回箭头回到原来的视图和滚动位置
    st.root = st.view; st.hist = [];
    const show = function (s, top) {
      st.view = s.view; st.post = s.post || null; st.user = s.user || null;
      navs.home.classList.toggle('on', st.root === 'feed'); navs.fol.classList.toggle('on', st.root === 'following'); navs.sat.classList.toggle('on', st.root === 'sat');
      app.classList.remove('side-open'); draw(); tl.scrollTop = top || 0;
    };
    const setView = function (v) { st.root = v; st.hist = []; show({ view: v }); };
    const open = function (s) { st.hist.push({ view: st.view, post: st.post, user: st.user, top: tl.scrollTop }); if (st.hist.length > 20) st.hist.shift(); show(s); };
    const goBack = function () { const s = st.hist.pop(); if (s) show(s, s.top); else setView(st.root === 'sat' ? 'feed' : st.root); };
    const openPost = function (p) { open({ view: 'post', post: p.id }); };
    const openUser = function (hd) { if (st.view === 'user' && st.user === hd) return; open({ view: 'user', user: hd }); };
    const backBtn = function () { return h('button', { class: 'vx-backbtn', 'aria-label': '返回', onclick: goBack }, ic('arrowL', 18)); };
    const ymText = function (ym) { return Math.floor(ym / 12) + '年' + (ym % 12 + 1) + '月'; };
    const when = function (p) { return p.ym && p.ym < g.ym() ? ymText(p.ym) : p.ago + '天'; };
    const nav = function (icon, label, fn, on) { return h('button', { class: 'vx-nav' + (on ? ' on' : ''), 'aria-label': label, onclick: fn }, ic(icon, 22), h('span', null, label)); };
    const navs = {
      home: nav('home', '首页', function () { st.f = 'all'; st.q = ''; search.value = ''; setView('feed'); }, st.view === 'feed'),
      fol: nav('people', '关注的人', function () { setView('following'); }, st.view === 'following'),
      sat: nav('smile', '满意度', function () { setView('sat'); }, st.view === 'sat'),
    };
    // 「关注」上的蓝色角标：关注的市民在上次查看之后发的新动态数
    const folBadge = h('i', { class: 'vx-badge' }); navs.fol.appendChild(folBadge);
    const updBadge = function () { const n = CM.Voices.newCount(g); folBadge.textContent = n > 9 ? '9+' : (n ? String(n) : ''); folBadge.style.display = n ? '' : 'none'; };
    const rail = h('nav', { class: 'vx-rail' },
      h('div', { class: 'vx-logo' }, h('span', { class: 'vx-mark' }, ic('metro', 20)), h('b', null, '地铁圈')),
      navs.home, navs.fol, navs.sat,
      // 窄窗口收起右栏时，「探索」切换显示搜索、满意度、热议话题与推荐关注
      h('button', { class: 'vx-nav vx-explore', 'aria-label': '探索', onclick: function () { app.classList.toggle('side-open'); } }, ic('search', 22), h('span', null, '探索')),
      h('span', { class: 'grow' }),
      h('button', { class: 'vx-exit', 'aria-label': '回到城市', onclick: function () { close(); } }, ic('back', 18), h('span', null, '回到城市')));
    app.append(rail, tl, side);
    const locateFn = function (at) {
      if (!at) return null;
      return then(function () {
        if (at.station) { const s = g.net.stations[at.station]; if (s) { self.select({ kind: 'station', id: at.station }); self.flyTo(s.x, s.y, Math.max(self.R.cam.zoom, 22)); } }
        else if (at.zone != null) self.locateZone(at.zone);
        else if (at.line) self.openPage('line', at.line);
        else if (at.fac) { const f = CM.Fac.byId(at.fac); if (f) { self.select({ kind: 'facility', id: f.id }); self.locatePoint(f.x, f.y, f.name, Math.max(0.8, f.r), 3); } }
        else if (at.road) { self.R.layerOpt.cong = 'am'; self.setLayer('cong'); }
      });
    };
    const act = function (cls, icon, n, label, onclick) { return h('button', { class: 'vx-act ' + cls, 'aria-label': label, 'data-silent': '1', onclick: onclick }, h('span', { class: 'vx-ib', html: icon }), h('span', { class: 'vx-n' }, n)); };
    // 关注按钮（X 式：未关注为实心「关注」，已关注为描边「已关注」、悬停显示「取消关注」）；同一位市民的按钮一起更新
    const paintFollow = function (b) { const on = CM.Voices.isFollowed(g, b.dataset.hd); b.classList.toggle('on', on); b.replaceChildren(h('span', { class: 'f-a' }, on ? '已关注' : '关注'), on ? h('span', { class: 'f-b' }, '取消关注') : ''); I18(b); };
    const followBtn = function (p) {
      const b = h('button', { class: 'vx-follow', 'data-hd': p.who.handle, 'data-silent': '1', onclick: function (e) {
        e.stopPropagation();
        const on = !CM.Voices.isFollowed(g, p.who.handle); sfx(on ? 'follow' : 'tap'); CM.Voices.setFollow(g, p, on); self.markUnsaved();
        app.querySelectorAll('.vx-follow').forEach(function (x) { if (x.dataset.hd === p.who.handle) paintFollow(x); });
        updBadge();
      } });
      paintFollow(b); return b;
    };
    // 推荐关注的市民：本月发过动态、还没关注的人，按获赞多少
    const recs = function (k) {
      const by = new Map();
      for (const p of list) { if (CM.Voices.isFollowed(g, p.who.handle)) continue; const o = by.get(p.who.handle); if (o) o.likes += p.likes; else by.set(p.who.handle, { p: p, likes: p.likes }); }
      return Array.from(by.values()).sort(function (a, b) { return b.likes - a.likes; }).slice(0, k || 3).map(function (o) { return o.p; });
    };
    const accRow = function (p) {
      return h('div', { class: 'vx-acc clickable', onclick: function (e) { if (!e.target.closest('button')) openUser(p.who.handle); } },
        h('span', { class: 'vx-ava sm', style: { background: p.who.color } }, AV(p.who)),
        h('div', { class: 'vx-nm' }, h('b', null, p.who.nick), h('span', { class: 'vx-hd' }, p.who.handle), h('small', null, CM.Voices.bioOf(p))), followBtn(p));
    };
    // 帖子：本月的动态，或关注后存下的旧动态
    const findPost = function (id) {
      const p = list.find(function (x) { return x.id === id; }); if (p) return p;
      const F = CM.Voices.follows(g); for (const k in F) for (const q of F[k].posts) if (q.id === id) return Object.assign({ who: F[k].who }, q);
      return null;
    };
    const toggle = function (set, p, el, base) { if (set.has(p.id)) set.delete(p.id); else set.add(p.id); const on = set.has(p.id); sfx(on ? (set === liked ? 'like' : 'repost') : 'tap'); el.classList.toggle('on', on); el.querySelector('.vx-n').textContent = num(base + (on ? 1 : 0)); if (on) el.classList.add('pop'); setTimeout(function () { el.classList.remove('pop'); }, 400); };
    // 运营方置顶：本月满意度、最认可与最需改进的方面，以及由满意度推算的投票结果
    const official = function () {
      const sat = g.econ.sat, hist = g.history, prev = hist.length > 1 ? hist[hist.length - 2].sat : null, sf = g.econ.satFactors, fs = sf ? sf.factors : [];
      const pos = fs.filter(function (f) { return f.v > 0.3; }).sort(function (a, b) { return b.v - a.v; })[0], neg = fs.filter(function (f) { return f.v < -0.3; }).sort(function (a, b) { return a.v - b.v; })[0];
      // 分句各成一段文字（英文界面按整句翻译）
      const parts = ['你对本月的地铁服务满意吗？', '本月乘客满意度 ' + Math.round(sat) + ' 分' + (prev != null && Math.abs(sat - prev) >= 0.5 ? '，比上月' + (sat > prev ? '上升 ' : '下降 ') + U.fmtNum(Math.abs(sat - prev), 1) + ' 分' : '') + '。'];
      if (pos) parts.push('大家最认可：' + clean(pos.label) + '。');
      if (neg) parts.push('最需要改进：' + clean(neg.label) + '。');
      parts.push('感谢每一位乘客的反馈！');
      let ps = U.clamp((sat - 35) / 55, 0.05, 0.9), pb = U.clamp((65 - sat) / 55, 0.04, 0.9), pm = Math.max(0.06, 1 - ps - pb); const t = ps + pb + pm; ps /= t; pb /= t; pm /= t;
      const mx = Math.max(ps, pm, pb), votes = Math.max(120, Math.round((((g.model.daily && g.model.daily.metro) || 0)) / 40));
      const poll = h('div', { class: 'vx-poll' }, [['满意', ps], ['一般', pm], ['不满意', pb]].map(function (o) {
        return h('div', { class: 'vx-opt' + (o[1] >= mx - 1e-9 ? ' top' : '') }, h('i', { style: { width: (o[1] * 100).toFixed(1) + '%' } }), h('span', null, o[0]), h('b', null, U.fmtPct(o[1], 0)));
      }), h('small', null, num(votes) + ' 票 · 本月结果'));
      return h('article', { class: 'vx-post official' },
        h('div', { class: 'vx-pin' }, ic('pin', 13), '置顶'),
        h('span', { class: 'vx-ava', style: { background: 'var(--accent)' } }, ic('metro', 20)),
        h('div', { class: 'vx-body' },
          h('div', { class: 'vx-who' }, h('b', null, CM.DATA.city + '地铁'), h('span', { class: 'vx-vb', html: XI.verified }), h('span', { class: 'vx-hd' }, '@metro_official · ' + g.clock.m + '月' + Math.max(1, g.clock.d - 1) + '日')),
          h('p', { class: 'vx-text' }, parts.map(function (s, i) { return i ? [sp, s] : s; })), poll));
    };
    const postEl = function (p, isNew) {
      const like = act('like' + (liked.has(p.id) ? ' on' : ''), XI.like, num(p.likes + (liked.has(p.id) ? 1 : 0)), '点赞', function () { toggle(liked, p, like, p.likes); });
      const rp = act('rp' + (shared.has(p.id) ? ' on' : ''), XI.repost, num(p.reposts + (shared.has(p.id) ? 1 : 0)), '转发', function () { toggle(shared, p, rp, p.reposts); });
      const loc = locateFn(p.at);
      const user = function () { openUser(p.who.handle); };
      return h('article', { class: 'vx-post k-' + p.kind + ' clickable' + (isNew ? ' new' : ''), onclick: function (e) { if (!e.target.closest('button')) openPost(p); } },
        h('button', { class: 'vx-ava', style: { background: p.who.color }, 'aria-label': '查看主页', onclick: user }, AV(p.who)),
        h('div', { class: 'vx-body' },
          h('div', { class: 'vx-who' }, h('button', { class: 'vx-nick', onclick: user }, p.who.nick), CM.Voices.isFollowed(g, p.who.handle) ? h('span', { class: 'vx-fol', 'data-tip': '已关注' }, ic('people', 12)) : null, h('span', { class: 'vx-hd' }, p.who.handle + ' · ' + when(p)), isNew ? h('span', { class: 'vx-newtag' }, en ? 'New' : '新') : null, h('span', { class: 'grow' }), h('span', { class: 'vx-kind' }, KIND[p.kind])),
          h('p', { class: 'vx-text' }, p.text + ' ', p.tags.map(function (t) { return h('button', { class: 'vx-tag', onclick: function () { setQ('#' + t); } }, '#' + t); })),
          p.pic && CM.Sketch && CM.Sketch.doodle ? h('div', { class: 'vx-media', html: CM.Sketch.doodle(p.pic[0], p.id, p.pic[1]) }) : null,
          h('div', { class: 'vx-acts' },
            h('button', { class: 'vx-act rep', 'aria-label': '查看回复', 'data-silent': '1', onclick: function () { openPost(p); } }, h('span', { class: 'vx-ib', html: XI.reply }), h('span', { class: 'vx-n' }, num(p.replies))),
            rp, like,
            h('span', { class: 'vx-act' }, h('span', { class: 'vx-ib', html: XI.views }), h('span', { class: 'vx-n' }, num(p.views))),
            loc ? h('button', { class: 'vx-loc', onclick: loc }, ic('locate', 14), p.at.line ? '看线路' : (p.at.road ? '拥堵图层' : '定位')) : null)));
    };
    const match = function (p) {
      if (st.f !== 'all' && p.kind !== st.f) return false;
      if (!st.q) return true;
      if (st.q.charAt(0) === '#') return p.tags.indexOf(st.q.slice(1)) >= 0;
      const q = st.q.toLowerCase();
      return (p.text + ' ' + p.who.nick + ' ' + p.place + ' ' + p.tags.join(' ')).toLowerCase().indexOf(q) >= 0;
    };
    const drawFeed = function () {
      const shown = list.filter(match), nodes = [];
      if (st.f === 'all' && !st.q) nodes.push(official());
      if (st.q) nodes.push(h('div', { class: 'vx-qbar' }, ic('search', 14), h('span', { class: 'grow' }, '「' + st.q + '」的动态 · ' + shown.length + ' 条'), h('button', { class: 'vx-tag', onclick: function () { setQ(''); } }, '清除')));
      for (const p of shown) nodes.push(postEl(p));
      if (!list.length) nodes.push(h('div', { class: 'vx-empty' }, ic('people', 28), h('b', null, '乘客还没有说什么'), h('span', null, g.model.trafficReady() ? '修好第一条线后，乘客会在这里聊他们的出行。' : '交通数据正在更新，稍后再来看看。')));
      else if (!shown.length) nodes.push(h('div', { class: 'vx-empty' }, ic('search', 26), h('b', null, '没有相关动态'), h('span', null, '换个关键词或话题看看。')));
      else nodes.push(h('div', { class: 'vx-end' }, '动态由本月的模拟数据生成：片区的地铁步行覆盖、新开车站、换乘步行距离、车站与列车的高峰拥挤、票价负担、道路拥堵与设施接驳；点赞数大致反映受影响的人数。'));
      feed.replaceChildren.apply(feed, nodes);
      I18(feed);
    };
    // 居民满意度视图（原「指标详情 · 居民满意度」）：分数与变化、构成因素（上月）、变化趋势、统计口径，以及被吐槽最多的方面
    const satView = function () {
      const sat = g.econ.sat, hist = g.history, prev = hist.length > 1 ? hist[hist.length - 2].sat : null, sf = g.econ.satFactors, sk = sat >= 60 ? 'smile' : (sat >= 40 ? 'meh' : 'frown');
      head.replaceChildren(h('div', { class: 'vx-ht' }, h('button', { class: 'vx-backbtn', 'aria-label': '返回首页', onclick: function () { setView('feed'); } }, ic('arrowL', 18)),
        h('b', null, '居民满意度'), h('small', null, CM.DATA.city + ' · ' + g.clock.y + '年' + g.clock.m + '月')));
      const nodes = [];
      nodes.push(h('div', { class: 'vx-sv-hero ' + sk },
        h('span', { class: 'vx-face' }, ic(sk, 30)),
        h('div', { class: 'grow' },
          h('div', { class: 'vx-sv-num' }, h('b', null, String(Math.round(sat))), h('span', null, '/ 100'),
            prev != null && Math.abs(sat - prev) >= 0.05 ? h('em', { class: sat >= prev ? 'good' : 'bad' }, (sat >= prev ? '▲ ' : '▼ ') + U.fmtNum(Math.abs(sat - prev), 1) + ' 较上月') : null),
          h('small', null, (sf ? '目标值 ' + Math.round(sf.target) + ' · ' : '') + '每月向目标值靠近 25%' + (g.econ.mode === 'challenge' ? ' · 影响每月政府拨款' : ' · 自由建造中仅供参考')))));
      if (sf) {
        const mx = Math.max(1, ...sf.factors.map(function (f) { return Math.abs(f.v); }));
        nodes.push(h('section', { class: 'vx-sv-sec' }, h('h4', null, '构成因素（上月）'),
          h('div', { class: 'vx-f base' }, h('span', null, '基准'), h('i'), h('b', null, '+' + sf.base)),
          sf.factors.map(function (f) { return h('div', { class: 'vx-f ' + (Math.abs(f.v) < 0.05 ? 'zero' : (f.v > 0 ? 'good' : 'bad')) }, h('span', null, f.label), h('i', null, h('em', { style: { width: (Math.abs(f.v) / mx * 100).toFixed(0) + '%' } })), h('b', null, U.fmtSigned(f.v, 1))); }),
          h('div', { class: 'vx-f total' }, h('span', null, '目标值'), h('i'), h('b', null, String(Math.round(sf.target))))));
      }
      if (hist.length > 1) {
        const arr = hist.slice(-120);
        nodes.push(h('section', { class: 'vx-sv-sec' }, h('h4', null, '变化趋势', h('small', null, '近 ' + arr.length + ' 个月')),
          self.spark(arr.map(function (r) { return r.sat; }), { color: '#1e6fd9', labels: [arr[0].y + '年' + arr[0].m + '月', '', arr[arr.length - 1].y + '年' + arr[arr.length - 1].m + '月'] })));
      }
      const bad = list.filter(function (p) { return p.kind === 'bad'; }).slice(0, 3);
      if (bad.length) nodes.push(h('section', { class: 'vx-sv-sec' }, h('h4', null, '乘客最常吐槽'), bad.map(function (p) {
        return h('button', { class: 'vx-sv-q', onclick: function () { setQ('#' + p.tags[0]); } }, h('span', { class: 'vx-ava sm', style: { background: p.who.color } }, AV(p.who)), h('span', { class: 'grow' }, p.text), h('small', null, '♥ ' + num(p.likes)));
      })));
      nodes.push(h('section', { class: 'vx-sv-sec' }, h('h4', null, '统计口径'), h('p', { class: 'vx-sv-note' }, '综合交通服务、票价与任务结果的满意度评分（0–100）。每月更新，每月向目标值靠近 25%；影响政府拨款系数（经营挑战）。')));
      feed.replaceChildren.apply(feed, nodes);
      I18(head); I18(feed);
    };
    // 单条动态与评论区（X 式的帖子页）：大号正文、发布时间与查看数、转发与喜欢，下方是按热度排列的回复（模拟生成，只读）
    const threadView = function () {
      const p = findPost(st.post);
      head.replaceChildren(h('div', { class: 'vx-ht' }, backBtn(), h('b', null, '帖子')));
      if (!p) { feed.replaceChildren(h('div', { class: 'vx-empty' }, ic('search', 26), h('b', null, '这条动态已经不在了'), h('span', null, '动态按月更新，换个话题看看。'))); I18(head); I18(feed); return; }
      const like = act('like' + (liked.has(p.id) ? ' on' : ''), XI.like, num(p.likes + (liked.has(p.id) ? 1 : 0)), '点赞', function () { toggle(liked, p, like, p.likes); });
      const rp = act('rp' + (shared.has(p.id) ? ' on' : ''), XI.repost, num(p.reposts + (shared.has(p.id) ? 1 : 0)), '转发', function () { toggle(shared, p, rp, p.reposts); });
      const loc = locateFn(p.at), reps = CM.Voices.replies(g, p), hh = 7 + p.id % 12, mm = p.id % 60;
      const main = h('article', { class: 'vx-main k-' + p.kind },
        h('div', { class: 'vx-who big' }, h('button', { class: 'vx-ava', style: { background: p.who.color }, 'aria-label': '查看主页', onclick: function () { openUser(p.who.handle); } }, AV(p.who)), h('div', { class: 'vx-nm' }, h('button', { class: 'vx-nick', onclick: function () { openUser(p.who.handle); } }, p.who.nick), h('span', { class: 'vx-hd' }, p.who.handle)), h('span', { class: 'grow' }), h('span', { class: 'vx-kind' }, KIND[p.kind]), followBtn(p)),
        h('p', { class: 'vx-text big' }, p.text + ' ', p.tags.map(function (t) { return h('button', { class: 'vx-tag', onclick: function () { setQ('#' + t); } }, '#' + t); })),
        p.pic && CM.Sketch && CM.Sketch.doodle ? h('div', { class: 'vx-media', html: CM.Sketch.doodle(p.pic[0], p.id, p.pic[1]) }) : null,
        h('div', { class: 'vx-time' }, (hh < 12 ? '上午 ' : '下午 ') + (hh > 12 ? hh - 12 : hh) + ':' + String(mm).padStart(2, '0') + ' · ' + (p.ym && p.ym < g.ym() ? ymText(p.ym) : p.ago + ' 天前') + ' · ', h('b', null, num(p.views)), ' 查看'),
        h('div', { class: 'vx-stats' }, h('span', null, h('b', null, num(p.reposts)), ' 转发'), h('span', null, h('b', null, num(p.likes)), ' 喜欢'), h('span', null, h('b', null, num(p.replies)), ' 回复')),
        h('div', { class: 'vx-acts big' }, h('span', { class: 'vx-act' }, h('span', { class: 'vx-ib', html: XI.reply })), rp, like, loc ? h('button', { class: 'vx-loc', onclick: loc }, ic('locate', 14), p.at.line ? '看线路' : (p.at.road ? '拥堵图层' : '在地图上定位')) : null));
      const compose = h('div', { class: 'vx-compose' }, h('span', { class: 'vx-ava sm', style: { background: 'var(--x-blue)' } }, ic('metro', 15)), h('span', { class: 'grow' }, '发布你的回复'), h('small', null, '乘客动态由模拟生成，只能浏览'));
      const rl = reps.map(function (r, i) {
        return h('article', { class: 'vx-post vx-reply' + (r.official ? ' official-r' : '') },
          h('span', { class: 'vx-ava', style: { background: r.who.color } }, r.official ? ic('metro', 18) : AV(r.who)),
          h('div', { class: 'vx-body' },
            h('div', { class: 'vx-who' }, h('b', null, r.who.nick), r.official ? h('span', { class: 'vx-vb', html: XI.verified }) : null, h('span', { class: 'vx-hd' }, r.who.handle + ' · ' + r.ago + '天')),
            h('div', { class: 'vx-to' }, '回复 ', h('span', null, p.who.handle)),
            h('p', { class: 'vx-text' }, r.text),
            h('div', { class: 'vx-acts' }, h('span', { class: 'vx-act' }, h('span', { class: 'vx-ib', html: XI.reply })), h('span', { class: 'vx-act' }, h('span', { class: 'vx-ib', html: XI.like }), h('span', { class: 'vx-n' }, num(r.likes))))));
      });
      feed.replaceChildren.apply(feed, [main, compose].concat(rl, [h('div', { class: 'vx-end' }, '只显示最热门的几条回复；回复同样由本月的模拟数据生成（客流、负荷、步行距离、拥堵指数等）。')]));
      I18(head); I18(feed);
    };
    // 市民主页：头像与简介、关注按钮、获赞与常聊的话题，下面是他的动态（本月的加上关注后存下的）
    const userView = function () {
      const hd = st.user, ps = CM.Voices.postsOf(g, hd), f = CM.Voices.follows(g)[hd], who = (ps[0] && ps[0].who) || (f && f.who);
      head.replaceChildren(h('div', { class: 'vx-ht' }, backBtn(), h('div', { class: 'vx-nm' }, h('b', null, who ? who.nick : hd), h('small', null, ps.length + ' 条动态'))));
      if (!who) { feed.replaceChildren(h('div', { class: 'vx-empty' }, ic('people', 28), h('b', null, '这位市民这个月没有发动态'), h('span', null, '动态按月更新，下个月再来看看。'))); I18(head); I18(feed); return; }
      const p0 = ps[0] || { who: who, topic: 'city', place: '' }, likes = ps.reduce(function (a, p) { return a + p.likes; }, 0), tags = [];
      for (const p of ps) for (const tg of p.tags) if (tags.indexOf(tg) < 0) tags.push(tg);
      const prof = h('section', { class: 'vx-prof' },
        h('div', { class: 'vx-banner', style: { '--c': who.color } }),
        h('div', { class: 'vx-prow' }, h('span', { class: 'vx-ava xl', style: { background: who.color } }, AV(who)), h('span', { class: 'grow' }), followBtn(p0)),
        h('b', { class: 'vx-pn' }, who.nick), h('div', { class: 'vx-hd' }, hd),
        h('p', { class: 'vx-bio' }, (f && f.bio) || CM.Voices.bioOf(p0)),
        h('div', { class: 'vx-pmeta' }, ic('calMonth', 14), h('span', null, f ? '关注于 ' + ymText(f.since) : '本月发了 ' + ps.length + ' 条动态'), h('span', null, h('b', null, num(likes)), ' 获赞')),
        tags.length ? h('div', { class: 'vx-ptags' }, h('span', null, '常聊'), tags.slice(0, 5).map(function (tg) { return h('button', { class: 'vx-tag', onclick: function () { setQ('#' + tg); } }, '#' + tg); })) : null);
      const nodes = [prof, h('div', { class: 'vx-tabs vx-ptabs' }, h('span', { class: 'vx-tab on' }, h('span', null, '动态')))];
      for (const p of ps) nodes.push(postEl(p));
      if (!ps.length) nodes.push(h('div', { class: 'vx-empty' }, h('b', null, '这个月还没有发动态'), h('span', null, '关注后，他们以后的动态会出现在「关注的人」里。')));
      nodes.push(h('div', { class: 'vx-end' }, f ? '已关注：这位市民每月的新动态会保存下来（最多 12 条），取消关注会删除这些记录。' : '关注后，这位市民每月的新动态会保存下来，在「关注的人」里随时回看。'));
      feed.replaceChildren.apply(feed, nodes);
      I18(head); I18(feed);
    };
    // 关注：关注的市民（点头像进主页，有新动态的带蓝点）与他们的动态时间线；还没关注时给出推荐
    const followingView = function () {
      const F = CM.Voices.follows(g), hds = Object.keys(F), seen = (g.voices && g.voices.seen) || 0;
      head.replaceChildren(h('div', { class: 'vx-ht' }, h('b', null, '关注的人'), h('small', null, hds.length ? hds.length + ' 位市民' : '还没有关注的人')));
      const nodes = [];
      if (!hds.length) {
        nodes.push(h('div', { class: 'vx-empty' }, ic('people', 28), h('b', null, '关注你在意的市民'), h('span', null, '点动态里的头像或「关注」。关注后，他们每月的新动态都会出现在这里，方便跟进同一片区、同一座车站的变化。')));
        const r = recs(5); if (r.length) nodes.push(h('section', { class: 'vx-sv-sec vx-recs' }, h('h4', null, '推荐关注的市民'), r.map(accRow)));
      } else {
        const isNew = function (p) { return p.ym > Math.max(seen, F[p.who.handle].since); };
        const all = []; for (const hd of hds) for (const p of CM.Voices.postsOf(g, hd)) all.push(p);
        all.sort(function (a, b) { return (b.ym || 0) - (a.ym || 0) || a.ago - b.ago; });
        nodes.push(h('div', { class: 'vx-fchips' }, hds.map(function (hd) {
          const w = F[hd].who, fresh = all.some(function (p) { return p.who.handle === hd && isNew(p); });
          return h('button', { class: 'vx-fchip', onclick: function () { openUser(hd); } }, h('span', { class: 'vx-ava', style: { background: w.color } }, AV(w), fresh ? h('i', { class: 'vx-dot' }) : null), h('span', null, w.nick));
        })));
        for (const p of all) nodes.push(postEl(p, isNew(p)));
        if (!all.length) nodes.push(h('div', { class: 'vx-empty' }, h('b', null, '关注的市民这个月还没有发动态'), h('span', null, '他们的生活有变化时（新站开通、换乘、拥挤…）会再来说说。')));
        nodes.push(h('div', { class: 'vx-end' }, '每位市民最多保存 12 条动态，随存档保存；取消关注会删除这些记录。'));
        if (g.voices) g.voices.seen = g.ym();
      }
      feed.replaceChildren.apply(feed, nodes);
      I18(head); I18(feed);
    };
    const draw = function () {
      list = CM.Voices.generate(g);
      const counts = { all: list.length, bad: 0, good: 0, idea: 0 }; for (const p of list) counts[p.kind]++;
      if (st.view === 'feed') head.replaceChildren(
        h('div', { class: 'vx-ht' }, h('b', null, '首页'), h('small', null, CM.DATA.city + ' · ' + g.clock.y + '年' + g.clock.m + '月')),
        h('div', { class: 'vx-tabs', role: 'tablist' }, [['all', '为你推荐'], ['bad', '吐槽'], ['good', '点赞'], ['idea', '建议']].map(function (c) {
          return h('button', { class: 'vx-tab' + (st.f === c[0] ? ' on' : ''), role: 'tab', 'aria-selected': st.f === c[0] ? 'true' : 'false', 'data-silent': '1', onclick: function () { sfx('tab'); st.f = self._voF = c[0]; draw(); tl.scrollTop = 0; } }, h('span', null, c[1], h('small', null, String(counts[c[0]]))));
        })));
      // 右栏：搜索、满意度构成、热议话题
      const sat = g.econ.sat, sk = sat >= 60 ? 'smile' : (sat >= 40 ? 'meh' : 'frown'), sf = g.econ.satFactors;
      const fs = sf ? sf.factors.slice().sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }).slice(0, 5) : [], fmx = Math.max(1, ...fs.map(function (f) { return Math.abs(f.v); }));
      const topics = {}; for (const p of list) for (const t of p.tags) { const o = topics[t] || (topics[t] = { n: 0, likes: 0, bad: 0 }); o.n++; o.likes += p.likes; if (p.kind === 'bad') o.bad++; }
      const hot = Object.entries(topics).sort(function (a, b) { return b[1].likes - a[1].likes; }).slice(0, 6);
      // 原生 replaceChildren 会把空值转成文字，先过滤隐藏的可选卡片。
      side.replaceChildren.apply(side, [
        h('label', { class: 'vx-search' }, ic('search', 16), search),
        st.view === 'sat' ? null : h('section', { class: 'vx-card vx-sat ' + sk },
          h('h4', null, '居民满意度'),
          h('div', { class: 'vx-score' }, h('span', { class: 'vx-face' }, ic(sk, 24)), h('b', null, String(Math.round(sat))), h('span', null, '/ 100' + (sf ? ' · 目标 ' + Math.round(sf.target) : ''))),
          fs.length ? h('div', { class: 'vx-fs' }, fs.map(function (f) { return h('div', { class: 'vx-f ' + (Math.abs(f.v) < 0.05 ? 'zero' : (f.v > 0 ? 'good' : 'bad')) }, h('span', null, clean(f.label)), h('i', null, h('em', { style: { width: (Math.abs(f.v) / fmx * 100).toFixed(0) + '%' } })), h('b', null, (f.v >= 0 ? '+' : '') + U.fmtNum(f.v, 1))); })) : null,
          st.view === 'sat' ? null : h('button', { class: 'vx-more', onclick: function () { setView('sat'); } }, '查看满意度构成', ic('chev', 13))),
        hot.length ? h('section', { class: 'vx-card vx-hot' }, h('h4', null, '热议话题'), hot.map(function (e, i) {
          return h('button', { class: 'vx-trend', onclick: function () { setQ('#' + e[0]); } }, h('small', null, (i + 1) + ' · 地铁 · ' + (e[1].bad > e[1].n / 2 ? '吐槽较多' : '热议中')), h('b', null, '#' + e[0]), h('small', null, e[1].n + ' 条动态 · ' + num(e[1].likes) + ' 赞'));
        })) : null,
        // 推荐关注的市民（关注页还没有关注的人时，推荐放在时间线里）
        (function () { const r = st.view === 'following' && !Object.keys(CM.Voices.follows(g)).length ? [] : recs(3); return r.length ? h('section', { class: 'vx-card vx-who2' }, h('h4', null, '推荐关注的市民'), r.map(accRow), st.root === 'following' ? null : h('button', { class: 'vx-more', onclick: function () { setView('following'); } }, '查看关注的人', ic('chev', 13))) : null; })(),
        h('div', { class: 'vx-foot' }, '地铁圈 · ' + (g.econ.mode === 'challenge' ? '满意度影响每月拨款' : '满意度仅供参考'))].filter(Boolean));
      I18(head); I18(side);
      if (st.view === 'sat') satView(); else if (st.view === 'post') threadView(); else if (st.view === 'user') userView(); else if (st.view === 'following') followingView(); else drawFeed();
      updBadge();
      self.voSeen = { g: g, n: CM.Voices.badCount(g), key: CM.Voices.cache && CM.Voices.cache.key };
      self.updateSatDock(g);
    };
    // 打开 / 收回动画：窗口在入口按钮与居中位置之间缩放（入口隐藏时原地淡入淡出）
    const flyFrom = function () {
      const d = self.satDock; if (!d || d.classList.contains('hidden')) return null;
      const f = d.getBoundingClientRect(), t = app.getBoundingClientRect(); if (!f.width || !t.width) return null;
      return 'translate(' + (f.left + f.width / 2 - t.left - t.width / 2).toFixed(1) + 'px,' + (f.top + f.height / 2 - t.top - t.height / 2).toFixed(1) + 'px) scale(' + (f.width / t.width).toFixed(3) + ',' + (f.height / t.height).toFixed(3) + ')';
    };
    const key = function (e) { self.appKey(e, app, close); };
    const close = function (after, instant) {
      if (closing) return; closing = true;
      document.removeEventListener('keydown', key, true);
      if (self.voApp === api) self.voApp = null;
      if (self.satDock) self.satDock.classList.remove('vx-on');
      if (!instant) sfx('socialClose');
      const done = function () { back.remove(); app.remove(); if (after) after(); };
      if (instant || reduce || !app.animate) { done(); return; }
      const fr = flyFrom();
      back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      app.animate(fr ? [{ transform: 'none', opacity: 1, borderRadius: '22px' }, { transform: fr, opacity: 0.15, borderRadius: '60px' }] : [{ transform: 'none', opacity: 1 }, { transform: 'scale(.94)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = done;
    };
    const api = { close: close, refresh: function () { if (CM.game !== g) { close(null, true); return; } draw(); }, show: function (v) { setView(v); }, el: app };
    this.voApp = api;
    sfx('socialOpen');
    document.getElementById('app').append(back, app);
    if (this.satDock) this.satDock.classList.add('vx-on');
    draw();
    document.addEventListener('keydown', key, true);
    if (!reduce && app.animate) {
      const fr = flyFrom();
      back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
      app.animate(fr ? [{ transform: fr, opacity: 0.3, borderRadius: '60px' }, { transform: 'none', opacity: 1, borderRadius: '22px' }] : [{ transform: 'scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.16,1,.3,1)' });
      for (const el of [rail, tl, side]) el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 460 });
    }
    app.focus({ preventScroll: true });
  };
  // 右下角入口：满意度表情与分数；有新的吐槽时显示小红点
  CM.UI.prototype.updateSatDock = function (g) {
    const b = this.satDock; if (!b || !g) return;
    const sat = g.econ.sat, sk = sat >= 60 ? 'smile' : (sat >= 40 ? 'meh' : 'frown');
    if (b._sk !== sk) { b._sk = sk; b.className = 'sat-dock ' + sk + (b.classList.contains('hidden') ? ' hidden' : ''); b.querySelector('.sd-face').replaceChildren(ic(sk, 20)); }
    const v = Math.round(sat) + '';
    b.setAttribute('aria-label', (CM.I18n ? CM.I18n.text('满意度') : '满意度') + ' ' + v + ' · ' + (CM.I18n ? CM.I18n.text('乘客满意度与乘客之声') : '乘客满意度与乘客之声'));
    if (b._v !== v) { b._v = v; b.querySelector('.sd-v').textContent = v; }
    if ((!CM.Voices.cache || CM.Voices.cache.g !== g) && !g.jumping && g.model.trafficReady()) { try { CM.Voices.generate(g); } catch (e) { console.error(e); } }
    const C = CM.Voices.cache, unseen =C && C.g === g && (!this.voSeen || this.voSeen.g !== g || this.voSeen.key !== C.key) ? C.list.filter(function (p) { return p.kind === 'bad'; }).length : 0;
    const dot = b.querySelector('.sd-dot'); dot.textContent = unseen ? String(unseen) : ''; dot.style.display = unseen ? '' : 'none';
  };
})(window.CM);
