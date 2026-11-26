async function runSettlementRecoveryChecks({ E, until, close, tap }) {
  const js = fn => E('(' + fn.toString() + ')()');
  const expect = (ok, message) => { if (!ok) throw Error(message); };
  const idle = '!CM.game.jumping && !CM.game.pending';
  await close();
  const start = await js(() => {
    const g = CM.game;
    window.settlementFixture = { game: g, month: g.monthGen, day: g.endDay, errors: console.error };
    console.error = (...args) => {
      if (!args.some(arg => /Test settlement|游戏事件处理失败：month/.test(String(arg)))) window.settlementFixture.errors(...args);
    };
    const snapshot = window.settlementFixture;
    let dailyFault = true, monthlyFault = true;
    const y = g.clock.y + (g.clock.m === 12 ? 1 : 0), m = g.clock.m % 12 + 1;
    g.econ.bonds.push({ id: 'B-test', kind: 'local', amount: 100, rate: 0.1, term: 1, issued: [y - 1, m],
      ym0: CM.U.ymIndex(y - 1, m), paidYears: 0 });
    g.endDay = function () {
      const value = snapshot.day.call(this);
      if (!value && dailyFault) { dailyFault = false; throw Error('Test settlement day after charging'); }
      return value;
    };
    g.monthGen = function* () {
      const result = yield* snapshot.month.call(this);
      if (monthlyFault) { monthlyFault = false; throw Error('Test settlement month after grants and debts'); }
      return result;
    };
    g.on('month', () => { throw Error('Test settlement UI subscriber'); });
    g.on('month', () => { snapshot.months = (snapshot.months || 0) + 1; });
    g.on('jumpDone', () => { snapshot.completed = (snapshot.completed || 0) + 1; });
    return { ym: g.ym(), day: g.clock.d, ledger: g.econ.ledger.length };
  });

  await E('CM.ui.toggleTimeOptions("jump",true);true');
  await tap('[data-act="jumpQuarter"]');
  await until(idle, 300000);
  const recovered = await js(() => {
    const g = CM.game, state = window.settlementFixture;
    const rows = g.econ.ledger.slice(-3);
    return { sameGame: g === state.game, error: !!g.settlementError, ym: g.ym(), day: g.clock.d, ledger: g.econ.ledger.length,
      months: state.months, completed: state.completed,
      validRows: rows.every(r => r.closed && r.grant > 0 && r.days === CM.U.daysInMonth(r.y, r.m) &&
        r.wdDays + r.weDays === r.days) && g.econ.cur.grant > 0,
      paidOnce: rows[1]?.interest === 10 && rows[1]?.principal === 100 &&
        rows.reduce((n, r) => n + r.principal, 0) === 100 && g.econ.bonds.find(b => b.id === 'B-test')?.paidYears === 1 };
  });
  expect(recovered.sameGame && !recovered.error && recovered.ym === start.ym + 3 && recovered.day === start.day &&
    recovered.ledger === start.ledger + 3 && recovered.months === 3 && recovered.completed === 1 && recovered.validRows && recovered.paidOnce,
    'Transient faults should retry exactly once without losing or duplicating a billing day: ' + JSON.stringify(recovered));
  await close();

  const faultStart = await js(() => {
    const g = CM.game, fixture = window.settlementFixture;
    g.endDay = fixture.day;
    g.edit(net => { const line = Object.values(net.lines)[0]; if (line) line.name += ' draft'; });
    fixture.draft = g.draft;
    fixture.writesBlocked = 0;
    fixture.population = g.city.pop[0];
    g.monthGen = function* () {
      this.econ.openMonth(this.clock.y, this.clock.m);
      this.econ.income('reward', 1234);
      this.city.pop[0] += 123456;
      this.logEvent({ tag: '测试', title: 'Test settlement partial' });
      try { this.serialize(); } catch { fixture.writesBlocked++; }
      yield;
      throw Error('Test settlement persistent');
    };
    return { started: g.startJump(3), ym: g.ym(), day: g.clock.d, ledger: g.econ.ledger.length };
  });
  expect(faultStart.started, 'Unable to start fault fixture');
  await until(idle + ' && !!CM.game.settlementError', 300000);
  const rolledBack = await js(async () => {
    const g = CM.game, fixture = window.settlementFixture;
    const dialog = document.querySelector('#screen').textContent;
    CM.Settings.set('language', 'en'); CM.ui.showSettlementError();
    const en = document.querySelector('#screen').textContent;
    CM.Settings.set('language', 'zh-TW'); CM.ui.showSettlementError();
    const tw = document.querySelector('#screen').textContent;
    CM.Settings.set('language', 'zh-CN'); CM.ui.showSettlementError();
    const [direct, manual, auto] = await Promise.all([CM.Save.save(g, 'manual'), CM.ui.manualSave(), CM.ui.doAutosave(true)]);
    const saved = direct.ok ? await CM.Save.load(direct.slotId) : null;
    return { ym: g.ym(), day: g.clock.d, monthEnd: CM.U.daysInMonth(g.clock.y, g.clock.m), ledger: g.econ.ledger.length,
      safe: !g.econ.cur.closed && g.econ.cur.days === g.clock.d - 1 && !g.events.some(e => e.title === 'Test settlement partial') &&
        g.city.pop[0] === fixture.population && g.draft === fixture.draft,
      writesBlocked: fixture.writesBlocked, saves: [direct.ok, manual.ok, auto.ok],
      persisted: saved?.clock.d === g.clock.d && saved.econ.funds === g.econ.funds && saved.econ.cur.days === g.econ.cur.days,
      localized: dialog.includes('当前进度已保留') && en.includes('Your progress is intact') &&
        (tw.includes('目前進度已保留') || tw.includes('當前進度已保留')) };
  });
  expect(rolledBack.ym === faultStart.ym && rolledBack.day === rolledBack.monthEnd && rolledBack.ledger === faultStart.ledger &&
    rolledBack.safe && rolledBack.writesBlocked === 2 && rolledBack.saves.every(Boolean) && rolledBack.persisted && rolledBack.localized,
    'Persistent faults must restore a saveable state and preserve the draft: ' + JSON.stringify(rolledBack));
  await js(() => { CM.game.monthGen = window.settlementFixture.month; return true; });
  await tap('#screen .modal-actions button.primary');
  await until(idle, 300000);
  const retried = await js(() => {
    const g = CM.game, fixture = window.settlementFixture;
    console.error = fixture.errors;
    return { ym: g.ym(), day: g.clock.d, ledger: g.econ.ledger.length, error: !!g.settlementError, completed: fixture.completed };
  });
  expect(retried.ym === faultStart.ym + 3 && retried.day === faultStart.day && retried.ledger === faultStart.ledger + 3 &&
    !retried.error && retried.completed === 2, 'Retry must finish at the original destination: ' + JSON.stringify(retried));
  await close();
  console.log('PASS daily and monthly retry, UI fault isolation, three-language recovery, IndexedDB saves and original jump target');
  return { recovered, rolledBack, retried };
}

// Real game, UI controls and IndexedDB in the launcher's isolated profile.
export async function runSettlementChecks({ E, until, fs, path, task, close, tap }) {
  const map = process.env.CM_SETTLEMENT_MAP || 'bj';
  const gameReady = '!CM.isLoading() && CM.game?.mapId === ' + JSON.stringify(map) + ' && !CM.game.pending';
  const settled = '!CM.game.jumping && !CM.game.pending';
  const js = fn => E('(' + fn.toString() + ')()');
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const report = { map, jumps: [] };
  if (map !== 'bj') {
    await E('CM.newGame({map:' + JSON.stringify(map) + ',mode:"challenge",seed:19900101});true');
    await until(gameReady, 180000);
  }
  await close();
  await js(() => {
    const g = CM.game;
    g.setSpeed(0);
    if (g.compiled.routes.length) return true;
    const M = CM.Metro, c = g.city, cam = CM.curMap().cam;
    for (let y = Math.max(4, Math.round(cam.cy) - 24); y < Math.min(c.H - 4, cam.cy + 24); y += 2) {
      for (let x = Math.max(4, Math.round(cam.cx) - 24); x < Math.min(c.W - 15, cam.cx + 24); x += 2) {
        if ([0, 4, 8].some(dx => !M.checkSite(c, x + dx, y, 'underground').ok)) continue;
        const net = M.empty(), line = M.newLine(net);
        const ids = [0, 4, 8].map(dx => M.addStation(net, x + dx, y, { size: 'M', type: 'underground' }, c));
        for (let i = 1; i < ids.length; i++) M.addSegment(net, line, ids[i - 1], ids[i], [], 'underground');
        if (M.evaluate(net, g.net, c, g.clock.y).conflicts.length) continue;
        g.edit(draft => Object.assign(draft, net));
        const result = g.confirmDraft();
        if (result.ok) return true;
        g.cancelDraft();
      }
    }
    throw Error('No affordable operating line for the settlement fixture');
  });
  await until('CM.game.model.trafficReady()', 180000);

  if (process.env.CM_EXPANSION_SAVE_ONLY) {
    const old = await js(async () => {
      const g = CM.game, map = CM.curMap(), spec = map.extent.find(step => step.from === map.mapVersion - 1);
      const { dx, dy, oldW, oldH } = spec;
      const save = structuredClone(g.serialize()), expected = Object.values(save.net.stations).map(({ id, name, x, y }) => ({ id, name, x, y }));
      if (!expected.length) throw Error('The extent fixture needs an operating line');
      const keys = ['pop', 'jobs', 'bh', 'taken', 'lu', 'street', 'urbanYear'];
      for (const key of keys) {
        const array = CM.U.unpackTyped(save.city[key]), crop = new array.constructor(oldW * oldH);
        for (let y = 0; y < oldH; y++) {
          const i = (y + dy) * g.city.W + dx;
          crop.set(array.subarray(i, i + oldW), y * oldW);
        }
        save.city[key] = CM.U.packTyped(crop, save.city[key].t);
      }
      for (const station of Object.values(save.net.stations)) {
        station.x -= dx; station.y -= dy;
        if (station.site) station.site = [station.site[0] - dx, station.site[1] - dy];
      }
      for (const segment of Object.values(save.net.segments)) {
        segment.pts = segment.pts.map(([x, y]) => [x - dx, y - dy]);
      }
      delete save.city.grownRoads;
      save.meta = { ...save.meta, mapVersion: spec.from };
      save.rulesRevision = 21;
      const body = JSON.stringify(save);
      const imported = await CM.Save.importText(JSON.stringify({
        body, checksum: CM.U.fnv(body), format: CM.CFG.SAVE_FORMAT, version: CM.CFG.SAVE_VERSION,
      }));
      if (!imported.slotId) throw Error('The migrated save was not imported');
      const payload = await CM.Save.load(imported.slotId);
      if (payload.meta.mapVersion !== map.mapVersion || !payload.city.fillNew) throw Error('No expansion on import');
      window.beforeExtentReload = g;
      CM.loadGame(payload);
      return { expected, w: map.cfg.W, h: map.cfg.H, ym: g.ym(), funds: g.econ.funds };
    });
    await until(gameReady + ' && CM.game !== window.beforeExtentReload', 180000);
    const actual = await js(() => {
      const g = CM.game, c = g.city;
      return { w: c.W, h: c.H, ym: g.ym(), funds: g.econ.funds, stations: Object.values(g.net.stations).map(({ id, name, x, y }) => ({ id, name, x, y })) };
    });
    check(actual.w === old.w && actual.h === old.h && actual.ym === old.ym && actual.funds === old.funds, 'Map migration changed date, funds or new bounds');
    check(actual.stations.length === old.expected.length && old.expected.every((s, i) => {
      const a = actual.stations[i];
      return s.id === a.id && s.name === a.name && Math.abs(s.x - a.x) < 1e-9 && Math.abs(s.y - a.y) < 1e-9;
    }), 'Map migration changed station identity or geographical position');
    await close();
    check(await E('CM.game.startJump(3)'), 'Quarterly jump after expansion did not start');
    await until(settled, 180000);
    check(await E('!CM.game.settlementError && CM.game.ym() === ' + (old.ym + 3)), 'Quarterly jump after expansion did not complete');
    console.log('PASS mobile expansion import', map, actual.w, actual.h, 'coordinates and funds preserved, quarter settled');
    await fs.writeFile(path.join(task, 'report.json'), JSON.stringify({ map, ...actual }));
    return;
  }

  if (process.env.CM_SETTLEMENT_RECOVERY_ONLY) {
    report.recovery = await runSettlementRecoveryChecks({ E, until, close, tap });
    await fs.writeFile(path.join(task, 'report.json'), JSON.stringify(report));
    return;
  }

  const advance = async (months, click = false) => {
    const from = await E('CM.game.ym()');
    if (click) {
      await E('CM.ui.toggleTimeOptions("jump",true);true');
      await tap(months === 3 ? '[data-act="jumpQuarter"]' : '[data-act="jumpYear"]');
    } else check(await E('CM.game.startJump(' + months + ')'), 'Advance did not start');
    await until(settled, 300000);
    const data = await js(() => {
      const g = CM.game;
      return { ym: g.ym(), error: g.settlementError?.stack || null, failed: g.econ.failed, ledger: g.econ.ledger.length };
    });
    check(!data.error && !data.failed && data.ym - from === months, 'Advance did not complete: ' + JSON.stringify(data));
    report.jumps.push({ months, ym: data.ym, ledger: data.ledger });
    console.log('PASS advance', map, months, 'months, ledger', data.ledger);
    await close();
  };
  for (const months of [12, 12, 6]) await advance(months);

  const save = await js(async () => {
    const g = CM.game;
    const r = await CM.Save.save(g, 'manual');
    window.settlementBeforeReload = g;
    return { ok: r.ok, slotId: r.slotId, ym: g.ym(), funds: g.econ.funds };
  });
  check(save.ok, '30-month save could not be written');
  await E('CM.ui.markUnsaved();CM.ui.loadSlot(' + JSON.stringify(save.slotId) + ');true');
  await until('!!document.querySelector("#screen .modal-actions .danger")');
  await tap('#screen .modal-actions button:not(.danger)');
  check(await E('CM.game===window.settlementBeforeReload&&!CM.isLoading()'), 'Cancel must keep the current game');
  await E('CM.ui.loadSlot(' + JSON.stringify(save.slotId) + ');true');
  await until('!!document.querySelector("#screen .modal-actions .danger")');
  await tap('#screen .modal-actions .danger');
  await until(gameReady + ' && CM.game !== window.settlementBeforeReload', 180000);
  check(await E('CM.game.ym()===' + save.ym + ' && CM.game.econ.funds===' + save.funds), 'The first restore changed saved time or money');
  await close();

  if (process.env.CM_SETTLEMENT_FLEET_REGRESSION) {
    const ledgerLength = await js(() => {
      const g = CM.game, F = CM.Fleet;
      g.fleet.autoAlloc = g.fleet.autoBuy = true;
      const sale = F.sell(g, g.fleet.trains.map(train => train.id));
      if (!sale.ok) throw Error('Could not remove the fixture fleet');
      return g.econ.ledger.length;
    });
    await until('CM.game.model.trafficReady()', 180000);
    check(await E('CM.Fleet.allocPlan(CM.game).unmet > 0'), 'Fleet shortage did not reach the purchase branch');
    await advance(3, true);
    await advance(12, true);
    const ledger = await E(`(()=>{const g=CM.game, rows=g.econ.ledger.slice(${ledgerLength});return {
      count:rows.length, grants:rows.every(r=>r.grant>0 && r.days===CM.U.daysInMonth(r.y,r.m)),
      currentGrant:g.econ.cur.grant, bought:g.fleet.trains.length, purchase:rows.some(r=>r.construction>0),
    }})()`);
    check(ledger.count === 15 && ledger.grants && ledger.currentGrant > 0 && ledger.bought > 0 && ledger.purchase,
      'Fleet shortage stopped the clock or monthly funding: ' + JSON.stringify(ledger));
    console.log('PASS player-facing quarter and year buttons, automatic fleet purchase and 15 grants after loading a 30-month save');
    report.fleetSettlement = ledger;
    await fs.writeFile(path.join(task, 'report.json'), JSON.stringify(report));
    return;
  }

  // Simulate receipt of a real early-month reward and a rebuild just before the year jump.
  await js(() => {
    const g = CM.game, original = CM.Eras.foresightMonth, ym = g.ym() + 1;
    CM.Eras.foresightMonth = function (current, y, m) {
      const results = original(current, y, m);
      if (current.ym() === ym) {
        current.econ.income('reward', 1234.5);
        CM.Eras.foresightMonth = original;
      }
      return results;
    };
    g.model.setNetwork(g.compiled);
    if (g.model.trafficReady()) throw Error('The fixture did not invalidate traffic');
    const originalDay = g.endDay;
    g.endDay = function () {
      if (!this.model.trafficReady()) throw Error('Attempted to bill a day with stale traffic');
      return originalDay.call(this);
    };
    return true;
  });
  await advance(12, true);
  const accounts = await js(() => {
    const C = CM, E = C.game.econ, bad = [];
    for (const [index, r] of E.ledger.entries()) {
      const build = C.Economy.BUILD_KINDS.reduce((sum, key) => sum + (r[key] || 0), 0);
      const costs = build + C.Economy.opsOf(r) + (r.pppOut || 0) + (r.interest || 0) + (r.principal || 0) + (r.penalty || 0);
      const cash = r.start + C.Economy.incomeOf(r) - costs + (r.capexUse || 0);
      if (r.days !== C.U.daysInMonth(r.y, r.m) || r.wdDays + r.weDays !== r.days || !(r.grant > 0) ||
          !Number.isFinite(r.end) || Math.abs(r.end - cash) > 0.00001 ||
          (index > 0 && Math.abs(E.ledger[index - 1].end - r.start) > 0.00001)) bad.push([r.y, r.m, r.days, r.grant, r.end - cash]);
    }
    return { months: E.ledger.length, earlyReward: E.ledger[31]?.reward, lastFare: E.ledger[41]?.fare, bad };
  });
  check(accounts.months === 42 && accounts.earlyReward >= 1234.5 && accounts.lastFare > 0 && !accounts.bad.length,
    'Daily settlement or general funds did not reconcile: ' + JSON.stringify(accounts));
  report.accounts = accounts;

  const totalsMatch = await js(() => {
    const g = CM.game, before = g.snapshotMetrics(), next = g.ym() + 1;
    const from = [g.clock.y, g.clock.m, 1], to = [Math.floor(next / 12), next % 12 + 1, 1];
    const ledger = [{ y: from[0], m: from[1], grant: 100, fare: 20, reward: 3, commerce: 7, ppp: 9, fleetSale: 11,
      ops: 5, todCost: 2, pppOut: 4, opsSub: 30, crossFee: 8, bond: 50 }];
    const finance = CM.Economy.prototype.summarizeAdvance.call({ ledger }, from, to);
    const money = CM.moneyAt(CM.MAPS[g.mapId], to[0], to[1]);
    const formatted = amount => CM.U.fmtMoney(amount, undefined, money);
    try {
      CM.ui.showReport({ from, to, before, after: before, finance, money });
      const financePanel = document.querySelector('.jr-fin2');
      const legend = [...financePanel.querySelectorAll('.jr-flegend span')].map(row => row.textContent);
      return financePanel.querySelector('.jf-v.good').textContent === '+' + formatted(150) &&
        financePanel.querySelector('.jf-v.warn').textContent === '−' + formatted(11) &&
        legend.includes('运营 ' + formatted(7)) && legend.includes('合同 ' + formatted(4)) &&
        legend.includes('债券募集 +' + formatted(50));
    } finally { CM.ui.closeScreen(); }
  });
  check(totalsMatch, 'The jump report omitted or double-counted a financial category');
  console.log('PASS 42 months of daily ledgers, early reward, revenues and jump report');

  report.recovery = await runSettlementRecoveryChecks({ E, until, close, tap });

  await fs.writeFile(path.join(task, 'report.json'), JSON.stringify(report));
}
