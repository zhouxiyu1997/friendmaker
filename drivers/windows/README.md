# Windows serial drivers

Bundled for the Windows x64 Friend Maker app so users can install ESP32-WROOM-32 / ESP-32S serial drivers without a separate browser download.

- CP210x / CP2102: downloaded from Silicon Labs `CP210x_Universal_Windows_Driver.zip`
  - Source: https://www.silabs.com/documents/public/software/CP210x_Universal_Windows_Driver.zip
  - Install entry: `cp210x/silabser.inf`
- CH340 / CH341: downloaded from WCH `CH341SER.EXE`
  - Source: https://www.wch-ic.com/download/file?id=65
  - Install entry: `ch341/CH341SER.EXE`

Downloaded on 2026-05-02.

SHA256:

```text
6177a9288df60af71ffed532c05d69ce545bf7a60e83517117dbdc3f7b75e7b3  cp210x/silabser.inf
d493d2e286e9b4da229a118f85a22e62e644abb97863e44d99d07aacab60028f  cp210x/silabser.cat
48786874323699bb49061a652a6ceae9b7e16360d4de0046f9e0091738566f82  ch341/CH341SER.EXE
```
