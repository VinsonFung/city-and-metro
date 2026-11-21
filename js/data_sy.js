'use strict';
// 悉尼 · 2000 场景。地理来自 OpenStreetMap（geo_sy.js，现代数据），本文件补充 2000 年起的片区开放、人口就业中心、地标、设施、历史事件、本地任务、
// 背景交通线路（城铁与渡轮，按 OSM 线路关系整理）与澳元经营参数。坐标单位为格（250 m），用 ll(纬度, 经度) 换算。
// 真实性：铁路与渡轮线路、地标与事件的年份为史实参考；人口就业分布、增长曲线、物价、造价、票价、班次与速度为估算；片区范围按郊区边界划分。
(function (CM) {
  const G = CM.GEOS && CM.GEOS.sy; if (!G) return;
  const U = CM.U;
  const P = G.proj, ll = function (lat, lon) { return [+((lon - P.lon0) * P.kx).toFixed(2), +((P.lat0 - lat) * P.ky).toFixed(2)]; };
  const poly = function (pts) { return pts.map(function (p) { return ll(p[0], p[1]); }); };
  const at = function (lat, lon, o) { const p = ll(lat, lon); return Object.assign({ x: p[0], y: p[1] }, o); };
  const anchor = function (name, lat, lon, r) { const p = ll(lat, lon); return { name: name, x: p[0], y: p[1], r: r }; };

  // 澳大利亚消费物价年增长（参考公开统计的近似值；2000 年的上涨含商品服务税开征）
  const CPI = [[2000, 0.045], [2001, 0.044], [2002, 0.03], [2003, 0.028], [2004, 0.023], [2005, 0.027], [2006, 0.035], [2007, 0.023], [2008, 0.044], [2009, 0.018], [2010, 0.029], [2011, 0.033], [2012, 0.018], [2013, 0.025], [2014, 0.025], [2015, 0.015], [2016, 0.013], [2017, 0.019], [2018, 0.019], [2019, 0.016], [2020, 0.009]];

  // 背景交通线路（史实走向，班次与速度为估算）：由 OSM 线路关系整理，站名为简体中文译名；y0 / y1 为开通与停运年月
  const BG_LINES = [
    {id: 'sy_r_nsw', kind: 'rail', name: '北岸与西部线', color: '#e8a33d', speed: 42, head: 8, stops: [['霍恩斯比',98.67,7.52],['怀塔拉',101.02,10.81],['沃隆加',105.64,14.17],['沃拉威',107.36,17.26],['图拉穆拉',109.85,20.78],['平布尔',115.04,26.18],['戈登',119.49,31.34],['基拉拉',122.11,35.46],['林德菲尔德',124.85,39.85],['罗斯维尔',128,43.77],['查茨伍德',129.17,49.52],['阿塔蒙',130.96,54.75],['圣伦纳兹',134.03,60.76],['沃斯通克拉夫特',133.19,65.05],['韦弗顿',135.52,67.87],['北悉尼',139.16,68.94],['米尔森角',140.63,71.24],['温亚德',138.31,80.1],['市政厅',138.67,83.6],['中央',138.54,88.24],['雷德芬',135.54,91.5],['斯特拉斯菲尔德',96.87,82.21],['利德科姆',78.61,78.8],['奥本',74.14,72.28],['克莱德',68.66,66.72],['格兰维尔',66.49,65.19],['哈里斯公园',65.03,60.65],['帕拉马塔',63.86,58.26],['韦斯特米德',57.56,54.38],['温特沃斯维尔',51.8,53.76],['彭德尔山',45.82,51.11],['通加比',44.11,44.74]], path: 'uiKa]PsAMo@}DcEuB_BmLuG}CuCoAsB}CyHoAwBqRwXsBaB}CgAcAk@e@o@qBkFo@k@qBs@u@m@kWee@e@uAYmCe@qAqAwAiFsCmAwAc@gAc@yBGiSMeDQgA}@qBkAqAiGcDs@i@q@aAc@{AGkDo@aI_AqFNq@V_@`Bm@`@]Po@Gs@]e@a@QmBAs@][w@D_BKu@Sk@m@q@}Ag@mJsAgA}@w@cB{@wDB_B`HuPp@eDi@aLg@aBCuALmDQg@{@_AUq@`@sEVaAjAkBlDyChC{DlB}AxBaAxFuAdF_B`D]bFL`AZrBlAlC~@pATnBCpDWtEv@`EYlDVnOnE|FV~AVzNpExG`E`FdEbElA`Ef@fAb@z@r@pBfClD`DnFxCjHpBdCR`EYdB@|Gz@fBF~CA`De@lKHtALvAf@bAl@z@dAdKjSnLtN~BxBxFbEdEbCpCbCj@rAj@rC@nBYfC@~AZlAx@jAzAz@jF~@nAb@nAbAnAzBr@v@nBhAhCz@|AZrAFtG]bCPhCp@tGpCtHjAbCdAr@l@n@dAt@xAj@hBlAjP'},
    {id: 'sy_r_nth', kind: 'rail', name: '北部线', color: '#d1453b', speed: 42, head: 12, stops: [['戈登',119.49,31.31],['基拉拉',122.11,35.46],['林德菲尔德',124.85,39.85],['罗斯维尔',128,43.77],['查茨伍德',129.17,49.52],['阿塔蒙',130.96,54.75],['圣伦纳兹',134.03,60.76],['沃斯通克拉夫特',133.19,65.05],['韦弗顿',135.52,67.87],['北悉尼',139.16,68.94],['米尔森角',140.63,71.24],['温亚德',138.31,80.1],['市政厅',138.67,83.6],['中央',138.54,88.24],['雷德芬',135.54,91.5],['伯伍德',100.72,84.9],['斯特拉斯菲尔德',96.84,82.35],['北斯特拉斯菲尔德',94.71,76.7],['西康科德',93.84,72.11],['罗兹',94.43,64.04],['梅多班克',95.51,57.65],['西赖德',95.55,53.74],['德尼斯顿',94.37,50.5],['伊斯特伍德',92.63,45.85],['埃平',92.33,37.92],['切尔滕纳姆',91.26,30.97],['比克罗夫特',86.74,28.21],['彭南特山',89.11,22.94],['索恩利',91.31,20.1],['诺曼赫斯特',98.37,15.21],['霍恩斯比',98.59,7.51]], path: '}|Mg|B{S}_@_@iAYmCe@qAqAwAsFyCq@y@u@_Bc@kCGwRMeDQgA}@qBkAqAiGcDs@i@q@aAc@{AGkDo@aI_AqFNq@V_@`Bm@`@]Pu@Ks@Y_@a@QmBAs@][w@D_BKu@Wo@o@q@wAc@uIiA}@c@q@y@g@mA}@aE@_ANu@tGuOn@_Dg@gLg@aBCuALmDQg@aAiAOo@H}An@oD|AaCzCcChC{DlB}AxBaArFwAnCaA`Ey@xCCfCLnAb@dBdAlC~@nATnBC~CYfFv@`EYzBLvEfAlIjCnAPpEN~AV~OfFzCdBpGnFlAn@bDt@tDh@x@X|@l@lB`CzAdAvBjCdDdQfAxHj@dHL~FEfE[bGaEvb@AnBRxG}@jEC`ALhAn@jAfDrBnAxAdBbIDxCyAfSTbCrAxCX~BGhB{@lD@~A`BxIh@dAj@h@v@d@dAXpJ~@v@Z^`@ZxAc@dC?t@|@`CFn@Kz@Wf@a@^cBj@k@d@mW`^eAl@oAZcEBqAR{Ar@_AfAm@fBGrBRtArAdDVnC}@`I'},
    {id: 'sy_r_iw', kind: 'rail', name: '内西线（经摄政公园）', color: '#d77ec2', speed: 36, head: 12, stops: [['博物馆',139.94,84.1],['圣詹姆斯',140.5,81.81],['环形码头',139.83,77.86],['温亚德',138.38,80.19],['市政厅',138.73,83.56],['中央',138.58,88.27],['雷德芬',135.58,91.55],['麦克唐纳镇',130.96,93.68],['纽敦',128.48,94.13],['斯坦莫尔',122.56,92.7],['彼得舍姆',119.3,92.42],['刘易舍姆',116.42,91.97],['萨默山',113.5,90.75],['阿什菲尔德',108.37,89.47],['克罗伊登',104.69,87.48],['伯伍德',100.7,84.98],['斯特拉斯菲尔德',96.79,82.39],['霍姆布什',94.14,80.41],['弗莱明顿',87.7,79.4],['利德科姆',78.7,78.92],['贝拉拉',73.89,82.75],['摄政公园',70.99,87.74],['塞夫顿',66.06,88.45],['切斯特山',61.97,87.76],['莱顿菲尔德',56.32,86.78],['维拉伍德',53.01,86.62],['卡拉马',47.69,88.19]], path: 'wnPmoI{@fEg@nHUd@qAnAOjATl@n@`@rG^fAe@ZmAYuDGiDe@eBEiBPoCQk@cAgAOo@`@qEd@yAv@sAxDeD|CoEfBmAdBs@rFwAbDkAxCk@dCMbEXdDbBhEpArABlE]xEt@bFYbCRxOrEnH`@vHpB`GpBxDpB`ItGpAd@pHnAx@X~@n@~ArBhBjAhArAtEzCvCpAbEdAtAPxH[hBJjEr@hCHfCCvDe@pJHlBTtCdAv@@j@M`BmAvEqJfD}BlDyDj@cBd@oEp@aBfBaBfBg@vBAnr@xGrCLlGYlQyD'},
    {id: 'sy_r_sth', kind: 'rail', name: '南线（经格兰维尔）', color: '#4f8fd6', speed: 40, head: 15, stops: [['坎利谷',41.45,89.21],['费尔菲尔德',46.6,82.54],['耶诺拉',51.7,79.21],['吉尔福德',56.54,74.58],['梅里兰兹',59.77,66.57],['格兰维尔',67.07,65.55],['克莱德',68.63,66.77],['奥本',74.51,72.75],['利德科姆',79.23,79.12],['弗莱明顿',88.27,79.49],['霍姆布什',94.39,80.45],['斯特拉斯菲尔德',97.26,82.74],['伯伍德',101.22,85.07],['克罗伊登',105.04,87.74],['阿什菲尔德',108.82,89.59],['萨默山',114.03,90.96],['刘易舍姆',116.94,92.15],['彼得舍姆',119.88,92.27],['斯坦莫尔',123.09,92.57],['纽敦',128.85,94.09],['麦克唐纳镇',131.37,93.47],['雷德芬',135.57,91.54],['中央',138.83,87.79],['市政厅',138.69,83],['温亚德',138.28,79.65],['环形码头',140.31,77.89],['圣詹姆斯',140.54,82.42],['博物馆',139.81,84.49]], path: 'ydDycJgOpUmApAk_@lT_CnBkAhB{JvSSrB\\tBBdAe@pBcL|KiAl@mBVkAE_Bg@yReNcCyB_MaOiKsS{@eAmAw@gA]aBMcKIyCb@oCBcCGcH_AaB@aEXwAGeASyEoAiBy@oJiHmBaCkAy@w@YqHoAqAe@sHkG_FgCuNkEuAQyFWmOqEyCWwEXkDq@kAGgD\\uA@oAUoC_AcBeAqAc@eFMqAFkDt@wFhBkCn@{CtAmAhAiCxDsDjDaAzAU|@a@tERp@z@`ARf@I~Fd@`B\\dJGh@Wf@_@Vi@JsG]q@a@Y}@PeAbBmBh@_JtAiE'},
    {id: 'sy_r_esi', kind: 'rail', name: '东郊与伊拉瓦拉线', color: '#1f6fb2', speed: 45, head: 8, stops: [['邦迪交汇',153.77,91.12],['埃奇克利夫',149.23,85.78],['国王十字',144.14,83.62],['马丁广场',140.11,80.79],['市政厅',138.72,83.58],['中央',138.71,88.51],['雷德芬',135.78,91.96],['锡德纳姆',123.64,101.7],['坦普',119.97,106.26],['沃利溪',118.78,107.89],['阿恩克利夫',116.62,111.54],['班克西亚',114.04,115.43],['罗克代尔',112.76,118.38],['科加拉',111.2,122.94],['卡尔顿',107.89,125.5],['阿拉瓦',104.14,125.94],['赫斯特维尔',99.81,124.86],['彭斯赫斯特',94.94,124.48],['莫特代尔',92.13,126.68],['奥特利',91.38,131.34]], path: 'afRmkJnB^nA`Ab@~ACbDJ|@Th@dCvC`Ad@pCd@xCbB|Fn@zEvBnBrAnBlDzAdAbATlBLnASh@i@Pi@n@_DViDd@yBOqA}A}BIwAPw@jBgDvBgC~CoCj@wAZaCt@gAtAa@bGKpC_Ar@_AbAsGz@oAhBgAzDu@tB{@|GaFjAiAzIeGn@s@v@eBTgC\\gAhAiBbFcGbB_GjAyCl@}@tBsBp@mAjHeThCwM`AqBr@m@tAg@xDu@fKmAlAH~DfArDChALvA`@tChBdB^~@@dF_@jEk@xBeAbBcB`AsBl@_Cp@qAPyAc@eEFmA'},
    {id: 'sy_r_eh', kind: 'rail', name: '东山线（经锡德纳姆）', color: '#2e9e5b', speed: 42, head: 15, stops: [['市政厅',138.73,83.56],['温亚德',138.38,80.19],['环形码头',139.83,77.86],['圣詹姆斯',140.5,81.81],['博物馆',139.94,84.1],['中央',138.93,87.85],['雷德芬',135.61,91.59],['厄斯金维尔',130.74,95.17],['圣彼得斯',129.09,98.17],['锡德纳姆',124.01,101.28],['图雷拉',114.16,108.23],['巴德韦尔公园',108.54,108.96],['北贝克斯利',104.39,111.65],['金斯格罗夫',99.61,112.93],['比佛利山',92.72,116.61],['纳尔威',88.27,116.18],['里弗伍德',81.69,117.82],['帕德斯托',74.43,118.06],['里维斯比',67.95,118.3],['帕纳尼亚',61.64,119.11],['东山',56.86,122.17],['霍尔斯沃西',46.45,123.09]], path: '{iPgmIAhD`@pAJfA?tBXtDKt@g@l@y@NsGa@q@q@EkANa@lAiATe@h@yH|A}GfAgIx@qBxEaEzBqDt@u@~C_B~FaBjBuAn@eAf@{A|@cGdA{An@[pGeBjAk@xUaQhAiBn@{DXy@lAkBt@i@~AMrD\\nAEfQqEnABtCj@tBIvGuCrCoCv@e@hAUlIm@lBc@jKkEnDuC`Ag@fQ_FdAEdAH|FxB`BL|AM~ZaHrLr@vf@q@tSaBzDu@bBy@dAw@hF}FjA_ApBgAjCo@vAKlB@~VpB'},
    {id: 'sy_r_air', kind: 'rail', name: '机场线', color: '#0f8f86', speed: 40, head: 10, y0: [2000,5], stops: [['市政厅',138.69,83],['温亚德',138.28,79.65],['环形码头',140.31,77.89],['圣詹姆斯',140.54,82.42],['博物馆',139.81,84.49],['中央',138.69,88.34],['格林广场',136.85,97.99],['马斯科特',131.44,105.45],['国内机场',128.8,109.97],['国际机场',123.25,110.47],['沃利溪',119.04,107.71],['图雷拉',113.71,108.45],['巴德韦尔公园',108.16,109.22],['北贝克斯利',103.88,111.77],['金斯格罗夫',99.11,113.23],['比佛利山',92.12,116.88],['纳尔威',87.71,116.09],['里弗伍德',81.2,118.03],['帕德斯托',73.92,118.13],['里维斯比',67.95,118.37],['帕纳尼亚',61.12,119.23],['东山',56.43,122.63],['霍尔斯沃西',45.96,123.14]], path: 'wiP_kI?jBf@bBZvIO|@e@f@w@NaHe@m@o@IgATm@lAiAPc@f@wIfBwFvAeKn@eAdCeCj@uAt@wJ{AmLFwA^}@n@q@~CaA~@q@rKsOV_A^uDF_CMqCh@aEh@_BnA_AnAOhER~AEdAYjD}AdBKhFvAdDvC`DxBhAf@~AJ|BIvC\\nAAbQoEfB@tCj@nBKxGsCrCoC`Ai@nAW`Ha@hCi@dKkEvDuC`Ag@fQ_FdAEdAHhFlBjAT`A@dAKjUoFrDq@tLr@~e@q@~UkBdCk@rC}A~FoGxAkAdB}@jCo@vAKlB@tShBhDB'},
    {id: 'sy_r_bk', kind: 'rail', name: '班克斯敦线', color: '#8a5ab8', speed: 35, head: 15, y1: [2024,9], stops: [['中央',138.29,87.44],['雷德芬',135.63,91.6],['厄斯金维尔',130.64,95.74],['圣彼得斯',128.61,98.4],['锡德纳姆',123.59,101.62],['马里克维尔',119,101.24],['达利奇山',113.98,99.62],['赫尔斯通公园',110.93,99.74],['坎特伯雷',106.08,100.36],['坎普西',100.15,99.73],['贝尔莫尔',95,102.68],['拉肯巴',90.25,103.97],['怀利公园',87.09,105.23],['潘奇鲍尔',82.81,106.33],['班克斯敦',74.91,102.95]]},
    {id: 'sy_r_lb', kind: 'rail', name: '利德科姆–班克斯敦线', color: '#a07ad0', speed: 35, head: 30, stops: [['班克斯敦',74.92,103],['亚古纳',70.97,97.69],['比朗',71.14,91.78],['摄政公园',71.25,87.2],['贝拉拉',74.37,82.38],['利德科姆',78.42,78.8]], path: 'ujH_{KhDEp@Vn@n@X`A?zBJl@xGbPFfAc@tFkBpKJf@\\^xAZ`@VXj@@l@Md@cBbB}@bBYbAa@|Dg@nAkDxDuDnCuEjJ{@p@{@ZqAEo@['},
    {id: 'sy_r_cl', kind: 'rail', name: '卡灵福德线', color: '#9a8a6a', speed: 28, head: 30, y1: [2020,1], stops: [['克莱德',68.61,66.78],['罗斯山',71.21,59.82],['卡梅利亚',71.62,58.18],['赖达米尔',71.51,55.69],['邓达斯',75.24,50.19],['特洛皮亚',77.65,47.52],['卡灵福德',79.94,42.64]]},
    {id: 'sy_r_op', kind: 'rail', name: '奥林匹克公园线', color: '#c9a227', speed: 35, head: 20, stops: [['利德科姆',80.15,79.17],['奥林匹克公园',88.24,71.19]], path: 's_Iu{HgC@yBdAsFlAe@XkA`C{DjGqCvBK^@n@r@|AHbA[d@mBn@'},
    {id: 'sy_r_cb', kind: 'rail', name: '坎伯兰线', color: '#7aa6c2', speed: 40, head: 30, stops: [['坎利谷',41.45,89.21],['费尔菲尔德',46.6,82.54],['耶诺拉',51.7,79.21],['吉尔福德',56.54,74.58],['梅里兰兹',59.77,66.57],['哈里斯公园',65.03,60.65],['帕拉马塔',63.86,58.26],['韦斯特米德',57.56,54.38],['温特沃斯维尔',51.8,53.76],['彭德尔山',45.82,51.11],['通加比',44.11,44.74]], path: 'ydDycJgOpUmApAk_@lTaAp@oArA{LzVMbB\\tBBdAe@pBwLhLkAd@}CTs@\\Yv@?dD[bDTzBf@`Ar@r@nAl@~Ex@nAb@nAbAtBfD`Ar@`Bt@jCt@lBRhB?fE[bCPhCp@tGpCtHjAbCdAr@l@n@dAt@xAj@hBlAjP'},
    {id: 'sy_r_ecr', kind: 'rail', name: '埃平–查茨伍德线', color: '#c46a2a', speed: 50, head: 15, y0: [2009,2], y1: [2018,9], stops: [['埃平',92.8,38.99],['麦考瑞大学',104.24,39.71],['麦考瑞公园',108.12,41.17],['北赖德',113.82,49.39],['查茨伍德',129.04,49.51]]},
    {id: 'sy_f_manly', kind: 'ferry', name: '曼利渡轮', color: '#2a9d8f', speed: 26, head: 30, stops: [['环形码头',140.37,77.58],['曼利码头',167.11,50.83]], path: 'opPiuHEl@H`@kBxEi@p@sJJiIXiDAkPcBaF]uADkAVyAjAyA`B{AdCwAhEwClLqMfPeAhB_BvNmDbVi@zBcBlD'},
    {id: 'sy_f_zoo', kind: 'ferry', name: '塔龙加动物园渡轮', color: '#3aa0c8', speed: 18, head: 30, stops: [['环形码头',140.26,77.54],['塔龙加动物园码头',150.8,71.23]], path: '_pPeuHKZ?n@}BvG{Nr@aMzBkAt@qD|E'},
    {id: 'sy_f_par', kind: 'ferry', name: '帕拉马塔河渡轮', color: '#1d7fa8', speed: 22, head: 45, stops: [['环形码头',140.08,77.52],['鹦鹉岛码头',126.33,70.83],['德拉莫因码头',120.33,70.8],['亨特利角码头',114.69,69.38],['奇斯威克码头',114.65,70.79],['阿伯茨福德码头',109.62,70],['卡巴里塔码头',105.42,68.69],['吻角码头',99.9,64.76],['梅多班克码头',95.56,60.1],['悉尼奥林匹克公园码头',91.35,60.38],['赖达米尔码头',78.36,58.63],['帕拉马塔码头',65.85,57.2]], path: 'ioPauHa@fAa@`GL`A`AzAr@PnACdEe@hCk@|A_AVgA[qDwAwHvAvH|@tCd@t@nCvBfCpF`BjBbB`A`A^vCn@jBJpDMjBcAnD`@bJuA|AAlAT~@b@zBlGh@`@p@FvAS`FcB~DIFm@i@uA@WRUnH]dB`@bBdBjAHzAQ~C|@hB|Ap@XpA@|BOn@Fn@Z~BdDj@R`CPp@RpBdC|AnAp@\\l@FvBxFjCvEpAz@fD|@tIEpB]z@Cl@JvDhBdAJjAa@rFeE~Ag@xA@lDb@|FOtDB^L\\`@hDdGd@`@xANrAAr@QhAs@x@IpLdB^d@BbBt@\\tCJzCuA~BS|APnA`@lAfA'},
    {id: 'sy_f_nb', kind: 'ferry', name: '中立湾渡轮', color: '#5aa5d6', speed: 16, head: 30, stops: [['环形码头',140.19,77.53],['基里比利码头',143.73,72.56],['北悉尼码头',143.12,70.48],['中立湾码头',143.31,69.45]], path: 'woPcuHuBjKm@LeGJi@XCd@TfBWtB?v@|A`CZtAEVi@\\'},
  ];

  const data = {
    city: '悉尼', riverName: '帕拉马塔河', seaName: '塔斯曼海', hsrYear: 2100,
    roadsAtStart: true,   // 2000 年的悉尼早已建成，既有道路开局就在；片区开放只决定能不能修地铁
    stages: [[2004, '奥运之年'], [2009, '城市之城'], [2013, '金融危机之后'], [2018, '铁路未来与重建计划'], [2021, '三城之都']], stageLast: '模拟未来',
    eras: [
      { id: 'sy-e0', from: 2000, name: '奥运之年', tag: '史实',
        summary: '史实：2000 年 5 月机场线通车，9 月悉尼奥运会在霍姆布什湾举行，城铁网已有约 300 座车站，放射状干线经中央车站和城市环线进城（史实背景，本局的地铁由你规划）。估算：岗位集中在中央商务区和北悉尼，帕拉马塔是第二中心，内城的旧厂区开始改建住宅。',
        grow: { pop: { pyrmont: 1.8, surry: 1.4, greensq: 1.3, rhodes: 1.5, olympic: 1.2, wentworthpt: 1.6 }, jobs: { cbd: 1.4, northsydney: 1.2, parramatta: 1.2, macquarie: 1.6, mascot: 1.2 } },
        demand: { lz: 1.05 }, corridors: [{ a: 'parramatta', b: 'cbd', f: 1.15 }, { a: 'chatswood', b: 'cbd', f: 1.15 }, { a: 'bondi', b: 'cbd', f: 1.1 }],
        goals: [{ id: 'sy-g1', type: 'connect', months: 48, reward: 40000, title: '东区的公交走廊', desc: '邦迪交汇和兰德威克之间每天有大批学生、病人和上班族，只能坐公交。用地铁把两地连起来。', anchors: [anchor('邦迪交汇', -33.8915, 151.2502, 3), anchor('兰德威克', -33.9145, 151.2414, 3)] }] },
      { id: 'sy-e1', from: 2004, name: '城市之城', tag: '史实',
        summary: '史实：2005 年大都市战略《城市之城》提出帕拉马塔、查茨伍德、麦考瑞公园等区域中心分担就业；同年宣布西北铁路、西南铁路和中央商务区铁路计划；2006 年东达令港集装箱码头关闭（史实背景，本局的地铁由你规划）。估算：麦考瑞公园、罗兹和温特沃斯角的旧厂区与空地改成写字楼和住宅。',
        grow: { pop: { rhodes: 2, wentworthpt: 2.2, greensq: 1.8, olympic: 1.3, parramatta: 1.3, hills: 1.4 }, jobs: { macquarie: 2, parramatta: 1.5, chatswood: 1.3, northsydney: 1.1, cbd: 1.2 } },
        relocate: { jobs: { cbd: 0.0004 } }, demand: { lz: 1.05 }, corridors: [{ a: 'macquarie', b: 'chatswood', f: 1.15 }, { a: 'parramatta', b: 'macquarie', f: 1.1 }],
        goals: [{ id: 'sy-g2', type: 'connect', months: 48, reward: 40000, title: '帕拉马塔的区域中心', desc: '帕拉马塔被定为悉尼的第二个中心，医院、法院和政府部门都在往这里搬。连接韦斯特米德、帕拉马塔与梅里兰兹。', anchors: [anchor('韦斯特米德', -33.8077, 150.9875, 3), anchor('帕拉马塔', -33.8173, 151.0049, 3), anchor('梅里兰兹', -33.8366, 150.9926, 3)] }] },
      { id: 'sy-e2', from: 2009, name: '金融危机之后', tag: '史实',
        summary: '史实：全球金融危机中澳大利亚避免了衰退；2009 年埃平–查茨伍德铁路通车，巴兰加鲁选定开发商；2008 年宣布的中央商务区地铁 2010 年被取消（史实背景）。估算：人口增长加快，内城和铁路沿线的公寓大量开工。',
        grow: { pop: { greensq: 2.2, wentworthpt: 2, rhodes: 1.6, chatswood: 1.3, parramatta: 1.4, bankstown: 1.2 }, jobs: { macquarie: 1.6, parramatta: 1.4, barangaroo: 2, cbd: 1.1 } },
        relocate: { jobs: { cbd: 0.0004 } }, demand: { lz: 1.08 }, corridors: [{ a: 'greensq', b: 'cbd', f: 1.15 }, { a: 'hills', b: 'macquarie', f: 1.1 }],
        goals: [{ id: 'sy-g3', type: 'connect', months: 48, reward: 40000, title: '北岸的写字楼', desc: '鸦巢和查茨伍德的写字楼越来越多。连接鸦巢与查茨伍德。', anchors: [anchor('鸦巢', -33.8253, 151.2006, 3), anchor('查茨伍德', -33.7969, 151.1806, 3)] }] },
      { id: 'sy-e3', from: 2013, name: '铁路未来与重建计划', tag: '史实',
        summary: '史实：2012 年《悉尼铁路未来》提出单层车厢的快速地铁和第二条过港铁路，2013 年西北铁路动工，2014 年“重建新南威尔士”计划为大型工程筹资，2015 年批准城区与西南地铁，2018 年埃平–查茨伍德段停运改造（史实背景，本局的地铁由你规划）。估算：巴兰加鲁、格林广场和奥林匹克公园周边的高楼成片落成。',
        grow: { pop: { greensq: 2.4, wentworthpt: 1.8, olympic: 1.8, parramatta: 1.6, hills: 1.6, macquarie: 1.4 }, jobs: { barangaroo: 3, parramatta: 1.7, macquarie: 1.5, olympic: 1.4, cbd: 1.1 } },
        relocate: { jobs: { cbd: 0.0005 } }, demand: { lz: 1.1 }, corridors: [{ a: 'hills', b: 'chatswood', f: 1.15 }, { a: 'greensq', b: 'cbd', f: 1.15 }],
        goals: [{ id: 'sy-g4', type: 'connect', months: 48, reward: 40000, title: '格林广场的新城中心', desc: '格林广场的城市中心和图书馆陆续建成，居民每天进城上班。连接格林广场、滑铁卢与中央。', anchors: [anchor('格林广场', -33.9055, 151.2025, 3), anchor('滑铁卢', -33.8986, 151.2068, 3), anchor('中央', -33.8830, 151.2067, 3)] }] },
      { id: 'sy-e4', from: 2018, name: '三城之都', tag: '史实',
        summary: '史实：2018 年大悉尼委员会的区域规划《三城之都》把帕拉马塔定为中部河城的中心；2019 年西北地铁通车，2020 年新冠疫情让公共交通客流骤降；2024 年地铁穿过悉尼港通到锡德纳姆，锡德纳姆–班克斯敦段停运改造（史实背景，本局的地铁由你规划）。估算：就业继续向帕拉马塔、奥林匹克公园和麦考瑞公园分散。',
        grow: { pop: { parramatta: 1.6, olympic: 1.6, wentworthpt: 1.4, hills: 1.5, bankstown: 1.3 }, jobs: { parramatta: 1.9, olympic: 1.6, macquarie: 1.4, barangaroo: 1.5, cbd: 1 } },
        relocate: { jobs: { cbd: 0.0005 } }, demand: { lz: 1.05 }, corridors: [{ a: 'parramatta', b: 'olympic', f: 1.2 }, { a: 'parramatta', b: 'cbd', f: 1.1 }],
        goals: [{ id: 'sy-g5', type: 'connect', months: 48, reward: 40000, title: '中部河城', desc: '帕拉马塔和奥林匹克公园之间的岗位与住宅都在快速增加。用地铁把两地连起来。', anchors: [anchor('帕拉马塔', -33.8173, 151.0049, 3), anchor('奥林匹克公园', -33.8471, 151.0688, 3)] }] },
      { id: 'sy-e5', from: 2021, name: '模拟未来', tag: '模拟',
        summary: '模拟：此后的发展按模型推演，不代表真实历史。估算：帕拉马塔、奥林匹克公园和西南部继续成长，西悉尼国际机场通航后西部的出行增加。',
        grow: { pop: { parramatta: 1.4, olympic: 1.4, fairfield: 1.2, bankstown: 1.3 }, jobs: { parramatta: 1.5, olympic: 1.3, macquarie: 1.2 } },
        demand: { lz: 1.05 }, corridors: [{ a: 'fairfield', b: 'parramatta', f: 1.15 }] },
    ],
    // 城市特色（traits.js，规则见《地图设计与城市特色机制.md》）。新条目加在末尾
    traits: [
      { use: 'crossing', star: true, icon: 'bridge', label: '悉尼港与渡轮', text: '悉尼港把城区切成半岛和海湾，过港要修隧道或桥梁；渡轮在不少过港走廊上很有竞争力，地铁可以吸引一部分渡轮乘客', why: '悉尼港（杰克逊港）把北岸和南岸隔开，1932 年海港大桥通车、1992 年海港隧道通车；环形码头出发的渡轮连接曼利、中立湾、莫斯曼、巴尔曼和帕拉马塔河沿岸，2000 年代每年约 1,400 万人次。' },
      { use: 'corridors', star: true, icon: 'train', label: '城铁走廊', text: '2000 年已有覆盖广泛的城铁网，铁路和渡轮按真实线路分走沿线客流，地铁要找它们照顾不到的走廊', why: '城铁（CityRail，2013 年起称悉尼列车）在 2000 年已有约 300 座车站，北岸线、西部线、伊拉瓦拉线等放射状干线经中央车站和城市环线进城；2009 年埃平–查茨伍德线通车，2018 年和 2024 年埃平–查茨伍德段、锡德纳姆–班克斯敦段先后停运改造成地铁，2020 年卡灵福德线停运改建轻轨。' },
      { use: 'megaEvent', existing: true, star: true, icon: 'stadium', label: '2000 年奥运会', text: '2000 年 9 月奥运客流高峰，之后奥林匹克公园逐步变成住宅、商业和就业区', bid: { y: 2000, m: 9 }, open: [2000, 9], why: '悉尼 1993 年获得 2000 年奥运会主办权，主场馆建在霍姆布什湾的旧屠宰场和废料场上，1998 年奥林匹克公园铁路支线通车；奥运会 9 月 15 日至 10 月 1 日举行。' },
      { use: 'transition', level: 'mid', label: '奥林匹克公园转型', region: 'olympic', renew: { y: 2002, m: 7, title: '悉尼奥林匹克公园管理局成立', desc: '奥运会后场馆闲置，州政府成立管理局，把奥林匹克公园逐步改造成兼有住宅、写字楼和体育场馆的城区。' }, replan: [{ year: 2002.6, region: 'olympic', plan: 'mix' }], why: '2001 年州议会通过《悉尼奥林匹克公园管理局法》，管理局 2002 年 7 月成立，此后陆续批准住宅、酒店和写字楼。' },
      { use: 'foresight', level: 'mid', label: '奥林匹克公园总体规划', id: 'sy-sop', pos: ll(-33.8475, 151.0690), ym: [2010, 6], before: 2008, r: 7, region: 'olympic', title: '奥林匹克公园 2030 总体规划', hit: '奥林匹克公园要新增上万套住宅和大量写字楼，早已通车的{st}站让开发商下定决心。', miss: '奥林匹克公园要新增上万套住宅和大量写字楼，这一带却只有一条铁路支线。', why: '2010 年新南威尔士州批准《悉尼奥林匹克公园 2030 总体规划》，规划在场馆周边新增住宅、写字楼和学校。' },
      { use: 'relocate', existing: true, label: '多中心发展', span: [2005, 2040], why: '2005 年大都市战略《城市之城》提出帕拉马塔、查茨伍德、麦考瑞公园等区域中心分担就业；2018 年大悉尼委员会的《三城之都》把帕拉马塔定为中部河城的中心。' },
      { use: 'transition', level: 'light', label: '东达令港码头关闭', region: 'barangaroo', close: { y: 2006, m: 3, title: '东达令港集装箱码头关闭', desc: '集装箱业务迁往博特尼港，市中心西侧空出 22 公顷的滨水土地，州政府开始规划新的商务区。' }, replan: [{ year: 2010, region: 'barangaroo', plan: 'cbd' }], why: '东达令港码头 2006 年前后停止集装箱作业，2007 年改名巴兰加鲁，2009 年选定开发商，2015 年起写字楼陆续启用。' },
      { use: 'foresight', level: 'mid', label: '巴兰加鲁', id: 'sy-bar', pos: ll(-33.8625, 151.2015), ym: [2009, 12], before: 2007, r: 6, region: 'barangaroo', title: '巴兰加鲁选定开发商', hit: '旧码头上要长出新的商务区，提前通车的{st}站让写字楼的招商顺利得多。', miss: '旧码头上要长出新的商务区，可最近的车站要走十几分钟。' , why: '2009 年 12 月巴兰加鲁开发局选定开发商，项目包括三座写字楼、住宅和滨水公园。' },
      { use: 'transition', level: 'mid', label: '格林广场更新', region: 'greensq', renew: { y: 2006, m: 6, title: '格林广场城市中心规划', desc: '旧厂区改为住宅、商业和公共设施，规划成悉尼最大的城市更新区之一。' }, replan: [{ year: 2006.4, region: 'greensq', plan: 'mix' }], why: '格林广场一带原为工业区，1990 年代起分批改划，2000 年机场线设站，2010 年代建设城市中心和图书馆，是澳大利亚最大的城市更新区之一。' },
      { use: 'foresight', level: 'mid', label: '格林广场', id: 'sy-gsq', pos: ll(-33.9060, 151.2040), ym: [2012, 6], before: 2010, r: 6, region: 'greensq', title: '格林广场城市中心开工', hit: '格林广场的城市中心开工，提前通车的{st}站让这里的公寓更受欢迎。', miss: '格林广场的城市中心开工，地铁却还没修到这里。', why: '2012 年前后格林广场城市中心的基础设施开工，2017 年起图书馆、广场和公寓陆续启用。' },
      { use: 'foresight', level: 'light', label: '麦考瑞公园', id: 'sy-mqp', pos: ll(-33.7787, 151.1242), ym: [2006, 1], before: 2004, r: 7, region: 'macquarie', title: '麦考瑞公园走廊规划', hit: '麦考瑞公园被定为专门的就业中心，早已通车的{st}站让大公司纷纷把总部搬来。', miss: '麦考瑞公园被定为专门的就业中心，可这里还没有地铁。', why: '2005 年的大都市战略把麦考瑞公园定为专门就业中心，之后制药、科技公司的总部陆续迁入；2009 年埃平–查茨伍德铁路在这里设站。' },
      { use: 'portal', label: '西悉尼国际机场', why: '西悉尼国际机场（南希–伯德·沃尔顿）位于地图边缘以西约 10 km 的巴杰里溪，2018 年动工，计划 2026 年底通航；本局按 2026 年 12 月启用模拟。' },
      { use: 'investWindow', level: 'mid', label: '重建新南威尔士', on: { y: 2014, m: 6, title: '“重建新南威尔士”计划', desc: '州政府长期出租电网资产筹资，投入地铁、轻轨和道路等大型交通工程。' }, years: 8, why: '2014 年新南威尔士州提出“重建新南威尔士”计划，以电网资产长期租赁的收入设立基础设施基金，悉尼地铁、轻轨和西联快速路由此加速。' },
      { use: 'scenic', why: '悉尼港国家公园、莱恩湾国家公园、百年纪念公园和皇家植物园受到长期保护。' },
      { use: 'finance', flavor: 'au' },
    ],
    bg: { name: '城铁与渡轮', share: [[2000, 0], [2050, 0]], speed: [[2000, 20]], wait: [[2000, 8]], lines: BG_LINES, maxShare: 0.85, waitCap: 12,
      // 平均每次的票价（估算，澳元）：按中等距离、计入周票和储值票的折扣；渡轮明显更贵
      fares: { rail: [[2000, 2.4], [2005, 2.7], [2010, 3.0], [2015, 3.3], [2020, 3.6], [2030, 4.5], [2050, 6.6]], ferry: [[2000, 3.6], [2005, 4.1], [2010, 4.6], [2015, 5.0], [2020, 5.6], [2030, 7.0], [2050, 10]] } },
    briefing: {
      lead: '2000 年的悉尼正在为奥运会做最后的准备，5 月机场线刚刚通车。城铁的放射状干线早已铺满城市，渡轮从环形码头开往港湾各处，悉尼却还没有一条地铁。你要找到铁路和渡轮照顾不到的走廊，修出悉尼的第一条地铁。',
      modes: [['metro', '地铁', '悉尼还没有地铁。真实的西北地铁 2019 年通车；本局由你规划，真实线路不会自动出现。'], ['rail', '城铁', '放射状的城铁网覆盖大部分郊区，按真实线路分走沿线客流。沿线的出行本来就有不错的选择，地铁要更快、更直接才争得到乘客。'], ['ferry', '渡轮', '环形码头的渡轮开往曼利、中立湾、莫斯曼、巴尔曼和帕拉马塔河沿岸。过港的地铁可以吸引一部分渡轮乘客。'], ['plane', '机场', '金斯福德·史密斯机场在图内，可以修地下车站；西悉尼国际机场在图外，按 2026 年底通航模拟，要修到地图西缘的接驳口。']],
    },
    airport: null,
    // 金斯福德·史密斯机场：东西跑道与两条南北跑道（第三条跑道 1994 年启用）；班克斯敦机场为通用航空机场。位置按 OSM
    runways: [{ a: ll(-33.9301, 151.1718), b: ll(-33.9643, 151.1806) }, { a: ll(-33.9496, 151.1883), b: ll(-33.9708, 151.1938) }, { a: ll(-33.9438, 151.1636), b: ll(-33.9378, 151.1889) },
      { a: ll(-33.9193, 150.9831), b: ll(-33.9265, 150.9959) }, { a: ll(-33.9201, 150.9866), b: ll(-33.9256, 150.9965) }],
    regions: [
      // 风景区（不开放，景点附近可建地下站）
      { id: 'harbournp', name: '悉尼港国家公园', geo: { reserve: '悉尼港国家公园' }, scenic: true, open: null, relief: 0 },
      { id: 'lanecovenp', name: '莱恩湾国家公园', geo: { reserve: '莱恩湾国家公园' }, scenic: true, open: null, relief: 0 },
      { id: 'garigal', name: '加里加尔国家公园', geo: { reserve: '加里加尔国家公园' }, scenic: true, open: null, relief: 0 },
      { id: 'centennial', name: '百年纪念公园', geo: { park: '百年纪念公园' }, scenic: true, open: null, relief: 0 },
      { id: 'parrapark', name: '帕拉马塔公园', geo: { park: '帕拉马塔公园' }, scenic: true, open: null, relief: 0 },
      { id: 'bicentennial', name: '两百周年纪念公园', geo: { park: '两百周年纪念公园' }, scenic: true, open: null, relief: 0 },
      // 机场与不开放用地
      { id: 'sy_air', name: '金斯福德·史密斯机场', poly: poly([[-33.9255, 151.1585], [-33.9255, 151.1960], [-33.9600, 151.1975], [-33.9725, 151.1995], [-33.9725, 151.1705], [-33.9480, 151.1560]]), open: null, hub: true, empty: true, lockNote: '机场用地不开发', note: '悉尼机场；重要交通枢纽，范围内可以地下设站与地下穿越' },
      { id: 'bankstown_ad', name: '班克斯敦机场', streets: ['班克斯敦机场'], open: 2006, sim: true, plan: 'ind', note: '通用航空机场周边的工业与商务园区（开放年份为模拟）' },
      { id: 'holsworthy', name: '霍尔斯沃西', streets: ['霍尔斯沃西'], open: 2008, sim: true, plan: 'res', note: '原军营周边的远郊（开放年份为模拟）' },
      { id: 'rookwood', name: '鲁克伍德', streets: ['鲁克伍德'], open: 2004, sim: true, plan: 'mix', note: '利德科姆以北，与奥本、奥林匹克公园相邻（开放年份为模拟）' },
      // 市中心与内城（开局开放）
      { id: 'cbd', name: '悉尼中央商务区', streets: ['悉尼', '岩石区', '道斯角', '米勒斯角', '海马基特'], open: 2000, plan: 'cbd' },
      { id: 'barangaroo', name: '巴兰加鲁', streets: ['巴兰加鲁'], open: 2000, plan: 'port', note: '2006 年前后集装箱码头关闭，之后改建商务区（史实）' },
      { id: 'pyrmont', name: '皮尔蒙特与乌尔蒂莫', streets: ['皮尔蒙特', '乌尔蒂莫'], open: 2000, plan: 'mix' },
      { id: 'surry', name: '萨里山与达令赫斯特', streets: ['萨里山', '达令赫斯特', '伍卢穆卢', '波茨角', '伊丽莎白湾', '拉什卡特斯湾', '奇彭代尔'], open: 2000, plan: 'oldmix' },
      { id: 'redfern', name: '雷德芬与滑铁卢', streets: ['雷德芬', '达灵顿', '伊夫利', '滑铁卢'], open: 2000, plan: 'oldmix' },
      { id: 'glebe', name: '格利布与纽敦', streets: ['格利布', '森林小屋', '坎珀当', '纽敦', '安娜代尔', '厄斯金维尔', '恩莫尔', '斯坦莫尔'], open: 2000, plan: 'oldmix' },
      { id: 'paddington', name: '帕丁顿与伍拉拉', streets: ['帕丁顿', '伍拉拉', '埃奇克利夫', '达令角', '摩尔公园'], open: 2000, plan: 'res' },
      { id: 'balmain', name: '巴尔曼与莱卡特', streets: ['巴尔曼', '东巴尔曼', '伯奇格罗夫', '罗泽尔', '莉莉菲尔德', '莱卡特'], open: 2000, plan: 'res' },
      { id: 'northsydney', name: '北悉尼', streets: ['北悉尼', '米尔森角', '基里比利', '薰衣草湾', '麦克马洪斯角', '韦弗顿', '沃斯通克拉夫特'], open: 2000, plan: 'cbd' },
      { id: 'neutralbay', name: '中立湾与莫斯曼', streets: ['中立湾', '克雷蒙角', '库拉巴角', '克雷蒙', '卡梅雷', '莫斯曼', '鸦巢'], open: 2000, plan: 'res' },
      { id: 'greensq', name: '格林广场', streets: ['泽特兰', '亚历山德里亚', '比肯斯菲尔德', '罗斯伯里'], open: 2000, plan: 'resind', note: '旧工业区，2000 年代起改建住宅与商业（史实）' },
      { id: 'bondi', name: '邦迪与东区海湾', streets: ['邦迪交汇', '韦弗利', '邦迪', '邦迪海滩', '北邦迪', '勃朗特', '塔马拉马', '双湾', '贝尔维尤山', '派珀角', '玫瑰湾', '多佛高地', '沃克吕兹', '沃森斯湾'], open: 2000, plan: 'res' },
      { id: 'randwick', name: '兰德威克与肯辛顿', streets: ['兰德威克', '肯辛顿', '金斯福德', '克洛夫利', '库吉', '南库吉', '女王公园', '戴西维尔'], open: 2000, plan: 'mix' },
      { id: 'marrickville', name: '马里克维尔', streets: ['马里克维尔', '达利奇山', '彼得舍姆', '刘易舍姆', '圣彼得斯', '锡德纳姆', '坦普', '萨默山'], open: 2000, plan: 'mix' },
      // 中环
      { id: 'olympic', name: '悉尼奥林匹克公园', streets: ['悉尼奥林匹克公园'], open: 2000, plan: 'expo', note: '2000 年奥运会主场馆所在地（史实）' },
      { id: 'mascot', name: '马斯科特与博特尼', streets: ['马斯科特', '博特尼', '伊斯特莱克斯', '佩奇伍德', '伊斯特加登斯', '希尔斯代尔'], open: 2001, plan: 'resind' },
      { id: 'maroubra', name: '马鲁布拉与马拉巴', streets: ['马特拉维尔', '奇夫利', '马拉巴', '马鲁布拉', '小湾', '拉佩鲁兹', '菲利普湾'], open: 2002, plan: 'res' },
      { id: 'portbotany', name: '博特尼港', streets: ['博特尼港', '班克斯梅多'], open: 2002, plan: 'port' },
      { id: 'chatswood', name: '查茨伍德与圣伦纳兹', streets: ['查茨伍德', '西查茨伍德', '阿塔蒙', '威洛比', '北威洛比', '东威洛比', '纳伦本', '圣伦纳兹'], open: 2001, plan: 'mix' },
      { id: 'lanecove', name: '莱恩湾', streets: ['莱恩湾', '北莱恩湾', '西莱恩湾', '里弗维尤', '林利角', '朗格维尔', '诺斯伍德', '格林威治'], open: 2002, plan: 'res' },
      { id: 'northbridge', name: '北桥与中湾', streets: ['北桥', '卡斯尔克拉格', '城堡湾', '中湾', '罗斯维尔猎场', '基拉尼高地'], open: 2003, plan: 'res' },
      { id: 'drummoyne', name: '德拉莫因与康科德', streets: ['德拉莫因', '五码头', '罗德角', '沃伦巴', '阿伯茨福德', '拉塞尔利', '奇斯威克', '卡巴里塔', '康科德', '西康科德', '莫特莱克', '早餐角', '加拿大湾', '哈伯菲尔德'], open: 2001, plan: 'res' },
      { id: 'ashfield', name: '阿什菲尔德与伯伍德', streets: ['阿什菲尔德', '克罗伊登', '克罗伊登公园', '伯伍德', '伯伍德高地', '恩菲尔德', '斯特拉斯菲尔德', '南斯特拉斯菲尔德', '北斯特拉斯菲尔德', '霍姆布什', '西霍姆布什', '阿什伯里', '赫尔斯通公园'], open: 2001, plan: 'mix' },
      { id: 'rockdale', name: '罗克代尔与阿恩克利夫', streets: ['罗克代尔', '班克西亚', '阿恩克利夫', '沃利溪', '贝克斯利', '布莱顿勒桑兹', '凯伊马'], open: 2001, plan: 'res' },
      { id: 'canterbury', name: '坎特伯雷与坎普西', streets: ['坎普西', '坎特伯雷', '厄尔伍德', '克莱姆顿公园', '金斯格罗夫', '比佛利山', '纳尔威', '北贝克斯利', '巴德韦尔谷', '巴德韦尔公园', '图雷拉'], open: 2002, plan: 'res' },
      { id: 'rhodes', name: '罗兹与自由林', streets: ['罗兹', '自由林'], open: 2002, plan: 'resind', note: '化工厂区，2000 年代改建公寓与写字楼（史实）' },
      { id: 'wentworthpt', name: '温特沃斯角与纽因顿', streets: ['温特沃斯角', '纽因顿', '银水'], open: 2002, plan: 'resind' },
      { id: 'ryde', name: '赖德与亨特斯山', streets: ['赖德', '西赖德', '东赖德', '北赖德', '德尼斯顿', '东德尼斯顿', '西德尼斯顿', '梅多班克', '帕特尼', '格莱兹维尔', '亨特斯山', '亨特利湾', '亨特利角', '伍利奇', '丁尼生角', '亨利'], open: 2003, plan: 'res' },
      { id: 'macquarie', name: '麦考瑞公园', streets: ['麦考瑞公园', '马斯菲尔德'], open: 2003, plan: 'mix', note: '大学与商业园，2000 年代成为专门就业中心（史实）' },
      { id: 'stgeorge', name: '赫斯特维尔与科加拉', streets: ['赫斯特维尔', '南赫斯特维尔', '赫斯特维尔林', '彭斯赫斯特', '莫特代尔', '皮克赫斯特', '皮克赫斯特高地', '里弗伍德', '奥特利', '科莫', '卢加诺', '科加拉', '卡尔顿', '阿拉瓦', '贝弗利公园', '科加拉湾', '卡斯公园', '布莱克赫斯特', '康内尔斯角', '凯尔湾', '桑苏西', '多尔斯角', '桑德灵厄姆', '拉姆斯盖特', '拉姆斯盖特海滩', '蒙特雷'], open: 2003, plan: 'res' },
      { id: 'parramatta', name: '帕拉马塔', streets: ['帕拉马塔', '哈里斯公园', '罗斯山', '北帕拉马塔', '卡梅利亚', '赖达米尔', '韦斯特米德', '梅斯山'], open: 2003, plan: 'cbd' },
      { id: 'auburn', name: '奥本与利德科姆', streets: ['奥本', '利德科姆', '贝拉拉', '摄政公园', '南格兰维尔', '格兰维尔', '克莱德', '丘洛拉', '波茨山'], open: 2003, plan: 'resind' },
      { id: 'manly', name: '曼利', streets: ['曼利', '费尔莱特', '巴尔戈拉', '巴尔戈拉高地', '克朗塔夫', '西福斯', '北巴尔戈拉', '曼利谷', '北曼利', '昆斯克利夫', '弗雷什沃特'], open: 2003, plan: 'res' },
      { id: 'epping', name: '埃平与卡灵福德', streets: ['埃平', '北埃平', '卡灵福德', '特洛皮亚', '邓达斯', '邓达斯谷', '伊斯特伍德', '厄明顿', '梅尔罗斯公园'], open: 2004, plan: 'res' },
      { id: 'uppernorth', name: '上北岸', streets: ['罗斯维尔', '林德菲尔德', '东林德菲尔德', '基拉拉', '东基拉拉', '戈登', '平布尔', '西平布尔', '图拉穆拉', '南图拉穆拉', '北图拉穆拉', '沃拉威', '沃隆加', '北沃隆加', '怀塔拉', '圣艾夫斯', '圣艾夫斯猎场'], open: 2004, plan: 'res' },
      { id: 'bankstown', name: '班克斯敦', streets: ['班克斯敦', '亚古纳', '康德尔公园', '米尔佩拉', '潘奇鲍尔', '怀利公园', '拉肯巴', '刘易斯山', '贝尔莫尔', '贝尔菲尔德', '罗斯兰兹', '格林埃克'], open: 2004, plan: 'mix' },
      { id: 'hornsby', name: '霍恩斯比', streets: ['霍恩斯比', '阿斯奎斯', '诺曼赫斯特', '索恩利', '韦斯特利', '彭南特山', '西彭南特山', '比克罗夫特', '切尔滕纳姆', '彻里布鲁克', '格伦黑文', '杜拉尔'], open: 2005, plan: 'res' },
      { id: 'merrylands', name: '梅里兰兹与吉尔福德', streets: ['梅里兰兹', '西梅里兰兹', '吉尔福德', '西吉尔福德', '老吉尔福德', '霍尔罗伊德', '格雷斯坦斯', '伍德帕克', '史密斯菲尔德', '耶诺拉', '南温特沃斯维尔', '温特沃斯维尔', '彭德尔山', '通加比', '老通加比', '吉拉温', '七山', '拉洛公园'], open: 2005, plan: 'res' },
      { id: 'warringah', name: '沃林加与北部海滩', streets: ['布鲁克维尔', '迪怀', '柯尔柯尔', '北柯尔柯尔', '纳拉威纳', '灯塔山', '阿兰比高地', '福里斯特维尔', '弗伦奇斯森林', '戴维森', '贝尔罗斯', '克罗默', '科拉罗伊', '科拉罗伊高原', '惠勒高地', '牛津瀑布', '北纳拉宾', '纳拉宾', '沃里伍德', '英格尔赛德', '埃拉诺拉高地', '特里山'], open: 2006, plan: 'res' },
      { id: 'hills', name: '山区郡', streets: ['城堡山', '鲍克姆山', '贝拉维斯塔', '诺韦斯特', '金斯兰利', '温斯顿山', '诺斯米德', '宪法山', '奥特兰兹', '北岩', '凯利维尔', '北凯利维尔', '博蒙特山'], open: 2006, plan: 'res' },
      { id: 'fairfield', name: '费尔菲尔德', streets: ['费尔菲尔德', '费尔菲尔德高地', '东费尔菲尔德', '坎利谷', '卡拉马', '维拉伍德', '切斯特山', '塞夫顿', '比朗', '巴斯山', '乔治斯霍尔', '兰斯当', '兰斯维尔', '卡布拉马塔', '奇平诺顿', '穆尔班克', '沃里克农场'], open: 2006, plan: 'resind' },
      { id: 'easthills', name: '东山与帕德斯托', streets: ['帕德斯托', '帕德斯托高地', '里维斯比', '里维斯比高地', '帕纳尼亚', '东山', '野餐角', '阿尔福兹角', '伊拉旺', '梅奈', '哈蒙德维尔', '金合欢林', '欢乐角', '沙角', '航海者角'], open: 2006, plan: 'res' },
      // v2.9 扩图：西部与南部新增的郊区（按地方政府区划定；开放年份为模拟，与相邻的郊区片区同期）
      { id: 'blacktown', name: '黑镇', district: ['布莱克敦区'], open: 2004, plan: 'res', sim: true },
      { id: 'liverpool', name: '利物浦', district: ['利物浦区'], open: 2004, plan: 'mix', sim: true },
      { id: 'sutherland', name: '萨瑟兰郡', district: ['萨瑟兰郡'], open: 2005, plan: 'res', sim: true },
    ],
    defaultRegion: { id: 'outer', name: '外围郊区', open: 2008, plan: 'res' },
    plans: CM.DATA.plans,
    // 片区设施（商业中心、区域医院、文体公园）出现门槛的人口基准：保持扩图前 2020 年的全图人口，原有片区不因 v2.9 扩图推迟
    facPopRef: 3.15e6,
    centers: [
      at(-33.8688, 151.2093, { pop: 22000, jobs: 230000, r: 1.0 }),   // 中央商务区
      at(-33.8390, 151.2072, { pop: 15000, jobs: 45000, r: 0.7 }),    // 北悉尼
      at(-33.8740, 151.1960, { pop: 18000, jobs: 30000, r: 0.7 }),    // 皮尔蒙特、乌尔蒂莫
      at(-33.8820, 151.2120, { pop: 48000, jobs: 30000, r: 1.0 }),    // 萨里山、达令赫斯特
      at(-33.8950, 151.2050, { pop: 32000, jobs: 12000, r: 0.9 }),    // 雷德芬、滑铁卢
      at(-33.8900, 151.1800, { pop: 52000, jobs: 16000, r: 1.2 }),    // 纽敦、格利布
      at(-33.8850, 151.2350, { pop: 38000, jobs: 8000, r: 1.1 }),     // 帕丁顿、伍拉拉
      at(-33.8930, 151.2550, { pop: 68000, jobs: 18000, r: 1.4 }),    // 邦迪
      at(-33.9150, 151.2400, { pop: 58000, jobs: 26000, r: 1.4 }),    // 兰德威克、肯辛顿
      at(-33.9450, 151.2400, { pop: 48000, jobs: 5000, r: 1.4 }),     // 马鲁布拉
      at(-33.9250, 151.1950, { pop: 28000, jobs: 42000, r: 1.3 }),    // 马斯科特、博特尼（含机场岗位）
      at(-33.9100, 151.1550, { pop: 58000, jobs: 15000, r: 1.4 }),    // 马里克维尔
      at(-33.8650, 151.1650, { pop: 48000, jobs: 10000, r: 1.3 }),    // 巴尔曼、莱卡特
      at(-33.8770, 151.1100, { pop: 88000, jobs: 26000, r: 1.8 }),    // 阿什菲尔德、伯伍德、斯特拉斯菲尔德
      at(-33.8550, 151.1000, { pop: 48000, jobs: 6000, r: 1.4 }),     // 德拉莫因、康科德
      at(-33.8300, 151.2350, { pop: 48000, jobs: 8000, r: 1.3 }),     // 中立湾、莫斯曼
      at(-33.7970, 151.1810, { pop: 42000, jobs: 30000, r: 1.3 }),    // 查茨伍德
      at(-33.8230, 151.1950, { pop: 10000, jobs: 26000, r: 0.6 }),    // 圣伦纳兹
      at(-33.7400, 151.1300, { pop: 88000, jobs: 8000, r: 2.5 }),     // 上北岸
      at(-33.7040, 151.0990, { pop: 34000, jobs: 12000, r: 1.4 }),    // 霍恩斯比
      at(-33.8150, 151.1100, { pop: 68000, jobs: 10000, r: 1.8 }),    // 赖德、格莱兹维尔
      at(-33.7780, 151.1220, { pop: 6000, jobs: 30000, r: 0.9 }),     // 麦考瑞公园
      at(-33.7800, 151.0700, { pop: 58000, jobs: 6000, r: 1.8 }),     // 埃平、伊斯特伍德、卡灵福德
      at(-33.8150, 151.0030, { pop: 28000, jobs: 62000, r: 1.1 }),    // 帕拉马塔
      at(-33.8080, 150.9700, { pop: 40000, jobs: 15000, r: 1.2 }),    // 韦斯特米德、温特沃斯维尔
      at(-33.8350, 150.9900, { pop: 68000, jobs: 12000, r: 1.8 }),    // 梅里兰兹、格兰维尔
      at(-33.8500, 151.0400, { pop: 48000, jobs: 22000, r: 1.5 }),    // 奥本、利德科姆
      at(-33.8700, 150.9550, { pop: 68000, jobs: 15000, r: 1.8 }),    // 费尔菲尔德
      at(-33.9180, 151.0350, { pop: 68000, jobs: 20000, r: 1.8 }),    // 班克斯敦
      at(-33.9100, 151.1000, { pop: 72000, jobs: 10000, r: 1.7 }),    // 坎普西、坎特伯雷
      at(-33.9650, 151.1000, { pop: 78000, jobs: 18000, r: 1.8 }),    // 赫斯特维尔、科加拉
      at(-33.9500, 151.1400, { pop: 44000, jobs: 6000, r: 1.3 }),     // 罗克代尔、阿恩克利夫
      at(-33.7800, 151.2800, { pop: 68000, jobs: 12000, r: 1.6 }),    // 曼利、迪怀
      at(-33.9500, 151.0200, { pop: 44000, jobs: 6000, r: 1.6 }),     // 里维斯比、帕德斯托
      at(-33.7350, 150.9900, { pop: 48000, jobs: 12000, r: 1.8 }),    // 城堡山、鲍克姆山
      at(-33.7500, 151.2300, { pop: 38000, jobs: 6000, r: 1.6 }),     // 弗伦奇斯森林
      // v2.9 扩大范围（起始年估算，OSM 坐标；pop、jobs 为中心密度，已按本图的总量归一化倍率换算，使归一化后接近当年规模）
      at(-33.771, 150.906, { pop: 39000, jobs: 12100, r: 1.6 }),   // 黑镇
      at(-33.92, 150.923, { pop: 37000, jobs: 18100, r: 1.5 }),   // 利物浦
      at(-33.895, 150.936, { pop: 53000, jobs: 12100, r: 1.1 }),   // 卡布拉马塔
      at(-33.774, 150.936, { pop: 37000, jobs: 9400, r: 1 }),   // 七山
      at(-33.948, 150.907, { pop: 28000, jobs: 4900, r: 1 }),   // 卡苏拉
      at(-33.902, 150.868, { pop: 30000, jobs: 3000, r: 1.1 }),   // 绿谷
      at(-33.843, 150.9, { pop: 10300, jobs: 20000, r: 1.2 }),   // 韦瑟里尔公园
      at(-33.861, 150.885, { pop: 28000, jobs: 4900, r: 1 }),   // 博斯利公园
      at(-33.727, 150.882, { pop: 37000, jobs: 4900, r: 1 }),   // 夸克斯山
      at(-34.031, 151.058, { pop: 25000, jobs: 8300, r: 1.2 }),   // 萨瑟兰
      at(-34.05, 151.151, { pop: 33000, jobs: 7200, r: 1 }),   // 克罗努拉
      at(-34.031, 151.112, { pop: 33000, jobs: 7900, r: 1.3 }),   // 卡林巴
      at(-34.038, 151.101, { pop: 37000, jobs: 18100, r: 1 }),   // 米兰达
      at(-34.035, 151.085, { pop: 28000, jobs: 4900, r: 1 }),   // 吉米亚
      at(-34.017, 151.065, { pop: 28000, jobs: 3600, r: 1 }),   // 贾纳利
      at(-34.012, 151.01, { pop: 22000, jobs: 3000, r: 1.1 }),   // 梅奈
      at(-34.009, 151.105, { pop: 28000, jobs: 3600, r: 1 }),   // 西尔瓦尼亚
    ],
    rural: { pop: 110, jobs: 30 },
    // 扩图新增范围的增长倍率（v2.9，见 city.js growMonth）：西部的黑镇、利物浦与南部的萨瑟兰郡按史实是增长最快的郊区，不加倍率时到 2020 年只有现实的一半左右
    growOut: { box: [40, 4, 132, 136], pop: 3.5 },
    // 道路通车年份（名称前缀匹配；2000 年已有的道路按所在区域开放年份出现）
    roadYears: { 'M8 快速路': 2020, '过城隧道': 2005, '莱恩湾隧道': 2007, 'M7 西环快速路': 2005, '悉尼门户路': 2024 },
    bridgeYears: { '悉尼海港大桥': 1932, '澳新军团大桥': 1995, '格莱兹维尔大桥': 1964 }, bridgeDefaultYear: 1950,
    simRoads: [],
    landmarks: [
      Object.assign(at(-33.85681, 151.21514), { id: 'sy_opera', name: '悉尼歌剧院', w: 183, d: 120, year: 1973, kind: 'concert', h: 65, shore: true }),
      Object.assign(at(-33.85225, 151.21068), { id: 'sy_bridge', name: '悉尼海港大桥', w: 1149, d: 49, rot: -62.5, year: 1932, kind: 'bridge2', h: 134, shore: true, bridge: { road: '布拉德菲尔德公路', deck: 24.5, flat: 265 } }),
      Object.assign(at(-33.87048, 151.20903), { id: 'sy_tower', name: '悉尼塔', w: 40, d: 40, year: 1981, kind: 'skyscraper', h: 309 }),
      Object.assign(at(-33.87170, 151.20670), { id: 'sy_qvb', name: '维多利亚女王大厦', w: 190, d: 30, year: 1898, kind: 'hall', h: 30 }),
      Object.assign(at(-33.87325, 151.20614), { id: 'sy_townhall', name: '悉尼市政厅', w: 60, d: 70, year: 1889, kind: 'hall', h: 57 }),
      Object.assign(at(-33.87127, 151.21309), { id: 'sy_stmarys', name: '圣玛丽大教堂', w: 107, d: 50, year: 1928, kind: 'hall', h: 75 }),
      Object.assign(at(-33.88290, 151.20630), { id: 'sy_central', name: '中央车站', w: 260, d: 100, year: 1906, kind: 'hall', h: 75 }),
      // 主要铁路站（v2.9）：坐标取线路车站，朝向沿铁轨
      { id: 'sy_redfern', name: '雷德芬站', x: 135.54, y: 91.5, w: 210, d: 110, rot: -38, year: 1884, kind: 'rail', h: 18 },
      { id: 'sy_strathfield', name: '斯特拉斯菲尔德站', x: 96.87, y: 82.21, w: 200, d: 90, rot: 43, year: 1876, kind: 'rail', h: 18 },
      { id: 'sy_chatswood', name: '查茨伍德站', x: 129.17, y: 49.52, w: 180, d: 70, rot: 89, year: 1890, kind: 'rail', h: 14 },
      { id: 'sy_parramatta', name: '帕拉马塔站', x: 63.86, y: 58.26, w: 110, d: 250, rot: -63.5, year: 1860, kind: 'rail', h: 16 },
      Object.assign(at(-33.84760, 151.20990), { id: 'sy_lunapark', name: '月神公园', w: 150, d: 100, year: 1935, kind: 'hall', h: 20, shore: true }),
      Object.assign(at(-33.86480, 151.20780), { id: 'sy_ausq', name: '澳大利亚广场', w: 42, d: 42, year: 1967, kind: 'skyscraper', h: 170 }),
      Object.assign(at(-33.86575, 151.21160), { id: 'sy_chifley', name: '奇夫利大厦', w: 55, d: 45, year: 1992, kind: 'skyscraper', h: 244 }),
      Object.assign(at(-33.86185, 151.20155), { id: 'sy_crown', name: '皇冠悉尼', w: 50, d: 45, year: 2020, kind: 'skyscraper', h: 271 }),
      Object.assign(at(-33.86470, 151.20160), { id: 'sy_itb', name: '巴兰加鲁国际大厦', w: 60, d: 50, year: 2016, kind: 'skyscraper', h: 217 }),
      Object.assign(at(-33.87570, 151.21070), { id: 'sy_anzac', name: '澳新军团纪念馆', w: 30, d: 115, year: 1934, kind: 'memorial', h: 30 }),
      Object.assign(at(-33.85460, 151.22570), { id: 'sy_denison', name: '丹尼森堡', w: 60, d: 40, year: 1857, kind: 'hall', h: 20, shore: true }),
      Object.assign(at(-33.84700, 151.06340), { id: 'sy_stadium', name: '澳大利亚体育场', w: 290, d: 270, year: 1999, kind: 'stadium', h: 58 }),
      Object.assign(at(-33.89150, 151.22490), { id: 'sy_scg', name: '悉尼板球场', w: 200, d: 210, year: 1900, kind: 'stadium', h: 30 }),
      Object.assign(at(-33.89100, 151.27480), { id: 'sy_bondipav', name: '邦迪海滩更衣楼', w: 100, d: 30, year: 1928, kind: 'hall', h: 12, shore: true }),
      Object.assign(at(-33.80980, 150.99780), { id: 'sy_ogh', name: '旧总督府', w: 76, d: 25, year: 1799, kind: 'hall', h: 10 }),
      Object.assign(at(-33.87390, 151.19880), { id: 'sy_icc', name: '悉尼国际会议中心', w: 250, d: 120, year: 2016, kind: 'hall', h: 30 }),
      Object.assign(at(-33.88610, 151.18900), { id: 'sy_usyd', name: '悉尼大学', w: 900, d: 700, year: 1859, kind: 'campus' }),
      Object.assign(at(-33.91730, 151.23130), { id: 'sy_unsw', name: '新南威尔士大学', w: 900, d: 700, year: 1949, kind: 'campus' }),
      Object.assign(at(-33.77380, 151.11260), { id: 'sy_mq', name: '麦考瑞大学', w: 1000, d: 900, year: 1964, kind: 'campus' }),
    ],
    facilities: [
      // 枢纽
      { id: 'sy_central_f', n: '中央车站', t: 'rail', lm: 'sy_central', pax: [[2000, 0.6], [2010, 0.8], [2019, 1.1], [2030, 1.3]], note: '城际与长途列车、长途汽车的总站；城铁的换乘客流由背景交通线路承担。' },
      { id: 'sy_townhall_st', n: '市政厅站', t: 'rail', lm: 'sy_townhall', pax: [[2000, 0.15], [2019, 0.25], [2030, 0.3]], note: '城铁的换乘客流由背景交通线路承担，这里只计站旁的少量接驳出行。' },
      { id: 'sy_redfern_f', n: '雷德芬站', t: 'rail', lm: 'sy_redfern', pax: [[2000, 0.15], [2019, 0.25], [2030, 0.3]], note: '城铁的换乘客流由背景交通线路承担，这里只计站旁的少量接驳出行。' },
      { id: 'sy_strathfield_f', n: '斯特拉斯菲尔德站', t: 'rail', lm: 'sy_strathfield', pax: [[2000, 0.15], [2019, 0.25], [2030, 0.3]], note: '城铁的换乘客流由背景交通线路承担，这里只计站旁的少量接驳出行。' },
      { id: 'sy_chatswood_f', n: '查茨伍德站', t: 'rail', lm: 'sy_chatswood', pax: [[2000, 0.15], [2019, 0.25], [2030, 0.3]], note: '城铁的换乘客流由背景交通线路承担，这里只计站旁的少量接驳出行。' },
      { id: 'sy_parramatta_f', n: '帕拉马塔站', t: 'rail', lm: 'sy_parramatta', pax: [[2000, 0.15], [2019, 0.25], [2030, 0.3]], note: '城铁的换乘客流由背景交通线路承担，这里只计站旁的少量接驳出行。' },
      { id: 'sy_ksa', n: '悉尼机场', t: 'air', at: ll(-33.9361, 151.1658), pax: [[2000, 1.7], [2005, 2.1], [2010, 2.5], [2019, 3.0], [2030, 3.6], [2050, 4.2]], note: '金斯福德·史密斯机场，需求点设在国际航站楼。2000 年 5 月起有机场线（城铁）。' },
      { id: 'sy_wsi', n: '西悉尼国际机场（西部接驳）', t: 'air', ext: ['W', 10], at: ll(-33.8800, 150.8455), y0: [2026, 12], pax: [[2026.95, 0.2], [2030, 0.6], [2040, 1.3], [2050, 2.0]], note: '西悉尼国际机场在地图西缘以西约 10 km 的巴杰里溪，计划 2026 年底通航（按设定年份模拟）。此处为霍斯利大道与西部快速路方向出图的接驳点。' },
      // 商务与购物
      { id: 'sy_cbd_f', n: '悉尼中央商务区', t: 'cbd', at: ll(-33.8660, 151.2090), w: [[2000, 0.06], [2020, 0.07]] },
      { id: 'sy_ns_cbd', n: '北悉尼商务区', t: 'cbd', at: ll(-33.8395, 151.2075), w: [[2000, 0.015], [2020, 0.018]] },
      { id: 'sy_parra_cbd', n: '帕拉马塔商务区', t: 'cbd', at: ll(-33.8150, 151.0030), w: [[2000, 0.01], [2015, 0.016], [2030, 0.03]] },
      { id: 'sy_mqp_cbd', n: '麦考瑞公园商务区', t: 'cbd', at: ll(-33.7790, 151.1240), y0: 2002, w: [[2002, 0.006], [2020, 0.02]] },
      { id: 'sy_barangaroo_f', n: '巴兰加鲁商务区', t: 'cbd', at: ll(-33.8640, 151.2015), y0: [2015, 10], w: [[2015.8, 0.008], [2025, 0.02]] },
      { id: 'sy_chatswood_cbd', n: '查茨伍德商务区', t: 'cbd', at: ll(-33.7965, 151.1830), w: [[2000, 0.006], [2020, 0.01]] },
      { id: 'sy_pitt', n: '皮特街购物中心', t: 'shop', at: ll(-33.8698, 151.2083), w: [[2000, 0.05], [2020, 0.05]] },
      { id: 'sy_qvb_f', n: '维多利亚女王大厦', t: 'shop', lm: 'sy_qvb', w: 0.015 },
      { id: 'sy_darling', n: '达令港', t: 'shop', at: ll(-33.8740, 151.2000), p: { sh: 0.3, lz: 0.7 }, w: [[2000, 0.03], [2020, 0.04]] },
      { id: 'sy_bj_shop', n: '邦迪交汇购物中心', t: 'shop', at: ll(-33.8922, 151.2508), w: [[2000, 0.012], [2004, 0.025]] },
      { id: 'sy_chatswood_shop', n: '查茨伍德购物中心', t: 'shop', at: ll(-33.7976, 151.1833), w: 0.025 },
      { id: 'sy_parra_shop', n: '帕拉马塔购物中心', t: 'shop', at: ll(-33.8177, 151.0014), w: 0.03 },
      { id: 'sy_burwood_shop', n: '伯伍德购物中心', t: 'shop', at: ll(-33.8746, 151.1059), w: 0.012 },
      { id: 'sy_hurstville_shop', n: '赫斯特维尔购物中心', t: 'shop', at: ll(-33.9662, 151.1052), w: 0.012 },
      { id: 'sy_bankstown_shop', n: '班克斯敦购物中心', t: 'shop', at: ll(-33.9160, 151.0385), w: 0.015 },
      { id: 'sy_eastgardens', n: '伊斯特加登斯购物中心', t: 'shop', at: ll(-33.9448, 151.2245), w: 0.015 },
      { id: 'sy_mq_shop', n: '麦考瑞购物中心', t: 'shop', at: ll(-33.7770, 151.1200), w: 0.015 },
      { id: 'sy_rhodes_shop', n: '罗兹购物中心', t: 'shop', at: ll(-33.8300, 151.0870), y0: 2005, w: 0.01 },
      { id: 'sy_broadway', n: '百老汇购物中心', t: 'shop', at: ll(-33.8835, 151.1945), w: 0.012 },
      { id: 'sy_hornsby_shop', n: '霍恩斯比购物中心', t: 'shop', at: ll(-33.7041, 151.1006), w: 0.012 },
      // 高校
      { id: 'sy_usyd_f', n: '悉尼大学', t: 'uni', lm: 'sy_usyd', w: [[2000, 0.02], [2020, 0.04]] },
      { id: 'sy_unsw_f', n: '新南威尔士大学', t: 'uni', lm: 'sy_unsw', w: [[2000, 0.02], [2020, 0.04]] },
      { id: 'sy_uts', n: '悉尼科技大学', t: 'uni', at: ll(-33.8824, 151.2001), w: [[2000, 0.012], [2020, 0.03]] },
      { id: 'sy_mq_f', n: '麦考瑞大学', t: 'uni', lm: 'sy_mq', w: [[2000, 0.012], [2020, 0.03]] },
      { id: 'sy_wsu', n: '西悉尼大学（帕拉马塔）', t: 'uni', at: ll(-33.8100, 151.0290), w: [[2000, 0.004], [2020, 0.01]] },
      // 医院
      { id: 'sy_rpa', n: '皇家阿尔弗雷德王子医院', t: 'hosp', at: ll(-33.8892, 151.1815), w: 0.015 },
      { id: 'sy_stv', n: '圣文森特医院', t: 'hosp', at: ll(-33.8800, 151.2210), w: 0.01 },
      { id: 'sy_pow', n: '威尔士亲王医院', t: 'hosp', at: ll(-33.9190, 151.2390), w: 0.012 },
      { id: 'sy_rnsh', n: '皇家北岸医院', t: 'hosp', at: ll(-33.8215, 151.1905), w: 0.012 },
      { id: 'sy_westmead', n: '韦斯特米德医院', t: 'hosp', at: ll(-33.8030, 150.9870), w: 0.015 },
      { id: 'sy_concord', n: '康科德医院', t: 'hosp', at: ll(-33.8370, 151.0930), w: 0.008 },
      { id: 'sy_stgeorge', n: '圣乔治医院', t: 'hosp', at: ll(-33.9670, 151.1340), w: 0.008 },
      // 体育与活动
      { id: 'sy_scg_f', n: '悉尼板球场', t: 'stadium', lm: 'sy_scg', w: 0.02 },
      { id: 'sy_stadium_f', n: '澳大利亚体育场', t: 'stadium', lm: 'sy_stadium', w: 0.02 },
      { id: 'sy_olympics', n: '2000 年奥运会场', t: 'venue', at: ll(-33.8475, 151.0680), y0: [2000, 9], y1: [2000, 10], w: 0.15, note: '2000 年 9 月 15 日至 10 月 1 日的奥运会，主场馆在霍姆布什湾（史实）。' },
      { id: 'sy_expo', n: '悉尼会展中心', t: 'venue', at: ll(-33.8746, 151.1985), w: 0.02 },
      // 景点与公园
      { id: 'sy_opera_f', n: '悉尼歌剧院', t: 'scenic', lm: 'sy_opera', p: { lz: 1 }, w: [[2000, 0.025], [2020, 0.03]] },
      { id: 'sy_taronga', n: '塔龙加动物园', t: 'scenic', at: ll(-33.8434, 151.2412), w: 0.012 },
      { id: 'sy_rocks', n: '岩石区', t: 'scenic', at: ll(-33.8590, 151.2085), w: 0.015 },
      { id: 'sy_bondi_beach', n: '邦迪海滩', t: 'scenic', at: ll(-33.8915, 151.2767), we: 2, w: [[2000, 0.02], [2020, 0.03]] },
      { id: 'sy_manly_beach', n: '曼利海滩', t: 'scenic', at: ll(-33.7972, 151.2878), we: 2, w: 0.015 },
      { id: 'sy_coogee', n: '库吉海滩', t: 'scenic', at: ll(-33.9206, 151.2575), we: 2, w: 0.008, noModel: true },
      { id: 'sy_lunapark_f', n: '月神公园', t: 'scenic', lm: 'sy_lunapark', w: 0.008 },
      { id: 'sy_botanic_f', n: '皇家植物园', t: 'park', at: ll(-33.8642, 151.2166), w: 0.02 },
      { id: 'sy_centennial_f', n: '百年纪念公园', t: 'park', at: ll(-33.8980, 151.2340), w: 0.02 },
      { id: 'sy_parrapark_f', n: '帕拉马塔公园', t: 'park', at: ll(-33.8125, 150.9980), w: 0.008 },
      { id: 'sy_bicentennial_f', n: '两百周年纪念公园', t: 'park', at: ll(-33.8470, 151.0780), w: 0.006 },
    ],
    districtLabels: [['悉尼市', ['悉尼市']], ['北悉尼', ['北悉尼区']], ['帕拉马塔', ['帕拉马塔区']], ['内西区', ['内西区']], ['兰德威克', ['兰德威克区']], ['赖德', ['赖德区']], ['威洛比', ['威洛比区']], ['坎特伯雷–班克斯敦', ['坎特伯雷–班克斯敦区']], ['乔治斯河', ['乔治斯河区']], ['北部海滩', ['北部海滩区']], ['库灵盖', ['库灵盖区']]],
    events: [
      { y: 2000, m: 1, tag: '史实', title: '2000 年的悉尼', desc: '城市正在为奥运会做最后的准备。城铁和渡轮早已铺满城市，悉尼却还没有一条地铁，第一条线由你来修。' },
      { y: 2000, m: 5, tag: '史实', title: '机场线通车', desc: '城铁的机场线经格林广场、马斯科特通到国内和国际航站楼，由私营公司投资建设，机场车站另收附加费。' },
      { y: 2000, m: 9, tag: '史实', title: '悉尼奥运会开幕', desc: '奥运会在霍姆布什湾开幕，十几天里数百万人次往返奥林匹克公园，城铁的奥林匹克公园支线满负荷运转。' },
      { y: 2000, m: 10, tag: '史实', title: '残奥会举行', desc: '残奥会在奥林匹克公园举行，之后场馆进入漫长的赛后利用阶段。' },
      { y: 2005, m: 6, tag: '史实', title: '史实背景：都市铁路扩建计划', desc: '州政府宣布修建西北铁路、西南铁路和中央商务区铁路，计划之后几经调整。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 2005, m: 8, tag: '史实', title: '过城隧道通车', desc: '东西向的过城隧道从达令港通到国王十字，开车穿过市中心不必再走地面街道。' },
      { y: 2005, m: 12, tag: '史实', title: '大都市战略《城市之城》', desc: '新的大都市战略提出多中心发展，帕拉马塔、查茨伍德、麦考瑞公园等区域中心要分担市中心的就业。' },
      { y: 2007, m: 3, tag: '史实', title: '莱恩湾隧道通车', desc: '连接 M2 和北悉尼的隧道通车，北岸西部的通勤车流增加。' },
      { y: 2008, m: 10, tag: '史实', title: '宣布修建中央商务区地铁', desc: '州政府宣布修建从罗泽尔经中央商务区的地铁，2010 年计划取消。本局的地铁由你规划。' },
      { y: 2009, m: 2, tag: '史实', title: '埃平–查茨伍德铁路通车', desc: '穿过麦考瑞公园的地下铁路通车，北岸和北部线之间第一次有了直接的铁路连接。' },
      { y: 2012, m: 6, tag: '史实', title: '史实背景：《悉尼铁路未来》', desc: '交通规划提出单层车厢、高频率的快速地铁，以及第二条过港铁路。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 2013, m: 9, tag: '史实', title: '西北铁路动工', desc: '连接山区郡和查茨伍德的西北铁路开始施工。' },
      { y: 2015, m: 6, tag: '史实', title: '城区与西南地铁获批', desc: '第二条过港铁路以全自动地铁的方式建设，从查茨伍德穿过悉尼港到锡德纳姆，再改造班克斯敦线。' },
      { y: 2016, m: 12, tag: '史实', title: '悉尼国际会议中心启用', desc: '达令港的新会展中心落成，取代 1988 年的旧会展中心。', task: { id: 'sy-e1', type: 'facShare', fac: 'sy_darling', target: 0.12, months: 36, rewardMonths: 1, title: '达令港的会展客流', desc: '国际会议中心在达令港重建启用，展会和演出接连不断。让到达令港的人里有 12% 坐地铁。' } },
      { y: 2018, m: 3, tag: '史实', title: '区域规划《三城之都》', desc: '大悉尼委员会把悉尼规划成三座城市：东部港城、中部河城和西部园城，帕拉马塔是中部河城的中心。' },
      { y: 2018, m: 9, tag: '史实', title: '埃平–查茨伍德铁路停运改造', desc: '埃平到查茨伍德的铁路停运，改造成全自动地铁的一部分，期间由公交接驳。' },
      { y: 2019, m: 5, tag: '史实', title: '史实背景：西北地铁通车', desc: '澳大利亚第一条全自动地铁从塔隆旺通到查茨伍德。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 2019, m: 12, tag: '史实', title: '中央商务区与东南轻轨通车', desc: '轻轨沿乔治街从环形码头通到兰德威克，乔治街中段改为步行街。' },
      { y: 2020, m: 1, tag: '史实', title: '卡灵福德线停运', desc: '克莱德到卡灵福德的支线停运，改建为帕拉马塔轻轨。' },
      { y: 2020, m: 3, tag: '史实', title: '新冠疫情', desc: '边境关闭、居家办公，公共交通客流一度下降七成以上。', fx: { demand: { sc: 0.6, sh: 0.7, lz: 0.6, months: 4, fade: 1 } } },
      { y: 2024, m: 8, tag: '史实', title: '史实背景：地铁穿过悉尼港', desc: '城区段从查茨伍德穿过悉尼港通到锡德纳姆。本局的地铁由你规划，真实线路不会自动出现。' },
      { y: 2024, m: 9, tag: '史实', title: '锡德纳姆–班克斯敦段停运改造', desc: '班克斯敦线的锡德纳姆到班克斯敦段停运，改造成地铁，期间由公交接驳。' },
      { y: 2026, m: 12, tag: '模拟', title: '西悉尼国际机场通航（按设定）', desc: '西悉尼国际机场按设定年份通航，地图西缘的接驳口开始产生往返机场的出行。' },
    ],
    histTasks: [
      { id: 'sy01', appear: [2000, 1], deadline: [2009, 12], type: 'connect', reward: 60000, title: '跨过悉尼港', desc: '海港大桥上的铁路早已饱和。修一条过港线：连接市政厅、北悉尼与查茨伍德。', anchors: [anchor('市政厅', -33.8732, 151.2070, 3), anchor('北悉尼', -33.8406, 151.2071, 3), anchor('查茨伍德', -33.7969, 151.1806, 3)] },
      { id: 'sy02', appear: [2000, 6], deadline: [2010, 12], type: 'connect', reward: 60000, title: '奥运遗产：奥林匹克公园', desc: '奥运结束后，场馆要有日常的客流。连接奥林匹克公园、罗兹与斯特拉斯菲尔德。', anchors: [anchor('奥林匹克公园', -33.8471, 151.0688, 3), anchor('罗兹', -33.8306, 151.0875, 3), anchor('斯特拉斯菲尔德', -33.8718, 151.0941, 3)] },
      { id: 'sy03', appear: [2002, 1], deadline: [2010, 12], type: 'coverage', target: 0.1, reward: 50000, title: '地铁覆盖一成人口', desc: '2010 年前，步行 15 分钟可到达地铁站的人口不低于全图人口的 10%。' },
      { id: 'sy04', appear: [2003, 1], deadline: [2012, 12], type: 'connect', reward: 70000, title: '帕拉马塔到埃平', desc: '2000 年代初曾规划帕拉马塔到埃平的铁路，2008 年被搁置。连接帕拉马塔、卡灵福德、埃平与麦考瑞公园。', anchors: [anchor('帕拉马塔', -33.8173, 151.0049, 3), anchor('卡灵福德', -33.7820, 151.0480, 3), anchor('埃平', -33.7727, 151.0820, 3), anchor('麦考瑞公园', -33.7787, 151.1242, 3)] },
      { id: 'sy05', appear: [2004, 1], deadline: [2014, 12], type: 'connect', reward: 70000, title: '格林广场与马斯科特', desc: '格林广场的旧厂区变成住宅区，马斯科特的写字楼越来越多。连接中央、格林广场、马斯科特与伊斯特加登斯。', anchors: [anchor('中央', -33.8830, 151.2067, 3), anchor('格林广场', -33.9055, 151.2025, 3), anchor('马斯科特', -33.9213, 151.1876, 3), anchor('伊斯特加登斯', -33.9475, 151.2265, 3)] },
      { id: 'sy06', appear: [2006, 1], deadline: [2016, 12], type: 'connect', reward: 70000, title: '通往北部海滩', desc: '北部海滩没有铁路，大批通勤者每天坐公交过斯皮特桥。连接北悉尼、中立湾路口、斯皮特路口与布鲁克维尔。', anchors: [anchor('北悉尼', -33.8406, 151.2071, 3), anchor('中立湾路口', -33.8320, 151.2190, 3), anchor('斯皮特路口', -33.8233, 151.2428, 3), anchor('布鲁克维尔', -33.7673, 151.2730, 3)] },
      { id: 'sy07', appear: [2009, 1], deadline: [2018, 12], type: 'connect', reward: 70000, title: '巴兰加鲁接入线网', desc: '旧码头改建成新的商务区。连接巴兰加鲁、温亚德与马丁广场。', anchors: [anchor('巴兰加鲁', -33.8622, 151.2018, 3), anchor('温亚德', -33.8657, 151.2061, 3), anchor('马丁广场', -33.8678, 151.2110, 3)] },
      { id: 'sy08', appear: [2010, 1], deadline: [2020, 12], type: 'coverage', target: 0.19, reward: 70000, title: '覆盖一成九人口', desc: '2020 年前，步行 15 分钟可到达地铁站的人口不低于全图人口的 19%。' },
      { id: 'sy09', appear: [2012, 1], deadline: [2022, 12], type: 'connect', reward: 80000, title: '西北走廊', desc: '西北部的山区郡人口快速增长，却一直没有铁路。连接诺韦斯特、城堡山、埃平与查茨伍德。', anchors: [anchor('诺韦斯特', -33.7323, 150.9604, 3), anchor('城堡山', -33.7319, 151.0046, 3), anchor('埃平', -33.7727, 151.0820, 3), anchor('查茨伍德', -33.7969, 151.1806, 3)] },
      { id: 'sy10', appear: [2014, 1], deadline: [2024, 12], type: 'connect', reward: 80000, title: '东南部的大学与医院', desc: '兰德威克的大学和医院人流很大，却没有铁路。连接中央、兰德威克与马鲁布拉。', anchors: [anchor('中央', -33.8830, 151.2067, 3), anchor('兰德威克', -33.9145, 151.2414, 3), anchor('马鲁布拉', -33.9406, 151.2386, 3)] },
      { id: 'sy11', appear: [2015, 1], deadline: [2026, 12], type: 'connect', reward: 80000, title: '第二条过港通道', desc: '海港大桥上的铁路已经运不动了。再修一条过港线：连接维多利亚十字、巴兰加鲁、马丁广场与滑铁卢。', anchors: [anchor('维多利亚十字', -33.8395, 151.2064, 3), anchor('巴兰加鲁', -33.8622, 151.2018, 3), anchor('马丁广场', -33.8678, 151.2110, 3), anchor('滑铁卢', -33.8986, 151.2068, 3)] },
      { id: 'sy12', appear: [2018, 1], deadline: [2030, 12], type: 'connect', reward: 90000, title: '接上西悉尼机场', desc: '西悉尼国际机场计划 2026 年底通航。修到地图西缘的接驳口，再和费尔菲尔德、帕拉马塔接到同一张线网。', anchors: [anchor('西悉尼机场接驳口', -33.8800, 150.8455, 1.2), anchor('费尔菲尔德', -33.8722, 150.9558, 3), anchor('帕拉马塔', -33.8173, 151.0049, 3)] },
      // v2.9 扩图新增范围的史实任务
      { id: 'sy13', appear: [2008, 1], deadline: [2025, 12], type: 'connect', reward: 70000, title: '西部的黑镇与利物浦', desc: '西部郊区是悉尼人口增长最快的地方。把黑镇、帕拉马塔与利物浦接进同一张线网。', anchors: [anchor('黑镇', -33.7688, 150.9053, 3), anchor('帕拉马塔', -33.8173, 151.0049, 3), anchor('利物浦', -33.9206, 150.9230, 3)] },
    ],
    dynTasks: [
      { id: 'syd1', from: [2001, 1], to: [2012, 12], type: 'connect', months: 36, reward: 40000, title: '内西区进城', desc: '莱卡特和罗泽尔没有铁路，维多利亚路的公交天天拥堵。连接莱卡特、罗泽尔与皮尔蒙特。', anchors: [anchor('莱卡特', -33.8820, 151.1563, 3), anchor('罗泽尔', -33.8616, 151.1708, 3), anchor('皮尔蒙特', -33.8697, 151.1949, 3)] },
      { id: 'syd2', from: [2004, 1], to: [2016, 12], type: 'connect', months: 36, reward: 40000, title: '维多利亚路走廊', desc: '赖德和格莱兹维尔的居民进城只能坐公交。连接赖德、格莱兹维尔与巴尔曼。', anchors: [anchor('赖德', -33.8131, 151.1075, 3), anchor('格莱兹维尔', -33.8320, 151.1270, 3), anchor('巴尔曼', -33.8593, 151.1797, 3)] },
      { id: 'syd3', from: [2008, 1], to: [2020, 12], type: 'connect', months: 36, reward: 40000, title: '麦考瑞大学', desc: '麦考瑞大学和周边的写字楼人流很大。连接麦考瑞大学、麦考瑞公园与查茨伍德。', anchors: [anchor('麦考瑞大学', -33.7754, 151.1137, 3), anchor('麦考瑞公园', -33.7787, 151.1242, 3), anchor('查茨伍德', -33.7969, 151.1806, 3)] },
      { id: 'syd4', from: [2012, 1], to: [2026, 12], type: 'connect', months: 36, reward: 40000, title: '西部的跨区通勤', desc: '韦斯特米德的医院和奥林匹克公园的写字楼都在扩张。连接韦斯特米德、帕拉马塔与奥林匹克公园。', anchors: [anchor('韦斯特米德', -33.8077, 150.9875, 3), anchor('帕拉马塔', -33.8173, 151.0049, 3), anchor('奥林匹克公园', -33.8471, 151.0688, 3)] },
      { id: 'syd5', from: [2016, 1], to: [2030, 12], type: 'connect', months: 36, reward: 40000, title: '不进城的南北联系', desc: '南部郊区之间的出行要绕道市中心换乘。连接赫斯特维尔、坎普西与伯伍德。', anchors: [anchor('赫斯特维尔', -33.9675, 151.1024, 3), anchor('坎普西', -33.9107, 151.1029, 3), anchor('伯伍德', -33.8771, 151.1035, 3)] },
    ],
    taskNote: '历史主题任务参考悉尼 2000 年起的发展需求（过港、奥运遗产、多中心、北部海滩、巴兰加鲁、西北走廊、第二过港与西悉尼机场），不要求按真实线路建设，只需满足目标描述。',
    scenarios: [
      { id: 'sy-sc1', theme: '悉尼：渡轮还是地铁', title: '把北部海滩接进线网', type: 'regionCov', from: [2005, 1], to: [2025, 12], months: 120, rewardMonths: 4,
        regions: ['manly', 'warringah'], areaName: '曼利与北部海滩', target: 0.3,
        desc: '北部海滩只有渡轮和公交，过斯皮特桥的车流天天拥堵。让这里三成的居民步行就能到地铁站。',
        tips: ['过中港要修隧道或桥梁，选窄的地方过', '曼利的渡轮很快，地铁要更直接才争得到乘客', '布鲁克维尔和迪怀的人口最多'] },
      { id: 'sy-sc2', theme: '悉尼：西北快线', title: '用有限的预算修西北快线', type: 'budgetConnect', from: [2010, 1], to: [2026, 12], months: 96, rewardMonths: 5, budgetX: 1.3,
        anchors: [anchor('城堡山', -33.7319, 151.0046, 3), anchor('埃平', -33.7727, 151.0820, 3), anchor('查茨伍德', -33.7969, 151.1806, 3)],
        desc: '西北部的人口越来越多，却只能开车或坐公交去埃平换乘。用有限的预算修一条快线，把城堡山接到查茨伍德。',
        tips: ['砂岩地层适合打隧道，但车站很贵', '在埃平和北部线换乘', '城堡山以西走高架可以省钱'] },
    ],
    dataNote: [
      ['真实地理', 'hist', '水系、海岸线、道路与桥隧、铁路、公园、地方政府区与郊区边界、地名来自 OpenStreetMap（© OpenStreetMap 贡献者，ODbL），为现代数据，按 250 m 网格投影；英文地名按中文译名表转为简体中文，无中文译名的对象不显示名称；军事用地范围内的地名、绿地名称与小路已剔除。'],
      ['史实参考', 'hist', '铁路与渡轮线路的走向、开通与停运年月，机场线、奥运会、大都市战略与重大事件，地标落成年份（只作史实背景）。'],
      ['估算', 'est', '2000 年人口与就业分布、人口增长曲线、物价指数、拨款、造价、票价、运营费用，铁路与渡轮的班次、速度和票价，地图范围 GDP。'],
      ['模拟', 'sim', '2020 年之后的发展、居民出行选择、道路拥堵、客流与财政结果。铁路和渡轮不归玩家经营，只按线路与车站分走沿线出行；西悉尼国际机场按设定年份通航；真实的悉尼地铁不会自动出现。'],
      ['', '', '模拟结果不得作为真实悉尼交通规划预测。'],
    ],
    lineColorsNice: ['#e2231a', '#0072bc', '#00a651', '#f7941d', '#8e44ad', '#00a8b5', '#c7a000', '#d6336c', '#5c6bc0', '#7a5230', '#2e7d32', '#ef6c00'],
  };
  data.places = (G.places || []).map(function (p) { return [p[0], p[1], p[2], p[3]]; });
  // 车站坐标以 OSM 为准：任务锚点对齐到最近的同名车站（3 km 以内）
  const ST = {}; for (const p of data.places) if (p[3] <= 1 && !ST[p[0]]) ST[p[0]] = p;
  const nearSt = function (name, x, y) { const p = ST[name.replace(/（.*?）/g, '')]; return p && Math.hypot(p[1] - x, p[2] - y) < 12 ? p : null; };
  for (const t of data.histTasks.concat(data.dynTasks, data.scenarios)) for (const a of t.anchors || []) { const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }
  for (const er of data.eras) for (const gl of er.goals || []) for (const a of gl.anchors || []) { const p = nearSt(a.name, a.x, a.y); if (p) { a.x = p[1]; a.y = p[2]; } }
  for (const lm of data.landmarks) lm.real = true;

  (CM.MAP_LIST = CM.MAP_LIST || []).push({
    id: 'sy', name: '悉尼', title: '悉尼 · 2000', sub: '真实地理 · 2000 年起 · 澳元 · 修悉尼的第一条地铁',
    desc: '从奥运之年的悉尼开始：城铁和渡轮早已铺满城市，却还没有一条地铁。跨过悉尼港，找到铁路照顾不到的走廊，赶上帕拉马塔、麦考瑞公园、格林广场和巴兰加鲁的成长。',
    facts: [['范围', '45 km × 41 km'], ['起始', '2000 年'], ['人口', '约 282 万'], ['货币', '澳元'], ['模式', '经营挑战 / 自由建造']],
    modes: ['challenge', 'free'], kind: 'real', mapVersion: 2, extent: [{ from: 1, dx: 40, dy: 4, oldW: 132, oldH: 136, newW: 180, newH: 164, note: '地图向西扩大到黑镇与利物浦，向南扩大到萨瑟兰与克罗努拉，西悉尼机场接驳点移到新的西缘，旧存档接到原接驳点的线路需要再向西延伸', oldRegionIds: ['harbournp', 'lanecovenp', 'garigal', 'centennial', 'parrapark', 'bicentennial', 'sy_air', 'bankstown_ad', 'holsworthy', 'rookwood', 'cbd', 'barangaroo', 'pyrmont', 'surry', 'redfern', 'glebe', 'paddington', 'balmain', 'northsydney', 'neutralbay', 'greensq', 'bondi', 'randwick', 'marrickville', 'olympic', 'mascot', 'maroubra', 'portbotany', 'chatswood', 'lanecove', 'northbridge', 'drummoyne', 'ashfield', 'rockdale', 'canterbury', 'rhodes', 'wentworthpt', 'ryde', 'macquarie', 'stgeorge', 'parramatta', 'auburn', 'manly', 'epping', 'uppernorth', 'bankstown', 'hornsby', 'merrylands', 'warringah', 'hills', 'fairfield', 'easthills', 'outer'], oldLandmarkIds: ['sy_opera', 'sy_bridge', 'sy_tower', 'sy_qvb', 'sy_townhall', 'sy_stmarys', 'sy_central', 'sy_redfern', 'sy_strathfield', 'sy_chatswood', 'sy_parramatta', 'sy_lunapark', 'sy_ausq', 'sy_chifley', 'sy_crown', 'sy_itb', 'sy_anzac', 'sy_denison', 'sy_stadium', 'sy_scg', 'sy_bondipav', 'sy_ogh', 'sy_icc', 'sy_usyd', 'sy_unsw', 'sy_mq'] }], scenario: 'sy-2000',
    region: '澳大利亚', tagline: '跨过海港，找到铁路照顾不到的走廊', difficulty: 3, tags: ['无地铁开局', '跨港工程', '铁路竞争'],
    intro: '2000 年的悉尼正在迎接奥运会。放射状的城铁覆盖了大部分郊区，渡轮从环形码头开往港湾各处，悉尼却还没有一条地铁。铁路沿线的居民本来就有不错的选择，你要找到它们照顾不到的走廊：跨过悉尼港，接上北部海滩和内西区，再赶在帕拉马塔、麦考瑞公园、格林广场和巴兰加鲁成长之前把线修过去。西悉尼国际机场会在 2026 年底通航。',
    features: [['map', '多中心与滨水更新', '帕拉马塔、麦考瑞公园、格林广场和巴兰加鲁按年代成长，提前修到这些地方能得到长期的发展收益'], ['plane', '两座机场', '金斯福德·史密斯机场在图内，可以修地下车站；西悉尼国际机场在图外，2026 年底通航后要修到西缘的接驳口'], ['train', '现代地铁规划浪潮', '西北铁路、第二条过港铁路等规划按年代出现，真实的地铁不会自动建成']],
    highlights: [[2000, '机场线通车、悉尼奥运会'], [2005, '大都市战略《城市之城》'], [2009, '埃平–查茨伍德铁路通车'], [2012, '《悉尼铁路未来》'], [2018, '《三城之都》'], [2019, '西北地铁通车'], [2024, '地铁穿过悉尼港'], [2026, '西悉尼国际机场通航（按设定）']],
    geo: G, data: data,
    econ: { devOffset: 28, money: 0.25 },   // 出行选择参数：悉尼 2000 年约对应广州样本 2028 年的发展阶段；时间价值等按澳元换算
    cfg: {
      W: 180, H: 164, START: { y: 2000, m: 1, d: 1, minute: 360 },
      workWeek: { sat: [[2000, 0.12], [2020, 0.1]], school: [[2000, 0]] },
      growth: Object.assign({}, CM.CFG.growth, { popCurve: [[2000, 2.81e6], [2005, 2.91e6], [2010, 3.2e6], [2015, 3.63e6], [2020, 4.03e6], [2030, 4.54e6], [2050, 5.25e6], [2300, 5.63e6]], histEnd: 2020, jobsRatio: [[2000, 0.539], [2005, 0.553], [2010, 0.568], [2015, 0.59], [2020, 0.612], [2040, 0.623]] }),
      money: { code: 'AUD', unit: '澳元', wan: '万澳元', yi: '亿澳元', sym: 'A$' },
      econBase: 2000,
      cost: Object.assign({}, CM.CFG.cost, {
        trackPerKm: { underground: 5500, surface: 1100, elevated: 2200 },   // 估算：2000 年价格，机场线约 7 亿澳元、10 km（含 4 座车站）
        riverPerKm: { underground: 7000, surface: 6000, elevated: 6000 },   // 过港隧道与桥梁附加
        hillPerKm: 2500, protectedPerKm: 2000,
        station: { underground: { S: 6000, M: 9000, L: 14000 }, elevated: { S: 3000, M: 4800, L: 7500 }, surface: { S: 1800, M: 3000, L: 4500 } },
        demolishPerCell: 20000,
        inflation: [[2000, 0.045], [2004, 0.05], [2008, 0.06], [2010, 0.04], [2015, 0.045], [2020, 0.035]],
      }),
      ops: Object.assign({}, CM.CFG.ops, { carKmCost: 0.0007, stationDaily: { S: 0.7, M: 1.2, L: 2.0 }, inflation: [[2000, 0.03], [2010, 0.03], [2020, 0.025]] }),
      // 道路通行能力（估算）：悉尼的道路网在 2000 年前已基本定型，之后主要靠快速路隧道小幅扩容，高峰拥堵逐年加重
      road: Object.assign({}, CM.CFG.road, { capGrowth: [[2000, 1.4], [2010, 1.45], [2020, 1.5], [2040, 1.6]] }),
      fareDefault: { mode: 'flat', flat: 2.2 }, fareRange: { min: 0, max: 12, step: 0.1, scale: true },
      economy: Object.assign({}, CM.CFG.economy, { startFunds: 130000, grantBase: [[2000, 6500], [2005, 8000], [2010, 11000], [2015, 16000], [2020, 22000], [2030, 30000], [2050, 45000]], debtLimit: -90000, rewardScale: 0.43 }),
      // 城市经济（macro.js）：2000 年地图范围 GDP 约 1,360 亿澳元（估算，约为悉尼都会区的八成）；金融、专业服务和旅游比重高
      macro: {
        area: '地图范围（悉尼都市区）', region: '澳大利亚',
        gdp0: 15500000, revRatio: [[2000, 0.08], [2020, 0.09], [2040, 0.09]], revElastic: 1.2,
        prod: [[2000, 0.022], [2010, 0.018], [2020, 0.012], [2050, 0.012]],
        infl: CPI, longRun: { infl: 0.025 }, histEnd: 2020,
        struct: { trade: 0.6, fin: 0.85, ind: 0.35, tour: 0.6, prop: 0.75 },
        events: [
          { id: 'dotcom2001', y: 2001, m: 3, scale: 0.6 },
          { id: 'gfc2008', y: 2008, m: 9, scale: 0.6, desc: '全球金融危机冲击悉尼的金融业，澳大利亚靠财政刺激和资源出口避免了衰退。' },
          { id: 'covid2020', y: 2020, m: 3, scale: 1 },
        ],
      },
    },
    cam: { cx: 120, cy: 70, zoom: 16 },
  });
})(window.CM);
