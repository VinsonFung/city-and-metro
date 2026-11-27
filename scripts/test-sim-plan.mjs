import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const scope = vm.createContext({
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 2 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
scope.window = scope;
for (const [, file] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(file, root), 'utf8'), scope, { filename: file });
  if (file === 'js/save.js') break;
}
const { CM } = scope, { U, Metro: M, Fac, SimPlan: SP } = CM;
const drain = it => { while (!it.next().done) {} };
CM.useMap('tutorial');
const g = CM.Game.create({ mode: 'free', tutorial: true, seed: 20000101 });
assert.equal(SP.enabled(g), false);
g.tutorial = null;
CM.DATA.fictional = CM.DATA.noDynTasks = false;
CM.CFG.growth = { ...CM.CFG.growth, histEnd: 1999 };
g.econ.mode = 'challenge';
g.tasks.nextDyn = g.ym() + 200;
g.tasks.offerMonthly = () => [];
g.econ.funds = 1e7;

let point;
for (let y = 5; y < 30 && !point; y += 2) for (let x = 5; x < 34 && !point; x += 2) {
  if ([x, x + 6].every(a => M.checkSite(g.city, a, y, 'underground').ok)) point = [x, y];
}
assert.ok(point);
g.edit(n => {
  const id = M.newLine(n), [x, y] = point;
  const a = M.addStation(n, x, y, { size: 'M', type: 'underground' }, g.city);
  const b = M.addStation(n, x + 6, y, { size: 'M', type: 'underground' }, g.city);
  M.addSegment(n, id, a, b, [], 'underground');
});
assert.equal(g.confirmDraft().ok, true);
const [x, y] = point, p = {
  id: 'p1', k: 'proj', kind: 'newtown', name: 'Fixture New Town', x, y, r: 7, ar: 7,
  years: 14, open: [2000, 2], pop: 25000, jobs: 6000, status: 'ann', task: { st: 'skip' },
  fac: { id: 'plan-p1', n: 'Fixture Centre', t: 'shop', at: [x, y], y0: [2000, 2], plan: 'p1' },
};
const e = {
  id: 'e2', k: 'event', kind: 'expo', name: 'Fixture Expo', vname: 'Fixture Venue', x, y,
  start: [2000, 2], end: [2000, 3], target: .3, status: 'ann', task: { st: 'wait' },
  fac: { id: 'plan-e2', n: 'Fixture Expo', t: 'event', at: [x, y], y0: [2000, 2], y1: [2000, 4], pax: [[0, 8]], plan: 'e2' },
  taskSpec: { type: 'eventShare', fac: 'plan-e2', win: [[2000, 2], [2000, 3]], deadline: [2000, 3],
    target: .3, title: 'Fixture Expo', spot: { x, y }, plan: 'e2', anchors: [{ x, y, r: 3 }], rewardMonths: 2.5 },
};
// Publish once, using the normal Tasks path. The real event has a longer preparation period.
e.taskSpec.win = [[2000, 4], [2000, 5]];
e.taskSpec.deadline = [2000, 5];
e.start = [2000, 4]; e.end = [2000, 5]; e.fac.y0 = e.start; e.fac.y1 = [2000, 6];
g.plan = { v: 1, seq: 3, nextP: g.ym() + 200, nextE: g.ym() + 200, items: [p, e] };
SP.attach(g);
assert.equal(Fac.byId(e.fac.id).t, 'event');
assert.equal(Fac.active(Fac.byId(e.fac.id), 2000, g.city), false);
const ready = g.model.trafficReady, monthOffers = g.tasks.offerMonthly;
g.model.trafficReady = () => true;
g.tasks.monthly(g);
assert.equal(g.tasks.active.filter(t => t.plan === e.id).length, 1);
assert.equal(e.task.st, 'on');
g.tasks.monthly(g);
assert.equal(g.tasks.active.filter(t => t.plan === e.id).length, 1);
g.model.trafficReady = ready;

const checkpoint = g.settlementCheckpoint(true), initialFunds = g.econ.funds;
const advanceMonth = m => { Object.assign(g.clock, { m, d: 1 }); g.econ.openMonth(2000, m); };
advanceMonth(2);
SP.month(g, 2000, 2);
assert.equal(p.hit, true);
assert.ok(g.econ.funds > initialFunds);
const after = g.econ.funds;
SP.month(g, 2000, 2);
assert.equal(g.econ.funds, after);
drain(g.restoreSettlementCheckpoint(checkpoint));
assert.equal(g.plan.items[0].status, 'ann');
assert.equal(g.city.simPlan, g.plan);
assert.equal(g.econ.funds, initialFunds);
advanceMonth(2);
SP.month(g, 2000, 2);
assert.equal(g.econ.funds, after);
assert.ok(Fac.active(Fac.byId('plan-p1'), g.year(), g.city));

const reloaded = CM.Game.restore(JSON.parse(JSON.stringify(g.serialize())));
assert.equal(reloaded.city.simPlan, reloaded.plan);
assert.equal(JSON.stringify(reloaded.plan), JSON.stringify(g.plan));
assert.equal(Fac.byId('plan-e2').plan, 'e2');
assert.equal(reloaded.econ.funds, after);
SP.attach(g);
g.tasks.offerMonthly = monthOffers;
let share = .75;
Object.assign(g.model, {
  trafficReady: () => true, trafficVerified: () => true, facIndex: () => 0,
  facStats: () => ({ inn: 40000, out: 40000, innM: 40000 * share, outM: 40000 * share }),
});
const t = g.tasks.active.find(t => t.plan === 'e2');
assert.ok(t);
advanceMonth(4); SP.month(g, 2000, 4);
assert.equal(Fac.active(Fac.byId('plan-e2'), g.year(), g.city), true);
assert.equal(SP.fireworks(g).length, 1);
g.econ.fare = { mode: 'flat', flat: .01 };
assert.equal(g.tasks.evaluate(t, g).cheap, true);
assert.equal(t.best, undefined, 'Opening a task card does not record spectator traffic');
g.tasks.monthly(g);
assert.equal(t.best, undefined, 'A discounted month does not count');
advanceMonth(5); share = .4;
g.econ.fare = { mode: 'flat', flat: Math.max(1, t.fare0) };
g.tasks.monthly(g);
assert.equal(t.status, 'done');
assert.equal(t.best, .4);
advanceMonth(6); SP.month(g, 2000, 6);
assert.equal(g.plan.items[1].share, .4);
assert.equal(Fac.active(Fac.byId('plan-e2'), g.year(), g.city), false);
console.log('PASS planned facilities, projects and event publication, rollback, save/reload, fare gating and closure');

const total = values => values.reduce((a, b) => a + b, 0);
const patch = new Float32Array(16).fill(10);
const district = { W: 4, H: 4, N: 16, pop: patch.slice(), jobs: patch.slice(), simPlan: { items: [{ ...p, x: 1.5, y: 1.5, r: .7, status: 'open' }] } };
const cap = new Float32Array(16).fill(1000), roads = new Uint8Array(16).fill(1);
assert.ok(SP.grow(district, 2000 + 1 / 12, cap, cap, roads).includes(5));
assert.ok(district.pop[5] > 10 && district.jobs[5] > 10);
assert.ok(Math.abs(total(district.pop) - 160) < .001);
assert.ok(Math.abs(total(district.jobs) - 160) < .001);

g.plan = null; SP.attach(g);
CM.DATA.events = [];
CM.Tasks.GATE = { ...CM.Tasks.GATE, baseKm: 12, maxKm: 16, minCatch: 1, share: 0 };
for (let i = 0; i < 30; i++) {
  const year = 2011 + Math.floor(i / 12), month = 1 + i % 12;
  Object.assign(g.clock, { y: year, m: month, d: 1 });
  SP.month(g, year, month);
}
assert.ok(g.plan.items.some(it => it.k === 'proj'), 'The scheduler must generate a real site');
assert.ok(g.plan.items.some(it => it.k === 'event'), 'The scheduler must select a venue');
console.log('PASS planning schedule and population/job conservation');

const jumped = CM.Game.create({ mode: 'free', tutorial: true, seed: 20000102 });
jumped.tutorial = null;
jumped.plan = { ...g.plan, items: [JSON.parse(JSON.stringify(p))], nextP: jumped.ym() + 200, nextE: jumped.ym() + 200 };
jumped.plan.items[0].hit = false; jumped.plan.items[0].status = 'ann';
SP.attach(jumped);
assert.equal(jumped.startJump(1), true);
for (let i = 0; jumped.jumping && i < 1000; i++) jumped.stepJump();
assert.equal(jumped.settlementError, undefined);
assert.equal(jumped.clock.m, 2);
assert.equal(jumped.plan.items[0].status, 'open');
assert.ok(jumped.model.fn.ids.includes('plan-p1'));
console.log('PASS normal one-month jump opens the project and refreshes facility demand');
