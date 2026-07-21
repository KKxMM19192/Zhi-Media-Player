# Silent Nocturne

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

## 3.分支开发规范
### 3.1 分支介绍
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
### 3.2 分支命名
  - 【分支类型】/【功能名】, ex. feat/my-kin

### 3.3 分支目录
- `main` 主分支

## 4.语义化版本
- **版本号格式：【major】.【patch】.【minor】**，例如：1.2.3