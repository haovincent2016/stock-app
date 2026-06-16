export const byToneText = {
  tight: '偏紧',
  loose: '偏松',
  neutral: '中性'
}

export const chartTitles = {
  intraday: '日内分钟走势',
  daily: '日 K 走势',
  weekly: '周 K 走势'
}

export function supplyToneText(value) {
  return byToneText[value] || '中性'
}

export function mergeLiveSnapshot(item, snapshot) {
  if (!item) return item
  if (!snapshot || !Array.isArray(snapshot.points) || !snapshot.points.length) return item
  const previousClose = Number.isFinite(snapshot.previousClose)
    ? snapshot.previousClose
    : item.today?.previousClose ?? null
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
  }
  return { ...item, today }
}

export function buildLiveCalendarRow(item, snapshot, lastSettled) {
  if (!item || !snapshot) return null
  const date = snapshot.tradeDate || snapshot.points?.at(-1)?.date
  if (!date) return null
  const latestPrice = Number.isFinite(snapshot.latestPrice) ? snapshot.latestPrice : null
  const previousClose = Number.isFinite(snapshot.previousClose)
    ? snapshot.previousClose
    : lastSettled?.close ?? null
  const changePct = previousClose && Number.isFinite(latestPrice)
    ? (latestPrice - previousClose) / previousClose
    : null
  const spotBasis = lastSettled?.spotBasis
    ? { ...lastSettled.spotBasis, date, status: lastSettled.spotBasis.status ? `${lastSettled.spotBasis.status}（沿用前一交易日）` : '沿用前一交易日' }
    : { date, status: '盘中暂无现货报价', source: '现货价源待配置', formula: '现货价 - 期货收盘价' }
  return {
    date,
    open: snapshot.points?.[0]?.price ?? null,
    high: Number.isFinite(snapshot.high) ? snapshot.high : null,
    low: Number.isFinite(snapshot.low) ? snapshot.low : null,
    close: latestPrice,
    settlement: null,
    limitUp: Number.isFinite(item.limitUp) ? item.limitUp : null,
    limitDown: Number.isFinite(item.limitDown) ? item.limitDown : null,
    limitSource: item.limitSource ?? null,
    volume: Number.isFinite(snapshot.volume) ? snapshot.volume : null,
    openInterest: snapshot.points?.at(-1)?.openInterest ?? null,
    changePct,
    spotBasis,
    isLive: true
  }
}

export function mergeFundamentalNotes(base, newsTitles) {
  const out = []
  const seen = new Set()
  const push = (value) => {
    const text = (value ?? '').toString().trim()
    if (!text || seen.has(text)) return
    seen.add(text)
    out.push(text)
  }
  ;(base ?? []).forEach(push)
  ;(newsTitles ?? []).forEach(push)
  return out
}

export function getLimitStatus(item) {
  if (!item?.limitUp && !item?.limitDown) return null
  const price = item.today?.latestPrice ?? item.latest?.close
  if (!Number.isFinite(price)) return null
  if (Number.isFinite(item.limitUp) && price >= item.limitUp) return 'limitUp'
  if (Number.isFinite(item.limitDown) && price <= item.limitDown) return 'limitDown'
  return null
}

export function buildOptionMovers(commodities, limit = 8) {
  return (commodities ?? [])
    .flatMap((item) => buildOptionCandidates(item))
    .filter((row) => Number.isFinite(row.changePct))
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

function buildOptionCandidates(item) {
  const latestPrice = item?.today?.latestPrice ?? item?.latest?.close
  const changePct = item?.today?.changePct ?? item?.metrics?.changePct
  if (!Number.isFinite(latestPrice) || !Number.isFinite(changePct) || latestPrice <= 0) return []

  const previousPrice = Number.isFinite(item?.today?.previousClose)
    ? item.today.previousClose
    : latestPrice / (1 + changePct)
  if (!Number.isFinite(previousPrice) || previousPrice <= 0) return []

  const step = inferOptionStrikeStep(latestPrice)
  const atm = roundToStep(latestPrice, step)
  const month = item.contractMonth?.month ?? inferMonth(item.latest?.date || item.today?.date)
  const year = item.contractMonth?.year ?? inferYear(item.latest?.date || item.today?.date)
  const contractDigits = `${String(year).slice(-2)}${String(month).padStart(2, '0')}`
  const roots = optionRoots(item)
  const rangePct = item?.today?.rangePct ?? item?.metrics?.rangePct ?? Math.abs(changePct)
  const volatility = Math.max(0.018, Math.min(0.22, Math.abs(changePct) * 2.4 + rangePct * 0.8))
  const strikes = [atm - step, atm, atm + step].filter((value) => value > 0)

  return roots.flatMap((root) =>
    strikes.flatMap((strike) => [
      buildOptionRow(item, root, contractDigits, 'C', strike, latestPrice, previousPrice, volatility),
      buildOptionRow(item, root, contractDigits, 'P', strike, latestPrice, previousPrice, volatility)
    ])
  )
}

function buildOptionRow(item, root, contractDigits, type, strike, latestPrice, previousPrice, volatility) {
  const price = estimateOptionPremium(type, latestPrice, strike, volatility)
  const previousOptionPrice = estimateOptionPremium(type, previousPrice, strike, volatility)
  const changePct = previousOptionPrice > 0
    ? clamp((price - previousOptionPrice) / previousOptionPrice, -0.95, 4.8)
    : null
  const underlyingChangePct = latestPrice && previousPrice ? (latestPrice - previousPrice) / previousPrice : null
  const delta = estimateDelta(type, latestPrice, strike)
  const contract = `${root}${contractDigits}${type}${Math.round(strike)}`
  const optionType = type === 'C' ? '看涨' : '看跌'
  const volumeBase = item.today?.volume ?? item.latest?.volume ?? 0
  const openInterestBase = item.latest?.openInterest ?? 0

  return {
    symbol: contract,
    name: `${item.name.replace('连续', '')}${contractDigits}${optionType}${Math.round(strike)}`,
    optionType,
    strike,
    latestPrice: roundOption(price),
    changePct,
    volume: Math.round(volumeBase * (0.012 + Math.min(0.05, Math.abs(changePct ?? 0) * 0.008))),
    openInterest: Math.round(openInterestBase * (0.006 + Math.abs(delta) * 0.012)),
    delta,
    moneyness: latestPrice / strike - 1,
    source: '根据标的期货行情估算',
    underlying: {
      symbol: item.symbol,
      name: item.name,
      contract: item.mainContract ?? item.symbol,
      contractMonth: item.contractMonth ?? null,
      latestPrice,
      changePct: underlyingChangePct,
      rangePct: item.today?.rangePct ?? null,
      volume: item.today?.volume ?? item.latest?.volume ?? null
    }
  }
}

function optionRoots(item) {
  const match = (item.mainContract ?? item.symbol ?? '').match(/^[A-Z]+/)
  return [match?.[0] ?? item.symbol?.replace(/\d+$/, '') ?? 'OP']
}

function inferOptionStrikeStep(price) {
  if (price >= 50000) return 500
  if (price >= 10000) return 100
  if (price >= 5000) return 50
  if (price >= 1000) return 20
  if (price >= 500) return 10
  return 5
}

function roundToStep(value, step) {
  return Math.max(step, Math.round(value / step) * step)
}

function estimateOptionPremium(type, price, strike, volatility) {
  const intrinsic = type === 'C' ? Math.max(0, price - strike) : Math.max(0, strike - price)
  const distance = Math.abs(price - strike) / Math.max(price, 1)
  const timeValue = price * volatility * Math.exp(-distance * 10)
  return Math.max(1, intrinsic + timeValue)
}

function estimateDelta(type, price, strike) {
  const raw = 0.5 + Math.max(-0.45, Math.min(0.45, (price / strike - 1) * 5))
  return type === 'C' ? raw : raw - 1
}

function inferYear(date) {
  const year = Number(String(date ?? '').slice(0, 4))
  return Number.isFinite(year) && year > 2000 ? year : new Date().getFullYear()
}

function inferMonth(date) {
  const month = Number(String(date ?? '').slice(5, 7))
  if (Number.isFinite(month) && month >= 1 && month <= 12) return String(month).padStart(2, '0')
  return String(new Date().getMonth() + 1).padStart(2, '0')
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function roundOption(value) {
  return Math.round(value * 10) / 10
}
