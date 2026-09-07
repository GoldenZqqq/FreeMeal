# FreeMeal Dashboard（免费试 PASS 定制面板）

一个本地网页，基于 FreeMeal 已经验证的大众点评官方 H5 接口，把「免费试」活动按你想要的品类组合拉出来，默认隐藏「美食」，方便你的「变美玩乐 PASS 卡」抢名额。

## 它做了什么

- 调用大众点评官方接口：
  - 列表：`POST https://m.dianping.com/activity/static/pc/ajaxList`
  - 详情：`POST https://m.dianping.com/bwc/customer/bwcDetailPackage`
- 一次抓取全部分类（美食、变美、美妆、健康亲子、玩乐休闲、教育培训、生活服务、汽车、宠物、医疗健康等）
- 读取每个活动的 PASS 总名额 / 剩余名额、报名人数、关注数、报名截止时间等
- 网页端做筛选、排序、自动刷新；只在本地跑，Cookie 不会发给页面，也不会上传第三方

## 为什么能解决你的问题

大众点评 App 的 PASS 卡筛选一次只能选一个品类；你的是「变美玩乐 PASS 卡」，想排除「美食」看所有可兑活动时 App 做不到。

这个面板默认只勾选非美食分类，并且默认按「PASS 剩余少 → 多」排序，把最紧张的先排在最前面；也可以自定义勾选任何分类、关键词、只看报名中、隐藏已报名等。

## 运行

```bash
cd FreeMeal/dashboard

# Windows PowerShell（把 Cookie 换成你的登录态 Cookie）
$env:DIANPING_CITY_ID="1"
$env:DIANPING_CITY_NAME="上海"
$env:DIANPING_COOKIE="你的大众点评 Cookie"

node server.mjs
```

然后浏览器打开：

```
http://127.0.0.1:8787
```

> 如果不设置 `DIANPING_COOKIE`，公开接口仍可拉取列表和大部分详情；但带上登录态更接近 App 内看到的报名状态。

## 可配置环境变量

| 变量 | 默认 |说明 |
|---|---|---|
| `PORT` | `8787` | 面板端口 |
| `DIANPING_CITY_ID` | `1` | 城市 ID，上海 1 |
| `DIANPING_CITY_NAME` | `上海` | 页面显示的城市名 |
| `DIANPING_COOKIE` | 空 | 大众点评登录 Cookie；只存在本机内存中 |
| `FREEMEAL_DASH_EXCLUDE_TYPES` | `1` | 默认不勾选的品类；`1` 是美食 |
| `FREEMEAL_DASH_INCLUDE_TYPES` | 空 | 只抓取这些品类（逗号分隔）；为空则抓全部分类 |
| `FREEMEAL_DASH_REFRESH_MS` | `60000` | 列表自动刷新间隔（毫秒） |
| `FREEMEAL_DASH_DETAIL_REFRESH_MS` | `120000` | 详情（PASS 剩余数）自动刷新间隔（毫秒） |
| `FREEMEAL_DASH_CONCURRENCY` | `4` | 抓详情并发数，风控敏感可以调低 |
| `FREEMEAL_DASH_MAX_PAGES` | `20` | 每个品类最多翻页数 |

## 品类编号参考

| type | 品类 |
|---|---|---|
| 1 | 美食 |
| 2 | 变美 |
| 3 | 美妆 |
| 4 |健康亲子 |
| 6 |玩乐休闲 |
| 8 |教育培训 |
| 10 |生活服务 |
| 17 |汽车服务 |
| 18 |宠物 |
| 19 |医疗健康 |

## 部署到 GitHub Pages（静态模式）

仓库里已经带了 `.github/workflows/dashboard-pages.yml`：

1. 推送后，GitHub Actions 会跑一次 `dashboard/update-data.mjs`，把上海免费试数据生成到 `dashboard/public/data.json`，再部署到 GitHub Pages。
2. 如果你的登录态 Cookie 不想公开，在 GitHub 仓库 Settings → Secrets and variables → Actions 里加一个名为 `DIANPING_COOKIE` 的 Secret；没加也能跑，只是不带登录态。
3. 在 GitHub 仓库 Settings → Pages → Build and deployment 里选 **GitHub Actions** 作为 Source。

4. 之后静态站会按 `*/10 分钟` 自动拉一次新数据并重新部署；页面端也会自动刷新 `data.json`，并检测新活动。


> 静态模式是「定时快照」；如果对实时性要求更高、或者想用 Cookie 实时抓详情，建议用本目录的 `node server.mjs` 在 VPS/服务器上跑。



## 注意

- 这仍是「看板 + 提醒」工具，**不做自动报名/兑换**；抢名额时看到合适的点「App 打开」到官方页面手动操作。
- 不要把这个 Cookie 提交到 GitHub / 公共仓库；环境变量里传一次即可。
- 大众点评接口可能随时变更、可能风控；如果频繁报错，请降低自动刷新频率或并发数。