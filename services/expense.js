const db = require('../utils/db')
const { formatDate, formatMoney } = require('../utils/format')
const { iconText } = require('../utils/icons')

function decorate(row) {
  if (!row) return null
  return {
    ...row,
    amountText: formatMoney(row.amount),
    iconText: iconText(row.icon)
  }
}

function listExpensesByDate(date) {
  const day = formatDate(date)
  return db
    .all(
      `SELECT e.id, e.amount, e.note, e.spent_at, e.category_id,
              e.created_at, c.name AS category_name, c.icon, c.color
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.spent_at = ?
       ORDER BY e.created_at DESC, e.id DESC`,
      [day]
    )
    .map(decorate)
}

function listExpensesByRange(startDate, endDate) {
  return db
    .all(
      `SELECT e.id, e.amount, e.note, e.spent_at, e.category_id,
              e.created_at, c.name AS category_name, c.icon, c.color
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.spent_at >= ? AND e.spent_at <= ?
       ORDER BY e.spent_at DESC, e.created_at DESC, e.id DESC`,
      [formatDate(startDate), formatDate(endDate)]
    )
    .map(decorate)
}

function getExpense(id) {
  return decorate(
    db.get(
      `SELECT e.id, e.amount, e.note, e.spent_at, e.category_id,
              e.created_at, c.name AS category_name, c.icon, c.color
       FROM expenses e
       JOIN categories c ON c.id = e.category_id
       WHERE e.id = ?`,
      [id]
    )
  )
}

function sumByDate(date) {
  const row = db.get(
    `SELECT IFNULL(SUM(amount), 0) AS total, COUNT(*) AS count
     FROM expenses WHERE spent_at = ?`,
    [formatDate(date)]
  )
  return {
    total: row ? Number(row.total) : 0,
    count: row ? Number(row.count) : 0,
    totalText: formatMoney(row ? row.total : 0)
  }
}

function createExpense({ categoryId, amount, note = '', spentAt }) {
  const value = Number(amount)
  if (!categoryId) throw new Error('请选择消费项')
  if (!Number.isFinite(value) || value <= 0) throw new Error('请输入正确金额')
  if (value > 9999999.99) throw new Error('金额过大')

  const category = db.get('SELECT id FROM categories WHERE id = ?', [categoryId])
  if (!category) throw new Error('消费项不存在')

  const day = formatDate(spentAt || new Date())
  const noteText = String(note || '').trim().slice(0, 100)

  db.run(
    `INSERT INTO expenses (category_id, amount, note, spent_at)
     VALUES (?, ?, ?, ?)`,
    [categoryId, Math.round(value * 100) / 100, noteText, day]
  )

  return db.get('SELECT last_insert_rowid() AS id')
}

function updateExpense(id, { categoryId, amount, note = '', spentAt }) {
  const current = getExpense(id)
  if (!current) throw new Error('账单不存在')

  const value = Number(amount)
  if (!categoryId) throw new Error('请选择消费项')
  if (!Number.isFinite(value) || value <= 0) throw new Error('请输入正确金额')

  const category = db.get('SELECT id FROM categories WHERE id = ?', [categoryId])
  if (!category) throw new Error('消费项不存在')

  db.run(
    `UPDATE expenses
     SET category_id = ?, amount = ?, note = ?, spent_at = ?,
         updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [
      categoryId,
      Math.round(value * 100) / 100,
      String(note || '').trim().slice(0, 100),
      formatDate(spentAt || current.spent_at),
      id
    ]
  )
}

function deleteExpense(id) {
  db.run('DELETE FROM expenses WHERE id = ?', [id])
}

module.exports = {
  listExpensesByDate,
  listExpensesByRange,
  getExpense,
  sumByDate,
  createExpense,
  updateExpense,
  deleteExpense
}
