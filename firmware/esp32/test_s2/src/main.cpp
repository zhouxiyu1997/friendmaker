#include <Arduino.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include <tusb.h>

#include "config.h"
#include "controller.h"
#include "protocol.h"
#include "usb_hid.h"
#include "usb_hid_controller_transport.h"
#include "wifi_credentials.h"

constexpr int LED_PIN = 15;
constexpr int TCP_PORT = 9876;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 5000;

enum class WiFiState { Disconnected, Connecting, Connected, Reconnecting };

WiFiServer tcpServer(TCP_PORT);
WiFiClient tcpClient;
WiFiState wifiState = WiFiState::Disconnected;
unsigned long lastBlink = 0;
unsigned long lastWiFiRetry = 0;
unsigned long wifiConnectStartMs = 0;
bool ledState = false;
uint32_t tcpRxCount = 0;
String tcpLineBuffer;
bool usbWasMounted = false;
bool mdnsStarted = false;

UsbHidControllerTransport usbTransport;
ControllerTransport &transport = usbTransport;
SwitchController controller(transport);

static uint16_t gButtonPressMs = BUTTON_PRESS_DURATION_MS;
static uint16_t gInputDelayMs = INPUT_DELAY_MS;

struct LogEntry {
    unsigned long ms;
    char text[72];
};
constexpr int LOG_BUF_SIZE = 80;
LogEntry logBuf[LOG_BUF_SIZE];
int logIdx = 0;
int logCnt = 0;

void addLog(const char *fmt, ...) {
    LogEntry &e = logBuf[logIdx];
    e.ms = millis();
    va_list args;
    va_start(args, fmt);
    vsnprintf(e.text, sizeof(e.text), fmt, args);
    va_end(args);
    logIdx = (logIdx + 1) % LOG_BUF_SIZE;
    if (logCnt < LOG_BUF_SIZE) logCnt++;
}

void tcpLogf(const char *fmt, ...) {
    char buf[96];
    va_list args;
    va_start(args, fmt);
    int len = vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    addLog("%s", buf);
    if (tcpClient && tcpClient.connected()) {
        tcpClient.print("[");
        tcpClient.print(millis());
        tcpClient.print("] ");
        if (len > 0) tcpClient.write((const uint8_t *)buf, len);
        tcpClient.println();
    }
}

int currentBlinkRate() {
    bool usbOk = tud_mounted();
    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    if (usbOk && wifiOk) return 0;
    if (wifiState == WiFiState::Connecting || wifiState == WiFiState::Reconnecting) return 150;
    return 800;
}

static const tusb_desc_device_t kDeviceDesc = {
    .bLength = sizeof(tusb_desc_device_t),
    .bDescriptorType = TUSB_DESC_DEVICE,
    .bcdUSB = 0x0200,
    .bDeviceClass = 0x00,
    .bDeviceSubClass = 0x00,
    .bDeviceProtocol = 0x00,
    .bMaxPacketSize0 = CFG_TUD_ENDPOINT0_SIZE,
    .idVendor = 0x0F0D,
    .idProduct = 0x00C1,
    .bcdDevice = 0x0100,
    .iManufacturer = 0x01,
    .iProduct = 0x02,
    .iSerialNumber = 0x03,
    .bNumConfigurations = 1
};

static char const *kStringDesc[] = {
    (const char[]){0x09, 0x04},
    "HORI CO.,LTD.",
    "HORIPAD S",
    "000000000001",
};

uint8_t const *tud_descriptor_device_cb(void) {
    return (uint8_t const *)&kDeviceDesc;
}

uint8_t const *tud_descriptor_configuration_cb(uint8_t index) {
    (void)index;
    static uint8_t cfg[] = {
        TUD_CONFIG_DESCRIPTOR(1, 0, 0, TUD_CONFIG_DESC_LEN + TUD_HID_DESC_LEN,
                               TUSB_DESC_CONFIG_ATT_REMOTE_WAKEUP, 500),
        TUD_HID_DESCRIPTOR(0, 4, false, 8, 0x81, 64, 1),
    };
    return cfg;
}

uint16_t const *tud_descriptor_string_cb(uint8_t index, uint16_t langid) {
    (void)langid;
    static uint16_t serial_buf[16];
    if (index == 3) {
        uint8_t mac[6];
        esp_efuse_mac_get_default(mac);
        char tmp[13];
        snprintf(tmp, sizeof(tmp), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        serial_buf[0] = (TUSB_DESC_STRING << 8) | (uint8_t)(strlen(tmp) * 2 + 2);
        for (size_t i = 0; i < strlen(tmp); i++) {
            serial_buf[1 + i] = tmp[i];
        }
        return serial_buf;
    }
    if (index >= sizeof(kStringDesc) / sizeof(kStringDesc[0])) return NULL;
    const char *str = kStringDesc[index];
    static uint16_t buf[32];
    buf[0] = (TUSB_DESC_STRING << 8) | (uint8_t)(strlen(str) * 2 + 2);
    for (size_t i = 0; i < strlen(str); i++) {
        buf[1 + i] = str[i];
    }
    return buf;
}

void startWiFiConnect() {
    wifiState = WiFiState::Connecting;
    wifiConnectStartMs = millis();
    IPAddress localIp, gateway, subnet;
    if (localIp.fromString(WIFI_STATIC_IP) && gateway.fromString(WIFI_GATEWAY) && subnet.fromString(WIFI_SUBNET)) {
        WiFi.config(localIp, gateway, subnet);
    }
    WiFi.setSleep(false); WiFi.setAutoReconnect(true); WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    addLog("WiFi connecting (ip=%s)", WIFI_STATIC_IP);
}

void stopMdns() { if (mdnsStarted) { MDNS.end(); mdnsStarted = false; } }
void startMdns() {
    if (MDNS.begin(WIFI_MDNS_HOST)) { mdnsStarted = true; MDNS.addService("friendmaker", "tcp", TCP_PORT); addLog("mDNS ok"); }
    else { addLog("mDNS fail"); }
}

void handleWiFiConnected() {
    wifiState = WiFiState::Connected; tcpServer.begin();
    addLog("WiFi OK ip=%s", WiFi.localIP().toString().c_str());
    tcpLineBuffer.reserve(256);
    stopMdns(); startMdns();
}
void handleWiFiFailed() {
    wifiState = WiFiState::Disconnected;
    addLog("WiFi FAIL retry=%ds", WIFI_RETRY_INTERVAL_MS / 1000);
    lastWiFiRetry = millis();
}
void handleWiFiDropped() {
    stopMdns(); tcpClient.stop(); tcpServer.stop();
    wifiState = WiFiState::Reconnecting;
    addLog("WiFi DROPPED");
    startWiFiConnect();
}

void sendStatusResponse() {
    tcpClient.print("STATUS usb=");
    tcpClient.print(tud_mounted() ? "mount" : "no");
    tcpClient.print(" hid_ready=");
    tcpClient.print(UsbHid::isMounted() ? "yes" : "no");
    tcpClient.print(" tud_ready=");
    tcpClient.print(tud_ready() ? "yes" : "no");
    tcpClient.print(" wifi=");
    tcpClient.print(WiFi.status() == WL_CONNECTED ? "ok" : "no");
    tcpClient.print(" ip=");
    tcpClient.print(WiFi.localIP());
    tcpClient.print(" press_ms=");
    tcpClient.print(gButtonPressMs);
    tcpClient.print(" delay_ms=");
    tcpClient.print(gInputDelayMs);
    tcpClient.print(" uptime=");
    tcpClient.print(millis());
    tcpClient.print(" logcnt=");
    tcpClient.print(logCnt);
    tcpClient.print(" tcp_rx=");
    tcpClient.println(tcpRxCount);
}
void sendLogDump() {
    int count = logCnt;
    int start = (logCnt >= LOG_BUF_SIZE) ? logIdx : 0;
    tcpClient.print("LOG_DUMP count=");
    tcpClient.println(count);
    for (int i = 0; i < count; i++) {
        int idx = (start + i) % LOG_BUF_SIZE;
        tcpClient.print(logBuf[idx].ms);
        tcpClient.print("ms | ");
        tcpClient.println(logBuf[idx].text);
    }
    tcpClient.println("LOG_END");
}

namespace {

struct SequencedFrame {
  String sessionId;
  uint32_t sequence = 0;
  String command;
};

struct SequencedCommandCache {
  bool hasSession = false;
  String sessionId;
  uint32_t lastSequence = 0;
  String lastCommand;
  String lastAckLine;
};

SequencedCommandCache sequencedCommandCache;

bool isHexSessionId(const String &value) {
  if (value.length() != 8) {
    return false;
  }
  for (size_t index = 0; index < value.length(); index += 1) {
    const char c = value.charAt(index);
    const bool isHex =
        (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    if (!isHex) {
      return false;
    }
  }
  return true;
}

bool parseSequenceToken(const String &value, uint32_t &sequence) {
  if (value.length() == 0) {
    return false;
  }
  uint32_t parsed = 0;
  for (size_t index = 0; index < value.length(); index += 1) {
    const char c = value.charAt(index);
    if (c < '0' || c > '9') {
      return false;
    }
    const uint32_t digit = static_cast<uint32_t>(c - '0');
    if (parsed > (UINT32_MAX - digit) / 10) {
      return false;
    }
    parsed = parsed * 10 + digit;
  }
  if (parsed == 0) {
    return false;
  }
  sequence = parsed;
  return true;
}

bool parseSequencedFrame(const String &line, SequencedFrame &frame) {
  if (!line.startsWith("SEQ ")) {
    return false;
  }
  const int firstSpace = line.indexOf(' ');
  const int secondSpace = line.indexOf(' ', firstSpace + 1);
  const int thirdSpace = line.indexOf(' ', secondSpace + 1);
  if (secondSpace < 0 || thirdSpace < 0) {
    return false;
  }
  String sessionId = line.substring(firstSpace + 1, secondSpace);
  String sequenceToken = line.substring(secondSpace + 1, thirdSpace);
  String command = line.substring(thirdSpace + 1);
  command.trim();
  if (!isHexSessionId(sessionId) || command.length() == 0) {
    return false;
  }
  uint32_t sequence = 0;
  if (!parseSequenceToken(sequenceToken, sequence)) {
    return false;
  }
  sessionId.toLowerCase();
  frame.sessionId = sessionId;
  frame.sequence = sequence;
  frame.command = command;
  return true;
}

String makeOkAck(const SequencedFrame &frame) {
  return "OK " + frame.sessionId + " " + String(frame.sequence);
}

String makeErrorAck(const SequencedFrame &frame, const String &message) {
  return "ERR " + frame.sessionId + " " + String(frame.sequence) + " " + message;
}

bool validateSequencedFrame(const SequencedFrame &frame, String &ackLine) {
  if (!sequencedCommandCache.hasSession || sequencedCommandCache.sessionId != frame.sessionId) {
    if (frame.sequence != 1) {
      ackLine = makeErrorAck(frame, "sequence expected 1 for new session");
      return false;
    }
    sequencedCommandCache.hasSession = true;
    sequencedCommandCache.sessionId = frame.sessionId;
    sequencedCommandCache.lastSequence = 0;
    sequencedCommandCache.lastCommand = "";
    sequencedCommandCache.lastAckLine = "";
    return true;
  }
  if (frame.sequence == sequencedCommandCache.lastSequence) {
    if (frame.command == sequencedCommandCache.lastCommand &&
        sequencedCommandCache.lastAckLine.length() > 0) {
      ackLine = sequencedCommandCache.lastAckLine;
      return false;
    }
    ackLine = makeErrorAck(frame, "duplicate sequence command mismatch");
    return false;
  }
  if (frame.sequence != sequencedCommandCache.lastSequence + 1) {
    ackLine = makeErrorAck(
        frame, "sequence expected " + String(sequencedCommandCache.lastSequence + 1));
    return false;
  }
  return true;
}

void cacheSequencedResult(const SequencedFrame &frame, const String &ackLine) {
  sequencedCommandCache.lastSequence = frame.sequence;
  sequencedCommandCache.lastCommand = frame.command;
  sequencedCommandCache.lastAckLine = ackLine;
}

void applyInputTiming(uint16_t pressMs, uint16_t delayMs) {
  gButtonPressMs = pressMs;
  gInputDelayMs = delayMs;
  controller.configureInputTiming(pressMs, delayMs, HOME_DURATION_MS);
  addLog("CFG INPUT press=%u delay=%u", pressMs, delayMs);
}

bool isTimingConfigCommand(const String &line, uint16_t &pressMs, uint16_t &delayMs) {
  if (!line.startsWith("CFG INPUT ")) return false;
  const String payload = line.substring(10);
  const int a = payload.indexOf(' ');
  const int b = payload.indexOf(' ', a + 1);
  if (a < 0 || b < 0) return false;
  const int press = payload.substring(0, a).toInt();
  const int delay = payload.substring(a + 1, b).toInt();
  if (press <= 0 || press > 60000 || delay <= 0 || delay > 60000) return false;
  pressMs = static_cast<uint16_t>(press);
  delayMs = static_cast<uint16_t>(delay);
  return true;
}

}  // namespace

void executeTimingCommand(const String &line) {
  uint16_t pressMs = 0;
  uint16_t delayMs = 0;
  if (isTimingConfigCommand(line, pressMs, delayMs)) {
    applyInputTiming(pressMs, delayMs);
  }
}

void handleRawCommand(const String &line) {
  tcpLogf("RAW recv #%u \"%s\"", tcpRxCount, line.c_str());

  uint16_t pressMs = 0;
  uint16_t delayMs = 0;
  if (isTimingConfigCommand(line, pressMs, delayMs)) {
    applyInputTiming(pressMs, delayMs);
    tcpLogf("RAW timing applied press=%u delay=%u", pressMs, delayMs);
    return;
  }

  const unsigned long t0 = millis();
  String error;
  if (line == "I") {
    tcpClient.printf("INFO transport=%s\n", controller.transportName());
    tcpClient.println("INFO usb-hid transport active");
  }
  const bool ok = executeCommand(line, controller, error);
  const unsigned long t1 = millis();

  if (ok) {
    tcpLogf("RAW ok #%u elapsed=%lu \"%s\"", tcpRxCount, t1 - t0, line.c_str());
    tcpClient.print("ACK #"); tcpClient.print(tcpRxCount);
    tcpClient.print(" | \""); tcpClient.print(line);
    tcpClient.println("\"");
  } else {
    tcpLogf("RAW err #%u elapsed=%lu \"%s\" -> %s", tcpRxCount, t1 - t0, line.c_str(),
            error.length() > 0 ? error.c_str() : "unknown");
    tcpClient.print("NAK #"); tcpClient.print(tcpRxCount);
    tcpClient.print(" | \""); tcpClient.print(line);
    tcpClient.print("\" ");
    tcpClient.println(error.length() > 0 ? error : "unknown");
  }
}

void handleSeqCommand(const String &line) {
  SequencedFrame frame;
  if (!parseSequencedFrame(line, frame)) {
    tcpLogf("SEQ parse_fail fallback_raw #%u", tcpRxCount);
    handleRawCommand(line);
    return;
  }

  tcpLogf("SEQ recv #%u sid=%s seq=%lu cmd=\"%s\"",
          tcpRxCount, frame.sessionId.c_str(), frame.sequence, frame.command.c_str());

  String ackLine;
  if (!validateSequencedFrame(frame, ackLine)) {
    tcpLogf("SEQ validate_fail sid=%s seq=%lu ack=\"%s\"",
            frame.sessionId.c_str(), frame.sequence, ackLine.c_str());
    tcpClient.println(ackLine);
    return;
  }

  uint16_t pressMs = 0;
  uint16_t delayMs = 0;
  if (isTimingConfigCommand(frame.command, pressMs, delayMs)) {
    applyInputTiming(pressMs, delayMs);
    ackLine = makeOkAck(frame);
    cacheSequencedResult(frame, ackLine);
    tcpLogf("SEQ cfg_input applied #%u sid=%s seq=%lu press=%u delay=%u",
            tcpRxCount, frame.sessionId.c_str(), frame.sequence, pressMs, delayMs);
    tcpClient.println(ackLine);
    return;
  }

  const unsigned long t0 = millis();
  String error;
  if (frame.command == "I") {
    tcpClient.printf("INFO transport=%s\n", controller.transportName());
    tcpClient.println("INFO usb-hid transport active");
  }
  const bool ok = executeCommand(frame.command, controller, error);
  const unsigned long t1 = millis();

  if (ok) {
    ackLine = makeOkAck(frame);
    cacheSequencedResult(frame, ackLine);
    tcpLogf("SEQ ok #%u sid=%s seq=%lu elapsed=%lu",
            tcpRxCount, frame.sessionId.c_str(), frame.sequence, t1 - t0);
    tcpClient.println(ackLine);
  } else {
    ackLine = makeErrorAck(frame, error.length() > 0 ? error : "unknown error");
    cacheSequencedResult(frame, ackLine);
    tcpLogf("SEQ err #%u sid=%s seq=%lu elapsed=%lu -> %s",
            tcpRxCount, frame.sessionId.c_str(), frame.sequence, t1 - t0,
            error.length() > 0 ? error.c_str() : "unknown error");
    tcpClient.println(ackLine);
  }
}

void handleTcpClient() {
    if (!tcpClient || !tcpClient.connected()) {
        if (tcpClient) {
            addLog("TCP client disconnected");
            tcpClient.stop();
        }
        tcpClient = tcpServer.accept();
        if (tcpClient) {
            tcpClient.print("BOOT "); tcpClient.print(FIRMWARE_NAME);
            tcpClient.print(" board="); tcpClient.print(BOARD_FAMILY);
            tcpClient.print(" transport="); tcpClient.print(controller.transportName());
            tcpClient.print(" press="); tcpClient.print(gButtonPressMs);
            tcpClient.print(" delay="); tcpClient.println(gInputDelayMs);
            tcpLogf("TCP accept %s", tcpClient.remoteIP().toString().c_str());
        }
        return;
    }
    while (tcpClient.available() > 0) {
        char c = tcpClient.read();
        if (c == '\n') {
            tcpLineBuffer.trim();
            if (tcpLineBuffer.length() > 0) {
                tcpRxCount++;
                if (tcpLineBuffer == "STATUS") sendStatusResponse();
                else if (tcpLineBuffer == "LOG") sendLogDump();
                else if (tud_mounted()) {
                    handleSeqCommand(tcpLineBuffer);
                } else {
                    tcpLogf("NAK #%u USB_NOT_READY", tcpRxCount);
                    tcpClient.print("NAK #"); tcpClient.print(tcpRxCount);
                    tcpClient.println(" USB_NOT_READY");
                }
            }
            tcpLineBuffer = "";
        } else if (c != '\r') { tcpLineBuffer += c; }
    }
}

void setup() {
    pinMode(LED_PIN, OUTPUT);
    memset(logBuf, 0, sizeof(logBuf));
    addLog("BOOT mac=%s", WiFi.macAddress().c_str());
    UsbHid::init();
    controller.begin();
    controller.configureInputTiming(gButtonPressMs, gInputDelayMs, HOME_DURATION_MS);
    addLog("SEQ+protocol ready press=%u delay=%u", gButtonPressMs, gInputDelayMs);
    startWiFiConnect();
}

void loop() {
    unsigned long now = millis();
    int rate = currentBlinkRate();
    if (rate == 0) { if (!ledState) { ledState = true; digitalWrite(LED_PIN, HIGH); } }
    else if (now - lastBlink >= (unsigned long)rate) { lastBlink = now; ledState = !ledState; digitalWrite(LED_PIN, ledState ? HIGH : LOW); }

    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    switch (wifiState) {
    case WiFiState::Connecting: case WiFiState::Reconnecting:
        if (wifiOk) handleWiFiConnected();
        else if (now - wifiConnectStartMs > WIFI_CONNECT_TIMEOUT_MS) handleWiFiFailed();
        break;
    case WiFiState::Connected:
        if (!wifiOk) { handleWiFiDropped(); break; }
        {
            bool usbMounted = tud_mounted();
            if (usbMounted && !usbWasMounted) {
                addLog("USB bus active, wakeup...");
                delay(200);
                UsbHid::pressButtons(1u << UsbHid::BTN_A); UsbHid::sendReport(); delay(120);
                UsbHid::releaseAll(); UsbHid::sendReport(); delay(80);
                UsbHid::pressButtons(1u << UsbHid::BTN_HOME); UsbHid::sendReport(); delay(120);
                UsbHid::releaseAll(); UsbHid::sendReport(); delay(50);
                UsbHid::sendIdleReport();
                addLog("USB wakeup sent");
            } else if (!usbMounted && usbWasMounted) addLog("USB gone");
            usbWasMounted = usbMounted;
        }
        handleTcpClient();
        break;
    case WiFiState::Disconnected:
        if (now - lastWiFiRetry >= WIFI_RETRY_INTERVAL_MS) { addLog("WiFi retry"); startWiFiConnect(); }
        break;
    }
    delay(5);
}
