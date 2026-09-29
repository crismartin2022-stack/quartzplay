// La home de /sitio.
//
// Hasta ahora /sitio abría directo en la lista de partidos: no tenía
// portada, y por eso el dueño la veía "muy diferente" de la mini-app, que
// sí abre en `ScreenHome`. Esta pantalla usa el mismo lenguaje —el hero
// violeta con la foto de cancha, la mascota, las tres tarjetas con arte,
// el combo del día y los partidos en vivo— pero armado para un monitor.
//
// Lo que NO se copia de la mini-app: las burbujas de chat, el boleto
// flotante y la grilla de accesos rápidos. En el navegador ya están la
// barra lateral y el boleto fijo, y repetirlos acá sería ruido.
import { useState, useEffect } from "react";
import { getFrontendConfig } from "./config";
import { oscuro as Q, F_NUM, F_BODY, inkOn, RADII, SPACING } from "./theme";
import Mascot from "./Mascot";
import Icon from "./Icon";
import { Handshake, Video, Zap } from "lucide-react";
import { elegirCombo, cuotaDelCombo, picksDelCombo, cuotasDelPartido } from "./inicioDelSitio";

const { apiUrl: API } = getFrontendConfig();

const fmt = n => Number(n || 0).toFixed(2);

// Tres formas del mismo bloque, según el ancho de la ventana (no del
// contenedor: la barra lateral tiene ancho fijo, así que da lo mismo).
//  - debajo de 1024: teléfono. Hero a lo ancho y las tres tarjetas en fila.
//  - 1024 a 1399: el contenido mide entre 700 y 1100px. En una sola fila
//    el hero quedaría de 300px con la mascota encima del texto, así que
//    va solo, a lo ancho, con la mascota y el título más grandes.
//  - 1400 en adelante: la fila de la mini-app en escritorio, hero de doble
//    ancho y tres tarjetas altas al lado. Acá el hero mide unos 440px, que
//    es el ancho para el que están pensados el padding de 166 y la
//    mascota de 275.
const ESTILO = `
  .iw-fila{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
    gap:${SPACING[8]}px;margin-bottom:${SPACING[16]}px;align-items:stretch}
  .iw-hero{grid-column:1 / -1;position:relative;overflow:hidden;
    border-radius:${RADII.lg}px;cursor:pointer;min-height:244px;
    padding:20px 16px;padding-right:166px;
    background:linear-gradient(115deg,${Q.violet2} 0%,${Q.violet} 70%);
    --iw-mascota:275px}
  .iw-titulo{font-size:22px}
  .iw-sub{font-size:12px;max-width:230px}
  .iw-carta{position:relative;overflow:hidden;min-width:0;height:168px;
    cursor:pointer;border-radius:${RADII.lg}px;background-size:cover;
    background-position:center}
  .iw-secciones{display:grid;grid-template-columns:minmax(0,1fr);
    gap:${SPACING[16]}px}
  .iw-vivos{display:grid;grid-template-columns:minmax(0,1fr);gap:${SPACING[8]}px}
  @media (min-width:1024px){
    .iw-fila{gap:${SPACING[16]}px}
    .iw-hero{min-height:300px;padding:${SPACING[40]}px ${SPACING[32]}px;
      padding-right:340px;--iw-mascota:360px}
    .iw-titulo{font-size:34px}
    .iw-sub{font-size:14px;max-width:440px}
    .iw-carta{height:220px}
    .iw-secciones{grid-template-columns:minmax(0,1fr) minmax(0,2fr)}
    .iw-vivos{grid-template-columns:repeat(3,minmax(0,1fr))}
  }
  @media (min-width:1400px){
    .iw-fila{grid-template-columns:2fr 1fr 1fr 1fr}
    .iw-hero{grid-column:auto;min-height:340px;padding:20px 16px;
      padding-right:166px;--iw-mascota:275px}
    .iw-titulo{font-size:22px}
    .iw-sub{font-size:12px;max-width:230px}
    .iw-carta{height:auto}
    .iw-vivos{grid-template-columns:minmax(0,1fr)}
  }
`;

// El mismo tratamiento en las tres: foto de fondo, un tinte de marca y un
// scrim oscuro abajo donde se apoya el texto (el arte llega a luminancia
// 255 en los brillos, así que el texto no puede apoyarse sobre la foto).
function Carta({ arte, tinte, icono, titulo, sub, onClick }){
  return(
    <div className="iw-carta" role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); onClick(); } }}
      style={{backgroundImage:`url(${arte})`}}>
      <div aria-hidden="true" style={{position:"absolute",inset:0,
        background:tinte,opacity:0.32}}/>
      <div aria-hidden="true" style={{position:"absolute",inset:0,
        background:"linear-gradient(180deg,transparent 0%,rgba(6,10,20,.5) 55%,rgba(6,10,20,.92) 100%)"}}/>
      <div style={{position:"relative",height:"100%",display:"flex",
        flexDirection:"column",justifyContent:"space-between",padding:"16px 12px"}}>
        {icono}
        <div>
          <div style={{color:inkOn(Q.void,Q.dark),fontWeight:800,fontSize:15,
            fontFamily:F_BODY}}>{titulo}</div>
          <div style={{color:inkOn(Q.void,Q.dark),opacity:.85,fontSize:12,
            marginTop:2,lineHeight:1.35,fontFamily:F_BODY}}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

function Encabezado({ icono, texto, aparte }){
  return(
    <div style={{display:"flex",justifyContent:"space-between",
      alignItems:"center",marginBottom:SPACING[8]}}>
      <div style={{display:"flex",alignItems:"center",gap:SPACING[8],
        color:Q.text,fontWeight:800,fontSize:15,fontFamily:F_BODY}}>
        {icono}{texto}</div>
      {aparte}
    </div>
  );
}

export default function InicioWeb({ arriba, ofreceRegistro, onNav, onRegistro,
  onUsarCombo, vivos }){
  const [combo,setCombo]=useState(null);
  const [cargandoCombo,setCargandoCombo]=useState(true);

  useEffect(()=>{
    let vigente=true;
    const pedir=ruta=>fetch(`${API}${ruta}`)
      .then(r=>r.ok?r.json():{combos:[]}).catch(()=>({combos:[]}));
    Promise.all([pedir("/api/app/combos-manuales"),pedir("/api/ai/combos")])
      .then(([man,ia])=>{ if(vigente) setCombo(elegirCombo(man,ia)); })
      .finally(()=>{ if(vigente) setCargandoCombo(false); });
    return()=>{ vigente=false; };
  },[]);

  const enVivo=(vivos||[]).slice(0,3);

  return(
    <div style={{maxWidth:1440,margin:"0 auto",padding:"12px 12px 40px"}}>
      <style>{ESTILO}</style>
      {arriba}

      <div className="iw-fila">
        <div className="iw-hero" role="button" tabIndex={0}
          onClick={()=>onNav("mejorar")}
          onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); onNav("mejorar"); } }}>
          {/* La foto se funde con el violeta: se pinta al 30% sobre el
              degradé del propio panel y el mismo degradé se repinta al 45%
              encima. El resultado es un violeta con textura, no una foto, y
              el texto conserva su contraste. Mismos números que la mini-app. */}
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            backgroundImage:"url(/brand/fondo-hero.webp)",backgroundSize:"cover",
            backgroundPosition:"center",opacity:0.3,pointerEvents:"none"}}/>
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            background:`linear-gradient(115deg,${Q.violet2} 0%,${Q.violet} 70%)`,
            opacity:0.45,pointerEvents:"none"}}/>
          {/* La altura la manda la variable del breakpoint; el ancho sigue
              la proporción del archivo. Asoma recortada por abajo y a la
              derecha, como en la mini-app. */}
          <Mascot size={275} style={{position:"absolute",right:-33,bottom:-56,
            height:"var(--iw-mascota)",width:"auto",
            opacity:0.96,zIndex:2,clipPath:"inset(0 0 13% 0)"}}/>
          <div style={{position:"relative",zIndex:3}}>
            <div style={{fontSize:12,letterSpacing:2,fontWeight:800,color:Q.gold,
              fontFamily:F_BODY}}>BET BEST</div>
            <div className="iw-titulo" style={{fontFamily:F_NUM,fontWeight:700,
              color:inkOn(Q.violet2,Q.violet),lineHeight:1.15,marginTop:5}}>
              Sacale una foto<br/>a tu boleto</div>
            <div className="iw-sub" style={{color:inkOn(Q.violet2,Q.violet),opacity:.8,
              marginTop:7,lineHeight:1.4,fontFamily:F_BODY}}>
              Leemos las selecciones y te decimos si podemos pagarte una cuota mejor.</div>
            <div style={{marginTop:SPACING[16],display:"flex",flexWrap:"wrap",
              alignItems:"center",gap:SPACING[8]}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:SPACING[8],
                background:Q.goldBg,borderRadius:RADII.sm,padding:"8px 16px"}}>
                <Icon name="camera" size={16} color={inkOn(Q.goldBg)}/>
                <span style={{color:inkOn(Q.goldBg),fontWeight:700,fontSize:12.5,
                  fontFamily:F_BODY}}>Escanear boleto</span>
              </span>
              {/* Quien todavía no tiene cuenta es la mayoría de quien llega
                  acá; la puerta al registro va a la vista, no solo en la
                  barra de arriba. Detiene el clic para no abrir Bet Best. */}
              {ofreceRegistro&&(
                <button onClick={e=>{ e.stopPropagation(); onRegistro(); }}
                  style={{background:"transparent",
                    border:`1px solid ${inkOn(Q.violet2,Q.violet)}`,
                    borderRadius:RADII.sm,padding:"8px 16px",cursor:"pointer",
                    color:inkOn(Q.violet2,Q.violet),fontWeight:700,fontSize:12.5,
                    fontFamily:F_BODY}}>Crear cuenta</button>
              )}
            </div>
          </div>
        </div>

        <Carta arte="/brand/slot.webp"
          tinte={`linear-gradient(135deg,${Q.violet},${Q.violet2})`}
          icono={<Icon name="spade" size={24} color={inkOn(Q.void,Q.dark)}/>}
          titulo="Casino" sub="Tragamonedas y mesas"
          onClick={()=>onNav("casino")}/>
        <Carta arte="/brand/live-casino.webp"
          tinte={`linear-gradient(135deg,${Q.pink},${Q.gold})`}
          icono={<Video size={24} color={inkOn(Q.void,Q.dark)} aria-hidden="true"/>}
          titulo="Casino en Vivo" sub="Mesas con crupier"
          onClick={()=>onNav("casinovivo")}/>
        <Carta arte="/brand/desafios.webp"
          tinte={`linear-gradient(135deg,${Q.violet},${Q.cyan})`}
          icono={<Handshake size={22} color={inkOn(Q.void,Q.dark)} aria-hidden="true"/>}
          titulo="Desafíos" sub="Apostá contra otros jugadores"
          onClick={()=>onNav("desafios")}/>
      </div>

      <div className="iw-secciones">
        <section>
          <Encabezado icono={<Zap size={16} color={Q.gold} aria-hidden="true"/>}
            texto="Combo del día"/>
          {combo?(
            <div role="button" tabIndex={0}
              onClick={()=>onUsarCombo(picksDelCombo(combo))}
              onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); onUsarCombo(picksDelCombo(combo)); } }}
              style={{background:`linear-gradient(135deg,${Q.violet}12,${Q.gold}0A),${Q.surface}`,
                border:`1px solid ${Q.gold}55`,borderRadius:RADII.lg,
                padding:SPACING[16],cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",gap:SPACING[8],marginBottom:SPACING[12]}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:14,
                  fontFamily:F_BODY}}>{combo.name||combo.nombre}</div>
                <div style={{background:`${Q.gold}22`,border:`1px solid ${Q.gold}`,
                  borderRadius:RADII.md,padding:"4px 12px",color:Q.gold,
                  fontWeight:900,fontSize:14,fontFamily:F_BODY,
                  whiteSpace:"nowrap"}}>{fmt(cuotaDelCombo(combo))}x</div>
              </div>
              {(combo.picks||[]).slice(0,3).map((p,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",
                  gap:SPACING[8],padding:"4px 0",fontFamily:F_BODY}}>
                  <span style={{color:Q.muted,fontSize:12}}>
                    {p.h||p.home} vs {p.a||p.away}</span>
                  <span style={{color:Q.cyan,fontSize:12,fontWeight:600,
                    whiteSpace:"nowrap"}}>{p.sel} · {fmt(p.odd)}</span>
                </div>
              ))}
              <div style={{marginTop:SPACING[12],textAlign:"center",color:Q.gold,
                fontSize:12,fontWeight:700,fontFamily:F_BODY}}>
                Cargar al boleto →</div>
            </div>
          ):(
            <div style={{background:Q.surface,border:`1px solid ${Q.border}`,
              borderRadius:RADII.lg,padding:SPACING[20],textAlign:"center",
              color:Q.muted,fontSize:12,fontFamily:F_BODY}}>
              {cargandoCombo?"Cargando el combo del día…":"Hoy no hay combo armado."}
            </div>
          )}
        </section>

        <section>
          <Encabezado
            icono={<Icon name="circle-dot" size={16} color={Q.red}/>}
            texto="En vivo ahora"
            aparte={
              <button onClick={()=>onNav("vivo")} style={{background:"transparent",
                border:"none",color:Q.cyan,fontSize:12,fontWeight:700,
                cursor:"pointer",fontFamily:F_BODY}}>Ver todo →</button>
            }/>
          {enVivo.length>0?(
            <div className="iw-vivos">
              {enVivo.map(m=>(
                <div key={m.id} role="button" tabIndex={0}
                  onClick={()=>onNav("vivo")}
                  onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); onNav("vivo"); } }}
                  style={{background:Q.surface,border:`1px solid ${Q.border}`,
                    borderRadius:RADII.lg,padding:SPACING[12],cursor:"pointer",
                    minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"baseline",gap:SPACING[8],marginBottom:SPACING[8]}}>
                    <span style={{color:Q.dim,fontSize:12,fontFamily:F_BODY,
                      overflow:"hidden",textOverflow:"ellipsis",
                      whiteSpace:"nowrap"}}>{m.liga}</span>
                    {m.scoreStr&&(
                      <span style={{color:Q.gold,fontSize:12,fontWeight:700,
                        fontFamily:F_BODY}}>{m.scoreStr}</span>
                    )}
                  </div>
                  <div style={{color:Q.text,fontSize:13,fontWeight:600,
                    lineHeight:1.4,fontFamily:F_BODY}}>
                    {m.home} <span style={{color:Q.dim}}>vs</span> {m.away}</div>
                  {cuotasDelPartido(m).length>0&&(
                    <div style={{display:"flex",gap:SPACING[8],marginTop:SPACING[8]}}>
                      {cuotasDelPartido(m).map(({nombre,cuota})=>(
                        <div key={nombre} style={{flex:1,minWidth:0,textAlign:"center",
                          background:Q.inset,border:`1px solid ${Q.border}`,
                          borderRadius:RADII.sm,padding:"8px 4px"}}>
                          <div style={{color:Q.muted,fontSize:12,overflow:"hidden",
                            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nombre}</div>
                          <div style={{color:Q.gold,fontSize:13,fontWeight:700,
                            fontFamily:F_NUM}}>{fmt(cuota)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ):(
            <div style={{background:Q.surface,border:`1px solid ${Q.border}`,
              borderRadius:RADII.lg,padding:SPACING[20],textAlign:"center"}}>
              <Mascot size={64} style={{margin:"0 auto 8px"}}/>
              <div style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>
                No hay eventos en vivo ahora</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
