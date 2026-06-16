import { formatNumber } from './format'

export function buildChartOption(item, view, selectedDate = '') {
  if (view === 'intraday') return buildIntradayOption(item)
  return buildCandleOption(item, view, selectedDate)
}

function buildIntradayOption(item) {
  const rows = item.today?.points ?? []
  const priceRows = rows.filter((row) => Number.isFinite(row.price))
  return {
    animation: false,
    grid: { left: 58, right: 24, top: 24, bottom: 42 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: priceRows.map((row) => row.time),
      axisLine: { lineStyle: { color: '#dfe6dc' } },
      axisTick: { show: false },
      axisLabel: { color: '#667069', hideOverlap: true }
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: '#edf1eb' } },
      axisLabel: { color: '#667069' }
    },
    series: [
      {
        name: item.name,
        type: 'line',
        data: priceRows.map((row) => row.price),
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2.4, color: '#177e89' },
        areaStyle: { color: 'rgba(63, 185, 143, 0.14)' }
      }
    ]
  }
}

function getCandleRows(item, view) {
  if (view === 'daily') return (item.history ?? []).slice(-7)
  return (item.weekly ?? []).slice(-90)
}

export function getValidCandleRows(item, view) {
  return getCandleRows(item, view).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
}

function buildCandleOption(item, view, selectedDate = '') {
  const clean = getValidCandleRows(item, view)
  return {
    animation: false,
    grid: { left: 58, right: 24, top: 24, bottom: 54 },
    tooltip: {
      trigger: 'axis',
      formatter(params) {
        const row = clean[params[0].dataIndex]
        if (!row) return ''
        return [
          `${row.endDate || row.date}`,
          `开 ${formatNumber(row.open, item.priceDigits ?? 0)}`,
          `高 ${formatNumber(row.high, item.priceDigits ?? 0)}`,
          `低 ${formatNumber(row.low, item.priceDigits ?? 0)}`,
          `收 ${formatNumber(row.close, item.priceDigits ?? 0)}`
        ].join('<br>')
      }
    },
    xAxis: {
      type: 'category',
      data: clean.map((row) => (row.endDate || row.date).slice(5)),
      axisLine: { lineStyle: { color: '#dfe6dc' } },
      axisTick: { show: false },
      axisLabel: { color: '#667069', hideOverlap: true }
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: '#edf1eb' } },
      axisLabel: { color: '#667069' }
    },
    dataZoom: view === 'daily' ? [] : [{ type: 'inside', start: 45, end: 100 }],
    series: [
      {
        name: item.name,
        type: 'candlestick',
        data: clean.map((row) => ({
          value: [row.open, row.close, row.low, row.high],
          itemStyle: view === 'daily' && row.date === selectedDate
            ? { borderWidth: 3, borderColor: '#177e89', borderColor0: '#177e89' }
            : undefined
        })),
        itemStyle: {
          color: '#d95f43',
          color0: '#3fb98f',
          borderColor: '#d95f43',
          borderColor0: '#3fb98f'
        }
      }
    ]
  }
}
