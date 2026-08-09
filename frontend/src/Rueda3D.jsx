// ═══════════════════════════════════════════════════════════════
// IAQP · Rueda 3D
//
// Three.js se carga por CDN con una etiqueta <script>, no por npm.
// Así no hay que tocar package.json ni instalar nada, que desde el
// celular es un problema. Si algún día se saca, se borra este archivo.
//
// LA BOLA CAE DONDE MANDA EL SERVIDOR
// El número ya está sorteado antes de que esto se anime. Acá solo se
// calcula el ángulo del casillero ganador y se lleva la bola hasta él.
// La animación ilustra; no decide nada.
//
// Si Three.js no carga (sin red, CDN caído), el componente avisa y
// el llamador puede mostrar la rueda plana. La mesa nunca se rompe.
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

const RUEDA = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,
               16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const ROJOS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const colorDe = n => n===0 ? "verde" : (ROJOS.has(n) ? "rojo" : "negro");

// ── Carga del CDN, una sola vez para toda la app ──────────────
let promesaThree = null;
function cargarThree(){
  if(window.THREE) return Promise.resolve(window.THREE);
  if(promesaThree) return promesaThree;
  promesaThree = new Promise((ok,fallo)=>{
    const s=document.createElement("script");
    s.src=CDN; s.async=true;
    s.onload=()=>window.THREE ? ok(window.THREE) : fallo(new Error("sin THREE"));
    s.onerror=()=>fallo(new Error("no se pudo cargar three"));
    document.head.appendChild(s);
  });
  return promesaThree;
}

// ── La cara de la rueda, dibujada en un canvas ────────────────
// Un solo dibujo como textura sale más nítido y pesa mucho menos que
// modelar 37 piezas de geometría.
function texturaRueda(THREE){
  const S=1024, r=S/2;
  const c=document.createElement("canvas");
  c.width=c.height=S;
  const g=c.getContext("2d");

  // Aro de madera
  g.fillStyle="#5A3418"; g.beginPath(); g.arc(r,r,r,0,Math.PI*2); g.fill();
  g.fillStyle="#3A210E"; g.beginPath(); g.arc(r,r,r*0.97,0,Math.PI*2); g.fill();

  const paso=(Math.PI*2)/37;
  const rExt=r*0.90, rInt=r*0.42;

  RUEDA.forEach((n,i)=>{
    const a0=i*paso - Math.PI/2, a1=(i+1)*paso - Math.PI/2;
    const col=colorDe(n);
    g.beginPath();
    g.moveTo(r+rInt*Math.cos(a0), r+rInt*Math.sin(a0));
    g.arc(r,r,rExt,a0,a1);
    g.lineTo(r+rInt*Math.cos(a1), r+rInt*Math.sin(a1));
    g.arc(r,r,rInt,a1,a0,true);
    g.closePath();
    g.fillStyle = col==="rojo" ? "#C4162A" : (col==="negro" ? "#12182B" : "#0E7A46");
    g.fill();
    g.strokeStyle="#D9C08A"; g.lineWidth=2; g.stroke();

    // Número, mirando al centro
    const am=(a0+a1)/2, rt=(rExt+rInt)/2 + rExt*0.16;
    g.save();
    g.translate(r+rt*Math.cos(am), r+rt*Math.sin(am));
    g.rotate(am + Math.PI/2);
    g.fillStyle="#fff";
    g.font="bold 40px 'Barlow Condensed', sans-serif";
    g.textAlign="center"; g.textBaseline="middle";
    g.fillText(String(n),0,0);
    g.restore();
  });

  // Cubo central
  g.fillStyle="#3A210E"; g.beginPath(); g.arc(r,r,rInt,0,Math.PI*2); g.fill();
  g.fillStyle="#0D1530"; g.beginPath(); g.arc(r,r,rInt*0.86,0,Math.PI*2); g.fill();
  g.strokeStyle="#FFC531"; g.lineWidth=4;
  g.beginPath(); g.arc(r,r,rInt*0.86,0,Math.PI*2); g.stroke();

  const t=new THREE.CanvasTexture(c);
  t.anisotropy=4;
  return t;
}

export default function Rueda3D({ numero, girando, alto=230 }){
  const cont=useRef(null);
  const escena=useRef({});
  const [falla,setFalla]=useState(false);
  const destino=useRef({ rueda:0, bola:0, activo:false, t0:0 });

  // ── Montaje ───────────────────────────────────────────────
  useEffect(()=>{
    let vivo=true, animId=null;

    cargarThree().then(THREE=>{
      if(!vivo || !cont.current) return;

      const ancho=cont.current.clientWidth || 240;
      const esc=new THREE.Scene();
      const cam=new THREE.PerspectiveCamera(38, ancho/alto, 0.1, 100);
      cam.position.set(0, 3.4, 3.1);
      cam.lookAt(0, 0, 0);

      const rend=new THREE.WebGLRenderer({antialias:true, alpha:true});
      rend.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      rend.setSize(ancho, alto);
      cont.current.appendChild(rend.domElement);

      esc.add(new THREE.AmbientLight(0xffffff, 0.75));
      const luz=new THREE.DirectionalLight(0xfff0d0, 0.9);
      luz.position.set(2.5, 5, 2.5);
      esc.add(luz);
      const relleno=new THREE.PointLight(0x7B3FE4, 0.5, 12);
      relleno.position.set(-3, 2, -2);
      esc.add(relleno);

      // Cuenco exterior
      const cuenco=new THREE.Mesh(
        new THREE.CylinderGeometry(2.15, 2.3, 0.32, 64),
        new THREE.MeshStandardMaterial({color:0x2A1708, roughness:0.85}));
      cuenco.position.y=-0.16;
      esc.add(cuenco);

      // Disco giratorio con la cara dibujada
      const disco=new THREE.Mesh(
        new THREE.CylinderGeometry(1.95, 1.95, 0.16, 64),
        [ new THREE.MeshStandardMaterial({color:0x3A210E, roughness:0.7}),
          new THREE.MeshStandardMaterial({map:texturaRueda(THREE), roughness:0.45}),
          new THREE.MeshStandardMaterial({color:0x3A210E, roughness:0.7}) ]);
      esc.add(disco);

      // Bola
      const bola=new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 20, 20),
        new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.15,
          metalness:0.1}));
      esc.add(bola);

      const RADIO_BOLA=1.62;
      const reloj=new THREE.Clock();
      escena.current={THREE, esc, cam, rend, disco, bola, ancho, reloj};

      const animar=()=>{
        animId=requestAnimationFrame(animar);
        const t=reloj.getElapsedTime();
        const d=destino.current;

        if(d.activo){
          // Frenada suave hasta el ángulo del casillero ganador
          const p=Math.min(1,(t-d.t0)/4.2);
          const suave=1-Math.pow(1-p,3);
          disco.rotation.y = d.ruedaIni + (d.rueda-d.ruedaIni)*suave;
          const ang = d.bolaIni + (d.bola-d.bolaIni)*suave;
          // La bola cae hacia adentro a medida que pierde fuerza
          const radio = RADIO_BOLA - 0.35*suave;
          const altura = 0.14 - 0.05*suave;
          bola.position.set(radio*Math.cos(ang), altura, radio*Math.sin(ang));
          if(p>=1){ d.activo=false; d.posada=true; }
        } else if(d.posada){
          // Ya cayó: la rueda sigue girando despacio y la bola va CON
          // ella, quieta en su casillero. Es lo que hace una rueda real.
          disco.rotation.y += 0.0025;
          const ang=d.bola + (disco.rotation.y - d.rueda);
          const radio=RADIO_BOLA-0.35;
          bola.position.set(radio*Math.cos(ang), 0.09, radio*Math.sin(ang));
        } else {
          // En reposo: rueda lenta, bola orbitando al revés
          disco.rotation.y += 0.004;
          const ang=-t*1.6;
          bola.position.set(RADIO_BOLA*Math.cos(ang), 0.14,
                            RADIO_BOLA*Math.sin(ang));
        }
        rend.render(esc, cam);
      };
      animar();

      const alRedimensionar=()=>{
        if(!cont.current) return;
        const w=cont.current.clientWidth||240;
        cam.aspect=w/alto; cam.updateProjectionMatrix(); rend.setSize(w,alto);
      };
      window.addEventListener("resize", alRedimensionar);
      escena.current.limpiar=()=>{
        window.removeEventListener("resize", alRedimensionar);
      };
    }).catch(()=>{ if(vivo) setFalla(true); });

    return()=>{
      vivo=false;
      if(animId) cancelAnimationFrame(animId);
      const e=escena.current;
      if(e.limpiar) e.limpiar();
      if(e.rend){
        e.rend.dispose();
        if(e.rend.domElement?.parentNode)
          e.rend.domElement.parentNode.removeChild(e.rend.domElement);
      }
      escena.current={};
    };
  },[alto]);

  // ── Lanzar el giro cuando llega el número ─────────────────
  useEffect(()=>{
    const e=escena.current;
    if(!e.disco || numero==null) return;

    const idx=RUEDA.indexOf(numero);
    if(idx<0) return;

    const paso=(Math.PI*2)/37;
    // Centro del casillero ganador, en el marco del disco
    const enDisco = -(idx*paso + paso/2) + Math.PI/2;

    const ruedaIni=e.disco.rotation.y;
    const ruedaFin=ruedaIni + Math.PI*2*3 + 0.9;   // tres vueltas y pico

    // La bola termina justo sobre ese casillero, ya girado
    const bolaFin = ruedaFin + enDisco;
    const bolaIni = bolaFin - (Math.PI*2*6);       // seis vueltas al revés

    destino.current={
      activo:true, posada:false,
      t0: e.reloj ? e.reloj.getElapsedTime() : 0,
      ruedaIni, rueda:ruedaFin, bolaIni, bola:bolaFin,
    };
  },[numero, girando]);

  if(falla){
    return(
      <div style={{height:alto,display:"flex",alignItems:"center",
        justifyContent:"center",color:"#5A6690",fontSize:12}}>
        No se pudo cargar la rueda 3D</div>
    );
  }

  return <div ref={cont} style={{width:"100%",height:alto}}/>;
}
