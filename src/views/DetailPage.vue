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

            <div class="wave-ai-card chanlun-card">
              <div class="ai-card-head">
                <div class="ai-card-title">
                  <strong>缠论 AI 分析</strong>
                  <span>{{ chanlunAnalysis.scope }}</span>
                </div>
                <span class="tone-pill" :class="chanlunAnalysis.biasClass">{{ chanlunAnalysis.label }}</span>
              </div>
              <p class="ai-summary">{{ chanlunAnalysis.summary }}</p>
              <div v-if="chanlunAnalysis.sketch" class="wave-sketch" aria-label="缠论笔与中枢走势">
                <div class="wave-sketch-scale">
                  <span>{{ chanlunAnalysis.sketch.highLabel }}</span>
                  <span>{{ chanlunAnalysis.sketch.lowLabel }}</span>
                </div>
                <div class="wave-sketch-canvas">
                  <svg viewBox="0 0 100 64" preserveAspectRatio="none">
                    <line
                      v-for="line in chanlunAnalysis.sketch.gridLines"
                      :key="line"
                      class="wave-sketch-grid"
                      x1="0"
                      x2="100"
                      :y1="line"
                      :y2="line"
                    />
                    <rect
                      v-for="(zhongshu, idx) in chanlunAnalysis.sketch.zhongshuBoxes"
                      :key="'zs-' + idx"
                      class="chanlun-zhongshu-box"
                      :x="zhongshu.x"
                      :y="zhongshu.y"
                      :width="zhongshu.width"
                      :height="zhongshu.height"
                    />
                    <polyline class="wave-sketch-line" :points="chanlunAnalysis.sketch.linePoints" />
                    <circle
                      v-for="point in chanlunAnalysis.sketch.nodes"
                      :key="point.key"
                      class="wave-sketch-dot"
                      :class="point.class"
                      :cx="point.x"
                      :cy="point.y"
                      r="2.2"
                    />
                  </svg>
                  <div
                    v-for="point in chanlunAnalysis.sketch.nodes"
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
              <div v-if="chanlunAnalysis.points.length" class="wave-path" aria-label="缠论分笔路径">
                <div v-for="point in chanlunAnalysis.points" :key="point.key" class="wave-point" :class="point.class">
                  <span>{{ point.label }}</span>
                  <strong>{{ point.price }}</strong>
                  <em>{{ point.date }}</em>
                </div>
              </div>
              <div class="ai-signal-grid wave-signal-grid">
                <div v-for="signal in chanlunAnalysis.signals" :key="signal.label">
                  <span>{{ signal.label }}</span>
                  <strong :class="signal.class">{{ signal.value }}</strong>
                  <em>{{ signal.meta }}</em>
                </div>
              </div>
              <ul class="ai-detail-list wave-detail-list">
                <li v-for="(note, idx) in chanlunAnalysis.details" :key="idx">{{ note }}</li>
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
const chanlunAnalysis = computed(() =>
  buildChanlunAnalysis({
    history: displayItem.value?.history ?? [],
    current: latestDaily.value,
    priceDigits: displayItem.value?.priceDigits ?? 0,
    williamsR: latestWilliamsR.value
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
  const rows = buildWaveRows(history, current).slice(-120)
  if (rows.length < 10) {
    return emptyWaveAnalysis('日 K 样本不足，至少需要 10 根有效 K 线后再生成波浪计数。')
  }

  const minMovePct = waveMinMovePct(rows, atr)
  const pivots = detectWavePivots(rows, minMovePct)
  if (pivots.length < 4) {
    return emptyWaveAnalysis('近期摆动高低点不足，当前更适合先按区间震荡观察。')
  }

  const wavePivots = pivots.slice(-9)
  const segments = buildWaveSegments(wavePivots)
  const last = rows.at(-1)
  const lastPrice = last.close
  const trend = inferWaveDirection(wavePivots, rows, weekly)
  const volume = summarizeWaveVolume(rows)

  const primary = buildElliottScenario(wavePivots, segments, trend, lastPrice, priceDigits, atr, 'primary')
  const alternate = buildElliottScenario(wavePivots, segments, trend, lastPrice, priceDigits, atr, 'alternate')
  const fibMatrix = buildFibonacciMatrix(wavePivots, segments, trend, lastPrice, priceDigits)
  const confidence = summarizeWaveConfidence(wavePivots, segments, minMovePct, volume.ratio, primary)
  const timeRef = buildTimeReference(wavePivots, rows)

  const scope = `${last.isLive ? '截至今日盘中' : '截至最新交易日'} · ${last.date}`
  const direction = trend === 'up' ? '上行' : trend === 'down' ? '下行' : '震荡'

  const summary = buildWaveSummary(primary, alternate, fibMatrix, direction, lastPrice, priceDigits)

  return {
    scope,
    label: primary.label,
    biasClass: primary.biasClass,
    summary,
    sketch: buildWaveSketch(wavePivots, priceDigits),
    points: labelWavePoints(wavePivots, priceDigits, primary),
    signals: [
      { label: '主选浪型', value: primary.shortLabel, meta: primary.meta, class: primary.class },
      { label: '当前阶段', value: primary.phaseLabel, meta: primary.phaseMeta, class: primary.phaseClass },
      { label: '斐波那契', value: fibMatrix.nearestLabel, meta: fibMatrix.nearestMeta, class: fibMatrix.nearestClass },
      { label: '可信度', value: confidence.value, meta: confidence.meta, class: confidence.class }
    ],
    details: [
      `【主选】${primary.label}：${primary.description}`,
      `  → 目标位 ${primary.targetText}，失效位 ${primary.invalidationText}`,
      `  → 后续路径：${primary.pathDescription}`,
      `【备选】${alternate.label}：${alternate.description}`,
      `  → 目标位 ${alternate.targetText}，失效位 ${alternate.invalidationText}`,
      `  → 后续路径：${alternate.pathDescription}`,
      `【斐波那契矩阵】${fibMatrix.detail}`,
      `【量价配合】${volume.detail}`,
      `【时间参考】${timeRef.detail}`,
      `【指标辅助】W%R ${Number.isFinite(williamsR) ? williamsR.toFixed(1) : '--'}，${williamsText(williamsR)}；${primary.indicatorNote}`
    ]
  }
}

function buildElliottScenario(pivots, segments, trend, lastPrice, priceDigits, atr, mode) {
  const isAlt = mode === 'alternate'
  const directionText = trend === 'up' ? '上行' : trend === 'down' ? '下行' : '震荡'
  const trendLegs = segments.filter(s => s.direction === trend).length
  const counterLegs = segments.filter(s => s.direction !== trend && s.direction !== 'flat').length
  const lastSeg = segments.at(-1)
  const prevSeg = segments.at(-2)
  const isMotive = lastSeg?.direction === trend

  const highs = pivots.filter(p => p.type === 'high')
  const lows = pivots.filter(p => p.type === 'low')
  const lastHigh = highs.at(-1)
  const lastLow = lows.at(-1)
  const prevHigh = highs.at(-2)
  const prevLow = lows.at(-2)

  let label, shortLabel, biasClass, classVal, meta, phaseLabel, phaseMeta, phaseClass
  let description, targetText, invalidationText, pathDescription, indicatorNote

  if (trend === 'flat') {
    label = '区间震荡'
    shortLabel = '震荡'
    biasClass = 'neutral'
    classVal = 'flat'
    meta = '方向待确认'
    phaseLabel = '无明确浪型'
    phaseMeta = '高低点未形成推动结构'
    phaseClass = 'flat'
    description = '当前价格在区间内运行，尚未形成有效的推动浪结构，建议等待方向突破。'
    targetText = isAlt
      ? `${formatNumber(lastLow?.price ?? lastPrice, priceDigits)}（下边界）`
      : `${formatNumber(lastHigh?.price ?? lastPrice, priceDigits)}（上边界）`
    invalidationText = isAlt
      ? `${formatNumber(lastHigh?.price ?? lastPrice, priceDigits)}（上破转多）`
      : `${formatNumber(lastLow?.price ?? lastPrice, priceDigits)}（下破转空）`
    pathDescription = isAlt
      ? '若跌破区间下沿，可能开启下行推动浪（1-2-3-4-5），首个目标为区间幅度的1.272倍扩展'
      : '若突破区间上沿，可能开启上行推动浪（1-2-3-4-5），首个目标为区间幅度的1.272倍扩展'
    indicatorNote = '震荡区间内指标信号反复，不宜过度依赖。'
  } else if (isMotive) {
    if (isAlt) {
      label = `${directionText}C浪反弹`
      shortLabel = 'C浪'
      biasClass = 'neutral'
      classVal = 'flat'
      meta = '修正浪C'
      phaseLabel = 'C浪末段'
      phaseMeta = '可能接近修正终点'
      phaseClass = 'flat'
      description = '当前上涨可能是更大级别调整浪的C浪，而非新推动浪的起点。C浪通常与A浪等长或0.618倍关系。'
      const aWaveSize = Math.abs((prevHigh?.price ?? lastPrice) - (prevLow?.price ?? lastPrice))
      const cTarget = (trend === 'up' ? (lastLow?.price ?? lastPrice) : (lastHigh?.price ?? lastPrice)) + (trend === 'up' ? 1 : -1) * aWaveSize
      targetText = formatNumber(cTarget, priceDigits)
      invalidationText = trend === 'up'
        ? `${formatNumber(lastLow?.price ?? lastPrice, priceDigits)}（C浪失效位）`
        : `${formatNumber(lastHigh?.price ?? lastPrice, priceDigits)}（C浪失效位）`
      pathDescription = 'C浪完成后将迎来反向推动浪，届时需重新计数。C浪终点附近可能出现量能萎缩和指标背离。'
      indicatorNote = 'C浪末期常出现量价背离和指标超买/超卖，关注背离信号。'
    } else {
      const waveNum = trendLegs <= 1 ? 1 : trendLegs === 2 ? 3 : 5
      const waveNames = { 1: '第1浪', 3: '第3浪', 5: '第5浪' }
      label = `${directionText}${waveNames[waveNum]}`
      shortLabel = `${waveNum}浪`
      biasClass = trend === 'up' ? 'tight' : 'loose'
      classVal = trend === 'up' ? 'up' : 'down'
      meta = `推动浪${waveNum}`

      if (waveNum === 1) {
        phaseLabel = '1浪延展中'
        phaseMeta = '新趋势启动'
        phaseClass = trend === 'up' ? 'up' : 'down'
        description = '第1浪正在延展，这是新趋势的起点。1浪之后通常跟随较深的2浪回撤（50%-61.8%），可作为二次建仓机会。'
        const swing0 = Math.abs(pivots[0]?.price - pivots[1]?.price) || Math.abs(lastPrice) * 0.02
        const ext1 = (trend === 'up' ? 1 : -1) * swing0 * 1.618 + pivots[0].price
        targetText = formatNumber(ext1, priceDigits)
        invalidationText = trend === 'up'
          ? `${formatNumber(pivots[0]?.price ?? lastPrice, priceDigits)}（1浪起点）`
          : `${formatNumber(pivots[0]?.price ?? lastPrice, priceDigits)}（1浪起点）`
        pathDescription = '1浪完成后→2浪回撤至1浪的38.2%-61.8%→3浪突破1浪终点加速。2浪回撤是关键加仓点，但若跌破1浪起点则计数失效。'
        indicatorNote = '1浪启动时成交量应明显放大，持仓量开始增加。'
      } else if (waveNum === 3) {
        phaseLabel = '3浪主升'
        phaseMeta = '趋势最强阶段'
        phaseClass = trend === 'up' ? 'up' : 'down'
        description = '第3浪通常是推动浪中最长最强的一浪，价格变化幅度往往是1浪的1.618-2.618倍，伴随成交量放大。'
        const wave1Size = Math.abs(pivots[1]?.price - pivots[0]?.price) || Math.abs(lastPrice) * 0.02
        const wave3Target1618 = (trend === 'up' ? 1 : -1) * wave1Size * 1.618 + pivots[2]?.price
        const wave3Target2618 = (trend === 'up' ? 1 : -1) * wave1Size * 2.618 + pivots[2]?.price
        targetText = `${formatNumber(wave3Target1618, priceDigits)} ~ ${formatNumber(wave3Target2618, priceDigits)}`
        invalidationText = trend === 'up'
          ? `${formatNumber(pivots[2]?.price ?? lastLow?.price ?? lastPrice, priceDigits)}（2浪低点）`
          : `${formatNumber(pivots[2]?.price ?? lastHigh?.price ?? lastPrice, priceDigits)}（2浪高点）`
        pathDescription = '3浪延展中→关注1.618倍和2.618倍扩展目标→3浪结束后4浪回撤至3浪的23.6%-38.2%→5浪创新高/低但力度减弱。3浪不应是最短推动浪。'
        indicatorNote = '3浪应伴随成交量持续放大和持仓量增加，若量能萎缩需警惕3浪提前结束。'
      } else {
        phaseLabel = '5浪末段'
        phaseMeta = '趋势衰竭风险'
        phaseClass = 'flat'
        description = '第5浪是推动浪的最后一浪，通常力度弱于3浪，可能出现价格创新高/低但指标背离的"末端背离"现象。'
        const wave1Size = Math.abs(pivots[1]?.price - pivots[0]?.price) || Math.abs(lastPrice) * 0.02
        const wave3Size = Math.abs(pivots[3]?.price - pivots[2]?.price) || wave1Size
        const largerImpulse = Math.max(wave1Size, wave3Size)
        const wave5Target = (trend === 'up' ? 1 : -1) * largerImpulse * 0.618 + pivots[4]?.price
        targetText = formatNumber(wave5Target, priceDigits)
        invalidationText = trend === 'up'
          ? `${formatNumber(pivots[4]?.price ?? lastLow?.price ?? lastPrice, priceDigits)}（4浪低点，5浪不能跌破）`
          : `${formatNumber(pivots[4]?.price ?? lastHigh?.price ?? lastPrice, priceDigits)}（4浪高点，5浪不能突破）`
        pathDescription = '5浪完成后→ABC调整浪回撤整个推动浪的38.2%-61.8%→A浪5小波→B浪3小波→C浪5小波。5浪末端常出现量价背离和指标超买/超卖。'
        indicatorNote = '5浪阶段重点关注量价背离和W%R超买/超卖信号，背离出现时趋势反转概率增大。'
      }
    }
  } else {
    if (isAlt) {
      label = `${directionText}新1浪启动`
      shortLabel = '新1浪'
      biasClass = trend === 'up' ? 'tight' : 'loose'
      classVal = trend === 'up' ? 'up' : 'down'
      meta = '新推动浪起点'
      phaseLabel = '1浪初期'
      phaseMeta = '可能正在启动新推动浪'
      phaseClass = trend === 'up' ? 'up' : 'down'
      description = '当前回撤可能已经结束，新推动浪的1浪正在启动。若价格突破前一个摆动高点/低点，将确认新推动浪。'
      const swingSize = Math.abs(lastHigh?.price - lastLow?.price) || Math.abs(lastPrice) * 0.02
      const newTarget = (trend === 'up' ? 1 : -1) * swingSize * 1.272 + (trend === 'up' ? lastLow?.price : lastHigh?.price)
      targetText = formatNumber(newTarget, priceDigits)
      invalidationText = trend === 'up'
        ? `${formatNumber(lastLow?.price ?? lastPrice, priceDigits)}（回撤低点）`
        : `${formatNumber(lastHigh?.price ?? lastPrice, priceDigits)}（回撤高点）`
      pathDescription = '1浪启动→2浪回撤38.2%-61.8%→3浪加速突破。若1浪突破前高/低点，则确认新推动浪开始。'
      indicatorNote = '1浪启动时成交量应放大，W%R从超买/超卖区域回归中性。'
    } else {
      const correctionNum = counterLegs <= 1 ? 2 : 4
      const correctionNames = { 2: '第2浪回撤', 4: '第4浪整理' }
      label = `${directionText}${correctionNames[correctionNum]}`
      shortLabel = `${correctionNum}浪`
      biasClass = 'neutral'
      classVal = 'flat'
      meta = `修正浪${correctionNum}`

      if (correctionNum === 2) {
        phaseLabel = '2浪回撤中'
        phaseMeta = '关键回撤区域'
        phaseClass = 'flat'
        const wave1Size = Math.abs(pivots[1]?.price - pivots[0]?.price) || Math.abs(lastPrice) * 0.02
        const retracement382 = (trend === 'up' ? 1 : -1) * wave1Size * 0.382 + (trend === 'up' ? pivots[1]?.price : pivots[1]?.price)
        const retracement618 = (trend === 'up' ? 1 : -1) * wave1Size * 0.618 + (trend === 'up' ? pivots[1]?.price : pivots[1]?.price)
        const retracement500 = (trend === 'up' ? 1 : -1) * wave1Size * 0.5 + (trend === 'up' ? pivots[1]?.price : pivots[1]?.price)
        description = `第2浪正在回撤1浪的涨幅/跌幅，关键回撤区域在38.2%（${formatNumber(retracement382, priceDigits)}）、50%（${formatNumber(retracement500, priceDigits)}）和61.8%（${formatNumber(retracement618, priceDigits)}）。2浪回撤不能超过1浪起点。`
        targetText = `${formatNumber(retracement500, priceDigits)} ~ ${formatNumber(retracement618, priceDigits)}`
        invalidationText = trend === 'up'
          ? `${formatNumber(pivots[0]?.price ?? lastPrice, priceDigits)}（1浪起点，2浪不能跌破）`
          : `${formatNumber(pivots[0]?.price ?? lastPrice, priceDigits)}（1浪起点，2浪不能突破）`
        pathDescription = '2浪回撤至38.2%-61.8%区域→若企稳则3浪启动→3浪目标为1浪的1.618-2.618倍。2浪常见锯齿形（5-3-5）或平台形（3-3-5）结构。'
        indicatorNote = '2浪回撤末期W%R进入超卖/超买区域，成交量萎缩至地量时反转概率增大。'
      } else {
        phaseLabel = '4浪整理中'
        phaseMeta = '复杂修正阶段'
        phaseClass = 'flat'
        const wave3Size = Math.abs(pivots[3]?.price - pivots[2]?.price) || Math.abs(lastPrice) * 0.02
        const retracement236 = (trend === 'up' ? 1 : -1) * wave3Size * 0.236 + (trend === 'up' ? pivots[3]?.price : pivots[3]?.price)
        const retracement382 = (trend === 'up' ? 1 : -1) * wave3Size * 0.382 + (trend === 'up' ? pivots[3]?.price : pivots[3]?.price)
        description = `第4浪是3浪后的修正，回撤幅度通常为3浪的23.6%（${formatNumber(retracement236, priceDigits)}）到38.2%（${formatNumber(retracement382, priceDigits)}）。4浪不能进入1浪价格区域（交替规则）。4浪常形成三角形或平台形。`
        targetText = `${formatNumber(retracement236, priceDigits)} ~ ${formatNumber(retracement382, priceDigits)}`
        invalidationText = trend === 'up'
          ? `${formatNumber(pivots[1]?.price ?? lastPrice, priceDigits)}（1浪高点，4浪不能跌破）`
          : `${formatNumber(pivots[1]?.price ?? lastPrice, priceDigits)}（1浪低点，4浪不能突破）`
        pathDescription = '4浪整理→5浪延展但力度减弱→5浪完成后ABC调整。4浪常比2浪复杂（交替规则），若2浪简单则4浪可能为三角形。'
        indicatorNote = '4浪整理期间成交量逐步萎缩，W%R在中性区域震荡。三角形整理末期关注突破方向。'
      }
    }
  }

  return {
    label, shortLabel, biasClass, class: classVal, meta,
    phaseLabel, phaseMeta, phaseClass,
    description, targetText, invalidationText, pathDescription, indicatorNote
  }
}

function buildFibonacciMatrix(pivots, segments, trend, lastPrice, priceDigits) {
  const highs = pivots.filter(p => p.type === 'high')
  const lows = pivots.filter(p => p.type === 'low')
  const lastHigh = highs.at(-1)
  const lastLow = lows.at(-1)
  const prevHigh = highs.at(-2)
  const prevLow = lows.at(-2)

  const lastSeg = segments.at(-1)
  const prevSeg = segments.at(-2)

  const fibRatios = [0.236, 0.382, 0.5, 0.618, 0.786]
  const fibExtensions = [0.618, 1.0, 1.272, 1.618, 2.618]

  const retracementLevels = []
  const extensionLevels = []

  if (lastSeg && Number.isFinite(lastSeg.change) && lastSeg.from.price) {
    const swingStart = lastSeg.from.price
    const swingSize = Math.abs(lastSeg.change)
    const isRetracement = lastSeg.direction !== trend

    if (isRetracement) {
      for (const ratio of fibRatios) {
        const price = trend === 'up'
          ? swingStart + swingSize * (1 - ratio) * (lastSeg.change > 0 ? 1 : -1)
          : swingStart - swingSize * (1 - ratio) * (lastSeg.change < 0 ? 1 : -1)
        const actualPrice = lastSeg.change > 0
          ? lastSeg.to.price + (lastSeg.from.price - lastSeg.to.price) * ratio
          : lastSeg.to.price + (lastSeg.from.price - lastSeg.to.price) * ratio
        retracementLevels.push({ ratio, price: actualPrice, label: `${(ratio * 100).toFixed(1)}%` })
      }
    }

    if (prevSeg && Number.isFinite(prevSeg.change) && prevSeg.from.price) {
      const impulseSize = Math.abs(prevSeg.change)
      for (const ratio of fibExtensions) {
        const price = trend === 'up'
          ? (lastHigh?.price ?? lastPrice) + impulseSize * ratio
          : (lastLow?.price ?? lastPrice) - impulseSize * ratio
        extensionLevels.push({ ratio, price, label: `${ratio.toFixed(3)}x` })
      }
    }
  }

  let nearestLabel = '--'
  let nearestMeta = '斐波那契待确认'
  let nearestClass = 'flat'

  const allLevels = [
    ...retracementLevels.map(l => ({ ...l, type: '回撤' })),
    ...extensionLevels.map(l => ({ ...l, type: '扩展' }))
  ]

  if (allLevels.length && Number.isFinite(lastPrice)) {
    let minDist = Infinity
    let nearest = null
    for (const level of allLevels) {
      const dist = Math.abs(lastPrice - level.price)
      if (dist < minDist) {
        minDist = dist
        nearest = level
      }
    }
    if (nearest) {
      const distPct = Math.abs(lastPrice - nearest.price) / Math.max(Math.abs(lastPrice), 1) * 100
      nearestLabel = nearest.label
      nearestMeta = `${nearest.type}位 ${formatNumber(nearest.price, priceDigits)}（偏离 ${distPct.toFixed(1)}%）`
      nearestClass = distPct < 0.5 ? 'up' : distPct < 2 ? 'flat' : 'down'
    }
  }

  const retraceStr = retracementLevels.length
    ? retracementLevels.map(l => `${l.label}=${formatNumber(l.price, priceDigits)}`).join('、')
    : '暂无'
  const extStr = extensionLevels.length
    ? extensionLevels.map(l => `${l.label}=${formatNumber(l.price, priceDigits)}`).join('、')
    : '暂无'

  return {
    nearestLabel, nearestMeta, nearestClass,
    retracementLevels, extensionLevels,
    detail: `回撤位：${retraceStr}；扩展位：${extStr}`
  }
}

function buildTimeReference(pivots, rows) {
  if (pivots.length < 3) return { detail: '摆动点不足，无法计算时间周期参考。' }

  const fibTimeRatios = [0.382, 0.618, 1.0, 1.618, 2.618]
  const bars = []
  for (let i = 1; i < pivots.length; i++) {
    bars.push(pivots[i].index - pivots[i - 1].index)
  }

  const lastBarCount = bars.at(-1) || 1
  const prevBarCount = bars.at(-2) || lastBarCount

  const timeTargets = fibTimeRatios
    .filter(r => r >= 1)
    .map(r => Math.round(prevBarCount * r))
    .filter(t => t > 0)

  const elapsed = lastBarCount
  const remaining = timeTargets.map(t => t - elapsed).filter(r => r > 0)

  const timeText = remaining.length
    ? `当前腿已运行 ${elapsed} 根K线，斐波那契时间目标在 ${remaining.slice(0, 3).map(r => `+${r}根`).join('、')}（约${remaining.slice(0, 3).map(r => `${Math.ceil(r / 5)}周`).join('、')}）`
    : `当前腿已运行 ${elapsed} 根K线，已超过主要斐波那契时间目标，关注变盘窗口`

  return { detail: timeText }
}

function buildWaveSummary(primary, alternate, fibMatrix, direction, lastPrice, priceDigits) {
  const dirText = direction === 'up' ? '上行' : direction === 'down' ? '下行' : '震荡'
  let summary = `【主选】${primary.label}：${primary.description.slice(0, 40)}…目标 ${primary.targetText}，失效 ${primary.invalidationText}。`
  if (alternate.label !== primary.label) {
    summary += ` 【备选】${alternate.label}：目标 ${alternate.targetText}，失效 ${alternate.invalidationText}。`
  }
  summary += ` 斐波那契最近关键位：${fibMatrix.nearestMeta}。`
  return summary
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
      { label: '主选浪型', value: '等待确认', meta: '摆动点不足', class: 'flat' },
      { label: '当前阶段', value: '--', meta: '浪型待确认', class: 'flat' },
      { label: '斐波那契', value: '--', meta: '等待有效高低点', class: 'flat' },
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

function summarizeWaveConfidence(pivots, segments, minMovePct, volumeRatio, primary) {
  const lastMovePct = Math.abs(segments.at(-1)?.changePct ?? 0)
  let score = 0
  if (pivots.length >= 6) score += 1
  if (segments.length >= 4) score += 1
  if (lastMovePct >= minMovePct) score += 1
  if (Number.isFinite(volumeRatio) && volumeRatio > 0.08) score += 1
  if (primary?.shortLabel === '3浪') score += 1
  if (primary?.shortLabel === '5浪' || primary?.shortLabel === 'C浪') score -= 0.5

  if (score >= 3.5) return { value: '较高', meta: '摆动、量能与浪型确认', class: 'up' }
  if (score >= 2) return { value: '中等', meta: '结构基本成型', class: 'flat' }
  return { value: '偏低', meta: '等待突破确认', class: 'down' }
}

function labelWavePoints(pivots, priceDigits, primary) {
  const waveLabels = buildWavePointLabels(pivots, primary)
  return pivots.map((point, index) => ({
    key: point.key,
    label: point.isCurrent ? '现价' : waveLabels[index] ?? `P${index}`,
    date: dateDayLabel(point.date),
    price: formatNumber(point.price, priceDigits),
    class: point.type === 'high' ? 'pivot-high' : 'pivot-low'
  }))
}

function buildWavePointLabels(pivots, primary) {
  const labels = []
  const shortLabel = primary?.shortLabel ?? ''
  const trend = primary?.class === 'up' ? 'up' : primary?.class === 'down' ? 'down' : 'flat'

  if (shortLabel === '1浪') {
    labels.push('0起点', '1浪顶', '2浪底', '3浪顶', '4浪底', '5浪顶')
  } else if (shortLabel === '2浪') {
    labels.push('0起点', '1浪端', '2浪端', '3浪端', '4浪端', '5浪端')
  } else if (shortLabel === '3浪') {
    labels.push('0起点', '1浪端', '2浪端', '3浪延展中', '4浪端', '5浪端')
  } else if (shortLabel === '4浪') {
    labels.push('0起点', '1浪端', '2浪端', '3浪端', '4浪整理中', '5浪端')
  } else if (shortLabel === '5浪') {
    labels.push('0起点', '1浪端', '2浪端', '3浪端', '4浪端', '5浪延展中')
  } else if (shortLabel === 'C浪') {
    labels.push('A浪起点', 'A浪端', 'B浪端', 'C浪延展中')
  } else {
    labels.push('起点', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8')
  }

  while (labels.length < pivots.length) {
    labels.push(`P${labels.length}`)
  }

  return labels
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
  const denominator = Math.max(1, points.length - 1)
  const nodes = points.map((point, index) => {
    const x = (index / denominator) * 84 + 8
    const y = ((paddedHigh - point.price) / paddedSpan) * 48 + 8
    return {
      key: point.key,
      label: point.isCurrent ? '现价' : `P${index}`,
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

// ── 缠论分析 ──────────────────────────────────────────────

function buildChanlunAnalysis({ history, current, priceDigits, williamsR }) {
  const allRows = (history ?? [])
    .map((row) => ({
      date: row.date || row.endDate,
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      open: Number(row.open)
    }))
    .filter((row) => Number.isFinite(row.high) && Number.isFinite(row.low))

  const live = current && Number.isFinite(current.high)
    ? { date: current.date || current.endDate || '今日', high: Number(current.high), low: Number(current.low), close: Number(current.close), open: Number(current.open) }
    : null
  if (live) {
    const idx = allRows.findIndex((row) => row.date === live.date)
    if (idx >= 0) allRows[idx] = live
    else allRows.push(live)
  }

  const rows = allRows.slice(-14)
  if (rows.length < 5) {
    return emptyChanlunAnalysis('近两周 K 线不足 5 根，无法进行缠论分析。')
  }

  const merged = mergeKlines(rows)
  const bis = detectBis(merged)
  if (bis.length < 2) {
    return emptyChanlunAnalysis('近两周未形成有效的缠论分笔，当前以单边走势或窄幅震荡为主。')
  }

  const zhongshus = detectZhongshu(bis)
  const lastPrice = rows.at(-1).close
  const trend = chanlunTrend(bis, zhongshus, lastPrice)
  const buySellPoint = detectBuySellPoint(bis, zhongshus, lastPrice, trend)
  const sketch = buildChanlunSketch(bis, zhongshus, priceDigits, merged)
  const points = buildChanlunPoints(bis, priceDigits)
  const confidence = chanlunConfidence(bis, zhongshus, merged)

  const scope = `近 ${rows.length} 根日 K（约两周）`
  const direction = trend === 'up' ? '上行' : trend === 'down' ? '下行' : '震荡'
  const summary = buildChanlunSummary(bis, zhongshus, trend, buySellPoint, lastPrice, priceDigits)

  return {
    scope,
    label: buySellPoint.label || `${direction}趋势`,
    biasClass: buySellPoint.biasClass || (trend === 'up' ? 'tight' : trend === 'down' ? 'loose' : 'neutral'),
    summary,
    sketch,
    points,
    signals: [
      { label: '当前趋势', value: direction, meta: trend === 'up' ? '分笔高低点上移' : trend === 'down' ? '分笔高低点下移' : '中枢震荡', class: trend === 'up' ? 'up' : trend === 'down' ? 'down' : 'flat' },
      { label: '中枢状态', value: zhongshus.length ? (zhongshus.at(-1).broken ? '已突破' : '震荡中') : '无中枢', meta: zhongshus.length ? `ZG=${formatNumber(zhongshus.at(-1).zg, priceDigits)} ZD=${formatNumber(zhongshus.at(-1).zd, priceDigits)}` : '笔数不足', class: zhongshus.length && zhongshus.at(-1).broken ? (trend === 'up' ? 'up' : 'down') : 'flat' },
      { label: '买卖点', value: buySellPoint.value, meta: buySellPoint.meta, class: buySellPoint.class },
      { label: '可信度', value: confidence.value, meta: confidence.meta, class: confidence.class }
    ],
    details: buildChanlunDetails(bis, zhongshus, trend, buySellPoint, merged, priceDigits, williamsR)
  }
}

function mergeKlines(rows) {
  if (!rows.length) return []
  const result = [{ ...rows[0], dir: 0, index: 0 }]
  for (let i = 1; i < rows.length; i++) {
    const prev = result.at(-1)
    const cur = rows[i]
    const hasInclusion = (cur.high <= prev.high && cur.low >= prev.low) || (cur.high >= prev.high && cur.low <= prev.low)
    if (!hasInclusion) {
      result.push({ ...cur, dir: prev.dir, index: result.length })
      continue
    }
    if (prev.dir >= 0) {
      prev.high = Math.max(prev.high, cur.high)
      prev.low = Math.max(prev.low, cur.low)
    } else {
      prev.high = Math.min(prev.high, cur.high)
      prev.low = Math.min(prev.low, cur.low)
    }
    prev.date = cur.date
  }
  for (let i = 1; i < result.length; i++) {
    if (result[i].high > result[i - 1].high && result[i].low > result[i - 1].low) result[i].dir = 1
    else if (result[i].high < result[i - 1].high && result[i].low < result[i - 1].low) result[i].dir = -1
    else result[i].dir = result[i - 1].dir
  }
  return result
}

function detectBis(merged) {
  const extremes = []
  for (let i = 1; i < merged.length - 1; i++) {
    const prev = merged[i - 1]
    const cur = merged[i]
    const next = merged[i + 1]
    if (cur.high > prev.high && cur.high > next.high && cur.high >= Math.max(prev.high, next.high)) {
      extremes.push({ type: 'top', price: cur.high, date: cur.date, index: i })
    }
    if (cur.low < prev.low && cur.low < next.low && cur.low <= Math.min(prev.low, next.low)) {
      extremes.push({ type: 'bottom', price: cur.low, date: cur.date, index: i })
    }
  }
  const cleaned = []
  for (const ext of extremes) {
    const lastExt = cleaned.at(-1)
    if (lastExt && lastExt.type === ext.type) {
      if (ext.type === 'top' && ext.price > lastExt.price) cleaned[cleaned.length - 1] = ext
      if (ext.type === 'bottom' && ext.price < lastExt.price) cleaned[cleaned.length - 1] = ext
    } else {
      cleaned.push(ext)
    }
  }
  const bis = []
  for (let i = 0; i < cleaned.length - 1; i++) {
    const start = cleaned[i]
    const end = cleaned[i + 1]
    const direction = start.type === 'bottom' ? 'up' : 'down'
    bis.push({
      start,
      end,
      direction,
      change: end.price - start.price,
      changePct: start.price ? (end.price - start.price) / start.price : 0
    })
  }
  return bis
}

function detectZhongshu(bis) {
  if (bis.length < 3) return []
  const zhongshus = []
  for (let i = 0; i <= bis.length - 3; i++) {
    const b1 = bis[i]
    const b2 = bis[i + 1]
    const b3 = bis[i + 2]
    const overlapHigh = Math.min(b1.end.price, b3.end.price)
    const overlapLow = Math.max(b1.start.price, b3.start.price)
    if (overlapHigh > overlapLow) {
      const zg = overlapHigh
      const zd = overlapLow
      let broken = false
      let breakDir = null
      for (let j = i + 3; j < bis.length; j++) {
        if (bis[j].end.price > zg) { broken = true; breakDir = 'up'; break }
        if (bis[j].end.price < zd) { broken = true; breakDir = 'down'; break }
      }
      zhongshus.push({
        zg, zd, zz: (zg + zd) / 2,
        startBi: i, endBi: i + 2,
        broken, breakDir,
        width: zg - zd
      })
    }
  }
  return zhongshus
}

function chanlunTrend(bis, zhongshus, lastPrice) {
  if (!bis.length) return 'flat'
  const lastZhongshu = zhongshus.at(-1)
  if (lastZhongshu && !lastZhongshu.broken) {
    if (lastPrice > lastZhongshu.zz) return 'up'
    if (lastPrice < lastZhongshu.zz) return 'down'
    return 'flat'
  }
  if (lastZhongshu && lastZhongshu.broken) return lastZhongshu.breakDir || 'flat'
  const lastBi = bis.at(-1)
  if (lastBi.direction === 'up') {
    const tops = bis.filter(b => b.direction === 'up').map(b => b.end.price)
    const bottoms = bis.filter(b => b.direction === 'down').map(b => b.end.price)
    if (tops.length >= 2 && bottoms.length >= 2 && tops.at(-1) > tops.at(-2) && bottoms.at(-1) > bottoms.at(-2)) return 'up'
  }
  if (lastBi.direction === 'down') {
    const tops = bis.filter(b => b.direction === 'up').map(b => b.end.price)
    const bottoms = bis.filter(b => b.direction === 'down').map(b => b.end.price)
    if (tops.length >= 2 && bottoms.length >= 2 && tops.at(-1) < tops.at(-2) && bottoms.at(-1) < bottoms.at(-2)) return 'down'
  }
  return 'flat'
}

function detectBuySellPoint(bis, zhongshus, lastPrice, trend) {
  if (!zhongshus.length) {
    return { value: '观望', meta: '中枢未形成', class: 'flat', label: '', biasClass: 'neutral' }
  }
  const zs = zhongshus.at(-1)
  if (!zs.broken) {
    if (lastPrice <= zs.zd * 1.005 && lastPrice >= zs.zd * 0.995) {
      return { value: '一买', meta: '价格触及中枢下沿', class: 'up', label: '一买信号', biasClass: 'tight' }
    }
    if (lastPrice >= zs.zg * 0.995 && lastPrice <= zs.zg * 1.005) {
      return { value: '一卖', meta: '价格触及中枢上沿', class: 'down', label: '一卖信号', biasClass: 'loose' }
    }
    return { value: '观望', meta: `中枢内震荡 [${formatNumber(zs.zd, 0)}, ${formatNumber(zs.zg, 0)}]`, class: 'flat', label: '', biasClass: 'neutral' }
  }
  if (zs.breakDir === 'up') {
    if (lastPrice >= zs.zg && lastPrice <= zs.zg * 1.02) {
      return { value: '二买', meta: '突破中枢上沿回踩', class: 'up', label: '二买信号', biasClass: 'tight' }
    }
    if (lastPrice > zs.zg * 1.05) {
      return { value: '三买', meta: '远离中枢上沿加速', class: 'up', label: '三买信号', biasClass: 'tight' }
    }
    return { value: '持多', meta: '中枢上移趋势中', class: 'up', label: '多头延续', biasClass: 'tight' }
  }
  if (zs.breakDir === 'down') {
    if (lastPrice <= zs.zd && lastPrice >= zs.zd * 0.98) {
      return { value: '二卖', meta: '跌破中枢下沿反抽', class: 'down', label: '二卖信号', biasClass: 'loose' }
    }
    if (lastPrice < zs.zd * 0.95) {
      return { value: '三卖', meta: '远离中枢下沿加速', class: 'down', label: '三卖信号', biasClass: 'loose' }
    }
    return { value: '持空', meta: '中枢下移趋势中', class: 'down', label: '空头延续', biasClass: 'loose' }
  }
  return { value: '观望', meta: '趋势待确认', class: 'flat', label: '', biasClass: 'neutral' }
}

function chanlunConfidence(bis, zhongshus, merged) {
  let score = 0
  if (bis.length >= 4) score += 1
  if (bis.length >= 6) score += 1
  if (zhongshus.length >= 1) score += 1
  if (merged.length >= 8) score += 1
  if (score >= 3) return { value: '较高', meta: '笔与中枢结构清晰', class: 'up' }
  if (score >= 2) return { value: '中等', meta: '结构基本成型', class: 'flat' }
  return { value: '偏低', meta: '样本偏少', class: 'down' }
}

function buildChanlunSketch(bis, zhongshus, priceDigits, merged) {
  if (!bis.length) return null
  const allPoints = bis.flatMap(b => [b.start, b.end])
  const prices = allPoints.map(p => p.price)
  const high = Math.max(...prices)
  const low = Math.min(...prices)
  const span = Math.max(high - low, Math.abs(high) * 0.01, 1)
  const paddedHigh = high + span * 0.15
  const paddedLow = low - span * 0.15
  const paddedSpan = paddedHigh - paddedLow
  const totalBars = merged.length || allPoints.length
  const denominator = Math.max(1, totalBars - 1)

  const nodes = allPoints.map((point, index) => {
    const x = (point.index / denominator) * 84 + 8
    const y = ((paddedHigh - point.price) / paddedSpan) * 48 + 8
    return {
      key: `cl-${index}`,
      label: point.type === 'top' ? `顶${index}` : `底${index}`,
      price: formatNumber(point.price, priceDigits),
      x: roundChartCoord(x),
      y: roundChartCoord(y),
      left: `${roundChartCoord(x)}%`,
      top: `${roundChartCoord((y / 64) * 100)}%`,
      class: point.type === 'top' ? 'pivot-high' : 'pivot-low'
    }
  })
  const linePoints = nodes.map(n => `${n.x},${n.y}`).join(' ')

  const zhongshuBoxes = zhongshus.map(zs => {
    const startBi = bis[zs.startBi]
    const endBi = bis[zs.endBi]
    if (!startBi || !endBi) return null
    const x1 = (startBi.start.index / denominator) * 84 + 8
    const x2 = (endBi.end.index / denominator) * 84 + 8
    const y1 = ((paddedHigh - zs.zg) / paddedSpan) * 48 + 8
    const y2 = ((paddedHigh - zs.zd) / paddedSpan) * 48 + 8
    return {
      x: roundChartCoord(x1),
      y: roundChartCoord(Math.min(y1, y2)),
      width: roundChartCoord(x2 - x1),
      height: roundChartCoord(Math.abs(y2 - y1))
    }
  }).filter(Boolean)

  return {
    highLabel: formatNumber(high, priceDigits),
    lowLabel: formatNumber(low, priceDigits),
    gridLines: [14, 32, 50],
    linePoints,
    zhongshuBoxes,
    nodes
  }
}

function buildChanlunPoints(bis, priceDigits) {
  const points = []
  bis.forEach((bi, idx) => {
    if (idx === 0) {
      points.push({
        key: `cl-start-${idx}`,
        label: bi.start.type === 'top' ? '顶分型' : '底分型',
        price: formatNumber(bi.start.price, priceDigits),
        date: dateDayLabel(bi.start.date),
        class: bi.start.type === 'top' ? 'pivot-high' : 'pivot-low'
      })
    }
    points.push({
      key: `cl-end-${idx}`,
      label: bi.end.type === 'top' ? '顶分型' : '底分型',
      price: formatNumber(bi.end.price, priceDigits),
      date: dateDayLabel(bi.end.date),
      class: bi.end.type === 'top' ? 'pivot-high' : 'pivot-low'
    })
  })
  return points
}

function buildChanlunSummary(bis, zhongshus, trend, buySellPoint, lastPrice, priceDigits) {
  const dirText = trend === 'up' ? '上行' : trend === 'down' ? '下行' : '震荡'
  const biCount = bis.length
  const zsCount = zhongshus.length
  let summary = `近两周形成 ${biCount} 笔`
  if (zsCount) {
    const zs = zhongshus.at(-1)
    summary += `、${zsCount} 个中枢（最新中枢区间 ${formatNumber(zs.zd, priceDigits)} ~ ${formatNumber(zs.zg, priceDigits)}${zs.broken ? '，已突破' : '，震荡中'}）`
  } else {
    summary += '，尚未形成中枢'
  }
  summary += `，当前趋势${dirText}。`
  if (buySellPoint.label) {
    summary += ` 缠论买卖点：${buySellPoint.label}（${buySellPoint.meta}）。`
  }
  return summary
}

function buildChanlunDetails(bis, zhongshus, trend, buySellPoint, merged, priceDigits, williamsR) {
  const details = []
  details.push(`【K线合并】近两周14根K线经包含关系处理后，剩余 ${merged.length} 根有效K线作为分型基础。`)
  details.push(`【分笔】共识别 ${bis.length} 笔。${bis.map((b, i) => `第${i + 1}笔${b.direction === 'up' ? '向上' : '向下'} ${formatNumber(b.start.price, priceDigits)}→${formatNumber(b.end.price, priceDigits)}（${formatSignedPct(b.changePct)}）`).join('；')}。`)
  if (zhongshus.length) {
    details.push(`【中枢】共 ${zhongshus.length} 个中枢。${zhongshus.map((zs, i) => `第${i + 1}个 ZG=${formatNumber(zs.zg, priceDigits)} ZD=${formatNumber(zs.zd, priceDigits)}${zs.broken ? `，已向${zs.breakDir === 'up' ? '上' : '下'}突破` : '，震荡中'}`).join('；')}。`)
  } else {
    details.push('【中枢】当前笔数不足以形成中枢，若后续出现3笔重叠将构成第一个中枢。')
  }
  const dirText = trend === 'up' ? '上行（高低点不断上移）' : trend === 'down' ? '下行（高低点不断下移）' : '震荡（中枢内反复）'
  details.push(`【趋势判断】${dirText}。${trend === 'up' ? '多头格局，逢低做多为主' : trend === 'down' ? '空头格局，逢高做空为主' : '中枢震荡，高抛低吸'}。`)
  details.push(`【买卖点】${buySellPoint.label || '暂无明确买卖点'}：${buySellPoint.meta}。`)
  details.push(`【指标辅助】W%R ${Number.isFinite(williamsR) ? williamsR.toFixed(1) : '--'}（${williamsText(williamsR)}），结合缠论买卖点综合判断。`)
  return details
}

function emptyChanlunAnalysis(summary) {
  return {
    scope: '缠论分析',
    label: '等待数据',
    biasClass: 'neutral',
    summary,
    sketch: null,
    points: [],
    signals: [
      { label: '当前趋势', value: '--', meta: '数据不足', class: 'flat' },
      { label: '中枢状态', value: '--', meta: '等待笔形成', class: 'flat' },
      { label: '买卖点', value: '观望', meta: '结构不足', class: 'flat' },
      { label: '可信度', value: '低', meta: '样本不足', class: 'flat' }
    ],
    details: ['等待更多日 K 数据后，再给出缠论分笔、中枢和买卖点分析。']
  }
}
</script>
