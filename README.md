# Makeup —— 化妆品行业数据安全智能体

> **v1.0.0-internal-beta** | 企业内网部署 · 数据100%可溯源 · 严禁AI编造

一款专为化妆品行业设计的企业级数据安全智能体。核心使命：**所有输出数据真实度高达99%，每个数据点均可追溯到原始来源**。自动生成专业PPT/Word文档，全程安全审计。

---

## 核心能力

| 模块 | 功能 |
|------|------|
| 多格式数据源 | CSV / Excel / PDF / Word / TXT / 图片OCR / 网页链接 |
| 文档生成 | PPTX 演示文稿 + DOCX Word文档，3套企业模板 |
| 数据溯源 | REF-ID 全程追溯，每一条数据均可验证来源 |
| 安全审计 | 敏感词扫描、内容脱敏、全操作日志 |
| 多账户 | 角色管理（admin/editor/viewer），并发互不干扰 |
| 一键部署 | `npm run deploy` 即完成初始化+构建+启动 |

## 技术架构

```
makeup/
├── client/                   # React 19 + Vite + Ant Design 6
│   └── src/
│       ├── pages/            # 12 个页面 (登录/注册/仪表盘/数据源/文档生成/审计/用户管理...)
│       ├── components/       # FileUploader, SourceLink, ProgressBar, TemplateSelector...
│       ├── api/              # Axios 封装, auth/datasource/document/audit API
│       ├── context/          # AuthContext, BrandContext
│       └── hooks/            # useAuth, useDataSources, useDocuments...
│
├── server/                   # Express 5 + better-sqlite3
│   ├── routes/               # auth, datasource, document, audit, user API
│   ├── controllers/          # 业务逻辑层
│   ├── services/             # 数据管道、内容扫描、文档生成编排
│   ├── generators/
│   │   ├── pptx/             # PPTX 生成引擎 (封面/目录/图表/卡片/表格/结论)
│   │   ├── docx/             # DOCX 生成引擎 (页眉页脚/表格/TOC/分段)
│   │   └── common/           # sourceLinker(溯源注入), sanitizer(脱敏), brandVI
│   ├── middleware/            # auth, roleGuard, audit, contentScanner, fileUpload
│   ├── utils/                # fileParser(PDF/DOCX/CSV), urlParser, imageParser(OCR)
│   ├── database/             # schema.sql (10表), seed.js
│   └── templates/ppt/        # 3套品牌模板 (深蓝商务/美妆粉/学术白皮书)
│
└── docs/                     # 架构文档、数据库ER图、API参考
```

## 数据流

```
用户上传数据源 (CSV/Excel/PDF/DOCX/图片/URL)
       │
       ▼
  fileParser / imageParser / urlParser
       │
       ▼
  数据点提取 + REF-ID 生成 (REF-2026-xxxx)
       │
       ▼
  用户选择数据点 → 配置模板/指令
       │
       ▼
  ┌─────────────────────────────────┐
  │  文档生成管道 (8阶段)            │
  │  ① 加载数据 → ② 敏感词扫描      │
  │  ③ 脱敏处理 → ④ 结构内容        │
  │  ⑤ 生成文件 → ⑥ 二次扫描        │
  │  ⑦ 保存记录 → ⑧ 返回下载        │
  └─────────────────────────────────┘
       │
       ▼
  每个数据点自动注入 [来源: REF-XXX | 可信度]
       │
       ▼
  用户下载 PPTX / DOCX
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装与运行

```bash
# 1. 克隆仓库
git clone https://github.com/qinchenox/makeup.git
cd makeup

# 2. 安装依赖
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# 3. 初始化数据库 (创建管理员账户)
npm run setup

# 4. 启动开发环境
npm run dev

# 浏览器打开 http://localhost:5173
# 默认账户: admin / admin123
```

### 一键部署

```bash
npm run deploy
# 自动执行: 初始化DB → 构建前端 → 启动生产服务
# 访问 http://localhost:3001
```

## 使用流程

### 1. 上传数据源

点击「数据源管理」→「上传数据源」，支持两种方式：

- **文件上传**：拖拽或选择 CSV/Excel/PDF/Word/图片/TXT
- **网页链接**：粘贴化妆品行业文章URL，自动抓取解析

系统自动提取数据点，每条数据生成唯一 REF-ID。

### 2. 编辑数据点 (可选)

在数据源详情中编辑/删除/添加数据点，标记为「关键数据」。

### 3. 生成文档

点击「文档生成」→ 选择数据点 → 配置：

- 文档类型：PPTX 或 DOCX
- 模板：深蓝商务 / 美妆粉 / 学术白皮书
- 指令：描述文档重点（如"对比各产品投诉率，生成饼图"）
- 作者：可选填写

点击「预览结构」确认章节划分，再点击「生成 PPTX/DOCX」。

### 4. 下载与溯源

在「文档历史」中下载文件。打开文档后，每条数据旁都附有 `[来源: REF-XXX]` 标注，可追溯到原始数据源。

## 数据库模型

| 表 | 说明 |
|----|------|
| users | 多角色用户 (admin/editor/viewer) |
| sessions | Session 持久化 |
| data_sources | 数据源元数据 + 可信度 |
| data_points | 提取的每条数据 (带 REF-ID) |
| documents | 生成的文档记录 |
| document_data_points | 文档-数据点关联 |
| audit_logs | 全操作审计日志 |
| sensitive_words | 敏感词库 (PII/财务/商业机密) |
| brand_configs | 品牌VI配置 |
| categories | 行业分类 (市场/研发/安全/法规...) |

## 版本

| 版本 | 日期 | 说明 |
|------|------|------|
| **v1.0.0-internal-beta** | 2026-05-27 | 内测版：核心链路贯通，4大模块就绪 |

## License

MIT © Makeup Team
