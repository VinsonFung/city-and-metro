// Fault-injected browser storage; never reads a real browser profile or save.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../js/save.js', import.meta.url), 'utf8');
const config = await readFile(new URL('../js/config.js', import.meta.url), 'utf8');
const util = await readFile(new URL('../js/util.js', import.meta.url), 'utf8');
const fault = name => Object.assign(new Error(name), { name });

function setup() {
  const data = new Map(), memory = new Map(), connections = [];
  const state = { opens: 0, transactions: 0, failOpen: 0, failTransaction: null, before: null, after: null, failIndex: false, failLocal: false };
  const indexedDB = {
    open() {
      state.opens++;
      const request = {};
      queueMicrotask(() => {
        if (state.failOpen) { state.failOpen--; request.error = fault('UnknownError'); request.onerror?.(); return; }
        const connection = {
          closed: false,
          close() { this.closed = true; },
          transaction(store, mode) {
            state.transactions++;
            assert.equal(store, 'slots');
            state.before?.(connection, mode);
            if (this.closed) throw fault('InvalidStateError');
            const tx = { error: null };
            const operation = (type, key, value) => {
              const req = {};
              queueMicrotask(() => {
                if (state.failTransaction) { tx.error = fault(state.failTransaction); state.failTransaction = null; }
                if (tx.error) { tx.onabort?.(); return; }
                if (type === 'put') data.set(key, value);
                if (type === 'delete') data.delete(key);
                req.result = type === 'get' ? data.get(key) : key;
                req.onsuccess?.();
                state.after?.(connection, mode, type);
                tx.oncomplete?.();
              });
              return req;
            };
            tx.objectStore = () => ({ put: (v, k) => operation('put', k, v), get: k => operation('get', k), delete: k => operation('delete', k) });
            tx.abort = () => { tx.error = fault('AbortError'); };
            return tx;
          },
        };
        connections.push(connection);
        request.result = connection;
        request.onsuccess?.();
      });
      return request;
    },
  };
  const localStorage = {
    getItem: k => memory.get(k) ?? null,
    setItem(k, v) {
      if ((state.failIndex && k === 'cm1.index') || (state.failLocal && k !== 'cm1.index')) throw fault('QuotaExceededError');
      memory.set(k, String(v));
    },
    removeItem: k => memory.delete(k),
  };
  const context = { CM: {}, console, indexedDB, localStorage, setTimeout, clearTimeout, atob, btoa };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(config, context, { filename: 'config.js' });
  vm.runInContext(util, context, { filename: 'util.js' });
  const C = context.CM;
  C.MAPS = { test: { mapVersion: 1, cfg: { W: 1, H: 1 }, data: {} } };
  vm.runInContext(source, context, { filename: 'save.js' });
  const game = {
    id: 'storage-test', name: '隔离测试', mode: 'free', mapId: 'test', createdAt: 1,
    clock: { y: 2000, m: 1, d: 1 }, compiled: { stations: [] }, econ: { isFree: () => true },
    serialize() {
      return {
        meta: { gameId: this.id, name: this.name, mode: this.mode, map: 'test', mapVersion: 1, createdAt: 1 },
        clock: { ...this.clock }, rulesRevision: C.CFG.RULES_REVISION, traffic: { v: C.CFG.TRAFFIC_MODEL },
        city: Object.fromEntries(['pop', 'jobs', 'bh', 'taken', 'lu', 'street', 'urbanYear'].map(k => [k, { b: 'AA==', n: 1 }])),
        net: { stations: {} }, econ: { mode: 'free' }, tasks: {},
      };
    },
  };
  return { S: C.Save, game, data, memory, connections, state };
}

async function save(h, kind = 'manual', opts) {
  const result = await h.S.save(h.game, kind, opts);
  assert.equal(result.ok, true, result.error);
  return result;
}
async function checkLoad(h, slotId) {
  assert.equal(JSON.stringify(await h.S.load(slotId)), JSON.stringify(h.game.serialize()));
}

// Closing a cached connection without an event reproduces the player's exact
// InvalidStateError. Reopen before overwriting, then verify the committed body.
{
  const h = setup(), first = await save(h);
  const oldKey = h.S.slotInfo(first.slotId).key;
  h.connections[0].close(); h.game.clock.m = 2;
  const second = await save(h, 'manual', { slotId: first.slotId });
  assert.equal(second.slotId, first.slotId);
  assert.equal(h.state.opens, 2);
  await checkLoad(h, second.slotId);
  assert.equal(h.S.list()[0].slots.length, 1);
  // Cleanup is asynchronous, but the replacement must always remain readable.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.data.has(oldKey), false);
}

// Abnormal close and versionchange invalidate only their own connection.
// Concurrent consumers share one reopen; a late old close cannot clear it.
for (const event of ['onclose', 'onversionchange']) {
  const h = setup(); await h.S.init();
  const old = h.connections[0]; old.close(); old[event]?.();
  await Promise.all([h.S.init(), h.S.init(), h.S.init()]);
  assert.equal(h.state.opens, 2, event);
  old[event]?.();
  const result = await save(h); await checkLoad(h, result.slotId);
  assert.equal(h.state.opens, 2, 'late event must not discard the new connection');
}

// A forced close can abort an in-flight write before its close event arrives.
{
  const h = setup(); await h.S.init();
  const old = h.connections[0], transaction = old.transaction.bind(old);
  old.transaction = (store, mode) => { const tx = transaction(store, mode); old.close(); tx.abort(); return tx; };
  const result = await save(h); await checkLoad(h, result.slotId);
  assert.equal(h.state.opens, 2);
}

// Also reconnect when the connection closes between the write and read-back.
{
  const h = setup();
  h.state.after = (connection, mode) => { if (mode === 'readwrite') { h.state.after = null; connection.close(); } };
  const result = await save(h); await checkLoad(h, result.slotId);
  assert.equal(h.state.opens, 2);
  assert.equal(h.S.slotInfo(result.slotId).store, 'idb');
}

// Reopen failure uses the existing localStorage fallback. A later request can
// recover IndexedDB; the earlier fallback and old IDB saves remain readable.
{
  const h = setup(), original = await save(h);
  h.connections[0].close(); h.state.failOpen = 1; h.game.clock.m = 2;
  const fallback = await save(h);
  assert.equal(h.S.slotInfo(fallback.slotId).store, 'ls');
  h.game.clock.m = 3;
  const recovered = await save(h);
  assert.equal(h.S.slotInfo(recovered.slotId).store, 'idb');
  await checkLoad(h, recovered.slotId);
  assert.equal((await h.S.load(original.slotId)).clock.m, 1);
  assert.equal((await h.S.load(fallback.slotId)).clock.m, 2);
}
{
  const h = setup(); h.state.failOpen = 1; await h.S.init();
  const result = await save(h); await checkLoad(h, result.slotId);
  assert.equal(h.S.slotInfo(result.slotId).store, 'idb', 'an initial open error must not disable IDB for the session');
}

// Repeated closing is bounded at two attempts, with no index duplication.
{
  const h = setup(); h.state.before = connection => connection.close();
  const result = await save(h); await checkLoad(h, result.slotId);
  assert.equal(h.state.opens, 2);
  assert.equal(h.S.slotInfo(result.slotId).store, 'ls');
  assert.equal(h.S.list()[0].slots.length, 1);
}

// Real quota errors must not be mistaken for a disconnected database. Neither
// a failed IDB write nor a failed index commit may replace the previous slot.
for (const indexFailure of [false, true]) {
  const h = setup(), first = await save(h), original = JSON.stringify(h.S.slotInfo(first.slotId));
  h.game.clock.m = 2;
  if (indexFailure) h.state.failIndex = true;
  else h.state.failTransaction = 'QuotaExceededError';
  const result = await h.S.save(h.game, 'manual', { slotId: first.slotId });
  assert.equal(result.ok, false);
  assert.match(result.error, /空间不足/);
  assert.equal(JSON.stringify(h.S.slotInfo(first.slotId)), original);
  assert.equal(h.state.opens, 1, 'quota errors must not trigger a reconnect');
  h.state.before = null; h.state.failIndex = false;
  assert.equal((await h.S.load(first.slotId)).clock.m, 1);
}

// A temporary read/open error must not claim that an indexed save disappeared.
{
  const h = setup(), first = await save(h), original = h.memory.get('cm1.index');
  const before = new Map(h.data);
  h.connections[0].close(); h.state.failOpen = 1;
  await assert.rejects(h.S.load(first.slotId), /IndexedDB 不可用/);
  assert.equal(h.memory.get('cm1.index'), original); assert.deepEqual(h.data, before);
  await checkLoad(h, first.slotId);
}

// Queued autosaves still rotate between exactly two slots after reconnecting.
{
  const h = setup(); await h.S.init(); h.connections[0].close();
  const snapshots = [];
  for (let month = 1; month <= 4; month++) { h.game.clock.m = month; snapshots.push(h.S.save(h.game, 'auto')); }
  for (const result of await Promise.all(snapshots)) assert.equal(result.ok, true, result.error);
  const slots = h.S.list()[0].slots;
  assert.equal(slots.length, 2); assert.equal(h.state.opens, 2);
  assert.deepEqual((await Promise.all(slots.map(async slot => (await h.S.load(slot.slotId)).clock.m))).sort(), [3, 4]);
}

// Both backends unavailable: report failure, preserve old data/index, and let
// export-current-progress work without needing a database connection.
{
  const h = setup(), first = await save(h), original = h.memory.get('cm1.index');
  h.connections[0].close(); h.state.failOpen = 1; h.state.failLocal = true;
  h.game.clock.m = 2;
  const result = await h.S.save(h.game, 'manual', { slotId: first.slotId });
  assert.equal(result.ok, false); assert.equal(h.memory.get('cm1.index'), original);
  let exported; h.S.download = text => { exported = JSON.parse(text); };
  h.S.exportGame(h.game);
  assert.equal(JSON.parse(exported.body).clock.m, 2);
  assert.equal((await h.S.load(first.slotId)).clock.m, 1);
}

// Read and export existing IDB saves after closure without altering their bytes.
{
  const h = setup(), first = await save(h), key = h.S.slotInfo(first.slotId).key;
  const bytes = h.data.get(key); h.connections[0].close();
  await checkLoad(h, first.slotId);
  h.connections.at(-1).close();
  let exported; h.S.download = text => { exported = text; };
  await h.S.exportSlot(first.slotId);
  assert.equal(exported, bytes); assert.equal(h.data.get(key), bytes);
}

console.log('Save storage recovery: closing/closed connections, abort, read-back, reopen sharing, fallback/recovery, bounded retries, quota/index safety and export passed.');
