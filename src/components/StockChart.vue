<template>
  <div ref="chartEl" class="stock-chart-canvas"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  name: {
    type: String,
    default: ''
  },
  klines: {
    type: Object,
    default: () => ({})
  },
  view: {
    type: String,
    default: 'daily'
  }
})

const chartEl = ref(null)
let chart = null

function initChart() {
  if (!chartEl.value) return
  chart = echarts.init(chartEl.value, null, { renderer: 'canvas' })
  renderChart()
}

function renderChart() {
  if (!chart) return
  const rows = props.klines?.[props.view] ?? []
  if (!rows.length) {
    chart.setOption({
      title: {
        text: '暂无 K 线数据',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#8590a6', fontSize: 13, fontWeight: 500 }
      },
      xAxis: { show: false },
      yAxis: { show: false },
      series: []
    }, true)
    return
  }

  if (props.view === 'intraday') {
    renderIntradayChart(rows)
    return
  }

  const dates = rows.map((row) => row.date)
  const candle = rows.map((row) => [row.open, row.close, row.low, row.high])
  const volumes = rows.map((row, index) => ({
    value: row.volume,
    itemStyle: {
      color: row.close >= row.open ? '#f1403c' : '#18815f'
    },
    xAxisIndex: 1,
    yAxisIndex: 1,
    dataIndex: index
  }))

  chart.setOption({
    animation: false,
    grid: [
      { left: 48, right: 18, top: 18, height: '58%' },
      { left: 48, right: 18, top: '78%', height: '14%' }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (value) => Number.isFinite(value) ? value.toFixed(2) : value
    },
    legend: {
      top: 0,
      right: 16,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: '#8590a6', fontSize: 11 },
      data: [props.name || 'K 线', 'MA5', 'MA10', 'MA20']
    },
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: true,
        axisLine: { lineStyle: { color: '#ebebeb' } },
        axisTick: { show: false },
        axisLabel: { color: '#8590a6', fontSize: 11 }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: true,
        axisLine: { lineStyle: { color: '#ebebeb' } },
        axisTick: { show: false },
        axisLabel: { show: false }
      }
    ],
    yAxis: [
      {
        scale: true,
        splitLine: { lineStyle: { color: '#f0f0f0' } },
        axisLabel: { color: '#8590a6', fontSize: 11 }
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        splitLine: { show: false },
        axisLabel: { color: '#8590a6', fontSize: 10 }
      }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 45, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1], height: 18, bottom: 0, start: 45, end: 100 }
    ],
    series: [
      {
        name: props.name || 'K 线',
        type: 'candlestick',
        data: candle,
        itemStyle: {
          color: '#f1403c',
          color0: '#18815f',
          borderColor: '#f1403c',
          borderColor0: '#18815f'
        }
      },
      { name: 'MA5', type: 'line', data: movingAverage(rows, 5), smooth: true, symbol: 'none', lineStyle: { width: 1.4, color: '#056de8' } },
      { name: 'MA10', type: 'line', data: movingAverage(rows, 10), smooth: true, symbol: 'none', lineStyle: { width: 1.4, color: '#c58a22' } },
      { name: 'MA20', type: 'line', data: movingAverage(rows, 20), smooth: true, symbol: 'none', lineStyle: { width: 1.4, color: '#7a5aa8' } },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes,
        barWidth: '60%'
      }
    ]
  }, true)
}

function renderIntradayChart(rows) {
  const times = rows.map((row) => row.time || row.datetime)
  const prices = rows.map((row) => row.price)
  const averages = rows.map((row) => row.average)
  const volumes = rows.map((row, index) => {
    const previous = index > 0 ? rows[index - 1]?.price : row.previousClose
    return {
      value: row.volume,
      itemStyle: {
        color: Number.isFinite(previous) && row.price >= previous ? '#f1403c' : '#18815f'
      }
    }
  })
  const previousClose = rows.find((row) => Number.isFinite(row.previousClose))?.previousClose ?? null

  chart.setOption({
    animation: false,
    grid: [
      { left: 48, right: 18, top: 18, height: '60%' },
      { left: 48, right: 18, top: '80%', height: '12%' }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: (value) => Number.isFinite(value) ? value.toFixed(2) : value
    },
    legend: {
      top: 0,
      right: 16,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: '#8590a6', fontSize: 11 },
      data: ['价格', '均价']
    },
    xAxis: [
      {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#ebebeb' } },
        axisTick: { show: false },
        axisLabel: { color: '#8590a6', fontSize: 11 }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#ebebeb' } },
        axisTick: { show: false },
        axisLabel: { show: false }
      }
    ],
    yAxis: [
      {
        scale: true,
        splitLine: { lineStyle: { color: '#f0f0f0' } },
        axisLabel: { color: '#8590a6', fontSize: 11 }
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        splitLine: { show: false },
        axisLabel: { color: '#8590a6', fontSize: 10 }
      }
    ],
    series: [
      {
        name: '价格',
        type: 'line',
        data: prices,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.8, color: '#056de8' },
        areaStyle: { color: 'rgba(5, 109, 232, 0.07)' },
        markLine: Number.isFinite(previousClose)
          ? {
              symbol: 'none',
              label: { formatter: '昨收', color: '#8590a6', fontSize: 11 },
              lineStyle: { color: '#c8cdd8', type: 'dashed' },
              data: [{ yAxis: previousClose }]
            }
          : undefined
      },
      {
        name: '均价',
        type: 'line',
        data: averages,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.2, color: '#c58a22' }
      },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes,
        barWidth: '60%'
      }
    ]
  }, true)
}

function movingAverage(rows, size) {
  return rows.map((row, index) => {
    if (index < size - 1) return null
    const slice = rows.slice(index - size + 1, index + 1)
    const values = slice.map((entry) => entry.close).filter(Number.isFinite)
    if (values.length !== size) return null
    return values.reduce((sum, value) => sum + value, 0) / size
  })
}

function resizeChart() {
  chart?.resize()
}

onMounted(() => {
  nextTick(initChart)
  window.addEventListener('resize', resizeChart)
})

watch(
  () => [props.view, props.name, props.klines],
  () => nextTick(renderChart),
  { deep: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
})
</script>
