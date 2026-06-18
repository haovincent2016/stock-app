(function () {
  const { createApp, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } = window.Vue;
  const { createRouter, createWebHashHistory, useRoute, useRouter } = window.VueRouter;
  const piniaApi =
    window.Pinia ||
    {
      createPinia() {
        return { install() {} };
      },
      defineStore(_id, setup) {
        let store;
        return () => {
          store = store || setup();
          return store;
        };
      }
    };
  const { createPinia, defineStore } = piniaApi;

  const byToneText = {
    tight: "偏紧",
    loose: "偏松",
    neutral: "中性"
  };

  const chartTitles = {
    intraday: "日内分钟走势",
    daily: "日 K 走势",
    weekly: "周 K 走势"
  };

  const useMarketStore = defineStore("market", () => {
    const data = ref(null);
    const loading = ref(false);
    const error = ref("");
    const liveIntraday = ref({});
    const liveLoading = ref({});

    const commodities = computed(() => data.value?.commodities ?? []);
    const news = computed(() => data.value?.news ?? []);
    const meta = computed(() => data.value?.meta ?? {});

    async function load(force = false) {
      if (data.value && !force) return;
      loading.value = true;
      error.value = "";
      try {
        const response = await axios.get("./data/market.json", {
          params: { ts: Date.now() }
        });
        data.value = response.data;
      } catch (err) {
        error.value = "数据文件未载入，请先运行 npm run update。";
        data.value = { meta: {}, commodities: [], news: [] };
      } finally {
        loading.value = false;
      }
    }

    async function refreshIntraday(symbol) {
      if (!symbol) return null;
      liveLoading.value = { ...liveLoading.value, [symbol]: true };
      try {
        const response = await axios.get("./api/intraday", {
          params: { symbol, ts: Date.now() }
        });
        const snapshot = response.data;
        if (snapshot && Array.isArray(snapshot.points) && snapshot.points.length) {
          liveIntraday.value = { ...liveIntraday.value, [symbol]: snapshot };
          return snapshot;
        }
        return null;
      } catch (err) {
        return null;
      } finally {
        liveLoading.value = { ...liveLoading.value, [symbol]: false };
      }
    }

    return { data, loading, error, commodities, news, meta, liveIntraday, liveLoading, load, refreshIntraday };
  });

  const Sparkline = {
    props: {
      values: {
        type: Array,
        default: () => []
      }
    },
    computed: {
      paths() {
        const clean = this.values.filter(Number.isFinite);
        if (clean.length < 2) return { line: "", area: "" };
        const width = 180;
        const height = 56;
        const min = Math.min(...clean);
        const max = Math.max(...clean);
        const span = max - min || 1;
        const points = clean.map((value, index) => {
          const x = (index / (clean.length - 1)) * width;
          const y = height - ((value - min) / span) * (height - 6) - 3;
          return [x, y];
        });
        const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
        return {
          line,
          area: `${line} L${width} ${height} L0 ${height} Z`
        };
      }
    },
    template: `
      <svg class="sparkline" viewBox="0 0 180 56" preserveAspectRatio="none" aria-hidden="true">
        <path class="spark-area" :d="paths.area"></path>
        <path class="spark-line" :d="paths.line"></path>
      </svg>
    `
  };

  const MarketChart = {
    props: {
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
        default: ""
      }
    },
    emits: ["select-date"],
    setup(props, { emit }) {
      const chartEl = ref(null);
      let chart = null;

      function initChart() {
        if (!chartEl.value || !window.echarts) return;
        chart = echarts.init(chartEl.value, null, { renderer: "canvas" });
        chart.on("click", handleChartClick);
        renderChart();
      }

      function renderChart() {
        if (!chart || !props.item) return;
        chart.setOption(buildChartOption(props.item, props.view, props.selectedDate), true);
      }

      function handleChartClick(params) {
        if (props.view !== "daily" || !Number.isInteger(params.dataIndex)) return;
        const row = getValidCandleRows(props.item, "daily")[params.dataIndex];
        if (row?.date) emit("select-date", row.date);
      }

      function resizeChart() {
        chart?.resize();
      }

      onMounted(() => {
        nextTick(initChart);
        window.addEventListener("resize", resizeChart);
      });

      watch(
        () => [props.item.symbol, props.view, props.selectedDate],
        () => nextTick(renderChart)
      );

      onBeforeUnmount(() => {
        window.removeEventListener("resize", resizeChart);
        chart?.dispose();
      });

      return { chartEl };
    },
    template: `<div ref="chartEl" class="echart"></div>`
  };

  const HomePage = {
    components: { Sparkline },
    setup() {
      const store = useMarketStore();
      const category = ref("全部");
      const search = ref("");
      const sort = ref("change");

      onMounted(() => store.load());

      const categories = computed(() => ["全部", ...new Set(store.commodities.map((item) => item.category))]);
      const filteredCommodities = computed(() => {
        const needle = search.value.trim().toLowerCase();
        return store.commodities
          .filter((item) => {
            const matchesCategory = category.value === "全部" || item.category === category.value;
            const haystack = [item.name, item.symbol, item.exchange, item.category].join(" ").toLowerCase();
            return matchesCategory && (!needle || haystack.includes(needle));
          })
          .sort((a, b) => {
            if (sort.value === "range") return (b.today?.rangePct ?? -1) - (a.today?.rangePct ?? -1);
            if (sort.value === "williams") return (b.metrics?.williamsR ?? -100) - (a.metrics?.williamsR ?? -100);
            if (sort.value === "volume") return (b.today?.volume ?? -1) - (a.today?.volume ?? -1);
            return Math.abs(b.today?.changePct ?? 0) - Math.abs(a.today?.changePct ?? 0);
          });
      });

      const avgRange = computed(() => avg(store.commodities.map((item) => item.today?.rangePct)));
      const upCount = computed(() => store.commodities.filter((item) => (item.today?.changePct ?? 0) > 0).length);
      const oversoldCount = computed(() => store.commodities.filter((item) => item.metrics?.williamsR <= -80).length);
      const volatilityRows = computed(() =>
        store.commodities.slice().sort((a, b) => (b.today?.rangePct ?? 0) - (a.today?.rangePct ?? 0)).slice(0, 6)
      );
      const williamsRows = computed(() =>
        store.commodities.slice().sort((a, b) => (b.metrics?.williamsR ?? -100) - (a.metrics?.williamsR ?? -100))
      );

      function refresh() {
        store.load(true);
      }

      return {
        store,
        category,
        search,
        sort,
        categories,
        filteredCommodities,
        avgRange,
        upCount,
        oversoldCount,
        volatilityRows,
        williamsRows,
        refresh,
        formatNumber,
        compactNumber,
        formatPct,
        formatSignedPct,
        changeClass,
        rankColor,
        wrLeft
      };
    },
    template: `
      <div class="app-shell">
        <header class="topbar">
          <div>
            <p class="eyebrow">Futures Daily</p>
            <h1>每日资讯</h1>
          </div>
          <div class="top-actions">
            <div class="date-chip">{{ store.meta.tradeDate || '--' }}</div>
            <el-button circle :loading="store.loading" @click="refresh">
              <span class="fallback-icon">↻</span>
            </el-button>
          </div>
        </header>

        <main>
          <section class="summary-band" aria-label="市场概览">
            <article><span>覆盖品种</span><strong>{{ formatNumber(store.commodities.length) }}</strong></article>
            <article><span>平均日内振幅</span><strong>{{ formatPct(avgRange) }}</strong></article>
            <article><span>日内上涨</span><strong>{{ formatNumber(upCount) }}</strong></article>
            <article><span>威廉低位</span><strong>{{ formatNumber(oversoldCount) }}</strong></article>
          </section>

          <section class="control-row" aria-label="筛选">
            <el-input v-model="search" clearable placeholder="搜索品种、板块或交易所" />
            <div class="segment" role="tablist" aria-label="板块">
              <el-button v-for="item in categories" :key="item" round :class="{ active: category === item }" @click="category = item">
                {{ item }}
              </el-button>
            </div>
            <el-select v-model="sort" aria-label="排序">
              <el-option value="change" label="按涨跌幅" />
              <el-option value="range" label="按日内振幅" />
              <el-option value="williams" label="按威廉指数" />
              <el-option value="volume" label="按成交量" />
            </el-select>
          </section>

          <el-alert v-if="store.error" :title="store.error" type="warning" show-icon class="page-alert" />

          <section class="market-layout">
            <div class="cards-grid" v-loading="store.loading">
              <router-link
                v-for="item in filteredCommodities"
                :key="item.symbol"
                class="commodity-card"
                :to="{ name: 'detail', params: { symbol: item.symbol } }"
              >
                <div class="card-head">
                  <div>
                    <span class="exchange">{{ item.exchange }} · {{ item.symbol }}</span>
                    <h3>{{ item.name }}<span v-if="item.contractMonth" class="contract-tag">{{ item.contractMonth.label }}</span></h3>
                  </div>
                  <div class="card-actions">
                    <span class="category-pill">{{ item.category }}</span>
                    <span class="fallback-icon">↗</span>
                  </div>
                </div>
                <div class="price-row">
                  <strong class="last-price">{{ formatNumber(item.today?.latestPrice ?? item.latest?.close, item.priceDigits ?? 0) }}</strong>
                  <span class="change-pill" :class="changeClass(item.today?.changePct)">
                    {{ formatSignedPct(item.today?.changePct) }}
                  </span>
                </div>
                <sparkline :values="(item.today?.points || []).map(row => row.price)" />
                <div class="metric-grid">
                  <div><span>振幅</span><strong>{{ formatPct(item.today?.rangePct) }}</strong></div>
                  <div><span>高 / 低</span><strong>{{ formatNumber(item.today?.high, item.priceDigits ?? 0) }} / {{ formatNumber(item.today?.low, item.priceDigits ?? 0) }}</strong></div>
                  <div><span>W%R</span><strong>{{ Number.isFinite(item.metrics?.williamsR) ? item.metrics.williamsR.toFixed(1) : '--' }}</strong></div>
                  <div><span>成交量</span><strong>{{ compactNumber(item.today?.volume) }}</strong></div>
                </div>
              </router-link>
              <div v-if="!store.loading && !filteredCommodities.length" class="empty-state">没有匹配的品种</div>
            </div>

            <aside class="side-panel">
              <section class="panel-section">
                <div class="section-title">
                  <h2>波动榜</h2>
                  <span>{{ store.meta.status || '每日' }}</span>
                </div>
                <div class="rank-list">
                  <router-link
                    v-for="(item, index) in volatilityRows"
                    :key="item.symbol"
                    class="rank-row"
                    :to="{ name: 'detail', params: { symbol: item.symbol } }"
                  >
                    <div class="rank-name">
                      <span class="rank-dot" :style="{ background: rankColor(index) }"></span>
                      <strong>{{ item.name }}<span v-if="item.contractMonth" class="contract-tag inline">{{ item.contractMonth.label }}</span></strong>
                    </div>
                    <span class="rank-value">{{ formatPct(item.today?.rangePct) }}</span>
                  </router-link>
                </div>
              </section>

              <section class="panel-section">
                <div class="section-title">
                  <h2>威廉指数</h2>
                  <span>W%R 14</span>
                </div>
                <div class="wr-map">
                  <router-link
                    v-for="item in williamsRows"
                    :key="item.symbol"
                    class="wr-row"
                    :to="{ name: 'detail', params: { symbol: item.symbol } }"
                  >
                    <span>{{ item.name }}<span v-if="item.contractMonth" class="contract-tag inline">{{ item.contractMonth.label }}</span></span>
                    <span class="wr-track"><span class="wr-pin" :style="{ left: wrLeft(item.metrics?.williamsR) + '%' }"></span></span>
                    <strong>{{ Number.isFinite(item.metrics?.williamsR) ? item.metrics.williamsR.toFixed(0) : '--' }}</strong>
                  </router-link>
                </div>
              </section>
            </aside>
          </section>
        </main>
      </div>
    `
  };

  const DetailPage = {
    components: { MarketChart },
    setup() {
      const store = useMarketStore();
      const route = useRoute();
      const router = useRouter();
      const activeView = ref("intraday");
      const selectedTradeDate = ref("");
      const selectedMonthKey = ref("");

      onMounted(async () => {
        await store.load();
        if (!item.value && store.commodities.length) {
          router.replace({ name: "detail", params: { symbol: store.commodities[0].symbol } });
          return;
        }
        if (item.value?.symbol) store.refreshIntraday(item.value.symbol);
      });

      const baseItem = computed(() => store.commodities.find((row) => row.symbol === route.params.symbol));
      const liveSnapshot = computed(() => (baseItem.value ? store.liveIntraday[baseItem.value.symbol] ?? null : null));
      const item = computed(() => mergeLiveSnapshot(baseItem.value, liveSnapshot.value));
      const liveLoading = computed(() => (baseItem.value ? !!store.liveLoading[baseItem.value.symbol] : false));
      const liveFetchedAt = computed(() => liveSnapshot.value?.fetchedAt ?? null);
      const isLiveSession = computed(() => {
        if (!liveSnapshot.value || !baseItem.value) return false;
        const liveDate = liveSnapshot.value.tradeDate || liveSnapshot.value.points?.at(-1)?.date;
        const lastSettled = baseItem.value.history?.at(-1)?.date;
        return liveDate && liveDate !== lastSettled;
      });
      const relatedNews = computed(() => store.news.filter((row) => row.symbol === item.value?.symbol));
      const recentDailyRows = computed(() => {
        const history = item.value?.history ?? [];
        const start = Math.max(0, history.length - 7);
        const settled = history.slice(start).map((row, index) => {
          const previous = history[start + index - 1];
          return {
            ...row,
            changePct: previous?.close ? (row.close - previous.close) / previous.close : null,
            isLive: false
          };
        });
        if (isLiveSession.value && liveSnapshot.value) {
          const liveRow = buildLiveCalendarRow(item.value, liveSnapshot.value, settled.at(-1));
          if (liveRow) return [...settled.slice(-6), liveRow];
        }
        return settled;
      });
      const selectedDaily = computed(
        () => recentDailyRows.value.find((row) => row.date === selectedTradeDate.value) ?? recentDailyRows.value.at(-1) ?? item.value?.latest
      );
      const previousSelectedDaily = computed(() => {
        const history = item.value?.history ?? [];
        const index = history.findIndex((row) => row.date === selectedDaily.value?.date);
        return index > 0 ? history[index - 1] : null;
      });
      const selectedOpenInterestChange = computed(() => {
        const current = selectedDaily.value?.openInterest;
        const previous = previousSelectedDaily.value?.openInterest;
        return Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null;
      });
      const selectedSpotBasis = computed(() => selectedDaily.value?.spotBasis ?? {});
      const yearlyMonths = computed(() => {
        const rows = item.value?.monthly ?? [];
        const latestYear = (item.value?.latest?.date || item.value?.today?.date || "").slice(0, 4);
        return rows.filter((row) => !latestYear || row.month.startsWith(latestYear));
      });
      const selectedMonth = computed(() => {
        return yearlyMonths.value.find((row) => row.month === selectedMonthKey.value) ?? yearlyMonths.value.at(-1) ?? null;
      });
      const supplyNotes = computed(() =>
        mergeFundamentalNotes(item.value?.fundamentals?.supply, selectedMonth.value?.fundamentals?.supplyNews)
      );
      const demandNotes = computed(() =>
        mergeFundamentalNotes(item.value?.fundamentals?.demand, selectedMonth.value?.fundamentals?.demandNews)
      );

      watch(
        () => recentDailyRows.value.map((row) => row.date).join(","),
        () => {
          if (!recentDailyRows.value.some((row) => row.date === selectedTradeDate.value)) {
            selectedTradeDate.value = recentDailyRows.value.at(-1)?.date ?? "";
          }
        },
        { immediate: true }
      );

      watch(
        () => yearlyMonths.value.map((row) => row.month).join(","),
        () => {
          if (!yearlyMonths.value.some((row) => row.month === selectedMonthKey.value)) {
            selectedMonthKey.value = yearlyMonths.value.at(-1)?.month ?? "";
          }
        },
        { immediate: true }
      );

      function refresh() {
        if (baseItem.value?.symbol) {
          store.refreshIntraday(baseItem.value.symbol);
        } else {
          store.load(true);
        }
      }

      function selectTradeDate(date) {
        if (!recentDailyRows.value.some((row) => row.date === date)) return;
        selectedTradeDate.value = date;
      }

      function selectMonth(month) {
        if (!yearlyMonths.value.some((row) => row.month === month)) return;
        selectedMonthKey.value = month;
      }

      return {
        store,
        item,
        activeView,
        selectedTradeDate,
        selectedMonthKey,
        relatedNews,
        recentDailyRows,
        selectedDaily,
        selectedOpenInterestChange,
        selectedSpotBasis,
        yearlyMonths,
        selectedMonth,
        supplyNotes,
        demandNotes,
        liveLoading,
        liveFetchedAt,
        isLiveSession,
        refresh,
        selectTradeDate,
        selectMonth,
        chartTitles,
        byToneText,
        formatNumber,
        compactNumber,
        formatPct,
        formatSignedPct,
        formatSignedNumber,
        changeClass,
        formatDate,
        formatTime,
        dateDayLabel,
        weekdayLabel,
        monthLabel,
        supplyToneText,
        formatBasisValue,
        formatBasisPct
      };
    },
    template: `
      <div class="app-shell detail-shell">
        <header class="topbar">
          <router-link class="back-link" :to="{ name: 'home' }">
            <span class="fallback-icon">←</span>
            <span>返回首页</span>
          </router-link>
          <div class="top-actions">
            <div class="date-chip">
              <span>{{ item?.today?.date || store.meta.tradeDate || '--' }}</span>
              <em v-if="liveFetchedAt">实时 {{ formatTime(liveFetchedAt) }}</em>
            </div>
            <el-button circle :loading="store.loading || liveLoading" @click="refresh">
              <span class="fallback-icon">↻</span>
            </el-button>
          </div>
        </header>

        <main v-if="item">
          <section class="detail-hero">
            <div>
              <p class="eyebrow">{{ item.exchange }} · {{ item.symbol }} · {{ item.category }}</p>
              <h1>{{ item.name }}<span v-if="item.contractMonth" class="contract-tag detail">{{ item.contractMonth.label }}</span></h1>
              <p class="detail-summary">{{ item.summary || '等待最新供需资讯。' }}</p>
            </div>
            <div class="price-panel">
              <span>最新价</span>
              <strong>{{ formatNumber(item.today?.latestPrice ?? item.latest?.close, item.priceDigits ?? 0) }}</strong>
              <em class="change-pill" :class="changeClass(item.today?.changePct)">
                {{ formatSignedPct(item.today?.changePct) }}
              </em>
            </div>
          </section>

          <section class="detail-stats" aria-label="关键指标">
            <article><span>日内高 / 低</span><strong>{{ formatNumber(item.today?.high, item.priceDigits ?? 0) }} / {{ formatNumber(item.today?.low, item.priceDigits ?? 0) }}</strong></article>
            <article><span>日内振幅</span><strong>{{ formatPct(item.today?.rangePct) }}</strong></article>
            <article><span>Williams %R</span><strong>{{ Number.isFinite(item.metrics?.williamsR) ? item.metrics.williamsR.toFixed(1) : '--' }}</strong></article>
            <article><span>ATR 14</span><strong>{{ formatNumber(item.metrics?.atr14, item.priceDigits ?? 0) }}</strong></article>
            <article><span>成交量</span><strong>{{ compactNumber(item.today?.volume ?? item.latest?.volume) }}</strong></article>
          </section>

          <section class="chart-panel">
            <div class="chart-head">
              <div>
                <h2>走势</h2>
                <span>{{ chartTitles[activeView] }}</span>
              </div>
              <el-tabs v-model="activeView" class="chart-tabs">
                <el-tab-pane label="日内" name="intraday" />
                <el-tab-pane label="日 K" name="daily" />
                <el-tab-pane label="周 K" name="weekly" />
              </el-tabs>
            </div>
            <div class="chart-frame">
              <market-chart
                :item="item"
                :view="activeView"
                :selected-date="selectedTradeDate"
                @select-date="selectTradeDate"
              />
            </div>
          </section>

          <section class="flow-panel">
            <div class="section-title">
              <h2>成交量 / 持仓量 / 期现基差</h2>
              <span>日 K 与月度供需</span>
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
                <strong>{{ formatBasisValue(selectedSpotBasis.basis, item.priceDigits ?? 0) }}</strong>
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
                <div class="month-card-head">
                  <strong>{{ selectedDaily?.date || '--' }} 日 K 数据</strong>
                  <span>{{ item.symbol }}</span>
                </div>
                <div class="month-metrics">
                  <div><span>收盘价</span><strong>{{ formatNumber(selectedDaily?.close, item.priceDigits ?? 0) }}</strong></div>
                  <div><span>涨跌幅</span><strong :class="changeClass(selectedDaily?.changePct)">{{ formatSignedPct(selectedDaily?.changePct) }}</strong></div>
                  <div><span>成交量</span><strong>{{ compactNumber(selectedDaily?.volume) }}</strong></div>
                  <div><span>持仓量</span><strong>{{ compactNumber(selectedDaily?.openInterest) }}</strong></div>
                  <div><span>持仓变化</span><strong :class="changeClass(selectedOpenInterestChange)">{{ formatSignedNumber(selectedOpenInterestChange) }}</strong></div>
                  <div><span>结算价</span><strong>{{ formatNumber(selectedDaily?.settlement, item.priceDigits ?? 0) }}</strong></div>
                  <div><span>期现基差</span><strong>{{ formatBasisValue(selectedSpotBasis.basis, item.priceDigits ?? 0) }}</strong></div>
                  <div><span>日内高 / 低</span><strong>{{ formatNumber(selectedDaily?.high, item.priceDigits ?? 0) }} / {{ formatNumber(selectedDaily?.low, item.priceDigits ?? 0) }}</strong></div>
                </div>
              </div>

              <div class="selected-month-card">
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
            <div class="section-title">
              <h2>相关供需资讯</h2>
              <span>{{ relatedNews.length }} 条</span>
            </div>
            <div class="news-list">
              <article v-for="news in relatedNews.slice(0, 16)" :key="news.symbol + news.title" class="news-item detail-news-item">
                <div class="news-meta">
                  <strong>{{ news.source || '资讯' }}</strong>
                  <span class="tone-pill" :class="news.tone || 'neutral'">{{ byToneText[news.tone] || '中性' }}</span>
                </div>
                <h3><a :href="news.url" target="_blank" rel="noreferrer">{{ news.title }}</a></h3>
                <p class="news-summary">{{ news.summary || '供需线索待补充' }}</p>
                <div class="news-meta">
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
    `
  };

  const routes = [
    { path: "/", name: "home", component: HomePage },
    { path: "/detail/:symbol", name: "detail", component: DetailPage }
  ];

  const router = createRouter({
    history: createWebHashHistory(),
    routes
  });

  const app = createApp({
    template: `<router-view />`
  });

  app.use(createPinia());
  app.use(router);
  app.use(ElementPlus);
  app.mount("#app");

  function buildChartOption(item, view, selectedDate = "") {
    if (view === "intraday") return buildIntradayOption(item);
    return buildCandleOption(item, view, selectedDate);
  }

  function buildIntradayOption(item) {
    const rows = item.today?.points ?? [];
    const priceRows = rows.filter((row) => Number.isFinite(row.price));
    return {
      animation: false,
      grid: { left: 58, right: 24, top: 24, bottom: 42 },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: priceRows.map((row) => row.time),
        axisLine: { lineStyle: { color: "#dfe6dc" } },
        axisTick: { show: false },
        axisLabel: { color: "#667069", hideOverlap: true }
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: "#edf1eb" } },
        axisLabel: { color: "#667069" }
      },
      series: [
        {
          name: item.name,
          type: "line",
          data: priceRows.map((row) => row.price),
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2.4, color: "#177e89" },
          areaStyle: { color: "rgba(63, 185, 143, 0.14)" }
        }
      ]
    };
  }

  function getCandleRows(item, view) {
    if (view === "daily") return (item.history ?? []).slice(-7);
    return (item.weekly ?? []).slice(-90);
  }

  function getValidCandleRows(item, view) {
    return getCandleRows(item, view).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite));
  }

  function buildCandleOption(item, view, selectedDate = "") {
    const clean = getValidCandleRows(item, view);
    return {
      animation: false,
      grid: { left: 58, right: 24, top: 24, bottom: 54 },
      tooltip: {
        trigger: "axis",
        formatter(params) {
          const row = clean[params[0].dataIndex];
          if (!row) return "";
          return [
            `${row.endDate || row.date}`,
            `开 ${formatNumber(row.open, item.priceDigits ?? 0)}`,
            `高 ${formatNumber(row.high, item.priceDigits ?? 0)}`,
            `低 ${formatNumber(row.low, item.priceDigits ?? 0)}`,
            `收 ${formatNumber(row.close, item.priceDigits ?? 0)}`
          ].join("<br>");
        }
      },
      xAxis: {
        type: "category",
        data: clean.map((row) => (row.endDate || row.date).slice(5)),
        axisLine: { lineStyle: { color: "#dfe6dc" } },
        axisTick: { show: false },
        axisLabel: { color: "#667069", hideOverlap: true }
      },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: "#edf1eb" } },
        axisLabel: { color: "#667069" }
      },
      dataZoom: view === "daily" ? [] : [{ type: "inside", start: 45, end: 100 }],
      series: [
        {
          name: item.name,
          type: "candlestick",
          data: clean.map((row) => ({
            value: [row.open, row.close, row.low, row.high],
            itemStyle: view === "daily" && row.date === selectedDate
              ? { borderWidth: 3, borderColor: "#177e89", borderColor0: "#177e89" }
              : undefined
          })),
          itemStyle: {
            color: "#d95f43",
            color0: "#3fb98f",
            borderColor: "#d95f43",
            borderColor0: "#3fb98f"
          }
        }
      ]
    };
  }

  function formatPct(value, digits = 2) {
    if (!Number.isFinite(value)) return "--";
    return `${(value * 100).toFixed(digits)}%`;
  }

  function formatSignedPct(value, digits = 2) {
    if (!Number.isFinite(value)) return "--";
    const sign = value > 0 ? "+" : "";
    return `${sign}${formatPct(value, digits)}`;
  }

  function formatSignedNumber(value, digits = 0) {
    if (!Number.isFinite(value)) return "--";
    const sign = value > 0 ? "+" : "";
    return `${sign}${formatNumber(value, digits)}`;
  }

  function formatNumber(value, digits = 0) {
    if (!Number.isFinite(value)) return "--";
    return new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    }).format(value);
  }

  function compactNumber(value) {
    if (!Number.isFinite(value)) return "--";
    return new Intl.NumberFormat("zh-CN", {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(value);
  }

  function avg(values) {
    const clean = values.filter(Number.isFinite);
    if (!clean.length) return NaN;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  function changeClass(value) {
    if (value > 0) return "up";
    if (value < 0) return "down";
    return "flat";
  }

  function rankColor(index) {
    return ["#d95f43", "#c58a22", "#4568d5", "#177e89", "#3fb98f", "#7a5aa8"][index] || "#667069";
  }

  function wrLeft(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value + 100)) : 50;
  }

  function dailyBasis(row) {
    if (!row) return null;
    if (!Number.isFinite(row.settlement) || !Number.isFinite(row.close)) return null;
    return row.settlement - row.close;
  }

  function dateDayLabel(value) {
    if (!value) return "--";
    return value.slice(5).replace("-", "/");
  }

  function weekdayLabel(value) {
    const date = new Date(`${value}T00:00:00+08:00`);
    if (Number.isNaN(date.getTime())) return "--";
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  }

  function monthLabel(value) {
    if (!value) return "--";
    const [year, month] = value.split("-");
    return `${year}年${month}月`;
  }

  function supplyToneText(value) {
    return byToneText[value] || "中性";
  }

  function formatDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatTime(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(date);
  }

  function mergeLiveSnapshot(item, snapshot) {
    if (!item) return item;
    if (!snapshot || !Array.isArray(snapshot.points) || !snapshot.points.length) return item;
    const previousClose = Number.isFinite(snapshot.previousClose)
      ? snapshot.previousClose
      : item.today?.previousClose ?? null;
    const today = {
      ...item.today,
      date: snapshot.tradeDate || snapshot.points.at(-1)?.date || item.today?.date,
      latestPrice: snapshot.latestPrice ?? item.today?.latestPrice,
      previousClose,
      changePct: Number.isFinite(snapshot.changePct) ? snapshot.changePct : item.today?.changePct,
      rangePct: Number.isFinite(snapshot.rangePct) ? snapshot.rangePct : item.today?.rangePct,
      high: Number.isFinite(snapshot.high) ? snapshot.high : item.today?.high,
      low: Number.isFinite(snapshot.low) ? snapshot.low : item.today?.low,
      volume: Number.isFinite(snapshot.volume) ? snapshot.volume : item.today?.volume,
      points: snapshot.points
    };
    return { ...item, today };
  }

  function buildLiveCalendarRow(item, snapshot, lastSettled) {
    if (!item || !snapshot) return null;
    const date = snapshot.tradeDate || snapshot.points?.at(-1)?.date;
    if (!date) return null;
    const latestPrice = Number.isFinite(snapshot.latestPrice) ? snapshot.latestPrice : null;
    const previousClose = Number.isFinite(snapshot.previousClose)
      ? snapshot.previousClose
      : lastSettled?.close ?? null;
    const changePct = previousClose && Number.isFinite(latestPrice)
      ? (latestPrice - previousClose) / previousClose
      : null;
    const spotBasis = lastSettled?.spotBasis
      ? { ...lastSettled.spotBasis, date, status: lastSettled.spotBasis.status ? `${lastSettled.spotBasis.status}（沿用前一交易日）` : "沿用前一交易日" }
      : { date, status: "盘中暂无现货报价", source: "现货价源待配置", formula: "现货价 - 期货收盘价" };
    return {
      date,
      open: snapshot.points?.[0]?.price ?? null,
      high: Number.isFinite(snapshot.high) ? snapshot.high : null,
      low: Number.isFinite(snapshot.low) ? snapshot.low : null,
      close: latestPrice,
      settlement: null,
      volume: Number.isFinite(snapshot.volume) ? snapshot.volume : null,
      openInterest: snapshot.points?.at(-1)?.openInterest ?? null,
      changePct,
      spotBasis,
      isLive: true
    };
  }

  function mergeFundamentalNotes(base, newsTitles) {
    const out = [];
    const seen = new Set();
    const push = (value) => {
      const text = (value ?? "").toString().trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      out.push(text);
    };
    (base ?? []).forEach(push);
    (newsTitles ?? []).forEach(push);
    return out;
  }

  function formatBasisValue(value, digits = 0) {
    if (!Number.isFinite(value)) return "待接入";
    return formatSignedNumber(value, digits);
  }

  function formatBasisPct(value, digits = 2) {
    if (!Number.isFinite(value)) return "待接入";
    return formatSignedPct(value, digits);
  }
})();
