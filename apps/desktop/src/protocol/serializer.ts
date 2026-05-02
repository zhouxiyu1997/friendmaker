import type { DrawCommand } from "./commands.js";

export function serializeCommand(command: DrawCommand): string {
  switch (command.type) {
    case "home":
      return "H";
    case "move":
      return `M ${command.dx} ${command.dy}`;
    case "draw":
      return "P";
    case "line":
      return `L ${command.dx} ${command.dy}`;
    case "press":
      return command.button;
    case "color":
      return `C ${command.index}`;
    case "basicPaletteReset":
      return "BC RESET";
    case "paletteConfig":
      return `PC ${command.slot} ${command.colorHex}`;
    case "basicPaletteConfig":
      return `BC ${command.slot} ${command.row} ${command.col}`;
    case "wait":
      return `W ${command.ms}`;
    case "pause":
      return "S";
    case "resume":
      return "R";
    case "end":
      return "E";
    default:
      throw new Error(`Unknown command: ${JSON.stringify(command)}`);
  }
}

export function serializeCommands(commands: DrawCommand[]): string[] {
  return commands.map(serializeCommand);
}
