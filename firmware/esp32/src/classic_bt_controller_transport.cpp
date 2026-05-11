#include "classic_bt_controller_transport.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "config.h"

#if defined(SWITCH_AUTO_DRAW_USE_CLASSIC_BT)

#include "esp32-hal-bt.h"
#include "esp_bt.h"
#include "esp_bt_device.h"
#include "esp_bt_main.h"
#include "esp_err.h"
#include "esp_gap_bt_api.h"
#include "esp_hidd_api.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "nvs.h"
#include "nvs_flash.h"

namespace {

constexpr uint8_t kControllerTypeProCon = 0x03;
constexpr uint8_t kStickCenter = 128;
constexpr uint8_t kStickMin = 0;
constexpr uint8_t kStickMax = 255;
// Broadcom/BlueDroid HID status from hiddefs.h: 8 means the interrupt channel
// is congested, so a short retry window is safe and avoids aborting the whole
// draw on a transient queue backup.
constexpr uint8_t kHidErrCongested = 8;
constexpr uint16_t kHidCongestionRetryDelayMs = HID_REPEAT_INTERVAL_MS;
#if defined(SWITCH_LITE)
constexpr const char *kBluetoothTimingProfile = "switch-lite";
// Switch Lite needs a wider retry window during transient L2CAP congestion.
constexpr uint16_t kHidCongestionRetryBudgetMs = 300;
constexpr uint16_t kSendTaskStartupDelayMs = 1000;
constexpr bool kUseFixedSendInterval = true;
constexpr bool kWaitForExplicitInputSendEvent = true;
constexpr bool kWaitForExplicitInputDrain = true;
constexpr bool kMarkPairedOnSubcommand03 = true;
constexpr bool kSuppressRoutineCongestionWarnings = true;
constexpr bool kDisableBluetoothModemSleep = true;
constexpr bool kAttemptVirtualCableOnAuthComplete = false;
constexpr uint16_t kIdlePrePairingReportIntervalMs = 30;
constexpr uint16_t kIdleCongestedReportIntervalMs = 45;
constexpr uint16_t kIdleConnectedReportIntervalMs = 15;
#elif defined(SWITCH_2)
constexpr const char *kBluetoothTimingProfile = "switch2";
// Switch 2 is still under characterization, so keep its idle/report cadence
// conservative until we understand its Classic BT pairing behavior better.
constexpr uint16_t kHidCongestionRetryBudgetMs = 800;
constexpr uint16_t kSendTaskStartupDelayMs = 1000;
constexpr bool kUseFixedSendInterval = true;
constexpr bool kWaitForExplicitInputSendEvent = true;
constexpr bool kWaitForExplicitInputDrain = true;
constexpr bool kMarkPairedOnSubcommand03 = true;
constexpr bool kSuppressRoutineCongestionWarnings = true;
constexpr bool kDisableBluetoothModemSleep = true;
constexpr bool kAttemptVirtualCableOnAuthComplete = true;
constexpr uint16_t kIdlePrePairingReportIntervalMs = 60;
constexpr uint16_t kIdleCongestedReportIntervalMs = 120;
constexpr uint16_t kIdleConnectedReportIntervalMs = 30;
#else
constexpr const char *kBluetoothTimingProfile = "switch";
constexpr uint16_t kHidCongestionRetryBudgetMs = HID_REPEAT_INTERVAL_MS * 4;
constexpr uint16_t kSendTaskStartupDelayMs = 0;
constexpr bool kUseFixedSendInterval = false;
constexpr bool kWaitForExplicitInputSendEvent = false;
constexpr bool kWaitForExplicitInputDrain = false;
constexpr bool kMarkPairedOnSubcommand03 = false;
constexpr bool kSuppressRoutineCongestionWarnings = false;
constexpr bool kDisableBluetoothModemSleep = false;
constexpr bool kAttemptVirtualCableOnAuthComplete = false;
constexpr uint16_t kIdlePrePairingReportIntervalMs = 30;
constexpr uint16_t kIdleCongestedReportIntervalMs = 45;
constexpr uint16_t kIdleConnectedReportIntervalMs = 15;
#endif
constexpr uint16_t kFixedSendTaskIntervalMs = 100;
constexpr uint16_t kExplicitInputDrainBudgetMs = 100;
constexpr uint16_t kIdleDisconnectedReportIntervalMs = 100;

uint8_t kHidDescriptor[] = {
    0x05, 0x01, 0x09, 0x05, 0xa1, 0x01, 0x06, 0x01, 0xff, 0x85, 0x21, 0x09,
    0x21, 0x75, 0x08, 0x95, 0x30, 0x81, 0x02, 0x85, 0x30, 0x09, 0x30, 0x75,
    0x08, 0x95, 0x30, 0x81, 0x02, 0x85, 0x31, 0x09, 0x31, 0x75, 0x08, 0x96,
    0x69, 0x01, 0x81, 0x02, 0x85, 0x32, 0x09, 0x32, 0x75, 0x08, 0x96, 0x69,
    0x01, 0x81, 0x02, 0x85, 0x33, 0x09, 0x33, 0x75, 0x08, 0x96, 0x69, 0x01,
    0x81, 0x02, 0x85, 0x3f, 0x05, 0x09, 0x19, 0x01, 0x29, 0x10, 0x15, 0x00,
    0x25, 0x01, 0x75, 0x01, 0x95, 0x10, 0x81, 0x02, 0x05, 0x01, 0x09, 0x39,
    0x15, 0x00, 0x25, 0x07, 0x75, 0x04, 0x95, 0x01, 0x81, 0x42, 0x05, 0x09,
    0x75, 0x04, 0x95, 0x01, 0x81, 0x01, 0x05, 0x01, 0x09, 0x30, 0x09, 0x31,
    0x09, 0x33, 0x09, 0x34, 0x16, 0x00, 0x00, 0x27, 0xff, 0xff, 0x00, 0x00,
    0x75, 0x10, 0x95, 0x04, 0x81, 0x02, 0x06, 0x01, 0xff, 0x85, 0x01, 0x09,
    0x01, 0x75, 0x08, 0x95, 0x30, 0x91, 0x02, 0x85, 0x10, 0x09, 0x10, 0x75,
    0x08, 0x95, 0x30, 0x91, 0x02, 0x85, 0x11, 0x09, 0x11, 0x75, 0x08, 0x95,
    0x30, 0x91, 0x02, 0x85, 0x12, 0x09, 0x12, 0x75, 0x08, 0x95, 0x30, 0x91,
    0x02, 0xc0};

esp_hidd_app_param_t makeHidAppParam() {
  esp_hidd_app_param_t app = {};
  app.name = const_cast<char *>("Wireless Gamepad");
  app.description = const_cast<char *>("Gamepad");
  app.provider = const_cast<char *>("Nintendo");
  app.subclass = 0x08;
  app.desc_list = kHidDescriptor;
  app.desc_list_len = sizeof(kHidDescriptor);
  return app;
}

esp_hidd_app_param_t kHidAppParam = makeHidAppParam();
esp_hidd_qos_param_t kHidQos = {};

const char *boolName(bool value) { return value ? "true" : "false"; }

bool isIgnorableBluetoothError(esp_err_t err) {
  return err == ESP_OK || err == ESP_ERR_INVALID_STATE;
}

bool deriveDeterministicBaseMac(uint8_t baseMac[6]) {
  uint8_t factoryMac[6] = {};
  const esp_err_t err = esp_efuse_mac_get_default(factoryMac);

  if (err != ESP_OK) {
    Serial.printf("WARN efuse_mac_get_default failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  // Keep the Nintendo-like OUI we already expose to Switch, but derive the
  // device-specific suffix from the chip eFuse so the controller identity stays
  // stable even if the user reflashes or the NVS namespace is rebuilt.
  baseMac[0] = 0xD4;
  baseMac[1] = 0xF0;
  baseMac[2] = 0x57;
  baseMac[3] = factoryMac[3];
  baseMac[4] = factoryMac[4];
  baseMac[5] = factoryMac[5];
  return true;
}

String formatBluetoothAddress(const uint8_t address[6]) {
  char buffer[18];
  std::snprintf(
      buffer,
      sizeof(buffer),
      "%02X:%02X:%02X:%02X:%02X:%02X",
      address[0],
      address[1],
      address[2],
      address[3],
      address[4],
      address[5]);
  return String(buffer);
}

uint8_t kReply02[] = {
    0x00, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x82, 0x02, 0x04, 0x00, kControllerTypeProCon, 0x02, 0xD4, 0xF0, 0x57, 0x6E,
    0xF0, 0xD7, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00};

uint8_t kReply08[] = {
    0x01, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x80, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReply03[] = {
    0x04, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x80, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReply04[] = {
    0x0A, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x83, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2C, 0x01,
    0x2C, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReplySpiAddress0[] = {
    0x02, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x90, 0x10, 0x00, 0x60, 0x00, 0x00, 0x10, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00,
    0xff, kControllerTypeProCon, 0xA0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00};

uint8_t kReplySpiAddress50[] = {
    0x03, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x90, 0x10, 0x50, 0x60, 0x00, 0x00, 0x0D, 0x23, 0x23, 0x23, 0xff, 0xff,
    0xff, 0x95, 0x15, 0x15, 0x15, 0x15, 0x95, 0xff, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReplySpiAddress80[] = {
    0x0B, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x90, 0x10, 0x80, 0x60, 0x00, 0x00, 0x18, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReplySpiAddress98[] = {
    0x0C, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x90, 0x10, 0x98, 0x60, 0x00, 0x00, 0x12, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReplySpiAddress10[] = {
    0x0D, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x90, 0x10, 0x10, 0x80, 0x00, 0x00, 0x18, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReplySpiAddress3D[] = {
    0x0E, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x90, 0x10, 0x3D, 0x60, 0x00, 0x00, 0x19, 0x00, 0x07, 0x70, 0x00, 0x08,
    0x80, 0x00, 0x07, 0x70, 0x00, 0x08, 0x80, 0x00, 0x07, 0x70, 0x00, 0x07,
    0x70, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00};

uint8_t kReplySpiAddress20[] = {
    0x10, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x90, 0x10, 0x20, 0x60, 0x00, 0x00, 0x18, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReply4001[] = {
    0x15, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReply4801[] = {
    0x1A, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x80, 0x48, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReply3001[] = {
    0x1C, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x00, 0x00, 0x00,
    0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

uint8_t kReply3333[] = {
    0x31, 0x8e, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00, 0x08, 0x80, 0x00,
    0xa0, 0x21, 0x01, 0x00, 0x00, 0x00, 0x03, 0x00, 0x05, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7b,
    0x00};

uint8_t kReply3401[] = {
    0x12, 0x8e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0x80, 0x00,
    0x80, 0x22, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

esp_bt_cod_t makeDeviceClass() {
  esp_bt_cod_t cod = {};
  cod.minor = 2;
  cod.major = 5;
  cod.service = 1;
  return cod;
}

esp_bt_cod_t kDeviceClass = makeDeviceClass();

}  // namespace

ClassicBtControllerTransport *ClassicBtControllerTransport::instance_ = nullptr;

void ClassicBtControllerTransport::begin() {
  instance_ = this;
  if (inputReportSendMutex_ == nullptr) {
    inputReportSendMutex_ = xSemaphoreCreateRecursiveMutex();
    if (inputReportSendMutex_ == nullptr) {
      Serial.println("WARN bt input-report mutex create failed");
    }
  }
  clearInputs();
  if (!initializeClassicBluetooth()) {
    Serial.println("WARN bt begin failed");
  }
}

bool ClassicBtControllerTransport::initializeNvsAndBaseAddress() {
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    err = nvs_flash_init();
  }

  if (err != ESP_OK) {
    Serial.printf("WARN nvs_init failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  uint8_t baseMac[6] = {};
  const char *baseMacSource = "efuse-derived";
  bool shouldPersistDerivedMac = false;
  nvs_handle handle;
  err = nvs_open("storage", NVS_READWRITE, &handle);
  if (err == ESP_OK) {
    size_t size = sizeof(baseMac);
    err = nvs_get_blob(handle, "mac_addr", baseMac, &size);
    if (err == ESP_OK && size == sizeof(baseMac)) {
      baseMacSource = "nvs";
    } else {
      if (!deriveDeterministicBaseMac(baseMac)) {
        nvs_close(handle);
        return false;
      }
      shouldPersistDerivedMac = true;
    }
  } else {
    Serial.printf(
        "WARN nvs_open failed err=%s; using deterministic base mac fallback\n",
        esp_err_to_name(err));
    if (!deriveDeterministicBaseMac(baseMac)) {
      return false;
    }
  }

  if (shouldPersistDerivedMac) {
    err = nvs_set_blob(handle, "mac_addr", baseMac, sizeof(baseMac));
    if (err != ESP_OK) {
      Serial.printf("WARN nvs_set_blob failed err=%s\n", esp_err_to_name(err));
    } else {
      err = nvs_commit(handle);
      if (err != ESP_OK) {
        Serial.printf("WARN nvs_commit failed err=%s\n", esp_err_to_name(err));
      }
    }
  }

  if (err == ESP_OK || shouldPersistDerivedMac) {
    nvs_close(handle);
  }

  err = esp_base_mac_addr_set(baseMac);
  if (err != ESP_OK) {
    Serial.printf("WARN base_mac_set failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  Serial.printf(
      "INFO bt base_mac=%02X:%02X:%02X:%02X:%02X:%02X source=%s\n",
      baseMac[0],
      baseMac[1],
      baseMac[2],
      baseMac[3],
      baseMac[4],
      baseMac[5],
      baseMacSource);
  return true;
}

bool ClassicBtControllerTransport::initializeClassicBluetooth() {
  initStep_ = "nvs";
  initError_ = "none";
  if (!initializeNvsAndBaseAddress()) {
    return false;
  }

  initStep_ = "btStart";
  if (!btStarted() && !btStart()) {
    initError_ = "btStart_failed";
    Serial.println("WARN btStart failed");
    return false;
  }
  stackStarted_ = true;

  initStep_ = "bluedroid_init";
  esp_err_t err = esp_bluedroid_init();
  if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
    initError_ = esp_err_to_name(err);
    Serial.printf("WARN bluedroid_init failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  initStep_ = "bluedroid_enable";
  err = esp_bluedroid_enable();
  if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
    initError_ = esp_err_to_name(err);
    Serial.printf("WARN bluedroid_enable failed err=%s\n", esp_err_to_name(err));
    return false;
  }
  bluedroidReady_ = true;

  if (kDisableBluetoothModemSleep) {
    // Prevent modem sleep on the more timing-sensitive controller variants so
    // the host does not bounce between discoverable and reconnectable states.
    const esp_err_t sleepErr = esp_bt_sleep_disable();
    if (!isIgnorableBluetoothError(sleepErr)) {
      Serial.printf("WARN bt sleep_disable failed err=%s\n", esp_err_to_name(sleepErr));
    }
  }

  initStep_ = "gap_register";
  err = esp_bt_gap_register_callback(
      reinterpret_cast<esp_bt_gap_cb_t>(&ClassicBtControllerTransport::onGapEvent));
  if (err != ESP_OK) {
    initError_ = esp_err_to_name(err);
    Serial.printf("WARN gap_register failed err=%s\n", esp_err_to_name(err));
    return false;
  }
  gapReady_ = true;

  initStep_ = "set_device_name";
  err = esp_bt_dev_set_device_name(BT_DEVICE_NAME);
  if (err != ESP_OK) {
    initError_ = esp_err_to_name(err);
    Serial.printf("WARN set_device_name failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  initStep_ = "hid_callback";
  err = esp_bt_hid_device_register_callback(
      reinterpret_cast<esp_hd_cb_t>(&ClassicBtControllerTransport::onHidEvent));
  if (err != ESP_OK) {
    initError_ = esp_err_to_name(err);
    Serial.printf("WARN hid_register_callback failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  initStep_ = "hid_init";
  err = esp_bt_hid_device_init();
  if (err != ESP_OK) {
    initError_ = esp_err_to_name(err);
    Serial.printf("WARN hid_init failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  initStep_ = "hid_init_requested";
  initError_ = "ESP_OK";

#if (CONFIG_BT_SSP_ENABLED == true)
  esp_bt_sp_param_t paramType = ESP_BT_SP_IOCAP_MODE;
  esp_bt_io_cap_t ioCap = ESP_BT_IO_CAP_NONE;
  err = esp_bt_gap_set_security_param(paramType, &ioCap, sizeof(ioCap));
  if (err != ESP_OK) {
    Serial.printf("WARN bt set_security_param failed err=%s\n", esp_err_to_name(err));
  }
#endif

  esp_bt_pin_type_t pinType = ESP_BT_PIN_TYPE_VARIABLE;
  esp_bt_pin_code_t pinCode = {};
  err = esp_bt_gap_set_pin(pinType, 0, pinCode);
  if (err != ESP_OK) {
    Serial.printf("WARN bt set_pin failed err=%s\n", esp_err_to_name(err));
  }

  Serial.printf(
      "INFO bt init requested name=\"%s\" provider=\"%s\" desc=\"%s\"\n",
      BT_DEVICE_NAME,
      BT_DEVICE_PROVIDER,
      BT_DEVICE_DESCRIPTION);
  return true;
}

void ClassicBtControllerTransport::clearConnectionState() {
  discoverable_ = false;
  connected_ = false;
  readyForReports_ = false;
  authComplete_ = false;
  pairingComplete_ = false;
  paired_ = false;
  hidReady_ = false;
  appRegistered_ = false;
  gapReady_ = false;
  bluedroidReady_ = false;
  stackStarted_ = false;
  timer_ = 0;
  explicitInputActive_ = false;
  resetInputReportTracking();
  initStep_ = "idle";
  initError_ = "none";
  ignoredReportCount_ = 0;
  lastIgnoredReportId_ = 0;
  lastIgnoredReportLen_ = 0;
  lastAclDisconnectReason_ = 0;
  lastHidCloseStatus_ = -1;
  lastHidCloseConnStatus_ = -1;
  lastSendReportStatus_ = -1;
  lastSendReportReason_ = 0;
  lastSendReportId_ = 0;
  sendReportFailureCount_ = 0;
  lastDropReason_ = "none";
  reconnectLastPeerOnRegister_ = false;
}

bool ClassicBtControllerTransport::shutdownClassicBluetooth() {
  initStep_ = "shutdown";
  initError_ = "none";
  readyForReports_ = false;

  const esp_err_t scanErr =
      esp_bt_gap_set_scan_mode(ESP_BT_NON_CONNECTABLE, ESP_BT_NON_DISCOVERABLE);
  if (!isIgnorableBluetoothError(scanErr)) {
    Serial.printf("WARN bt shutdown scan_mode err=%s\n", esp_err_to_name(scanErr));
  }

  const esp_err_t unplugErr = esp_bt_hid_device_virtual_cable_unplug();
  if (!isIgnorableBluetoothError(unplugErr)) {
    Serial.printf("WARN bt shutdown vc_unplug err=%s\n", esp_err_to_name(unplugErr));
  }
  delay(200);

  const esp_err_t disconnectErr = esp_bt_hid_device_disconnect();
  if (!isIgnorableBluetoothError(disconnectErr)) {
    Serial.printf("WARN bt shutdown disconnect err=%s\n", esp_err_to_name(disconnectErr));
  }
  delay(200);

  const esp_err_t unregisterErr = esp_bt_hid_device_unregister_app();
  if (!isIgnorableBluetoothError(unregisterErr)) {
    Serial.printf("WARN bt shutdown unregister_app err=%s\n", esp_err_to_name(unregisterErr));
  }
  delay(150);

  const esp_err_t hidDeinitErr = esp_bt_hid_device_deinit();
  if (!isIgnorableBluetoothError(hidDeinitErr)) {
    Serial.printf("WARN bt shutdown hid_deinit err=%s\n", esp_err_to_name(hidDeinitErr));
  }
  delay(150);

  const esp_err_t bluedroidDisableErr = esp_bluedroid_disable();
  if (!isIgnorableBluetoothError(bluedroidDisableErr)) {
    Serial.printf("WARN bt shutdown bluedroid_disable err=%s\n", esp_err_to_name(bluedroidDisableErr));
  }

  const esp_err_t bluedroidDeinitErr = esp_bluedroid_deinit();
  if (!isIgnorableBluetoothError(bluedroidDeinitErr)) {
    Serial.printf("WARN bt shutdown bluedroid_deinit err=%s\n", esp_err_to_name(bluedroidDeinitErr));
  }

  if (btStarted() && !btStop()) {
    Serial.println("WARN bt shutdown btStop failed");
  }

  clearConnectionState();
  clearInputs();
  delay(250);
  return true;
}

void ClassicBtControllerTransport::clearInputs() {
  buttonsRight_ = 0;
  buttonsShared_ = 0;
  buttonsLeft_ = 0;
  leftStickX_ = kStickCenter;
  leftStickY_ = kStickCenter;
  rightStickX_ = kStickCenter;
  rightStickY_ = kStickCenter;

  std::memset(report30_, 0, sizeof(report30_));
  report30_[1] = 0x8E;
  report30_[11] = 0x80;

  const uint8_t defaultDummy[] = {0x00, 0x8E, 0x00, 0x00, 0x00, 0x00,
                                  0x08, 0x80, 0x00, 0x08, 0x80};
  std::memcpy(dummyReport_, defaultDummy, sizeof(dummyReport_));
  updateInputReport();
}

void ClassicBtControllerTransport::setButtonBits(uint32_t buttonsMask) {
  buttonsRight_ = 0;
  buttonsShared_ = 0;
  buttonsLeft_ = 0;

  if ((buttonsMask & controllerButtonMask(ControllerButton::Y)) != 0) {
    buttonsRight_ |= 1u << 0;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::X)) != 0) {
    buttonsRight_ |= 1u << 1;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::B)) != 0) {
    buttonsRight_ |= 1u << 2;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::A)) != 0) {
    buttonsRight_ |= 1u << 3;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::R)) != 0) {
    buttonsRight_ |= 1u << 6;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::ZR)) != 0) {
    buttonsRight_ |= 1u << 7;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::L)) != 0) {
    buttonsLeft_ |= 1u << 6;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::ZL)) != 0) {
    buttonsLeft_ |= 1u << 7;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::DpadDown)) != 0) {
    buttonsLeft_ |= 1u << 0;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::DpadUp)) != 0) {
    buttonsLeft_ |= 1u << 1;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::DpadRight)) != 0) {
    buttonsLeft_ |= 1u << 2;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::DpadLeft)) != 0) {
    buttonsLeft_ |= 1u << 3;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::Minus)) != 0) {
    buttonsShared_ |= 1u << 0;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::Plus)) != 0) {
    buttonsShared_ |= 1u << 1;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::RStick)) != 0) {
    buttonsShared_ |= 1u << 2;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::LStick)) != 0) {
    buttonsShared_ |= 1u << 3;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::Home)) != 0) {
    buttonsShared_ |= 1u << 4;
  }
  if ((buttonsMask & controllerButtonMask(ControllerButton::Capture)) != 0) {
    buttonsShared_ |= 1u << 5;
  }
}

void ClassicBtControllerTransport::setLeftStickFromVector(int x, int y) {
  leftStickX_ = x < 0 ? kStickMin : (x > 0 ? kStickMax : kStickCenter);
  leftStickY_ = y < 0 ? kStickMax : (y > 0 ? kStickMin : kStickCenter);
  rightStickX_ = kStickCenter;
  rightStickY_ = kStickCenter;
}

void ClassicBtControllerTransport::updateInputReport() {
  report30_[0] = timer_;
  report30_[2] = buttonsRight_;
  report30_[3] = buttonsShared_;
  report30_[4] = buttonsLeft_;
  report30_[5] = static_cast<uint8_t>((leftStickX_ << 4) & 0xF0);
  report30_[6] = static_cast<uint8_t>((leftStickX_ & 0xF0) >> 4);
  report30_[7] = leftStickY_;
  report30_[8] = static_cast<uint8_t>((rightStickX_ << 4) & 0xF0);
  report30_[9] = static_cast<uint8_t>((rightStickX_ & 0xF0) >> 4);
  report30_[10] = rightStickY_;

  dummyReport_[0] = timer_;
}

void ClassicBtControllerTransport::ensureSendTask() {
  if (sendTaskHandle_ != nullptr) {
    return;
  }

  xTaskCreatePinnedToCore(
      &ClassicBtControllerTransport::sendTaskTrampoline,
      "switch_send_task",
      4096,
      this,
      2,
      &sendTaskHandle_,
      0);
}

uint16_t ClassicBtControllerTransport::idleSendIntervalMs() const {
  if (!connected_ && !paired_) {
    return kIdleDisconnectedReportIntervalMs;
  }

  if (reportCongested_ || consecutiveSendReportFailures_ >= 3) {
    return kIdleCongestedReportIntervalMs;
  }

  if (!paired_ || !authComplete_) {
    return kIdlePrePairingReportIntervalMs;
  }

  return kIdleConnectedReportIntervalMs;
}

void ClassicBtControllerTransport::sendTaskTrampoline(void *param) {
  auto *transport = static_cast<ClassicBtControllerTransport *>(param);
  if (kSendTaskStartupDelayMs > 0) {
    vTaskDelay(pdMS_TO_TICKS(kSendTaskStartupDelayMs));
  }
  while (true) {
    if (!transport->explicitInputActive_) {
      transport->sendCurrentInputReport(false);
    }
    if (kUseFixedSendInterval) {
      vTaskDelay(pdMS_TO_TICKS(kFixedSendTaskIntervalMs));
    } else {
      vTaskDelay(pdMS_TO_TICKS(transport->idleSendIntervalMs()));
    }
  }
}

bool ClassicBtControllerTransport::pressButtons(
    uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) {
  if (!beginExplicitInput()) {
    return false;
  }
  setButtonBits(buttonsMask);
  updateInputReport();
  bool ok = repeatCurrentInputReport(holdMs, true);
  clearInputs();
  if (!repeatCurrentInputReport(settleMs, true)) {
    ok = false;
  }
  endExplicitInput();
  return ok;
}

bool ClassicBtControllerTransport::moveDirection(
    int x, int y, uint16_t holdMs, uint16_t settleMs) {
  if (!beginExplicitInput()) {
    return false;
  }
  buttonsRight_ = 0;
  buttonsShared_ = 0;
  buttonsLeft_ = 0;
  setLeftStickFromVector(x, y);
  updateInputReport();
  bool ok = repeatCurrentInputReport(holdMs, true);
  clearInputs();
  if (!repeatCurrentInputReport(settleMs, true)) {
    ok = false;
  }
  endExplicitInput();
  return ok;
}

bool ClassicBtControllerTransport::resetConnection(bool reconnectLastPeer) {
  const bool shouldReconnectLastPeer =
      reconnectLastPeer && hasPeerAddress_ && hasReconnectablePeer_;
  Serial.printf(
      "INFO bt reset requested mode=stack-restart reconnect_last_peer=%s\n",
      boolName(shouldReconnectLastPeer));

  shutdownClassicBluetooth();

  clearInputs();
  reconnectLastPeerOnRegister_ = shouldReconnectLastPeer;

  if (!initializeClassicBluetooth()) {
    reconnectLastPeerOnRegister_ = false;
    Serial.printf("WARN bt reset restart failed step=%s err=%s\n", initStep_, initError_);
    return false;
  }

  Serial.printf(
      "INFO bt reset completed mode=stack-restart reconnect_last_peer=%s\n",
      boolName(reconnectLastPeerOnRegister_));
  return true;
}

bool ClassicBtControllerTransport::clearStoredPeer() {
  const bool hadPeerAddress = hasPeerAddress_;
  uint8_t previousPeerAddress[6] = {};

  if (hadPeerAddress) {
    std::memcpy(previousPeerAddress, lastPeerAddress_, sizeof(previousPeerAddress));
  }

  if (!clearBondedPeerDevices()) {
    return false;
  }

  if (!clearPersistedPeerAddress()) {
    return false;
  }

  hasPeerAddress_ = false;
  hasReconnectablePeer_ = false;
  reconnectLastPeerOnRegister_ = false;
  std::memset(lastPeerAddress_, 0, sizeof(lastPeerAddress_));

  if (hadPeerAddress) {
    Serial.printf(
        "INFO bt cleared_peer=%s\n",
        formatBluetoothAddress(previousPeerAddress).c_str());
  } else {
    Serial.println("INFO bt cleared_peer=none");
  }

  return true;
}

bool ClassicBtControllerTransport::clearBondedPeerDevices() {
  if (!gapReady_) {
    Serial.println("WARN bt clear_bonds failed gap_ready=false");
    return false;
  }

  const int bondCount = esp_bt_gap_get_bond_device_num();
  if (bondCount <= 0) {
    Serial.println("INFO bt cleared_bonds=0");
    return true;
  }

  auto *bondedDevices = reinterpret_cast<esp_bd_addr_t *>(
      std::calloc(static_cast<size_t>(bondCount), sizeof(esp_bd_addr_t)));
  if (bondedDevices == nullptr) {
    Serial.printf("WARN bt clear_bonds alloc failed count=%d\n", bondCount);
    return false;
  }

  int listCount = bondCount;
  esp_err_t err = esp_bt_gap_get_bond_device_list(&listCount, bondedDevices);
  if (err != ESP_OK) {
    std::free(bondedDevices);
    Serial.printf("WARN bt clear_bonds list failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  bool removedAllBonds = true;
  for (int index = 0; index < listCount; ++index) {
    err = esp_bt_gap_remove_bond_device(bondedDevices[index]);
    if (err != ESP_OK) {
      removedAllBonds = false;
      Serial.printf(
          "WARN bt clear_bonds remove failed peer=%s err=%s\n",
          formatBluetoothAddress(bondedDevices[index]).c_str(),
          esp_err_to_name(err));
      continue;
    }

    Serial.printf(
        "INFO bt cleared_bond=%s\n",
        formatBluetoothAddress(bondedDevices[index]).c_str());
  }

  std::free(bondedDevices);

  if (!removedAllBonds) {
    return false;
  }

  Serial.printf("INFO bt cleared_bonds=%d\n", listCount);
  return true;
}

bool ClassicBtControllerTransport::clearPersistedPeerAddress() {
  nvs_handle handle = 0;
  esp_err_t err = nvs_open("storage", NVS_READWRITE, &handle);
  if (err != ESP_OK) {
    Serial.printf("WARN bt clear_peer open failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  err = nvs_erase_key(handle, "peer_addr");
  if (err == ESP_ERR_NVS_NOT_FOUND) {
    nvs_close(handle);
    return true;
  }

  if (err == ESP_OK) {
    err = nvs_commit(handle);
  }
  nvs_close(handle);

  if (err != ESP_OK) {
    Serial.printf("WARN bt clear_peer failed err=%s\n", esp_err_to_name(err));
    return false;
  }

  return true;
}

void ClassicBtControllerTransport::enterReconnectableState(const char *reason) {
  connected_ = false;
  readyForReports_ = false;
  authComplete_ = false;
  pairingComplete_ = false;
  paired_ = false;
  discoverable_ = true;
  reportCongested_ = false;
  consecutiveSendReportFailures_ = 0;
  lastDropReason_ = reason;
  clearInputs();

  esp_err_t err = ESP_OK;
  if (gapReady_ && appRegistered_) {
    err = esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, ESP_BT_GENERAL_DISCOVERABLE);
    discoverable_ = err == ESP_OK;
  }

  Serial.printf(
      "INFO bt reconnectable reason=%s discoverable=%s err=%s\n",
      reason,
      boolName(discoverable_),
      esp_err_to_name(err));
}

void ClassicBtControllerTransport::printStatus(Print &output) const {
  output.println("INFO bt_mode=classic-bt-hid");
  output.println("INFO bt_profile=uartswitchcon-pro-controller");
  output.print("INFO bt_timing_profile=");
  output.println(kBluetoothTimingProfile);
  output.print("INFO bt_stack_started=");
  output.println(boolName(stackStarted_));
  output.print("INFO bt_bluedroid_ready=");
  output.println(boolName(bluedroidReady_));
  output.print("INFO bt_gap_ready=");
  output.println(boolName(gapReady_));
  output.print("INFO bt_hid_ready=");
  output.println(boolName(hidReady_));
  output.print("INFO bt_app_registered=");
  output.println(boolName(appRegistered_));
  output.print("INFO bt_discoverable=");
  output.println(boolName(discoverable_));
  output.print("INFO bt_connected=");
  output.println(boolName(connected_));
  output.print("INFO bt_auth_complete=");
  output.println(boolName(authComplete_));
  output.print("INFO bt_pairing_complete=");
  output.println(boolName(pairingComplete_));
  output.print("INFO bt_paired=");
  output.println(boolName(paired_));
  output.print("INFO bt_ready_for_reports=");
  output.println(boolName(isControllerInputReady()));
  output.print("INFO bt_init_step=");
  output.println(initStep_);
  output.print("INFO bt_init_error=");
  output.println(initError_);
  output.print("INFO bt_last_drop_reason=");
  output.println(lastDropReason_);
  output.print("INFO bt_ignored_report_count=");
  output.println(ignoredReportCount_);
  output.print("INFO bt_last_ignored_report=");
  output.print(lastIgnoredReportId_);
  output.print("/");
  output.println(lastIgnoredReportLen_);
  output.print("INFO bt_last_acl_disconnect_reason=");
  output.println(lastAclDisconnectReason_);
  output.print("INFO bt_last_hid_close_status=");
  output.println(lastHidCloseStatus_);
  output.print("INFO bt_last_hid_close_conn_status=");
  output.println(lastHidCloseConnStatus_);
  output.print("INFO bt_send_report_failures=");
  output.println(sendReportFailureCount_);
  output.print("INFO bt_last_send_report_status=");
  output.println(lastSendReportStatus_);
  output.print("INFO bt_last_send_report_reason=");
  output.println(lastSendReportReason_);
  output.print("INFO bt_last_send_report_id=");
  output.println(lastSendReportId_);
  output.print("INFO bt_last_peer_reconnectable=");
  output.println(boolName(hasReconnectablePeer_));

  if (hasPeerAddress_) {
    output.print("INFO bt_last_peer=");
    output.println(formatBluetoothAddress(lastPeerAddress_));
  }
}

const char *ClassicBtControllerTransport::name() const { return CONTROL_TRANSPORT; }

bool ClassicBtControllerTransport::isHidReportChannelOpen() const {
  return connected_ && appRegistered_ && hidReady_;
}

bool ClassicBtControllerTransport::isControllerInputReady() const {
  return isHidReportChannelOpen() && paired_;
}

bool ClassicBtControllerTransport::sendCurrentInputReport(bool logFailure, bool waitForSendEvent) {
  readyForReports_ = isHidReportChannelOpen();

  if (!readyForReports_) {
    if (logFailure) {
      Serial.printf(
          "WARN bt report skipped reason=not-ready connected=%s paired=%s\n",
          boolName(connected_),
          boolName(paired_));
    }
    return false;
  }

  updateInputReport();

  const bool shouldWaitForSendEvent = waitForSendEvent && paired_;
  uint32_t expectedEventCount = 0;
  const bool shouldSendFullReport = connected_ || paired_;
  const uint8_t *payload = shouldSendFullReport ? report30_ : dummyReport_;
  const size_t payloadLength = shouldSendFullReport ? sizeof(report30_) : sizeof(dummyReport_);

  if (inputReportSendMutex_ != nullptr) {
    xSemaphoreTakeRecursive(inputReportSendMutex_, portMAX_DELAY);
  }

  reportCongested_ = false;
  const esp_err_t err = esp_bt_hid_device_send_report(
      ESP_HIDD_REPORT_TYPE_INTRDATA,
      0x30,
      payloadLength,
      const_cast<uint8_t *>(payload));
  if (err == ESP_OK) {
    inputReportSubmitCount_ += 1;
    if (shouldWaitForSendEvent) {
      expectedEventCount = inputReportSubmitCount_;
    }
  }

  if (inputReportSendMutex_ != nullptr) {
    xSemaphoreGiveRecursive(inputReportSendMutex_);
  }

  if (err != ESP_OK) {
    sendReportFailureCount_ += 1;
    if (consecutiveSendReportFailures_ < UINT8_MAX) {
      consecutiveSendReportFailures_ += 1;
    }
    lastSendReportStatus_ = static_cast<int>(err);
    lastSendReportReason_ = 0;
    lastSendReportId_ = 0x30;
    readyForReports_ = isHidReportChannelOpen();
    if (logFailure) {
      Serial.printf(
          "WARN bt send_report failed err=%s connected=%s fail_count=%lu\n",
          esp_err_to_name(err),
          boolName(connected_),
          static_cast<unsigned long>(sendReportFailureCount_));
    }
    return false;
  }

  timer_ = static_cast<uint8_t>(timer_ + 1);
  return shouldWaitForSendEvent ? waitForInputReportAccepted(expectedEventCount, logFailure) : true;
}

bool ClassicBtControllerTransport::shouldRetryAfterTransientSendFailure() const {
  return reportCongested_ && isHidReportChannelOpen();
}

bool ClassicBtControllerTransport::waitForInputReportAccepted(
    uint32_t expectedEventCount, bool logFailure) {
  const uint32_t startedAt = millis();

  while (inputReportSendEventCount_ < expectedEventCount) {
    if (millis() - startedAt >= HID_SEND_REPORT_TIMEOUT_MS) {
      if (logFailure) {
        Serial.printf(
            "WARN bt send_report timeout report=48 waited_ms=%u submitted=%lu completed=%lu\n",
            HID_SEND_REPORT_TIMEOUT_MS,
            static_cast<unsigned long>(inputReportSubmitCount_),
            static_cast<unsigned long>(inputReportSendEventCount_));
      }
      return false;
    }
    delay(1);
  }

  if (lastInputReportStatus_ != ESP_HIDD_SUCCESS) {
    if (logFailure) {
      Serial.printf(
          "WARN bt send_report rejected status=%d reason=%u report=%u\n",
          lastInputReportStatus_,
          lastInputReportReason_,
          0x30);
    }
    return false;
  }

  return true;
}

bool ClassicBtControllerTransport::waitForInputReportDrain(uint32_t timeoutMs, bool logFailure) {
  if (!paired_) {
    return true;
  }

  const uint32_t startedAt = millis();
  while (inputReportSendEventCount_ < inputReportSubmitCount_) {
    if (millis() - startedAt >= timeoutMs) {
      if (logFailure) {
        Serial.printf(
            "WARN bt send_report drain timeout waited_ms=%lu submitted=%lu completed=%lu\n",
            static_cast<unsigned long>(timeoutMs),
            static_cast<unsigned long>(inputReportSubmitCount_),
            static_cast<unsigned long>(inputReportSendEventCount_));
      }
      return false;
    }
    delay(1);
  }

  return true;
}

bool ClassicBtControllerTransport::beginExplicitInput() {
  explicitInputActive_ = true;

  if (inputReportSendMutex_ == nullptr) {
    if (!isControllerInputReady()) {
      Serial.printf(
          "WARN bt explicit_input blocked connected=%s paired=%s ready=%s\n",
          boolName(connected_),
          boolName(paired_),
          boolName(isControllerInputReady()));
      explicitInputActive_ = false;
      return false;
    }

    return true;
  }

  xSemaphoreTakeRecursive(inputReportSendMutex_, portMAX_DELAY);
  if (!isControllerInputReady()) {
    Serial.printf(
        "WARN bt explicit_input blocked connected=%s paired=%s ready=%s\n",
        boolName(connected_),
        boolName(paired_),
        boolName(isControllerInputReady()));
    xSemaphoreGiveRecursive(inputReportSendMutex_);
    explicitInputActive_ = false;
    return false;
  }

  // Before explicit input, align submit/event counters to avoid attributing
  // earlier idle-send callbacks to the new explicit send window.
  if (paired_ && inputReportSendEventCount_ < inputReportSubmitCount_) {
    uint32_t drainElapsedMs = 0;
    if (kWaitForExplicitInputDrain) {
      // The more conservative profiles can report SEND_REPORT_EVT later than
      // expected under transient congestion, so briefly wait before re-aligning.
      const uint32_t drainStart = millis();
      while (inputReportSendEventCount_ < inputReportSubmitCount_ &&
             (millis() - drainStart) < kExplicitInputDrainBudgetMs) {
        delay(1);
      }
      drainElapsedMs = millis() - drainStart;
    }
    Serial.printf(
        "INFO bt send_report drain submitted=%lu completed=%lu elapsed=%lu\n",
        static_cast<unsigned long>(inputReportSubmitCount_),
        static_cast<unsigned long>(inputReportSendEventCount_),
        static_cast<unsigned long>(drainElapsedMs));
    inputReportSubmitCount_ = inputReportSendEventCount_;
  }
  return true;
}

void ClassicBtControllerTransport::endExplicitInput() {
  if (inputReportSendMutex_ != nullptr) {
    xSemaphoreGiveRecursive(inputReportSendMutex_);
  }
  explicitInputActive_ = false;
}

bool ClassicBtControllerTransport::repeatCurrentInputReport(
    uint16_t durationMs, bool logFailure) {
  const uint32_t startedAt = millis();
  uint32_t congestionStartedAt = 0;
  bool loggedCongestionRetry = false;

  while (true) {
    if (!sendCurrentInputReport(logFailure, kWaitForExplicitInputSendEvent)) {
      if (shouldRetryAfterTransientSendFailure()) {
        if (congestionStartedAt == 0) {
          congestionStartedAt = millis();
        }

        if (!loggedCongestionRetry && logFailure) {
          loggedCongestionRetry = true;
          Serial.printf(
              "WARN bt send_report congested retry_window=%u\n",
              kHidCongestionRetryBudgetMs);
        }

        if ((millis() - congestionStartedAt) < kHidCongestionRetryBudgetMs) {
          delay(kHidCongestionRetryDelayMs);
          continue;
        }
      }

      return false;
    }

    congestionStartedAt = 0;
    loggedCongestionRetry = false;

    const uint32_t elapsed = millis() - startedAt;
    if (elapsed >= durationMs) {
      break;
    }

    const uint32_t remaining = durationMs - elapsed;
    delay(remaining < HID_REPEAT_INTERVAL_MS ? remaining : HID_REPEAT_INTERVAL_MS);
  }

  return true;
}

void ClassicBtControllerTransport::resetInputReportTracking() {
  inputReportSubmitCount_ = 0;
  inputReportSendEventCount_ = 0;
  lastInputReportStatus_ = -1;
  lastInputReportReason_ = 0;
  reportCongested_ = false;
  consecutiveSendReportFailures_ = 0;
}

void ClassicBtControllerTransport::markControllerPaired() {
  if (!paired_) {
    resetInputReportTracking();
  }
  paired_ = true;
  pairingComplete_ = true;
  hasReconnectablePeer_ = hasPeerAddress_;
}

bool ClassicBtControllerTransport::sendSubcommandReply(
    uint8_t reportId, const uint8_t *data, size_t length, const char *label) {
  readyForReports_ = isHidReportChannelOpen();

  if (!readyForReports_) {
    Serial.printf("WARN bt reply skipped reason=not-ready label=%s\n", label);
    return false;
  }

  const esp_err_t err = esp_bt_hid_device_send_report(
      ESP_HIDD_REPORT_TYPE_INTRDATA,
      reportId,
      length,
      const_cast<uint8_t *>(data));
  if (err != ESP_OK) {
    sendReportFailureCount_ += 1;
    lastSendReportStatus_ = static_cast<int>(err);
    lastSendReportReason_ = 0;
    lastSendReportId_ = reportId;
    readyForReports_ = isHidReportChannelOpen();
    Serial.printf(
        "WARN bt reply failed label=%s err=%s fail_count=%lu\n",
        label,
        esp_err_to_name(err),
        static_cast<unsigned long>(sendReportFailureCount_));
    return false;
  }

  Serial.printf("INFO bt reply label=%s report=%u len=%u\n", label, reportId, length);
  return true;
}

bool ClassicBtControllerTransport::attemptVirtualCablePlug(
    const uint8_t peerAddress[6], const char *reason) {
  if (!appRegistered_ || !hidReady_ || connected_) {
    return false;
  }

  const esp_err_t err = esp_bt_hid_device_connect(const_cast<uint8_t *>(peerAddress));
  if (err != ESP_OK) {
    Serial.printf(
        "WARN bt virtual-cable reason=%s err=%s peer=%s\n",
        reason,
        esp_err_to_name(err),
        formatBluetoothAddress(peerAddress).c_str());
    return false;
  }

  Serial.printf(
      "INFO bt virtual-cable reason=%s peer=%s\n",
      reason,
      formatBluetoothAddress(peerAddress).c_str());
  return true;
}

void ClassicBtControllerTransport::processIncomingReport(uint8_t reportId, uint16_t len, uint8_t *data) {
  if (len < 12 || data == nullptr) {
    const bool repeated = ignoredReportCount_ > 0 && lastIgnoredReportId_ == reportId &&
                          lastIgnoredReportLen_ == len;
    ignoredReportCount_ += 1;
    lastIgnoredReportId_ = reportId;
    lastIgnoredReportLen_ = len;
    if (!repeated || ignoredReportCount_ <= 5 || (ignoredReportCount_ % 20) == 0) {
      Serial.printf(
          "INFO bt intr ignored report=%u len=%u count=%lu\n",
          reportId,
          len,
          static_cast<unsigned long>(ignoredReportCount_));
    }
    return;
  }

  Serial.printf(
      "INFO bt intr report=%u len=%u subcmd=%u arg0=%u arg1=%u\n",
      reportId,
      len,
      data[9],
      data[10],
      data[11]);

  if (data[9] == 2) {
    sendSubcommandReply(0x21, kReply02, sizeof(kReply02), "reply02");
    return;
  }
  if (data[9] == 8) {
    sendSubcommandReply(0x21, kReply08, sizeof(kReply08), "reply08");
    return;
  }
  if (data[9] == 16 && data[10] == 0 && data[11] == 96) {
    sendSubcommandReply(0x21, kReplySpiAddress0, sizeof(kReplySpiAddress0), "replyspi0");
    return;
  }
  if (data[9] == 16 && data[10] == 80 && data[11] == 96) {
    sendSubcommandReply(0x21, kReplySpiAddress50, sizeof(kReplySpiAddress50), "replyspi50");
    return;
  }
  if (data[9] == 3) {
    sendSubcommandReply(0x21, kReply03, sizeof(kReply03), "reply03");
    if (kMarkPairedOnSubcommand03) {
      markControllerPaired();
    }
    return;
  }
  if (data[9] == 4) {
    sendSubcommandReply(0x21, kReply04, sizeof(kReply04), "reply04");
    return;
  }
  if (data[9] == 16 && data[10] == 128 && data[11] == 96) {
    sendSubcommandReply(0x21, kReplySpiAddress80, sizeof(kReplySpiAddress80), "replyspi80");
    return;
  }
  if (data[9] == 16 && data[10] == 152 && data[11] == 96) {
    sendSubcommandReply(0x21, kReplySpiAddress98, sizeof(kReplySpiAddress98), "replyspi98");
    return;
  }
  if (data[9] == 16 && data[10] == 16 && data[11] == 128) {
    sendSubcommandReply(0x21, kReplySpiAddress10, sizeof(kReplySpiAddress10), "replyspi10");
    return;
  }
  if (data[9] == 16 && data[10] == 61 && data[11] == 96) {
    sendSubcommandReply(0x21, kReplySpiAddress3D, sizeof(kReplySpiAddress3D), "replyspi3d");
    return;
  }
  if (data[9] == 16 && data[10] == 32 && data[11] == 96) {
    sendSubcommandReply(0x21, kReplySpiAddress20, sizeof(kReplySpiAddress20), "replyspi20");
    return;
  }
  if (data[9] == 64) {
    sendSubcommandReply(0x21, kReply4001, sizeof(kReply4001), "reply4001");
    return;
  }
  if (data[9] == 72) {
    sendSubcommandReply(0x21, kReply4801, sizeof(kReply4801), "reply4801");
    return;
  }
  if (data[9] == 34) {
    sendSubcommandReply(0x21, kReply3401, sizeof(kReply3401), "reply3401");
    return;
  }
  if (data[9] == 48) {
    markControllerPaired();
    sendSubcommandReply(0x21, kReply3001, sizeof(kReply3001), "reply3001");
    return;
  }
  if (data[9] == 33 && data[10] == 33) {
    markControllerPaired();
    sendSubcommandReply(0x21, kReply3333, sizeof(kReply3333), "reply3333");
    return;
  }
}

void ClassicBtControllerTransport::handleGapEvent(int event, void *rawParam) {
  const auto gapEvent = static_cast<esp_bt_gap_cb_event_t>(event);
  auto *param = reinterpret_cast<esp_bt_gap_cb_param_t *>(rawParam);

  switch (gapEvent) {
    case ESP_BT_GAP_AUTH_CMPL_EVT: {
      authComplete_ = param->auth_cmpl.stat == ESP_BT_STATUS_SUCCESS;
      const String peerAddress = formatBluetoothAddress(param->auth_cmpl.bda);
      Serial.printf(
          "INFO bt auth status=%d peer=%s device=\"%s\"\n",
          param->auth_cmpl.stat,
          peerAddress.c_str(),
          reinterpret_cast<const char *>(param->auth_cmpl.device_name));
      if (param->auth_cmpl.stat == ESP_BT_STATUS_SUCCESS) {
        const bool samePeer =
            hasPeerAddress_ &&
            std::memcmp(lastPeerAddress_, param->auth_cmpl.bda, sizeof(lastPeerAddress_)) == 0;
        std::memcpy(lastPeerAddress_, param->auth_cmpl.bda, sizeof(lastPeerAddress_));
        hasPeerAddress_ = true;
        if (!samePeer) {
          hasReconnectablePeer_ = false;
        }
        if (kAttemptVirtualCableOnAuthComplete) {
          // Switch 2 repeatedly authenticates then drops ACL without opening HID,
          // so proactively request the virtual cable after auth succeeds.
          attemptVirtualCablePlug(param->auth_cmpl.bda, "auth-complete");
        }
      }
      break;
    }
    case ESP_BT_GAP_PIN_REQ_EVT: {
      const uint8_t pinLength = param->pin_req.min_16_digit ? 16 : 4;
      esp_bt_pin_code_t pinCode = {};
      if (pinLength == 4) {
        pinCode[0] = '0';
        pinCode[1] = '0';
        pinCode[2] = '0';
        pinCode[3] = '0';
      }
      const String peerAddress = formatBluetoothAddress(param->pin_req.bda);
      Serial.printf(
          "INFO bt pin-request peer=%s min_16_digit=%s pin_len=%u\n",
          peerAddress.c_str(),
          boolName(param->pin_req.min_16_digit),
          static_cast<unsigned>(pinLength));
      const esp_err_t replyErr =
          esp_bt_gap_pin_reply(param->pin_req.bda, true, pinLength, pinCode);
      if (replyErr != ESP_OK) {
        Serial.printf(
            "WARN bt pin-reply failed peer=%s err=%s\n",
            peerAddress.c_str(),
            esp_err_to_name(replyErr));
      } else {
        Serial.printf(
            "INFO bt pin-reply peer=%s accepted=true pin_len=%u\n",
            peerAddress.c_str(),
            static_cast<unsigned>(pinLength));
      }
      break;
    }
    case ESP_BT_GAP_CFM_REQ_EVT: {
      const String peerAddress = formatBluetoothAddress(param->cfm_req.bda);
      Serial.printf(
          "INFO bt confirm-request peer=%s value=%lu\n",
          peerAddress.c_str(),
          static_cast<unsigned long>(param->cfm_req.num_val));
      const esp_err_t replyErr = esp_bt_gap_ssp_confirm_reply(param->cfm_req.bda, true);
      if (replyErr != ESP_OK) {
        Serial.printf(
            "WARN bt confirm-reply failed peer=%s err=%s\n",
            peerAddress.c_str(),
            esp_err_to_name(replyErr));
      } else {
        Serial.printf("INFO bt confirm-reply peer=%s accepted=true\n", peerAddress.c_str());
      }
      break;
    }
    case ESP_BT_GAP_KEY_NOTIF_EVT: {
      const String peerAddress = formatBluetoothAddress(param->key_notif.bda);
      Serial.printf(
          "INFO bt passkey-notify peer=%s value=%lu\n",
          peerAddress.c_str(),
          static_cast<unsigned long>(param->key_notif.passkey));
      break;
    }
    case ESP_BT_GAP_KEY_REQ_EVT: {
      const String peerAddress = formatBluetoothAddress(param->key_req.bda);
      Serial.printf("INFO bt passkey-request peer=%s\n", peerAddress.c_str());
      break;
    }
    case ESP_BT_GAP_MODE_CHG_EVT:
      Serial.printf("INFO bt mode-change mode=%u\n", param->mode_chg.mode);
      break;
    case ESP_BT_GAP_ACL_CONN_CMPL_STAT_EVT:
      Serial.printf("INFO bt acl-connect status=%u\n", param->acl_conn_cmpl_stat.stat);
      break;
    case ESP_BT_GAP_ACL_DISCONN_CMPL_STAT_EVT:
      Serial.printf("INFO bt acl-disconnect reason=%u\n", param->acl_disconn_cmpl_stat.reason);
      lastAclDisconnectReason_ = param->acl_disconn_cmpl_stat.reason;
      enterReconnectableState("acl-disconnect");
      break;
    default:
      break;
  }
}

void ClassicBtControllerTransport::handleHidEvent(int event, void *rawParam) {
  const auto hidEvent = static_cast<esp_hidd_cb_event_t>(event);
  auto *param = reinterpret_cast<esp_hidd_cb_param_t *>(rawParam);

  switch (hidEvent) {
    case ESP_HIDD_INIT_EVT: {
      hidReady_ = param->init.status == ESP_HIDD_SUCCESS;
      initStep_ = "hid_init_event";
      initError_ = esp_err_to_name(static_cast<esp_err_t>(param->init.status));
      Serial.printf("INFO bt hid event=init status=%d\n", param->init.status);
      if (hidReady_) {
        const esp_err_t err =
            esp_bt_hid_device_register_app(&kHidAppParam, &kHidQos, &kHidQos);
        if (err != ESP_OK) {
          Serial.printf("WARN bt register_app failed err=%s\n", esp_err_to_name(err));
        }
      }
      break;
    }
    case ESP_HIDD_REGISTER_APP_EVT:
      appRegistered_ = param->register_app.status == ESP_HIDD_SUCCESS;
      initStep_ = "register_app_event";
      initError_ = esp_err_to_name(static_cast<esp_err_t>(param->register_app.status));
      Serial.printf(
          "INFO bt hid event=register-app status=%d in_use=%s\n",
          param->register_app.status,
          param->register_app.in_use ? "true" : "false");
      if (appRegistered_) {
        esp_bt_gap_set_cod(kDeviceClass, ESP_BT_SET_COD_ALL);
        const esp_err_t err =
            esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, ESP_BT_GENERAL_DISCOVERABLE);
        discoverable_ = err == ESP_OK;
        if (err != ESP_OK) {
          initError_ = esp_err_to_name(err);
          Serial.printf("WARN bt set_scan_mode failed err=%s\n", esp_err_to_name(err));
        } else {
          initStep_ = "discoverable";
          initError_ = "ESP_OK";
        }

        if (param->register_app.in_use && param->register_app.bd_addr != nullptr) {
          reconnectLastPeerOnRegister_ = false;
          attemptVirtualCablePlug(param->register_app.bd_addr, "register-app");
        } else if (reconnectLastPeerOnRegister_ && hasPeerAddress_) {
          // Only explicit recovery resets should preferentially reconnect the
          // previously authenticated host; ordinary pairing stays neutral.
          reconnectLastPeerOnRegister_ = false;
          attemptVirtualCablePlug(lastPeerAddress_, "register-app-last-peer");
        } else {
          reconnectLastPeerOnRegister_ = false;
        }
      }
      break;
    case ESP_HIDD_OPEN_EVT:
      connected_ = param->open.status == ESP_HIDD_SUCCESS &&
                   param->open.conn_status == ESP_HIDD_CONN_STATE_CONNECTED;
      readyForReports_ = connected_ && appRegistered_ && hidReady_;
      discoverable_ = !connected_;
      reportCongested_ = false;
      consecutiveSendReportFailures_ = 0;
      if (connected_) {
        const bool samePeer =
            hasPeerAddress_ &&
            std::memcmp(lastPeerAddress_, param->open.bd_addr, sizeof(lastPeerAddress_)) == 0;
        std::memcpy(lastPeerAddress_, param->open.bd_addr, sizeof(lastPeerAddress_));
        hasPeerAddress_ = true;
        if (!samePeer) {
          hasReconnectablePeer_ = false;
        }
        esp_bt_gap_set_scan_mode(ESP_BT_NON_CONNECTABLE, ESP_BT_NON_DISCOVERABLE);
        ensureSendTask();
        sendCurrentInputReport(false);
      }
      Serial.printf(
          "INFO bt hid event=open status=%d conn=%d peer=%s\n",
          param->open.status,
          param->open.conn_status,
          connected_ ? formatBluetoothAddress(lastPeerAddress_).c_str() : "unknown");
      break;
    case ESP_HIDD_CLOSE_EVT:
      lastHidCloseStatus_ = param->close.status;
      lastHidCloseConnStatus_ = param->close.conn_status;
      enterReconnectableState("hid-close");
      Serial.printf(
          "INFO bt hid event=close status=%d conn=%d\n",
          param->close.status,
          param->close.conn_status);
      break;
    case ESP_HIDD_SEND_REPORT_EVT:
      if (param->send_report.status != ESP_HIDD_SUCCESS) {
        sendReportFailureCount_ += 1;
        if (consecutiveSendReportFailures_ < UINT8_MAX) {
          consecutiveSendReportFailures_ += 1;
        }
      } else {
        consecutiveSendReportFailures_ = 0;
      }
      lastSendReportStatus_ = param->send_report.status;
      lastSendReportReason_ = param->send_report.reason;
      lastSendReportId_ = param->send_report.report_id;
      if (param->send_report.report_id == 0x30) {
        lastInputReportStatus_ = param->send_report.status;
        lastInputReportReason_ = param->send_report.reason;
        inputReportSendEventCount_ += 1;
      }
      reportCongested_ = param->send_report.status != ESP_HIDD_SUCCESS &&
                         param->send_report.reason == kHidErrCongested;
      readyForReports_ = isHidReportChannelOpen();
      if (param->send_report.status != ESP_HIDD_SUCCESS) {
        const bool isRoutineCongestion =
            param->send_report.reason == kHidErrCongested ||
            param->send_report.reason == 0;
        const bool shouldLogSendReportWarning =
            !kSuppressRoutineCongestionWarnings || !isRoutineCongestion;
        if (shouldLogSendReportWarning) {
          Serial.printf(
              "WARN bt hid event=send-report status=%d reason=%u report=%u\n",
              param->send_report.status,
              param->send_report.reason,
              param->send_report.report_id);
        }
      }
      break;
    case ESP_HIDD_GET_REPORT_EVT:
      Serial.printf(
          "INFO bt hid event=get-report type=%d report=%u size=%u\n",
          param->get_report.report_type,
          param->get_report.report_id,
          param->get_report.buffer_size);
      break;
    case ESP_HIDD_SET_REPORT_EVT:
      Serial.printf(
          "INFO bt hid event=set-report type=%d report=%u len=%u\n",
          param->set_report.report_type,
          param->set_report.report_id,
          param->set_report.len);
      break;
    case ESP_HIDD_SET_PROTOCOL_EVT:
      Serial.printf(
          "INFO bt hid event=set-protocol protocol=%u\n",
          param->set_protocol.protocol_mode);
      break;
    case ESP_HIDD_INTR_DATA_EVT:
      processIncomingReport(
          param->intr_data.report_id,
          param->intr_data.len,
          param->intr_data.data);
      break;
    case ESP_HIDD_REPORT_ERR_EVT:
      Serial.printf(
          "WARN bt hid event=report-error status=%d reason=%u\n",
          param->report_err.status,
          param->report_err.reason);
      break;
    case ESP_HIDD_API_ERR_EVT:
      Serial.println("WARN bt hid event=api-error");
      break;
    case ESP_HIDD_DEINIT_EVT:
      hidReady_ = false;
      appRegistered_ = false;
      discoverable_ = false;
      connected_ = false;
      readyForReports_ = false;
      authComplete_ = false;
      pairingComplete_ = false;
      paired_ = false;
      Serial.printf("INFO bt hid event=deinit status=%d\n", param->deinit.status);
      break;
    case ESP_HIDD_UNREGISTER_APP_EVT:
      appRegistered_ = false;
      discoverable_ = false;
      Serial.printf("INFO bt hid event=unregister-app status=%d\n", param->unregister_app.status);
      break;
    case ESP_HIDD_VC_UNPLUG_EVT:
      enterReconnectableState("vc-unplug");
      Serial.printf(
          "INFO bt hid event=vc-unplug status=%d conn=%d\n",
          param->vc_unplug.status,
          param->vc_unplug.conn_status);
      break;
    default:
      Serial.printf("INFO bt hid event=%d\n", hidEvent);
      break;
  }
}

void ClassicBtControllerTransport::onGapEvent(int event, void *param) {
  if (instance_ != nullptr) {
    instance_->handleGapEvent(event, param);
  }
}

void ClassicBtControllerTransport::onHidEvent(int event, void *param) {
  if (instance_ != nullptr) {
    instance_->handleHidEvent(event, param);
  }
}

#else

ClassicBtControllerTransport *ClassicBtControllerTransport::instance_ = nullptr;

void ClassicBtControllerTransport::begin() {}

bool ClassicBtControllerTransport::pressButtons(
    uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) {
  (void)buttonsMask;
  delay(holdMs);
  delay(settleMs);
  return false;
}

bool ClassicBtControllerTransport::moveDirection(
    int x, int y, uint16_t holdMs, uint16_t settleMs) {
  (void)x;
  (void)y;
  delay(holdMs);
  delay(settleMs);
  return false;
}

bool ClassicBtControllerTransport::resetConnection(bool reconnectLastPeer) {
  (void)reconnectLastPeer;
  return false;
}

bool ClassicBtControllerTransport::clearStoredPeer() { return false; }

void ClassicBtControllerTransport::printStatus(Print &output) const {
  output.println("INFO bt_mode=classic-bt-disabled");
}

const char *ClassicBtControllerTransport::name() const { return CONTROL_TRANSPORT; }

bool ClassicBtControllerTransport::initializeClassicBluetooth() { return false; }
bool ClassicBtControllerTransport::initializeNvsAndBaseAddress() { return false; }
void ClassicBtControllerTransport::clearInputs() {}
void ClassicBtControllerTransport::setButtonBits(uint32_t buttonsMask) { (void)buttonsMask; }
void ClassicBtControllerTransport::setLeftStickFromVector(int x, int y) {
  (void)x;
  (void)y;
}
void ClassicBtControllerTransport::updateInputReport() {}
void ClassicBtControllerTransport::ensureSendTask() {}
bool ClassicBtControllerTransport::isHidReportChannelOpen() const { return false; }
bool ClassicBtControllerTransport::isControllerInputReady() const { return false; }
bool ClassicBtControllerTransport::sendCurrentInputReport(bool logFailure, bool waitForSendEvent) {
  (void)logFailure;
  (void)waitForSendEvent;
  return false;
}
bool ClassicBtControllerTransport::shouldRetryAfterTransientSendFailure() const { return false; }
bool ClassicBtControllerTransport::waitForInputReportAccepted(
    uint32_t expectedEventCount, bool logFailure) {
  (void)expectedEventCount;
  (void)logFailure;
  return false;
}
bool ClassicBtControllerTransport::waitForInputReportDrain(uint32_t timeoutMs, bool logFailure) {
  (void)timeoutMs;
  (void)logFailure;
  return false;
}
bool ClassicBtControllerTransport::beginExplicitInput() { return false; }
void ClassicBtControllerTransport::endExplicitInput() {}
bool ClassicBtControllerTransport::repeatCurrentInputReport(uint16_t durationMs, bool logFailure) {
  (void)durationMs;
  (void)logFailure;
  return false;
}
void ClassicBtControllerTransport::resetInputReportTracking() {}
bool ClassicBtControllerTransport::clearBondedPeerDevices() { return false; }
bool ClassicBtControllerTransport::clearPersistedPeerAddress() { return false; }
void ClassicBtControllerTransport::markControllerPaired() {}
bool ClassicBtControllerTransport::sendSubcommandReply(
    uint8_t reportId, const uint8_t *data, size_t length, const char *label) {
  (void)reportId;
  (void)data;
  (void)length;
  (void)label;
  return false;
}
void ClassicBtControllerTransport::processIncomingReport(uint8_t reportId, uint16_t len, uint8_t *data) {
  (void)reportId;
  (void)len;
  (void)data;
}
void ClassicBtControllerTransport::handleGapEvent(int event, void *param) {
  (void)event;
  (void)param;
}
void ClassicBtControllerTransport::handleHidEvent(int event, void *param) {
  (void)event;
  (void)param;
}
void ClassicBtControllerTransport::onGapEvent(int event, void *param) {
  (void)event;
  (void)param;
}
void ClassicBtControllerTransport::onHidEvent(int event, void *param) {
  (void)event;
  (void)param;
}
void ClassicBtControllerTransport::sendTaskTrampoline(void *param) { (void)param; }

#endif
