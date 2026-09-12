// ─── Scribble palette — Tokyo Night Storm ────────────────────────────────────
//
// Research-backed scheme, v2 (cross-reference: folke/tokyonight.nvim,
// extras/lua/tokyonight_storm.lua — verified primary source). Replaces the
// previous Flexoki-based warm scheme, which read DULL: Flexoki's warm
// gray-brown ground (#282726, hue ~30°, near-zero chroma) swallowed its own
// warm accents and gave cool accents no complementary opposition.
//
// Why Tokyo Night Storm reads vibrant (research findings):
// - Blue-violet-tinted ground (#24283b, hue 226°, S 24%) is an ACTIVE
//   chromatic field — saturated accents pop against it instead of
//   assimilating into it.
// - Accent lightness 59–78% (not 75%+): high-saturation + high-lightness =
//   pastel (Catppuccin); high-saturation + mid-lightness = vivid. Tokyo
//   Night's orange #ff9e64 (S 100%, L 70%) is the most aggressive accent in
//   any palette studied.
// - Multiple vivid accents in small doses (blue/purple/orange/cyan/green)
//   carry all the chroma; large surfaces stay dark and calm.
//
// Contrast (computed during research, WCAG relative luminance):
// - text-bright  #c0caf5 on #24283b → ≈ 9.0:1  (AAA body)
// - text-body    #a9b1d6 on #24283b → ≈ 6.9:1  (AA, near-AAA)
// - text-muted   #737aa2 on #24283b → ≈ 3.4:1  (secondary labels)
// - text-faint   #565f89 on #24283b → ≈ 2.4:1  (decorative only)

// Page / app background — Tokyo Night Storm bg (blue-violet tinted)
export const PALETTE_BACKGROUND = '#24283b';
// Raised surfaces: header, footer, sidebar, tab bar (bg_dark — deeper than
// bg so panels read as grounded, with the content pane lighter)
export const PALETTE_SURFACE = '#1f2335';
// Editor / content well — Night's deep bg for maximum accent pop
export const PALETTE_WELL = '#1a1b26';
// Hairline borders (bg_highlight)
export const PALETTE_BORDER = '#292e42';
// Hover / raised interactive surface (active tab, hovered entry)
export const PALETTE_SURFACE_HOVER = '#292e42';

// PRIMARY accent — Tokyo Night blue #7aa2f7 (S 91%, L 72%). Sidebar header,
// active tab edge, active entry bar, focus rings.
export const PALETTE_ACCENT = '#7aa2f7';
// Brighter blue for hover states / accent text on dark grounds (blue_bright)
export const PALETTE_ACCENT_BRIGHT = '#8db0ff';
// SECONDARY accent — purple #bb9af7 (S 77%, L 78%). Subtitle, links, info.
export const PALETTE_SECONDARY = '#bb9af7';
// TERTIARY accent — orange #ff9e64 (S 100%, L 70%). Drop overlay, warnings.
export const PALETTE_TERTIARY = '#ff9e64';
// Cool cyan #7dcfff (S 100%, L 74%) — strings/syntax pops
export const PALETTE_CYAN = '#7dcfff';
// Success green #9ece6a (S 53%, L 67%)
export const PALETTE_GREEN = '#9ece6a';
// Gold yellow #e0af68 (S 79%, L 64%) — numbers/badges
export const PALETTE_GOLD = '#e0af68';

// Text colors
export const PALETTE_TEXT_BRIGHT = '#c0caf5'; // headings, active tab text
export const PALETTE_TEXT_BODY = '#a9b1d6';   // default body text (fg_dark)
export const PALETTE_TEXT_MUTED = '#737aa2';  // secondary labels
export const PALETTE_TEXT_FAINT = '#565f89';  // decorative hints (comment)

// Overlay scrim behind the drag-drop label (Night bg at high alpha)
export const PALETTE_SCRIM = 'rgba(26, 27, 38, 0.78)';
