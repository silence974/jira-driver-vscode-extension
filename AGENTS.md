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
  - `jiraDriver.oauth.clientId`
  - `jiraDriver.oauth.scopes`
- 实现 OAuth 2.0 3LO + PKCE 浏览器登录流程。
- 登录后调用 `accessible-resources` 绑定 `siteUrl` 对应的 `cloudId`。
- 统一通过 `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/*` 访问 Jira REST API。

### 3. Issue 发现与展示

- 在 `Issue Explorer` TreeView 中展示以下分组：
  - `Recommended`
  - `Assigned to Me`
  - `Project Results`
  - `Search Results`
- 发现逻辑包含：
  - 我的待办：`assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`
  - 项目筛选：叠加 `project in (...)`
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
  - OAuth 回调解析
  - `accessible-resources` 站点匹配
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
