import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

export async function geoIndex(root, write = false) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<script src="(js\/geo_([a-z]+)\.js)" type="application\/city-metro-geo">/g)];
  if (!entries.length) throw new Error('入口缺少按需加载的地图');
  const index = {};
  for (const [, file, id] of entries) {
    const CM = {};
    vm.runInNewContext(await readFile(path.join(root, file), 'utf8'), { window: { CM } }, { filename: file, timeout: 10000 });
    const G = CM.GEOS?.[id];
    if (!G?.proj || !G.water || !G.roads) throw new Error('地图数据不完整：' + file);
    index[id] = { file, proj: G.proj, names: G.names || [], places: G.places || [], count: { water: G.water.length, roads: G.roads.length } };
  }
  const output = "'use strict';\n// 由 scripts/geo-index.mjs 根据各城市地理数据生成。\n" +
    '(function (CM) {\n  const geos = CM.GEOS = CM.GEOS || {};\n  const index = {\n' +
    Object.entries(index).map(([id, geo]) => '    ' + id + ': ' + JSON.stringify(geo)).join(',\n') +
    '\n  };\n  for (const id in index) if (!geos[id]) geos[id] = index[id];\n})(window.CM);\n';
  const dest = path.join(root, 'js/geo-index.js');
  if (write) await writeFile(dest, output);
  else if (await readFile(dest, 'utf8') !== output) throw new Error('地图索引已过期，请重新构建');
}
