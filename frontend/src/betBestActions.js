// Decisions the scanner screen needs, kept apart from React and fetch so
// they can be tested without a browser. Both channels (the Telegram app and
// the public site) will call these once ScreenMejorar is wired the same way.
//
// The betting body reuses betslipPicks, the same mapper the code path
// already uses: one source of truth for how a scanned pick becomes an API
// payload, so the selection and the event identity never drift between the
// two actions the screen offers.
import { betslipPicks } from "./betslipPicks";

const MENSAJE_GENERICO = "No pudimos completar la acción. Probá de nuevo en un momento.";
const MENSAJE_NADA_JUGABLE = "No pudimos igualar ninguna selección de esta captura. Probá escanear de nuevo con una foto más clara.";

// The picks that survived matching. Everything downstream — what the screen
// offers, and what it sends — is derived from this single filter, so the
// two paths can never disagree about which picks are playable.
export function picksJugables(res) {
  if (!res) return [];
  return (res.picks || []).filter((pick) => pick && pick.odd_final);
}

// What the screen may offer for this scan: bet, code, both, or neither —
// with the message to show when there is nothing to play.
export function estadoDeAcciones(res) {
  const jugables = picksJugables(res);
  const total = res && typeof res.picks_total === "number"
    ? res.picks_total
    : ((res && res.picks) || []).length;
  const faltantes = Math.max(total - jugables.length, 0);
  const puedeJugar = jugables.length > 0;
  return {
    puedeJugar,
    jugables,
    total,
    faltantes,
    mensaje: puedeJugar ? "" : MENSAJE_NADA_JUGABLE,
  };
}

// A stake typed as text, turned into the whole number pesos the endpoint
// expects, or null when it can't be played. Rounding a decimal instead of
// rejecting it matches how the rest of the app already treats stakes.
export function stakeValido(texto) {
  if (texto === null || texto === undefined) return null;
  const recortado = typeof texto === "string" ? texto.trim() : texto;
  if (recortado === "") return null;
  const numero = Number(recortado);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  const entero = Math.round(numero);
  return entero > 0 ? entero : null;
}

// The bet endpoint answers a refusal with `detail`, which can be a plain
// string (most errors) or a dict `{reason, message}` (login_required and
// friends). Reading `e.detail` straight into an Error renders "[object
// Object]" for the dict shape — this is the one place that decides how
// each shape becomes text.
export function mensajeDeDetalle(detail) {
  if (typeof detail === "string") {
    return { reason: "", mensaje: detail || MENSAJE_GENERICO };
  }
  if (detail && typeof detail === "object") {
    const reason = typeof detail.reason === "string" ? detail.reason : "";
    const mensaje = typeof detail.message === "string" && detail.message
      ? detail.message
      : MENSAJE_GENERICO;
    return { reason, mensaje };
  }
  return { reason: "", mensaje: MENSAJE_GENERICO };
}

// The /api/apuesta body. `initData` travels as given: the Telegram app
// passes its real init data, the browser passes "" and carries its
// identity in the Authorization header instead, which is set by the
// caller and never belongs in the body.
export function cuerpoDeApuesta({ picks, stake, initData, refCode }) {
  const body = {
    modo: "saldo",
    stake,
    picks: betslipPicks(picks),
    init_data: initData || "",
  };
  if (refCode) {
    body.inf_code = refCode;
    body.codigo_influencer = refCode;
  }
  return body;
}
