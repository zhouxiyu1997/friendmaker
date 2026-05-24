#pragma once

#include <cstdint>

#include "controller_transport.h"

class UsbHidControllerTransport : public ControllerTransport {
 public:
  void begin() override;
  bool pressButtons(uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) override;
  bool pressButtonsReliable(uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) override;
  bool moveDirection(int x, int y, uint16_t holdMs, uint16_t settleMs) override;
  bool resetConnection(bool reconnectLastPeer = false) override;
  bool clearStoredPeer() override;
  void printStatus(Print &output) const override;
  const char *name() const override;

 private:
  static uint16_t mapControllerButtonsToUsbHid(uint32_t controllerMask);
  static uint8_t hatFromDpadMask(uint32_t controllerMask);
};
