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
      position:"relative", overflow:"hidden", ...style,
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
function abrirVentanaImpresion(html, w=420, h=650){
  const win = window.open("","_blank",`width=${w},height=${h}`);
  if(!win){
    alert("El navegador bloqueó la ventana de impresión.\n\nPermití las ventanas emergentes para este sitio y volvé a intentar.");
    return false;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>{ try{ win.print(); win.close(); }catch(e){} },600);
  return true;
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

// ── DEPORTES PARA APUESTA MANUAL (fallback visual) ────────────
const DEPORTES = [
  {sport:"Liga AR", events:[
    {home:"River",away:"Boca",odds:{L:1.55,E:3.80,V:5.20}},
    {home:"Racing",away:"Independiente",odds:{L:2.10,E:3.20,V:3.40}},
  ]},
  {sport:"Mundial", events:[
    {home:"Argentina",away:"Argelia",odds:{L:1.30,E:5.50,V:9.00}},
    {home:"España",away:"C.Verde",odds:{L:1.18,E:7.50,V:14.0}},
    {home:"Francia",away:"Senegal",odds:{L:1.45,E:4.50,V:7.00}},
    {home:"Brasil",away:"Marruecos",odds:{L:1.55,E:4.20,V:5.80}},
  ]},
  {sport:"Champions", events:[
    {home:"R.Madrid",away:"Bayern",odds:{L:2.10,E:3.40,V:3.20}},
    {home:"City",away:"Arsenal",odds:{L:1.75,E:3.60,V:4.50}},
  ]},
  {sport:"NBA", events:[
    {home:"Lakers",away:"Celtics",odds:{L:1.95,E:null,V:1.85}},
    {home:"Warriors",away:"Bulls",odds:{L:1.65,E:null,V:2.20}},
  ]},
];

const MOCK_HISTORIAL = [
  {code:"QP-47829",user:"@martin_ar",stake:10000,win:42400,time:"02:15",tipo:"bot",estado:"activa"},
  {code:"QP-38291",user:"@apostador99",stake:20000,win:34200,time:"01:45",tipo:"bot",estado:"activa"},
  {code:"QP-M0012",user:"Cliente mostrador",stake:5000,win:9750,time:"01:10",tipo:"manual",estado:"activa"},
  {code:"QP-M0011",user:"Juan Pérez",stake:15000,win:22500,time:"00:30",tipo:"manual",estado:"activa"},
  {code:"QP-C0009",user:"@champion_ar",stake:8000,win:12400,time:"ayer 22:10",tipo:"cobro",estado:"cobrado"},
];

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
  const [step,setStep]=useState("armar");
  const [slip,setSlip]=useState(null);
  const [liveDeportes,setLiveDeportes]=useState(null);
  const [prematchDeportes,setPrematchDeportes]=useState(null);
  const [tabOferta,setTabOferta]=useState("prematch");
  const [abiertos,setAbiertos]=useState({});
  const toggleMercados=(id)=>setAbiertos(a=>({...a,[id]:!a[id]}));

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
      .then(data=>{
        if(data?.sports?.length>0) setPrematchDeportes(data.sports);
      }).catch(()=>{});
  },[]);

  const togglePick=(ev,sport,label,odd)=>{
    const id=`${ev.home}-${ev.away}-${label}`;
    setPicks(p=>{
      const w=p.filter(x=>x.id!==id);
      if(p.find(x=>x.id===id)) return w;
      return[...w,{id,home:ev.home,away:ev.away,sel:label,odd,sport}];
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
          })),
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
          {liveDeportes&&liveDeportes.map(m=>(
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
                  <button key={opt.label} onClick={()=>togglePick({home:m.home,away:m.away},"Live",opt.label,opt.odd)} style={{
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
                    togglePick({home:m.home,away:m.away},"En vivo",label,odd)}
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
          {prematchDeportes ? prematchDeportes.map(d=>(
            <GCard key={d.name} style={{padding:16,marginBottom:12}}>
              <div style={{color:Q.violet2,fontWeight:700,fontSize:13,marginBottom:10,
                fontFamily:"'Space Grotesk',system-ui"}}>{d.icon} {d.name}</div>
              {(d.events||[]).map(ev=>(
                <div key={ev.h+ev.a} style={{marginBottom:12,
                  borderBottom:`1px solid ${Q.dim}`,paddingBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{color:Q.text,fontWeight:600,fontSize:13,
                      fontFamily:"'Space Grotesk',system-ui"}}>{ev.h} vs {ev.a}</span>
                    <span style={{color:Q.muted,fontSize:11}}>{ev.time}</span>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {[{label:ev.h+" gana",odd:ev.odds?.L},
                      ev.odds?.E?{label:"Empate",odd:ev.odds.E}:null,
                      {label:ev.a+" gana",odd:ev.odds?.V}]
                      .filter(Boolean).filter(o=>o.odd).map(opt=>(
                      <button key={opt.label} onClick={()=>togglePick({home:ev.h,away:ev.a},d.name,opt.label,opt.odd)} style={{
                        flex:1,
                        background:hasPick({home:ev.h,away:ev.a},opt.label)?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
                        border:`1.5px solid ${hasPick({home:ev.h,away:ev.a},opt.label)?Q.cyan:Q.border}`,
                        borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",
                      }}>
                        <div style={{color:Q.muted,fontSize:9}}>{opt.label}</div>
                        <div style={{color:hasPick({home:ev.h,away:ev.a},opt.label)?Q.cyan:Q.text,
                          fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{opt.odd}</div>
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
                    <MercadosEvento
                      ev={{...ev, id:ev.id, sport_key:ev.sport_key,
                           markets:ev.markets, h:ev.h, a:ev.a}}
                      bets={picks.map(p=>({id:ev.id,label:p.sel}))}
                      onToggle={(e,label,odd)=>
                        togglePick({home:ev.h,away:ev.a}, d.name, label, odd)}
                      color={Q.cyan}/>
                  )}
                </div>
              ))}
            </GCard>
          )) : DEPORTES.map(d=>(
            <GCard key={d.sport} style={{padding:16,marginBottom:12}}>
              <div style={{color:Q.violet2,fontWeight:700,fontSize:13,marginBottom:10,
                fontFamily:"'Space Grotesk',system-ui"}}>{d.sport}</div>
              {d.events.map(ev=>(
                <div key={ev.home+ev.away} style={{marginBottom:12,
                  borderBottom:`1px solid ${Q.dim}`,paddingBottom:10}}>
                  <div style={{color:Q.text,fontWeight:600,fontSize:13,marginBottom:8,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ev.home} vs {ev.away}</div>
                  <div style={{display:"flex",gap:5}}>
                    {[{label:ev.home+" gana",odd:ev.odds.L},
                      ev.odds.E?{label:"Empate",odd:ev.odds.E}:null,
                      {label:ev.away+" gana",odd:ev.odds.V}]
                      .filter(Boolean).map(opt=>(
                      <button key={opt.label} onClick={()=>togglePick(ev,d.sport,opt.label,opt.odd)} style={{
                        flex:1,minWidth:80,
                        background:hasPick(ev,opt.label)?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
                        border:`1.5px solid ${hasPick(ev,opt.label)?Q.cyan:Q.border}`,
                        borderRadius:10,padding:"8px 6px",cursor:"pointer",textAlign:"center",
                      }}>
                        <div style={{color:Q.muted,fontSize:9}}>{opt.label}</div>
                        <div style={{color:hasPick(ev,opt.label)?Q.cyan:Q.text,
                          fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{opt.odd}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </GCard>
          ))}
        </>
      )}

      {picks.length>0&&(
        <div style={{position:"sticky",bottom:0,
          background:`linear-gradient(0deg,${Q.void} 80%,transparent)`,
          paddingTop:20,paddingBottom:16}}>
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
// HISTORIAL
// ═══════════════════════════════════════════════════════════════
function Historial(){
  const total=MOCK_HISTORIAL.reduce((a,i)=>a+i.stake,0);
  const totalWin=MOCK_HISTORIAL.reduce((a,i)=>a+i.win,0);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[{l:"Tickets hoy",v:MOCK_HISTORIAL.length,c:Q.cyan},
          {l:"Total cobrado",v:ars(total),c:Q.green},
          {l:"Ret. potencial",v:ars(totalWin),c:Q.amber},
        ].map((s,i)=>(
          <GCard key={i} glow={s.c} style={{padding:"10px 12px",textAlign:"center"}}>
            <div style={{color:s.c,fontWeight:700,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>{s.v}</div>
            <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{s.l}</div>
          </GCard>
        ))}
      </div>
      {MOCK_HISTORIAL.map((h,i)=>(
        <GCard key={i} style={{padding:"12px 16px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                <span style={{color:Q.cyan,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>{h.code}</span>
                <span style={{background:h.tipo==="bot"?`${Q.violet}22`:h.tipo==="cobro"?`${Q.green}22`:`${Q.amber}22`,
                  border:`1px solid ${h.tipo==="bot"?Q.violet:h.tipo==="cobro"?Q.green:Q.amber}`,
                  borderRadius:20,padding:"1px 8px",fontSize:9,fontWeight:700,
                  color:h.tipo==="bot"?Q.violet:h.tipo==="cobro"?Q.green:Q.amber,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {h.tipo.toUpperCase()}
                </span>
              </div>
              <div style={{color:Q.muted,fontSize:11}}>{h.user} · {h.time}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{ars(h.stake)}</div>
              <div style={{color:Q.green,fontSize:11}}>ret: {ars(h.win)}</div>
            </div>
          </div>
        </GCard>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CIERRES DE CAJA
// ═══════════════════════════════════════════════════════════════
function Cierres({ agencia }){
  const [tipo,setTipo]=useState("diario");
  const [fechaDesde,setFechaDesde]=useState("");
  const [fechaHasta,setFechaHasta]=useState("");
  const [resultado,setResultado]=useState(null);

  const MOCK_CIERRES = {
    diario:{
      periodo:"Hoy 17/07/2026",
      tickets:47, tickets_bot:31, tickets_manual:16,
      cobrado:284500, pagado:98700, neto:185800,
    },
    semanal:{
      periodo:"Semana 14/07 - 17/07/2026",
      tickets:312, tickets_bot:198, tickets_manual:114,
      cobrado:1842000, pagado:624000, neto:1218000,
    },
    mensual:{
      periodo:"Julio 2026",
      tickets:1247, tickets_bot:834, tickets_manual:413,
      cobrado:7248000, pagado:2481000, neto:4767000,
    },
    personalizado:{
      periodo:`${fechaDesde||"--/--"} al ${fechaHasta||"--/--"}`,
      tickets:183, tickets_bot:121, tickets_manual:62,
      cobrado:1124000, pagado:387000, neto:737000,
    },
  };

  const generar=()=>{
    setResultado(MOCK_CIERRES[tipo]);
  };

  return(
    <div>
      <GCard style={{padding:16,marginBottom:14}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}>Tipo de cierre</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:14}}>
          {[
            {k:"diario",   l:"📅 Diario",      d:"Hoy"},
            {k:"semanal",  l:"📆 Semanal",     d:"Últimos 7 días"},
            {k:"mensual",  l:"🗓️ Mensual",     d:"Este mes"},
            {k:"personalizado",l:"🔧 Personalizado",d:"Elegí las fechas"},
          ].map(t=>(
            <button key={t.k} onClick={()=>{setTipo(t.k);setResultado(null);}} style={{
              background:tipo===t.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
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
            {[["Desde",fechaDesde,setFechaDesde],["Hasta",fechaHasta,setFechaHasta]].map(([l,v,sv])=>(
              <div key={l}>
                <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
                  letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:4}}>{l}</div>
                <input type="date" value={v} onChange={e=>sv(e.target.value)}
                  style={{width:"100%",background:"rgba(255,255,255,0.05)",
                    border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 12px",
                    color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}/>
              </div>
            ))}
          </div>
        )}

        <Btn label="GENERAR CIERRE" onClick={generar} color={Q.violet} full size="lg"/>
      </GCard>

      {resultado&&(
        <GCard glow={Q.green} style={{padding:20,marginBottom:12}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>Cierre {tipo}</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>{resultado.periodo}</div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[
              {l:"Total tickets",v:resultado.tickets,c:Q.cyan},
              {l:"Bot",v:resultado.tickets_bot,c:Q.violet},
              {l:"Manual",v:resultado.tickets_manual,c:Q.amber},
            ].map((s,i)=>(
              <GCard key={i} glow={s.c} style={{padding:"10px",textAlign:"center"}}>
                <div style={{color:s.c,fontWeight:700,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>{s.v}</div>
                <div style={{color:Q.muted,fontSize:9}}>{s.l}</div>
              </GCard>
            ))}
          </div>

          <div style={{marginBottom:14}}>
            {[
              ["Total cobrado (apuestas)",  resultado.cobrado, Q.text],
              ["Total pagado (premios)",    resultado.pagado,  Q.pink],
              ["NETO AGENCIA",              resultado.neto,    Q.green],
            ].map(([l,v,c],i)=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"10px 0",
                borderBottom:i<2?`1px solid ${Q.dim}`:"none",
                marginTop:i===2?8:0}}>
                <span style={{color:i===2?Q.text:Q.muted,fontSize:i===2?14:12,
                  fontWeight:i===2?700:400,fontFamily:"'Space Grotesk',system-ui"}}>{l}</span>
                <span style={{color:c,fontWeight:900,fontSize:i===2?22:14,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</span>
              </div>
            ))}
          </div>

          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>printCierre(resultado,tipo,agencia)} style={{
              flex:1,background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
              border:"none",borderRadius:12,padding:14,cursor:"pointer",
              color:"#fff",fontWeight:700,fontSize:14,
              fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
            }}>🖨️ IMPRIMIR CIERRE</button>
          </div>
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
        {[["Nombre",agencia.name],["Código",agencia.code],
          ["Dirección",agencia.address||"—"],
          ["Teléfono",agencia.phone||"—"],
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
function EnVivo(){
  const [matches,setMatches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [lastUpdate,setLastUpdate]=useState("");
  const [ticket,setTicket]=useState([]);
  const [abiertosLive,setAbiertosLive]=useState({});

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
      return[...w,{id:ev.id,label,odd,home:ev.home,away:ev.away}];
    });
  };
  const isSel=(id,l)=>ticket.some(b=>b.id===id&&b.label===l);
  const totOdd=ticket.length?ticket.reduce((a,b)=>a*b.odd,1):1;

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

      {matches.map(m=>(
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
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui"}}>{m.home}</div>
            </div>
            <div style={{textAlign:"center",padding:"0 12px"}}>
              <div style={{fontFamily:"'Space Grotesk',system-ui",fontWeight:900,
                fontSize:26,color:Q.pink}}>
                {m.homeScore}<span style={{color:Q.dim}}> - </span>{m.awayScore}
              </div>
            </div>
            <div style={{flex:1,textAlign:"right"}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui"}}>{m.away}</div>
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
        <div style={{position:"sticky",bottom:0,
          background:`linear-gradient(0deg,${Q.void} 80%,transparent)`,
          paddingTop:16,paddingBottom:12}}>
          <GCard glow={Q.pink} style={{padding:"12px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:Q.pink}}/>
                <span style={{color:Q.muted,fontSize:12}}>{ticket.length} picks LIVE · <span style={{color:Q.pink,fontWeight:700}}>{totOdd.toFixed(2)}x</span></span>
              </div>
              <span style={{color:Q.green,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
                Ret: ${Math.round(10000*totOdd).toLocaleString("es-AR")}
              </span>
            </div>
            <div style={{color:Q.amber,fontSize:11,marginBottom:8,
              fontFamily:"'Space Grotesk',system-ui",lineHeight:1.4}}>
              Esta pantalla es solo para consultar. Para tomar la apuesta y
              emitir el ticket, usá <strong>Apuesta manual</strong>.
            </div>
            <button onClick={()=>setTicket([])} style={{
              width:"100%",background:"transparent",
              border:`1px solid ${Q.border}`,borderRadius:12,padding:"11px",
              cursor:"pointer",color:Q.muted,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
            }}>Limpiar selección</button>
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
    {k:"historial",l:"Historial"},
    {k:"cierres",  l:"Cierres"},
    {k:"config",   l:"Config"},
  ];

  return(
    <div style={{background:Q.void,minHeight:"100vh",
      fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"10px 16px",display:"flex",alignItems:"center",
        justifyContent:"space-between",position:"sticky",top:0,zIndex:50,overflow:"hidden"}}>
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
        padding:"6px 12px",display:"flex",gap:5,overflowX:"auto",
        position:"sticky",top:52,zIndex:40}}>
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

      <div style={{padding:"16px",maxWidth:620,margin:"0 auto",
        position:"relative",zIndex:1,paddingBottom:80}}>
        {tab==="codigo"   &&<FlujoCodigo  agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="envivo"   &&<EnVivo/>}
        {tab==="manual"   &&<FlujoManual  agencia={agencia}/>}
        {tab==="historial"&&<Historial/>}
        {tab==="cierres"  &&<Cierres      agencia={agencia}/>}
        {tab==="config"   &&<Config       agencia={agencia}/>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function QuartzAgencia(){
  const [agencia,setAgencia]=useState(null);
  const [avisoSesion,setAvisoSesion]=useState(false);

  const sesionExpirada=()=>{
    setAgencia(null);
    setAvisoSesion(true);
  };

  return(
    <div style={{background:Q.void,minHeight:"100vh"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
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
