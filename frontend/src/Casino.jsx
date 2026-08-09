// ═══════════════════════════════════════════════════════════════
// IAQP · Mesa de ruleta
// Ruta: /casino
//
// EL CRUPIER
// Si existe /crupier/{nombre}.jpg se muestra. Si no, un retrato de
// relleno. La mesa funciona desde hoy y mejora cuando tengas material.
//
// LA RUEDA
// Los 37 sectores van en el ORDEN FÍSICO real de una rueda europea,
// no en orden numérico. La bola cae donde indica el resultado que ya
// sorteó el servidor: la animación ilustra, no decide.
//
// EL PAÑO
// Disposición 3×12 como una mesa real, girada a vertical para que
// entre en un teléfono. Las tres columnas de abajo se corresponden
// con las tres columnas de números que tienen encima.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import Rueda3D from "./Rueda3D";

const IAQP = "https://iaqp-production.up.railway.app";
const MESA = "ruleta-01";

const Q = {
  void:"#050914", deep:"#080E1F", surface:"#0D1530", inset:"#0A1128",
  violet:"#2B6BFF", violet2:"#7B3FE4", cyan:"#5A8CFF",
  pano:"#0B5137", verde:"#0E7A46", rojo:"#C4162A", negro:"#12182B",
  gold:"#FFC531", text:"#E9EFFF",
  muted:"#93A0C8", dim:"#5A6690", border:"#1E2A52",
};
const F_NUM  = "'Barlow Condensed','Inter',system-ui,sans-serif";
const F_BODY = "'Inter',system-ui,sans-serif";

const RUEDA = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,
               16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const ROJOS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const colorDe = n => n===0 ? "verde" : (ROJOS.has(n) ? "rojo" : "negro");
const plata = c => "$" + Math.round((c||0)/100).toLocaleString("es-AR");

const FICHAS = [10000, 50000, 100000, 500000];

function Rueda({ numero, girando }){
  const R = 84, cx = 100, cy = 100, paso = 360/37;
  const idx = numero!=null ? RUEDA.indexOf(numero) : -1;
  const angulo = idx >= 0 ? (360*4) - (idx*paso) - paso/2 : 0;

  return(
    <svg viewBox="0 0 200 200" style={{width:"100%",maxWidth:200,
      display:"block",margin:"0 auto"}}>
      <defs>
        <radialGradient id="qpMadera">
          <stop offset="55%" stopColor="#6B3F1D"/>
          <stop offset="100%" stopColor="#3A210E"/>
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="97" fill="url(#qpMadera)"/>
      <circle cx={cx} cy={cy} r={R+5} fill="#080D18"/>

      {RUEDA.map((n,i)=>{
        const a0=(i*paso-90)*Math.PI/180, a1=((i+1)*paso-90)*Math.PI/180;
        const am=(a0+a1)/2;
        const x0=cx+R*Math.cos(a0), y0=cy+R*Math.sin(a0);
        const x1=cx+R*Math.cos(a1), y1=cy+R*Math.sin(a1);
        const c=colorDe(n), gana=n===numero;
        const tx=cx+(R-11)*Math.cos(am), ty=cy+(R-11)*Math.sin(am);
        return(
          <g key={n}>
            <path d={`M ${cx} ${cy} L ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1} Z`}
              fill={c==="rojo"?Q.rojo:(c==="negro"?Q.negro:Q.verde)}
              stroke={gana?Q.gold:"#080D18"} strokeWidth={gana?2:0.6}/>
            <text x={tx} y={ty} fill="#fff" fontSize="7.5" fontFamily={F_NUM}
              fontWeight="700" textAnchor="middle" dominantBaseline="middle"
              transform={`rotate(${i*paso+paso/2} ${tx} ${ty})`}>{n}</text>
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r="43" fill="#3A210E"/>
      <circle cx={cx} cy={cy} r="39" fill={Q.inset}
        stroke={Q.gold} strokeWidth="1"/>
      {numero!=null&&(
        <text x={cx} y={cy} fill={Q.gold} fontSize="29" fontFamily={F_NUM}
          fontWeight="700" textAnchor="middle" dominantBaseline="central">
          {numero}</text>
      )}

      <g style={{transformOrigin:"100px 100px",transform:`rotate(${angulo}deg)`,
        transition: girando ? "transform 4s cubic-bezier(.15,.65,.2,1)" : "none"}}>
        <circle cx={cx} cy={cy-R+8} r="4.6" fill="#fff" stroke="#AEBBD8"
          strokeWidth="0.6"/>
      </g>
    </svg>
  );
}

function Crupier({ nombre, hablando }){
  const [hayFoto,setHayFoto]=useState(false);
  const clave=(nombre||"valentina").toLowerCase();

  useEffect(()=>{
    let vivo=true;
    const img=new Image();
    img.onload=()=>vivo&&setHayFoto(true);
    img.onerror=()=>vivo&&setHayFoto(false);
    img.src=`/crupier/${clave}.jpg`;
    return()=>{ vivo=false; };
  },[clave]);

  return(
    <div style={{width:92,height:118,borderRadius:12,overflow:"hidden",
      flexShrink:0,background:Q.inset,position:"relative",
      border:`1px solid ${hablando?Q.gold:Q.border}`,
      boxShadow:hablando?`0 0 16px ${Q.gold}44`:"none",transition:"all .3s"}}>
      {hayFoto ? (
        <img src={`/crupier/${clave}.jpg`} alt={nombre}
          style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      ) : (
        <svg viewBox="0 0 92 118" style={{width:"100%",height:"100%"}}>
          <rect width="92" height="118" fill={Q.inset}/>
          <circle cx="46" cy="42" r="20" fill={Q.violet2} opacity="0.5"/>
          <path d="M13 118 C13 86 28 72 46 72 C64 72 79 86 79 118 Z"
            fill={Q.violet} opacity="0.45"/>
          <text x="46" y="110" fill={Q.dim} fontSize="8" fontFamily={F_BODY}
            textAnchor="middle">sin foto</text>
        </svg>
      )}
      {hablando&&(
        <div style={{position:"absolute",bottom:7,left:"50%",
          transform:"translateX(-50%)",display:"flex",gap:2,
          alignItems:"flex-end",height:11}}>
          {[0,1,2].map(i=>(
            <span key={i} style={{width:3,background:Q.gold,borderRadius:2,
              height:"100%",animation:`qpOnda .6s ${i*0.15}s infinite`}}/>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Casino(){
  const [mesa,setMesa]=useState(null);
  const [ficha,setFicha]=useState(FICHAS[0]);
  const [pendientes,setPendientes]=useState([]);
  const [saldo,setSaldo]=useState(null);
  const [aviso,setAviso]=useState("");
  const [chat,setChat]=useState([]);
  const [texto,setTexto]=useState("");
  const [ultimo,setUltimo]=useState(null);
  const [girando,setGirando]=useState(false);
  const [hablando,setHablando]=useState(false);
  const sonados=useRef(new Set());
  const nonceRef=useRef(null);

  const jugadorId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "";

  useEffect(()=>{
    let vivo=true;
    const traer=async()=>{
      try{
        const r=await fetch(`${IAQP}/api/mesa/${MESA}/estado`);
        if(!r.ok) return;
        const d=await r.json();
        if(!vivo) return;
        setMesa(d);
        if(d.chat?.length) setChat(d.chat);

        if(nonceRef.current!==d.ronda_nonce){
          nonceRef.current=d.ronda_nonce;
          setPendientes([]);
          setGirando(false);
        }
        if(d.estado==="cerrada") setGirando(true);
        if(d.estado==="resuelta" && d.ultimos_numeros?.length){
          setUltimo(d.ultimos_numeros[d.ultimos_numeros.length-1]);
        }
        (d.guion||[]).forEach(clip=>{
          const k=`${d.ronda_nonce}:${clip}`;
          if(!sonados.current.has(k)){ sonados.current.add(k); sonar(clip); }
        });
      }catch(e){}
    };
    traer();
    const t=setInterval(traer,1000);
    return()=>{ vivo=false; clearInterval(t); };
  },[]);

  const sonar=(clip)=>{
    try{
      const a=new Audio(`/audio/${clip}.mp3`);
      a.volume=0.85;
      setHablando(true);
      a.onended=()=>setHablando(false);
      a.play().catch(()=>setHablando(false));
    }catch(e){ setHablando(false); }
  };

  const abierta = mesa?.estado==="abierta" && mesa?.segundos_restantes>0;
  const cerrando = abierta && mesa.segundos_restantes<=5;

  const poner=(tipo,valor)=>{
    if(!abierta){ setAviso("Mesa cerrada. Esperá la próxima ronda."); return; }
    setAviso("");
    setPendientes(p=>[...p,{tipo,valor,monto:ficha}]);
  };
  const total = pendientes.reduce((a,b)=>a+b.monto,0);
  const puesto=(tipo,valor)=>pendientes
    .filter(p=>p.tipo===tipo &&
      JSON.stringify(p.valor??null)===JSON.stringify(valor??null))
    .reduce((a,b)=>a+b.monto,0);

  const confirmar=async()=>{
    if(!pendientes.length) return;
    if(!jugadorId){ setAviso("Abrí desde el bot de Telegram para jugar."); return; }
    const copia=[...pendientes]; setPendientes([]); setAviso("");
    for(const ap of copia){
      try{
        const r=await fetch(`${IAQP}/api/mesa/${MESA}/apostar`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({jugador_id:String(jugadorId),tipo:ap.tipo,
            valor:ap.valor,monto_centavos:ap.monto})});
        const d=await r.json();
        if(!r.ok){ setAviso(d.detail||"No se pudo apostar"); break; }
        if(d.saldo_centavos!=null) setSaldo(d.saldo_centavos);
      }catch(e){ setAviso("Sin conexión con la mesa"); break; }
    }
  };

  const enviarChat=async()=>{
    const t=texto.trim(); if(!t) return;
    setTexto("");
    setChat(c=>[...c,{rol:"user",nombre:"Vos",texto:t}]);
    try{
      const r=await fetch(`${IAQP}/api/mesa/${MESA}/chat`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({texto:t,nombre:window.Telegram?.WebApp
          ?.initDataUnsafe?.user?.first_name||"Jugador"})});
      const d=await r.json();
      if(d.respuesta) setChat(c=>[...c,
        {rol:"assistant",nombre:"Crupier",texto:d.respuesta}]);
    }catch(e){}
  };

  const Ficha=({monto})=>(
    <span style={{position:"absolute",top:-6,right:-6,minWidth:19,height:19,
      padding:"0 3px",borderRadius:10,background:Q.gold,color:"#1A1200",
      fontSize:8.5,fontWeight:700,fontFamily:F_BODY,display:"flex",
      alignItems:"center",justifyContent:"center",border:`2px solid ${Q.pano}`}}>
      {monto>=100000?`${Math.round(monto/100000)}k`:Math.round(monto/100)}
    </span>
  );

  const Num=({n})=>{
    const c=colorDe(n), p=puesto("pleno",n);
    const gana=ultimo===n && mesa?.estado==="resuelta";
    return(
      <button onClick={()=>poner("pleno",n)} style={{position:"relative",
        height:34,border:"1px solid rgba(255,255,255,.16)",borderRadius:3,
        background:c==="rojo"?Q.rojo:Q.negro,color:"#fff",padding:0,
        fontFamily:F_NUM,fontSize:15,fontWeight:700,
        cursor:abierta?"pointer":"default",
        boxShadow:gana?`0 0 0 2px ${Q.gold}`:"none"}}>
        {n}{p>0&&<Ficha monto={p}/>}
      </button>
    );
  };

  const Ext=({tipo,valor,txt,fondo,alto=32})=>{
    const p=puesto(tipo,valor);
    return(
      <button onClick={()=>poner(tipo,valor)} style={{position:"relative",
        height:alto,border:"1px solid rgba(255,255,255,.16)",borderRadius:3,
        background:fondo||"rgba(0,0,0,.18)",color:"#fff",fontSize:10.5,
        fontWeight:700,fontFamily:F_BODY,padding:0,
        cursor:abierta?"pointer":"default"}}>
        {txt}{p>0&&<Ficha monto={p}/>}
      </button>
    );
  };

  const filas=Array.from({length:12},(_,f)=>[f*3+1,f*3+2,f*3+3]);

  return(
    <div style={{background:Q.void,color:Q.text,minHeight:"100dvh",
      fontFamily:F_BODY,paddingBottom:24}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent}
        @keyframes qpLate{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes qpOnda{0%,100%{height:30%}50%{height:100%}}
        @media (prefers-reduced-motion:reduce){*{animation:none!important;
          transition:none!important}}
      `}</style>

      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"10px 14px",display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:20}}>
        <span style={{fontFamily:F_NUM,fontSize:20,fontWeight:700}}>
          IA<span style={{color:Q.gold}}>QP</span></span>
        <div style={{marginLeft:"auto",textAlign:"right"}}>
          <div style={{fontSize:8,letterSpacing:1.3,color:Q.dim,
            fontWeight:700}}>SALDO</div>
          <div style={{fontFamily:F_NUM,fontSize:19,fontWeight:700,
            color:Q.gold,lineHeight:1}}>{saldo!=null?plata(saldo):"—"}</div>
        </div>
      </div>

      <div style={{maxWidth:460,margin:"0 auto",padding:"12px 12px 0"}}>

        <div style={{display:"flex",gap:12,marginBottom:12,
          background:Q.surface,border:`1px solid ${Q.border}`,
          borderRadius:14,padding:12}}>
          <div>
            <Crupier nombre={mesa?.crupier} hablando={hablando}/>
            <div style={{fontSize:11,color:Q.muted,textAlign:"center",
              marginTop:6}}>{mesa?.crupier||"…"}</div>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <Rueda3D numero={ultimo} girando={girando} alto={150}/>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:12,
          background:Q.surface,border:`1px solid ${Q.border}`,
          borderRadius:12,padding:"11px 14px",marginBottom:12}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11.5,color:Q.muted}}>
              {mesa?.estado==="abierta" ? "Hagan juego"
               : mesa?.estado==="cerrada" ? "No va más"
               : mesa?.estado==="resuelta" ? "Pagando" : "Conectando…"}</div>
            <div style={{fontFamily:F_NUM,fontSize:30,fontWeight:700,
              lineHeight:1,color:cerrando?Q.gold:Q.text,
              animation:cerrando?"qpLate 1s infinite":"none"}}>
              {mesa?.segundos_restantes>0
                ? `${Math.ceil(mesa.segundos_restantes)}s` : "—"}</div>
          </div>
          <div style={{display:"flex",gap:3,flexWrap:"wrap",
            justifyContent:"flex-end",maxWidth:150}}>
            {(mesa?.ultimos_numeros||[]).slice(-6).map((n,i)=>(
              <span key={i} style={{width:21,height:21,borderRadius:4,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:10,fontWeight:700,fontFamily:F_NUM,color:"#fff",
                background:colorDe(n)==="rojo"?Q.rojo
                  :colorDe(n)==="negro"?Q.negro:Q.verde}}>{n}</span>
            ))}
          </div>
        </div>

        {aviso&&(
          <div style={{background:`${Q.gold}1A`,border:`1px solid ${Q.gold}`,
            borderRadius:9,padding:"9px 12px",marginBottom:12,
            fontSize:12.5}}>{aviso}</div>
        )}

        {/* PAÑO */}
        <div style={{background:Q.pano,border:"2px solid #063A26",
          borderRadius:10,padding:9,marginBottom:12}}>

          <button onClick={()=>poner("pleno",0)} style={{width:"100%",
            height:36,marginBottom:6,background:Q.verde,
            border:"1px solid rgba(255,255,255,.16)",borderRadius:3,
            color:"#fff",fontFamily:F_NUM,fontSize:18,fontWeight:700,
            cursor:abierta?"pointer":"default",position:"relative"}}>
            0{puesto("pleno",0)>0&&<Ficha monto={puesto("pleno",0)}/>}
          </button>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",
            gap:4}}>
            {filas.map(f=>f.map(n=><Num key={n} n={n}/>))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",
            gap:4,marginTop:6}}>
            <Ext tipo="columna" valor={1} txt="COL 1"/>
            <Ext tipo="columna" valor={2} txt="COL 2"/>
            <Ext tipo="columna" valor={3} txt="COL 3"/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",
            gap:4,marginTop:6}}>
            <Ext tipo="docena" valor={1} txt="1 a 12"/>
            <Ext tipo="docena" valor={2} txt="13 a 24"/>
            <Ext tipo="docena" valor={3} txt="25 a 36"/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",
            gap:4,marginTop:6}}>
            <Ext tipo="falta" txt="1-18"/>
            <Ext tipo="par" txt="PAR"/>
            <Ext tipo="rojo" txt="ROJO" fondo={Q.rojo}/>
            <Ext tipo="negro" txt="NEGRO" fondo={Q.negro}/>
            <Ext tipo="impar" txt="IMPAR"/>
            <Ext tipo="pasa" txt="19-36"/>
          </div>
        </div>

        <div style={{display:"flex",gap:7,marginBottom:10}}>
          {FICHAS.map(f=>(
            <button key={f} onClick={()=>setFicha(f)} style={{flex:1,
              padding:"11px 4px",borderRadius:9,cursor:"pointer",
              background:ficha===f?Q.gold:Q.inset,
              border:`1px solid ${ficha===f?Q.gold:Q.border}`,
              color:ficha===f?"#1A1200":Q.muted,fontWeight:700,
              fontSize:12.5}}>{plata(f)}</button>
          ))}
        </div>

        {pendientes.length>0&&(
          <div style={{marginBottom:12}}>
            <button onClick={confirmar} style={{width:"100%",
              background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
              border:"none",borderRadius:10,padding:14,color:"#fff",
              fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Confirmar {pendientes.length} · {plata(total)}</button>
            <button onClick={()=>setPendientes([])} style={{width:"100%",
              background:"transparent",border:"none",color:Q.muted,
              fontSize:12,padding:8,cursor:"pointer"}}>Levantar fichas</button>
          </div>
        )}

        <div style={{background:Q.surface,border:`1px solid ${Q.border}`,
          borderRadius:12,overflow:"hidden"}}>
          <div style={{maxHeight:170,overflowY:"auto",padding:"12px 14px"}}>
            {!chat.length&&(
              <div style={{color:Q.dim,fontSize:12}}>
                Saludá al crupier o preguntale las reglas.</div>
            )}
            {chat.slice(-15).map((m,i)=>(
              <div key={i} style={{marginBottom:8,fontSize:12.5,
                lineHeight:1.45}}>
                <span style={{color:m.rol==="assistant"?Q.gold:Q.cyan,
                  fontWeight:700}}>{m.nombre||"Jugador"}: </span>
                <span>{m.texto}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:7,padding:10,
            borderTop:`1px solid ${Q.border}`}}>
            <input value={texto} onChange={e=>setTexto(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&enviarChat()}
              placeholder="Escribí a la mesa…" aria-label="Mensaje"
              style={{flex:1,background:Q.inset,border:`1px solid ${Q.border}`,
                borderRadius:8,padding:"10px 12px",color:Q.text,fontSize:13,
                outline:"none"}}/>
            <button onClick={enviarChat} style={{background:Q.violet,
              border:"none",borderRadius:8,padding:"0 16px",color:"#fff",
              fontWeight:700,fontSize:13,cursor:"pointer"}}>Enviar</button>
          </div>
        </div>

        <div style={{marginTop:12,padding:"0 4px",fontSize:10,color:Q.dim,
          lineHeight:1.6}}>
          Ronda {mesa?.ronda_nonce ?? "—"} · el hash de la semilla se publica
          antes de que se pueda apostar:
          <span style={{wordBreak:"break-all",color:Q.muted}}>
            {" "}{(mesa?.hash_semilla_servidor||"").slice(0,28)}…</span>
        </div>
      </div>
    </div>
  );
}
