const db = require('../utils/db')
const {
  formatDate,
  formatMoney,
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
  toDate
} = require('../utils/format')
const { iconText } = require('../utils/icons')

function rangeForDimension(dimension, anchor) {
  const d = toDate(anchor)
  if (dimension === 'week') {
    return {
      start: formatDate(startOfWeek(d)),
      end: formatDate(endOfWeek(d)),
      label: weekLabel(d)
    }
  }
  if (dimension === 'month') {
    return {
      start: formatDate(startOfMonth(d)),
      end: formatDate(endOfMonth(d)),
      label: monthLabel(d)
    }
  }
  if (dimension === 'year') {
    return {
      start: formatDate(startOfYear(d)),
      end: formatDate(endOfYear(d)),
      label: yearLabel(d)
    }
  }
  // day
  const day = formatDate(d)
  return { start: day, end: day, label: day }
}

function shiftAnchor(dimension, anchor, delta) {
  const d = toDate(anchor)
  if (dimension === 'day') return formatDate(addDays(d, delta))
  if (dimension === 'week') return formatDate(addDays(d, delta * 7))
  if (dimension === 'month') {
    return formatDate(new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }
  if (dimension === 'year') {
    return formatDate(new Date(d.getFullYear() + delta, 0, 1))
  }
  return formatDate(d)
}

function summarizeRange(start, end) {
  const row = db.get(
    `SELECT IFNULL(SUM(amount), 0) AS total, COUNT(*) AS count
     FROM expenses
     WHERE spent_at >= ? AND spent_at <= ?`,
    [start, end]
  )
  return {
    total: Number(row.total || 0),
    count: Number(row.count || 0),
    totalText: formatMoney(row.total || 0)
  }
}

function statsByCategory(start, end) {
  const rows = db.all(
    `SELECT c.id, c.name, c.icon, c.color,
            IFNULL(SUM(e.amount), 0) AS total,
            COUNT(e.id) AS count
     FROM categories c
     LEFT JOIN expenses e
       ON e.category_id = c.id
      AND e.spent_at >= ?
      AND e.spent_at <= ?
     GROUP BY c.id
     HAVING total > 0
     ORDER BY total DESC, c.sort_order ASC`,
    [start, end]
  )

  const grand = rows.reduce((sum, r) => sum + Number(r.total || 0), 0) || 1

  return rows.map((r) => {
    const total = Number(r.total || 0)
    const percent = Math.round((total / grand) * 1000) / 10
    return {
      ...r,
      total,
      count: Number(r.count || 0),
      totalText: formatMoney(total),
      percent,
      percentText: `${percent}%`,
      iconText: iconText(r.icon),
      barWidth: `${Math.max(percent, 2)}%`
    }
  })
}

function trendSeries(dimension, start, end) {
  if (dimension === 'day') {
    // 当天按小时没有 spent_at 粒度，改为近 7 天趋势更有用；
    // 这里仍返回当天单点，供报表展示。
    const summary = summarizeRange(start, end)
    return [
      {
        key: start,
        label: start.slice(5),
        total: summary.total,
        totalText: summary.totalText
      }
    ]
  }

  if (dimension === 'week' || dimension === 'month') {
    const map = {}
    db.all(
      `SELECT spent_at AS day, IFNULL(SUM(amount), 0) AS total
       FROM expenses
       WHERE spent_at >= ? AND spent_at <= ?
       GROUP BY spent_at
       ORDER BY spent_at ASC`,
      [start, end]
    ).forEach((row) => {
      map[row.day] = Number(row.total || 0)
    })

    const series = []
    let cursor = toDate(start)
    const last = toDate(end)
    while (cursor <= last) {
      const key = formatDate(cursor)
      const total = map[key] || 0
      series.push({
        key,
        label: key.slice(5),
        total,
        totalText: formatMoney(total)
      })
      cursor = addDays(cursor, 1)
    }
    return series
  }

  // year -> 12 months
  const year = toDate(start).getFullYear()
  const map = {}
  db.all(
    `SELECT substr(spent_at, 1, 7) AS month, IFNULL(SUM(amount), 0) AS total
     FROM expenses
     WHERE spent_at >= ? AND spent_at <= ?
     GROUP BY substr(spent_at, 1, 7)
     ORDER BY month ASC`,
    [start, end]
  ).forEach((row) => {
    map[row.month] = Number(row.total || 0)
  })

  const series = []
  for (let m = 1; m <= 12; m += 1) {
    const key = `${year}-${m < 10 ? `0${m}` : m}`
    const total = map[key] || 0
    series.push({
      key,
      label: `${m}月`,
      total,
      totalText: formatMoney(total)
    })
  }
  return series
}

function withBarHeights(series) {
  const max = Math.max(...series.map((s) => s.total), 0)
  return series.map((s) => ({
    ...s,
    height: max > 0 ? `${Math.max(8, Math.round((s.total / max) * 100))}%` : '0%'
  }))
}

function buildReport(dimension, anchorDate) {
  const range = rangeForDimension(dimension, anchorDate)
  const summary = summarizeRange(range.start, range.end)
  const categories = statsByCategory(range.start, range.end)
  const trend = withBarHeights(trendSeries(dimension, range.start, range.end))

  return {
    dimension,
    anchor: formatDate(anchorDate),
    range,
    summary,
    categories,
    trend
  }
}

function categoryReport(categoryId, dimension, anchorDate) {
  const range = rangeForDimension(dimension, anchorDate)
  const category = db.get(
    `SELECT id, name, icon, color FROM categories WHERE id = ?`,
    [categoryId]
  )
  if (!category) throw new Error('消费项不存在')

  const summary = db.get(
    `SELECT IFNULL(SUM(amount), 0) AS total, COUNT(*) AS count
     FROM expenses
     WHERE category_id = ? AND spent_at >= ? AND spent_at <= ?`,
    [categoryId, range.start, range.end]
  )

  const list = db
    .all(
      `SELECT id, amount, note, spent_at, created_at
       FROM expenses
       WHERE category_id = ? AND spent_at >= ? AND spent_at <= ?
       ORDER BY spent_at DESC, created_at DESC`,
      [categoryId, range.start, range.end]
    )
    .map((row) => ({
      ...row,
      totalText: formatMoney(row.amount),
      amountText: formatMoney(row.amount)
    }))

  return {
    category: {
      ...category,
      iconText: iconText(category.icon)
    },
    dimension,
    range,
    summary: {
      total: Number(summary.total || 0),
      count: Number(summary.count || 0),
      totalText: formatMoney(summary.total || 0)
    },
    list
  }
}

module.exports = {
  rangeForDimension,
  shiftAnchor,
  summarizeRange,
  statsByCategory,
  buildReport,
  categoryReport
}
