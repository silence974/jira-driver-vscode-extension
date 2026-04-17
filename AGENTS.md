# AGENTS.md

## 项目目标

构建一个 Jira 驱动的 VS Code 扩展 MVP，提供完整的自动工作流：

1. 在 VS Code UI 中登录并连接 Jira Cloud。
2. 自动发现相关 Jira，并以列表 + 详情视图展示。
3. 对 Jira 信息完整度进行规则分 + LLM 语义分评分。
4. 当评分不足时，生成补充信息评论草稿，并在用户确认后回写 Jira。
5. 当评分足够时，生成给 AI 插件使用的 README / prompt / task metadata，使用户只需一句 prompt 即可让 AI 拉分支并开始修复。

## 当前实施计划

### 1. 扩展骨架

- 从空仓库搭建 TypeScript VS Code 扩展项目结构。
- 建立模块目录：`auth`、`jira`、`discovery`、`scoring`、`ai`、`ui`。
- 注册命令、Activity Bar、TreeView、WebviewView、配置项和 SecretStorage 访问层。

### 2. Jira 认证与 API

- 只支持 Atlassian Cloud。
- 用户通过配置填写：
  - `jiraDriver.siteUrl`
  - `jiraDriver.auth.email`
- 登录时输入 Jira API token/API key，保存在 VS Code SecretStorage。
- 统一通过 `https://<siteUrl>/rest/api/3/*` 访问 Jira REST API。

### 3. Issue 发现与展示

- 在 `Issue Explorer` TreeView 中展示筛选优先结构：
  - `Project`
  - `Type`
  - `Status`
  - `Assignee`
  - 当前筛选命中的 issue 列表
- 发现逻辑包含：
  - 项目筛选：支持多选项目并叠加 `project in (...)`
  - 项目内筛选：按 `issuetype`、`status`、`assignee`
  - 关键词检索：基于 `summary/description/comment`
  - 语义匹配：结合用户关键词和当前工作区上下文，对候选 issue 做重排

### 4. 评分与评论工作流

- 规则评分总分 100：
  - 标题清晰度 10
  - 问题描述 20
  - 复现步骤 15
  - 期望/实际行为 15
  - 验收标准 15
  - 环境/版本 10
  - 证据/链接 10
  - 范围/风险 5
- LLM 输出字段固定为：
  - `semantic_delta`
  - `missing_info`
  - `suggested_questions`
  - `confidence`
- 最终分数：`clamp(rule_score + semantic_delta, 0, 100)`
- 默认阈值：`75`
  - `< 75`：只能请求补充信息
  - `>= 75`：允许准备 AI 修复材料
- 低分 issue 的处理流程：
  - 自动生成可编辑评论草稿
  - 用户确认后再写回 Jira
  - 评论语言跟随 Jira 原文语言

### 5. AI Handoff 产物

- 当 issue 评分足够时，生成：
  - `.jira-driver/tasks/<ISSUE_KEY>/README.md`
  - `.jira-driver/tasks/<ISSUE_KEY>/prompt.md`
  - `.jira-driver/tasks/<ISSUE_KEY>/task.json`
- 将 `.jira-driver/` 写入 `.git/info/exclude`
- README 固定包含：
  - issue 摘要
  - 问题背景
  - 验收标准
  - 复现/环境
  - 关键评论
  - 附件元数据
  - 工作区上下文
  - 相关代码片段
  - 分支命名模板 `jira/<key>-<slug>`
  - 执行约束
- `prompt.md` 固定为短启动指令：
  - 先读取 README
  - 创建 `jira/<key>-<slug>` 分支
  - 开始修复

### 6. 模型能力

- 使用 OpenAI-compatible API。
- 第一优先兼容 DeepSeek API。
- 配置项包括：
  - `jiraDriver.ai.baseUrl`
  - `jiraDriver.ai.chatModel`
  - `jiraDriver.ai.embeddingModel`
  - `jiraDriver.ai.includeCodeContext`
  - `jiraDriver.ai.maxSnippetCount`
- 默认允许发给模型的数据：
  - Jira 内容
  - 工作区元数据
  - 有限代码片段
- 不发送整个仓库，也不发送二进制文件。

### 7. UI 设计

- `Issue Explorer` 使用原生 TreeView。
- `Issue Detail` 使用 WebviewView。
- Webview 展示：
  - Jira 基本信息
  - 评分拆解
  - 缺失信息
  - 评论草稿
  - README 预览
  - 操作按钮

### 8. 测试目标

- 单元测试：
  - 认证头构造
  - JQL 构造
  - 规则评分
  - LLM 响应解析
  - README / prompt 生成
- 集成测试：
  - 登录
  - issue 拉取
  - 评论发送
  - token refresh
  - 异常回退
- UI smoke 测试：
  - 列表渲染
  - 项目筛选
  - 关键词搜索
  - 低分评论草稿
  - 高分 handoff 材料生成

## 当前默认实现边界

- 只支持单工作区仓库。
- 只支持 Atlassian Cloud。
- 不直接驱动外部 AI 插件命令。
- 第一版通过生成 handoff 材料来对接 Codex / Continue / Copilot Chat 等 AI 工作流。

## 当前进度

- 已完成 TypeScript VS Code 扩展骨架、`package.json`、`tsconfig.json`、Activity Bar、TreeView、WebviewView 和命令注册。
- 已完成 Jira Cloud `siteUrl + email + API token/API key` 登录实现。
- 已完成 Jira REST API 客户端、issue 列表获取、issue 详情获取和评论发送。
- 已完成推荐 issue、我的待办、项目筛选、关键词搜索和基于 OpenAI-compatible 接口的语义重排。
- 已完成规则评分、LLM 语义评分、缺失信息汇总和补充信息评论草稿生成。
- 已完成 AI handoff 文件生成，包括 `.jira-driver/tasks/<ISSUE_KEY>/README.md`、`prompt.md`、`task.json`，并自动写入 `.git/info/exclude`。
- 已完成基础自动化测试，当前 `npm test` 通过。
- 已完成本地 F5 调试配置，仓库内已提供 `.vscode/launch.json` 和 `.vscode/tasks.json`。
- 已补充本地调试引导：F5 会直接打开当前仓库，首次点击 `Sign In` 会引导填写 `jiraDriver.siteUrl`、`jiraDriver.auth.email` 和 Jira API token。
- 已完成本地打包链路验证，可在 Node 20 下执行 `npm run package` 生成 `.vsix`。
- 已将 Jira Explorer 调整为筛选优先结构：顶部提供 `Project / Type / Status / Assignee` 四个筛选节点，默认不显示任何项目内容，选中项目后结果直接显示在筛选项下方。
- 已将 Confluence Explorer 调整为筛选优先结构：顶部提供 `Space` 多选筛选节点，默认不显示任何 Space 内容，选中 Space 后仅展示这些 Space 的页面树，搜索也只作用于已选 Space。
- 已补 Confluence Space 全量分页拉取，并基于 Confluence Space `type` 区分项目/共享 Space 与个人 Space，列表和选择器都会优先展示项目/共享 Space。
- 已完成 Confluence 页面浏览与搜索的最小实现，包括 Space 列表、页面关键词搜索、按页面层级展开的目录树浏览，以及 Confluence 页面详情预览。
- 已补 Confluence 混合内容树支持：页面树展开时改用 direct-children 接口，能够显示 `folder` 节点（如 `Tools`）并对多类型子节点分页拉取。
- 已将 Confluence Markdown 导出改为工作区内固定落盘：按 `Space / 页面目录树 / 页面名.md` 自动保存到 `.jira-driver/confluence/`，目录与文件名中的空格会替换为下划线。
- 已补导出资源本地化：Confluence 导出会自动下载正文中的图片并重写 Markdown 图片链接；若页面存在附件，会先询问是否一并下载全部附件。
- 已补 Jira handoff 图片附件落地：生成 `.jira-driver/tasks/<ISSUE_KEY>/README.md` 时会自动下载图片附件到任务目录，并在 README 中使用本地 Markdown 图片链接展示。
- 已补 Jira handoff markdown 化：README 中的问题描述和评论会优先从 HTML 转成 Markdown，并自动下载其中的远程图片到任务目录后重写为本地相对链接。
- 已完成 Confluence 页面导出为 Markdown 的最小实现，支持从详情页或命令导出本地 `.md` 文件，并尽量保留页面元信息与链接。
- 已精简主要 UI 操作入口：列表视图保留发现类操作，详情视图保留当前对象操作，移除了重复按钮入口。

## 当前阻塞与已知缺口

- 尚未补真实 Atlassian OAuth / Jira API 的端到端集成测试，当前以纯逻辑测试和服务层实现为主。
- 尚未补真实 Confluence Cloud API 的端到端验证，当前 Confluence 页面树和搜索以服务层实现与单元测试为主。
- 语义匹配和语义评分依赖外部 OpenAI-compatible API；如果未配置 API key，会自动退化为非 LLM 路径。
- 目前还没有完整的 VS Code UI 自动化测试，只有详情页渲染级 smoke test。

## 下一步最小动作

1. 在本机 VS Code 中用真实 `jiraDriver.siteUrl`、`jiraDriver.auth.email` 和 Jira API token 跑一次登录。
2. 验证 `Issue Explorer` 能拉取到真实 Jira。
3. 用真实 Confluence Space 验证 `Confluence Explorer` 能拉取 Space 和页面目录树，并测试关键词搜索。
4. 用一个低质量 issue 验证评分和评论草稿回写。
5. 用一个高质量 issue 验证 `.jira-driver/tasks/` handoff 产物和 prompt 流程。

## 恢复任务时优先检查

1. 是否已存在 `package.json`、`tsconfig.json`、`src/` 基础结构。
2. 扩展命令、视图和配置是否已经注册。
3. Jira OAuth 登录链路是否已跑通。
4. issue 发现、评分、评论、handoff 四条主链路是否都已有最小实现。
5. `.jira-driver/tasks/` 产物生成和 `.git/info/exclude` 写入是否完成。
6. 测试是否已覆盖核心行为。

## 实施顺序建议

1. 先完成扩展骨架和 UI 框架。
2. 再完成 Jira 登录与 issue 拉取。
3. 然后接评分与补充信息评论流程。
4. 最后补 AI handoff、测试和文档。

## 更新约定

- 后续每次完成关键里程碑后，更新本文件中的“当前实施计划”或补充“当前进度”小节。
- 如果任务中断，优先在本文件记录：
  - 已完成内容
  - 当前阻塞点
  - 下一步最小可执行动作
