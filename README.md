# 期货每日看板

一个基于 Vue 3、Vue Router、Pinia、Element Plus、Axios 和 ECharts 的本地期货行情看板，用于汇总热门期货品种的当日走势、日 K、周 K、Williams %R、ATR、涨跌幅和供需资讯。

## 使用

刷新行情和资讯数据：

```powershell
npm run update
```

手动启动本地服务：

```powershell
npm run start:manual
```

刷新数据后再启动服务：

```powershell
npm run start:fresh
```

打开：

```text
http://127.0.0.1:4173
```

## 页面

- 首页：仅展示各品种当日走势卡片，并保留波动、W%R 等快速观察信息。
- 详情页：点击品种卡片进入详情，默认显示日内走势，可切换日内、日 K、周 K。
- 资讯：品种相关供需资讯排列在详情页，便于和行情一起查看。

## 数据

- 行情：Sina 期货公开接口。
- 资讯：东方财富期货页面和 Google News RSS。
- 指标：日内振幅、涨跌幅、ATR(14)、Williams %R(14)。

如果网络或接口暂时不可用，更新脚本会写入带状态标记的示例快照，页面不会把它标记成实时数据。
