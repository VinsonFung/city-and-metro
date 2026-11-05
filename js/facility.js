'use strict';
// 城市设施（v1.9）：重要设施（铁路客运站、机场、大学、医院、商圈、商务区、景点、公园、体育场馆、会展中心）
// 按真实位置、启用/停用年份与规模单独参与出行需求（sim.js 中作为独立的出行目的地节点）；
// 普通设施（中小学、社区商业、诊所、街区公园等）不逐个建模，按交通小区的用地、人口与岗位汇总（sim.js buildZones）。
// 数据来源：位置与年份见各地图数据文件 facilities（史实参考 / 虚构），规模均为估算；模拟到访量为游戏结果。
(function (CM) {
  const U = CM.U, D = CM.DATA;

  // p：吸引的出行目的及比例；we：周末相对该目的平均水平的吸引倍数；L：距离衰减长度相对 distDecayHO 的倍数；r：默认场地半径（格）
  const TYPES = {
    rail: { name: '铁路客运站', icon: 'train', p: { hb: 1 }, hub: true, we: 1, L: 0, r: 0.6, group: '交通枢纽' },
    air: { name: '机场', icon: 'plane', p: { hb: 1 }, hub: true, we: 1, L: 0, r: 1.2, group: '交通枢纽' },
    uni: { name: '大学', icon: 'school', p: { sc: 1 }, we: 3, L: 1.8, r: 1.0, group: '教育' },
    hosp: { name: '医院', icon: 'hospital', p: { md: 1 }, we: 1, L: 1.8, r: 0.5, group: '医疗' },
    shop: { name: '商圈', icon: 'bag', p: { sh: 0.8, lz: 0.2 }, we: 1.1, L: 1.5, r: 1.0, group: '商业' },
    cbd: { name: '商务区', icon: 'building', p: { sh: 1 }, we: 0.35, L: 1.6, r: 1.4, group: '商业' },
    scenic: { name: '景点', icon: 'camera', p: { lz: 1 }, we: 1.25, L: 2.6, r: 0.8, group: '旅游休闲' },
    park: { name: '公园', icon: 'tree', p: { lz: 1 }, we: 1.15, L: 1.4, r: 1.0, group: '旅游休闲' },
    stadium: { name: '体育场馆', icon: 'stadium', p: { lz: 1 }, we: 1.3, L: 2.4, r: 0.6, group: '旅游休闲' },
    venue: { name: '会展中心', icon: 'expo', p: { sh: 0.6, lz: 0.4 }, we: 0.6, L: 2.4, r: 0.8, group: '商业' },
  };
  const Fac = { TYPES: TYPES };
  CM.Fac = Fac;

  // 地图外设施的接驳点（v2.1，数据中 ext: [方向, 距地图边缘公里数]）：设施本体在地图外，图上标出方向与距离
  const EXT_DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], NE: [0.7071, -0.7071], NW: [-0.7071, -0.7071], SE: [0.7071, 0.7071], SW: [-0.7071, 0.7071] };
  const EXT_NAME = { N: '北', S: '南', E: '东', W: '西', NE: '东北', NW: '西北', SE: '东南', SW: '西南' };
  // 从 (x,y) 沿方向 v 到地图边缘的距离（格）
  Fac.edgeDist = function (x, y, v) {
    const W = CM.CFG.W, H = CM.CFG.H;
    let s = Infinity;
    if (v[0] > 0) s = Math.min(s, (W - x) / v[0]); else if (v[0] < 0) s = Math.min(s, -x / v[0]);
    if (v[1] > 0) s = Math.min(s, (H - y) / v[1]); else if (v[1] < 0) s = Math.min(s, -y / v[1]);
    return isFinite(s) ? Math.max(0, s) : 0;
  };
  // 地图外设施的接驳口（v2.1）：设施方向上的地图边缘点（ex, ey），以及紧贴边缘线内侧的建站位置（x, y）。
  // 线路修到边缘线上的接驳口附近（或点击地图外的提示卡）即吸附到这里建站，在地图边缘接通该设施：不受区域开放、水面等选址限制
  Fac.portal = function (f) {
    if (!f || !f.ext) return null;
    if (f._portal && f._portalW === CM.CFG.W) return f._portal;
    const v = f.ext.v, s = Fac.edgeDist(f.x, f.y, v), ex = f.x + v[0] * s, ey = f.y + v[1] * s;
    f._portal = { x: ex - v[0] * 0.1, y: ey - v[1] * 0.1, ex: ex, ey: ey }; f._portalW = CM.CFG.W;
    return f._portal;
  };
  Fac.isPortalStation = function (st, f) {
    if (!st || !st.portal || (f && st.portal !== f.id)) return false;
    const pf = f || Fac.byId(st.portal), p = Fac.portal(pf);
    return !!p && U.dist(st.x, st.y, p.x, p.y) < 1.2;   // 车站被拖离接驳口后不再算接通
  };
  Fac.shortName = function (f) { return f.name.replace(/（.*）/, ''); };
  // 地铁接通地图外（v2.1）：接驳口有运营中的车站，或接驳点约 800 m 内有运营中的车站，即视为线路在地图边缘接通该设施，
  // 接驳需求由地铁满足。返回车站（编译后网络中的序号、车站、经过的线路），未接通时为 null；按运营网络缓存
  Fac.extLink = function (f, g) {
    if (!f.ext || !g || !g.compiled) return null;
    const C = g.compiled;
    if (C._ext && C._ext.has(f.id)) return C._ext.get(f.id);
    const R = 0.8 * CM.CFG.walk.maxAccessM / CM.CFG.CELL_M;
    let best = -1, bd = R, portal = false;
    C.stations.forEach(function (s, i) {
      if (!C.serviced[i] || portal) return;
      if (Fac.isPortalStation(s, f)) { best = i; bd = 0; portal = true; return; }
      const d = U.dist(s.x, s.y, f.x, f.y); if (d <= bd) { bd = d; best = i; }
    });
    const r = best < 0 ? null : { i: best, st: C.stations[best], lines: Array.from(C.stationLines[best]), d: bd, portal: portal };
    (C._ext || (C._ext = new Map())).set(f.id, r);
    return r;
  };
  Fac.extText = function (f) { return f.ext ? '在地图' + (EXT_NAME[f.ext.dir] || '') + '侧外约 ' + f.ext.km + ' km' : ''; };
  const yrOf = function (v) { return v == null ? null : (Array.isArray(v) ? v[0] + ((v[1] || 1) - 1) / 12 : v); };
  const curve = function (v) { return typeof v === 'number' ? [[0, v]] : v; };

  // 当前地图的设施表（按地图数据缓存）。lm：引用地标（位置、场地与落成年份取自地标）
  // city：传入时同时生成片区设施（需要城市的片区划分）；不传时沿用最近一次生成的表
  Fac.list = function (city) {
    // 切换地图后旧城市的迟到调用：不按新地图的设施表生成，也不覆盖缓存（玩家反馈：不同城市的设施与需求混在一起）
    if (city && city.mapId && city.mapId !== CM.mapId) return [];
    if (D._facSrc === D.facilities && D._fac && (!city || D._facCity === city)) return D._fac;
    const out = [];
    const lms = D.landmarks || [];
    (D.facilities || []).forEach(function (s, i) {
      const T = TYPES[s.t]; if (!T) return;
      const f = { k: out.length, id: s.id || ('f' + i), name: s.n, label: s.label || s.n, t: s.t, T: T, x: 0, y: 0, r: s.r != null ? s.r : T.r, lmK: -1,
        open: null, close: yrOf(s.y1), w: s.w != null ? curve(s.w) : null, pax: s.pax || null, p: s.p || T.p, we: s.we || null, note: s.note || '', src: s.src || null,
        ext: s.ext ? { dir: s.ext[0], km: s.ext[1], v: EXT_DIR[s.ext[0]] || [0, 0] } : null, rw: s.rw || null };   // rw：机场自己的跑道（格坐标，v2.2，用于模型选址）
      if (s.lm) {
        const k = lms.findIndex(function (l) { return l.id === s.lm; });
        if (k < 0) return;
        f.lmK = k; f.x = lms[k].x; f.y = lms[k].y;
        f.open = s.y0 != null ? yrOf(s.y0) : lms[k].year;
      } else if (s.at) { f.x = s.at[0]; f.y = s.at[1]; f.open = s.y0 != null ? yrOf(s.y0) : -1e9; }
      else return;
      if (f.open == null) f.open = -1e9;
      out.push(f);
    });
    if (city) genDistrict(out, city);
    D._fac = out; D._facSrc = D.facilities; D._facCity = city || null;
    return out;
  };
  // 片区设施（v2.1 第二轮：重要设施集中在老城与天河，外围片区发展起来后没有设施需求）：真实地图的每个片区
  // 生成区域级商业中心、医院与文体公园，片区开放且人口达到门槛后启用；附近已有同类真实设施时不生成。
  // 位置取片区内规模最大的发展中心（DATA.centers），没有时取片区中心。门槛按本图 2020 年人口的比例
  const GEN = [
    { t: 'shop', suf: '商业中心', w: 0.012, min: 0.012, near: 3.5, like: ['shop', 'cbd'] },
    { t: 'hosp', suf: '区域医院', w: 0.015, min: 0.02, near: 4, like: ['hosp'] },
    { t: 'park', suf: '文体公园', w: 0.008, min: 0.015, near: 3, like: ['park', 'scenic', 'stadium'] },
  ];
  function genDistrict(out, city) {
    const CFG = CM.CFG, regs = city.regions || [];
    if (D.fictional || !city.region) return;
    const km = CFG.CELL_M / 1000, popRef = U.interp(CFG.growth.popCurve, CFG.growth.histEnd);
    regs.forEach(function (rg, k) {
      if (rg.scenic || !rg.cells || rg.cx == null || rg === D.defaultRegion) return;   // 不含风景区与「外围地区」
      let at = null, best = -1;
      for (const ct of D.centers || []) {
        const c = city.cellAt(ct.x, ct.y);
        if (c >= 0 && city.region[c] === k && ct.pop + ct.jobs > best) { best = ct.pop + ct.jobs; at = [ct.x, ct.y]; }
      }
      if (!at && rg.cx != null) at = [rg.cx, rg.cy];
      if (!at) return;
      // 名称取片区名去掉括注；机场旧址片区以括注中的新城名命名（如「白云新城」）
      const nm = String(rg.name), paren = /（([^（）·]+)）/.exec(nm), short = rg.id === 'airport' && paren ? paren[1] : nm.replace(/（.*）/, '');
      for (const G of GEN) {
        if (out.some(function (f) { return G.like.indexOf(f.t) >= 0 && !f.ext && U.dist(f.x, f.y, at[0], at[1]) * km < G.near; })) continue;
        const T = TYPES[G.t];
        out.push({ k: out.length, id: 'gen-' + (rg.id || k) + '-' + G.t, name: short + G.suf, t: G.t, T: T, x: at[0], y: at[1], r: T.r, lmK: -1,
          open: -1e9, close: null, w: [[0, G.w]], pax: null, p: T.p, note: '片区人口达到约 ' + U.fmtPeople(popRef * G.min) + ' 后出现的区域级设施（按片区发展生成，非真实设施）', src: null, ext: null,
          gen: { k: k, min: popRef * G.min } });
      }
    });
  }
  // 片区人口（按城市版本缓存）
  Fac.regionPop = function (city, k) {
    let c = city._regPop;
    if (!c || c.v !== city.version) {
      const pop = new Float64Array(city.regions.length);
      for (let i = 0; i < city.N; i++) { const r = city.region[i]; if (r < pop.length) pop[r] += city.pop[i]; }
      c = city._regPop = { v: city.version, pop: pop };
    }
    return c.pop[k] || 0;
  };
  Fac.byId = function (id) { const L = Fac.list(); for (const f of L) if (f.id === id) return f; return null; };
  // 是否在运营：启用年份之后、停用年份之前；引用地标的须地标已落成（填海等场地成陆后），其余须所在格为陆地
  Fac.active = function (f, yr, city) {
    if (yr < f.open || (f.close != null && yr >= f.close)) return false;
    if (f.lmK >= 0) return !!(city.landmarkOn && city.landmarkOn[f.lmK]);
    if (f.gen && (!city.regionOpen[f.gen.k] || Fac.regionPop(city, f.gen.k) < f.gen.min)) return false;
    const c = city.cellAt(f.x, f.y);
    return c >= 0 && city.landFrac[c] >= 0.3;
  };
  // 枢纽：接驳出行（汽车 + 地铁，到达与离开合计，人次/日，工作日）；其他：占全市该目的出行吸引的比例（周期规模，估算）
  Fac.pax = function (f, yr) { return f.pax ? U.interp(f.pax, yr) * 1e4 : 0; };
  // 吸引比例按 trips.facBoost 放大（v2.1 第二轮：设施出行需求整体偏少）；sim.js 中各目的的设施合计另有上限
  Fac.share = function (f, yr) { return f.w ? U.interp(f.w, yr) * (CM.CFG.trips.facBoost || 1) : 0; };
  // 场地格：地标场地或以设施为中心、半径 r 的格（只取陆地）
  Fac.siteCells = function (f, city) {
    const out = [];
    if (f.lmK >= 0) { for (const c of city.landmarkCells(D.landmarks[f.lmK])) if (city.landFrac[c] >= 0.3) out.push(c); }
    else {
      const R = Math.max(0.5, f.r);
      for (let j = Math.floor(f.y - R); j <= Math.floor(f.y + R); j++) for (let i = Math.floor(f.x - R); i <= Math.floor(f.x + R); i++) {
        if (i < 0 || j < 0 || i >= city.W || j >= city.H) continue;
        if (U.dist(i + 0.5, j + 0.5, f.x, f.y) > R + 0.2) continue;
        const c = j * city.W + i; if (city.landFrac[c] >= 0.3) out.push(c);
      }
    }
    const c0 = city.cellAt(f.x, f.y);
    if (!out.length && c0 >= 0) out.push(c0);
    return out;
  };
  // 规模说明（参考规模，估算）
  Fac.sizeText = function (f, yr) {
    if (f.T.hub) return '约 ' + U.fmtNum(Fac.pax(f, yr) / 1e4, 1) + ' 万人次/日的市内接驳出行（工作日，估算）';
    const keys = Object.keys(f.p), nm = CM.CFG.trips.name;
    return '约占全市' + keys.map(function (k) { return nm[k]; }).join('、') + '出行吸引的 ' + U.fmtPct(Fac.share(f, yr), 1) + '（估算）';
  };
  Fac.purposeText = function (f) { const nm = CM.CFG.trips.name; return Object.keys(f.p).map(function (k) { return nm[k]; }).join('、'); };
  // 数据来源标签：[标签, 样式]
  Fac.sources = function (f) {
    if (D.fictional) return [['虚构设定', 'info'], ['规模：估算', 'est']];
    if (f.gen) return [['按片区发展生成', 'info'], ['规模：估算', 'est']];
    const s = f.src || {};
    return [[s.pos || '位置：真实地理', 'hist'], [s.year || (f.lmK >= 0 ? '年份：地标落成（史实）' : '年份：史实参考'), 'hist'], ['规模：估算', 'est']];
  };
})(window.CM);
