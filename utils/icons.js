const ICON_MAP = {
  food: '餐',
  transport: '行',
  shopping: '购',
  home: '住',
  fun: '娱',
  medical: '医',
  edu: '学',
  other: '他',
  custom: '自'
}

const ICON_OPTIONS = [
  { value: 'food', label: '餐饮' },
  { value: 'transport', label: '交通' },
  { value: 'shopping', label: '购物' },
  { value: 'home', label: '居住' },
  { value: 'fun', label: '娱乐' },
  { value: 'medical', label: '医疗' },
  { value: 'edu', label: '教育' },
  { value: 'other', label: '其他' },
  { value: 'custom', label: '自定义' }
]

const COLOR_OPTIONS = [
  '#F97316',
  '#0EA5E9',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
  '#EF4444',
  '#3B82F6',
  '#6B7280',
  '#0F766E',
  '#CA8A04'
]

function iconText(icon) {
  return ICON_MAP[icon] || ICON_MAP.custom
}

module.exports = {
  ICON_MAP,
  ICON_OPTIONS,
  COLOR_OPTIONS,
  iconText
}
