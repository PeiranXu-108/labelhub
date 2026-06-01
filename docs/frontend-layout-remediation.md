# LabelHub 前端布局溢出与堆叠整改说明

本文档面向前端 agent。目标是修复当前 LabelHub 前端中大量子元素溢出、横向滚动、卡片嵌套、固定列宽压缩以及响应式规则失效的问题。

## 审计结论

Browser 审计页面：

- 当前任务详情页：`http://127.0.0.1:5174/owner/tasks/39b4a113-9a42-4034-b75f-5cbf35cb934a`
- 当前激活页签：模板
- 桌面视口：`1159 x 862`
- 移动视口：临时切换到 `390 x 844` 后已恢复

核心问题不是某个表格或某个按钮单点出错，而是几类布局约束叠加：

1. `.studio-main-column` 是 grid 容器，但没有显式 `grid-template-columns: minmax(0, 1fr)`，隐式 auto track 会被子元素 min-content 撑开。
2. `OwnerTaskDetailRoute` 把 `.owner-section` 用在页面主列容器上，导致外层主列同时承担“布局容器”和“卡片表面”两种职责，移动端产生额外 padding、背景、边框和 min-content 放大。
3. `.studio-with-rail` 在 1159px 宽仍保留 `minmax(320px, 390px)` 侧栏，主内容只剩约 607px，模板设计器三列布局被压到不可用。
4. `.designer-grid` 后置样式固定为 `240px minmax(0, 1fr) 280px`，覆盖了旧的移动端单列规则，导致移动端中间画布宽度为 0。
5. Ant Design 的 Tabs、Table、Radio、Space 等组件缺少统一的 shrink/scroll contract，局部组件被迫撑开祖先容器。
6. `frontend/src/styles.css` 存在两批样式定义，早期响应式规则在前，新 Studio 规则在后，同名选择器互相覆盖，导致开发者很容易以为 media query 生效，实际被后续规则盖掉。

## Browser 证据

### 桌面模板页

在 `1159 x 862` 下，全局没有横向滚动，但模板设计器已经严重塌缩：

| 元素 | Browser 观测 |
| --- | --- |
| `.designer-grid` | `grid-template-columns: 240px 55px 280px` |
| `.designer-canvas` | 实际宽度约 `55px`，内容横向溢出 `24px` |
| `.inspector-form` | `grid-template-columns: 279.703px`，但容器 clientWidth 只有 `246px` |
| `.template-designer` | 本地横向溢出 `17px` |

这说明桌面端即使没有页面级横向滚动，核心工作区也已经不可用。主要原因是右侧 Assistant rail 占据 320 到 390px，而模板设计器左右固定列宽至少需要 `240 + 280 + 2 * 16 = 552px`，中间画布只能被压缩。

### 移动模板页

在 `390 x 844` 下，Browser 审计得到：

- `document.documentElement.clientWidth = 390`
- `document.documentElement.scrollWidth = 647`
- 全局横向溢出：`257px`

主要 offenders：

| 元素 | Browser 观测 |
| --- | --- |
| `.page-shell.owner-shell` | clientWidth `350`，scrollWidth `627` |
| `.studio-with-rail` | clientWidth `350`，scrollWidth `627` |
| `.studio-main-column.owner-section` | `grid-template-columns: 602px`，scrollWidth `626` |
| `.studio-page-header` | width `602`，右侧超出视口 `257px` |
| `.ant-tabs / .ant-tabs-nav / .ant-tabs-content-holder` | width `602`，右侧超出视口 `257px` |
| `.studio-panel.ops-card.template-workspace` | width `602`，右侧超出视口 `257px` |
| `.designer-grid` | `grid-template-columns: 240px 0px 280px` |
| `.designer-canvas` | 实际宽度约 `34px`，内容溢出 |

移动端问题的根因是：主列 grid track 被子元素撑到 602px，再由 `.owner-section` 的 24px padding、Tabs、模板设计器固定列共同向上传播。

## 源码锚点

优先查看这些位置：

- `frontend/src/routes/owner/OwnerTaskDetailRoute.tsx:140`：任务详情页面结构。
- `frontend/src/routes/owner/OwnerTaskDetailRoute.tsx:142`：`<div className="studio-main-column owner-section">` 是主要问题之一。
- `frontend/src/features/studio/index.tsx:80`：`StudioPageHeader` 是固定 flex 行，actions 区域当前 `flex: 0 0 auto`。
- `frontend/src/features/studio/index.tsx:102`：`StudioPanel` 会生成 `.studio-panel` 卡片。
- `frontend/src/features/studio/index.tsx:184`：`AssistantRail` 内容较重，不能在中等桌面宽度继续挤压主工作区。
- `frontend/src/features/template/TemplateDesigner.tsx:119`：模板设计器根节点。
- `frontend/src/features/template/TemplateDesigner.tsx:143`：`.designer-grid` 三列布局。
- `frontend/src/features/export/ExportCenter.tsx:103`：导出中心使用 `.ops-card`、`.form-grid-2` 和 Table。
- `frontend/src/features/owner/TaskDashboard.tsx:23`：看板中 `.dashboard-stack`、`.dashboard-tables` 和多个 Table。
- `frontend/src/features/agent-workflow/TaskAgentWorkflowSummary.tsx:26`：Agent 工作流卡片和表格也会受影响。
- `frontend/src/styles.css:76` 到 `frontend/src/styles.css:176`：旧版 shell、owner-section、grid 和 dashboard 样式。
- `frontend/src/styles.css:551` 到 `frontend/src/styles.css:591`：旧版移动端单列规则。
- `frontend/src/styles.css:703` 到 `frontend/src/styles.css:927`：新版 Studio shell、双列 rail、panel、metric、assistant 样式。
- `frontend/src/styles.css:1180`：新版 `.designer-grid` 固定三列，覆盖旧移动端规则。
- `frontend/src/styles.css:1211` 到 `frontend/src/styles.css:1295`：新版响应式规则，但缺少 designer、owner-section、tabs、table 的关键收敛。

## 整改原则

### 1. 布局容器和卡片表面必须分离

不要让同一个节点同时承担页面 grid 主列和卡片 surface。尤其避免：

```tsx
<div className="studio-main-column owner-section">
```

推荐改为：

```tsx
<div className="studio-main-column">
```

如果担心影响范围，可以先加兼容 CSS，但最终仍建议清理组件 class：

```css
.studio-main-column.owner-section {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}
```

`.owner-section` 只应继续用于真正的独立卡片或 section，不应作为整页主列 wrapper。

### 2. 所有主布局 grid 必须允许子元素收缩

当前 `.studio-main-column` 只有 `display: grid` 和 `min-width: 0`，但没有显式列轨道。请改为：

```css
.studio-main-column {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  gap: 18px;
}

.studio-main-column > *,
.studio-panel,
.ops-card,
.owner-tabs,
.ant-tabs,
.ant-tabs-content-holder,
.ant-tabs-tabpane,
.dashboard-stack,
.template-designer {
  min-width: 0;
  max-width: 100%;
}
```

这一步是 P0。它可以阻止子元素的 min-content 宽度向上传播，把 390px 移动端撑成 647px。

### 3. 侧栏不能在中等桌面宽度挤压工作区

当前规则：

```css
.studio-with-rail {
  grid-template-columns: minmax(0, 1fr) minmax(320px, 390px);
}
```

在模板设计器这种三列工作区里，主内容至少需要约 900px 才舒服。建议将 rail 收起断点从 `980px` 提前到 `1240px` 或 `1280px`：

```css
.studio-with-rail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(300px, 26vw, 360px);
  gap: 22px;
  align-items: start;
}

@media (max-width: 1240px) {
  .studio-with-rail {
    grid-template-columns: minmax(0, 1fr);
  }

  .assistant-rail {
    position: static;
    max-height: none;
  }
}
```

如果希望普通看板页仍在 1100 到 1240px 保留侧栏，可以给任务详情主工作区加页面级 class，例如 `.owner-task-detail-shell`，只对任务详情页或模板页提前折叠 rail。

### 4. 模板设计器必须有独立响应式策略

当前 `.designer-grid` 在新版样式中固定为：

```css
.designer-grid {
  grid-template-columns: 240px minmax(0, 1fr) 280px;
}
```

这条规则位于旧移动端 media query 之后，所以会覆盖旧规则，移动端实际变成 `240px 0px 280px`。

建议将 designer 的响应式规则放在文件末尾，确保覆盖所有基础规则：

```css
.designer-grid {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(320px, 1fr) minmax(240px, 280px);
  gap: 16px;
  align-items: start;
  min-width: 0;
}

.designer-panel,
.designer-canvas,
.inspector-form {
  min-width: 0;
}

.designer-canvas {
  overflow: auto;
}

@media (max-width: 1100px) {
  .designer-grid {
    grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  }

  .designer-grid .inspector-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .designer-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .designer-toolbar,
  .canvas-header {
    flex-direction: column;
    align-items: stretch;
  }

  .inspector-grid,
  .option-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

验收要求：在 1159px 宽，`.designer-canvas` 不能低于 280px；在 390px 宽，`.designer-grid` 必须是单列。

### 5. Tabs 和 header action 需要 wrap/shrink contract

`StudioPageHeader` 中 actions 区域当前是不可收缩：

```css
.studio-page-actions,
.studio-panel-actions {
  flex: 0 0 auto;
}
```

移动端 header 被撑到 602px，与 actions、title、Tabs 的最小宽度传播有关。建议调整：

```css
.studio-page-header,
.studio-panel-header {
  min-width: 0;
}

.studio-page-actions,
.studio-panel-actions {
  min-width: 0;
  max-width: 100%;
  flex: 0 1 auto;
}

.studio-page-actions .ant-space,
.studio-panel-actions .ant-space,
.section-actions,
.drawer-actions {
  max-width: 100%;
  flex-wrap: wrap;
}

.studio-page-copy,
.studio-page-copy .ant-typography,
.studio-header-meta {
  min-width: 0;
  overflow-wrap: anywhere;
}

.owner-tabs,
.owner-tabs .ant-tabs-nav,
.owner-tabs .ant-tabs-content-holder {
  min-width: 0;
  max-width: 100%;
}

.owner-tabs .ant-tabs-nav-wrap {
  min-width: 0;
}
```

不要只给最外层加 `overflow-x: hidden`。那会隐藏问题，但 Tabs、header、designer 仍然不可用。

### 6. 表格必须明确滚动归属

目前只有 `.table-studio-panel .ant-table-wrapper { overflow: auto; }`，但很多表格不在这个 class 下：

- `frontend/src/features/owner/TaskDashboard.tsx:34`
- `frontend/src/features/owner/TaskDashboard.tsx:44`
- `frontend/src/features/export/ExportCenter.tsx:136`
- `frontend/src/features/agent-workflow/TaskAgentWorkflowSummary.tsx:36`
- `frontend/src/features/agent-workflow/TaskAgentWorkflowSummary.tsx:46`
- `frontend/src/features/agent-workflow/TaskAgentWorkflowSummary.tsx:57`
- `frontend/src/features/owner/DatasetImportPanel.tsx:301`
- `frontend/src/features/reviewer/ReviewSubmissionDetail.tsx:293`
- `frontend/src/features/labeler/LabelerMarketplace.tsx:115`
- `frontend/src/features/labeler/LabelerMarketplace.tsx:191`

建议建立统一 wrapper 或统一 Table prop：

```tsx
<Table
  scroll={{ x: "max-content" }}
  ...
/>
```

并补充 CSS：

```css
.responsive-table,
.ant-table-wrapper {
  min-width: 0;
  max-width: 100%;
}

.responsive-table {
  overflow-x: auto;
}
```

如果不想一次改所有 Table，至少先覆盖任务详情内的 Table：

```css
.studio-main-column .ant-table-wrapper {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
}
```

### 7. 表单网格和控制组改为 auto-fit

当前 `.form-grid-2` 是：

```css
.form-grid-2 {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
}
```

在窄容器内，第二列固定下限会和 radio/checkbox 组合一起制造挤压。建议：

```css
.form-grid-2,
.filter-row,
.review-filters,
.import-mapping-grid,
.import-batch-tools {
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
}

.ant-radio-group,
.ant-checkbox-wrapper,
.ant-segmented {
  max-width: 100%;
}

.ant-radio-group {
  display: flex;
  flex-wrap: wrap;
}

.ant-btn,
.ant-input,
.ant-input-affix-wrapper,
.ant-select,
.ant-picker,
.ant-segmented {
  max-width: 100%;
}
```

导出页里 `CSV / JSON / JSONL / XLSX` 在桌面中窄主列下已经出现不自然换行，修复 rail 和 form-grid 后应重新检查。

### 8. CSS 文件需要重新整理顺序

`frontend/src/styles.css` 当前存在旧样式和新 Studio 样式两段，且同名选择器重复：

- 旧 `.page-shell` 在 `styles.css:76`
- 新 `.page-shell` 在 `styles.css:703`
- 旧 `.owner-section` 在 `styles.css:102`
- 新 card surface 选择器包含 `.owner-section` 在 `styles.css:725`
- 旧移动端 `.designer-grid { grid-template-columns: 1fr; }` 在 `styles.css:551`
- 新 `.designer-grid` 固定三列在 `styles.css:1180`

建议整理为以下顺序：

1. Reset 和 token。
2. App shell。
3. 通用 layout wrappers。
4. 通用 surface/card。
5. 页面组件。
6. Ant Design 覆盖。
7. 所有 media query 放到文件末尾。

如果短期不能重排全文件，至少把所有关键响应式修复放到文件最末尾，避免再次被覆盖。

## 推荐实施顺序

### P0：先阻断全局横向溢出

1. 修改 `OwnerTaskDetailRoute`，移除主列上的 `owner-section`。
2. 给 `.studio-main-column` 加 `grid-template-columns: minmax(0, 1fr)`。
3. 给 `.studio-main-column > *`、`.studio-panel`、`.ops-card`、`.owner-tabs`、`.ant-tabs` 等加 `min-width: 0; max-width: 100%;`。
4. 将 `.studio-with-rail` 折叠断点提前到至少 `1240px`，或者给任务详情页单独提前折叠。

完成后，移动端 `390px` 的 `documentElement.scrollWidth` 应从 `647` 降到不超过 `390`。

### P1：修复模板设计器

1. 给 `.designer-grid` 添加桌面最小可用画布宽度。
2. 在 `max-width: 1100px` 下改为两列，inspector 占满下一行。
3. 在 `max-width: 760px` 下改为单列。
4. 将这组规则放到 `styles.css` 最末尾。

完成后，桌面 `1159px` 下 `.designer-canvas` 应不低于 `280px`，移动端不应出现 `240px 0px 280px`。

### P2：统一表格、表单和 actions 的响应式契约

1. 所有 Table 添加 `scroll={{ x: "max-content" }}` 或包一层 `.responsive-table`。
2. `.form-grid-2`、`.filter-row`、`.review-filters`、`.import-*` 改为 auto-fit。
3. `.section-actions`、`.studio-page-actions`、`.studio-panel-actions` 允许 wrap。
4. Radio、Segmented、Button、Input、Select 等控件加 `max-width: 100%`。

### P3：清理视觉结构

1. 避免 `.studio-panel.ops-card`、`.studio-panel.owner-section` 这类双重卡片类名继续扩散。
2. 给真正的卡片抽象统一 surface 类，例如 `.studio-surface`。
3. 页面 section 不要再卡片套卡片。主列只负责间距，卡片只负责内容块。

## 参考补丁方向

以下不是完整补丁，只是前端 agent 可直接转化为改动的方向。

### OwnerTaskDetailRoute

```diff
- <div className="studio-main-column owner-section">
+ <div className="studio-main-column">
```

如需页面级 class：

```diff
- <section className="studio-with-rail">
+ <section className="studio-with-rail owner-task-detail-layout">
```

### styles.css 末尾追加或合并

```css
.page-shell,
.owner-shell,
.studio-with-rail,
.studio-main-column,
.studio-main-column > *,
.studio-page-header,
.studio-panel,
.ops-card,
.owner-tabs,
.ant-tabs,
.ant-tabs-content-holder,
.ant-tabs-tabpane,
.dashboard-stack,
.template-designer {
  min-width: 0;
  max-width: 100%;
}

.studio-main-column {
  grid-template-columns: minmax(0, 1fr);
}

.studio-main-column.owner-section {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}

@media (max-width: 1240px) {
  .studio-with-rail {
    grid-template-columns: minmax(0, 1fr);
  }

  .assistant-rail {
    position: static;
    max-height: none;
  }
}

.designer-grid {
  grid-template-columns: minmax(200px, 240px) minmax(320px, 1fr) minmax(240px, 280px);
}

@media (max-width: 1100px) {
  .designer-grid {
    grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
  }

  .designer-grid .inspector-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .page-shell {
    width: calc(100% - 24px);
    padding: 24px 0;
  }

  .studio-page-header,
  .studio-panel {
    padding: 16px;
  }

  .designer-grid,
  .form-grid-2,
  .dashboard-tables,
  .filter-row,
  .review-filters,
  .workbench-grid,
  .review-detail-grid,
  .ai-review-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

注意：如果这段 CSS 只是追加在文件末尾，可以快速验证问题是否收敛。后续再整理重复选择器。

## 验收方式

### Browser 手动验收矩阵

至少检查这些页面和状态：

| 页面 | 视口 | 验收点 |
| --- | --- | --- |
| 任务详情-看板 | `390 x 844` | 无页面级横向滚动，metric/table 不撑出 |
| 任务详情-模板 | `390 x 844` | designer 单列，画布不塌缩 |
| 任务详情-模板 | `1159 x 862` | designer canvas 宽度不低于 280px |
| 任务详情-导出 | `390 x 844` | radio、checkbox、JSON textarea、Table 都在容器内 |
| 任务列表 | `390 x 844` | Table 只在自身容器内横向滚动 |
| 标注工作台 | `390 x 844` | 左右工作区堆叠，JSON/media 内容不撑出 |
| 审核队列/详情 | `390 x 844` | filter row、Table、review detail grid 不撑出 |

### DOM 宽度审计脚本

在 Browser 或 Playwright 中运行：

```js
(() => {
  const viewportWidth = document.documentElement.clientWidth;
  const docWidth = document.documentElement.scrollWidth;
  const bodyWidth = document.body?.scrollWidth ?? 0;
  const offenders = Array.from(document.querySelectorAll("*"))
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const horizontalScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      const viewportRightOverflow = Math.max(0, rect.right - viewportWidth);
      return {
        tag: el.tagName.toLowerCase(),
        className: String(el.className || "").slice(0, 120),
        width: Math.round(rect.width),
        right: Math.round(rect.right),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        horizontalScroll: Math.round(horizontalScroll),
        viewportRightOverflow: Math.round(viewportRightOverflow),
      };
    })
    .filter((item) => item.horizontalScroll > 1 || item.viewportRightOverflow > 1)
    .slice(0, 50);

  return {
    viewportWidth,
    docWidth,
    bodyWidth,
    globalOverflow: Math.max(docWidth, bodyWidth) - viewportWidth,
    offenders,
  };
})();
```

验收标准：

- `globalOverflow <= 1`
- 不应出现 `.studio-main-column`、`.studio-page-header`、`.ant-tabs`、`.studio-panel` 这类主结构级 offenders。
- 表格可以有局部横向滚动，但滚动必须归属于 `.responsive-table` 或 `.ant-table-wrapper`，不能传递到 `body`。
- `.designer-grid` 在移动端必须是单列；在桌面端中间画布不能小于 `280px`。

## 不要这样修

- 不要只给 `body` 或 `.page-shell` 加 `overflow-x: hidden` 来掩盖问题。
- 不要继续让 `.owner-section` 同时做页面 wrapper 和卡片 surface。
- 不要靠缩小字体或 viewport-based font-size 解决按钮/表格溢出。
- 不要给模板设计器保留固定三列到移动端。
- 不要让 Assistant rail 在中等桌面宽度继续挤压模板设计器。
- 不要只修当前截图里的元素，忽略 Table、Tabs、Space、Radio 这类会在其他页面复现的问题。

## 完成定义

当前布局整改完成后，应满足：

1. 在 `390 x 844`，任务详情任意页签都没有页面级横向滚动。
2. 在 `1159 x 862`，模板设计器画布不再塌缩，字段列表和属性面板不互相堆叠。
3. Ant Table 的横向滚动只发生在表格容器内部。
4. Header、Tabs、actions、Radio/Segmented 控件在窄宽度下自然换行。
5. `styles.css` 中关键响应式规则位于最终覆盖位置，不再被后面的同名选择器覆盖。
6. Browser 控制台无新增 error/warning。

