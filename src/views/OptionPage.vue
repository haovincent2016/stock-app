<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-brand">
        <h1>期货数据</h1>
        <router-link class="topbar-menu" :to="{ name: 'home' }">期货</router-link>
        <router-link class="topbar-menu active" :to="{ name: 'options' }">期权</router-link>
        <span class="topbar-date">{{ optionTradeDate || store.meta.tradeDate || '--' }}</span>
      </div>
      <div class="topbar-actions">
        <el-button :loading="store.optionLoading || store.loading" @click="refresh" circle size="small">
          <span class="fallback-icon">↻</span>
        </el-button>
      </div>
    </header>

    <main>
      <el-alert v-if="store.error" :title="store.error" type="warning" show-icon class="page-alert" />
      <el-alert v-if="store.optionError" :title="store.optionError" type="warning" show-icon class="page-alert" />

      <section class="option-hero">
        <div>
          <h2>鸡蛋期权涨幅榜</h2>
          <p>展示当日鸡蛋期权涨幅最大的 2 个合约及其标的期货表现。</p>
        </div>
        <span>{{ store.optionFetchedAt ? `更新 ${formatTime(store.optionFetchedAt)}` : `${optionRows.length} 条` }}</span>
      </section>

      <div class="option-page-layout">
        <section class="option-list-panel" v-loading="store.optionLoading">
          <div class="option-list">
            <article
              v-for="row in optionRows"
              :key="row.symbol"
              class="option-row"
              :class="{ active: row.symbol === selectedSymbol }"
              role="button"
              tabindex="0"
              @click="selectOption(row)"
              @keydown.enter.prevent="selectOption(row)"
            >
              <div class="option-rank" :class="'rank-' + row.rank">{{ row.rank }}</div>

              <div class="option-main">
                <div class="option-title">
                  <strong>{{ row.name }}</strong>
                  <em>{{ row.optionType }}</em>
                </div>
                <div class="option-meta">
                  <span>{{ row.contract }}</span>
                  <span>行权价 {{ formatNumber(row.strike, 0) }}</span>
                  <span>{{ row.source }}</span>
                </div>
                <div class="option-metrics">
                  <span>成交 <em>{{ compactNumber(row.volume) }}</em></span>
                  <span>持仓 <em>{{ compactNumber(row.openInterest) }}</em></span>
                  <span>买卖 <em>{{ formatNumber(row.bidPrice, optionDigits(row.bidPrice)) }} / {{ formatNumber(row.askPrice, optionDigits(row.askPrice)) }}</em></span>
                </div>
              </div>

              <div class="option-price">
                <strong>{{ formatNumber(row.latestPrice, optionDigits(row.latestPrice)) }}</strong>
                <span :class="changeClass(row.changePct)">{{ formatSignedPct(row.changePct) }}</span>
              </div>

              <div class="option-underlying">
                <router-link
                  :to="{ name: 'detail', params: { symbol: row.underlying?.symbol } }"
                  @click.stop
                >
                  {{ row.underlying?.name || '--' }}
                  <em>{{ row.underlying?.contract || row.underlying?.symbol || '--' }}</em>
                </router-link>
                <span :class="changeClass(row.underlying?.changePct)">{{ formatSignedPct(row.underlying?.changePct) }}</span>
              </div>
            </article>

            <div v-if="!store.optionLoading && !optionRows.length" class="empty-state">
              暂无真实期权排行数据
            </div>
          </div>
        </section>

        <aside class="option-chart-panel" v-loading="chartLoading">
          <template v-if="selectedOption">
            <div class="option-chart-head">
              <div>
                <h2>{{ selectedOption.name }}</h2>
                <p>{{ selectedOption.symbol }} · {{ selectedOption.exchange }} · {{ selectedOption.contract }}</p>
              </div>
              <span class="tone-pill" :class="changeClass(selectedOption.changePct)">
                {{ formatSignedPct(selectedOption.changePct) }}
              </span>
            </div>

            <div class="option-chart-stats">
              <article>
                <span>期权最新</span>
                <strong>{{ formatNumber(optionSnapshot?.latestPrice ?? selectedOption.latestPrice, optionDigits(optionSnapshot?.latestPrice ?? selectedOption.latestPrice)) }}</strong>
              </article>
              <article>
                <span>成交量</span>
                <strong>{{ compactNumber(optionSnapshot?.volume ?? selectedOption.volume) }}</strong>
              </article>
              <article>
                <span>持仓量</span>
                <strong>{{ compactNumber(optionSnapshot?.openInterest ?? selectedOption.openInterest) }}</strong>
              </article>
              <article>
                <span>标的期货</span>
                <strong>{{ formatNumber(futuresSnapshot?.latestPrice ?? selectedOption.underlying?.latestPrice, 0) }}</strong>
              </article>
            </div>

            <div ref="chartEl" class="option-chart-frame"></div>

            <p v-if="optionSnapshot?.note" class="option-chart-note">{{ optionSnapshot.note }}</p>
            <p v-else-if="chartError" class="option-chart-note">{{ chartError }}</p>

            <div class="option-quote-grid">
              <div><span>买价 / 买量</span><strong>{{ formatNumber(selectedOption.bidPrice, optionDigits(selectedOption.bidPrice)) }} / {{ compactNumber(selectedOption.bidVolume) }}</strong></div>
              <div><span>卖价 / 卖量</span><strong>{{ formatNumber(selectedOption.askPrice, optionDigits(selectedOption.askPrice)) }} / {{ compactNumber(selectedOption.askVolume) }}</strong></div>
              <div><span>虚实值</span><strong :class="changeClass(selectedOption.moneyness)">{{ formatSignedPct(selectedOption.moneyness) }}</strong></div>
              <div><span>标的涨跌</span><strong :class="changeClass(selectedOption.underlying?.changePct)">{{ formatSignedPct(selectedOption.underlying?.changePct) }}</strong></div>
            </div>
          </template>

          <div v-else class="empty-state compact-empty">请选择一个期权合约</div>
        </aside>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useMarketStore } from '../stores/market'
import { compactNumber, formatNumber, formatSignedPct, formatTime, changeClass } from '../utils/format'

const store = useMarketStore()
const selectedSymbol = ref('')
const chartEl = ref(null)
let chart = null

const optionRows = computed(() =>
  store.optionRows
    .slice()
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity))
    .slice(0, 2)
    .map((row, index) => ({ ...row, rank: index + 1 }))
)
const selectedOption = computed(() =>
  optionRows.value.find((row) => row.symbol === selectedSymbol.value) ?? optionRows.value[0] ?? null
)
const selectedPayload = computed(() =>
  selectedOption.value ? store.optionIntraday[selectedOption.value.symbol] ?? null : null
)
const optionSnapshot = computed(() => selectedPayload.value?.option ?? null)
const futuresSnapshot = computed(() => selectedPayload.value?.futures ?? null)
const chartLoading = computed(() => !!store.optionIntradayLoading[selectedOption.value?.symbol])
const chartError = computed(() => store.optionIntradayError[selectedOption.value?.symbol] || '')
const optionTradeDate = computed(() => optionSnapshot.value?.tradeDate || selectedOption.value?.quoteDateTime?.slice(0, 10) || '')

onMounted(async () => {
  await store.load()
  await refreshOptions(false)
  await nextTick()
  initChart()
})

watch(
  () => selectedOption.value?.symbol,
  async (symbol) => {
    if (!symbol || store.optionIntraday[symbol]) {
      renderChart()
      return
    }
    await store.loadOptionIntraday(selectedOption.value)
    renderChart()
  }
)

watch(
  () => selectedPayload.value,
  () => nextTick(renderChart),
  { deep: true }
)

function initChart() {
  if (!chartEl.value || chart) return
  chart = echarts.init(chartEl.value, null, { renderer: 'canvas' })
  renderChart()
  window.addEventListener('resize', resizeChart)
}

function renderChart() {
  if (!chart || !selectedOption.value) return
  chart.setOption(buildCompareChartOption(), true)
}

function resizeChart() {
  chart?.resize()
}

async function refresh() {
  await store.load(true)
  await refreshOptions(true)
}

async function refreshOptions(force) {
  await store.loadOptions(force)
  if (!selectedSymbol.value && optionRows.value.length) {
    selectedSymbol.value = optionRows.value[0].symbol
  }
  if (selectedOption.value) {
    await store.loadOptionIntraday(selectedOption.value, force)
  }
}

async function selectOption(row) {
  selectedSymbol.value = row.symbol
  await store.loadOptionIntraday(row)
  renderChart()
}

function buildCompareChartOption() {
  const option = optionSnapshot.value
  const futures = futuresSnapshot.value
  const optionPoints = option?.points ?? []
  const futuresPoints = futures?.points ?? []
  const categories = mergeTimes(optionPoints, futuresPoints)
  const optionName = selectedOption.value?.optionType ? `${selectedOption.value.optionType}期权` : '期权'
  const futuresName = selectedOption.value?.underlying?.contract || selectedOption.value?.underlying?.symbol || '标的期货'

  if (!optionPoints.length && !futuresPoints.length) {
    return {
      animation: false,
      graphic: {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: { text: '暂无走势数据', fill: '#8590a6', font: '14px Microsoft YaHei' }
      }
    }
  }

  return {
    animation: false,
    color: ['#d95f43', '#177e89'],
    legend: { top: 8, right: 18, data: [optionName, futuresName], textStyle: { color: '#667069' } },
    grid: { left: 58, right: 58, top: 48, bottom: 42 },
    tooltip: {
      trigger: 'axis',
      formatter(params) {
        const time = params[0]?.axisValue || ''
        const lines = params
          .filter((item) => Number.isFinite(item.value))
          .map((item) => {
            const digits = item.seriesName === optionName ? optionDigits(item.value) : 0
            return `${item.marker}${item.seriesName} ${formatNumber(item.value, digits)}`
          })
        return [time, ...lines].join('<br>')
      }
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: '#dfe6dc' } },
      axisTick: { show: false },
      axisLabel: { color: '#667069', hideOverlap: true }
    },
    yAxis: [
      {
        type: 'value',
        scale: true,
        name: '期权',
        splitLine: { lineStyle: { color: '#edf1eb' } },
        axisLabel: { color: '#667069' }
      },
      {
        type: 'value',
        scale: true,
        name: '期货',
        splitLine: { show: false },
        axisLabel: { color: '#667069' }
      }
    ],
    series: [
      {
        name: optionName,
        type: 'line',
        yAxisIndex: 0,
        data: alignPoints(categories, optionPoints),
        showSymbol: optionPoints.length <= 16,
        symbolSize: 7,
        connectNulls: true,
        lineStyle: { width: 2.4 },
        areaStyle: option?.resolution === 'snapshot' ? undefined : { opacity: 0.08 }
      },
      {
        name: futuresName,
        type: 'line',
        yAxisIndex: 1,
        data: alignPoints(categories, futuresPoints),
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 2 }
      }
    ],
    graphic: option?.resolution === 'snapshot'
      ? {
          type: 'text',
          right: 18,
          bottom: 10,
          style: { text: '期权为真实快照点', fill: '#8590a6', font: '12px Microsoft YaHei' }
        }
      : undefined
  }
}

function alignPoints(categories, points) {
  const valueByTime = new Map(points.map((row) => [row.time, row.price]))
  return categories.map((time) => valueByTime.get(time) ?? null)
}

function mergeTimes(optionPoints, futuresPoints) {
  const seen = new Set()
  const times = []
  for (const row of futuresPoints) {
    if (row.time && !seen.has(row.time)) {
      seen.add(row.time)
      times.push(row.time)
    }
  }
  for (const row of optionPoints) {
    if (row.time && !seen.has(row.time)) {
      seen.add(row.time)
      times.push(row.time)
    }
  }
  return times.sort((a, b) => sessionOrder(a) - sessionOrder(b))
}

function sessionOrder(time) {
  const [hour, minute] = String(time).split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0
  const total = hour * 60 + minute
  return total >= 20 * 60 ? total - 20 * 60 : total + 4 * 60
}

function optionDigits(value) {
  if (!Number.isFinite(value)) return 1
  if (Math.abs(value) < 10) return 2
  if (Math.abs(value) < 100) return 1
  return 0
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
})
</script>
