import { useState, useEffect, useMemo, Component } from "react";

// ═══════════════════════════════════════════════════════════════
// QUARTZPLAY SPORTS — Web App Telegram completa
// Datos reales: The Odds API + Football API
// Mercados expandidos: 1X2, O/U, BTTS, Handicap
// Códigos QP desde la web
// ═══════════════════════════════════════════════════════════════
// ── TEMAS ─────────────────────────────────────────────────────
// Dos paletas con las MISMAS claves, así los ~1000 usos de Q.algo
// siguen funcionando sin tocarlos. Al cambiar de tema se reasigna Q
// y la raíz vuelve a renderizar: como ningún componente está
// memoizado, todo el árbol toma los colores nuevos.
//
// Nota de diseño: en claro el dorado de las cuotas se oscurece a
// ámbar tostado, porque #FFC531 sobre blanco no se lee. El dorado
// brillante sobrevive solo como FONDO (goldBg), con texto oscuro.
const TEMAS = {
  oscuro: {
    void:"#050914", deep:"#080E1F", dark:"#0D1530",
    surface:"#0D1530", card:"#111B3B", inset:"#0A1128",
    glass:"linear-gradient(160deg,rgba(43,107,255,0.06),rgba(123,63,228,0.03))",
    violet:"#2B6BFF", violet2:"#7B3FE4",
    cyan:"#5A8CFF", green:"#25D07A",
    pink:"#FF2D55", amber:"#FFA51F",
    gold:"#FFC531", goldBg:"#FFC531", red:"#FF3B5C",
    blue:"#2B6BFF", teal:"#5A8CFF",
    text:"#E9EFFF", muted:"#93A0C8", dim:"#5A6690",
    border:"#1E2A52",
  },
  claro: {
    void:"#EEF1F8", deep:"#FFFFFF", dark:"#FFFFFF",
    surface:"#FFFFFF", card:"#F6F8FD", inset:"#F1F4FB",
    glass:"linear-gradient(160deg,rgba(31,90,224,0.05),rgba(106,47,208,0.02))",
    violet:"#1F5AE0", violet2:"#6A2FD0",
    cyan:"#1B54C8", green:"#0E8F52",
    pink:"#D81B45", amber:"#B4700A",
    gold:"#8A5E00", goldBg:"#FFC531", red:"#C81E3C",
    blue:"#1F5AE0", teal:"#1B54C8",
    text:"#0E1A33", muted:"#5A6790", dim:"#8894B8",
    border:"#D7DEEF",
  },
};

function temaGuardado(){
  try{ return localStorage.getItem("qp_tema")==="claro" ? "claro" : "oscuro"; }
  catch(e){ return "oscuro"; }
}

let TEMA = temaGuardado();
let Q = TEMAS[TEMA];

function aplicarTema(nombre){
  TEMA = nombre==="claro" ? "claro" : "oscuro";
  Q = TEMAS[TEMA];
  try{ localStorage.setItem("qp_tema", TEMA); }catch(e){}
  try{ document.body.style.background = Q.void; }catch(e){}
}

// Superposiciones (hover, vidrio). En claro tienen que oscurecer,
// no aclarar: blanco sobre blanco no se ve.
function ov(a){
  return TEMA==="claro" ? `rgba(15,26,51,${a})` : `rgba(255,255,255,${a})`;
}

// Botón para alternar. Se usa en las tres superficies.
function BotonTema({ tema, onCambiar, compacto }){
  const claro = tema==="claro";
  return(
    <button onClick={()=>onCambiar(claro?"oscuro":"claro")}
      aria-label={claro?"Cambiar a modo noche":"Cambiar a modo día"}
      title={claro?"Modo noche":"Modo día"}
      style={{width:compacto?30:34,height:compacto?30:34,borderRadius:"50%",
        flexShrink:0,background:"transparent",border:`1px solid ${Q.border}`,
        cursor:"pointer",display:"flex",alignItems:"center",
        justifyContent:"center",padding:0}}>
      <svg width={compacto?15:17} height={compacto?15:17} viewBox="0 0 24 24"
        fill="none" stroke={Q.muted} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round">
        {claro
          ? <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>
          : <><circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></>}
      </svg>
    </button>
  );
}

// Tipografia: condensada para numeros y titulos, Inter para el resto.
const F_NUM  = "'Barlow Condensed','Inter',system-ui,sans-serif";
const F_BODY = "'Inter',system-ui,sans-serif";

const API = "https://amusing-vision-production.up.railway.app";

const fmt = n => Number(n||0).toFixed(2);
const ars = n => "$" + Math.round(n||0).toLocaleString("es-AR");

// Símbolos de moneda (deben coincidir con MONEDAS del backend)
const SIMBOLOS = {
  ARS:"$", BRL:"R$", UYU:"$U", CLP:"$", PYG:"₲", BOB:"Bs",
  PEN:"S/", COP:"$", VES:"Bs", MXN:"$", USD:"US$", EUR:"€",
};
// Formatea un monto con el símbolo de la moneda del usuario
const money = (n, moneda) => (SIMBOLOS[moneda]||"$") + Math.round(n||0).toLocaleString("es-AR");
const prod = a => a.reduce((x,y)=>x*y,1);
// El código lo genera el servidor y queda guardado en la base.
// Antes se sorteaba acá con Math.random() y no existía en ningún lado:
// el cajero lo buscaba y siempre daba "no encontrado".
// event_id y sport_key son los que permiten liquidar por ID contra
// Sportradar en vez de emparejar por nombre. Antes se perdian en este map.
function normalizarPicks(picks){
  return picks.map(p=>({
    home: p.h || p.home || "",
    away: p.a || p.away || "",
    sel:  p.label || p.sel || "",
    odd:  p.odd,
    sport: p.sport || "",
    event_id:  p.event_id || p.id || "",
    sport_key: p.sport_key || "",
    market:    p.market || "",
  }));
}

// Apuesta del cliente desde la app. modo: 'saldo' | 'bono' | 'reservada'
async function enviarApuesta({ picks, stake, modo, infCode, mismoPartido }){
  const initData = window.Telegram?.WebApp?.initData || "";
  const body = {
    init_data: initData,
    modo,
    stake: Math.round(stake||0),
    picks: normalizarPicks(picks),
  };
  if(mismoPartido) body.mismo_partido = true;
  if(infCode){ body.inf_code = infCode; body.codigo_influencer = infCode; }

  let r;
  try{
    r = await fetch(`${API}/api/apuesta`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body),
    });
  }catch(e){ throw new Error("Sin conexión con el servidor"); }
  if(!r.ok){
    const e = await r.json().catch(()=>({}));
    throw new Error(e.detail || `Error ${r.status}`);
  }
  return r.json();
}

async function crearBoleto(picks, infCode){
  const body = { picks: normalizarPicks(picks) };
  if(infCode){ body.inf_code = infCode; body.codigo_influencer = infCode; }

  let r;
  try {
    r = await fetch(`${API}/api/betslip`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body),
    });
  } catch(e) {
    throw new Error("Sin conexión con el servidor");
  }
  if(!r.ok){
    const e = await r.json().catch(()=>({}));
    throw new Error(e.detail || `Error ${r.status}`);
  }
  return r.json();
}


// ── COMPONENTS ────────────────────────────────────────────────
function GCard({ children, style={}, glow, onClick }){
  return(
    <div onClick={onClick} style={{
      background:Q.surface,
      border:`1px solid ${glow?glow+"55":Q.border}`,
      borderRadius:12,
      position:"relative", overflow:"hidden", maxWidth:"100%", minWidth:0,
      cursor:onClick?"pointer":"default", ...style,
    }}>
      {glow&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,
        background:`linear-gradient(90deg,${glow},transparent)`,pointerEvents:"none"}}/>}
      {children}
    </div>
  );
}

// Las posiciones se calculan UNA vez, no en cada render.
// Antes se recalculaban ~2 veces por segundo por el contador del pozo.
// Las particulas flotantes se retiraron en el rediseno: restaban jerarquia
// y competian con las cuotas por la atencion. Se deja el componente vacio
// para no tocar los lugares donde ya estaba puesto.
function Particles(){ return null; }

function QPLogo({ size=20 }){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <svg width={size} height={size} viewBox="0 0 24 24">
        <defs>
          <linearGradient id="qgls" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={Q.violet}/>
            <stop offset="100%" stopColor={Q.cyan}/>
          </linearGradient>
        </defs>
        <polygon points="12,2 20,8 20,16 12,22 4,16 4,8" fill="none" stroke="url(#qgls)" strokeWidth={1.5}/>
        <polygon points="12,5 18,9.5 18,15 12,19 6,15 6,9.5" fill="url(#qgls)" opacity={0.3}/>
        <circle cx={12} cy={12} r={2} fill={Q.cyan} opacity={0.9}/>
      </svg>
      <span style={{
        fontFamily:"'Inter',system-ui", fontWeight:900, fontSize:size,
        background:`linear-gradient(135deg,${Q.violet2},${Q.cyan})`,
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        backgroundClip:"text", letterSpacing:-0.5,
      }}>QuartzPlay</span>
    </div>
  );
}

function HBadge({ label, color=Q.violet }){
  return(
    <span style={{
      background:`linear-gradient(135deg,${color}33,${color}11)`,
      border:`1px solid ${color}66`, borderRadius:20,
      padding:"2px 10px", fontSize:9, fontWeight:700, color,
      letterSpacing:0.5, fontFamily:"'Inter',system-ui",
    }}>{label}</span>
  );
}

function NDiv({ color=Q.violet }){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,margin:"8px 0"}}>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${color}44)`}}/>
      <div style={{width:4,height:4,borderRadius:"50%",background:color,boxShadow:`0 0 8px ${color}`}}/>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,${color}44,transparent)`}}/>
    </div>
  );
}

function LiveDot({ color=Q.pink }){
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:color,
        boxShadow:`0 0 6px ${color}`,animation:"qPulse 1.2s ease-in-out infinite",display:"inline-block"}}/>
      <span style={{color,fontSize:9,fontWeight:700,letterSpacing:1,fontFamily:"'Inter',system-ui"}}>LIVE</span>
    </span>
  );
}

function QBtn({ label, icon, onClick, color=Q.violet, size="md", full=false, outline=false }){
  const h=size==="lg"?"52px":size==="sm"?"32px":"44px";
  const fs=size==="lg"?16:size==="sm"?11:13;
  return(
    <button onClick={onClick} style={{
      height:h, width:full?"100%":"auto",
      padding:`0 ${size==="sm"?"10px":"20px"}`,
      background:outline?"transparent":`linear-gradient(135deg,${color},${color}CC)`,
      border:`1px solid ${color}`, borderRadius:12,
      color:outline?color:"#fff", fontSize:fs, fontWeight:700, cursor:"pointer",
      display:"flex", alignItems:"center", justifyContent:"center", gap:7,
      letterSpacing:0.3, fontFamily:"'Inter',system-ui",
      boxShadow:outline?"none":`0 4px 20px ${color}44`,
      textTransform:"uppercase",
    }}>
      {icon&&<span style={{fontSize:fs+2}}>{icon}</span>}{label}
    </button>
  );
}

function BotMsg({ children, time="9:41" }){
  return(
    <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:16}}>
      <div style={{width:36,height:36,borderRadius:"50%",
        background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:18,flexShrink:0,boxShadow:`0 0 12px ${Q.violet}44`}}>⬡</div>
      {/* minWidth:0 es imprescindible: sin esto el ítem flex no se achica
          por debajo de su contenido y los nombres largos de equipos
          empujan toda la pantalla hacia la derecha. */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:Q.violet2,fontSize:11,fontWeight:700,marginBottom:3,
          fontFamily:"'Inter',system-ui",letterSpacing:0.3}}>QuartzPlay</div>
        <GCard style={{padding:"14px"}}>
          {children}
          <div style={{textAlign:"right",marginTop:6,color:Q.muted,fontSize:9,
            fontFamily:"'Inter',system-ui"}}>{time} ✓✓</div>
        </GCard>
      </div>
    </div>
  );
}

function UserMsg({ children, time="9:41" }){
  return(
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
      <GCard glow={Q.violet} style={{padding:"12px 14px",maxWidth:"75%",
        background:`linear-gradient(135deg,${Q.violet}22,${Q.cyan}08)`}}>
        <div style={{color:Q.text,fontSize:13,fontFamily:"'Inter',system-ui"}}>{children}</div>
        <div style={{textAlign:"right",marginTop:4,color:Q.muted,fontSize:9}}>{time} ✓✓</div>
      </GCard>
    </div>
  );
}

function QKB({ rows, onPress }){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
      {rows.map((row,ri)=>(
        <div key={ri} style={{display:"flex",gap:6}}>
          {row.map((btn,bi)=>(
            <button key={bi} onClick={()=>onPress&&onPress(btn.action)} style={{
              flex:1,
              background:btn.primary?`linear-gradient(135deg,${btn.color||Q.violet},${btn.color2||Q.cyan})`:ov(0.04),
              border:`1px solid ${btn.primary?(btn.color||Q.violet)+"88":Q.border}`,
              borderRadius:10, padding:"11px 6px", cursor:"pointer",
              color:"#fff", fontSize:12, fontWeight:btn.primary?700:500,
              fontFamily:"'Inter',system-ui",
              textTransform:btn.primary?"uppercase":"none",
              letterSpacing:btn.primary?0.3:0,
              boxShadow:btn.primary?`0 4px 16px ${btn.color||Q.violet}44`:"none",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}>
              {btn.icon&&<span style={{fontSize:14}}>{btn.icon}</span>}{btn.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function TgHeader({ title, sub, onBack }){
  return(
    <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
      padding:"10px 16px",display:"flex",alignItems:"center",gap:12,
      position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
        background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
      {onBack&&<button onClick={onBack} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:26,cursor:"pointer",padding:0,lineHeight:1}}>‹</button>}
      <div style={{width:40,height:40,borderRadius:"50%",
        background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:20,flexShrink:0,boxShadow:`0 0 14px ${Q.violet}66`}}>⬡</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,fontFamily:"'Inter',system-ui"}}>{title}</div>
        {sub&&<div style={{color:Q.green,fontSize:11,marginTop:1}}>{sub}</div>}
      </div>
    </div>
  );
}

// ── TEAM LOGO — Iniciales con color único ─────────────────────
function hashColor(str){
  // Genera color único y consistente por nombre de equipo
  let h=0;
  for(let i=0;i<(str||"").length;i++) h=((h<<5)-h)+str.charCodeAt(i);
  h=Math.abs(h);
  const colors=[
    "#2B6BFF","#7B3FE4","#0E8F6F","#C4162A","#1B3A8C",
    "#E07A1F","#5B2D8E","#0B7A3E","#B01238","#1E4FA8",
    "#8A2BE2","#0F766E","#D4162B","#3B5BDB","#166534",
  ];
  return colors[h % colors.length];
}

// Intenta el escudo real de la API de fútbol; si no existe, iniciales.
// El 404 del servidor es la señal de "no hay escudo para este equipo".
function TeamLogo({ name, size=36 }){
  const [falloImg,setFalloImg]=useState(false);
  const initials = (name||"?").split(" ")
    .filter(w=>w.length>0)
    .slice(0,2)
    .map(w=>w[0].toUpperCase())
    .join("");
  const color = hashColor(name);
  const fontSize = size <= 28 ? size*0.42 : size*0.38;

  if(name && !falloImg){
    return(
      <div style={{
        width:size, height:size, borderRadius:"50%", flexShrink:0,
        background:Q.inset,
        border:`1px solid ${Q.border}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        overflow:"hidden",
      }}>
        <img
          src={`${API}/api/team-logo/nombre/${encodeURIComponent(name)}`}
          alt={name}
          onError={()=>setFalloImg(true)}
          loading="lazy"
          style={{width:"78%",height:"78%",objectFit:"contain"}}/>
      </div>
    );
  }

  return(
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      background:`linear-gradient(135deg,${color},${color}88)`,
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      <span style={{
        color:"#fff", fontWeight:700, fontSize,
        fontFamily:F_NUM, letterSpacing:0.3,
        lineHeight:1,
      }}>{initials||"?"}</span>
    </div>
  );
}

// ── ODDS ───────────────────────────────────────────────────────
function OddsButtons({ ev, market, bets, onToggle, live=false }){
  const markets = ev.markets || {};
  const mkt = markets[market] || {};
  const color = live?Q.pink:Q.violet;
  const home = ev.h||ev.home||"";
  const away = ev.a||ev.away||"";

  let outcomes = [];
  if(market==="h2h"){
    const L = mkt[home]||ev.odds?.L;
    const E = mkt["Draw"]||ev.odds?.E;
    const V = mkt[away]||ev.odds?.V;
    if(L) outcomes.push({label:home,short:home.split(" ")[0],val:L,type:"home"});
    if(E) outcomes.push({label:"Empate",short:"X",val:E,type:"draw"});
    if(V) outcomes.push({label:away,short:away.split(" ")[0],val:V,type:"away"});
  } else if(market==="totals"){
    const keys = Object.keys(mkt);
    const overKey = keys.find(k=>k.startsWith("Over"));
    const underKey = keys.find(k=>k.startsWith("Under"));
    const line = overKey ? overKey.replace("Over ","").replace("Over","") : "2.5";
    if(overKey) outcomes.push({label:`Más ${line}`,short:`+${line}`,val:mkt[overKey],type:"over"});
    if(underKey) outcomes.push({label:`Menos ${line}`,short:`-${line}`,val:mkt[underKey],type:"under"});
  } else if(market==="btts"){
    if(mkt["Yes"]) outcomes.push({label:"Ambos anotan",short:"Sí",val:mkt["Yes"],type:"yes"});
    if(mkt["No"])  outcomes.push({label:"No anotan ambos",short:"No",val:mkt["No"],type:"no"});
  } else if(market==="spreads"){
    Object.entries(mkt).slice(0,3).forEach(([k,v])=>{
      outcomes.push({label:k,short:k.split(" ").slice(-1)[0],val:v,type:k});
    });
  }

  if(!outcomes.length) return(
    <div style={{textAlign:"center",color:Q.dim,fontSize:10,padding:"6px 0",
      fontFamily:"'Inter',system-ui"}}>No disponible</div>
  );

  return(
    <div style={{display:"flex",gap:4}}>
      {outcomes.map((o,i)=>{
        const sel=bets.some(b=>b.id===ev.id&&b.label===o.label);
        return(
          <button key={i} onClick={()=>onToggle(ev,o.label,o.val,market)} style={{
            flex:"1 1 0",minWidth:0,overflow:"hidden",
            background:sel?color:Q.inset,
            border:`1px solid ${sel?color:Q.border}`,
            borderRadius:8,padding:"7px 3px",cursor:"pointer",textAlign:"center",
            transition:"all 0.13s",
          }}>
            <div style={{color:sel?"#fff":Q.dim,fontSize:8.5,fontFamily:F_BODY,
              fontWeight:600,letterSpacing:0.6,
              marginBottom:1,lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",
              whiteSpace:"nowrap",maxWidth:"100%"}}>{o.short||o.label}</div>
            <div style={{color:sel?"#fff":Q.gold,fontWeight:700,fontSize:17,
              lineHeight:1.05,fontFamily:F_NUM}}>{fmt(o.val)}</div>
            {live&&<div style={{color:sel?"#fff":Q.pink,fontSize:7,marginTop:1,
              fontWeight:700}}>● LIVE</div>}
          </button>
        );
      })}
    </div>
  );
}

// Mostrar TODOS los mercados de un evento en formato expandido
function AllMarketsView({ ev, bets, onToggle }){
  const markets = ev.markets || {};
  const availableMkts = Object.keys(markets).filter(k=>
    ["h2h","totals","btts","spreads"].includes(k)
  );
  if(!availableMkts.length) return null;

  const mktLabels = {
    h2h:"1X2 — Resultado", totals:"Over/Under",
    btts:"Ambos anotan", spreads:"Hándicap"
  };

  return(
    <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${Q.dim}`}}>
      {availableMkts.map(mkt=>(
        <div key={mkt} style={{marginBottom:8}}>
          <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",
            letterSpacing:1,fontFamily:"'Inter',system-ui",marginBottom:5}}>
            {mktLabels[mkt]||mkt}
          </div>
          <OddsButtons ev={ev} market={mkt} bets={bets} onToggle={onToggle}/>
        </div>
      ))}
    </div>
  );
}

// ── IDENTIDAD DEL USUARIO ─────────────────────────────────────
// Telegram firma los datos del usuario; el servidor valida esa firma.
// Si no hay firma válida no mostramos saldo: mejor nada que un número falso.
function useUsuario(){
  const [user,setUser]=useState({cargando:true});
  useEffect(()=>{
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData || "";
    if(!initData){
      setUser({cargando:false, autenticado:false});
      return;
    }
    fetch(`${API}/api/me`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({init_data:initData}),
    })
      .then(r=>r.ok?r.json():null)
      .then(d=>setUser({cargando:false, ...(d||{autenticado:false})}))
      .catch(()=>setUser({cargando:false, autenticado:false}));
  },[]);
  return user;
}

// Bloque para funciones que todavía no tienen respaldo en el servidor
function SinBackend({ titulo, detalle }){
  return(
    <GCard style={{padding:"26px 20px",textAlign:"center",margin:"12px 0"}}>
      <div style={{fontSize:30,marginBottom:10}}>🚧</div>
      <div style={{color:Q.text,fontWeight:700,fontSize:14,
        fontFamily:"'Inter',system-ui",marginBottom:6}}>{titulo}</div>
      <div style={{color:Q.muted,fontSize:12,lineHeight:1.5,
        fontFamily:"'Inter',system-ui"}}>{detalle}</div>
    </GCard>
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
function EstadisticasPartido({ ev, onCerrar }){
  const [tab,setTab]=useState("stats");
  const [stats,setStats]=useState(null);
  const [previa,setPrevia]=useState(null);
  const home=ev.h||ev.home; const away=ev.a||ev.away;
  const fecha=(ev.commence_time||ev.time||"").slice(0,10);
  const eid=ev.event_id||ev.id||"";

  useEffect(()=>{
    const srId=(typeof eid==="string"&&eid.startsWith("sr:sport_event:"))?`&event_id=${encodeURIComponent(eid)}`:"";
    const q=`home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&fecha=${fecha}${srId}`;
    fetch(`${API}/api/partido/stats?${q}`).then(r=>r.json()).then(setStats).catch(()=>setStats({disponible:false}));
    fetch(`${API}/api/partido/previa?${q}`).then(r=>r.json()).then(setPrevia).catch(()=>setPrevia({disponible:false}));
  // eslint-disable-next-line
  },[]);

  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(2,2,8,0.92)",
      display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.void,
        borderTop:`1px solid ${Q.violet}55`,borderRadius:"20px 20px 0 0",
        maxWidth:520,margin:"0 auto",width:"100%",maxHeight:"85vh",overflowY:"auto",
        padding:"18px 16px 30px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <TeamLogo name={home} size={24}/>
            <span style={{color:Q.text,fontWeight:700,fontSize:14,
              fontFamily:"'Inter',system-ui"}}>{home} vs {away}</span>
            <TeamLogo name={away} size={24}/>
          </div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {stats&&stats.marcador&&stats.marcador.home!=null&&(
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{color:Q.gold,fontWeight:900,fontSize:32,
              fontFamily:"'Inter',system-ui"}}>
              {stats.marcador.home} - {stats.marcador.away}</div>
            <div style={{color:Q.muted,fontSize:11,fontFamily:"'Inter',system-ui"}}>
              {stats.estado==="live"?"🔴 En vivo":stats.estado==="closed"?"Finalizado":stats.estado}</div>
          </div>
        )}

        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["stats","📊 Estadísticas"],["previa","📅 Historial"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,
              background:tab===k?`${Q.violet}33`:ov(0.04),
              border:`1px solid ${tab===k?Q.violet:Q.border}`,borderRadius:9,
              padding:"9px",cursor:"pointer",color:tab===k?Q.cyan:Q.muted,
              fontSize:12,fontWeight:700,fontFamily:"'Inter',system-ui"}}>{l}</button>
          ))}
        </div>

        {tab==="stats"&&(
          <div>
            {!stats&&<div style={{color:Q.muted,textAlign:"center",padding:20,
              fontFamily:"'Inter',system-ui"}}>Cargando...</div>}
            {stats&&(!stats.disponible||!stats.tiene_stats)&&(
              <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:24,
                fontFamily:"'Inter',system-ui"}}>
                📊 No hay estadísticas detalladas disponibles para este partido.
                {stats.disponible===false&&" El partido no se encontró en el proveedor."}</div>
            )}
            {stats&&stats.tiene_stats&&Array.isArray(stats.stats)&&stats.stats.map((s,i)=>{
              const tot=(s.home||0)+(s.away||0)||1;
              const ph=Math.round((s.home/tot)*100);
              return(
                <div key={i} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{color:Q.text,fontSize:13,fontWeight:700,
                      fontFamily:"'Inter',system-ui"}}>{s.home}{s.unidad}</span>
                    <span style={{color:Q.muted,fontSize:11,
                      fontFamily:"'Inter',system-ui"}}>{s.label}</span>
                    <span style={{color:Q.text,fontSize:13,fontWeight:700,
                      fontFamily:"'Inter',system-ui"}}>{s.away}{s.unidad}</span>
                  </div>
                  <div style={{display:"flex",height:6,borderRadius:3,overflow:"hidden",
                    background:ov(0.08)}}>
                    <div style={{width:`${ph}%`,background:Q.cyan}}/>
                    <div style={{width:`${100-ph}%`,background:Q.violet}}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab==="previa"&&(
          <div>
            {!previa&&<div style={{color:Q.muted,textAlign:"center",padding:20,
              fontFamily:"'Inter',system-ui"}}>Cargando...</div>}
            {previa&&(!previa.disponible||(previa.head_to_head||[]).length===0)&&(
              <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:24,
                fontFamily:"'Inter',system-ui"}}>
                📅 No hay historial disponible para este partido.</div>
            )}
            {previa&&Array.isArray(previa.head_to_head)&&previa.head_to_head.length>0&&(
              <div>
                <div style={{color:Q.muted,fontSize:11,marginBottom:8,textTransform:"uppercase",
                  letterSpacing:1,fontFamily:"'Inter',system-ui"}}>Últimos enfrentamientos</div>
                {previa.head_to_head.map((h,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",
                    padding:"8px 0",borderBottom:`1px solid ${Q.border}`}}>
                    <span style={{color:Q.text,fontSize:12,flex:1,
                      fontFamily:"'Inter',system-ui"}}>{h.home}</span>
                    <span style={{color:Q.gold,fontSize:12,fontWeight:700,margin:"0 10px",
                      fontFamily:"'Inter',system-ui"}}>{h.marcador}</span>
                    <span style={{color:Q.text,fontSize:12,flex:1,textAlign:"right",
                      fontFamily:"'Inter',system-ui"}}>{h.away}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EstadisticasPartidoBoton({ ev }){
  const [abierto,setAbierto]=useState(false);
  return(
    <>
      <button onClick={()=>setAbierto(true)} style={{width:"100%",marginTop:6,
        background:ov(0.04),border:`1px solid ${Q.cyan}44`,borderRadius:8,
        padding:"6px",cursor:"pointer",color:Q.cyan,fontSize:10,fontWeight:700,
        fontFamily:"'Inter',system-ui"}}>📊 Estadísticas y análisis</button>
      {abierto&&<EstadisticasPartido ev={ev} onCerrar={()=>setAbierto(false)}/>}
    </>
  );
}

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
    fetch(`${API}/api/event/${sportKey}/${ev.id}/markets`)
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
        fontFamily:"'Inter',system-ui"}}>
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
              letterSpacing:1,fontFamily:"'Inter',system-ui",
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
                    onClick={()=>onToggle(ev, etiqueta, cuota, k)}
                    style={{
                      background:sel?`linear-gradient(135deg,${color}44,${Q.violet}22)`
                                    :ov(0.04),
                      border:`1.5px solid ${sel?color:Q.border}`,
                      borderRadius:9,padding:"7px 6px",cursor:"pointer",
                      display:"flex",alignItems:"center",
                      justifyContent:"space-between",gap:6,minWidth:0,
                    }}>
                    <span style={{color:Q.muted,fontSize:10,
                      fontFamily:"'Inter',system-ui",
                      overflow:"hidden",textOverflow:"ellipsis",
                      whiteSpace:"nowrap",flex:1,textAlign:"left"}}>{etiqueta}</span>
                    <span style={{color:sel?color:Q.text,fontWeight:700,fontSize:12,
                      fontFamily:"'Inter',system-ui",flexShrink:0}}>
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
          fontFamily:"'Inter',system-ui"}}>
          Buscando córners, tarjetas y goleadores...
        </div>
      )}
    </div>
  );
}

// ── BETSLIP FLOTANTE ───────────────────────────────────────────
function FloatingBetslip({ bets, onBet, onClear, onLocal, color=Q.violet, live=false }){
  const [monto,setMonto]=useState(10000);
  const [genCodigo,setGenCodigo]=useState(false);
  const tot=bets.length?prod(bets.map(b=>b.odd)):1;
  if(!bets.length) return null;
  return(
    <div style={{position:"fixed",left:"50%",transform:"translateX(-50%)",
      bottom:"max(10px, env(safe-area-inset-bottom))",
      width:"calc(100% - 24px)",maxWidth:496,zIndex:40}}>
      <GCard glow={color} style={{padding:"12px 14px",background:"rgba(6,6,18,0.97)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {live&&<LiveDot/>}
            <span style={{color:Q.muted,fontSize:12}}>{bets.length} picks · <span style={{color,fontWeight:700}}>{fmt(tot)}x</span></span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:Q.green,fontWeight:700,fontSize:12,fontFamily:"'Inter',system-ui"}}>
              {ars(Math.round(monto*tot))}
            </span>
            <button onClick={onClear} style={{background:"transparent",border:"none",
              color:Q.dim,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
          </div>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:8}}>
          {[5000,10000,20000,50000].map(v=>(
            <button key={v} onClick={()=>setMonto(v)} style={{
              flex:1,background:monto===v?`${color}33`:ov(0.04),
              border:`1px solid ${monto===v?color:Q.border}`,
              borderRadius:8,padding:"5px 2px",cursor:"pointer",
              color:monto===v?color:Q.muted,fontSize:9,fontWeight:monto===v?700:400,
              fontFamily:"'Inter',system-ui",
            }}>{v>=1000?`$${v/1000}K`:v}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:6}}>
          <QBtn label={`APOSTAR ${ars(monto)}`} full color={color} size="lg"
            onClick={()=>onBet(bets,monto,tot)}/>
          <button disabled={genCodigo} onClick={async()=>{
            setGenCodigo(true);
            await onLocal(bets);
            setGenCodigo(false);
          }} style={{
            background:ov(0.04),border:`1px solid ${Q.border}`,
            borderRadius:12,padding:"0 12px",cursor:genCodigo?"wait":"pointer",color:Q.muted,
            fontSize:11,fontFamily:"'Inter',system-ui",whiteSpace:"nowrap",
          }}>{genCodigo?"...":"🏪 Local"}</button>
        </div>
      </GCard>
    </div>
  );
}

// ── POOLS & P2P DATA ───────────────────────────────────────────



// ═══════════════════════════════════════════════════════════════
// PANTALLA 3 — PREMATCH (datos reales + mercados expandidos)
// ═══════════════════════════════════════════════════════════════
function ScreenPrematch({ onAction, onBet, onLocal }){
  const [bets,setBets]=useState([]);
  const [sports,setSports]=useState([]);
  const [loading,setLoading]=useState(true);
  const [sport,setSport]=useState(null);
  const [busqueda,setBusqueda]=useState("");
  const [expandedEvents,setExpandedEvents]=useState({});
  const [srPartidos,setSrPartidos]=useState([]);
  const [srExpand,setSrExpand]=useState({});

  useEffect(()=>{
    fetch(`${API}/api/live/all-markets`)
      .then(r=>r.json())
      .then(d=>{ if(d.sports) setSports(d.sports); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
    // Partidos de Sportradar (transición gradual, junto a The Odds API)
    fetch(`${API}/api/sportradar/partidos`)
      .then(r=>r.json())
      .then(d=>{ if(d.partidos) setSrPartidos(d.partidos); })
      .catch(()=>{});
  },[]);

  const toggle=(ev,label,odd)=>{
    setBets(p=>{
      const w=p.filter(b=>b.id!==ev.id||b.label!==label);
      if(p.find(b=>b.id===ev.id&&b.label===label)) return w;
      return[...w,{id:ev.id,label,odd,h:ev.h||ev.home,a:ev.a||ev.away,
        event_id:ev.event_id||ev.id, sport_key:ev.sport_key||null,
        commence_time:ev.commence_time||null}];
    });
  };

  const toggleExpand=(id)=>setExpandedEvents(e=>({...e,[id]:!e[id]}));

  const displaySports = sports.length>0 ? sports :
    [{name:"Cargando...",icon:"⚽",events:[]}];

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={8} c1={Q.violet} c2={Q.cyan}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 120px"}}>
        <UserMsg time="9:50">📋 Prematch</UserMsg>
        <BotMsg time="9:50">
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:10,fontFamily:"'Inter',system-ui"}}>
            📋 Apuestas Prematch — Cuotas reales
          </div>

          {/* Buscador de equipo */}
          {sports.length>0&&(
            <div style={{display:"flex",alignItems:"center",gap:8,
              background:ov(0.05),border:`1px solid ${Q.border}`,
              borderRadius:10,padding:"8px 12px",marginBottom:8}}>
              <span style={{color:Q.muted,fontSize:14}}>🔍</span>
              <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
                placeholder="Buscar equipo..."
                style={{background:"transparent",border:"none",color:Q.text,
                  fontSize:14,flex:1,minWidth:0,
                  fontFamily:"'Inter',system-ui"}}/>
              {busqueda&&(
                <button onClick={()=>setBusqueda("")} style={{background:"transparent",
                  border:"none",color:Q.muted,fontSize:16,cursor:"pointer",
                  padding:0,lineHeight:1}}>✕</button>
              )}
            </div>
          )}

          {/* Sport filter */}
          <div style={{display:"flex",gap:5,overflowX:"auto",marginBottom:12,
            paddingBottom:2,WebkitOverflowScrolling:"touch"}}>
            <button onClick={()=>setSport(null)} style={{
              background:!sport?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
              border:`1px solid ${!sport?Q.cyan:Q.border}`,borderRadius:20,
              padding:"5px 12px",cursor:"pointer",color:!sport?Q.cyan:Q.muted,
              fontSize:10,fontWeight:!sport?700:400,fontFamily:"'Inter',system-ui",
              whiteSpace:"nowrap",flexShrink:0,
            }}>Todos</button>
            {displaySports.map(s=>(
              <button key={s.name} onClick={()=>setSport(s.name)} style={{
                background:sport===s.name?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
                border:`1px solid ${sport===s.name?Q.cyan:Q.border}`,borderRadius:20,
                padding:"5px 12px",cursor:"pointer",color:sport===s.name?Q.cyan:Q.muted,
                fontSize:10,fontWeight:sport===s.name?700:400,fontFamily:"'Inter',system-ui",
                whiteSpace:"nowrap",flexShrink:0,
              }}>{s.icon} {s.name}</button>
            ))}
          </div>

          {loading&&<div style={{textAlign:"center",color:Q.muted,padding:20,fontFamily:"'Inter',system-ui"}}>
            Cargando cuotas reales...
          </div>}

          {displaySports
            .filter(s=>!sport||s.name===sport)
            .map(s=>({...s, events:(s.events||[]).filter(ev=>{
              const q=busqueda.trim().toLowerCase();
              return !q || `${ev.h} ${ev.a}`.toLowerCase().includes(q);
            })}))
            .filter(s=>s.events.length>0 || !busqueda)
            .map(s=>(
            <div key={s.name} style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:16}}>{s.icon}</span>
                <span style={{color:Q.violet2,fontWeight:700,fontSize:12,fontFamily:"'Inter',system-ui"}}>{s.name}</span>
              </div>
              {(s.events||[]).map(ev=>(
                <GCard key={ev.id} style={{padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}
                    onClick={()=>toggleExpand(ev.id)}>
                    <div style={{display:"flex",alignItems:"center",gap:8,
                      flex:1,minWidth:0}}>
                      <TeamLogo name={ev.h} size={26}/>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{color:Q.text,fontWeight:700,fontSize:13,
                          fontFamily:"'Inter',system-ui",
                          overflow:"hidden",textOverflow:"ellipsis",
                          whiteSpace:"nowrap"}}>
                          {ev.h} <span style={{color:Q.dim}}>vs</span> {ev.a}
                        </div>
                        <div style={{color:Q.muted,fontSize:10,marginTop:2}}>{ev.time}</div>
                      </div>
                      <TeamLogo name={ev.a} size={26}/>
                    </div>
                    <span style={{color:Q.muted,fontSize:18}}>{expandedEvents[ev.id]?"▲":"▼"}</span>
                  </div>

                  {/* Cuotas 1X2 rápidas */}
                  <OddsButtons ev={ev} market="h2h" bets={bets} onToggle={toggle}/>

                  <button onClick={()=>toggleExpand(ev.id)} style={{
                    width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                    borderRadius:8,padding:"5px",cursor:"pointer",color:Q.dim,
                    fontSize:10,marginTop:6,fontFamily:"'Inter',system-ui",
                  }}>
                    {expandedEvents[ev.id]?"▲ Menos mercados":"▼ Todos los mercados"}
                  </button>

                  {/* Todos los mercados cuando está expandido */}
                  {expandedEvents[ev.id]&&(
                    <MercadosEvento ev={ev} bets={bets} onToggle={toggle}/>
                  )}
                  <EstadisticasPartidoBoton ev={ev}/>
                </GCard>
              ))}
            </div>
          ))}

          {/* Partidos de Sportradar (transición gradual) */}
          {srPartidos.length>0&&(
            <div style={{marginTop:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:16}}>⚽</span>
                <span style={{color:Q.cyan,fontWeight:700,fontSize:13,
                  fontFamily:"'Inter',system-ui"}}>Sportradar · {srPartidos.length} partidos</span>
                <span style={{background:`${Q.cyan}22`,border:`1px solid ${Q.cyan}55`,
                  borderRadius:6,padding:"1px 7px",fontSize:9,color:Q.cyan,
                  fontFamily:"'Inter',system-ui"}}>NUEVO</span>
              </div>
              {srPartidos
                .filter(p=>!busqueda||`${p.home} ${p.away}`.toLowerCase().includes(busqueda.toLowerCase()))
                .map((p,i)=>(
                <GCard key={`sr-${i}`} style={{padding:12,marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <TeamLogo name={p.home} size={20}/>
                      <span style={{color:Q.text,fontSize:12,fontWeight:600,
                        fontFamily:"'Inter',system-ui"}}>{p.home}</span>
                    </div>
                    <span style={{color:Q.dim,fontSize:10}}>vs</span>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{color:Q.text,fontSize:12,fontWeight:600,
                        fontFamily:"'Inter',system-ui"}}>{p.away}</span>
                      <TeamLogo name={p.away} size={20}/>
                    </div>
                  </div>
                  {p.pais&&<div style={{color:Q.dim,fontSize:9,marginBottom:6,
                    fontFamily:"'Inter',system-ui"}}>{p.pais}</div>}
                  <div style={{display:"flex",gap:5}}>
                    {[["home",p.home_odd,"L"],["draw",p.draw_odd,"E"],["away",p.away_odd,"V"]].map(([tipo,odd,lbl])=>(
                      odd?<button key={tipo}
                        onClick={()=>toggle({id:p.id,h:p.home,a:p.away,
                          event_id:p.event_id,sport_key:p.sport_key,commence_time:p.commence_time},
                          lbl==="L"?p.home:lbl==="E"?"Empate":p.away, odd)}
                        style={{flex:1,background:bets.find(b=>b.id===p.id&&b.label===(lbl==="L"?p.home:lbl==="E"?"Empate":p.away))
                          ?`${Q.cyan}33`:ov(0.05),
                        border:`1px solid ${bets.find(b=>b.id===p.id&&b.label===(lbl==="L"?p.home:lbl==="E"?"Empate":p.away))?Q.cyan:Q.border}`,
                        borderRadius:8,padding:"8px 4px",cursor:"pointer",
                        display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                        <span style={{color:Q.dim,fontSize:9,
                          fontFamily:"'Inter',system-ui"}}>{lbl}</span>
                        <span style={{color:Q.text,fontSize:13,fontWeight:700,
                          fontFamily:"'Inter',system-ui"}}>{odd}</span>
                      </button>:null
                    ))}
                  </div>
                  {p.mercados&&p.mercados.filter(m=>m.market!=="1x2").length>0&&(
                    <>
                      <button onClick={()=>setSrExpand(e=>({...e,[p.id]:!e[p.id]}))}
                        style={{width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                        borderRadius:8,padding:"5px",cursor:"pointer",color:Q.dim,fontSize:10,
                        marginTop:6,fontFamily:"'Inter',system-ui"}}>
                        {srExpand[p.id]?"▲ Menos mercados":`▼ Más mercados (${p.mercados.filter(m=>m.market!=="1x2").length})`}
                      </button>
                      {srExpand[p.id]&&(
                        <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:5}}>
                          {p.mercados.filter(m=>m.market!=="1x2").map((m,mi)=>(
                            <button key={mi}
                              onClick={()=>toggle({id:p.id,h:p.home,a:p.away,
                                event_id:p.event_id,sport_key:p.sport_key,commence_time:p.commence_time},m.label,m.odd)}
                              style={{background:bets.find(b=>b.id===p.id&&b.label===m.label)
                                ?`${Q.cyan}33`:ov(0.05),
                              border:`1px solid ${bets.find(b=>b.id===p.id&&b.label===m.label)?Q.cyan:Q.border}`,
                              borderRadius:8,padding:"6px 10px",cursor:"pointer",
                              display:"flex",alignItems:"center",gap:6}}>
                              <span style={{color:Q.muted,fontSize:10,
                                fontFamily:"'Inter',system-ui"}}>{m.label}</span>
                              <span style={{color:Q.text,fontSize:12,fontWeight:700,
                                fontFamily:"'Inter',system-ui"}}>{m.odd}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <EstadisticasPartidoBoton ev={{h:p.home,a:p.away,commence_time:p.commence_time,event_id:p.event_id||p.id}}/>
                </GCard>
              ))}
            </div>
          )}
          <QKB rows={[[{label:"◀ Sports",action:"sports"},{label:"⚡ AI Combo",action:"combo"}]]} onPress={onAction}/>
        </BotMsg>
      </div>

      <FloatingBetslip bets={bets} onBet={onBet} onClear={()=>setBets([])}
        onLocal={onLocal} color={Q.violet}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 4 — EN VIVO (datos reales + mercados)
// ═══════════════════════════════════════════════════════════════
function ScreenLive({ onAction, onBet, onLocal }){
  const [bets,setBets]=useState([]);
  const [matches,setMatches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [lastUpdate,setLastUpdate]=useState("");
  const [expandedEvents,setExpandedEvents]=useState({});

  const fetchLive=async()=>{
    try {
      const r=await fetch(`${API}/api/live/combined`);
      const data=await r.json();
      if(data.matches&&data.matches.length>0){
        setMatches(data.matches);
        setLastUpdate(new Date().toLocaleTimeString("es-AR",{hour12:false}));
      }
    } catch(e){}
    setLoading(false);
  };

  useEffect(()=>{
    fetchLive();
    const t=setInterval(fetchLive,30000);
    return()=>clearInterval(t);
  },[]);

  const toggle=(ev,label,odd)=>{
    setBets(p=>{
      const w=p.filter(b=>b.id!==ev.id||b.label!==label);
      if(p.find(b=>b.id===ev.id&&b.label===label)) return w;
      return[...w,{id:ev.id,label,odd,h:ev.home,a:ev.away}];
    });
  };

  const toggleExpand=(id)=>setExpandedEvents(e=>({...e,[id]:!e[id]}));

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={8} c1={Q.pink} c2={Q.violet}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 120px"}}>
        <UserMsg time="9:55">🔴 En Vivo</UserMsg>
        <BotMsg time="9:55">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <LiveDot/>
              <span style={{color:Q.text,fontWeight:700,fontSize:14,fontFamily:"'Inter',system-ui"}}>
                {loading?"Cargando...":`${matches.length} partidos en vivo`}
              </span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {lastUpdate&&<span style={{color:Q.dim,fontSize:10}}>{lastUpdate}</span>}
              <button onClick={fetchLive} style={{background:"transparent",border:`1px solid ${Q.border}`,
                borderRadius:8,padding:"4px 8px",cursor:"pointer",color:Q.muted,fontSize:10}}>🔄</button>
            </div>
          </div>

          {loading&&<div style={{textAlign:"center",color:Q.muted,padding:20,fontFamily:"'Inter',system-ui"}}>Cargando...</div>}

          {!loading&&matches.length===0&&(
            <div style={{textAlign:"center",padding:24}}>
              <div style={{fontSize:32,marginBottom:8}}>⚽</div>
              <div style={{color:Q.muted,fontSize:13,fontFamily:"'Inter',system-ui"}}>No hay partidos en vivo ahora</div>
            </div>
          )}

          {matches.map(ev=>(
            <GCard key={ev.id} glow={Q.pink} style={{padding:"14px",marginBottom:10,
              background:`linear-gradient(135deg,${Q.pink}08,${Q.violet}05)`}}>
              {/* Header con score */}
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
                <LiveDot/>
                {ev.minute&&<span style={{color:Q.muted,fontSize:11}}>{ev.minute}</span>}
                {ev.minuteLong&&<span style={{color:Q.dim,fontSize:10}}>{ev.minuteLong}</span>}
              </div>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}
                onClick={()=>toggleExpand(ev.id)}>
                <div style={{textAlign:"center",flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
                    <TeamLogo name={ev.home} size={36}/>
                  </div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:"'Inter',system-ui",overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.home}</div>
                </div>
                <div style={{textAlign:"center",padding:"0 10px"}}>
                  <div style={{fontFamily:"'Inter',system-ui",fontWeight:900,fontSize:30,color:Q.pink}}>
                    {ev.homeScore}<span style={{color:Q.dim}}>:</span>{ev.awayScore}
                  </div>
                  <div style={{color:Q.pink,fontSize:9,fontFamily:"'Inter',system-ui",letterSpacing:1}}>EN CURSO</div>
                </div>
                <div style={{textAlign:"center",flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
                    <TeamLogo name={ev.away} size={36}/>
                  </div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:"'Inter',system-ui",overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.away}</div>
                </div>
              </div>

              {ev.hasOdds?(
                <>
                  {/* Cuotas 1X2 */}
                  <div style={{display:"flex",gap:5}}>
                    {[{label:ev.home,val:ev.odds.L,c:Q.amber},
                      ev.odds.E?{label:"Empate",val:ev.odds.E,c:Q.muted}:null,
                      {label:ev.away,val:ev.odds.V,c:Q.cyan}]
                      .filter(Boolean).filter(o=>o.val).map((o,i)=>(
                      <button key={i} onClick={()=>toggle(ev,o.label,o.val)} style={{
                        flex:"1 1 0",minWidth:0,overflow:"hidden",
                        background:bets.some(b=>b.id===ev.id&&b.label===o.label)?`linear-gradient(135deg,${Q.pink}44,${Q.violet}22)`:ov(0.04),
                        border:`1.5px solid ${bets.some(b=>b.id===ev.id&&b.label===o.label)?Q.pink:Q.border}`,
                        borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",transition:"all 0.2s",
                      }}>
                        <div style={{color:Q.muted,fontSize:9,
                          fontFamily:"'Inter',system-ui",overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.label}</div>
                        <div style={{color:bets.some(b=>b.id===ev.id&&b.label===o.label)?Q.pink:o.c,
                          fontWeight:700,fontSize:15,fontFamily:"'Inter',system-ui"}}>{fmt(o.val)}</div>
                        <div style={{color:Q.pink,fontSize:8}}>◉ LIVE</div>
                      </button>
                    ))}
                  </div>
                  {/* Expandir para más mercados */}
                  <button onClick={()=>toggleExpand(ev.id)} style={{
                    width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                    borderRadius:8,padding:"5px",cursor:"pointer",color:Q.dim,
                    fontSize:10,marginTop:6,fontFamily:"'Inter',system-ui",
                  }}>
                    {expandedEvents[ev.id]?"▲ Menos mercados":"▼ Todos los mercados"}
                  </button>
                  {expandedEvents[ev.id]&&(
                    <MercadosEvento ev={ev} bets={bets} onToggle={toggle} color={Q.pink}/>
                  )}
                </>
              ):(
                <div style={{textAlign:"center",color:Q.dim,fontSize:11,padding:"8px 0",
                  fontFamily:"'Inter',system-ui"}}>Cuotas en vivo no disponibles</div>
              )}
            </GCard>
          ))}

          <QKB rows={[[{label:"◀ Sports",action:"sports"},{label:"📋 Prematch",action:"prematch"}]]} onPress={onAction}/>
        </BotMsg>
      </div>

      <FloatingBetslip bets={bets} onBet={onBet} onClear={()=>setBets([])}
        onLocal={onLocal} color={Q.pink} live/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 5 — POOL
// ═══════════════════════════════════════════════════════════════
function ScreenPool({ onAction }){
  return(
    <div style={{background:Q.void,minHeight:"100%",padding:"14px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:"'Inter',system-ui"}}>🎯 Pools</div>
        <SinBackend titulo="Todavía no está disponible"
          detalle={"Los pozos compartidos necesitan que el servidor lleve la "+
                   "cuenta de quién entra y con cuánto. Eso todavía no existe, "+
                   "así que la pantalla anterior mostraba montos y jugadores "+
                   "inventados."}/>
        <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
      </BotMsg>
    </div>
  );
}

function ScreenP2P({ onAction }){
  return(
    <div style={{background:Q.void,minHeight:"100%",padding:"14px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:"'Inter',system-ui"}}>🤝 Apuestas P2P</div>
        <SinBackend titulo="Todavía no está disponible"
          detalle={"Apostar contra otro usuario requiere emparejar ofertas y "+
                   "retener el dinero de las dos partes. Las ofertas que se "+
                   "veían antes eran de ejemplo."}/>
        <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
      </BotMsg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 7 — AI COMBO
// ═══════════════════════════════════════════════════════════════
function ScreenCombo({ onAction, onBet, refCode, onEditar }){
  const [sel,setSel]=useState("c1");
  const [voted,setVoted]=useState({});
  const [codeGenerated,setCodeGenerated]=useState({});
  const [realCombos,setRealCombos]=useState(null);
  const [loading,setLoading]=useState(true);
  const [genError,setGenError]=useState("");
  const [generando,setGenerando]=useState(false);

  useEffect(()=>{
    // Combos de la casa (admin) primero, después los IA automáticos
    Promise.all([
      fetch(`${API}/api/app/combos-manuales`).then(r=>r.ok?r.json():{combos:[]}).catch(()=>({combos:[]})),
      fetch(`${API}/api/ai/combos`).then(r=>r.ok?r.json():{combos:[]}).catch(()=>({combos:[]})),
    ]).then(([man, ia])=>{
      const todos=[...(man.combos||[]), ...(ia.combos||[])];
      if(todos.length>0){ setRealCombos(todos); setSel(todos[0].id); }
    }).finally(()=>setLoading(false));
  },[]);

  const combosToShow = realCombos || [];
  const combo = combosToShow.find(c=>c.id===sel) || combosToShow[0];
  const tot = combo ? (combo.picks||[]).reduce((a,p)=>a*(p.odd||1),1) : 1;
  const stake=10000;

  // Mientras carga: mostrar spinner (NO intentar renderizar el combo aún)
  if(loading) return(
    <div style={{background:Q.void,minHeight:"100%",padding:"40px 12px",textAlign:"center"}}>
      <div style={{color:Q.muted,fontSize:14,fontFamily:"'Inter',system-ui"}}>
        Cargando combos IA...</div>
    </div>
  );

  if(!combo) return(
    <div style={{background:Q.void,minHeight:"100%",padding:"14px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:"'Inter',system-ui"}}>⚡ AI Combos</div>
        <GCard style={{padding:26,textAlign:"center",margin:"12px 0"}}>
          <div style={{fontSize:30,marginBottom:8}}>🌙</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Inter',system-ui"}}>
            No hay combos disponibles ahora
          </div>
          <div style={{color:Q.dim,fontSize:11,marginTop:4}}>
            Se arman con los partidos del día
          </div>
        </GCard>
        <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
      </BotMsg>
    </div>
  );

  const genQPCode=async(c)=>{
    if(generando) return;
    setGenError(""); setGenerando(true);
    try {
      const data = await crearBoleto(c.picks, refCode);
      setCodeGenerated(prev=>({...prev,[c.id]:data.code}));
    } catch(e){
      setGenError(e.message||"No se pudo generar el código");
    }
    setGenerando(false);
  };

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={10} c1={Q.violet} c2={Q.cyan}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="10:30">⚡ Combinadas IA</UserMsg>
        <BotMsg time="10:30">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:30,height:30,borderRadius:9,
                background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚡</div>
              <div>
                <div style={{color:Q.text,fontWeight:700,fontSize:14,fontFamily:"'Inter',system-ui"}}>AI Combos del día</div>
                <div style={{color:Q.muted,fontSize:11}}>{realCombos?"Datos reales":"Generados por QuartzPlay IA"}</div>
              </div>
            </div>
            {loading&&<div style={{color:Q.muted,fontSize:11}}>Cargando...</div>}
            {realCombos&&<HBadge label="REAL" color={Q.green}/>}
            {refCode&&<HBadge label={`via @${refCode}`} color={Q.violet}/>}
          </div>

          {/* Selector */}
          <div style={{display:"flex",gap:5,marginBottom:14}}>
            {combosToShow.map(c=>(
              <button key={c.id} onClick={()=>setSel(c.id)} style={{
                flex:1,
                background:sel===c.id?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
                border:`1px solid ${sel===c.id?Q.cyan:Q.border}`,
                borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",
              }}>
                <div style={{color:sel===c.id?Q.cyan:Q.muted,fontSize:10,fontWeight:700,fontFamily:"'Inter',system-ui"}}>{(c.name||c.nombre||"Combo").replace("AI ","")}</div>
                <div style={{color:Q.gold,fontSize:11,fontWeight:700,fontFamily:"'Inter',system-ui",marginTop:2}}>
                  {(c.picks||[]).reduce((a,p)=>a*(p.odd||1),1).toFixed(2)}x
                </div>
              </button>
            ))}
          </div>

          {/* Combo */}
          <GCard glow={Q.violet} style={{padding:"14px",marginBottom:12,
            background:`linear-gradient(135deg,${Q.violet}10,${Q.cyan}05)`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <HBadge label={combo.name||combo.nombre||"Combo IA"} color={Q.violet}/>
              {combo.conf&&<HBadge label={`${combo.conf}/10`} color={combo.tagColor||Q.green}/>}
            </div>
            {(combo.picks||[]).map((p,i)=>(
              <GCard key={i} style={{padding:"10px 12px",marginBottom:6,background:"rgba(124,58,237,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1,marginRight:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      {p.live&&<><LiveDot/><span style={{color:Q.muted,fontSize:9}}>{p.min?`Min ${p.min}'`:p.set?`Set ${p.set}`:""}</span></>}
                      <HBadge label={p.mkt} color={Q.dim}/>
                    </div>
                    <div style={{color:Q.muted,fontSize:10,marginBottom:1}}>{p.h} vs {p.a}</div>
                    <div style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:"'Inter',system-ui"}}>{p.sel}</div>
                  </div>
                  <div style={{color:Q.cyan,fontWeight:900,fontSize:18,fontFamily:"'Inter',system-ui"}}>{fmt(p.odd)}</div>
                </div>
              </GCard>
            ))}
            <NDiv color={Q.violet}/>
            {combo.note&&<div style={{color:Q.muted,fontSize:11,fontStyle:"italic",marginBottom:10}}>💡 {combo.note}</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Cuota total</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:24,fontFamily:"'Inter',system-ui"}}>{fmt(tot)}x</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Ret. $10K</div>
                <div style={{color:Q.green,fontWeight:900,fontSize:22,fontFamily:"'Inter',system-ui"}}>{ars(Math.round(stake*tot))}</div>
              </div>
            </div>

            {/* Acciones */}
            {!voted[sel]?(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>{
                  setVoted(v=>({...v,[sel]:true}));
                  if(refCode){
                    fetch(`${API}/api/influencer/track`,{
                      method:"POST",
                      headers:{"Content-Type":"application/json"},
                      body:JSON.stringify({code:refCode,event:"apuesta_web",amount:stake}),
                    }).catch(()=>{});
                  }
                  onBet((combo.picks||[]).map(p=>({id:p.h||p.home,label:p.sel,odd:p.odd,h:p.h||p.home,a:p.a||p.away})),stake,tot);
                }} style={{
                  width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                  border:"none",borderRadius:12,padding:"16px",
                  color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",
                  fontFamily:"'Inter',system-ui",textTransform:"uppercase",
                  boxShadow:`0 6px 24px ${Q.violet}66`,
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                }}>⚡ APOSTAR {ars(stake)}</button>

                <button onClick={()=>onEditar&&onEditar(combo.picks||[])} style={{
                  width:"100%",background:ov(0.04),
                  border:`1px solid ${Q.cyan}`,borderRadius:12,padding:"12px",marginTop:8,
                  color:Q.cyan,fontWeight:700,fontSize:13,cursor:"pointer",
                  fontFamily:"'Inter',system-ui"}}>
                  ✏️ Editar este combo</button>

                {!codeGenerated[sel]?(
                  <>
                  <button disabled={generando} onClick={()=>genQPCode(combo)} style={{
                    width:"100%",background:ov(0.04),
                    border:`1px solid ${Q.border}`,borderRadius:12,padding:"12px",
                    color:Q.muted,fontWeight:600,fontSize:13,
                    cursor:generando?"wait":"pointer",
                    fontFamily:"'Inter',system-ui",
                  }}>{generando?"Generando...":"🏪 Generar código para local"}</button>
                  {genError&&<div style={{color:Q.red,fontSize:11,marginTop:6,
                    textAlign:"center",fontFamily:"'Inter',system-ui"}}>{genError}</div>}
                  </>
                ):(
                  <GCard glow={Q.green} style={{padding:"12px",textAlign:"center"}}>
                    <div style={{color:Q.muted,fontSize:11,marginBottom:4}}>Código generado</div>
                    <div style={{color:Q.cyan,fontWeight:900,fontSize:20,fontFamily:"'Inter',system-ui",letterSpacing:2}}>
                      {codeGenerated[sel]}
                    </div>
                    <div style={{color:Q.muted,fontSize:10,marginTop:4}}>Mostralo en el local para apostar en efectivo</div>
                  </GCard>
                )}
              </div>
            ):(
              <GCard glow={Q.green} style={{padding:"12px",textAlign:"center"}}>
                <div style={{color:Q.green,fontWeight:700,fontSize:13,fontFamily:"'Inter',system-ui"}}>
                  ✦ Combo apostado · Ret: {ars(Math.round(stake*tot))}
                </div>
              </GCard>
            )}
          </GCard>

          <QKB rows={[
            [{label:"📋 Prematch",action:"prematch"},{label:"🔴 En Vivo",action:"live"}],
            [{label:"◀ Sports",action:"sports"}],
          ]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 8 — APUESTA CONFIRMADA
// ═══════════════════════════════════════════════════════════════
function ScreenBetConfirmed({ bets, stake, odd, code, onAction }){
  const ret=Math.round(stake*odd);
  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={14} c1={Q.green} c2={Q.violet}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <BotMsg time="10:20">
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:52,marginBottom:8,filter:`drop-shadow(0 0 16px ${Q.green})`}}>🎰</div>
            <div style={{fontFamily:"'Inter',system-ui",fontWeight:900,fontSize:20,
              color:Q.green,textShadow:`0 0 16px ${Q.green}66`,marginBottom:4}}>¡Apuesta registrada!</div>
          </div>
          <GCard glow={Q.green} style={{padding:"14px",marginBottom:12}}>
            {bets.map((b,i)=>(
              <div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${Q.dim}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:Q.muted,fontSize:11}}>{b.h} vs {b.a}</span>
                  <span style={{color:Q.cyan,fontWeight:700,fontSize:12,fontFamily:"'Inter',system-ui"}}>{fmt(b.odd)}</span>
                </div>
                <div style={{color:Q.text,fontSize:12,fontWeight:600,fontFamily:"'Inter',system-ui"}}>{b.label}</div>
              </div>
            ))}
            <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${Q.violet}44`}}>
              {[["Código",code,Q.cyan],["Apostado",ars(stake)+" ARS",Q.text],
                ["Cuota",fmt(odd)+"x",Q.cyan],["Retorno pot.",ars(ret)+" ARS",Q.green]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                  <span style={{color:Q.muted,fontSize:12}}>{l}</span>
                  <span style={{color:c,fontWeight:700,fontSize:12,fontFamily:"'Inter',system-ui"}}>{v}</span>
                </div>
              ))}
            </div>
          </GCard>
          <div style={{color:Q.amber,fontSize:11,marginBottom:10,fontFamily:"'Inter',system-ui"}}>
            ⏳ El boleto queda reservado 24 horas
          </div>
          <div style={{color:Q.muted,fontSize:11,marginBottom:10,fontFamily:"'Inter',system-ui"}}>
            💡 Mostrá el código <strong style={{color:Q.cyan}}>{code}</strong> en la agencia y pagá el monto en efectivo
          </div>
          <QKB rows={[
            [{label:"🔴 Ver en vivo",action:"live",primary:true,color:Q.pink}],
            [{label:"⚡ Nuevo combo",action:"combo"},{label:"◀ Sports",action:"sports"}],
          ]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 9 — MIS APUESTAS
// ═══════════════════════════════════════════════════════════════
function CashOutBtn({ code, moneda, onHecho }){
  const [estado,setEstado]=useState("idle"); // idle | cargando | ok | confirmar | ejecutando | error
  const [valor,setValor]=useState(null);
  const [msg,setMsg]=useState("");
  const mon = moneda || "ARS";

  const consultar=async()=>{
    setEstado("cargando"); setMsg("");
    try{
      const r=await fetch(`${API}/api/betslip/${code}/cashout`);
      const d=await r.json();
      if(d.disponible){ setValor(d.valor); setEstado("confirmar"); }
      else { setMsg(d.motivo||"No disponible ahora"); setEstado("error"); }
    }catch(e){ setMsg("Error al consultar"); setEstado("error"); }
  };

  const ejecutar=async()=>{
    setEstado("ejecutando");
    try{
      const r=await fetch(`${API}/api/betslip/${code}/cashout`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ejecutor:"cliente",valor_esperado:valor}),
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setEstado("ok"); setMsg(`Cobraste ${money(d.valor,mon)}`);
        if(onHecho) onHecho(); }
      else { setMsg(d.detail||"No se pudo"); setEstado("error"); }
    }catch(e){ setMsg("Error al cashear"); setEstado("error"); }
  };

  if(estado==="ok") return(
    <div style={{marginTop:8,padding:"8px 10px",borderRadius:9,
      background:`${Q.green}18`,border:`1px solid ${Q.green}`,
      color:Q.green,fontSize:11,fontWeight:700,textAlign:"center",
      fontFamily:"'Inter',system-ui"}}>✓ {msg}</div>
  );

  if(estado==="confirmar") return(
    <div style={{marginTop:8}}>
      <div style={{color:Q.muted,fontSize:10,marginBottom:6,textAlign:"center",
        fontFamily:"'Inter',system-ui"}}>
        Retirás ahora: <span style={{color:Q.gold,fontWeight:800,fontSize:13}}>{money(valor,mon)}</span></div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={ejecutar} disabled={estado==="ejecutando"} style={{flex:1,
          background:`linear-gradient(135deg,${Q.gold},${Q.amber||Q.gold})`,border:"none",
          borderRadius:9,padding:"10px",color:"#000",fontWeight:800,fontSize:12,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>
          {estado==="ejecutando"?"...":"Confirmar cash out"}</button>
        <button onClick={()=>setEstado("idle")} style={{
          background:"transparent",border:`1px solid ${Q.border}`,borderRadius:9,
          padding:"10px 14px",color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>✕</button>
      </div>
    </div>
  );

  if(estado==="error") return(
    <div style={{marginTop:8}}>
      <div style={{color:Q.red,fontSize:10,textAlign:"center",marginBottom:4,
        fontFamily:"'Inter',system-ui"}}>{msg}</div>
      <button onClick={consultar} style={{width:"100%",background:"transparent",
        border:`1px solid ${Q.border}`,borderRadius:9,padding:"8px",color:Q.muted,
        fontSize:11,cursor:"pointer",fontFamily:"'Inter',system-ui"}}>Reintentar</button>
    </div>
  );

  return(
    <button onClick={consultar} disabled={estado==="cargando"} style={{marginTop:8,width:"100%",
      background:`${Q.gold}18`,border:`1px solid ${Q.gold}`,borderRadius:9,padding:"9px",
      color:Q.gold,fontWeight:700,fontSize:12,cursor:"pointer",
      fontFamily:"'Inter',system-ui"}}>
      {estado==="cargando"?"Calculando...":"💰 Cash out"}</button>
  );
}

function ScreenMyBets({ onAction, user }){
  const [datos,setDatos]=useState(null);

  useEffect(()=>{
    const initData = window.Telegram?.WebApp?.initData || "";
    if(!initData){ setDatos({autenticado:false, apuestas:[]}); return; }
    fetch(`${API}/api/me/apuestas`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({init_data:initData}),
    })
      .then(r=>r.ok?r.json():null)
      .then(d=>setDatos(d||{autenticado:false,apuestas:[]}))
      .catch(()=>setDatos({autenticado:false,apuestas:[]}));
  },[]);

  const colores={active:Q.cyan,won:Q.green,lost:Q.red,pending:Q.amber};
  const rotulos={active:"ACTIVA",won:"GANADA ✓",lost:"PERDIDA ✗",pending:"PENDIENTE"};
  const lista = datos?.apuestas || [];

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="">Mis apuestas</UserMsg>
        <BotMsg time="">
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,
            fontFamily:"'Inter',system-ui"}}>📊 Mis apuestas</div>

          {!datos&&(
            <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:16,
              fontFamily:"'Inter',system-ui"}}>Cargando...</div>
          )}

          {datos&&!datos.autenticado&&(
            <SinBackend titulo="Abrí la app desde el bot"
              detalle={"Para ver tus apuestas necesitamos saber quién sos, y "+
                       "eso solo lo sabemos si entrás desde Telegram."}/>
          )}

          {datos?.autenticado&&datos.registrado===false&&(
            <SinBackend titulo="Todavía no tenés cuenta"
              detalle="Escribile al bot para crear tu cuenta y empezar a apostar."/>
          )}

          {datos?.registrado&&lista.length===0&&(
            <GCard style={{padding:28,textAlign:"center"}}>
              <div style={{fontSize:30,marginBottom:8}}>🎟️</div>
              <div style={{color:Q.muted,fontSize:13,
                fontFamily:"'Inter',system-ui"}}>
                Todavía no hiciste ninguna apuesta
              </div>
            </GCard>
          )}

          {lista.map((b,i)=>(
            <GCard key={i} glow={colores[b.status]||Q.muted}
              style={{padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",marginBottom:6,gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:Q.text,fontSize:12,fontWeight:600,
                    fontFamily:"'Inter',system-ui",marginBottom:2,
                    overflow:"hidden",textOverflow:"ellipsis"}}>{b.resumen}</div>
                  <div style={{color:Q.muted,fontSize:10}}>
                    {b.fecha} · {fmt(b.odd_total)}x · {b.picks.length} picks
                  </div>
                </div>
                <HBadge label={rotulos[b.status]||b.status}
                  color={colores[b.status]||Q.muted}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:Q.muted,fontSize:11}}>
                  Apostado: <span style={{color:Q.text,fontWeight:700,
                    fontFamily:"'Inter',system-ui"}}>{ars(b.stake)}</span>
                </span>
                <span style={{fontWeight:700,fontSize:12,
                  fontFamily:"'Inter',system-ui",
                  color:b.status==="won"?Q.green:b.status==="lost"?Q.red:Q.cyan}}>
                  {b.status==="won"?"+"+ars(b.potential_win)
                   :b.status==="lost"?"-"+ars(b.stake)
                   :"→ "+ars(b.potential_win)}
                </span>
              </div>
              {b.status==="active"&&b.code&&(
                <CashOutBtn code={b.code} moneda={user?.moneda}
                  onHecho={()=>{
                    const initData = window.Telegram?.WebApp?.initData || "";
                    fetch(`${API}/api/me/apuestas`,{method:"POST",
                      headers:{"Content-Type":"application/json"},
                      body:JSON.stringify({init_data:initData})})
                      .then(r=>r.ok?r.json():null)
                      .then(d=>d&&setDatos(d)).catch(()=>{});
                  }}/>
              )}
            </GCard>
          ))}

          <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ── CORREGIR PICK (app) ───────────────────────────────────────
function CorregirPickApp({ pick, onAplicar, onQuitar }){
  const [modo,setModo]=useState("seleccion");
  const [buscar,setBuscar]=useState("");
  const [encontrados,setEncontrados]=useState([]);
  const [buscando,setBuscando]=useState(false);
  const [ajuste,setAjuste]=useState("");
  const opciones=pick.opciones||[];

  const buscarEventos=async()=>{
    if(buscar.trim().length<2||buscando) return;
    setBuscando(true);
    try{
      const r=await fetch(`${API}/api/buscar-eventos?q=${encodeURIComponent(buscar.trim())}`);
      const d=await r.json();
      setEncontrados(d.eventos||[]);
    }catch(e){ setEncontrados([]); }
    setBuscando(false);
  };
  const elegirOpcion=(op)=>{
    const cuota=ajuste.trim()?parseFloat(ajuste):op.odd;
    onAplicar({selection:op.sel,odd_nuestra:op.odd,odd_final:cuota,
      odd_ajustada:cuota,ajustada:!!ajuste.trim(),estado:"ok"});
  };
  const elegirNuevo=(ev,op)=>{
    const cuota=ajuste.trim()?parseFloat(ajuste):op.odd;
    onAplicar({home:ev.home,away:ev.away,home_real:ev.home,away_real:ev.away,
      event_id:ev.event_id,sport_key:ev.sport_key,selection:op.sel,market:op.mkt,
      odd_nuestra:op.odd,odd_final:cuota,odd_ajustada:cuota,
      ajustada:!!ajuste.trim(),estado:"ok",opciones:ev.opciones});
  };

  return(
    <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${Q.dim}`}}>
      {(pick.home_real||pick.away_real)&&(
        <div style={{color:Q.muted,fontSize:9,marginBottom:6,
          fontFamily:"'Inter',system-ui"}}>
          En nuestro sistema: <span style={{color:Q.cyan}}>{pick.home_real} vs {pick.away_real}</span>
        </div>
      )}
      {/* Candidatos parecidos (cuando no encontró el partido) */}
      {(pick.candidatos&&pick.candidatos.length>0)&&(
        <div style={{marginBottom:10}}>
          <div style={{color:Q.amber,fontSize:10,marginBottom:6,
            fontFamily:"'Inter',system-ui"}}>
            ¿Quisiste decir alguno de estos?
          </div>
          {pick.candidatos.map((ev,ci)=>(
            <div key={ci} style={{background:`${Q.amber}0E`,
              border:`1px solid ${Q.amber}44`,borderRadius:8,
              padding:"8px 10px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,marginBottom:5,
                fontFamily:"'Inter',system-ui"}}>{ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevo(ev,op)} style={{
                    background:ov(0.05),border:`1px solid ${Q.border}`,
                    borderRadius:7,padding:"5px 9px",cursor:"pointer",
                    color:Q.cyan,fontSize:11,fontWeight:600,
                    fontFamily:"'Inter',system-ui"}}>
                    {op.sel} · {fmt(op.odd)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:5,marginBottom:8}}>
        <button onClick={()=>setModo("seleccion")} style={{flex:1,
          background:modo==="seleccion"?`${Q.violet}33`:ov(0.04),
          border:`1px solid ${modo==="seleccion"?Q.violet:Q.border}`,borderRadius:7,
          padding:"6px",cursor:"pointer",color:modo==="seleccion"?Q.cyan:Q.muted,
          fontSize:10,fontWeight:700,fontFamily:"'Inter',system-ui"}}>Selección</button>
        <button onClick={()=>setModo("partido")} style={{flex:1,
          background:modo==="partido"?`${Q.violet}33`:ov(0.04),
          border:`1px solid ${modo==="partido"?Q.violet:Q.border}`,borderRadius:7,
          padding:"6px",cursor:"pointer",color:modo==="partido"?Q.cyan:Q.muted,
          fontSize:10,fontWeight:700,fontFamily:"'Inter',system-ui"}}>Otro partido</button>
      </div>

      {modo==="seleccion"&&(
        <div>
          {opciones.length===0&&<div style={{color:Q.muted,fontSize:10,marginBottom:6,
            fontFamily:"'Inter',system-ui"}}>Sin opciones. Probá "Otro partido".</div>}
          {opciones.map((op,k)=>(
            <button key={k} onClick={()=>elegirOpcion(op)} style={{width:"100%",
              display:"flex",justifyContent:"space-between",alignItems:"center",
              background:ov(0.04),border:`1px solid ${Q.border}`,
              borderRadius:7,padding:"8px 10px",marginBottom:4,cursor:"pointer"}}>
              <span style={{color:Q.text,fontSize:11,
                fontFamily:"'Inter',system-ui"}}>{op.sel}</span>
              <span style={{color:Q.cyan,fontWeight:700,fontSize:12,
                fontFamily:"'Inter',system-ui"}}>{fmt(op.odd)}</span>
            </button>
          ))}
        </div>
      )}

      {modo==="partido"&&(
        <div>
          <div style={{display:"flex",gap:5,marginBottom:6}}>
            <input value={buscar} onChange={e=>setBuscar(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&buscarEventos()}
              placeholder="Equipo..."
              style={{flex:1,background:ov(0.05),
                border:`1px solid ${Q.border}`,borderRadius:7,padding:"8px 10px",
                color:Q.text,fontSize:14,fontFamily:"'Inter',system-ui"}}/>
            <button onClick={buscarEventos} style={{background:`${Q.violet}33`,
              border:`1px solid ${Q.violet}`,borderRadius:7,padding:"0 12px",
              cursor:"pointer",color:Q.cyan,fontSize:11,fontWeight:700,
              fontFamily:"'Inter',system-ui"}}>{buscando?"...":"Ir"}</button>
          </div>
          {encontrados.map((ev,k)=>(
            <div key={k} style={{background:ov(0.03),
              border:`1px solid ${Q.dim}`,borderRadius:7,padding:"7px 9px",marginBottom:5}}>
              <div style={{color:Q.text,fontSize:11,fontWeight:600,marginBottom:5,
                fontFamily:"'Inter',system-ui"}}>{ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevo(ev,op)} style={{
                    background:ov(0.05),border:`1px solid ${Q.border}`,
                    borderRadius:6,padding:"4px 8px",cursor:"pointer",
                    color:Q.cyan,fontSize:10,fontWeight:600,
                    fontFamily:"'Inter',system-ui"}}>
                    {op.sel} · {fmt(op.odd)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:5,marginTop:7}}>
        <input value={ajuste} onChange={e=>setAjuste(e.target.value)}
          placeholder="Cuota a mano" inputMode="decimal"
          style={{flex:1,background:ov(0.05),
            border:`1px solid ${Q.border}`,borderRadius:7,padding:"7px 9px",
            color:Q.text,fontSize:13,fontFamily:"'Inter',system-ui"}}/>
        <button onClick={onQuitar} style={{background:`${Q.pink}18`,
          border:`1px solid ${Q.pink}`,borderRadius:7,padding:"7px 11px",
          cursor:"pointer",color:Q.pink,fontSize:10,fontWeight:700,
          fontFamily:"'Inter',system-ui"}}>Quitar</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA — MEJORAR MI APUESTA (sube captura de otro sitio)
// ═══════════════════════════════════════════════════════════════
function ScreenMejorar({ onAction, user, refCode }){
  const [imagenes,setImagenes]=useState([]);
  const [analizando,setAnalizando]=useState(false);
  const [res,setRes]=useState(null);
  const [corrigiendo,setCorrigiendo]=useState(null);
  const aplicarCorreccion=(idx,nuevo)=>{
    setRes(r=>{
      const picks=r.picks.map((p,i)=>i===idx?{...p,...nuevo}:p);
      const validos=picks.filter(p=>p.odd_final);
      let t=1; validos.forEach(p=>t*=p.odd_final);
      return {...r,picks,picks_ok:validos.length,
        cuota_total:validos.length?Math.round(t*100)/100:null};
    });
    setCorrigiendo(null);
  };
  const quitarPickM=(idx)=>{
    setRes(r=>{
      const picks=r.picks.filter((_,i)=>i!==idx);
      const validos=picks.filter(p=>p.odd_final);
      let t=1; validos.forEach(p=>t*=p.odd_final);
      return {...r,picks,picks_total:picks.length,picks_ok:validos.length,
        cuota_total:validos.length?Math.round(t*100)/100:null};
    });
    setCorrigiendo(null);
  };
  const [err,setErr]=useState("");

  const elegir=(e)=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length) return;
    setErr(""); setRes(null);
    files.forEach(file=>{
      if(file.size>8*1024*1024){ setErr("Una imagen supera 8MB"); return; }
      const rd=new FileReader();
      rd.onload=()=>setImagenes(prev=>[...prev,{b64:rd.result.split(",")[1],
        tipo:file.type||"image/jpeg", preview:rd.result}]);
      rd.readAsDataURL(file);
    });
    e.target.value="";
  };
  const quitarImagen=(i)=>setImagenes(prev=>prev.filter((_,k)=>k!==i));
  const [boleto,setBoleto]=useState(null);
  const [generando,setGenerando]=useState(false);

  const generarBoleto=async()=>{
    if(!res||generando) return;
    const validos=(res.picks||[]).filter(p=>p.odd_final);
    if(!validos.length) return;
    setGenerando(true);
    try{
      const body={
        picks: validos.map(p=>({
          home:p.home||p.h||"", away:p.away||p.a||"",
          sel:p.sel||p.seleccion||p.label||"", odd:p.odd_final,
          sport:p.sport||"",
        })),
      };
      if(refCode){ body.inf_code=refCode; body.codigo_influencer=refCode; }
      const r=await fetch(`${API}/api/betslip`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      setBoleto(d);
      // Marcar el escaneo como convertido en jugada
      if(refCode){
        fetch(`${API}/api/escaner/${refCode}/registrar`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            picks_leidos:res.picks_total||0, picks_ok:res.picks_ok||0,
            cuota_total:res.cuota_total||null, betslip_code:d.code,
          }),
        }).catch(()=>{});
      }
    }catch(e){ setErr(e.message==="Failed to fetch"?"Sin conexión":e.message); }
    setGenerando(false);
  };

  const analizar=async()=>{
    if(!imagenes.length||analizando) return;
    setAnalizando(true); setErr(""); setRes(null);
    try{
      const initData=window.Telegram?.WebApp?.initData||"";
      const r=await fetch(`${API}/api/mejorar-combinada`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({imagenes:imagenes.map(im=>({data:im.b64,media_type:im.tipo})),
          init_data:initData}),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      if(!d.ok) setErr(d.mensaje||"No se pudo leer la imagen");
      else {
        setRes(d);
        // Registrar el escaneo si vino por el link de un influencer
        if(refCode){
          fetch(`${API}/api/escaner/${refCode}/registrar`,{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              picks_leidos:d.picks_total||d.picks?.length||0,
              picks_ok:d.picks_ok||0, cuota_total:d.cuota_total||null,
            }),
          }).catch(()=>{});
        }
      }
    }catch(e){ setErr(e.message==="Failed to fetch"?"Sin conexión":e.message); }
    setAnalizando(false);
  };

  const estados={
    ok:{t:"Igual o mejor",c:Q.green},
    igualada:{t:"Igualada",c:Q.green},
    mejorada_parcial:{t:"Máximo posible",c:Q.amber},
    sin_mercado:{t:"Sin ese mercado",c:Q.red},
    sin_partido:{t:"Sin ese partido",c:Q.red},
  };

  return(
    <div style={{background:Q.void,minHeight:"100%",padding:"14px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:"'Inter',system-ui"}}>📸 Mejorar mi apuesta</div>
        <div style={{color:Q.muted,fontSize:11,marginBottom:12,lineHeight:1.4,
          fontFamily:"'Inter',system-ui"}}>
          Subí la captura de una apuesta de otro sitio. La leemos y te decimos
          si podemos igualarla o mejorarla con nuestras cuotas.
        </div>

        {imagenes.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            {imagenes.map((im,i)=>(
              <div key={i} style={{position:"relative"}}>
                <img src={im.preview} alt={"f"+i} style={{width:60,height:60,
                  objectFit:"cover",borderRadius:7,border:`1px solid ${Q.border}`}}/>
                <button onClick={()=>quitarImagen(i)} style={{position:"absolute",
                  top:-5,right:-5,width:18,height:18,borderRadius:"50%",
                  background:Q.pink,border:"none",color:"#fff",fontSize:10,
                  cursor:"pointer",lineHeight:1}}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:12,
            padding:"18px 10px",textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" capture="environment"
              onChange={elegir} style={{display:"none"}}/>
            <div style={{fontSize:24,marginBottom:4}}>📸</div>
            <div style={{color:Q.text,fontWeight:700,fontSize:11,
              fontFamily:"'Inter',system-ui"}}>Sacar foto</div>
          </label>
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:12,
            padding:"18px 10px",textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" multiple onChange={elegir}
              style={{display:"none"}}/>
            <div style={{fontSize:24,marginBottom:4}}>🖼️</div>
            <div style={{color:Q.text,fontWeight:700,fontSize:11,
              fontFamily:"'Inter',system-ui"}}>
              {imagenes.length>0?"Agregar más":"Galería"}</div>
          </label>
        </div>

        {imagenes.length>0&&(
          <button onClick={analizar} disabled={analizando} style={{width:"100%",
            background:analizando?ov(0.06)
              :`linear-gradient(135deg,${Q.cyan},${Q.violet})`,
            border:"none",borderRadius:10,padding:"12px",marginBottom:4,
            cursor:analizando?"wait":"pointer",color:analizando?Q.muted:"#fff",
            fontWeight:700,fontSize:13,fontFamily:"'Inter',system-ui"}}>
            {analizando?"Leyendo...":`🔍 Analizar ${imagenes.length} foto${imagenes.length>1?"s":""}`}</button>
        )}

        {err&&<div style={{color:Q.red,fontSize:12,marginTop:10,
          fontFamily:"'Inter',system-ui"}}>{err}</div>}

        {analizando&&(
          <div style={{color:Q.violet2,fontSize:12,textAlign:"center",
            padding:16,fontFamily:"'Inter',system-ui"}}>
            La IA está leyendo tu apuesta...
          </div>
        )}

        {res&&(
          <div style={{marginTop:12}}>
            <div style={{color:Q.muted,fontSize:11,marginBottom:8,
              fontFamily:"'Inter',system-ui"}}>
              Leímos {res.picks_total} · podemos tomar {res.picks_ok}
            </div>
            {res.faltan_picks&&(
              <div style={{background:`${Q.red}12`,border:`1px solid ${Q.red}66`,
                borderRadius:9,padding:"9px 11px",marginBottom:10,color:Q.red,
                fontSize:11,lineHeight:1.4,fontFamily:"'Inter',system-ui"}}>
                ⚠️ El cupón marca cuota {fmt(res.total_odd_cupon)} pero con lo leído
                no llegamos. Falta algún partido — agregá otra foto.
              </div>
            )}
            {res.picks.map((p,i)=>{
              const est=estados[p.estado]||{t:p.estado,c:Q.muted};
              return(
              <GCard key={i} glow={p.odd_final?est.c:undefined}
                style={{padding:"10px 12px",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",gap:6,marginBottom:4}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontWeight:600,fontSize:12,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      fontFamily:"'Inter',system-ui"}}>{p.home} vs {p.away}</div>
                    <div style={{color:Q.muted,fontSize:10}}>{p.selection}</div>
                  </div>
                  <span style={{background:`${est.c}22`,border:`1px solid ${est.c}`,
                    borderRadius:16,padding:"1px 7px",fontSize:8,fontWeight:700,
                    color:est.c,flexShrink:0,whiteSpace:"nowrap",
                    fontFamily:"'Inter',system-ui"}}>{est.t}</span>
                </div>
                <div style={{display:"flex",gap:10,fontSize:11,marginBottom:6,
                  fontFamily:"'Inter',system-ui"}}>
                  {p.odd_original&&<span style={{color:Q.dim}}>Origen {fmt(p.odd_original)}</span>}
                  {p.odd_final&&<span style={{color:est.c,fontWeight:700}}>
                    Nuestra {fmt(p.odd_final)}{p.ajustada?" ↑":""}</span>}
                </div>
                <button onClick={()=>setCorrigiendo(corrigiendo===i?null:i)} style={{
                  background:corrigiendo===i?`${Q.cyan}22`:"transparent",
                  border:`1px solid ${corrigiendo===i?Q.cyan:Q.dim}`,borderRadius:8,
                  padding:"5px 10px",cursor:"pointer",color:corrigiendo===i?Q.cyan:Q.muted,
                  fontSize:10,fontWeight:700,fontFamily:"'Inter',system-ui"}}>
                  {corrigiendo===i?"✕ Cerrar":"✏️ Está mal"}</button>
                {corrigiendo===i&&(
                  <CorregirPickApp pick={p}
                    onAplicar={(nuevo)=>aplicarCorreccion(i,nuevo)}
                    onQuitar={()=>quitarPickM(i)}/>
                )}
              </GCard>
              );
            })}

            {res.picks_ok<res.picks_total&&(
              <div style={{background:`${Q.amber}12`,border:`1px solid ${Q.amber}55`,
                borderRadius:10,padding:"9px 12px",margin:"8px 0",color:Q.amber,
                fontSize:11,lineHeight:1.4,fontFamily:"'Inter',system-ui"}}>
                ⚠️ Hay selecciones que no tenemos. Podés armar la combinada con
                las {res.picks_ok} que sí, desde Prematch.
              </div>
            )}

            {res.picks_ok>0&&!boleto&&(
              <GCard glow={Q.green} style={{padding:14,marginTop:6}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                  <span style={{color:Q.muted,fontSize:12,
                    fontFamily:"'Inter',system-ui"}}>Nuestra cuota total</span>
                  <span style={{color:Q.gold,fontWeight:900,fontSize:20,
                    fontFamily:"'Inter',system-ui"}}>{fmt(res.cuota_total)}x</span>
                </div>
                <button onClick={generarBoleto} disabled={generando}
                  style={{width:"100%",background:`linear-gradient(135deg,${Q.green},${Q.cyan})`,
                    border:"none",borderRadius:10,padding:"13px",color:"#001",
                    fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:8,
                    fontFamily:"'Inter',system-ui"}}>
                  {generando?"Generando...":"🎟️ Generar mi código para jugar"}</button>
                <div style={{color:Q.muted,fontSize:10,lineHeight:1.4,textAlign:"center",
                  fontFamily:"'Inter',system-ui"}}>
                  Con el código jugás acá o lo llevás a una agencia.</div>
              </GCard>
            )}

            {boleto&&(
              <GCard glow={Q.gold} style={{padding:18,marginTop:6,textAlign:"center"}}>
                <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
                  letterSpacing:1,marginBottom:8,
                  fontFamily:"'Inter',system-ui"}}>Tu código de jugada</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:32,letterSpacing:2,
                  fontFamily:"'Inter',system-ui"}}>{boleto.code}</div>
                <div style={{color:Q.cyan,fontWeight:700,fontSize:16,marginTop:6,
                  fontFamily:"'Inter',system-ui"}}>Cuota {fmt(boleto.odd_total||res.cuota_total)}x</div>
                <div style={{color:Q.muted,fontSize:11,marginTop:12,lineHeight:1.5,
                  fontFamily:"'Inter',system-ui"}}>
                  📲 Anotá o captura este código.<br/>
                  Llevalo a una agencia para pagar y jugar,
                  o cargalo desde el bot.</div>
                {refCode&&<div style={{color:Q.violet2,fontSize:10,marginTop:8,
                  fontFamily:"'Inter',system-ui"}}>
                  Jugada de @{refCode}</div>}
              </GCard>
            )}
          </div>
        )}

        <div style={{marginTop:14}}>
          <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
        </div>
      </BotMsg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
const STEPS=[
  {k:"home",     l:"🏠 Inicio"},
  {k:"prematch", l:"📋 Prematch"},
  {k:"live",     l:"🔴 En Vivo"},
  {k:"combo",    l:"⚡ Combos IA"},
  {k:"mybets",   l:"📊 Mis apuestas"},
];

// ── Captura de errores: nunca más pantalla negra ──────────────
class CazaError extends Component {
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err,info){ console.error("CazaError:",err,info); }
  render(){
    if(this.state.err){
      return (
        <div style={{padding:20,color:Q.text,fontFamily:"'Inter',system-ui"}}>
          <div style={{color:Q.red,fontWeight:800,fontSize:15,marginBottom:8}}>
            ⚠️ Algo falló en esta pantalla</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:8}}>
            {String(this.state.err&&this.state.err.message||this.state.err).slice(0,200)}</div>
          <div style={{color:Q.dim,fontSize:9,marginBottom:16,whiteSpace:"pre-wrap",
            fontFamily:"monospace",maxHeight:200,overflow:"auto"}}>
            {String(this.state.err&&this.state.err.stack||"").slice(0,500)}</div>
          <button onClick={()=>this.setState({err:null})}
            style={{background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,border:"none",
              borderRadius:10,padding:"12px 20px",color:"#fff",fontWeight:700,fontSize:14,
              cursor:"pointer"}}>Reintentar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Iconos SVG (reemplazan los emojis: los emojis se ven distinto
//    en cada telefono y bajan la percepcion de calidad) ────────
function Ico({ d, on, size=21 }){
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={on?Q.gold:Q.dim} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}
const ICONOS = {
  prematch:<><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/></>,
  builder: <><path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="16" r="3"/></>,
  combo:   <><path d="M13 2L5 13h6l-1 9 8-11h-6z"/></>,
  mybets:  <><path d="M4 8h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4z"/><path d="M12 8v10" strokeDasharray="2 2"/></>,
  home:    <><path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z"/></>,
  cuenta:  <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></>,
  camara:  <><path d="M3 8.5A1.5 1.5 0 014.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z"/><circle cx="12" cy="13" r="3.5"/></>,
};

// ── Como pagar la apuesta: lo elige el cliente ────────────────
// Tres caminos: saldo real, saldo de bono, o reservarla para ir a
// pagarla a una agencia. La reservada igual queda en Mis apuestas.
function HojaConfirmar({ picks, stake, odd, user, onCerrar, onListo }){
  const [enviando,setEnviando]=useState("");
  const [err,setErr]=useState("");
  const mon = user?.moneda || "ARS";
  const saldo = user?.saldo;
  const bono  = user?.saldo_bono;
  const premio = Math.round((stake||0)*(odd||1));

  const jugar = async(modo)=>{
    if(enviando) return;
    setEnviando(modo); setErr("");
    try{
      const d = await enviarApuesta({picks, stake, modo, infCode:user?.refCode});
      onListo(d, modo);
    }catch(e){
      setErr(e.message||"No se pudo registrar la apuesta");
      setEnviando("");
    }
  };

  const Opcion = ({modo, titulo, detalle, disponible, color, deshabilitado}) => (
    <button disabled={!!enviando||deshabilitado} onClick={()=>jugar(modo)} style={{
      width:"100%",textAlign:"left",marginBottom:9,cursor:deshabilitado?"default":"pointer",
      background:deshabilitado?Q.inset:Q.surface,
      border:`1px solid ${deshabilitado?Q.border:color}`,
      borderRadius:11,padding:"13px 14px",opacity:deshabilitado?0.5:1,
      display:"flex",alignItems:"center",gap:12}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:deshabilitado?Q.muted:Q.text,fontWeight:700,fontSize:14,
          fontFamily:F_BODY}}>{titulo}</div>
        <div style={{color:Q.muted,fontSize:11,marginTop:2,fontFamily:F_BODY,
          lineHeight:1.35}}>{detalle}</div>
      </div>
      {disponible!=null&&(
        <div style={{fontFamily:F_NUM,fontSize:17,fontWeight:700,
          color:deshabilitado?Q.dim:color,whiteSpace:"nowrap"}}>
          {money(disponible,mon)}</div>
      )}
      {enviando===modo&&<span style={{color:Q.muted,fontSize:11}}>…</span>}
    </button>
  );

  return(
    <div onClick={onCerrar} style={{position:"fixed",inset:0,zIndex:1000,
      background:"rgba(5,9,20,0.88)",display:"flex",alignItems:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:520,
        margin:"0 auto",background:Q.deep,borderTop:`1px solid ${Q.border}`,
        borderRadius:"18px 18px 0 0",
        padding:"18px 16px calc(18px + env(safe-area-inset-bottom))"}}>

        <div style={{width:36,height:4,borderRadius:2,background:Q.border,
          margin:"0 auto 16px"}}/>

        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"baseline",marginBottom:4}}>
          <span style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>
            {picks.length} {picks.length===1?"selección":"selecciones"} · cuota</span>
          <span style={{fontFamily:F_NUM,fontSize:26,fontWeight:700,color:Q.gold,
            lineHeight:1}}>{fmt(odd)}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"baseline",marginBottom:16}}>
          <span style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>
            Apostás {money(stake,mon)} · ganás</span>
          <span style={{fontFamily:F_NUM,fontSize:30,fontWeight:700,color:Q.gold,
            lineHeight:1}}>{money(premio,mon)}</span>
        </div>

        {err&&(
          <div style={{background:`${Q.red}1A`,border:`1px solid ${Q.red}`,
            borderRadius:9,padding:"9px 12px",marginBottom:11,
            color:Q.text,fontSize:12,fontFamily:F_BODY}}>{err}</div>
        )}

        <Opcion modo="saldo" titulo="Pagar con mi saldo"
          detalle="Se descuenta ahora y la apuesta queda confirmada."
          disponible={saldo} color={Q.violet}
          deshabilitado={saldo==null||saldo<stake}/>

        {bono>0&&(
          <Opcion modo="bono" titulo="Pagar con mi bono"
            detalle="Sin cash out. Suma al rollover para liberar el bono."
            disponible={bono} color={Q.gold}
            deshabilitado={bono<stake}/>
        )}

        <Opcion modo="reservada" titulo="Reservar y pagar en una agencia"
          detalle="Te damos un código QP. Vale 24 horas y queda en Mis apuestas."
          color={Q.cyan}/>

        <button onClick={onCerrar} disabled={!!enviando} style={{width:"100%",
          background:"transparent",border:"none",color:Q.muted,fontSize:13,
          padding:"11px 0 2px",cursor:"pointer",fontFamily:F_BODY}}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Barra superior: logo (vuelve al inicio), saldo y cuenta ────
function BarraSuperior({ user, onNav, tema, onTema }){
  const mon = user?.moneda || "ARS";
  const ini = (user?.nombre_completo || user?.first_name || "").trim()
    .split(" ").filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
  return(
    <div style={{flexShrink:0,background:Q.deep,borderBottom:`1px solid ${Q.border}`,
      display:"flex",alignItems:"center",gap:12,
      padding:"9px 13px calc(9px)",position:"relative"}}>
      <button onClick={()=>onNav("home")} style={{background:"transparent",border:"none",
        cursor:"pointer",padding:0,display:"flex",alignItems:"center"}}>
        <span style={{fontFamily:F_NUM,fontSize:20,fontWeight:700,color:Q.text,
          letterSpacing:0.4}}>QUARTZ<span style={{color:Q.gold}}>PLAY</span></span>
      </button>
      <div style={{flex:1}}/>
      {user?.saldo!=null&&(
        <div style={{textAlign:"right",lineHeight:1}}>
          <div style={{fontSize:8,letterSpacing:1.4,color:Q.dim,fontWeight:700,
            fontFamily:F_BODY}}>SALDO</div>
          <div style={{fontFamily:F_NUM,fontSize:19,fontWeight:700,color:Q.gold,
            marginTop:2}}>{money(user.saldo,mon)}</div>
        </div>
      )}
      <BotonTema tema={tema} onCambiar={onTema} compacto/>
      <button onClick={()=>onNav("cuenta")} style={{width:32,height:32,borderRadius:"50%",
        border:"none",cursor:"pointer",flexShrink:0,
        background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{fontFamily:F_NUM,fontSize:13,fontWeight:700,color:"#fff"}}>
          {ini||"·"}</span>
      </button>
      <div style={{position:"absolute",bottom:-1,left:0,right:0,height:1,
        background:`linear-gradient(90deg,${Q.violet},${Q.violet2},transparent)`}}/>
    </div>
  );
}

// ── Barra inferior: 4 accesos + Bet Best al centro ────────────
// Bet Best es la funcion insignia (foto del boleto -> mejor cuota),
// asi que se lleva el unico boton elevado y el unico dorado macizo.
function BarraInferior({ actual, onNav }){
  const items = [
    {k:"prematch", l:"Deportes"},
    {k:"builder",  l:"Builder"},
    {k:"combo",    l:"Combos"},
    {k:"mybets",   l:"Boletos"},
  ];
  const izq = items.slice(0,2), der = items.slice(2);
  const activoBB = actual==="mejorar";

  const Item = ({it}) => {
    const on = actual===it.k;
    return(
      <button onClick={()=>onNav(it.k)} style={{flex:1,background:"transparent",
        border:"none",cursor:"pointer",display:"flex",flexDirection:"column",
        alignItems:"center",gap:3,padding:"6px 0"}}>
        <Ico d={ICONOS[it.k]} on={on}/>
        <span style={{fontSize:9,fontWeight:on?700:500,color:on?Q.gold:Q.dim,
          fontFamily:F_BODY}}>{it.l}</span>
      </button>
    );
  };

  return(
    <div style={{flexShrink:0,background:Q.deep,borderTop:`1px solid ${Q.border}`,
      display:"flex",alignItems:"flex-end",
      padding:"6px 4px calc(6px + env(safe-area-inset-bottom))",position:"relative"}}>
      {izq.map(it=><Item key={it.k} it={it}/>)}

      {/* Bet Best — boton elevado */}
      <div style={{flex:1,display:"flex",justifyContent:"center",position:"relative"}}>
        <button onClick={()=>onNav("mejorar")} aria-label="Bet Best" style={{
          position:"absolute",bottom:2,width:56,height:56,borderRadius:"50%",
          border:`3px solid ${Q.deep}`,cursor:"pointer",padding:0,
          background:activoBB
            ? `linear-gradient(145deg,#FFE07A,${Q.goldBg})`
            : `linear-gradient(145deg,${Q.goldBg},#E0A614)`,
          boxShadow:`0 6px 18px ${Q.goldBg}55`,
          display:"flex",flexDirection:"column",alignItems:"center",
          justifyContent:"center",gap:1}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A1200"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            {ICONOS.camara}
          </svg>
        </button>
        <span style={{position:"absolute",bottom:-2,fontSize:9,fontWeight:700,
          color:activoBB?Q.gold:Q.muted,fontFamily:F_BODY,whiteSpace:"nowrap"}}>
          Bet Best</span>
      </div>

      {der.map(it=><Item key={it.k} it={it}/>)}
    </div>
  );
}

// ── HOME con destacados (combo del día + en vivo) ─────────────
function ScreenHome({ user, onNav, onBet, refCode }){
  const [combo,setCombo]=useState(null);
  const [live,setLive]=useState(null);

  useEffect(()=>{
    Promise.all([
      fetch(`${API}/api/app/combos-manuales`).then(r=>r.ok?r.json():{combos:[]}).catch(()=>({combos:[]})),
      fetch(`${API}/api/ai/combos`).then(r=>r.ok?r.json():{combos:[]}).catch(()=>({combos:[]})),
    ]).then(([man,ia])=>{
      const todos=[...(man.combos||[]),...(ia.combos||[])];
      if(todos.length) setCombo(todos[0]);
    }).catch(()=>{});
    fetch(`${API}/api/live/combined`).then(r=>r.ok?r.json():null)
      .then(d=>{ const evs=[]; (d?.sports||[]).forEach(sp=>(sp.events||[]).slice(0,2).forEach(e=>evs.push({...e,sport:sp.name})));
        setLive(evs.slice(0,3)); }).catch(()=>setLive([]));
  },[]);

  const autenticado = user?.autenticado;
  const mon = user?.moneda || "ARS";
  const comboOdd = combo ? (combo.picks||[]).reduce((a,p)=>a*(p.odd||1),1) : 0;

  return(
    <div style={{padding:"14px 12px 20px"}}>
      {/* Bet Best — la funcion insignia va primero y ocupa el ancho */}
      <div onClick={()=>onNav("mejorar")} style={{
        position:"relative",overflow:"hidden",borderRadius:14,marginBottom:14,
        padding:"18px 16px",cursor:"pointer",
        background:`linear-gradient(115deg,${Q.violet2} 0%,${Q.violet} 70%)`}}>
        <svg viewBox="0 0 320 120" preserveAspectRatio="none" style={{position:"absolute",
          inset:0,width:"100%",height:"100%",opacity:0.22,pointerEvents:"none"}}>
          <g stroke="#fff" strokeWidth="1" fill="none">
            <circle cx="160" cy="60" r="30"/><line x1="160" y1="0" x2="160" y2="120"/>
            <rect x="0" y="30" width="40" height="60"/><rect x="280" y="30" width="40" height="60"/>
          </g>
        </svg>
        <div style={{position:"relative"}}>
          <div style={{fontSize:9,letterSpacing:2,fontWeight:800,color:Q.gold,
            fontFamily:F_BODY}}>BET BEST</div>
          <div style={{fontFamily:F_NUM,fontSize:27,fontWeight:700,color:"#fff",
            lineHeight:1.02,marginTop:5}}>Sacale una foto<br/>a tu boleto</div>
          <div style={{fontSize:11.5,color:"#D8E2FF",marginTop:7,lineHeight:1.4,
            maxWidth:230,fontFamily:F_BODY}}>
            Leemos las selecciones y te decimos si podemos pagarte una cuota mejor.</div>
          <div style={{marginTop:12,display:"inline-flex",alignItems:"center",gap:7,
            background:Q.goldBg,borderRadius:7,padding:"9px 16px"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A1200"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {ICONOS.camara}
            </svg>
            <span style={{color:"#1A1200",fontWeight:700,fontSize:12.5,
              fontFamily:F_BODY}}>Escanear boleto</span>
          </div>
        </div>
      </div>

      {!autenticado&&(
        <GCard style={{padding:"12px 14px",marginBottom:14}}>
          <div style={{color:Q.muted,fontSize:12,lineHeight:1.45,fontFamily:F_BODY}}>
            Abrí la app desde el bot de Telegram para ver tu saldo y apostar.</div>
        </GCard>
      )}

      {user?.saldo_bono>0&&(
        <GCard glow={Q.gold} style={{padding:14,marginBottom:14,
          background:`linear-gradient(135deg,${Q.gold}14,${Q.violet}08)`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:Q.gold,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,
                fontWeight:700,fontFamily:"'Inter',system-ui"}}>🎁 Saldo bono</div>
              <div style={{color:Q.text,fontWeight:900,fontSize:22,marginTop:2,
                fontFamily:"'Inter',system-ui"}}>{money(user.saldo_bono,mon)}</div>
            </div>
            {user?.rollover_pendiente>0&&(
              <div style={{textAlign:"right"}}>
                <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",
                  fontFamily:"'Inter',system-ui"}}>Para liberar</div>
                <div style={{color:Q.cyan,fontWeight:700,fontSize:14,
                  fontFamily:"'Inter',system-ui"}}>{money(user.rollover_pendiente,mon)}</div>
                <div style={{color:Q.dim,fontSize:9,
                  fontFamily:"'Inter',system-ui"}}>por apostar</div>
              </div>
            )}
          </div>
          <div style={{color:Q.muted,fontSize:10,marginTop:8,lineHeight:1.4,
            fontFamily:"'Inter',system-ui"}}>
            Jugá tu bono. Cuando completes lo que falta apostar, pasa a tu saldo retirable.</div>
        </GCard>
      )}

      {/* Combo del día destacado */}
      <div style={{color:Q.text,fontWeight:800,fontSize:15,marginBottom:8,
        fontFamily:"'Inter',system-ui"}}>⚡ Combo del día</div>
      {combo?(
        <GCard glow={Q.gold} onClick={()=>onNav("combo")}
          style={{padding:16,marginBottom:16,cursor:"pointer",
          background:`linear-gradient(135deg,${Q.violet}12,${Q.gold}0A)`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{color:Q.text,fontWeight:700,fontSize:14,
              fontFamily:"'Inter',system-ui"}}>{combo.name||combo.nombre}</div>
            <div style={{background:`${Q.gold}22`,border:`1px solid ${Q.gold}`,borderRadius:10,
              padding:"2px 10px",color:Q.gold,fontWeight:900,fontSize:14,
              fontFamily:"'Inter',system-ui"}}>{fmt(comboOdd)}x</div>
          </div>
          {(combo.picks||[]).slice(0,3).map((p,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",
              fontFamily:"'Inter',system-ui"}}>
              <span style={{color:Q.muted,fontSize:11}}>{p.h||p.home} vs {p.a||p.away}</span>
              <span style={{color:Q.cyan,fontSize:11,fontWeight:600}}>{p.sel} · {fmt(p.odd)}</span>
            </div>
          ))}
          <div style={{marginTop:10,textAlign:"center",color:Q.gold,fontSize:12,fontWeight:700,
            fontFamily:"'Inter',system-ui"}}>Ver y apostar →</div>
        </GCard>
      ):(
        <GCard style={{padding:20,marginBottom:16,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12,fontFamily:"'Inter',system-ui"}}>
            Cargando combos del día...</div>
        </GCard>
      )}

      {/* En vivo */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{color:Q.text,fontWeight:800,fontSize:15,
          fontFamily:"'Inter',system-ui"}}>🔴 En vivo ahora</div>
        <button onClick={()=>onNav("live")} style={{background:"transparent",border:"none",
          color:Q.cyan,fontSize:12,fontWeight:700,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>Ver todo →</button>
      </div>
      {(live||[]).length>0?(live||[]).map((ev,i)=>(
        <GCard key={i} onClick={()=>onNav("live")} style={{padding:12,marginBottom:8,cursor:"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:"'Inter',system-ui"}}>{ev.h} vs {ev.a}</div>
              <div style={{color:Q.pink,fontSize:9,fontWeight:700,marginTop:1}}>● {ev.sport||"EN VIVO"}</div>
            </div>
            {ev.odds?.L&&<div style={{display:"flex",gap:5}}>
              <span style={{background:ov(0.05),border:`1px solid ${Q.border}`,
                borderRadius:7,padding:"5px 9px",color:Q.cyan,fontSize:12,fontWeight:700,
                fontFamily:"'Inter',system-ui"}}>{fmt(ev.odds.L)}</span>
            </div>}
          </div>
        </GCard>
      )):(
        <GCard style={{padding:20,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12,fontFamily:"'Inter',system-ui"}}>
            No hay eventos en vivo ahora</div>
        </GCard>
      )}

      {/* Accesos rápidos */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:16}}>
        {[["prematch","Deportes",Q.violet],["live","En vivo",Q.pink],
          ["mybets","Mis boletos",Q.cyan],["cuenta","Mi cuenta",Q.violet2]].map(([k,l,c])=>(
          <button key={k} onClick={()=>onNav(k)} style={{
            background:`${c}14`,border:`1px solid ${c}`,borderRadius:12,padding:"14px 10px",
            cursor:"pointer",color:Q.text,fontSize:12,fontWeight:700,
            fontFamily:"'Inter',system-ui"}}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function CargaDigitalBox({ user, moneda }){
  const [abierto,setAbierto]=useState(false);
  const [monto,setMonto]=useState("");
  const [cuit,setCuit]=useState("");
  const [estado,setEstado]=useState("idle");
  const [res,setRes]=useState(null);
  const [msg,setMsg]=useState("");
  const mon=moneda||"ARS";

  const pedir=async()=>{
    const m=parseInt(monto,10);
    if(!m||m<=0){ setMsg("Poné un monto"); return; }
    if(cuit.replace(/\D/g,"").length!==11){ setMsg("El CUIT debe tener 11 dígitos"); return; }
    setEstado("proc"); setMsg("");
    try{
      const initData=window.Telegram?.WebApp?.initData||"";
      const r=await fetch(`${API}/api/me/psp/cargar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({init_data:initData,monto:m,cuit}),
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setRes(d); setEstado("ok"); }
      else { setMsg(d.detail||"No se pudo"); setEstado("idle"); }
    }catch(e){ setMsg("Error"); setEstado("idle"); }
  };

  if(estado==="ok"&&res) return(
    <GCard glow={Q.green} style={{padding:16,marginBottom:10}}>
      <div style={{color:Q.green,fontWeight:800,fontSize:14,marginBottom:8,textAlign:"center",
        fontFamily:"'Inter',system-ui"}}>Transferí a este CVU</div>
      <div style={{color:Q.muted,fontSize:11,textAlign:"center",marginBottom:8,
        fontFamily:"'Inter',system-ui"}}>
        Desde tu CUIT, ${res.monto?.toLocaleString("es-AR")}. Se acredita solo al llegar.</div>
      <div style={{background:ov(0.06),border:`1px solid ${Q.green}`,
        borderRadius:10,padding:"12px",textAlign:"center",marginBottom:6}}>
        <div style={{color:Q.text,fontWeight:900,fontSize:18,letterSpacing:1,
          fontFamily:"'Inter',system-ui",wordBreak:"break-all"}}>{res.cvu}</div>
        {res.alias&&<div style={{color:Q.muted,fontSize:11,marginTop:4}}>Alias: {res.alias}</div>}
      </div>
      <button onClick={()=>{setEstado("idle");setAbierto(false);setMonto("");setCuit("");setRes(null);}}
        style={{width:"100%",background:"transparent",border:`1px solid ${Q.border}`,
          borderRadius:9,padding:"9px",color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>Listo</button>
    </GCard>
  );

  if(!abierto) return(
    <button onClick={()=>setAbierto(true)} style={{width:"100%",
      background:`${Q.green}14`,border:`1px solid ${Q.green}`,borderRadius:12,padding:"13px",
      color:Q.green,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,
      fontFamily:"'Inter',system-ui"}}>⬆️ Cargar por transferencia</button>
  );

  return(
    <GCard glow={Q.green} style={{padding:16,marginBottom:10}}>
      <div style={{color:Q.green,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:"'Inter',system-ui"}}>⬆️ Cargar por transferencia</div>
      <input value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))}
        placeholder={`Monto en ${mon}`} inputMode="numeric"
        style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:11,padding:"12px 15px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:"'Inter',system-ui"}}/>
      <input value={cuit} onChange={e=>setCuit(e.target.value.replace(/\D/g,""))}
        placeholder="Tu CUIT (11 dígitos)" inputMode="numeric"
        style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:11,padding:"12px 15px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:"'Inter',system-ui"}}/>
      {msg&&<div style={{color:Q.red,fontSize:11,marginBottom:8,textAlign:"center",
        fontFamily:"'Inter',system-ui"}}>{msg}</div>}
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>{setAbierto(false);setMsg("");}} style={{flex:1,background:"transparent",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px",color:Q.muted,fontSize:13,
          cursor:"pointer",fontFamily:"'Inter',system-ui"}}>Cancelar</button>
        <button onClick={pedir} disabled={estado==="proc"} style={{flex:1,
          background:`linear-gradient(135deg,${Q.green},${Q.cyan})`,border:"none",borderRadius:10,
          padding:"11px",color:"#000",fontWeight:800,fontSize:13,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>{estado==="proc"?"...":"Obtener CVU"}</button>
      </div>
    </GCard>
  );
}

function RetiroDigitalBox({ user, moneda, saldo }){
  const [abierto,setAbierto]=useState(false);
  const [monto,setMonto]=useState("");
  const [destino,setDestino]=useState("");
  const [estado,setEstado]=useState("idle");
  const [msg,setMsg]=useState("");
  const [ok,setOk]=useState(null);
  const mon=moneda||"ARS";

  const pedir=async()=>{
    const m=parseInt(monto,10);
    if(!m||m<=0){ setMsg("Poné un monto"); return; }
    if(saldo!=null&&m>saldo){ setMsg("No te alcanza el saldo"); return; }
    if(destino.replace(/\D/g,"").length!==22){ setMsg("El CVU/CBU debe tener 22 dígitos"); return; }
    setEstado("proc"); setMsg("");
    try{
      const initData=window.Telegram?.WebApp?.initData||"";
      const r=await fetch(`${API}/api/me/psp/retirar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({init_data:initData,monto:m,destino}),
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setOk(d); setEstado("ok"); }
      else { setMsg(d.detail||"No se pudo"); setEstado("idle"); }
    }catch(e){ setMsg("Error"); setEstado("idle"); }
  };

  if(estado==="ok"&&ok) return(
    <GCard glow={Q.cyan} style={{padding:16,marginBottom:10,textAlign:"center"}}>
      <div style={{fontSize:36,marginBottom:6}}>🏦</div>
      <div style={{color:Q.cyan,fontWeight:800,fontSize:14,
        fontFamily:"'Inter',system-ui"}}>{ok.mensaje}</div>
      <button onClick={()=>{setEstado("idle");setAbierto(false);setMonto("");setDestino("");setOk(null);}}
        style={{marginTop:12,background:"transparent",border:`1px solid ${Q.border}`,borderRadius:9,
          padding:"8px 20px",color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>Listo</button>
    </GCard>
  );

  if(!abierto) return(
    <button onClick={()=>setAbierto(true)} style={{width:"100%",
      background:`${Q.cyan}14`,border:`1px solid ${Q.cyan}`,borderRadius:12,padding:"13px",
      color:Q.cyan,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,
      fontFamily:"'Inter',system-ui"}}>⬇️ Retirar a mi banco</button>
  );

  return(
    <GCard glow={Q.cyan} style={{padding:16,marginBottom:10}}>
      <div style={{color:Q.cyan,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:"'Inter',system-ui"}}>⬇️ Retirar a mi banco</div>
      <input value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))}
        placeholder={`Monto en ${mon}`} inputMode="numeric"
        style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:11,padding:"12px 15px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:"'Inter',system-ui"}}/>
      <input value={destino} onChange={e=>setDestino(e.target.value.replace(/\D/g,""))}
        placeholder="Tu CVU/CBU (22 dígitos)" inputMode="numeric"
        style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:11,padding:"12px 15px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:"'Inter',system-ui"}}/>
      {msg&&<div style={{color:Q.red,fontSize:11,marginBottom:8,textAlign:"center",
        fontFamily:"'Inter',system-ui"}}>{msg}</div>}
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>{setAbierto(false);setMsg("");}} style={{flex:1,background:"transparent",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px",color:Q.muted,fontSize:13,
          cursor:"pointer",fontFamily:"'Inter',system-ui"}}>Cancelar</button>
        <button onClick={pedir} disabled={estado==="proc"} style={{flex:1,
          background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,border:"none",borderRadius:10,
          padding:"11px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>{estado==="proc"?"...":"Solicitar"}</button>
      </div>
    </GCard>
  );
}

function RetiroBox({ moneda, saldo, onHecho }){
  const [abierto,setAbierto]=useState(false);
  const [monto,setMonto]=useState("");
  const [estado,setEstado]=useState("idle"); // idle|proc|ok|error
  const [res,setRes]=useState(null);
  const [msg,setMsg]=useState("");
  const mon = moneda || "ARS";

  const pedir=async()=>{
    const m=parseInt(monto,10);
    if(!m||m<=0){ setMsg("Poné un monto válido"); setEstado("error"); return; }
    if(saldo!=null && m>saldo){ setMsg("No te alcanza el saldo"); setEstado("error"); return; }
    setEstado("proc"); setMsg("");
    try{
      const initData = window.Telegram?.WebApp?.initData || "";
      const r=await fetch(`${API}/api/me/retirar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({init_data:initData,monto:m}),
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setRes(d); setEstado("ok"); if(onHecho) onHecho(); }
      else { setMsg(d.detail||"No se pudo"); setEstado("error"); }
    }catch(e){ setMsg("Error, probá de nuevo"); setEstado("error"); }
  };

  if(estado==="ok"&&res) return(
    <GCard glow={Q.gold} style={{padding:18,marginBottom:10,textAlign:"center"}}>
      <div style={{fontSize:40,marginBottom:6}}>🎫</div>
      <div style={{color:Q.gold,fontWeight:800,fontSize:15,
        fontFamily:"'Inter',system-ui"}}>Retiro solicitado</div>
      <div style={{color:Q.muted,fontSize:12,margin:"8px 0",
        fontFamily:"'Inter',system-ui"}}>
        Mostrá este código en tu agencia para cobrar {money(res.monto,mon)}:</div>
      <div style={{background:ov(0.06),border:`1px solid ${Q.gold}`,
        borderRadius:12,padding:"12px",color:Q.gold,fontWeight:900,fontSize:24,
        letterSpacing:3,fontFamily:"'Inter',system-ui"}}>{res.code}</div>
      <button onClick={()=>{setEstado("idle");setAbierto(false);setMonto("");setRes(null);}}
        style={{marginTop:12,background:"transparent",border:`1px solid ${Q.border}`,
          borderRadius:9,padding:"8px 20px",color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>Listo</button>
    </GCard>
  );

  if(!abierto) return(
    <button onClick={()=>setAbierto(true)} style={{width:"100%",
      background:`${Q.gold}14`,border:`1px solid ${Q.gold}`,borderRadius:12,padding:"13px",
      color:Q.gold,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,
      fontFamily:"'Inter',system-ui"}}>💸 Retirar</button>
  );

  return(
    <GCard glow={Q.gold} style={{padding:16,marginBottom:10}}>
      <div style={{color:Q.gold,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:"'Inter',system-ui"}}>💸 Retirar en mostrador</div>
      <div style={{color:Q.muted,fontSize:11,marginBottom:10,
        fontFamily:"'Inter',system-ui"}}>
        Se descuenta de tu saldo y te damos un código para cobrar en efectivo en tu agencia.</div>
      <input value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))}
        placeholder={`Monto en ${mon}`} inputMode="numeric"
        style={{width:"100%",background:ov(0.05),
          border:`1px solid ${Q.border}`,borderRadius:11,padding:"12px 15px",
          color:Q.text,fontSize:18,marginBottom:10,
          fontFamily:"'Inter',system-ui"}}/>
      {msg&&<div style={{color:Q.red,fontSize:11,marginBottom:8,textAlign:"center",
        fontFamily:"'Inter',system-ui"}}>{msg}</div>}
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>{setAbierto(false);setMsg("");setEstado("idle");}}
          style={{flex:1,background:"transparent",border:`1px solid ${Q.border}`,
            borderRadius:10,padding:"11px",color:Q.muted,fontSize:13,cursor:"pointer",
            fontFamily:"'Inter',system-ui"}}>Cancelar</button>
        <button onClick={pedir} disabled={estado==="proc"}
          style={{flex:1,background:`linear-gradient(135deg,${Q.gold},${Q.amber||Q.gold})`,
            border:"none",borderRadius:10,padding:"11px",color:"#000",fontWeight:800,
            fontSize:13,cursor:"pointer",fontFamily:"'Inter',system-ui"}}>
          {estado==="proc"?"...":"Solicitar retiro"}</button>
      </div>
    </GCard>
  );
}

function VincularBox({ moneda, onHecho }){
  const [abierto,setAbierto]=useState(false);
  const [tel,setTel]=useState("");
  const [estado,setEstado]=useState("idle"); // idle|proc|match|ok|error
  const [match,setMatch]=useState(null);
  const [msg,setMsg]=useState("");
  const mon = moneda || "ARS";

  const buscar=async()=>{
    if(tel.replace(/\D/g,"").length<8){ setMsg("Teléfono inválido"); setEstado("error"); return; }
    setEstado("proc"); setMsg("");
    try{
      const initData = window.Telegram?.WebApp?.initData || "";
      const r=await fetch(`${API}/api/me/vincular-telefono`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({init_data:initData,telefono:tel}),
      });
      const d=await r.json();
      if(!r.ok){ setMsg(d.detail||"No se pudo"); setEstado("error"); return; }
      if(d.match){ setMatch(d.match); setEstado("match"); }
      else { setMsg("No encontramos una cuenta con ese teléfono"); setEstado("error"); }
    }catch(e){ setMsg("Error, probá de nuevo"); setEstado("error"); }
  };

  const confirmar=async()=>{
    setEstado("proc");
    try{
      const tg = window.Telegram?.WebApp?.initDataUnsafe?.user;
      const r=await fetch(`${API}/api/telegram/confirmar-match`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({telegram_id:tg?.id,user_id:match.user_id}),
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setEstado("ok"); if(onHecho) onHecho();
        if(window.Telegram?.WebApp){ try{ setTimeout(()=>window.location.reload(),1200); }catch(e){} } }
      else { setMsg(d.detail||"No se pudo vincular"); setEstado("error"); }
    }catch(e){ setMsg("Error al vincular"); setEstado("error"); }
  };

  if(estado==="ok") return(
    <GCard glow={Q.green} style={{padding:16,marginBottom:10,textAlign:"center"}}>
      <div style={{color:Q.green,fontWeight:700,fontSize:14,
        fontFamily:"'Inter',system-ui"}}>✓ Cuenta vinculada</div>
    </GCard>
  );

  if(estado==="match"&&match) return(
    <GCard glow={Q.cyan} style={{padding:16,marginBottom:10}}>
      <div style={{color:Q.text,fontSize:13,textAlign:"center",lineHeight:1.6,
        fontFamily:"'Inter',system-ui"}}>
        Encontramos <span style={{color:Q.cyan,fontWeight:700}}>{match.nombre}</span> en
        <span style={{color:Q.cyan,fontWeight:700}}> {match.agencia}</span> con saldo
        <span style={{color:Q.green,fontWeight:700}}> {money(match.saldo,mon)}</span>.
        ¿Sos vos?</div>
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <button onClick={()=>{setEstado("idle");setMatch(null);}}
          style={{flex:1,background:"transparent",border:`1px solid ${Q.border}`,
            borderRadius:10,padding:"11px",color:Q.muted,fontSize:13,cursor:"pointer",
            fontFamily:"'Inter',system-ui"}}>No</button>
        <button onClick={confirmar}
          style={{flex:1,background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,
            fontSize:13,cursor:"pointer",fontFamily:"'Inter',system-ui"}}>
          Sí, vincular</button>
      </div>
    </GCard>
  );

  if(!abierto) return(
    <button onClick={()=>setAbierto(true)} style={{width:"100%",
      background:`${Q.cyan}14`,border:`1px solid ${Q.cyan}`,borderRadius:12,padding:"13px",
      color:Q.cyan,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,
      fontFamily:"'Inter',system-ui"}}>🔗 Vincular cuenta de mostrador</button>
  );

  return(
    <GCard glow={Q.cyan} style={{padding:16,marginBottom:10}}>
      <div style={{color:Q.cyan,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:"'Inter',system-ui"}}>🔗 Vincular cuenta</div>
      <div style={{color:Q.muted,fontSize:11,marginBottom:10,
        fontFamily:"'Inter',system-ui"}}>
        Si tenés saldo cargado en una agencia, ingresá el teléfono con el que te registraron.</div>
      <input value={tel} onChange={e=>setTel(e.target.value)}
        placeholder="Ej: 11 2345 6789" inputMode="tel"
        style={{width:"100%",background:ov(0.05),
          border:`1px solid ${Q.border}`,borderRadius:11,padding:"12px 15px",
          color:Q.text,fontSize:16,marginBottom:10,
          fontFamily:"'Inter',system-ui"}}/>
      {msg&&<div style={{color:Q.red,fontSize:11,marginBottom:8,textAlign:"center",
        fontFamily:"'Inter',system-ui"}}>{msg}</div>}
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>{setAbierto(false);setMsg("");setEstado("idle");}}
          style={{flex:1,background:"transparent",border:`1px solid ${Q.border}`,
            borderRadius:10,padding:"11px",color:Q.muted,fontSize:13,cursor:"pointer",
            fontFamily:"'Inter',system-ui"}}>Cancelar</button>
        <button onClick={buscar} disabled={estado==="proc"}
          style={{flex:1,background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,
            fontSize:13,cursor:"pointer",fontFamily:"'Inter',system-ui"}}>
          {estado==="proc"?"...":"Buscar"}</button>
      </div>
    </GCard>
  );
}

function ScreenCuenta({ user, onNav }){
  const [movs,setMovs]=useState(null);
  useEffect(()=>{
    const initData = window.Telegram?.WebApp?.initData || "";
    if(!initData){ setMovs([]); return; }
    fetch(`${API}/api/me/movimientos`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({init_data:initData}),
    }).then(r=>r.ok?r.json():{movimientos:[]}).then(d=>setMovs(d.movimientos||[]))
      .catch(()=>setMovs([]));
  },[]);

  const saldo = user?.autenticado ? user.saldo : null;
  const mon = user?.moneda || "ARS";
  return(
    <div style={{padding:"14px 12px 20px"}}>
      <GCard glow={Q.violet} style={{padding:18,marginBottom:14,
        background:`linear-gradient(135deg,${Q.violet}18,${Q.cyan}0C)`}}>
        <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,
          fontFamily:"'Inter',system-ui"}}>Mi cuenta</div>
        <div style={{color:Q.text,fontWeight:800,fontSize:17,marginTop:2,
          fontFamily:"'Inter',system-ui"}}>{user?.nombre||"Jugador"}</div>
        {saldo!=null?(
          <div style={{color:Q.green,fontWeight:900,fontSize:26,marginTop:6,
            fontFamily:"'Inter',system-ui"}}>{money(saldo,mon)}<span style={{fontSize:12,color:Q.muted,fontWeight:400}}> {mon}</span></div>
        ):(
          <div style={{color:Q.muted,fontSize:13,marginTop:6,
            fontFamily:"'Inter',system-ui"}}>Abrí desde el bot para ver tu saldo</div>
        )}
      </GCard>

      {user?.psp_activa&&<CargaDigitalBox user={user} moneda={mon}/>}
      {user?.psp_activa&&saldo!=null&&<RetiroDigitalBox user={user} moneda={mon} saldo={saldo}/>}
      {saldo!=null&&<RetiroBox moneda={mon} saldo={saldo}
        onHecho={()=>{ if(window.Telegram?.WebApp){ try{ setTimeout(()=>window.location.reload(),1400); }catch(e){} } }}/>}
      {user?.autenticado&&<VincularBox moneda={mon}/>}

      <div style={{color:Q.text,fontWeight:800,fontSize:14,marginBottom:8,
        fontFamily:"'Inter',system-ui"}}>Movimientos</div>
      {movs===null&&<GCard style={{padding:20,textAlign:"center"}}>
        <div style={{color:Q.muted,fontSize:12,fontFamily:"'Inter',system-ui"}}>Cargando...</div></GCard>}
      {movs&&movs.length===0&&<GCard style={{padding:20,textAlign:"center"}}>
        <div style={{color:Q.muted,fontSize:12,fontFamily:"'Inter',system-ui"}}>Sin movimientos todavía</div></GCard>}
      {(movs||[]).map((m,i)=>(
        <GCard key={i} style={{padding:"10px 13px",marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:"'Inter',system-ui"}}>{m.tipo||m.detalle||"Movimiento"}</div>
              <div style={{color:Q.muted,fontSize:9}}>{m.fecha||""}</div>
            </div>
            <div style={{color:(m.monto||0)>=0?Q.green:Q.red,fontWeight:700,fontSize:13,
              fontFamily:"'Inter',system-ui"}}>{(m.monto||0)>=0?"+":""}{money(m.monto,mon)}</div>
          </div>
        </GCard>
      ))}

      <div style={{color:Q.dim,fontSize:11,textAlign:"center",marginTop:16,lineHeight:1.5,
        fontFamily:"'Inter',system-ui"}}>
        Para cargar saldo, acercate a tu agencia.</div>
    </div>
  );
}

function ScreenRegistro({ user, onListo }){
  const tg = window.Telegram?.WebApp;
  const tgUser = tg?.initDataUnsafe?.user || {};
  const [nombre,setNombre]=useState(
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || user?.nombre || "");
  const [telefono,setTelefono]=useState("");
  const [email,setEmail]=useState("");
  const [paso,setPaso]=useState("form");   // form | match
  const [match,setMatch]=useState(null);
  const [proc,setProc]=useState(false);
  const [msg,setMsg]=useState("");
  const [moneda,setMoneda]=useState("");   // vacío = detectar por IP en el server
  const [monedas,setMonedas]=useState([]);
  useEffect(()=>{
    fetch(`${API}/api/monedas`).then(r=>r.ok?r.json():{monedas:[]})
      .then(d=>setMonedas(d.monedas||[])).catch(()=>setMonedas([]));
  },[]);

  const tgId = tgUser.id;

  const enviar=async()=>{
    if(!nombre.trim()){ setMsg("Poné tu nombre"); return; }
    if(telefono.replace(/\D/g,"").length<8){ setMsg("Poné un teléfono válido"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/telegram/onboarding`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({telegram_id:tgId,nombre,telefono,email,
          moneda:moneda||undefined}),
      });
      const d=await r.json();
      if(d.match){ setMatch(d.match); setPaso("match"); }
      else { onListo(); }   // registrado, sin match: entra directo
    }catch(e){ setMsg("Error, probá de nuevo"); }
    setProc(false);
  };

  const confirmarMatch=async(soyYo)=>{
    if(!soyYo){ onListo(); return; }   // no es él: entra con su cuenta nueva
    setProc(true);
    try{
      await fetch(`${API}/api/telegram/confirmar-match`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({telegram_id:tgId,user_id:match.user_id}),
      });
      onListo();
    }catch(e){ setMsg("Error al vincular"); }
    setProc(false);
  };

  const inp={width:"100%",background:ov(0.05),
    border:`1px solid ${Q.border}`,borderRadius:11,padding:"13px 15px",
    color:Q.text,fontSize:16,marginBottom:10,fontFamily:"'Inter',system-ui"};

  if(paso==="match"&&match){
    return(
      <div style={{padding:"30px 16px",minHeight:"100%",display:"flex",
        flexDirection:"column",justifyContent:"center"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:44,marginBottom:8}}>🔗</div>
          <div style={{color:Q.text,fontWeight:800,fontSize:18,
            fontFamily:"'Inter',system-ui"}}>¿Sos vos?</div>
        </div>
        <GCard glow={Q.cyan} style={{padding:20,marginBottom:16}}>
          <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,textAlign:"center",
            fontFamily:"'Inter',system-ui"}}>
            Encontramos una cuenta con tu teléfono en
            <span style={{color:Q.cyan,fontWeight:700}}> {match.agencia}</span>:
            <div style={{color:Q.text,fontWeight:700,fontSize:16,margin:"8px 0"}}>{match.nombre}</div>
            con saldo <span style={{color:Q.green,fontWeight:700}}>{ars(match.saldo)}</span>.
            <div style={{marginTop:8}}>Si sos vos, la conectamos y usás ese saldo acá.</div>
          </div>
        </GCard>
        <button onClick={()=>confirmarMatch(true)} disabled={proc} style={{
          width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:12,padding:"15px",color:"#fff",fontWeight:700,fontSize:15,
          cursor:"pointer",marginBottom:8,fontFamily:"'Inter',system-ui"}}>
          {proc?"Conectando...":"Sí, soy yo · Conectar"}</button>
        <button onClick={()=>confirmarMatch(false)} disabled={proc} style={{
          width:"100%",background:"transparent",border:`1px solid ${Q.border}`,
          borderRadius:12,padding:"13px",color:Q.muted,fontSize:13,cursor:"pointer",
          fontFamily:"'Inter',system-ui"}}>No soy yo, seguir con cuenta nueva</button>
        {msg&&<div style={{color:Q.red,fontSize:12,textAlign:"center",marginTop:10,
          fontFamily:"'Inter',system-ui"}}>{msg}</div>}
      </div>
    );
  }

  return(
    <div style={{padding:"26px 16px",minHeight:"100%"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{width:56,height:56,borderRadius:16,margin:"0 auto 12px",
          background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,
          boxShadow:`0 8px 30px ${Q.violet}55`}}>⬡</div>
        <div style={{color:Q.text,fontWeight:800,fontSize:20,
          fontFamily:"'Inter',system-ui"}}>Creá tu cuenta</div>
        <div style={{color:Q.muted,fontSize:13,marginTop:4,
          fontFamily:"'Inter',system-ui"}}>
          Con tus datos podés jugar y conectar tu saldo</div>
      </div>

      <div style={{color:Q.muted,fontSize:11,marginBottom:3,marginLeft:2,
        fontFamily:"'Inter',system-ui"}}>Nombre y apellido</div>
      <input value={nombre} onChange={e=>setNombre(e.target.value)} style={inp}
        placeholder="Tu nombre completo"/>

      <div style={{color:Q.muted,fontSize:11,marginBottom:3,marginLeft:2,
        fontFamily:"'Inter',system-ui"}}>Teléfono</div>
      <input value={telefono} onChange={e=>setTelefono(e.target.value)} style={inp}
        placeholder="Ej: 11 2345 6789" inputMode="tel"/>

      <div style={{color:Q.muted,fontSize:11,marginBottom:3,marginLeft:2,
        fontFamily:"'Inter',system-ui"}}>Email (opcional)</div>
      <input value={email} onChange={e=>setEmail(e.target.value)} style={inp}
        placeholder="tu@email.com" inputMode="email"/>

      <div style={{color:Q.muted,fontSize:11,marginBottom:3,marginLeft:2,
        fontFamily:"'Inter',system-ui"}}>Moneda</div>
      <select value={moneda} onChange={e=>setMoneda(e.target.value)}
        style={{...inp,color:moneda?Q.text:Q.muted}}>
        <option value="">Detectar automáticamente por tu país</option>
        {monedas.map(m=>(
          <option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo} — {m.nombre}</option>
        ))}
      </select>

      <button onClick={enviar} disabled={proc} style={{
        width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        border:"none",borderRadius:12,padding:"15px",color:"#fff",fontWeight:700,fontSize:15,
        cursor:"pointer",marginTop:6,fontFamily:"'Inter',system-ui",
        boxShadow:`0 6px 24px ${Q.violet}55`}}>
        {proc?"Creando...":"Crear cuenta"}</button>
      {msg&&<div style={{color:Q.red,fontSize:12,textAlign:"center",marginTop:10,
        fontFamily:"'Inter',system-ui"}}>{msg}</div>}
    </div>
  );
}

function ScreenBuilder({ picks, onAdd, onQuitar, onLimpiar, onBet, onLocal, onNav }){
  const [sports,setSports]=useState([]);
  const [loading,setLoading]=useState(true);
  const [sport,setSport]=useState(null);
  const [busqueda,setBusqueda]=useState("");
  const [expandedEvents,setExpandedEvents]=useState({});
  const [monto,setMonto]=useState("");
  const [genLocal,setGenLocal]=useState(false);

  useEffect(()=>{
    fetch(`${API}/api/live/all-markets`)
      .then(r=>r.json())
      .then(d=>{ if(d.sports) setSports(d.sports); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[]);

  // Adaptar el toggle al formato del builder
  const toggle=(ev,label,odd,market)=>{
    onAdd({id:ev.id,label,odd,h:ev.h||ev.home,a:ev.a||ev.away,market:market||"h2h"});
  };
  const toggleExpand=(id)=>setExpandedEvents(e=>({...e,[id]:!e[id]}));

  // ¿Hay 2+ picks del mismo partido? → bet builder de mismo partido
  const partidos={};
  picks.forEach(p=>{ partidos[p.id]=(partidos[p.id]||0)+1; });
  const mismoPartido = Object.values(partidos).some(c=>c>=2);

  // Cotización protegida desde el backend cuando es mismo partido
  const [cuotaBackend,setCuotaBackend]=useState(null);
  const [margenAplicado,setMargenAplicado]=useState(0);
  useEffect(()=>{
    if(picks.length===0){ setCuotaBackend(null); setMargenAplicado(0); return; }
    let vivo=true;
    fetch(`${API}/api/bet-builder/cotizar`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({picks:picks.map(p=>({odd:p.odd})),mismo_partido:mismoPartido}),
    }).then(r=>r.ok?r.json():null).then(d=>{
      if(vivo&&d){ setCuotaBackend(d.cuota); setMargenAplicado(d.margen_aplicado||0); }
    }).catch(()=>{});
    return ()=>{vivo=false;};
    // eslint-disable-next-line
  },[JSON.stringify(picks.map(p=>[p.id,p.label,p.odd])),mismoPartido]);

  const totBruto=picks.length?picks.reduce((a,p)=>a*(parseFloat(p.odd)||1),1):1;
  const tot = cuotaBackend!=null ? cuotaBackend : totBruto;
  const montoNum=parseInt(monto||"0",10);
  const ganancia=Math.round(montoNum*tot);

  let displaySports = sports;
  if(sport) displaySports = sports.filter(s=>s.name===sport);
  if(busqueda){
    const q=busqueda.toLowerCase();
    displaySports = displaySports.map(s=>({...s,
      events:(s.events||[]).filter(ev=>
        (ev.h||ev.home||"").toLowerCase().includes(q)||
        (ev.a||ev.away||"").toLowerCase().includes(q))
    })).filter(s=>s.events.length>0);
  }

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 260px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{color:Q.text,fontWeight:800,fontSize:18,
            fontFamily:"'Inter',system-ui"}}>🛠️ Bet Builder</div>
          <button onClick={()=>onNav("home")} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:13,cursor:"pointer",fontFamily:"'Inter',system-ui"}}>✕ Cerrar</button>
        </div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:14,
          fontFamily:"'Inter',system-ui"}}>
          Armá tu apuesta: elegí partidos y sumá selecciones. La cuota se calcula sola.</div>

        {/* Buscador */}
        <div style={{display:"flex",alignItems:"center",gap:8,
          background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:10,padding:"8px 12px",marginBottom:8}}>
          <span style={{color:Q.muted,fontSize:14}}>🔍</span>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar equipo..."
            style={{background:"transparent",border:"none",color:Q.text,fontSize:14,flex:1,minWidth:0,
              fontFamily:"'Inter',system-ui"}}/>
          {busqueda&&<button onClick={()=>setBusqueda("")} style={{background:"transparent",
            border:"none",color:Q.muted,fontSize:16,cursor:"pointer",padding:0}}>✕</button>}
        </div>

        {/* Filtro de deporte */}
        <div style={{display:"flex",gap:5,overflowX:"auto",marginBottom:12,paddingBottom:2}}>
          <button onClick={()=>setSport(null)} style={{
            background:!sport?`${Q.violet}44`:ov(0.04),
            border:`1px solid ${!sport?Q.cyan:Q.border}`,borderRadius:20,padding:"5px 12px",
            cursor:"pointer",color:!sport?Q.cyan:Q.muted,fontSize:10,fontWeight:700,
            whiteSpace:"nowrap",flexShrink:0,fontFamily:"'Inter',system-ui"}}>Todos</button>
          {sports.map(sp=>(
            <button key={sp.name} onClick={()=>setSport(sp.name)} style={{
              background:sport===sp.name?`${Q.violet}44`:ov(0.04),
              border:`1px solid ${sport===sp.name?Q.cyan:Q.border}`,borderRadius:20,padding:"5px 12px",
              cursor:"pointer",color:sport===sp.name?Q.cyan:Q.muted,fontSize:10,fontWeight:700,
              whiteSpace:"nowrap",flexShrink:0,fontFamily:"'Inter',system-ui"}}>
              {sp.icon} {sp.name}</button>
          ))}
        </div>

        {loading&&<div style={{color:Q.muted,textAlign:"center",padding:30,
          fontFamily:"'Inter',system-ui"}}>Cargando partidos...</div>}

        {displaySports.map(sp=>(
          <div key={sp.name} style={{marginBottom:14}}>
            <div style={{color:Q.cyan,fontSize:12,fontWeight:700,marginBottom:6,marginLeft:2,
              fontFamily:"'Inter',system-ui"}}>{sp.icon} {sp.name}</div>
            {(sp.events||[]).map(ev=>(
              <GCard key={ev.id} style={{padding:12,marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
                    <TeamLogo name={ev.h||ev.home} size={24}/>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{color:Q.text,fontSize:12,fontWeight:600,
                        fontFamily:"'Inter',system-ui",whiteSpace:"nowrap",
                        overflow:"hidden",textOverflow:"ellipsis"}}>
                        {ev.h||ev.home} vs {ev.a||ev.away}</div>
                      <div style={{color:Q.muted,fontSize:10}}>{ev.time}</div>
                    </div>
                    <TeamLogo name={ev.a||ev.away} size={24}/>
                  </div>
                </div>
                <OddsButtons ev={ev} market="h2h" bets={picks} onToggle={toggle}/>
                <button onClick={()=>toggleExpand(ev.id)} style={{width:"100%",
                  background:"transparent",border:`1px solid ${Q.dim}`,borderRadius:8,padding:"5px",
                  cursor:"pointer",color:Q.dim,fontSize:10,marginTop:6,
                  fontFamily:"'Inter',system-ui"}}>
                  {expandedEvents[ev.id]?"▲ Menos mercados":"▼ Todos los mercados"}</button>
                {expandedEvents[ev.id]&&<MercadosEvento ev={ev} bets={picks} onToggle={toggle}/>}
              </GCard>
            ))}
          </div>
        ))}
      </div>

      {/* CARRITO VISIBLE fijo abajo */}
      <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:50,
        background:"rgba(6,6,18,0.98)",borderTop:`1px solid ${Q.violet}55`,
        maxWidth:520,margin:"0 auto",padding:"12px 14px 16px",
        maxHeight:"46vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:14,
            fontFamily:"'Inter',system-ui"}}>🎟️ Tu apuesta · {picks.length} {picks.length===1?"pick":"picks"}</div>
          {picks.length>0&&<button onClick={onLimpiar} style={{background:"transparent",border:"none",
            color:Q.red,fontSize:11,cursor:"pointer",fontFamily:"'Inter',system-ui"}}>Vaciar</button>}
        </div>

        {picks.length===0?(
          <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:"10px 0",
            fontFamily:"'Inter',system-ui"}}>Tocá las cuotas para sumar picks</div>
        ):(
          <>
            <div style={{marginBottom:10}}>
              {picks.map((p,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"6px 0",borderBottom:i<picks.length-1?`1px solid ${Q.border}`:"none"}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontSize:12,fontWeight:600,
                      fontFamily:"'Inter',system-ui",whiteSpace:"nowrap",
                      overflow:"hidden",textOverflow:"ellipsis"}}>{p.h} vs {p.a}</div>
                    <div style={{color:Q.cyan,fontSize:11,
                      fontFamily:"'Inter',system-ui"}}>{p.label} · {parseFloat(p.odd).toFixed(2)}</div>
                  </div>
                  <button onClick={()=>onQuitar(p.id,p.label)} style={{background:"transparent",
                    border:"none",color:Q.red,fontSize:16,cursor:"pointer",padding:"0 4px"}}>✕</button>
                </div>
              ))}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{color:Q.muted,fontSize:12,fontFamily:"'Inter',system-ui"}}>Cuota total</span>
              <span style={{color:Q.gold,fontWeight:800,fontSize:18,
                fontFamily:"'Inter',system-ui"}}>{tot.toFixed(2)}x</span>
            </div>

            {mismoPartido&&margenAplicado>0&&(
              <div style={{background:`${Q.cyan}0C`,border:`1px solid ${Q.cyan}44`,borderRadius:8,
                padding:"7px 10px",marginBottom:8,fontSize:10,color:Q.cyan,lineHeight:1.4,
                fontFamily:"'Inter',system-ui"}}>
                🔗 Combinada del mismo partido · cuota ajustada por correlación</div>
            )}

            <input value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))}
              placeholder="Monto a apostar" inputMode="numeric"
              style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
                borderRadius:10,padding:"11px 14px",color:Q.text,fontSize:16,marginBottom:8,
                fontFamily:"'Inter',system-ui"}}/>

            {montoNum>0&&(
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <span style={{color:Q.muted,fontSize:12,fontFamily:"'Inter',system-ui"}}>Ganancia posible</span>
                <span style={{color:Q.green,fontWeight:800,fontSize:16,
                  fontFamily:"'Inter',system-ui"}}>{money(ganancia,"ARS")}</span>
              </div>
            )}

            <div style={{display:"flex",gap:8}}>
              <button disabled={genLocal} onClick={async()=>{
                setGenLocal(true); await onLocal(picks); setGenLocal(false);
              }} style={{flex:"0 0 auto",background:ov(0.05),
                border:`1px solid ${Q.border}`,borderRadius:11,padding:"0 14px",cursor:"pointer",
                color:Q.muted,fontSize:12,fontFamily:"'Inter',system-ui"}}>
                {genLocal?"...":"🏪 Local"}</button>
              <button onClick={()=>onBet(picks,montoNum||0,tot)} disabled={montoNum<=0}
                style={{flex:1,background:montoNum>0?`linear-gradient(135deg,${Q.violet},${Q.cyan})`:ov(0.06),
                  border:"none",borderRadius:11,padding:"13px",color:"#fff",fontWeight:800,fontSize:14,
                  cursor:montoNum>0?"pointer":"default",fontFamily:"'Inter',system-ui"}}>
                {montoNum>0?`Apostar ${money(montoNum,"ARS")}`:"Ingresá un monto"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function QuartzSports(){
  const [screen,setScreen]=useState("home");
  const [betData,setBetData]=useState({bets:[],stake:10000,odd:1,code:""});
  const [refCode,setRefCode]=useState(null);
  const [errorGlobal,setErrorGlobal]=useState("");
  // Carrito global del bet builder (persiste entre pantallas)
  const [builderPicks,setBuilderPicks]=useState([]);
  const addPick=(pick)=>{
    setBuilderPicks(ps=>{
      // Toggle: si ya está exactamente ese pick, lo quita
      if(ps.some(p=>p.id===pick.id&&p.label===pick.label))
        return ps.filter(p=>!(p.id===pick.id&&p.label===pick.label));
      // Del mismo partido y mismo mercado, reemplaza (no dos resultados del mismo mercado)
      const sinMismoMercado=ps.filter(p=>!(p.id===pick.id&&p.market===pick.market));
      return [...sinMismoMercado, pick];
    });
  };
  const quitarPick=(id,label)=>setBuilderPicks(ps=>ps.filter(p=>!(p.id===id&&p.label===label)));
  const limpiarPicks=()=>setBuilderPicks([]);
  const cargarComboAlBuilder=(picks)=>{
    // Cargar los picks de un combo IA al builder para editarlos
    setBuilderPicks(picks.map(p=>({
      id:p.h||p.home||p.id, label:p.sel||p.label, odd:p.odd,
      h:p.h||p.home, a:p.a||p.away})));
    setScreen("builder");
  };
  // La barra de pasos es un atajo de desarrollo: se ve con ?dev=1
  const [verPasos]=useState(()=>
    new URLSearchParams(window.location.search).get("dev")==="1");
  const user = useUsuario();
  const [regHecho,setRegHecho]=useState(false);

  // Telegram: pantalla completa y colores propios de la app
  useEffect(()=>{
    const tg = window.Telegram?.WebApp;
    if(!tg) return;
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor?.(Q.deep);
      tg.setBackgroundColor?.(Q.void);
    } catch(e){}
  },[]);

  // Detectar código de influencer en la URL
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const startParam = params.get("start")||"";
    // ¿Es un link de escáner? ?scan=CODIGO o start=scan_CODIGO
    const scanRef = params.get("scan") || (startParam.startsWith("scan_")?startParam.replace("scan_",""):"");
    const ref = params.get("ref") || (startParam.startsWith("combo_")?startParam.replace("combo_",""):"");
    if(scanRef){
      setRefCode(scanRef);
      fetch(`${API}/api/influencer/track`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code:scanRef, event:"click_scan"}),
      }).catch(()=>{});
      setScreen("mejorar");   // abre directo el escáner
      return;
    }
    if(ref){
      setRefCode(ref);
      fetch(`${API}/api/influencer/track`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code:ref, event:"click_web"}),
      }).catch(()=>{});
      setScreen("combo");
    }
  },[]);

  const handle=(action)=>{
    const map={
      open:"home",sports:"home",prematch:"prematch",live:"live",
      pool:"pool",p2p:"p2p",combo:"combo",mybets:"mybets",
      mejorar:"mejorar",create_pool:"pool",
    };
    if(map[action]) setScreen(map[action]);
  };

  // Apostar y "generar código" hacen lo mismo contra el servidor:
  // crean un boleto pendiente. Cambia solo el mensaje al usuario.
  // Antes esto creaba el boleto derecho. Ahora abre la hoja para que el
  // cliente elija con que lo paga: saldo, bono o reservada.
  const [confirmando,setConfirmando]=useState(null);
  const [tema,setTema]=useState(temaGuardado());
  const cambiarTema=(t)=>{ aplicarTema(t); setTema(t); };
  aplicarTema(tema);   // se aplica en cada render, antes de pintar los hijos
  const confirmBet=(bets,stake,odd)=>{
    setErrorGlobal("");
    setConfirmando({bets,stake,odd});
  };
  const apuestaLista=(data,modo)=>{
    setConfirmando(null);
    setBetData({bets:confirmando?.bets||[], stake:data.stake||0,
                odd:data.odd_total||1, code:data.code, modo});
    setScreen("confirmed");
  };

  const generarLocal=async(bets)=>{
    setErrorGlobal("");
    try {
      const data = await crearBoleto(bets, refCode);
      const tot = bets.reduce((a,b)=>a*b.odd,1);
      setBetData({bets,stake:0,odd:tot,code:data.code});
      setScreen("confirmed");
    } catch(e){
      setErrorGlobal(e.message||"No se pudo generar el código");
    }
  };


  // PRIORIDAD ABSOLUTA: si está autenticado pero sin registrar, mostrar SOLO
  // el registro (antes que cualquier pantalla que pudiera fallar).
  if(user?.autenticado && user?.registrado===false && !regHecho){
    return(
      <div style={{maxWidth:520,margin:"0 auto",background:Q.void,
        width:"100%",height:"100dvh",overflowY:"auto",
        fontFamily:"system-ui,-apple-system,sans-serif"}}>
        <CazaError>
          <ScreenRegistro user={user} onListo={()=>{setRegHecho(true); setScreen("home");
            if(window.Telegram?.WebApp){ try{ window.location.reload(); }catch(e){} }}}/>
        </CazaError>
      </div>
    );
  }

  return(
    <div style={{maxWidth:520,margin:"0 auto",
      fontFamily:F_BODY,background:Q.void,
      width:"100%",height:"100dvh",display:"flex",flexDirection:"column",
      overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes qPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.5)}}
        @keyframes qFloat{0%,100%{transform:translateY(0) scale(1);opacity:.4}50%{transform:translateY(-16px) scale(1.2);opacity:.7}}
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:${F_BODY}}
        html,body,#root{height:100%;overscroll-behavior:none;
                        max-width:100%;overflow-x:hidden}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent;
               min-height:32px;touch-action:manipulation}
        button:active{opacity:.8} input:focus{outline:none}
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:${Q.border}}
      `}</style>


      <BarraSuperior user={user} onNav={setScreen} tema={tema} onTema={cambiarTema}/>

      {/* Barra de pasos — atajo de desarrollo, oculta por defecto */}
      {verPasos&&<div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"5px 8px",display:"flex",gap:3,overflowX:"auto",
        WebkitOverflowScrolling:"touch"}}>
        {STEPS.map((s,i,arr)=>(
          <div key={s.k} style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
            <button onClick={()=>setScreen(s.k)} style={{
              background:screen===s.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"transparent",
              border:`1px solid ${screen===s.k?Q.violet:Q.border}`,
              borderRadius:20,padding:"3px 9px",cursor:"pointer",
              color:screen===s.k?Q.cyan:Q.muted,fontSize:9,fontWeight:screen===s.k?700:400,
              fontFamily:"'Inter',system-ui",whiteSpace:"nowrap",
            }}>{s.l}</button>
            {i<arr.length-1&&<span style={{color:Q.dim,fontSize:9}}>›</span>}
          </div>
        ))}
      </div>}

      {errorGlobal&&(
        <div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",
          zIndex:80,width:"calc(100% - 24px)",maxWidth:406,
          background:"rgba(255,23,68,0.15)",border:`1.5px solid ${Q.red}`,
          borderRadius:12,padding:"10px 14px",display:"flex",
          alignItems:"center",justifyContent:"space-between",gap:8}}>
          <span style={{color:Q.text,fontSize:12,
            fontFamily:"'Inter',system-ui"}}>⚠️ {errorGlobal}</span>
          <button onClick={()=>setErrorGlobal("")} style={{background:"transparent",
            border:"none",color:Q.muted,fontSize:16,cursor:"pointer",padding:0}}>✕</button>
        </div>
      )}

      {/* Screens */}
      <div style={{flex:1,minHeight:0,overflowY:"auto",overflowX:"hidden",
        WebkitOverflowScrolling:"touch"}}>
        <CazaError>
        {screen==="home"      &&<ScreenHome         user={user} onNav={setScreen} onBet={confirmBet} refCode={refCode}/>}
        {screen==="sports"    &&<ScreenHome         user={user} onNav={setScreen} onBet={confirmBet} refCode={refCode}/>}
        {screen==="prematch"  &&<ScreenPrematch     onAction={handle} onBet={confirmBet} onLocal={generarLocal}/>}
        {screen==="builder"   &&<ScreenBuilder      picks={builderPicks} onAdd={addPick} onQuitar={quitarPick} onLimpiar={limpiarPicks} onBet={confirmBet} onLocal={generarLocal} onNav={setScreen}/>}
        {screen==="live"      &&<ScreenLive         onAction={handle} onBet={confirmBet} onLocal={generarLocal}/>}
        {screen==="pool"      &&<ScreenPool         onAction={handle}/>}
        {screen==="p2p"       &&<ScreenP2P          onAction={handle}/>}
        {screen==="combo"     &&<ScreenCombo        onAction={handle} onBet={confirmBet} refCode={refCode} onEditar={cargarComboAlBuilder}/>}
        {screen==="confirmed" &&<ScreenBetConfirmed bets={betData.bets} stake={betData.stake} odd={betData.odd} code={betData.code} onAction={handle}/>}
        {screen==="mybets"    &&<ScreenMyBets       onAction={handle} user={user}/>}
        {screen==="mejorar"   &&<ScreenMejorar      onAction={handle} user={user} refCode={refCode}/>}
        {screen==="cuenta"    &&<ScreenCuenta       user={user} onNav={setScreen}/>}
        </CazaError>
      </div>

      {confirmando&&(
        <HojaConfirmar picks={confirmando.bets} stake={confirmando.stake}
          odd={confirmando.odd} user={{...user, refCode}}
          onCerrar={()=>setConfirmando(null)} onListo={apuestaLista}/>
      )}

      {/* Barra inferior fija */}
      <BarraInferior actual={
        ["prematch","builder","combo","mybets","mejorar"].includes(screen)?screen
          :(screen==="live"?"prematch":"")
      } onNav={setScreen}/>
    </div>
  );
}
