// ═══════════════════════════════════════════════════════════════
// ARCHIVO DESTINO: frontend/src/Agencia.jsx
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, Component } from "react";

// Captura errores de render y muestra el mensaje en pantalla (evita pantalla negra)
class CazaError extends Component {
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err,info){ console.error("CazaError:",err,info); }
  render(){
    if(this.state.err){
      return (
        <div style={{padding:20,background:"#1a0000",minHeight:"100vh",color:"#fff",
          fontFamily:"monospace",fontSize:13,whiteSpace:"pre-wrap",lineHeight:1.5}}>
          <div style={{color:"#FF1744",fontWeight:700,fontSize:16,marginBottom:10}}>
            ⚠️ Error en esta pantalla</div>
          <div style={{color:"#FFB800",marginBottom:8}}>{String(this.state.err&&this.state.err.message||this.state.err)}</div>
          <div style={{color:"#888",fontSize:11,marginBottom:16}}>
            {String(this.state.err&&this.state.err.stack||"").slice(0,600)}</div>
          <button onClick={()=>this.setState({err:null})}
            style={{background:"#7C3AED",border:"none",borderRadius:8,padding:"10px 18px",
              color:"#fff",fontSize:14,cursor:"pointer"}}>Reintentar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

// ── Compartir combos en redes: texto + placa PNG ──────────────
function textoCombo(combo, ref, link){
  const picks=(combo.picks||[]).map((p,i)=>{
    const local=p.home||p.h||"";
    const sel=p.sel||p.label||"";
    const odd=fmt(p.odd||p.cuota||0);
    return `${i+1}. ${local?local+" — ":""}${sel} @${odd}`;
  }).join("\n");
  return `🔥 ${combo.nombre||"COMBINADA"} 🔥\n\n`+
    `${picks}\n\n`+
    `💰 Cuota total: ${fmt(combo.odd||combo.odd_total||0)}x\n`+
    (combo.codigo?`🎟️ Código: ${combo.codigo}\n`:"")+
    `🎟️ Mi código: ${ref}\n`+
    `👉 Jugá acá: ${link}`;
}

function descargarPlacaCombo(combo, ref, link){
  try{
    const W=1080, H=1350;
    const cv=document.createElement("canvas"); cv.width=W; cv.height=H;
    const x=cv.getContext("2d");
    // Fondo degradé
    const g=x.createLinearGradient(0,0,W,H);
    g.addColorStop(0,"#0a0118"); g.addColorStop(0.5,"#1a0a3a"); g.addColorStop(1,"#04040f");
    x.fillStyle=g; x.fillRect(0,0,W,H);
    // Marco
    x.strokeStyle="#7C3AED"; x.lineWidth=6;
    x.strokeRect(30,30,W-60,H-60);
    // Título marca
    x.fillStyle="#00F0FF"; x.font="bold 64px system-ui"; x.textAlign="center";
    x.fillText("QuartzPlay", W/2, 130);
    // Nombre del combo
    x.fillStyle="#ffffff"; x.font="bold 52px system-ui";
    const nombre=(combo.nombre||"COMBINADA").toUpperCase();
    x.fillText(nombre.length>22?nombre.slice(0,22)+"…":nombre, W/2, 240);
    // Picks
    x.textAlign="left"; x.font="34px system-ui";
    let y=360;
    const picks=(combo.picks||[]).slice(0,8);
    picks.forEach((p,i)=>{
      const local=p.home||p.h||"";
      const sel=p.sel||p.label||"";
      const odd=fmt(p.odd||p.cuota||0);
      x.fillStyle="#a78bfa"; x.fillText(`${i+1}.`, 90, y);
      x.fillStyle="#ffffff";
      let linea=`${local?local+" — ":""}${sel}`;
      if(linea.length>34) linea=linea.slice(0,34)+"…";
      x.fillText(linea, 150, y);
      x.fillStyle="#00F0FF"; x.textAlign="right";
      x.fillText(`@${odd}`, W-90, y);
      x.textAlign="left";
      y+=70;
    });
    // Cuota total
    y+=20;
    x.fillStyle="#22c55e"; x.font="bold 60px system-ui"; x.textAlign="center";
    x.fillText(`CUOTA ${fmt(combo.odd||combo.odd_total||0)}x`, W/2, y);
    // Código y link
    y=H-300;
    if(combo.codigo){
      x.fillStyle="#E8C547"; x.font="bold 44px system-ui";
      x.fillText(`Código: ${combo.codigo}`, W/2, y); y+=70;
    }
    x.fillStyle="#E8C547"; x.font="bold 44px system-ui";
    x.fillText(`Mi código: ${ref}`, W/2, y); y+=90;
    x.fillStyle="#7C3AED"; x.fillRect(W/2-360,y-50,720,90);
    x.fillStyle="#ffffff"; x.font="bold 34px system-ui";
    x.fillText("👉 JUGÁ CONMIGO", W/2, y+10);
    // Bot de Telegram bien visible
    x.fillStyle="#00F0FF"; x.font="bold 40px system-ui";
    x.fillText("📲 Telegram: @quartzplay_bot", W/2, y+90);
    // Descargar
    cv.toBlob(b=>{
      const a=document.createElement("a");
      a.href=URL.createObjectURL(b);
      a.download=`combo_${ref}_${combo.id||"qp"}.png`;
      a.click();
    },"image/png");
    return true;
  }catch(e){ return false; }
}

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
function GCard({ children, style={}, glow, onClick }){
  return(
    <div onClick={onClick} style={{
      background:Q.glass, backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
      border:`1px solid ${glow?glow+"44":Q.border}`,
      borderRadius:16,
      boxShadow:`0 8px 32px rgba(0,0,0,0.5)${glow?`, 0 0 24px ${glow}22`:""}`,
      position:"relative", overflow:"hidden", maxWidth:"100%", minWidth:0,
      cursor:onClick?"pointer":"default", ...style,
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
async function registrarImpresion(tipo, referencia){
  try{
    let token=null;
    try{ const g=JSON.parse(localStorage.getItem("qp_agencia")||"null"); token=g&&g.token; }catch(e){}
    await fetch(`${API_URL}/api/imprimir`,{
      method:"POST",
      headers:{"Content-Type":"application/json",...(token?{"Authorization":`Bearer ${token}`}:{})},
      body:JSON.stringify({tipo:tipo||"ticket",referencia:referencia||""}),
    });
  }catch(e){}
}

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
        registrarImpresion(window.__qpTicketTipo||"ticket", window.__qpTicketRef||"");
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
  try{
    window.__qpTicketTipo = tipo;
    window.__qpTicketRef = (slip && (slip.code||slip.id)) ? String(slip.code||slip.id) : "";
  }catch(e){}
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
  const [coValor,setCoValor]=useState(null);
  const [coMsg,setCoMsg]=useState("");
  const [coProc,setCoProc]=useState(false);

  const consultarCashout=async()=>{
    setCoMsg(""); setCoProc(true); setCoValor(null);
    try{
      const r=await fetch(`${API_URL}/api/betslip/${slip.code}/cashout`);
      const d=await r.json();
      if(d.disponible){ setCoValor(d.valor); setStep("cashout"); }
      else { setCoMsg(d.motivo||"Cash out no disponible"); }
    }catch(e){ setCoMsg("Error al consultar"); }
    setCoProc(false);
  };

  const ejecutarCashout=async()=>{
    if(coProc) return;
    setCoProc(true); setCoMsg("");
    try{
      const r=await fetch(`${API_URL}/api/betslip/${slip.code}/cashout`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ejecutor:"agencia",valor_esperado:coValor}),
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setSlip(sl=>({...sl,cashed:true,cash_valor:d.valor})); setStep("done_cashout"); }
      else { setCoMsg(d.detail||"No se pudo cashear"); }
    }catch(e){ setCoMsg("Error al cashear"); }
    setCoProc(false);
  };

  const pagarCashoutCaja=async()=>{
    if(coProc) return;
    setCoProc(true); setCoMsg("");
    try{
      const r=await fetch(`${API_URL}/api/betslip/${slip.code}/cashout/pagar-caja`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setSlip(sl=>({...sl,cashed:true,cash_valor:d.valor})); setStep("done_cashout"); }
      else setCoMsg(d.detail||"No se pudo pagar");
    }catch(e){ setCoMsg("Error al pagar"); }
    setCoProc(false);
  };

  const [retiro,setRetiro]=useState(null);
  const [retProc,setRetProc]=useState(false);
  const buscar=async()=>{
    setErr(""); setPayErr(""); setSlip(null); setRetiro(null); setStep("buscar"); setLoading(true);
    try {
      // Código de retiro (RT-XXXXX): flujo distinto
      if(code.trim().toUpperCase().startsWith("RT-")){
        const r=await fetch(`${API_URL}/api/retiro/${code.trim().toUpperCase()}`,
          { headers: authHeaders(agencia.token) });
        if(r.status===401){ onSesionExpirada(); return; }
        const d=await r.json();
        if(!r.ok) throw new Error(d.detail||"Retiro no encontrado");
        setRetiro(d); setStep("retiro");
      } else {
        const found = await fetchBetslip(code, agencia.token);
        setSlip(found); setStep("confirmar");
      }
    } catch(e){
      if(e.name==="SesionExpirada"){ onSesionExpirada(); return; }
      setErr(e.name==="SinConexion"
        ? "Sin conexión con el servidor. No se puede validar el código — no cobrar."
        : (e.message||"Código no encontrado."));
    }
    setLoading(false);
  };

  const pagarRetiro=async()=>{
    if(retProc) return;
    setRetProc(true); setErr("");
    try{
      const r=await fetch(`${API_URL}/api/retiro/${retiro.code}/pagar`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setRetiro(rt=>({...rt,estado:"pagado"})); setStep("retiro_ok"); }
      else setErr(d.detail||"No se pudo pagar");
    }catch(e){ setErr("Error al pagar"); }
    setRetProc(false);
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
        aviso_tope: result.aviso_tope,
        topeado: result.topeado,
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

  const reset=()=>{ setCode(""); setSlip(null); setRetiro(null); setErr(""); setPayErr(""); setStep("buscar"); };

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

      {slip&&step==="confirmar"&&slip.status==="cashout_pending"&&(
        <GCard glow={Q.gold} style={{padding:20,marginBottom:12}}>
          <div style={{color:Q.gold,fontWeight:800,fontSize:16,marginBottom:6,
            fontFamily:"'Space Grotesk',system-ui"}}>🎫 Cash out para cobrar</div>
          <div style={{color:Q.muted,fontSize:13,marginBottom:16}}>
            El cliente hizo cash out y viene a cobrar en efectivo.
          </div>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
              fontFamily:"'Space Grotesk',system-ui"}}>A pagar</div>
            <div style={{color:Q.gold,fontWeight:900,fontSize:34,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(slip.potential_win)}</div>
          </div>
          <AlertaError mensaje={coMsg} critico/>
          <div style={{display:"flex",gap:8}}>
            <Btn label="Cancelar" onClick={reset} outline color={Q.muted} full disabled={coProc}/>
            <Btn label={coProc?"PAGANDO...":`PAGAR ${ars(slip.potential_win)}`}
              onClick={pagarCashoutCaja} color={Q.gold} full disabled={coProc}/>
          </div>
        </GCard>
      )}
      {slip&&step==="confirmar"&&slip.status!=="cashout_pending"&&(
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
              {slip.status==="active"&&(
                <button onClick={consultarCashout} disabled={coProc} style={{
                  background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.gold}`,
                  borderRadius:12,padding:14,cursor:"pointer",textAlign:"left"}}>
                  <div style={{color:Q.gold,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui",marginBottom:3}}>
                    {coProc?"Calculando...":"💰 Cash out (retirar ahora)"}
                  </div>
                  <div style={{color:Q.muted,fontSize:12}}>
                    Cerrar la apuesta ya, al valor actual en vivo
                  </div>
                </button>
              )}
            </div>
            {coMsg&&<div style={{color:Q.red,fontSize:12,marginTop:10,textAlign:"center",
              fontFamily:"'Space Grotesk',system-ui"}}>{coMsg}</div>}
          </GCard>
          <Btn label="Cancelar" onClick={reset} outline color={Q.muted} full/>
        </div>
      )}

      {step==="retiro"&&retiro&&(
        <GCard glow={Q.gold} style={{padding:20,marginBottom:12}}>
          <div style={{color:Q.gold,fontWeight:800,fontSize:16,marginBottom:6,
            fontFamily:"'Space Grotesk',system-ui"}}>💸 Retiro para pagar</div>
          <div style={{color:Q.muted,fontSize:13,marginBottom:16}}>
            El cliente solicitó un retiro y viene a cobrar en efectivo.
          </div>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
              fontFamily:"'Space Grotesk',system-ui"}}>A pagar a {retiro.cliente}</div>
            <div style={{color:Q.gold,fontWeight:900,fontSize:34,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(retiro.monto)} {retiro.moneda}</div>
          </div>
          <AlertaError mensaje={err} critico/>
          {retiro.estado!=="pendiente"?(
            <div style={{color:Q.amber,fontSize:13,textAlign:"center",
              fontFamily:"'Space Grotesk',system-ui"}}>Este retiro ya está {retiro.estado}</div>
          ):(
            <div style={{display:"flex",gap:8}}>
              <Btn label="Cancelar" onClick={reset} outline color={Q.muted} full disabled={retProc}/>
              <Btn label={retProc?"PAGANDO...":`PAGAR ${ars(retiro.monto)}`}
                onClick={pagarRetiro} color={Q.gold} full disabled={retProc}/>
            </div>
          )}
        </GCard>
      )}
      {step==="retiro_ok"&&retiro&&(
        <GCard glow={Q.green} style={{padding:24,textAlign:"center",marginBottom:12}}>
          <div style={{fontSize:48,marginBottom:8}}>💵</div>
          <div style={{color:Q.green,fontWeight:800,fontSize:18,marginBottom:6,
            fontFamily:"'Space Grotesk',system-ui"}}>Retiro pagado</div>
          <div style={{color:Q.text,fontWeight:900,fontSize:26,
            fontFamily:"'Space Grotesk',system-ui"}}>{ars(retiro.monto)} {retiro.moneda}</div>
          <Btn label="Listo" onClick={reset} color={Q.violet} full/>
        </GCard>
      )}
      {step==="pagar"&&slip&&(
        <PagoLocalForm slip={slip} error={payErr} paying={paying}
          onConfirm={confirmarPago} onCancel={reset}/>
      )}
      {step==="cashout"&&slip&&(
        <GCard glow={Q.gold} style={{padding:20,marginBottom:12}}>
          <div style={{color:Q.gold,fontWeight:700,fontSize:15,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>💰 Cash out</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>
            Valor actual calculado con las cuotas en vivo. Si el cliente acepta,
            se cierra la apuesta y se le paga este monto.
          </div>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
              fontFamily:"'Space Grotesk',system-ui"}}>Se paga ahora</div>
            <div style={{color:Q.gold,fontWeight:900,fontSize:34,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(coValor)}</div>
            <div style={{color:Q.muted,fontSize:11}}>vs retorno potencial {ars(slip.potential_win)}</div>
          </div>
          <AlertaError mensaje={coMsg} critico/>
          <div style={{display:"flex",gap:8}}>
            <Btn label="Cancelar" onClick={()=>setStep("confirmar")} outline color={Q.muted} full disabled={coProc}/>
            <Btn label={coProc?"PROCESANDO...":`PAGAR ${ars(coValor)}`}
              onClick={ejecutarCashout} color={Q.gold} full disabled={coProc}/>
          </div>
        </GCard>
      )}
      {step==="done_cashout"&&slip&&(
        <DoneScreen slip={{...slip,agencia:agencia.code,
          potential_win:slip.cash_valor,stake:slip.stake}}
          titulo={`Cash out pagado · ${ars(slip.cash_valor)}`}
          color={Q.gold} tipo="apuesta" onReset={reset}/>
      )}
      {step==="done_confirmado"&&slip&&(
        <DoneScreen slip={{...slip,agencia:agencia.code}}
          titulo="Apuesta confirmada" color={Q.green} tipo="apuesta" onReset={reset}/>
      )}
      {step==="done_pagado"&&slip&&(
        <>
          {slip.aviso_tope&&(
            <GCard glow={Q.amber} style={{padding:14,marginBottom:10,
              background:`${Q.amber}12`}}>
              <div style={{color:Q.amber,fontWeight:700,fontSize:13,textAlign:"center",
                fontFamily:"'Space Grotesk',system-ui"}}>⚠️ {slip.aviso_tope}</div>
              <div style={{color:Q.muted,fontSize:11,textAlign:"center",marginTop:4,
                fontFamily:"'Space Grotesk',system-ui"}}>
                El premio se topeó al máximo permitido.</div>
            </GCard>
          )}
          <DoneScreen slip={{...slip,agencia:agencia.code}}
            titulo="Pago registrado" color={Q.amber} tipo="apuesta" onReset={reset}/>
        </>
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
  const [codigoInf,setCodigoInf]=useState("");
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
          agencia_code: agencia.code,
          codigo_influencer: codigoInf || null,
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

  const reset=()=>{ setPicks([]); setMonto(5000); setCliente(""); setCodigoInf(""); setStep("armar"); setSlip(null); };

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
        <div style={{color:Q.muted,fontSize:12,margin:"10px 0 6px",
          fontFamily:"'Space Grotesk',system-ui"}}>
          Código de influencer (opcional)</div>
        <input value={codigoInf} onChange={e=>setCodigoInf(e.target.value.toUpperCase())}
          placeholder="Ej: JUANTIPS o REF1A2B"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${codigoInf?Q.cyan:Q.border}`,borderRadius:10,padding:"10px 14px",
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

// ── CORREGIR PICK (compartido) ────────────────────────────────
// Cuando la IA leyó mal un pick, el cliente lo corrige acá: elige otra
// selección del mismo partido, ajusta la cuota, cambia el partido entero
// o quita la selección. Se despliega bajo el pick (móvil-friendly).
function CorregirPick({ pick, token, onAplicar, onQuitar, onSesionExpirada }){
  const [modo,setModo]=useState("seleccion");   // seleccion | partido
  const [buscar,setBuscar]=useState("");
  const [encontrados,setEncontrados]=useState([]);
  const [buscando,setBuscando]=useState(false);
  const [ajuste,setAjuste]=useState("");         // cuota manual opcional
  const opciones=pick.opciones||[];

  // Buscar otro partido por nombre
  const buscarEventos=async()=>{
    if(buscar.trim().length<2||buscando) return;
    setBuscando(true);
    try{
      const r=await fetch(`${API_URL}/api/buscar-eventos?q=${encodeURIComponent(buscar.trim())}`,
        {headers:authHeaders(token)});
      if(r.status===401){ onSesionExpirada&&onSesionExpirada(); return; }
      const d=await r.json();
      setEncontrados(d.eventos||[]);
    }catch(e){ setEncontrados([]); }
    setBuscando(false);
  };

  // Elegir una opción del partido actual
  const elegirOpcion=(op)=>{
    const cuota = ajuste.trim()? parseFloat(ajuste) : op.odd;
    onAplicar({
      selection: op.sel,
      odd_nuestra: op.odd,
      odd_final: cuota,
      odd_ajustada: cuota,
      ajustada: !!ajuste.trim(),
      estado: "ok",
    });
  };

  // Elegir un partido nuevo y una de sus opciones
  const elegirNuevoPartido=(ev, op)=>{
    const cuota = ajuste.trim()? parseFloat(ajuste) : op.odd;
    onAplicar({
      home: ev.home, away: ev.away,
      home_real: ev.home, away_real: ev.away,
      event_id: ev.event_id, sport_key: ev.sport_key,
      selection: op.sel, market: op.mkt,
      odd_nuestra: op.odd, odd_final: cuota, odd_ajustada: cuota,
      ajustada: !!ajuste.trim(), estado:"ok",
      opciones: ev.opciones,
    });
  };

  return(
    <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
      {/* Nombres reales, para comparar con lo leído */}
      {(pick.home_real||pick.away_real)&&(
        <div style={{color:Q.muted,fontSize:10,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>
          En nuestro sistema: <span style={{color:Q.cyan}}>{pick.home_real} vs {pick.away_real}</span>
        </div>
      )}

      {/* Candidatos parecidos (cuando no encontró el partido) */}
      {(pick.candidatos&&pick.candidatos.length>0)&&(
        <div style={{marginBottom:10}}>
          <div style={{color:Q.amber,fontSize:10,marginBottom:6,
            fontFamily:"'Space Grotesk',system-ui"}}>
            ¿Quisiste decir alguno de estos?
          </div>
          {pick.candidatos.map((ev,ci)=>(
            <div key={ci} style={{background:`${Q.amber}0E`,
              border:`1px solid ${Q.amber}44`,borderRadius:8,
              padding:"8px 10px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,marginBottom:5,
                fontFamily:"'Space Grotesk',system-ui"}}>{ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevoPartido(ev,op)} style={{
                    background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
                    borderRadius:7,padding:"5px 9px",cursor:"pointer",
                    color:Q.cyan,fontSize:11,fontWeight:600,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {op.sel} · {fmt(op.odd)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alternar entre corregir selección o cambiar partido */}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <button onClick={()=>setModo("seleccion")} style={{flex:1,
          background:modo==="seleccion"?`${Q.violet}33`:"rgba(255,255,255,0.04)",
          border:`1px solid ${modo==="seleccion"?Q.violet:Q.border}`,borderRadius:8,
          padding:"7px",cursor:"pointer",color:modo==="seleccion"?Q.cyan:Q.muted,
          fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
          Cambiar selección</button>
        <button onClick={()=>setModo("partido")} style={{flex:1,
          background:modo==="partido"?`${Q.violet}33`:"rgba(255,255,255,0.04)",
          border:`1px solid ${modo==="partido"?Q.violet:Q.border}`,borderRadius:8,
          padding:"7px",cursor:"pointer",color:modo==="partido"?Q.cyan:Q.muted,
          fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
          Otro partido</button>
      </div>

      {modo==="seleccion"&&(
        <div>
          {opciones.length===0&&(
            <div style={{color:Q.muted,fontSize:11,marginBottom:8,
              fontFamily:"'Space Grotesk',system-ui"}}>
              No tenemos opciones de este partido. Probá "Otro partido".
            </div>
          )}
          {opciones.map((op,k)=>(
            <button key={k} onClick={()=>elegirOpcion(op)} style={{width:"100%",
              display:"flex",justifyContent:"space-between",alignItems:"center",
              background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.border}`,
              borderRadius:8,padding:"9px 12px",marginBottom:5,cursor:"pointer"}}>
              <span style={{color:Q.text,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>{op.sel}</span>
              <span style={{color:Q.cyan,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{fmt(op.odd)}</span>
            </button>
          ))}
        </div>
      )}

      {modo==="partido"&&(
        <div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <input value={buscar} onChange={e=>setBuscar(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&buscarEventos()}
              placeholder="Nombre del equipo..."
              style={{flex:1,background:"rgba(255,255,255,0.05)",
                border:`1px solid ${Q.border}`,borderRadius:8,padding:"9px 12px",
                color:Q.text,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}/>
            <button onClick={buscarEventos} style={{background:`${Q.violet}33`,
              border:`1px solid ${Q.violet}`,borderRadius:8,padding:"0 14px",
              cursor:"pointer",color:Q.cyan,fontSize:12,fontWeight:700,
              fontFamily:"'Space Grotesk',system-ui"}}>{buscando?"...":"Buscar"}</button>
          </div>
          {encontrados.map((ev,k)=>(
            <div key={k} style={{background:"rgba(255,255,255,0.03)",
              border:`1px solid ${Q.dim}`,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,marginBottom:6,
                fontFamily:"'Space Grotesk',system-ui"}}>{ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevoPartido(ev,op)} style={{
                    background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
                    borderRadius:7,padding:"5px 9px",cursor:"pointer",
                    color:Q.cyan,fontSize:11,fontWeight:600,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {op.sel} · {fmt(op.odd)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ajuste manual de cuota + quitar */}
      <div style={{display:"flex",gap:6,marginTop:8,alignItems:"center"}}>
        <input value={ajuste} onChange={e=>setAjuste(e.target.value)}
          placeholder="Cuota a mano (opcional)" inputMode="decimal"
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:8,padding:"8px 10px",
            color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}/>
        <button onClick={onQuitar} style={{background:`${Q.red}18`,
          border:`1px solid ${Q.red}`,borderRadius:8,padding:"8px 12px",
          cursor:"pointer",color:Q.red,fontSize:11,fontWeight:700,
          fontFamily:"'Space Grotesk',system-ui"}}>Quitar</button>
      </div>
      {ajuste.trim()&&(
        <div style={{color:Q.amber,fontSize:10,marginTop:5,
          fontFamily:"'Space Grotesk',system-ui"}}>
          La cuota a mano se aplica al elegir una opción de arriba.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MEJORAR COMBINADA — sube captura, la IA la lee y replica
// ═══════════════════════════════════════════════════════════════
function MejorarCombinada({ agencia, onSesionExpirada }){
  const [imagenes,setImagenes]=useState([]);    // [{b64, tipo, preview}]
  const [analizando,setAnalizando]=useState(false);
  const [res,setRes]=useState(null);
  const [err,setErr]=useState("");
  const [monto,setMonto]=useState(2000);
  const [cliente,setCliente]=useState("");
  const [cobrando,setCobrando]=useState(false);
  const [okMsg,setOkMsg]=useState("");
  const [corrigiendo,setCorrigiendo]=useState(null);  // índice del pick en corrección

  // Reemplaza un pick por la versión corregida
  const aplicarCorreccion=(idx, nuevo)=>{
    setRes(r=>{
      const picks=r.picks.map((p,i)=>i===idx?{...p,...nuevo}:p);
      const validos=picks.filter(p=>p.odd_final);
      let tot=1; validos.forEach(p=>tot*=p.odd_final);
      return {...r, picks,
        picks_ok: validos.length,
        cuota_total: validos.length?Math.round(tot*100)/100:null};
    });
    setCorrigiendo(null);
  };
  const quitarPick=(idx)=>{
    setRes(r=>{
      const picks=r.picks.filter((_,i)=>i!==idx);
      const validos=picks.filter(p=>p.odd_final);
      let tot=1; validos.forEach(p=>tot*=p.odd_final);
      return {...r, picks,
        picks_total: picks.length,
        picks_ok: validos.length,
        cuota_total: validos.length?Math.round(tot*100)/100:null};
    });
    setCorrigiendo(null);
  };

  const elegirArchivo=(e)=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length) return;
    setErr(""); setRes(null); setOkMsg("");
    files.forEach(file=>{
      if(file.size>8*1024*1024){ setErr("Una imagen supera los 8MB"); return; }
      const reader=new FileReader();
      reader.onload=()=>{
        const dataUrl=reader.result;
        setImagenes(prev=>[...prev,
          {b64:dataUrl.split(",")[1], tipo:file.type||"image/jpeg", preview:dataUrl}]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value="";   // permite volver a elegir el mismo archivo
  };
  const quitarImagen=(i)=>setImagenes(prev=>prev.filter((_,k)=>k!==i));

  const analizar=async()=>{
    if(!imagenes.length||analizando) return;
    setAnalizando(true); setErr(""); setRes(null);
    try{
      const r=await fetch(`${API_URL}/api/mejorar-combinada`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({imagenes:imagenes.map(im=>({data:im.b64,media_type:im.tipo}))}),
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
          agencia_code: agencia.code,
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
      setImagenes([]); setRes(null); setCliente("");
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

      <div style={{color:Q.muted,fontSize:11,marginBottom:8,lineHeight:1.4,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Si la combinada es larga y no entra en una foto, agregá varias
        (scrolleá el cupón entre cada captura).
      </div>

      {/* Miniaturas de las fotos cargadas */}
      {imagenes.length>0&&(
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
          {imagenes.map((im,i)=>(
            <div key={i} style={{position:"relative"}}>
              <img src={im.preview} alt={"foto"+i} style={{width:70,height:70,
                objectFit:"cover",borderRadius:8,border:`1px solid ${Q.border}`}}/>
              <button onClick={()=>quitarImagen(i)} style={{position:"absolute",
                top:-6,right:-6,width:20,height:20,borderRadius:"50%",
                background:Q.red,border:"none",color:"#fff",fontSize:11,
                cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:10,marginBottom:10}}>
        <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:14,
          padding:"20px 12px",textAlign:"center",cursor:"pointer",
          background:"rgba(255,255,255,0.02)"}}>
          <input type="file" accept="image/*" capture="environment"
            onChange={elegirArchivo} style={{display:"none"}}/>
          <div style={{fontSize:26,marginBottom:4}}>📸</div>
          <div style={{color:Q.text,fontWeight:700,fontSize:12,
            fontFamily:"'Space Grotesk',system-ui"}}>Sacar foto</div>
        </label>
        <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:14,
          padding:"20px 12px",textAlign:"center",cursor:"pointer",
          background:"rgba(255,255,255,0.02)"}}>
          <input type="file" accept="image/*" multiple onChange={elegirArchivo}
            style={{display:"none"}}/>
          <div style={{fontSize:26,marginBottom:4}}>🖼️</div>
          <div style={{color:Q.text,fontWeight:700,fontSize:12,
            fontFamily:"'Space Grotesk',system-ui"}}>
            {imagenes.length>0?"Agregar más":"Desde galería"}</div>
        </label>
      </div>

      {imagenes.length>0&&(
        <Btn label={analizando?"LEYENDO...":`🔍 Analizar ${imagenes.length} foto${imagenes.length>1?"s":""}`}
          onClick={analizar} color={Q.violet} full size="lg" disabled={analizando}
          style={{marginBottom:12}}/>
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

          {res.faltan_picks&&(
            <div style={{background:`${Q.red}12`,border:`1px solid ${Q.red}66`,
              borderRadius:10,padding:"10px 12px",marginBottom:12,color:Q.red,
              fontSize:11,lineHeight:1.4,fontFamily:"'Space Grotesk',system-ui"}}>
              ⚠️ El cupón marca cuota total {fmt(res.total_odd_cupon)} pero con lo
              leído no llegamos. Probablemente falta algún partido — agregá otra
              foto scrolleando el cupón.
            </div>
          )}

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
              <div style={{display:"flex",gap:12,fontSize:12,marginBottom:8,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {p.odd_original&&<span style={{color:Q.dim}}>
                  Origen: <span style={{color:Q.muted}}>{fmt(p.odd_original)}</span></span>}
                {p.odd_nuestra&&<span style={{color:Q.dim}}>
                  Nuestra: <span style={{color:Q.muted}}>{fmt(p.odd_nuestra)}</span></span>}
                {p.odd_final&&<span style={{color:Q.dim}}>
                  Final: <span style={{color:est.c,fontWeight:700}}>{fmt(p.odd_final)}</span>
                  {p.ajustada&&<span style={{color:Q.amber,fontSize:9}}> ↑ajustada</span>}</span>}
              </div>
              <button onClick={()=>setCorrigiendo(corrigiendo===i?null:i)} style={{
                background:corrigiendo===i?`${Q.cyan}22`:"transparent",
                border:`1px solid ${corrigiendo===i?Q.cyan:Q.dim}`,borderRadius:8,
                padding:"6px 12px",cursor:"pointer",color:corrigiendo===i?Q.cyan:Q.muted,
                fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                {corrigiendo===i?"✕ Cerrar":"✏️ Está mal / Corregir"}
              </button>
              {corrigiendo===i&&(
                <CorregirPick pick={p} token={agencia.token}
                  onAplicar={(nuevo)=>aplicarCorreccion(i,nuevo)}
                  onQuitar={()=>quitarPick(i)}
                  onSesionExpirada={onSesionExpirada}/>
              )}
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

// ── CREAR COMBO (agencia) ─────────────────────────────────────
function CrearComboAgencia({ agencia, onVolver, onSesionExpirada }){
  const [deportes,setDeportes]=useState(null);
  const [nombre,setNombre]=useState("");
  const [picks,setPicks]=useState([]);
  const [busqueda,setBusqueda]=useState("");
  const [liga,setLiga]=useState(null);
  const [guardando,setGuardando]=useState(false);
  const [msg,setMsg]=useState("");
  const [infList,setInfList]=useState([]);
  const [infCode,setInfCode]=useState("");
  const [codigoSalida,setCodigoSalida]=useState("");
  // compartir con varios
  const [destSubs,setDestSubs]=useState([]);       // codes de subs
  const [destInfs,setDestInfs]=useState([]);       // codes de influencers
  const [todosSubs,setTodosSubs]=useState(false);
  const [todosInfs,setTodosInfs]=useState(false);
  const [destinatarios,setDestinatarios]=useState({subs:[],influencers:[]});

  useEffect(()=>{
    fetch(`${API_URL}/api/live/prematch`)
      .then(r=>r.ok?r.json():null)
      .then(d=>setDeportes(d?.sports||[]))
      .catch(()=>setDeportes([]));
    fetch(`${API_URL}/api/influencers`,{headers:authHeaders(agencia.token)})
      .then(r=>r.ok?r.json():{influencers:[]}).then(d=>setInfList(d.influencers||[]))
      .catch(()=>{});
    fetch(`${API_URL}/api/agencias/me/destinatarios`,{headers:authHeaders(agencia.token)})
      .then(r=>r.ok?r.json():{subs:[],influencers:[]})
      .then(d=>setDestinatarios({subs:d.subs||[],influencers:d.influencers||[]}))
      .catch(()=>{});
  // eslint-disable-next-line
  },[]);

  const toggleDest=(code,lista,setLista)=>{
    setLista(prev=>prev.includes(code)?prev.filter(c=>c!==code):[...prev,code]);
  };

  const toggle=(ev,dep,label,odd)=>{
    const id=`${ev.h}-${ev.a}-${label}`;
    setPicks(p=>{
      const w=p.filter(x=>x.id!==id);
      if(p.find(x=>x.id===id)) return w;
      return[...w,{id,home:ev.h,away:ev.a,sel:label,odd,sport:dep,
        event_id:ev.id,sport_key:ev.sport_key}];
    });
  };
  const tiene=(ev,l)=>picks.some(x=>x.id===`${ev.h}-${ev.a}-${l}`);
  const totOdd=picks.length?picks.reduce((a,p)=>a*p.odd,1):1;

  const guardar=async()=>{
    if(!picks.length||guardando) return;
    setGuardando(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/combos`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({nombre:nombre||"Combo de la agencia",
          picks:picks.map(p=>({home:p.home,away:p.away,sel:p.sel,odd:p.odd,
            sport:p.sport,event_id:p.event_id,sport_key:p.sport_key})),
          influencer_code: infCode||null, codigo: codigoSalida||null,
          compartir_subs: todosSubs ? "todos" : destSubs,
          compartir_influencers: todosInfs ? "todos" : destInfs}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const nComp=(todosSubs?destinatarios.subs.length:destSubs.length)
                 +(todosInfs?destinatarios.influencers.length:destInfs.length);
      setMsg(`✅ Combo creado.${nComp>0?` Compartido con ${nComp} cuenta(s).`:" Ya aparece en tus terminales."}`);
      setPicks([]); setNombre("");
      setDestSubs([]); setDestInfs([]); setTodosSubs(false); setTodosInfs(false);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setGuardando(false);
  };

  const filtrados=(deportes||[])
    .filter(d=>!liga||d.name===liga)
    .map(d=>({...d,events:(d.events||[]).filter(ev=>{
      const q=busqueda.trim().toLowerCase();
      return !q||`${ev.h} ${ev.a}`.toLowerCase().includes(q);
    })}))
    .filter(d=>d.events.length>0);

  return(
    <div>
      <button onClick={onVolver} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:22,cursor:"pointer",marginBottom:6,padding:0}}>‹ Volver</button>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>Crear combo</div>

      <input value={nombre} onChange={e=>setNombre(e.target.value)}
        placeholder="Nombre del combo (opcional)"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px 14px",
          color:Q.text,fontSize:16,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}/>

      {infList.length>0&&<select value={infCode} onChange={e=>setInfCode(e.target.value)}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${infCode?Q.violet:Q.border}`,borderRadius:10,padding:"11px 14px",
          color:infCode?Q.text:Q.muted,fontSize:15,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>
        <option value="">🌟 Asignar a influencer (opcional)</option>
        {infList.map(inf=>(
          <option key={inf.code} value={inf.code}>{inf.name} · {inf.codigo_ref}</option>
        ))}
      </select>}
      {infCode&&<input value={codigoSalida} onChange={e=>setCodigoSalida(e.target.value.toUpperCase())}
        placeholder="Código de salida del combo (ej: COMBODELDIA)"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px 14px",
          color:Q.text,fontSize:15,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}/>}

      {/* Compartir con subs e influencers */}
      {(destinatarios.subs.length>0||destinatarios.influencers.length>0)&&(
        <GCard style={{padding:12,marginBottom:10}}>
          <div style={{color:Q.violet2,fontWeight:700,fontSize:12,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}>📤 Compartir este combo</div>

          {destinatarios.subs.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
                  fontFamily:"'Space Grotesk',system-ui"}}>🏢 Sub-agencias</span>
                <button onClick={()=>{setTodosSubs(v=>!v); if(!todosSubs)setDestSubs([]);}}
                  style={{background:todosSubs?`${Q.green}22`:"rgba(255,255,255,0.05)",
                    border:`1px solid ${todosSubs?Q.green:Q.border}`,borderRadius:8,
                    padding:"4px 10px",cursor:"pointer",color:todosSubs?Q.green:Q.muted,
                    fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                  {todosSubs?"✓ Todas":"Todas"}</button>
              </div>
              {!todosSubs&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {destinatarios.subs.map(x=>(
                  <button key={x.code} onClick={()=>toggleDest(x.code,destSubs,setDestSubs)}
                    style={{background:destSubs.includes(x.code)?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                      border:`1px solid ${destSubs.includes(x.code)?Q.violet:Q.border}`,borderRadius:8,
                      padding:"6px 10px",cursor:"pointer",color:destSubs.includes(x.code)?Q.text:Q.muted,
                      fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
                    {destSubs.includes(x.code)?"✓ ":""}{x.name}</button>
                ))}
              </div>}
            </div>
          )}

          {destinatarios.influencers.length>0&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
                  fontFamily:"'Space Grotesk',system-ui"}}>🌟 Influencers</span>
                <button onClick={()=>{setTodosInfs(v=>!v); if(!todosInfs)setDestInfs([]);}}
                  style={{background:todosInfs?`${Q.green}22`:"rgba(255,255,255,0.05)",
                    border:`1px solid ${todosInfs?Q.green:Q.border}`,borderRadius:8,
                    padding:"4px 10px",cursor:"pointer",color:todosInfs?Q.green:Q.muted,
                    fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                  {todosInfs?"✓ Todos":"Todos"}</button>
              </div>
              {!todosInfs&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {destinatarios.influencers.map(x=>(
                  <button key={x.code} onClick={()=>toggleDest(x.code,destInfs,setDestInfs)}
                    style={{background:destInfs.includes(x.code)?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                      border:`1px solid ${destInfs.includes(x.code)?Q.violet:Q.border}`,borderRadius:8,
                      padding:"6px 10px",cursor:"pointer",color:destInfs.includes(x.code)?Q.text:Q.muted,
                      fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
                    {destInfs.includes(x.code)?"✓ ":""}{x.name}</button>
                ))}
              </div>}
            </div>
          )}
        </GCard>
      )}

      <div style={{display:"flex",alignItems:"center",gap:8,
        background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
        borderRadius:10,padding:"8px 12px",marginBottom:8}}>
        <span>🔍</span>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          placeholder="Buscar equipo..."
          style={{background:"transparent",border:"none",color:Q.text,fontSize:14,
            flex:1,minWidth:0,fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>

      {deportes&&deportes.length>0&&(
        <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:10}}>
          <button onClick={()=>setLiga(null)} style={{
            background:!liga?`${Q.cyan}22`:"rgba(255,255,255,0.04)",
            border:`1px solid ${!liga?Q.cyan:Q.border}`,borderRadius:20,
            padding:"6px 14px",cursor:"pointer",color:!liga?Q.cyan:Q.muted,
            fontSize:11,whiteSpace:"nowrap",flexShrink:0,
            fontFamily:"'Space Grotesk',system-ui"}}>Todas</button>
          {deportes.map(d=>(
            <button key={d.name} onClick={()=>setLiga(d.name)} style={{
              background:liga===d.name?`${Q.cyan}22`:"rgba(255,255,255,0.04)",
              border:`1px solid ${liga===d.name?Q.cyan:Q.border}`,borderRadius:20,
              padding:"6px 14px",cursor:"pointer",color:liga===d.name?Q.cyan:Q.muted,
              fontSize:11,whiteSpace:"nowrap",flexShrink:0,
              fontFamily:"'Space Grotesk',system-ui"}}>{d.icon} {d.name}</button>
          ))}
        </div>
      )}

      {!deportes&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando partidos...</div>}

      <div style={{maxHeight:"40vh",overflowY:"auto",marginBottom:12}}>
        {filtrados.map(d=>(
          <div key={d.name} style={{marginBottom:12}}>
            <div style={{color:Q.violet2,fontSize:12,fontWeight:700,marginBottom:6,
              fontFamily:"'Space Grotesk',system-ui"}}>{d.icon} {d.name}</div>
            {d.events.map(ev=>(
              <div key={ev.id||(ev.h+ev.a)} style={{marginBottom:8,paddingBottom:8,
                borderBottom:`1px solid ${Q.dim}`}}>
                <div style={{color:Q.text,fontSize:12,marginBottom:5,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ev.h} vs {ev.a}</div>
                <div style={{display:"flex",gap:5}}>
                  {[{l:ev.h+" gana",o:ev.odds?.L},
                    ev.odds?.E?{l:"Empate",o:ev.odds.E}:null,
                    {l:ev.a+" gana",o:ev.odds?.V}].filter(Boolean).filter(x=>x.o).map(opt=>(
                    <button key={opt.l} onClick={()=>toggle(ev,d.name,opt.l,opt.o)} style={{
                      flex:1,minWidth:0,
                      background:tiene(ev,opt.l)?`${Q.cyan}33`:"rgba(255,255,255,0.04)",
                      border:`1.5px solid ${tiene(ev,opt.l)?Q.cyan:Q.border}`,
                      borderRadius:8,padding:"6px 3px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{color:Q.muted,fontSize:8,overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{opt.l}</div>
                      <div style={{color:tiene(ev,opt.l)?Q.cyan:Q.text,fontWeight:700,
                        fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>{opt.o}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {msg&&<div style={{fontSize:12,marginBottom:10,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}

      {picks.length>0&&(
        <GCard glow={Q.violet} style={{padding:14,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{color:Q.muted,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>{picks.length} picks</span>
            <span style={{color:Q.gold,fontWeight:900,fontSize:18,
              fontFamily:"'Space Grotesk',system-ui"}}>{fmt(totOdd)}x</span>
          </div>
          <Btn label={guardando?"GUARDANDO...":"Guardar combo"} onClick={guardar}
            color={Q.violet} full size="lg" disabled={guardando}/>
        </GCard>
      )}
    </div>
  );
}

function MisCombosAgencia({ agencia, onVolver, onSesionExpirada }){
  const [combos,setCombos]=useState(null);
  const [err,setErr]=useState("");
  const [abierto,setAbierto]=useState(null);
  const [cobrando,setCobrando]=useState(null);
  const [cliente,setCliente]=useState("");
  const [monto,setMonto]=useState(2000);
  const [okMsg,setOkMsg]=useState("");

  const cargar=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/combos`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok) throw new Error(`Error ${r.status}`);
      setCombos((await r.json()).combos||[]);
    }catch(e){ setErr(e.message); setCombos([]); }
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[]);

  const borrar=async(id)=>{
    try{
      await fetch(`${API_URL}/api/agencias/me/combos/${id}`,
        {method:"DELETE",headers:authHeaders(agencia.token)});
      cargar();
    }catch(e){}
  };

  // normaliza un pick venga como {h,a} o {home,away}
  const pk=(p)=>({
    home:p.home||p.h||"", away:p.away||p.a||"",
    sel:p.sel||p.label||"", odd:parseFloat(p.odd)||1,
    sport:p.sport||"", event_id:p.event_id||null, sport_key:p.sport_key||null,
  });

  const cobrarCombo=async(combo)=>{
    if(cobrando) return;
    setCobrando(combo.id); setOkMsg(""); setErr("");
    try{
      const picks=(combo.picks||[]).map(pk);
      const r=await fetch(`${API_URL}/api/betslip`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({picks, cliente:cliente||null, agencia_code:agencia.code}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const creado=await r.json();
      const pago=await payBetslip(creado.code, monto, agencia.token);
      printTicket({
        code:creado.code, agencia:agencia.code,
        user:cliente||"Cliente mostrador", created_at:nowStr(), expires_at:expires24(),
        picks:picks.map(p=>({home:p.home,away:p.away,sel:p.sel,odd:p.odd,sport:p.sport})),
        stake:pago.stake, odd_total:pago.odd_total, potential_win:pago.potential_win,
      },"apuesta");
      setOkMsg(`✅ Combo cobrado · ${creado.code} · ret ${ars(pago.potential_win)}`);
      setCliente("");
    }catch(e){ setErr("⚠️ "+e.message); }
    setCobrando(null);
  };

  return(
    <div>
      <button onClick={onVolver} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:22,cursor:"pointer",marginBottom:6,padding:0}}>‹ Volver</button>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:12,
        fontFamily:"'Space Grotesk',system-ui"}}>Mis combos</div>

      <AlertaError mensaje={err}/>
      {okMsg&&<div style={{fontSize:12,marginBottom:10,color:Q.green,
        fontFamily:"'Space Grotesk',system-ui"}}>{okMsg}</div>}
      {combos===null&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {combos&&combos.length===0&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{fontSize:26,marginBottom:8}}>📋</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>
            Todavía no hay combos</div>
        </GCard>
      )}
      {(combos||[]).map(c=>{
        const abierta=abierto===c.id;
        const picks=(c.picks||[]).map(pk);
        const esCasa=c.de_la_casa||c.origen==="admin";
        return(
          <GCard key={c.id} glow={esCasa?Q.gold:undefined}
            style={{padding:"12px 14px",marginBottom:8}}>
            <div onClick={()=>setAbierto(abierta?null:c.id)}
              style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",gap:8,cursor:"pointer"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:600,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre}
                  {esCasa&&<span style={{background:`${Q.gold}22`,border:`1px solid ${Q.gold}`,
                    borderRadius:10,padding:"1px 7px",fontSize:9,color:Q.gold,marginLeft:6}}>🏛️ De la casa</span>}</div>
                <div style={{color:Q.muted,fontSize:11}}>
                  {picks.length} picks · {fmt(c.odd_total)}x</div>
              </div>
              <span style={{color:Q.muted,fontSize:16}}>{abierta?"▾":"›"}</span>
            </div>

            {abierta&&(
              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
                {picks.map((p,j)=>(
                  <div key={j} style={{display:"flex",justifyContent:"space-between",
                    padding:"4px 0",borderBottom:j<picks.length-1?`1px solid ${Q.dim}`:"none"}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{color:Q.text,fontSize:12,fontWeight:600,
                        fontFamily:"'Space Grotesk',system-ui"}}>{p.sel}</div>
                      <div style={{color:Q.muted,fontSize:9}}>{p.home} vs {p.away}</div>
                    </div>
                    <span style={{color:Q.cyan,fontWeight:700,fontSize:13,
                      fontFamily:"'Space Grotesk',system-ui"}}>{fmt(p.odd)}</span>
                  </div>
                ))}
                {/* Ganancias */}
                <div style={{marginTop:8}}>
                  <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,
                    marginBottom:4,fontFamily:"'Space Grotesk',system-ui"}}>Ganancias</div>
                  {[2000,5000,10000].map(m=>(
                    <div key={m} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}>
                      <span style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>Apostás {ars(m)}</span>
                      <span style={{color:Q.green,fontWeight:700,fontSize:12,
                        fontFamily:"'Space Grotesk',system-ui"}}>→ {ars(Math.round(m*(c.odd_total||1)))}</span>
                    </div>
                  ))}
                </div>

                {/* Cobrar para un cliente */}
                <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${Q.violet}44`}}>
                  <input value={cliente} onChange={e=>setCliente(e.target.value)}
                    placeholder="Cliente (opcional)"
                    style={{width:"100%",background:"rgba(255,255,255,0.05)",
                      border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
                      color:Q.text,fontSize:16,marginBottom:8,
                      fontFamily:"'Space Grotesk',system-ui"}}/>
                  <div style={{display:"flex",gap:6,marginBottom:8}}>
                    {[2000,5000,10000,20000].map(m=>(
                      <button key={m} onClick={()=>setMonto(m)} style={{flex:1,
                        background:monto===m?`${Q.gold}22`:"rgba(255,255,255,0.04)",
                        border:`1px solid ${monto===m?Q.gold:Q.border}`,borderRadius:8,
                        padding:"7px 4px",cursor:"pointer",color:monto===m?Q.gold:Q.muted,
                        fontSize:10,fontWeight:monto===m?700:400,
                        fontFamily:"'Space Grotesk',system-ui"}}>{ars(m)}</button>
                    ))}
                  </div>
                  <Btn label={cobrando===c.id?"COBRANDO...":`💵 Cobrar ${ars(monto)}`}
                    onClick={()=>cobrarCombo(c)} color={Q.green} full disabled={cobrando===c.id}/>
                  {!esCasa&&(
                    <button onClick={()=>borrar(c.id)} style={{width:"100%",marginTop:8,
                      background:`${Q.red}18`,border:`1px solid ${Q.red}`,borderRadius:8,
                      padding:"8px",cursor:"pointer",color:Q.red,fontSize:12,fontWeight:700,
                      fontFamily:"'Space Grotesk',system-ui"}}>Borrar combo</button>
                  )}
                </div>
              </div>
            )}
          </GCard>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// COMBOS IA — sugerencias automáticas + armado manual
// ═══════════════════════════════════════════════════════════════
function CombosIA({ agencia, onSesionExpirada }){
  const [modo,setModo]=useState("ver");   // ver | crear | mios
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

  // Los sub-modos se muestran DESPUÉS de declarar todos los hooks
  // (si no, React tira el error #300 por número de hooks distinto).
  if(modo==="crear")
    return <CrearComboAgencia agencia={agencia} onSesionExpirada={onSesionExpirada}
      onVolver={()=>setModo("ver")}/>;
  if(modo==="mios")
    return <MisCombosAgencia agencia={agencia} onSesionExpirada={onSesionExpirada}
      onVolver={()=>setModo("ver")}/>;

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
          agencia_code: agencia.code,
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

      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <Btn label="+ Crear combo" onClick={()=>setModo("crear")}
          color={Q.violet} full/>
        <Btn label="Mis combos" onClick={()=>setModo("mios")}
          outline color={Q.cyan} full/>
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
  const [verBloqueos,setVerBloqueos]=useState(false);

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
        <Btn label="🔒" onClick={()=>setVerBloqueos(true)} color={Q.red} size="sm"/>
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

      {verBloqueos&&<BloqueosRama agencia={agencia}
        onCerrar={()=>setVerBloqueos(false)} onSesionExpirada={onSesionExpirada}/>}


    </div>
  );
}

function ImpresionesRama({ agencia, onCerrar, onSesionExpirada }){
  const [data,setData]=useState(null);
  useEffect(()=>{
    fetch(`${API_URL}/api/agencias/me/historial/impresiones`,{headers:authHeaders(agencia.token)})
      .then(r=>{ if(r.status===401){ onSesionExpirada(); return {impresiones:[]}; } return r.json(); })
      .then(d=>setData(d.impresiones||[])).catch(()=>setData([]));
  // eslint-disable-next-line
  },[]);
  const tipoTxt={ticket:"Ticket",apuesta:"Apuesta",cobro:"Cobro",cierre:"Cierre de caja",combo:"Combo"};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",
      zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
        borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
        maxHeight:"88vh",overflowY:"auto",padding:20,
        border:`1px solid ${Q.border}`,borderBottom:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}>🖨️ Impresiones de mi rama</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {!data&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {data&&data.length===0&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Todavía no hubo impresiones</div>}
        {(data||[]).map((im,i)=>(
          <GCard key={i} style={{padding:"10px 13px",marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui"}}>{tipoTxt[im.tipo]||im.tipo}
                  {im.referencia?<span style={{color:Q.cyan,fontWeight:400}}> · {im.referencia}</span>:null}</div>
                <div style={{color:Q.muted,fontSize:10}}>{im.agencia} · por {im.quien} · {im.fecha}</div>
              </div>
              <span style={{fontSize:16}}>🖨️</span>
            </div>
          </GCard>
        ))}
      </div>
    </div>
  );
}

function BloqueosRama({ agencia, onCerrar, onSesionExpirada }){
  const [data,setData]=useState(null);
  useEffect(()=>{
    fetch(`${API_URL}/api/agencias/me/bloqueos`,{headers:authHeaders(agencia.token)})
      .then(r=>{ if(r.status===401){ onSesionExpirada(); return {bloqueos:[]}; } return r.json(); })
      .then(d=>setData(d.bloqueos||[])).catch(()=>setData([]));
  // eslint-disable-next-line
  },[]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",
      zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
        borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
        maxHeight:"88vh",overflowY:"auto",padding:20,
        border:`1px solid ${Q.border}`,borderBottom:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}>🔒 Bloqueos de mi rama</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {!data&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {data&&data.length===0&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Todavía no hubo bloqueos</div>}
        {(data||[]).map((b,i)=>{
          const esBloqueo=b.accion==="bloqueo";
          return(
            <GCard key={i} glow={esBloqueo?Q.red:Q.green} style={{padding:"11px 13px",marginBottom:6}}>
              <div style={{color:esBloqueo?Q.red:Q.green,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {esBloqueo?"🔒 Bloqueó":"✅ Desbloqueó"}{" "}
                <span style={{color:Q.text}}>{b.nombre}</span>
                <span style={{color:Q.muted,fontWeight:400}}> ({b.tipo})</span></div>
              <div style={{color:Q.muted,fontSize:10,marginTop:2}}>por {b.quien} · {b.fecha}</div>
              {b.motivo&&<div style={{color:Q.dim,fontSize:11,marginTop:4,fontStyle:"italic",
                fontFamily:"'Space Grotesk',system-ui"}}>"{b.motivo}"</div>}
            </GCard>
          );
        })}
      </div>
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

function OtorgarBonoCliente({ agencia, userId }){
  const [bonos,setBonos]=useState([]);
  const [sel,setSel]=useState("");
  const [montoCarga,setMontoCarga]=useState("");
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);
  const [abierto,setAbierto]=useState(false);

  useEffect(()=>{
    if(!abierto) return;
    fetch(`${API_URL}/api/agencias/me/bonos`,{headers:authHeaders(agencia.token)})
      .then(r=>r.ok?r.json():{bonos:[]}).then(d=>setBonos(d.bonos||[])).catch(()=>{});
  },[abierto,agencia.token]);

  const bonoSel = bonos.find(b=>String(b.id)===String(sel));
  const otorgar=async()=>{
    if(!sel){ setMsg("Elegí un bono"); return; }
    setProc(true); setMsg("");
    try{
      const body={user_id:userId,bono_id:parseInt(sel,10)};
      if(bonoSel&&bonoSel.tipo==="carga") body.monto_carga=parseInt(montoCarga||"0",10);
      const r=await fetch(`${API_URL}/api/agencias/me/otorgar-bono`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify(body),
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setMsg(`✅ Bono otorgado · ${ars(d.monto)}`); setSel(""); setMontoCarga(""); }
      else setMsg("⚠️ "+(d.detail||"No se pudo"));
    }catch(e){ setMsg("⚠️ Error"); }
    setProc(false);
  };

  if(!abierto) return(
    <>
      <div style={{height:8}}/>
      <Btn label="🎁 Otorgar bono" onClick={()=>setAbierto(true)} color={Q.gold} outline full/>
    </>
  );

  return(
    <div style={{marginTop:10,padding:12,background:`${Q.gold}0C`,
      border:`1px solid ${Q.gold}55`,borderRadius:10}}>
      <div style={{color:Q.gold,fontWeight:700,fontSize:13,marginBottom:8,
        fontFamily:"'Space Grotesk',system-ui"}}>🎁 Otorgar bono</div>
      {bonos.length===0?(
        <div style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
          No hay bonos habilitados para tu agencia.</div>
      ):(
        <>
          <select value={sel} onChange={e=>setSel(e.target.value)}
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:9,padding:"10px",color:Q.text,
              fontSize:13,marginBottom:8,fontFamily:"'Space Grotesk',system-ui"}}>
            <option value="">Elegí un bono</option>
            {bonos.map(b=>(<option key={b.id} value={b.id}>
              {b.nombre} ({b.tipo==="bienvenida"?ars(b.monto_fijo||0):`${b.porcentaje}%`})</option>))}
          </select>
          {bonoSel&&bonoSel.tipo==="carga"&&(
            <input value={montoCarga} onChange={e=>setMontoCarga(e.target.value.replace(/\D/g,""))}
              placeholder="Monto de la carga" inputMode="numeric"
              style={{width:"100%",background:"rgba(255,255,255,0.05)",
                border:`1px solid ${Q.border}`,borderRadius:9,padding:"10px",color:Q.text,
                fontSize:13,marginBottom:8,fontFamily:"'Space Grotesk',system-ui"}}/>
          )}
          <div style={{display:"flex",gap:6}}>
            <Btn label="Cerrar" onClick={()=>{setAbierto(false);setMsg("");}} outline color={Q.muted} full/>
            <Btn label={proc?"...":"Otorgar"} onClick={otorgar} color={Q.gold} full disabled={proc}/>
          </div>
        </>
      )}
      {msg&&<div style={{fontSize:12,marginTop:8,textAlign:"center",
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </div>
  );
}

function FichaCliente({ agencia, user, onVolver, onSesionExpirada }){
  const [saldo,setSaldo]=useState(user.saldo);
  const [resetOpen,setResetOpen]=useState(false);
  const [tgLink,setTgLink]=useState(null);
  const [tgProc,setTgProc]=useState(false);
  const [tgCopiado,setTgCopiado]=useState(false);

  const conectarTelegram=async()=>{
    setTgProc(true);
    try{
      const r=await fetch(`${API_URL}/api/cliente/${user.id}/vincular-telegram`,{
        method:"POST",headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok){ const d=await r.json(); setTgLink(d); }
    }catch(e){}
    setTgProc(false);
  };
  const [movs,setMovs]=useState(null);
  const [monto,setMonto]=useState(1000);
  const [modo,setModo]=useState("carga");   // carga | retiro
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);
  const [ficha,setFicha]=useState(null);     // rendimiento + apuestas + bloqueo
  const [motivo,setMotivo]=useState("");
  const [confirmBloq,setConfirmBloq]=useState(false);

  const cargarFicha=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/clientes/${user.id}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setFicha(await r.json());
    }catch(e){}
  };

  const toggleBloqueo=async()=>{
    const bloquear=!ficha?.bloqueado;
    if(bloquear && !confirmBloq){ setConfirmBloq(true); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/bloquear`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({tipo:"cliente",objetivo:user.id,bloquear,motivo}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setConfirmBloq(false); setMotivo("");
      setMsg(bloquear?"🔒 Cliente bloqueado":"✅ Cliente desbloqueado");
      cargarFicha();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const cargarMovs=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/usuarios/${user.id}/movimientos`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok){ const d=await r.json(); setMovs(d.movimientos||[]); setSaldo(d.saldo); }
    }catch(e){ setMovs([]); }
  };
  useEffect(()=>{ cargarMovs(); cargarFicha(); // eslint-disable-next-line
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
        {ficha?.bloqueado&&(
          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`,
            color:Q.red,fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
            🔒 Bloqueado por {ficha.bloqueado_por||"—"}
            {ficha.bloqueado_motivo?` · ${ficha.bloqueado_motivo}`:""}
          </div>
        )}
      </GCard>

      {/* Rendimiento */}
      {ficha&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          <GCard style={{padding:"9px",textAlign:"center"}}>
            <div style={{color:Q.cyan,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(ficha.rendimiento.apostado)}</div>
            <div style={{color:Q.muted,fontSize:8}}>Apostado</div>
          </GCard>
          <GCard style={{padding:"9px",textAlign:"center"}}>
            <div style={{color:Q.violet2,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(ficha.rendimiento.ganado)}</div>
            <div style={{color:Q.muted,fontSize:8}}>Ganado</div>
          </GCard>
          <GCard style={{padding:"9px",textAlign:"center"}}>
            <div style={{color:ficha.rendimiento.neto_cliente>=0?Q.green:Q.red,
              fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>
              {ars(ficha.rendimiento.neto_cliente)}</div>
            <div style={{color:Q.muted,fontSize:8}}>Neto</div>
          </GCard>
        </div>
      )}
      {ficha&&(
        <div style={{display:"flex",gap:8,marginBottom:12,fontSize:11,
          fontFamily:"'Space Grotesk',system-ui"}}>
          <span style={{color:Q.green}}>{ficha.rendimiento.ganadas} ganadas</span>
          <span style={{color:Q.red}}>{ficha.rendimiento.perdidas} perdidas</span>
          <span style={{color:Q.amber}}>{ficha.rendimiento.pendientes} pendientes</span>
        </div>
      )}

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

      {/* Bloqueo */}
      {ficha&&(
        <GCard glow={ficha.bloqueado?Q.green:Q.red} style={{padding:14,marginBottom:12}}>
          {ficha.bloqueado?(
            <Btn label={proc?"...":"Desbloquear cliente"} onClick={toggleBloqueo}
              color={Q.green} full disabled={proc}/>
          ):confirmBloq?(
            <div>
              <div style={{color:Q.red,fontWeight:700,fontSize:13,marginBottom:6,
                fontFamily:"'Space Grotesk',system-ui"}}>¿Bloquear a {user.nombre}?</div>
              <div style={{color:Q.muted,fontSize:11,marginBottom:8,
                fontFamily:"'Space Grotesk',system-ui"}}>
                No va a poder apostar hasta que lo desbloquees.</div>
              <input value={motivo} onChange={e=>setMotivo(e.target.value)}
                placeholder="Motivo del bloqueo"
                style={{width:"100%",background:"rgba(255,255,255,0.05)",
                  border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
                  color:Q.text,fontSize:14,marginBottom:10,
                  fontFamily:"'Space Grotesk',system-ui"}}/>
              <div style={{display:"flex",gap:8}}>
                <Btn label="Cancelar" onClick={()=>{setConfirmBloq(false);setMotivo("");}}
                  outline color={Q.muted} full/>
                <Btn label="Sí, bloquear" onClick={toggleBloqueo} color={Q.red}
                  full disabled={proc}/>
              </div>
            </div>
          ):(
            <Btn label="🔒 Bloquear cliente" onClick={toggleBloqueo}
              color={Q.red} outline full disabled={proc}/>
          )}
          <div style={{height:8}}/>
          <Btn label="🔑 Resetear contraseña" onClick={()=>setResetOpen(true)}
            color={Q.amber} outline full/>
          <div style={{height:8}}/>
          <Btn label={tgProc?"...":"📲 Conectar Telegram"} onClick={conectarTelegram}
            color={Q.cyan} outline full disabled={tgProc}/>
          {tgLink&&(
            <div style={{marginTop:10,padding:12,background:`${Q.cyan}11`,
              border:`1px solid ${Q.cyan}`,borderRadius:10}}>
              <div style={{color:Q.text,fontSize:12,marginBottom:8,lineHeight:1.5,
                fontFamily:"'Space Grotesk',system-ui"}}>
                Mandale este link al cliente. Cuando lo abra en Telegram, su cuenta
                de mostrador y su Telegram quedan unificadas (saldo sumado). Vence en 24hs.</div>
              <div style={{display:"flex",gap:6}}>
                <input readOnly value={tgLink.link} style={{flex:1,minWidth:0,
                  background:"rgba(0,0,0,0.3)",border:`1px solid ${Q.border}`,borderRadius:8,
                  padding:"8px 10px",color:Q.cyan,fontSize:11,
                  fontFamily:"'Space Grotesk',system-ui"}}/>
                <button onClick={()=>{try{navigator.clipboard.writeText(tgLink.link);
                  setTgCopiado(true);setTimeout(()=>setTgCopiado(false),1500);}catch(e){}}}
                  style={{background:`${Q.cyan}22`,border:`1px solid ${Q.cyan}`,borderRadius:8,
                  padding:"8px 12px",cursor:"pointer",color:Q.cyan,fontSize:11,fontWeight:700,
                  fontFamily:"'Space Grotesk',system-ui"}}>{tgCopiado?"✓":"Copiar"}</button>
              </div>
            </div>
          )}
          <OtorgarBonoCliente agencia={agencia} userId={user.id}/>
        </GCard>
      )}
      {resetOpen&&<ResetPassword agencia={agencia} userId={user.id}
        nombre={user.nombre_completo||user.username||"el cliente"}
        onCerrar={()=>setResetOpen(false)}/>}

      {/* Apuestas */}
      {ficha&&ficha.apuestas.length>0&&(
        <div style={{marginBottom:12}}>
          <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
            fontFamily:"'Space Grotesk',system-ui",marginBottom:8,marginLeft:4}}>
            Últimas apuestas</div>
          {ficha.apuestas.slice(0,10).map((b,i)=>{
            const est={won:Q.green,ganada:Q.green,lost:Q.red,perdida:Q.red,
              pending:Q.amber,pendiente:Q.amber,active:Q.cyan}[(b.status||"").toLowerCase()]||Q.muted;
            return(
              <GCard key={i} style={{padding:"9px 12px",marginBottom:5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:Q.text,fontSize:12,fontWeight:600,
                      fontFamily:"'Space Grotesk',system-ui"}}>{b.code}</div>
                    <div style={{color:Q.muted,fontSize:10}}>
                      {ars(b.stake)} · {fmt(b.odd)}x · {b.fecha}</div>
                  </div>
                  <span style={{color:est,fontSize:11,fontWeight:700,
                    fontFamily:"'Space Grotesk',system-ui"}}>{b.status}</span>
                </div>
              </GCard>
            );
          })}
        </div>
      )}

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

function SaldoCC({ agencia, onSesionExpirada }){
  const [data,setData]=useState(null);
  const [err,setErr]=useState("");

  const cargar=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/cc`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setData(await r.json());
      else setErr("No se pudo cargar el saldo");
    }catch(e){ setErr("Sin conexión"); }
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[]);

  const tipoTxt={carga_admin:"Carga del admin",retiro_admin:"Descuento admin",
    carga_cliente:"Crédito a cliente",retiro_cliente:"Retiro de cliente",
    pago_premio:"Premio pagado",transferencia:"A sub-agencia",
    recibido:"Recibido"};
  const tipoColor={carga_admin:Q.green,recibido:Q.green,pago_premio:Q.green,
    retiro_cliente:Q.cyan,carga_cliente:Q.amber,transferencia:Q.amber,
    retiro_admin:Q.red};

  if(err) return <div style={{color:Q.red,padding:20,textAlign:"center",
    fontFamily:"'Space Grotesk',system-ui"}}>{err}</div>;
  if(!data) return <div style={{color:Q.muted,padding:20,textAlign:"center",
    fontFamily:"'Space Grotesk',system-ui"}}>Cargando saldo...</div>;

  return(
    <div>
      <GCard glow={data.saldo_cc>=0?Q.green:Q.red} style={{padding:18,marginBottom:14,
        background:`linear-gradient(135deg,${data.saldo_cc>=0?Q.green:Q.red}12,${Q.violet}06)`}}>
        <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:2,
          fontFamily:"'Space Grotesk',system-ui",marginBottom:4}}>Tu saldo disponible</div>
        <div style={{color:data.saldo_cc>=0?Q.green:Q.red,fontWeight:900,fontSize:32,
          fontFamily:"'Space Grotesk',system-ui"}}>
          {ars(data.saldo_cc)} <span style={{fontSize:16}}>{data.moneda}</span></div>
        <div style={{color:Q.dim,fontSize:11,marginTop:6,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Con este saldo das crédito a tus clientes. Si se agota, pedile una carga
          a tu agencia superior.
        </div>
      </GCard>

      <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
        fontFamily:"'Space Grotesk',system-ui",marginBottom:8,marginLeft:4}}>
        Movimientos</div>
      {data.movimientos.length===0&&(
        <GCard style={{padding:20,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12,
            fontFamily:"'Space Grotesk',system-ui"}}>Sin movimientos todavía</div>
        </GCard>
      )}
      {data.movimientos.map((m,i)=>(
        <GCard key={i} style={{padding:"10px 13px",marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{color:tipoColor[m.tipo]||Q.text,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>{tipoTxt[m.tipo]||m.tipo}</div>
              <div style={{color:Q.muted,fontSize:10}}>
                {m.fecha}{m.detalle?` · ${m.detalle}`:""}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{color:m.monto>=0?Q.green:Q.amber,fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {m.monto>=0?"+":""}{ars(m.monto)}</div>
              <div style={{color:Q.dim,fontSize:9}}>saldo {ars(m.saldo)}</div>
            </div>
          </div>
        </GCard>
      ))}
    </div>
  );
}

function BonosAgencia({ agencia, onSesionExpirada }){
  const [data,setData]=useState(null);
  const [err,setErr]=useState("");
  const cargar=async()=>{
    setErr("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/bonos`,
        { headers: authHeaders(agencia.token) });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok) throw new Error(`Error ${r.status}`);
      setData(await r.json());
    }catch(e){ setErr(e.message==="Failed to fetch"?"Sin conexión":e.message); }
  };
  useEffect(()=>{ cargar(); /* eslint-disable-next-line */ },[]);

  const bonos = data?.bonos||[];
  const res = data?.resumen||{};

  return(
    <div>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:4,
        fontFamily:"'Space Grotesk',system-ui"}}>🎁 Bonos activos</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:14,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Bonos que el admin habilitó para tu agencia. Los otorgás a tus clientes.</div>
      <AlertaError mensaje={err}/>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[["Otorgados",res.otorgados||0,Q.cyan],["Activos",res.activos||0,Q.gold],
          ["Liberados",res.liberados||0,Q.green]].map(([l,v,c],i)=>(
          <GCard key={i} glow={c} style={{padding:"10px 6px",textAlign:"center"}}>
            <div style={{color:c,fontWeight:800,fontSize:16,
              fontFamily:"'Space Grotesk',system-ui"}}>{v}</div>
            <div style={{color:Q.muted,fontSize:9}}>{l}</div>
          </GCard>
        ))}
      </div>

      {bonos.length===0&&(
        <GCard style={{padding:28,textAlign:"center"}}>
          <div style={{fontSize:30,marginBottom:8}}>🎁</div>
          <div style={{color:Q.muted,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>
            El admin todavía no habilitó bonos para tu agencia</div>
        </GCard>
      )}
      {bonos.map(b=>(
        <GCard key={b.id} glow={Q.gold} style={{padding:14,marginBottom:8}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>{b.nombre}</div>
          <div style={{color:Q.muted,fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
            {b.tipo==="bienvenida"
              ? `Bono de bienvenida · ${ars(b.monto_fijo||0)}`
              : `Bono por carga · ${b.porcentaje||0}% (máx ${ars(b.tope||0)})`}
          </div>
          <div style={{color:Q.cyan,fontSize:11,marginTop:2,
            fontFamily:"'Space Grotesk',system-ui"}}>
            Rollover: apostar x{b.rollover||0} antes de retirar</div>
          <div style={{color:Q.dim,fontSize:10,marginTop:6,
            fontFamily:"'Space Grotesk',system-ui"}}>
            Para otorgarlo, entrá a la ficha del cliente en 👤 Clientes.</div>
        </GCard>
      ))}
    </div>
  );
}

function HistorialCashout({ agencia, onSesionExpirada }){
  const [lista,setLista]=useState(null);
  const [err,setErr]=useState("");
  const [cargando,setCargando]=useState(true);
  const cargar=async()=>{
    setCargando(true); setErr("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/historial/cashout`,
        { headers: authHeaders(agencia.token) });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok) throw new Error(`Error ${r.status}`);
      const d=await r.json();
      setLista(d.cashouts||[]);
    }catch(e){ setErr(e.message==="Failed to fetch"?"Sin conexión":e.message); setLista([]); }
    setCargando(false);
  };
  useEffect(()=>{ cargar(); /* eslint-disable-next-line */ },[]);

  const items = lista||[];
  const totalPagado = items.reduce((a,c)=>a+(c.valor||0),0);
  const rotulos={cashed_out:"Pagado ✓",cashout_pending:"Pend. caja"};
  const colores={cashed_out:Q.green,cashout_pending:Q.amber};

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,
          fontFamily:"'Space Grotesk',system-ui"}}>💰 Cash outs de la rama</div>
        <Btn label={cargando?"...":"Actualizar"} onClick={cargar} outline color={Q.muted} size="sm"/>
      </div>
      <AlertaError mensaje={err}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {[{l:"Cash outs",v:items.length,c:Q.cyan},
          {l:"Total pagado",v:ars(totalPagado),c:Q.gold}].map((x,i)=>(
          <GCard key={i} glow={x.c} style={{padding:"10px 12px",textAlign:"center"}}>
            <div style={{color:x.c,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{x.v}</div>
            <div style={{color:Q.muted,fontSize:9}}>{x.l}</div>
          </GCard>
        ))}
      </div>
      {cargando&&<GCard style={{padding:20,textAlign:"center"}}>
        <div style={{color:Q.muted,fontSize:12}}>Cargando...</div></GCard>}
      {!cargando&&items.length===0&&!err&&(
        <GCard style={{padding:28,textAlign:"center"}}>
          <div style={{fontSize:30,marginBottom:8}}>💰</div>
          <div style={{color:Q.muted,fontSize:13}}>Todavía no hay cash outs en tu rama</div>
        </GCard>
      )}
      {items.map((c,i)=>(
        <GCard key={c.code+i} style={{padding:"12px 14px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{color:Q.cyan,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{c.code}</div>
            <div style={{background:`${colores[c.estado]||Q.muted}22`,
              border:`1px solid ${colores[c.estado]||Q.muted}`,borderRadius:10,
              padding:"2px 10px",color:colores[c.estado]||Q.muted,fontSize:10,fontWeight:700,
              fontFamily:"'Space Grotesk',system-ui"}}>{rotulos[c.estado]||c.estado}</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
            <span style={{color:Q.muted}}>{c.cliente} · {c.agencia}</span>
            <span style={{color:Q.gold,fontWeight:700,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(c.valor)} {c.moneda}</span>
          </div>
          <div style={{color:Q.dim,fontSize:9,marginTop:2}}>{c.fecha}
            {c.pagado_por?` · pagó ${c.pagado_por}`:""}</div>
        </GCard>
      ))}
    </div>
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
  const [desde,setDesde]=useState(hoyISO);
  const [hasta,setHasta]=useState(hoyISO);
  const [res,setRes]=useState(null);
  const [err,setErr]=useState("");
  const [cargando,setCargando]=useState(false);
  const [vista,setVista]=useState("resumen");   // resumen | movs | apuestas
  const [movs,setMovs]=useState(null);
  const [apuestas,setApuestas]=useState(null);
  const [apAbierta,setApAbierta]=useState(null);
  const [clientesR,setClientesR]=useState([]);
  const [filtroCli,setFiltroCli]=useState("");
  const [impresiones,setImpresiones]=useState(null);
  const [combos,setCombos]=useState(null);

  const cargarCombos=async()=>{
    try{
      const r=await fetch(
        `${API_URL}/api/agencias/me/historial/combos?desde=${desde}&hasta=${hasta}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setCombos((await r.json()).combos||[]);
    }catch(e){}
  };

  const cargarImpresiones=async()=>{
    try{
      const r=await fetch(
        `${API_URL}/api/agencias/me/historial/impresiones?desde=${desde}&hasta=${hasta}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setImpresiones((await r.json()).impresiones||[]);
    }catch(e){}
  };

  useEffect(()=>{
    fetch(`${API_URL}/api/agencias/me/clientes-rama`,{headers:authHeaders(agencia.token)})
      .then(r=>r.ok?r.json():{clientes:[]}).then(d=>setClientesR(d.clientes||[]))
      .catch(()=>{});
  // eslint-disable-next-line
  },[]);

  const cargarMovs=async()=>{
    try{
      const q=`desde=${desde}&hasta=${hasta}`+(filtroCli?`&cliente=${filtroCli}`:"");
      const r=await fetch(
        `${API_URL}/api/agencias/me/historial/movimientos?${q}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setMovs((await r.json()).movimientos||[]);
    }catch(e){}
  };
  const cargarApuestas=async()=>{
    try{
      const q=`desde=${desde}&hasta=${hasta}`+(filtroCli?`&cliente=${filtroCli}`:"");
      const r=await fetch(
        `${API_URL}/api/agencias/me/historial/apuestas?${q}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setApuestas((await r.json()).apuestas||[]);
    }catch(e){}
  };
  useEffect(()=>{
    if(vista==="movs") cargarMovs();
    if(vista==="apuestas") cargarApuestas();
    if(vista==="combos") cargarCombos();
    if(vista==="impresiones") cargarImpresiones();
  // eslint-disable-next-line
  },[vista,desde,hasta,filtroCli]);

  const rango=(t)=>{
    const hoy=new Date(); const iso=d=>d.toISOString().slice(0,10);
    let d=new Date();
    if(t==="hoy") d=new Date();
    else if(t==="semana") d.setDate(hoy.getDate()-7);
    else if(t==="mes") d.setMonth(hoy.getMonth()-1);
    setDesde(iso(d)); setHasta(iso(hoy));
  };

  const cargar=async()=>{
    setCargando(true); setErr("");
    try{
      const q=`desde=${desde}&hasta=${hasta}`+(filtroCli?`&cliente=${filtroCli}`:"");
      const r=await fetch(
        `${API_URL}/api/agencias/me/cierre?${q}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok) throw new Error(`Error ${r.status}`);
      setRes(await r.json());
    }catch(e){ setErr(e.message==="Failed to fetch"?"Sin conexión":e.message); }
    setCargando(false);
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[desde,hasta,filtroCli]);

  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["resumen","📊 Resumen"],["movs","💸 Movs"],["apuestas","🎫 Apuestas"],["combos","⚡ Combos"],["impresiones","🖨️ Impres."]].map(([k,l])=>(
          <button key={k} onClick={()=>setVista(k)} style={{flex:1,
            background:vista===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1px solid ${vista===k?Q.violet:Q.border}`,borderRadius:9,
            padding:"9px",cursor:"pointer",color:vista===k?Q.cyan:Q.muted,
            fontSize:13,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>

      {/* Períodos rápidos */}
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["hoy","Hoy"],["semana","7 días"],["mes","30 días"]].map(([k,l])=>(
          <button key={k} onClick={()=>rango(k)} style={{flex:1,
            background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px",cursor:"pointer",color:Q.cyan,
            fontSize:12,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>

      {/* Fechas a mano */}
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"8px 10px",
            color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}/>
        <span style={{color:Q.muted}}>→</span>
        <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"8px 10px",
            color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>

      {clientesR.length>0&&(
        <select value={filtroCli} onChange={e=>setFiltroCli(e.target.value)}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${filtroCli?Q.gold:Q.border}`,borderRadius:9,
            padding:"9px 12px",color:Q.text,fontSize:14,marginBottom:12,
            fontFamily:"'Space Grotesk',system-ui"}}>
          <option value="">— Toda la rama —</option>
          {clientesR.map(c=>(
            <option key={c.id} value={c.id}>👤 {c.nombre} ({c.agencia})</option>
          ))}
        </select>
      )}
      {filtroCli&&<div style={{color:Q.gold,fontSize:11,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Viendo solo ese cliente ·{" "}
        <span onClick={()=>setFiltroCli("")}
          style={{color:Q.muted,textDecoration:"underline",cursor:"pointer"}}>ver toda la rama</span>
      </div>}

      <AlertaError mensaje={err}/>
      {cargando&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Calculando...</div>}

      {vista==="resumen"&&res&&(
        <div>
          {/* Resumen consolidado de la rama */}
          <GCard glow={Q.green} style={{padding:16,marginBottom:12,
            background:`linear-gradient(135deg,${Q.green}12,${Q.violet}06)`}}>
            <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
              letterSpacing:1,marginBottom:10,
              fontFamily:"'Space Grotesk',system-ui"}}>
              {res.es_cliente?`Rentabilidad · ${res.cliente_nombre}`:`Total de mi rama (${res.moneda})`}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["Apostado",res.total.apostado,Q.cyan],
                ["Premios",res.total.premios,Q.pink],
                ["GGR",res.total.ggr,Q.green],
                ["Comisiones",res.total.comisiones,Q.amber]].map(([l,v,c])=>(
                <div key={l}>
                  <div style={{color:Q.muted,fontSize:10}}>{l}</div>
                  <div style={{color:c,fontWeight:800,fontSize:17,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</div>
                </div>
              ))}
            </div>
            {!res.es_cliente&&res.total.neto_sin_influencers!=null&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${Q.dim}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:Q.text,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>Neto (sin influencers)</span>
                  <span style={{color:res.total.neto_sin_influencers>=0?Q.green:Q.red,
                    fontWeight:800,fontSize:18,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(res.total.neto_sin_influencers)}</span>
                </div>
                {res.total.comision_influencers>0&&(
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"center",marginTop:6}}>
                    <span style={{color:Q.muted,fontSize:12,
                      fontFamily:"'Space Grotesk',system-ui"}}>🌟 Comisión influencers</span>
                    <span style={{color:Q.gold,fontWeight:700,fontSize:13,
                      fontFamily:"'Space Grotesk',system-ui"}}>−{ars(res.total.comision_influencers)}</span>
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginTop:8,paddingTop:8,
                  borderTop:`1px solid ${Q.dim}`}}>
                  <span style={{color:Q.text,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>Neto final</span>
                  <span style={{color:res.total.neto_con_influencers>=0?Q.green:Q.red,
                    fontWeight:900,fontSize:20,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(res.total.neto_con_influencers)}</span>
                </div>
              </div>
            )}
          </GCard>

          {res.es_cliente&&res.rendimiento&&(
            <div style={{display:"flex",gap:8,marginBottom:12,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>
              <span style={{color:Q.green}}>{res.rendimiento.ganadas} ganadas</span>
              <span style={{color:Q.red}}>{res.rendimiento.perdidas} perdidas</span>
              <span style={{color:Q.amber}}>{res.rendimiento.pendientes} pendientes</span>
            </div>
          )}

          {/* Desglose por agencia de la rama (solo si no es filtro de cliente) */}
          {!res.es_cliente&&<div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
            letterSpacing:1,marginBottom:8,marginLeft:4,
            fontFamily:"'Space Grotesk',system-ui"}}>Desglose</div>}
          {res.agencias.map(a=>(
            <GCard key={a.code} glow={a.es_mia?Q.violet:undefined}
              style={{padding:"11px 13px",marginBottom:6,
                marginLeft:(a.nivel||0)*12}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:6}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {a.es_mia?"⭐ ":""}{a.name}</div>
                <div style={{color:Q.gold,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>Com {ars(a.comision)}</div>
              </div>
              <div style={{display:"flex",gap:12,fontSize:11,
                fontFamily:"'Space Grotesk',system-ui"}}>
                <span style={{color:Q.muted}}>Apostado <span style={{color:Q.cyan}}>{ars(a.apostado)}</span></span>
                <span style={{color:Q.muted}}>Premios <span style={{color:Q.pink}}>{ars(a.premios)}</span></span>
                <span style={{color:Q.muted}}>GGR <span style={{color:a.ggr>=0?Q.green:Q.red}}>{ars(a.ggr)}</span></span>
              </div>
            </GCard>
          ))}
        </div>
      )}

      {vista==="movs"&&<>
        {movs===null&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {movs&&movs.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
          padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Sin movimientos</div>}
        {(movs||[]).map((m,i)=>{
          const tipoTxt={carga_admin:"Carga admin",retiro_admin:"Descuento admin",
            carga_cliente:"Crédito a cliente",retiro_cliente:"Retiro cliente",
            pago_premio:"Premio pagado",transferencia:"A sub-agencia",recibido:"Recibido",
            carga:"Carga cliente",retiro:"Retiro cliente"}[m.tipo]||m.tipo;
          const pos=m.monto>=0;
          return(
            <GCard key={i} style={{padding:"10px 13px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>{tipoTxt}
                    {m.origen==="cliente"&&m.cliente?<span style={{color:Q.cyan}}> · {m.cliente}</span>:null}</div>
                  <div style={{color:Q.muted,fontSize:10}}>{m.agencia} · {m.fecha}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:pos?Q.green:Q.amber,fontWeight:700,fontSize:14,
                    fontFamily:"'Space Grotesk',system-ui"}}>{pos?"+":""}{ars(m.monto)}</div>
                  {m.saldo!=null&&<div style={{color:Q.dim,fontSize:9}}>saldo {ars(m.saldo)}</div>}
                </div>
              </div>
            </GCard>
          );
        })}
      </>}

      {vista==="apuestas"&&<>
        {apuestas===null&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {apuestas&&apuestas.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
          padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Sin apuestas</div>}
        {(apuestas||[]).map((a,i)=>{
          const col={won:Q.green,ganada:Q.green,lost:Q.red,perdida:Q.red,
            pending:Q.amber,pendiente:Q.amber,active:Q.cyan,paid:Q.green}[(a.status||"").toLowerCase()]||Q.muted;
          const abierta=apAbierta===a.code;
          return(
            <GCard key={i} style={{padding:"11px 13px",marginBottom:6,cursor:"pointer"}}
              onClick={()=>setApAbierta(abierta?null:a.code)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>{a.code}
                    <span style={{color:Q.cyan,fontWeight:400}}> · {a.cliente}</span></div>
                  <div style={{color:Q.muted,fontSize:10}}>{a.agencia} · {a.fecha} · {a.picks.length} sel.</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:col,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>{a.status}</div>
                  <div style={{color:Q.muted,fontSize:10}}>{ars(a.stake)} · {fmt(a.odd)}x</div>
                </div>
              </div>
              {abierta&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,
                    fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
                    <span style={{color:Q.muted}}>Monto <span style={{color:Q.cyan}}>{ars(a.stake)}</span></span>
                    <span style={{color:Q.muted}}>Cuota <span style={{color:Q.violet2}}>{fmt(a.odd)}x</span></span>
                    <span style={{color:Q.muted}}>Premio <span style={{color:Q.green}}>{ars(a.premio)}</span></span>
                  </div>
                  {a.picks.map((p,j)=>(
                    <div key={j} style={{background:"rgba(255,255,255,0.03)",
                      borderRadius:8,padding:"8px 10px",marginBottom:5}}>
                      <div style={{color:Q.text,fontSize:11,fontWeight:600,
                        fontFamily:"'Space Grotesk',system-ui"}}>
                        {p.home||p.equipo_local||""}{(p.home||p.away)?" vs ":""}{p.away||p.equipo_visitante||""}</div>
                      <div style={{color:Q.muted,fontSize:10,marginTop:2}}>
                        {p.market||p.mercado||p.tipo||"—"}: <span style={{color:Q.cyan}}>
                        {p.selection||p.seleccion||p.pick||"—"}</span>
                        {p.odd||p.cuota?<span style={{color:Q.violet2}}> @ {fmt(p.odd||p.cuota)}</span>:null}</div>
                    </div>
                  ))}
                  {a.picks.length===0&&<div style={{color:Q.muted,fontSize:11,
                    fontFamily:"'Space Grotesk',system-ui"}}>Sin detalle</div>}
                </div>
              )}
            </GCard>
          );
        })}
      </>}

      {vista==="combos"&&<>
        {combos===null&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {combos&&combos.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
          padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Sin combos en el período</div>}
        {(combos||[]).map((c,i)=>(
          <GCard key={i} style={{padding:"11px 13px",marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre||"Combo"}
                  {c.es_ia
                    ?<span style={{background:`${Q.violet}33`,border:`1px solid ${Q.violet}`,
                        borderRadius:12,padding:"1px 7px",fontSize:9,fontWeight:700,
                        color:Q.violet2,marginLeft:6}}>🤖 IA</span>
                    :<span style={{background:`${Q.cyan}22`,border:`1px solid ${Q.cyan}`,
                        borderRadius:12,padding:"1px 7px",fontSize:9,fontWeight:700,
                        color:Q.cyan,marginLeft:6}}>✍️ Manual</span>}
                  {!c.visible&&<span style={{color:Q.muted,fontSize:9,marginLeft:5}}>oculto</span>}
                </div>
                <div style={{color:Q.muted,fontSize:10}}>{c.creado_por||c.origen} · {c.fecha}</div>
              </div>
              <div style={{color:Q.green,fontWeight:700,fontSize:14,flexShrink:0,
                fontFamily:"'Space Grotesk',system-ui"}}>{fmt(c.odd)}x</div>
            </div>
          </GCard>
        ))}
      </>}

      {vista==="impresiones"&&<>
        {impresiones===null&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {impresiones&&impresiones.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
          padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Sin impresiones en el período</div>}
        {(impresiones||[]).map((im,i)=>{
          const tipoTxt={ticket:"Ticket",apuesta:"Apuesta",cobro:"Cobro",cierre:"Cierre de caja",combo:"Combo"}[im.tipo]||im.tipo;
          return(
            <GCard key={i} style={{padding:"10px 13px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>{tipoTxt}
                    {im.referencia?<span style={{color:Q.cyan,fontWeight:400}}> · {im.referencia}</span>:null}</div>
                  <div style={{color:Q.muted,fontSize:10}}>{im.agencia} · por {im.quien} · {im.fecha}</div>
                </div>
                <span style={{fontSize:16}}>🖨️</span>
              </div>
            </GCard>
          );
        })}
      </>}
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
      <CambiarMiPassword agencia={agencia}/>

      <ConectarTelegramAgencia agencia={agencia}/>

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

function ConectarTelegramAgencia({ agencia }){
  const [link,setLink]=useState(null);
  const [proc,setProc]=useState(false);
  const [copiado,setCopiado]=useState(false);

  const conectar=async()=>{
    setProc(true);
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/vincular-telegram`,{
        method:"POST",headers:authHeaders(agencia.token)});
      if(r.ok){ const d=await r.json(); setLink(d); }
    }catch(e){}
    setProc(false);
  };

  return(
    <GCard glow={Q.cyan} style={{padding:20,marginBottom:12}}>
      <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:6,
        fontFamily:"'Space Grotesk',system-ui"}}>📲 Conectar Telegram</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:12,lineHeight:1.5,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Conectá tu Telegram para recibir los avisos de la agencia
        (apuestas, premios, cargas). Abrí el link desde el celu con tu Telegram.</div>
      <Btn label={proc?"...":"Generar link de conexión"} onClick={conectar}
        color={Q.cyan} full disabled={proc}/>
      {link&&(
        <div style={{marginTop:10,display:"flex",gap:6}}>
          <input readOnly value={link.link} style={{flex:1,minWidth:0,
            background:"rgba(0,0,0,0.3)",border:`1px solid ${Q.border}`,borderRadius:8,
            padding:"8px 10px",color:Q.cyan,fontSize:11,
            fontFamily:"'Space Grotesk',system-ui"}}/>
          <button onClick={()=>{try{navigator.clipboard.writeText(link.link);
            setCopiado(true);setTimeout(()=>setCopiado(false),1500);}catch(e){}}}
            style={{background:`${Q.cyan}22`,border:`1px solid ${Q.cyan}`,borderRadius:8,
            padding:"8px 12px",cursor:"pointer",color:Q.cyan,fontSize:11,fontWeight:700,
            fontFamily:"'Space Grotesk',system-ui"}}>{copiado?"✓":"Copiar"}</button>
        </div>
      )}
    </GCard>
  );
}

function CambiarMiPassword({ agencia, obligado=false, onListo }){
  const [nueva,setNueva]=useState("");
  const [repetir,setRepetir]=useState("");
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);

  const guardar=async()=>{
    if(nueva.length<8){ setMsg("La contraseña debe tener 8+ caracteres"); return; }
    if(nueva!==repetir){ setMsg("Las contraseñas no coinciden"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/password`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({nueva}),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("✅ Contraseña actualizada");
      setNueva(""); setRepetir("");
      if(onListo) setTimeout(onListo,800);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  return(
    <GCard glow={obligado?Q.amber:Q.violet} style={{padding:20,marginBottom:12}}>
      <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:"'Space Grotesk',system-ui"}}>
        {obligado?"🔑 Cambiá tu contraseña para continuar":"🔑 Cambiar mi contraseña"}</div>
      {obligado&&<div style={{color:Q.amber,fontSize:11,marginBottom:12,lineHeight:1.4,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Es tu primer ingreso. Por seguridad, elegí una contraseña nueva.</div>}
      <input type="password" value={nueva} onChange={e=>setNueva(e.target.value)}
        placeholder="Nueva contraseña (8+)"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
          borderRadius:9,padding:"11px 14px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}/>
      <input type="password" value={repetir} onChange={e=>setRepetir(e.target.value)}
        placeholder="Repetir contraseña"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
          borderRadius:9,padding:"11px 14px",color:Q.text,fontSize:16,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}/>
      <Btn label={proc?"GUARDANDO...":"Guardar contraseña"} onClick={guardar}
        color={obligado?Q.amber:Q.violet} full disabled={proc}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </GCard>
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
          agencia_code: agencia.code,
          codigo_influencer: codigoInf || null,
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
function InfluencersAgencia({ agencia, onSesionExpirada }){
  const hoy=new Date().toISOString().slice(0,10);
  const primero=new Date(); primero.setDate(1);
  const [desde,setDesde]=useState(primero.toISOString().slice(0,10));
  const [hasta,setHasta]=useState(hoy);
  const [data,setData]=useState(null);
  const [costos,setCostos]=useState(null);
  const [escaneos,setEscaneos]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [sel,setSel]=useState(null);
  const [vista,setVista]=useState("mios");   // mios | costos | escaneos

  const cargar=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/influencers/reporte?desde=${desde}&hasta=${hasta}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setData(await r.json());
    }catch(e){}
  };
  const cargarCostos=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/influencers/costos?desde=${desde}&hasta=${hasta}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setCostos(await r.json());
    }catch(e){}
  };
  const cargarEscaneos=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/influencers/escaneos?desde=${desde}&hasta=${hasta}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setEscaneos(await r.json());
    }catch(e){}
  };
  useEffect(()=>{ cargar();
    if(vista==="costos") cargarCostos();
    if(vista==="escaneos") cargarEscaneos();
  // eslint-disable-next-line
  },[desde,hasta,vista]);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,
          fontFamily:"'Space Grotesk',system-ui"}}>🌟 Influencers</div>
        <Btn label={showForm?"Cancelar":"+ Nuevo"} onClick={()=>setShowForm(s=>!s)}
          color={Q.violet} size="sm"/>
      </div>

      {showForm&&<CrearInfluencerAgencia agencia={agencia}
        onListo={()=>{setShowForm(false);cargar();}} onSesionExpirada={onSesionExpirada}/>}

      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["mios","🌟 Míos"],["costos","💸 Cuestan"],["escaneos","📸 Escaneos"]].map(([k,l])=>(
          <button key={k} onClick={()=>setVista(k)} style={{flex:1,
            background:vista===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1px solid ${vista===k?Q.violet:Q.border}`,borderRadius:9,
            padding:"9px",cursor:"pointer",color:vista===k?Q.cyan:Q.muted,
            fontSize:12,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px 10px",color:Q.text,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <span style={{color:Q.muted}}>→</span>
        <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px 10px",color:Q.text,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>

      {vista==="mios"&&<>
        {!data&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {data&&(
          <div>
            <GCard glow={Q.violet} style={{padding:14,marginBottom:12,
              background:`linear-gradient(135deg,${Q.violet}12,${Q.cyan}06)`}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[["Ventas",data.total.ventas,Q.cyan],["GGR",data.total.ggr,Q.green],
                  ["Comisiones",data.total.comisiones,Q.gold]].map(([l,v,c])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{color:c,fontWeight:800,fontSize:15,
                      fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</div>
                    <div style={{color:Q.muted,fontSize:9}}>{l}</div>
                  </div>
                ))}
              </div>
            </GCard>
            {data.influencers.length===0&&<div style={{color:Q.muted,fontSize:12,
              textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
              No tenés influencers todavía</div>}
            {data.influencers.map(inf=>(
              <GCard key={inf.code} onClick={()=>setSel(inf.code)}
                style={{padding:"11px 13px",marginBottom:6,cursor:"pointer"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontWeight:700,fontSize:13,
                      fontFamily:"'Space Grotesk',system-ui"}}>{inf.name}
                      <span style={{color:Q.muted,fontWeight:400,fontSize:10}}> · {inf.codigo_ref}</span></div>
                    <div style={{color:Q.muted,fontSize:10}}>
                      {inf.combos} combos · {inf.jugadas} jugadas</div>
                    {inf.parent_name&&<div style={{color:Q.violet2,fontSize:10,marginTop:1}}>
                      🏢 {inf.parent_name}</div>}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:Q.gold,fontWeight:700,fontSize:14,
                      fontFamily:"'Space Grotesk',system-ui"}}>{ars(inf.comision)}</div>
                    <div style={{color:Q.muted,fontSize:9}}>comisión ›</div>
                  </div>
                </div>
              </GCard>
            ))}
          </div>
        )}
      </>}

      {vista==="costos"&&<>
        {!costos&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {costos&&(
          <div>
            <GCard glow={Q.gold} style={{padding:16,marginBottom:12,textAlign:"center"}}>
              <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,
                marginBottom:4,fontFamily:"'Space Grotesk',system-ui"}}>
                Comisiones que absorbés</div>
              <div style={{color:Q.gold,fontWeight:900,fontSize:26,
                fontFamily:"'Space Grotesk',system-ui"}}>{ars(costos.total_comision)}</div>
              <div style={{color:Q.dim,fontSize:10,marginTop:4,
                fontFamily:"'Space Grotesk',system-ui"}}>
                Por jugadas con código de influencer en tu caja</div>
            </GCard>
            {costos.detalle.length===0&&<div style={{color:Q.muted,fontSize:12,
              textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
              Sin jugadas con influencer en el período</div>}
            {costos.detalle.map((d,i)=>(
              <GCard key={i} style={{padding:"11px 13px",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontWeight:700,fontSize:12,
                      fontFamily:"'Space Grotesk',system-ui"}}>{d.influencer}</div>
                    <div style={{color:Q.muted,fontSize:10}}>
                      en {d.agencia} · {d.jugadas} jugadas · {ars(d.apostado)}</div>
                  </div>
                  <div style={{color:Q.gold,fontWeight:700,fontSize:14,flexShrink:0,
                    fontFamily:"'Space Grotesk',system-ui"}}>−{ars(d.comision)}</div>
                </div>
              </GCard>
            ))}
          </div>
        )}
      </>}

      {vista==="escaneos"&&<>
        {!escaneos&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {escaneos&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
              {[["Escaneos",escaneos.total_escaneos,Q.cyan],["Jugaron",escaneos.total_jugadas,Q.green],
                ["Conversión",escaneos.conversion+"%",Q.gold]].map(([l,v,c])=>(
                <GCard key={l} style={{padding:"14px 8px",textAlign:"center"}}>
                  <div style={{color:c,fontWeight:800,fontSize:18,
                    fontFamily:"'Space Grotesk',system-ui"}}>{v}</div>
                  <div style={{color:Q.muted,fontSize:9,marginTop:2}}>{l}</div>
                </GCard>
              ))}
            </div>
            {escaneos.detalle.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
              padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Sin escaneos en el período</div>}
            {escaneos.detalle.map(d=>(
              <GCard key={d.code} style={{padding:"11px 13px",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontWeight:700,fontSize:13,
                      fontFamily:"'Space Grotesk',system-ui"}}>{d.name}
                      <span style={{color:Q.muted,fontWeight:400,fontSize:10}}> · {d.codigo_ref}</span></div>
                    <div style={{color:Q.muted,fontSize:10}}>
                      {d.escaneos} escaneos · {d.jugadas} jugaron · cuota {fmt(d.cuota_prom)}x</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:d.conversion>=30?Q.green:d.conversion>=10?Q.gold:Q.muted,
                      fontWeight:700,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}>{d.conversion}%</div>
                    <div style={{color:Q.muted,fontSize:9}}>conversión</div>
                  </div>
                </div>
              </GCard>
            ))}
          </div>
        )}
      </>}

      {sel&&<DetalleInfluencerAgencia code={sel} agencia={agencia} desde={desde} hasta={hasta}
        onCerrar={()=>setSel(null)} onSesionExpirada={onSesionExpirada}/>}
    </div>
  );
}

function CrearInfluencerAgencia({ agencia, onListo, onSesionExpirada }){
  const [form,setForm]=useState({name:"",username:"",password:"",pct_ggr:"",pct_ventas:"",alcance:""});
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);

  const crear=async()=>{
    if(!form.name||!form.username||!form.password){ setMsg("Completá nombre, usuario y clave"); return; }
    if(form.password.length<8){ setMsg("La clave debe tener 8+ caracteres"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/influencers`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify(form),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      setMsg(`✅ Creado: ${d.code} · código ${d.codigo_ref}`);
      setTimeout(onListo,900);
    }catch(e){ setMsg("⚠️ "+e.message); setProc(false); }
  };

  return(
    <GCard glow={Q.violet} style={{padding:16,marginBottom:14}}>
      <div style={{color:Q.violet2,fontWeight:700,fontSize:14,marginBottom:12,
        fontFamily:"'Space Grotesk',system-ui"}}>🌟 Nuevo influencer</div>
      {[["name","Nombre"],["username","Usuario"],["password","Contraseña (8+)"]].map(([k,l])=>(
        <input key={k} value={form[k]} type={k==="password"?"password":"text"}
          onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={l}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:16,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}/>
      ))}
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <input value={form.pct_ggr} onChange={e=>setForm(f=>({...f,pct_ggr:e.target.value}))}
          placeholder="% GGR" inputMode="decimal"
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <input value={form.pct_ventas} onChange={e=>setForm(f=>({...f,pct_ventas:e.target.value}))}
          placeholder="% Ventas" inputMode="decimal"
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>
      <select value={form.alcance} onChange={e=>setForm(f=>({...f,alcance:e.target.value}))}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
          borderRadius:9,padding:"10px 12px",color:form.alcance?Q.text:Q.muted,fontSize:15,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>
        <option value="">Dónde valen sus links (por defecto: solo mi agencia)</option>
        <option value="solo_agencia">Solo mi agencia</option>
        <option value="rama">Toda mi rama</option>
        <option value="global">Cualquier lado + Telegram</option>
      </select>
      <Btn label={proc?"CREANDO...":"Crear influencer"} onClick={crear} color={Q.violet} full disabled={proc}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </GCard>
  );
}

function DetalleInfluencerAgencia({ code, agencia, desde, hasta, onCerrar, onSesionExpirada }){
  const [d,setD]=useState(null);
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);
  const [resetOpen,setResetOpen]=useState(false);
  const [configOpen,setConfigOpen]=useState(false);

  useEffect(()=>{
    fetch(`${API_URL}/api/influencers/${code}/detalle?desde=${desde}&hasta=${hasta}`,
      {headers:authHeaders(agencia.token)})
      .then(r=>{ if(r.status===401){ onSesionExpirada(); return null; } return r.json(); })
      .then(x=>x&&setD(x)).catch(()=>{});
  // eslint-disable-next-line
  },[code]);

  const liquidar=async()=>{
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/influencers/${code}/liquidar`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({desde,hasta}),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      const j=await r.json();
      setMsg(`✅ Liquidación generada · ${ars(j.comision)}`);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const rep=d&&d.reporte;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:210,
      display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
        borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
        maxHeight:"90vh",overflowY:"auto",padding:20,border:`1px solid ${Q.border}`,borderBottom:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}>🌟 {rep?rep.name:code}</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {!d&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {d&&(
          <div>
            <GCard glow={Q.gold} style={{padding:14,marginBottom:12}}>
              <div style={{color:Q.muted,fontSize:10,marginBottom:4,
                fontFamily:"'Space Grotesk',system-ui"}}>
                Usuario: <span style={{color:Q.cyan,fontWeight:700}}>{rep.username||"—"}</span></div>
              <div style={{color:Q.muted,fontSize:10,marginBottom:8,
                fontFamily:"'Space Grotesk',system-ui"}}>Código: {rep.codigo_ref}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                {[["Ventas",rep.apostado,Q.cyan],["GGR",rep.ggr,Q.green],
                  ["Comisión",rep.comision,Q.gold]].map(([l,v,c])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{color:c,fontWeight:800,fontSize:15,
                      fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</div>
                    <div style={{color:Q.muted,fontSize:9}}>{l}</div>
                  </div>
                ))}
              </div>
              <Btn label={proc?"...":"💵 Liquidar comisión"} onClick={liquidar}
                color={Q.gold} full disabled={proc}/>
              <div style={{height:8}}/>
              <Btn label="🔑 Resetear contraseña" onClick={()=>setResetOpen(true)}
                color={Q.amber} outline full/>
              <div style={{height:8}}/>
              <Btn label="⚙️ Configurar influencer" onClick={()=>setConfigOpen(v=>!v)}
                color={Q.violet} outline full/>
              {configOpen&&rep&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${Q.dim}`}}>
                  <ConfigurarCuentaAg agencia={agencia}
                    cuenta={{code, tipo:"influencer", name:rep.name, username:rep.username,
                      pct_ggr:rep.pct_ggr, pct_ventas:rep.pct_ventas, alcance:rep.alcance}}
                    onCambio={()=>setConfigOpen(false)} onSesionExpirada={onSesionExpirada}/>
                </div>
              )}
              {msg&&<div style={{fontSize:12,marginTop:8,
                color:msg.startsWith("✅")?Q.green:Q.red,
                fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
              {resetOpen&&<ResetPassword agencia={agencia} code={code}
                nombre={rep?rep.name:code} onCerrar={()=>setResetOpen(false)}/>}
            </GCard>
            <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
              marginBottom:8,fontFamily:"'Space Grotesk',system-ui"}}>Combos ({d.combos.length})</div>
            {d.combos.map(c=>(
              <GCard key={c.id} style={{padding:"9px 12px",marginBottom:5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{color:Q.text,fontSize:12,fontWeight:600,
                    fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre}
                    {c.codigo&&<span style={{color:Q.cyan,fontSize:10}}> · {c.codigo}</span>}</div>
                  <div style={{color:Q.green,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>{fmt(c.odd)}x</div>
                </div>
              </GCard>
            ))}
            <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
              margin:"12px 0 8px",fontFamily:"'Space Grotesk',system-ui"}}>Jugadas ({d.jugadas.length})</div>
            {d.jugadas.length===0&&<div style={{color:Q.muted,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>Sin jugadas en el período</div>}
            {d.jugadas.map((j,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"7px 0",
                borderBottom:i<d.jugadas.length-1?`1px solid ${Q.dim}`:"none"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontSize:12,fontWeight:600,
                    fontFamily:"'Space Grotesk',system-ui"}}>{j.code}</div>
                  <div style={{color:Q.muted,fontSize:10}}>{j.cliente} · {ars(j.stake)} · {fmt(j.odd)}x</div>
                </div>
                <span style={{color:Q.muted,fontSize:11,flexShrink:0}}>{j.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigurarCuentaAg({ agencia, cuenta, onCambio, onSesionExpirada }){
  const esInf = cuenta.tipo==="influencer" || String(cuenta.code||"").startsWith("INF");
  const [name,setName]=useState(cuenta.name||"");
  const [address,setAddress]=useState(cuenta.address||"");
  const [phone,setPhone]=useState(cuenta.phone||"");
  const [ggr,setGgr]=useState(String(cuenta.pct_ggr??""));
  const [ventas,setVentas]=useState(String(cuenta.pct_ventas??""));
  const [alcance,setAlcance]=useState(cuenta.alcance||"");
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);

  const guardar=async()=>{
    setProc(true); setMsg("");
    try{
      const body={name,address,phone,
        pct_ggr:parseFloat(ggr)||0, pct_ventas:parseFloat(ventas)||0};
      if(esInf&&alcance) body.alcance=alcance;
      const r=await fetch(`${API_URL}/api/cuenta/${cuenta.code}/configurar`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify(body)});
      if(r.status===401){ onSesionExpirada&&onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      let extra="";
      if(d.hijos_sobre_limite&&d.hijos_sobre_limite.length)
        extra=` ⚠️ ${d.hijos_sobre_limite.length} hija(s) quedaron con % mayor.`;
      setMsg("✅ Configuración guardada."+extra);
      onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const inp={width:"100%",background:"rgba(255,255,255,0.05)",
    border:`1px solid ${Q.border}`,borderRadius:9,padding:"10px 12px",
    color:Q.text,fontSize:15,marginBottom:8,fontFamily:"'Space Grotesk',system-ui"};

  return(
    <div>
      <div style={{color:Q.muted,fontSize:10,marginBottom:6,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Usuario: <span style={{color:Q.dim}}>{cuenta.username||"—"} (no editable)</span></div>
      <div style={{color:Q.muted,fontSize:10,marginBottom:2,
        fontFamily:"'Space Grotesk',system-ui"}}>Nombre</div>
      <input value={name} onChange={e=>setName(e.target.value)} style={inp}/>
      {!esInf&&<>
        <div style={{color:Q.muted,fontSize:10,marginBottom:2,
          fontFamily:"'Space Grotesk',system-ui"}}>Dirección</div>
        <input value={address} onChange={e=>setAddress(e.target.value)} style={inp}/>
        <div style={{color:Q.muted,fontSize:10,marginBottom:2,
          fontFamily:"'Space Grotesk',system-ui"}}>Teléfono</div>
        <input value={phone} onChange={e=>setPhone(e.target.value)} style={inp}/>
      </>}
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:2,
            fontFamily:"'Space Grotesk',system-ui"}}>% GGR</div>
          <input value={ggr} onChange={e=>setGgr(e.target.value)} inputMode="decimal" style={inp}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:2,
            fontFamily:"'Space Grotesk',system-ui"}}>% Ventas</div>
          <input value={ventas} onChange={e=>setVentas(e.target.value)} inputMode="decimal" style={inp}/>
        </div>
      </div>
      {esInf&&<>
        <div style={{color:Q.muted,fontSize:10,marginBottom:2,
          fontFamily:"'Space Grotesk',system-ui"}}>Dónde valen sus links</div>
        <select value={alcance} onChange={e=>setAlcance(e.target.value)}
          style={{...inp,color:alcance?Q.text:Q.muted}}>
          <option value="">— Sin cambios —</option>
          <option value="solo_agencia">Solo mi agencia</option>
          <option value="rama">Toda mi rama</option>
          <option value="global">Cualquier lado + Telegram</option>
        </select>
      </>}
      <div style={{color:Q.muted,fontSize:10,marginBottom:4,marginTop:6,
        fontFamily:"'Space Grotesk',system-ui"}}>Permisos de esta sub-agencia</div>
      <select value={form.permiso} onChange={e=>setForm(f=>({...f,permiso:e.target.value}))}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.violet}`,
          borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:15,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>
        <option value="solo_agencia">Solo agencia (crea clientes)</option>
        <option value="crea_agencias">+ Crear sub-agencias</option>
        {puedeDelegarInf&&<option value="crea_influencers">+ Crear influencers</option>}
        {puedeDelegarInf&&<option value="ambos">Todo (sub-agencias + influencers)</option>}
      </select>
      <div style={{color:Q.dim,fontSize:10,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>El % no puede superar el tuyo.</div>
      <Btn label={proc?"GUARDANDO...":"💾 Guardar configuración"} onClick={guardar}
        color={Q.violet} full disabled={proc}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </div>
  );
}

function ResetPassword({ agencia, code, userId, nombre, esAdmin=false, onCerrar }){
  const [nueva,setNueva]=useState("");
  const [repetir,setRepetir]=useState("");
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);

  const guardar=async()=>{
    if(nueva.length<8){ setMsg("La contraseña debe tener 8+ caracteres"); return; }
    if(nueva!==repetir){ setMsg("Las contraseñas no coinciden"); return; }
    setProc(true); setMsg("");
    try{
      const url = esAdmin ? `${API_URL}/api/admin/reset-password`
                          : `${API_URL}/api/agencias/me/reset-password`;
      const headers = esAdmin
        ? {"Content-Type":"application/json","X-Admin-Key":agencia.adminKey}
        : {"Content-Type":"application/json",...authHeaders(agencia.token)};
      const body = code ? {code,nueva} : {user_id:userId,nueva};
      const r=await fetch(url,{method:"POST",headers,body:JSON.stringify(body)});
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("✅ Contraseña reseteada. Deberá cambiarla en su próximo ingreso.");
      setTimeout(onCerrar,1200);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:220,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onCerrar}>
      <GCard glow={Q.amber} onClick={e=>e.stopPropagation()}
        style={{padding:20,maxWidth:400,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:15,
            fontFamily:"'Space Grotesk',system-ui"}}>🔑 Resetear contraseña</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:12,lineHeight:1.5,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Nueva contraseña para <span style={{color:Q.cyan,fontWeight:700}}>{nombre||code||"la cuenta"}</span>.
          Deberá cambiarla en su próximo ingreso.</div>
        <input type="password" value={nueva} onChange={e=>setNueva(e.target.value)}
          placeholder="Nueva contraseña (8+)"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"11px 14px",color:Q.text,fontSize:16,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <input type="password" value={repetir} onChange={e=>setRepetir(e.target.value)}
          placeholder="Repetir contraseña"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"11px 14px",color:Q.text,fontSize:16,marginBottom:12,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <Btn label={proc?"GUARDANDO...":"Resetear"} onClick={guardar} color={Q.amber} full disabled={proc}/>
        {msg&&<div style={{fontSize:12,marginTop:8,textAlign:"center",
          color:msg.startsWith("✅")?Q.green:Q.red,
          fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
      </GCard>
    </div>
  );
}

function MisAgencias({ agencia, onSesionExpirada }){
  const [arbol,setArbol]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [ccPara,setCcPara]=useState(null);   // code al que cargar crédito
  const [resetPara,setResetPara]=useState(null);   // code al que resetear pass
  const [configPara,setConfigPara]=useState(null);   // cuenta a configurar
  const [msg,setMsg]=useState("");

  const cargar=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/arbol`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setArbol(await r.json());
    }catch(e){}
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[]);

  const bloquear=async(code,bloquear_flag)=>{
    const motivo = bloquear_flag ? (prompt("Motivo del bloqueo (opcional):")||"") : "";
    try{
      const r=await fetch(`${API_URL}/api/bloquear`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({tipo:"agencia",objetivo:code,bloquear:bloquear_flag,
          cascada:true,motivo}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      setMsg(bloquear_flag?"✅ Agencia bloqueada":"✅ Agencia desbloqueada");
      setTimeout(()=>setMsg(""),2000); cargar();
    }catch(e){ setMsg("⚠️ "+e.message); setTimeout(()=>setMsg(""),3000); }
  };

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,
          fontFamily:"'Space Grotesk',system-ui"}}>🏢 Mis agencias</div>
        <Btn label={showForm?"Cancelar":"+ Nueva"} onClick={()=>setShowForm(s=>!s)}
          color={Q.violet} size="sm"/>
      </div>

      {showForm&&<CrearSubAgencia agencia={agencia}
        onListo={()=>{setShowForm(false);cargar();}} onSesionExpirada={onSesionExpirada}/>}

      {msg&&<div style={{fontSize:13,marginBottom:10,textAlign:"center",
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}

      {!arbol&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {arbol&&arbol.agencias.length===0&&!showForm&&<div style={{color:Q.muted,fontSize:12,
        textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
        Todavía no creaste sub-agencias</div>}

      {arbol&&arbol.agencias.map(a=>{
        const bloqueada = a.status==="bloqueada" || a.status==="blocked";
        return(
          <GCard key={a.code} style={{padding:"12px 14px",marginBottom:8,
            opacity:bloqueada?0.6:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {"— ".repeat(Math.max(0,(a.nivel||0)-(agencia.nivel||0)-1))}{a.name}
                  {bloqueada&&<span style={{color:Q.red,fontSize:10}}> 🔒</span>}</div>
                <div style={{color:Q.muted,fontSize:10}}>{a.code} · GGR {fmt(a.pct_ggr)}% · Ventas {fmt(a.pct_ventas)}%</div>
                {a.parent_code&&<div style={{color:Q.violet2,fontSize:10,marginTop:1}}>
                  🏢 {a.parent_code===agencia.code
                    ? agencia.name
                    : ((arbol.agencias.find(x=>x.code===a.parent_code)||{}).name||a.parent_code)}</div>}
                <div style={{color:a.saldo_cc>=0?Q.green:Q.red,fontSize:11,marginTop:2,
                  fontFamily:"'Space Grotesk',system-ui"}}>CC: {ars(a.saldo_cc)}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                <button onClick={()=>setCcPara(a.code)} style={{background:`${Q.cyan}18`,
                  border:`1px solid ${Q.cyan}`,borderRadius:7,padding:"5px 10px",cursor:"pointer",
                  color:Q.cyan,fontSize:11,fontWeight:700,
                  fontFamily:"'Space Grotesk',system-ui"}}>💰 Crédito</button>
                <button onClick={()=>bloquear(a.code,!bloqueada)} style={{background:"transparent",
                  border:`1px solid ${bloqueada?Q.green:Q.red}`,borderRadius:7,padding:"5px 10px",
                  cursor:"pointer",color:bloqueada?Q.green:Q.red,fontSize:11,fontWeight:700,
                  fontFamily:"'Space Grotesk',system-ui"}}>{bloqueada?"Desbloquear":"Bloquear"}</button>
                <button onClick={()=>setResetPara({code:a.code,nombre:a.name})} style={{background:`${Q.amber}18`,
                  border:`1px solid ${Q.amber}`,borderRadius:7,padding:"5px 10px",cursor:"pointer",
                  color:Q.amber,fontSize:11,fontWeight:700,
                  fontFamily:"'Space Grotesk',system-ui"}}>🔑 Clave</button>
                <button onClick={()=>setConfigPara(a)} style={{background:`${Q.violet}18`,
                  border:`1px solid ${Q.violet}`,borderRadius:7,padding:"5px 10px",cursor:"pointer",
                  color:Q.violet2,fontSize:11,fontWeight:700,
                  fontFamily:"'Space Grotesk',system-ui"}}>⚙️ Config</button>
              </div>
            </div>
          </GCard>
        );
      })}

      {ccPara&&<CargarCreditoSub agencia={agencia} code={ccPara}
        onCerrar={()=>setCcPara(null)} onListo={()=>{setCcPara(null);cargar();}}
        onSesionExpirada={onSesionExpirada}/>}
      {resetPara&&<ResetPassword agencia={agencia} code={resetPara.code}
        nombre={resetPara.nombre} onCerrar={()=>setResetPara(null)}/>}
      {configPara&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:220,
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setConfigPara(null)}>
          <GCard glow={Q.violet} onClick={e=>e.stopPropagation()}
            style={{padding:20,maxWidth:420,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:15,
                fontFamily:"'Space Grotesk',system-ui"}}>⚙️ Configurar · {configPara.name}</div>
              <button onClick={()=>setConfigPara(null)} style={{background:"transparent",border:"none",
                color:Q.muted,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <ConfigurarCuentaAg agencia={agencia} cuenta={configPara}
              onCambio={()=>{setConfigPara(null);cargar();}} onSesionExpirada={onSesionExpirada}/>
          </GCard>
        </div>
      )}
    </div>
  );
}

function CrearSubAgencia({ agencia, onListo, onSesionExpirada }){
  const [form,setForm]=useState({name:"",username:"",password:"",pct_ggr:"",pct_ventas:"",permiso:"solo_agencia"});
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);
  const miPermiso = agencia.permiso || "ambos";
  const puedeDelegarInf = miPermiso==="crea_influencers" || miPermiso==="ambos";

  const crear=async()=>{
    if(!form.name||!form.username||!form.password){ setMsg("Completá nombre, usuario y clave"); return; }
    if(form.password.length<8){ setMsg("La clave debe tener 8+ caracteres"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/sub`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({name:form.name,username:form.username,password:form.password,
          pct_ggr:parseFloat(form.pct_ggr)||0,pct_ventas:parseFloat(form.pct_ventas)||0,
          permiso:form.permiso}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      setMsg(`✅ Creada: ${d.code||d.name||"sub-agencia"}`);
      setTimeout(onListo,900);
    }catch(e){ setMsg("⚠️ "+e.message); setProc(false); }
  };

  return(
    <GCard glow={Q.violet} style={{padding:16,marginBottom:14}}>
      <div style={{color:Q.violet2,fontWeight:700,fontSize:14,marginBottom:12,
        fontFamily:"'Space Grotesk',system-ui"}}>🏢 Nueva sub-agencia</div>
      {[["name","Nombre"],["username","Usuario"],["password","Contraseña (8+)"]].map(([k,l])=>(
        <input key={k} value={form[k]} type={k==="password"?"password":"text"}
          onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={l}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:16,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}/>
      ))}
      <div style={{display:"flex",gap:8,marginBottom:6}}>
        <input value={form.pct_ggr} onChange={e=>setForm(f=>({...f,pct_ggr:e.target.value}))}
          placeholder="% GGR" inputMode="decimal"
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <input value={form.pct_ventas} onChange={e=>setForm(f=>({...f,pct_ventas:e.target.value}))}
          placeholder="% Ventas" inputMode="decimal"
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>
      <div style={{color:Q.muted,fontSize:10,marginBottom:4,marginTop:6,
        fontFamily:"'Space Grotesk',system-ui"}}>Permisos de esta sub-agencia</div>
      <select value={form.permiso} onChange={e=>setForm(f=>({...f,permiso:e.target.value}))}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.violet}`,
          borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:15,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>
        <option value="solo_agencia">Solo agencia (crea clientes)</option>
        <option value="crea_agencias">+ Crear sub-agencias</option>
        {puedeDelegarInf&&<option value="crea_influencers">+ Crear influencers</option>}
        {puedeDelegarInf&&<option value="ambos">Todo (sub-agencias + influencers)</option>}
      </select>
      <div style={{color:Q.dim,fontSize:10,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>
        No podés dar más % del que tenés vos.</div>
      <Btn label={proc?"CREANDO...":"Crear sub-agencia"} onClick={crear} color={Q.violet} full disabled={proc}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </GCard>
  );
}

function CargarCreditoSub({ agencia, code, onCerrar, onListo, onSesionExpirada }){
  const [monto,setMonto]=useState("");
  const [modo,setModo]=useState("cargar");   // cargar | retirar
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);

  const cargar=async()=>{
    const m=parseFloat(monto);
    if(!m||m<=0){ setMsg("Ingresá un monto"); return; }
    const signed = modo==="retirar" ? -Math.abs(m) : Math.abs(m);
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/agencias/me/sub/${code}/cc`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({monto:signed}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      setMsg(modo==="retirar"?"✅ Crédito retirado":"✅ Crédito cargado");
      setTimeout(onListo,800);
    }catch(e){ setMsg("⚠️ "+e.message); setProc(false); }
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:210,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onCerrar}>
      <GCard glow={Q.cyan} onClick={e=>e.stopPropagation()}
        style={{padding:20,maxWidth:380,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:15,
            fontFamily:"'Space Grotesk',system-ui"}}>💰 Crédito · {code}</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {[["cargar","⬆ Cargar"],["retirar","⬇ Retirar"]].map(([k,l])=>(
            <button key={k} onClick={()=>setModo(k)} style={{flex:1,
              background:modo===k?`${Q.cyan}33`:"rgba(255,255,255,0.04)",
              border:`1px solid ${modo===k?Q.cyan:Q.border}`,borderRadius:9,
              padding:"9px",cursor:"pointer",color:modo===k?Q.cyan:Q.muted,
              fontSize:13,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
          ))}
        </div>
        <div style={{color:Q.muted,fontSize:11,marginBottom:10,lineHeight:1.5,
          fontFamily:"'Space Grotesk',system-ui"}}>
          {modo==="retirar"
            ?"Retirás crédito de la sub-agencia y vuelve a tu cuenta. No puede quedar en negativo."
            :"Transferís crédito de tu cuenta a la sub-agencia. Se descuenta de tu saldo."}</div>
        <input value={monto} onChange={e=>setMonto(e.target.value)} inputMode="decimal"
          placeholder="Ej: 50000"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:10,padding:"12px 14px",color:Q.text,fontSize:18,marginBottom:12,
            textAlign:"center",fontFamily:"'Space Grotesk',system-ui"}}/>
        <Btn label={proc?"PROCESANDO...":(modo==="retirar"?"Retirar":"Cargar")} onClick={cargar} color={modo==="retirar"?Q.amber:Q.cyan} full disabled={proc}/>
        {msg&&<div style={{fontSize:12,marginTop:8,textAlign:"center",
          color:msg.startsWith("✅")?Q.green:Q.red,
          fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
      </GCard>
    </div>
  );
}

function AgenciaPanel({ agencia, onLogout, onSesionExpirada }){
  const [tab,setTab]=useState("codigo");
  const [saldoCC,setSaldoCC]=useState(null);
  const [verSaldo,setVerSaldo]=useState(false);

  // Traer el saldo CC al iniciar y refrescarlo cada 30s
  useEffect(()=>{
    let vivo=true;
    const traer=async()=>{
      try{
        const r=await fetch(`${API_URL}/api/agencias/me/cc`,
          {headers:authHeaders(agencia.token)});
        if(r.ok&&vivo){ const d=await r.json(); setSaldoCC(d.saldo_cc); }
      }catch(e){}
    };
    traer();
    const t=setInterval(traer,30000);
    return ()=>{ vivo=false; clearInterval(t); };
  // eslint-disable-next-line
  },[]);

  const TABS=[
    {k:"codigo",   l:"Código / Bot"},
    {k:"envivo",   l:"🔴 En Vivo"},
    {k:"manual",   l:"Apuesta manual"},
    {k:"combos",   l:"⚡ Combos IA"},
    {k:"mejorar",  l:"📸 Mejorar"},
    {k:"clientes", l:"👤 Clientes"},
    {k:"misagencias", l:"🏢 Mis agencias"},
    {k:"influencers", l:"🌟 Influencers"},
    {k:"historial",l:"Historial"},
    {k:"cashout",  l:"💰 Cash out"},
    {k:"bonos",    l:"🎁 Bonos"},
    {k:"cierres",  l:"Cierres"},
    {k:"config",   l:"Config"},
  ].filter(t=>{
    const perm = agencia.permiso || "ambos";
    if(t.k==="misagencias") return perm==="crea_agencias"||perm==="ambos";
    if(t.k==="influencers") return perm==="crea_influencers"||perm==="ambos";
    return true;
  });

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
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={()=>setVerSaldo(true)} style={{
            background:`${(saldoCC??0)>=0?Q.green:Q.red}18`,
            border:`1px solid ${(saldoCC??0)>=0?Q.green:Q.red}66`,
            borderRadius:10,padding:"5px 10px",cursor:"pointer",textAlign:"right"}}>
            <div style={{color:Q.muted,fontSize:8,textTransform:"uppercase",
              letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>Saldo</div>
            <div style={{color:(saldoCC??0)>=0?Q.green:Q.red,fontWeight:800,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>
              {saldoCC==null?"...":ars(saldoCC)}</div>
          </button>
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
        <CazaError>
        {tab==="codigo"   &&<FlujoCodigo  agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="envivo"   &&<EnVivo/>}
        {tab==="manual"   &&<FlujoManual  agencia={agencia}/>}
        {tab==="combos"   &&<CombosIA  agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="mejorar"  &&<MejorarCombinada agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="clientes" &&<Clientes  agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="misagencias"&&<MisAgencias agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="influencers"&&<InfluencersAgencia agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="historial"&&<Historial agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="cashout"  &&<HistorialCashout agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="bonos"    &&<BonosAgencia agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="cierres"  &&<Cierres      agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
        {tab==="config"   &&<Config       agencia={agencia}/>}
        </CazaError>
      </div>
      </div>

      {verSaldo&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
          zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setVerSaldo(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
            borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
            maxHeight:"88vh",overflowY:"auto",padding:20,
            border:`1px solid ${Q.border}`,borderBottom:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:14}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:16,
                fontFamily:"'Space Grotesk',system-ui"}}>💰 Mi saldo</div>
              <button onClick={()=>setVerSaldo(false)} style={{background:"transparent",
                border:"none",color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <SaldoCC agencia={agencia} onSesionExpirada={onSesionExpirada}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PANEL DEL INFLUENCER
// ═══════════════════════════════════════════════════════════════
function EditorPlaca({ combo, codigoRef, link, onCerrar }){
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const [fondo,setFondo]=useState({tipo:"template",valor:0});  // template|solido|imagen
  const [imgFondo,setImgFondo]=useState(null);   // Image() cargada
  const [filtro,setFiltro]=useState("none");
  const [capas,setCapas]=useState([]);   // textos/stickers movibles
  const [selCapa,setSelCapa]=useState(null);
  const [drag,setDrag]=useState(null);
  const [nombreCombo,setNombreCombo]=useState((combo.nombre||"COMBINADA").toUpperCase());

  const W=1080, H=1350;

  // Plantillas de fondo (degradés diseñados)
  const templates=[
    {name:"Violeta",stops:[["#0a0118",0],["#2a0a5a",0.5],["#04040f",1]]},
    {name:"Neón",stops:[["#001a2e",0],["#003554",0.5],["#00171f",1]]},
    {name:"Dorado",stops:[["#1a1500",0],["#3a2e0a",0.5],["#0f0a00",1]]},
  ];
  const solidos=["#0a0118","#1a0a3a","#001f3f","#0f0f0f","#2a0a2a","#0a2a1a"];

  // Capas iniciales: nombre del combo + código
  useEffect(()=>{
    setCapas([
      {id:"nombre",tipo:"texto",texto:nombreCombo,x:W/2,y:220,size:64,color:"#ffffff",bold:true},
      {id:"codigo",tipo:"texto",texto:`Código: ${codigoRef}`,x:W/2,y:H-260,size:44,color:"#E8C547",bold:true},
      {id:"cta",tipo:"texto",texto:"👉 JUGÁ CONMIGO",x:W/2,y:H-160,size:40,color:"#00F0FF",bold:true},
      {id:"bot",tipo:"texto",texto:"📲 @quartzplay_bot",x:W/2,y:H-90,size:36,color:"#9F5FFF",bold:true},
    ]);
  // eslint-disable-next-line
  },[]);

  // Dibujar todo en el canvas
  const dibujar=()=>{
    const cv=canvasRef.current; if(!cv) return;
    const x=cv.getContext("2d");
    x.clearRect(0,0,W,H);
    // Fondo
    if(fondo.tipo==="imagen"&&imgFondo){
      x.save();
      if(filtro==="bn") x.filter="grayscale(1)";
      else if(filtro==="calido") x.filter="sepia(0.4) saturate(1.3)";
      else if(filtro==="frio") x.filter="hue-rotate(30deg) saturate(1.2)";
      else if(filtro==="oscuro") x.filter="brightness(0.6)";
      // cover
      const rImg=imgFondo.width/imgFondo.height, rC=W/H;
      let dw=W,dh=H,dx=0,dy=0;
      if(rImg>rC){ dh=H; dw=H*rImg; dx=(W-dw)/2; }
      else { dw=W; dh=W/rImg; dy=(H-dh)/2; }
      x.drawImage(imgFondo,dx,dy,dw,dh);
      x.restore();
      // Oscurecer un poco para que se lea el texto
      x.fillStyle="rgba(0,0,0,0.35)"; x.fillRect(0,0,W,H);
    } else if(fondo.tipo==="solido"){
      x.fillStyle=solidos[fondo.valor]; x.fillRect(0,0,W,H);
    } else {
      const t=templates[fondo.valor];
      const g=x.createLinearGradient(0,0,W,H);
      t.stops.forEach(([c,p])=>g.addColorStop(p,c));
      x.fillStyle=g; x.fillRect(0,0,W,H);
    }
    // Marco
    x.strokeStyle="#7C3AED"; x.lineWidth=6; x.strokeRect(30,30,W-60,H-60);
    // Marca
    x.fillStyle="#00F0FF"; x.font="bold 56px system-ui"; x.textAlign="center";
    x.fillText("QuartzPlay", W/2, 120);
    // Picks del combo (fijos, con cuotas)
    x.textAlign="left"; x.font="34px system-ui";
    let y=320;
    (combo.picks||[]).slice(0,7).forEach((p,i)=>{
      const local=p.home||p.h||""; const sel=p.sel||p.label||"";
      const odd=Number(p.odd||p.cuota||0).toFixed(2);
      x.fillStyle="#a78bfa"; x.fillText(`${i+1}.`, 80, y);
      x.fillStyle="#ffffff";
      let li=`${local?local+" — ":""}${sel}`;
      if(li.length>32) li=li.slice(0,32)+"…";
      x.fillText(li, 140, y);
      x.fillStyle="#00F0FF"; x.textAlign="right"; x.fillText(`@${odd}`, W-80, y);
      x.textAlign="left"; y+=64;
    });
    // Cuota total
    y+=10;
    x.fillStyle="#00FF88"; x.font="bold 58px system-ui"; x.textAlign="center";
    x.fillText(`CUOTA ${Number(combo.odd||combo.odd_total||0).toFixed(2)}x`, W/2, y);
    // Capas movibles (texto/sticker)
    capas.forEach(c=>{
      x.textAlign="center";
      if(c.tipo==="texto"){
        x.fillStyle=c.color; x.font=`${c.bold?"bold ":""}${c.size}px system-ui`;
        x.fillText(c.texto, c.x, c.y);
      } else if(c.tipo==="sticker"){
        x.font=`${c.size}px system-ui`; x.fillText(c.emoji, c.x, c.y);
      }
      // Marco de selección
      if(selCapa===c.id){
        const w=x.measureText(c.texto||c.emoji||"").width;
        x.strokeStyle="#00F0FF"; x.lineWidth=2;
        x.strokeRect(c.x-w/2-10, c.y-c.size, w+20, c.size+16);
      }
    });
  };
  useEffect(dibujar);   // redibuja en cada cambio

  // Interacción: tocar/arrastrar capas
  const coords=(e)=>{
    const cv=canvasRef.current; const r=cv.getBoundingClientRect();
    const t=e.touches?e.touches[0]:e;
    return {x:(t.clientX-r.left)*(W/r.width), y:(t.clientY-r.top)*(H/r.height)};
  };
  const onDown=(e)=>{
    const {x,y}=coords(e);
    // Buscar capa tocada (de arriba hacia abajo)
    for(let i=capas.length-1;i>=0;i--){
      const c=capas[i];
      const cv=canvasRef.current.getContext("2d");
      cv.font=`${c.bold?"bold ":""}${c.size}px system-ui`;
      const w=cv.measureText(c.texto||c.emoji||"").width;
      if(Math.abs(x-c.x)<w/2+20 && y<c.y+16 && y>c.y-c.size){
        setSelCapa(c.id); setDrag({id:c.id,dx:x-c.x,dy:y-c.y}); return;
      }
    }
    setSelCapa(null);
  };
  const onMove=(e)=>{
    if(!drag) return;
    e.preventDefault();
    const {x,y}=coords(e);
    setCapas(cs=>cs.map(c=>c.id===drag.id?{...c,x:x-drag.dx,y:y-drag.dy}:c));
  };
  const onUp=()=>setDrag(null);

  const subirImagen=(e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{ const im=new Image(); im.onload=()=>{ setImgFondo(im); setFondo({tipo:"imagen",valor:0}); }; im.src=r.result; };
    r.readAsDataURL(f);
    e.target.value="";
  };

  const addSticker=(emoji)=>{
    const id="s"+Date.now();
    setCapas(cs=>[...cs,{id,tipo:"sticker",emoji,x:W/2,y:H/2,size:90}]);
    setSelCapa(id);
  };
  const editarTextoSel=(txt)=>{
    setCapas(cs=>cs.map(c=>c.id===selCapa?{...c,texto:txt}:c));
  };
  const cambiarColorSel=(col)=>{
    setCapas(cs=>cs.map(c=>c.id===selCapa?{...c,color:col}:c));
  };
  const borrarSel=()=>{
    setCapas(cs=>cs.filter(c=>c.id!==selCapa)); setSelCapa(null);
  };

  const descargar=()=>{
    setSelCapa(null);
    setTimeout(()=>{
      canvasRef.current.toBlob(b=>{
        const a=document.createElement("a");
        a.href=URL.createObjectURL(b);
        a.download=`combo_${codigoRef}_${combo.id||"qp"}.png`;
        a.click();
      },"image/png");
    },50);
  };

  const compartir=()=>{
    setSelCapa(null);
    setTimeout(()=>{
      canvasRef.current.toBlob(async(b)=>{
        const file=new File([b],`combo_${codigoRef}.png`,{type:"image/png"});
        const texto=`${nombreCombo}\nCuota ${Number(combo.odd||combo.odd_total||0).toFixed(2)}x\nMi código: ${codigoRef}\n${link}`;
        // Web Share API con archivo (móvil)
        if(navigator.canShare&&navigator.canShare({files:[file]})){
          try{ await navigator.share({files:[file],text:texto}); return; }
          catch(e){ if(e.name==="AbortError") return; }
        }
        // Fallback: descargar
        const a=document.createElement("a");
        a.href=URL.createObjectURL(b);
        a.download=`combo_${codigoRef}_${combo.id||"qp"}.png`;
        a.click();
      },"image/png");
    },50);
  };

  const capaSel = capas.find(c=>c.id===selCapa);
  const emojis=["🔥","⚽","💰","🏆","⭐","💎","🚀","✅","🎯","👑","💪","📲"];
  const colores=["#ffffff","#00F0FF","#00FF88","#E8C547","#FF0080","#9F5FFF"];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:300,
      overflowY:"auto",padding:"12px"}}>
      <div style={{maxWidth:520,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          marginBottom:12}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}>🎨 Editor de placa</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:28,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {/* Canvas */}
        <canvas ref={canvasRef} width={W} height={H}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          style={{width:"100%",borderRadius:12,border:`1px solid ${Q.border}`,
            marginBottom:12,touchAction:"none"}}/>

        {/* Editar capa seleccionada */}
        {capaSel&&(
          <GCard style={{padding:12,marginBottom:10}}>
            <div style={{color:Q.cyan,fontSize:11,marginBottom:8,
              fontFamily:"'Space Grotesk',system-ui"}}>Editando: {capaSel.tipo}</div>
            {capaSel.tipo==="texto"&&(
              <input value={capaSel.texto} onChange={e=>editarTextoSel(e.target.value)}
                style={{width:"100%",background:"rgba(255,255,255,0.05)",
                  border:`1px solid ${Q.border}`,borderRadius:8,padding:"8px 10px",
                  color:Q.text,fontSize:14,marginBottom:8,
                  fontFamily:"'Space Grotesk',system-ui"}}/>
            )}
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
              {colores.map(col=>(
                <button key={col} onClick={()=>cambiarColorSel(col)}
                  style={{width:28,height:28,borderRadius:"50%",background:col,
                    border:capaSel.color===col?`2px solid ${Q.cyan}`:"1px solid #333",
                    cursor:"pointer"}}/>
              ))}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setCapas(cs=>cs.map(c=>c.id===selCapa?{...c,size:c.size+8}:c))}
                style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
                  borderRadius:8,padding:"8px",color:Q.text,cursor:"pointer",fontSize:13}}>A+</button>
              <button onClick={()=>setCapas(cs=>cs.map(c=>c.id===selCapa?{...c,size:Math.max(20,c.size-8)}:c))}
                style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
                  borderRadius:8,padding:"8px",color:Q.text,cursor:"pointer",fontSize:13}}>A−</button>
              <button onClick={borrarSel}
                style={{flex:1,background:`${Q.red}22`,border:`1px solid ${Q.red}`,
                  borderRadius:8,padding:"8px",color:Q.red,cursor:"pointer",fontSize:13}}>🗑</button>
            </div>
          </GCard>
        )}

        {/* Fondos */}
        <div style={{color:Q.muted,fontSize:11,marginBottom:6,
          fontFamily:"'Space Grotesk',system-ui"}}>Fondo</div>
        <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
          {templates.map((t,i)=>(
            <button key={i} onClick={()=>setFondo({tipo:"template",valor:i})}
              style={{padding:"7px 12px",borderRadius:8,fontSize:12,cursor:"pointer",
                background:fondo.tipo==="template"&&fondo.valor===i?`${Q.violet}44`:"rgba(255,255,255,0.05)",
                border:`1px solid ${fondo.tipo==="template"&&fondo.valor===i?Q.violet:Q.border}`,
                color:Q.text,fontFamily:"'Space Grotesk',system-ui"}}>{t.name}</button>
          ))}
          <button onClick={()=>fileRef.current?.click()}
            style={{padding:"7px 12px",borderRadius:8,fontSize:12,cursor:"pointer",
              background:fondo.tipo==="imagen"?`${Q.cyan}33`:"rgba(255,255,255,0.05)",
              border:`1px solid ${fondo.tipo==="imagen"?Q.cyan:Q.border}`,
              color:Q.text,fontFamily:"'Space Grotesk',system-ui"}}>📷 Mi foto</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={subirImagen} style={{display:"none"}}/>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {solidos.map((col,i)=>(
            <button key={i} onClick={()=>setFondo({tipo:"solido",valor:i})}
              style={{width:30,height:30,borderRadius:8,background:col,cursor:"pointer",
                border:fondo.tipo==="solido"&&fondo.valor===i?`2px solid ${Q.cyan}`:"1px solid #333"}}/>
          ))}
        </div>

        {/* Filtros (solo si hay imagen) */}
        {fondo.tipo==="imagen"&&(
          <div style={{marginBottom:10}}>
            <div style={{color:Q.muted,fontSize:11,marginBottom:6,
              fontFamily:"'Space Grotesk',system-ui"}}>Filtro</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["none","Normal"],["bn","B/N"],["calido","Cálido"],["frio","Frío"],["oscuro","Oscuro"]].map(([k,l])=>(
                <button key={k} onClick={()=>setFiltro(k)}
                  style={{padding:"6px 11px",borderRadius:8,fontSize:12,cursor:"pointer",
                    background:filtro===k?`${Q.violet}44`:"rgba(255,255,255,0.05)",
                    border:`1px solid ${filtro===k?Q.violet:Q.border}`,
                    color:Q.text,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {/* Stickers */}
        <div style={{color:Q.muted,fontSize:11,marginBottom:6,
          fontFamily:"'Space Grotesk',system-ui"}}>Stickers (tocá para agregar)</div>
        <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
          {emojis.map(em=>(
            <button key={em} onClick={()=>addSticker(em)}
              style={{fontSize:24,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
                borderRadius:8,padding:"4px 8px",cursor:"pointer"}}>{em}</button>
          ))}
        </div>

        <div style={{display:"flex",gap:8}}>
          <Btn label="📲 Compartir" onClick={compartir} color={Q.violet} full/>
          <Btn label="⬇ Descargar" onClick={descargar} color={Q.gold} full/>
        </div>
        <div style={{color:Q.dim,fontSize:10,textAlign:"center",marginTop:8,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Tocá un texto para moverlo o editarlo · Las cuotas del combo son fijas</div>
      </div>
    </div>
  );
}


function InfluencerEscaner({ agencia, onSesionExpirada }){
  const hoy=new Date().toISOString().slice(0,10);
  const primero=new Date(); primero.setDate(1);
  const [desde,setDesde]=useState(primero.toISOString().slice(0,10));
  const [hasta,setHasta]=useState(hoy);
  const [data,setData]=useState(null);
  const [copiado,setCopiado]=useState("");
  const ref = agencia.codigo_ref || "";
  const linkScanTg=`https://t.me/quartzplay_bot?start=scan_${ref}`;
  const linkScanWeb=`https://valiant-gentleness-production-a779.up.railway.app/?scan=${ref}`;

  const cargar=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/influencer/me/escaneos?desde=${desde}&hasta=${hasta}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setData(await r.json());
    }catch(e){}
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[desde,hasta]);

  const copiar=(txt,cual)=>{ try{ navigator.clipboard.writeText(txt);
    setCopiado(cual); setTimeout(()=>setCopiado(""),1500); }catch(e){} };

  return(
    <div>
      <GCard glow={Q.cyan} style={{padding:16,marginBottom:12,
        background:`linear-gradient(135deg,${Q.cyan}10,${Q.violet}06)`}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:6,
          fontFamily:"'Space Grotesk',system-ui"}}>📸 Tu escáner de apuestas</div>
        <div style={{color:Q.muted,fontSize:11,marginBottom:12,lineHeight:1.5,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Compartí este link. Tus seguidores escanean su apuesta, se la mejoramos,
          y cada jugada suma a tu comisión.</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={()=>copiar(linkScanTg,"tg")} style={{background:`${Q.cyan}18`,
            border:`1px solid ${Q.cyan}`,borderRadius:9,padding:"11px",cursor:"pointer",
            color:Q.cyan,fontSize:12,fontWeight:700,textAlign:"left",
            fontFamily:"'Space Grotesk',system-ui"}}>
            {copiado==="tg"?"✅ Copiado":"📲 Copiar link de escáner (Telegram)"}</button>
          <button onClick={()=>copiar(linkScanWeb,"web")} style={{background:`${Q.violet}18`,
            border:`1px solid ${Q.violet}`,borderRadius:9,padding:"11px",cursor:"pointer",
            color:Q.violet2,fontSize:12,fontWeight:700,textAlign:"left",
            fontFamily:"'Space Grotesk',system-ui"}}>
            {copiado==="web"?"✅ Copiado":"🌐 Copiar link de escáner (web)"}</button>
        </div>
      </GCard>

      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px 10px",color:Q.text,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <span style={{color:Q.muted}}>→</span>
        <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px 10px",color:Q.text,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>

      {!data&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {data&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
            {[["Escaneos",data.escaneos,Q.cyan],["Jugaron",data.jugadas,Q.green],
              ["Conversión",data.conversion+"%",Q.gold]].map(([l,v,c])=>(
              <GCard key={l} style={{padding:"14px 8px",textAlign:"center"}}>
                <div style={{color:c,fontWeight:800,fontSize:18,
                  fontFamily:"'Space Grotesk',system-ui"}}>{v}</div>
                <div style={{color:Q.muted,fontSize:9,marginTop:2}}>{l}</div>
              </GCard>
            ))}
          </div>

          <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
            marginBottom:8,fontFamily:"'Space Grotesk',system-ui"}}>Últimos escaneos</div>
          {data.ultimos.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
            padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Sin escaneos en el período</div>}
          {data.ultimos.map((u,i)=>(
            <GCard key={i} style={{padding:"10px 13px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:600,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {u.picks_ok}/{u.picks_leidos} picks · {fmt(u.cuota)}x</div>
                  <div style={{color:Q.muted,fontSize:10}}>{u.fecha}
                    {u.betslip?` · ${u.betslip}`:""}</div>
                </div>
                <span style={{color:u.jugo?Q.green:Q.muted,fontWeight:700,fontSize:11,
                  fontFamily:"'Space Grotesk',system-ui"}}>{u.jugo?"✅ Jugó":"Escaneó"}</span>
              </div>
            </GCard>
          ))}
        </div>
      )}
    </div>
  );
}

function InfluencerEscanerFin(){ return null; }

function InfluencerPanel({ agencia, onLogout, onSesionExpirada }){
  const [tab,setTab]=useState("panel");   // panel | combos
  return(
    <div style={{maxWidth:520,margin:"0 auto",padding:"0 14px 90px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"16px 0 12px"}}>
        <div style={{color:Q.text,fontWeight:800,fontSize:18,
          fontFamily:"'Space Grotesk',system-ui"}}>🌟 {agencia.name}</div>
        <button onClick={onLogout} style={{background:"transparent",
          border:`1px solid ${Q.border}`,borderRadius:8,padding:"6px 12px",
          color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:"'Space Grotesk',system-ui"}}>Salir</button>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {[["panel","📊 Mi panel"],["combos","⚡ Mis combos"],["ia","🤖 Combos IA"],["escaner","📸 Escáner"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,
            background:tab===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1px solid ${tab===k?Q.violet:Q.border}`,borderRadius:9,
            padding:"10px",cursor:"pointer",color:tab===k?Q.cyan:Q.muted,
            fontSize:13,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>

      {tab==="panel"&&<InfluencerHome agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
      {tab==="combos"&&<InfluencerCombos agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
      {tab==="ia"&&<InfluencerCombosIA agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
      {tab==="escaner"&&<InfluencerEscaner agencia={agencia} onSesionExpirada={onSesionExpirada}/>}
    </div>
  );
}

function InfluencerHome({ agencia, onSesionExpirada }){
  const hoy=new Date().toISOString().slice(0,10);
  const primero=new Date(); primero.setDate(1);
  const [desde,setDesde]=useState(primero.toISOString().slice(0,10));
  const [hasta,setHasta]=useState(hoy);
  const [data,setData]=useState(null);
  const [copiado,setCopiado]=useState("");

  const cargar=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/influencer/me/panel?desde=${desde}&hasta=${hasta}`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setData(await r.json());
    }catch(e){}
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[desde,hasta]);

  const ref = (data&&data.codigo_ref) || agencia.codigo_ref || "";
  const linkTelegram = `https://t.me/quartzplay_bot?start=${ref}`;
  const linkWeb = `https://valiant-gentleness-production-a779.up.railway.app/?ref=${ref}`;

  const copiar=(txt,cual)=>{
    try{ navigator.clipboard.writeText(txt); setCopiado(cual);
      setTimeout(()=>setCopiado(""),1500);
    }catch(e){}
  };

  return(
    <div>
      {/* Código y links para compartir */}
      <GCard glow={Q.violet} style={{padding:16,marginBottom:12,
        background:`linear-gradient(135deg,${Q.violet}12,${Q.cyan}06)`}}>
        <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,
          marginBottom:6,fontFamily:"'Space Grotesk',system-ui"}}>Tu código</div>
        <div style={{color:Q.cyan,fontWeight:800,fontSize:22,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}>{ref||"—"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <button onClick={()=>copiar(linkTelegram,"tg")} style={{background:`${Q.cyan}18`,
            border:`1px solid ${Q.cyan}`,borderRadius:9,padding:"10px",cursor:"pointer",
            color:Q.cyan,fontSize:12,fontWeight:700,textAlign:"left",
            fontFamily:"'Space Grotesk',system-ui"}}>
            {copiado==="tg"?"✅ Copiado":"📲 Copiar link de Telegram"}</button>
          <button onClick={()=>copiar(linkWeb,"web")} style={{background:`${Q.violet}18`,
            border:`1px solid ${Q.violet}`,borderRadius:9,padding:"10px",cursor:"pointer",
            color:Q.violet2,fontSize:12,fontWeight:700,textAlign:"left",
            fontFamily:"'Space Grotesk',system-ui"}}>
            {copiado==="web"?"✅ Copiado":"🌐 Copiar link web"}</button>
        </div>
        <div style={{color:Q.dim,fontSize:10,marginTop:8,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Quien juegue por tus links o tus combos suma a tu comisión.</div>
      </GCard>

      {/* Fechas */}
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px 10px",color:Q.text,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <span style={{color:Q.muted}}>→</span>
        <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px 10px",color:Q.text,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>

      {!data&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {data&&(
        <div>
          <GCard glow={Q.gold} style={{padding:18,marginBottom:12}}>
            <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,
              marginBottom:4,fontFamily:"'Space Grotesk',system-ui"}}>Tu comisión</div>
            <div style={{color:Q.gold,fontWeight:900,fontSize:30,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(data.comision)}</div>
            <div style={{color:Q.muted,fontSize:11,marginTop:4}}>
              {fmt(data.pct_ggr)}% GGR + {fmt(data.pct_ventas)}% ventas</div>
          </GCard>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[["Ventas",data.apostado,Q.cyan],["GGR",data.ggr,Q.green],
              ["Jugadas",data.jugadas,Q.violet2,true]].map(([l,v,c,esNum])=>(
              <GCard key={l} style={{padding:"12px 8px",textAlign:"center"}}>
                <div style={{color:c,fontWeight:800,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>{esNum?v:ars(v)}</div>
                <div style={{color:Q.muted,fontSize:9,marginTop:2}}>{l}</div>
              </GCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfluencerCombosIA({ agencia, onSesionExpirada }){
  const [combos,setCombos]=useState(null);
  const [abierto,setAbierto]=useState(null);   // id del combo con links desplegados
  const [copiado,setCopiado]=useState("");
  const [editando,setEditando]=useState(null);   // combo en edición de imagen
  const [histo,setHisto]=useState(false);   // ver historial (incluye expirados vencidos)

  useEffect(()=>{
    fetch(`${API_URL}/api/influencer/me/combos-ia?historial=${histo}`,{headers:authHeaders(agencia.token)})
      .then(r=>{ if(r.status===401){ onSesionExpirada(); return {combos:[]}; } return r.json(); })
      .then(d=>setCombos(d.combos||[])).catch(()=>setCombos([]));
  // eslint-disable-next-line
  },[histo]);

  const ref = agencia.codigo_ref || "";
  const copiar=(txt,cual)=>{
    try{ navigator.clipboard.writeText(txt); setCopiado(cual);
      setTimeout(()=>setCopiado(""),1500);
    }catch(e){}
  };

  return(
    <div>
      <div style={{color:Q.muted,fontSize:11,marginBottom:12,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Compartí estos combos con tu firma. Quien juegue por tu link suma a tu comisión.</div>

      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["activos","⚡ Activos",false],["histo","🕓 Historial",true]].map(([k,l,v])=>(
          <button key={k} onClick={()=>setHisto(v)} style={{flex:1,
            background:histo===v?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
            border:`1px solid ${histo===v?Q.cyan:Q.border}`,borderRadius:9,padding:"8px",
            cursor:"pointer",color:histo===v?Q.cyan:Q.muted,fontSize:12,fontWeight:700,
            fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>

      {!combos&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {combos&&combos.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
        padding:20,fontFamily:"'Space Grotesk',system-ui"}}>No hay combos de la IA por ahora</div>}

      {(combos||[]).map(c=>{
        const abierta=abierto===c.id;
        const linkTg=`https://t.me/quartzplay_bot?start=${ref}_c${c.id}`;
        const linkWeb=`https://valiant-gentleness-production-a779.up.railway.app/?ref=${ref}&combo=${c.id}`;
        return(
          <GCard key={c.id} style={{padding:"12px 14px",marginBottom:8}}>
            <div onClick={()=>setAbierto(abierta?null:c.id)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                gap:8,cursor:"pointer"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre}
                  {c.es_ia&&<span style={{background:`${Q.violet}33`,border:`1px solid ${Q.violet}`,
                    borderRadius:10,padding:"1px 7px",fontSize:9,color:Q.violet2,marginLeft:6}}>🤖 IA</span>}
                  {c.expirado&&<span style={{background:`${Q.amber}22`,border:`1px solid ${Q.amber}`,
                    borderRadius:10,padding:"1px 7px",fontSize:9,color:Q.amber,marginLeft:6}}>expirado</span>}
                  {!c.expirado&&c.estado==="activo"&&<span style={{background:`${Q.green}22`,border:`1px solid ${Q.green}`,
                    borderRadius:10,padding:"1px 7px",fontSize:9,color:Q.green,marginLeft:6}}>activo</span>}</div>
                <div style={{color:Q.muted,fontSize:10}}>{c.picks.length} picks · {fmt(c.odd)}x</div>
              </div>
              <span style={{color:Q.muted,fontSize:16}}>{abierta?"▾":"›"}</span>
            </div>

            {abierta&&(
              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
                {c.picks.map((p,j)=>(
                  <div key={j} style={{color:Q.muted,fontSize:11,marginBottom:4,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {(p.home||p.h||"")}{(p.home||p.h)?" · ":""}
                    <span style={{color:Q.cyan}}>{p.sel||p.label||""}</span>
                    <span style={{color:Q.violet2}}> @{fmt(p.odd)}</span></div>
                ))}
                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
                  <button onClick={()=>copiar(linkTg,`tg${c.id}`)} style={{background:`${Q.cyan}18`,
                    border:`1px solid ${Q.cyan}`,borderRadius:9,padding:"9px",cursor:"pointer",
                    color:Q.cyan,fontSize:12,fontWeight:700,textAlign:"left",
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {copiado===`tg${c.id}`?"✅ Copiado":"📲 Link Telegram con tu firma"}</button>
                  <button onClick={()=>copiar(linkWeb,`web${c.id}`)} style={{background:`${Q.violet}18`,
                    border:`1px solid ${Q.violet}`,borderRadius:9,padding:"9px",cursor:"pointer",
                    color:Q.violet2,fontSize:12,fontWeight:700,textAlign:"left",
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {copiado===`web${c.id}`?"✅ Copiado":"🌐 Link web con tu firma"}</button>
                  <button onClick={()=>copiar(ref,`ref${c.id}`)} style={{background:"rgba(255,255,255,0.05)",
                    border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px",cursor:"pointer",
                    color:Q.muted,fontSize:12,fontWeight:700,textAlign:"left",
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {copiado===`ref${c.id}`?"✅ Copiado":`🎟️ Copiar tu código (${ref}) para agencia`}</button>
                  <div style={{height:1,background:Q.dim,margin:"4px 0"}}/>
                  <button onClick={()=>copiar(textoCombo(c,ref,linkTg),`txt${c.id}`)}
                    style={{background:`${Q.green}18`,border:`1px solid ${Q.green}`,borderRadius:9,
                    padding:"9px",cursor:"pointer",color:Q.green,fontSize:12,fontWeight:700,
                    textAlign:"left",fontFamily:"'Space Grotesk',system-ui"}}>
                    {copiado===`txt${c.id}`?"✅ Texto copiado":"📝 Copiar texto para redes"}</button>
                  <button onClick={()=>descargarPlacaCombo(c,ref,linkTg)}
                    style={{background:`${Q.gold}18`,border:`1px solid ${Q.gold}`,borderRadius:9,
                    padding:"9px",cursor:"pointer",color:Q.gold,fontSize:12,fontWeight:700,
                    textAlign:"left",fontFamily:"'Space Grotesk',system-ui"}}>
                    🖼️ Descargar placa (imagen)</button>
                  <button onClick={()=>setEditando(c)}
                    style={{background:`${Q.violet}18`,border:`1px solid ${Q.violet}`,borderRadius:9,
                    padding:"9px",cursor:"pointer",color:Q.violet2,fontSize:12,fontWeight:700,
                    textAlign:"left",fontFamily:"'Space Grotesk',system-ui"}}>
                    🎨 Editar imagen (crear placa)</button>
                </div>
              </div>
            )}
          </GCard>
        );
      })}
      {editando&&<EditorPlaca combo={editando} codigoRef={agencia.codigo_ref||""}
        link={`https://t.me/quartzplay_bot?start=${agencia.codigo_ref||""}_c${editando.id}`}
        onCerrar={()=>setEditando(null)}/>}
    </div>
  );
}

function InfluencerCombos({ agencia, onSesionExpirada }){
  const [combos,setCombos]=useState(null);
  const [crear,setCrear]=useState(false);
  const [copiado,setCopiado]=useState("");
  const [abierto,setAbierto]=useState(null);
  const [editando,setEditando]=useState(null);
  const ref = agencia.codigo_ref || "";
  const copiar=(txt,cual)=>{ try{ navigator.clipboard.writeText(txt);
    setCopiado(cual); setTimeout(()=>setCopiado(""),1500); }catch(e){} };

  const cargar=async()=>{
    try{
      const r=await fetch(`${API_URL}/api/influencer/me/combos`,
        {headers:authHeaders(agencia.token)});
      if(r.status===401){ onSesionExpirada(); return; }
      if(r.ok) setCombos((await r.json()).combos||[]);
    }catch(e){}
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[]);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
          fontFamily:"'Space Grotesk',system-ui"}}>Mis combos</div>
        <Btn label={crear?"Cancelar":"+ Nuevo"} onClick={()=>setCrear(c=>!c)}
          color={Q.violet} size="sm"/>
      </div>

      {crear&&<CrearComboInfluencer agencia={agencia}
        onListo={()=>{setCrear(false);cargar();}} onSesionExpirada={onSesionExpirada}/>}

      {!combos&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {combos&&combos.length===0&&!crear&&<div style={{color:Q.muted,fontSize:12,
        textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
        Todavía no creaste combos</div>}

      {(combos||[]).map(c=>{
        const abierta=abierto===c.id;
        const codOut=c.codigo||ref;
        const linkTg=`https://t.me/quartzplay_bot?start=${ref}_c${c.id}`;
        const linkWeb=`https://valiant-gentleness-production-a779.up.railway.app/?ref=${ref}&combo=${c.id}`;
        return(
          <GCard key={c.id} style={{padding:"12px 14px",marginBottom:8}}>
            <div onClick={()=>setAbierto(abierta?null:c.id)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                gap:8,cursor:"pointer"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre}
                  {c.codigo&&<span style={{background:`${Q.cyan}22`,border:`1px solid ${Q.cyan}`,
                    borderRadius:10,padding:"1px 8px",fontSize:10,color:Q.cyan,marginLeft:6}}>{c.codigo}</span>}</div>
                <div style={{color:Q.muted,fontSize:10}}>{c.picks.length} picks · {fmt(c.odd)}x{c.fecha?` · ${c.fecha}`:""}</div>
              </div>
              <span style={{color:Q.muted,fontSize:16}}>{abierta?"▾":"›"}</span>
            </div>

            {abierta&&(
              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
                {c.picks.map((p,j)=>(
                  <div key={j} style={{color:Q.muted,fontSize:11,marginBottom:4,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {(p.home||p.h||"")}{(p.home||p.h)?" · ":""}
                    <span style={{color:Q.cyan}}>{p.sel||p.label||""}</span>
                    <span style={{color:Q.violet2}}> @{fmt(p.odd)}</span></div>
                ))}
                {/* Ganancias */}
                <div style={{marginTop:8,marginBottom:6}}>
                  {[5000,10000,20000].map(m=>(
                    <div key={m} style={{display:"flex",justifyContent:"space-between",padding:"1px 0"}}>
                      <span style={{color:Q.muted,fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>Apostás {ars(m)}</span>
                      <span style={{color:Q.green,fontWeight:700,fontSize:11,
                        fontFamily:"'Space Grotesk',system-ui"}}>→ {ars(Math.round(m*(c.odd||1)))}</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
                  <button onClick={()=>copiar(linkTg,`tg${c.id}`)} style={{background:`${Q.cyan}18`,
                    border:`1px solid ${Q.cyan}`,borderRadius:9,padding:"9px",cursor:"pointer",
                    color:Q.cyan,fontSize:12,fontWeight:700,textAlign:"left",
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {copiado===`tg${c.id}`?"✅ Copiado":"📲 Link Telegram con tu firma"}</button>
                  <button onClick={()=>copiar(linkWeb,`web${c.id}`)} style={{background:`${Q.violet}18`,
                    border:`1px solid ${Q.violet}`,borderRadius:9,padding:"9px",cursor:"pointer",
                    color:Q.violet2,fontSize:12,fontWeight:700,textAlign:"left",
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {copiado===`web${c.id}`?"✅ Copiado":"🌐 Link web con tu firma"}</button>
                  <button onClick={()=>copiar(codOut,`ref${c.id}`)} style={{background:"rgba(255,255,255,0.05)",
                    border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px",cursor:"pointer",
                    color:Q.muted,fontSize:12,fontWeight:700,textAlign:"left",
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {copiado===`ref${c.id}`?"✅ Copiado":`🎟️ Copiar código (${codOut}) para agencia`}</button>
                  <div style={{height:1,background:Q.dim,margin:"4px 0"}}/>
                  <button onClick={()=>copiar(textoCombo(c,ref,linkTg),`txt${c.id}`)}
                    style={{background:`${Q.green}18`,border:`1px solid ${Q.green}`,borderRadius:9,
                    padding:"9px",cursor:"pointer",color:Q.green,fontSize:12,fontWeight:700,
                    textAlign:"left",fontFamily:"'Space Grotesk',system-ui"}}>
                    {copiado===`txt${c.id}`?"✅ Texto copiado":"📝 Copiar texto para redes"}</button>
                  <button onClick={()=>descargarPlacaCombo(c,ref,linkTg)}
                    style={{background:`${Q.gold}18`,border:`1px solid ${Q.gold}`,borderRadius:9,
                    padding:"9px",cursor:"pointer",color:Q.gold,fontSize:12,fontWeight:700,
                    textAlign:"left",fontFamily:"'Space Grotesk',system-ui"}}>
                    🖼️ Descargar placa (imagen)</button>
                  <button onClick={()=>setEditando(c)}
                    style={{background:`${Q.violet}18`,border:`1px solid ${Q.violet}`,borderRadius:9,
                    padding:"9px",cursor:"pointer",color:Q.violet2,fontSize:12,fontWeight:700,
                    textAlign:"left",fontFamily:"'Space Grotesk',system-ui"}}>
                    🎨 Editar imagen (Instagram)</button>
                </div>
              </div>
            )}
          </GCard>
        );
      })}

      {editando&&<EditorPlaca combo={editando} codigoRef={ref}
        link={`https://t.me/quartzplay_bot?start=${ref}_c${editando.id}`}
        onCerrar={()=>setEditando(null)}/>}
    </div>
  );
}

function CrearComboInfluencer({ agencia, onListo, onSesionExpirada }){
  const [nombre,setNombre]=useState("");
  const [codigo,setCodigo]=useState("");
  const [picks,setPicks]=useState([]);
  const [prematch,setPrematch]=useState(null);
  const [liga,setLiga]=useState(null);
  const [busqueda,setBusqueda]=useState("");
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);

  useEffect(()=>{
    fetch(`${API_BOT}/api/live/prematch`)
      .then(r=>r.ok?r.json():null)
      .then(data=>setPrematch(data?.sports || []))
      .catch(()=>setPrematch([]));
  },[]);

  const hasPick=(home,sel)=>picks.some(p=>p.home===home&&p.sel===sel);
  const togglePick=(ev,sport,label,odd)=>{
    setPicks(ps=>{
      // un pick por partido: si ya hay uno de ese partido, lo reemplaza
      const sinEse=ps.filter(p=>!(p.home===ev.home&&p.away===ev.away));
      if(ps.some(p=>p.home===ev.home&&p.sel===label)) return sinEse;
      return [...sinEse,{home:ev.home,away:ev.away,sel:label,odd,
        sport,event_id:ev.event_id,sport_key:ev.sport_key}];
    });
  };
  const quitarPick=(i)=>setPicks(ps=>ps.filter((_,j)=>j!==i));

  const oddTotal=picks.reduce((a,p)=>a*(parseFloat(p.odd)||1),1);

  const guardar=async()=>{
    if(picks.length===0){ setMsg("Elegí al menos un partido"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API_URL}/api/influencer/me/combos`,{
        method:"POST",headers:{"Content-Type":"application/json",...authHeaders(agencia.token)},
        body:JSON.stringify({nombre,codigo,picks:picks.map(p=>({
          home:p.home,away:p.away,sel:p.sel,odd:parseFloat(p.odd),
          sport:p.sport,event_id:p.event_id,sport_key:p.sport_key}))}),
      });
      if(r.status===401){ onSesionExpirada(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("✅ Combo creado");
      setTimeout(onListo,700);
    }catch(e){ setMsg("⚠️ "+e.message); setProc(false); }
  };

  return(
    <GCard glow={Q.violet} style={{padding:16,marginBottom:14}}>
      <div style={{color:Q.violet2,fontWeight:700,fontSize:14,marginBottom:12,
        fontFamily:"'Space Grotesk',system-ui"}}>⚡ Nuevo combo · elegí de la oferta real</div>
      <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder="Nombre del combo"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
          borderRadius:9,padding:"9px 12px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}/>
      <input value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())}
        placeholder="Código de salida (opcional, ej: JUANTIPS)"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
          borderRadius:9,padding:"9px 12px",color:Q.text,fontSize:16,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}/>

      {/* Picks elegidos + ganancias */}
      {picks.length>0&&(
        <GCard glow={Q.gold} style={{padding:12,marginBottom:12,
          background:`linear-gradient(135deg,${Q.violet}10,${Q.gold}08)`}}>
          <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,
            marginBottom:8,fontFamily:"'Space Grotesk',system-ui"}}>Tu combo ({picks.length})</div>
          {picks.map((p,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"5px 0",borderBottom:i<picks.length-1?`1px solid ${Q.dim}`:"none"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontSize:12,fontWeight:600,
                  fontFamily:"'Space Grotesk',system-ui"}}>{p.sel}</div>
                <div style={{color:Q.muted,fontSize:9}}>{p.home} vs {p.away}</div>
              </div>
              <span style={{color:Q.cyan,fontWeight:700,fontSize:13,marginRight:8,
                fontFamily:"'Space Grotesk',system-ui"}}>{fmt(p.odd)}</span>
              <span onClick={()=>quitarPick(i)} style={{color:Q.red,fontSize:11,cursor:"pointer"}}>✕</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            marginTop:10,paddingTop:8,borderTop:`1px solid ${Q.violet}44`}}>
            <span style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
              fontFamily:"'Space Grotesk',system-ui"}}>Cuota total</span>
            <span style={{color:Q.gold,fontWeight:900,fontSize:22,
              fontFamily:"'Space Grotesk',system-ui"}}>{fmt(oddTotal)}x</span>
          </div>
          <div style={{marginTop:8}}>
            <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,
              marginBottom:4,fontFamily:"'Space Grotesk',system-ui"}}>Ganancias</div>
            {[5000,10000,20000].map(m=>(
              <div key={m} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}>
                <span style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
                  Apostás {ars(m)}</span>
                <span style={{color:Q.green,fontWeight:700,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui"}}>→ {ars(Math.round(m*oddTotal))}</span>
              </div>
            ))}
          </div>
        </GCard>
      )}

      <Btn label={proc?"GUARDANDO...":"💾 Crear combo"} onClick={guardar}
        color={Q.violet} full disabled={proc||picks.length===0}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}

      {/* Oferta de prematch para elegir */}
      <div style={{marginTop:16}}>
        <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
          marginBottom:8,fontFamily:"'Space Grotesk',system-ui"}}>📋 Elegí partidos</div>
        {!prematch&&<GCard style={{padding:20,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
            Cargando cuotas...</div></GCard>}
        {prematch&&prematch.length>0&&(
          <FiltroEventos ligas={prematch} liga={liga} setLiga={setLiga}
            busqueda={busqueda} setBusqueda={setBusqueda}
            total={prematch.reduce((a,d)=>a+(d.events||[]).length,0)}/>
        )}
        {prematch&&prematch.length===0&&<GCard style={{padding:20,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
            No hay eventos con cuotas ahora</div></GCard>}
        {filtrarDeportes(prematch||[], liga, busqueda).map(d=>(
          <GCard key={d.name} style={{padding:14,marginBottom:10}}>
            <div style={{color:Q.violet2,fontWeight:700,fontSize:13,marginBottom:10,
              fontFamily:"'Space Grotesk',system-ui"}}>{d.icon} {d.name}</div>
            {(d.events||[]).map(ev=>(
              <div key={ev.id||(ev.h+ev.a)} style={{marginBottom:12,
                borderBottom:`1px solid ${Q.dim}`,paddingBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                    <TeamLogo name={ev.h} size={20}/>
                    <span style={{color:Q.text,fontWeight:600,fontSize:12,
                      fontFamily:"'Space Grotesk',system-ui",overflow:"hidden",
                      textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.h} vs {ev.a}</span>
                    <TeamLogo name={ev.a} size={20}/>
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
                      style={{flex:"1 1 0",minWidth:0,overflow:"hidden",
                        background:hasPick(ev.h,opt.label)
                          ?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`
                          :"rgba(255,255,255,0.04)",
                        border:`1.5px solid ${hasPick(ev.h,opt.label)?Q.cyan:Q.border}`,
                        borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{color:Q.muted,fontSize:9,overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{opt.label}</div>
                      <div style={{color:hasPick(ev.h,opt.label)?Q.cyan:Q.text,
                        fontWeight:700,fontSize:15,
                        fontFamily:"'Space Grotesk',system-ui"}}>{opt.odd}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </GCard>
        ))}
      </div>
    </GCard>
  );
}

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
      ) : agencia.debe_cambiar_pass ? (
        <div style={{maxWidth:440,margin:"0 auto",padding:"40px 16px"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:44,marginBottom:8}}>🔐</div>
            <div style={{color:Q.text,fontWeight:800,fontSize:18,
              fontFamily:"'Space Grotesk',system-ui"}}>Bienvenido/a {agencia.name}</div>
          </div>
          <CambiarMiPassword agencia={agencia} obligado
            onListo={()=>setAgencia(a=>({...a,debe_cambiar_pass:false}))}/>
          <button onClick={()=>setAgencia(null)} style={{width:"100%",
            background:"transparent",border:`1px solid ${Q.border}`,borderRadius:9,
            padding:"10px",color:Q.muted,fontSize:12,cursor:"pointer",marginTop:8,
            fontFamily:"'Space Grotesk',system-ui"}}>Salir</button>
        </div>
      ) : agencia.tipo==="influencer" ? (
        <InfluencerPanel agencia={agencia}
          onLogout={()=>setAgencia(null)}
          onSesionExpirada={sesionExpirada}/>
      ) : (
        <AgenciaPanel agencia={agencia}
          onLogout={()=>setAgencia(null)}
          onSesionExpirada={sesionExpirada}/>
      )}
    </div>
  );
}
