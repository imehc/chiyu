---
title: 'Swift排错指南'
date: '2026-08-13'
draft: false
summary: ''
---

Xcode 拉取 SPM（Swift Package Manager）依赖慢、解析失败的原因与解决方案，包括手动命令行拉取、让 Xcode 走代理、常见报错排查以及构建失败处理。

{/* truncate */}

## 为什么慢

Xcode 拉取 SPM 依赖慢，主要有两个原因：

1. **Xcode 使用内置的 Git，不走系统代理** —— 即使开了 Clash / Surge 等工具的全局代理也无济于事。
2. **SPM 默认拉取整个仓库的完整 Git 历史**（而非浅克隆），仓库体积大，下载自然慢。

解决方案的核心思路是：**用终端手动拉取**（终端可走代理），或**让 Xcode 本身走代理**。

## 一、手动命令行拉取（最实用）

不用折腾 Xcode 的代理配置，直接在终端拉取即可。

### 1. 给终端挂上代理

```bash
# 根据代理工具调整端口，Clash 默认 7890
export https_proxy=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890
export all_proxy=socks5://127.0.0.1:7890
```

### 2. 在项目目录执行拉取

```bash
# 解析并下载依赖（按 Package.resolved 锁定版本）
swift package resolve

# 更新到最新版本
swift package update

# 或用 xcodebuild 拉取（推荐，会同步到 Xcode 的 SourcePackages）
xcodebuild -resolvePackageDependencies -scmProvider system
```

执行完后重新打开 Xcode，依赖应已就绪。

### 3. 注意：区分两种项目形态

`swift package` 只能在**纯 Swift Package 项目**的根目录运行（该目录有 `Package.swift`）；Xcode App 工程没有 `Package.swift`，应改用 `xcodebuild`。

| 项目类型 | 根目录特征 | 正确做法 |
|---|---|---|
| 纯 Swift Package | 有 `Package.swift` | `cd` 到根目录后执行 `swift package resolve` |
| Xcode App（用 SPM 管理依赖） | 有 `.xcodeproj` / `.xcworkspace`，无 `Package.swift` | `xcodebuild -resolvePackageDependencies -scmProvider system` |

Xcode App 工程的依赖信息保存在 `.xcodeproj/project.workspace/xcshareddata/swiftpm/Package.resolved`，没有 `Package.swift`。

## 二、让 Xcode 的 SPM 走代理（一劳永逸）

### 方案 A：切换 Xcode 使用系统 Git（推荐）

```bash
# 1. 让 Xcode 使用系统 Git（而非内置 Git）
defaults write com.apple.dt.Xcode IDEPackageSupportUseBuiltinSCM YES

# 2. 给系统 Git 配置代理（以 Clash 为例，端口 7890）
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 或只给 GitHub 单独配置
git config --global http.https://github.com.proxy http://127.0.0.1:7890
git config --global https.https://github.com.proxy http://127.0.0.1:7890
```

> 恢复默认：`defaults write com.apple.dt.Xcode IDEPackageSupportUseBuiltinSCM NO`

### 方案 B：用 Proxifier 强制 Xcode 进程走代理

若方案 A 无效，可用 Proxifier 等工具添加规则，让 `com.apple.dt.Xcode.sourcecontrol.Git` 进程走代理。

## 三、常见报错排查

### 报错 1：Could not find Package.swift

执行 `swift package resolve` 提示：

```text
error: Could not find Package.swift in this directory or any of its parent directories.
```

先确认当前目录是否有清单文件：

```bash
ls Package.swift
# No such file or directory → 不在正确的目录
```

可能原因与处理：

- **在子目录（如 `Sources/`、`Tests/`）执行** → 回到项目根目录
- **Xcode App 工程** → 见上表，改用 `xcodebuild`：

```bash
# 在 .xcodeproj / .xcworkspace 所在目录执行
xcodebuild -resolvePackageDependencies -scmProvider system

# 或显式指定 workspace 和 scheme
xcodebuild -resolvePackageDependencies \
  -workspace YourApp.xcworkspace \
  -scheme YourApp \
  -scmProvider system
```

- **项目用的是 CocoaPods / Carthage 而非 SPM** → 不该用 `swift package`，应使用对应工具

### 报错 2：Resolving Package Graph Failed

Xcode 构建时报 `Resolving Package Graph Failed`（fatalError），无法解析 `GRDB.swift` 与 `Lightbox`。

**问题原因：** 临时网络故障，导致 Xcode 无法连通 GitHub 拉取依赖。

**解决方式：** 确认网络恢复、能连通 `github.com` 后重试。

**1. 验证网络（任选其一）**

```bash
# 方式一：curl 探测，返回 200 即正常
curl -sS -m 10 -o /dev/null -w "%{http_code}\n" https://github.com
# → 200

# 方式二：git ls-remote 指定依赖仓库，能返回 commit 哈希即正常
git ls-remote https://github.com/groue/GRDB.swift HEAD
# → a1b2c3d...	HEAD
```

**2. 重新解析依赖**

```bash
xcodebuild -resolvePackageDependencies -project recoow.xcodeproj
```

**3. 重新构建**（或在 Xcode 直接 `Command + B`）

```bash
xcodebuild build \
  -project recoow.xcodeproj \
  -scheme recoow \
  -destination 'generic/platform=iOS Simulator'
```

### 报错 3：其他常见问题速查

| 问题 | 解决方法 |
|---|---|
| **GitHub 连接慢** | 修改 `/etc/hosts` 添加 GitHub 国内 CDN IP，或使用 GitHub 镜像 |
| **缓存损坏导致拉取失败** | 清理缓存后重试：`rm -rf ~/Library/Caches/org.swift.swiftpm ~/Library/Developer/Xcode/DerivedData ~/.swiftpm/xcode/` |
| **Package.resolved 损坏** | 删除项目中的 `Package.resolved`（`.xcodeproj/project.workspace/xcshareddata/swiftpm/Package.resolved`）后重新 resolve |
| **Xcode 16.x 添加包时无限加载** | 按 `Cmd + Delete` 清除 SPM 历史，或执行：`plutil -remove IDESwiftPackageAdditionAssistantRecentlyUsedPackages ~/Library/Preferences/com.apple.dt.Xcode.plist` |
| **仓库太大** | 若依赖方提供预编译 `.xcframework` 的轻量仓库（如 Lottie、Firebase 优化版），优先使用 |

## 四、快速排查流程

```bash
# 1. 终端开代理
export all_proxy=socks5://127.0.0.1:7890

# 2. 进项目目录，手动拉取
cd /path/to/your/project
xcodebuild -resolvePackageDependencies -scmProvider system

# 3. 还慢的话，清理缓存再试
rm -rf ~/Library/Caches/org.swift.swiftpm ~/Library/Developer/Xcode/DerivedData
xcodebuild -resolvePackageDependencies -disablePackageRepositoryCache
```

> 若命令行能正常拉取、但 Xcode 里仍很慢，说明问题出在 **Xcode 不走代理**，用上文「方案 A」或「方案 B」解决。
