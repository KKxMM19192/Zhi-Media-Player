# 开发指南

Silent Nocturne 是一个使用 Electron、Vue 3 和 TypeScript 开发的本地音乐播放器，目前处于早期开发阶段，项目结构、界面和功能仍可能频繁调整。

## 文档导航与定位

`README.md` 是仓库入口，只提供项目概览；本文件是开发与维护入口，记录环境要求、项目结构、验证方式和跨模块维护边界。专题文档各自维护一种长期信息，避免把产品行为、实现结构和协作规范混写在同一处。

| 主题 | 文档 | 内容 |
| --- | --- | --- |
| 产品行为 | [产品行为基线](product-behavior.md) | 用户可观察的对象关系、交互语义、播放规则、索引安全与状态恢复 |
| 核心播放架构 | [核心播放架构](architecture/core-playback.md) | 音乐树、队列状态、进程边界、媒体访问与持久化 |
| 提交 | [提交指南](guidelines/commit-guidelines.md) | 约定式提交的格式与要求 |

维护文档时遵循以下边界：

- 用户可观察的交互、对象关系或播放行为变化时，更新产品行为基线；
- 领域模型、进程责任、IPC、媒体访问或持久化实现变化时，更新核心播放架构；
- 开发环境、目录职责、验证命令或跨模块维护规则变化时，更新本开发指南；
- 提交格式或提交拆分要求变化时，更新提交指南。

## 开发环境

项目要求 Node.js 22.14 或更高版本，并使用 pnpm 10 管理依赖。推荐通过 Corepack 使用 `package.json` 中声明的 pnpm 版本。

```bash
pnpm install
pnpm dev
```

常用验证命令：

```bash
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

`pnpm lint` 和 `pnpm test` 不会修改源码；需要自动修复 ESLint 问题时显式运行 `pnpm lint:fix`。`pnpm build` 只验证非交互式生产构建，不能代替真实 Electron 窗口中的音频、选择器、外部拖入、嵌套拖拽、右键菜单和重启恢复检查。

文件扫描、索引修复和持久化测试必须使用受控临时目录，不应读取开发者的真实音乐库、home 配置或现有应用状态。

## 项目结构

- `src/shared/domain/`：不依赖 Vue 或 Electron 的音乐树、播放、队列历史、乱序和路径替换规则。
- `src/shared/contracts/`：主进程、preload 和 renderer 共用的窄业务 API 与数据类型。
- `src/main/`：Electron 主进程、文件选择与扫描、索引修复、媒体授权和状态持久化。
- `src/preload/`：将固定业务能力暴露给 sandboxed renderer，不提供通用 Node.js 或 IPC 访问。
- `src/renderer/`：Vue 界面、Pinia 协调层、真实音频元素和拖拽适配。
- `resources/`：应用运行时资源。
- `build/`：electron-builder 使用的打包资源。

## 维护边界

- 应用以播放用户自行管理的本地音乐文件为核心。
- 应用只维护自身状态和本地音乐索引；删除或修复索引不得移动、重命名、修改或删除磁盘音乐文件。
- 领域树操作和队列状态机应保持为纯逻辑，不依赖 DOM、Vue store 或 Electron。
- renderer 不可信，主进程 IPC handler 必须验证参数、授权路径和持久化状态。
- preload 应维持窄业务 API；不要暴露 `fs`、`ipcRenderer`、任意 channel 或通用本地路径读取。
- 已保存队列、历史和乱序恢复树都是独立持久化对象，跨对象复制必须生成独立节点 ID。
- 高影响队列操作应先构造并校验完整候选状态，再原子应用历史、队列和播放副作用。
- 可用性、媒体 URL、封面、时长和媒体装载版本属于运行时派生状态，不应混入持久化 schema。
- 产品行为以产品行为基线为准，不应仅根据组件当前结构或视觉细节推断长期规则。
