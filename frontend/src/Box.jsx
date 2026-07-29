// ═══════════════════════════════════════════════════════════════
// BOX — Terminal de autoconsulta de agencia
// El cliente arma su apuesta solo y saca un código QP + QR para pagar
// en el mostrador. Ruta: /box/AGE002
// Solo prematch: las cuotas en vivo cambian y podrían vencer antes de
// llegar a la caja.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";

const API = "https://amusing-vision-production.up.railway.app";

const Q = {
  void:"#020208", deep:"#060612", dark:"#0A0A1E",
  violet:"#7C3AED", violet2:"#9F5FFF", cyan:"#00F0FF",
  green:"#00FF88", pink:"#FF0080", amber:"#FFB800", gold:"#E8C547",
  text:"#F0F0FF", muted:"#6B7090", dim:"#2A2A4A",
  border:"rgba(124,58,237,0.25)",
};

const ars = n => "$" + Math.round(n||0).toLocaleString("es-AR");
const fmt = n => Number(n||0).toFixed(2);

function TeamLogo({ name, size=30 }){
  const [fallo,setFallo]=useState(false);
  const ini=(name||"?").split(" ").filter(Boolean).slice(0,2)
    .map(w=>w[0].toUpperCase()).join("");
  let h=0; for(let i=0;i<(name||"").length;i++) h=((h<<5)-h)+name.charCodeAt(i);
  const colors=["#7C3AED","#2979FF","#00BCD4","#FF6B35","#E91E63","#009688"];
  const color=colors[Math.abs(h)%colors.length];
  if(name&&!fallo) return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:"rgba(255,255,255,0.06)",border:`1.5px solid ${color}66`,
      display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
      <img src={`${API}/api/team-logo/nombre/${encodeURIComponent(name)}`}
        alt={name} loading="lazy" onError={()=>setFallo(true)}
        style={{width:"78%",height:"78%",objectFit:"contain"}}/>
    </div>
  );
  return(
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:`linear-gradient(135deg,${color}CC,${color}88)`,
      border:`1.5px solid ${color}`,display:"flex",alignItems:"center",
      justifyContent:"center"}}>
      <span style={{color:"#fff",fontWeight:900,fontSize:size*0.36}}>{ini||"?"}</span>
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
  const [pantalla,setPantalla]=useState("armar");  // armar | listo
  const [slip,setSlip]=useState(null);
  const [enviando,setEnviando]=useState(false);
  const [errEnvio,setErrEnvio]=useState("");
  const [seccion,setSeccion]=useState("armar");    // armar | combos | mejorar
  // Combos IA
  const [combos,setCombos]=useState(null);
  // Mejorar por captura
  const [imgMejora,setImgMejora]=useState(null);
  const [analizando,setAnalizando]=useState(false);
  const [resMejora,setResMejora]=useState(null);
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
    const file=e.target.files?.[0];
    if(!file) return;
    if(file.size>8*1024*1024){ setErrMejora("La imagen es muy grande (máx 8MB)"); return; }
    setErrMejora(""); setResMejora(null);
    const rd=new FileReader();
    rd.onload=()=>setImgMejora({b64:rd.result.split(",")[1],
      tipo:file.type||"image/jpeg", preview:rd.result});
    rd.readAsDataURL(file);
  };
  const analizarImg=async()=>{
    if(!imgMejora||analizando) return;
    setAnalizando(true); setErrMejora(""); setResMejora(null);
    try{
      const r=await fetch(`${API}/api/mejorar-combinada`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({imagen:imgMejora.b64,media_type:imgMejora.tipo}),
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
    setSeccion("armar"); setImgMejora(null); setResMejora(null);
  };

  const togglePick=(ev,dep,label,odd)=>{
    const id=`${ev.h}-${ev.a}-${label}`;
    setPicks(p=>{
      const w=p.filter(x=>x.id!==id);
      if(p.find(x=>x.id===id)) return w;
      return[...w,{id,home:ev.h,away:ev.a,sel:label,odd,sport:dep,
        event_id:ev.id,sport_key:ev.sport_key}];
    });
  };
  const tiene=(ev,label)=>picks.some(x=>x.id===`${ev.h}-${ev.a}-${label}`);
  const totOdd=picks.length?picks.reduce((a,p)=>a*p.odd,1):1;

  const confirmar=async()=>{
    if(!picks.length||enviando) return;
    setEnviando(true); setErrEnvio("");
    try{
      const r=await fetch(`${API}/api/box/${agenciaCode}/betslip`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({picks:picks.map(p=>({
          home:p.home,away:p.away,sel:p.sel,odd:p.odd,sport:p.sport,
          event_id:p.event_id,sport_key:p.sport_key,
        }))}),
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
  const wrap={minHeight:"100dvh",background:Q.void,color:Q.text,
    fontFamily:"system-ui,-apple-system,sans-serif",
    display:"flex",flexDirection:"column"};

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
      {/* Encabezado */}
      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"16px 20px",display:"flex",alignItems:"center",
        justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div>
          <div style={{fontWeight:900,fontSize:22,
            background:`linear-gradient(135deg,${Q.violet2},${Q.cyan})`,
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
            QuartzPlay</div>
          <div style={{color:Q.muted,fontSize:12}}>{agencia.name} · Terminal</div>
        </div>
        {picks.length>0&&(
          <div style={{textAlign:"right"}}>
            <div style={{color:Q.cyan,fontWeight:700,fontSize:14}}>
              {picks.length} {picks.length===1?"pick":"picks"}</div>
            <div style={{color:Q.gold,fontSize:12}}>{fmt(totOdd)}x</div>
          </div>
        )}
      </div>

      {/* Pestañas */}
      <div style={{display:"flex",gap:6,padding:"12px 20px 0",
        maxWidth:720,margin:"0 auto",width:"100%"}}>
        {[["armar","🎯 Armar"],["combos","⚡ Combos"],["mejorar","📸 Mejorar"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSeccion(k)} style={{
            flex:1,background:seccion===k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
            border:`1.5px solid ${seccion===k?Q.cyan:Q.border}`,borderRadius:12,
            padding:"11px 6px",cursor:"pointer",color:seccion===k?Q.cyan:Q.muted,
            fontSize:13,fontWeight:seccion===k?700:400}}>{l}</button>
        ))}
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

        {/* ── SECCIÓN MEJORAR ── */}
        {seccion==="mejorar"&&(
          <div>
            <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Mejorá tu apuesta</div>
            <div style={{color:Q.muted,fontSize:12,marginBottom:14,lineHeight:1.4}}>
              Subí la captura de una apuesta de otro sitio. La leemos y la
              replicamos con nuestras cuotas.
            </div>
            {!imgMejora&&(
              <div style={{display:"flex",gap:10}}>
                <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:14,
                  padding:"28px 12px",textAlign:"center",cursor:"pointer"}}>
                  <input type="file" accept="image/*" capture="environment"
                    onChange={elegirImg} style={{display:"none"}}/>
                  <div style={{fontSize:30,marginBottom:6}}>📸</div>
                  <div style={{fontWeight:700,fontSize:12}}>Sacar foto</div>
                </label>
                <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:14,
                  padding:"28px 12px",textAlign:"center",cursor:"pointer"}}>
                  <input type="file" accept="image/*" onChange={elegirImg}
                    style={{display:"none"}}/>
                  <div style={{fontSize:30,marginBottom:6}}>🖼️</div>
                  <div style={{fontWeight:700,fontSize:12}}>Galería</div>
                </label>
              </div>
            )}
            {imgMejora&&(
              <div>
                <img src={imgMejora.preview} alt="captura" style={{width:"100%",
                  borderRadius:12,marginBottom:10,maxHeight:220,objectFit:"contain",
                  background:"#000"}}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setImgMejora(null);setResMejora(null);}}
                    disabled={analizando} style={{flex:1,background:"transparent",
                    border:`1px solid ${Q.border}`,borderRadius:12,padding:"13px",
                    cursor:"pointer",color:Q.muted,fontSize:14}}>Cambiar</button>
                  <button onClick={analizarImg} disabled={analizando} style={{flex:2,
                    background:analizando?"rgba(255,255,255,0.06)":`linear-gradient(135deg,${Q.cyan},${Q.violet})`,
                    border:"none",borderRadius:12,padding:"13px",
                    cursor:analizando?"wait":"pointer",color:analizando?Q.muted:"#fff",
                    fontWeight:700,fontSize:14}}>
                    {analizando?"Leyendo...":"🔍 Analizar"}</button>
                </div>
              </div>
            )}
            {errMejora&&<div style={{color:Q.pink,fontSize:13,marginTop:10}}>{errMejora}</div>}
            {analizando&&<div style={{color:Q.violet2,fontSize:13,textAlign:"center",
              padding:16}}>La IA está leyendo tu apuesta...</div>}
            {resMejora&&(
              <div style={{marginTop:14}}>
                <div style={{color:Q.muted,fontSize:12,marginBottom:10}}>
                  Leímos {resMejora.picks_total} · podemos tomar {resMejora.picks_ok}
                </div>
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

        {/* Buscador */}
        {deportes&&deportes.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:10,
            background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
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
              background:!liga?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
              border:`1px solid ${!liga?Q.cyan:Q.border}`,borderRadius:20,
              padding:"8px 16px",cursor:"pointer",color:!liga?Q.cyan:Q.muted,
              fontSize:13,fontWeight:!liga?700:400,whiteSpace:"nowrap",flexShrink:0}}>
              Todas</button>
            {deportes.map(d=>(
              <button key={d.name} onClick={()=>setLiga(d.name)} style={{
                background:liga===d.name?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
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
                        background:sel?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
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
                  background:monto===v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
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
                background:enviando?"rgba(255,255,255,0.06)":`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
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
