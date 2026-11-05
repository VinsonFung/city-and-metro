// 网页版资源与版本校验：只检查本工程，不读取独立版或玩家数据。
import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const gameEntries = ['index.html', 'css', 'img', 'js', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.txt', 'licenses'];
const manifestName = 'game-manifest.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function localAsset(root, base, reference) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return null;
  const file = path.resolve(base, decodeURIComponent(reference.split(/[?#]/)[0]));
  const rel = path.relative(root, file);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('资源路径超出游戏目录：' + reference);
  return file;
}

export async function inspectGame(root = projectRoot) {
  root = path.resolve(root);
  const files = new Map(), referenced = new Set();
  async function scan(file) {
    const info = await lstat(file);
    if (info.isSymbolicLink()) throw new Error('游戏资源不允许链接：' + file);
    if (info.isDirectory()) {
      for (const name of (await readdir(file)).sort()) await scan(path.join(file, name));
      return;
    }
    if (!info.isFile()) throw new Error('资源不是普通文件：' + file);
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (rel.split('/').some(p => p.startsWith('.')) || /\.md$/i.test(rel)) throw new Error('发布资源包含开发文件：' + rel);
    if (info.size > 25 * 1024 * 1024) throw new Error('单个资源超过25 MiB：' + rel);
    const bytes = await readFile(file);
    files.set(file, { rel, bytes });
    if (rel.endsWith('.js')) new vm.Script(bytes.toString(), { filename: rel });
  }
  for (const entry of gameEntries) await scan(path.join(root, entry));
  function requireAsset(base, ref) {
    const file = localAsset(root, base, ref);
    if (file && !files.has(file)) throw new Error('资源引用不存在或不在发布范围内：' + ref);
    if (file) referenced.add(file);
    return file;
  }
  const html = files.get(path.join(root, 'index.html')).bytes.toString();
  const scripts = [...html.matchAll(/<script\s+src=["']([^"']+)["'][^>]*>\s*<\/script>/g)].map(m => m[1]);
  if (new Set(scripts).size !== scripts.length) throw new Error('入口重复加载脚本');
  if (scripts.at(-1) !== 'js/main.js') throw new Error('入口必须最后加载主循环');
  if (scripts.some(f => /(?:^|\/)(?:intro|desktop|achievements|view3d|actors3d|models3d|world|world_hd|world_water|worldmap|transitions)\.js$|\/vendor\/three\//i.test(f))) throw new Error('网页版不得加载独立版专属模块');
  for (const [first, next] of [['js/ui.js','js/sketch.js'],['js/sketch.js','js/pages.js'],['js/pages.js','js/impact.js'],['js/impact.js','js/voices.js'],['js/voices.js','js/main.js']]) if (scripts.indexOf(first) < 0 || scripts.indexOf(next) <= scripts.indexOf(first)) throw new Error('v2.3 模块缺失或加载顺序错误：' + first + ' → ' + next);
  for (const [first, next] of [['js/util.js', 'js/i18n.js'], ['js/locales/en.js', 'js/i18n.js'], ['js/vendor/opencc/cn2t.js', 'js/i18n.js'], ['js/vendor/pinyin/pinyin-pro.js', 'js/i18n.js'], ['js/config.js', 'js/maps.js'], ['js/maps.js', 'js/main.js'], ['js/settings.js', 'js/main.js'], ['js/ui.js', 'js/main.js'], ['js/road-kernel.js', 'js/sim.js'], ['js/sim-stamp.js', 'js/traffic-cache.js'], ['js/traffic-cache.js', 'js/save.js'], ['js/render.js', 'js/sites.js'], ['js/sites.js', 'js/main.js'], ['js/pages.js', 'js/quick.js'], ['js/quick.js', 'js/main.js'], ['js/economy.js', 'js/taskplans.js'], ['js/pages.js', 'js/corp.js'], ['js/corp.js', 'js/fleet.js'], ['js/fleet.js', 'js/opsapp.js'], ['js/voices.js', 'js/opsapp.js'], ['js/opsapp.js', 'js/main.js']]) {
    if (!scripts.includes(first) || !scripts.includes(next) || scripts.indexOf(first) >= scripts.indexOf(next)) throw new Error('脚本依赖或加载顺序错误：' + first + ' → ' + next);
  }
  if (scripts.indexOf('js/scenery.js') <= scripts.indexOf('js/sites.js') || scripts.indexOf('js/settings.js') <= scripts.indexOf('js/scenery.js')) throw new Error('Canvas 场景扩展必须在 sites.js 之后、settings.js 之前加载');
  const { simulationStamp } = await import('./sim-stamp.mjs');
  await simulationStamp(false, root);
  for (const [, ref] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) requireAsset(root, ref);
  for (const { rel, bytes } of files.values()) {
    const text = bytes.toString();
    if (rel.endsWith('.css')) {
      for (const [, ref] of text.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)) requireAsset(path.dirname(path.join(root, rel)), ref);
    } else if (rel.endsWith('.js') && !rel.startsWith('js/vendor/')) {
      for (const [, ref] of text.matchAll(/['"]((?:img|js|css|licenses)\/[^'"\s]+\.(?:png|svg|jpg|webp|js|css|txt|json)|(?:LICENSE|THIRD_PARTY_NOTICES)\.txt)['"]/gi)) requireAsset(root, ref);
    }
  }
  for (const { rel } of files.values()) if (rel.endsWith('.js') && !referenced.has(path.join(root, rel))) throw new Error('未引用的游戏脚本：' + rel);
  for (const name of ['js/vendor/opencc/LICENSE.txt', 'js/vendor/opencc/Apache-2.0.txt', 'js/vendor/pinyin/LICENSE.txt', 'licenses/Rust-MIT.txt', 'licenses/Rust-Apache-2.0.txt', 'licenses/Rust-stdlib-third-party.txt']) {
    if (!files.has(path.join(root, name))) throw new Error('缺少依赖许可：' + name);
  }
  const context = { console, performance, btoa, atob, TextEncoder, TextDecoder };
  context.window = context;
  vm.createContext(context);
  let loaded = false;
  for (const file of scripts) {
    // 数据检查不启动DOM、渲染、工作线程或存储。
    if (!/^js\/(?:util|config|news|legal|geo(?:_\w+)?|data_\w+|maps)\.js$/.test(file)) continue;
    const asset = requireAsset(root, file);
    vm.runInContext(files.get(asset).bytes.toString(), context, { filename: file, timeout: 10000 });
    if (file === 'js/maps.js') loaded = true;
  }
  const CM = context.CM;
  if (!loaded || !CM?.MAP_ORDER?.length) throw new Error('地图登记未加载');
  if (CM.CFG.GAME_VERSION !== CM.NEWS?.[0]?.v && CM.CFG.GAME_VERSION.replace(/\.0$/, '') !== CM.NEWS?.[0]?.v) throw new Error('游戏与最新更新公告版本不一致');
  if (!Array.isArray(CM.NEWS) || CM.NEWS.some(n => !Array.isArray(n.items) || n.items.length !== 6 || n.items.some(t => typeof t !== 'string' || !t.trim()))) throw new Error('每版更新公告必须包含6条非空玩家摘要');
  for (const file of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) {
    if (String(CM.LEGAL?.[file]).replace(/\r\n/g, '\n') !== files.get(path.join(root, file)).bytes.toString().replace(/\r\n/g, '\n')) throw new Error('游戏内许可副本过期：' + file);
  }
  const maps = CM.MAP_ORDER.map(id => {
    const m = CM.MAPS[id], c = m.cfg, p = m.geo.proj;
    if (m.id !== id || !Number.isInteger(m.mapVersion) || m.mapVersion < 1 || !c.W || !c.H || CM.CFG.CELL_M !== 250 || (m.kind === 'real' && !p)) throw new Error('地图登记或尺寸无效：' + id);
    return { id, mapVersion: m.mapVersion, displayRevision: m.data.displayRevision || 1, terrainRevision: m.data.terrainRevision || 1,
      width: c.W, height: c.H, cellMeters: CM.CFG.CELL_M, fingerprint: m.fp, projection: p ? JSON.parse(JSON.stringify(p)) : null };
  });
  const hashes = {};
  for (const { rel, bytes } of [...files.values()].sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0)) hashes[rel] = digest(bytes);
  return { schema: 1, edition: 'web', version: CM.CFG.GAME_VERSION, saveVersion: CM.CFG.SAVE_VERSION, trafficModel: CM.CFG.TRAFFIC_MODEL, rulesRevision: CM.CFG.RULES_REVISION || 0, maps, hashes };
}

export async function writeManifest(root = projectRoot) {
  const manifest = await inspectGame(root);
  await writeFile(path.join(root, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export async function verifyGame({ dist = false } = {}) {
  const { checkRoadKernel } = await import('./build-road-kernel.mjs');
  await checkRoadKernel();
  const expected = await inspectGame(projectRoot), folder = dist ? path.join(projectRoot, 'dist') : projectRoot;
  const recorded = JSON.parse(await readFile(path.join(folder, manifestName), 'utf8'));
  const actual = dist ? await inspectGame(folder) : expected;
  if (JSON.stringify(recorded) !== JSON.stringify(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('资源与发布清单不同，请检查改动后重新构建');
  return actual;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(a => !['--write', '--dist'].includes(a))) throw new Error('用法：node scripts/verify-game.mjs [--write | --dist]');
  const manifest = args[0] === '--write' ? await writeManifest() : await verifyGame({ dist: args[0] === '--dist' });
  console.log(JSON.stringify({ version: manifest.version, maps: manifest.maps.length, files: Object.keys(manifest.hashes).length, target: args[0] === '--dist' ? 'dist' : 'source' }));
}
