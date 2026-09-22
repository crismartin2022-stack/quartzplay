// Product switches that live in the code, so turning one back on is a
// reviewed one-line change rather than a setting someone flips in a panel.

// The 3D roulette (Casino.jsx, backed by the IAQP service) is switched off
// by a business decision taken on 2026-09-22: it may come back, but it is
// not offered today.
//
// While this is false, the /casino path and every host listed in
// REACT_APP_CASINO_HOSTS show a notice instead of the table. The screen, its
// components and the IAQP service code all stay in the repository untouched,
// so bringing it back is flipping this to true — plus restarting the IAQP
// service, and before scaling it, the engine redesign described in
// analisis-infraestructura/infraestructura-escalado.md.
export const ROULETTE_ENABLED = false;
