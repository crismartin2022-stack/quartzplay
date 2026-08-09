// ═══════════════════════════════════════════════════════════════
// BOX — Terminal de autoconsulta de agencia
// El cliente arma su apuesta solo y saca un código QP + QR para pagar
// en el mostrador. Ruta: /box/AGE002
// Solo prematch: las cuotas en vivo cambian y podrían vencer antes de
// llegar a la caja.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";

const API = "https://amusing-vision-production.up.railway.app";

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
    surface:"#0D1530", card:"#111B3B", inset:Q.inset,
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

const ars = n => "$" + Math.round(n||0).toLocaleString("es-AR");
const fmt = n => Number(n||0).toFixed(2);

function EstadisticasBoxBoton({ ev }){
  const [abierto,setAbierto]=useState(false);
  const [stats,setStats]=useState(null);
  const home=ev.h||ev.home; const away=ev.a||ev.away;
  const fecha=(ev.commence_time||ev.time||"").slice(0,10);
  const eid=ev.event_id||ev.id||"";
  const abrir=()=>{
    setAbierto(true);
    if(stats) return;
    const srId=(typeof eid==="string"&&eid.startsWith("sr:sport_event:"))?`&event_id=${encodeURIComponent(eid)}`:"";
    const q=`home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&fecha=${fecha}${srId}`;
    fetch(`${API}/api/partido/stats?${q}`).then(r=>r.json()).then(setStats).catch(()=>setStats({disponible:false}));
  };
  return(
    <>
      <button onClick={abrir} style={{width:"100%",marginTop:8,
        background:ov(0.04),border:`1px solid ${Q.cyan}44`,borderRadius:10,
        padding:"8px",cursor:"pointer",color:Q.cyan,fontSize:12,fontWeight:700}}>
        📊 Estadísticas</button>
      {abierto&&(
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(2,2,8,0.92)",
          display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
          onClick={()=>setAbierto(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:Q.dark,
            border:`1px solid ${Q.violet}55`,borderRadius:16,maxWidth:480,width:"100%",
            maxHeight:"80vh",overflowY:"auto",padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{color:Q.text,fontWeight:700,fontSize:16}}>{home} vs {away}</span>
              <button onClick={()=>setAbierto(false)} style={{background:"transparent",
                border:"none",color:Q.muted,fontSize:28,cursor:"pointer"}}>×</button>
            </div>
            {!stats&&<div style={{color:Q.muted,textAlign:"center",padding:24}}>Cargando...</div>}
            {stats&&stats.marcador&&stats.marcador.home!=null&&(
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{color:Q.gold,fontWeight:900,fontSize:34}}>
                  {stats.marcador.home} - {stats.marcador.away}</div>
              </div>
            )}
            {stats&&(!stats.disponible||!stats.tiene_stats)&&(
              <div style={{color:Q.muted,fontSize:13,textAlign:"center",padding:28}}>
                📊 No hay estadísticas detalladas para este partido.</div>
            )}
            {stats&&stats.tiene_stats&&stats.stats.map((st,i)=>{
              const tot=(st.home||0)+(st.away||0)||1;
              const ph=Math.round((st.home/tot)*100);
              return(
                <div key={i} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{color:Q.text,fontSize:14,fontWeight:700}}>{st.home}{st.unidad}</span>
                    <span style={{color:Q.muted,fontSize:12}}>{st.label}</span>
                    <span style={{color:Q.text,fontSize:14,fontWeight:700}}>{st.away}{st.unidad}</span>
                  </div>
                  <div style={{display:"flex",height:7,borderRadius:4,overflow:"hidden",
                    background:ov(0.08)}}>
                    <div style={{width:`${ph}%`,background:Q.cyan}}/>
                    <div style={{width:`${100-ph}%`,background:Q.violet}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function TeamLogo({ name, size=30 }){
  const [fallo,setFallo]=useState(false);
  const ini=(name||"?").split(" ").filter(Boolean).slice(0,2)
    .map(w=>w[0].toUpperCase()).join("");
  let h=0; for(let i=0;i<(name||"").length;i++) h=((h<<5)-h)+name.charCodeAt(i);
  const colors=["#2B6BFF","#7B3FE4","#0E8F6F","#C4162A","#1B3A8C","#E07A1F"];
  const color=colors[Math.abs(h)%colors.length];
  if(name&&!fallo) return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:Q.inset,border:`1px solid ${Q.border}`,
      display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      <img src={`${API}/api/team-logo/nombre/${encodeURIComponent(name)}`}
        alt={name} loading="lazy" onError={()=>setFallo(true)}
        style={{width:"78%",height:"78%",objectFit:"contain"}}/>
    </div>
  );
  return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:`linear-gradient(135deg,${color},${color}88)`,
      display:"flex",alignItems:"center",
      justifyContent:"center"}}>
      <span style={{color:"#fff",fontWeight:700,fontSize:size*0.42,
        fontFamily:F_NUM,letterSpacing:0.3}}>{ini||"?"}</span>
    </div>
  );
}

// ── CORREGIR PICK (box) ───────────────────────────────────────
function CorregirPickBox({ pick, onAplicar, onQuitar }){
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
    <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
      {(pick.home_real||pick.away_real)&&(
        <div style={{color:Q.muted,fontSize:10,marginBottom:8}}>
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

      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <button onClick={()=>setModo("seleccion")} style={{flex:1,
          background:modo==="seleccion"?`${Q.violet}33`:ov(0.04),
          border:`1px solid ${modo==="seleccion"?Q.violet:Q.border}`,borderRadius:8,
          padding:"7px",cursor:"pointer",color:modo==="seleccion"?Q.cyan:Q.muted,
          fontSize:11,fontWeight:700}}>Cambiar selección</button>
        <button onClick={()=>setModo("partido")} style={{flex:1,
          background:modo==="partido"?`${Q.violet}33`:ov(0.04),
          border:`1px solid ${modo==="partido"?Q.violet:Q.border}`,borderRadius:8,
          padding:"7px",cursor:"pointer",color:modo==="partido"?Q.cyan:Q.muted,
          fontSize:11,fontWeight:700}}>Otro partido</button>
      </div>

      {modo==="seleccion"&&(
        <div>
          {opciones.length===0&&<div style={{color:Q.muted,fontSize:11,marginBottom:8}}>
            No tenemos opciones de este partido. Probá "Otro partido".</div>}
          {opciones.map((op,k)=>(
            <button key={k} onClick={()=>elegirOpcion(op)} style={{width:"100%",
              display:"flex",justifyContent:"space-between",alignItems:"center",
              background:ov(0.04),border:`1px solid ${Q.border}`,
              borderRadius:8,padding:"9px 12px",marginBottom:5,cursor:"pointer"}}>
              <span style={{color:Q.text,fontSize:12}}>{op.sel}</span>
              <span style={{color:Q.cyan,fontWeight:700,fontSize:13}}>{fmt(op.odd)}</span>
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
              style={{flex:1,background:ov(0.05),
                border:`1px solid ${Q.border}`,borderRadius:8,padding:"9px 12px",
                color:Q.text,fontSize:14}}/>
            <button onClick={buscarEventos} style={{background:`${Q.violet}33`,
              border:`1px solid ${Q.violet}`,borderRadius:8,padding:"0 14px",
              cursor:"pointer",color:Q.cyan,fontSize:12,fontWeight:700}}>
              {buscando?"...":"Buscar"}</button>
          </div>
          {encontrados.map((ev,k)=>(
            <div key={k} style={{background:ov(0.03),
              border:`1px solid ${Q.dim}`,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,marginBottom:6}}>
                {ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevo(ev,op)} style={{
                    background:ov(0.05),border:`1px solid ${Q.border}`,
                    borderRadius:7,padding:"5px 9px",cursor:"pointer",
                    color:Q.cyan,fontSize:11,fontWeight:600}}>
                    {op.sel} · {fmt(op.odd)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:6,marginTop:8}}>
        <input value={ajuste} onChange={e=>setAjuste(e.target.value)}
          placeholder="Cuota a mano (opcional)" inputMode="decimal"
          style={{flex:1,background:ov(0.05),
            border:`1px solid ${Q.border}`,borderRadius:8,padding:"8px 10px",
            color:Q.text,fontSize:13}}/>
        <button onClick={onQuitar} style={{background:`${Q.pink}18`,
          border:`1px solid ${Q.pink}`,borderRadius:8,padding:"8px 12px",
          cursor:"pointer",color:Q.pink,fontSize:11,fontWeight:700}}>Quitar</button>
      </div>
    </div>
  );
}

export default function Box(){
  // Código de agencia desde la URL: /box/AGE002
  const agenciaCode = (window.location.pathname.split("/")[2]||"").toUpperCase();

  const [agencia,setAgencia]=useState(null);
  const [errAg,setErrAg]=useState("");
  const [deportes,setDeportes]=useState(null);
  const [liga,setLiga]=useState(null);
  const [busqueda,setBusqueda]=useState("");
  const [picks,setPicks]=useState([]);
  const [monto,setMonto]=useState(1000);
  const [bbFeature,setBbFeature]=useState({activo:false,min_picks:2});
  useEffect(()=>{
    if(!agenciaCode) return;
    fetch(`${API}/api/bet-builder/config?agencia=${agenciaCode}`)
      .then(r=>r.ok?r.json():null).then(d=>{ if(d) setBbFeature(d); }).catch(()=>{});
  },[agenciaCode]);
  const [pantalla,setPantalla]=useState("armar");  // armar | listo
  const [slip,setSlip]=useState(null);
  const [enviando,setEnviando]=useState(false);
  const [errEnvio,setErrEnvio]=useState("");
  const [seccion,setSeccion]=useState("armar");    // armar | combos | mejorar | cashout
  // Cash out
  const [coCode,setCoCode]=useState("");
  const [coValor,setCoValor]=useState(null);
  const [coMsg,setCoMsg]=useState("");
  const [coProc,setCoProc]=useState(false);
  const [coHecho,setCoHecho]=useState(null);
  const consultarCO=async()=>{
    if(!coCode.trim()||coProc) return;
    setCoProc(true); setCoMsg(""); setCoValor(null); setCoHecho(null);
    try{
      const r=await fetch(`${API}/api/betslip/${coCode.trim().toUpperCase()}/cashout`);
      const d=await r.json();
      if(d.disponible) setCoValor(d.valor);
      else setCoMsg(d.motivo||"Cash out no disponible");
    }catch(e){ setCoMsg("Error al consultar"); }
    setCoProc(false);
  };
  const [coTieneCuenta,setCoTieneCuenta]=useState(false);
  const ejecutarCO=async(destino)=>{
    if(coProc) return;
    setCoProc(true); setCoMsg("");
    try{
      const r=await fetch(`${API}/api/betslip/${coCode.trim().toUpperCase()}/cashout`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ejecutor:"box",valor_esperado:coValor,destino}),
      });
      const d=await r.json();
      if(r.ok&&d.ok){ setCoHecho({valor:d.valor,destino:d.destino,code:d.code,mensaje:d.mensaje});
        setCoValor(null); }
      else setCoMsg(d.detail||"No se pudo cashear");
    }catch(e){ setCoMsg("Error al cashear"); }
    setCoProc(false);
  };
  // Combos IA
  const [combos,setCombos]=useState(null);
  // Mejorar por captura
  const [imgsMejora,setImgsMejora]=useState([]);
  const [analizando,setAnalizando]=useState(false);
  const [resMejora,setResMejora]=useState(null);
  const [corrigiendo,setCorrigiendo]=useState(null);
  const aplicarCorreccion=(idx,nuevo)=>{
    setResMejora(r=>{
      const picks=r.picks.map((p,i)=>i===idx?{...p,...nuevo}:p);
      const validos=picks.filter(p=>p.odd_final);
      let t=1; validos.forEach(p=>t*=p.odd_final);
      return {...r,picks,picks_ok:validos.length,
        cuota_total:validos.length?Math.round(t*100)/100:null};
    });
    setCorrigiendo(null);
  };
  const quitarPickM=(idx)=>{
    setResMejora(r=>{
      const picks=r.picks.filter((_,i)=>i!==idx);
      const validos=picks.filter(p=>p.odd_final);
      let t=1; validos.forEach(p=>t*=p.odd_final);
      return {...r,picks,picks_total:picks.length,picks_ok:validos.length,
        cuota_total:validos.length?Math.round(t*100)/100:null};
    });
    setCorrigiendo(null);
  };
  const [errMejora,setErrMejora]=useState("");

  // Validar la agencia de la URL
  useEffect(()=>{
    if(!agenciaCode){ setErrAg("Falta el código de agencia en la dirección"); return; }
    fetch(`${API}/api/box/${agenciaCode}/valida`)
      .then(r=>r.ok?r.json():Promise.reject())
      .then(d=>setAgencia(d))
      .catch(()=>setErrAg("Agencia no encontrada"));
  },[agenciaCode]);

  // Cargar prematch
  useEffect(()=>{
    if(!agencia) return;
    fetch(`${API}/api/live/prematch`)
      .then(r=>r.ok?r.json():null)
      .then(d=>setDeportes(d?.sports||[]))
      .catch(()=>setDeportes([]));
  },[agencia]);

  // Cargar combos (IA + manuales de esta agencia) al abrir la sección
  useEffect(()=>{
    if(seccion!=="combos" || combos!==null) return;
    Promise.all([
      fetch(`${API}/api/ai/combos`).then(r=>r.ok?r.json():{combos:[]}).catch(()=>({combos:[]})),
      fetch(`${API}/api/box/${agenciaCode}/combos-manuales`)
        .then(r=>r.ok?r.json():{combos:[]}).catch(()=>({combos:[]})),
    ]).then(([ia, man])=>{
      // Los manuales primero (son los que la casa quiere destacar)
      setCombos([...(man.combos||[]), ...(ia.combos||[])]);
    });
  },[seccion, combos, agenciaCode]);

  // Cargar un combo IA al carrito
  const cargarCombo=(combo)=>{
    setPicks(combo.picks.map(p=>({
      id:`${p.h}-${p.a}-${p.sel}`, home:p.h, away:p.a, sel:p.sel,
      odd:p.odd, sport:p.sport, event_id:p.event_id, sport_key:p.sport_key,
    })));
    setSeccion("armar");
  };

  // Analizar captura de otro sitio
  const elegirImg=(e)=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length) return;
    setErrMejora(""); setResMejora(null);
    files.forEach(file=>{
      if(file.size>8*1024*1024){ setErrMejora("Una imagen supera 8MB"); return; }
      const rd=new FileReader();
      rd.onload=()=>setImgsMejora(prev=>[...prev,{b64:rd.result.split(",")[1],
        tipo:file.type||"image/jpeg", preview:rd.result}]);
      rd.readAsDataURL(file);
    });
    e.target.value="";
  };
  const quitarImgMejora=(i)=>setImgsMejora(prev=>prev.filter((_,k)=>k!==i));
  const analizarImg=async()=>{
    if(!imgsMejora.length||analizando) return;
    setAnalizando(true); setErrMejora(""); setResMejora(null);
    try{
      const r=await fetch(`${API}/api/mejorar-combinada`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({imagenes:imgsMejora.map(im=>({data:im.b64,media_type:im.tipo}))}),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      if(!d.ok) setErrMejora(d.mensaje||"No se pudo leer la imagen");
      else setResMejora(d);
    }catch(e){ setErrMejora(e.message==="Failed to fetch"?"Sin conexión":e.message); }
    setAnalizando(false);
  };
  // Cargar al carrito los picks que sí podemos tomar de una captura
  const cargarMejora=()=>{
    const validos=(resMejora?.picks||[]).filter(p=>p.odd_final);
    setPicks(validos.map(p=>({
      id:`${p.home}-${p.away}-${p.selection}`, home:p.home, away:p.away,
      sel:p.selection, odd:p.odd_final, sport:p.market,
      event_id:p.event_id, sport_key:p.sport_key,
    })));
    setSeccion("armar"); setImgsMejora([]); setResMejora(null);
  };

  const togglePick=(ev,dep,label,odd)=>{
    const id=`${ev.h}-${ev.a}-${label}`;
    setPicks(p=>{
      const w=p.filter(x=>x.id!==id);
      if(p.find(x=>x.id===id)) return w;
      const delMismo=p.filter(x=>x.home===ev.h&&x.away===ev.a).length;
      if(delMismo>=(bbFeature.max_picks||4)){
        alert(`Máximo ${bbFeature.max_picks||4} selecciones del mismo partido`);
        return p;
      }
      return[...w,{id,home:ev.h,away:ev.a,sel:label,odd,sport:dep,
        event_id:ev.id,sport_key:ev.sport_key}];
    });
  };
  const tiene=(ev,label)=>picks.some(x=>x.id===`${ev.h}-${ev.a}-${label}`);
  const totBruto=picks.length?picks.reduce((a,p)=>a*p.odd,1):1;

  // Mismo partido + cotización protegida
  const partidos={};
  picks.forEach(p=>{ partidos[`${p.home}-${p.away}`]=(partidos[`${p.home}-${p.away}`]||0)+1; });
  const mismoPartido=Object.values(partidos).some(c=>c>=2);
  const [cuotaProt,setCuotaProt]=useState(null);
  useEffect(()=>{
    if(picks.length===0){ setCuotaProt(null); return; }
    let vivo=true;
    fetch(`${API}/api/bet-builder/cotizar`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({picks:picks.map(p=>({odd:p.odd})),mismo_partido:mismoPartido}),
    }).then(r=>r.ok?r.json():null).then(d=>{ if(vivo&&d) setCuotaProt(d.cuota); }).catch(()=>{});
    return ()=>{vivo=false;};
    // eslint-disable-next-line
  },[JSON.stringify(picks.map(p=>[p.id,p.odd])),mismoPartido]);
  const totOdd = cuotaProt!=null ? cuotaProt : totBruto;

  const confirmar=async()=>{
    if(!picks.length||enviando) return;
    setEnviando(true); setErrEnvio("");
    try{
      const r=await fetch(`${API}/api/box/${agenciaCode}/betslip`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({picks:picks.map(p=>({
          home:p.home,away:p.away,sel:p.sel,odd:p.odd,sport:p.sport,
          event_id:p.event_id,sport_key:p.sport_key,
        })), odd_total:totOdd, mismo_partido:mismoPartido}),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      setSlip({code:d.code, odd_total:d.odd_total,
        picks:[...picks], monto});
      setPantalla("listo");
    }catch(e){ setErrEnvio(e.message==="Failed to fetch"?"Sin conexión":e.message); }
    setEnviando(false);
  };

  const reiniciar=()=>{
    setPicks([]); setSlip(null); setPantalla("armar");
    setMonto(1000); setBusqueda(""); setLiga(null);
  };

  // ── Estilos base full-screen ──
  const [tema,setTema]=useState(temaGuardado());
  const cambiarTema=(t)=>{ aplicarTema(t); setTema(t); };
  aplicarTema(tema);

  const wrap={minHeight:"100dvh",background:Q.void,color:Q.text,
    fontFamily:F_BODY,
    display:"flex",flexDirection:"column"};

  // El Box se sirve en su propia ruta, asi que carga sus fuentes aparte
  const EstilosBox = () => (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
      *{box-sizing:border-box}
      button{font-family:inherit;-webkit-tap-highlight-color:transparent;
             touch-action:manipulation}
      button:active{opacity:.85}
      ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:${Q.border}}
    `}</style>
  );

  if(errAg) return(
    <div style={{...wrap,alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{fontSize:44,marginBottom:16}}>🚫</div>
      <div style={{fontSize:18,fontWeight:700,textAlign:"center"}}>{errAg}</div>
      <div style={{color:Q.muted,fontSize:13,marginTop:8,textAlign:"center"}}>
        Verificá la dirección de la terminal
      </div>
    </div>
  );

  if(!agencia) return(
    <div style={{...wrap,alignItems:"center",justifyContent:"center"}}>
      <div style={{color:Q.muted,fontSize:16}}>Cargando terminal...</div>
    </div>
  );

  // ── PANTALLA FINAL: código + QR ──
  if(pantalla==="listo"&&slip){
    const ret=Math.round(slip.monto*slip.odd_total);
    const qrData=encodeURIComponent(slip.code);
    return(
      <div style={{...wrap,alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{maxWidth:460,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:10}}>🎟️</div>
          <div style={{fontSize:20,fontWeight:700,marginBottom:4}}>
            ¡Tu apuesta está lista!
          </div>
          <div style={{color:Q.muted,fontSize:14,marginBottom:20}}>
            Mostrá este código en la caja para pagar
          </div>

          <div style={{background:"#fff",borderRadius:20,padding:24,
            marginBottom:20}}>
            <img alt="QR"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${qrData}`}
              style={{width:220,height:220,display:"block",margin:"0 auto"}}/>
            <div style={{color:"#000",fontWeight:900,fontSize:32,marginTop:14,
              letterSpacing:2,fontFamily:"'Courier New',monospace"}}>{slip.code}</div>
          </div>

          <div style={{background:Q.dark,borderRadius:16,padding:20,
            border:`1px solid ${Q.border}`,marginBottom:20,textAlign:"left"}}>
            {slip.picks.map((p,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",
                padding:"8px 0",gap:10,
                borderBottom:i<slip.picks.length-1?`1px solid ${Q.dim}`:"none"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.home} vs {p.away}</div>
                  <div style={{color:Q.muted,fontSize:12}}>{p.sel}</div>
                </div>
                <span style={{color:Q.cyan,fontWeight:700,fontSize:15,flexShrink:0}}>
                  {fmt(p.odd)}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",
              marginTop:12,paddingTop:12,borderTop:`2px solid ${Q.violet}44`}}>
              <span style={{color:Q.muted,fontSize:14}}>Cuota total</span>
              <span style={{color:Q.gold,fontWeight:900,fontSize:20}}>{fmt(slip.odd_total)}x</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
              <span style={{color:Q.muted,fontSize:14}}>Monto sugerido</span>
              <span style={{fontWeight:700,fontSize:16}}>{ars(slip.monto)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
              <span style={{color:Q.muted,fontSize:14}}>Retorno potencial</span>
              <span style={{color:Q.green,fontWeight:900,fontSize:18}}>{ars(ret)}</span>
            </div>
          </div>

          <div style={{color:Q.amber,fontSize:12,marginBottom:20,lineHeight:1.4}}>
            ⏱ El código vale por 24 horas. El monto final lo confirmás en la caja.
          </div>

          <button onClick={reiniciar} style={{width:"100%",
            background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            border:"none",borderRadius:14,padding:"16px",cursor:"pointer",
            color:"#fff",fontWeight:700,fontSize:16}}>
            Hacer otra apuesta
          </button>
        </div>
      </div>
    );
  }

  // ── PANTALLA ARMAR ──
  const filtrados=(deportes||[])
    .filter(d=>!liga||d.name===liga)
    .map(d=>({...d,events:(d.events||[]).filter(ev=>{
      const q=busqueda.trim().toLowerCase();
      return !q||`${ev.h} ${ev.a}`.toLowerCase().includes(q);
    })}))
    .filter(d=>d.events.length>0);

  return(
    <div style={wrap}>
      <EstilosBox/>
      {/* Encabezado */}
      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"16px 20px",display:"flex",alignItems:"center",
        justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div>
          <div style={{fontFamily:F_NUM,fontWeight:700,fontSize:26,color:Q.text,
            letterSpacing:0.5,lineHeight:1}}>
            QUARTZ<span style={{color:Q.gold}}>PLAY</span></div>
          <div style={{color:Q.muted,fontSize:12,marginTop:3}}>
            {agencia.name} · Terminal</div>
        </div>
        <div style={{marginLeft:"auto"}}>
          <BotonTema tema={tema} onCambiar={cambiarTema}/>
        </div>
        {picks.length>0&&(
          <div style={{textAlign:"right"}}>
            <div style={{color:Q.muted,fontWeight:600,fontSize:12,fontFamily:F_BODY}}>
              {picks.length} {picks.length===1?"pick":"picks"}</div>
            <div style={{color:Q.gold,fontSize:24,fontWeight:700,fontFamily:F_NUM,
              lineHeight:1.05}}>{fmt(totOdd)}x</div>
          </div>
        )}
      </div>

      {/* Pestañas */}
      <div style={{display:"flex",gap:6,padding:"12px 20px 0",
        maxWidth:720,margin:"0 auto",width:"100%"}}>
        {[["armar","Armar"],["combos","Combos"],["mejorar","Bet Best"],["cashout","Cash out"]].map(([k,l])=>{
          const on = seccion===k;
          const bb = k==="mejorar";   // la funcion insignia se lleva el dorado
          return(
          <button key={k} onClick={()=>setSeccion(k)} style={{
            flex:bb?1.25:1,
            background: bb ? (on?`linear-gradient(145deg,#FFE07A,${Q.goldBg})`:`${Q.gold}1A`)
                           : (on?Q.violet:Q.inset),
            border:`1px solid ${bb?Q.gold:(on?Q.violet:Q.border)}`,borderRadius:10,
            padding:"12px 6px",cursor:"pointer",
            color: bb ? (on?"#1A1200":Q.gold) : (on?"#fff":Q.muted),
            fontSize:14,fontWeight:on||bb?700:500,fontFamily:F_BODY,
            display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
            {bb&&(
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                stroke={on?"#1A1200":Q.gold} strokeWidth="1.9"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5A1.5 1.5 0 014.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0121 8.5v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5z"/>
                <circle cx="12" cy="13" r="3.5"/>
              </svg>
            )}
            {l}</button>
          );
        })}
      </div>

      {/* Cuerpo scroll */}
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px 120px",
        maxWidth:720,margin:"0 auto",width:"100%"}}>

        {/* ── SECCIÓN COMBOS ── */}
        {seccion==="combos"&&(
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Combos sugeridos</div>
            <div style={{color:Q.muted,fontSize:12,marginBottom:14}}>
              Tocá uno para cargarlo y sacar tu código
            </div>
            {combos===null&&<div style={{color:Q.muted,textAlign:"center",
              padding:30,fontSize:15}}>Cargando combos...</div>}
            {combos&&combos.length===0&&(
              <div style={{textAlign:"center",padding:30}}>
                <div style={{fontSize:30,marginBottom:8}}>🌙</div>
                <div style={{color:Q.muted,fontSize:14}}>No hay combos ahora</div>
              </div>
            )}
            {(combos||[]).map((combo,ci)=>(
              <div key={combo.id||ci} style={{background:Q.dark,borderRadius:14,
                padding:16,marginBottom:12,border:`1px solid ${combo.tagColor||Q.border}44`}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:10,gap:8}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontWeight:700,fontSize:15}}>{combo.name}</div>
                    <div style={{color:combo.tagColor||Q.muted,fontSize:11,
                      marginTop:2}}>{combo.tag}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:Q.gold,fontWeight:900,fontSize:19}}>{fmt(combo.odd_total)}x</div>
                    <div style={{color:Q.muted,fontSize:10}}>{combo.picks.length} picks</div>
                  </div>
                </div>
                {combo.picks.slice(0,4).map((p,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",
                    padding:"5px 0",gap:8,fontSize:12}}>
                    <span style={{color:Q.muted,overflow:"hidden",
                      textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {p.h} vs {p.a} · {p.sel}</span>
                    <span style={{color:Q.cyan,fontWeight:700,flexShrink:0}}>{fmt(p.odd)}</span>
                  </div>
                ))}
                <button onClick={()=>cargarCombo(combo)} style={{width:"100%",
                  marginTop:10,background:`linear-gradient(135deg,${combo.tagColor||Q.violet},${Q.violet})`,
                  border:"none",borderRadius:10,padding:"12px",cursor:"pointer",
                  color:"#fff",fontWeight:700,fontSize:14}}>
                  Usar este combo</button>
              </div>
            ))}
          </div>
        )}

        {/* ── SECCIÓN CASH OUT ── */}
        {seccion==="cashout"&&(
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>💰 Cash out</div>
            <div style={{color:Q.muted,fontSize:12,marginBottom:14,lineHeight:1.4}}>
              Ingresá el código de tu apuesta para retirar antes de que termine,
              al valor actual en vivo.
            </div>

            {!coHecho&&(
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <input value={coCode} onChange={e=>setCoCode(e.target.value.toUpperCase())}
                  onKeyDown={e=>e.key==="Enter"&&consultarCO()}
                  placeholder="QP-47829"
                  style={{flex:1,background:ov(0.06),
                    border:`1.5px solid ${Q.border}`,borderRadius:10,padding:"12px 16px",
                    color:Q.text,fontSize:20,fontWeight:700,letterSpacing:2}}/>
                <button onClick={consultarCO} disabled={!coCode||coProc}
                  style={{background:`${Q.gold}33`,border:`1.5px solid ${Q.gold}`,
                    borderRadius:10,padding:"0 18px",color:Q.gold,fontWeight:700,
                    fontSize:14,cursor:"pointer"}}>{coProc?"...":"VER"}</button>
              </div>
            )}

            {coMsg&&<div style={{color:Q.red,fontSize:13,textAlign:"center",marginBottom:12}}>{coMsg}</div>}

            {coValor!=null&&!coHecho&&(
              <div style={{background:`${Q.gold}12`,border:`1px solid ${Q.gold}`,
                borderRadius:14,padding:20,marginBottom:12,textAlign:"center"}}>
                <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1}}>
                  Retirás ahora</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:36,margin:"6px 0"}}>
                  ${Math.round(coValor).toLocaleString("es-AR")}</div>
                <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>¿Cómo querés cobrarlo?</div>
                <button onClick={()=>ejecutarCO("cuenta")} disabled={coProc}
                  style={{width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                    border:"none",borderRadius:11,padding:14,color:"#fff",fontWeight:700,
                    fontSize:14,cursor:"pointer",marginBottom:8}}>
                  A mi cuenta (si tengo)</button>
                <button onClick={()=>ejecutarCO("mostrador")} disabled={coProc}
                  style={{width:"100%",background:`${Q.gold}22`,
                    border:`1px solid ${Q.gold}`,borderRadius:11,padding:14,color:Q.gold,
                    fontWeight:700,fontSize:14,cursor:"pointer"}}>
                  Código para cobrar en mostrador</button>
                <button onClick={()=>{setCoValor(null);setCoCode("");}}
                  style={{marginTop:10,background:"transparent",border:"none",
                    color:Q.muted,fontSize:12,cursor:"pointer"}}>Cancelar</button>
              </div>
            )}

            {coHecho&&(
              <div style={{background:`${Q.green}12`,border:`1px solid ${Q.green}`,
                borderRadius:14,padding:24,textAlign:"center"}}>
                <div style={{fontSize:48,marginBottom:8}}>{coHecho.destino==="cuenta"?"✅":"🎫"}</div>
                <div style={{color:Q.green,fontWeight:800,fontSize:18,marginBottom:6}}>
                  Cash out confirmado</div>
                <div style={{color:Q.text,fontWeight:900,fontSize:30,marginBottom:8}}>
                  ${Math.round(coHecho.valor).toLocaleString("es-AR")}</div>
                {coHecho.destino==="cuenta"?(
                  <div style={{color:Q.muted,fontSize:13}}>Se acreditó a tu cuenta.</div>
                ):(
                  <div>
                    <div style={{color:Q.muted,fontSize:13,marginBottom:10}}>
                      Mostrá este código en la caja para cobrar en efectivo:</div>
                    <div style={{background:ov(0.06),border:`1px solid ${Q.gold}`,
                      borderRadius:12,padding:"14px",color:Q.gold,fontWeight:900,fontSize:26,
                      letterSpacing:3}}>{coHecho.code}</div>
                  </div>
                )}
                <button onClick={()=>{setCoHecho(null);setCoCode("");setCoValor(null);}}
                  style={{marginTop:16,background:`${Q.violet}22`,border:`1px solid ${Q.violet}`,
                    borderRadius:10,padding:"10px 24px",color:Q.violet2||Q.violet,
                    fontWeight:700,fontSize:13,cursor:"pointer"}}>Listo</button>
              </div>
            )}
          </div>
        )}

        {/* ── SECCIÓN MEJORAR ── */}
        {seccion==="mejorar"&&(
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Mejorá tu apuesta</div>
            <div style={{color:Q.muted,fontSize:12,marginBottom:14,lineHeight:1.4}}>
              Subí la captura de una apuesta de otro sitio. La leemos y la
              replicamos con nuestras cuotas.
            </div>
            {imgsMejora.length>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {imgsMejora.map((im,i)=>(
                  <div key={i} style={{position:"relative"}}>
                    <img src={im.preview} alt={"f"+i} style={{width:64,height:64,
                      objectFit:"cover",borderRadius:8,border:`1px solid ${Q.border}`}}/>
                    <button onClick={()=>quitarImgMejora(i)} style={{position:"absolute",
                      top:-6,right:-6,width:20,height:20,borderRadius:"50%",
                      background:Q.pink,border:"none",color:"#fff",fontSize:11,
                      cursor:"pointer",lineHeight:1}}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:14,
                padding:"22px 12px",textAlign:"center",cursor:"pointer"}}>
                <input type="file" accept="image/*" capture="environment"
                  onChange={elegirImg} style={{display:"none"}}/>
                <div style={{fontSize:26,marginBottom:5}}>📸</div>
                <div style={{fontWeight:700,fontSize:12}}>Sacar foto</div>
              </label>
              <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:14,
                padding:"22px 12px",textAlign:"center",cursor:"pointer"}}>
                <input type="file" accept="image/*" multiple onChange={elegirImg}
                  style={{display:"none"}}/>
                <div style={{fontSize:26,marginBottom:5}}>🖼️</div>
                <div style={{fontWeight:700,fontSize:12}}>
                  {imgsMejora.length>0?"Agregar más":"Galería"}</div>
              </label>
            </div>
            {imgsMejora.length>0&&(
              <button onClick={analizarImg} disabled={analizando} style={{width:"100%",
                background:analizando?ov(0.06):`linear-gradient(135deg,${Q.cyan},${Q.violet})`,
                border:"none",borderRadius:12,padding:"14px",marginBottom:4,
                cursor:analizando?"wait":"pointer",color:analizando?Q.muted:"#fff",
                fontWeight:700,fontSize:14}}>
                {analizando?"Leyendo...":`🔍 Analizar ${imgsMejora.length} foto${imgsMejora.length>1?"s":""}`}</button>
            )}
            {errMejora&&<div style={{color:Q.pink,fontSize:13,marginTop:10}}>{errMejora}</div>}
            {analizando&&<div style={{color:Q.violet2,fontSize:13,textAlign:"center",
              padding:16}}>La IA está leyendo tu apuesta...</div>}
            {resMejora&&(
              <div style={{marginTop:14}}>
                <div style={{color:Q.muted,fontSize:12,marginBottom:10}}>
                  Leímos {resMejora.picks_total} · podemos tomar {resMejora.picks_ok}
                </div>
                {resMejora.faltan_picks&&(
                  <div style={{background:`${Q.pink}12`,border:`1px solid ${Q.pink}66`,
                    borderRadius:9,padding:"9px 11px",marginBottom:10,color:Q.pink,
                    fontSize:11,lineHeight:1.4}}>
                    ⚠️ El cupón marca cuota {fmt(resMejora.total_odd_cupon)} pero con lo
                    leído no llegamos. Falta algún partido — agregá otra foto.
                  </div>
                )}
                {resMejora.picks.map((p,i)=>{
                  const c=p.odd_final?(p.ajustada?Q.amber:Q.green):Q.red;
                  return(
                  <div key={i} style={{background:Q.dark,borderRadius:12,padding:12,
                    marginBottom:8,border:`1px solid ${c}44`}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                      <div style={{minWidth:0,flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.home} vs {p.away}</div>
                        <div style={{color:Q.muted,fontSize:11}}>{p.selection}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0,fontSize:12}}>
                        {p.odd_original&&<div style={{color:Q.dim}}>Origen {fmt(p.odd_original)}</div>}
                        {p.odd_final?<div style={{color:c,fontWeight:700}}>
                          Nuestra {fmt(p.odd_final)}{p.ajustada?" ↑":""}</div>
                          :<div style={{color:Q.red,fontSize:10}}>No disponible</div>}
                      </div>
                    </div>
                    <button onClick={()=>setCorrigiendo(corrigiendo===i?null:i)} style={{
                      marginTop:8,background:corrigiendo===i?`${Q.cyan}22`:"transparent",
                      border:`1px solid ${corrigiendo===i?Q.cyan:Q.dim}`,borderRadius:8,
                      padding:"6px 12px",cursor:"pointer",color:corrigiendo===i?Q.cyan:Q.muted,
                      fontSize:11,fontWeight:700}}>
                      {corrigiendo===i?"✕ Cerrar":"✏️ Está mal / Corregir"}</button>
                    {corrigiendo===i&&(
                      <CorregirPickBox pick={p}
                        onAplicar={(nuevo)=>aplicarCorreccion(i,nuevo)}
                        onQuitar={()=>quitarPickM(i)}/>
                    )}
                  </div>
                  );
                })}
                {resMejora.picks_ok>0&&(
                  <button onClick={cargarMejora} style={{width:"100%",marginTop:6,
                    background:`linear-gradient(135deg,${Q.green},#00a854)`,
                    border:"none",borderRadius:12,padding:"14px",cursor:"pointer",
                    color:"#04120a",fontWeight:900,fontSize:14}}>
                    Cargar {resMejora.picks_ok} selecciones · {fmt(resMejora.cuota_total)}x</button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SECCIÓN ARMAR ── */}
        {seccion==="armar"&&<>
        <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>
          Elegí tus partidos
        </div>

        {bbFeature.activo&&(
          <div style={{background:`${Q.violet}12`,border:`1px solid ${Q.violet}55`,borderRadius:10,
            padding:"9px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:16}}>🛠️</span>
            <div style={{color:Q.muted,fontSize:11,fontFamily:"'Inter',system-ui"}}>
              <b style={{color:Q.violet}}>Bet Builder activo</b> · combiná hasta {bbFeature.max_picks||4} mercados del mismo partido</div>
          </div>
        )}

        {/* Buscador */}
        {deportes&&deportes.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:10,
            background:ov(0.05),border:`1px solid ${Q.border}`,
            borderRadius:12,padding:"12px 16px",marginBottom:10}}>
            <span style={{fontSize:16}}>🔍</span>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
              placeholder="Buscar equipo..."
              style={{background:"transparent",border:"none",color:Q.text,
                fontSize:16,flex:1,minWidth:0,outline:"none"}}/>
          </div>
        )}

        {/* Chips de liga */}
        {deportes&&deportes.length>0&&(
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,
            marginBottom:12}}>
            <button onClick={()=>setLiga(null)} style={{
              background:!liga?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
              border:`1px solid ${!liga?Q.cyan:Q.border}`,borderRadius:20,
              padding:"8px 16px",cursor:"pointer",color:!liga?Q.cyan:Q.muted,
              fontSize:13,fontWeight:!liga?700:400,whiteSpace:"nowrap",flexShrink:0}}>
              Todas</button>
            {deportes.map(d=>(
              <button key={d.name} onClick={()=>setLiga(d.name)} style={{
                background:liga===d.name?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
                border:`1px solid ${liga===d.name?Q.cyan:Q.border}`,borderRadius:20,
                padding:"8px 16px",cursor:"pointer",color:liga===d.name?Q.cyan:Q.muted,
                fontSize:13,fontWeight:liga===d.name?700:400,whiteSpace:"nowrap",
                flexShrink:0}}>{d.icon} {d.name}</button>
            ))}
          </div>
        )}

        {!deportes&&(
          <div style={{color:Q.muted,textAlign:"center",padding:40,fontSize:15}}>
            Cargando partidos...
          </div>
        )}
        {deportes&&deportes.length===0&&(
          <div style={{textAlign:"center",padding:40}}>
            <div style={{fontSize:34,marginBottom:10}}>📭</div>
            <div style={{color:Q.muted,fontSize:15}}>No hay partidos disponibles ahora</div>
          </div>
        )}

        {/* Eventos */}
        {filtrados.map(d=>(
          <div key={d.name} style={{marginBottom:20}}>
            <div style={{color:Q.violet2,fontWeight:700,fontSize:14,marginBottom:10}}>
              {d.icon} {d.name}</div>
            {d.events.map(ev=>(
              <div key={ev.id||(ev.h+ev.a)} style={{background:Q.dark,
                borderRadius:14,padding:16,marginBottom:10,
                border:`1px solid ${Q.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:10,
                  marginBottom:12}}>
                  <TeamLogo name={ev.h} size={28}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:15,overflow:"hidden",
                      textOverflow:"ellipsis"}}>{ev.h} vs {ev.a}</div>
                    <div style={{color:Q.muted,fontSize:12}}>{ev.time}</div>
                  </div>
                  <TeamLogo name={ev.a} size={28}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  {[{label:ev.h+" gana",odd:ev.odds?.L},
                    ev.odds?.E?{label:"Empate",odd:ev.odds.E}:null,
                    {label:ev.a+" gana",odd:ev.odds?.V}]
                    .filter(Boolean).filter(o=>o.odd).map(opt=>{
                    const sel=tiene(ev,opt.label);
                    return(
                    <button key={opt.label}
                      onClick={()=>togglePick(ev,d.name,opt.label,opt.odd)}
                      style={{flex:1,minWidth:0,
                        background:sel?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:ov(0.04),
                        border:`2px solid ${sel?Q.cyan:Q.border}`,borderRadius:12,
                        padding:"12px 6px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{color:Q.muted,fontSize:11,overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{opt.label}</div>
                      <div style={{color:sel?Q.cyan:Q.text,fontWeight:700,
                        fontSize:18}}>{opt.odd}</div>
                    </button>
                    );
                  })}
                </div>
                <EstadisticasBoxBoton ev={{h:ev.h,a:ev.a,time:ev.time,event_id:ev.event_id||ev.id}}/>
              </div>
            ))}
          </div>
        ))}
        </>}
      </div>

      {/* Barra inferior fija con el resumen */}
      {picks.length>0&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,
          background:`linear-gradient(0deg,${Q.void} 85%,transparent)`,
          padding:"16px 20px calc(16px + env(safe-area-inset-bottom))",zIndex:60}}>
          <div style={{maxWidth:720,margin:"0 auto"}}>
            {errEnvio&&<div style={{color:Q.pink,fontSize:13,marginBottom:8,
              textAlign:"center"}}>{errEnvio}</div>}
            <div style={{display:"flex",gap:6,marginBottom:10}}>
              {[500,1000,2000,5000].map(v=>(
                <button key={v} onClick={()=>setMonto(v)} style={{flex:1,
                  background:monto===v?`${Q.violet}33`:ov(0.04),
                  border:`1px solid ${monto===v?Q.violet:Q.border}`,borderRadius:10,
                  padding:"10px 4px",cursor:"pointer",color:monto===v?Q.cyan:Q.muted,
                  fontSize:13,fontWeight:monto===v?700:400}}>
                  {v>=1000?`$${v/1000}K`:`$${v}`}</button>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:10}}>
              <div>
                <span style={{color:Q.muted,fontSize:13}}>{picks.length} picks · </span>
                <span style={{color:Q.gold,fontWeight:700,fontSize:15}}>{fmt(totOdd)}x</span>
              </div>
              <div style={{color:Q.green,fontSize:14}}>
                Retorno: <span style={{fontWeight:700}}>{ars(Math.round(monto*totOdd))}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setPicks([])} style={{
                background:"transparent",border:`1px solid ${Q.border}`,
                borderRadius:14,padding:"0 20px",cursor:"pointer",color:Q.muted,
                fontSize:14}}>Limpiar</button>
              <button onClick={confirmar} disabled={enviando} style={{flex:1,
                background:enviando?ov(0.06):`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                border:"none",borderRadius:14,padding:"16px",
                cursor:enviando?"wait":"pointer",color:enviando?Q.muted:"#fff",
                fontWeight:700,fontSize:16}}>
                {enviando?"Generando...":"Generar código de apuesta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
