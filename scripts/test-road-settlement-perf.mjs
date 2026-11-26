import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Isolated solver fixtures. Use the actual worker entry and bundled WASM without touching player saves.
const root = new URL('../', import.meta.url);
let time = 0, tick = 0, workerResult;
const storage = new Map();
const scope = vm.createContext({
  console, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  performance: { now: () => (time += tick) },
  navigator: { hardwareConcurrency: 12 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
  postMessage: data => { workerResult = data; },
});
scope.window = scope;
for (const [, file] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  let source = await readFile(new URL(file, root), 'utf8');
  if (file === 'js/sim.js') source = source.replace('  CM.CarPool = CarPool;',
    '  CM.CarPool = CarPool; CM.testRoad = { carGraph, carOriginRow, carTimes, carWork, carWorkerMain };');
  vm.runInContext(source, scope, { filename: file });
  if (file === 'js/save.js') break;
}
const C = scope.CM, I = C.testRoad;
const int = values => Int32Array.from(values);
const edges = [[0,1], [0,2], [1,3], [2,3], [4,5], [5,4], [5,6]];
const zones = [[0], [3], [2,4], [4], [0,4], [7], [], [6]];
const Z = zones.length;
const rowStarts = rows => {
  const result = new Int32Array(rows.length + 1);
  rows.forEach((row, i) => { result[i + 1] = result[i] + row.length; });
  return result;
};
const road = { nN: 8, nA: edges.length, arcFrom: int(edges.map(e => e[0])), arcTo: int(edges.map(e => e[1])),
  outStart: rowStarts(Array.from({ length: 8 }, (_, node) => edges.filter(e => e[0] === node))),
  outArc: int(edges.map((_, i) => i)) };
const nodes = int(zones.flat());
const rd = { start: rowStarts(zones), nodes, times: Float64Array.of(0, 0, 0.15, 0, 0, 0, 0.25, 0, 0),
  km: new Float64Array(nodes.length), zones: int(zones.flatMap((ends, i) => ends.length ? [i] : [])),
  arcKm: Float64Array.of(0.1, 0.2, 0.3, 0.8, 1.1, 1.1, 0.7) };
const G = I.carGraph({ roadData: rd, road, Z });
assert.equal(G.comp[0], G.comp[3]);
assert.equal(G.comp[4], G.comp[6]);
assert.notEqual(G.comp[0], G.comp[4]);
assert.notEqual(G.comp[6], G.comp[7]);
assert.equal(I.carGraph({ roadData: rd, road, Z }), G, 'The component index follows graph reuse');

const timeByArc = new Float32Array(road.nA).fill(1);
const choices = int(zones.keys());
const blank = n => new Float32Array(n).fill(NaN);
const runRow = (graph, source, ends, W = I.carWork(graph), demand = Float32Array.from(ends, () => 3.25)) => {
  const t = blank(ends.length), k = blank(ends.length), flow = new Float32Array(graph.nA);
  I.carOriginRow(graph, I.carTimes(graph, timeByArc, W.tP), source, ends, 0, ends.length, demand, W, t, k, 0, flow);
  return { t, k, flow };
};
const scratch = I.carWork(G);
runRow(G, 4, choices, scratch);
assert.ok(scratch.dist[4] < 1, 'The previous row reached the other component');
const nothing = runRow(G, 0, int([3,5,6,7]), scratch);
assert.ok(nothing.t.every(Number.isNaN) && nothing.k.every(Number.isNaN) && nothing.flow.every(x => x === 0));
assert.ok(scratch.accN.every(x => x === 0), 'An entirely unreachable row must leave no stale flow');
assert.ok(runRow(G, 7, int([3])).t.every(Number.isNaN), 'Weak connectivity does not imply a reverse route');
assert.equal(runRow(G, 4, int([3])).t[0], 0.25, 'A multi-component origin must keep all its entrances');
const unpruned = { ...G, comp: new Int32Array(road.nN) };
const fast = I.carWork(G), slow = I.carWork(G); fast.order.fill(-1); slow.order.fill(-1);
assert.deepEqual(runRow(G, 0, int([2,3]), fast), runRow(unpruned, 0, int([2,3]), slow));
assert.ok(fast.order.filter(n => n >= 0).length < slow.order.filter(n => n >= 0).length, 'Pruning must let the search stop early');

const origins = int([0, 4, 3, 7, 6]);
const tStart = int(Array.from({ length: origins.length + 1 }, (_, i) => i * Z));
const ends = int(Array.from({ length: origins.length }, () => [...choices]).flat());
const dem = Float32Array.from(ends, d => d + 0.125);
const reference = { rowsT: blank(ends.length), rowsK: blank(ends.length), aux: new Float32Array(road.nA) };
const work = I.carWork(G), times = I.carTimes(G, timeByArc, work.tP);
for (let i = 0; i < origins.length; i++) I.carOriginRow(G, times, origins[i], ends, tStart[i], tStart[i + 1], dem, work, reference.rowsT, reference.rowsK, 0, reference.aux);
assert.ok(C.RoadKernel.module, 'The bundled WASM kernel must be available');
vm.runInContext(C.RoadKernel.worker.toString(), scope);
I.carWorkerMain();
for (const module of [null, C.RoadKernel.module]) {
  scope.onmessage({ data: { type: 'graph', G: structuredClone(G), kernel: module } });
  scope.onmessage({ data: { type: 'block', gid: G.id, origins, tStart, tDest: ends, dem, time: timeByArc } });
  assert.equal(!!workerResult.kernel, !!module);
  for (const key of Object.keys(reference)) assert.deepEqual([...workerResult[key]], [...reference[key]], key);
}
console.log('PASS disconnected and mixed road access with exact JS, Worker and WASM times, distances and flows');

const pool = C.CarPool;
const posts = [];
const slots = () => Array.from({ length: 8 }, (_, i) => ({ n: 0, w: { postMessage: msg => { if (msg.type === 'block') posts.push(i); } } }));
const blocks = Array.from({ length: 16 }, () => ({ origins: int([0]), tStart: int([0, 1]), tDest: int([1]), dem: Float32Array.of(1) }));
const checkSlots = (game, loading, interacting, expected) => {
  C.game = game; C.isLoading = () => loading; C.R = { interacting };
  pool.list = slots(); pool.queue.length = 0; pool.reqs.clear(); posts.length = 0;
  pool.submit(G, timeByArc, blocks, () => true);
  assert.equal(new Set(posts).size, expected);
  assert.equal(posts.length, expected * 2);
};
checkSlots({}, false, false, 6);
checkSlots({}, false, true, 4);
checkSlots({ jumping: true }, false, true, 8);
checkSlots({}, true, true, 8);
checkSlots(null, false, false, 8);
C.game = null; C.R = null; pool.list = null; pool.queue.length = 0; pool.reqs.clear();
console.log('PASS session, drag, loading and fast-forward worker budgets');

C.useMap('tutorial');
const makeCity = () => { const c = new C.City(); c.generate(20000101, 2000, { deferGraphs: true }); return c; };
const whole = makeCity(), sliced = makeCity();
whole.buildGraphs();
tick = 9;
let yields = 0;
for (const _ of sliced.buildGraphsGen()) {
  yields++;
  assert.equal(sliced.walk, undefined, 'Do not publish a partial walking graph');
  assert.equal(sliced.car, undefined, 'Do not publish a partial car graph');
}
assert.ok(yields > 4, 'Graph building should yield inside phases when over budget');
assert.deepEqual(sliced.walk, whole.walk);
assert.deepEqual(sliced.car, whole.car);
const model = new C.Model(sliced, { deferDemand: true });
const group = model.zoneCells[0], zoned = sliced.regions.length;
sliced.regions.push({ empty: true });
const opened = new Uint8Array(zoned + 1); opened.set(sliced.regionOpen); sliced.regionOpen = opened;
for (const c of group) { sliced.region[c] = zoned; sliced.lu[c] = C.LU.HILL; sliced.pop[c] = 0; sliced.jobs[c] = 0; sliced.landFrac[c] = 1; }
model.buildZones();
assert.equal(model.zA[3 * model.Z], 0, 'Closed vacant land must produce no synthetic leisure demand');
opened[zoned] = 1;
sliced.pop[group[0]] = 100;
model.buildZones();
assert.equal(model.zPop[0], 100, 'Previously vacant districts contribute again once open');
assert.ok(model.zA[3 * model.Z] > 0);
tick = 0; model.buildDemand();
const baseline = JSON.stringify(model.od);
tick = 9; yields = 0;
for (const _ of model.buildDemandGen()) yields++;
assert.ok(yields > model.Z / 16, 'Slow demand generation should yield more frequently');
assert.equal(JSON.stringify(model.od), baseline, 'Slicing must preserve demand and the skim fingerprint');
console.log('PASS closed/open vacant land demand and time-sliced graph and OD equivalence');

tick = 0;
const game = C.Game.create({ mode: 'challenge', tutorial: true, seed: 20000101 });
const saved = JSON.parse(JSON.stringify(game.serialize()));
saved.rulesRevision = 20;
const body = JSON.stringify(saved);
const raw = JSON.stringify({ format: C.CFG.SAVE_FORMAT, version: C.CFG.SAVE_VERSION,
  gameVersion: C.CFG.GAME_VERSION, savedAt: Date.now(), body, checksum: C.U.fnv(body) });
const imported = await C.Save.importText(raw);
assert.ok(imported.slotId, 'Could not import the revision 20 fixture');
const loaded = await C.Save.load(imported.slotId);
assert.ok(loaded.__backupSlot, 'Previous rule revision should get an original backup');
assert.equal(JSON.parse(storage.get(C.Save.slotInfo(loaded.__backupSlot).key)).body, body);
const restored = C.Game.restore(loaded);
assert.equal(restored.ym(), game.ym());
assert.equal(restored.econ.funds, game.econ.funds);
assert.equal(JSON.stringify(restored.econ.ledger), JSON.stringify(game.econ.ledger));
assert.equal(JSON.stringify(restored.net), JSON.stringify(game.net));
assert.ok(restored.model.trafficReady());
console.log('PASS revision 20 save backup, traffic recomputation and unchanged dates, network and accounts on restore');
