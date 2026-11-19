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
