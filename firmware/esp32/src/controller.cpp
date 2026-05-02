#include "controller.h"

#include <math.h>

#include "config.h"

namespace {

struct HsvColor {
  float hue;
  float saturation;
  float value;
};

int clampPaletteSlotIndex(int index) {
  if (index < 0) {
    return 0;
  }

  if (index >= COLOR_PALETTE_SLOT_COUNT) {
    return COLOR_PALETTE_SLOT_COUNT - 1;
  }

  return index;
}

uint8_t clampBasicColorRow(int row) {
  if (row < 0) {
    return 0;
  }

  if (row >= BASIC_COLOR_GRID_ROWS) {
    return BASIC_COLOR_GRID_ROWS - 1;
  }

  return static_cast<uint8_t>(row);
}

uint8_t clampBasicColorCol(int col) {
  if (col < 0) {
    return 0;
  }

  if (col >= BASIC_COLOR_GRID_COLS) {
    return BASIC_COLOR_GRID_COLS - 1;
  }

  return static_cast<uint8_t>(col);
}

int basicColorDelta(uint8_t currentValue, uint8_t targetValue) {
  return static_cast<int>(targetValue) - static_cast<int>(currentValue);
}

uint8_t scaleChannelToSteps(float value, uint8_t steps) {
  if (steps == 0) {
    return 0;
  }

  const float clamped = value < 0.0f ? 0.0f : (value > 1.0f ? 1.0f : value);
  return static_cast<uint8_t>(roundf(clamped * steps));
}

HsvColor rgbToHsv(uint8_t red, uint8_t green, uint8_t blue) {
  const float r = static_cast<float>(red) / 255.0f;
  const float g = static_cast<float>(green) / 255.0f;
  const float b = static_cast<float>(blue) / 255.0f;

  const float maxChannel = fmaxf(r, fmaxf(g, b));
  const float minChannel = fminf(r, fminf(g, b));
  const float delta = maxChannel - minChannel;

  float hue = 0.0f;

  if (delta > 0.0f) {
    if (maxChannel == r) {
      hue = 60.0f * fmodf(((g - b) / delta), 6.0f);
    } else if (maxChannel == g) {
      hue = 60.0f * (((b - r) / delta) + 2.0f);
    } else {
      hue = 60.0f * (((r - g) / delta) + 4.0f);
    }
  }

  if (hue < 0.0f) {
    hue += 360.0f;
  }

  return {
      hue,
      maxChannel <= 0.0f ? 0.0f : delta / maxChannel,
      maxChannel,
  };
}

bool pressPaletteMenuButton(ControllerTransport &transport, ControllerButton button) {
  return transport.pressButton(
      button, COLOR_PALETTE_MENU_PRESS_DURATION_MS, COLOR_PALETTE_MENU_INPUT_DELAY_MS);
}

}  // namespace

SwitchController::SwitchController(ControllerTransport &transport) : transport_(transport) {}

void SwitchController::begin() {
  transport_.begin();
  resetBasicPaletteTracking();
}

void SwitchController::waitUntilReady() const {
  while (paused_) {
    delay(10);
  }
}

bool SwitchController::moveHome() {
  waitUntilReady();
  if (!transport_.moveDirection(-1, 0, homeDurationMs_, inputDelayMs_)) {
    return false;
  }

  return transport_.moveDirection(0, -1, homeDurationMs_, inputDelayMs_);
}

bool SwitchController::moveCursor(int dx, int dy) {
  waitUntilReady();

  const ControllerButton horizontalButton = dx < 0 ? ControllerButton::DpadLeft : ControllerButton::DpadRight;
  const ControllerButton verticalButton = dy < 0 ? ControllerButton::DpadUp : ControllerButton::DpadDown;

  for (int index = 0; index < abs(dx); index += 1) {
    if (!transport_.pressButton(horizontalButton, buttonPressMs_, inputDelayMs_)) {
      return false;
    }
  }

  for (int index = 0; index < abs(dy); index += 1) {
    if (!transport_.pressButton(verticalButton, buttonPressMs_, inputDelayMs_)) {
      return false;
    }
  }

  return true;
}

bool SwitchController::drawStroke() {
  waitUntilReady();
  return transport_.pressButton(ControllerButton::A, buttonPressMs_, inputDelayMs_);
}

bool SwitchController::pressButton(ControllerButton button) {
  waitUntilReady();
  return transport_.pressButton(button, buttonPressMs_, inputDelayMs_);
}

bool SwitchController::holdButton(ControllerButton button, uint16_t holdMs) {
  waitUntilReady();
  return transport_.pressButton(button, holdMs, inputDelayMs_);
}

bool SwitchController::tapButton(ControllerButton button, uint16_t count) {
  waitUntilReady();

  for (uint16_t step = 0; step < count; step += 1) {
    if (!transport_.pressButton(button, buttonPressMs_, inputDelayMs_)) {
      return false;
    }
  }

  return true;
}

bool SwitchController::pressButtons(uint32_t buttonsMask) {
  waitUntilReady();
  return transport_.pressButtons(buttonsMask, buttonPressMs_, inputDelayMs_);
}

void SwitchController::resetBasicPaletteTracking() {
  for (uint8_t slot = 0; slot < COLOR_PALETTE_SLOT_COUNT; slot += 1) {
    basicPaletteSlotRows_[slot] = BASIC_COLOR_INITIAL_SLOT_ROWS[slot];
    basicPaletteSlotCols_[slot] = BASIC_COLOR_INITIAL_SLOT_COLS[slot];
  }

  basicPaletteTrackingReady_ = true;
}

bool SwitchController::selectColor(int index) {
  waitUntilReady();
  const int slotIndex = clampPaletteSlotIndex(index);

  // Drawing page flow:
  // 1. Y opens the palette selector.
  // 2. The selector has extra non-palette entries above the 9 palette slots,
  //    so we normalize by pushing all the way to the bottom palette slot first.
  // 3. Up moves back to the requested palette slot.
  // 3. A applies the current slot.
  // 4. B closes the palette selector and returns to drawing.
  if (!transport_.pressButton(ControllerButton::Y, buttonPressMs_, inputDelayMs_)) {
    return false;
  }
  delay(COLOR_PALETTE_MENU_OPEN_SETTLE_MS);

  for (int step = 0; step < COLOR_PALETTE_RESET_TO_BOTTOM_STEPS; step += 1) {
    if (!pressPaletteMenuButton(transport_, ControllerButton::DpadDown)) {
      return false;
    }
  }

  for (int step = 0; step < (COLOR_PALETTE_SLOT_COUNT - 1 - slotIndex); step += 1) {
    if (!pressPaletteMenuButton(transport_, ControllerButton::DpadUp)) {
      return false;
    }
  }

  if (!pressPaletteMenuButton(transport_, ControllerButton::A)) {
    return false;
  }

  if (!pressPaletteMenuButton(transport_, ControllerButton::B)) {
    return false;
  }

  delay(inputDelayMs_);
  return true;
}

bool SwitchController::configurePaletteSlot(int index, uint8_t red, uint8_t green, uint8_t blue) {
  waitUntilReady();

  const int slotIndex = clampPaletteSlotIndex(index);
  const HsvColor hsv = rgbToHsv(red, green, blue);
  const uint8_t hueSteps =
      static_cast<uint8_t>(roundf((hsv.hue / 360.0f) * COLOR_PALETTE_EDITOR_HUE_STEP_COUNT));
  const uint8_t saturationSteps =
      scaleChannelToSteps(hsv.saturation, COLOR_PALETTE_EDITOR_SATURATION_STEP_COUNT);
  const uint8_t valueSteps = scaleChannelToSteps(hsv.value, COLOR_PALETTE_EDITOR_VALUE_STEP_COUNT);

  // Palette selection page.
  if (!transport_.pressButton(ControllerButton::Y, buttonPressMs_, inputDelayMs_)) {
    return false;
  }
  delay(COLOR_PALETTE_MENU_OPEN_SETTLE_MS);

  for (int step = 0; step < COLOR_PALETTE_RESET_TO_BOTTOM_STEPS; step += 1) {
    if (!pressPaletteMenuButton(transport_, ControllerButton::DpadDown)) {
      return false;
    }
  }

  for (int step = 0; step < (COLOR_PALETTE_SLOT_COUNT - 1 - slotIndex); step += 1) {
    if (!pressPaletteMenuButton(transport_, ControllerButton::DpadUp)) {
      return false;
    }
  }

  // Enter palette editor for the current slot.
  if (!pressPaletteMenuButton(transport_, ControllerButton::Y)) {
    return false;
  }
  delay(COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS);

  // Reset the editor state so every slot starts from the same origin:
  // move the analog cursor to the bottom-left of the color square and
  // drive the hue slider back to its left-most stop.
  if (!transport_.moveDirection(-1, 1, COLOR_PALETTE_EDITOR_RESET_STICK_HOLD_MS, inputDelayMs_)) {
    return false;
  }

  for (int step = 0; step < COLOR_PALETTE_EDITOR_HUE_RESET_STEPS; step += 1) {
    if (!transport_.pressButton(ControllerButton::ZL, buttonPressMs_, inputDelayMs_)) {
      return false;
    }
  }

  for (int step = 0; step < hueSteps; step += 1) {
    if (!transport_.pressButton(ControllerButton::ZR, buttonPressMs_, inputDelayMs_)) {
      return false;
    }
  }

  if (saturationSteps > 0) {
    if (!transport_.moveDirection(
            1, 0, static_cast<uint16_t>(saturationSteps) * COLOR_PALETTE_EDITOR_MOVE_STEP_MS, inputDelayMs_)) {
      return false;
    }
  }

  if (valueSteps > 0) {
    if (!transport_.moveDirection(
            0, -1, static_cast<uint16_t>(valueSteps) * COLOR_PALETTE_EDITOR_MOVE_STEP_MS, inputDelayMs_)) {
      return false;
    }
  }

  // Exit editor, apply the slot, then go back to drawing mode.
  if (!transport_.pressButton(ControllerButton::B, buttonPressMs_, inputDelayMs_)) {
    return false;
  }

  if (!transport_.pressButton(ControllerButton::A, buttonPressMs_, inputDelayMs_)) {
    return false;
  }

  if (!transport_.pressButton(ControllerButton::B, buttonPressMs_, inputDelayMs_)) {
    return false;
  }

  delay(inputDelayMs_);
  return true;
}

bool SwitchController::configureBasicPaletteSlot(int index, uint8_t row, uint8_t col) {
  waitUntilReady();

  const int slotIndex = clampPaletteSlotIndex(index);
  const uint8_t targetRow = clampBasicColorRow(row);
  const uint8_t targetCol = clampBasicColorCol(col);
  const uint8_t currentRow = basicPaletteTrackingReady_ ? basicPaletteSlotRows_[slotIndex] : BASIC_COLOR_INITIAL_SLOT_ROWS[slotIndex];
  const uint8_t currentCol = basicPaletteTrackingReady_ ? basicPaletteSlotCols_[slotIndex] : BASIC_COLOR_INITIAL_SLOT_COLS[slotIndex];
  const int rowDelta = basicColorDelta(currentRow, targetRow);
  const int colDelta = basicColorDelta(currentCol, targetCol);

  if (!transport_.pressButton(ControllerButton::Y, buttonPressMs_, inputDelayMs_)) {
    return false;
  }
  delay(COLOR_PALETTE_MENU_OPEN_SETTLE_MS);

  for (int step = 0; step < COLOR_PALETTE_RESET_TO_BOTTOM_STEPS; step += 1) {
    if (!pressPaletteMenuButton(transport_, ControllerButton::DpadDown)) {
      return false;
    }
  }

  for (int step = 0; step < (COLOR_PALETTE_SLOT_COUNT - 1 - slotIndex); step += 1) {
    if (!pressPaletteMenuButton(transport_, ControllerButton::DpadUp)) {
      return false;
    }
  }

  if (!pressPaletteMenuButton(transport_, ControllerButton::Y)) {
    return false;
  }
  delay(COLOR_PALETTE_EDITOR_OPEN_SETTLE_MS);

  // Keep track of each slot's current row/column and move by direct deltas.
  // We intentionally do not treat the basic-color page as a circular grid,
  // because some game states can expose extra swatches outside the regular
  // 7x12 arrangement and wrap-around assumptions become unsafe.
  if (!pressPaletteMenuButton(transport_, ControllerButton::L)) {
    return false;
  }
  delay(BASIC_COLOR_TAB_SETTLE_MS);

  const ControllerButton verticalButton = rowDelta < 0 ? ControllerButton::DpadUp : ControllerButton::DpadDown;
  const ControllerButton horizontalButton = colDelta < 0 ? ControllerButton::DpadLeft : ControllerButton::DpadRight;

  for (int step = 0; step < abs(rowDelta); step += 1) {
    if (!pressPaletteMenuButton(transport_, verticalButton)) {
      return false;
    }
  }

  for (int step = 0; step < abs(colDelta); step += 1) {
    if (!pressPaletteMenuButton(transport_, horizontalButton)) {
      return false;
    }
  }

  // In the basic-color picker, pressing A on the target swatch immediately
  // applies the color and returns to the canvas.
  if (!pressPaletteMenuButton(transport_, ControllerButton::A)) {
    return false;
  }

  basicPaletteSlotRows_[slotIndex] = targetRow;
  basicPaletteSlotCols_[slotIndex] = targetCol;
  basicPaletteTrackingReady_ = true;
  delay(inputDelayMs_);
  return true;
}

bool SwitchController::configureInputTiming(
    uint16_t buttonPressMs, uint16_t inputDelayMs, uint16_t homeMs) {
  if (buttonPressMs < MIN_BUTTON_PRESS_DURATION_MS || buttonPressMs > MAX_BUTTON_PRESS_DURATION_MS ||
      inputDelayMs < MIN_INPUT_DELAY_MS || inputDelayMs > MAX_INPUT_DELAY_MS ||
      homeMs < MIN_HOME_DURATION_MS || homeMs > MAX_HOME_DURATION_MS) {
    return false;
  }

  buttonPressMs_ = buttonPressMs;
  inputDelayMs_ = inputDelayMs;
  homeDurationMs_ = homeMs;
  return true;
}

bool SwitchController::resetBluetooth() {
  waitUntilReady();
  return transport_.resetConnection();
}

void SwitchController::pause() { paused_ = true; }

void SwitchController::resume() { paused_ = false; }

void SwitchController::end() { paused_ = false; }

void SwitchController::printTransportStatus(Print &output) const {
  transport_.printStatus(output);
}

const char *SwitchController::transportName() const { return transport_.name(); }
