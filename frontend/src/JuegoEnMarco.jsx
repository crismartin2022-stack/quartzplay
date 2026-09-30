// El juego de un estudio, abierto adentro de nuestra app.
//
// Antes se mandaba al jugador al dominio del estudio con `window.open`:
// en la web perdía la marca, el saldo y el camino de vuelta, y en la
// mini-app de Telegram el toque no hacía nada, porque no puede navegar
// a un dominio ajeno. Enmarcado, el jugador nunca sale de acá.
//
// QUÉ SE TAPA
// Este componente cubre el viewport entero (portal al <body>): barra
// superior, barra inferior y barra lateral quedan debajo, sin tocar. En
// un teléfono de 360 px esas barras más la del navegador se comerían la
// mitad del alto, y un juego en una caja de 300 px no se puede jugar.
// Lo único que sobrevive es una cabecera de 48 px con lo que el jugador
// necesita mientras juega: volver, el nombre, el saldo y la salida.
//
// Como la pantalla del casino sigue montada abajo, volver deja todo
// donde estaba: la búsqueda, la marca elegida y la página de la lista.
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { oscuro as Q, F_NUM, F_BODY, inkOn, RADII, SPACING } from "./theme";
import {
  ALTO_CABECERA, PERIODO_SALDO_MS, PLAZO_CARGA_MS,
  abrirAparte, dimensionesMarco, estadoInicial, reducirMarco,
} from "./marcoDeJuego";

// El marco no puede manejar nuestra pestaña (sin allow-top-navigation:
// un estudio no puede mandar al jugador a otro sitio), pero sí necesita
// scripts, su propio almacenamiento, formularios y ventanas emergentes
// para el cajero o las reglas del juego.
const SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups "
  + "allow-popups-to-escape-sandbox allow-modals allow-pointer-lock "
  + "allow-orientation-lock allow-presentation";

function useViewport() {
  const medir = () => ({ ancho: window.innerWidth, alto: window.innerHeight });
  const [vp, setVp] = useState(medir);
  useEffect(() => {
    const alCambiar = () => setVp(medir());
    window.addEventListener("resize", alCambiar);
    window.addEventListener("orientationchange", alCambiar);
    return () => {
      window.removeEventListener("resize", alCambiar);
      window.removeEventListener("orientationchange", alCambiar);
    };
  }, []);
  return vp;
}

export default function JuegoEnMarco({ url, titulo, saldo, onRefrescar, onCerrar }) {
  const [estado, setEstado] = useState(estadoInicial);
  // Cambiar la clave desmonta el marco y lo vuelve a pedir: es la única
  // forma de reintentar sin acceso al documento de adentro.
  const [intento, setIntento] = useState(0);
  const [bloqueado, setBloqueado] = useState(false);
  const vp = useViewport();
  const caja = dimensionesMarco(vp.ancho, vp.alto);
  const angosto = vp.ancho < 480;

  // Los callbacks del padre cambian en cada render; guardarlos en una
  // referencia evita reiniciar temporizadores y suscripciones por eso.
  const refrescar = useRef(onRefrescar);
  const cerrar = useRef(onCerrar);
  refrescar.current = onRefrescar;
  cerrar.current = onCerrar;

  // Plazo de carga: ver marcoDeJuego.PLAZO_CARGA_MS.
  useEffect(() => {
    if (estado !== "cargando") return undefined;
    const t = setTimeout(() => setEstado(e => reducirMarco(e, "vencio")), PLAZO_CARGA_MS);
    return () => clearTimeout(t);
  }, [estado, intento]);

  // El saldo: cada tanto mientras el jugador juega, y al instante cuando
  // vuelve de otra pestaña o de la ventana aparte.
  useEffect(() => {
    const pedir = () => { if (!document.hidden) refrescar.current?.(); };
    const t = setInterval(pedir, PERIODO_SALDO_MS);
    document.addEventListener("visibilitychange", pedir);
    window.addEventListener("focus", pedir);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", pedir);
      window.removeEventListener("focus", pedir);
    };
  }, []);

  // Una sola puerta de salida: pide el saldo final y avisa al padre.
  const salir = useCallback(() => {
    refrescar.current?.();
    cerrar.current?.();
  }, []);

  // "Atrás" tiene que cerrar el juego y no sacar al jugador del sitio:
  // en el navegador, con una entrada de historial propia; en Telegram,
  // con su botón nativo.
  useEffect(() => {
    let empujo = false;
    try {
      window.history.pushState({ juegoEnMarco: true }, "");
      empujo = true;
    } catch (e) { /* sin historial: queda el botón de la cabecera */ }
    const alVolver = () => salir();
    window.addEventListener("popstate", alVolver);

    const alEscape = e => { if (e.key === "Escape") salir(); };
    window.addEventListener("keydown", alEscape);

    const tg = window.Telegram?.WebApp;
    const tgAtras = tg?.BackButton;
    if (tgAtras) { tgAtras.onClick?.(salir); tgAtras.show?.(); }
    // Sin esto, deslizar hacia abajo dentro del juego cierra la mini-app.
    tg?.disableVerticalSwipes?.();

    // El scroll de la pantalla de abajo no debe moverse con el gesto
    // que el jugador hace sobre el juego.
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", alVolver);
      window.removeEventListener("keydown", alEscape);
      if (tgAtras) { tgAtras.offClick?.(salir); tgAtras.hide?.(); }
      tg?.enableVerticalSwipes?.();
      document.body.style.overflow = overflowPrevio;
      // Si se cerró con el botón (y no con "atrás"), la entrada que
      // empujamos sigue en el historial: se descarta.
      if (empujo && window.history.state?.juegoEnMarco) window.history.back();
    };
  }, [salir]);

  const aparte = () => setBloqueado(!abrirAparte(window, url));
  const reintentar = () => {
    setBloqueado(false);
    setEstado(e => reducirMarco(e, "reintentar"));
    setIntento(n => n + 1);
  };

  const boton = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: SPACING[8], minHeight: 44, padding: "0 16px", cursor: "pointer",
    borderRadius: RADII.md, fontFamily: F_BODY, fontSize: 14, fontWeight: 700,
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Jugando ${titulo || ""}`}
      style={{position: "fixed", top: 0, right: 0, bottom: 0, left: 0,
        zIndex: 1000, background: Q.void, display: "flex",
        flexDirection: "column", boxSizing: "border-box",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily: F_BODY}}>
      <style>{`
        @keyframes marcoGira{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion: reduce){.marco-giro{animation:none!important}}
      `}</style>

      <div style={{flexShrink: 0, height: ALTO_CABECERA, boxSizing: "border-box",
        display: "flex", alignItems: "center", gap: SPACING[8],
        padding: "0 8px", background: Q.deep,
        borderBottom: `1px solid ${Q.border}`}}>
        <button onClick={salir} aria-label="Volver al casino"
          style={{...boton, minHeight: 40, padding: "0 12px", flexShrink: 0,
            background: Q.raised, border: `1px solid ${Q.border}`,
            color: Q.text}}>
          <ArrowLeft size={18}/>{!angosto&&"Volver"}
        </button>

        <div style={{flex: 1, minWidth: 0, color: Q.text, fontSize: 13,
          fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden",
          textOverflow: "ellipsis"}}>{titulo}</div>

        {saldo&&(
          <div style={{flexShrink: 0, textAlign: "right", lineHeight: 1.2}}>
            <div style={{color: Q.dim, fontSize: 12}}>Saldo</div>
            <div style={{fontFamily: F_NUM, fontSize: 14, fontWeight: 700,
              color: Q.gold}}>{saldo}</div>
          </div>
        )}

        <button onClick={aparte} aria-label="Abrir el juego en otra pestaña"
          title="Abrir en otra pestaña"
          style={{...boton, minHeight: 40, padding: "0 12px", flexShrink: 0,
            background: "transparent", border: `1px solid ${Q.border}`,
            color: Q.muted}}>
          <ExternalLink size={16}/>{!angosto&&"Otra pestaña"}
        </button>
      </div>

      <div style={{flex: 1, minHeight: 0, display: "flex",
        justifyContent: "center", background: Q.void, position: "relative"}}>
        <iframe key={intento} src={url} title={titulo || "Juego"}
          sandbox={SANDBOX} allow="fullscreen; autoplay; clipboard-write"
          allowFullScreen referrerPolicy="origin"
          onLoad={() => setEstado(e => reducirMarco(e, "cargo"))}
          style={{width: caja.ancho, height: caja.alto, maxWidth: "100%",
            border: "none", background: Q.void, display: "block"}}/>

        {estado==="cargando"&&(
          <div role="status" style={{position: "absolute", top: 0, right: 0,
            bottom: 0, left: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: SPACING[12], background: Q.void, pointerEvents: "none"}}>
            <div className="marco-giro" aria-hidden="true"
              style={{width: 32, height: 32, borderRadius: RADII.full,
                border: `3px solid ${Q.border}`, borderTopColor: Q.violet,
                animation: "marcoGira .9s linear infinite"}}/>
            <div style={{color: Q.muted, fontSize: 13}}>Abriendo el juego…</div>
          </div>
        )}

        {estado==="lento"&&(
          <div role="alert" style={{position: "absolute", top: 0, right: 0,
            bottom: 0, left: 0, display: "flex", alignItems: "center",
            justifyContent: "center", padding: SPACING[24],
            background: "rgba(6,10,20,.92)"}}>
            <div style={{maxWidth: 360, width: "100%", textAlign: "center",
              background: Q.card, border: `1px solid ${Q.border}`,
              borderRadius: RADII.lg, padding: SPACING[24]}}>
              <div style={{fontFamily: F_NUM, fontSize: 16, fontWeight: 700,
                color: Q.text}}>El juego no abrió acá adentro</div>
              <div style={{color: Q.muted, fontSize: 13, lineHeight: 1.5,
                marginTop: SPACING[8]}}>
                Algunos estudios no permiten mostrar sus juegos dentro de otra
                app, o la conexión está lenta. Tu saldo está a salvo: podés
                abrirlo en otra pestaña o probar de nuevo.</div>
              {bloqueado&&(
                <div style={{color: Q.red, fontSize: 13, marginTop: SPACING[12]}}>
                  Tu navegador bloqueó la pestaña nueva. Permitila y volvé a
                  tocar el botón.</div>
              )}
              <div style={{display: "flex", flexDirection: "column",
                gap: SPACING[8], marginTop: SPACING[16]}}>
                <button onClick={aparte}
                  style={{...boton, border: "none", background: Q.violet,
                    color: inkOn(Q.violet)}}>
                  <ExternalLink size={16}/>Abrir en otra pestaña</button>
                <button onClick={reintentar}
                  style={{...boton, background: "transparent",
                    border: `1px solid ${Q.border}`, color: Q.text}}>
                  Probar de nuevo</button>
                <button onClick={salir}
                  style={{...boton, background: "transparent",
                    border: "none", color: Q.muted}}>
                  Volver al casino</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
