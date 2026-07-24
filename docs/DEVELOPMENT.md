# 开发指南

Silent Nocturne 是一个使用 Electron、Vue 3 和 TypeScript 开发的本地音乐播放器，目前处于早期开发阶段，项目结构、界面和功能仍可能频繁调整。

## 文档导航

| 主题 | 文档 | 内容 |
| --- | --- | --- |
| 提交 | [提交指南](guidelines/commit-guidelines.md) | 约定式提交的格式与要求 |

## 开发环境

项目使用 pnpm 管理依赖。

```bash
pnpm install
pnpm dev
```

常用验证命令：

```bash
pnpm typecheck
pnpm build
```

## 项目结构

- `src/main/`：Electron 主进程。
- `src/preload/`：主进程与渲染进程之间的预加载脚本和公开接口。
- `src/renderer/`：Vue 渲染进程及用户界面。
- `resources/`：应用运行时资源。
- `build/`：electron-builder 使用的打包资源。

## 当前边界

- 项目以播放用户自行管理的本地音乐文件为核心。
- 应用维护自身设置以及使用本地音乐所需的索引；除非相关功能经过明确设计，否则不应移动、重命名或修改用户的音乐文件。
- 产品功能与视觉方向仍在探索中，不应仅根据现有原型推断长期设计。
