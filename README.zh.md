# dsh-superagent-session-fold

[![GitHub stars](https://img.shields.io/github/stars/yichao-agent/dsh-superagent-session-fold?style=flat-square)](https://github.com/yichao-agent/dsh-superagent-session-fold/stargazers)
[![GitHub watchers](https://img.shields.io/github/watchers/yichao-agent/dsh-superagent-session-fold?style=flat-square)](https://github.com/yichao-agent/dsh-superagent-session-fold/watchers)
[![License](https://img.shields.io/github/license/yichao-agent/dsh-superagent-session-fold?style=flat-square)](LICENSE)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）客户端插件：当 `dsh-superagent` 为每个 worker 任务创建一个工作区时，让侧边栏保持可用。

[English](README.md)

![侧边栏里只剩一行 superagent 收容入口](docs/screenshots/sidebar.zh.png)

## 问题

`dsh-superagent` 会为每个 worker 会话创建一个 Workspace，于是侧边栏里每个任务对应一个目录（在开发机上曾达到 89 个工作区中的 86 个）。原生浏览器虽然能用树形把子目录折叠到父节点下，但一展开就又把 80 多个任务目录列出来，而且 worker 会话始终和你的会话抢注意力。

## 这个插件做什么

- **收容**所有工作目录位于 superagent 状态目录（默认 `/.dsh/state/superagent`）下的会话：它们不再出现在侧边栏会话列表里——既不作为会话行，也不作为目录。
- 只保留**一行状态入口**，放在父工作区在注册表里的位置（有任务需要关注时自动置顶）：

  ![收容行](docs/screenshots/containment.zh.png)

  它显示 `运行中 N`、`待处理 N` 或 `N 个任务`；有 worker 在跑或等待人工处理时，这一行会浮到最上面。
- **点击这一行打开 Superagent 主会话**（当前活跃的 `orchestrator-*` 会话）。管理面板本来就在顶部导航里有自己的 `Superagent` 入口，所以侧边栏这一行用来回到主对话。
- **新会话的工作区选择器也会隐藏这些目录**：只列你自己的普通工作区，并显示隐藏了多少个 superagent 目录；`添加工作区…` 仍可用（走宿主的目录选择器）。

  ![新会话工作区选择器不再出现 worker 目录](docs/screenshots/picker.zh.png)

- **不提供原地展开**。任务目录不能再漏回侧边栏；上一版的“可展开收容”会重新摊开子树，等于没收容。
- 其他工作区照旧按目录分组展示；搜索仍能按标题找到被收容的会话；插件不修改任何会话或工作区数据。

## 安装

插件是一个 DSH bundle（Host 空壳 + Client 模块）。

### 通过插件管理界面

1. 克隆或下载本仓库到本地目录；

```bash
git clone https://github.com/yichao-agent/dsh-superagent-session-fold.git
```

2. 打开 **设置 → 插件 → 添加插件**，安装该目录；
3. 刷新 Web 页面（Client 模块在页面启动时加载，安装/更新后必须刷新）。

### 命令行

```bash
dsh plugin --profile web add /absolute/path/to/dsh-superagent-session-fold
```

然后重启或刷新 Web UI。停用插件会立即恢复原生侧边栏浏览器；磁盘上的任何数据都不会被改动。

要求：DSH `0.2.2-rc.3`（已实测）。superagent 集成是可选的；没有 `dsh-superagent` 时，收容行仍会折叠该状态目录，只是点击时回退到该目录下最近的会话。

### dsh-plugin-hub / 本地列表

hub 的自动镜像只读取 `topic:dsh-plugin` 搜索的前 ~300 条（该 topic 有数万个仓库），新仓库不一定马上能被搜到。想让它在你的 hub 里立刻出现，可以导入 [`docs/dsh-plugin-list.json`](docs/dsh-plugin-list.json)：

1. 打开 hub（**插件** → **插件商店** → **自动识别** → **＋ 添加来源**）；
2. 粘贴该文件的 raw URL，或直接上传；
3. 插件会作为来源条目出现，可从商店安装。

本地列表不等于 hub 的全局索引；提交到认证列表的事情另算。

## 配置

标准 DSH + superagent 安装无需配置。高级覆盖项放在页面的 `localStorage` 中（不读取 Host 配置）：

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `dsh-superagent-session-fold.roots.v1` | `["/.dsh/state/superagent"]` | JSON 数组，路径片段；匹配是边界感知的，`/.dsh/state/superagent` 会命中父目录及其下所有任务目录。 |
| `dsh-superagent-session-fold.showArchived.v1` | `false` | 普通分组里是否显示已归档会话。 |
| `dsh-superagent-session-fold.expanded.v1` | `{}` | 只保存普通工作区的展开状态；收容行和任务目录不会被持久化为展开。 |

旧版（`dsh-session-fold`）的视图状态会自动延续：`dsh-session-fold.*` 键会作为回退继续读取。

例如把另一个脚本目录也收容：

```js
localStorage.setItem('dsh-superagent-session-fold.roots.v1', JSON.stringify([
  '/.dsh/state/superagent',
  '/.dsh/state/other-agent',
]))
location.reload()
```

## 实现方式

Client 模块以 `priority: -10` 注册到单例槽位 `sidebar.workspaces`，遮蔽原生 `WorkspaceBrowser`。它只读取标准根 Hook（`useSessions`、`useWorkspaces`、`useSessionStatus`），通过公开 Service（`ctx.uiWorkspace.openSession`、`ctx.layout.selectPanel`）执行动作，不导入其他 Harness Client 包，也不在自己的组件之外写 DOM。

主会话按以下顺序解析：

1. superagent 父工作区里 id 以 `orchestrator-` 开头、更新时间最新的会话；
2. 该工作区第一个可见会话；
3. `GET /orchestrator/api/state`（同源，带 `x-orchestrator-request: 1`）；
4. 管理面板。

停用 bundle 后注册被移除，原生浏览器重新生效。

## 限制

- 启用期间，原生浏览器的部分能力不可用：添加/重命名/删除工作区、拖拽排序、视图选项、以及其他插件的行装饰（IM 头像、日程标记、悬浮卡）。
- 插件遮蔽的是其他包声明的单例槽位（`sidebar.workspaces` 与 `conversation.hero.workspace`）；若 DSH 升级重命名其中之一或改其标准 props，插件需要跟进。
- 新会话选择器是“替换”而非“过滤”：原生选择器的目录选择弹层不再渲染；`添加工作区…` 改走宿主的目录选择器。
- Client 模块在页面启动时加载：安装或更新后要刷新页面，运行中的页面不会热替换这个 bundle。
- 收容在侧边栏内刻意不可展开；要看 worker 会话请用 Superagent 面板或搜索。

## 开发

```
client.js            Client 模块（纯 JS，React 来自模块表）
index.js             Host 空壳（保证 bundle 有 Loader 条目）
cordis.patch.yml     bundle 补丁，插入 superagent-session-fold 条目
locale/              插件管理界面的展示元数据（中/英）
docs/                插件详情页、预览图、截图
docs/dsh-plugin-list.json  可导入 dsh-plugin-hub 的列表条目
```

语法检查与安装：

```bash
node --check client.js
dsh plugin --profile web add "$PWD"
```

槽位、Hook 与 Service 的契约以 DSH 自带文档为准；DSH 升级后可用 `Slots.listSubTree` 检查 `sidebar.workspaces`。

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=yichao-agent/dsh-superagent-session-fold&type=Date)](https://star-history.com/#yichao-agent/dsh-superagent-session-fold&Date)

图表由 [star-history.com](https://star-history.com) 提供，仓库获得 star 后会自动更新；上面两枚徽章由 shields.io 实时生成。

## 参与贡献

欢迎提 Issue / PR。如果它让你的侧边栏清爽了，点个 star 能帮到其他 DSH 用户。

## 许可证

MIT，见 [LICENSE](LICENSE)。
