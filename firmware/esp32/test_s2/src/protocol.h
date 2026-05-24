#pragma once

#include <Arduino.h>

#include "controller.h"

bool executeCommand(const String &line, SwitchController &controller, String &error);
