# 北京地图社区版

此 fork 在原版基础上新增北京（`bj` / `bj-1990`），保留原作者 VinsonFung、[原版游戏](https://city-and-metro.pages.dev)、[原始仓库](https://github.com/VinsonFung/city-and-metro)及原有许可。地图支持经营挑战、自由建造、自定义起年、全图解锁以及原有 JSON 存档。

打开仓库根目录 `index.html`，选择「开始游戏 → 北京」即可游玩；无需安装依赖。原作者在线游戏不包含此 fork 新增的地图。

## 场景边界

- 默认 1990 年，空白路网。**现实中 1990 年北京已拥有地铁**，本场景允许玩家重新规划，既有线路不预建。
- 地图 192 × 164 格，每格 250 m，约 48 × 41 km。范围包含中心城区、石景山、中关村、回龙观与天通苑、望京、通州西部、亦庄及首都机场，不代表整个北京市行政区域。
- 大兴机场在地图南边界外约 28 km，从 2019 年 9 月启用边界接驳。新北京南站从 2008 年 8 月产生高铁接驳需求，未单独建模改造前的旧南站。
- 13 处地标使用现有游戏通用模型，25 项设施及 7 项主线任务服务交通规划。片区以游戏用近似多边形划分，不宣称是行政边界。
- 道路、水面、公园、铁路和地名采用现代 OSM 数据。道路开放按片区年代近似处理，不是历史路网的逐年复原。人口、就业、客流、建设费用与经济曲线均为范围内的游戏估算；2021 年之后为模型推演。

## 数据与复现

`js/geo_bj.js` 是离线地理数据库，按 ODbL 1.0 提供，署名 © OpenStreetMap contributors。`js/data_bj.js` 提供北京场景配置。所有坐标均为 WGS-84，经纬度不再做 GCJ-02 偏移。

投影：`x = (lon - 116.12) × 341.6`，`y = (40.13 - lat) × 444.1`。以北京纬度附近的等距近似投影到 250 m 格网，编码精度为 1/64 格。

重建时需要 Node.js 和网络；正常游玩不需要网络：

```sh
node scripts/build-beijing-geo.mjs --download
node scripts/build-beijing-geo.mjs
node scripts/test-beijing.mjs
node scripts/build.mjs
node scripts/verify-game.mjs --dist
```

首条命令下载缺少的公开 Overpass 响应，缓存在 `.tools/beijing-osm/`（已忽略），第二条从缓存重建。需更新提取数据时，先移走该缓存目录。生成文件的 `source` 包含查询、范围、OSM 数据时间与原始响应 SHA-256；相同缓存生成相同结果。生成过程只保留道路、非地铁铁路、地表水、绿地与地名；合并多多边形成员并保留岛屿内环，排除重复的成员面。

完整项目回归：`node scripts/test-map-migrations.mjs`、`node scripts/test-v22.mjs`、`node scripts/test-web-sync.mjs`。

## 历史参考

- [北京市政府：地铁线路织传奇](https://www.beijing.gov.cn/ywdt/gzdt/202410/t20241005_3911383.html)：1969 年一期建成、1984 年二期投入运营，说明本场景的空白路网属于玩法设定。
- [北京市政府：北京西站地区管理委员会通知](https://www.beijing.gov.cn/zhengce/zfwj/zfwj/bgtwj/201905/t20190523_74493.html)：北京西站 1996 年 1 月 21 日运营。
- [北京市科委、中关村管委会：中关村示范区](https://kw.beijing.gov.cn/ztzl/rdzt/zgcsfq/index.html)：1999 年 6 月国务院批复建设中关村科技园区。
- [北京市政府：北京地铁发展见证双奥之城跃迁](https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202202/t20220208_2605896.html)：2008 年奥运交通背景。
- [北京市重点站区管委会：北京南站历史沿革](https://zdzqgw.beijing.gov.cn/zqfw/bjnzdq/bjnzzqjs/202008/t20200821_1988380.html)：新北京南站 2008 年 8 月 1 日启用。
- [中国民航局：北京大兴国际机场正式通航](https://www.caac.gov.cn/XWZX/MHYW/201909/t20190926_198820.html)：2019 年 9 月 25 日通航。

地图数据说明：[OpenStreetMap 版权及许可](https://www.openstreetmap.org/copyright)、[Overpass QL 文档](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)。
