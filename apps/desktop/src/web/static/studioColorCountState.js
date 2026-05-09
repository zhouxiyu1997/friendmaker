export const COLOR_COUNT_OPTIONS_BY_MODE = {
  mono: [2],
  palette: [8, 9, 16, 18, 24, 32, 64, 84, 128],
  official: [8, 16, 32, 64, 84],
};

export function isStudioColorCountMode(mode) {
  return mode === "palette" || mode === "official";
}

export function getStudioColorCountFallback(mode) {
  const options = COLOR_COUNT_OPTIONS_BY_MODE[mode] ?? [32];
  return options.includes(32) ? 32 : options[0];
}

export function rememberStudioColorCount(colorCountByMode, mode, value) {
  if (!isStudioColorCountMode(mode)) {
    return colorCountByMode;
  }

  return {
    ...colorCountByMode,
    [mode]: value,
  };
}

export function syncStudioColorCountState({ colorMode, colorCount, colorCountByMode }) {
  const nextOptions = COLOR_COUNT_OPTIONS_BY_MODE[colorMode] ?? [32];
  const currentValue = isStudioColorCountMode(colorMode)
    ? colorCountByMode[colorMode] ?? getStudioColorCountFallback(colorMode)
    : colorCount;
  const fallbackValue = getStudioColorCountFallback(colorMode);
  const normalizedValue = nextOptions.includes(currentValue) ? currentValue : fallbackValue;

  return {
    colorCount: normalizedValue,
    colorCountByMode: rememberStudioColorCount(colorCountByMode, colorMode, normalizedValue),
  };
}
