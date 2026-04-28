# 朋友制作器 / Friend Maker

> A macOS + ESP32 toolkit for automatically drawing pixel art in **Nintendo Switch** games, currently tailored for **《朋友收集：梦想生活》**.

朋友制作器是一个面向 `macOS + ESP32-WROOM-32 / ESP-32S` 的自动绘制工具。  
它会把图片转换成像素网格和手柄动作脚本，再通过 ESP32 模拟 Switch Pro Controller 输入，在游戏画板中自动完成绘制。

**Keywords:** Nintendo Switch auto draw, ESP32 Pro Controller emulator, pixel art drawing automation, macOS drawing studio, Bluetooth Classic HID.

![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS-black.svg)
![Hardware](https://img.shields.io/badge/hardware-ESP32--WROOM--32-orange.svg)
![Status](https://img.shields.io/badge/status-prototype-yellow.svg)

## Compatibility / 平台支持

- **Currently supported:** `macOS`
- **Not officially supported yet:** `Windows`, `Linux`

当前版本的文档、串口路径、PlatformIO 调用方式，以及试用流程都按 `macOS` 打磨。  
网页前端本身接近跨平台，但整套“刷固件 -> 串口 -> ESP32 -> Switch”链路目前只按 `macOS` 验证，不建议直接给 Windows 用户试用。

## Showcase / 演示

- [Watch demo video / 查看演示视频](docs/media/demo-video.mov)

<p>
  <a href="docs/media/demo-video.mov">
    <img src="docs/media/demo-real-device.jpeg" alt="Friend Maker real device demo on Nintendo Switch" width="760" />
  </a>
</p>

<p>
  <img src="docs/media/ui-studio-page.png" alt="Friend Maker studio page for image import, preview, brush size, color modes, and serial execution" width="32%" />
  <img src="docs/media/ui-firmware-page.png" alt="Friend Maker firmware flashing page with PlatformIO integration" width="32%" />
  <img src="docs/media/ui-controller-page.png" alt="Friend Maker controller test page with connection status and button testing" width="32%" />
</p>

## What It Does / 项目功能

- 导入 `PNG / JPG / SVG` 图片，并生成绘制预览
- 支持 `1 / 3 / 7 / 13 / 19 / 27` 六种画笔大小
- 支持 `单色绘制`、`官方色绘制`
- 支持 `250x250` 固定画布工作流
- 支持 `自动扣背景`，适合白底、浅灰底、棋盘格假透明图
- 通过串口把绘制脚本逐条发送给 ESP32，并等待 `ACK`
- 在网页里完成：
  - 脚本生成
  - 固件刷写
  - 手柄连接与按钮测试
  - 暂停 / 继续 / 中断绘制

## Architecture / 整体架构

```text
Image Input
  -> Pixelization / Quantization / Path Planning
  -> Command Script
  -> Serial ACK Sender
  -> ESP32-WROOM-32
  -> Bluetooth Classic HID
  -> Nintendo Switch
  -> In-game Canvas Drawing
```

## Current Workflow / 当前主流程

1. 在网页中导入图片
2. 选择画笔大小与绘制模式
3. 生成预览与绘制命令
4. 连接 ESP32 与 Switch
5. 一键开始绘制

当前最稳定的使用顺序：

1. `刷入固件`
2. `手柄测试`
3. `脚本生成`

## Modes / 绘制模式

### 1. Mono / 单色绘制

- 深色像素绘制
- 浅色像素留空
- 适合黑白图、轮廓图、简单像素素材

### 2. Official Palette / 官方色绘制

- 量化到游戏内置 `7 x 12` 官方色盘
- 当前支持 `8 / 16 / 32 / 64 / 84`
- 使用前需要先把右侧 `9` 个色盘槽位手动设成 **基本颜色页左上角白色**

## Requirements / 运行要求

### Hardware

- Mac
- `ESP32-WROOM-32 / ESP-32S`
- Nintendo Switch
- 可传输数据的 USB 线

### Software

- `Node.js 20+`
- `npm 10+`
- `PlatformIO Core 6+`

## Quick Start / 快速开始

### 1. Install dependencies / 安装依赖

```bash
npm install
```

### 2. Type check / 检查项目

```bash
npm run check
```

### 3. Flash firmware / 刷入固件

```bash
cd firmware/esp32
~/.platformio/penv/bin/pio run -e esp32dev_wireless -t upload
```

### 4. Start the web UI / 启动网页系统

```bash
cd /Users/xiyu/Documents/code/friendmaker
npm run ui:dev
```

Open:

```text
http://127.0.0.1:4307
```

## Before Drawing / 开始绘制前必须确认

这 3 条是试用时最容易漏掉的前提：

1. **Switch 里的画笔大小要和网页当前选择一致**
2. **开始绘制前，画笔 / 光标必须停在画布中心**
3. **如果使用官方色绘制，右侧 9 个色盘槽位要先全部手动设成基本颜色页左上角白色**

## Background Removal / 自动扣背景

如果素材是：

- 白底 PNG
- 浅灰底 PNG
- 棋盘格“假透明”图片

可以在脚本生成页的预览模块中启用 `自动扣背景`。

说明：

- 真正带透明通道的 PNG，不需要开启
- `自动扣背景` 是边缘背景识别，不是 AI 抠图
- 对角色、物品、像素素材通常够用

## Web UI Pages / 网页模块

### Script Studio / 脚本生成

- 导入图片
- 选择画笔大小
- 选择单色 / 多色 / 官方色
- 生成预览与命令
- 一键开始绘制

### Firmware Flash / 刷入固件

- 枚举串口
- 调用本机 PlatformIO
- 编译并刷入 ESP32 固件

### Controller Test / 手柄测试

- 连接手柄
- 重置蓝牙
- 单步测试按钮 / 方向键 / 摇杆
- 查看 HID 连接状态

## Repository Layout / 仓库结构

```text
apps/desktop/src
  app/               绘制计划生成
  cli/               CLI 参数解析
  config/            默认配置与官方色表
  image/             图片缩放、量化、预览、扣背景
  path/              路径生成与轻量优化
  protocol/          指令对象与序列化
  serial/            串口枚举与 ACK 发送
  web/               本地网页工作台

firmware/esp32
  src/               ESP32 固件与蓝牙控制器实现

profiles/            示例 profile
examples/            演示图片与示例命令
docs/                开发与试用文档
docs/media/          README 展示图片与视频
```

## Documentation / 文档

- [docs/user-trial-guide.md](docs/user-trial-guide.md) — 给试用者的启动与使用说明
- [docs/development-manual.md](docs/development-manual.md) — 当前开发手册与已知规则
- [docs/setup-mac.md](docs/setup-mac.md)
- [docs/arrival-checklist.md](docs/arrival-checklist.md)
- [docs/wiring.md](docs/wiring.md)

## Current Limitations / 当前限制

- 当前 UI 是轻量 Web 原型，不是 Electron 桌面应用
- Switch 连接和绘图流程仍然依赖固定场景假设
- 官方 `7x12` 色盘仍在持续校准中
- 自定义颜色自动调色还不稳定，当前更推荐 `官方色绘制`
- 实验性的 `多色绘制` 已从前端试用版中隐藏，避免对试用者造成误导
- 第一优先级仍然是 **输入稳定性**，不是绘制速度

## Development Status / 当前状态

当前仓库已经跑通的关键链路：

```text
Import image
  -> pixelize / quantize / background removal
  -> generate command script
  -> serial ACK sender
  -> ESP32 protocol parser
  -> Bluetooth Classic Switch controller emulation
  -> in-game drawing
```

## License / 许可证

This repository is licensed under **GPL-3.0-or-later**.  
See [LICENSE](LICENSE) for the full license text.

当前 `firmware/esp32` 中的 Switch 蓝牙兼容实现，已经引入并改写自 [UARTSwitchCon](https://github.com/nullstalgia/UARTSwitchCon) 的思路与代码路径，因此当前仓库采用 GPL 以保持许可证一致。

## Attribution / 作者与来源

- 来源作者：小红书作者 `惜羽拓麻镇`
- 如果你公开转发、转载或分享这个项目，建议注明作者名称 `惜羽拓麻镇`
- 建议同时附上原始发布地址
