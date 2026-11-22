function pad(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function toDate(input) {
  if (!input) return new Date()
  if (input instanceof Date) return input
  if (typeof input === 'string') {
    // 兼容 YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const [y, m, d] = input.split('-').map(Number)
      return new Date(y, m - 1, d)
    }
    return new Date(input.replace(/-/g, '/'))
  }
  return new Date(input)
}

function formatDate(input) {
  const d = toDate(input)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatMoney(amount) {
  const n = Number(amount || 0)
  return n.toFixed(2)
}

function formatMoneyDisplay(amount) {
  return `¥${formatMoney(amount)}`
}

function startOfWeek(input) {
  const d = toDate(input)
  const day = d.getDay() || 7 // 周一为一周开始
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  result.setDate(result.getDate() - (day - 1))
  return result
}

function endOfWeek(input) {
  const start = startOfWeek(input)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end
}

function startOfMonth(input) {
  const d = toDate(input)
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(input) {
  const d = toDate(input)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function startOfYear(input) {
  const d = toDate(input)
  return new Date(d.getFullYear(), 0, 1)
}

function endOfYear(input) {
  const d = toDate(input)
  return new Date(d.getFullYear(), 11, 31)
}

function addDays(input, days) {
  const d = toDate(input)
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  result.setDate(result.getDate() + days)
  return result
}

function weekLabel(input) {
  const start = startOfWeek(input)
  const end = endOfWeek(input)
  return `${formatDate(start)} ~ ${formatDate(end)}`
}

function monthLabel(input) {
  const d = toDate(input)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

function yearLabel(input) {
  return `${toDate(input).getFullYear()}年`
}

function weekdayName(input) {
  const names = ['日', '一', '二', '三', '四', '五', '六']
  return `周${names[toDate(input).getDay()]}`
}

module.exports = {
  formatDate,
  formatMoney,
  formatMoneyDisplay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addDays,
  weekLabel,
  monthLabel,
  yearLabel,
  weekdayName,
  toDate
}
