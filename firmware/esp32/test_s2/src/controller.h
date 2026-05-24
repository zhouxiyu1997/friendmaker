#pragma once

#include <Arduino.h>

#include "config.h"
#include "controller_transport.h"

class SwitchController {
 public:
  explicit SwitchController(ControllerTransport &transport);

  void begin();
  void configureInputTiming(uint16_t buttonPressMs, uint16_t inputDelayMs, uint16_t homeMs);
  bool moveHome();
  bool moveCursor(int dx, int dy);
  bool moveStick(int x, int y, uint16_t holdMs);
  bool drawStroke();
  bool drawLine(int dx, int dy, uint8_t stride = 1);
  bool pressButton(ControllerButton button);
  bool holdButton(ControllerButton button, uint16_t holdMs);
  bool tapButton(ControllerButton button, uint16_t count);
  bool pressButtons(uint32_t buttonsMask);
  bool selectColor(int index);
  void resetBasicPaletteTracking();
  bool configurePaletteSlot(int index, uint8_t red, uint8_t green, uint8_t blue);
  bool configureBasicPaletteSlot(int index, uint8_t row, uint8_t col);
  bool resetBluetooth(bool reconnectLastPeer = false);
  bool clearBluetoothPeer();
  void pause();
  void resume();
  void end();
  void printTransportStatus(Print &output) const;
  const char *transportName() const;

 private:
  ControllerTransport &transport_;
  bool paused_ = false;
  uint8_t basicPaletteSlotRows_[9] = {};
  uint8_t basicPaletteSlotCols_[9] = {};
  bool basicPaletteTrackingReady_ = false;
  uint16_t buttonPressMs_ = BUTTON_PRESS_DURATION_MS;
  uint16_t inputDelayMs_ = INPUT_DELAY_MS;
  uint16_t homeMs_ = HOME_DURATION_MS;

  void waitUntilReady() const;
};
