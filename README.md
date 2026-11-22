# PersonalExpenseTracker · 微信消费记账小程序

用本地 **SQLite**（sql.js）记录日常消费，支持预设/自定义消费项，以及按天、周、月、年、消费项的统计报表。

## 功能

- **明细**：按日浏览账单，合计当日支出；点击编辑，长按删除
- **记账**：选择消费项、金额、日期与备注；支持编辑已有账单
- **消费项**：内置餐饮/交通/购物/居住/娱乐/医疗/教育/其他；可新增、编辑、删除（有账单的不可删）
- **统计**：天 / 周 / 月 / 年切换；趋势柱状图；按消费项占比；可筛选单一消费项明细

## 本地预览（微信开发者工具）

1. 安装并打开 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 选择「导入项目」，目录指向本仓库根目录
3. AppID 可使用测试号，或直接用项目里的 `touristappid`
4. 基础库建议 **3.5.5+**（`project.config.json` 已配置）
5. 编译后即可在模拟器中使用；数据保存在小程序本地用户目录 `expense.sqlite`

> 本仓库 `preview/index.html` 是页面视觉预览（非运行时），可用浏览器打开快速查看 UI。真实数据与 SQLite 需在微信开发者工具中验证。

### 可选：Node 侧验证 SQLite 业务逻辑

```bash
node scripts/test-db.js
```

落盘使用 `FileSystemManager.writeFile({ filePath, data })`（注意参数名是 **`filePath`**，不是 `path`）。数据库路径为 `` `${wx.env.USER_DATA_PATH}/expense.sqlite` ``。

## 主要页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 明细 | `pages/index` | 按日账单列表与合计 |
| 记账 | `pages/add` | 新建 / 编辑账单 |
| 统计 | `pages/stats` | 天周月年 + 消费项报表 |
| 消费项 | `pages/categories` | 分类列表 |
| 编辑消费项 | `pages/category-edit` | 新增 / 编辑 / 删除分类 |

## 数据结构（SQLite）

数据库文件：`${wx.env.USER_DATA_PATH}/expense.sqlite`

### `categories` 消费项

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| name | TEXT UNIQUE | 名称 |
| icon | TEXT | 图标键（food/transport/...） |
| color | TEXT | 展示色 |
| sort_order | INTEGER | 排序 |
| is_preset | INTEGER | 是否预设 |
| created_at | TEXT | 创建时间 |

### `expenses` 账单

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| category_id | INTEGER | 关联 categories.id |
| amount | REAL | 金额 |
| note | TEXT | 备注 |
| spent_at | TEXT | 消费日期 `YYYY-MM-DD` |
| created_at / updated_at | TEXT | 时间戳 |

## 技术说明

- 运行时：微信小程序
- 存储：`utils/sql-asm.js`（sql.js asm 构建，已裁剪 Node `fs`/`path`/`crypto` 引用，避免开发者工具依赖分析告警）+ `utils/db.js` 封装写盘  
  若需从上游重新生成：下载官方 `sql-asm.js` 后执行 `node scripts/patch-sql-asm-for-miniprogram.js`
- 业务：`services/expense.js` / `category.js` / `stats.js`

## 目录结构

```
├── app.js / app.json / app.wxss
├── pages/           # 明细、记账、统计、消费项
├── services/        # 业务查询与写入
├── utils/           # SQLite 与格式化工具
├── images/          # Tab 图标
├── preview/         # 浏览器视觉预览
└── scripts/         # Node 测试脚本
```
