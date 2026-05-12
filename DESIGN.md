---
version: alpha
name: Friend Maker
description: Warm cream desktop tool with Animal Crossing illustration accents on a professional panel-based layout.
colors:
  neutral: "#F7F1DF"
  surface: "#FFFDF5"
  surface-muted: "#F1E8D1"
  divider: "#EAE0C6"
  text: "#3E2F22"
  text-muted: "#6B5944"
  primary: "#2E7B4E"
  on-primary: "#FFFDF5"
  accent: "#8B3F14"
  accent-muted: "#78634B"
  ac-mint: "#8FD2B4"
  ac-leaf: "#65AD7C"
  ac-cream: "#F5E5B0"
  ac-butter: "#F5D067"
  ac-coral: "#F4A278"
  ac-lilac: "#C6A5DC"
  ac-cocoa: "#8A6A4A"
  ac-edge: "#A88A6E"
  success: "#2E7B4E"
  warning: "#8B5E1C"
  danger: "#AC4A26"
  on-danger: "#FFFDF5"
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.3
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  label-lg:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.2
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  panel-padding: 12px
  toolbar-height: 40px
  sidebar-width: 200px
  titlebar-height: 38px
  statusbar-height: 24px
rounded:
  none: 0px
  sm: 6px
  md: 10px
  lg: 16px
  xl: 22px
  pill: 999px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 14px
  button-primary-hover:
    backgroundColor: "{colors.ac-leaf}"
    textColor: "{colors.text}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 14px
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.md}"
    height: 32px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: 30px
  panel:
    backgroundColor: "{colors.neutral}"
    rounded: "{rounded.none}"
    padding: "{spacing.panel-padding}"
  panel-header:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    height: 36px
  toolbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: 40px
  sidebar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    width: 200px
  sidebar-item-active:
    backgroundColor: "{colors.ac-cream}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
  sidebar-item-inactive:
    backgroundColor: transparent
    textColor: "{colors.accent-muted}"
  status-connected:
    backgroundColor: "{colors.success}"
    size: 8px
    rounded: "{rounded.pill}"
  status-disconnected:
    backgroundColor: "{colors.danger}"
    size: 8px
    rounded: "{rounded.pill}"
  status-pending:
    backgroundColor: "{colors.warning}"
    size: 8px
    rounded: "{rounded.pill}"
  statusbar:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-muted}"
    height: 24px
  section-hero:
    backgroundColor: "{colors.ac-coral}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    size: 48px
  section-hero-firmware:
    backgroundColor: "{colors.ac-leaf}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    size: 48px
  section-hero-controller:
    backgroundColor: "{colors.ac-butter}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    size: 48px
  section-hero-timing:
    backgroundColor: "{colors.ac-lilac}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    size: 48px
  illustration-badge:
    backgroundColor: "{colors.ac-cocoa}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    size: 36px
  illustration-border:
    backgroundColor: "{colors.ac-edge}"
    rounded: "{rounded.lg}"
    size: 1px
  tag-chip:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: "{spacing.sm}"
  progress-bar:
    backgroundColor: "{colors.ac-mint}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: 6px
  divider:
    backgroundColor: "{colors.divider}"
    height: 1px
  tooltip:
    backgroundColor: "{colors.ac-cocoa}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 8px
  log-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  popover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  link:
    textColor: "{colors.ac-leaf}"
---

# Friend Maker Desktop Design System

## Overview

Friend Maker is a desktop utility for automated drawing on Nintendo Switch. It controls an ESP32 that emulates a Switch Pro Controller to execute pixel art drawing scripts. The app is distributed as an Electron desktop application on macOS and Windows.

This design system combines the warm, approachable aesthetic of the Tamagotchi Diary project (cream backgrounds, Animal Crossing accent colors, rounded shapes) with a desktop-first panel-based layout optimized for tool usage. The result is a professional utility that feels friendly and inviting rather than cold and technical.

The design philosophy:

- Warm and approachable while remaining information-dense
- Panel-based fixed layout for desktop efficiency (no page scrolling)
- Cream/neutral light theme that reduces eye strain during long drawing sessions
- Animal Crossing accent colors for status, progress, and section identity
- Persistent hardware status visibility without page switching
- Immediate response feel with minimal, purposeful animation

## Colors

The palette uses the same warm cream foundation as Tamagotchi Diary, adapted for a desktop tool context where hardware status colors must be immediately readable.

- **Neutral (#F7F1DF):** The warm cream page base. Used for panel backgrounds and the primary workspace surface. Not pure white — the warmth reduces harshness during long sessions.
- **Surface (#FFFDF5):** Slightly brighter than neutral. Used for the sidebar, toolbar, cards, and elevated containers to create subtle depth without shadows.
- **Surface-muted (#F1E8D1):** Darker cream for panel headers, status bar, and input backgrounds. Creates an inset effect for editable areas.
- **Divider (#EAE0C6):** Hairline separators between panels. Never thicker than 1px.
- **Text (#3E2F22):** Warm deep brown replacing pure black. Easier on the eyes while maintaining strong contrast on cream backgrounds.
- **Text-muted (#6B5944):** Secondary information, timestamps, metadata. Contrast ratio ~5.4:1 on neutral background.
- **Primary (#2E7B4E):** Forest green for the primary CTA (Start Drawing, Flash Firmware). Darkened to ensure white text contrast >= 5:1.
- **Accent (#AE501C):** Warm orange-brown for active navigation items and highlighted controls.
- **AC accent colors:** Mint, leaf, cream, butter, coral, lilac, cocoa — used for section identity, progress indicators, status badges, and illustration accents. These bring the Animal Crossing warmth without overwhelming the tool interface.
- **Status semantics:** Success (primary green) for connected/complete, Warning (#8B5E1C) for pending/attention, Danger (#AC4A26) for disconnected/error.

## Typography

Inter for all UI text (optimized for small sizes on screen), JetBrains Mono for technical output. The warm aesthetic comes from color and shape, not from decorative fonts.

- **Headlines:** Inter Bold/Semibold at 14-18px for panel titles and section headers. Compact because the panel layout reduces the need for large headings.
- **Body:** Inter Regular at 13px as the base reading size. Desktop tool convention (VS Code, Figma) for information density.
- **Labels:** Inter Medium at 11-12px for form labels, status badges, timestamps. Medium weight ensures legibility at small sizes.
- **Mono:** JetBrains Mono at 11-12px for serial port logs, command scripts, device responses. Monospace improves scanability of structured output.

## Layout

The layout uses a fixed panel-based structure (desktop tool convention) while maintaining the warm, rounded aesthetic of the Tamagotchi Diary style.

```
┌─────────────────────────────────────────────────────────┐
│  Title Bar (38px) — App name + window controls           │
├──────────┬──────────────────────────────────────────────┤
│          │  Toolbar (40px) — Port select + status + ops  │
│          ├─────────────────────┬────────────────────────┤
│ Sidebar  │                     │                        │
│ (200px)  │   Main Panel        │   Side Panel           │
│          │   (flexible)        │   (preview/status/log) │
│ Nav +    │                     │                        │
│ Status   │   Primary workspace │   Contextual info      │
│          │                     │                        │
├──────────┴─────────────────────┴────────────────────────┤
│  Status Bar (24px) — Port + controller + progress        │
└─────────────────────────────────────────────────────────┘
```

Key differences from a typical dark-theme tool:

- Panels use `neutral` (#F7F1DF) backgrounds instead of dark grays
- Panel separators are warm `divider` (#EAE0C6) hairlines, not cold borders
- The sidebar uses `surface` (#FFFDF5) to subtly lift it from the workspace
- Active sidebar items get an `ac-cream` highlight with `accent` text
- Cards within panels use `rounded.lg` (16px) for the friendly rounded feel
- Panel edges themselves remain straight (0px radius) for space efficiency

The spacing scale uses 8px base with 4px micro-adjustments. Toolbar and status bar are fixed; only panel content scrolls internally. Internal panel padding is 12px — compact but not cramped.

### Sidebar Navigation

Replaces the current tab navigation bar:

| Icon | Label | Section | Identity Color |
|------|-------|---------|---------------|
| Brush | Script | Image processing + drawing | ac-coral |
| Chip | Firmware | Compile + flash | ac-leaf |
| Controller | Controller | Pair + test | ac-butter |
| Timer | Timing | Debug parameters | ac-lilac |

Sidebar bottom permanently shows:
- Serial port connection status (green/red dot + device name)
- Controller pairing status

## Elevation & Depth

Depth is conveyed through warm tonal layering. The light theme allows subtle shadows to work effectively.

- **Base layer (Neutral #F7F1DF):** Main panel workspace background.
- **Surface layer (#FFFDF5):** Sidebar, toolbar, cards. One step brighter to lift above the base.
- **Muted layer (#F1E8D1):** Panel headers, status bar, input backgrounds. Creates inset/recessed feel.
- **Cards:** Use soft warm shadow `rgba(62, 42, 31, 0.08)` with 4px Y-offset and 12px blur. No harsh edges.
- **Popovers/dropdowns:** Stronger shadow `rgba(62, 42, 31, 0.15)` with 8px Y-offset and 24px blur, plus `rounded.xl` (22px).
- **Illustration badges:** Small squircle accents (section heroes, status icons) use the AC-style offset shadow: `ac-cocoa` at 30% opacity, 2px Y-offset, 0px blur — a subtle "sticker" effect at small sizes only.

## Shapes

The shape language blends desktop tool efficiency (straight panel edges) with the warm rounded aesthetic (cards, buttons, badges).

- **Panels and separators:** 0px radius. Panels tile edge-to-edge for maximum space.
- **Buttons and inputs:** 10px radius (md). Noticeably rounded, friendly feel.
- **Cards within panels:** 16px radius (lg). The primary visual warmth carrier.
- **Popovers and dialogs:** 22px radius (xl). Clearly floating above the workspace.
- **Status badges and chips:** 999px (pill). Fully rounded capsules.
- **Small illustration accents:** 16px radius (lg) squircle with 1px `ac-edge` hairline border.

This creates a clear hierarchy: structural elements are efficient (straight), interactive elements are friendly (rounded), floating elements are soft (very rounded).

## Components

### Sidebar

The sidebar uses `surface` background with warm dividers. Navigation items are vertically stacked with icon + label. Active item gets `ac-cream` background highlight and `accent` (#AE501C) text color. Inactive items use `accent-muted` (#78634B). The bottom section permanently displays hardware connection status with colored dots.

### Toolbar

A 40px horizontal bar at the top of the main content area. Contains the serial port dropdown selector, connect/disconnect button, and global action buttons. Uses `surface` background with a bottom `divider` hairline.

### Cards

Content within panels is organized in cards with `surface` background, `rounded.lg` (16px), and soft warm shadow. Cards contain section-specific controls (image upload area, firmware options, controller test buttons).

### Buttons

32px height, 10px radius. Primary buttons use forest green (`primary`) with white text for the single most important action. Ghost buttons for secondary actions. Danger buttons (`danger` #AC4A26) for destructive operations like force-stop.

### Inputs

30px height, 6px radius, `surface` background on the `neutral` panel base (creating subtle depth). Focus state adds a 2px `primary` border. Dropdown selectors (serial port, baud rate) use the same style.

### Status Bar

24px fixed bar at the bottom. `surface-muted` background. Shows: serial port status (dot + name), controller status (dot + type), drawing progress (mini progress bar using `ac-mint`), app version. All in `label-sm` typography.

### Progress Indicators

Drawing progress uses a 6px-tall pill-shaped bar with `ac-mint` fill on `surface-muted` background. Percentage text in `label-sm`. The warm green provides positive feedback without the harshness of a saturated progress bar.

### Log Panel

Uses `surface` background with `mono-md` typography. Auto-scrolls during active output. Timestamps in `text-muted`, errors highlighted with `danger` text color, success messages in `primary` green. Right-click context menu for copy/clear.

### Section Hero Badges

Small (48px) squircle illustrations at the top of each functional section, using the section's identity color (coral for script, leaf for firmware, butter for controller, lilac for timing). These bring the Animal Crossing warmth into the tool interface without overwhelming it. Each has a 1px `ac-edge` hairline border and the subtle sticker shadow.

## Do's and Don'ts

- Do keep all hardware status visible in the status bar at all times
- Do support keyboard shortcuts for all primary actions (Ctrl+Enter to start, Ctrl+R to refresh ports)
- Do accept image drag-and-drop anywhere in the window
- Do use native OS file dialogs instead of web-style file inputs
- Do remember window size and position between sessions
- Do show a system notification when a long drawing task completes while minimized
- Do use the warm cream palette consistently — never fall back to cold grays or pure white
- Do use AC accent colors for section identity and status, keeping them contained to badges and indicators
- Do use rounded cards (16px) within straight-edged panels for visual warmth
- Do use soft warm shadows (brown-tinted, not black) for depth
- Don't use hero sections, large headings, or introductory text (this is a tool, not a landing page)
- Don't use gradient backgrounds or glassmorphism effects
- Don't use pure white (#FFFFFF) backgrounds or pure black (#000000) text
- Don't use cold gray tones anywhere in the interface
- Don't spread AC accent colors across large surfaces — keep them in small badges and indicators
- Don't use animations longer than 200ms (desktop tools should feel instant)
- Don't require scrolling to see the preview while adjusting parameters
- Don't hide hardware connection status behind navigation
- Don't use emoji as icons; use Lucide Icons consistently
- Don't sacrifice information density for decoration — warmth comes from color and shape, not spacing
