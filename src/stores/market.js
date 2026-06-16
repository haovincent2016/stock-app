import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'
import { buildOptionMovers } from '../utils/data'

const PINNED_KEY = 'futures_pinned_symbols'

function loadPinned() {
  try {
    return JSON.parse(localStorage.getItem(PINNED_KEY)) || []
  } catch {
    return []
  }
}

export const useMarketStore = defineStore('market', () => {
  const data = ref(null)
  const loading = ref(false)
  const error = ref('')
  const liveIntraday = ref({})
  const liveLoading = ref({})
  const optionRows = ref([])
  const optionLoading = ref(false)
  const optionError = ref('')
  const optionFetchedAt = ref('')
  const optionIntraday = ref({})
  const optionIntradayLoading = ref({})
  const optionIntradayError = ref({})
  const pinnedSymbols = ref(loadPinned())

  const commodities = computed(() => data.value?.commodities ?? [])
  const news = computed(() => data.value?.news ?? [])
  const meta = computed(() => data.value?.meta ?? {})
  const options = computed(() => {
    const rows = data.value?.options ?? []
    return rows.length ? rows : buildOptionMovers(commodities.value, 8)
  })

  function togglePin(symbol) {
    const idx = pinnedSymbols.value.indexOf(symbol)
    if (idx >= 0) {
      pinnedSymbols.value = pinnedSymbols.value.filter((s) => s !== symbol)
    } else {
      pinnedSymbols.value = [...pinnedSymbols.value, symbol]
    }
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedSymbols.value))
  }

  function isPinned(symbol) {
    return pinnedSymbols.value.includes(symbol)
  }

  async function load(force = false) {
    if (data.value && !force) return
    loading.value = true
    error.value = ''
    try {
      const response = await axios.get('./data/market.json', {
        params: { ts: Date.now() }
      })
      data.value = response.data
    } catch (err) {
      error.value = '数据文件未载入，请先运行 npm run update。'
      data.value = { meta: {}, commodities: [], news: [] }
    } finally {
      loading.value = false
    }
  }

  async function refreshIntraday(symbol) {
    if (!symbol) return null
    liveLoading.value = { ...liveLoading.value, [symbol]: true }
    try {
      const response = await axios.get('./api/intraday', {
        params: { symbol, ts: Date.now() }
      })
      const snapshot = response.data
      if (snapshot && Array.isArray(snapshot.points) && snapshot.points.length) {
        liveIntraday.value = { ...liveIntraday.value, [symbol]: snapshot }
        return snapshot
      }
      return null
    } catch (err) {
      return null
    } finally {
      liveLoading.value = { ...liveLoading.value, [symbol]: false }
    }
  }

  async function loadOptions(force = false) {
    if (optionRows.value.length && !force) return optionRows.value
    optionLoading.value = true
    optionError.value = ''
    try {
      const response = await axios.get('./api/options', {
        params: { limit: 8, refresh: force ? 1 : undefined, ts: Date.now() }
      })
      optionRows.value = Array.isArray(response.data?.rows) ? response.data.rows : []
      optionFetchedAt.value = response.data?.fetchedAt || ''
      return optionRows.value
    } catch (err) {
      optionError.value = '真实期权数据暂不可用，请确认已启动本地服务后刷新。'
      optionRows.value = []
      return []
    } finally {
      optionLoading.value = false
    }
  }

  async function loadOptionIntraday(row, force = false) {
    const symbol = row?.symbol
    if (!symbol) return null
    if (optionIntraday.value[symbol] && !force) return optionIntraday.value[symbol]
    optionIntradayLoading.value = { ...optionIntradayLoading.value, [symbol]: true }
    optionIntradayError.value = { ...optionIntradayError.value, [symbol]: '' }
    try {
      const response = await axios.get('./api/option-intraday', {
        params: {
          symbol,
          underlying: row.underlying?.contract || row.underlying?.symbol,
          ts: Date.now()
        }
      })
      optionIntraday.value = { ...optionIntraday.value, [symbol]: response.data }
      return response.data
    } catch (err) {
      optionIntradayError.value = { ...optionIntradayError.value, [symbol]: '期权走势暂不可用。' }
      return null
    } finally {
      optionIntradayLoading.value = { ...optionIntradayLoading.value, [symbol]: false }
    }
  }

  return {
    data,
    loading,
    error,
    commodities,
    options,
    news,
    meta,
    liveIntraday,
    liveLoading,
    optionRows,
    optionLoading,
    optionError,
    optionFetchedAt,
    optionIntraday,
    optionIntradayLoading,
    optionIntradayError,
    pinnedSymbols,
    togglePin,
    isPinned,
    load,
    refreshIntraday,
    loadOptions,
    loadOptionIntraday
  }
})
