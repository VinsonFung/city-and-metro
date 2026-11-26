import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, performance, atob, btoa, TextEncoder, TextDecoder,
  setTimeout, clearTimeout, setInterval: () => 0, navigator: { hardwareConcurrency: 4, deviceMemory: 4 },
  matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null, setItem: () => {} } });
context.window = context;
const load = async file => vm.runInContext(await readFile(new URL(file, root), 'utf8'), context, { filename: file });
const html = await readFile(new URL('index.html', root), 'utf8');
for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
  await load(file);
  if (file === 'js/save.js') break;
}
const CM = context.CM;
CM.UI = function () {};
for (const name of ['settings', 'corp', 'fleet', 'takeover']) await load('js/' + name + '.js');

for (const [map, before, open, first, last] of [
  ['hk', [1982, 4], [1983, 7], 'hh', 'st'],
  ['tk', [1987, 3], [1987, 4], 'tky', 'tky'],
]) {
  CM.useMap(map);
  const game = CM.Game.create({ mode: 'challenge', seed: 723 });
  CM.Fleet.ensure(game);
  const TK = CM.Takeover, railway = TK.list()[0];
  assert.ok(railway, map + ' takeover definition');
  [game.clock.y, game.clock.m] = before;
  assert.equal(TK.plan(game, railway, first, last).ok, false);
  [game.clock.y, game.clock.m] = open;
  game.econ.funds = 1e9;
  const plan = TK.plan(game, railway, first, last);
  assert.ok(plan.ok, plan.error);
  assert.ok(plan.total > 0 && plan.stations.length > 2);
  const funds = game.econ.funds;
  const result = TK.apply(game, railway, first, last);
  assert.ok(result.ok, result.error);
  assert.equal(game.econ.funds, funds - plan.total);
  assert.ok(game.fleet.trains.some(train => train.line === result.lid && CM.Fleet.model(train.model).kmh >= railway.speed));
  assert.ok(TK.bgCut(game.net, game.year()) > 0);
  assert.equal(TK.plan(game, railway, first, last).ok, false);
  const M = CM.Metro;
  const asBuilt = M.evaluate(M.clone(game.net), game.net, game.city, game.clock.y);
  assert.equal(asBuilt.conflicts.length, 0, JSON.stringify(asBuilt.conflicts.slice(0, 3)));
  const altered = M.clone(game.net);
  const track = Object.values(altered.segments).find(s => s.tk === railway.id);
  delete altered.segments[track.id];
  assert.ok(M.evaluate(altered, game.net, game.city, game.clock.y).conflicts.some(c => c.type === 'takeover'));
  if (map === 'hk') {
    const early = CM.Game.create({ mode: 'challenge', seed: 724 });
    CM.Fleet.ensure(early);
    early.econ.funds = 1e9;
    [early.clock.y, early.clock.m] = [1982, 12];
    const original = TK.apply(early, railway, 'un', 'tp');
    assert.ok(original.ok, original.error);
    [early.clock.y, early.clock.m] = [1983, 7];
    const carried = TK.plan(early, railway, 'tp', 'tpm');
    assert.ok(carried.ok, carried.error);
    assert.ok(TK.stationOf(early.net, railway, 'tp'));
    assert.equal(TK.plan(game, railway, 'tp', 'tpm').ok, false);
    console.log('PASS a player-owned historic Tai Po station remains a takeover endpoint after closure');
    const g = M.geomFromControl(M.segControl(game.net, track), track.type, game.city);
    const mid = CM.U.posAt(g.pts, g.cum, g.cum.at(-1) / 2, {});
    const ownership = track.tkE.slice(), built = track.built.slice();
    const split = game.edit(n => M.splitSegment(n, track.id, mid.x, mid.y, { size: 'M', type: track.type }, game.city));
    const ev = game.draftEval();
    assert.equal(ev.conflicts.length, 0, JSON.stringify(ev.conflicts));
    assert.ok(ev.changes.mod.some(x => x.includes('中间插站')));
    assert.ok(!ev.items.some(x => /新建轨道|改建轨道|调整线形/.test(x.label || '')));
    assert.equal(game.confirmDraft().ok, true);
    const children = Object.values(game.net.segments).filter(x => x.a === split.station || x.b === split.station);
    assert.equal(children.length, 2);
    for (const s of children) {
      assert.equal(s.tk, railway.id);
      assert.deepEqual(s.tkE, ownership);
      assert.deepEqual(s.built, built);
      assert.equal(s.tkSplit, undefined);
    }
    const moved = M.clone(game.net);
    moved.stations[children[0].a === split.station ? children[0].b : children[0].a].x += 2;
    assert.ok(M.evaluate(moved, game.net, game.city, game.clock.y).conflicts.some(c => c.type === 'takeover'));
    game.edit(n => M.removeStation(n, split.station));
    assert.equal(game.confirmDraft().ok, true);
    assert.ok(M.isVirt(game.net.stations[split.station]));
    assert.ok(game.netGone.stations[split.station]);
    for (const s of children) assert.equal(game.net.segments[s.id].tk, railway.id);
    console.log('PASS East Rail insertion preserves alignment, ownership, fees, and tracks after the added station is removed');
  }
  if (map === 'tk') {
    const fast = M.clone(game.net);
    fast.lines[result.lid].speed = 120;
    const grade = M.evaluate(fast, game.net, game.city, game.clock.y);
    assert.ok(grade.warnings.some(w => w.msg.includes('接管的既有铁路弯道半径')));
    assert.equal(grade.conflicts.length, 0, JSON.stringify(grade.conflicts.slice(0, 3)));
    game.edit(net => { net.lines[result.lid].speed = 120; });
    assert.equal(game.confirmDraft().ok, true);
    console.log('PASS Yamanote can confirm a speed change after takeover; tight curves remain speed warnings');
  }
  const snapshot = JSON.parse(JSON.stringify(game.serialize()));
  const { from, dx, dy, oldW, oldH } = [].concat(CM.MAPS[map].extent).at(-1);
  snapshot.meta.mapVersion = from;
  for (const key of ['pop', 'jobs', 'bh', 'taken', 'lu', 'street', 'urbanYear']) {
    const stored = snapshot.city[key], expanded = CM.U.unpackTyped(stored);
    const original = new expanded.constructor(oldW * oldH);
    for (let y = 0; y < oldH; y++) {
      const row = (y + dy) * game.city.W + dx;
      original.set(expanded.subarray(row, row + oldW), y * oldW);
    }
    snapshot.city[key] = CM.U.packTyped(original, stored.t);
  }
  for (const station of Object.values(snapshot.net.stations)) {
    station.x -= dx; station.y -= dy;
    if (station.site) station.site = [station.site[0] - dx, station.site[1] - dy];
  }
  for (const segment of Object.values(snapshot.net.segments)) {
    if (segment.pts) segment.pts = segment.pts.map(([x, y]) => [x - dx, y - dy]);
  }
  const body = JSON.stringify(snapshot);
  const raw = JSON.stringify({ format: CM.CFG.SAVE_FORMAT, version: CM.CFG.SAVE_VERSION, body, checksum: CM.U.fnv(body) });
  const restored = CM.Game.restore(CM.Save.parseEnvelope(raw).payload);
  assert.ok(TK.bgCut(restored.net, restored.year()) > 0);
  assert.equal(TK.plan(restored, railway, first, last).ok, false);
  assert.equal(restored.econ.funds, game.econ.funds);
  console.log('PASS', map, 'availability, construction, compatible trains, background deduction and ownership after map expansion');
}

CM.useMap('hz');
const city = CM.Game.create({ mode: 'challenge', seed: 724 });
assert.ok(CM.BgNet.lines()?.length > 0);
assert.ok(city.model.bgDaily.avg.ready);
assert.equal(city.model.bgDaily.avg.total, 0, 'Historic rail connection has not opened in 2000');
city.model.year = 2014;
city.model.solveNow(3);
assert.ok(city.model.bgDaily.avg.total > 0, 'The active rail connection carries passengers');
console.log('PASS per-line background rail demand and daily totals');

CM.useMap('tutorial');
const sandbox = CM.Game.create({ mode: 'free', tutorial: true, seed: 725 });
const M = CM.Metro, type = 'underground';
let alignment;
for (let y = 4; y < sandbox.city.H - 4 && !alignment; y++) {
  for (let x = 4; x < sandbox.city.W - 12 && !alignment; x++) {
    if (![x, x + 8].every(i => M.checkSite(sandbox.city, i, y, type).ok)) continue;
    const net = M.empty(), line = M.newLine(net);
    const a = M.addStation(net, x, y, { type, size: 'M' }, sandbox.city);
    const via = M.addStation(net, x + 4, y, { type, virtual: true }, sandbox.city);
    const b = M.addStation(net, x + 8, y, { type, size: 'M' }, sandbox.city);
    M.addSegment(net, line, a, via, [], type);
    M.addSegment(net, line, via, b, [], type);
    if (!M.evaluate(net, sandbox.net, sandbox.city, sandbox.clock.y).conflicts.length) alignment = { net, via };
  }
}
assert.ok(alignment);
sandbox.edit(net => Object.assign(net, alignment.net));
assert.equal(sandbox.confirmDraft().ok, true);
assert.ok(M.isVirt(sandbox.net.stations[alignment.via]));
assert.equal(sandbox.compiled.stations.length, 2);
assert.equal(sandbox.compiled.routes[0].stIds.length, 2);
const restoredAlignment = CM.Game.restore(JSON.parse(JSON.stringify(sandbox.serialize())));
assert.ok(M.isVirt(restoredAlignment.net.stations[alignment.via]));
assert.equal(restoredAlignment.compiled.stations.length, 2);
console.log('PASS virtual node construction, no passenger stop, and save restoration');

// A later protection zone covers the old alignment. Sharing or reassignment
// keeps the original route, while physical work must pass today's restrictions.
const old = M.empty(), line = M.newLine(old);
const a = M.addStation(old, 8, 12, { type: 'surface', size: 'M' }, sandbox.city);
const b = M.addStation(old, 16, 12, { type: 'surface', size: 'M' }, sandbox.city);
const section = M.addSegment(old, line, a, b, [], 'surface').id;
sandbox.city.heritage = new Uint8Array(sandbox.city.N).fill(2);
M.clearCaches();
const evaluate = draft => M.evaluate(draft, old, sandbox.city, sandbox.clock.y);
assert.equal(evaluate(M.clone(old)).conflicts.length, 0);
const shared = M.clone(old), second = M.newLine(shared);
M.addSegment(shared, second, a, b, [], 'surface');
assert.equal(evaluate(shared).conflicts.length, 0);
const relabel = M.clone(old), successor = M.newLine(relabel);
relabel.segments[section].line = successor;
delete relabel.lines[line];
assert.equal(evaluate(relabel).conflicts.length, 0);
const moved = M.clone(old);
moved.segments[section].pts = [[12, 13]];
assert.ok(evaluate(moved).conflicts.some(c => c.type === 'protected' && c.ref === section));
const retyped = M.clone(old);
retyped.segments[section].type = 'elevated';
assert.ok(evaluate(retyped).conflicts.some(c => c.type === 'protected' && c.ref === section));
const fresh = M.clone(old), newLine = M.newLine(fresh);
const p = M.addStation(fresh, 12, 8, { type: 'surface', size: 'M' }, sandbox.city);
const q = M.addStation(fresh, 12, 16, { type: 'surface', size: 'M' }, sandbox.city);
const crossing = M.addSegment(fresh, newLine, p, q, [], 'surface').id;
const conflicts = evaluate(fresh).conflicts;
assert.ok(conflicts.some(c => c.type === 'level' && c.ref === crossing));
assert.ok(conflicts.some(c => c.type === 'protected' && c.ref === crossing));
console.log('PASS existing alignment and shared/reassigned track; physical changes still enforce protected areas and crossings');

const junctionBase = M.clone(old), junction = M.clone(old);
junctionBase.stations[a].tk = junction.stations[a].tk = 'fixture';
const branch = M.newLine(junction);
const endpoint = M.addStation(junction, 8, 6, { type: 'surface', size: 'M' }, sandbox.city);
const spur = M.addSegment(junction, branch, a, endpoint, [], 'surface').id;
const atPlatform = [8, 11.9], away = [8, 9];
sandbox.city.railCross = () => ({ surf: [atPlatform, away], via: [] });
M.clearCaches();
const spurConflict = M.evaluate(junction, junctionBase, sandbox.city, sandbox.clock.y).conflicts.find(c => c.type === 'rail' && c.ref === spur);
assert.equal(spurConflict?.y, away[1], 'Only the crossing outside the adopted station platform should be reported');
console.log('PASS surface spur keeps the adopted platform crossing and rejects a separate crossing');
