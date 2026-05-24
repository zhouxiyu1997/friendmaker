# ESP32-S2 USB HID 开发实战笔记

> **Lolin S2 Mini → Switch 2 有线手柄全过程记录**
>
> 最终设备身份：[HORIPAD S](https://github.com/radiantwf/esp32-circuitpython-switch-joystick) (vid=0x0F0D pid=0x00C1)，经 Switch 2 实测通过。

---

## 一、项目背景

### 1.1 目标

用 ESP32-S2 (Lolin S2 Mini) 替代原方案中的 ESP32+蓝牙模组，通过 **USB HID 有线连接 Switch**，同时通过 **WiFi TCP** 接收来自桌面应用的按键/摇杆命令，实现零延迟、零配对、零断连的游戏自动化。

### 1.2 硬件

| 项目 | 详情 |
|------|------|
| 开发板 | Lolin S2 Mini (ESP32-S2FNR2, 240MHz, 4MB Flash, 2MB PSRAM) |
| 目标主机 | Switch 2 (非 Dock 模式, USB-C 直连) |
| WiFi 路由 | 192.168.1.0/24 局域网 |
| 连接方式 | PC → WiFi → ESP32-S2 → USB-C → Switch 2 |

### 1.3 参考项目

[esp32-circuitpython-switch-joystick](https://github.com/radiantwf/esp32-circuitpython-switch-joystick) — 同一款开发板的 CircuitPython 实现，验证了 **Lolin S2 Mini + HORIPAD S 描述符** 在 Switch 上可用的先例。

---

## 二、调试历程（含死路与正确方向）

### 2.1 第一回合：标准 HID Gamepad (失败)

**做法**：使用 TinyUSB 内置的 `TUD_HID_REPORT_DESC_GAMEPAD` 描述符，Hori VID `0x0F0D` / PID `0x0092` (Pokken Tournament Pro Pad)。

**结果**：Switch 2 完全没有识别 (`tud_mounted=yes` 但 `tud_hid_ready=no`)。

**教训**：Switch 对 USB HID 设备有严格的 **VID/PID 白名单校验**，且 `0x0092` 可能不在 Switch 2 的授权列表中。更重要的是，Arduino 框架生成的复合设备接口（CDC+HID）会让 Switch 的 HID 驱动退避。

---

### 2.2 第二回合：Switch 私有 48 字节 Report (失败)

**做法**：复刻蓝牙版的 `kHidDescriptor[]` (114字节，含 report 0x21/0x30/0x31/0x32/0x33/0x3f 及子命令通道)，Nintendo VID `0x057E`/`0x2009`。

**结果**：编译通过，烧录成功，但 Switch 2 仍然不激活 HID 通道。

**教训**：即使描述符精确匹配原装 Pro Controller，**USB 设备描述符层面**的问题仍然会阻止握手。Arduino 框架把所有设备都标记为 **IAD 复合设备**，这在蓝牙上可行但在 USB 有线模式下是致命缺陷。

---

### 2.3 第三回合：HORIPAD S + 禁用 CDC/MSC (部分成功)

**做法**：改用参考项目的 **`0x0F0D`/`0x00C1` + HORIPAD S 标准 Gamepad 描述符** (14按钮+HAT+4轴, 8字节报告)。增加 `-DCONFIG_TINYUSB_CDC_ENABLED=0` 等编译标志尝试禁用非 HID 接口。

**结果**：`tud_mounted=yes`, `tud_connected=yes`，但 `tud_hid_ready` 仍为 `false`。

**关键发现**：`build_flags` 中的 `-DCONFIG_TINYUSB_CDC_ENABLED=0` **完全无效**。原因是 `sdkconfig.h` 中使用了无守卫的硬编码：

```c
// sdkconfig.h — 无 #ifndef 守卫！
#define CONFIG_TINYUSB_CDC_ENABLED 1
#define CONFIG_TINYUSB_MSC_ENABLED 1
// ... etc
```

这些定义在 `<command-line>` 的 `-D` 之后被 include，会覆盖编译标志。**真正的解决方案是替换整个 sdkconfig 文件**。

---

### 2.4 第四回合：自定义 sdkconfig + 对比诊断 (突破)

**做法**：
1. 复制 Arduino 框架的 sdkconfig 为 `sdkconfig.lolin_s2_mini`
2. 将 CDC/MSC/MIDI/VIDEO/DFU/VENDOR 全部改为 `# ... is not set`
3. 仅保留 `CONFIG_TINYUSB_HID_ENABLED=y`
4. 在 `platformio.ini` 中加入 `board_build.esp-idf.sdkconfig_path = sdkconfig.lolin_s2_mini`
5. 添加 `STATUS` 和 `LOG` TCP 诊断命令，输出 `tud_mounted/tud_hid_ready/tud_connected` 等底层状态

**结果**：`tud_mounted=yes`, `tud_hid_ready=no`。Switch 完成了总线枚举但并不激活 HID。

**关键日志**：
```
STATUS usb=no hid_ready=no tud_mounted=yes tud_connected=yes
```
这表明设备被 Switch 识别，但 HID 接口未被"打开"。

---

### 2.5 第五回合：切换判断标准 + 强制发送 (部分突破)

**做法**：将 LED 就绪判断从 `tud_hid_ready()` 改为 `tud_mounted()`，并在 USB 总线就绪时立即发送 A + Home 唤醒序列。

**结果**：LED 常亮（总线就绪），TCP 命令返回 `ACK HID`。Switch 上没有控制器的 UI 提示，但**按 A 键时 Switch 有明显反应**（光标闪烁/输入检测页面上按钮亮起）。

**这说明**：HID 报告实际上**已被 Switch 接收并处理**，只是系统没有显示"控制器已连接"的标准提示。`tud_hid_ready()` 为 false 可能只是 TinyUSB 的状态报告机制问题，不影响实际通信！

---

### 2.6 第六回合：最终突破 — 覆盖 TinyUSB 描述符回调

**根因定位**：深入阅读 Arduino 框架的 `USB.cpp`：

```cpp
// C:\Users\<user>\.platformio\packages\framework-arduinoespressif32\cores\esp32\USB.cpp
ESPUSB::ESPUSB(...)
    : vid(USB_VID)
    , pid(USB_PID)
    , ...
    , usb_class(TUSB_CLASS_MISC)      // ← 硬编码 0xEF
    , usb_subclass(MISC_SUBCLASS_COMMON) // ← 0x02
    , usb_protocol(MISC_PROTOCOL_IAD)   // ← 0x01
```

Arduino 框架将**每一个** USB 设备都标记为 `bDeviceClass=0xEF` (Miscellaneous / Interface Association Descriptor)。这意味着即使我们禁用了 CDC/MSC，设备描述符仍然声称自己是"复合设备"。

**Switch 2 的 USB HID 驱动检测到 IAD 标记后，不会将 HID 接口当作标准 Gamepad 对待**。它期望的是一个不带 IAD 的纯 HID 设备（`bDeviceClass=0x00`, per-interface class）。

**解决方案**：在 `main.cpp` 中覆盖 TinyUSB 的三个 weak 描述符回调：

```cpp
// 覆盖 Arduino 框架的 weak 符号
uint8_t const *tud_descriptor_device_cb(void) {
    static const tusb_desc_device_t desc = {
        .bLength = sizeof(tusb_desc_device_t),
        .bDescriptorType = TUSB_DESC_DEVICE,
        .bcdUSB = 0x0200,
        .bDeviceClass = 0x00,    // ← 关键！不是 0xEF
        .bDeviceSubClass = 0x00,
        .bDeviceProtocol = 0x00,
        .idVendor = 0x0F0D,
        .idProduct = 0x00C1,
        // ...
    };
    return (uint8_t const *)&desc;
}

uint8_t const *tud_descriptor_configuration_cb(uint8_t index) {
    static uint8_t cfg[] = {
        TUD_CONFIG_DESCRIPTOR(1, 0, 0,
            TUD_CONFIG_DESC_LEN + TUD_HID_DESC_LEN,
            TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 500),
        TUD_HID_DESCRIPTOR(0, 4, false, 8, 0x81, 64, 1),
    };
    return cfg;
}
```

**结果**：✅ Switch 2 成功识别 → `hid_ready=yes` → 全部 14 个按钮生效。

---

## 三、核心技术决策

### 3.1 设备身份选择：HORIPAD S vs Pro Controller

| 方案 | VID/PID | 描述符 | 验证结果 |
|------|---------|--------|---------|
| Nintendo Pro Controller | 0x057E/0x2009 | Switch 私有 48B report 0x30 | ❌ 未通过 |
| HORI Pokken Pad | 0x0F0D/0x0092 | 标准 Gamepad | ❌ 未通过 |
| **HORIPAD S** | **0x0F0D/0x00C1** | **标准 Gamepad (14btn+HAT+4axes)** | ✅ **通过** |

选择 HORIPAD S 而非 Pro Controller 的理由：
1. **不需要私有描述符** — 标准 HID Gamepad 描述符即可
2. **不需要子命令握手** — Pro Controller 的蓝牙版有复杂的 SPI Flash 模拟、设备信息应答等，USB 模式不需要但描述符复杂度仍在
3. **经同类硬件验证** — 参考项目在同款 Lolin S2 Mini 上通过验证
4. **8 字节报告** — 极小，IN endpoint 每帧都能发送，无需 FreeRTOS sendTask

### 3.2 描述符选择：标准 Gamepad vs Switch 私有

```
标准 Gamepad (HORIPAD S):
  Usage Page: Desktop, Usage: Gamepad
  14 buttons × 1bit = 14 bits
  HAT switch × 4bit
  4 axes × 8bit (X, Y, Z, Rz)
  报告大小: 8 字节, 无 Report ID
  无需子命令/输出报告

Switch Pro Controller:
  Usage Page: Desktop → Vendor-defined (0xFF01)
  5 个输入报告 (0x21/0x30/0x31/0x32/0x33/0x3F)
  4 个输出报告 (0x01/0x10/0x11/0x12)
  报告大小: 48~361 字节
  需要 SPI Flash 子命令应答
```

选择标准 Gamepad 使代码大幅简化，且 Switch 2 完全兼容。

### 3.3 USB 设备类 (bDeviceClass) 的重要性

| bDeviceClass | 含义 | Switch 2 行为 |
|-------------|------|--------------|
| `0xEF` (MISC, IAD) | 复合设备 | ❌ 不激活 HID 通道 |
| **`0x00`** (per-interface) | **单功能设备** | ✅ **识别为 Gamepad** |

这是整个调试过程中最关键的一个字节。

### 3.4 sdkconfig 自定义的必要性

Arduino 框架的 `sdkconfig.h` 使用无守卫 `#define`，编译标志 `-D` 无法覆盖。必须提供完整的自定义 sdkconfig 文件，并通过 `board_build.esp-idf.sdkconfig_path` 指定。

禁用非 HID 接口的主要收益：**固件从 8+ 接口的复合设备变为纯 HID 单接口设备**，USB 配置描述符更短，枚举更快，且 Switch 驱动不会因为多余的接口而退避。

### 3.5 报告格式对齐

审查发现 `sendReport()` 中 HAT 的位偏移与描述符不一致，导致按钮与方向键数据位冲突。修复后：

```
byte 0: buttons[0:7]   (B,A,Y,X,L,R,ZL,ZR)
byte 1: buttons[8:13]  (MINUS,PLUS,L3,R3,HOME,CAPTURE) + 2bit pad
byte 2: hat[0:3]       (HAT switch) + 4bit pad
byte 3: lx (X axis)
byte 4: ly (Y axis)
byte 5: rx (Z axis)    ← 这是右摇杆 X，之前偏移量错误导致始终为 0
byte 6: ry (Rz axis)   ← 这是右摇杆 Y，之前偏移到 byte 5
byte 7: pad
```

**这是右摇杆"推上"残留的直接根因**：之前的偏移错误导致右摇杆 Y 轴（Rz）始终读了错误位置的全零值，被 Switch 解释为推上。

### 3.6 供电过渡方案

| 保障层 | 机制 | 实测 |
|--------|------|:--:|
| 静态 IP | `192.168.1.200`，不依赖 DHCP | ✅ |
| mDNS | `friendmaker.local` 自动解析 | ✅ |
| 掉线恢复 | `WiFi.status()` 轮询 → 重连 | ✅ |
| 防休眠 | `WiFi.setSleep(false)` | ✅ |

拔插流程：PC USB → 拔出断电 → 插入 Switch 2 → 上电 → WiFi 重连 (~3s) → mDNS 注册 → TCP 就绪。

---

## 四、最终固件规格

### 4.1 文件结构

```
firmware/esp32/test_s2/
├── platformio.ini              # 环境配置 (0x0F0D/0x00C1 HORIPAD S)
├── sdkconfig.lolin_s2_mini     # 自定义 sdkconfig (仅 HID)
└── src/
    ├── usb_hid.h               # HID 传输层 API + 常量
    ├── usb_hid.cpp             # TinyUSB HID 实现 (描述符/回调/报告)
    ├── main.cpp                # WiFi/TCP/命令引擎/自定义 USB 描述符
    └── wifi_credentials.h      # WiFi 凭据 (.gitignore 排除)
```

### 4.2 USB 设备身份

| 字段 | 值 |
|------|-----|
| `bDeviceClass` | `0x00` |
| `idVendor` | `0x0F0D` (HORI CO.,LTD.) |
| `idProduct` | `0x00C1` (HORIPAD S) |
| 配置 | 1 配置, 1 接口 (HID), 1 IN endpoint (0x81, 64B, interval=1) |
| 报告 | 8 字节, 无 Report ID |

### 4.3 TCP 命令集

| 命令 | 格式 | 说明 |
|------|------|------|
| 按钮 | `A` `B` `X` `Y` `L` `R` `ZL` `ZR` | 按下 100ms |
| 功能键 | `PLUS` `MINUS` `HOME` `LS` `RS` `CAPTURE` | 按下 100ms |
| D-pad | `M dx dy` | 方向键逐格移动 |
| 左摇杆 | `STICK x y ms` | 推摇杆 x ms 后归中 |
| 右摇杆 | `RSTICK x y ms` | 推右摇杆 x ms 后归中 |
| 长按 | `HOLD name ms` | 保持按钮 ms |
| 等待 | `W ms` | 延迟 ms |
| 唤醒 | `H` (Home) / `P` (笔画 A) | 模拟手柄按键唤醒 |
| 诊断 | `STATUS` `LOG` | TCP 查询状态和日志 |

### 4.4 资源占用

| 资源 | 用量 |
|------|------|
| Flash | 55.2% (723 KB / 1310 KB) |
| RAM | 17.2% (56 KB / 320 KB) |

---

## 五、已知问题

### 5.1 右摇杆初始漂移（已定位根因，待烧录验证）

**症状**：连接 Switch 2 后右摇杆短暂推上。

**根因**：`sendReport()` 中 HAT 和轴数据的字节偏移在报告格式修复前与描述符不一致，导致右摇杆 Y 轴读到错误偏移量的零值。

**修复方案**：已在 `usb_hid.cpp` 中修复报告打包逻辑（见 §3.5），`init()` 也预填了归中值到 `rpt_` 缓冲区。待重新编译烧录验证。

### 5.2 sdkconfig 冗余

当前 `sdkconfig.lolin_s2_mini` 基于 Arduino 框架全量模板修改，仍包含 RainMaker/ESP Insights/Camera/Modbus/DSP 等约 60% 非必要组件。虽已禁用 TinyUSB 非 HID 接口，但 IDF 组件层面仍有冗余。可在后续迭代中精简以进一步减小固件体积。

---

## 六、踩坑总结

### 6.1 调试方法论

1. **不要相信编译标志能覆盖 sdkconfig** — 先检查 `sdkconfig.h` 是否有 `#ifndef` 守卫
2. **先建立诊断通道再调试** — TCP `STATUS`/`LOG` 命令在无串口的纯 HID 设备上无比重要
3. **LED 状态码胜过任何日志** — 用不同闪烁速率区分状态（快闪=WiFi连接中, 慢闪=等待USB, 常亮=就绪）
4. **`tud_mounted` ≠ `tud_hid_ready`** — 总线就绪不代表 HID 通道激活，但某些情况下 `tud_hid_ready` 为 false 时报告仍可送达

### 6.2 技术教训

1. **Arduino-ESP32 的 USB.cpp 硬编码 IAD 是 USB HID 设备最大的坑** — 覆盖 weak 回调是唯一解法
2. **Switch 的 USB HID 驱动比蓝牙驱动严格得多** — 描述符必须逐字节精确，没有协商回旋余地
3. **HORIPAD S 是最安全的第三方 USB 手柄身份** — 任天堂授权的 VID/PID 组合，Switch 固件内置支持
4. **标准 HID Gamepad 描述符优于 Switch 私有描述符** — USB 有线模式下不需要子命令通道和 IMU 数据

### 6.3 参考项目差异分析

参考项目使用 CircuitPython + Adafruit HID 库，其 `usb_hid.enable()` 直接在 CircuitPython 固件层注册设备，不会经过 Arduino 的 USB.cpp IAD 包装。这是为什么同一套 VID/PID/描述符在 CircuitPython 下可工作，但在 Arduino 下需要覆盖描述符回调的原因。

---

## 七、下一步行动计划

1. 🔧 **验证右摇杆修复** — 重新编译烧录，确认报告格式对齐后右摇杆不再漂移
2. 📡 **接入 protocol.cpp** — 将当前命令集替换为 Friend Maker 的 SEQ 帧协议
3. 💻 **桌面端 wifi/sender.ts** — 新建 TCP 通信模块替代串口 sender
4. 🔗 **整合为主线固件** — 将 test_s2 成果迁移到 `firmware/esp32/src/`，通过 `#if defined(SWITCH_AUTO_DRAW_USE_USB_HID)` 条件编译与原蓝牙方案共存
5. 📦 **精简 sdkconfig** — 从干净模板重新生成，移除 RainMaker/Camera 等冗余组件
