// 把 OpenStreetMap（Overpass JSON）转换为游戏底图 js/geo_<name>.js。
// 用法：
//   node scripts/geo-import.mjs --name ld --W 120 --H 96 --lon0 -0.31645 --lat0 51.60780 --kx 277.2 --ky 445.28
// 输入：.tools/osm/<name>/*.json（由 scripts/fetch-osm.mjs 下载，或手工放入 Overpass 的 out geom 结果）
// 输出：js/geo_<name>.js，格式与 geo_tp.js 等一致：增量编码折线、1/64 格精度、格坐标。
// 数据 © OpenStreetMap 贡献者，ODbL。转换只做几何与分类，不改动原始语义。

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}
const name = arg('name') || 'ld';
const W = Number(arg('W') || 120);
const H = Number(arg('H') || 96);
const lon0 = Number(arg('lon0'));
const lat0 = Number(arg('lat0'));
const kx = Number(arg('kx') || 277.2);
const ky = Number(arg('ky') || 445.28);
if (!Number.isFinite(lon0) || !Number.isFinite(lat0)) {
  console.error('需要 --lon0 与 --lat0（地图左上角的经纬度）');
  process.exit(2);
}
// 大型水面（泰晤士河等）在 OSM 里多为关系，成员顺序不保证、环可能跨多个水体。
// 关系水面拼接不可靠时用 --no-relation-water 关闭，改用河流中心线（宽度见 waterWidth）。
const NO_REL_WATER = process.argv.includes('--no-relation-water');
// 简化容差（格）：约 6 m，肉眼不可见，能显著减小文件体积
const TOL_LINE = Number(arg('tol', '0.025'));
const TOL_POLY = Number(arg('tolpoly', '0.015'));
const TOL_ADMIN = Number(arg('toladmin', '0.05'));
const TOL_STREET = Number(arg('tolstreet', '0.06'));
// 公园/林地：无名且面积小于该格数（1 格 = 0.0625 km²）的绿地不写入，避免成千上万的街角花园撑大文件
const MIN_GREEN_CELLS = Number(arg('mingreen', '0'));

// ---------------- 投影 ----------------
const px = (lon) => (lon - lon0) * kx;
const py = (lat) => (lat0 - lat) * ky;

// ---------------- 增量编码（与 js/geo.js 的 Geo.enc 完全一致） ----------------
function enc(flat) {
  let s = '', pxs = 0, pys = 0;
  const put = (v) => { let u = v < 0 ? ~(v << 1) : (v << 1); while (u >= 32) { s += String.fromCharCode((32 | (u & 31)) + 63); u >>>= 5; } s += String.fromCharCode(u + 63); };
  for (let k = 0; k + 1 < flat.length; k += 2) {
    const x = Math.round(flat[k] * 64), y = Math.round(flat[k + 1] * 64);
    if (k > 0 && x === Math.round(flat[k - 2] * 64) && y === Math.round(flat[k - 1] * 64)) continue;
    put(x - pxs); put(y - pys); pxs = x; pys = y;
  }
  return s;
}

// ---------------- 折线简化（Douglas–Peucker，容差单位：格） ----------------
function rdp(pts, tol) {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const qx = pts[i * 2], qy = pts[i * 2 + 1];
      let d;
      if (L === 0) d = (qx - ax) * (qx - ax) + (qy - ay) * (qy - ay);
      else { let t = ((qx - ax) * dx + (qy - ay) * dy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = qx - ax - t * dx, ey = qy - ay - t * dy; d = ex * ex + ey * ey; }
      if (d > best) { best = d; bi = i; }
    }
    if (best > t2) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

// 环的合理性：面积 / 周长 = 平均宽度。拼接失败（成员乱序、自相交）时面积趋近 0 而周长很大，
// 这类退化环会在水域掩膜里造成诡异的陆地/水面，直接丢弃。
function ringArea(flat) {
  const n = flat.length / 2;
  let a = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], yi = flat[i * 2 + 1], xj = flat[j * 2], yj = flat[j * 2 + 1];
    a += xj * yi - xi * yj;
  }
  return Math.abs(a / 2);
}
function ringPlausible(flat) {
  const n = flat.length / 2;
  if (n < 3) return false;
  let a = 0, per = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], yi = flat[i * 2 + 1], xj = flat[j * 2], yj = flat[j * 2 + 1];
    a += xj * yi - xi * yj;
    per += Math.hypot(xi - xj, yi - yj);
  }
  return Math.abs(a / 2) > per * 0.05;   // 平均宽度至少约 12 m
}

// ---------------- 命名表 ----------------
const names = ['']; const nameIdx = new Map();
function ni(s) {
  if (!s) return 0;
  const v = String(s).trim(); if (!v) return 0;
  let i = nameIdx.get(v); if (i == null) { i = names.length; names.push(v); nameIdx.set(v, i); }
  return i;
}

// ---------------- 载入 ----------------
const dir = path.join(root, '.tools', 'osm', name);
const files = (await readdir(dir)).filter(f => f.endsWith('.json') && !f.startsWith('_'));
const ways = new Map(), rels = new Map(), nodes = new Map();
for (const f of files) {
  const doc = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  for (const el of doc.elements || []) {
    if (el.type === 'way') ways.set(el.id, el);
    else if (el.type === 'relation') rels.set(el.id, el);
    else if (el.type === 'node') nodes.set(el.id, el);
  }
}
console.log(`载入 ${files.length} 个文件：${ways.size} way / ${rels.size} relation / ${nodes.size} node`);

const geomOf = (el) => (el.geometry || []).filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
const isClosed = (g) => g.length > 3 && Math.abs(g[0].lat - g[g.length - 1].lat) < 1e-7 && Math.abs(g[0].lon - g[g.length - 1].lon) < 1e-7;
const toFlat = (g) => { const a = new Float64Array(g.length * 2); for (let i = 0; i < g.length; i++) { a[i * 2] = px(g[i].lon); a[i * 2 + 1] = py(g[i].lat); } return Array.from(a); };

// 把越出地图较远的折线切成若干段（Overpass 会返回相交要素的完整几何）
const MARGIN = 2;
function runs(flat) {
  const out = []; let cur = null;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = flat[i], y = flat[i + 1];
    const ok = x > -MARGIN && x < W + MARGIN && y > -MARGIN && y < H + MARGIN;
    if (ok) { if (!cur) cur = []; cur.push(x, y); }
    else if (cur) { if (cur.length >= 4) out.push(cur); cur = null; }
  }
  if (cur && cur.length >= 4) out.push(cur);
  return out;
}

// ---------------- 分类 ----------------
const ROAD_CLS = {
  motorway: 4, trunk: 4, motorway_link: 4, trunk_link: 4,
  primary: 3, primary_link: 3,
  secondary: 2, tertiary: 2, secondary_link: 2, tertiary_link: 2,
  unclassified: 1, residential: 1, living_street: 1, service: 1, pedestrian: 1,
};
const water = [], roads = [], streets = [], rail = [], parks = [], reserves = [], woods = [], admin = [];
const roadSegs = [];   // 待合并的道路线段（同一街道被 OSM 切成很多短 way）
const railSegs = [];   // 待合并的铁路线段
const waysPts = { water: 0, roads: 0, streets: 0, rail: 0, green: 0, admin: 0 };

// 把端点相接、名称/等级/结构相同、且连接点不是路口的线段合并成长折线。
// 用「端点 → 线段」索引查找候选，避免在大城市数据上退化成 O(n²)。
function mergeSegments(items) {
  const groups = new Map();
  for (const it of items) { if (!groups.has(it.key)) groups.set(it.key, []); groups.get(it.key).push(it); }
  const out = [];
  const revPts = (p) => { const r = []; for (let k = p.length - 2; k >= 0; k -= 2) r.push(p[k], p[k + 1]); return r; };
  const ek = (x, y) => Math.round(x * 64) + ',' + Math.round(y * 64);
  const sKey = (p) => ek(p[0], p[1]);
  const eKey = (p) => ek(p[p.length - 2], p[p.length - 1]);
  for (const list of groups.values()) {
    const n = list.length;
    const used = new Uint8Array(n);
    const byEnd = new Map();
    for (let i = 0; i < n; i++) for (const k of [sKey(list[i].pts), eKey(list[i].pts)]) {
      if (!byEnd.has(k)) byEnd.set(k, []);
      byEnd.get(k).push(i);
    }
    const pick = (k) => {
      const cand = byEnd.get(k);
      if (!cand || cand.length > 2) return -1;   // 路口：不合并
      for (const i of cand) if (!used[i]) return i;
      return -1;
    };
    for (let s = 0; s < n; s++) {
      if (used[s]) continue;
      used[s] = 1;
      let cur = { key: list[s].key, meta: list[s].meta, pts: list[s].pts.slice() };
      let changed = true;
      while (changed) {
        changed = false;
        const sk = sKey(cur.pts), ekk = eKey(cur.pts);
        // 先在终点处找可接的线段，再到起点处（起点处需要反向接上）
        let i = pick(ekk);
        if (i >= 0) {
          const p = list[i].pts;
          cur.pts = eKey(p) === ekk ? cur.pts.concat(revPts(p).slice(2)) : cur.pts.concat(p.slice(2));
          used[i] = 1; changed = true; continue;
        }
        i = pick(sk);
        if (i >= 0) {
          const p = list[i].pts;
          cur.pts = sKey(p) === sk ? revPts(p).slice(0, -2).concat(cur.pts) : p.slice(0, -2).concat(cur.pts);
          used[i] = 1; changed = true; continue;
        }
      }
      out.push(cur);
    }
  }
  return out;
}

const isWaterArea = (t) => t.natural === 'water' || t.waterway === 'riverbank' || t.waterway === 'dock' || t.waterway === 'boatyard' || t.landuse === 'reservoir' || t.landuse === 'basin';
const isWaterLine = (t) => ['river', 'canal', 'stream', 'drain', 'tidal_channel'].includes(t.waterway);
const greenKind = (t) => {
  if (t.leisure === 'nature_reserve' || t.boundary === 'protected_area' || t.boundary === 'national_park') return 'reserve';
  if (t.natural === 'wood' || t.natural === 'scrub' || t.natural === 'heath' || t.landuse === 'forest') return 'wood';
  if (['park', 'garden', 'common', 'recreation_ground'].includes(t.leisure)) return 'park';
  if (['cemetery', 'village_green'].includes(t.landuse)) return 'park';
  return null;
};
const waterWidth = (t) => {
  const w = Number(t.width);
  if (Number.isFinite(w) && w > 0) return Math.max(0.06, Math.min(3, w / 2 / 250));
  // 大型水面已由多边形表示，河流中心线只用于补充窄河道，默认宽度取得较小（半宽约 50 m）
  return { river: 0.4, tidal_channel: 0.5, canal: 0.35, stream: 0.14, drain: 0.1 }[t.waterway] || 0.2;
};

// 多边形 → [nameIdx, 'o'+enc, …]；rings 为 [[outer?bool, flat], …]
function polyRow(tagName, rings) {
  const row = [ni(tagName)];
  for (const [outer, flat] of rings) {
    if (flat.length < 8) continue;
    let pts = rdp(flat, TOL_POLY);
    if (pts.length < 8) pts = flat;
    row.push((outer ? 'o' : 'i') + enc(pts));
  }
  return row.length > 1 ? row : null;
}

// 把 relation 的成员 line 拼成闭合环（坐标为扁平数组 [x0,y0,x1,y1,…]）
function assemble(lines) {
  const pool = lines.map(l => l.slice());
  const out = [];
  const nPts = (f) => f.length / 2;
  const pt = (f, i) => [f[i * 2], f[i * 2 + 1]];
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;   // 0.25 m
  const rev = (f) => { const r = []; for (let k = nPts(f) - 1; k >= 0; k--) r.push(f[k * 2], f[k * 2 + 1]); return r; };
  while (pool.length) {
    let cur = pool.shift();
    let changed = true, guard = 0;
    while (changed && guard++ < 100000) {
      changed = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        const aEnd = pt(cur, nPts(cur) - 1), aStart = pt(cur, 0);
        if (near(aEnd, pt(w, 0))) { cur = cur.concat(w.slice(2)); pool.splice(i, 1); changed = true; break; }
        if (near(aEnd, pt(w, nPts(w) - 1))) { const rw = rev(w); cur = cur.concat(rw.slice(2)); pool.splice(i, 1); changed = true; break; }
        if (near(aStart, pt(w, nPts(w) - 1))) { cur = w.slice(0, -2).concat(cur); pool.splice(i, 1); changed = true; break; }
        if (near(aStart, pt(w, 0))) { const rw = rev(w); cur = rw.slice(0, -2).concat(cur); pool.splice(i, 1); changed = true; break; }
      }
    }
    // 闭合环去掉重复的末点
    if (nPts(cur) > 1 && near(pt(cur, 0), pt(cur, nPts(cur) - 1))) cur = cur.slice(0, -2);
    out.push(cur);
  }
  return out;
}

// ---- way ----
for (const w of ways.values()) {
  const t = w.tags || {}, g = geomOf(w);
  if (g.length < 2) continue;
  const closed = isClosed(g);
  if (closed && isWaterArea(t)) {
    const flat = toFlat(g);
    const row = polyRow(t.name, [[true, flat]]);
    if (row) { water.push(row); waysPts.water += flat.length / 2; }
    continue;
  }
  if (isWaterLine(t) && !closed) {
    // 地下河、涵洞（如伦敦的 River Fleet）在地表看不到，不写入水面
    if ((t.tunnel && t.tunnel !== 'no') || (t.culvert && t.culvert !== 'no') || t.waterway === 'drain') continue;
    for (const r of runs(toFlat(g))) {
      const pts = rdp(r, TOL_LINE);
      if (pts.length >= 4) { water.push([ni(t.name), +waterWidth(t).toFixed(3), enc(pts)]); waysPts.water += pts.length / 2; }
    }
    continue;
  }
  if (closed && greenKind(t)) {
    const kind = greenKind(t), flat = toFlat(g);
    if (MIN_GREEN_CELLS > 0 && !t.name && Math.abs(ringArea(flat)) < MIN_GREEN_CELLS) continue;
    const row = polyRow(t.name, [[true, flat]]);
    if (row) { (kind === 'park' ? parks : kind === 'wood' ? woods : reserves).push(row); waysPts.green += flat.length / 2; }
    continue;
  }
  if (ROAD_CLS[t.highway] != null) {
    const cls = ROAD_CLS[t.highway];
    // service（停车场通道、后巷、内部道路）不进汽车路网，但保留为街道用于建筑避让
    const isService = t.highway === 'service';
    const isStreet = isService || cls <= 2;
    let flags = 0;
    if (t.bridge && t.bridge !== 'no') flags |= 1;
    if ((t.tunnel && t.tunnel !== 'no') || t.covered === 'yes') flags |= 2;
    if (/_link$/.test(t.highway)) flags |= 4;
    for (const r of runs(toFlat(g))) {
      const pts = rdp(r, TOL_LINE);
      if (pts.length < 4) continue;
      // 先收集线段，循环结束后按（名称|等级|结构）合并成长折线，减少 way 数量与文件体积
      roadSegs.push({ key: (t.name || '') + '|' + cls + '|' + flags + '|' + (isStreet ? 1 : 0), meta: { name: t.name, cls, flags, street: isStreet, service: isService }, pts: pts });
      waysPts.roads += pts.length / 2;
    }
    continue;
  }
  if (['rail', 'light_rail', 'subway', 'narrow_gauge', 'monorail', 'tram'].includes(t.railway)) {
    let flags = 0;
    if (t.bridge && t.bridge !== 'no' || t.embankment) flags |= 1;
    if (t.tunnel && t.tunnel !== 'no') flags |= 2;
    const hs = /high speed|channel tunnel rail|^hs1$/i.test((t.name || '') + ' ' + (t.ref || ''));
    if (hs) flags |= 16;
    for (const r of runs(toFlat(g))) {
      const pts = rdp(r, TOL_LINE);
      if (pts.length >= 4) { railSegs.push({ key: (t.name || '') + '|' + flags + '|' + (hs ? 1 : 0), meta: { name: t.name, flags, hs }, pts: pts }); waysPts.rail += pts.length / 2; }
    }
  }
}

// ---- 合并道路与铁路线段，写入 roads / rail ----
// streets（建筑避让用的街道中心线）在伦敦这类 OSM 数据上会与 roads 重复近一倍体积；
// roads 本身已参与建筑避让（city.js applyRoads 对所有已建道路描边），因此这里输出空 streets。
let mergedCount = 0;
for (const m of mergeSegments(roadSegs)) {
  mergedCount++;
  const meta = m.meta;
  if (!meta.service) roads.push([ni(meta.name), meta.cls, meta.flags, enc(m.pts)]);
}
let mergedRail = 0;
for (const m of mergeSegments(railSegs)) {
  mergedRail++;
  rail.push([ni(m.meta.name), m.meta.flags, enc(m.pts), m.meta.hs ? 2003 : 0]);
}
if (process.argv.includes('--debug')) console.log(`  道路线段 ${roadSegs.length} → ${mergedCount} 条；铁路线段 ${railSegs.length} → ${mergedRail} 条`);

// ---- relation（多面要素与行政边界）----
for (const rel of rels.values()) {
  const t = rel.tags || {}, members = (rel.members || []).filter(m => m.type === 'way' && m.geometry);
  if (!members.length) continue;
  const ringOf = (role) => assemble(members.filter(m => (m.role || 'outer') === role).map(m => toFlat(m.geometry)).filter(f => f.length >= 4));
  if ((isWaterArea(t) && !NO_REL_WATER) || greenKind(t)) {
    const rings = [];
    let dropped = 0;
    for (const r of ringOf('outer')) {
      const flat = r.concat([r[0], r[1]]);
      if (ringPlausible(flat)) rings.push([true, flat]); else dropped++;
    }
    for (const r of ringOf('inner')) {
      const flat = r.concat([r[0], r[1]]);
      if (ringPlausible(flat)) rings.push([false, flat]); else dropped++;
    }
    if (dropped && process.argv.includes('--debug')) console.log(`  丢弃退化环 ${dropped} 个（${t.name || '无名'} ${rel.id}）`);
    if (rings.length) {
      // 无名的小块绿地不写入（面积按外环计）
      if (!isWaterArea(t) && MIN_GREEN_CELLS > 0 && !t.name) {
        const area = rings.filter(r => r[0]).reduce((s, r) => s + ringArea(r[1]), 0);
        if (area < MIN_GREEN_CELLS) continue;
      }
      const row = polyRow(t.name, rings);
      if (row) {
        if (isWaterArea(t)) { water.push(row); waysPts.water += 1; }
        else { const k = greenKind(t); (k === 'park' ? parks : k === 'wood' ? woods : reserves).push(row); waysPts.green += 1; }
      }
    }
    continue;
  }
  if (t.boundary === 'administrative') {
    const al = Number(t.admin_level);
    if (!(al >= 6 && al <= 8)) continue;
    // 本游戏的区级 = admin_level 6/7，街道级 = 8。英国 borough 多为 8，改写为 6，用 data 的 district 绑定。
    const outLevel = al === 8 ? 6 : 7;
    for (const r of ringOf('outer')) {
      const flat = r.concat([r[0], r[1]]);
      const pts = rdp(flat, TOL_ADMIN);
      if (pts.length >= 8) { admin.push([outLevel, ni(t.name), 'o' + enc(pts)]); waysPts.admin += pts.length / 2; }
    }
  }
}

// ---- node（地名与车站）----
const places = [];
for (const n of nodes.values()) {
  const t = n.tags || {};
  const x = +px(n.lon).toFixed(2), y = +py(n.lat).toFixed(2);
  if (x < 0 || y < 0 || x > W || y > H) continue;
  const station = t.railway === 'station' || t.public_transport === 'station';
  if (station && t.name) {
    const metro = t.station === 'subway' || t.subway === 'yes' || (t.railway === 'station' && /underground|dlr/i.test(t.network || ''));
    places.push([t.name, x, y, metro ? 0 : 1]);
  } else if (['city', 'town', 'suburb', 'quarter', 'neighbourhood', 'village'].includes(t.place) && t.name) {
    places.push([t.name, x, y, t.place === 'neighbourhood' ? 3 : 2]);
  }
}

// 去重（同名同位置、同名车站）
const seenPlace = new Set(), placesOut = [];
for (const p of places) {
  const key = p[0] + '|' + p[3];
  if (seenPlace.has(key)) continue;
  seenPlace.add(key); placesOut.push(p);
}
placesOut.sort((a, b) => a[3] - b[3] || a[0].localeCompare(b[0]));

// ---------------- 自检 ----------------
function inPoly(x, y, flat) {
  let inside = false;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = flat[i * 2], yi = flat[i * 2 + 1], xj = flat[j * 2], yj = flat[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const waterPolys = water.filter(r => typeof r[1] !== 'number');
// 诊断：--debug 打印最大的若干水面多边形与探针结果
if (process.argv.includes('--debug')) {
  const probe = [[51.5007, -0.1246], [51.4875, -0.0180], [51.5080, -0.1281], [51.5050, -0.0230]];
  const big = waterPolys.map((r, k) => [r.reduce((s, v) => s + (typeof v === 'string' ? v.length : 0), 0), k])
    .sort((a, b) => b[0] - a[0]).slice(0, 6);
  for (const [sz, k] of big) {
    const row = waterPolys[k];
    const rings = row.length - 1;
    const hits = probe.map(p => waterAt(p[1], p[0]) ? 1 : 0).join('');
    const first = decLocal(row[1].slice(1));
    let bb = [1e9, 1e9, -1e9, -1e9];
    for (let q = 0; q < first.length; q += 2) { bb[0] = Math.min(bb[0], first[q]); bb[1] = Math.min(bb[1], first[q + 1]); bb[2] = Math.max(bb[2], first[q]); bb[3] = Math.max(bb[3], first[q + 1]); }
    console.log(`  水面 ${k}：名「${row[0] ? names[row[0]] : '无名'}」环 ${rings} 字节 ${sz} 探针 ${hits} 首环点数 ${first.length / 2} 首点 (${first[0]},${first[1]}) 首环bbox ${bb.map(v => v.toFixed(1)).join(',')}`);
  }
}
function waterAt(lon, lat) { return waterAtXY(px(lon), py(lat)); }
function waterAtXY(x, y) {
  for (const row of waterPolys) {
    let ringsHit = 0;
    for (let k = 1; k < row.length; k++) {
      const s = row[k], flat = s.slice(1);
      // 解码仅供自检
      const pts = decLocal(flat);
      if (inPoly(x, y, pts)) ringsHit++;
    }
    if (ringsHit % 2 === 1) return row[0] ? names[row[0]] : '（无名水面）';
  }
  // 河流中心线：与线段距离小于半宽即为水面（与 city.js 的水域掩膜一致）
  for (const row of water) {
    if (typeof row[1] !== 'number') continue;
    const pts = decLocal(row[2]), hw = Math.max(row[1] / 2, 0.025);
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const ax = pts[k], ay = pts[k + 1], bx = pts[k + 2], by = pts[k + 3];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L > 0 ? ((x - ax) * dx + (y - ay) * dy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x, qy = ay + dy * t - y;
      if (qx * qx + qy * qy <= hw * hw) return row[0] ? names[row[0]] : '（无名河流）';
    }
  }
  return null;
}
function decLocal(s) {
  const out = []; let i = 0, x = 0, y = 0;
  while (i < s.length) {
    let r = 0, sh = 0, b;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    x += (r & 1) ? ~(r >> 1) : (r >> 1);
    r = 0; sh = 0;
    do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
    y += (r & 1) ? ~(r >> 1) : (r >> 1);
    out.push(x / 64, y / 64);
  }
  return out;
}

// 自检：河岸上的单点不能作为判据（河流中心线与岸线本来就相差半个河宽），
// 改用泰晤士河中心线顶点的覆盖率，并确认几个陆地地标没有被水面覆盖。
const riverPts = [];
for (const w of ways.values()) {
  const t = w.tags || {};
  if (t.waterway === 'river' && /thames/i.test(t.name || '')) for (const p of w.geometry || []) riverPts.push([px(p.lon), py(p.lat)]);
}
const riverHit = riverPts.length ? riverPts.filter(p => waterAtXY(p[0], p[1])).length / riverPts.length : 0;
const landProbes = [
  ['特拉法加广场', 51.5080, -0.1281], ['金丝雀码头', 51.5050, -0.0196], ['海德公园', 51.5073, -0.1657], ['格林尼治天文台', 51.4769, -0.0005], ['圣保罗大教堂', 51.5138, -0.0984],
];
const checkResults = [{ label: `泰晤士河中心线覆盖 ${(riverHit * 100).toFixed(0)}%（${riverPts.length} 点）`, water: null, ok: riverHit > 0.7 }]
  .concat(landProbes.map(function (p) { const got = waterAt(p[2], p[1]); return { label: p[0] + '（陆地）', water: got, ok: !got }; }));

// ---------------- 输出 ----------------
const out = [];
out.push("'use strict';");
out.push(`// 由 OpenStreetMap 数据生成（© OpenStreetMap 贡献者，ODbL）。坐标为游戏格（250 m），折线为增量编码，1/64 格精度。`);
out.push(`// 生成工具：scripts/fetch-osm.mjs + scripts/geo-import.mjs；地图网格 ${W}×${H}，原点上角（东经 ${lon0}°、北纬 ${lat0}°）。`);
out.push('(function (CM) {');
out.push(`  (CM.GEOS = CM.GEOS || {}).${name} = {`);
out.push(`    proj: { lon0: ${lon0}, lat0: ${lat0}, kx: ${kx}, ky: ${ky} },`);
const block = (key, arr, fmt) => {
  out.push(`    ${key}: [`);
  for (const row of arr) out.push('      ' + fmt(row) + ',');
  out.push('    ],');
};
block('water', water, (r) => '[' + r.map((v, i) => (i === 0 || typeof v === 'number') ? String(v) : JSON.stringify(v)).join(',') + ']');
block('roads', roads, (r) => `[${r[0]},${r[1]},${r[2]},${JSON.stringify(r[3])}]`);
out.push(`    streets: ${JSON.stringify(streets.join('!'))},`);
block('rail', rail, (r) => `[${r[0]},${r[1]},${JSON.stringify(r[2])},${r[3]}]`);
block('parks', parks, (r) => '[' + r.map((v, i) => (i === 0 || typeof v === 'number') ? String(v) : JSON.stringify(v)).join(',') + ']');
block('reserves', reserves, (r) => '[' + r.map((v, i) => (i === 0 || typeof v === 'number') ? String(v) : JSON.stringify(v)).join(',') + ']');
block('woods', woods, (r) => '[' + r.map((v, i) => (i === 0 || typeof v === 'number') ? String(v) : JSON.stringify(v)).join(',') + ']');
block('admin', admin, (r) => `[${r[0]},${r[1]},${JSON.stringify(r[2])}]`);
out.push('    places: [');
for (const p of placesOut) out.push(`      [${JSON.stringify(p[0])}, ${p[1]}, ${p[2]}, ${p[3]}],`);
out.push('    ],');
out.push('    names: ' + JSON.stringify(names) + ',');
out.push('  };');
out.push('})(window.CM);');
out.push('');

const target = path.join(root, 'js', `geo_${name}.js`);
const text = out.join('\n');
const kb = (Buffer.byteLength(text) / 1024).toFixed(1);
const bad = checkResults.filter(c => !c.ok);
if (!waterPolys.length) { console.error('错误：没有识别到任何水面的多边形，检查 Overpass 查询或分类。'); process.exit(1); }
if (!roads.length) { console.error('错误：没有识别到道路。'); process.exit(1); }
if (bad.length) { console.error('水面自检未通过：' + bad.map(b => b.label + '→' + (b.water || '陆地')).join('；')); process.exit(1); }
await writeFile(target, text);
await mkdir(path.join(root, '.tools', 'osm'), { recursive: true });
const report = {
  map: name, generatedAt: new Date().toISOString(), grid: { W, H, lon0, lat0, kx, ky },
  counts: { water: water.length, waterPolys: waterPolys.length, roads: roads.length, streets: streets.length, rail: rail.length, parks: parks.length, reserves: reserves.length, woods: woods.length, admin: admin.length, places: placesOut.length, names: names.length },
  vertices: waysPts, checkResults, bytes: Buffer.byteLength(text),
};
await writeFile(path.join(root, '.tools', 'osm', name, '_report.json'), JSON.stringify(report, null, 1));
console.log('自检：' + checkResults.map(c => `${c.label}${c.ok ? '✓' : '✗'}(${c.water || '陆地'})`).join('，'));
console.log(`写出 ${path.relative(root, target)}：${kb} KB / 水面多边形 ${waterPolys.length} / 道路 ${roads.length} / 铁路 ${rail.length} / 公园 ${parks.length} / 行政边界 ${admin.length} / 地名 ${placesOut.length}`);
