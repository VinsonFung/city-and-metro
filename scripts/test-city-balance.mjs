import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const memory = new Map();
const context = vm.createContext({
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval: () => 0,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 },
  matchMedia: () => ({ matches: false }),
  localStorage: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key),
  },
});
context.window = context;
const load = async file => vm.runInContext(await readFile(new URL('../' + file, import.meta.url), 'utf8'), context, { filename: file });
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
  await load(file);
  if (file === 'js/save.js') break;
}
const CM = context.CM, C = CM.CFG;
CM.UI = function () {};
for (const file of ['settings', 'corp', 'fleet']) await load('js/' + file + '.js');
const fixture = {
  gz: { oldPop: [[1990, 3.78e6], [2020, 10.9e6]], oldJobs: [[1990, .464], [2020, .532]], pop: 14e6, jobs: .62, fac: 'gz_thl', weight: .1 },
  hz: { oldJobs: [[2000, .47], [2020, .544]], pop: 9.33e6, jobs: .60, fac: 'hz_qjxc', weight: .07 },
};
for (const [id, spec] of Object.entries(fixture)) {
  CM.useMap(id);
  const current = C.growth;
  assert.equal(CM.U.interp(current.popCurve, 2020), spec.pop);
  assert.equal(CM.U.interp(current.jobsRatio, 2020), spec.jobs);
  assert.equal(CM.U.interp(CM.DATA.facilities.find(f => f.id === spec.fac).w, 2020), spec.weight);
  if (id === 'gz') {
    assert.equal(CM.DATA.facPopRef, 11.7e6);
    const huadu = CM.DATA.regions.find(r => r.id === 'huadu');
    assert.equal(huadu.pop, 6.55e6);
    assert.equal(huadu.open, 2000);
    assert.equal(huadu.growK[0], 2.2);
  }
  C.growth = { ...current, popCurve: spec.oldPop || current.popCurve, jobsRatio: spec.oldJobs };
  const old = CM.Game.create({ mode: 'challenge', seed: 9300701 });
  const before = old.city.totals();
  const save = old.serialize();
  save.rulesRevision = 14;
  const original = JSON.stringify(save);
  const imported = await CM.Save.importText(JSON.stringify({
    body: original, format: C.SAVE_FORMAT, version: C.SAVE_VERSION, gameVersion: '2.9.2', checksum: CM.U.fnv(original), savedAt: 1,
  }));
  CM.useMap(id);
  const loaded = await CM.Save.load(imported.slotId);
  const backup = CM.Save.slotInfo(loaded.__backupSlot);
  assert.equal(backup.kind, 'backup');
  assert.equal(JSON.parse(memory.get(backup.key)).body, original);
  const restored = CM.Game.restore(loaded);
  assert.equal(restored.city.totals().pop, before.pop);
  assert.equal(restored.city.totals().jobs, before.jobs);
  assert.equal(restored.econ.funds, save.econ.funds);
  assert.equal(JSON.stringify(restored.net), JSON.stringify(save.net));
  assert.equal(JSON.stringify(restored.econ.ledger), JSON.stringify(save.econ.ledger));
  restored.city.growMonth({ year: restored.clock.y, monthIndex: restored.ym() });
  const next = restored.city.totals();
  assert.ok(next.jobs > before.jobs && next.jobs < before.jobs * 1.08);
  assert.ok(next.pop > before.pop && next.pop < before.pop * 1.05);
  console.log('PASS', id, 'new demand parameters, exact prior save, and gradual monthly growth');
}
CM.useMap('tutorial');
assert.equal(CM.U.interp(C.growth.popCurve, 2000), 420000);
