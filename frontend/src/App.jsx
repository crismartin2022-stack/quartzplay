import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// QUARTZPLAY SPORTS — Design System
// ═══════════════════════════════════════════════════════════════
const Q = {
  void:"#020208", deep:"#060612", dark:"#0A0A1E",
  surface:"#0E0E28", card:"#12122E",
  glass:"linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))",
  violet:"#7C3AED", violet2:"#9F5FFF",
  cyan:"#00F0FF", green:"#00FF88",
  pink:"#FF0080", amber:"#FFB800",
  gold:"#E8C547", red:"#FF1744",
  blue:"#2979FF", teal:"#00BCD4",
  text:"#F0F0FF", muted:"#6B7090", dim:"#2A2A4A",
  border:"rgba(124,58,237,0.25)",
};

const ars = n => "$" + Math.round(n||0).toLocaleString("es-AR");
const fmt = n => Number(n||0).toFixed(2);
const prod = a => a.reduce((x,y)=>x*y,1);

// ── COMPONENTS ────────────────────────────────────────────────
function GCard({ children, style={}, glow, onClick }){
  return(
    <div onClick={onClick} style={{
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

function Particles({ count=10, c1=Q.violet, c2=Q.cyan }){
  return(
    <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0}}>
      {Array.from({length:count},(_,i)=>({
        x:Math.random()*100, y:Math.random()*100,
        s:1+Math.random()*2, dur:3+Math.random()*4, delay:Math.random()*4,
        color:i%2===0?c1:c2,
      })).map((p,i)=>(
        <div key={i} style={{
          position:"absolute",left:`${p.x}%`,top:`${p.y}%`,
          width:p.s,height:p.s,borderRadius:"50%",
          background:p.color,opacity:0.35,
          boxShadow:`0 0 ${p.s*3}px ${p.color}`,
          animation:`qFloat ${p.dur}s ease-in-out ${p.delay}s infinite`,
        }}/>
      ))}
    </div>
  );
}

function QPLogo({ size=20 }){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <svg width={size} height={size} viewBox="0 0 24 24">
        <defs>
          <linearGradient id="qgls" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={Q.violet}/>
            <stop offset="100%" stopColor={Q.cyan}/>
          </linearGradient>
        </defs>
        <polygon points="12,2 20,8 20,16 12,22 4,16 4,8" fill="none" stroke="url(#qgls)" strokeWidth={1.5}/>
        <polygon points="12,5 18,9.5 18,15 12,19 6,15 6,9.5" fill="url(#qgls)" opacity={0.3}/>
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

function NDiv({ color=Q.violet }){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,margin:"8px 0"}}>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${color}44)`}}/>
      <div style={{width:4,height:4,borderRadius:"50%",background:color,boxShadow:`0 0 8px ${color}`}}/>
      <div style={{flex:1,height:1,background:`linear-gradient(90deg,${color}44,transparent)`}}/>
    </div>
  );
}

function LiveDot({ color=Q.pink }){
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:color,
        boxShadow:`0 0 6px ${color}`,animation:"qPulse 1.2s ease-in-out infinite",display:"inline-block"}}/>
      <span style={{color,fontSize:9,fontWeight:700,letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>LIVE</span>
    </span>
  );
}

function QBtn({ label, icon, onClick, color=Q.violet, size="md", full=false, outline=false }){
  const h=size==="lg"?"52px":size==="sm"?"32px":"44px";
  const fs=size==="lg"?16:size==="sm"?11:13;
  return(
    <button onClick={onClick} style={{
      height:h, width:full?"100%":"auto",
      padding:`0 ${size==="sm"?"10px":"20px"}`,
      background:outline?"transparent":`linear-gradient(135deg,${color},${color}CC)`,
      border:`1px solid ${color}`, borderRadius:12,
      color:outline?color:"#fff", fontSize:fs, fontWeight:700, cursor:"pointer",
      display:"flex", alignItems:"center", justifyContent:"center", gap:7,
      letterSpacing:0.3, fontFamily:"'Space Grotesk',system-ui",
      boxShadow:outline?"none":`0 4px 20px ${color}44`,
      textTransform:"uppercase",
    }}>
      {icon&&<span style={{fontSize:fs+2}}>{icon}</span>}{label}
    </button>
  );
}

function BotMsg({ children, time="9:41" }){
  return(
    <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:16}}>
      <div style={{width:36,height:36,borderRadius:"50%",
        background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:18,flexShrink:0,boxShadow:`0 0 12px ${Q.violet}44`}}>⬡</div>
      <div style={{flex:1}}>
        <div style={{color:Q.violet2,fontSize:11,fontWeight:700,marginBottom:3,
          fontFamily:"'Space Grotesk',system-ui",letterSpacing:0.3}}>QuartzPlay</div>
        <GCard style={{padding:"14px"}}>
          {children}
          <div style={{textAlign:"right",marginTop:6,color:Q.muted,fontSize:9,
            fontFamily:"'Space Grotesk',system-ui"}}>{time} ✓✓</div>
        </GCard>
      </div>
    </div>
  );
}

function UserMsg({ children, time="9:41" }){
  return(
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
      <GCard glow={Q.violet} style={{padding:"12px 14px",maxWidth:"75%",
        background:`linear-gradient(135deg,${Q.violet}22,${Q.cyan}08)`}}>
        <div style={{color:Q.text,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>{children}</div>
        <div style={{textAlign:"right",marginTop:4,color:Q.muted,fontSize:9}}>{time} ✓✓</div>
      </GCard>
    </div>
  );
}

function QKB({ rows, onPress }){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
      {rows.map((row,ri)=>(
        <div key={ri} style={{display:"flex",gap:6}}>
          {row.map((btn,bi)=>(
            <button key={bi} onClick={()=>onPress&&onPress(btn.action)} style={{
              flex:1,
              background:btn.primary?`linear-gradient(135deg,${btn.color||Q.violet},${btn.color2||Q.cyan})`:"rgba(255,255,255,0.04)",
              border:`1px solid ${btn.primary?(btn.color||Q.violet)+"88":Q.border}`,
              borderRadius:10, padding:"11px 6px", cursor:"pointer",
              color:"#fff", fontSize:12, fontWeight:btn.primary?700:500,
              fontFamily:"'Space Grotesk',system-ui",
              textTransform:btn.primary?"uppercase":"none",
              letterSpacing:btn.primary?0.3:0,
              boxShadow:btn.primary?`0 4px 16px ${btn.color||Q.violet}44`:"none",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}>
              {btn.icon&&<span style={{fontSize:14}}>{btn.icon}</span>}{btn.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function TgHeader({ title, sub, onBack }){
  return(
    <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
      padding:"10px 16px",display:"flex",alignItems:"center",gap:12,
      position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
        background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
      {onBack&&<button onClick={onBack} style={{background:"transparent",border:"none",
        color:Q.muted,fontSize:26,cursor:"pointer",padding:0,lineHeight:1}}>‹</button>}
      <div style={{width:40,height:40,borderRadius:"50%",
        background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:20,flexShrink:0,boxShadow:`0 0 14px ${Q.violet}66`}}>⬡</div>
      <div style={{flex:1}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{title}</div>
        {sub&&<div style={{color:Q.green,fontSize:11,marginTop:1}}>{sub}</div>}
      </div>
    </div>
  );
}

// ── DATA ──────────────────────────────────────────────────────
const SPORTS = [
  {icon:"🏆",name:"Mundial 2026",events:[
    {id:"w1",h:"Argentina",a:"Argelia",  time:"22:00",odds:{L:1.30,E:5.50,V:9.00},hot:true},
    {id:"w2",h:"Brasil",   a:"Marruecos",time:"19:00",odds:{L:1.55,E:4.20,V:5.80}},
    {id:"w3",h:"España",   a:"C.Verde",  time:"17:00",odds:{L:1.18,E:7.50,V:14.0}},
    {id:"w4",h:"Francia",  a:"Senegal",  time:"20:00",odds:{L:1.45,E:4.50,V:7.00}},
  ]},
  {icon:"🇦🇷",name:"Liga Argentina",events:[
    {id:"a1",h:"River",    a:"Boca",     time:"LIVE",  odds:{L:1.55,E:3.80,V:5.20},live:true,min:43,score:"1:0"},
    {id:"a2",h:"Racing",   a:"Independiente",time:"21:30",odds:{L:2.10,E:3.20,V:3.40}},
    {id:"a3",h:"San Lorenzo",a:"Huracán",time:"18:00",odds:{L:2.30,E:3.10,V:3.10}},
  ]},
  {icon:"⚽",name:"Champions League",events:[
    {id:"c1",h:"R.Madrid", a:"Bayern",   time:"LIVE",  odds:{L:2.10,E:3.40,V:3.20},live:true,min:67,score:"2:1"},
    {id:"c2",h:"City",     a:"Arsenal",  time:"21:00", odds:{L:1.75,E:3.60,V:4.50}},
  ]},
  {icon:"🏀",name:"NBA",events:[
    {id:"n1",h:"Lakers",   a:"Celtics",  time:"02:00", odds:{L:1.95,E:null,V:1.85}},
    {id:"n2",h:"Warriors", a:"Bulls",    time:"00:30", odds:{L:1.65,E:null,V:2.20}},
  ]},
  {icon:"🎾",name:"Wimbledon",events:[
    {id:"t1",h:"Djokovic", a:"Alcaraz",  time:"LIVE",  odds:{L:1.80,E:null,V:2.00},live:true,set:"2-1"},
    {id:"t2",h:"Swiatek",  a:"Sabalenka",time:"15:00", odds:{L:1.70,E:null,V:2.10}},
  ]},
  {icon:"🏈",name:"NFL",events:[
    {id:"f1",h:"Chiefs",   a:"Eagles",   time:"Dom 22:00",odds:{L:1.85,E:null,V:1.95}},
  ]},
  {icon:"🏒",name:"NHL",events:[
    {id:"h1",h:"Rangers",  a:"Bruins",   time:"01:00", odds:{L:2.10,E:null,V:1.75}},
  ]},
  {icon:"🥊",name:"MMA / UFC",events:[
    {id:"m1",h:"Adesanya", a:"Whittaker",time:"Dom 04:00",odds:{L:1.65,E:null,V:2.25}},
  ]},
];

const POOLS_ACTIVE = [
  {id:"p1",name:"Combo Mundial IA",picks:["Argentina gana","Brasil gana","España +1.5"],pot:284500,users:47,odd:3.12,closes:"02:00hs"},
  {id:"p2",name:"Clásico Argentino",picks:["River gana","Más de 1.5 goles"],pot:156200,users:28,odd:2.45,closes:"21:30hs"},
  {id:"p3",name:"Noche Champions",picks:["R.Madrid gana","City gana"],pot:98700,users:19,odd:1.89,closes:"20:45hs"},
];

const P2P_OFFERS = [
  {id:"o1",user:"@champion_ar",  offer:"Argentina gana @1.30",stake:50000, lay:65000,expires:"30 min",lv:14},
  {id:"o2",user:"@bet_king",     offer:"River gana @1.55",    stake:30000, lay:46500,expires:"45 min",lv:9},
  {id:"o3",user:"@apostador99",  offer:"R.Madrid gana @2.10", stake:20000, lay:42000,expires:"1h",    lv:12},
  {id:"o4",user:"@pibe_bets",    offer:"Djokovic gana @1.80", stake:15000, lay:27000,expires:"2h",    lv:6},
];

// ═══════════════════════════════════════════════════════════════
// PANTALLA 1 — CANAL PÚBLICO SPORTS
// ═══════════════════════════════════════════════════════════════
function ScreenCanal({ onBot }){
  const [pool,setPool] = useState(284500);
  useEffect(()=>{
    const t=setInterval(()=>setPool(v=>v+Math.round(Math.random()*200+50)),1200);
    return()=>clearInterval(t);
  },[]);

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={12}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>

        {/* Hero */}
        <GCard glow={Q.violet} style={{padding:"18px",marginBottom:14,
          background:`linear-gradient(135deg,${Q.violet}15,${Q.cyan}08)`}}>
          <Particles count={8}/>
          <div style={{position:"relative",zIndex:1,textAlign:"center"}}>
            <QPLogo size={22}/>
            <div style={{color:Q.muted,fontSize:11,marginTop:4,marginBottom:14,fontFamily:"'Space Grotesk',system-ui"}}>
              Sports Premium · 4 modos de apuesta 🇦🇷
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:14}}>
              <HBadge label="⚽ Prematch" color={Q.violet}/>
              <HBadge label="🔴 En Vivo" color={Q.pink}/>
              <HBadge label="🎯 Pool" color={Q.gold}/>
              <HBadge label="🤝 P2P" color={Q.teal}/>
            </div>
            <QKB rows={[[{label:"Abrir QuartzPlay Sports",action:"open",primary:true,icon:"⬡"}]]} onPress={onBot}/>
          </div>
        </GCard>

        {/* Live matches */}
        {SPORTS.flatMap(s=>s.events.filter(e=>e.live)).map(ev=>(
          <GCard key={ev.id} glow={Q.pink} style={{padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <LiveDot/>
              <span style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>
                {ev.h} vs {ev.a}
              </span>
              {ev.score&&<span style={{color:Q.gold,fontWeight:900,fontFamily:"'Space Grotesk',system-ui"}}>{ev.score}</span>}
              {ev.min&&<span style={{color:Q.muted,fontSize:11}}>Min {ev.min}'</span>}
              {ev.set&&<span style={{color:Q.muted,fontSize:11}}>Set {ev.set}</span>}
            </div>
            <div style={{display:"flex",gap:5,marginBottom:8}}>
              {[{l:ev.h,v:ev.odds.L,c:Q.amber},{l:"Empate",v:ev.odds.E,c:Q.muted},{l:ev.a,v:ev.odds.V,c:Q.cyan}]
                .filter(o=>o.v).map((o,i)=>(
                <div key={i} style={{flex:1,background:"rgba(255,255,255,0.04)",
                  border:`1px solid ${Q.border}`,borderRadius:9,padding:"7px 4px",textAlign:"center"}}>
                  <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{o.l}</div>
                  <div style={{color:o.c,fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(o.v)}</div>
                  <div style={{color:Q.pink,fontSize:8}}>◉ LIVE</div>
                </div>
              ))}
            </div>
            <QKB rows={[[{label:"APOSTAR EN VIVO",action:"open",primary:true,icon:"🎰",color:Q.pink,color2:Q.violet}]]} onPress={onBot}/>
          </GCard>
        ))}

        {/* Pool activo */}
        <GCard glow={Q.gold} style={{padding:"14px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{width:28,height:28,borderRadius:8,
              background:`linear-gradient(135deg,${Q.gold},${Q.amber})`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🎯</div>
            <div>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>POOL ACTIVO — Combo Mundial IA</div>
              <div style={{color:Q.muted,fontSize:11}}>47 jugadores · cierra a las 22:00hs</div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <GCard glow={Q.gold} style={{flex:1,padding:"8px",textAlign:"center"}}>
              <div style={{color:Q.gold,fontWeight:900,fontSize:18,fontFamily:"'Space Grotesk',system-ui"}}>{ars(pool)}</div>
              <div style={{color:Q.muted,fontSize:9}}>Pozo total</div>
            </GCard>
            <GCard style={{flex:1,padding:"8px",textAlign:"center"}}>
              <div style={{color:Q.cyan,fontWeight:700,fontSize:18,fontFamily:"'Space Grotesk',system-ui"}}>3.12x</div>
              <div style={{color:Q.muted,fontSize:9}}>Cuota combo</div>
            </GCard>
          </div>
          {["Argentina gana @1.30","Brasil gana @1.55","España +1.5 goles @1.62"].map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",
              borderBottom:i<2?`1px solid ${Q.dim}`:"none"}}>
              <span style={{color:Q.green,fontSize:11}}>✓</span>
              <span style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{p}</span>
            </div>
          ))}
          <QKB rows={[[{label:"UNIRME AL POOL",action:"open",primary:true,icon:"🎯",color:Q.gold,color2:Q.amber}]]} onPress={onBot}/>
        </GCard>

        {/* AI Combo */}
        <GCard glow={Q.violet} style={{padding:"14px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{width:28,height:28,borderRadius:8,
              background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>⚡</div>
            <div>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>AI COMBO #47 — 8/10</div>
              <div style={{display:"flex",gap:5,marginTop:2}}>
                <HBadge label="Confianza alta" color={Q.green}/>
              </div>
            </div>
          </div>
          {[{h:"Argentina",a:"Argelia",sel:"Argentina",odd:1.30},{h:"River",a:"Boca",sel:"River",odd:1.55,live:true},{h:"R.Madrid",a:"Bayern",sel:"R.Madrid",odd:2.10,live:true}].map((p,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",
              borderBottom:i<2?`1px solid ${Q.dim}`:"none"}}>
              <div>
                {p.live&&<><LiveDot/>{" "}</>}
                <span style={{color:Q.muted,fontSize:11}}>{p.h} vs {p.a} · </span>
                <span style={{color:Q.text,fontSize:12,fontWeight:600}}>{p.sel}</span>
              </div>
              <span style={{color:Q.cyan,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(p.odd)}</span>
            </div>
          ))}
          <NDiv color={Q.violet}/>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <div>
              <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Cuota</div>
              <div style={{color:Q.gold,fontWeight:900,fontSize:20,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(prod([1.30,1.55,2.10]))}x</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Ret. $10K</div>
              <div style={{color:Q.green,fontWeight:900,fontSize:18,fontFamily:"'Space Grotesk',system-ui"}}>{ars(Math.round(10000*prod([1.30,1.55,2.10])))}</div>
            </div>
          </div>
          <QKB rows={[[{label:"APOSTAR COMBO",action:"open",primary:true,icon:"⚡"}]]} onPress={onBot}/>
        </GCard>
      </div>

      {/* CTA */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:430,padding:"10px 12px 14px",
        background:`linear-gradient(0deg,${Q.void} 70%,transparent)`,zIndex:40}}>
        <button onClick={onBot} style={{
          width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
          border:"none",borderRadius:14,padding:"15px",
          color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",
          fontFamily:"'Space Grotesk',system-ui",letterSpacing:0.5,
          boxShadow:`0 8px 32px ${Q.violet}66`,textTransform:"uppercase",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
        }}>
          <span style={{fontSize:20}}>⬡</span> Abrir QuartzPlay Sports
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 2 — MENÚ SPORTS EN EL BOT
// ═══════════════════════════════════════════════════════════════
function ScreenSportsMenu({ onAction }){
  const [pool,setPool]=useState(284500);
  useEffect(()=>{const t=setInterval(()=>setPool(v=>v+Math.round(Math.random()*150+30)),1200);return()=>clearInterval(t);},[]);

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={10}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="9:43">/sports</UserMsg>
        <BotMsg time="9:43">
          {/* Balance */}
          <GCard glow={Q.green} style={{padding:"12px 14px",marginBottom:12,
            background:`linear-gradient(135deg,${Q.green}10,${Q.violet}08)`}}>
            <Particles count={4} c1={Q.green} c2={Q.violet}/>
            <div style={{position:"relative",zIndex:1,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:Q.muted,fontSize:9,letterSpacing:2,textTransform:"uppercase",fontFamily:"'Space Grotesk',system-ui"}}>SALDO</div>
                <div style={{color:Q.green,fontWeight:900,fontSize:22,fontFamily:"'Space Grotesk',system-ui",textShadow:`0 0 10px ${Q.green}66`}}>{ars(145000)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <HBadge label="Plan Pro ⭐" color={Q.violet}/>
                <div style={{color:Q.muted,fontSize:10,marginTop:4}}>Apuestas activas: 3</div>
              </div>
            </div>
          </GCard>

          {/* Live alert */}
          <GCard glow={Q.pink} style={{padding:"10px 12px",marginBottom:12,cursor:"pointer"}}
            onClick={()=>onAction("live")}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <LiveDot/>
                <div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>2 partidos en vivo ahora</div>
                  <div style={{color:Q.muted,fontSize:10}}>River 1:0 Boca · R.Madrid 2:1 Bayern</div>
                </div>
              </div>
              <span style={{color:Q.pink,fontSize:18}}>›</span>
            </div>
          </GCard>

          {/* Pool pozo */}
          <GCard glow={Q.gold} style={{padding:"10px 12px",marginBottom:12,cursor:"pointer"}}
            onClick={()=>onAction("pool")}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:Q.muted,fontSize:9,letterSpacing:1,textTransform:"uppercase",fontFamily:"'Space Grotesk',system-ui"}}>🎯 POOL ACTIVO</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:18,fontFamily:"'Space Grotesk',system-ui"}}>{ars(pool)}</div>
                <div style={{color:Q.muted,fontSize:10}}>47 jugadores · cierra 22:00hs</div>
              </div>
              <span style={{color:Q.gold,fontSize:18}}>›</span>
            </div>
          </GCard>

          {/* 4 modos */}
          <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,
            fontFamily:"'Space Grotesk',system-ui",marginBottom:8}}>Modos de apuesta</div>
          <QKB rows={[
            [{label:"📋 Prematch",action:"prematch",primary:true,color:Q.violet},{label:"🔴 En Vivo",action:"live",primary:true,color:Q.pink,color2:Q.violet}],
            [{label:"🎯 Pool",action:"pool",primary:true,color:Q.gold,color2:Q.amber},{label:"🤝 P2P",action:"p2p",primary:true,color:Q.teal,color2:Q.blue}],
            [{label:"⚡ AI Combo",action:"combo",icon:"⚡"},{label:"📊 Mis apuestas",action:"mybets",icon:"📊"}],
          ]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 3 — PREMATCH (todos los deportes)
// ═══════════════════════════════════════════════════════════════
function ScreenPrematch({ onAction, onBet }){
  const [bets,setBets]=useState([]);
  const [sport,setSport]=useState(null);
  const prematchSports=SPORTS.map(s=>({...s,events:s.events.filter(e=>!e.live)})).filter(s=>s.events.length>0);

  const toggle=(ev,label,odd)=>{
    setBets(p=>{
      const w=p.filter(b=>b.id!==ev.id);
      if(p.find(b=>b.id===ev.id&&b.label===label)) return w;
      return[...w,{id:ev.id,label,odd,h:ev.h,a:ev.a}];
    });
  };
  const isSel=(id,l)=>bets.some(b=>b.id===id&&b.label===l);
  const tot=bets.length?prod(bets.map(b=>b.odd)):1;

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={8} c1={Q.violet} c2={Q.cyan}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="9:50">📋 Prematch</UserMsg>
        <BotMsg time="9:50">
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:10,fontFamily:"'Space Grotesk',system-ui"}}>📋 Apuestas Prematch</div>

          {/* Sport filter */}
          <div style={{display:"flex",gap:5,overflowX:"auto",marginBottom:12,paddingBottom:2}}>
            <button onClick={()=>setSport(null)} style={{
              background:!sport?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
              border:`1px solid ${!sport?Q.cyan:Q.border}`,borderRadius:20,
              padding:"5px 12px",cursor:"pointer",color:!sport?Q.cyan:Q.muted,
              fontSize:10,fontWeight:!sport?700:400,fontFamily:"'Space Grotesk',system-ui",whiteSpace:"nowrap",flexShrink:0,
            }}>Todos</button>
            {prematchSports.map(s=>(
              <button key={s.name} onClick={()=>setSport(s.name)} style={{
                background:sport===s.name?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
                border:`1px solid ${sport===s.name?Q.cyan:Q.border}`,borderRadius:20,
                padding:"5px 12px",cursor:"pointer",color:sport===s.name?Q.cyan:Q.muted,
                fontSize:10,fontWeight:sport===s.name?700:400,fontFamily:"'Space Grotesk',system-ui",whiteSpace:"nowrap",flexShrink:0,
              }}>{s.icon} {s.name}</button>
            ))}
          </div>

          {/* Events */}
          {prematchSports.filter(s=>!sport||s.name===sport).map(s=>(
            <div key={s.name} style={{marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:16}}>{s.icon}</span>
                <span style={{color:Q.violet2,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{s.name}</span>
              </div>
              {s.events.map(ev=>(
                <GCard key={ev.id} style={{padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>
                      {ev.h} <span style={{color:Q.dim}}>vs</span> {ev.a}
                    </div>
                    <span style={{color:Q.muted,fontSize:11}}>{ev.time}</span>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    {[{l:ev.h,v:ev.odds.L},{l:ev.odds.E?"Empate":null,v:ev.odds.E},{l:ev.a,v:ev.odds.V}]
                      .filter(o=>o.l&&o.v).map((o,i)=>(
                      <button key={i} onClick={()=>toggle(ev,o.l,o.v)} style={{
                        flex:1,
                        background:isSel(ev.id,o.l)?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
                        border:`1.5px solid ${isSel(ev.id,o.l)?Q.cyan:Q.border}`,
                        borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",
                        boxShadow:isSel(ev.id,o.l)?`0 0 12px ${Q.cyan}33`:"none",transition:"all 0.2s",
                      }}>
                        <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{o.l}</div>
                        <div style={{color:isSel(ev.id,o.l)?Q.cyan:Q.text,fontWeight:700,fontSize:14,
                          fontFamily:"'Space Grotesk',system-ui"}}>{fmt(o.v)}</div>
                      </button>
                    ))}
                  </div>
                </GCard>
              ))}
            </div>
          ))}
          <QKB rows={[[{label:"◀ Sports",action:"sports"},{label:"⚡ AI Combo",action:"combo"}]]} onPress={onAction}/>
        </BotMsg>

        {/* Floating betslip */}
        {bets.length>0&&(
          <div style={{position:"fixed",bottom:10,left:"50%",transform:"translateX(-50%)",
            width:"calc(100% - 24px)",maxWidth:406,zIndex:40}}>
            <GCard glow={Q.violet} style={{padding:"12px 14px",background:"rgba(6,6,18,0.97)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{color:Q.muted,fontSize:12}}>{bets.length} picks · <span style={{color:Q.cyan,fontWeight:700}}>{fmt(tot)}x</span></span>
                <span style={{color:Q.green,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>Ret: {ars(Math.round(10000*tot))}</span>
              </div>
              <QBtn label={`APOSTAR $10.000`} full color={Q.violet} size="lg" onClick={()=>onBet(bets,10000,tot)}/>
            </GCard>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 4 — EN VIVO (tracker)
// ═══════════════════════════════════════════════════════════════
function ScreenLive({ onAction, onBet }){
  const [bets,setBets]=useState([]);
  const [selEvent,setSelEvent]=useState(null);
  const [minute,setMinute]=useState({a1:43,c1:67,t1:null});
  const liveEvents=SPORTS.flatMap(s=>s.events.filter(e=>e.live).map(e=>({...e,sport:s.name,icon:s.icon})));

  useEffect(()=>{
    const t=setInterval(()=>{
      setMinute(m=>({...m,a1:Math.min(90,m.a1+1),c1:Math.min(90,m.c1+1)}));
    },4000);
    return()=>clearInterval(t);
  },[]);

  const toggle=(ev,label,odd)=>{
    setBets(p=>{
      const w=p.filter(b=>b.id!==ev.id);
      if(p.find(b=>b.id===ev.id&&b.label===label)) return w;
      return[...w,{id:ev.id,label,odd,h:ev.h,a:ev.a}];
    });
  };
  const isSel=(id,l)=>bets.some(b=>b.id===id&&b.label===l);
  const tot=bets.length?prod(bets.map(b=>b.odd)):1;

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={8} c1={Q.pink} c2={Q.violet}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="9:55">🔴 En Vivo</UserMsg>
        <BotMsg time="9:55">
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <LiveDot/>
            <span style={{color:Q.text,fontWeight:700,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}>{liveEvents.length} partidos en vivo</span>
          </div>

          {liveEvents.map(ev=>{
            const min=minute[ev.id];
            return(
              <GCard key={ev.id} glow={Q.pink} style={{padding:"14px",marginBottom:10,
                background:`linear-gradient(135deg,${Q.pink}08,${Q.violet}05)`}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <span style={{fontSize:16}}>{ev.icon}</span>
                  <HBadge label={ev.sport} color={Q.pink}/>
                  <LiveDot/>
                  {min&&<span style={{color:Q.muted,fontSize:11}}>Min {min}'</span>}
                  {ev.set&&<span style={{color:Q.muted,fontSize:11}}>Set {ev.set}</span>}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{textAlign:"center",flex:1}}>
                    <div style={{fontSize:22,marginBottom:3}}>
                      {ev.id==="a1"?"🔴":ev.id==="c1"?"⚪":"🎾"}
                    </div>
                    <div style={{color:Q.text,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{ev.h}</div>
                  </div>
                  <div style={{textAlign:"center",padding:"0 10px"}}>
                    {ev.score?(
                      <div style={{fontFamily:"'Space Grotesk',system-ui",fontWeight:900,fontSize:30,color:Q.text}}>
                        {ev.score.split(":")[0]}<span style={{color:Q.dim}}>:</span>{ev.score.split(":")[1]}
                      </div>
                    ):(
                      <div style={{color:Q.muted,fontSize:14}}>vs</div>
                    )}
                    <div style={{color:Q.pink,fontSize:9,fontFamily:"'Space Grotesk',system-ui",letterSpacing:1}}>EN CURSO</div>
                  </div>
                  <div style={{textAlign:"center",flex:1}}>
                    <div style={{fontSize:22,marginBottom:3}}>
                      {ev.id==="a1"?"🔵":ev.id==="c1"?"🔴":"🎾"}
                    </div>
                    <div style={{color:Q.text,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{ev.a}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:5}}>
                  {[{l:ev.h,v:ev.odds.L,c:Q.amber},{l:ev.odds.E?"Empate":null,v:ev.odds.E,c:Q.muted},{l:ev.a,v:ev.odds.V,c:Q.cyan}]
                    .filter(o=>o.l&&o.v).map((o,i)=>(
                    <button key={i} onClick={()=>toggle(ev,o.l,o.v)} style={{
                      flex:1,
                      background:isSel(ev.id,o.l)?`linear-gradient(135deg,${Q.pink}44,${Q.violet}22)`:"rgba(255,255,255,0.04)",
                      border:`1.5px solid ${isSel(ev.id,o.l)?Q.pink:Q.border}`,
                      borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",transition:"all 0.2s",
                    }}>
                      <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{o.l}</div>
                      <div style={{color:isSel(ev.id,o.l)?Q.pink:o.c,fontWeight:700,fontSize:15,
                        fontFamily:"'Space Grotesk',system-ui"}}>{fmt(o.v)}</div>
                      <div style={{color:Q.pink,fontSize:8}}>◉ LIVE</div>
                    </button>
                  ))}
                </div>
              </GCard>
            );
          })}
          <QKB rows={[[{label:"◀ Sports",action:"sports"},{label:"📋 Prematch",action:"prematch"}]]} onPress={onAction}/>
        </BotMsg>

        {bets.length>0&&(
          <div style={{position:"fixed",bottom:10,left:"50%",transform:"translateX(-50%)",
            width:"calc(100% - 24px)",maxWidth:406,zIndex:40}}>
            <GCard glow={Q.pink} style={{padding:"12px 14px",background:"rgba(6,6,18,0.97)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <LiveDot/>
                  <span style={{color:Q.muted,fontSize:12}}>{bets.length} picks · <span style={{color:Q.pink,fontWeight:700}}>{fmt(tot)}x</span></span>
                </div>
                <span style={{color:Q.green,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>Ret: {ars(Math.round(10000*tot))}</span>
              </div>
              <QBtn label="APOSTAR EN VIVO" full color={Q.pink} size="lg" onClick={()=>onBet(bets,10000,tot)}/>
            </GCard>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 5 — POOL DE USUARIOS
// ═══════════════════════════════════════════════════════════════
function ScreenPool({ onAction }){
  const [joined,setJoined]=useState(null);
  const [amount,setAmount]=useState(5000);
  const [pot,setPot]=useState({p1:284500,p2:156200,p3:98700});

  useEffect(()=>{
    const t=setInterval(()=>setPot(p=>({
      p1:p.p1+Math.round(Math.random()*300+100),
      p2:p.p2+Math.round(Math.random()*200+50),
      p3:p.p3+Math.round(Math.random()*150+30),
    })),1500);
    return()=>clearInterval(t);
  },[]);

  if(joined){
    const pool=POOLS_ACTIVE.find(p=>p.id===joined);
    return(
      <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
        <Particles count={10} c1={Q.gold} c2={Q.green}/>
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
          backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
          backgroundSize:"28px 28px"}}/>
        <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
          <BotMsg time="10:05">
            <div style={{textAlign:"center",marginBottom:12,position:"relative"}}>
              <Particles count={8} c1={Q.gold} c2={Q.green}/>
              <div style={{position:"relative",zIndex:1}}>
                <div style={{fontSize:48,marginBottom:6}}>🎯</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:18,fontFamily:"'Space Grotesk',system-ui",marginBottom:4}}>¡Te uniste al Pool!</div>
                <div style={{color:Q.muted,fontSize:12}}>{pool.name}</div>
              </div>
            </div>
            <GCard glow={Q.gold} style={{padding:"14px",marginBottom:12}}>
              {[
                ["Tu apuesta",ars(amount)+" ARS",Q.text],
                ["Pozo actual",ars(pot[joined]),Q.gold],
                ["Tu cuota",fmt(pool.odd)+"x",Q.cyan],
                ["Retorno pot.",ars(Math.round(amount*pool.odd))+" ARS",Q.green],
                ["Comisión casa","8%",Q.muted],
                ["Cierra",pool.closes,Q.muted],
              ].map(([l,v,c],i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",
                  padding:"6px 0",borderBottom:i<5?`1px solid ${Q.dim}`:"none"}}>
                  <span style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{l}</span>
                  <span style={{color:c,fontWeight:i<1||i===3?400:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{v}</span>
                </div>
              ))}
            </GCard>
            <div style={{color:Q.amber,fontSize:11,marginBottom:10,fontFamily:"'Space Grotesk',system-ui"}}>
              🔔 Te notificamos el resultado automáticamente
            </div>
            <QKB rows={[
              [{label:"🎯 Ver otros pools",action:"pool"},{label:"◀ Sports",action:"sports"}],
            ]} onPress={a=>{if(a==="pool")setJoined(null);else onAction(a);}}/>
          </BotMsg>
        </div>
      </div>
    );
  }

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={8} c1={Q.gold} c2={Q.amber}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="10:00">🎯 Pool</UserMsg>
        <BotMsg time="10:00">
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,fontFamily:"'Space Grotesk',system-ui"}}>🎯 Pools activos</div>
          <div style={{color:Q.muted,fontSize:11,marginBottom:12}}>Pozo compartido entre usuarios · 8% comisión</div>

          {POOLS_ACTIVE.map(pool=>(
            <GCard key={pool.id} glow={Q.gold} style={{padding:"14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>{pool.name}</div>
                  <div style={{display:"flex",gap:6,marginTop:3}}>
                    <HBadge label={`${pool.users} jugadores`} color={Q.violet}/>
                    <HBadge label={`Cierra ${pool.closes}`} color={Q.muted}/>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:Q.gold,fontWeight:900,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}>{ars(pot[pool.id])}</div>
                  <div style={{color:Q.muted,fontSize:9}}>pozo</div>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                {pool.picks.map((p,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",
                    borderBottom:i<pool.picks.length-1?`1px solid ${Q.dim}`:"none"}}>
                    <span style={{color:Q.green,fontSize:11}}>✓</span>
                    <span style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{p}</span>
                  </div>
                ))}
              </div>
              <NDiv color={Q.gold}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div>
                  <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1}}>Cuota combo</div>
                  <div style={{color:Q.cyan,fontWeight:700,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(pool.odd)}x</div>
                </div>
                <div style={{display:"flex",gap:5}}>
                  {[2000,5000,10000].map(v=>(
                    <button key={v} onClick={()=>setAmount(v)} style={{
                      background:amount===v?`${Q.gold}33`:"rgba(255,255,255,0.04)",
                      border:`1px solid ${amount===v?Q.gold:Q.border}`,
                      borderRadius:8,padding:"5px 8px",cursor:"pointer",
                      color:amount===v?Q.gold:Q.muted,fontSize:10,fontWeight:amount===v?700:400,
                      fontFamily:"'Space Grotesk',system-ui",
                    }}>{ars(v)}</button>
                  ))}
                </div>
              </div>
              <button onClick={()=>setJoined(pool.id)} style={{
                width:"100%",background:`linear-gradient(135deg,${Q.gold},${Q.amber})`,
                border:"none",borderRadius:12,padding:"13px",
                color:Q.void,fontWeight:700,fontSize:14,cursor:"pointer",
                fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",letterSpacing:0.3,
                boxShadow:`0 4px 16px ${Q.gold}44`,
              }}>UNIRME CON {ars(amount)}</button>
            </GCard>
          ))}

          {/* Crear pool */}
          <GCard glow={Q.violet} style={{padding:"14px",marginBottom:10}}>
            <div style={{color:Q.violet2,fontWeight:700,fontSize:13,marginBottom:6,fontFamily:"'Space Grotesk',system-ui"}}>➕ Crear mi propio pool</div>
            <div style={{color:Q.muted,fontSize:12,marginBottom:10}}>Seleccioná tus picks, definí el monto mínimo y compartí con otros usuarios</div>
            <QKB rows={[[{label:"CREAR POOL",action:"create_pool",primary:true,icon:"🎯",color:Q.violet}]]} onPress={onAction}/>
          </GCard>
          <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 6 — P2P ENTRE USUARIOS
// ═══════════════════════════════════════════════════════════════
function ScreenP2P({ onAction }){
  const [matched,setMatched]=useState(null);
  const [myOffer,setMyOffer]=useState(false);
  const [offerStep,setOfferStep]=useState(0);
  const [myPick,setMyPick]=useState("");
  const [myStake,setMyStake]=useState(10000);

  if(matched){
    return(
      <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
        <Particles count={10} c1={Q.teal} c2={Q.green}/>
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
          backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
          backgroundSize:"28px 28px"}}/>
        <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
          <BotMsg time="10:15">
            <div style={{textAlign:"center",marginBottom:12,position:"relative"}}>
              <Particles count={8} c1={Q.teal} c2={Q.green}/>
              <div style={{position:"relative",zIndex:1}}>
                <div style={{fontSize:48,marginBottom:6}}>🤝</div>
                <div style={{color:Q.teal,fontWeight:900,fontSize:18,fontFamily:"'Space Grotesk',system-ui",marginBottom:4}}>¡Match P2P!</div>
                <div style={{color:Q.muted,fontSize:12}}>Apuesta confirmada entre usuarios</div>
              </div>
            </div>
            <GCard glow={Q.teal} style={{padding:"14px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{textAlign:"center",flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>Vos</div>
                  <div style={{color:Q.muted,fontSize:11}}>Contra {matched.offer}</div>
                  <div style={{color:Q.green,fontWeight:700,fontSize:16,fontFamily:"'Space Grotesk',system-ui",marginTop:4}}>{ars(matched.lay)}</div>
                </div>
                <div style={{textAlign:"center",padding:"0 10px"}}>
                  <div style={{color:Q.teal,fontSize:24}}>🤝</div>
                </div>
                <div style={{textAlign:"center",flex:1}}>
                  <div style={{color:Q.text,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{matched.user}</div>
                  <div style={{color:Q.muted,fontSize:11}}>{matched.offer}</div>
                  <div style={{color:Q.green,fontWeight:700,fontSize:16,fontFamily:"'Space Grotesk',system-ui",marginTop:4}}>{ars(matched.stake)}</div>
                </div>
              </div>
              <NDiv color={Q.teal}/>
              {[
                ["Pozo total",ars(matched.stake+matched.lay)+" ARS",Q.gold],
                ["Si ganás",ars(matched.stake+matched.lay)+" ARS",Q.green],
                ["Comisión","2%",Q.muted],
                ["Liquida","Al finalizar el partido",Q.muted],
              ].map(([l,v,c],i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",
                  padding:"5px 0",borderBottom:i<3?`1px solid ${Q.dim}`:"none"}}>
                  <span style={{color:Q.muted,fontSize:12}}>{l}</span>
                  <span style={{color:c,fontWeight:i<2?700:400,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{v}</span>
                </div>
              ))}
            </GCard>
            <div style={{color:Q.amber,fontSize:11,marginBottom:10}}>🔔 Te avisamos el resultado automáticamente</div>
            <QKB rows={[
              [{label:"🤝 Ver mis apuestas P2P",action:"mybets"},{label:"◀ Sports",action:"sports"}],
            ]} onPress={a=>{if(a==="sports")onAction("sports");else setMatched(null);}}/>
          </BotMsg>
        </div>
      </div>
    );
  }

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={8} c1={Q.teal} c2={Q.blue}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="10:10">🤝 P2P</UserMsg>
        <BotMsg time="10:10">
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:4,fontFamily:"'Space Grotesk',system-ui"}}>🤝 Apuestas P2P</div>
          <div style={{color:Q.muted,fontSize:11,marginBottom:12}}>Apostá directamente contra otros usuarios · Solo 2% de comisión</div>

          {/* Tabs */}
          <div style={{display:"flex",gap:5,marginBottom:12}}>
            {[{k:"offers",l:"Ofertas activas"},{k:"create",l:"Crear oferta"}].map((t,i)=>(
              <button key={t.k} onClick={()=>setMyOffer(i===1)} style={{
                flex:1,
                background:myOffer===(i===1)?`linear-gradient(135deg,${Q.teal}44,${Q.blue}22)`:"rgba(255,255,255,0.04)",
                border:`1px solid ${myOffer===(i===1)?Q.teal:Q.border}`,
                borderRadius:10,padding:"8px",cursor:"pointer",
                color:myOffer===(i===1)?Q.teal:Q.muted,fontSize:12,fontWeight:700,
                fontFamily:"'Space Grotesk',system-ui",
              }}>{t.l}</button>
            ))}
          </div>

          {/* Offers list */}
          {!myOffer&&(
            <>
              {P2P_OFFERS.map(offer=>(
                <GCard key={offer.id} glow={Q.teal} style={{padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:32,height:32,borderRadius:"50%",
                        background:`linear-gradient(135deg,${Q.violet}66,${Q.cyan}44)`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:14,fontWeight:700,color:Q.text}}>
                        {offer.user.charAt(1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{color:Q.text,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{offer.user}</div>
                        <HBadge label={`LV ${offer.lv}`} color={Q.violet}/>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{color:Q.muted,fontSize:9}}>Expira en</div>
                      <div style={{color:Q.amber,fontSize:11,fontWeight:700}}>{offer.expires}</div>
                    </div>
                  </div>
                  <div style={{background:"rgba(0,229,212,0.06)",border:`1px solid ${Q.teal}33`,
                    borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                    <div style={{color:Q.teal,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{offer.offer}</div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <span style={{color:Q.muted,fontSize:11}}>Apuesta: </span>
                      <span style={{color:Q.gold,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{ars(offer.stake)}</span>
                      <span style={{color:Q.muted,fontSize:11}}> · Ganás: </span>
                      <span style={{color:Q.green,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{ars(offer.lay)}</span>
                    </div>
                    <button onClick={()=>setMatched(offer)} style={{
                      background:`linear-gradient(135deg,${Q.teal},${Q.blue})`,
                      border:"none",borderRadius:8,padding:"8px 14px",
                      color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",
                      fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
                      boxShadow:`0 4px 12px ${Q.teal}44`,
                    }}>ACEPTAR</button>
                  </div>
                </GCard>
              ))}
            </>
          )}

          {/* Create offer */}
          {myOffer&&(
            <GCard glow={Q.teal} style={{padding:"14px"}}>
              <div style={{color:Q.text,fontWeight:700,fontSize:13,marginBottom:12,fontFamily:"'Space Grotesk',system-ui"}}>Crear oferta P2P</div>

              <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:6,fontFamily:"'Space Grotesk',system-ui"}}>Tu pick</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                {["Argentina gana @1.30","River gana @1.55","R.Madrid gana @2.10","Djokovic gana @1.80"].map(p=>(
                  <button key={p} onClick={()=>setMyPick(p)} style={{
                    background:myPick===p?`${Q.teal}22`:"rgba(255,255,255,0.04)",
                    border:`1px solid ${myPick===p?Q.teal:Q.border}`,
                    borderRadius:8,padding:"6px 10px",cursor:"pointer",
                    color:myPick===p?Q.teal:Q.muted,fontSize:11,
                    fontFamily:"'Space Grotesk',system-ui",
                  }}>{p}</button>
                ))}
              </div>

              <div style={{color:Q.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:6,fontFamily:"'Space Grotesk',system-ui"}}>Monto a apostar</div>
              <div style={{display:"flex",gap:5,marginBottom:12}}>
                {[5000,10000,20000,50000].map(v=>(
                  <button key={v} onClick={()=>setMyStake(v)} style={{
                    flex:1,
                    background:myStake===v?`${Q.teal}22`:"rgba(255,255,255,0.04)",
                    border:`1px solid ${myStake===v?Q.teal:Q.border}`,
                    borderRadius:8,padding:"7px 4px",cursor:"pointer",
                    color:myStake===v?Q.teal:Q.muted,fontSize:10,fontWeight:myStake===v?700:400,
                    fontFamily:"'Space Grotesk',system-ui",
                  }}>{ars(v)}</button>
                ))}
              </div>

              {myPick&&(
                <GCard style={{padding:"10px 12px",marginBottom:12}}>
                  <div style={{color:Q.muted,fontSize:11}}>Tu oferta: <span style={{color:Q.teal,fontWeight:700}}>{myPick}</span></div>
                  <div style={{color:Q.muted,fontSize:11}}>Apostás: <span style={{color:Q.gold,fontWeight:700}}>{ars(myStake)}</span> · Otros apuestan en contra</div>
                </GCard>
              )}

              <button disabled={!myPick} onClick={()=>setMatched({
                user:"Sistema",offer:myPick,stake:myStake,lay:Math.round(myStake*1.5),
              })} style={{
                width:"100%",
                background:myPick?`linear-gradient(135deg,${Q.teal},${Q.blue})`:"rgba(255,255,255,0.04)",
                border:`1px solid ${myPick?Q.teal:Q.border}`,
                borderRadius:12,padding:"14px",
                color:myPick?"#fff":Q.dim,fontWeight:700,fontSize:14,
                cursor:myPick?"pointer":"not-allowed",
                fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",
                boxShadow:myPick?`0 4px 16px ${Q.teal}44`:"none",
              }}>PUBLICAR OFERTA</button>
            </GCard>
          )}

          <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 7 — APUESTA CONFIRMADA
// ═══════════════════════════════════════════════════════════════
function ScreenBetConfirmed({ bets, stake, odd, onAction }){
  const ret=Math.round(stake*odd);
  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={14} c1={Q.green} c2={Q.violet}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <BotMsg time="10:20">
          <div style={{textAlign:"center",marginBottom:14,position:"relative"}}>
            <Particles count={10} c1={Q.green} c2={Q.gold}/>
            <div style={{position:"relative",zIndex:1}}>
              <div style={{fontSize:52,marginBottom:8,filter:`drop-shadow(0 0 16px ${Q.green})`}}>🎰</div>
              <div style={{fontFamily:"'Space Grotesk',system-ui",fontWeight:900,fontSize:20,
                color:Q.green,textShadow:`0 0 16px ${Q.green}66`,marginBottom:4}}>¡Apuesta registrada!</div>
            </div>
          </div>
          <GCard glow={Q.green} style={{padding:"14px",marginBottom:12}}>
            {bets.map((b,i)=>(
              <div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${Q.dim}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:Q.muted,fontSize:11}}>{b.h} vs {b.a}</span>
                  <span style={{color:Q.cyan,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{fmt(b.odd)}</span>
                </div>
                <div style={{color:Q.text,fontSize:12,fontWeight:600,fontFamily:"'Space Grotesk',system-ui"}}>{b.label}</div>
              </div>
            ))}
            <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${Q.violet}44`}}>
              {[["Apostado",ars(stake)+" ARS",Q.text],["Cuota",fmt(odd)+"x",Q.cyan],["Retorno pot.",ars(ret)+" ARS",Q.green]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                  <span style={{color:Q.muted,fontSize:12}}>{l}</span>
                  <span style={{color:c,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{v}</span>
                </div>
              ))}
            </div>
          </GCard>
          <div style={{color:Q.amber,fontSize:11,marginBottom:10,fontFamily:"'Space Grotesk',system-ui"}}>
            🔔 Te notificamos el resultado automáticamente
          </div>
          <QKB rows={[
            [{label:"🔴 Ver en vivo",action:"live",primary:true,color:Q.pink}],
            [{label:"⚡ Nuevo combo",action:"combo"},{label:"◀ Sports",action:"sports"}],
          ]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PANTALLA 8 — MIS APUESTAS
// ═══════════════════════════════════════════════════════════════
function ScreenMyBets({ onAction }){
  const MY_BETS=[
    {id:"b1",picks:"Argentina gana",odd:1.30,stake:15000,ret:19500,status:"active",time:"Hoy 22:00"},
    {id:"b2",picks:"River gana + R.Madrid gana",odd:3.26,stake:10000,ret:32600,status:"active",time:"En vivo"},
    {id:"b3",picks:"Pool Combo Mundial",odd:3.12,stake:5000,ret:15600,status:"pool",time:"Hoy 22:00"},
    {id:"b4",picks:"P2P vs @champion_ar · Brasil",odd:1.55,stake:20000,ret:31000,status:"p2p",time:"Hoy 19:00"},
    {id:"b5",picks:"España gana",odd:1.18,stake:8000,ret:9440,status:"won",time:"Ayer"},
    {id:"b6",picks:"Lakers gana",odd:1.95,stake:5000,ret:0,status:"lost",time:"Ayer"},
  ];

  const colors={active:Q.cyan,pool:Q.gold,p2p:Q.teal,won:Q.green,lost:Q.red};
  const labels={active:"ACTIVA",pool:"POOL",p2p:"P2P",won:"GANADA ✓",lost:"PERDIDA ✗"};

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={8}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="10:25">/mis_apuestas</UserMsg>
        <BotMsg time="10:25">
          <div style={{color:Q.text,fontWeight:700,fontSize:14,marginBottom:12,fontFamily:"'Space Grotesk',system-ui"}}>📊 Mis apuestas</div>

          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
            {[{l:"Activas",v:"4",c:Q.cyan},{l:"Ganadas",v:"12",c:Q.green},{l:"P&L",v:"+$43K",c:Q.green}].map((s,i)=>(
              <GCard key={i} glow={s.c} style={{padding:"8px",textAlign:"center"}}>
                <div style={{color:s.c,fontWeight:700,fontSize:15,fontFamily:"'Space Grotesk',system-ui"}}>{s.v}</div>
                <div style={{color:Q.muted,fontSize:9,fontFamily:"'Space Grotesk',system-ui"}}>{s.l}</div>
              </GCard>
            ))}
          </div>

          {MY_BETS.map(bet=>(
            <GCard key={bet.id} glow={colors[bet.status]} style={{padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{flex:1,marginRight:8}}>
                  <div style={{color:Q.text,fontSize:12,fontWeight:600,fontFamily:"'Space Grotesk',system-ui",marginBottom:2}}>{bet.picks}</div>
                  <div style={{color:Q.muted,fontSize:10}}>{bet.time} · {fmt(bet.odd)}x</div>
                </div>
                <HBadge label={labels[bet.status]} color={colors[bet.status]}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:Q.muted,fontSize:11}}>Apostado: <span style={{color:Q.text,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{ars(bet.stake)}</span></span>
                <span style={{color:bet.status==="won"?Q.green:bet.status==="lost"?Q.red:Q.cyan,fontWeight:700,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>
                  {bet.status==="won"?"+"+ars(bet.ret):bet.status==="lost"?"-"+ars(bet.stake):"→ "+ars(bet.ret)}
                </span>
              </div>
            </GCard>
          ))}
          <QKB rows={[[{label:"◀ Sports",action:"sports"}]]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// PANTALLA — AI COMBOS
// ═══════════════════════════════════════════════════════════════
const AI_COMBOS = [
  {
    id:"c1", name:"AI COMBO #47", conf:8, tag:"Confianza alta", tagColor:"#00FF88",
    picks:[
      {h:"Argentina",a:"Argelia",  sel:"Argentina gana",   odd:1.30, mkt:"1X2",    live:false},
      {h:"River",    a:"Boca",     sel:"River gana",        odd:1.55, mkt:"1X2",    live:true, min:43},
      {h:"R.Madrid", a:"Bayern",   sel:"R.Madrid gana",     odd:2.10, mkt:"1X2",    live:true, min:67},
      {h:"Francia",  a:"Senegal",  sel:"Francia gana",      odd:1.45, mkt:"1X2",    live:false},
    ],
    note:"River domina en casa · Argentina favorita clara · Francia sólida",
  },
  {
    id:"c2", name:"AI COMBO #48", conf:7, tag:"Goles & Over", tagColor:"#FFB800",
    picks:[
      {h:"España",   a:"C.Verde",  sel:"Más de 2.5 goles", odd:1.40, mkt:"O/U",    live:false},
      {h:"Brasil",   a:"Marruecos",sel:"Más de 1.5 goles", odd:1.55, mkt:"O/U",    live:false},
      {h:"City",     a:"Arsenal",  sel:"Ambos anotan",      odd:1.70, mkt:"BTTS",   live:false},
    ],
    note:"3 partidos con alto dominio ofensivo · Equipos con plantilla goleadora",
  },
  {
    id:"c3", name:"AI COMBO #49", conf:9, tag:"Alta cuota", tagColor:"#9F5FFF",
    picks:[
      {h:"Lakers",   a:"Celtics",  sel:"Lakers gana",       odd:1.95, mkt:"ML",     live:false},
      {h:"Warriors", a:"Bulls",    sel:"Warriors -5.5",     odd:1.85, mkt:"Handicap",live:false},
      {h:"Djokovic", a:"Alcaraz",  sel:"Djokovic gana",     odd:1.80, mkt:"ML",     live:true, set:"2-1"},
      {h:"Chiefs",   a:"Eagles",   sel:"Chiefs gana",       odd:1.85, mkt:"ML",     live:false},
    ],
    note:"Alta cuota · Favoritos en todas las ligas · Riesgo moderado",
  },
];

function ScreenCombo({ onAction, onBet }){
  const [sel,setSel]=useState("c1");
  const [voted,setVoted]=useState({});
  const combo=AI_COMBOS.find(c=>c.id===sel)||AI_COMBOS[0];
  const tot=combo.picks.reduce((a,p)=>a*p.odd,1);
  const stake=10000;

  return(
    <div style={{background:Q.void,minHeight:"100%",position:"relative"}}>
      <Particles count={10} c1={Q.violet} c2={Q.cyan}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        backgroundImage:`linear-gradient(${Q.violet}04 1px,transparent 1px),linear-gradient(90deg,${Q.violet}04 1px,transparent 1px)`,
        backgroundSize:"28px 28px"}}/>
      <div style={{position:"relative",zIndex:1,padding:"14px 12px 80px"}}>
        <UserMsg time="10:30">⚡ Combinadas IA</UserMsg>
        <BotMsg time="10:30">
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <div style={{width:30,height:30,borderRadius:9,
              background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
              boxShadow:`0 0 12px ${Q.violet}44`}}>⚡</div>
            <div>
              <div style={{color:Q.text,fontWeight:700,fontSize:14,fontFamily:"'Space Grotesk',system-ui"}}>AI Combos del día</div>
              <div style={{color:Q.muted,fontSize:11}}>Generados por QuartzPlay IA · Actualizados cada hora</div>
            </div>
          </div>

          {/* Selector de combos */}
          <div style={{display:"flex",gap:5,marginBottom:14}}>
            {AI_COMBOS.map(c=>(
              <button key={c.id} onClick={()=>setSel(c.id)} style={{
                flex:1,
                background:sel===c.id?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"rgba(255,255,255,0.04)",
                border:`1px solid ${sel===c.id?Q.cyan:Q.border}`,
                borderRadius:10,padding:"8px 4px",cursor:"pointer",textAlign:"center",
              }}>
                <div style={{color:sel===c.id?Q.cyan:Q.muted,fontSize:10,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{c.name.replace("AI ","")}</div>
                <div style={{color:sel===c.id?Q.gold:Q.dim,fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui",marginTop:2}}>
                  {combo.id===c.id?`${c.picks.reduce((a,p)=>a*p.odd,1).toFixed(2)}x`:`${c.picks.reduce((a,p)=>a*p.odd,1).toFixed(2)}x`}
                </div>
              </button>
            ))}
          </div>

          {/* Combo seleccionado */}
          <GCard glow={Q.violet} style={{padding:"14px",marginBottom:12,
            background:`linear-gradient(135deg,${Q.violet}10,${Q.cyan}05)`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <HBadge label={combo.name} color={Q.violet}/>
                <HBadge label={`${combo.conf}/10`} color={combo.tagColor}/>
              </div>
              <HBadge label={combo.tag} color={combo.tagColor}/>
            </div>

            {combo.picks.map((p,i)=>(
              <GCard key={i} style={{padding:"10px 12px",marginBottom:6,
                background:"rgba(124,58,237,0.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1,marginRight:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      {p.live&&<><LiveDot/><span style={{color:Q.muted,fontSize:9}}>
                        {p.min?`Min ${p.min}'`:p.set?`Set ${p.set}`:""}</span></>}
                      <HBadge label={p.mkt} color={Q.dim}/>
                    </div>
                    <div style={{color:Q.muted,fontSize:10,marginBottom:1}}>{p.h} vs {p.a}</div>
                    <div style={{color:Q.text,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>{p.sel}</div>
                  </div>
                  <div style={{textAlign:"center",minWidth:44}}>
                    <div style={{color:Q.cyan,fontWeight:900,fontSize:18,fontFamily:"'Space Grotesk',system-ui",
                      textShadow:`0 0 8px ${Q.cyan}66`}}>{fmt(p.odd)}</div>
                    <div style={{color:Q.muted,fontSize:8}}>cuota</div>
                  </div>
                </div>
              </GCard>
            ))}

            <NDiv color={Q.violet}/>
            <div style={{color:Q.muted,fontSize:11,fontStyle:"italic",marginBottom:10}}>💡 {combo.note}</div>

            {/* Totales */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>Cuota total</div>
                <div style={{color:Q.gold,fontWeight:900,fontSize:24,fontFamily:"'Space Grotesk',system-ui",
                  textShadow:`0 0 10px ${Q.gold}66`}}>{fmt(tot)}x</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>{combo.picks.length} picks</div>
                <div style={{color:Q.violet2,fontWeight:700,fontSize:16,fontFamily:"'Space Grotesk',system-ui"}}>{combo.picks.length}×</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:Q.muted,fontSize:9,textTransform:"uppercase",letterSpacing:1,fontFamily:"'Space Grotesk',system-ui"}}>Ret. $10K</div>
                <div style={{color:Q.green,fontWeight:900,fontSize:22,fontFamily:"'Space Grotesk',system-ui"}}>{ars(Math.round(stake*tot))}</div>
              </div>
            </div>

            {!voted[sel]?(
              <button onClick={()=>{
                setVoted(v=>({...v,[sel]:true}));
                onBet(combo.picks.map(p=>({id:p.h,label:p.sel,odd:p.odd,h:p.h,a:p.a})),stake,tot);
              }} style={{
                width:"100%",background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
                border:"none",borderRadius:12,padding:"16px",
                color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer",
                fontFamily:"'Space Grotesk',system-ui",textTransform:"uppercase",letterSpacing:0.5,
                boxShadow:`0 6px 24px ${Q.violet}66`,
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              }}>
                <span>⚡</span> APOSTAR {ars(stake)}
              </button>
            ):(
              <GCard glow={Q.green} style={{padding:"12px",textAlign:"center"}}>
                <div style={{color:Q.green,fontWeight:700,fontSize:13,fontFamily:"'Space Grotesk',system-ui"}}>
                  ✦ Combo apostado · Retorno pot: {ars(Math.round(stake*tot))}
                </div>
              </GCard>
            )}
          </GCard>

          {/* Historial de combos */}
          <GCard style={{padding:"12px 14px",marginBottom:10}}>
            <div style={{color:Q.muted,fontSize:10,fontWeight:600,letterSpacing:1,
              textTransform:"uppercase",fontFamily:"'Space Grotesk',system-ui",marginBottom:8}}>Historial esta semana</div>
            {[
              {n:"Combo #46",res:"GANADO",odd:"4.82x",ret:ars(48200),c:Q.green},
              {n:"Combo #45",res:"GANADO",odd:"2.91x",ret:ars(29100),c:Q.green},
              {n:"Combo #44",res:"PERDIDO",odd:"3.44x",ret:"—",c:Q.red},
              {n:"Combo #43",res:"GANADO",odd:"5.18x",ret:ars(51800),c:Q.green},
            ].map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"6px 0",borderBottom:i<3?`1px solid ${Q.dim}`:"none"}}>
                <span style={{color:Q.muted,fontSize:12,fontFamily:"'Space Grotesk',system-ui"}}>{h.n} · {h.odd}</span>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{color:h.c,fontSize:11,fontWeight:700,fontFamily:"'Space Grotesk',system-ui"}}>{h.ret}</span>
                  <HBadge label={h.res} color={h.c}/>
                </div>
              </div>
            ))}
            <div style={{color:Q.muted,fontSize:10,marginTop:8,fontFamily:"'Space Grotesk',system-ui"}}>
              Acierto semanal: <span style={{color:Q.green,fontWeight:700}}>75%</span> · 3/4 combos ganados
            </div>
          </GCard>

          <QKB rows={[
            [{label:"📋 Prematch",action:"prematch"},{label:"🔴 En Vivo",action:"live"}],
            [{label:"◀ Sports",action:"sports"}],
          ]} onPress={onAction}/>
        </BotMsg>
      </div>
    </div>
  );
}

const STEPS=[
  {k:"canal",    l:"📢 Canal"},
  {k:"sports",   l:"🏠 Sports"},
  {k:"prematch", l:"📋 Prematch"},
  {k:"live",     l:"🔴 En Vivo"},
  {k:"pool",     l:"🎯 Pool"},
  {k:"p2p",      l:"🤝 P2P"},
  {k:"combo",    l:"⚡ Combos IA"},
  {k:"confirmed",l:"✅ Confirmada"},
  {k:"mybets",   l:"📊 Mis apuestas"},
];

export default function QuartzSports(){
  const [screen,setScreen]=useState("canal");
  const [betData,setBetData]=useState({bets:[],stake:10000,odd:1});

  const handle=(action)=>{
    const map={
      open:"sports",sports:"sports",prematch:"prematch",live:"live",
      pool:"pool",p2p:"p2p",combo:"combo",mybets:"mybets",
      create_pool:"pool",
    };
    if(map[action]) setScreen(map[action]);
  };

  const confirmBet=(bets,stake,odd)=>{
    setBetData({bets,stake,odd});
    setScreen("confirmed");
  };

  const isCanal=screen==="canal";

  return(
    <div style={{maxWidth:430,margin:"0 auto",fontFamily:"system-ui,-apple-system,sans-serif",background:Q.void,minHeight:"100vh"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;900&display=swap');
        @keyframes qPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.5)}}
        @keyframes qFloat{0%,100%{transform:translateY(0) scale(1);opacity:.4}50%{transform:translateY(-16px) scale(1.2);opacity:.7}}
        @keyframes spinAnim{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0} button:active{opacity:.8} input:focus{outline:none}
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:${Q.border}}
      `}</style>

      {/* Status */}
      <div style={{background:"#000",padding:"10px 20px 6px",display:"flex",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:60}}>
        <span style={{color:Q.text,fontSize:13,fontWeight:600,fontFamily:"'Space Grotesk',system-ui"}}>9:41</span>
        <div style={{display:"flex",gap:6,fontSize:12}}><span>📶</span><span>🔋</span></div>
      </div>

      {/* Header contextual */}
      {isCanal?(
        <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
          padding:"10px 16px",display:"flex",alignItems:"center",gap:12,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,
            background:`linear-gradient(90deg,transparent,${Q.violet},${Q.cyan},${Q.violet},transparent)`}}/>
          <div style={{width:42,height:42,borderRadius:"50%",
            background:`linear-gradient(135deg,${Q.violet},${Q.cyan})`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,
            boxShadow:`0 0 16px ${Q.violet}66`}}>⬡</div>
          <div style={{flex:1}}>
            <QPLogo size={16}/>
            <div style={{color:Q.muted,fontSize:11,marginTop:1}}>12.847 suscriptores · Canal verificado</div>
          </div>
        </div>
      ):(
        <TgHeader title="QuartzPlay Sports" sub="● en línea"
          onBack={()=>{
            const prev={sports:"canal",prematch:"sports",live:"sports",
              pool:"sports",p2p:"sports",combo:"sports",confirmed:"sports",mybets:"sports"};
            setScreen(prev[screen]||"canal");
          }}/>
      )}

      {/* Step bar */}
      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"5px 8px",display:"flex",gap:3,overflowX:"auto"}}>
        {STEPS.map((s,i,arr)=>(
          <div key={s.k} style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
            <button onClick={()=>setScreen(s.k)} style={{
              background:screen===s.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"transparent",
              border:`1px solid ${screen===s.k?Q.violet:Q.border}`,
              borderRadius:20,padding:"3px 9px",cursor:"pointer",
              color:screen===s.k?Q.cyan:Q.muted,fontSize:9,fontWeight:screen===s.k?700:400,
              fontFamily:"'Space Grotesk',system-ui",whiteSpace:"nowrap",
            }}>{s.l}</button>
            {i<arr.length-1&&<span style={{color:Q.dim,fontSize:9}}>›</span>}
          </div>
        ))}
      </div>

      {/* Screens */}
      <div style={{height:"calc(100vh - 112px)",overflowY:"auto"}}>
        {screen==="canal"     &&<ScreenCanal       onBot={()=>setScreen("sports")}/>}
        {screen==="sports"    &&<ScreenSportsMenu   onAction={handle}/>}
        {screen==="prematch"  &&<ScreenPrematch     onAction={handle} onBet={confirmBet}/>}
        {screen==="live"      &&<ScreenLive         onAction={handle} onBet={confirmBet}/>}
        {screen==="pool"      &&<ScreenPool         onAction={handle}/>}
        {screen==="p2p"       &&<ScreenP2P          onAction={handle}/>}
        {screen==="combo"     &&<ScreenCombo        onAction={handle} onBet={confirmBet}/>}
        {screen==="confirmed" &&<ScreenBetConfirmed bets={betData.bets} stake={betData.stake} odd={betData.odd} onAction={handle}/>}
        {screen==="mybets"    &&<ScreenMyBets       onAction={handle}/>}
      </div>
    </div>
  );
}
