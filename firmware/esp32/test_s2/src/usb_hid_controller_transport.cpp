#include "usb_hid_controller_transport.h"

#include <tusb.h>

#include "config.h"
#include "usb_hid.h"

extern void addLog(const char *fmt, ...);

void UsbHidControllerTransport::begin() {
  addLog("TRANSPORT begin usb-hid");
}

uint16_t UsbHidControllerTransport::mapControllerButtonsToUsbHid(uint32_t controllerMask) {
  uint16_t result = 0;
  if (controllerMask & (1ul << 0))  result |= (1u << UsbHid::BTN_A);
  if (controllerMask & (1ul << 1))  result |= (1u << UsbHid::BTN_B);
  if (controllerMask & (1ul << 2))  result |= (1u << UsbHid::BTN_X);
  if (controllerMask & (1ul << 3))  result |= (1u << UsbHid::BTN_Y);
  if (controllerMask & (1ul << 4))  result |= (1u << UsbHid::BTN_L);
  if (controllerMask & (1ul << 5))  result |= (1u << UsbHid::BTN_R);
  if (controllerMask & (1ul << 6))  result |= (1u << UsbHid::BTN_ZL);
  if (controllerMask & (1ul << 7))  result |= (1u << UsbHid::BTN_ZR);
  if (controllerMask & (1ul << 8))  result |= (1u << UsbHid::BTN_PLUS);
  if (controllerMask & (1ul << 9))  result |= (1u << UsbHid::BTN_MINUS);
  if (controllerMask & (1ul << 10)) result |= (1u << UsbHid::BTN_HOME);
  if (controllerMask & (1ul << 11)) result |= (1u << UsbHid::BTN_CAPTURE);
  if (controllerMask & (1ul << 12)) result |= (1u << UsbHid::BTN_L3);
  if (controllerMask & (1ul << 13)) result |= (1u << UsbHid::BTN_R3);
  return result;
}

uint8_t UsbHidControllerTransport::hatFromDpadMask(uint32_t controllerMask) {
  if (controllerMask & (1ul << 14)) return UsbHid::HAT_UP;
  if (controllerMask & (1ul << 15)) return UsbHid::HAT_DOWN;
  if (controllerMask & (1ul << 16)) return UsbHid::HAT_LEFT;
  if (controllerMask & (1ul << 17)) return UsbHid::HAT_RIGHT;
  return UsbHid::HAT_CENTER;
}

bool UsbHidControllerTransport::pressButtons(
    uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) {
  const uint32_t dpadMask = buttonsMask & 0x3C000UL;
  const uint32_t nonDpadMask = buttonsMask & ~0x3C000UL;

  const uint16_t usbButtons = mapControllerButtonsToUsbHid(nonDpadMask);
  const uint8_t hat = hatFromDpadMask(dpadMask);

  const unsigned long t0 = millis();
  addLog("HID btn mask=0x%08lx usb=0x%04x hat=%u hold=%u settle=%u",
         buttonsMask, usbButtons, hat, holdMs, settleMs);

  UsbHid::pressButtons(usbButtons);
  UsbHid::setHat(hat);
  UsbHid::sendReport();
  delay(holdMs);
  UsbHid::releaseAll();
  UsbHid::sendReport();
  delay(settleMs);

  const unsigned long elapsed = millis() - t0;
  addLog("HID btn done elapsed=%lums", elapsed);
  return true;
}

bool UsbHidControllerTransport::pressButtonsReliable(
    uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) {
  addLog("HID btn_reliable mask=0x%08lx hold=%u settle=%u", buttonsMask, holdMs, settleMs);
  return pressButtons(buttonsMask, holdMs, settleMs);
}

bool UsbHidControllerTransport::moveDirection(
    int x, int y, uint16_t holdMs, uint16_t settleMs) {
  const uint8_t sx = (x < 0) ? 0 : ((x > 0) ? 255 : 128);
  const uint8_t sy = (y < 0) ? 0 : ((y > 0) ? 255 : 128);

  const unsigned long t0 = millis();
  addLog("HID stick dir=(%d,%d) raw=(%u,%u) hold=%u settle=%u",
         x, y, sx, sy, holdMs, settleMs);

  UsbHid::setLeftStick(sx, sy);
  UsbHid::sendReport();
  delay(holdMs);
  UsbHid::setLeftStick(128, 128);
  UsbHid::sendReport();
  delay(settleMs);

  const unsigned long elapsed = millis() - t0;
  addLog("HID stick done elapsed=%lums", elapsed);
  return true;
}

bool UsbHidControllerTransport::resetConnection(bool reconnectLastPeer) {
  (void)reconnectLastPeer;
  addLog("HID reset_connection usb-nop");
  return true;
}

bool UsbHidControllerTransport::clearStoredPeer() {
  addLog("HID clear_peer usb-nop");
  return true;
}

void UsbHidControllerTransport::printStatus(Print &output) const {
  output.println("INFO usb-hid transport active");
}

const char *UsbHidControllerTransport::name() const {
  return CONTROL_TRANSPORT;
}
