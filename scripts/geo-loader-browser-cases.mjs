// Use the isolated Edge profile and a local server that can fail individual requests.
export async function runGeoLoadChecks({ E, send, until, fs, path, task, geoFixture, localIndex }) {
  const report = {};
  const requests = city => geoFixture.requests.filter(url => url.pathname === '/js/geo_' + city + '.js');
  const failures = city => geoFixture.faults.set(city, [503, 503]);
  const started = city => '!CM.isLoading() && CM.game?.mapId === ' + JSON.stringify(city) + ' && !CM.game.pending';
  const dialog = 'document.querySelector("#screen .modal-actions .primary")?.textContent === "重试载入"';
  const retry = () => E('document.querySelector("#screen .modal-actions .primary").click(); true');
  const check = (ok, message) => { if (!ok) throw Error(message); };

  await E('CM.Settings.set("language","zh-CN"); CM.game.setSpeed(0); true');
  const beijing = requests('bj');
  check(beijing.length >= 2, 'A failed first Beijing request did not retry');
  check(beijing[0].searchParams.has('v') && !beijing[0].searchParams.has('retry') &&
    beijing[1].searchParams.has('v') && beijing[1].searchParams.has('retry'), 'Retry must bypass the failed cached URL');
  report.beijing = true;

  geoFixture.faults.set('sg', ['stale']);
  const stableReference = await E('(async()=>{const C=CM,id="sg",stub=C.MAPS[id].geo;const p=C.loadGeo(id);if(p!==C.loadGeo(id))throw Error("Duplicate geography request");await p;const ok=C.GEOS[id]===stub&&C.geoReady(id)&&!window.staleGeoExecuted;C.releaseGeo(id);return ok&&!C.geoReady(id)})()');
  check(stableReference && requests('sg').length === 2, 'An unexpected map asset must be rejected before execution and retried');
  report.integrity = true;

  geoFixture.faults.set('wh', ['delay']);
  const timedOut = await E('(async()=>{const C=CM,id="wh",stub=C.MAPS[id].geo,timer=window.setTimeout;let p;try{window.setTimeout=(fn,ms,...args)=>timer(fn,ms===60000?40:ms,...args);p=C.loadGeo(id)}finally{window.setTimeout=timer}await p;await new Promise(r=>setTimeout(r,800));const ok=C.GEOS[id]===stub&&C.geoReady(id);C.releaseGeo(id);return ok&&!C.geoReady(id)})()');
  check(timedOut && requests('wh').length === 2, 'Timed-out map script must not replace the recovered data reference');
  report.timeout = true;

  failures('tk');
  const oldGame = await E('CM.game.id');
  await E('CM.newGame({map:"tk",mode:"free",seed:19500101});true');
  await until(dialog);
  check(requests('tk').length === 2, 'Automatic retries must have a limit');
  check(await E('CM.game.id === ' + JSON.stringify(oldGame) + ' && !CM.game.model.retired && !CM.isLoading()'), 'Loading failure discarded or retired the current game');
  await retry();
  await until(started('tk'), 180000);
  const save = await E('(async()=>{const g=CM.game;g.setSpeed(0);const r=await CM.Save.save(g,"manual");return {ok:r.ok,slotId:r.slotId,id:g.id,funds:g.econ.funds}})()');
  check(save.ok, 'Could not create isolated save');
  report.newGameRetry = true;

  await E('CM.newGame({map:"tutorial",mode:"free",tutorial:true,seed:20000101});true');
  await until(started('tutorial'), 180000);
  await E('CM.game.setSpeed(0);true');
  failures('tk');
  await E('CM.ui.loadSlot(' + JSON.stringify(save.slotId) + ');true');
  await until(dialog);
  check(await E('CM.game.mapId==="tutorial" && !CM.game.model.retired'), 'A failed save load must preserve the current game');
  await retry();
  await until(started('tk'), 180000);
  check(await E('CM.game.id===' + JSON.stringify(save.id) + ' && CM.game.econ.funds===' + save.funds), 'Retry did not restore the original saved progress');
  report.saveRetry = true;

  await send('Page.navigate', { url: localIndex });
  await until('location.protocol==="file:" && !!window.CM?.ui');
  check(await E('(async()=>{const c=CM;const g=c.MAPS.ny.geo;if(c.geoAssetPath(g)!==g.file)return false;await c.loadGeo("ny");return c.geoReady("ny")})()'), 'Opening from a local copy should continue to load map data');
  report.localFile = true;

  await fs.writeFile(path.join(task, 'report.json'), JSON.stringify(report));
  console.log('PASS real 503 recovery, wrong response rejection, timeout, new game and save retry, and file URLs');
}
