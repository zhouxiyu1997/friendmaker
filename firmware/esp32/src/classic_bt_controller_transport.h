#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "controller_transport.h"

class ClassicBtControllerTransport : public ControllerTransport {
 public:
  void begin() override;
  bool pressButtons(uint32_t buttonsMask, uint16_t holdMs, uint16_t settleMs) override;
  bool moveDirection(int x, int y, uint16_t holdMs, uint16_t settleMs) override;
  bool resetConnection() override;
  void printStatus(Print &output) const override;
  const char *name() const override;

 private:
  bool initializeClassicBluetooth();
  bool initializeNvsAndBaseAddress();
  bool shutdownClassicBluetooth();
  void clearConnectionState();
  void clearInputs();
  void setButtonBits(uint32_t buttonsMask);
  void setLeftStickFromVector(int x, int y);
  void updateInputReport();
  void ensureSendTask();
  bool isHidReportChannelOpen() const;
  bool isControllerInputReady() const;
  bool waitForInputReportAck();
  bool sendCurrentInputReport(bool logFailure, bool waitForCallback = false);
  bool sendSubcommandReply(uint8_t reportId, const uint8_t *data, size_t length, const char *label);
  bool attemptVirtualCablePlug(const uint8_t peerAddress[6], const char *reason);
  void enterReconnectableState(const char *reason);
  void processIncomingReport(uint8_t reportId, uint16_t len, uint8_t *data);
  void handleGapEvent(int event, void *param);
  void handleHidEvent(int event, void *param);

  static void onGapEvent(int event, void *param);
  static void onHidEvent(int event, void *param);
  static void sendTaskTrampoline(void *param);

  static ClassicBtControllerTransport *instance_;

  bool stackStarted_ = false;
  bool bluedroidReady_ = false;
  bool gapReady_ = false;
  bool hidReady_ = false;
  bool appRegistered_ = false;
  bool discoverable_ = false;
  bool connected_ = false;
  bool readyForReports_ = false;
  bool authComplete_ = false;
  bool pairingComplete_ = false;
  bool paired_ = false;
  uint8_t timer_ = 0;
  const char *initStep_ = "idle";
  const char *initError_ = "none";
  uint8_t buttonsRight_ = 0;
  uint8_t buttonsShared_ = 0;
  uint8_t buttonsLeft_ = 0;
  uint8_t leftStickX_ = 128;
  uint8_t leftStickY_ = 128;
  uint8_t rightStickX_ = 128;
  uint8_t rightStickY_ = 128;
  uint8_t report30_[48] = {};
  uint8_t dummyReport_[11] = {};
  TaskHandle_t sendTaskHandle_ = nullptr;
  uint8_t lastPeerAddress_[6] = {};
  bool hasPeerAddress_ = false;
  uint32_t ignoredReportCount_ = 0;
  uint8_t lastIgnoredReportId_ = 0;
  uint16_t lastIgnoredReportLen_ = 0;
  uint8_t lastAclDisconnectReason_ = 0;
  int lastHidCloseStatus_ = -1;
  int lastHidCloseConnStatus_ = -1;
  int lastSendReportStatus_ = -1;
  uint8_t lastSendReportReason_ = 0;
  uint8_t lastSendReportId_ = 0;
  uint32_t sendReportFailureCount_ = 0;
  volatile bool explicitInputReportActive_ = false;
  volatile bool inputReportAckPending_ = false;
  volatile bool inputReportAckReady_ = false;
  volatile int inputReportAckStatus_ = -1;
  volatile uint8_t inputReportAckReason_ = 0;
  const char *lastDropReason_ = "none";
};
