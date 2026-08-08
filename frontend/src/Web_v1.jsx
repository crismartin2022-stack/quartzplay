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

const API = "https://amusing-vision-production.up.railway.app";

const Q = {
  void:"#050914", deep:"#080E1F", surface:"#0D1530", card:"#111B3B",
  violet:"#2B6BFF", violet2:"#7B3FE4", cyan:"#5A8CFF",
  green:"#25D07A", pink:"#FF2D55", gold:"#FFC531", red:"#FF3B5C",
  text:"#E9EFFF", muted:"#93A0C8", dim:"#5A6690", border:"#1E2A52",
};
const F_NUM  = "'Barlow Condensed','Inter',system-ui,sans-serif";
const F_BODY = "'Inter',system-ui,sans-serif";

const fmt  = n => Number(n||0).toFixed(2);
const ars  = n => "$" + Math.round(n||0).toLocaleString("es-AR");
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
      background:"#0A1128",border:`1px solid ${Q.border}`,overflow:"hidden",
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
      background:"#0A1128",marginTop:6}}>
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
                background:k===idx?Q.gold:"rgba(255,255,255,.4)"}}/>
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

// ── Fila de partido ───────────────────────────────────────────
function FilaPartido({ ev, deporte, picks, onToggle, ancho }){
  const home=ev.h||ev.home||"";
  const away=ev.a||ev.away||"";
  const o=ev.odds||{};
  const opciones=[
    {k:"1", label:home,     val:o.L},
    {k:"X", label:"Empate", val:o.E},
    {k:"2", label:away,     val:o.V},
  ].filter(x=>x.val);
  const nMercados=Object.keys(ev.markets||{}).length;
  const hora=(ev.commence_time||"").slice(11,16);
  const dia=(ev.commence_time||"").slice(8,10);
  const mes=(ev.commence_time||"").slice(5,7);

  return(
    <div style={{display:"grid",
      gridTemplateColumns: ancho ? "62px 1fr 300px 84px" : "62px 1fr",
      gap:12,alignItems:"center",padding:"11px 14px",
      borderBottom:`1px solid ${Q.border}`}}>

      <div style={{textAlign:"center",fontFamily:F_NUM,fontSize:15,
        fontWeight:600,color:Q.muted,lineHeight:1.15}}>
        {hora||"—"}
        <div style={{fontSize:10,color:Q.dim,fontFamily:F_BODY,fontWeight:500}}>
          {dia&&mes?`${dia}/${mes}`:""}</div>
      </div>

      <div style={{minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:9,padding:"2px 0"}}>
          <Escudo name={home}/>
          <span style={{fontSize:13.5,whiteSpace:"nowrap",overflow:"hidden",
            textOverflow:"ellipsis"}}>{home}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:9,padding:"2px 0"}}>
          <Escudo name={away}/>
          <span style={{fontSize:13.5,whiteSpace:"nowrap",overflow:"hidden",
            textOverflow:"ellipsis"}}>{away}</span>
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
        <div style={{textAlign:"right",fontSize:11.5,color:Q.cyan,fontWeight:600}}>
          {nMercados>1?`+${nMercados-1} mercados`:""}
        </div>
      )}
    </div>
  );
}

function BotonCuota({ ev, op, deporte, picks, onToggle }){
  const id=ev.id||ev.event_id;
  const sel=picks.some(p=>p.id===id&&p.label===op.label);
  return(
    <button onClick={()=>onToggle(ev,op.label,op.val,deporte)} style={{
      background:sel?Q.violet:"#0A1128",
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
function Boleto({ picks, onQuitar, onLimpiar }){
  const [modo,setModo]=useState("multiple");
  const [monto,setMonto]=useState(1000);
  const [enviando,setEnviando]=useState(false);
  const [err,setErr]=useState("");
  const [emitidos,setEmitidos]=useState(null);

  const total = picks.length?prod(picks.map(p=>p.odd)):0;
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
      const grupos = modo==="multiple" ? [picks] : picks.map(p=>[p]);
      const res=[];
      for(const g of grupos){
        const r=await fetch(`${API}/api/betslip`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify(armarBody(g)),
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
    <div style={panel}>
      <div style={{...phead,color:Q.text}}>
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
        <button onClick={()=>{setEmitidos(null);onLimpiar();}}
          style={{...btnPrim,marginTop:16}}>Armar otro boleto</button>
      </div>
    </div>
  );

  return(
    <div style={panel}>
      <div style={{...phead,color:Q.text,display:"flex",alignItems:"center",gap:9}}>
        <span style={{background:picks.length?Q.gold:Q.border,
          color:picks.length?"#1A1200":Q.muted,fontSize:11,fontWeight:700,
          borderRadius:4,padding:"1px 7px",fontFamily:F_BODY}}>{picks.length}</span>
        Tu boleto
      </div>

      <div style={{display:"flex",gap:6,padding:"11px 14px 0"}}>
        {[["multiple","Múltiple"],["simple","Simple"]].map(([k,l])=>(
          <button key={k} onClick={()=>setModo(k)} style={{flex:1,
            background:modo===k?Q.violet:"#0A1128",
            border:`1px solid ${modo===k?Q.violet:Q.border}`,borderRadius:7,
            padding:"8px",cursor:"pointer",fontSize:12.5,fontWeight:700,
            color:modo===k?"#fff":Q.muted,fontFamily:F_BODY}}>{l}</button>
        ))}
      </div>

      {!picks.length&&(
        <div style={{padding:"24px 18px",textAlign:"center",color:Q.muted,
          fontSize:12.5,lineHeight:1.5}}>
          Tocá una cuota para empezar a armar el boleto.</div>
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
            style={{width:"100%",background:"#0A1128",border:`1px solid ${Q.border}`,
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

          <button onClick={generar} disabled={enviando} style={btnPrim}>
            {enviando?"Generando…":
              modo==="simple"&&picks.length>1
                ? `Generar ${picks.length} códigos`
                : "Generar código para pagar"}</button>
          <div style={{fontSize:10.5,color:Q.dim,textAlign:"center",marginTop:8,
            lineHeight:1.45}}>
            El importe es una simulación. Lo cargás al pagar en la agencia.</div>
          <button onClick={onLimpiar} style={{...btnGhost,marginTop:5}}>
            Vaciar boleto</button>
        </div>
      )}
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
      <div onClick={e=>e.stopPropagation()} style={{...panel,width:"100%",maxWidth:420}}>
        <div style={{...phead,color:Q.text,display:"flex",
          justifyContent:"space-between",alignItems:"center"}}>
          Consultar boleto
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:22,cursor:"pointer",padding:0}}>×</button>
        </div>
        <div style={{padding:16}}>
          <input value={code} onChange={e=>setCode(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&buscar()}
            placeholder="QP-12345" aria-label="Código del boleto"
            style={{width:"100%",background:"#0A1128",border:`1px solid ${Q.border}`,
              borderRadius:8,padding:"12px 14px",color:Q.text,fontFamily:F_NUM,
              fontSize:22,fontWeight:600,letterSpacing:1.5,textAlign:"center"}}/>
          <button onClick={buscar} disabled={busca} style={{...btnPrim,marginTop:11}}>
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
const panel={background:Q.surface,border:`1px solid ${Q.border}`,
  borderRadius:10,overflow:"hidden"};
const phead={padding:"11px 14px",fontFamily:F_NUM,fontSize:15,fontWeight:600,
  letterSpacing:".08em",textTransform:"uppercase",color:Q.muted,
  borderBottom:`1px solid ${Q.border}`};
const btnPrim={width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
  border:"none",borderRadius:8,padding:"13px",color:"#fff",fontSize:14,
  fontWeight:700,cursor:"pointer",fontFamily:F_BODY};
const btnGhost={width:"100%",background:"transparent",border:"none",
  color:Q.muted,fontSize:12.5,padding:"8px",cursor:"pointer",fontFamily:F_BODY};

// ── Raíz ──────────────────────────────────────────────────────
export default function Web(){
  const [sports,setSports]=useState([]);
  const [srPartidos,setSrPartidos]=useState([]);
  const [cargando,setCargando]=useState(true);
  const [deporte,setDeporte]=useState(null);   // liga elegida
  const [grupo,setGrupo]=useState(null);       // deporte elegido
  const [picks,setPicks]=useState([]);
  const [consultar,setConsultar]=useState(false);
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

  const toggle=(ev,label,odd,dep)=>{
    const id=ev.id||ev.event_id;
    setPicks(p=>{
      const sin=p.filter(b=>!(b.id===id&&b.label===label));
      if(sin.length!==p.length) return sin;
      // Un solo resultado por partido
      const otro=sin.filter(b=>b.id!==id);
      return[...otro,{id,label,odd,h:ev.h||ev.home,a:ev.a||ev.away,
        sport:dep||"", event_id:ev.event_id||id,
        sport_key:ev.sport_key||""}];
    });
  };
  const quitar=(p)=>setPicks(w=>w.filter(b=>!(b.id===p.id&&b.label===p.label)));

  // Deportes presentes en el feed, para las pestañas de arriba
  const gruposDisponibles=useMemo(()=>{
    const vistos=[];
    sports.forEach(sp=>{
      const g=grupoDe(sp.key||sp.name);
      if(!vistos.includes(g)) vistos.push(g);
    });
    return vistos;
  },[sports]);

  // Ligas agrupadas por deporte, para el sidebar
  const porGrupo=useMemo(()=>{
    const mapa={};
    sports.forEach(sp=>{
      const g=grupoDe(sp.key||sp.name);
      (mapa[g]=mapa[g]||[]).push(sp);
    });
    return Object.entries(mapa);
  },[sports]);

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
        body{background:${Q.void}}
        button{font-family:inherit}
        button:focus-visible,input:focus-visible{outline:2px solid ${Q.gold};outline-offset:2px}
        input:focus{outline:none}
        ::-webkit-scrollbar{width:8px;height:8px}
        ::-webkit-scrollbar-thumb{background:${Q.border};border-radius:4px}
        @media (prefers-reduced-motion:reduce){*{transition:none!important}}
      `}</style>

      {/* Barra superior */}
      <header style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        display:"flex",alignItems:"center",gap:22,padding:"0 18px",height:58,
        position:"sticky",top:0,zIndex:100}}>
        <span style={{fontFamily:F_NUM,fontSize:23,fontWeight:700,letterSpacing:.4,
          whiteSpace:"nowrap"}}>QUARTZ<span style={{color:Q.gold}}>PLAY</span></span>

        <nav style={{display:"flex",gap:4,flex:1,height:"100%"}}>
          {[["Deportes",null],...sports.slice(0,3).map(s=>[s.name,s.name])]
            .map(([l,k])=>(
            <button key={l} onClick={()=>setDeporte(k)} style={{
              background:"transparent",border:"none",cursor:"pointer",
              padding:"0 13px",fontSize:13,fontWeight:600,
              color:deporte===k?"#fff":Q.muted,
              borderBottom:`2px solid ${deporte===k?Q.violet:"transparent"}`}}>
              {l}</button>
          ))}
        </nav>

        <button onClick={()=>setConsultar(true)} style={{background:"transparent",
          border:`1px solid ${Q.border}`,borderRadius:7,padding:"8px 14px",
          color:Q.muted,fontSize:12.5,fontWeight:600,cursor:"pointer",
          whiteSpace:"nowrap"}}>Consultar boleto</button>

        <a href="https://t.me/quartzplay_bot" target="_blank" rel="noreferrer"
          style={{display:"flex",alignItems:"center",gap:8,background:Q.gold,
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

      <div style={{maxWidth:1440,margin:"0 auto",padding:"14px 18px 60px",
        display:"grid",gap:14,alignItems:"start",
        gridTemplateColumns: ancho?"220px 1fr 320px":"1fr"}}>

        {/* Sidebar de ligas, agrupadas por deporte */}
        {ancho&&(
          <aside style={panel}>
            <div style={phead}>Ligas</div>
            <button onClick={()=>setDeporte(null)} style={{...spItem,
              background:!deporte?"#ffffff0a":"transparent",
              borderLeft:`2px solid ${!deporte?Q.gold:"transparent"}`}}>
              <IconoDeporte nombre="" color={!deporte?Q.gold:Q.muted}/>
              <span style={{flex:1,textAlign:"left"}}>Todas</span>
            </button>
            {porGrupo.map(([g,ligas])=>(
              <div key={g}>
                <div style={{padding:"9px 14px 5px",fontSize:9.5,letterSpacing:1.4,
                  color:Q.dim,fontWeight:700,textTransform:"uppercase",
                  borderTop:`1px solid ${Q.border}`}}>
                  {GRUPOS[g]||g}</div>
                {ligas.map(sp=>{
                  const on=deporte===sp.name;
                  return(
                    <button key={sp.key||sp.name} onClick={()=>setDeporte(sp.name)}
                      style={{...spItem,paddingTop:7,paddingBottom:7,
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
          <Carrusel/>

          {/* Pestañas de deportes */}
          <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:14}}>
            <button onClick={()=>setGrupo(null)} style={chip(!grupo)}>
              Todos</button>
            {gruposDisponibles.map(g=>(
              <button key={g} onClick={()=>setGrupo(g)} style={chip(grupo===g)}>
                <IconoDeporte nombre={GRUPOS[g]||g}
                  color={grupo===g?"#fff":Q.muted}/>
                {GRUPOS[g]||g}</button>
            ))}
          </div>

          {cargando&&(
            <div style={{...panel,padding:"40px 20px",textAlign:"center",
              color:Q.muted,fontSize:13}}>Cargando partidos…</div>
          )}

          {!cargando&&!listado.length&&(
            <div style={{...panel,padding:"40px 20px",textAlign:"center",
              color:Q.muted,fontSize:13}}>
              No hay partidos disponibles en este momento.</div>
          )}

          {listado.map(grupo=>(
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
                <div style={{...panel,borderRadius:"0 0 10px 10px"}}>
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

        {/* Boleto */}
        <aside style={ancho?{position:"sticky",top:72}:{}}>
          <Boleto picks={picks} onQuitar={quitar} onLimpiar={()=>setPicks([])}/>
        </aside>
      </div>

      <footer style={{borderTop:`1px solid ${Q.border}`,padding:"22px 18px",
        textAlign:"center",color:Q.dim,fontSize:11.5,lineHeight:1.7}}>
        QuartzPlay · Jugá con responsabilidad. Prohibida la participación a menores de 18 años.
      </footer>

      {consultar&&<ConsultarBoleto onCerrar={()=>setConsultar(false)}/>}
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

const spItem={display:"flex",alignItems:"center",gap:11,padding:"10px 14px",
  width:"100%",background:"transparent",border:"none",cursor:"pointer",
  color:Q.text,fontSize:13,fontWeight:500,fontFamily:F_BODY};
