// ═══════════════════════════════════════════════════════════════
// IAQP · Mesa de ruleta
// Ruta: /casino  ·  Habla con el servicio IAQP, no con QuartzPlay.
//
// El saldo NO vive acá: lo devuelve IAQP, que a su vez se lo pide a
// QuartzPlay. Una sola fuente de verdad.
//
// El audio son clips pregrabados en /audio/{crupier}/{clip}.mp3.
// Si no están, la mesa funciona igual, muda.
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";

const IAQP = "https://iaqp-production.up.railway.app";

const Q = {
  void:"#050914", deep:"#080E1F", surface:"#0D1530", inset:"#0A1128",
  violet:"#2B6BFF", violet2:"#7B3FE4", cyan:"#5A8CFF",
  verde:"#0E7A46", rojo:"#C4162A", negro:"#141A2E",
  gold:"#FFC531", win:"#25D07A", text:"#E9EFFF",
  muted:"#93A0C8", dim:"#5A6690", border:"#1E2A52",
};
const F_NUM  = "'Barlow Condensed','Inter',system-ui,sans-serif";
const F_BODY = "'Inter',system-ui,sans-serif";

const ROJOS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const colorDe = n => n===0 ? "verde" : (ROJOS.has(n) ? "rojo" : "negro");
const plata = c => "$" + Math.round((c||0)/100).toLocaleString("es-AR");

// Fichas en centavos
const FICHAS = [10000, 50000, 100000, 500000];

export default function Casino(){
  const [mesa,setMesa]=useState(null);
  const [ficha,setFicha]=useState(FICHAS[0]);
  const [pendientes,setPendientes]=useState([]);   // aún no enviadas
  const [saldo,setSaldo]=useState(null);
  const [aviso,setAviso]=useState("");
  const [chat,setChat]=useState([]);
  const [texto,setTexto]=useState("");
  const [ultimo,setUltimo]=useState(null);
  const audioRef=useRef(null);
  const clipsSonados=useRef(new Set());

  const jugadorId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "";

  // ── Sondeo del estado de la mesa ──────────────────────────
  useEffect(()=>{
    let vivo=true;
    const traer=async()=>{
      try{
        const r=await fetch(`${IAQP}/api/mesa/ruleta-01/estado`);
        if(!r.ok) return;
        const d=await r.json();
        if(!vivo) return;
        setMesa(d);
        if(d.chat) setChat(d.chat);

        // Al resolverse, se destapa el número y suena el clip
        if(d.estado==="resuelta" && d.ultimos_numeros?.length){
          const n=d.ultimos_numeros[d.ultimos_numeros.length-1];
          setUltimo(n);
          setPendientes([]);     // la ronda terminó
        }
        (d.guion||[]).forEach(clip=>{
          const clave=`${d.ronda_nonce}:${clip}`;
          if(!clipsSonados.current.has(clave)){
            clipsSonados.current.add(clave);
            sonar(clip);
          }
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
      a.play().catch(()=>{});   // si falta el archivo, silencio y sigue
      audioRef.current=a;
    }catch(e){}
  };

  // ── Apuestas ──────────────────────────────────────────────
  const abierta = mesa?.estado==="abierta" && mesa?.segundos_restantes>0;

  const poner=(tipo,valor)=>{
    if(!abierta){ setAviso("La mesa está cerrada, esperá la próxima."); return; }
    setAviso("");
    setPendientes(p=>[...p,{tipo,valor,monto:ficha}]);
  };

  const totalPendiente = pendientes.reduce((a,b)=>a+b.monto,0);

  const confirmar=async()=>{
    if(!pendientes.length) return;
    if(!jugadorId){ setAviso("Abrí desde el bot de Telegram para jugar."); return; }
    setAviso("");
    const copia=[...pendientes];
    setPendientes([]);
    for(const ap of copia){
      try{
        const r=await fetch(`${IAQP}/api/mesa/ruleta-01/apostar`,{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({jugador_id:String(jugadorId),
            tipo:ap.tipo, valor:ap.valor, monto_centavos:ap.monto}),
        });
        const d=await r.json();
        if(!r.ok){ setAviso(d.detail||"No se pudo apostar"); break; }
        if(d.saldo_centavos!=null) setSaldo(d.saldo_centavos);
      }catch(e){ setAviso("Sin conexión con la mesa"); break; }
    }
  };

  const enviarChat=async()=>{
    const t=texto.trim();
    if(!t) return;
    setTexto("");
    try{
      const r=await fetch(`${IAQP}/api/mesa/ruleta-01/chat`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({texto:t,
          nombre:window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name||"Jugador"}),
      });
      const d=await r.json();
      if(d.respuesta) setChat(c=>[...c,
        {rol:"user",nombre:"Vos",texto:t},
        {rol:"assistant",nombre:"Crupier",texto:d.respuesta}]);
    }catch(e){}
  };

  const puestasEn=(tipo,valor)=>pendientes
    .filter(p=>p.tipo===tipo && JSON.stringify(p.valor)===JSON.stringify(valor))
    .reduce((a,b)=>a+b.monto,0);

  // ── Casillero ─────────────────────────────────────────────
  const Casilla=({n})=>{
    const c=colorDe(n);
    const puesto=puestasEn("pleno",n);
    const ganador=ultimo===n && mesa?.estado==="resuelta";
    return(
      <button onClick={()=>poner("pleno",n)} style={{
        position:"relative",aspectRatio:"1",border:`1px solid ${Q.border}`,
        borderRadius:5,cursor:abierta?"pointer":"default",
        background:c==="rojo"?Q.rojo:(c==="negro"?Q.negro:Q.verde),
        color:"#fff",fontFamily:F_NUM,fontSize:16,fontWeight:700,
        opacity:abierta?1:0.75,
        boxShadow:ganador?`0 0 0 3px ${Q.gold}`:"none",
        transition:"box-shadow .2s"}}>
        {n}
        {puesto>0&&(
          <span style={{position:"absolute",bottom:-5,right:-5,width:19,height:19,
            borderRadius:"50%",background:Q.gold,color:"#1A1200",fontSize:8.5,
            fontWeight:700,fontFamily:F_BODY,display:"flex",
            alignItems:"center",justifyContent:"center"}}>
            {Math.round(puesto/100/1000)||1}k</span>
        )}
      </button>
    );
  };

  const Externa=({tipo,valor,etiqueta,ancho=1,fondo})=>{
    const puesto=puestasEn(tipo,valor);
    return(
      <button onClick={()=>poner(tipo,valor)} style={{
        position:"relative",gridColumn:`span ${ancho}`,padding:"11px 4px",
        border:`1px solid ${Q.border}`,borderRadius:6,
        cursor:abierta?"pointer":"default",background:fondo||Q.inset,
        color:Q.text,fontSize:11.5,fontWeight:600,fontFamily:F_BODY,
        opacity:abierta?1:0.75}}>
        {etiqueta}
        {puesto>0&&(
          <span style={{position:"absolute",top:-5,right:-5,width:19,height:19,
            borderRadius:"50%",background:Q.gold,color:"#1A1200",fontSize:8.5,
            fontWeight:700,display:"flex",alignItems:"center",
            justifyContent:"center"}}>●</span>
        )}
      </button>
    );
  };

  const cerrando = mesa?.estado==="abierta" && mesa?.segundos_restantes<=5;

  return(
    <div style={{background:Q.void,color:Q.text,minHeight:"100dvh",
      fontFamily:F_BODY,paddingBottom:20}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        button{font-family:inherit;-webkit-tap-highlight-color:transparent}
        @keyframes late{0%,100%{opacity:1}50%{opacity:.4}}
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>

      {/* Encabezado */}
      <div style={{background:Q.deep,borderBottom:`1px solid ${Q.border}`,
        padding:"10px 14px",display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:20}}>
        <span style={{fontFamily:F_NUM,fontSize:20,fontWeight:700}}>
          IA<span style={{color:Q.gold}}>QP</span></span>
        <span style={{fontSize:11,color:Q.muted}}>
          Ruleta · {mesa?.crupier||"…"}</span>
        <div style={{marginLeft:"auto",textAlign:"right"}}>
          <div style={{fontSize:8,letterSpacing:1.3,color:Q.dim,fontWeight:700}}>
            SALDO</div>
          <div style={{fontFamily:F_NUM,fontSize:19,fontWeight:700,color:Q.gold,
            lineHeight:1}}>{saldo!=null?plata(saldo):"—"}</div>
        </div>
      </div>

      <div style={{maxWidth:520,margin:"0 auto",padding:"12px 12px 0"}}>

        {/* Estado de la ronda */}
        <div style={{background:Q.surface,border:`1px solid ${Q.border}`,
          borderRadius:12,padding:"14px 16px",marginBottom:12,
          display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:62,height:62,borderRadius:"50%",flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:F_NUM,fontSize:28,fontWeight:700,color:"#fff",
            background: ultimo==null ? Q.inset
              : (colorDe(ultimo)==="rojo"?Q.rojo
              : colorDe(ultimo)==="negro"?Q.negro:Q.verde),
            border:`2px solid ${ultimo!=null?Q.gold:Q.border}`}}>
            {ultimo!=null?ultimo:"—"}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,color:Q.muted}}>
              {mesa?.estado==="abierta" ? "Hagan juego" :
               mesa?.estado==="cerrada" ? "No va más" :
               mesa?.estado==="resuelta" ? "Pagando" : "Conectando…"}
            </div>
            <div style={{fontFamily:F_NUM,fontSize:34,fontWeight:700,lineHeight:1,
              color:cerrando?Q.gold:Q.text,
              animation:cerrando?"late 1s infinite":"none"}}>
              {mesa?.segundos_restantes>0
                ? `${Math.ceil(mesa.segundos_restantes)}s` : "—"}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:Q.dim,marginBottom:4}}>ANTERIORES</div>
            <div style={{display:"flex",gap:3}}>
              {(mesa?.ultimos_numeros||[]).slice(-5).map((n,i)=>(
                <span key={i} style={{width:20,height:20,borderRadius:4,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:700,fontFamily:F_NUM,color:"#fff",
                  background:colorDe(n)==="rojo"?Q.rojo
                    :colorDe(n)==="negro"?Q.negro:Q.verde}}>{n}</span>
              ))}
            </div>
          </div>
        </div>

        {aviso&&(
          <div style={{background:`${Q.gold}1A`,border:`1px solid ${Q.gold}`,
            borderRadius:9,padding:"9px 12px",marginBottom:12,fontSize:12.5}}>
            {aviso}</div>
        )}

        {/* Paño */}
        <div style={{background:"#07341F",border:`1px solid ${Q.border}`,
          borderRadius:12,padding:10,marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4}}>
            <button onClick={()=>poner("pleno",0)} style={{gridColumn:"span 6",
              padding:"9px",background:Q.verde,border:`1px solid ${Q.border}`,
              borderRadius:5,color:"#fff",fontFamily:F_NUM,fontSize:17,
              fontWeight:700,cursor:abierta?"pointer":"default"}}>0</button>
            {Array.from({length:36},(_,i)=>i+1).map(n=>(
              <Casilla key={n} n={n}/>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4,
            marginTop:8}}>
            <Externa tipo="docena" valor={1} etiqueta="1ª doc" ancho={2}/>
            <Externa tipo="docena" valor={2} etiqueta="2ª doc" ancho={2}/>
            <Externa tipo="docena" valor={3} etiqueta="3ª doc" ancho={2}/>
            <Externa tipo="falta" etiqueta="1-18" ancho={1}/>
            <Externa tipo="par" etiqueta="Par" ancho={1}/>
            <Externa tipo="rojo" etiqueta="Rojo" ancho={1} fondo={Q.rojo}/>
            <Externa tipo="negro" etiqueta="Negro" ancho={1} fondo={Q.negro}/>
            <Externa tipo="impar" etiqueta="Impar" ancho={1}/>
            <Externa tipo="pasa" etiqueta="19-36" ancho={1}/>
          </div>
        </div>

        {/* Fichas y confirmación */}
        <div style={{display:"flex",gap:7,marginBottom:10}}>
          {FICHAS.map(f=>(
            <button key={f} onClick={()=>setFicha(f)} style={{flex:1,
              padding:"11px 4px",borderRadius:9,cursor:"pointer",
              background:ficha===f?Q.gold:Q.inset,
              border:`1px solid ${ficha===f?Q.gold:Q.border}`,
              color:ficha===f?"#1A1200":Q.muted,fontWeight:700,fontSize:12.5}}>
              {plata(f)}</button>
          ))}
        </div>

        {pendientes.length>0&&(
          <div style={{marginBottom:12}}>
            <button onClick={confirmar} style={{width:"100%",
              background:`linear-gradient(135deg,${Q.violet},${Q.violet2})`,
              border:"none",borderRadius:10,padding:"14px",color:"#fff",
              fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Confirmar {pendientes.length} {pendientes.length===1?"ficha":"fichas"}
              {" · "}{plata(totalPendiente)}</button>
            <button onClick={()=>setPendientes([])} style={{width:"100%",
              background:"transparent",border:"none",color:Q.muted,
              fontSize:12,padding:"8px",cursor:"pointer"}}>Levantar fichas</button>
          </div>
        )}

        {/* Chat */}
        <div style={{background:Q.surface,border:`1px solid ${Q.border}`,
          borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${Q.border}`,
            fontSize:11,letterSpacing:1,color:Q.muted,fontWeight:700}}>
            MESA</div>
          <div style={{maxHeight:180,overflowY:"auto",padding:"10px 14px"}}>
            {!chat.length&&(
              <div style={{color:Q.dim,fontSize:12}}>
                Saludá al crupier o preguntale las reglas.</div>
            )}
            {chat.slice(-15).map((m,i)=>(
              <div key={i} style={{marginBottom:8,fontSize:12.5,lineHeight:1.45}}>
                <span style={{color:m.rol==="assistant"?Q.gold:Q.cyan,
                  fontWeight:700}}>{m.nombre||"Jugador"}: </span>
                <span style={{color:Q.text}}>{m.texto}</span>
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

        {/* Verificación */}
        <div style={{marginTop:12,padding:"0 4px",fontSize:10,color:Q.dim,
          lineHeight:1.6}}>
          Ronda {mesa?.ronda_nonce ?? "—"} · sorteo verificable.
          El hash de la semilla se publica antes de que se pueda apostar:
          <span style={{wordBreak:"break-all",color:Q.muted}}>
            {" "}{(mesa?.hash_semilla_servidor||"").slice(0,32)}…</span>
        </div>
      </div>
    </div>
  );
}
