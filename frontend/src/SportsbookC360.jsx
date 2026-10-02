// La pantalla del sportsbook de Content360, compartida por la mini-app y
// el sitio.
//
// Es una pantalla y no una grilla: el sportsbook llega como UN juego del
// catálogo de Content360 y se abre con el mismo lanzamiento que cualquier
// slot (`/api/casino/sesion`), enmarcado por `JuegoEnMarco`. No hay nada
// que elegir, así que entrar a la pantalla ya es querer abrirlo: se abre
// solo. El botón queda únicamente para el camino roto (reintentar) y para
// volver a abrirlo después de cerrar el marco.
//
// Las dos pantallas la montan igual y le pasan lo que cambia entre ellas:
// el saldo ya formateado (cada una tiene su manera de mostrarlo) y cómo
// refrescarlo al volver.
import { useState, useEffect, useRef } from "react";
import { getFrontendConfig } from "./config";
import { oscuro as Q, F_BODY, inkOn, RADII, SPACING } from "./theme";
import Icon from "./Icon";
import JuegoEnMarco from "./JuegoEnMarco";
import { urlDeJuego } from "./marcoDeJuego";
import {
  useSportsbookC360, AVISO_SPORTSBOOK_APAGADO, AVISO_APUESTA_SIN_RESOLVER,
} from "./configSportsbook";

const { apiUrl: API } = getFrontendConfig();

// Los lanzamientos que están en vuelo, por jugador y juego. Abrir crea una
// sesión del lado del proveedor: si dos montajes (modo estricto de React en
// desarrollo, un re-render que desmonta, volver atrás y entrar de nuevo)
// lanzaran cada uno el suyo, el proveedor contaría dos sesiones y la
// primera quedaría colgada. Vive afuera del componente a propósito: un
// `useRef` muere con el montaje y no ve al montaje anterior. El segundo
// montaje se cuelga de la misma promesa en vez de lanzar otra, y la entrada
// se borra al terminar, así reintentar o volver a abrir sí lanza de nuevo.
const lanzamientosEnVuelo = new Map();

function lanzarUnaVez(userId, juego) {
  const clave = `${userId}|${juego.integracion}|${juego.id}`;
  const enVuelo = lanzamientosEnVuelo.get(clave);
  if (enVuelo) return enVuelo;

  const promesa = (async () => {
    const r = await fetch(`${API}/api/casino/sesion`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      // La integración va aunque el id parezca único: sin ella el
      // servidor abre el de menor prioridad si otro proveedor repite el id.
      body: JSON.stringify({ user_id: userId, game_id: juego.id,
                             integracion: juego.integracion,
                             language: "es" }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || "No se pudo abrir");
    const url = urlDeJuego(d.url);
    if (!url) throw new Error("El sportsbook devolvió un enlace que no se puede abrir");
    return { url, titulo: juego.titulo };
  })().finally(() => lanzamientosEnVuelo.delete(clave));
  lanzamientosEnVuelo.set(clave, promesa);
  return promesa;
}

export default function SportsbookC360({ user, saldo, onRefrescar }) {
  const config = useSportsbookC360(user?.id);
  const [abriendo, setAbriendo] = useState(false);
  const [err, setErr] = useState("");
  // La pantalla sigue montada debajo del marco: al volver queda como estaba.
  const [juego, setJuego] = useState(null);
  // Una respuesta que llega con la pantalla ya desmontada no tiene dónde
  // escribirse: se descarta en vez de tocar el estado de un componente muerto.
  const montado = useRef(true);

  const userId = user?.id;
  const juegoId = config.juego?.id;
  const juegoIntegracion = config.juego?.integracion;
  const juegoTitulo = config.juego?.titulo;

  const abrir = async () => {
    if (!userId) { setErr("Entrá a tu cuenta para jugar"); return; }
    if (!juegoId) return;
    setAbriendo(true); setErr("");
    try {
      const abierto = await lanzarUnaVez(userId,
        { id: juegoId, integracion: juegoIntegracion, titulo: juegoTitulo });
      if (montado.current) setJuego(abierto);
    } catch (e) { if (montado.current) setErr(e.message); }
    if (montado.current) setAbriendo(false);
  };

  // Se abre solo apenas hay con qué: entrar acá es querer abrirlo. Depende
  // de valores primitivos y no del objeto `config` (que es nuevo en cada
  // render): con el objeto, cada render volvería a lanzar. Tras un error no
  // vuelve a correr sola; el reintento es del jugador, con el botón.
  useEffect(() => {
    montado.current = true;
    if (config.activo && userId && juegoId) abrir();
    return () => { montado.current = false; };
  }, [config.activo, userId, juegoId, juegoIntegracion]);

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
      <style>{`
        @keyframes marcoGira{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion: reduce){.marco-giro{animation:none!important}}
      `}</style>
      {abriendo && (
        <div role="status" style={{ display: "flex", flexDirection: "column",
          alignItems: "center", gap: SPACING[12] }}>
          <div className="marco-giro" aria-hidden="true"
            style={{ width: 32, height: 32, borderRadius: RADII.full,
              border: `3px solid ${Q.border}`, borderTopColor: Q.violet,
              animation: "marcoGira .9s linear infinite" }} />
          <div style={{ color: Q.muted, fontSize: 13, fontFamily: F_BODY }}>
            Abriendo el sportsbook…</div>
        </div>
      )}
      {err && (
        <div role="alert" style={{ color: Q.red, fontSize: 12.5,
          marginBottom: 12, fontFamily: F_BODY }}>{err}</div>
      )}
      {/* Sin esto, al fallar o al cerrar el marco el jugador queda mirando
          una pantalla sin salida: la pantalla intermedia salió del camino
          feliz, no del roto. */}
      {!abriendo && !juego && (
        <button onClick={abrir}
          style={{ width: "100%", maxWidth: 320,
            background: `linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            border: "none", borderRadius: RADII.md, padding: "16px",
            color: inkOn(Q.violet, Q.cyan), fontSize: 14, fontWeight: 800,
            cursor: "pointer", fontFamily: F_BODY }}>
          {err ? "Reintentar" : "Abrir el sportsbook"}</button>
      )}
    </div>
  );
}
