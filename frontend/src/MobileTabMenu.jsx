// ═══════════════════════════════════════════════════════════════
// MOBILE TAB MENU — the full-screen megamenu behind the hamburger
// ═══════════════════════════════════════════════════════════════
// Shared by AgenciaPanel and AdminPanel: below 1024px, each panel used
// to render its own separate mobile tab strip next to its own desktop
// sidebar (a horizontal scrolling row for Agencia, a fixed 6-column
// bottom grid for Admin). Both are gone now, replaced by this one
// component, opened from a hamburger button in each panel's header.
//
// It reads the same `groups` (TAB_GROUPS) + `tabs` (TABS) shape each
// panel already builds for its desktop sidebar — see
// sidebarGroupKeysMatchTabs.test.js, which guards that every TABS key
// lands in exactly one group — so there is exactly one grouping per
// panel, not a second one invented for mobile.
import Icon from "./Icon";
import { oscuro as Q, F_BODY, RADII, SPACING, TEXT } from "./theme";

export default function MobileTabMenu({
  open, onClose, groups, tabs, activeTab, onSelect, badges = {}, topContent,
}){
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      zIndex:300,display:"flex",justifyContent:"flex-end"}}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"rgba(6,6,18,0.98)",
        backdropFilter:"blur(20px)",width:"min(86vw,360px)",maxWidth:360,
        height:"100%",overflowY:"auto",padding:SPACING[20],
        borderLeft:`1px solid ${Q.border}`}}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:SPACING[12]}}>
          <button onClick={onClose} aria-label="Cerrar menú" style={{
            background:"transparent",border:"none",color:Q.muted,
            cursor:"pointer",padding:SPACING[4],display:"flex"}}>
            <Icon name="x" size={22}/>
          </button>
        </div>

        {topContent}

        {groups.flatMap((group,gi)=>{
          const groupTabs = group.keys.map(k=>tabs.find(t=>t.k===k)).filter(Boolean);
          if(groupTabs.length===0) return [];
          return [
            <div key={`mtm-group-${group.label}`} style={{
              marginTop:gi===0?0:SPACING[16],
              padding:"0 4px",marginBottom:SPACING[4],
              color:Q.dim,fontSize:TEXT[12],fontWeight:700,
              textTransform:"uppercase",letterSpacing:1,fontFamily:F_BODY,
            }}>{group.label}</div>,
            ...groupTabs.map(t=>(
              <button key={t.k} onClick={()=>{ onSelect(t.k); onClose(); }} style={{
                background:activeTab===t.k?`linear-gradient(135deg,${Q.violet}44,${Q.cyan}22)`:"transparent",
                border:`1px solid ${activeTab===t.k?Q.violet:"transparent"}`,
                borderRadius:RADII.md,cursor:"pointer",width:"100%",
                minHeight:48,padding:"0 12px",marginBottom:SPACING[4],
                display:"flex",alignItems:"center",gap:SPACING[12],
                textAlign:"left",position:"relative",
                color:activeTab===t.k?Q.cyan:Q.text,fontSize:TEXT[14],
                fontWeight:activeTab===t.k?700:400,fontFamily:F_BODY,
              }}>
                <span style={{fontSize:17,display:"flex",flexShrink:0,
                  filter:activeTab===t.k?`drop-shadow(0 0 6px ${Q.cyan})`:"none"}}>{t.i}</span>
                <span style={{flex:1,minWidth:0,overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.l}</span>
                {badges[t.k]>0&&(
                  <span style={{background:Q.red,color:"#fff",borderRadius:RADII.md,
                    minWidth:18,height:18,fontSize:TEXT[12],fontWeight:800,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    padding:"0 4px",lineHeight:1,fontFamily:F_BODY,flexShrink:0}}>
                    {badges[t.k]>9?"9+":badges[t.k]}</span>
                )}
              </button>
            )),
          ];
        })}
      </div>
    </div>
  );
}
