'use strict';
// Browser map revisions and clipping retained across the shared airport expansion.
(function (CM) {
  for (const id of ['hk', 'tk']) {
    const m = CM.MAPS[id]; m.data.terrainRevision = 2;
    for (const r of m.data.reclaim || []) r.poly = CM.U.clipMapPolygon(r.poly, m.cfg.W, m.cfg.H);
    m.data.reclaim = (m.data.reclaim || []).filter(r => r.poly.length >= 3);
  }
  for (const id of ['hz', 'wh']) CM.MAPS[id].data.displayRevision = 2;
  for (const t of CM.MAPS.hz.data.histTasks || []) if (/亚运/.test(t.title)) t.deadline = [2023, 8];
  CM.MAPS.gz.features[1] = ['map', '更多城区逐步开放', '向同和、京溪、市桥与广州南站方向延伸线路'];
  CM.MAPS.pa.features[1] = ['map', '近郊市镇逐步发展', '连接拉德芳斯与更远的近郊，跟随年代规划新线'];
  CM.MAPS.hk.features[0][2] = '多片新土地按年份成陆，之后才能建站';
  if (CM.MAPS.hk.features[2]) CM.MAPS.hk.features[2][2] = '荃湾、沙田、屯门、元朗等新市镇陆续发展';
  Object.assign(CM.DATA, CM.MAPS[CM.mapId || 'gz'].data);
})(window.CM);
