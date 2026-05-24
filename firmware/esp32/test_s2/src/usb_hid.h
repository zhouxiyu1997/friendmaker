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

enum {
    BTN_B       = 0,  BTN_A       = 1,
    BTN_Y       = 2,  BTN_X       = 3,
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
