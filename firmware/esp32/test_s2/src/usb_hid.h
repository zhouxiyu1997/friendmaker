#pragma once
#include <cstdint>

namespace UsbHid {

void init();
bool isMounted();
void sendIdleReport();

void pressButtons(uint16_t btnMask);
void releaseAll();
void setLeftStick(uint8_t x, uint8_t y);
void setRightStick(uint8_t x, uint8_t y);
void setHat(uint8_t hat);
void sendReport();

// 按钮位映射 — HORIPAD S USB HID 标准位序。
// USB HID 报告格式: byte0=buttons[0:7], byte1=buttons[8:13]+pad。
// 注意与 Nintendo 经典蓝牙 HID 的位序不同（蓝牙: B=0,A=1,Y=2,X=3）。
// 修复记录: commit 7295e6f — 将 A/B/X/Y 从蓝牙位序修正为 HORIPAD S 标准位序。
enum {
    BTN_Y       = 0,  BTN_B       = 1,
    BTN_A       = 2,  BTN_X       = 3,
    BTN_L       = 4,  BTN_R       = 5,
    BTN_ZL      = 6,  BTN_ZR      = 7,
    BTN_MINUS   = 8,  BTN_PLUS    = 9,
    BTN_L3      = 10, BTN_R3      = 11,
    BTN_HOME    = 12, BTN_CAPTURE = 13,
};

enum {
    HAT_CENTER   = 8,  HAT_UP       = 0,
    HAT_UP_RIGHT = 1,  HAT_RIGHT    = 2,
    HAT_DOWN_RIGHT = 3, HAT_DOWN    = 4,
    HAT_DOWN_LEFT  = 5, HAT_LEFT    = 6,
    HAT_UP_LEFT  = 7,
};

constexpr uint8_t STICK_CENTER = 128;

}
