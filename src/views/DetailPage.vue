<template>
  <div class="app-shell detail-shell">
    <header class="topbar">
      <router-link class="back-link" :to="{ name: 'home' }">
        <span class="fallback-icon">←</span>
        <span>首页</span>
      </router-link>
      <div class="topbar-actions">
        <span class="topbar-date">{{ item?.today?.date || store.meta.tradeDate || '--' }}</span>
        <em v-if="liveFetchedAt" class="live-tag">实时 {{ formatTime(liveFetchedAt) }}</em>
        <el-button :loading="store.loading || liveLoading" @click="refresh" circle size="small">
          <span class="fallback-icon">↻</span>
        </el-button>
      </div>
    </header>

    <main v-if="item" class="detail-page-layout">
      <div class="detail-content">
      <section v-if="item.contracts?.length" class="contract-switcher">
        <button
          type="button"
          class="contract-btn"
          :class="{ active: !activeContract }"
          @click="switchContract(null)"
        >主力连续</button>
        <button
          v-for="c in item.contracts"
          :key="c.mainContract"
          type="button"
          class="contract-btn"
          :class="{ active: activeContract === c.mainContract }"
          @click="switchContract(c.mainContract)"
        >{{ c.contractMonth?.label || c.mainContract }}</button>
      </section>

      <section class="detail-hero">
        <div class="hero-info">
          <p class="hero-eyebrow">{{ displayItem.exchange }} · {{ displayItem.mainContract || displayItem.symbol }}</p>
          <h1 class="hero-title">{{ displayItem.name }}<span v-if="displayItem.contractMonth" class="contract-tag detail">{{ displayItem.contractMonth.label }}</span></h1>
          <p class="hero-summary">{{ displayItem.summary || '等待最新供需资讯。' }}</p>
        </div>
        <div class="price-panel" :class="{ 'limit-up': displayLimitStatus === 'limitUp', 'limit-down': displayLimitStatus === 'limitDown' }">
          <div class="price-row">
            <strong class="price-value">{{ formatNumber(displayItem.today?.latestPrice ?? displayItem.latest?.close, displayItem.priceDigits ?? 0) }}</strong>
            <em class="change-pill" :class="changeClass(displayItem.today?.changePct)">
              {{ formatSignedPct(displayItem.today?.changePct) }}
            </em>
            <span v-if="displayLimitStatus === 'limitUp'" class="limit-badge limit-up">涨停</span>
            <span v-else-if="displayLimitStatus === 'limitDown'" class="limit-badge limit-down">跌停</span>
          </div>
          <div class="price-sub">
            <span>最新价</span>
          </div>
        </div>
      </section>

      <section class="detail-stats" aria-label="关键指标">
        <article><span>日内高 / 低</span><strong>{{ formatNumber(displayItem.today?.high, displayItem.priceDigits ?? 0) }} / {{ formatNumber(displayItem.today?.low, displayItem.priceDigits ?? 0) }}</strong></article>
        <article><span>日内振幅</span><strong>{{ formatPct(displayItem.today?.rangePct) }}</strong></article>
        <article><span>Williams %R</span><strong>{{ Number.isFinite(displayItem.metrics?.williamsR) ? displayItem.metrics.williamsR.toFixed(1) : '--' }}</strong></article>
        <article><span>ATR 14</span><strong>{{ formatNumber(displayItem.metrics?.atr14, displayItem.priceDigits ?? 0) }}</strong></article>
        <article><span>成交量</span><strong>{{ compactNumber(displayItem.today?.volume ?? displayItem.latest?.volume) }}</strong></article>
        <article v-if="Number.isFinite(displayItem.limitUp)"><span>涨停价</span><strong class="limit-up">{{ formatNumber(displayItem.limitUp, displayItem.priceDigits ?? 0) }}</strong></article>
        <article v-if="Number.isFinite(displayItem.limitDown)"><span>跌停价</span><strong class="limit-down">{{ formatNumber(displayItem.limitDown, displayItem.priceDigits ?? 0) }}</strong></article>
        <article v-if="Number.isFinite(displayItem.limitPct)"><span>涨跌停板</span><strong>{{ formatPct(displayItem.limitPct) }}</strong></article>
        <article v-if="displayItem.limitSource"><span>涨跌停来源</span><strong>{{ displayItem.limitSource }}</strong></article>
        <article v-if="Number.isFinite(displayItem.limitPreviousSettlement)"><span>前结算</span><strong>{{ formatNumber(displayItem.limitPreviousSettlement, displayItem.priceDigits ?? 0) }}</strong></article>
      </section>

      <section class="chart-panel">
        <div class="chart-head">
          <div class="chart-title-group">
            <h2>走势</h2>
            <span class="chart-sub">{{ chartTitles[activeView] }}</span>
          </div>
          <el-tabs v-model="activeView" class="chart-tabs">
            <el-tab-pane label="日内" name="intraday" />
            <el-tab-pane label="日 K" name="daily" />
            <el-tab-pane label="周 K" name="weekly" />
          </el-tabs>
        </div>
        <div class="chart-frame">
          <market-chart
            :item="displayItem"
            :view="activeView"
            :selected-date="selectedTradeDate"
            @select-date="selectTradeDate"
          />
        </div>
      </section>

      <section class="flow-panel">
        <div class="section-header">
          <h2>成交量 / 持仓量 / 期现基差</h2>
          <span class="section-sub">日 K 与月度供需</span>
        </div>

        <div class="flow-summary">
          <article>
            <span>选中日期</span>
            <strong>{{ selectedDaily?.date || '--' }}</strong>
            <em>近 7 个交易日</em>
          </article>
          <article>
            <span>日 K 持仓量</span>
            <strong>{{ compactNumber(selectedDaily?.openInterest) }}</strong>
            <em :class="changeClass(selectedOpenInterestChange)">{{ formatSignedNumber(selectedOpenInterestChange) }}</em>
          </article>
          <article>
            <span>期现基差</span>
            <strong>{{ formatBasisValue(selectedSpotBasis.basis, displayItem.priceDigits ?? 0) }}</strong>
            <em>{{ selectedSpotBasis.status || selectedSpotBasis.formula || '现货价 - 期货收盘价' }}</em>
          </article>
        </div>

        <div class="flow-layout">
          <div class="trade-calendar">
            <div class="calendar-head">
              <strong>交易日历</strong>
              <span v-if="isLiveSession">含今日实时</span>
              <span v-else>近 7 个交易日</span>
            </div>
            <div class="calendar-days">
              <button
                v-for="row in recentDailyRows"
                :key="row.date"
                type="button"
                class="calendar-day"
                :class="{ active: row.date === selectedTradeDate, live: row.isLive }"
                @click="selectTradeDate(row.date)"
              >
                <span>{{ row.isLive ? '今日' : weekdayLabel(row.date) }}</span>
                <strong>{{ dateDayLabel(row.date) }}</strong>
                <em :class="changeClass(row.changePct)">{{ formatSignedPct(row.changePct) }}</em>
              </button>
            </div>
          </div>

          <div class="selected-flow-card">
            <div class="flow-card-head">
              <strong>{{ selectedDaily?.date || '--' }} 日 K 数据</strong>
              <span>{{ displayItem.mainContract || displayItem.symbol }}</span>
            </div>
            <div class="month-metrics">
              <div><span>收盘价</span><strong :class="{ 'limit-up': isLimitUpPrice(selectedDaily), 'limit-down': isLimitDownPrice(selectedDaily) }">{{ formatNumber(selectedDaily?.close, displayItem.priceDigits ?? 0) }}</strong></div>
              <div><span>涨跌幅</span><strong :class="changeClass(selectedDaily?.changePct)">{{ formatSignedPct(selectedDaily?.changePct) }}</strong></div>
              <div><span>成交量</span><strong>{{ compactNumber(selectedDaily?.volume) }}</strong></div>
              <div><span>持仓量</span><strong>{{ compactNumber(selectedDaily?.openInterest) }}</strong></div>
              <div><span>持仓变化</span><strong :class="changeClass(selectedOpenInterestChange)">{{ formatSignedNumber(selectedOpenInterestChange) }}</strong></div>
              <div><span>结算价</span><strong>{{ formatNumber(selectedDaily?.settlement, displayItem.priceDigits ?? 0) }}</strong></div>
              <div><span>期现基差</span><strong>{{ formatBasisValue(selectedSpotBasis.basis, displayItem.priceDigits ?? 0) }}</strong></div>
              <div><span>日内高 / 低</span><strong>{{ formatNumber(selectedDaily?.high, displayItem.priceDigits ?? 0) }} / {{ formatNumber(selectedDaily?.low, displayItem.priceDigits ?? 0) }}</strong></div>
              <div v-if="selectedDaily?.isLive && Number.isFinite(selectedDaily?.limitUp)"><span>当日涨停</span><strong class="limit-up">{{ formatNumber(selectedDaily.limitUp, displayItem.priceDigits ?? 0) }}</strong></div>
              <div v-if="selectedDaily?.isLive && Number.isFinite(selectedDaily?.limitDown)"><span>当日跌停</span><strong class="limit-down">{{ formatNumber(selectedDaily.limitDown, displayItem.priceDigits ?? 0) }}</strong></div>
            </div>
          </div>

          <div class="selected-month-card">
            <div class="ai-trend-card">
              <div class="ai-card-head">
                <div class="ai-card-title">
                  <strong>AI 走势预测</strong>
                  <span>{{ aiTrendAnalysis.scope }}</span>
                </div>
                <span class="tone-pill" :class="aiTrendAnalysis.biasClass">{{ aiTrendAnalysis.label }}</span>
              </div>
              <p class="ai-summary">{{ aiTrendAnalysis.summary }}</p>
              <div class="ai-signal-grid">
                <div v-for="signal in aiTrendAnalysis.signals" :key="signal.label">
                  <span>{{ signal.label }}</span>
                  <strong :class="signal.class">{{ signal.value }}</strong>
                  <em>{{ signal.meta }}</em>
                </div>
              </div>
              <ul class="ai-detail-list">
                <li v-for="(note, idx) in aiTrendAnalysis.details" :key="idx">{{ note }}</li>
              </ul>
            </div>

            <div class="bull-bear-card">
              <div class="ai-card-head">
                <div class="ai-card-title">
                  <strong>近期利多 / 利空</strong>
                  <span>{{ bullBearAnalysis.scope }}</span>
                </div>
                <span class="tone-pill" :class="bullBearAnalysis.biasClass">{{ bullBearAnalysis.label }}</span>
              </div>
              <p class="ai-summary">{{ bullBearAnalysis.summary }}</p>
              <div class="bull-bear-columns">
                <div class="bull-bear-column bullish">
                  <div class="bull-bear-head">
                    <strong>利多点</strong>
                    <span>{{ bullBearAnalysis.bullish.length }} 项</span>
                  </div>
                  <ul>
                    <li v-for="item in bullBearAnalysis.bullish" :key="item.title">
                      <strong>{{ item.title }}</strong>
                      <span>{{ item.detail }}</span>
                      <em>{{ item.meta }}</em>
                    </li>
                  </ul>
                </div>
                <div class="bull-bear-column bearish">
                  <div class="bull-bear-head">
                    <strong>利空点</strong>
                    <span>{{ bullBearAnalysis.bearish.length }} 项</span>
                  </div>
                  <ul>
                    <li v-for="item in bullBearAnalysis.bearish" :key="item.title">
                      <strong>{{ item.title }}</strong>
                      <span>{{ item.detail }}</span>
                      <em>{{ item.meta }}</em>
                    </li>
                  </ul>
                </div>
              </div>
              <div class="ai-signal-grid bull-bear-signal-grid">
                <div v-for="signal in bullBearAnalysis.signals" :key="signal.label">
                  <span>{{ signal.label }}</span>
                  <strong :class="signal.class">{{ signal.value }}</strong>
                  <em>{{ signal.meta }}</em>
                </div>
              </div>
              <ul class="ai-detail-list">
                <li v-for="(note, idx) in bullBearAnalysis.details" :key="idx">{{ note }}</li>
              </ul>
            </div>

            <div class="wave-ai-card">
              <div class="ai-card-head">
                <div class="ai-card-title">
                  <strong>波浪理论 AI 分析</strong>
                  <span>{{ waveAiAnalysis.scope }}</span>
                </div>
                <span class="tone-pill" :class="waveAiAnalysis.biasClass">{{ waveAiAnalysis.label }}</span>
              </div>
              <p class="ai-summary">{{ waveAiAnalysis.summary }}</p>
              <div v-if="waveAiAnalysis.sketch" class="wave-sketch" aria-label="波浪理论点位走势">
                <div class="wave-sketch-scale">
                  <span>{{ waveAiAnalysis.sketch.highLabel }}</span>
                  <span>{{ waveAiAnalysis.sketch.lowLabel }}</span>
                </div>
                <div class="wave-sketch-canvas">
                  <svg viewBox="0 0 100 64" preserveAspectRatio="none">
                    <line
                      v-for="line in waveAiAnalysis.sketch.gridLines"
                      :key="line"
                      class="wave-sketch-grid"
                      x1="0"
                      x2="100"
                      :y1="line"
                      :y2="line"
                    />
                    <polyline class="wave-sketch-area" :points="waveAiAnalysis.sketch.areaPoints" />
                    <polyline class="wave-sketch-line" :points="waveAiAnalysis.sketch.linePoints" />
                    <circle
                      v-for="point in waveAiAnalysis.sketch.nodes"
                      :key="point.key"
                      class="wave-sketch-dot"
                      :class="point.class"
                      :cx="point.x"
                      :cy="point.y"
                      r="2.2"
                    />
                  </svg>
                  <div
                    v-for="point in waveAiAnalysis.sketch.nodes"
                    :key="point.key + '-label'"
                    class="wave-sketch-marker"
                    :class="point.class"
                    :style="{ left: point.left, top: point.top }"
                  >
                    <strong>{{ point.label }}</strong>
                    <span>{{ point.price }}</span>
                  </div>
                </div>
              </div>
              <div v-if="waveAiAnalysis.points.length" class="wave-path" aria-label="波浪路径">
                <div v-for="point in waveAiAnalysis.points" :key="point.key" class="wave-point" :class="point.class">
                  <span>{{ point.label }}</span>
                  <strong>{{ point.price }}</strong>
                  <em>{{ point.date }}</em>
                </div>
              </div>
              <div class="ai-signal-grid wave-signal-grid">
                <div v-for="signal in waveAiAnalysis.signals" :key="signal.label">
                  <span>{{ signal.label }}</span>
                  <strong :class="signal.class">{{ signal.value }}</strong>
                  <em>{{ signal.meta }}</em>
                </div>
              </div>
              <ul class="ai-detail-list wave-detail-list">
                <li v-for="(note, idx) in waveAiAnalysis.details" :key="idx">{{ note }}</li>
              </ul>
            </div>

            <div class="month-card">
              <div class="month-card-head">
                <div class="month-card-title">
                  <strong>供需信息</strong>
                  <span v-if="selectedMonth">{{ monthLabel(selectedMonth.month) }}</span>
                </div>
                <span v-if="selectedMonth" class="tone-pill" :class="selectedMonth.supplyTone">{{ supplyToneText(selectedMonth.supplyTone) }}</span>
              </div>
              <div v-if="yearlyMonths.length" class="month-switcher" role="tablist" aria-label="月份切换">
                <button
                  v-for="m in yearlyMonths"
                  :key="m.month"
                  type="button"
                  class="month-btn"
                  :class="{ active: m.month === selectedMonth?.month }"
                  @click="selectMonth(m.month)"
                >{{ m.month.slice(5) }}月</button>
              </div>
              <div class="supply-demand">
                <div class="sd-block">
                  <div class="sd-head">
                    <h4>供应信息</h4>
                    <span>{{ supplyNotes.length }} 条</span>
                  </div>
                  <ul v-if="supplyNotes.length">
                    <li v-for="(note, idx) in supplyNotes" :key="'s' + idx">{{ note }}</li>
                  </ul>
                  <p v-else class="sd-empty">暂无供应信息</p>
                </div>
                <div class="sd-block">
                  <div class="sd-head">
                    <h4>需求信息</h4>
                    <span>{{ demandNotes.length }} 条</span>
                  </div>
                  <ul v-if="demandNotes.length">
                    <li v-for="(note, idx) in demandNotes" :key="'d' + idx">{{ note }}</li>
                  </ul>
                  <p v-else class="sd-empty">暂无需求信息</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="detail-news">
        <div class="section-header">
          <h2>相关供需资讯</h2>
          <span class="section-sub">{{ relatedNews.length }} 条</span>
        </div>
        <div class="news-list">
          <article v-for="news in relatedNews.slice(0, 16)" :key="news.symbol + news.title" class="news-item">
            <div class="news-meta-top">
              <strong>{{ news.source || '资讯' }}</strong>
              <span class="tone-pill" :class="news.tone || 'neutral'">{{ byToneText[news.tone] || '中性' }}</span>
            </div>
            <h3><a :href="news.url" target="_blank" rel="noreferrer">{{ news.title }}</a></h3>
            <p class="news-summary">{{ news.summary || '供需线索待补充' }}</p>
            <div class="news-meta-bottom">
              <span>{{ formatDate(news.publishedAt) }}</span>
              <span>{{ news.commodity || item.name }}</span>
            </div>
          </article>
          <div v-if="!relatedNews.length" class="empty-state compact-empty">暂无该品种资讯</div>
        </div>
      </section>
      </div>

      <aside class="commodity-menu" aria-label="所有品种菜单">
        <div class="commodity-menu-head">
          <strong>所有品种</strong>
          <span>{{ store.commodities.length }} 个</span>
        </div>
        <nav class="commodity-menu-list">
          <router-link
            v-for="commodity in menuCommodities"
            :key="commodity.symbol"
            class="commodity-menu-item"
            :class="{ active: commodity.symbol === item.symbol }"
            :to="{ name: 'detail', params: { symbol: commodity.symbol } }"
          >
            <span class="commodity-menu-name">
              {{ commodity.name }}
              <span v-if="commodity.contractMonth" class="contract-tag inline">{{ commodity.contractMonth.label }}</span>
              <span v-if="store.isPinned(commodity.symbol)" class="pin-indicator">置顶</span>
            </span>
            <span class="commodity-menu-meta">{{ commodity.exchange }} · {{ commodity.symbol }}</span>
            <em :class="changeClass(commodity.today?.changePct)">{{ formatSignedPct(commodity.today?.changePct) }}</em>
          </router-link>
        </nav>
      </aside>
    </main>

    <main v-else>
      <div class="empty-state">暂无可展示的品种数据</div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMarketStore } from '../stores/market'
import { formatNumber, compactNumber, formatPct, formatSignedPct, formatSignedNumber, changeClass, dateDayLabel, weekdayLabel, monthLabel, formatDate, formatTime, formatBasisValue } from '../utils/format'
import { byToneText, chartTitles, supplyToneText, mergeLiveSnapshot, buildLiveCalendarRow, getLimitStatus, sortCommodityRows } from '../utils/data'
import MarketChart from '../components/MarketChart.vue'

const store = useMarketStore()
const route = useRoute()
const router = useRouter()
const activeView = ref('intraday')
const selectedTradeDate = ref('')
const selectedMonthKey = ref('')
const activeContract = ref(null)

onMounted(async () => {
  await store.load()
  if (!item.value && store.commodities.length) {
    router.replace({ name: 'detail', params: { symbol: store.commodities[0].symbol } })
    return
  }
  refresh()
})

const baseItem = computed(() => store.commodities.find((row) => row.symbol === route.params.symbol))
const liveSnapshot = computed(() => (baseItem.value ? store.liveIntraday[baseItem.value.symbol] ?? null : null))
const item = computed(() => mergeLiveSnapshot(baseItem.value, liveSnapshot.value))
const liveLoading = computed(() => {
  const key = activeContract.value || baseItem.value?.symbol
  return !!store.liveLoading[key]
})
const liveFetchedAt = computed(() => {
  const snap = activeContract.value ? contractLiveSnapshot.value : liveSnapshot.value
  return snap?.fetchedAt ?? null
})

const contractLiveSnapshot = computed(() => {
  if (!activeContract.value || !baseItem.value) return null
  return store.liveIntraday[activeContract.value] ?? null
})
const contractItem = computed(() => {
  if (!activeContract.value || !baseItem.value) return null
  const c = baseItem.value.contracts?.find((row) => row.mainContract === activeContract.value)
  if (!c) return null
  return mergeLiveSnapshot(c, contractLiveSnapshot.value)
})
const displayItem = computed(() => contractItem.value ?? item.value)
const displayLimitStatus = computed(() => getLimitStatus(displayItem.value))
const menuCommodities = computed(() => sortCommodityRows(store.commodities, store.pinnedSymbols, 'change'))

watch(
  () => baseItem.value?.symbol,
  (symbol, previousSymbol) => {
    if (symbol !== previousSymbol) {
      activeContract.value = null
      selectedTradeDate.value = ''
      selectedMonthKey.value = ''
    }
    if (symbol) store.refreshIntraday(symbol)
  }
)

function switchContract(contract) {
  activeContract.value = contract
  selectedTradeDate.value = ''
  if (contract) {
    store.refreshIntraday(contract)
  } else if (baseItem.value?.symbol) {
    store.refreshIntraday(baseItem.value.symbol)
  }
}

const isLiveSession = computed(() => {
  const snap = activeContract.value ? contractLiveSnapshot.value : liveSnapshot.value
  const base = displayItem.value
  if (!snap || !base) return false
  const liveDate = snap.tradeDate || snap.points?.at(-1)?.date
  const lastSettled = base.history?.at(-1)?.date
  return liveDate && liveDate !== lastSettled
})
const relatedNews = computed(() => store.news.filter((row) => row.symbol === item.value?.symbol))
const recentDailyRows = computed(() => {
  const history = displayItem.value?.history ?? []
  const start = Math.max(0, history.length - 7)
  const settled = history.slice(start).map((row, index) => {
    const previous = history[start + index - 1]
    return {
      ...row,
      changePct: previous?.close ? (row.close - previous.close) / previous.close : null,
      isLive: false
    }
  })
  const snap = activeContract.value ? contractLiveSnapshot.value : liveSnapshot.value
  if (isLiveSession.value && snap) {
    const liveRow = buildLiveCalendarRow(displayItem.value, snap, settled.at(-1))
    if (liveRow) return [...settled.slice(-6), liveRow]
  }
  return settled
})
const selectedDaily = computed(
  () => recentDailyRows.value.find((row) => row.date === selectedTradeDate.value) ?? recentDailyRows.value.at(-1) ?? displayItem.value?.latest
)
const previousSelectedDaily = computed(() => {
  const history = displayItem.value?.history ?? []
  const index = history.findIndex((row) => row.date === selectedDaily.value?.date)
  return index > 0 ? history[index - 1] : null
})
const selectedOpenInterestChange = computed(() => {
  const current = selectedDaily.value?.openInterest
  const previous = previousSelectedDaily.value?.openInterest
  return Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null
})
const selectedSpotBasis = computed(() => selectedDaily.value?.spotBasis ?? {})
const yearlyMonths = computed(() => {
  const rows = displayItem.value?.monthly ?? []
  const latestYear = (displayItem.value?.latest?.date || displayItem.value?.today?.date || '').slice(0, 4)
  return rows.filter((row) => !latestYear || row.month.startsWith(latestYear))
})
const selectedMonth = computed(() => {
  return yearlyMonths.value.find((row) => row.month === selectedMonthKey.value) ?? yearlyMonths.value.at(-1) ?? null
})
const selectedMonthIndex = computed(() => yearlyMonths.value.findIndex((row) => row.month === selectedMonth.value?.month))
const previousMonth = computed(() => {
  const index = selectedMonthIndex.value
  return index > 0 ? yearlyMonths.value[index - 1] : null
})
const supplyNotes = computed(() => buildMonthlySupplyNotes(displayItem.value, selectedMonth.value, previousMonth.value))
const demandNotes = computed(() => buildMonthlyDemandNotes(displayItem.value, selectedMonth.value, previousMonth.value))
const latestDaily = computed(() => recentDailyRows.value.at(-1) ?? displayItem.value?.latest ?? null)
const latestSpotBasis = computed(() => latestDaily.value?.spotBasis ?? displayItem.value?.latest?.spotBasis ?? {})
const latestTrendRows = computed(() => recentDailyRows.value.slice(-7))
const latestMonth = computed(() => yearlyMonths.value.at(-1) ?? null)
const previousLatestMonth = computed(() => {
  const index = yearlyMonths.value.findIndex((row) => row.month === latestMonth.value?.month)
  return index > 0 ? yearlyMonths.value[index - 1] : null
})
const currentSupplyNotes = computed(() => buildMonthlySupplyNotes(displayItem.value, latestMonth.value, previousLatestMonth.value))
const currentDemandNotes = computed(() => buildMonthlyDemandNotes(displayItem.value, latestMonth.value, previousLatestMonth.value))
const latestWilliamsR = computed(() => calculateSelectedWilliamsR(displayItem.value, latestDaily.value))
const aiTrendAnalysis = computed(() =>
  buildAiTrendAnalysis({
    rows: latestTrendRows.value,
    current: latestDaily.value,
    spotBasis: latestSpotBasis.value,
    williamsR: latestWilliamsR.value,
    priceDigits: displayItem.value?.priceDigits ?? 0,
    month: latestMonth.value,
    supplyNotes: currentSupplyNotes.value,
    demandNotes: currentDemandNotes.value,
    news: relatedNews.value.slice(0, 8)
  })
)
const waveAiAnalysis = computed(() =>
  buildWaveAiAnalysis({
    history: displayItem.value?.history ?? [],
    weekly: displayItem.value?.weekly ?? [],
    current: latestDaily.value,
    priceDigits: displayItem.value?.priceDigits ?? 0,
    williamsR: latestWilliamsR.value,
    atr: displayItem.value?.metrics?.atr14
  })
)
const bullBearAnalysis = computed(() =>
  buildBullBearAnalysis({
    rows: latestTrendRows.value,
    current: latestDaily.value,
    spotBasis: latestSpotBasis.value,
    williamsR: latestWilliamsR.value,
    priceDigits: displayItem.value?.priceDigits ?? 0,
    month: latestMonth.value,
    supplyNotes: currentSupplyNotes.value,
    demandNotes: currentDemandNotes.value,
    news: relatedNews.value.slice(0, 10),
    wave: waveAiAnalysis.value
  })
)
const limitStatus = computed(() => getLimitStatus(item.value))

watch(
  () => recentDailyRows.value.map((row) => row.date).join(','),
  () => {
    if (!recentDailyRows.value.some((row) => row.date === selectedTradeDate.value)) {
      selectedTradeDate.value = recentDailyRows.value.at(-1)?.date ?? ''
    }
  },
  { immediate: true }
)

watch(
  () => yearlyMonths.value.map((row) => row.month).join(','),
  () => {
    if (!yearlyMonths.value.some((row) => row.month === selectedMonthKey.value)) {
      selectedMonthKey.value = yearlyMonths.value.at(-1)?.month ?? ''
    }
  },
  { immediate: true }
)

function refresh() {
  if (activeContract.value) {
    store.refreshIntraday(activeContract.value)
  } else if (baseItem.value?.symbol) {
    store.refreshIntraday(baseItem.value.symbol)
  } else {
    store.load(true)
  }
}

function selectTradeDate(date) {
  if (!recentDailyRows.value.some((row) => row.date === date)) return
  selectedTradeDate.value = date
}

function selectMonth(month) {
  if (!yearlyMonths.value.some((row) => row.month === month)) return
  selectedMonthKey.value = month
}

function isLimitUpPrice(row) {
  if (!Number.isFinite(row?.limitUp) || !Number.isFinite(row?.close)) return false
  return row.close >= row.limitUp
}

function isLimitDownPrice(row) {
  if (!Number.isFinite(row?.limitDown) || !Number.isFinite(row?.close)) return false
  return row.close <= row.limitDown
}

function buildMonthlySupplyNotes(currentItem, month, prevMonth) {
  if (!month) return []
  const notes = []
  const pushUnique = (arr, val) => {
    const text = (val ?? '').toString().trim()
    if (text && !arr.includes(text)) arr.push(text)
  }
  if (month.supplyTone === 'tight') pushUnique(notes, '供应偏紧，关注产能释放节奏。')
  else if (month.supplyTone === 'loose') pushUnique(notes, '供应充裕，关注去库进展。')
  if (Number.isFinite(month.production)) pushUnique(notes, `产量 ${formatNumber(month.production)} 万吨。`)
  if (Number.isFinite(month.imports)) pushUnique(notes, `进口 ${formatNumber(month.imports)} 万吨。`)
  if (Number.isFinite(month.inventory)) pushUnique(notes, `库存 ${formatNumber(month.inventory)} 万吨。`)
  if (prevMonth && Number.isFinite(month.inventory) && Number.isFinite(prevMonth.inventory)) {
    const change = month.inventory - prevMonth.inventory
    pushUnique(notes, `库存环比${change > 0 ? '增加' : '减少'} ${formatSignedNumber(Math.abs(change))} 万吨。`)
  }
  if (Number.isFinite(month.volume)) pushUnique(notes, `本月累计成交 ${compactNumber(month.volume)}，覆盖 ${month.tradingDays || '--'} 个交易日。`)
  const base = currentItem?.fundamentals?.supply ?? []
  if (base.length) pushUnique(notes, `基础关注：${base[monthSeed(month) % base.length]}`)
  return notes.slice(0, 5)
}

function buildMonthlyDemandNotes(currentItem, month, prevMonth) {
  if (!month) return []
  const notes = []
  const pushUnique = (arr, val) => {
    const text = (val ?? '').toString().trim()
    if (text && !arr.includes(text)) arr.push(text)
  }
  if (month.supplyTone === 'tight') pushUnique(notes, '需求端支撑偏强。')
  else if (month.supplyTone === 'loose') pushUnique(notes, '需求端承压。')
  if (Number.isFinite(month.consumption)) pushUnique(notes, `消费 ${formatNumber(month.consumption)} 万吨。`)
  if (Number.isFinite(month.exports)) pushUnique(notes, `出口 ${formatNumber(month.exports)} 万吨。`)
  if (Number.isFinite(month.inventory)) pushUnique(notes, `库存 ${formatNumber(month.inventory)} 万吨。`)
  if (prevMonth && Number.isFinite(month.inventory) && Number.isFinite(prevMonth.inventory)) {
    const change = month.inventory - prevMonth.inventory
    pushUnique(notes, `库存环比${change > 0 ? '增加' : '减少'} ${formatSignedNumber(Math.abs(change))} 万吨。`)
  }
  if (Number.isFinite(month.volume)) pushUnique(notes, `本月累计成交 ${compactNumber(month.volume)}，覆盖 ${month.tradingDays || '--'} 个交易日。`)
  const base = currentItem?.fundamentals?.demand ?? []
  if (base.length) pushUnique(notes, `基础关注：${base[monthSeed(month) % base.length]}`)
  return notes.slice(0, 5)
}

function buildAiTrendAnalysis({ rows, current, spotBasis, williamsR, priceDigits, month, supplyNotes, demandNotes, news }) {
  const clean = rows.filter((row) => Number.isFinite(row?.close))
  if (!clean.length) {
    return {
      scope: '截至今日',
      label: '等待数据',
      biasClass: 'neutral',
      summary: '行情和供需数据不足，暂无法生成走势预测。',
      signals: [],
      details: []
    }
  }

  const first = clean[0]
  const last = Number.isFinite(current?.close) ? current : clean.at(-1)
  const high = Math.max(...clean.map((row) => row.high).filter(Number.isFinite))
  const low = Math.min(...clean.map((row) => row.low).filter(Number.isFinite))
  const netPct = first.close ? (last.close - first.close) / first.close : null
  const rangePct = Number.isFinite(high) && Number.isFinite(low) && last.close ? (high - low) / last.close : null
  const volumes = clean.map((row) => row.volume).filter(Number.isFinite)
  const avgVolume = volumes.length ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : null
  const volumeRatio = Number.isFinite(last.volume) && Number.isFinite(avgVolume) && avgVolume
    ? last.volume / avgVolume - 1
    : null
  const oiStart = clean.find((row) => Number.isFinite(row.openInterest))?.openInterest
  const oiEnd = [...clean].reverse().find((row) => Number.isFinite(row.openInterest))?.openInterest
  const oiChange = Number.isFinite(oiStart) && Number.isFinite(oiEnd) ? oiEnd - oiStart : null
  const basisText = Number.isFinite(spotBasis?.basis)
    ? `期现基差 ${formatBasisValue(spotBasis.basis, priceDigits)}`
    : spotBasis?.status || '期现基差待接入'
  const newsTone = summarizeNewsTone(news)
  const supplyDemand = summarizeSupplyDemand(month, supplyNotes, demandNotes)
  const score = forecastScore({
    netPct,
    volumeRatio,
    oiChange,
    williamsR,
    basis: spotBasis?.basis,
    supplyTone: month?.supplyTone,
    newsTone
  })
  const label = forecastLabel(score, williamsR)
  const biasClass = score > 0.8 ? 'tight' : score < -0.8 ? 'loose' : 'neutral'
  const scopeDays = clean.length >= 7 ? '近 7 个交易日' : `近 ${clean.length} 个交易日`
  const scope = `${last.isLive ? '截至今日盘中' : '截至最新交易日'} · ${last.date}`
  const prediction = forecastSentence(label, score, williamsR, netPct)

  return {
    scope,
    label,
    biasClass,
    summary: `综合今日行情、${scopeDays}量价、持仓、${basisText}和当前供需，${prediction}`,
    signals: [
      { label: '预测', value: label, meta: confidenceText(score), class: changeClass(score) },
      { label: '动能', value: formatSignedPct(netPct), meta: `${formatNumber(first.close, priceDigits)} → ${formatNumber(last.close, priceDigits)}`, class: changeClass(netPct) },
      { label: '资金', value: compactNumber(oiEnd), meta: `成交${volumeRatioText(volumeRatio)}，持仓${openInterestText(oiChange)}`, class: changeClass(oiChange) },
      { label: '供需', value: supplyDemand.label, meta: supplyDemand.meta, class: supplyDemand.class }
    ],
    details: [
      `行情：${scopeDays}累计 ${formatSignedPct(netPct)}，区间振幅 ${formatPct(rangePct)}，今日最新价 ${formatNumber(last.close, priceDigits)}。`,
      `资金：最新成交量 ${compactNumber(last.volume)}，${volumeRatioText(volumeRatio)}；持仓量 ${compactNumber(oiEnd)}，${openInterestText(oiChange)}。`,
      `供需：${supplyDemand.detail}`,
      `资讯：${newsTone.detail}`
    ]
  }
}

function buildBullBearAnalysis({ rows, current, spotBasis, williamsR, priceDigits, month, supplyNotes, demandNotes, news, wave }) {
  const clean = rows.filter((row) => Number.isFinite(row?.close))
  if (!clean.length) {
    return emptyBullBearAnalysis('行情、供需和资讯数据不足，暂无法拆分近期利多利空。')
  }

  const first = clean[0]
  const last = Number.isFinite(current?.close) ? current : clean.at(-1)
  const high = Math.max(...clean.map((row) => row.high).filter(Number.isFinite))
  const low = Math.min(...clean.map((row) => row.low).filter(Number.isFinite))
  const netPct = first.close ? (last.close - first.close) / first.close : null
  const rangePct = Number.isFinite(high) && Number.isFinite(low) && last.close ? (high - low) / last.close : null
  const closePosition = Number.isFinite(high) && Number.isFinite(low) && high !== low
    ? (last.close - low) / (high - low)
    : null
  const volumes = clean.map((row) => row.volume).filter(Number.isFinite)
  const avgVolume = volumes.length ? volumes.reduce((sum, value) => sum + value, 0) / volumes.length : null
  const volumeRatio = Number.isFinite(last.volume) && Number.isFinite(avgVolume) && avgVolume
    ? last.volume / avgVolume - 1
    : null
  const oiStart = clean.find((row) => Number.isFinite(row.openInterest))?.openInterest
  const oiEnd = [...clean].reverse().find((row) => Number.isFinite(row.openInterest))?.openInterest
  const oiChange = Number.isFinite(oiStart) && Number.isFinite(oiEnd) ? oiEnd - oiStart : null
  const newsTone = summarizeNewsTone(news)
  const supplyDemand = summarizeSupplyDemand(month, supplyNotes, demandNotes)
  const bullish = []
  const bearish = []

  if (Number.isFinite(netPct)) {
    if (netPct >= 0.012) addBullBearFactor(bullish, '价格动能走强', `近端累计上涨 ${formatSignedPct(netPct)}，短线买盘占优。`, 1.6)
    else if (netPct >= 0.004) addBullBearFactor(bullish, '价格温和反弹', `近端累计上涨 ${formatSignedPct(netPct)}，价格重心小幅抬升。`, 1)
    else if (netPct <= -0.012) addBullBearFactor(bearish, '价格动能走弱', `近端累计下跌 ${formatSignedPct(netPct)}，空头压制较明显。`, 1.6)
    else if (netPct <= -0.004) addBullBearFactor(bearish, '价格温和回落', `近端累计下跌 ${formatSignedPct(netPct)}，价格重心小幅下移。`, 1)
  }

  if (Number.isFinite(closePosition)) {
    if (closePosition >= 0.72 && (netPct ?? 0) >= 0) {
      addBullBearFactor(bullish, '收盘靠近区间上沿', `最新价位于近端区间高位，区间振幅 ${formatPct(rangePct)}。`, 0.8)
    } else if (closePosition <= 0.28 && (netPct ?? 0) <= 0) {
      addBullBearFactor(bearish, '收盘靠近区间下沿', `最新价位于近端区间低位，区间振幅 ${formatPct(rangePct)}。`, 0.8)
    }
  }

  if (Number.isFinite(volumeRatio) && Math.abs(volumeRatio) >= 0.08 && Number.isFinite(netPct)) {
    if (volumeRatio > 0 && netPct > 0) addBullBearFactor(bullish, '放量上涨确认', `成交量${volumeRatioText(volumeRatio)}，与价格上涨同向。`, 1.2)
    else if (volumeRatio > 0 && netPct < 0) addBullBearFactor(bearish, '放量下跌确认', `成交量${volumeRatioText(volumeRatio)}，与价格下跌同向。`, 1.2)
    else if (volumeRatio < 0 && netPct > 0) addBullBearFactor(bearish, '反弹量能不足', `成交量${volumeRatioText(volumeRatio)}，上涨持续性需要确认。`, 0.7)
    else if (volumeRatio < 0 && netPct < 0) addBullBearFactor(bullish, '下跌量能收缩', `成交量${volumeRatioText(volumeRatio)}，杀跌动能暂未放大。`, 0.7)
  }

  if (Number.isFinite(oiChange) && Number.isFinite(netPct) && oiChange !== 0) {
    if (oiChange > 0 && netPct > 0) addBullBearFactor(bullish, '增仓上行', `持仓量${openInterestText(oiChange)}，多头主动性更强。`, 1.2)
    else if (oiChange > 0 && netPct < 0) addBullBearFactor(bearish, '增仓下行', `持仓量${openInterestText(oiChange)}，空头主动性更强。`, 1.2)
    else if (oiChange < 0 && netPct > 0) addBullBearFactor(bearish, '减仓反弹', `持仓量${openInterestText(oiChange)}，上涨可能偏向空头回补。`, 0.8)
    else if (oiChange < 0 && netPct < 0) addBullBearFactor(bullish, '减仓回落', `持仓量${openInterestText(oiChange)}，下跌持续性有所削弱。`, 0.8)
  }

  if (Number.isFinite(spotBasis?.basis)) {
    if (spotBasis.basis > 0) addBullBearFactor(bullish, '现货升水支撑', `期现基差 ${formatBasisValue(spotBasis.basis, priceDigits)}，现货价格强于期货。`, 1)
    else if (spotBasis.basis < 0) addBullBearFactor(bearish, '现货贴水压制', `期现基差 ${formatBasisValue(spotBasis.basis, priceDigits)}，现货端支撑不足。`, 1)
  }

  if (month?.supplyTone === 'tight') addBullBearFactor(bullish, '供需偏紧', `${monthLabel(month.month)}供需口径偏紧。`, 1.2)
  else if (month?.supplyTone === 'loose') addBullBearFactor(bearish, '供需偏松', `${monthLabel(month.month)}供需口径偏松。`, 1.2)

  for (const note of [...(supplyNotes ?? []), ...(demandNotes ?? [])]) {
    const tone = classifyFundamentalNote(note)
    if (tone === 'bullish') addBullBearFactor(bullish, '供需线索偏多', note, 0.7)
    if (tone === 'bearish') addBullBearFactor(bearish, '供需线索偏空', note, 0.7)
  }

  const tightNews = (news ?? []).filter((row) => row.tone === 'tight')
  const looseNews = (news ?? []).filter((row) => row.tone === 'loose')
  if (tightNews.length > looseNews.length) {
    addBullBearFactor(bullish, '资讯偏多', `近端资讯偏紧 ${tightNews.length} 条，多于偏松 ${looseNews.length} 条。`, 0.9, latestNewsTitle(tightNews[0]))
  } else if (looseNews.length > tightNews.length) {
    addBullBearFactor(bearish, '资讯偏空', `近端资讯偏松 ${looseNews.length} 条，多于偏紧 ${tightNews.length} 条。`, 0.9, latestNewsTitle(looseNews[0]))
  }

  if (wave?.biasClass === 'tight') addBullBearFactor(bullish, '波浪结构偏多', `波浪计数显示 ${wave.label}。`, 0.9)
  else if (wave?.biasClass === 'loose') addBullBearFactor(bearish, '波浪结构偏空', `波浪计数显示 ${wave.label}。`, 0.9)

  if (Number.isFinite(williamsR)) {
    if (williamsR <= -80) addBullBearFactor(bullish, '技术低位修复', `W%R 为 ${williamsR.toFixed(1)}，处于${williamsText(williamsR)}。`, 0.6)
    else if (williamsR >= -20) addBullBearFactor(bearish, '技术高位回落风险', `W%R 为 ${williamsR.toFixed(1)}，处于${williamsText(williamsR)}。`, 0.6)
  }

  const bullishScore = sumFactorWeights(bullish)
  const bearishScore = sumFactorWeights(bearish)
  const score = bullishScore - bearishScore
  const verdict = classifyBullBearScore(score)
  const bullishList = prepareBullBearList(bullish, '暂无明确利多点，等待价格、基差或供需数据给出新驱动。')
  const bearishList = prepareBullBearList(bearish, '暂无明确利空点，主要风险暂未从现有数据中显现。')
  const scopeDays = clean.length >= 7 ? '近 7 个交易日' : `近 ${clean.length} 个交易日`

  return {
    scope: `${last.isLive ? '截至今日盘中' : '截至最新交易日'} · ${last.date}`,
    label: verdict.label,
    biasClass: verdict.biasClass,
    summary: `综合${scopeDays}价格、成交持仓、基差、供需、资讯与波浪结构，当前${verdict.summary}`,
    bullish: bullishList,
    bearish: bearishList,
    signals: [
      { label: '综合', value: verdict.label, meta: `净分 ${formatSignedNumber(score, 1)}`, class: changeClass(score) },
      { label: '利多权重', value: formatNumber(bullishScore, 1), meta: topFactorMeta(bullishList), class: 'up' },
      { label: '利空权重', value: formatNumber(bearishScore, 1), meta: topFactorMeta(bearishList), class: 'down' },
      { label: '观察重点', value: verdict.watch, meta: verdict.meta, class: verdict.class }
    ],
    details: [
      `价格：${scopeDays}累计 ${formatSignedPct(netPct)}，最新价 ${formatNumber(last.close, priceDigits)}，区间振幅 ${formatPct(rangePct)}。`,
      `资金：成交${volumeRatioText(volumeRatio)}，持仓${openInterestText(oiChange)}。`,
      `供需：${supplyDemand.detail}`,
      `资讯：${newsTone.detail}`
    ]
  }
}

function emptyBullBearAnalysis(summary) {
  return {
    scope: '近期多空',
    label: '等待数据',
    biasClass: 'neutral',
    summary,
    bullish: [{ title: '等待利多线索', detail: '暂无足够行情和供需数据。', meta: '观察' }],
    bearish: [{ title: '等待利空线索', detail: '暂无足够行情和供需数据。', meta: '观察' }],
    signals: [
      { label: '综合', value: '等待数据', meta: '样本不足', class: 'flat' },
      { label: '利多权重', value: '--', meta: '待确认', class: 'flat' },
      { label: '利空权重', value: '--', meta: '待确认', class: 'flat' },
      { label: '观察重点', value: '数据更新', meta: '等待新 K 线和资讯', class: 'flat' }
    ],
    details: ['等待更多行情、基差、供需和资讯数据后，再拆分近期利多利空。']
  }
}

function addBullBearFactor(list, title, detail, weight, meta = '') {
  const existing = list.find((item) => item.title === title && item.detail === detail)
  if (existing) {
    existing.weight += weight
    return
  }
  list.push({
    title,
    detail,
    weight,
    meta: meta || factorImpactText(weight)
  })
}

function prepareBullBearList(list, fallback) {
  if (!list.length) {
    return [{ title: '暂无明确信号', detail: fallback, meta: '观察' }]
  }
  return [...list]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((item) => ({
      ...item,
      meta: item.meta || factorImpactText(item.weight)
    }))
}

function sumFactorWeights(list) {
  return list.reduce((sum, item) => sum + (Number.isFinite(item.weight) ? item.weight : 0), 0)
}

function classifyFundamentalNote(note) {
  const text = String(note ?? '')
  if (!text) return 'neutral'
  if (/库存环比减少|供应偏紧|需求端支撑|去库|低库存|短缺|补库|需求.*偏强|需求.*改善/.test(text)) return 'bullish'
  if (/库存环比增加|供应充裕|需求端承压|累库|高库存|供应.*偏松|需求.*偏弱|需求.*下降/.test(text)) return 'bearish'
  return 'neutral'
}

function classifyBullBearScore(score) {
  if (score >= 2.2) {
    return {
      label: '利多占优',
      biasClass: 'tight',
      class: 'up',
      watch: '追踪阻力',
      meta: '防高位回落',
      summary: '利多因素占优，但仍需观察价格能否突破近端压力并获得成交配合。'
    }
  }
  if (score <= -2.2) {
    return {
      label: '利空占优',
      biasClass: 'loose',
      class: 'down',
      watch: '追踪支撑',
      meta: '防超跌反弹',
      summary: '利空因素占优，短线更需要关注下方支撑和需求端是否改善。'
    }
  }
  if (score >= 0.6) {
    return {
      label: '略偏利多',
      biasClass: 'tight',
      class: 'up',
      watch: '量价确认',
      meta: '等待放量',
      summary: '利多略强于利空，方向仍需要成交和持仓继续确认。'
    }
  }
  if (score <= -0.6) {
    return {
      label: '略偏利空',
      biasClass: 'loose',
      class: 'down',
      watch: '支撑确认',
      meta: '等待止跌',
      summary: '利空略强于利多，反弹持续性取决于现货和需求线索能否改善。'
    }
  }
  return {
    label: '多空均衡',
    biasClass: 'neutral',
    class: 'flat',
    watch: '等待突破',
    meta: '多空接近',
    summary: '多空因素接近平衡，价格更可能先围绕区间震荡等待新驱动。'
  }
}

function factorImpactText(weight) {
  if (weight >= 1.2) return '影响较强'
  if (weight >= 0.8) return '影响中等'
  return '影响偏弱'
}

function topFactorMeta(list) {
  const first = list.find((item) => item.title !== '暂无明确信号')
  return first ? `主因：${first.title}` : '暂无主因'
}

function latestNewsTitle(row) {
  const title = row?.title ? row.title.replace(/\s+-\s+.*$/, '') : ''
  return title ? `最新：${title}` : ''
}

function buildWaveAiAnalysis({ history, weekly, current, priceDigits, williamsR, atr }) {
  const rows = buildWaveRows(history, current).slice(-90)
  if (rows.length < 10) {
    return emptyWaveAnalysis('日 K 样本不足，至少需要 10 根有效 K 线后再生成波浪计数。')
  }

  const minMovePct = waveMinMovePct(rows, atr)
  const pivots = detectWavePivots(rows, minMovePct)
  if (pivots.length < 4) {
    return emptyWaveAnalysis('近期摆动高低点不足，当前更适合先按区间震荡观察。')
  }

  const wavePivots = pivots.slice(-7)
  const segments = buildWaveSegments(wavePivots)
  const last = rows.at(-1)
  const trend = inferWaveDirection(wavePivots, rows, weekly)
  const phase = classifyWavePhase(segments, trend)
  const levels = buildWaveLevels(wavePivots, trend, last, priceDigits, atr)
  const ratio = summarizeWaveRatio(segments, trend)
  const volume = summarizeWaveVolume(rows)
  const confidence = summarizeWaveConfidence(wavePivots, segments, minMovePct, volume.ratio)
  const scope = `${last.isLive ? '截至今日盘中' : '截至最新交易日'} · ${last.date}`
  const direction = trend === 'up' ? '上行' : trend === 'down' ? '下行' : '震荡'

  return {
    scope,
    label: phase.label,
    biasClass: phase.biasClass,
    summary: `${direction}结构处于${phase.label}，${phase.description}。关键${levels.guardLabel}在 ${levels.guardText}，${levels.targetLabel}关注 ${levels.targetText}。`,
    sketch: buildWaveSketch(wavePivots, priceDigits),
    points: labelWavePoints(wavePivots, priceDigits),
    signals: [
      { label: '结构', value: phase.shortLabel, meta: phase.meta, class: phase.class },
      { label: '比例', value: ratio.value, meta: ratio.meta, class: ratio.class },
      { label: levels.targetLabel, value: levels.targetText, meta: levels.targetMeta, class: levels.targetClass },
      { label: '可信度', value: confidence.value, meta: confidence.meta, class: confidence.class }
    ],
    details: [
      `波浪：最近 ${wavePivots.length} 个摆动点构成${direction}计数，当前腿累计 ${formatSignedPct(segments.at(-1)?.changePct)}。`,
      `比例：${ratio.detail}；若价格${levels.invalidationText}，当前波浪计数需要重置。`,
      `量价：${volume.detail}`,
      `指标：W%R ${Number.isFinite(williamsR) ? williamsR.toFixed(1) : '--'}，处于${williamsText(williamsR)}；第 5 浪或 C 浪阶段需防动能衰竭。`
    ]
  }
}

function emptyWaveAnalysis(summary) {
  return {
    scope: '波浪理论',
    label: '等待数据',
    biasClass: 'neutral',
    summary,
    sketch: null,
    points: [],
    signals: [
      { label: '结构', value: '等待确认', meta: '摆动点不足', class: 'flat' },
      { label: '比例', value: '--', meta: '斐波那契待确认', class: 'flat' },
      { label: '关键位', value: '--', meta: '等待有效高低点', class: 'flat' },
      { label: '可信度', value: '低', meta: '样本不足', class: 'flat' }
    ],
    details: ['等待更多日 K 摆动点后，再给出浪型、斐波那契目标和失效位。']
  }
}

function buildWaveRows(history, current) {
  const rows = (history ?? [])
    .map((row) => normalizeWaveRow(row))
    .filter((row) => row && [row.open, row.high, row.low, row.close].every(Number.isFinite))

  const live = normalizeWaveRow(current, rows.at(-1))
  if (live) {
    const index = rows.findIndex((row) => row.date === live.date)
    if (index >= 0) rows[index] = live
    else rows.push(live)
  }

  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

function normalizeWaveRow(row, fallback = {}) {
  if (!row?.date && !row?.endDate) return null
  const close = firstFinite(row.close, row.latestPrice, fallback.close)
  const open = firstFinite(row.open, fallback.open, close)
  const high = firstFinite(row.high, fallback.high, Math.max(open, close))
  const low = firstFinite(row.low, fallback.low, Math.min(open, close))
  return {
    date: row.date || row.endDate,
    open,
    high,
    low,
    close,
    volume: firstFinite(row.volume, fallback.volume),
    openInterest: firstFinite(row.openInterest, fallback.openInterest),
    isLive: !!row.isLive
  }
}

function detectWavePivots(rows, minMovePct) {
  const depth = rows.length >= 45 ? 2 : 1
  const raw = []

  for (let i = depth; i < rows.length - depth; i += 1) {
    const row = rows[i]
    const window = rows.slice(i - depth, i + depth + 1)
    const isHigh = window.every((entry, idx) => idx === depth || row.high >= entry.high)
    const isLow = window.every((entry, idx) => idx === depth || row.low <= entry.low)
    if (isHigh) raw.push(wavePointFromRow(row, 'high', i))
    if (isLow) raw.push(wavePointFromRow(row, 'low', i))
  }

  const first = rows[0]
  const firstType = raw[0]?.type === 'high' ? 'low' : 'high'
  raw.unshift(wavePointFromRow(first, firstType, 0))
  return ensureCurrentWavePivot(compressWavePivots(raw, minMovePct), rows, minMovePct)
}

function wavePointFromRow(row, type, index, priceOverride = null, isCurrent = false) {
  const price = Number.isFinite(priceOverride) ? priceOverride : type === 'high' ? row.high : row.low
  return {
    key: `${row.date}-${type}-${index}`,
    date: row.date,
    index,
    type,
    price,
    isCurrent
  }
}

function compressWavePivots(raw, minMovePct) {
  const ordered = raw
    .filter((point) => point?.date && Number.isFinite(point.price))
    .sort((a, b) => a.index - b.index || (a.type === 'low' ? -1 : 1))
  const out = []

  for (const point of ordered) {
    const last = out.at(-1)
    if (!last) {
      out.push(point)
      continue
    }

    if (point.index === last.index) {
      const previous = out.at(-2)
      if (previous && Math.abs(point.price - previous.price) > Math.abs(last.price - previous.price)) {
        out[out.length - 1] = point
      } else if (!previous && isMoreExtremeWavePoint(point, last)) {
        out[out.length - 1] = point
      }
      continue
    }

    if (point.type === last.type) {
      if (isMoreExtremeWavePoint(point, last) || point.isCurrent) out[out.length - 1] = point
      continue
    }

    const movePct = Math.abs(point.price - last.price) / Math.max(Math.abs(last.price), 1)
    if (movePct >= minMovePct || point.isCurrent) {
      out.push(point)
    }
  }

  return out
}

function ensureCurrentWavePivot(pivots, rows, minMovePct) {
  const lastRow = rows.at(-1)
  if (!lastRow) return pivots
  const lastPivot = pivots.at(-1)
  const currentType = !lastPivot || lastRow.close >= lastPivot.price ? 'high' : 'low'
  const currentPoint = wavePointFromRow(lastRow, currentType, rows.length - 1, lastRow.close, true)
  if (lastPivot?.index === currentPoint.index && lastPivot.type === currentPoint.type) {
    return [...pivots.slice(0, -1), { ...lastPivot, price: currentPoint.price, isCurrent: true }]
  }
  return compressWavePivots([...pivots, currentPoint], minMovePct * 0.35)
}

function buildWaveSegments(pivots) {
  return pivots.slice(1).map((point, index) => {
    const from = pivots[index]
    const change = point.price - from.price
    const changePct = from.price ? change / from.price : null
    return {
      from,
      to: point,
      change,
      changePct,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
    }
  })
}

function inferWaveDirection(pivots, rows, weekly) {
  const last = rows.at(-1)
  const base = rows[Math.max(0, rows.length - 22)]
  const swingFirst = pivots[0]
  const swingLast = pivots.at(-1)
  const weeklyRows = (weekly ?? []).filter((row) => Number.isFinite(row?.close)).slice(-8)
  const weeklyFirst = weeklyRows[0]
  const weeklyLast = weeklyRows.at(-1)
  let score = 0

  score += signScore(last?.close, base?.close, 0.006) * 1
  score += signScore(swingLast?.price, swingFirst?.price, 0.008) * 1.2
  score += signScore(weeklyLast?.close, weeklyFirst?.close, 0.006) * 0.8

  if (score > 0.25) return 'up'
  if (score < -0.25) return 'down'
  return buildWaveSegments(pivots).at(-1)?.direction || 'flat'
}

function classifyWavePhase(segments, trend) {
  const last = segments.at(-1)
  if (!last || trend === 'flat') {
    return {
      label: '区间震荡',
      shortLabel: '震荡',
      biasClass: 'neutral',
      class: 'flat',
      meta: '方向待确认',
      description: '高低点未形成稳定浪型'
    }
  }

  const directionText = trend === 'up' ? '上行' : '下行'
  const trendLegs = segments.filter((segment) => segment.direction === trend).length
  const isMotive = last.direction === trend
  const shortLabel = isMotive
    ? trendLegs <= 1 ? '第1浪' : trendLegs === 2 ? '第3浪' : '第5浪'
    : trendLegs <= 1 ? '第2浪回撤' : trendLegs === 2 ? '第4浪整理' : 'ABC调整'

  return {
    label: `${directionText}${shortLabel}`,
    shortLabel,
    biasClass: isMotive ? trend === 'up' ? 'tight' : 'loose' : 'neutral',
    class: isMotive ? trend === 'up' ? 'up' : 'down' : 'flat',
    meta: `当前腿 ${formatSignedPct(last.changePct)}`,
    description: isMotive
      ? '主推浪仍在延展，需用成交量和前高/前低突破确认'
      : '处在逆向修正腿，重点观察回撤比例和失效位'
  }
}

function buildWaveLevels(pivots, trend, last, priceDigits, atr) {
  const lastPrice = last?.close ?? pivots.at(-1)?.price
  const highs = pivots.filter((point) => point.type === 'high')
  const lows = pivots.filter((point) => point.type === 'low')
  const lastHigh = highs.at(-1)
  const lastLow = lows.at(-1)
  const previous = pivots.at(-2)
  const swing = previous && Number.isFinite(lastPrice)
    ? Math.abs(lastPrice - previous.price)
    : Math.abs((lastHigh?.price ?? lastPrice) - (lastLow?.price ?? lastPrice))
  const projectionStep = Math.max(Number.isFinite(atr) ? atr : 0, swing * 0.618, Math.abs(lastPrice) * 0.006)

  if (trend === 'down') {
    const support = lastLow?.price ?? lastPrice - projectionStep
    const resistance = lastHigh?.price ?? lastPrice + projectionStep
    const target = lastPrice <= support ? lastPrice - projectionStep : support
    return {
      guardLabel: '压力',
      guardText: formatNumber(resistance, priceDigits),
      targetLabel: '下方目标',
      targetText: formatNumber(target, priceDigits),
      targetMeta: `破位看 ${formatNumber(target - projectionStep * 0.618, priceDigits)}`,
      targetClass: 'down',
      invalidationText: `突破 ${formatNumber(resistance, priceDigits)}`
    }
  }

  const support = lastLow?.price ?? lastPrice - projectionStep
  const resistance = lastHigh?.price ?? lastPrice + projectionStep
  const target = lastPrice >= resistance ? lastPrice + projectionStep : resistance
  return {
    guardLabel: '支撑',
    guardText: formatNumber(support, priceDigits),
    targetLabel: '上方目标',
    targetText: formatNumber(target, priceDigits),
    targetMeta: `突破看 ${formatNumber(target + projectionStep * 0.618, priceDigits)}`,
    targetClass: 'up',
    invalidationText: `跌破 ${formatNumber(support, priceDigits)}`
  }
}

function summarizeWaveRatio(segments, trend) {
  const last = segments.at(-1)
  const previous = segments.at(-2)
  if (!last || !previous || !Number.isFinite(last.change) || !Number.isFinite(previous.change) || previous.change === 0) {
    return { value: '--', meta: '比例待确认', detail: '尚未形成可比较的相邻浪段', class: 'flat' }
  }

  const ratio = Math.abs(last.change / previous.change)
  const isRetracement = last.direction !== trend && previous.direction === trend
  const value = formatPct(ratio, 1)
  const label = isRetracement ? retracementLabel(ratio) : extensionLabel(ratio)
  return {
    value,
    meta: label,
    detail: `${isRetracement ? '当前修正浪' : '当前推动浪'}约为前一浪的 ${value}，属于${label}`,
    class: ratio >= 0.786 ? 'down' : ratio >= 0.382 ? 'flat' : 'up'
  }
}

function summarizeWaveVolume(rows) {
  const last = rows.at(-1)
  const previousRows = rows.slice(-11, -1)
  const avgVolume = averageFinite(previousRows.map((row) => row.volume))
  const ratio = Number.isFinite(last?.volume) && Number.isFinite(avgVolume) && avgVolume
    ? last.volume / avgVolume - 1
    : null
  const oiStart = rows.slice(-6).find((row) => Number.isFinite(row.openInterest))?.openInterest
  const oiEnd = [...rows.slice(-6)].reverse().find((row) => Number.isFinite(row.openInterest))?.openInterest
  const oiChange = Number.isFinite(oiStart) && Number.isFinite(oiEnd) ? oiEnd - oiStart : null
  return {
    ratio,
    detail: `最新成交量 ${compactNumber(last?.volume)}，${volumeRatioText(ratio)}；近 6 根 K 线持仓${openInterestText(oiChange)}。`
  }
}

function summarizeWaveConfidence(pivots, segments, minMovePct, volumeRatio) {
  const lastMovePct = Math.abs(segments.at(-1)?.changePct ?? 0)
  let score = 0
  if (pivots.length >= 6) score += 1
  if (segments.length >= 4) score += 1
  if (lastMovePct >= minMovePct) score += 1
  if (Number.isFinite(volumeRatio) && volumeRatio > 0.08) score += 1

  if (score >= 3) return { value: '较高', meta: '摆动与量能确认', class: 'up' }
  if (score >= 2) return { value: '中等', meta: '结构基本成型', class: 'flat' }
  return { value: '偏低', meta: '等待突破确认', class: 'down' }
}

function labelWavePoints(pivots, priceDigits) {
  const labels = ['起点', '1浪', '2浪', '3浪', '4浪', '5浪', '现价']
  return pivots.map((point, index) => ({
    key: point.key,
    label: point.isCurrent ? '现价' : labels[index] ?? `${index}浪`,
    date: dateDayLabel(point.date),
    price: formatNumber(point.price, priceDigits),
    class: point.type === 'high' ? 'pivot-high' : 'pivot-low'
  }))
}

function buildWaveSketch(pivots, priceDigits) {
  if (!Array.isArray(pivots) || pivots.length < 2) return null
  const points = pivots.filter((point) => Number.isFinite(point.price))
  if (points.length < 2) return null

  const prices = points.map((point) => point.price)
  const high = Math.max(...prices)
  const low = Math.min(...prices)
  const span = Math.max(high - low, Math.abs(high) * 0.01, 1)
  const paddedHigh = high + span * 0.12
  const paddedLow = low - span * 0.12
  const paddedSpan = paddedHigh - paddedLow
  const labels = ['起点', '1浪', '2浪', '3浪', '4浪', '5浪', '现价']
  const denominator = Math.max(1, points.length - 1)
  const nodes = points.map((point, index) => {
    const x = (index / denominator) * 84 + 8
    const y = ((paddedHigh - point.price) / paddedSpan) * 48 + 8
    return {
      key: point.key,
      label: point.isCurrent ? '现价' : labels[index] ?? `${index}浪`,
      price: formatNumber(point.price, priceDigits),
      x: roundChartCoord(x),
      y: roundChartCoord(y),
      left: `${roundChartCoord(x)}%`,
      top: `${roundChartCoord((y / 64) * 100)}%`,
      class: point.type === 'high' ? 'pivot-high' : 'pivot-low'
    }
  })
  const linePoints = nodes.map((node) => `${node.x},${node.y}`).join(' ')

  return {
    highLabel: formatNumber(high, priceDigits),
    lowLabel: formatNumber(low, priceDigits),
    gridLines: [14, 32, 50],
    linePoints,
    areaPoints: `${linePoints} ${nodes.at(-1).x},60 ${nodes[0].x},60`,
    nodes
  }
}

function roundChartCoord(value) {
  return Math.round(value * 100) / 100
}

function waveMinMovePct(rows, atr) {
  const lastClose = rows.at(-1)?.close
  const ranges = rows.map((row) => row.close ? (row.high - row.low) / row.close : null)
  const changes = rows.slice(1).map((row, index) => rows[index].close ? Math.abs(row.close - rows[index].close) / rows[index].close : null)
  const volatility = Math.max(averageFinite(ranges) || 0, averageFinite(changes) * 1.6 || 0)
  const atrPct = Number.isFinite(atr) && Number.isFinite(lastClose) && lastClose ? atr / lastClose : 0
  return clampNumber(Math.max(volatility * 1.4, atrPct * 0.7), 0.006, 0.035)
}

function isMoreExtremeWavePoint(point, target) {
  return point.type === 'high' ? point.price > target.price : point.price < target.price
}

function signScore(current, base, threshold) {
  if (!Number.isFinite(current) || !Number.isFinite(base) || !base) return 0
  const changePctValue = (current - base) / base
  if (changePctValue > threshold) return 1
  if (changePctValue < -threshold) return -1
  return 0
}

function averageFinite(values) {
  const clean = values.filter(Number.isFinite)
  if (!clean.length) return null
  return clean.reduce((sum, value) => sum + value, 0) / clean.length
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? null
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function retracementLabel(ratio) {
  if (!Number.isFinite(ratio)) return '比例待确认'
  if (ratio < 0.382) return '浅回撤'
  if (ratio <= 0.618) return '标准回撤'
  if (ratio <= 0.786) return '深回撤'
  return '回撤过深'
}

function extensionLabel(ratio) {
  if (!Number.isFinite(ratio)) return '比例待确认'
  if (ratio < 0.618) return '弱延展'
  if (ratio <= 1.618) return '标准延展'
  return '加速延展'
}

function calculateSelectedWilliamsR(currentItem, row) {
  if (!currentItem || !row) return null
  if (row.isLive) return currentItem.metrics?.williamsR ?? null
  const history = currentItem.history ?? []
  const index = history.findIndex((entry) => entry.date === row.date)
  if (index < 13) return currentItem.metrics?.williamsR ?? null
  const window = history.slice(index - 13, index + 1)
  const high = Math.max(...window.map((entry) => entry.high).filter(Number.isFinite))
  const low = Math.min(...window.map((entry) => entry.low).filter(Number.isFinite))
  if (!Number.isFinite(high) || !Number.isFinite(low) || high === low) return null
  return ((high - row.close) / (high - low)) * -100
}

function trendLabel(changePctValue, openInterestChange) {
  if (!Number.isFinite(changePctValue)) return '数据观察'
  if (changePctValue > 0.015 && openInterestChange > 0) return '增仓上行'
  if (changePctValue > 0.006) return '偏强震荡'
  if (changePctValue < -0.015 && openInterestChange > 0) return '增仓下行'
  if (changePctValue < -0.006) return '偏弱震荡'
  return '窄幅整理'
}

function forecastScore({ netPct, volumeRatio, oiChange, williamsR, basis, supplyTone, newsTone }) {
  let score = 0
  if (Number.isFinite(netPct)) {
    if (netPct > 0.015) score += 2
    else if (netPct > 0.006) score += 1
    else if (netPct < -0.015) score -= 2
    else if (netPct < -0.006) score -= 1
  }
  if (Number.isFinite(volumeRatio) && Math.abs(volumeRatio) > 0.08 && Number.isFinite(netPct)) {
    score += volumeRatio > 0 ? Math.sign(netPct || 0) * 0.8 : -Math.sign(netPct || 0) * 0.3
  }
  if (Number.isFinite(oiChange) && Math.abs(oiChange) > 0 && Number.isFinite(netPct)) {
    score += oiChange > 0 ? Math.sign(netPct || 0) * 0.8 : -Math.sign(netPct || 0) * 0.3
  }
  if (Number.isFinite(basis)) {
    if (basis > 0) score += 0.7
    else if (basis < 0) score -= 0.7
  }
  if (supplyTone === 'tight') score += 0.8
  if (supplyTone === 'loose') score -= 0.8
  score += newsTone.score
  if (Number.isFinite(williamsR)) {
    if (williamsR >= -12) score -= 0.4
    else if (williamsR <= -88) score += 0.4
  }
  return score
}

function forecastLabel(score, williamsR) {
  if (score >= 2.2) return Number.isFinite(williamsR) && williamsR >= -15 ? '偏强高位震荡' : '偏强震荡'
  if (score <= -2.2) return Number.isFinite(williamsR) && williamsR <= -85 ? '偏弱低位震荡' : '偏弱震荡'
  if (score >= 0.8) return '温和偏强'
  if (score <= -0.8) return '温和偏弱'
  return '区间震荡'
}

function forecastSentence(label, score, williamsR, netPct) {
  const base = `预计短线以${label}为主`
  if (score >= 2.2 && Number.isFinite(williamsR) && williamsR >= -15) {
    return `${base}，但 W%R 已接近高位区，追涨动能需要成交继续放大确认。`
  }
  if (score <= -2.2 && Number.isFinite(williamsR) && williamsR <= -85) {
    return `${base}，价格处于偏弱区间，若现货或需求未改善，反弹持续性仍需谨慎观察。`
  }
  if (score >= 0.8) return `${base}，价格仍有上探弹性，关注近期高点和持仓变化。`
  if (score <= -0.8) return `${base}，下方关注近期低点支撑和需求兑现。`
  if (Number.isFinite(netPct) && Math.abs(netPct) < 0.004) return `${base}，量价信号尚未给出明确方向，等待突破后再确认。`
  return `${base}，多空因素接近平衡，重点看成交量和供需新闻是否给出新驱动。`
}

function confidenceText(score) {
  const level = Math.min(3, Math.max(1, Math.ceil(Math.abs(score))))
  return level >= 3 ? '信号较强' : level === 2 ? '信号中等' : '信号一般'
}

function summarizeSupplyDemand(month, supplyNotes, demandNotes) {
  const supply = firstMeaningfulNote(supplyNotes) || '供应信息待更新'
  const demand = firstMeaningfulNote(demandNotes) || '需求信息待更新'
  const label = month?.supplyTone === 'tight' ? '偏紧' : month?.supplyTone === 'loose' ? '偏松' : '中性'
  const klass = month?.supplyTone === 'tight' ? 'up' : month?.supplyTone === 'loose' ? 'down' : 'flat'
  return {
    label,
    class: klass,
    meta: month?.month ? `${monthLabel(month.month)}供需` : '当前供需',
    detail: `供应端：${supply}；需求端：${demand}`
  }
}

function summarizeNewsTone(news) {
  const rows = news ?? []
  const tight = rows.filter((row) => row.tone === 'tight').length
  const loose = rows.filter((row) => row.tone === 'loose').length
  const neutral = rows.length - tight - loose
  const score = tight > loose ? 0.6 : loose > tight ? -0.6 : 0
  const label = tight > loose ? '偏多' : loose > tight ? '偏空' : '中性'
  const title = rows[0]?.title ? rows[0].title.replace(/\s+-\s+.*$/, '') : '暂无新增供需资讯'
  return {
    score,
    label,
    detail: `近端资讯${label}，偏紧 ${tight} 条、偏松 ${loose} 条、中性 ${neutral} 条；最新关注：${title}`
  }
}

function firstMeaningfulNote(notes) {
  return (notes ?? []).find((note) => note && !note.startsWith('基础关注：')) ?? notes?.[0] ?? ''
}

function volumeRatioText(value) {
  if (!Number.isFinite(value)) return '较近均量待确认'
  if (Math.abs(value) < 0.05) return '接近近均量'
  return `较近均量${value > 0 ? '放大' : '收缩'} ${formatSignedPct(value)}`
}

function openInterestText(value) {
  if (!Number.isFinite(value)) return '变化待确认'
  if (value === 0) return '基本持平'
  return `${value > 0 ? '增加' : '减少'} ${formatSignedNumber(value)}`
}

function williamsText(value) {
  if (!Number.isFinite(value)) return '等待指标'
  if (value <= -80) return '低位区'
  if (value >= -20) return '高位区'
  return '中性区'
}

function monthSeed(month) {
  return Math.max(0, Number(month?.month?.slice(5, 7)) - 1 || 0)
}
</script>
