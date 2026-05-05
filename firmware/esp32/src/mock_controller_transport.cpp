#include "mock_controller_transport.h"

#include "config.h"

void MockControllerTransport::begin() {}

bool MockControllerTransport::pressButtons(
    uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) {
  (void)buttonsMask;
  delay(holdMs);
  delay(settleMs);
  return true;
}

bool MockControllerTransport::moveDirection(
    int x, int y, uint16_t holdMs, uint16_t settleMs) {
  (void)x;
  (void)y;
  delay(holdMs);
  delay(settleMs);
  return true;
}

bool MockControllerTransport::resetConnection(bool reconnectLastPeer) {
  (void)reconnectLastPeer;
  return true;
}

bool MockControllerTransport::configureBluetoothProfile(const String &profileName) {
  (void)profileName;
  return true;
}

bool MockControllerTransport::clearBluetoothPairing() { return true; }

void MockControllerTransport::printStatus(Print &output) const {
  output.print("INFO transport=");
  output.println(name());
  output.println("INFO bt_mode=mock");
  output.println("INFO bt_profile_mode=auto");
  output.println("INFO bt_active_profile=mock");
  output.println("INFO bt_base_mac=mock");
  output.println("INFO bt_bonded_devices=0");
  output.println("INFO connected=false");
}

const char *MockControllerTransport::name() const { return CONTROL_TRANSPORT; }
