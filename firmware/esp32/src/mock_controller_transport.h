#pragma once

#include "controller_transport.h"

class MockControllerTransport : public ControllerTransport {
 public:
  void begin() override;
  bool pressButtons(uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) override;
  bool moveDirection(int x, int y, uint16_t holdMs, uint16_t settleMs) override;
  bool resetConnection(bool reconnectLastPeer = false) override;
  bool clearStoredPeer() override;
  void printStatus(Print &output) const override;
  const char *name() const override;
};
