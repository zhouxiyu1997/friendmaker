#pragma once

#include <Arduino.h>

constexpr uint32_t SERIAL_BAUD_RATE = 115200;
constexpr uint16_t HOME_DURATION_MS = 1500;
constexpr uint16_t CELL_MOVE_DURATION_MS = 80;
constexpr uint16_t INPUT_DELAY_MS = 40;
constexpr uint16_t BUTTON_PRESS_DURATION_MS = 60;
constexpr uint16_t MIN_INPUT_DELAY_MS = 20;
constexpr uint16_t MAX_INPUT_DELAY_MS = 300;
constexpr uint16_t MIN_BUTTON_PRESS_DURATION_MS = 20;
constexpr uint16_t MAX_BUTTON_PRESS_DURATION_MS = 500;
constexpr uint16_t MIN_HOME_DURATION_MS = 500;
constexpr uint16_t MAX_HOME_DURATION_MS = 5000;
constexpr uint16_t HID_REPORT_ACK_TIMEOUT_MS = 750;
constexpr uint8_t COLOR_PALETTE_SLOT_COUNT = 9;
constexpr uint8_t COLOR_PALETTE_RESET_TO_BOTTOM_STEPS = 18;
constexpr uint16_t COLOR_PALETTE_MENU_OPEN_SETTLE_MS = 180;
constexpr uint16_t COLOR_PALETTE_MENU_PRESS_DURATION_MS = 90;
constexpr uint16_t COLOR_PALETTE_MENU_INPUT_DELAY_MS = 90;
constexpr uint16_t COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS = 180;
constexpr uint8_t COLOR_PALETTE_EDITOR_HUE_RESET_STEPS = 24;
constexpr uint8_t COLOR_PALETTE_EDITOR_HUE_STEP_COUNT = 48;
constexpr uint8_t COLOR_PALETTE_EDITOR_SATURATION_STEP_COUNT = 32;
constexpr uint8_t COLOR_PALETTE_EDITOR_VALUE_STEP_COUNT = 32;
constexpr uint16_t COLOR_PALETTE_EDITOR_RESET_STICK_HOLD_MS = 900;
constexpr uint16_t COLOR_PALETTE_EDITOR_MOVE_STEP_MS = 20;
constexpr uint8_t BASIC_COLOR_GRID_ROWS = 7;
constexpr uint8_t BASIC_COLOR_GRID_COLS = 12;
constexpr uint16_t BASIC_COLOR_TAB_SETTLE_MS = 140;
constexpr uint8_t BASIC_COLOR_ANCHOR_ROW = 0;
constexpr uint8_t BASIC_COLOR_ANCHOR_COL = 0;
constexpr uint8_t BASIC_COLOR_INITIAL_SLOT_ROWS[COLOR_PALETTE_SLOT_COUNT] = {6, 0, 3, 3, 3, 3, 3, 3, 3};
constexpr uint8_t BASIC_COLOR_INITIAL_SLOT_COLS[COLOR_PALETTE_SLOT_COUNT] = {0, 0, 10, 9, 8, 6, 5, 2, 1};
constexpr char FIRMWARE_NAME[] = "switch-auto-draw";
constexpr char BOARD_FAMILY[] = "esp32-classic";
constexpr char BT_DEVICE_NAME[] = "Pro Controller";
constexpr char BT_DEVICE_PROVIDER[] = "Nintendo";
constexpr char BT_DEVICE_DESCRIPTION[] = "Gamepad";
constexpr uint8_t BT_PAIR_PIN_LENGTH = 4;
constexpr char BT_PAIR_PIN[] = "1234";
constexpr uint8_t GAMEPAD_REPORT_ID = 1;

#if defined(SWITCH_AUTO_DRAW_USE_CLASSIC_BT)
constexpr char CONTROL_TRANSPORT[] = "classic-bt-uartswitchcon";
constexpr bool USE_MOCK_CONTROLLER = false;
#else
constexpr char CONTROL_TRANSPORT[] = "mock-classic-bt";
constexpr bool USE_MOCK_CONTROLLER = true;
#endif
