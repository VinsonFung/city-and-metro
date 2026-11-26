import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
let clockOffset = 0;
const sandbox = vm.createContext({
  console, performance: { now: () => performance.now() + clockOffset },
  atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null },
});
sandbox.window = sandbox;
for (const [, file] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  await vm.runInContext(await readFile(new URL(file, root), 'utf8'), sandbox, { filename: file });
  if (file === 'js/save.js') break;
}
const C = sandbox.CM;
C.useMap('tutorial');
const makeGame = () => C.Game.create({ mode: 'challenge', tutorial: true, seed: 20000101 });
const clockEnd = 1440 - 0.001;
const g = makeGame();
const endDay = g.endDay;
let attempts = 0, days = 0;
g.on('day', () => days++);
g.endDay = function () {
  const crossed = endDay.call(this);
  if (++attempts === 1) throw Error('Fault after ordinary daily billing');
  return crossed;
};
g.clock.minute = clockEnd;
g.setSpeed(1);
g.update(0.01);
assert.equal(attempts, 2);
assert.equal(days, 1);
assert.equal(g.clock.d, 2);
assert.equal(g.econ.cur.days, 1);
assert.equal(g.settlementError, undefined);

const month = g.monthGen;
let months = 0, monthAttempts = 0;
g.on('month', () => months++);
g.monthGen = function* () {
  const complete = yield* month.call(this);
  if (++monthAttempts === 1) throw Error('Fault after ordinary monthly billing');
  return complete;
};
const y = g.clock.y, m = g.clock.m;
g.clock.d = C.U.daysInMonth(y, m);
g.econ.cur.days = g.clock.d - 1;
g.clock.minute = clockEnd;
g.update(0.01);
assert.throws(() => g.serialize(), /正在进行月度结算/);
for (let i = 0; g.pending && i < 5000; i++) g.update(0);
assert.ok(!g.pending && !g.settlementError, g.settlementError?.stack);
assert.equal(monthAttempts, 2);
assert.equal(months, 1);
assert.equal(g.econ.ledger.length, 1);
assert.equal(g.econ.ledger[0].days, C.U.daysInMonth(y, m));
assert.equal(g.clock.d, 1);
assert.equal(g.econ.cur.days, 0);
assert.ok(g.econ.cur.grant > 0 && g.speed === 1);
console.log('PASS normal clock retries both daily and monthly charges while preserving speed and save safety');

const loss = makeGame();
loss.econ.funds = -1e9;
let failed, report;
loss.on('failed', result => { failed = result; });
loss.on('jumpDone', result => { report = result; });
const start = loss.ym();
assert.ok(loss.startJump(12));
for (let i = 0; loss.jumping && i < 5000; i++) loss.stepJump();
assert.ok(failed?.reasons.length && report?.failed === failed);
assert.equal(loss.ym(), start + 1);
assert.equal(loss.econ.ledger.length, 1);
assert.ok(!loss.settlementError);
console.log('PASS true challenge loss finishes its month and ends the jump under the game rules');

const pool = C.CarPool;
const savedPool = { ready: pool.ready, submit: pool.submit, off: pool.off, list: pool.list, why: pool.why };
try {
  const stalled = makeGame();
  stalled.model.setNetwork(stalled.compiled);
  assert.ok(!stalled.model.trafficReady());
  pool.off = false;
  pool.list = [];
  pool.ready = () => !pool.off;
  pool.submit = (_graph, _times, blocks) => {
    const req = { id: ++pool.rseq, remaining: 1, failed: false, res: new Array(blocks.length) };
    pool.reqs.set(req.id, req);
    return req;
  };
  const solve = stalled.ensureSettlementTraffic();
  let next;
  for (let i = 0; i < 20000; i++) {
    next = solve.next();
    if (next.done) break;
    if (next.value === C.SIM_WAIT) clockOffset += 31000;
  }
  assert.ok(next?.done && stalled.model.trafficReady());
  assert.ok(pool.off && /长时间未返回结果/.test(pool.why));
  assert.equal(pool.reqs.size, 0);
  assert.equal(stalled.econ.cur.days, 0);
  console.log('PASS silent worker timeout falls back to main-thread traffic without billing prematurely');
} finally {
  Object.assign(pool, savedPool);
}

const damaged = makeGame(), previousModel = damaged.model;
previousModel.setNetwork(damaged.compiled);
let partialCalls = 0;
previousModel.solveGen = function* () {
  partialCalls++;
  this.fn = null;
  throw Error('Fault leaves the traffic model partially refreshed');
};
const oldYear = damaged.clock.y, oldMonth = damaged.clock.m;
const co = damaged.ensureSettlementTraffic();
for (let r = co.next(); !r.done; r = co.next()) {}
assert.equal(partialCalls, 1, 'Recovery should discard the partial model');
assert.notEqual(damaged.model, previousModel);
assert.ok(previousModel.retired && damaged.model.trafficReady());
assert.equal(damaged.econ.cur.days, 0);
assert.equal(damaged.clock.y, oldYear);
assert.equal(damaged.clock.m, oldMonth);
console.log('PASS a partial traffic failure is rebuilt before any day is billed');


const stranded = makeGame(), openModel = stranded.model;
const from = stranded.ym(), before = stranded.econ.funds, refreshCity = C.Model.prototype.refreshCityGen;
openModel.setNetwork(stranded.compiled);
openModel.solveGen = function* () { throw Error('Fault in live traffic'); };
let rebuilds = 0;
C.Model.prototype.refreshCityGen = function* (...args) {
  if (++rebuilds === 1) throw Error('Fault while rebuilding traffic');
  return yield* refreshCity.apply(this, args);
};
try {
  assert.ok(stranded.startJump(1));
  for (let i = 0; stranded.jumping && i < 5000; i++) stranded.stepJump();
  assert.match(stranded.settlementError?.message, /while rebuilding traffic/);
  assert.equal(stranded.model, openModel);
  assert.ok(!openModel.retired && stranded._settlementTrafficNeedsRebuild);
  assert.equal(stranded.ym(), from);
  assert.equal(stranded.serialize().econ.funds, before);
  stranded.retrySettlement();
  for (let i = 0; stranded.jumping && i < 5000; i++) stranded.stepJump();
  assert.ok(!stranded.settlementError && stranded.model.trafficReady());
  assert.equal(stranded.ym(), from + 1);
  assert.equal(stranded.econ.ledger.length, 1);
  assert.ok(stranded.econ.cur.grant > 0);
  console.log('PASS failed traffic rebuild leaves a saveable date and retries the original jump once');
} finally {
  C.Model.prototype.refreshCityGen = refreshCity;
}

const boundary = makeGame();
boundary.clock.d = C.U.daysInMonth(boundary.clock.y, boundary.clock.m);
boundary.econ.cur.days = boundary.clock.d - 1;
assert.equal(boundary.endDay(), true);
const input = JSON.parse(JSON.stringify(boundary.serialize()));
const archived = JSON.stringify(input), balance = input.econ.funds;
const restored = C.Game.restore(input);
assert.equal(restored.clock.d, 1);
assert.equal(restored.econ.cur.m, restored.clock.m, 'Legacy closed opening must not keep billing into the old month');
assert.equal(restored.econ.cur.y, restored.clock.y);
assert.equal(restored.econ.cur.days, 0);
assert.equal(restored.econ.cur.closed, undefined);
assert.equal(restored.econ.ledger.length, 1);
assert.ok(restored.econ.cur.grant > 0 && Math.abs(restored.econ.funds - balance - restored.econ.cur.grant) < 1e-6);
assert.equal(JSON.stringify(restored.econ.ledger[0]), JSON.stringify(JSON.parse(archived).econ.ledger[0]));
const second = C.Game.restore(JSON.parse(JSON.stringify(restored.serialize())));
assert.equal(second.econ.funds, restored.econ.funds);
assert.equal(second.econ.flow.filter(r => r.kind === 'grant' && r.y === second.clock.y && r.m === second.clock.m).length,
  restored.econ.flow.filter(r => r.kind === 'grant' && r.y === restored.clock.y && r.m === restored.clock.m).length);
assert.ok(second.startJump(1));
for (let i = 0; second.jumping && i < 5000; i++) second.stepJump();
assert.equal(second.settlementError, undefined);
assert.equal(second.ym(), restored.ym() + 1);
assert.equal(second.econ.ledger.length, 2);
console.log('PASS a closed legacy opening restores the missing month and grant once and advances normally');
