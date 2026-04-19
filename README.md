# cto-tanstack-convex

> 中国纳指 ETF 溢价追踪台 · Convex + TanStack Router 全栈模板

## 🎯 项目目标

实时监控国内纳指 ETF 的溢价率，提供多 ETF 支持、灵活配置、以及详细的交易数据回溯。

---

## ✨ 核心功能

### 1. 实时溢价率监控
- **ETF 报价**：新浪 API 获取实时价格
- **净值估算（IOPV）**：天天基金 API 获取最新净值
- **汇率影响**：USD/CNH 实时汇率 + 自定义权重修正
- **期货影响**：纳指期货实时价格 + 参考结算价
- **双溢价指标**：`溢价`（vs 净值）与 `真实溢价2`（vs IOPV2）

### 2. 多 ETF 配置管理
- ✅ 支持同时跟踪多个纳指 ETF（如 513100、159941、513300 等）
- ✅ 独立开关控制每个 ETF 是否启用
- ✅ 自定义中文显示名称
- ✅ 权重排序（sortOrder）

### 3. 灵活配置系统（在线编辑）
- 动态修改 FX Symbol（如 `fx_usdcnh`）
- 动态修改 Futures Symbol（如 `hf_NQ`）
- 调整汇率 / 期货修正权重（0 ~ 3）
- 选择是否使用估算净值（gsz）或会计净值（dwjz）
- 支持增删 ETF 配置项
- 配置变更自动持久化

### 4. 手动与自动抓取
- **自动定时抓取**：后端按分钟调度（捕捉交易时段快照）
- **手动触发**：一键强制重新抓取（force=1）
- **失败重试**：自动记录并展示失败日志

### 5. 历史数据回溯
- 保留完整的快照记录（含溢价、期货、汇率等字段）
- 按时间倒序展示最新 20 条
- 包含来源说明（便于追溯数据来源）

### 6. 后端健康检查
- 数据库状态（SQLite 路径 + 引擎）
- 实时中国时间
- 当前是否处于抓取槽位（isCaptureMinute）

---

## 🏗️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 19 + TanStack Router | 客户端路由与状态管理 |
| 构建 | Vite 7 + TypeScript 5 | 快速开发与构建 |
| 后端 | Convex | 实时数据库 + 调度引擎 |
| 数据源 | 新浪财经 + 天天基金 | ETF/净值/汇率/期货 |
| 存储 | SQLite（Convex 内置） | 轻量持久化 |

---

## 🖥️ 本地运行

```bash
# 进入项目目录
cd /opt/China-QDII-Fund-Tracker

# 安装依赖（已安装可跳过）
npm install

# 启动开发服务器（端口 10092）
npx vite --port 10092 --host 0.0.0.0
```

访问地址：
- **本地**: http://localhost:10092/
- **网络**: http://10.0.0.136:10092/
- **自定义域名**: http://overview.uuheart.com:10092/

---

## 📊 页面说明

### 主页（/）
- 项目介绍与配置入口
- 抓取配置表单（FX / Futures / 权重 / ETF 列表）
- 后端状态面板
- 最近失败日志
- 最近快照表格（含溢价率列）

### 配置表单（右侧面板）
- `FX Symbol`：汇率代码（默认 `fx_usdcnh`）
- `Futures Symbol`：期货代码（默认 `hf_NQ`）
- `汇率修正权重`：0 ~ 3，控制汇率对 IOPV2 的影响
- `期货修正权重`：0 ~ 3，控制期货对 IOPV2 的影响
- `使用估算净值`：切换 gsz（估算） / dwjz（会计）
- `ETF 列表`：增删行，启用/禁用、Symbol / Code / 中文名称

### 提交配置
- 点击「保存配置」→ 请求 `/api/config` 更新 Convex 存储
- 配置变更后前端自动同步并展示生效时间

### 手动抓取
- 点击「手动抓取一次」→ POST `/api/snapshots?force=1`
- 无论是否在抓槽内，立即触发一次抓取
- 成功后在「最近快照」表格中看到新记录

### 后端状态
- GET `/api/health`：运行时 / 数据库 / 抓取槽位信息

### 失败日志
- GET `/api/capture-logs?failedOnly=1`：仅展示失败的抓取记录
- 包含时间、原因、耗时、ETF 代码等信息

### 最新快照
- GET `/api/snapshots?limit=20`：获取最近 20 条记录
- 包含：时间、ETF、价格、IOPV、IOPV2、汇率、期货、溢价等字段

---

## 🔧 数据计算逻辑（关键）

```
IOPV2_raw = IOPV_display（或 gsz）
          × (1 + (FX_latest / FX_reference - 1) × FX_weight)
          × (1 + (Futures_latest / Futures_reference - 1) × Futures_weight)

溢价  = (ETF_price - IOPV_base)     / IOPV_base
真实溢价2 = (ETF_price - IOPV2_raw) / IOPV2_raw
```

> 注：`FX_weight` 与 `Futures_weight` 由配置决定，取值范围 0 ~ 3

---

## 📈 示例数据字段

| 字段 | 说明 | 类型 |
|------|------|------|
| `etfCode` | ETF 代码（不含市场前缀） | string |
| `etfName` | 中文名称 | string |
| `etfPrice` | 实时价格 | number(4) |
| `iopv` | 净值（显示值） | number(4) |
| `iopv2` | 净值（加权修正后） | number(4) |
| `premium` | 溢价（vs IOPV） | number(6) |
| `premium2` | 溢价（vs IOPV2） | number(6) |
| `usdCnh` | USD/CNH 最新价 | number(6) |
| `usdCnhReference` | USD/CNH 参考价 | number(6) |
| `ndxFutPrice` | 纳指期货最新价 | number(3) |
| `ndxFutReference` | 纳指期货参考价 | number(3) |
| `ndxFutChange` | 期货涨跌幅 | number(6) |
| `sourceNote` | 数据来源说明 | string |

---

## 🧩 扩展建议

- [ ] 接入 Prometheus / Grafana 监控后端健康
- [ ] 增加邮件 / 钉钉告警（溢价超阈值触发）
- [ ] 历史图表可视化（折线图、K线）
- [ ] 支持更多指数（如 QDII 标普、恒生）
- [ ] 导出 CSV / Excel 报表
- [ ] 用户权限控制（多角色管理）

---

## 📚 名词解释（摘自帮助页）

- **IOPV**：基金单位净值估算值（intraday per value）
- **IOPV2**：加权修正后的净值（考虑汇率与期货对冲）
- **溢价**：市场价格与净值的偏离程度
- **纳指期货**：纳斯达克100指数期货，用于对冲或增强收益
- **抓取槽位**：后端每分钟开放的唯一抓取窗口，避免并发冲突

--

> 本项目为 **Convex 全栈模板**，适用于快速构建监控/仪表板类应用。%

