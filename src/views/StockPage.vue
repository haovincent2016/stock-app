<template>
  <div class="app-shell stock-shell">
    <header class="topbar">
      <div class="topbar-brand">
        <h1>股票数据</h1>
        <router-link class="topbar-menu" :to="{ name: 'home' }">期货</router-link>
        <router-link class="topbar-menu active" :to="{ name: 'stocks' }">股票</router-link>
        <span class="topbar-date">{{ indexFetchedAt ? `更新 ${formatTime(indexFetchedAt)}` : '--' }}</span>
      </div>
      <div class="topbar-actions">
        <el-button :loading="indexLoading" @click="loadIndices" circle size="small">
          <span class="fallback-icon">↻</span>
        </el-button>
      </div>
    </header>

    <main>
      <div class="stock-sticky-panel">
        <section class="stock-index-strip" v-loading="indexLoading">
          <article v-for="row in indexRows" :key="row.secid" class="stock-index-card">
            <span>{{ row.name }}</span>
            <strong>{{ formatNumber(row.latestPrice, 2) }}</strong>
            <em :class="changeClass(row.changePct)">{{ formatSignedPct(row.changePct) }}</em>
          </article>
        </section>

        <section class="stock-search-panel">
          <div class="stock-search-copy">
            <h2>股票搜索</h2>
            <p>输入 A 股股票名称或代码，查询行情、K 线和基本资料。</p>
          </div>
          <div class="stock-search-box">
            <el-input
              v-model="query"
              clearable
              placeholder="例如：贵州茅台 / 600519 / 宁德时代"
              size="large"
              @keyup.enter="searchStock"
            />
            <el-button type="primary" :loading="searchLoading" size="large" @click="searchStock">搜索</el-button>
          </div>
        </section>

        <el-alert v-if="searchError" :title="searchError" type="warning" show-icon class="page-alert stock-search-alert" />

        <section v-if="suggestions.length" class="stock-suggestion-panel">
          <div class="stock-suggestion-head">
            <strong>搜索结果</strong>
            <span>{{ suggestions.length }} 条</span>
          </div>
          <div class="stock-suggestion-list">
            <button
              v-for="row in suggestions"
              :key="row.secid"
              type="button"
              class="stock-suggestion-item"
              @click="addStock(row)"
            >
              <strong>{{ row.name }}</strong>
              <span>{{ row.exchange }} · {{ row.code }}</span>
            </button>
          </div>
        </section>
      </div>

      <section class="stock-card-list">
        <article
          v-for="card in visibleStocks"
          :key="card.secid"
          class="stock-card"
          :class="{ pinned: card.pinned }"
          v-loading="card.loading"
        >
          <template v-if="card.data?.quote">
            <div class="stock-card-head">
              <div class="stock-title-group">
                <h2>
                  {{ card.data.quote.name }}
                  <span v-if="card.pinned" class="pin-indicator">置顶</span>
                </h2>
                <p>{{ card.data.quote.exchange }} · {{ card.data.quote.code }} · {{ card.data.profile?.industry || '行业待更新' }}</p>
              </div>
              <div class="stock-card-actions">
                <button type="button" class="stock-action-btn" @click="toggleExpanded(card)">
                  {{ card.expanded ? '折叠' : '展开' }}
                </button>
                <button type="button" class="stock-action-btn" @click="togglePin(card)">
                  {{ card.pinned ? '取消置顶' : '置顶' }}
                </button>
                <button type="button" class="stock-action-btn" @click="refreshStock(card)">刷新</button>
                <button type="button" class="stock-action-btn danger" @click="removeStock(card.secid)">删除</button>
              </div>
            </div>

            <div class="stock-quote-row">
              <div>
                <strong class="stock-price">{{ formatNumber(card.data.quote.latestPrice, 2) }}</strong>
                <em :class="changeClass(card.data.quote.changePct)">{{ formatSignedPct(card.data.quote.changePct) }}</em>
              </div>
              <span>{{ card.data.quote.timestamp ? `行情时间 ${formatTime(card.data.quote.timestamp)}` : card.data.source }}</span>
            </div>

            <div v-if="card.expanded" class="stock-card-body">
            <div class="stock-stat-grid">
              <article><span>今开 / 昨收</span><strong>{{ formatNumber(card.data.quote.open, 2) }} / {{ formatNumber(card.data.quote.previousClose, 2) }}</strong></article>
              <article><span>最高 / 最低</span><strong>{{ formatNumber(card.data.quote.high, 2) }} / {{ formatNumber(card.data.quote.low, 2) }}</strong></article>
              <article><span>成交量</span><strong>{{ compactNumber(card.data.quote.volume) }} 手</strong></article>
              <article><span>成交额</span><strong>{{ formatMoney(card.data.quote.amount) }}</strong></article>
              <article><span>换手率</span><strong>{{ formatPct(card.data.quote.turnoverPct) }}</strong></article>
              <article><span>振幅</span><strong>{{ formatPct(card.data.quote.amplitudePct) }}</strong></article>
            </div>

            <section class="stock-chart-panel">
              <div class="stock-chart-head">
                <div>
                  <h3>K 线图</h3>
                  <span>{{ chartViewText[card.view] }}</span>
                </div>
                <div class="stock-chart-tabs">
                  <button type="button" :class="{ active: card.view === 'intraday' }" @click="card.view = 'intraday'">日内</button>
                  <button type="button" :class="{ active: card.view === 'daily' }" @click="card.view = 'daily'">日 K</button>
                  <button type="button" :class="{ active: card.view === 'weekly' }" @click="card.view = 'weekly'">周 K</button>
                  <button type="button" :class="{ active: card.view === 'monthly' }" @click="card.view = 'monthly'">月 K</button>
                </div>
              </div>
              <stock-chart :name="card.data.quote.name" :klines="card.data.klines" :view="card.view" />
            </section>

            <div class="stock-info-grid">
              <section class="stock-info-panel">
                <h3>估值与规模</h3>
                <div class="stock-info-row"><span>动态市盈率</span><strong>{{ valueOrDash(card.data.quote.peDynamic) }}</strong></div>
                <div class="stock-info-row"><span>TTM 市盈率</span><strong>{{ valueOrDash(card.data.quote.peTtm) }}</strong></div>
                <div class="stock-info-row"><span>市净率</span><strong>{{ valueOrDash(card.data.quote.pb) }}</strong></div>
                <div class="stock-info-row"><span>总市值</span><strong>{{ formatMoney(card.data.quote.marketCap ?? card.data.quote.totalMarketCap) }}</strong></div>
                <div class="stock-info-row"><span>流通市值</span><strong>{{ formatMoney(card.data.quote.floatMarketCap2 ?? card.data.quote.floatMarketCap) }}</strong></div>
              </section>

              <section class="stock-info-panel">
                <h3>交易表现</h3>
                <div class="stock-info-row"><span>量比</span><strong>{{ valueOrDash(card.data.quote.volumeRatio) }}</strong></div>
                <div class="stock-info-row"><span>60 日涨跌</span><strong :class="changeClass(card.data.quote.changePct60Day)">{{ formatSignedPct(card.data.quote.changePct60Day) }}</strong></div>
                <div class="stock-info-row"><span>年初至今</span><strong :class="changeClass(card.data.quote.changePctYtd)">{{ formatSignedPct(card.data.quote.changePctYtd) }}</strong></div>
                <div class="stock-info-row"><span>上市日期</span><strong>{{ formatPlainDate(card.data.profile?.listingDate || card.data.quote.listingDate) }}</strong></div>
                <div class="stock-info-row"><span>资料来源</span><strong>{{ card.data.source }}</strong></div>
              </section>

              <section class="stock-info-panel profile">
                <h3>公司资料</h3>
                <div class="stock-info-row"><span>公司名称</span><strong>{{ card.data.profile?.companyName || card.data.quote.name }}</strong></div>
                <div class="stock-info-row"><span>所属行业</span><strong>{{ [card.data.profile?.industry, card.data.profile?.subIndustry].filter(Boolean).join(' / ') || '--' }}</strong></div>
                <div class="stock-info-row"><span>地区</span><strong>{{ card.data.profile?.province || '--' }}</strong></div>
                <div class="stock-info-row"><span>董事长</span><strong>{{ card.data.profile?.chairman || '--' }}</strong></div>
                <p>{{ card.data.profile?.mainBusiness || '公司主营业务资料暂未获取。' }}</p>
              </section>

              <section class="stock-info-panel boards">
                <h3>所属板块</h3>
                <div v-if="card.data.boards?.length" class="stock-board-groups">
                  <div v-for="group in boardGroups(card.data.boards)" :key="group.type" class="stock-board-group">
                    <strong>{{ group.type }}</strong>
                    <div class="stock-board-tags">
                      <span v-for="board in group.rows" :key="board.code || board.name" class="stock-board-tag">{{ board.name }}</span>
                    </div>
                  </div>
                </div>
                <p v-else>板块资料暂未获取。</p>
              </section>
            </div>
            </div>
          </template>

          <div v-else-if="card.error" class="stock-card-error">
            <strong>{{ card.name || card.code || card.secid }}</strong>
            <p>{{ card.error }}</p>
            <div class="stock-card-actions">
              <button type="button" class="stock-action-btn" @click="refreshStock(card)">重试</button>
              <button type="button" class="stock-action-btn danger" @click="removeStock(card.secid)">删除</button>
            </div>
          </div>
        </article>

        <div v-if="!visibleStocks.length" class="empty-state">
          搜索股票后会保留在这里，可置顶或删除。
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import StockChart from '../components/StockChart.vue'
import { compactNumber, formatNumber, formatPct, formatSignedPct, changeClass, formatTime } from '../utils/format'

const STOCK_STORAGE_KEY = 'stock_page_items_v1'

const query = ref('')
const searchLoading = ref(false)
const searchError = ref('')
const suggestions = ref([])
const indexRows = ref([])
const indexFetchedAt = ref('')
const indexLoading = ref(false)
const stocks = ref([])

const chartViewText = {
  intraday: '当日分时走势',
  daily: '前复权日线',
  weekly: '前复权周线',
  monthly: '前复权月线'
}

const visibleStocks = computed(() =>
  stocks.value.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.pinned && b.pinned) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)
    return (b.addedAt ?? 0) - (a.addedAt ?? 0)
  })
)

onMounted(() => {
  loadIndices()
  restoreStocks()
})

async function loadIndices() {
  indexLoading.value = true
  try {
    const response = await axios.get('./api/stock-indices', { params: { ts: Date.now() } })
    indexRows.value = response.data?.rows ?? []
    indexFetchedAt.value = response.data?.fetchedAt || ''
  } finally {
    indexLoading.value = false
  }
}

async function searchStock() {
  const text = query.value.trim()
  if (!text) return
  searchLoading.value = true
  searchError.value = ''
  suggestions.value = []
  try {
    const response = await axios.get('./api/stock-search', {
      params: { q: text, ts: Date.now() }
    })
    suggestions.value = response.data?.rows ?? []
    if (!suggestions.value.length) {
      searchError.value = '没有找到匹配股票'
      return
    }
    addStock(suggestions.value[0])
  } catch (error) {
    searchError.value = error.response?.data?.error || error.message || '股票搜索失败'
  } finally {
    searchLoading.value = false
  }
}

function restoreStocks() {
  const rows = loadStoredStocks()
  stocks.value = rows.map((row) => ({
    secid: row.secid,
    code: row.code || row.secid?.split('.')?.[1] || '',
    name: row.name || row.code || row.secid,
    pinned: !!row.pinned,
    pinnedAt: row.pinnedAt || 0,
    addedAt: row.addedAt || Date.now(),
    expanded: row.expanded !== false,
    view: row.view || 'intraday',
    loading: false,
    error: '',
    data: null
  }))
  stocks.value.forEach((card) => loadStock(card))
}

function loadStoredStocks() {
  try {
    const rows = JSON.parse(localStorage.getItem(STOCK_STORAGE_KEY)) || []
    return Array.isArray(rows) ? rows.filter((row) => row?.secid) : []
  } catch {
    return []
  }
}

function persistStocks() {
  const rows = stocks.value.map((card) => ({
    secid: card.secid,
    code: card.code,
    name: card.data?.quote?.name || card.name,
    pinned: card.pinned,
    pinnedAt: card.pinnedAt || 0,
    addedAt: card.addedAt || Date.now(),
    expanded: card.expanded !== false,
    view: card.view || 'intraday'
  }))
  localStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(rows))
}

function addStock(row) {
  if (!row?.secid) return
  const existing = stocks.value.find((card) => card.secid === row.secid)
  if (existing) {
    existing.addedAt = Date.now()
    existing.expanded = true
    refreshStock(existing)
    persistStocks()
    return
  }

  const card = {
    secid: row.secid,
    code: row.code,
    name: row.name,
    pinned: false,
    pinnedAt: 0,
    addedAt: Date.now(),
    expanded: true,
    view: 'intraday',
    loading: false,
    error: '',
    data: null
  }
  stocks.value.unshift(card)
  persistStocks()
  loadStock(card)
}

async function loadStock(card) {
  card.loading = true
  card.error = ''
  try {
    const response = await axios.get('./api/stock-detail', {
      params: { secid: card.secid, ts: Date.now() }
    })
    card.data = response.data
    card.code = response.data?.quote?.code || card.code
    card.name = response.data?.quote?.name || card.name
    persistStocks()
  } catch (error) {
    card.error = error.response?.data?.error || error.message || '股票信息加载失败'
  } finally {
    card.loading = false
  }
}

function refreshStock(card) {
  loadStock(card)
}

function togglePin(card) {
  card.pinned = !card.pinned
  card.pinnedAt = card.pinned ? Date.now() : 0
  persistStocks()
}

function toggleExpanded(card) {
  card.expanded = !card.expanded
  persistStocks()
}

function removeStock(secid) {
  stocks.value = stocks.value.filter((card) => card.secid !== secid)
  persistStocks()
}

function boardGroups(boards = []) {
  const grouped = new Map()
  for (const board of boards) {
    const type = board.type || '其他'
    if (!grouped.has(type)) grouped.set(type, [])
    grouped.get(type).push(board)
  }
  return [...grouped.entries()].map(([type, rows]) => ({ type, rows }))
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return '--'
  if (Math.abs(value) >= 1e12) return `${formatNumber(value / 1e12, 2)}万亿`
  if (Math.abs(value) >= 1e8) return `${formatNumber(value / 1e8, 2)}亿`
  if (Math.abs(value) >= 1e4) return `${formatNumber(value / 1e4, 2)}万`
  return formatNumber(value, 0)
}

function valueOrDash(value) {
  return Number.isFinite(value) ? formatNumber(value, 2) : '--'
}

function formatPlainDate(value) {
  const text = String(value || '')
  if (!text) return '--'
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  return text.slice(0, 10)
}
</script>
