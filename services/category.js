const db = require('../utils/db')
const { iconText } = require('../utils/icons')

function decorate(row) {
  if (!row) return null
  return {
    ...row,
    is_preset: !!row.is_preset,
    iconText: iconText(row.icon)
  }
}

function listCategories() {
  return db
    .all(
      `SELECT id, name, icon, color, sort_order, is_preset, created_at
       FROM categories
       ORDER BY sort_order ASC, id ASC`
    )
    .map(decorate)
}

function getCategory(id) {
  return decorate(
    db.get(
      `SELECT id, name, icon, color, sort_order, is_preset, created_at
       FROM categories WHERE id = ?`,
      [id]
    )
  )
}

function createCategory({ name, icon = 'custom', color = '#0F766E' }) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('请输入消费项名称')
  if (trimmed.length > 20) throw new Error('名称不超过 20 字')

  const exists = db.get('SELECT id FROM categories WHERE name = ?', [trimmed])
  if (exists) throw new Error('该消费项已存在')

  const maxSort = db.get('SELECT IFNULL(MAX(sort_order), 0) AS m FROM categories')
  const sortOrder = (maxSort && maxSort.m ? maxSort.m : 0) + 1

  db.run(
    `INSERT INTO categories (name, icon, color, sort_order, is_preset)
     VALUES (?, ?, ?, ?, 0)`,
    [trimmed, icon || 'custom', color || '#0F766E', sortOrder]
  )

  return db.get('SELECT id FROM categories WHERE name = ?', [trimmed])
}

function updateCategory(id, { name, icon, color }) {
  const current = getCategory(id)
  if (!current) throw new Error('消费项不存在')

  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('请输入消费项名称')
  if (trimmed.length > 20) throw new Error('名称不超过 20 字')

  const dup = db.get(
    'SELECT id FROM categories WHERE name = ? AND id != ?',
    [trimmed, id]
  )
  if (dup) throw new Error('该消费项已存在')

  db.run(
    `UPDATE categories
     SET name = ?, icon = ?, color = ?
     WHERE id = ?`,
    [trimmed, icon || current.icon, color || current.color, id]
  )
}

function deleteCategory(id) {
  const current = getCategory(id)
  if (!current) throw new Error('消费项不存在')

  const used = db.get(
    'SELECT COUNT(*) AS c FROM expenses WHERE category_id = ?',
    [id]
  )
  if (used && used.c > 0) {
    throw new Error('该消费项下仍有账单，无法删除')
  }

  db.run('DELETE FROM categories WHERE id = ?', [id])
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
}
