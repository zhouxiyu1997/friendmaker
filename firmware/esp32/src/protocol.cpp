#include "protocol.h"

namespace {

ControllerButton parseButton(const String &line, bool &ok);

bool parseTwoInts(const String &value, int &first, int &second) {
  const int firstSpace = value.indexOf(' ');
  if (firstSpace < 0) {
    return false;
  }

  const int secondSpace = value.indexOf(' ', firstSpace + 1);
  if (secondSpace < 0) {
    return false;
  }

  first = value.substring(firstSpace + 1, secondSpace).toInt();
  second = value.substring(secondSpace + 1).toInt();
  return true;
}

bool parseOneInt(const String &value, int &result) {
  const int firstSpace = value.indexOf(' ');
  if (firstSpace < 0) {
    return false;
  }

  result = value.substring(firstSpace + 1).toInt();
  return true;
}

bool parseInputConfigCommand(
    const String &line, uint16_t &buttonPressMs, uint16_t &inputDelayMs, uint16_t &homeMs) {
  if (!line.startsWith("CFG INPUT ")) {
    return false;
  }

  const int secondSpace = line.indexOf(' ', 4);
  const int thirdSpace = line.indexOf(' ', secondSpace + 1);
  const int fourthSpace = line.indexOf(' ', thirdSpace + 1);

  if (secondSpace < 0 || thirdSpace < 0 || fourthSpace < 0) {
    return false;
  }

  const int parsedButtonPressMs = line.substring(secondSpace + 1, thirdSpace).toInt();
  const int parsedInputDelayMs = line.substring(thirdSpace + 1, fourthSpace).toInt();
  const int parsedHomeMs = line.substring(fourthSpace + 1).toInt();

  if (parsedButtonPressMs <= 0 || parsedInputDelayMs <= 0 || parsedHomeMs <= 0 ||
      parsedButtonPressMs > UINT16_MAX || parsedInputDelayMs > UINT16_MAX ||
      parsedHomeMs > UINT16_MAX) {
    return false;
  }

  buttonPressMs = static_cast<uint16_t>(parsedButtonPressMs);
  inputDelayMs = static_cast<uint16_t>(parsedInputDelayMs);
  homeMs = static_cast<uint16_t>(parsedHomeMs);
  return true;
}

bool failControllerInput(String &error) {
  error = "controller input report failed";
  return false;
}

bool parseHexColorToken(const String &value, uint8_t &red, uint8_t &green, uint8_t &blue) {
  String token = value;
  token.trim();

  if (token.startsWith("#")) {
    token = token.substring(1);
  }

  if (token.length() != 6) {
    return false;
  }

  const long parsed = strtol(token.c_str(), nullptr, 16);
  red = static_cast<uint8_t>((parsed >> 16) & 0xFF);
  green = static_cast<uint8_t>((parsed >> 8) & 0xFF);
  blue = static_cast<uint8_t>(parsed & 0xFF);
  return true;
}

bool parsePaletteConfigCommand(
    const String &line, int &slotIndex, uint8_t &red, uint8_t &green, uint8_t &blue) {
  if (!line.startsWith("PC ")) {
    return false;
  }

  const int firstSpace = line.indexOf(' ');
  const int secondSpace = line.indexOf(' ', firstSpace + 1);

  if (secondSpace < 0) {
    return false;
  }

  slotIndex = line.substring(firstSpace + 1, secondSpace).toInt();
  return parseHexColorToken(line.substring(secondSpace + 1), red, green, blue);
}

bool parseBasicColorConfigCommand(const String &line, int &slotIndex, int &row, int &col) {
  if (!line.startsWith("BC ")) {
    return false;
  }

  const int firstSpace = line.indexOf(' ');
  const int secondSpace = line.indexOf(' ', firstSpace + 1);
  const int thirdSpace = line.indexOf(' ', secondSpace + 1);

  if (secondSpace < 0 || thirdSpace < 0) {
    return false;
  }

  slotIndex = line.substring(firstSpace + 1, secondSpace).toInt();
  row = line.substring(secondSpace + 1, thirdSpace).toInt();
  col = line.substring(thirdSpace + 1).toInt();
  return true;
}

bool isBasicColorResetCommand(const String &line) { return line == "BC RESET"; }

bool parseHoldButtonCommand(const String &line, ControllerButton &button, uint16_t &holdMs) {
  if (!line.startsWith("HOLD ")) {
    return false;
  }

  const int firstSpace = line.indexOf(' ');
  const int secondSpace = line.indexOf(' ', firstSpace + 1);

  if (secondSpace < 0) {
    return false;
  }

  bool ok = false;
  button = parseButton(line.substring(firstSpace + 1, secondSpace), ok);

  if (!ok) {
    return false;
  }

  const int parsed = line.substring(secondSpace + 1).toInt();

  if (parsed <= 0 || parsed > 60000) {
    return false;
  }

  holdMs = static_cast<uint16_t>(parsed);
  return true;
}

bool parseTapButtonCommand(const String &line, ControllerButton &button, uint16_t &count) {
  if (!line.startsWith("TAP ")) {
    return false;
  }

  const int firstSpace = line.indexOf(' ');
  const int secondSpace = line.indexOf(' ', firstSpace + 1);

  if (secondSpace < 0) {
    return false;
  }

  bool ok = false;
  button = parseButton(line.substring(firstSpace + 1, secondSpace), ok);

  if (!ok) {
    return false;
  }

  const int parsed = line.substring(secondSpace + 1).toInt();

  if (parsed <= 0 || parsed > 2000) {
    return false;
  }

  count = static_cast<uint16_t>(parsed);
  return true;
}

ControllerButton parseButton(const String &line, bool &ok) {
  ok = true;

  if (line == "A") {
    return ControllerButton::A;
  }

  if (line == "B") {
    return ControllerButton::B;
  }

  if (line == "X") {
    return ControllerButton::X;
  }

  if (line == "Y") {
    return ControllerButton::Y;
  }

  if (line == "L") {
    return ControllerButton::L;
  }

  if (line == "R") {
    return ControllerButton::R;
  }

  if (line == "ZL") {
    return ControllerButton::ZL;
  }

  if (line == "ZR") {
    return ControllerButton::ZR;
  }

  if (line == "+" || line == "PLUS") {
    return ControllerButton::Plus;
  }

  if (line == "-" || line == "MINUS") {
    return ControllerButton::Minus;
  }

  if (line == "HOME") {
    return ControllerButton::Home;
  }

  if (line == "CAPTURE" || line == "CAP") {
    return ControllerButton::Capture;
  }

  if (line == "LS" || line == "L3") {
    return ControllerButton::LStick;
  }

  if (line == "RS" || line == "R3") {
    return ControllerButton::RStick;
  }

  if (line == "DUP" || line == "UP") {
    return ControllerButton::DpadUp;
  }

  if (line == "DDOWN" || line == "DOWN") {
    return ControllerButton::DpadDown;
  }

  if (line == "DLEFT" || line == "LEFT") {
    return ControllerButton::DpadLeft;
  }

  if (line == "DRIGHT" || line == "RIGHT") {
    return ControllerButton::DpadRight;
  }

  ok = false;
  return ControllerButton::A;
}

bool parseButtonCommand(
    const String &line, ControllerButton &button, uint32_t &buttonsMask, bool &isCombo) {
  if (!line.startsWith("BTN ")) {
    return false;
  }

  const String token = line.substring(4);

  if (token == "LR" || token == "L+R") {
    buttonsMask =
        controllerButtonMask(ControllerButton::L) | controllerButtonMask(ControllerButton::R);
    isCombo = true;
    return true;
  }

  bool ok = false;
  button = parseButton(token, ok);

  if (!ok) {
    return false;
  }

  buttonsMask = controllerButtonMask(button);
  isCombo = false;
  return true;
}

const char *buttonName(ControllerButton button) {
  switch (button) {
    case ControllerButton::A:
      return "A";
    case ControllerButton::B:
      return "B";
    case ControllerButton::X:
      return "X";
    case ControllerButton::Y:
      return "Y";
    case ControllerButton::L:
      return "L";
    case ControllerButton::R:
      return "R";
    case ControllerButton::ZL:
      return "ZL";
    case ControllerButton::ZR:
      return "ZR";
    case ControllerButton::Plus:
      return "PLUS";
    case ControllerButton::Minus:
      return "MINUS";
    case ControllerButton::Home:
      return "HOME";
    case ControllerButton::Capture:
      return "CAPTURE";
    case ControllerButton::LStick:
      return "LS";
    case ControllerButton::RStick:
      return "RS";
    case ControllerButton::DpadUp:
      return "DUP";
    case ControllerButton::DpadDown:
      return "DDOWN";
    case ControllerButton::DpadLeft:
      return "DLEFT";
    case ControllerButton::DpadRight:
      return "DRIGHT";
    default:
      return "?";
  }
}

}  // namespace

bool executeCommand(const String &line, SwitchController &controller, String &error) {
  if (line.length() == 0) {
    return true;
  }

  if (line == "I") {
    Serial.printf("INFO transport=%s\n", controller.transportName());
    controller.printTransportStatus(Serial);
    return true;
  }

  if (line == "BT RESET") {
    if (!controller.resetBluetooth()) {
      error = "bt reset failed";
      return false;
    }

    Serial.println("INFO action=bt-reset");
    return true;
  }

  uint16_t configButtonPressMs = 0;
  uint16_t configInputDelayMs = 0;
  uint16_t configHomeMs = 0;

  if (parseInputConfigCommand(line, configButtonPressMs, configInputDelayMs, configHomeMs)) {
    if (!controller.configureInputTiming(configButtonPressMs, configInputDelayMs, configHomeMs)) {
      error = "invalid timing config";
      return false;
    }

    Serial.printf(
        "INFO action=input-config buttonPressMs=%u inputDelayMs=%u homeMs=%u\n",
        configButtonPressMs,
        configInputDelayMs,
        configHomeMs);
    return true;
  }

  if (line.startsWith("CFG INPUT ")) {
    error = "invalid timing config";
    return false;
  }

  if (line == "H") {
    if (!controller.moveHome()) {
      return failControllerInput(error);
    }

    Serial.println("INFO action=home");
    return true;
  }

  if (line == "P") {
    if (!controller.drawStroke()) {
      return failControllerInput(error);
    }

    Serial.println("INFO action=draw button=A");
    return true;
  }

  if (line == "LR" || line == "L+R") {
    if (!controller.pressButtons(controllerButtonMask(ControllerButton::L) |
                                 controllerButtonMask(ControllerButton::R))) {
      return failControllerInput(error);
    }

    Serial.println("INFO action=combo name=L+R");
    return true;
  }

  ControllerButton commandButton = ControllerButton::A;
  uint32_t commandButtonsMask = 0;
  bool isComboCommand = false;

  if (parseButtonCommand(line, commandButton, commandButtonsMask, isComboCommand)) {
    if (isComboCommand) {
      if (!controller.pressButtons(commandButtonsMask)) {
        return failControllerInput(error);
      }

      Serial.println("INFO action=combo name=L+R");
      return true;
    }

    if (!controller.pressButton(commandButton)) {
      return failControllerInput(error);
    }

    Serial.printf("INFO action=button name=%s\n", buttonName(commandButton));
    return true;
  }

  if (line == "S") {
    controller.pause();
    Serial.println("INFO action=pause");
    return true;
  }

  if (line == "R") {
    controller.resume();
    Serial.println("INFO action=resume");
    return true;
  }

  if (line == "E") {
    controller.end();
    Serial.println("INFO action=end");
    return true;
  }

  if (line.startsWith("M ")) {
    int dx = 0;
    int dy = 0;

    if (!parseTwoInts(line, dx, dy)) {
      error = "invalid move";
      return false;
    }

    if (!controller.moveCursor(dx, dy)) {
      return failControllerInput(error);
    }

    Serial.printf("INFO action=move dx=%d dy=%d\n", dx, dy);
    return true;
  }

  ControllerButton holdButton = ControllerButton::A;
  uint16_t holdMs = 0;

  if (parseHoldButtonCommand(line, holdButton, holdMs)) {
    if (!controller.holdButton(holdButton, holdMs)) {
      return failControllerInput(error);
    }

    Serial.printf("INFO action=hold button=%s ms=%u\n", buttonName(holdButton), holdMs);
    return true;
  }

  uint16_t tapCount = 0;

  if (parseTapButtonCommand(line, holdButton, tapCount)) {
    if (!controller.tapButton(holdButton, tapCount)) {
      return failControllerInput(error);
    }

    Serial.printf("INFO action=tap button=%s count=%u\n", buttonName(holdButton), tapCount);
    return true;
  }

  uint8_t paletteRed = 0;
  uint8_t paletteGreen = 0;
  uint8_t paletteBlue = 0;
  int paletteSlotIndex = 0;

  if (parsePaletteConfigCommand(line, paletteSlotIndex, paletteRed, paletteGreen, paletteBlue)) {
    if (!controller.configurePaletteSlot(paletteSlotIndex, paletteRed, paletteGreen, paletteBlue)) {
      return failControllerInput(error);
    }

    Serial.printf(
        "INFO action=palette-config slot=%d hex=#%02X%02X%02X\n",
        paletteSlotIndex,
        paletteRed,
        paletteGreen,
        paletteBlue);
    return true;
  }

  int basicColorRow = 0;
  int basicColorCol = 0;

  if (isBasicColorResetCommand(line)) {
    controller.resetBasicPaletteTracking();
    Serial.println("INFO action=basic-color-reset anchor=default-initial-slots");
    return true;
  }

  if (parseBasicColorConfigCommand(line, paletteSlotIndex, basicColorRow, basicColorCol)) {
    if (!controller.configureBasicPaletteSlot(
            paletteSlotIndex, static_cast<uint8_t>(basicColorRow), static_cast<uint8_t>(basicColorCol))) {
      return failControllerInput(error);
    }

    Serial.printf(
        "INFO action=basic-color-config slot=%d row=%d col=%d\n",
        paletteSlotIndex,
        basicColorRow,
        basicColorCol);
    return true;
  }

  if (line.startsWith("C ")) {
    int index = 0;

    if (!parseOneInt(line, index)) {
      error = "invalid color";
      return false;
    }

    if (!controller.selectColor(index)) {
      return failControllerInput(error);
    }

    Serial.printf("INFO action=color slot=%d\n", index);
    return true;
  }

  if (line.startsWith("W ")) {
    int delayMs = 0;

    if (!parseOneInt(line, delayMs)) {
      error = "invalid wait";
      return false;
    }

    delay(delayMs);
    Serial.printf("INFO action=wait ms=%d\n", delayMs);
    return true;
  }

  bool ok = false;
  const ControllerButton button = parseButton(line, ok);

  if (ok) {
    if (!controller.pressButton(button)) {
      return failControllerInput(error);
    }

    Serial.printf("INFO action=button name=%s\n", buttonName(button));
    return true;
  }

  error = "unknown command";
  return false;
}
