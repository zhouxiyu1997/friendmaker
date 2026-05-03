export const OFFICIAL_COLOR_GRID = [
  ["#ffffff", "#f1eff8", "#f0f0f8", "#f0f7ff", "#f0fbf4", "#f0f4ee", "#f5faf0", "#fdfdee", "#fef3ef", "#faf0f0", "#fdeddc", "#fe2500"],
  ["#ebebeb", "#cfc8e9", "#c7cde7", "#c8e9fd", "#c8f1d7", "#c7dbc8", "#daeec8", "#fbf9c8", "#fcd6c9", "#efc9c8", "#e4cfb0", "#fffb00"],
  ["#d5d5d3", "#a592d7", "#919fd5", "#92e6ba", "#92bdba", "#92bd94", "#bbe294", "#faf592", "#fbb491", "#e29691", "#caa976", "#07f900"],
  ["#bcbcbc", "#6527c2", "#004ac0", "#06c2fe", "#00da90", "#019616", "#92d314", "#f9f000", "#f78400", "#d42700", "#91610d", "#02fdff"],
  ["#9c9d9a", "#5620aa", "#003fa4", "#02a5d8", "#03bc7b", "#03800e", "#7db50c", "#d6ce00", "#d57100", "#b62100", "#774200", "#0432fe"],
  ["#727272", "#421785", "#003281", "#0084ab", "#009360", "#00650c", "#628e0d", "#a9a200", "#a85801", "#901600", "#5d380c", "#8836ff"],
  ["#000000", "#22094c", "#001648", "#014963", "#025435", "#013800", "#355100", "#605d00", "#602e01", "#510c01", "#34220d", "#ff36c3"],
] as const;

export const OFFICIAL_PALETTE_ROWS = OFFICIAL_COLOR_GRID.length;
export const OFFICIAL_PALETTE_COLS = OFFICIAL_COLOR_GRID[0]?.length ?? 0;
export const OFFICIAL_PALETTE = OFFICIAL_COLOR_GRID.flat();

export interface OfficialPaletteCell {
  index: number;
  row: number;
  col: number;
  colorHex: string;
}

export function clampOfficialPaletteIndex(index: number): number {
  if (index < 0) {
    return 0;
  }

  if (index >= OFFICIAL_PALETTE.length) {
    return OFFICIAL_PALETTE.length - 1;
  }

  return index;
}

export function officialPaletteCellFromIndex(index: number): OfficialPaletteCell {
  const safeIndex = clampOfficialPaletteIndex(index);
  const row = Math.floor(safeIndex / OFFICIAL_PALETTE_COLS);
  const col = safeIndex % OFFICIAL_PALETTE_COLS;

  return {
    index: safeIndex,
    row,
    col,
    colorHex: OFFICIAL_PALETTE[safeIndex] ?? OFFICIAL_PALETTE[0] ?? "#000000",
  };
}
