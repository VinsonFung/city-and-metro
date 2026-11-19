// Use generated cities and in-memory snapshots only.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const scope = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout };
scope.window = scope;
vm.createContext(scope);
const html = await readFile(new URL('index.html', root), 'utf8');
for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(file, root), 'utf8'), scope, { filename: file });
  if (file === 'js/metro.js') break;
}

const { CM } = scope;
function generate(map, year) {
  CM.useMap(map);
  const city = new CM.City();
  city.generate(19800101, year);
  return city;
}
function stationCell(city, regionId) {
  return city.region.findIndex((region, cell) => city.regions[region].id === regionId && city.landFrac[cell] >= 0.5 &&
    checkSite(city, cell, 'underground').ok);
}
function checkSite(city, cell, type) {
  return CM.Metro.checkSite(city, cell % city.W + 0.5, Math.floor(cell / city.W) + 0.5, type);
}

const singapore = generate('sg', 1980);
const early = singapore.lockState();
const schedules = [
  ['limchukang', 2030],
  ['lock_e', 2035],
  ['lock_n', 2040],
  ['west_catch', 2040],
  ['lock_w', 2045],
  ['tekong', 2045],
];
for (const [id, year] of schedules) {
  const k = singapore.regions.findIndex(region => region.id === id);
  assert.ok(early.info[k].n > 0, id + ' must have locked land in 1980');
  assert.equal(early.info[k].year, year, id + ' must advertise its actual opening year');
}
assert.equal(stationCell(singapore, 'tekong'), -1);
singapore.unlockAll = true;
assert.ok(stationCell(singapore, 'tekong') >= 0, 'Unlock-all includes future land even on a separate island');
assert.equal(stationCell(singapore, 'outer'), -1, 'Johor remains closed in unlock-all');
singapore.unlockAll = false;

let previous = 1980;
for (const year of [2030, 2035, 2040, 2045]) {
  singapore.applyReclaim(year);
  const before = singapore.lockState();
  singapore.dirty.clear();
  for (const [k, region] of singapore.regions.entries()) {
    if (region.open != null && region.open > previous && region.open <= year) singapore.openRegion(k, year, 1);
  }
  for (const [id, date] of schedules.filter(([, date]) => date === year)) {
    const cell = stationCell(singapore, id);
    assert.ok(cell >= 0, id + ' must accept construction after opening');
    assert.equal(before.mask[cell], 1, id + ' was closed before opening');
    assert.ok(singapore.dirty.has(cell), id + ' must invalidate the painted lock overlay');
    const k = singapore.region[cell];
    assert.deepEqual(Array.from(singapore.regionOpenDate[k]), [date, 1]);
  }
  previous = year;
}
assert.equal(stationCell(singapore, 'outer'), -1);
const airport = stationCell(singapore, 'changi_air');
assert.ok(airport >= 0, 'Changi can be served by an underground station');
assert.equal(checkSite(singapore, airport, 'surface').ok, false);
assert.equal(checkSite(singapore, airport, 'elevated').ok, false);

// Older released saves already store region openings. The buildability mask is recalculated on load.
const saved = JSON.parse(JSON.stringify(singapore.serialize()));
const reopened = generate('sg', 1980);
reopened.lockState();
reopened.restore(saved, 2045);
assert.deepEqual(Array.from(reopened.lockState().mask), Array.from(singapore.lockState().mask));
assert.deepEqual(Array.from(reopened.regionOpen), Array.from(singapore.regionOpen));
console.log('PASS Singapore opening forecasts, phased construction, unlock-all, Changi and save restoration');

for (const [map, id] of [['gz', 'newair'], ['sh', 'pvgair'], ['ny', 'lga_air'], ['sy', 'sy_air']]) {
  const city = generate(map, 2045);
  const cell = stationCell(city, id);
  assert.ok(cell >= 0, id + ' must accept an underground station after connecting to the city');
  assert.equal(checkSite(city, cell, 'surface').ok, false);
  assert.equal(checkSite(city, cell, 'elevated').ok, false);
}
console.log('PASS underground hub construction in Guangzhou, Shanghai, New York and Sydney');
