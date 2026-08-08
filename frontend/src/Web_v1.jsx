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
function Boleto({ picks, onQuitar, onLimpiar }){
  const [enviando,setEnviando]=useState(false);
  const [err,setErr]=useState("");
  const [slip,setSlip]=useState(null);
  const total=picks.length?prod(picks.map(p=>p.odd)):0;

  const generar=async()=>{
    if(!picks.length||enviando) return;
    setEnviando(true); setErr("");
    try{
      const r=await fetch(`${API}/api/betslip`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({picks:picks.map(p=>({
          home:p.h||"", away:p.a||"", sel:p.label, odd:p.odd,
          sport:p.sport||"", event_id:p.event_id||p.id||"",
          sport_key:p.sport_key||"",
        }))}),
      });
      if(!r.ok){
        const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`);
      }
      setSlip(await r.json());
    }catch(e){ setErr(e.message||"No se pudo generar el código"); }
    setEnviando(false);
  };

  if(slip) return(
    <div style={panel}>
      <div style={{...phead,color:Q.text}}>Tu código</div>
      <div style={{padding:"20px 16px",textAlign:"center"}}>
        <div style={{fontFamily:F_NUM,fontSize:40,fontWeight:700,color:Q.gold,
          letterSpacing:2,lineHeight:1.1}}>{slip.code}</div>
        <div style={{fontSize:12,color:Q.muted,marginTop:6,lineHeight:1.5}}>
          Presentalo en una agencia para pagarlo.<br/>Vale 24 horas.</div>
        <img alt="Código QR del boleto"
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(slip.code)}`}
          style={{width:160,height:160,marginTop:16,borderRadius:8,background:"#fff",padding:8}}/>
        <div style={{marginTop:14,fontSize:12,color:Q.muted}}>
          Cuota <b style={{color:Q.gold,fontFamily:F_NUM,fontSize:18}}>
            {fmt(slip.odd_total)}</b> · {slip.picks} selecciones</div>
        <button onClick={()=>{setSlip(null);onLimpiar();}} style={{...btnPrim,marginTop:16}}>
          Armar otro boleto</button>
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

      {!picks.length&&(
        <div style={{padding:"26px 18px",textAlign:"center",color:Q.muted,
          fontSize:12.5,lineHeight:1.5}}>
          Tocá una cuota para empezar a armar el boleto.</div>
      )}

      {picks.map((p,i)=>(
        <div key={i} style={{padding:"11px 14px",borderBottom:`1px solid ${Q.border}`}}>
          <div style={{fontSize:10.5,color:Q.dim,marginBottom:3}}>
            {p.h} — {p.a}</div>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"baseline",gap:10}}>
            <span style={{fontSize:12.5,fontWeight:600,minWidth:0,
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
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:12}}>
            <span style={{fontSize:12,color:Q.muted}}>Cuota total</span>
            <span style={{fontFamily:F_NUM,fontSize:28,fontWeight:700,
              color:Q.gold,lineHeight:1}}>{fmt(total)}</span>
          </div>
          <button onClick={generar} disabled={enviando} style={btnPrim}>
            {enviando?"Generando…":"Generar código para pagar"}</button>
          <button onClick={onLimpiar} style={{...btnGhost,marginTop:7}}>
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
  const [deporte,setDeporte]=useState(null);
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

  const listado=useMemo(()=>{
    const base=sports.map(sp=>({nombre:sp.name,eventos:sp.events||[]}));
    if(srPartidos.length) base.push({nombre:"Sportradar",eventos:srPartidos});
    return deporte?base.filter(b=>b.nombre===deporte):base;
  },[sports,srPartidos,deporte]);

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
      <div style={{height:2,background:`linear-gradient(90deg,${Q.violet},${Q.violet2})`}}/>

      <div style={{maxWidth:1440,margin:"0 auto",padding:"14px 18px 60px",
        display:"grid",gap:14,alignItems:"start",
        gridTemplateColumns: ancho?"220px 1fr 320px":"1fr"}}>

        {/* Sidebar */}
        {ancho&&(
          <aside style={panel}>
            <div style={phead}>Deportes</div>
            <button onClick={()=>setDeporte(null)} style={{...spItem,
              background:!deporte?"#ffffff0a":"transparent",
              borderLeft:`2px solid ${!deporte?Q.gold:"transparent"}`}}>
              <IconoDeporte nombre="" color={!deporte?Q.gold:Q.muted}/>
              <span style={{flex:1,textAlign:"left"}}>Todos</span>
            </button>
            {sports.map(sp=>{
              const on=deporte===sp.name;
              return(
                <button key={sp.name} onClick={()=>setDeporte(sp.name)} style={{...spItem,
                  background:on?"#ffffff0a":"transparent",
                  borderLeft:`2px solid ${on?Q.gold:"transparent"}`}}>
                  <IconoDeporte nombre={sp.name} color={on?Q.gold:Q.muted}/>
                  <span style={{flex:1,textAlign:"left"}}>{sp.name}</span>
                  <span style={{fontSize:11,color:Q.dim}}>{(sp.events||[]).length}</span>
                </button>
              );
            })}
          </aside>
        )}

        {/* Centro */}
        <main style={{minWidth:0}}>
          {/* Hero: Bet Best, que es el argumento de venta */}
          <div style={{position:"relative",overflow:"hidden",borderRadius:12,
            marginBottom:14,padding:"26px 30px",
            background:`linear-gradient(115deg,#1B2E7A,${Q.violet} 45%,${Q.violet2})`}}>
            <svg viewBox="0 0 600 170" preserveAspectRatio="none" style={{position:"absolute",
              inset:0,width:"100%",height:"100%",opacity:.25}}>
              <g stroke="#fff" strokeWidth="1.2" fill="none">
                <rect x="1" y="1" width="598" height="168"/>
                <line x1="300" y1="0" x2="300" y2="170"/>
                <circle cx="300" cy="85" r="40"/>
                <rect x="1" y="40" width="62" height="90"/>
                <rect x="537" y="40" width="62" height="90"/>
              </g>
            </svg>
            <div style={{position:"relative",maxWidth:460}}>
              <div style={{fontSize:10,letterSpacing:2.4,fontWeight:800,
                color:Q.gold}}>BET BEST</div>
              <h1 style={{fontFamily:F_NUM,fontSize:38,fontWeight:700,lineHeight:1,
                marginTop:7}}>Traé el boleto de otra casa.<br/>Te pagamos mejor.</h1>
              <p style={{fontSize:13.5,color:"#D5E0FF",marginTop:10,lineHeight:1.5}}>
                Sacale una foto, leemos las selecciones y te decimos si podemos
                mejorarte la cuota. Después lo pagás en cualquier agencia.</p>
            </div>
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
                  <IconoDeporte nombre={grupo.nombre} color={Q.gold}/>
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

const spItem={display:"flex",alignItems:"center",gap:11,padding:"10px 14px",
  width:"100%",background:"transparent",border:"none",cursor:"pointer",
  color:Q.text,fontSize:13,fontWeight:500,fontFamily:F_BODY};
