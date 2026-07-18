import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
// QUARTZPLAY AGENCIA — Panel completo para locales físicos
// ═══════════════════════════════════════════════════════════════
const Q = {
  void:"#020208", deep:"#060612", dark:"#0A0A1E",
  glass:"linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))",
  violet:"#7C3AED", violet2:"#9F5FFF",
  cyan:"#00F0FF", green:"#00FF88",
  pink:"#FF0080", amber:"#FFB800",
  gold:"#E8C547", red:"#FF1744",
  text:"#F0F0FF", muted:"#6B7090", dim:"#2A2A4A",
  border:"rgba(124,58,237,0.25)",
};

const ars = n => "$" + Math.round(n||0).toLocaleString("es-AR");
const fmt = n => Number(n||0).toFixed(2);
const genCode = () => "QP-" + Math.floor(10000+Math.random()*90000);
const nowStr = () => new Date().toLocaleString("es-AR",{hour12:false});
const expires24 = () => { const d=new Date(); d.setHours(d.getHours()+24); return d.toLocaleString("es-AR",{hour12:false}); };

// ── API ───────────────────────────────────────────────────────
const API_URL = "https://quartzplay-production.up.railway.app";

async function fetchBetslip(code){
  try {
    const r = await fetch(`${API_URL}/api/betslip/${code}`);
    if(!r.ok) throw new Error((await r.json()).detail || "No encontrado");
    return r.json();
  } catch(e) {
    // Fallback mock para demo
    const MOCK = {
      "QP-47829":{
        code:"QP-47829", user:"@martin_ar",
        created_at:"17/07/2026 02:15", expires_at:"18/07/2026 02:15",
        status:"pending", paid_at:null,
        picks:[
          {home:"River",away:"Boca",sel:"River gana",odd:1.55,sport:"Liga AR"},
          {home:"Argentina",away:"Argelia",sel:"Argentina gana",odd:1.30,sport:"Mundial"},
          {home:"R.Madrid",away:"Bayern",sel:"R.Madrid gana",odd:2.10,sport:"Champions"},
        ],
        stake:0, odd_total:4.24, potential_win:0,
      },
      "QP-38291":{
        code:"QP-38291", user:"@apostador99",
        created_at:"17/07/2026 01:45", expires_at:"18/07/2026 01:45",
        status:"pending", paid_at:null,
        picks:[
          {home:"España",away:"C.Verde",sel:"España gana",odd:1.18,sport:"Mundial"},
          {home:"Francia",away:"Senegal",sel:"Francia gana",odd:1.45,sport:"Mundial"},
        ],
        stake:20000, odd_total:1.71, potential_win:34200,
      },
    };
    const found = MOCK[code.toUpperCase()];
    if(found) return found;
    throw new Error("Código no encontrado");
  }
}

async function payBetslip(code, stake, agentId){
  try {
    const r = await fetch(`${API_URL}/api/betslip/${code}/pay`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({stake, agent_id: agentId}),
    });
    if(!r.ok) throw new Error((await r.json()).detail || "Error al pagar");
    return r.json();
  } catch(e) {
    // Mock fallback
    return { success:true, code, stake, odd_total:4.24, potential_win:Math.round(stake*4.24) };
  }
}

// ── DESIGN ────────────────────────────────────────────────────
function GCard({ children, style={}, glow }){
  return(
    <div style={{
      background:Q.glass, backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
      border:`1px solid ${glow?glow+"44":Q.border}`,
      borderRadius:16,
      boxShadow:`0 8px 32px rgba(0,0,0,0.5)${glow?`, 0 0 24px ${glow}22`:""}`,
      position:"relative", overflow:"hidden", ...style,
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
          <linearGradient id="qglag" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={Q.violet}/>
            <stop offset="100%" stopColor={Q.cyan}/>
          </linearGradient>
        </defs>
        <polygon points="12,2 20,8 20,16 12,22 4,16 4,8" fill="none" stroke="url(#qglag)" strokeWidth={1.5}/>
        <polygon points="12,5 18,9.5 18,15 12,19 6,15 6,9.5" fill="url(#qglag)" opacity={0.3}/>
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

function Btn({ label, onClick, color=Q.violet, outline=false, size="md", full=false, disabled=false }){
  const h=size==="lg"?"50px":size==="sm"?"34px":"44px";
  const fs=size==="lg"?15:size==="sm"?11:13;
  return(
    <button onClick={onClick} disabled={disabled} style={{
      height:h, width:full?"100%":"auto",
      padding:`0 ${size==="sm"?"10px":"18px"}`,
      background:disabled?"rgba(255,255,255,0.04)":outline?"transparent":`linear-gradient(135deg,${color},${color}CC)`,
      border:`1px solid ${disabled?Q.dim:color}`,borderRadius:12,
      color:disabled?Q.muted:outline?color:"#fff",
      fontSize:fs,fontWeight:700,cursor:disabled?"not-allowed":"pointer",
      display:"flex",alignItems:"center",justifyContent:"center",gap:7,
      fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
      boxShadow:(!outline&&!disabled)?`0 4px 16px ${color}33`:"none",
    }}>{label}</button>
  );
}

// ── TICKET TÉRMICO ────────────────────────────────────────────
function printTicket(slip, tipo="apuesta"){
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm;background:white;color:black}
.c{text-align:center}.b{font-weight:bold}.lg{font-size:15px}.xl{font-size:20px}
.div{border-top:1px dashed #000;margin:5px 0}
.row{display:flex;justify-content:space-between;margin:2px 0}
.pick{margin:4px 0;padding:3px 0;border-bottom:1px dotted #aaa}
.ft{font-size:10px;text-align:center;color:#555;margin-top:4px}
</style></head><body>
<div class="c b xl">QuartzPlay</div>
<div class="c" style="font-size:10px">Agencia Oficial · ${slip.agencia||"AGE001"}</div>
<div class="div"></div>
<div class="c b lg">${tipo==="cobro"?"COMPROBANTE DE COBRO":tipo==="cierre"?"CIERRE DE CAJA":"TICKET DE APUESTA"}</div>
<div class="c b" style="font-size:18px;margin:4px 0">#${slip.code}</div>
<div class="row"><span>Usuario:</span><span>${slip.user||"—"}</span></div>
<div class="row"><span>Emitido:</span><span>${slip.created_at||nowStr()}</span></div>
<div class="row"><span>Válido hasta:</span><span>${slip.expires_at||expires24()}</span></div>
<div class="div"></div>
<div class="b c">COMBINADA (${slip.picks?.length||0} picks)</div>
<div class="div"></div>
${(slip.picks||[]).map((p,i)=>`
<div class="pick">
  <div class="b">${i+1}. ${p.home} vs ${p.away}</div>
  <div>${p.sport}</div>
  <div class="row"><span>→ ${p.sel}</span><span class="b">@${p.odd}</span></div>
</div>`).join("")}
<div class="div"></div>
<div class="row b"><span>CUOTA TOTAL:</span><span>${fmt(slip.odd_total)}x</span></div>
<div class="row b lg"><span>APOSTADO:</span><span>${ars(slip.stake)} ARS</span></div>
<div class="row b lg"><span>RETORNO POT.:</span><span>${ars(slip.potential_win)} ARS</span></div>
${tipo==="cobro"?`<div class="div"></div><div class="c b" style="font-size:16px">PAGADO: ${ars(slip.potential_win)} ARS</div>`:""}
<div class="div"></div>
<div class="c" style="font-size:40px;margin:6px 0">▓▓▓▓▓▓</div>
<div class="c b">${slip.code}</div>
<div class="div"></div>
<div class="ft">quartzplay.com · @QuartzPlayBot</div>
<div class="ft">Jugá con responsabilidad · Solo mayores de 18</div>
</body></html>`;
  const w=window.open("","_blank","width=420,height=650");
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(()=>{w.print();w.close();},600);
}

function printCierre(data, tipo, agencia){
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:4mm;background:white;color:black}
.c{text-align:center}.b{font-weight:bold}.lg{font-size:15px}.xl{font-size:18px}
.div{border-top:1px dashed #000;margin:5px 0}
.row{display:flex;justify-content:space-between;margin:3px 0}
.ft{font-size:10px;text-align:center;color:#555;margin-top:4px}
</style></head><body>
<div class="c b xl">QuartzPlay</div>
<div class="c b">CIERRE ${tipo.toUpperCase()}</div>
<div class="c">${agencia.name} · ${agencia.code}</div>
<div class="div"></div>
<div class="row"><span>Período:</span><span>${data.periodo}</span></div>
<div class="row"><span>Generado:</span><span>${nowStr()}</span></div>
<div class="div"></div>
<div class="b c">RESUMEN OPERACIONES</div>
<div class="div"></div>
<div class="row"><span>Total tickets:</span><span>${data.tickets}</span></div>
<div class="row"><span>Tickets bot:</span><span>${data.tickets_bot}</span></div>
<div class="row"><span>Tickets manual:</span><span>${data.tickets_manual}</span></div>
<div class="div"></div>
<div class="row b lg"><span>COBRADO:</span><span>${ars(data.cobrado)} ARS</span></div>
<div class="row b"><span>PAGADO (premios):</span><span>${ars(data.pagado)} ARS</span></div>
<div class="div"></div>
<div class="row b lg"><span>NETO AGENCIA:</span><span>${ars(data.neto)} ARS</span></div>
<div class="div"></div>
<div class="ft">Este comprobante es válido como cierre oficial.</div>
<div class="ft">quartzplay.com · ${agencia.code}</div>
</body></html>`;
  const w=window.open("","_blank","width=420,height=600");
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(()=>{w.print();w.close();},600);
}

// ── DEPORTES PARA APUESTA MANUAL ──────────────────────────────
const DEPORTES = [
  {sport:"Liga AR", events:[
    {home:"River",away:"Boca",odds:{L:1.55,E:3.80,V:5.20}},
    {home:"Racing",away:"Independiente",odds:{L:2.10,E:3.20,V:3.40}},
  ]},
  {sport:"Mundial", events:[
    {home:"Argentina",away:"Argelia",odds:{L:1.30,E:5.50,V:9.00}},
    {home:"España",away:"C.Verde",odds:{L:1.18,E:7.50,V:14.0}},
    {home:"Francia",away:"Senegal",odds:{L:1.45,E:4.50,V:7.00}},
    {home:"Brasil",away:"Marruecos",odds:{L:1.55,E:4.20,V:5.80}},
  ]},
  {sport:"Champions", events:[
    {home:"R.Madrid",away:"Bayern",odds:{L:2.10,E:3.40,V:3.20}},
    {home:"City",away:"Arsenal",odds:{L:1.75,E:3.60,V:4.50}},
  ]},
  {sport:"NBA", events:[
    {home:"Lakers",away:"Celtics",odds:{L:1.95,E:null,V:1.85}},
    {home:"Warriors",away:"Bulls",odds:{L:1.65,E:null,V:2.20}},
  ]},
];

// Mock historial
const MOCK_HISTORIAL = [
  {code:"QP-47829",user:"@martin_ar",stake:10000,win:42400,time:"02:15",tipo:"bot",estado:"activa"},
  {code:"QP-38291",user:"@apostador99",stake:20000,win:34200,time:"01:45",tipo:"bot",estado:"activa"},
  {code:"QP-M0012",user:"Cliente mostrador",stake:5000,win:9750,time:"01:10",tipo:"manual",estado:"activa"},
  {code:"QP-M0011",user:"Juan Pérez",stake:15000,win:22500,time:"00:30",tipo:"manual",estado:"activa"},
  {code:"QP-C0009",user:"@champion_ar",stake:8000,win:12400,time:"ayer 22:10",tipo:"cobro",estado:"cobrado"},
];

// ── LOGIN ──────────────────────────────────────────────────────
function LoginScreen({ onLogin }){
  const [user,setUser]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");

  const login=()=>{
    if(user==="agencia1"&&pass==="qp2026") onLogin({name:"Agencia Centro",code:"AGE001"});
    else if(user==="agencia2"&&pass==="qp2026") onLogin({name:"Agencia Norte",code:"AGE002"});
    else setErr("Usuario o contraseña incorrectos");
  };

  return(
    <div style={{background:Q.void,minHeight:"100vh",display:"flex",
      alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{width:"100%",maxWidth:380,position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <QPLogo size={28}/>
          <div style={{color:Q.muted,fontSize:12,marginTop:8,
            fontFamily:"'Space Grotesk',system-ui"}}>Panel de Agencia Oficial</div>
        </div>
        <GCard glow={Q.violet} style={{padding:28}}>
          {[["Usuario","text",user,setUser,"agencia1"],
            ["Contraseña","password",pass,setPass,"••••••••"]].map(([l,t,v,sv,ph])=>(
            <div key={l} style={{marginBottom:16}}>
              <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
                letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>{l}</div>
              <input type={t} value={v} onChange={e=>sv(e.target.value)} placeholder={ph}
                onKeyDown={e=>e.key==="Enter"&&login()}
                style={{width:"100%",background:"rgba(255,255,255,0.05)",
                  border:`1px solid ${Q.border}`,borderRadius:10,padding:"11px 14px",
                  color:Q.text,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}/>
            </div>
          ))}
          {err&&<div style={{color:Q.red,fontSize:12,marginBottom:10}}>{err}</div>}
          <Btn label="INGRESAR" onClick={login} color={Q.violet} size="lg" full/>
        </GCard>
        <div style={{textAlign:"center",marginTop:14,color:Q.dim,fontSize:11,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Demo: <strong style={{color:Q.muted}}>agencia1</strong> / <strong style={{color:Q.muted}}>qp2026</strong>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLUJO A+C — CÓDIGO DEL BOT
// ═══════════════════════════════════════════════════════════════
function FlujoCodigo({ agencia }){
  const [code,setCode]=useState("");
  const [slip,setSlip]=useState(null);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [step,setStep]=useState("buscar");

  const buscar=async()=>{
    setErr(""); setSlip(null); setStep("buscar"); setLoading(true);
    try {
      const found = await fetchBetslip(code);
      setSlip(found); setStep("confirmar");
    } catch(e){ setErr(e.message||"Código no encontrado."); }
    setLoading(false);
  };

  const confirmarApuesta=()=>{ setStep("done_confirmado"); };
  const pagarLocal=()=>{ setStep("pagar"); };

  const confirmarPago=async(monto)=>{
    try {
      const result = await payBetslip(slip.code, monto, agencia.code);
      setSlip(s=>({...s, stake:result.stake||monto,
        potential_win:result.potential_win||Math.round(monto*(s.odd_total||1)),
        paid_local:true}));
      setStep("done_pagado");
    } catch(e){ setErr(e.message||"Error al confirmar el pago."); }
  };

  const reset=()=>{ setCode(""); setSlip(null); setErr(""); setStep("buscar"); };

  return(
    <div>
      <GCard glow={Q.violet} style={{padding:20,marginBottom:16}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:4,
          fontFamily:"'Space Grotesk',system-ui"}}>Buscar código de apuesta</div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:14}}>
          El cliente muestra el código QP-XXXXX desde su celular o ticket
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&buscar()}
            placeholder="QP-47829"
            style={{flex:1,background:"rgba(255,255,255,0.06)",
              border:`1.5px solid ${Q.border}`,borderRadius:10,
              padding:"12px 16px",color:Q.text,fontSize:20,
              fontFamily:"'Space Grotesk',system-ui",fontWeight:700,letterSpacing:2}}/>
          <Btn label={loading?"...":"BUSCAR"} onClick={buscar}
            disabled={!code||loading} color={Q.violet}/>
        </div>
        {err&&<div style={{color:Q.red,fontSize:12,marginTop:10}}>{err}</div>}
      </GCard>

      {slip&&step==="confirmar"&&(
        <div>
          <GCard glow={Q.green} style={{padding:20,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:14}}>
              <div>
                <div style={{color:Q.green,fontWeight:900,fontSize:18,
                  fontFamily:"'Space Grotesk',system-ui"}}>{slip.code}</div>
                <div style={{color:Q.muted,fontSize:12}}>
                  {slip.user} · {slip.created_at}
                </div>
              </div>
              <div style={{background:`${Q.green}22`,border:`1px solid ${Q.green}`,
                borderRadius:20,padding:"4px 12px",color:Q.green,
                fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>
                VÁLIDO
              </div>
            </div>
            {(slip.picks||[]).map((p,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"8px 0",
                borderBottom:i<slip.picks.length-1?`1px solid ${Q.dim}`:"none"}}>
                <div>
                  <div style={{color:Q.text,fontWeight:600,fontSize:13,
                    fontFamily:"'Space Grotesk',system-ui"}}>{p.home} vs {p.away}</div>
                  <div style={{color:Q.muted,fontSize:11}}>{p.sport} · {p.sel}</div>
                </div>
                <div style={{color:Q.cyan,fontWeight:700,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>@{p.odd}</div>
              </div>
            ))}
            <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${Q.violet}44`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{color:Q.muted,fontSize:13}}>Cuota total</span>
                <span style={{color:Q.gold,fontWeight:700,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>{fmt(slip.odd_total)}x</span>
              </div>
              {slip.stake>0&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{color:Q.muted,fontSize:13}}>Apostado (online)</span>
                <span style={{color:Q.text,fontWeight:700,fontSize:15,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(slip.stake)}</span>
              </div>}
              {slip.potential_win>0&&<div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:Q.muted,fontSize:14,fontWeight:700}}>RETORNO POT.</span>
                <span style={{color:Q.green,fontWeight:900,fontSize:22,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(slip.potential_win)}</span>
              </div>}
            </div>
          </GCard>

          <GCard style={{padding:16,marginBottom:12}}>
            <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:12,
              fontFamily:"'Space Grotesk',system-ui"}}>¿Qué quiere hacer el cliente?</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={confirmarApuesta} style={{
                background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.green}`,
                borderRadius:12,padding:14,cursor:"pointer",textAlign:"left"}}>
                <div style={{color:Q.green,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui",marginBottom:3}}>
                  Confirmar apuesta y entregar ticket
                </div>
                <div style={{color:Q.muted,fontSize:12}}>
                  Ya apostó online — quiere el comprobante impreso
                </div>
              </button>
              <button onClick={pagarLocal} style={{
                background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.amber}`,
                borderRadius:12,padding:14,cursor:"pointer",textAlign:"left"}}>
                <div style={{color:Q.amber,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui",marginBottom:3}}>
                  Pagar en efectivo en el local
                </div>
                <div style={{color:Q.muted,fontSize:12}}>
                  Trajo el código pero paga en efectivo acá
                </div>
              </button>
            </div>
          </GCard>
          <Btn label="Cancelar" onClick={reset} outline color={Q.muted} full/>
        </div>
      )}

      {step==="pagar"&&slip&&(
        <PagoLocalForm slip={slip} onConfirm={confirmarPago} onCancel={reset}/>
      )}
      {step==="done_confirmado"&&slip&&(
        <DoneScreen slip={{...slip,agencia:agencia.code}}
          titulo="Apuesta confirmada" color={Q.green} tipo="apuesta" onReset={reset}/>
      )}
      {step==="done_pagado"&&slip&&(
        <DoneScreen slip={{...slip,agencia:agencia.code}}
          titulo="Pago registrado" color={Q.amber} tipo="apuesta" onReset={reset}/>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FLUJO B — APUESTA MANUAL
// ═══════════════════════════════════════════════════════════════
function FlujoManual({ agencia }){
  const [picks,setPicks]=useState([]);
  const [monto,setMonto]=useState(5000);
  const [cliente,setCliente]=useState("");
  const [step,setStep]=useState("armar");
  const [slip,setSlip]=useState(null);

  const togglePick=(ev,sport,label,odd)=>{
    const id=`${ev.home}-${ev.away}-${label}`;
    setPicks(p=>{
      const w=p.filter(x=>x.id!==id);
      if(p.find(x=>x.id===id)) return w;
      return[...w,{id,home:ev.home,away:ev.away,sel:label,odd,sport}];
    });
  };
  const hasPick=(ev,label)=>picks.some(x=>x.id===`${ev.home}-${ev.away}-${label}`);
  const totOdd=picks.length?picks.reduce((a,p)=>a*p.odd,1):1;

  const confirmar=()=>{
    const newSlip={
      code:genCode(), user:cliente||"Cliente mostrador",
      created_at:nowStr(), expires_at:expires24(),
      status:"active", picks, stake:monto,
      odd_total:parseFloat(totOdd.toFixed(3)),
      potential_win:Math.round(monto*totOdd),
      agencia:agencia.code,
    };
    setSlip(newSlip); setStep("done");
  };

  const reset=()=>{ setPicks([]); setMonto(5000); setCliente(""); setStep("armar"); setSlip(null); };

  if(step==="done"&&slip) return(
    <DoneScreen slip={slip} titulo="Apuesta registrada"
      color={Q.violet} tipo="apuesta" onReset={reset}/>
  );

  return(
    <div>
      <GCard style={{padding:16,marginBottom:14}}>
        <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
          letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>
          Nombre del cliente (opcional)
        </div>
        <input value={cliente} onChange={e=>setCliente(e.target.value)}
          placeholder="Ej: Juan Pérez"
          style={{width:"100%",background:"rgba(255,255,255,0.05)",
            border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 14px",
            color:Q.text,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}/>
      </GCard>

      {DEPORTES.map(d=>(
        <GCard key={d.sport} style={{padding:16,marginBottom:12}}>
          <div style={{color:Q.violet2,fontWeight:700,fontSize:13,marginBottom:10,
            fontFamily:"'Space Grotesk',system-ui"}}>{d.sport}</div>
          {d.events.map(ev=>(
            <div key={ev.home+ev.away} style={{marginBottom:12,
              borderBottom:`1px solid ${Q.dim}`,paddingBottom:10}}>
              <div style={{color:Q.text,fontWeight:600,fontSize:13,marginBottom:8,
                fontFamily:"'Space Grotesk',system-ui"}}>
                {ev.home} vs {ev.away}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[
                  {label:ev.home+" gana",odd:ev.odds.L},
                  ev.odds.E?{label:"Empate",odd:ev.odds.E}:null,
                  {label:ev.away+" gana",odd:ev.odds.V},
                ].filter(Boolean).map(opt=>(
                  <button key={opt.label} onClick={()=>togglePick(ev,d.sport,opt.label,opt.odd)} style={{
                    flex:1,minWidth:80,
                    background:hasPick(ev,opt.label)?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
                    border:`1.5px solid ${hasPick(ev,opt.label)?Q.cyan:Q.border}`,
                    borderRadius:10,padding:"8px 6px",cursor:"pointer",textAlign:"center",
                  }}>
                    <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{opt.label}</div>
                    <div style={{color:hasPick(ev,opt.label)?Q.cyan:Q.text,
                      fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(opt.odd)}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </GCard>
      ))}

      {picks.length>0&&(
        <div style={{position:"sticky",bottom:0,
          background:`linear-gradient(0deg,${Q.void} 80%,transparent)`,
          paddingTop:20,paddingBottom:16}}>
          <GCard glow={Q.violet} style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:10}}>
              <div>
                <div style={{color:Q.text,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {picks.length} picks · <span style={{color:Q.cyan}}>{fmt(totOdd)}x</span>
                </div>
                <div style={{color:Q.green,fontSize:12}}>Ret: {ars(Math.round(monto*totOdd))}</div>
              </div>
              <div style={{display:"flex",gap:5}}>
                {[2000,5000,10000,20000].map(v=>(
                  <button key={v} onClick={()=>setMonto(v)} style={{
                    background:monto===v?`${Q.violet}33`:"rgba(255,255,255,0.04)",
                    border:`1px solid ${monto===v?Q.violet:Q.border}`,
                    borderRadius:8,padding:"5px 8px",cursor:"pointer",
                    color:monto===v?Q.cyan:Q.muted,fontSize:10,fontWeight:monto===v?700:400,
                    fontFamily:"'Space Grotesk',system-ui",
                  }}>{v>=1000?`$${v/1000}K`:v}</button>
                ))}
              </div>
            </div>
            <Btn label={`CONFIRMAR Y COBRAR ${ars(monto)}`}
              onClick={confirmar} color={Q.violet} size="lg" full/>
          </GCard>
        </div>
      )}
    </div>
  );
}

// ── PAGO EN LOCAL ──────────────────────────────────────────────
function PagoLocalForm({ slip, onConfirm, onCancel }){
  const [monto,setMonto]=useState(slip.stake||10000);
  return(
    <GCard glow={Q.amber} style={{padding:20,marginBottom:12}}>
      <div style={{color:Q.amber,fontWeight:700,fontSize:15,marginBottom:4,
        fontFamily:"'Space Grotesk',system-ui"}}>Cobrar apuesta en efectivo</div>
      <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>
        Cuota: {fmt(slip.odd_total)}x · Ingresá el monto que cobra el cliente
      </div>
      <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
        letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>Monto en efectivo</div>
      <input type="number" value={monto} onChange={e=>setMonto(Number(e.target.value))}
        style={{width:"100%",background:"rgba(255,255,255,0.06)",
          border:`1.5px solid ${Q.amber}`,borderRadius:10,padding:"12px 16px",
          color:Q.amber,fontSize:22,fontFamily:"'Space Grotesk',system-ui",
          fontWeight:700,marginBottom:10}}/>
      <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>
        Retorno potencial: <strong style={{color:Q.green,fontSize:16}}>{ars(Math.round(monto*slip.odd_total))}</strong>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn label="Cancelar" onClick={onCancel} outline color={Q.muted} full/>
        <Btn label={`COBRAR ${ars(monto)}`} onClick={()=>onConfirm(monto)} color={Q.amber} full/>
      </div>
    </GCard>
  );
}

// ── DONE SCREEN ───────────────────────────────────────────────
function DoneScreen({ slip, titulo, color, tipo, onReset }){
  const [printed,setPrinted]=useState(false);
  const imprimir=()=>{ printTicket(slip, tipo); setPrinted(true); };
  return(
    <GCard glow={color} style={{padding:24,textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:10}}>
        {color===Q.green?"✅":color===Q.amber?"💵":"🎉"}
      </div>
      <div style={{color,fontWeight:900,fontSize:20,
        fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>{titulo}</div>
      <div style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${Q.border}`,
        borderRadius:12,padding:16,marginBottom:16,textAlign:"left"}}>
        {[
          ["Código",slip.code,Q.cyan],
          ["Cliente",slip.user,Q.text],
          ["Picks",(slip.picks?.length||0)+" selecciones",Q.text],
          ["Apostado",ars(slip.stake),Q.text],
          ["Retorno pot.",ars(slip.potential_win),Q.green],
        ].map(([l,v,c])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",
            padding:"5px 0",borderBottom:`1px solid ${Q.dim}`}}>
            <span style={{color:Q.muted,fontSize:12}}>{l}</span>
            <span style={{color:c,fontWeight:700,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:10,marginBottom:10}}>
        <button onClick={imprimir} style={{
          flex:1,background:printed?"rgba(255,255,255,0.04)":`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:`1px solid ${printed?Q.border:Q.violet}`,borderRadius:12,padding:14,
          color:printed?Q.muted:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",
          fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
        }}>🖨️ {printed?"Reimprimir":"Imprimir ticket"}</button>
      </div>
      <Btn label="NUEVA OPERACIÓN" onClick={onReset} color={color} full size="lg"/>
    </GCard>
  );
}

// ═══════════════════════════════════════════════════════════════
// HISTORIAL
// ═══════════════════════════════════════════════════════════════
function Historial({ agencia }){
  const total=MOCK_HISTORIAL.reduce((a,i)=>a+i.stake,0);
  const totalWin=MOCK_HISTORIAL.reduce((a,i)=>a+i.win,0);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[{l:"Tickets hoy",v:MOCK_HISTORIAL.length,c:Q.cyan},
          {l:"Total cobrado",v:ars(total),c:Q.green},
          {l:"Ret. potencial",v:ars(totalWin),c:Q.amber},
        ].map((s,i)=>(
          <GCard key={i} glow={s.c} style={{padding:"10px 12px",textAlign:"center"}}>
            <div style={{color:s.c,fontWeight:700,fontSize:12,
              fontFamily:"'Space Grotesk',system-ui"}}>{s.v}</div>
            <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{s.l}</div>
          </GCard>
        ))}
      </div>
      {MOCK_HISTORIAL.map((h,i)=>(
        <GCard key={i} style={{padding:"12px 16px",marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                <span style={{color:Q.cyan,fontWeight:700,fontSize:13,
                  fontFamily:"'Space Grotesk',system-ui"}}>{h.code}</span>
                <span style={{background:h.tipo==="bot"?`${Q.violet}22`:h.tipo==="cobro"?`${Q.green}22`:`${Q.amber}22`,
                  border:`1px solid ${h.tipo==="bot"?Q.violet:h.tipo==="cobro"?Q.green:Q.amber}`,
                  borderRadius:20,padding:"1px 8px",fontSize:9,fontWeight:700,
                  color:h.tipo==="bot"?Q.violet:h.tipo==="cobro"?Q.green:Q.amber,
                  fontFamily:"'Space Grotesk',system-ui"}}>
                  {h.tipo.toUpperCase()}
                </span>
              </div>
              <div style={{color:Q.muted,fontSize:11}}>{h.user} · {h.time}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,
                fontFamily:"'Space Grotesk',system-ui"}}>{ars(h.stake)}</div>
              <div style={{color:Q.green,fontSize:11}}>ret: {ars(h.win)}</div>
            </div>
          </div>
        </GCard>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CIERRES DE CAJA
// ═══════════════════════════════════════════════════════════════
function Cierres({ agencia }){
  const [tipo,setTipo]=useState("diario");
  const [fechaDesde,setFechaDesde]=useState("");
  const [fechaHasta,setFechaHasta]=useState("");
  const [resultado,setResultado]=useState(null);

  // Mock data por tipo
  const MOCK_CIERRES = {
    diario:{
      periodo:"Hoy 17/07/2026",
      tickets:47, tickets_bot:31, tickets_manual:16,
      cobrado:284500, pagado:98700, neto:185800,
    },
    semanal:{
      periodo:"Semana 14/07 - 17/07/2026",
      tickets:312, tickets_bot:198, tickets_manual:114,
      cobrado:1842000, pagado:624000, neto:1218000,
    },
    mensual:{
      periodo:"Julio 2026",
      tickets:1247, tickets_bot:834, tickets_manual:413,
      cobrado:7248000, pagado:2481000, neto:4767000,
    },
    personalizado:{
      periodo:`${fechaDesde||"--/--"} al ${fechaHasta||"--/--"}`,
      tickets:183, tickets_bot:121, tickets_manual:62,
      cobrado:1124000, pagado:387000, neto:737000,
    },
  };

  const generar=()=>{
    setResultado(MOCK_CIERRES[tipo]);
  };

  return(
    <div>
      {/* Selector de tipo */}
      <GCard style={{padding:16,marginBottom:14}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,
          fontFamily:"'Space Grotesk',system-ui"}}>Tipo de cierre</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:14}}>
          {[
            {k:"diario",   l:"📅 Diario",      d:"Hoy"},
            {k:"semanal",  l:"📆 Semanal",     d:"Últimos 7 días"},
            {k:"mensual",  l:"🗓️ Mensual",     d:"Este mes"},
            {k:"personalizado",l:"🔧 Personalizado",d:"Elegí las fechas"},
          ].map(t=>(
            <button key={t.k} onClick={()=>{setTipo(t.k);setResultado(null);}} style={{
              background:tipo===t.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
              border:`1.5px solid ${tipo===t.k?Q.cyan:Q.border}`,
              borderRadius:12,padding:"12px 10px",cursor:"pointer",textAlign:"left",
            }}>
              <div style={{color:tipo===t.k?Q.cyan:Q.text,fontWeight:700,fontSize:12,
                fontFamily:"'Space Grotesk',system-ui"}}>{t.l}</div>
              <div style={{color:Q.muted,fontSize:10,marginTop:2}}>{t.d}</div>
            </button>
          ))}
        </div>

        {/* Fechas personalizadas */}
        {tipo==="personalizado"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[["Desde",fechaDesde,setFechaDesde],["Hasta",fechaHasta,setFechaHasta]].map(([l,v,sv])=>(
              <div key={l}>
                <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
                  letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:4}}>{l}</div>
                <input type="date" value={v} onChange={e=>sv(e.target.value)}
                  style={{width:"100%",background:"rgba(255,255,255,0.05)",
                    border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 12px",
                    color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}/>
              </div>
            ))}
          </div>
        )}

        <Btn label="GENERAR CIERRE" onClick={generar} color={Q.violet} full size="lg"/>
      </GCard>

      {/* Resultado del cierre */}
      {resultado&&(
        <GCard glow={Q.green} style={{padding:20,marginBottom:12}}>
          <div style={{color:Q.text,fontWeight:700,fontSize:15,marginBottom:4,
            fontFamily:"'Space Grotesk',system-ui"}}>Cierre {tipo}</div>
          <div style={{color:Q.muted,fontSize:12,marginBottom:16}}>{resultado.periodo}</div>

          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[
              {l:"Total tickets",v:resultado.tickets,c:Q.cyan},
              {l:"Bot",v:resultado.tickets_bot,c:Q.violet},
              {l:"Manual",v:resultado.tickets_manual,c:Q.amber},
            ].map((s,i)=>(
              <GCard key={i} glow={s.c} style={{padding:"10px",textAlign:"center"}}>
                <div style={{color:s.c,fontWeight:700,fontSize:16,
                  fontFamily:"'Space Grotesk',system-ui"}}>{s.v}</div>
                <div style={{color:Q.muted,fontSize:9}}>{s.l}</div>
              </GCard>
            ))}
          </div>

          {/* Financiero */}
          <div style={{marginBottom:14}}>
            {[
              ["Total cobrado (apuestas)",  resultado.cobrado, Q.text],
              ["Total pagado (premios)",    resultado.pagado,  Q.pink],
              ["NETO AGENCIA",              resultado.neto,    Q.green],
            ].map(([l,v,c],i)=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"10px 0",
                borderBottom:i<2?`1px solid ${Q.dim}`:"none",
                marginTop:i===2?8:0}}>
                <span style={{color:i===2?Q.text:Q.muted,fontSize:i===2?14:12,
                  fontWeight:i===2?700:400,fontFamily:"'Space Grotesk',system-ui"}}>{l}</span>
                <span style={{color:c,fontWeight:900,fontSize:i===2?22:14,
                  fontFamily:"'Space Grotesk',system-ui"}}>{ars(v)}</span>
              </div>
            ))}
          </div>

          {/* Acciones */}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>printCierre(resultado,tipo,agencia)} style={{
              flex:1,background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
              border:"none",borderRadius:12,padding:14,cursor:"pointer",
              color:"#fff",fontWeight:700,fontSize:14,
              fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
            }}>🖨️ IMPRIMIR CIERRE</button>
          </div>
        </GCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
function Config({ agencia }){
  const [testDone,setTestDone]=useState(false);
  return(
    <div>
      <GCard style={{padding:20,marginBottom:12}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:14,
          fontFamily:"'Space Grotesk',system-ui"}}>Datos de la agencia</div>
        {[["Nombre",agencia.name],["Código",agencia.code],
          ["Dirección","Av. Corrientes 1234, CABA"],
          ["Teléfono","+54 11 4567-8901"],
          ["Impresora","Xprinter XP-58 (80mm)"],
          ["Estado","Conectada"],
        ].map(([l,v])=>(
          <div key={l} style={{display:"flex",justifyContent:"space-between",
            padding:"8px 0",borderBottom:`1px solid ${Q.dim}`}}>
            <span style={{color:Q.muted,fontSize:12}}>{l}</span>
            <span style={{color:Q.text,fontSize:12}}>{v}</span>
          </div>
        ))}
      </GCard>
      <GCard glow={Q.violet} style={{padding:20}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:8,
          fontFamily:"'Space Grotesk',system-ui"}}>Test de impresora</div>
        <div style={{color:Q.muted,fontSize:12,marginBottom:14}}>
          Imprime un ticket de prueba para verificar la conexión
        </div>
        <Btn label={testDone?"Reimprimir test":"IMPRIMIR TICKET TEST"}
          onClick={()=>{
            printTicket({
              code:"QP-TEST",user:"Test",created_at:nowStr(),expires_at:expires24(),
              picks:[{home:"River",away:"Boca",sel:"River gana",odd:1.55,sport:"TEST"}],
              stake:10000,odd_total:1.55,potential_win:15500,agencia:agencia.code,
            },"apuesta");
            setTestDone(true);
          }} color={Q.violet} full/>
      </GCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANEL PRINCIPAL
// ═══════════════════════════════════════════════════════════════
function AgenciaPanel({ agencia, onLogout }){
  const [tab,setTab]=useState("codigo");

  const TABS=[
    {k:"codigo",   l:"Código / Bot"},
    {k:"manual",   l:"Apuesta manual"},
    {k:"historial",l:"Historial"},
    {k:"cierres",  l:"Cierres"},
    {k:"config",   l:"Config"},
  ];

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
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{textAlign:"right"}}>
            <div style={{color:Q.text,fontSize:12,fontWeight:600,
              fontFamily:"'Space Grotesk',system-ui"}}>{agencia.name}</div>
            <div style={{color:Q.muted,fontSize:10}}>{agencia.code}</div>
          </div>
          <button onClick={onLogout} style={{background:"transparent",
            border:`1px solid ${Q.border}`,borderRadius:8,padding:"5px 10px",
            color:Q.muted,fontSize:11,cursor:"pointer"}}>Salir</button>
        </div>
      </div>

      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"6px 12px",display:"flex",gap:5,overflowX:"auto",
        position:"sticky",top:52,zIndex:40}}>
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{
            background:tab===t.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"transparent",
            border:`1px solid ${tab===t.k?Q.violet:Q.border}`,
            borderRadius:10,padding:"7px 14px",cursor:"pointer",flexShrink:0,
            color:tab===t.k?Q.cyan:Q.muted,fontSize:12,fontWeight:tab===t.k?700:400,
            fontFamily:"'Space Grotesk',system-ui",
          }}>{t.l}</button>
        ))}
      </div>

      <div style={{padding:"16px",maxWidth:620,margin:"0 auto",
        position:"relative",zIndex:1,paddingBottom:80}}>
        {tab==="codigo"   &&<FlujoCodigo  agencia={agencia}/>}
        {tab==="manual"   &&<FlujoManual  agencia={agencia}/>}
        {tab==="historial"&&<Historial    agencia={agencia}/>}
        {tab==="cierres"  &&<Cierres      agencia={agencia}/>}
        {tab==="config"   &&<Config       agencia={agencia}/>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function QuartzAgencia(){
  const [agencia,setAgencia]=useState(null);
  return(
    <div style={{background:Q.void,minHeight:"100vh"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus{outline:none} button:active{opacity:.85}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.3)}
      `}</style>
      {!agencia
        ?<LoginScreen onLogin={setAgencia}/>
        :<AgenciaPanel agencia={agencia} onLogout={()=>setAgencia(null)}/>
      }
    </div>
  );
}
