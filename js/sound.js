'use strict';
// 音效：Web Audio 实时合成（无外部音频文件）。首次用户操作后解锁；开关与音量由「设置」保存。
// 音色见下方「音色」一节（v2.5 重新设计）。混音（v2.0）：界面音效、列车声与城市环境声分三条总线汇入总音量；列车与环境可分别调节，
// 环境声总线带一个低通滤波（地下视图时变闷）。动态的城市与列车声音见 soundscape.js。
(function (CM) {
  const S = CM.Settings;
  const pref = { enabled: S ? S.get('sound') : true, volume: S ? S.get('volume') : 0.6, trainVol: S ? S.get('trainVol') : 0.7, ambVol: S ? S.get('ambVol') : 0.6 };
  let ac = null, master = null, noiseBuf = null, sfxBus = null, trainBus = null, ambBus = null, ambFilter = null;
  const last = {};
  const cues = new Set();
  let buildingCue = null;

  function ensure() {
    if (!pref.enabled) return null;
    if (!ac) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 4;
        master = ac.createGain(); master.gain.value = pref.volume * 0.9;
        master.connect(comp); comp.connect(ac.destination);
        sfxBus = ac.createGain(); sfxBus.connect(master);
        trainBus = ac.createGain(); trainBus.gain.value = pref.trainVol; trainBus.connect(master);
        ambFilter = ac.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 18000; ambFilter.connect(master);
        ambBus = ac.createGain(); ambBus.gain.value = pref.ambVol; ambBus.connect(ambFilter);
        // 界面音效带一层很短的房间混响（0.6 秒，偏暗），声音不干涩
        const len = (ac.sampleRate * 0.6) | 0, ir = ac.createBuffer(2, len, ac.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const dt = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.35; dt[i] = lp * Math.pow(1 - i / len, 3.5); } }
        const wet = ac.createConvolver(), send = ac.createGain(); wet.buffer = ir; send.gain.value = 0.22;
        sfxBus.connect(send); send.connect(wet); wet.connect(master);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended' && !document.hidden) ac.resume().catch(function () {});
    return ac;
  }
  window.addEventListener('pointerdown', function () { if (pref.enabled) ensure(); }, true);
  window.addEventListener('keydown', function () { if (pref.enabled) ensure(); }, true);
  // 页面隐藏时暂停整个音频（环境声与列车声不在后台持续播放）
  document.addEventListener('visibilitychange', function () {
    if (!ac) return;
    if (document.hidden) {
      Sound.stopCues(true);
      if (ac.state === 'running') ac.suspend().catch(function () {});
    } else if (pref.enabled && ac.state === 'suspended') ac.resume().catch(function () {});
  });
  // 带声像的输出：pan 为 −1（左）到 1（右）；不支持时直接连到总线
  function outTo(dest, pan) {
    if (!pan || !ac.createStereoPanner) return dest;
    const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(dest);
    return p;
  }

  function finishCue(cue) {
    if (cue.done) return;
    cue.done = true; cues.delete(cue);
    cue.output.disconnect(); if (cue.pan) cue.pan.disconnect();
    if (cue.onEnded) { try { cue.onEnded(); } catch (e) { /* 不影响其他声部 */ } }
  }
  // 短音结束后主动断开整条链，避免长期操作累积无输入的音量 / 滤波 / 声像节点。
  function watchSource(source, nodes) {
    const cue = buildingCue;
    if (cue) cue.sources.add(source);
    source.onended = function () {
      source.onended = null;
      for (const node of nodes) node.disconnect();
      if (cue) { cue.sources.delete(source); if (!cue.sources.size) finishCue(cue); }
    };
  }

  // 单音：频率、时长、波形、音量、起始延迟、滑音终点、起音、输出（默认界面音效总线）
  function tone(f, dur, type, gain, delay, f2, attack, dest) {
    const t0 = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    const a = attack || 0.006;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxBus);
    watchSource(o, [o, g]);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // 铃声：基频 + 泛音
  function bell(f, dur, gain, delay, dest) {
    tone(f, dur, 'sine', gain, delay, null, 0.004, dest);
    tone(f * 2.01, dur * 0.6, 'sine', gain * 0.35, delay, null, 0.004, dest);
    tone(f * 3.02, dur * 0.35, 'sine', gain * 0.12, delay, null, 0.004, dest);
  }
  // 噪声：带通/低通，可扫频
  function noise(dur, type, freq, q, gain, delay, freq2, dest) {
    const t0 = ac.currentTime + (delay || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const flt = ac.createBiquadFilter(); flt.type = type || 'bandpass'; flt.Q.value = q || 1;
    flt.frequency.setValueAtTime(freq, t0);
    if (freq2) flt.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.03, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(dest || sfxBus);
    watchSource(src, [src, flt, g]);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
  }

  // ---------- 音色（v2.5 重新设计）----------
  // 以 FM 合成的软木槌和玻璃钟片为主体，配极短的触感噪声和一层很短的房间混响，不再用方波、锯齿波；
  // 音高都在 A 大调五声音阶上（与开场动画同调），声音之间听起来是一家人。频繁触发的声音带一点随机音高，不显得机械
  const N = { A2: 110, E3: 164.81, A3: 220, Cs4: 277.18, E4: 329.63, A4: 440, B4: 493.88, Cs5: 554.37, E5: 659.25, Fs5: 739.99, A5: 880, B5: 987.77, Cs6: 1108.73, E6: 1318.51, Fs6: 1479.98, A6: 1760, B6: 1975.53, Cs7: 2217.46, E7: 2637.02 };
  const vary = function (f, c) { return f * (1 + (Math.random() - 0.5) * (c || 0.02)); };
  // FM：载波 f，调制比 ratio，调制深度 index（随时间很快减弱，起音亮、尾音圆）
  function fm(f, dur, gain, delay, ratio, index, attack, dest) {
    const t0 = ac.currentTime + (delay || 0), c = ac.createOscillator(), m = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
    c.frequency.value = f; m.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t0); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.02), t0 + dur * 0.5);
    m.connect(mg); mg.connect(c.frequency);
    const a = attack || 0.003;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    c.connect(g); g.connect(dest || sfxBus);
    watchSource(c, [c, m, mg, g]);
    m.start(t0); c.start(t0); m.stop(t0 + dur + 0.02); c.stop(t0 + dur + 0.02);
  }
  const mallet = function (f, dur, gain, delay, dest) { fm(f, dur, gain, delay, 4, 0.8, 0.003, dest); };   // 软木槌
  const glass = function (f, dur, gain, delay, dest) { fm(f, dur, gain, delay, 3.53, 0.55, 0.004, dest); tone(f * 2, dur * 0.45, 'sine', gain * 0.18, delay, null, 0.004, dest); };   // 玻璃钟片：泛音略带金属感，尾音长
  const wood = function (f, dur, gain, delay, dest) { fm(f, dur, gain, delay, 1.5, 1.1, 0.003, dest); };   // 闷一些的木质声（出错、拆除）
  const tick = function (f, gain, delay, dest) { noise(0.014, 'bandpass', f, 1.4, gain, delay, null, dest); };   // 触感：极短的带通噪声
  const thump = function (f, gain, delay, dest) { tone(f, 0.13, 'sine', gain, delay, f * 0.45, 0.004, dest); };   // 低音落点
  const air = function (dur, f, f2, gain, delay) { noise(dur, 'bandpass', f, 1.1, gain, delay, f2); };   // 气流

  function achieveSfx(gold) {
    thump(120, 0.24); air(0.4, 380, 4200, 0.06);
    [N.A4, N.Cs5, N.E5, N.A5, N.Cs6].forEach(function (f, i) { mallet(f, 0.26, 0.06, 0.1 + i * 0.055); });
    [N.A5, N.Cs6, N.E6].forEach(function (f, i) { glass(f, 1.6, 0.05 - i * 0.008, 0.38 + i * 0.02); });
    [N.E7, 2959.96, 3520, 4434.92].forEach(function (f, i) { tone(f, 0.18, 'sine', 0.012, 0.5 + i * 0.07); });
    noise(0.7, 'highpass', 6000, 0.7, 0.024, 0.4);
    if (gold) {
      [N.A3, N.Cs4, N.E4, N.A4].forEach(function (f) { tone(f, 1.5, 'triangle', 0.02, 0.36, null, 0.05); tone(f * 1.003, 1.5, 'sine', 0.01, 0.36, null, 0.08); });
      glass(N.A6, 1.8, 0.04, 0.72);
    }
  }
  const SFX = {
    // 通用界面：很轻，每个按钮都会响
    click: function () { tick(vary(3000, 0.1), 0.05); mallet(vary(N.A6), 0.04, 0.012); },
    tap: function () { tick(vary(2400, 0.1), 0.05); },
    tab: function () { tick(vary(2200, 0.1), 0.035); mallet(vary(N.E6), 0.06, 0.02); },
    soft: function () { mallet(vary(N.A5, 0.012), 0.11, 0.05); },
    open: function () { air(0.16, 500, 2200, 0.03); mallet(N.E5, 0.14, 0.04); mallet(N.B5, 0.2, 0.038, 0.05); },
    close: function () { air(0.12, 1800, 500, 0.022); mallet(N.A5, 0.1, 0.03); mallet(N.E5, 0.14, 0.028, 0.05); },
    toggle: function () { tick(2800, 0.04); mallet(N.E6, 0.07, 0.032); mallet(N.A6, 0.08, 0.024, 0.045); },
    swoosh: function () { air(0.26, 600, 2400, 0.055); tick(2000, 0.02, 0.2); },
    // 两个 App：地铁芯像系统启动，地铁圈像手机气泡
    appOpen: function () { air(0.34, 420, 3400, 0.04); tone(N.A3, 0.42, 'sine', 0.03, 0, null, 0.06); [N.A4, N.E5, N.A5].forEach(function (f, i) { glass(f, 0.42 - i * 0.05, 0.034, 0.03 + i * 0.055); }); },
    appClose: function () { air(0.22, 2600, 480, 0.028); glass(N.E5, 0.2, 0.028); glass(N.A4, 0.26, 0.028, 0.07); },
    socialOpen: function () { tone(280, 0.1, 'sine', 0.07, 0, 720, 0.006); mallet(N.E5, 0.16, 0.05, 0.05); mallet(N.B5, 0.2, 0.045, 0.1); },
    socialClose: function () { tone(620, 0.1, 'sine', 0.045, 0, 240, 0.006); mallet(N.E5, 0.12, 0.03, 0.04); },
    like: function () { tone(520, 0.08, 'sine', 0.05, 0, 980, 0.004); mallet(N.Cs6, 0.14, 0.035, 0.05); },
    repost: function () { mallet(N.A5, 0.08, 0.035); mallet(N.E6, 0.12, 0.035, 0.06); },
    follow: function () { mallet(N.E5, 0.09, 0.04); mallet(N.A5, 0.09, 0.04, 0.06); mallet(N.Cs6, 0.16, 0.036, 0.12); },
    // 建设
    tool: function () { tick(2600, 0.03); mallet(N.Cs6, 0.07, 0.045); mallet(N.Fs6, 0.1, 0.036, 0.05); },
    place: function () { thump(vary(150, 0.05), 0.2); tick(1600, 0.05); mallet(vary(N.A4, 0.015), 0.18, 0.06); },
    lay: function () { tick(1400, 0.08); tick(1900, 0.06, 0.07); mallet(vary(N.E5, 0.015), 0.12, 0.05, 0.01); mallet(vary(N.B5, 0.015), 0.16, 0.045, 0.08); },
    demolish: function () { thump(95, 0.24); noise(0.36, 'lowpass', 1100, 0.6, 0.16, 0, 200); [0.06, 0.13, 0.21].forEach(function (d, i) { tick(900 - i * 200, 0.07, d); }); },
    build: function () {
      thump(120, 0.22); [0, 0.09].forEach(function (d) { noise(0.05, 'bandpass', 1500, 1.8, 0.09, d); });
      [N.A4, N.Cs5, N.E5].forEach(function (f, i) { mallet(f, 0.3, 0.06, 0.2 + i * 0.09); });
      glass(N.A5, 0.9, 0.065, 0.47); glass(N.E6, 0.9, 0.034, 0.5);
    },
    undo: function () { tick(2000, 0.03); mallet(N.Cs6, 0.06, 0.028); mallet(N.A5, 0.08, 0.028, 0.04); },
    redo: function () { tick(2000, 0.03); mallet(N.A5, 0.06, 0.028); mallet(N.Cs6, 0.08, 0.028, 0.04); },
    discard: function () { air(0.24, 1800, 340, 0.04); wood(N.E4, 0.16, 0.05); wood(N.A3, 0.22, 0.05, 0.08); },
    // 列车与线路运营
    trainBuy: function () { thump(110, 0.2); tick(1200, 0.08); tick(1600, 0.06, 0.1); tone(170, 0.5, 'triangle', 0.035, 0.02, 520, 0.1); tone(340, 0.5, 'sine', 0.012, 0.02, 1040, 0.1); glass(N.E6, 0.4, 0.034, 0.4); },
    trainMove: function () { [0, 0.11, 0.2].forEach(function (d, i) { tick(1500 + i * 150, 0.07, d); }); mallet(N.E5, 0.12, 0.034, 0.2); },
    trainSell: function () { tick(1500, 0.05); glass(N.B6, 0.12, 0.028); glass(N.E7, 0.28, 0.028, 0.06); wood(N.A3, 0.14, 0.03, 0.02); },
    speedUp: function () { tone(190, 0.32, 'triangle', 0.04, 0, 520, 0.05); tone(380, 0.32, 'sine', 0.012, 0, 1040, 0.05); mallet(N.E6, 0.12, 0.028, 0.24); },
    speedDown: function () { tone(480, 0.32, 'triangle', 0.035, 0, 180, 0.03); tone(960, 0.3, 'sine', 0.01, 0, 360, 0.03); mallet(N.A4, 0.14, 0.03, 0.24); },
    service: function () { [N.A5, N.Cs6, N.E6].forEach(function (f, i) { tick(2400, 0.025, i * 0.07); mallet(f, 0.12, 0.04, i * 0.07); }); },
    serviceDel: function () { [N.E6, N.Cs6, N.A5].forEach(function (f, i) { mallet(f, 0.1, 0.03, i * 0.06); }); },
    // 车站与经营
    develop: function () { tick(1800, 0.05); [N.E5, N.A5, N.Cs6].forEach(function (f, i) { mallet(f, 0.2, 0.05, i * 0.07); }); glass(N.B6, 0.16, 0.026, 0.22); glass(N.E7, 0.34, 0.026, 0.28); },
    decor: function () { [N.Cs6, N.E6, N.A6, N.Cs7].forEach(function (f, i) { glass(f, 0.26, 0.018, i * 0.045); }); noise(0.24, 'highpass', 6000, 0.7, 0.014, 0.04); },
    contract: function () { noise(0.06, 'highpass', 2600, 0.7, 0.05); thump(130, 0.22, 0.06); tick(900, 0.08, 0.06); mallet(N.A4, 0.2, 0.05, 0.1); glass(N.E5, 0.4, 0.034, 0.14); },
    coin: function () { glass(N.B6, 0.16, 0.03); glass(N.E7, 0.3, 0.028, 0.06); },
    // 地铁芯的提醒：有存在感但不刺耳；自动处理完成像一次数据写入
    opsAlert: function () { air(0.18, 700, 1500, 0.02); glass(N.E5, 0.34, 0.05); glass(N.Cs5, 0.46, 0.05, 0.15); },
    opsFix: function () { [0, 0.05, 0.1].forEach(function (d, i) { tick(2200 + i * 500, 0.04, d); }); mallet(N.A5, 0.14, 0.05, 0.15); glass(N.E6, 0.46, 0.046, 0.22); },
    // 反馈
    good: function () { glass(N.A5, 0.2, 0.05); glass(N.E6, 0.3, 0.05, 0.08); },
    error: function () { tick(700, 0.06); wood(N.E4, 0.13, 0.08); wood(N.Cs4, 0.2, 0.08, 0.1); },
    warn: function () { wood(N.A4, 0.13, 0.05); wood(N.A4, 0.17, 0.045, 0.15); },
    notify: function () { glass(N.B5, 0.24, 0.036); glass(N.E6, 0.34, 0.032, 0.09); },
    chime: function () { glass(N.E6, 0.44, 0.052); glass(N.A5, 0.66, 0.052, 0.15); },
    unlock: function () { [N.E5, N.A5, N.Cs6, N.E6].forEach(function (f, i) { glass(f, 0.36, 0.04, i * 0.07); }); },
    fanfare: function () { [N.A4, N.Cs5, N.E5, N.A5].forEach(function (f, i) { mallet(f, 0.24, 0.07, i * 0.09); }); glass(N.E6, 0.8, 0.054, 0.38); glass(N.A5, 0.8, 0.034, 0.4); },
    celebrate: function () {
      [N.A4, N.Cs5, N.E5, N.A5, N.Cs6].forEach(function (f, i) { mallet(f, 0.28, 0.06, i * 0.07); });
      noise(0.5, 'highpass', 5000, 0.7, 0.04, 0.32);
      glass(N.A6, 0.9, 0.044, 0.42); glass(N.E6, 0.9, 0.036, 0.5);
    },
    fail: function () { air(0.5, 900, 240, 0.03); [N.E4, N.Cs4, N.A3].forEach(function (f, i) { fm(f, 0.55, 0.06, i * 0.2, 1, 0.45, 0.02); }); },
    achieve: function () { achieveSfx(false); },
    achieveGold: function () { achieveSfx(true); },
    // 时间
    month: function () { glass(N.A6, 0.12, 0.012); },
    pause: function () { mallet(N.E5, 0.09, 0.04); mallet(N.A4, 0.13, 0.04, 0.06); },
    play: function () { mallet(N.A4, 0.09, 0.04); mallet(N.E5, 0.13, 0.04, 0.06); },
    whoosh: function () { air(0.55, 300, 3200, 0.085); tone(N.A2, 0.55, 'triangle', 0.04, 0, N.A3, 0.14); },
  };
  // 专门的操作音效响过后，同一次操作的提示（气泡的通用提示音）不再叠加
  const SPECIFIC = new Set(['build', 'demolish', 'discard', 'trainBuy', 'trainMove', 'trainSell', 'speedUp', 'speedDown', 'service', 'serviceDel', 'develop', 'decor', 'contract', 'opsFix', 'opsAlert']);
  const GENERIC = new Set(['good', 'notify', 'warn']);

  // 动态声音用的短音（列车总线或环境总线，可带声像）
  const CUE = {
    // 车门开启：柔和的两声钟片
    doorOpen: function (d) { glass(N.B5, 0.36, 0.036, 0, d); glass(N.A5 * 0.89, 0.5, 0.036, 0.22, d); },
    // 车门关闭：三声短促的提示音
    doorClose: function (d) { for (let k = 0; k < 3; k++) mallet(N.Fs6, 0.08, 0.026, k * 0.16, d); },
    // 进站制动：气动制动的嘶声
    brake: function (d) { noise(0.7, 'highpass', 3200, 0.8, 0.05, 0, 900, d); tone(1900, 0.5, 'sine', 0.008, 0.05, 1500, 0.05, d); },
    // 发车：变频电机加速的上扬音
    depart: function (d) { tone(140, 1.4, 'triangle', 0.022, 0, 420, 0.2, d); tone(280, 1.4, 'sine', 0.007, 0, 840, 0.25, d); tone(560, 1.1, 'sine', 0.003, 0.1, 1260, 0.3, d); },
    bird: function (d) { const n = 2 + ((Math.random() * 2) | 0), f = 2600 + Math.random() * 900; for (let k = 0; k < n; k++) tone(f, 0.07, 'sine', 0.02, k * 0.11, f * 1.45, 0.01, d); },
    insect: function (d) { for (let k = 0; k < 4; k++) tone(4400, 0.035, 'sine', 0.008, k * 0.06, null, 0.004, d); },
    horn: function (d) { tone(392, 0.24, 'triangle', 0.024, 0, null, 0.01, d); tone(494, 0.24, 'triangle', 0.018, 0, null, 0.01, d); },
    ship: function (d) { tone(98, 1.8, 'triangle', 0.04, 0, 96, 0.25, d); tone(147, 1.8, 'triangle', 0.024, 0, 145, 0.25, d); },
    bikeBell: function (d) { bell(2350, 0.18, 0.018, 0, d); bell(2350, 0.25, 0.016, 0.12, d); },
    // 分区环境短音（v2.2）：机场、车站、景区、居住区、商业区、办公区、工业区各自的典型声音，音量都很轻
    jetPass: function (d) { noise(7, 'lowpass', 260, 0.7, 0.05, 0, 900, d); noise(6, 'bandpass', 1800, 0.8, 0.012, 0.6, 3200, d); tone(210, 6, 'triangle', 0.008, 0.4, 150, 1.2, d); },   // 远处客机起飞的轰鸣
    paChime: function (d) { glass(N.A4, 0.5, 0.012, 0, d); glass(N.Cs5, 0.5, 0.011, 0.28, d); glass(N.E5, 0.8, 0.01, 0.56, d); },   // 广播提示音
    stationChime: function (d) { glass(N.A5, 0.5, 0.012, 0, d); glass(N.Fs5, 0.7, 0.011, 0.32, d); },
    trainHorn: function (d) { tone(311, 0.9, 'triangle', 0.012, 0, 305, 0.08, d); tone(392, 0.9, 'triangle', 0.01, 0, 386, 0.08, d); },   // 远处列车鸣笛
    templeBell: function (d) { bell(147, 3.2, 0.02, 0, d); tone(294.6, 2.2, 'sine', 0.006, 0, null, 0.01, d); },
    churchBell: function (d) { for (let k = 0; k < 3; k++) bell([392, 330, 262][k], 1.6, 0.012, k * 0.55, d); },
    dog: function (d) { for (let k = 0; k < 2; k++) { tone(520, 0.11, 'triangle', 0.008, k * 0.26, 300, 0.01, d); noise(0.1, 'bandpass', 900, 1.5, 0.008, k * 0.26, null, d); } },
    shopChime: function (d) { glass(N.A6 * 0.89, 0.3, 0.008, 0, d); glass(N.E6, 0.4, 0.007, 0.14, d); },
    carPass: function (d) { noise(1.6, 'bandpass', 380, 0.8, 0.02, 0, 1200, d); noise(1.2, 'bandpass', 1200, 0.8, 0.012, 0.6, 360, d); },
    scooter: function (d) { tone(150, 1.3, 'triangle', 0.008, 0, 240, 0.15, d); noise(1.2, 'bandpass', 700, 1.2, 0.006, 0, 1100, d); },
    clank: function (d) { [410, 1130, 2170].forEach(function (f, i) { tone(f, 0.35 - i * 0.08, 'sine', 0.01 / (i + 1), 0, null, 0.002, d); }); noise(0.06, 'highpass', 2500, 0.8, 0.012, 0, null, d); },
    reverseBeep: function (d) { for (let k = 0; k < 3; k++) tone(1050, 0.22, 'sine', 0.006, k * 0.5, null, 0.01, d); },
  };

  const Sound = {
    get enabled() { return pref.enabled; },
    // 开场动画音效：返回 { stop() }；不能发声（关闭声音、浏览器尚未允许自动播放）时返回 null
    get volume() { return pref.volume; },
    play: function (name) {
      if (!pref.enabled || !SFX[name]) return;
      const a = ensure(); if (!a || a.state !== 'running' && a.state !== 'suspended') return;
      const now = performance.now();
      if (last[name] && now - last[name] < 45) return;
      if (name === 'click' && last._any && now - last._any < 25) return;
      if (GENERIC.has(name) && last._specific && now - last._specific < 160) return;
      if (SPECIFIC.has(name)) last._specific = now;
      last[name] = now; last._any = now;
      try { SFX[name](); } catch (e) { /* 忽略音频错误 */ }
    },
    // 动态声音：只在音频已解锁并运行时可用（不在这里创建音频环境）
    ctx: function () { return pref.enabled && ac && ac.state === 'running' ? ac : null; },
    bus: function (name) { return name === 'train' ? trainBus : (name === 'amb' ? ambBus : sfxBus); },
    noiseBuffer: function () { return noiseBuf; },
    cue: function (name, bus, pan, onEnded) {
      if (!pref.enabled || !CUE[name] || !ac || ac.state !== 'running') return false;
      const dest = bus === 'amb' ? ambBus : trainBus, out = outTo(dest, pan), output = ac.createGain();
      output.connect(out);
      const cue = { output: output, pan: out === dest ? null : out, sources: new Set(), onEnded: onEnded, done: false, stopping: false };
      cues.add(cue); buildingCue = cue;
      try { CUE[name](output); } catch (e) {
        for (const source of cue.sources) { try { source.stop(); } catch (e) {} }
        finishCue(cue); return false;
      } finally { buildingCue = null; }
      if (!cue.sources.size) finishCue(cue);
      return true;
    },
    stopCues: function (immediate) {
      if (!ac) return;
      const now = ac.currentTime;
      for (const cue of cues) {
        if (cue.stopping && !immediate) continue;
        cue.stopping = true;
        cue.output.gain.cancelScheduledValues(now);
        if (immediate) cue.output.gain.setValueAtTime(0, now);
        else { cue.output.gain.setValueAtTime(cue.output.gain.value, now); cue.output.gain.linearRampToValueAtTime(0, now + 0.025); }
        for (const source of cue.sources) { try { source.stop(now + (immediate ? 0 : 0.03)); } catch (e) {} }
        if (immediate) finishCue(cue);
      }
    },
    // 环境声的低通（地下视图时变闷）
    setAmbFilter: function (hz) { if (ambFilter) ambFilter.frequency.setTargetAtTime(hz, ac.currentTime, 0.2); },
    setEnabled: function (on) {
      pref.enabled = !!on;
      if (!on) Sound.stopCues();
      if (on) ensure();
      if (master) master.gain.setTargetAtTime(on ? pref.volume * 0.9 : 0, ac.currentTime, 0.05);
    },
    setVolume: function (v) { pref.volume = Math.max(0, Math.min(1, v)); if (master && pref.enabled) master.gain.value = pref.volume * 0.9; },
    setTrainVolume: function (v) { pref.trainVol = Math.max(0, Math.min(1, v)); if (trainBus) trainBus.gain.value = pref.trainVol; },
    setAmbVolume: function (v) { pref.ambVol = Math.max(0, Math.min(1, v)); if (ambBus) ambBus.gain.value = pref.ambVol; },
  };
  CM.Sound = Sound;
})(window.CM);
