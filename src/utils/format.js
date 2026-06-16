export function formatPct(value, digits = 2) {
  if (!Number.isFinite(value)) return '--'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatSignedPct(value, digits = 2) {
  if (!Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatPct(value, digits)}`
}

export function formatSignedNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value, digits)}`
}

export function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return '--'
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value)
}

export function compactNumber(value) {
  if (!Number.isFinite(value)) return '--'
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

export function avg(values) {
  const clean = values.filter(Number.isFinite)
  if (!clean.length) return NaN
  return clean.reduce((sum, value) => sum + value, 0) / clean.length
}

export function changeClass(value) {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

export function rankColor(index) {
  return ['#d95f43', '#c58a22', '#4568d5', '#177e89', '#3fb98f', '#7a5aa8'][index] || '#667069'
}

export function wrLeft(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value + 100)) : 50
}

export function dateDayLabel(value) {
  if (!value) return '--'
  return value.slice(5).replace('-', '/')
}

export function weekdayLabel(value) {
  const date = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime())) return '--'
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
}

export function monthLabel(value) {
  if (!value) return '--'
  const [year, month] = value.split('-')
  return `${year}年${month}月`
}

export function formatDate(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}

export function formatBasisValue(value, digits = 0) {
  if (!Number.isFinite(value)) return '待接入'
  return formatSignedNumber(value, digits)
}

export function formatBasisPct(value, digits = 2) {
  if (!Number.isFinite(value)) return '待接入'
  return formatSignedPct(value, digits)
}
