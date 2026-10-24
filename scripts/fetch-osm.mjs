// 下载 OpenStreetMap 数据（Overpass API）供 geo-import.mjs 转换为游戏底图。
// 用法：node scripts/fetch-osm.mjs --name ld --west -0.31645 --south 51.39220 --east 0.11645 --north 51.60780 --tiles 2
// 输出：.tools/osm/<name>/<类别>-<瓦片>.json（.tools/ 已在 .gitignore 中）
// 说明：本脚本只负责取数；投影、分类与压缩编码见 scripts/geo-import.mjs。数据 © OpenStreetMap 贡献者，ODbL。

import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 只保留会返回真实数据的镜像：overpass.osm.ch 的数据库异常，查询会返回 0 要素而不报错
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// 六个类别分开取，避免单个查询过大被服务端中断
const CATEGORIES = {
  water: `(
    way["natural"="water"];
    relation["natural"="water"];
    way["waterway"~"^(riverbank|dock|boatyard)$"];
    relation["waterway"~"^(riverbank|dock|boatyard)$"];
    way["landuse"~"^(reservoir|basin)$"];
    relation["landuse"~"^(reservoir|basin)$"];
    way["waterway"~"^(river|canal|stream|drain|tidal_channel|ditch)$"];
  );`,
  green: `(
    way["leisure"~"^(park|garden|nature_reserve|common|recreation_ground|pitch|golf_course)$"];
    relation["leisure"~"^(park|garden|nature_reserve|common|recreation_ground|pitch|golf_course)$"];
    way["landuse"~"^(forest|meadow|grass|cemetery|village_green)$"];
    relation["landuse"~"^(forest|meadow|grass|cemetery|village_green)$"];
    way["natural"~"^(wood|scrub|heath)$"];
    relation["natural"~"^(wood|scrub|heath)$"];
    way["boundary"="protected_area"];
    relation["boundary"="protected_area"];
    way["boundary"="national_park"];
    relation["boundary"="national_park"];
  );`,
  roads: `(
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  );`,
  rail: `(
    way["railway"~"^(rail|light_rail|subway|narrow_gauge|monorail|tram)$"];
  );`,
  admin: `(
    relation["boundary"="administrative"]["admin_level"~"^(5|6|7|8)$"];
    way["boundary"="administrative"]["admin_level"~"^(5|6|7|8)$"];
  );`,
  places: `(
    node["place"~"^(city|town|suburb|quarter|neighbourhood|village)$"];
    node["railway"="station"];
    node["station"="subway"];
    node["public_transport"="station"]["subway"="yes"];
  );`,
};

const AA = ['water', 'green', 'roads', 'rail', 'admin', 'places'];

function usage() {
  console.error('用法：node scripts/fetch-osm.mjs --name <地图id> --west <lon> --south <lat> --east <lon> --north <lat> [--tiles 2] [--only water,roads]');
  process.exit(2);
}
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const name = arg('name') || 'ld';
const west = Number(arg('west', '-0.31645'));
const south = Number(arg('south', '51.39220'));
const east = Number(arg('east', '0.11645'));
const north = Number(arg('north', '51.60780'));
const tiles = Math.max(1, Math.min(4, Number(arg('tiles', '2')) | 0));
const only = (arg('only', '') || '').split(',').filter(Boolean);
if ([west, south, east, north].some(v => !Number.isFinite(v)) || west >= east || south >= north) usage();

const outDir = path.join(root, '.tools', 'osm', name);
await mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 一个小瓦片边界；瓦片之间取并集，重复要素由转换器按 id 去重
function bboxOf(tx, tz) {
  const dx = (east - west) / tiles, dy = (north - south) / tiles;
  return { w: west + tx * dx, e: west + (tx + 1) * dx, s: south + tz * dy, n: south + (tz + 1) * dy };
}

function query(body, bb) {
  return `[out:json][timeout:300][bbox:${bb.s.toFixed(5)},${bb.w.toFixed(5)},${bb.n.toFixed(5)},${bb.e.toFixed(5)}];` + body + '\n out geom;';
}

async function fetchQuery(q, label) {
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'city-and-metro-map-import/1.0 (map data preparation)' },
        body: 'data=' + encodeURIComponent(q),
      });
      const text = await res.text();
      if (!res.ok) { lastErr = new Error(`${url.split('/')[2]} HTTP ${res.status} ${text.slice(0, 120).replace(/\s+/g, ' ')}`); }
      else {
        const parsed = JSON.parse(text);
        // 空结果与异常时间戳都算失败：镜像数据库异常时会返回 0 要素而不报错
        const stamp = String((parsed.osm3s || {}).timestamp_osm_base || '');
        if (!parsed.elements || !parsed.elements.length) lastErr = new Error(`${url.split('/')[2]} 返回 0 要素（镜像数据可能不完整）`);
        else if (!/^20\d\d-/.test(stamp)) lastErr = new Error(`${url.split('/')[2]} 数据时间戳异常：${stamp}`);
        else return { elements: parsed.elements, server: url.split('/')[2], bytes: text.length, stamp };
      }
    } catch (e) { lastErr = e; }
    const wait = Math.min(90000, 6000 * Math.pow(1.7, attempt));
    console.error(`  ${label} 第 ${attempt + 1} 次失败：${lastErr && lastErr.message}；${Math.round(wait / 1000)}s 后重试`);
    await sleep(wait);
  }
  throw new Error(`${label} 下载失败：${lastErr && lastErr.message}`);
}

const cats = only.length ? AA.filter(a => only.includes(a)) : AA;
let totalBytes = 0;
for (let tz = 0; tz < tiles; tz++) {
  for (let tx = 0; tx < tiles; tx++) {
    const bb = bboxOf(tx, tz), tile = tz * tiles + tx;
    for (const cat of cats) {
      const file = path.join(outDir, `${cat}-${tile}.json`);
      let exists = false;
      try { const st = await stat(file); exists = st.size > 2000; } catch (e) { /* 未下载 */ }
      if (exists) { console.log(`跳过 ${cat}-${tile}（已存在）`); continue; }
      const label = `${cat}-${tile}`;
      const t0 = Date.now();
      const r = await fetchQuery(query(CATEGORIES[cat], bb), label);
      await writeFile(file, JSON.stringify(r));
      // 记录来源与时间，供地图说明引用（服务器、查询范围、获取时间）
      const metaFile = path.join(outDir, '_meta.json');
      let meta = {};
      try { meta = JSON.parse(await readFile(metaFile, 'utf8')); } catch (e) { /* 首次写入 */ }
      meta[label] = { server: r.server, fetchedAt: new Date().toISOString(), bbox: bb, elements: r.elements.length, bytes: r.bytes };
      await writeFile(metaFile, JSON.stringify(meta, null, 1));
      totalBytes += r.bytes;
      console.log(`${label}: ${r.elements.length} 要素 / ${(r.bytes / 1e6).toFixed(2)} MB / ${((Date.now() - t0) / 1000).toFixed(1)}s（${r.server}）`);
      await sleep(2500);
    }
  }
}
console.log(`完成：${outDir}，共 ${(totalBytes / 1e6).toFixed(2)} MB`);
