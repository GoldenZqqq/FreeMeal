# FreeMeal Activity Monitor

大众点评霸王餐/免费试可报名活动上新监控。脚本只做“发现 + 筛选 + Bark 通知”，不自动提交报名，点通知可直接打开 iPhone 上的大众点评活动页。

## 功能

- 拉取指定城市的大众点评免费试活动列表
- 默认提醒所有新出现且仍在报名时间窗口内的活动
- 首次运行只建立当前活动基线，避免一次性推送历史活动
- 读取 PASS 总名额和剩余名额，作为可选通知信息
- 每个匹配活动发送一条 Bark，点击通知直达对应活动
- 可按关键词、活动模式、最低中奖率和 PASS 剩余数过滤
- 自动排除接口返回的已报名活动，也支持手动排除活动 ID
- Bark 成功后才把活动写入去重状态，推送失败会在下次重试
- 空结果默认不通知、不生成报告，适合每分钟定时运行
- 匹配时生成 CSV/JSON 报告到 `reports/`

## 环境变量

可选：

- `DIANPING_CITY_ID`: 城市 ID，默认上海 `1`
- `DIANPING_CITY_NAME`: 城市名称，通知中展示
- `DIANPING_COOKIE`: 登录后的大众点评 Cookie，可选；用于访问详情页时带上账号态
- `BARK`: Bark device key 或 `https://api.day.app/<device-key>`；不要提交到仓库
- `FREEMEAL_CONFIG`: JSON 配置文件路径，默认读取 `config/local.json`
- `FREEMEAL_MAX_PAGES`: 最多抓取页数
- `FREEMEAL_MAX_RESULTS`: 最多推送和报告的匹配活动数
- `FREEMEAL_EXCLUDE_IDS`: 手动排除活动 ID，逗号分隔；可用来排除你已经报名但公开接口未标记的活动
- `FREEMEAL_INCLUDE`: 标题包含关键词，逗号分隔
- `FREEMEAL_EXCLUDE`: 标题排除关键词，逗号分隔
- `FREEMEAL_MIN_WIN_RATE`: 最低中奖率百分比
- `FREEMEAL_MODES`: 活动模式，逗号分隔，例如 `聚会,电子券`
- `FREEMEAL_REGISTRATION_OPEN_ONLY`: 是否只提醒正在报名的活动，默认 `true`
- `FREEMEAL_PASS_ONLY`: 是否只提醒 PASS 有余量的活动，默认 `false`
- `FREEMEAL_MIN_PASS_REMAINING`: 最低 PASS 剩余名额，默认 `1`
- `FREEMEAL_BASELINE_ON_FIRST_RUN`: 首次运行是否仅建立基线，默认 `true`
- `FREEMEAL_NOTIFY_EMPTY`: 无匹配时是否发送 Bark，默认 `false`
- `FREEMEAL_WRITE_EMPTY_REPORTS`: 无匹配时是否生成报告，默认 `false`

## 使用

先复制配置示例：

```bash
cp config/example.json config/local.json
```

本地运行：

```bash
node index.js
```

## Ubuntu / 香港服务器

香港服务器可以直接运行，不要求中国大陆 IP。先确认 Node.js 版本不低于 18，然后将仓库部署到 `/opt/freemeal-pass`，将环境变量写入仅 root 可读的 `/etc/freemeal-pass.env`。

仓库提供：

- `deploy/freemeal-pass.service`
- `deploy/freemeal-pass.timer`
- `deploy/freemeal-pass.env.example`

安装定时器后检查：

```bash
sudo systemctl enable --now freemeal-pass.timer
systemctl list-timers freemeal-pass.timer
journalctl -u freemeal-pass.service -n 100 --no-pager
```

定时器默认启动 30 秒后首次执行，之后约每 60 秒检查一次。详情接口只对尚未处理的新活动调用，避免反复请求所有活动。该项目不依赖青龙，建议直接作为独立 `systemd` 服务运行。

## Arcadia

在 Arcadia 环境变量中配置：

- `BARK`

脚本默认使用上海：`DIANPING_CITY_ID=1`、`DIANPING_CITY_NAME=上海`，一般不用在 Arcadia 里额外配置城市。

运行命令：

```bash
node index.js
```

如果 Arcadia 项目习惯使用 `checkin.js` 作为入口，也可以填：

```bash
node checkin.js
```

如果运行日志只有“执行开始/执行完毕”，但没有 `[FreeMeal] [INFO] Script started`，说明 Arcadia 没有执行到本项目入口。请检查任务的运行命令是否填了上面的 `node index.js` 或 `node checkin.js`。

脚本不会在源码、报告或日志里保存 Bark key。Cookie 只从环境变量读取。

Bark 通知使用 `dianping://picassobox?...` App 深链；每条通知对应一个活动。报告里会同时保存网页链接和 App 链接。

公开接口不总是返回登录账号的报名状态。如果某个已报名活动仍被推送，可以把活动链接里的数字 ID 加到 `FREEMEAL_EXCLUDE_IDS`。已处理活动记录在 `reports/seen-activities.json`。

## 日志

脚本会输出带时间戳的运行日志，包括配置摘要、列表页抓取进度、活动处理进度、报告路径和 Bark 发送状态。日志只显示 `cookie=configured/missing` 和 `bark=configured/missing`，不会打印 Cookie 或 Bark key。

## 说明

大众点评接口可能变更，也可能增加风控或验证码。当前脚本只拉取免费试列表、读取可公开访问的详情信息并推送匹配活动，不提交报名请求。建议将检查间隔保持在 60 秒左右，并在大众点评 App 内手动兑换。
