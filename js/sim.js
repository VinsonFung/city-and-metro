'use strict';
// 交通模拟：小区与重要设施的分目的出行需求（重力模型）→ 步行接驳与地铁路径 → 汽车/地铁方式选择（Logit）→ 道路分配与拥堵（BPR + 成本线搜索）
// 地铁运力按客流自动调整；所有计算分时段进行，并以时间切片方式运行，保证画面流畅。
// v1.9：出行分为通勤、上学、购物、医疗、旅游休闲与交通枢纽接驳六类；重要设施作为独立的目的地节点（自有位置与步行接驳），
// 普通设施按小区用地汇总；工作日与周末分别求解（两套各 4 个时段），实时交通按当天类型显示，日均指标按 5:2 加权。
(function (CM) {
  const U = CM.U, CFG = CM.CFG;
  const NP = 4;
  const INF = 1e30;
  const PK = ['hw', 'sc', 'sh', 'md', 'lz', 'hb'], NPK = 6;
  const HW = 0, SH = 2, LZ = 4;
  const skimKeys = new WeakMap(); let skimSerial = 0;
  const DT = ['wd', 'we'];
  // 地铁相关的统计量：夜间时段只运营到 24 时（按 0.9 折算）
  const METRO_KEYS = new Set(['metro', 'fare', 'metroPkm', 'metroTime', 'mHW', 'mSC', 'mSH', 'mMD', 'mLZ', 'mHB', 'indM']);
  const TKEY = ['tHW', 'tSC', 'tSH', 'tMD', 'tLZ', 'tHB'], MKEY = ['mHW', 'mSC', 'mSH', 'mMD', 'mLZ', 'mHB'];
  CM.TRIP_KEYS = PK;

  // ---------------- 汽车分配：并行最短路（v2.1） ----------------
  // 每个起点小区一棵道路最短路树：写出到各小区的汽车行程时间 / 里程（行程时间表的一行），并把该起点的汽车需求沿树回溯到路段。
  // 起点按「本次需要计算的起点列表」固定分成 CAR_BLOCKS 块：每块的路段流量在块内按起点顺序累加，各块再按块顺序合计。
  // 分块与工作线程数量无关，因此多线程与单线程（不支持 Worker、同步求解或工作线程出错时）结果逐位相同；
  // 与 v2.0 的逐起点累加相比只有浮点舍入级别的差异，最短路、需求与分配规则不变。
  // 下面三个函数会原样复制到工作线程中执行（不能引用外部变量，INF 在两边都定义为 1e30）
  const CAR_BLOCKS = 32;
  // 求解生成器在等待工作线程时让出的值：外层循环（实时求解、跳月、预测）见到它就不再空转，让工作线程的结果消息先进来
  const WAIT = CM.SIM_WAIT = Object.freeze({ wait: true });
  // 同时交错执行的时段数（v2.1）：一个时段等汽车分配时，主线程先算其他时段的地铁路径与方式选择。
  // v2.3：12 个逻辑核心以上交错 4 个时段（方式选择线程随之增至 4 个），跳月 / 跳年少等工作线程；各时段互不依赖，结果与宽度无关
  const PIPE_W = 2;
  function carTree(G, time, origin, W) {
    const dist = W.dist, dkm = W.dkm, pred = W.pred, order = W.order, keys = W.heapK, values = W.heapV;
    const start = G.start, node = G.nodes, initial = G.times, km = G.km;
    const outStart = G.outStart, outArc = G.outArc, arcTo = G.arcTo, arcKm = G.arcKm;
    dist.fill(INF);
    let count = 0;
    for (let k = start[origin]; k < start[origin + 1]; k++) {
      const v = node[k], t = initial[k];
      if (t < dist[v]) {
        dist[v] = t; dkm[v] = km[k]; pred[v] = -1;
        let i = count++;
        while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= t) break; keys[i] = keys[p]; values[i] = values[p]; i = p; }
        keys[i] = t; values[i] = v;
      }
    }
    let no = 0;
    while (count) {
      const u = values[0], du = keys[0], n = --count;
      if (n > 0) {
        const key = keys[n], val = values[n];
        let i = 0;
        for (;;) {
          const left = i * 2 + 1; if (left >= n) break;
          const right = left + 1, child = right < n && keys[right] < keys[left] ? right : left;
          if (keys[child] >= key) break;
          keys[i] = keys[child]; values[i] = values[child]; i = child;
        }
        keys[i] = key; values[i] = val;
      }
      if (du > dist[u]) continue;
      order[no++] = u;
      for (let k = outStart[u]; k < outStart[u + 1]; k++) {
        const a = outArc[k], v = arcTo[a], nd = du + time[a];
        if (nd < dist[v]) {
          dist[v] = nd; dkm[v] = dkm[u] + arcKm[a]; pred[v] = a;
          let i = count++;
          while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= nd) break; keys[i] = keys[p]; values[i] = values[p]; i = p; }
          keys[i] = nd; values[i] = v;
        }
      }
    }
    return no;
  }
  // 起点 o：行程时间与里程写入 outT / outK 的 off 起一行（不可达的小区不写，保留原值；工作线程的行预先填 NaN 表示「未写」），
  // 流量累加到本块的 auxP；不可达条目保留原值。
  function carOriginRow(G, time, o, dem, dOff, W, outT, outK, off, auxP) {
    const dist = W.dist, dkm = W.dkm, pred = W.pred, order = W.order, accN = W.accN, arcFrom = G.arcFrom;
    const connStart = G.start, connNode = G.nodes, connTime = G.times, connKm = G.km, zones = G.zones;
    const no = carTree(G, time, o, W);
    for (let zi = 0; zi < zones.length; zi++) {
      const d = zones[zi];
      if (d === o) continue;
      let best = INF, bk = 0, bn = -1;
      for (let k = connStart[d]; k < connStart[d + 1]; k++) { const nd = connNode[k], v = dist[nd] + connTime[k]; if (v < best) { best = v; bk = dkm[nd] + connKm[k]; bn = nd; } }
      if (bn < 0 || best >= INF) continue;
      outT[off + d] = best; outK[off + d] = bk;
      const x = dem[dOff + d];
      if (x > 0) accN[bn] += x;
    }
    for (let q = no - 1; q >= 0; q--) {
      const n = order[q], a = accN[n];
      if (a > 0) { const e = pred[n]; if (e >= 0) { auxP[e] += a; accN[arcFrom[e]] += a; } accN[n] = 0; }
    }
  }
  function carWork(G) {
    return { dist: new Float64Array(G.nN), dkm: new Float32Array(G.nN), pred: new Int32Array(G.nN), order: new Int32Array(G.nN), accN: new Float64Array(G.nN), heapK: new Float64Array(G.nA + 4), heapV: new Int32Array(G.nA + 4) };
  }
  // 工作线程入口：收到道路图（每次路网变化一次）与计算块，逐起点计算并回传（缓冲区转移，不复制）
  function carWorkerMain() {
    let G = null, W = null, kernel = null;
    onmessage = function (e) {
      const m = e.data;
      if (m.type === 'graph') { G = m.G; W = null;kernel=null;try{if(m.kernel)kernel=roadKernelWorker(m.kernel,G);}catch(e){/* JavaScript fallback. */}return; }
      if (m.type !== 'block') return;
      if (!G || G.id !== m.gid) { postMessage({ req: m.req, b: m.b, stale: true }); return; }
      if(kernel){try{const r=kernel.solve(m);postMessage({req:m.req,b:m.b,...r,kernel:true},[r.rowsT.buffer,r.rowsK.buffer,r.aux.buffer]);return;}catch(e){kernel=null;}}
      if(!W)W=carWork(G);
      const Z = G.Z, n = m.origins.length, rowsT = new Float32Array(n * Z).fill(NaN), rowsK = new Float32Array(n * Z).fill(NaN), aux = new Float32Array(G.nA);
      for (let i = 0; i < n; i++) carOriginRow(G, m.time, m.origins[i], m.dem, i * Z, W, rowsT, rowsK, i * Z, aux);
      postMessage({ req: m.req, b: m.b, rowsT: rowsT, rowsK: rowsK, aux: aux }, [rowsT.buffer, rowsK.buffer, aux.buffer]);
    };
  }
  // 道路图（随 roadData 一起缓存）：工作线程与主线程使用同一份紧凑数组
  function carGraph(model) {
    const rd = model.roadData, road = model.road;
    if (rd.G) return rd.G;
    rd.G = { id: ++CarPool.gseq, Z: model.Z, nN: road.nN, nA: road.nA, outStart: road.outStart, outArc: road.outArc, arcTo: road.arcTo, arcFrom: road.arcFrom,
      start: rd.start, nodes: rd.nodes, times: rd.times, km: rd.km, zones: rd.zones, arcKm: rd.arcKm };
    return rd.G;
  }
  // 工作线程池：页面内用 Blob 创建（桌面 CSP 已允许 blob: 工作线程）；无法创建或出错时整体退回主线程计算。
  // 道路线程按可用逻辑核心分配，最多 24 个，为方式选择、界面与 GPU 驱动保留至少四分之一；分块数固定，线程数不改变结果。每个线程同时排队两块，
  // 算完一块马上开始下一块，不必等主线程转发。onReq 在一次分配全部完成（或改为主线程计算）时调用，供跳月 / 跳年立即继续
  function workerPlan() {
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const cores = Math.max(1, Number(nav.hardwareConcurrency) || 2), memory = Number(nav.deviceMemory) || 8;
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const cap = memory <= 2 ? 1 : memory <= 4 || touch ? 4 : 8;
    const total = Math.max(1, Math.min(cap, cores - (cores >= 4 ? 2 : 1)));
    const mode = total >= 6 ? 2 : total >= 3 ? 1 : 0;
    const metro = total >= 6 ? 2 : total >= 4 ? 1 : 0;
    return { road: total - mode - metro, mode: mode, metro: metro };
  }
  const CAR_DEPTH = 2;
  const CarPool = {
    gseq: 0, rseq: 0, list: null, off: false, queue: [], reqs: new Map(), onReq: null, stats: {wasm:0,js:0},
    size: function () { return workerPlan().road; },
    ready: function () {
      if (this.off) return false;
      if (this.list) return true;
      let url;
      try {
        if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) throw new Error('Worker 不可用');
        const kernel = CM.RoadKernel;
        const src = '"use strict";\nconst INF = 1e30;\n' + (kernel ? kernel.worker.toString() : 'function roadKernelWorker(){return null;}') + '\n' + [carTree, carOriginRow, carWork, carWorkerMain].map(function (f) { return f.toString(); }).join('\n') + '\ncarWorkerMain();\n';
        url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        const self = this; this.list = [];
        for (let i = 0; i < this.size(); i++) {
          const w = new Worker(url), slot = { w: w, n: 0, gid: 0 };
          w.onmessage = function (e) { self.done(slot, e.data); };
          w.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); self.fail('工作线程出错：' + ((e && e.message) || '未知错误')); };
          w.onmessageerror = function () { self.fail('工作线程消息无法读取'); };
          this.list.push(slot);
        }
        return true;
      } catch (e) { this.fail(String(e && e.message || e)); return false; }
      finally { if (url) URL.revokeObjectURL(url); }
    },
    fail: function (why) {
      if (this.off) return;
      this.off = true; this.why = why;
      if (this.list) for (const s of this.list) { try { s.w.terminate(); } catch (e) { /* 已结束 */ } }
      this.list = null;
      for (const r of this.reqs.values()) r.failed = true;   // 未完成的块由主线程补算
      this.reqs.clear(); this.queue = [];
      if (typeof console !== 'undefined') console.warn('交通求解改为主线程计算：' + why);
      this.notify();
    },
    notify: function () {
      if (!this.onReq || this.notifying) return;
      this.notifying = true;
      const self = this;
      // 创建工作线程失败时也会通知；在当前生成器让出后恢复，避免同步重入 gen.next()。
      Promise.resolve().then(function () {
        self.notifying = false;
        if (self.onReq) { try { self.onReq(); } catch (e) { if (typeof console !== 'undefined') console.error(e); } }
      });
    },
    // 提交一次分配：blocks 为 [{ origins, dem }]；alive() 为假时（求解已被放弃）尚未发出的块直接丢弃
    submit: function (G, time, blocks, alive) {
      const req = { id: ++this.rseq, G: G, time: Float32Array.from(time), res: new Array(blocks.length), remaining: 0, failed: false, alive: alive };
      blocks.forEach(function (b, i) { if (b.origins.length) { req.remaining++; this.queue.push({ req: req, b: i, origins: b.origins, dem: b.dem }); } else req.res[i] = null; }, this);
      if (req.remaining) this.reqs.set(req.id, req);
      this.pump();
      return req;
    },
    pump: function () {
      if (!this.list) return;
      // 先让每个线程都有一块，再补第二块（排队深度 CAR_DEPTH）。镜头移动时（v2.5 性能）只用一半线程，把核心让给画面；跳月、载入时全力。线程多少不影响结果
      const busy = CM.R && CM.R.interacting && !(CM.game && CM.game.jumping), slots = busy ? Math.max(1, Math.ceil(this.list.length / 2)) : this.list.length;
      for (let depth = 1; depth <= CAR_DEPTH; depth++) for (let si = 0; si < slots; si++) {
        const s = this.list[si];
        if (s.n >= depth) continue;
        let t = null;
        while (this.queue.length) {
          const c = this.queue.shift();
          if (c.req.alive()) { t = c; break; }
          c.req.abandoned = true;
          if (--c.req.remaining <= 0) this.reqs.delete(c.req.id);
        }
        if (!t) return;
        try {
          if (s.gid !== t.req.G.id) { const msg = { type: 'graph', G: t.req.G, kernel: CM.RoadKernel && CM.RoadKernel.module }; try { s.w.postMessage(msg); } catch (e) { msg.kernel = null; s.w.postMessage(msg); } s.gid = t.req.G.id; }
          s.n++;
          s.w.postMessage({ type: 'block', req: t.req.id, b: t.b, gid: t.req.G.id, time: t.req.time, origins: t.origins, dem: t.dem }, [t.dem.buffer]);
        } catch (e) { this.fail('工作线程消息发送失败：' + (e && e.message || e)); return; }
      }
    },
    done: function (slot, m) {
      slot.n = Math.max(0, slot.n - 1);
      const req = this.reqs.get(m.req);
      let fin = false;
      if (req) {
        if (m.stale) req.failed = true;
        else req.res[m.b] = { rowsT: m.rowsT, rowsK: m.rowsK, aux: m.aux };
        if (--req.remaining <= 0) { this.reqs.delete(req.id); fin = true; }
        else if (req.failed) fin = true;
      }
      this.pump();
      if (fin) this.notify();
    },
  };
  CM.CarPool = CarPool;
  // 方式选择是大线网中最重的主线程任务。每次迭代仍按原起点、去返程与统计累加顺序
  // 完整执行，只把计算搬到独立线程；不拆分求和，不降低精度。需求和接驳表按版本缓存，
  // 变化的行程表与结果缓冲区往返转移并复用，避免每帧复制整份需求或保留旧城市。
  // 地铁最短路与客流回溯的固定分段数：只影响计算顺序，线程数不影响结果
  const SKIM_BLOCKS = 16;
  const OD_OUT = ['carDem', 'hasCar', 'S', 'pT', 'pM', 'zTrips', 'zMetro', 'zAccess', 'zCW', 'zCT', 'desTot', 'desMetro',
    'zDest', 'zDestM', 'fIn', 'fInM', 'fOut', 'fOutM', 'fP', 'fPM', 'DS', 'choices'];
  const OD_FIXED = ['Z', 'NZ', 'B', 'odStart', 'odDest', 't0', 't1', 't2', 't3', 't4', 't5', 'hostZ', 'nx', 'ny', 'kmPerCell', 'blocks'];
  const OD_MOVE = { gtS: 1, tmS: 1, kmS: 1 };
  const OD_INPUT = ['N', 'co', 'cr', 'facW', 'facWe', 'odOk', 'skT', 'skK', 'zJ', 'cpk', 'park', 'vot', 'carAccess',
    'walkW', 'occ', 'theta', 'fareFlat', 'fareKm0', 'fareStep', 'fareInc', 'fareCap', 'fareTab', 'bgShare', 'bgSpeed', 'bgWait', 'bgFare', 'roadKeep', 'accOk', 'gtS', 'tmS', 'kmS', 'perMin', 'capSh', 'capLz', 'habit', 'habAsc', 'habLite'];
  function odWorkerMain() {
    let basis = null, id = 0, work = {};
    onmessage = function (e) {
      const m = e.data;
      if (m.type === 'basis') { basis = m.data; id = m.id; return; }
      if (m.type === 'recycle') { work = m.data; return; }
      if (m.type !== 'solve') return;
      if (!basis || id !== m.id) { postMessage({ req: m.req, stale: true }); return; }
      const K = Object.assign({}, basis, m.input), out = {}, transfer = [];
      for (const spec of m.output) {
        const key = spec[0];
        if (!spec[1]) { K[key] = out[key] = null; continue; }
        let a = work[key];
        if (!a || a.constructor.name !== spec[1] || a.length !== spec[2]) a = new globalThis[spec[1]](spec[2]);
        a.fill(key === 'choices' ? -2 : 0);
        K[key] = out[key] = a; transfer.push(a.buffer);
      }
      K.cO = new Float64Array(6); K.cR = new Float64Array(6);
      for (let i = 0; i < K.Z; i++) odOrigin(K, i);
      for (const key in m.input) if (ArrayBuffer.isView(m.input[key])) transfer.push(m.input[key].buffer);
      work = {};
      postMessage({ req: m.req, out: out, input: m.input }, transfer);
    };
  }
  const OdPool = {
    list: null, off: false, seq: 0, keySeq: 0, queue: [],
    ready: function () {
      if (this.off || !workerPlan().mode) return false;
      if (this.list) return true;
      let url;
      try {
        const src = '"use strict";\nconst INF=1e30,HW=0,SH=2,LZ=4,NPK=6;\nconst U={dist:' + U.dist.toString() + '};\n' +
          odOrigin.toString() + '\n' + odWorkerMain.toString() + '\nodWorkerMain();\n';
        url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        this.list = [];
        const count = workerPlan().mode;
        for (let i = 0; i < count; i++) {
          const w = new Worker(url), slot = { w: w, key: 0, req: null, buffers: {} };
          w.onmessage = e => this.done(slot, e.data);
          w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); this.fail((e && e.message) || '工作线程出错'); };
          w.onmessageerror = () => this.fail('工作线程消息无法读取');
          this.list.push(slot);
        }
        return true;
      } catch (e) { this.fail(String(e && e.message || e)); return false; }
      finally { if (url) URL.revokeObjectURL(url); }
    },
    fail: function (why) {
      if (this.off) return;
      this.off = true; this.why = why;
      for (const s of this.list || []) { if (s.req) { s.req.failed = true; s.req.K = null; } s.w.terminate(); }
      for (const r of this.queue) { r.failed = true; r.K = null; }
      this.list = null; this.queue = [];
      if (typeof console !== 'undefined') console.warn('方式选择改为主线程计算：' + why);
      CarPool.notify();
    },
    submit: function (model, K, od, fn, alive) {
      let version = model._odWorkerVersion;
      if (!version || version.od !== od || version.fn !== fn || version.acc !== K.acc) {
        version = model._odWorkerVersion = { id: ++this.keySeq, od: od, fn: fn, acc: K.acc };
      }
      const r = { id: ++this.seq, key: version.id, K: K, alive: alive, done: false, failed: false };
      this.queue.push(r); this.pump(); return r;
    },
    pump: function () {
      // 及时释放已取消、换图或过时的请求，不让排队的闭包长期持有旧模型。
      this.queue = this.queue.filter(r => { if (r.alive()) return true; r.failed = true; r.done = true; r.K = null; return false; });
      for (const s of this.list || []) {
        if (s.req || !this.queue.length) continue;
        const r = this.queue.shift(), K = r.K;
        s.req = r;
        try {
          if (s.key !== r.key) {
            const data = {}, transfer = [];
            for (const key of OD_FIXED) {
              const v = K[key]; data[key] = ArrayBuffer.isView(v) ? v.slice() : v;
              if (ArrayBuffer.isView(data[key])) transfer.push(data[key].buffer);
            }
            data.acc = K.acc ? { zCov: K.acc.zCov, zl: K.acc.zl } : null;
            s.w.postMessage({ type: 'basis', id: r.key, data: data }, transfer); s.key = r.key;
          }
          const input = {}, transfer = [];
          for (const key of OD_INPUT) {
            const v = K[key];
            if (ArrayBuffer.isView(v) && OD_MOVE[key]) { input[key] = v; transfer.push(v.buffer); }
            else if (ArrayBuffer.isView(v)) {
              let a = s.buffers[key];
              if (!a || a.constructor !== v.constructor || a.length !== v.length) a = new v.constructor(v.length);
              a.set(v); input[key] = a; transfer.push(a.buffer);
            } else input[key] = v;
          }
          s.buffers = {};
          const output = OD_OUT.map(key => [key, K[key] ? K[key].constructor.name : null, K[key] ? K[key].length : 0]);
          s.w.postMessage({ type: 'solve', id: r.key, req: r.id, input: input, output: output }, transfer);
        } catch (e) { this.fail(String(e && e.message || e)); return; }
      }
    },
    done: function (s, m) {
      const r = s.req;
      if (!r || r.id !== m.req) { this.fail('方式选择请求不匹配'); return; }
      try {
        if (m.stale) r.failed = true;
        else {
          if (!r.alive()) r.failed = true;
          else for (const key of OD_OUT) if (m.out[key]) r.K[key].set(m.out[key]);
          const sk = r.K.skimStore;
          if (sk) { sk.gt = m.input.gtS; sk.tm = m.input.tmS; sk.km = m.input.kmS; }
          delete m.input.gtS; delete m.input.tmS; delete m.input.kmS;
          s.buffers = m.input;
          const transfer = OD_OUT.filter(key => m.out[key]).map(key => m.out[key].buffer);
          s.w.postMessage({ type: 'recycle', data: m.out }, transfer);
        }
        r.done = true; r.K = null; s.req = null;
        this.pump(); CarPool.notify();
      } catch (e) { this.fail(String(e && e.message || e)); }
    },
  };
  CM.OdPool = OdPool;
  // 地铁最短路（广义成本）也放到工作线程（v2.3 高密度线网）：每次迭代要为每座车站算一棵最短路树，
  // 六百多座车站时主线程上要算一两秒、按帧切片后改线等待很久。各线程分摊一段起点，算完把这些起点的行转移回来、
  // 拷入同一套数组；算法与主线程完全相同（同一个 metroTree），结果逐位一致。工作线程不可用时照旧在主线程计算
  function skimWorkerMain() {
    let net = null, id = 0, heap = null, work = null;
    onmessage = function (e) {
      const m = e.data;
      if (m.type === 'net') { net = m.net; id = m.id; heap = new Heap(1024); work = { dist: new Float64Array(net.nNodes), dtm: new Float32Array(net.nNodes), dkm: new Float32Array(net.nNodes), accN: new Float64Array(net.nNodes) }; return; }
      if (!net || id !== m.id) { postMessage({ req: m.req, part: m.part, stale: true }); return; }
      const N = net.N, nn = net.nNodes, n = m.s1 - m.s0;
      if (m.type === 'load') {
        // 客流沿最短路树回溯：只用本段的路径表，结果与路径表一起交还（路径表留给同一输入的下一轮）
        const out = { load: new Float32Array(net.nE), accN: work.accN, stIn: new Float32Array(N), stOut: new Float32Array(N) };
        metroLoadBlock(N, nn, net.eFrom, m.D, m.s0, m.pred, m.order, m.nOrd, m.s0, m.s0, m.s1, out);
        postMessage({ req: m.req, part: m.part, s0: m.s0, s1: m.s1, load: out.load, stIn: out.stIn, stOut: out.stOut, pred: m.pred, order: m.order, nOrd: m.nOrd, D: m.D }, [out.load.buffer, out.stIn.buffer, out.stOut.buffer, m.pred.buffer, m.order.buffer, m.nOrd.buffer, m.D.buffer]);
        return;
      }
      if (m.type !== 'skim') return;
      // 上一轮的路径表还回来继续用：每轮不再重新申请上百 MB 内存
      const old = m.reuse, fit = old && old.pred.length === n * nn, P16 = nn < 65535 && net.nE < 65535 ? Uint16Array : Int32Array;
      const store = { gt: new Float32Array(n * N), tm: new Float32Array(n * N), km: new Float32Array(n * N), pred: fit ? old.pred : new P16(n * nn), order: fit ? old.order : new P16(n * nn), nOrd: fit ? old.nOrd : new Int32Array(n) };
      for (let s = m.s0; s < m.s1; s++) metroTree(net, m.cost, m.tAct, s, work, store, heap, m.tpen, m.s0);
      postMessage({ req: m.req, part: m.part, s0: m.s0, s1: m.s1, store: store }, [store.gt.buffer, store.tm.buffer, store.km.buffer, store.pred.buffer, store.order.buffer, store.nOrd.buffer]);
    };
  }
  const SkimPool = {
    list: null, off: false, seq: 0, netSeq: 0, queue: [], keys: new WeakMap(),
    size: function () { return workerPlan().metro; },
    ready: function () {
      if (this.off || !this.size()) return false;
      if (this.list) return true;
      let url;
      try {
        if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || !URL.createObjectURL) throw new Error('Worker 不可用');
        const H = U.Heap, hp = H.prototype;
        const src = '"use strict";\nconst INF=' + INF + ';\n' + H.toString() + '\nHeap.prototype.clear=' + hp.clear.toString() + ';\nHeap.prototype.push=' + hp.push.toString() + ';\nHeap.prototype.pop=' + hp.pop.toString() + ';\n' +
          metroTree.toString() + '\n' + metroLoadBlock.toString() + '\n' + skimWorkerMain.toString() + '\nskimWorkerMain();\n';
        url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        this.list = [];
        for (let i = 0; i < this.size(); i++) {
          const w = new Worker(url), slot = { w: w, netId: 0, job: null };
          w.onmessage = e => this.done(slot, e.data);
          w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); this.fail((e && e.message) || '工作线程出错'); };
          w.onmessageerror = () => this.fail('地铁最短路消息无法读取');
          this.list.push(slot);
        }
        return true;
      } catch (e) { this.fail(String(e && e.message || e)); return false; }
      finally { if (url) URL.revokeObjectURL(url); }
    },
    fail: function (why) {
      if (this.off) return;
      this.off = true;
      for (const s of this.list || []) { if (s.job) s.job.req.failed = true; try { s.w.terminate(); } catch (e) { /* 已结束 */ } }
      for (const j of this.queue) j.req.failed = true;
      this.list = null; this.queue = [];
      if (typeof console !== 'undefined') console.warn('地铁最短路改为主线程计算：' + why);
      CarPool.notify();
    },
    // 提交一次全网最短路：起点固定分成 SKIM_BLOCKS 段（与线程数无关，结果逐位一致）；req.done 后 req.parts 为各段结果。
    // reuse：上一轮这份存储的各段缓冲区，交给线程继续用
    submit: function (net, cost, tAct, tpen, reuse) {
      let nid = this.keys.get(net); if (!nid) { nid = ++this.netSeq; this.keys.set(net, nid); }
      const N = net.N, k = Math.min(N, SKIM_BLOCKS), req = { id: ++this.seq, net: net, nid: nid, parts: [], left: 0, done: false, failed: false };
      for (let i = 0; i < k; i++) {
        const s0 = Math.floor(N * i / k), s1 = Math.floor(N * (i + 1) / k); if (s1 <= s0) continue;
        const old = reuse && reuse[req.parts.length];
        req.left++; this.queue.push({ type: 'skim', req: req, part: req.parts.length, s0: s0, s1: s1, cost: cost, tAct: tAct, tpen: tpen, reuse: old && old.s0 === s0 && old.s1 === s1 ? old.store : null });
        req.parts.push(null);
      }
      if (!req.left) req.done = true;
      this.pump(); return req;
    },
    // 提交客流回溯：路径表交给线程，算完连同各段的区间客流一起交还
    submitLoad: function (net, parts, D, N) {
      let nid = this.keys.get(net); if (!nid) { nid = ++this.netSeq; this.keys.set(net, nid); }
      const req = { id: ++this.seq, net: net, nid: nid, parts: [], left: 0, done: false, failed: false };
      parts.forEach(function (p, i) {
        req.left++; req.parts.push(null);
        this.queue.push({ type: 'load', req: req, part: i, s0: p.s0, s1: p.s1, D: D.slice(p.s0 * N, p.s1 * N), pred: p.store.pred, order: p.store.order, nOrd: p.store.nOrd });
      }, this);
      if (!req.left) req.done = true;
      this.pump(); return req;
    },
    pump: function () {
      for (const s of this.list || []) {
        if (s.job || !this.queue.length) continue;
        const j = this.queue.shift(); s.job = j;
        try {
          if (s.netId !== j.req.nid) {
            const n = j.req.net;
            s.w.postMessage({ type: 'net', id: j.req.nid, net: { N: n.N, nNodes: n.nNodes, nE: n.nE, outStart: n.outStart, outEdge: n.outEdge, eTo: n.eTo, eKm: n.eKm, eFrom: n.eFrom } });
            s.netId = j.req.nid;
          }
          if (j.type === 'load') { s.w.postMessage({ type: 'load', id: j.req.nid, req: j.req.id, part: j.part, s0: j.s0, s1: j.s1, D: j.D, pred: j.pred, order: j.order, nOrd: j.nOrd }, [j.D.buffer, j.pred.buffer, j.order.buffer, j.nOrd.buffer]); j.D = j.pred = j.order = j.nOrd = null; }
          else {
            const u = j.reuse, tr = u ? [u.pred.buffer, u.order.buffer, u.nOrd.buffer] : [];
            s.w.postMessage({ type: 'skim', id: j.req.nid, req: j.req.id, part: j.part, s0: j.s0, s1: j.s1, cost: j.cost, tAct: j.tAct, tpen: j.tpen, reuse: u }, tr); j.reuse = null;
          }
        } catch (e) { this.fail(String(e && e.message || e)); return; }
      }
    },
    done: function (s, m) {
      const j = s.job; s.job = null;
      if (!j || j.req.id !== m.req) { if (j) j.req.failed = true; this.fail('地铁最短路请求不匹配'); return; }
      if (m.stale) j.req.failed = true;
      else { j.req.parts[m.part] = m; if (--j.req.left <= 0) j.req.done = true; }
      this.pump();
      if (j.req.done || j.req.failed) CarPool.notify();
    },
  };
  CM.SkimPool = SkimPool;
  // 单个起点的方式选择与统计：对起点 i 的每条需求记录，先算去程（i → j）再算返程（j → i）。
  // 汽车广义成本、最优接驳车站对（同一迭代内缓存胜出的组合）、Logit 地铁选择、新增购物 / 休闲出行（有上限），
  // 并按顺序累加全网统计（S、分目的 pT / pM）、小区与设施的吸引统计、期望线与汽车需求。
  // 需要的数组一次性读入局部变量；运算与累加顺序固定，结果与逐次调用完全相同
  function odOrigin(K, i) {
    const Z = K.Z, NZ = K.NZ, N = K.N, B = K.B;
    const odStart = K.odStart, odDest = K.odDest, t0 = K.t0, t1 = K.t1, t2 = K.t2, t3 = K.t3, t4 = K.t4, t5 = K.t5;
    const co = K.co, cr = K.cr, cO = K.cO, cR = K.cR, facW = K.facW, facWe = K.facWe, odOk = K.odOk;
    const hostZ = K.hostZ, nx = K.nx, ny = K.ny, skT = K.skT, skK = K.skK, kmPerCell = K.kmPerCell;
    const cpk = K.cpk, park = K.park, vot = K.vot, carAccess = K.carAccess, walkW = K.walkW, occ = K.occ, theta = K.theta, fareFlat = K.fareFlat;
    const fareKm0 = K.fareKm0, fareStep = K.fareStep, fareInc = K.fareInc, fareCap = K.fareCap, fareTab = K.fareTab, fareTabN = fareTab.length - 1;
    const bgShare = K.bgShare || 0, bgSpeed = K.bgSpeed, bgWait = K.bgWait, bgFare = K.bgFare, roadKeep = K.roadKeep || 0;
    const acc = K.acc, accOk = K.accOk, zCov = acc ? acc.zCov : null, zl = acc ? acc.zl : null, choices = K.choices;
    const gtS = K.gtS, tmS = K.tmS, kmS = K.kmS, DS = K.DS, perMin = K.perMin, capSh = K.capSh, capLz = K.capLz;
    const carDem = K.carDem, hasCar = K.hasCar, S = K.S, pT = K.pT, pM = K.pM;
    const habit = K.habit, habAsc = K.habAsc || 0, habLite = K.habLite || 0;
    const zCW = K.zCW, zCT = K.zCT, zTrips = K.zTrips, zMetro = K.zMetro, zAccess = K.zAccess, zJ = K.zJ, blocks = K.blocks, desTot = K.desTot, desMetro = K.desMetro;
    const zDest = K.zDest, zDestM = K.zDestM, fIn = K.fIn, fInM = K.fInM, fOut = K.fOut, fOutM = K.fOutM, fP = K.fP, fPM = K.fPM;
    for (let k = odStart[i]; k < odStart[i + 1]; k++) {
      const j = odDest[k];
      if (j >= Z && !odOk) continue;
      const fw = j >= Z && facW ? facWe[j - Z] : 1;
      let F1 = 0, F2 = 0, v;
      v = t0[k]; if (v) { const a = v * co[0] * fw, b = v * cr[0] * fw; cO[0] = a; cR[0] = b; F1 += a; F2 += b; } else { cO[0] = 0; cR[0] = 0; }
      v = t1[k]; if (v) { const a = v * co[1] * fw, b = v * cr[1] * fw; cO[1] = a; cR[1] = b; F1 += a; F2 += b; } else { cO[1] = 0; cR[1] = 0; }
      v = t2[k]; if (v) { const a = v * co[2] * fw, b = v * cr[2] * fw; cO[2] = a; cR[2] = b; F1 += a; F2 += b; } else { cO[2] = 0; cR[2] = 0; }
      v = t3[k]; if (v) { const a = v * co[3] * fw, b = v * cr[3] * fw; cO[3] = a; cR[3] = b; F1 += a; F2 += b; } else { cO[3] = 0; cR[3] = 0; }
      v = t4[k]; if (v) { const a = v * co[4] * fw, b = v * cr[4] * fw; cO[4] = a; cR[4] = b; F1 += a; F2 += b; } else { cO[4] = 0; cR[4] = 0; }
      v = t5[k]; if (v) { const a = v * co[5] * fw, b = v * cr[5] * fw; cO[5] = a; cR[5] = b; F1 += a; F2 += b; } else { cO[5] = 0; cR[5] = 0; }
      for (let dir = 0; dir < 2; dir++) {
        const isOut = dir === 0, o = isOut ? i : j, d = isOut ? j : i, F0 = isOut ? F1 : F2, comp = isOut ? cO : cR;
        if (F0 <= 0) continue;
        const ho = hostZ[o], hd = hostZ[d];
        let ct = skT[ho * Z + hd], ck = skK[ho * Z + hd];
        if (!(ct > 0) || ct >= INF) { const straight = U.dist(nx[o], ny[o], nx[d], ny[d]) * kmPerCell * 1.3; ct = straight / 16 * 60 + 3; ck = straight; }
        const carMoney = ck * cpk + park;
        let gtCar = ct + carAccess + carMoney / vot * 60, roadF = 1, tBg = 0;
        // 背景交通（v2.2）：非地铁出行中有 bgShare 比例乘坐电车、普通铁路、渡轮或步行，不占用道路；广义成本按比例混合
        if (bgShare > 0) {
          const dk = U.dist(nx[o], ny[o], nx[d], ny[d]) * kmPerCell * 1.25;
          tBg = dk / bgSpeed * 60 + bgWait;
          gtCar = (1 - bgShare) * gtCar + bgShare * (tBg + bgFare / vot * 60); roadF = 1 - bgShare;
        }
        // 地铁出行习惯（v2.3）：两端车站周边的成熟度（0–1）；偏好只加在地铁与开车的比较上，并有一部分非地铁出行不再上路
        const hb = habit ? (habit[ho] + habit[hd]) * 0.5 : 0;
        if (hb > 0) roadF *= 1 - habLite * hb;
        let mTime = 0, fare = 0, mKm = 0, bs = -1, bt = -1, q = 0, pMc = 0;
        let gtBest = gtCar, ind = 0, indSh = 0, indLz = 0;
        if (acc && (accOk || (o < Z && d < Z))) {
          const fo = zCov[o] || 0, fd = zCov[d] || 0;
          const lo = zl[o], ld = zl[d];
          if (fo > 0 && fd > 0 && lo && ld) {
            let best = INF, bw = 0;
            const pair = o * NZ + d, cached = choices[pair];
            let winner = -1;
            if (cached >= 0) {
              const A = lo[cached >> 2], Bq = ld[cached & 3];
              bs = A.s; bt = Bq.s; bw = A.w + Bq.w;
              best = walkW * bw + gtS[bs * N + bt];
            } else if (cached === -2) for (let a = 0; a < lo.length; a++) {
              const A = lo[a], row = A.s * N;
              for (let b = 0; b < ld.length; b++) {
                const Bq = ld[b];
                if (A.s === Bq.s) continue;
                const g = gtS[row + Bq.s];
                if (g >= INF) continue;
                const w = walkW * (A.w + Bq.w) + g;
                if (w < best) { best = w; bs = A.s; bt = Bq.s; bw = A.w + Bq.w; winner = (a << 2) | b; }
              }
            }
            if (cached === -2) choices[pair] = winner;
            if (bs >= 0) {
              mKm = kmS[bs * N + bt];
              fare = fareFlat;
              let fareN = 0;
              if (fareInc > 0 && mKm > fareKm0) { fareN = Math.ceil((mKm - fareKm0) / fareStep - 1e-9); fare += fareN * fareInc; if (fareCap > 0 && fare > fareCap) fare = fareCap; }
              const gtM = best + fareTab[fareN > fareTabN ? fareTabN : fareN];
              pMc = 1 / (1 + Math.exp(theta * (gtM - gtCar - habAsc * hb)));
              q = fo * fd * pMc;
              mTime = bw + tmS[bs * N + bt];
              if (gtM < gtBest) gtBest = gtM;
              // 地铁改善可达性带来的新增购物、休闲出行（Logit 组合效用的改善，按覆盖比例折算；有上限）
              if (comp[SH] > 0 || comp[LZ] > 0) {
                const x = theta * (gtCar - gtM);
                const gain = fo * fd * (x > 30 ? x : Math.log1p(Math.exp(x))) / theta;
                const r = gain * perMin;
                indSh = comp[SH] * Math.min(capSh, r); indLz = comp[LZ] * Math.min(capLz, r); ind = indSh + indLz;
              }
            }
          }
        }
        const metroB = F0 * q, indM = ind * pMc;
        const F = F0 + ind, metro = metroB + indM;
        if (metro > 0) DS[bs * N + bt] += metro;
        const car = F - metro;
        // roadKeep（v2.6，伦敦）：改乘地铁的人空出的路面，有这样一部分又被别的车辆占满（公交与电车竞争、被压抑的小汽车出行），道路不会同比变空
        const onRoad = car + metro * roadKeep;
        if (onRoad > 0) { carDem[ho * Z + hd] += onRoad / occ * roadF; hasCar[ho] = 1; }
        S[0] += F; S[1] += metro; S[2] += car;
        const tCar = bgShare > 0 ? (1 - bgShare) * (ct + carAccess * 0.5) + bgShare * tBg : ct + carAccess * 0.5;
        S[3] += car * tCar + metro * mTime;
        S[4] += car * tCar; S[5] += metro * mTime;
        S[6] += metro * fare; S[7] += metro * mKm; S[8] += car * ck; S[9] += onRoad / occ * ck * roadF;
        const cw = comp[HW] / F0;
        if (cw > 0) { const tc = ((F0 - metroB) * tCar + metroB * mTime) * cw; S[10] += comp[HW]; S[11] += tc; zCW[ho] += comp[HW]; zCT[ho] += tc; }
        for (let p = 0; p < NPK; p++) { const c = comp[p]; if (c) { pT[p] += c; pM[p] += c * q; } }
        if (ind > 0) { pT[SH] += indSh; pT[LZ] += indLz; pM[SH] += indSh * pMc; pM[LZ] += indLz * pMc; S[12] += ind; S[13] += indM; }
        zTrips[ho] += F; zMetro[ho] += metro;
        if (o < Z && d < Z) zAccess[o] += zJ[d] * Math.exp(-gtBest / 30);
        const key = blocks[ho] * B + blocks[hd];
        desTot[key] += F; desMetro[key] += metro;
        // 吸引统计：去程按目的地计（小区按目的，重要设施单独计）；设施的返程（离开设施）单独计
        if (isOut) {
          if (d < Z) {
            for (let p = 0; p < NPK; p++) { const c = comp[p]; if (c) { zDest[p * Z + d] += c; zDestM[p * Z + d] += c * q; } }
            if (ind > 0) { zDest[SH * Z + d] += indSh; zDest[LZ * Z + d] += indLz; zDestM[SH * Z + d] += indSh * pMc; zDestM[LZ * Z + d] += indLz * pMc; }
          } else {
            const f = d - Z;
            fIn[f] += F; fInM[f] += metro;
            for (let p = 0; p < NPK; p++) if (comp[p]) { fP[f * NPK + p] += comp[p]; fPM[f * NPK + p] += comp[p] * q; }
            if (ind > 0) { fP[f * NPK + SH] += indSh; fP[f * NPK + LZ] += indLz; fPM[f * NPK + SH] += indSh * pMc; fPM[f * NPK + LZ] += indLz * pMc; }
          }
        } else if (o >= Z) { const f = o - Z; fOut[f] += F; fOutM[f] += metro; }
      }
    }
  }

  // 地铁网络中从车站 s 出发的最短路树（广义成本），记录到各站的广义时间、实际时间与乘车里程，以及加载客流用的前驱与访问顺序。
  // r0：store 只存从 r0 开始的若干行（工作线程分段计算时用），主线程为 0
  function metroTree(net, cost, tAct, s, work, store, heap, tpen, r0) {
    const N = net.N, nn = net.nNodes, outStart = net.outStart, outEdge = net.outEdge, eTo = net.eTo, eKm = net.eKm;
    const gt = store.gt, tm = store.tm, km = store.km, pred = store.pred, order = store.order, nOrd = store.nOrd;
    const dist = work.dist, dtm = work.dtm, dkm = work.dkm, row = s - (r0 || 0);
    dist.fill(INF);
    heap.clear();
    dist[s] = 0; dtm[s] = 0; dkm[s] = 0;
    const pb = row * nn;
    pred[pb + s] = -1;
    heap.push(0, s);
    let no = 0;
    while (heap.n) {
      const u = heap.pop(), du = heap.lastKey;
      if (du > dist[u]) continue;
      order[pb + no++] = u;
      for (let k = outStart[u]; k < outStart[u + 1]; k++) {
        const e = outEdge[k], v = eTo[e], nd = du + cost[e];
        if (nd < dist[v]) { dist[v] = nd; dtm[v] = dtm[u] + tAct[e]; dkm[v] = dkm[u] + eKm[e]; pred[pb + v] = e; heap.push(nd, v); }
      }
    }
    nOrd[row] = no;
    const ob = row * N;
    for (let t = 0; t < N; t++) {
      // 至少包含一段实际乘车（乘车里程 > 0）；只靠站外步行连通的路径不算地铁行程
      if (dist[t] >= INF || t === s || !(dkm[t] > 0)) { gt[ob + t] = INF; tm[ob + t] = 0; km[ob + t] = 0; continue; }
      gt[ob + t] = dist[t] - tpen; tm[ob + t] = dtm[t]; km[ob + t] = dkm[t];
    }
  }
  // 车站 s0..s1 出发的客流沿最短路树回溯到各区间。D 的第 0 行对应车站 dBase，路径表的第 0 行对应车站 r0。
  // 会原样复制到工作线程执行；每段各自累加，再按段的顺序合计（见 iterate），线程多少不影响结果
  function metroLoadBlock(N, nn, eFrom, D, dBase, pred, order, nOrd, r0, s0, s1, out) {
    const load = out.load, accN = out.accN, stIn = out.stIn, stOut = out.stOut;
    for (let s = s0; s < s1; s++) {
      const row = (s - dBase) * N;
      let any = false;
      for (let tt = 0; tt < N; tt++) { const v = D[row + tt]; if (v > 0) { accN[tt] += v; stIn[s] += v; stOut[tt] += v; any = true; } }
      if (!any) continue;
      const pb = (s - r0) * nn;
      for (let q = nOrd[s - r0] - 1; q > 0; q--) {
        const n = order[pb + q], a = accN[n];
        if (a > 0) { const e = pred[pb + n]; if (e >= 0) { load[e] += a; accN[eFrom[e]] += a; } accN[n] = 0; }
      }
      accN[s] = 0;
    }
  }
  // 需求表的输出缓冲区：目的地编号与六个目的的往返次数
  function odBuffer(cap) { return { cap: cap, dest: new Int32Array(cap), t: [0, 1, 2, 3, 4, 5].map(function () { return new Float32Array(cap); }) }; }
  function odGrow(b, n, cap) {
    const nb = odBuffer(cap);
    nb.dest.set(b.dest.subarray(0, n)); for (let q = 0; q < 6; q++) nb.t[q].set(b.t[q].subarray(0, n));
    return nb;
  }
  // 单个起点的分目的出行分布（生产约束重力模型）：小区按各目的的吸引与距离衰减，重要设施作为独立目的地；
  // 候选目的地取综合份额最高的 240 个小区与份额足够的设施，各目的在候选中按比例分配；最后加上枢纽接驳
  function demandOrigin(D, i) {
    const Z = D.Z, F = D.F, A = D.A, Ls = D.Ls, fA = D.fA, fL = D.fL, rate = D.rate, rw = D.rw, zJobs = D.zJobs, zAsum = D.zAsum;
    const zCx = D.zCx, zCy = D.zCy, nx = D.nx, ny = D.ny, hostZ = D.hostZ, kmPerCell = D.kmPerCell;
    const w = D.w, wf = D.wf, scores = D.scores, s = D.s, kk = D.kk, cand = D.cand, candF = D.candF, tot = D.tot, o = D.out;
    const dest = o.dest, c0 = o.t[0], c1 = o.t[1], c2 = o.t[2], c3 = o.t[3], c4 = o.t[4], c5 = o.t[5];
    const w0 = w[0], w1 = w[1], w2 = w[2], w3 = w[3], w4 = w[4], A0 = A[0], A1 = A[1], A2 = A[2], A3 = A[3], A4 = A[4];
    const L0 = Ls[0], L1 = Ls[1], L2 = Ls[2], L3 = Ls[3], L4 = Ls[4];
    let n = D.n;
    const P = D.zPop[i];
    if (P >= 20) {
      s.fill(0);
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
      const xi = zCx[i], yi = zCy[i], corr = D.corr, RN = D.RN, zReg = D.zReg, cRow = corr ? zReg[i] * RN : 0;
      // 距离衰减 exp(-d / L) 查表（v2.2 性能）：按距离等间隔的表线性插值，相对误差约 1e-6，结果与逐个求指数一致；超出表的距离仍逐个求指数
      const X = D.lut, inv = X.inv, nT = X.n, T0 = X.t[0], T1 = X.t[1], T2 = X.t[2], T3 = X.t[3], T4 = X.t[4];
      for (let j = 0; j < Z; j++) {
        if (j === i || (zJobs[j] < 5 && zAsum[j] < 5)) { w0[j] = 0; w1[j] = 0; w2[j] = 0; w3[j] = 0; w4[j] = 0; continue; }
        const dx = xi - zCx[j], dy = yi - zCy[j], d = Math.sqrt(dx * dx + dy * dy) * kmPerCell;
        let v, e0, e1, e2, e3, e4;
        const u = d * inv, k = u | 0;
        if (k < nT) { const f = u - k; e0 = T0[k] + (T0[k + 1] - T0[k]) * f; e1 = T1[k] + (T1[k + 1] - T1[k]) * f; e2 = T2[k] + (T2[k + 1] - T2[k]) * f; e3 = T3[k] + (T3[k + 1] - T3[k]) * f; e4 = T4[k] + (T4[k + 1] - T4[k]) * f; }
        else { e0 = Math.exp(-d / L0); e1 = Math.exp(-d / L1); e2 = Math.exp(-d / L2); e3 = Math.exp(-d / L3); e4 = Math.exp(-d / L4); }
        const cf = corr ? corr[cRow + zReg[j]] : 1;   // 历史阶段的区域间走廊（通勤、购物）
        v = A0[j] > 0 ? A0[j] * e0 * cf : 0; w0[j] = v; s0 += v;
        v = A1[j] > 0 ? A1[j] * e1 : 0; w1[j] = v; s1 += v;
        v = A2[j] > 0 ? A2[j] * e2 * cf : 0; w2[j] = v; s2 += v;
        v = A3[j] > 0 ? A3[j] * e3 : 0; w3[j] = v; s3 += v;
        v = A4[j] > 0 ? A4[j] * e4 : 0; w4[j] = v; s4 += v;
      }
      s[0] = s0; s[1] = s1; s[2] = s2; s[3] = s3; s[4] = s4;
      for (let k = 0; k < F; k++) {
        if (!fL[k] || hostZ[Z + k] === i) { for (let p = 1; p < 5; p++) wf[p][k] = 0; continue; }
        const dx = xi - nx[Z + k], dy = yi - ny[Z + k], d = Math.sqrt(dx * dx + dy * dy) * kmPerCell, e = Math.exp(-d / fL[k]);
        for (let p = 1; p < 5; p++) { const v = fA[p][k] * e; wf[p][k] = v; s[p] += v; }
      }
      let nc = 0, nf = 0;
      // 各目的的份额系数（rw / s）先算好，逐个去向只做乘法
      const q0 = s[0] > 0 ? rw[0] / s[0] : 0, q1 = s[1] > 0 ? rw[1] / s[1] : 0, q2 = s[2] > 0 ? rw[2] / s[2] : 0, q3 = s[3] > 0 ? rw[3] / s[3] : 0, q4 = s[4] > 0 ? rw[4] / s[4] : 0;
      for (let j = 0; j < Z; j++) {
        const sh = q0 * w0[j] + q1 * w1[j] + q2 * w2[j] + q3 * w3[j] + q4 * w4[j];
        if (sh > 0.0015) { scores[j] = sh; cand[nc++] = j; }
      }
      const cs = cand.subarray(0, nc);
      cs.sort(function (a, b) { return scores[b] - scores[a]; });
      if (nc > 240) nc = 240;
      for (let k = 0; k < F; k++) {
        let sh = 0; for (let p = 1; p < 5; p++) if (s[p] > 0) sh += rw[p] * wf[p][k] / s[p];
        if (sh > 0.0003) candF[nf++] = k;
      }
      kk.fill(0);
      for (let q = 0; q < nc; q++) { const j = cand[q]; kk[0] += w0[j]; kk[1] += w1[j]; kk[2] += w2[j]; kk[3] += w3[j]; kk[4] += w4[j]; }
      for (let q = 0; q < nf; q++) { const k = candF[q]; for (let p = 1; p < 5; p++) kk[p] += wf[p][k]; }
      const r0 = P * rate[0], r1 = P * rate[1], r2 = P * rate[2], r3 = P * rate[3], r4 = P * rate[4];
      for (let q = 0; q < nc; q++) {
        const j = cand[q];
        dest[n] = j;
        let v;
        v = kk[0] > 0 ? r0 * w0[j] / kk[0] : 0; c0[n] = v; tot[0] += v;
        v = kk[1] > 0 ? r1 * w1[j] / kk[1] : 0; c1[n] = v; tot[1] += v;
        v = kk[2] > 0 ? r2 * w2[j] / kk[2] : 0; c2[n] = v; tot[2] += v;
        v = kk[3] > 0 ? r3 * w3[j] / kk[3] : 0; c3[n] = v; tot[3] += v;
        v = kk[4] > 0 ? r4 * w4[j] / kk[4] : 0; c4[n] = v; tot[4] += v;
        c5[n] = 0; n++;
      }
      for (let q = 0; q < nf; q++) {
        const k = candF[q];
        dest[n] = Z + k; c0[n] = 0;
        let v;
        v = kk[1] > 0 ? r1 * wf[1][k] / kk[1] : 0; c1[n] = v; tot[1] += v;
        v = kk[2] > 0 ? r2 * wf[2][k] / kk[2] : 0; c2[n] = v; tot[2] += v;
        v = kk[3] > 0 ? r3 * wf[3][k] / kk[3] : 0; c3[n] = v; tot[3] += v;
        v = kk[4] > 0 ? r4 * wf[4][k] / kk[4] : 0; c4[n] = v; tot[4] += v;
        c5[n] = 0; n++;
      }
    }
    // 枢纽接驳：城市（小区 i）↔ 车站 / 机场
    for (let h = 0; h < D.hubs.length; h++) {
      const v = D.hubTours[h][i]; if (!(v > 0)) continue;
      dest[n] = Z + D.hubs[h]; c0[n] = 0; c1[n] = 0; c2[n] = 0; c3[n] = 0; c4[n] = 0; c5[n] = v; tot[5] += v; n++;
    }
    D.n = n;
  }

  // 日期 → 日类型（周六、周日为周末；节假日不单独模拟）
  Model.dayType = function (y, m, d) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 || w === 6 ? 'we' : 'wd'; };
  Model.DT_NAME = { wd: '工作日', we: '周末', avg: '周平均' };

  function Model(city, opts) {
    this.city = city;
    this.ZW = CFG.W / CFG.ZONE; this.ZH = CFG.H / CFG.ZONE; this.Z = this.ZW * this.ZH;
    this.BW = Math.ceil(this.ZW / 2); this.BH = Math.ceil(this.ZH / 2); this.B = this.BW * this.BH;
    const norm = function (prof) { const s = prof.reduce(function (a, b) { return a + b; }, 0); return prof.map(function (v) { return v / s; }); };
    this.profiles = { wd: norm(CFG.hourProfile.slice()), we: norm((CFG.hourProfileWe || CFG.hourProfile).slice()) };
    this.hourPeriod = new Int8Array(24);
    this.pHours = []; this.pMeans = { wd: [], we: [] };
    const self = this;
    CFG.periods.forEach(function (pd, p) {
      pd.hours.forEach(function (h) { self.hourPeriod[h] = p; });
      self.pHours.push(pd.hours.length);
      for (const dt of DT) self.pMeans[dt].push(pd.hours.reduce(function (a, h) { return a + self.profiles[dt][h]; }, 0) / pd.hours.length);
    });
    this.dayType = 'wd'; this.profile = this.profiles.wd; this.pMean = this.pMeans.wd;
    this.year = CFG.START.y;
    this.fare = Object.assign({}, CFG.fareDefault);
    this.heap = new U.Heap(8192);
    this.zoneCells = [];
    const Z = CFG.ZONE;
    for (let z = 0; z < this.Z; z++) {
      const zi = z % this.ZW, zj = (z / this.ZW) | 0, arr = [];
      for (let j = zj * Z; j < zj * Z + Z; j++) for (let i = zi * Z; i < zi * Z + Z; i++) arr.push(j * CFG.W + i);
      this.zoneCells.push(Int32Array.from(arr));
    }
    this.zPop = new Float32Array(this.Z); this.zJobs = new Float32Array(this.Z); this.zAttr = new Float32Array(this.Z);
    this.zA = new Float32Array(4 * this.Z); this.zHub = new Float32Array(this.Z); this.zReg = new Int16Array(this.Z);
    this.zCx = new Float32Array(this.Z); this.zCy = new Float32Array(this.Z);
    this.road = city.car; this.roadVer = city.roadVersion;
    this.prepareRoad();
    this.arcZone = null; this.computeArcZones();
    this.fn = null;
    if(!opts||!opts.deferDemand){this.buildZones(); this.buildDemand();}
    this.net = null;
    this.ctxs = { wd: this.newCtx(NP, 'wd'), we: this.newCtx(NP, 'we') };
    this.live = this.ctxs.wd;
    this.gen = null; this.predJob = null;
    this.liveBuf = {}; this.predBuf = {};
    this.cycles = 0; this.version = 0;
    this.daily = null;
  }
  CM.Model = Model;

  // epoch：求解流程被放弃（重新开始）时递增，工作线程队列中属于旧流程的计算块不再发出
  Model.prototype.wake = function (cycles) { this.solveLimit = cycles || 2; this.settled = false; this.gen = null; this.epoch = (this.epoch || 0) + 1; };
  Model.prototype.setYear = function (y) { if (this.year !== y) this.wake(1); this.year = y; this.capF = U.interp(CFG.road.capGrowth, y); };
  // 当天的日类型：实时画面（车流、客流、拥堵）与当天的票款使用对应的求解结果；两套结果都在后台保持收敛
  Model.prototype.setDayType = function (dt) {
    dt = dt === 'we' ? 'we' : 'wd';
    if (dt === this.dayType) return;
    this.dayType = dt; this.live = this.resultsFor(dt); this.profile = this.profiles[dt]; this.pMean = this.pMeans[dt];
    this.dailyNow = dt === 'we' ? this.dailyWe : this.dailyWk;
    this.version++;
  };
  Model.prototype.dailyFor = function (dt) { return dt === 'we' ? this.dailyWe : (dt === 'wd' ? this.dailyWk : this.daily); };
  // 当前通行能力（含系统道路改造增长）
  Model.prototype.cap = function (a) { return this.road.arcCap[a] * (this.capF || 1); };
  Model.prototype.params = function () {
    const c = CFG.choice, y = this.year;
    return {
      vot: U.interp(c.vot, y), cpk: U.interp(c.carCostPerKm, y), park: U.interp(c.parking, y), occ: U.interp(c.occupancy, y),
      theta: c.theta, walkW: c.walkW, waitW: c.waitW, tpen: c.transferPen, opn: c.outTransferPen, carAccess: c.carAccess,
    };
  };
  // 票价（v2.1 第二轮）：统一票价（flat）或按里程计费（dist：起步价 flat 含 km0 公里，之后每 step 公里加 inc，最高 cap，0 为不封顶）。
  // 里程取所选进出站之间的地铁乘车距离，换乘不另收费；统一票价时 inc 为 0，与原来的计算逐位相同
  Model.prototype.fareFor = function () { return this.fare.flat; };
  Model.fareParams = function (f) {
    const d = f && f.mode === 'dist';
    return { km0: d ? f.km0 : 0, step: d ? f.step : 1, inc: d ? f.inc : 0, cap: d ? f.cap : 0 };
  };
  Model.fareAt = function (f, km) {
    let v = f.flat;
    if (f.mode === 'dist' && f.inc > 0 && km > f.km0) { v += Math.ceil((km - f.km0) / f.step - 1e-9) * f.inc; if (f.cap > 0 && v > f.cap) v = f.cap; }
    return v;
  };
  // 物价参考票价（v2.6.1）：开局票价按本图造价指数折算到当年
  Model.fareRef = function (y) { const f0 = CFG.fareDefault.flat, inf = CFG.cost.inflation, b = CFG.econBase || 1990; return f0 * U.priceIndex(y, inf, b) / U.priceIndex(CFG.START.y, inf, b); };
  // 票价折合多少分钟（v2.6.1 玩家反馈）。原来直接按「票价 ÷ 时间价值」：早期时间价值很低，票价 2 元相当于 48 分钟，涨 25% 客流掉三成多、票款反而减少；
  // 后期相当于 3 分钟，涨一倍也几乎没影响。现在以物价参考票价为锚：跟着物价涨不会被额外惩罚，超过参考票价越多越难接受，各年代的涨价反应接近
  Model.fareMinutes = function (fare, ref, vot) {
    if (!(fare > 0)) return 0;
    const c = CFG.choice, mRef = ref / vot * 60, r = fare / ref, L = Math.log(r), S = c.fareSens || 0;
    if (!S) return fare / vot * 60;
    if (r >= 1) return mRef + S * L + (c.fareOver || 0) * L * L;
    return Math.max(mRef + S * L, mRef * r);
  };
  // 某乘距的票价折合分钟：长途的参考票价按开局的里程阶梯放大（统一票价的地图不放大）
  Model.fareMinAt = function (f, km, y, vot) {
    const D = CFG.fareDist; let k = 1;
    if (CFG.fareDefault.dist !== false && D && km > D.km0) k = Math.min(1 + Math.ceil((km - D.km0) / D.step - 1e-9) * D.inc, D.cap);
    return Model.fareMinutes(Model.fareAt(f, km), Model.fareRef(y) * k, vot);
  };
  // 方式选择用的查表（逐 OD 不做对数运算）：下标为起步里程之外的计费段数
  Model.fareTab = function (f, y, vot) {
    const fp = Model.fareParams(f), out = [], nMax = fp.inc > 0 ? Math.min(63, fp.cap > 0 ? Math.max(1, Math.ceil((fp.cap - f.flat) / fp.inc)) : 63) : 0;
    for (let n = 0; n <= nMax; n++) out.push(Model.fareMinAt(f, n ? fp.km0 + (n - 0.5) * fp.step : Math.min(fp.km0, CFG.fareDist ? CFG.fareDist.km0 : 0), y, vot));
    return out;
  };
  // 输入签名用的票价键：统一票价仍是数值本身（与旧版缓存、签名一致），按里程时为参数串
  Model.fareKey = function (f) { return f.mode === 'dist' ? 'd' + [f.flat, f.km0, f.step, f.inc, f.cap].join(',') : f.flat; };

  // ---------------- 重要设施节点 ----------------
  // 运营中的重要设施作为独立的目的地节点（编号 Z + k）：位置、场地格与步行接驳单独计算；道路行程按所在小区计算
  Model.prototype.buildFacNodes = function () {
    const city = this.city, Z = this.Z, Fac = CM.Fac;
    const all = Fac ? Fac.list(city) : [];
    const list = all.filter(function (f) { return Fac.active(f, this.year, city); }, this);
    const F = list.length, NZ = Z + F;
    const hostZ = new Int32Array(NZ), nx = new Float32Array(NZ), ny = new Float32Array(NZ), reach = new Float32Array(F);
    for (let z = 0; z < Z; z++) hostZ[z] = z;
    const cells = [], cellFac = new Map(), ringFac = new Map(), inner = new Float32Array(F), excl = new Uint8Array(city.N), we = new Float32Array(F);
    const walk = city.walk, VW = city.VW;
    const onRoad = function (cc) { if (!walk) return true; const v = ((cc / city.W) | 0) * VW + cc % city.W; return walk.deg[v] > 0 || walk.deg[v + 1] > 0 || walk.deg[v + VW] > 0 || walk.deg[v + VW + 1] > 0; };
    list.forEach(function (f, k) {
      const c0 = city.cellAt(f.x, f.y);
      hostZ[Z + k] = c0 >= 0 ? city.zoneOf(c0) : 0; nx[Z + k] = f.x; ny[Z + k] = f.y;
      const cs = Fac.siteCells(f, city); cells.push(Int32Array.from(cs));
      for (const c of cs) { let a = cellFac.get(c); if (!a) { a = []; cellFac.set(c, a); } a.push(k); if (f.lmK >= 0) excl[c] = 1; }
      // 出入口（v2.2 修正）：场地格及其外围一圈的陆地格。公园、宫苑、填海地等场地内部没有可步行的街道时，
      // 车站只要能步行到达场地边缘即可服务整个设施（另计场内步行时间），不再因场内不可步行而永远无法接驳
      const seen = new Set();
      let linked = false;
      const addRing = function (cc) { let a = ringFac.get(cc); if (!a) { a = []; ringFac.set(cc, a); } a.push(k); if (onRoad(cc)) linked = true; };
      for (const c of cs) { const i = c % city.W, j = (c / city.W) | 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= city.W || jj >= city.H) continue;
          const cc = jj * city.W + ii; if (seen.has(cc) || city.landFrac[cc] < 0.3) continue; seen.add(cc);
          addRing(cc);
        } }
      // 场地周围没有路（v2.6.1）：入口向外延伸到最近的路（最多约 1 km、不跨水面），这段路程计入场内步行
      if (!linked && walk && !f.ext) {
        let x0 = city.W, x1 = 0, y0 = city.H, y1 = 0;
        seen.forEach(function (c) { const i = c % city.W, j = (c / city.W) | 0; if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; });
        for (let r = 1; r <= 4 && !linked; r++) {
          for (let jj = y0 - r; jj <= y1 + r; jj++) for (let ii = x0 - r; ii <= x1 + r; ii++) {
            if ((jj !== y0 - r && jj !== y1 + r && ii !== x0 - r && ii !== x1 + r) || ii < 0 || jj < 0 || ii >= city.W || jj >= city.H) continue;
            const cc = jj * city.W + ii; if (seen.has(cc) || city.landFrac[cc] < 0.3 || !onRoad(cc)) continue;
            let wet = false;
            for (let t = 0.1; t < 0.95 && !wet; t += 0.1) if (city.waterDistAt(f.x + (ii + 0.5 - f.x) * t, f.y + (jj + 0.5 - f.y) * t) < 0) wet = true;
            if (wet) continue;
            seen.add(cc); addRing(cc); reach[k] = r * CFG.CELL_M;
          }
        }
      }
      inner[k] = Math.min(600, Math.sqrt(cs.length) * CFG.CELL_M * 0.4);   // 场内步行（米），大型公园与会展场馆约数分钟
      we[k] = f.we || f.T.we || 1;   // 单个设施可覆盖周末倍数（如主题乐园，v2.2）
    });
    const key = list.map(function (f) { return f.id; }).join(',');
    if (this.fn && this.fn.key !== key) this.facDaily = null;
    this.fn = { F: F, NZ: NZ, list: list, ids: list.map(function (f) { return f.id; }), key: key, hostZ: hostZ, nx: nx, ny: ny, cells: cells, cellFac: cellFac, ringFac: ringFac, inner: inner, reach: reach, excl: excl, we: we };
    return this.fn;
  };
  Model.prototype.facIndex = function (id) { return this.fn ? this.fn.ids.indexOf(id) : -1; };

  // ---------------- 小区与需求 ----------------
  // 小区汇总：人口、岗位；普通设施的分目的吸引量（上学、购物、医疗、休闲，按用地与人口估算）；枢纽接驳的城市端权重。
  // 地标类重要设施的场地格不计入小区吸引（由设施节点单独吸引），避免重复计算
  Model.prototype.buildZones = function () {
    const city = this.city, LU = CM.LU, Z = this.Z;
    const fn = this.buildFacNodes(), excl = fn.excl;
    const A = this.zA, hub = this.zHub;
    for (let z = 0; z < Z; z++) {
      let p = 0, j = 0, a = 0, sx = 0, sy = 0, sw = 0, aSc = 0, aSh = 0, aMd = 0, aLz = 0, h = 0, bw = -1, bc = this.zoneCells[z][0];
      for (const c of this.zoneCells[z]) {
        const pc = city.pop[c], jc = city.jobs[c];
        p += pc; j += jc;
        const L = city.lu[c], com = L === LU.COM || L === LU.MIX;
        a += jc * (com ? 1.0 : (L === LU.INST ? 0.8 : 0.35)) + pc * 0.22;
        h += pc + jc * (com ? 0.6 : 0.2);
        if (!excl[c]) {
          aSc += pc * 0.25 + (L === LU.INST ? jc * 1.2 : 0);
          aSh += jc * (com ? 1 : (L === LU.RES ? 0.5 : (L === LU.IND ? 0.1 : 0.3))) + pc * 0.05;
          aMd += (L === LU.INST ? jc * 0.5 : 0) + (com ? jc * 0.05 : 0) + pc * 0.03;
          aLz += (city.isPark[c] || L === LU.PARK ? 400 * city.landFrac[c] : 0) + (L === LU.HILL ? 60 * city.landFrac[c] : 0) + (com ? jc * 0.25 : 0) + pc * 0.12 + (L === LU.LANDMARK ? 200 : 0);
        }
        const w = pc + jc;
        if (w > bw) { bw = w; bc = c; }
        sx += w * ((c % CFG.W) + 0.5); sy += w * (((c / CFG.W) | 0) + 0.5); sw += w;
      }
      this.zPop[z] = p; this.zJobs[z] = j; this.zAttr[z] = a; this.zReg[z] = city.region[bc];   // 小区所属片区：人口与岗位最多的格所在片区（历史阶段的出行走廊用）
      A[z] = aSc; A[Z + z] = aSh; A[2 * Z + z] = aMd; A[3 * Z + z] = aLz; hub[z] = h;
      const zi = z % this.ZW, zj = (z / this.ZW) | 0;
      this.zCx[z] = sw > 1 ? sx / sw : zi * CFG.ZONE + CFG.ZONE / 2;
      this.zCy[z] = sw > 1 ? sy / sw : zj * CFG.ZONE + CFG.ZONE / 2;
      fn.nx[z] = this.zCx[z]; fn.ny[z] = this.zCy[z];
    }
  };
  Model.prototype.buildDemand = function () {
    const g = this.buildDemandGen();
    while (!g.next().done) { /* run */ }
  };
  // 每人每日的出行率（来回各一次计为一次往返）：通勤、上学、购物、医疗、休闲
  Model.prototype.tripRates = function (y) {
    const c = CFG.choice, ps = c.purposeShare;
    const wr = U.interp(c.workerRate, y), hr = U.interp(c.hoRate, y);
    const sc = U.interp(ps.sc, y), md = U.interp(ps.md, y), lz = U.interp(ps.lz, y), sh = Math.max(0.05, 1 - sc - md - lz);
    return [wr, hr * sc, hr * sh, hr * md, hr * lz];
  };
  // 周末各目的出行相对工作日的倍数：双休日制度下取 CFG.trips.weekend；周六仍上班、上课的年代（CFG.workWeek）
  // 周六的通勤约为工作日的 95%、上学约 90%，周日不变，周末两天平均
  Model.prototype.weekendMult = function (y) {
    const T = CFG.trips.weekend, ww = CFG.workWeek || {};
    const sat = ww.sat ? U.clamp(U.interp(ww.sat, y), 0, 1) : 0, sch = ww.school ? U.clamp(U.interp(ww.school, y), 0, 1) : 0;
    const out = PK.map(function (k) { return T[k]; });
    out[HW] = T.hw + (0.95 - T.hw) * sat * 0.5;
    out[1] = T.sc + (0.9 - T.sc) * sch * 0.5;
    return out;
  };
  // 时间切片版本：每 16 个起点让出一次；结果在最后一次性替换 this.od
  // 生产约束的重力模型：各目的的出行总量只由居住人口与出行率决定，设施只改变去向（不凭空增加出行）；
  // 枢纽接驳由设施给定（外生的铁路与航空旅客），按人口与岗位分布到全市
  Model.prototype.buildDemandGen = function* () {
    const Z = this.Z, y = this.year, c = CFG.choice, T = CFG.trips, Fac = CM.Fac;
    const fn = this.fn, F = fn.F, NZ = fn.NZ;
    // 历史发展阶段（v2.2，eras.js）：各目的出行强度、通勤与生活出行的距离、枢纽接驳与区域间走廊随年代平滑变化
    const ED = CM.Eras && CM.Eras.enabled() ? CM.Eras.demand(y) : null;
    const L1 = U.interp(c.distDecayHW, y) * (ED ? ED.decayHW : 1), L2 = U.interp(c.distDecayHO, y) * (ED ? ED.decayHO : 1);
    const rate = this.tripRates(y);
    if (ED) for (let p = 0; p < 5; p++) rate[p] *= ED.rate[p];
    // 走廊：片区对之间的去向倍数（对称），作用于通勤与购物；没有走廊时为 null，计算与旧版相同
    let corr = null, RN = 0;
    if (ED && ED.corr.length) {
      const regs = this.city.regions, at = new Map(); regs.forEach(function (r, k) { at.set(r.id, k); });
      RN = regs.length; corr = new Float32Array(RN * RN).fill(1);
      for (const cr of ED.corr) { if (!at.has(cr.a) || !at.has(cr.b)) continue; const a = at.get(cr.a), b = at.get(cr.b); corr[a * RN + b] = cr.f; corr[b * RN + a] = cr.f; }
    }
    const Ls = [L1, L2 * T.decay.sc, L2 * T.decay.sh, L2 * T.decay.md, L2 * T.decay.lz];
    const kmPerCell = CFG.CELL_M / 1000 * 1.2;
    // 各目的的小区吸引（工作 = 岗位）；重要设施按参考比例取得吸引量，并从所在小区扣除（地标类设施的场地已在 buildZones 中排除）
    const A = [this.zJobs, new Float64Array(Z), new Float64Array(Z), new Float64Array(Z), new Float64Array(Z)];
    const sumA = [0, 0, 0, 0, 0];
    for (let p = 1; p < 5; p++) for (let z = 0; z < Z; z++) { A[p][z] = this.zA[(p - 1) * Z + z]; sumA[p] += A[p][z]; }
    const fA = [null, new Float64Array(F), new Float64Array(F), new Float64Array(F), new Float64Array(F)];
    const fL = new Float64Array(F), hubs = [];
    // 各目的的设施吸引合计不超过 trips.facCap（放大设施吸引后，避免设施占去该目的的大部分出行）
    const fSum = [0, 0, 0, 0, 0], capK = [1, 1, 1, 1, 1], FCAP = T.facCap || 1;
    for (let k = 0; k < F; k++) { const f = fn.list[k]; if (f.T.hub) continue; const s = Fac.share(f, y); for (let p = 1; p < 5; p++) fSum[p] += s * (f.p[PK[p]] || 0); }
    for (let p = 1; p < 5; p++) if (fSum[p] > FCAP) capK[p] = FCAP / fSum[p];
    for (let k = 0; k < F; k++) {
      const f = fn.list[k];
      if (f.T.hub) { hubs.push(k); continue; }
      fL[k] = L2 * f.T.L;
      const s = Fac.share(f, y);
      for (let p = 1; p < 5; p++) {
        const fr = f.p[PK[p]] || 0; if (!fr) continue;
        const a = s * fr * capK[p] * sumA[p];
        fA[p][k] = a;
        if (f.lmK < 0) { const hz = fn.hostZ[Z + k]; A[p][hz] = Math.max(A[p][hz] * 0.3, A[p][hz] - a); }
      }
    }
    // 枢纽接驳：城市一端按人口与岗位（含商务、酒店）分布，距离衰减较弱
    const Lh = L1 * T.decay.hub, hubTours = hubs.map(function (k) {
      const f = fn.list[k], out = new Float64Array(Z), tot = Fac.pax(f, y) / 2 * (ED ? ED.hub : 1);
      let s = 0;
      for (let z = 0; z < Z; z++) {
        if (this.zHub[z] <= 0 || z === fn.hostZ[Z + k]) continue;
        const d = U.dist(f.x, f.y, this.zCx[z], this.zCy[z]) * kmPerCell;
        out[z] = this.zHub[z] * Math.exp(-d / Lh); s += out[z];
      }
      if (s > 0) for (let z = 0; z < Z; z++) out[z] *= tot / s;
      return out;
    }, this);
    const rsum = rate[0] + rate[1] + rate[2] + rate[3] + rate[4];
    const zAsum = new Float64Array(Z);
    for (let z = 0; z < Z; z++) zAsum[z] = A[1][z] + A[2][z] + A[3][z] + A[4][z];
    // 输出写入复用的类型数组（两套交替使用：新的需求表算完前，旧表保持不变）
    this._odBufs = this._odBufs || [null, null];
    const cur = this.od && this.od.dest ? this.od.dest.buffer : null;
    this._odFlip = this._odBufs[0] && this._odBufs[0].dest.buffer === cur ? 1 : 0;   // 用当前需求表没有引用的那一套
    let ob = this._odBufs[this._odFlip];
    const per = 240 + F + hubs.length;
    if (!ob || ob.cap < Z * 120) ob = this._odBufs[this._odFlip] = odBuffer(Z * 160);
    // 距离衰减表（见 demandOrigin）：覆盖整张地图的对角距离，步长 5 m
    const LH = 0.005, nT = Math.ceil(Math.hypot(CFG.W, CFG.H) * kmPerCell / LH) + 1;
    const lut = { inv: 1 / LH, n: nT, t: Ls.map(function (Lk) { const t = new Float64Array(nT + 1); for (let k = 0; k <= nT; k++) t[k] = Math.exp(-k * LH / Lk); return t; }) };
    const D = { Z: Z, F: F, A: A, Ls: Ls, lut: lut, corr: corr, RN: RN, zReg: this.zReg, fA: fA, fL: fL, rate: rate, rw: rate.map(function (r) { return r / rsum; }), zPop: this.zPop, zJobs: this.zJobs, zAsum: zAsum,
      zCx: this.zCx, zCy: this.zCy, nx: fn.nx, ny: fn.ny, hostZ: fn.hostZ, kmPerCell: kmPerCell, hubs: hubs, hubTours: hubTours,
      w: [new Float64Array(Z), new Float64Array(Z), new Float64Array(Z), new Float64Array(Z), new Float64Array(Z)],
      wf: [null, new Float64Array(F), new Float64Array(F), new Float64Array(F), new Float64Array(F)],
      scores: new Float64Array(Z), s: new Float64Array(5), kk: new Float64Array(5), cand: new Int32Array(Z), candF: new Int32Array(Math.max(1, F)),
      out: ob, n: 0, tot: new Float64Array(NPK) };
    const start = new Int32Array(Z + 1);
    for (let i = 0; i < Z; i++) {
      if (i > 0 && (i & 15) === 0) yield;
      if (D.out.cap - D.n < per) D.out = this._odBufs[this._odFlip] = odGrow(D.out, D.n, Math.max(D.out.cap * 2, D.n + per * 64));
      demandOrigin(D, i);
      start[i + 1] = D.n;
    }
    const n = D.n, o = D.out;
    this.od = { start: start, dest: o.dest.subarray(0, n), t: o.t.map(function (a) { return a.subarray(0, n); }), tot: D.tot, F: F, NZ: NZ, key: fn.key };
    this.version++;
  };
  // 分步版本（月度处理中使用，避免单帧长时间停顿）。进行期间暂停实时求解与预测（见 step），
  // 使其不会读到新旧混合的小区/需求/路网状态；计算结果与一次性执行相同。
  Model.prototype.refreshCityGen = function* (C) {
    this.refreshing = true;
    this.cancelPredict();
    try {
      this.buildZones();
      yield* this.buildDemandGen();
      if (this.city.roadVersion !== this.roadVer) { this.syncRoad(); yield; }
      if (this.net || C) { const NC = C || this.net.C, acc = yield* this.computeAccessGen(NC); this.setNetwork(NC, true, acc); } // 步行网络与覆盖随城市变化重算
      this.gen = null;
    } finally {
      this.refreshing = false;
    }
  };

  // ---------------- 道路网络同步 ----------------
  Model.prototype.computeArcZones = function () {
    const road = this.road, city = this.city;
    const az = new Int16Array(road.nA);
    for (const L of road.links) {
      const m = L.pts[Math.floor(L.pts.length / 2)];
      const c = city.cellAt(m[0], m[1]);
      const z = c < 0 ? 0 : city.zoneOf(c);
      az[2 * L.id] = z; az[2 * L.id + 1] = z;
    }
    this.arcZone = az;
  };
  // Immutable road topology in a compact layout; keep connection order and Float64 costs.
  Model.prototype.prepareRoad = function () {
    const road = this.road, start = new Int32Array(this.Z + 1), zones = [], nodes = [], times = [], km = [];
    for (let z = 0; z < this.Z; z++) {
      const list = road.zoneConn[z] || [];
      if (list.length) zones.push(z);
      for (const c of list) { nodes.push(c.node); times.push(c.t); km.push(c.km); }
      start[z + 1] = nodes.length;
    }
    this.roadData = { start: start, zones: Int32Array.from(zones), nodes: Int32Array.from(nodes), times: Float64Array.from(times), km: Float64Array.from(km), arcKm: Float64Array.from(road.arcLen, function (v) { return v / 1000; }), uniqueKeys: new Set(road.links.map(function (L) { return L.key; })).size === road.links.length };
  };
  Model.prototype.syncRoad = function () {
    this.wake();
    this.results=null;
    const old = this.road, nw = this.city.car;
    // Preserve legacy state remapping even for identical graphs with duplicate link keys.
    if (old === nw && this.roadData.uniqueKeys) { this.roadVer = this.city.roadVersion; this.version++; return; }
    const map = new Map();
    old.links.forEach(function (L) { map.set(L.key, L); });
    const remap = function (arr, fillFn) {
      const out = new Float32Array(nw.nA);
      for (const L of nw.links) {
        const o = map.get(L.key);
        for (let d = 0; d < 2; d++) {
          const a = 2 * L.id + d;
          if (o) {
            const sameDir = o.verts[0] === L.verts[0];
            out[a] = arr[2 * o.id + (sameDir ? d : 1 - d)];
          } else out[a] = fillFn(a);
        }
      }
      return out;
    };
    for (const dt of DT) {
      for (const P of this.ctxs[dt].per) {
        if (!P) continue;
        P.arcVol = remap(P.arcVol, function () { return 0; });
        P.arcTime = remap(P.arcTime, function (a) { return nw.arcT0[a]; });
      }
    }
    this.road = nw; this.roadVer = this.city.roadVersion;
    this.prepareRoad();
    this.computeArcZones();
    this.version++;
  };

  // ---------------- 地铁网络与步行接驳 ----------------
  // 建设提示只查询现有步行图，不运行客流预测，也不占用求解器的堆和工作数组。
  Model.prototype.walkTransferPreview = function (from, stations) {
    const city=this.city,walk=city.walk,limit=CFG.walk.transferMaxM,scale=CFG.CELL_M,rules=limit+':'+scale;
    if(this._hintWalk!==walk||this._hintRules!==rules){this._hintWalk=walk;this._hintRules=rules;this._hintTrees=new Map();}
    const c=city.cellAt(from.x,from.y);if(c<0||!walk)return [];
    const targets=stations.filter(s=>s.id!==from.id&&U.dist(from.x,from.y,s.x,s.y)*scale<=limit+150);if(!targets.length)return [];
    const key=from.x+':'+from.y;let tree=this._hintTrees.get(key);
    const corners=c=>{const i=c%city.W,j=(c/city.W)|0,v=j*city.VW+i;return [v,v+1,v+city.VW,v+city.VW+1];};
    if(!tree){const dist=new Map(),pred=new Map(),heap=new U.Heap(64);
      for(const v of corners(c)){if(!walk.deg[v])continue;const d=U.dist(from.x,from.y,city.vx[v],city.vy[v])*scale;if(d<=limit&&d<(dist.get(v)??Infinity)){dist.set(v,d);pred.set(v,-1);heap.push(d,v);}}
      while(heap.n){const u=heap.pop(),du=heap.lastKey;if(du>dist.get(u))continue;for(let e=walk.start[u];e<walk.start[u+1];e++){const v=walk.to[e],nd=du+walk.len[e];if(nd<=limit&&nd<(dist.get(v)??Infinity)){dist.set(v,nd);pred.set(v,u);heap.push(nd,v);}}}
      tree={dist,pred};if(this._hintTrees.size>=64)this._hintTrees.delete(this._hintTrees.keys().next().value);this._hintTrees.set(key,tree);
    }
    const links=[];for(const s of targets){const c2=city.cellAt(s.x,s.y);if(c2<0)continue;let best=Infinity,end=-1;
      for(const v of corners(c2)){const d=(tree.dist.get(v)??Infinity)+U.dist(s.x,s.y,city.vx[v],city.vy[v])*scale;if(d<best){best=d;end=v;}}
      if(best>limit)continue;const path=[];let v=end,guard=0;while(v>=0&&guard++<city.V){path.push([city.vx[v],city.vy[v]]);v=tree.pred.get(v)??-1;}path.reverse();path.unshift([from.x,from.y]);path.push([s.x,s.y]);links.push({station:s.id,metres:best,path});
    }return links;
  };
  // 小区与重要设施节点的接驳表：可步行到达的车站（最多 4 个）、覆盖比例与平均步行时间
  // 分步执行（v2.5 性能）：月结时每处理一批车站让出主线程；结果与一次算完相同
  Model.prototype.computeAccess = function (C) { const it = this.computeAccessGen(C); let r = it.next(); while (!r.done) r = it.next(); return r.value; };
  Model.prototype.computeAccessGen = function* (C) {
    const city = this.city, walk = city.walk, VW = city.VW, N = C.stations.length;
    const maxM = CFG.walk.maxAccessM, xferM = CFG.walk.transferMaxM, extra = CFG.walk.cellExtraM, mpm = CFG.walk.mPerMin;
    const nC = city.N, Z = this.Z, fn = this.fn, F = fn ? fn.F : 0, NZ = Z + F;
    const cellWalk = new Float32Array(nC).fill(Infinity), cellStation = new Int32Array(nC).fill(-1);
    const dist = this._wdist || (this._wdist = new Float64Array(city.V).fill(INF));
    if (dist.length !== city.V) { this._wdist = new Float64Array(city.V).fill(INF); }
    const D_ = this._wdist;
    const pred = this._wpred || (this._wpred = new Int32Array(city.V));
    const touched = [];
    const heap = this.heap;
    const zMap = new Map(), fMap = new Map(), eMap = new Map();
    const cellFac = fn ? fn.cellFac : null, ringFac = fn ? fn.ringFac : null;
    const trees = [], accessible = new Uint8Array(N), catchPop = new Float32Array(N), transfers = [];
    const limit = Math.max(maxM, xferM) + 200;
    const treeRules = maxM + ':' + xferM + ':' + CFG.CELL_M;
    if (this._treeWalk !== walk || this._treeRules !== treeRules) { this._treeWalk = walk; this._treeRules = treeRules; this._walkTrees = new Map(); }
    const treeCache = this._walkTrees;
    for (let k = 0; k < N; k++) {
      if ((k & 31) === 31) yield;
      const st = C.stations[k];
      trees.push(null);
      const c0 = city.cellAt(st.x, st.y);
      if (c0 < 0) continue;
      const ci = c0 % city.W, cj = (c0 / city.W) | 0;
      heap.clear(); touched.length = 0;
      const treeKey = st.x + ':' + st.y;
      const cachedTree = treeCache.get(treeKey);
      if (cachedTree) {
        trees[k] = cachedTree.tree; accessible[k] = 1;
        for (let q = 0; q < cachedTree.tree.verts.length; q++) { const v = cachedTree.tree.verts[q]; touched.push(v); D_[v] = cachedTree.exact[q]; }
      } else {
        const corners = [cj * VW + ci, cj * VW + ci + 1, (cj + 1) * VW + ci, (cj + 1) * VW + ci + 1];
        for (const v of corners) {
          if (walk.deg[v] === 0) continue;
          const d0 = U.dist(st.x, st.y, city.vx[v], city.vy[v]) * CFG.CELL_M;
          if (d0 < D_[v]) { if (D_[v] >= INF) touched.push(v); D_[v] = d0; pred[v] = -1; heap.push(d0, v); }
        }
        if (!heap.n) continue;
        accessible[k] = 1;
        while (heap.n) {
          const u = heap.pop(), du = heap.lastKey;
          if (du > D_[u]) continue;
          for (let e = walk.start[u]; e < walk.start[u + 1]; e++) {
            const v = walk.to[e], nd = du + walk.len[e];
            if (nd < D_[v] && nd <= limit) {
              if (D_[v] >= INF) touched.push(v);
              D_[v] = nd; pred[v] = u; heap.push(nd, v);
            }
          }
        }
        // 行人路径树（未通车站也保留，用于详情中的“接入线路后的潜在覆盖”）
        const tv = Int32Array.from(touched), td = new Float32Array(tv.length), tp = new Int32Array(tv.length);
        for (let q = 0; q < tv.length; q++) { td[q] = D_[tv[q]]; tp[q] = pred[tv[q]]; }
        trees[k] = { verts: tv, dist: td, pred: tp };
        const exact = new Float64Array(tv.length);
        for (let q = 0; q < tv.length; q++) exact[q] = D_[tv[q]];
        // 上限须高于大型线网的车站数（v2.3）：原先 512，六百多座车站时每次改线都清空重算全部步行树
        if (treeCache.size >= Math.max(2048, N * 2)) treeCache.clear();
        treeCache.set(treeKey, { tree: trees[k], exact: exact });
      }
      // 只有接入运营线路的车站提供服务：未通车站不计覆盖、不参与接驳与站外换乘
      if (C.serviced && !C.serviced[k]) { for (const v of touched) D_[v] = INF; continue; }
      // 覆盖格
      for (let j = Math.max(0, cj - 6); j <= Math.min(city.H - 1, cj + 6); j++) {
        for (let i = Math.max(0, ci - 6); i <= Math.min(city.W - 1, ci + 6); i++) {
          const v0 = j * VW + i;
          const cd = Math.min(D_[v0], D_[v0 + 1], D_[v0 + VW], D_[v0 + VW + 1]) + extra;
          if (cd > maxM) continue;
          const c = j * city.W + i;
          if (cd < cellWalk[c]) { cellWalk[c] = cd; cellStation[c] = k; }
          // 重要设施的场地格：按格计（设施本身可能没有居住人口）
          const fl = cellFac && cellFac.get(c);
          if (fl) for (const f of fl) { let m = fMap.get(f); if (!m) { m = new Map(); fMap.set(f, m); } const e = m.get(k) || [0, 0]; e[0] += 1; e[1] += cd; m.set(k, e); }
          const rl = ringFac && ringFac.get(c);
          if (rl) for (const f of rl) { let m = eMap.get(f); if (!m) { m = new Map(); eMap.set(f, m); } const d0 = m.get(k); if (d0 === undefined || cd < d0) m.set(k, cd); }
          const w = city.pop[c] + city.jobs[c];
          if (w <= 0) continue;
          if (cd <= 750) catchPop[k] += city.pop[c];
          const z = city.zoneOf(c);
          let m = zMap.get(z); if (!m) { m = new Map(); zMap.set(z, m); }
          const e = m.get(k) || [0, 0]; e[0] += w; e[1] += w * cd; m.set(k, e);
        }
      }
      // 站外换乘
      for (let m2 = 0; m2 < N; m2++) {
        if (m2 === k || (C.serviced && !C.serviced[m2])) continue;
        const s2 = C.stations[m2];
        if (U.dist(st.x, st.y, s2.x, s2.y) * CFG.CELL_M > xferM + 150) continue;
        const c2 = city.cellAt(s2.x, s2.y); if (c2 < 0) continue;
        const i2 = c2 % city.W, j2 = (c2 / city.W) | 0;
        let best = INF;
        for (const v of [j2 * VW + i2, j2 * VW + i2 + 1, (j2 + 1) * VW + i2, (j2 + 1) * VW + i2 + 1]) {
          if (D_[v] >= INF) continue;
          const dd = D_[v] + U.dist(s2.x, s2.y, city.vx[v], city.vy[v]) * CFG.CELL_M;
          if (dd < best) best = dd;
        }
        if (best <= xferM) transfers.push({ a: k, b: m2, m: best });
      }
      for (const v of touched) D_[v] = INF;
    }
    yield;
    // 小区接驳表（下标 0…Z−1 为小区，Z…Z+F−1 为重要设施）
    const zl = new Array(NZ).fill(null), zCov = new Float32Array(NZ), zWalk = new Float32Array(NZ);
    for (let z = 0; z < Z; z++) {
      let tot = 0, cov = 0, wsum = 0;
      for (const c of this.zoneCells[z]) {
        const w = city.pop[c] + city.jobs[c];
        tot += w;
        if (cellWalk[c] <= maxM) { cov += w; wsum += w * cellWalk[c]; }
      }
      zCov[z] = tot > 0 ? cov / tot : 0;
      zWalk[z] = cov > 0 ? wsum / cov / mpm : 0;
      const m = zMap.get(z);
      if (m && zCov[z] > 0) {
        const arr = [];
        m.forEach(function (e, s) { arr.push({ s: s, w: e[1] / e[0] / mpm, share: e[0] / Math.max(1, tot) }); });
        arr.sort(function (a, b) { return a.w - b.w; });
        zl[z] = arr.slice(0, 4);
      }
    }
    for (let k = 0; k < F; k++) {
      const cs = fn.cells[k], n = Math.max(1, cs.length);
      let cov = 0, wsum = 0;
      for (const c of cs) if (cellWalk[c] <= maxM) { cov++; wsum += cellWalk[c]; }
      zCov[Z + k] = cov / n; zWalk[Z + k] = cov > 0 ? wsum / cov / mpm : 0;
      const m = fMap.get(k);
      if (m && cov > 0) {
        const arr = [];
        m.forEach(function (e, s) { arr.push({ s: s, w: e[1] / e[0] / mpm, share: e[0] / n }); });
        arr.sort(function (a, b) { return a.w - b.w; });
        zl[Z + k] = arr.slice(0, 4);
      }
      // 按出入口（场地边缘）计：能步行到达边缘的车站服务全部到访者，步行时间 = 到边缘 + 场内步行
      let em = eMap.get(k);
      // 步行网络没有通到场地（填海地、无街道的园区）时：直线距离 × 1.35 的绕行系数，不跨越水面，且在步行上限的八成以内
      if ((!em || !em.size) && !fn.list[k].ext) {
        const f = fn.list[k];
        for (let s = 0; s < N; s++) {
          if (C.serviced && !C.serviced[s]) continue;
          const st = C.stations[s], d = U.dist(st.x, st.y, f.x, f.y) * CFG.CELL_M * 1.35 - Math.sqrt(fn.cells[k].length) * CFG.CELL_M * 0.5;
          if (d > maxM * 0.8) continue;
          let wet = false;
          for (let t = 0.1; t < 0.95 && !wet; t += 0.1) if (city.waterDistAt(st.x + (f.x - st.x) * t, st.y + (f.y - st.y) * t) < 0) wet = true;
          if (wet) continue;
          if (!em) { em = new Map(); eMap.set(k, em); }
          em.set(s, Math.max(60, d));
        }
      }
      if (em && em.size) {
        const arr = [], inn = fn.inner[k] + fn.reach[k];
        em.forEach(function (d, s) { arr.push({ s: s, w: (d + inn) / mpm, share: 1 }); });
        arr.sort(function (a, b) { return a.w - b.w; });
        zl[Z + k] = arr.slice(0, 4); zCov[Z + k] = 1; zWalk[Z + k] = arr[0].w;
      }
    }
    // 地图外设施的接驳口（v2.1）：在地图边缘接驳口建成并接入线路的车站，直接服务该设施的全部接驳出行（步行约 1 分钟）
    if (fn && CM.Fac) for (let k = 0; k < F; k++) {
      const f = fn.list[k]; if (!f.ext) continue;
      for (let s = 0; s < N; s++) {
        if ((C.serviced && !C.serviced[s]) || !CM.Fac.isPortalStation(C.stations[s], f)) continue;
        zCov[Z + k] = 1; zWalk[Z + k] = 1; zl[Z + k] = [{ s: s, w: 1, share: 1 }];
        break;
      }
    }
    // 人口覆盖率
    let pc = 0, pt = 0;
    for (let c = 0; c < nC; c++) { pt += city.pop[c]; if (cellWalk[c] <= maxM) pc += city.pop[c]; }
    return { cellWalk: cellWalk, cellStation: cellStation, zl: zl, zCov: zCov, zWalk: zWalk, trees: trees, accessible: accessible, catchPop: catchPop, transfers: transfers, coverage: pt > 0 ? pc / pt : 0, NZ: NZ, facKey: fn ? fn.key : '' };
  };

  Model.prototype.buildMetro = function (C, acc0) {
    const N = C.stations.length, R = C.routes.length, mc = CFG.metro;
    const acc = acc0 || this.computeAccess(C);
    const platBase = new Int32Array(R);
    let nNodes = N;
    for (let r = 0; r < R; r++) { platBase[r] = nNodes; nNodes += C.routes[r].stIdx.length; }
    const E = { from: [], to: [], type: [], route: [], leg: [], dir: [], st: [], km: [], t0: [], wm: [] };
    const push = function (f, t, ty, r, leg, dir, st, km, t0, wm) {
      E.from.push(f); E.to.push(t); E.type.push(ty); E.route.push(r); E.leg.push(leg); E.dir.push(dir); E.st.push(st); E.km.push(km); E.t0.push(t0); E.wm.push(wm);
      return E.from.length - 1;
    };
    const rideEdge = [], boardEdge = [];
    for (let r = 0; r < R; r++) {
      const rt = C.routes[r], n = rt.stIdx.length;
      const be = new Int32Array(n);
      for (let k = 0; k < n; k++) {
        // 天地换乘车站的非主站台层：上下车各多走一段垂直通道（其余车站为 0，与原模型相同）
        const lv = rt.lvPen && rt.lvPen[k] ? mc.levelXferMin : 0;
        be[k] = push(rt.stIdx[k], platBase[r] + k, 0, r, k, 0, rt.stIdx[k], 0, lv, 0);
        push(platBase[r] + k, rt.stIdx[k], 1, r, k, 0, rt.stIdx[k], 0, lv, 0);
      }
      const nLegs = rt.legSec.length;
      const re = new Int32Array(nLegs * 2);
      for (let k = 0; k < nLegs; k++) {
        const a = platBase[r] + k, b = platBase[r] + ((k + 1) % n);
        const t0 = rt.legSec[k] / 60 + mc.dwell / 60, km = rt.legLenM[k] / 1000;
        re[2 * k] = push(a, b, 2, r, k, 0, -1, km, t0, 0);
        re[2 * k + 1] = push(b, a, 2, r, k, 1, -1, km, t0, 0);
      }
      rideEdge.push(re); boardEdge.push(be);
    }
    for (const tr of acc.transfers) push(tr.a, tr.b, 3, -1, -1, 0, tr.b, 0, tr.m / CFG.walk.mPerMin, tr.m);
    const nE = E.from.length;
    const net = {
      C: C, N: N, R: R, nNodes: nNodes, nE: nE, platBase: platBase, acc: acc, rideEdge: rideEdge, boardEdge: boardEdge,
      eFrom: Int32Array.from(E.from), eTo: Int32Array.from(E.to), eType: Uint8Array.from(E.type), eRoute: Int32Array.from(E.route),
      eLeg: Int32Array.from(E.leg), eDir: Uint8Array.from(E.dir), eSt: Int32Array.from(E.st), eKm: Float32Array.from(E.km), eT0: Float32Array.from(E.t0), eWm: Float32Array.from(E.wm),
      routeKey: C.routes.map(function (r) { return r.lineId + ':' + (r.svc || '') + ':' + r.stIds.join(','); }), isSvc: Uint8Array.from(C.routes, function (r) { return r.svc ? 1 : 0; }),
      boardShare: null,
    };
    // 同一线路的交路在同一站有相同的前一站或后一站时，这一段上乘客先来先上：候车按合计频率（区间车在客流大的一段加密）
    if (C.routes.some(function (r) { return r.svc; })) {
      const share = new Map();
      for (let r = 0; r < R; r++) {
        const rt = C.routes[r], n = rt.stIds.length;
        for (let k = 0; k < n; k++) {
          const next = k + 1 < n ? rt.stIds[k + 1] : (rt.loop ? rt.stIds[0] : null), prev = k > 0 ? rt.stIds[k - 1] : (rt.loop ? rt.stIds[n - 1] : null), list = [];
          for (let o = 0; o < R; o++) {
            const ro = C.routes[o]; if (o === r || ro.lineId !== rt.lineId) continue;
            const j = ro.stIds.indexOf(rt.stIds[k]); if (j < 0) continue;
            const m = ro.stIds.length, onext = j + 1 < m ? ro.stIds[j + 1] : (ro.loop ? ro.stIds[0] : null), oprev = j > 0 ? ro.stIds[j - 1] : (ro.loop ? ro.stIds[m - 1] : null);
            if ((next && next === onext) || (prev && prev === oprev)) list.push(o);
          }
          if (list.length) share.set(boardEdge[r][k], list);
        }
      }
      net.boardShare = share;
    }
    const deg = new Int32Array(nNodes + 1);
    for (let e = 0; e < nE; e++) deg[net.eFrom[e]]++;
    const os = new Int32Array(nNodes + 1);
    for (let n = 0; n < nNodes; n++) os[n + 1] = os[n] + deg[n];
    const oe = new Int32Array(nE), f = new Int32Array(nNodes);
    for (let e = 0; e < nE; e++) { const a = net.eFrom[e]; oe[os[a] + f[a]++] = e; }
    net.outStart = os; net.outEdge = oe;
    return net;
  };

  // ---------------- 运算上下文 ----------------
  Model.prototype.newCtx = function (nPer, dt) {
    const ctx = { per: [], nPer: nPer, dt: dt || 'wd' };
    for (let p = 0; p < nPer; p++) { const P = this.makePer(this.net); P.dt = ctx.dt; ctx.per.push(P); }
    return ctx;
  };
  // 分目的、设施与小区吸引的统计数组（设施数量变化时重新分配）
  Model.prototype.allocStatArrays = function (P) {
    const Z = this.Z, F = this.fn ? this.fn.F : 0;
    if (!P.zDest || P.zDest.length !== NPK * Z) { P.zDest = new Float32Array(NPK * Z); P.zDestM = new Float32Array(NPK * Z); }
    if (!P.zCW || P.zCW.length !== Z) { P.zCW = new Float32Array(Z); P.zCT = new Float32Array(Z); }
    if (!P.fIn || P.fIn.length !== F) { P.fIn = new Float32Array(F); P.fInM = new Float32Array(F); P.fOut = new Float32Array(F); P.fOutM = new Float32Array(F); P.fP = new Float32Array(NPK * F); P.fPM = new Float32Array(NPK * F); }
  };
  Model.prototype.makePer = function (net) {
    const Z = this.Z, nA = this.road.nA;
    const P = {
      arcVol: new Float32Array(nA), arcTime: Float32Array.from(this.road.arcT0),
      skimT: new Float32Array(Z * Z), skimK: new Float32Array(Z * Z),
      desTot: new Float32Array(this.B * this.B), desMetro: new Float32Array(this.B * this.B),
      zTrips: new Float32Array(Z), zMetro: new Float32Array(Z), zAccess: new Float32Array(Z),
      stats: null, iters: 0,
    };
    this.allocStatArrays(P);
    this.initMetroPer(P, net, -1);
    return P;
  };
  Model.prototype.initMetroPer = function (P, net, p, old, oldNet) {
    const N = net ? net.N : 0, R = net ? net.R : 0, nE = net ? net.nE : 0;
    // freqDir：两个方向各自的发车频率（v2.5 车队，环线两个方向可以不同；其余线路两个方向相同）；needDir：不受车数限制时按客流与最低服务水平所需的频率
    P.freq = new Float32Array(R); P.freqDir = new Float32Array(2 * R); P.needDir = new Float32Array(2 * R); P.crowd = new Float32Array(nE).fill(1); P.load = new Float32Array(nE);
    P.stDelay = new Float32Array(N); P.stIn = new Float32Array(N); P.stOut = new Float32Array(N); P.stXfer = new Float32Array(N); P.stBoard = new Float32Array(N);
    for (let r = 0; r < R; r++) { P.freq[r] = net.isSvc[r] ? 0 : Model.serviceFloor(net.C.routes[r], p < 0 ? 1 : p); P.freqDir[2 * r] = P.freqDir[2 * r + 1] = P.needDir[2 * r] = P.needDir[2 * r + 1] = P.freq[r]; }   // 加开的交路从停运开始，有配属列车时在求解中升到实际频率
    if (old && oldNet && net) {
      const keyIdx = new Map(); oldNet.routeKey.forEach(function (k, i) { keyIdx.set(k, i); });
      for (let r = 0; r < R; r++) {
        const o = keyIdx.get(net.routeKey[r]);
        if (o === undefined) continue;
        P.freq[r] = old.freq[o];
        for (let d = 0; d < 2; d++) { P.freqDir[2 * r + d] = old.freqDir ? old.freqDir[2 * o + d] : old.freq[o]; P.needDir[2 * r + d] = old.needDir ? old.needDir[2 * o + d] : old.freq[o]; }
        const re = net.rideEdge[r], ore = oldNet.rideEdge[o];
        for (let q = 0; q < re.length && q < ore.length; q++) { P.load[re[q]] = old.load[ore[q]]; P.crowd[re[q]] = old.crowd[ore[q]]; }
        const be = net.boardEdge[r], obe = oldNet.boardEdge[o];
        for (let q = 0; q < be.length && q < obe.length; q++) P.load[be[q]] = old.load[obe[q]];
      }
      const sIdx = new Map(); oldNet.C.stations.forEach(function (s, i) { sIdx.set(s.id, i); });
      net.C.stations.forEach(function (s, i) {
        const o = sIdx.get(s.id); if (o === undefined) return;
        P.stIn[i] = old.stIn[o]; P.stOut[i] = old.stOut[o]; P.stXfer[i] = old.stXfer[o]; P.stBoard[i] = old.stBoard[o]; P.stDelay[i] = old.stDelay[o];
      });
    }
  };
  // 设置正式运营网络
  Model.prototype.setNetwork = function (C, keepState, acc0) {
    this.wake(keepState ? 1 : 4);
    const oldNet = this.net;
    const net = this.buildMetro(C, acc0);
    if(!oldNet||oldNet.N!==net.N||oldNet.R!==net.R||oldNet.nE!==net.nE)this.results=null;
    if (oldNet && (oldNet.N !== net.N || oldNet.nE !== net.nE || oldNet.nNodes !== net.nNodes)) { this.liveBuf = {}; this.predBuf = {}; this.pipeBufs = null; this.predBufs = null; }
    for (const dt of DT) for (let p = 0; p < this.ctxs[dt].per.length; p++) {
      const P = this.ctxs[dt].per[p], old = { freq: P.freq, freqDir: P.freqDir, needDir: P.needDir, load: P.load, crowd: P.crowd, stIn: P.stIn, stOut: P.stOut, stXfer: P.stXfer, stBoard: P.stBoard, stDelay: P.stDelay };
      this.initMetroPer(P, net, p, old, oldNet);
    }
    this.net = net;
    if (this.habitAge) this.setHabit(this.habitAge);
    this.live=this.resultsFor(this.dayType);
    this.gen = null;
    // 车站日客流（stDaily）按旧网络统计，到下一次 computeDaily 前与新网络的车站编号不对应
    if (!keepState || !this.stDaily || this.stDaily.inn.length !== net.N) this.dailyStale = true;
    this.version++;
  };

  // 地铁出行习惯（v2.3）：每个小区取步行可达车站里开通最久的一座，按开通年数算成熟度（约 years 年达到满值，先快后慢），
  // 乘以小区的步行覆盖比例。ageOf(C, s) 返回编译线网 C 中车站 s 已开通的年数（游戏按开通月份与当前日期计算）。
  // 网络重建（建设、每月的城市刷新、读档）时更新；数值没有变化时不改版本，不触发重新求解
  Model.prototype.setHabit = function (ageOf) {
    const Z = this.Z, net = this.net, acc = net && net.acc, H = CFG.habit, out = new Float32Array(Z);
    if (acc && H && acc.zl && acc.zCov) for (let z = 0; z < Z; z++) {
      const L = acc.zl[z], cov = acc.zCov[z] || 0;
      if (!L || !L.length || cov <= 0) continue;
      let age = 0; for (const a of L) { const v = ageOf(net.C, a.s); if (v > age) age = v; }
      const x = U.clamp(age / H.years, 0, 1); out[z] = Math.min(1, cov) * (1 - (1 - x) * (1 - x));
    }
    let same = !!this.habit && this.habit.length === Z;
    for (let z = 0; same && z < Z; z++) if (Math.abs(this.habit[z] - out[z]) > 1e-4) same = false;
    if (!same) { this.habit = out; this.habitVer = (this.habitVer || 0) + 1; }
    return this.habit;
  };
  // 全城平均成熟度（按小区人口加权；图层与说明用）
  Model.prototype.habitMean = function () {
    const H = this.habit; if (!H) return 0; let s = 0, w = 0;
    for (let z = 0; z < this.Z; z++) { const p = this.zPop[z] || 0; s += H[z] * p; w += p; }
    return w > 0 ? s / w : 0;
  };

  // ---------------- 单时段迭代 ----------------
  Model.prototype.metroSkim = function* (net, P, p, prm, store) {
    const N = net.N, nn = net.nNodes, nE = net.nE;
    let key=skimKeys.get(net);if(key===undefined){key=++skimSerial;skimKeys.set(net,key);}
    let work = store.work;
    if (!work || work.cost.length !== nE || work.dist.length !== nn) { store.valid=false; work = store.work = { cost: new Float32Array(nE), tAct: new Float32Array(nE), dist: new Float64Array(nn), dtm: new Float32Array(nn), dkm: new Float32Array(nn) }; }
    const cost = work.cost, tAct = work.tAct;
    let same=store.valid&&store.skimKey===key&&store.transferPen===prm.tpen;store.valid=false;
    for (let e = 0; e < nE; e++) {
      const before=cost[e],beforeT=tAct[e];cost[e]=0;tAct[e]=0;
      const ty = net.eType[e];
      if (ty === 0) {
        let fr = P.freq[net.eRoute[e]];
        const stopped = !(fr > 0), shareL = net.boardShare && !stopped ? net.boardShare.get(e) : null;
        if (shareL) for (const o of shareL) fr += P.freq[o];
        const f = Math.max(0.5, fr);
        const w = 60 / (2 * f);
        cost[e] = prm.waitW * w + prm.tpen + P.stDelay[net.eSt[e]];
        if (stopped && net.isSvc[net.eRoute[e]]) cost[e] = 1e5;   // 加开的交路没有投入列车时不能上车（不算长时间候车）
        tAct[e] = w + P.stDelay[net.eSt[e]] * 0.5;
        if (net.eT0[e] > 0) { cost[e] += prm.walkW * net.eT0[e]; tAct[e] += net.eT0[e]; }   // 天地换乘的垂直通道
      } else if (ty === 1) {
        if (net.eT0[e] > 0) { cost[e] = prm.walkW * net.eT0[e]; tAct[e] = net.eT0[e]; }
      } else if (ty === 2) {
        cost[e] = net.eT0[e] * P.crowd[e]; tAct[e] = net.eT0[e];
      } else if (ty === 3) {
        cost[e] = prm.walkW * net.eT0[e] + prm.opn; tAct[e] = net.eT0[e];
      }
      if(before!==cost[e]||beforeT!==tAct[e])same=false;
    }
    if(same){store.valid=true;return;}
    // 中途取消的生成器不能把只完成一部分的最短路当成有效缓存。
    store.valid=false;
    // 工作线程分段计算（大线网，v2.3）：费用数组各段各拷一份交给线程，结果按行拷回
    if (!this.syncSolve && N >= 48 && SkimPool.ready()) {
      const reuse = store.parts; store.parts = null;
      const req = SkimPool.submit(net, cost.slice(), tAct.slice(), prm.tpen, reuse);
      while (!req.done && !req.failed) yield WAIT;
      if (!req.failed) {
        for (const r of req.parts) {
          const a = r.store, s0 = r.s0;
          store.gt.set(a.gt, s0 * N); store.tm.set(a.tm, s0 * N); store.km.set(a.km, s0 * N);
          a.gt = a.tm = a.km = null;   // 已拷入整表，不再占内存
          if ((r.part & 3) === 3) yield;
        }
        store.parts = req.parts; store.pred = store.order = store.nOrd = null;
        store.skimKey=key;store.transferPen=prm.tpen;store.valid=true;
        return;
      }
    }
    // 没有工作线程（或线程出错）：在主线程计算，路径表放在这份存储里
    store.parts = null;
    if (!store.pred) { store.pred = new Int32Array(N * nn); store.order = new Int32Array(N * nn); store.nOrd = new Int32Array(N); }
    for (let s = 0; s < N; s++) {
      metroTree(net, cost, tAct, s, work, store, this.heap, prm.tpen);
      if ((s & 3) === 3) yield;
    }
    store.skimKey=key;store.transferPen=prm.tpen;store.valid=true;
  };

  Model.prototype.allocSkimStore = function (net, buf) {
    const N = net.N, nn = net.nNodes;
    const st = buf.skim;
    if (st && st.N === N && st.nn === nn) {
      if (st.gt.length !== N * N) { st.gt = new Float32Array(N * N); st.tm = new Float32Array(N * N); st.km = new Float32Array(N * N); st.valid = false; }   // 上次在方式选择线程手里被放弃
      return st;
    }
    buf.skim = { N: N, nn: nn, gt: new Float32Array(N * N), tm: new Float32Array(N * N), km: new Float32Array(N * N), pred: null, order: null, nOrd: null, parts: null, D: new Float32Array(N * N) };
    return buf.skim;
  };

  // 一个时段的一次完整迭代（buf 为该求解流程独占的临时缓冲区）。P.dt 为日类型（工作日 / 周末）
  Model.prototype.iterate = function* (net, P, p, opts) {
    opts = opts || {};
    const buf = opts.buf || this.liveBuf;
    const prm = this.params();
    const signature=P.solveSignature;
    if(!signature||signature.net!==net||signature.od!==this.od||signature.year!==this.year||signature.fare!==Model.fareKey(this.fare)||signature.road!==this.roadVer||signature.habit!==(this.habitVer||0)){
      P.solveSignature={net,od:this.od,year:this.year,fare:Model.fareKey(this.fare),road:this.roadVer,habit:this.habitVer||0};P.solveSteps=0;P.quiet=0;P.stable=false;P.reviewLimit=0;
    }
    const Z = this.Z, od = this.od, fn = this.fn, F = fn.F, NZ = fn.NZ;
    const hostZ = fn.hostZ, nx = fn.nx, ny = fn.ny, facWe = fn.we;
    const N = net ? net.N : 0;
    const T = CFG.trips, dt = P.dt === 'we' ? 'we' : 'wd', SPL = T.split[dt], hrs = this.pHours[p];
    // 各目的本时段的系数：日类型倍数 × 时段占比 ÷ 小时数（去程 co、返程 cr）
    const co = new Float64Array(NPK), cr = new Float64Array(NPK), WM = dt === 'we' ? this.weekendMult(this.year) : null;
    for (let q = 0; q < NPK; q++) { const m = WM ? WM[q] : 1; co[q] = m * SPL[PK[q]].o[p] / hrs; cr[q] = m * SPL[PK[q]].r[p] / hrs; }
    const facW = dt === 'we';
    const IND = T.induced;
    this.allocStatArrays(P);
    let store = null;
    const hasMetro = net && net.R > 0;
    if (hasMetro) { store = this.allocSkimStore(net, buf); yield* this.metroSkim(net, P, p, prm, store); store.D.fill(0); }
    // ---- 方式选择 ----
    if (!buf.carDem || buf.carDem.length !== Z * Z) buf.carDem = new Float32Array(Z * Z);
    if (!buf.hasCar || buf.hasCar.length !== Z) buf.hasCar = new Uint8Array(Z);
    const carDem = buf.carDem, hasCar = buf.hasCar;
    carDem.fill(0);
    hasCar.fill(0);
    const st = { trips: 0, metro: 0, car: 0, timeSum: 0, commTrips: 0, commTime: 0, fare: 0, metroPkm: 0, vkt: 0, carPkm: 0, congNum: 0, congDen: 0, crowdPkm: 0, metroTime: 0, carTime: 0,
      tHW: 0, tSC: 0, tSH: 0, tMD: 0, tLZ: 0, tHB: 0, mHW: 0, mSC: 0, mSH: 0, mMD: 0, mLZ: 0, mHB: 0, ind: 0, indM: 0 };
    const pT = new Float64Array(NPK), pM = new Float64Array(NPK);
    const skT = P.skimT, skK = P.skimK;
    const acc = hasMetro ? net.acc : null;
    const accOk = acc && acc.NZ === NZ && acc.facKey === fn.key;   // 接驳表与设施节点一致（城市刷新与网络同步之间的过渡状态下只用小区部分）
    const kmPerCell = CFG.CELL_M / 1000;
    P.desTot.fill(0); P.desMetro.fill(0); P.zTrips.fill(0); P.zMetro.fill(0); P.zAccess.fill(0); P.zCW.fill(0); P.zCT.fill(0);
    P.zDest.fill(0); P.zDestM.fill(0); P.fIn.fill(0); P.fInM.fill(0); P.fOut.fill(0); P.fOutM.fill(0); P.fP.fill(0); P.fPM.fill(0);
    const BW = this.BW, ZW = this.ZW;
    if (!this.zoneBlock) this.zoneBlock = Int32Array.from({ length: Z }, function (_, z) { return (((z / ZW) | 0) >> 1) * BW + ((z % ZW) >> 1); });
    const blocks = this.zoneBlock;
    // The same directed OD can appear in several purpose flows. Cache only the winning
    // access-pair indices within this iteration, never rounded costs or stale results.
    if (hasMetro && (!buf.choice || buf.choice.length !== NZ * NZ)) buf.choice = new Int8Array(NZ * NZ);
    const choices = hasMetro ? buf.choice : null;
    if (choices) choices.fill(-2);
    const t = od.t;
    // 方式选择的输入与统计数组（每次迭代一次性组装，见 odOrigin）
    const S = new Float64Array(14), fp = Model.fareParams(this.fare), bg = CM.Eras ? CM.Eras.bg(this.year) : null;
    const K = { Z: Z, NZ: NZ, N: N, B: this.B, odStart: od.start, odDest: od.dest, t0: t[0], t1: t[1], t2: t[2], t3: t[3], t4: t[4], t5: t[5],
      co: co, cr: cr, cO: new Float64Array(NPK), cR: new Float64Array(NPK), facW: facW, facWe: facWe, odOk: od.F === F && od.key === fn.key,
      hostZ: hostZ, nx: nx, ny: ny, skT: skT, skK: skK, kmPerCell: kmPerCell,
      cpk: prm.cpk, park: prm.park, vot: prm.vot, carAccess: prm.carAccess, walkW: prm.walkW, occ: prm.occ, theta: prm.theta, fareFlat: this.fareFor(0),
      fareKm0: fp.km0, fareStep: fp.step, fareInc: fp.inc, fareCap: fp.cap, fareTab: Model.fareTab(this.fare, this.year, prm.vot),
      bgShare: bg ? bg.share : 0, bgSpeed: bg ? bg.speed : 1, bgWait: bg ? bg.wait : 0, bgFare: bg ? bg.fare : 0, roadKeep: bg ? bg.keep : 0,
      acc: acc, accOk: !!accOk, choices: choices, skimStore: store, gtS: store ? store.gt : null, tmS: store ? store.tm : null, kmS: store ? store.km : null, DS: store ? store.D : null,
      perMin: IND.perMin, capSh: IND.cap.sh, capLz: IND.cap.lz,
      habit: this.habit && this.habit.length === Z ? this.habit : null, habAsc: CFG.habit ? CFG.habit.asc : 0, habLite: CFG.habit ? CFG.habit.carLite : 0,
      carDem: carDem, hasCar: hasCar, S: S, pT: pT, pM: pM, zTrips: P.zTrips, zMetro: P.zMetro, zAccess: P.zAccess, zCW: P.zCW, zCT: P.zCT, zJ: this.zJobs, blocks: blocks, desTot: P.desTot, desMetro: P.desMetro,
      zDest: P.zDest, zDestM: P.zDestM, fIn: P.fIn, fInM: P.fInM, fOut: P.fOut, fOutM: P.fOutM, fP: P.fP, fPM: P.fPM };
    let odDone = false;
    if (!this.syncSolve && OdPool.ready()) {
      const self = this, isPred = !!opts.pred || buf === this.predBuf, ep = isPred ? this.predEpoch : this.epoch;
      const req = OdPool.submit(this, K, od, fn, function () { return !self.retired && (isPred ? self.predEpoch === ep : self.epoch === ep); });
      while (!req.done && !req.failed) yield WAIT;
      odDone = !req.failed;
      // 行程时间表在线程手里时出了错：重新算一遍，再在主线程做方式选择
      if (!odDone && store && !(store.gt.length === N * N)) {
        store.gt = new Float32Array(N * N); store.tm = new Float32Array(N * N); store.km = new Float32Array(N * N); store.valid = false; store.parts = null;
        yield* this.metroSkim(net, P, p, prm, store);
        K.gtS = store.gt; K.tmS = store.tm; K.kmS = store.km;
      }
    }
    if (!odDone) for (let i = 0; i < Z; i++) { odOrigin(K, i); if ((i & 7) === 7) yield; }
    st.trips = S[0]; st.metro = S[1]; st.car = S[2]; st.timeSum = S[3]; st.carTime = S[4]; st.metroTime = S[5]; st.fare = S[6]; st.metroPkm = S[7]; st.carPkm = S[8]; st.vkt = S[9];
    st.commTrips = S[10]; st.commTime = S[11]; st.ind = S[12]; st.indM = S[13];
    for (let k = 0; k < NPK; k++) { st[TKEY[k]] = pT[k]; st[MKEY[k]] = pM[k]; }
    // ---- 地铁客流加载与自动运营 ----
    if (hasMetro) {
      const nn = net.nNodes, nE = net.nE;
      let work = buf.metroLoad;
      if (!work || work.load.length !== nE || work.accN.length !== nn || work.stIn.length !== N) work = buf.metroLoad = { load: new Float32Array(nE), accN: new Float64Array(nn), stIn: new Float32Array(N), stOut: new Float32Array(N), stBoard: new Float32Array(N), walkIn: new Float32Array(N) };
      const load = work.load, accN = work.accN, stIn = work.stIn, stOut = work.stOut;
      load.fill(0); accN.fill(0); stIn.fill(0); stOut.fill(0);
      // 客流回溯（v2.6）：有线程时在线程上按段计算，主线程只合计；否则按同样的分段在主线程算，结果逐位一致
      let loaded = false;
      if (store.parts && !this.syncSolve && SkimPool.ready()) {
        const parts = store.parts; store.parts = null; store.valid = false;
        const req = SkimPool.submitLoad(net, parts, store.D, N);
        while (!req.done && !req.failed) yield WAIT;
        if (!req.failed) {
          for (let b = 0; b < req.parts.length; b++) {
            const r = req.parts[b], pl = r.load, a = r.stIn, c = r.stOut;
            for (let e = 0; e < nE; e++) load[e] += pl[e];
            for (let q = 0; q < N; q++) { stIn[q] += a[q]; stOut[q] += c[q]; }
            parts[b].store.pred = r.pred; parts[b].store.order = r.order; parts[b].store.nOrd = r.nOrd;
          }
          store.parts = parts; store.valid = true;
          loaded = true;
        } else { store.valid = false; yield* this.metroSkim(net, P, p, prm, store); }
      }
      if (!loaded) {
        if (!store.pred) { store.valid = false; yield* this.metroSkim(net, P, p, prm, store); }
        if (store.pred) {
          const k = Math.min(N, SKIM_BLOCKS), out = { load: new Float32Array(nE), accN: accN, stIn: new Float32Array(N), stOut: new Float32Array(N) };
          for (let b = 0; b < k; b++) {
            const s0 = Math.floor(N * b / k), s1 = Math.floor(N * (b + 1) / k); if (s1 <= s0) continue;
            out.load.fill(0); out.stIn.fill(0); out.stOut.fill(0);
            metroLoadBlock(N, nn, net.eFrom, store.D, 0, store.pred, store.order, store.nOrd, 0, s0, s1, out);
            for (let e = 0; e < nE; e++) load[e] += out.load[e];
            for (let q = 0; q < N; q++) { stIn[q] += out.stIn[q]; stOut[q] += out.stOut[q]; }
            yield;
          }
        }
      }
      const lam = opts.metroLam || 0.5;
      // 平滑只用来稳定客流在各站、各区间的分布，总量取本轮结果；否则车站与断面客流总比实际地铁出行偏低（开通时约 6%，之后每月只迭代一轮，客流增长时一直追不上）
      let rawIn = 0, oldIn = 0;
      for (let s = 0; s < N; s++) { rawIn += stIn[s]; oldIn += P.stIn[s]; }
      const smoothIn = oldIn * (1 - lam) + rawIn * lam, total = smoothIn > 0 ? rawIn / smoothIn : 1;
      for (let e = 0; e < nE; e++) { const old = P.load[e]; P.load[e] = (old * (1 - lam) + load[e] * lam) * total; }
      const stBoard = work.stBoard, walkIn = work.walkIn;
      stBoard.fill(0); walkIn.fill(0);
      for (let e = 0; e < nE; e++) {
        const ty = net.eType[e];
        if (ty === 0) stBoard[net.eSt[e]] += P.load[e];
        else if (ty === 3) walkIn[net.eSt[e]] += P.load[e];
      }
      const mc = CFG.metro;
      for (let s = 0; s < N; s++) {

        P.stIn[s] = (P.stIn[s] * (1 - lam) + stIn[s] * lam) * total;
        P.stOut[s] = (P.stOut[s] * (1 - lam) + stOut[s] * lam) * total;
        P.stBoard[s] = stBoard[s];
        P.stXfer[s] = Math.max(0, stBoard[s] - P.stIn[s] - walkIn[s]);
        const cap = mc.stationCap[net.C.stations[s].size];
        const ratio = (P.stIn[s] + P.stOut[s] + P.stXfer[s]) / cap;
        const dl = U.clamp((ratio - 0.8) * 10, 0, 12);
        P.stDelay[s] = P.stDelay[s] * 0.5 + dl * 0.5;

      }
      // 发车频率。所需频率取「线路最低服务水平」（按站数、站距）与「最大断面客流所需」中的较大者；
      // v2.5 车队：有车队计划的线路（fleetOf）只能用投入的列车——智能调度在已有列车范围内取所需频率，手动按玩家设定的本时段列车数；
      // 列车不够时低运力运行（满载、拥挤与候车随之增加）。环线两个方向分别计算。没有车队计划的（开始界面背景等）照旧自动配车
      const plan = this.fleetOf(net);
      if (!P.freqDir || P.freqDir.length !== 2 * net.R) { P.freqDir = new Float32Array(2 * net.R); P.needDir = new Float32Array(2 * net.R); for (let r = 0; r < net.R; r++) P.freqDir[2 * r] = P.freqDir[2 * r + 1] = P.needDir[2 * r] = P.needDir[2 * r + 1] = P.freq[r]; }
      for (let r = 0; r < net.R; r++) {
        const rt = net.C.routes[r], re = net.rideEdge[r], fp = plan && plan[r], cap = fp ? fp.cap : rt.cap, floor = Model.serviceFloor(rt, p), nd = rt.loop ? 2 : 1;
        for (let d = 0; d < nd; d++) {
          let mx = 0;
          for (let q = 0; q < re.length; q++) if ((nd === 1 || (q & 1) === d) && P.load[re[q]] > mx) mx = P.load[re[q]];
          const need = U.clamp(Math.max(mx / (cap * mc.targetLF), floor), 1, mc.fMax), k = 2 * r + d;
          P.needDir[k] = need;
          let f = P.freqDir[k] * 0.55 + need * 0.45;
          if (fp) { const per = 3600 / Math.max(60, rt.cycleSec); f = fp.manual ? Math.min(mc.fMax, Math.min(fp.manual[d][p], fp.avail[d]) * per) : Math.min(f, mc.fMax, fp.avail[d] * per); }
          P.freqDir[k] = f; if (nd === 1) { P.freqDir[k + 1] = f; P.needDir[k + 1] = need; }
        }
        P.freq[r] = nd === 2 ? (P.freqDir[2 * r] + P.freqDir[2 * r + 1]) / 2 : P.freqDir[2 * r];

        for (let q = 0; q < re.length; q++) {
          const e = re[q];
          const LF = P.load[e] / Math.max(1, P.freqDir[2 * r + (nd === 2 ? (q & 1) : 0)] * cap);
          let cf = 1;
          if (LF > 0.6) cf = 1 + 0.25 * Math.min(1, (LF - 0.6) / 0.4);
          if (LF > 1) cf = 1.25 + 1.6 * (LF - 1);
          const oldCrowd = P.crowd[e]; P.crowd[e] = Math.min(3.5, oldCrowd * 0.5 + cf * 0.5);

          if (LF > 1) st.crowdPkm += P.load[e] * net.eKm[e];
        }
      }
    }
    // ---- 汽车分配（起点分块并行，见 carOriginRow；工作线程不可用或同步求解时在主线程逐起点计算，结果相同） ----
    const road = this.road, nA = road.nA, G = carGraph(this);
    let work = buf.roadWork;
    if (!work || work.G !== G) { work = buf.roadWork = carWork(G); work.G = G; work.aux = new Float32Array(nA); work.auxB = new Float32Array(nA); }
    const aux = work.aux;
    aux.fill(0); work.accN.fill(0);
    const connStart = this.roadData.start;
    const zPop = this.zPop, fullSkim = !!opts.fullSkim, iters = P.iters, time = P.arcTime;
    const runList = [];
    for (let o = 0; o < Z; o++) {
      if (connStart[o] === connStart[o + 1]) continue;
      if (!hasCar[o] && !(fullSkim && zPop[o] > 0) && iters > 0) continue;
      runList.push(o);
    }
    const nRun = runList.length, bounds = [];
    for (let b = 0; b <= CAR_BLOCKS; b++) bounds.push(Math.floor(b * nRun / CAR_BLOCKS));
    let res = null;
    if (nRun && !this.syncSolve && CarPool.ready()) {
      const self = this, isPred = !!opts.pred || buf === this.predBuf, ep = isPred ? this.predEpoch : this.epoch, blocks = [];
      for (let b = 0; b < CAR_BLOCKS; b++) {
        const os = Int32Array.from(runList.slice(bounds[b], bounds[b + 1])), dem = new Float32Array(os.length * Z);
        for (let i = 0; i < os.length; i++) dem.set(carDem.subarray(os[i] * Z, os[i] * Z + Z), i * Z);
        blocks.push({ origins: os, dem: dem });
      }
      const req = CarPool.submit(G, time, blocks, function () { return !self.retired && (isPred ? self.predEpoch === ep : self.epoch === ep); });
      while (req.remaining > 0 && !req.failed) yield WAIT;
      res = req.res;
    }
    // 按块顺序合并：行程时间表逐行写回（不可达的保留原值），路段流量逐块相加；缺少的块（工作线程失败）在主线程补算
    // 正、有限道路成本下，可达性只依赖拓扑。按道路版本缓存有限连续区间，以批量复制代替逐元素比较。
    const rowSpans=this.roadData.rowSpans||(this.roadData.rowSpans=new Array(Z));
    const merge = function (o, rT, rK) {
      const row=o*Z;let spans=rowSpans[o];
      if(!spans){spans=[];for(let d=0;d<Z;){if(rT[d]!==rT[d]){d++;continue;}const a=d;while(d<Z&&rT[d]===rT[d])d++;spans.push(a,d);}rowSpans[o]=spans;}
      for(let i=0;i<spans.length;i+=2){const a=spans[i],b=spans[i+1];skT.set(rT.subarray(a,b),row+a);skK.set(rK.subarray(a,b),row+a);}
    };
    for (let b = 0; b < CAR_BLOCKS; b++) {
      const i0 = bounds[b], i1 = bounds[b + 1];
      if (i0 === i1) continue;
      const r = res && res[b];
      let auxB;
      if (r) {
        for (let i = i0; i < i1; i++) merge(runList[i], r.rowsT.subarray((i - i0) * Z, (i - i0 + 1) * Z), r.rowsK.subarray((i - i0) * Z, (i - i0 + 1) * Z));
        auxB = r.aux;
      } else {
        auxB = work.auxB; auxB.fill(0);
        for (let i = i0; i < i1; i++) {
          const o = runList[i];
          carOriginRow(G, time, o, carDem, o * Z, work, skT, skK, o * Z, auxB);
          if ((i & 1) === 1) yield;
        }
      }
      for (let a = 0; a < nA; a++) aux[a] += auxB[a];
      yield; // 分块合并也遵守主线程时间切片，避免一次吞掉所有工作线程的结果。
    }
    const A = CFG.road.bprA, capF = this.capF || 1;
    // 弹性需求先按总量投影，再对实际 BPR 成本做线搜索。固定 0.4 混合会使近似等价道路反复抢走整股客流。
    let demand=0;for(let k=0;k<carDem.length;k++)demand+=carDem[k];
    const scale=P.demandTotal>1e-6?demand/P.demandTotal:1;
    const travel=(a,v)=>{const x=v/(road.arcCap[a]*capF);return road.arcT0[a]*Math.min(8,1+A*x*x*x*x);};
    let lam=1;
    if(P.iters>0&&demand>0){
      let line=buf.lineSearch;if(!line||line.base.length!==nA)line=buf.lineSearch={base:new Float64Array(nA),delta:new Float64Array(nA),active:new Int32Array(nA)};
      let count=0;for(let a=0;a<nA;a++){const base=P.arcVol[a]*scale,delta=aux[a]-base;line.base[a]=base;line.delta[a]=delta;if(delta!==0||!(road.arcCap[a]*capF>0)||!Number.isFinite(road.arcT0[a]))line.active[count++]=a;}
      const derivative=t=>{let v=0;for(let i=0;i<count;i++){const a=line.active[i],base=line.base[a],delta=line.delta[a];v+=delta*travel(a,base+delta*t);}return v;};
      const first=derivative(0);
      yield;   // 线搜索每次都遍历全部路段，大城市分多帧做（v2.3，结果不变）
      if(first>=0){
        // 改变 OD 分布后的旧流场不一定可行，不能因成本方向为正就永久停在旧流量上。
        let total=0;for(let a=0;a<nA;a++)total+=P.arcVol[a]*P.arcTime[a];
        lam=first>Math.max(1,total)*.001?Math.min(.2,1/(P.solveSteps+1)):0;
      }
      else if(derivative(1)>0){let lo=0,hi=1;for(let k=0;k<20;k++){const mid=(lo+hi)/2;if(derivative(mid)>0)hi=mid;else lo=mid;if((k&3)===3)yield;}lam=(lo+hi)/2;}
      yield;
    }
    let timeError=0,timeWeight=0,cost=0,gap=0;
    const previousMetro=P.stats?P.stats.metro:0;
    for (let a = 0; a < nA; a++) {
      const oldVol = P.arcVol[a], oldTime = P.arcTime[a];
      const v = oldVol * scale * (1 - lam) + aux[a] * lam;
      P.arcVol[a] = v;
      const x = v / (road.arcCap[a] * capF);
      P.arcTime[a] = road.arcT0[a] * Math.min(8, 1 + A * x * x * x * x);

      st.congNum += v * road.arcLen[a] * (P.arcTime[a] / road.arcT0[a]);
      st.congDen += v * road.arcLen[a];
      if(Math.max(v,oldVol)>5){const w=Math.max(v,oldVol)*road.arcLen[a],e=(P.arcTime[a]-oldTime)/Math.max(road.arcT0[a],oldTime);timeError+=w*e*e;timeWeight+=w;}
      cost+=oldVol*scale*oldTime;gap+=(oldVol*scale-aux[a])*oldTime;
    }
    P.demandTotal=demand;P.solveSteps=(P.solveSteps||0)+1;
    P.error={time:Math.sqrt(timeError/Math.max(1,timeWeight)),gap:Math.abs(gap)/Math.max(1,cost),metro:Math.abs(st.metro-previousMetro)/Math.max(100,st.metro),demand:Math.abs(scale-1)};
    const e=P.error,good=P.solveSteps>=6&&e.time<.015&&e.gap<.005&&e.metro<.003&&e.demand<.002;
    P.quiet=good?(P.quiet||0)+1:0;
    P.iters++;
    // 统计平滑（显示更平稳）
    if (P.stats && !opts.noSmooth) {
      const o = P.stats;
      for (const k in st) if (o[k] !== undefined) st[k] = o[k] * 0.4 + st[k] * 0.6;
    }
    P.stats = st;
    P.facKey = fn.key;   // 数组下标只属于本次迭代使用的设施表，不能按新的设施顺序解读。
    P.stable=P.quiet>=3;
  };

  // ---------------- 时段流水线（v2.1） ----------------
  // 同一轮里各时段（工作日 / 周末 × 4）的迭代互不依赖：每个时段只读写自己的状态与独占的缓冲区，共享的城市、需求与路网只读。
  // 有工作线程时最多 PIPE_W 个时段交错执行，结果与逐个执行逐位相同；同步求解或没有工作线程时逐个执行（只用一套缓冲区）。
  // start(job, buf) 返回该任务的生成器，onDone(job, 返回值) 在任务完成时调用（按完成顺序）。所有任务都在等工作线程时让出 WAIT
  Model.prototype.pipeline = function* (jobs, start, onDone, pred) {
    if(!jobs.length)return;
    const width = this.syncSolve || !CarPool.ready() ? 1 : Math.min(PIPE_W, jobs.length);
    const bufs = pred ? (this.predBufs || (this.predBufs = [this.predBuf])) : (this.pipeBufs || (this.pipeBufs = [this.liveBuf]));
    const act = [], free = [];
    for (let s = width - 1; s >= 0; s--) free.push(s);
    let next = 0;
    for (;;) {
      while (act.length < width && next < jobs.length) {
        const slot = free.pop(), buf = bufs[slot] || (bufs[slot] = {});
        act.push({ job: jobs[next], slot: slot, gen: start(jobs[next], buf) });
        next++;
      }
      if (!act.length) return;
      let waiting = 0;
      for (let i = 0; i < act.length; i++) {
        const a = act[i], r = a.gen.next();
        if (r.done) { act.splice(i--, 1); free.push(a.slot); if (onDone) onDone(a.job, r.value); }
        else if (r.value === WAIT) waiting++;
        else yield; // 一次只推进一个时段的计算片段，避免 PIPE_W 倍的预算超支。
      }
      if (act.length || next < jobs.length) yield act.length && waiting === act.length ? WAIT : undefined;
    }
  };

  // Lightweight updates: fixed, deterministic round budgets. Strict stability remains
  // a separate property for threshold-sensitive tasks; it never blocks ordinary months.
  Model.prototype.periodCurrent=function(P){const s=P.solveSignature;return !!s&&s.net===this.net&&s.od===this.od&&s.year===this.year&&s.fare===Model.fareKey(this.fare)&&s.road===this.roadVer&&s.habit===(this.habitVer||0);};
  Model.prototype.periodUsable=function(P){return this.periodCurrent(P)&&P.solveSteps>=1&&!!P.stats&&P.facKey===this.fn.key;};
  Model.prototype.needsWork=function(P,limit){return !this.periodCurrent(P)||(!P.stable&&(P.solveSteps||0)<limit);};
  Model.prototype.trafficReady=function(){return !this.refreshing&&!this.solving&&!!this.results&&DT.every(dt=>this.ctxs[dt].per.every(P=>this.periodUsable(P)));};
  Model.prototype.basisPeriods=function(basis){
    const days=basis==='wdAM'||basis==='wdPeak'||basis==='wd'?['wd']:basis==='we'?['we']:DT;
    return days.flatMap(dt=>this.ctxs[dt].per.filter((P,p)=>basis!=='wdAM'||p===0));
  };
  Model.prototype.trafficVerified=function(basis){return this.trafficReady()&&this.basisPeriods(basis).every(P=>P.stable);};
  // 任务复核（v2.6）：同一输入最多再算 REVIEW_ROUNDS 轮（原 12 轮，后期一次复核要十几秒）；结论已经明确时提前结束（见 reviewEnough）
  const REVIEW_ROUNDS = 4;
  Model.REVIEW_ROUNDS = REVIEW_ROUNDS;
  Model.prototype.clearReviews=function(){for(const dt of DT)for(const P of this.ctxs[dt].per)P.reviewLimit=0;};
  Model.prototype.reviewComplete=function(basis){return this.trafficReady()&&this.basisPeriods(basis).every(P=>P.stable||(P.reviewLimit===REVIEW_ROUNDS&&P.solveSteps>=REVIEW_ROUNDS));};
  Model.prototype.requestReview=function(basis){
    let queued=false;for(const P of this.basisPeriods(basis))if(!P.stable&&P.reviewLimit!==REVIEW_ROUNDS){P.reviewLimit=REVIEW_ROUNDS;queued=true;}
    if(queued)this.wake(this.solveLimit||2);return queued;
  };
  Model.prototype.hasReviewWork=function(){return DT.some(dt=>this.ctxs[dt].per.some(P=>P.reviewLimit&&this.needsWork(P,P.reviewLimit)));};
  Model.prototype.finishTraffic=function(){
    this.computeDaily();this.gen=null;this.settled=true;
    this.settledAt={year:this.year,fare:Model.fareKey(this.fare),city:this.city.version,road:this.city.roadVersion,net:this.net,od:this.od};
  };
  Model.prototype.liveLoop = function* () {
    const self=this;
    for(;;){
      const order=this.dayType==='we'?['we','wd']:['wd','we'],jobs=[];
      for(const dt of order)for(let p=0;p<NP;p++){const P=this.ctxs[dt].per[p],limit=Math.max(this.solveLimit||2,this.periodCurrent(P)?P.reviewLimit||0:0);if(this.needsWork(P,limit))jobs.push([dt,p]);}
      if(!jobs.length){this.finishTraffic();return;}
      yield* this.pipeline(jobs,(j,buf)=>self.iterate(self.net,self.ctxs[j[0]].per[j[1]],j[1],{fullSkim:!self.periodCurrent(self.ctxs[j[0]].per[j[1]]),noSmooth:true,buf}));
      this.cycles++;this.computeDaily();if(this.reviewObserver)this.reviewObserver();if(this.reviewEnough&&this.reviewEnough())this.clearReviews();yield;
    }
  };
  Model.prototype.step = function (budget) {
    if (this.refreshing || this.solving) return;
    const t0 = performance.now();
    if (this.predJob) {
      const pj = this.predJob;
      while (performance.now() - t0 < budget * 1.2) {
        const r = pj.gen.next();
        if (r.done) { this.predJob = null; pj.done(r.value); break; }
        if (r.value === WAIT) break;
      }
      return;
    }
    if (this.settled) {
      const at = this.settledAt;
      if (at.year === this.year && at.fare === Model.fareKey(this.fare) && at.city === this.city.version && at.road === this.city.roadVersion && at.net === this.net && at.od === this.od) return;
      this.wake();
    }
    if (!this.gen) this.gen = this.liveLoop();
    while (!this.settled && performance.now() - t0 < budget) { if (this.gen.next().value === WAIT) break; }
  };
  Model.prototype.solveNow = function (cycles, dts) {
    const g = this.solveGen(cycles, dts);this.syncSolve=true;
    try { for(let r=g.next();!r.done;r=g.next()){ /* Drain synchronously; workers are disabled here. */ } }finally{this.syncSolve=false;}
  };
  Model.prototype.solveGen=function* (cycles,dts){
    cycles=Math.max(1,Math.min(12,cycles||2));this.wake(cycles);dts=dts||DT;
    const self=this;this.solving=(this.solving||0)+1;
    try{
      for(let c=0;c<cycles;c++){
        const jobs=[];for(const dt of dts)for(let p=0;p<NP;p++)if(this.needsWork(this.ctxs[dt].per[p],cycles))jobs.push([dt,p]);
        if(!jobs.length)break;
        yield* this.pipeline(jobs,(j,buf)=>self.iterate(self.net,self.ctxs[j[0]].per[j[1]],j[1],{fullSkim:c===0,buf,noSmooth:true}));
        this.cycles++;
        if(this.onSolveProgress)this.onSolveProgress((c+1)/cycles);   // 载入界面的进度（每完成一轮）
      }
      if(DT.every(dt=>this.ctxs[dt].per.every(P=>this.periodUsable(P))))this.finishTraffic();else{this.computeDaily();this.gen=null;}
    }finally{this.solving--;}
  };
  Model.prototype.solveReviewsGen=function*(){
    const self=this;this.solving=(this.solving||0)+1;
    try{
      for(let c=0;c<REVIEW_ROUNDS;c++){
        const jobs=[];for(const dt of DT)for(let p=0;p<NP;p++){const P=this.ctxs[dt].per[p];if(P.reviewLimit&&this.needsWork(P,P.reviewLimit))jobs.push([dt,p]);}
        if(!jobs.length)break;
        yield* this.pipeline(jobs,(j,buf)=>self.iterate(self.net,self.ctxs[j[0]].per[j[1]],j[1],{buf,noSmooth:true}));this.cycles++;if(this.reviewObserver){this.computeDaily();this.reviewObserver();}
        if(this.reviewEnough&&this.reviewEnough()){this.clearReviews();break;}
      }
      this.finishTraffic();
    }finally{this.solving--;}
  };
  Model.prototype.resultsFor=function(dt){return this.results&&this.results[dt==='we'?'we':'wd']||this.ctxs[dt==='we'?'we':'wd'];};

  // ---------------- 汇总指标 ----------------
  Model.prototype.aggregate = function (perList, net) {
    // carKm：车厢公里；carKmW：按车型运营成本系数加权的车厢公里（v2.5 车队：编组取投入的列车，老旧车型更费钱）
    const D = { trips: 0, metro: 0, car: 0, timeSum: 0, commTrips: 0, commTime: 0, fare: 0, metroPkm: 0, vkt: 0, carPkm: 0, congNum: 0, congDen: 0, crowdPkm: 0, carKm: 0, carKmW: 0, metroTime: 0, carTime: 0 };
    let ok = true;
    const plan = net && net.R ? this.fleetOf(net) : null;
    for (let p = 0; p < NP; p++) {
      const P = perList[p];
      if (!P || !P.stats) { ok = false; continue; }
      const h = this.pHours[p], s = P.stats;
      const mf = p === 3 ? 0.9 : 1;
      for (const k in s) D[k] = (D[k] || 0) + s[k] * h * (METRO_KEYS.has(k) ? mf : 1);
      if (net && net.R) {
        for (let r = 0; r < net.R; r++) {
          const rt = net.C.routes[r], fp = plan && plan[r];
          const svcH = p === 3 ? 5 : h, fd = P.freqDir && P.freqDir.length === 2 * net.R ? P.freqDir[2 * r] + P.freqDir[2 * r + 1] : 2 * P.freq[r];
          const ck = fd * (rt.lenM / 1000) * (fp ? fp.cars : rt.cars) * svcH;
          D.carKm += ck; D.carKmW += ck * (fp ? fp.opsF : 1);
        }
      }
    }
    D.ready = ok;
    return this.finishDaily(D, perList[0] && perList[0].stats, net);
  };
  Model.prototype.finishDaily = function (D, am, net) {
    D.metroShare = D.trips > 0 ? D.metro / D.trips : 0;
    D.avgTime = D.trips > 0 ? D.timeSum / D.trips : 0;
    D.commute = D.commTrips > 0 ? D.commTime / D.commTrips : 0;
    D.cong = D.congDen > 0 ? D.congNum / D.congDen : 1;
    if (am !== undefined) D.congAM = am && am.congDen > 0 ? am.congNum / am.congDen : D.cong;
    D.crowdShare = D.metroPkm > 0 ? D.crowdPkm / D.metroPkm : 0;
    D.avgFare = D.metro > 0 ? D.fare / D.metro : 0;
    D.coverage = net ? net.acc.coverage : 0;
    return D;
  };
  // 周平均日：5 个工作日 + 2 个周末日加权（可加总的量按权重相加，比例重新计算）
  Model.prototype.weekAvg = function (a, b, net) {
    const W = CFG.trips.weekWeights, D = {};
    for (const k in a) if (typeof a[k] === 'number' && typeof b[k] === 'number') D[k] = a[k] * W.wd + b[k] * W.we;
    this.finishDaily(D, undefined, net);
    D.congAM = a.congAM;   // 早高峰拥堵：工作日
    D.ready = !!(a.ready && b.ready);
    D.dt = 'avg';
    return D;
  };
  // 按车站汇总日客流
  Model.prototype.stationDaily = function (per, net) {
    const N = net.N;
    const sIn = new Float32Array(N), sOut = new Float32Array(N), sX = new Float32Array(N), peak = new Float32Array(N);
    const rBoard = new Float32Array(net.R);
    for (let p = 0; p < NP; p++) {
      const P = per[p], h = this.pHours[p] * (p === 3 ? 0.9 : 1);
      if (!P.stIn || P.stIn.length !== N) continue;
      for (let s = 0; s < N; s++) {
        sIn[s] += P.stIn[s] * h; sOut[s] += P.stOut[s] * h; sX[s] += P.stXfer[s] * h;
        const f = P.stIn[s] + P.stOut[s] + P.stXfer[s];
        if (f > peak[s]) peak[s] = f;
      }
      for (let r = 0; r < net.R; r++) { const be = net.boardEdge[r]; for (let q = 0; q < be.length; q++) rBoard[r] += P.load[be[q]] * h; }
    }
    return { inn: sIn, out: sOut, xfer: sX, peak: peak, routeBoard: rBoard };
  };
  // 重要设施与小区吸引的日汇总（设施：到达 inn / 离开 out 及其中乘地铁的部分、分目的到达；小区：分目的吸引与地铁部分、出发总量）
  Model.prototype.attractDaily = function (per) {
    const Z = this.Z, F = this.fn.F;
    const o = { inn: new Float32Array(F), innM: new Float32Array(F), out: new Float32Array(F), outM: new Float32Array(F), purp: new Float32Array(NPK * F), purpM: new Float32Array(NPK * F),
      dest: new Float32Array(NPK * Z), destM: new Float32Array(NPK * Z), trips: new Float32Array(Z), metro: new Float32Array(Z), F: F, key: this.fn.key, ready: true };
    for (let p = 0; p < NP; p++) {
      const P = per[p], h = this.pHours[p], hm = h * (p === 3 ? 0.9 : 1);
      if (!P.stats || !P.fIn || P.fIn.length !== F || P.facKey !== o.key) { o.ready = false; continue; }
      for (let k = 0; k < F; k++) { o.inn[k] += P.fIn[k] * h; o.innM[k] += P.fInM[k] * hm; o.out[k] += P.fOut[k] * h; o.outM[k] += P.fOutM[k] * hm; }
      for (let k = 0; k < NPK * F; k++) { o.purp[k] += P.fP[k] * h; o.purpM[k] += P.fPM[k] * hm; }
      for (let k = 0; k < NPK * Z; k++) { o.dest[k] += P.zDest[k] * h; o.destM[k] += P.zDestM[k] * hm; }
      for (let z = 0; z < Z; z++) { o.trips[z] += P.zTrips[z] * h; o.metro[z] += P.zMetro[z] * hm; }
    }
    return o;
  };
  Model.prototype.computeDaily = function () {
    const net = this.net;
    const dW = this.aggregate(this.ctxs.wd.per, net), dE = this.aggregate(this.ctxs.we.per, net);
    dW.dt = 'wd'; dE.dt = 'we';
    this.dailyWk = dW; this.dailyWe = dE;
    this.daily = this.weekAvg(dW, dE, net);
    this.dailyNow = this.dayType === 'we' ? dE : dW;
    if (net) {
      const a = this.stationDaily(this.ctxs.wd.per, net), b = this.stationDaily(this.ctxs.we.per, net), W = CFG.trips.weekWeights;
      const mix = function (x, y) { const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] * W.wd + y[i] * W.we; return o; };
      const peak = new Float32Array(net.N); for (let i = 0; i < net.N; i++) peak[i] = Math.max(a.peak[i], b.peak[i]);
      this.stDailyWk = a; this.stDailyWe = b;
      this.stDaily = { inn: mix(a.inn, b.inn), out: mix(a.out, b.out), xfer: mix(a.xfer, b.xfer), peak: peak, routeBoard: mix(a.routeBoard, b.routeBoard) };
      this.dailyStale = false;
    }
    this.facDaily = { wd: this.attractDaily(this.ctxs.wd.per), we: this.attractDaily(this.ctxs.we.per) };
    // 小区可达性（用于城市发展）：工作日早高峰
    const za = this.ctxs.wd.per[0].zAccess;
    let mx = 0; for (let z = 0; z < this.Z; z++) if (za[z] > mx) mx = za[z];
    this.zoneAccessNorm = new Float32Array(this.Z);
    if (mx > 0) for (let z = 0; z < this.Z; z++) this.zoneAccessNorm[z] = Math.sqrt(za[z] / mx);
    const copy=P=>{const o={};for(const k of ['arcVol','arcTime','freq','freqDir','needDir','load','stIn','stOut','stXfer','stDelay','stBoard','zTrips','zMetro','zCW','zCT','desTot','desMetro'])if(P[k])o[k]=P[k].slice();o.stats=P.stats;o.stable=P.stable;return o;};
    this.results={wd:{per:this.ctxs.wd.per.map(copy)},we:{per:this.ctxs.we.per.map(copy)}};
    this.live=this.resultsFor(this.dayType);
    this.version++;
  };
  // 设施启停期间只提供与当前设施表对应且四时段均已完成的数据。
  Model.prototype.facData = function (dt) {
    const o = this.facDaily && this.facDaily[dt === 'we' ? 'we' : 'wd'];
    return o && o.ready && o.key === this.fn.key ? o : null;
  };
  // 重要设施的日统计（dt：wd / we / avg）
  Model.prototype.facStats = function (id, dt) {
    const k = this.facIndex(id); if (k < 0 || !this.facDaily) return null;
    const one = function (o) {
      if (!o || o.F <= k) return null;
      const purp = {}, purpM = {}; for (let q = 0; q < NPK; q++) { purp[PK[q]] = o.purp[k * NPK + q]; purpM[PK[q]] = o.purpM[k * NPK + q]; }
      return { inn: o.inn[k], innM: o.innM[k], out: o.out[k], outM: o.outM[k], purp: purp, purpM: purpM };
    };
    if (dt === 'wd' || dt === 'we') return one(this.facData(dt));
    const a = one(this.facData('wd')), b = one(this.facData('we')), W = CFG.trips.weekWeights;
    if (!a || !b) return null;
    const purp = {}, purpM = {}; for (const q of PK) { purp[q] = a.purp[q] * W.wd + b.purp[q] * W.we; purpM[q] = a.purpM[q] * W.wd + b.purpM[q] * W.we; }
    return { inn: a.inn * W.wd + b.inn * W.we, innM: a.innM * W.wd + b.innM * W.we, out: a.out * W.wd + b.out * W.we, outM: a.outM * W.wd + b.outM * W.we, purp: purp, purpM: purpM };
  };

  // ---------------- 画面用：时刻插值 ----------------
  Model.prototype.profileAt = function (minute) {
    const h = minute / 60 - 0.5;
    const h0 = Math.floor(h), t = h - h0;
    const a = this.profile[(h0 + 24) % 24], b = this.profile[(h0 + 25) % 24];
    return a + (b - a) * t;
  };
  Model.prototype.weights = function (minute) {
    const m = ((minute % 1440) + 1440) % 1440;
    const hr = Math.floor(m / 60);
    const p0 = this.hourPeriod[hr];
    const frac = (m % 60) / 60;
    let p1 = p0, w1 = 0;
    if (frac > 0.75) { const pn = this.hourPeriod[(hr + 1) % 24]; if (pn !== p0) { p1 = pn; w1 = (frac - 0.75) / 0.5; } }
    else if (frac < 0.25) { const pp = this.hourPeriod[(hr + 23) % 24]; if (pp !== p0) { p1 = pp; w1 = (0.25 - frac) / 0.5; } }
    const prof = this.profileAt(m);
    const w0 = 1 - w1;
    return { p0: p0, w0: w0, s0: prof / this.pMean[p0], p1: p1, w1: w1, s1: prof / this.pMean[p1], svc: (m >= 360 || m < 5) ? 1 : 0, prof: prof };
  };
  Model.prototype.arcVolAt = function (a, W) {
    const live=this.resultsFor(this.dayType),P0=live.per[W.p0],P1=live.per[W.p1];
    return P0.arcVol[a] * W.w0 * W.s0 + P1.arcVol[a] * W.w1 * W.s1;
  };
  Model.prototype.arcRatioAt = function (a, W) {
    const v = this.arcVolAt(a, W), x = v / this.cap(a);
    return Math.min(8, 1 + CFG.road.bprA * x * x * x * x);
  };
  Model.prototype.cityCongAt = function (W) {
    const road = this.road; let num = 0, den = 0;
    const capF = this.capF || 1;
    for (let a = 0; a < road.nA; a++) {
      const v = this.arcVolAt(a, W); if (v <= 0) continue;
      const x = v / (road.arcCap[a] * capF);
      num += v * road.arcLen[a] * Math.min(8, 1 + CFG.road.bprA * x * x * x * x); den += v * road.arcLen[a];
    }
    return den > 0 ? num / den : 1;
  };
  // 线路最低服务水平（列/小时）：车站越多、站距越小的城区线越密，站距大的郊区线较疏；非环线保证至少 2 列车在线运行
  Model.serviceFloor = function (rt, p) {
    const mc = CFG.metro;
    if (!rt) return mc.fMin[p];
    const ns = rt.stIdx.length, sp = rt.lenM / 1000 / Math.max(1, rt.loop ? ns : ns - 1);
    const fs = U.clamp(1.5 - 0.35 * sp, 0.7, 1.3);          // 平均站距 1 km → 1.15；2.3 km 以上 → 0.7
    const fn = U.clamp(0.82 + ns / 45, 0.85, 1.3);          // 8 站 → 1.0；22 站以上 → 1.3
    let f = mc.fMin[p] * fs * fn;
    if (!rt.loop && rt.cycleSec > 0) f = Math.max(f, 2 * 3600 / rt.cycleSec);
    return Math.min(f, mc.fMax);
  };
  // dir：环线的方向（0 / 1，v2.5 两个方向的列车数可以不同）；不传时为两个方向的平均
  Model.prototype.freqAt = function (r, W, dir) {
    if (!this.net || !W.svc) return 0;
    const a = this.live.per[W.p0], b = this.live.per[W.p1];
    if (dir != null && a.freqDir && b.freqDir && a.freqDir.length === 2 * this.net.R) return a.freqDir[2 * r + dir] * W.w0 + b.freqDir[2 * r + dir] * W.w1;
    return a.freq[r] * W.w0 + b.freq[r] * W.w1;
  };
  // ---------------- 车队（v2.5，fleet.js） ----------------
  // fleetSource(net) 返回该线网各路线的车队计划（投入的列车、平均定员与编组、运营成本系数、手动设定），没有则按自动配车
  Model.prototype.fleetOf = function (net) { return this.fleetSource && net && net.C ? this.fleetSource(net) : null; };
  // 路线每列车的平均定员（有车队时按配属列车，否则按编组上限 × 默认定员）
  Model.prototype.capOf = function (r, net) { net = net || this.net; const pl = this.fleetOf(net), fp = pl && pl[r]; return fp ? fp.cap : (net && net.C.routes[r] ? net.C.routes[r].cap : 1); };
  // 区间 q（rideEdge 下标：偶数正向、奇数反向）的发车频率
  Model.dirFreq = function (P, net, r, q) { const rt = net.C.routes[r]; return P.freqDir && P.freqDir.length === 2 * net.R ? P.freqDir[2 * r + (rt.loop ? (q & 1) : 0)] : P.freq[r]; };
  // 车队变化（购买、调拨、出售、手动设定）后立即按新的列车数重算各时段频率与运营费用，不等下个月的交通求解；
  // 所需频率（needDir）沿用上次求解结果，客流分配在下次求解时随之调整
  Model.prototype.applyFleet = function () {
    const net = this.net; if (!net || !net.R) return;
    const plan = this.fleetOf(net), mc = CFG.metro; if (!plan) return;
    const sets = [this.ctxs.wd.per, this.ctxs.we.per]; if (this.results) sets.push(this.results.wd.per, this.results.we.per);
    for (const per of sets) for (let p = 0; p < per.length; p++) {
      const P = per[p]; if (!P || !P.freq || P.freq.length !== net.R || !P.freqDir || P.freqDir.length !== 2 * net.R) continue;
      for (let r = 0; r < net.R; r++) {
        const rt = net.C.routes[r], fp = plan[r]; if (!fp) continue;
        const per1 = 3600 / Math.max(60, rt.cycleSec), nd = rt.loop ? 2 : 1;
        for (let d = 0; d < nd; d++) {
          const k = 2 * r + d, f = fp.manual ? Math.min(mc.fMax, Math.min(fp.manual[d][p], fp.avail[d]) * per1) : Math.min(P.needDir[k] || P.freqDir[k] || Model.serviceFloor(rt, p), mc.fMax, fp.avail[d] * per1);
          P.freqDir[k] = f; if (nd === 1) P.freqDir[k + 1] = f;
        }
        P.freq[r] = nd === 2 ? (P.freqDir[2 * r] + P.freqDir[2 * r + 1]) / 2 : P.freqDir[2 * r];
      }
    }
    if (!this.solving && !this.refreshing && this.ctxs.wd.per.every(function (P) { return P.stats; })) this.computeDaily();
    this.version++;
    if (this.settled) this.wake(1);   // 后台再求解一轮，让客流随新的发车间隔重新分配
  };
  Model.prototype.stFlowAt = function (s, W, kind) {
    const P0 = this.live.per[W.p0], P1 = this.live.per[W.p1];
    const k = kind || 'stIn';
    return (P0[k][s] * W.w0 * W.s0 + P1[k][s] * W.w1 * W.s1) * W.svc;
  };
  Model.prototype.edgeLoadAt = function (e, W) {
    const P0 = this.live.per[W.p0], P1 = this.live.per[W.p1];
    return (P0.load[e] * W.w0 * W.s0 + P1.load[e] * W.w1 * W.s1) * W.svc;
  };

  // 任务、开通效果和图层共用同一批已发布结果。
  Model.prototype.zoneTraffic=function(z){
    const P=this.resultsFor('wd').per[0],trips=P.zTrips[z]||0,metro=P.zMetro[z]||0;
    return{trips,metro,car:Math.max(0,trips-metro),carShare:trips>0?1-metro/trips:1};
  };
  Model.prototype.zoneOpportunity=function(z){
    const net=this.net,acc=net&&net.acc,od=this.od;if(!acc||!od||!this.trafficReady())return 0;
    // 只承诺现有可步行接入且已连通的地铁网络能服务的那部分需求，不把过境车流全算成本地可替代出行。
    if(!this._opportunity||this._opportunity.net!==net){
      const roots=Array.from({length:net.N},(_,i)=>i),find=i=>{while(roots[i]!==i)i=roots[i];return i;};
      for(const r of net.C.routes)for(const st of r.stIdx)roots[find(st)]=find(r.stIdx[0]);
      for(const tr of acc.transfers)roots[find(tr.a)]=find(tr.b);
      this._opportunity={net,roots:roots.map(find)};
    }
    const lo=acc.zl[z];if(!lo)return 0;const connected=new Set(lo.map(a=>this._opportunity.roots[a.s]));let eligible=0;
    for(let k=od.start[z];k<od.start[z+1];k++){
      const d=od.dest[k],ld=acc.zl[d];if(!ld||!ld.some(a=>connected.has(this._opportunity.roots[a.s])))continue;
      let flow=0;for(let p=0;p<NPK;p++)flow+=(od.t[p][k]||0)*CFG.trips.split.wd[PK[p]].o[0]/this.pHours[0];
      eligible+=flow*(acc.zCov[z]||0)*(acc.zCov[d]||0);
    }
    return Math.max(0,eligible-this.zoneTraffic(z).metro);
  };
  Model.congestionLevel=function(r){return r<1.15?0:r<1.35?1:r<1.6?2:3;};
  Model.congestionNames=['畅通','缓行','拥堵','严重拥堵'];

  // ---------------- 建设前预测 ----------------
  // 基于同一城市状态与票价，比较当前网络与草案网络（均从当前运行状态热启动，迭代次数相同）；工作日与周末分别计算
  Model.prototype.predict = function (draftC, affectedLineIds, done, comparisonC) {
    const self = this;
    const gen = (function* () {
      const result = { conditions: { year: self.year, fare: Object.assign({}, self.fare) }, progress: 0 };
      self.predState = result;
      const baseNet = comparisonC?self.buildMetro(comparisonC):self.net;
      if (comparisonC) yield;   // 两次建网分在两帧（v2.3：大型线网每次约百毫秒，合在一帧是明显的长帧）
      const draftNet = self.buildMetro(draftC);
      yield;
      // 一个时段的预测（各时段互不依赖，交给时段流水线交错执行；进度按完成的迭代次数计）
      const ITS = [6, 4, 6, 3], nets = { base: baseNet, draft: draftNet }, out = { base: { wd: [], we: [] }, draft: { wd: [], we: [] } };
      let itDone = 0;
      const runOne = function* (job, buf) {
        const net = nets[job[0]], dt = job[1], p = job[2];
        const L = self.ctxs[dt].per[p];
        const P = {
          arcVol: Float32Array.from(L.arcVol), arcTime: Float32Array.from(L.arcTime), skimT: Float32Array.from(L.skimT), skimK: Float32Array.from(L.skimK),
          desTot: new Float32Array(self.B * self.B), desMetro: new Float32Array(self.B * self.B), zTrips: new Float32Array(self.Z), zMetro: new Float32Array(self.Z), zAccess: new Float32Array(self.Z),
          stats: null, demandTotal:L.demandTotal, iters: Math.max(1, L.iters), dt: dt,
        };
        self.allocStatArrays(P);
        self.initMetroPer(P, net, p, L, self.net);
        for (let it = 0; it < ITS[p]; it++) {
          yield* self.iterate(net, P, p, { noSmooth: true, metroLam: it === 0 ? 0.7 : 0.6, buf: buf, pred: true });
          result.progress = ++itDone / itTotal;
          if(P.stable){itDone+=ITS[p]-it-1;result.progress=itDone/itTotal;break;}
        }
        // 仅保留结果所需
        return { stable:P.stable, stats: P.stats, freq: P.freq, freqDir: P.freqDir, load: P.load, stIn: P.stIn, stOut: P.stOut, stXfer: P.stXfer, arcVol: p === 0 ? P.arcVol : null, arcTime: p === 0 ? P.arcTime : null,
          fIn: P.fIn, fInM: P.fInM, fOut: P.fOut, fOutM: P.fOutM, fP: P.fP, zDest: P.zDest, zDestM: P.zDestM, zTrips: P.zTrips, zMetro: P.zMetro };
      };
      const jobs = [];
      for (const k of baseNet ? ['base', 'draft'] : ['draft']) for (const dt of DT) for (let p = 0; p < NP; p++) jobs.push([k, dt, p]);
      const itTotal = jobs.reduce(function (s, j) { return s + ITS[j[2]]; }, 0);
      result.progress = 0;
      yield* self.pipeline(jobs, runOne, function (j, per) { out[j[0]][j[1]][j[2]] = per; }, true);
      result.stable=Object.values(out).every(group=>DT.every(dt=>group[dt].every(P=>P.stable)));
      const base = baseNet ? out.base : null;
      const draft = out.draft;
      const empty = function () { return self.aggregate([0, 1, 2, 3].map(function () { return null; }), null); };
      const B = base ? { wd: self.aggregate(base.wd, baseNet), we: self.aggregate(base.we, baseNet) } : { wd: empty(), we: empty() };
      const Dr = { wd: self.aggregate(draft.wd, draftNet), we: self.aggregate(draft.we, draftNet) };
      result.base = self.weekAvg(B.wd, B.we, baseNet); result.draft = self.weekAvg(Dr.wd, Dr.we, draftNet);
      result.wk = { base: B.wd, draft: Dr.wd }; result.we = { base: B.we, draft: Dr.we };
      // 出行目的：地铁出行（人次/日），工作日与周末
      result.purpose = PK.map(function (k, q) { return { key: k, wd0: B.wd[MKEY[q]] || 0, wd1: Dr.wd[MKEY[q]] || 0, we0: B.we[MKEY[q]] || 0, we1: Dr.we[MKEY[q]] || 0, tot: Dr.wd[TKEY[q]] || 0 }; });
      result.induced = { wd: Dr.wd.indM || 0, we: Dr.we.indM || 0, wd0: B.wd.indM || 0, we0: B.we.indM || 0 };
      // 重要设施：乘地铁到达与离开（人次/日）的变化
      const facM = function (per) {
        const F = self.fn.F, out = new Float32Array(F), all = new Float32Array(F);
        if (!per) return { m: out, all: all };
        for (let p = 0; p < NP; p++) { const P = per[p], h = self.pHours[p], hm = h * (p === 3 ? 0.9 : 1); if (!P.fIn || P.fIn.length !== F) continue; for (let k = 0; k < F; k++) { out[k] += (P.fInM[k] + P.fOutM[k]) * hm; all[k] += (P.fIn[k] + P.fOut[k]) * h; } }
        return { m: out, all: all };
      };
      const fb = { wd: facM(base && base.wd), we: facM(base && base.we) }, fd = { wd: facM(draft.wd), we: facM(draft.we) };
      result.fac = [];
      self.fn.list.forEach(function (f, k) {
        const dw = fd.wd.m[k] - fb.wd.m[k], de = fd.we.m[k] - fb.we.m[k];
        if (Math.abs(dw) < 50 && Math.abs(de) < 50) return;
        result.fac.push({ id: f.id, name: f.name, t: f.t, wd0: fb.wd.m[k], wd1: fd.wd.m[k], we0: fb.we.m[k], we1: fd.we.m[k], allWd: fd.wd.all[k], allWe: fd.we.all[k] });
      });
      result.fac.sort(function (a, b) { return Math.max(Math.abs(b.wd1 - b.wd0), Math.abs(b.we1 - b.we0)) - Math.max(Math.abs(a.wd1 - a.wd0), Math.abs(a.we1 - a.we0)); });
      // 新线客流：受影响线路的日上车人次（周平均）
      const W = CFG.trips.weekWeights;
      const lineBoard = function (perSet, net) {
        const m = new Map();
        if (!perSet || !net) return m;
        for (const dt of DT) {
          const per = perSet[dt], wt = W[dt];
          for (let p = 0; p < NP; p++) {
            const h = self.pHours[p] * (p === 3 ? 0.9 : 1);
            for (let r = 0; r < net.R; r++) {
              const lid = net.C.routes[r].lineId;
              let s = 0; const be = net.boardEdge[r];
              for (let q = 0; q < be.length; q++) s += per[p].load[be[q]];
              m.set(lid, (m.get(lid) || 0) + s * h * wt);
            }
          }
        }
        return m;
      };
      const lb0 = lineBoard(base, baseNet), lb1 = lineBoard(draft, draftNet);
      result.lines = [];
      for (const lid of affectedLineIds) {
        const ln = draftC.net.lines[lid];
        result.lines.push({ id: lid, name: ln ? ln.name : '（已拆除）', color: ln ? ln.color : '#999', before: lb0.get(lid) || 0, after: lb1.get(lid) || 0 });
      }
      // 建设效果归因（v2.3，impact.js）：受影响线路各站的日客流（周平均，进出站 + 换乘）与工作日早高峰最大满载率
      const stFlow = function (perSet, net) {
        if (!perSet || !net) return null;
        const a = self.stationDaily(perSet.wd, net), b = self.stationDaily(perSet.we, net), out = new Float32Array(net.N);
        for (let s = 0; s < net.N; s++) out[s] = (a.inn[s] + a.out[s] + a.xfer[s]) * W.wd + (b.inn[s] + b.out[s] + b.xfer[s]) * W.we;
        return out;
      };
      const sf1 = stFlow(draft, draftNet), sf0 = stFlow(base, baseNet), seenSt = new Set();
      result.stations = []; result.lineLF = [];
      for (const lid of affectedLineIds) {
        const tp = draftC.topo && draftC.topo.get(lid); if (!tp || !tp.routes.length) continue;
        for (const rt of tp.routes) for (const sid of rt.st) {
          if (seenSt.has(sid)) continue; seenSt.add(sid);
          const k1 = draftC.sIndex.get(sid), k0 = baseNet ? baseNet.C.sIndex.get(sid) : undefined, s = draftC.net.stations[sid];
          if (k1 === undefined || !s) continue;
          result.stations.push({ id: sid, line: lid, name: s.name, x: s.x, y: s.y, size: s.size, flow: sf1[k1] || 0, flow0: k0 !== undefined && sf0 ? sf0[k0] || 0 : 0, end: tp.adj.get(sid).length === 1 });
        }
      }
      if (draftNet.R) {
        const am = draft.wd[0];
        for (let r = 0; r < draftNet.R; r++) {
          const rt = draftNet.C.routes[r]; if (affectedLineIds.indexOf(rt.lineId) < 0) continue;
          const re = draftNet.rideEdge[r]; let mx = 0;
          for (let q = 0; q < re.length; q++) if (am.load[re[q]] > mx) mx = am.load[re[q]];
          result.lineLF.push({ id: rt.lineId, label: rt.label, lf: mx / Math.max(1, am.freq[r] * self.capOf(r, draftNet)), km: rt.lenM / 1000 });
        }
      }
      // 道路变化：工作日早高峰按道路名汇总
      if (base) {
        const road = self.road, byName = new Map();
        const v0 = base.wd[0].arcVol, v1 = draft.wd[0].arcVol;
        for (const L of road.links) {
          if (!L.name || L.cls < 3) continue;
          for (let d = 0; d < 2; d++) {
            const a = 2 * L.id + d;
            const e = byName.get(L.name) || { n0: 0, n1: 0, d0: 0, d1: 0, vkt0: 0, top: -1, pt: null };
            const x0 = base.wd[0].arcTime[a] / road.arcT0[a], x1 = draft.wd[0].arcTime[a] / road.arcT0[a];
            e.n0 += v0[a] * L.lenM * x0; e.d0 += v0[a] * L.lenM; e.n1 += v1[a] * L.lenM * x1; e.d1 += v1[a] * L.lenM; e.vkt0 += v0[a] * L.lenM;
            // 最拥堵路段的位置（归因：拥堵道路离新线多远）
            const hot = v0[a] * L.lenM * Math.max(0, x0 - 1); if (hot > e.top) { e.top = hot; e.pt = L.pts[Math.floor(L.pts.length / 2)]; }
            byName.set(L.name, e);
          }
        }
        const roads = [];
        byName.forEach(function (e, nid) {
          if (e.d0 <= 0 || !self.city.roadNames[nid]) return;
          const vc0 = e.n0 / e.d0, vc1 = e.d1 > 0 ? e.n1 / e.d1 : 0;
          roads.push({ name: self.city.roadNames[nid], vc0: vc0, vc1: vc1, delta: vc1 - vc0, w: e.vkt0, x: e.pt ? +e.pt[0].toFixed(2) : null, y: e.pt ? +e.pt[1].toFixed(2) : null });
        });
        // 早高峰最拥堵的主要道路（按拥堵车公里排序），供建设效果归因判断新线是否分流到拥堵走廊
        result.hot = roads.filter(function (r) { return r.vc0 >= 1.25 && r.x != null; }).sort(function (a, b) { return b.w * (b.vc0 - 1) - a.w * (a.vc0 - 1); }).slice(0, 4)
          .map(function (r) { return { name: r.name, vc0: r.vc0, vc1: r.vc1, x: r.x, y: r.y }; });
        roads.sort(function (a, b) { return a.delta - b.delta; });
        result.roads = roads.filter(function (r) { return r.delta < -0.004; }).slice(0, 5);
        result.roadsWorse = roads.filter(function (r) { return r.delta > 0.004; }).sort(function (a, b) { return b.delta - a.delta; }).slice(0, 3);
      } else { result.roads = []; result.roadsWorse = []; result.hot = []; }
      // 有效性
      result.valid = draftNet.R > 0 && result.draft.metro > 1;
      if (!result.valid) {
        if (draftNet.R === 0) result.reason = '草案中没有形成可运营的线路（至少需要两座车站和一段轨道）。';
        else {
          let acc = 0; for (let s = 0; s < draftNet.N; s++) acc += draftNet.acc.accessible[s];
          result.reason = acc === 0 ? '车站周边暂无可步行到达的道路，无法形成有效地铁行程。' : '车站覆盖范围内的出行需求很少，暂未形成有效地铁行程。';
        }
      }
      result.progress = 1;
      return result;
    })();
    this.predEpoch = (this.predEpoch || 0) + 1;   // 新的预测开始：之前预测尚未发出的计算块作废
    this.predJob = { gen: gen, done: done };
    return gen;
  };
  Model.prototype.cancelPredict = function () { this.predJob = null; this.predEpoch = (this.predEpoch || 0) + 1; };
})(window.CM);
