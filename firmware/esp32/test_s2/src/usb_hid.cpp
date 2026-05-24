#include "usb_hid.h"
#include <class/hid/hid_device.h>
#include <cstring>

static uint16_t btns_ = 0;
static uint8_t  hat_  = UsbHid::HAT_CENTER;
static uint8_t  lx_   = UsbHid::STICK_CENTER;
static uint8_t  ly_   = UsbHid::STICK_CENTER;
static uint8_t  rx_   = UsbHid::STICK_CENTER;
static uint8_t  ry_   = UsbHid::STICK_CENTER;
static uint8_t  rpt_[8] = {};

uint8_t const *tud_hid_descriptor_report_cb(uint8_t instance)
{
    (void)instance;
    static const uint8_t d[] = {
        0x05,0x01, 0x09,0x05, 0xa1,0x01,
        0x15,0x00,0x25,0x01, 0x35,0x00,0x45,0x01,
        0x75,0x01,0x95,0x0e,
        0x05,0x09, 0x19,0x01,0x29,0x0e,
        0x81,0x02,
        0x95,0x02, 0x81,0x01,
        0x05,0x01, 0x25,0x07, 0x46,0x3b,0x01,
        0x75,0x04, 0x95,0x01, 0x65,0x14,
        0x09,0x39, 0x81,0x42,
        0x65,0x00, 0x95,0x01, 0x81,0x01,
        0x26,0xff,0x00, 0x46,0xff,0x00,
        0x09,0x30,0x09,0x31,0x09,0x32,0x09,0x35,
        0x75,0x08, 0x95,0x04, 0x81,0x02,
        0x75,0x08, 0x95,0x01, 0x81,0x01,
        0xc0
    };
    return d;
}

uint16_t tud_hid_get_report_cb(uint8_t i, uint8_t rid, hid_report_type_t t, uint8_t *b, uint16_t len) {
    (void)i;(void)rid;
    if (t == HID_REPORT_TYPE_INPUT && len >= 8) { memcpy(b, rpt_, 8); return 8; }
    return 0;
}
void tud_hid_set_report_cb(uint8_t i, uint8_t rid, hid_report_type_t t, uint8_t const *b, uint16_t len) {
    (void)i;(void)rid;(void)t;(void)b;(void)len;
}

void UsbHid::init() {
    btns_=0; hat_=HAT_CENTER; lx_=ly_=rx_=ry_=STICK_CENTER;
    rpt_[0]=0; rpt_[1]=(uint8_t)((HAT_CENTER&0x0F)<<4);
    rpt_[2]=STICK_CENTER; rpt_[3]=STICK_CENTER;
    rpt_[4]=STICK_CENTER; rpt_[5]=STICK_CENTER; rpt_[6]=0; rpt_[7]=0;
}
bool UsbHid::isMounted()  { return tud_hid_ready(); }
void UsbHid::pressButtons(uint16_t m) { btns_ = m; }
void UsbHid::releaseAll() { btns_ = 0; lx_=ly_=rx_=ry_=STICK_CENTER; hat_=HAT_CENTER; }
void UsbHid::setLeftStick(uint8_t x, uint8_t y)  { lx_=x; ly_=y; }
void UsbHid::setRightStick(uint8_t x, uint8_t y) { rx_=x; ry_=y; }
void UsbHid::setHat(uint8_t h) { hat_ = h; }

void UsbHid::sendIdleReport() {
    releaseAll(); setLeftStick(STICK_CENTER,STICK_CENTER);
    setRightStick(STICK_CENTER,STICK_CENTER); setHat(HAT_CENTER);
    sendReport();
}

void UsbHid::sendReport() {
    rpt_[0] = (uint8_t)(btns_ & 0xFF);
    rpt_[1] = (uint8_t)((btns_ >> 8) & 0xFF) | ((hat_ & 0x0F) << 4);
    rpt_[2] = lx_; rpt_[3] = ly_; rpt_[4] = rx_; rpt_[5] = ry_;
    rpt_[6] = 0; rpt_[7] = 0;
    tud_hid_report(0, rpt_, 8);
}
