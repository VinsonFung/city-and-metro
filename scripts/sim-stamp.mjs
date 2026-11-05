import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function simulationStamp(write = false, root = projectRoot) {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => /^js\/(?:util|config|geo(?:_\w+)?|data_\w+|maps|eras|facility|city|metro|sim|game|economy|macro|road-kernel|taskplans|corp|fleet)\.js$/.test(f));
  const hash = createHash('sha256');
  for (const f of files) hash.update(f + '\0').update(await readFile(path.join(root, f)));
  const text = "'use strict';\n// Generated from this web edition's simulation inputs.\nwindow.CM.SIM_STAMP = '" + hash.digest('hex') + "';\n";
  const dest = path.join(root, 'js/sim-stamp.js');
  if (write) await writeFile(dest, text);
  else if (await readFile(dest, 'utf8') !== text) throw Error('交通缓存源码指纹已过期，请重新构建');
}
