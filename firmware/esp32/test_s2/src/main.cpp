#include <Arduino.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include <tusb.h>

#include "usb_hid.h"
#include "wifi_credentials.h"

constexpr int LED_PIN = 15;
constexpr int TCP_PORT = 9876;
constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 5000;
constexpr uint32_t BTN_PRESS_MS = 100;
constexpr uint32_t BTN_SETTLE_MS = 50;
constexpr uint32_t DSTICK_HOLD_MS = 80;

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

struct LogEntry {
    unsigned long ms;
    char text[72];
};
constexpr int LOG_BUF_SIZE = 40;
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
    .bDeviceClass = 0x00,       // defined at interface level
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
    (const char[]){0x09, 0x04},  // 0: language
    "HORI CO.,LTD.",             // 1: manufacturer
    "HORIPAD S",                 // 2: product
    "000000000001",              // 3: serial
};

// Override Arduino's weak TinyUSB callbacks with our own
// Key fix: device class = 0x00 (not 0xEF IAD)

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

void executeHidAction(const String &cmd);

void handleTcpClient() {
    if (!tcpClient || !tcpClient.connected()) {
        tcpClient = tcpServer.accept();
        if (tcpClient) {
            tcpClient.println("BOOT friendmaker-usb-hid esp32-s2");
            addLog("TCP %s", tcpClient.remoteIP().toString().c_str());
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
                    executeHidAction(tcpLineBuffer);
                    tcpClient.print("ACK #"); tcpClient.print(tcpRxCount);
                    tcpClient.print(" HID | \""); tcpClient.print(tcpLineBuffer);
                    tcpClient.println("\"");
                } else {
                    tcpClient.print("NAK #"); tcpClient.print(tcpRxCount);
                    tcpClient.println(" USB_NOT_READY");
                }
            }
            tcpLineBuffer = "";
        } else if (c != '\r') { tcpLineBuffer += c; }
    }
}

void executeHidAction(const String &cmd) {
    if (cmd.length() == 0) return;
    if (cmd == "H") { UsbHid::pressButtons(1u << UsbHid::BTN_HOME); UsbHid::sendReport(); delay(BTN_PRESS_MS); UsbHid::releaseAll(); UsbHid::sendReport(); delay(BTN_SETTLE_MS); return; }
    if (cmd == "P") { UsbHid::pressButtons(1u << UsbHid::BTN_A); UsbHid::sendReport(); delay(BTN_PRESS_MS); UsbHid::releaseAll(); UsbHid::sendReport(); delay(BTN_SETTLE_MS); return; }
    if (cmd.startsWith("M ")) {
        int dx = 0, dy = 0;
        int f = cmd.indexOf(' '), s = cmd.indexOf(' ', f + 1);
        if (s < 0) dx = cmd.substring(f + 1).toInt();
        else { dx = cmd.substring(f + 1, s).toInt(); dy = cmd.substring(s + 1).toInt(); }
        for (int i = 0; i < abs(dx); i++) { UsbHid::setHat(dx > 0 ? UsbHid::HAT_RIGHT : UsbHid::HAT_LEFT); UsbHid::sendReport(); delay(DSTICK_HOLD_MS); UsbHid::setHat(UsbHid::HAT_CENTER); UsbHid::sendReport(); delay(BTN_SETTLE_MS); }
        for (int i = 0; i < abs(dy); i++) { UsbHid::setHat(dy > 0 ? UsbHid::HAT_DOWN : UsbHid::HAT_UP); UsbHid::sendReport(); delay(DSTICK_HOLD_MS); UsbHid::setHat(UsbHid::HAT_CENTER); UsbHid::sendReport(); delay(BTN_SETTLE_MS); }
        return;
    }
    if (cmd.startsWith("STICK ")) {
        int x=0,y=0,ms=0; int a=cmd.indexOf(' '),b=cmd.indexOf(' ',a+1),c=cmd.indexOf(' ',b+1);
        if (c<0) return; x=cmd.substring(a+1,b).toInt(); y=cmd.substring(b+1,c).toInt(); ms=cmd.substring(c+1).toInt();
        uint8_t sx=(x<0)?0:((x>0)?255:128), sy=(y<0)?255:((y>0)?0:128);
        UsbHid::setLeftStick(sx,sy); UsbHid::sendReport(); delay(ms);
        UsbHid::setLeftStick(128,128); UsbHid::sendReport(); return;
    }
    if (cmd.startsWith("RSTICK ")) {
        int x=0,y=0,ms=0; int a=cmd.indexOf(' '),b=cmd.indexOf(' ',a+1),c=cmd.indexOf(' ',b+1);
        if (c<0) return; x=cmd.substring(a+1,b).toInt(); y=cmd.substring(b+1,c).toInt(); ms=cmd.substring(c+1).toInt();
        uint8_t sx=(x<0)?0:((x>0)?255:128), sy=(y<0)?255:((y>0)?0:128);
        UsbHid::setRightStick(sx,sy); UsbHid::sendReport(); delay(ms);
        UsbHid::setRightStick(128,128); UsbHid::sendReport(); return;
    }
    if (cmd.startsWith("HOLD ")) {
        int a=cmd.indexOf(' '),b=cmd.indexOf(' ',a+1); if(b<0)return;
        String n=cmd.substring(a+1,b); n.trim(); int ms=cmd.substring(b+1).toInt();
        if (n=="A") UsbHid::pressButtons(1u<<UsbHid::BTN_A); else if (n=="B") UsbHid::pressButtons(1u<<UsbHid::BTN_B);
        else if (n=="X") UsbHid::pressButtons(1u<<UsbHid::BTN_X); else if (n=="Y") UsbHid::pressButtons(1u<<UsbHid::BTN_Y);
        else if (n=="L") UsbHid::pressButtons(1u<<UsbHid::BTN_L); else if (n=="R") UsbHid::pressButtons(1u<<UsbHid::BTN_R);
        else if (n=="ZL") UsbHid::pressButtons(1u<<UsbHid::BTN_ZL); else if (n=="ZR") UsbHid::pressButtons(1u<<UsbHid::BTN_ZR);
        else if (n=="HOME") UsbHid::pressButtons(1u<<UsbHid::BTN_HOME); else return;
        UsbHid::sendReport(); delay(ms); UsbHid::releaseAll(); UsbHid::sendReport(); return;
    }
    if (cmd.startsWith("W ")) { delay(cmd.substring(2).toInt()); return; }
    uint32_t m = 0;
    if (cmd=="A") m=1u<<UsbHid::BTN_A; else if (cmd=="B") m=1u<<UsbHid::BTN_B;
    else if (cmd=="X") m=1u<<UsbHid::BTN_X; else if (cmd=="Y") m=1u<<UsbHid::BTN_Y;
    else if (cmd=="L") m=1u<<UsbHid::BTN_L; else if (cmd=="R") m=1u<<UsbHid::BTN_R;
    else if (cmd=="ZL") m=1u<<UsbHid::BTN_ZL; else if (cmd=="ZR") m=1u<<UsbHid::BTN_ZR;
    else if (cmd=="PLUS") m=1u<<UsbHid::BTN_PLUS; else if (cmd=="MINUS") m=1u<<UsbHid::BTN_MINUS;
    else if (cmd=="HOME") m=1u<<UsbHid::BTN_HOME; else if (cmd=="LS"||cmd=="L3") m=1u<<UsbHid::BTN_L3;
    else if (cmd=="RS"||cmd=="R3") m=1u<<UsbHid::BTN_R3; else if (cmd=="CAPTURE"||cmd=="CAP") m=1u<<UsbHid::BTN_CAPTURE;
    else return;
    UsbHid::pressButtons(m); UsbHid::sendReport(); delay(BTN_PRESS_MS);
    UsbHid::releaseAll(); UsbHid::sendReport(); delay(BTN_SETTLE_MS);
}

void setup() {
    pinMode(LED_PIN, OUTPUT);
    memset(logBuf, 0, sizeof(logBuf));
    addLog("BOOT mac=%s", WiFi.macAddress().c_str());
    addLog("USB custom init done");
    UsbHid::init();
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
