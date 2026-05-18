const LANGUAGE_STORAGE_KEY = "friend-maker.language";
const SOURCE_LANGUAGE = "zh-CN";
const DEFAULT_LANGUAGE = SOURCE_LANGUAGE;
const ENGLISH_LANGUAGE = "en";
const TEMPLATE_LABELS_EN = {
  "无模板（正方形）": "No template (square)",
  "无袖背心": "Sleeveless top",
  "高礼帽": "Top hat",
  "短袖上衣（短摆）": "Short-sleeve top (short hem)",
  "短袖上衣（直摆）": "Short-sleeve top (straight hem)",
  "短袖连衣短裙": "Short-sleeve mini dress",
  "圆顶针织帽": "Round knit cap",
  "短袖上衣（宽摆）": "Short-sleeve top (wide hem)",
  "短袖上衣（收摆）": "Short-sleeve top (tapered hem)",
  "A 字短裙": "A-line skirt",
  "直摆短裙": "Straight mini skirt",
  "长袖长袍": "Long-sleeve robe",
  "泡袖连衣裙": "Puff-sleeve dress",
  "宽摆半裙": "Wide skirt",
  "短裙下摆": "Mini-skirt hem",
  "长裤": "Long pants",
  "帽檐圆帽": "Brimmed round hat",
  "直筒裙摆": "Straight skirt hem",
  "竖向长幅 A": "Vertical banner A",
  "横向长幅 A": "Horizontal banner A",
  "横向长幅 B": "Horizontal banner B",
  "竖向长幅 B": "Vertical banner B",
  "三尖窗格": "Triple-point window",
  "四尖连带": "Four-point ribbon",
  "双尖圆章": "Double-point medallion",
  "顶部圆章": "Top medallion",
  "T 字画布": "T-shaped canvas",
  "悬浮圆章": "Floating medallion",
  "半圆碗形": "Semicircle bowl",
  "折角徽章": "Folded-corner badge",
  "连续菱格": "Diamond repeat",
  "同心圆盘": "Concentric disk",
  "横向双圆": "Horizontal double circle",
  "纵向双圆": "Vertical double circle",
};

const TEMPLATE_CATEGORY_LABELS_EN = {
  "上衣 / 长衣": "Tops / long clothes",
  "裙装 / 衣摆": "Dresses / hems",
  "下装": "Bottoms",
  "帽子": "Hats",
  "几何 / 特殊": "Geometry / special",
  "默认": "Default",
};

const TRANSLATIONS_EN = {
  ...TEMPLATE_LABELS_EN,
  ...TEMPLATE_CATEGORY_LABELS_EN,
  "朋友制作器 / Friend Maker | Tomodachi Life 自动绘制工具": "Friend Maker | Tomodachi Life Auto Drawing Tool",
  "朋友制作器（Friend Maker）是一个面向 Nintendo Switch《朋友收集：梦想生活》/ Tomodachi Life 的自动绘制工作台，支持 ESP32 固件刷写、手柄测试、输入时序调试，以及图片到绘制脚本的闭环执行。": "Friend Maker is an auto-drawing workstation for Nintendo Switch Tomodachi Life. It supports ESP32 firmware flashing, controller testing, input timing tuning, and a full image-to-drawing-script workflow.",
  "Friend Maker, 朋友制作器, Tomodachi Life, 朋友收集梦想生活, Nintendo Switch auto draw, ESP32 Pro Controller emulator, pixel art drawing automation": "Friend Maker, Tomodachi Life, Nintendo Switch auto draw, ESP32 Pro Controller emulator, pixel art drawing automation",
  "脚本生成": "Script Builder",
  "导入图片，检查预览，然后开始绘制。": "Import an image, review the preview, then start drawing.",
  "刷入固件": "Flash Firmware",
  "选择型号、环境和串口后刷入 ESP32 固件。": "Choose the model, environment, and serial port, then flash ESP32 firmware.",
  "手柄测试": "Controller Test",
  "连接手柄并验证方向、按键和蓝牙状态。": "Connect the controller and verify directions, buttons, and Bluetooth status.",
  "调试测速": "Timing Lab",
  "先调稳定等待，再用短测和长测确认参数。": "Tune the stability delay first, then verify with short and long tests.",
  "自动绘制工作台": "Auto Drawing Workbench",
  "导图、预览、执行": "Import, preview, execute",
  "编译、烧录、排错": "Build, flash, troubleshoot",
  "连接、状态、单步动作": "Connection, status, single-step actions",
  "Timing、试按、长测": "Timing, test taps, long tests",
  "串口未选择": "No serial port selected",
  "串口：未选择": "Serial: none selected",
  "手柄待连接": "Controller pending",
  "手柄：待连接": "Controller: pending",
  "绘制：未开始": "Drawing: not started",
  "功能导航": "Navigation",
  "硬件状态": "Hardware status",
  "工作区": "Workspace",
  "状态栏": "Status bar",
  "应用标题栏": "Application title bar",
  "窗口控制": "Window controls",
  "最小化": "Minimize",
  "最大化/还原": "Maximize/restore",
  "最大化或还原": "Maximize or restore",
  "关闭": "Close",
  "输入": "Input",
  "导入图片，设置颜色、模板和位置。": "Import an image and set colors, template, and placement.",
  "导入图片": "Import image",
  "支持 PNG / JPG / WEBP / SVG": "PNG / JPG / WEBP / SVG supported",
  "需要测试": "Test required",
  "需要先进行手柄测试": "Run the controller test first",
  "方块像素笔刷": "square pixel brush",
  "圆形像素笔刷": "round pixel brush",
  "开始绘制会自动切笔刷，期间不要手动操作。": "Drawing will auto-switch the brush; do not operate manually during drawing.",
  "自动扣背景关闭。": "Auto-remove background is off.",
  "自动扣背景已开启。": "Auto-remove background is on.",
  "当前还没有确认开发板已经连上 Switch。开始绘制前，请先到“手柄测试”页完成连接。": "The board has not been confirmed as connected to the Switch yet. Before drawing, finish the connection on the Controller Test page.",
  "前往手柄测试": "Open Controller Test",
  "绘制模式": "Drawing mode",
  "256x256 坐标画布，从中心起步。正式绘制会自动切到所选像素画笔。": "256x256 coordinate canvas, starting from the center. Live drawing automatically switches to the selected pixel brush.",
  "深色像素会绘制，浅色像素会保留为空白背景，不需要切换调色板。": "Dark pixels are drawn and light pixels remain as blank background. No palette switching is needed.",
  "画布尺寸（固定）": "Canvas size (fixed)",
  "像素画笔": "Pixel brush",
  "开始或恢复绘制时会自动进入笔刷页并切换预设。": "When starting or resuming, the app opens the brush page and switches presets automatically.",
  "方块像素": "Square pixels",
  "当前开放": "Available",
  "圆形像素": "Round pixels",
  "预留中，暂不可选": "Reserved, not selectable yet",
  "方块像素画笔": "Square pixel brush",
  "圆形像素画笔（预留）": "Round pixel brush (reserved)",
  "画笔大小": "Brush size",
  "笔刷形状": "Brush shape",
  "方形笔刷": "Square brush",
  "圆形笔刷": "Round brush",
  "单色绘制": "Monochrome",
  "自定义多色": "Custom multicolor",
  "官方色绘制": "Official colors",
  "色阶数量": "Color count",
  "图纸模板": "Drawing template",
  "模板外区域会被裁掉；不选则保持正方形画布。": "Areas outside the template are cropped. Leave unselected to keep a square canvas.",
  "模板分类": "Template category",
  "全部模板": "All templates",
  "当前模板": "Current template",
  "当前图纸模板预览": "Current template preview",
  "裁剪会在生成预览和命令时生效。": "Cropping is applied when generating the preview and commands.",
  "单色阈值": "Monochrome threshold",
  "当前模式下不使用阈值": "Threshold is not used in this mode",
  "导入缩放": "Import scale",
  "横向位置": "Horizontal position",
  "纵向位置": "Vertical position",
  "回中优化（实验）": "Recenter optimization (experimental)",
  "只在预计更快时插入回中动作；默认关闭，适合真实设备对比测试。": "Inserts recenter actions only when estimated faster; off by default for real-device comparisons.",
  "回中优化关闭。": "Recenter optimization is off.",
  "回中优化已开启，只在预计更快时插入回中动作。": "Recenter optimization is on and only inserts recenter actions when estimated faster.",
  "执行": "Execute",
  "选择串口后发送脚本。开始前确认 Switch 停在默认画布。": "Select a serial port to send the script. Before starting, make sure the Switch is on the default canvas.",
  "串口设备": "Serial device",
  "未检测到串口": "No serial ports detected",
  "刷新串口": "Refresh ports",
  "请选择串口设备，连接手柄后即可直接开始绘制。": "Select a serial device. After the controller is connected, you can start drawing directly.",
  "执行期间不要触碰手柄或页面。": "Do not touch the controller or page during execution.",
  "一键开始绘制": "Start Drawing",
  "仅生成命令": "Generate Commands Only",
  "执行现有脚本": "Run Existing Script",
  "暂停绘制": "Pause Drawing",
  "继续绘制": "Resume Drawing",
  "中断并保存恢复点": "Stop and Save Resume Point",
  "暂停和中断会在当前命令完成后生效。": "Pause and stop take effect after the current command finishes.",
  "当前未开始绘制。": "Drawing has not started.",
  "应急操作": "Emergency action",
  "仅在中断长时间无响应时使用。": "Use only if stopping stays unresponsive for a long time.",
  "强制清除卡住状态": "Force Clear Stuck State",
  "恢复任务": "Resume tasks",
  "恢复前先在 Switch 里保存，并重新进入绘画页。": "Before resuming, save on the Switch and re-enter the drawing page.",
  "当前没有可恢复任务。": "No resumable tasks.",
  "调整输入和预览宽度": "Resize input and preview width",
  "调整预览和脚本宽度": "Resize preview and script width",
  "调整脚本和日志高度": "Resize script and log height",
  "调整刷入操作和刷入结果宽度": "Resize flashing controls and result width",
  "调整刷入区域和日志高度": "Resize flashing area and log height",
  "调整手柄测试和连接状态宽度": "Resize controller test and connection status width",
  "调整手柄测试区域和日志高度": "Resize controller test area and log height",
  "调整概览和调试区域高度": "Resize overview and tuning area height",
  "调整 timing 控件和测试结果宽度": "Resize timing controls and test result width",
  "调整调试区域和日志高度": "Resize tuning area and log height",
  "预览": "Preview",
  "像素预览、模板裁剪和统计。": "Pixel preview, template crop, and stats.",
  "自动扣背景": "Auto-remove background",
  "适合白底、浅灰底、棋盘格假透明图。真正带透明通道的 PNG 不需要开启。": "Best for white, light-gray, or checkerboard fake-transparent images. PNGs with real alpha do not need this.",
  "辅助线": "Guides",
  "只用于预览里辅助对齐，不影响最终生成。": "Used only for preview alignment. It does not affect generation.",
  "生成预览": "Generated preview",
  "生成后这里会显示像素预览。": "The pixel preview appears here after generation.",
  "画布范围": "Canvas range",
  "图片尺寸": "Image size",
  "图片位置": "Image position",
  "颜色": "Colors",
  "像素": "Pixels",
  "命令数": "Commands",
  "预计耗时": "Estimated time",
  "当前预览用色": "Current preview colors",
  "显示本次预览实际使用的颜色。": "Shows the colors actually used by this preview.",
  "脚本": "Script",
  "生成后可直接发送或导出。": "After generation, send or export it directly.",
  "生成后会在这里显示命令脚本": "Generated command script appears here",
  "复制脚本": "Copy Script",
  "下载脚本": "Download Script",
  "执行日志": "Execution Log",
  "串口返回和执行状态。": "Serial responses and execution status.",
  "复制日志": "Copy Log",
  "清空日志": "Clear Log",
  "等待生成命令...": "Waiting for generated commands...",
  "通过本机 PlatformIO 编译并刷入 ESP32。": "Build and flash ESP32 with local PlatformIO.",
  "固件版本": "Firmware version",
  "目标环境": "Target environment",
  "正在检测 PlatformIO...": "Checking PlatformIO...",
  "选择目标开发板后，这里会显示对应说明。": "After selecting the target board, its notes appear here.",
  "Windows 串口驱动": "Windows serial drivers",
  "PlatformIO 已就绪": "PlatformIO ready",
  "PlatformIO 已就绪但仍没有串口设备时，请先确认数据线可传输数据并重新插拔 ESP32。": "If PlatformIO is ready but no serial device appears, first confirm the USB cable supports data and reconnect the ESP32.",
  "安装 CP210x 驱动（优先）": "Install CP210x driver (preferred)",
  "安装 CH340/CH341 驱动（备选）": "Install CH340/CH341 driver (fallback)",
  "准备 PlatformIO": "Prepare PlatformIO",
  "编译并刷入固件": "Build and Flash Firmware",
  "停止刷入": "Stop Flashing",
  "刷入结果": "Flash Result",
  "最近一次刷写状态。": "Status of the most recent flash.",
  "待执行": "Pending",
  "点击“编译并刷入固件”后，这里会显示成功或失败。": "After clicking Build and Flash Firmware, success or failure appears here.",
  "PlatformIO 输出。": "PlatformIO output.",
  "刷写日志": "Flash Log",
  "等待刷入固件": "Waiting to flash firmware",
  "等待刷入固件...": "Waiting to flash firmware...",
  "用单步命令验证真实设备动作。": "Validate real device actions with single-step commands.",
  "摇杆步数": "Stick steps",
  "连接手柄": "Connect Controller",
  "重置手柄蓝牙": "Reset Controller Bluetooth",
  "清除已保存主机": "Clear Saved Host",
  "断开串口": "Disconnect Serial",
  "串口会在首次发送测试命令时自动连接。": "The serial port connects automatically when the first test command is sent.",
  "动作测试会先套用“调试测速”页里的当前 timing。": "Action tests apply the current timing from the Timing Lab first.",
  "摇杆移动": "Stick movement",
  "方向键": "D-pad",
  "左摇杆": "Left stick",
  "十字键": "D-pad",
  "上": "Up",
  "下": "Down",
  "左": "Left",
  "右": "Right",
  "按钮测试": "Button test",
  "L+R 配对": "L+R Pair",
  "回中诊断": "Recenter diagnostics",
  "只推左摇杆": "Stick only",
  "推杆后等待": "Stick then wait",
  "完整回中宏": "Full recenter macro",
  "自定义测试命令": "Custom test commands",
  "例如：&#10;I&#10;BTN HOME&#10;BTN DUP&#10;M 1 0": "Example:\nI\nBTN HOME\nBTN DUP\nM 1 0",
  "发送自定义命令": "Send Custom Commands",
  "连接状态": "Connection Status",
  "蓝牙发现、认证、连接和发送状态。": "Bluetooth discovery, authentication, connection, and send status.",
  "待连接": "Pending connection",
  "点击“连接手柄”后，这里会显示当前蓝牙发现、认证、连接和报告发送状态。": "After clicking Connect Controller, current Bluetooth discovery, authentication, connection, and report-send status appears here.",
  "可发现": "Discoverable",
  "已认证": "Authenticated",
  "已连接": "Connected",
  "已配对": "Paired",
  "可发送": "Ready to send",
  "传输层": "Transport",
  "配置": "Profile",
  "当前还没有拿到可用的蓝牙连接状态。": "No usable Bluetooth connection status has been received yet.",
  "已就绪": "Ready",
  "手柄已连接": "Controller connected",
  "开发板已经完成 HID 连接和配对；固件报告通道字段可能滞后，但当前状态已经可以发送按钮和摇杆报告。": "The board has completed the HID connection and pairing. Firmware report-channel fields may lag, but it can send button and stick reports now.",
  "开发板已经完成连接并可发送按钮和摇杆报告，可以继续做手柄测试。": "The board is connected and can send button and stick reports. Continue with controller tests.",
  "不稳定": "Unstable",
  "连接容易断开": "Connection may drop",
  "连接已建立": "Connection established",
  "HID 连接已经建立，正在等待配对完成或报告通道完全就绪。": "HID connection is established. Waiting for pairing to finish or the report channel to become fully ready.",
  "认证已通过": "Authentication complete",
  "Switch 已完成蓝牙认证，正在尝试把这块板子接成可用手柄。": "The Switch has completed Bluetooth authentication. The board is trying to become a usable controller.",
  "广播中": "Advertising",
  "等待 Switch 发现": "Waiting for Switch discovery",
  "开发板正在广播。请在 Switch 的“更改握法/顺序”页面停留等待。": "The board is advertising. Stay on the Switch Change Grip/Order page and wait.",
  "异常": "Error",
  "初始化异常": "Initialization error",
  "未发现": "Not discoverable",
  "已通过": "Passed",
  "未通过": "Not passed",
  "未连接": "Disconnected",
  "未配对": "Not paired",
  "最近主机": "Last host",
  "初始化步骤": "Init step",
  "初始化结果": "Init result",
  "最近更新": "Last updated",
  "测试日志": "Test Log",
  "按钮测试和自定义命令返回。": "Button test and custom command responses.",
  "等待开始测试...": "Waiting to start test...",
  "先看这个": "Start Here",
  "按顺序调参，先稳定再提速。": "Tune in order: stability first, speed later.",
  "推荐流程": "Recommended flow",
  "先稳，再快，最后复现": "Stabilize, speed up, then reproduce",
  "当前会同时用于手柄测试、测速和正式绘制：稳定等待 45ms · 按键保持 65ms。": "Current values apply to controller tests, timing tests, and live drawing: stability delay 45 ms · button hold 65 ms.",
  "先试 1 格和 A": "First test 1 step and A",
  "如果 1 格都不稳，先别跑长测，先把参数调慢一点。": "If even 1 step is unstable, do not run long tests yet. Slow the timing down first.",
  "先调稳定，再调力度": "Tune stability, then hold strength",
  "优先调“稳定等待”，只有确认方向稳了，再微调“按键保持”。": "Tune Stability Delay first. Fine-tune Button Hold only after directions are stable.",
  "从短测跑到长测": "Move from short to long tests",
  "先跑快速检查，再看累计漂移，最后用以中心为基准的 6 行 x 240 点阵做真实复现。": "Run Quick Check first, then drift accumulation, then reproduce with the center-based 6 x 240 dot matrix.",
  "按现象排查": "Troubleshoot by symptom",
  "看到这些情况，就这样调": "Adjust this way when you see these symptoms",
  "拐弯会歪、越跑越偏": "Turns skew or drift accumulates",
  "先把“稳定等待”调大 1 到 3ms，再跑快速检查。": "Increase Stability Delay by 1 to 3 ms, then run Quick Check again.",
  "A 偶尔没画出来、少点": "A sometimes misses or dots are missing",
  "先把“按键保持”调大 1 到 3ms，再试单点和短测。": "Increase Button Hold by 1 to 3 ms, then test single dots and short runs.",
  "已经很稳，只是想更快": "Stable already, just want more speed",
  "每次只减 1 到 2ms，先减“稳定等待”，每改一次都复测。": "Decrease only 1 to 2 ms at a time. Reduce Stability Delay first and retest after every change.",
  "长测后才开始漂": "Drift appears only after long tests",
  "直接跑以中心为基准的 6 行 x 240 点阵，看长直线末段和换行处是不是开始错位。": "Run the center-based 6 x 240 dot matrix and inspect long-line ends and row turns for misalignment.",
  "先调这两个旋钮": "Tune These Two Controls First",
  "这两个值会同时用于测试和正式绘制。": "These two values are used for both tests and live drawing.",
  "当前串口": "Current serial port",
  "每次移动几格": "Steps per move",
  "第一优先": "First priority",
  "常用区间": "Common range",
  "稳定等待": "Stability Delay",
  "技术名：inputDelay": "Technical name: inputDelay",
  "推荐起点": "Recommended start",
  "决定每次动作后留多少缓冲时间，最像“稳定性旋钮”。转向错位、连续动作吃不稳、偶发漂移，先动它。": "Controls the buffer after each action. This is the main stability knob. Adjust it first for skewed turns, unstable sequences, or occasional drift.",
  "这段通常比较平衡，适合先跑“快速检查”，确认稳了再继续提速。": "This range is usually balanced. Run Quick Check first, then speed up after it is stable.",
  "当前值": "Current value",
  "建议从 45ms 起步": "Start from 45 ms",
  "如果拐弯会歪或越跑越偏，先加 1 到 3ms 再测。": "If turns skew or drift accumulates, add 1 to 3 ms and test again.",
  "第二优先": "Second priority",
  "按键保持": "Button Hold",
  "技术名：buttonPressDuration": "Technical name: buttonPressDuration",
  "决定按键会按住多久，最像“力度旋钮”。A 漏按、漏步、少点时优先调它；太大时可能会变慢，甚至过冲。": "Controls how long a button is held. This is the hold-strength knob. Adjust it for missed A presses, missed steps, or missing dots; too much can slow things down or overshoot.",
  "这段通常比较省心，适合在方向稳定之后，再用它微调落笔手感。": "This range is usually low-maintenance. Use it to fine-tune press feel after direction movement is stable.",
  "建议从 65ms 起步": "Start from 65 ms",
  "如果 A 有时没画出来或少点，先加 1 到 3ms 再测。": "If A sometimes misses or dots are missing, add 1 to 3 ms and test again.",
  "恢复推荐默认值 45 / 65": "Restore Recommended Defaults 45 / 65",
  "先做一个小动作": "Try a Small Action First",
  "先用小动作确认连接和参数。": "Use a small action to confirm the connection and timing.",
  "请先选择串口，并确保手柄已经进入“已就绪”。": "Select a serial port and make sure the controller is Ready.",
  "方向": "Direction",
  "移动": "Move",
  "按钮": "Buttons",
  "再选一个测试": "Choose a Test Next",
  "从快速检查到长程复现。": "From quick checks to long reproductions.",
  "推荐先跑": "Run first",
  "快速检查": "Quick Check",
  "标准方圈。先看拐角、转向和明显漏笔。": "Standard square loop. Check corners, turns, and obvious missed strokes first.",
  "运行标准方圈": "Run Standard Square",
  "第二步": "Second step",
  "累计漂移检查": "Drift Accumulation Check",
  "长程方圈。更适合看长一点之后会不会越跑越歪。": "Long square loop. Better for seeing whether longer runs drift progressively.",
  "运行长程方圈": "Run Long Square",
  "最后复现": "Final reproduction",
  "真实长程复现": "Real Long-Run Reproduction",
  "以中心为基准的 6 行 x 240 点阵。最适合复现长直线、换行后才出现的慢性偏移。": "A center-based 6 x 240 dot matrix. Best for reproducing slow drift on long straight lines and after row turns.",
  "运行 6 行 x 240": "Run 6 x 240",
  "本次结果": "This Result",
  "显示耗时、理论值和设备反馈。": "Shows elapsed time, theoretical time, and device feedback.",
  "未开始": "Not started",
  "等待开始测试": "Waiting to start test",
  "点任意一个测试后，这里会显示这组参数大概有多快、是否顺利跑完，以及设备最后一次返回了什么。": "After you run any test, this shows roughly how fast the parameters are, whether it completed successfully, and the last device response.",
  "这次参数": "Parameters",
  "按键保持 65ms · 稳定等待 45ms": "Button hold 65 ms · stability delay 45 ms",
  "实测总耗时": "Measured total time",
  "理论时间": "Theoretical time",
  "平均每动作": "Average per action",
  "设备反馈": "Device feedback",
  "更新时间": "Updated at",
  "设备返回日志": "Device Response Log",
  "设备原始返回内容。": "Raw device responses.",
  "等待开始调试...": "Waiting to start tuning...",
  "GPL-3.0-or-later · 来源作者：惜羽拓麻镇": "GPL-3.0-or-later · Original author: Xiyu Takumazhen",
  "等待连接手柄": "Waiting for controller connection",
  "未知": "Unknown",
  "进行中": "In progress",
  "已暂停": "Paused",
  "正在中断": "Stopping",
  "已完成": "Completed",
  "已保存恢复点": "Resume point saved",
  "异常中断": "Interrupted by error",
  "已成功": "Succeeded",
  "失败": "Failed",
  "成功": "Success",
  "测试中": "Testing",
  "处理中": "Processing",
  "未就绪": "Not ready",
  "需重试": "Retry needed",
  "可先生成": "Generate first",
  "可以先生成黑白脚本": "You can generate a monochrome script first",
  "生成预览和脚本不依赖手柄连接。真正发送到开发板前，再去完成一次手柄测试即可。": "Preview and script generation do not require a controller connection. Before sending to the board, complete the controller test once.",
  "手柄已连接，可以开始绘制": "Controller is connected. Drawing can start.",
  "开发板已经开始和 Switch 握手，但还没有到“已就绪”。请先到“手柄测试”页把连接跑通。": "The board has started handshaking with the Switch but is not Ready yet. Finish the connection on the Controller Test page.",
  "黑 / 白": "Black / white",
  "空白": "Blank",
  "当前没有落在画布内的有效像素": "No valid pixels are currently inside the canvas.",
  "正在准备 PlatformIO...": "Preparing PlatformIO...",
  "正在准备 PlatformIO，请等待下方日志完成。": "Preparing PlatformIO. Wait for the log below to finish.",
  "当前没有检测到 PlatformIO。刷入固件需要先准备 PlatformIO。": "PlatformIO was not detected. Prepare PlatformIO before flashing firmware.",
  "当前仅支持 Windows x64 的一键串口驱动安装。": "One-click serial driver installation currently supports Windows x64 only.",
  "如果当前开发板仍未识别，或更换板子后仍没有新的串口出现，可以重装 CP210x 驱动；如果仍无效果，再安装 CH340/CH341 驱动。": "If the current board is still not recognized, or a new board still does not create a serial port, reinstall the CP210x driver first. If that does not help, install the CH340/CH341 driver.",
  "如果还没有检测到串口，请先确认使用可传输数据的 USB 线并重新插拔 ESP32；仍无串口时优先安装 CP210x 驱动，如果仍检测不到再安装 CH340/CH341 驱动。": "If no serial port is detected, first confirm the USB cable supports data and reconnect the ESP32. If there is still no port, install CP210x first, then CH340/CH341.",
  "正在安装 CP210x...": "Installing CP210x...",
  "正在安装 CH340/CH341...": "Installing CH340/CH341...",
  "测试": "Test",
  "等待设备返回...": "Waiting for device response...",
  "本次没有额外设备信息。": "No extra device information in this run.",
  "已检测到": "Detected",
  "当前串口不可用，或端口号已经变化。请刷新串口列表并重新选择目标设备后再重试。": "The current serial port is unavailable or the port name changed. Refresh the port list, select the target again, and retry.",
  "没有找到 PlatformIO，请先确认本机安装是否完成。": "PlatformIO was not found. Confirm that it is installed.",
  "当前目标环境无效，请重新选择开发板环境。": "The selected target environment is invalid. Choose the board environment again.",
  "读取文件失败": "Failed to read file",
  "读取预览图失败": "Failed to read preview image",
  "居中": "Centered",
  "当前位置居中。": "Current position is centered.",
  "位置居中": "position centered",
  "推荐主线，显式兼容常见 2MB flash 通用板，最终用于 Bluetooth Classic 模拟 Switch Pro 手柄。": "Recommended mainline target. Explicitly supports common 2 MB flash generic boards and ultimately uses Bluetooth Classic to emulate a Switch Pro Controller.",
  "适合丝印或卖家标注为 NodeMCU-32S 的兼容板。": "For compatible boards marked as NodeMCU-32S on the silkscreen or seller listing.",
  "XIAO ESP32-C3（串口测试）": "XIAO ESP32-C3 (serial test)",
  "仅用于协议、ACK 和串口联调，不是最终的 Switch Pro 路线。": "Only for protocol, ACK, and serial debugging. This is not the final Switch Pro route.",
  "用于旧版 Switch 兼容路径，保持原有蓝牙 HID 时序。": "For the legacy Switch compatibility path. Keeps the original Bluetooth HID timing.",
  "当前硬件环境": "Current hardware environment",
  "Switch 2 目前走更保守的 Bluetooth Classic HID 时序，并在认证成功后主动补发 virtual cable 请求。": "Switch 2 currently uses more conservative Bluetooth Classic HID timing and actively resends the virtual-cable request after authentication succeeds.",
  "Switch Lite 对蓝牙 HID 时序更敏感；此模式会切换到启用 SWITCH_LITE 的专用构建（禁用 BT modem sleep、固定发送节奏并延长拥塞重试）以提升配对与按键稳定性。": "Switch Lite is more sensitive to Bluetooth HID timing. This mode switches to a dedicated SWITCH_LITE build that disables BT modem sleep, fixes the send cadence, and extends congestion retries to improve pairing and button stability.",
  "ESP32-WROOM-32 / ESP-32S（Switch 2 模式）": "ESP32-WROOM-32 / ESP-32S (Switch 2 mode)",
  "ESP32-WROOM-32 / ESP-32S（Switch Lite 模式）": "ESP32-WROOM-32 / ESP-32S (Switch Lite mode)",
  "请先选择一个串口设备。": "Select a serial device first.",
  "串口已经选好。下一步去“手柄测试”页把手柄连到“已就绪”，再回来调参数。": "The serial port is selected. Next, go to Controller Test, get the controller to Ready, then return to tune parameters.",
  "先在上面选一个串口设备，再开始试动作或跑测试。": "Select a serial device above before trying actions or running tests.",
  "现在发出的每个测试都会先套用当前参数。建议先试 1 格，再跑“快速检查”，最后再决定要不要跑长测。": "Every test sent now applies the current parameters first. Try 1 step first, then run Quick Check, then decide whether to run a long test.",
  "请先导入一张图片，然后可以直接点“一键开始绘制”。": "Import an image first, then you can click Start Drawing directly.",
  "正方形画布。": "Square canvas.",
  "这里显示程序当前使用的 7x12 官方色盘，并会高亮这张图实际量化到的颜色格。": "This shows the 7x12 official palette used by the program and highlights the color cells actually used by this image.",
  "快速检查（标准方圈）": "Quick Check (Standard Square)",
  "标准方圈": "Standard Square",
  "开始前请确认：Switch 已经进入绘画页、当前是画笔工具、最好切到 1 号笔、画笔停在画布中心，并且从现在开始不要再碰手柄或屏幕。现在开始运行快速检查（标准方圈）吗？": "Before starting, confirm that the Switch is on the drawing page, the brush tool is active, preferably brush 1 is selected, the brush is at the canvas center, and you will not touch the controller or screen from now on. Run Quick Check (Standard Square) now?",
  "正在跑快速检查（标准方圈）。请观察拐角会不会失真、转向会不会歪，以及有没有明显漏笔、跳笔或漂移。": "Running Quick Check (Standard Square). Watch for distorted corners, skewed turns, obvious missed strokes, skipped dots, or drift.",
  "快速检查已经跑完。它最适合先判断这组参数到底是更稳了，还是只是看起来更快了。": "Quick Check is complete. It is best for judging whether these parameters are actually more stable or only look faster.",
  "长程方圈": "Long Square",
  "累计漂移检查（长程方圈）": "Drift Accumulation Check (Long Square)",
  "开始前请确认：Switch 已经进入绘画页、当前是画笔工具、最好切到 1 号笔、画笔停在画布中心，并且从现在开始不要再碰手柄或屏幕。现在开始运行累计漂移检查（长程方圈）吗？": "Before starting, confirm that the Switch is on the drawing page, the brush tool is active, preferably brush 1 is selected, the brush is at the canvas center, and you will not touch the controller or screen from now on. Run Drift Accumulation Check (Long Square) now?",
  "正在跑累计漂移检查（长程方圈）。请重点看长一点之后会不会越跑越偏，拐角会不会越来越不规整。": "Running Drift Accumulation Check (Long Square). Focus on whether longer runs drift progressively or corners become less regular.",
  "累计漂移检查已经跑完。请重点看长时间累计后有没有偏移，以及方圈是不是还能保持规整。": "Drift Accumulation Check is complete. Check for accumulated offset after the long run and whether the square loop remains regular.",
  "6 行 x 240": "6 rows x 240",
  "真实长程复现（以中心为基准的 6 行 x 240 点阵）": "Real Long-Run Reproduction (center-based 6 rows x 240 dot matrix)",
  "开始前请确认：Switch 已经进入绘画页、当前是画笔工具、最好切到 1 号笔、画笔停在画布中心，并且从现在开始不要再碰手柄或屏幕。这个基准会先以当前中心为中线左移到起画点，再连续画 6 行 x 240 点，共 1440 次落笔、2998 条动作，专门复现长直线和蛇形换行后的慢性偏移。现在开始运行 6 行 x 240 点阵复现基准吗？": "Before starting, confirm that the Switch is on the drawing page, the brush tool is active, preferably brush 1 is selected, the brush is at the canvas center, and you will not touch the controller or screen from now on. This benchmark first moves left from the current center line to the start point, then draws 6 rows x 240 dots for 1440 presses and 2998 actions, specifically reproducing slow drift after long straight lines and serpentine row turns. Run the 6 rows x 240 dot-matrix reproduction benchmark now?",
  "正在跑真实长程复现（以中心为基准的 6 行 x 240 点阵）。请重点观察每行后半段、换行后的首点，以及长时间连续落笔后有没有慢性累积偏移。": "Running Real Long-Run Reproduction (center-based 6 rows x 240 dot matrix). Watch each row's second half, the first point after row turns, and whether slow accumulated drift appears after sustained drawing.",
  "真实长程复现已经跑完。请重点看长直线末段、蛇形换行处和最后几行是否仍然整齐，这一档最接近真实问题场景。": "Real Long-Run Reproduction is complete. Check whether long-line ends, serpentine row turns, and the last few rows remain aligned; this is closest to the real problem case.",
  "已载入图片": "Loaded image",
  "开始一键生成并绘制...": "Starting one-click generation and drawing...",
  "开始生成预览和命令...": "Generating preview and commands...",
  "开始发送到设备": "Sending to device",
  "这会强制清除当前卡住的绘制状态，不会继续等待当前命令自然结束。只有在“正在中断绘制”长时间不消失时才建议使用。确定继续吗？": "This force-clears the currently stuck drawing state without waiting for the current command to finish naturally. Use it only when Stopping Drawing remains for a long time. Continue?",
  "请先选择图片。": "Select an image first.",
  "加载图纸模板": "Load drawing templates",
  "加载图纸模板失败": "Failed to load drawing templates",
  "生成": "Generate",
  "生成失败": "Generation failed",
  "没有可执行的命令。": "There are no executable commands.",
  "开始绘制前，请先到“手柄测试”页把手柄连接状态跑到“已就绪”。": "Before drawing, go to Controller Test and get the controller connection status to Ready.",
  "脚本已复制到剪贴板。": "Script copied to the clipboard.",
  "脚本文件已下载。": "Script file downloaded.",
  "日志已复制到剪贴板。": "Log copied to the clipboard.",
  "之前选择的串口已断开": "Previously selected serial port disconnected",
  "之前选择的串口已消失": "Previously selected serial port disappeared",
  "之前选择的串口已断开，请重新选择目标设备后再刷入。": "The previously selected serial port disconnected. Select the target device again before flashing.",
  "请先选择要刷入的串口设备。": "Select the serial device to flash first.",
  "固件刷入失败": "Firmware flash failed",
  "固件刷入成功": "Firmware flash succeeded",
  "正在刷入固件": "Flashing firmware",
  "已停止刷入": "Flashing stopped",
  "刷入": "Flash",
  "刷入失败": "Flash failed",
  "自动检测": "Auto-detect",
  "固定端口刷入失败，正在改用 PlatformIO 自动探测可用端口重试。": "Fixed-port flashing failed. Retrying with PlatformIO auto-detection.",
  "PlatformIO 正在按当前选中的串口编译并上传固件，请稍等片刻。": "PlatformIO is building and uploading firmware to the selected serial port. Please wait.",
  "PlatformIO 正在准备按当前选中的串口上传固件，请稍等片刻。": "PlatformIO is preparing to upload firmware to the selected serial port. Please wait.",
  "固定端口失败后已自动改用 PlatformIO 串口探测并刷入成功，可以继续去手柄测试页读取设备信息。": "After the fixed port failed, PlatformIO serial-port detection succeeded and the firmware was flashed. Continue to Controller Test to read device information.",
  "设备已经写入完成，可以继续去手柄测试页读取设备信息。": "The device has been written successfully. Continue to Controller Test to read device information.",
  "当前刷入任务已经取消，可以检查端口或让开发板重新进入下载模式后再重试。": "The current flashing task was canceled. Check the port or put the board back into download mode, then retry.",
  "刷入失败，请查看下方日志。": "Flashing failed. Check the log below.",
  "读取刷入状态": "Read flash status",
  "读取刷入状态失败": "Failed to read flash status",
  "PlatformIO 已经可用。": "PlatformIO is already available.",
  "刷入固件需要 PlatformIO，未检测到。是否现在安装？": "Firmware flashing requires PlatformIO, but it was not detected. Install it now?",
  "已取消准备 PlatformIO。": "PlatformIO setup canceled.",
  "当前系统暂不支持自动下载 app-local Python。": "This system does not currently support automatic app-local Python download.",
  "安装 PlatformIO 需要 Python。未检测到可用 Python，是否下载一个仅供 Friend Maker 使用的 Python 运行环境？": "Installing PlatformIO requires Python. No usable Python was detected. Download a Python runtime used only by Friend Maker?",
  "已取消下载 app-local Python。": "App-local Python download canceled.",
  "准备 PlatformIO": "Prepare PlatformIO",
  "准备 PlatformIO 失败": "Failed to prepare PlatformIO",
  "读取 PlatformIO 准备状态": "Read PlatformIO setup status",
  "读取 PlatformIO 准备状态失败": "Failed to read PlatformIO setup status",
  "当前环境不支持一键安装 Windows 串口驱动": "This environment does not support one-click Windows serial driver installation",
  "仅支持 Windows x64": "Windows x64 only",
  "驱动资源缺失，无法安装。": "Driver resources are missing and cannot be installed.",
  "打开 WCH 安装器后请点击 INSTALL。": "After the WCH installer opens, click INSTALL.",
  "应用会调用 pnputil 安装 CP210x 驱动。": "The app will call pnputil to install the CP210x driver.",
  "驱动安装启动": "Start driver installation",
  "驱动安装启动失败": "Failed to start driver installation",
  "读取驱动安装状态": "Read driver installation status",
  "读取驱动安装状态失败": "Failed to read driver installation status",
  "正在检查当前手柄状态": "Checking current controller status",
  "正在读取开发板当前蓝牙状态；如果已经连上 Switch，会直接复用当前连接。": "Reading the board's current Bluetooth status. If it is already connected to the Switch, the current connection will be reused.",
  "检测到手柄已经连接，跳过蓝牙重置。": "Controller is already connected. Skipping Bluetooth reset.",
  "检测到开发板已经在握手中，跳过蓝牙重置并继续等待连接完成。": "The board is already handshaking. Skipping Bluetooth reset and continuing to wait for connection.",
  "当前状态读取失败，改为重置蓝牙后重新连接。": "Current status read failed. Resetting Bluetooth and reconnecting instead.",
  "正在准备连接手柄": "Preparing controller connection",
  "正在重置蓝牙并重新进入可发现状态，请保持 Switch 停在“更改握法/顺序”页面。": "Resetting Bluetooth and returning to discoverable mode. Keep the Switch on the Change Grip/Order page.",
  "正在重置手柄蓝牙": "Resetting controller Bluetooth",
  "正在重启蓝牙协议栈并读取最新状态，请稍等片刻。": "Restarting the Bluetooth stack and reading the latest status. Please wait.",
  "正在清除已保存主机": "Clearing saved host",
  "正在清除开发板里记录的上一次蓝牙主机，并重新进入可发现状态。": "Clearing the last Bluetooth host stored on the board and returning to discoverable mode.",
  "串口连接已断开。": "Serial connection disconnected.",
  "未知测试动作": "Unknown test action",
  "测试动作": "Test action",
  "未知调试动作": "Unknown timing action",
  "调试动作": "Timing action",
  "请输入至少一条测试命令。": "Enter at least one test command.",
  "自定义命令": "Custom command",
  "未选择": "Not selected",
  "读取绘制状态": "Read drawing status",
  "读取绘制状态失败": "Failed to read drawing status",
  "暂停会在当前命令完成后生效；如果此时 Switch 还会继续动一下，这是正常现象。": "Pause takes effect after the current command completes. It is normal if the Switch moves one more time now.",
  "中断会在当前命令完成后生效；随后会保存恢复点，供你重新进入绘画页后继续。": "Stop takes effect after the current command completes. A resume point will then be saved so you can continue after re-entering the drawing page.",
  "绘制中": "Drawing",
  "可恢复": "Recoverable",
  "已放弃": "Discarded",
  "未命名绘制": "Untitled drawing",
  "下一个恢复颜色": "Next resume color",
  "从恢复点继续": "Resume from Point",
  "放弃恢复记录": "Discard Resume Record",
  "读取恢复任务": "Read resume tasks",
  "读取恢复任务失败": "Failed to read resume tasks",
  "恢复绘制前，请先到“手柄测试”页把手柄连接状态跑到“已就绪”。": "Before resuming drawing, go to Controller Test and get the controller connection status to Ready.",
  "请确认：你已经先在 Switch 里保存当前画作，并且已经手动重新进入绘画页；从这里开始不要再手动改笔刷，也不要再移动页面。现在开始从恢复点继续吗？": "Confirm that you have saved the current artwork on the Switch and manually re-entered the drawing page. From here on, do not manually change the brush or move the page. Resume from the saved point now?",
  "恢复绘制": "Resume drawing",
  "恢复绘制失败": "Failed to resume drawing",
  "已从恢复点继续": "Resumed from point",
  "放弃后会删除本地脚本和恢复记录。确定继续吗？": "Discarding will delete the local script and resume record. Continue?",
  "放弃恢复记录失败": "Failed to discard resume record",
  "已放弃恢复记录": "Resume record discarded",
  "读取串口连接状态": "Read serial connection status",
  "读取串口连接状态失败": "Failed to read serial connection status",
  "串口命令正在执行中。": "Serial command is running.",
  "连接恢复失败": "Connection recovery failed",
  "等待连接超过 45 秒，自动重置蓝牙并优先尝试恢复上次主机连接。": "Connection has waited over 45 seconds. Automatically resetting Bluetooth and trying to restore the last host first.",
  "等待连接超过 45 秒，自动重置蓝牙并重试一次。": "Connection has waited over 45 seconds. Automatically resetting Bluetooth and retrying once.",
  "正在自动恢复手柄连接": "Automatically recovering controller connection",
  "开发板长时间停留在握手状态，正在重置蓝牙并优先恢复上次保存的主机连接。": "The board stayed in handshaking for too long. Resetting Bluetooth and restoring the last saved host first.",
  "开发板长时间停留在广播或握手状态，正在重置蓝牙并重新进入可发现状态。": "The board stayed in advertising or handshaking for too long. Resetting Bluetooth and returning to discoverable mode.",
  "自动恢复手柄连接": "Auto-recover controller connection",
  "自动恢复没有完成。请重新点击“连接手柄”；如果还是卡住，再按一下开发板上的 EN 键后重试。": "Auto-recovery did not complete. Click Connect Controller again; if it still gets stuck, press the board's EN button and retry.",
  "连接等待超时。请确认 Switch 停在“更改握法/顺序”页面，然后重新点击“连接手柄”；如果还是卡住，再按一下开发板上的 EN 键后重试。": "Connection wait timed out. Confirm the Switch is on the Change Grip/Order page, then click Connect Controller again; if it still gets stuck, press the board's EN button and retry.",
  "开发板长时间停留在广播或握手状态。请确认 Switch 停在“更改握法/顺序”页面，然后重新点击“连接手柄”；如果还是卡住，再按一下开发板上的 EN 键后重试。": "The board stayed in advertising or handshaking for too long. Confirm the Switch is on the Change Grip/Order page, then click Connect Controller again; if it still gets stuck, press the board's EN button and retry.",
  "读取手柄状态": "Read controller status",
  "读取手柄状态失败": "Failed to read controller status",
  "读取手柄状态失败，请重新点击“连接手柄”后再试。": "Failed to read controller status. Click Connect Controller again and retry.",
  "检测到手柄已经连上但报告通道持续拥塞，自动重置蓝牙并优先尝试恢复上次主机连接。": "The controller is connected but the report channel remains congested. Automatically resetting Bluetooth and trying to restore the last host first.",
  "检测到手柄已经连上但报告通道持续拥塞，自动重置蓝牙并重试一次。": "The controller is connected but the report channel remains congested. Automatically resetting Bluetooth and retrying once.",
  "检测到当前连接容易立刻断联，正在重置蓝牙并优先恢复上次保存的主机连接。": "The current connection appears likely to drop immediately. Resetting Bluetooth and restoring the last saved host first.",
  "检测到当前连接容易立刻断联，正在重置蓝牙并重新进入可发现状态。": "The current connection appears likely to drop immediately. Resetting Bluetooth and returning to discoverable mode.",
  "自动恢复没有完成。请重新点击“连接手柄”；如果还是容易断联，再按一下开发板上的 EN 键后重试。": "Auto-recovery did not complete. Click Connect Controller again; if it still disconnects easily, press the board's EN button and retry.",
  "自动重试后连接仍然不稳定。请重新点击“连接手柄”；如果还是容易断联，再按一下开发板上的 EN 键后重试。": "The connection is still unstable after automatic retry. Click Connect Controller again; if it still disconnects easily, press the board's EN button and retry.",
  "请查看执行日志。": "Check the execution log.",
  "当前命令": "current command",
  "还没有检测到串口设备。请确认使用可传输数据的 USB 线、重新插拔 ESP32；在刷入固件页确认 PlatformIO 就绪后可安装 CP210x 或 CH340/CH341 驱动。": "No serial device has been detected yet. Confirm the USB cable supports data transfer and reconnect the ESP32; after PlatformIO is ready on the Flash Firmware page, you can install the CP210x or CH340/CH341 driver.",
  "串口设备已经选好，但手柄还没到“已就绪”。请先去“手柄测试”页完成连接。": "The serial device is selected, but the controller is not Ready yet. Go to Controller Test and finish the connection first.",
  "测试": "Test",
  "测速": "timing test",
  "本次没有额外设备信息。": "No extra device information in this run.",
  "等待设备返回...": "Waiting for device response...",
  "测速失败，请查看日志。": "Timing test failed. Check the log.",
  "正在刷新串口列表...": "Refreshing serial port list...",
  "串口列表获取": "Fetch serial port list",
  "串口列表获取失败": "Failed to fetch serial port list",
  "当前没有检测到串口设备。请换数据线、重新插拔 ESP32；PlatformIO 就绪后仍无设备时优先安装 CP210x 驱动，再尝试 CH340/CH341 驱动。": "No serial device was detected. Try another data-capable USB cable and reconnect the ESP32. If no device appears after PlatformIO is ready, install the CP210x driver first, then try CH340/CH341.",
  "固件信息加载": "Load firmware information",
  "固件信息加载失败": "Failed to load firmware information",
  "加载固件信息": "Load firmware information",
  "加载固件信息失败": "Failed to load firmware information",
  "Windows 串口驱动信息加载": "Load Windows serial driver information",
  "Windows 串口驱动信息加载失败": "Failed to load Windows serial driver information",
  "加载 Windows 串口驱动信息": "Load Windows serial driver information",
  "加载 Windows 串口驱动信息失败": "Failed to load Windows serial driver information",
  "官方色盘加载": "Load official palette",
  "官方色盘加载失败": "Failed to load official palette",
  "加载官方色盘": "Load official palette",
  "加载官方色盘失败": "Failed to load official palette",
  "未检测到可用环境": "No available environments detected",
  "未检测到可用型号": "No available models detected",
  "未检测到": "Not detected",
  "串口当前被占用，请先关闭串口监视器或其他串口工具后再重试。": "The serial port is busy. Close the serial monitor or other serial tools first, then retry.",
  "设备没有顺利进入下载模式。请重新插拔开发板，必要时按住 BOOT 键后再重试刷入。": "The device did not enter download mode successfully. Reconnect the board, hold BOOT if needed, then retry flashing.",
  "刷入超时了。请检查数据线、下载模式和网络，再重试；如果开发板难以进入下载模式，可以按住 BOOT 键后重新刷入。": "Flashing timed out. Check the cable, download mode, and network, then retry. If the board has trouble entering download mode, hold BOOT and flash again.",
  "刷入任务已停止。请检查端口和开发板状态后再重试。": "The flashing task stopped. Check the port and board state, then retry.",
  "串口当前被其他进程占用，常见原因是另一个 Friend Maker 实例或串口工具仍保持连接。请先断开旧连接，或完全退出占用程序后再重试。": "The serial port is occupied by another process, commonly another Friend Maker instance or serial tool still holding the connection. Disconnect the old connection or quit the occupying program, then retry.",
  "请重新连接手柄，或改用更慢的输入时序后再开始。": "Reconnect the controller or use slower input timing before starting again.",
  "偏快，先看稳定": "Fast; check stability first",
  "偏稳，会更慢": "Stable; slower",
  "偏轻，先看漏点": "Light; check missed dots first",
  "如果拐弯会歪、连续动作吃不稳或越跑越偏，先加 1 到 3ms 再测。": "If turns skew, repeated actions are unstable, or drift accumulates, add 1 to 3 ms and test again.",
  "如果已经很稳但觉得太慢，可以每次只减 1 到 2ms，然后重新复测。": "If it is stable but too slow, reduce only 1 to 2 ms at a time and retest.",
  "如果 A 偶尔没画出来、少点或漏步，先加 1 到 3ms 再测。": "If A sometimes misses, dots are missing, or steps are skipped, add 1 to 3 ms and test again.",
  "如果已经不漏点，只是想更快，可以慢慢往下减，避免一下子减太多。": "If dots are no longer missed and you only want more speed, reduce slowly and avoid dropping too much at once.",
};

const DYNAMIC_PATTERNS = [
  [/^(\d+) 像素$/u, "$1 px"],
  [/^(\d+) 格$/u, "$1 step"],
  [/^(\d+) 色$/u, "$1 colors"],
  [/^约 0 秒$/u, "About 0 s"],
  [/^约 ([\d.]+) 秒$/u, "About $1 s"],
  [/^约 ([\d.]+) 分钟$/u, "About $1 min"],
  [/^(.+)（推荐）$/u, (_, value) => `${translateText(value)} (recommended)`],
  [/^串口：(.+)$/u, (_, value) => `Serial: ${translateText(value)}`],
  [/^串口已连接：(.+)$/u, (_, value) => `Serial connected: ${translateText(value)}`],
  [/^手柄：(.+)$/u, (_, value) => `Controller: ${translateText(value)}`],
  [/^绘制：(.+)$/u, (_, value) => `Drawing: ${translateText(value)}`],
  [/^缩放 ([\d.]+)%$/u, "Scale $1%"],
  [/^缩放 ([\d.]+)%。$/u, "Scale $1%."],
  [/^x: (\d+)-(\d+) · y: (\d+)-(\d+)$/u, "x: $1-$2 · y: $3-$4"],
  [/^(\d+) \/ (\d+) 官方色$/u, "$1 / $2 official colors"],
  [/^(\d+) \/ (\d+) 自动量化色$/u, "$1 / $2 auto-quantized colors"],
  [/^(\d+) · L (\d+)$/u, "$1 · L $2"],
  [/^(\d+) · L (\d+) · (.+)$/u, (_, count, lines, recenter) => `${count} · L ${lines} · ${translateText(recenter)}`],
  [/^(.+)失败$/u, (_, label) => `${translateText(label)} failed`],
  [/^(.+)失败：(.+)$/u, (_, label, detail) => `${translateText(label)} failed: ${translateText(detail)}`],
  [/^(.+)完成$/u, (_, label) => `${translateText(label)} completed`],
  [/^正在运行(.+)$/u, (_, label) => `Running ${translateText(label)}`],
  [/^(.+)请求已发送。$/u, (_, label) => `${translateText(label)} request sent.`],
  [/^生成完成：(\d+) 条命令，预计耗时 (.+)$/u, (_, count, duration) => `Generation complete: ${count} commands, estimated runtime ${translateText(duration)}`],
  [/^回中优化：(.+)$/u, (_, detail) => `Recenter optimization: ${translateText(detail)}`],
  [/^回中 0 次$/u, "recenter 0 times"],
  [/^回中 0 次 · 阈值 (\d+) 格$/u, "recenter 0 times · threshold $1 steps"],
  [/^回中 (\d+) 次 · 省 (.+) · 阈值 (\d+) 格$/u, (_, count, duration, threshold) => `recenter ${count} times · saved ${translateText(duration)} · threshold ${threshold} steps`],
  [/^执行失败：(.+)$/u, (_, detail) => `Execution failed: ${translateText(detail)}`],
  [/^恢复脚本已保存：(.+)$/u, "Resume script saved: $1"],
  [/^脚本：(.+)$/u, "Script: $1"],
  [/^检测到 (\d+) 个串口设备。$/u, "Detected $1 serial devices."],
  [/^之前选择的串口已断开：(.+)$/u, "Previously selected port disconnected: $1"],
  [/^之前选择的串口 (.+) 已消失，请重新选择目标设备。$/u, "Previously selected port $1 disappeared. Select the target device again."],
  [/^之前选择的串口 (.+) 已断开，请重新选择目标设备。$/u, "Previously selected port $1 disconnected. Select the target device again."],
  [/^之前选择的串口 (.+) 已断开，请重新选择目标设备后再刷入。$/u, "Previously selected port $1 disconnected. Select the target device again before flashing."],
  [/^自动检测（初始选择 (.+)）$/u, "Auto-detect (initial selection $1)"],
  [/^(.+) 驱动资源缺失，无法安装。$/u, "$1 driver resources are missing and cannot be installed."],
  [/^即将安装 (.+) 串口驱动。Windows 会弹出管理员权限确认。(.+) 安装完成后请重新插拔 ESP32，再点击“刷新串口”。是否继续？$/u, (_, driver, note) => `About to install the ${driver} serial driver. Windows will show an administrator permission prompt. ${translateText(note)} After installation finishes, reconnect the ESP32, then click Refresh Ports. Continue?`],
  [/^已取消安装 (.+) 驱动。$/u, "$1 driver installation canceled."],
  [/^当前开发板已经处于可发送状态，可以把绘制脚本发到 (.+)。$/u, "The board is ready to send. You can send the drawing script to $1."],
  [/^开发板已经连上 Switch，但 HID 报告通道仍在拥塞（最近一次 send-report status=(.+) reason=(.+)，累计失败 (\d+) 次），现在继续测试或开画都容易断联。建议先重置蓝牙后重新连接。$/u, "The board is connected to the Switch, but the HID report channel is still congested (latest send-report status=$1 reason=$2, $3 accumulated failures). Continuing tests or drawing now can disconnect easily. Reset Bluetooth and reconnect first."],
  [/^蓝牙初始化停在 (.+)，返回 (.+)。$/u, "Bluetooth initialization stopped at $1 and returned $2."],
  [/^绘制进行中：(\d+) \/ (\d+)(?: · 当前命令 (.+))?$/u, (_, done, total, command) => `Drawing: ${done} / ${total}${command ? ` · current command ${command}` : ""}`],
  [/^绘制已暂停：(\d+) \/ (\d+)。如果你刚点了暂停，看到 Switch 还会把最后一条已发出的命令跑完，这是正常现象。$/u, "Drawing paused: $1 / $2. If you just paused, it is normal for the Switch to finish the last command already sent."],
  [/^正在中断绘制：(\d+) \/ (\d+)。Switch 还会先跑完当前命令，然后保存恢复点；如果长时间卡在这里，下面会出现应急按钮。$/u, "Stopping drawing: $1 / $2. The Switch will finish the current command first, then save a resume point. If this stays stuck, an emergency button will appear below."],
  [/^绘制已完成：(\d+) \/ (\d+)$/u, "Drawing completed: $1 / $2"],
  [/^绘制已中断并保存恢复点：(\d+) \/ (\d+)。请先在 Switch 里保存，再手动重新进入绘画页后继续。$/u, "Drawing stopped and resume point saved: $1 / $2. Save on the Switch first, then manually re-enter the drawing page before continuing."],
  [/^绘制异常中断：(.+) 请先在 Switch 里保存，再手动重新进入绘画页后，从下方恢复任务继续。$/u, (_, detail) => `Drawing was interrupted by an error: ${translateText(detail)} Save on the Switch first, then manually re-enter the drawing page and continue from a resume task below.`],
  [/^这里显示程序当前使用的 7x12 官方色盘。当前这张图实际量化到了 (\d+) 个官方色，已高亮对应格子。$/u, "This shows the 7x12 official palette used by the program. This image quantized to $1 official colors, and those cells are highlighted."],
  [/^这里完整列出这张图当前预览实际用到的全部颜色。当前共使用 (\d+) 个自动量化颜色，绘制时会按 9 槽一批写入自定义色槽。$/u, "This lists every color used by the current preview. It uses $1 auto-quantized colors and writes them to custom color slots in batches of 9 while drawing."],
  [/^当前会同时用于手柄测试、测速和正式绘制：稳定等待 (\d+)ms · 按键保持 (\d+)ms。$/u, "Current values apply to controller tests, timing tests, and live drawing: stability delay $1 ms · button hold $2 ms."],
  [/^当前动作测试会先套用 (.+)。$/u, "Action tests apply $1 first."],
  [/^按键保持 (\d+)ms · 稳定等待 (\d+)ms$/u, "Button hold $1 ms · stability delay $2 ms"],
  [/^(\d+) ms（(\d+) 动作）$/u, "$1 ms ($2 actions)"],
  [/^(\d+) ms \/ 动作$/u, "$1 ms / action"],
  [/^串口正在使用中：(.+) @ (.+)。$/u, "Serial port in use: $1 @ $2."],
  [/^串口保持连接：(.+) @ (.+)，空闲 (\d+) 分钟后自动断开。$/u, "Serial stays connected: $1 @ $2. It disconnects automatically after $3 idle minutes."],
  [/^(\d+) 像素([^。！？]+)$/u, (_, size, brush) => `${size} px ${translateText(brush)}`],
  [/^模板：(.+)。$/u, (_, label) => `Template: ${translateText(label)}.`],
  [/^1 像素圆形像素笔刷。开始绘制会自动切笔刷。$/u, "1 px round pixel brush. Drawing will auto-switch the brush."],
  [/^(\d+) 像素([^。！？]+)。开始绘制会自动切笔刷，期间不要手动操作。$/u, (_, size, brush) => `${size} px ${translateText(brush)}. Drawing will auto-switch the brush; do not operate manually during drawing.`],
  [/^(\d+) 像素([^。！？]+)。$/u, (_, size, brush) => `${size} px ${translateText(brush)}.`],
  [/^(\d+) 号圆形像素笔刷暂不支持生成或执行。$/u, "$1 px round pixel brushes are not supported for generation or execution yet."],
  [/^单色模式：深色绘制，浅色留白。(.*)$/u, (_, rest) => `Monochrome: dark pixels are drawn and light pixels stay blank. ${translateText(rest)}`.trim()],
  [/^官方色模式：最多 (\d+) 色，映射到 7x12 官方色盘。(.*)$/u, (_, count, rest) => `Official colors: up to ${count} colors mapped to the 7x12 official palette. ${translateText(rest)}`.trim()],
  [/^自定义多色：最多 (\d+) 色，按 9 个自定义色槽分批绘制。(.*)$/u, (_, count, rest) => `Custom multicolor: up to ${count} colors drawn in batches of 9 custom color slots. ${translateText(rest)}`.trim()],
  [/^当前控件已切到 (\d+) 号(.+)，这一档暂不支持重新生成；你仍可以执行上一次按 (\d+) 号(.+)生成的脚本。$/u, (_, selectedSize, selectedBrush, generatedSize, generatedBrush) => `The controls are set to ${selectedSize} px ${translateText(selectedBrush)}, which cannot be regenerated yet. You can still run the previous script generated with ${generatedSize} px ${translateText(generatedBrush)}.`],
  [/^当前选的是 (\d+) 号(.+)，这一档暂不支持生成或执行。请切回方块像素笔刷，或改用 1 号圆形像素笔刷。$/u, (_, size, brush) => `The current selection is ${size} px ${translateText(brush)}, which cannot be generated or executed yet. Switch back to the square pixel brush or use the 1 px round pixel brush.`],
  [/^当前会把按 (\d+)% 缩放、(.+)后的 256x256 黑白脚本通过串口发送到 (.+)，模板为“(.+)”。开始后 ESP32 会先按 X、X 打开笔刷页，从默认的 7 像素圆点笔刷自动切到 (\d+) 像素(.+)，并连按三次 A 完成选中和返回画布；随后会额外等待约 3 秒，再从画布中心继续翻译成方向键移动与 A 绘制。$/u, (_, scale, position, port, template, brushSize, brushShape) => `The current 256x256 monochrome script, scaled to ${scale}% and ${translateText(position)}, will be sent to ${port} using template "${translateText(template)}". After starting, ESP32 presses X twice to open the brush page, switches from the default 7 px round-dot brush to the ${brushSize} px ${translateText(brushShape)}, presses A three times to select and return to the canvas, waits about 3 extra seconds, then continues from the canvas center using directional moves and A presses.`],
  [/^当前会把按 (\d+)% 缩放、(.+)后的 256x256 官方色脚本通过串口发送到 (.+)，模板为“(.+)”。请先保持右侧 9 个槽位默认颜色不变；开始后 ESP32 会先按 X、X 打开笔刷页，从默认的 7 像素圆点笔刷自动切到 (\d+) 像素(.+)，并连按三次 A 完成选中和返回画布；随后会额外等待约 3 秒，再按这组默认槽位状态去配置内置 7x12 色盘并继续绘制。$/u, (_, scale, position, port, template, brushSize, brushShape) => `The current 256x256 official-color script, scaled to ${scale}% and ${translateText(position)}, will be sent to ${port} using template "${translateText(template)}". Keep the 9 right-side slots at their default colors first. After starting, ESP32 presses X twice to open the brush page, switches from the default 7 px round-dot brush to the ${brushSize} px ${translateText(brushShape)}, presses A three times to select and return to the canvas, waits about 3 extra seconds, then configures the built-in 7x12 palette based on the default slot state and continues drawing.`],
  [/^当前会把按 (\d+)% 缩放、(.+)后的 256x256 自动量化多色脚本通过串口发送到 (.+)，模板为“(.+)”。开始后 ESP32 也会先按 X、X 打开笔刷页，从默认的 7 像素圆点笔刷自动切到 (\d+) 像素(.+)，并连按三次 A 完成选中和返回画布；随后会额外等待约 3 秒，再分批把当前预览实际用到的颜色写入 9 个自定义槽位后再绘制，这条路线仍处于实验阶段，建议先从颜色较少、结构简单的图片开始。$/u, (_, scale, position, port, template, brushSize, brushShape) => `The current 256x256 auto-quantized multicolor script, scaled to ${scale}% and ${translateText(position)}, will be sent to ${port} using template "${translateText(template)}". After starting, ESP32 presses X twice to open the brush page, switches from the default 7 px round-dot brush to the ${brushSize} px ${translateText(brushShape)}, presses A three times to select and return to the canvas, waits about 3 extra seconds, then writes the preview colors into 9 custom slots in batches before drawing. This route is still experimental; start with simpler images that use fewer colors.`],
  [/^(.+)完成：(\d+) 条命令，目标 (.+)$/u, (_, label, count, target) => `${translateText(label)} completed: ${count} commands, target ${target}`],
  [/^(.+)测速$/u, (_, label) => `${translateText(label)} timing test`],
  [/^(.+)没有完成。请查看下方日志，确认手柄连接是否仍处于“已就绪”，或把 timing 再调慢一点后重试。$/u, (_, label) => `${translateText(label)} did not complete. Check the log below, confirm the controller connection is still Ready, or slow down timing and retry.`],
  [/^(.+) · (\d+) 动作$/u, (_, duration, count) => `${translateText(duration)} · ${count} actions`],
  [/^· 下一个恢复颜色：(.+)$/u, "· next resume color: $1"],
  [/^· 当前命令 (.+)$/u, "· current command $1"],
  [/^当前硬件环境: (.+)$/u, (_, environment) => `Current hardware environment: ${translateText(environment)}`],
  [/^(.+) 当前硬件环境: (.+)$/u, (_, description, environment) => `${translateText(description)} Current hardware environment: ${translateText(environment)}`],
  [/^(.+) 当前硬件环境：(.+)$/u, (_, description, environment) => `${translateText(description)} Current hardware environment: ${translateText(environment)}`],
  [/^测试动作 (.+)$/u, "Test action $1"],
  [/^调试动作 (.+)$/u, "Timing action $1"],
  [/^(.+)：(.+)$/u, (_, label, value) => `${translateText(label)}: ${translateText(value)}`],
  [/^(.+): (.+)$/u, (_, label, detail) => `${translateText(label)}: ${translateText(detail)}`],
  [/^当前位置为横向 (.+)、纵向 (.+)。?$/u, (_, x, y) => `Current position: horizontal ${translateText(x)}, vertical ${translateText(y)}.`],
  [/^([\+\-]?\d+)%$/u, "$1%"],
];

const ATTRIBUTE_NAMES = [
  "aria-label",
  "title",
  "placeholder",
  "content",
  "data-empty-log",
  "alt",
];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);
const elementAttributeSources = new WeakMap();
const textSources = new WeakMap();
const textTranslations = new WeakMap();
const listeners = new Set();
let mutationObserver = null;
let activeLanguage = DEFAULT_LANGUAGE;
let initialized = false;

function normalizeLanguage(language) {
  if (language === "zh" || language === "zh-CN" || language === "zh-Hans") {
    return SOURCE_LANGUAGE;
  }

  if (language === ENGLISH_LANGUAGE) {
    return ENGLISH_LANGUAGE;
  }

  return DEFAULT_LANGUAGE;
}

function readInitialLanguage() {
  const params = new URLSearchParams(window.location.search);
  const requestedLanguage = params.get("lng") || params.get("lang");
  const storedLanguage = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
  return normalizeLanguage(requestedLanguage || storedLanguage || DEFAULT_LANGUAGE);
}

function translateExact(value) {
  const translated = window.i18next.t(value, { defaultValue: value });
  return translated === value ? null : translated;
}

function applyPattern(value) {
  for (const [pattern, replacement] of DYNAMIC_PATTERNS) {
    const match = value.match(pattern);

    if (!match) {
      continue;
    }

    return typeof replacement === "function"
      ? replacement(...match)
      : value.replace(pattern, replacement);
  }

  return value;
}

function preserveOuterWhitespace(source, translated) {
  const leading = source.match(/^\s*/u)?.[0] ?? "";
  const trailing = source.match(/\s*$/u)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function translateText(value) {
  if (typeof value !== "string" || value.length === 0 || activeLanguage === SOURCE_LANGUAGE) {
    return value;
  }

  if (value.includes("\n")) {
    return value
      .split("\n")
      .map((line) => translateText(line))
      .join("\n");
  }

  const bracketMatch = value.match(/^(\[[^\]]+\]\s*)(.*)$/u);
  if (bracketMatch) {
    return `${bracketMatch[1]}${translateText(bracketMatch[2])}`;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  const exact = translateExact(trimmed);
  if (exact) {
    return preserveOuterWhitespace(value, exact);
  }

  const patterned = applyPattern(trimmed);
  if (patterned !== trimmed) {
    return preserveOuterWhitespace(value, patterned);
  }

  if (/[。！？]/u.test(trimmed)) {
    const parts = trimmed.match(/[^。！？]+[。！？]?/gu) ?? [];

    if (parts.length > 1) {
      const translatedParts = parts.map((part) => translateText(part.trim()));
      if (translatedParts.some((part, index) => part !== parts[index].trim())) {
        return preserveOuterWhitespace(value, translatedParts.join(" "));
      }
    }
  }

  return preserveOuterWhitespace(value, trimmed);
}

function shouldSkipNode(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return !element || SKIP_TAGS.has(element.tagName) || element.closest("[data-i18n-ignore]");
}

function translateTextNode(node) {
  if (shouldSkipNode(node)) {
    return;
  }

  const currentValue = node.nodeValue ?? "";
  const previousSource = textSources.get(node);
  const previousTranslation = textTranslations.get(node);
  const sourceValue =
    previousSource && currentValue === previousTranslation
      ? previousSource
      : currentValue;

  textSources.set(node, sourceValue);

  const nextValue = activeLanguage === SOURCE_LANGUAGE ? sourceValue : translateText(sourceValue);
  textTranslations.set(node, nextValue);

  if (currentValue !== nextValue) {
    node.nodeValue = nextValue;
  }
}

function getAttributeSource(element, attributeName, currentValue) {
  let sources = elementAttributeSources.get(element);

  if (!sources) {
    sources = new Map();
    elementAttributeSources.set(element, sources);
  }

  const existing = sources.get(attributeName);
  const translatedExisting = existing ? translateText(existing) : null;
  if (existing && currentValue === translatedExisting) {
    return existing;
  }

  sources.set(attributeName, currentValue);
  return currentValue;
}

function translateElementAttributes(element) {
  if (shouldSkipNode(element)) {
    return;
  }

  for (const attributeName of ATTRIBUTE_NAMES) {
    if (!element.hasAttribute(attributeName)) {
      continue;
    }

    const currentValue = element.getAttribute(attributeName) ?? "";
    const sourceValue = getAttributeSource(element, attributeName, currentValue);
    const nextValue = activeLanguage === SOURCE_LANGUAGE ? sourceValue : translateText(sourceValue);

    if (currentValue !== nextValue) {
      element.setAttribute(attributeName, nextValue);
    }
  }
}

function translateSubtree(root = document.body) {
  if (!root) {
    return;
  }

  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElementAttributes(root);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      translateTextNode(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      translateElementAttributes(node);
    }

    node = walker.nextNode();
  }
}

function observeDom() {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        translateTextNode(mutation.target);
        continue;
      }

      if (mutation.type === "attributes") {
        translateElementAttributes(mutation.target);
        continue;
      }

      mutation.addedNodes.forEach((node) => translateSubtree(node));
    }
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTE_NAMES,
  });
}

function syncLanguageControls() {
  document.querySelectorAll("[data-language-select]").forEach((select) => {
    select.value = activeLanguage;
  });
}

function notifyLanguageChanged() {
  listeners.forEach((listener) => listener(activeLanguage));
}

async function changeLanguage(language) {
  activeLanguage = normalizeLanguage(language);
  await window.i18next.changeLanguage(activeLanguage);
  window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, activeLanguage);
  document.documentElement.lang = activeLanguage;
  translateSubtree(document.documentElement);
  syncLanguageControls();
  notifyLanguageChanged();
}

function setupLanguageControls() {
  document.querySelectorAll("[data-language-select]").forEach((select) => {
    select.addEventListener("change", () => {
      void changeLanguage(select.value);
    });
  });
  syncLanguageControls();
}

async function init() {
  if (initialized) {
    return window.i18next.t.bind(window.i18next);
  }

  activeLanguage = readInitialLanguage();
  await window.i18next.init({
    lng: activeLanguage,
    fallbackLng: "en",
    supportedLngs: [SOURCE_LANGUAGE, ENGLISH_LANGUAGE],
    resources: {
      en: { translation: TRANSLATIONS_EN },
      "zh-CN": { translation: {} },
    },
    interpolation: { escapeValue: false },
  });
  initialized = true;
  document.documentElement.lang = activeLanguage;
  setupLanguageControls();
  translateSubtree(document.documentElement);
  observeDom();
  return window.i18next.t.bind(window.i18next);
}

window.FriendMakerI18n = {
  get language() {
    return activeLanguage;
  },
  ready: init(),
  changeLanguage,
  onLanguageChanged(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  refresh: () => translateSubtree(document.documentElement),
  t: (key, options) => window.i18next.t(key, { defaultValue: key, ...(options ?? {}) }),
  translateText,
};
