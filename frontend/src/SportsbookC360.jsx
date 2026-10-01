// La pantalla del sportsbook de Content360, compartida por la mini-app y
// el sitio.
//
// Es una pantalla y no una grilla: el sportsbook llega como UN juego del
// catálogo de Content360 y se abre con el mismo lanzamiento que cualquier
// slot (`/api/casino/sesion`), enmarcado por `JuegoEnMarco`. No hay nada
// que elegir; hay un solo botón.
//
// Las dos pantallas la montan igual y le pasan lo que cambia entre ellas:
// el saldo ya formateado (cada una tiene su manera de mostrarlo) y cómo
// refrescarlo al volver.
import { useState } from "react";
import { getFrontendConfig } from "./config";
import { oscuro as Q, F_BODY, inkOn, RADII, SPACING } from "./theme";
import Icon from "./Icon";
import JuegoEnMarco from "./JuegoEnMarco";
import { urlDeJuego } from "./marcoDeJuego";
import {
  useSportsbookC360, AVISO_SPORTSBOOK_APAGADO, AVISO_APUESTA_SIN_RESOLVER,
} from "./configSportsbook";

const { apiUrl: API } = getFrontendConfig();

export default function SportsbookC360({ user, saldo, onRefrescar }) {
  const config = useSportsbookC360(user?.id);
  const [abriendo, setAbriendo] = useState(false);
  const [err, setErr] = useState("");
  // La pantalla sigue montada debajo del marco: al volver queda como estaba.
  const [juego, setJuego] = useState(null);

  const abrir = async () => {
    if (!user?.id) { setErr("Entrá a tu cuenta para jugar"); return; }
    if (!config?.juego) return;
    setAbriendo(true); setErr("");
    try {
      const r = await fetch(`${API}/api/casino/sesion`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // La integración va aunque el id parezca único: sin ella el
        // servidor abre el de menor prioridad si otro proveedor repite el id.
        body: JSON.stringify({ user_id: user.id, game_id: config.juego.id,
                               integracion: config.juego.integracion,
                               language: "es" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "No se pudo abrir");
      const url = urlDeJuego(d.url);
      if (!url) throw new Error("El sportsbook devolvió un enlace que no se puede abrir");
      setJuego({ url, titulo: config.juego.titulo });
    } catch (e) { setErr(e.message); }
    setAbriendo(false);
  };

  if (!config.listo) return (
    <div style={{ padding: "40px 20px", textAlign: "center", color: Q.muted,
      fontSize: 14, fontFamily: F_BODY }}>Cargando…</div>
  );

  // Apagado desde el admin (o la agencia no tiene el producto). Quien ya
  // apostó llega acá desde la entrada apagada y lee que el crédito entra
  // igual; quien no, solo puede llegar con la pantalla ya abierta y no
  // tiene nada pendiente que aclararle.
  if (!config.activo) return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ marginBottom: SPACING[12] }}>
        <Icon name="trophy" size={38} color={Q.muted} />
      </div>
      <div style={{ color: Q.muted, fontSize: 13, lineHeight: 1.6,
        fontFamily: F_BODY }}>{AVISO_SPORTSBOOK_APAGADO}</div>
      {config.conHistorial && (
        <div style={{ color: Q.muted, fontSize: 13, lineHeight: 1.6,
          marginTop: SPACING[12], whiteSpace: "pre-line",
          fontFamily: F_BODY }}>{AVISO_APUESTA_SIN_RESOLVER}</div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 20px",
      textAlign: "center" }}>
      {juego && (
        <JuegoEnMarco url={juego.url} titulo={juego.titulo} saldo={saldo}
          onRefrescar={onRefrescar} onCerrar={() => setJuego(null)} />
      )}
      <div style={{ marginBottom: SPACING[12] }}>
        <Icon name="trophy" size={44} color={Q.gold} />
      </div>
      <div style={{ color: Q.text, fontWeight: 800, fontSize: 20,
        fontFamily: F_BODY }}>Sportsbook</div>
      <div style={{ color: Q.muted, fontSize: 13, lineHeight: 1.6,
        margin: "8px 0 24px", fontFamily: F_BODY }}>
        Más deportes y mercados, de nuestro proveedor Content360.
        Se abre acá adentro: tu saldo es el mismo.</div>
      <button onClick={abrir} disabled={abriendo}
        style={{ width: "100%", maxWidth: 320,
          background: `linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border: "none", borderRadius: RADII.md, padding: "16px",
          color: inkOn(Q.violet, Q.cyan), fontSize: 14, fontWeight: 800,
          cursor: abriendo ? "wait" : "pointer", fontFamily: F_BODY }}>
        {abriendo ? "Abriendo…" : "Abrir el sportsbook"}</button>
      {err && (
        <div style={{ color: Q.red, fontSize: 12.5, marginTop: 12,
          fontFamily: F_BODY }}>{err}</div>
      )}
    </div>
  );
}
