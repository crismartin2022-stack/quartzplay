import { useState, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// QUARTZPLAY AGENCIA — Panel para locales físicos
// Ingreso de código → ver combinada → imprimir ticket térmico
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

// ── MOCK BETSLIPS (en producción viene del backend) ────────────
const MOCK_BETSLIPS = {
  "QP-47829": {
    code: "QP-47829",
    created: "17/07/2026 02:15",
    expires: "18/07/2026 02:15",
    status: "pending",
    user: "@martin_ar",
    picks: [
      {home:"River",away:"Boca",sel:"River gana",odd:1.55,sport:"Liga AR"},
      {home:"Argentina",away:"Argelia",sel:"Argentina gana",odd:1.30,sport:"Mundial"},
      {home:"R.Madrid",away:"Bayern",sel:"R.Madrid gana",odd:2.10,sport:"Champions"},
    ],
    stake: 10000,
    odd_total: 4.24,
    potential_win: 42400,
  },
  "QP-38291": {
    code: "QP-38291",
    created: "17/07/2026 01:45",
    expires: "18/07/2026 01:45",
    status: "pending",
    user: "@apostador99",
    picks: [
      {home:"España",away:"C.Verde",sel:"España gana",odd:1.18,sport:"Mundial"},
      {home:"Francia",away:"Senegal",sel:"Francia gana",odd:1.45,sport:"Mundial"},
    ],
    stake: 20000,
    odd_total: 1.71,
    potential_win: 34200,
  },
  "QP-19283": {
    code: "QP-19283",
    created: "17/07/2026 00:30",
    expires: "18/07/2026 00:30",
    status: "paid",
    user: "@bet_king",
    picks: [
      {home:"Lakers",away:"Celtics",sel:"Lakers gana",odd:1.95,sport:"NBA"},
    ],
    stake: 5000,
    odd_total: 1.95,
    potential_win: 9750,
  },
};

// ── TICKET TÉRMICO HTML ────────────────────────────────────────
function generateTicketHTML(slip){
  const now = new Date().toLocaleString("es-AR");
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    width: 80mm;
    padding: 4mm;
    background: white;
    color: black;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .large { font-size: 16px; }
  .xlarge { font-size: 20px; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; margin: 2px 0; }
  .pick { margin: 4px 0; padding: 2px 0; border-bottom: 1px dotted #999; }
  .qr { text-align: center; margin: 8px 0; }
  .footer { font-size: 10px; text-align: center; color: #666; }
</style>
</head>
<body>
  <div class="center bold xlarge">⬡ QUARTZPLAY</div>
  <div class="center" style="font-size:10px;">Sports & Casino Premium</div>
  <div class="divider"></div>

  <div class="center bold large">TICKET #${slip.code}</div>
  <div class="center" style="font-size:10px;">Usuario: ${slip.user}</div>
  <div class="center" style="font-size:10px;">Emitido: ${now}</div>
  <div class="center" style="font-size:10px;">Válido hasta: ${slip.expires}</div>

  <div class="divider"></div>
  <div class="bold center">COMBINADA</div>
  <div class="divider"></div>

  ${slip.picks.map((p,i) => `
  <div class="pick">
    <div class="bold">${i+1}. ${p.home} vs ${p.away}</div>
    <div>${p.sport}</div>
    <div class="row">
      <span>→ ${p.sel}</span>
      <span class="bold">@${p.odd}</span>
    </div>
  </div>
  `).join("")}

  <div class="divider"></div>
  <div class="row bold"><span>CUOTA TOTAL:</span><span>${fmt(slip.odd_total)}x</span></div>
  <div class="row bold large"><span>APOSTADO:</span><span>${ars(slip.stake)}</span></div>
  <div class="row bold large"><span>RETORNO POT:</span><span>${ars(slip.potential_win)}</span></div>
  <div class="divider"></div>

  <div class="qr">
    <div style="font-size:48px;">▓▓▓▓▓</div>
    <div style="font-size:10px;">${slip.code}</div>
  </div>

  <div class="divider"></div>
  <div class="footer">
    <div>Este ticket es válido por 24 horas.</div>
    <div>Presentalo en caja para cobrar tus ganancias.</div>
    <div>quartzplay.com · @QuartzPlayBot</div>
    <div>Jugá con responsabilidad · +18</div>
  </div>
</body>
</html>
  `;
}

// ── LOGIN ──────────────────────────────────────────────────────
function LoginScreen({ onLogin }){
  const [user,setUser]=useState("");
  const [pass,setPass]=useState("");
  const [error,setError]=useState("");

  const login=()=>{
    // En producción: validar contra backend
    if(user==="agencia1" && pass==="qp2026"){
      onLogin({name:"Agencia Centro", code:"AGE001"});
    } else {
      setError("Usuario o contraseña incorrectos");
    }
  };

  return(
    <div style={{background:Q.void,minHeight:"100vh",display:"flex",
      flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:24,position:"relative"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{width:"100%",maxWidth:360,position:"relative",zIndex:1}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <QPLogo size={28}/>
          <div style={{color:Q.muted,fontSize:12,marginTop:8,fontFamily:"'Space Grotesk',system-ui"}}>
            Panel de Agencia
          </div>
        </div>
        <GCard glow={Q.violet} style={{padding:24}}>
          <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
            letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>
            Usuario
          </div>
          <input value={user} onChange={e=>setUser(e.target.value)}
            placeholder="agencia1"
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 14px",
              color:Q.text,fontSize:14,marginBottom:14,fontFamily:"'Space Grotesk',system-ui"}}/>
          <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
            letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:6}}>
            Contraseña
          </div>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
            placeholder="••••••••"
            onKeyDown={e=>e.key==="Enter"&&login()}
            style={{width:"100%",background:"rgba(255,255,255,0.05)",
              border:`1px solid ${Q.border}`,borderRadius:10,padding:"10px 14px",
              color:Q.text,fontSize:14,marginBottom:14,fontFamily:"'Space Grotesk',system-ui"}}/>
          {error&&<div style={{color:Q.red,fontSize:12,marginBottom:10,
            fontFamily:"'Space Grotesk',system-ui"}}>{error}</div>}
          <button onClick={login} style={{
            width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            border:"none",borderRadius:12,padding:14,color:"#fff",
            fontWeight:700,fontSize:15,cursor:"pointer",
            fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
            boxShadow:`0 6px 20px ${Q.violet}44`,
          }}>INGRESAR</button>
        </GCard>
        <div style={{textAlign:"center",marginTop:16,color:Q.dim,fontSize:11,
          fontFamily:"'Space Grotesk',system-ui"}}>
          Demo: usuario <strong style={{color:Q.muted}}>agencia1</strong> · clave <strong style={{color:Q.muted}}>qp2026</strong>
        </div>
      </div>
    </div>
  );
}

// ── PANEL PRINCIPAL ────────────────────────────────────────────
function AgenciaPanel({ agencia, onLogout }){
  const [tab,setTab]=useState("cobrar");
  const [code,setCode]=useState("");
  const [slip,setSlip]=useState(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [paid,setPaid]=useState(false);
  const [printDone,setPrintDone]=useState(false);
  const printRef=useRef();

  const buscar=()=>{
    setError(""); setSlip(null); setPaid(false); setPrintDone(false);
    setLoading(true);
    setTimeout(()=>{
      const found=MOCK_BETSLIPS[code.toUpperCase()];
      if(found){
        setSlip(found);
      } else {
        setError("Código no encontrado. Verificá y volvé a intentar.");
      }
      setLoading(false);
    },600);
  };

  const imprimir=()=>{
    const html=generateTicketHTML(slip);
    const win=window.open("","_blank","width=400,height=600");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(()=>{ win.print(); win.close(); },500);
    setPrintDone(true);
  };

  const cobrar=()=>{
    setPaid(true);
  };

  const TABS=[
    {k:"cobrar",l:"💰 Cobrar apuesta"},
    {k:"historial",l:"📋 Historial"},
    {k:"config",l:"⚙️ Config"},
  ];

  return(
    <div style={{background:Q.void,minHeight:"100vh",fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>

      {/* Header */}
      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"12px 20px",display:"flex",alignItems:"center",
        justifyContent:"space-between",position:"relative",overflow:"hidden",zIndex:10}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
          background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
        <QPLogo size={18}/>
        <div style={{textAlign:"right"}}>
          <div style={{color:Q.text,fontSize:13,fontWeight:600,
            fontFamily:"'Space Grotesk',system-ui"}}>{agencia.name}</div>
          <div style={{color:Q.muted,fontSize:11}}>ID: {agencia.code}</div>
        </div>
        <button onClick={onLogout} style={{background:"transparent",
          border:`1px solid ${Q.border}`,borderRadius:8,padding:"6px 12px",
          color:Q.muted,fontSize:11,cursor:"pointer",
          fontFamily:"'Space Grotesk',system-ui"}}>Salir</button>
      </div>

      {/* Tabs */}
      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"6px 16px",display:"flex",gap:6,position:"relative",zIndex:10}}>
        {TABS.map(t=>(
          <button key={t.k} onClick={()=>{setTab(t.k);setSlip(null);setCode("");setError("");setPaid(false);}} style={{
            background:tab===t.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"transparent",
            border:`1px solid ${tab===t.k?Q.violet:Q.border}`,
            borderRadius:8,padding:"6px 14px",cursor:"pointer",
            color:tab===t.k?Q.cyan:Q.muted,fontSize:12,fontWeight:tab===t.k?700:400,
            fontFamily:"'Space Grotesk',system-ui",
          }}>{t.l}</button>
        ))}
      </div>

      <div style={{padding:"20px 16px",maxWidth:600,margin:"0 auto",
        position:"relative",zIndex:1}}>

        {/* TAB: COBRAR */}
        {tab==="cobrar"&&(
          <div>
            {/* Buscador de código */}
            <GCard glow={Q.violet} style={{padding:20,marginBottom:16}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:16,marginBottom:4,
                fontFamily:"'Space Grotesk',system-ui"}}>Ingresar código de apuesta</div>
              <div style={{color:Q.muted,fontSize:12,marginBottom:14}}>
                El cliente te muestra el código QP-XXXXX o el QR
              </div>
              <div style={{display:"flex",gap:8}}>
                <input
                  value={code}
                  onChange={e=>setCode(e.target.value.toUpperCase())}
                  onKeyDown={e=>e.key==="Enter"&&buscar()}
                  placeholder="QP-47829"
                  style={{
                    flex:1,background:"rgba(255,255,255,0.06)",
                    border:`1.5px solid ${Q.border}`,borderRadius:10,
                    padding:"12px 16px",color:Q.text,fontSize:18,
                    fontFamily:"'Space Grotesk',system-ui",fontWeight:700,
                    letterSpacing:2,
                  }}/>
                <button onClick={buscar} disabled={!code||loading} style={{
                  background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                  border:"none",borderRadius:10,padding:"12px 20px",
                  color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",
                  fontFamily:"'Space Grotesk',system-ui",
                  boxShadow:`0 4px 16px ${Q.violet}44`,
                }}>
                  {loading?"...":"BUSCAR"}
                </button>
              </div>
              {error&&(
                <div style={{color:Q.red,fontSize:13,marginTop:10,
                  fontFamily:"'Space Grotesk',system-ui"}}>❌ {error}</div>
              )}
            </GCard>

            {/* Resultado */}
            {slip&&!paid&&(
              <div>
                {/* Estado */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{
                    background:slip.status==="pending"?`${Q.green}22`:`${Q.amber}22`,
                    border:`1px solid ${slip.status==="pending"?Q.green:Q.amber}`,
                    borderRadius:20,padding:"4px 14px",
                    color:slip.status==="pending"?Q.green:Q.amber,
                    fontSize:12,fontWeight:700,fontFamily:"'Space Grotesk',system-ui",
                  }}>
                    {slip.status==="pending"?"✅ VÁLIDO — PENDIENTE DE COBRO":"⚠️ YA COBRADO"}
                  </div>
                  <div style={{color:Q.muted,fontSize:11}}>Código: {slip.code}</div>
                </div>

                {/* Info del ticket */}
                <GCard glow={Q.green} style={{padding:18,marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",
                    alignItems:"flex-start",marginBottom:14}}>
                    <div>
                      <div style={{color:Q.muted,fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>Usuario</div>
                      <div style={{color:Q.text,fontWeight:700,fontSize:14,
                        fontFamily:"'Space Grotesk',system-ui"}}>{slip.user}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:Q.muted,fontSize:11,fontFamily:"'Space Grotesk',system-ui"}}>Emitido</div>
                      <div style={{color:Q.muted,fontSize:12}}>{slip.created}</div>
                    </div>
                  </div>

                  {/* Picks */}
                  <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",
                    letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:8}}>
                    Combinada ({slip.picks.length} picks)
                  </div>
                  {slip.picks.map((p,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",padding:"8px 0",
                      borderBottom:i<slip.picks.length-1?`1px solid ${Q.dim}`:"none"}}>
                      <div>
                        <div style={{color:Q.text,fontWeight:600,fontSize:13,
                          fontFamily:"'Space Grotesk',system-ui"}}>
                          {p.home} vs {p.away}
                        </div>
                        <div style={{color:Q.muted,fontSize:11}}>
                          {p.sport} · {p.sel}
                        </div>
                      </div>
                      <div style={{color:Q.cyan,fontWeight:700,fontSize:16,
                        fontFamily:"'Space Grotesk',system-ui"}}>@{p.odd}</div>
                    </div>
                  ))}

                  {/* Totales */}
                  <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${Q.violet}44`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{color:Q.muted,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>Cuota total</span>
                      <span style={{color:Q.gold,fontWeight:700,fontSize:16,
                        fontFamily:"'Space Grotesk',system-ui"}}>{fmt(slip.odd_total)}x</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{color:Q.muted,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>Apostado</span>
                      <span style={{color:Q.text,fontWeight:700,fontSize:16,
                        fontFamily:"'Space Grotesk',system-ui"}}>{ars(slip.stake)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{color:Q.muted,fontSize:14,fontFamily:"'Space Grotesk',system-ui",fontWeight:700}}>RETORNO POT.</span>
                      <span style={{color:Q.green,fontWeight:900,fontSize:22,
                        fontFamily:"'Space Grotesk',system-ui"}}>{ars(slip.potential_win)}</span>
                    </div>
                  </div>
                </GCard>

                {/* Acciones */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <button onClick={imprimir} style={{
                    background:"rgba(255,255,255,0.05)",
                    border:`1px solid ${Q.border}`,
                    borderRadius:12,padding:14,cursor:"pointer",
                    color:Q.text,fontWeight:600,fontSize:14,
                    fontFamily:"'Space Grotesk',system-ui",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  }}>
                    🖨️ {printDone?"Reimprimir":"Imprimir ticket"}
                  </button>
                  <button onClick={cobrar} style={{
                    background:`linear-gradient(135deg,${Q.green},#009624)`,
                    border:"none",borderRadius:12,padding:14,cursor:"pointer",
                    color:Q.void,fontWeight:700,fontSize:14,
                    fontFamily:"'Space Grotesk',system-ui",
                    boxShadow:`0 6px 20px ${Q.green}44`,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  }}>
                    💰 COBRAR {ars(slip.potential_win)}
                  </button>
                </div>
              </div>
            )}

            {/* Cobro exitoso */}
            {paid&&(
              <GCard glow={Q.green} style={{padding:24,textAlign:"center"}}>
                <div style={{fontSize:52,marginBottom:12}}>✅</div>
                <div style={{color:Q.green,fontWeight:900,fontSize:20,
                  fontFamily:"'Space Grotesk',system-ui",marginBottom:8}}>
                  ¡Pago realizado!
                </div>
                <div style={{color:Q.text,fontSize:16,fontFamily:"'Space Grotesk',system-ui",marginBottom:4}}>
                  {ars(slip.potential_win)} ARS
                </div>
                <div style={{color:Q.muted,fontSize:12,marginBottom:20}}>
                  Ticket {slip.code} · {slip.user}
                </div>
                <button onClick={()=>{setSlip(null);setCode("");setPaid(false);setPrintDone(false);}} style={{
                  background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                  border:"none",borderRadius:12,padding:"12px 32px",
                  color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",
                  fontFamily:"'Space Grotesk',system-ui",
                }}>NUEVA BÚSQUEDA</button>
              </GCard>
            )}

            {/* Instrucciones iniciales */}
            {!slip&&!error&&!loading&&(
              <GCard style={{padding:20}}>
                <div style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui",
                  lineHeight:1.7}}>
                  <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:10,
                    fontFamily:"'Space Grotesk',system-ui"}}>¿Cómo cobrar una apuesta?</div>
                  <div style={{marginBottom:6}}>1. El cliente te muestra el código <strong style={{color:Q.cyan}}>QP-XXXXX</strong> o el QR desde su celular</div>
                  <div style={{marginBottom:6}}>2. Ingresás el código arriba y tocás <strong style={{color:Q.violet}}>BUSCAR</strong></div>
                  <div style={{marginBottom:6}}>3. Verificás que el ticket sea válido y los picks coincidan</div>
                  <div style={{marginBottom:6}}>4. Imprimís el ticket si el cliente lo pide</div>
                  <div>5. Tocás <strong style={{color:Q.green}}>COBRAR</strong> y entregás el efectivo</div>
                </div>
              </GCard>
            )}
          </div>
        )}

        {/* TAB: HISTORIAL */}
        {tab==="historial"&&(
          <div>
            <div style={{color:Q.muted,fontSize:11,textTransform:"uppercase",
              letterSpacing:1,fontFamily:"'Space Grotesk',system-ui",marginBottom:12}}>
              Tickets procesados hoy
            </div>
            {[
              {code:"QP-19283",user:"@bet_king",amount:9750,time:"00:45",status:"paid"},
              {code:"QP-28374",user:"@porteno_bets",amount:24500,time:"23:12",status:"paid"},
              {code:"QP-11923",user:"@suerte_total",amount:8200,time:"22:30",status:"paid"},
            ].map((h,i)=>(
              <GCard key={i} style={{padding:"12px 16px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:Q.text,fontWeight:700,fontSize:13,
                      fontFamily:"'Space Grotesk',system-ui"}}>{h.code}</div>
                    <div style={{color:Q.muted,fontSize:11}}>{h.user} · {h.time}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:Q.green,fontWeight:700,fontSize:15,
                      fontFamily:"'Space Grotesk',system-ui"}}>{ars(h.amount)}</div>
                    <div style={{color:Q.green,fontSize:10,fontFamily:"'Space Grotesk',system-ui"}}>✅ Pagado</div>
                  </div>
                </div>
              </GCard>
            ))}
            <GCard glow={Q.violet} style={{padding:"12px 16px",marginTop:16}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:Q.text,fontFamily:"'Space Grotesk',system-ui",fontWeight:700}}>Total pagado hoy</span>
                <span style={{color:Q.gold,fontWeight:900,fontSize:18,fontFamily:"'Space Grotesk',system-ui"}}>{ars(42450)}</span>
              </div>
            </GCard>
          </div>
        )}

        {/* TAB: CONFIG */}
        {tab==="config"&&(
          <div>
            <GCard style={{padding:20,marginBottom:12}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:14,
                fontFamily:"'Space Grotesk',system-ui"}}>⚙️ Configuración de agencia</div>
              {[
                ["Nombre","Agencia Centro"],
                ["Código","AGE001"],
                ["Dirección","Av. Corrientes 1234, CABA"],
                ["Teléfono","+54 11 4567-8901"],
                ["Impresora","Xprinter XP-58 (USB)"],
              ].map(([l,v])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",
                  padding:"8px 0",borderBottom:`1px solid ${Q.dim}`}}>
                  <span style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{l}</span>
                  <span style={{color:Q.text,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{v}</span>
                </div>
              ))}
            </GCard>
            <GCard glow={Q.violet} style={{padding:20,marginBottom:12}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:10,
                fontFamily:"'Space Grotesk',system-ui"}}>🖨️ Test de impresora</div>
              <div style={{color:Q.muted,fontSize:12,marginBottom:12}}>
                Imprime un ticket de prueba para verificar la conexión
              </div>
              <button onClick={()=>{
                const testSlip={
                  code:"QP-TEST",created:new Date().toLocaleString("es-AR"),
                  expires:"Prueba",status:"pending",user:"@test",
                  picks:[{home:"River",away:"Boca",sel:"River gana",odd:1.55,sport:"TEST"}],
                  stake:10000,odd_total:1.55,potential_win:15500,
                };
                const html=generateTicketHTML(testSlip);
                const win=window.open("","_blank","width=400,height=600");
                win.document.write(html);
                win.document.close();
                win.focus();
                setTimeout(()=>{ win.print(); win.close(); },500);
              }} style={{
                background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                border:"none",borderRadius:10,padding:"10px 20px",
                color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",
                fontFamily:"'Space Grotesk',system-ui",
              }}>🖨️ IMPRIMIR TICKET DE PRUEBA</button>
            </GCard>
          </div>
        )}
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
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",background:Q.void,minHeight:"100vh"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus{outline:none}
        button:active{opacity:.85}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(124,58,237,0.3)}
      `}</style>

      {!agencia
        ? <LoginScreen onLogin={setAgencia}/>
        : <AgenciaPanel agencia={agencia} onLogout={()=>setAgencia(null)}/>
      }
    </div>
  );
}
