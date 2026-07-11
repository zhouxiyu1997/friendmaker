#include "protocol.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

namespace {

ControllerButton parseButton(const String &line, bool &ok);

bool parseStrictIntToken(const String &token, int &result) {
  if (token.length() == 0) {
    return false;
  }

  const size_t firstDigit = token[0] == '+' || token[0] == '-' ? 1 : 0;
  if (firstDigit == token.length()) {
    return false;
  }

  for (size_t index = firstDigit; index < token.length(); index += 1) {
    if (!isdigit(static_cast<unsigned char>(token[index]))) {
      return false;
    }
  }

  char *end = nullptr;
  errno = 0;
  const long parsed = strtol(token.c_str(), &end, 10);
  if (errno == ERANGE || end == token.c_str() || *end != '\0' || parsed < INT_MIN ||
      parsed > INT_MAX) {
    return false;
  }

  result = static_cast<int>(parsed);
  return true;
}

template <size_t TokenCount>
bool parseCommandTokens(
    const String &line, const char *command, String (&tokens)[TokenCount]) {
  const size_t tokenCount = TokenCount;
  const size_t commandLength = strlen(command);
  if (line.length() <= commandLength || !line.startsWith(command) ||
      line[commandLength] != ' ') {
    return false;
  }

  int tokenStart = static_cast<int>(commandLength + 1);
  for (size_t index = 0; index < tokenCount; index += 1) {
    if (tokenStart >= static_cast<int>(line.length())) {
      return false;
    }

    const int nextSpace = line.indexOf(' ', tokenStart);
    const bool isLastToken = index + 1 == tokenCount;
    if (isLastToken) {
      if (nextSpace >= 0) {
        return false;
      }

      tokens[index] = line.substring(tokenStart);
      return tokens[index].length() > 0;
    }

    if (nextSpace <= tokenStart) {
      return false;
    }

    tokens[index] = line.substring(tokenStart, nextSpace);
    tokenStart = nextSpace + 1;
  }

  return false;
}

template <size_t TokenCount>
bool parseStrictIntCommand(
    const String &line, const char *command, int (&values)[TokenCount]) {
  String tokens[TokenCount];
  if (!parseCommandTokens(line, command, tokens)) {
    return false;
  }

  for (size_t index = 0; index < TokenCount; index += 1) {
    if (!parseStrictIntToken(tokens[index], values[index])) {
      return false;
    }
  }

  return true;
}

bool parseMoveCommand(const String &value, int &first, int &second) {
  int values[2] = {};
  if (!parseStrictIntCommand(value, "M", values)) {
    return false;
  }

  first = values[0];
  second = values[1];
  return true;
}

bool parseLineCommand(const String &value, int &dx, int &dy, uint8_t &stride) {
  int values[2] = {};
  if (parseStrictIntCommand(value, "L", values)) {
    dx = values[0];
    dy = values[1];
    stride = 1;
    return true;
  }

  int valuesWithStride[3] = {};
  if (!parseStrictIntCommand(value, "L", valuesWithStride)) {
    return false;
  }

  dx = valuesWithStride[0];
  dy = valuesWithStride[1];
  const int parsedStride = valuesWithStride[2];

  if (parsedStride <= 0 || parsedStride > 255) {
    return false;
  }

  stride = static_cast<uint8_t>(parsedStride);
  return true;
}

bool parseStickIntCommand(const String &value, int &first, int &second, int &third) {
  int values[3] = {};
  if (!parseStrictIntCommand(value, "STICK", values)) {
    return false;
  }

  first = values[0];
  second = values[1];
  third = values[2];
  return true;
}

bool parseOneInt(const String &value, const char *command, int &result) {
  int values[1] = {};
  if (!parseStrictIntCommand(value, command, values)) {
    return false;
  }

  result = values[0];
  return true;
}

bool parseInputConfigCommand(
    const String &line, uint16_t &buttonPressMs, uint16_t &inputDelayMs, uint16_t &homeMs) {
  if (!line.startsWith("CFG INPUT ")) {
    return false;
  }

  int values[3] = {};
  if (!parseStrictIntCommand(line, "CFG INPUT", values)) {
    return false;
  }

  const int buttonPress = values[0];
  const int inputDelay = values[1];
  const int home = values[2];

  if (buttonPress <= 0 || buttonPress > MAX_WAIT_DURATION_MS || inputDelay <= 0 ||
      inputDelay > MAX_WAIT_DURATION_MS || home <= 0 || home > MAX_WAIT_DURATION_MS) {
    return false;
  }

  buttonPressMs = static_cast<uint16_t>(buttonPress);
  inputDelayMs = static_cast<uint16_t>(inputDelay);
  homeMs = static_cast<uint16_t>(home);
  return true;
}

bool failControllerInput(String &error) {
  error = "controller input report failed";
  return false;
}

bool parseHexColorToken(const String &value, uint8_t &red, uint8_t &green, uint8_t &blue) {
  String token = value;

  if (token.startsWith("#")) {
    token = token.substring(1);
  }

  if (token.length() != 6) {
    return false;
  }

  for (size_t index = 0; index < token.length(); index += 1) {
    if (!isxdigit(static_cast<unsigned char>(token[index]))) {
      return false;
    }
  }

  char *end = nullptr;
  errno = 0;
  const long parsed = strtol(token.c_str(), &end, 16);
  if (errno == ERANGE || end == token.c_str() || *end != '\0') {
    return false;
  }

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

  String tokens[2];
  if (!parseCommandTokens(line, "PC", tokens) ||
      !parseStrictIntToken(tokens[0], slotIndex)) {
    return false;
  }

  return parseHexColorToken(tokens[1], red, green, blue);
}

bool parseBasicColorConfigCommand(const String &line, int &slotIndex, int &row, int &col) {
  if (!line.startsWith("BC ")) {
    return false;
  }

  int values[3] = {};
  if (!parseStrictIntCommand(line, "BC", values)) {
    return false;
  }

  slotIndex = values[0];
  row = values[1];
  col = values[2];
  return true;
}

bool isBasicColorResetCommand(const String &line) { return line == "BC RESET"; }

bool parseStickCommand(const String &line, int &x, int &y, uint16_t &holdMs) {
  if (!line.startsWith("STICK ")) {
    return false;
  }

  int parsedHoldMs = 0;
  if (!parseStickIntCommand(line, x, y, parsedHoldMs)) {
    return false;
  }

  if (x < -1 || x > 1 || y < -1 || y > 1 || (x == 0 && y == 0)) {
    return false;
  }

  if (parsedHoldMs <= 0 || parsedHoldMs > MAX_WAIT_DURATION_MS) {
    return false;
  }

  holdMs = static_cast<uint16_t>(parsedHoldMs);
  return true;
}

bool parseHoldButtonCommand(const String &line, ControllerButton &button, uint16_t &holdMs) {
  if (!line.startsWith("HOLD ")) {
    return false;
  }

  String tokens[2];
  if (!parseCommandTokens(line, "HOLD", tokens)) {
    return false;
  }

  bool ok = false;
  button = parseButton(tokens[0], ok);

  if (!ok) {
    return false;
  }

  int parsed = 0;
  if (!parseStrictIntToken(tokens[1], parsed)) {
    return false;
  }

  if (parsed <= 0 || parsed > MAX_WAIT_DURATION_MS) {
    return false;
  }

  holdMs = static_cast<uint16_t>(parsed);
  return true;
}

bool parseTapButtonCommand(const String &line, ControllerButton &button, uint16_t &count) {
  if (!line.startsWith("TAP ")) {
    return false;
  }

  String tokens[2];
  if (!parseCommandTokens(line, "TAP", tokens)) {
    return false;
  }

  bool ok = false;
  button = parseButton(tokens[0], ok);

  if (!ok) {
    return false;
  }

  int parsed = 0;
  if (!parseStrictIntToken(tokens[1], parsed)) {
    return false;
  }

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

  if (line == "BT RESET" || line == "BT RESET LAST-PEER") {
    const bool reconnectLastPeer = line == "BT RESET LAST-PEER";
    if (!controller.resetBluetooth(reconnectLastPeer)) {
      error = "bt reset failed";
      return false;
    }

    Serial.printf(
        "INFO action=bt-reset requested_reconnect_last_peer=%s\n",
        reconnectLastPeer ? "true" : "false");
    return true;
  }

  if (line == "BT CLEAR-PEER") {
    if (!controller.clearBluetoothPeer()) {
      error = "bt clear-peer failed";
      return false;
    }

    Serial.println("INFO action=bt-clear-peer");
    return true;
  }

  uint16_t buttonPressMs = 0;
  uint16_t inputDelayMs = 0;
  uint16_t homeMs = 0;

  if (parseInputConfigCommand(line, buttonPressMs, inputDelayMs, homeMs)) {
    controller.configureInputTiming(buttonPressMs, inputDelayMs, homeMs);
    Serial.printf(
        "INFO action=input-config button=%u delay=%u home=%u\n",
        buttonPressMs,
        inputDelayMs,
        homeMs);
    return true;
  }

  if (line.startsWith("CFG INPUT")) {
    error = "invalid input config";
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

    if (!parseMoveCommand(line, dx, dy)) {
      error = "invalid move";
      return false;
    }

    if (dx < -MAX_CURSOR_DELTA || dx > MAX_CURSOR_DELTA ||
        dy < -MAX_CURSOR_DELTA || dy > MAX_CURSOR_DELTA) {
      error = "move out of range";
      return false;
    }

    if (!controller.moveCursor(dx, dy)) {
      return failControllerInput(error);
    }
    Serial.printf("INFO action=move dx=%d dy=%d\n", dx, dy);
    return true;
  }

  int stickX = 0;
  int stickY = 0;
  uint16_t stickHoldMs = 0;

  if (parseStickCommand(line, stickX, stickY, stickHoldMs)) {
    if (!controller.moveStick(stickX, stickY, stickHoldMs)) {
      return failControllerInput(error);
    }
    Serial.printf("INFO action=stick x=%d y=%d ms=%u\n", stickX, stickY, stickHoldMs);
    return true;
  }

  if (line.startsWith("L ")) {
    int dx = 0;
    int dy = 0;
    uint8_t stride = 1;

    if (!parseLineCommand(line, dx, dy, stride) || (dx == 0 && dy == 0) || (dx != 0 && dy != 0)) {
      error = "invalid line";
      return false;
    }

    if (dx < -MAX_CURSOR_DELTA || dx > MAX_CURSOR_DELTA ||
        dy < -MAX_CURSOR_DELTA || dy > MAX_CURSOR_DELTA) {
      error = "line out of range";
      return false;
    }

    if (!controller.drawLine(dx, dy, stride)) {
      return failControllerInput(error);
    }

    Serial.printf("INFO action=line dx=%d dy=%d stride=%u\n", dx, dy, stride);
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
    if (paletteSlotIndex < 0 || paletteSlotIndex >= COLOR_PALETTE_SLOT_COUNT) {
      error = "invalid palette slot";
      return false;
    }

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
    if (paletteSlotIndex < 0 || paletteSlotIndex >= COLOR_PALETTE_SLOT_COUNT ||
        basicColorRow < 0 || basicColorRow >= BASIC_COLOR_GRID_ROWS ||
        basicColorCol < 0 || basicColorCol >= BASIC_COLOR_GRID_COLS) {
      error = "invalid basic color";
      return false;
    }

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

    if (!parseOneInt(line, "C", index)) {
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

    if (!parseOneInt(line, "W", delayMs) ||
        delayMs < 0 || delayMs > MAX_WAIT_DURATION_MS) {
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
