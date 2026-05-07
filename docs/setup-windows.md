# Windows 平台补充

这份文档只补充 `Windows x64` 平台差异。
完整主流程请先看：[快速上手](user-trial-guide.md)。

## 1. 当前支持范围

- 支持：`Windows 10 / 11 x64`
- 暂不支持：`Windows ARM64`

当前推荐优先使用：

- `Windows x64` 桌面端安装包
- 如果你在中国境内使用、且不方便翻墙，额外看：[中国境内网络受限补充](troubleshooting-mainland-network.md)

## 2. 首次安装时最常见的 Windows 差异

### 2.1 `winget`

如果你要运行仓库里的 `Install Friend Maker.cmd`，系统里最好已经有：

- `winget`
- `App Installer`

如果没有 `winget`，请先在 Microsoft Store 安装或更新 `App Installer`。

### 2.2 串口驱动

`ESP32-WROOM-32 / ESP-32S` 开发板经常通过下面这些 USB 转串口芯片暴露 `COM` 口：

1. `CP210x`
2. `CH340 / CH341`

如果应用里的 `PlatformIO` 已就绪，但仍然看不到串口，优先按这个顺序处理：

1. 在 `刷入固件` 页点击 `安装 CP210x 驱动（优先）`
2. 重新插拔开发板
3. 点击 `刷新串口`
4. 如果还是没有，再点 `安装 CH340/CH341 驱动（备选）`

## 3. 仓库源码路线的 Windows 补充

如果你从源码运行，请额外准备：

- `Node.js 20+`
- `npm 10+`
- `Python 3`
- `PlatformIO Core 6+`

当前仓库里的 `Install Friend Maker.cmd` 会自动检查并尽量安装这些依赖，但它只负责：

- 安装依赖
- 运行 `npm install`
- 运行 `npm run check`

安装完成后，你仍然需要手动启动：

```powershell
cd C:\path\to\friendmaker
npm run ui:dev
```

如果你主要卡在：

- `winget` 下载慢
- `Node.js` 下载慢
- `npm install` 很慢
- `PlatformIO` / `Python` 安装失败

优先改看：[中国境内网络受限补充](troubleshooting-mainland-network.md)。

## 4. Windows 下的手动 PlatformIO 命令

如果你需要手动确认 `PlatformIO` 是否可用，可以先执行：

```powershell
python -m pip install --user --upgrade platformio
```

如果 `pio` 不在 `PATH` 里，完整路径通常是：

```powershell
$env:USERPROFILE\.platformio\penv\Scripts\pio.exe
```

刷入固件示例：

```powershell
cd C:\path\to\friendmaker\firmware\esp32
$env:USERPROFILE\.platformio\penv\Scripts\pio.exe run -e esp32dev_wireless -t upload --upload-port COM3
```

## 5. Windows 平台上的额外提醒

- 不要安装在中文目录下
- 首次准备 `PlatformIO`、下载工具链与部分依赖时，需要稳定联网
- 如果没有 `COM` 口，优先怀疑数据线、驱动或开发板个体差异
- 如果主要问题是下载环境受限，而不是串口或驱动，优先看：[中国境内网络受限补充](troubleshooting-mainland-network.md)

还需要继续排障时，请看：[排障说明](troubleshooting.md)。
