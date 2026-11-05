'use strict';
// 通用工具：数学、随机数、堆、折线几何、格式化、编码
window.CM = window.CM || {};
(function (CM) {
  const U = {};

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.smooth = function (t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.easeInOut = function (t) { t = U.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  U.dist = function (ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); };
  U.now = function () { return performance.now(); };

  // 历史水域只修订现有格网内的部分，不因资料范围更大而扩大地图。
  U.clipMapPolygon = function (points, width, height) {
    let out = points.map(function (p) { return [p[0], p[1]]; });
    for (const edge of [[0, 0, 1], [0, width, -1], [1, 0, 1], [1, height, -1]]) {
      const input = out; out = [];
      if (!input.length) break;
      const axis = edge[0], bound = edge[1], sign = edge[2];
      let a = input[input.length - 1], insideA = (a[axis] - bound) * sign >= 0;
      for (const b of input) {
        const insideB = (b[axis] - bound) * sign >= 0;
        if (insideA !== insideB) {
          const t = (bound - a[axis]) / (b[axis] - a[axis]);
          const p = [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t)]; p[axis] = bound; out.push(p);
        }
        if (insideB) out.push(b);
        a = b; insideA = insideB;
      }
    }
    return out.filter(function (p, i) { const prev = out[(i + out.length - 1) % out.length]; return U.dist(p[0], p[1], prev[0], prev[1]) > 1e-7; });
  };

  // 确定性哈希随机（用于逐格的稳定随机）
  U.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  };
  U.noise2 = function (x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = U.hash2(xi, yi, seed), b = U.hash2(xi + 1, yi, seed), c = U.hash2(xi, yi + 1, seed), d = U.hash2(xi + 1, yi + 1, seed);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  U.fbm = function (x, y, seed, oct) {
    oct = oct || 3;
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += amp * U.noise2(x * f, y * f, seed + i * 17); n += amp; amp *= 0.5; f *= 2; }
    return s / n;
  };

  // 可保存状态的伪随机数（mulberry32）
  function RNG(seed) { this.s = (seed >>> 0) || 1; }
  RNG.prototype.next = function () {
    let t = (this.s = (this.s + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (n) { return Math.floor(this.next() * n); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  U.RNG = RNG;

  // 最小堆（键 Float64，值 Int32）
  function Heap(cap) {
    cap = cap || 1024;
    this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; this.lastKey = 0;
  }
  Heap.prototype.clear = function () { this.n = 0; };
  Heap.prototype.push = function (key, val) {
    if (this.n >= this.k.length) {
      const nk = new Float64Array(this.k.length * 2); nk.set(this.k); this.k = nk;
      const nv = new Int32Array(this.v.length * 2); nv.set(this.v); this.v = nv;
    }
    const k = this.k, v = this.v;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v;
    const rv = v[0]; this.lastKey = k[0];
    const n = --this.n;
    if (n > 0) {
      const key = k[n], val = v[n];
      let i = 0;
      for (;;) {
        let l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && k[r] < k[l]) l = r;
        if (k[l] >= key) break;
        k[i] = k[l]; v[i] = v[l]; i = l;
      }
      k[i] = key; v[i] = val;
    }
    return rv;
  };
  U.Heap = Heap;

  // ---------- 折线几何 ----------
  U.cumLen = function (pts) {
    const c = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) c[i] = c[i - 1] + U.dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    return c;
  };
  // 按距离取折线位置（out: {x,y,a,i}）
  U.posAt = function (pts, cum, d, out) {
    const n = pts.length;
    out = out || {};
    if (n === 1 || d <= 0) {
      const b = n > 1 ? pts[1] : pts[0];
      out.x = pts[0][0]; out.y = pts[0][1]; out.a = Math.atan2(b[1] - pts[0][1], b[0] - pts[0][0]); out.i = 0; return out;
    }
    if (d >= cum[n - 1]) {
      out.x = pts[n - 1][0]; out.y = pts[n - 1][1];
      out.a = Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]); out.i = n - 2; return out;
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo];
    const t = seg > 0 ? (d - cum[lo]) / seg : 0;
    const a = pts[lo], b = pts[hi];
    out.x = a[0] + (b[0] - a[0]) * t; out.y = a[1] + (b[1] - a[1]) * t;
    out.a = Math.atan2(b[1] - a[1], b[0] - a[0]); out.i = lo; out.f = t;
    return out;
  };
  // 点到线段距离；U._t 存参数
  U.distToSeg = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    U._t = t;
    const qx = ax + dx * t - px, qy = ay + dy * t - py;
    return Math.sqrt(qx * qx + qy * qy);
  };
  U.distToPoly = function (px, py, pts) {
    let best = Infinity, bi = 0, bt = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = U.distToSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d < best) { best = d; bi = i; bt = U._t; }
    }
    U._i = bi; U._t = bt;
    return best;
  };
  U.segIntersect = function (ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) return false;
    const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den;
    const u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  U.chaikin = function (pts, iters) {
    let p = pts;
    for (let k = 0; k < iters; k++) {
      if (p.length < 3) return p;
      const q = [p[0]];
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i], b = p[i + 1];
        if (i > 0) q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        if (i + 2 < p.length) q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      q.push(p[p.length - 1]);
      p = q;
    }
    return p;
  };
  U.interp = function (tbl, x) {
    if (x <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) {
      if (x <= tbl[i][0]) {
        const a = tbl[i - 1], b = tbl[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
    }
    return tbl[tbl.length - 1][1];
  };

  // ---------- 颜色 ----------
  U.hex2rgb = function (h) {
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  U.rgb = function (c, a) {
    if (a === undefined) return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  };
  U.shade = function (c, f) { return [U.clamp(c[0] * f, 0, 255), U.clamp(c[1] * f, 0, 255), U.clamp(c[2] * f, 0, 255)]; };
  U.mixc = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  U.ramp = function (stops, t) {
    t = U.clamp(t, 0, 1);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        const k = (t - a[0]) / Math.max(1e-9, b[0] - a[0]);
        return U.mixc(a[1], b[1], k);
      }
    }
    return stops[stops.length - 1][1];
  };

  // ---------- 格式化 ----------
  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  // 未开放区域的说明：按参考年份开放，或长期不开放（如军用机场，见区域的 lockNote）
  U.regionLock = function (rg) { return rg.open != null ? '参考 ' + rg.open + ' 年开放' : (rg.lockNote || '不开放'); };
  // 金额：内部单位为「万 + 本城货币」（广州、杭州为万元，香港为万港元，东京为万日元），显示随当前地图的货币
  // money 可显式指定（地图选择页显示别的地图时用）
  U.fmtMoney = function (wan, digits, money) {
    if (wan === Infinity) return '∞';
    if (!isFinite(wan)) return '—';
    const mo = money || (CM.CFG && CM.CFG.money) || { wan: '万元', yi: '亿元' };
    // 货币时期（巴黎）：内部金额始终为同一记账单位，显示时按当期货币折算（div = 每 1 显示单位折合的内部单位）
    wan = wan / (mo.div || 1);
    if (CM.I18n && CM.I18n.get()==='en') {
      const amount=wan*10000,abs=Math.abs(amount),scale=abs>=1e9?1e9:abs>=1e6?1e6:abs>=1e3?1e3:1,suffix=scale===1e9?'B':scale===1e6?'M':scale===1e3?'k':'';
      return new Intl.NumberFormat('en',{maximumFractionDigits:digits===undefined?2:digits}).format(amount/scale)+suffix+' '+(mo.code||CM.I18n.text(mo.unit||''));
    }
    const neg = wan < 0; const a = Math.abs(wan);
    let s;
    if (a >= 10000) s = (a / 10000).toFixed(digits === undefined ? (a >= 1e6 ? 0 : 2) : digits) + ' ' + mo.yi;
    else if (a > 0 && a < 1) s = mo.unit ? (a * 10000).toLocaleString('zh-CN', { maximumFractionDigits: a * 10000 >= 100 ? 0 : 2 }) + ' ' + mo.unit : a.toLocaleString('zh-CN', { maximumFractionDigits: 7 }) + ' ' + mo.wan;
    else s = Math.round(a).toLocaleString('zh-CN') + ' ' + mo.wan;
    return (neg ? '−' : '') + s;
  };
  // 价格指数：base 为价格基年；rate 为年涨幅，或分段 [[起始年, 涨幅], …]（按年连乘）
  // 国内地图常用的 GCJ-02 经纬度 → OpenStreetMap 使用的 WGS-84（公开的近似公式，误差约数米）。
  // 中国内地新地图的数据文件按 GCJ-02 填写坐标时用它换算（中国内地的偏移约数百米）
  U.gcj2wgs = (function () {
    const A = 6378245.0, EE = 0.00669342162296594323, PI = Math.PI;
    const tLat = function (x, y) { let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3; r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3; return r; };
    const tLon = function (x, y) { let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3; r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3; r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3; return r; };
    return function (lat, lon) {
      const rad = lat / 180 * PI, s = Math.sin(rad), m = 1 - EE * s * s, sm = Math.sqrt(m);
      const dLat = tLat(lon - 105, lat - 35) * 180 / ((A * (1 - EE)) / (m * sm) * PI), dLon = tLon(lon - 105, lat - 35) * 180 / (A / sm * Math.cos(rad) * PI);
      return [lat - dLat, lon - dLon];
    };
  })();
  // 分段涨幅表的累计指数按整年缓存（逐年表可长达百余项，如巴黎 1900–2020）；累乘顺序与逐年计算相同，结果不变
  const piCache = new WeakMap();
  U.priceIndex = function (year, rate, base) {
    if (year <= base) return 1;
    if (typeof rate === 'number') return Math.pow(1 + rate, year - base);
    let c = piCache.get(rate);
    if (!c || c.base !== base) { c = { base: base, f: [1], r: [] }; piCache.set(rate, c); }
    const n = Math.floor(year) - base;
    while (c.f.length <= n + 1) {
      const y = base + c.f.length - 1;
      let r = rate[0][1]; for (const s of rate) if (y >= s[0]) r = s[1];
      c.r.push(r); c.f.push(c.f[c.f.length - 1] * Math.pow(1 + r, 1));
    }
    const frac = year - Math.floor(year);
    return frac > 0 ? c.f[n] * Math.pow(1 + c.r[n], frac) : c.f[n];
  };
  U.fmtYi = function (wan, d) { return (U.cur(wan) / 10000).toFixed(d === undefined ? 2 : d); };
  // 内部金额 → 当前显示货币（只有设置了货币时期的地图 div ≠ 1）
  U.cur = function (v) { const mo = CM.CFG && CM.CFG.money; return v / ((mo && mo.div) || 1); };
  U.fmtPeople = function (n) {
    if (!isFinite(n)) return '—';
    if (CM.I18n && CM.I18n.get()==='en') return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
    const a = Math.abs(n);
    if (a >= 1e4) return (n / 1e4).toFixed(a >= 1e6 ? 0 : 1) + ' 万';
    return Math.round(n).toLocaleString('zh-CN');
  };
  U.fmtInt = function (n) { return isFinite(n) ? Math.round(n).toLocaleString('zh-CN') : '—'; };
  U.fmtPct = function (x, d) { return isFinite(x) ? (x * 100).toFixed(d === undefined ? 1 : d) + '%' : '—'; };
  U.fmtNum = function (x, d) { return isFinite(x) ? x.toFixed(d === undefined ? 1 : d) : '—'; };
  U.fmtSigned = function (x, d, suffix) {
    if (!isFinite(x)) return '—';
    const s = x.toFixed(d === undefined ? 1 : d);
    return (x > 0 ? '+' : (x < 0 ? '' : '±')) + s.replace('-', '−') + (suffix || '');
  };
  U.fmtClock = function (minute) {
    const m = Math.floor(minute) % 1440;
    return U.pad2(Math.floor(m / 60)) + ':' + U.pad2(m % 60);
  };
  U.fmtKm = function (m) { return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m'; };
  U.daysInMonth = function (y, m) { return new Date(y, m, 0).getDate(); };
  U.ymIndex = function (y, m) { return y * 12 + (m - 1); };

  // ---------- 编码 ----------
  U.bytesToB64 = function (u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  };
  U.b64ToBytes = function (b64) {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  };
  const TYPES = { f32: Float32Array, u16: Uint16Array, u8: Uint8Array, i16: Int16Array, i32: Int32Array };
  U.packTyped = function (arr, kind) {
    const T = TYPES[kind];
    const a = arr instanceof T ? arr : T.from(arr);
    return { t: kind, n: a.length, b: U.bytesToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) };
  };
  U.unpackTyped = function (o) {
    const T = TYPES[o.t];
    if (!T) throw new Error('未知数组类型');
    const bytes = U.b64ToBytes(o.b);
    if (bytes.length !== o.n * T.BYTES_PER_ELEMENT) throw new Error('数组长度不匹配');
    return new T(bytes.buffer.slice(0));
  };
  U.fnv = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  U.uid = function (prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  };

  // ---------- DOM ----------
  U.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk.slice(0, 2) === '--') el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }   // 自定义属性（--x）须用 setProperty
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) appendKid(el, arguments[i]);
    return el;
  };
  function appendKid(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { for (const x of c) appendKid(el, x); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; });
  };

  // 简单事件
  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return fn; };
  Emitter.prototype.off = function (ev, fn) { const a = this._h[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
  Emitter.prototype.emit = function (ev, data) { const a = this._h[ev]; if (a) for (const f of a.slice()) f(data); };
  U.Emitter = Emitter;

  CM.U = U;
})(window.CM);
