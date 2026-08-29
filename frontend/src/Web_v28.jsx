// ═══════════════════════════════════════════════════════════════
// WEB — Sitio público de escritorio. Ruta: /sitio
//
// Etapa 1: sin login. El visitante navega las cuotas, arma el boleto
// y saca un código QP para pagarlo en una agencia. Usa el endpoint
// anónimo POST /api/betslip, así que no requiere backend nuevo.
//
// Etapas siguientes (pendientes): entrar con Telegram, y usuario/clave.
// Cuando estén, el bloque BotonEntrar de abajo es el punto de enganche.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef, Component } from "react";

const API = "https://api.iaqp.lat";

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

const F_NUM  = "'Barlow Condensed','Inter',system-ui,sans-serif";
const F_BODY = "'Inter',system-ui,sans-serif";

const fmt  = n => Number(n||0).toFixed(2);
const ars  = n => "$" + Math.round(n||0).toLocaleString("es-AR");

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

const prod = a => a.reduce((x,y)=>x*y,1);

// ── Utilidades ────────────────────────────────────────────────
function hashColor(str){
  let h=0;
  for(let i=0;i<(str||"").length;i++) h=((h<<5)-h)+str.charCodeAt(i);
  const colors=["#2B6BFF","#7B3FE4","#0E8F6F","#C4162A","#1B3A8C",
    "#E07A1F","#5B2D8E","#0B7A3E","#B01238","#1E4FA8"];
  return colors[Math.abs(h)%colors.length];
}

function Escudo({ name, size=22 }){
  const [fallo,setFallo]=useState(false);
  const ini=(name||"?").split(" ").filter(Boolean).slice(0,2)
    .map(w=>w[0].toUpperCase()).join("");
  const color=hashColor(name);
  if(name&&!fallo) return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:Q.inset,border:`1px solid ${Q.border}`,overflow:"hidden",
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      <img src={`${API}/api/team-logo/nombre/${encodeURIComponent(name)}`}
        alt="" loading="lazy" onError={()=>setFallo(true)}
        style={{width:"78%",height:"78%",objectFit:"contain"}}/>
    </div>
  );
  return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:`linear-gradient(135deg,${color},${color}88)`,
      display:"flex",alignItems:"center",justifyContent:"center"}}>
      <span style={{color:"#fff",fontWeight:700,fontSize:size*0.42,
        fontFamily:F_NUM}}>{ini||"?"}</span>
    </div>
  );
}

// Probabilidad implícita a partir de las cuotas. Es dato real, no adorno:
// deja ver de un vistazo cómo paga el mercado cada resultado.
function BarraProb({ odds }){
  const vals=odds.filter(o=>o>0);
  if(vals.length<2) return null;
  const inv=vals.map(o=>1/o);
  const suma=inv.reduce((a,b)=>a+b,0);
  const pct=inv.map(x=>Math.round(x/suma*100));
  const cols=[Q.violet,Q.dim,Q.violet2];
  return(
    <div style={{display:"flex",height:3,borderRadius:2,overflow:"hidden",
      background:Q.inset,marginTop:6}}>
      {pct.map((p,i)=>(
        <div key={i} style={{width:`${p}%`,background:cols[i]||Q.dim}}/>
      ))}
    </div>
  );
}

// El sport_key del feed trae deporte y pais juntos:
// soccer_argentina_primera_division -> soccer + argentina
const GRUPOS = {
  soccer:"Fútbol", basketball:"Básquet", tennis:"Tenis", icehockey:"Hockey",
  baseball:"Béisbol", americanfootball:"Fútbol americano", mma:"MMA",
  boxing:"Boxeo", golf:"Golf", rugbyleague:"Rugby", cricket:"Cricket",
};
function grupoDe(sportKey){
  return String(sportKey||"").split("_")[0] || "otros";
}

// Banderas dibujadas, no imágenes: nada que licenciar ni que descargar.
// Cada entrada son las franjas de arriba a abajo, o "v" para verticales.
const BANDERAS = {
  argentina:{c:["#75AADB","#FFFFFF","#75AADB"]},
  brazil:{c:["#009C3B","#FFDF00","#009C3B"]},
  uruguay:{c:["#FFFFFF","#0038A8","#FFFFFF"]},
  chile:{c:["#FFFFFF","#D52B1E"]},
  colombia:{c:["#FCD116","#003893","#CE1126"]},
  mexico:{c:["#006847","#FFFFFF","#CE1126"],v:true},
  peru:{c:["#D91023","#FFFFFF","#D91023"],v:true},
  spain:{c:["#AA151B","#F1BF00","#AA151B"]},
  italy:{c:["#008C45","#F4F5F0","#CD212A"],v:true},
  germany:{c:["#000000","#DD0000","#FFCE00"]},
  france:{c:["#002395","#FFFFFF","#ED2939"],v:true},
  england:{c:["#FFFFFF","#CE1124","#FFFFFF"]},
  epl:{c:["#FFFFFF","#CE1124","#FFFFFF"]},
  netherlands:{c:["#AE1C28","#FFFFFF","#21468B"]},
  portugal:{c:["#006600","#FF0000"],v:true},
  usa:{c:["#B22234","#FFFFFF","#3C3B6E"]},
  nba:{c:["#B22234","#FFFFFF","#3C3B6E"]},
  nfl:{c:["#B22234","#FFFFFF","#3C3B6E"]},
  uefa:{c:["#0B1E5B","#1B4BA8","#0B1E5B"]},
  fifa:{c:["#1B4BA8","#FFFFFF","#1B4BA8"]},
  conmebol:{c:["#0B7A3E","#FFDF00","#0B7A3E"]},
};
function banderaDe(sportKey){
  const k=String(sportKey||"").toLowerCase();
  for(const pais of Object.keys(BANDERAS)){
    if(k.includes(pais)) return BANDERAS[pais];
  }
  return null;
}
function Bandera({ sportKey, size=18 }){
  const b=banderaDe(sportKey);
  const alto=Math.round(size*0.68);
  if(!b) return(
    <div style={{width:size,height:alto,borderRadius:2,flexShrink:0,
      background:hashColor(sportKey),opacity:.8}}/>
  );
  return(
    <div aria-hidden="true" style={{width:size,height:alto,borderRadius:2,
      overflow:"hidden",flexShrink:0,display:"flex",
      flexDirection:b.v?"row":"column",
      boxShadow:"0 0 0 1px rgba(255,255,255,.12) inset"}}>
      {b.c.map((c,i)=><div key={i} style={{flex:1,background:c}}/>)}
    </div>
  );
}

const CAMARA = (
  <>
    <path d="M3 8.5A1.5 1.5 0 014.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z"/>
    <circle cx="12" cy="13" r="3.5"/>
  </>
);

function IconoDeporte({ nombre, color }){
  const n=(nombre||"").toLowerCase();
  let d=<><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/></>;
  if(n.includes("basq")||n.includes("basket"))
    d=<><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5 5c4 3 4 11 0 14M19 5c-4 3-4 11 0 14"/></>;
  else if(n.includes("tenis")||n.includes("tennis"))
    d=<><circle cx="12" cy="12" r="9"/><path d="M5 5c5 3 5 11 0 14M19 5c-5 3-5 11 0 14"/></>;
  else if(n.includes("hockey"))
    d=<><path d="M4 16h16M6 16l2-9h8l2 9"/><circle cx="12" cy="11" r="1.6"/></>;
  else if(n.includes("beis")||n.includes("base"))
    d=<><path d="M5 18h14M7 18V9l5-4 5 4v9"/></>;
  return(
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

// ── Carrusel superior ─────────────────────────────────────────
// Si el admin cargó banners, muestra esos. Si no, arte generado, para
// que nunca quede un hueco ni dependamos de imágenes de terceros.
function Carrusel(){
  const [banners,setBanners]=useState(null);
  const [i,setI]=useState(0);

  useEffect(()=>{
    fetch(`${API}/api/web/banners`).then(r=>r.ok?r.json():{banners:[]})
      .then(d=>setBanners(d.banners||[])).catch(()=>setBanners([]));
  },[]);

  const generados=[
    {titulo:"Traé el boleto de otra casa.\nTe pagamos mejor.",
     texto:"Sacale una foto y te decimos si podemos mejorarte la cuota.",
     eyebrow:"BET BEST", g:[`#1B2E7A`,Q.violet,Q.violet2]},
    {titulo:"Armá tu combinada\ndel mismo partido",
     texto:"Combiná varios mercados de un solo encuentro y mirá cómo paga.",
     eyebrow:"BET BUILDER", g:[Q.violet2,"#4A2A9E","#141A46"]},
    {titulo:"Cobrá antes\nde que termine",
     texto:"Cerrá la apuesta en cualquier momento con el cash out.",
     eyebrow:"CASH OUT", g:["#0B3B6F",Q.violet,"#2A1B6E"]},
  ];

  const usarBanners = banners && banners.length>0;
  const total = usarBanners ? banners.length : generados.length;

  useEffect(()=>{
    if(total<2) return;
    const t=setInterval(()=>setI(x=>(x+1)%total),6000);
    return()=>clearInterval(t);
  },[total]);

  const idx = total ? i%total : 0;

  return(
    <div style={{position:"relative",overflow:"hidden",borderRadius:12,
      marginBottom:14,height:200}}>
      {usarBanners ? (
        <a href={banners[idx].link||"#"} style={{display:"block",height:"100%"}}>
          <img src={banners[idx].imagen} alt={banners[idx].titulo||""}
            style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          {(banners[idx].titulo||banners[idx].texto)&&(
            <div style={{position:"absolute",left:0,right:0,bottom:0,
              padding:"30px 30px 22px",
              background:"linear-gradient(transparent,rgba(5,9,20,.9))"}}>
              <div style={{fontFamily:F_NUM,fontSize:28,fontWeight:700,
                color:"#fff",lineHeight:1.05}}>{banners[idx].titulo}</div>
              <div style={{fontSize:13,color:"#D5E0FF",marginTop:5}}>
                {banners[idx].texto}</div>
            </div>
          )}
        </a>
      ) : (
        <div style={{height:"100%",padding:"28px 30px",display:"flex",
          alignItems:"center",
          background:`linear-gradient(115deg,${generados[idx].g[0]},${generados[idx].g[1]} 45%,${generados[idx].g[2]})`,
          transition:"background .5s"}}>
          <svg viewBox="0 0 600 200" preserveAspectRatio="none" style={{position:"absolute",
            inset:0,width:"100%",height:"100%",opacity:.22}}>
            <g stroke="#fff" strokeWidth="1.2" fill="none">
              <rect x="1" y="1" width="598" height="198"/>
              <line x1="300" y1="0" x2="300" y2="200"/>
              <circle cx="300" cy="100" r="46"/>
              <rect x="1" y="48" width="66" height="104"/>
              <rect x="533" y="48" width="66" height="104"/>
            </g>
          </svg>
          <div style={{position:"relative",maxWidth:470}}>
            <div style={{fontSize:10,letterSpacing:2.4,fontWeight:800,
              color:Q.gold}}>{generados[idx].eyebrow}</div>
            <h1 style={{fontFamily:F_NUM,fontSize:36,fontWeight:700,lineHeight:1,
              marginTop:7,whiteSpace:"pre-line"}}>{generados[idx].titulo}</h1>
            <p style={{fontSize:13.5,color:"#D5E0FF",marginTop:9,lineHeight:1.5}}>
              {generados[idx].texto}</p>
          </div>
        </div>
      )}

      {total>1&&(
        <div style={{position:"absolute",bottom:14,right:22,display:"flex",gap:6}}>
          {Array.from({length:total},(_,k)=>(
            <button key={k} onClick={()=>setI(k)} aria-label={`Ir al banner ${k+1}`}
              style={{width:k===idx?20:7,height:7,borderRadius:4,border:"none",
                padding:0,cursor:"pointer",transition:"width .2s",
                background:k===idx?Q.goldBg:ov(.4)}}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reloj de la barra ─────────────────────────────────────────
function Reloj(){
  const [ahora,setAhora]=useState(new Date());
  useEffect(()=>{
    const t=setInterval(()=>setAhora(new Date()),1000);
    return()=>clearInterval(t);
  },[]);
  const dosD=n=>String(n).padStart(2,"0");
  const dias=["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
  return(
    <div style={{display:"flex",alignItems:"center",gap:12,
      fontFamily:F_NUM,letterSpacing:1}}>
      <span style={{fontSize:13,color:"#BBD0FF",fontWeight:600}}>
        {dias[ahora.getDay()]} {dosD(ahora.getDate())}/{dosD(ahora.getMonth()+1)}/{ahora.getFullYear()}</span>
      <span style={{fontSize:21,fontWeight:700,color:"#fff"}}>
        {dosD(ahora.getHours())}:{dosD(ahora.getMinutes())}:{dosD(ahora.getSeconds())}</span>
    </div>
  );
}

// ── Mercados de un partido (para el bet builder) ──────────────
const MKT = {
  h2h:      "Ganador del partido",
  totals:   "Total de goles",
  btts:     "Ambos anotan",
  spreads:  "Hándicap",
};
function tituloMercado(k){ return MKT[k] || k; }

function etiquetaCorta(nombre, home, away){
  if(nombre===home) return "1";
  if(nombre===away) return "2";
  if(nombre==="Draw") return "X";
  if(nombre==="Yes") return "Sí";
  if(nombre==="No")  return "No";
  return nombre.replace("Over","+").replace("Under","−");
}

// Panel con todos los mercados. Elegir dos del mismo partido es,
// literalmente, armar un bet builder: la cuota la recalcula el servidor
// con el margen de correlación, nunca se multiplica en el navegador.
function MercadosPartido({ ev, deporte, picks, onToggle }){
  const home=ev.h||ev.home||"";
  const away=ev.a||ev.away||"";
  const markets=ev.markets||{};
  const claves=Object.keys(markets).filter(k=>Object.keys(markets[k]||{}).length);
  if(!claves.length) return(
    <div style={{padding:"14px 16px",color:Q.muted,fontSize:12}}>
      Este partido no tiene más mercados disponibles.</div>
  );
  return(
    <div style={{padding:"6px 14px 14px",background:Q.inset}}>
      <div style={{fontSize:11,color:Q.cyan,marginBottom:10,lineHeight:1.5}}>
        Elegí dos o más de este partido y se arma un <b>Bet Builder</b>.
        La cuota se recalcula con el margen de la casa.</div>
      {claves.map(k=>(
        <div key={k} style={{marginBottom:12}}>
          <div style={{fontSize:10,letterSpacing:1.2,color:Q.dim,fontWeight:700,
            textTransform:"uppercase",marginBottom:6}}>{tituloMercado(k)}</div>
          <div style={{display:"grid",
            gridTemplateColumns:"repeat(auto-fill,minmax(92px,1fr))",gap:6}}>
            {Object.entries(markets[k]).map(([nombre,val])=>{
              if(!val) return null;
              const op={k:etiquetaCorta(nombre,home,away),label:nombre,val};
              return(
                <BotonCuota key={nombre} ev={ev} op={op} deporte={deporte}
                  picks={picks} onToggle={onToggle} market={k}/>
              );
            })}
          </div>
        </div>
      ))}
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

// ── Fila de partido ───────────────────────────────────────────
function FilaPartido({ ev, deporte, picks, onToggle, ancho, vivo }){
  const [abierto,setAbierto]=useState(false);
  const home=ev.h||ev.home||"";
  const away=ev.a||ev.away||"";
  const o=ev.odds||{};
  const opciones=[
    {k:"1", label:home,     val:o.L},
    {k:"X", label:"Empate", val:o.E},
    {k:"2", label:away,     val:o.V},
  ].filter(x=>x.val);
  const nMercados=Object.keys(ev.markets||{}).length;
  // Antes se cortaba el texto ISO a mano, que muestra UTC.
  // horaLocal convierte a la zona del dispositivo.
  const hl=horaLocal(ev);
  const dia=hl.slice(0,2), mes=hl.slice(3,5), hora=hl.slice(6);

  return(
    <div style={{display:"grid",
      gridTemplateColumns: ancho ? "62px 1fr 300px 84px" : "62px 1fr",
      gap:12,alignItems:"center",padding:"11px 14px",
      borderBottom:`1px solid ${Q.border}`}}>

      <div style={{textAlign:"center",fontFamily:F_NUM,fontSize:15,
        fontWeight:600,color:vivo?Q.pink:Q.muted,lineHeight:1.15}}>
        {vivo ? (ev.minute||"EN VIVO") : (hora||"—")}
        <div style={{fontSize:10,color:Q.dim,fontFamily:F_BODY,fontWeight:500}}>
          {vivo ? (ev.minuto_estimado?"aprox.":"") : (dia&&mes?`${dia}/${mes}`:"")}</div>
      </div>

      <div style={{minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:9,padding:"2px 0"}}>
          <Escudo name={home}/>
          <span style={{fontSize:13.5,whiteSpace:"nowrap",overflow:"hidden",
            textOverflow:"ellipsis",flex:1}}>{home}</span>
          {vivo&&ev.homeScore!=null&&(
            <span style={{fontFamily:F_NUM,fontSize:16,fontWeight:700,
              color:Q.gold}}>{ev.homeScore}</span>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:9,padding:"2px 0"}}>
          <Escudo name={away}/>
          <span style={{fontSize:13.5,whiteSpace:"nowrap",overflow:"hidden",
            textOverflow:"ellipsis",flex:1}}>{away}</span>
          {vivo&&ev.awayScore!=null&&(
            <span style={{fontFamily:F_NUM,fontSize:16,fontWeight:700,
              color:Q.gold}}>{ev.awayScore}</span>
          )}
        </div>
        <BarraProb odds={opciones.map(x=>x.val)}/>
        {!ancho&&(
          <div style={{display:"grid",gridTemplateColumns:`repeat(${opciones.length||1},1fr)`,
            gap:6,marginTop:9}}>
            {opciones.map(op=>(
              <BotonCuota key={op.k} ev={ev} op={op} deporte={deporte}
                picks={picks} onToggle={onToggle}/>
            ))}
          </div>
        )}
      </div>

      {ancho&&(
        <div style={{display:"grid",gridTemplateColumns:`repeat(${opciones.length||1},1fr)`,gap:6}}>
          {opciones.map(op=>(
            <BotonCuota key={op.k} ev={ev} op={op} deporte={deporte}
              picks={picks} onToggle={onToggle}/>
          ))}
        </div>
      )}

      {ancho&&(
        <div style={{textAlign:"right"}}>
          {nMercados>0&&(
            <button onClick={()=>setAbierto(a=>!a)} style={{background:"transparent",
              border:`1px solid ${abierto?Q.violet:Q.border}`,borderRadius:7,
              padding:"6px 10px",cursor:"pointer",fontSize:11.5,fontWeight:600,
              color:abierto?Q.text:Q.cyan,fontFamily:F_BODY,whiteSpace:"nowrap"}}>
              {abierto?"Cerrar":`+${nMercados} mercados`}</button>
          )}
        </div>
      )}

      {!ancho&&nMercados>0&&(
        <button onClick={()=>setAbierto(a=>!a)} style={{gridColumn:"1 / -1",
          marginTop:9,background:"transparent",
          border:`1px solid ${abierto?Q.violet:Q.border}`,borderRadius:7,
          padding:"9px",cursor:"pointer",fontSize:12,fontWeight:600,
          color:abierto?Q.text:Q.cyan,fontFamily:F_BODY}}>
          {abierto?"Cerrar mercados":`Ver ${nMercados} mercados · Bet Builder`}</button>
      )}

      {abierto&&(
        <div style={{gridColumn:"1 / -1",marginTop:10,
          marginLeft:ancho?-14:-14,marginRight:-14,marginBottom:-11,
          borderTop:`1px solid ${Q.border}`}}>
          <MercadosPartido ev={ev} deporte={deporte} picks={picks}
            onToggle={onToggle}/>
        </div>
      )}
    </div>
  );
}

function BotonCuota({ ev, op, deporte, picks, onToggle, market }){
  const id=ev.id||ev.event_id;
  const sel=picks.some(p=>p.id===id&&p.label===op.label);
  return(
    <button onClick={()=>onToggle(ev,op.label,op.val,deporte,market||"h2h")} style={{
      background:sel?Q.violet:Q.inset,
      border:`1px solid ${sel?Q.violet:Q.border}`,
      borderRadius:7,padding:"7px 4px",cursor:"pointer",textAlign:"center",
      fontFamily:F_BODY,transition:"all .13s",minWidth:0}}>
      <div style={{fontSize:9,fontWeight:600,letterSpacing:.8,
        color:sel?"#fff":Q.dim,whiteSpace:"nowrap",overflow:"hidden",
        textOverflow:"ellipsis"}}>{op.k}</div>
      <div style={{fontFamily:F_NUM,fontSize:18,fontWeight:700,lineHeight:1.05,
        color:sel?"#fff":Q.gold}}>{fmt(op.val)}</div>
    </button>
  );
}

// ── Boleto (columna derecha) ──────────────────────────────────
// Múltiple: un solo boleto con las cuotas multiplicadas.
// Simple: un boleto por selección, cada uno con su código.
//
// El importe acá es una simulación: el endpoint público no lo guarda,
// el monto real lo carga el cajero al cobrar. Está dicho en pantalla
// para que nadie crea que ya dejó la plata puesta.
function Boleto({ picks, onQuitar, onLimpiar, moneda="ARS", onCargar, sesionUser }){
  const [modo,setModo]=useState("multiple");
  const [monto,setMonto]=useState(montoInicial(moneda));
  const [enviando,setEnviando]=useState(false);
  const [genProc,setGenProc]=useState(false);

  // El sistema arma la combinada con partidos de hoy. Sin cupo acá:
  // el visitante del sitio no está identificado.
  const generarCombo=async(perfil)=>{
    if(genProc) return;
    setGenProc(true);
    try{
      const r=await fetch(`${API}/api/combo-sugerido?perfil=${perfil}`);
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo armar");
      onCargar&&onCargar(d.picks.map(p=>({id:p.event_id,
        event_id:p.event_id,h:p.h,a:p.a,home:p.h,away:p.a,
        label:p.sel,sel:p.sel,val:p.odd,odd:p.odd,market:"h2h",
        sport_key:p.sport_key,commence_time:p.commence_time})));
    }catch(e){ alert(e.message); }
    setGenProc(false);
  };
  const [err,setErr]=useState("");
  const [emitidos,setEmitidos]=useState(null);

  // ¿Hay dos o más selecciones del mismo partido? Eso es bet builder,
  // y ahí la cuota NO se multiplica: la recalcula el servidor con el
  // margen de correlación. Multiplicarla acá sería regalar plata.
  const mismoPartido = useMemo(()=>{
    const ids={};
    picks.forEach(p=>{ ids[p.id]=(ids[p.id]||0)+1; });
    return Object.values(ids).some(n=>n>1);
  },[picks]);

  const [cuotaBB,setCuotaBB]=useState(null);
  useEffect(()=>{
    if(!mismoPartido){ setCuotaBB(null); return; }
    let vivo=true;
    fetch(`${API}/api/bet-builder/cotizar`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({picks:picks.map(p=>({odd:p.odd})),mismo_partido:true}),
    }).then(r=>r.ok?r.json():null)
      .then(d=>{ if(vivo&&d) setCuotaBB(d.cuota); })
      .catch(()=>{});
    return()=>{ vivo=false; };
  },[JSON.stringify(picks.map(p=>[p.id,p.odd])),mismoPartido]);

  const bruto = picks.length?prod(picks.map(p=>p.odd)):0;
  const total = mismoPartido&&cuotaBB!=null ? cuotaBB : bruto;
  const ganancia = modo==="multiple"
    ? Math.round(monto*total)
    : Math.round(picks.reduce((a,p)=>a+monto*p.odd,0));
  const aPagar = modo==="multiple" ? monto : monto*picks.length;

  const armarBody = (lista) => ({
    picks: lista.map(p=>({
      home:p.h||"", away:p.a||"", sel:p.label, odd:p.odd,
      sport:p.sport||"", event_id:p.event_id||p.id||"",
      sport_key:p.sport_key||"",
    })),
  });

  const generar=async()=>{
    if(!picks.length||enviando) return;
    setEnviando(true); setErr("");
    try{
      // En bet builder no se puede separar en simples: es un solo boleto
      const grupos = (modo==="multiple"||mismoPartido) ? [picks] : picks.map(p=>[p]);
      const res=[];
      for(const g of grupos){
        const r=await fetch(`${API}/api/betslip`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({...armarBody(g),
          // De qué pantalla del local salió. Con terminal, el boleto
          // va sin usuario: lo cobra y lo comisiona este local.
          ...(()=>{ try{ const t=sessionStorage.getItem("qp_terminal");
            return t?{terminal:t, user_id:null}:{}; }catch(e){ return {}; } })(),
          ...(mismoPartido&&g.length>1?{mismo_partido:true}:{})}),
        });
        if(!r.ok){
          const e=await r.json().catch(()=>({}));
          throw new Error(e.detail||`Error ${r.status}`);
        }
        res.push(await r.json());
      }
      setEmitidos(res);
    }catch(e){ setErr(e.message||"No se pudo generar el código"); }
    setEnviando(false);
  };

  if(emitidos) return(
    <div style={_panel()}>
      <div style={{..._phead(),color:Q.text}}>
        {emitidos.length>1?`Tus ${emitidos.length} códigos`:"Tu código"}</div>
      <div style={{padding:"16px 16px 20px",textAlign:"center"}}>
        {emitidos.map((sl,k)=>(
          <div key={sl.code} style={{marginBottom:k<emitidos.length-1?18:0,
            paddingBottom:k<emitidos.length-1?18:0,
            borderBottom:k<emitidos.length-1?`1px solid ${Q.border}`:"none"}}>
            <div style={{fontFamily:F_NUM,fontSize:36,fontWeight:700,color:Q.gold,
              letterSpacing:2,lineHeight:1.1}}>{sl.code}</div>
            {emitidos.length===1&&(
              <img alt="Código QR del boleto"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(sl.code)}`}
                style={{width:150,height:150,marginTop:12,borderRadius:8,
                  background:"#fff",padding:8}}/>
            )}
            <div style={{marginTop:8,fontSize:12,color:Q.muted}}>
              Cuota <b style={{color:Q.gold,fontFamily:F_NUM,fontSize:17}}>
                {fmt(sl.odd_total)}</b> · {sl.picks} sel.</div>
          </div>
        ))}
        <div style={{fontSize:12,color:Q.muted,marginTop:14,lineHeight:1.5}}>
          Presentalos en una agencia para pagarlos. Valen 24 horas.</div>
        {/* Compartir la jugada recién armada */}
        {picks.length>0&&(
          <BotonCompartir odd={total} code={emitidos[0]?.code}
            userId={sesionUser?.id}
            picks={picks.map(p=>({odd:p.odd??p.val, sel:p.sel??p.label,
                                  h:p.h??p.home, a:p.a??p.away}))}/>
        )}

        {/* Mantener: vuelve al boleto sin borrar las selecciones, para
            repetir la misma apuesta con otro monto. */}
        <button onClick={()=>setEmitidos(null)} style={{width:"100%",
          marginTop:16,background:`${Q.violet}22`,
          border:`1px solid ${Q.violet}`,borderRadius:8,padding:"12px",
          color:Q.cyan,fontSize:13.5,fontWeight:700,cursor:"pointer",
          fontFamily:F_BODY}}>
          🔁 Mantener selecciones ({picks.length})</button>

        <button onClick={()=>{setEmitidos(null);onLimpiar();}}
          style={{..._btnPrim(),marginTop:8}}>Armar otro boleto</button>
      </div>
    </div>
  );

  return(
    <div style={_panel()}>
      <div style={{..._phead(),color:Q.text,display:"flex",alignItems:"center",gap:9}}>
        <span style={{background:picks.length?Q.goldBg:Q.border,
          color:picks.length?"#1A1200":Q.muted,fontSize:11,fontWeight:700,
          borderRadius:4,padding:"1px 7px",fontFamily:F_BODY}}>{picks.length}</span>
        Tu boleto
      </div>

      {mismoPartido&&(
        <div style={{margin:"11px 14px 0",background:`${Q.violet}1A`,
          border:`1px solid ${Q.violet}`,borderRadius:8,padding:"9px 11px",
          fontSize:11.5,color:Q.text,lineHeight:1.45}}>
          <b>Bet Builder</b> · combinada del mismo partido. La cuota ya
          incluye el margen de correlación.</div>
      )}

      <div style={{display:"flex",gap:6,padding:"11px 14px 0",
        opacity:mismoPartido?.45:1,pointerEvents:mismoPartido?"none":"auto"}}>
        {[["multiple","Múltiple"],["simple","Simple"]].map(([k,l])=>(
          <button key={k} onClick={()=>setModo(k)} style={{flex:1,
            background:modo===k?Q.violet:Q.inset,
            border:`1px solid ${modo===k?Q.violet:Q.border}`,borderRadius:7,
            padding:"8px",cursor:"pointer",fontSize:12.5,fontWeight:700,
            color:modo===k?"#fff":Q.muted,fontFamily:F_BODY}}>{l}</button>
        ))}
      </div>

      {!picks.length&&(
        <div style={{padding:"20px 18px",textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:12.5,lineHeight:1.5,
            marginBottom:14}}>
            Tocá una cuota para empezar a armar el boleto.</div>

          {/* O que el sistema la arme: para el que entra sin saber
              qué jugar y se iría sin apostar. */}
          <div style={{color:Q.text,fontSize:12.5,fontWeight:700,
            marginBottom:8}}>🎲 O armala automáticamente</div>
          <div style={{display:"flex",gap:6}}>
            {[["seguro","🛡️"],["equilibrado","⚖️"],
              ["arriesgado","🚀"]].map(([k,ic])=>(
              <button key={k} onClick={()=>generarCombo&&generarCombo(k)}
                disabled={genProc}
                style={{flex:1,background:Q.inset,
                  border:`1px solid ${Q.border}`,borderRadius:9,
                  padding:"10px 4px",cursor:"pointer",color:Q.cyan,
                  fontSize:11,fontFamily:F_BODY,textTransform:"capitalize"}}>
                {genProc?"…":`${ic} ${k}`}</button>
            ))}
          </div>
        </div>
      )}

      {picks.map((p,i)=>(
        <div key={i} style={{padding:"11px 14px",
          borderBottom:`1px solid ${Q.border}`,
          borderTop:i===0?`1px solid ${Q.border}`:"none",
          marginTop:i===0?11:0}}>
          <div style={{fontSize:10.5,color:Q.dim,marginBottom:3}}>
            {p.h} — {p.a}</div>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"baseline",gap:10}}>
            <span style={{fontSize:12.5,fontWeight:600,minWidth:0,flex:1,
              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {p.label}</span>
            <span style={{fontFamily:F_NUM,fontSize:17,fontWeight:700,
              color:Q.gold}}>{fmt(p.odd)}</span>
            <button onClick={()=>onQuitar(p)} aria-label="Quitar selección"
              style={{background:"transparent",border:"none",color:Q.dim,
                fontSize:16,cursor:"pointer",padding:0,lineHeight:1}}>×</button>
          </div>
        </div>
      ))}

      {picks.length>0&&(
        <div style={{padding:14}}>
          {err&&(
            <div style={{background:`${Q.red}1A`,border:`1px solid ${Q.red}`,
              borderRadius:8,padding:"8px 11px",marginBottom:11,fontSize:12}}>{err}</div>
          )}

          <label style={{display:"block",fontSize:10,letterSpacing:1.3,
            color:Q.dim,fontWeight:700,marginBottom:6}}>
            IMPORTE {modo==="simple"?"POR APUESTA":""}</label>
          <input type="number" min="0" value={monto}
            onChange={e=>setMonto(Math.max(0,Number(e.target.value)||0))}
            aria-label="Importe a apostar"
            style={{width:"100%",background:Q.inset,border:`1px solid ${Q.border}`,
              borderRadius:8,padding:"11px 13px",color:Q.text,fontFamily:F_NUM,
              fontSize:20,fontWeight:600}}/>

          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginTop:12}}>
            <span style={{fontSize:12,color:Q.muted}}>
              {modo==="multiple"?"Cuota total":`${picks.length} apuestas`}</span>
            <span style={{fontFamily:F_NUM,fontSize:24,fontWeight:700,
              color:Q.text,lineHeight:1}}>
              {modo==="multiple"?fmt(total):ars(aPagar)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginTop:5,marginBottom:12}}>
            <span style={{fontSize:12,color:Q.muted}}>Ganancia posible</span>
            <span style={{fontFamily:F_NUM,fontSize:28,fontWeight:700,
              color:Q.gold,lineHeight:1}}>{ars(ganancia)}</span>
          </div>

          {/* Qué tan probable es, antes de generar el código */}
          {modo==="multiple"&&picks.length>0&&(
            <ProbabilidadApuesta moneda={moneda} stake={monto}
              picks={picks.map(p=>({
                // En el sitio los picks usan val/label; el backend
                // espera odd/sel. Se adapta acá para no tocar el
                // resto del boleto.
                odd:p.odd??p.val, sel:p.sel??p.label,
                h:p.h??p.home, a:p.a??p.away}))}/>
          )}

          <button onClick={generar} disabled={enviando} style={_btnPrim()}>
            {enviando?"Generando…":
              modo==="simple"&&picks.length>1
                ? `Generar ${picks.length} códigos`
                : "Generar código para pagar"}</button>
          <div style={{fontSize:10.5,color:Q.dim,textAlign:"center",marginTop:8,
            lineHeight:1.45}}>
            El importe es una simulación. Lo cargás al pagar en la agencia.</div>
          <button onClick={onLimpiar} style={{..._btnGhost(),marginTop:5}}>
            Vaciar boleto</button>
        </div>
      )}
    </div>
  );
}

// Botón flotante de ayuda. Va abajo a la izquierda para no chocar
// con el boleto ni con la barra de navegación.
function BotonAyuda({ userId, origen }){
  const [abierto,setAbierto]=useState(false);
  if(!userId) return null;
  return(
    <>
      {!abierto&&(
        <button onClick={()=>setAbierto(true)} aria-label="Ayuda"
          style={{position:"fixed",right:16,
            bottom:"calc(20px + env(safe-area-inset-bottom))",zIndex:150,
            height:42,borderRadius:21,padding:"0 17px",
            background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            border:"none",boxShadow:"0 4px 16px rgba(0,0,0,.45)",
            cursor:"pointer",fontSize:13.5,fontWeight:700,color:"#fff",
            gap:7,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
          💬 Ayuda</button>
      )}
      {abierto&&(
        <div onClick={()=>setAbierto(false)} style={{position:"fixed",
          inset:0,zIndex:200,background:"rgba(2,2,8,.9)",display:"flex",
          alignItems:"flex-end",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",
            maxWidth:520,height:"78dvh",background:Q.void||"#050510",
            borderTop:`1px solid ${Q.border}`,
            borderRadius:"16px 16px 0 0",padding:14,
            display:"flex",flexDirection:"column"}}>
            <CazaError>
              <ChatSoporte userId={userId} origen={origen}
                onCerrar={()=>setAbierto(false)}/>
            </CazaError>
          </div>
        </div>
      )}
    </>
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
            💬 Ayuda</div>
          <div style={{color:Q.muted,fontSize:10.5}}>
            {derivado?"Te va a responder tu agencia"
                     :"Preguntá lo que necesites"}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={cambiarSonido} title="Sonido de aviso"
            style={{background:"transparent",border:"none",fontSize:16,
              cursor:"pointer",padding:0,opacity:sonido?1:0.4}}>
            {sonido?"🔔":"🔕"}</button>
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
          borderRadius:10,padding:"10px 12px",marginBottom:9}}>
          <div style={{color:Q.gold,fontSize:11.5,fontWeight:700,
            marginBottom:6}}>
            {derivado?"Tu consulta necesita a una persona"
                     :"Hablá con tu agencia"}</div>
          <div style={{color:Q.muted,fontSize:10.5,marginBottom:8,
            lineHeight:1.45}}>
            {derivado
              ? <>{contacto.agencia} ya la recibió
                  {contacto.horario?` · ${contacto.horario}`:""}.
                  También podés escribirles directo:</>
              : <>Si preferís hablar con una persona de {contacto.agencia}
                  {contacto.horario?` · ${contacto.horario}`:""}:</>}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {contacto.whatsapp&&(
              <a href={`https://wa.me/${contacto.whatsapp.replace(/\D/g,"")}`}
                target="_blank" rel="noreferrer"
                style={{background:"#25D36622",border:"1px solid #25D366",
                  borderRadius:8,padding:"7px 13px",color:"#25D366",
                  fontSize:11.5,fontWeight:700,textDecoration:"none"}}>
                WhatsApp</a>
            )}
            {contacto.telegram&&(
              <a href={contacto.telegram} target="_blank" rel="noreferrer"
                style={{background:"#2AABEE22",border:"1px solid #2AABEE",
                  borderRadius:8,padding:"7px 13px",color:"#2AABEE",
                  fontSize:11.5,fontWeight:700,textDecoration:"none"}}>
                Telegram</a>
            )}
          </div>
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",marginBottom:9,minHeight:120}}>
        {msgs.length===0&&!proc&&(
          <div style={{color:Q.dim,fontSize:11.5,padding:"14px 4px",
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
              borderRadius:12,padding:"9px 12px",
              color:m.error?Q.red:Q.text,fontSize:12.5,lineHeight:1.55,
              whiteSpace:"pre-wrap"}}>
              {AUTOR[m.autor]&&m.autor!=="ia"&&(
                <div style={{color:Q.cyan,fontSize:9,fontWeight:700,
                  marginBottom:3}}>{AUTOR[m.autor].toUpperCase()}</div>
              )}
              {m.texto}
            </div>
          </div>
        ))}
        {proc&&(
          <div style={{color:Q.muted,fontSize:11.5,padding:"4px 2px"}}>
            Escribiendo…</div>
        )}
        <div ref={finRef}/>
      </div>

      <div style={{display:"flex",gap:7}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&enviar()}
          placeholder="Escribí tu consulta…"
          style={{flex:1,minWidth:0,background:ov(0.05),
            border:`1px solid ${Q.border}`,borderRadius:10,
            padding:"11px 13px",color:Q.text,fontSize:14}}/>
        <button onClick={enviar} disabled={proc||!texto.trim()}
          style={{background:texto.trim()?Q.violet:ov(0.05),border:"none",
            borderRadius:10,padding:"0 17px",
            cursor:texto.trim()?"pointer":"default",
            color:texto.trim()?"#fff":Q.dim,fontSize:14,fontWeight:700,
            flexShrink:0}}>↑</button>
      </div>
    </div>
  );
}

// Avisos que publica la administración. Rotan solos y se descartan
// tocándolos: no son bloqueantes, así que nunca tapan la operación.
// Contiene los errores de un componente para que no tumben toda la
// pantalla. Sin esto, cualquier falla en el chat dejaba el sitio en
// negro y el visitante no podía hacer nada.
class CazaError extends Component {
  constructor(p){ super(p); this.state={roto:false, msg:""}; }
  static getDerivedStateFromError(err){
    return {roto:true, msg:String(err?.message||err||"")};
  }
  componentDidCatch(err,info){ console.error("CazaError:",err,info); }
  render(){
    if(!this.state.roto) return this.props.children;
    return(
      <div style={{padding:20,textAlign:"center",color:"#FF3B5C",
        fontSize:13,lineHeight:1.6}}>
        Algo falló en esta parte.
        <div style={{color:"#8A8FA8",fontSize:11,marginTop:6}}>
          {this.state.msg.slice(0,180)}</div>
        <button onClick={()=>this.setState({roto:false,msg:""})}
          style={{marginTop:12,background:"transparent",
            border:"1px solid #2A2F45",borderRadius:8,padding:"8px 16px",
            color:"#8A8FA8",fontSize:12,cursor:"pointer"}}>
          Reintentar</button>
      </div>
    );
  }
}

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
                           origen:"web"})})
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
      g.fillText("QUARTZPLAY", 70, 110);

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
        await navigator.share({title:"QuartzPlay", text:texto});
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
        {copiado?"✓ Copiado":"↗ Compartir"}</button>
    );
  }

  return(
    <>
      <button onClick={compartir} style={{width:"100%",marginTop:9,
        background:premio?`${Q.gold}12`:"transparent",
        border:`1px solid ${premio?`${Q.gold}55`:Q.border}`,
        borderRadius:10,padding:"11px",cursor:"pointer",
        color:premio?Q.gold:Q.cyan,
        fontSize:13,fontWeight:600,display:"flex",alignItems:"center",
        justifyContent:"center",gap:7}}>
        {copiado ? "✓ Copiado al portapapeles" : "↗ Compartir mi jugada"}
      </button>
      {premio&&!copiado&&(
        <div style={{color:Q.dim,fontSize:10.5,textAlign:"center",
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
        borderRadius:10,padding:"11px 13px",marginBottom:10,
        cursor:"pointer"}}>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",gap:8}}>
        <div style={{minWidth:0,flex:1}}>
          <div style={{color:Q.muted,fontSize:10.5}}>
            Probabilidad según el mercado</div>
          <div style={{color:c,fontWeight:800,fontSize:19,marginTop:1}}>
            {pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%
            {datos.uno_cada>2&&(
              <span style={{color:Q.muted,fontSize:11,fontWeight:400,
                marginLeft:7}}>
                1 de cada {datos.uno_cada.toLocaleString("es-AR")}</span>
            )}
          </div>
        </div>
        <span style={{color:Q.dim,fontSize:11,flexShrink:0}}>
          {abierto?"▲":"▼"}</span>
      </div>

      {abierto&&(
        <div style={{marginTop:9,paddingTop:9,
          borderTop:`1px solid ${Q.border}`}}>
          <div style={{color:Q.text,fontSize:11.5,lineHeight:1.55,
            marginBottom:9}}>{datos.lectura}</div>

          {datos.picks.map((p,i)=>(
            <div key={i} style={{display:"flex",
              justifyContent:"space-between",alignItems:"baseline",
              gap:8,padding:"3px 0"}}>
              <span style={{color:Q.muted,fontSize:10.5,minWidth:0,
                flex:1,overflow:"hidden",textOverflow:"ellipsis",
                whiteSpace:"nowrap"}}>{p.seleccion||p.evento}</span>
              <span style={{color:p.probabilidad>=50?Q.green
                :(p.probabilidad>=25?Q.gold:Q.red),
                fontSize:11,flexShrink:0}}>
                {p.probabilidad.toFixed(0)}%</span>
            </div>
          ))}

          <div style={{color:Q.dim,fontSize:9.5,marginTop:9,
            lineHeight:1.45}}>{datos.nota}</div>
        </div>
      )}
    </div>
  );
}

// Lo que ve el cliente al escanear el QR de una terminal. Tres
// caminos: seguir ahí mismo sin cuenta, entrar al sitio con su
// usuario, o abrir el bot de Telegram.
//
// La terminal queda guardada para el boleto que arme en esta sesión:
// así el local sabe qué pantalla le trajo la venta.
function PantallaTerminal({ codigo, onSeguir }){
  const [t,setT]=useState(null);
  const [err,setErr]=useState("");

  useEffect(()=>{
    fetch(`${API}/api/terminal/${encodeURIComponent(codigo)}`)
      .then(async r=>{
        const d=await r.json();
        if(!r.ok) throw new Error(d.detail||"Terminal no disponible");
        setT(d);
        // Queda guardada para el boleto que arme en esta sesión
        try{ sessionStorage.setItem("qp_terminal", d.codigo); }catch(e){}
      })
      .catch(e=>setErr(e.message));
  },[codigo]);

  const empezar=()=>{
    fetch(`${API}/api/terminal/${encodeURIComponent(codigo)}/eleccion`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({eligio:"terminal"})}).catch(()=>{});
    onSeguir&&onSeguir();
  };

  if(err) return(
    <div style={{minHeight:"100dvh",background:Q.void,display:"flex",
      alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",color:Q.muted,fontSize:14,
        lineHeight:1.6,fontFamily:F_BODY}}>
        {err}<br/>
        <span style={{color:Q.dim,fontSize:12}}>
          Pedile ayuda al operador del local.</span></div>
    </div>
  );

  if(!t) return(
    <div style={{minHeight:"100dvh",background:Q.void,display:"flex",
      alignItems:"center",justifyContent:"center"}}>
      <div style={{color:Q.muted,fontSize:14,fontFamily:F_BODY}}>
        Cargando…</div>
    </div>
  );

  return(
    <div style={{minHeight:"100dvh",background:Q.void,
      padding:"40px 22px",maxWidth:440,margin:"0 auto",
      display:"flex",flexDirection:"column",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{color:Q.violet,fontWeight:900,fontSize:15,
          letterSpacing:2,fontFamily:F_BODY}}>QUARTZPLAY</div>

        <div style={{color:Q.text,fontSize:26,fontWeight:800,
          marginTop:18,lineHeight:1.3,fontFamily:F_BODY}}>
          Armá tu apuesta<br/>desde tu celular</div>

        <div style={{color:Q.muted,fontSize:13.5,marginTop:14,
          lineHeight:1.6,fontFamily:F_BODY}}>
          Elegí tus partidos acá, generá el código y cobralo en el
          mostrador sin hacer la cola.</div>

        <button onClick={empezar} style={{width:"100%",marginTop:28,
          background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:12,padding:"17px",color:"#fff",
          fontSize:16,fontWeight:800,cursor:"pointer",
          fontFamily:F_BODY}}>
          Empezar</button>

        <div style={{color:Q.dim,fontSize:11.5,marginTop:16,
          lineHeight:1.55,fontFamily:F_BODY}}>
          No hace falta cuenta ni registrarse.<br/>
          El boleto se paga en este mostrador.</div>

        <div style={{color:Q.dim,fontSize:11,marginTop:26,
          paddingTop:16,borderTop:`1px solid ${Q.border}`,
          fontFamily:F_BODY}}>
          {t.agencia} · {t.nombre}</div>

        <div style={{color:Q.dim,fontSize:10,marginTop:10,
          lineHeight:1.5,fontFamily:F_BODY}}>
          Jugá con responsabilidad · Prohibida la participación a
          menores de 18 años</div>
      </div>
    </div>
  );
}

// ── DESAFÍOS EN EL SITIO ──────────────────────────────────────
// Lo mismo que en la app: el cliente puede desafiar, aceptar y
// comprar IACOIN. Sería raro que pueda hacerlo desde el teléfono
// pero no desde la computadora.
function _colorMarca(nombre){
  const PALETA=["#7B1FA2","#0277BD","#00838F","#2E7D32","#EF6C00",
                "#C62828","#4527A0","#00695C","#AD1457","#37474F"];
  let h=0;
  for(let i=0;i<(nombre||"").length;i++) h=(h*31+nombre.charCodeAt(i))|0;
  return PALETA[Math.abs(h)%PALETA.length];
}

function CasinoWeb({ sesion, ancho, vivo }){
  const user=sesion?.user||{};
  const [juegos,setJuegos]=useState(null);
  const [marcas,setMarcas]=useState([]);
  const [busq,setBusq]=useState("");
  const [marca,setMarca]=useState(null);
  const [abriendo,setAbriendo]=useState(null);
  const [err,setErr]=useState("");
  const [pagina,setPagina]=useState(1);
  const [disponible,setDisponible]=useState(true);

  const POR_PAGINA=36;

  useEffect(()=>{
    // En el sitio se piden todos, incluidos los de escritorio: la
    // pantalla grande los aguanta.
    const q=`vivo=${vivo?1:0}&movil=0`+(user?.id?`&user_id=${user.id}`:"");
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
      window.open(d.url,"_blank");
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
      <div style={{fontSize:38,marginBottom:12}}>🎰</div>
      <div style={{color:Q.muted,fontSize:13,lineHeight:1.6,
        fontFamily:F_BODY}}>
        El casino no está disponible por ahora.</div>
    </div>
  );

  return(
    <div style={{padding:"12px 12px 20px"}}>
      <input value={busq}
        onChange={e=>{ setBusq(e.target.value); setPagina(1); }}
        placeholder="Buscar juego…"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,
          padding:"11px 13px",color:Q.text,fontSize:14,marginBottom:10,
          fontFamily:F_BODY}}/>

      {marcas.length>1&&(
        <div style={{display:"flex",gap:6,overflowX:"auto",
          marginBottom:12,paddingBottom:2}}>
          <button onClick={()=>{ setMarca(null); setPagina(1); }}
            style={{background:!marca?`${Q.violet}33`:"transparent",
              border:`1px solid ${!marca?Q.violet:Q.border}`,
              borderRadius:8,padding:"7px 13px",cursor:"pointer",
              color:!marca?Q.cyan:Q.muted,fontSize:12,
              whiteSpace:"nowrap",flexShrink:0,
              fontFamily:F_BODY}}>Todos</button>
          {marcas.map(m=>{
            const on=marca===m;
            const col=_colorMarca(m);
            return(
              <button key={m} onClick={()=>{ setMarca(m); setPagina(1); }}
                style={{background:on?col:"rgba(255,255,255,0.05)",
                  border:`1px solid ${on?col:Q.border}`,
                  borderRadius:9,padding:"9px 15px",cursor:"pointer",
                  color:on?"#fff":Q.muted,fontSize:12.5,
                  fontWeight:on?700:500,
                  whiteSpace:"nowrap",flexShrink:0,
                  fontFamily:F_BODY}}>{m}</button>
            );
          })}
        </div>
      )}

      {err&&(
        <div style={{color:Q.red,fontSize:12.5,marginBottom:10,
          textAlign:"center",lineHeight:1.45,
          fontFamily:F_BODY}}>{err}</div>
      )}

      <div style={{color:Q.dim,fontSize:10.5,marginBottom:9,
        fontFamily:F_BODY}}>
        {filtrados.length.toLocaleString("es-AR")}{" "}
        {filtrados.length===1?"juego":"juegos"}</div>

      {/* Se adapta al ancho disponible en vez de un número fijo de
          columnas, que en pantallas intermedias deja los juegos
          apretados o con huecos. */}
      <div style={{display:"grid",
        gridTemplateColumns:`repeat(auto-fill,minmax(${ancho?130:100}px,1fr))`,
        gap:10}}>
        {visibles.map(j=>(
          <div key={j.id} onClick={()=>abrir(j)}
            style={{cursor:"pointer",opacity:abriendo===j.id?0.5:1}}>
            <div style={{position:"relative",paddingTop:"100%",
              borderRadius:10,overflow:"hidden",
              background:"rgba(255,255,255,0.05)"}}>
              {/* Las imágenes vienen del servidor del proveedor. Si
                  no cargan, en vez de un recuadro vacío se muestra el
                  nombre: el jugador ve qué juego es igual. */}
              <div style={{position:"absolute",inset:0,display:"flex",
                alignItems:"center",justifyContent:"center",
                padding:"6px",textAlign:"center",color:Q.dim,
                fontSize:9.5,lineHeight:1.3,
                fontFamily:F_BODY}}>{j.titulo}</div>
              {j.imagen&&(
                <img src={j.imagen} alt={j.titulo} loading="lazy"
                  onError={e=>{ e.target.style.display="none"; }}
                  style={{position:"absolute",inset:0,width:"100%",
                    height:"100%",objectFit:"cover"}}/>
              )}
              {j.marca&&(
                <div style={{position:"absolute",left:0,bottom:0,
                  background:_colorMarca(j.marca),color:"#fff",
                  fontSize:8,fontWeight:700,padding:"3px 6px",
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
                  fontSize:11}}>Abriendo…</div>
              )}
            </div>
            <div style={{color:Q.text,fontSize:11,marginTop:5,
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
            border:`1px solid ${Q.border}`,borderRadius:10,
            padding:"12px",color:Q.muted,fontSize:13,cursor:"pointer",
            fontFamily:F_BODY}}>
          Ver más ({(filtrados.length-visibles.length).toLocaleString("es-AR")} restantes)</button>
      )}

      {filtrados.length===0&&(
        <div style={{textAlign:"center",padding:"30px 20px",
          color:Q.muted,fontSize:13,lineHeight:1.55,
          fontFamily:F_BODY}}>
          No encontramos juegos con ese nombre.</div>
      )}
    </div>
  );
}


function DesafiosWeb({ sesion, ancho }){
  const [tab,setTab]=useState("muro");
  const [cfg,setCfg]=useState(null);
  const [saldo,setSaldo]=useState(null);
  const [cargando,setCargando]=useState(true);

  const uid=sesion?.user?.id;

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
      .then(r=>r.ok?r.json():null).then(d=>setCfg(d))
      .catch(()=>{}).finally(()=>setCargando(false));
    cargarSaldo();
    // eslint-disable-next-line
  },[uid]);

  if(!uid) return(
    <div style={{padding:"50px 24px",textAlign:"center",maxWidth:440,
      margin:"0 auto"}}>
      <div style={{fontSize:40,marginBottom:14}}>🤝</div>
      <div style={{color:Q.text,fontSize:19,fontWeight:700,marginBottom:9,
        fontFamily:F_BODY}}>Desafíos</div>
      <div style={{color:Q.muted,fontSize:13.5,lineHeight:1.6,
        fontFamily:F_BODY}}>
        Apostá contra otros jugadores, no contra la casa.<br/>
        Entrá a tu cuenta para empezar.</div>
    </div>
  );

  if(cargando) return(
    <div style={{padding:"50px",textAlign:"center",color:Q.muted,
      fontSize:14,fontFamily:F_BODY}}>Cargando…</div>
  );

  if(!cfg?.activo) return(
    <div style={{padding:"50px 24px",textAlign:"center",maxWidth:440,
      margin:"0 auto"}}>
      <div style={{fontSize:40,marginBottom:14}}>🤝</div>
      <div style={{color:Q.text,fontSize:19,fontWeight:700,marginBottom:9,
        fontFamily:F_BODY}}>Desafíos</div>
      <div style={{color:Q.muted,fontSize:13.5,lineHeight:1.6,
        fontFamily:F_BODY}}>
        Tu agencia todavía no tiene este producto habilitado.</div>
    </div>
  );

  const user={id:uid, ...sesion.user};

  return(
    <div style={{maxWidth:ancho?900:560,margin:"0 auto",
      padding:"16px 14px 40px"}}>
      <div onClick={()=>setTab("iacoin")}
        style={{background:`linear-gradient(135deg,${Q.violet}22,${Q.cyan}11)`,
          border:`1px solid ${Q.violet}55`,borderRadius:12,
          padding:"14px 16px",marginBottom:14,cursor:"pointer",
          display:"flex",justifyContent:"space-between",
          alignItems:"center"}}>
        <div>
          <div style={{color:Q.muted,fontSize:10.5,letterSpacing:0.5,
            fontFamily:F_BODY}}>TU SALDO PARA DESAFÍOS</div>
          <div style={{color:Q.gold,fontWeight:900,fontSize:24,
            fontFamily:F_NUM}}>
            {(saldo?.iacoin||0).toLocaleString("es-AR",
              {maximumFractionDigits:2})}
            <span style={{color:Q.muted,fontSize:13,fontWeight:400,
              marginLeft:6,fontFamily:F_BODY}}>IACOIN</span></div>
        </div>
        <span style={{background:`${Q.cyan}22`,
          border:`1px solid ${Q.cyan}66`,borderRadius:9,
          padding:"10px 16px",color:Q.cyan,fontSize:13,fontWeight:700,
          fontFamily:F_BODY}}>Comprar</span>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:16,
        overflowX:"auto"}}>
        {[["muro","🔥 Muro"],["crear","➕ Desafiar"],
          ["mias","📋 Mías"],["iacoin","🪙 IACOIN"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{background:tab===k?`${Q.violet}33`:"transparent",
              border:`1px solid ${tab===k?Q.violet:Q.border}`,
              borderRadius:9,padding:"9px 15px",cursor:"pointer",
              color:tab===k?Q.cyan:Q.muted,fontSize:13,
              fontWeight:tab===k?700:400,whiteSpace:"nowrap",
              fontFamily:F_BODY}}>{l}</button>
        ))}
      </div>

      {tab==="muro"  &&<MuroDesafiosWeb user={user} onCambio={cargarSaldo}/>}
      {tab==="crear" &&<CrearDesafioWeb user={user} cfg={cfg}
                         saldo={saldo?.iacoin||0}
                         onListo={()=>{ setTab("mias"); cargarSaldo(); }}/>}
      {tab==="mias"  &&<MisDesafiosWeb user={user} onCambio={cargarSaldo}/>}
      {tab==="iacoin"&&<PanelIacoinWeb user={user} saldo={saldo}
                         onCambio={cargarSaldo}/>}
    </div>
  );
}


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
    <div style={{marginTop:8,paddingTop:9,
      borderTop:`1px solid ${Q.border}`}}>
      {lista===null&&(
        <div style={{color:Q.dim,fontSize:11,textAlign:"center",
          padding:"6px 0"}}>Cargando…</div>
      )}
      {(lista||[]).map(c=>(
        <div key={c.id} style={{marginBottom:7}}>
          <span style={{color:Q.cyan,fontSize:11,fontWeight:600}}>
            {c.autor}</span>
          <span style={{color:Q.dim,fontSize:9,marginLeft:5}}>{c.hace}</span>
          <div style={{color:Q.muted,fontSize:12,lineHeight:1.45}}>
            {c.texto}</div>
        </div>
      ))}
      {lista&&lista.length===0&&(
        <div style={{color:Q.dim,fontSize:11,marginBottom:6,
          lineHeight:1.45}}>
          Todavía nadie comentó. Rompé el hielo.</div>
      )}
      {err&&<div style={{color:Q.red,fontSize:11,marginBottom:5,
        lineHeight:1.4}}>{err}</div>}
      <div style={{display:"flex",gap:6}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)}
          placeholder="Decí algo…"
          onKeyDown={e=>{ if(e.key==="Enter") enviar(); }}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:8,
            padding:"8px 11px",color:Q.text,fontSize:12,minWidth:0}}/>
        <button onClick={enviar} disabled={proc||!texto.trim()}
          style={{background:`${Q.violet}33`,
            border:`1px solid ${Q.violet}`,borderRadius:8,
            padding:"8px 13px",color:Q.cyan,fontSize:12,
            cursor:"pointer",flexShrink:0}}>→</button>
      </div>
    </div>
  );
}


function MuroDesafiosWeb({ user, onCambio }){
  const [posts,setPosts]=useState(null);
  const [abiertos,setAbiertos]=useState([]);
  const [texto,setTexto]=useState("");
  const [msg,setMsg]=useState("");
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
      setPosts(m?.posts||[]); setAbiertos(a?.apuestas||[]);
    }catch(e){ setPosts([]); }
  };
  useEffect(()=>{ cargar(); /* eslint-disable-next-line */ },[]);

  const publicar=async()=>{
    if(!texto.trim()) return;
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/muro/publicar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, texto:texto.trim()})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo publicar");
      setTexto(""); cargar();
    }catch(e){ setMsg(e.message); }
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
      setMsg("✅ "+(d.aviso||"Aceptado")); cargar(); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
  };

  const like=async(id)=>{
    try{
      await fetch(`${API}/api/muro/${id}/like`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id})});
      setPosts(p=>p.map(x=>x.id===id
        ?{...x,me_gusta:!x.me_gusta,likes:x.likes+(x.me_gusta?-1:1)}:x));
    }catch(e){}
  };

  const denunciar=async(id)=>{
    const motivo=window.prompt("¿Qué problema tiene?");
    if(!motivo) return;
    try{
      await fetch(`${API}/api/muro/denunciar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, post_id:id, motivo})});
      setMsg("Gracias. Lo vamos a revisar.");
    }catch(e){}
  };

  return(
    <div>
      {msg&&<div style={{color:Q.muted,fontSize:12.5,marginBottom:12,
        textAlign:"center",lineHeight:1.45,fontFamily:F_BODY}}>{msg}</div>}

      <div style={{marginBottom:18}}>
        <textarea value={texto} onChange={e=>setTexto(e.target.value)}
          placeholder="¿Qué vas a jugar hoy?" rows={2}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:10,
            padding:"11px 13px",color:Q.text,fontSize:14,resize:"none",
            fontFamily:F_BODY}}/>
        {texto.trim()&&(
          <button onClick={publicar} disabled={proc}
            style={{width:"100%",marginTop:7,
              background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
              border:"none",borderRadius:9,padding:"11px",color:"#fff",
              fontSize:13.5,fontWeight:700,cursor:"pointer",
              fontFamily:F_BODY}}>
            {proc?"Publicando…":"Publicar"}</button>
        )}
      </div>

      {abiertos.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{color:Q.muted,fontSize:11,letterSpacing:0.5,
            marginBottom:9,fontFamily:F_BODY}}>DESAFÍOS ESPERANDO</div>
          {abiertos.map(a=>(
            <div key={a.id} style={{background:Q.card,
              border:`1px solid ${Q.gold}44`,borderRadius:12,
              padding:15,marginBottom:10}}>
              <div style={{color:Q.text,fontSize:14.5,fontWeight:600,
                lineHeight:1.4,fontFamily:F_BODY}}>{a.titulo}</div>
              {a.descripcion&&(
                <div style={{color:Q.muted,fontSize:12,marginTop:4,
                  lineHeight:1.5,fontFamily:F_BODY}}>{a.descripcion}</div>
              )}
              <div style={{color:Q.dim,fontSize:10.5,marginTop:6,
                fontFamily:F_BODY}}>{a.creador} · {a.hace}</div>

              <div style={{display:"flex",gap:12,marginTop:11,
                paddingTop:11,borderTop:`1px solid ${Q.border}`}}>
                <div style={{flex:1}}>
                  <div style={{color:Q.muted,fontSize:10,
                    fontFamily:F_BODY}}>Él pone</div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:16,
                    fontFamily:F_NUM}}>
                    {a.pone_el_creador.toLocaleString("es-AR")}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{color:Q.muted,fontSize:10,
                    fontFamily:F_BODY}}>Vos ponés</div>
                  <div style={{color:Q.cyan,fontWeight:700,fontSize:16,
                    fontFamily:F_NUM}}>
                    {a.tenes_que_poner.toLocaleString("es-AR")}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{color:Q.muted,fontSize:10,
                    fontFamily:F_BODY}}>Si ganás</div>
                  <div style={{color:Q.green,fontWeight:700,fontSize:16,
                    fontFamily:F_NUM}}>
                    +{a.podes_ganar.toLocaleString("es-AR")}</div>
                </div>
              </div>

              {a.es_mio ? (
                <div style={{marginTop:9,padding:"10px",textAlign:"center",
                  background:"rgba(255,255,255,0.03)",
                  border:`1px dashed ${Q.border}`,borderRadius:9,
                  color:Q.muted,fontSize:11.5,lineHeight:1.45}}>
                  Es tuyo · esperando que alguien lo tome</div>
              ) : (
              <button onClick={()=>aceptar(a.id)}
                style={{width:"100%",marginTop:11,
                  background:`linear-gradient(135deg,${Q.gold},#c9a227)`,
                  border:"none",borderRadius:10,padding:"12px",
                  color:"#1a1200",fontSize:14,fontWeight:800,
                  cursor:"pointer",fontFamily:F_BODY}}>
                Aceptar el desafío</button>
              )}
              <div style={{color:Q.dim,fontSize:10,textAlign:"center",
                marginTop:6,fontFamily:F_BODY}}>
                Comisión {a.comision_pct}% sobre lo que pone cada uno</div>
              {/* La conversación alrededor del desafío. Es lo que
                  hace que alguien se anime a tomarlo. */}
              <button onClick={()=>setComDesafio(
                  comDesafio===a.id?null:a.id)}
                style={{width:"100%",marginTop:8,background:"none",
                  border:"none",cursor:"pointer",color:Q.muted,
                  fontSize:11.5,padding:"4px 0"}}>
                💬 {a.comentarios>0
                  ? `${a.comentarios} ${a.comentarios===1?"comentario":"comentarios"}`
                  : "Comentar"}</button>

              {comDesafio===a.id&&(
                <ComentariosDesafio desafioId={a.id} user={user}
                  onNuevo={()=>cargar()}/>
              )}
            </div>
          ))}
        </div>
      )}

      {posts===null&&(
        <div style={{color:Q.muted,textAlign:"center",padding:24,
          fontSize:13,fontFamily:F_BODY}}>Cargando…</div>
      )}

      {posts&&posts.length===0&&abiertos.length===0&&(
        <div style={{textAlign:"center",padding:"36px 20px"}}>
          <div style={{fontSize:34,marginBottom:12}}>👋</div>
          <div style={{color:Q.muted,fontSize:13.5,lineHeight:1.6,
            fontFamily:F_BODY}}>
            Todavía no hay nada por acá.<br/>Creá el primer desafío.</div>
        </div>
      )}

      {(posts||[]).map(p=>(
        <div key={p.id} style={{background:Q.card,
          border:`1px solid ${Q.border}`,borderRadius:12,
          padding:15,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"baseline",marginBottom:6}}>
            <span style={{color:Q.cyan,fontSize:13,fontWeight:700,
              fontFamily:F_BODY}}>{p.autor}</span>
            <span style={{color:Q.dim,fontSize:10,
              fontFamily:F_BODY}}>{p.hace}</span>
          </div>

          {p.texto&&(
            <div style={{color:Q.text,fontSize:14,lineHeight:1.55,
              fontFamily:F_BODY}}>{p.texto}</div>
          )}

          <div style={{display:"flex",gap:16,marginTop:11,paddingTop:10,
            borderTop:`1px solid ${Q.border}`,alignItems:"center"}}>
            <button onClick={()=>like(p.id)}
              style={{background:"none",border:"none",cursor:"pointer",
                color:p.me_gusta?Q.pink:Q.muted,fontSize:13,padding:0,
                fontFamily:F_BODY}}>
              {p.me_gusta?"♥":"♡"} {p.likes>0?p.likes:""}</button>
            <button onClick={()=>setVerCom(verCom===p.id?null:p.id)}
              style={{background:"none",border:"none",cursor:"pointer",
                color:Q.muted,fontSize:13,padding:0,fontFamily:F_BODY}}>
              💬 {p.comentarios>0?p.comentarios:""}</button>
            {!p.es_mio&&(
              <button onClick={()=>denunciar(p.id)}
                style={{background:"none",border:"none",cursor:"pointer",
                  color:Q.dim,fontSize:11.5,padding:0,marginLeft:"auto",
                  fontFamily:F_BODY}}>Reportar</button>
            )}
          </div>

          {verCom===p.id&&(
            <ComentariosWeb postId={p.id} user={user}
              onNuevo={()=>setPosts(x=>x.map(y=>y.id===p.id
                ?{...y,comentarios:y.comentarios+1}:y))}/>
          )}
        </div>
      ))}
    </div>
  );
}


function ComentariosWeb({ postId, user, onNuevo }){
  const [lista,setLista]=useState(null);
  const [texto,setTexto]=useState("");
  const [err,setErr]=useState("");
  const [proc,setProc]=useState(false);

  const cargar=()=>{
    fetch(`${API}/api/muro/${postId}/comentarios`)
      .then(r=>r.ok?r.json():null)
      .then(d=>setLista(d?.comentarios||[])).catch(()=>setLista([]));
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
    <div style={{marginTop:11,paddingTop:11,
      borderTop:`1px solid ${Q.border}`}}>
      {(lista||[]).map(c=>(
        <div key={c.id} style={{marginBottom:9}}>
          <span style={{color:Q.cyan,fontSize:12,fontWeight:600,
            fontFamily:F_BODY}}>{c.autor}</span>
          <span style={{color:Q.dim,fontSize:9.5,marginLeft:6,
            fontFamily:F_BODY}}>{c.hace}</span>
          <div style={{color:Q.muted,fontSize:13,lineHeight:1.5,
            fontFamily:F_BODY}}>{c.texto}</div>
        </div>
      ))}
      {err&&<div style={{color:Q.red,fontSize:11.5,marginBottom:6,
        lineHeight:1.4,fontFamily:F_BODY}}>{err}</div>}
      <div style={{display:"flex",gap:7,marginTop:7}}>
        <input value={texto} onChange={e=>setTexto(e.target.value)}
          placeholder="Comentar…"
          onKeyDown={e=>{ if(e.key==="Enter") enviar(); }}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:8,
            padding:"9px 12px",color:Q.text,fontSize:13,minWidth:0,
            fontFamily:F_BODY}}/>
        <button onClick={enviar} disabled={proc||!texto.trim()}
          style={{background:`${Q.violet}33`,
            border:`1px solid ${Q.violet}`,borderRadius:8,
            padding:"9px 15px",color:Q.cyan,fontSize:13,
            cursor:"pointer",flexShrink:0,fontFamily:F_BODY}}>→</button>
      </div>
    </div>
  );
}


function CrearDesafioWeb({ user, cfg, saldo, onListo }){
  const [titulo,setTitulo]=useState("");
  const [desc,setDesc]=useState("");
  const [pongo,setPongo]=useState("");
  const [pido,setPido]=useState("");
  const [coincidencias,setCoincidencias]=useState([]);
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);

  // Se buscan coincidencias mientras escribe: si ya existe lo
  // contrario, tomarlo arranca al instante en vez de esperar.
  useEffect(()=>{
    if(!titulo.trim()||!pongo||!pido){ setCoincidencias([]); return; }
    const t=setTimeout(()=>{
      fetch(`${API}/api/p2p/buscar-coincidencia`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, titulo:titulo.trim(),
          monto_creador:parseFloat(pongo)||0,
          monto_aceptador:parseFloat(pido)||0})})
        .then(r=>r.ok?r.json():null)
        .then(d=>setCoincidencias(d?.coincidencias||[])).catch(()=>{});
    },700);
    return()=>clearTimeout(t);
    // eslint-disable-next-line
  },[titulo,pongo,pido]);

  const crear=async()=>{
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/p2p/crear`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, titulo:titulo.trim(),
          descripcion:desc.trim()||null,
          monto_creador:parseFloat(pongo)||0,
          monto_aceptador:parseFloat(pido)||0})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo crear");
      setMsg("✅ "+(d.aviso||"Listo"));
      setTitulo(""); setDesc(""); setPongo(""); setPido("");
      setTimeout(()=>onListo&&onListo(),1200);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const aceptarExistente=async(id)=>{
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/p2p/${id}/aceptar`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setMsg("✅ "+(d.aviso||"Aceptado"));
      setTimeout(()=>onListo&&onListo(),1200);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const inp={width:"100%",background:"rgba(255,255,255,0.05)",
    border:`1px solid ${Q.border}`,borderRadius:10,padding:"12px 14px",
    color:Q.text,fontSize:14.5,marginBottom:11,fontFamily:F_BODY};

  const nPongo=parseFloat(pongo)||0;
  const nPido=parseFloat(pido)||0;
  const pozo=nPongo+nPido;
  const com=cfg?.comision_pct||0;
  const gano=pozo>0?(nPongo*(1-com/100)+nPido*(1-com/100))-nPongo:0;

  return(
    <div>
      {msg&&<div style={{color:msg.startsWith("✅")?Q.green:Q.red,
        fontSize:13,marginBottom:12,textAlign:"center",lineHeight:1.5,
        fontFamily:F_BODY}}>{msg}</div>}

      <div style={{color:Q.muted,fontSize:12.5,marginBottom:14,
        lineHeight:1.6,fontFamily:F_BODY}}>
        Proponé algo concreto y decí cuánto ponés. Si alguien lo toma,
        el que acierta se lleva el pozo.</div>

      <div style={{color:Q.muted,fontSize:11.5,marginBottom:5,
        fontFamily:F_BODY}}>¿Qué apostás?</div>
      <input value={titulo} onChange={e=>setTitulo(e.target.value)}
        placeholder="River le gana a Boca" style={inp}/>

      <div style={{color:Q.muted,fontSize:11.5,marginBottom:5,
        fontFamily:F_BODY}}>Detalles (opcional)</div>
      <textarea value={desc} onChange={e=>setDesc(e.target.value)}
        rows={2} placeholder="Cuanto más claro, menos discusiones después"
        style={{...inp,resize:"none"}}/>

      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:11.5,marginBottom:5,
            fontFamily:F_BODY}}>Yo pongo</div>
          <input value={pongo} inputMode="decimal"
            onChange={e=>setPongo(e.target.value.replace(/[^\d.]/g,""))}
            placeholder="0" style={inp}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:11.5,marginBottom:5,
            fontFamily:F_BODY}}>El otro pone</div>
          <input value={pido} inputMode="decimal"
            onChange={e=>setPido(e.target.value.replace(/[^\d.]/g,""))}
            placeholder="0" style={inp}/>
        </div>
      </div>

      <div style={{color:Q.dim,fontSize:11,marginTop:-5,marginBottom:14,
        lineHeight:1.5,fontFamily:F_BODY}}>
        Tenés {saldo.toLocaleString("es-AR",{maximumFractionDigits:2})} IACOIN
        {cfg&&` · entre ${cfg.monto_min} y ${cfg.monto_max} por lado`}</div>

      {pozo>0&&(
        <div style={{background:Q.card,border:`1px solid ${Q.border}`,
          borderRadius:11,padding:15,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:13,padding:"3px 0",fontFamily:F_BODY}}>
            <span style={{color:Q.muted}}>Pozo</span>
            <span style={{color:Q.text}}>
              {pozo.toLocaleString("es-AR")}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:13,padding:"3px 0",fontFamily:F_BODY}}>
            <span style={{color:Q.muted}}>Comisión {com}% de cada uno</span>
            <span style={{color:Q.gold}}>
              −{(pozo*com/100).toLocaleString("es-AR",
                {maximumFractionDigits:2})}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:14,paddingTop:9,marginTop:6,
            borderTop:`1px solid ${Q.border}`,fontFamily:F_BODY}}>
            <span style={{color:Q.text,fontWeight:700}}>Si ganás</span>
            <span style={{color:Q.green,fontWeight:800,
              fontFamily:F_NUM,fontSize:17}}>
              +{gano.toLocaleString("es-AR",{maximumFractionDigits:2})}</span>
          </div>
        </div>
      )}

      {coincidencias.length>0&&(
        <div style={{background:Q.card,border:`1px solid ${Q.gold}55`,
          borderRadius:11,padding:15,marginBottom:14}}>
          <div style={{color:Q.gold,fontSize:13,fontWeight:700,
            marginBottom:8,fontFamily:F_BODY}}>
            Ya hay alguien esperando</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:10,
            lineHeight:1.55,fontFamily:F_BODY}}>
            Si tomás uno de estos empieza ahora, en vez de esperar a
            que alguien tome el tuyo.</div>
          {coincidencias.map(c=>(
            <div key={c.id} style={{padding:"10px 0",
              borderTop:`1px solid ${Q.border}`}}>
              <div style={{color:Q.text,fontSize:13.5,lineHeight:1.45,
                fontFamily:F_BODY}}>{c.titulo}</div>
              <div style={{color:Q.dim,fontSize:11,marginTop:3,
                fontFamily:F_BODY}}>
                {c.creador} · él pone {c.el_pone.toLocaleString("es-AR")} ·
                vos {c.vos_ponés.toLocaleString("es-AR")}</div>
              <button onClick={()=>aceptarExistente(c.id)} disabled={proc}
                style={{width:"100%",marginTop:7,background:`${Q.gold}22`,
                  border:`1px solid ${Q.gold}`,borderRadius:9,
                  padding:"10px",color:Q.gold,fontSize:13,fontWeight:700,
                  cursor:"pointer",fontFamily:F_BODY}}>
                Tomar este</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={crear}
        disabled={proc||!titulo.trim()||!nPongo||!nPido}
        style={{width:"100%",
          background:(!titulo.trim()||!nPongo||!nPido)
            ?"rgba(255,255,255,0.06)"
            :`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:11,padding:"15px",
          color:(!titulo.trim()||!nPongo||!nPido)?Q.dim:"#fff",
          fontSize:15,fontWeight:800,cursor:proc?"default":"pointer",
          fontFamily:F_BODY}}>
        {proc?"Creando…":"Publicar desafío"}</button>

      <div style={{color:Q.dim,fontSize:11,textAlign:"center",marginTop:9,
        lineHeight:1.5,fontFamily:F_BODY}}>
        Tu saldo queda retenido hasta que alguien lo tome o venza.</div>
    </div>
  );
}


function MisDesafiosWeb({ user, onCambio }){
  const [lista,setLista]=useState(null);
  const [msg,setMsg]=useState("");

  const cargar=()=>{
    fetch(`${API}/api/p2p/mis-apuestas/${user.id}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>setLista(d?.apuestas||[])).catch(()=>setLista([]));
  };
  useEffect(cargar,[user.id]);

  const declarar=async(id,ganador)=>{
    try{
      const r=await fetch(`${API}/api/p2p/${id}/resultado`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, ganador})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setMsg(d.mensaje||"Listo"); cargar(); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
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
      setMsg("Cancelado, te devolvimos el saldo");
      cargar(); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
  };

  const ETIQUETA={abierta:{t:"Esperando",c:Q.gold},
    tomada:{t:"En juego",c:Q.cyan},resuelta:{t:"Terminado",c:Q.muted},
    anulada:{t:"Cancelado",c:Q.dim},vencida:{t:"Vencido",c:Q.dim}};

  if(lista===null) return(
    <div style={{color:Q.muted,textAlign:"center",padding:24,
      fontSize:13,fontFamily:F_BODY}}>Cargando…</div>
  );

  if(!lista.length) return(
    <div style={{textAlign:"center",padding:"36px 20px"}}>
      <div style={{color:Q.muted,fontSize:13.5,lineHeight:1.6,
        fontFamily:F_BODY}}>
        Todavía no participaste de ningún desafío.</div>
    </div>
  );

  return(
    <div>
      {msg&&<div style={{color:Q.muted,fontSize:12.5,marginBottom:12,
        textAlign:"center",lineHeight:1.5,fontFamily:F_BODY}}>{msg}</div>}

      {lista.map(d=>{
        const e=ETIQUETA[d.estado]||{t:d.estado,c:Q.muted};
        return(
          <div key={d.id} style={{background:Q.card,
            border:`1px solid ${Q.border}`,borderRadius:12,
            padding:15,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",gap:10}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontSize:14,fontWeight:600,
                  lineHeight:1.45,fontFamily:F_BODY}}>{d.titulo}</div>
                <div style={{color:Q.dim,fontSize:11,marginTop:4,
                  fontFamily:F_BODY}}>
                  Pusiste {d.puse.toLocaleString("es-AR")}
                  {d.rival&&` · contra ${d.rival}`} · {d.hace}</div>
              </div>
              <span style={{background:`${e.c}22`,
                border:`1px solid ${e.c}66`,borderRadius:14,
                padding:"3px 10px",fontSize:10,color:e.c,flexShrink:0,
                whiteSpace:"nowrap",fontWeight:700,
                fontFamily:F_BODY}}>{e.t}</span>
            </div>

            {d.estado==="abierta"&&(
              <button onClick={()=>cancelar(d.id)}
                style={{width:"100%",marginTop:11,background:"transparent",
                  border:`1px solid ${Q.border}`,borderRadius:9,
                  padding:"10px",color:Q.muted,fontSize:13,
                  cursor:"pointer",fontFamily:F_BODY}}>
                Cancelar y recuperar mi saldo</button>
            )}

            {d.estado==="tomada"&&!d.disputa&&(
              <div style={{marginTop:12,paddingTop:11,
                borderTop:`1px solid ${Q.border}`}}>
                <div style={{color:Q.muted,fontSize:12,marginBottom:9,
                  lineHeight:1.5,fontFamily:F_BODY}}>
                  Cuando termine, decinos quién ganó. Si los dos
                  coinciden se paga solo.</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>declarar(d.id,
                      d.soy_creador?"creador":"aceptador")}
                    style={{flex:1,background:`${Q.green}18`,
                      border:`1px solid ${Q.green}66`,borderRadius:9,
                      padding:"10px",color:Q.green,fontSize:13,
                      fontWeight:700,cursor:"pointer",
                      fontFamily:F_BODY}}>Gané yo</button>
                  <button onClick={()=>declarar(d.id,
                      d.soy_creador?"aceptador":"creador")}
                    style={{flex:1,background:"transparent",
                      border:`1px solid ${Q.border}`,borderRadius:9,
                      padding:"10px",color:Q.muted,fontSize:13,
                      cursor:"pointer",fontFamily:F_BODY}}>Ganó él</button>
                  <button onClick={()=>declarar(d.id,"empate")}
                    style={{background:"transparent",
                      border:`1px solid ${Q.border}`,borderRadius:9,
                      padding:"10px 14px",color:Q.muted,fontSize:13,
                      cursor:"pointer",fontFamily:F_BODY}}>Empate</button>
                </div>
              </div>
            )}

            {d.disputa&&d.disputa_estado==="abierta"&&(
              <div style={{marginTop:11,padding:"11px 13px",
                background:`${Q.gold}12`,border:`1px solid ${Q.gold}44`,
                borderRadius:9,color:Q.gold,fontSize:12,lineHeight:1.55,
                fontFamily:F_BODY}}>
                No coincidieron. Lo está revisando nuestro equipo y te
                avisamos. Tu saldo sigue retenido.</div>
            )}

            {d.estado==="resuelta"&&(
              <div style={{marginTop:11,paddingTop:10,
                borderTop:`1px solid ${Q.border}`,display:"flex",
                justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:d.gane?Q.green:Q.muted,fontSize:13,
                  fontWeight:700,fontFamily:F_BODY}}>
                  {d.gane?"Ganaste":"Perdiste"}</span>
                {d.gane&&(
                  <span style={{color:Q.green,fontWeight:800,fontSize:17,
                    fontFamily:F_NUM}}>
                    +{d.cobre.toLocaleString("es-AR",
                      {maximumFractionDigits:2})}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


function PanelIacoinWeb({ user, saldo, onCambio }){
  const [modo,setModo]=useState("comprar");
  const [cantidad,setCantidad]=useState("");
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);

  const cot=saldo?.cotizacion;
  const n=parseFloat(cantidad)||0;
  const precio=modo==="comprar"?(cot?.compra||0):(cot?.venta||0);
  const total=n*precio;

  const operar=async()=>{
    setProc(true); setMsg("");
    try{
      const r=await fetch(
        `${API}/api/iacoin/${modo==="comprar"?"comprar":"vender"}`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({user_id:user.id, cantidad:n})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.detail||"No se pudo");
      setMsg(modo==="comprar"
        ?`✅ Compraste ${n} IACOIN por ${d.pagaste.toLocaleString("es-AR")}`
        :`✅ Vendiste ${n} IACOIN por ${d.recibiste.toLocaleString("es-AR")}`);
      setCantidad(""); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  if(!cot) return(
    <div style={{textAlign:"center",padding:"36px 20px"}}>
      <div style={{color:Q.muted,fontSize:13.5,lineHeight:1.6,
        fontFamily:F_BODY}}>
        Todavía no hay cotización para tu moneda.<br/>
        Avisale a tu agencia.</div>
    </div>
  );

  return(
    <div>
      <div style={{background:Q.card,border:`1px solid ${Q.gold}44`,
        borderRadius:12,padding:17,marginBottom:14}}>
        <div style={{color:Q.muted,fontSize:10.5,letterSpacing:0.5,
          marginBottom:9,fontFamily:F_BODY}}>COTIZACIÓN</div>
        <div style={{display:"flex",gap:16}}>
          <div style={{flex:1}}>
            <div style={{color:Q.muted,fontSize:11,
              fontFamily:F_BODY}}>Comprás a</div>
            <div style={{color:Q.text,fontWeight:800,fontSize:19,
              fontFamily:F_NUM}}>
              {cot.compra.toLocaleString("es-AR")}</div>
          </div>
          <div style={{flex:1}}>
            <div style={{color:Q.muted,fontSize:11,
              fontFamily:F_BODY}}>Vendés a</div>
            <div style={{color:Q.muted,fontWeight:700,fontSize:19,
              fontFamily:F_NUM}}>
              {cot.venta.toLocaleString("es-AR")}</div>
          </div>
        </div>
        <div style={{color:Q.dim,fontSize:11,marginTop:9,lineHeight:1.5,
          fontFamily:F_BODY}}>
          1 IACOIN por {saldo.moneda}. Actualizado {cot.desde}.</div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[["comprar","Comprar"],["vender","Vender"]].map(([k,l])=>(
          <button key={k} onClick={()=>{setModo(k);setMsg("");}}
            style={{flex:1,
              background:modo===k?`${Q.violet}33`:"transparent",
              border:`1px solid ${modo===k?Q.violet:Q.border}`,
              borderRadius:10,padding:"11px",cursor:"pointer",
              color:modo===k?Q.cyan:Q.muted,fontSize:14,
              fontWeight:modo===k?700:400,
              fontFamily:F_BODY}}>{l}</button>
        ))}
      </div>

      {msg&&<div style={{color:msg.startsWith("✅")?Q.green:Q.red,
        fontSize:13,marginBottom:12,textAlign:"center",lineHeight:1.5,
        fontFamily:F_BODY}}>{msg}</div>}

      <div style={{color:Q.muted,fontSize:11.5,marginBottom:5,
        fontFamily:F_BODY}}>Cuántos IACOIN</div>
      <input value={cantidad} inputMode="decimal"
        onChange={e=>setCantidad(e.target.value.replace(/[^\d.]/g,""))}
        placeholder="0"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:11,padding:"15px",
          color:Q.text,fontSize:23,fontWeight:700,textAlign:"center",
          marginBottom:11,fontFamily:F_NUM}}/>

      <div style={{display:"flex",gap:7,marginBottom:14}}>
        {[10,50,100,500].map(v=>(
          <button key={v} onClick={()=>setCantidad(String(v))}
            style={{flex:1,background:"rgba(255,255,255,0.04)",
              border:`1px solid ${Q.border}`,borderRadius:8,
              padding:"9px 4px",cursor:"pointer",color:Q.muted,
              fontSize:12.5,fontFamily:F_BODY}}>{v}</button>
        ))}
      </div>

      {n>0&&(
        <div style={{background:Q.card,border:`1px solid ${Q.border}`,
          borderRadius:11,padding:15,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",
            fontSize:14,fontFamily:F_BODY}}>
            <span style={{color:Q.muted}}>
              {modo==="comprar"?"Pagás":"Recibís"}</span>
            <span style={{color:modo==="comprar"?Q.text:Q.green,
              fontWeight:800,fontSize:18,fontFamily:F_NUM}}>
              {total.toLocaleString("es-AR",{maximumFractionDigits:2})}
              <span style={{color:Q.muted,fontSize:12,fontWeight:400,
                marginLeft:5,fontFamily:F_BODY}}>{saldo.moneda}</span></span>
          </div>
          <div style={{color:Q.dim,fontSize:11,marginTop:6,
            fontFamily:F_BODY}}>
            {modo==="comprar"
              ?`Tenés ${saldo.saldo_local.toLocaleString("es-AR")} ${saldo.moneda}`
              :`Tenés ${saldo.iacoin.toLocaleString("es-AR",{maximumFractionDigits:2})} IACOIN`}</div>
        </div>
      )}

      <button onClick={operar} disabled={proc||!n}
        style={{width:"100%",
          background:!n?"rgba(255,255,255,0.06)"
            :`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:11,padding:"15px",
          color:!n?Q.dim:"#fff",fontSize:15,fontWeight:800,
          cursor:proc?"default":"pointer",fontFamily:F_BODY}}>
        {proc?"Procesando…":(modo==="comprar"?"Comprar IACOIN":"Vender IACOIN")}
      </button>

      {(saldo?.movimientos||[]).length>0&&(
        <div style={{background:Q.card,border:`1px solid ${Q.border}`,
          borderRadius:11,padding:15,marginTop:16}}>
          <div style={{color:Q.muted,fontSize:10.5,letterSpacing:0.5,
            marginBottom:9,fontFamily:F_BODY}}>ÚLTIMOS MOVIMIENTOS</div>
          {saldo.movimientos.map((m,i)=>(
            <div key={i} style={{display:"flex",
              justifyContent:"space-between",fontSize:12.5,
              padding:"6px 0",fontFamily:F_BODY,
              borderTop:i?`1px solid ${Q.border}`:"none"}}>
              <span style={{color:Q.muted}}>
                {{compra:"Compra",venta:"Venta",premio:"Ganaste",
                  retencion:"Desafío",devolucion:"Devolución"}[m.tipo]
                  ||m.tipo}
                <span style={{color:Q.dim,fontSize:10,marginLeft:6}}>
                  {m.hace}</span></span>
              <span style={{color:m.cantidad>=0?Q.green:Q.muted,
                fontFamily:F_NUM}}>
                {m.cantidad>=0?"+":""}{m.cantidad.toLocaleString("es-AR",
                  {maximumFractionDigits:2})}</span>
            </div>
          ))}
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
      borderRadius:10,padding:"10px 12px",marginBottom:10,
      display:"flex",alignItems:"flex-start",gap:9}}>
      <div style={{minWidth:0,flex:1}}>
        <div style={{color:c,fontWeight:700,fontSize:12}}>{a.titulo}</div>
        {a.cuerpo&&(
          <div style={{color:Q.text,fontSize:11,marginTop:3,
            lineHeight:1.5}}>{a.cuerpo}</div>
        )}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
        {visibles.length>1&&(
          <div style={{display:"flex",gap:3}}>
            {visibles.map((_,k)=>(
              <span key={k} style={{width:5,height:5,borderRadius:3,
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

// ── Ingreso del cliente ───────────────────────────────────────
// El cliente entra con el usuario y la clave que le cargó la agencia.
// Desde acá solo consulta y apuesta: cargar y retirar saldo sigue
// siendo presencial, en el mostrador.
function Ingresar({ onEntro, onCerrar }){
  const [usuario,setUsuario]=useState("");
  const [clave,setClave]=useState("");
  const [err,setErr]=useState("");
  const [proc,setProc]=useState(false);

  const entrar=async()=>{
    if(proc) return;
    if(!usuario.trim()||!clave){ setErr("Completá usuario y clave"); return; }
    setProc(true); setErr("");
    try{
      const r=await fetch(`${API}/api/cliente/login`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username:usuario.trim().toLowerCase(),
                             password:clave}),
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.detail||`Error ${r.status}`);
      onEntro(d);
    }catch(e){
      setErr(e.message==="Failed to fetch"
        ? "Sin conexión con el servidor" : e.message);
      setProc(false);
    }
  };

  return(
    <div onClick={onCerrar} style={{position:"fixed",inset:0,zIndex:200,
      background:"rgba(5,9,20,.9)",display:"flex",alignItems:"center",
      justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{..._panel(),
        width:"100%",maxWidth:380}}>
        <div style={{..._phead(),color:Q.text,display:"flex",
          justifyContent:"space-between",alignItems:"center"}}>
          Ingresar
          <button onClick={onCerrar} style={{background:"transparent",
            border:"none",color:Q.muted,fontSize:22,cursor:"pointer",
            padding:0}}>×</button>
        </div>
        <div style={{padding:16}}>
          <input value={usuario} onChange={e=>setUsuario(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&entrar()}
            placeholder="Usuario" aria-label="Usuario" autoCapitalize="none"
            style={{width:"100%",background:Q.inset,
              border:`1px solid ${Q.border}`,borderRadius:8,
              padding:"11px 13px",color:Q.text,fontSize:15,marginBottom:9}}/>
          <input value={clave} onChange={e=>setClave(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&entrar()}
            type="password" placeholder="Clave" aria-label="Clave"
            style={{width:"100%",background:Q.inset,
              border:`1px solid ${Q.border}`,borderRadius:8,
              padding:"11px 13px",color:Q.text,fontSize:15,marginBottom:12}}/>

          {err&&<div style={{background:`${Q.red}1A`,
            border:`1px solid ${Q.red}`,borderRadius:8,padding:"9px 11px",
            marginBottom:11,fontSize:12.5}}>{err}</div>}

          <button onClick={entrar} disabled={proc} style={_btnPrim()}>
            {proc?"Entrando…":"Entrar"}</button>

          <div style={{color:Q.dim,fontSize:11,marginTop:12,lineHeight:1.5,
            textAlign:"center"}}>
            El usuario y la clave te los da tu agencia. Desde acá podés
            consultar tu cuenta y apostar; para cargar o retirar saldo
            tenés que ir a la agencia.</div>
        </div>
      </div>
    </div>
  );
}

// ── Consultar un boleto por código ────────────────────────────
function ConsultarBoleto({ onCerrar }){
  const [code,setCode]=useState("");
  const [res,setRes]=useState(null);
  const [err,setErr]=useState("");
  const [busca,setBusca]=useState(false);

  const buscar=async()=>{
    const c=code.trim().toUpperCase();
    if(!c||busca) return;
    setBusca(true); setErr(""); setRes(null);
    try{
      const r=await fetch(`${API}/api/betslip/${encodeURIComponent(c)}`);
      if(!r.ok) throw new Error(r.status===404?"No encontramos ese código":`Error ${r.status}`);
      setRes(await r.json());
    }catch(e){ setErr(e.message||"No se pudo consultar"); }
    setBusca(false);
  };

  const ESTADOS={pending:"Reservado, falta pagarlo", active:"En juego",
    paid:"Pagado", cashed_out:"Cerrado con cash out"};

  return(
    <div onClick={onCerrar} style={{position:"fixed",inset:0,zIndex:200,
      background:"rgba(5,9,20,.9)",display:"flex",alignItems:"center",
      justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{..._panel(),width:"100%",maxWidth:420}}>
        <div style={{..._phead(),color:Q.text,display:"flex",
          justifyContent:"space-between",alignItems:"center"}}>
          Consultar boleto
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:22,cursor:"pointer",padding:0}}>×</button>
        </div>
        <div style={{padding:16}}>
          <input value={code} onChange={e=>setCode(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&buscar()}
            placeholder="QP-12345" aria-label="Código del boleto"
            style={{width:"100%",background:Q.inset,border:`1px solid ${Q.border}`,
              borderRadius:8,padding:"12px 14px",color:Q.text,fontFamily:F_NUM,
              fontSize:22,fontWeight:600,letterSpacing:1.5,textAlign:"center"}}/>
          <button onClick={buscar} disabled={busca} style={{..._btnPrim(),marginTop:11}}>
            {busca?"Buscando…":"Buscar"}</button>

          {err&&<div style={{marginTop:12,color:Q.muted,fontSize:12.5,
            textAlign:"center"}}>{err}</div>}

          {res&&(
            <div style={{marginTop:16,borderTop:`1px solid ${Q.border}`,paddingTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"baseline",marginBottom:10}}>
                <span style={{fontSize:12,color:Q.muted}}>
                  {ESTADOS[res.status]||res.status}</span>
                <span style={{fontFamily:F_NUM,fontSize:24,fontWeight:700,
                  color:Q.gold}}>{fmt(res.odd_total)}</span>
              </div>
              {(res.picks||[]).map((p,i)=>(
                <div key={i} style={{fontSize:12,color:Q.muted,padding:"3px 0"}}>
                  {p.home} — {p.away} · <span style={{color:Q.text}}>{p.sel}</span>
                </div>
              ))}
              {res.stake>0&&(
                <div style={{marginTop:10,fontSize:12,color:Q.muted}}>
                  Apostado {ars(res.stake)} · a cobrar{" "}
                  <b style={{color:Q.gold}}>{ars(res.potential_win)}</b></div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Estilos compartidos ───────────────────────────────────────
const _panel=()=>({background:Q.surface,border:`1px solid ${Q.border}`,
  borderRadius:10,overflow:"hidden"});
const _phead=()=>({padding:"11px 14px",fontFamily:F_NUM,fontSize:15,fontWeight:600,
  letterSpacing:".08em",textTransform:"uppercase",color:Q.muted,
  borderBottom:`1px solid ${Q.border}`});
const _btnPrim=()=>({width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
  border:"none",borderRadius:8,padding:"13px",color:"#fff",fontSize:14,
  fontWeight:700,cursor:"pointer",fontFamily:F_BODY});
const _btnGhost=()=>({width:"100%",background:"transparent",border:"none",
  color:Q.muted,fontSize:12.5,padding:"8px",cursor:"pointer",fontFamily:F_BODY});

// ── Raíz ──────────────────────────────────────────────────────
export default function Web(){
  const [sports,setSports]=useState([]);
  const [srPartidos,setSrPartidos]=useState([]);
  const [cargando,setCargando]=useState(true);
  const [deporte,setDeporte]=useState(null);   // liga elegida
  const [grupo,setGrupo]=useState(null);       // deporte elegido
  const [picks,setPicks]=useState([]);
  const [consultar,setConsultar]=useState(false);
  // Sesión del cliente. Vive solo mientras la pestaña está abierta:
  // no se guarda en el navegador a propósito, porque el sitio se usa
  // también en computadoras compartidas.
  // La sesión se guarda: al recargar la página se perdía y el cliente
  // tenía que volver a entrar con usuario y clave.
  const [sesion,setSesion]=useState(()=>{
    try{
      const g=localStorage.getItem("qp_sesion");
      return g?JSON.parse(g):null;
    }catch(e){ return null; }
  });

  // Si llegó por un enlace compartido, se cuenta la visita
  useEffect(()=>{ registrarVisitaCompartida(); },[]);

  // Si escaneó el QR de una terminal, primero elige cómo seguir.
  // El código puede venir en la ruta (/t/ABC) o como parámetro.
  // Si vino de una terminal, se juega SIEMPRE como invitado aunque
  // tenga sesión abierta: si apostara con su cuenta de otra agencia,
  // la comisión se la llevaría esa agencia y no la que puso el local.
  const enTerminal=(()=>{
    try{ return !!sessionStorage.getItem("qp_terminal"); }
    catch(e){ return false; }
  })();

  const [terminalQR,setTerminalQR]=useState(()=>{
    try{
      const m=window.location.pathname.match(/\/t\/([A-Za-z0-9]+)/);
      if(m) return m[1].toUpperCase();
      const p=new URLSearchParams(window.location.search);
      const t=p.get("t");
      // Con ?t= viene de "Entrar con mi cuenta": ya eligió, no hay
      // que volver a preguntarle.
      if(t){ try{ sessionStorage.setItem("qp_terminal", t.toUpperCase()); }catch(e){} }
      return null;
    }catch(e){ return null; }
  });

  useEffect(()=>{
    try{
      if(sesion) localStorage.setItem("qp_sesion",JSON.stringify(sesion));
      else localStorage.removeItem("qp_sesion");
    }catch(e){}
  },[sesion]);

  // Se valida contra el servidor al entrar: si el token venció, la
  // sesión guardada no sirve y hay que limpiarla.
  useEffect(()=>{
    if(!sesion?.token) return;
    fetch(`${API}/api/cliente/me`,
      {headers:{Authorization:`Bearer ${sesion.token}`}})
      .then(r=>{ if(r.status===401) setSesion(null); })
      .catch(()=>{});
    // eslint-disable-next-line
  },[]);
  const [login,setLogin]=useState(false);
  const [vivos,setVivos]=useState([]);
  const [vista,setVista]=useState("prematch");   // prematch | vivo
  const [boletoAbierto,setBoletoAbierto]=useState(false);
  const [tema,setTema]=useState(temaGuardado());
  const cambiarTema=(t)=>{ aplicarTema(t); setTema(t); };
  aplicarTema(tema);
  const [ancho,setAncho]=useState(typeof window!=="undefined"?window.innerWidth>=1000:true);

  useEffect(()=>{
    const r=()=>setAncho(window.innerWidth>=1000);
    window.addEventListener("resize",r);
    return()=>window.removeEventListener("resize",r);
  },[]);

  useEffect(()=>{
    fetch(`${API}/api/live/all-markets`).then(r=>r.json())
      .then(d=>{ if(d.sports) setSports(d.sports); })
      .catch(()=>{}).finally(()=>setCargando(false));
    fetch(`${API}/api/sportradar/partidos`).then(r=>r.json())
      .then(d=>{ if(d.partidos) setSrPartidos(d.partidos); })
      .catch(()=>{});
  },[]);

  // En vivo: se refresca solo, porque las cuotas se mueven
  useEffect(()=>{
    const traer=()=>{
      fetch(`${API}/api/live/combined`).then(r=>r.ok?r.json():null)
        .then(d=>{
          const evs=[];
          (d?.sports||[]).forEach(sp=>(sp.events||[]).forEach(e=>
            evs.push({...e, h:e.home, a:e.away, liga:e.liga||sp.name})));
          if(Array.isArray(d?.events)) d.events.forEach(e=>
            evs.push({...e, h:e.home, a:e.away}));
          setVivos(evs);
        }).catch(()=>{});
    };
    traer();
    const t=setInterval(traer,30000);
    return()=>clearInterval(t);
  },[]);

  // Se permite más de una selección del mismo partido: eso es el bet
  // builder. Lo único que se reemplaza es otro resultado DEL MISMO
  // mercado, porque no se puede apostar al 1 y al 2 a la vez.
  const toggle=(ev,label,odd,dep,market)=>{
    const id=ev.id||ev.event_id;
    const mkt=market||"h2h";
    setPicks(p=>{
      const sin=p.filter(b=>!(b.id===id&&b.label===label));
      if(sin.length!==p.length) return sin;   // ya estaba: lo saca
      const otro=sin.filter(b=>!(b.id===id&&b.market===mkt));
      return[...otro,{id,label,odd,market:mkt,
        h:ev.h||ev.home,a:ev.a||ev.away,
        sport:dep||"", event_id:ev.event_id||id,
        sport_key:ev.sport_key||""}];
    });
  };
  const quitar=(p)=>setPicks(w=>w.filter(b=>!(b.id===p.id&&b.label===p.label)));

  // Deportes presentes en el feed, para las pestañas de arriba
  const gruposDisponibles=useMemo(()=>{
    const cuenta={};
    sports.forEach(sp=>{
      const g=grupoDe(sp.key||sp.name);
      cuenta[g]=(cuenta[g]||0)+(sp.events||[]).length;
    });
    vivos.forEach(ev=>{
      const g=grupoDe(ev.sport_key);
      cuenta[g]=(cuenta[g]||0)+1;
    });
    // Los que más partidos tienen, primero
    return Object.entries(cuenta).sort((a,b)=>b[1]-a[1]);
  },[sports,vivos]);

  // Ligas agrupadas por deporte, para el sidebar
  const porGrupo=useMemo(()=>{
    const mapa={};
    sports.forEach(sp=>{
      const g=grupoDe(sp.key||sp.name);
      (mapa[g]=mapa[g]||[]).push(sp);
    });
    return Object.entries(mapa);
  },[sports]);

  const vivosFiltrados=useMemo(()=>(
    grupo ? vivos.filter(ev=>grupoDe(ev.sport_key)===grupo) : vivos
  ),[vivos,grupo]);

  const listado=useMemo(()=>{
    let base=sports;
    if(grupo)   base=base.filter(sp=>grupoDe(sp.key||sp.name)===grupo);
    if(deporte) base=base.filter(sp=>sp.name===deporte);
    const salida=base.map(sp=>({nombre:sp.name,key:sp.key||sp.name,
      eventos:sp.events||[]}));
    if(srPartidos.length&&!deporte&&(!grupo||grupo==="soccer"))
      salida.push({nombre:"Sportradar",key:"soccer_sportradar",eventos:srPartidos});
    return salida;
  },[sports,srPartidos,deporte,grupo]);

  // Escaneó el QR: primero elige cómo seguir. Al tocar "Empezar acá"
  // sigue en esta misma pantalla con la terminal ya guardada.
  if(terminalQR){
    return <PantallaTerminal codigo={terminalQR}
      onSeguir={()=>setTerminalQR(null)}/>;
  }

  return(
    <div style={{background:Q.void,color:Q.text,minHeight:"100dvh",
      fontFamily:F_BODY}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${Q.void};color:${Q.text}}
        button{font-family:inherit}
        button:focus-visible,input:focus-visible{outline:2px solid ${Q.gold};outline-offset:2px}
        input:focus{outline:none}
        ::-webkit-scrollbar{width:8px;height:8px}
        ::-webkit-scrollbar-thumb{background:${Q.border};border-radius:4px}
        @keyframes qLive{0%,100%{opacity:1}50%{opacity:.25}}
        @media (prefers-reduced-motion:reduce){*,*::before,*::after{
          animation:none!important;transition:none!important}}
      `}</style>

      {/* Barra superior */}
      <header style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        display:"flex",alignItems:"center",gap:ancho?22:12,
        padding:ancho?"0 18px":"0 10px",height:56,
        position:"sticky",top:0,zIndex:100}}>
        <span style={{fontFamily:F_NUM,fontSize:ancho?23:19,fontWeight:700,
          letterSpacing:.4,whiteSpace:"nowrap"}}>
          QUARTZ<span style={{color:Q.gold}}>PLAY</span></span>

        <nav style={{display:"flex",gap:2,flex:1,height:"100%",
          overflowX:"auto"}}>
          <button onClick={()=>{setVista("prematch");setDeporte(null);}} style={{
            background:"transparent",border:"none",cursor:"pointer",
            padding:"0 13px",fontSize:13,fontWeight:600,whiteSpace:"nowrap",
            color:vista==="prematch"?"#fff":Q.muted,
            borderBottom:`2px solid ${vista==="prematch"?Q.violet:"transparent"}`}}>
            Deportes</button>
          <button onClick={()=>setVista("vivo")} style={{
            background:"transparent",border:"none",cursor:"pointer",
            padding:"0 13px",fontSize:13,fontWeight:600,whiteSpace:"nowrap",
            display:"flex",alignItems:"center",gap:7,
            color:vista==="vivo"?"#fff":Q.muted,
            borderBottom:`2px solid ${vista==="vivo"?Q.pink:"transparent"}`}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:Q.pink,
              animation:"qLive 1.6s infinite"}}/>
            En vivo{vivos.length>0?` (${vivos.length})`:""}</button>
          <button onClick={()=>setVista("casino")} style={{
            background:"transparent",border:"none",cursor:"pointer",
            padding:"0 13px",fontSize:13,fontWeight:600,whiteSpace:"nowrap",
            color:vista==="casino"?"#fff":Q.muted,
            borderBottom:`2px solid ${vista==="casino"?"#7B1FA2":"transparent"}`}}>
            🎰 Casino</button>
          <button onClick={()=>setVista("casinovivo")} style={{
            background:"transparent",border:"none",cursor:"pointer",
            padding:"0 13px",fontSize:13,fontWeight:600,whiteSpace:"nowrap",
            color:vista==="casinovivo"?"#fff":Q.muted,
            borderBottom:`2px solid ${vista==="casinovivo"?"#B71C1C":"transparent"}`}}>
            🎥 En vivo</button>
          <button onClick={()=>setVista("desafios")} style={{
            background:"transparent",border:"none",cursor:"pointer",
            padding:"0 13px",fontSize:13,fontWeight:600,whiteSpace:"nowrap",
            color:vista==="desafios"?"#fff":Q.muted,
            borderBottom:`2px solid ${vista==="desafios"?Q.gold:"transparent"}`}}>
            🤝 Desafíos</button>
        </nav>

        {sesion ? (
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{textAlign:"right",lineHeight:1}}>
              <div style={{fontSize:8,letterSpacing:1.3,color:Q.dim,
                fontWeight:700}}>SALDO</div>
              <div style={{fontFamily:F_NUM,fontSize:18,fontWeight:700,
                color:Q.gold,marginTop:2}}>
                ${Math.round(sesion.user.saldo).toLocaleString("es-AR")}</div>
            </div>
            <button onClick={()=>setSesion(null)} title="Salir"
              style={{background:"transparent",border:`1px solid ${Q.border}`,
                borderRadius:7,padding:"7px 11px",color:Q.muted,fontSize:11.5,
                fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
              Salir</button>
          </div>
        ) : enTerminal ? (
          /* En terminal no se ofrece entrar: el boleto se paga en
             este mostrador y va sin usuario. Mostrar "Ingresar"
             sería prometer algo que no va a funcionar. */
          <span style={{color:Q.dim,fontSize:11.5,whiteSpace:"nowrap",
            fontFamily:F_BODY}}>Modo mostrador</span>
        ) : (
          <button onClick={()=>setLogin(true)} style={{background:"transparent",
            border:`1px solid ${Q.violet}`,borderRadius:7,padding:"8px 15px",
            color:Q.cyan,fontSize:12.5,fontWeight:700,cursor:"pointer",
            whiteSpace:"nowrap"}}>Ingresar</button>
        )}

        <BotonTema tema={tema} onCambiar={cambiarTema} compacto/>

        {ancho&&(
          <button onClick={()=>setConsultar(true)} style={{background:"transparent",
            border:`1px solid ${Q.border}`,borderRadius:7,padding:"8px 14px",
            color:Q.muted,fontSize:12.5,fontWeight:600,cursor:"pointer",
            whiteSpace:"nowrap"}}>Consultar boleto</button>
        )}

        <a href="https://t.me/quartzplay_bot" target="_blank" rel="noreferrer"
          style={{display:"flex",alignItems:"center",gap:8,background:Q.goldBg,
            borderRadius:7,padding:"9px 15px",textDecoration:"none",
            whiteSpace:"nowrap"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A1200"
            strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{CAMARA}</svg>
          <span style={{color:"#1A1200",fontWeight:700,fontSize:12.5}}>Bet Best</span>
        </a>
      </header>
      {/* Barra del reloj: en las casas de apuestas marca la hora oficial
          con la que se cierran los mercados */}
      <div style={{background:`linear-gradient(90deg,${Q.violet},${Q.violet2})`,
        padding:"7px 18px",display:"flex",alignItems:"center",
        justifyContent:"space-between",gap:14}}>
        <span style={{fontSize:11.5,color:"#DCE6FF",fontWeight:600,
          letterSpacing:.3}}>
          Hora oficial · los mercados cierran al comenzar el partido</span>
        <Reloj/>
      </div>

      {/* Filtro de deportes: a lo ancho, debajo del reloj y siempre a mano.
          Vale para prematch y para en vivo. */}
      <div style={{position:"sticky",top:56,zIndex:90,background:Q.deep,
        borderBottom:`1px solid ${Q.border}`}}>
        <div style={{maxWidth:1440,margin:"0 auto",display:"flex",gap:6,
          overflowX:"auto",padding:ancho?"9px 18px":"8px 10px",
          scrollbarWidth:"none"}}>
          <button onClick={()=>{setGrupo(null);setDeporte(null);}}
            style={chip(!grupo)}>Todos</button>
          {gruposDisponibles.map(([g,n])=>(
            <button key={g} onClick={()=>{setGrupo(g);setDeporte(null);}}
              style={chip(grupo===g)}>
              <IconoDeporte nombre={GRUPOS[g]||g}
                color={grupo===g?"#fff":Q.muted}/>
              {GRUPOS[g]||g}
              <span style={{fontSize:10.5,opacity:.65,fontFamily:F_NUM,
                fontWeight:600}}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Los desafíos ocupan la pantalla entera: no comparten el
          diseño de tres columnas con el boleto y las ligas. */}
      {vista==="desafios"&&(
        <CazaError>
          <DesafiosWeb sesion={sesion} ancho={ancho}/>
        </CazaError>
      )}

      {vista==="casino"&&(
        <CazaError>
          <div style={{maxWidth:1440,margin:"0 auto"}}>
            <CasinoWeb sesion={sesion} ancho={ancho}/>
          </div>
        </CazaError>
      )}

      {vista==="casinovivo"&&(
        <CazaError>
          <div style={{maxWidth:1440,margin:"0 auto"}}>
            <CasinoWeb sesion={sesion} ancho={ancho} vivo/>
          </div>
        </CazaError>
      )}

      {vista!=="desafios"&&vista!=="casino"&&vista!=="casinovivo"&&(
      <div style={{maxWidth:1440,margin:"0 auto",
        padding: ancho?"14px 18px 60px":"12px 10px 30px",
        display:"grid",gap:14,alignItems:"start",
        gridTemplateColumns: ancho?"220px 1fr 320px":"1fr"}}>

        {/* Sidebar de ligas, agrupadas por deporte */}
        {ancho&&(
          <aside style={_panel()}>
            <div style={_phead()}>Ligas</div>
            <button onClick={()=>setDeporte(null)} style={{..._spItem(),
              background:!deporte?"#ffffff0a":"transparent",
              borderLeft:`2px solid ${!deporte?Q.gold:"transparent"}`}}>
              <IconoDeporte nombre="" color={!deporte?Q.gold:Q.muted}/>
              <span style={{flex:1,textAlign:"left"}}>Todas</span>
            </button>
            {porGrupo.filter(([g])=>!grupo||g===grupo).map(([g,ligas])=>(
              <div key={g}>
                <div style={{padding:"9px 14px 5px",fontSize:9.5,letterSpacing:1.4,
                  color:Q.dim,fontWeight:700,textTransform:"uppercase",
                  borderTop:`1px solid ${Q.border}`}}>
                  {GRUPOS[g]||g}</div>
                {ligas.map(sp=>{
                  const on=deporte===sp.name;
                  return(
                    <button key={sp.key||sp.name} onClick={()=>setDeporte(sp.name)}
                      style={{..._spItem(),paddingTop:7,paddingBottom:7,
                      background:on?"#ffffff0a":"transparent",
                      borderLeft:`2px solid ${on?Q.gold:"transparent"}`}}>
                      <Bandera sportKey={sp.key||sp.name}/>
                      <span style={{flex:1,textAlign:"left",fontSize:12.5,
                        overflow:"hidden",textOverflow:"ellipsis",
                        whiteSpace:"nowrap"}}>{sp.name}</span>
                      <span style={{fontSize:11,color:Q.dim}}>
                        {(sp.events||[]).length}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>
        )}

        {/* Centro */}
        <main style={{minWidth:0}}>
              <CazaError><AvisosBanner destino="web"/></CazaError>
          <Carrusel/>

          {vista==="vivo"&&(
            <div style={{marginBottom:16}}>
              {!vivosFiltrados.length&&(
                <div style={{..._panel(),padding:"40px 20px",textAlign:"center",
                  color:Q.muted,fontSize:13}}>
                  {grupo
                    ? `No hay ${(GRUPOS[grupo]||grupo).toLowerCase()} en vivo ahora.`
                    : "No hay partidos en vivo en este momento."}</div>
              )}
              {vivosFiltrados.length>0&&(
                <>
                  <div style={{display:"flex",alignItems:"center",gap:10,
                    padding:"11px 14px",background:Q.deep,
                    border:`1px solid ${Q.border}`,borderBottom:"none",
                    borderRadius:"10px 10px 0 0"}}>
                    <span style={{width:8,height:8,borderRadius:"50%",
                      background:Q.pink,animation:"qLive 1.6s infinite"}}/>
                    <h2 style={{fontFamily:F_NUM,fontSize:16,fontWeight:600,
                      letterSpacing:".05em",textTransform:"uppercase"}}>
                      Jugando ahora</h2>
                    <span style={{marginLeft:"auto",fontSize:11,color:Q.dim}}>
                      se actualiza solo</span>
                  </div>
                  <div style={{..._panel(),borderRadius:"0 0 10px 10px"}}>
                    {vivosFiltrados.map((ev,i)=>(
                      <FilaPartido key={ev.id||i} ev={ev} deporte={ev.liga||""}
                        picks={picks} onToggle={toggle} ancho={ancho} vivo/>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {vista==="prematch"&&cargando&&(
            <div style={{..._panel(),padding:"40px 20px",textAlign:"center",
              color:Q.muted,fontSize:13}}>Cargando partidos…</div>
          )}

          {vista==="prematch"&&!cargando&&!listado.length&&(
            <div style={{..._panel(),padding:"40px 20px",textAlign:"center",
              color:Q.muted,fontSize:13}}>
              No hay partidos disponibles en este momento.</div>
          )}

          {vista==="prematch"&&listado.map(grupo=>(
            (grupo.eventos||[]).length>0&&(
              <div key={grupo.nombre} style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10,
                  padding:"11px 14px",background:Q.deep,
                  border:`1px solid ${Q.border}`,borderBottom:"none",
                  borderRadius:"10px 10px 0 0"}}>
                  <Bandera sportKey={grupo.key} size={22}/>
                  <h2 style={{fontFamily:F_NUM,fontSize:16,fontWeight:600,
                    letterSpacing:".05em",textTransform:"uppercase"}}>
                    {grupo.nombre}</h2>
                  <span style={{marginLeft:"auto",fontSize:11,color:Q.dim}}>
                    {grupo.eventos.length} partidos</span>
                </div>
                <div style={{..._panel(),borderRadius:"0 0 10px 10px"}}>
                  {grupo.eventos.slice(0,25).map((ev,i)=>(
                    <FilaPartido key={ev.id||ev.event_id||i} ev={ev}
                      deporte={grupo.nombre} picks={picks} onToggle={toggle}
                      ancho={ancho}/>
                  ))}
                </div>
              </div>
            )
          ))}
        </main>

        {/* Boleto: columna fija en escritorio */}
        {ancho&&(
          <aside style={{position:"sticky",top:72}}>
            <Boleto picks={picks} onQuitar={quitar} onLimpiar={()=>setPicks([])}
              moneda={sesion?.user?.moneda} onCargar={p=>setPicks(p)}
              sesionUser={sesion?.user}/>
          </aside>
        )}
      </div>
      )}

      {/* Celular: barra fija abajo que abre el boleto como hoja.
          En la columna quedaba enterrado abajo de toda la lista. */}
      {!ancho&&picks.length>0&&!boletoAbierto&&(
        <button onClick={()=>setBoletoAbierto(true)} style={{position:"fixed",
          left:12,right:12,bottom:"calc(12px + env(safe-area-inset-bottom))",
          zIndex:150,border:"none",borderRadius:11,cursor:"pointer",
          padding:"13px 16px",display:"flex",alignItems:"center",gap:12,
          background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
          boxShadow:"0 8px 28px rgba(0,0,0,.55)",fontFamily:F_BODY}}>
          <span style={{background:Q.goldBg,color:"#1A1200",fontSize:12,
            fontWeight:700,borderRadius:5,padding:"2px 8px"}}>{picks.length}</span>
          <span style={{color:"#fff",fontWeight:700,fontSize:13.5,flex:1,
            textAlign:"left"}}>Ver mi boleto</span>
          <span style={{fontFamily:F_NUM,fontSize:21,fontWeight:700,
            color:Q.gold}}>{fmt(prod(picks.map(p=>p.odd)))}</span>
        </button>
      )}

      {!ancho&&boletoAbierto&&(
        <div onClick={()=>setBoletoAbierto(false)} style={{position:"fixed",
          inset:0,zIndex:160,background:"rgba(5,9,20,.9)",
          display:"flex",alignItems:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",
            maxHeight:"88vh",overflowY:"auto",
            padding:"0 10px calc(10px + env(safe-area-inset-bottom))"}}>
            <button onClick={()=>setBoletoAbierto(false)} style={{width:"100%",
              background:"transparent",border:"none",color:Q.muted,fontSize:13,
              padding:"12px 0",cursor:"pointer",fontFamily:F_BODY}}>
              Cerrar ▾</button>
            <Boleto picks={picks} onQuitar={quitar} moneda={sesion?.user?.moneda}
              onCargar={p=>setPicks(p)} sesionUser={sesion?.user}
              onLimpiar={()=>{setPicks([]);setBoletoAbierto(false);}}/>
          </div>
        </div>
      )}

      <footer style={{borderTop:`1px solid ${Q.border}`,
        marginBottom:!ancho&&picks.length?70:0,padding:"22px 18px",
        textAlign:"center",color:Q.dim,fontSize:11.5,lineHeight:1.7}}>
        <button onClick={()=>setConsultar(true)} style={{background:"transparent",
          border:`1px solid ${Q.border}`,borderRadius:7,padding:"9px 16px",
          color:Q.muted,fontSize:12.5,fontWeight:600,cursor:"pointer",
          marginBottom:14,fontFamily:F_BODY}}>Consultar un boleto</button>
        <div>QuartzPlay · Jugá con responsabilidad.<br/>
          Prohibida la participación a menores de 18 años.</div>
      </footer>

      {consultar&&<ConsultarBoleto onCerrar={()=>setConsultar(false)}/>}
      {login&&<Ingresar onCerrar={()=>setLogin(false)}
        onEntro={d=>{ setSesion(d); setLogin(false); }}/>}

      {/* Ayuda: solo con sesión, porque necesita saber quién escribe */}
      <CazaError>
        <BotonAyuda userId={sesion?.user?.id} origen="web"/>
      </CazaError>
    </div>
  );
}

function chip(activo){
  return {display:"flex",alignItems:"center",gap:7,flexShrink:0,
    background:activo?`linear-gradient(135deg,${Q.violet},${Q.violet2})`:Q.surface,
    border:`1px solid ${activo?"transparent":Q.border}`,borderRadius:999,
    padding:"8px 15px",fontSize:12.5,fontWeight:600,cursor:"pointer",
    color:activo?"#fff":Q.muted,whiteSpace:"nowrap",fontFamily:F_BODY};
}

const _spItem=()=>({display:"flex",alignItems:"center",gap:11,padding:"10px 14px",
  width:"100%",background:"transparent",border:"none",cursor:"pointer",
  color:Q.text,fontSize:13,fontWeight:500,fontFamily:F_BODY});
