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
import { useState, useEffect, useMemo } from "react";

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
function Boleto({ picks, onQuitar, onLimpiar, moneda="ARS", onCargar }){
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
            <ChatSoporte userId={userId} origen={origen}
              onCerrar={()=>setAbierto(false)}/>
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
  const [sesion,setSesion]=useState(null);
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
          <AvisosBanner destino="web"/>
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
              moneda={sesion?.user?.moneda} onCargar={p=>setPicks(p)}/>
          </aside>
        )}
      </div>

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
              onCargar={p=>setPicks(p)}
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
      <BotonAyuda userId={sesion?.user?.id} origen="web"/>
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
