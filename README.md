# Silent Nocturne
## 0.起源
- **仓库地址**
  - https://github.com/KKxMM19192/Silent-Nocturne
- **开发团队**
  - 仓库拥有者：K[@KKxMM19192](https://github.com/KKxMM19192)
  - 协作者：Springle168[@Springle168](https://github.com/Springle168)

## 1.推荐IDE配置

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin)

## 2.项目构建

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## 3.Git提交规范
### 3.1 提交语句结构：【提交类型type】(【作用域scope】): 【提交说明msg】
  - 本模块作用域scope参数：`am`
  - 示例：docs(c): 上传01笔记
  - **注意：作用域与提交说明之间用“英文逗号+一个空格”的形式，即“: ”分隔开**

### 3.2 提交类型type参数说明
  - **feat**:添加新功能，对应版本号minor
  - **fix**:修复问题，对应版本号patch
  - **docs**:文档修改，如README、接口文档等
  - **style**:代码格式调整，如格式化、删除多余空格（不影响逻辑）
  - **refactor**:代码重构
  - **pref**:性能优化
  - **test**:测试相关
  - **build**:构建系统修改
  - **chore**:杂项修改（如修改配置、调整目录结构、非功能性修改）

### 3.3 作用域scope参数说明
  - `scope`参数用于表示作出修改的部分，比如：**模块名、分层名、子系统名、技术组件**

## 4.分支开发规范
### 4.1 分支介绍
  - 主分支`main`
    - 主分支仅用于合并已开发完成并通过测试的功能
  - 预发分支`release`
    - 从`develop`分支创建、发布完成后，合并到`main` 和 `develop` 分支
  - 开发分支`develop`
    - 将已经开发完成的模块从各开发分支集成到该分支，并通过该分支进行测试。测试完成后主分支与语法分支同步
  - 功能分支`feat`
    - 各模块各自拥有独立的功能分支进行开发。从 `develop`分支创建、功能开发完成后，合并回 `develop`分支
  - 修复分支`fix`
    - 对开发分支中出现的问题进行修复，修复完成后，合并回`develop`分支
### 4.2 分支命名
  - 【分支类型】/【功能名】, ex. feat/my-kin

### 4.3 分支目录
- `main` 主分支

## 5.语义化版本
- **版本号格式：【major】.【patch】.【minor】**，例如：1.2.3