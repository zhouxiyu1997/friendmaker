# 硬件连接说明（S2 Mini / WiFi + USB HID）

[English](en/hardware-s2-wifi.md)

这是一条实验性路线：桌面应用通过 **WiFi TCP** 向 ESP32-S2 发送命令，开发板通过 **USB HID** 直连 Switch 2，模拟 HORIPAD S 有线手柄输入。

## 1. 适用对象

- 持有 **Lolin S2 Mini** 开发板的用户
- 目标是 **Switch 2**（Switch 1 / Lite 不支持 USB HID 主机模式）
- 希望摆脱蓝牙配对、连接断开和延迟抖动的用户

## 2. 所需硬件

| 项目 | 详情 |
|------|------|
| 开发板 | Lolin S2 Mini (ESP32-S2FNR2, 240MHz, 4MB Flash, 2MB PSRAM) |
| 购买关键词 | `Lolin S2 Mini` / `WEMOS S2 Mini` |
| WiFi 路由 | 2.4GHz WiFi 局域网（与桌面端 PC 同一网络） |
| USB 线 | **可传输数据**的 USB-C 数据线 |
| 目标设备 | Switch 2（掌机模式，USB-C 口直连） |

## 3. 连接拓扑

```text
桌面端 PC ──WiFi──▶ 路由器 ◀──WiFi── ESP32-S2
                                         │
                                    USB-C 线
                                         │
                                         ▼
                                   Switch 2
                                 (识别为 HORIPAD S)
```

整个链路：

1. PC 通过 WiFi 向 `192.168.1.200:9876`（或 `friendmaker.local`）发送 SEQ 帧命令
2. ESP32-S2 接收后解析，通过 USB HID 向 Switch 2 发送按键/摇杆报告
3. Switch 2 将设备识别为 HORIPAD S 有线手柄，所有按钮和摇杆正常响应

## 4. 供电与拔插流程

S2 Mini 只有一个 USB-C 口，同时承担烧录/调试和 Switch 连接。操作流程：

```
① PC USB (烧录固件)
② 拔出 S2 Mini（短暂断电）
③ 插入 Switch 2 USB-C 口
④ Switch Dock USB-A 供电 → S2 Mini 上电 → 固件启动
⑤ WiFi 自动重连（约 3 秒）→ TCP Server 就绪
⑥ LED 常亮 = 全部就绪
```

### LED 状态码

| LED 状态 | 含义 |
|------|------|
| 快速闪烁 | WiFi 连接中 |
| 慢速闪烁 | 等待 USB 总线就绪 |
| **常亮** | **全部就绪（WiFi + USB HID）** |

### 供电保障

- Switch Dock 的 USB-A 口提供标准 5V 供电，足以驱动 ESP32-S2
- 固件使用了静态 IP（`192.168.1.200`），不依赖 DHCP
- 同时注册 mDNS 域名 `friendmaker.local`，桌面端无需记忆 IP
- `WiFi.setSleep(false)` 防止省电模式导致断连

## 5. 桌面端连接

1. 启动桌面应用：`npm run ui:dev`
2. **任意页面顶部将运输方式切换为 `WiFi (ESP32-S2 USB HID)`**
3. WiFi 地址选择 `friendmaker.local`（推荐）或 `192.168.1.200`
4. 前往**手柄测试**页，点击"连接手柄"
5. 连接成功后即可使用单步测试和完整绘制

## 6. 烧录固件

### 方式一：桌面端内置刷机

桌面端固件页（Firmware）选择：
- 固件版本：`Switch 2`
- 目标环境：`Lolin S2 Mini (USB HID)`

然后点击"编译并刷入固件"。

### 方式二：命令行

```bash
cd firmware/esp32/test_s2
# 先配置 wifi_credentials.h 中的 SSID 和密码
python -m platformio run -t upload --upload-port COM3
```

### 注意事项

- 烧录时需要 S2 Mini 插在 **PC USB** 上（不是在 Switch 上）
- 如果自动下载失败（`Couldn't find a board`），按住 S2 Mini 的 **BOOT 键** 再插入 PC USB，然后重新执行烧录命令
- 烧录完成后拔下，插入 Switch 2 USB-C，等待约 25 秒直到 LED 常亮

## 7. 与蓝牙路线的差异

| 对比项 | 蓝牙路线 (ESP32) | WiFi 路线 (S2 Mini) |
|------|------|------|
| 连接方式 | USB 串口 → 蓝牙 | WiFi TCP → USB HID 直连 |
| 需要蓝牙配对 | ✅ 每次都需要 | ❌ 不需要 |
| 断连风险 | 蓝牙环境干扰会断 | 仅 WiFi 断开会断（可自动重连） |
| 延迟 | 16ms 蓝牙间隔 + L2CAP 拥塞 | <5ms TCP 局域网延迟 |
| 单步耗时（65/45 时序） | ~150ms（不稳定） | **110ms（零抖动）** |
| Switch 1 / Lite | ✅ | ❌ |
| Switch 2 | ✅ | ✅ |
| 桌面端运输方式 | 串口选择器 | WiFi 运输方式 + 地址下拉 |

## 8. 第一次试用前的最短检查

1. S2 Mini 可以正常烧录（PC 上识别为 COM3）
2. `wifi_credentials.h` 中 WiFi 凭据已配置
3. 烧录后插入 Switch 2 USB-C，等待 LED 常亮
4. 桌面端选 WiFi 运输方式 → `friendmaker.local`
5. 手柄测试页点击"连接手柄" → 显示"USB HID 手柄已连接"
6. 单步 A 键测试 → Switch 2 上有 UI 反应

如果卡住，确认：
- S2 Mini 的 WiFi 和桌面端 PC 在**同一个路由器**下
- 防火墙未拦截 TCP 端口 9876
- S2 Mini LED 已常亮（非闪烁状态）