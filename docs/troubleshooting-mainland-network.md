# 中国境内网络受限补充

这份文档只处理一种情况：

- 你在中国境内使用
- 当前网络访问上游较慢、反复失败，或者你不希望把主流程建立在“必须翻墙”上

它的目标不是把所有外网问题都魔法消失，而是把当前项目里最常见的几类下载链路拆开，分别给出更现实的替代路径。

如果你还没走过完整主流程，先看：[快速上手](user-trial-guide.md)。
如果你只是遇到串口、刷写、连接或漂移问题，先回：[排障说明](troubleshooting.md)。

## 1. 先选更稳的路线

如果你的目标只是尽快试用，不是从源码调试，建议优先顺序是：

1. 先走 `桌面端安装包`
2. 只有桌面端准备环境仍然失败，再补手动 `Python / PlatformIO`
3. 只有你明确要改源码、跑本地开发环境时，再走 `仓库源码路线`

原因很简单：

- 桌面端路线需要你手动准备的东西更少
- 源码路线除了 `PlatformIO`，还会额外碰到 `Node.js`、`npm`，`macOS` 下还可能碰到 `Homebrew`

## 2. 桌面端安装包的替代路径

### 2.1 `准备 PlatformIO` 或 app-local `Python` 下载失败

应用内自动准备环境时，当前会访问上游地址下载：

- `PlatformIO` installer
- app-local `Python` 运行时

如果这一步经常超时，建议改走下面这条更稳的兜底路径：

1. 先手动安装系统 `Python 3`
2. 再用国内 `PyPI` 镜像安装 `PlatformIO`
3. 装好以后重新打开 `Friend Maker`，回到 `刷入固件` 页重新检测

临时使用清华 TUNA `PyPI` 镜像：

```bash
python -m pip install -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple --upgrade pip
python -m pip install -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple --user --upgrade platformio
```

如果你的机器上命令是 `python3` 或 `py -3`，把上面的 `python` 替换掉即可。

如果你想把镜像设成默认：

```bash
pip config set global.index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple
```

系统 `Python 3` 下载入口可参考：

- 清华 TUNA `Python` 镜像说明：https://mirrors.tuna.tsinghua.edu.cn/help/python/
- 清华 TUNA `PyPI` 镜像说明：https://mirrors.tuna.tsinghua.edu.cn/help/pypi/

### 2.2 `PlatformIO` 装好了，但第一次编译还是卡在下载依赖

这一步是很多人最容易误判的地方。

即使你已经用国内镜像装好了 `PlatformIO` 本体，首次编译固件时，`PlatformIO` 仍然可能继续下载这些内容：

- `espressif32` 平台包
- `arduino` / `espidf` 相关框架包
- 工具链、上传工具和其它依赖

当前项目使用的就是这条链路，见仓库里的 `firmware/esp32/platformio.ini`。

如果你不方便翻墙，更适合普通用户的主兜底其实是：

1. 临时换一段 `更稳定的网络`
2. 只完成一次首次环境准备和首次编译
3. 编译环境就绪后，再回到你平时使用的网络继续

原因是这一步缺的往往不是 `PlatformIO` 本体，而是首次编译还要拉取的平台包、框架包和工具链。

只有在你确实能借到 `同系统`、已经把这套依赖准备好的缓存时，才建议再考虑复制目录这条高级兜底。

桌面端应用默认的 app-local `PlatformIO` 目录通常是：

- `macOS`：`~/.friend-maker/tooling/platformio`
- `Windows`：`%USERPROFILE%\.friend-maker\tooling\platformio`

补充说明：

- 如果你的 `Windows` 用户目录里带空格，应用可能会改用 `%PUBLIC%\FriendMaker\tooling\platformio`

如果你手头刚好有下面这些条件中的任意一种，才建议考虑复制目录：

- 你有另一台 `同系统` 机器，已经至少成功完成过一次固件编译或刷写
- 有朋友已经在 `同系统` 上把这套环境跑通，愿意把缓存目录打包给你

这时可以优先尝试复制对应的 `PlatformIO` 目录。

如果你手头只有源码路线机器，也可以尝试把它的 `~/.platformio` 或 `%USERPROFILE%\.platformio` 作为种子整体复制过来；但如果你没有现成缓存，这一步可以直接跳过，不必把它当成默认必走流程。

复制完成后，再回到应用里重新刷写。

## 3. 仓库源码路线的替代路径

源码路线至少有四类下载点：

- `Node.js`
- `npm` 依赖
- `Python / PlatformIO`
- 首次编译时的 `PlatformIO` 平台包、框架包和工具链

建议按下面顺序准备。

### 3.1 `Node.js` 下载路径

如果默认下载 `Node.js` 很慢，可以直接使用清华 TUNA 的 `nodejs-release` 镜像。

入口：

- 清华 TUNA `NodeJS Release` 镜像说明：https://mirrors.tuna.tsinghua.edu.cn/help/nodejs-release/
- 目录入口：https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/

更直接的建议是：

- `Windows` 用户优先下载对应版本的 `.msi`
- `macOS` 用户优先下载对应版本的 `.pkg`

如果你本来就在用版本管理器，也可以直接按 TUNA 文档给的方式改镜像，例如：

```bash
export NVM_NODEJS_ORG_MIRROR="https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/"
```

### 3.2 `npm install` 下载路径

如果 `npm install` 很慢或经常失败，可以先切到国内 `npm` registry：

```bash
npm config set registry https://registry.npmmirror.com
```

然后再执行：

```bash
npm install
```

如果后续你想切回官方源：

```bash
npm config delete registry
```

`npm` 对自定义 registry 的配置方式可参考官方说明：

- npm config docs: https://docs.npmjs.com/cli/v11/using-npm/config/

### 3.3 `Python / PlatformIO` 下载路径

这部分和桌面端的兜底方式一样：

1. 先装系统 `Python 3`
2. 再用国内 `PyPI` 镜像装 `PlatformIO`

```bash
python -m pip install -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple --upgrade pip
python -m pip install -i https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple --user --upgrade platformio
```

参考：

- 清华 TUNA `Python` 镜像说明：https://mirrors.tuna.tsinghua.edu.cn/help/python/
- 清华 TUNA `PyPI` 镜像说明：https://mirrors.tuna.tsinghua.edu.cn/help/pypi/

### 3.4 `macOS` 下不想碰 GitHub / Homebrew 上游时

如果你在 `macOS` 下双击 `Start Friend Maker.command`，脚本可能会继续触发：

- `Homebrew` 安装
- `brew install node`
- `pip install platformio`

在网络受限环境里，更稳的方式通常不是硬跑自动脚本，而是：

1. 手动准备好 `Node.js`
2. 手动准备好 `Python 3`
3. 手动准备好 `PlatformIO`
4. 再回到仓库里执行 `npm install` 和 `npm run ui:dev`

如果你就是想继续用 `Homebrew`，可以参考清华 TUNA 的镜像帮助：

- 清华 TUNA `Homebrew` 镜像说明：https://mirrors.tuna.tsinghua.edu.cn/help/homebrew/
- 清华 TUNA `Homebrew Bottles` 镜像说明：https://mirrors.tuna.tsinghua.edu.cn/help/homebrew-bottles/

## 4. 首次编译依赖下载失败时的最终兜底

如果你已经处理了：

- `Node.js`
- `npm`
- `Python`
- `PlatformIO`

但刷固件时仍然卡在平台包、框架包或工具链下载，那说明你剩下的不是“装不装得上 `PlatformIO`”的问题，而是“首次编译依赖仍然需要上游包源”。

这时对大多数用户来说，现实可行的兜底方式通常只有两种：

1. 换一段更稳定的网络，只完成第一次环境准备和首次编译
2. 请已经在 `同系统` 上跑通过的人，把对应缓存目录打包给你

源码路线默认的 `PlatformIO` 目录通常是：

- `macOS`：`~/.platformio`
- `Windows`：`%USERPROFILE%\.platformio`

桌面端应用默认的 app-local 目录通常是：

- `macOS`：`~/.friend-maker/tooling/platformio`
- `Windows`：`%USERPROFILE%\.friend-maker\tooling\platformio`

如果你的 `Windows` 用户目录里带空格，应用也可能改用：

- `%PUBLIC%\FriendMaker\tooling\platformio`

如果你刚好有现成缓存可复制，尽量遵守这两个原则：

1. 优先复制 `同操作系统`、`同主线环境` 跑通过的目录
2. 复制后不要混着删零散子目录，优先整体替换

## 5. 这份文档能解决到什么程度

这份文档主要覆盖：

- `Python` 下载慢
- `PlatformIO` 安装慢
- `Node.js` 下载慢
- `npm install` 慢
- 首次编译依赖需要预热；如果刚好有现成缓存，也可以复制缓存

但它仍然不能保证：

- 所有上游包都一定有等价国内镜像
- 所有网络环境都能做到全流程完全不碰上游
- 不同机器之间复制缓存后一定 100% 无差异

所以更准确的理解应该是：

- 这份文档能显著降低“必须翻墙才能开始”的概率
- 但对于首次编译依赖这一步，`临时换一段更稳的网络完成首次准备` 仍然是最现实、最适合普通用户的主兜底
