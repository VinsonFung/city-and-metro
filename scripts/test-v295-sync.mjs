import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null },
});
context.window = context;
for (const [, file] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  await vm.runInContext(await readFile(new URL(file, root), 'utf8'), context, { filename: file });
  if (file === 'js/save.js') break;
}
const C = context.CM;
const E = C.Economy;

const economy = {
  ledger: [{ y: 2000, m: 1, grant: 100, fare: 60, ops: 70, construction: 25 },
    { y: 2000, m: 2, grant: 100, fare: 80, ops: 89, pppOut: 20 },
    { y: 2000, m: 3, grant: 100, fare: 90, ppp: 16, ops: 90 }],
  cur: { y: 2000, m: 4, grant: 100, fare: 30, ops: 20, todCost: 2, upgrade: 80, capexUse: 42, interest: 9 },
};
const from = [2000, 1, 20], to = [2000, 4, 20], prior = { y: 2000, m: 1, grant: 100, fare: 42, ops: 40, construction: 25 };
const totals = E.prototype.summarizeAdvance.call(economy, from, to, prior);
assert.deepEqual({ ...totals }, { income: 534, ops: 231, build: 80, debt: 9, bond: 0, contractOut: 20, capexUse: 42 });
assert.equal(E.prototype.summarizeAdvance.call({ ledger: [], cur: prior }, from, from, prior).income, 0);
console.log('PASS exact interval finance, same-month failure and separate capital/contract amounts');

C.useMap('tutorial');
const tasks = new C.Tasks();
tasks.offerMonthly = () => [];
C.DATA.noDynTasks = true;
C.DATA.events = [];
const point = { x: 0.5, y: 0.5, r: 0.6 };
const historical = (id, year) => ({
  id, appear: [2000, 1], deadline: [year, 1], title: id, type: 'connect', anchors: [point], reward: 10,
});
C.DATA.histTasks = [historical('historic-a', 2005), historical('historic-b', 2005),
  historical('historic-c', 2005), historical('historic-d', 2005)];
const mask = [1];
const game = {
  clock: { y: 2001, m: 1, d: 20 }, ym() { return C.U.ymIndex(this.clock.y, this.clock.m); },
  year() { return this.clock.y; }, econ: new E('challenge', 2000, 1),
  city: { W: 1, H: 1, landMax: [1], lockState: () => ({ mask, year: [2003] }) },
  model: { net: null, trafficReady: () => true },
  compiled: { stations: [], routes: [], serviced: [] },
};
assert.equal(tasks.monthly(game).length, 0);
game.clock.y = 2002;
assert.equal(tasks.monthly(game).length, 0);
assert.equal(tasks.issued['hw:historic-a'], game.ym());
game.clock.y = 2003;
mask[0] = 0;
assert.equal(tasks.monthly(game).filter(o => o.type === 'issued').length, 3);
assert.equal(tasks.active.length, 3);
assert.equal(tasks.issued['hw:historic-d'], C.U.ymIndex(2002, 1));
assert.equal(C.Tasks.restore(JSON.parse(JSON.stringify(tasks.serialize()))).startYM, tasks.startYM);
game.compiled = { stations: [point], routes: [{ stIdx: [0] }], serviced: [1] };
const initialRewards = game.econ.cur.reward;
const finished = tasks.quickCheck(game);
assert.equal(finished.length, 3);
assert.ok(game.econ.cur.reward > initialRewards);
const rewards = game.econ.cur.reward;
assert.equal(tasks.quickCheck(game).length, 0);
assert.equal(game.econ.cur.reward, rewards);
game.clock.y = 2005;
game.compiled = { stations: [], routes: [], serviced: [] };
const delayed = tasks.monthly(game).find(o => o.type === 'issued').task;
assert.equal(delayed.id, 'historic-d');
assert.deepEqual(Array.from(delayed.deadline), [2006, 1]);
assert.ok(delayed.delayNote);
console.log('PASS task queue, historical window, cap, delayed deadline and one-time immediate rewards');

C.useMap('sh');
const repair = C.DATA.stationNameRepair.labels.get('陆家滨路')[0];
assert.ok(C.DATA.places.some(p => p[0] === '陆家浜路'));
const net = { stations: { a: { x: repair[1], y: repair[2], name: '陆家滨路' },
  b: { x: repair[1] + 10, y: repair[2], name: '陆家滨路' },
  c: { x: repair[1], y: repair[2], name: '陆家滨路', customName: true } } };
C.Metro.repairStationNames(net, null);
assert.equal(net.stations.a.name, '陆家浜路');
assert.equal(net.stations.b.name, '陆家滨路');
assert.equal(net.stations.c.name, '陆家滨路');
assert.ok(net.stationNameRevision);
C.I18n.apply('en');
assert.match(C.Save.fileName({ name: '自定/进度', date: [2026, 2] }), /自定_进度_2026-02\.cmsave\.json$/);
assert.equal(C.I18n.text('陆家浜路'), 'Lujiabang Road');
C.useMap('tk');
C.I18n.apply('zh-TW');
assert.equal(C.I18n.text('冰川台'), '冰川台');
console.log('PASS default station names, conservative old-save repair and localized filenames');


const T = C.Tasks, dedup = new T(), xy = (x, y = 0) => ({ x, y });
const routeTask = (anchors, kind) => ({ type: 'connect', kind, anchors });
const historicalRoute = routeTask([xy(10), xy(25)], 'hist');
const variant = routeTask([xy(25.1), xy(10.3)], 'dyn');
const extension = routeTask([xy(10.3), xy(25.1), xy(38)], 'dyn');
assert.equal(T.sameAnchors([xy(10), xy(7)], [xy(9), xy(13)]), 2, 'Anchor assignment must find both matches even when the first anchor has two candidates');
dedup.active.push(historicalRoute);
assert.equal(dedup.dupOf(variant).done, false);
assert.ok(dedup.targeted(10.1, 0));
dedup.done.push(dedup.active.pop());
assert.equal(dedup.dupOf(variant).done, true);
assert.equal(dedup.dupOf(extension), null);
dedup.failed.push(dedup.done.pop());
assert.equal(dedup.dupOf(variant).done, true);
T.coolPlace(dedup, { anchors: [xy(10), ['missing old anchor'], null], spot: xy(25) }, 100, false);
assert.ok(dedup.cooledNear(10.1, 0, 219));
assert.ok(dedup.cooledNear(25.1, 0, 219));
assert.equal(dedup.cooledNear(25.1, 0, 220), false);

const metroCheck = C.Metro.checkSite;
try {
  C.Metro.checkSite = () => ({ ok: true });
  const siteCity = { uid: 'access-test', VW: 20, terrainVer: 1, lockVer: 1, walk: { deg: new Uint8Array(400) } };
  const f = { id: 'test-stadium', x: 6.5, y: 6.5, lmK: -1 };
  const links = { ids: [f.id], link: Uint8Array.of(1) };
  assert.equal(T.facServable(siteCity, f, links), false, 'Legal station site without walkable streets must fail');
  siteCity.walk = { deg: new Uint8Array(400) };
  siteCity.walk.deg[126] = 1;
  assert.equal(T.facServable(siteCity, f, links), true, 'Rebuilt walk network must invalidate task eligibility cache');
  links.link[0] = 0;
  assert.equal(T.facServable(siteCity, f, links), false, 'Facility entrance must reach the walk network');
  assert.equal(T.facServable(siteCity, { ...f, ext: true }, links), true, 'Off-map interchange is still eligible');
} finally { C.Metro.checkSite = metroCheck; }
console.log('PASS duplicate task anchors, regional cooldown and facility entrance accessibility');
