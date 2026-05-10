#pragma once

#include <Arduino.h>

enum class ControllerButton {
  A,
  B,
  X,
  Y,
  L,
  R,
  ZL,
  ZR,
  Plus,
  Minus,
  Home,
  Capture,
  LStick,
  RStick,
  DpadUp,
  DpadDown,
  DpadLeft,
  DpadRight,
};

inline uint32_t controllerButtonMask(ControllerButton button) {
  switch (button) {
    case ControllerButton::A:
      return 1ul << 0;
    case ControllerButton::B:
      return 1ul << 1;
    case ControllerButton::X:
      return 1ul << 2;
    case ControllerButton::Y:
      return 1ul << 3;
    case ControllerButton::L:
      return 1ul << 4;
    case ControllerButton::R:
      return 1ul << 5;
    case ControllerButton::ZL:
      return 1ul << 6;
    case ControllerButton::ZR:
      return 1ul << 7;
    case ControllerButton::Plus:
      return 1ul << 8;
    case ControllerButton::Minus:
      return 1ul << 9;
    case ControllerButton::Home:
      return 1ul << 10;
    case ControllerButton::Capture:
      return 1ul << 11;
    case ControllerButton::LStick:
      return 1ul << 12;
    case ControllerButton::RStick:
      return 1ul << 13;
    case ControllerButton::DpadUp:
      return 1ul << 14;
    case ControllerButton::DpadDown:
      return 1ul << 15;
    case ControllerButton::DpadLeft:
      return 1ul << 16;
    case ControllerButton::DpadRight:
      return 1ul << 17;
    default:
      return 0;
  }
}

class ControllerTransport {
 public:
  virtual ~ControllerTransport() = default;

  virtual void begin() = 0;
  virtual bool pressButtons(uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) = 0;
  virtual bool moveDirection(int x, int y, uint16_t holdMs, uint16_t settleMs) = 0;
  virtual bool resetConnection(bool reconnectLastPeer = false) = 0;
  virtual bool clearStoredPeer() = 0;
  virtual void printStatus(Print &output) const = 0;
  virtual const char *name() const = 0;

  bool pressButton(ControllerButton button, uint16_t holdMs, uint16_t settleMs) {
    return pressButtons(controllerButtonMask(button), holdMs, settleMs);
  }
};
