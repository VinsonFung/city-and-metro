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
    const g = CM.game, E = g.econ, before = g.snapshotMetrics(), ym = g.ym(), old = E.ledger;
    const next = ym + 1;
    const from = [g.clock.y, g.clock.m, 1], to = [Math.floor(next / 12), next % 12 + 1, 1];
    E.ledger = [{ y: from[0], m: from[1], grant: 100, fare: 20, reward: 3, commerce: 7, ppp: 9, fleetSale: 11,
      ops: 5, todCost: 2, pppOut: 4, opsSub: 30, crossFee: 8, bond: 50 }];
    try {
      CM.ui.showReport({ from, to, before, after: before });
      const rows = new Map([...document.querySelectorAll('.jr-fin>div')].map(row => [row.querySelector('small').textContent, row.querySelector('b').textContent]));
      return rows.get('财政收入') === '+' + CM.U.fmtMoney(150) &&
        rows.get('运营成本') === '−' + CM.U.fmtMoney(7) &&
        rows.get('合同支出') === '−' + CM.U.fmtMoney(4);
    } finally { E.ledger = old; CM.ui.closeScreen(); }
  });
  check(totalsMatch, 'The jump report omitted or double-counted a financial category');
  console.log('PASS 42 months of daily ledgers, early reward, revenues and jump report');

  const interruption = await js(async () => {
    const live = CM.game;
    const last = await CM.Save.save(live, 'manual');
    window.settlementRecoverySlot = last.slotId;
    window.settlementInterruptedGame = live;
    const create = () => {
      const g = Object.assign(new CM.Game(), live);
      g._h = {};
      g.clock = { ...live.clock };
      g.econ = CM.Economy.restore(JSON.parse(JSON.stringify(live.econ.serialize())));
      g.model = Object.assign(Object.create(CM.Model.prototype), live.model);
      return g;
    };
    const inject = function* () {
      this.econ.openMonth(this.clock.y, this.clock.m);
      throw new Error('Injected settlement interruption');
    };
    const old = console.error;
    console.error = error => {
      if (!/Injected settlement interruption|时间推进未到达目标日期/.test(String(error))) old.call(console, error);
    };
    try {
      const normal = create();
      normal.pending = inject.call(normal);
      normal.update(0);
      const premature = create();
      premature.jumpGen = function* () {};
      premature.startJump(12);
      premature.stepJump();
      const loss = create();
      let failures = 0;
      loss.on('jumpDone', function (r) { if (r.failed) failures++; });
      loss.startJump(12);
      loss.econ.failed = { reasons: ['Legitimate game over'] };
      loss.stepJump();
      const start = live.ym();
      let completed = 0;
      live.on('jumpDone', function () { completed++; });
      live.monthGen = inject;
      live.startJump(12);
      while (live.jumping) live.stepJump();
      const [direct, manual, auto] = await Promise.all([CM.Save.save(live, 'manual'), CM.ui.manualSave(), CM.ui.doAutosave(true)]);
      live.setSpeed(1);
      const dialog = document.querySelector('#screen').textContent;
      CM.Settings.set('language', 'en'); CM.ui.showSettlementError();
      const en = document.querySelector('#screen').textContent;
      CM.Settings.set('language', 'zh-TW'); CM.ui.showSettlementError();
      const tw = document.querySelector('#screen').textContent;
      CM.Settings.set('language', 'zh-CN');
      return { normal: !!normal.settlementError, premature: !!premature.settlementError, genuineLoss: failures === 1 && !loss.settlementError,
        stopped: live.ym() - start === 1 && live.speed === 0 && !live.startJump(1), completed, savesBlocked: !direct.ok && !manual.ok && !auto.ok,
        localized: dialog.includes('结算中断') && en.includes('Settlement Interrupted') && tw.includes('結算中斷') };
    } finally { console.error = old; }
  });
  check(interruption.normal && interruption.premature && interruption.genuineLoss && interruption.stopped && !interruption.completed &&
    interruption.savesBlocked && interruption.localized, 'An incomplete settlement could be reported as complete or saved: ' + JSON.stringify(interruption));
  report.interruption = interruption;
  await E('CM.ui.loadSlot(window.settlementRecoverySlot);true');
  await until(gameReady + ' && CM.game !== window.settlementInterruptedGame', 180000);
  check(await E('!CM.game.settlementError && CM.game.econ.ledger.length === 42'), 'The good save could not be recovered');
  await close();
  await advance(1);
  console.log('PASS settlement interruption, genuine failure, three languages, save protection and recovery');

  await fs.writeFile(path.join(task, 'report.json'), JSON.stringify(report));
}
