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
