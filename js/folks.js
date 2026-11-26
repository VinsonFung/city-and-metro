'use strict';
// 市民人物志（v3.4）：每座城市 8–12 位固定的市民，人设沿用地铁圈（带娃的妈妈、退休阿姨、大学生、夜班护士、外卖小哥……）。
// 每人有家、有单位或学校（按小区人口、岗位与重要设施挑选，开局一次、随存档保存），每月用出行查询（journey.js）算一次他实际怎么走、要多久：
// 有地铁且更快就坐地铁，没有车的人不开车，近的走路。线网变化让他的通勤明显变快、变慢，或第一次能坐地铁、家门口开了新站、天天挤车时，他会发一条动态；
// 几年里还会搬家、换工作、孩子上学、毕业、退休（按人设与固定的随机种子安排），通勤随之重算，形成跨年的连续故事。
// 只读取模拟结果，不影响客流、收支与满意度。动态在地铁圈的「市民故事」里按时间倒序显示，每位市民的主页可以看到他每天的路线与历年通勤时间。
(function (CM) {
  const U = CM.U, CFG = CM.CFG;
  const F = CM.Folks = {};
  const hash = function (s) { let x = 2166136261; for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };
  const rng = function (seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const AVA = ['#e4572e', '#2e86ab', '#7a5195', '#16a085', '#f18f01', '#c0392b', '#3b8ea5', '#8e44ad', '#2f9e44', '#d35400'];
  // 人设：kind 决定去处与人生事件；car 有车的概率；dest 去处类型；age 开局年龄
  const ROLES = {
    mom: { role: '带娃的妈妈', kind: 'parent', car: 0.45, dest: 'job', age: [29, 35], kid: true },
    auntie: { role: '退休阿姨', kind: 'retiree', car: 0, dest: 'daily', age: [56, 63] },
    uni: { role: '大学生', kind: 'student', car: 0, dest: 'uni', age: [18, 19] },
    early: { role: '早起通勤族', kind: 'work', car: 0.25, dest: 'job', age: [26, 38] },
    nurse: { role: '夜班护士', kind: 'nurse', car: 0.2, dest: 'hosp', age: [24, 34] },
    office: { role: '上班族', kind: 'work', car: 0.6, dest: 'cbd', age: [28, 42] },
    rider: { role: '外卖小哥', kind: 'courier', car: 0, dest: 'cbd', age: [20, 28] },
    teen: { role: '学生党', kind: 'teen', car: 0, dest: 'school', age: [12, 13] },
    thrift: { role: '精打细算的上班族', kind: 'work', car: 0, dest: 'job', age: [25, 33] },
    local: { role: '老街坊', kind: 'work', car: 0.3, dest: 'job', age: [50, 56] },
    intern: { role: '实习生', kind: 'work', car: 0, dest: 'cbd', age: [21, 23] },
    grad: { role: '刚毕业的', kind: 'work', car: 0, dest: 'cbd', age: [22, 24] },
  };
  const ORDER = ['mom', 'auntie', 'uni', 'early', 'nurse', 'office', 'rider', 'teen', 'thrift', 'local', 'intern', 'grad'];
  const MODES = ['metro', 'bus', 'car', 'walk'];
  const HOW = { metro: '坐地铁', bus: '坐公交', car: '自己开车', walk: '走路' };
  const MAX_LOG = 240, MAX_HIST = 200, MAX_POSTS = 4;
  const fill = function (t, v) { return t.replace(/\{(\w)\}/g, function (m, k) { return v[k] != null ? v[k] : ''; }); };
  const mins = function (v) { return String(Math.max(1, Math.round(v))); };
  // 动态措辞（整句，便于英文按模板翻译）
  const T = {
    introWork: '我住在{a}，每天{m}去{b}上班，单程 {c} 分钟。',
    introSchool: '我住在{a}，每天{m}去{b}上学，单程 {c} 分钟。',
    introNurse: '我住在{a}，每天{m}去{b}值夜班，单程 {c} 分钟。',
    introDaily: '我住在{a}，每天{m}去{b}，单程 {c} 分钟。',
    introCourier: '我住在{a}，每天{m}去{b}一带接单，单程 {c} 分钟。',
    metro: '终于能坐地铁了！从{a}到{b}坐{l}只要 {d} 分钟，以前{m}要 {c} 分钟。',
    better: '{l}开通以后，我从{a}到{b}只要 {d} 分钟了，以前要 {c} 分钟。',
    betterAny: '最近出门快多了，从{a}到{b}只要 {d} 分钟，以前要 {c} 分钟。',
    worse: '这阵子从{a}到{b}要 {d} 分钟，比以前多了 {e} 分钟。',
    crowd: '{l}早高峰太挤了，我每天从{s}挤到{t}，常常要等两趟才上得去。',
    station: '家门口的{s}站开通了，走过去只要 {w} 分钟。',
    move: '搬家了，从{a}搬到了{b}。现在{m}去{c}单程 {d} 分钟，以前要 {e} 分钟。',
    moveNear: '搬到了{b}，离{s}站走路只要 {w} 分钟。现在{m}去{c}单程 {d} 分钟，以前要 {e} 分钟。',
    job: '换工作了，新单位在{b}。现在{m}上班单程 {d} 分钟，以前要 {e} 分钟。',
    nurseJob: '调到{b}了，现在{m}去值夜班单程 {d} 分钟，以前要 {e} 分钟。',
    courierJob: '换了个站点，现在在{b}一带接单，{m}过去单程 {d} 分钟。',
    kid: '孩子上小学了，学校在{b}。每天{m}送孩子上学，单程 {d} 分钟。',
    kid2: '孩子升初中了，自己{m}去{b}上学，单程 {d} 分钟。',
    grad: '毕业了！在{b}找到了工作，现在{m}上班单程 {d} 分钟。',
    uniIn: '考上大学了！以后每天{m}去{b}上学，单程 {d} 分钟。',
    retire: '退休了！以后不用早起挤车，每天去{b}转转，{m}单程 {d} 分钟。',
    routine: '最近每天去{b}，{m}单程 {d} 分钟。',
  };
  const short = function (s) { return String(s || '').replace(/（.*?）/g, '').replace(/一带$/, '').trim(); };
  const placeName = function (g, z) { const n = g.zoneName(z) || '', m = /^片区（(.+?)）/.exec(n); return m ? m[1] : (short(n) || '市区'); };
  const pkm = function (p, q) { return U.dist(p.x, p.y, q.x, q.y) * CFG.CELL_M / 1000; };
  const weighted = function (r, items) { let tot = 0; for (const it of items) tot += it[1]; if (!(tot > 0)) return null; let x = r() * tot; for (const it of items) { x -= it[1]; if (x <= 0) return it[0]; } return items[items.length - 1][0]; };
  // 小区里人口（或岗位）最多的陆地格，格内取一个固定的点
  const zonePoint = function (g, z, key, r) {
    const m = g.model, city = g.city, cells = m.zoneCells[z] || []; let best = -1, bv = 0;
    for (const c of cells) { if (city.lu[c] === CM.LU.WATER) continue; const v = key === 'jobs' ? city.jobs[c] : city.pop[c]; if (v > bv) { bv = v; best = c; } }
    if (best < 0) return null;
    return { x: best % city.W + 0.25 + r() * 0.5, y: ((best / city.W) | 0) + 0.25 + r() * 0.5, z: z };
  };
  // 家：按人口抽小区（与已选的家相距 2.5 km 以上）；opts.near / maxKm 离某地不远，opts.cov 要在地铁步行覆盖内
  const pickHome = function (g, r, avoid, opts) {
    opts = opts || {};
    const m = g.model, acc = m.net && m.net.acc, items = [];
    for (let z = 0; z < m.Z; z++) {
      const p = m.zPop[z]; if (!(p > 800)) continue;
      const c = { x: m.zCx[z], y: m.zCy[z] };
      if (avoid.some(function (a) { return pkm(a, c) < 2.5; })) continue;
      if (opts.near && pkm(opts.near, c) > (opts.maxKm || 15)) continue;
      if (opts.not != null && z === opts.not) continue;
      if (opts.cov && !(acc && acc.zCov && acc.zCov[z] >= 0.6)) continue;
      items.push([z, Math.pow(p, 0.8)]);
    }
    const z = weighted(r, items);
    if (z == null) return opts.cov || opts.near ? pickHome(g, r, avoid, { not: opts.not }) : null;
    const p = zonePoint(g, z, 'pop', r); if (!p) return null;
    p.name = placeName(g, z);
    return p;
  };
  // 去处：job 岗位多的小区（近的多）、cbd 岗位最密的一批小区、uni / hosp 对应的重要设施、daily 附近的公园商场景点医院、school 附近的学校（按人口）
  const pickDest = function (g, r, type, home, notName) {
    const m = g.model, items = [], facs = m.fn ? m.fn.list : [];
    const facPick = function (types, maxKm, scale, minKm) {
      for (const f of facs) {
        if (!f || (f.T && f.T.hub) || types.indexOf(f.t) < 0) continue;
        const d = pkm(home, f); if (d > maxKm || d < (minKm || 0) || short(f.name) === notName) continue;
        items.push([f, Math.exp(-d / scale)]);
      }
      const f = weighted(r, items); items.length = 0;
      return f ? { x: f.x, y: f.y, f: f.id, name: short(f.name), type: type } : null;
    };
    if (type === 'uni') return facPick(['uni'], 30, 10) || pickDest(g, r, 'cbd', home, notName);
    if (type === 'hosp') return facPick(['hosp'], 25, 8) || pickDest(g, r, 'job', home, notName);
    if (type === 'daily') { const f = facPick(['park', 'shop', 'scenic', 'hosp', 'venue'], 8, 3, 0.6); if (f) return f; }
    let jobs = null;
    if (type === 'cbd') { jobs = []; for (let z = 0; z < m.Z; z++) if (m.zJobs[z] > 0) jobs.push(m.zJobs[z]); jobs.sort(function (a, b) { return b - a; }); }
    const cut = jobs && jobs.length ? jobs[Math.min(jobs.length - 1, Math.max(5, Math.floor(jobs.length * 0.06)))] : 0;
    for (let z = 0; z < m.Z; z++) {
      const c = { x: m.zCx[z], y: m.zCy[z] }, d = pkm(home, c);
      let w = 0;
      if (type === 'school' || type === 'primary') { if (m.zPop[z] > 1500 && d >= (type === 'primary' ? 0.3 : 0.8) && d <= (type === 'primary' ? 2.5 : 5)) w = m.zPop[z] * Math.exp(-d / 2); }
      else if (type === 'daily') { if (m.zJobs[z] > 300 && d >= 0.5 && d <= 5) w = m.zJobs[z] * Math.exp(-d / 2); }
      else if (type === 'cbd') { if (m.zJobs[z] >= cut && d <= 28) w = m.zJobs[z] * Math.exp(-d / 12); }
      else if (m.zJobs[z] > 400 && d >= 1.2 && d <= 20) w = m.zJobs[z] * Math.exp(-d / 7);
      if (w > 0 && placeName(g, z) !== notName) items.push([z, w]);
    }
    const z = weighted(r, items); if (z == null) return null;
    const p = zonePoint(g, z, type === 'school' || type === 'primary' ? 'pop' : 'jobs', r); if (!p) return null;
    const pn = placeName(g, z);
    p.name = type === 'school' ? pn + '的中学' : type === 'primary' ? pn + '的小学' : pn; p.type = type;
    return p;
  };
  const kidAge = function (c, ym) { return c.kid ? c.kid.age0 + (ym - c.since) / 12 : 0; };
  F.age = function (c, ym) { return Math.floor(c.age0 + (ym - c.since) / 12); };

  // 开局（或旧存档第一次打开）时挑选市民
  F.ensure = function (g) {
    if (!g || g.tutorial) return null;
    if (g.folks && g.folks.list) return g.folks;
    const m = g.model; if (!m || !m.zPop || !m.Z || !m.zoneCells) return null;
    let pop = 0; for (let z = 0; z < m.Z; z++) pop += m.zPop[z];
    if (pop < 5000) return null;
    const n = pop < 2e6 ? 8 : (pop < 6e6 ? 10 : 12), ym = g.ym();
    const r = rng(hash((g.seed || 1) + ':' + (g.mapId || CM.mapId || '') + ':folks'));
    const list = [];
    for (let k = 0; k < ORDER.length && list.length < n; k++) {
      const R = ROLES[ORDER[k]];
      const home = pickHome(g, r, list.map(function (c) { return c.home; })); if (!home) continue;
      const dest = pickDest(g, r, R.dest, home); if (!dest) continue;
      const age = R.age[0] + Math.floor(r() * (R.age[1] - R.age[0] + 1)), nick = home.name + R.role, sd = hash(nick + ':' + k);
      const c = { id: 'f' + k, rid: ORDER[k], role: R.role, kind: R.kind, nick: nick, color: AVA[sd % AVA.length], handle: '@life_' + (1000 + sd % 9000),
        car: r() < R.car, age0: age, since: ym, stageAt: ym, home: home, dest: dest, kid: R.kid ? { age0: 2 + Math.floor(r() * 3), stage: 0 } : null,
        next: ym + 26 + Math.floor(r() * 46), hist: [], cur: null, netV: null, lastPost: -99, crowdAt: -99, nearSt: null };
      if (c.kind === 'student') c.next = ym + 40 + Math.floor(r() * 8);
      if (c.kind === 'teen') c.next = ym + 36 + Math.floor(r() * 6);
      if (c.kid) c.next = Math.min(c.next, ym + Math.round((6 - c.kid.age0) * 12) + Math.floor(r() * 6));
      list.push(c);
    }
    if (!list.length) return null;
    // 交通结果已就绪时：开局的去处也挑通勤合理的（单程一小时以内优先）
    if (CM.Journey && CM.Journey.ready(g)) for (const c of list) {
      let t = evalTrip(g, c, c.home, c.dest); if (t && t.min <= 65) continue;
      for (let k = 0; k < 4; k++) { const d2 = pickDest(g, r, ROLES[c.rid].dest, c.home); const t2 = d2 && evalTrip(g, c, c.home, d2); if (t2 && (!t || t2.min < t.min)) { c.dest = d2; t = t2; if (t2.min <= 60) break; } }
    }
    g.folks = { v: 1, ym0: ym, list: list, log: [], seen: ym - 1, seq: 0 };
    return g.folks;
  };
  // 默认头像（代码生成的插画）：按人设定发型、年龄与配饰（护士帽、外卖头盔、书包带、领带、工牌、耳机、眼镜……），
  // 肤色、发色、衣服颜色按市民的固定种子变化；毕业、退休后衣着随身份换。返回 SVG 字符串（64×64，圆形）
  const SKIN = ['#f6d3b3', '#efc39c', '#e2ad86', '#c98e66', '#f9dcc4'], HAIR = ['#2b2321', '#3b2a22', '#5a3b28', '#1f1c1b', '#6b4a33'], GRAY = ['#c9c6c2', '#b9b5b0', '#d8d5d1'];
  const LOOK = {   // 发型 hs（short 短发 / long 长发 / bob 波波头 / pony 马尾 / curly 卷发 / thin 稀疏）、女性概率、老年
    mom: { hs: ['long', 'pony', 'bob'], f: 1 }, auntie: { hs: ['curly'], f: 1, old: 1 }, uni: { hs: ['short', 'bob', 'pony', 'short'], f: 0.5 },
    early: { hs: ['short', 'bob'], f: 0.4 }, nurse: { hs: ['bob', 'pony', 'short'], f: 0.75 }, office: { hs: ['short', 'long'], f: 0.4 },
    rider: { hs: ['short'], f: 0.1 }, teen: { hs: ['short', 'pony', 'bob'], f: 0.5 }, thrift: { hs: ['short', 'bob', 'long'], f: 0.5 },
    local: { hs: ['thin', 'short'], f: 0.2, old: 1 }, intern: { hs: ['short', 'pony', 'bob'], f: 0.5 }, grad: { hs: ['short', 'long'], f: 0.5 },
  };
  const avCache = new Map();
  F.avatar = function (c) {
    const key = c.id + '|' + c.rid + '|' + c.kind + '|' + c.color + '|' + c.handle;
    let svg = avCache.get(key); if (svg) return svg;
    const r = rng(hash(c.handle + ':face')), pk = function (a) { return a[Math.floor(r() * a.length)]; };
    const L = LOOK[c.rid] || LOOK.early, female = r() < L.f, old = !!L.old || (c.kind === 'retiree'), hs = pk(L.hs);
    const skin = pk(SKIN), hair = old ? pk(GRAY) : pk(HAIR);
    const tint = function (hex, k) { const v = parseInt(hex.slice(1), 16), R = v >> 16, G = (v >> 8) & 255, B = v & 255; const m = function (x) { return Math.round(x + (255 - x) * k); }; return 'rgb(' + m(R) + ',' + m(G) + ',' + m(B) + ')'; };
    const dark = function (hex, k) { const v = parseInt(hex.slice(1), 16), R = v >> 16, G = (v >> 8) & 255, B = v & 255; return 'rgb(' + Math.round(R * k) + ',' + Math.round(G * k) + ',' + Math.round(B * k) + ')'; };
    const kind = c.kind, role = c.rid;
    // 衣服：护士白、外卖黄 / 蓝、学生校服、上班族深色西装，其余按种子
    const shirt = kind === 'nurse' ? '#f4f7fb' : role === 'rider' && kind === 'courier' ? pk(['#f2b705', '#2f80ed']) : kind === 'teen' ? pk(['#3b6db3', '#2f8f6b', '#b33b3b']) :
      (kind === 'work' && (role === 'office' || c.role === '上班族')) ? pk(['#2f3b52', '#3a4660', '#4b3f36']) : kind === 'retiree' ? pk(['#b5546b', '#7b6bb0', '#5a8f7b', '#c07a3a']) : pk(['#5b8def', '#e07a5f', '#6aa66f', '#8e6fc1', '#d4a017', '#4aa3a2']);
    const out = [];
    out.push('<svg viewBox="5 4 54 54" xmlns="http://www.w3.org/2000/svg" class="fk-face" aria-hidden="true">');
    out.push('<circle cx="32" cy="32" r="32" fill="' + tint(c.color, 0.72) + '"/>');
    // 长发、马尾垂在后面
    if (hs === 'long') out.push('<path d="M17 30c0-11 7-18 15-18s15 7 15 18v16H17z" fill="' + hair + '"/>');
    if (hs === 'pony' && !(kind === 'courier')) out.push('<ellipse cx="46" cy="33" rx="5" ry="9" fill="' + hair + '"/>');
    // 身体与脖子
    out.push('<path d="M10 64c1-11 10-17 22-17s21 6 22 17z" fill="' + shirt + '"/>');
    out.push('<rect x="27.5" y="38" width="9" height="10" rx="3" fill="' + dark(skin, 0.9) + '"/>');
    // 衣领、领带、工牌、书包带
    if (kind === 'work' && (role === 'office' || c.role === '上班族' || role === 'early')) {
      out.push('<path d="M26 48l6 7 6-7-6 3z" fill="#fff"/>');
      if (!female) out.push('<path d="M31 51h2l1.4 9-2.4 3-2.4-3z" fill="' + pk(['#c0392b', '#2d6cdf', '#8e44ad', '#16a085']) + '"/>');
    } else if (kind === 'nurse') out.push('<path d="M26 48l6 6 6-6" fill="none" stroke="#9fb6cf" stroke-width="2"/><rect x="38" y="53" width="6" height="4" rx="1" fill="#e85d5d"/>');
    else if (kind === 'teen' || kind === 'student') out.push('<path d="M19 52l3 12M45 52l-3 12" stroke="' + dark(shirt.charAt(0) === '#' ? shirt : '#555555', 0.55) + '" stroke-width="3" stroke-linecap="round"/>' + (kind === 'teen' ? '<path d="M27 48l5 5 5-5" fill="none" stroke="#fff" stroke-width="2"/>' : ''));
    else if (role === 'intern') out.push('<path d="M26 47l6 9 6-9" fill="none" stroke="#3b82f6" stroke-width="1.6"/><rect x="29" y="55" width="6" height="7" rx="1.2" fill="#fff" stroke="#3b82f6" stroke-width="1"/>');
    else if (kind === 'courier') out.push('<path d="M22 50h20" stroke="rgba(255,255,255,.6)" stroke-width="2"/>');
    // 头与耳朵
    out.push('<circle cx="19.5" cy="30" r="3" fill="' + dark(skin, 0.94) + '"/><circle cx="44.5" cy="30" r="3" fill="' + dark(skin, 0.94) + '"/>');
    out.push('<ellipse cx="32" cy="29" rx="12.5" ry="13.5" fill="' + skin + '"/>');
    // 头发 / 帽子 / 头盔
    if (kind === 'courier') {
      const hc = shirt;
      out.push('<path d="M18 28c0-10 6-16 14-16s14 6 14 16v1H18z" fill="' + hc + '"/><path d="M18 27h28" stroke="rgba(0,0,0,.25)" stroke-width="2"/><rect x="21" y="24" width="22" height="4" rx="2" fill="rgba(30,40,60,.55)"/>');
    } else {
      if (hs === 'short') out.push('<path d="M19.5 27c0-9 5.5-14 12.5-14s12.5 5 12.5 13c-3-4-7-6-12.5-6s-9 2-12.5 7z" fill="' + hair + '"/>');
      else if (hs === 'long' || hs === 'bob') out.push('<path d="M19 30c0-10 6-17 13-17s13 7 13 17c-2-6-6-10-13-10s-11 4-13 10z" fill="' + hair + '"/>' + (hs === 'bob' ? '<path d="M19 30c-1 5 0 9 2 11M45 30c1 5 0 9-2 11" stroke="' + hair + '" stroke-width="3.5" stroke-linecap="round"/>' : ''));
      else if (hs === 'pony') out.push('<path d="M19.5 27c0-9 5.5-14 12.5-14s12.5 5 12.5 13c-4-3-8-5-12.5-5s-9 2-12.5 6z" fill="' + hair + '"/>');
      else if (hs === 'curly') { for (const q of [[22, 21], [27, 17], [33, 16], [39, 18], [43, 23], [20, 27], [44, 28]]) out.push('<circle cx="' + q[0] + '" cy="' + q[1] + '" r="5" fill="' + hair + '"/>'); }
      else if (hs === 'thin') out.push('<path d="M20 28c0-4 1-7 3-9M44 28c0-4-1-7-3-9" stroke="' + hair + '" stroke-width="3.5" stroke-linecap="round"/>');
      if (kind === 'nurse') out.push('<path d="M22 17h20l-2 6H24z" fill="#fff" stroke="#d7e1ec" stroke-width="1"/><path d="M32 17.5v4.5M29.8 19.8h4.4" stroke="#e85d5d" stroke-width="1.6"/>');
    }
    // 五官：眼睛、眉毛、微笑、腮红；老人、部分人设戴眼镜，部分大学生戴耳机
    const ey = 30, glasses = old ? r() < 0.75 : (role === 'uni' || role === 'intern' || role === 'thrift') && r() < 0.45;
    out.push('<circle cx="27" cy="' + ey + '" r="1.5" fill="#2b2b2b"/><circle cx="37" cy="' + ey + '" r="1.5" fill="#2b2b2b"/>');
    if (kind !== 'courier') out.push('<path d="M24.5 ' + (ey - 4) + 'q2.5-1.6 5 0M34.5 ' + (ey - 4) + 'q2.5-1.6 5 0" fill="none" stroke="' + dark(old ? '#7a7570' : hair.charAt(0) === '#' ? hair : '#333333', 0.9) + '" stroke-width="1.2" stroke-linecap="round"/>');
    out.push('<path d="M28.5 35.5q3.5 3 7 0" fill="none" stroke="#9a5a48" stroke-width="1.4" stroke-linecap="round"/>');
    if (female || kind === 'teen') out.push('<circle cx="24.5" cy="34" r="2" fill="#f19c8f" opacity=".45"/><circle cx="39.5" cy="34" r="2" fill="#f19c8f" opacity=".45"/>');
    if (old) out.push('<path d="M24 37.5q1.5 1 3 0M37 37.5q1.5 1 3 0" fill="none" stroke="' + dark(skin, 0.78) + '" stroke-width="0.8"/>');
    if (glasses) out.push('<g fill="none" stroke="#3a3a3a" stroke-width="1.2"><circle cx="27" cy="' + ey + '" r="3.6"/><circle cx="37" cy="' + ey + '" r="3.6"/><path d="M30.6 ' + ey + 'h2.8"/></g>');
    if (role === 'uni' && kind === 'student' && !glasses && r() < 0.6) out.push('<path d="M18 30c0-11 6-17 14-17s14 6 14 17" fill="none" stroke="#333" stroke-width="2.2"/><rect x="15.5" y="27" width="5" height="8" rx="2.2" fill="#e04f5f"/><rect x="43.5" y="27" width="5" height="8" rx="2.2" fill="#e04f5f"/>');
    if (female && old && r() < 0.5) out.push('<circle cx="19.5" cy="34" r="1.2" fill="#f5f0e6"/><circle cx="44.5" cy="34" r="1.2" fill="#f5f0e6"/>');
    out.push('</svg>');
    svg = out.join(''); avCache.set(key, svg);
    if (avCache.size > 256) avCache.delete(avCache.keys().next().value);
    return svg;
  };
  F.byId = function (g, id) { const S = g && g.folks; return S ? S.list.find(function (c) { return c.id === id; }) || null : null; };
  const perOf = function (c) { return c.kind === 'nurse' ? 3 : (c.kind === 'retiree' ? 1 : 0); };
  F.perOf = perOf;
  // 他会怎么走：有地铁且不慢就坐地铁（略偏好，准点），没有车的人不开车（开车略偏不爱，停车与油费），30 分钟以内能走到就走路
  const choose = function (c, P) {
    const cs = [];
    if (P.metro) cs.push(['metro', P.metro.min * 0.97, P.metro.min]);
    if (P.bus) cs.push(['bus', P.bus.min, P.bus.min]);
    if (c.car && P.car) cs.push(['car', P.car.min * 1.08, P.car.min]);
    if (P.walk && P.walk.min <= 30) cs.push(['walk', P.walk.min * 0.9, P.walk.min]);
    cs.sort(function (a, b) { return a[1] - b[1]; });
    return cs.length ? { mode: cs[0][0], min: cs[0][2] } : null;
  };
  const evalTrip = function (g, c, from, to) {
    const P = CM.Journey.plan(g, from, to, { per: perOf(c) });
    if (!P.ok) return null;
    const ch = choose(c, P); if (!ch) return null;
    const rides = ch.mode === 'metro' ? P.metro.legs.filter(function (l) { return l.k === 'ride'; }) : [];
    let worst = null; for (const l of rides) if (!worst || l.crowd > worst.crowd) worst = l;
    return { ym: g.ym(), mode: ch.mode, min: ch.min, metro: P.metro ? P.metro.min : null, bus: P.bus ? P.bus.min : null, car: P.car ? P.car.min : null, walk: P.walk ? P.walk.min : null,
      lines: rides.map(function (l) { return l.line; }), labels: rides.map(function (l) { return l.label; }), crowd: worst ? worst.crowd : 1,
      cl: worst ? { l: worst.label, s: worst.from, t: worst.to } : null };
  };
  const pushHist = function (c, cur, ev) {
    const last = c.hist[c.hist.length - 1], code = MODES.indexOf(cur.mode), v = Math.round(cur.min);
    if (!ev && last && Math.abs(last[1] - v) < 1 && last[2] === code) return;
    c.hist.push(ev ? [cur.ym, v, code, ev] : [cur.ym, v, code]);
    if (c.hist.length > MAX_HIST) c.hist.splice(0, c.hist.length - MAX_HIST);
  };
  const post = function (S, c, kind, tone, text, meta) {
    const p = { id: ++S.seq, ym: (meta && meta.ym) || S._ym, fid: c.id, kind: kind, tone: tone, text: text, meta: meta || {} };
    S.log.push(p); if (S.log.length > MAX_LOG) S.log.splice(0, S.log.length - MAX_LOG);
    c.lastPost = p.ym;
    return p;
  };
  const introText = function (c, cur) {
    const t = c.kind === 'student' || c.kind === 'teen' ? T.introSchool : c.kind === 'nurse' ? T.introNurse : c.kind === 'retiree' ? T.introDaily : c.kind === 'courier' ? T.introCourier : T.introWork;
    return fill(t, { a: c.home.name, b: c.dest.name, m: HOW[cur.mode], c: mins(cur.min) });
  };
  // 线网变化后的通勤动态
  const commutePost = function (g, S, c, old, nw) {
    const a = old.min, b = nw.min, drop = a - b, v = { a: c.home.name, b: c.dest.name, c: mins(a), d: mins(b), e: mins(b - a), m: HOW[old.mode] };
    const fresh = nw.lines.find(function (l) { return old.lines.indexOf(l) < 0; }), L = fresh && g.net.lines[fresh];
    const meta = { a: a, b: b, mode: nw.mode, old: old.mode };
    if (nw.mode === 'metro' && old.mode !== 'metro') { v.l = nw.labels[0] || (L ? L.name : '地铁'); return post(S, c, 'metro', 'good', fill(T.metro, v), meta); }
    if (drop >= Math.max(4, a * 0.12)) { if (L) { v.l = L.name; return post(S, c, 'better', 'good', fill(T.better, v), meta); } return post(S, c, 'better', 'good', fill(T.betterAny, v), meta); }
    if (-drop >= Math.max(5, a * 0.2)) return post(S, c, 'worse', 'bad', fill(T.worse, v), meta);
    return null;
  };
  // 人生事件：按人设挑一件，改变家、去处或身份，重算通勤并发一条动态
  const lifeEvent = function (g, S, c, ym) {
    const r = rng(hash(c.id + ':' + ym + ':' + (g.seed || 1))), old = c.cur || evalTrip(g, c, c.home, c.dest);
    if (!old) { c.next = ym + 1; return null; }
    const age = F.age(c, ym), hasMetro = !!(g.model.net && g.model.net.C.serviced.some(Boolean));
    let ev;
    if (c.kind === 'student' && ym - c.stageAt >= 38) ev = 'grad';
    else if (c.kind === 'teen' && ym - c.stageAt >= 34) ev = 'uni';
    else if (c.kid && kidAge(c, ym) >= 5.8 && c.kid.stage < 1) ev = 'kid';
    else if (c.kid && kidAge(c, ym) >= 11.8 && c.kid.stage < 2) ev = 'kid2';
    else if (c.kind === 'work' && age >= 60) ev = 'retire';
    else if (c.kind === 'retiree') ev = r() < 0.6 ? 'routine' : 'move';
    else if (c.kind === 'student' || c.kind === 'teen') ev = 'move';
    else ev = r() < 0.55 ? 'job' : 'move';
    const before = { home: c.home, dest: c.dest, kind: c.kind, role: c.role, stageAt: c.stageAt, car: c.car };
    let tpl = null, extra = {}, tripTo = null;
    // 像真人那样挑：抽几处候选，各算一次通勤，挑最省时的（能坐地铁略加分）；都要一个半小时以上就先不变
    const pickBest = function (gen, isHome) {
      let best = null;
      for (let k = 0; k < 5; k++) {
        const p = gen(); if (!p) continue;
        const t = evalTrip(g, c, isHome ? p : c.home, isHome ? c.dest : p); if (!t) continue;
        const sc = t.min - (t.mode === 'metro' ? 4 : 0);
        if (!best || sc < best.s) best = { p: p, s: sc };
        if (sc <= 38) break;
      }
      return best && best.s <= 95 ? best.p : null;
    };
    if (ev === 'move') {
      const near = hasMetro && r() < 0.6, h2 = pickBest(function () { return pickHome(g, r, [], { near: c.dest, maxKm: 15, cov: near, not: c.home.z }); }, true);
      if (!h2) { c.next = ym + 12; return null; }
      c.home = h2;
      const wl = CM.Journey.walkLinks(g, h2.x, h2.y);
      if (wl.length && wl[0].min <= 8) { tpl = T.moveNear; extra = { s: g.model.net.C.stations[wl[0].s].name, w: mins(wl[0].min) }; } else tpl = T.move;
    } else if (ev === 'job') {
      const type = c.kind === 'nurse' ? 'hosp' : c.kind === 'courier' ? 'cbd' : (ROLES[c.rid] && ROLES[c.rid].dest === 'cbd' ? 'cbd' : 'job');
      const d2 = pickBest(function () { return pickDest(g, r, type, c.home, c.dest.name); }); if (!d2) { c.next = ym + 12; return null; }
      c.dest = d2; tpl = c.kind === 'nurse' ? T.nurseJob : c.kind === 'courier' ? T.courierJob : T.job;
    } else if (ev === 'kid' || ev === 'kid2') {
      tripTo = pickDest(g, r, ev === 'kid' ? 'primary' : 'school', c.home);
      if (!tripTo) { c.next = ym + 12; return null; }
      tpl = ev === 'kid' ? T.kid : T.kid2;
    } else if (ev === 'grad') {
      const d2 = pickBest(function () { return pickDest(g, r, 'cbd', c.home); }); if (!d2) { c.next = ym + 6; return null; }
      c.dest = d2; c.kind = 'work'; c.role = '上班族'; c.stageAt = ym; c.car = false; tpl = T.grad;
    } else if (ev === 'uni') {
      const d2 = pickBest(function () { return pickDest(g, r, 'uni', c.home); }); if (!d2) { c.next = ym + 6; return null; }
      c.dest = d2; c.kind = 'student'; c.role = '大学生'; c.stageAt = ym; tpl = T.uniIn;
    } else if (ev === 'retire') {
      const d2 = pickBest(function () { return pickDest(g, r, 'daily', c.home); }); if (!d2) { c.next = ym + 12; return null; }
      c.dest = d2; c.kind = 'retiree'; c.car = false; tpl = T.retire;
    } else {
      const d2 = pickBest(function () { return pickDest(g, r, 'daily', c.home, c.dest.name); }); if (!d2) { c.next = ym + 12; return null; }
      c.dest = d2; tpl = T.routine;
    }
    // 孩子上学：家长主页另记一条孩子的上学路（家长自己的通勤不变）
    if (tripTo) {
      const kt = evalTrip(g, { car: c.car && ev === 'kid', kind: 'teen' }, c.home, tripTo);
      if (!kt) { c.next = ym + 1; return null; }
      c.kid.school = tripTo; c.kid.stage = ev === 'kid' ? 1 : 2;
      c.kid.trip = { mode: kt.mode, min: kt.min, ym: ym };
      post(S, c, ev, 'life', fill(tpl, { b: tripTo.name, m: HOW[kt.mode], d: mins(kt.min) }), { ym: ym, b: kt.min, mode: kt.mode, ev: ev });
    } else {
      const nw = evalTrip(g, c, c.home, c.dest);
      if (!nw) { Object.assign(c, before, { next: ym + 1 }); return null; }
      c.cur = nw; c.netV = g.netVersion; pushHist(c, nw, ev);
      post(S, c, ev, 'life', fill(tpl, Object.assign({ a: before.home.name, b: ev === 'move' ? c.home.name : c.dest.name, c: c.dest.name, m: HOW[nw.mode], d: mins(nw.min), e: mins(old.min) }, extra)),
        { ym: ym, a: old.min, b: nw.min, mode: nw.mode, old: old.mode, ev: ev });
    }
    c.next = ym + 30 + Math.floor(r() * 48);
    if (c.kid && c.kid.stage < 2) c.next = Math.min(c.next, c.since + Math.round((12 - c.kid.age0) * 12) + 1);
    if (c.kind === 'student') c.next = Math.max(c.next, c.stageAt + 40);
    return ev;
  };
  // 每月：先处理到期的人生事件，再在线网变化（或每半年）时重算通勤；每月最多几条动态，避免刷屏
  F.monthly = function (g) {
    const S = F.ensure(g); if (!S || !CM.Journey || !CM.Journey.ready(g)) return;
    const ym = g.ym(), nv = g.netVersion, C = g.model.net.C; let n = 0;
    S._ym = ym;
    for (const c of S.list) {
      if (c.cur && c.next <= ym && n < MAX_POSTS && c.lastPost !== ym) { const ev = lifeEvent(g, S, c, ym); if (ev) { n++; continue; } }
      if (c.netV === nv && c.cur && ym - c.cur.ym < 6) continue;
      const nw = evalTrip(g, c, c.home, c.dest); if (!nw) continue;
      const old = c.cur, netChanged = c.netV != null && c.netV !== nv;
      c.cur = nw; c.netV = nv; pushHist(c, nw);
      if (!old) { post(S, c, 'intro', 'life', introText(c, nw), { ym: ym, b: nw.min, mode: nw.mode }); continue; }
      if (n >= MAX_POSTS || c.lastPost === ym) continue;
      if (netChanged) {
        if (commutePost(g, S, c, old, nw)) { n++; continue; }
        // 家门口的新车站（近半年开通、步行 10 分钟以内）
        const wl = CM.Journey.walkLinks(g, c.home.x, c.home.y), w0 = wl[0], st = w0 && C.stations[w0.s];
        if (st && w0.min <= 10 && st.id !== c.nearSt) {
          const s0 = g.net.stations[st.id], fresh = s0 && s0.built && ym - U.ymIndex(s0.built[0], s0.built[1]) <= 6;
          c.nearSt = st.id;
          if (fresh) { post(S, c, 'station', 'good', fill(T.station, { s: st.name, w: mins(w0.min) }), { ym: ym, b: nw.min, mode: nw.mode }); n++; continue; }
        }
      }
      // 天天挤车：最挤的一段早高峰满载（拥挤系数 ≥ 1.22，约满载率 100%），一年半最多说一次
      if (nw.mode === 'metro' && nw.crowd >= 1.22 && nw.cl && ym - c.crowdAt >= 18 && perOf(c) === 0) {
        c.crowdAt = ym; post(S, c, 'crowd', 'bad', fill(T.crowd, nw.cl), { ym: ym, b: nw.min, mode: nw.mode }); n++;
      }
    }
  };
  // 打开地铁圈时：还没算过通勤的市民先算一次（开局当月就能看到他们）
  F.sync = function (g) {
    const S = F.ensure(g); if (!S || !CM.Journey || !CM.Journey.ready(g)) return S;
    S._ym = g.ym();
    for (const c of S.list) if (!c.cur) { const nw = evalTrip(g, c, c.home, c.dest); if (!nw) continue; c.cur = nw; c.netV = g.netVersion; pushHist(c, nw); post(S, c, 'intro', 'life', introText(c, nw), { ym: S._ym, b: nw.min, mode: nw.mode }); }
    return S;
  };
  F.restore = function (g, state) {
    if (!state || state.v !== 1 || !Array.isArray(state.list) || !Array.isArray(state.log)) return;
    const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && typeof p.name === 'string';
    const list = state.list.slice(0, ORDER.length).filter(c => c && Object.hasOwn(ROLES, c.rid) && point(c.home) && point(c.dest) && Array.isArray(c.hist)).map(c => ({
      ...c,
      color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : AVA[hash(c.id) % AVA.length],
      netV: state.netVersion != null && c.netV != null && c.netV !== state.netVersion ? -1 : g.netVersion,
    }));
    if (!list.length) return;
    g.folks = { ...state, list, log: state.log.filter(p => p && typeof p.text === 'string').slice(-MAX_LOG) };
  };
  F.posts = function (g, fid) { const S = g && g.folks; if (!S) return []; const out = S.log.filter(function (p) { return !fid || p.fid === fid; }); return out.reverse(); };
  F.newCount = function (g) { const S = g && g.folks; if (!S) return 0; let n = 0; for (const p of S.log) if (p.ym > S.seen) n++; return n; };
  F.markSeen = function (g) { if (g && g.folks) g.folks.seen = g.ym(); };
  F.purpose = function (c) { return c.kind === 'student' || c.kind === 'teen' ? '上学' : c.kind === 'nurse' ? '值夜班' : c.kind === 'retiree' ? '常去' : c.kind === 'courier' ? '接单' : '上班'; };
  // 主页用：完整的路线（含开车路线的几何）
  F.plan = function (g, c, to) { return CM.Journey.plan(g, c.home, to || c.dest, { per: perOf(c), geom: true }); };
})(window.CM);
