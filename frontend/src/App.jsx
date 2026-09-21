import { useState, useEffect, useMemo, useCallback, useRef, Component } from "react";
import { getFrontendConfig } from "./config";
import CameraCapture from "./CameraCapture";
import { betslipPicks } from "./betslipPicks";
import { estadoDeAcciones, stakeValido, mensajeDeDetalle } from "./betBestActions";
import { oscuro as Q, F_NUM, F_BODY, inkOn, RADII, SPACING } from "./theme";
import BrandMark from "./BrandMark";
import Mascot, { MASCOT_FACE_ASSET } from "./Mascot";
import Icon from "./Icon";
import { useDesktopShellWidth } from "./desktopShellLayout";
// lucide-react carries the icons this screen's emoji have no match for
// among Icon.jsx's 36 ported paths (docs/icon-inventory.md's gap list):
// no live-feed mark, no handshake, no bolt, no gift.
import { Video, Handshake, Zap, Gift, Image as ImageIcon, User, Flame, Coins, Link, Bell, Calendar, Rocket, Store, Target, Shield, Scale, Dices, Moon, Lightbulb, Pencil, Repeat, Smartphone, PartyPopper, Eye, Heart, Construction } from "lucide-react";


// Superposiciones (hover, vidrio).
function ov(a){
  return `rgba(255,255,255,${a})`;
}

const { apiUrl: API } = getFrontendConfig();

const fmt = n => Number(n||0).toFixed(2);
const ars = n => "$" + Math.round(n||0).toLocaleString("es-AR");

// Montos sugeridos según la moneda. 20.000 es una apuesta corriente en
// pesos y una barbaridad en dólares, así que la escala se ajusta.
// Devuelve siempre 4 valores para las fichas rápidas.
const MONTOS_POR_MONEDA = {
  ARS: [2000, 5000, 10000, 20000],
  CLP: [2000, 5000, 10000, 20000],
  COP: [5000, 10000, 20000, 50000],
  PYG: [10000, 20000, 50000, 100000],
  USD: [5, 10, 20, 50],
  EUR: [5, 10, 20, 50],
  BRL: [10, 25, 50, 100],
  UYU: [100, 250, 500, 1000],
  PEN: [10, 25, 50, 100],
  MXN: [50, 100, 250, 500],
};
function montosDe(moneda){
  return MONTOS_POR_MONEDA[(moneda||"ARS").toUpperCase()]
      || MONTOS_POR_MONEDA.ARS;
}
// El monto inicial: el segundo de la lista, ni el mínimo ni el máximo.
function montoInicial(moneda){ return montosDe(moneda)[1]; }


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
//
// home/away: se prefiere home_real/away_real — el nombre que nuestro
// feed le puso al evento después de emparejarlo (lo que devuelve el
// escáner de Mejorar mi apuesta) — antes que el texto leído o tecleado
// en el origen, que rara vez coincide con la ortografía del feed.
//
// sel: el escáner llama a la selección "selection"; el resto de la app
// arma los picks con "label" o "sel". Se prueba selection primero
// porque ya viene emparejada contra nuestro catálogo, no tecleada.
//
// Se exporta para poder testearla sin levantar la pantalla completa.
export function normalizarPicks(picks){
  return picks.map(p=>({
    home: p.home_real || p.h || p.home || "",
    away: p.away_real || p.a || p.away || "",
    sel:  p.selection || p.label || p.sel || "",
    odd:  p.odd,
    sport: p.sport || "",
    event_id:  p.event_id || p.id || "",
    sport_key: p.sport_key || "",
    market:    p.market || "",
    // La hora de inicio la usa la anulación para saber si el evento
    // está por empezar. Sin esto, ninguna apuesta se puede anular.
    commence_time: p.commence_time || p.time || "",
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
    // e.detail puede ser un texto plano o un dict {reason,message}
    // (login_required y afines). Leerlo directo renderiza
    // "[object Object]" para el segundo caso.
    throw new Error(mensajeDeDetalle(e.detail).mensaje || `Error ${r.status}`);
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
      borderRadius:RADII.lg,
      // overflow visible: con "hidden" la tarjeta recortaba lo que
      // excediera su alto y campos enteros quedaban invisibles sin
      // ningún error en consola.
      position:"relative", overflow:"visible", maxWidth:"100%", minWidth:0,
      cursor:onClick?"pointer":"default", ...style,
    }}>
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

// QPLogo lived here, drawing its own hexagon beside "IAQP". It was never
// rendered anywhere in this file (confirmed: no `<QPLogo` anywhere in
// src/, and it was not exported), so the earlier pass that swapped its
// SVG for BrandMark shipped a second, unused answer to a question this
// file's real header (BarraSuperior, below) already asks differently.
// Removed rather than kept updated-but-dead.

function HBadge({ label, color=Q.violet }){
  return(
    <span style={{
      background:`linear-gradient(135deg,${color}33,${color}11)`,
      border:`1px solid ${color}66`, borderRadius:RADII.xl,
      padding:"4px 12px", fontSize:12, fontWeight:700, color,
      letterSpacing:0.5, fontFamily:F_BODY,
    }}>{label}</span>
  );
}

function NDiv({ color=Q.violet }){
  return(
    <div style={{display:"flex",alignItems:"center",gap:SPACING[8],margin:"8px 0"}}>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${color}44)`}}/>
      <div style={{width:4,height:4,borderRadius:"50%",background:color,boxShadow:`0 0 8px ${color}`}}/>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,${color}44,transparent)`}}/>
    </div>
  );
}

function LiveDot({ color=Q.pink }){
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:SPACING[4]}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:color,
        boxShadow:`0 0 6px ${color}`,animation:"qPulse 1.2s ease-in-out infinite",display:"inline-block"}}/>
      <span style={{color,fontSize:12,fontWeight:700,letterSpacing:1,fontFamily:F_BODY}}>LIVE</span>
    </span>
  );
}

function QBtn({ label, icon, onClick, color=Q.violet, size="md", full=false, outline=false }){
  const h=size==="lg"?"52px":size==="sm"?"32px":"44px";
  const fs=size==="lg"?16:size==="sm"?12:13;
  return(
    <button onClick={onClick} style={{
      height:h, width:full?"100%":"auto",
      padding:`0 ${size==="sm"?"10px":"20px"}`,
      background:outline?"transparent":`linear-gradient(135deg,${color},${color}CC)`,
      border:`1px solid ${color}`, borderRadius:RADII.lg,
      color:outline?color:inkOn(color), fontSize:fs, fontWeight:700, cursor:"pointer",
      display:"flex", alignItems:"center", justifyContent:"center", gap:SPACING[8],
      letterSpacing:0.3, fontFamily:F_BODY,
      boxShadow:outline?"none":`0 4px 20px ${color}44`,
      textTransform:"uppercase",
    }}>
      {icon&&<span style={{fontSize:fs+2}}>{icon}</span>}{label}
    </button>
  );
}

function BotMsg({ children, time="9:41" }){
  return(
    <div style={{display:"flex",gap:SPACING[12],alignItems:"flex-start",marginBottom:16}}>
      {/* El avatar es la cara del bot, no un glifo geométrico. El archivo
          venía en el paquete desde que se sumaron los assets de marca y no
          se usaba en ninguna parte: es exactamente la pieza pensada para
          superficies chicas como esta. */}
      <div style={{width:36,height:36,borderRadius:"50%",
        background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        display:"flex",alignItems:"center",justifyContent:"center",
        overflow:"hidden",flexShrink:0,
        boxShadow:`0 0 12px ${Q.violet}44`}}>
        <img src={MASCOT_FACE_ASSET} alt="" aria-hidden="true"
          style={{width:32,height:32,objectFit:"contain",display:"block"}}/>
      </div>
      {/* minWidth:0 es imprescindible: sin esto el ítem flex no se achica
          por debajo de su contenido y los nombres largos de equipos
          empujan toda la pantalla hacia la derecha. */}
      <div style={{flex:1,minWidth:0}}>
        <BrandMark size={16} style={{marginBottom:4}}/>
        <GCard style={{padding:"16px"}}>
          {children}
          <div style={{textAlign:"right",marginTop:6,color:Q.muted,fontSize:12,
            fontFamily:F_BODY}}>{time} ✓✓</div>
        </GCard>
      </div>
    </div>
  );
}

function UserMsg({ children, time="9:41" }){
  return(
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
      <GCard glow={Q.violet} style={{padding:"12px 16px",maxWidth:"75%",
        background:`linear-gradient(135deg,${Q.violet}22,${Q.cyan}08)`}}>
        <div style={{color:Q.text,fontSize:13,fontFamily:F_BODY}}>{children}</div>
        <div style={{textAlign:"right",marginTop:4,color:Q.muted,fontSize:12}}>{time} ✓✓</div>
      </GCard>
    </div>
  );
}

function QKB({ rows, onPress }){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:SPACING[8],marginTop:10}}>
      {rows.map((row,ri)=>(
        <div key={ri} style={{display:"flex",gap:SPACING[8]}}>
          {row.map((btn,bi)=>(
            <button key={bi} onClick={()=>onPress&&onPress(btn.action)} style={{
              flex:1,
              background:btn.primary?`linear-gradient(135deg,${btn.color||Q.violet},${btn.color2||Q.cyan})`:ov(0.04),
              border:`1px solid ${btn.primary?(btn.color||Q.violet)+"88":Q.border}`,
              borderRadius:RADII.md, padding:"12px 8px", cursor:"pointer",
              color:btn.primary?inkOn(btn.color||Q.violet, btn.color2||Q.cyan):Q.text, fontSize:12, fontWeight:btn.primary?700:500,
              fontFamily:F_BODY,
              textTransform:btn.primary?"uppercase":"none",
              letterSpacing:btn.primary?0.3:0,
              boxShadow:btn.primary?`0 4px 16px ${btn.color||Q.violet}44`:"none",
              display:"flex", alignItems:"center", justifyContent:"center", gap:SPACING[8],
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
      padding:"12px 16px",display:"flex",alignItems:"center",gap:SPACING[12],
      position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
        background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
      {onBack&&<button onClick={onBack} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:26,cursor:"pointer",padding:0,lineHeight:1}}>‹</button>}
      <div style={{width:40,height:40,borderRadius:"50%",
        background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        display:"flex",alignItems:"center",justifyContent:"center",
        color:inkOn(Q.violet, Q.cyan),
        fontSize:20,flexShrink:0,boxShadow:`0 0 14px ${Q.violet}66`}}>⬡</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,fontFamily:F_BODY}}>{title}</div>
        {sub&&<div style={{color:Q.green,fontSize:12,marginTop:1}}>{sub}</div>}
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
    <div style={{textAlign:"center",color:Q.dim,fontSize:12,padding:"8px 0",
      fontFamily:F_BODY}}>No disponible</div>
  );

  return(
    <div style={{display:"flex",gap:SPACING[4]}}>
      {outcomes.map((o,i)=>{
        const sel=bets.some(b=>b.id===ev.id&&b.label===o.label);
        return(
          <button key={i} onClick={()=>onToggle(ev,o.label,o.val,market)} style={{
            flex:"1 1 0",minWidth:0,overflow:"hidden",
            background:sel?color:Q.inset,
            border:`1px solid ${sel?color:Q.border}`,
            borderRadius:RADII.md,padding:"8px 4px",cursor:"pointer",textAlign:"center",
            transition:"all 0.13s",
          }}>
            <div style={{color:sel?inkOn(color):Q.dim,fontSize:12,fontFamily:F_BODY,
              fontWeight:600,letterSpacing:0.6,
              marginBottom:1,lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",
              whiteSpace:"nowrap",maxWidth:"100%"}}>{o.short||o.label}</div>
            <div style={{color:sel?inkOn(color):Q.gold,fontWeight:700,fontSize:17,
              lineHeight:1.05,fontFamily:F_NUM}}>{fmt(o.val)}</div>
            {live&&<div style={{color:sel?inkOn(color):Q.pink,fontSize:12,marginTop:1,
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
    <div style={{marginTop:8,paddingTop:SPACING[8],borderTop:`1px solid ${Q.dim}`}}>
      {availableMkts.map(mkt=>(
        <div key={mkt} style={{marginBottom:8}}>
          <div style={{color:Q.muted,fontSize:12,textTransform:"uppercase",
            letterSpacing:1,fontFamily:F_BODY,marginBottom:5}}>
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

  // Se puede volver a pedir: sin esto el saldo quedaba congelado
  // desde que abría la app, y después de apostar seguía mostrando
  // el número viejo hasta recargar la página.
  const refrescar=useCallback(()=>{
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData || "";
    if(!initData){
      setUser({cargando:false, autenticado:false});
      return Promise.resolve();
    }
    return fetch(`${API}/api/me`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({init_data:initData}),
    })
      .then(r=>r.ok?r.json():null)
      .then(d=>setUser({cargando:false, ...(d||{autenticado:false})}))
      .catch(()=>setUser({cargando:false, autenticado:false}));
  },[]);

  useEffect(()=>{ refrescar(); },[refrescar]);

  // Al volver a la app desde otra pantalla del teléfono, el saldo
  // pudo cambiar: cargas del cajero, premios, otro dispositivo.
  useEffect(()=>{
    const alVolver=()=>{ if(!document.hidden) refrescar(); };
    document.addEventListener("visibilitychange",alVolver);
    return()=>document.removeEventListener("visibilitychange",alVolver);
  },[refrescar]);

  return {...user, refrescar};
}

// Bloque para funciones que todavía no tienen respaldo en el servidor
function SinBackend({ titulo, detalle }){
  return(
    <GCard style={{padding:"24px 20px",textAlign:"center",margin:"12px 0"}}>
      <div style={{marginBottom:10}}><Construction size={30} color={Q.muted}/></div>
      <div style={{color:Q.text,fontWeight:700,fontSize:14,
        fontFamily:F_BODY,marginBottom:6}}>{titulo}</div>
      <div style={{color:Q.muted,fontSize:12,lineHeight:1.5,
        fontFamily:F_BODY}}>{detalle}</div>
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
        padding:"20px 16px 32px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
            <TeamLogo name={home} size={24}/>
            <span style={{color:Q.text,fontWeight:700,fontSize:14,
              fontFamily:F_BODY}}>{home} vs {away}</span>
            <TeamLogo name={away} size={24}/>
          </div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {stats&&stats.marcador&&stats.marcador.home!=null&&(
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{color:Q.gold,fontWeight:900,fontSize:32,
              fontFamily:F_BODY}}>
              {stats.marcador.home} - {stats.marcador.away}</div>
            <div style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>
              {stats.estado==="live"?<><Icon name="circle-dot" size={11}/> En vivo</>:stats.estado==="closed"?"Finalizado":stats.estado}</div>
          </div>
        )}

        <div style={{display:"flex",gap:SPACING[8],marginBottom:14}}>
          {[["stats",<><Icon name="chart-no-axes-combined" size={13}/> Estadísticas</>],["previa",<><Calendar size={13}/> Historial</>]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,
              background:tab===k?`${Q.violet}33`:ov(0.04),
              border:`1px solid ${tab===k?Q.violet:Q.border}`,borderRadius:RADII.md,
              padding:"8px",cursor:"pointer",color:tab===k?Q.cyan:Q.muted,
              fontSize:12,fontWeight:700,fontFamily:F_BODY}}>{l}</button>
          ))}
        </div>

        {tab==="stats"&&(
          <div>
            {!stats&&<div style={{color:Q.muted,textAlign:"center",padding:SPACING[20],
              fontFamily:F_BODY}}>Cargando...</div>}
            {stats&&(!stats.disponible||!stats.tiene_stats)&&(
              <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:SPACING[24],
                fontFamily:F_BODY}}>
                <Icon name="chart-no-axes-combined" size={13}/> No hay estadísticas detalladas disponibles para este partido.
                {stats.disponible===false&&" El partido no se encontró en el proveedor."}</div>
            )}
            {stats&&stats.tiene_stats&&Array.isArray(stats.stats)&&stats.stats.map((s,i)=>{
              const tot=(s.home||0)+(s.away||0)||1;
              const ph=Math.round((s.home/tot)*100);
              return(
                <div key={i} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{color:Q.text,fontSize:13,fontWeight:700,
                      fontFamily:F_BODY}}>{s.home}{s.unidad}</span>
                    <span style={{color:Q.muted,fontSize:12,
                      fontFamily:F_BODY}}>{s.label}</span>
                    <span style={{color:Q.text,fontSize:13,fontWeight:700,
                      fontFamily:F_BODY}}>{s.away}{s.unidad}</span>
                  </div>
                  <div style={{display:"flex",height:6,borderRadius:RADII.sm,overflow:"hidden",
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
            {!previa&&<div style={{color:Q.muted,textAlign:"center",padding:SPACING[20],
              fontFamily:F_BODY}}>Cargando...</div>}
            {previa&&(!previa.disponible||(previa.head_to_head||[]).length===0)&&(
              <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:SPACING[24],
                fontFamily:F_BODY}}>
                <Calendar size={13}/> No hay historial disponible para este partido.</div>
            )}
            {previa&&Array.isArray(previa.head_to_head)&&previa.head_to_head.length>0&&(
              <div>
                <div style={{color:Q.muted,fontSize:12,marginBottom:8,textTransform:"uppercase",
                  letterSpacing:1,fontFamily:F_BODY}}>Últimos enfrentamientos</div>
                {previa.head_to_head.map((h,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",
                    padding:"8px 0",borderBottom:`1px solid ${Q.border}`}}>
                    <span style={{color:Q.text,fontSize:12,flex:1,
                      fontFamily:F_BODY}}>{h.home}</span>
                    <span style={{color:Q.gold,fontSize:12,fontWeight:700,margin:"0 10px",
                      fontFamily:F_BODY}}>{h.marcador}</span>
                    <span style={{color:Q.text,fontSize:12,flex:1,textAlign:"right",
                      fontFamily:F_BODY}}>{h.away}</span>
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
        background:ov(0.04),border:`1px solid ${Q.cyan}44`,borderRadius:RADII.md,
        padding:"8px",cursor:"pointer",color:Q.cyan,fontSize:12,fontWeight:700,
        fontFamily:F_BODY}}><Icon name="chart-no-axes-combined" size={10}/> Estadísticas y análisis</button>
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
      <div style={{color:Q.dim,fontSize:12,padding:"12px 0",textAlign:"center",
        fontFamily:F_BODY}}>
        {aviso||"Sin mercados disponibles"}
      </div>
    );

  return(
    <div style={{marginTop:8,paddingTop:SPACING[8],borderTop:`1px solid ${Q.dim}`}}>
      {claves.map(k=>{
        const resultados = Object.entries(todos[k]);
        // Los mercados de jugador traen decenas de nombres: scroll propio
        const muchos = resultados.length > 6;
        return(
          <div key={k} style={{marginBottom:10}}>
            <div style={{color:Q.muted,fontSize:12,textTransform:"uppercase",
              letterSpacing:1,fontFamily:F_BODY,
              marginBottom:5,display:"flex",justifyContent:"space-between"}}>
              <span>{tituloMercado(k)}</span>
              {muchos&&<span style={{color:Q.dim}}>{resultados.length} opciones</span>}
            </div>
            <div style={{
              display:"grid",
              gridTemplateColumns: resultados.length<=3?`repeat(${resultados.length},1fr)`:"1fr 1fr",
              gap:SPACING[4],
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
                      borderRadius:RADII.md,padding:"8px 8px",cursor:"pointer",
                      display:"flex",alignItems:"center",
                      justifyContent:"space-between",gap:SPACING[8],minWidth:0,
                    }}>
                    <span style={{color:Q.muted,fontSize:12,
                      fontFamily:F_BODY,
                      overflow:"hidden",textOverflow:"ellipsis",
                      whiteSpace:"nowrap",flex:1,textAlign:"left"}}>{etiqueta}</span>
                    <span style={{color:sel?color:Q.text,fontWeight:700,fontSize:12,
                      fontFamily:F_BODY,flexShrink:0}}>
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
        <div style={{color:Q.dim,fontSize:12,textAlign:"center",padding:"8px 0",
          fontFamily:F_BODY}}>
          Buscando córners, tarjetas y goleadores...
        </div>
      )}
    </div>
  );
}

// ── BETSLIP FLOTANTE ───────────────────────────────────────────
function FloatingBetslip({ bets, onBet, onClear, onLocal, color=Q.violet,
                          live=false, moneda="ARS" }){
  const [monto,setMonto]=useState(montoInicial(moneda));
  // Potencializador: se muestra al armar para que el cliente vea qué
  // gana si suma otra selección. El extra se paga solo si acierta todas.
  const [boost,setBoost]=useState(null);
  useEffect(()=>{
    fetch(`${API}/api/boost`).then(r=>r.ok?r.json():null)
      .then(d=>{ if(d?.activo) setBoost(d); }).catch(()=>{});
  },[]);

  const boostInfo=(()=>{
    if(!boost?.tabla?.length) return null;
    const cuentan=bets.filter(b=>Number(b.odd||0)>=boost.cuota_min_pick).length;
    let pct=0, siguiente=null;
    for(const t of boost.tabla){
      if(cuentan>=t.picks) pct=t.pct;
      else if(siguiente===null) siguiente=t;
    }
    return {pct, cuentan, siguiente};
  })();
  const [genCodigo,setGenCodigo]=useState(false);
  const tot=bets.length?prod(bets.map(b=>b.odd)):1;
  if(!bets.length) return null;
  return(
    <div style={{position:"fixed",left:"50%",transform:"translateX(-50%)",
      bottom:"max(10px, env(safe-area-inset-bottom))",
      width:"calc(100% - 24px)",maxWidth:496,zIndex:40}}>
      <GCard glow={color} style={{padding:"12px 16px",background:"rgba(6,6,18,0.97)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
            {live&&<LiveDot/>}
            <span style={{color:Q.muted,fontSize:12}}>{bets.length} picks · <span style={{color,fontWeight:700}}>{fmt(tot)}x</span></span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
            <span style={{color:Q.green,fontWeight:700,fontSize:12,fontFamily:F_BODY}}>
              {ars(Math.round(monto*tot*(1+(boostInfo?.pct||0)/100)))}
              {boostInfo?.pct>0&&(
                <span style={{color:Q.gold,fontSize:12,marginLeft:3}}>
                  +{boostInfo.pct}%</span>
              )}
            </span>
            <button onClick={onClear} style={{background:"transparent",border:"none",
              color:Q.dim,cursor:"pointer",fontSize:16,padding:0}}>✕</button>
          </div>
        </div>
        {/* El incentivo: cuánto falta para el próximo escalón. Es lo
            que convierte "combinar es más riesgo" en "combinar paga". */}
        {boostInfo?.siguiente&&(
          <div style={{background:`${Q.gold}14`,border:`1px solid ${Q.gold}44`,
            borderRadius:RADII.md,padding:"8px 8px",marginBottom:8,fontSize:12,
            color:Q.gold,fontFamily:F_BODY}}>
            <Rocket size={13}/> Sumá {boostInfo.siguiente.picks-boostInfo.cuentan}{" "}
            {boostInfo.siguiente.picks-boostInfo.cuentan===1?"selección":"selecciones"}
            {" "}y ganás {boostInfo.siguiente.pct}% extra
          </div>
        )}
        {boostInfo?.pct>0&&!boostInfo?.siguiente&&(
          <div style={{background:`${Q.gold}14`,border:`1px solid ${Q.gold}44`,
            borderRadius:RADII.md,padding:"8px 8px",marginBottom:8,fontSize:12,
            color:Q.gold,fontFamily:F_BODY}}>
            <Rocket size={13}/> Potencializador +{boostInfo.pct}% · se paga si acertás todas
          </div>
        )}

        <div style={{display:"flex",gap:SPACING[4],marginBottom:8}}>
          {montosDe(moneda).map(v=>(
            <button key={v} onClick={()=>setMonto(v)} style={{
              flex:1,background:monto===v?`${color}33`:ov(0.04),
              border:`1px solid ${monto===v?color:Q.border}`,
              borderRadius:RADII.md,padding:"4px 4px",cursor:"pointer",
              color:monto===v?color:Q.muted,fontSize:12,fontWeight:monto===v?700:400,
              fontFamily:F_BODY,
            }}>{v>=1000?`$${v/1000}K`:`$${v}`}</button>
          ))}
        </div>
        {/* Campo libre: las fichas rápidas son atajos, no un límite */}
        <div style={{display:"flex",alignItems:"center",gap:SPACING[8],marginBottom:8}}>
          <span style={{color:Q.dim,fontSize:12,flexShrink:0}}>Otro:</span>
          <input type="number" inputMode="numeric" min="0" value={monto}
            onChange={e=>setMonto(Math.max(0,Number(e.target.value)||0))}
            aria-label="Monto a apostar"
            style={{flex:1,minWidth:0,background:ov(0.05),
              border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"8px 8px",
              color:Q.text,fontSize:13,fontWeight:700,
              fontFamily:F_BODY}}/>
        </div>
        <div style={{display:"flex",gap:SPACING[8]}}>
          <QBtn label={`APOSTAR ${ars(monto)}`} full color={color} size="lg"
            onClick={()=>onBet(bets,monto,tot)}/>
          <button disabled={genCodigo} onClick={async()=>{
            setGenCodigo(true);
            await onLocal(bets);
            setGenCodigo(false);
          }} style={{
            background:ov(0.04),border:`1px solid ${Q.border}`,
            borderRadius:RADII.lg,padding:"0 12px",cursor:genCodigo?"wait":"pointer",color:Q.muted,
            fontSize:12,fontFamily:F_BODY,whiteSpace:"nowrap",
          }}>{genCodigo?"...":<><Store size={12}/> Local</>}</button>
        </div>
      </GCard>
    </div>
  );
}

// ── POOLS & P2P DATA ───────────────────────────────────────────



// ═══════════════════════════════════════════════════════════════
// PANTALLA 3 — PREMATCH (datos reales + mercados expandidos)
// ═══════════════════════════════════════════════════════════════
function ScreenPrematch({ onAction, onBet, onLocal, moneda, betsIniciales,
                          onTomadas }){
  const [bets,setBets]=useState(betsIniciales||[]);
  // Avisa que ya usó las selecciones, para que no reaparezcan la
  // próxima vez que el cliente entre a Deportes.
  useEffect(()=>{ if(betsIniciales?.length&&onTomadas) onTomadas();
    // eslint-disable-next-line
  },[]);
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
      <div style={{position:"relative",zIndex:1,padding:"16px 12px 40px"}}>
        <UserMsg time="9:50"><Icon name="clipboard-list" size={13}/> Prematch</UserMsg>
        <BotMsg time="9:50">
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:10,fontFamily:F_BODY}}>
            <Icon name="clipboard-list" size={13}/> Apuestas Prematch — Cuotas reales
          </div>

          {/* Buscador de equipo */}
          {sports.length>0&&(
            <div style={{display:"flex",alignItems:"center",gap:SPACING[8],
              background:ov(0.05),border:`1px solid ${Q.border}`,
              borderRadius:RADII.md,padding:"8px 12px",marginBottom:8}}>
              <Icon name="search" size={14} color={Q.muted}/>
              <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
                placeholder="Buscar equipo..."
                style={{background:"transparent",border:"none",color:Q.text,
                  fontSize:14,flex:1,minWidth:0,
                  fontFamily:F_BODY}}/>
              {busqueda&&(
                <button onClick={()=>setBusqueda("")} style={{background:"transparent",
                  border:"none",color:Q.muted,fontSize:16,cursor:"pointer",
                  padding:0,lineHeight:1}}>✕</button>
              )}
            </div>
          )}

          {/* Sport filter */}
          <div style={{display:"flex",gap:SPACING[4],overflowX:"auto",marginBottom:12,
            paddingBottom:SPACING[4],WebkitOverflowScrolling:"touch"}}>
            <button onClick={()=>setSport(null)} style={{
              background:!sport?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
              border:`1px solid ${!sport?Q.cyan:Q.border}`,borderRadius:RADII.xl,
              padding:"4px 12px",cursor:"pointer",color:!sport?Q.cyan:Q.muted,
              fontSize:12,fontWeight:!sport?700:400,fontFamily:F_BODY,
              whiteSpace:"nowrap",flexShrink:0,
            }}>Todos</button>
            {displaySports.map(s=>(
              <button key={s.name} onClick={()=>setSport(s.name)} style={{
                background:sport===s.name?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
                border:`1px solid ${sport===s.name?Q.cyan:Q.border}`,borderRadius:RADII.xl,
                padding:"4px 12px",cursor:"pointer",color:sport===s.name?Q.cyan:Q.muted,
                fontSize:12,fontWeight:sport===s.name?700:400,fontFamily:F_BODY,
                whiteSpace:"nowrap",flexShrink:0,
              }}>{s.icon} {s.name}</button>
            ))}
          </div>

          {loading&&<div style={{textAlign:"center",color:Q.muted,padding:SPACING[20],fontFamily:F_BODY}}>
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
              <div style={{display:"flex",alignItems:"center",gap:SPACING[8],marginBottom:8}}>
                <span style={{fontSize:16}}>{s.icon}</span>
                <span style={{color:Q.violet2,fontWeight:700,fontSize:12,fontFamily:F_BODY}}>{s.name}</span>
              </div>
              {(s.events||[]).map(ev=>(
                <GCard key={ev.id} style={{padding:"12px 16px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}
                    onClick={()=>toggleExpand(ev.id)}>
                    <div style={{display:"flex",alignItems:"center",gap:SPACING[8],
                      flex:1,minWidth:0}}>
                      <TeamLogo name={ev.h} size={26}/>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{color:Q.text,fontWeight:700,fontSize:13,
                          fontFamily:F_BODY,
                          overflow:"hidden",textOverflow:"ellipsis",
                          whiteSpace:"nowrap"}}>
                          {ev.h} <span style={{color:Q.dim}}>vs</span> {ev.a}
                        </div>
                        <div style={{color:Q.muted,fontSize:12,marginTop:2}}>{horaLocal(ev)}</div>
                      </div>
                      <TeamLogo name={ev.a} size={26}/>
                    </div>
                    <span style={{color:Q.muted,fontSize:18}}>{expandedEvents[ev.id]?"▲":"▼"}</span>
                  </div>

                  {/* Cuotas 1X2 rápidas */}
                  <OddsButtons ev={ev} market="h2h" bets={bets} onToggle={toggle}/>

                  <button onClick={()=>toggleExpand(ev.id)} style={{
                    width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                    borderRadius:RADII.md,padding:"4px",cursor:"pointer",color:Q.dim,
                    fontSize:12,marginTop:6,fontFamily:F_BODY,
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
              <div style={{display:"flex",alignItems:"center",gap:SPACING[8],marginBottom:10}}>
                <Icon name="trophy" size={16}/>
                <span style={{color:Q.cyan,fontWeight:700,fontSize:13,
                  fontFamily:F_BODY}}>Sportradar · {srPartidos.length} partidos</span>
                <span style={{background:`${Q.cyan}22`,border:`1px solid ${Q.cyan}55`,
                  borderRadius:RADII.sm,padding:"4px 8px",fontSize:12,color:Q.cyan,
                  fontFamily:F_BODY}}>NUEVO</span>
              </div>
              {srPartidos
                .filter(p=>!busqueda||`${p.home} ${p.away}`.toLowerCase().includes(busqueda.toLowerCase()))
                .map((p,i)=>(
                <GCard key={`sr-${i}`} style={{padding:SPACING[12],marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
                      <TeamLogo name={p.home} size={20}/>
                      <span style={{color:Q.text,fontSize:12,fontWeight:600,
                        fontFamily:F_BODY}}>{p.home}</span>
                    </div>
                    <span style={{color:Q.dim,fontSize:12}}>vs</span>
                    <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
                      <span style={{color:Q.text,fontSize:12,fontWeight:600,
                        fontFamily:F_BODY}}>{p.away}</span>
                      <TeamLogo name={p.away} size={20}/>
                    </div>
                  </div>
                  {p.pais&&<div style={{color:Q.dim,fontSize:12,marginBottom:6,
                    fontFamily:F_BODY}}>{p.pais}</div>}
                  <div style={{display:"flex",gap:SPACING[4]}}>
                    {[["home",p.home_odd,"L"],["draw",p.draw_odd,"E"],["away",p.away_odd,"V"]].map(([tipo,odd,lbl])=>(
                      odd?<button key={tipo}
                        onClick={()=>toggle({id:p.id,h:p.home,a:p.away,
                          event_id:p.event_id,sport_key:p.sport_key,commence_time:p.commence_time},
                          lbl==="L"?p.home:lbl==="E"?"Empate":p.away, odd)}
                        style={{flex:1,background:bets.find(b=>b.id===p.id&&b.label===(lbl==="L"?p.home:lbl==="E"?"Empate":p.away))
                          ?`${Q.cyan}33`:ov(0.05),
                        border:`1px solid ${bets.find(b=>b.id===p.id&&b.label===(lbl==="L"?p.home:lbl==="E"?"Empate":p.away))?Q.cyan:Q.border}`,
                        borderRadius:RADII.md,padding:"8px 4px",cursor:"pointer",
                        display:"flex",flexDirection:"column",alignItems:"center",gap:SPACING[4]}}>
                        <span style={{color:Q.dim,fontSize:12,
                          fontFamily:F_BODY}}>{lbl}</span>
                        <span style={{color:Q.text,fontSize:13,fontWeight:700,
                          fontFamily:F_BODY}}>{odd}</span>
                      </button>:null
                    ))}
                  </div>
                  {p.mercados&&p.mercados.filter(m=>m.market!=="1x2").length>0&&(
                    <>
                      <button onClick={()=>setSrExpand(e=>({...e,[p.id]:!e[p.id]}))}
                        style={{width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                        borderRadius:RADII.md,padding:"4px",cursor:"pointer",color:Q.dim,fontSize:12,
                        marginTop:6,fontFamily:F_BODY}}>
                        {srExpand[p.id]?"▲ Menos mercados":`▼ Más mercados (${p.mercados.filter(m=>m.market!=="1x2").length})`}
                      </button>
                      {srExpand[p.id]&&(
                        <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:SPACING[4]}}>
                          {p.mercados.filter(m=>m.market!=="1x2").map((m,mi)=>(
                            <button key={mi}
                              onClick={()=>toggle({id:p.id,h:p.home,a:p.away,
                                event_id:p.event_id,sport_key:p.sport_key,commence_time:p.commence_time},m.label,m.odd)}
                              style={{background:bets.find(b=>b.id===p.id&&b.label===m.label)
                                ?`${Q.cyan}33`:ov(0.05),
                              border:`1px solid ${bets.find(b=>b.id===p.id&&b.label===m.label)?Q.cyan:Q.border}`,
                              borderRadius:RADII.md,padding:"8px 12px",cursor:"pointer",
                              display:"flex",alignItems:"center",gap:SPACING[8]}}>
                              <span style={{color:Q.muted,fontSize:12,
                                fontFamily:F_BODY}}>{m.label}</span>
                              <span style={{color:Q.text,fontSize:12,fontWeight:700,
                                fontFamily:F_BODY}}>{m.odd}</span>
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
          <QKB rows={[[{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"},{icon:<Zap size={14}/>,label:"AI Combo",action:"combo"}]]} onPress={onAction}/>
        </BotMsg>
      </div>

      <FloatingBetslip bets={bets} onBet={onBet} onClear={()=>setBets([])}
        onLocal={onLocal} color={Q.violet} moneda={moneda}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 4 — EN VIVO (datos reales + mercados)
// ═══════════════════════════════════════════════════════════════
function ScreenLive({ onAction, onBet, onLocal, moneda, betsIniciales,
                     onTomadas }){
  const [bets,setBets]=useState(betsIniciales||[]);
  useEffect(()=>{ if(betsIniciales?.length&&onTomadas) onTomadas();
    // eslint-disable-next-line
  },[]);
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
      <div style={{position:"relative",zIndex:1,padding:"16px 12px 40px"}}>
        <UserMsg time="9:55"><Icon name="circle-dot" size={13}/> En Vivo</UserMsg>
        <BotMsg time="9:55">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
              <LiveDot/>
              <span style={{color:Q.text,fontWeight:700,fontSize:14,fontFamily:F_BODY}}>
                {loading?"Cargando...":`${matches.length} partidos en vivo`}
              </span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
              {lastUpdate&&<span style={{color:Q.dim,fontSize:12}}>{lastUpdate}</span>}
              <button onClick={fetchLive} style={{background:"transparent",border:`1px solid ${Q.border}`,
                borderRadius:RADII.md,padding:"4px 8px",cursor:"pointer",color:Q.muted,fontSize:12}}>↻ Actualizar</button>
            </div>
          </div>

          {loading&&<div style={{textAlign:"center",color:Q.muted,padding:SPACING[20],fontFamily:F_BODY}}>Cargando...</div>}

          {!loading&&matches.length===0&&(
            <div style={{textAlign:"center",padding:SPACING[24]}}>
              <div style={{marginBottom:8}}><Icon name="trophy" size={32}/></div>
              <div style={{color:Q.muted,fontSize:13,fontFamily:F_BODY}}>No hay partidos en vivo ahora</div>
            </div>
          )}

          {matches.map(ev=>(
            <GCard key={ev.id} glow={Q.pink} style={{padding:"16px",marginBottom:10,
              background:`linear-gradient(135deg,${Q.pink}08,${Q.violet}05)`}}>
              {/* Header con score */}
              <div style={{display:"flex",alignItems:"center",gap:SPACING[8],marginBottom:10}}>
                <LiveDot/>
                {ev.minute&&<span style={{color:Q.muted,fontSize:12}}>{ev.minute}</span>}
                {ev.minuteLong&&<span style={{color:Q.dim,fontSize:12}}>{ev.minuteLong}</span>}
              </div>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}
                onClick={()=>toggleExpand(ev.id)}>
                <div style={{textAlign:"center",flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
                    <TeamLogo name={ev.home} size={36}/>
                  </div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:F_BODY,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.home}</div>
                </div>
                <div style={{textAlign:"center",padding:"0 12px"}}>
                  <div style={{fontFamily:F_BODY,fontWeight:900,fontSize:30,color:Q.pink}}>
                    {ev.homeScore}<span style={{color:Q.dim}}>:</span>{ev.awayScore}
                  </div>
                  <div style={{color:Q.pink,fontSize:12,fontFamily:F_BODY,letterSpacing:1}}>EN CURSO</div>
                </div>
                <div style={{textAlign:"center",flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
                    <TeamLogo name={ev.away} size={36}/>
                  </div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:F_BODY,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.away}</div>
                </div>
              </div>

              {ev.hasOdds?(
                <>
                  {/* Cuotas 1X2 */}
                  <div style={{display:"flex",gap:SPACING[4]}}>
                    {[{label:ev.home,val:ev.odds.L,c:Q.amber},
                      ev.odds.E?{label:"Empate",val:ev.odds.E,c:Q.muted}:null,
                      {label:ev.away,val:ev.odds.V,c:Q.cyan}]
                      .filter(Boolean).filter(o=>o.val).map((o,i)=>(
                      <button key={i} onClick={()=>toggle(ev,o.label,o.val)} style={{
                        flex:"1 1 0",minWidth:0,overflow:"hidden",
                        background:bets.some(b=>b.id===ev.id&&b.label===o.label)?`linear-gradient(135deg,${Q.pink}44,${Q.violet}22)`:ov(0.04),
                        border:`1.5px solid ${bets.some(b=>b.id===ev.id&&b.label===o.label)?Q.pink:Q.border}`,
                        borderRadius:RADII.md,padding:"8px 4px",cursor:"pointer",textAlign:"center",transition:"all 0.2s",
                      }}>
                        <div style={{color:Q.muted,fontSize:12,
                          fontFamily:F_BODY,overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.label}</div>
                        <div style={{color:bets.some(b=>b.id===ev.id&&b.label===o.label)?Q.pink:o.c,
                          fontWeight:700,fontSize:15,fontFamily:F_BODY}}>{fmt(o.val)}</div>
                        <div style={{color:Q.pink,fontSize:12}}>◉ LIVE</div>
                      </button>
                    ))}
                  </div>
                  {/* Expandir para más mercados */}
                  <button onClick={()=>toggleExpand(ev.id)} style={{
                    width:"100%",background:"transparent",border:`1px solid ${Q.dim}`,
                    borderRadius:RADII.md,padding:"4px",cursor:"pointer",color:Q.dim,
                    fontSize:12,marginTop:6,fontFamily:F_BODY,
                  }}>
                    {expandedEvents[ev.id]?"▲ Menos mercados":"▼ Todos los mercados"}
                  </button>
                  {expandedEvents[ev.id]&&(
                    <MercadosEvento ev={ev} bets={bets} onToggle={toggle} color={Q.pink}/>
                  )}
                </>
              ):(
                <div style={{textAlign:"center",color:Q.dim,fontSize:12,padding:"8px 0",
                  fontFamily:F_BODY}}>Cuotas en vivo no disponibles</div>
              )}
            </GCard>
          ))}

          <QKB rows={[[{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"},{icon:<Icon name="clipboard-list" size={14}/>,label:"Prematch",action:"prematch"}]]} onPress={onAction}/>
        </BotMsg>
      </div>

      <FloatingBetslip bets={bets} onBet={onBet} onClear={()=>setBets([])}
        onLocal={onLocal} color={Q.pink} live moneda={moneda}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 5 — POOL
// ═══════════════════════════════════════════════════════════════
function ScreenPool({ onAction }){
  return(
    <div style={{background:Q.void,minHeight:"100%",padding:"16px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:F_BODY}}><Target size={13}/> Pools</div>
        <SinBackend titulo="Todavía no está disponible"
          detalle={"Los pozos compartidos necesitan que el servidor lleve la "+
                   "cuenta de quién entra y con cuánto. Eso todavía no existe, "+
                   "así que la pantalla anterior mostraba montos y jugadores "+
                   "inventados."}/>
        <QKB rows={[[{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"}]]} onPress={onAction}/>
      </BotMsg>
    </div>
  );
}

function ScreenP2P({ onAction }){
  return(
    <div style={{background:Q.void,minHeight:"100%",padding:"16px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:F_BODY}}><Handshake size={13}/> Apuestas P2P</div>
        <SinBackend titulo="Todavía no está disponible"
          detalle={"Apostar contra otro usuario requiere emparejar ofertas y "+
                   "retener el dinero de las dos partes. Las ofertas que se "+
                   "veían antes eran de ejemplo."}/>
        <QKB rows={[[{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"}]]} onPress={onAction}/>
      </BotMsg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 7 — AI COMBO
// ═══════════════════════════════════════════════════════════════
// Genera una combinada al momento según el perfil que elija el
// cliente. Sale de los eventos reales del día, con azar dentro de
// unos rangos, así que cada una es distinta.
function GenerarCombo({ moneda, onUsar, userId }){
  const [perfil,setPerfil]=useState(null);
  const [combo,setCombo]=useState(null);
  const [proc,setProc]=useState(false);
  const [err,setErr]=useState("");
  const [cupo,setCupo]=useState(null);

  useEffect(()=>{
    if(!userId) return;
    fetch(`${API}/api/combo-sugerido/cupo?user_id=${userId}`)
      .then(r=>r.ok?r.json():null).then(d=>d&&setCupo(d)).catch(()=>{});
  },[userId]);

  const generar=async(p)=>{
    setProc(true); setErr(""); setPerfil(p);
    try{
      // Primero se descuenta el cupo: si no queda, no se genera
      if(userId){
        const ru=await fetch(`${API}/api/combo-sugerido/usar`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({user_id:userId})});
        const du=await ru.json().catch(()=>({}));
        if(!ru.ok) throw new Error(du.detail||"Sin cupo");
      }
      const r=await fetch(`${API}/api/combo-sugerido?perfil=${p}`);
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||`Error ${r.status}`);
      setCombo(d);
      if(userId) setCupo(c=>c?{...c,quedan:Math.max(0,c.quedan-1)}:c);
    }catch(e){ setErr(e.message); }
    setProc(false);
  };

  const PERFILES=[
    ["seguro",<><Shield size={13}/> Seguro</>,"Cuotas bajas, más chances"],
    ["equilibrado",<><Scale size={13}/> Equilibrado</>,"El punto medio"],
    ["arriesgado",<><Rocket size={13}/> Arriesgado</>,"Pocas chances, premio grande"],
  ];

  return(
    <GCard style={{padding:SPACING[16],marginBottom:12}}>
      <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:3,
        fontFamily:F_BODY}}><Dices size={13}/> Armá tu combinada</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:10,
        lineHeight:1.5}}>
        Elegí el estilo y el sistema te arma una con partidos de hoy.
        {cupo&&` Te quedan ${cupo.quedan} de ${cupo.tope} hoy.`}</div>

      {(!cupo||cupo.quedan>0)&&(
        <div style={{display:"flex",gap:SPACING[8],marginBottom:10}}>
          {PERFILES.map(([k,l,d])=>(
            <button key={k} onClick={()=>generar(k)} disabled={proc}
              style={{flex:1,background:perfil===k?`${Q.violet}33`:ov(0.04),
                border:`1px solid ${perfil===k?Q.violet:Q.border}`,
                borderRadius:RADII.md,padding:"8px 4px",cursor:"pointer",
                color:perfil===k?Q.cyan:Q.muted,fontSize:12,
                fontWeight:perfil===k?700:400,lineHeight:1.3,
                fontFamily:F_BODY}}>
              {l}<br/><span style={{fontSize:12,color:Q.dim}}>{d}</span>
            </button>
          ))}
        </div>
      )}

      {cupo&&cupo.quedan<=0&&(
        <div style={{color:Q.amber,fontSize:12,textAlign:"center",
          padding:"8px 0",lineHeight:1.5}}>
          Ya generaste {cupo.tope} combinadas hoy. Volvé mañana.</div>
      )}

      {proc&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
        padding:"8px 0"}}>Armando…</div>}

      {err&&<div style={{color:Q.red,fontSize:12,textAlign:"center",
        padding:"8px 0"}}>{err}</div>}

      {combo&&!proc&&(
        <div style={{marginTop:4}}>
          <div style={{color:Q.gold,fontWeight:700,fontSize:12.5,
            marginBottom:7,fontFamily:F_BODY}}>
            {combo.nombre}</div>
          {combo.picks.map((p,i)=>(
            <div key={i} style={{display:"flex",
              justifyContent:"space-between",alignItems:"baseline",gap:SPACING[8],
              padding:"4px 0",borderTop:`1px solid ${Q.border}`}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.dim,fontSize:12}}>
                  {p.h} — {p.a}</div>
                <div style={{color:Q.text,fontSize:12,fontWeight:600}}>
                  {p.sel}</div>
              </div>
              <span style={{color:Q.gold,fontSize:12.5,flexShrink:0,
                fontFamily:F_BODY}}>{p.odd.toFixed(2)}</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"baseline",paddingTop:SPACING[8],marginTop:4,
            borderTop:`1px solid ${Q.border}`}}>
            <span style={{color:Q.muted,fontSize:12}}>Cuota total</span>
            <span style={{color:Q.gold,fontWeight:900,fontSize:19,
              fontFamily:F_BODY}}>
              {combo.odd_total.toFixed(2)}x</span>
          </div>
          <button onClick={()=>onUsar&&onUsar(combo.picks)} style={{
            width:"100%",marginTop:10,
            background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
            border:"none",borderRadius:RADII.md,padding:"12px",color:inkOn(Q.violet, Q.violet2),
            fontSize:13.5,fontWeight:700,cursor:"pointer",
            fontFamily:F_BODY}}>
            Cargar al boleto</button>
        </div>
      )}
    </GCard>
  );
}

// Un pick de un combo (de la casa o IA), en la forma que confirmBet
// espera: la misma que arma GenerarCombo un poco más arriba. Antes esto
// se armaba en el propio onClick de "Apostar" y perdía event_id,
// sport_key, market y commence_time; peor, ponía el nombre del equipo
// local como id. La liquidación automática matchea por ese id, así que
// una combinada apostada así terminaba con un nombre de equipo donde
// va un event_id.
export function picksDeCombo(picks){
  return (picks||[]).map(p=>({
    id: p.event_id || "",
    label: p.sel || p.label || "",
    odd: p.odd,
    h: p.h || p.home || "",
    a: p.a || p.away || "",
    event_id: p.event_id || "",
    sport_key: p.sport_key || "",
    market: p.market || "",
    commence_time: p.commence_time || "",
  }));
}

function ScreenCombo({ onAction, onBet, refCode, onEditar, moneda, userId }){
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
  const [stake,setStake]=useState(montoInicial(moneda));

  // Mientras carga: mostrar spinner (NO intentar renderizar el combo aún)
  if(loading) return(
    <div style={{background:Q.void,minHeight:"100%",padding:"40px 12px",textAlign:"center"}}>
      <div style={{color:Q.muted,fontSize:14,fontFamily:F_BODY}}>
        Cargando combos IA...</div>
    </div>
  );

  if(!combo) return(
    <div style={{background:Q.void,minHeight:"100%",padding:"16px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:F_BODY}}><Zap size={13}/> AI Combos</div>
        <GCard style={{padding:SPACING[24],textAlign:"center",margin:"12px 0"}}>
          <div style={{marginBottom:8}}><Moon size={30} color={Q.muted}/></div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:F_BODY}}>
            No hay combos disponibles ahora
          </div>
          <div style={{color:Q.dim,fontSize:12,marginTop:4}}>
            Se arman con los partidos del día
          </div>
        </GCard>
        <QKB rows={[[{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"}]]} onPress={onAction}/>
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
      <div style={{position:"relative",zIndex:1,padding:"16px 12px 40px"}}>
        <UserMsg time="10:30"><Zap size={13}/> Combinadas IA</UserMsg>
        <BotMsg time="10:30">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
              <div style={{width:30,height:30,borderRadius:RADII.md,
                background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                display:"flex",alignItems:"center",justifyContent:"center",
                color:inkOn(Q.violet, Q.cyan)}}><Zap size={16}/></div>
              <div>
                <div style={{color:Q.text,fontWeight:700,fontSize:14,fontFamily:F_BODY}}>AI Combos del día</div>
                <div style={{color:Q.muted,fontSize:12}}>{realCombos?"Datos reales":"Generados por IAQP IA"}</div>
              </div>
            </div>
            {loading&&<div style={{color:Q.muted,fontSize:12}}>Cargando...</div>}
            {realCombos&&<HBadge label="REAL" color={Q.green}/>}
            {refCode&&<HBadge label={`via @${refCode}`} color={Q.violet}/>}
          </div>

          {/* Armá tu combinada: el cliente elige el estilo y el
              sistema la arma con partidos de hoy. */}
          <GenerarCombo moneda={moneda} userId={userId}
            onUsar={picks=>{
              const bets=picks.map(p=>({id:p.event_id,label:p.sel,
                odd:p.odd,h:p.h,a:p.a,event_id:p.event_id,
                sel:p.sel,market:"h2h",sport_key:p.sport_key,
                commence_time:p.commence_time}));
              onBet&&onBet(bets, montoInicial(moneda),
                picks.reduce((a,p)=>a*p.odd,1));
            }}/>


          {/* Selector */}
          <div style={{display:"flex",gap:SPACING[4],marginBottom:14}}>
            {combosToShow.map(c=>(
              <button key={c.id} onClick={()=>setSel(c.id)} style={{
                flex:1,
                background:sel===c.id?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
                border:`1px solid ${sel===c.id?Q.cyan:Q.border}`,
                borderRadius:RADII.md,padding:"8px 4px",cursor:"pointer",textAlign:"center",
              }}>
                <div style={{color:sel===c.id?Q.cyan:Q.muted,fontSize:12,fontWeight:700,fontFamily:F_BODY}}>{(c.name||c.nombre||"Combo").replace("AI ","")}</div>
                <div style={{color:Q.gold,fontSize:12,fontWeight:700,fontFamily:F_BODY,marginTop:2}}>
                  {(c.picks||[]).reduce((a,p)=>a*(p.odd||1),1).toFixed(2)}x
                </div>
              </button>
            ))}
          </div>

          {/* Combo */}
          <GCard glow={Q.violet} style={{padding:"16px",marginBottom:12,
            background:`linear-gradient(135deg,${Q.violet}10,${Q.cyan}05)`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <HBadge label={combo.name||combo.nombre||"Combo IA"} color={Q.violet}/>
              {combo.conf&&<HBadge label={`${combo.conf}/10`} color={combo.tagColor||Q.green}/>}
            </div>
            {(combo.picks||[]).map((p,i)=>(
              <GCard key={i} style={{padding:"12px 12px",marginBottom:6,background:"rgba(124,58,237,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1,marginRight:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:SPACING[8],marginBottom:2}}>
                      {p.live&&<><LiveDot/><span style={{color:Q.muted,fontSize:12}}>{p.min?`Min ${p.min}'`:p.set?`Set ${p.set}`:""}</span></>}
                      <HBadge label={p.mkt} color={Q.dim}/>
                    </div>
                    <div style={{color:Q.muted,fontSize:12,marginBottom:1}}>{p.h} vs {p.a}</div>
                    <div style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:F_BODY}}>{p.sel}</div>
                  </div>
                  <div style={{color:Q.cyan,fontWeight:900,fontSize:18,fontFamily:F_BODY}}>{fmt(p.odd)}</div>
                </div>
              </GCard>
            ))}
            <NDiv color={Q.violet}/>
            {combo.note&&<div style={{color:Q.muted,fontSize:12,fontStyle:"italic",marginBottom:10}}><Lightbulb size={12}/> {combo.note}</div>}
            {/* Monto: ANTES de la fila de cuota. Debajo quedaba fuera
                del alto de la tarjeta y no se veía. */}
            <div style={{color:Q.muted,fontSize:12,textTransform:"uppercase",
              letterSpacing:1,marginBottom:4}}>Monto a apostar</div>
            <div style={{display:"flex",gap:SPACING[4],marginBottom:6}}>
              {montosDe(moneda).map(v=>(
                <button key={v} onClick={()=>setStake(v)} style={{
                  flex:1,background:stake===v?`${Q.violet}33`:ov(0.04),
                  border:`1px solid ${stake===v?Q.violet:Q.border}`,
                  borderRadius:RADII.md,padding:"8px 4px",cursor:"pointer",
                  color:stake===v?Q.cyan:Q.muted,fontSize:12,
                  fontWeight:stake===v?700:400,fontFamily:F_BODY,
                }}>{v>=1000?`$${v/1000}K`:`$${v}`}</button>
              ))}
            </div>
            <input type="number" inputMode="numeric" min="0" value={stake}
              onChange={e=>setStake(Math.max(0,Number(e.target.value)||0))}
              aria-label="Monto a apostar"
              style={{width:"100%",background:ov(0.05),
                border:`1px solid ${Q.violet}`,borderRadius:RADII.md,
                padding:"8px 12px",color:Q.text,fontSize:18,fontWeight:700,
                marginBottom:12,fontFamily:F_BODY}}/>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{color:Q.muted,fontSize:12,textTransform:"uppercase",letterSpacing:1}}>Cuota total</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:24,fontFamily:F_BODY}}>{fmt(tot)}x</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:Q.muted,fontSize:12,textTransform:"uppercase",letterSpacing:1}}>Retorno</div>
                <div style={{color:Q.green,fontWeight:900,fontSize:22,fontFamily:F_BODY}}>{ars(Math.round(stake*tot))}</div>
              </div>
            </div>


            {/* Acciones */}
            {!voted[sel]?(
              <div style={{display:"flex",flexDirection:"column",gap:SPACING[8]}}>
                <button onClick={()=>{
                  setVoted(v=>({...v,[sel]:true}));
                  if(refCode){
                    fetch(`${API}/api/influencer/track`,{
                      method:"POST",
                      headers:{"Content-Type":"application/json"},
                      body:JSON.stringify({code:refCode,event:"apuesta_web",amount:stake}),
                    }).catch(()=>{});
                  }
                  onBet(picksDeCombo(combo.picks),stake,tot);
                }} style={{
                  width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                  border:"none",borderRadius:RADII.lg,padding:"16px",
                  color:inkOn(Q.violet, Q.cyan),fontWeight:700,fontSize:15,cursor:"pointer",
                  fontFamily:F_BODY,textTransform:"uppercase",
                  boxShadow:`0 6px 24px ${Q.violet}66`,
                  display:"flex",alignItems:"center",justifyContent:"center",gap:SPACING[8],
                }}><Zap size={13}/> APOSTAR {ars(stake)}</button>

                <button onClick={()=>onEditar&&onEditar(combo.picks||[])} style={{
                  width:"100%",background:ov(0.04),
                  border:`1px solid ${Q.cyan}`,borderRadius:RADII.lg,padding:"12px",marginTop:8,
                  color:Q.cyan,fontWeight:700,fontSize:13,cursor:"pointer",
                  fontFamily:F_BODY}}>
                  <Pencil size={13}/> Editar este combo</button>

                {!codeGenerated[sel]?(
                  <>
                  <button disabled={generando} onClick={()=>genQPCode(combo)} style={{
                    width:"100%",background:ov(0.04),
                    border:`1px solid ${Q.border}`,borderRadius:RADII.lg,padding:"12px",
                    color:Q.muted,fontWeight:600,fontSize:13,
                    cursor:generando?"wait":"pointer",
                    fontFamily:F_BODY,
                  }}>{generando?"Generando...":<><Store size={13}/> Generar código para local</>}</button>
                  {genError&&<div style={{color:Q.red,fontSize:12,marginTop:6,
                    textAlign:"center",fontFamily:F_BODY}}>{genError}</div>}
                  </>
                ):(
                  <GCard glow={Q.green} style={{padding:"12px",textAlign:"center"}}>
                    <div style={{color:Q.muted,fontSize:12,marginBottom:4}}>Código generado</div>
                    <div style={{color:Q.cyan,fontWeight:900,fontSize:20,fontFamily:F_BODY,letterSpacing:2}}>
                      {codeGenerated[sel]}
                    </div>
                    <div style={{color:Q.muted,fontSize:12,marginTop:4}}>Mostralo en el local para apostar en efectivo</div>
                  </GCard>
                )}
              </div>
            ):(
              <GCard glow={Q.green} style={{padding:"12px",textAlign:"center"}}>
                <div style={{color:Q.green,fontWeight:700,fontSize:13,fontFamily:F_BODY}}>
                  ✦ Combo apostado · Ret: {ars(Math.round(stake*tot))}
                </div>
              </GCard>
            )}
          </GCard>

          <QKB rows={[
            [{icon:<Icon name="clipboard-list" size={14}/>,label:"Prematch",action:"prematch"},{icon:<Icon name="circle-dot" size={14}/>,label:"En Vivo",action:"live"}],
            [{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"}],
          ]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 8 — APUESTA CONFIRMADA
// ═══════════════════════════════════════════════════════════════
function ScreenBetConfirmed({ bets, stake, odd, code, onAction, onRepetir, userId }){
  const ret=Math.round(stake*odd);
  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={14} c1={Q.green} c2={Q.violet}/>
      <div style={{position:"relative",zIndex:1,padding:"16px 12px 40px"}}>
        <BotMsg time="10:20">
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{marginBottom:8,filter:`drop-shadow(0 0 16px )`}}><Icon name="spade" size={52} color={Q.green}/></div>
            <div style={{fontFamily:F_BODY,fontWeight:900,fontSize:20,
              color:Q.green,textShadow:`0 0 16px ${Q.green}66`,marginBottom:4}}>¡Apuesta registrada!</div>
          </div>
          <GCard glow={Q.green} style={{padding:"16px",marginBottom:12}}>
            {bets.map((b,i)=>(
              <div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${Q.dim}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:Q.muted,fontSize:12}}>{b.h} vs {b.a}</span>
                  <span style={{color:Q.cyan,fontWeight:700,fontSize:12,fontFamily:F_BODY}}>{fmt(b.odd)}</span>
                </div>
                <div style={{color:Q.text,fontSize:12,fontWeight:600,fontFamily:F_BODY}}>{b.label}</div>
              </div>
            ))}
            <div style={{marginTop:8,paddingTop:SPACING[8],borderTop:`1px solid ${Q.violet}44`}}>
              {[["Apostado",ars(stake),Q.text],
                ["Cuota",fmt(odd)+"x",Q.cyan],["Retorno pot.",ars(ret),Q.green]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                  <span style={{color:Q.muted,fontSize:12}}>{l}</span>
                  <span style={{color:c,fontWeight:700,fontSize:12,fontFamily:F_BODY}}>{v}</span>
                </div>
              ))}
            </div>

            {/* El código sale de la lista de datos y pasa a ser lo más
                visible de la pantalla: es lo único que el cliente tiene
                que llevar al mostrador. */}
            <CodigoReserva code={code}/>
          </GCard>
          <div style={{color:Q.amber,fontSize:12,marginBottom:10,fontFamily:F_BODY}}>
            <Icon name="clock-3" size={13}/> El boleto queda reservado 24 horas. Pagalo en efectivo en la agencia.
          </div>
          {/* Repetir: vuelve a Deportes con las mismas selecciones ya
              cargadas. Sin esto había que buscar cada partido de nuevo
              para apostar lo mismo dos veces. */}
          {/* Compartir la jugada: acá es cuando el cliente está
              contento con lo que armó, que es el momento en que
              realmente la muestra. */}
          {(bets||[]).length>0&&(
            <BotonCompartir picks={bets} odd={odd} code={code}
              userId={userId}/>
          )}

          {onRepetir&&(bets||[]).length>0&&(
            <button onClick={onRepetir} style={{width:"100%",marginBottom:10,
              background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
              border:"none",borderRadius:RADII.md,padding:"12px",color:inkOn(Q.violet, Q.violet2),
              fontSize:14,fontWeight:700,cursor:"pointer",
              fontFamily:F_BODY}}>
              <Repeat size={14}/> Mantener selecciones ({bets.length})</button>
          )}

          <QKB rows={[
            [{icon:<Icon name="circle-dot" size={14}/>,label:"Ver en vivo",action:"live",primary:true,color:Q.pink}],
            [{icon:<Zap size={14}/>,label:"Nuevo combo",action:"combo"},{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"}],
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
    <div style={{marginTop:8,padding:"8px 12px",borderRadius:RADII.md,
      background:`${Q.green}18`,border:`1px solid ${Q.green}`,
      color:Q.green,fontSize:12,fontWeight:700,textAlign:"center",
      fontFamily:F_BODY}}>✓ {msg}</div>
  );

  if(estado==="confirmar") return(
    <div style={{marginTop:8}}>
      <div style={{color:Q.muted,fontSize:12,marginBottom:6,textAlign:"center",
        fontFamily:F_BODY}}>
        Retirás ahora: <span style={{color:Q.gold,fontWeight:800,fontSize:13}}>{money(valor,mon)}</span></div>
      <div style={{display:"flex",gap:SPACING[8]}}>
        <button onClick={ejecutar} disabled={estado==="ejecutando"} style={{flex:1,
          background:`linear-gradient(135deg,${Q.gold},${Q.amber||Q.gold})`,border:"none",
          borderRadius:RADII.md,padding:"12px",color:inkOn(Q.gold, Q.amber||Q.gold),fontWeight:800,fontSize:12,cursor:"pointer",
          fontFamily:F_BODY}}>
          {estado==="ejecutando"?"...":"Confirmar cash out"}</button>
        <button onClick={()=>setEstado("idle")} style={{
          background:"transparent",border:`1px solid ${Q.border}`,borderRadius:RADII.md,
          padding:"12px 16px",color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:F_BODY}}>✕</button>
      </div>
    </div>
  );

  if(estado==="error") return(
    <div style={{marginTop:8}}>
      <div style={{color:Q.red,fontSize:12,textAlign:"center",marginBottom:4,
        fontFamily:F_BODY}}>{msg}</div>
      <button onClick={consultar} style={{width:"100%",background:"transparent",
        border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"8px",color:Q.muted,
        fontSize:12,cursor:"pointer",fontFamily:F_BODY}}>Reintentar</button>
    </div>
  );

  return(
    <button onClick={consultar} disabled={estado==="cargando"} style={{marginTop:8,width:"100%",
      background:`${Q.gold}18`,border:`1px solid ${Q.gold}`,borderRadius:RADII.md,padding:"8px",
      color:Q.gold,fontWeight:700,fontSize:12,cursor:"pointer",
      fontFamily:F_BODY}}>
      {estado==="cargando"?"Calculando...":<><Icon name="wallet-cards" size={12}/> Cash out</>}</button>
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
      <div style={{position:"relative",zIndex:1,padding:"16px 12px 40px"}}>
        <UserMsg time="">Mis apuestas</UserMsg>
        <BotMsg time="">
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,
            fontFamily:F_BODY}}><Icon name="chart-no-axes-combined" size={13}/> Mis apuestas</div>

          {!datos&&(
            <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:SPACING[16],
              fontFamily:F_BODY}}>Cargando...</div>
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
            <GCard style={{padding:SPACING[32],textAlign:"center"}}>
              <div style={{marginBottom:8}}><Icon name="ticket" size={30}/></div>
              <div style={{color:Q.muted,fontSize:13,
                fontFamily:F_BODY}}>
                Todavía no hiciste ninguna apuesta
              </div>
            </GCard>
          )}

          {lista.map((b,i)=>(
            <GCard key={i} glow={colores[b.status]||Q.muted}
              style={{padding:"12px 16px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",marginBottom:6,gap:SPACING[8]}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:Q.text,fontSize:12,fontWeight:600,
                    fontFamily:F_BODY,marginBottom:2,
                    overflow:"hidden",textOverflow:"ellipsis"}}>{b.resumen}</div>
                  <div style={{color:Q.muted,fontSize:12}}>
                    {b.fecha} · {fmt(b.odd_total)}x · {b.picks.length} picks
                  </div>
                </div>
                <HBadge label={rotulos[b.status]||b.status}
                  color={colores[b.status]||Q.muted}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:Q.muted,fontSize:12}}>
                  Apostado: <span style={{color:Q.text,fontWeight:700,
                    fontFamily:F_BODY}}>{ars(b.stake)}</span>
                </span>
                <span style={{fontWeight:700,fontSize:12,
                  fontFamily:F_BODY,
                  color:b.status==="won"?Q.green:b.status==="lost"?Q.red:Q.cyan}}>
                  {b.status==="won"?"+"+ars(b.potential_win)
                   :b.status==="lost"?"-"+ars(b.stake)
                   :"→ "+ars(b.potential_win)}
                </span>
              </div>
              {/* Reservada: el código es lo que el cliente lleva al
                  mostrador, así que va grande y con QR. */}
              {b.status==="pending"&&b.code&&(
                <CodigoReserva code={b.code} vence={b.vence}/>
              )}
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

          <QKB rows={[[{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"}]]} onPress={onAction}/>
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
    <div style={{marginTop:8,paddingTop:SPACING[8],borderTop:`1px solid ${Q.dim}`}}>
      {(pick.home_real||pick.away_real)&&(
        <div style={{color:Q.muted,fontSize:12,marginBottom:6,
          fontFamily:F_BODY}}>
          En nuestro sistema: <span style={{color:Q.cyan}}>{pick.home_real} vs {pick.away_real}</span>
        </div>
      )}
      {/* Candidatos parecidos (cuando no encontró el partido) */}
      {(pick.candidatos&&pick.candidatos.length>0)&&(
        <div style={{marginBottom:10}}>
          <div style={{color:Q.amber,fontSize:12,marginBottom:6,
            fontFamily:F_BODY}}>
            ¿Quisiste decir alguno de estos?
          </div>
          {pick.candidatos.map((ev,ci)=>(
            <div key={ci} style={{background:`${Q.amber}0E`,
              border:`1px solid ${Q.amber}44`,borderRadius:RADII.md,
              padding:"8px 12px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,marginBottom:5,
                fontFamily:F_BODY}}>{ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:SPACING[4]}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevo(ev,op)} style={{
                    background:ov(0.05),border:`1px solid ${Q.border}`,
                    borderRadius:RADII.sm,padding:"4px 8px",cursor:"pointer",
                    color:Q.cyan,fontSize:12,fontWeight:600,
                    fontFamily:F_BODY}}>
                    {op.sel} · {fmt(op.odd)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:SPACING[4],marginBottom:8}}>
        <button onClick={()=>setModo("seleccion")} style={{flex:1,
          background:modo==="seleccion"?`${Q.violet}33`:ov(0.04),
          border:`1px solid ${modo==="seleccion"?Q.violet:Q.border}`,borderRadius:RADII.sm,
          padding:"8px",cursor:"pointer",color:modo==="seleccion"?Q.cyan:Q.muted,
          fontSize:12,fontWeight:700,fontFamily:F_BODY}}>Selección</button>
        <button onClick={()=>setModo("partido")} style={{flex:1,
          background:modo==="partido"?`${Q.violet}33`:ov(0.04),
          border:`1px solid ${modo==="partido"?Q.violet:Q.border}`,borderRadius:RADII.sm,
          padding:"8px",cursor:"pointer",color:modo==="partido"?Q.cyan:Q.muted,
          fontSize:12,fontWeight:700,fontFamily:F_BODY}}>Otro partido</button>
      </div>

      {modo==="seleccion"&&(
        <div>
          {opciones.length===0&&<div style={{color:Q.muted,fontSize:12,marginBottom:6,
            fontFamily:F_BODY}}>Sin opciones. Probá "Otro partido".</div>}
          {opciones.map((op,k)=>(
            <button key={k} onClick={()=>elegirOpcion(op)} style={{width:"100%",
              display:"flex",justifyContent:"space-between",alignItems:"center",
              background:ov(0.04),border:`1px solid ${Q.border}`,
              borderRadius:RADII.sm,padding:"8px 12px",marginBottom:4,cursor:"pointer"}}>
              <span style={{color:Q.text,fontSize:12,
                fontFamily:F_BODY}}>{op.sel}</span>
              <span style={{color:Q.cyan,fontWeight:700,fontSize:12,
                fontFamily:F_BODY}}>{fmt(op.odd)}</span>
            </button>
          ))}
        </div>
      )}

      {modo==="partido"&&(
        <div>
          <div style={{display:"flex",gap:SPACING[4],marginBottom:6}}>
            <input value={buscar} onChange={e=>setBuscar(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&buscarEventos()}
              placeholder="Equipo..."
              style={{flex:1,background:ov(0.05),
                border:`1px solid ${Q.border}`,borderRadius:RADII.sm,padding:"8px 12px",
                color:Q.text,fontSize:14,fontFamily:F_BODY}}/>
            <button onClick={buscarEventos} style={{background:`${Q.violet}33`,
              border:`1px solid ${Q.violet}`,borderRadius:RADII.sm,padding:"0 12px",
              cursor:"pointer",color:Q.cyan,fontSize:12,fontWeight:700,
              fontFamily:F_BODY}}>{buscando?"...":"Ir"}</button>
          </div>
          {encontrados.map((ev,k)=>(
            <div key={k} style={{background:ov(0.03),
              border:`1px solid ${Q.dim}`,borderRadius:RADII.sm,padding:"8px 8px",marginBottom:5}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,marginBottom:5,
                fontFamily:F_BODY}}>{ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:SPACING[4]}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevo(ev,op)} style={{
                    background:ov(0.05),border:`1px solid ${Q.border}`,
                    borderRadius:RADII.sm,padding:"4px 8px",cursor:"pointer",
                    color:Q.cyan,fontSize:12,fontWeight:600,
                    fontFamily:F_BODY}}>
                    {op.sel} · {fmt(op.odd)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:SPACING[4],marginTop:7}}>
        <input value={ajuste} onChange={e=>setAjuste(e.target.value)}
          placeholder="Cuota a mano" inputMode="decimal"
          style={{flex:1,background:ov(0.05),
            border:`1px solid ${Q.border}`,borderRadius:RADII.sm,padding:"8px 8px",
            color:Q.text,fontSize:13,fontFamily:F_BODY}}/>
        <button onClick={onQuitar} style={{background:`${Q.pink}18`,
          border:`1px solid ${Q.pink}`,borderRadius:RADII.sm,padding:"8px 12px",
          cursor:"pointer",color:Q.pink,fontSize:12,fontWeight:700,
          fontFamily:F_BODY}}>Quitar</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA — MEJORAR MI APUESTA (sube captura de otro sitio)
// ═══════════════════════════════════════════════════════════════
function ScreenMejorar({ onAction, onBet, user, refCode, escaneo, setEscaneo }){
  // El escaneo vive en la raíz: si el cliente sale a mirar otra cosa
  // y vuelve, lo que escaneó sigue ahí. Antes se perdía y había que
  // sacar la foto de nuevo.
  const imagenes = escaneo?.imagenes || [];
  const res = escaneo?.res || null;
  // Una sola derivación decide qué ofrece la pantalla y qué envía: así
  // el botón de código y el de apostar nunca pueden discrepar sobre
  // qué picks son jugables. Misma regla que en la versión de navegador.
  const estado = estadoDeAcciones(res);
  const setImagenes = (v)=>setEscaneo(e=>({...(e||{}),
    imagenes: typeof v==="function" ? v(e?.imagenes||[]) : v}));
  const setRes = (v)=>setEscaneo(e=>({...(e||{}),
    res: typeof v==="function" ? v(e?.res||null) : v}));
  const [analizando,setAnalizando]=useState(false);
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
    setApuestaErr(""); setStakeTexto("");
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
  const [camaraAbierta,setCamaraAbierta]=useState(false);
  // Monto para apostar con saldo, aparte del error de la lectura de
  // imagen: uno es del escaneo, el otro es de la apuesta en sí.
  const [stakeTexto,setStakeTexto]=useState("");
  const [apuestaErr,setApuestaErr]=useState("");
  const agregarCapturada=(frame)=>{
    setErr(""); setRes(null);
    setApuestaErr(""); setStakeTexto("");
    setImagenes(prev=>[...prev,frame]);
  };

  const generarBoleto=async()=>{
    if(!res||generando) return;
    if(!estado.puedeJugar){ setErr(estado.mensaje); return; }
    setGenerando(true);
    try{
      const body={
        picks: betslipPicks(estado.jugables),
      };
      if(refCode){ body.inf_code=refCode; body.codigo_influencer=refCode; }
      const r=await fetch(`${API}/api/betslip`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(mensajeDeDetalle(e.detail).mensaje||`Error ${r.status}`); }
      const d=await r.json();
      setBoleto(d);
      // Se limpian las fotos, que ya cumplieron, pero NO el resultado:
      // el panel del código vive dentro del bloque que depende de él, así
      // que borrarlo acá desmontaba el código en el mismo instante en que
      // se generaba. Para el cliente, el botón "reseteaba" la pantalla.
      // Descartar el escaneo sigue disponible en su propio botón.
      setEscaneo(e=>({...(e||{}), imagenes:[]}));
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
        throw new Error(mensajeDeDetalle(e.detail).mensaje||`Error ${r.status}`); }
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

  // Reusa la hoja de confirmación que usan Prematch, Live y Combos: ahí
  // el jugador elige saldo, bono o reservada, y esa hoja es la que
  // manda a enviarApuesta. Adentro del mini-app el jugador ya está
  // identificado por init_data, así que no hace falta pedir sesión.
  const apostar=()=>{
    if(!estado.puedeJugar){ setErr(estado.mensaje); return; }
    const stake=stakeValido(stakeTexto);
    if(stake===null){ setApuestaErr("Ingresá un monto válido para apostar."); return; }
    setApuestaErr("");
    // normalizarPicks lee "odd", el escáner devuelve "odd_final".
    const picks=estado.jugables.map(p=>({...p, odd:p.odd_final}));
    onBet(picks, stake, res.cuota_total);
  };

  const estados={
    ok:{t:"Igual o mejor",c:Q.green},
    igualada:{t:"Igualada",c:Q.green},
    mejorada_parcial:{t:"Máximo posible",c:Q.amber},
    // Not an error: we do have a price, it is just for another line.
    // Amber is the colour this screen already uses to say "check this".
    otra_linea:{t:"Otra línea",c:Q.amber},
    sin_mercado:{t:"Sin ese mercado",c:Q.red},
    sin_partido:{t:"Sin ese partido",c:Q.red},
  };

  return(
    <div style={{background:Q.void,minHeight:"100%",padding:"16px 12px"}}>
      <BotMsg time="">
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,
          fontFamily:F_BODY}}><Icon name="scan-line" size={13}/> Mejorar mi apuesta</div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:12,lineHeight:1.4,
          fontFamily:F_BODY}}>
          Subí la captura de una apuesta de otro sitio. La leemos y te decimos
          si podemos igualarla o mejorarla con nuestras cuotas.
        </div>

        {imagenes.length>0&&(
          <div style={{display:"flex",gap:SPACING[8],flexWrap:"wrap",marginBottom:8}}>
            {imagenes.map((im,i)=>(
              <div key={i} style={{position:"relative"}}>
                <img src={im.preview} alt={"f"+i} style={{width:60,height:60,
                  objectFit:"cover",borderRadius:RADII.sm,border:`1px solid ${Q.border}`}}/>
                <button onClick={()=>quitarImagen(i)} style={{position:"absolute",
                  top:-5,right:-5,width:18,height:18,borderRadius:"50%",padding:0,
                  background:Q.pink,border:"none",color:inkOn(Q.pink),fontSize:12,
                  cursor:"pointer",lineHeight:1}}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{display:"flex",gap:SPACING[8],marginBottom:8}}>
          <button onClick={()=>setCamaraAbierta(true)} style={{flex:1,
            background:"transparent",border:`2px dashed ${Q.border}`,
            borderRadius:RADII.lg,padding:"20px 12px",textAlign:"center",
            cursor:"pointer"}}>
            <div style={{marginBottom:4}}><Icon name="camera" size={24} color={Q.text}/></div>
            <div style={{color:Q.text,fontWeight:700,fontSize:12,
              fontFamily:F_BODY}}>Sacar foto</div>
          </button>
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:RADII.lg,
            padding:"20px 12px",textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" multiple onChange={elegir}
              style={{display:"none"}}/>
            <div style={{marginBottom:4,lineHeight:0}}>
              <ImageIcon size={24} color={Q.text} aria-hidden="true"/></div>
            <div style={{color:Q.text,fontWeight:700,fontSize:12,
              fontFamily:F_BODY}}>
              {imagenes.length>0?"Agregar más":"Galería"}</div>
          </label>
        </div>

        {camaraAbierta&&(
          <CameraCapture Q={Q} F_BODY={F_BODY}
            onCapture={agregarCapturada}
            onClose={()=>setCamaraAbierta(false)}/>
        )}

        {imagenes.length>0&&(
          <button onClick={analizar} disabled={analizando} style={{width:"100%",
            background:analizando?ov(0.06)
              :`linear-gradient(135deg,${Q.cyan},${Q.violet})`,
            border:"none",borderRadius:RADII.md,padding:"12px",marginBottom:4,
            cursor:analizando?"wait":"pointer",color:analizando?Q.muted:inkOn(Q.cyan, Q.violet),
            fontWeight:700,fontSize:13,fontFamily:F_BODY}}>
            {analizando?"Leyendo...":<><Icon name="search" size={13}/> Analizar {imagenes.length} foto{imagenes.length>1?"s":""}</>}</button>
        )}

        {err&&<div style={{color:Q.red,fontSize:12,marginTop:10,
          fontFamily:F_BODY}}>{err}</div>}

        {analizando&&(
          <div style={{color:Q.violet2,fontSize:12,textAlign:"center",
            padding:SPACING[16],fontFamily:F_BODY}}>
            La IA está leyendo tu apuesta...
          </div>
        )}

        {res&&(
          <div style={{marginTop:12}}>
            <div style={{color:Q.muted,fontSize:12,marginBottom:8,
              fontFamily:F_BODY}}>
              Leímos {res.picks_total} · podemos tomar {res.picks_ok}
            </div>
            {res.faltan_picks&&(
              <div style={{background:`${Q.red}12`,border:`1px solid ${Q.red}66`,
                borderRadius:RADII.md,padding:"8px 12px",marginBottom:10,color:Q.red,
                fontSize:12,lineHeight:1.4,fontFamily:F_BODY}}>
                <Icon name="triangle-alert" size={13}/> El cupón marca cuota {fmt(res.total_odd_cupon)} pero con lo leído
                no llegamos. Falta algún partido — agregá otra foto.
              </div>
            )}
            {/* Un solo aviso arriba en vez de uno por pick: el botón
                de corregir ya está en cada uno, y repetir la
                advertencia agrega ruido sin agregar información. */}
            <div style={{background:`${Q.amber}12`,
              border:`1px solid ${Q.amber}44`,borderRadius:RADII.md,
              padding:"8px 12px",marginBottom:10,color:Q.amber,
              fontSize:12,lineHeight:1.45,
              fontFamily:F_BODY}}>
              Revisá que los partidos y las selecciones sean los
              correctos antes de confirmar. Si algo no coincide,
              tocá "corregir" en ese pick.</div>

            {res.picks.map((p,i)=>{
              const est=estados[p.estado]||{t:p.estado,c:Q.muted};
              return(
              <GCard key={i} glow={p.odd_final?est.c:undefined}
                style={{padding:"12px 12px",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",gap:SPACING[8],marginBottom:4}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontWeight:600,fontSize:12,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                      fontFamily:F_BODY}}>{p.home} vs {p.away}</div>
                    <div style={{color:Q.muted,fontSize:12}}>{p.selection}</div>
                    {/* `selection` is the line we quote. Saying which
                        line the ticket asked for is what keeps the two
                        numbers below from reading as the same bet. */}
                    {p.selection_leida&&(
                      <div style={{color:Q.amber,fontSize:12,lineHeight:1.35,
                        fontFamily:F_BODY}}>
                        Cotizamos esta línea · en tu boleto decía {p.selection_leida}
                      </div>
                    )}
                  </div>
                  <span style={{background:`${est.c}22`,border:`1px solid ${est.c}`,
                    borderRadius:RADII.lg,padding:"4px 8px",fontSize:12,fontWeight:700,
                    color:est.c,flexShrink:0,whiteSpace:"nowrap",
                    fontFamily:F_BODY}}>{est.t}</span>
                </div>

                <div style={{display:"flex",gap:SPACING[12],fontSize:12,marginBottom:6,
                  fontFamily:F_BODY}}>
                  {p.odd_original&&<span style={{color:Q.dim}}>Origen {fmt(p.odd_original)}</span>}
                  {p.odd_final&&<span style={{color:est.c,fontWeight:700}}>
                    Nuestra {fmt(p.odd_final)}{p.ajustada?" ↑":""}</span>}
                </div>
                <button onClick={()=>setCorrigiendo(corrigiendo===i?null:i)} style={{
                  background:corrigiendo===i?`${Q.cyan}22`:"transparent",
                  border:`1px solid ${corrigiendo===i?Q.cyan:Q.dim}`,borderRadius:RADII.md,
                  padding:"4px 12px",cursor:"pointer",color:corrigiendo===i?Q.cyan:Q.muted,
                  fontSize:12,fontWeight:700,fontFamily:F_BODY}}>
                  {corrigiendo===i?"✕ Cerrar":<><Pencil size={12}/> Está mal</>}</button>
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
                borderRadius:RADII.md,padding:"8px 12px",margin:"8px 0",color:Q.amber,
                fontSize:12,lineHeight:1.4,fontFamily:F_BODY}}>
                <Icon name="triangle-alert" size={13}/> Hay selecciones que no tenemos. Podés armar la combinada con
                las {res.picks_ok} que sí, desde Prematch.
              </div>
            )}

            {/* Sin nada jugable: se dice por qué en lugar de no ofrecer
                ningún botón en silencio. */}
            {!estado.puedeJugar&&!boleto&&(
              <GCard glow={Q.red} style={{padding:SPACING[16],marginTop:6,textAlign:"center"}}>
                <div style={{color:Q.red,fontSize:12,lineHeight:1.5,
                  fontFamily:F_BODY}}>{estado.mensaje}</div>
              </GCard>
            )}

            {estado.puedeJugar&&!boleto&&(
              <GCard glow={Q.green} style={{padding:SPACING[16],marginTop:6}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                  <span style={{color:Q.muted,fontSize:12,
                    fontFamily:F_BODY}}>Nuestra cuota total</span>
                  <span style={{color:Q.gold,fontWeight:900,fontSize:20,
                    fontFamily:F_BODY}}>{fmt(res.cuota_total)}x</span>
                </div>

                {/* Monto y confirmación: reusa la misma hoja que el
                    resto de la app, así se puede pagar con saldo, bono
                    o reservar, en vez de un camino aparte. */}
                <div style={{marginBottom:10}}>
                  <label htmlFor="qp-stake-mejorar" style={{display:"block",
                    color:Q.muted,fontSize:12,marginBottom:5,
                    fontFamily:F_BODY}}>
                    Monto a apostar
                    {user?.saldo!=null&&(
                      <span style={{color:Q.dim}}> · Saldo {ars(user.saldo)}</span>
                    )}
                  </label>
                  <input id="qp-stake-mejorar" type="number" inputMode="numeric"
                    min="1" value={stakeTexto}
                    onChange={e=>setStakeTexto(e.target.value)}
                    placeholder="Ej: 2000" style={{width:"100%",background:Q.inset,
                      border:`1px solid ${Q.border}`,borderRadius:RADII.md,
                      padding:"12px 12px",color:Q.text,fontSize:15,
                      fontFamily:F_NUM}}/>
                </div>

                {apuestaErr&&<div style={{color:Q.red,fontSize:12,
                  marginBottom:8,fontFamily:F_BODY}}>{apuestaErr}</div>}

                <button onClick={apostar} style={{width:"100%",
                  background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
                  border:"none",borderRadius:RADII.md,padding:"12px",
                  color:inkOn(Q.violet, Q.violet2),fontWeight:800,fontSize:15,cursor:"pointer",
                  marginBottom:8,fontFamily:F_BODY}}>
                  Apostar con mi saldo</button>

                <button onClick={generarBoleto} disabled={generando}
                  style={{width:"100%",background:`linear-gradient(135deg,${Q.green},${Q.cyan})`,
                    border:"none",borderRadius:RADII.md,padding:"12px",color:inkOn(Q.green, Q.cyan),
                    fontWeight:800,fontSize:15,cursor:"pointer",marginBottom:8,
                    fontFamily:F_BODY}}>
                  {generando?"Generando...":<><Icon name="ticket" size={13}/> Generar mi código para jugar</>}</button>

                {/* Descartar lo escaneado. Antes solo se podía salir
                    de la pantalla, y no era evidente qué pasaba con
                    lo que ya se había leído. */}
                <button onClick={()=>{
                    if(window.confirm("¿Descartar lo escaneado?")){
                      setEscaneo(null);
                    }
                  }} disabled={generando}
                  style={{width:"100%",background:"transparent",
                    border:`1px solid ${Q.border}`,borderRadius:RADII.md,
                    padding:"12px",color:Q.muted,fontSize:13,
                    cursor:"pointer",marginBottom:8,
                    fontFamily:F_BODY}}>
                  Descartar y empezar de nuevo</button>
                <div style={{color:Q.muted,fontSize:12,lineHeight:1.4,textAlign:"center",
                  fontFamily:F_BODY}}>
                  Con el código jugás acá o lo llevás a una agencia.</div>
              </GCard>
            )}

            {boleto&&(
              <GCard glow={Q.gold} style={{padding:SPACING[20],marginTop:6,textAlign:"center"}}>
                <div style={{color:Q.muted,fontSize:12,textTransform:"uppercase",
                  letterSpacing:1,marginBottom:8,
                  fontFamily:F_BODY}}>Tu código de jugada</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:32,letterSpacing:2,
                  fontFamily:F_BODY}}>{boleto.code}</div>
                <div style={{color:Q.cyan,fontWeight:700,fontSize:16,marginTop:6,
                  fontFamily:F_BODY}}>Cuota {fmt(boleto.odd_total||res.cuota_total)}x</div>
                <div style={{color:Q.muted,fontSize:12,marginTop:12,lineHeight:1.5,
                  fontFamily:F_BODY}}>
                  <Smartphone size={13}/> Anotá o captura este código.<br/>
                  Llevalo a una agencia para pagar y jugar,
                  o cargalo desde el bot.</div>
                {refCode&&<div style={{color:Q.violet2,fontSize:12,marginTop:8,
                  fontFamily:F_BODY}}>
                  Jugada de @{refCode}</div>}
              </GCard>
            )}
          </div>
        )}

        <div style={{marginTop:14}}>
          <QKB rows={[[{icon:<Icon name="arrow-left" size={14}/>,label:"Sports",action:"sports"}]]} onPress={onAction}/>
        </div>
      </BotMsg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
const STEPS=[
  {k:"home",     l:<><Icon name="house" size={12}/> Inicio</>},
  {k:"prematch", l:<><Icon name="clipboard-list" size={12}/> Prematch</>},
  {k:"live",     l:<><Icon name="circle-dot" size={12} color={Q.red}/> En Vivo</>},
  {k:"combo",    l:<><Zap size={12}/> Combos IA</>},
  {k:"mybets",   l:<><Icon name="chart-no-axes-combined" size={12}/> Mis apuestas</>},
];

// ── Captura de errores: nunca más pantalla negra ──────────────
class CazaError extends Component {
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err}; }
  componentDidCatch(err,info){ console.error("CazaError:",err,info); }
  render(){
    if(this.state.err){
      return (
        <div style={{padding:SPACING[20],color:Q.text,fontFamily:F_BODY}}>
          <div style={{color:Q.red,fontWeight:800,fontSize:15,marginBottom:8}}>
            <Icon name="triangle-alert" size={15}/> Algo falló en esta pantalla</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:8}}>
            {String(this.state.err&&this.state.err.message||this.state.err).slice(0,200)}</div>
          <div style={{color:Q.dim,fontSize:12,marginBottom:16,whiteSpace:"pre-wrap",
            fontFamily:"monospace",maxHeight:200,overflow:"auto"}}>
            {String(this.state.err&&this.state.err.stack||"").slice(0,500)}</div>
          <button onClick={()=>this.setState({err:null})}
            style={{background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,border:"none",
              borderRadius:RADII.md,padding:"12px 20px",color:inkOn(Q.violet, Q.cyan),fontWeight:700,fontSize:14,
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
  desafios:<><path d="M7 11l3-3 4 4 3-3"/><path d="M3 15l4 4 4-4"/><path d="M13 9l4-4 4 4"/></>,
  casino:  <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></>,
  mybets:  <><path d="M4 8h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4z"/><path d="M12 8v10" strokeDasharray="2 2"/></>,
  home:    <><path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z"/></>,
  cuenta:  <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></>,
  ayuda:   <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4 2.2c-.9.6-1.5 1-1.5 2.3"/><path d="M12 16h.01"/></>,
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
      borderRadius:RADII.md,padding:"12px 16px",opacity:deshabilitado?0.5:1,
      display:"flex",alignItems:"center",gap:SPACING[12]}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:deshabilitado?Q.muted:Q.text,fontWeight:700,fontSize:14,
          fontFamily:F_BODY}}>{titulo}</div>
        <div style={{color:Q.muted,fontSize:12,marginTop:2,fontFamily:F_BODY,
          lineHeight:1.35}}>{detalle}</div>
      </div>
      {disponible!=null&&(
        <div style={{fontFamily:F_NUM,fontSize:17,fontWeight:700,
          color:deshabilitado?Q.dim:color,whiteSpace:"nowrap"}}>
          {money(disponible,mon)}</div>
      )}
      {enviando===modo&&<span style={{color:Q.muted,fontSize:12}}>…</span>}
    </button>
  );

  return(
    <div onClick={onCerrar} style={{position:"fixed",inset:0,zIndex:1000,
      background:"rgba(5,9,20,0.88)",display:"flex",alignItems:"flex-end"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:520,
        margin:"0 auto",background:Q.deep,borderTop:`1px solid ${Q.border}`,
        borderRadius:"18px 18px 0 0",
        padding:"18px 16px calc(18px + env(safe-area-inset-bottom))"}}>

        <div style={{width:36,height:4,borderRadius:RADII.sm,background:Q.border,
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

        {/* Qué tan probable es, antes de confirmar. Es información
            honesta: a veces hace apostar menos, y está bien. */}
        <ProbabilidadApuesta picks={picks} stake={stake} moneda={mon}/>

        {err&&(
          <div style={{background:`${Q.red}1A`,border:`1px solid ${Q.red}`,
            borderRadius:RADII.md,padding:"8px 12px",marginBottom:11,
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
          padding:"12px 0 4px",cursor:"pointer",fontFamily:F_BODY}}>Cancelar</button>
      </div>
    </div>
  );
}

// La hora del partido, en la zona horaria del dispositivo.
// Se prefiere commence_time (ISO con zona) sobre el texto ya
// formateado que manda el servidor: el navegador sabe dónde está
// el usuario y no hay que adivinarlo por IP.
function horaLocal(ev){
  const crudo = ev?.commence_time || ev?.start_time;
  if(!crudo) return ev?.time || "--/-- --:--";
  const d = new Date(crudo);
  if(isNaN(d)) return ev?.time || "--/-- --:--";
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

// ── Código de reserva ─────────────────────────────────────────
// Se muestra grande y con QR en todas las pantallas donde aparece un
// boleto pendiente: es lo que el cliente lleva al mostrador. Tenerlo
// escondido en un detalle obligaba a buscarlo con el cajero esperando.
function CodigoReserva({ code, compacto=false, vence=null }){
  const [copiado,setCopiado]=useState(false);
  if(!code) return null;

  const copiar=()=>{
    try{
      navigator.clipboard.writeText(code);
      setCopiado(true);
      setTimeout(()=>setCopiado(false),1500);
    }catch(e){}
  };

  return(
    <div style={{background:Q.inset||"rgba(255,255,255,0.04)",
      border:`1px solid ${Q.gold}`,borderRadius:RADII.lg,
      padding:compacto?"10px 12px":"14px",marginTop:8,
      display:"flex",alignItems:"center",gap:SPACING[12]}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,letterSpacing:1.4,color:Q.dim,
          fontWeight:700}}>CÓDIGO DE RESERVA</div>
        <div onClick={copiar} style={{fontFamily:F_BODY,
          fontSize:compacto?26:32,fontWeight:700,color:Q.gold,
          letterSpacing:1.5,lineHeight:1.1,cursor:"pointer"}}>
          {code}</div>
        <div style={{fontSize:12,color:copiado?Q.green:Q.muted,marginTop:2}}>
          {copiado?"✓ Copiado":"Tocá para copiar · Presentalo en la agencia"}</div>
        {vence&&<div style={{fontSize:12,color:Q.amber,marginTop:2}}>
          Vence {vence}</div>}
      </div>
      <img alt={`Código QR ${code}`} loading="lazy"
        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(code)}`}
        style={{width:compacto?64:84,height:compacto?64:84,borderRadius:RADII.md,
          background:"#fff",padding:SPACING[4],flexShrink:0}}/>
    </div>
  );
}

// Burbuja flotante del boleto en armado. builderPicks vive en el
// componente raíz, no en ScreenBuilder, así que sobrevive a la
// navegación; lo único que faltaba era mostrarlo (T6). Toma el lugar que
// deja libre la burbuja de Ayuda al mudarse a la barra inferior (T5), así
// que las dos nunca compiten por el mismo rincón.
function BurbujaBetslip({ count, onAbrir }){
  return(
    <button onClick={onAbrir} aria-label="Ver mi apuesta"
      style={{
        position:"fixed", right:14,
        bottom:"calc(84px + env(safe-area-inset-bottom))",
        zIndex:150,
        height:40, borderRadius:RADII.xl, padding:"0 16px",
        background:`linear-gradient(135deg,${Q.violet},${Q.violet2||Q.cyan})`,
        border:"none", boxShadow:"0 4px 16px rgba(0,0,0,.45)",
        cursor:"pointer", fontSize:13, fontWeight:700, color:inkOn(Q.violet, Q.violet2||Q.cyan),
        display:"flex", alignItems:"center", gap:SPACING[8],
        fontFamily:F_BODY}}>
      <Icon name="ticket" size={13}/> {count} {count===1?"pick":"picks"}</button>
  );
}

// Controlado: la barra inferior es la única que abre el chat de ayuda
// (T5, se retira la burbuja flotante); este componente ya no guarda su
// propio estado, solo dibuja el modal cuando el padre dice que está abierto.
function BotonAyuda({ userId, origen, abierto, onCerrar }){
  if(!userId || !abierto) return null;
  return(
    <div onClick={onCerrar} style={{position:"fixed",
      inset:0,zIndex:200,background:"rgba(2,2,8,.9)",display:"flex",
      alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",
        maxWidth:520,height:"78dvh",background:Q.void||"#050510",
        borderTop:`1px solid ${Q.border}`,
        borderRadius:"16px 16px 0 0",padding:SPACING[16],
        display:"flex",flexDirection:"column"}}>
        <ChatSoporte userId={userId} origen={origen}
          onCerrar={onCerrar}/>
      </div>
    </div>
  );
}

// Chat de soporte. La IA responde lo que puede con datos reales de
// la cuenta; los reclamos de plata van directo a una persona de la
// agencia, con sus canales de contacto a mano.
function ChatSoporte({ userId, origen, onCerrar }){
  const [msgs,setMsgs]=useState([]);
  const [texto,setTexto]=useState("");
  const [proc,setProc]=useState(false);
  const [ticket,setTicket]=useState(null);
  const [derivado,setDerivado]=useState(false);
  const [contacto,setContacto]=useState(null);

  // Los canales de la agencia, desde que se abre el chat
  useEffect(()=>{
    if(!userId) return;
    fetch(`${API}/api/soporte/contacto?user_id=${userId}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d?.contacto) setContacto(d.contacto); })
      .catch(()=>{});
  },[userId]);
  const [sonido,setSonido]=useState(()=>{
    try{ return localStorage.getItem("qp_sonido")!=="0"; }catch(e){ return true; }
  });
  const finRef=useRef(null);
  const ultimoRef=useRef(0);

  const cambiarSonido=()=>{
    setSonido(v=>{
      const n=!v;
      try{ localStorage.setItem("qp_sonido", n?"1":"0"); }catch(e){}
      return n;
    });
  };

  // Un tono corto generado al momento: evita cargar un archivo y
  // que el navegador lo bloquee por no haber interacción previa.
  const sonar=()=>{
    if(!sonido) return;
    try{
      const ctx=new (window.AudioContext||window.webkitAudioContext)();
      const osc=ctx.createOscillator(), gan=ctx.createGain();
      osc.connect(gan); gan.connect(ctx.destination);
      osc.frequency.value=880; osc.type="sine";
      gan.gain.setValueAtTime(0.0001, ctx.currentTime);
      gan.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime+0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.3);
      osc.start(); osc.stop(ctx.currentTime+0.32);
    }catch(e){}
  };

  const cargar=async()=>{
    if(!userId) return;
    try{
      const r=await fetch(`${API}/api/soporte/hilo?user_id=${userId}`);
      if(!r.ok) return;
      const d=await r.json();
      setTicket(d.ticket_id);
      setDerivado(!!d.derivado);
      setContacto(d.contacto||null);
      const lista=d.mensajes||[];
      // Suena solo si llegó algo nuevo de la otra parte
      const ajenos=lista.filter(m=>m.autor!=="cliente").length;
      if(ultimoRef.current && ajenos>ultimoRef.current) sonar();
      ultimoRef.current=ajenos;
      setMsgs(lista);
    }catch(e){}
  };

  useEffect(()=>{
    cargar();
    // Mientras espera a un humano conviene refrescar seguido
    const t=setInterval(cargar, derivado?20000:60000);
    return()=>clearInterval(t);
    // eslint-disable-next-line
  },[userId,derivado]);

  useEffect(()=>{ finRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,proc]);

  const enviar=async()=>{
    const t=texto.trim();
    if(!t||proc||!userId) return;
    setTexto("");
    setMsgs(m=>[...m,{autor:"cliente",texto:t,fecha:""}]);
    setProc(true);
    try{
      const r=await fetch(`${API}/api/soporte/mensaje`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:userId,texto:t,
          ticket_id:ticket,origen})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo enviar");
      setTicket(d.ticket_id);
      if(d.derivado){ setDerivado(true); setContacto(d.contacto||null); }
      if(d.respuesta){
        setMsgs(m=>[...m,{autor:"ia",texto:d.respuesta,fecha:""}]);
        sonar();
      }
    }catch(e){
      setMsgs(m=>[...m,{autor:"ia",texto:"No pude enviar el mensaje. "+
        "Probá de nuevo en un momento.",error:true}]);
    }
    setProc(false);
  };

  const AUTOR={cliente:null, ia:"Asistente", agencia:"Tu agencia",
               admin:"Administración"};

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",
      minHeight:0}}>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:9}}>
        <div>
          <div style={{color:Q.text,fontWeight:700,fontSize:14}}>
            <Icon name="message-circle" size={13}/> Ayuda</div>
          <div style={{color:Q.muted,fontSize:12}}>
            {derivado?"Te va a responder tu agencia"
                     :"Preguntá lo que necesites"}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:SPACING[8]}}>
          <button onClick={cambiarSonido} title="Sonido de aviso"
            style={{background:"transparent",border:"none",
              cursor:"pointer",padding:0,opacity:sonido?1:0.4}}>
            <Bell size={16}/></button>
          {onCerrar&&(
            <button onClick={onCerrar} style={{background:"transparent",
              border:"none",color:Q.muted,fontSize:20,cursor:"pointer",
              padding:0}}>×</button>
          )}
        </div>
      </div>

      {/* Los canales de la agencia se muestran siempre que existan,
          no solo al derivar: si el cliente prefiere una persona, no
          tiene por qué esperar a que la IA lo mande. */}
      {contacto&&(contacto.whatsapp||contacto.telegram)&&(
        <div style={{background:`${Q.gold}12`,border:`1px solid ${Q.gold}44`,
          borderRadius:RADII.md,padding:"12px 12px",marginBottom:9}}>
          <div style={{color:Q.gold,fontSize:12,fontWeight:700,
            marginBottom:6}}>
            {derivado?"Tu consulta necesita a una persona"
                     :"Hablá con tu agencia"}</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:8,
            lineHeight:1.45}}>
            {derivado
              ? <>{contacto.agencia} ya la recibió
                  {contacto.horario?` · ${contacto.horario}`:""}.
                  También podés escribirles directo:</>
              : <>Si preferís hablar con una persona de {contacto.agencia}
                  {contacto.horario?` · ${contacto.horario}`:""}:</>}</div>
          <div style={{display:"flex",gap:SPACING[8],flexWrap:"wrap"}}>
            {contacto.whatsapp&&(
              <a href={`https://wa.me/${contacto.whatsapp.replace(/\D/g,"")}`}
                target="_blank" rel="noreferrer"
                style={{background:"#25D36622",border:"1px solid #25D366",
                  borderRadius:RADII.md,padding:"8px 12px",color:"#25D366",
                  fontSize:12,fontWeight:700,textDecoration:"none"}}>
                WhatsApp</a>
            )}
            {contacto.telegram&&(
              <a href={contacto.telegram} target="_blank" rel="noreferrer"
                style={{background:"#2AABEE22",border:"1px solid #2AABEE",
                  borderRadius:RADII.md,padding:"8px 12px",color:"#2AABEE",
                  fontSize:12,fontWeight:700,textDecoration:"none"}}>
                Telegram</a>
            )}
          </div>
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",marginBottom:9,minHeight:120}}>
        {msgs.length===0&&!proc&&(
          <div style={{color:Q.dim,fontSize:12,padding:"16px 4px",
            lineHeight:1.6}}>
            Escribime lo que necesites: tu saldo, cómo cobrar un premio,
            por qué salió una apuesta. Si hace falta, te paso con tu
            agencia.</div>
        )}
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",
            justifyContent:m.autor==="cliente"?"flex-end":"flex-start",
            marginBottom:8}}>
            <div style={{maxWidth:"86%",
              background:m.autor==="cliente"?`${Q.violet}28`
                :(m.error?`${Q.red}14`:ov(0.05)),
              border:`1px solid ${m.autor==="cliente"?Q.violet
                :(m.error?`${Q.red}55`:Q.border)}`,
              borderRadius:RADII.lg,padding:"8px 12px",
              color:m.error?Q.red:Q.text,fontSize:12.5,lineHeight:1.55,
              whiteSpace:"pre-wrap"}}>
              {AUTOR[m.autor]&&m.autor!=="ia"&&(
                <div style={{color:Q.cyan,fontSize:12,fontWeight:700,
                  marginBottom:3}}>{AUTOR[m.autor].toUpperCase()}</div>
              )}
              {m.texto}
            </div>
          </div>
        ))}
        {proc&&(
          <div style={{color:Q.muted,fontSize:12,padding:"4px 4px"}}>
            Escribiendo…</div>
        )}
        <div ref={finRef}/>
      </div>

      <div style={{display:"flex",gap:SPACING[8]}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&enviar()}
          placeholder="Escribí tu consulta…"
          style={{flex:1,minWidth:0,background:ov(0.05),
            border:`1px solid ${Q.border}`,borderRadius:RADII.md,
            padding:"12px 12px",color:Q.text,fontSize:14}}/>
        <button onClick={enviar} disabled={proc||!texto.trim()}
          style={{background:texto.trim()?Q.violet:ov(0.05),border:"none",
            borderRadius:RADII.md,padding:"0 16px",
            cursor:texto.trim()?"pointer":"default",
            color:texto.trim()?inkOn(Q.violet):Q.dim,fontSize:14,fontWeight:700,
            flexShrink:0}}>↑</button>
      </div>
    </div>
  );
}

// Avisos que publica la administración. Rotan solos y se descartan
// tocándolos: no son bloqueantes, así que nunca tapan la operación.
// Muestra qué tan probable considera el mercado la combinada, antes
// de confirmar. Sale de las cuotas, no de un pronóstico: 100/cuota
// es lo que el mercado estima y el cliente puede verificarlo solo.
// Compartir la jugada. Usa el menú nativo del teléfono, que es el
// que ofrece Instagram, WhatsApp y el resto: intentar integrarse con
// cada red por separado no funciona y se rompe con cada cambio que
// hacen ellas.
//
// Lo que sí controlamos: que el texto quede lindo y que el enlace
// traiga a la persona de vuelta con la combinada ya cargada.
// Si alguien llegó por un enlace compartido, se avisa al servidor
// para que le pague al que lo compartió. Se hace una sola vez por
// visitante: el backend descarta repetidos por dispositivo e IP.
function registrarVisitaCompartida(){
  try{
    const p=new URLSearchParams(window.location.search);
    const s=p.get("s");
    if(!s) return;
    const ya=sessionStorage.getItem("qp_visita_"+s);
    if(ya) return;
    sessionStorage.setItem("qp_visita_"+s,"1");
    fetch(`${API}/api/compartir/${encodeURIComponent(s)}`).catch(()=>{});
  }catch(e){}
}

// ── DESAFÍOS ──────────────────────────────────────────────────
// Apostar contra otro jugador, no contra la casa. Uno propone, otro
// acepta, y el que acierta se lleva el pozo menos la comisión.
//
// Se juega en IACOIN porque sin una moneda común un argentino y un
// colombiano no podrían desafiarse: cada uno tendría su saldo en su
// moneda y no habría forma de comparar montos.
// ── CASINO ────────────────────────────────────────────────────
// El catálogo del proveedor. Son más de dos mil juegos, así que la
// pantalla se apoya en el buscador y los filtros: mostrarlos todos
// de una sería inusable y lento.
// Un color estable para cada proveedor, derivado de su nombre. No
// es decorativo: con veinte marcas en una fila, el color ayuda a
// reconocer cuál está elegida sin leer.
function _colorMarca(nombre){
  const PALETA=["#7B1FA2","#0277BD","#00838F","#2E7D32","#EF6C00",
                "#C62828","#4527A0","#00695C","#AD1457","#37474F"];
  let h=0;
  for(let i=0;i<(nombre||"").length;i++) h=(h*31+nombre.charCodeAt(i))|0;
  return PALETA[Math.abs(h)%PALETA.length];
}

// La celebración del Súper Bono. Ocupa toda la pantalla y no se
// puede ignorar: es el momento que hace que valga la pena estar
// conectado.
//
// SIN DESTELLOS RÁPIDOS. Los parpadeos veloces pueden provocar
// convulsiones en personas con epilepsia fotosensible. El pulso es
// lento —más de un segundo por ciclo— y sin cambios bruscos de
// blanco a negro: se ve igual de festivo y no pone a nadie en riesgo.
// Juego responsable. Los límites que el jugador se pone a sí mismo y
// la autoexclusión.
//
// Bajar un límite entra ya; subirlo espera. Y la autoexclusión no la
// levanta nadie antes del plazo: son las dos reglas que hacen que
// esto proteja de verdad y no sea un botón decorativo.
// Todo lo que jugó el cliente, junto. Antes veía sus boletos
// deportivos pero no las jugadas de casino, así que no podía cuadrar
// su propio saldo: veía descuentos sin explicación.
function HistorialJuegos({ user, onCerrar }){
  const [vista,setVista]=useState("todo");
  const [d,setD]=useState(null);
  const [porJuego,setPorJuego]=useState(null);
  const [filtro,setFiltro]=useState("");

  useEffect(()=>{
    if(!user?.id) return;
    fetch(`${API}/api/historial/${user.id}`)
      .then(r=>r.ok?r.json():null).then(x=>x&&setD(x)).catch(()=>{});
    fetch(`${API}/api/historial-juegos/${user.id}`)
      .then(r=>r.ok?r.json():null).then(x=>x&&setPorJuego(x))
      .catch(()=>{});
  },[user?.id]);

  const ICONO={deportivas:<Icon name="trophy" size={13}/>,casino:<Icon name="spade" size={13}/>,
    casino_vivo:<Video size={13}/>,desafios:<Handshake size={13}/>};
  const NOMBRE={deportivas:"Deportiva",casino:"Casino",
    casino_vivo:"Casino en Vivo",desafios:"Desafío"};

  const movs=(d?.movimientos||[]).filter(m=>
    filtro==="" || m.tipo===filtro ||
    (filtro==="casino"&&m.tipo==="casino_vivo"));

  return(
    <div style={{position:"fixed",inset:0,zIndex:400,
      background:"rgba(2,2,8,.97)",overflowY:"auto",
      padding:"20px 16px 40px"}}>
      <div style={{maxWidth:480,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:14}}>
          <span style={{color:Q.text,fontWeight:800,fontSize:17,
            fontFamily:F_BODY}}>Mi historial</span>
          <button onClick={onCerrar}
            style={{background:"transparent",border:"none",color:Q.muted,
              fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        <div style={{display:"flex",gap:SPACING[8],marginBottom:12}}>
          {[["todo","Todo"],["juegos","Por juego"]].map(([k,l])=>(
            <button key={k} onClick={()=>setVista(k)}
              style={{flex:1,
                background:vista===k?`${Q.violet}33`:"transparent",
                border:`1px solid ${vista===k?Q.violet:Q.border}`,
                borderRadius:RADII.md,padding:"8px",cursor:"pointer",
                color:vista===k?Q.cyan:Q.muted,fontSize:12.5,
                fontWeight:vista===k?700:400,
                fontFamily:F_BODY}}>{l}</button>
          ))}
        </div>

        {vista==="todo"&&(
          <>
            {d&&(
              <GCard style={{padding:SPACING[16],marginBottom:12}}>
                <div style={{display:"flex",gap:SPACING[12]}}>
                  <div style={{flex:1}}>
                    <div style={{color:Q.muted,fontSize:12}}>Apostado</div>
                    <div style={{color:Q.text,fontWeight:800,fontSize:16,
                      fontFamily:F_BODY}}>
                      {d.total.apostado.toLocaleString("es-AR")}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:Q.muted,fontSize:12}}>Cobrado</div>
                    <div style={{color:Q.green,fontWeight:800,fontSize:16,
                      fontFamily:F_BODY}}>
                      {d.total.cobrado.toLocaleString("es-AR")}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:Q.muted,fontSize:12}}>Resultado</div>
                    <div style={{color:d.total.resultado>=0?Q.green:Q.red,
                      fontWeight:800,fontSize:16,
                      fontFamily:F_BODY}}>
                      {d.total.resultado>=0?"+":""}
                      {d.total.resultado.toLocaleString("es-AR")}</div>
                  </div>
                </div>
                <div style={{color:Q.dim,fontSize:12,marginTop:7}}>
                  Últimos 30 días · los desafíos van en IACOIN y no se
                  suman acá</div>
              </GCard>
            )}

            <div style={{display:"flex",gap:SPACING[4],marginBottom:10,
              overflowX:"auto"}}>
              {[["","Todo"],["deportivas",<Icon name="trophy" size={13}/>],
                ["casino",<Icon name="spade" size={13}/>],
                ["desafios",<Handshake size={13}/>]].map(([k,l])=>(
                <button key={k} onClick={()=>setFiltro(k)}
                  style={{background:filtro===k?`${Q.violet}28`:"transparent",
                    border:`1px solid ${filtro===k?Q.violet:Q.border}`,
                    borderRadius:RADII.md,padding:"8px 12px",cursor:"pointer",
                    color:filtro===k?Q.cyan:Q.muted,fontSize:12,
                    whiteSpace:"nowrap",flexShrink:0,
                    fontFamily:F_BODY}}>{l}</button>
              ))}
            </div>

            {!d&&<div style={{color:Q.muted,textAlign:"center",
              padding:SPACING[24],fontSize:13}}>Cargando…</div>}

            {d&&movs.length===0&&(
              <div style={{textAlign:"center",padding:"32px 20px"}}>
                <Mascot size={64} style={{margin:"0 auto 8px"}}/>
                <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
                  fontFamily:F_BODY}}>
                  No hay movimientos en este período.</div>
              </div>
            )}

            {movs.map((m,i)=>(
              <div key={i} style={{display:"flex",gap:SPACING[8],padding:"8px 0",
                borderTop:i?`1px solid ${Q.border}`:"none",
                alignItems:"flex-start"}}>
                <span style={{fontSize:15,flexShrink:0,marginTop:1}}>
                  {ICONO[m.tipo]||"·"}</span>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontSize:12.5,lineHeight:1.35,
                    overflow:"hidden",textOverflow:"ellipsis",
                    whiteSpace:"nowrap",
                    fontFamily:F_BODY}}>{m.titulo}</div>
                  <div style={{color:Q.dim,fontSize:12,marginTop:2}}>
                    {NOMBRE[m.tipo]}{m.detalle&&` · ${m.detalle}`}
                    {" · "}{m.fecha}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:Q.muted,fontSize:12,
                    fontFamily:F_BODY}}>
                    −{m.apostado.toLocaleString("es-AR",
                      {maximumFractionDigits:2})}</div>
                  {m.cobrado>0&&(
                    <div style={{color:Q.green,fontSize:12.5,
                      fontWeight:700,
                      fontFamily:F_BODY}}>
                      +{m.cobrado.toLocaleString("es-AR",
                        {maximumFractionDigits:2})}</div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {vista==="juegos"&&(
          <>
            {!porJuego&&<div style={{color:Q.muted,textAlign:"center",
              padding:SPACING[24],fontSize:13}}>Cargando…</div>}

            {porJuego&&porJuego.juegos.length===0&&(
              <div style={{textAlign:"center",padding:"32px 20px"}}>
                <Mascot size={64} style={{margin:"0 auto 8px"}}/>
                <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
                  fontFamily:F_BODY}}>
                  Todavía no jugaste al casino.</div>
              </div>
            )}

            {(porJuego?.juegos||[]).map(j=>(
              <div key={j.game_id} style={{display:"flex",gap:SPACING[12],
                padding:"12px 0",borderTop:`1px solid ${Q.border}`,
                alignItems:"center"}}>
                {j.imagen&&(
                  <img src={j.imagen} alt="" loading="lazy"
                    onError={e=>{e.target.style.display="none";}}
                    style={{width:42,height:42,borderRadius:RADII.md,
                      objectFit:"cover",flexShrink:0}}/>
                )}
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontSize:12.5,
                    overflow:"hidden",textOverflow:"ellipsis",
                    whiteSpace:"nowrap",
                    fontFamily:F_BODY}}>
                    {j.en_vivo&&<><Video size={11}/> </>}{j.juego}</div>
                  <div style={{color:Q.dim,fontSize:12,marginTop:2}}>
                    {j.jugadas} jugadas · {j.ultima}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:j.resultado>=0?Q.green:Q.red,
                    fontSize:13,fontWeight:700,
                    fontFamily:F_BODY}}>
                    {j.resultado>=0?"+":""}
                    {j.resultado.toLocaleString("es-AR",
                      {maximumFractionDigits:0})}</div>
                  <div style={{color:Q.dim,fontSize:12}}>
                    de {j.apostado.toLocaleString("es-AR",
                      {maximumFractionDigits:0})}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}


function JuegoResponsable({ user, onCerrar }){
  const [d,setD]=useState(null);
  const [msg,setMsg]=useState(null); // {text, ok} | null — status lives here, not in the text
  const [proc,setProc]=useState(false);
  const [editando,setEditando]=useState(null);
  const [valor,setValor]=useState("");
  const [verExcluir,setVerExcluir]=useState(false);

  const cargar=()=>{
    fetch(`${API}/api/jugador/${user.id}/responsable`)
      .then(r=>r.ok?r.json():null)
      .then(x=>x&&setD(x)).catch(()=>{});
  };
  useEffect(cargar,[user.id]);

  const guardar=async(tipo,periodo,quitar)=>{
    setProc(true); setMsg(null);
    try{
      const r=await fetch(`${API}/api/jugador/limite`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, tipo, periodo,
          monto:parseFloat(valor)||0, quitar:!!quitar})});
      const x=await r.json();
      if(!r.ok) throw new Error(x.detail||"No se pudo");
      setMsg({text:x.mensaje||"Listo", ok:true}); setEditando(null); setValor("");
      cargar();
    }catch(e){ setMsg({text:e.message, ok:false}); }
    setProc(false);
  };

  const excluir=async(plazo)=>{
    const textos={
      "24h":"24 horas","7d":"7 días","30d":"30 días",
      "90d":"90 días","180d":"180 días","permanente":"siempre"};
    if(!window.confirm(
      `Vas a cerrar tu cuenta por ${textos[plazo]}.\n\n`+
      `No la vamos a reactivar antes, ni aunque lo pidas.\n\n`+
      `¿Seguro?`)) return;
    setProc(true);
    try{
      const r=await fetch(`${API}/api/jugador/autoexcluir`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, plazo})});
      const x=await r.json();
      if(!r.ok) throw new Error(x.detail||"No se pudo");
      setMsg({text:x.mensaje, ok:true}); cargar();
    }catch(e){ setMsg({text:e.message, ok:false}); }
    setProc(false);
  };

  if(!d) return null;
  if(!d.activo) return null;

  const TIPOS=[
    ["deposito","Cuánto podés cargar"],
    ["apuesta","Cuánto podés apostar"],
  ];

  return(
    <div style={{position:"fixed",inset:0,zIndex:400,
      background:"rgba(2,2,8,.96)",overflowY:"auto",
      padding:"20px 16px 40px"}}>
      <div style={{maxWidth:440,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <span style={{color:Q.text,fontWeight:800,fontSize:17,
            fontFamily:F_BODY}}>Juego responsable</span>
          <button onClick={onCerrar}
            style={{background:"transparent",border:"none",color:Q.muted,
              fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {msg&&(
          <div style={{color:msg.ok?Q.green:Q.red,fontSize:12.5,marginBottom:14,
            lineHeight:1.55,padding:"12px 12px",
            background:`${Q.cyan}0D`,border:`1px solid ${Q.cyan}33`,
            borderRadius:RADII.md,fontFamily:F_BODY}}>
            <Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/> {msg.text}</div>
        )}

        {d.autoexcluido&&(
          <GCard glow={Q.red} style={{padding:SPACING[16],marginBottom:14}}>
            <div style={{color:Q.red,fontWeight:700,fontSize:14,
              marginBottom:6,fontFamily:F_BODY}}>
              Tu cuenta está cerrada</div>
            <div style={{color:Q.muted,fontSize:12.5,lineHeight:1.6,
              fontFamily:F_BODY}}>
              {d.excluido_permanente
                ? "Cerraste tu cuenta de forma permanente."
                : `Hasta el ${d.excluido_hasta}. No se puede reactivar antes.`}
              <br/><br/>
              Si sentís que el juego te está haciendo daño, hablar
              ayuda: Jugadores Anónimos Argentina, 0800-333-0333.</div>
          </GCard>
        )}

        {!d.autoexcluido&&d.limites!==false&&(
          <>
            <div style={{color:Q.muted,fontSize:12,marginBottom:12,
              lineHeight:1.6,fontFamily:F_BODY}}>
              Poné tus propios topes. Bajarlos vale al instante; subirlos
              tarda {d.horas_para_subir} horas, para que la decisión no
              se revierta en caliente.</div>

            {TIPOS.map(([tipo,label])=>{
              const l=(d.limites||[]).find(x=>x.tipo===tipo);
              return(
                <GCard key={tipo} style={{padding:SPACING[16],marginBottom:9}}>
                  <div style={{display:"flex",
                    justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{color:Q.text,fontSize:13,fontWeight:600,
                        fontFamily:F_BODY}}>{label}</div>
                      <div style={{color:l?Q.cyan:Q.dim,fontSize:12,
                        marginTop:2,fontFamily:F_BODY}}>
                        {l ? `${l.monto.toLocaleString("es-AR")} por día`
                           : "sin límite"}</div>
                      {l?.pendiente!=null&&(
                        <div style={{color:Q.amber,fontSize:12,
                          marginTop:3,lineHeight:1.4}}>
                          {l.pendiente===-1
                            ? `Se quita el ${l.pendiente_desde}`
                            : `Sube a ${l.pendiente.toLocaleString("es-AR")} el ${l.pendiente_desde}`}</div>
                      )}
                    </div>
                    <button onClick={()=>{
                        setEditando(editando===tipo?null:tipo);
                        setValor(l?String(l.monto):""); }}
                      style={{background:`${Q.violet}22`,
                        border:`1px solid ${Q.violet}66`,borderRadius:RADII.md,
                        padding:"8px 12px",color:Q.cyan,fontSize:12,
                        cursor:"pointer",flexShrink:0}}>
                      {l?"Cambiar":"Poner"}</button>
                  </div>

                  {editando===tipo&&(
                    <div style={{marginTop:11,paddingTop:SPACING[12],
                      borderTop:`1px solid ${Q.border}`}}>
                      <input value={valor} inputMode="decimal"
                        onChange={e=>setValor(
                          e.target.value.replace(/[^\d.]/g,""))}
                        placeholder="Monto por día"
                        style={{width:"100%",
                          background:"rgba(255,255,255,0.05)",
                          border:`1px solid ${Q.border}`,borderRadius:RADII.md,
                          padding:"12px",color:Q.text,fontSize:17,
                          fontWeight:700,textAlign:"center",
                          marginBottom:8,
                          fontFamily:F_BODY}}/>
                      <div style={{display:"flex",gap:SPACING[8]}}>
                        <button onClick={()=>guardar(tipo,"diario",false)}
                          disabled={proc||!valor}
                          style={{flex:1,background:`${Q.green}18`,
                            border:`1px solid ${Q.green}66`,
                            borderRadius:RADII.md,padding:"12px",color:Q.green,
                            fontSize:12.5,fontWeight:700,
                            cursor:"pointer"}}>Guardar</button>
                        {l&&(
                          <button onClick={()=>guardar(tipo,"diario",true)}
                            disabled={proc}
                            style={{background:"transparent",
                              border:`1px solid ${Q.border}`,
                              borderRadius:RADII.md,padding:"12px 16px",
                              color:Q.muted,fontSize:12.5,
                              cursor:"pointer"}}>Quitar</button>
                        )}
                      </div>
                    </div>
                  )}
                </GCard>
              );
            })}
          </>
        )}

        {!d.autoexcluido&&d.autoexclusion!==false&&(
          <div style={{marginTop:18}}>
            {!verExcluir ? (
              <button onClick={()=>setVerExcluir(true)}
                style={{width:"100%",background:"transparent",
                  border:`1px solid ${Q.border}`,borderRadius:RADII.md,
                  padding:"12px",color:Q.muted,fontSize:13,
                  cursor:"pointer",fontFamily:F_BODY}}>
                Quiero cerrar mi cuenta por un tiempo</button>
            ) : (
              <GCard glow={Q.red} style={{padding:SPACING[16]}}>
                <div style={{color:Q.text,fontSize:13.5,fontWeight:700,
                  marginBottom:6,fontFamily:F_BODY}}>
                  Cerrar mi cuenta</div>
                <div style={{color:Q.muted,fontSize:12,lineHeight:1.6,
                  marginBottom:13,fontFamily:F_BODY}}>
                  No vas a poder apostar hasta que venza el plazo. No
                  la reactivamos antes por ningún motivo, ni aunque
                  nos lo pidas.</div>

                {[["24h","Un día"],["7d","Una semana"],
                  ["30d","Un mes"],["90d","Tres meses"],
                  ["180d","Seis meses"],
                  ["permanente","Para siempre"]].map(([k,l])=>(
                  <button key={k} onClick={()=>excluir(k)} disabled={proc}
                    style={{width:"100%",
                      background:k==="permanente"?`${Q.red}14`:"transparent",
                      border:`1px solid ${k==="permanente"?Q.red:Q.border}`,
                      borderRadius:RADII.md,padding:"12px",marginBottom:7,
                      color:k==="permanente"?Q.red:Q.text,fontSize:13,
                      cursor:"pointer",
                      fontFamily:F_BODY}}>{l}</button>
                ))}

                <button onClick={()=>setVerExcluir(false)}
                  style={{width:"100%",background:"transparent",
                    border:"none",color:Q.dim,fontSize:12,marginTop:4,
                    cursor:"pointer"}}>Mejor no</button>
              </GCard>
            )}
          </div>
        )}

        <div style={{color:Q.dim,fontSize:12,marginTop:20,
          lineHeight:1.6,textAlign:"center",
          fontFamily:F_BODY}}>
          Si el juego dejó de ser un entretenimiento, hablar ayuda.<br/>
          Jugadores Anónimos Argentina · 0800-333-0333</div>
      </div>
    </div>
  );
}


function SuperBonoGanaste({ premio, onCerrar }){
  const [fase,setFase]=useState(0);

  useEffect(()=>{
    // Tres pulsos suaves y después queda quieto
    const t=setInterval(()=>setFase(f=>(f+1)%2),1100);
    const fin=setTimeout(()=>clearInterval(t),9000);
    return()=>{ clearInterval(t); clearTimeout(fin); };
  },[]);

  return(
    <div onClick={onCerrar} style={{position:"fixed",inset:0,zIndex:900,
      display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",padding:"24px",cursor:"pointer",
      background:fase
        ? "linear-gradient(160deg,#3B1E6E,#7B1FA2)"
        : "linear-gradient(160deg,#1A0B33,#4A148C)",
      transition:"background 1s ease-in-out"}}>

      <div style={{marginBottom:8,
        transform:fase?"scale(1.08)":"scale(1)",
        transition:"transform 1.1s ease-in-out"}}><PartyPopper size={64} color="#fff"/></div>

      <div style={{color:"#FFD54F",fontWeight:900,
        fontSize:"clamp(30px,10vw,52px)",lineHeight:1.05,
        textAlign:"center",letterSpacing:-0.5,
        textShadow:"0 2px 20px rgba(255,213,79,.5)",
        fontFamily:F_BODY}}>
        ¡GANASTE EL<br/>SÚPER BONO!</div>

      <div style={{color:"#fff",fontWeight:900,
        fontSize:"clamp(34px,12vw,60px)",marginTop:18,
        fontFamily:F_BODY,
        transform:fase?"scale(1.04)":"scale(1)",
        transition:"transform 1.1s ease-in-out"}}>
        {Number(premio.monto).toLocaleString("es-AR",
          {maximumFractionDigits:2})}</div>
      <div style={{color:"rgba(255,255,255,.75)",fontSize:15,
        marginTop:2,fontFamily:F_BODY}}>
        {premio.moneda}</div>

      <div style={{color:"#fff",fontSize:17,fontWeight:700,marginTop:26,
        textAlign:"center",lineHeight:1.4,
        fontFamily:F_BODY}}>
        Gracias por estar conectado</div>

      <div style={{color:"rgba(255,255,255,.6)",fontSize:12,marginTop:22,
        textAlign:"center",lineHeight:1.5,maxWidth:300,
        fontFamily:F_BODY}}>
        Se acreditó como saldo de bono: jugalo y pasa a tu saldo
        retirable.</div>

      <button onClick={onCerrar}
        style={{marginTop:30,background:"rgba(255,255,255,.15)",
          border:"1px solid rgba(255,255,255,.35)",borderRadius:RADII.lg,
          padding:"16px 32px",color:"#fff",fontSize:15,fontWeight:800,
          cursor:"pointer",fontFamily:F_BODY}}>
        ¡Buenísimo!</button>
    </div>
  );
}


function ScreenCasino({ user, vivo }){
  const [juegos,setJuegos]=useState(null);
  const [marcas,setMarcas]=useState([]);
  const [busq,setBusq]=useState("");
  const [marca,setMarca]=useState(null);
  const [abriendo,setAbriendo]=useState(null);
  const [err,setErr]=useState("");
  const [pagina,setPagina]=useState(1);
  const [disponible,setDisponible]=useState(true);

  const POR_PAGINA=24;

  useEffect(()=>{
    // El servidor ya filtra por producto habilitado y por si el
    // juego sirve en móvil: acá no hay que volver a decidirlo.
    const q=`vivo=${vivo?1:0}&movil=1`+(user?.id?`&user_id=${user.id}`:"");
    fetch(`${API}/api/casino/juegos?${q}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{
        if(!d){ setJuegos([]); return; }
        setDisponible(d.disponible!==false);
        setJuegos(d.juegos||[]);
        setMarcas(d.marcas||[]);
      })
      .catch(()=>setJuegos([]));
  },[vivo,user?.id]);

  const abrir=async(j)=>{
    if(!user?.id){ setErr("Entrá a tu cuenta para jugar"); return; }
    setAbriendo(j.id); setErr("");
    try{
      const r=await fetch(`${API}/api/casino/sesion`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, game_id:j.id,
                             language:"es"})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo abrir");
      // Dentro de Telegram conviene el navegador propio: el juego
      // ocupa la pantalla y se vuelve con el botón de atrás.
      const tg=window.Telegram?.WebApp;
      if(tg?.openLink) tg.openLink(d.url);
      else window.open(d.url,"_blank");
    }catch(e){ setErr(e.message); }
    setAbriendo(null);
  };

  const filtrados=(juegos||[]).filter(j=>{
    if(marca&&j.marca!==marca) return false;
    if(!busq.trim()) return true;
    return (j.titulo||"").toLowerCase().includes(busq.toLowerCase().trim());
  });
  const visibles=filtrados.slice(0,pagina*POR_PAGINA);

  if(juegos===null) return(
    <div style={{padding:"40px 20px",textAlign:"center",color:Q.muted,
      fontSize:14,fontFamily:F_BODY}}>Cargando juegos…</div>
  );

  if(!juegos.length) return(
    <div style={{padding:"40px 24px",textAlign:"center"}}>
      <div style={{marginBottom:12}}>{vivo?<Video size={38}/>:<Icon name="spade" size={38}/>}</div>
      <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
        fontFamily:F_BODY}}>
        {!disponible
          ? "Tu agencia todavía no tiene este producto habilitado."
          : (vivo
              ? "No hay mesas en vivo disponibles ahora."
              : "El casino no está disponible por ahora.")}</div>
    </div>
  );

  return(
    <div style={{padding:"12px 12px 20px"}}>
      <input value={busq}
        onChange={e=>{ setBusq(e.target.value); setPagina(1); }}
        placeholder="Buscar juego…"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,
          padding:"12px 12px",color:Q.text,fontSize:14,marginBottom:10,
          fontFamily:F_BODY}}/>

      {/* Los proveedores no mandan logos en su API, solo el nombre.
          Se muestra en recuadros con un color derivado del nombre:
          da identidad visual sin depender de imágenes que no tenemos
          derecho a tomar de cualquier lado. */}
      {marcas.length>1&&(
        <div style={{display:"flex",gap:SPACING[8],overflowX:"auto",
          marginBottom:12,paddingBottom:SPACING[4]}}>
          <button onClick={()=>{ setMarca(null); setPagina(1); }}
            style={{background:!marca
                ?`linear-gradient(135deg,${Q.violet},${Q.cyan})`
                :"rgba(255,255,255,0.05)",
              border:`1px solid ${!marca?Q.violet:Q.border}`,
              borderRadius:RADII.md,padding:"8px 16px",cursor:"pointer",
              color:!marca?inkOn(Q.violet, Q.cyan):Q.muted,fontSize:12,
              fontWeight:!marca?700:500,
              whiteSpace:"nowrap",flexShrink:0,
              fontFamily:F_BODY}}>Todos</button>
          {marcas.map(m=>{
            const on=marca===m;
            const c=_colorMarca(m);
            // El logo del proveedor si existe; si no, el nombre
            const logo=(juegos||[]).find(j=>j.marca===m)?.logo;
            return(
              <button key={m} onClick={()=>{ setMarca(m); setPagina(1); }}
                style={{background:on?c:"rgba(255,255,255,0.05)",
                  border:`1px solid ${on?c:Q.border}`,
                  borderRadius:RADII.md,padding:logo?"6px 13px":"9px 15px",
                  cursor:"pointer",display:"flex",alignItems:"center",
                  gap:SPACING[8],color:on?"#fff":Q.muted,fontSize:12,
                  fontWeight:on?700:500,letterSpacing:0.2,
                  whiteSpace:"nowrap",flexShrink:0,
                  fontFamily:F_BODY}}>
                {logo&&(
                  <img src={logo} alt="" loading="lazy"
                    onError={e=>{e.target.style.display="none";}}
                    style={{height:20,maxWidth:52,objectFit:"contain"}}/>
                )}
                <span>{m}</span></button>
            );
          })}
        </div>
      )}

      {err&&(
        <div style={{color:Q.red,fontSize:12.5,marginBottom:10,
          textAlign:"center",lineHeight:1.45,
          fontFamily:F_BODY}}>{err}</div>
      )}

      <div style={{color:Q.dim,fontSize:12,marginBottom:9,
        fontFamily:F_BODY}}>
        {filtrados.length.toLocaleString("es-AR")}{" "}
        {filtrados.length===1?"juego":"juegos"}</div>

      {/* La grilla se adapta al ancho en vez de forzar tres columnas:
          en pantallas angostas tres tarjetas quedan apretadas y el
          nombre del juego no entra. */}
      <div style={{display:"grid",
        gridTemplateColumns:"repeat(auto-fill,minmax(96px,1fr))",
        gap:SPACING[8]}}>
        {visibles.map(j=>(
          <div key={j.id} onClick={()=>abrir(j)}
            style={{cursor:"pointer",opacity:abriendo===j.id?0.5:1}}>
            <div style={{position:"relative",paddingTop:"100%",
              borderRadius:RADII.md,overflow:"hidden",
              background:"rgba(255,255,255,0.05)"}}>
              {/* Las imágenes vienen del servidor del proveedor. Si
                  no cargan, en vez de un recuadro vacío se muestra el
                  nombre: el jugador ve qué juego es igual. */}
              <div style={{position:"absolute",inset:0,display:"flex",
                alignItems:"center",justifyContent:"center",
                padding:"8px",textAlign:"center",color:Q.dim,
                fontSize:12,lineHeight:1.3,
                fontFamily:F_BODY}}>{j.titulo}</div>
              {j.imagen&&(
                <img src={j.imagen} alt={j.titulo} loading="lazy"
                  onError={e=>{ e.target.style.display="none"; }}
                  style={{position:"absolute",inset:0,width:"100%",
                    height:"100%",objectFit:"cover"}}/>
              )}
              {/* De qué proveedor es. Sin logos, el color y el nombre
                  cumplen la misma función de reconocimiento. */}
              {j.marca&&(
                <div style={{position:"absolute",left:0,bottom:0,
                  background:_colorMarca(j.marca),color:"#fff",
                  fontSize:12,fontWeight:700,padding:"4px 4px",
                  borderTopRightRadius:6,letterSpacing:0.3,
                  maxWidth:"85%",overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap",
                  fontFamily:F_BODY}}>{j.marca}</div>
              )}
              {abriendo===j.id&&(
                <div style={{position:"absolute",inset:0,
                  display:"flex",alignItems:"center",
                  justifyContent:"center",
                  background:"rgba(0,0,0,.6)",color:Q.cyan,
                  fontSize:12}}>Abriendo…</div>
              )}
            </div>
            <div style={{color:Q.text,fontSize:12,marginTop:4,
              lineHeight:1.3,display:"-webkit-box",
              WebkitLineClamp:2,WebkitBoxOrient:"vertical",
              overflow:"hidden",
              fontFamily:F_BODY}}>{j.titulo}</div>
          </div>
        ))}
      </div>

      {visibles.length<filtrados.length&&(
        <button onClick={()=>setPagina(p=>p+1)}
          style={{width:"100%",marginTop:14,background:"transparent",
            border:`1px solid ${Q.border}`,borderRadius:RADII.md,
            padding:"12px",color:Q.muted,fontSize:13,cursor:"pointer",
            fontFamily:F_BODY}}>
          Ver más ({(filtrados.length-visibles.length).toLocaleString("es-AR")} restantes)</button>
      )}

      {filtrados.length===0&&(
        <div style={{textAlign:"center",padding:"32px 20px",
          color:Q.muted,fontSize:13,lineHeight:1.55,
          fontFamily:F_BODY}}>
          No encontramos juegos con ese nombre.</div>
      )}
    </div>
  );
}


function ScreenDesafios({ user, onAction }){
  const [tab,setTab]=useState("muro");
  const [cfg,setCfg]=useState(null);
  const [saldo,setSaldo]=useState(null);
  const [cargando,setCargando]=useState(true);

  const uid=user?.id;

  const cargarSaldo=async()=>{
    if(!uid) return;
    try{
      const r=await fetch(`${API}/api/iacoin/saldo/${uid}`);
      if(r.ok) setSaldo(await r.json());
    }catch(e){}
  };

  useEffect(()=>{
    if(!uid){ setCargando(false); return; }
    fetch(`${API}/api/p2p/config?user_id=${uid}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>setCfg(d))
      .catch(()=>{})
      .finally(()=>setCargando(false));
    cargarSaldo();
    // eslint-disable-next-line
  },[uid]);

  if(cargando) return(
    <div style={{padding:"40px 20px",textAlign:"center",color:Q.muted,
      fontSize:14}}>Cargando…</div>
  );

  if(!uid) return(
    <div style={{padding:"40px 24px",textAlign:"center"}}>
      <div style={{marginBottom:12}}><Handshake size={38}/></div>
      <div style={{color:Q.text,fontSize:17,fontWeight:700,marginBottom:8,
        fontFamily:F_BODY}}>Desafíos</div>
      <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
        fontFamily:F_BODY}}>
        Entrá a tu cuenta para desafiar a otros jugadores.</div>
    </div>
  );

  if(!cfg?.activo) return(
    <div style={{padding:"40px 24px",textAlign:"center"}}>
      <div style={{marginBottom:12}}><Handshake size={38}/></div>
      <div style={{color:Q.text,fontSize:17,fontWeight:700,marginBottom:8,
        fontFamily:F_BODY}}>Desafíos</div>
      <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
        fontFamily:F_BODY}}>
        Tu agencia todavía no tiene este producto habilitado.</div>
    </div>
  );

  return(
    <div style={{background:Q.void,minHeight:"100%",paddingBottom:SPACING[20]}}>
      {/* El saldo de IACOIN, siempre visible: es con lo que se juega */}
      <div onClick={()=>setTab("iacoin")}
        style={{margin:"12px 12px 0",
          background:`linear-gradient(135deg,${Q.violet}22,${Q.cyan}11)`,
          border:`1px solid ${Q.violet}55`,borderRadius:RADII.lg,
          padding:"12px 16px",cursor:"pointer",display:"flex",
          justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{color:Q.muted,fontSize:12,letterSpacing:0.5}}>
            TU SALDO PARA DESAFÍOS</div>
          <div style={{color:Q.gold,fontWeight:900,fontSize:22,
            fontFamily:F_BODY}}>
            {(saldo?.iacoin||0).toLocaleString("es-AR",
              {maximumFractionDigits:2})}
            <span style={{color:Q.muted,fontSize:12,fontWeight:400,
              marginLeft:5}}>IACOIN</span></div>
        </div>
        <span style={{background:`${Q.cyan}22`,border:`1px solid ${Q.cyan}66`,
          borderRadius:RADII.md,padding:"8px 12px",color:Q.cyan,fontSize:12,
          fontWeight:700}}>Comprar</span>
      </div>

      <div style={{display:"flex",gap:SPACING[8],padding:"12px 12px 0",
        overflowX:"auto"}}>
        {[
          {k:"muro",   icon:<Flame size={13}/>, l:"Muro"},
          {k:"crear",  icon:<Icon name="plus" size={13}/>, l:"Desafiar"},
          {k:"mias",   icon:<Icon name="clipboard-list" size={13}/>, l:"Mías"},
          {k:"iacoin", icon:<Coins size={13}/>, l:"IACOIN"},
        ].map(({k,icon,l})=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{background:tab===k?`${Q.violet}33`:"transparent",
              border:`1px solid ${tab===k?Q.violet:Q.border}`,
              borderRadius:RADII.md,padding:"8px 12px",cursor:"pointer",
              color:tab===k?Q.cyan:Q.muted,fontSize:12.5,
              fontWeight:tab===k?700:400,whiteSpace:"nowrap",
              fontFamily:F_BODY}}>{icon} {l}</button>
        ))}
      </div>

      <div style={{padding:"12px"}}>
        {tab==="muro"  &&<MuroDesafios user={user} onCambio={cargarSaldo}
                           onVerMias={()=>setTab("mias")}/>}
        {tab==="crear" &&<CrearDesafio user={user} cfg={cfg}
                           saldo={saldo?.iacoin||0}
                           onListo={()=>{ setTab("mias"); cargarSaldo(); }}/>}
        {tab==="mias"  &&<MisDesafios user={user} onCambio={cargarSaldo}/>}
        {tab==="iacoin"&&<PanelIacoin user={user} saldo={saldo}
                           onCambio={cargarSaldo}/>}
      </div>
    </div>
  );
}


// El muro: desafíos abiertos y lo que comparte la gente
// Comentarios de un desafío. Se guardan junto con el muro para que
// la conversación y la apuesta vivan en el mismo lugar.
function ComentariosDesafio({ desafioId, user, onNuevo }){
  const [lista,setLista]=useState(null);
  const [texto,setTexto]=useState("");
  const [err,setErr]=useState("");
  const [proc,setProc]=useState(false);

  const cargar=()=>{
    fetch(`${API}/api/p2p/${desafioId}/comentarios`)
      .then(r=>r.ok?r.json():null)
      .then(d=>setLista(d?.comentarios||[]))
      .catch(()=>setLista([]));
  };
  useEffect(cargar,[desafioId]);

  const enviar=async()=>{
    if(!texto.trim()) return;
    setProc(true); setErr("");
    try{
      const r=await fetch(`${API}/api/p2p/${desafioId}/comentar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, texto:texto.trim()})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setTexto(""); cargar(); onNuevo&&onNuevo();
    }catch(e){ setErr(e.message); }
    setProc(false);
  };

  return(
    <div style={{marginTop:8,paddingTop:SPACING[8],
      borderTop:`1px solid ${Q.border}`}}>
      {lista===null&&(
        <div style={{color:Q.dim,fontSize:12,textAlign:"center",
          padding:"8px 0"}}>Cargando…</div>
      )}
      {(lista||[]).map(c=>(
        <div key={c.id} style={{marginBottom:7}}>
          <span style={{color:Q.cyan,fontSize:12,fontWeight:600}}>
            {c.autor}</span>
          <span style={{color:Q.dim,fontSize:12,marginLeft:5}}>{c.hace}</span>
          <div style={{color:Q.muted,fontSize:12,lineHeight:1.45}}>
            {c.texto}</div>
        </div>
      ))}
      {lista&&lista.length===0&&(
        <div style={{color:Q.dim,fontSize:12,marginBottom:6,
          lineHeight:1.45}}>
          Todavía nadie comentó. Rompé el hielo.</div>
      )}
      {err&&<div style={{color:Q.red,fontSize:12,marginBottom:5,
        lineHeight:1.4}}>{err}</div>}
      <div style={{display:"flex",gap:SPACING[8]}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)}
          placeholder="Decí algo…"
          onKeyDown={e=>{ if(e.key==="Enter") enviar(); }}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:RADII.md,
            padding:"8px 12px",color:Q.text,fontSize:12,minWidth:0}}/>
        <button onClick={enviar} disabled={proc||!texto.trim()}
          style={{background:`${Q.violet}33`,
            border:`1px solid ${Q.violet}`,borderRadius:RADII.md,
            padding:"8px 12px",color:Q.cyan,fontSize:12,
            cursor:"pointer",flexShrink:0}}>→</button>
      </div>
    </div>
  );
}


// El pulso del muro: quién está, qué se movió hoy, qué acaba de
// pasar. Sin esto la pantalla es la misma cada vez que entrás, y un
// muro que no cambia no da ganas de volver.
function PulsoDesafios({ user, onVerMias }){
  const [p,setP]=useState(null);

  useEffect(()=>{
    const traer=()=>{
      fetch(`${API}/api/p2p/pulso${user?.id?`?user_id=${user.id}`:""}`)
        .then(r=>r.ok?r.json():null)
        .then(d=>d&&setP(d)).catch(()=>{});
    };
    traer();
    // Cada 45 segundos: alcanza para que se note movimiento sin
    // castigar la batería ni el servidor.
    const t=setInterval(traer,45000);
    return()=>clearInterval(t);
  },[user?.id]);

  if(!p) return null;

  return(
    <div style={{marginBottom:14}}>
      {/* Si alguien te tomó un desafío, es lo primero que tenés que
          ver: hay plata en juego esperando resolución. */}
      {p.mis_tomados>0&&(
        <div onClick={onVerMias}
          style={{background:`linear-gradient(135deg,${Q.gold}22,${Q.violet}11)`,
            border:`1px solid ${Q.gold}66`,borderRadius:RADII.md,
            padding:"12px 16px",marginBottom:10,cursor:"pointer"}}>
          <div style={{color:Q.gold,fontSize:13,fontWeight:800,
            fontFamily:F_BODY}}>
            {p.mis_tomados===1
              ? "Te tomaron un desafío"
              : `Te tomaron ${p.mis_tomados} desafíos`}</div>
          <div style={{color:Q.muted,fontSize:12,marginTop:2,
            fontFamily:F_BODY}}>
            Tocá para verlo</div>
        </div>
      )}

      <div style={{display:"flex",gap:SPACING[8],marginBottom:10}}>
        <div style={{flex:1,background:"rgba(255,255,255,0.04)",
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,
          padding:"8px 12px"}}>
          <div style={{color:p.conectados>0?Q.green:Q.dim,fontWeight:800,
            fontSize:17,fontFamily:F_BODY,
            display:"flex",alignItems:"center",gap:SPACING[4]}}>
            {p.conectados>0&&(
              <span style={{width:6,height:6,borderRadius:"50%",
                background:Q.green,display:"inline-block"}}/>
            )}
            {p.conectados}</div>
          <div style={{color:Q.muted,fontSize:12,
            fontFamily:F_BODY}}>conectados</div>
        </div>
        <div style={{flex:1,background:"rgba(255,255,255,0.04)",
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,
          padding:"8px 12px"}}>
          <div style={{color:Q.cyan,fontWeight:800,fontSize:17,
            fontFamily:F_BODY}}>{p.abiertos}</div>
          <div style={{color:Q.muted,fontSize:12,
            fontFamily:F_BODY}}>esperando</div>
        </div>
        <div style={{flex:1,background:"rgba(255,255,255,0.04)",
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,
          padding:"8px 12px"}}>
          <div style={{color:Q.gold,fontWeight:800,fontSize:17,
            fontFamily:F_BODY}}>{p.tomados_hoy}</div>
          <div style={{color:Q.muted,fontSize:12,
            fontFamily:F_BODY}}>tomados hoy</div>
        </div>
      </div>

      {p.actividad.length>0&&(
        <div style={{background:"rgba(255,255,255,0.03)",
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,
          padding:"12px 12px"}}>
          <div style={{color:Q.muted,fontSize:12,letterSpacing:0.6,
            marginBottom:7,fontFamily:F_BODY}}>
            LO ÚLTIMO</div>
          {p.actividad.map((a,i)=>(
            <div key={i} style={{padding:"4px 0",
              borderTop:i?`1px solid ${Q.border}`:"none"}}>
              <div style={{display:"flex",gap:SPACING[8],alignItems:"baseline"}}>
                <span style={{fontSize:12,flexShrink:0}}>
                  {a.tipo==="tomado"?<Handshake size={12}/>:<Eye size={12}/>}</span>
                <span style={{color:Q.text,fontSize:12,lineHeight:1.4,
                  minWidth:0,flex:1,
                  fontFamily:F_BODY}}>{a.texto}</span>
                <span style={{color:Q.dim,fontSize:12,flexShrink:0}}>
                  {a.hace}</span>
              </div>
              <div style={{color:Q.muted,fontSize:12,marginTop:1,
                marginLeft:16,overflow:"hidden",
                textOverflow:"ellipsis",whiteSpace:"nowrap",
                fontFamily:F_BODY}}>
                {a.titulo}
                {a.monto>0&&(
                  <span style={{color:Q.gold,marginLeft:5}}>
                    {a.monto.toLocaleString("es-AR")}</span>
                )}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function MuroDesafios({ user, onCambio, onVerMias }){
  const [posts,setPosts]=useState(null);
  const [abiertos,setAbiertos]=useState([]);
  const [texto,setTexto]=useState("");
  const [msg,setMsg]=useState(null); // {text, ok} | null — status lives here, not in the text
  const [proc,setProc]=useState(false);
  const [verCom,setVerCom]=useState(null);
  // Comentarios de los desafíos, aparte de los del muro
  const [comDesafio,setComDesafio]=useState(null);

  const cargar=async()=>{
    try{
      const [m,a]=await Promise.all([
        fetch(`${API}/api/muro?user_id=${user.id}`).then(r=>r.ok?r.json():null),
        fetch(`${API}/api/p2p/abiertas?user_id=${user.id}`)
          .then(r=>r.ok?r.json():null),
      ]);
      setPosts(m?.posts||[]);
      setAbiertos(a?.apuestas||[]);
    }catch(e){ setPosts([]); }
  };
  useEffect(()=>{ cargar(); /* eslint-disable-next-line */ },[]);

  const publicar=async()=>{
    if(!texto.trim()) return;
    setProc(true); setMsg(null);
    try{
      const r=await fetch(`${API}/api/muro/publicar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, texto:texto.trim()})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo publicar");
      setTexto(""); cargar();
    }catch(e){ setMsg({text:e.message, ok:false}); }
    setProc(false);
  };

  const aceptar=async(id)=>{
    if(!window.confirm("¿Aceptás este desafío? Se te retiene el saldo."))
      return;
    try{
      const r=await fetch(`${API}/api/p2p/${id}/aceptar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setMsg({text:d.aviso||"Aceptado", ok:true}); cargar(); onCambio&&onCambio();
    }catch(e){ setMsg({text:e.message, ok:false}); }
  };

  const like=async(id)=>{
    try{
      await fetch(`${API}/api/muro/${id}/like`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id})});
      setPosts(p=>p.map(x=>x.id===id
        ?{...x, me_gusta:!x.me_gusta,
          likes:x.likes+(x.me_gusta?-1:1)}:x));
    }catch(e){}
  };

  const denunciar=async(id)=>{
    const motivo=window.prompt("¿Qué problema tiene?");
    if(!motivo) return;
    try{
      await fetch(`${API}/api/muro/denunciar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, post_id:id, motivo})});
      setMsg({text:"Gracias. Lo vamos a revisar.", ok:true});
    }catch(e){}
  };

  return(
    <div>
      <PulsoDesafios user={user} onVerMias={onVerMias}/>

      {msg&&<div style={{color:msg.ok?Q.green:Q.red,fontSize:12,marginBottom:10,
        textAlign:"center",lineHeight:1.4}}>
        <Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/> {msg.text}</div>}

      <div style={{marginBottom:14}}>
        <textarea value={texto} onChange={e=>setTexto(e.target.value)}
          placeholder="¿Qué vas a jugar hoy?" rows={2}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"12px 12px",
            color:Q.text,fontSize:13.5,resize:"none",
            fontFamily:F_BODY}}/>
        {texto.trim()&&(
          <button onClick={publicar} disabled={proc}
            style={{width:"100%",marginTop:6,
              background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
              border:"none",borderRadius:RADII.md,padding:"12px",color:inkOn(Q.violet, Q.cyan),
              fontSize:13,fontWeight:700,cursor:"pointer",
              fontFamily:F_BODY}}>
            {proc?"Publicando…":"Publicar"}</button>
        )}
      </div>

      {abiertos.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{color:Q.muted,fontSize:12,letterSpacing:0.5,
            marginBottom:8}}>DESAFÍOS ESPERANDO</div>
          {abiertos.map(a=>(
            <GCard key={a.id} glow={Q.gold} style={{padding:SPACING[12],marginBottom:8}}>
              <div style={{color:Q.text,fontSize:13.5,fontWeight:600,
                lineHeight:1.4,fontFamily:F_BODY}}>
                {a.titulo}</div>
              {a.descripcion&&(
                <div style={{color:Q.muted,fontSize:12,marginTop:3,
                  lineHeight:1.45}}>{a.descripcion}</div>
              )}
              <div style={{color:Q.dim,fontSize:12,marginTop:5}}>
                {a.creador} · {a.hace}</div>

              <div style={{display:"flex",gap:SPACING[12],marginTop:9,
                paddingTop:SPACING[8],borderTop:`1px solid ${Q.border}`}}>
                <div style={{flex:1}}>
                  <div style={{color:Q.muted,fontSize:12}}>Él pone</div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:14,
                    fontFamily:F_BODY}}>
                    {a.pone_el_creador.toLocaleString("es-AR")}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{color:Q.muted,fontSize:12}}>Vos ponés</div>
                  <div style={{color:Q.cyan,fontWeight:700,fontSize:14,
                    fontFamily:F_BODY}}>
                    {a.tenes_que_poner.toLocaleString("es-AR")}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{color:Q.muted,fontSize:12}}>Si ganás</div>
                  <div style={{color:Q.green,fontWeight:700,fontSize:14,
                    fontFamily:F_BODY}}>
                    +{a.podes_ganar.toLocaleString("es-AR")}</div>
                </div>
              </div>

              {a.es_mio ? (
                <div style={{marginTop:9,padding:"12px",textAlign:"center",
                  background:"rgba(255,255,255,0.03)",
                  border:`1px dashed ${Q.border}`,borderRadius:RADII.md,
                  color:Q.muted,fontSize:12,lineHeight:1.45}}>
                  Es tuyo · esperando que alguien lo tome</div>
              ) : (
              <button onClick={()=>aceptar(a.id)}
                style={{width:"100%",marginTop:9,
                  background:`linear-gradient(135deg,${Q.gold},#c9a227)`,
                  border:"none",borderRadius:RADII.md,padding:"12px",
                  color:inkOn(Q.gold, "#c9a227"),fontSize:13.5,fontWeight:800,
                  cursor:"pointer",fontFamily:F_BODY}}>
                Aceptar el desafío</button>
              )}
              <div style={{color:Q.dim,fontSize:12,textAlign:"center",
                marginTop:5}}>
                Comisión {a.comision_pct}% sobre lo que pone cada uno</div>
              {/* La conversación alrededor del desafío. Es lo que
                  hace que alguien se anime a tomarlo. */}
              <button onClick={()=>setComDesafio(
                  comDesafio===a.id?null:a.id)}
                style={{width:"100%",marginTop:8,background:"none",
                  border:"none",cursor:"pointer",color:Q.muted,
                  fontSize:12,padding:"4px 0"}}>
                <Icon name="message-circle" size={11}/> {a.comentarios>0
                  ? `${a.comentarios} ${a.comentarios===1?"comentario":"comentarios"}`
                  : "Comentar"}</button>

              {comDesafio===a.id&&(
                <ComentariosDesafio desafioId={a.id} user={user}
                  onNuevo={()=>cargar()}/>
              )}
            </GCard>
          ))}
        </div>
      )}

      {posts===null&&(
        <div style={{color:Q.muted,textAlign:"center",padding:SPACING[20],
          fontSize:13}}>Cargando…</div>
      )}

      {posts&&posts.length===0&&abiertos.length===0&&(
        <div style={{textAlign:"center",padding:"32px 20px"}}>
          <div style={{marginBottom:10}}><Handshake size={32} color={Q.muted}/></div>
          <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
            fontFamily:F_BODY}}>
            Todavía no hay nada por acá.<br/>
            Creá el primer desafío.</div>
        </div>
      )}

      {(posts||[]).map(p=>(
        <GCard key={p.id} style={{padding:SPACING[12],marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"baseline",marginBottom:5}}>
            <span style={{color:Q.cyan,fontSize:12,fontWeight:700,
              fontFamily:F_BODY}}>{p.autor}</span>
            <span style={{color:Q.dim,fontSize:12}}>{p.hace}</span>
          </div>

          {p.texto&&(
            <div style={{color:Q.text,fontSize:13,lineHeight:1.5,
              fontFamily:F_BODY}}>{p.texto}</div>
          )}

          {p.picks&&p.picks.length>0&&(
            <div style={{marginTop:8,padding:"8px 12px",
              background:"rgba(255,255,255,0.03)",borderRadius:RADII.md}}>
              {p.picks.slice(0,4).map((k,i)=>(
                <div key={i} style={{display:"flex",
                  justifyContent:"space-between",fontSize:12,
                  padding:"4px 0",color:Q.muted}}>
                  <span style={{minWidth:0,flex:1,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {k.sel||k.label}</span>
                  <span style={{color:Q.gold}}>{fmt(k.odd||k.val)}</span>
                </div>
              ))}
              {p.odd_total&&(
                <div style={{color:Q.cyan,fontSize:12,fontWeight:700,
                  marginTop:4,textAlign:"right"}}>
                  {fmt(p.odd_total)}x</div>
              )}
            </div>
          )}

          <div style={{display:"flex",gap:SPACING[16],marginTop:9,
            paddingTop:SPACING[8],borderTop:`1px solid ${Q.border}`,
            alignItems:"center"}}>
            <button onClick={()=>like(p.id)}
              style={{background:"none",border:"none",cursor:"pointer",
                color:p.me_gusta?Q.red:Q.muted,fontSize:12,padding:0}}>
              {p.me_gusta?<Heart size={12} fill="currentColor"/>:"♡"} {p.likes>0?p.likes:""}</button>
            <button onClick={()=>setVerCom(verCom===p.id?null:p.id)}
              style={{background:"none",border:"none",cursor:"pointer",
                color:Q.muted,fontSize:12,padding:0}}>
              <Icon name="message-circle" size={12}/> {p.comentarios>0?p.comentarios:""}</button>
            {!p.es_mio&&(
              <button onClick={()=>denunciar(p.id)}
                style={{background:"none",border:"none",cursor:"pointer",
                  color:Q.dim,fontSize:12,padding:0,marginLeft:"auto"}}>
                Reportar</button>
            )}
          </div>

          {verCom===p.id&&(
            <Comentarios postId={p.id} user={user}
              onNuevo={()=>setPosts(x=>x.map(y=>y.id===p.id
                ?{...y,comentarios:y.comentarios+1}:y))}/>
          )}
        </GCard>
      ))}
    </div>
  );
}


function Comentarios({ postId, user, onNuevo }){
  const [lista,setLista]=useState(null);
  const [texto,setTexto]=useState("");
  const [err,setErr]=useState("");
  const [proc,setProc]=useState(false);

  const cargar=()=>{
    fetch(`${API}/api/muro/${postId}/comentarios`)
      .then(r=>r.ok?r.json():null)
      .then(d=>setLista(d?.comentarios||[]))
      .catch(()=>setLista([]));
  };
  useEffect(cargar,[postId]);

  const enviar=async()=>{
    if(!texto.trim()) return;
    setProc(true); setErr("");
    try{
      const r=await fetch(`${API}/api/muro/${postId}/comentar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, texto:texto.trim()})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setTexto(""); cargar(); onNuevo&&onNuevo();
    }catch(e){ setErr(e.message); }
    setProc(false);
  };

  return(
    <div style={{marginTop:9,paddingTop:SPACING[8],
      borderTop:`1px solid ${Q.border}`}}>
      {(lista||[]).map(c=>(
        <div key={c.id} style={{marginBottom:7}}>
          <span style={{color:Q.cyan,fontSize:12,fontWeight:600}}>
            {c.autor}</span>
          <span style={{color:Q.dim,fontSize:12,marginLeft:5}}>{c.hace}</span>
          <div style={{color:Q.muted,fontSize:12,lineHeight:1.4,
            fontFamily:F_BODY}}>{c.texto}</div>
        </div>
      ))}
      {err&&<div style={{color:Q.red,fontSize:12,marginBottom:5,
        lineHeight:1.4}}>{err}</div>}
      <div style={{display:"flex",gap:SPACING[8],marginTop:6}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)}
          placeholder="Comentar…"
          onKeyDown={e=>{ if(e.key==="Enter") enviar(); }}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:RADII.md,
            padding:"8px 12px",color:Q.text,fontSize:12,minWidth:0,
            fontFamily:F_BODY}}/>
        <button onClick={enviar} disabled={proc||!texto.trim()}
          style={{background:`${Q.violet}33`,border:`1px solid ${Q.violet}`,
            borderRadius:RADII.md,padding:"8px 12px",color:Q.cyan,fontSize:12,
            cursor:"pointer",flexShrink:0}}>→</button>
      </div>
    </div>
  );
}


// Crear un desafío. Antes de publicar avisa si ya hay uno contrario
// esperando: tomar uno existente arranca al instante, mientras que
// publicar el propio deja esperando a que alguien lo tome.
function CrearDesafio({ user, cfg, saldo, onListo }){
  const [titulo,setTitulo]=useState("");
  const [desc,setDesc]=useState("");
  const [pongo,setPongo]=useState("");
  const [pido,setPido]=useState("");
  const [coincidencias,setCoincidencias]=useState([]);
  const [msg,setMsg]=useState(null); // {text, ok} | null — status lives here, not in the text
  const [proc,setProc]=useState(false);

  // Se buscan coincidencias mientras escribe, sin molestar
  useEffect(()=>{
    if(!titulo.trim()||!pongo||!pido){ setCoincidencias([]); return; }
    const t=setTimeout(()=>{
      fetch(`${API}/api/p2p/buscar-coincidencia`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, titulo:titulo.trim(),
          monto_creador:parseFloat(pongo)||0,
          monto_aceptador:parseFloat(pido)||0})})
        .then(r=>r.ok?r.json():null)
        .then(d=>setCoincidencias(d?.coincidencias||[]))
        .catch(()=>{});
    },700);
    return()=>clearTimeout(t);
    // eslint-disable-next-line
  },[titulo,pongo,pido]);

  const crear=async()=>{
    setProc(true); setMsg(null);
    try{
      const r=await fetch(`${API}/api/p2p/crear`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, titulo:titulo.trim(),
          descripcion:desc.trim()||null,
          monto_creador:parseFloat(pongo)||0,
          monto_aceptador:parseFloat(pido)||0})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo crear");
      setMsg({text:d.aviso||"Listo", ok:true});
      setTitulo(""); setDesc(""); setPongo(""); setPido("");
      setTimeout(()=>onListo&&onListo(),1200);
    }catch(e){ setMsg({text:e.message, ok:false}); }
    setProc(false);
  };

  const aceptarExistente=async(id)=>{
    setProc(true); setMsg(null);
    try{
      const r=await fetch(`${API}/api/p2p/${id}/aceptar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setMsg({text:d.aviso||"Aceptado", ok:true});
      setTimeout(()=>onListo&&onListo(),1200);
    }catch(e){ setMsg({text:e.message, ok:false}); }
    setProc(false);
  };

  const inp={width:"100%",background:"rgba(255,255,255,0.05)",
    border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"12px 12px",
    color:Q.text,fontSize:14,marginBottom:10,
    fontFamily:F_BODY};

  const nPongo=parseFloat(pongo)||0;
  const nPido=parseFloat(pido)||0;
  const pozo=nPongo+nPido;
  const com=cfg?.comision_pct||0;
  const gano=pozo>0 ? (nPongo*(1-com/100)+nPido*(1-com/100))-nPongo : 0;

  return(
    <div>
      {msg&&<div style={{color:msg.ok?Q.green:Q.red,
        fontSize:12.5,marginBottom:10,textAlign:"center",
        lineHeight:1.45}}>
        <Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/> {msg.text}</div>}

      <div style={{color:Q.muted,fontSize:12,marginBottom:12,
        lineHeight:1.55,fontFamily:F_BODY}}>
        Proponé algo concreto y decí cuánto ponés. Si alguien lo toma,
        el que acierta se lleva el pozo.</div>

      <div style={{color:Q.muted,fontSize:12,marginBottom:4}}>
        ¿Qué apostás?</div>
      <input value={titulo} onChange={e=>setTitulo(e.target.value)}
        placeholder="River le gana a Boca" style={inp}/>

      <div style={{color:Q.muted,fontSize:12,marginBottom:4}}>
        Detalles (opcional)</div>
      <textarea value={desc} onChange={e=>setDesc(e.target.value)}
        rows={2} placeholder="Cuanto más claro, menos discusiones después"
        style={{...inp,resize:"none"}}/>

      <div style={{display:"flex",gap:SPACING[8]}}>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:12,marginBottom:4}}>
            Yo pongo</div>
          <input value={pongo} inputMode="decimal"
            onChange={e=>setPongo(e.target.value.replace(/[^\d.]/g,""))}
            placeholder="0" style={inp}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:12,marginBottom:4}}>
            El otro pone</div>
          <input value={pido} inputMode="decimal"
            onChange={e=>setPido(e.target.value.replace(/[^\d.]/g,""))}
            placeholder="0" style={inp}/>
        </div>
      </div>

      <div style={{color:Q.dim,fontSize:12,marginTop:-4,marginBottom:12,
        lineHeight:1.45}}>
        Tenés {saldo.toLocaleString("es-AR",{maximumFractionDigits:2})} IACOIN
        {cfg&&` · entre ${cfg.monto_min} y ${cfg.monto_max} por lado`}</div>

      {pozo>0&&(
        <GCard style={{padding:SPACING[12],marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:12,padding:"4px 0"}}>
            <span style={{color:Q.muted}}>Pozo</span>
            <span style={{color:Q.text}}>
              {pozo.toLocaleString("es-AR")}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:12,padding:"4px 0"}}>
            <span style={{color:Q.muted}}>Comisión {com}% de cada uno</span>
            <span style={{color:Q.amber}}>
              −{(pozo*com/100).toLocaleString("es-AR",
                {maximumFractionDigits:2})}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:13,paddingTop:SPACING[8],marginTop:5,
            borderTop:`1px solid ${Q.border}`}}>
            <span style={{color:Q.text,fontWeight:700}}>Si ganás</span>
            <span style={{color:Q.green,fontWeight:800,
              fontFamily:F_BODY}}>
              +{gano.toLocaleString("es-AR",{maximumFractionDigits:2})}</span>
          </div>
        </GCard>
      )}

      {/* Si ya existe lo contrario, conviene tomarlo en vez de
          publicar y esperar. */}
      {coincidencias.length>0&&(
        <GCard glow={Q.gold} style={{padding:SPACING[12],marginBottom:12}}>
          <div style={{color:Q.gold,fontSize:12,fontWeight:700,
            marginBottom:7,fontFamily:F_BODY}}>
            Ya hay alguien esperando</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:9,
            lineHeight:1.5}}>
            Si tomás uno de estos empieza ahora, en vez de esperar a
            que alguien tome el tuyo.</div>
          {coincidencias.map(c=>(
            <div key={c.id} style={{padding:"8px 0",
              borderTop:`1px solid ${Q.border}`}}>
              <div style={{color:Q.text,fontSize:12.5,lineHeight:1.4}}>
                {c.titulo}</div>
              <div style={{color:Q.dim,fontSize:12,marginTop:2}}>
                {c.creador} · él pone {c.el_pone.toLocaleString("es-AR")} ·
                vos {c.vos_ponés.toLocaleString("es-AR")}</div>
              <button onClick={()=>aceptarExistente(c.id)} disabled={proc}
                style={{width:"100%",marginTop:6,
                  background:`${Q.gold}22`,border:`1px solid ${Q.gold}`,
                  borderRadius:RADII.md,padding:"8px",color:Q.gold,fontSize:12,
                  fontWeight:700,cursor:"pointer",
                  fontFamily:F_BODY}}>
                Tomar este</button>
            </div>
          ))}
        </GCard>
      )}

      <button onClick={crear}
        disabled={proc||!titulo.trim()||!nPongo||!nPido}
        style={{width:"100%",
          background:(!titulo.trim()||!nPongo||!nPido)
            ?"rgba(255,255,255,0.06)"
            :`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:RADII.md,padding:"16px",
          color:(!titulo.trim()||!nPongo||!nPido)?Q.dim:inkOn(Q.violet, Q.cyan),
          fontSize:14.5,fontWeight:800,
          cursor:proc?"default":"pointer",
          fontFamily:F_BODY}}>
        {proc?"Creando…":"Publicar desafío"}</button>

      <div style={{color:Q.dim,fontSize:12,textAlign:"center",marginTop:8,
        lineHeight:1.5}}>
        Tu saldo queda retenido hasta que alguien lo tome o venza.</div>
    </div>
  );
}


function MisDesafios({ user, onCambio }){
  const [lista,setLista]=useState(null);
  const [msg,setMsg]=useState(null); // {text, ok} | null — status lives here, not in the text

  const cargar=()=>{
    fetch(`${API}/api/p2p/mis-apuestas/${user.id}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>setLista(d?.apuestas||[]))
      .catch(()=>setLista([]));
  };
  useEffect(cargar,[user.id]);

  const declarar=async(id,ganador)=>{
    try{
      const r=await fetch(`${API}/api/p2p/${id}/resultado`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, ganador})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setMsg({text:d.mensaje||"Listo", ok:true}); cargar(); onCambio&&onCambio();
    }catch(e){ setMsg({text:e.message, ok:false}); }
  };

  const cancelar=async(id)=>{
    if(!window.confirm("¿Cancelar el desafío? Se te devuelve el saldo."))
      return;
    try{
      const r=await fetch(`${API}/api/p2p/${id}/cancelar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setMsg({text:"Cancelado, te devolvimos el saldo", ok:true});
      cargar(); onCambio&&onCambio();
    }catch(e){ setMsg({text:e.message, ok:false}); }
  };

  const ETIQUETA={abierta:{t:"Esperando",c:Q.amber},
    tomada:{t:"En juego",c:Q.cyan},resuelta:{t:"Terminado",c:Q.muted},
    anulada:{t:"Cancelado",c:Q.dim},vencida:{t:"Vencido",c:Q.dim}};

  if(lista===null) return(
    <div style={{color:Q.muted,textAlign:"center",padding:SPACING[20],
      fontSize:13}}>Cargando…</div>
  );

  if(!lista.length) return(
    <div style={{textAlign:"center",padding:"32px 20px"}}>
      <Mascot size={64} style={{margin:"0 auto 8px"}}/>
      <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
        fontFamily:F_BODY}}>
        Todavía no participaste de ningún desafío.</div>
    </div>
  );

  return(
    <div>
      {msg&&<div style={{color:msg.ok?Q.green:Q.red,fontSize:12,marginBottom:10,
        textAlign:"center",lineHeight:1.45}}>
        <Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/> {msg.text}</div>}

      {lista.map(d=>{
        const e=ETIQUETA[d.estado]||{t:d.estado,c:Q.muted};
        return(
          <GCard key={d.id} style={{padding:SPACING[12],marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",gap:SPACING[8]}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontSize:13,fontWeight:600,
                  lineHeight:1.4,fontFamily:F_BODY}}>
                  {d.titulo}</div>
                <div style={{color:Q.dim,fontSize:12,marginTop:3}}>
                  Pusiste {d.puse.toLocaleString("es-AR")}
                  {d.rival&&` · contra ${d.rival}`} · {d.hace}</div>
              </div>
              <span style={{background:`${e.c}22`,border:`1px solid ${e.c}66`,
                borderRadius:RADII.lg,padding:"4px 8px",fontSize:12,
                color:e.c,flexShrink:0,whiteSpace:"nowrap",
                fontWeight:700}}>{e.t}</span>
            </div>

            {d.estado==="abierta"&&(
              <button onClick={()=>cancelar(d.id)}
                style={{width:"100%",marginTop:9,background:"transparent",
                  border:`1px solid ${Q.border}`,borderRadius:RADII.md,
                  padding:"8px",color:Q.muted,fontSize:12,
                  cursor:"pointer",fontFamily:F_BODY}}>
                Cancelar y recuperar mi saldo</button>
            )}

            {d.estado==="tomada"&&!d.disputa&&(
              <div style={{marginTop:10,paddingTop:SPACING[8],
                borderTop:`1px solid ${Q.border}`}}>
                <div style={{color:Q.muted,fontSize:12,marginBottom:7,
                  lineHeight:1.45}}>
                  Cuando termine, decinos quién ganó. Si los dos
                  coinciden se paga solo.</div>
                <div style={{display:"flex",gap:SPACING[8]}}>
                  <button onClick={()=>declarar(d.id,
                      d.soy_creador?"creador":"aceptador")}
                    style={{flex:1,background:`${Q.green}18`,
                      border:`1px solid ${Q.green}66`,borderRadius:RADII.md,
                      padding:"8px",color:Q.green,fontSize:12,
                      fontWeight:700,cursor:"pointer"}}>Gané yo</button>
                  <button onClick={()=>declarar(d.id,
                      d.soy_creador?"aceptador":"creador")}
                    style={{flex:1,background:"transparent",
                      border:`1px solid ${Q.border}`,borderRadius:RADII.md,
                      padding:"8px",color:Q.muted,fontSize:12,
                      cursor:"pointer"}}>Ganó él</button>
                  <button onClick={()=>declarar(d.id,"empate")}
                    style={{background:"transparent",
                      border:`1px solid ${Q.border}`,borderRadius:RADII.md,
                      padding:"8px 12px",color:Q.muted,fontSize:12,
                      cursor:"pointer"}}>Empate</button>
                </div>
              </div>
            )}

            {d.disputa&&d.disputa_estado==="abierta"&&(
              <div style={{marginTop:9,padding:"8px 12px",
                background:`${Q.amber}12`,border:`1px solid ${Q.amber}44`,
                borderRadius:RADII.md,color:Q.amber,fontSize:12,lineHeight:1.5,
                fontFamily:F_BODY}}>
                No coincidieron. Lo está revisando nuestro equipo y te
                avisamos. Tu saldo sigue retenido.</div>
            )}

            {d.estado==="resuelta"&&(
              <div style={{marginTop:9,paddingTop:SPACING[8],
                borderTop:`1px solid ${Q.border}`,display:"flex",
                justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:d.gane?Q.green:Q.muted,fontSize:12,
                  fontWeight:700}}>
                  {d.gane?"Ganaste":"Perdiste"}</span>
                {d.gane&&(
                  <span style={{color:Q.green,fontWeight:800,fontSize:15,
                    fontFamily:F_BODY}}>
                    +{d.cobre.toLocaleString("es-AR",
                      {maximumFractionDigits:2})}</span>
                )}
              </div>
            )}
          </GCard>
        );
      })}
    </div>
  );
}


// Comprar y vender IACOIN. El precio de venta es más bajo que el de
// compra: sin esa diferencia, alguien compraría hoy y volvería a su
// moneda después de una devaluación habiendo ganado sin apostar.
function PanelIacoin({ user, saldo, onCambio }){
  const [modo,setModo]=useState("comprar");
  const [cantidad,setCantidad]=useState("");
  const [msg,setMsg]=useState(null); // {text, ok} | null — status lives here, not in the text
  const [proc,setProc]=useState(false);

  const cot=saldo?.cotizacion;
  const n=parseFloat(cantidad)||0;
  const precio=modo==="comprar"?(cot?.compra||0):(cot?.venta||0);
  const total=n*precio;

  const operar=async()=>{
    setProc(true); setMsg(null);
    try{
      const r=await fetch(`${API}/api/iacoin/${modo==="comprar"?"comprar":"vender"}`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, cantidad:n})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setMsg({text:modo==="comprar"
        ?`Compraste ${n} IACOIN por ${d.pagaste.toLocaleString("es-AR")}`
        :`Vendiste ${n} IACOIN por ${d.recibiste.toLocaleString("es-AR")}`, ok:true});
      setCantidad(""); onCambio&&onCambio();
    }catch(e){ setMsg({text:e.message, ok:false}); }
    setProc(false);
  };

  if(!cot) return(
    <div style={{textAlign:"center",padding:"32px 20px"}}>
      <Mascot size={64} style={{margin:"0 auto 8px"}}/>
      <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
        fontFamily:F_BODY}}>
        Todavía no hay cotización para tu moneda.<br/>
        Avisale a tu agencia.</div>
    </div>
  );

  return(
    <div>
      <GCard glow={Q.gold} style={{padding:SPACING[16],marginBottom:12}}>
        <div style={{color:Q.muted,fontSize:12,letterSpacing:0.5,
          marginBottom:7}}>COTIZACIÓN</div>
        <div style={{display:"flex",gap:SPACING[12]}}>
          <div style={{flex:1}}>
            <div style={{color:Q.muted,fontSize:12}}>Comprás a</div>
            <div style={{color:Q.text,fontWeight:800,fontSize:16,
              fontFamily:F_BODY}}>
              {cot.compra.toLocaleString("es-AR")}</div>
          </div>
          <div style={{flex:1}}>
            <div style={{color:Q.muted,fontSize:12}}>Vendés a</div>
            <div style={{color:Q.muted,fontWeight:700,fontSize:16,
              fontFamily:F_BODY}}>
              {cot.venta.toLocaleString("es-AR")}</div>
          </div>
        </div>
        <div style={{color:Q.dim,fontSize:12,marginTop:7,lineHeight:1.45}}>
          1 IACOIN por {saldo.moneda}. Actualizado {cot.desde}.</div>
      </GCard>

      <div style={{display:"flex",gap:SPACING[8],marginBottom:12}}>
        {[["comprar","Comprar"],["vender","Vender"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setModo(k);setMsg(null);}}
            style={{flex:1,
              background:modo===k?`${Q.violet}33`:"transparent",
              border:`1px solid ${modo===k?Q.violet:Q.border}`,
              borderRadius:RADII.md,padding:"12px",cursor:"pointer",
              color:modo===k?Q.cyan:Q.muted,fontSize:13,
              fontWeight:modo===k?700:400,
              fontFamily:F_BODY}}>{l}</button>
        ))}
      </div>

      {msg&&<div style={{color:msg.ok?Q.green:Q.red,
        fontSize:12.5,marginBottom:10,textAlign:"center",
        lineHeight:1.45}}>
        <Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/> {msg.text}</div>}

      <div style={{color:Q.muted,fontSize:12,marginBottom:4}}>
        Cuántos IACOIN</div>
      <input value={cantidad} inputMode="decimal"
        onChange={e=>setCantidad(e.target.value.replace(/[^\d.]/g,""))}
        placeholder="0"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,
          padding:"12px",color:Q.text,fontSize:20,fontWeight:700,
          textAlign:"center",marginBottom:10,
          fontFamily:F_BODY}}/>

      <div style={{display:"flex",gap:SPACING[4],marginBottom:12}}>
        {[10,50,100,500].map(v=>(
          <button key={v} onClick={()=>setCantidad(String(v))}
            style={{flex:1,background:"rgba(255,255,255,0.04)",
              border:`1px solid ${Q.border}`,borderRadius:RADII.sm,
              padding:"8px 4px",cursor:"pointer",color:Q.muted,
              fontSize:12,fontFamily:F_BODY}}>{v}</button>
        ))}
      </div>

      {n>0&&(
        <GCard style={{padding:SPACING[12],marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:13}}>
            <span style={{color:Q.muted}}>
              {modo==="comprar"?"Pagás":"Recibís"}</span>
            <span style={{color:modo==="comprar"?Q.text:Q.green,
              fontWeight:800,fontSize:16,
              fontFamily:F_BODY}}>
              {total.toLocaleString("es-AR",{maximumFractionDigits:2})}
              <span style={{color:Q.muted,fontSize:12,fontWeight:400,
                marginLeft:4}}>{saldo.moneda}</span></span>
          </div>
          <div style={{color:Q.dim,fontSize:12,marginTop:5}}>
            {modo==="comprar"
              ?`Tenés ${saldo.saldo_local.toLocaleString("es-AR")} ${saldo.moneda}`
              :`Tenés ${saldo.iacoin.toLocaleString("es-AR",{maximumFractionDigits:2})} IACOIN`}</div>
        </GCard>
      )}

      <button onClick={operar} disabled={proc||!n}
        style={{width:"100%",
          background:!n?"rgba(255,255,255,0.06)"
            :`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:RADII.md,padding:"16px",
          color:!n?Q.dim:inkOn(Q.violet, Q.cyan),fontSize:14.5,fontWeight:800,
          cursor:proc?"default":"pointer",
          fontFamily:F_BODY}}>
        {proc?"Procesando…":(modo==="comprar"?"Comprar IACOIN":"Vender IACOIN")}
      </button>

      {(saldo?.movimientos||[]).length>0&&(
        <GCard style={{padding:SPACING[12],marginTop:14}}>
          <div style={{color:Q.muted,fontSize:12,letterSpacing:0.5,
            marginBottom:8}}>ÚLTIMOS MOVIMIENTOS</div>
          {saldo.movimientos.map((m,i)=>(
            <div key={i} style={{display:"flex",
              justifyContent:"space-between",fontSize:12,
              padding:"4px 0",
              borderTop:i?`1px solid ${Q.border}`:"none"}}>
              <span style={{color:Q.muted}}>
                {{compra:"Compra",venta:"Venta",premio:"Ganaste",
                  retencion:"Desafío",devolucion:"Devolución"}[m.tipo]
                  ||m.tipo}
                <span style={{color:Q.dim,fontSize:12,marginLeft:5}}>
                  {m.hace}</span></span>
              <span style={{color:m.cantidad>=0?Q.green:Q.muted,
                fontFamily:F_BODY}}>
                {m.cantidad>=0?"+":""}{m.cantidad.toLocaleString("es-AR",
                  {maximumFractionDigits:2})}</span>
            </div>
          ))}
        </GCard>
      )}
    </div>
  );
}


function BotonCompartir({ picks, odd, code, refCode, compacto, userId }){
  const [copiado,setCopiado]=useState(false);
  // Enlace con código propio: es lo que permite saber si alguien
  // entró de verdad y pagarle al que compartió.
  const [premio,setPremio]=useState(null);
  const [codigo,setCodigo]=useState(null);

  useEffect(()=>{
    if(!userId) return;
    fetch(`${API}/api/compartir/nueva`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({user_id:userId, betslip_code:code,
                           origen:"app"})})
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d?.activo){ setCodigo(d.codigo); setPremio(d); } })
      .catch(()=>{});
  },[userId,code]);

  const armarTexto=()=>{
    const n=(picks||[]).length;
    let t = n===1 ? "Mi jugada de hoy\n\n" : `Mi combinada de ${n}\n\n`;
    (picks||[]).slice(0,6).forEach(p=>{
      const ev=`${p.h||p.home||""} - ${p.a||p.away||""}`.trim(" -");
      const sel=p.sel||p.label||"";
      const cu=Number(p.odd||p.val||0).toFixed(2);
      t += `${ev}\n${sel} · ${cu}\n`;
    });
    if(n>6) t += `y ${n-6} más\n`;
    t += `\nCuota total: ${Number(odd||0).toFixed(2)}x`;
    if(code) t += `\nCódigo: ${code}`;
    // El enlace trae de vuelta con la combinada cargada
    const base = typeof window!=="undefined" ? window.location.origin : "";
    // El código de compartida va en el enlace: con eso se cuenta
    // quién entró y se le paga al que la compartió.
    const q = codigo ? `/?s=${codigo}` : (refCode?`/?ref=${refCode}`:"");
    t += `\n\n${base}${q}`;
    return t;
  };

  // Una imagen del boleto: en redes rinde mucho más que texto suelto,
  // y es lo que hace que alguien se detenga a mirarlo.
  const armarImagen=()=>new Promise(res=>{
    try{
      const W=1080, H=1350;              // proporción de historia
      const cv=document.createElement("canvas");
      cv.width=W; cv.height=H;
      const g=cv.getContext("2d");

      const fondo=g.createLinearGradient(0,0,W,H);
      fondo.addColorStop(0,"#0A0A16");
      fondo.addColorStop(1,"#141428");
      g.fillStyle=fondo; g.fillRect(0,0,W,H);

      g.fillStyle="#9F5FFF"; g.font="bold 46px system-ui";
      g.fillText("IAQP", 70, 110);

      const n=(picks||[]).length;
      g.fillStyle="#FFFFFF"; g.font="bold 62px system-ui";
      g.fillText(n===1?"Mi jugada":`Combinada de ${n}`, 70, 210);

      let y=310;
      (picks||[]).slice(0,7).forEach(p=>{
        const ev=`${p.h||p.home||""} - ${p.a||p.away||""}`.trim(" -");
        g.fillStyle="#7A7F99"; g.font="30px system-ui";
        g.fillText(ev.slice(0,42), 70, y);
        g.fillStyle="#FFFFFF"; g.font="bold 38px system-ui";
        g.fillText(String(p.sel||p.label||"").slice(0,32), 70, y+46);
        g.fillStyle="#E8C547"; g.font="bold 38px system-ui";
        g.textAlign="right";
        g.fillText(Number(p.odd||p.val||0).toFixed(2), W-70, y+46);
        g.textAlign="left";
        y+=115;
      });
      if(n>7){
        g.fillStyle="#7A7F99"; g.font="30px system-ui";
        g.fillText(`y ${n-7} selecciones más`, 70, y); y+=60;
      }

      g.strokeStyle="#2A2F45"; g.lineWidth=2;
      g.beginPath(); g.moveTo(70,H-300); g.lineTo(W-70,H-300); g.stroke();

      g.fillStyle="#7A7F99"; g.font="34px system-ui";
      g.fillText("Cuota total", 70, H-215);
      g.fillStyle="#E8C547"; g.font="bold 92px system-ui";
      g.textAlign="right";
      g.fillText(`${Number(odd||0).toFixed(2)}x`, W-70, H-190);
      g.textAlign="left";

      if(code){
        g.fillStyle="#00F0FF"; g.font="bold 44px system-ui";
        g.fillText(code, 70, H-100);
      }
      g.fillStyle="#4A4F65"; g.font="26px system-ui";
      g.fillText("Jugá con responsabilidad · +18", 70, H-45);

      cv.toBlob(b=>res(b),"image/png");
    }catch(e){ res(null); }
  });

  const compartir=async()=>{
    const texto=armarTexto();
    try{
      const img=await armarImagen();
      if(img&&navigator.canShare){
        const file=new File([img],"jugada.png",{type:"image/png"});
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file], text:texto});
          return;
        }
      }
      if(navigator.share){
        await navigator.share({title:"IAQP", text:texto});
        return;
      }
    }catch(e){
      // Si cancela el menú no es un error: no se hace nada
      if(e?.name==="AbortError") return;
    }
    // Sin menú nativo (escritorio), se copia
    try{
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(()=>setCopiado(false),2200);
    }catch(e){}
  };

  if(compacto){
    return(
      <button onClick={compartir} aria-label="Compartir"
        style={{background:"transparent",border:"none",cursor:"pointer",
          color:Q.cyan,fontSize:13,padding:"4px 8px"}}>
        {copiado?"✓ Copiado":<><Icon name="arrow-up-right" size={13}/> Compartir</>}</button>
    );
  }

  return(
    <>
      <button onClick={compartir} style={{width:"100%",marginTop:9,
        background:premio?`${Q.gold}12`:"transparent",
        border:`1px solid ${premio?`${Q.gold}55`:Q.border}`,
        borderRadius:RADII.md,padding:"12px",cursor:"pointer",
        color:premio?Q.gold:Q.cyan,
        fontSize:13,fontWeight:600,display:"flex",alignItems:"center",
        justifyContent:"center",gap:SPACING[8]}}>
        {copiado ? "✓ Copiado al portapapeles" : <><Icon name="arrow-up-right" size={13}/> Compartir mi jugada</>}
      </button>
      {premio&&!copiado&&(
        <div style={{color:Q.dim,fontSize:12,textAlign:"center",
          marginTop:5,lineHeight:1.45}}>
          {premio.texto} Se acredita para apostar.</div>
      )}
    </>
  );
}

function ProbabilidadApuesta({ picks, stake, moneda }){
  const [datos,setDatos]=useState(null);
  const [abierto,setAbierto]=useState(false);

  useEffect(()=>{
    if(!picks?.length) return;
    let vivo=true;
    fetch(`${API}/api/analizar-apuesta`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({picks,stake})})
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(vivo&&d) setDatos(d); })
      .catch(()=>{});
    return()=>{ vivo=false; };
  },[picks,stake]);

  if(!datos) return null;
  const pct=datos.probabilidad_pct;
  // El color acompaña el dato, no lo juzga: rojo no es "no apuestes",
  // es "esto es difícil".
  const c = pct>=30 ? Q.green : (pct>=8 ? Q.gold : Q.red);

  return(
    <div onClick={()=>setAbierto(v=>!v)}
      style={{background:`${c}0F`,border:`1px solid ${c}44`,
        borderRadius:RADII.md,padding:"12px 12px",marginBottom:10,
        cursor:"pointer"}}>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",gap:SPACING[8]}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={{color:Q.muted,fontSize:12}}>
            Probabilidad según el mercado</div>
          <div style={{color:c,fontWeight:800,fontSize:19,marginTop:1}}>
            {pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%
            {datos.uno_cada>2&&(
              <span style={{color:Q.muted,fontSize:12,fontWeight:400,
                marginLeft:7}}>
                1 de cada {datos.uno_cada.toLocaleString("es-AR")}</span>
            )}
          </div>
        </div>
        <span style={{color:Q.dim,fontSize:12,flexShrink:0}}>
          {abierto?"▲":"▼"}</span>
      </div>

      {abierto&&(
        <div style={{marginTop:9,paddingTop:SPACING[8],
          borderTop:`1px solid ${Q.border}`}}>
          <div style={{color:Q.text,fontSize:12,lineHeight:1.55,
            marginBottom:9}}>{datos.lectura}</div>

          {datos.picks.map((p,i)=>(
            <div key={i} style={{display:"flex",
              justifyContent:"space-between",alignItems:"baseline",
              gap:SPACING[8],padding:"4px 0"}}>
              <span style={{color:Q.muted,fontSize:12,minWidth:0,
                flex:1,overflow:"hidden",textOverflow:"ellipsis",
                whiteSpace:"nowrap"}}>{p.seleccion||p.evento}</span>
              <span style={{color:p.probabilidad>=50?Q.green
                :(p.probabilidad>=25?Q.gold:Q.red),
                fontSize:12,flexShrink:0}}>
                {p.probabilidad.toFixed(0)}%</span>
            </div>
          ))}

          <div style={{color:Q.dim,fontSize:12,marginTop:9,
            lineHeight:1.45}}>{datos.nota}</div>
        </div>
      )}
    </div>
  );
}

function AvisosBanner({ destino, agenciaCode }){
  const [avisos,setAvisos]=useState([]);
  const [i,setI]=useState(0);
  const [cerrados,setCerrados]=useState(new Set());

  useEffect(()=>{
    let vivo=true;
    const traer=()=>{
      const q=agenciaCode?`?destino=${destino}&agencia_code=${agenciaCode}`
                         :`?destino=${destino}`;
      fetch(`${API}/api/avisos${q}`)
        .then(r=>r.ok?r.json():null)
        .then(d=>{ if(vivo&&d) setAvisos(d.avisos||[]); })
        .catch(()=>{});
    };
    traer();
    const t=setInterval(traer,180000);
    return()=>{ vivo=false; clearInterval(t); };
  },[destino,agenciaCode]);

  const visibles=avisos.filter(a=>!cerrados.has(a.id));

  useEffect(()=>{
    if(visibles.length<2) return;
    const t=setInterval(()=>setI(x=>(x+1)%visibles.length),6000);
    return()=>clearInterval(t);
  },[visibles.length]);

  if(!visibles.length) return null;
  const a=visibles[Math.min(i,visibles.length-1)];
  const COLOR={info:"#00F0FF", aviso:"#E8C547", urgente:"#FF3B5C"};
  const c=COLOR[a.nivel]||COLOR.info;

  return(
    <div style={{background:`${c}12`,border:`1px solid ${c}44`,
      borderRadius:RADII.md,padding:"12px 12px",marginBottom:10,
      display:"flex",alignItems:"flex-start",gap:SPACING[8]}}>
      <div style={{minWidth:0,flex:1}}>
        <div style={{color:c,fontWeight:700,fontSize:12}}>{a.titulo}</div>
        {a.cuerpo&&(
          <div style={{color:Q.text,fontSize:12,marginTop:3,
            lineHeight:1.5}}>{a.cuerpo}</div>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:SPACING[8],flexShrink:0}}>
        {visibles.length>1&&(
          <div style={{display:"flex",gap:SPACING[4]}}>
            {visibles.map((_,k)=>(
              <span key={k} style={{width:5,height:5,borderRadius:RADII.sm,
                background:k===i?c:Q.border}}/>
            ))}
          </div>
        )}
        <button onClick={()=>setCerrados(s=>new Set([...s,a.id]))}
          aria-label="Cerrar aviso"
          style={{background:"transparent",border:"none",color:Q.muted,
            fontSize:16,cursor:"pointer",padding:0,lineHeight:1}}>×</button>
      </div>
    </div>
  );
}

// ── Barra superior: logo (vuelve al inicio), saldo y cuenta ────
function BarraSuperior({ user, onNav }){
  const mon = user?.moneda || "ARS";
  const ini = (user?.nombre_completo || user?.first_name || "").trim()
    .split(" ").filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
  return(
    <div style={{flexShrink:0,background:Q.deep,borderBottom:`1px solid ${Q.border}`,
      display:"flex",alignItems:"center",gap:SPACING[12],
      padding:"5px 13px 5px",position:"relative"}}>
      <button onClick={()=>onNav("home")} style={{background:"transparent",border:"none",
        cursor:"pointer",padding:0,display:"flex",alignItems:"center"}}>
        {/* 82px wide in the prototype (html/styles.css .brand img), which at
            the shipped file's own 503:244 ratio is ~40px tall — BrandMark
            takes a height. The row's padding was cut from 9px to 5px
            top/bottom to keep the bar at the height it already was (51px on
            a 360px phone, measured in headless Chromium; see
            topBarLogoSize.test.js). */}
        <BrandMark size={40}/>
      </button>
      <div style={{flex:1}}/>
      {user?.saldo!=null&&(
        <div style={{textAlign:"right",lineHeight:1}}>
          <div style={{fontSize:12,letterSpacing:1.4,color:Q.dim,fontWeight:700,
            fontFamily:F_BODY}}>SALDO</div>
          <div style={{fontFamily:F_NUM,fontSize:19,fontWeight:700,color:Q.gold,
            marginTop:2}}>{money(user.saldo,mon)}</div>
        </div>
      )}
      <button onClick={()=>onNav("cuenta")} style={{width:32,height:32,borderRadius:"50%",
        border:"none",cursor:"pointer",flexShrink:0,
        background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        {ini
          ? <span style={{fontFamily:F_NUM,fontSize:13,fontWeight:700,color:inkOn(Q.violet,Q.violet2)}}>
              {ini}</span>
          : <User size={16} color={inkOn(Q.violet,Q.violet2)}/>}
      </button>
      <div style={{position:"absolute",bottom:-1,left:0,right:0,height:1,
        background:`linear-gradient(90deg,${Q.violet},${Q.violet2},transparent)`}}/>
    </div>
  );
}

// ── Barra inferior: 4 accesos + Bet Best al centro ────────────
// Bet Best es la funcion insignia (foto del boleto -> mejor cuota),
// asi que se lleva el unico boton elevado y el unico dorado macizo.
function BarraInferior({ actual, onNav, onAyuda }){
  const items = [
    {k:"prematch", l:"Deportes"},
    {k:"builder",  l:"Builder"},
    {k:"desafios", l:"Desafíos"},
    {k:"mybets",   l:"Boletos"},
    {k:"ayuda",    l:"Ayuda"},
    {k:"cuenta",   l:"Perfil"},
  ];
  const izq = items.slice(0,3), der = items.slice(3);
  const activoBB = actual==="mejorar";

  // Medidas tomadas del prototipo (html/styles.css:465-570). El botón de
  // Bet Best flota POR ENCIMA de la barra (`top:-25px`) y su etiqueta se
  // apoya en el borde inferior de la celda: antes ambos vivían abajo y se
  // superponían, que es lo que se veía en pantalla.
  const Item = ({it}) => {
    const on = actual===it.k;
    return(
      <button onClick={()=>it.k==="ayuda"?onAyuda():onNav(it.k)} style={{background:"transparent",
        border:"none",cursor:"pointer",minWidth:0,minHeight:62,padding:"0 4px",
        display:"grid",placeItems:"center",alignContent:"center",gap:SPACING[4],
        textAlign:"center",position:"relative"}}>
        {on&&<span aria-hidden="true" style={{position:"absolute",top:0,
          width:16,height:3,borderRadius:RADII.sm,background:Q.gold}}/>}
        <Ico d={ICONOS[it.k]} on={on} size={20}/>
        <span style={{fontSize:11,lineHeight:1.15,whiteSpace:"nowrap",
          fontWeight:on?700:600,color:on?Q.gold:Q.dim,
          fontFamily:F_BODY}}>{it.l}</span>
      </button>
    );
  };

  return(
    <div style={{flexShrink:0,background:Q.deep,borderTop:`1px solid ${Q.border}`,
      height:"calc(68px + env(safe-area-inset-bottom))",
      padding:"5px 8px env(safe-area-inset-bottom)",
      display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
      {izq.map(it=><Item key={it.k} it={it}/>)}

      {/* Bet Best — la función insignia se lleva el único botón elevado. */}
      <button onClick={()=>onNav("mejorar")} style={{background:"transparent",
        border:"none",cursor:"pointer",minWidth:0,minHeight:62,
        padding:"0 4px 8px",display:"grid",placeItems:"center",
        alignContent:"end",textAlign:"center",position:"relative"}}>
        <span aria-hidden="true" style={{position:"absolute",top:-25,
          width:56,height:56,borderRadius:"50%",display:"grid",
          placeItems:"center",background:Q.gold,
          border:`3px solid ${Q.deep}`,
          boxShadow:activoBB
            ? `0 5px 0 rgba(0,0,0,0.2), 0 0 0 3px ${Q.gold}47`
            : `0 5px 0 rgba(0,0,0,0.2), 0 0 0 1px ${Q.gold}73`}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke={inkOn(Q.gold)} strokeWidth="2.25"
            strokeLinecap="round" strokeLinejoin="round">
            {ICONOS.camara}
          </svg>
        </span>
        <span style={{fontSize:11,lineHeight:1.15,whiteSpace:"nowrap",
          fontWeight:700,color:activoBB?Q.gold:Q.text,
          fontFamily:F_BODY}}>Bet Best</span>
      </button>

      {der.map(it=><Item key={it.k} it={it}/>)}
    </div>
  );
}

// ── Barra lateral de escritorio: mismos destinos que BarraInferior ────
// Below DESKTOP_SHELL_BREAKPOINT (1024px, desktopShellLayout.js — the same
// breakpoint Admin.jsx and Agencia.jsx already share, so this app does not
// add a second value) nothing changes: BarraInferior keeps rendering
// exactly as it did. At and above it, this sidebar replaces the bottom tab
// bar the same way Admin's and Agencia's own desktop sidebars replace
// their tab rows — same shape, so the product reads as one thing. It
// offers exactly the six BarraInferior destinations plus Bet Best, no new
// section: Casino and Casino en Vivo stay ScreenHome-only cards on desktop
// too, same as on a phone, since neither is in the bottom bar this mirrors.
//
// SIDEBAR_ITEMS is declared inside this function, not as a sibling
// top-level const, on purpose: bottomNavSixItems.test.js reads
// BarraInferior's own six-item array by slicing from its `function
// BarraInferior(` to the next top-level `\nfunction `, so any array
// literal left sitting between the two would silently join that slice.
function SidebarDesktop({ actual, onNav, onAyuda }){
  const SIDEBAR_ITEMS = [
    {k:"prematch", l:"Deportes"},
    {k:"builder",  l:"Builder"},
    {k:"mejorar",  l:"Bet Best"},
    {k:"desafios", l:"Desafíos"},
    {k:"mybets",   l:"Boletos"},
    {k:"ayuda",    l:"Ayuda"},
    {k:"cuenta",   l:"Perfil"},
  ];
  return(
    <div style={{
      // Deliberately matching Agencia.jsx's/Admin.jsx's literal sidebar
      // background rather than a Q token — parity with the other two
      // panels' near-black desktop sidebar; keep in sync if theirs changes.
      background:"rgba(6,6,18,0.97)",backdropFilter:"blur(20px)",
      borderRight:`1px solid ${Q.border}`,
      padding:`${SPACING[24]}px ${SPACING[12]}px`,display:"flex",
      flexDirection:"column",alignItems:"stretch",gap:SPACING[8],
      overflowY:"auto",flexShrink:0,gridColumn:"1",gridRow:"1 / span 2",
      position:"sticky",top:0,alignSelf:"start",width:264,height:"100dvh"}}>
      {SIDEBAR_ITEMS.map(it=>{
        const on = actual===it.k;
        return(
          <button key={it.k} onClick={()=>it.k==="ayuda"?onAyuda():onNav(it.k)} style={{
            minWidth:0,background:on?`linear-gradient(135deg,${Q.violet}44,${Q.violet2}22)`:"transparent",
            border:`1px solid ${on?Q.violet:"transparent"}`,borderRadius:RADII.md,cursor:"pointer",
            width:"100%",minHeight:44,padding:"0 12px",display:"flex",flexDirection:"row",
            alignItems:"center",justifyContent:"flex-start",gap:SPACING[12],textAlign:"left"}}>
            <Ico d={it.k==="mejorar"?ICONOS.camara:ICONOS[it.k]} on={on} size={18}/>
            <span style={{color:on?Q.gold:Q.dim,fontSize:13,fontWeight:on?700:600,
              fontFamily:F_BODY}}>{it.l}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── HOME con destacados (combo del día + en vivo) ─────────────
function ScreenHome({ user, onNav, onBet, refCode }){
  const isDesktopShell = useDesktopShellWidth();
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
    // El endpoint devuelve {matches:[...]}, no {sports:[...]}. Por
    // leer la clave equivocada, el inicio nunca mostraba partidos en
    // vivo aunque el servidor los estuviera enviando.
    fetch(`${API}/api/live/combined`).then(r=>r.ok?r.json():null)
      .then(d=>{
        // Los alias sport/h/a existían sólo para alimentar la lista
        // compacta que mostraba estos mismos partidos más abajo. Con esa
        // lista fuera, la grilla lee los campos tal como llegan.
        setLive((d?.matches||[]).slice(0,3));
      }).catch(()=>setLive([]));
  },[]);

  const autenticado = user?.autenticado;
  const mon = user?.moneda || "ARS";
  const comboOdd = combo ? (combo.picks||[]).reduce((a,p)=>a*(p.odd||1),1) : 0;

  return(
    <div style={{padding:"16px 12px 20px"}}>
      {/* Bet Best — la funcion insignia va primero y ocupa el ancho.
          La mascota vive acá adentro, como en el prototipo
          (player-home.html: `.hero-balance` > `.mascot-header`), no en una
          franja aparte arriba: pegada a las esquinas inferior y derecha,
          recortada, y el panel le reserva el lugar (min-height/padding-right,
          los mismos números que .hero-balance:has(.mascot-header) en
          html/styles.css:876-891) para que nunca tape el título ni el botón. */}
      {/* Desktop puts the hero and the three cards on one line: the hero
          takes a double-width first column and the cards become tall and
          narrow beside it. On a phone the hero spans the full row and the
          cards sit three across underneath, which is the same grid with
          different columns rather than a second layout. */}
      <div style={{display:"grid",
        gridTemplateColumns:isDesktopShell?"2fr 1fr 1fr 1fr":"repeat(3,minmax(0,1fr))",
        gap:isDesktopShell?SPACING[16]:SPACING[8],
        alignItems:"stretch",marginBottom:14}}>
      <div onClick={()=>onNav("mejorar")} style={{
        gridColumn:isDesktopShell?"auto":"1 / -1",
        position:"relative",overflow:"hidden",borderRadius:RADII.lg,
        padding:"20px 16px",paddingRight:166,
        minHeight:isDesktopShell?340:244,cursor:"pointer",
        background:`linear-gradient(115deg,${Q.violet2} 0%,${Q.violet} 70%)`}}>
        {/* Stadium photo, fused into the violet rather than sitting on top of
            it: painted at 30% opacity over the panel's own gradient, then the
            same gradient is repainted at 45% opacity above the photo. Net
            effect ≈ (1-0.45)*0.30 ≈ 17% photo, 83% violet — the panel reads
            as textured violet, not as a picture, and the violet still owns
            the block per the brief. Measured against the actual file
            (frontend/public/brand/fondo-hero.webp): even the photo's
            brightest pixels (the upper-right floodlights, sampled near
            #fff) composite to a dark-ink contrast of 7.0–11.6:1 here, and
            the dark left side composites to 4.3–8.6:1 — both comfortably
            above the 3:1 floor inkOn(Q.violet2,Q.violet) already clears for
            the headline and CTA below, so that call did not need to change.
            The vector pitch is gone: the photo is already a stadium pitch,
            so drawing both was noise. */}
        <div aria-hidden="true" style={{position:"absolute",inset:0,
          backgroundImage:"url(/brand/fondo-hero.webp)",backgroundSize:"cover",
          backgroundPosition:"center",opacity:0.3,pointerEvents:"none"}}/>
        <div aria-hidden="true" style={{position:"absolute",inset:0,
          background:`linear-gradient(115deg,${Q.violet2} 0%,${Q.violet} 70%)`,
          opacity:0.45,pointerEvents:"none"}}/>
        {/* size=275 is the mascot's height; at the file's own 540:802
            ratio that rounds to a 185px width, the prototype's own
            .mascot-header width. */}
        <Mascot size={275} style={{position:"absolute",right:-33,bottom:-56,
          opacity:0.96,zIndex:2,clipPath:"inset(0 0 13% 0)"}}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:12,letterSpacing:2,fontWeight:800,color:Q.gold,
            fontFamily:F_BODY}}>BET BEST</div>
          <div style={{fontFamily:F_NUM,fontSize:22,fontWeight:700,color:inkOn(Q.violet2,Q.violet),
            lineHeight:1.15,marginTop:5,whiteSpace:"nowrap"}}>Sacale una foto<br/>a tu boleto</div>
          <div style={{fontSize:12,color:inkOn(Q.violet2,Q.violet),opacity:.8,marginTop:7,lineHeight:1.4,
            maxWidth:230,fontFamily:F_BODY}}>
            Leemos las selecciones y te decimos si podemos pagarte una cuota mejor.</div>
          <div style={{marginTop:12,display:"inline-flex",alignItems:"center",gap:SPACING[8],
            background:Q.goldBg,borderRadius:RADII.sm,padding:"8px 16px"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={inkOn(Q.goldBg)}
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {ICONOS.camara}
            </svg>
            <span style={{color:inkOn(Q.goldBg),fontWeight:700,fontSize:12.5,
              fontFamily:F_BODY}}>Escanear boleto</span>
          </div>
        </div>
      </div>
        <div onClick={()=>onNav("casino")} style={{position:"relative",overflow:"hidden",
          minWidth:0,height:isDesktopShell?"100%":168,
          cursor:"pointer",borderRadius:RADII.lg,
          backgroundImage:"url(/brand/slot.webp)",backgroundSize:"cover",backgroundPosition:"center"}}>
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,opacity:0.32}}/>
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            background:"linear-gradient(180deg,transparent 0%,rgba(6,10,20,.5) 55%,rgba(6,10,20,.92) 100%)"}}/>
          <div style={{position:"relative",height:"100%",display:"flex",
            flexDirection:"column",justifyContent:"space-between",padding:"16px 12px"}}>
            <Icon name="spade" size={24} color={inkOn(Q.void,Q.dark)}/>
            <div>
              <div style={{color:inkOn(Q.void,Q.dark),fontWeight:800,fontSize:14,
                fontFamily:F_BODY}}>Casino</div>
              <div style={{color:inkOn(Q.void,Q.dark),opacity:.85,fontSize:12,
                marginTop:2,lineHeight:1.35,
                fontFamily:F_BODY}}>
                Tragamonedas y mesas</div>
            </div>
          </div>
        </div>
        {/* Bug fix, not only a rename: this card already navigates to
            "casinovivo" — onNav("casinovivo") below — but its label said
            "En vivo", which reads as the sportsbook's live-betting section
            (App.jsx's own ScreenLive/BarraInferior "live" tab), not this
            live-dealer casino screen. Renamed here and in HistorialJuegos'
            NOMBRE.casino_vivo, the only other place in this file that
            labels this same casino_vivo destination. */}
        <div onClick={()=>onNav("casinovivo")} style={{position:"relative",overflow:"hidden",
          minWidth:0,height:isDesktopShell?"100%":168,
          cursor:"pointer",borderRadius:RADII.lg,
          backgroundImage:"url(/brand/live-casino.webp)",backgroundSize:"cover",backgroundPosition:"center"}}>
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            background:`linear-gradient(135deg,${Q.pink},${Q.gold})`,opacity:0.32}}/>
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            background:"linear-gradient(180deg,transparent 0%,rgba(6,10,20,.5) 55%,rgba(6,10,20,.92) 100%)"}}/>
          <div style={{position:"relative",height:"100%",display:"flex",
            flexDirection:"column",justifyContent:"space-between",padding:"16px 12px"}}>
            <Video size={24} color={inkOn(Q.void,Q.dark)} aria-hidden="true"/>
            <div>
              <div style={{color:inkOn(Q.void,Q.dark),fontWeight:800,fontSize:14,
                fontFamily:F_BODY}}>Casino en Vivo</div>
              <div style={{color:inkOn(Q.void,Q.dark),opacity:.85,fontSize:12,
                marginTop:2,lineHeight:1.35,
                fontFamily:F_BODY}}>
                Mesas con crupier</div>
            </div>
          </div>
        </div>
        <div onClick={()=>onNav("desafios")} style={{position:"relative",overflow:"hidden",
          minWidth:0,height:isDesktopShell?"100%":168,
          cursor:"pointer",borderRadius:RADII.lg,
          backgroundImage:"url(/brand/desafios.webp)",backgroundSize:"cover",backgroundPosition:"center"}}>
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,opacity:0.32}}/>
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            background:"linear-gradient(180deg,transparent 0%,rgba(6,10,20,.5) 55%,rgba(6,10,20,.92) 100%)"}}/>
          <div style={{position:"relative",height:"100%",display:"flex",
            flexDirection:"column",justifyContent:"space-between",padding:"16px 12px"}}>
            <Handshake size={22} color={inkOn(Q.void,Q.dark)} aria-hidden="true"/>
            <div>
              <div style={{color:inkOn(Q.void,Q.dark),fontWeight:800,fontSize:14,
                fontFamily:F_BODY}}>Desafíos</div>
              <div style={{color:inkOn(Q.void,Q.dark),opacity:.85,fontSize:12,
                marginTop:2,lineHeight:1.35,
                fontFamily:F_BODY}}>
                Apostá contra otros jugadores</div>
            </div>
          </div>
        </div>
      </div>

      {!autenticado&&(
        <GCard style={{padding:"12px 16px",marginBottom:14}}>
          <div style={{color:Q.muted,fontSize:12,lineHeight:1.45,fontFamily:F_BODY}}>
            Abrí la app desde el bot de Telegram para ver tu saldo y apostar.</div>
        </GCard>
      )}

      {user?.saldo_bono>0&&(
        <GCard glow={Q.gold} style={{padding:SPACING[16],marginBottom:14,
          background:`linear-gradient(135deg,${Q.gold}14,${Q.violet}08)`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:SPACING[4],color:Q.gold,fontSize:12,
                textTransform:"uppercase",letterSpacing:1.5,
                fontWeight:700,fontFamily:F_BODY}}>
                <Gift size={12} color={Q.gold} aria-hidden="true"/>Saldo bono</div>
              <div style={{color:Q.text,fontWeight:900,fontSize:22,marginTop:2,
                fontFamily:F_BODY}}>{money(user.saldo_bono,mon)}</div>
            </div>
            {user?.rollover_pendiente>0&&(
              <div style={{textAlign:"right"}}>
                <div style={{color:Q.muted,fontSize:12,textTransform:"uppercase",
                  fontFamily:F_BODY}}>Para liberar</div>
                <div style={{color:Q.cyan,fontWeight:700,fontSize:14,
                  fontFamily:F_BODY}}>{money(user.rollover_pendiente,mon)}</div>
                <div style={{color:Q.dim,fontSize:12,
                  fontFamily:F_BODY}}>por apostar</div>
              </div>
            )}
          </div>
          <div style={{color:Q.muted,fontSize:12,marginTop:8,lineHeight:1.4,
            fontFamily:F_BODY}}>
            Jugá tu bono. Cuando completes lo que falta apostar, pasa a tu saldo retirable.</div>
        </GCard>
      )}

      {/* Casino, Casino en Vivo y Desafíos: ninguno entra en la barra de
          abajo, así que van acá, los tres en una sola fila. Cada tarjeta
          lleva su propio arte (frontend/public/brand/*.webp) como fondo en
          vez del degradé a mano de antes. Dos capas van encima del arte:
          - un tinte de marca en `background:` (backtick, interpola Q, sigue
            pinneado por screenHomeIconsAndAccents.test.js a un degradé de
            dos tokens Q — nada de hex — para que Casino y Casino en Vivo
            sigan siendo reconocibles por su propio acento y distinguibles
            entre sí);
          - un scrim oscuro real en una segunda capa (comilla simple, sin
            interpolar, así el test de arriba no la toca) que va de
            transparente arriba a casi negro abajo, donde se apoyan el
            título y el subtítulo — necesario porque el arte en sí no es
            uniformemente oscuro (frontend/public/brand/*.webp miden hasta
            luminancia 255 en sus brillos).
          El ink de cada tarjeta ahora se pide contra ese scrim oscuro
          (inkOn(Q.void,Q.dark), ambos casi negros) en vez de contra el
          viejo degradé claro, porque el texto ya no se apoya sobre el
          degradé sino sobre el scrim.
          En una fila las tres a la vez no entran legibles en un teléfono:
          en vez de partirlas en dos filas (que ya no sería "una fila"),
          la fila hace scroll horizontal y cada tarjeta mantiene su ancho
          fijo (152px, el mismo orden de magnitud que las dos tarjetas de
          antes) en vez de encogerse a un tercio del ancho. */}
      {/* On the desktop shell the row has width to spare, so the three
          cards share it as equal columns instead of staying phone-sized
          and leaving the rest of the column empty — the same "mobile
          inside desktop" the panels were just fixed for. */}
      {/* Combo del día destacado */}
      <div style={{display:"flex",alignItems:"center",gap:SPACING[8],color:Q.text,fontWeight:800,fontSize:15,
        marginBottom:8,fontFamily:F_BODY}}>
        <Zap size={16} color={Q.gold} aria-hidden="true"/>Combo del día</div>
      {combo?(
        <GCard glow={Q.gold} onClick={()=>onNav("combo")}
          style={{padding:SPACING[16],marginBottom:16,cursor:"pointer",
          background:`linear-gradient(135deg,${Q.violet}12,${Q.gold}0A)`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{color:Q.text,fontWeight:700,fontSize:14,
              fontFamily:F_BODY}}>{combo.name||combo.nombre}</div>
            <div style={{background:`${Q.gold}22`,border:`1px solid ${Q.gold}`,borderRadius:RADII.md,
              padding:"4px 12px",color:Q.gold,fontWeight:900,fontSize:14,
              fontFamily:F_BODY}}>{fmt(comboOdd)}x</div>
          </div>
          {(combo.picks||[]).slice(0,3).map((p,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",
              fontFamily:F_BODY}}>
              <span style={{color:Q.muted,fontSize:12}}>{p.h||p.home} vs {p.a||p.away}</span>
              <span style={{color:Q.cyan,fontSize:12,fontWeight:600}}>{p.sel} · {fmt(p.odd)}</span>
            </div>
          ))}
          <div style={{marginTop:10,textAlign:"center",color:Q.gold,fontSize:12,fontWeight:700,
            fontFamily:F_BODY}}>Ver y apostar →</div>
        </GCard>
      ):(
        <GCard style={{padding:SPACING[20],marginBottom:16,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>
            Cargando combos del día...</div>
        </GCard>
      )}

      {/* En vivo. Esta grilla vivía arriba del hero y mostraba los mismos
          tres partidos que la lista compacta que había acá: los dos widgets
          leían el mismo `live`, que trae slice(0,3). Queda la grilla — tres
          cuotas por partido, liga y resultado — junto a las demás secciones,
          con el encabezado y el estado vacío que ya tenía esta posición. */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:SPACING[8],color:Q.text,fontWeight:800,fontSize:15,
          fontFamily:F_BODY}}>
          <Icon name="circle-dot" size={16} color={Q.red}/>En vivo ahora</div>
        <button onClick={()=>onNav("live")} style={{background:"transparent",border:"none",
          color:Q.cyan,fontSize:12,fontWeight:700,cursor:"pointer",
          fontFamily:F_BODY}}>Ver todo →</button>
      </div>
      {(live||[]).length>0?(live||[]).map(m=>{
        const h2h=(m.markets||{}).h2h||{};
        const nombres=Object.keys(h2h);
        return(
          <div key={m.id} onClick={()=>onNav("live")}
            style={{background:Q.card||"rgba(255,255,255,0.04)",
              border:`1px solid ${Q.border}`,borderRadius:RADII.md,
              padding:"12px 12px",marginBottom:7,cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"baseline",marginBottom:6}}>
              <span style={{color:Q.dim,fontSize:12,
                fontFamily:F_BODY}}>
                {m.icon} {m.liga}</span>
              {m.scoreStr&&(
                <span style={{color:Q.gold,fontSize:12,fontWeight:700,
                  fontFamily:F_BODY}}>{m.scoreStr}</span>
              )}
            </div>
            <div style={{color:Q.text,fontSize:13,fontWeight:600,
              lineHeight:1.4,fontFamily:F_BODY}}>
              {m.home} <span style={{color:Q.dim}}>vs</span> {m.away}</div>

            {nombres.length>0&&(
              <div style={{display:"flex",gap:SPACING[8],marginTop:8}}>
                {nombres.slice(0,3).map(n=>(
                  <div key={n} style={{flex:1,
                    background:"rgba(255,255,255,0.04)",
                    border:`1px solid ${Q.border}`,borderRadius:RADII.sm,
                    padding:"8px 4px",textAlign:"center",minWidth:0}}>
                    <div style={{color:Q.muted,fontSize:12,
                      overflow:"hidden",textOverflow:"ellipsis",
                      whiteSpace:"nowrap"}}>{n}</div>
                    <div style={{color:Q.gold,fontSize:13,
                      fontWeight:700,
                      fontFamily:F_BODY}}>
                      {fmt(h2h[n])}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }):(
        <GCard style={{padding:SPACING[20],textAlign:"center"}}>
          <Mascot size={64} style={{margin:"0 auto 8px"}}/>
          <div style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>
            No hay eventos en vivo ahora</div>
        </GCard>
      )}

      {/* Accesos rápidos */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:SPACING[8],marginTop:16}}>
        {[["prematch","Deportes",Q.violet],["live","En vivo",Q.pink],
          ["mybets","Mis boletos",Q.cyan],["cuenta","Mi cuenta",Q.violet2]].map(([k,l,c])=>(
          <button key={k} onClick={()=>onNav(k)} style={{
            background:`${c}14`,border:`1px solid ${c}`,borderRadius:RADII.lg,padding:"16px 12px",
            cursor:"pointer",color:Q.text,fontSize:12,fontWeight:700,
            fontFamily:F_BODY}}>{l}</button>
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
    <GCard glow={Q.green} style={{padding:SPACING[16],marginBottom:10}}>
      <div style={{color:Q.green,fontWeight:800,fontSize:14,marginBottom:8,textAlign:"center",
        fontFamily:F_BODY}}>Transferí a este CVU</div>
      <div style={{color:Q.muted,fontSize:12,textAlign:"center",marginBottom:8,
        fontFamily:F_BODY}}>
        Desde tu CUIT, ${res.monto?.toLocaleString("es-AR")}. Se acredita solo al llegar.</div>
      <div style={{background:ov(0.06),border:`1px solid ${Q.green}`,
        borderRadius:RADII.md,padding:"12px",textAlign:"center",marginBottom:6}}>
        <div style={{color:Q.text,fontWeight:900,fontSize:18,letterSpacing:1,
          fontFamily:F_BODY,wordBreak:"break-all"}}>{res.cvu}</div>
        {res.alias&&<div style={{color:Q.muted,fontSize:12,marginTop:4}}>Alias: {res.alias}</div>}
      </div>
      <button onClick={()=>{setEstado("idle");setAbierto(false);setMonto("");setCuit("");setRes(null);}}
        style={{width:"100%",background:"transparent",border:`1px solid ${Q.border}`,
          borderRadius:RADII.md,padding:"8px",color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:F_BODY}}>Listo</button>
    </GCard>
  );

  if(!abierto) return(
    <button onClick={()=>setAbierto(true)} style={{width:"100%",
      background:`${Q.green}14`,border:`1px solid ${Q.green}`,borderRadius:RADII.lg,padding:"12px",
      color:Q.green,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,
      fontFamily:F_BODY}}><Icon name="arrow-up-right" size={13}/> Cargar por transferencia</button>
  );

  return(
    <GCard glow={Q.green} style={{padding:SPACING[16],marginBottom:10}}>
      <div style={{color:Q.green,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:F_BODY}}><Icon name="arrow-up-right" size={13}/> Cargar por transferencia</div>
      <input value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))}
        placeholder={`Monto en ${mon}`} inputMode="numeric"
        style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:RADII.md,padding:"12px 16px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:F_BODY}}/>
      <input value={cuit} onChange={e=>setCuit(e.target.value.replace(/\D/g,""))}
        placeholder="Tu CUIT (11 dígitos)" inputMode="numeric"
        style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:RADII.md,padding:"12px 16px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:F_BODY}}/>
      {msg&&<div style={{color:Q.red,fontSize:12,marginBottom:8,textAlign:"center",
        fontFamily:F_BODY}}>{msg}</div>}
      <div style={{display:"flex",gap:SPACING[8]}}>
        <button onClick={()=>{setAbierto(false);setMsg("");}} style={{flex:1,background:"transparent",
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"12px",color:Q.muted,fontSize:13,
          cursor:"pointer",fontFamily:F_BODY}}>Cancelar</button>
        <button onClick={pedir} disabled={estado==="proc"} style={{flex:1,
          background:`linear-gradient(135deg,${Q.green},${Q.cyan})`,border:"none",borderRadius:RADII.md,
          padding:"12px",color:inkOn(Q.green, Q.cyan),fontWeight:800,fontSize:13,cursor:"pointer",
          fontFamily:F_BODY}}>{estado==="proc"?"...":"Obtener CVU"}</button>
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
    <GCard glow={Q.cyan} style={{padding:SPACING[16],marginBottom:10,textAlign:"center"}}>
      <div style={{marginBottom:6}}><Icon name="landmark" size={36}/></div>
      <div style={{color:Q.cyan,fontWeight:800,fontSize:14,
        fontFamily:F_BODY}}>{ok.mensaje}</div>
      <button onClick={()=>{setEstado("idle");setAbierto(false);setMonto("");setDestino("");setOk(null);}}
        style={{marginTop:12,background:"transparent",border:`1px solid ${Q.border}`,borderRadius:RADII.md,
          padding:"8px 20px",color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:F_BODY}}>Listo</button>
    </GCard>
  );

  if(!abierto) return(
    <button onClick={()=>setAbierto(true)} style={{width:"100%",
      background:`${Q.cyan}14`,border:`1px solid ${Q.cyan}`,borderRadius:RADII.lg,padding:"12px",
      color:Q.cyan,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,
      fontFamily:F_BODY}}><Icon name="arrow-down-left" size={13}/> Retirar a mi banco</button>
  );

  return(
    <GCard glow={Q.cyan} style={{padding:SPACING[16],marginBottom:10}}>
      <div style={{color:Q.cyan,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:F_BODY}}><Icon name="arrow-down-left" size={13}/> Retirar a mi banco</div>
      <input value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))}
        placeholder={`Monto en ${mon}`} inputMode="numeric"
        style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:RADII.md,padding:"12px 16px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:F_BODY}}/>
      <input value={destino} onChange={e=>setDestino(e.target.value.replace(/\D/g,""))}
        placeholder="Tu CVU/CBU (22 dígitos)" inputMode="numeric"
        style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:RADII.md,padding:"12px 16px",color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:F_BODY}}/>
      {msg&&<div style={{color:Q.red,fontSize:12,marginBottom:8,textAlign:"center",
        fontFamily:F_BODY}}>{msg}</div>}
      <div style={{display:"flex",gap:SPACING[8]}}>
        <button onClick={()=>{setAbierto(false);setMsg("");}} style={{flex:1,background:"transparent",
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"12px",color:Q.muted,fontSize:13,
          cursor:"pointer",fontFamily:F_BODY}}>Cancelar</button>
        <button onClick={pedir} disabled={estado==="proc"} style={{flex:1,
          background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,border:"none",borderRadius:RADII.md,
          padding:"12px",color:inkOn(Q.violet, Q.cyan),fontWeight:700,fontSize:13,cursor:"pointer",
          fontFamily:F_BODY}}>{estado==="proc"?"...":"Solicitar"}</button>
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
    <GCard glow={Q.gold} style={{padding:SPACING[20],marginBottom:10,textAlign:"center"}}>
      <div style={{marginBottom:6}}><Icon name="receipt-text" size={40}/></div>
      <div style={{color:Q.gold,fontWeight:800,fontSize:15,
        fontFamily:F_BODY}}>Retiro solicitado</div>
      <div style={{color:Q.muted,fontSize:12,margin:"8px 0",
        fontFamily:F_BODY}}>
        Mostrá este código en tu agencia para cobrar {money(res.monto,mon)}:</div>
      <div style={{background:ov(0.06),border:`1px solid ${Q.gold}`,
        borderRadius:RADII.lg,padding:"12px",color:Q.gold,fontWeight:900,fontSize:24,
        letterSpacing:3,fontFamily:F_BODY}}>{res.code}</div>
      <button onClick={()=>{setEstado("idle");setAbierto(false);setMonto("");setRes(null);}}
        style={{marginTop:12,background:"transparent",border:`1px solid ${Q.border}`,
          borderRadius:RADII.md,padding:"8px 20px",color:Q.muted,fontSize:12,cursor:"pointer",
          fontFamily:F_BODY}}>Listo</button>
    </GCard>
  );

  if(!abierto) return(
    <button onClick={()=>setAbierto(true)} style={{width:"100%",
      background:`${Q.gold}14`,border:`1px solid ${Q.gold}`,borderRadius:RADII.lg,padding:"12px",
      color:Q.gold,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,
      fontFamily:F_BODY}}><Icon name="wallet-cards" size={13}/> Retirar</button>
  );

  return(
    <GCard glow={Q.gold} style={{padding:SPACING[16],marginBottom:10}}>
      <div style={{color:Q.gold,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:F_BODY}}><Icon name="wallet-cards" size={13}/> Retirar en mostrador</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:10,
        fontFamily:F_BODY}}>
        Se descuenta de tu saldo y te damos un código para cobrar en efectivo en tu agencia.</div>
      <input value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))}
        placeholder={`Monto en ${mon}`} inputMode="numeric"
        style={{width:"100%",background:ov(0.05),
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"12px 16px",
          color:Q.text,fontSize:18,marginBottom:10,
          fontFamily:F_BODY}}/>
      {msg&&<div style={{color:Q.red,fontSize:12,marginBottom:8,textAlign:"center",
        fontFamily:F_BODY}}>{msg}</div>}
      <div style={{display:"flex",gap:SPACING[8]}}>
        <button onClick={()=>{setAbierto(false);setMsg("");setEstado("idle");}}
          style={{flex:1,background:"transparent",border:`1px solid ${Q.border}`,
            borderRadius:RADII.md,padding:"12px",color:Q.muted,fontSize:13,cursor:"pointer",
            fontFamily:F_BODY}}>Cancelar</button>
        <button onClick={pedir} disabled={estado==="proc"}
          style={{flex:1,background:`linear-gradient(135deg,${Q.gold},${Q.amber||Q.gold})`,
            border:"none",borderRadius:RADII.md,padding:"12px",color:inkOn(Q.gold, Q.amber||Q.gold),fontWeight:800,
            fontSize:13,cursor:"pointer",fontFamily:F_BODY}}>
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
    <GCard glow={Q.green} style={{padding:SPACING[16],marginBottom:10,textAlign:"center"}}>
      <div style={{color:Q.green,fontWeight:700,fontSize:14,
        fontFamily:F_BODY}}>✓ Cuenta vinculada</div>
    </GCard>
  );

  if(estado==="match"&&match) return(
    <GCard glow={Q.cyan} style={{padding:SPACING[16],marginBottom:10}}>
      <div style={{color:Q.text,fontSize:13,textAlign:"center",lineHeight:1.6,
        fontFamily:F_BODY}}>
        Encontramos <span style={{color:Q.cyan,fontWeight:700}}>{match.nombre}</span> en
        <span style={{color:Q.cyan,fontWeight:700}}> {match.agencia}</span> con saldo
        <span style={{color:Q.green,fontWeight:700}}> {money(match.saldo,mon)}</span>.
        ¿Sos vos?</div>
      <div style={{display:"flex",gap:SPACING[8],marginTop:12}}>
        <button onClick={()=>{setEstado("idle");setMatch(null);}}
          style={{flex:1,background:"transparent",border:`1px solid ${Q.border}`,
            borderRadius:RADII.md,padding:"12px",color:Q.muted,fontSize:13,cursor:"pointer",
            fontFamily:F_BODY}}>No</button>
        <button onClick={confirmar}
          style={{flex:1,background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            border:"none",borderRadius:RADII.md,padding:"12px",color:inkOn(Q.violet, Q.cyan),fontWeight:700,
            fontSize:13,cursor:"pointer",fontFamily:F_BODY}}>
          Sí, vincular</button>
      </div>
    </GCard>
  );

  if(!abierto) return(
    <button onClick={()=>setAbierto(true)} style={{width:"100%",
      background:`${Q.cyan}14`,border:`1px solid ${Q.cyan}`,borderRadius:RADII.lg,padding:"12px",
      color:Q.cyan,fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,
      fontFamily:F_BODY}}><Link size={13}/> Vincular cuenta de mostrador</button>
  );

  return(
    <GCard glow={Q.cyan} style={{padding:SPACING[16],marginBottom:10}}>
      <div style={{color:Q.cyan,fontWeight:700,fontSize:14,marginBottom:8,
        fontFamily:F_BODY}}><Link size={13}/> Vincular cuenta</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:10,
        fontFamily:F_BODY}}>
        Si tenés saldo cargado en una agencia, ingresá el teléfono con el que te registraron.</div>
      <input value={tel} onChange={e=>setTel(e.target.value)}
        placeholder="Ej: 11 2345 6789" inputMode="tel"
        style={{width:"100%",background:ov(0.05),
          border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"12px 16px",
          color:Q.text,fontSize:16,marginBottom:10,
          fontFamily:F_BODY}}/>
      {msg&&<div style={{color:Q.red,fontSize:12,marginBottom:8,textAlign:"center",
        fontFamily:F_BODY}}>{msg}</div>}
      <div style={{display:"flex",gap:SPACING[8]}}>
        <button onClick={()=>{setAbierto(false);setMsg("");setEstado("idle");}}
          style={{flex:1,background:"transparent",border:`1px solid ${Q.border}`,
            borderRadius:RADII.md,padding:"12px",color:Q.muted,fontSize:13,cursor:"pointer",
            fontFamily:F_BODY}}>Cancelar</button>
        <button onClick={buscar} disabled={estado==="proc"}
          style={{flex:1,background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            border:"none",borderRadius:RADII.md,padding:"12px",color:inkOn(Q.violet, Q.cyan),fontWeight:700,
            fontSize:13,cursor:"pointer",fontFamily:F_BODY}}>
          {estado==="proc"?"...":"Buscar"}</button>
      </div>
    </GCard>
  );
}

function ScreenCuenta({ user, onNav, onJR, onHist }){
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
    <div style={{padding:"16px 12px 20px"}}>
      <GCard glow={Q.violet} style={{padding:SPACING[20],marginBottom:14,
        background:`linear-gradient(135deg,${Q.violet}18,${Q.cyan}0C)`}}>
        <div style={{color:Q.muted,fontSize:12,textTransform:"uppercase",letterSpacing:1.5,
          fontFamily:F_BODY}}>Mi cuenta</div>
        <div style={{color:Q.text,fontWeight:800,fontSize:17,marginTop:2,
          fontFamily:F_BODY}}>{user?.nombre||"Jugador"}</div>
        {saldo!=null?(
          <div style={{color:Q.green,fontWeight:900,fontSize:26,marginTop:6,
            fontFamily:F_BODY}}>{money(saldo,mon)}<span style={{fontSize:12,color:Q.muted,fontWeight:400}}> {mon}</span></div>
        ):(
          <div style={{color:Q.muted,fontSize:13,marginTop:6,
            fontFamily:F_BODY}}>Abrí desde el bot para ver tu saldo</div>
        )}
      </GCard>

      {user?.psp_activa&&<CargaDigitalBox user={user} moneda={mon}/>}
      {user?.psp_activa&&saldo!=null&&<RetiroDigitalBox user={user} moneda={mon} saldo={saldo}/>}
      {saldo!=null&&<RetiroBox moneda={mon} saldo={saldo}
        onHecho={()=>{ if(window.Telegram?.WebApp){ try{ setTimeout(()=>window.location.reload(),1400); }catch(e){} } }}/>}
      {user?.autenticado&&<VincularBox moneda={mon}/>}

      <div style={{color:Q.text,fontWeight:800,fontSize:14,marginBottom:8,
        fontFamily:F_BODY}}>Movimientos</div>
      {movs===null&&<GCard style={{padding:SPACING[20],textAlign:"center"}}>
        <div style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>Cargando...</div></GCard>}
      {movs&&movs.length===0&&<GCard style={{padding:SPACING[20],textAlign:"center"}}>
        <div style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>Sin movimientos todavía</div></GCard>}
      {(movs||[]).map((m,i)=>(
        <GCard key={i} style={{padding:"12px 12px",marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:F_BODY}}>{m.tipo||m.detalle||"Movimiento"}</div>
              <div style={{color:Q.muted,fontSize:12}}>{m.fecha||""}</div>
            </div>
            <div style={{color:(m.monto||0)>=0?Q.green:Q.red,fontWeight:700,fontSize:13,
              fontFamily:F_BODY}}>{(m.monto||0)>=0?"+":""}{money(m.monto,mon)}</div>
          </div>
        </GCard>
      ))}

      <div style={{color:Q.dim,fontSize:12,textAlign:"center",marginTop:16,lineHeight:1.5,
        fontFamily:F_BODY}}>
        Para cargar saldo, acercate a tu agencia.</div>
      {/* Juego responsable: tiene que estar visible y accesible, no
          escondido en un menú. Es requisito en toda jurisdicción
          regulada, y además es lo correcto. */}
      {user?.autenticado&&onHist&&(
        <button onClick={onHist}
          style={{width:"100%",marginTop:14,background:"transparent",
            border:`1px solid ${Q.border}`,borderRadius:RADII.md,
            padding:"16px",cursor:"pointer",textAlign:"left",
            fontFamily:F_BODY}}>
          <div style={{color:Q.text,fontSize:13.5,fontWeight:600}}>
            <Icon name="clipboard-list" size={13}/> Mi historial</div>
          <div style={{color:Q.muted,fontSize:12,marginTop:3,
            lineHeight:1.45}}>
            Todo lo que jugaste, con fecha y hora</div>
        </button>
      )}

      {user?.autenticado&&onJR&&(
        <button onClick={onJR}
          style={{width:"100%",marginTop:14,background:"transparent",
            border:`1px solid ${Q.border}`,borderRadius:RADII.md,
            padding:"16px",cursor:"pointer",textAlign:"left",
            fontFamily:F_BODY}}>
          <div style={{color:Q.text,fontSize:13.5,fontWeight:600}}>
            <Icon name="shield-check" size={13}/> Juego responsable</div>
          <div style={{color:Q.muted,fontSize:12,marginTop:3,
            lineHeight:1.45}}>
            Poné tus límites o cerrá tu cuenta por un tiempo</div>
        </button>
      )}

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
      // Antes no se miraba si el pedido había fallado: ante un error
      // el código seguía igual y volvía al formulario en blanco, sin
      // decir nada. El cliente no tenía forma de saber qué pasó.
      if(!r.ok){
        throw new Error(d.detail||`No se pudo registrar (${r.status})`);
      }
      if(d.match){ setMatch(d.match); setPaso("match"); }
      else { onListo(); }   // registrado, sin match: entra directo
    }catch(e){
      setMsg(e.message==="Failed to fetch"
        ? "Sin conexión. Probá de nuevo."
        : (e.message||"Error, probá de nuevo"));
    }
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
    border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"12px 16px",
    color:Q.text,fontSize:16,marginBottom:10,fontFamily:F_BODY};

  if(paso==="match"&&match){
    return(
      <div style={{padding:"32px 16px",minHeight:"100%",display:"flex",
        flexDirection:"column",justifyContent:"center"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{marginBottom:8}}><Link size={44} color={Q.text}/></div>
          <div style={{color:Q.text,fontWeight:800,fontSize:18,
            fontFamily:F_BODY}}>¿Sos vos?</div>
        </div>
        <GCard glow={Q.cyan} style={{padding:SPACING[20],marginBottom:16}}>
          <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,textAlign:"center",
            fontFamily:F_BODY}}>
            Encontramos una cuenta con tu teléfono en
            <span style={{color:Q.cyan,fontWeight:700}}> {match.agencia}</span>:
            <div style={{color:Q.text,fontWeight:700,fontSize:16,margin:"8px 0"}}>{match.nombre}</div>
            con saldo <span style={{color:Q.green,fontWeight:700}}>{ars(match.saldo)}</span>.
            <div style={{marginTop:8}}>Si sos vos, la conectamos y usás ese saldo acá.</div>
          </div>
        </GCard>
        <button onClick={()=>confirmarMatch(true)} disabled={proc} style={{
          width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:RADII.lg,padding:"16px",color:inkOn(Q.violet, Q.cyan),fontWeight:700,fontSize:15,
          cursor:"pointer",marginBottom:8,fontFamily:F_BODY}}>
          {proc?"Conectando...":"Sí, soy yo · Conectar"}</button>
        <button onClick={()=>confirmarMatch(false)} disabled={proc} style={{
          width:"100%",background:"transparent",border:`1px solid ${Q.border}`,
          borderRadius:RADII.lg,padding:"12px",color:Q.muted,fontSize:13,cursor:"pointer",
          fontFamily:F_BODY}}>No soy yo, seguir con cuenta nueva</button>
        {msg&&<div style={{color:Q.red,fontSize:12,textAlign:"center",marginTop:10,
          fontFamily:F_BODY}}>{msg}</div>}
      </div>
    );
  }

  return(
    <div style={{padding:"24px 16px",minHeight:"100%"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{width:56,height:56,borderRadius:RADII.lg,margin:"0 auto 12px",
          background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          display:"flex",alignItems:"center",justifyContent:"center",
          color:inkOn(Q.violet, Q.cyan),fontSize:28,
          boxShadow:`0 8px 30px ${Q.violet}55`}}>⬡</div>
        <div style={{color:Q.text,fontWeight:800,fontSize:20,
          fontFamily:F_BODY}}>Creá tu cuenta</div>
        <div style={{color:Q.muted,fontSize:13,marginTop:4,
          fontFamily:F_BODY}}>
          Con tus datos podés jugar y conectar tu saldo</div>
      </div>

      <div style={{color:Q.muted,fontSize:12,marginBottom:3,marginLeft:2,
        fontFamily:F_BODY}}>Nombre y apellido</div>
      <input value={nombre} onChange={e=>setNombre(e.target.value)} style={inp}
        placeholder="Tu nombre completo"/>

      <div style={{color:Q.muted,fontSize:12,marginBottom:3,marginLeft:2,
        fontFamily:F_BODY}}>Teléfono</div>
      <input value={telefono} onChange={e=>setTelefono(e.target.value)} style={inp}
        placeholder="Ej: 11 2345 6789" inputMode="tel"/>

      <div style={{color:Q.muted,fontSize:12,marginBottom:3,marginLeft:2,
        fontFamily:F_BODY}}>Email (opcional)</div>
      <input value={email} onChange={e=>setEmail(e.target.value)} style={inp}
        placeholder="tu@email.com" inputMode="email"/>

      <div style={{color:Q.muted,fontSize:12,marginBottom:3,marginLeft:2,
        fontFamily:F_BODY}}>Moneda</div>
      <select value={moneda} onChange={e=>setMoneda(e.target.value)}
        style={{...inp,color:moneda?Q.text:Q.muted}}>
        <option value="">Detectar automáticamente por tu país</option>
        {monedas.map(m=>(
          <option key={m.codigo} value={m.codigo}>{m.simbolo} {m.codigo} — {m.nombre}</option>
        ))}
      </select>

      <button onClick={enviar} disabled={proc} style={{
        width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        border:"none",borderRadius:RADII.lg,padding:"16px",color:inkOn(Q.violet, Q.cyan),fontWeight:700,fontSize:15,
        cursor:"pointer",marginTop:6,fontFamily:F_BODY,
        boxShadow:`0 6px 24px ${Q.violet}55`}}>
        {proc?"Creando...":"Crear cuenta"}</button>
      {msg&&<div style={{color:Q.red,fontSize:12,textAlign:"center",marginTop:10,
        fontFamily:F_BODY}}>{msg}</div>}
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
      <div style={{position:"relative",zIndex:1,padding:"16px 12px 40px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{color:Q.text,fontWeight:800,fontSize:18,
            fontFamily:F_BODY}}>Bet Builder</div>
          <button onClick={()=>onNav("home")} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:13,cursor:"pointer",fontFamily:F_BODY}}>✕ Cerrar</button>
        </div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:14,
          fontFamily:F_BODY}}>
          Armá tu apuesta: elegí partidos y sumá selecciones. La cuota se calcula sola.</div>

        {/* Buscador */}
        <div style={{display:"flex",alignItems:"center",gap:SPACING[8],
          background:ov(0.05),border:`1px solid ${Q.border}`,
          borderRadius:RADII.md,padding:"8px 12px",marginBottom:8}}>
          <Icon name="search" size={14} color={Q.muted}/>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar equipo..."
            style={{background:"transparent",border:"none",color:Q.text,fontSize:14,flex:1,minWidth:0,
              fontFamily:F_BODY}}/>
          {busqueda&&<button onClick={()=>setBusqueda("")} style={{background:"transparent",
            border:"none",color:Q.muted,fontSize:16,cursor:"pointer",padding:0}}>✕</button>}
        </div>

        {/* Filtro de deporte */}
        <div style={{display:"flex",gap:SPACING[4],overflowX:"auto",marginBottom:12,paddingBottom:SPACING[4]}}>
          <button onClick={()=>setSport(null)} style={{
            background:!sport?`${Q.violet}44`:ov(0.04),
            border:`1px solid ${!sport?Q.cyan:Q.border}`,borderRadius:RADII.xl,padding:"4px 12px",
            cursor:"pointer",color:!sport?Q.cyan:Q.muted,fontSize:12,fontWeight:700,
            whiteSpace:"nowrap",flexShrink:0,fontFamily:F_BODY}}>Todos</button>
          {sports.map(sp=>(
            <button key={sp.name} onClick={()=>setSport(sp.name)} style={{
              background:sport===sp.name?`${Q.violet}44`:ov(0.04),
              border:`1px solid ${sport===sp.name?Q.cyan:Q.border}`,borderRadius:RADII.xl,padding:"4px 12px",
              cursor:"pointer",color:sport===sp.name?Q.cyan:Q.muted,fontSize:12,fontWeight:700,
              whiteSpace:"nowrap",flexShrink:0,fontFamily:F_BODY}}>
              {sp.icon} {sp.name}</button>
          ))}
        </div>

        {loading&&<div style={{color:Q.muted,textAlign:"center",padding:SPACING[32],
          fontFamily:F_BODY}}>Cargando partidos...</div>}

        {displaySports.map(sp=>(
          <div key={sp.name} style={{marginBottom:14}}>
            <div style={{color:Q.cyan,fontSize:12,fontWeight:700,marginBottom:6,marginLeft:2,
              fontFamily:F_BODY}}>{sp.icon} {sp.name}</div>
            {(sp.events||[]).map(ev=>(
              <GCard key={ev.id} style={{padding:SPACING[12],marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:SPACING[8],minWidth:0,flex:1}}>
                    <TeamLogo name={ev.h||ev.home} size={24}/>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{color:Q.text,fontSize:12,fontWeight:600,
                        fontFamily:F_BODY,whiteSpace:"nowrap",
                        overflow:"hidden",textOverflow:"ellipsis"}}>
                        {ev.h||ev.home} vs {ev.a||ev.away}</div>
                      <div style={{color:Q.muted,fontSize:12}}>{horaLocal(ev)}</div>
                    </div>
                    <TeamLogo name={ev.a||ev.away} size={24}/>
                  </div>
                </div>
                <OddsButtons ev={ev} market="h2h" bets={picks} onToggle={toggle}/>
                <button onClick={()=>toggleExpand(ev.id)} style={{width:"100%",
                  background:"transparent",border:`1px solid ${Q.dim}`,borderRadius:RADII.md,padding:"4px",
                  cursor:"pointer",color:Q.dim,fontSize:12,marginTop:6,
                  fontFamily:F_BODY}}>
                  {expandedEvents[ev.id]?"▲ Menos mercados":"▼ Todos los mercados"}</button>
                {expandedEvents[ev.id]&&<MercadosEvento ev={ev} bets={picks} onToggle={toggle}/>}
              </GCard>
            ))}
          </div>
        ))}
      </div>

      {/* CARRITO VISIBLE fijo abajo, arriba de la barra inferior —
          BarraInferior mide calc(68px + env(safe-area-inset-bottom)). */}
      <div style={{position:"fixed",left:0,right:0,
        bottom:"calc(68px + env(safe-area-inset-bottom))",zIndex:50,
        background:"rgba(6,6,18,0.98)",borderTop:`1px solid ${Q.violet}55`,
        maxWidth:520,margin:"0 auto",padding:"12px 16px 16px",
        maxHeight:"46vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:14,
            fontFamily:F_BODY}}><Icon name="ticket" size={13}/> Tu apuesta · {picks.length} {picks.length===1?"pick":"picks"}</div>
          {picks.length>0&&<button onClick={onLimpiar} style={{background:"transparent",border:"none",
            color:Q.red,fontSize:12,cursor:"pointer",fontFamily:F_BODY}}>Vaciar</button>}
        </div>

        {picks.length===0?(
          <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:"12px 0",
            fontFamily:F_BODY}}>Tocá las cuotas para sumar picks</div>
        ):(
          <>
            <div style={{marginBottom:10}}>
              {picks.map((p,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"8px 0",borderBottom:i<picks.length-1?`1px solid ${Q.border}`:"none"}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontSize:12,fontWeight:600,
                      fontFamily:F_BODY,whiteSpace:"nowrap",
                      overflow:"hidden",textOverflow:"ellipsis"}}>{p.h} vs {p.a}</div>
                    <div style={{color:Q.cyan,fontSize:12,
                      fontFamily:F_BODY}}>{p.label} · {parseFloat(p.odd).toFixed(2)}</div>
                  </div>
                  <button onClick={()=>onQuitar(p.id,p.label)} style={{background:"transparent",
                    border:"none",color:Q.red,fontSize:16,cursor:"pointer",padding:"0 4px"}}>✕</button>
                </div>
              ))}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>Cuota total</span>
              <span style={{color:Q.gold,fontWeight:800,fontSize:18,
                fontFamily:F_BODY}}>{tot.toFixed(2)}x</span>
            </div>

            {mismoPartido&&margenAplicado>0&&(
              <div style={{background:`${Q.cyan}0C`,border:`1px solid ${Q.cyan}44`,borderRadius:RADII.md,
                padding:"8px 12px",marginBottom:8,fontSize:12,color:Q.cyan,lineHeight:1.4,
                fontFamily:F_BODY}}>
                <Link size={13}/> Combinada del mismo partido · cuota ajustada por correlación</div>
            )}

            <input value={monto} onChange={e=>setMonto(e.target.value.replace(/\D/g,""))}
              placeholder="Monto a apostar" inputMode="numeric"
              style={{width:"100%",background:ov(0.05),border:`1px solid ${Q.border}`,
                borderRadius:RADII.md,padding:"12px 16px",color:Q.text,fontSize:16,marginBottom:8,
                fontFamily:F_BODY}}/>

            {montoNum>0&&(
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <span style={{color:Q.muted,fontSize:12,fontFamily:F_BODY}}>Ganancia posible</span>
                <span style={{color:Q.green,fontWeight:800,fontSize:16,
                  fontFamily:F_BODY}}>{money(ganancia,"ARS")}</span>
              </div>
            )}

            <div style={{display:"flex",gap:SPACING[8]}}>
              <button disabled={genLocal} onClick={async()=>{
                setGenLocal(true); await onLocal(picks); setGenLocal(false);
              }} style={{flex:"0 0 auto",background:ov(0.05),
                border:`1px solid ${Q.border}`,borderRadius:RADII.md,padding:"0 16px",cursor:"pointer",
                color:Q.muted,fontSize:12,fontFamily:F_BODY}}>
                {genLocal?"...":<><Store size={12}/> Local</>}</button>
              <button onClick={()=>onBet(picks,montoNum||0,tot)} disabled={montoNum<=0}
                style={{flex:1,background:montoNum>0?`linear-gradient(135deg,${Q.violet},${Q.cyan})`:ov(0.06),
                  border:"none",borderRadius:RADII.md,padding:"12px",color:montoNum>0?inkOn(Q.violet, Q.cyan):Q.text,fontWeight:800,fontSize:14,
                  cursor:montoNum>0?"pointer":"default",fontFamily:F_BODY}}>
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
  // Below 1024px (desktopShellLayout's own breakpoint) nothing changes —
  // BarraInferior keeps rendering exactly as it did. At and above it,
  // SidebarDesktop replaces the bottom tab bar, the same swap Admin.jsx
  // and Agencia.jsx already make for their own tab rows.
  const isDesktop = useDesktopShellWidth();
  // Ayuda ahora vive en la barra inferior (T5): el padre guarda si el
  // chat está abierto, la barra lo abre, BotonAyuda solo dibuja el modal.
  const [ayudaAbierto,setAyudaAbierto]=useState(false);
  // Si llegó por un enlace compartido, se cuenta la visita para que
  // le paguen al que lo compartió.
  useEffect(()=>{ registrarVisitaCompartida(); },[]);
  // Lo escaneado en Bet Best. Vive acá para que no se pierda si el
  // cliente sale de la pantalla antes de confirmar.
  const [escaneo,setEscaneo]=useState(null);

  // Se sobrescribe entero al confirmar la apuesta; el 0 evita que
  // quede un monto de otra moneda si algo falla antes.
  const [betData,setBetData]=useState({bets:[],stake:0,odd:1,code:""});
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
    // Cargar los picks de un combo IA al builder para editarlos.
    // Mismo mapeo que al apostar el combo directo: editarlo no puede
    // costarle al boleto el evento, el mercado ni la hora de inicio.
    setBuilderPicks(picksDeCombo(picks));
    setScreen("builder");
  };
  // La barra de pasos es un atajo de desarrollo: se ve con ?dev=1
  const [verPasos]=useState(()=>
    new URLSearchParams(window.location.search).get("dev")==="1");
  const user = useUsuario();

  // Súper Bono: la app avisa que está adentro y consulta si le tocó.
  // Va DESPUÉS de declarar user: antes reventaba al abrir porque el
  // efecto lo leía cuando todavía no existía.
  const [superBono,setSuperBono]=useState(null);
  const [verJR,setVerJR]=useState(false);
  const [verHist,setVerHist]=useState(false);
  useEffect(()=>{
    if(!user?.id) return;
    const latir=()=>{
      fetch(`${API}/api/presencia`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, origen:"app"})})
        .catch(()=>{});
      fetch(`${API}/api/superbono/mio/${user.id}`)
        .then(r=>r.ok?r.json():null)
        .then(d=>{ if(d?.gano) setSuperBono(d); })
        .catch(()=>{});
    };
    latir();
    // Cada dos minutos: suficiente para que el reparto lo encuentre
    // conectado sin castigar la batería.
    const t=setInterval(latir,120000);
    return()=>clearInterval(t);
  },[user?.id]);
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
  // Selecciones a restaurar cuando el cliente elige "Repetir apuesta".
  // Se limpian apenas la pantalla las toma, para que no reaparezcan
  // la próxima vez que entre a Deportes.
  const [betsARestaurar,setBetsARestaurar]=useState(null);

  const repetirApuesta=()=>{
    const previas = betData?.bets || [];
    if(!previas.length){ setScreen("prematch"); return; }
    setBetsARestaurar(previas);
    setScreen("prematch");
  };
  const confirmBet=(bets,stake,odd)=>{
    setErrorGlobal("");
    setConfirmando({bets,stake,odd});
  };
  const apuestaLista=(data,modo)=>{
    setConfirmando(null);
    setBetData({bets:confirmando?.bets||[], stake:data.stake||0,
                odd:data.odd_total||1, code:data.code, modo});
    setScreen("confirmed");
    // El saldo cambió: si no se vuelve a pedir, sigue mostrando el
    // número de antes de apostar hasta que recarguen la página.
    user?.refrescar?.();
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

  // Shared by BarraInferior (below 1024px) and SidebarDesktop (at and
  // above it) — one screen->active-item mapping, not two that could drift.
  const navActual = ayudaAbierto ? "ayuda"
    : ["prematch","builder","combo","mybets","mejorar","desafios","cuenta"].includes(screen)?screen
      :(screen==="live"?"prematch":"");

  return(
    <div style={isDesktop ? {
      width:"100%",height:"100dvh",display:"grid",
      gridTemplateColumns:"264px minmax(0,1fr)",
      background:Q.void,fontFamily:F_BODY,overflow:"hidden",
      maxWidth:1600,margin:"0 auto",
    } : {maxWidth:520,margin:"0 auto",
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

      {isDesktop&&<SidebarDesktop actual={navActual} onNav={setScreen}
        onAyuda={()=>setAyudaAbierto(true)}/>}

      {/* Header + pantallas: en escritorio, la columna de la derecha de la
          grilla (junto al sidebar); en teléfono, sigue siendo el único
          hijo en flex-column que ya era, ahora con un wrapper de más que
          no cambia nada de su propio comportamiento interno (BarraSuperior
          flexShrink:0, el área de pantallas flex:1 minHeight:0). */}
      <div style={isDesktop ? {gridColumn:"2",height:"100dvh",display:"flex",
        flexDirection:"column",overflow:"hidden",minWidth:0}
        : {display:"flex",flexDirection:"column",flex:1,minHeight:0,
        width:"100%",overflow:"hidden"}}>
      <BarraSuperior user={user} onNav={setScreen}/>

      {/* Barra de pasos — atajo de desarrollo, oculta por defecto */}
      {verPasos&&<div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"4px 8px",display:"flex",gap:SPACING[4],overflowX:"auto",
        WebkitOverflowScrolling:"touch"}}>
        {STEPS.map((s,i,arr)=>(
          <div key={s.k} style={{display:"flex",alignItems:"center",gap:SPACING[4],flexShrink:0}}>
            <button onClick={()=>setScreen(s.k)} style={{
              background:screen===s.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"transparent",
              border:`1px solid ${screen===s.k?Q.violet:Q.border}`,
              borderRadius:RADII.xl,padding:"4px 8px",cursor:"pointer",
              color:screen===s.k?Q.cyan:Q.muted,fontSize:12,fontWeight:screen===s.k?700:400,
              fontFamily:F_BODY,whiteSpace:"nowrap",
            }}>{s.l}</button>
            {i<arr.length-1&&<span style={{color:Q.dim,fontSize:12}}>›</span>}
          </div>
        ))}
      </div>}

      {verHist&&user?.id&&(
        <HistorialJuegos user={user} onCerrar={()=>setVerHist(false)}/>
      )}

      {verJR&&user?.id&&(
        <JuegoResponsable user={user} onCerrar={()=>setVerJR(false)}/>
      )}

      {superBono&&(
        <SuperBonoGanaste premio={superBono}
          onCerrar={()=>{ setSuperBono(null); user?.refrescar?.(); }}/>
      )}

      {errorGlobal&&(
        <div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",
          zIndex:80,width:"calc(100% - 24px)",maxWidth:406,
          background:"rgba(255,23,68,0.15)",border:`1.5px solid ${Q.red}`,
          borderRadius:RADII.lg,padding:"12px 16px",display:"flex",
          alignItems:"center",justifyContent:"space-between",gap:SPACING[8]}}>
          <span style={{color:Q.text,fontSize:12,
            fontFamily:F_BODY}}><Icon name="triangle-alert" size={13}/> {errorGlobal}</span>
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
        {/* Avisos de la administración, arriba de cualquier pantalla */}
        <div style={{padding:"0 12px"}}>
          <AvisosBanner destino="app" agenciaCode={user?.creado_por}/>
        </div>

        {screen==="prematch"  &&<ScreenPrematch     onAction={handle} onBet={confirmBet} onLocal={generarLocal} moneda={user?.moneda}
          key={betsARestaurar?"rep":"nuevo"} betsIniciales={betsARestaurar}
          onTomadas={()=>setBetsARestaurar(null)}/>}
        {screen==="builder"   &&<ScreenBuilder      picks={builderPicks} onAdd={addPick} onQuitar={quitarPick} onLimpiar={limpiarPicks} onBet={confirmBet} onLocal={generarLocal} onNav={setScreen}/>}
        {screen==="live"      &&<ScreenLive         onAction={handle} onBet={confirmBet} onLocal={generarLocal} moneda={user?.moneda}
          key={betsARestaurar?"repL":"nuevoL"} betsIniciales={betsARestaurar}
          onTomadas={()=>setBetsARestaurar(null)}/>}
        {screen==="pool"      &&<ScreenPool         onAction={handle}/>}
        {screen==="p2p"       &&<ScreenP2P          onAction={handle}/>}
        {screen==="combo"     &&<ScreenCombo        onAction={handle} onBet={confirmBet} refCode={refCode} onEditar={cargarComboAlBuilder} moneda={user?.moneda} userId={user?.id}/>}
        {screen==="confirmed" &&<ScreenBetConfirmed bets={betData.bets} stake={betData.stake} odd={betData.odd} code={betData.code} onAction={handle} onRepetir={repetirApuesta} userId={user?.id}/>}
        {screen==="mybets"    &&<ScreenMyBets       onAction={handle} user={user}/>}
        {screen==="mejorar"   &&<ScreenMejorar escaneo={escaneo} setEscaneo={setEscaneo}      onAction={handle} onBet={confirmBet} user={user} refCode={refCode}/>}
        {screen==="desafios"  &&<ScreenDesafios user={user} onAction={handle}/>}
        {screen==="casino"    &&<ScreenCasino user={user}/>}
        {screen==="casinovivo"&&<ScreenCasino user={user} vivo/>}
        {screen==="cuenta"    &&<ScreenCuenta       user={user} onNav={setScreen} onJR={()=>setVerJR(true)} onHist={()=>setVerHist(true)}/>}
        </CazaError>
      </div>

      {confirmando&&(
        <HojaConfirmar picks={confirmando.bets} stake={confirmando.stake}
          odd={confirmando.odd} user={{...user, refCode}}
          onCerrar={()=>setConfirmando(null)} onListo={apuestaLista}/>
      )}

      {/* Barra inferior fija — solo debajo de 1024px; SidebarDesktop la
          reemplaza arriba de eso. */}
      {!isDesktop&&(
        <BarraInferior actual={navActual} onNav={setScreen}
          onAyuda={()=>setAyudaAbierto(true)}/>
      )}
      </div>

      {/* Ayuda: disponible en cualquier pantalla */}
      <BotonAyuda userId={user?.id} origen="app" abierto={ayudaAbierto}
        onCerrar={()=>setAyudaAbierto(false)}/>

      {/* Boleto en armado: no en casino, no en builder (ya lo está viendo) */}
      {builderPicks.length>0 && !["casino","casinovivo","builder"].includes(screen) && (
        <BurbujaBetslip count={builderPicks.length} onAbrir={()=>setScreen("builder")}/>
      )}
    </div>
  );
}
