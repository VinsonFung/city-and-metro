'use strict';
// 本地存档（无账号）：存档数据保存在浏览器 IndexedDB（容量大），不可用时退回 localStorage；
// 存档索引保存在 localStorage。支持多进度、自动/手动存档、文件导入导出（格式、版本、校验和检查）。
(function (CM) {
  const U = CM.U, CFG = CM.CFG;
  const P = CFG.saves.prefix;
  const IDX = P + 'index';

  // ---------------- 存储后端 ----------------
  let db = null, opening = null;
  function closeDB(connection) {
    // 旧连接的迟到事件不能清掉已经重建的新连接。
    if (db === connection) db = null;
    try { connection.close(); } catch (e) { /* 已关闭。 */ }
  }
  function unavailableDB() {
    const e = new Error('IndexedDB 不可用');
    e.idbUnavailable = true;
    return e;
  }
  function openDB() {
    if (db) return Promise.resolve(db);
    if(opening)return opening;
    opening = new Promise(function (resolve) {
      let settled=false;
      // 打开失败只影响本次操作；下次保存 / 读取仍可恢复，不能整场禁用数据库。
      const fail=function(){if(settled)return;settled=true;resolve(null);};
      let req;
      try { req = indexedDB.open('city-metro', 1); } catch (e) { fail(); return; }
      req.onupgradeneeded = function () { if(!req.result.objectStoreNames.contains('slots'))req.result.createObjectStore('slots'); };
      req.onsuccess = function () {
        if(settled){req.result.close();return;}
        settled=true;db=req.result;const opened=db;
        opened.onversionchange=opened.onclose=function(){closeDB(opened);};
        resolve(db);
      };
      req.onerror = req.onblocked = fail;
    }).finally(function(){opening=null;});
    return opening;
  }
  function idbOp(mode, fn, retry = true) {
    return openDB().then(function (d) {
      if (!d) throw unavailableDB();
      return new Promise(function (resolve, reject) {
        const tx = d.transaction('slots', mode);
        const st = tx.objectStore('slots');
        let result;
        const r = fn(st);
        if (r) r.onsuccess = function () { result = r.result; };
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB 写入失败')); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB 事务中止')); };
      }).catch(function (e) {
        // 关闭中的连接不能再创建事务；异常关闭也可能先中止事务，再派发 close。
        // 本层只有按键 put/get/delete，重新执行同一次操作不会重复创建存档槽位。
        if (!e || (e.name !== 'InvalidStateError' && e.name !== 'AbortError')) throw e;
        closeDB(d);
        if (retry) return idbOp(mode, fn, false);
        throw unavailableDB();
      });
    });
  }
  const store = {
    put: function (key, str) {
      return idbOp('readwrite', function (st) { return st.put(str, key); }).then(function () { return 'idb'; })
        .catch(function (e) { if (!e.idbUnavailable) throw e; localStorage.setItem(key, str); return 'ls'; });
    },
    get: function (key, where) {
      if (where === 'ls') return Promise.resolve(localStorage.getItem(key));
      return idbOp('readonly', function (st) { return st.get(key); })
        .then(function (v) { return v != null ? v : localStorage.getItem(key); }, function (e) {
          const fallback = localStorage.getItem(key);
          // 已知在 IDB 中的存档不能因暂时断连就被误报为「数据丢失」。
          if (fallback == null && where === 'idb') throw e;
          return fallback;
        });
    },
    del: function (key, where) {
      try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
      if (where === 'ls') return Promise.resolve();
      return idbOp('readwrite', function (st) { return st.delete(key); }).catch(function () { /* ignore */ });
    },
  };

  function emptyIndex() { return { games: {}, slots: {} }; }
  function readIndex(strict) {
    try {
      const s = localStorage.getItem(IDX);
      if (!s) return emptyIndex();
      const o = JSON.parse(s);
      const object=function(v){return v&&typeof v==='object'&&!Array.isArray(v);};
      if(!object(o)||!object(o.games)||!object(o.slots)||!Object.values(o.games).every(object)||!Object.values(o.slots).every(object))throw new Error('存档索引格式无效');
      return o;
    } catch (e) { if(strict)throw new Error('存档索引无法读取，已停止改写并保留原数据；请先导出当前进度作为备份。');return emptyIndex(); }
  }
  function writeIndex(idx) { localStorage.setItem(IDX, JSON.stringify(idx)); }
  function errMsg(e) {
    if (!e) return '未知错误';
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) return '浏览器本地存储空间不足（可删除旧存档或导出备份后清理）';
    if (e.name === 'SecurityError') return '浏览器禁止本地存储（隐私模式或站点数据被阻止）';
    return e.message || String(e);
  }

  const Save = {};
  let writeTail = Promise.resolve(), writeSeq = 0, lastSavedAt = 0;
  // 只跟踪仍在排队的保存，操作完成即释放；删除 / 改名先于数据写入开始时同样有效。
  const pendingWrites = new Set();
  function queueWrite(work) {
    const next = writeTail.then(work);
    writeTail = next.then(function () {}, function () {});
    return next;
  }
  function uniqueWriteId() { return U.uid('') + '-' + (++writeSeq).toString(36); }
  // 同一时钟刻度内也按写入顺序排序，确保自动轮换及「最近存档」正确。
  function savedAt(requested) { lastSavedAt = Math.max(Date.now(), requested || 0, lastSavedAt + 1); return lastSavedAt; }
  Save.init = function () { return openDB(); };
  Save.backend = function () { return db ? 'IndexedDB' : 'localStorage'; };
  Save.available = function () {
    try { const k = P + '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  };
  Save.envelope = function (game) {
    const body = JSON.stringify(game.serialize());
    return { format: CFG.SAVE_FORMAT, version: CFG.SAVE_VERSION, gameVersion: CFG.GAME_VERSION, savedAt: Date.now(), checksum: U.fnv(body), body: body };
  };
  // kind: 'auto' | 'manual'；opts: { slotId（覆盖）, label }。返回 Promise<{ok, error, slotId}>
  Save.save = function (game, kind, opts) {
    opts = Object.assign({}, opts);
    let env, trafficSnapshot, trafficKey;
    try { env = Save.envelope(game); } catch (e) { return Promise.resolve({ ok: false, error: '序列化失败：' + errMsg(e) }); }
    if (CM.TrafficCache) { trafficSnapshot = CM.TrafficCache.capture(game); if (trafficSnapshot) trafficKey = CM.TrafficCache.keyFor(env.body); }
    // 请求时即冻结快照及索引摘要；排队期间时间推进、切图或改名不改写本次快照。
    const snap = { id: game.id, name: game.name, mode: game.mode, map: game.mapId || 'gz', createdAt: game.createdAt,
      date: [game.clock.y, game.clock.m, game.clock.d], stations: game.compiled.stations.length, funds: game.econ.isFree() ? null : game.econ.funds };
    const pending = { gameId: snap.id, slotId: opts.slotId, cancelled: false, name: null };
    pendingWrites.add(pending);
    return queueWrite(function () {
      if (pending.cancelled) return { ok: false, error: '该进度或存档已被删除，本次写入已取消' };
      const idx = readIndex(true); let slotId = opts.slotId;
      if (kind === 'auto') {
        const a1 = idx.slots[snap.id + '.a1'], a2 = idx.slots[snap.id + '.a2'];
        slotId = !a1 ? snap.id + '.a1' : (!a2 ? snap.id + '.a2' : (a1.savedAt <= a2.savedAt ? snap.id + '.a1' : snap.id + '.a2'));
      } else if (!slotId || !idx.slots[slotId]) {
        const manual = Object.values(idx.slots).filter(function (s) { return s.gameId === snap.id && s.kind === 'manual'; });
        if (manual.length >= CFG.saves.maxManual) return { ok: false, error: '该进度的手动存档已达上限（' + CFG.saves.maxManual + ' 个），请覆盖或删除旧存档' };
        slotId = snap.id + '.m' + uniqueWriteId();
      }
      const old = idx.slots[slotId];
      pending.slotId = slotId;
      if (old && old.gameId !== snap.id) return { ok: false, error: '不能覆盖其他进度的存档' };
      const key = P + 'slot.' + slotId + '.' + uniqueWriteId();
      env.savedAt = savedAt(env.savedAt); const str = JSON.stringify(env);
      const meta = { slotId: slotId, key: key, gameId: snap.id, kind: kind, label: opts.label || (kind === 'auto' ? '自动存档' : '手动存档'),
        date: snap.date, savedAt: env.savedAt, size: str.length, mode: snap.mode, name: snap.name, map: snap.map, stations: snap.stations, funds: snap.funds };
      // 写入串行化，使额度、轮换和覆盖均依据上一次已提交的索引；失败不覆盖旧数据。
      return store.put(key, str).then(function (where) {
        return store.get(key, where).then(function (back) {
          if (back !== str) { store.del(key, where); return { ok: false, error: '写入后校验失败' }; }
          let idx2; try { idx2 = readIndex(true); } catch (e) { store.del(key, where); throw e; }
          // 写入期间删除或改名，不能由迟到的保存回写旧索引。
          if (pending.cancelled || (idx.games[snap.id] && !idx2.games[snap.id]) || (old && !idx2.slots[slotId])) {
            store.del(key, where); return { ok: false, error: '该进度或存档已被删除，本次写入已取消' };
          }
          const name = pending.name !== null ? pending.name : (idx.games[snap.id] && idx2.games[snap.id] && idx.games[snap.id].name !== idx2.games[snap.id].name ? idx2.games[snap.id].name : snap.name);
          idx2.games[snap.id] = { gameId: snap.id, name: name, mode: snap.mode, map: snap.map, createdAt: snap.createdAt, updatedAt: env.savedAt };
          meta.name = name;
          meta.store = where; idx2.slots[slotId] = meta;
          try { writeIndex(idx2); }
          catch (e) { store.del(key, where); return { ok: false, error: errMsg(e) }; }
          if (old && old.key && old.key !== key) store.del(old.key, old.store);
          return { ok: true, slotId: slotId, savedAt: env.savedAt, size: str.length };
        });
      });
    }).then(async function (result) {
      if (trafficSnapshot) { if (result.ok) CM.TrafficCache.put(await trafficKey, trafficSnapshot); else CM.TrafficCache.discard(trafficSnapshot); }
      return result;
    }).catch(function (e) { if (trafficSnapshot) CM.TrafficCache.discard(trafficSnapshot); return { ok: false, error: errMsg(e) }; }).finally(function () { pendingWrites.delete(pending); });
  };
  // mapId：只列出该地图的进度（不传则列出全部）
  Save.list = function (mapId) {
    const idx = readIndex();
    const grouped = new Map();
    for (const slot of Object.values(idx.slots)) { let a = grouped.get(slot.gameId); if (!a) grouped.set(slot.gameId, a = []); a.push(slot); }
    const games = Object.values(idx.games).filter(function (g) { return !mapId || (g.map || 'gz') === mapId; }).map(function (g) {
      const slots = (grouped.get(g.gameId) || []).sort(function (a, b) { return b.savedAt - a.savedAt; });
      return Object.assign({}, g, { slots: slots, latest: slots[0] ? slots[0].savedAt : 0 });
    }).filter(function (g) { return g.slots.length; });
    games.sort(function (a, b) { return b.latest - a.latest; });
    return games;
  };
  Save.latest = function (mapId) {
    const g = Save.list(mapId)[0];
    return g ? g.slots[0] : null;
  };
  Save.slotInfo = function (slotId) {
    return readIndex().slots[slotId] || null;
  };
  Save.parseEnvelope = function (text) {
    let env;
    try { env = JSON.parse(text); } catch (e) { throw new Error('文件不是有效的存档（JSON 解析失败）'); }
    if (!env || env.format !== CFG.SAVE_FORMAT) throw new Error('文件格式不正确：不是《城市与地铁》存档');
    if (typeof env.version !== 'number' || env.version > CFG.SAVE_VERSION) throw new Error('存档版本（' + env.version + '）高于当前游戏支持的版本（' + CFG.SAVE_VERSION + '），无法导入');
    if (env.version < CFG.SAVE_MIN_VERSION) throw new Error('该存档来自 1.0 版（旧示意地图）。1.1 版起改用真实的广州地理，旧存档的城市数据无法对应，请开始新游戏。');
    if (typeof env.body !== 'string' || U.fnv(env.body) !== env.checksum) throw new Error('存档校验失败：文件可能已损坏或被修改');
    let payload;
    try { payload = JSON.parse(env.body); } catch (e) { throw new Error('存档内容损坏'); }
    if (payload && payload.rulesRevision != null && (!Number.isSafeInteger(payload.rulesRevision) || payload.rulesRevision < 0 || payload.rulesRevision > (CFG.RULES_REVISION || 0))) throw new Error('存档使用了当前游戏尚不支持的经营与建设规则，请使用对应版本载入');
    const ok = payload && payload.meta && payload.clock && payload.city && payload.net && payload.econ && payload.tasks;
    if (!ok) throw new Error('存档缺少必要数据');
    // 存档所属地图（1.4 版之前的存档都是广州）：按该地图的网格尺寸校验
    const mp = CM.MAPS && CM.MAPS[payload.meta.map || 'gz'];
    if (!mp) throw new Error('存档使用的地图「' + payload.meta.map + '」在当前版本中不存在');
    // 地图数据版本：缺省为 1（1.4 版及更早的广州 / 青湾存档）。存档版本高于当前地图数据时拒绝载入；
    // 低于当前版本时按地图登记的迁移函数处理（迁移只作用于解析出的副本，失败时原存档不受影响）
    const mv = payload.meta.mapVersion || 1;
    if (mv > mp.mapVersion) throw new Error('存档使用的「' + mp.name + '」地图数据为第 ' + mv + ' 版，当前游戏使用第 ' + mp.mapVersion + ' 版，暂不兼容。请使用支持第 ' + mv + ' 版地图的游戏载入，或导出原存档进行兼容检查；刷新当前游戏不能保证解决。');
    if (mv < (mp.minVersion || 1)) throw new Error('存档的「' + mp.name + '」地图数据版本（第 ' + mv + ' 版）过旧，当前版本无法兼容');
    if (mv < mp.mapVersion) {
      if (!mp.migrate) throw new Error('「' + mp.name + '」地图数据已从第 ' + mv + ' 版更新到第 ' + mp.mapVersion + ' 版，且没有可用的迁移方法');
      try { mp.migrate(payload, mv); payload.meta.mapVersion = mp.mapVersion; } catch (e) { throw new Error('存档迁移失败（' + (e && e.message || e) + '），原存档未改动'); }
      payload.__mapMigratedFrom = mv;   // 载入时先为原存档建立「升级前备份」（见 Save.load）
    }
    for (const k of ['pop', 'jobs', 'bh', 'taken', 'lu', 'street', 'urbanYear']) {
      const a = payload.city[k];
      if (!a || !a.b || a.n !== mp.cfg.W * mp.cfg.H) throw new Error('城市数据不完整或尺寸不符');
    }
    return { env: env, payload: payload };
  };
  function readSlotText(slotId) {
    const meta = readIndex().slots[slotId];
    if (!meta) return Promise.reject(new Error('存档不存在'));
    return store.get(meta.key, meta.store).then(function (text) {
      if (!text) throw new Error('存档数据丢失（浏览器数据可能已被清理）');
      return { meta: meta, text: text };
    });
  }
  // 对岸城市的只读线网预览；沿用网页存储重连与迁移校验。
  const previews = new Map();
  Save.linePreview = function (slotId) {
    const meta = Save.slotInfo(slotId);
    if (!meta) return Promise.reject(new Error('存档不存在'));
    if (previews.has(meta.key)) return Promise.resolve(previews.get(meta.key));
    return readSlotText(slotId).then(function (r) {
      const pl = Save.parseEnvelope(r.text).payload, net = pl.net, q = function (v) { return Math.round(v * 10) / 10; };
      const out = { segs: [], st: [], lines: Object.keys(net.lines || {}).length, stations: Object.keys(net.stations || {}).length, clock: pl.clock ? [pl.clock.y, pl.clock.m] : null };
      for (const id in net.segments) {
        const s = net.segments[id], a = net.stations[s.a], b = net.stations[s.b], L = net.lines[s.line]; if (!a || !b) continue;
        const pts = [q(a.x), q(a.y)]; for (const p of s.pts || []) pts.push(q(p[0]), q(p[1])); pts.push(q(b.x), q(b.y));
        out.segs.push([L && L.color || '#8a94a6', s.type || 'underground', pts]);
      }
      for (const id in net.stations) { const s = net.stations[id]; out.st.push(q(s.x), q(s.y)); }
      if (previews.size > 24) previews.clear();
      previews.set(r.meta.key, out);
      return out;
    });
  };
  // 进度重命名保存在索引中，不重写每个历史快照；读取与导出时将最新名称应用到副本。
  function parseSlot(r) {
    const parsed = Save.parseEnvelope(r.text);
    if (typeof r.meta.name === 'string' && parsed.payload.meta.name !== r.meta.name) {
      parsed.payload.meta.name = r.meta.name;
      parsed.env.body = JSON.stringify(parsed.payload);
      parsed.env.checksum = U.fnv(parsed.env.body);
    }
    return parsed;
  }
  // 载入：旧交通模型的存档（v1.8 及更早）或旧地图版本的存档（地图范围扩展前）在升级前先把原始存档另存为「升级前备份」
  // （只建一次，不计入手动存档上限），备份失败时仍可载入，但不自动保存升级后的进度（见 main.js），原存档不受影响
  Save.load = function (slotId) {
    return readSlotText(slotId).then(function (r) {
      const parsed = parseSlot(r), p = parsed.payload;
      const tv = (p.traffic && p.traffic.v) || 1;
      const mp = CM.MAPS[p.meta.map || 'gz'];
      const terrainUpgrade = (p.city.terrainRevision || 1) < (mp.data.terrainRevision || 1);
      const displayUpgrade = (p.city.displayRevision || 1) < (mp.data.displayRevision || 1);
      const rulesUpgrade = (p.rulesRevision || 0) < (CFG.RULES_REVISION || 0);
      if (tv >= (CFG.TRAFFIC_MODEL || 1) && !rulesUpgrade && !p.__mapMigratedFrom && !terrainUpgrade && !displayUpgrade) {
        if (!CM.TrafficCache) return p;
        return CM.TrafficCache.keyFor(parsed.env.body).then(async function (key) {
          Object.defineProperty(p, '__trafficKey', { value: key });
          Object.defineProperty(p, '__trafficState', { value: await CM.TrafficCache.get(key) });
          return p;
        });
      }
      if (r.meta.kind === 'backup') return p;
      return Save.backupBeforeUpgrade(r, p).then(function (res) {
        if (res.ok) p.__backupSlot = res.slotId; else p.__backupFailed = res.error || '未知错误';
        return p;
      });
    });
  };
  Save.backupBeforeUpgrade = function (r, payload) {
    let env = null; try { env = Save.parseEnvelope(r.text).env; } catch (e) { return Promise.resolve({ ok: false, error: '原存档校验失败：' + errMsg(e) }); }
    const meta = r.meta, from = (payload.meta && payload.meta.gameVersion) || env.gameVersion || '1.8.0';
    const slotId = meta.gameId + '.bk' + String(env.savedAt || meta.savedAt || 0);
    return queueWrite(async function () {
      const idx = readIndex(true);
      const old = idx.slots[slotId];
      if (old && old.kind === 'backup' && old.gameId === meta.gameId && old.key !== meta.key) {
        try {
          const cached = Save.parseEnvelope(await store.get(old.key, old.store));
          // 索引存在不代表备份有效；确认格式、校验和及原始快照一致后，才允许跳过备份。
          if (cached.env.body === env.body) return { ok: true, slotId: slotId, existed: true };
        } catch (e) { /* 损坏或丢失的备份从已校验的原存档重建 */ }
      }
      const key = P + 'slot.' + slotId + '.' + uniqueWriteId(), text = r.text;
      return store.put(key, text).then(function (where) {
        return store.get(key, where).then(function (back) {
          if (back !== text) { store.del(key, where); return { ok: false, error: '备份写入后校验失败' }; }
          let idx2; try { idx2 = readIndex(true); } catch (e) { store.del(key, where); throw e; }
          if (!idx2.games[meta.gameId] || !idx2.slots[meta.slotId]) { store.del(key, where); return { ok: false, error: '原存档已被删除，备份已取消' }; }
          idx2.slots[slotId] = Object.assign({}, meta, { slotId: slotId, key: key, store: where, kind: 'backup', label: '升级前备份（v' + from + '）', savedAt: meta.savedAt, size: text.length });
          if (!idx2.games[meta.gameId]) idx2.games[meta.gameId] = { gameId: meta.gameId, name: meta.name, mode: meta.mode, map: meta.map, createdAt: payload.meta.createdAt, updatedAt: meta.savedAt };
          try { writeIndex(idx2); } catch (e) { store.del(key, where); return { ok: false, error: errMsg(e) }; }
          // 新副本及索引提交后才清理旧备份；不删除原档或其他槽仍引用的数据。
          if (old && old.kind === 'backup' && old.gameId === meta.gameId && old.key !== meta.key && old.key !== key && !Object.values(idx2.slots).some(function (s) { return s.key === old.key; })) store.del(old.key, old.store);
          return { ok: true, slotId: slotId, repaired: !!old };
        });
      });
    }).catch(function (e) { return { ok: false, error: errMsg(e) }; });
  };
  Save.remove = function (slotId) {
    const idx = readIndex(true);
    const meta = idx.slots[slotId];
    if (!meta) return;
    delete idx.slots[slotId];
    if (!Object.values(idx.slots).some(function (s) { return s.gameId === meta.gameId; })) delete idx.games[meta.gameId];
    writeIndex(idx);
    for (const pending of pendingWrites) if (pending.slotId === slotId || (!idx.games[meta.gameId] && pending.gameId === meta.gameId)) pending.cancelled = true;
    store.del(meta.key, meta.store);
  };
  Save.removeGame = function (gameId) {
    const idx = readIndex(true), removed=[];
    for (const s of Object.values(idx.slots)) if (s.gameId === gameId) { delete idx.slots[s.slotId]; removed.push(s); }
    delete idx.games[gameId];
    writeIndex(idx);
    for (const pending of pendingWrites) if (pending.gameId === gameId) pending.cancelled = true;
    for(const s of removed)store.del(s.key,s.store);
  };
  Save.rename = function (gameId, name) {
    const idx = readIndex(true);
    if (!idx.games[gameId]) return;
    idx.games[gameId].name = name;
    for (const s of Object.values(idx.slots)) if (s.gameId === gameId) s.name = name;
    writeIndex(idx);
    for (const pending of pendingWrites) if (pending.gameId === gameId) pending.name = name;
  };
  Save.fileName = function (meta) {
    const d = meta.date || [0, 0];
    return '城市与地铁_' + (meta.name || '存档').replace(/[\\/:*?"<>|]/g, '_') + '_' + d[0] + '年' + d[1] + '月.cmsave.json';
  };
  Save.download = function (text, filename) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  };
  Save.exportSlot = function (slotId) {
    return readSlotText(slotId).then(function (r) {
      let text = r.text, raw = false;
      // 导出是救援入口：地图 / 格式不兼容或校验失败时仍能取出原始文本，不迁移、不改写存储。
      // 可正常读取的存档沿用最新进度名称；其他存档逐字导出，不表示其已经可载入。
      try { text = JSON.stringify(parseSlot(r).env); } catch (e) { raw = true; }
      Save.download(text, Save.fileName(r.meta));
      return { raw: raw };
    });
  };
  Save.exportGame = function (game) {
    const env = Save.envelope(game);
    Save.download(JSON.stringify(env), Save.fileName({ name: game.name, date: [game.clock.y, game.clock.m] }));
  };
  // 导入：校验通过后作为新的手动存档保存，不覆盖已有进度。返回 Promise
  Save.importText = function (text) {
    let r;
    try { r = Save.parseEnvelope(text); } catch (e) { return Promise.reject(e); }
    return queueWrite(function () {
      const idx = readIndex(true);
      const p = r.payload;
      delete p.__mapMigratedFrom;   // 导入即为新副本（原文件仍在玩家手中），不再另建升级前备份；迁移结果随副本保存
      if (p.mapUpgrade) p.mapUpgrade.imported = true;
      let gameId = p.meta.gameId, name = p.meta.name;
      if (idx.games[gameId]) { gameId = U.uid('g'); name = name + '（导入）'; p.meta.gameId = gameId; p.meta.name = name; }
      const body = JSON.stringify(p);
      const env = { format: CFG.SAVE_FORMAT, version: CFG.SAVE_VERSION, gameVersion: CFG.GAME_VERSION, savedAt: savedAt(), checksum: U.fnv(body), body: body };
      const str = JSON.stringify(env);
      const slotId = gameId + '.m' + uniqueWriteId();
      const key = P + 'slot.' + slotId + '.' + uniqueWriteId();
      return store.put(key, str).then(function (where) {
        let idx2; try { idx2 = readIndex(true); } catch (e) { store.del(key, where); throw e; }
        idx2.games[gameId] = { gameId: gameId, name: name, mode: p.meta.mode, map: p.meta.map || 'gz', createdAt: p.meta.createdAt, updatedAt: env.savedAt };
        idx2.slots[slotId] = { slotId: slotId, key: key, store: where, gameId: gameId, kind: 'manual', label: '导入的存档', date: [p.clock.y, p.clock.m, p.clock.d], savedAt: env.savedAt, size: str.length, mode: p.meta.mode, map: p.meta.map || 'gz', name: name, stations: Object.keys(p.net.stations || {}).length, funds: p.econ.mode === 'free' ? null : p.econ.funds };
        try { writeIndex(idx2); } catch (e) { store.del(key, where); throw new Error(errMsg(e)); }
        return { slotId: slotId, gameId: gameId, name: name, map: p.meta.map || 'gz' };
      }, function (e) { throw new Error(errMsg(e)); });
    });
  };
  Save.usage = function () {
    let n = 0;
    for (const s of Object.values(readIndex().slots)) n += s.size || 0;
    return n;
  };
  CM.Save = Save;
})(window.CM);
