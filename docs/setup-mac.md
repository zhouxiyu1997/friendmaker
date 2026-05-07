# macOS 平台补充

这份文档只补充 `macOS` 平台差异。
完整主流程请先看：[快速上手](user-trial-guide.md)。

## 1. 当前支持范围

- 支持：`macOS` 桌面端安装包
- 支持：仓库源码路线

当前推荐优先使用：

- `macOS` 桌面端安装包
- 如果你在中国境内使用、且不方便翻墙，额外看：[中国境内网络受限补充](troubleshooting-mainland-network.md)

## 2. macOS 下最常见的差异

### 2.1 串口设备名称

`macOS` 下常见串口名称包括：

- `/dev/cu.SLAB_USBtoUART`
- `/dev/cu.usbserial-*`
- 其它 `cu.*` 设备名

如果应用里始终没有串口：

1. 先确认数据线支持数据传输
2. 重新插拔开发板
3. 再检查驱动是否已经就绪

### 2.2 串口驱动

不同兼容板可能使用不同 USB 转串口芯片。常见情况：

- `CP210x`
- `CH340 / CH341`

如果板子已经插上，但系统里始终没有对应串口，请确认当前板子的驱动是否已经安装。

## 3. 仓库源码路线的 macOS 补充

如果你从源码运行，请先准备：

- `Node.js 20+`
- `npm 10+`
- `PlatformIO Core 6+`

常用命令：

```bash
cd /path/to/friendmaker
npm install
npm run check
npm run ui:dev
```

你也可以直接双击：

- `Start Friend Maker.command`

这个脚本会转到仓库里的 `scripts/macos-launch.sh`，自动检查依赖并启动本地界面。

如果你主要卡在：

- `Homebrew` 安装慢
- `Node.js` 下载慢
- `npm install` 很慢
- `PlatformIO` / `Python` 安装失败

优先改看：[中国境内网络受限补充](troubleshooting-mainland-network.md)。

## 4. macOS 下的手动 PlatformIO 命令

刷入固件示例：

```bash
cd /path/to/friendmaker/firmware/esp32
~/.platformio/penv/bin/pio run -e esp32dev_wireless -t upload
```

如果你的板子更接近 `NodeMCU-32S`，也可以改用：

```bash
~/.platformio/penv/bin/pio run -e nodemcu_32s_wireless -t upload
```

## 5. macOS 平台上的额外提醒

- 首次准备 `PlatformIO`、下载工具链与部分依赖时，需要稳定联网
- 源码路线下，运行期间不要关闭启动本地服务的那个终端窗口
- 如果没有串口，优先排查数据线、驱动和开发板个体差异
- 如果主要问题是网络受限或上游下载过慢，优先看：[中国境内网络受限补充](troubleshooting-mainland-network.md)

还需要继续排障时，请看：[排障说明](troubleshooting.md)。
