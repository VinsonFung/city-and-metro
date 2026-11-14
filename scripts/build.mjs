import { cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameEntries, writeManifest, verifyGame } from './verify-game.mjs';
import { checkRoadKernel } from './build-road-kernel.mjs';
import { simulationStamp } from './sim-stamp.mjs';
import { geoIndex } from './geo-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, 'dist');
const entries = gameEntries;

// Publish game assets and required legal notices; exclude planning docs and local files.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
  throw new Error('Refusing to rebuild a directory outside the project dist folder.');
}
for (const entry of entries) {
  const source = path.join(root, entry);
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Cannot publish a symbolic link: ${entry}`);
}
// 游戏内文档使用当前网页版许可，支持直接打开 file://。
const legal = {};
for (const file of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) legal[file] = (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
await writeFile(path.join(root, 'js/legal.js'), "'use strict';\n// 由 scripts/build.mjs 从网页版根目录许可生成。\n(function (CM) { CM.LEGAL = " + JSON.stringify(legal, null, 2) + '; })(window.CM);\n');
await geoIndex(root, true);
await checkRoadKernel();
await simulationStamp(true);
await writeManifest(root);
try { if ((await lstat(output)).isSymbolicLink()) throw new Error('Cannot rebuild a linked dist folder.'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const entry of entries) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}
await cp(path.join(root, 'game-manifest.json'), path.join(output, 'game-manifest.json'));

// This game has no client-side URL router; unknown paths should return a real 404.
await writeFile(path.join(output, '404.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页面不存在 · 城市与地铁</title><h1>页面不存在</h1><p><a href="/">返回游戏</a></p></html>\n');

// Files have stable names, so browsers should revalidate before using a cached release.
await writeFile(path.join(output, '_headers'), [
  '/*',
  '  Cache-Control: public, max-age=0, must-revalidate',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '',
].join('\n'));

const html = await readFile(path.join(output, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
for (const reference of references) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) continue;
  const asset = path.resolve(output, reference.split(/[?#]/)[0]);
  const relative = path.relative(output, asset);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Asset reference leaves deployment directory: ${reference}`);
  }
  await stat(asset);
}

let count = 0;
let bytes = 0;
async function inspect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error(`Symbolic link in deployment: ${absolute}`);
    if (item.isDirectory()) { await inspect(absolute); continue; }
    if (item.name.endsWith('.md') || item.name.startsWith('.')) {
      throw new Error(`Private or unexpected file in deployment: ${absolute}`);
    }
    const info = await stat(absolute);
    if (info.size > 25 * 1024 * 1024) {
      throw new Error(`Asset exceeds Cloudflare Pages file size limit: ${absolute}`);
    }
    count++;
    bytes += info.size;
  }
}
await inspect(output);
await verifyGame({ dist: true });
console.log(JSON.stringify({ output: 'dist', files: count, bytes, htmlReferencesChecked: references.length }));

