<template>
  <div ref="chartEl" class="echart"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { buildChartOption, getValidCandleRows } from '../utils/chart'

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  view: {
    type: String,
    required: true
  },
  selectedDate: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select-date'])

const chartEl = ref(null)
let chart = null

function initChart() {
  if (!chartEl.value) return
  chart = echarts.init(chartEl.value, null, { renderer: 'canvas' })
  chart.on('click', handleChartClick)
  renderChart()
}

function renderChart() {
  if (!chart || !props.item) return
  chart.setOption(buildChartOption(props.item, props.view, props.selectedDate), true)
}

function handleChartClick(params) {
  if (props.view !== 'daily' || !Number.isInteger(params.dataIndex)) return
  const row = getValidCandleRows(props.item, 'daily')[params.dataIndex]
  if (row?.date) emit('select-date', row.date)
}

function resizeChart() {
  chart?.resize()
}

onMounted(() => {
  nextTick(initChart)
  window.addEventListener('resize', resizeChart)
})

watch(
  () => [props.item.symbol, props.view, props.selectedDate],
  () => nextTick(renderChart)
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
})
</script>
