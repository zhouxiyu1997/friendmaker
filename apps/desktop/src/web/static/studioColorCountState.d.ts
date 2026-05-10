export const COLOR_COUNT_OPTIONS_BY_MODE: {
  mono: number[];
  palette: number[];
  official: number[];
};

export function isStudioColorCountMode(mode: string): boolean;
export function getStudioColorCountFallback(mode: string): number;
export function rememberStudioColorCount(
  colorCountByMode: {
    palette: number;
    official: number;
  },
  mode: string,
  value: number,
): {
  palette: number;
  official: number;
};
export function syncStudioColorCountState(input: {
  colorMode: string;
  colorCount: number;
  colorCountByMode: {
    palette: number;
    official: number;
  };
}): {
  colorCount: number;
  colorCountByMode: {
    palette: number;
    official: number;
  };
};
