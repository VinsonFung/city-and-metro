import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const scope = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout };
scope.window = scope;
vm.createContext(scope);
const load = async file => vm.runInContext(await readFile(new URL(file, root), 'utf8'), scope, { filename: file });
for (const [, file] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  if (/^js\/(?:util|config|accessibility|geo(?:_\w+|-index)?|data_\w+|terminals|traits|maps|facility|eras|city|metro|sim|bgnet|economy|taskplans|milestones|render|bgtransit)\.js$/.test(file)) await load(file);
}
const C = scope.CM, T = C.Tasks;
assert.ok(C.CFG.RULES_REVISION >= 17);

C.useMap('tutorial');
C.DATA.noDynTasks = false;
const clock = { y: 2004, m: 2, d: 1 };
const g = {
  clock, city: {}, ym: () => C.U.ymIndex(clock.y, clock.m), net: { segments: {}, lines: {} },
  econ: new C.Economy('challenge', 2004),
  compiled: { segs: [{ g: { lenM: 18000 } }], stations: [] },
  model: { trafficReady: () => true },
};
const length = g.compiled.segs[0].g;
C.DATA.events = []; C.DATA.histTasks = [];
const bill = { fare: 45, ops: 100 };
g.econ.ledger.push(bill);
const tasks = new T();
tasks.nextOffer = g.ym();
length.lenM = 15000;
assert.ok(!tasks.offerCands(g).some(t => t.type === 'fiscal'));
length.lenM = 18000;
bill.fare = 60;
assert.ok(!tasks.offerCands(g).some(t => t.type === 'fiscal'));
bill.fare = 45;
g.econ.mode = 'free';
assert.ok(!tasks.offerCands(g).some(t => t.type === 'fiscal'));
g.econ.mode = 'challenge';
const [offer] = tasks.offerMonthly(g);
assert.equal(offer.task.title, '不扩张也能减亏');
assert.equal(offer.task.reward, 3 * g.econ.grantQuota(clock.y, clock.m));
const active = tasks.accept(g, offer.task.id);
assert.equal(active.target, 0.6);
assert.equal(active.kmCap, 18.9);
assert.equal(active.sustain, 3);
assert.equal(active.months, 30);
assert.ok(!tasks.offerCands(g).some(t => t.type === 'fiscal'));
const restoredTasks = T.restore(JSON.parse(JSON.stringify(tasks.serialize())));
const carried = restoredTasks.active[0];
bill.fare = 60;
length.lenM = 19100;
assert.equal(restoredTasks.evaluate(carried, g).ok, false);
length.lenM = 18800;
assert.equal(restoredTasks.evaluate(carried, g).ok, true);
const funds = g.econ.funds;
for (let m = 3; m <= 5; m++) {
  clock.m = m;
  const result = restoredTasks.monthly(g);
  assert.equal(result.some(event => event.type === 'done' && event.task.id === carried.id), m === 5);
}
assert.ok(Math.abs(g.econ.funds - funds - carried.reward) < 1e-8);
assert.ok(!restoredTasks.monthly(g).some(event => event.type === 'done'));
const decline = new T();
decline.nextOffer = g.ym();
bill.fare = 45;
decline.decline(g, decline.offerMonthly(g)[0].task.id);
assert.ok(!decline.offerCands(g).some(t => t.type === 'fiscal'));
console.log('PASS fiscal eligibility, publication, acceptance, three-month settlement and decline cooldown');

const renderer = Object.create(C.Renderer.prototype);
const way = (g, ...p) => ({ g, p, bbox: C.Geo.bbox(p) });
const long = way(0, 0, 1, 3, 1), bridge = way(1, 0, 1, 3, 1), tunnel = way(2, 0, 1, 3, 1);
const inlet = way(0, 0, 0, 3, 0);
const coast = {
  FS: 4, FW: 24, FH: 16, terrainYear: 2000, terrainVer: 1, wsdf: true, roadReclaimMask: null,
  waterDistAt: (x, y) => (y ? x > 1 && x < 2 : x > 1.4 && x < 1.5) ? -0.3 : 0.3,
  roadGroups: [{ flags: 0 }, { flags: 1 }, { flags: 2 }],
};
const parts = renderer.roadParts(coast, long);
assert.equal(parts.length, 2);
assert.ok(parts[0].bbox[2] <= 1.051 && parts[1].bbox[0] >= 1.949);
assert.equal(renderer.roadParts(coast, bridge)[0], bridge);
assert.equal(renderer.roadParts(coast, tunnel)[0], tunnel);
assert.equal(renderer.roadParts(coast, inlet)[0], inlet);
const priorReclaim = C.DATA.reclaim;
C.DATA.reclaim = [{ year: 2002 }];
coast.roadReclaimMask = new Uint16Array(coast.FW * coast.FH).fill(60001);
coast.waterDistAt = x => x > 1 && x < 2 ? -0.08 : 0.3;
coast.terrainVer++;
assert.equal(renderer.roadParts(coast, long).length, 2);
coast.terrainYear = 2002;
coast.terrainVer++;
assert.equal(renderer.roadParts(coast, long)[0], long);
C.DATA.reclaim = priorReclaim;
coast.roadReclaimMask = null;
coast.waterDistAt = () => 0.3;
coast.terrainVer++;
coast.roadVersion = 1;
coast.roadGroups = Array.from({ length: 5 }, () => ({ flags: 0 }));
coast.roadWays = [way(0, 0, 1, 1, 1), way(1, 1.5, 1, 2, 1), way(2, 1, 1, 1.5, 1), way(3, 2, 1, 3, 1), way(4, 0, 1, 2, 1)];
coast.roadsBuilt = Uint8Array.of(1, 1, 0, 0, 0);
assert.deepEqual(Array.from(renderer.roadGaps(coast)), [2]);
assert.deepEqual(Array.from(coast.roadsBuilt), [1, 1, 0, 0, 0]);
coast.roadsBuilt[1] = 0;
coast.roadVersion++;
assert.equal(renderer.roadGaps(coast).size, 0);
console.log('PASS reclaimed shore, permanent water, short inlets, structures and display-only road gaps');

C.useMap('hk');
const city = new C.City();
for (const _ of city.generateGen(778291, 1970, { deferGraphs: true })) { /* keep the real geography */ }
const realParts = city.roadWays.filter(w => city.roadsBuilt[w.g] && renderer.roadParts(city, w)[0] !== w);
assert.ok(realParts.length > 0);
const history = { city, clock: { y: 1970 }, net: { segments: {} }, year() { return this.clock.y; }, visualRate: () => 3 };
const piers = C.BgNet.piers(history.year(), city);
for (const name of ['中环码头', '湾仔码头', '尖沙咀码头']) {
  const p = piers.find(x => x.name === name);
  assert.ok(p, name);
  assert.equal(city.waterAt(p.x, p.y), 0, name);
}
const centralPier = piers.find(p => p.name === '中环码头');
const original = C.BgNet.piers(1970).find(p => p.name === centralPier.name);
assert.ok(city.waterAt(original.x, original.y), 'the current pier coordinate is underwater in 1970');
const station = { x: centralPier.x - 1.5, y: centralPier.y };
assert.ok(C.Metro.checkSite(city, station.x, station.y, 'underground').ok);
assert.ok(C.U.dist(station.x, station.y, original.x, original.y) * C.CFG.CELL_M > C.BgNet.LINK_M);
const network = { stations: [station], serviced: [true] };
const links = C.BgNet.links(1970, network, city);
const link = links.list[0];
assert.equal(link.stop.name, centralPier.name);
assert.equal(link.m, 375);
assert.equal(link.stop.x, centralPier.x);
assert.equal(link.stop.y, centralPier.y);
assert.ok(link.b > 0);
assert.equal(C.BgNet.links(1970, { ...network, serviced: [false] }, city).list.length, 0);
const stats = {
  ...history,
  year: () => 1970 + 1 / 12,
  model: { net: { C: network, acc: { bgLinks: links } }, stDaily: { inn: [1000] } },
};
assert.equal(C.BgNet.linkStats(stats, 'ferry').linked, 1);
assert.ok(C.BgNet.linkStats(stats, 'ferry').gain > 0);
const BG = C.BgTransit;
BG.sync(history);
assert.ok(BG.ferries.length > 1);
for (const { r } of BG.ferries) for (const p of [r.pts[0], r.pts.at(-1)]) assert.ok(city.waterAt(...p));
const berthAt = (route, end) => end ? route.r.pts.at(-1) : route.r.pts[0];
const shared = BG.ferries.flatMap((a, i) => BG.ferries.flatMap((b, j) => i >= j ? [] :
  [false, true].flatMap(endA => [false, true].map(endB => ({ i, j, endA, endB,
    gap: C.U.dist(...berthAt(a, endA), ...berthAt(b, endB)) }))))).find(pair => pair.gap < 0.45);
assert.ok(shared, "the Star Ferry routes share a pier");
const fleet = BG.boats;
const docked = { ...fleet.find(b => b.ri === shared.i), dir: shared.endA ? -1 : 1, wait: 90,
  s: shared.endA ? BG.ferries[shared.i].r.total : 0 };
const arriving = { ...fleet.find(b => b.ri === shared.j), dir: shared.endB ? 1 : -1, wait: 0,
  s: shared.endB ? BG.ferries[shared.j].r.total - 0.4 : 0.4 };
BG.boats = [docked, arriving];
const waitingAt = arriving.s;
BG.update(0.05, history);
assert.equal(arriving.s, waitingAt);
assert.ok(docked.wait < 90);
BG.boats = fleet;
const moored = new Set();
for (let tick = 0; tick < 1200; tick++) {
  BG.update(0.05, history);
  for (const b of BG.boats) if (b.wait > 0) moored.add(b.name + '|' + b.k + '|' + b.dir);
}
assert.equal(moored.size, BG.boats.length * 2, 'each boat eventually serves both berths');
const before = BG.ferries;
const beforeReclaim = C.BgNet.stops(2000, city);
assert.ok(city.applyReclaim(2000).length > 0);
history.clock.y = 2000;
BG.sync(history);
assert.notEqual(BG.ferries, before);
console.log('PASS Hong Kong visual road clipping, historical piers, ferry departures and return trips');

const contemporary = new C.City();
for (const _ of contemporary.generateGen(778291, 2000, { deferGraphs: true })) { /* match the save year */ }
const modernPier = C.BgNet.stops(2000, contemporary).find(p => p.kind === 'ferry' && p.name === centralPier.name);
assert.ok(modernPier && C.U.dist(modernPier.x, modernPier.y, centralPier.x, centralPier.y) > 0.5);
assert.equal(contemporary.waterAt(modernPier.x, modernPier.y), 0);
assert.notEqual(C.BgNet.stops(2000, city), C.BgNet.stops(2000, contemporary));
const afterReclaim = C.BgNet.stops(2000, city);
assert.notEqual(afterReclaim, beforeReclaim);
const reclaimedPier = afterReclaim.find(p => p.kind === 'ferry' && p.name === centralPier.name);
assert.equal(reclaimedPier.x, modernPier.x);
assert.equal(reclaimedPier.y, modernPier.y);
assert.equal(C.BgNet.links(2000, network, city).list.some(e => e.stop.name === centralPier.name), false);
console.log('PASS ferry transfer range, coverage stats and historical shoreline cache');

const hills = contemporary.hillLimits();
const at = contemporary.lu.findIndex((land, i) => land === C.LU.RES && hills.homes[i] < 0.2 &&
  contemporary.regionOpen[contemporary.region[i]] && contemporary.landFrac[i] >= 0.9);
assert.ok(at >= 0);
contemporary.lu[at] = C.LU.COM;
contemporary.pop[at] = 1500;
contemporary.jobs[at] = 2500;
contemporary.bh[at] = 180;
const saved = contemporary.serialize(), old = new C.City();
for (const _ of old.generateGen(778291, 1970, { deferGraphs: true })) { /* initialize map data */ }
old.restore(saved, 2000);
assert.equal(old.pop[at], 1500);
assert.equal(old.jobs[at], 2500);
assert.equal(old.bh[at], 180);
const totals = old.totals();
old.growMonth({ year: 2000, monthIndex: C.U.ymIndex(2000, 1) });
assert.ok(old.pop[at] < 1500 && old.pop[at] > 1300);
assert.ok(old.jobs[at] < 2500 && old.jobs[at] > 2200);
assert.ok(old.bh[at] < 40);
assert.ok(old.dirty.has(at));
assert.ok(Math.abs(old.totals().pop - totals.pop) < totals.pop * 0.08);
assert.ok(Math.abs(old.totals().jobs - totals.jobs) < totals.jobs * 0.08);
console.log('PASS saved mountain development remains unchanged on load and adjusts at month end');


C.useMap('pa');
const paris = new C.City();
for (const _ of paris.generateGen(19000101, 1900, { deferGraphs: true })) { /* load the river */ }
const seine = { ...history, city: paris, clock: { y: 1900 } };
BG.sync(seine);
assert.ok(BG.ferries.some(route => route.f.river === '塞纳河' && route.r.total > 1));
seine.clock.y = 1934; seine.year = () => 1934.5;
BG.sync(seine);
assert.ok(BG.ferries.length && C.BgNet.piers(seine.year(), paris).length);
seine.clock.y = 1935; seine.year = () => 1935;
BG.sync(seine);
assert.equal(BG.ferries.length, 0, 'the historical Seine service has retired');
assert.ok(C.BgNet.stops(1900, paris).some(p => p.kind === 'ferry'));
assert.ok(C.BgNet.stops(1935, paris).every(p => p.kind !== 'ferry'));
console.log('PASS historical Seine service remains visible and retires on schedule');
