// Rebuild the bundled Beijing geography from public OSM data. No runtime requests.
// Usage: node scripts/build-beijing-geo.mjs [--download]
// Cached source responses live under ignored .tools/beijing-osm/.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, '.tools/beijing-osm');
const proj = { lon0: 116.12, lat0: 40.13, kx: 341.6, ky: 444.1 };
const W = 192, H = 164;
const bbox = [proj.lat0 - H / proj.ky, proj.lon0, proj.lat0, proj.lon0 + W / proj.kx];
const groups = {
  roads: 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary)(_link)?$"];way["highway"~"^(residential|unclassified|living_street)$"];',
  terrain: 'nwr["natural"="water"];way["waterway"~"^(river|canal|stream)$"];nwr["leisure"~"^(park|nature_reserve)$"];nwr["natural"="wood"];nwr["landuse"="forest"];',
  rail: 'way["railway"="rail"]["service"!~"^(siding|spur|yard)$"];node["railway"="station"];node["place"~"^(suburb|quarter|neighbourhood|town)$"];'
};
if (process.argv.slice(2).some(x => x !== '--download')) throw new Error('Usage: node scripts/build-beijing-geo.mjs [--download]');
await mkdir(cache, { recursive: true });
const documents = [];
for (const [group, selectors] of Object.entries(groups)) {
  const query = `[out:json][timeout:${group === 'roads' ? 180 : 90}][bbox:${bbox.join(',')}];(${selectors});out geom;`;
  const file = path.join(cache, group + '.json');
  const cached = await access(file).then(() => true, () => false);
  if (process.argv.includes('--download') && !cached) {
    let error;
    for (const endpoint of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
      try {
        console.log('Downloading', group, 'from', endpoint);
        const response = await fetch(endpoint + '?data=' + encodeURIComponent(query), { headers: { 'User-Agent': 'city-and-metro-map-builder/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(group === 'roads' ? 210000 : 120000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const raw = await response.text(), doc = JSON.parse(raw);
        if (doc.remark || !doc.elements?.length) throw new Error(doc.remark || 'Empty OSM response');
        await writeFile(file, raw);
        error = null; break;
      } catch (e) { error = e; console.warn(group, e.message); }
    }
    if (error) throw error;
  }
  const raw = await readFile(file, 'utf8');
  const doc = JSON.parse(raw);
  if (doc.remark || !doc.elements?.length) throw new Error('Incomplete cached response: ' + group);
  documents.push({ group, query, sha256: createHash('sha256').update(raw).digest('hex'), timestamp: doc.osm3s?.timestamp_osm_base, elements: doc.elements });
}

const names = [''], nameIndex = new Map([['', 0]]);
function nameId(tags = {}) {
  const name = tags['name:zh-Hans'] || tags['name:zh'] || tags.name || '';
  if (!nameIndex.has(name)) { nameIndex.set(name, names.length); names.push(name); }
  return nameIndex.get(name);
}
const project = p => [(p.lon - proj.lon0) * proj.kx, (proj.lat0 - p.lat) * proj.ky];
function encode(points) {
  let out = '', px = 0, py = 0;
  const put = value => { let v = value < 0 ? ~(value << 1) : value << 1; while (v >= 32) { out += String.fromCharCode((32 | (v & 31)) + 63); v >>>= 5; } out += String.fromCharCode(v + 63); };
  for (const p of points) { const xy = project(p), x = Math.round(xy[0] * 64), y = Math.round(xy[1] * 64); put(x - px); put(y - py); px = x; py = y; }
  return out;
}
const valid = points => points?.length >= 2 && points.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
// Join relation members by endpoint, preserving inner rings (islands).
function rings(element) {
  if (element.type === 'way') return valid(element.geometry) && same(element.geometry[0], element.geometry.at(-1)) ? ['o' + encode(element.geometry)] : [];
  const result = [];
  for (const role of ['outer', 'inner']) {
    const pending = (element.members || []).filter(m => (m.role || 'outer') === role && valid(m.geometry)).map(m => m.geometry.slice());
    while (pending.length) {
      const chain = pending.pop();
      while (!same(chain[0], chain.at(-1))) {
        const i = pending.findIndex(p => same(chain.at(-1), p[0]) || same(chain.at(-1), p.at(-1)));
        if (i < 0) break;
        const next = pending.splice(i, 1)[0];
        if (!same(chain.at(-1), next[0])) next.reverse();
        chain.push(...next.slice(1));
      }
      if (chain.length >= 4 && same(chain[0], chain.at(-1))) result.push(role[0] + encode(chain));
    }
  }
  return result;
}
const G = { proj, names, water: [], roads: [], streets: '', rail: [], parks: [], reserves: [], woods: [], admin: [], places: [] };
const streets = [], placeKeys = new Set();
const flags = t => (t.bridge && t.bridge !== 'no' ? 1 : 0) | (t.tunnel && t.tunnel !== 'no' ? 2 : 0);
for (const doc of documents) {
  // Tagged member ways must not fill a relation's holes again.
  const members = new Set(doc.elements.filter(e => e.type === 'relation' && rings(e).some(r => r[0] === 'o')).flatMap(e => (e.members || []).filter(m => m.type === 'way').map(m => m.ref)));
  for (const e of doc.elements) {
    const t = e.tags || {}, id = nameId(t);
    if (doc.group === 'roads' && valid(e.geometry)) {
      // The engine's drawable/driveable road classes are 2 (collector), 3 and 4.
      const cls = /^(motorway|trunk)/.test(t.highway) ? 4 : t.highway?.startsWith('primary') ? 3 : /^(secondary|tertiary)/.test(t.highway) ? 2 : 0;
      if (cls) G.roads.push([id, cls, flags(t) | (t.highway.endsWith('_link') ? 4 : 0), encode(e.geometry)]);
      else streets.push(encode(e.geometry));
    } else if (doc.group === 'terrain') {
      if (e.type === 'way' && t.waterway && valid(e.geometry)) {
        const width = Math.min(150, Math.max(4, parseFloat(t.width) || (t.waterway === 'river' ? 25 : t.waterway === 'canal' ? 12 : 4)));
        G.water.push([id, width / 250, encode(e.geometry)]);
      }
      if (e.type === 'way' && members.has(e.id)) continue;
      const r = rings(e); if (!r.some(s => s[0] === 'o')) continue;
      const key = t.natural === 'water' ? 'water' : t.leisure === 'park' ? 'parks' : t.leisure === 'nature_reserve' ? 'reserves' : 'woods';
      G[key].push([id, ...r]);
    } else if (doc.group === 'rail') {
      if (e.type === 'way' && valid(e.geometry)) G.rail.push([id, flags(t) | (t.highspeed === 'yes' ? 16 : 0), encode(e.geometry)]);
      if (e.type === 'node' && names[id]) {
        const [x, y] = project(e), key = names[id];
        if (x < 0 || y < 0 || x >= W || y >= H || placeKeys.has(key)) continue;
        placeKeys.add(key); G.places.push([key, +x.toFixed(2), +y.toFixed(2), t.station === 'subway' ? 0 : t.railway === 'station' ? 1 : 2]);
      }
    }
  }
}
G.streets = streets.join('!');
G.source = { copyright: '© OpenStreetMap contributors', license: 'ODbL-1.0', bounds: bbox, extracts: documents.map(({ group, query, sha256, timestamp }) => ({ group, query, sha256, timestamp })) };
if (G.roads.length < 100 || G.water.length < 10 || G.parks.length < 10 || G.rail.length < 10) throw new Error('Incomplete Beijing geography');
await writeFile(path.join(root, 'js/geo_bj.js'), "'use strict';\n// Beijing: OpenStreetMap contributors, ODbL 1.0. Generated by scripts/build-beijing-geo.mjs.\n(function(CM){(CM.GEOS=CM.GEOS||{}).bj=" + JSON.stringify(G) + ';})(window.CM);\n');
console.log(JSON.stringify({ roads: G.roads.length, streets: streets.length, water: G.water.length, parks: G.parks.length, rail: G.rail.length, places: G.places.length }));
