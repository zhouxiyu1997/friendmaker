---
version: alpha
name: Friend Maker Clay Studio
description: A desktop-first Clay-inspired design system for Friend Maker, an Electron control console for Nintendo Switch auto drawing, ESP32 firmware flashing, and controller diagnostics. The system adapts Clay's warm cream canvas, oat borders, saturated swatch cards, rounded geometry, and playful hard-shadow interaction to a dense utility app without changing product logic.

colors:
  clay-black: "#000000"
  pure-white: "#ffffff"
  warm-cream: "#faf9f7"
  matcha-300: "#84e7a5"
  matcha-600: "#078a52"
  matcha-800: "#02492a"
  slushie-500: "#3bd3fd"
  slushie-800: "#0089ad"
  lemon-400: "#f8cc65"
  lemon-500: "#fbbd41"
  lemon-700: "#d08a11"
  ube-300: "#c1b0ff"
  ube-800: "#43089f"
  pomegranate-400: "#fc7981"
  blueberry-800: "#01418d"
  warm-silver: "#9f9b93"
  warm-charcoal: "#55534e"
  oat-border: "#dad4c8"
  oat-light: "#eee9df"
  focus-ring: "#146ef5"
  success: "#078a52"
  warning: "#9d6a09"
  error: "#b4232e"

typography:
  display-lg:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 42px
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: 0px
  display-md:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 32px
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: 0px
  title-lg:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0px
  title-md:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: 0px
  title-sm:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 16px
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: 0px
  body-md:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0px
  body-sm:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0px
  caption:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0px
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0px
  button:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0px
  code:
    fontFamily: "SFMono-Regular, Space Mono, JetBrains Mono, IBM Plex Mono, Menlo, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px

spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  desktop-gap: 16px

radii:
  input: 4px
  small-card: 8px
  button: 12px
  panel: 16px
  feature-card: 24px
  section: 40px
  pill: 9999px

elevation:
  clay-shadow: "rgba(0,0,0,0.10) 0px 1px 1px, rgba(0,0,0,0.04) 0px -1px 1px inset, rgba(0,0,0,0.05) 0px -0.5px 1px"
  hard-offset: "#000000 -6px 6px 0"
  focus: "0 0 0 3px rgba(20,110,245,0.22)"

components:
  app-shell:
    backgroundColor: "{colors.warm-cream}"
    textColor: "{colors.clay-black}"
    maxWidth: 1460px
    padding: 18px 16px 52px
  hero:
    backgroundColor: "{colors.warm-cream}"
    border: "1px solid {colors.oat-border}"
    radius: "{radii.section}"
    shadow: "{elevation.clay-shadow}"
  nav-tab-active:
    backgroundColor: "{colors.clay-black}"
    textColor: "{colors.pure-white}"
    radius: "{radii.feature-card}"
  nav-tab:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.warm-charcoal}"
    border: "1px solid {colors.oat-border}"
    radius: "{radii.feature-card}"
  panel:
    backgroundColor: "{colors.pure-white}"
    border: "1px solid {colors.oat-border}"
    radius: "{radii.feature-card}"
    shadow: "{elevation.clay-shadow}"
  panel-dashed:
    backgroundColor: "{colors.warm-cream}"
    border: "1px dashed {colors.oat-border}"
    radius: "{radii.feature-card}"
  button-primary:
    backgroundColor: "{colors.clay-black}"
    textColor: "{colors.pure-white}"
    height: 44px
    radius: "{radii.button}"
    hover: "rotate(-2deg) translateY(-2px), hard-offset shadow"
  button-secondary:
    backgroundColor: "{colors.pure-white}"
    textColor: "{colors.clay-black}"
    border: "1px solid {colors.oat-border}"
    height: 44px
    radius: "{radii.button}"
  input:
    backgroundColor: "{colors.pure-white}"
    border: "1px solid {colors.oat-border}"
    height: 44px
    radius: "{radii.input}"
  status-warning:
    backgroundColor: "{colors.lemon-500}"
    textColor: "{colors.clay-black}"
    radius: "{radii.feature-card}"
  status-success:
    backgroundColor: "{colors.matcha-300}"
    textColor: "{colors.clay-black}"
    radius: "{radii.feature-card}"
  status-error:
    backgroundColor: "{colors.pomegranate-400}"
    textColor: "{colors.clay-black}"
    radius: "{radii.feature-card}"
  code-surface:
    backgroundColor: "{colors.blueberry-800}"
    textColor: "{colors.pure-white}"
    radius: "{radii.feature-card}"
---

# Design System: Friend Maker Clay Studio

## 1. Visual Theme & Atmosphere

Friend Maker is a practical desktop console for a hardware-assisted drawing workflow. The UI must feel warm and handcrafted like Clay, but it must still behave like an operational tool: dense enough for repeated use, clear enough for device troubleshooting, and honest about the sequence required before drawing.

The visual atmosphere is a warm cream canvas (`#faf9f7`) with tactile white panels, oat borders, dashed secondary containers, and saturated state cards. The color names should feel intentionally playful: Matcha for success and readiness, Lemon for attention, Slushie for active processing, Ube for secondary orientation, Pomegranate for destructive or failed states, and Blueberry for logs and command surfaces.

Do not turn the app into a marketing landing page. The first viewport must keep the actual workflow visible: image input, connection readiness, firmware controls, controller testing, preview, logs, and script output.

## 2. Color Palette & Roles

### Base

- Clay Black (`#000000`): primary text, primary actions, active nav.
- Pure White (`#ffffff`): cards, form controls, secondary buttons.
- Warm Cream (`#faf9f7`): app canvas and warm page floor.
- Oat Border (`#dad4c8`): primary borders and structural dividers.
- Oat Light (`#eee9df`): secondary panel fills and quiet separators.
- Warm Silver (`#9f9b93`): secondary text.
- Warm Charcoal (`#55534e`): muted body text and support copy.

### Swatches

- Matcha 300 (`#84e7a5`): success, connected, ready-to-send.
- Matcha 600 (`#078a52`): success text or compact success accents.
- Matcha 800 (`#02492a`): deep green dark feature panels when white text is required.
- Slushie 500 (`#3bd3fd`): running, refreshing, active process markers.
- Lemon 500 (`#fbbd41`): attention, required setup, missing readiness.
- Ube 300 (`#c1b0ff`): secondary feature panels, page orientation.
- Ube 800 (`#43089f`): high-contrast purple accents only.
- Pomegranate 400 (`#fc7981`): failed state and recovery prompts.
- Blueberry 800 (`#01418d`): code, logs, command output.

## 3. Typography Rules

Use the system Inter stack for all UI. Clay's reference display face and negative tracking are not used in this app because dense desktop controls need predictable text fitting and zero letter spacing. Hierarchy comes from size, weight, spacing, border rhythm, and swatch placement.

| Role | Size | Weight | Line Height | Use |
| --- | ---: | ---: | ---: | --- |
| Display Large | 42px | 650 | 1.05 | App title and hero statement |
| Display Medium | 32px | 650 | 1.10 | Page intro headings |
| Title Large | 24px | 700 | 1.20 | Major panel headings |
| Title Medium | 18px | 700 | 1.35 | Status cards and feature blocks |
| Title Small | 16px | 650 | 1.40 | Field groups and compact cards |
| Body | 16px | 400 | 1.55 | Primary instructions |
| Body Small | 14px | 400 | 1.55 | Supporting copy |
| Label | 12px | 700 | 1.30 | Compact tags and metadata |
| Button | 14px | 700 | 1.00 | Buttons |
| Code | 13px | 400 | 1.50 | Logs and command output |

## 4. Component Stylings

### Navigation

Use a sticky segmented toolbar. Active tabs are Clay Black with white text. Inactive tabs are white cards with oat borders. Each tab includes a concise title and one-line metadata.

### Panels

Default panels use Pure White, Oat Border, 24px radius, and Clay's multi-layer shadow. Secondary informational blocks may use Warm Cream with dashed borders. Avoid stacking cards inside cards unless the nested card is a repeated item or a status component.

### Buttons

Primary buttons are black, 44px high, 12px radius. Secondary buttons are white or warm cream with oat borders. Hover states can rotate slightly and use a hard offset shadow, but they must not resize the layout. Disabled states use reduced opacity and preserve the same dimensions.

### Forms

Every control has a visible label. Inputs and selects are 44px high, white, 4px radius, and oat-bordered. Focus states use the blue focus ring (`#146ef5`) so keyboard users can clearly see position.

### Status Cards

Status cards use saturated Clay colors and one sentence of plain-language status before details:

- Lemon: needs setup, missing port, waiting for confirmation.
- Slushie: running, refreshing, installing, compiling.
- Matcha: connected, ready, success.
- Pomegranate: failed, blocked, recovery needed.

### Logs & Scripts

Logs and command output use Blueberry 800 or Matcha 800 dark surfaces with white text and monospace type. They should feel like machine surfaces embedded in a warm studio, not generic gray terminals.

## 5. Layout Principles

The app is desktop-first with responsive fallback. The primary studio page uses a control column and a preview/output column. Firmware and controller pages use two-column diagnostic layouts. Major workflow headings should be visible, but supporting copy should be concise so operators can keep controls in view.

Use 16px gaps for dense desktop grids, 24px panel padding, and 32px for large hero and status spacing. On small screens, collapse to one column, keep 44px touch targets, and avoid horizontal scrolling.

## 6. Depth & Elevation

Depth should come from three sources:

- Warm surface contrast: cream canvas, white cards, oat borders.
- Clay shadow: subtle multi-layer + inset highlight for panels.
- Hard offset shadow: only on interactive hover/pressed states.

Avoid gray drop-shadow stacks, gradient blobs, dark generic app chrome, and decorative effects that do not support the workflow.

## 7. Responsive Behavior

| Breakpoint | Behavior |
| --- | --- |
| `< 760px` | Single-column panels, full-width actions, stacked nav tabs, tighter hero copy |
| `760-1120px` | Single-column major layout, two-column internal groups when space allows |
| `1120px+` | Full desktop two-column studio and diagnostic grids |

Keep all buttons at least 44px high. Keep focus rings visible. Use `scroll-margin-top` on pages so sticky navigation never hides the active section.

## 8. Do's and Don'ts

### Do

- Use Warm Cream as the canvas.
- Use Oat Border instead of cool gray.
- Use saturated swatches for real state and orientation.
- Keep the first screen functional.
- Preserve visible labels, focus states, and 44px targets.
- Keep text short and operational.

### Don't

- Do not modify drawing, serial, firmware, or controller logic for UI-only changes.
- Do not use cool gray app backgrounds.
- Do not use emoji as structural icons.
- Do not add decorative orb/blob backgrounds.
- Do not hide primary workflow controls below marketing-style storytelling.
- Do not use negative letter spacing in implementation.
