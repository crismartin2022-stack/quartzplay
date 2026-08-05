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
const fmt  = n => Number(n||0).toFixed(2);
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

function KPI({ label, value, sub, color=Q.violet, icon, trend, onClick }){
  return(
    <GCard glow={color} onClick={onClick} style={{padding:"12px 14px"}}>
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
// ════════════════════════════════════════
// TAB GLOBAL — vista real de todo el sistema
// ════════════════════════════════════════
function TabCierre({ adminKey, onNoAutorizado }){
  const hoy=new Date().toISOString().slice(0,10);
  const [desde,setDesde]=useState(hoy);
  const [hasta,setHasta]=useState(hoy);
  const [data,setData]=useState(null);
  const [cargando,setCargando]=useState(false);
  const [ags,setAgs]=useState([]);
  const [filtroAg,setFiltroAg]=useState("");   // code de agencia elegida ("" = todas)
  const [buscar,setBuscar]=useState("");
  const [vista,setVista]=useState("resumen");  // resumen | movimientos | apuestas
  const [movs,setMovs]=useState(null);
  const [cargMovs,setCargMovs]=useState(false);
  const [apuestas,setApuestas]=useState(null);
  const [cargAp,setCargAp]=useState(false);
  const [apAbierta,setApAbierta]=useState(null);   // code de la apuesta expandida
  const [combos,setCombos]=useState(null);
  const [cargCombos,setCargCombos]=useState(false);

  const cargarCombos=async()=>{
    setCargCombos(true);
    try{
      const q=`desde=${desde}&hasta=${hasta}`+(filtroAg?`&agencia=${filtroAg}`:"");
      const r=await fetch(`${API}/api/admin/historial/combos?${q}`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setCombos((await r.json()).combos||[]);
    }catch(e){}
    setCargCombos(false);
  };
  useEffect(()=>{ if(vista==="combos") cargarCombos(); // eslint-disable-next-line
  },[vista,desde,hasta,filtroAg]);
  const [clientesF,setClientesF]=useState([]);     // clientes de la agencia elegida
  const [filtroCli,setFiltroCli]=useState("");     // cliente elegido ("" = todos)
  const [liqMsg,setLiqMsg]=useState("");
  const [liqProc,setLiqProc]=useState(false);
  const [verLiq,setVerLiq]=useState(false);
  const [liquidaciones,setLiquidaciones]=useState(null);
  const [liqAuto,setLiqAuto]=useState([]);
  const [liqAutoMsg,setLiqAutoMsg]=useState("");
  const [liqAutoProc,setLiqAutoProc]=useState(false);

  useEffect(()=>{
    fetch(`${API}/api/admin/liquidacion-config`,{headers:adminHeaders(adminKey)})
      .then(r=>r.ok?r.json():{periodos:[]}).then(d=>setLiqAuto(d.periodos||[]))
      .catch(()=>{});
  // eslint-disable-next-line
  },[]);

  const togglePeriodo=(p)=>{
    const nuevo = liqAuto.includes(p) ? liqAuto.filter(x=>x!==p) : [...liqAuto,p];
    setLiqAuto(nuevo);
    fetch(`${API}/api/admin/liquidacion-config`,{
      method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
      body:JSON.stringify({periodos:nuevo}),
    }).catch(()=>{});
  };

  const dispararAuto=async(periodo)=>{
    setLiqAutoProc(true); setLiqAutoMsg("");
    try{
      const r=await fetch(`${API}/api/admin/liquidar-auto`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({periodo}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      const d=await r.json();
      setLiqAutoMsg(`✅ ${d.generadas} liquidaciones (${d.desde} a ${d.hasta})`);
    }catch(e){ setLiqAutoMsg("⚠️ "+e.message); }
    setLiqAutoProc(false);
  };

  const generarLiquidacion=async()=>{
    if(!filtroAg) return;
    setLiqProc(true); setLiqMsg("");
    try{
      const r=await fetch(`${API}/api/admin/liquidar`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({agencia:filtroAg,desde,hasta}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      setLiqMsg(`✅ Liquidación generada · Comisión ${ars(d.comision_total)}`);
    }catch(e){ setLiqMsg("⚠️ "+e.message); }
    setLiqProc(false);
  };

  const cargarLiquidaciones=async()=>{
    setLiquidaciones(null);
    try{
      const q=filtroAg?`?agencia=${filtroAg}`:"";
      const r=await fetch(`${API}/api/admin/liquidaciones${q}`,{headers:adminHeaders(adminKey)});
      if(r.ok) setLiquidaciones((await r.json()).liquidaciones||[]);
    }catch(e){ setLiquidaciones([]); }
  };

  // Al elegir una agencia, cargar sus clientes para el filtro
  useEffect(()=>{
    setFiltroCli("");
    if(!filtroAg){ setClientesF([]); return; }
    fetch(`${API}/api/admin/clientes?agencia=${filtroAg}`,{headers:adminHeaders(adminKey)})
      .then(r=>r.ok?r.json():{clientes:[]}).then(d=>setClientesF(d.clientes||[]))
      .catch(()=>setClientesF([]));
  // eslint-disable-next-line
  },[filtroAg]);

  const cargarApuestas=async()=>{
    setCargAp(true);
    try{
      const q=`desde=${desde}&hasta=${hasta}`+(filtroAg?`&agencia=${filtroAg}`:"")
              +(filtroCli?`&cliente=${filtroCli}`:"");
      const r=await fetch(`${API}/api/admin/historial/apuestas?${q}`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setApuestas((await r.json()).apuestas||[]);
    }catch(e){}
    setCargAp(false);
  };
  useEffect(()=>{ if(vista==="apuestas") cargarApuestas(); // eslint-disable-next-line
  },[vista,desde,hasta,filtroAg,filtroCli]);

  const [cashouts,setCashouts]=useState([]);
  const [cargCO,setCargCO]=useState(false);
  const cargarCashouts=async()=>{
    setCargCO(true);
    try{
      const q=`desde=${desde}&hasta=${hasta}`+(filtroAg?`&agencia=${filtroAg}`:"");
      const r=await fetch(`${API}/api/admin/historial/cashout?${q}`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setCashouts((await r.json()).cashouts||[]);
    }catch(e){}
    setCargCO(false);
  };
  useEffect(()=>{ if(vista==="cashout") cargarCashouts(); // eslint-disable-next-line
  },[vista,desde,hasta,filtroAg]);

  const cargarMovs=async()=>{
    setCargMovs(true);
    try{
      const q=`desde=${desde}&hasta=${hasta}`+(filtroAg?`&agencia=${filtroAg}`:"")
              +(filtroCli?`&cliente=${filtroCli}`:"");
      const r=await fetch(`${API}/api/admin/historial/movimientos?${q}`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setMovs((await r.json()).movimientos||[]);
    }catch(e){}
    setCargMovs(false);
  };
  useEffect(()=>{ if(vista==="movimientos") cargarMovs(); // eslint-disable-next-line
  },[vista,desde,hasta,filtroAg,filtroCli]);

  const exportarMovs=()=>{
    const q=`desde=${desde}&hasta=${hasta}&export=csv`+(filtroAg?`&agencia=${filtroAg}`:"");
    fetch(`${API}/api/admin/historial/movimientos?${q}`,{headers:adminHeaders(adminKey)})
      .then(r=>r.blob()).then(b=>{
        const a=document.createElement("a");
        a.href=URL.createObjectURL(b); a.download=`movimientos_${desde}_${hasta}.csv`;
        a.click();
      }).catch(()=>{});
  };

  useEffect(()=>{
    fetch(`${API}/api/admin/arbol`,{headers:adminHeaders(adminKey)})
      .then(r=>r.ok?r.json():{agencias:[]}).then(d=>setAgs(d.agencias||[]))
      .catch(()=>{});
  // eslint-disable-next-line
  },[]);

  const rango=(tipo)=>{
    const h=new Date(); let d=new Date();
    if(tipo==="hoy"){ d=new Date(); }
    else if(tipo==="semana"){ d.setDate(h.getDate()-7); }
    else if(tipo==="mes"){ d.setMonth(h.getMonth()-1); }
    const iso=x=>x.toISOString().slice(0,10);
    setDesde(iso(d)); setHasta(iso(h));
  };

  const cargar=async()=>{
    setCargando(true);
    try{
      const q=`desde=${desde}&hasta=${hasta}`+(filtroAg?`&agencia=${filtroAg}`:"")
              +(filtroCli?`&cliente=${filtroCli}`:"");
      const r=await fetch(`${API}/api/admin/cierre?${q}`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setData(await r.json());
    }catch(e){}
    setCargando(false);
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[desde,hasta,filtroAg,filtroCli]);

  const exportar=()=>{
    const q=`desde=${desde}&hasta=${hasta}&export=csv`+(filtroAg?`&agencia=${filtroAg}`:"");
    fetch(`${API}/api/admin/cierre?${q}`,
      {headers:adminHeaders(adminKey)})
      .then(r=>r.blob()).then(b=>{
        const a=document.createElement("a");
        a.href=URL.createObjectURL(b);
        a.download=`cierre_${desde}_${hasta}.csv`;
        a.click();
      }).catch(()=>{});
  };

  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["resumen","📊 Resumen"],["movimientos","💸 Movs"],["apuestas","🎫 Apuestas"],["cashout","💰 Cash out"],["combos","⚡ Combos"]].map(([k,l])=>(
          <button key={k} onClick={()=>setVista(k)} style={{flex:1,
            background:vista===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1px solid ${vista===k?Q.violet:Q.border}`,borderRadius:9,
            padding:"9px",cursor:"pointer",color:vista===k?Q.cyan:Q.muted,
            fontSize:13,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>

      {/* Filtro de agencia: buscador + selector */}
      <input value={buscar} onChange={e=>setBuscar(e.target.value)}
        placeholder="🔍 Buscar agencia..."
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
          color:Q.text,fontSize:14,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}/>
      <select value={filtroAg} onChange={e=>setFiltroAg(e.target.value)}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${filtroAg?Q.cyan:Q.border}`,borderRadius:9,padding:"10px 12px",
          color:Q.text,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}>
        <option value="">— Todo el sistema —</option>
        {ags.filter(a=>!buscar||a.name.toLowerCase().includes(buscar.toLowerCase())
                     ||a.code.toLowerCase().includes(buscar.toLowerCase()))
            .map(a=>(
          <option key={a.code} value={a.code}>
            {"— ".repeat(a.nivel||0)}{a.name} ({a.code})</option>
        ))}
      </select>
      {filtroAg&&<div style={{color:Q.cyan,fontSize:11,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Mostrando esa agencia y toda su rama hacia abajo ·{" "}
        <span onClick={()=>{setFiltroAg("");setBuscar("");}}
          style={{color:Q.muted,textDecoration:"underline",cursor:"pointer"}}>ver todo</span>
      </div>}

      {filtroAg&&clientesF.length>0&&(
        <select value={filtroCli} onChange={e=>setFiltroCli(e.target.value)}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${filtroCli?Q.gold:Q.border}`,borderRadius:9,
            padding:"9px 12px",color:Q.text,fontSize:14,marginBottom:12,
            fontFamily:"'Space Grotesk',system-ui"}}>
          <option value="">— Todos los clientes de {filtroAg} —</option>
          {clientesF.map(c=>(
            <option key={c.id} value={c.id}>👤 {c.nombre}</option>
          ))}
        </select>
      )}
      {filtroCli&&<div style={{color:Q.gold,fontSize:11,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Viendo solo ese cliente ·{" "}
        <span onClick={()=>setFiltroCli("")}
          style={{color:Q.muted,textDecoration:"underline",cursor:"pointer"}}>ver todos</span>
      </div>}

      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["hoy","Hoy"],["semana","7 días"],["mes","30 días"]].map(([k,l])=>(
          <button key={k} onClick={()=>rango(k)} style={{flex:1,
            background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px",cursor:"pointer",color:Q.cyan,
            fontSize:12,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"8px 10px",
            color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}/>
        <span style={{color:Q.muted}}>→</span>
        <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"8px 10px",
            color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>

      {vista==="resumen"&&<>
      {cargando&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Calculando...</div>}

      {data&&(
        <div>
          <GCard glow={Q.violet} style={{padding:16,marginBottom:12,
            background:`linear-gradient(135deg,${Q.violet}12,${Q.cyan}06)`}}>
            <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
              letterSpacing:1,marginBottom:10,
              fontFamily:"'Space Grotesk',system-ui"}}>
              {data.es_cliente?`Rentabilidad · ${data.cliente_nombre}`
                :filtroAg?"Total de la rama":"Total del sistema"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["Apostado",data.global.apostado,Q.cyan],
                ["Premios",data.global.premios,Q.pink],
                ["GGR",data.global.ggr,Q.green],
                ["Comisiones",data.global.comisiones,Q.amber]].map(([l,v,c])=>(
                <div key={l}>
                  <div style={{color:Q.muted,fontSize:10}}>{l}</div>
                  <div style={{color:c,fontWeight:800,fontSize:17,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${Q.dim}`,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:Q.text,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>Neto de la casa</span>
              <span style={{color:data.global.neto_casa>=0?Q.green:Q.red,
                fontWeight:900,fontSize:22,
                fontFamily:"'Space Grotesk',system-ui"}}>{ars(data.global.neto_casa)}</span>
            </div>
            {data.global.comision_influencers!=null&&data.global.comision_influencers>0&&(
              <div style={{marginTop:8,display:"flex",justifyContent:"space-between",
                alignItems:"center"}}>
                <span style={{color:Q.muted,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui"}}>🌟 Comisión influencers</span>
                <span style={{color:Q.gold,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>−{ars(data.global.comision_influencers)}</span>
              </div>
            )}
            {data.global.neto_final!=null&&(
              <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${Q.dim}`,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>Neto final</span>
                <span style={{color:data.global.neto_final>=0?Q.green:Q.red,
                  fontWeight:900,fontSize:20,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(data.global.neto_final)}</span>
              </div>
            )}
          </GCard>

          {data.es_cliente&&data.rendimiento&&(
            <div style={{display:"flex",gap:8,marginBottom:12,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>
              <span style={{color:Q.green}}>{data.rendimiento.ganadas} ganadas</span>
              <span style={{color:Q.red}}>{data.rendimiento.perdidas} perdidas</span>
              <span style={{color:Q.amber}}>{data.rendimiento.pendientes} pendientes</span>
            </div>
          )}

          {!filtroAg&&(
            <GCard glow={Q.violet} style={{padding:14,marginBottom:12,
              background:`linear-gradient(135deg,${Q.violet}10,${Q.cyan}06)`}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:8,
                fontFamily:"'Space Grotesk',system-ui"}}>⚙️ Liquidación automática</div>
              <div style={{color:Q.muted,fontSize:11,marginBottom:10,
                fontFamily:"'Space Grotesk',system-ui"}}>
                Genera liquidaciones de agencias e influencers al cierre del período.
                No paga: deja el registro para que lo revises.</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                {[["semanal","📅 Semanal"],["mensual","🗓️ Mensual"]].map(([k,l])=>(
                  <button key={k} onClick={()=>togglePeriodo(k)} style={{flex:1,
                    background:liqAuto.includes(k)?`${Q.green}22`:"rgba(255,255,255,0.04)",
                    border:`1px solid ${liqAuto.includes(k)?Q.green:Q.border}`,
                    borderRadius:10,padding:"9px",cursor:"pointer",
                    color:liqAuto.includes(k)?Q.green:Q.muted,fontSize:12,fontWeight:700,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {liqAuto.includes(k)?"✓ ":""}{l}</button>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn label={liqAutoProc?"...":"▶ Correr semanal ahora"}
                  onClick={()=>dispararAuto("semanal")} color={Q.cyan} outline full disabled={liqAutoProc}/>
                <Btn label={liqAutoProc?"...":"▶ Correr mensual ahora"}
                  onClick={()=>dispararAuto("mensual")} color={Q.cyan} outline full disabled={liqAutoProc}/>
              </div>
              {liqAutoMsg&&<div style={{fontSize:12,marginTop:8,
                color:liqAutoMsg.startsWith("✅")?Q.green:Q.red,
                fontFamily:"'Space Grotesk',system-ui"}}>{liqAutoMsg}</div>}
            </GCard>
          )}

          {filtroAg&&!data.es_cliente&&(
            <GCard glow={Q.gold} style={{padding:14,marginBottom:12,
              background:`linear-gradient(135deg,${Q.gold}10,${Q.violet}06)`}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:8,
                fontFamily:"'Space Grotesk',system-ui"}}>💵 Liquidación de comisiones</div>
              <div style={{color:Q.muted,fontSize:11,marginBottom:10,
                fontFamily:"'Space Grotesk',system-ui"}}>
                Genera la liquidación de {filtroAg} para el período elegido.</div>
              <div style={{display:"flex",gap:8}}>
                <Btn label="📋 Ver anteriores"
                  onClick={()=>{setVerLiq(true);cargarLiquidaciones();}}
                  color={Q.cyan} outline full/>
                <Btn label={liqProc?"...":"Generar"} onClick={generarLiquidacion}
                  color={Q.gold} full disabled={liqProc}/>
              </div>
              {liqMsg&&<div style={{fontSize:12,marginTop:8,
                color:liqMsg.startsWith("✅")?Q.green:Q.red,
                fontFamily:"'Space Grotesk',system-ui"}}>{liqMsg}</div>}
            </GCard>
          )}

          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:8}}>
            <span style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
              letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>Por agencia</span>
            <Btn label="⬇ CSV" onClick={exportar} color={Q.cyan} size="sm"/>
          </div>

          {data.agencias.map(a=>(
            <GCard key={a.code} style={{padding:"11px 13px",marginBottom:6,
              marginLeft:(a.nivel||0)*12}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:6}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>{a.name}</div>
                <div style={{color:Q.gold,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>Com {ars(a.comision)}</div>
              </div>
              <div style={{display:"flex",gap:12,fontSize:11,
                fontFamily:"'Space Grotesk',system-ui"}}>
                <span style={{color:Q.muted}}>Apostado <span style={{color:Q.cyan}}>{ars(a.apostado)}</span></span>
                <span style={{color:Q.muted}}>Premios <span style={{color:Q.pink}}>{ars(a.premios)}</span></span>
                <span style={{color:Q.muted}}>GGR <span style={{color:a.ggr>=0?Q.green:Q.red}}>{ars(a.ggr)}</span></span>
              </div>
            </GCard>
          ))}
        </div>
      )}
      </>}

      {vista==="movimientos"&&<>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:8}}>
          <span style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
            letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>
            Movimientos {filtroAg?"de la rama":"del sistema"}</span>
          <Btn label="⬇ CSV" onClick={exportarMovs} color={Q.cyan} size="sm"/>
        </div>
        {cargMovs&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {movs&&movs.length===0&&!cargMovs&&<div style={{color:Q.muted,fontSize:12,
          textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
          Sin movimientos en el período</div>}
        {(movs||[]).map((m,i)=>{
          const tipoTxt={carga_admin:"Carga admin",retiro_admin:"Descuento admin",
            carga_cliente:"Crédito a cliente",retiro_cliente:"Retiro cliente",
            pago_premio:"Premio pagado",transferencia:"A sub-agencia",recibido:"Recibido",
            carga:"Carga cliente",retiro:"Retiro cliente"}[m.tipo]||m.tipo;
          const pos=m.monto>=0;
          return(
            <GCard key={i} style={{padding:"10px 13px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {tipoTxt}
                    {m.origen==="cliente"&&m.cliente?<span style={{color:Q.cyan}}> · {m.cliente}</span>:null}
                  </div>
                  <div style={{color:Q.muted,fontSize:10}}>
                    {m.agencia} · {m.fecha}{m.por?` · por ${m.por}`:""}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:pos?Q.green:Q.amber,fontWeight:700,fontSize:14,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {pos?"+":""}{ars(m.monto)}</div>
                  {m.saldo!=null&&<div style={{color:Q.dim,fontSize:9}}>saldo {ars(m.saldo)}</div>}
                </div>
              </div>
            </GCard>
          );
        })}
      </>}

      {vista==="apuestas"&&<>
        <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
          letterSpacing:1,marginBottom:8,marginLeft:4,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Apuestas {filtroCli?"del cliente":filtroAg?"de la rama":"del sistema"}</div>
        {cargAp&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {apuestas&&apuestas.length===0&&!cargAp&&<div style={{color:Q.muted,fontSize:12,
          textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
          Sin apuestas en el período</div>}
        {(apuestas||[]).map((a,i)=>{
          const col={won:Q.green,ganada:Q.green,lost:Q.red,perdida:Q.red,
            pending:Q.amber,pendiente:Q.amber,active:Q.cyan,
            paid:Q.green}[(a.status||"").toLowerCase()]||Q.muted;
          const abierta=apAbierta===a.code;
          return(
            <GCard key={i} style={{padding:"11px 13px",marginBottom:6,cursor:"pointer"}}
              onClick={()=>setApAbierta(abierta?null:a.code)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>{a.code}
                    <span style={{color:Q.cyan,fontWeight:400}}> · {a.cliente}</span></div>
                  <div style={{color:Q.muted,fontSize:10}}>
                    {a.agencia} · {a.fecha} · {a.picks.length} sel.</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:col,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>{a.status}</div>
                  <div style={{color:Q.muted,fontSize:10}}>
                    {ars(a.stake)} · {fmt(a.odd)}x</div>
                </div>
              </div>

              {abierta&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,
                    fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
                    <span style={{color:Q.muted}}>Monto <span style={{color:Q.cyan}}>{ars(a.stake)}</span></span>
                    <span style={{color:Q.muted}}>Cuota <span style={{color:Q.violet2}}>{fmt(a.odd)}x</span></span>
                    <span style={{color:Q.muted}}>Premio <span style={{color:Q.green}}>{ars(a.premio)}</span></span>
                  </div>
                  {a.picks.map((p,j)=>(
                    <div key={j} style={{background:"rgba(255,255,255,0.03)",
                      borderRadius:8,padding:"8px 10px",marginBottom:5}}>
                      <div style={{color:Q.text,fontSize:11,fontWeight:600,
                        fontFamily:"'Space Grotesk',system-ui"}}>
                        {p.home||p.equipo_local||""}{(p.home||p.away)?" vs ":""}{p.away||p.equipo_visitante||""}</div>
                      <div style={{color:Q.muted,fontSize:10,marginTop:2}}>
                        {p.market||p.mercado||p.tipo||"—"}: <span style={{color:Q.cyan}}>
                        {p.selection||p.seleccion||p.pick||"—"}</span>
                        {p.odd||p.cuota?<span style={{color:Q.violet2}}> @ {fmt(p.odd||p.cuota)}</span>:null}</div>
                      {(p.resultado||p.result)&&<div style={{color:col,fontSize:9,marginTop:2,
                        fontFamily:"'Space Grotesk',system-ui"}}>{p.resultado||p.result}</div>}
                    </div>
                  ))}
                  {a.picks.length===0&&<div style={{color:Q.muted,fontSize:11,
                    fontFamily:"'Space Grotesk',system-ui"}}>Sin detalle de selecciones</div>}
                </div>
              )}
            </GCard>
          );
        })}
      </>}

      {vista==="cashout"&&<>
        <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
          letterSpacing:1,marginBottom:8,marginLeft:4,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Cash outs {filtroAg?"de la rama":"del sistema"}</div>
        {cargCO&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {cashouts&&cashouts.length===0&&!cargCO&&<div style={{color:Q.muted,fontSize:12,
          textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
          Sin cash outs en el período</div>}
        {(cashouts||[]).map((c,i)=>{
          const col={cashed_out:Q.green,cashout_pending:Q.amber}[c.estado]||Q.muted;
          const rot={cashed_out:"Pagado",cashout_pending:"Pend. caja"}[c.estado]||c.estado;
          return(
            <GCard key={i} style={{padding:"11px 13px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>{c.code}
                    <span style={{color:Q.cyan,fontWeight:400}}> · {c.cliente}</span></div>
                  <div style={{color:Q.muted,fontSize:10}}>
                    {c.agencia} · {c.fecha}{c.pagado_por?` · pagó ${c.pagado_por}`:""}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:col,fontWeight:700,fontSize:11,
                    fontFamily:"'Space Grotesk',system-ui"}}>{rot}</div>
                  <div style={{color:Q.gold,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(c.valor)} {c.moneda}</div>
                </div>
              </div>
            </GCard>
          );
        })}
      </>}

      {vista==="combos"&&<>
        <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
          letterSpacing:1,marginBottom:8,marginLeft:4,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Combos generados {filtroAg?"de la rama":"del sistema"}</div>
        {cargCombos&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {combos&&combos.length===0&&!cargCombos&&<div style={{color:Q.muted,fontSize:12,
          textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
          Sin combos en el período</div>}
        {(combos||[]).map((c,i)=>(
          <GCard key={i} style={{padding:"11px 13px",marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre||"Combo"}
                  {c.es_ia
                    ?<span style={{background:`${Q.violet}33`,border:`1px solid ${Q.violet}`,
                        borderRadius:12,padding:"1px 7px",fontSize:9,fontWeight:700,
                        color:Q.violet2,marginLeft:6}}>🤖 IA</span>
                    :<span style={{background:`${Q.cyan}22`,border:`1px solid ${Q.cyan}`,
                        borderRadius:12,padding:"1px 7px",fontSize:9,fontWeight:700,
                        color:Q.cyan,marginLeft:6}}>✍️ Manual</span>}
                  {!c.visible&&<span style={{color:Q.muted,fontSize:9,marginLeft:5}}>oculto</span>}
                </div>
                <div style={{color:Q.muted,fontSize:10}}>
                  {c.creado_por||c.origen} · {c.fecha}</div>
              </div>
              <div style={{color:Q.green,fontWeight:700,fontSize:14,flexShrink:0,
                fontFamily:"'Space Grotesk',system-ui"}}>{fmt(c.odd)}x</div>
            </div>
          </GCard>
        ))}
      </>}

      {verLiq&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",
          zIndex:210,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setVerLiq(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
            borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
            maxHeight:"88vh",overflowY:"auto",padding:20,
            border:`1px solid ${Q.border}`,borderBottom:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:16}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:16,
                fontFamily:"'Space Grotesk',system-ui"}}>💵 Liquidaciones {filtroAg}</div>
              <button onClick={()=>setVerLiq(false)} style={{background:"transparent",
                border:"none",color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            {!liquidaciones&&<div style={{color:Q.muted,textAlign:"center",padding:20,
              fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
            {liquidaciones&&liquidaciones.length===0&&<div style={{color:Q.muted,
              textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
              No hay liquidaciones generadas</div>}
            {(liquidaciones||[]).map((l,i)=>(
              <GCard key={i} style={{padding:"12px 14px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",marginBottom:6}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>{l.agencia}</div>
                  <div style={{color:Q.gold,fontWeight:800,fontSize:15,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(l.comision_total)}</div>
                </div>
                <div style={{color:Q.muted,fontSize:10,marginBottom:4}}>
                  {l.desde} → {l.hasta} · generada {l.fecha}</div>
                <div style={{display:"flex",gap:12,fontSize:11,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  <span style={{color:Q.muted}}>Apostado <span style={{color:Q.cyan}}>{ars(l.apostado)}</span></span>
                  <span style={{color:Q.muted}}>GGR <span style={{color:Q.green}}>{ars(l.ggr)}</span></span>
                </div>
              </GCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabGlobal({ adminKey, onNoAutorizado, onIr }){
  const [r,setR]=useState(null);
  const [ags,setAgs]=useState([]);
  const [movs,setMovs]=useState([]);
  const [err,setErr]=useState("");

  useEffect(()=>{ (async()=>{
    try{
      const [rr,ra,rm]=await Promise.all([
        fetch(`${API}/api/admin/resumen`,{headers:adminHeaders(adminKey)}),
        fetch(`${API}/api/admin/agencias-detalle`,{headers:adminHeaders(adminKey)}),
        fetch(`${API}/api/admin/historial/movimientos`,{headers:adminHeaders(adminKey)}),
      ]);
      if(rr.status===401){ onNoAutorizado(); return; }
      if(rr.ok) setR(await rr.json());
      if(ra.ok) setAgs((await ra.json()).agencias||[]);
      if(rm.ok) setMovs(((await rm.json()).movimientos||[]).slice(0,10));
    }catch(e){ setErr("Sin conexión con el servidor"); }
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
        <KPI label="Agencias" value={r.agencias} color={Q.cyan} icon="🏪"
          onClick={()=>onIr&&onIr("agencias")}/>
        <KPI label="Usuarios" value={r.usuarios} color={Q.violet} icon="👥"
          onClick={()=>onIr&&onIr("agencias")}/>
        <KPI label="Tickets hoy" value={r.tickets_hoy} color={Q.amber} icon="🎫"
          onClick={()=>onIr&&onIr("eventos")}/>
        <KPI label="Cobrado hoy" value={ars(r.cobrado_hoy)} color={Q.green} icon="💰"
          onClick={()=>onIr&&onIr("agencias")}/>
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
          fontFamily:"'Space Grotesk',system-ui"}}>🏪 Agencias hoy</div>
        {ags.length===0&&<div style={{color:Q.muted,fontSize:12,
          fontFamily:"'Space Grotesk',system-ui"}}>Sin agencias</div>}
        {ags.map((a,i)=>(
          <div key={a.code} onClick={()=>onIr&&onIr("agencias")}
            style={{display:"flex",justifyContent:"space-between",cursor:"pointer",
            alignItems:"center",padding:"8px 0",
            borderBottom:i<ags.length-1?`1px solid ${Q.dim}`:"none"}}>
            <div>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:"'Space Grotesk',system-ui"}}>{a.name} ›</div>
              <div style={{color:Q.muted,fontSize:10}}>{a.code} · {a.tickets_hoy} tickets hoy</div>
            </div>
            <div style={{color:Q.green,fontWeight:700,fontSize:13,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(a.cobrado_hoy)}</div>
          </div>
        ))}
      </GCard>

      <GCard style={{padding:16}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>💸 Últimos movimientos</div>
        {movs.length===0&&<div style={{color:Q.muted,fontSize:12,
          fontFamily:"'Space Grotesk',system-ui"}}>Sin movimientos</div>}
        {movs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",padding:"7px 0",
            borderBottom:i<movs.length-1?`1px solid ${Q.dim}`:"none"}}>
            <div style={{minWidth:0,flex:1}}>
              <span style={{color:tipoColor[m.tipo]||Q.text,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>{tipoTxt[m.tipo]||m.tipo}</span>
              <span style={{color:Q.muted,fontSize:11}}> · {m.agencia} · {m.usuario}</span>
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
        <Btn label="📸 Escanear" onClick={()=>setModo("escanear")} color={Q.cyan} full/>
      </div>

      {combos===null&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {combos&&combos.length===0&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{fontSize:26,marginBottom:8}}>⚡</div>
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
                {c.picks.length} picks · {fmt(c.odd_total)}x ·
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
  const [agencias,setAgencias]=useState("");   // vacío = todas
  const [guardando,setGuardando]=useState(false);
  const [msg,setMsg]=useState("");
  const [infList,setInfList]=useState([]);
  const [infCode,setInfCode]=useState("");
  const [codigoSalida,setCodigoSalida]=useState("");
  const [destinatarios,setDestinatarios]=useState({subs:[],influencers:[]});
  const [destSubs,setDestSubs]=useState([]);
  const [destInfs,setDestInfs]=useState([]);
  const [todosSubs,setTodosSubs]=useState(false);
  const [todosInfs,setTodosInfs]=useState(false);

  useEffect(()=>{
    fetch(`${API}/api/live/prematch`).then(r=>r.ok?r.json():null)
      .then(d=>setDeportes(d?.sports||[])).catch(()=>setDeportes([]));
    fetch(`${API}/api/influencers`,{headers:adminHeaders(adminKey)})
      .then(r=>r.ok?r.json():{influencers:[]}).then(d=>setInfList(d.influencers||[]))
      .catch(()=>{});
    fetch(`${API}/api/admin/destinatarios`,{headers:adminHeaders(adminKey)})
      .then(r=>r.ok?r.json():{subs:[],influencers:[]})
      .then(d=>setDestinatarios({subs:d.subs||[],influencers:d.influencers||[]}))
      .catch(()=>{});
  // eslint-disable-next-line
  },[]);

  const toggleDest=(code,lista,setLista)=>{
    setLista(prev=>prev.includes(code)?prev.filter(c=>c!==code):[...prev,code]);
  };

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
          influencer_code: infCode||null,
          codigo: codigoSalida||null,
          compartir_subs: todosSubs ? "todos" : destSubs,
          compartir_influencers: todosInfs ? "todos" : destInfs,
        }),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("✅ Combo publicado");
      setTimeout(onListo, 800);
    }catch(e){ setMsg("⚠️ "+e.message); }
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
        color:Q.muted,fontSize:22,cursor:"pointer",marginBottom:6,padding:0}}>‹ Volver</button>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>Crear combo de la casa</div>

      <input value={nombre} onChange={e=>setNombre(e.target.value)}
        placeholder="Nombre del combo"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px 14px",
          color:Q.text,fontSize:16,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}/>

      <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,
        marginBottom:6,fontFamily:"'Space Grotesk',system-ui"}}>Dónde se muestra</div>
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        {[["Box",destBox,setDestBox],["App",destApp,setDestApp],
          ["Agencias",destAg,setDestAg]].map(([l,v,sv])=>(
          <button key={l} onClick={()=>sv(!v)} style={{flex:1,
            background:v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1.5px solid ${v?Q.violet:Q.border}`,borderRadius:10,
            padding:"10px",cursor:"pointer",color:v?Q.cyan:Q.muted,
            fontSize:12,fontWeight:v?700:400,
            fontFamily:"'Space Grotesk',system-ui"}}>{v?"✓ ":""}{l}</button>
        ))}
      </div>
      <input value={agencias} onChange={e=>setAgencias(e.target.value)}
        placeholder="Agencias (AGE001,AGE002) o vacío = todas"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 12px",
          color:Q.text,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}/>

      <select value={infCode} onChange={e=>setInfCode(e.target.value)}
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${infCode?Q.violet:Q.border}`,borderRadius:10,padding:"10px 12px",
          color:infCode?Q.text:Q.muted,fontSize:14,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>
        <option value="">🌟 Asignar a influencer (opcional)</option>
        {infList.map(inf=>(
          <option key={inf.code} value={inf.code}>{inf.name} · {inf.codigo_ref}</option>
        ))}
      </select>
      {infCode&&<input value={codigoSalida} onChange={e=>setCodigoSalida(e.target.value.toUpperCase())}
        placeholder="Código de salida del combo (ej: COMBODELDIA)"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 12px",
          color:Q.text,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}/>}

      {/* Compartir con agencias e influencers */}
      {(destinatarios.subs.length>0||destinatarios.influencers.length>0)&&(
        <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${Q.border}`,
          borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{color:Q.violet,fontWeight:700,fontSize:12,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}>📤 Compartir este combo</div>

          {destinatarios.subs.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
                  fontFamily:"'Space Grotesk',system-ui"}}>🏢 Agencias</span>
                <button onClick={()=>{setTodosSubs(v=>!v); if(!todosSubs)setDestSubs([]);}}
                  style={{background:todosSubs?`${Q.green}22`:"rgba(255,255,255,0.05)",
                    border:`1px solid ${todosSubs?Q.green:Q.border}`,borderRadius:8,
                    padding:"4px 10px",cursor:"pointer",color:todosSubs?Q.green:Q.muted,
                    fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                  {todosSubs?"✓ Todas":"Todas"}</button>
              </div>
              {!todosSubs&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {destinatarios.subs.map(x=>(
                  <button key={x.code} onClick={()=>toggleDest(x.code,destSubs,setDestSubs)}
                    style={{background:destSubs.includes(x.code)?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                      border:`1px solid ${destSubs.includes(x.code)?Q.violet:Q.border}`,borderRadius:8,
                      padding:"6px 10px",cursor:"pointer",color:destSubs.includes(x.code)?Q.text:Q.muted,
                      fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
                    {destSubs.includes(x.code)?"✓ ":""}{x.name}</button>
                ))}
              </div>}
            </div>
          )}

          {destinatarios.influencers.length>0&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
                  fontFamily:"'Space Grotesk',system-ui"}}>🌟 Influencers</span>
                <button onClick={()=>{setTodosInfs(v=>!v); if(!todosInfs)setDestInfs([]);}}
                  style={{background:todosInfs?`${Q.green}22`:"rgba(255,255,255,0.05)",
                    border:`1px solid ${todosInfs?Q.green:Q.border}`,borderRadius:8,
                    padding:"4px 10px",cursor:"pointer",color:todosInfs?Q.green:Q.muted,
                    fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                  {todosInfs?"✓ Todos":"Todos"}</button>
              </div>
              {!todosInfs&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {destinatarios.influencers.map(x=>(
                  <button key={x.code} onClick={()=>toggleDest(x.code,destInfs,setDestInfs)}
                    style={{background:destInfs.includes(x.code)?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                      border:`1px solid ${destInfs.includes(x.code)?Q.violet:Q.border}`,borderRadius:8,
                      padding:"6px 10px",cursor:"pointer",color:destInfs.includes(x.code)?Q.text:Q.muted,
                      fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
                    {destInfs.includes(x.code)?"✓ ":""}{x.name}</button>
                ))}
              </div>}
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",gap:8,
        background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
        borderRadius:10,padding:"8px 12px",marginBottom:10}}>
        <span>🔍</span>
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
        color:msg.startsWith("✅")?Q.green:Q.red,
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

function CorregirPickAdmin({ pick, adminKey, onAplicar, onQuitar }){
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
      const r=await fetch(`${API}/api/buscar-eventos?q=${encodeURIComponent(buscar.trim())}`,
        {headers:adminHeaders(adminKey)});
      const d=await r.json();
      setEncontrados(d.eventos||[]);
    }catch(e){ setEncontrados([]); }
    setBuscando(false);
  };
  const elegirOpcion=(op)=>{
    const cuota=ajuste.trim()?parseFloat(ajuste):op.odd;
    onAplicar({selection:op.sel,odd_nuestra:op.odd,odd_ajustada:cuota,estado:"ok"});
  };
  const elegirNuevo=(ev,op)=>{
    const cuota=ajuste.trim()?parseFloat(ajuste):op.odd;
    onAplicar({home:ev.home,away:ev.away,home_real:ev.home,away_real:ev.away,
      event_id:ev.event_id,sport_key:ev.sport_key,selection:op.sel,market:op.mkt,
      odd_nuestra:op.odd,odd_ajustada:cuota,estado:"ok",opciones:ev.opciones});
  };

  return(
    <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${Q.dim}`}}>
      {(pick.home_real||pick.away_real)&&(
        <div style={{color:Q.muted,fontSize:10,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>
          En el sistema: <span style={{color:Q.cyan}}>{pick.home_real} vs {pick.away_real}</span>
        </div>
      )}
      {/* Candidatos parecidos (cuando no encontró el partido) */}
      {(pick.candidatos&&pick.candidatos.length>0)&&(
        <div style={{marginBottom:10}}>
          <div style={{color:Q.amber,fontSize:10,marginBottom:6,
            fontFamily:"'Space Grotesk',system-ui"}}>
            ¿Quisiste decir alguno de estos?
          </div>
          {pick.candidatos.map((ev,ci)=>(
            <div key={ci} style={{background:`${Q.amber}0E`,
              border:`1px solid ${Q.amber}44`,borderRadius:8,
              padding:"8px 10px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,marginBottom:5,
                fontFamily:"'Space Grotesk',system-ui"}}>{ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevo(ev,op)} style={{
                    background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
                    borderRadius:7,padding:"5px 9px",cursor:"pointer",
                    color:Q.cyan,fontSize:11,fontWeight:600,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {op.sel} · {fmt(op.odd)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <button onClick={()=>setModo("seleccion")} style={{flex:1,
          background:modo==="seleccion"?`${Q.violet}33`:"rgba(255,255,255,0.04)",
          border:`1px solid ${modo==="seleccion"?Q.violet:Q.border}`,borderRadius:8,
          padding:"7px",cursor:"pointer",color:modo==="seleccion"?Q.cyan:Q.muted,
          fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>Selección</button>
        <button onClick={()=>setModo("partido")} style={{flex:1,
          background:modo==="partido"?`${Q.violet}33`:"rgba(255,255,255,0.04)",
          border:`1px solid ${modo==="partido"?Q.violet:Q.border}`,borderRadius:8,
          padding:"7px",cursor:"pointer",color:modo==="partido"?Q.cyan:Q.muted,
          fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>Otro partido</button>
      </div>

      {modo==="seleccion"&&(
        <div>
          {opciones.length===0&&<div style={{color:Q.muted,fontSize:11,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}>Sin opciones. Probá "Otro partido".</div>}
          {opciones.map((op,k)=>(
            <button key={k} onClick={()=>elegirOpcion(op)} style={{width:"100%",
              display:"flex",justifyContent:"space-between",alignItems:"center",
              background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.border}`,
              borderRadius:8,padding:"9px 12px",marginBottom:5,cursor:"pointer"}}>
              <span style={{color:Q.text,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>{op.sel}</span>
              <span style={{color:Q.cyan,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{fmt(op.odd)}</span>
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
              style={{flex:1,background:"rgba(255,255,255,0.05)",
                border:`1px solid ${Q.border}`,borderRadius:8,padding:"9px 12px",
                color:Q.text,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}/>
            <button onClick={buscarEventos} style={{background:`${Q.violet}33`,
              border:`1px solid ${Q.violet}`,borderRadius:8,padding:"0 14px",
              cursor:"pointer",color:Q.cyan,fontSize:12,fontWeight:700,
              fontFamily:"'Space Grotesk',system-ui"}}>{buscando?"...":"Buscar"}</button>
          </div>
          {encontrados.map((ev,k)=>(
            <div key={k} style={{background:"rgba(255,255,255,0.03)",
              border:`1px solid ${Q.dim}`,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,marginBottom:6,
                fontFamily:"'Space Grotesk',system-ui"}}>{ev.home} vs {ev.away}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {(ev.opciones||[]).map((op,j)=>(
                  <button key={j} onClick={()=>elegirNuevo(ev,op)} style={{
                    background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
                    borderRadius:7,padding:"5px 9px",cursor:"pointer",
                    color:Q.cyan,fontSize:11,fontWeight:600,
                    fontFamily:"'Space Grotesk',system-ui"}}>
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
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:8,padding:"8px 10px",
            color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}/>
        <button onClick={onQuitar} style={{background:`${Q.red}18`,
          border:`1px solid ${Q.red}`,borderRadius:8,padding:"8px 12px",
          cursor:"pointer",color:Q.red,fontSize:11,fontWeight:700,
          fontFamily:"'Space Grotesk',system-ui"}}>Quitar</button>
      </div>
    </div>
  );
}

function EscanearComboAdmin({ adminKey, onListo, onVolver, onNoAutorizado }){
  const [imgs,setImgs]=useState([]);
  const [analizando,setAnalizando]=useState(false);
  const [res,setRes]=useState(null);
  const [corrigiendo,setCorrigiendo]=useState(null);
  const aplicarCorreccion=(ix,nuevo)=>{
    setRes(r=>{
      const picks=r.picks.map((p,i)=>i===ix?{...p,...nuevo}:p);
      return {...r,picks,picks_ok:picks.filter(p=>p.odd_nuestra).length};
    });
    setCorrigiendo(null);
  };
  const quitarPickM=(ix)=>{
    setRes(r=>{
      const picks=r.picks.filter((_,i)=>i!==ix);
      return {...r,picks,picks_total:picks.length,
        picks_ok:picks.filter(p=>p.odd_nuestra).length};
    });
    setCorrigiendo(null);
  };
  const [usarAjustada,setUsarAjustada]=useState(true);   // true=nuestra, false=original
  const [nombre,setNombre]=useState("");
  const [destBox,setDestBox]=useState(true);
  const [destApp,setDestApp]=useState(false);
  const [destAg,setDestAg]=useState(false);
  const [msg,setMsg]=useState("");
  const [pub,setPub]=useState(false);

  const elegir=(e)=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length) return;
    files.forEach(f=>{
      if(f.size>8*1024*1024){ setMsg("Una imagen supera 8MB"); return; }
      const rd=new FileReader();
      rd.onload=()=>setImgs(prev=>[...prev,{b64:rd.result.split(",")[1],
        tipo:f.type||"image/jpeg",preview:rd.result}]);
      rd.readAsDataURL(f);
    });
    e.target.value="";
  };
  const quitarImg=(i)=>setImgs(prev=>prev.filter((_,k)=>k!==i));
  const analizar=async()=>{
    if(!imgs.length||analizando) return;
    setAnalizando(true); setMsg(""); setRes(null);
    try{
      const r=await fetch(`${API}/api/admin/escanear-combo`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({imagenes:imgs.map(im=>({data:im.b64,media_type:im.tipo}))}),
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
      setMsg("✅ Combo publicado");
      setTimeout(onListo, 800);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setPub(false);
  };

  return(
    <div>
      <button onClick={onVolver} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:22,cursor:"pointer",marginBottom:6,padding:0}}>‹ Volver</button>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>Escanear y publicar</div>

      {imgs.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {imgs.map((im,i)=>(
            <div key={i} style={{position:"relative"}}>
              <img src={im.preview} alt={"f"+i} style={{width:64,height:64,
                objectFit:"cover",borderRadius:8,border:`1px solid ${Q.border}`}}/>
              <button onClick={()=>quitarImg(i)} style={{position:"absolute",
                top:-6,right:-6,width:20,height:20,borderRadius:"50%",
                background:Q.red,border:"none",color:"#fff",fontSize:11,
                cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
          ))}
        </div>
      )}
      {!res&&(
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:12,
            padding:"22px 10px",textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" capture="environment"
              onChange={elegir} style={{display:"none"}}/>
            <div style={{fontSize:26,marginBottom:5}}>📸</div>
            <div style={{fontWeight:700,fontSize:12,color:Q.text,
              fontFamily:"'Space Grotesk',system-ui"}}>Cámara</div>
          </label>
          <label style={{flex:1,border:`2px dashed ${Q.border}`,borderRadius:12,
            padding:"22px 10px",textAlign:"center",cursor:"pointer"}}>
            <input type="file" accept="image/*" multiple onChange={elegir} style={{display:"none"}}/>
            <div style={{fontSize:26,marginBottom:5}}>🖼️</div>
            <div style={{fontWeight:700,fontSize:12,color:Q.text,
              fontFamily:"'Space Grotesk',system-ui"}}>
              {imgs.length>0?"Agregar más":"Archivo"}</div>
          </label>
        </div>
      )}

      {imgs.length>0&&!res&&(
        <div style={{marginBottom:12}}>
          <Btn label={analizando?"LEYENDO...":`🔍 Analizar ${imgs.length} foto${imgs.length>1?"s":""}`}
            onClick={analizar} color={Q.cyan} full disabled={analizando}/>
        </div>
      )}

      {msg&&<div style={{fontSize:12,marginBottom:10,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}

      {res&&(
        <div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:10,
            fontFamily:"'Space Grotesk',system-ui"}}>
            Leímos {res.picks_total} · tomamos {res.picks_ok}</div>

          {res.picks.map((p,i)=>(
            <GCard key={i} style={{padding:"10px 12px",marginBottom:6}}>
              <div style={{color:Q.text,fontSize:12,fontWeight:600,
                fontFamily:"'Space Grotesk',system-ui"}}>{p.home} vs {p.away}</div>
              <div style={{color:Q.muted,fontSize:11,marginBottom:4}}>{p.selection}</div>
              <div style={{display:"flex",gap:12,fontSize:12,marginBottom:6,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {p.odd_original&&<span style={{color:Q.dim}}>Origen {fmt(p.odd_original)}</span>}
                {p.odd_nuestra?(
                  <span style={{color:Q.green}}>Nuestra {fmt(p.odd_nuestra)}
                    {p.odd_ajustada!==p.odd_nuestra?` → ${fmt(p.odd_ajustada)}`:""}</span>
                ):<span style={{color:Q.red}}>No disponible</span>}
              </div>
              <button onClick={()=>setCorrigiendo(corrigiendo===i?null:i)} style={{
                background:corrigiendo===i?`${Q.cyan}22`:"transparent",
                border:`1px solid ${corrigiendo===i?Q.cyan:Q.dim}`,borderRadius:8,
                padding:"5px 10px",cursor:"pointer",color:corrigiendo===i?Q.cyan:Q.muted,
                fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                {corrigiendo===i?"✕ Cerrar":"✏️ Está mal / Corregir"}</button>
              {corrigiendo===i&&(
                <CorregirPickAdmin pick={p} adminKey={adminKey}
                  onAplicar={(nuevo)=>aplicarCorreccion(i,nuevo)}
                  onQuitar={()=>quitarPickM(i)}/>
              )}
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
                fontFamily:"'Space Grotesk',system-ui"}}>Qué cuota usar</div>
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
                fontFamily:"'Space Grotesk',system-ui"}}>Dónde publicar</div>
              <div style={{display:"flex",gap:6,marginBottom:12}}>
                {[["Box",destBox,setDestBox],["App",destApp,setDestApp],
                  ["Agencias",destAg,setDestAg]].map(([l,v,sv])=>(
                  <button key={l} onClick={()=>sv(!v)} style={{flex:1,
                    background:v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                    border:`1.5px solid ${v?Q.violet:Q.border}`,borderRadius:9,
                    padding:"9px",cursor:"pointer",color:v?Q.cyan:Q.muted,
                    fontSize:11,fontWeight:v?700:400,
                    fontFamily:"'Space Grotesk',system-ui"}}>{v?"✓ ":""}{l}</button>
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

// ═══════════════════════════════════════════════════════════════
// FICHA DE CLIENTE — ver, cargar/retirar, bloquear
// ═══════════════════════════════════════════════════════════════
function FichaCliente({ userId, adminKey, onCerrar, onCambio, onNoAutorizado }){
  const [f,setF]=useState(null);
  const [resetOpen,setResetOpen]=useState(false);
  const [err,setErr]=useState("");
  const [monto,setMonto]=useState("");
  const [detalle,setDetalle]=useState("");
  const [operando,setOperando]=useState(false);
  const [msg,setMsg]=useState("");
  const [motivo,setMotivo]=useState("");
  const [confirmBloq,setConfirmBloq]=useState(false);

  const cargar=async()=>{
    try{
      const r=await fetch(`${API}/api/admin/clientes/${userId}`,{headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setF(await r.json());
      else setErr("No se pudo cargar la ficha");
    }catch(e){ setErr("Sin conexión"); }
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[userId]);

  const mover=async(signo)=>{
    const m=parseInt(monto);
    if(!m||m<=0){ setMsg("Poné un monto"); return; }
    setOperando(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/admin/clientes/${userId}/saldo`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({monto:m*signo, detalle}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setMsg(signo>0?"✅ Crédito cargado":"✅ Retiro hecho");
      setMonto(""); setDetalle(""); cargar(); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setOperando(false);
  };

  const toggleBloqueo=async()=>{
    const bloquear=!f.bloqueado;
    if(bloquear && !confirmBloq){ setConfirmBloq(true); return; }
    setOperando(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/bloquear`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({tipo:"cliente",objetivo:userId,
          bloquear, motivo}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setConfirmBloq(false); setMotivo("");
      setMsg(bloquear?"🔒 Cliente bloqueado":"✅ Cliente desbloqueado");
      cargar(); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setOperando(false);
  };

  const estadoBet={won:{t:"Ganada",c:Q.green},ganada:{t:"Ganada",c:Q.green},
    lost:{t:"Perdida",c:Q.red},perdida:{t:"Perdida",c:Q.red},
    pending:{t:"Pendiente",c:Q.amber},pendiente:{t:"Pendiente",c:Q.amber},
    active:{t:"En juego",c:Q.cyan}};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
        borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
        maxHeight:"92vh",overflowY:"auto",padding:20,
        border:`1px solid ${Q.border}`,borderBottom:"none"}}>

        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:17,
            fontFamily:"'Space Grotesk',system-ui"}}>Ficha de cliente</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {err&&<div style={{color:Q.red,padding:12,
          fontFamily:"'Space Grotesk',system-ui"}}>{err}</div>}
        {!f&&!err&&<div style={{color:Q.muted,padding:20,textAlign:"center",
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando ficha...</div>}

        {f&&(
          <div>
            {/* Cabecera */}
            <GCard glow={f.bloqueado?Q.red:Q.violet} style={{padding:16,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start"}}>
                <div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:18,
                    fontFamily:"'Space Grotesk',system-ui"}}>{f.nombre}</div>
                  <div style={{color:Q.muted,fontSize:11,marginTop:2}}>
                    {f.agencia_nombre} ({f.agencia})
                    {f.telefono?` · ${f.telefono}`:""}</div>
                  <div style={{color:Q.dim,fontSize:10,marginTop:1}}>
                    Cliente desde {f.creado}</div>
                </div>
                {f.bloqueado&&<span style={{background:`${Q.red}22`,
                  border:`1px solid ${Q.red}`,borderRadius:20,padding:"3px 10px",
                  fontSize:10,fontWeight:700,color:Q.red,
                  fontFamily:"'Space Grotesk',system-ui"}}>🔒 BLOQUEADO</span>}
              </div>
              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${Q.dim}`,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:Q.muted,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui"}}>Saldo actual</span>
                <span style={{color:Q.green,fontWeight:900,fontSize:24,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(f.saldo)}</span>
              </div>
            </GCard>

            {/* Rendimiento */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
              <GCard style={{padding:"10px",textAlign:"center"}}>
                <div style={{color:Q.cyan,fontWeight:700,fontSize:14,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(f.rendimiento.apostado)}</div>
                <div style={{color:Q.muted,fontSize:9}}>Apostado</div>
              </GCard>
              <GCard style={{padding:"10px",textAlign:"center"}}>
                <div style={{color:Q.violet2,fontWeight:700,fontSize:14,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(f.rendimiento.ganado)}</div>
                <div style={{color:Q.muted,fontSize:9}}>Ganado</div>
              </GCard>
              <GCard style={{padding:"10px",textAlign:"center"}}>
                <div style={{color:f.rendimiento.neto_cliente>=0?Q.green:Q.red,
                  fontWeight:700,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}>
                  {ars(f.rendimiento.neto_cliente)}</div>
                <div style={{color:Q.muted,fontSize:9}}>Neto</div>
              </GCard>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:14,
              fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>
              <span style={{color:Q.green}}>{f.rendimiento.ganadas} ganadas</span>
              <span style={{color:Q.red}}>{f.rendimiento.perdidas} perdidas</span>
              <span style={{color:Q.amber}}>{f.rendimiento.pendientes} pendientes</span>
            </div>

            {/* Cargar / retirar */}
            {!f.bloqueado&&(
              <GCard style={{padding:14,marginBottom:12}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:8,
                  fontFamily:"'Space Grotesk',system-ui"}}>💰 Cargar / retirar</div>
                <input value={monto} onChange={e=>setMonto(e.target.value)}
                  placeholder="Monto ($)" inputMode="numeric"
                  style={{width:"100%",background:"rgba(255,255,255,0.05)",
                    border:`1px solid ${Q.border}`,borderRadius:9,padding:"10px 12px",
                    color:Q.text,fontSize:16,marginBottom:8,
                    fontFamily:"'Space Grotesk',system-ui"}}/>
                <input value={detalle} onChange={e=>setDetalle(e.target.value)}
                  placeholder="Detalle (opcional)"
                  style={{width:"100%",background:"rgba(255,255,255,0.05)",
                    border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
                    color:Q.text,fontSize:14,marginBottom:10,
                    fontFamily:"'Space Grotesk',system-ui"}}/>
                <div style={{display:"flex",gap:8}}>
                  <Btn label="− Retirar" onClick={()=>mover(-1)} color={Q.amber}
                    outline full disabled={operando}/>
                  <Btn label="+ Cargar" onClick={()=>mover(1)} color={Q.green}
                    full disabled={operando}/>
                </div>
              </GCard>
            )}

            {/* Bloqueo */}
            <GCard glow={f.bloqueado?Q.green:Q.red} style={{padding:14,marginBottom:12}}>
              {f.bloqueado?(
                <div>
                  <div style={{color:Q.muted,fontSize:11,marginBottom:8,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    Bloqueado por {f.bloqueado_por||"—"}
                    {f.bloqueado_motivo?` · ${f.bloqueado_motivo}`:""}</div>
                  <Btn label="Desbloquear cliente" onClick={toggleBloqueo}
                    color={Q.green} full disabled={operando}/>
                </div>
              ):confirmBloq?(
                <div>
                  <div style={{color:Q.red,fontWeight:700,fontSize:13,marginBottom:8,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    ¿Bloquear a {f.nombre}?</div>
                  <div style={{color:Q.muted,fontSize:11,marginBottom:8,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    No va a poder apostar hasta que lo desbloquees.</div>
                  <input value={motivo} onChange={e=>setMotivo(e.target.value)}
                    placeholder="Motivo del bloqueo"
                    style={{width:"100%",background:"rgba(255,255,255,0.05)",
                      border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
                      color:Q.text,fontSize:14,marginBottom:10,
                      fontFamily:"'Space Grotesk',system-ui"}}/>
                  <div style={{display:"flex",gap:8}}>
                    <Btn label="Cancelar" onClick={()=>{setConfirmBloq(false);setMotivo("");}}
                      outline color={Q.muted} full/>
                    <Btn label="Sí, bloquear" onClick={toggleBloqueo} color={Q.red}
                      full disabled={operando}/>
                  </div>
                </div>
              ):(
                <Btn label="🔒 Bloquear cliente" onClick={toggleBloqueo}
                  color={Q.red} outline full disabled={operando}/>
              )}
              <div style={{height:8}}/>
              <Btn label="🔑 Resetear contraseña" onClick={()=>setResetOpen(true)}
                color={Q.amber} outline full/>
            </GCard>

            {resetOpen&&<ResetPasswordAdmin adminKey={adminKey} userId={userId}
              nombre={f?(f.nombre_completo||f.username):"el cliente"} onCerrar={()=>setResetOpen(false)}/>}
            {msg&&<div style={{fontSize:12,marginBottom:10,textAlign:"center",
              color:msg.startsWith("✅")||msg.startsWith("🔒")?Q.green:Q.red,
              fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}

            {/* Apuestas */}
            <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:8,
              fontFamily:"'Space Grotesk',system-ui"}}>
              Últimas apuestas ({f.apuestas.length})</div>
            {f.apuestas.length===0&&<div style={{color:Q.muted,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>Todavía no apostó</div>}
            {f.apuestas.map((b,i)=>{
              const e=estadoBet[(b.status||"").toLowerCase()]||{t:b.status,c:Q.muted};
              return(
                <div key={i} style={{display:"flex",justifyContent:"space-between",
                  alignItems:"center",padding:"8px 0",
                  borderBottom:i<f.apuestas.length-1?`1px solid ${Q.dim}`:"none"}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontSize:12,fontWeight:600,
                      fontFamily:"'Space Grotesk',system-ui"}}>{b.code}</div>
                    <div style={{color:Q.muted,fontSize:10}}>
                      {ars(b.stake)} · {fmt(b.odd)}x · {b.fecha}</div>
                  </div>
                  <span style={{background:`${e.c}22`,border:`1px solid ${e.c}`,
                    borderRadius:20,padding:"2px 8px",fontSize:9,fontWeight:700,
                    color:e.c,flexShrink:0,
                    fontFamily:"'Space Grotesk',system-ui"}}>{e.t}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TabClientes({ adminKey, onNoAutorizado }){
  const [clientes,setClientes]=useState(null);
  const [sel,setSel]=useState(null);   // cliente abierto en ficha
  const [ags,setAgs]=useState([]);
  const [filtroAg,setFiltroAg]=useState("");
  const [buscar,setBuscar]=useState("");
  const [creando,setCreando]=useState(false);
  const [nombre,setNombre]=useState("");
  const [agNueva,setAgNueva]=useState("");
  const [tel,setTel]=useState("");
  const [msg,setMsg]=useState("");

  const cargarAgs=async()=>{
    try{
      const r=await fetch(`${API}/api/admin/arbol`,{headers:adminHeaders(adminKey)});
      if(r.ok) setAgs((await r.json()).agencias||[]);
    }catch(e){}
  };
  const cargar=async()=>{
    try{
      const q=new URLSearchParams();
      if(filtroAg) q.set("agencia",filtroAg);
      if(buscar) q.set("buscar",buscar);
      const r=await fetch(`${API}/api/admin/clientes?${q}`,{headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setClientes((await r.json()).clientes||[]);
    }catch(e){ setClientes([]); }
  };
  useEffect(()=>{ cargarAgs(); // eslint-disable-next-line
  },[]);
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[filtroAg]);

  const crear=async()=>{
    if(!nombre.trim()||!agNueva){ setMsg("Poné nombre y agencia"); return; }
    setCreando(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/admin/clientes`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({nombre,agencia:agNueva,telefono:tel}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("✅ Cliente creado");
      setNombre(""); setTel(""); cargar();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setCreando(false);
  };

  return(
    <div>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:12,
        fontFamily:"'Space Grotesk',system-ui"}}>👤 Clientes</div>

      {/* Crear cliente */}
      <GCard style={{padding:14,marginBottom:14,
        background:`linear-gradient(135deg,${Q.violet}10,${Q.cyan}06)`}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>Nuevo cliente</div>
        <input value={nombre} onChange={e=>setNombre(e.target.value)}
          placeholder="Nombre del cliente"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
            color:Q.text,fontSize:16,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <input value={tel} onChange={e=>setTel(e.target.value)}
          placeholder="Teléfono (opcional)"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
            color:Q.text,fontSize:16,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <select value={agNueva} onChange={e=>setAgNueva(e.target.value)}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"10px 12px",
            color:agNueva?Q.text:Q.muted,fontSize:15,marginBottom:10,
            fontFamily:"'Space Grotesk',system-ui"}}>
          <option value="">Ubicar en agencia...</option>
          {ags.map(a=>(
            <option key={a.code} value={a.code}>
              {"— ".repeat(a.nivel||0)}{a.name} ({a.code})</option>
          ))}
        </select>
        <Btn label={creando?"CREANDO...":"Crear cliente"} onClick={crear}
          color={Q.violet} full disabled={creando}/>
        {msg&&<div style={{fontSize:12,marginTop:8,
          color:msg.startsWith("✅")?Q.green:Q.red,
          fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
      </GCard>

      {/* Filtros */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <select value={filtroAg} onChange={e=>setFiltroAg(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
            color:Q.text,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}>
          <option value="">Todas las agencias</option>
          {ags.map(a=>(
            <option key={a.code} value={a.code}>{a.name} ({a.code})</option>
          ))}
        </select>
        <button onClick={cargar} style={{background:`${Q.violet}33`,
          border:`1px solid ${Q.violet}`,borderRadius:9,padding:"0 16px",
          cursor:"pointer",color:Q.cyan,fontSize:13,fontWeight:700,
          fontFamily:"'Space Grotesk',system-ui"}}>🔍</button>
      </div>

      {clientes===null&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
      {clientes&&clientes.length===0&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{fontSize:26,marginBottom:8}}>👤</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>Sin clientes</div>
        </GCard>
      )}
      {(clientes||[]).map(c=>(
        <GCard key={c.id} style={{padding:"11px 13px",marginBottom:7,cursor:"pointer"}}
          onClick={()=>setSel(c.id)}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",gap:8}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{color:Q.text,fontWeight:600,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre}
                {c.bloqueado&&<span style={{color:Q.red,fontSize:10,marginLeft:6}}>🔒 bloqueado</span>}
              </div>
              <div style={{color:Q.muted,fontSize:10}}>
                {c.agencia_nombre} ({c.agencia}) · {c.fecha}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              <div style={{color:Q.green,fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui"}}>{ars(c.balance)}</div>
              <span style={{color:Q.muted,fontSize:16}}>›</span>
            </div>
          </div>
        </GCard>
      ))}

      {sel&&<FichaCliente userId={sel} adminKey={adminKey}
        onCerrar={()=>setSel(null)} onCambio={cargar}
        onNoAutorizado={onNoAutorizado}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB ÁRBOL — estructura jerárquica de agencias
// ═══════════════════════════════════════════════════════════════
function TabArbol({ adminKey, onNoAutorizado }){
  const [ags,setAgs]=useState(null);
  const [err,setErr]=useState("");

  useEffect(()=>{ (async()=>{
    try{
      const r=await fetch(`${API}/api/admin/arbol`,{headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setAgs((await r.json()).agencias||[]);
    }catch(e){ setErr("Sin conexión"); }
  })(); // eslint-disable-next-line
  },[]);

  if(err) return <div style={{color:Q.red,padding:20,textAlign:"center",
    fontFamily:"'Space Grotesk',system-ui"}}>{err}</div>;
  if(!ags) return <div style={{color:Q.muted,padding:20,textAlign:"center",
    fontFamily:"'Space Grotesk',system-ui"}}>Cargando árbol...</div>;

  return(
    <div>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:4,
        fontFamily:"'Space Grotesk',system-ui"}}>🌲 Árbol de agencias</div>
      <div style={{color:Q.muted,fontSize:11,marginBottom:14,
        fontFamily:"'Space Grotesk',system-ui"}}>
        {ags.length} agencias en total. La sangría muestra la jerarquía.
      </div>

      {ags.length===0&&<GCard style={{padding:24,textAlign:"center"}}>
        <div style={{color:Q.muted,fontSize:13,
          fontFamily:"'Space Grotesk',system-ui"}}>No hay agencias</div>
      </GCard>}

      {ags.map(a=>(
        <div key={a.code} style={{marginLeft:(a.nivel||0)*16,marginBottom:6}}>
          <GCard style={{padding:"11px 13px",
            borderLeft:`3px solid ${["#00F0FF","#7C3AED","#00FF88","#FFB800","#FF0080"][(a.nivel||0)%5]}`}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"flex-start",gap:8}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {a.nivel>0?"└ ":""}{a.name}</div>
                <div style={{color:Q.muted,fontSize:10,marginTop:1}}>
                  {a.code} · {a.moneda} · nivel {a.nivel}
                  {a.parent_code
                    ? ` · cuelga de ${(ags.find(x=>x.code===a.parent_code)||{}).name||a.parent_code}`
                    : " · raíz"}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{color:Q.cyan,fontSize:11,fontWeight:700,
                  fontFamily:"'Space Grotesk',system-ui"}}>GGR {fmt(a.pct_ggr)}%</div>
                <div style={{color:Q.violet2,fontSize:11,
                  fontFamily:"'Space Grotesk',system-ui"}}>Ventas {fmt(a.pct_ventas)}%</div>
                <div style={{color:(a.saldo_cc||0)>=0?Q.green:Q.red,fontSize:11,
                  fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                  CC {ars(a.saldo_cc)}</div>
              </div>
            </div>
          </GCard>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB EVENTOS — partidos con cuotas (prematch / en vivo)
// ═══════════════════════════════════════════════════════════════
function TabEventos({ adminKey, onNoAutorizado }){
  const [tipo,setTipo]=useState("prematch");
  const [data,setData]=useState(null);
  const [cargando,setCargando]=useState(true);

  const cargar=async(t)=>{
    setCargando(true);
    try{
      const r=await fetch(`${API}/api/admin/eventos?tipo=${t}`,{headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setData((await r.json()).deportes||[]);
    }catch(e){ setData([]); }
    setCargando(false);
  };
  useEffect(()=>{ cargar(tipo); // eslint-disable-next-line
  },[tipo]);

  return(
    <div>
      <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>📅 Eventos con cuotas</div>

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={()=>setTipo("prematch")} style={{flex:1,
          background:tipo==="prematch"?`${Q.violet}33`:"rgba(255,255,255,0.04)",
          border:`1.5px solid ${tipo==="prematch"?Q.violet:Q.border}`,borderRadius:10,
          padding:"10px",cursor:"pointer",color:tipo==="prematch"?Q.cyan:Q.muted,
          fontSize:13,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
          Prematch</button>
        <button onClick={()=>setTipo("live")} style={{flex:1,
          background:tipo==="live"?`${Q.pink}33`:"rgba(255,255,255,0.04)",
          border:`1.5px solid ${tipo==="live"?Q.pink:Q.border}`,borderRadius:10,
          padding:"10px",cursor:"pointer",color:tipo==="live"?Q.pink:Q.muted,
          fontSize:13,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
          🔴 En vivo</button>
      </div>

      {cargando&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando cuotas...</div>}
      {data&&data.length===0&&!cargando&&(
        <GCard style={{padding:24,textAlign:"center"}}>
          <div style={{fontSize:26,marginBottom:8}}>📭</div>
          <div style={{color:Q.muted,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}>No hay eventos ahora</div>
        </GCard>
      )}

      {(data||[]).map((d,di)=>(
        <div key={di} style={{marginBottom:16}}>
          <div style={{color:Q.violet2,fontWeight:700,fontSize:13,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}>{d.icon} {d.liga}</div>
          {d.eventos.map((ev,ei)=>(
            <GCard key={ei} style={{padding:"10px 12px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{minWidth:0,flex:1,color:Q.text,fontSize:12,fontWeight:600,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ev.home} vs {ev.away}</div>
                <div style={{color:Q.muted,fontSize:10,flexShrink:0}}>
                  {ev.minute||ev.time}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                {[["1",ev.L],["X",ev.E],["2",ev.V]].map(([l,v])=>(
                  <div key={l} style={{flex:1,textAlign:"center",
                    background:"rgba(255,255,255,0.04)",borderRadius:7,padding:"6px 2px"}}>
                    <div style={{color:Q.muted,fontSize:9}}>{l}</div>
                    <div style={{color:v?Q.cyan:Q.dim,fontWeight:700,fontSize:13,
                      fontFamily:"'Space Grotesk',system-ui"}}>{v?fmt(v):"—"}</div>
                  </div>
                ))}
              </div>
            </GCard>
          ))}
        </div>
      ))}
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
// ═══════════════════════════════════════════════════════════════
// HISTORIAL DE BLOQUEOS (modal)
// ═══════════════════════════════════════════════════════════════
function HistorialImpresiones({ adminKey, onCerrar, onNoAutorizado }){
  const [data,setData]=useState(null);
  useEffect(()=>{
    fetch(`${API}/api/admin/historial/impresiones`,{headers:adminHeaders(adminKey)})
      .then(r=>{ if(r.status===401){ onNoAutorizado(); return {impresiones:[]}; } return r.json(); })
      .then(d=>setData(d.impresiones||[])).catch(()=>setData([]));
  // eslint-disable-next-line
  },[]);
  const tipoTxt={ticket:"Ticket",apuesta:"Apuesta",cobro:"Cobro",cierre:"Cierre de caja",combo:"Combo"};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",
      zIndex:210,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
        borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
        maxHeight:"88vh",overflowY:"auto",padding:20,
        border:`1px solid ${Q.border}`,borderBottom:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}>🖨️ Historial de impresiones</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {!data&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {data&&data.length===0&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Todavía no hubo impresiones</div>}
        {(data||[]).map((im,i)=>(
          <GCard key={i} style={{padding:"10px 13px",marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:12,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {tipoTxt[im.tipo]||im.tipo}
                  {im.referencia?<span style={{color:Q.cyan,fontWeight:400}}> · {im.referencia}</span>:null}</div>
                <div style={{color:Q.muted,fontSize:10}}>
                  {im.agencia} · por {im.quien} · {im.fecha}</div>
              </div>
              <span style={{fontSize:16}}>🖨️</span>
            </div>
          </GCard>
        ))}
      </div>
    </div>
  );
}

function HistorialBloqueos({ adminKey, onCerrar, onNoAutorizado }){
  const [data,setData]=useState(null);

  useEffect(()=>{
    fetch(`${API}/api/admin/bloqueos`,{headers:adminHeaders(adminKey)})
      .then(r=>{ if(r.status===401){ onNoAutorizado(); return {bloqueos:[]}; } return r.json(); })
      .then(d=>setData(d.bloqueos||[])).catch(()=>setData([]));
  // eslint-disable-next-line
  },[]);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",
      zIndex:210,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
      onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
        borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
        maxHeight:"88vh",overflowY:"auto",padding:20,
        border:`1px solid ${Q.border}`,borderBottom:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}>🔒 Historial de bloqueos</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {!data&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {data&&data.length===0&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Todavía no hubo bloqueos</div>}

        {(data||[]).map((b,i)=>{
          const esBloqueo=b.accion==="bloqueo";
          return(
            <GCard key={i} glow={esBloqueo?Q.red:Q.green}
              style={{padding:"11px 13px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",gap:8}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:esBloqueo?Q.red:Q.green,fontWeight:700,fontSize:12,
                    fontFamily:"'Space Grotesk',system-ui"}}>
                    {esBloqueo?"🔒 Bloqueó":"✅ Desbloqueó"}{" "}
                    <span style={{color:Q.text}}>{b.nombre}</span>
                    <span style={{color:Q.muted,fontWeight:400}}> ({b.tipo})</span>
                    {b.cascada&&<span style={{color:Q.amber,fontSize:9,marginLeft:5}}>EN CASCADA</span>}
                  </div>
                  <div style={{color:Q.muted,fontSize:10,marginTop:2}}>
                    por {b.quien} · {b.fecha}</div>
                  {b.motivo&&<div style={{color:Q.dim,fontSize:11,marginTop:4,
                    fontStyle:"italic",fontFamily:"'Space Grotesk',system-ui"}}>
                    "{b.motivo}"</div>}
                </div>
              </div>
            </GCard>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ÁRBOL VISUAL — organigrama navegable de agencias
// ═══════════════════════════════════════════════════════════════
function ArbolVisual({ agencias, onElegir, onCerrar }){
  // Armar el árbol: cada agencia con sus hijos
  const porCode = {};
  agencias.forEach(a=>{ porCode[a.code]={...a,hijos:[]}; });
  const raices = [];
  agencias.forEach(a=>{
    if(a.parent_code && porCode[a.parent_code])
      porCode[a.parent_code].hijos.push(porCode[a.code]);
    else
      raices.push(porCode[a.code]);
  });

  const colorNivel = (n)=>["#00F0FF","#7C3AED","#00FF88","#FFB800","#FF0080"][n%5];

  const Nodo = ({ nodo })=>(
    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
      <button onClick={()=>onElegir(nodo.code)} style={{
        background:`${colorNivel(nodo.nivel||0)}18`,
        border:`1.5px solid ${colorNivel(nodo.nivel||0)}`,
        borderRadius:10,padding:"8px 12px",cursor:"pointer",textAlign:"left",
        marginBottom:nodo.hijos.length?8:6,minWidth:150}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:12,
          fontFamily:"'Space Grotesk',system-ui"}}>{nodo.name}</div>
        <div style={{color:Q.muted,fontSize:9}}>{nodo.code} · {nodo.moneda}</div>
        <div style={{color:(nodo.saldo_cc||0)>=0?Q.green:Q.red,fontSize:11,fontWeight:700,
          fontFamily:"'Space Grotesk',system-ui"}}>{ars(nodo.saldo_cc)}</div>
      </button>
      {nodo.hijos.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:0,
          marginLeft:18,paddingLeft:16,
          borderLeft:`2px solid ${colorNivel(nodo.nivel||0)}55`}}>
          {nodo.hijos.map(h=>(
            <div key={h.code} style={{position:"relative"}}>
              <div style={{position:"absolute",left:-16,top:20,width:14,height:2,
                background:`${colorNivel(nodo.nivel||0)}55`}}/>
              <Nodo nodo={h}/>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",
      zIndex:210,display:"flex",alignItems:"flex-start",justifyContent:"center",
      padding:"40px 12px",overflowY:"auto"}} onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
        borderRadius:18,width:"100%",maxWidth:640,padding:20,
        border:`1px solid ${Q.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"center",marginBottom:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}>🌳 Árbol de agencias</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <div style={{color:Q.muted,fontSize:11,marginBottom:16,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Tocá cualquier agencia para ir a ella.</div>
        <div style={{overflowX:"auto"}}>
          {raices.map(r=>(
            <div key={r.code} style={{marginBottom:14}}>
              <Nodo nodo={r}/>
            </div>
          ))}
          {raices.length===0&&<div style={{color:Q.muted,fontSize:13,textAlign:"center",
            padding:20,fontFamily:"'Space Grotesk',system-ui"}}>No hay agencias</div>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SECCIÓN AGENCIAS (unificada: árbol + agencias + clientes)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// TAB INFLUENCERS — crear + reporte
// ═══════════════════════════════════════════════════════════════
function TabInfluencers({ adminKey, onNoAutorizado }){
  const hoy=new Date().toISOString().slice(0,10);
  const primero=new Date(); primero.setDate(1);
  const [desde,setDesde]=useState(primero.toISOString().slice(0,10));
  const [hasta,setHasta]=useState(hoy);
  const [data,setData]=useState(null);
  const [escaneos,setEscaneos]=useState(null);
  const [vista,setVista]=useState("reporte");   // reporte | escaneos
  const [showForm,setShowForm]=useState(false);
  const [sel,setSel]=useState(null);   // code del influencer abierto

  const cargar=async()=>{
    try{
      const r=await fetch(`${API}/api/admin/influencers/reporte?desde=${desde}&hasta=${hasta}`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setData(await r.json());
    }catch(e){}
  };
  const cargarEscaneos=async()=>{
    try{
      const r=await fetch(`${API}/api/admin/influencers/escaneos?desde=${desde}&hasta=${hasta}`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setEscaneos(await r.json());
    }catch(e){}
  };
  useEffect(()=>{ cargar(); if(vista==="escaneos") cargarEscaneos();
  // eslint-disable-next-line
  },[desde,hasta,vista]);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,
          fontFamily:"'Space Grotesk',system-ui"}}>🌟 Influencers</div>
        <Btn label="+ Nuevo" onClick={()=>setShowForm(s=>!s)} color={Q.violet} size="sm"/>
      </div>

      {showForm&&<CrearInfluencer adminKey={adminKey}
        onListo={()=>{setShowForm(false);cargar();}} onNoAutorizado={onNoAutorizado}/>}

      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["reporte","🌟 Reporte"],["escaneos","📸 Escaneos"]].map(([k,l])=>(
          <button key={k} onClick={()=>setVista(k)} style={{flex:1,
            background:vista===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1px solid ${vista===k?Q.violet:Q.border}`,borderRadius:9,
            padding:"9px",cursor:"pointer",color:vista===k?Q.cyan:Q.muted,
            fontSize:12,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px 10px",color:Q.text,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <span style={{color:Q.muted}}>→</span>
        <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
          style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"8px 10px",color:Q.text,fontSize:13,
            fontFamily:"'Space Grotesk',system-ui"}}/>
      </div>

      {vista==="reporte"&&!data&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}

      {vista==="reporte"&&data&&(
        <div>
          <GCard glow={Q.violet} style={{padding:14,marginBottom:12,
            background:`linear-gradient(135deg,${Q.violet}12,${Q.cyan}06)`}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {[["Ventas",data.total.ventas,Q.cyan],
                ["GGR",data.total.ggr,Q.green],
                ["Comisiones",data.total.comisiones,Q.gold]].map(([l,v,c])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{color:c,fontWeight:800,fontSize:15,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</div>
                  <div style={{color:Q.muted,fontSize:9}}>{l}</div>
                </div>
              ))}
            </div>
          </GCard>

          {data.influencers.length===0&&<div style={{color:Q.muted,fontSize:12,
            textAlign:"center",padding:20,fontFamily:"'Space Grotesk',system-ui"}}>
            No hay influencers todavía</div>}

          {data.influencers.map(inf=>(
            <GCard key={inf.code} onClick={()=>setSel(inf.code)}
              style={{padding:"11px 13px",marginBottom:6,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>{inf.name}
                    <span style={{color:Q.muted,fontWeight:400,fontSize:10}}> · {inf.codigo_ref}</span></div>
                  <div style={{color:Q.muted,fontSize:10}}>
                    {inf.combos} combos · {inf.jugadas} jugadas · GGR {fmt(inf.pct_ggr)}%/Vta {fmt(inf.pct_ventas)}%</div>
                  {inf.parent_name&&<div style={{color:Q.violet2,fontSize:10,marginTop:1}}>
                    🏢 {inf.parent_name}</div>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:Q.gold,fontWeight:700,fontSize:14,
                    fontFamily:"'Space Grotesk',system-ui"}}>{ars(inf.comision)}</div>
                  <div style={{color:Q.muted,fontSize:9}}>comisión ›</div>
                </div>
              </div>
            </GCard>
          ))}
        </div>
      )}

      {vista==="escaneos"&&<VistaEscaneos data={escaneos}/>}

      {sel&&<DetalleInfluencer code={sel} adminKey={adminKey} desde={desde} hasta={hasta}
        onCerrar={()=>setSel(null)} onNoAutorizado={onNoAutorizado}/>}
    </div>
  );
}

function VistaEscaneos({ data }){
  if(!data) return <div style={{color:Q.muted,textAlign:"center",padding:20,
    fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>;
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
        {[["Escaneos",data.total_escaneos,Q.cyan],["Jugaron",data.total_jugadas,Q.green],
          ["Conversión",data.conversion+"%",Q.gold]].map(([l,v,c])=>(
          <GCard key={l} style={{padding:"14px 8px",textAlign:"center"}}>
            <div style={{color:c,fontWeight:800,fontSize:18,
              fontFamily:"'Space Grotesk',system-ui"}}>{v}</div>
            <div style={{color:Q.muted,fontSize:9,marginTop:2}}>{l}</div>
          </GCard>
        ))}
      </div>
      {data.detalle.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
        padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Sin escaneos en el período</div>}
      {data.detalle.map(d=>(
        <GCard key={d.code} style={{padding:"11px 13px",marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{d.name}
                <span style={{color:Q.muted,fontWeight:400,fontSize:10}}> · {d.codigo_ref}</span></div>
              <div style={{color:Q.muted,fontSize:10}}>
                {d.escaneos} escaneos · {d.jugadas} jugaron · cuota prom {fmt(d.cuota_prom)}x</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{color:d.conversion>=30?Q.green:d.conversion>=10?Q.gold:Q.muted,
                fontWeight:700,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}>{d.conversion}%</div>
              <div style={{color:Q.muted,fontSize:9}}>conversión</div>
            </div>
          </div>
        </GCard>
      ))}
    </div>
  );
}

function CrearInfluencer({ adminKey, onListo, onNoAutorizado }){
  const [form,setForm]=useState({name:"",username:"",password:"",pct_ggr:"",pct_ventas:"",parent_code:"",alcance:""});
  const [ags,setAgs]=useState([]);
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);

  useEffect(()=>{
    fetch(`${API}/api/admin/arbol`,{headers:adminHeaders(adminKey)})
      .then(r=>r.ok?r.json():{agencias:[]}).then(d=>setAgs(d.agencias||[])).catch(()=>{});
  // eslint-disable-next-line
  },[]);

  const crear=async()=>{
    if(!form.name||!form.username||!form.password){ setMsg("Completá nombre, usuario y clave"); return; }
    if(form.password.length<8){ setMsg("La clave debe tener 8+ caracteres"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/influencers`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify(form),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      setMsg(`✅ Creado: ${d.code} · código ${d.codigo_ref}`);
      setTimeout(onListo,900);
    }catch(e){ setMsg("⚠️ "+e.message); setProc(false); }
  };

  return(
    <GCard glow={Q.violet} style={{padding:16,marginBottom:14}}>
      <div style={{color:Q.violet2,fontWeight:700,fontSize:14,marginBottom:12,
        fontFamily:"'Space Grotesk',system-ui"}}>🌟 Nuevo influencer</div>
      {[["name","Nombre","Juan Tips"],["username","Usuario","juantips"],
        ["password","Contraseña (8+)","••••••••"]].map(([k,l,ph])=>(
        <div key={k} style={{marginBottom:8}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>{l}</div>
          <input value={form[k]} type={k==="password"?"password":"text"}
            onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph}
            style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
              borderRadius:9,padding:"9px 12px",color:Q.text,fontSize:16,
              fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
      ))}
      <div style={{marginBottom:8}}>
        <div style={{color:Q.muted,fontSize:10,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Cuelga de (vacío = del admin)</div>
        <select value={form.parent_code} onChange={e=>setForm(f=>({...f,parent_code:e.target.value}))}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"10px 12px",color:form.parent_code?Q.text:Q.muted,fontSize:15,
            fontFamily:"'Space Grotesk',system-ui"}}>
          <option value="">— Del admin (raíz) —</option>
          {ags.map(a=>(
            <option key={a.code} value={a.code}>{"— ".repeat(a.nivel||0)}{a.name} ({a.code})</option>
          ))}
        </select>
      </div>
      <div style={{marginBottom:8}}>
        <div style={{color:Q.muted,fontSize:10,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Dónde valen sus links</div>
        <select value={form.alcance} onChange={e=>setForm(f=>({...f,alcance:e.target.value}))}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"10px 12px",color:form.alcance?Q.text:Q.muted,fontSize:15,
            fontFamily:"'Space Grotesk',system-ui"}}>
          <option value="">— Automático según agencia —</option>
          <option value="solo_agencia">Solo esa agencia</option>
          <option value="rama">Toda su rama</option>
          <option value="global">Cualquier lado + Telegram</option>
        </select>
        <div style={{color:Q.dim,fontSize:10,marginTop:4,
          fontFamily:"'Space Grotesk',system-ui"}}>
          {form.parent_code
            ?"Con agencia asignada, por defecto solo juega en esa agencia."
            :"Sin agencia (del admin), por defecto vale en todos lados."}</div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>% GGR</div>
          <input value={form.pct_ggr} onChange={e=>setForm(f=>({...f,pct_ggr:e.target.value}))}
            placeholder="10" inputMode="decimal"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
              borderRadius:9,padding:"9px 12px",color:Q.text,fontSize:16,
              fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>% Ventas</div>
          <input value={form.pct_ventas} onChange={e=>setForm(f=>({...f,pct_ventas:e.target.value}))}
            placeholder="3" inputMode="decimal"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
              borderRadius:9,padding:"9px 12px",color:Q.text,fontSize:16,
              fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
      </div>
      <Btn label={proc?"CREANDO...":"Crear influencer"} onClick={crear} color={Q.violet} full disabled={proc}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </GCard>
  );
}

function DetalleInfluencer({ code, adminKey, desde, hasta, onCerrar, onNoAutorizado }){
  const [d,setD]=useState(null);
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);
  const [resetOpen,setResetOpen]=useState(false);
  const [configOpen,setConfigOpen]=useState(false);

  const cargar=async()=>{
    try{
      const r=await fetch(`${API}/api/influencers/${code}/detalle?desde=${desde}&hasta=${hasta}`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setD(await r.json());
    }catch(e){}
  };
  useEffect(()=>{ cargar(); // eslint-disable-next-line
  },[code]);

  const liquidar=async()=>{
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/influencers/${code}/liquidar`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({desde,hasta}),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      const j=await r.json();
      setMsg(`✅ Liquidación generada · ${ars(j.comision)}`);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const rep=d&&d.reporte;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:210,
      display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onCerrar}>
      <div onClick={e=>e.stopPropagation()} style={{background:Q.deep,
        borderTopLeftRadius:20,borderTopRightRadius:20,width:"100%",maxWidth:620,
        maxHeight:"90vh",overflowY:"auto",padding:20,border:`1px solid ${Q.border}`,borderBottom:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:16,
            fontFamily:"'Space Grotesk',system-ui"}}>🌟 {rep?rep.name:code}</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:26,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {!d&&<div style={{color:Q.muted,textAlign:"center",padding:20,
          fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}
        {d&&(
          <div>
            <GCard glow={Q.gold} style={{padding:14,marginBottom:12}}>
              <div style={{color:Q.muted,fontSize:10,marginBottom:8,
                fontFamily:"'Space Grotesk',system-ui"}}>Código: {rep.codigo_ref}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                {[["Ventas",rep.apostado,Q.cyan],["GGR",rep.ggr,Q.green],
                  ["Comisión",rep.comision,Q.gold]].map(([l,v,c])=>(
                  <div key={l} style={{textAlign:"center"}}>
                    <div style={{color:c,fontWeight:800,fontSize:15,
                      fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</div>
                    <div style={{color:Q.muted,fontSize:9}}>{l}</div>
                  </div>
                ))}
              </div>
              <Btn label={proc?"...":"💵 Liquidar comisión"} onClick={liquidar}
                color={Q.gold} full disabled={proc}/>
              <div style={{height:8}}/>
              <Btn label="🔑 Resetear contraseña" onClick={()=>setResetOpen(true)}
                color={Q.amber} outline full/>
              <div style={{height:8}}/>
              <Btn label="⚙️ Configurar influencer" onClick={()=>setConfigOpen(v=>!v)}
                color={Q.violet} outline full/>
              {configOpen&&d.reporte&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${Q.dim}`}}>
                  <ConfigurarCuenta esAdmin adminKey={adminKey}
                    cuenta={{code, tipo:"influencer", name:d.reporte.name,
                      username:d.reporte.username, pct_ggr:d.reporte.pct_ggr,
                      pct_ventas:d.reporte.pct_ventas, alcance:d.reporte.alcance}}
                    onCambio={()=>{setConfigOpen(false);}}
                    onNoAutorizado={onNoAutorizado}/>
                </div>
              )}
              {msg&&<div style={{fontSize:12,marginTop:8,
                color:msg.startsWith("✅")?Q.green:Q.red,
                fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
              {resetOpen&&<ResetPasswordAdmin adminKey={adminKey} code={code}
                nombre={d.reporte?d.reporte.name:code} onCerrar={()=>setResetOpen(false)}/>}
            </GCard>

            <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
              marginBottom:8,fontFamily:"'Space Grotesk',system-ui"}}>Combos ({d.combos.length})</div>
            {d.combos.map(c=>(
              <GCard key={c.id} style={{padding:"9px 12px",marginBottom:5}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{color:Q.text,fontSize:12,fontWeight:600,
                      fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre}
                      {c.codigo&&<span style={{color:Q.cyan,fontSize:10}}> · {c.codigo}</span>}</div>
                    <div style={{color:Q.muted,fontSize:10}}>{c.fecha}</div>
                  </div>
                  <div style={{color:Q.green,fontWeight:700,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>{fmt(c.odd)}x</div>
                </div>
              </GCard>
            ))}

            <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
              margin:"12px 0 8px",fontFamily:"'Space Grotesk',system-ui"}}>Jugadas ({d.jugadas.length})</div>
            {d.jugadas.length===0&&<div style={{color:Q.muted,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>Sin jugadas en el período</div>}
            {d.jugadas.map((j,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"7px 0",
                borderBottom:i<d.jugadas.length-1?`1px solid ${Q.dim}`:"none"}}>
                <div style={{minWidth:0,flex:1}}>
                  <div style={{color:Q.text,fontSize:12,fontWeight:600,
                    fontFamily:"'Space Grotesk',system-ui"}}>{j.code}</div>
                  <div style={{color:Q.muted,fontSize:10}}>{j.cliente} · {ars(j.stake)} · {fmt(j.odd)}x · {j.fecha}</div>
                </div>
                <span style={{color:Q.muted,fontSize:11,flexShrink:0}}>{j.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabAgencias({ adminKey, onNoAutorizado }){
  const [ags,setAgs]=useState(null);
  const [sel,setSel]=useState(null);        // agencia seleccionada (code)
  const [clientes,setClientes]=useState(null);
  const [selCliente,setSelCliente]=useState(null);  // user_id de ficha
  const [showForm,setShowForm]=useState(false);
  const [showCrearCliente,setShowCrearCliente]=useState(false);
  const [showArbol,setShowArbol]=useState(false);
  const [showBloqueos,setShowBloqueos]=useState(false);
  const [showImpresiones,setShowImpresiones]=useState(false);
  const [msg,setMsg]=useState("");

  const cargarAgs=async()=>{
    try{
      const r=await fetch(`${API}/api/admin/arbol`,{headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setAgs((await r.json()).agencias||[]);
    }catch(e){ setMsg("Sin conexión"); }
  };
  const cargarClientes=async(code)=>{
    setClientes(null);
    try{
      const r=await fetch(`${API}/api/admin/clientes?agencia=${code}`,{headers:adminHeaders(adminKey)});
      if(r.ok) setClientes((await r.json()).clientes||[]);
    }catch(e){ setClientes([]); }
  };
  useEffect(()=>{ cargarAgs(); // eslint-disable-next-line
  },[]);

  const elegirAgencia=(code)=>{
    if(sel===code){ setSel(null); setClientes(null); return; }
    setSel(code); setSelCliente(null); cargarClientes(code);
  };

  const agSel = ags?.find(a=>a.code===sel);

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,
          fontFamily:"'Space Grotesk',system-ui"}}>🏢 Agencias</div>
        <div style={{display:"flex",gap:6}}>
          <Btn label="🌳 Árbol" onClick={()=>setShowArbol(true)} color={Q.cyan} size="sm"/>
          <Btn label="🔒 Bloqueos" onClick={()=>setShowBloqueos(true)} color={Q.red} size="sm"/>
          <Btn label="🖨️ Impresiones" onClick={()=>setShowImpresiones(true)} color={Q.amber} size="sm"/>
          <Btn label="+ Nueva" onClick={()=>setShowForm(s=>!s)} color={Q.violet} size="sm"/>
        </div>
      </div>

      {showForm&&<CrearAgenciaAdmin adminKey={adminKey} agencias={ags||[]}
        onListo={()=>{setShowForm(false);cargarAgs();}}
        onNoAutorizado={onNoAutorizado}/>}

      {!ags&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando árbol...</div>}

      {/* Árbol de agencias */}
      {(ags||[]).map(a=>(
        <div key={a.code} style={{marginLeft:(a.nivel||0)*14,marginBottom:6}}>
          <GCard glow={sel===a.code?Q.cyan:(a.status==="active"?undefined:Q.red)}
            onClick={()=>elegirAgencia(a.code)}
            style={{padding:"11px 13px",cursor:"pointer",
              borderLeft:`3px solid ${["#00F0FF","#7C3AED","#00FF88","#FFB800","#FF0080"][(a.nivel||0)%5]}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {a.nivel>0?"└ ":""}{a.name}
                  {a.status!=="active"&&<span style={{color:Q.red,fontSize:9,marginLeft:6}}>SUSP</span>}
                </div>
                <div style={{color:Q.muted,fontSize:10}}>
                  {a.code} · {a.moneda} · GGR {fmt(a.pct_ggr)}% · Vta {fmt(a.pct_ventas)}%</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{color:(a.saldo_cc||0)>=0?Q.green:Q.red,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(a.saldo_cc)}</div>
                <span style={{color:Q.muted,fontSize:14}}>{sel===a.code?"▾":"›"}</span>
              </div>
            </div>
          </GCard>

          {/* Panel expandido de la agencia seleccionada */}
          {sel===a.code&&(
            <div style={{marginTop:8,marginBottom:10,paddingLeft:6}}>
              <FichaAgencia agencia={agSel} adminKey={adminKey}
                onCambio={cargarAgs} onNoAutorizado={onNoAutorizado}/>

              {/* Clientes de esta agencia */}
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",margin:"12px 0 8px"}}>
                <span style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
                  letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>
                  Clientes de {a.name}</span>
                <Btn label="+ Cliente" onClick={()=>setShowCrearCliente(true)}
                  color={Q.cyan} size="sm"/>
              </div>

              {showCrearCliente&&(
                <CrearClienteAdmin adminKey={adminKey} agencia={a.code}
                  onListo={()=>{setShowCrearCliente(false);cargarClientes(a.code);}}
                  onCancel={()=>setShowCrearCliente(false)}
                  onNoAutorizado={onNoAutorizado}/>
              )}

              {clientes===null&&<div style={{color:Q.muted,fontSize:12,padding:10,
                fontFamily:"'Space Grotesk',system-ui"}}>Cargando clientes...</div>}
              {clientes&&clientes.length===0&&(
                <div style={{color:Q.muted,fontSize:12,padding:10,textAlign:"center",
                  fontFamily:"'Space Grotesk',system-ui"}}>Esta agencia no tiene clientes</div>
              )}
              {(clientes||[]).map(c=>(
                <GCard key={c.id} onClick={()=>setSelCliente(c.id)}
                  style={{padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{color:Q.text,fontWeight:600,fontSize:12,
                        fontFamily:"'Space Grotesk',system-ui"}}>{c.nombre}
                        {c.bloqueado&&<span style={{color:Q.red,fontSize:9,marginLeft:5}}>🔒</span>}
                      </div>
                      <div style={{color:Q.muted,fontSize:10}}>{c.fecha}</div>
                    </div>
                    <div style={{color:Q.green,fontWeight:700,fontSize:13,
                      fontFamily:"'Space Grotesk',system-ui"}}>{ars(c.balance)} ›</div>
                  </div>
                </GCard>
              ))}
            </div>
          )}
        </div>
      ))}

      {showBloqueos&&<HistorialBloqueos adminKey={adminKey}
        onCerrar={()=>setShowBloqueos(false)} onNoAutorizado={onNoAutorizado}/>}

      {showImpresiones&&<HistorialImpresiones adminKey={adminKey}
        onCerrar={()=>setShowImpresiones(false)} onNoAutorizado={onNoAutorizado}/>}

      {showArbol&&<ArbolVisual agencias={ags||[]}
        onElegir={(code)=>{ setShowArbol(false); elegirAgencia(code);
          setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),100); }}
        onCerrar={()=>setShowArbol(false)}/>}

      {selCliente&&<FichaCliente userId={selCliente} adminKey={adminKey}
        onCerrar={()=>setSelCliente(null)}
        onCambio={()=>sel&&cargarClientes(sel)}
        onNoAutorizado={onNoAutorizado}/>}

      {msg&&<div style={{color:Q.red,fontSize:12,marginTop:10,textAlign:"center",
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </div>
  );
}

// Ficha compacta de agencia (dentro del árbol expandido)
function ResetPasswordAdmin({ adminKey, code, userId, nombre, onCerrar }){
  const [nueva,setNueva]=useState("");
  const [repetir,setRepetir]=useState("");
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);

  const guardar=async()=>{
    if(nueva.length<8){ setMsg("La contraseña debe tener 8+ caracteres"); return; }
    if(nueva!==repetir){ setMsg("Las contraseñas no coinciden"); return; }
    setProc(true); setMsg("");
    try{
      const body = code ? {code,nueva} : {user_id:userId,nueva};
      const r=await fetch(`${API}/api/admin/reset-password`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify(body),
      });
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("✅ Contraseña reseteada. Deberá cambiarla en su próximo ingreso.");
      setTimeout(onCerrar,1200);
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:230,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onCerrar}>
      <GCard glow={Q.amber} onClick={e=>e.stopPropagation()}
        style={{padding:20,maxWidth:400,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:15,
            fontFamily:"'Space Grotesk',system-ui"}}>🔑 Resetear contraseña</div>
          <button onClick={onCerrar} style={{background:"transparent",border:"none",
            color:Q.muted,fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:12,lineHeight:1.5,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Nueva contraseña para <span style={{color:Q.cyan,fontWeight:700}}>{nombre||code||"la cuenta"}</span>.
          Deberá cambiarla en su próximo ingreso.</div>
        <input type="password" value={nueva} onChange={e=>setNueva(e.target.value)}
          placeholder="Nueva contraseña (8+)"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"11px 14px",color:Q.text,fontSize:16,marginBottom:8,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <input type="password" value={repetir} onChange={e=>setRepetir(e.target.value)}
          placeholder="Repetir contraseña"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
            borderRadius:9,padding:"11px 14px",color:Q.text,fontSize:16,marginBottom:12,
            fontFamily:"'Space Grotesk',system-ui"}}/>
        <Btn label={proc?"GUARDANDO...":"Resetear"} onClick={guardar} color={Q.amber} full disabled={proc}/>
        {msg&&<div style={{fontSize:12,marginTop:8,textAlign:"center",
          color:msg.startsWith("✅")?Q.green:Q.red,
          fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
      </GCard>
    </div>
  );
}

function ConfigurarCuenta({ cuenta, esAdmin, adminKey, token, onCambio, onNoAutorizado }){
  const esInf = cuenta.tipo==="influencer" || String(cuenta.code||"").startsWith("INF");
  const [name,setName]=useState(cuenta.name||"");
  const [address,setAddress]=useState(cuenta.address||"");
  const [phone,setPhone]=useState(cuenta.phone||"");
  const [ggr,setGgr]=useState(String(cuenta.pct_ggr??""));
  const [ventas,setVentas]=useState(String(cuenta.pct_ventas??""));
  const [alcance,setAlcance]=useState(cuenta.alcance||"");
  const [permiso,setPermiso]=useState(cuenta.permiso||"ambos");
  const [msg,setMsg]=useState(""); const [proc,setProc]=useState(false);

  const guardar=async()=>{
    setProc(true); setMsg("");
    try{
      const headers = esAdmin
        ? {"Content-Type":"application/json",...adminHeaders(adminKey)}
        : {"Content-Type":"application/json","Authorization":`Bearer ${token}`};
      const body = {name,address,phone,
        pct_ggr:parseFloat(ggr)||0, pct_ventas:parseFloat(ventas)||0};
      if(esInf&&alcance) body.alcance=alcance;
      if(!esInf) body.permiso=permiso;
      const r=await fetch(`${API}/api/cuenta/${cuenta.code}/configurar`,{
        method:"POST",headers,body:JSON.stringify(body)});
      if(r.status===401){ onNoAutorizado&&onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      let extra="";
      if(d.hijos_sobre_limite&&d.hijos_sobre_limite.length)
        extra=` ⚠️ ${d.hijos_sobre_limite.length} cuenta(s) hija(s) quedaron con % mayor al tuyo.`;
      setMsg("✅ Configuración guardada."+extra);
      onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const inpStyle={width:"100%",background:"rgba(255,255,255,0.05)",
    border:`1px solid ${Q.border}`,borderRadius:9,padding:"10px 12px",
    color:Q.text,fontSize:15,marginBottom:8,fontFamily:"'Space Grotesk',system-ui"};

  return(
    <div>
      <div style={{color:Q.muted,fontSize:10,marginBottom:4,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Usuario: <span style={{color:Q.dim}}>{cuenta.username||"—"} (no editable)</span></div>

      <div style={{color:Q.muted,fontSize:10,marginBottom:2,marginTop:8,
        fontFamily:"'Space Grotesk',system-ui"}}>Nombre</div>
      <input value={name} onChange={e=>setName(e.target.value)} style={inpStyle}/>

      {!esInf&&<>
        <div style={{color:Q.muted,fontSize:10,marginBottom:2,
          fontFamily:"'Space Grotesk',system-ui"}}>Dirección</div>
        <input value={address} onChange={e=>setAddress(e.target.value)} style={inpStyle}/>
        <div style={{color:Q.muted,fontSize:10,marginBottom:2,
          fontFamily:"'Space Grotesk',system-ui"}}>Teléfono</div>
        <input value={phone} onChange={e=>setPhone(e.target.value)} style={inpStyle}/>
      </>}

      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:2,
            fontFamily:"'Space Grotesk',system-ui"}}>% GGR</div>
          <input value={ggr} onChange={e=>setGgr(e.target.value)} inputMode="decimal" style={inpStyle}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:2,
            fontFamily:"'Space Grotesk',system-ui"}}>% Ventas</div>
          <input value={ventas} onChange={e=>setVentas(e.target.value)} inputMode="decimal" style={inpStyle}/>
        </div>
      </div>

      {!esInf&&(
        <>
          <div style={{color:Q.muted,fontSize:10,marginBottom:2,
            fontFamily:"'Space Grotesk',system-ui"}}>Permisos de la agencia</div>
          <select value={permiso} onChange={e=>setPermiso(e.target.value)}
            style={{...inpStyle,color:Q.text}}>
            <option value="solo_agencia">Solo agencia (crea clientes)</option>
            <option value="crea_agencias">+ Crear sub-agencias</option>
            <option value="crea_influencers">+ Crear influencers</option>
            <option value="ambos">Todo (sub-agencias + influencers)</option>
          </select>
        </>
      )}
      {esInf&&(
        <>
          <div style={{color:Q.muted,fontSize:10,marginBottom:2,
            fontFamily:"'Space Grotesk',system-ui"}}>Dónde valen sus links</div>
          <select value={alcance} onChange={e=>setAlcance(e.target.value)}
            style={{...inpStyle,color:alcance?Q.text:Q.muted}}>
            <option value="">— Sin cambios —</option>
            <option value="solo_agencia">Solo esa agencia</option>
            <option value="rama">Toda su rama</option>
            <option value="global">Cualquier lado + Telegram</option>
          </select>
        </>
      )}

      <div style={{color:Q.dim,fontSize:10,marginBottom:10,
        fontFamily:"'Space Grotesk',system-ui"}}>
        El % no puede superar el del padre.</div>

      <Btn label={proc?"GUARDANDO...":"💾 Guardar configuración"} onClick={guardar}
        color={Q.violet} full disabled={proc}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </div>
  );
}

function FichaAgencia({ agencia, adminKey, onCambio, onNoAutorizado }){
  const [ccMonto,setCcMonto]=useState("");
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);
  const [ver,setVer]=useState("cc");   // cc | editar | comision
  const [resetOpen,setResetOpen]=useState(false);

  const cargarCC=async(signo)=>{
    const m=parseFloat(ccMonto);
    if(!m||m<=0){ setMsg("Poné un monto"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/admin/agencias/${agencia.code}/cc`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({monto:m*signo}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("✅ Saldo actualizado"); setCcMonto(""); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  const toggleStatus=async()=>{
    const nuevo=agencia.status==="active"?"suspended":"active";
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/agencias/${agencia.code}`,{
        method:"PUT",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({status:nuevo}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok) throw new Error(`Error ${r.status}`);
      setMsg(nuevo==="active"?"✅ Reactivada":"🔒 Suspendida"); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  if(!agencia) return null;
  return(
    <GCard glow={Q.violet} style={{padding:14}}>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {[["cc","💰 Saldo"],["config","⚙️ Configurar"],["editar","Estado"]].map(([k,l])=>(
          <button key={k} onClick={()=>setVer(k)} style={{flex:1,
            background:ver===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1px solid ${ver===k?Q.violet:Q.border}`,borderRadius:8,
            padding:"7px 4px",cursor:"pointer",color:ver===k?Q.cyan:Q.muted,
            fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
        <button onClick={()=>setResetOpen(true)} style={{flex:1,
          background:`${Q.amber}18`,border:`1px solid ${Q.amber}`,borderRadius:8,
          padding:"7px 4px",cursor:"pointer",color:Q.amber,
          fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>🔑 Clave</button>
      </div>

      {ver==="cc"&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{color:Q.muted,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>Saldo actual</span>
            <span style={{color:(agencia.saldo_cc||0)>=0?Q.green:Q.red,fontWeight:900,fontSize:18,
              fontFamily:"'Space Grotesk',system-ui"}}>{ars(agencia.saldo_cc)} {agencia.moneda}</span>
          </div>
          <input value={ccMonto} onChange={e=>setCcMonto(e.target.value)}
            placeholder="Monto" inputMode="numeric"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
              color:Q.text,fontSize:16,marginBottom:8,
              fontFamily:"'Space Grotesk',system-ui"}}/>
          <div style={{display:"flex",gap:8}}>
            <Btn label="− Descontar" onClick={()=>cargarCC(-1)} color={Q.amber} outline full disabled={proc}/>
            <Btn label="+ Cargar" onClick={()=>cargarCC(1)} color={Q.green} full disabled={proc}/>
          </div>
        </div>
      )}

      {ver==="config"&&(
        <ConfigurarCuenta cuenta={agencia} esAdmin adminKey={adminKey}
          onCambio={onCambio} onNoAutorizado={onNoAutorizado}/>
      )}

      {ver==="editar"&&(
        <div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:10,
            fontFamily:"'Space Grotesk',system-ui"}}>
            Estado: <span style={{color:agencia.status==="active"?Q.green:Q.red,fontWeight:700}}>
            {agencia.status==="active"?"Activa":"Suspendida"}</span></div>
          <Btn label={agencia.status==="active"?"🔒 Suspender agencia":"✅ Reactivar"}
            onClick={toggleStatus}
            color={agencia.status==="active"?Q.red:Q.green} full disabled={proc}/>
        </div>
      )}

      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")||msg.startsWith("🔒")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
      {resetOpen&&<ResetPasswordAdmin adminKey={adminKey} code={agencia.code}
        nombre={agencia.name} onCerrar={()=>setResetOpen(false)}/>}
    </GCard>
  );
}

function ComisionAgencia({ agencia, adminKey, onCambio, onNoAutorizado }){
  const [ggr,setGgr]=useState(String(agencia.pct_ggr||0));
  const [ven,setVen]=useState(String(agencia.pct_ventas||0));
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);

  const guardar=async()=>{
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/admin/agencias/${agencia.code}/comisiones`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({pct_ggr:parseFloat(ggr),pct_ventas:parseFloat(ven)}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      setMsg("✅ Comisiones actualizadas"); onCambio&&onCambio();
    }catch(e){ setMsg("⚠️ "+e.message); }
    setProc(false);
  };

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>% GGR</div>
          <input value={ggr} onChange={e=>setGgr(e.target.value)} inputMode="decimal"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
              color:Q.text,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>% Ventas</div>
          <input value={ven} onChange={e=>setVen(e.target.value)} inputMode="decimal"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
              color:Q.text,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
      </div>
      <Btn label={proc?"GUARDANDO...":"Guardar comisiones"} onClick={guardar}
        color={Q.violet} full disabled={proc}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </div>
  );
}

function CrearClienteAdmin({ adminKey, agencia, onListo, onCancel, onNoAutorizado }){
  const [nombre,setNombre]=useState("");
  const [tel,setTel]=useState("");
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);

  const crear=async()=>{
    if(!nombre.trim()){ setMsg("Poné el nombre"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/admin/clientes`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({nombre,agencia,telefono:tel}),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      onListo();
    }catch(e){ setMsg("⚠️ "+e.message); setProc(false); }
  };

  return(
    <GCard glow={Q.cyan} style={{padding:12,marginBottom:8}}>
      {!agencia&&<div style={{color:Q.muted,fontSize:10,marginBottom:8,lineHeight:1.4,
        fontFamily:"'Space Grotesk',system-ui"}}>
        🏛️ Cliente propio del admin (sin agencia).</div>}
      <input value={nombre} onChange={e=>setNombre(e.target.value)}
        placeholder="Nombre del cliente"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
          color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}/>
      <input value={tel} onChange={e=>setTel(e.target.value)}
        placeholder="Teléfono (opcional)"
        style={{width:"100%",background:"rgba(255,255,255,0.05)",
          border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
          color:Q.text,fontSize:16,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}/>
      <div style={{display:"flex",gap:8}}>
        <Btn label="Cancelar" onClick={onCancel} outline color={Q.muted} full/>
        <Btn label={proc?"...":"Crear"} onClick={crear} color={Q.cyan} full disabled={proc}/>
      </div>
      {msg&&<div style={{color:Q.red,fontSize:12,marginTop:8,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </GCard>
  );
}

function CrearAgenciaAdmin({ adminKey, agencias, onListo, onNoAutorizado }){
  const [form,setForm]=useState({name:"",username:"",password:"",
    parent_code:"",pct_ggr:"",pct_ventas:"",moneda:"ARS",permiso:"ambos"});
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);
  const [monedas,setMonedas]=useState([]);
  useEffect(()=>{
    fetch(`${API}/api/monedas`).then(r=>r.ok?r.json():{monedas:[]})
      .then(d=>setMonedas(d.monedas||[])).catch(()=>setMonedas([]));
  },[]);

  const crear=async()=>{
    if(!form.name||!form.username||!form.password){ setMsg("Completá nombre, usuario y clave"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/agencias`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify(form),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      if(!r.ok){ const e=await r.json().catch(()=>({}));
        throw new Error(e.detail||`Error ${r.status}`); }
      const d=await r.json();
      setMsg(`✅ Creada: ${d.code}`);
      setTimeout(onListo,700);
    }catch(e){ setMsg("⚠️ "+e.message); setProc(false); }
  };

  return(
    <GCard glow={Q.violet} style={{padding:16,marginBottom:14}}>
      <div style={{color:Q.violet2,fontWeight:700,fontSize:14,marginBottom:12,
        fontFamily:"'Space Grotesk',system-ui"}}>➕ Nueva agencia</div>
      {[["name","Nombre","Agencia Norte"],["username","Usuario","norte1"],
        ["password","Contraseña","••••••••"]].map(([k,l,ph])=>(
        <div key={k} style={{marginBottom:8}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>{l}</div>
          <input value={form[k]} type={k==="password"?"password":"text"}
            onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph}
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
              color:Q.text,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
      ))}
      <div style={{marginBottom:8}}>
        <div style={{color:Q.muted,fontSize:10,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Cuelga de (vacío = raíz)</div>
        <select value={form.parent_code}
          onChange={e=>setForm(f=>({...f,parent_code:e.target.value}))}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:9,padding:"10px 12px",
            color:form.parent_code?Q.text:Q.muted,fontSize:15,
            fontFamily:"'Space Grotesk',system-ui"}}>
          <option value="">— Raíz (del admin) —</option>
          {agencias.map(a=>(
            <option key={a.code} value={a.code}>{"— ".repeat(a.nivel||0)}{a.name} ({a.code})</option>
          ))}
        </select>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>% GGR</div>
          <input value={form.pct_ggr} onChange={e=>setForm(f=>({...f,pct_ggr:e.target.value}))}
            placeholder="15" inputMode="decimal"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
              color:Q.text,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>% Ventas</div>
          <input value={form.pct_ventas} onChange={e=>setForm(f=>({...f,pct_ventas:e.target.value}))}
            placeholder="5" inputMode="decimal"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:9,padding:"9px 12px",
              color:Q.text,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}/>
        </div>
      </div>
      {!form.parent_code&&(
        <div style={{marginBottom:10}}>
          <div style={{color:Q.muted,fontSize:10,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>Moneda</div>
          <select value={form.moneda}
            onChange={e=>setForm(f=>({...f,moneda:e.target.value}))}
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:9,padding:"10px 12px",
              color:Q.text,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>
            {(monedas.length?monedas:[{codigo:"ARS",nombre:"Peso argentino"}]).map(m=>(
              <option key={m.codigo} value={m.codigo}>{m.codigo} — {m.nombre}</option>
            ))}
          </select>
        </div>
      )}
      <div style={{marginBottom:10}}>
        <div style={{color:Q.muted,fontSize:10,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Permisos de la agencia</div>
        <select value={form.permiso}
          onChange={e=>setForm(f=>({...f,permiso:e.target.value}))}
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.violet}`,borderRadius:9,padding:"10px 12px",
            color:Q.text,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>
          <option value="solo_agencia">Solo agencia (crea clientes)</option>
          <option value="crea_agencias">+ Crear sub-agencias</option>
          <option value="crea_influencers">+ Crear influencers</option>
          <option value="ambos">Todo (sub-agencias + influencers)</option>
        </select>
      </div>
      <Btn label={proc?"CREANDO...":"Crear agencia"} onClick={crear}
        color={Q.violet} full disabled={proc}/>
      {msg&&<div style={{fontSize:12,marginTop:8,
        color:msg.startsWith("✅")?Q.green:Q.red,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </GCard>
  );
}

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
function TabUsuarios({ adminKey, onNoAutorizado }){
  const [query,setQuery]=useState("");
  const [lista,setLista]=useState([]);
  const [cargando,setCargando]=useState(false);
  const [crear,setCrear]=useState(false);
  const [sel,setSel]=useState(null);   // user_id de ficha
  const [msg,setMsg]=useState("");

  const buscar=async(texto)=>{
    setCargando(true);
    try{
      const r=await fetch(`${API}/api/admin/clientes?buscar=${encodeURIComponent(texto||"")}&limite=100`,
        {headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok){ const d=await r.json(); setLista(d.clientes||d||[]); }
    }catch(e){}
    setCargando(false);
  };
  useEffect(()=>{ buscar(""); // eslint-disable-next-line
  },[]);

  if(sel) return <FichaCliente userId={sel} adminKey={adminKey}
    onCerrar={()=>{setSel(null);buscar(query);}} onCambio={()=>buscar(query)}
    onNoAutorizado={onNoAutorizado}/>;

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:16,
          fontFamily:"'Space Grotesk',system-ui"}}>👥 Clientes</div>
        <Btn label={crear?"Cancelar":"+ Nuevo cliente"} onClick={()=>setCrear(c=>!c)}
          color={Q.violet} size="sm"/>
      </div>

      {crear&&<CrearClienteAdmin adminKey={adminKey} agencia=""
        onListo={()=>{setCrear(false);buscar(query);}} onCancel={()=>setCrear(false)}
        onNoAutorizado={onNoAutorizado}/>}

      <GCard style={{padding:"10px 14px",marginBottom:12,
        display:"flex",alignItems:"center",gap:10}}>
        <span style={{color:Q.muted,fontSize:16}}>🔍</span>
        <input value={query} onChange={e=>{setQuery(e.target.value);buscar(e.target.value);}}
          placeholder="Buscar cliente por nombre..."
          style={{background:"transparent",border:"none",color:Q.text,
            fontSize:14,flex:1,fontFamily:"'Space Grotesk',system-ui"}}/>
      </GCard>

      {cargando&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Buscando...</div>}
      {!cargando&&lista.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",
        padding:20,fontFamily:"'Space Grotesk',system-ui"}}>Sin clientes</div>}
      {lista.map(u=>(
        <GCard key={u.id} onClick={()=>setSel(u.id)}
          style={{padding:"11px 13px",marginBottom:6,cursor:"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{u.nombre_completo||u.nombre||u.username}</div>
              <div style={{color:Q.muted,fontSize:10}}>
                {u.creado_por==="admin"?"🏛️ Admin":`🏢 ${u.creado_por||"—"}`}
                {u.telefono?` · ${u.telefono}`:""}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{color:(u.saldo||u.balance/100||0)>=0?Q.green:Q.red,fontWeight:700,fontSize:14,
                fontFamily:"'Space Grotesk',system-ui"}}>{ars(u.saldo!=null?u.saldo:(u.balance||0)/100)}</div>
              <div style={{color:Q.muted,fontSize:9}}>saldo ›</div>
            </div>
          </div>
        </GCard>
      ))}
      {msg&&<div style={{fontSize:12,marginTop:8,color:Q.green,
        fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB CONFIG
// ═══════════════════════════════════════════════════════════════
function TabConfig({ adminKey, onNoAutorizado }){
  const [sub,setSub]=useState("limites");
  const subs=[
    ["limites","🎚️ Límites"],
    ["bonos","🎁 Bonos"],
    ["general","⚙️ General"],
  ];
  return(
    <div>
      <div style={{color:Q.text,fontWeight:800,fontSize:18,marginBottom:4,
        fontFamily:"'Space Grotesk',system-ui"}}>⚙️ Configuración</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:14,
        fontFamily:"'Space Grotesk',system-ui"}}>Todo lo configurable del sistema en un solo lugar.</div>
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {subs.map(([k,l])=>(
          <button key={k} onClick={()=>setSub(k)} style={{
            background:sub===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
            border:`1px solid ${sub===k?Q.violet:Q.border}`,borderRadius:9,
            padding:"8px 14px",cursor:"pointer",color:sub===k?Q.violet2||Q.violet:Q.muted,
            fontSize:12,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
        ))}
      </div>
      {sub==="limites"&&<TabLimites adminKey={adminKey} onNoAutorizado={onNoAutorizado}/>}
      {sub==="bonos"&&<TabBonos adminKey={adminKey} onNoAutorizado={onNoAutorizado}/>}
      {sub==="general"&&<ConfigGeneral/>}
    </div>
  );
}

function TabBonos({ adminKey, onNoAutorizado }){
  const [bonos,setBonos]=useState([]);
  const [agencias,setAgencias]=useState([]);
  const [form,setForm]=useState({nombre:"",tipo:"bienvenida",monto_fijo:"",
    porcentaje:"",tope:"",rollover:"5"});
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);
  const [analisis,setAnalisis]=useState("");
  const [analizando,setAnalizando]=useState(false);
  const [asignar,setAsignar]=useState({bono:null,alcance:"global",code:""});

  const cargar=async()=>{
    try{
      const r=await fetch(`${API}/api/admin/bonos`,{headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setBonos((await r.json()).bonos||[]);
      const ra=await fetch(`${API}/api/admin/arbol`,{headers:adminHeaders(adminKey)});
      if(ra.ok){ const d=await ra.json();
        setAgencias((d.agencias||[]).map(a=>({code:a.code,name:a.name||a.code}))); }
    }catch(e){}
  };
  useEffect(()=>{ cargar(); /* eslint-disable-next-line */ },[]);

  const analizarRiesgo=async()=>{
    setAnalizando(true); setAnalisis("");
    try{
      const r=await fetch(`${API}/api/admin/riesgo/analizar`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify({tipo:"bono",config:form}),
      });
      const d=await r.json();
      if(r.ok) setAnalisis(d.analisis||"Sin respuesta");
      else setAnalisis("⚠️ "+(d.detail||"Error"));
    }catch(e){ setAnalisis("⚠️ Error al consultar la IA"); }
    setAnalizando(false);
  };

  const guardar=async()=>{
    if(!form.nombre.trim()){ setMsg("Poné un nombre"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/admin/bonos`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify(form),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      const d=await r.json();
      if(r.ok&&d.ok){ setMsg("✅ Bono guardado");
        setForm({nombre:"",tipo:"bienvenida",monto_fijo:"",porcentaje:"",tope:"",rollover:"5"});
        setAnalisis(""); cargar(); }
      else setMsg("⚠️ "+(d.detail||"Error"));
    }catch(e){ setMsg("⚠️ Error"); }
    setProc(false);
  };

  const toggleActivo=async(b)=>{
    await fetch(`${API}/api/admin/bonos/${b.id}/activar`,{
      method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
      body:JSON.stringify({activo:!b.activo}),
    }); cargar();
  };
  const borrar=async(id)=>{
    await fetch(`${API}/api/admin/bonos/${id}`,{method:"DELETE",headers:adminHeaders(adminKey)});
    cargar();
  };
  const hacerAsignar=async()=>{
    if(asignar.alcance!=="global"&&!asignar.code){ return; }
    await fetch(`${API}/api/admin/bonos/${asignar.bono}/asignar`,{
      method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
      body:JSON.stringify({alcance:asignar.alcance,agencia_code:asignar.code}),
    });
    setAsignar({bono:null,alcance:"global",code:""}); cargar();
  };

  const inp={width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
    borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:14,marginBottom:8,
    fontFamily:"'Space Grotesk',system-ui"};

  return(
    <div>
      <GCard glow={Q.violet} style={{padding:16,marginBottom:16}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:10,
          fontFamily:"'Space Grotesk',system-ui"}}>🎁 Nuevo bono</div>
        <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}
          placeholder="Nombre del bono" style={inp}/>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {[["bienvenida","🎉 Bienvenida"],["carga","💵 Por carga"]].map(([k,l])=>(
            <button key={k} onClick={()=>setForm(f=>({...f,tipo:k}))} style={{flex:1,
              background:form.tipo===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
              border:`1px solid ${form.tipo===k?Q.violet:Q.border}`,borderRadius:9,
              padding:"9px 4px",cursor:"pointer",color:form.tipo===k?Q.violet2||Q.violet:Q.muted,
              fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
          ))}
        </div>
        {form.tipo==="bienvenida"?(
          <>
            <div style={{color:Q.muted,fontSize:11,marginBottom:4,
              fontFamily:"'Space Grotesk',system-ui"}}>Monto fijo del bono</div>
            <input value={form.monto_fijo} onChange={e=>setForm(f=>({...f,monto_fijo:e.target.value.replace(/\D/g,"")}))}
              placeholder="Ej: 1000" inputMode="numeric" style={inp}/>
          </>
        ):(
          <>
            <div style={{color:Q.muted,fontSize:11,marginBottom:4,
              fontFamily:"'Space Grotesk',system-ui"}}>Porcentaje sobre la carga (%)</div>
            <input value={form.porcentaje} onChange={e=>setForm(f=>({...f,porcentaje:e.target.value}))}
              placeholder="Ej: 20" inputMode="decimal" style={inp}/>
            <div style={{color:Q.muted,fontSize:11,marginBottom:4,
              fontFamily:"'Space Grotesk',system-ui"}}>Tope del bono (máximo)</div>
            <input value={form.tope} onChange={e=>setForm(f=>({...f,tope:e.target.value.replace(/\D/g,"")}))}
              placeholder="Ej: 5000" inputMode="numeric" style={inp}/>
          </>
        )}
        <div style={{color:Q.muted,fontSize:11,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Rollover (veces a apostar antes de retirar)</div>
        <input value={form.rollover} onChange={e=>setForm(f=>({...f,rollover:e.target.value}))}
          placeholder="Ej: 5" inputMode="decimal" style={inp}/>

        <button onClick={analizarRiesgo} disabled={analizando} style={{width:"100%",
          background:`${Q.cyan}18`,border:`1px solid ${Q.cyan}`,borderRadius:9,padding:"10px",
          color:Q.cyan,fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>
          {analizando?"Analizando...":"🤖 Analizar riesgo con IA"}</button>
        {analisis&&(
          <div style={{background:`${Q.cyan}0C`,border:`1px solid ${Q.cyan}44`,borderRadius:10,
            padding:"12px",marginBottom:10,color:Q.text,fontSize:12,lineHeight:1.6,
            whiteSpace:"pre-wrap",fontFamily:"'Space Grotesk',system-ui"}}>{analisis}</div>
        )}
        <button onClick={guardar} disabled={proc} style={{width:"100%",
          background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,border:"none",
          borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:14,
          cursor:"pointer",fontFamily:"'Space Grotesk',system-ui"}}>
          {proc?"Guardando...":"Guardar bono"}</button>
        {msg&&<div style={{fontSize:12,marginTop:8,textAlign:"center",
          color:msg.startsWith("✅")?Q.green:Q.red,
          fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
      </GCard>

      <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
        marginBottom:8,marginLeft:4,fontFamily:"'Space Grotesk',system-ui"}}>Bonos creados</div>
      {bonos.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:16,
        fontFamily:"'Space Grotesk',system-ui"}}>Sin bonos todavía</div>}
      {bonos.map(b=>(
        <GCard key={b.id} style={{padding:"12px 14px",marginBottom:8,
          opacity:b.activo?1:0.55}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{b.nombre}
                <span style={{color:Q.muted,fontWeight:400,fontSize:11}}> · {b.tipo}</span></div>
              <div style={{color:Q.muted,fontSize:10,fontFamily:"'Space Grotesk',system-ui"}}>
                {b.tipo==="bienvenida"?`${ars(b.monto_fijo||0)}`:`${b.porcentaje||0}% (máx ${ars(b.tope||0)})`}
                {" · rollover x"+(b.rollover||0)}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>toggleActivo(b)} style={{background:"transparent",
                border:`1px solid ${b.activo?Q.green:Q.muted}`,borderRadius:8,padding:"5px 9px",
                color:b.activo?Q.green:Q.muted,fontSize:10,cursor:"pointer"}}>
                {b.activo?"Activo":"Inactivo"}</button>
              <button onClick={()=>borrar(b.id)} style={{background:"transparent",
                border:`1px solid ${Q.red}55`,borderRadius:8,padding:"5px 9px",
                color:Q.red,fontSize:10,cursor:"pointer"}}>✕</button>
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
            {(b.asignaciones||[]).map((a,i)=>(
              <span key={i} style={{background:`${Q.violet}18`,border:`1px solid ${Q.violet}44`,
                borderRadius:8,padding:"2px 8px",color:Q.violet2||Q.violet,fontSize:10,
                fontFamily:"'Space Grotesk',system-ui"}}>{a.agencia_code}</span>
            ))}
            {(b.asignaciones||[]).length===0&&<span style={{color:Q.dim,fontSize:10,
              fontFamily:"'Space Grotesk',system-ui"}}>Sin asignar</span>}
          </div>
          {asignar.bono===b.id?(
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:9,padding:10}}>
              <div style={{display:"flex",gap:6,marginBottom:6}}>
                {[["global","Red"],["rama","Rama"],["agencia","Agencia"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setAsignar(a=>({...a,alcance:k}))} style={{flex:1,
                    background:asignar.alcance===k?`${Q.cyan}22`:"rgba(255,255,255,0.04)",
                    border:`1px solid ${asignar.alcance===k?Q.cyan:Q.border}`,borderRadius:8,
                    padding:"6px 4px",cursor:"pointer",color:asignar.alcance===k?Q.cyan:Q.muted,
                    fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
                ))}
              </div>
              {asignar.alcance!=="global"&&(
                <select value={asignar.code} onChange={e=>setAsignar(a=>({...a,code:e.target.value}))}
                  style={{...inp,marginBottom:6}}>
                  <option value="">Elegí agencia</option>
                  {agencias.map(a=>(<option key={a.code} value={a.code}>{a.code} · {a.name}</option>))}
                </select>
              )}
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setAsignar({bono:null,alcance:"global",code:""})}
                  style={{flex:1,background:"transparent",border:`1px solid ${Q.border}`,
                    borderRadius:8,padding:"7px",color:Q.muted,fontSize:11,cursor:"pointer"}}>Cancelar</button>
                <button onClick={hacerAsignar}
                  style={{flex:1,background:`${Q.cyan}33`,border:`1px solid ${Q.cyan}`,
                    borderRadius:8,padding:"7px",color:Q.cyan,fontSize:11,fontWeight:700,cursor:"pointer"}}>Asignar</button>
              </div>
            </div>
          ):(
            <button onClick={()=>setAsignar({bono:b.id,alcance:"global",code:""})}
              style={{width:"100%",background:"transparent",border:`1px solid ${Q.border}`,
                borderRadius:8,padding:"7px",color:Q.muted,fontSize:11,cursor:"pointer",
                fontFamily:"'Space Grotesk',system-ui"}}>+ Asignar a agencias</button>
          )}
        </GCard>
      ))}
    </div>
  );
}

function ConfigGeneral(){
  return(
    <div style={{color:Q.muted,fontSize:13,textAlign:"center",padding:30,
      fontFamily:"'Space Grotesk',system-ui"}}>
      <div style={{fontSize:32,marginBottom:8}}>⚙️</div>
      Próximamente: tipo de cambio, mantenimiento y otros ajustes generales.
    </div>
  );
}
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
  {k:"cierre",   i:"📊", l:"Cierre"},
  {k:"combos",   i:"⚡", l:"Combos"},
  {k:"agencias", i:"🏢", l:"Agencias"},
  {k:"influencers", i:"🌟", l:"Influencers"},
  {k:"eventos",  i:"📅", l:"Eventos"},
  {k:"billetera",i:"💰", l:"Billetera"},
  {k:"usuarios", i:"👥", l:"Usuarios"},
  {k:"config",   i:"⚙️", l:"Config"},
  {k:"diag",     i:"🩺", l:"Diag"},
];

function TabLimites({ adminKey, onNoAutorizado }){
  const [limites,setLimites]=useState([]);
  const [agencias,setAgencias]=useState([]);
  const [form,setForm]=useState({alcance:"global",agencia_code:"",
    monto_min:"",monto_max:"",pago_max:""});
  const [msg,setMsg]=useState("");
  const [proc,setProc]=useState(false);

  const cargar=async()=>{
    try{
      const r=await fetch(`${API}/api/admin/limites`,{headers:adminHeaders(adminKey)});
      if(r.status===401){ onNoAutorizado(); return; }
      if(r.ok) setLimites((await r.json()).limites||[]);
      const ra=await fetch(`${API}/api/admin/arbol`,{headers:adminHeaders(adminKey)});
      if(ra.ok){ const d=await ra.json();
        const lista=(d.agencias||[]).map(a=>({code:a.code,name:a.name||a.code}));
        setAgencias(lista);
      }
    }catch(e){}
  };
  useEffect(()=>{ cargar(); /* eslint-disable-next-line */ },[]);

  const guardar=async()=>{
    if(form.alcance!=="global"&&!form.agencia_code){ setMsg("Elegí una agencia"); return; }
    setProc(true); setMsg("");
    try{
      const r=await fetch(`${API}/api/admin/limites`,{
        method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(adminKey)},
        body:JSON.stringify(form),
      });
      if(r.status===401){ onNoAutorizado(); return; }
      const d=await r.json();
      if(r.ok&&d.ok){ setMsg(`✅ Guardado${d.aplicado_a?` (${d.aplicado_a} agencias)`:""}`);
        setForm(f=>({...f,monto_min:"",monto_max:"",pago_max:""})); cargar(); }
      else setMsg("⚠️ "+(d.detail||"Error"));
    }catch(e){ setMsg("⚠️ Error"); }
    setProc(false);
  };

  const borrar=async(id)=>{
    try{
      await fetch(`${API}/api/admin/limites/${id}`,{method:"DELETE",headers:adminHeaders(adminKey)});
      cargar();
    }catch(e){}
  };

  const inp={width:"100%",background:"rgba(255,255,255,0.05)",border:`1px solid ${Q.border}`,
    borderRadius:9,padding:"10px 12px",color:Q.text,fontSize:14,marginBottom:8,
    fontFamily:"'Space Grotesk',system-ui"};

  return(
    <div>
      <div style={{color:Q.text,fontWeight:800,fontSize:17,marginBottom:4,
        fontFamily:"'Space Grotesk',system-ui"}}>🎚️ Límites de apuestas</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:16,
        fontFamily:"'Space Grotesk',system-ui"}}>
        Monto mínimo, máximo y pago máximo. Aplicá a toda la red, a una rama
        (agencia + descendientes) o a una agencia sola.</div>

      <GCard glow={Q.violet} style={{padding:16,marginBottom:16}}>
        <div style={{color:Q.muted,fontSize:11,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Alcance</div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {[["global","🌐 Toda la red"],["rama","🌿 Una rama"],["agencia","🏢 Una agencia"]].map(([k,l])=>(
            <button key={k} onClick={()=>setForm(f=>({...f,alcance:k}))} style={{flex:1,
              background:form.alcance===k?`${Q.violet}33`:"rgba(255,255,255,0.04)",
              border:`1px solid ${form.alcance===k?Q.violet:Q.border}`,borderRadius:9,
              padding:"9px 4px",cursor:"pointer",color:form.alcance===k?Q.violet2||Q.violet:Q.muted,
              fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{l}</button>
          ))}
        </div>
        {form.alcance!=="global"&&(
          <select value={form.agencia_code} onChange={e=>setForm(f=>({...f,agencia_code:e.target.value}))}
            style={inp}>
            <option value="">Elegí la agencia{form.alcance==="rama"?" (raíz de la rama)":""}</option>
            {agencias.map(a=>(<option key={a.code} value={a.code}>{a.code} · {a.name}</option>))}
          </select>
        )}
        <div style={{color:Q.muted,fontSize:11,marginBottom:4,marginTop:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Monto mínimo por apuesta</div>
        <input value={form.monto_min} onChange={e=>setForm(f=>({...f,monto_min:e.target.value.replace(/\D/g,"")}))}
          placeholder="Ej: 100" inputMode="numeric" style={inp}/>
        <div style={{color:Q.muted,fontSize:11,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Monto máximo por apuesta</div>
        <input value={form.monto_max} onChange={e=>setForm(f=>({...f,monto_max:e.target.value.replace(/\D/g,"")}))}
          placeholder="Ej: 500000" inputMode="numeric" style={inp}/>
        <div style={{color:Q.muted,fontSize:11,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Pago máximo por apuesta</div>
        <input value={form.pago_max} onChange={e=>setForm(f=>({...f,pago_max:e.target.value.replace(/\D/g,"")}))}
          placeholder="Ej: 5000000" inputMode="numeric" style={inp}/>
        <button onClick={guardar} disabled={proc} style={{width:"100%",marginTop:6,
          background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,border:"none",
          borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:14,
          cursor:"pointer",fontFamily:"'Space Grotesk',system-ui"}}>
          {proc?"Guardando...":"Guardar límite"}</button>
        {msg&&<div style={{fontSize:12,marginTop:8,textAlign:"center",
          color:msg.startsWith("✅")?Q.green:Q.red,
          fontFamily:"'Space Grotesk',system-ui"}}>{msg}</div>}
      </GCard>

      <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",letterSpacing:1,
        marginBottom:8,marginLeft:4,fontFamily:"'Space Grotesk',system-ui"}}>Configurados</div>
      {limites.length===0&&<div style={{color:Q.muted,fontSize:12,textAlign:"center",padding:16,
        fontFamily:"'Space Grotesk',system-ui"}}>Sin límites configurados</div>}
      {limites.map((l)=>(
        <GCard key={l.id} style={{padding:"11px 13px",marginBottom:6}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:Q.text,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {l.alcance==="global"?"🌐 Toda la red":`🏢 ${l.agencia_code}`}
                {l.agencia_nombre?` · ${l.agencia_nombre}`:""}</div>
              <div style={{color:Q.muted,fontSize:10,
                fontFamily:"'Space Grotesk',system-ui"}}>
                Min {l.monto_min!=null?ars(l.monto_min):"—"} · Max {l.monto_max!=null?ars(l.monto_max):"—"} · Pago máx {l.pago_max!=null?ars(l.pago_max):"—"}</div>
            </div>
            {l.alcance!=="global"&&(
              <button onClick={()=>borrar(l.id)} style={{background:"transparent",
                border:`1px solid ${Q.red}55`,borderRadius:8,padding:"5px 10px",
                color:Q.red,fontSize:11,cursor:"pointer"}}>Quitar</button>
            )}
          </div>
        </GCard>
      ))}
    </div>
  );
}

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
        {tab==="global"   &&<TabGlobal   adminKey={adminKey} onNoAutorizado={onLogout} onIr={setTab}/>}
        {tab==="cierre"   &&<TabCierre   adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="combos"   &&<TabCombos   adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="eventos"  &&<TabEventos  adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="agencias" &&<TabAgencias adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="influencers"&&<TabInfluencers adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="billetera"&&<TabBilletera/>}
        {tab==="usuarios" &&<TabUsuarios adminKey={adminKey} onNoAutorizado={onLogout}/>}
        {tab==="config"   &&<TabConfig   adminKey={adminKey} onNoAutorizado={onLogout}/>}
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
