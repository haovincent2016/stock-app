<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-brand">
        <h1>期货数据</h1>
        <router-link class="topbar-menu active" :to="{ name: 'home' }">期货</router-link>
        <router-link class="topbar-menu" :to="{ name: 'options' }">期权</router-link>
        <span class="topbar-date">{{ store.meta.tradeDate || '--' }}</span>
      </div>
      <div class="topbar-actions">
        <el-input v-model="search" clearable placeholder="搜索品种" class="search-box" size="default" />
        <el-select v-model="sort" class="sort-box" size="default">
          <el-option value="change" label="涨跌幅" />
          <el-option value="range" label="振幅" />
          <el-option value="williams" label="威廉" />
          <el-option value="volume" label="成交量" />
        </el-select>
        <el-button :loading="store.loading" @click="refresh" circle size="small">
          <span class="fallback-icon">↻</span>
        </el-button>
      </div>
    </header>

    <nav class="tab-bar">
      <button
        v-for="item in categories"
        :key="item"
        type="button"
        class="tab-item"
        :class="{ active: category === item }"
        @click="category = item"
      >{{ item }}</button>
    </nav>

    <main>
      <el-alert v-if="store.error" :title="store.error" type="warning" show-icon class="page-alert" />

      <div class="feed-layout">
        <div class="feed-main" v-loading="store.loading">
          <div class="feed-item"
            v-for="item in filteredCommodities"
            :key="item.symbol"
            :class="{ pinned: store.isPinned(item.symbol) }"
          >
            <router-link :to="{ name: 'detail', params: { symbol: item.symbol } }" class="feed-link">
              <div class="feed-left">
                <div class="feed-title">
                  <span class="feed-name">{{ item.name }}</span>
                  <span v-if="item.contractMonth" class="contract-tag">{{ item.contractMonth.label }}</span>
                  <span v-if="store.isPinned(item.symbol)" class="pin-indicator">置顶</span>
                </div>
                <div class="feed-meta">{{ item.exchange }} · {{ item.symbol }} · {{ item.category }}</div>
              </div>
              <div class="feed-right">
                <div class="feed-price">{{ formatNumber(item.today?.latestPrice ?? item.latest?.close, item.priceDigits ?? 0) }}</div>
                <div class="feed-change" :class="changeClass(item.today?.changePct)">{{ formatSignedPct(item.today?.changePct) }}</div>
              </div>
              <div class="feed-metrics">
                <span>振幅 <em>{{ formatPct(item.today?.rangePct) }}</em></span>
                <span>W%R <em>{{ Number.isFinite(item.metrics?.williamsR) ? item.metrics.williamsR.toFixed(1) : '--' }}</em></span>
                <span>量 <em>{{ compactNumber(item.today?.volume) }}</em></span>
              </div>
              <div class="feed-actions">
                <button
                  type="button"
                  class="pin-btn"
                  :class="{ active: store.isPinned(item.symbol) }"
                  @click.prevent.stop="store.togglePin(item.symbol)"
                  :title="store.isPinned(item.symbol) ? '取消置顶' : '置顶'"
                >📌</button>
              </div>
            </router-link>
          </div>
          <div v-if="!store.loading && !filteredCommodities.length" class="empty-state">没有匹配的品种</div>
        </div>

        <aside class="feed-side">
          <div class="side-card">
            <div class="side-card-head">
              <h2>波动榜</h2>
            </div>
            <div class="side-card-body">
              <router-link
                v-for="(item, index) in volatilityRows"
                :key="item.symbol"
                class="rank-item"
                :to="{ name: 'detail', params: { symbol: item.symbol } }"
              >
                <span class="rank-num" :class="'rank-' + (index + 1)">{{ index + 1 }}</span>
                <span class="rank-name">{{ item.name }}</span>
                <span class="rank-val">{{ formatPct(item.today?.rangePct) }}</span>
              </router-link>
            </div>
          </div>

          <div class="side-card">
            <div class="side-card-head">
              <h2>威廉指数</h2>
              <span class="side-sub">W%R 14</span>
            </div>
            <div class="side-card-body">
              <router-link
                v-for="item in williamsRows"
                :key="item.symbol"
                class="wr-item"
                :to="{ name: 'detail', params: { symbol: item.symbol } }"
              >
                <span class="wr-name">{{ item.name }}</span>
                <span class="wr-track"><span class="wr-pin" :style="{ left: wrLeft(item.metrics?.williamsR) + '%' }"></span></span>
                <span class="wr-val">{{ Number.isFinite(item.metrics?.williamsR) ? item.metrics.williamsR.toFixed(0) : '--' }}</span>
              </router-link>
            </div>
          </div>
        </aside>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMarketStore } from '../stores/market'
import { formatNumber, compactNumber, formatPct, formatSignedPct, changeClass, rankColor, wrLeft } from '../utils/format'

const store = useMarketStore()
const category = ref('全部')
const search = ref('')
const sort = ref('change')

onMounted(() => store.load())

const categories = computed(() => ['全部', ...new Set(store.commodities.map((item) => item.category))])
const filteredCommodities = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const pinned = store.pinnedSymbols
  return store.commodities
    .filter((item) => {
      const matchesCategory = category.value === '全部' || item.category === category.value
      const haystack = [item.name, item.symbol, item.exchange, item.category].join(' ').toLowerCase()
      return matchesCategory && (!needle || haystack.includes(needle))
    })
    .sort((a, b) => {
      const aPin = pinned.includes(a.symbol) ? 0 : 1
      const bPin = pinned.includes(b.symbol) ? 0 : 1
      if (aPin !== bPin) return aPin - bPin
      if (sort.value === 'range') return (b.today?.rangePct ?? -1) - (a.today?.rangePct ?? -1)
      if (sort.value === 'williams') return (b.metrics?.williamsR ?? -100) - (a.metrics?.williamsR ?? -100)
      if (sort.value === 'volume') return (b.today?.volume ?? -1) - (a.today?.volume ?? -1)
      return Math.abs(b.today?.changePct ?? 0) - Math.abs(a.today?.changePct ?? 0)
    })
})

const volatilityRows = computed(() =>
  store.commodities.slice().sort((a, b) => (b.today?.rangePct ?? 0) - (a.today?.rangePct ?? 0)).slice(0, 6)
)
const williamsRows = computed(() =>
  store.commodities.slice().sort((a, b) => (b.metrics?.williamsR ?? -100) - (a.metrics?.williamsR ?? -100))
)

function refresh() {
  store.load(true)
}
</script>
