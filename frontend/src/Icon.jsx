// ═══════════════════════════════════════════════════════════════
// ICON — the product draws its own icons.
//
// The 36 paths below are the brand prototype's own set, copied
// verbatim from `html/assets/icons.js`: bare SVG path markup on a
// 24×24 grid, Lucide-style, stroked rather than filled. They are
// pinned here on purpose — no icon package, no network, nothing the
// operating system gets to redraw the way it redraws an emoji.
//
// The drawing itself lives in `iconAttributes`, a plain function, so
// it can be tested without a DOM renderer: the component is a thin
// wrapper that spreads what the function returns onto an <svg>.
//
// Usage:
//   <Icon name="house" />                      decorative, beside its label
//   <Icon name="search" label="Buscar" />      the only content of a control
//   <Icon name="ticket" size={34} color={Q.gold} />
// ═══════════════════════════════════════════════════════════════
export const ICON_PATHS = {
  "arrow-down-left": '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "arrow-up-right": '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  "chart-no-axes-combined": '<path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><circle cx="12" cy="14" r="3.5"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "circle-check": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  "circle-dot": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1"/>',
  "circle-help": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4 2.2c-.9.6-1.5 1-1.5 2.3"/><path d="M12 16h.01"/>',
  "clipboard-list": '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4h6v3H9zM9 11h6M9 15h6"/>',
  clubs: '<path d="M12 20v-5"/><path d="M8 15h8"/><path d="M8.5 15a3.5 3.5 0 1 1-2.5-6 3.5 3.5 0 0 1 6-3 3.5 3.5 0 0 1 6 3 3.5 3.5 0 1 1-2.5 6z"/>',
  "clock-3": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5h4"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  house: '<path d="m4 11 8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
  "landmark": '<path d="m3 10 9-5 9 5"/><path d="M4 20h16M6 10v7M10 10v7M14 10v7M18 10v7"/>',
  "layout-grid": '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  "message-circle": '<circle cx="12" cy="12" r="9"/><path d="M8.5 10.5h7M8.5 14h4.5"/>',
  network: '<circle cx="6" cy="12" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="m8 11 8-4M8 13l8 4"/>',
  play: '<path d="m9 7 8 5-8 5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  "receipt-text": '<path d="M5 3v18l3-2 4 2 4-2 3 2V3z"/><path d="M8 8h8M8 12h8"/>',
  "scan-line": '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  "scan-search": '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M8 12h5"/><circle cx="16" cy="16" r="3"/><path d="m18 18 3 3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
  "shield-alert": '<path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M12 8v4M12 16h.01"/>',
  "shield-check": '<path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  "sliders-horizontal": '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  spade: '<path d="M12 21v-5M8 21h8"/><path d="M12 4c-2 4-7 5-7 9a4 4 0 0 0 7 2 4 4 0 0 0 7-2c0-4-5-5-7-9z"/>',
  ticket: '<path d="M4 7a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4v2h16v-2a2 2 0 0 0 0-4v-2a2 2 0 0 0 0-4V5H4z"/><path d="M12 8v8"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8"/>',
  "triangle-alert": '<path d="m12 4 9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  users: '<path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1"/><circle cx="9.5" cy="8" r="3"/><path d="M17 11a3 3 0 1 0-1-5.8M21 20v-1a4 4 0 0 0-3-3.9"/>',
  "wallet-cards": '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 9h16M15 15h2"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>'
};

// The prototype renders at 20px. A caller that says nothing gets that.
export const DEFAULT_ICON_SIZE = 20;

// Every attribute the prototype sets on its <svg>, plus the two
// accessibility branches. Returns null when the name is not in the set,
// which is how "an unknown name draws nothing" is implemented.
//
// `label` is the single switch between the two accessible behaviours:
// give it when the icon is the only thing a control says, leave it out
// when a visible label already says the same thing.
export function iconAttributes({ name, size = DEFAULT_ICON_SIZE, color = "currentColor", label, style } = {}) {
  if (!ICON_PATHS[name]) return null;
  const attributes = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    // Fixed box, never squashed by a flex row, sitting on the text
    // baseline the way a letter does when it is inline with one.
    style: { display: "inline-block", verticalAlign: "-0.125em", flexShrink: 0, ...style },
  };
  if (label) {
    attributes.role = "img";
    attributes["aria-label"] = label;
  } else {
    attributes["aria-hidden"] = "true";
    attributes.focusable = "false";
  }
  return attributes;
}

export default function Icon(props) {
  const attributes = iconAttributes(props);
  if (!attributes) return null;
  // The path markup is a constant of this module, never anything a user
  // typed, so there is nothing to inject.
  return <svg {...attributes} dangerouslySetInnerHTML={{ __html: ICON_PATHS[props.name] }} />;
}
