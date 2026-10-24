'use strict';
// 城市经济：地图范围 GDP（实际 / 名义）、经济周期、历史经济事件、地方财政与地铁拨款的传导、新发债券的利率报价。
// 计算口径：
//   · 低频：GDP 与宏观状态在每年 1 月结算上一年；事件按月检查；拨款仍按月发放（economy.js），只在 1 月按上一年财政结果调整一次。
//   · 地图范围：GDP = 每岗位生产率（开局年价格）× 地图内就业岗位 × 生产率趋势 × 交通效率 × 经济周期 × 事件冲击；名义 GDP = 实际 × 价格指数。
//   · 不重复计算：事件冲击与经济周期只以 GDP 水平系数计一次（就业随周期的波动在 GDP 中折回）；交通只影响生产率，
//     车站覆盖对人口的吸引仍由 city.js 原规则处理；冲击强度在发生时按城市结构、财政与交通状况计算一次并固定。
//   · 存档：只保存状态与接入后的年度记录；旧存档从当前状态接入，不补造过去的经济记录，也不改变已有资金与债务。
(function (CM) {
  const U = CM.U, CFG = CM.CFG;
  const clamp = U.clamp;

  // ======================== 事件库 ========================
  // 各类事件对产业结构的暴露权重（结构值见各城 struct，0–1）
  const EXPO = {
    oil: { ind: 0.5, trade: 0.3, tour: 0.2 },
    fin: { fin: 0.5, prop: 0.3, trade: 0.2 },
    trade: { trade: 0.7, ind: 0.3 },
    gfc: { trade: 0.5, fin: 0.3, ind: 0.2 },
    epi: { tour: 0.5, trade: 0.25, ind: 0.25 },
    quake: { ind: 0.5, tour: 0.5 },
    policy: { prop: 0.5, ind: 0.5 },
    boom: { trade: 0.4, fin: 0.3, prop: 0.3 },
    open: { trade: 0.8, ind: 0.2 },
    local: { tour: 0.6, trade: 0.4 },
  };
  const KIND_NAME = { oil: '能源冲击', fin: '金融冲击', trade: '外贸冲击', gfc: '全球金融危机', epi: '公共卫生事件', quake: '自然灾害', policy: '政策调控', boom: '景气上升', open: '对外开放', local: '本地冲击' };
  // lv：相对趋势的 GDP 水平变化（发生当年起逐年，参考暴露度 0.5 时的幅度），正值为利好；keep：最后一项长期保持
  const LIB = {
    korea1950: { kind: 'boom', scope: '国际', title: '朝鲜战争「特需景气」', desc: '军需订单带动工业生产与出口，战后复兴加速。', lv: [0.015, 0.035, 0.02, 0.005, 0] },
    jp1965: { kind: 'policy', scope: '全国', title: '奥运会后的经济萧条', desc: '奥运建设结束后投资回落，企业倒闭与证券业危机接连出现（「昭和 40 年不况」）。', lv: [0, -0.02, -0.01, 0] },
    nixon1971: { kind: 'trade', scope: '国际', title: '尼克松冲击', desc: '美元停止兑换黄金，日元升值，出口企业承压。', lv: [-0.004, -0.01, -0.004, 0] },
    hk1973: { kind: 'fin', scope: '本地', title: '香港股市大跌', desc: '1973 年股市泡沫破裂，恒生指数大幅下跌，投资与消费收缩。', lv: [-0.005, -0.01, 0] },
    oil1973: { kind: 'oil', scope: '国际', title: '第一次石油危机', desc: '油价数倍上涨，物价飞涨、工业生产与出口受挫。', lv: [-0.003, -0.035, -0.03, -0.01, 0] },
    oil1979: { kind: 'oil', scope: '国际', title: '第二次石油危机', desc: '伊朗革命后油价再度上涨，物价与利率走高。', lv: [-0.002, -0.01, -0.01, -0.004, 0] },
    hk1982: { kind: 'fin', scope: '本地', title: '前途谈判与港元危机', desc: '前途问题引发信心危机，港元大幅贬值，1983 年起实行联系汇率制度。', lv: [-0.01, -0.025, -0.01, 0] },
    plaza1985: { kind: 'trade', scope: '国际', title: '广场协议与日元升值', desc: '主要国家联合干预汇率，日元急升，出口产业进入「日元升值萧条」。', lv: [0, -0.015, -0.008, 0] },
    crash1987: { kind: 'fin', scope: '国际', title: '1987 年全球股灾', desc: '全球股市单日暴跌，金融市场一度停摆。', lv: [-0.004, -0.004, 0] },
    jpbubble1987: { kind: 'boom', scope: '全国', title: '泡沫景气', desc: '低利率下地价与股价飞涨，投资与消费过热。', lv: [0.004, 0.012, 0.022, 0.03, 0.028, 0.012, 0] },
    tw1990: { kind: 'fin', scope: '本地', title: '台股泡沫破裂', desc: '股市从万点高位崩跌，房地产降温，投资趋于保守。', lv: [-0.01, -0.012, -0.004, 0] },
    jpbust1991: { kind: 'fin', scope: '全国', title: '泡沫经济破裂', desc: '股价与地价持续下跌，银行坏账累积，经济进入长期低迷。', lv: [-0.004, -0.015, -0.025, -0.02, -0.01, -0.004, 0] },
    nanxun1992: { kind: 'boom', scope: '全国', title: '南方谈话与新一轮开放', desc: '改革开放全面提速，外资与民间投资大量涌入沿海城市。', lv: [0.015, 0.035, 0.03, 0.015, 0] },
    tight1993: { kind: 'policy', scope: '全国', title: '宏观调控与治理通胀', desc: '经济过热、物价飞涨，国家收紧信贷与投资，经济逐步「软着陆」。', lv: [0, -0.01, -0.025, -0.02, -0.01, 0] },
    asia1997: { kind: 'fin', scope: '国际', title: '亚洲金融危机', desc: '泰铢贬值引发区域货币与股市危机，资产价格下跌、出口与旅游需求萎缩。', lv: [-0.003, -0.035, -0.03, -0.015, -0.005, 0] },
    jpfin1997: { kind: 'fin', scope: '全国', title: '日本金融危机', desc: '大型证券公司与银行相继倒闭，信贷收缩，经济陷入衰退。', lv: [-0.002, -0.02, -0.015, -0.006, 0] },
    quake1999: { kind: 'quake', scope: '本地', title: '九二一大地震', desc: '台湾中部强震造成严重损失，供电与生产一度中断。', lv: [-0.004, -0.002, 0] },
    dotcom2001: { kind: 'trade', scope: '国际', title: '互联网泡沫破裂', desc: '全球科技股与电子产品需求急跌，出口导向的电子产业受冲击。', lv: [-0.012, -0.008, 0] },
    wto2001: { kind: 'open', scope: '全国', title: '加入世界贸易组织', desc: '关税下降、外资准入放宽，出口与制造业进入快速扩张期。', lv: [0, 0.006, 0.014, 0.02, 0.024, 0.025], keep: true },
    sars2003: { kind: 'epi', scope: '区域', title: '非典型肺炎（SARS）疫情', desc: '疫情期间旅游、零售与餐饮业受挫，疫情结束后较快恢复。', lv: [-0.012, 0.002, 0] },
    tight2004: { kind: 'policy', scope: '全国', title: '投资过热与宏观调控', desc: '收紧土地与信贷，部分行业投资放缓。', lv: [-0.003, -0.006, -0.002, 0] },
    gfc2008: { kind: 'gfc', scope: '国际', title: '全球金融危机', desc: '美国次贷危机演变为全球金融危机，国际贸易与资本流动骤降。', lv: [-0.005, -0.04, -0.015, -0.005, 0] },
    stim2008: { kind: 'policy', scope: '全国', title: '大规模经济刺激计划', desc: '基建投资与信贷扩张对冲外需下滑。', lv: [0, 0.02, 0.018, 0.008, 0] },
    quake2011: { kind: 'quake', scope: '全国', title: '东日本大地震', desc: '地震与海啸造成严重损失，供应链与电力供应中断。', lv: [-0.008, -0.002, 0] },
    cnstock2015: { kind: 'fin', scope: '全国', title: '股市异常波动', desc: '股市快速下跌，市场信心受挫。', lv: [-0.003, -0.004, 0] },
    g20_2016: { kind: 'boom', scope: '本地', title: 'G20 峰会与数字经济', desc: '国际会议带动城市建设，电子商务与数字经济加速发展。', lv: [0.002, 0.004, 0.003, 0] },
    trade2018: { kind: 'trade', scope: '国际', title: '中美贸易摩擦', desc: '加征关税影响出口与制造业投资预期。', lv: [-0.002, -0.008, -0.006, -0.003, 0] },
    hk2019: { kind: 'local', scope: '本地', title: '2019 年经济收缩', desc: '外部贸易摩擦叠加本地社会动荡，零售、旅游与投资受挫。', lv: [-0.035, -0.015, -0.005, 0] },
    covid2020: { kind: 'epi', scope: '国际', title: '新冠肺炎疫情', desc: '防疫措施与全球需求骤降冲击消费、旅游与生产，之后逐步恢复。', lv: [-0.04, -0.02, -0.01, 0] },
    uk1990: { kind: 'fin', scope: '全国', title: '1990 年英国经济衰退', desc: '高利率与楼市下滑使英国在 1990 年下半年进入衰退，失业率上升，此后数年增长低迷。', lv: [-0.01, -0.025, -0.02, -0.008, 0] },
    blackwed1992: { kind: 'fin', scope: '全国', title: '黑色星期三', desc: '英国退出欧洲汇率机制，英镑大幅贬值；出口与旅游业受益，但利率与资产价格剧烈波动。', lv: [-0.012, -0.02, -0.005, 0.005, 0] },
    brexit2016: { kind: 'policy', scope: '全国', title: '脱欧公投', desc: '公投结果带来长期不确定性，投资、金融与服务业前景承压，英镑贬值。', lv: [-0.004, -0.012, -0.008, -0.002, 0] },
  };
  Macro.LIB = LIB;

  // ======================== 国家 / 地区序列 ========================
  // infl：价格涨幅（模型参数，参考公开的居民消费价格统计取近似值，逐年；表内未列年份线性插值）
  // ref：实际 GDP 增速参考（全国 / 地区口径，非地图范围数据）。data 为逐年值；periods 为时期平均；points 为重点年份。均为近似值，仅作背景对照
  const SERIES = {
    cn: {
      infl: [[1990, 0.031], [1991, 0.034], [1992, 0.064], [1993, 0.147], [1994, 0.241], [1995, 0.171], [1996, 0.083], [1997, 0.028], [1998, -0.008], [1999, -0.014], [2000, 0.004], [2001, 0.007], [2002, -0.008], [2003, 0.012], [2004, 0.039], [2005, 0.018], [2006, 0.015], [2007, 0.048], [2008, 0.059], [2009, -0.007], [2010, 0.033], [2011, 0.054], [2012, 0.026], [2013, 0.026], [2014, 0.02], [2015, 0.014], [2016, 0.02], [2017, 0.016], [2018, 0.021], [2019, 0.029], [2020, 0.025]],
      ref: { label: '全国实际 GDP 增速', src: '国家统计局公布的年度增速（修订后数值，取一位小数）', data: [[1990, 0.039], [1991, 0.093], [1992, 0.142], [1993, 0.139], [1994, 0.13], [1995, 0.11], [1996, 0.099], [1997, 0.092], [1998, 0.078], [1999, 0.077], [2000, 0.085], [2001, 0.083], [2002, 0.091], [2003, 0.1], [2004, 0.101], [2005, 0.114], [2006, 0.127], [2007, 0.142], [2008, 0.097], [2009, 0.094], [2010, 0.106], [2011, 0.096], [2012, 0.079], [2013, 0.078], [2014, 0.074], [2015, 0.07], [2016, 0.068], [2017, 0.069], [2018, 0.067], [2019, 0.06], [2020, 0.022], [2021, 0.084], [2022, 0.03], [2023, 0.052], [2024, 0.05]] },
    },
    jp: {
      infl: [[1950, 0], [1951, 0.16], [1952, 0.05], [1953, 0.065], [1954, 0.06], [1955, -0.015], [1956, 0.003], [1957, 0.03], [1958, -0.004], [1959, 0.01], [1960, 0.036], [1961, 0.053], [1962, 0.068], [1963, 0.076], [1964, 0.039], [1965, 0.066], [1966, 0.051], [1967, 0.04], [1968, 0.053], [1969, 0.052], [1970, 0.077], [1971, 0.063], [1972, 0.049], [1973, 0.117], [1974, 0.232], [1975, 0.117], [1976, 0.094], [1977, 0.081], [1978, 0.038], [1979, 0.036], [1980, 0.08], [1981, 0.049], [1982, 0.027], [1983, 0.019], [1984, 0.022], [1985, 0.02], [1986, 0.006], [1987, 0.001], [1988, 0.007], [1989, 0.023], [1990, 0.031], [1991, 0.033], [1992, 0.016], [1993, 0.013], [1994, 0.007], [1995, -0.001], [1996, 0.001], [1997, 0.018], [1998, 0.006], [1999, -0.003], [2000, -0.007], [2001, -0.007], [2002, -0.009], [2003, -0.003], [2004, 0], [2005, -0.003], [2006, 0.003], [2007, 0], [2008, 0.014], [2009, -0.014], [2010, -0.007], [2011, -0.003], [2012, 0], [2013, 0.004], [2014, 0.027], [2015, 0.008], [2016, -0.001], [2017, 0.005], [2018, 0.01], [2019, 0.005], [2020, 0]],
      ref: { label: '日本实际 GDP 增速', src: '公开统计的时期平均与重点年份（近似值）', periods: [[1956, 1973, 0.091], [1975, 1990, 0.042], [1991, 2008, 0.01], [2010, 2019, 0.009]], points: [[1974, -0.012], [2009, -0.055], [2020, -0.042]] },
    },
    hk: {
      infl: [[1970, 0.07], [1971, 0.03], [1972, 0.06], [1973, 0.18], [1974, 0.14], [1975, 0.03], [1976, 0.03], [1977, 0.06], [1978, 0.06], [1979, 0.12], [1980, 0.15], [1981, 0.14], [1982, 0.11], [1983, 0.1], [1984, 0.085], [1985, 0.03], [1986, 0.03], [1987, 0.055], [1988, 0.075], [1989, 0.1], [1990, 0.1], [1991, 0.113], [1992, 0.096], [1993, 0.088], [1994, 0.088], [1995, 0.091], [1996, 0.063], [1997, 0.058], [1998, 0.028], [1999, -0.04], [2000, -0.038], [2001, -0.016], [2002, -0.03], [2003, -0.026], [2004, -0.004], [2005, 0.009], [2006, 0.02], [2007, 0.02], [2008, 0.043], [2009, 0.005], [2010, 0.024], [2011, 0.053], [2012, 0.041], [2013, 0.043], [2014, 0.044], [2015, 0.03], [2016, 0.024], [2017, 0.015], [2018, 0.024], [2019, 0.029], [2020, 0.003]],
      ref: { label: '香港本地生产总值实际增速', src: '公开统计的时期平均与重点年份（近似值）', periods: [[1970, 1979, 0.092], [1980, 1989, 0.072], [1990, 1997, 0.05], [1999, 2008, 0.044], [2010, 2018, 0.029]], points: [[1998, -0.059], [2009, -0.025], [2019, -0.017], [2020, -0.065]] },
    },
    tw: {
      infl: [[1990, 0.041], [1991, 0.036], [1992, 0.045], [1993, 0.029], [1994, 0.041], [1995, 0.037], [1996, 0.031], [1997, 0.009], [1998, 0.017], [1999, 0.002], [2000, 0.013], [2001, 0], [2002, -0.002], [2003, -0.003], [2004, 0.016], [2005, 0.023], [2006, 0.006], [2007, 0.018], [2008, 0.035], [2009, -0.009], [2010, 0.01], [2011, 0.014], [2012, 0.019], [2013, 0.008], [2014, 0.012], [2015, -0.003], [2016, 0.014], [2017, 0.006], [2018, 0.014], [2019, 0.006], [2020, -0.002]],
      ref: { label: '台湾地区实际 GDP 增速', src: '公开统计的时期平均与重点年份（近似值）', periods: [[1990, 1999, 0.066], [2002, 2007, 0.054], [2011, 2019, 0.028]], points: [[2001, -0.013], [2008, 0.008], [2009, -0.016], [2010, 0.1], [2020, 0.034]] },
    },
    uk: {
      infl: [[1990, 0.095], [1991, 0.059], [1992, 0.037], [1993, 0.016], [1994, 0.024], [1995, 0.035], [1996, 0.024], [1997, 0.031], [1998, 0.034], [1999, 0.015], [2000, 0.008], [2001, 0.018], [2002, 0.017], [2003, 0.014], [2004, 0.013], [2005, 0.021], [2006, 0.023], [2007, 0.023], [2008, 0.036], [2009, 0.022], [2010, 0.033], [2011, 0.045], [2012, 0.028], [2013, 0.026], [2014, 0.015], [2015, 0], [2016, 0.007], [2017, 0.027], [2018, 0.025], [2019, 0.018], [2020, 0.009]],
      ref: { label: '英国实际 GDP 增速', src: '公开统计的时期平均与重点年份（近似值）', periods: [[1993, 2007, 0.029], [2010, 2019, 0.019]], points: [[1991, -0.017], [1992, -0.001], [2008, -0.008], [2009, -0.042], [2020, -0.11]] },
    },
  };
  Macro.SERIES = SERIES;
  // 城市参数中的 infl / ref 可直接引用国家或地区序列（如 'cn'）
  function resolve(c) {
    if (c._res) return c;
    if (typeof c.infl === 'string') c.infl = (SERIES[c.infl] || SERIES.cn).infl;
    if (typeof c.ref === 'string') c.ref = (SERIES[c.ref] || {}).ref || null;
    c._res = true;
    return c;
  }

  // ======================== 参数 ========================
  // 当前地图的经济参数：各城在地图数据中配置（cfg.macro）；新增真实地图未配置时使用通用参数；教程等虚构地图为 null（不启用）
  function Macro() {}
  CM.Macro = Macro;
  const autoCache = {};
  Macro.config = function () {
    const c = CFG.macro;
    if (!c) return null;
    if (c === 'auto') return autoCache[CM.mapId] || (autoCache[CM.mapId] = resolve(genericCfg()));
    return resolve(c);
  };
  Macro.enabled = function () { return !!Macro.config(); };
  // 运营价格涨幅（数字或分段）转为逐年表
  function rateAt(rate, y) {
    if (typeof rate === 'number') return rate;
    let r = rate[0][1]; for (const s of rate) if (y >= s[0]) r = s[1];
    return r;
  }
  function genericCfg() {
    const y0 = CFG.START.y, gb = U.interp(CFG.economy.grantBase, y0);
    const evs = [];
    for (const e of [['oil1973', 1973, 10], ['oil1979', 1979, 1], ['gfc2008', 2008, 9], ['covid2020', 2020, 1]]) if (e[1] >= y0 && e[1] <= CFG.growth.histEnd) evs.push({ id: e[0], y: e[1], m: e[2], scale: 0.8 });
    const infl = []; for (let y = y0; y <= CFG.growth.histEnd; y += 5) infl.push([y, rateAt(CFG.ops.inflation, y)]);
    return {
      generic: true, area: '地图范围', region: (CM.curMap && CM.curMap().region) || '本地区',
      gdp0: gb * 12 / 0.05, revRatio: [[y0, 0.18]], revElastic: 1.4,
      prod: [[y0, 0.03], [y0 + 30, 0.018], [y0 + 70, 0.012]],
      infl: infl.length ? infl : [[y0, 0.02]], longRun: { infl: 0.02 },
      histEnd: CFG.growth.histEnd, struct: { trade: 0.5, fin: 0.5, ind: 0.5, tour: 0.5, prop: 0.5 },
      events: evs, ref: null,
      note: '本地图使用通用经济参数（估算），只包含全球性事件。',
    };
  }
  // 事件：城市列表引用事件库，并可覆盖日期、文字、幅度与强度系数
  function eventsOf(c) {
    if (c._ev) return c._ev;
    c._ev = (c.events || []).map(function (e) {
      const L = LIB[e.id] || {};
      return { id: e.id, y: e.y, m: e.m || 1, kind: e.kind || L.kind || 'trade', scope: e.scope || L.scope || '', title: e.title || L.title || e.id, desc: e.desc || L.desc || '', lv: e.lv || L.lv || [0], keep: e.keep != null ? e.keep : !!L.keep, scale: e.scale == null ? 1 : e.scale, tag: e.tag || '史实' };
    }).sort(function (a, b) { return U.ymIndex(a.y, a.m) - U.ymIndex(b.y, b.m); });
    return c._ev;
  }
  Macro.events = function () { const c = Macro.config(); return c ? eventsOf(c) : []; };

  // 生产率趋势指数（相对开局年）与价格指数（相对价格基年）
  function prodIdx(c, Y) {
    const y0 = CFG.START.y;
    if (Y <= y0) return 1;
    const P = c._pi || (c._pi = { y: y0, v: [1] });
    while (P.y < Y) { P.y++; P.v.push(P.v[P.v.length - 1] * (1 + U.interp(c.prod, P.y))); }
    return P.v[Y - y0];
  }
  function inflAt(st, c, Y) {
    if (Y <= c.histEnd) return U.interp(c.infl, Y);
    return ((c.longRun && c.longRun.infl) || 0.02) + 0.3 * (st.gaps[Y] || 0);
  }
  function priceIdx(st, c, Y) {
    const base = CFG.econBase || CFG.START.y;
    if (Y <= base) return 1;
    const key = Y + '|' + st.gv;
    if (st._pc && st._pc.k === key) return st._pc.v;
    let f = 1; for (let t = base + 1; t <= Y; t++) f *= 1 + inflAt(st, c, t);
    st._pc = { k: key, v: f };
    return f;
  }
  // 地图范围岗位的基准曲线（与城市发展的人口曲线一致）
  function jobsCurve(t) { return U.interp(CFG.growth.popCurve, t) * U.interp(CFG.growth.jobsRatio, t); }
  // 城市产业结构对某类事件的暴露度 → 强度系数（0.3–2）
  function structMult(c, kind) {
    const w = EXPO[kind] || EXPO.trade, s = c.struct || {};
    let a = 0, b = 0; for (const k in w) { a += w[k] * (s[k] == null ? 0.5 : s[k]); b += w[k]; }
    return clamp((b ? a / b : 0.5) / 0.5, 0.3, 2);
  }
  function lvAt(f, ev, Y) {
    const k = Y - ev.y; if (k < 0) return 0;
    const lv = ev.lv;
    const v = k < lv.length ? lv[k] : (ev.keep ? lv[lv.length - 1] : 0);
    return v * f.k;
  }
  function shockLvl(st, c, Y) {
    let p = 1;
    for (const ev of allEvents(st, c)) { const f = st.fired[ev.id]; if (f) p *= 1 + lvAt(f, ev, Y); }
    return p;
  }
  // 当前年份已发生事件造成的偏离：(1 + 周期) × 冲击水平 − 1
  function devOf(st, c, Y) { return (1 + (st.gaps[Y] || 0)) * shockLvl(st, c, Y) - 1; }
  function allEvents(st, c) { return st.sim && st.sim.length ? eventsOf(c).concat(st.sim) : eventsOf(c); }

  // ======================== 交通效率 ========================
  // 采样：覆盖与分担率（可达性）、平均通勤、拥堵；相对接入时的基准换算为生产率系数（约 0.94–1.08）
  // 交通效率按工作日计算（通勤与工作出行的效率，v1.9 起显式取工作日结果，与此前的典型工作日口径一致）
  function teSample(g) {
    const d = g.model && (g.model.dailyWk || g.model.daily);
    if (!d || !d.ready || !(d.trips > 0)) return null;
    const acc = 0.55 * clamp((d.coverage || 0) / 0.6, 0, 1) + 0.45 * clamp((d.metroShare || 0) / 0.45, 0, 1);
    return { acc: acc, comm: d.commute || 0, cong: d.cong || 1, share: d.metroShare || 0 };
  }
  // 通勤与拥堵：变差全部计入（拥堵拖累经济，可以靠地铁缓解）；改善只按地铁承担的出行比例计入，
  // 避免没有地铁时道路自然扩容带来的改善被当作「交通对经济的贡献」
  function teParts(b, s) {
    if (!b || !s) return { acc: 0, comm: 0, cong: 0 };
    const ms = clamp(((s.share || 0) - (b.share || 0)) / 0.25, 0, 1);
    const cm = b.comm > 0 ? clamp((b.comm - s.comm) / b.comm, -0.4, 0.4) : 0;
    const cg = b.cong > 0 ? clamp((b.cong - s.cong) / b.cong, -0.3, 0.3) : 0;
    return {
      acc: 0.05 * (s.acc - b.acc),
      comm: 0.06 * (cm > 0 ? cm * ms : cm),
      cong: 0.08 * (cg > 0 ? cg * ms : cg),
    };
  }
  function teRatio(b, s) { const p = teParts(b, s); return clamp(1 + p.acc + p.comm + p.cong, 0.94, 1.08); }

  // ======================== 创建 / 接入 ========================
  function blankCur(y) { return { y: y, n: 0, jobs: 0, pop: 0, te: 0, nte: 0 }; }
  function baseState(g, origin) {
    const c = Macro.config();
    const y0 = CFG.START.y, base = CFG.econBase || y0;
    const st = {
      v: 1, map: g.mapId, origin: origin, since: [g.clock.y, g.clock.m],
      gaps: {}, gv: 0, fired: {}, sim: [], simYears: {}, rec: [], cur: blankCur(g.clock.y), last: g.clock.y - 1,
      teEff: 1, jf: 1, jfR: 1, fisc: null, teV: 2,
    };
    // 每岗位实际产出（按价格基年价格；开局年与价格基年不同时折算）
    st.K = c.gdp0 / (base < y0 ? priceIdx(st, c, y0) : 1) / Math.max(1, jobsCurve(y0));
    const tot = g.city.totals();
    st.jobsA = Math.max(1, tot.jobs);
    st.tA = g.clock.y + (g.clock.m - 1) / 12;
    st.te0 = teSample(g) || { acc: 0, comm: 0, cong: 1, share: 0 };
    st.gaps[g.clock.y] = 0;
    return st;
  }
  // 新游戏：开局即接入
  Macro.create = function (g) {
    if (!Macro.enabled()) return null;
    const st = baseState(g, 'new');
    st.fisc = { y: g.clock.y, f: 1, fRaw: 1, first: true };
    g.macro = st;
    const fired = fireDue(g, st, g.clock.y, g.clock.m, false);
    sample(g, st);
    syncEcon(g);
    return fired;
  };
  // 旧存档：从读档时点的城市状态接入；之前的历史事件只记为「接入前已发生」，不补造记录、不写入纪事
  Macro.attach = function (g, saved) {
    if (!Macro.enabled()) return null;
    if (saved && saved.v === 1 && saved.map === g.mapId) {
      const st = saved;
      st.gaps = st.gaps || {}; st.fired = st.fired || {}; st.sim = st.sim || []; st.simYears = st.simYears || {}; st.rec = st.rec || [];
      st.cur = st.cur || blankCur(g.clock.y); st.gv = (st.gv || 0) + 1;
      if (st.teEff == null) st.teEff = 1; if (st.jf == null) st.jf = 1; if (st.jfR == null) st.jfR = st.jf;
      if (!(st.K > 0) || !st.te0) throw new Error('经济数据不完整');
      g.macro = st;
      syncEcon(g);
      return st;
    }
    const st = baseState(g, 'legacy');
    st.fisc = { y: g.clock.y, f: 1, fRaw: 1, first: true };
    g.macro = st;
    fireDue(g, st, g.clock.y, g.clock.m, true);
    sample(g, st);
    syncEcon(g);
    return st;
  };
  // 交通模型升级（旧存档）：新模型的工作日指标与旧模型不完全相同。按升级前最后一次采样（旧口径）与升级后的采样之差平移基准，
  // 使交通效率系数在升级前后连续，之后的改善或恶化照常计入；没有旧采样时保持原基准
  Macro.rebaseTE = function (g) {
    const st = g.macro; if (!st || st.teV === 2) return false;
    const old = st.cur && st.cur.last, s = teSample(g);
    st.teV = 2;
    if (!old || !s || !st.te0) return false;
    const b = st.te0;
    st.te0 = { acc: b.acc + (s.acc - old.acc), comm: old.comm > 0 ? b.comm * s.comm / old.comm : b.comm, cong: old.cong > 0 ? b.cong * s.cong / old.cong : b.cong, share: b.share + (s.share - old.share) };
    st.cur.last = s;
    return true;
  };
  Macro.serialize = function (st) {
    if (!st) return null;
    const o = {}; for (const k in st) if (k[0] !== '_') o[k] = st[k];
    return o;
  };

  // ======================== 事件 ========================
  // 返回本月新发生（需要记入纪事）的事件；pre：旧存档接入前已发生，只计入状态
  function fireDue(g, st, y, m, legacyPre) {
    const c = Macro.config(), out = [], ym = U.ymIndex(y, m), since = U.ymIndex(st.since[0], st.since[1]);
    for (const ev of allEvents(st, c)) {
      if (st.fired[ev.id]) continue;
      const e = U.ymIndex(ev.y, ev.m);
      if (e > ym) continue;
      const pre = legacyPre && e < since;
      const f = severity(g, st, c, ev, pre);
      f.y = ev.y; f.m = ev.m; if (pre) f.pre = true;
      st.fired[ev.id] = f;
      if (!pre) out.push({ ev: ev, f: f });
    }
    if (out.length) st.gv++;
    return out;
  }
  // 影响程度：产业结构 × 本城强度 ×（负面事件）交通韧性与财政压力；发生时计算一次并固定
  function severity(g, st, c, ev, pre) {
    const sm = structMult(c, ev.kind);
    const neg = Math.min.apply(null, ev.lv) < 0;
    let resil = 0, stress = 0, dyn = 1;
    if (neg && !pre) {
      const s = teSample(g);
      resil = clamp((teRatio(st.te0, s) - 1) / 0.04, 0, 1);
      dyn *= 1 - 0.2 * resil;
      const E = g.econ;
      if (E && !E.isFree()) {
        const load = E.principalDebt() / Math.max(1, E.baseGrant(g.clock.y) * 12);
        stress = clamp(0.5 * clamp(load - 1, 0, 1) + (E.overdue > CM.Economy.MONEY_EPS ? 0.5 : 0) + (E.funds < 0 ? 0.2 : 0), 0, 1);
        dyn *= 1 + 0.25 * stress;
      }
    }
    return { k: sm * ev.scale * dyn, sm: sm, scale: ev.scale, resil: resil, stress: stress };
  }
  // 历史资料之后：按存档种子生成的模拟经济周期与偶发的模拟事件（结果确定，可复现）
  function rngFor(g, Y, salt) { return new U.RNG(((g.seed | 0) * 31 + Y * 7919 + (salt || 0) * 104729) >>> 0); }
  function gauss(r) { const a = Math.max(1e-9, r.next()), b = r.next(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); }
  function nextGap(g, st, c, Y) {
    const r = rngFor(g, Y, 1), g1 = st.gaps[Y - 1] || 0, g2 = st.gaps[Y - 2] || 0;
    if (Y <= c.histEnd) return clamp(0.4 * g1 + (r.next() - 0.5) * 0.008, -0.01, 0.01);
    return clamp(1.25 * g1 - 0.45 * g2 + gauss(r) * 0.011, -0.045, 0.035);
  }
  function scheduleSim(g, st, c, Y) {
    if (Y <= c.histEnd || st.simYears[Y]) return;
    st.simYears[Y] = 1;
    const r = rngFor(g, Y, 2), m = 1 + Math.floor(r.next() * 12);
    const lastRec = st.sim.filter(function (e) { return e.neg; }).reduce(function (a, e) { return Math.max(a, e.y); }, -99);
    const p = r.next();
    if (p < 0.07 && Y - lastRec >= 5) {
      const a = 0.015 + r.next() * 0.02, kinds = [['gfc', '模拟：全球需求放缓', '主要贸易伙伴经济放缓，出口订单与投资减少（模拟事件，非真实历史）。'], ['fin', '模拟：金融市场动荡', '资产价格回调、信贷收紧，企业投资趋于谨慎（模拟事件，非真实历史）。'], ['trade', '模拟：贸易环境转差', '贸易壁垒上升，外向型产业承压（模拟事件，非真实历史）。']];
      const k = kinds[Math.floor(r.next() * kinds.length)];
      st.sim.push({ id: 'sim' + Y, y: Y, m: m, kind: k[0], scope: '模拟', title: k[1], desc: k[2], lv: [-a * 0.3, -a, -a * 0.5, -a * 0.15, 0], keep: false, scale: 1, tag: '模拟', neg: true });
    } else if (p > 0.95) {
      const b = 0.01 + r.next() * 0.01;
      st.sim.push({ id: 'simb' + Y, y: Y, m: m, kind: 'boom', scope: '模拟', title: '模拟：新兴产业带动增长', desc: '新技术与新产业带动投资和就业（模拟事件，非真实历史）。', lv: [b * 0.3, b, b * 0.6, b * 0.2, 0], keep: false, scale: 1, tag: '模拟' });
    }
  }

  // ======================== 采样与年度结算 ========================
  function sample(g, st) {
    const y = g.clock.y;
    if (st.cur.y !== y) st.cur = blankCur(y);
    const tot = g.city.totals(), s = teSample(g);
    st.cur.n++;
    st.cur.jobs += tot.jobs / (st.jfR || 1);   // 折回已实现的周期调整，避免冲击在 GDP 中重复计入
    st.cur.pop += tot.pop;
    if (s) { st.cur.te += teRatio(st.te0, s); st.cur.nte++; st.cur.last = s; }
  }
  function settle(g, st, c, Yp) {
    const cur = st.cur.y === Yp && st.cur.n > 0 ? st.cur : null;
    const prev = st.rec.length ? st.rec[st.rec.length - 1] : null;
    let jobs, pop, te;
    if (cur) { jobs = cur.jobs / cur.n; pop = cur.pop / cur.n; te = cur.nte ? cur.te / cur.nte : null; }
    else { const tot = g.city.totals(); jobs = prev ? prev.jobs : tot.jobs / (st.jfR || 1); pop = prev ? prev.pop : tot.pop; te = null; }
    if (te != null) st.teEff = st.teEff + 0.6 * (te - st.teEff);
    const gap = st.gaps[Yp] || 0, shock = shockLvl(st, c, Yp), dev = (1 + gap) * shock - 1;
    const pi = prodIdx(c, Yp), price = priceIdx(st, c, Yp);
    const real = st.K * jobs * pi * st.teEff * (1 + gap) * shock;
    const nom = real * price;
    const rr = U.interp(c.revRatio, Yp), el = c.revElastic || 1.4;
    const rev = nom * rr * (1 + (el - 1) * dev);
    const jobsBase = st.jobsA * jobsCurve(Yp + 0.5) / Math.max(1, jobsCurve(st.tA));
    const baseRev = st.K * jobsBase * pi * price * rr;
    const rec = { y: Yp, n: cur ? cur.n : 0, part: !cur || cur.n < 12, real: real, nom: nom, price: price, infl: inflAt(st, c, Yp), gap: gap, shock: shock, te: st.teEff, jobs: jobs, pop: pop, rev: rev, baseRev: baseRev, fRaw: baseRev > 0 ? rev / baseRev : 1, pi: pi, sim: Yp > c.histEnd };
    rec.ev = allEvents(st, c).filter(function (ev) { const f = st.fired[ev.id]; return f && Math.abs(lvAt(f, ev, Yp)) > 1e-4; }).map(function (ev) { return ev.id; });
    if (prev && prev.y === Yp - 1) {
      rec.growth = real / prev.real - 1;
      rec.nomGrowth = nom / prev.nom - 1;
      rec.c = { jobs: jobs / prev.jobs - 1, prod: pi / prev.pi - 1, te: rec.te / prev.te - 1, cyc: (1 + gap) / (1 + prev.gap) - 1, shock: shock / prev.shock - 1 };
    }
    st.rec.push(rec);
    if (st.rec.length > 400) st.rec.shift();
    st.last = Yp;
    st.cur = blankCur(Yp + 1);
    return rec;
  }
  // 年度预算：财力系数 = 上一年实际地方财政收入 ÷ 预期（平滑，0.7–1.3）
  function budget(st, Y) {
    const r = st.rec.length ? st.rec[st.rec.length - 1] : null;
    const pf = st.fisc ? st.fisc.f : 1;
    if (!r || r.y !== Y - 1) { st.fisc = { y: Y, f: pf, fRaw: pf, keep: true }; return; }
    const f = clamp(0.4 * pf + 0.6 * r.fRaw, 0.7, 1.3);
    st.fisc = { y: Y, f: f, fRaw: r.fRaw, rev: r.rev, from: r.y };
  }
  function syncEcon(g) {
    const st = g.macro; if (!st || !g.econ) return;
    g.econ.fisc = st.fisc ? { y: st.fisc.y, f: st.fisc.f } : null;
    g.econ.quoteFn = function (kind, y, term) { return Macro.quote(g, kind, y, term); };
  }
  Macro.sync = syncEcon;

  // 每月（monthGen 开头调用）：补结算到上一年、确定本年周期与预算、触发到期事件；返回需要记录的事件
  Macro.month = function (g, y, m) {
    const st = g.macro, c = Macro.config(); if (!st || !c) return [];
    if (st.last < y - 1) {
      for (let Yp = st.last + 1; Yp <= y - 1; Yp++) {
        settle(g, st, c, Yp);
        if (st.gaps[Yp + 1] == null) { st.gaps[Yp + 1] = nextGap(g, st, c, Yp + 1); st.gv++; }
        scheduleSim(g, st, c, Yp + 1);
        budget(st, Yp + 1);
      }
    }
    if (st.gaps[y] == null) { st.gaps[y] = nextGap(g, st, c, y); st.gv++; }
    if (!st.fisc || st.fisc.y < y) budget(st, y);
    syncEcon(g);
    return fireDue(g, st, y, m, false);
  };
  // 月度发展之后采样（与开局 / 接入时的采样口径一致）
  Macro.sample = function (g) { if (g.macro) sample(g, g.macro); };
  // 城市发展系数：经济偏离（周期 + 冲击，不含交通）影响人口增速、就业水平与商业发展（只读）
  Macro.cityFactors = function (g) {
    const st = g.macro, c = Macro.config(); if (!st || !c) return null;
    const dev = devOf(st, c, g.clock.y);
    return { dev: dev, popGrowth: clamp(1 + 3 * dev, 0.5, 1.3), jobs: clamp(1 + 0.6 * dev, 0.93, 1.04), com: clamp(1 + 4 * dev, 0.6, 1.4) };
  };
  // 每月城市发展时使用并记录当月的就业系数。城市的岗位每月只向目标靠近 12%（city.js），
  // 因此采样时折回的是「已经实现」的就业系数（同样按 12% 逐月跟随），避免冲突刚发生时把岗位高估
  Macro.applyFactors = function (g) {
    const f = Macro.cityFactors(g);
    if (f) { const st = g.macro; st.jf = f.jobs; st.jfR = (st.jfR == null ? 1 : st.jfR) + 0.12 * (f.jobs - (st.jfR == null ? 1 : st.jfR)); }
    return f;
  };

  // ======================== 融资利率报价 ========================
  // 新发行债券：基准利率（按城市与年代）+ 经济环境 + 财政状况（负债率、财力、逾期、资金）+ 城投债利差 + 期限溢价；已发行债券利率不变
  Macro.quote = function (g, kind, y, term) {
    const E = g.econ, B = E.bondCfg(); if (!B) return { rate: 0, parts: [] };
    const st = g.macro, c = Macro.config();
    const base = U.interp(B.local.rate, y);
    const parts = [{ k: 'base', label: '基准利率（' + y + ' 年市场水平）', v: base }];
    let env = 0, fis = 0;
    if (st && c) {
      const dev = devOf(st, c, y), prevDev = devOf(st, c, y - 1);
      const mom = (1 + dev) / (1 + prevDev) - 1;
      env = clamp(-dev * 0.08 - mom * 0.05, -0.0015, 0.012);
    }
    const load = E.principalDebt() / Math.max(1, E.baseGrant(y) * 12);
    let lf = load < 0.5 ? -0.001 : (load < 1.5 ? (load - 0.5) * 0.003 : 0.003 + Math.min(0.007, (load - 1.5) * 0.003));
    const fiscF = E.fisc ? E.fisc.f : 1;
    const ff = fiscF < 1 ? (1 - fiscF) * 0.01 : -(fiscF - 1) * 0.005;
    const od = E.overdue > CM.Economy.MONEY_EPS ? Math.min(0.012, 0.005 + 0.0005 * E.overdueMonths) : 0;
    const neg = E.funds < 0 ? 0.0015 : 0;
    fis = lf + ff + od + neg;
    const ctMul = kind === 'ct' ? 1.5 : 1;
    fis *= ctMul;
    if (st && c) parts.push({ k: 'env', label: '经济环境', v: env });
    parts.push({ k: 'fis', label: '财政状况' + (kind === 'ct' ? '（城投债 ×1.5）' : ''), v: fis, sub: { load: load, debt: lf, fiscF: ff, overdue: od, neg: neg } });
    let r = base + env + fis;
    if (kind === 'ct') { const sp = B.ct.rate ? U.interp(B.ct.rate, y) - base : (B.ct.spread || 0.015); parts.push({ k: 'ct', label: '城投债利差', v: sp }); r += sp; }
    if (term === 6) { const tp = B.term6 || 0.004; parts.push({ k: 'term', label: '6 年期期限溢价', v: tp }); r += tp; }
    return { rate: Math.max(0.002, r), parts: parts };
  };

  // ======================== 展示数据 ========================
  const ENV = [[0.02, '繁荣', 'good'], [0.005, '扩张', 'good'], [-0.005, '平稳', 'info'], [-0.02, '放缓', 'warn'], [-0.05, '衰退', 'bad'], [-1, '危机', 'bad']];
  function envOf(mom, dev) {
    if ((dev < -0.06 && mom < 0.02) || mom < -0.05) return { label: '危机', cls: 'bad' };
    // 冲击之后反弹、但仍低于趋势：复苏（不称为繁荣）
    if (mom >= 0.005 && dev < -0.015) return { label: '复苏', cls: 'good' };
    for (const e of ENV) if (mom >= e[0]) return { label: e[1], cls: e[2] };
    return { label: '危机', cls: 'bad' };
  }
  function trendLabel(t) { return t >= 0.08 ? '高速增长期' : (t >= 0.045 ? '较快增长期' : (t >= 0.02 ? '稳定增长期' : '低速增长期')); }
  // 本年预测：按截至目前的岗位与交通、已发生的事件与本年周期估算（不含尚未发生的事件）
  function forecast(g, st, c) {
    const Y = g.clock.y, cur = st.cur.y === Y && st.cur.n ? st.cur : null;
    const tot = g.city.totals();
    let jobs = cur ? cur.jobs / cur.n : tot.jobs / (st.jfR || 1);
    const remain = Math.max(0, 12 - (cur ? cur.n : 0)) / 12;
    jobs *= 1 + remain * 0.5 * (jobsCurve(Y + 1) / Math.max(1, jobsCurve(Y)) - 1);
    const te = cur && cur.nte ? cur.te / cur.nte : st.teEff;
    const teEff = st.teEff + 0.6 * (te - st.teEff);
    const gap = st.gaps[Y] || 0, shock = shockLvl(st, c, Y), pi = prodIdx(c, Y), price = priceIdx(st, c, Y);
    const real = st.K * jobs * pi * teEff * (1 + gap) * shock, nom = real * price;
    const last = st.rec.length ? st.rec[st.rec.length - 1] : null;
    return { y: Y, real: real, nom: nom, infl: inflAt(st, c, Y), growth: last && last.y === Y - 1 ? real / last.real - 1 : null, months: cur ? cur.n : 0, te: teEff, pi: pi, gap: gap, shock: shock, jobs: jobs, sim: Y > c.histEnd };
  }
  Macro.view = function (g) {
    const st = g.macro, c = Macro.config();
    if (!st || !c) return null;
    const Y = g.clock.y, last = st.rec.length ? st.rec[st.rec.length - 1] : null;
    const dev = devOf(st, c, Y), prevDev = devOf(st, c, Y - 1), mom = (1 + dev) / (1 + prevDev) - 1;
    const s = teSample(g), parts = teParts(st.te0, s);
    const trend = U.interp(c.prod, Y);
    const shocks = [];
    for (const ev of allEvents(st, c)) {
      const f = st.fired[ev.id]; if (!f) continue;
      const now = lvAt(f, ev, Y), next = lvAt(f, ev, Y + 1);
      if (Math.abs(now) < 5e-4 && Math.abs(next) < 5e-4 && !(ev.y === Y)) continue;
      shocks.push({ ev: ev, f: f, now: now, next: next });
    }
    const fc = forecast(g, st, c);
    return {
      cfg: c, st: st, last: last, fc: fc, dev: dev, mom: mom, env: envOf(mom, dev), trend: trend, trendLabel: trendLabel(trend),
      te: { now: s ? teRatio(st.te0, s) : st.teEff, eff: st.teEff, parts: parts, sample: s, base: st.te0 },
      shocks: shocks, fisc: st.fisc, sim: Y > c.histEnd, histEnd: c.histEnd, factors: Macro.cityFactors(g),
      upcoming: eventsOf(c).filter(function (ev) { return !st.fired[ev.id] && ev.y <= c.histEnd; }).length,
    };
  };
  Macro.kindName = function (k) { return KIND_NAME[k] || '经济事件'; };
  Macro.eventLevelText = function (f, ev, Y) { return lvAt(f, ev, Y); };
  // 参考：全国 / 地区的实际增速（公开统计的近似值），与地图范围的游戏数据分开展示
  Macro.refAt = function (c, Y) {
    const R = c && c.ref; if (!R) return null;
    if (R.data) { for (const p of R.data) if (p[0] === Y) return { v: p[1], kind: 'year' }; }
    if (R.points) { for (const p of R.points) if (p[0] === Y) return { v: p[1], kind: 'point' }; }
    if (R.periods) { for (const p of R.periods) if (Y >= p[0] && Y <= p[1]) return { v: p[2], kind: 'period', from: p[0], to: p[1] }; }
    return null;
  };
})(window.CM);
