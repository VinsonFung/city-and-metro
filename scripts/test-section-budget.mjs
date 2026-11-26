// Web feature regression with isolated in-memory storage.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url), memory = new Map();
const scope = vm.createContext({
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 2 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) },
});
scope.window = scope;
const html = await readFile(new URL('index.html', root), 'utf8');
for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(file, root), 'utf8'), scope, { filename: file });
  if (file === 'js/agents.js') break;
}
const { CM } = scope, { U, Metro: M, Tasks, Agents } = CM;
const equalCost = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, actual + ' vs ' + expected);

CM.useMap('tutorial');
const live = CM.Game.create({ mode: 'free', tutorial: true, seed: 20000101 });
let first, second;
for (let y = 5; y < 30 && !first; y += 2) for (let x = 5; x < 35 && !first; x += 2) {
  const points = [[x, y], [x + 6, y], [x, y + 5], [x + 6, y + 5]];
  if (points.every(([a, b]) => M.checkSite(live.city, a, b, 'underground').ok)) {
    [first, second] = [points.slice(0, 2), points.slice(2)];
  }
}
assert.ok(first);
function addLine(points) {
  let built;
  live.edit(draft => {
    const id = M.newLine(draft), stops = points.map(([x, y]) => M.addStation(draft, x, y, { size: 'M', type: 'underground' }, live.city));
    const seg = M.addSegment(draft, id, stops[0], stops[1], [], 'underground');
    assert.ok(seg.id, seg.error);
    built = { id, stops, seg: seg.id };
  });
  assert.equal(live.confirmDraft().ok, true);
  return built;
}
const unrelated = addLine(second);
const anchors = first.map(([x, y], i) => ({ name: 'anchor ' + i, x, y, r: .125 }));
const budget = { id: 'budget', type: 'budgetConnect', budget: 1e9, months: 24, anchors };
live.tasks.offers = [budget];
const accepted = live.tasks.accept(live, budget.id);
assert.equal(accepted.budgetFrom, 1);
const beforeLinked = live.econ.built;
const built = addLine(first), linked = live.econ.built - beforeLinked;
assert.ok(linked > 0);
const elsewhere = second.map(([x, y]) => ({ x, y, r: .125 }));
assert.equal(Tasks.sectionSpend(live, elsewhere, accepted.budgetFrom), 0, "The pre-task build was on the same day");
live.edit(draft => { draft.stations[unrelated.stops[0]].size = "L"; });
assert.equal(live.confirmDraft().ok, true);
assert.ok(Tasks.sectionSpend(live, elsewhere, accepted.budgetFrom) > 0);
equalCost(Tasks.sectionSpend(live, anchors, accepted.budgetFrom), linked);
const originalNet = JSON.stringify(live.net), paid = live.net.segments[built.seg].buildPayments[0][2];
let middle;
live.edit(draft => { middle = M.splitSegment(draft, built.seg, first[0][0] + 3, first[0][1], { virtual: true }, live.city).station; });
assert.equal(JSON.stringify(live.net), originalNet, 'Editing must not mutate paid records in the live network');
assert.equal(live.confirmDraft().ok, true);
const split = Object.values(live.net.segments).filter(s => s.line === built.id);
assert.equal(split.length, 2);
equalCost(split.reduce((v, s) => v + s.buildPayments[0][2], 0), paid);
equalCost(Tasks.sectionSpend(live, anchors, accepted.budgetFrom), linked);
const alias = M.clone(live.net), old = Object.values(alias.segments).find(s => s.line === built.id);
const other = M.newLine(alias), id = M.addSegment(alias, other, old.b, old.a, [], old.type).id;
M.recordBuildPayments(alias, [], 4);
assert.equal(JSON.stringify(alias.segments[id].buildPayments), JSON.stringify(old.buildPayments), 'Shared track retains the same receipt');
M.recordBuildPayments(alias, [], 5);
assert.equal(JSON.stringify(alias.segments[id].buildPayments), JSON.stringify(old.buildPayments), 'Sharing a receipt twice must be idempotent');
const priced = M.clone(live.net), [short, long] = Object.values(priced.segments).filter(s => s.line === built.id);
M.recordBuildPayments(priced, [{ ref: short.id, amount: 60, trackShares: [[short.id, .25], [long.id, .75]] }], 6);
assert.equal(priced.segments[short.id].buildPayments.at(-1)[2], 15);
assert.equal(priced.segments[long.id].buildPayments.at(-1)[2], 45);
live.edit(draft => M.removeStation(draft, middle));
assert.equal(live.confirmDraft().ok, true);
const loaded = CM.Game.restore(JSON.parse(JSON.stringify(live.serialize())));
assert.equal(loaded.buildSeq, live.buildSeq);
assert.equal(loaded.tasks.active.find(t => t.id === 'budget').budgetFrom, 1);
equalCost(Tasks.sectionSpend(loaded, anchors, 1), linked);
assert.equal(live.tasks.evaluate({ ...accepted, budget: linked - 1 }, live).dead, true);
assert.equal(live.tasks.evaluate({ ...accepted, budgetFrom: undefined, spent0: live.econ.built - 100, budget: 50 }, live).dead, true);
const combo = { id: 'combo', type: 'combo', months: 24, anchors, parts: [{ type: 'connect', core: true }, { type: 'budget', budget: 10 }] };
live.tasks.offers.push(combo);
const picked = live.tasks.accept(live, combo.id);
assert.equal(picked.parts[1].budgetFrom, live.buildSeq);
assert.equal(live.tasks.evaluate(picked, live).parts[1].ok, true);

const compiled = {
  stations: [{ id: 's1', x: 0, y: 0 }, { id: 's2', x: 1, y: 0 }, { id: 's3', x: 3, y: 0 }, { id: 's4', x: 4, y: 0 }],
  routes: [{ stIdx: [0, 1], legSegs: [[{ id: 'g1' }]], legLenM: [250] }, { stIdx: [2, 3], legSegs: [[{ id: 'g2' }]], legLenM: [250] }],
  serviced: [true, true, true, true],
};
const transfer = { compiled, model: { net: { C: compiled, acc: { transfers: [{ a: 1, b: 2, m: 500 }] } } }, net: {
  stations: {},
  segments: { g1: { a: 's1', b: 's2', buildPayments: [[2, 'g1', 30]] }, g2: { a: 's3', b: 's4', buildPayments: [[3, 'g2', 40]] } },
} };
assert.equal(Tasks.sectionSpend(transfer, [{ x: 0, y: 0, r: .1 }, { x: 4, y: 0, r: .1 }], 1), 70);
console.log('PASS section costs, same-day ordering, unrelated lines, virtual split, shared tracks, transfers, reload and legacy budgets');

const serialized = JSON.parse(JSON.stringify(live.serialize()));
const st = Object.values(serialized.net.stations)[0];
serialized.net.stations.virtual = { id: 'virtual', x: st.x + 1, y: st.y, v: 1 };
serialized.net.segments.virtual = { ...Object.values(serialized.net.segments)[0], b: 'virtual' };
const body = JSON.stringify(serialized);
const slot = await CM.Save.importText(JSON.stringify({ body, checksum: U.fnv(body), format: CM.CFG.SAVE_FORMAT, version: 2 }));
const preview = await CM.Save.linePreview(slot.slotId);
assert.equal(preview.stations, Object.keys(serialized.net.stations).length - 1);
assert.equal(preview.st.length / 2, preview.stations);
assert.equal(preview.segs.length, Object.keys(serialized.net.segments).length);

const vx = [0, 1, 2, 0, 1, 2], vy = [0, 0, 0, 1, 1, 1], deg = [], start = [0], to = [], len = [];
for (let i = 0; i < vx.length; i++) {
  for (let j = 0; j < vx.length; j++) if (Math.abs(vx[i] - vx[j]) + Math.abs(vy[i] - vy[j]) === 1) { to.push(j); len.push(40); }
  start.push(to.length); deg.push(start[i + 1] - start[i]);
}
const city = { W: 2, H: 1, N: 2, V: 6, VW: 3, vx, vy, pop: [110, 100], jobs: [0, 0], cellAt: () => 0, zoneOf: c => c, walk: { deg, start, to, len } };
const access = { city, Z: 2, zoneCells: [[0], [1]], year: 2020, heap: new U.Heap(128) };
const stations = [.01, .02, .03, .04, .05, .06].map(x => ({ x, y: .01 })).concat([{ x: .5, y: .5 }]);
function incoming(bonus) {
  CM.BgNet = { links: () => ({ bonus: Float32Array.of(0, 0, 0, 0, 0, 0, bonus) }) };
  const gen = CM.Model.prototype.computeAccessGen.call(access, { stations, serviced: new Uint8Array(7).fill(1) });
  let r; do { r = gen.next(); } while (!r.done);
  assert.equal(r.value.zl[0].length, 6);
  return r.value.zl[0].find(q => q.s === 6).w;
}
equalCost(incoming(0) - incoming(1.25), 1.25);
console.log('PASS border station dots and background connection benefit for a fallback station');

const actors = new Agents(), loads = [50, 0, 100, 0];
actors.netRef = { rideEdge: [[0, 1, 2, 3]] };
const group = { r: 0, rt: { cap: 100, cars: 2 }, legs: [{ k: 0, T: 20, dwell: 8 }, { k: 1, T: 20, dwell: 8 }], lastDep: 0, cycle: 56 };
const train = { id: 1, g: group, leg: 0, t: 0, alpha: 1 };
actors.trains = [train]; actors.groups.set('train', group);
const model = { freqAt: () => 1, edgeLoadAt: i => loads[i] };
actors.updateTrains(5, .1, model, {});
assert.equal(actors.trainPassengers(train), 50);
loads[0] = 90;
actors.updateTrains(10, .1, model, {});
assert.equal(actors.trainPassengers(train), 50);
loads[2] = 120;
actors.updateTrains(5, .1, model, {});
assert.equal(actors.trainPassengers(train), 120, 'Arrival updates the count boarding');
assert.equal(train.passengers, 50, 'Alighting still uses the arriving count');
loads[2] = 20;
actors.updateTrains(9, .1, model, {});
assert.equal(train.leg, 1);
assert.equal(actors.trainPassengers(train), 120);
console.log('PASS train snapshots change at arrivals and remain stable between stops');
