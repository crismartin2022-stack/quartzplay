// ═══════════════════════════════════════════════════════════════
// ARCHIVO DESTINO: frontend/src/Admin.jsx
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";

const Q = {
  void:"#020208", deep:"#060612",
  glass:"linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))",
  violet:"#7C3AED", violet2:"#9F5FFF",
  cyan:"#00F0FF", green:"#00FF88",
  pink:"#FF0080", amber:"#FFB800",
  gold:"#E8C547", red:"#FF1744",
  teal:"#00BCD4",
  text:"#F0F0FF", muted:"#6B7090", dim:"#2A2A4A",
  border:"rgba(124,58,237,0.25)",
};

const ars  = n => "$" + Math.round(n||0).toLocaleString("es-AR");
const API  = "https://amusing-vision-production.up.railway.app";

// La clave viaja en un header, nunca se compara en el cliente.
const adminHeaders = (key) => key ? {"X-Admin-Key": key} : {};

// ── COMPONENTS ────────────────────────────────────────────────
function GCard({ children, style={}, glow, onClick }){
  return(
    <div onClick={onClick} style={{
      background:Q.glass, backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
      border:`1px solid ${glow?glow+"44":Q.border}`,
      borderRadius:16,
      boxShadow:`0 8px 32px rgba(0,0,0,0.5)${glow?`, 0 0 24px ${glow}22`:""}`,
      position:"relative", overflow:"hidden",
      cursor:onClick?"pointer":"default", ...style,
    }}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:1,
        background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)",
        pointerEvents:"none"}}/>
      {children}
    </div>
  );
}

function QPLogo({ size=20 }){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <svg width={size} height={size} viewBox="0 0 24 24">
        <defs>
          <linearGradient id="qgla" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={Q.violet}/>
            <stop offset="100%" stopColor={Q.cyan}/>
          </linearGradient>
        </defs>
        <polygon points="12,2 20,8 20,16 12,22 4,16 4,8" fill="none" stroke="url(#qgla)" strokeWidth={1.5}/>
        <polygon points="12,5 18,9.5 18,15 12,19 6,15 6,9.5" fill="url(#qgla)" opacity={0.3}/>
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

function Btn({ label, onClick, color=Q.violet, outline=false, size="md", full=false, disabled=false, icon }){
  const h=size==="lg"?"48px":size==="sm"?"32px":"42px";
  const fs=size==="lg"?14:size==="sm"?10:12;
  return(
    <button onClick={onClick} disabled={disabled} style={{
      height:h, width:full?"100%":"auto",
      padding:`0 ${size==="sm"?"10px":"16px"}`,
      background:disabled?"rgba(255,255,255,0.04)":outline?"transparent":`linear-gradient(135deg,${color},${color}CC)`,
      border:`1px solid ${disabled?Q.dim:color}`, borderRadius:10,
      color:disabled?Q.muted:outline?color:"#fff",
      fontSize:fs, fontWeight:700, cursor:disabled?"not-allowed":"pointer",
      display:"flex", alignItems:"center", justifyContent:"center", gap:6,
      fontFamily:"'Space Grotesk',system-ui", textTransform:"uppercase",
      boxShadow:(!outline&&!disabled)?`0 4px 14px ${color}33`:"none",
    }}>
      {icon&&<span style={{fontSize:fs+2}}>{icon}</span>}{label}
    </button>
  );
}

function KPI({ label, value, sub, color=Q.violet, icon, trend }){
  return(
    <GCard glow={color} style={{padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
        {icon&&<span style={{fontSize:16}}>{icon}</span>}
        <span style={{color:Q.muted,fontSize:8,fontWeight:600,letterSpacing:1,
          textTransform:"uppercase",fontFamily:"'Space Grotesk',system-ui"}}>{label}</span>
      </div>
      <div style={{color,fontWeight:900,fontSize:16,fontFamily:"'Space Grotesk',system-ui",
        textShadow:`0 0 10px ${color}55`}}>{value}</div>
      {sub&&<div style={{color:Q.dim,fontSize:9,marginTop:3,fontFamily:"'Space Grotesk',system-ui"}}>{sub}</div>}
      {trend&&<div style={{color:trend>0?Q.green:Q.red,fontSize:9,marginTop:3,
        fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
        {trend>0?"▲":"▼"} {Math.abs(trend)}% vs ayer
      </div>}
    </GCard>
  );
}

function Input({ label, value, onChange, type="text", placeholder="" }){
  return(
    <div style={{marginBottom:12}}>
      {label&&<div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
        letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:5}}>{label}</div>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px 14px",
          color:Q.text,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}/>
    </div>
  );
}

// Datos de ejemplo — todavía sin endpoint real detrás
const MOCK = {
  stats:{
    users:3841, active:1247, pro:683, newToday:47,
    depHoy:4820000, retHoy:1240000,
    netwinHoy:241000, netwin30d:7240000,
    apuestasActivas:247,
  },
  depositos:[
    {id:142,username:"martin_ar",amount:50000,method:"MercadoPago",created_at:"14:23"},
    {id:143,username:"carlos_bet",amount:20000,method:"USDT",created_at:"14:45"},
    {id:144,username:"pablo_slots",amount:80000,method:"CVU",created_at:"15:01"},
  ],
  retiros:[
    {id:87,username:"lucia_slots",amount:80000,method:"CVU",created_at:"13:00"},
    {id:88,username:"champion_ar",amount:200000,method:"USDT",created_at:"14:10"},
  ],
  topUsers:[
    {username:"champion_ar",ggr:60500,plan:"VIP",level:18},
    {username:"apostador99",ggr:40500,plan:"Pro",level:14},
    {username:"porteno_bets",ggr:33000,plan:"Pro",level:12},
    {username:"bet_king_ar",ggr:26700,plan:"Pro",level:11},
    {username:"suerte_total",ggr:18800,plan:"Basic",level:8},
  ],
  influencers:[
    {influencer_code:"messi10",clics:147,registros:38,apuestas:22,volumen:440000},
    {influencer_code:"toro23",clics:89,registros:21,apuestas:14,volumen:280000},
  ],
};

// Aviso reutilizable para las secciones que todavía no persisten
function AvisoMock(){
  return(
    <div style={{background:`${Q.amber}12`,border:`1px solid ${Q.amber}55`,
      borderRadius:10,padding:"8px 12px",marginBottom:12,
      color:Q.amber,fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
      Datos de ejemplo — esta sección todavía no está conectada a la base.
    </div>
  );
}

// ── LOGIN ──────────────────────────────────────────────────────
function AdminLogin({ onLogin }){
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  // La clave se valida contra el servidor, no en el navegador.
  const login=async()=>{
    if(loading) return;
    setErr(""); setLoading(true);
    let r;
    try {
      r = await fetch(`${API}/api/agencias`, { headers: adminHeaders(pass) });
    } catch(e){
      setErr("Sin conexión con el servidor");
      setLoading(false);
      return;
    }
    setLoading(false);
    if(r.status===401){ setErr("Contraseña incorrecta"); return; }
    if(r.status===503){ setErr("ADMIN_API_KEY no está configurada en el servidor"); return; }
    if(!r.ok){ setErr(`Error del servidor (${r.status})`); return; }
    onLogin(pass);
  };

  return(
    <div style={{background:Q.void,minHeight:"100vh",display:"flex",
      alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{width:"100%",maxWidth:360,position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <QPLogo size={26}/>
          <div style={{color:Q.muted,fontSize:12,marginTop:8,
            fontFamily:"'Space Grotesk',system-ui"}}>Panel Administrador</div>
        </div>
        <GCard glow={Q.violet} style={{padding:28}}>
          <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
            letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>
            Clave admin
          </div>
          <input type="password" value={pass}
            onChange={e=>setPass(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&login()}
            placeholder="••••••••"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:10,padding:"12px 14px",
              color:Q.text,fontSize:16,marginBottom:14,
              fontFamily:"'Space Grotesk',system-ui"}}/>
          {err&&<div style={{color:Q.red,fontSize:12,marginBottom:10}}>{err}</div>}
          <Btn label={loading?"VERIFICANDO...":"INGRESAR"} onClick={login}
            color={Q.violet} size="lg" full disabled={loading||!pass}/>
        </GCard>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// TAB GLOBAL \u2014 vista real de todo el sistema
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
function TabGlobal({ adminKey, onNoAutorizado }){
  const [r,setR]=useState(null);
  const [ags,setAgs]=useState([]);
  const [movs,setMovs]=useState([]);
  const [err,setErr]=useState("");

  useEffect(()=>{ (async()=>{
    try{
      const [rr,ra,rm]=await Promise.all([
        fetch(`${API}/api/admin/resumen`,{headers:adminHeaders(adminKey)}),
        fetch(`${API}/api/admin/agencias-detalle`,{headers:adminHeaders(adminKey)}),
        fetch(`${API}/api/admin/movimientos?limite=20`,{headers:adminHeaders(adminKey)}),
      ]);
      if(rr.status===401){ onNoAutorizado(); return; }
      if(rr.ok) setR(await rr.json());
      if(ra.ok) setAgs((await ra.json()).agencias||[]);
      if(rm.ok) setMovs((await rm.json()).movimientos||[]);
    }catch(e){ setErr("Sin conexi\u00f3n con el servidor"); }
  })(); // eslint-disable-next-line
  },[]);

  const tipoTxt={carga:"Carga",retiro:"Retiro",pago_premio:"Premio",ajuste:"Ajuste"};
  const tipoColor={carga:Q.green,retiro:Q.amber,pago_premio:Q.violet2,ajuste:Q.muted};

  if(err) return <div style={{color:Q.red,padding:20,textAlign:"center",
    fontFamily:"'Space Grotesk',system-ui"}}>{err}</div>;
  if(!r) return <div style={{color:Q.muted,padding:20,textAlign:"center",
    fontFamily:"'Space Grotesk',system-ui"}}>Cargando datos reales...</div>;

  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <KPI label="Agencias" value={r.agencias} color={Q.cyan} icon="\ud83c\udfea"/>
        <KPI label="Usuarios" value={r.usuarios} color={Q.violet} icon="\ud83d\udc65"/>
        <KPI label="Tickets hoy" value={r.tickets_hoy} color={Q.amber} icon="\ud83c\udfab"/>
        <KPI label="Cobrado hoy" value={ars(r.cobrado_hoy)} color={Q.green} icon="\ud83d\udcb0"/>
      </div>

      <GCard glow={Q.green} style={{padding:16,marginBottom:12,
        background:`linear-gradient(135deg,${Q.green}10,${Q.violet}06)`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{color:Q.muted,fontSize:12,
            fontFamily:"'Space Grotesk',system-ui"}}>Neto en caja hoy</span>
          <span style={{color:Q.green,fontWeight:900,fontSize:20,
            fontFamily:"'Space Grotesk',system-ui"}}>{ars(r.neto_hoy)}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{color:Q.muted,fontSize:11}}>Premios pagados hoy</span>
          <span style={{color:Q.pink,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>{ars(r.premios_hoy)}</span>
        </div>
      </GCard>

      {(r.boletos_pendientes>0||r.sin_liquidar>0)&&(
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {r.boletos_pendientes>0&&<GCard style={{padding:12,flex:1,textAlign:"center"}}>
            <div style={{color:Q.amber,fontWeight:700,fontSize:18,
              fontFamily:"'Space Grotesk',system-ui"}}>{r.boletos_pendientes}</div>
            <div style={{color:Q.muted,fontSize:10}}>boletos sin cobrar</div>
          </GCard>}
          {r.sin_liquidar>0&&<GCard style={{padding:12,flex:1,textAlign:"center"}}>
            <div style={{color:Q.cyan,fontWeight:700,fontSize:18,
              fontFamily:"'Space Grotesk',system-ui"}}>{r.sin_liquidar}</div>
            <div style={{color:Q.muted,fontSize:10}}>sin liquidar</div>
          </GCard>}
        </div>
      )}

      <GCard style={{padding:16,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>\ud83c\udfea Agencias hoy</div>
        {ags.length===0&&<div style={{color:Q.muted,fontSize:12,
          fontFamily:"'Space Grotesk',system-ui"}}>Sin agencias</div>}
        {ags.map((a,i)=>(
          <div key={a.code} style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",padding:"8px 0",
            borderBottom:i<ags.length-1?`1px solid ${Q.dim}`:"none"}}>
            <div>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:"'Space Grotesk',system-ui"}}>{a.name}</div>
              <div style={{color:Q.muted,fontSize:10}}>{a.code} \u00b7 {a.tickets_hoy} tickets hoy</div>
            </div>
            <div style={{color:Q.green,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(a.cobrado_hoy)}</div>
          </div>
        ))}
      </GCard>

      <GCard style={{padding:16}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>\ud83d\udcb8 \u00daltimos movimientos</div>
        {movs.length===0&&<div style={{color:Q.muted,fontSize:12,
          fontFamily:"'Space Grotesk',system-ui"}}>Sin movimientos</div>}
        {movs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",padding:"7px 0",
            borderBottom:i<movs.length-1?`1px solid ${Q.dim}`:"none"}}>
            <div style={{minWidth:0,flex:1}}>
              <span style={{color:tipoColor[m.tipo]||Q.text,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>{tipoTxt[m.tipo]||m.tipo}</span>
              <span style={{color:Q.muted,fontSize:11}}> \u00b7 {m.agencia} \u00b7 {m.usuario}</span>
              <div style={{color:Q.dim,fontSize:10}}>{m.fecha}</div>
            </div>
            <div style={{color:m.tipo==="retiro"||m.tipo==="pago_premio"?Q.amber:Q.green,
              fontWeight:700,fontSize:13,flexShrink:0,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(m.monto)}</div>
          </div>
        ))}
      </GCard>
    </div>
  );
}

function TabCombos({ adminKey, onNoAutorizado }){
  const [modo,setModo]=useState("lista");   // lista | crear | escanear
  const [combos,setCombos]=useState(null);

  const cargar=async()=>{
    try{
      const r=await fetch(`${API}/api/admin/combos`,{headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setCombos((await r.json()).combos||[]);
    }catch(e){ setCombos([]); }
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[]);

  const borrar=async(id)=>{
    try{
      await fetch(`${API}/api/admin/combos/${id}`,
        {method:"DELETE",headers:adminHeaders(adminKey)});
      cargar();
    }catch(e){}
  };

  if(modo==="crear") return <CrearComboAdmin adminKey={adminKey}
    onNoAutorizado={onNoAutorizado} onListo={()=>{setModo("lista");cargar();}}
    onVolver={()=>setModo("lista")}/>;
  if(modo==="escanear") return <EscanearComboAdmin adminKey={adminKey}
    onNoAutorizado={onNoAutorizado} onListo={()=>{setModo("lista");cargar();}}
    onVolver={()=>setModo("lista")}/>;

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <Btn label="+ Crear combo" onClick={()=>setModo("crear")} color={Q.violet} full/>
        <Btn label="\ud83d\udcf8 Escanear" onClick={()=>setModo("escanear")} color={Q.cyan} full/>
      </div>

      {combos===null&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {combos&&combos.length===0&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{fontSize:26,marginBottom:8}}>\u26a1</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>No hay combos cargados</div>
        </GCard>
      )}
      {(combos||[]).map(c=>(
        <GCard key={c.id} style={{padding:"12px 14px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"flex-start",gap:8,marginBottom:6}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{color:Q.text,fontWeight:600,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre}</div>
              <div style={{color:Q.muted,fontSize:11}}>
                {c.picks.length} picks \u00b7 {fmt(c.odd_total)}x \u00b7
                {c.origen==="admin"?" Casa":" "+c.creado_por}</div>
            </div>
            <button onClick={()=>borrar(c.id)} style={{background:`${Q.red}18`,
              border:`1px solid ${Q.red}`,borderRadius:8,padding:"5px 10px",
              cursor:"pointer",color:Q.red,fontSize:11,fontWeight:700,flexShrink:0,
              fontFamily:"'Space Grotesk',system-ui"}}>Borrar</button>
          </div>
          {c.origen==="admin"&&(
            <div style={{color:Q.dim,fontSize:10,
              fontFamily:"'Space Grotesk',system-ui"}}>
              Agencias: {c.agencias}</div>
          )}
        </GCard>
      ))}
    </div>
  );
}

function CrearComboAdmin({ adminKey, onListo, onVolver, onNoAutorizado }){
  const [deportes,setDeportes]=useState(null);
  const [nombre,setNombre]=useState("");
  const [picks,setPicks]=useState([]);
  const [busqueda,setBusqueda]=useState("");
  const [destBox,setDestBox]=useState(true);
  const [destApp,setDestApp]=useState(false);
  const [destAg,setDestAg]=useState(false);
  const [agencias,setAgencias]=useState("");   // vac\u00edo = todas
  const [guardando,setGuardando]=useState(false);
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    fetch(`${API}/api/live/prematch`).then(r=>r.ok?r.json():null)
      .then(d=>setDeportes(d?.sports||[])).catch(()=>setDeportes([]));
  },[]);

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
      const r=await fetch(`${API}/api/admin/combos`,{
        method:"POST",
        headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({
          nombre:nombre||"Combo de la casa",
          picks:picks.map(p=>({home:p.home,away:p.away,sel:p.sel,odd:p.odd,
            sport:p.sport,event_id:p.event_id,sport_key:p.sport_key})),
          destino_box:destBox, destino_app:destApp, destino_agencia:destAg,
          agencias: agencias.trim()?agencias.split(",").map(x=>x.trim()):null,
        }),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("\u2705 Combo publicado");
      setTimeout(onListo, 800);
    }catch(e){ setMsg("\u26a0\ufe0f "+e.message); }
    setGuardando(false);
  };

  const filtrados=(deportes||[])
    .map(d=>({...d,events:(d.events||[]).filter(ev=>{
      const q=busqueda.trim().toLowerCase();
      return !q||`${ev.h} ${ev.a}`.toLowerCase().includes(q);
    })})).filter(d=>d.events.length>0);

  return(
    <div>
      <button onClick={onVolver} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:22,cursor:"pointer",marginBottom:6,padding:0}}>\u2039 Volver</button>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>Crear combo de la casa</div>

      <input value={nombre} onChange={e=>setNombre(e.target.value)}
        placeholder="Nombre del combo"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px 14px",
          color:Q.text,fontSize:16,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}/>

      <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,
        marginBottom:6,fontFamily:"'Space Grotesk',system-ui"}}>D\u00f3nde se muestra</div>
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        {[["Box",destBox,setDestBox],["App",destApp,setDestApp],
          ["Agencias",destAg,setDestAg]].map(([l,v,sv])=>(
          <button key={l} onClick={()=>sv(!v)} style={{flex:1,
            background:v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1.5px solid ${v?Q.violet:Q.border}`,borderRadius:10,
            padding:"10px",cursor:"pointer",color:v?Q.cyan:Q.muted,
            fontSize:12,fontWeight:v?700:400,
            fontFamily:"'Space Grotesk',system-ui"}}>{v?"\u2713 ":""}{l}</button>
        ))}
      </div>
      <input value={agencias} onChange={e=>setAgencias(e.target.value)}
        placeholder="Agencias (AGE001,AGE002) o vac\u00edo = todas"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 12px",
          color:Q.text,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}/>

      <div style={{display:"flex",alignItems:"center",gap:8,
        background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
        borderRadius:10,padding:"8px 12px",marginBottom:10}}>
        <span>\ud83d\udd0d</span>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          placeholder="Buscar equipo..."
          style={{background:"transparent",border:"none",color:Q.text,fontSize:14,
            flex:1,minWidth:0,fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>

      {!deportes&&<div style={{color:Q.muted,textAlign:"center",padding:16,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}

      <div style={{maxHeight:"36vh",overflowY:"auto",marginBottom:12}}>
        {filtrados.map(d=>(
          <div key={d.name} style={{marginBottom:10}}>
            <div style={{color:Q.violet2,fontSize:12,fontWeight:700,marginBottom:5,
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
        color:msg.startsWith("\u2705")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}

      {picks.length>0&&(
        <GCard glow={Q.violet} style={{padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{color:Q.muted,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>{picks.length} picks</span>
            <span style={{color:Q.gold,fontWeight:900,fontSize:18,
              fontFamily:"'Space Grotesk',system-ui"}}>{fmt(totOdd)}x</span>
          </div>
          <Btn label={guardando?"PUBLICANDO...":"Publicar combo"} onClick={guardar}
            color={Q.violet} full size="lg" disabled={guardando}/>
        </GCard>
      )}
    </div>
  );
}

function EscanearComboAdmin({ adminKey, onListo, onVolver, onNoAutorizado }){
  const [img,setImg]=useState(null);
  const [analizando,setAnalizando]=useState(false);
  const [res,setRes]=useState(null);
  const [usarAjustada,setUsarAjustada]=useState(true);   // true=nuestra, false=original
  const [nombre,setNombre]=useState("");
  const [destBox,setDestBox]=useState(true);
  const [destApp,setDestApp]=useState(false);
  const [destAg,setDestAg]=useState(false);
  const [msg,setMsg]=useState("");
  const [pub,setPub]=useState(false);

  const elegir=(e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    if(f.size>8*1024*1024){ setMsg("Imagen muy grande"); return; }
    const rd=new FileReader();
    rd.onload=()=>setImg({b64:rd.result.split(",")[1],tipo:f.type,preview:rd.result});
    rd.readAsDataURL(f);
  };
  const analizar=async()=>{
    if(!img||analizando) return;
    setAnalizando(true); setMsg(""); setRes(null);
    try{
      const r=await fetch(`${API}/api/admin/escanear-combo`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({imagen:img.b64,media_type:img.tipo}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      const d=await r.json();
      if(!d.ok) setMsg(d.mensaje||"No se pudo leer");
      else setRes(d);
    }catch(e){ setMsg("Error al analizar"); }
    setAnalizando(false);
  };
  const publicar=async()=>{
    if(!res||pub) return;
    const validos=res.picks.filter(p=>p.odd_nuestra);
    if(!validos.length){ setMsg("No hay picks que podamos tomar"); return; }
    setPub(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/admin/combos`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({
          nombre:nombre||"Combo escaneado",
          fuente:"escaneo",
          picks:validos.map(p=>({home:p.home,away:p.away,sel:p.selection,
            odd: usarAjustada? p.odd_ajustada : (p.odd_original||p.odd_ajustada),
            sport:p.market,event_id:p.event_id,sport_key:p.sport_key})),
          destino_box:destBox, destino_app:destApp, destino_agencia:destAg,
        }),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("\u2705 Combo publicado");
      setTimeout(onListo, 800);
    }catch(e){ setMsg("\u26a0\ufe0f "+e.message); }
    setPub(false);
  };

  return(
    <div>
      <button onClick={onVolver} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:22,cursor:"pointer",marginBottom:6,padding:0}}>\u2039 Volver</button>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>Escanear y publicar</div>

      {!img&&(
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:12,
            padding:"26px 10px",textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" capture="environment"
              onChange={elegir} style={{display:"none"}}/>
            <div style={{fontSize:28,marginBottom:5}}>\ud83d\udcf8</div>
            <div style={{fontWeight:700,fontSize:12,color:Q.text,
              fontFamily:"'Space Grotesk',system-ui"}}>C\u00e1mara</div>
          </label>
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:12,
            padding:"26px 10px",textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" onChange={elegir} style={{display:"none"}}/>
            <div style={{fontSize:28,marginBottom:5}}>\ud83d\uddbc\ufe0f</div>
            <div style={{fontWeight:700,fontSize:12,color:Q.text,
              fontFamily:"'Space Grotesk',system-ui"}}>Archivo</div>
          </label>
        </div>
      )}

      {img&&!res&&(
        <div style={{marginBottom:12}}>
          <img src={img.preview} alt="captura" style={{width:"100%",borderRadius:12,
            marginBottom:10,maxHeight:200,objectFit:"contain",background:"#000"}}/>
          <div style={{display:"flex",gap:8}}>
            <Btn label="Cambiar" onClick={()=>{setImg(null);setRes(null);}}
              outline color={Q.muted} full disabled={analizando}/>
            <Btn label={analizando?"LEYENDO...":"\ud83d\udd0d Analizar"} onClick={analizar}
              color={Q.cyan} full disabled={analizando}/>
          </div>
        </div>
      )}

      {msg&&<div style={{fontSize:12,marginBottom:10,
        color:msg.startsWith("\u2705")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}

      {res&&(
        <div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:10,
            fontFamily:"'Space Grotesk',system-ui"}}>
            Le\u00edmos {res.picks_total} \u00b7 tomamos {res.picks_ok}</div>

          {res.picks.map((p,i)=>(
            <GCard key={i} style={{padding:"10px 12px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:"'Space Grotesk',system-ui"}}>{p.home} vs {p.away}</div>
              <div style={{color:Q.muted,fontSize:11,marginBottom:4}}>{p.selection}</div>
              <div style={{display:"flex",gap:12,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {p.odd_original&&<span style={{color:Q.dim}}>Origen {fmt(p.odd_original)}</span>}
                {p.odd_nuestra?(
                  <span style={{color:Q.green}}>Nuestra {fmt(p.odd_nuestra)}
                    {p.odd_ajustada!==p.odd_nuestra?` \u2192 ${fmt(p.odd_ajustada)}`:""}</span>
                ):<span style={{color:Q.red}}>No disponible</span>}
              </div>
            </GCard>
          ))}

          {res.picks_ok>0&&(
            <GCard glow={Q.violet} style={{padding:14,marginTop:8}}>
              <input value={nombre} onChange={e=>setNombre(e.target.value)}
                placeholder="Nombre del combo"
                style={{width:"100%",background:"rgba(255,255,255,0.05)",
                  border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
                  color:Q.text,fontSize:16,marginBottom:10,
                  fontFamily:"'Space Grotesk',system-ui"}}/>

              <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
                letterSpacing:1,marginBottom:5,
                fontFamily:"'Space Grotesk',system-ui"}}>Qu\u00e9 cuota usar</div>
              <div style={{display:"flex",gap:6,marginBottom:10}}>
                <button onClick={()=>setUsarAjustada(true)} style={{flex:1,
                  background:usarAjustada?`${Q.green}22`:"rgba(255,255,255,0.04)",
                  border:`1.5px solid ${usarAjustada?Q.green:Q.border}`,borderRadius:9,
                  padding:"9px",cursor:"pointer",color:usarAjustada?Q.green:Q.muted,
                  fontSize:11,fontWeight:700,
                  fontFamily:"'Space Grotesk',system-ui"}}>Nuestra (ajustada)</button>
                <button onClick={()=>setUsarAjustada(false)} style={{flex:1,
                  background:!usarAjustada?`${Q.amber}22`:"rgba(255,255,255,0.04)",
                  border:`1.5px solid ${!usarAjustada?Q.amber:Q.border}`,borderRadius:9,
                  padding:"9px",cursor:"pointer",color:!usarAjustada?Q.amber:Q.muted,
                  fontSize:11,fontWeight:700,
                  fontFamily:"'Space Grotesk',system-ui"}}>Original</button>
              </div>

              <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
                letterSpacing:1,marginBottom:5,
                fontFamily:"'Space Grotesk',system-ui"}}>D\u00f3nde publicar</div>
              <div style={{display:"flex",gap:6,marginBottom:12}}>
                {[["Box",destBox,setDestBox],["App",destApp,setDestApp],
                  ["Agencias",destAg,setDestAg]].map(([l,v,sv])=>(
                  <button key={l} onClick={()=>sv(!v)} style={{flex:1,
                    background:v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                    border:`1.5px solid ${v?Q.violet:Q.border}`,borderRadius:9,
                    padding:"9px",cursor:"pointer",color:v?Q.cyan:Q.muted,
                    fontSize:11,fontWeight:v?700:400,
                    fontFamily:"'Space Grotesk',system-ui"}}>{v?"\u2713 ":""}{l}</button>
                ))}
              </div>

              <Btn label={pub?"PUBLICANDO...":"Publicar combo"} onClick={publicar}
                color={Q.violet} full size="lg" disabled={pub}/>
            </GCard>
          )}
        </div>
      )}
    </div>
  );
}

// TAB DASHBOARD
// ═══════════════════════════════════════════════════════════════
function TabDash(){
  const s=MOCK.stats;
  return(
    <div>
      <AvisoMock/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <KPI label="Usuarios"      value={s.users.toLocaleString()} sub={`+${s.newToday} hoy`} color={Q.cyan}   icon="👥" trend={3.2}/>
        <KPI label="GGR hoy"       value={ars(s.netwinHoy)}                                     color={Q.green}  icon="📈" trend={4.1}/>
        <KPI label="Depósitos hoy" value={ars(s.depHoy)}                                        color={Q.violet} icon="📥" trend={12}/>
        <KPI label="Apuestas vivas"value={s.apuestasActivas.toString()}                         color={Q.amber}  icon="🎯"/>
      </div>

      <GCard glow={Q.green} style={{padding:16,marginBottom:12,
        background:`linear-gradient(135deg,${Q.green}10,${Q.violet}06)`}}>
        <div style={{color:Q.muted,fontSize:9,letterSpacing:2,textTransform:"uppercase",
          fontFamily:"'Space Grotesk',system-ui",marginBottom:3}}>NET WIN 30 DÍAS</div>
        <div style={{color:Q.green,fontWeight:900,fontSize:26,
          fontFamily:"'Space Grotesk',system-ui",textShadow:`0 0 14px ${Q.green}66`}}>
          {ars(s.netwin30d)}
        </div>
      </GCard>

      <GCard glow={Q.gold} style={{padding:16,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>🏆 Top usuarios por GGR</div>
        {MOCK.topUsers.map((u,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,
            padding:"7px 0",borderBottom:i<4?`1px solid ${Q.dim}`:"none"}}>
            <span style={{color:Q.dim,fontWeight:700,fontSize:12,width:16,
              fontFamily:"'Space Grotesk',system-ui"}}>{i+1}</span>
            <div style={{flex:1}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:"'Space Grotesk',system-ui"}}>@{u.username}</div>
              <div style={{display:"flex",gap:4,marginTop:2}}>
                <HBadge label={u.plan} color={Q.violet}/>
                <HBadge label={`LV ${u.level}`} color={Q.cyan}/>
              </div>
            </div>
            <div style={{color:Q.gold,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(u.ggr)}</div>
          </div>
        ))}
      </GCard>

      <GCard style={{padding:16}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>📊 Influencers</div>
        {MOCK.influencers.map((inf,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",
            padding:"7px 0",borderBottom:i<MOCK.influencers.length-1?`1px solid ${Q.dim}`:"none"}}>
            <div>
              <div style={{color:Q.violet2,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>@{inf.influencer_code}</div>
              <div style={{color:Q.muted,fontSize:10}}>
                {inf.clics} clics · {inf.registros} registros · {inf.apuestas} apuestas
              </div>
            </div>
            <div style={{color:Q.gold,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(inf.volumen)}</div>
          </div>
        ))}
      </GCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB AGENCIAS — datos reales
// ═══════════════════════════════════════════════════════════════
function TabAgencias({ adminKey, onNoAutorizado }){
  const [agencias,setAgencias]=useState([]);
  const [loading,setLoading]=useState(false);
  const [form,setForm]=useState({name:"",username:"",password:"",address:"",phone:""});
  const [showForm,setShowForm]=useState(false);
  const [msg,setMsg]=useState("");
  const [selAgencia,setSelAgencia]=useState(null);
  const [editForm,setEditForm]=useState({});

  const loadAgencias=async()=>{
    setLoading(true); setMsg("");
    try {
      const r=await fetch(`${API}/api/agencias`,{ headers: adminHeaders(adminKey) });
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setAgencias(await r.json());
      else setMsg(`❌ Error ${r.status} al cargar agencias`);
    } catch(e){
      setMsg("❌ Sin conexión con el servidor");
    }
    setLoading(false);
  };

  useEffect(()=>{ loadAgencias(); // eslint-disable-next-line
  },[]);

  const crearAgencia=async()=>{
    if(!form.name||!form.username||!form.password){
      setMsg("Completá nombre, usuario y clave"); return;
    }
    try {
      const r=await fetch(`${API}/api/agencias`,{
        method:"POST",
        headers:{"Content-Type":"application/json", ...adminHeaders(adminKey)},
        body:JSON.stringify(form),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok){
        const data=await r.json();
        setMsg(`✅ Agencia creada: ${data.code}`);
        setForm({name:"",username:"",password:"",address:"",phone:""});
        setShowForm(false);
        loadAgencias();
      } else {
        const e=await r.json().catch(()=>({}));
        setMsg(`❌ ${e.detail||`Error ${r.status}`}`);
      }
    } catch(e){
      setMsg("❌ Sin conexión — la agencia NO se creó");
    }
  };

  const toggleStatus=async(ag)=>{
    const newStatus=ag.status==="active"?"suspended":"active";
    try {
      const r=await fetch(`${API}/api/agencias/${ag.code}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json", ...adminHeaders(adminKey)},
        body:JSON.stringify({status:newStatus}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ setMsg(`❌ No se pudo cambiar el estado (${r.status})`); return; }
    } catch(e){
      setMsg("❌ Sin conexión — el estado NO cambió");
      return;
    }
    setAgencias(a=>a.map(x=>x.code===ag.code?{...x,status:newStatus}:x));
    if(selAgencia?.code===ag.code) setSelAgencia(s=>({...s,status:newStatus}));
    setMsg("✅ Estado actualizado");
  };

  const guardarEdit=async()=>{
    try {
      const r=await fetch(`${API}/api/agencias/${selAgencia.code}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json", ...adminHeaders(adminKey)},
        body:JSON.stringify(editForm),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ setMsg(`❌ No se pudo guardar (${r.status})`); return; }
    } catch(e){
      setMsg("❌ Sin conexión — los cambios NO se guardaron");
      return;
    }
    setAgencias(a=>a.map(x=>x.code===selAgencia.code?{...x,...editForm}:x));
    setSelAgencia(s=>({...s,...editForm}));
    setEditForm({});
    setMsg("✅ Agencia actualizada");
  };

  if(selAgencia) return(
    <div>
      <button onClick={()=>{setSelAgencia(null);setMsg("");}} style={{
        background:"transparent",border:"none",color:Q.muted,
        fontSize:22,cursor:"pointer",marginBottom:10,padding:0}}>‹ Volver</button>

      <GCard glow={Q.violet} style={{padding:18,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{color:Q.text,fontWeight:700,fontSize:18,
              fontFamily:"'Space Grotesk',system-ui"}}>{selAgencia.name}</div>
            <div style={{color:Q.muted,fontSize:12}}>{selAgencia.code}</div>
          </div>
          <HBadge label={selAgencia.status==="active"?"ACTIVA":"SUSPENDIDA"}
            color={selAgencia.status==="active"?Q.green:Q.red}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          <GCard glow={Q.cyan} style={{padding:"10px",textAlign:"center"}}>
            <div style={{color:Q.cyan,fontWeight:700,fontSize:16,
              fontFamily:"'Space Grotesk',system-ui"}}>{selAgencia.total_tickets||0}</div>
            <div style={{color:Q.muted,fontSize:9}}>Tickets</div>
          </GCard>
          <GCard glow={Q.green} style={{padding:"10px",textAlign:"center"}}>
            <div style={{color:Q.green,fontWeight:700,fontSize:14,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(selAgencia.total_cobrado||0)}</div>
            <div style={{color:Q.muted,fontSize:9}}>Total cobrado</div>
          </GCard>
        </div>

        <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,
          fontFamily:"'Space Grotesk',system-ui",marginBottom:10}}>Editar datos</div>
        <Input label="Nombre" value={editForm.name??selAgencia.name??""}
          onChange={v=>setEditForm(f=>({...f,name:v}))}/>
        <Input label="Dirección" value={editForm.address??selAgencia.address??""}
          onChange={v=>setEditForm(f=>({...f,address:v}))} placeholder="Av. Corrientes 1234"/>
        <Input label="Teléfono" value={editForm.phone??selAgencia.phone??""}
          onChange={v=>setEditForm(f=>({...f,phone:v}))} placeholder="+54 11 ..."/>
        <Input label="Nueva clave (opcional)" value={editForm.password||""}
          onChange={v=>setEditForm(f=>({...f,password:v}))} type="password"
          placeholder="Dejar vacío para no cambiar"/>

        {msg&&<div style={{color:msg.startsWith("✅")?Q.green:Q.red,fontSize:12,marginBottom:10}}>{msg}</div>}

        <div style={{display:"flex",gap:8,marginTop:4}}>
          <Btn label="Guardar" onClick={guardarEdit} color={Q.violet} full/>
          <Btn label={selAgencia.status==="active"?"Suspender":"Reactivar"}
            onClick={()=>toggleStatus(selAgencia)}
            color={selAgencia.status==="active"?Q.red:Q.green}
            outline full/>
        </div>
      </GCard>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Agencias ({agencias.length})
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn label="Actualizar" onClick={loadAgencias} outline color={Q.muted} size="sm"/>
          <Btn label="+ Nueva" onClick={()=>setShowForm(s=>!s)} color={Q.violet} size="sm"/>
        </div>
      </div>

      {showForm&&(
        <GCard glow={Q.violet} style={{padding:18,marginBottom:14}}>
          <div style={{color:Q.violet2,fontWeight:700,fontSize:14,marginBottom:14,
            fontFamily:"'Space Grotesk',system-ui"}}>➕ Nueva agencia</div>
          <Input label="Nombre" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))}
            placeholder="Agencia Centro"/>
          <Input label="Usuario" value={form.username} onChange={v=>setForm(f=>({...f,username:v}))}
            placeholder="agencia4"/>
          <Input label="Contraseña" value={form.password} onChange={v=>setForm(f=>({...f,password:v}))}
            type="password" placeholder="••••••••"/>
          <Input label="Dirección (opcional)" value={form.address} onChange={v=>setForm(f=>({...f,address:v}))}
            placeholder="Av. Corrientes 1234, CABA"/>
          <Input label="Teléfono (opcional)" value={form.phone} onChange={v=>setForm(f=>({...f,phone:v}))}
            placeholder="+54 11 4567-8901"/>
          {msg&&<div style={{color:msg.startsWith("✅")?Q.green:Q.red,fontSize:12,marginBottom:10}}>{msg}</div>}
          <div style={{display:"flex",gap:8}}>
            <Btn label="Cancelar" onClick={()=>{setShowForm(false);setMsg("");}}
              outline color={Q.muted} full/>
            <Btn label="CREAR" onClick={crearAgencia} color={Q.violet} full/>
          </div>
        </GCard>
      )}

      {!showForm&&msg&&<div style={{color:msg.startsWith("✅")?Q.green:Q.red,
        fontSize:12,marginBottom:12}}>{msg}</div>}

      {loading&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}

      {agencias.map(ag=>(
        <GCard key={ag.code} glow={ag.status==="active"?Q.green:Q.red}
          style={{padding:"14px 16px",marginBottom:10,cursor:"pointer"}}
          onClick={()=>{setSelAgencia(ag);setEditForm({});setMsg("");}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:14,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ag.name}</div>
                <HBadge label={ag.status==="active"?"ACTIVA":"SUSPENDIDA"}
                  color={ag.status==="active"?Q.green:Q.red}/>
              </div>
              <div style={{color:Q.muted,fontSize:11,marginBottom:3}}>
                {ag.code} · @{ag.username}
              </div>
              {ag.address&&<div style={{color:Q.dim,fontSize:10}}>{ag.address}</div>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:Q.cyan,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{ag.total_tickets||0} tickets</div>
              <div style={{color:Q.green,fontSize:11}}>{ars(ag.total_cobrado||0)}</div>
              <span style={{color:Q.muted,fontSize:18}}>›</span>
            </div>
          </div>
        </GCard>
      ))}

      {agencias.length===0&&!loading&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{color:Q.muted,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>
            No hay agencias registradas
          </div>
          <div style={{color:Q.dim,fontSize:11,marginTop:4}}>
            Tocá "+ Nueva" para crear la primera
          </div>
        </GCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB BILLETERA
// ═══════════════════════════════════════════════════════════════
function TabBilletera(){
  const [confirmed,setConfirmed]=useState({});
  const [rejected,setRejected]=useState({});

  return(
    <div>
      <AvisoMock/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <KPI label="Depósitos hoy" value={ars(MOCK.stats.depHoy)} color={Q.green} icon="📥" trend={12}/>
        <KPI label="Retiros hoy"   value={ars(MOCK.stats.retHoy)} color={Q.amber} icon="📤"/>
      </div>

      <GCard glow={Q.green} style={{padding:16,marginBottom:12}}>
        <div style={{color:Q.green,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>
          📥 Depósitos pendientes ({MOCK.depositos.filter(d=>!confirmed[d.id]&&!rejected[d.id]).length})
        </div>
        {MOCK.depositos.map(dep=>(
          !rejected[dep.id]&&(
            <GCard key={dep.id} style={{padding:"10px 12px",marginBottom:8,
              background:confirmed[dep.id]?`${Q.green}0A`:"rgba(255,255,255,0.03)"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>@{dep.username}</div>
                  <div style={{display:"flex",gap:5,marginTop:2}}>
                    <HBadge label={dep.method} color={Q.muted}/>
                    <HBadge label={dep.created_at} color={Q.dim}/>
                  </div>
                </div>
                <div style={{color:Q.green,fontWeight:900,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(dep.amount)}</div>
              </div>
              {!confirmed[dep.id]?(
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setConfirmed(c=>({...c,[dep.id]:true}))} style={{
                    flex:1,background:`linear-gradient(135deg,${Q.green},#009624)`,
                    border:"none",borderRadius:8,padding:"9px",cursor:"pointer",
                    color:Q.void,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>✅ CONFIRMAR</button>
                  <button onClick={()=>setRejected(r=>({...r,[dep.id]:true}))} style={{
                    flex:1,background:"transparent",border:`1px solid ${Q.red}`,
                    borderRadius:8,padding:"9px",cursor:"pointer",
                    color:Q.red,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>✗ RECHAZAR</button>
                </div>
              ):(
                <div style={{textAlign:"center",color:Q.green,fontWeight:700,
                  fontSize:12,fontFamily:"'Space Grotesk',system-ui",padding:"6px"}}>
                  ✅ Confirmado
                </div>
              )}
            </GCard>
          )
        ))}
      </GCard>

      <GCard glow={Q.amber} style={{padding:16}}>
        <div style={{color:Q.amber,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>
          📤 Retiros pendientes ({MOCK.retiros.filter(r=>!confirmed["r"+r.id]&&!rejected["r"+r.id]).length})
        </div>
        {MOCK.retiros.map(ret=>(
          !rejected["r"+ret.id]&&(
            <GCard key={ret.id} style={{padding:"10px 12px",marginBottom:8,
              background:confirmed["r"+ret.id]?`${Q.green}0A`:"rgba(255,255,255,0.03)"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>@{ret.username}</div>
                  <div style={{display:"flex",gap:5,marginTop:2}}>
                    <HBadge label={ret.method} color={Q.muted}/>
                    <HBadge label={ret.created_at} color={Q.dim}/>
                  </div>
                </div>
                <div style={{color:Q.amber,fontWeight:900,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(ret.amount)}</div>
              </div>
              {!confirmed["r"+ret.id]?(
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>setConfirmed(c=>({...c,["r"+ret.id]:true}))} style={{
                    flex:1,background:`linear-gradient(135deg,${Q.amber},${Q.gold})`,
                    border:"none",borderRadius:8,padding:"9px",cursor:"pointer",
                    color:Q.void,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>✅ APROBAR</button>
                  <button onClick={()=>setRejected(r=>({...r,["r"+ret.id]:true}))} style={{
                    flex:1,background:"transparent",border:`1px solid ${Q.red}`,
                    borderRadius:8,padding:"9px",cursor:"pointer",
                    color:Q.red,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>✗ RECHAZAR</button>
                </div>
              ):(
                <div style={{textAlign:"center",color:Q.green,fontWeight:700,
                  fontSize:12,fontFamily:"'Space Grotesk',system-ui",padding:"6px"}}>
                  ✅ Aprobado
                </div>
              )}
            </GCard>
          )
        ))}
      </GCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB USUARIOS
// ═══════════════════════════════════════════════════════════════
function TabUsuarios(){
  const [query,setQuery]=useState("");
  const filtrados = MOCK.topUsers.filter(u=>
    u.username.toLowerCase().includes(query.toLowerCase()));
  return(
    <div>
      <AvisoMock/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        <KPI label="Total"   value={MOCK.stats.users.toLocaleString()} color={Q.cyan}/>
        <KPI label="Pro/VIP" value={MOCK.stats.pro}                    color={Q.violet}/>
        <KPI label="Activos" value={MOCK.stats.active}                 color={Q.green}/>
      </div>

      <GCard style={{padding:"10px 14px",marginBottom:12,
        display:"flex",alignItems:"center",gap:10}}>
        <span style={{color:Q.muted,fontSize:16}}>🔍</span>
        <input value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Buscar usuario..."
          style={{background:"transparent",border:"none",color:Q.text,
            fontSize:14,flex:1,fontFamily:"'Space Grotesk',system-ui"}}/>
      </GCard>

      <GCard glow={Q.gold} style={{padding:16}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>🏆 Top por GGR</div>
        {filtrados.map((u,i)=>(
          <div key={u.username} style={{display:"flex",alignItems:"center",gap:10,
            padding:"8px 0",borderBottom:i<filtrados.length-1?`1px solid ${Q.dim}`:"none"}}>
            <div style={{color:Q.dim,fontWeight:700,fontSize:12,width:16,
              fontFamily:"'Space Grotesk',system-ui"}}>{i+1}</div>
            <div style={{width:32,height:32,borderRadius:"50%",
              background:`linear-gradient(135deg,${Q.violet}66,${Q.cyan}44)`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:14,fontWeight:700,color:Q.text,flexShrink:0}}>
              {u.username.charAt(0).toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:"'Space Grotesk',system-ui"}}>@{u.username}</div>
              <div style={{display:"flex",gap:4,marginTop:2}}>
                <HBadge label={u.plan} color={Q.violet}/>
                <HBadge label={`LV ${u.level}`} color={Q.cyan}/>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:Q.gold,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{ars(u.ggr)}</div>
              <div style={{color:Q.muted,fontSize:9}}>GGR</div>
            </div>
          </div>
        ))}
        {filtrados.length===0&&(
          <div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:12}}>
            Sin resultados
          </div>
        )}
      </GCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB CONFIG
// ═══════════════════════════════════════════════════════════════
function TabConfig(){
  const [usdArs,setUsdArs]=useState("1430");
  const [maxBet,setMaxBet]=useState("500000");
  const [minBet,setMinBet]=useState("500");
  const [margin,setMargin]=useState("7.5");
  const [maint,setMaint]=useState(false);

  return(
    <div>
      <div style={{background:`${Q.amber}12`,border:`1px solid ${Q.amber}55`,
        borderRadius:10,padding:"10px 12px",marginBottom:14,
        color:Q.amber,fontSize:11,fontFamily:"'Space Grotesk',system-ui",lineHeight:1.5}}>
        Estos valores todavía no se guardan en ningún lado — al recargar la página
        vuelven al default. Falta el endpoint de configuración en la API.
      </div>

      <GCard glow={Q.cyan} style={{padding:18,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}>💱 Tipo de cambio</div>
        <Input label="USD/ARS" value={usdArs} onChange={setUsdArs} type="number"/>
      </GCard>

      <GCard glow={Q.violet} style={{padding:18,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}>🎯 Límites de apuesta</div>
        <Input label="Mínimo (ARS)" value={minBet} onChange={setMinBet} type="number"/>
        <Input label="Máximo (ARS)" value={maxBet} onChange={setMaxBet} type="number"/>
      </GCard>

      <GCard glow={Q.gold} style={{padding:18,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}>💰 Margen sports (%)</div>
        <Input label="Margen %" value={margin} onChange={setMargin} type="number"/>
      </GCard>

      <GCard glow={maint?Q.red:undefined} style={{padding:18,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:Q.text,fontWeight:700,fontSize:14,
              fontFamily:"'Space Grotesk',system-ui"}}>🔧 Modo mantenimiento</div>
            <div style={{color:Q.muted,fontSize:11,marginTop:2}}>
              Pausa todas las apuestas
            </div>
          </div>
          <button onClick={()=>setMaint(m=>!m)} style={{
            width:48,height:26,borderRadius:13,border:"none",cursor:"pointer",
            background:maint?Q.red:Q.dim,position:"relative",transition:"background 0.3s",
          }}>
            <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",
              position:"absolute",top:3,left:maint?24:3,transition:"left 0.3s"}}/>
          </button>
        </div>
        {maint&&<div style={{color:Q.red,fontSize:11,marginTop:8,
          fontFamily:"'Space Grotesk',system-ui"}}>⚠️ Este toggle todavía no afecta al bot</div>}
      </GCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB DIAGNÓSTICO — datos reales de la API
// ═══════════════════════════════════════════════════════════════
function TabDiag({ adminKey, onNoAutorizado }){
  const [creditos,setCreditos]=useState(null);
  const [live,setLive]=useState(null);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const cargar=async()=>{
    setLoading(true); setErr("");
    try {
      const [rc,rl]=await Promise.all([
        fetch(`${API}/api/_diag/creditos`,{headers:adminHeaders(adminKey)}),
        fetch(`${API}/api/_diag/live`,{headers:adminHeaders(adminKey)}),
      ]);
      if(rc.status===401||rl.status===401){ onNoAutorizado(); return; }
      if(rc.ok) setCreditos(await rc.json());
      if(rl.ok) setLive(await rl.json());
      if(!rc.ok&&!rl.ok) setErr(`Error ${rc.status} / ${rl.status}`);
    } catch(e){
      setErr("Sin conexión con el servidor");
    }
    setLoading(false);
  };

  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[]);

  const rest = creditos?.remaining!=null ? Number(creditos.remaining) : null;
  const colorCred = rest==null ? Q.muted : rest<1000 ? Q.red : rest<5000 ? Q.amber : Q.green;

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",marginBottom:14}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,
          fontFamily:"'Space Grotesk',system-ui"}}>Diagnóstico</div>
        <Btn label={loading?"...":"Actualizar"} onClick={cargar}
          outline color={Q.muted} size="sm"/>
      </div>

      {err&&<div style={{color:Q.red,fontSize:12,marginBottom:12}}>{err}</div>}

      {/* Créditos de The Odds API */}
      <GCard glow={colorCred} style={{padding:16,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>💳 Créditos The Odds API</div>
        {creditos?.remaining!=null?(
          <>
            <div style={{color:colorCred,fontWeight:900,fontSize:30,
              fontFamily:"'Space Grotesk',system-ui"}}>
              {Number(creditos.remaining).toLocaleString("es-AR")}
            </div>
            <div style={{color:Q.muted,fontSize:11,marginTop:2}}>
              restantes · usados: {creditos.used??"—"} · al {creditos.last_check??"—"}
            </div>
            {rest!=null&&rest<5000&&(
              <div style={{color:colorCred,fontSize:11,marginTop:8,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {rest<1000?"⚠️ Saldo crítico — bajá sports_limit o sacá btts"
                          :"Saldo bajo — conviene revisar la configuración"}
              </div>
            )}
          </>
        ):(
          <div style={{color:Q.muted,fontSize:12}}>
            Todavía sin datos. Se llena la primera vez que la API consulta cuotas.
          </div>
        )}
        <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
          {[["Mercados",creditos?.markets_configurados],
            ["Límite deportes",creditos?.sports_limit],
            ["Caché prematch",creditos?.ttl_prematch_seg?`${creditos.ttl_prematch_seg}s`:null],
          ].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}>
              <span style={{color:Q.muted,fontSize:11}}>{l}</span>
              <span style={{color:Q.text,fontSize:11,
                fontFamily:"'Space Grotesk',system-ui"}}>{v??"—"}</span>
            </div>
          ))}
        </div>
      </GCard>

      {/* Partidos en vivo sin cuotas */}
      <GCard glow={live?.sin_cuotas?.length?Q.amber:Q.green}
        style={{padding:16,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>🔴 En vivo sin cuotas</div>
        <div style={{color:Q.muted,fontSize:11,marginBottom:10}}>
          Partidos en curso donde no se pudo cruzar el nombre con el feed de cuotas.
          Sin cuota, el cajero no puede tomar la apuesta.
        </div>
        {live?.sin_cuotas?.length?(
          live.sin_cuotas.map((m,i)=>(
            <div key={i} style={{color:Q.amber,fontSize:12,padding:"4px 0",
              borderBottom:i<live.sin_cuotas.length-1?`1px solid ${Q.dim}`:"none",
              fontFamily:"'Space Grotesk',system-ui"}}>{m}</div>
          ))
        ):(
          <div style={{color:Q.green,fontSize:12,
            fontFamily:"'Space Grotesk',system-ui"}}>
            Todos los partidos en curso tienen cuota
          </div>
        )}
        {live?.actualizado_hace_seg!=null&&(
          <div style={{color:Q.dim,fontSize:10,marginTop:8}}>
            Datos de hace {live.actualizado_hace_seg}s
          </div>
        )}
      </GCard>

      {/* Nombres del feed de cuotas — para comparar a ojo */}
      {live?.nombres_en_feed_de_cuotas?.length>0&&(
        <GCard style={{padding:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>📋 Nombres en el feed de cuotas</div>
          <div style={{color:Q.muted,fontSize:11,marginBottom:10}}>
            Compará con la lista de arriba: si ves el mismo partido escrito
            distinto, ahí está la razón de que no cruce.
          </div>
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {live.nombres_en_feed_de_cuotas.map((k,i)=>(
              <div key={i} style={{color:Q.muted,fontSize:10,padding:"2px 0",
                fontFamily:"'Space Grotesk',system-ui"}}>
                {k.replace("|"," vs ")}
              </div>
            ))}
          </div>
        </GCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
const TABS=[
  {k:"global",   i:"🌐", l:"Global"},
  {k:"combos",   i:"⚡", l:"Combos"},
  {k:"dash",     i:"📊", l:"Dashboard"},
  {k:"agencias", i:"🏪", l:"Agencias"},
  {k:"billetera",i:"💰", l:"Billetera"},
  {k:"usuarios", i:"👥", l:"Usuarios"},
  {k:"config",   i:"⚙️", l:"Config"},
  {k:"diag",     i:"🩺", l:"Diag"},
];

function AdminPanel({ adminKey, onLogout }){
  const [tab,setTab]=useState("global");
  return(
    <div style={{background:Q.void,minHeight:"100vh",
      fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>

      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"10px 16px",display:"flex",alignItems:"center",
        justifyContent:"space-between",position:"sticky",top:0,zIndex:50,overflow:"hidden"}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
          background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
        <QPLogo size={16}/>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <HBadge label="ADMIN" color={Q.violet}/>
          <button onClick={onLogout} style={{background:"transparent",
            border:`1px solid ${Q.border}`,borderRadius:8,padding:"5px 10px",
            color:Q.muted,fontSize:11,cursor:"pointer"}}>Salir</button>
        </div>
      </div>

      <div style={{padding:"16px",maxWidth:620,margin:"0 auto",
        position:"relative",zIndex:1,paddingBottom:80}}>
        {tab==="global"   &&<TabGlobal   adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="combos"   &&<TabCombos   adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="dash"     &&<TabDash/>}
        {tab==="agencias" &&<TabAgencias adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="billetera"&&<TabBilletera/>}
        {tab==="usuarios" &&<TabUsuarios/>}
        {tab==="config"   &&<TabConfig/>}
        {tab==="diag"     &&<TabDiag adminKey={adminKey} onNoAutorizado={onLogout}/>}
      </div>

      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:620,background:"rgba(6,6,18,0.97)",
        backdropFilter:"blur(20px)",borderTop:`1px solid ${Q.border}`,
        display:"flex",zIndex:50}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:1,
          background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            flex:1,background:"transparent",border:"none",
            padding:"10px 4px 8px",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:2,
            position:"relative",
          }}>
            {tab===t.k&&<div style={{position:"absolute",top:0,left:"20%",right:"20%",
              height:2,background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},transparent)`,
              borderRadius:2}}/>}
            <span style={{fontSize:17,filter:tab===t.k?`drop-shadow(0 0 6px ${Q.cyan})`:"none"}}>{t.i}</span>
            <span style={{color:tab===t.k?Q.cyan:Q.muted,fontSize:9,fontWeight:tab===t.k?700:400,
              fontFamily:"'Space Grotesk',system-ui",letterSpacing:0.5,textTransform:"uppercase"}}>{t.l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function QuartzAdmin(){
  // La clave vive solo en memoria: al recargar hay que volver a entrar.
  const [adminKey,setAdminKey]=useState(null);
  return(
    <div style={{background:Q.void,minHeight:"100vh"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus{outline:none} button:active{opacity:.85}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.3)}
      `}</style>
      {!adminKey
        ?<AdminLogin onLogin={setAdminKey}/>
        :<AdminPanel adminKey={adminKey} onLogout={()=>setAdminKey(null)}/>
      }
    </div>
  );
}
