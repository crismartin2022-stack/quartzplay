// El sportsbook de Content360: la pregunta "¿hay que mostrar la entrada?".
//
// La responde el servidor (`/api/sportsbook/config`), no esta pantalla: el
// interruptor vive en la configuración del admin y puede cambiar sin que
// nadie despliegue nada. Este módulo solo la pide y la interpreta, igual que
// `proveedoresApi.js`, para probar la decisión sin montar ninguna pantalla.
import { useState, useEffect } from "react";
import { getFrontendConfig } from "./config";

// Lo que se asume mientras no hay respuesta, o si la respuesta falla: apagado.
// Mostrar una entrada que no corresponde es peor que no mostrarla un
// momento: el jugador toca, y no hay nada que abrir.
export const SPORTSBOOK_APAGADO = Object.freeze({
  activo: false, juego: null, conHistorial: false });

// Los textos del sportsbook apagado. Están elegidos palabra por palabra para
// no prometer lo que no controlamos: NO dicen "te vamos a avisar" (no hay
// ningún aviso) ni "tenés una apuesta abierta" (no se puede saber: una ronda
// con premio 0 es igual si perdió o si no se resolvió). Lo único cierto es
// que el crédito entra igual, y eso es lo único que se promete. El segundo
// párrafo es condicional a propósito: lo evalúa el jugador, que sí sabe si
// apostó. No se reformulan.
export const AVISO_SPORTSBOOK_APAGADO =
  "El sportsbook no está disponible por ahora.";
export const AVISO_APUESTA_SIN_RESOLVER =
  "Si tenés una apuesta sin resolver, se te va a acreditar igual\n"
  + "cuando el resultado llegue. No hace falta que hagas nada.";

// Se acepta solo lo que alcanza para abrir el juego. Un `activo: true` sin
// juego (o con un id vacío) no tiene qué lanzar, así que cuenta como apagado.
//
// Apagado no es "no existe" para quien ya apostó ahí: el servidor manda
// `con_historial` y la entrada se queda, apagada, para que lea el aviso.
// Sin juego que abrir o sin `con_historial: true` exacto, no hay entrada.
export function interpretarConfigSportsbook(datos) {
  if (!datos) return SPORTSBOOK_APAGADO;
  if (datos.activo !== true) {
    return datos.con_historial === true
      ? { activo: false, juego: null, conHistorial: true }
      : SPORTSBOOK_APAGADO;
  }
  const j = datos.juego;
  if (!j || !String(j.id ?? "").trim()) return SPORTSBOOK_APAGADO;
  return {
    activo: true,
    conHistorial: false,
    juego: {
      id: String(j.id),
      titulo: j.titulo || "Sportsbook",
      integracion: j.integracion || "",
    },
  };
}

// `userId` va porque el servidor aplica las mismas puertas que el
// lanzamiento (producto casino de la agencia, proveedor apagado): no se
// ofrece una entrada que después responde 403.
//
// `listo` distingue "todavía no contestó" de "contestó que no": la pantalla
// del sportsbook muestra "Cargando" en el primer caso y "no disponible" en
// el segundo, y sin esto avisaría que no está disponible durante el viaje.
export function useSportsbookC360(userId) {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let vigente = true;
    const q = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
    // La config se lee al pedir, no al importar: así la lógica de arriba se
    // prueba sin las variables de entorno del build.
    const { apiUrl: API } = getFrontendConfig();
    fetch(`${API}/api/sportsbook/config${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vigente) setConfig(interpretarConfigSportsbook(d)); })
      .catch(() => { if (vigente) setConfig(SPORTSBOOK_APAGADO); });
    return () => { vigente = false; };
  }, [userId]);
  const c = config || SPORTSBOOK_APAGADO;
  // `visible`: hay entrada de menú. `activo`: además se puede abrir.
  return { ...c, visible: c.activo || c.conHistorial, listo: config !== null };
}
