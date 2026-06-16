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

    <main v-if="item">
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
import { byToneText, chartTitles, supplyToneText, mergeLiveSnapshot, buildLiveCalendarRow, getLimitStatus } from '../utils/data'
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
  if (item.value?.symbol) store.refreshIntraday(item.value.symbol)
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
