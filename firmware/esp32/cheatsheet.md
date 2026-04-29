Rebuild:
```sh
pio run
```

Clean + full rebuild:
```sh
pio run -t clean
pio run
```

Upload firmware to device:
```sh
pio run -t upload
```

If auto-detect port fails, specify it:
```sh
pio run -t upload --upload-port /dev/cu.usbserial-XXXX
```

Optional serial monitor after flashing:
```sh
pio device monitor -b 115200
```

If you want a non-default board env, add -e <env_name>, for example:
```sh
pio run -e nodemcu_32s_wireless -t upload
```

check currently detected serial devices
```sh
pio device list
```