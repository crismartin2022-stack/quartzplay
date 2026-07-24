import { useState, useEffect, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// QUARTZPLAY SPORTS — Web App Telegram completa
// Datos reales: The Odds API + Football API
// Mercados expandidos: 1X2, O/U, BTTS, Handicap
// Códigos QP desde la web
// ═══════════════════════════════════════════════════════════════
const Q = {
  void:"#020208", deep:"#060612", dark:"#0A0A1E",
  surface:"#0E0E28", card:"#12122E",
  glass:"linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))",
  violet:"#7C3AED", violet2:"#9F5FFF",
  cyan:"#00F0FF", green:"#00FF88",
  pink:"#FF0080", amber:"#FFB800",
  gold:"#E8C547", red:"#FF1744",
  blue:"#2979FF", teal:"#00BCD4",
  text:"#F0F0FF", muted:"#6B7090", dim:"#2A2A4A",
  border:"rgba(124,58,237,0.25)",
};

const API = "https://amusing-vision-production.up.railway.app";

const fmt = n => Number(n||0).toFixed(2);
const ars = n => "$" + Math.round(n||0).toLocaleString("es-AR");
const prod = a => a.reduce((x,y)=>x*y,1);
// El código lo genera el servidor y queda guardado en la base.
// Antes se sorteaba acá con Math.random() y no existía en ningún lado:
// el cajero lo buscaba y siempre daba "no encontrado".
async function crearBoleto(picks, infCode){
  const body = {
    picks: picks.map(p=>({
      home: p.h || p.home || "",
      away: p.a || p.away || "",
      sel:  p.label || p.sel || "",
      odd:  p.odd,
      sport: p.sport || "",
    })),
  };
  if(infCode) body.inf_code = infCode;

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
      background:Q.glass, backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
      border:`1px solid ${glow?glow+"44":Q.border}`,
      borderRadius:16,
      boxShadow:`0 8px 32px rgba(0,0,0,0.5)${glow?`, 0 0 24px ${glow}22`:""}`,
      position:"relative", overflow:"hidden", cursor:onClick?"pointer":"default", ...style,
    }}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:1,
        background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)",
        pointerEvents:"none"}}/>
      {children}
    </div>
  );
}

// Las posiciones se calculan UNA vez, no en cada render.
// Antes se recalculaban ~2 veces por segundo por el contador del pozo.
function Particles({ count=10, c1=Q.violet, c2=Q.cyan }){
  const parts = useMemo(()=>Array.from({length:count},(_,i)=>({
    x:Math.random()*100, y:Math.random()*100,
    s:1+Math.random()*2, dur:3+Math.random()*4,
    delay:Math.random()*4, color:i%2===0?c1:c2,
  })),[count,c1,c2]);

  return(
    <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0}}>
      {parts.map((p,i)=>(
        <div key={i} style={{
          position:"absolute",left:`${p.x}%`,top:`${p.y}%`,
          width:p.s,height:p.s,borderRadius:"50%",
          background:p.color,opacity:0.35,
          boxShadow:`0 0 ${p.s*3}px ${p.color}`,
          animation:`qFloat ${p.dur}s ease-in-out ${p.delay}s infinite`,
        }}/>
      ))}
    </div>
  );
}

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
        fontFamily:"'Space Grotesk',system-ui", fontWeight:900, fontSize:size,
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
      letterSpacing:0.5, fontFamily:"'Space Grotesk',system-ui",
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
      <span style={{color,fontSize:9,fontWeight:700,letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>LIVE</span>
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
      letterSpacing:0.3, fontFamily:"'Space Grotesk',system-ui",
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
      <div style={{flex:1}}>
        <div style={{color:Q.violet2,fontSize:11,fontWeight:700,marginBottom:3,
          fontFamily:"'Space Grotesk',system-ui",letterSpacing:0.3}}>QuartzPlay</div>
        <GCard style={{padding:"14px"}}>
          {children}
          <div style={{textAlign:"right",marginTop:6,color:Q.muted,fontSize:9,
            fontFamily:"'Space Grotesk',system-ui"}}>{time} ✓✓</div>
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
        <div style={{color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>{children}</div>
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
              background:btn.primary?`linear-gradient(135deg,${btn.color||Q.violet},${btn.color2||Q.cyan})`:"rgba(255,255,255,0.04)",
              border:`1px solid ${btn.primary?(btn.color||Q.violet)+"88":Q.border}`,
              borderRadius:10, padding:"11px 6px", cursor:"pointer",
              color:"#fff", fontSize:12, fontWeight:btn.primary?700:500,
              fontFamily:"'Space Grotesk',system-ui",
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
      <div style={{flex:1}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{title}</div>
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
    "#7C3AED","#2979FF","#00BCD4","#FF6B35","#E91E63",
    "#009688","#FF5722","#3F51B5","#8BC34A","#FF9800",
    "#9C27B0","#00ACC1","#43A047","#F4511E","#1E88E5",
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
  const fontSize = size <= 28 ? size*0.38 : size*0.35;

  if(name && !falloImg){
    return(
      <div style={{
        width:size, height:size, borderRadius:"50%", flexShrink:0,
        background:"rgba(255,255,255,0.06)",
        border:`1.5px solid ${color}66`,
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
      background:`linear-gradient(135deg,${color}CC,${color}88)`,
      border:`1.5px solid ${color}`,
      display:"flex", alignItems:"center", justifyContent:"center",
      boxShadow:`0 0 8px ${color}44`,
    }}>
      <span style={{
        color:"#fff", fontWeight:900, fontSize,
        fontFamily:"'Space Grotesk',system-ui", letterSpacing:-0.5,
        lineHeight:1, textShadow:"0 1px 2px rgba(0,0,0,0.5)",
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
      fontFamily:"'Space Grotesk',system-ui"}}>No disponible</div>
  );

  return(
    <div style={{display:"flex",gap:4}}>
      {outcomes.map((o,i)=>{
        const sel=bets.some(b=>b.id===ev.id&&b.label===o.label);
        return(
          <button key={i} onClick={()=>onToggle(ev,o.label,o.val)} style={{
            flex:1,
            background:sel?`linear-gradient(135deg,${color}44,${Q.violet}22)`:"rgba(255,255,255,0.04)",
            border:`1.5px solid ${sel?color:Q.border}`,
            borderRadius:10,padding:"8px 3px",cursor:"pointer",textAlign:"center",
            boxShadow:sel?`0 0 10px ${color}33`:"none",transition:"all 0.15s",
          }}>
            <div style={{color:Q.muted,fontSize:8,fontFamily:"'Space Grotesk',system-ui",
              marginBottom:2,lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",
              whiteSpace:"nowrap",maxWidth:"100%"}}>{o.short||o.label}</div>
            <div style={{color:sel?color:Q.text,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{fmt(o.val)}</div>
            {live&&<div style={{color:Q.pink,fontSize:7,marginTop:1}}>◉ LIVE</div>}
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
            letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:5}}>
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
    const initData = window.Telegram?.WebApp?.initData || "";
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
        fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>{titulo}</div>
      <div style={{color:Q.muted,fontSize:12,lineHeight:1.5,
        fontFamily:"'Space Grotesk',system-ui"}}>{detalle}</div>
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
            <span style={{color:Q.green,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
              {ars(Math.round(monto*tot))}
            </span>
            <button onClick={onClear} style={{background:"transparent",border:"none",
              color:Q.dim,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
          </div>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:8}}>
          {[5000,10000,20000,50000].map(v=>(
            <button key={v} onClick={()=>setMonto(v)} style={{
              flex:1,background:monto===v?`${color}33`:"rgba(255,255,255,0.04)",
              border:`1px solid ${monto===v?color:Q.border}`,
              borderRadius:8,padding:"5px 2px",cursor:"pointer",
              color:monto===v?color:Q.muted,fontSize:9,fontWeight:monto===v?700:400,
              fontFamily:"'Space Grotesk',system-ui",
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
            background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.border}`,
            borderRadius:12,padding:"0 12px",cursor:genCodigo?"wait":"pointer",color:Q.muted,
            fontSize:11,fontFamily:"'Space Grotesk',system-ui",whiteSpace:"nowrap",
          }}>{genCodigo?"...":"🏪 Local"}</button>
        </div>
      </GCard>
    </div>
  );
}

// ── POOLS & P2P DATA ───────────────────────────────────────────



// ═══════════════════════════════════════════════════════════════
// PANTALLA 1 — CANAL PÚBLICO
// ═══════════════════════════════════════════════════════════════
function ScreenCanal({ onBot }){
  const [liveCount,setLiveCount]=useState(0);
  const [combo,setCombo]=useState(null);
  useEffect(()=>{
    fetch(`${API}/api/live/combined`).then(r=>r.json())
      .then(d=>setLiveCount(d.matches?.length||0)).catch(()=>{});
    // El combo destacado sale de la API, no de una lista escrita a mano
    fetch(`${API}/api/ai/combos`).then(r=>r.ok?r.json():null)
      .then(d=>{ if(d?.combos?.length) setCombo(d.combos[0]); }).catch(()=>{});
  },[]);

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={12}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <GCard glow={Q.violet} style={{padding:"18px",marginBottom:14,
          background:`linear-gradient(135deg,${Q.violet}15,${Q.cyan}08)`}}>
          <Particles count={8}/>
          <div style={{position:"relative",zIndex:1,textAlign:"center"}}>
            <QPLogo size={22}/>
            <div style={{color:Q.muted,fontSize:11,marginTop:4,marginBottom:14,fontFamily:"'Space Grotesk',system-ui"}}>
              Cuotas reales · Prematch y En Vivo 🇦🇷
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:14}}>
              <HBadge label="⚽ Prematch" color={Q.violet}/>
              <HBadge label="🔴 En Vivo" color={Q.pink}/>
              {liveCount>0&&<HBadge label={`${liveCount} LIVE ahora`} color={Q.pink}/>}
            </div>
            <QKB rows={[[{label:"Abrir QuartzPlay Sports",action:"open",primary:true,icon:"⬡"}]]} onPress={onBot}/>
          </div>
        </GCard>

        {/* AI Combo destacado — datos reales de la API */}
        {combo&&(
        <GCard glow={Q.violet} style={{padding:"14px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{width:28,height:28,borderRadius:8,
              background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:14}}>⚡</div>
            <div>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {combo.name} — {combo.conf}/10
              </div>
              <HBadge label={combo.tag} color={combo.tagColor||Q.green}/>
            </div>
          </div>
          {combo.picks.slice(0,3).map((p,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",
              padding:"5px 0",gap:8,
              borderBottom:i<Math.min(2,combo.picks.length-1)?`1px solid ${Q.dim}`:"none"}}>
              <div style={{minWidth:0}}>
                <span style={{color:Q.muted,fontSize:11}}>{p.h} vs {p.a} · </span>
                <span style={{color:Q.text,fontSize:12,fontWeight:600}}>{p.sel}</span>
              </div>
              <span style={{color:Q.cyan,fontWeight:700,fontSize:13,flexShrink:0,
                fontFamily:"'Space Grotesk',system-ui"}}>{fmt(p.odd)}</span>
            </div>
          ))}
          <NDiv color={Q.violet}/>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <div>
              <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",
                letterSpacing:1}}>Cuota</div>
              <div style={{color:Q.gold,fontWeight:900,fontSize:20,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {fmt(combo.odd_total||prod(combo.picks.map(p=>p.odd)))}x
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",
                letterSpacing:1}}>Ret. $10K</div>
              <div style={{color:Q.green,fontWeight:900,fontSize:18,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {ars(Math.round(10000*(combo.odd_total||prod(combo.picks.map(p=>p.odd)))))}
              </div>
            </div>
          </div>
          <QKB rows={[[{label:"VER COMBOS",action:"open",primary:true,icon:"⚡"}]]}
            onPress={onBot}/>
        </GCard>
        )}

      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:520,
        padding:"10px 12px calc(14px + env(safe-area-inset-bottom))",
        background:`linear-gradient(0deg,${Q.void} 70%,transparent)`,zIndex:40}}>
        <button onClick={onBot} style={{
          width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:14,padding:"15px",
          color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",
          fontFamily:"'Space Grotesk',system-ui",letterSpacing:0.5,
          boxShadow:`0 8px 32px ${Q.violet}66`,textTransform:"uppercase",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
        }}>
          <span style={{fontSize:20}}>⬡</span> Abrir QuartzPlay Sports
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 2 — MENÚ SPORTS
// ═══════════════════════════════════════════════════════════════
function ScreenSportsMenu({ onAction, user }){
  const [liveCount,setLiveCount]=useState(0);
  useEffect(()=>{
    fetch(`${API}/api/live/combined`).then(r=>r.json())
      .then(d=>setLiveCount(d.matches?.length||0)).catch(()=>{});
  },[]);

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={10}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="9:43">/sports</UserMsg>
        <BotMsg time="9:43">
          <GCard glow={Q.green} style={{padding:"12px 14px",marginBottom:12,
            background:`linear-gradient(135deg,${Q.green}10,${Q.violet}08)`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:Q.muted,fontSize:9,letterSpacing:2,
                  textTransform:"uppercase",
                  fontFamily:"'Space Grotesk',system-ui"}}>SALDO</div>
                {user?.cargando?(
                  <div style={{color:Q.muted,fontSize:16,
                    fontFamily:"'Space Grotesk',system-ui"}}>...</div>
                ):user?.saldo!=null?(
                  <div style={{color:Q.green,fontWeight:900,fontSize:22,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(user.saldo)}</div>
                ):(
                  <div style={{color:Q.muted,fontSize:13,marginTop:2,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {user?.autenticado===false
                      ? "Abrí desde el bot para ver tu saldo"
                      : "Todavía no tenés cuenta"}
                  </div>
                )}
              </div>
              <div style={{textAlign:"right"}}>
                {user?.nombre&&<HBadge label={`@${user.nombre}`} color={Q.violet}/>}
                {user?.apuestas_activas>0&&(
                  <div style={{color:Q.muted,fontSize:10,marginTop:4}}>
                    Activas: {user.apuestas_activas}
                  </div>
                )}
              </div>
            </div>
          </GCard>

          {liveCount>0&&(
            <GCard glow={Q.pink} style={{padding:"10px 12px",marginBottom:12,cursor:"pointer"}}
              onClick={()=>onAction("live")}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <LiveDot/>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
                    {liveCount} partidos en vivo ahora
                  </div>
                </div>
                <span style={{color:Q.pink,fontSize:18}}>›</span>
              </div>
            </GCard>
          )}


          <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,
            fontFamily:"'Space Grotesk',system-ui",marginBottom:8}}>Modos de apuesta</div>
          <QKB rows={[
            [{label:"📋 Prematch",action:"prematch",primary:true,color:Q.violet},
             {label:"🔴 En Vivo",action:"live",primary:true,color:Q.pink,color2:Q.violet}],
            [{label:"⚡ AI Combo",action:"combo",icon:"⚡"},
             {label:"📊 Mis apuestas",action:"mybets",icon:"📊"}],
          ]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 3 — PREMATCH (datos reales + mercados expandidos)
// ═══════════════════════════════════════════════════════════════
function ScreenPrematch({ onAction, onBet, onLocal }){
  const [bets,setBets]=useState([]);
  const [sports,setSports]=useState([]);
  const [loading,setLoading]=useState(true);
  const [sport,setSport]=useState(null);
  const [expandedEvents,setExpandedEvents]=useState({});

  useEffect(()=>{
    fetch(`${API}/api/live/all-markets`)
      .then(r=>r.json())
      .then(d=>{ if(d.sports) setSports(d.sports); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[]);

  const toggle=(ev,label,odd)=>{
    setBets(p=>{
      const w=p.filter(b=>b.id!==ev.id||b.label!==label);
      if(p.find(b=>b.id===ev.id&&b.label===label)) return w;
      return[...w,{id:ev.id,label,odd,h:ev.h||ev.home,a:ev.a||ev.away}];
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
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:10,fontFamily:"'Space Grotesk',system-ui"}}>
            📋 Apuestas Prematch — Cuotas reales
          </div>

          {/* Sport filter */}
          <div style={{display:"flex",gap:5,overflowX:"auto",marginBottom:12,paddingBottom:2}}>
            <button onClick={()=>setSport(null)} style={{
              background:!sport?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
              border:`1px solid ${!sport?Q.cyan:Q.border}`,borderRadius:20,
              padding:"5px 12px",cursor:"pointer",color:!sport?Q.cyan:Q.muted,
              fontSize:10,fontWeight:!sport?700:400,fontFamily:"'Space Grotesk',system-ui",
              whiteSpace:"nowrap",flexShrink:0,
            }}>Todos</button>
            {displaySports.map(s=>(
              <button key={s.name} onClick={()=>setSport(s.name)} style={{
                background:sport===s.name?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
                border:`1px solid ${sport===s.name?Q.cyan:Q.border}`,borderRadius:20,
                padding:"5px 12px",cursor:"pointer",color:sport===s.name?Q.cyan:Q.muted,
                fontSize:10,fontWeight:sport===s.name?700:400,fontFamily:"'Space Grotesk',system-ui",
                whiteSpace:"nowrap",flexShrink:0,
              }}>{s.icon} {s.name}</button>
            ))}
          </div>

          {loading&&<div style={{textAlign:"center",color:Q.muted,padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
            Cargando cuotas reales...
          </div>}

          {displaySports.filter(s=>!sport||s.name===sport).map(s=>(
            <div key={s.name} style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:16}}>{s.icon}</span>
                <span style={{color:Q.violet2,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{s.name}</span>
              </div>
              {(s.events||[]).map(ev=>(
                <GCard key={ev.id} style={{padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}
                    onClick={()=>toggleExpand(ev.id)}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                      <TeamLogo name={ev.h} size={26}/>
                      <div style={{minWidth:0}}>
                        <div style={{color:Q.text,fontWeight:700,fontSize:13,
                          fontFamily:"'Space Grotesk',system-ui",
                          overflow:"hidden",textOverflow:"ellipsis"}}>
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
                    fontSize:10,marginTop:6,fontFamily:"'Space Grotesk',system-ui",
                  }}>
                    {expandedEvents[ev.id]?"▲ Menos mercados":"▼ Todos los mercados"}
                  </button>

                  {/* Todos los mercados cuando está expandido */}
                  {expandedEvents[ev.id]&&(
                    <MercadosEvento ev={ev} bets={bets} onToggle={toggle}/>
                  )}
                </GCard>
              ))}
            </div>
          ))}
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
              <span style={{color:Q.text,fontWeight:700,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}>
                {loading?"Cargando...":`${matches.length} partidos en vivo`}
              </span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {lastUpdate&&<span style={{color:Q.dim,fontSize:10}}>{lastUpdate}</span>}
              <button onClick={fetchLive} style={{background:"transparent",border:`1px solid ${Q.border}`,
                borderRadius:8,padding:"4px 8px",cursor:"pointer",color:Q.muted,fontSize:10}}>🔄</button>
            </div>
          </div>

          {loading&&<div style={{textAlign:"center",color:Q.muted,padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}

          {!loading&&matches.length===0&&(
            <div style={{textAlign:"center",padding:24}}>
              <div style={{fontSize:32,marginBottom:8}}>⚽</div>
              <div style={{color:Q.muted,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>No hay partidos en vivo ahora</div>
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
                <div style={{textAlign:"center",flex:1}}>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
                    <TeamLogo name={ev.home} size={36}/>
                  </div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{ev.home}</div>
                </div>
                <div style={{textAlign:"center",padding:"0 10px"}}>
                  <div style={{fontFamily:"'Space Grotesk',system-ui",fontWeight:900,fontSize:30,color:Q.pink}}>
                    {ev.homeScore}<span style={{color:Q.dim}}>:</span>{ev.awayScore}
                  </div>
                  <div style={{color:Q.pink,fontSize:9,fontFamily:"'Space Grotesk',system-ui",letterSpacing:1}}>EN CURSO</div>
                </div>
                <div style={{textAlign:"center",flex:1}}>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
                    <TeamLogo name={ev.away} size={36}/>
                  </div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{ev.away}</div>
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
                        flex:1,
                        background:bets.some(b=>b.id===ev.id&&b.label===o.label)?`linear-gradient(135deg,${Q.pink}44,${Q.violet}22)`:"rgba(255,255,255,0.04)",
                        border:`1.5px solid ${bets.some(b=>b.id===ev.id&&b.label===o.label)?Q.pink:Q.border}`,
                        borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",transition:"all 0.2s",
                      }}>
                        <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{o.label}</div>
                        <div style={{color:bets.some(b=>b.id===ev.id&&b.label===o.label)?Q.pink:o.c,
                          fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(o.val)}</div>
                        <div style={{color:Q.pink,fontSize:8}}>◉ LIVE</div>
                      </button>
                    ))}
                  </div>
                  {/* Expandir para más mercados */}
                  <button onClick={()=>toggleExpand(ev.id)} style={{
                    width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                    borderRadius:8,padding:"5px",cursor:"pointer",color:Q.dim,
                    fontSize:10,marginTop:6,fontFamily:"'Space Grotesk',system-ui",
                  }}>
                    {expandedEvents[ev.id]?"▲ Menos mercados":"▼ Todos los mercados"}
                  </button>
                  {expandedEvents[ev.id]&&(
                    <MercadosEvento ev={ev} bets={bets} onToggle={toggle} color={Q.pink}/>
                  )}
                </>
              ):(
                <div style={{textAlign:"center",color:Q.dim,fontSize:11,padding:"8px 0",
                  fontFamily:"'Space Grotesk',system-ui"}}>Cuotas en vivo no disponibles</div>
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
          fontFamily:"'Space Grotesk',system-ui"}}>🎯 Pools</div>
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
          fontFamily:"'Space Grotesk',system-ui"}}>🤝 Apuestas P2P</div>
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
function ScreenCombo({ onAction, onBet, refCode }){
  const [sel,setSel]=useState("c1");
  const [voted,setVoted]=useState({});
  const [codeGenerated,setCodeGenerated]=useState({});
  const [realCombos,setRealCombos]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    fetch(`${API}/api/ai/combos`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(d&&d.combos&&d.combos.length>0){
          setRealCombos(d.combos);
          setSel(d.combos[0].id);
        }
      })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[]);

  const combosToShow = realCombos || [];
  const combo = combosToShow.find(c=>c.id===sel) || combosToShow[0];
  const tot = combo ? combo.picks.reduce((a,p)=>a*p.odd,1) : 1;
  const stake=10000;

  if(!loading && !combo) return(
    <div style={{background:Q.void,minHeight:"100%",padding:"14px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>⚡ AI Combos</div>
        <GCard style={{padding:26,textAlign:"center",margin:"12px 0"}}>
          <div style={{fontSize:30,marginBottom:8}}>🌙</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>
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

  const [genError,setGenError]=useState("");
  const [generando,setGenerando]=useState(false);

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
                <div style={{color:Q.text,fontWeight:700,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}>AI Combos del día</div>
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
                background:sel===c.id?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
                border:`1px solid ${sel===c.id?Q.cyan:Q.border}`,
                borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",
              }}>
                <div style={{color:sel===c.id?Q.cyan:Q.muted,fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{c.name.replace("AI ","")}</div>
                <div style={{color:Q.gold,fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui",marginTop:2}}>
                  {c.picks.reduce((a,p)=>a*p.odd,1).toFixed(2)}x
                </div>
              </button>
            ))}
          </div>

          {/* Combo */}
          <GCard glow={Q.violet} style={{padding:"14px",marginBottom:12,
            background:`linear-gradient(135deg,${Q.violet}10,${Q.cyan}05)`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <HBadge label={combo.name} color={Q.violet}/>
              <HBadge label={`${combo.conf}/10`} color={combo.tagColor}/>
            </div>
            {combo.picks.map((p,i)=>(
              <GCard key={i} style={{padding:"10px 12px",marginBottom:6,background:"rgba(124,58,237,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1,marginRight:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      {p.live&&<><LiveDot/><span style={{color:Q.muted,fontSize:9}}>{p.min?`Min ${p.min}'`:p.set?`Set ${p.set}`:""}</span></>}
                      <HBadge label={p.mkt} color={Q.dim}/>
                    </div>
                    <div style={{color:Q.muted,fontSize:10,marginBottom:1}}>{p.h} vs {p.a}</div>
                    <div style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>{p.sel}</div>
                  </div>
                  <div style={{color:Q.cyan,fontWeight:900,fontSize:18,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(p.odd)}</div>
                </div>
              </GCard>
            ))}
            <NDiv color={Q.violet}/>
            <div style={{color:Q.muted,fontSize:11,fontStyle:"italic",marginBottom:10}}>💡 {combo.note}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Cuota total</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:24,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(tot)}x</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Ret. $10K</div>
                <div style={{color:Q.green,fontWeight:900,fontSize:22,fontFamily:"'Space Grotesk',system-ui"}}>{ars(Math.round(stake*tot))}</div>
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
                  onBet(combo.picks.map(p=>({id:p.h,label:p.sel,odd:p.odd,h:p.h,a:p.a})),stake,tot);
                }} style={{
                  width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                  border:"none",borderRadius:12,padding:"16px",
                  color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",
                  fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
                  boxShadow:`0 6px 24px ${Q.violet}66`,
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                }}>⚡ APOSTAR {ars(stake)}</button>

                {!codeGenerated[sel]?(
                  <>
                  <button disabled={generando} onClick={()=>genQPCode(combo)} style={{
                    width:"100%",background:"rgba(255,255,255,0.04)",
                    border:`1px solid ${Q.border}`,borderRadius:12,padding:"12px",
                    color:Q.muted,fontWeight:600,fontSize:13,
                    cursor:generando?"wait":"pointer",
                    fontFamily:"'Space Grotesk',system-ui",
                  }}>{generando?"Generando...":"🏪 Generar código para local"}</button>
                  {genError&&<div style={{color:Q.red,fontSize:11,marginTop:6,
                    textAlign:"center",fontFamily:"'Space Grotesk',system-ui"}}>{genError}</div>}
                  </>
                ):(
                  <GCard glow={Q.green} style={{padding:"12px",textAlign:"center"}}>
                    <div style={{color:Q.muted,fontSize:11,marginBottom:4}}>Código generado</div>
                    <div style={{color:Q.cyan,fontWeight:900,fontSize:20,fontFamily:"'Space Grotesk',system-ui",letterSpacing:2}}>
                      {codeGenerated[sel]}
                    </div>
                    <div style={{color:Q.muted,fontSize:10,marginTop:4}}>Mostralo en el local para apostar en efectivo</div>
                  </GCard>
                )}
              </div>
            ):(
              <GCard glow={Q.green} style={{padding:"12px",textAlign:"center"}}>
                <div style={{color:Q.green,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>
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
            <div style={{fontFamily:"'Space Grotesk',system-ui",fontWeight:900,fontSize:20,
              color:Q.green,textShadow:`0 0 16px ${Q.green}66`,marginBottom:4}}>¡Apuesta registrada!</div>
          </div>
          <GCard glow={Q.green} style={{padding:"14px",marginBottom:12}}>
            {bets.map((b,i)=>(
              <div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${Q.dim}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:Q.muted,fontSize:11}}>{b.h} vs {b.a}</span>
                  <span style={{color:Q.cyan,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(b.odd)}</span>
                </div>
                <div style={{color:Q.text,fontSize:12,fontWeight:600,fontFamily:"'Space Grotesk',system-ui"}}>{b.label}</div>
              </div>
            ))}
            <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${Q.violet}44`}}>
              {[["Código",code,Q.cyan],["Apostado",ars(stake)+" ARS",Q.text],
                ["Cuota",fmt(odd)+"x",Q.cyan],["Retorno pot.",ars(ret)+" ARS",Q.green]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                  <span style={{color:Q.muted,fontSize:12}}>{l}</span>
                  <span style={{color:c,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{v}</span>
                </div>
              ))}
            </div>
          </GCard>
          <div style={{color:Q.amber,fontSize:11,marginBottom:10,fontFamily:"'Space Grotesk',system-ui"}}>
            ⏳ El boleto queda reservado 24 horas
          </div>
          <div style={{color:Q.muted,fontSize:11,marginBottom:10,fontFamily:"'Space Grotesk',system-ui"}}>
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
function ScreenMyBets({ onAction }){
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
            fontFamily:"'Space Grotesk',system-ui"}}>📊 Mis apuestas</div>

          {!datos&&(
            <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:16,
              fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>
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
                fontFamily:"'Space Grotesk',system-ui"}}>
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
                    fontFamily:"'Space Grotesk',system-ui",marginBottom:2,
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
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(b.stake)}</span>
                </span>
                <span style={{fontWeight:700,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui",
                  color:b.status==="won"?Q.green:b.status==="lost"?Q.red:Q.cyan}}>
                  {b.status==="won"?"+"+ars(b.potential_win)
                   :b.status==="lost"?"-"+ars(b.stake)
                   :"→ "+ars(b.potential_win)}
                </span>
              </div>
            </GCard>
          ))}

          <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
const STEPS=[
  {k:"canal",    l:"📢 Canal"},
  {k:"sports",   l:"🏠 Sports"},
  {k:"prematch", l:"📋 Prematch"},
  {k:"live",     l:"🔴 En Vivo"},
  {k:"combo",    l:"⚡ Combos IA"},
  {k:"confirmed",l:"✅ Confirmada"},
  {k:"mybets",   l:"📊 Mis apuestas"},
];

export default function QuartzSports(){
  const [screen,setScreen]=useState("canal");
  const [betData,setBetData]=useState({bets:[],stake:10000,odd:1,code:""});
  const [refCode,setRefCode]=useState(null);
  const [errorGlobal,setErrorGlobal]=useState("");
  // La barra de pasos es un atajo de desarrollo: se ve con ?dev=1
  const [verPasos]=useState(()=>
    new URLSearchParams(window.location.search).get("dev")==="1");
  const user = useUsuario();

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
    const ref = params.get("ref") || params.get("start")?.replace("combo_","");
    if(ref){
      setRefCode(ref);
      // Trackear click en la API
      fetch(`${API}/api/influencer/track`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code:ref, event:"click_web"}),
      }).catch(()=>{});
      // Ir directo a combos si viene de influencer
      setScreen("combo");
    }
  },[]);

  const handle=(action)=>{
    const map={
      open:"sports",sports:"sports",prematch:"prematch",live:"live",
      pool:"pool",p2p:"p2p",combo:"combo",mybets:"mybets",
      create_pool:"pool",
    };
    if(map[action]) setScreen(map[action]);
  };

  // Apostar y "generar código" hacen lo mismo contra el servidor:
  // crean un boleto pendiente. Cambia solo el mensaje al usuario.
  const confirmBet=async(bets,stake,odd)=>{
    setErrorGlobal("");
    try {
      const data = await crearBoleto(bets, refCode);
      setBetData({bets,stake,odd,code:data.code});
      setScreen("confirmed");
    } catch(e){
      setErrorGlobal(e.message||"No se pudo registrar la apuesta");
    }
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

  const isCanal=screen==="canal";

  return(
    <div style={{maxWidth:520,margin:"0 auto",
      fontFamily:"system-ui,-apple-system,sans-serif",background:Q.void,
      height:"100dvh",display:"flex",flexDirection:"column",
      overflow:"hidden"}}>
      <style>{`
        @keyframes qPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.5)}}
        @keyframes qFloat{0%,100%{transform:translateY(0) scale(1);opacity:.4}50%{transform:translateY(-16px) scale(1.2);opacity:.7}}
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{height:100%;overscroll-behavior:none}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent;
               min-height:32px;touch-action:manipulation}
        button:active{opacity:.8} input:focus{outline:none}
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:${Q.border}}
      `}</style>

      {/* Header */}
      {isCanal?(
        <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
          padding:"10px 16px",display:"flex",alignItems:"center",gap:12,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
            background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
          <div style={{width:42,height:42,borderRadius:"50%",
            background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,
            boxShadow:`0 0 16px ${Q.violet}66`}}>⬡</div>
          <div style={{flex:1}}>
            <QPLogo size={16}/>
            <div style={{color:Q.muted,fontSize:11,marginTop:1}}>Canal oficial</div>
          </div>
        </div>
      ):(
        <TgHeader title="QuartzPlay Sports" sub="● en línea"
          onBack={()=>{
            const prev={sports:"canal",prematch:"sports",live:"sports",
              pool:"sports",p2p:"sports",combo:"sports",confirmed:"sports",mybets:"sports"};
            setScreen(prev[screen]||"canal");
          }}/>
      )}

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
              fontFamily:"'Space Grotesk',system-ui",whiteSpace:"nowrap",
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
            fontFamily:"'Space Grotesk',system-ui"}}>⚠️ {errorGlobal}</span>
          <button onClick={()=>setErrorGlobal("")} style={{background:"transparent",
            border:"none",color:Q.muted,fontSize:16,cursor:"pointer",padding:0}}>✕</button>
        </div>
      )}

      {/* Screens */}
      <div style={{flex:1,minHeight:0,overflowY:"auto",
        WebkitOverflowScrolling:"touch"}}>
        {screen==="canal"     &&<ScreenCanal       onBot={()=>setScreen("sports")}/>}
        {screen==="sports"    &&<ScreenSportsMenu   onAction={handle} user={user}/>}
        {screen==="prematch"  &&<ScreenPrematch     onAction={handle} onBet={confirmBet} onLocal={generarLocal}/>}
        {screen==="live"      &&<ScreenLive         onAction={handle} onBet={confirmBet} onLocal={generarLocal}/>}
        {screen==="pool"      &&<ScreenPool         onAction={handle}/>}
        {screen==="p2p"       &&<ScreenP2P          onAction={handle}/>}
        {screen==="combo"     &&<ScreenCombo        onAction={handle} onBet={confirmBet} refCode={refCode}/>}
        {screen==="confirmed" &&<ScreenBetConfirmed bets={betData.bets} stake={betData.stake} odd={betData.odd} code={betData.code} onAction={handle}/>}
        {screen==="mybets"    &&<ScreenMyBets       onAction={handle}/>}
      </div>
    </div>
  );
}
