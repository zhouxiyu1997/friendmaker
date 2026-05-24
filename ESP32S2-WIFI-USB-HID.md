# ESP32-S2 WiFi + USB HID 方案评估

> 版本: 0.1 | 日期: 2026-05-24 | 关联: `firmware/esp32/` `apps/desktop/`

## 一、背景

当前 Friend Maker 使用 **ESP32 (蓝牙)** 方案，通过经典蓝牙 HID 模拟 Switch Pro Controller。用户现持有 **Lolin S2 Mini (ESP32-S2FNR2)**，它没有蓝牙但有 WiFi 和 USB OTG。

本文档评估将运行架构从「蓝牙 HID + 串口」改为「USB HID + WiFi」的可行性、改动范围、风险和分步计划。

### 1.1 硬件测试基准

| 项目 | 实测结果 |
|------|---------|
| 芯片 | ESP32-S2FNR2 (revision v1.0) |
| Flash | 嵌入式 4MB (quad 模式) |
| PSRAM | 嵌入式 2MB |
| 晶振 | 40MHz |
| USB | USB-OTG (VID:303A PID:0002) |
| 自动下载 | ✅ 1200bps 握手脉冲式，无需按键 |
| 烧录工具链 | ✅ PlatformIO 6.1.19 + espressif32@7.0.1 |
| WiFi 编译 | ✅ 含 WiFi 库占用 Flash 20%, RAM 8.6% |

---

## 二、当前架构分析

### 2.1 固件层核心模块关系

```
┌─────────────────────────────────────────────────────────────┐
│ main.cpp                                                     │
│   setup() → Serial.begin + controller.begin()               │
│   loop()  → Serial.readStringUntil('\n')                    │
│          → parseSequencedFrame(line)                        │
│          → executeCommand(frame.command, controller, error) │
│          → Serial.println(ackLine)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
    ┌─────────────────┼──────────────────┐
    ▼                 ▼                   ▼
┌─────────┐   ┌──────────────┐   ┌────────────────────┐
│protocol │   │ controller   │   │ controller_transport│
│.cpp     │   │ .cpp         │   │ .h (abstract)       │
│命令解析  │   │ 高级逻辑:     │   │ begin/pressButtons/  │
│20+命令   │   │ 颜色选择/HSV  │   │ moveDirection/reset │
│         │   │ 笔画/摇杆     │   │ ...                 │
└─────────┘   └──────┬───────┘   └────────┬───────────┘
                     │                    │
                     ▼                    ▼
              controller 内部       ┌──────────────────────┐
              调用 transport        │ ClassicBtController  │
              .pressButtons()       │ Transport (1885行)    │
                                    │ 经典蓝牙 HID 实现     │
                                    │ - Bluedroid 蓝牙栈   │
                                    │ - HID report 发送     │
                                    │ - SPI 闪存模拟        │
                                    │ - 配对/重连管理       │
                                    └──────────────────────┘
```

### 2.2 设计亮点：transport 抽象

[`controller_transport.h`](file:///d:/Dev/friendmaker/firmware/esp32/src/controller_transport.h) 定义了纯虚接口：

```cpp
class ControllerTransport {
public:
  virtual void begin() = 0;
  virtual bool pressButtons(uint32_t mask, uint16_t holdMs, uint16_t settleMs) = 0;
  virtual bool moveDirection(int x, int y, uint16_t holdMs, uint16_t settleMs) = 0;
  virtual bool resetConnection(bool reconnectLastPeer = false) = 0;
  virtual bool clearStoredPeer() = 0;
  virtual void printStatus(Print &output) const = 0;
  virtual const char *name() const = 0;
};
```

这 7 个虚方法就是 transport 的完整约定。**任何实现都可接入**：

- `ClassicBtControllerTransport` — 当前唯一生产实现（经典蓝牙 HID）
- `MockControllerTransport` — 测试用，不产生实际输出
- **`UsbHidControllerTransport`** — 本文将新增的实现（USB HID）

### 2.3 无需改动的模块（直接复用）

| 模块 | 文件 | 原因 |
|------|------|------|
| **命令协议** | `protocol.cpp` | 协议格式 (`SEQ`, `OK`, `ERR`) 是传输无关的，WiFi 只需 `readLine` / `writeLine` |
| **高级控制器** | `controller.cpp` | 不碰 transport 内部，只调用 interface 方法 |
| **配置常量** | `config.h` | 时序参数/调色板常量与硬件无关 |
| **transport 接口** | `controller_transport.h` | 不需要改，新增实现即可 |
| **桌面端命令生成** | `scanline.ts` / 所有路径规划 | 命令格式不变，只改通信介质 |

---

## 三、新架构设计

### 3.1 目标架构

```
桌面应用                     ESP32-S2
┌─────────────┐   WiFi      ┌──────────────────────┐   USB    ┌────────┐
│ sender.ts   │──TCP:9876──▶│ main.cpp             │──HID───▶│ Switch │
│ (改为 TCP)  │◀──SEQ ACK──│  loop() {             │         │        │
│             │             │    client.read()      │         └────────┘
│ 命令生成/    │             │    parseSEQ(line)     │
│ 路径规划/    │             │    executeCommand()   │
│ ACK 匹配     │             │    client.write(ACK)  │
│             │             │  }                    │
└─────────────┘             │                      │
                            │ UsbHidTransport       │
                            │  (TinyUSB HID)        │
                            └──────────────────────┘
```

核心变化：
1. **通信介质**：`Serial` → `WiFiClient` (TCP server)
2. **传输层**：`ClassicBtControllerTransport` → `UsbHidControllerTransport` (TinyUSB)
3. **桌面端**：`SerialCommandSession` → `TcpCommandSession`

### 3.2 不改动的部分

```
✅ protocol.cpp      — 命令解析不变 (SEQ 帧协议不变)
✅ controller.cpp    — 高级逻辑不变 (只调 transport 虚方法)
✅ controller.h      — 接口不变
✅ config.h          — 只需修改少量常量 (BOARD_FAMILY 等)
✅ scanline.ts       — 命令生成不变
✅ paletteTiming.ts  — 时序估算不变
✅ sequencing.ts     — SEQ 帧格式化不变
✅ recovery.ts       — 恢复逻辑不变
✅ 所有配置文件       — profiles/*.json 不变
✅ 网页刷机站        — 只需适配 manifest chipFamily
```

---

## 四、逐模块详细评估

### 4.1 新建：`usb_hid_controller_transport.cpp/.h`

**规模预估**：500-800 行（对比蓝牙版的 1885 行）

**实现要点**：

| 接口方法 | USB HID 实现 |
|---------|-------------|
| `begin()` | TinyUSB 初始化、HID 设备注册、USB 连接等待 |
| `pressButtons(mask, holdMs, settleMs)` | 设置 HID report 按钮位、发送、等待 settle |
| `moveDirection(x, y, holdMs, settleMs)` | 设置 D-pad hat switch 值、发送 |
| `resetConnection(reconnect)` | USB 重新枚举或重置 HID 状态 |
| `clearStoredPeer()` | USB 无"配对"概念，空操作 |
| `printStatus()` | 打印 USB 连接状态 |
| `name()` | 返回 `"usb-hid"` |

**关键数据**：

```
HID report 长度:    48 字节 (与蓝牙版 report30_ 结构一致，可直接复用)
HID report 速率:    无需 FreeRTOS sendTask，USB IN endpoint 由 TinyUSB 轮询驱动
摇杆值:             128=中性, 0=上/左, 255=下/右 (与蓝牙版一致)
```

**TinyUSB 配置要点**：

- 需要 `TinyUSB` 和 `Adafruit TinyUSB Library`（PlatformIO 内置）
- Switch Pro Controller 的 USB HID 描述符需要精确匹配：
  - Vendor ID: `0x0F0D` (Hori — 有线的通用兼容 ID)
  - Product ID: `0x0092`
  - 接口协议: HID
- HID report descriptor 可复用蓝牙版本的描述符（114 字节的 `kHidDescriptor[]`），仅需微调

**风险点**：

```
⚠️ Nintendo Switch 对 USB HID 有严格的 VID/PID 和描述符校验
⚠️ 某些 Switch 系统版本可能限制第三方 USB 手柄
⚠️ 有线 HID 需要 Switch 底座 (Dock) 的 USB-A 口
```

### 4.2 改造：`main.cpp` — 通信层

**当前**：从 `Serial` 读写
**改为**：从 `WiFiClient` 读写（运行 TCP Server）

**改动方案**：

```cpp
// 新增 WiFi 初始化 (setup 中)
WiFi.mode(WIFI_STA);
WiFi.begin(ssid, password);  // 或 WiFi.softAP("FriendMaker", null)
WiFiServer server(9876);
WiFiClient client = server.available();  // 在 loop 中接受连接

// loop() 中的变化：
// 从 Serial.readStringUntil('\n') → client.read() 逐字节读直到 \n
// 从 Serial.println(ack) → client.println(ack)
```

**WiFi 配置方式选择**：

| 模式 | 优点 | 缺点 |
|------|------|------|
| **STA 模式 (连接路由器)** | 稳定、距离远 | 需要预配 SSID/密码 |
| **SoftAP 模式 (开发板做热点)** | 不需要外部网络 | 距离有限 (10m)、可能需要配 5GHz 屏蔽 |

**推荐方案**：STA 模式，SSID/密码通过初始串口配置（烧录后首次 setup 时用一个简单 web 配网页面写入 NVS）

**配网流程**：

```
1. 固件启动 → 检测 NVS 中是否有 WiFi 凭据
2. 有凭据 → 直接连接 WiFi → 启动 TCP Server → 串口打印 IP
3. 无凭据 → 启动 SmartConfig 或 SoftAP + Captive Portal → 用户在桌面应用中输入凭据 → 写入 NVS
```

**WiFi 断开重连**：利用 `WiFi.onEvent()` 注册 `SYSTEM_EVENT_STA_DISCONNECTED` 回调自动重连。

### 4.3 改造：`config.h`

**需要修改的常量**：

```cpp
// 当前
constexpr char BOARD_FAMILY[] = "esp32-classic";
constexpr char CONTROL_TRANSPORT[] = "classic-bt-uartswitchcon";
constexpr bool USE_MOCK_CONTROLLER = false;

// 适配后
constexpr char BOARD_FAMILY[] = "esp32-s2-usb";
constexpr char CONTROL_TRANSPORT[] = "usb-hid-wifi";
```

**删除/注释的常量**（蓝牙专属，不再需要）：

```cpp
// 不再需要：
// constexpr char BT_DEVICE_NAME[] = "Pro Controller";
// constexpr char BT_DEVICE_PROVIDER[] = "Nintendo";
// constexpr char BT_DEVICE_DESCRIPTION[] = "Gamepad";
// constexpr uint8_t BT_PAIR_PIN_LENGTH = 4;
// constexpr char BT_PAIR_PIN[] = "1234";
// constexpr uint8_t GAMEPAD_REPORT_ID = 1;
// 以及 #if defined(SWITCH_LITE/SWITCH_2) 的时序宏变体
```

**重要**：删除三个 Switch 型号变体的编译宏依赖 (`SWITCH_LITE`, `SWITCH_2`, `SWITCH_AUTO_DRAW_USE_CLASSIC_BT`)，USB HID 没有型号间时序差异。

### 4.4 改造：`platformio.ini`

**废弃**：`esp32dev_wireless_base` 及其三个继承环境

**新建**：

```ini
[env:lolin_s2_mini]
board = lolin_s2_mini
framework = arduino
monitor_speed = 115200
board_upload.flash_size = 4MB
build_flags =
  -DSWITCH_AUTO_DRAW_USE_USB_HID=1
```

### 4.5 桌面端改造

**改造范围**：通信层仅 [sender.ts](file:///d:/Dev/friendmaker/apps/desktop/src/serial/sender.ts)

**新建 `wifi/sender.ts`**（约 400 行，对比串口版的 ~1072 行大幅简化）：

| 串口版 | WiFi 版 | 变化 |
|--------|---------|------|
| RTS/DTR 复位脉冲 | 不需要 | 删除 |
| 设备探测 (`I` 命令) | 保留 (通过 TCP) | 复用 |
| ACK 超时/重试 | 保留 | 复用 |
| 端口枚举 | 改为设备发现 (mDNS 或手动输入 IP) | 简化 |
| 设备日志解析 | 保留 | 复用 |
| 拥塞检测 (蓝牙专属) | 不需要 | 删除 |

**JSON 配置新增字段**：

```json
{
  "connectType": "wifi",
  "deviceIp": "192.168.1.100",
  "tcpPort": 9876,
  "wifiSsid": "",
  "wifiPassword": ""
}
```

---

## 五、供电过渡与设备发现 (已解决 ✅)

### 5.1 问题

Lolin S2 Mini 无外置供电，唯一 USB-C 口同时承担烧录/调试和 HID 输出。从 PC USB 拔出插入 Switch Dock 的过程会短暂断电，导致 WiFi 断开。

### 5.2 方案

**Switch Dock 的 USB-A 口提供标准 5V 供电**，足以驱动 ESP32-S2。过渡流程：

```
PC USB (烧录/调试) → 拔出(断电) → 插入 Switch Dock USB → 
上电 → 固件启动 → WiFi 重连 (~3s) → TCP Server 就绪 → 桌面端重连
```

### 5.3 实现的三重保障

| 层级 | 机制 | 实测数据 |
|------|------|---------|
| **静态 IP** | `WiFi.config(192.168.1.200, 192.168.1.1, 255.255.255.0)` | 每次启动同一 IP，无需 DHCP |
| **mDNS** | `friendmaker.local` 自动解析 | 桌面端无需知道 IP 地址 |
| **掉线恢复** | `WiFi.status()` 轮询 + 自动重连 | 连接断开 → 5 秒内自动重建 |

### 5.4 `WiFi.setSleep(false)` — 防止省电断连

ESP32-S2 默认会进入 modem sleep 节电模式，可能在高负载时断开 WiFi。`setSleep(false)` 强制保持 WiFi 始终活跃。

### 5.5 桌面端连接方式

```python
# 方式 1: 通过 mDNS 域名（推荐）
socket.create_connection(("friendmaker.local", 9876))

# 方式 2: 通过静态 IP
socket.create_connection(("192.168.1.200", 9876))
```

### 5.6 硬件备选（如 Switch Dock USB 供电不足）

```
方案 A: USB OTG Y 线 → 一口给 Switch Dock (数据+供电)，一口给充电宝/USB电源
方案 B: GPIO 5V 引脚外接供电 → USB 只走数据
```

当前测试中 Dock USB 供电充足，无需备选方案。

---

## 六、风险评估

| 风险 | 等级 | 缓解措施 |
|------|:--:|---------|
| **Switch USB HID 兼容性** | 🔴 高 | 先做 USB HID 兼容性验证测试 (能否被 Switch 识别为 Pro Controller)，这是前提 |
| **WiFi 延迟抖动** | 🟡 中 | TCP 保证可靠传输，命令缓冲削峰；实际延迟 <5ms (局域网) 优于蓝牙 16ms 间隔 |
| **USB 供电** | 🟡 中 | 通过底座 USB 供电；独立供电的 OTG 线备选 |
| **WiFi 配置复杂性** | 🟢 低 | SmartConfig + NVS 持久化，配网一次永久生效 |
| **ESP32-S2 单核瓶颈** | 🟢 低 | USB HID 由 TinyUSB 硬件驱动，WiFi 由 LWIP 异步处理，不竞争 CPU |
| **Flash 空间** | 🟢 低 | 蓝牙栈约 400KB 被移除，TinyUSB 约 50KB，WiFi 已有 ~50KB，净释放 ~300KB |
| **串口调试通道消失** | 🟡 中 | USB HID 占据原生 USB 口，调试可改用 UART0 (GPIO43/44) 或保留 Telnet/WebSerial 调试 |

---

## 七、分步实施计划

### 阶段 0：可行性验证 (已完成 ✅)

```
✅ esptool chip-id — 芯片识别通过
✅ esptool flash-id — Flash 4MB 确认
✅ PlatformIO 编译 — 含 WiFi 库编译通过 (Flash 20% / RAM 8.6%)
✅ esptool write-flash — 烧录验证通过
✅ 串口输出 — 固件运行正常
✅ WiFi 连通性 — 静态 IP 192.168.1.200, mDNS friendmaker.local
✅ TCP 双向通信 — 12 种 HID 命令通过 TCP 发送/ACK 正常
```

### 阶段 1：USB HID 传输层验证 (已完成 ✅)

**目标**：验证 ESP32-S2 作为 USB HID Gamepad 被 Switch 2 识别并接受输入。

**结果**：
1. ✅ 编译通过 — 标准 HID Gamepad 描述符 (14 buttons + HAT + 4 axes, 8-byte report)
2. ✅ **Switch 2 成功识别为 HORIPAD S** (VID `0x0F0D` / PID `0x00C1`)
3. ✅ WiFi + mDNS + TCP Server 共存正常
4. ✅ 14 个按钮 + D-pad + 左右摇杆全部通过 TCP 控制验证
5. ✅ `friendmaker.local:9876` WiFi 命令通道完整
6. ⚠️ 右摇杆初始漂移（上推残留），待修复

### 阶段 1 技术突破：绕过 Arduino USB IAD 限制

**根因**：Arduino-ESP32 框架的 `USB.cpp` 硬编码 `bDeviceClass = 0xEF` (MISC/IAD 复合设备协议)。Switch 2 检测到 IAD 标记后不激活标准 HID 通道，导致 `tud_hid_ready()` 始终为 `false`。

**解决方案**：在 `main.cpp` 中**覆盖 TinyUSB 的 weak 描述符回调**，提供自定义设备/配置/字符串描述符：

| 描述符 | Arduino 默认 | 自定义 (实际使用) |
|--------|-------------|-----------------|
| `bDeviceClass` | `0xEF` (复合设备 IAD) | **`0x00`** (per-interface) |
| `idVendor` | `0x303A` (Espressif) | **`0x0F0D`** (Hori) |
| `idProduct` | `0x0002` | **`0x00C1`** (HORIPAD S) |
| 配置描述符 | 框架自动 (含 IAD) | **`TUD_CONFIG_DESCRIPTOR` + `TUD_HID_DESCRIPTOR`** (纯 HID) |
| HID 描述符 | `TUD_HID_REPORT_DESC_GAMEPAD` | **HORIPAD S 标准 Gamepad** (14按钮+HAT+4轴, 8字节) |

**额外步骤**：创建自定义 `sdkconfig.lolin_s2_mini`，禁用 CDC/MSC/MIDI/DFU/VENDOR，仅保留 HID。

**关键代码**（[main.cpp](file:///d:/Dev/friendmaker/firmware/esp32/test_s2/src/main.cpp)）：

```cpp
// 覆盖 Arduino 的 weak 回调
uint8_t const *tud_descriptor_device_cb(void) { return &kDeviceDesc; }
uint8_t const *tud_descriptor_configuration_cb(uint8_t index) { ... }
uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid) { ... }
```

**USB 识别流程**（实测）：
```
820ms   BOOT
3477ms  WiFi OK (192.168.1.200, mDNS friendmaker.local)
3495ms  USB bus active → 发送 A + Home 唤醒序列
4065ms  USB wakeup sequence sent → hid_ready=yes ✅
```

### 阶段 2：WiFi 通信层 + 完整命令协议 (已完成 ✅)

**当前状态**：
- ✅ WiFi STA + 静态 IP `192.168.1.200` + TCP Server 端口 9876
- ✅ mDNS 设备发现 (`friendmaker.local`)
- ✅ 完整命令集通过 TCP 验证：

| 类别 | 命令 | 状态 |
|------|------|:--:|
| 按钮 | A B X Y L R ZL ZR | ✅ |
| 功能 | PLUS MINUS HOME LS RS CAPTURE | ✅ |
| D-pad | `M dx dy` | ✅ |
| 左摇杆 | `STICK x y ms` | ✅ |
| 右摇杆 | `RSTICK x y ms` | ✅ |
| 长按 | `HOLD name ms` | ✅ |
| 等待 | `W ms` | ✅ |
| 诊断 | `STATUS` `LOG` | ✅ |
| 唤醒 | H (Home) / P (笔画 A) | ✅ |

- ✅ WiFi 掉线自动检测 + 重连
- ✅ 40 条环形日志缓冲，TCP 可查询
- ✅ 综合诊断输出 (`tud_mounted` / `hid_ready` / WiFi RSSI / uptime)
- 🔜 待接入完整 `protocol.cpp` 的 SEQ 帧格式
- 🔜 右摇杆连接后短暂漂移 (~128ms 复位)，待修复

### 阶段 3：配网 + 桌面端 TCP 通信

**目标**：桌面应用通过 WiFi 连接开发板，完整走通绘制流程

**步骤**：

1. 实现 WiFi 配网（SmartConfig / SoftAP Captive Portal）
2. 新建 `wifi/sender.ts` (参考 serial/sender.ts)
3. 设备发现（mDNS 广播 `friendmaker._tcp.local`）
4. 完整绘制链路端到端测试

**预计代码量**：~400 行新建 + ~200 行改动

### 阶段 4：稳定化 + 网页刷机站适配

**步骤**：

1. 固件稳定性压力测试（长时间绘制不丢命令）
2. 网页刷机站适配 ESP32-S2 (`chipFamily: "ESP32-S2"`)
3. 文档更新
4. 用户测试

---

## 八、命名建议

现有 MAC 地址 `48:f6:ee:7a:57:2a` 可作为设备的默认主机名/ID。

WiFi 命令协议 URL 设计：

```
TCP: 开发板-IP:9876
协议: 文本行 (兼容 SEQ 帧格式)
示例: SEQ a1b2c3d4 1 H        → ACK: OK a1b2c3d4 1
      SEQ a1b2c3d4 2 M 1 0    → ACK: OK a1b2c3d4 2
```

---

## 九、总结

| 维度 | 评估 |
|------|------|
| **可行性** | ✅ 完全可行，硬件已验证 |
| **核心新增** | `usb_hid_controller_transport.cpp` (~600行) + WiFi 初始化 (~150行) + 桌面端 `wifi/sender.ts` (~400行) |
| **代码库改动量** | 固件新增 ~750行 / 改动 ~150行；桌面端新增 ~400行 / 改动 ~100行 |
| **可删除的代码** | `classic_bt_controller_transport.cpp` (1885行) 不再需要链接；三个 Switch 型号变体宏全部移除 |
| **不变代码** | `protocol.cpp`, `controller.cpp`, `config.h`(大部分), `scanline.ts`, `sequencing.ts`, `recovery.ts`, 所有 profile JSON |
| **最大风险** | Switch 能否识别 USB HID 作为 Pro Controller（阶段 1 即可验证） |
| **预计总工时** | 阶段 1: 半天 | 阶段 2: 1天 | 阶段 3: 1天 | 阶段 4: 1天 |
