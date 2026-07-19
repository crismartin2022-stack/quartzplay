import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
// QUARTZPLAY ADMIN — Panel web completo
// Gestión de agencias, usuarios, GGR, depósitos, config
// ═══════════════════════════════════════════════════════════════
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
const API  = "https://quartzplay-production.up.railway.app";

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

// Mock data
const MOCK = {
  stats:{
    users:3841, active:1247, pro:683, newToday:47,
    depHoy:4820000, retHoy:1240000,
    netwinHoy:241000, netwin30d:7240000,
    apuestasActivas:247,
  },
  agencias:[
    {code:"AGE001",name:"AgenciaSur",username:"agencia3",status:"active",
     address:null,phone:null,total_tickets:0,total_cobrado:0,last_login:null},
  ],
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

// ── LOGIN ──────────────────────────────────────────────────────
function AdminLogin({ onLogin }){
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");

  const login=()=>{
    // Admin password — cambiar en producción
    if(pass==="admin2026") onLogin();
    else setErr("Contraseña incorrecta");
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
            Contraseña admin
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
          <Btn label="INGRESAR" onClick={login} color={Q.violet} size="lg" full/>
        </GCard>
        <div style={{textAlign:"center",marginTop:14,color:Q.dim,fontSize:11,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Demo: <strong style={{color:Q.muted}}>admin2026</strong>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB DASHBOARD
// ═══════════════════════════════════════════════════════════════
function TabDash(){
  const s=MOCK.stats;
  return(
    <div>
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

      {/* Alertas pendientes */}
      {(MOCK.depositos.length+MOCK.retiros.length)>0&&(
        <GCard glow={Q.pink} style={{padding:"12px 16px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20}}>⚠️</span>
            <div>
              <div style={{color:Q.pink,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {MOCK.depositos.length+MOCK.retiros.length} transacciones pendientes
              </div>
              <div style={{color:Q.muted,fontSize:11}}>
                {MOCK.depositos.length} depósitos · {MOCK.retiros.length} retiros
              </div>
            </div>
          </div>
        </GCard>
      )}

      {/* Top usuarios */}
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

      {/* Influencers */}
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
// TAB AGENCIAS
// ═══════════════════════════════════════════════════════════════
function TabAgencias(){
  const [agencias,setAgencias]=useState(MOCK.agencias);
  const [loading,setLoading]=useState(false);
  const [form,setForm]=useState({name:"",username:"",password:"",address:"",phone:""});
  const [showForm,setShowForm]=useState(false);
  const [msg,setMsg]=useState("");
  const [selAgencia,setSelAgencia]=useState(null);
  const [editForm,setEditForm]=useState({});

  const loadAgencias=async()=>{
    setLoading(true);
    try {
      const r=await fetch(`${API}/api/agencias`);
      if(r.ok) setAgencias(await r.json());
    } catch(e){ /* usa mock */ }
    setLoading(false);
  };

  useEffect(()=>{ loadAgencias(); },[]);

  const crearAgencia=async()=>{
    if(!form.name||!form.username||!form.password){
      setMsg("Completá nombre, usuario y clave"); return;
    }
    try {
      const r=await fetch(`${API}/api/agencias`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(form),
      });
      if(r.ok){
        const data=await r.json();
        setMsg(`✅ Agencia creada: ${data.code}`);
        setForm({name:"",username:"",password:"",address:"",phone:""});
        setShowForm(false);
        loadAgencias();
      } else {
        const e=await r.json();
        setMsg(`❌ ${e.detail}`);
      }
    } catch(e){
      // Mock fallback
      const newCode=`AGE${String(agencias.length+1).zfill?String(agencias.length+1).padStart(3,"0"):agencias.length+1}`;
      setAgencias(a=>[...a,{...form,code:newCode,status:"active",
        total_tickets:0,total_cobrado:0}]);
      setMsg(`✅ Agencia creada: ${newCode}`);
      setForm({name:"",username:"",password:"",address:"",phone:""});
      setShowForm(false);
    }
  };

  const toggleStatus=async(ag)=>{
    const newStatus=ag.status==="active"?"suspended":"active";
    try {
      await fetch(`${API}/api/agencias/${ag.code}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({status:newStatus}),
      });
    } catch(e){}
    setAgencias(a=>a.map(x=>x.code===ag.code?{...x,status:newStatus}:x));
    if(selAgencia?.code===ag.code) setSelAgencia(s=>({...s,status:newStatus}));
  };

  const guardarEdit=async()=>{
    try {
      await fetch(`${API}/api/agencias/${selAgencia.code}`,{
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(editForm),
      });
    } catch(e){}
    setAgencias(a=>a.map(x=>x.code===selAgencia.code?{...x,...editForm}:x));
    setSelAgencia(s=>({...s,...editForm}));
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

        {/* Editar datos */}
        <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,
          fontFamily:"'Space Grotesk',system-ui",marginBottom:10}}>Editar datos</div>
        <Input label="Nombre" value={editForm.name||selAgencia.name}
          onChange={v=>setEditForm(f=>({...f,name:v}))}/>
        <Input label="Dirección" value={editForm.address||selAgencia.address||""}
          onChange={v=>setEditForm(f=>({...f,address:v}))} placeholder="Av. Corrientes 1234"/>
        <Input label="Teléfono" value={editForm.phone||selAgencia.phone||""}
          onChange={v=>setEditForm(f=>({...f,phone:v}))} placeholder="+54 11 ..."/>
        <Input label="Nueva clave (opcional)" value={editForm.password||""}
          onChange={v=>setEditForm(f=>({...f,password:v}))} type="password"
          placeholder="Dejar vacío para no cambiar"/>

        {msg&&<div style={{color:Q.green,fontSize:12,marginBottom:10}}>{msg}</div>}

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

      {/* Formulario nueva agencia */}
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

      {/* Lista de agencias */}
      {loading&&<div style={{color:Q.muted,textAlign:"center",padding:20,
        fontFamily:"'Space Grotesk',system-ui"}}>Cargando...</div>}

      {agencias.map((ag,i)=>(
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
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <KPI label="Depósitos hoy" value={ars(MOCK.stats.depHoy)} color={Q.green} icon="📥" trend={12}/>
        <KPI label="Retiros hoy"   value={ars(MOCK.stats.retHoy)} color={Q.amber} icon="📤"/>
      </div>

      {/* Depósitos */}
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

      {/* Retiros */}
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
  return(
    <div>
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
        {MOCK.topUsers.map((u,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,
            padding:"8px 0",borderBottom:i<4?`1px solid ${Q.dim}`:"none"}}>
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
  const [saved,setSaved]=useState(false);

  const save=()=>{ setSaved(true); setTimeout(()=>setSaved(false),2000); };

  return(
    <div>
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
          fontFamily:"'Space Grotesk',system-ui"}}>⚠️ Bot en modo mantenimiento</div>}
      </GCard>

      <button onClick={save} style={{
        width:"100%",
        background:saved?`linear-gradient(135deg,${Q.green},#009624)`:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        border:"none",borderRadius:14,padding:"16px",
        color:saved?Q.void:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",
        fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
        boxShadow:`0 6px 24px ${saved?Q.green:Q.violet}44`,transition:"all 0.3s",
      }}>
        {saved?"✅ GUARDADO":"GUARDAR CAMBIOS"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
const TABS=[
  {k:"dash",     i:"📊", l:"Dashboard"},
  {k:"agencias", i:"🏪", l:"Agencias"},
  {k:"billetera",i:"💰", l:"Billetera"},
  {k:"usuarios", i:"👥", l:"Usuarios"},
  {k:"config",   i:"⚙️", l:"Config"},
];

function AdminPanel({ onLogout }){
  const [tab,setTab]=useState("dash");
  return(
    <div style={{background:Q.void,minHeight:"100vh",
      fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>

      {/* Header */}
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

      {/* Content */}
      <div style={{padding:"16px",maxWidth:620,margin:"0 auto",
        position:"relative",zIndex:1,paddingBottom:80}}>
        {tab==="dash"     &&<TabDash/>}
        {tab==="agencias" &&<TabAgencias/>}
        {tab==="billetera"&&<TabBilletera/>}
        {tab==="usuarios" &&<TabUsuarios/>}
        {tab==="config"   &&<TabConfig/>}
      </div>

      {/* Bottom nav */}
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
  const [logged,setLogged]=useState(false);
  return(
    <div style={{background:Q.void,minHeight:"100vh"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus{outline:none} button:active{opacity:.85}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.3)}
      `}</style>
      {!logged
        ?<AdminLogin onLogin={()=>setLogged(true)}/>
        :<AdminPanel onLogout={()=>setLogged(false)}/>
      }
    </div>
  );
}
