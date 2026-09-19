// ═══════════════════════════════════════════════════════════════
// MASCOT — the assistant character the prototype puts on the home
// screen and in every empty state.
//
// Today an empty state in this product is a line of grey text and
// nothing else. The prototype's own empty states (`.mascot-empty`) and
// its home screen (`.mascot-header`) both carry the character instead —
// so this component ships `html/assets/bot-mascota-001.png`, the same
// file, through the bundler like the fonts (content-hashed, not dropped
// raw into `public/`).
//
// It is decorative on purpose: `alt=""` + `aria-hidden`, because the
// text sitting beside it already carries the meaning ("No hay eventos en
// vivo ahora", "No hay novedades por ahora", ...). This is a deliberate
// call, not a copy of the prototype's own markup — the prototype's own
// `.mascot-empty` image actually carries a real alt
// ("Mascota de asistencia de iaqp"), because in the prototype the image
// is the ONLY content of the drawer/panel it sits in. In this product the
// mascot is always placed beside text that already says the same thing,
// so a second, redundant announcement would be noise for a screen reader,
// not help.
//
// Like Icon.jsx and BrandMark.jsx, the attributes are computed by a plain
// function so the component can be tested without a DOM renderer.
import botMascota from "./assets/bot-mascota-001.png";
import botAlpha from "./assets/bot-alpha.png";

// The full-body character, the one file the prototype actually places
// (home header, every `.mascot-empty`).
export const MASCOT_ASSET = botMascota;

// `bot-alpha.png` — "the face alone, for small surfaces" per the product
// owner's own naming. The prototype's own pages never reference this
// file (only bot-mascota-001.png appears in html/*.html), so there is no
// role to copy from it yet. It ships in the bundle, as T1 asks, and is
// exported here so a future small-surface placement has it ready without
// this file inventing one today.
export const MASCOT_FACE_ASSET = botAlpha;

// The shipped file's own pixels (540x802), so width always follows the
// real aspect ratio instead of stretching the character.
const MASCOT_ASPECT_RATIO = 540 / 802;

export const DEFAULT_MASCOT_SIZE = 96;

export function mascotAttributes({ size = DEFAULT_MASCOT_SIZE, style } = {}) {
  return {
    src: MASCOT_ASSET,
    alt: "",
    "aria-hidden": "true",
    width: Math.round(size * MASCOT_ASPECT_RATIO),
    height: size,
    style: { display: "block", flexShrink: 0, ...style },
  };
}

export default function Mascot(props) {
  return <img {...mascotAttributes(props)} />;
}
