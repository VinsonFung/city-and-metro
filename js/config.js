'use strict';
// 全局参数。PRD 中标注"待确认"的数值在此给出可调整的默认值（DEFAULT），评审确认后只需修改本文件。
(function (CM) {
  CM.CFG = {
    GAME_VERSION: '2.5.1',
    TRAFFIC_MODEL: 4,      // 轻量交通更新；与显示版本独立，确保 v3 存档仍触发安全迁移
    RULES_REVISION: 7,     // Web v2.5.1: fare and alignment fixes; protect original saves before upgrade.
    SAVE_FORMAT: 'city-metro-save',
    SAVE_VERSION: 2,
    SAVE_MIN_VERSION: 2,   // 1.1 起地图改为真实地理，旧版存档的城市数据与之不兼容

    // 地图：每格 250 m，120×144 格 ≈ 30 km × 36 km；交通小区 4×4 格（1 km²）
    W: 120, H: 144, CELL_M: 250, ZONE: 4,
    START: { y: 1990, m: 1, d: 1, minute: 6 * 60 },
    // 货币与价格基年（各地图在 maps.js 中替换）：内部金额单位为「万 + 本城货币」，票价为本城货币
    money: { code: 'CNY', unit: '元', wan: '万元', yi: '亿元', sym: '¥' },
    econBase: 1990,

    time: {
      secPerHour: 2.5,          // 1× 速度下，现实秒/游戏小时（一天 60 秒）
      speeds: [1, 3, 8, 24],    // 加速档位；24× 极速档约 13 分钟一个游戏年（含月结）
      visualPerSec: 24,         // 1× 下动态对象的"视觉时间"（游戏秒/现实秒），列车车辆按此运动
      visualMaxSpeed: 8,        // 列车、车辆与行人最多按 8× 表现：极速档只加快时钟，画面保持可看清
      nightFast: 4,             // 地铁停运的 00:00–06:00 时钟按所选速度的 4 倍掠过（设置「游戏」可关闭）
      peaks: [[420, 540], [1020, 1140]],   // 工作日早晚高峰（分钟）：开启「高峰慢放」时按 1× 运行
    },

    // 一天的出行时段（模型分时段计算）
    periods: [
      { key: 'AM', name: '早高峰', hours: [7, 8] },
      { key: 'MD', name: '日间平峰', hours: [6, 9, 10, 11, 12, 13, 14, 15, 16] },
      { key: 'PM', name: '晚高峰', hours: [17, 18] },
      { key: 'EV', name: '夜间', hours: [19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5] },
    ],
    // 小时出行分布（估算，归一化后使用）：工作日 / 周末（画面上车流、客流随时刻的变化）
    hourProfile: [0.3, 0.2, 0.1, 0.1, 0.2, 0.6, 2.5, 8.5, 9.5, 6.0, 5.0, 5.2, 5.0, 4.8, 4.9, 5.0, 5.6, 8.0, 9.0, 6.0, 4.2, 3.2, 2.0, 1.0],
    hourProfileWe: [0.4, 0.3, 0.15, 0.1, 0.15, 0.3, 0.9, 2.6, 4.4, 5.8, 6.6, 6.8, 6.6, 6.4, 6.5, 6.5, 6.4, 6.4, 6.0, 5.2, 4.2, 3.2, 2.2, 1.2],
    // 出行目的（v1.9 起）：hw 通勤、sc 上学、sh 购物与生活服务（含商务）、md 医疗、lz 旅游休闲、hb 交通枢纽接驳。
    // 工作日通勤出行率与非工作出行总量沿用 choice.workerRate / choice.hoRate；非工作出行按 choice.purposeShare 分为上学、购物、医疗、休闲。
    // 以下比例与倍数均为估算（参考城市居民出行调查的一般量级），不是某座城市的统计数据。
    trips: {
      keys: ['hw', 'sc', 'sh', 'md', 'lz', 'hb'],
      name: { hw: '通勤', sc: '上学', sh: '购物', md: '医疗', lz: '旅游休闲', hb: '枢纽接驳' },
      color: { hw: '#3468d6', sc: '#8e5bd6', sh: '#e8642c', md: '#d63a5a', lz: '#1aa266', hb: '#0f8fa8' },
      // 周末出行量相对工作日的倍数（双休日制度下）；周六仍上班、上课的年代按 workWeek 提高通勤与上学（见 sim.js weekendMult）
      weekend: { hw: 0.32, sc: 0.04, sh: 1.55, md: 0.55, lz: 2.1, hb: 1.12 },
      // 重要设施吸引比例的放大系数与各目的设施合计上限（v2.1 第二轮：设施出行需求偏少）
      facBoost: 1.25, facCap: 0.55,
      weekWeights: { wd: 5 / 7, we: 2 / 7 },   // 周平均：5 个工作日 + 2 个周末日
      // 各时段占该目的出行的比例 [AM, MD, PM, EV]：o 去程（家→目的地；枢纽为城市→车站/机场），r 返程
      split: {
        wd: {
          hw: { o: [0.70, 0.22, 0.03, 0.05], r: [0.02, 0.18, 0.62, 0.18] },
          sc: { o: [0.80, 0.17, 0.01, 0.02], r: [0.01, 0.45, 0.42, 0.12] },
          sh: { o: [0.05, 0.55, 0.15, 0.25], r: [0.02, 0.45, 0.20, 0.33] },
          md: { o: [0.25, 0.68, 0.04, 0.03], r: [0.04, 0.80, 0.10, 0.06] },
          lz: { o: [0.04, 0.50, 0.14, 0.32], r: [0.01, 0.36, 0.18, 0.45] },
          hb: { o: [0.16, 0.50, 0.12, 0.22], r: [0.12, 0.48, 0.14, 0.26] },
        },
        we: {
          hw: { o: [0.45, 0.38, 0.05, 0.12], r: [0.02, 0.30, 0.45, 0.23] },
          sc: { o: [0.80, 0.17, 0.01, 0.02], r: [0.01, 0.45, 0.42, 0.12] },
          sh: { o: [0.02, 0.68, 0.10, 0.20], r: [0.01, 0.50, 0.17, 0.32] },
          md: { o: [0.15, 0.78, 0.04, 0.03], r: [0.03, 0.82, 0.10, 0.05] },
          lz: { o: [0.03, 0.62, 0.10, 0.25], r: [0.01, 0.40, 0.17, 0.42] },
          hb: { o: [0.16, 0.50, 0.12, 0.22], r: [0.12, 0.48, 0.14, 0.26] },
        },
      },
      // 距离衰减：上学、购物、医疗、休闲相对 distDecayHO，枢纽接驳相对 distDecayHW
      decay: { sc: 0.55, sh: 1, md: 1.2, lz: 1.5, hub: 1.6 },
      // 地铁改善可达性带来的新增出行（只用于购物与休闲）：每节省 1 分钟广义出行时间增加 perMin，单个起讫点上限 cap；
      // 通勤、上学、医疗与枢纽接驳不产生新增出行（机场与铁路旅客量由外部给定）
      induced: { perMin: 0.006, cap: { sh: 0.10, lz: 0.15 } },
    },

    // 工作周制度（按地图替换）：sat 为周六仍需上班的比例，school 为周六仍需上课的比例（0–1）。
    // 中国内地：1994 年 3 月起隔周双休、1995 年 5 月起全面双休（史实）；比例为估算
    workWeek: { sat: [[1990, 1], [1994.1, 1], [1994.2, 0.5], [1995.3, 0.5], [1995.4, 0]], school: [[1990, 1], [1995.3, 1], [1995.4, 0]] },

    walk: {
      mPerMin: 75,              // 步行速度
      maxAccessM: 1125,         // 进出站最大步行距离（15 分钟）DEFAULT
      transferMaxM: 500,        // 站外换乘最大步行距离 DEFAULT
      cellExtraM: 60,           // 街道到建筑的平均附加距离
    },

    metro: {
      vmax: { underground: 22, surface: 19, elevated: 22 },  // m/s
      accel: 0.9, dwell: 30, turnaround: 150,
      latAccel: 0.8,            // 弯道横向加速度上限 → 弯道限速
      carCap: 310,              // 每节车厢定员
      carsBySize: { S: 4, M: 6, L: 8 }, // 列车编组受沿线最小站台限制
      fMin: [8, 6, 8, 4],       // 各时段最低发车频率（列/小时）DEFAULT
      fMax: 30,                 // 最小间隔 2 分钟
      targetLF: 0.85,
      stationCap: { S: 15000, M: 35000, L: 70000 }, // 车站每小时进出站+换乘能力 DEFAULT
      minSpacingM: 100,         // 独立车站最小间距；站外换乘仍按实际步行路径上限判断
      // 线形约束（参考城市轨道交通设计规范的量级，DEFAULT）
      minRadiusM: 250,          // 正线最小曲线半径：低于此值不允许
      warnRadiusM: 400,         // 低于此值需限速通过
      speedGrades: [
        { kmh: 40, minR: 100, warnR: 150, ops: 0.85, track: 0 },
        { kmh: 60, minR: 150, warnR: 250, ops: 0.92, track: 0 },
        { kmh: 80, minR: 250, warnR: 400, ops: 1, track: 0 },
        { kmh: 100, minR: 400, warnR: 650, ops: 1.12, track: 0.15 },
        { kmh: 120, minR: 600, warnR: 1000, ops: 1.25, track: 0.3 },
      ],
      maxTurnAtStationDeg: 60,  // 车站前后线路方向最大偏转（站台为直线段）
      maxTurnArcDeg: 120,       // 圆弧线形（v2.6.1）的上限：弯道都在站台之外，能否通过由半径决定
      platformHalfM: 70,        // 站台直线段半长
      maxGrade: 0.03,           // 最大坡度（地下/地面/高架转换坡道）
      levelM: { underground: -15, surface: 0, elevated: 12 }, // 轨面高程（米）
      levelFactor: 0.6,         // 天地换乘：同站增设另一层站台按该建设方式车站造价的 60% 计（共用站厅与出入口）DEFAULT
      levelXferMin: 1.5,        // 天地换乘：进出非主站台层多走的垂直通道时间（分钟，上下车各计一次）DEFAULT
      sizeName: { S: '小型', M: '中型', L: '大型' },
      typeName: { underground: '地下', surface: '地面', elevated: '高架' },
      height: { underground: -0.11, surface: 0.0, elevated: 0.075 }, // 视觉高度（格）
    },

    // 建设成本（万元，1990 年价格，按年上涨）DEFAULT
    cost: {
      trackPerKm: { underground: 30000, surface: 6000, elevated: 12000 },
      riverPerKm: { underground: 22000, surface: 16000, elevated: 16000 }, // 越江隧道 / 跨江桥梁 附加
      hillPerKm: 12000,         // 山体隧道附加
      envTrack: 0.35, envStation: 0.5, // 景区轨道 / 车站的环境保护附加费
      protectedPerKm: 6000,     // 保护建筑下方隧道加固附加
      // 跨越地面铁路（每处）：按本城单价折算的等效长度（km）。地下线下穿需加固与监测，高架线需上跨铁路的大跨度桥
      railCrossKm: { underground: 0.25, elevated: 0.35 },
      station: {
        underground: { S: 15000, M: 25000, L: 40000 },
        elevated: { S: 8000, M: 13000, L: 20000 },
        surface: { S: 5000, M: 8000, L: 12000 },
      },
      upgradeFactor: 1.2,
      demolishPerCell: 30000,   // 拆迁一个完全开发街区的费用（按开发强度折算）
      demolishFactor: {
        track: { underground: 0, surface: 0.7, elevated: 0.18 },
        station: { underground: 0.25, surface: 0.8, elevated: 0.6 },
      },
      freeMoveM: 250,           // 车站移动不超过此距离免费 DEFAULT
      freeLengthM: 300,         // 线形调整导致增长不超过此值免费 DEFAULT
      relocationFactor: 0.5,    // 大范围搬迁按新站造价比例收费
      inflation: 0.035,
    },

    ops: {
      carKmCost: 0.0009,        // 万元/车厢公里（≈9 元）
      stationDaily: { S: 1.5, M: 2.6, L: 4.5 }, // 万元/天
      serviceHours: 18,
      inflation: 0.04,
    },

    // 开局票价（元/次，换乘不另收费）：统一票价，或按里程计费时的起步价；滑块范围与步长 DEFAULT
    fareDefault: { mode: 'flat', flat: 2 },
    // 按里程计费的默认参数（新开局）：起步价含 km0 公里，之后每 step 公里加价 inc（起步价的倍数），封顶 cap（起步价的倍数）
    fareDist: { km0: 6, step: 6, inc: 0.5, cap: 2.5 },
    // scale：滑块上限与步长随物价放大（v2.6.1 起各图都有，否则票价跟不上物价）
    fareRange: { min: 0, max: 10, step: 0.1, scale: true },

    choice: {
      theta: 0.065,             // Logit 灵敏度（1/分钟）
      // 票价敏感度（v2.6.1，见 Model.fareMinutes）：票价与「物价参考票价」之比每翻一倍约多 fareSens × 0.69 分钟；超过参考票价后再加 fareOver × ln²，越贵越难接受
      fareSens: 10.8, fareOver: 25,
      walkW: 1.6, waitW: 1.5,
      transferPen: 4, outTransferPen: 6,
      carAccess: 4,             // 停车与取车附加分钟
      // 以下为估算曲线：[年份, 值]
      vot: [[1990, 2.5], [1995, 5], [2000, 9], [2005, 14], [2010, 22], [2015, 32], [2020, 42], [2030, 58], [2050, 80]], // 元/小时
      carCostPerKm: [[1990, 0.40], [2000, 0.60], [2010, 0.85], [2020, 1.0], [2050, 1.2]],
      parking: [[1990, 0.5], [2000, 2], [2010, 6], [2020, 9], [2050, 12]],
      occupancy: [[1990, 3.4], [1995, 2.8], [2000, 2.3], [2005, 1.9], [2010, 1.6], [2020, 1.45], [2050, 1.4]],
      hoRate: [[1990, 0.16], [2000, 0.26], [2010, 0.38], [2020, 0.45], [2050, 0.5]],
      workerRate: [[1990, 0.36], [2000, 0.40], [2010, 0.43], [2050, 0.45]],
      distDecayHW: [[1990, 4.5], [2000, 6], [2010, 8], [2030, 9.5]], // km
      distDecayHO: [[1990, 2.8], [2010, 4], [2030, 5]],
      // 非工作出行中上学、医疗、休闲所占比例（其余为购物与生活服务）：少子化使上学比例下降，老龄化使就医比例上升（估算）
      purposeShare: {
        sc: [[1990, 0.30], [2000, 0.26], [2010, 0.21], [2020, 0.19], [2050, 0.16]],
        md: [[1990, 0.06], [2010, 0.07], [2030, 0.09], [2050, 0.10]],
        lz: [[1990, 0.24], [2010, 0.33], [2030, 0.36], [2050, 0.37]],
      },
    },

    road: {
      // 等级：1 支路 2 次干道 3 主干道 4 快速路
      cap: [0, 0, 1700, 3200, 5600],  // 单向小时通行能力（车/小时）
      speed: [0, 15, 28, 38, 65],     // 自由流速度 km/h
      bprA: 0.15, bprB: 4,
      // 系统道路改造（拓宽、信号优化、立交）带来的通行能力增长系数（估算）
      capGrowth: [[1990, 1.0], [1995, 1.25], [2000, 1.6], [2005, 2.0], [2010, 2.4], [2020, 2.9], [2040, 3.3]],
    },

    economy: {
      startFunds: 300000,       // 经营挑战初始资金 30 亿元 DEFAULT
      grantBase: [[1990, 15000], [2000, 32000], [2010, 70000], [2020, 110000], [2050, 180000]], // 万元/月
      debtLimit: -200000,       // 负债下限（随通胀调整）DEFAULT
      // 债券融资（仅经营挑战）：3 年期年利率按发行年份插值并在发行时固定，6 年期另加 term6；
      // 年度发行额度与总债务上限 = 当年基础月拨款 × 月数（随城市与年代变化）。城投债利率 = 地方债 + spread
      bonds: {
        local: { rate: [[1990, 0.085], [1996, 0.075], [2000, 0.045], [2008, 0.04], [2015, 0.035], [2020, 0.032], [2050, 0.03]], quotaMonths: 6, capMonths: 30 },
        ct: { spread: 0.02, quotaMonths: 4, capMonths: 18 },
        term6: 0.004,
      },
      negMonthsLimit: 24,       // 连续负余额月数上限 DEFAULT
      satFail: 25, satFailMonths: 12,
      startSat: 60,
      failGrantFactor: 0.85, failGrantMonths: 12, failSat: -6,
      failDynGrantFactor: 0.92, failDynMonths: 6, failDynSat: -3,   // 动态任务未完成（v2.3 平衡）：较历史任务轻
      grantModFloor: 0.7,   // 多项任务未完成叠加时拨款系数的下限（v2.3 由 0.6 提高）
    },

    growth: {
      // v2.1 地图扩大后包含番禺市桥、钟村、南村与白云嘉禾、均禾一带（估算：1990 年约增加 45 万人，2020 年约增加 140 万人）
      popCurve: [[1990, 3.28e6], [1995, 3.9e6], [2000, 4.85e6], [2005, 5.95e6], [2010, 7.3e6], [2015, 8.2e6], [2020, 9.1e6], [2030, 10.0e6], [2045, 10.8e6], [2070, 11.4e6], [2300, 11.9e6]],
      histEnd: 2020,            // 此后为模拟增长
      jobsRatio: [[1990, 0.50], [2000, 0.53], [2010, 0.56], [2030, 0.58]],
      metroBoostMax: 0.06,
    },

    // 地铁对城市的反作用（v2.3 玩家反馈，各地图通用，不随地图替换）
    // habit 出行习惯：车站开通后，周边居民的出行习惯在约 years 年内逐步转向地铁——对地铁的偏好最多相当于 asc 分钟；
    // 留下的非地铁出行里最多 carLite 改为步行、公交接驳等，不再开车上路。两端都在成熟车站周边时取满值，一端时取一半；
    // 随每月的交通求解一起更新，不额外计算
    habit: { years: 4, asc: 8, carLite: 0.15 },
    // metroLed 地铁带动发展：每座运营车站对半径 radius 格内产生吸引，强度 = base + 每多一条线 xfer + 客流（flowFull 人次/日取满）flow
    // + 车站商业开发 tod[等级]，开通后约 years 年形成。线网成熟度按地铁覆盖比例（cov0 起、cov1 满）：成熟度越高，车站吸引的权重
    // 越大（wMin → 1），历史阶段预设的片区增长权重越弱（flatten），车站周边可容纳的人口 / 岗位也提高（capR / capJ）。只重新分配增长，不改变全城总量
    metroLed: { radius: 4, years: 4, base: 0.3, xfer: 0.5, flow: 0.6, flowFull: 60000, tod: [0, 0.15, 0.4, 0.8], cov0: 0.08, cov1: 0.45, wMin: 0.25, res: 1.0, jobs: 1.8, flatten: 0.6, capR: 0.35, capJ: 0.9 },
    saves: { prefix: 'cm1.', maxManual: 12 },
    // 动态对象上限（代表性展示）：汽车、车站行人、街道行人、列车上下车乘客（每帧）；声音：列车声部与同时播放的环境短音
    perf: { solverInputMs: 1.5, solverBudgetMs: 5, solverBudgetMaxMs: 10, frameTargetMs: 13, jumpSliceMs: 10, jumpRenderMs: 250, chunkBudgetMs: 6, sharpBudgetMs: 8, movingBudgetMs: 3, prefetchMs: 2, warmBudgetMs: 10, cacheMaxPx: 24e6, maxCars: 320, maxPeds: 180, maxWalkers: 120, maxRiders: 120, trainVoices: 3, maxOneShots: 6 },
  };
})(window.CM);
