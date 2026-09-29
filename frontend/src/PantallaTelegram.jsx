// Lo que ve quien abre la raíz desde un navegador.
//
// `App.jsx` es la mini-app de Telegram: adentro funciona perfecto, pero
// su identidad sale de `initData`, que en Chrome no existe. Hasta ahora
// esa pantalla simplemente se quedaba sin autenticar, sin decir por qué,
// y quien llegaba por una búsqueda se iba.
//
// Las dos salidas están a propósito. Mandar solo al bot pierde al jugador
// que no quiere instalar Telegram, que es justo el que el registro del
// sitio existe para capturar.

import { getFrontendConfig } from "./config";
import { oscuro as Q, F_NUM, F_BODY, inkOn, RADII, SPACING } from "./theme";
import BrandMark from "./BrandMark";
import Mascot from "./Mascot";
import { codigoDeReferido, enlaceAlBot, enlaceAlSitio } from "./puertaTelegram";

const { botUsername: BOT } = getFrontendConfig();

export default function PantallaTelegram() {
  const codigo = codigoDeReferido(
    window.location.search,
    window.Telegram?.WebApp?.initDataUnsafe?.start_param || "");
  const bot = enlaceAlBot(BOT, codigo);

  return (
    <div style={{minHeight:"100dvh",background:Q.void,display:"flex",
      alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:520}}>
        <div style={{display:"flex",justifyContent:"center",marginBottom:24}}>
          <BrandMark size={40}/>
        </div>

        {/* El mismo lenguaje que el hero de la mini-app: degradado violeta,
            la foto de cancha al 30% y la mascota asomando. Que se reconozca
            como el mismo producto es el punto de la pantalla. */}
        <div style={{position:"relative",overflow:"hidden",
          borderRadius:RADII.lg,padding:"20px 16px",paddingRight:150,
          minHeight:244,
          background:`linear-gradient(115deg,${Q.violet2} 0%,${Q.violet} 70%)`}}>
          <div aria-hidden="true" style={{position:"absolute",inset:0,
            backgroundImage:"url(/brand/fondo-hero.webp)",backgroundSize:"cover",
            backgroundPosition:"center",opacity:0.3,pointerEvents:"none"}}/>
          <Mascot size={230} style={{position:"absolute",right:-28,bottom:-46,
            opacity:0.96,zIndex:2,clipPath:"inset(0 0 13% 0)"}}/>

          <div style={{position:"relative",zIndex:3}}>
            <div style={{fontSize:12,letterSpacing:2,fontWeight:800,color:Q.gold,
              fontFamily:F_BODY}}>ESTÁS EN EL LUGAR EQUIVOCADO</div>
            <div style={{fontFamily:F_NUM,fontSize:22,fontWeight:700,
              color:inkOn(Q.violet2,Q.violet),lineHeight:1.15,marginTop:5}}>
              Esta pantalla vive<br/>dentro de Telegram</div>
            <div style={{fontSize:12,color:inkOn(Q.violet2,Q.violet),opacity:.85,
              marginTop:7,lineHeight:1.4,maxWidth:230,fontFamily:F_BODY}}>
              Abrila desde el bot y entrás con tu cuenta de siempre.</div>
          </div>
        </div>

        <div style={{marginTop:16,display:"flex",flexDirection:"column",
          gap:SPACING[8]}}>
          {/* Sin usuario de bot configurado no se ofrece la salida: mejor
              una sola puerta que un enlace a t.me/undefined. */}
          {bot&&(
            <a href={bot} style={{display:"block",textAlign:"center",
              background:Q.goldBg,color:inkOn(Q.goldBg),borderRadius:RADII.sm,
              padding:"16px",fontWeight:700,fontSize:13.5,
              fontFamily:F_BODY,textDecoration:"none"}}>
              Abrir en Telegram</a>
          )}

          <a href={enlaceAlSitio(codigo)} style={{display:"block",
            textAlign:"center",background:"transparent",color:Q.text,
            border:`1px solid ${Q.border}`,borderRadius:RADII.sm,
            padding:"16px",fontWeight:700,fontSize:13.5,
            fontFamily:F_BODY,textDecoration:"none"}}>
            Jugar desde el navegador</a>
        </div>

        <div style={{marginTop:16,textAlign:"center",color:Q.dim,fontSize:12,
          lineHeight:1.5,fontFamily:F_BODY}}>
          ¿No tenés Telegram? Podés crear tu cuenta y jugar desde acá mismo.
        </div>
      </div>
    </div>
  );
}
