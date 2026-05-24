# 硬件连接说明

[English](en/wiring.md)

这份文档说明当前项目支持的硬件方案、连接关系和注意事项。项目目前提供两条路线：

- **蓝牙路线（主线）**：USB 串口 + ESP32 Bluetooth Classic → Switch
- **WiFi 路线（实验性）**：WiFi TCP + ESP32-S2 USB HID → Switch 2

请根据你的板型选择对应章节阅读。

## 1. 蓝牙路线：ESP32（主线）

### 1.1 推荐板型

主线推荐：

- `ESP32-WROOM-32`
- `ESP-32S`

常见兼容板：

- `ESP32 DevKitC`
- `NodeMCU-32S`

建议：

- 选择带 `USB` 串口、可以直接刷机的版本
- 优先使用做工稳定、供电稳定的板子

当前不建议作为蓝牙主线板型：

- `ESP32-C3`
- `ESP32-S3`
- `ESP32-C6`

### 1.2 连接关系

```text
电脑
  -> USB 数据线
  -> ESP32 开发板
  -> Bluetooth Classic
  -> Nintendo Switch
```

对应到当前项目里：

- `电脑 -> ESP32`：负责刷固件、串口传命令、接收 ACK 和查看日志
- `ESP32 -> Switch`：负责模拟 `Switch Pro Controller` 输入

### 1.3 USB 串口要求

请确认：

- 你使用的是 `可传输数据` 的 USB 线，而不是纯充电线
- 开发板插到电脑后，系统里能看到对应串口

常见现象：

- `Windows` 下通常会看到 `COM3`、`COM5`、`COM7` 这类名称
- `macOS` 下常见为 `/dev/cu.SLAB_USBtoUART`、`/dev/cu.usbserial-*` 或类似名称

如果系统里始终没有串口：

- 先换一根数据线
- 再重新插拔开发板
- 再确认驱动是否已经装好

### 1.4 Switch 侧连接关系

当前主线依赖：

- `ESP32` 通过 `Bluetooth Classic` 与 `Switch` 建立手柄连接
- 在 `手柄测试` 页里完成 `连接手柄`、`重置手柄蓝牙` 和单步动作验证

首次连接时，请在 `Switch` 上进入：

`控制器 -> 更改握法/顺序`

## 2. WiFi 路线：ESP32-S2（实验性）

**⚠️ 这是实验性路线，当前仅针对 Switch 2。**

详细说明见：[硬件连接说明（S2 Mini / WiFi + USB HID）](hardware-s2-wifi.md)。

简要对照：

| 对比项 | 蓝牙路线 (ESP32) | WiFi 路线 (ESP32-S2) |
|------|------|------|
| 开发板 | ESP32-WROOM-32 / ESP-32S | Lolin S2 Mini (ESP32-S2FNR2) |
| 传输方式 | USB 串口 → 蓝牙 | WiFi TCP → USB HID 直连 |
| Switch 识别为 | Pro Controller (蓝牙) | HORIPAD S (USB 有线) |
| Switch 1 / Lite | ✅ 支持 | ❌ 不支持（无 USB HID 主机） |
| Switch 2 | ✅ 支持 | ✅ 支持 |
| 配对/断连 | 需要蓝牙配对，偶发断连 | 零配对，USB 直连不断 |
| 供电 | PC USB 供电，不涉及拔插 | PC 烧录后需拔插到 Switch USB-C |
| 桌面端连接方式 | 串口选择器 | WiFi 地址下拉（mDNS 自动发现，DHCP 默认） |
| 网络配置 | 不需要 | 刷入时填写 SSID 和密码（可选静态 IP/网关） |

## 3. 供电与线材提醒

这些问题都会直接影响连接稳定性：

- 数据线质量不稳定
- USB 接口供电不足
- 开发板个体做工差异
- 附近同时活跃的蓝牙设备过多
- 开发板长时间运行后温度偏高

如果你遇到下面这些现象，也一起排查供电和线材：

- 手柄连接容易断
- 单步测试出现串键或粘连
- 长流程越来越容易漂移

补充建议：

- 蓝牙路线：尽量保持蓝牙环境干净，减少附近同时活跃的蓝牙设备
- 如果开发板已经明显发热，先让它降温后再继续长流程测试

## 4. 第一次试用前的最短检查

**蓝牙路线（ESP32）：**

1. 板子属于 `ESP32-WROOM-32 / ESP-32S` 主线范围
2. USB 线可传输数据
3. 电脑里能看到串口
4. 可以正常刷入固件
5. `Switch` 上能完成手柄连接测试

**WiFi 路线（ESP32-S2）：**

1. 板子为 `Lolin S2 Mini`
2. USB 线可传输数据
3. 在刷入固件页选择 `Lolin S2 Mini (USB HID)` 环境和对应 Switch 型号
4. 填写 WiFi SSID 和密码（留空静态 IP 则走 DHCP 自动获取）
5. PC 上可正常烧录
6. 拔插到 Switch 2 USB-C 后 LED 最终常亮
7. 桌面端选 WiFi transport 后能通过 `friendmaker.local` 建立 TCP 连接

如果你已经卡在具体问题上，直接去看：[排障说明](troubleshooting.md)。
