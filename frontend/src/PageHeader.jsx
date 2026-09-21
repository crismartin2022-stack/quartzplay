import { cloneElement, isValidElement } from "react";
import { oscuro as Q, F_BODY, TEXT, SPACING } from "./theme";

// ═══════════════════════════════════════════════════════════════
// PAGE HEADER
//
// The panels' 29 tabs open in four different ways: 18 already follow the
// same unwritten standard (fontWeight:700/fontSize:15 title in Q.text,
// fontSize:12/Q.muted description), a few drifted from it slightly, and
// eight open straight into content with no header at all. This component
// is that standard, written down once: see odd/tasks/page-headers.md for
// the map that found it.
//
// Spacing is fixed, not a prop: SPACING[4] under the title row, SPACING[16]
// under the whole block. The title icon is always drawn at size 15,
// whatever size the caller's own icon element was created with — so a
// sidebar icon (size 12/13/14) can be reused here without redeclaring it.
//
// `eyebrow` is not a decorative label. In the prototype it always carries
// real data ("Agencia FAR", "51 agencias", "Control de red"). A screen
// with nothing true to put there simply does not pass one.
export default function PageHeader({ icon, title, description, action, eyebrow }){
  const renderedIcon = isValidElement(icon) ? cloneElement(icon, { size: TEXT[20] }) : icon;

  return (
    <div style={{marginBottom:SPACING[16]}}>
      {eyebrow&&(
        <div style={{color:Q.muted,fontSize:TEXT[11],textTransform:"uppercase",
          letterSpacing:0.8,fontFamily:F_BODY,marginBottom:SPACING[4]}}>
          {eyebrow}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"center",gap:SPACING[8],marginBottom:SPACING[4]}}>
        <div style={{color:Q.text,fontWeight:700,fontSize:TEXT[20],fontFamily:F_BODY}}>
          {renderedIcon}{renderedIcon?" ":null}{title}
        </div>
        {action&&<div style={{flexShrink:0}}>{action}</div>}
      </div>
      {description&&(
        <div style={{color:Q.muted,fontSize:TEXT[13],lineHeight:1.5,fontFamily:F_BODY}}>
          {description}
        </div>
      )}
    </div>
  );
}
