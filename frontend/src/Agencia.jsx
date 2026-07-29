// ═══════════════════════════════════════════════════════════════
// ARCHIVO DESTINO: frontend/src/Agencia.jsx
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";

const Q = {
  void:"#020208", deep:"#060612", dark:"#0A0A1E",
  glass:"linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))",
  violet:"#7C3AED", violet2:"#9F5FFF",
  cyan:"#00F0FF", green:"#00FF88",
  pink:"#FF0080", amber:"#FFB800",
  gold:"#E8C547", red:"#FF1744",
  text:"#F0F0FF", muted:"#6B7090", dim:"#2A2A4A",
  border:"rgba(124,58,237,0.25)",
};

const ars = n => "$" + Math.round(n||0).toLocaleString("es-AR");
const fmt = n => Number(n||0).toFixed(2);
const nowStr = () => new Date().toLocaleString("es-AR",{hour12:false});
const expires24 = () => { const d=new Date(); d.setHours(d.getHours()+24); return d.toLocaleString("es-AR",{hour12:false}); };

// ── API ───────────────────────────────────────────────────────
const API_URL = "https://amusing-vision-production.up.railway.app";
const API_BOT = "https://amusing-vision-production.up.railway.app";

class SinConexion extends Error {
  constructor(){ super("Sin conexión con el servidor"); this.name="SinConexion"; }
}
class SesionExpirada extends Error {
  constructor(){ super("La sesión expiró"); this.name="SesionExpirada"; }
}

// Header de autenticación con el token que devolvió el login
const authHeaders = (token) => token ? {"Authorization":`Bearer ${token}`} : {};

async function fetchBetslip(code, token){
  let r;
  try {
    r = await fetch(`${API_URL}/api/betslip/${code}`, {
      headers: authHeaders(token),
    });
  } catch(e) {
    throw new SinConexion();
  }
  if(r.status===401) throw new SesionExpirada();
  if(!r.ok){
    const e = await r.json().catch(()=>({}));
    throw new Error(e.detail || `Error ${r.status}`);
  }
  return r.json();
}

async function payBetslip(code, stake, token){
  let r;
  try {
    r = await fetch(`${API_URL}/api/betslip/${code}/pay`, {
      method:"POST",
      headers:{"Content-Type":"application/json", ...authHeaders(token)},
      body:JSON.stringify({stake}),
    });
  } catch(e) {
    throw new SinConexion();
  }
  if(r.status===401) throw new SesionExpirada();
  if(!r.ok){
    const e = await r.json().catch(()=>({}));
    throw new Error(e.detail || `No se pudo registrar el pago (${r.status})`);
  }
  return r.json();
}

// ── DESIGN ────────────────────────────────────────────────────
function GCard({ children, style={}, glow }){
  return(
    <div style={{
      background:Q.glass, backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
      border:`1px solid ${glow?glow+"44":Q.border}`,
      borderRadius:16,
      boxShadow:`0 8px 32px rgba(0,0,0,0.5)${glow?`, 0 0 24px ${glow}22`:""}`,
      position:"relative", overflow:"hidden", maxWidth:"100%", minWidth:0, ...style,
    }}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:1,
        background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)",
        pointerEvents:"none"}}/>
      {children}
    </div>
  );
}

function AlertaError({ mensaje, critico=false }){
  if(!mensaje) return null;
  return(
    <div style={{
      background:critico?`${Q.red}22`:"rgba(255,23,68,0.10)",
      border:`2px solid ${Q.red}`, borderRadius:12,
      padding:critico?"16px":"12px 14px", marginBottom:12,
      display:"flex", alignItems:"flex-start", gap:10,
    }}>
      <span style={{fontSize:critico?24:18,lineHeight:1}}>⚠️</span>
      <div>
        {critico&&<div style={{color:Q.red,fontWeight:900,fontSize:16,
          fontFamily:"'Space Grotesk',system-ui",marginBottom:4,letterSpacing:0.5}}>
          NO COBRAR
        </div>}
        <div style={{color:critico?Q.text:Q.red,fontSize:critico?13:12,
          fontFamily:"'Space Grotesk',system-ui",lineHeight:1.4}}>{mensaje}</div>
      </div>
    </div>
  );
}

function QPLogo({ size=20 }){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <svg width={size} height={size} viewBox="0 0 24 24">
        <defs>
          <linearGradient id="qglag" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={Q.violet}/>
            <stop offset="100%" stopColor={Q.cyan}/>
          </linearGradient>
        </defs>
        <polygon points="12,2 20,8 20,16 12,22 4,16 4,8" fill="none" stroke="url(#qglag)" strokeWidth={1.5}/>
        <polygon points="12,5 18,9.5 18,15 12,19 6,15 6,9.5" fill="url(#qglag)" opacity={0.3}/>
        <circle cx={12} cy={12} r={2} fill={Q.cyan} opacity={0.9}/>
      </svg>
      <span style={{
        fontFamily:"'Space Grotesk',system-ui", fontWeight:900, fontSize:size,
        background:`linear-gradient(135deg,${Q.violet2},${Q.cyan})`,
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        backgroundClip:"text", letterSpacing:-0.5,
      }}>QuartzPlay</span>
    </div>
  );
}

function Btn({ label, onClick, color=Q.violet, outline=false, size="md", full=false, disabled=false }){
  const h=size==="lg"?"50px":size==="sm"?"34px":"44px";
  const fs=size==="lg"?15:size==="sm"?11:13;
  return(
    <button onClick={onClick} disabled={disabled} style={{
      height:h, width:full?"100%":"auto",
      padding:`0 ${size==="sm"?"10px":"18px"}`,
      background:disabled?"rgba(255,255,255,0.04)":outline?"transparent":`linear-gradient(135deg,${color},${color}CC)`,
      border:`1px solid ${disabled?Q.dim:color}`,borderRadius:12,
      color:disabled?Q.muted:outline?color:"#fff",
      fontSize:fs,fontWeight:700,cursor:disabled?"not-allowed":"pointer",
      display:"flex",alignItems:"center",justifyContent:"center",gap:7,
      fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
      boxShadow:(!outline&&!disabled)?`0 4px 16px ${color}33`:"none",
    }}>{label}</button>
  );
}

// ── TICKET TÉRMICO ────────────────────────────────────────────
// En el celular no sirve abrir una ventana y auto-cerrarla: se cierra
// antes de que el usuario elija impresora o "Guardar como PDF".
// En su lugar mostramos el ticket en pantalla con botones para
// imprimir/guardar PDF y descargar, y el usuario decide cuándo.
function abrirVentanaImpresion(html, w=420, h=650){
  try{
    const cont = document.createElement("div");
    cont.id = "qp-ticket-overlay";
    cont.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);"+
      "display:flex;flex-direction:column;align-items:center;"+
      "overflow-y:auto;padding:16px;-webkit-overflow-scrolling:touch;";

    const barra = document.createElement("div");
    barra.style.cssText =
      "display:flex;gap:8px;width:100%;max-width:420px;margin-bottom:12px;"+
      "position:sticky;top:0;";
    barra.innerHTML =
      '<button id="qp-print" style="flex:1;background:linear-gradient(135deg,#7C3AED,#00F0FF);'+
      'border:none;border-radius:10px;padding:13px;color:#fff;font-weight:700;'+
      'font-size:14px;font-family:system-ui;cursor:pointer">🖨️ Imprimir / Guardar PDF</button>'+
      '<button id="qp-close" style="background:rgba(255,255,255,0.15);'+
      'border:none;border-radius:10px;padding:13px 18px;color:#fff;font-weight:700;'+
      'font-size:14px;font-family:system-ui;cursor:pointer">✕</button>';

    const marco = document.createElement("iframe");
    marco.style.cssText =
      "width:100%;max-width:420px;height:70vh;border:none;border-radius:12px;"+
      "background:white;box-shadow:0 8px 40px rgba(0,0,0,0.5);";

    cont.appendChild(barra);
    cont.appendChild(marco);
    document.body.appendChild(cont);

    const doc = marco.contentWindow.document;
    doc.open(); doc.write(html); doc.close();

    const cerrar = ()=>{ try{ document.body.removeChild(cont); }catch(e){} };
    document.getElementById("qp-close").onclick = cerrar;
    document.getElementById("qp-print").onclick = ()=>{
      try{
        marco.contentWindow.focus();
        marco.contentWindow.print();   // el usuario elige impresora o PDF
      }catch(e){
        alert("No se pudo abrir el diálogo de impresión.");
      }
    };
    return true;
  }catch(e){
    // Respaldo: abrir en pestaña nueva sin auto-cerrar
    const win = window.open("","_blank");
    if(!win){
      alert("El navegador bloqueó la ventana.\nPermití las ventanas emergentes para este sitio.");
      return false;
    }
    win.document.write(html);
    win.document.close();
    return true;
  }
}

function printTicket(slip, tipo="apuesta"){
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm;background:white;color:black}
.c{text-align:center}.b{font-weight:bold}.lg{font-size:15px}.xl{font-size:20px}
.div{border-top:1px dashed #000;margin:5px 0}
.row{display:flex;justify-content:space-between;margin:2px 0}
.pick{margin:4px 0;padding:3px 0;border-bottom:1px dotted #aaa}
.ft{font-size:10px;text-align:center;color:#555;margin-top:4px}
</style></head><body>
<div class="c b xl">QuartzPlay</div>
<div class="c" style="font-size:10px">Agencia Oficial · ${slip.agencia||"AGE001"}</div>
<div class="div"></div>
<div class="c b lg">${tipo==="cobro"?"COMPROBANTE DE COBRO":tipo==="cierre"?"CIERRE DE CAJA":"TICKET DE APUESTA"}</div>
<div class="c b" style="font-size:18px;margin:4px 0">#${slip.code}</div>
<div class="row"><span>Usuario:</span><span>${slip.user||"—"}</span></div>
<div class="row"><span>Emitido:</span><span>${slip.created_at||nowStr()}</span></div>
<div class="row"><span>Válido hasta:</span><span>${slip.expires_at||expires24()}</span></div>
<div class="div"></div>
<div class="b c">COMBINADA (${slip.picks?.length||0} picks)</div>
<div class="div"></div>
${(slip.picks||[]).map((p,i)=>`
<div class="pick">
  <div class="b">${i+1}. ${p.home} vs ${p.away}</div>
  <div>${p.sport}</div>
  <div class="row"><span>→ ${p.sel}</span><span class="b">@${p.odd}</span></div>
</div>`).join("")}
<div class="div"></div>
<div class="row b"><span>CUOTA TOTAL:</span><span>${fmt(slip.odd_total)}x</span></div>
<div class="row b lg"><span>APOSTADO:</span><span>${ars(slip.stake)} ARS</span></div>
<div class="row b lg"><span>RETORNO POT.:</span><span>${ars(slip.potential_win)} ARS</span></div>
${tipo==="cobro"?`<div class="div"></div><div class="c b" style="font-size:16px">PAGADO: ${ars(slip.potential_win)} ARS</div>`:""}
<div class="div"></div>
<div class="c" style="font-size:40px;margin:6px 0">▓▓▓▓▓▓</div>
<div class="c b">${slip.code}</div>
<div class="div"></div>
<div class="ft">quartzplay.com · @QuartzPlayBot</div>
<div class="ft">Jugá con responsabilidad · Solo mayores de 18</div>
</body></html>`;
  return abrirVentanaImpresion(html, 420, 650);
}

function printCierre(data, tipo, agencia){
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm;background:white;color:black}
.c{text-align:center}.b{font-weight:bold}.lg{font-size:15px}.xl{font-size:18px}
.div{border-top:1px dashed #000;margin:5px 0}
.row{display:flex;justify-content:space-between;margin:3px 0}
.ft{font-size:10px;text-align:center;color:#555;margin-top:4px}
</style></head><body>
<div class="c b xl">QuartzPlay</div>
<div class="c b">CIERRE ${tipo.toUpperCase()}</div>
<div class="c">${agencia.name} · ${agencia.code}</div>
<div class="div"></div>
<div class="row"><span>Período:</span><span>${data.periodo}</span></div>
<div class="row"><span>Generado:</span><span>${nowStr()}</span></div>
<div class="div"></div>
<div class="b c">RESUMEN OPERACIONES</div>
<div class="div"></div>
<div class="row"><span>Total tickets:</span><span>${data.tickets}</span></div>
<div class="row"><span>Tickets bot:</span><span>${data.tickets_bot}</span></div>
<div class="row"><span>Tickets manual:</span><span>${data.tickets_manual}</span></div>
<div class="div"></div>
<div class="row b lg"><span>COBRADO:</span><span>${ars(data.cobrado)} ARS</span></div>
<div class="row b"><span>PAGADO (premios):</span><span>${ars(data.pagado)} ARS</span></div>
<div class="div"></div>
<div class="row b lg"><span>NETO AGENCIA:</span><span>${ars(data.neto)} ARS</span></div>
<div class="div"></div>
<div class="ft">Este comprobante es válido como cierre oficial.</div>
<div class="ft">quartzplay.com · ${agencia.code}</div>
</body></html>`;
  return abrirVentanaImpresion(html, 420, 600);
}



// ── ESCUDO DE EQUIPO ──────────────────────────────────────────
function hashColor(str){
  let h=0;
  for(let i=0;i<(str||"").length;i++) h=((h<<5)-h)+str.charCodeAt(i);
  h=Math.abs(h);
  const colors=["#7C3AED","#2979FF","#00BCD4","#FF6B35","#E91E63",
    "#009688","#FF5722","#3F51B5","#8BC34A","#FF9800",
    "#9C27B0","#00ACC1","#43A047","#F4511E","#1E88E5"];
  return colors[h % colors.length];
}

function TeamLogo({ name, size=28 }){
  const [falloImg,setFalloImg]=useState(false);
  const color = hashColor(name);
  const iniciales = (name||"?").split(" ").filter(Boolean)
    .slice(0,2).map(w=>w[0].toUpperCase()).join("");

  if(name && !falloImg) return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:"rgba(255,255,255,0.06)",border:`1.5px solid ${color}66`,
      display:"flex",alignItems:"center",justifyContent:"center",
      overflow:"hidden"}}>
      <img src={`${API_URL}/api/team-logo/nombre/${encodeURIComponent(name)}`}
        alt={name} loading="lazy" onError={()=>setFalloImg(true)}
        style={{width:"78%",height:"78%",objectFit:"contain"}}/>
    </div>
  );

  return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:`linear-gradient(135deg,${color}CC,${color}88)`,
      border:`1.5px solid ${color}`,display:"flex",
      alignItems:"center",justifyContent:"center"}}>
      <span style={{color:"#fff",fontWeight:900,fontSize:size*0.36,
        fontFamily:"'Space Grotesk',system-ui",lineHeight:1}}>
        {iniciales||"?"}
      </span>
    </div>
  );
}

// ── MERCADOS EN ESPAÑOL ───────────────────────────────────────
const MKT_ES = {
  // Principales
  h2h:                          {t:"Ganador",                  o:1},
  h2h_3_way:                    {t:"Ganador (1X2)",            o:2},
  totals:                       {t:"Más / Menos goles",        o:3},
  spreads:                      {t:"Hándicap",                 o:4},
  double_chance:                {t:"Doble oportunidad",        o:5},
  draw_no_bet:                  {t:"Empate no válido",         o:6},
  btts:                         {t:"Ambos anotan",             o:7},
  correct_score:                {t:"Resultado exacto",         o:8},
  halftime_fulltime:            {t:"Entretiempo / Final",      o:9},
  to_qualify:                   {t:"Clasifica",                o:10},
  // Líneas alternativas
  alternate_totals:             {t:"Más / Menos (alt.)",       o:11},
  alternate_spreads:            {t:"Hándicap (alt.)",          o:12},
  team_totals:                  {t:"Goles por equipo",         o:13},
  alternate_team_totals:        {t:"Goles por equipo (alt.)",  o:14},
  // Primer tiempo
  h2h_h1:                       {t:"Ganador 1er tiempo",       o:15},
  totals_h1:                    {t:"Más / Menos 1er tiempo",   o:16},
  spreads_h1:                   {t:"Hándicap 1er tiempo",      o:17},
  btts_h1:                      {t:"Ambos anotan 1er tiempo",  o:18},
  double_chance_h1:             {t:"Doble oport. 1er tiempo",  o:19},
  correct_score_h1:             {t:"Resultado exacto 1er T.",  o:20},
  // Córners
  alternate_totals_corners:     {t:"Córners · Más / Menos",    o:21},
  alternate_spreads_corners:    {t:"Córners · Hándicap",       o:22},
  alternate_team_totals_corners:{t:"Córners por equipo",       o:23},
  corners_1x2:                  {t:"Quién patea más córners",  o:24},
  // Tarjetas
  alternate_totals_cards:       {t:"Tarjetas · Más / Menos",   o:25},
  alternate_spreads_cards:      {t:"Tarjetas · Hándicap",      o:26},
  // Jugadores
  player_goal_scorer_anytime:   {t:"Anota en el partido",      o:27},
  player_first_goal_scorer:     {t:"Primer goleador",          o:28},
  player_last_goal_scorer:      {t:"Último goleador",          o:29},
  player_to_receive_card:       {t:"Jugador que ve tarjeta",   o:30},
  player_to_receive_red_card:   {t:"Jugador que ve roja",      o:31},
  player_shots_on_target:       {t:"Tiros al arco",            o:32},
  player_shots:                 {t:"Remates",                  o:33},
  player_assists:               {t:"Asistencias",              o:34},
};

function tituloMercado(k){
  return MKT_ES[k]?.t || k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
}
function ordenMercado(k){ return MKT_ES[k]?.o ?? 99; }

// Traduce el nombre del resultado que devuelve la API
function etiquetaResultado(nombre, home, away){
  if(nombre==="Draw")   return "Empate";
  if(nombre==="Yes")    return "Sí";
  if(nombre==="No")     return "No";
  if(nombre===home)     return home;
  if(nombre===away)     return away;
  let m = nombre.match(/^Over\s*([\d.]+)$/i);
  if(m) return `Más de ${m[1]}`;
  m = nombre.match(/^Under\s*([\d.]+)$/i);
  if(m) return `Menos de ${m[1]}`;
  // "Equipo -1.5" o "Equipo +1.5"
  m = nombre.match(/^(.+?)\s*([+-][\d.]+)$/);
  if(m) return `${m[1]} ${m[2]}`;
  return nombre;
}

// ── PANEL DE MERCADOS DE UN EVENTO ────────────────────────────
// Muestra lo que ya vino en el listado y, además, pide a la API los
// mercados adicionales (córners, tarjetas, goleadores) que solo se
// pueden consultar evento por evento.
function MercadosEvento({ ev, bets, onToggle, color=Q.violet }){
  const [extra,setExtra]=useState(null);
  const [cargando,setCargando]=useState(false);
  const [aviso,setAviso]=useState("");

  const home = ev.h || ev.home || "";
  const away = ev.a || ev.away || "";
  const sportKey = ev.sport_key;

  useEffect(()=>{
    if(!sportKey || !ev.id) return;
    let vivo = true;
    setCargando(true);
    fetch(`${API_BOT}/api/event/${sportKey}/${ev.id}/markets`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(!vivo) return;
        if(d?.markets && Object.keys(d.markets).length) setExtra(d.markets);
        else setAviso("No hay mercados adicionales para este partido");
      })
      .catch(()=>{ if(vivo) setAviso("No se pudieron cargar los mercados"); })
      .finally(()=>{ if(vivo) setCargando(false); });
    return ()=>{ vivo=false; };
  },[sportKey, ev.id]);

  const todos = { ...(ev.markets||{}), ...(extra||{}) };
  const claves = Object.keys(todos)
    .filter(k=>todos[k] && Object.keys(todos[k]).length)
    .sort((a,b)=>ordenMercado(a)-ordenMercado(b));

  if(!claves.length && !cargando)
    return (
      <div style={{color:Q.dim,fontSize:11,padding:"10px 0",textAlign:"center",
        fontFamily:"'Space Grotesk',system-ui"}}>
        {aviso||"Sin mercados disponibles"}
      </div>
    );

  return(
    <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${Q.dim}`}}>
      {claves.map(k=>{
        const resultados = Object.entries(todos[k]);
        // Los mercados de jugador traen decenas de nombres: scroll propio
        const muchos = resultados.length > 6;
        return(
          <div key={k} style={{marginBottom:10}}>
            <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",
              letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",
              marginBottom:5,display:"flex",justifyContent:"space-between"}}>
              <span>{tituloMercado(k)}</span>
              {muchos&&<span style={{color:Q.dim}}>{resultados.length} opciones</span>}
            </div>
            <div style={{
              display:"grid",
              gridTemplateColumns: resultados.length<=3?`repeat(${resultados.length},1fr)`:"1fr 1fr",
              gap:4,
              maxHeight: muchos?180:"none",
              overflowY: muchos?"auto":"visible",
            }}>
              {resultados.map(([nombre,cuota])=>{
                const etiqueta = etiquetaResultado(nombre, home, away);
                const sel = bets.some(b=>b.id===ev.id && b.label===etiqueta);
                return(
                  <button key={nombre}
                    onClick={()=>onToggle(ev, etiqueta, cuota)}
                    style={{
                      background:sel?`linear-gradient(135deg,${color}44,${Q.violet}22)`
                                    :"rgba(255,255,255,0.04)",
                      border:`1.5px solid ${sel?color:Q.border}`,
                      borderRadius:9,padding:"7px 6px",cursor:"pointer",
                      display:"flex",alignItems:"center",
                      justifyContent:"space-between",gap:6,minWidth:0,
                    }}>
                    <span style={{color:Q.muted,fontSize:10,
                      fontFamily:"'Space Grotesk',system-ui",
                      overflow:"hidden",textOverflow:"ellipsis",
                      whiteSpace:"nowrap",flex:1,textAlign:"left"}}>{etiqueta}</span>
                    <span style={{color:sel?color:Q.text,fontWeight:700,fontSize:12,
                      fontFamily:"'Space Grotesk',system-ui",flexShrink:0}}>
                      {fmt(cuota)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {cargando&&(
        <div style={{color:Q.dim,fontSize:10,textAlign:"center",padding:"6px 0",
          fontFamily:"'Space Grotesk',system-ui"}}>
          Buscando córners, tarjetas y goleadores...
        </div>
      )}
    </div>
  );
}

// ── FILTRO DE EVENTOS ─────────────────────────────────────────
// El cajero necesita encontrar un partido puntual rápido, con el cliente
// esperando en el mostrador. Filtra por liga y por nombre de equipo.
function FiltroEventos({ ligas, liga, setLiga, busqueda, setBusqueda, total }){
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,
        background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
        borderRadius:10,padding:"8px 12px",marginBottom:8}}>
        <span style={{color:Q.muted,fontSize:15}}>🔍</span>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          placeholder="Buscar equipo..."
          style={{background:"transparent",border:"none",color:Q.text,
            fontSize:14,flex:1,minWidth:0,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        {busqueda&&(
          <button onClick={()=>setBusqueda("")} style={{background:"transparent",
            border:"none",color:Q.muted,fontSize:16,cursor:"pointer",
            padding:0,lineHeight:1}}>✕</button>
        )}
      </div>

      <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:3,
        WebkitOverflowScrolling:"touch"}}>
        <button onClick={()=>setLiga(null)} style={{
          background:!liga?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`
                          :"rgba(255,255,255,0.04)",
          border:`1px solid ${!liga?Q.cyan:Q.border}`,borderRadius:20,
          padding:"6px 14px",cursor:"pointer",color:!liga?Q.cyan:Q.muted,
          fontSize:11,fontWeight:!liga?700:400,whiteSpace:"nowrap",
          flexShrink:0,fontFamily:"'Space Grotesk',system-ui",
        }}>Todas ({total})</button>
        {ligas.map(l=>(
          <button key={l.name} onClick={()=>setLiga(l.name)} style={{
            background:liga===l.name?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`
                                    :"rgba(255,255,255,0.04)",
            border:`1px solid ${liga===l.name?Q.cyan:Q.border}`,borderRadius:20,
            padding:"6px 14px",cursor:"pointer",
            color:liga===l.name?Q.cyan:Q.muted,
            fontSize:11,fontWeight:liga===l.name?700:400,whiteSpace:"nowrap",
            flexShrink:0,fontFamily:"'Space Grotesk',system-ui",
          }}>{l.icon} {l.name} ({(l.events||[]).length})</button>
        ))}
      </div>
    </div>
  );
}

// Aplica liga + texto sobre la lista de deportes
function filtrarDeportes(deportes, liga, busqueda){
  const q = (busqueda||"").trim().toLowerCase();
  return (deportes||[])
    .filter(d=>!liga || d.name===liga)
    .map(d=>({...d, events:(d.events||[]).filter(ev=>{
      if(!q) return true;
      return `${ev.h||ev.home||""} ${ev.a||ev.away||""}`.toLowerCase().includes(q);
    })}))
    .filter(d=>d.events.length>0);
}

// ── LOGIN ──────────────────────────────────────────────────────
function LoginScreen({ onLogin }){
  const [user,setUser]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const login=async()=>{
    if(loading) return;
    setErr(""); setLoading(true);
    let r;
    try {
      r = await fetch(`${API_URL}/api/agencias/login`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username:user,password:pass}),
      });
    } catch(e){
      setErr("Sin conexión con el servidor. No se puede operar hasta que vuelva.");
      setLoading(false);
      return;
    }
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      setErr(e.detail||"Usuario o contraseña incorrectos");
      setLoading(false);
      return;
    }
    const data=await r.json();
    setLoading(false);
    if(!data.token){
      setErr("El servidor no devolvió una sesión válida. Avisá al administrador.");
      return;
    }
    onLogin(data);
  };

  return(
    <div style={{background:Q.void,minHeight:"100vh",display:"flex",
      alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{width:"100%",maxWidth:380,position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <QPLogo size={28}/>
          <div style={{color:Q.muted,fontSize:12,marginTop:8,
            fontFamily:"'Space Grotesk',system-ui"}}>Panel de Agencia Oficial</div>
        </div>
        <GCard glow={Q.violet} style={{padding:28}}>
          {[["Usuario","text",user,setUser,"usuario"],
            ["Contraseña","password",pass,setPass,"••••••••"]].map(([l,t,v,sv,ph])=>(
            <div key={l} style={{marginBottom:16}}>
              <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
                letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>{l}</div>
              <input type={t} value={v} onChange={e=>sv(e.target.value)} placeholder={ph}
                onKeyDown={e=>e.key==="Enter"&&login()}
                style={{width:"100%",background:"rgba(255,255,255,0.05)",
                  border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px 14px",
                  color:Q.text,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}/>
            </div>
          ))}
          <AlertaError mensaje={err}/>
          <Btn label={loading?"INGRESANDO...":"INGRESAR"} onClick={login}
            color={Q.violet} size="lg" full disabled={loading||!user||!pass}/>
        </GCard>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLUJO A+C — CÓDIGO DEL BOT
// ═══════════════════════════════════════════════════════════════
function FlujoCodigo({ agencia, onSesionExpirada }){
  const [code,setCode]=useState("");
  const [slip,setSlip]=useState(null);
  const [err,setErr]=useState("");
  const [payErr,setPayErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [paying,setPaying]=useState(false);
  const [step,setStep]=useState("buscar");

  const buscar=async()=>{
    setErr(""); setPayErr(""); setSlip(null); setStep("buscar"); setLoading(true);
    try {
      const found = await fetchBetslip(code, agencia.token);
      setSlip(found); setStep("confirmar");
    } catch(e){
      if(e.name==="SesionExpirada"){ onSesionExpirada(); return; }
      setErr(e.name==="SinConexion"
        ? "Sin conexión con el servidor. No se puede validar el código — no cobrar."
        : (e.message||"Código no encontrado."));
    }
    setLoading(false);
  };

  const confirmarApuesta=()=>{ setStep("done_confirmado"); };
  const pagarLocal=()=>{ setPayErr(""); setStep("pagar"); };

  const confirmarPago=async(monto)=>{
    if(paying) return;
    setPayErr(""); setPaying(true);
    try {
      const result = await payBetslip(slip.code, monto, agencia.token);
      setSlip(s=>({...s,
        stake: result.stake,
        potential_win: result.potential_win,
        paid_local: true}));
      setStep("done_pagado");
    } catch(e){
      if(e.name==="SesionExpirada"){ onSesionExpirada(); return; }
      setPayErr(e.name==="SinConexion"
        ? "No hay conexión con el servidor, la apuesta NO quedó registrada. No aceptes el efectivo."
        : `La apuesta NO quedó registrada: ${e.message}`);
    }
    setPaying(false);
  };

  const reset=()=>{ setCode(""); setSlip(null); setErr(""); setPayErr(""); setStep("buscar"); };

  return(
    <div>
      <GCard glow={Q.violet} style={{padding:20,marginBottom:16}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Buscar código de apuesta</div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:14}}>
          El cliente muestra el código QP-XXXXX desde su celular o ticket
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&buscar()}
            placeholder="QP-47829"
            style={{flex:1,background:"rgba(255,255,255,0.06)",
              border:`1.5px solid ${Q.border}`,borderRadius:10,
              padding:"12px 16px",color:Q.text,fontSize:20,
              fontFamily:"'Space Grotesk',system-ui",fontWeight:700,letterSpacing:2}}/>
          <Btn label={loading?"...":"BUSCAR"} onClick={buscar}
            disabled={!code||loading} color={Q.violet}/>
        </div>
        {err&&<div style={{marginTop:12}}><AlertaError mensaje={err}/></div>}
      </GCard>

      {slip&&step==="confirmar"&&(
        <div>
          <GCard glow={Q.green} style={{padding:20,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{color:Q.green,fontWeight:900,fontSize:18,
                  fontFamily:"'Space Grotesk',system-ui"}}>{slip.code}</div>
                <div style={{color:Q.muted,fontSize:12}}>
                  {slip.user} · {slip.created_at}
                </div>
              </div>
              <div style={{background:`${Q.green}22`,border:`1px solid ${Q.green}`,
                borderRadius:20,padding:"4px 12px",color:Q.green,
                fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                VÁLIDO
              </div>
            </div>
            {(slip.picks||[]).map((p,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"8px 0",
                borderBottom:i<slip.picks.length-1?`1px solid ${Q.dim}`:"none"}}>
                <div>
                  <div style={{color:Q.text,fontWeight:600,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>{p.home} vs {p.away}</div>
                  <div style={{color:Q.muted,fontSize:11}}>{p.sport} · {p.sel}</div>
                </div>
                <div style={{color:Q.cyan,fontWeight:700,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>@{p.odd}</div>
              </div>
            ))}
            <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${Q.violet}44`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{color:Q.muted,fontSize:13}}>Cuota total</span>
                <span style={{color:Q.gold,fontWeight:700,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>{fmt(slip.odd_total)}x</span>
              </div>
              {slip.stake>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{color:Q.muted,fontSize:13}}>Apostado (online)</span>
                <span style={{color:Q.text,fontWeight:700,fontSize:15,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(slip.stake)}</span>
              </div>}
              {slip.potential_win>0&&<div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:Q.muted,fontSize:14,fontWeight:700}}>RETORNO POT.</span>
                <span style={{color:Q.green,fontWeight:900,fontSize:22,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(slip.potential_win)}</span>
              </div>}
            </div>
          </GCard>

          <AlertaError mensaje={payErr} critico/>

          <GCard style={{padding:16,marginBottom:12}}>
            <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:12,
              fontFamily:"'Space Grotesk',system-ui"}}>¿Qué quiere hacer el cliente?</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={confirmarApuesta} style={{
                background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.green}`,
                borderRadius:12,padding:14,cursor:"pointer",textAlign:"left"}}>
                <div style={{color:Q.green,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui",marginBottom:3}}>
                  Confirmar apuesta y entregar ticket
                </div>
                <div style={{color:Q.muted,fontSize:12}}>
                  Ya apostó online — quiere el comprobante impreso
                </div>
              </button>
              <button onClick={pagarLocal} style={{
                background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.amber}`,
                borderRadius:12,padding:14,cursor:"pointer",textAlign:"left"}}>
                <div style={{color:Q.amber,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui",marginBottom:3}}>
                  Pagar en efectivo en el local
                </div>
                <div style={{color:Q.muted,fontSize:12}}>
                  Trajo el código pero paga en efectivo acá
                </div>
              </button>
            </div>
          </GCard>
          <Btn label="Cancelar" onClick={reset} outline color={Q.muted} full/>
        </div>
      )}

      {step==="pagar"&&slip&&(
        <PagoLocalForm slip={slip} error={payErr} paying={paying}
          onConfirm={confirmarPago} onCancel={reset}/>
      )}
      {step==="done_confirmado"&&slip&&(
        <DoneScreen slip={{...slip,agencia:agencia.code}}
          titulo="Apuesta confirmada" color={Q.green} tipo="apuesta" onReset={reset}/>
      )}
      {step==="done_pagado"&&slip&&(
        <DoneScreen slip={{...slip,agencia:agencia.code}}
          titulo="Pago registrado" color={Q.amber} tipo="apuesta" onReset={reset}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLUJO B — APUESTA MANUAL
// ═══════════════════════════════════════════════════════════════
function FlujoManual({ agencia }){
  const [picks,setPicks]=useState([]);
  const [monto,setMonto]=useState(5000);
  const [cliente,setCliente]=useState("");
  const [ligaSel,setLigaSel]=useState(null);
  const [busq,setBusq]=useState("");
  const [step,setStep]=useState("armar");
  const [slip,setSlip]=useState(null);
  const [liveDeportes,setLiveDeportes]=useState(null);
  const [prematchDeportes,setPrematchDeportes]=useState(null);
  const [tabOferta,setTabOferta]=useState("prematch");
  const [abiertos,setAbiertos]=useState({});
  const toggleMercados=(id)=>setAbiertos(a=>({...a,[id]:!a[id]}));
  const [liga,setLiga]=useState(null);
  const [busqueda,setBusqueda]=useState("");
  const [ligaLive,setLigaLive]=useState(null);
  const [busqLive,setBusqLive]=useState("");

  useEffect(()=>{
    fetch(`${API_BOT}/api/live/combined`)
      .then(r=>r.ok?r.json():null)
      .then(data=>{
        if(data?.matches?.length>0){
          const withOdds=data.matches.filter(m=>m.hasOdds);
          if(withOdds.length>0) setLiveDeportes(withOdds);
        }
      }).catch(()=>{});
    fetch(`${API_BOT}/api/live/prematch`)
      .then(r=>r.ok?r.json():null)
      .then(data=>setPrematchDeportes(data?.sports || []))
      .catch(()=>setPrematchDeportes([]));
  },[]);

  const togglePick=(ev,sport,label,odd)=>{
    const id=`${ev.home}-${ev.away}-${label}`;
    setPicks(p=>{
      const w=p.filter(x=>x.id!==id);
      if(p.find(x=>x.id===id)) return w;
      return[...w,{id,home:ev.home,away:ev.away,sel:label,odd,sport,
        event_id:ev.event_id||ev.id||null, sport_key:ev.sport_key||null}];
    });
  };
  const hasPick=(ev,label)=>picks.some(x=>x.id===`${ev.home}-${ev.away}-${label}`);
  const totOdd=picks.length?picks.reduce((a,p)=>a*p.odd,1):1;

  const [guardando,setGuardando]=useState(false);
  const [errGuardar,setErrGuardar]=useState("");

  // Antes esto armaba el código con Math.random() y no tocaba el servidor:
  // el ticket impreso no existía en la base, no entraba en los cierres, y
  // si el cliente volvía a cobrar no había registro de nada.
  // Ahora se crea el boleto y se cobra, las dos cosas contra la API.
  const confirmar=async()=>{
    if(guardando) return;
    setErrGuardar(""); setGuardando(true);
    try {
      // 1. crear el boleto
      let r = await fetch(`${API_URL}/api/betslip`,{
        method:"POST",
        headers:{"Content-Type":"application/json", ...authHeaders(agencia.token)},
        body:JSON.stringify({
          picks: picks.map(p=>({
            home:p.home, away:p.away, sel:p.sel, odd:p.odd, sport:p.sport,
            event_id:p.event_id||null, sport_key:p.sport_key||null,
          })),
          cliente: cliente || null,
        }),
      });
      if(r.status===401) throw new SesionExpirada();
      if(!r.ok){
        const e = await r.json().catch(()=>({}));
        throw new Error(e.detail || `No se pudo registrar (${r.status})`);
      }
      const creado = await r.json();

      // 2. cobrarlo con el monto que entregó el cliente
      const pago = await payBetslip(creado.code, monto, agencia.token);

      setSlip({
        code: creado.code,
        user: cliente || "Cliente mostrador",
        created_at: nowStr(),
        expires_at: expires24(),
        status: "active",
        picks,
        stake: pago.stake,
        odd_total: pago.odd_total,
        potential_win: pago.potential_win,
        agencia: agencia.code,
      });
      setStep("done");
    } catch(e){
      setErrGuardar(e.name==="SinConexion"
        ? "Sin conexión con el servidor. La apuesta NO quedó registrada, no aceptes el efectivo."
        : `La apuesta NO quedó registrada: ${e.message}`);
    }
    setGuardando(false);
  };

  const reset=()=>{ setPicks([]); setMonto(5000); setCliente(""); setStep("armar"); setSlip(null); };

  if(step==="done"&&slip) return(
    <DoneScreen slip={slip} titulo="Apuesta registrada"
      color={Q.violet} tipo="apuesta" onReset={reset}/>
  );

  return(
    <div>
      <GCard style={{padding:16,marginBottom:14}}>
        <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
          letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>
          Nombre del cliente (opcional)
        </div>
        <input value={cliente} onChange={e=>setCliente(e.target.value)}
          placeholder="Ej: Juan Pérez"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 14px",
            color:Q.text,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}/>
      </GCard>

      <div style={{display:"flex",gap:5,marginBottom:14}}>
        {[{k:"prematch",l:"📋 Prematch"},{k:"live",l:"🔴 En Vivo"}].map(t=>(
          <button key={t.k} onClick={()=>setTabOferta(t.k)} style={{
            flex:1,
            background:tabOferta===t.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
            border:`1px solid ${tabOferta===t.k?Q.cyan:Q.border}`,
            borderRadius:10,padding:"8px",cursor:"pointer",
            color:tabOferta===t.k?Q.cyan:Q.muted,fontSize:12,fontWeight:tabOferta===t.k?700:400,
            fontFamily:"'Space Grotesk',system-ui",
          }}>{t.l}</button>
        ))}
      </div>

      {tabOferta==="live"&&(
        <>
          {!liveDeportes&&(
            <GCard style={{padding:20,textAlign:"center"}}>
              <div style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>Cargando partidos en vivo...</div>
            </GCard>
          )}
          {liveDeportes&&liveDeportes.length>0&&(()=>{
            const ligas = [...new Set(liveDeportes.map(m=>m.liga).filter(Boolean))]
              .map(n=>({name:n, icon:"🔴",
                        events:liveDeportes.filter(m=>m.liga===n)}));
            return ligas.length>1 ? (
              <FiltroEventos ligas={ligas} liga={ligaLive} setLiga={setLigaLive}
                busqueda={busqLive} setBusqueda={setBusqLive}
                total={liveDeportes.length}/>
            ) : null;
          })()}

          {liveDeportes&&liveDeportes
            .filter(m=>!ligaLive || m.liga===ligaLive)
            .filter(m=>{
              const q=(busqLive||"").trim().toLowerCase();
              return !q || `${m.home} ${m.away}`.toLowerCase().includes(q);
            })
            .map(m=>(
            <GCard key={m.id} glow={Q.pink} style={{padding:14,marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{color:Q.text,fontWeight:600,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>
                  {m.home} vs {m.away}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:Q.pink}}/>
                  <span style={{color:Q.pink,fontSize:10,fontWeight:700}}>{m.minute||"LIVE"}</span>
                  <span style={{color:Q.gold,fontWeight:900,fontSize:14,fontFamily:"'Space Grotesk',system-ui",marginLeft:4}}>
                    {m.homeScore} - {m.awayScore}
                  </span>
                </div>
              </div>
              <div style={{display:"flex",gap:5}}>
                {[{label:m.home+" gana",odd:m.odds.L},
                  m.odds.E?{label:"Empate",odd:m.odds.E}:null,
                  {label:m.away+" gana",odd:m.odds.V}]
                  .filter(Boolean).filter(o=>o.odd).map(opt=>(
                  <button key={opt.label} onClick={()=>togglePick({home:m.home,away:m.away,event_id:m.id,sport_key:m.sport_key},"Live",opt.label,opt.odd)} style={{
                    flex:1,
                    background:hasPick({home:m.home,away:m.away},opt.label)?`linear-gradient(135deg,${Q.pink}44,${Q.violet}22)`:"rgba(255,255,255,0.04)",
                    border:`1.5px solid ${hasPick({home:m.home,away:m.away},opt.label)?Q.pink:Q.border}`,
                    borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",
                  }}>
                    <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{opt.label}</div>
                    <div style={{color:hasPick({home:m.home,away:m.away},opt.label)?Q.pink:Q.cyan,
                      fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{opt.odd}</div>
                    <div style={{color:Q.pink,fontSize:8}}>◉ LIVE</div>
                  </button>
                ))}
              </div>

              <button onClick={()=>toggleMercados(m.id)} style={{
                width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                borderRadius:8,padding:"5px",cursor:"pointer",color:Q.dim,
                fontSize:10,marginTop:6,fontFamily:"'Space Grotesk',system-ui",
              }}>
                {abiertos[m.id]?"▲ Menos mercados":"▼ Todos los mercados"}
              </button>
              {abiertos[m.id]&&(
                <MercadosEvento ev={m}
                  bets={picks.map(p=>({id:m.id,label:p.sel}))}
                  onToggle={(e,label,odd)=>
                    togglePick({home:m.home,away:m.away,event_id:m.id,sport_key:m.sport_key},"En vivo",label,odd)}
                  color={Q.pink}/>
              )}
            </GCard>
          ))}
          {liveDeportes&&liveDeportes.length===0&&(
            <GCard style={{padding:20,textAlign:"center"}}>
              <div style={{color:Q.muted,fontSize:12}}>No hay partidos en vivo con cuotas ahora</div>
            </GCard>
          )}
        </>
      )}

      {tabOferta==="prematch"&&(
        <>
          {!prematchDeportes&&(
            <GCard style={{padding:24,textAlign:"center"}}>
              <div style={{color:Q.muted,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>
                Cargando cuotas...
              </div>
              <div style={{color:Q.dim,fontSize:11,marginTop:6}}>
                La primera carga del día puede demorar unos segundos
              </div>
            </GCard>
          )}

          {prematchDeportes&&prematchDeportes.length>0&&(
            <FiltroEventos ligas={prematchDeportes} liga={liga} setLiga={setLiga}
              busqueda={busqueda} setBusqueda={setBusqueda}
              total={prematchDeportes.reduce((a,d)=>a+(d.events||[]).length,0)}/>
          )}

          {prematchDeportes&&prematchDeportes.length===0&&(
            <GCard style={{padding:24,textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:8}}>📭</div>
              <div style={{color:Q.muted,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>
                No hay eventos con cuotas en este momento
              </div>
            </GCard>
          )}

          {filtrarDeportes(prematchDeportes, liga, busqueda).length===0
            && prematchDeportes && prematchDeportes.length>0 && (
            <GCard style={{padding:22,textAlign:"center"}}>
              <div style={{color:Q.muted,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>
                Ningún partido coincide con el filtro
              </div>
            </GCard>
          )}

          {filtrarDeportes(prematchDeportes, liga, busqueda).map(d=>(
            <GCard key={d.name} style={{padding:16,marginBottom:12}}>
              <div style={{color:Q.violet2,fontWeight:700,fontSize:13,marginBottom:10,
                fontFamily:"'Space Grotesk',system-ui"}}>{d.icon} {d.name}</div>
              {(d.events||[]).map(ev=>(
                <div key={ev.id||(ev.h+ev.a)} style={{marginBottom:12,
                  borderBottom:`1px solid ${Q.dim}`,paddingBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    marginBottom:6,gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                      <TeamLogo name={ev.h} size={22}/>
                      <span style={{color:Q.text,fontWeight:600,fontSize:13,
                        fontFamily:"'Space Grotesk',system-ui",overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {ev.h} vs {ev.a}
                      </span>
                      <TeamLogo name={ev.a} size={22}/>
                    </div>
                    <span style={{color:Q.muted,fontSize:11,flexShrink:0}}>{ev.time}</span>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {[{label:ev.h+" gana",odd:ev.odds?.L},
                      ev.odds?.E?{label:"Empate",odd:ev.odds.E}:null,
                      {label:ev.a+" gana",odd:ev.odds?.V}]
                      .filter(Boolean).filter(o=>o.odd).map(opt=>(
                      <button key={opt.label}
                        onClick={()=>togglePick({home:ev.h,away:ev.a,event_id:ev.id,sport_key:ev.sport_key},d.name,opt.label,opt.odd)}
                        style={{
                          flex:"1 1 0",minWidth:0,overflow:"hidden",
                          background:hasPick({home:ev.h,away:ev.a},opt.label)
                            ?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`
                            :"rgba(255,255,255,0.04)",
                          border:`1.5px solid ${hasPick({home:ev.h,away:ev.a},opt.label)?Q.cyan:Q.border}`,
                          borderRadius:10,padding:"8px 4px",cursor:"pointer",
                          textAlign:"center",
                        }}>
                        <div style={{color:Q.muted,fontSize:9,overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{opt.label}</div>
                        <div style={{color:hasPick({home:ev.h,away:ev.a},opt.label)?Q.cyan:Q.text,
                          fontWeight:700,fontSize:15,
                          fontFamily:"'Space Grotesk',system-ui"}}>{opt.odd}</div>
                      </button>
                    ))}
                  </div>

                  <button onClick={()=>toggleMercados(ev.id)} style={{
                    width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                    borderRadius:8,padding:"5px",cursor:"pointer",color:Q.dim,
                    fontSize:10,marginTop:6,fontFamily:"'Space Grotesk',system-ui",
                  }}>
                    {abiertos[ev.id]?"▲ Menos mercados":"▼ Todos los mercados"}
                  </button>
                  {abiertos[ev.id]&&(
                    <MercadosEvento ev={ev}
                      bets={picks.map(p=>({id:ev.id,label:p.sel}))}
                      onToggle={(e,label,odd)=>
                        togglePick({home:ev.h,away:ev.a,event_id:ev.id,sport_key:ev.sport_key}, d.name, label, odd)}
                      color={Q.cyan}/>
                  )}
                </div>
              ))}
            </GCard>
          ))}
        </>
      )}

      {picks.length>0&&(
        <div style={{position:"sticky",bottom:0,zIndex:20,
          background:`linear-gradient(0deg,${Q.void} 80%,transparent)`,
          paddingTop:20,
          paddingBottom:"calc(16px + env(safe-area-inset-bottom))"}}>
          <GCard glow={Q.violet} style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:10}}>
              <div>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {picks.length} picks · <span style={{color:Q.cyan}}>{fmt(totOdd)}x</span>
                </div>
                <div style={{color:Q.green,fontSize:12}}>Ret: {ars(Math.round(monto*totOdd))}</div>
              </div>
              <div style={{display:"flex",gap:5}}>
                {[2000,5000,10000,20000].map(v=>(
                  <button key={v} onClick={()=>setMonto(v)} style={{
                    background:monto===v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                    border:`1px solid ${monto===v?Q.violet:Q.border}`,
                    borderRadius:8,padding:"5px 8px",cursor:"pointer",
                    color:monto===v?Q.cyan:Q.muted,fontSize:10,fontWeight:monto===v?700:400,
                    fontFamily:"'Space Grotesk',system-ui",
                  }}>{v>=1000?`$${v/1000}K`:v}</button>
                ))}
              </div>
            </div>
            <AlertaError mensaje={errGuardar} critico/>
            <Btn label={guardando?"REGISTRANDO..."
                                 :`CONFIRMAR Y COBRAR ${ars(monto)}`}
              onClick={confirmar} color={Q.violet} size="lg" full
              disabled={guardando}/>
          </GCard>
        </div>
      )}
    </div>
  );
}

// ── PAGO EN LOCAL ──────────────────────────────────────────────
function PagoLocalForm({ slip, onConfirm, onCancel, error, paying }){
  const [monto,setMonto]=useState(slip.stake||10000);
  return(
    <GCard glow={error?Q.red:Q.amber} style={{padding:20,marginBottom:12}}>
      <div style={{color:Q.amber,fontWeight:700,fontSize:15,marginBottom:4,
        fontFamily:"'Space Grotesk',system-ui"}}>Cobrar apuesta en efectivo</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>
        Cuota: {fmt(slip.odd_total)}x · Ingresá el monto que cobra el cliente
      </div>

      <AlertaError mensaje={error} critico/>

      <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
        letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>Monto en efectivo</div>
      <input type="number" value={monto} onChange={e=>setMonto(Number(e.target.value))}
        style={{width:"100%",background:"rgba(255,255,255,0.06)",
          border:`1.5px solid ${Q.amber}`,borderRadius:10,padding:"12px 16px",
          color:Q.amber,fontSize:22,fontFamily:"'Space Grotesk',system-ui",
          fontWeight:700,marginBottom:10}}/>
      <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>
        Retorno potencial: <strong style={{color:Q.green,fontSize:16}}>{ars(Math.round(monto*slip.odd_total))}</strong>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn label="Cancelar" onClick={onCancel} outline color={Q.muted} full disabled={paying}/>
        <Btn label={paying?"REGISTRANDO...":`COBRAR ${ars(monto)}`}
          onClick={()=>onConfirm(monto)} color={Q.amber} full
          disabled={paying||!monto||monto<=0}/>
      </div>
    </GCard>
  );
}

// ── DONE SCREEN ───────────────────────────────────────────────
function DoneScreen({ slip, titulo, color, tipo, onReset }){
  const [printed,setPrinted]=useState(false);
  const imprimir=()=>{ if(printTicket(slip, tipo)) setPrinted(true); };
  return(
    <GCard glow={color} style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:10}}>
        {color===Q.green?"✅":color===Q.amber?"💵":"🎉"}
      </div>
      <div style={{color,fontWeight:900,fontSize:20,
        fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>{titulo}</div>
      <div style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.border}`,
        borderRadius:12,padding:16,marginBottom:16,textAlign:"left"}}>
        {[
          ["Código",slip.code,Q.cyan],
          ["Cliente",slip.user,Q.text],
          ["Picks",(slip.picks?.length||0)+" selecciones",Q.text],
          ["Apostado",ars(slip.stake),Q.text],
          ["Retorno pot.",ars(slip.potential_win),Q.green],
        ].map(([l,v,c])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",
            padding:"5px 0",borderBottom:`1px solid ${Q.dim}`}}>
            <span style={{color:Q.muted,fontSize:12}}>{l}</span>
            <span style={{color:c,fontWeight:700,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:10,marginBottom:10}}>
        <button onClick={imprimir} style={{
          flex:1,background:printed?"rgba(255,255,255,0.04)":`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:`1px solid ${printed?Q.border:Q.violet}`,borderRadius:12,padding:14,
          color:printed?Q.muted:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",
          fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
        }}>🖨️ {printed?"Reimprimir":"Imprimir ticket"}</button>
      </div>
      <Btn label="NUEVA OPERACIÓN" onClick={onReset} color={color} full size="lg"/>
    </GCard>
  );
}

// ═══════════════════════════════════════════════════════════════
// MEJORAR COMBINADA — sube captura, la IA la lee y replica
// ═══════════════════════════════════════════════════════════════
function MejorarCombinada({ agencia, onSesionExpirada }){
  const [imagen,setImagen]=useState(null);      // {b64, tipo, preview}
  const [analizando,setAnalizando]=useState(false);
  const [res,setRes]=useState(null);
  const [err,setErr]=useState("");
  const [monto,setMonto]=useState(2000);
  const [cliente,setCliente]=useState("");
  const [cobrando,setCobrando]=useState(false);
  const [okMsg,setOkMsg]=useState("");

  const elegirArchivo=(e)=>{
    const file=e.target.files?.[0];
    if(!file) return;
    if(file.size>8*1024*1024){ setErr("La imagen es muy grande (máx 8MB)"); return; }
    setErr(""); setRes(null); setOkMsg("");
    const reader=new FileReader();
    reader.onload=()=>{
      const dataUrl=reader.result;
      const b64=dataUrl.split(",")[1];
      setImagen({b64, tipo:file.type||"image/jpeg", preview:dataUrl});
    };
    reader.readAsDataURL(file);
  };

  const analizar=async()=>{
    if(!imagen||analizando) return;
    setAnalizando(true); setErr(""); setRes(null);
    try{
      const r=await fetch(`${API_URL}/api/mejorar-combinada`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({imagen:imagen.b64, media_type:imagen.tipo}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      if(!d.ok){ setErr(d.mensaje||"No se pudo leer la imagen"); }
      else setRes(d);
    }catch(e){ setErr(e.message==="Failed to fetch"?"Sin conexión":e.message); }
    setAnalizando(false);
  };

  const cobrar=async()=>{
    if(!res||cobrando) return;
    const validos=res.picks.filter(p=>p.odd_final);
    if(!validos.length){ setErr("No hay picks que podamos tomar"); return; }
    setCobrando(true); setErr(""); setOkMsg("");
    try{
      const r=await fetch(`${API_URL}/api/betslip`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({
          picks: validos.map(p=>({
            home:p.home, away:p.away, sel:p.selection, odd:p.odd_final,
            sport:p.market, event_id:p.event_id||null, sport_key:p.sport_key||null,
          })),
          cliente: cliente||null,
        }),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const creado=await r.json();
      const pago=await payBetslip(creado.code, monto, agencia.token);
      printTicket({
        code:creado.code, agencia:agencia.code,
        user:cliente||"Cliente mostrador",
        created_at:nowStr(), expires_at:expires24(),
        picks:validos.map(p=>({home:p.home,away:p.away,sel:p.selection,
          odd:p.odd_final,sport:p.market})),
        stake:pago.stake, odd_total:pago.odd_total,
        potential_win:pago.potential_win,
      },"apuesta");
      setOkMsg(`✅ Cobrado · ${creado.code} · ret ${ars(pago.potential_win)}`);
      setImagen(null); setRes(null); setCliente("");
    }catch(e){ setErr("⚠️ "+e.message); }
    setCobrando(false);
  };

  const estados={
    ok:{t:"Tenemos igual o mejor",c:Q.green},
    igualada:{t:"Igualamos su cuota",c:Q.green},
    mejorada_parcial:{t:"Máximo que podemos",c:Q.amber},
    sin_mercado:{t:"No tenemos ese mercado",c:Q.red},
    sin_partido:{t:"No tenemos ese partido",c:Q.red},
  };

  return(
    <div>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:4,
        fontFamily:"'Space Grotesk',system-ui"}}>📸 Mejorar combinada</div>
      <div style={{color:Q.muted,fontSize:11,marginBottom:14,lineHeight:1.4,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Subí la captura de una apuesta de otro sitio. La leemos y la
        replicamos con nuestras cuotas, mejorándola hasta {res?.tope_ajuste_pct||6}%.
      </div>

      {!imagen&&(
        <div style={{display:"flex",gap:10,marginBottom:4}}>
          {/* capture="environment" abre la cámara directamente */}
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:14,
            padding:"26px 12px",textAlign:"center",cursor:"pointer",
            background:"rgba(255,255,255,0.02)"}}>
            <input type="file" accept="image/*" capture="environment"
              onChange={elegirArchivo} style={{display:"none"}}/>
            <div style={{fontSize:30,marginBottom:6}}>📸</div>
            <div style={{color:Q.text,fontWeight:700,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>Sacar foto</div>
          </label>
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:14,
            padding:"26px 12px",textAlign:"center",cursor:"pointer",
            background:"rgba(255,255,255,0.02)"}}>
            <input type="file" accept="image/*" onChange={elegirArchivo}
              style={{display:"none"}}/>
            <div style={{fontSize:30,marginBottom:6}}>🖼️</div>
            <div style={{color:Q.text,fontWeight:700,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>Desde galería</div>
          </label>
        </div>
      )}

      {imagen&&(
        <GCard style={{padding:12,marginBottom:12}}>
          <img src={imagen.preview} alt="captura"
            style={{width:"100%",borderRadius:10,marginBottom:10,maxHeight:220,
              objectFit:"contain",background:"#000"}}/>
          <div style={{display:"flex",gap:8}}>
            <Btn label="Cambiar" onClick={()=>{setImagen(null);setRes(null);}}
              outline color={Q.muted} full disabled={analizando}/>
            <Btn label={analizando?"LEYENDO...":"🔍 Analizar"} onClick={analizar}
              color={Q.violet} full disabled={analizando}/>
          </div>
        </GCard>
      )}

      <AlertaError mensaje={err}/>
      {okMsg&&<div style={{color:Q.green,fontSize:12,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>{okMsg}</div>}

      {analizando&&(
        <GCard style={{padding:20,textAlign:"center"}}>
          <div style={{color:Q.violet2,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>
            La IA está leyendo la apuesta...
          </div>
        </GCard>
      )}

      {res&&(
        <div>
          <div style={{color:Q.muted,fontSize:11,margin:"4px 0 10px",
            fontFamily:"'Space Grotesk',system-ui"}}>
            Leímos {res.picks_total} selecciones · podemos tomar {res.picks_ok}
          </div>

          {res.picks.map((p,i)=>{
            const est=estados[p.estado]||{t:p.estado,c:Q.muted};
            return(
            <GCard key={i} glow={p.odd_final?est.c:undefined}
              style={{padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",gap:8,marginBottom:6}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:600,fontSize:13,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                    fontFamily:"'Space Grotesk',system-ui"}}>{p.home} vs {p.away}</div>
                  <div style={{color:Q.muted,fontSize:11}}>{p.selection}</div>
                </div>
                <span style={{background:`${est.c}22`,border:`1px solid ${est.c}`,
                  borderRadius:20,padding:"2px 8px",fontSize:9,fontWeight:700,
                  color:est.c,flexShrink:0,whiteSpace:"nowrap",
                  fontFamily:"'Space Grotesk',system-ui"}}>{est.t}</span>
              </div>
              <div style={{display:"flex",gap:12,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {p.odd_original&&<span style={{color:Q.dim}}>
                  Origen: <span style={{color:Q.muted}}>{fmt(p.odd_original)}</span></span>}
                {p.odd_nuestra&&<span style={{color:Q.dim}}>
                  Nuestra: <span style={{color:Q.muted}}>{fmt(p.odd_nuestra)}</span></span>}
                {p.odd_final&&<span style={{color:Q.dim}}>
                  Final: <span style={{color:est.c,fontWeight:700}}>{fmt(p.odd_final)}</span>
                  {p.ajustada&&<span style={{color:Q.amber,fontSize:9}}> ↑ajustada</span>}</span>}
              </div>
            </GCard>
            );
          })}

          {res.picks_ok<res.picks_total&&(
            <div style={{background:`${Q.amber}12`,border:`1px solid ${Q.amber}55`,
              borderRadius:10,padding:"10px 12px",marginBottom:12,color:Q.amber,
              fontSize:11,lineHeight:1.4,fontFamily:"'Space Grotesk',system-ui"}}>
              ⚠️ {res.picks_total-res.picks_ok} selección(es) no las podemos tomar
              (partido o mercado que no tenemos). Se cobra solo con las
              {" "}{res.picks_ok} que sí, si estás de acuerdo.
            </div>
          )}

          {res.picks_ok>0&&(
            <GCard glow={Q.green} style={{padding:16,marginTop:4}}>
              <div style={{display:"flex",justifyContent:"space-between",
                marginBottom:12}}>
                <span style={{color:Q.muted,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui"}}>Cuota total nuestra</span>
                <span style={{color:Q.gold,fontWeight:900,fontSize:20,
                  fontFamily:"'Space Grotesk',system-ui"}}>{fmt(res.cuota_total)}x</span>
              </div>
              <input value={cliente} onChange={e=>setCliente(e.target.value)}
                placeholder="Cliente (opcional)"
                style={{width:"100%",background:"rgba(255,255,255,0.05)",
                  border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
                  color:Q.text,fontSize:16,marginBottom:8,
                  fontFamily:"'Space Grotesk',system-ui"}}/>
              <div style={{display:"flex",gap:5,marginBottom:10}}>
                {[1000,2000,5000,10000].map(v=>(
                  <button key={v} onClick={()=>setMonto(v)} style={{
                    flex:1,background:monto===v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                    border:`1px solid ${monto===v?Q.violet:Q.border}`,borderRadius:8,
                    padding:"7px 2px",cursor:"pointer",color:monto===v?Q.cyan:Q.muted,
                    fontSize:11,fontWeight:monto===v?700:400,
                    fontFamily:"'Space Grotesk',system-ui",
                  }}>{v>=1000?`$${v/1000}K`:v}</button>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",
                marginBottom:10,padding:"6px 0",borderTop:`1px solid ${Q.dim}`}}>
                <span style={{color:Q.muted,fontSize:12}}>Retorno {ars(monto)}</span>
                <span style={{color:Q.green,fontWeight:700,fontSize:15,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {ars(Math.round(monto*res.cuota_total))}</span>
              </div>
              <button onClick={cobrar} disabled={cobrando} style={{
                width:"100%",
                background:cobrando?"rgba(255,255,255,0.06)"
                  :`linear-gradient(135deg,${Q.green},#00a854)`,
                border:"none",borderRadius:10,padding:"12px",
                cursor:cobrando?"wait":"pointer",
                color:cobrando?Q.muted:"#04120a",fontWeight:900,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
              }}>{cobrando?"Cobrando...":`Cobrar e imprimir ${ars(monto)}`}</button>
            </GCard>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMBOS IA — sugerencias automáticas + armado manual
// ═══════════════════════════════════════════════════════════════
function CombosIA({ agencia, onSesionExpirada }){
  const [combos,setCombos]=useState(null);
  const [cargando,setCargando]=useState(true);
  const [err,setErr]=useState("");
  const [gen,setGen]=useState("");
  const [cobrando,setCobrando]=useState(null);   // id combo en proceso
  const [cliente,setCliente]=useState("");
  const [monto,setMonto]=useState(2000);
  const [abierto,setAbierto]=useState(null);      // combo desplegado
  const [okMsg,setOkMsg]=useState("");

  const cargar=async()=>{
    setCargando(true); setErr("");
    try{
      const r=await fetch(`${API_URL}/api/ai/combos`);
      if(!r.ok) throw new Error(`Error ${r.status}`);
      const d=await r.json();
      setCombos(d.combos||[]);
      setGen(d.generated_at||"");
      if(d.error) setErr(d.error);
    }catch(e){ setErr(e.message==="Failed to fetch"?"Sin conexión":e.message);
      setCombos([]); }
    setCargando(false);
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[]);

  // Cobra el combo: crea el boleto con sus picks y lo paga
  const cobrarCombo=async(combo)=>{
    if(cobrando) return;
    setCobrando(combo.id); setOkMsg(""); setErr("");
    try{
      const r=await fetch(`${API_URL}/api/betslip`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({
          picks: combo.picks.map(p=>({
            home:p.h, away:p.a, sel:p.sel, odd:p.odd, sport:p.sport,
            event_id:p.event_id||null, sport_key:p.sport_key||null,
          })),
          cliente: cliente||null,
        }),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const creado=await r.json();
      const pago=await payBetslip(creado.code, monto, agencia.token);
      // Imprimir el ticket, igual que en apuesta manual
      printTicket({
        code: creado.code,
        agencia: agencia.code,
        user: cliente || "Cliente mostrador",
        created_at: nowStr(),
        expires_at: expires24(),
        picks: combo.picks.map(p=>({
          home:p.h, away:p.a, sel:p.sel, odd:p.odd, sport:p.sport,
        })),
        stake: pago.stake,
        odd_total: pago.odd_total,
        potential_win: pago.potential_win,
      }, "apuesta");
      setOkMsg(`✅ Combo cobrado · ${creado.code} · ret ${ars(pago.potential_win)}`);
      setCliente("");
    }catch(e){ setErr("⚠️ "+e.message); }
    setCobrando(null);
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:12}}>
        <div>
          <div style={{color:Q.text,fontWeight:700,fontSize:15,
            fontFamily:"'Space Grotesk',system-ui"}}>⚡ Combos IA</div>
          {gen&&<div style={{color:Q.muted,fontSize:10}}>Generados {gen}</div>}
        </div>
        <Btn label={cargando?"...":"↻ Actualizar"} onClick={cargar}
          outline color={Q.muted} size="sm"/>
      </div>

      <GCard style={{padding:14,marginBottom:12,
        background:`linear-gradient(135deg,${Q.violet}12,${Q.cyan}08)`}}>
        <input value={cliente} onChange={e=>setCliente(e.target.value)}
          placeholder="Cliente (opcional)"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
            color:Q.text,fontSize:16,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <div style={{display:"flex",gap:5}}>
          {[1000,2000,5000,10000].map(v=>(
            <button key={v} onClick={()=>setMonto(v)} style={{
              flex:1,background:monto===v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
              border:`1px solid ${monto===v?Q.violet:Q.border}`,borderRadius:8,
              padding:"7px 2px",cursor:"pointer",color:monto===v?Q.cyan:Q.muted,
              fontSize:11,fontWeight:monto===v?700:400,
              fontFamily:"'Space Grotesk',system-ui",
            }}>{v>=1000?`$${v/1000}K`:v}</button>
          ))}
        </div>
      </GCard>

      <AlertaError mensaje={err}/>
      {okMsg&&<div style={{color:Q.green,fontSize:12,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>{okMsg}</div>}

      {cargando&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Generando combos...</div>}

      {combos&&combos.length===0&&!cargando&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{fontSize:26,marginBottom:8}}>🌙</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>
            No hay combos disponibles ahora
          </div>
        </GCard>
      )}

      {(combos||[]).map(combo=>{
        const ret=Math.round(monto*combo.odd_total);
        const abiertoEste=abierto===combo.id;
        return(
        <GCard key={combo.id} glow={combo.tagColor}
          style={{padding:16,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"flex-start",marginBottom:8,gap:8}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui"}}>{combo.name}</div>
              <div style={{color:combo.tagColor,fontSize:10,marginTop:2}}>{combo.tag}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{color:Q.gold,fontWeight:900,fontSize:18,
                fontFamily:"'Space Grotesk',system-ui"}}>{fmt(combo.odd_total)}x</div>
              <div style={{color:Q.muted,fontSize:9}}>{combo.picks.length} picks</div>
            </div>
          </div>

          <button onClick={()=>setAbierto(abiertoEste?null:combo.id)} style={{
            width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
            borderRadius:8,padding:"6px",cursor:"pointer",color:Q.dim,fontSize:11,
            marginBottom:8,fontFamily:"'Space Grotesk',system-ui",
          }}>{abiertoEste?"▲ Ocultar picks":"▼ Ver picks"}</button>

          {abiertoEste&&(
            <div style={{marginBottom:10}}>
              {combo.picks.map((p,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",
                  padding:"6px 0",gap:8,
                  borderBottom:i<combo.picks.length-1?`1px solid ${Q.dim}`:"none"}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontSize:11,fontWeight:600,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      fontFamily:"'Space Grotesk',system-ui"}}>{p.h} vs {p.a}</div>
                    <div style={{color:Q.muted,fontSize:10}}>{p.sel}</div>
                  </div>
                  <span style={{color:Q.cyan,fontWeight:700,fontSize:12,flexShrink:0,
                    fontFamily:"'Space Grotesk',system-ui"}}>{fmt(p.odd)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",padding:"8px 0",marginBottom:8,
            borderTop:`1px solid ${Q.dim}`}}>
            <span style={{color:Q.muted,fontSize:11}}>Retorno {ars(monto)}</span>
            <span style={{color:Q.green,fontWeight:700,fontSize:15,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(ret)}</span>
          </div>

          <button onClick={()=>cobrarCombo(combo)} disabled={cobrando===combo.id}
            style={{
              width:"100%",
              background:cobrando===combo.id?"rgba(255,255,255,0.06)"
                :`linear-gradient(135deg,${combo.tagColor},${Q.violet})`,
              border:"none",borderRadius:10,padding:"11px",
              cursor:cobrando===combo.id?"wait":"pointer",
              color:cobrando===combo.id?Q.muted:"#fff",fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
            }}>
            {cobrando===combo.id?"Cobrando...":`Cobrar e imprimir ${ars(monto)}`}
          </button>
        </GCard>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CLIENTES — alta, búsqueda, carga de saldo, historial
// ═══════════════════════════════════════════════════════════════
function Clientes({ agencia, onSesionExpirada }){
  const [q,setQ]=useState("");
  const [lista,setLista]=useState([]);
  const [cargando,setCargando]=useState(false);
  const [sel,setSel]=useState(null);      // usuario abierto
  const [alta,setAlta]=useState(false);   // form de alta
  const [msg,setMsg]=useState("");

  const buscar=async(texto)=>{
    setCargando(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/usuarios?q=${encodeURIComponent(texto||"")}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok) throw new Error(`Error ${r.status}`);
      setLista((await r.json()).usuarios||[]);
    }catch(e){ setMsg(e.message==="Failed to fetch"?"Sin conexión":e.message); }
    setCargando(false);
  };

  useEffect(()=>{ buscar(""); // eslint-disable-next-line
  },[]);

  if(sel) return <FichaCliente agencia={agencia} user={sel}
    onVolver={()=>{setSel(null);buscar(q);}} onSesionExpirada={onSesionExpirada}/>;

  if(alta) return <AltaCliente agencia={agencia}
    onListo={(u)=>{setAlta(false);buscar("");if(u)setSel(u);}}
    onCancel={()=>setAlta(false)} onSesionExpirada={onSesionExpirada}/>;

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:8,
          background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
          borderRadius:10,padding:"9px 12px"}}>
          <span style={{color:Q.muted,fontSize:14}}>🔍</span>
          <input value={q}
            onChange={e=>{setQ(e.target.value);buscar(e.target.value);}}
            placeholder="Buscar por nombre o documento..."
            style={{background:"transparent",border:"none",color:Q.text,
              fontSize:14,flex:1,minWidth:0,
              fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
        <Btn label="+ Nuevo" onClick={()=>setAlta(true)} color={Q.violet} size="sm"/>
      </div>

      <AlertaError mensaje={msg}/>

      {cargando&&<div style={{color:Q.muted,textAlign:"center",padding:16,
        fontFamily:"'Space Grotesk',system-ui"}}>Buscando...</div>}

      {!cargando&&lista.length===0&&(
        <GCard style={{padding:26,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:8}}>👤</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>
            {q?"No se encontró ningún cliente":"Todavía no cargaste clientes"}
          </div>
        </GCard>
      )}

      {lista.map(u=>(
        <GCard key={u.id} onClick={()=>setSel(u)}
          style={{padding:"12px 14px",marginBottom:8,cursor:"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",gap:8}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                <span style={{color:Q.text,fontWeight:600,fontSize:14,
                  fontFamily:"'Space Grotesk',system-ui",overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.nombre}</span>
                {u.tiene_telegram&&<span style={{color:Q.cyan,fontSize:11}}>✈️</span>}
              </div>
              <div style={{color:Q.muted,fontSize:11}}>
                {u.documento?`Doc ${u.documento}`:"Sin documento"}
                {u.telefono?` · ${u.telefono}`:""}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{color:u.saldo>0?Q.green:Q.muted,fontWeight:700,fontSize:15,
                fontFamily:"'Space Grotesk',system-ui"}}>{ars(u.saldo)}</div>
              <span style={{color:Q.muted,fontSize:16}}>›</span>
            </div>
          </div>
        </GCard>
      ))}
    </div>
  );
}

function AltaCliente({ agencia, onListo, onCancel, onSesionExpirada }){
  const [nombre,setNombre]=useState("");
  const [doc,setDoc]=useState("");
  const [tel,setTel]=useState("");
  const [msg,setMsg]=useState("");
  const [guardando,setGuardando]=useState(false);

  const crear=async()=>{
    if(!nombre.trim()){ setMsg("El nombre es obligatorio"); return; }
    setGuardando(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/usuarios`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({nombre,documento:doc,telefono:tel}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      onListo({id:d.id,nombre:d.nombre,documento:d.documento,saldo:0,
        telefono:tel,tiene_telegram:false,de_esta_agencia:true});
    }catch(e){ setMsg(e.message); setGuardando(false); }
  };

  return(
    <div>
      <button onClick={onCancel} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:22,cursor:"pointer",marginBottom:10,padding:0}}>‹ Volver</button>
      <GCard glow={Q.violet} style={{padding:18}}>
        <div style={{color:Q.violet2,fontWeight:700,fontSize:15,marginBottom:14,
          fontFamily:"'Space Grotesk',system-ui"}}>Nuevo cliente</div>
        {[["Nombre y apellido",nombre,setNombre,"Juan Pérez","text"],
          ["Documento (opcional)",doc,setDoc,"30111222","text"],
          ["Teléfono (opcional)",tel,setTel,"+54 11...","text"],
        ].map(([l,v,sv,ph,t])=>(
          <div key={l} style={{marginBottom:12}}>
            <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
              letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",
              marginBottom:5}}>{l}</div>
            <input type={t} value={v} onChange={e=>sv(e.target.value)} placeholder={ph}
              style={{width:"100%",background:"rgba(255,255,255,0.05)",
                border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px 14px",
                color:Q.text,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}/>
          </div>
        ))}
        <AlertaError mensaje={msg}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <Btn label="Cancelar" onClick={onCancel} outline color={Q.muted} full disabled={guardando}/>
          <Btn label={guardando?"CREANDO...":"CREAR"} onClick={crear} color={Q.violet} full disabled={guardando}/>
        </div>
      </GCard>
    </div>
  );
}

function FichaCliente({ agencia, user, onVolver, onSesionExpirada }){
  const [saldo,setSaldo]=useState(user.saldo);
  const [movs,setMovs]=useState(null);
  const [monto,setMonto]=useState(1000);
  const [modo,setModo]=useState("carga");   // carga | retiro
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);

  const cargarMovs=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/usuarios/${user.id}/movimientos`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok){ const d=await r.json(); setMovs(d.movimientos||[]); setSaldo(d.saldo); }
    }catch(e){ setMovs([]); }
  };
  useEffect(()=>{ cargarMovs(); // eslint-disable-next-line
  },[]);

  const aplicar=async()=>{
    if(proc||!monto) return;
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/cargar`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({user_id:user.id,
          monto: modo==="carga"? monto : -monto}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      setSaldo(d.saldo);
      setMsg(`✅ ${modo==="carga"?"Cargado":"Retirado"} ${ars(monto)}`);
      cargarMovs();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const tipoTxt={carga:"Carga",retiro:"Retiro",pago_premio:"Premio pagado",ajuste:"Ajuste"};
  const tipoColor={carga:Q.green,retiro:Q.amber,pago_premio:Q.violet2,ajuste:Q.muted};

  return(
    <div>
      <button onClick={onVolver} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:22,cursor:"pointer",marginBottom:10,padding:0}}>‹ Volver</button>

      <GCard glow={Q.violet} style={{padding:18,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{minWidth:0,flex:1}}>
            <div style={{color:Q.text,fontWeight:700,fontSize:17,
              fontFamily:"'Space Grotesk',system-ui",overflow:"hidden",
              textOverflow:"ellipsis"}}>{user.nombre}</div>
            <div style={{color:Q.muted,fontSize:11,marginTop:2}}>
              {user.documento?`Doc ${user.documento}`:"Sin documento"}
              {user.tiene_telegram?" · Telegram ✈️":""}
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",
              letterSpacing:1}}>Saldo</div>
            <div style={{color:saldo>0?Q.green:Q.text,fontWeight:900,fontSize:22,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(saldo)}</div>
          </div>
        </div>
      </GCard>

      <GCard style={{padding:16,marginBottom:12}}>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {[["carga","➕ Cargar",Q.green],["retiro","➖ Retirar",Q.amber]].map(([k,l,c])=>(
            <button key={k} onClick={()=>setModo(k)} style={{
              flex:1,background:modo===k?`${c}22`:"rgba(255,255,255,0.04)",
              border:`1.5px solid ${modo===k?c:Q.border}`,borderRadius:10,
              padding:"9px",cursor:"pointer",color:modo===k?c:Q.muted,
              fontSize:13,fontWeight:700,fontFamily:"'Space Grotesk',system-ui",
            }}>{l}</button>
          ))}
        </div>

        <input type="number" value={monto} onChange={e=>setMonto(Number(e.target.value))}
          style={{width:"100%",background:"rgba(255,255,255,0.06)",
            border:`1.5px solid ${modo==="carga"?Q.green:Q.amber}`,borderRadius:10,
            padding:"12px 16px",color:Q.text,fontSize:22,fontWeight:700,
            fontFamily:"'Space Grotesk',system-ui",marginBottom:10}}/>

        <div style={{display:"flex",gap:5,marginBottom:12}}>
          {[500,1000,2000,5000,10000].map(v=>(
            <button key={v} onClick={()=>setMonto(v)} style={{
              flex:1,background:monto===v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
              border:`1px solid ${monto===v?Q.violet:Q.border}`,borderRadius:8,
              padding:"6px 2px",cursor:"pointer",color:monto===v?Q.cyan:Q.muted,
              fontSize:10,fontFamily:"'Space Grotesk',system-ui",
            }}>{v>=1000?`${v/1000}K`:v}</button>
          ))}
        </div>

        {msg&&<div style={{fontSize:12,marginBottom:10,
          color:msg.startsWith("✅")?Q.green:Q.red,
          fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}

        <Btn label={proc?"PROCESANDO...":
          `${modo==="carga"?"CARGAR":"RETIRAR"} ${ars(monto)}`}
          onClick={aplicar} color={modo==="carga"?Q.green:Q.amber} full size="lg"
          disabled={proc||!monto}/>
      </GCard>

      <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
        fontFamily:"'Space Grotesk',system-ui",marginBottom:8,marginLeft:4}}>
        Movimientos
      </div>
      {movs===null&&<div style={{color:Q.muted,textAlign:"center",padding:12,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {movs&&movs.length===0&&(
        <GCard style={{padding:20,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12,
            fontFamily:"'Space Grotesk',system-ui"}}>Sin movimientos</div>
        </GCard>
      )}
      {(movs||[]).map((m,i)=>(
        <GCard key={i} style={{padding:"10px 14px",marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <span style={{color:tipoColor[m.tipo]||Q.text,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>{tipoTxt[m.tipo]||m.tipo}</span>
              <div style={{color:Q.muted,fontSize:10}}>{m.fecha}{m.betslip?` · ${m.betslip}`:""}</div>
            </div>
            <div style={{color:m.tipo==="retiro"?Q.amber:Q.green,fontWeight:700,fontSize:14,
              fontFamily:"'Space Grotesk',system-ui"}}>
              {m.tipo==="retiro"?"-":"+"}{ars(m.monto)}
            </div>
          </div>
        </GCard>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HISTORIAL
// ═══════════════════════════════════════════════════════════════
// Liquida en bloque las apuestas cuyos partidos terminaron.
// Solo resuelve lo que depende del marcador (1X2, goles, ambos anotan);
// el resto queda para los botones manuales.
function AutoLiquidar({ agencia, onListo, onSesionExpirada }){
  const [proc,setProc]=useState(false);
  const [res,setRes]=useState(null);

  const correr=async()=>{
    if(proc) return;
    setProc(true); setRes(null);
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/auto-liquidar`,{
        method:"POST",headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      const d=await r.json();
      setRes(d.mensaje||"Listo");
      onListo&&onListo();
    }catch(e){ setRes("No se pudo liquidar automáticamente"); }
    setProc(false);
  };

  return(
    <GCard style={{padding:"12px 14px",marginBottom:12,
      background:`linear-gradient(135deg,${Q.violet}12,${Q.cyan}08)`}}>
      <div style={{display:"flex",alignItems:"center",gap:10,
        justifyContent:"space-between"}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>⚡ Liquidar automático</div>
          <div style={{color:Q.muted,fontSize:10,marginTop:2}}>
            Resuelve 1X2, goles y ambos anotan con el resultado real
          </div>
        </div>
        <button onClick={correr} disabled={proc} style={{
          background:proc?"rgba(255,255,255,0.06)"
            :`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:9,padding:"9px 14px",
          cursor:proc?"wait":"pointer",color:proc?Q.muted:"#fff",
          fontWeight:700,fontSize:12,flexShrink:0,
          fontFamily:"'Space Grotesk',system-ui"}}>
          {proc?"Buscando...":"Ejecutar"}
        </button>
      </div>
      {res&&<div style={{color:Q.cyan,fontSize:11,marginTop:8,
        fontFamily:"'Space Grotesk',system-ui"}}>{res}</div>}
    </GCard>
  );
}

// Ticket del historial con liquidación (Ganó/Perdió) y pago de premio
function TicketHistorial({ t, agencia, onCambio, onSesionExpirada }){
  const [proc,setProc]=useState(false);
  const [msg,setMsg]=useState("");
  const [res,setRes]=useState(t.resultado||null);
  const [pagado,setPagado]=useState(!!t.pagado);

  const accion=async(ruta,body,okMsg)=>{
    if(proc) return null;
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/${ruta}`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify(body),
      });
      if(r.status===401){ onSesionExpirada(); return null; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      if(okMsg) setMsg("✅ "+okMsg);
      return d;
    }catch(e){ setMsg("⚠️ "+e.message); return null; }
    finally{ setProc(false); }
  };

  const liquidar=async(resultado)=>{
    const d=await accion("liquidar",{code:t.code,resultado},
      resultado==="ganada"?"Marcada como ganada":"Marcada como perdida");
    if(d){ setRes(resultado); onCambio&&onCambio(); }
  };
  const pagar=async()=>{
    const d=await accion("pagar-premio",{code:t.code},"Premio pagado");
    if(d){ setPagado(true); onCambio&&onCambio(); }
  };

  const colorEstado = pagado?Q.violet2 : res==="ganada"?Q.green
    : res==="perdida"?Q.red : t.tipo==="bot"?Q.violet:Q.amber;
  const textoEstado = pagado?"PAGADA" : res==="ganada"?"GANADA"
    : res==="perdida"?"PERDIDA" : (t.tipo||"").toUpperCase();

  return(
    <GCard glow={res==="ganada"&&!pagado?Q.green:undefined}
      style={{padding:"12px 16px",marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",gap:8}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
            <span style={{color:Q.cyan,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{t.code}</span>
            <span style={{background:`${colorEstado}22`,
              border:`1px solid ${colorEstado}`,borderRadius:20,padding:"1px 8px",
              fontSize:9,fontWeight:700,color:colorEstado,
              fontFamily:"'Space Grotesk',system-ui"}}>{textoEstado}</span>
          </div>
          <div style={{color:Q.muted,fontSize:11,overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {t.cliente} · {t.fecha}{t.odd_total?` · ${fmt(t.odd_total)}x`:""}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>{ars(t.stake)}</div>
          <div style={{color:Q.green,fontSize:11}}>ret: {ars(t.potential_win)}</div>
        </div>
      </div>

      {!pagado&&(
        <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
          {!res&&(
            <div style={{display:"flex",gap:6}}>
              <button disabled={proc} onClick={()=>liquidar("ganada")} style={{
                flex:1,background:`${Q.green}18`,border:`1px solid ${Q.green}`,
                borderRadius:9,padding:"8px",cursor:"pointer",color:Q.green,
                fontSize:12,fontWeight:700,
                fontFamily:"'Space Grotesk',system-ui"}}>✓ Ganó</button>
              <button disabled={proc} onClick={()=>liquidar("perdida")} style={{
                flex:1,background:`${Q.red}18`,border:`1px solid ${Q.red}`,
                borderRadius:9,padding:"8px",cursor:"pointer",color:Q.red,
                fontSize:12,fontWeight:700,
                fontFamily:"'Space Grotesk',system-ui"}}>✗ Perdió</button>
            </div>
          )}
          {res==="ganada"&&(
            <button disabled={proc} onClick={pagar} style={{
              width:"100%",background:`linear-gradient(135deg,${Q.green},#00a854)`,
              border:"none",borderRadius:10,padding:"11px",cursor:"pointer",
              color:"#04120a",fontWeight:900,fontSize:14,
              fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
            }}>💵 Pagar premio {ars(t.potential_win)}</button>
          )}
          {res==="perdida"&&(
            <div style={{textAlign:"center",color:Q.muted,fontSize:11,
              fontFamily:"'Space Grotesk',system-ui"}}>Sin premio a pagar</div>
          )}
        </div>
      )}

      {msg&&<div style={{fontSize:11,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </GCard>
  );
}

function Historial({ agencia, onSesionExpirada }){
  const [tickets,setTickets]=useState(null);
  const [err,setErr]=useState("");
  const [cargando,setCargando]=useState(true);

  const cargar=async()=>{
    setCargando(true); setErr("");
    try {
      const r = await fetch(`${API_URL}/api/agencias/me/tickets`,
        { headers: authHeaders(agencia.token) });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok) throw new Error(`Error ${r.status}`);
      const d = await r.json();
      setTickets(d.tickets||[]);
    } catch(e){
      setErr(e.message==="Failed to fetch"
        ? "Sin conexión con el servidor" : e.message);
      setTickets([]);
    }
    setCargando(false);
  };

  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[]);

  const lista = tickets||[];
  const total    = lista.reduce((a,t)=>a+(t.stake||0),0);
  const expuesto = lista.reduce((a,t)=>a+(t.potential_win||0),0);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,
          fontFamily:"'Space Grotesk',system-ui"}}>Historial</div>
        <Btn label={cargando?"...":"Actualizar"} onClick={cargar}
          outline color={Q.muted} size="sm"/>
      </div>

      <AutoLiquidar agencia={agencia} onListo={cargar}
        onSesionExpirada={onSesionExpirada}/>

      <AlertaError mensaje={err}/>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[{l:"Tickets",v:lista.length,c:Q.cyan},
          {l:"Cobrado",v:ars(total),c:Q.green},
          {l:"Exposición",v:ars(expuesto),c:Q.amber},
        ].map((x,i)=>(
          <GCard key={i} glow={x.c} style={{padding:"10px 12px",textAlign:"center"}}>
            <div style={{color:x.c,fontWeight:700,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>{x.v}</div>
            <div style={{color:Q.muted,fontSize:9,
              fontFamily:"'Space Grotesk',system-ui"}}>{x.l}</div>
          </GCard>
        ))}
      </div>

      {cargando&&(
        <GCard style={{padding:20,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12,
            fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>
        </GCard>
      )}

      {!cargando&&lista.length===0&&!err&&(
        <GCard style={{padding:28,textAlign:"center"}}>
          <div style={{fontSize:30,marginBottom:8}}>🧾</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>
            Todavía no emitiste ningún ticket
          </div>
          <div style={{color:Q.dim,fontSize:11,marginTop:4}}>
            Los que cobres van a aparecer acá
          </div>
        </GCard>
      )}

      {lista.map((t,i)=>(
        <TicketHistorial key={t.code+i} t={t} agencia={agencia}
          onCambio={cargar} onSesionExpirada={onSesionExpirada}/>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CIERRES DE CAJA
// ═══════════════════════════════════════════════════════════════
function Cierres({ agencia, onSesionExpirada }){
  const hoyISO = new Date().toISOString().slice(0,10);
  const [tipo,setTipo]=useState("diario");
  const [desde,setDesde]=useState(hoyISO);
  const [hasta,setHasta]=useState(hoyISO);
  const [res,setRes]=useState(null);
  const [err,setErr]=useState("");
  const [cargando,setCargando]=useState(false);

  const rangoDe=(t)=>{
    const hoy = new Date();
    const iso = d=>d.toISOString().slice(0,10);
    if(t==="diario")  return [iso(hoy), iso(hoy)];
    if(t==="semanal"){
      const d = new Date(hoy); d.setDate(d.getDate()-6);
      return [iso(d), iso(hoy)];
    }
    if(t==="mensual"){
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      return [iso(d), iso(hoy)];
    }
    return [desde, hasta];
  };

  const generar=async()=>{
    setCargando(true); setErr(""); setRes(null);
    const [d1,d2] = rangoDe(tipo);
    try {
      const r = await fetch(
        `${API_URL}/api/agencias/me/cierre?desde=${d1}&hasta=${d2}`,
        { headers: authHeaders(agencia.token) });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok) throw new Error(`Error ${r.status}`);
      const d = await r.json();
      setRes({...d, periodo: d1===d2 ? d1 : `${d1} al ${d2}`});
    } catch(e){
      setErr(e.message==="Failed to fetch"
        ? "Sin conexión con el servidor" : e.message);
    }
    setCargando(false);
  };

  return(
    <div>
      <GCard style={{padding:16,marginBottom:14}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}>Tipo de cierre</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:14}}>
          {[{k:"diario",l:"📅 Diario",d:"Hoy"},
            {k:"semanal",l:"📆 Semanal",d:"Últimos 7 días"},
            {k:"mensual",l:"🗓️ Mensual",d:"Este mes"},
            {k:"personalizado",l:"🔧 Personalizado",d:"Elegí las fechas"},
          ].map(t=>(
            <button key={t.k} onClick={()=>{setTipo(t.k);setRes(null);}} style={{
              background:tipo===t.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`
                                   :"rgba(255,255,255,0.04)",
              border:`1.5px solid ${tipo===t.k?Q.cyan:Q.border}`,
              borderRadius:12,padding:"12px 10px",cursor:"pointer",textAlign:"left",
            }}>
              <div style={{color:tipo===t.k?Q.cyan:Q.text,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>{t.l}</div>
              <div style={{color:Q.muted,fontSize:10,marginTop:2}}>{t.d}</div>
            </button>
          ))}
        </div>

        {tipo==="personalizado"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[["Desde",desde,setDesde],["Hasta",hasta,setHasta]].map(([l,v,sv])=>(
              <div key={l}>
                <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
                  letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",
                  marginBottom:4}}>{l}</div>
                <input type="date" value={v} onChange={e=>sv(e.target.value)}
                  style={{width:"100%",background:"rgba(255,255,255,0.05)",
                    border:`1px solid ${Q.border}`,borderRadius:10,
                    padding:"10px 12px",color:Q.text,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}/>
              </div>
            ))}
          </div>
        )}

        <AlertaError mensaje={err}/>
        <Btn label={cargando?"GENERANDO...":"GENERAR CIERRE"} onClick={generar}
          color={Q.violet} full size="lg" disabled={cargando}/>
      </GCard>

      {res&&(
        <GCard glow={Q.green} style={{padding:20,marginBottom:12}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>Cierre {tipo}</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>{res.periodo}</div>

          {res.tickets===0?(
            <div style={{textAlign:"center",padding:20}}>
              <div style={{fontSize:28,marginBottom:8}}>📭</div>
              <div style={{color:Q.muted,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>
                No hubo movimientos en este período
              </div>
            </div>
          ):(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",
                gap:8,marginBottom:14}}>
                {[{l:"Total",v:res.tickets,c:Q.cyan},
                  {l:"Bot",v:res.tickets_bot,c:Q.violet},
                  {l:"Manual",v:res.tickets_manual,c:Q.amber},
                ].map((x,i)=>(
                  <GCard key={i} glow={x.c} style={{padding:"10px",textAlign:"center"}}>
                    <div style={{color:x.c,fontWeight:700,fontSize:16,
                      fontFamily:"'Space Grotesk',system-ui"}}>{x.v}</div>
                    <div style={{color:Q.muted,fontSize:9}}>{x.l}</div>
                  </GCard>
                ))}
              </div>

              <div style={{marginBottom:14}}>
                {[["Cobrado (apuestas)", res.cobrado, Q.green, false],
                  ["Exposición (si ganan todas)", res.expuesto, Q.amber, false],
                  ["Premios pagados", res.pagado, Q.pink, false],
                  ["NETO EN CAJA", res.neto, Q.green, true],
                ].map(([l,v,c,fuerte])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",padding:"9px 0",
                    borderTop:fuerte?`1px solid ${Q.violet}44`:"none",
                    borderBottom:fuerte?"none":`1px solid ${Q.dim}`,
                    marginTop:fuerte?8:0}}>
                    <span style={{color:fuerte?Q.text:Q.muted,
                      fontSize:fuerte?14:12,fontWeight:fuerte?700:400,
                      fontFamily:"'Space Grotesk',system-ui"}}>{l}</span>
                    <span style={{color:c,fontWeight:900,fontSize:fuerte?22:14,
                      fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</span>
                  </div>
                ))}
              </div>

              {res.pagos_no_implementados&&(
                <div style={{background:`${Q.amber}12`,border:`1px solid ${Q.amber}55`,
                  borderRadius:10,padding:"9px 12px",marginBottom:14,
                  color:Q.amber,fontSize:11,lineHeight:1.45,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  El pago de ganadores todavía no está implementado, así que
                  "Premios pagados" es 0 y el neto es igual a lo cobrado.
                  Si ya pagaste premios en efectivo, descontalos a mano.
                </div>
              )}

              <button onClick={()=>printCierre(
                  {...res, tickets_bot:res.tickets_bot,
                   tickets_manual:res.tickets_manual},
                  tipo, agencia)} style={{
                width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                border:"none",borderRadius:12,padding:14,cursor:"pointer",
                color:"#fff",fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
              }}>🖨️ IMPRIMIR CIERRE</button>
            </>
          )}
        </GCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
function Config({ agencia }){
  const [testDone,setTestDone]=useState(false);
  return(
    <div>
      <GCard style={{padding:20,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:14,
          fontFamily:"'Space Grotesk',system-ui"}}>Datos de la agencia</div>
        {[["Nombre",agencia.name||"—"],["Código",agencia.code||"—"],
          ["Dirección",agencia.address||"Sin cargar"],
          ["Teléfono",agencia.phone||"Sin cargar"],
        ].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",
            padding:"8px 0",borderBottom:`1px solid ${Q.dim}`}}>
            <span style={{color:Q.muted,fontSize:12}}>{l}</span>
            <span style={{color:Q.text,fontSize:12}}>{v}</span>
          </div>
        ))}
      </GCard>
      <GCard glow={Q.violet} style={{padding:20}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>Test de impresora</div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:14}}>
          Imprime un ticket de prueba para verificar la conexión
        </div>
        <Btn label={testDone?"Reimprimir test":"IMPRIMIR TICKET TEST"}
          onClick={()=>{
            const ok = printTicket({
              code:"QP-TEST",user:"Test",created_at:nowStr(),expires_at:expires24(),
              picks:[{home:"River",away:"Boca",sel:"River gana",odd:1.55,sport:"TEST"}],
              stake:10000,odd_total:1.55,potential_win:15500,agencia:agencia.code,
            },"apuesta");
            if(ok) setTestDone(true);
          }} color={Q.violet} full/>
      </GCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EN VIVO
// ═══════════════════════════════════════════════════════════════
function EnVivo({ agencia }){
  const [matches,setMatches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [lastUpdate,setLastUpdate]=useState("");
  const [ticket,setTicket]=useState([]);
  const [abiertosLive,setAbiertosLive]=useState({});
  const [monto,setMonto]=useState(5000);
  const [cliente,setCliente]=useState("");
  const [ligaSel,setLigaSel]=useState(null);
  const [busq,setBusq]=useState("");
  const [guardando,setGuardando]=useState(false);
  const [errGuardar,setErrGuardar]=useState("");
  const [slip,setSlip]=useState(null);

  // Mismo circuito que Apuesta manual: se crea el boleto en la base
  // y se cobra, así el ticket impreso tiene respaldo real.
  const confirmarLive=async()=>{
    if(guardando || !ticket.length) return;
    setErrGuardar(""); setGuardando(true);
    try {
      let r = await fetch(`${API_URL}/api/betslip`,{
        method:"POST",
        headers:{"Content-Type":"application/json", ...authHeaders(agencia.token)},
        body:JSON.stringify({
          picks: ticket.map(b=>({
            home:b.home, away:b.away, sel:b.label, odd:b.odd, sport:"En vivo",
            event_id:b.event_id||b.id||null, sport_key:b.sport_key||null,
          })),
          cliente: cliente || null,
        }),
      });
      if(r.status===401) throw new SesionExpirada();
      if(!r.ok){
        const e = await r.json().catch(()=>({}));
        throw new Error(e.detail || `No se pudo registrar (${r.status})`);
      }
      const creado = await r.json();
      const pago = await payBetslip(creado.code, monto, agencia.token);

      setSlip({
        code: creado.code,
        user: cliente || "Cliente mostrador",
        created_at: nowStr(), expires_at: expires24(),
        status:"active",
        picks: ticket.map(b=>({
          home:b.home, away:b.away, sel:b.label, odd:b.odd, sport:"En vivo",
        })),
        stake: pago.stake,
        odd_total: pago.odd_total,
        potential_win: pago.potential_win,
        agencia: agencia.code,
      });
    } catch(e){
      setErrGuardar(e.name==="SinConexion"
        ? "Sin conexión con el servidor. La apuesta NO quedó registrada, no aceptes el efectivo."
        : `La apuesta NO quedó registrada: ${e.message}`);
    }
    setGuardando(false);
  };

  const resetLive=()=>{ setTicket([]); setSlip(null); setCliente("");
                        setMonto(5000); setErrGuardar(""); };

  const fetchLive=async()=>{
    try {
      const r=await fetch(`${API_BOT}/api/live/combined`);
      const data=await r.json();
      if(data.matches&&data.matches.length>0){
        setMatches(data.matches);
        setLastUpdate(new Date().toLocaleTimeString("es-AR",{hour12:false}));
      } else {
        setMatches([]);
      }
    } catch(e){
      setMatches([]);
    }
    setLoading(false);
  };

  useEffect(()=>{
    fetchLive();
    const t=setInterval(fetchLive,30000);
    return()=>clearInterval(t);
  },[]);

  const toggleBet=(ev,label,odd)=>{
    setTicket(p=>{
      const w=p.filter(b=>b.id!==ev.id);
      if(p.find(b=>b.id===ev.id&&b.label===label)) return w;
      return[...w,{id:ev.id,label,odd,home:ev.home,away:ev.away,
        event_id:ev.id,sport_key:ev.sport_key}];
    });
  };
  const isSel=(id,l)=>ticket.some(b=>b.id===id&&b.label===l);
  const totOdd=ticket.length?ticket.reduce((a,b)=>a*b.odd,1):1;

  if(slip) return(
    <DoneScreen slip={slip} titulo="Apuesta en vivo registrada"
      color={Q.pink} tipo="apuesta" onReset={resetLive}/>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:Q.pink,
            boxShadow:`0 0 6px ${Q.pink}`,animation:"qPulse 1.2s ease-in-out infinite"}}/>
          <span style={{color:Q.text,fontWeight:700,fontSize:15,
            fontFamily:"'Space Grotesk',system-ui"}}>En Vivo</span>
          {matches.length>0&&<span style={{background:`${Q.pink}22`,border:`1px solid ${Q.pink}`,
            borderRadius:20,padding:"2px 10px",color:Q.pink,fontSize:11,fontWeight:700,
            fontFamily:"'Space Grotesk',system-ui"}}>{matches.length} partidos</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {lastUpdate&&<span style={{color:Q.dim,fontSize:10}}>{lastUpdate}</span>}
          <button onClick={fetchLive} style={{background:"transparent",
            border:`1px solid ${Q.border}`,borderRadius:8,padding:"5px 10px",
            color:Q.muted,fontSize:11,cursor:"pointer"}}>🔄</button>
        </div>
      </div>

      {loading&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{color:Q.muted,fontFamily:"'Space Grotesk',system-ui"}}>Cargando partidos en vivo...</div>
        </GCard>
      )}

      {!loading&&matches.length===0&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:8}}>⚽</div>
          <div style={{color:Q.muted,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>No hay partidos en vivo ahora</div>
          <div style={{color:Q.dim,fontSize:11,marginTop:4}}>Se actualiza cada 30 segundos</div>
        </GCard>
      )}

      {matches.length>0&&(()=>{
        const ligas = [...new Set(matches.map(m=>m.liga).filter(Boolean))]
          .map(n=>({name:n, icon:"🔴", events:matches.filter(m=>m.liga===n)}));
        return ligas.length>1 ? (
          <FiltroEventos ligas={ligas} liga={ligaSel} setLiga={setLigaSel}
            busqueda={busq} setBusqueda={setBusq} total={matches.length}/>
        ) : null;
      })()}

      {matches
        .filter(m=>!ligaSel || m.liga===ligaSel)
        .filter(m=>{
          const q=(busq||"").trim().toLowerCase();
          return !q || `${m.home} ${m.away}`.toLowerCase().includes(q);
        })
        .map(m=>(
        <GCard key={m.id} glow={Q.pink} style={{padding:"14px 16px",marginBottom:10,
          background:`linear-gradient(135deg,${Q.pink}08,${Q.violet}05)`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:Q.pink,
                boxShadow:`0 0 4px ${Q.pink}`}}/>
              <span style={{color:Q.pink,fontSize:10,fontWeight:700,
                fontFamily:"'Space Grotesk',system-ui"}}>EN VIVO</span>
              {m.minute&&<span style={{color:Q.muted,fontSize:10}}>{m.minute}</span>}
            </div>
            {m.minuteLong&&<span style={{color:Q.muted,fontSize:10}}>{m.minuteLong}</span>}
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:6,minWidth:0}}>
              <TeamLogo name={m.home} size={26}/>
              <div style={{color:Q.text,fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui",overflow:"hidden",
                textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.home}</div>
            </div>
            <div style={{textAlign:"center",padding:"0 12px"}}>
              <div style={{fontFamily:"'Space Grotesk',system-ui",fontWeight:900,
                fontSize:26,color:Q.pink}}>
                {m.homeScore}<span style={{color:Q.dim}}> - </span>{m.awayScore}
              </div>
            </div>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:6,
              justifyContent:"flex-end",minWidth:0}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui",overflow:"hidden",
                textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.away}</div>
              <TeamLogo name={m.away} size={26}/>
            </div>
          </div>

          {m.hasOdds?(
            <div style={{display:"flex",gap:5}}>
              {[{l:m.home,v:m.odds.L,c:Q.amber},
                m.odds.E?{l:"Empate",v:m.odds.E,c:Q.muted}:null,
                {l:m.away,v:m.odds.V,c:Q.cyan}]
                .filter(Boolean).filter(o=>o.v).map((o,i)=>(
                <button key={i} onClick={()=>toggleBet(m,o.l,o.v)} style={{
                  flex:1,
                  background:isSel(m.id,o.l)?`linear-gradient(135deg,${Q.pink}44,${Q.violet}22)`:"rgba(255,255,255,0.04)",
                  border:`1.5px solid ${isSel(m.id,o.l)?Q.pink:Q.border}`,
                  borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",
                }}>
                  <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{o.l}</div>
                  <div style={{color:isSel(m.id,o.l)?Q.pink:o.c,fontWeight:700,fontSize:15,
                    fontFamily:"'Space Grotesk',system-ui"}}>{o.v}</div>
                  <div style={{color:Q.pink,fontSize:8}}>◉ LIVE</div>
                </button>
              ))}
            </div>
          ):(
            <div style={{textAlign:"center",color:Q.dim,fontSize:11,padding:"6px 0",
              fontFamily:"'Space Grotesk',system-ui"}}>Cuotas no disponibles aún</div>
          )}

          <button onClick={()=>setAbiertosLive(a=>({...a,[m.id]:!a[m.id]}))} style={{
            width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
            borderRadius:8,padding:"5px",cursor:"pointer",color:Q.dim,
            fontSize:10,marginTop:6,fontFamily:"'Space Grotesk',system-ui",
          }}>
            {abiertosLive[m.id]?"▲ Menos mercados":"▼ Todos los mercados"}
          </button>
          {abiertosLive[m.id]&&(
            <MercadosEvento ev={m} bets={ticket}
              onToggle={(e,label,odd)=>toggleBet(m,label,odd)} color={Q.pink}/>
          )}
        </GCard>
      ))}

      {ticket.length>0&&(
        <div style={{position:"sticky",bottom:0,zIndex:20,
          background:`linear-gradient(0deg,${Q.void} 80%,transparent)`,
          paddingTop:16,
          paddingBottom:"calc(12px + env(safe-area-inset-bottom))"}}>
          <GCard glow={Q.pink} style={{padding:"12px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:Q.pink}}/>
                <span style={{color:Q.muted,fontSize:12}}>{ticket.length} picks LIVE · <span style={{color:Q.pink,fontWeight:700}}>{totOdd.toFixed(2)}x</span></span>
              </div>
              <span style={{color:Q.green,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
                Ret: {ars(Math.round(monto*totOdd))}
              </span>
            </div>
            <input value={cliente} onChange={e=>setCliente(e.target.value)}
              placeholder="Nombre del cliente (opcional)"
              style={{width:"100%",background:"rgba(255,255,255,0.05)",
                border:`1px solid ${Q.border}`,borderRadius:9,
                padding:"8px 12px",color:Q.text,fontSize:13,marginBottom:8,
                fontFamily:"'Space Grotesk',system-ui"}}/>

            <div style={{display:"flex",gap:5,marginBottom:8}}>
              {[2000,5000,10000,20000].map(v=>(
                <button key={v} onClick={()=>setMonto(v)} style={{
                  flex:1,
                  background:monto===v?`${Q.pink}33`:"rgba(255,255,255,0.04)",
                  border:`1px solid ${monto===v?Q.pink:Q.border}`,
                  borderRadius:8,padding:"6px 2px",cursor:"pointer",
                  color:monto===v?Q.pink:Q.muted,fontSize:10,
                  fontWeight:monto===v?700:400,
                  fontFamily:"'Space Grotesk',system-ui",
                }}>{v>=1000?`$${v/1000}K`:v}</button>
              ))}
            </div>

            <AlertaError mensaje={errGuardar} critico/>

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setTicket([])} disabled={guardando} style={{
                background:"transparent",border:`1px solid ${Q.border}`,
                borderRadius:12,padding:"0 14px",cursor:"pointer",color:Q.muted,
                fontSize:12,fontFamily:"'Space Grotesk',system-ui",
              }}>Limpiar</button>
              <button onClick={confirmarLive} disabled={guardando} style={{
                flex:1,
                background:guardando?"rgba(255,255,255,0.06)"
                          :`linear-gradient(135deg,${Q.pink},${Q.violet})`,
                border:"none",borderRadius:12,padding:"13px",
                cursor:guardando?"wait":"pointer",
                color:guardando?Q.muted:"#fff",fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
              }}>
                {guardando?"REGISTRANDO..."
                          :`COBRAR ${ars(monto)} E IMPRIMIR`}
              </button>
            </div>
          </GCard>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANEL PRINCIPAL
// ═══════════════════════════════════════════════════════════════
function AgenciaPanel({ agencia, onLogout, onSesionExpirada }){
  const [tab,setTab]=useState("codigo");

  const TABS=[
    {k:"codigo",   l:"Código / Bot"},
    {k:"envivo",   l:"🔴 En Vivo"},
    {k:"manual",   l:"Apuesta manual"},
    {k:"combos",   l:"⚡ Combos IA"},
    {k:"mejorar",  l:"📸 Mejorar"},
    {k:"clientes", l:"👤 Clientes"},
    {k:"historial",l:"Historial"},
    {k:"cierres",  l:"Cierres"},
    {k:"config",   l:"Config"},
  ];

  return(
    <div style={{background:Q.void,height:"100dvh",
      display:"flex",flexDirection:"column",overflow:"hidden",
      fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"10px 14px",display:"flex",alignItems:"center",flexShrink:0,
        justifyContent:"space-between",zIndex:50,overflow:"hidden"}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
          background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
        <QPLogo size={16}/>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{textAlign:"right"}}>
            <div style={{color:Q.text,fontSize:12,fontWeight:600,
              fontFamily:"'Space Grotesk',system-ui"}}>{agencia.name}</div>
            <div style={{color:Q.muted,fontSize:10}}>{agencia.code}</div>
          </div>
          <button onClick={onLogout} style={{background:"transparent",
            border:`1px solid ${Q.border}`,borderRadius:8,padding:"5px 10px",
            color:Q.muted,fontSize:11,cursor:"pointer"}}>Salir</button>
        </div>
      </div>

      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"6px 10px",display:"flex",gap:5,overflowX:"auto",
        flexShrink:0,zIndex:40,WebkitOverflowScrolling:"touch"}}>
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            background:tab===t.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"transparent",
            border:`1px solid ${tab===t.k?Q.violet:Q.border}`,
            borderRadius:10,padding:"7px 14px",cursor:"pointer",flexShrink:0,
            color:tab===t.k?Q.cyan:Q.muted,fontSize:12,fontWeight:tab===t.k?700:400,
            fontFamily:"'Space Grotesk',system-ui",
          }}>{t.l}</button>
        ))}
      </div>

      <div style={{flex:1,minHeight:0,overflowY:"auto",overflowX:"hidden",
        WebkitOverflowScrolling:"touch",position:"relative",zIndex:1}}>
      <div style={{padding:"14px 12px",maxWidth:620,margin:"0 auto",
        paddingBottom:"calc(28px + env(safe-area-inset-bottom))"}}>
        {tab==="codigo"   &&<FlujoCodigo  agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="envivo"   &&<EnVivo/>}
        {tab==="manual"   &&<FlujoManual  agencia={agencia}/>}
        {tab==="combos"   &&<CombosIA  agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="mejorar"  &&<MejorarCombinada agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="clientes" &&<Clientes  agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="historial"&&<Historial agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="cierres"  &&<Cierres      agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="config"   &&<Config       agencia={agencia}/>}
      </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function QuartzAgencia(){
  // La sesión se guarda en localStorage para sobrevivir a un F5.
  // Antes vivía solo en memoria: al actualizar volvía a null y pedía login.
  const [agencia,setAgenciaRaw]=useState(()=>{
    try{
      const g = localStorage.getItem("qp_agencia");
      return g ? JSON.parse(g) : null;
    }catch(e){ return null; }
  });
  const setAgencia=(a)=>{
    setAgenciaRaw(a);
    try{
      if(a) localStorage.setItem("qp_agencia", JSON.stringify(a));
      else  localStorage.removeItem("qp_agencia");
    }catch(e){}
  };
  const [avisoSesion,setAvisoSesion]=useState(false);

  const sesionExpirada=()=>{
    setAgencia(null);
    setAvisoSesion(true);
  };

  return(
    <div style={{background:Q.void,minHeight:"100vh"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{height:100%;overscroll-behavior:none;
                        max-width:100%;overflow-x:hidden}
        /* 16px evita que iOS haga zoom al tocar un campo */
        input,select,textarea{font-size:16px}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent;
               touch-action:manipulation}
        @keyframes qPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.4)}}
        input:focus{outline:none} button:active{opacity:.85}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.3)}
      `}</style>
      {!agencia ? (
        <div style={{position:"relative"}}>
          {avisoSesion&&(
            <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",
              zIndex:100,width:"calc(100% - 32px)",maxWidth:380}}>
              <AlertaError mensaje="La sesión expiró por inactividad. Volvé a ingresar."/>
            </div>
          )}
          <LoginScreen onLogin={a=>{setAvisoSesion(false);setAgencia(a);}}/>
        </div>
      ) : (
        <AgenciaPanel agencia={agencia}
          onLogout={()=>setAgencia(null)}
          onSesionExpirada={sesionExpirada}/>
      )}
    </div>
  );
}
