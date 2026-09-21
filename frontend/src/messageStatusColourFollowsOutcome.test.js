// 32 message displays across the product carried a status without showing
// it: the colour was fixed — mostly Q.muted, sometimes Q.cyan or Q.red —
// while the underlying state held both a success and an error outcome, the
// only visible difference being a "✅"/"⚠️" prefix inside the text itself.
// A player who joined a challenge and a player whose request failed read
// the same line in the same colour.
//
// This guard fails when a component whose message state carries both
// outcomes renders that message in a colour that does not depend on the
// outcome. It is deliberately per-component, not file-wide: a component
// that only ever sets errors (a dedicated red slot) is correct today and
// must keep its fixed colour — folding it into a blanket "no Q.muted near
// msg" rule would force a change nobody asked for and this guard does not
// require it.
//
// Read from source, the way messageStatusNotSniffed.test.js does: this
// project has no testing-library, so the screens are checked as text.
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname);
const sourceOf = (file) => fs.readFileSync(path.join(SRC, file), "utf8");

// Every top-level component in these files is a `function Name(` or
// `const Name =` declaration starting at column 0; none nest inside
// another. A component's body is therefore everything between its
// declaration and the next one (or end of file).
const DECL = /^(?:function\s+(\w+)\s*\(|const\s+([A-Z]\w*)\s*=)/gm;

function componentBody(source, name) {
  const decls = [...source.matchAll(DECL)].map((m) => ({
    index: m.index,
    name: m[1] || m[2],
  }));
  const i = decls.findIndex((d) => d.name === name);
  if (i === -1) {
    throw new Error(`component "${name}" not found`);
  }
  const start = decls[i].index;
  const end = i + 1 < decls.length ? decls[i + 1].index : source.length;
  return source.slice(start, end);
}

// The colour expression feeding the `{msg && ...}` render's outer style,
// whatever shape it takes (`{msg&&<div style={{color:` inline, or
// `{msg&&(\n  <div style={{color:` wrapped).
function msgColourExpr(body) {
  const anchor = body.indexOf("{msg&&");
  if (anchor === -1) return null;
  const window = body.slice(anchor, anchor + 300);
  const m = window.match(/color:\s*([^,\n}]+)/);
  return m ? m[1].trim() : null;
}

test("sanity: msgColourExpr tells a fixed colour from an outcome-derived one", () => {
  // Positive control on the helper itself, against synthetic input that
  // never touches the real files — proves the extraction and the
  // assertion below are capable of failing, not just capable of passing.
  const fixed = '{msg&&<div style={{color:Q.muted,fontSize:12}}>{msg}</div>}';
  const wrapped = '{msg&&(\n  <div style={{color:Q.cyan,fontSize:12}}>{msg}</div>\n)}';
  const derived = '{msg&&<div style={{color:msg.ok?Q.green:Q.red,fontSize:12}}>{msg.text}</div>}';

  expect(msgColourExpr(fixed)).toBe("Q.muted");
  expect(msgColourExpr(wrapped)).toBe("Q.cyan");
  expect(msgColourExpr(fixed)).not.toMatch(/^msg\.ok\s*\?/);
  expect(msgColourExpr(derived)).toMatch(/^msg\.ok\s*\?/);
});

test("sanity: SETMSG_CALL_HAS_STATUS_GLYPH matches a glyph inside setMsg, not elsewhere", () => {
  // Positive control: proves the scoped regex actually fires on the shape
  // it exists to catch, and stays quiet on unrelated static copy (a toggle
  // button label) that happens to carry the same glyphs.
  expect('setMsg("✅ "+(d.aviso||"Aceptado"));').toMatch(SETMSG_CALL_HAS_STATUS_GLYPH);
  expect('setMsg(`⚠️ ${e.message}`);').toMatch(SETMSG_CALL_HAS_STATUS_GLYPH);
  expect('{activo?"✅ Activo":"⭕ Apagado"}</button>').not.toMatch(SETMSG_CALL_HAS_STATUS_GLYPH);
});

// Components whose message state is reachable from more than one outcome
// (both a success setMsg and an error setMsg) and must therefore colour
// itself from `msg.ok`, not from a fixed colour.
const BOTH_OUTCOMES = {
  "App.jsx": ["JuegoResponsable", "MuroDesafios", "MisDesafios"],
  "Web.jsx": ["JuegoResponsableWeb", "MuroDesafiosWeb", "MisDesafiosWeb"],
  "Agencia.jsx": [
    "ProveedoresAgencia",
    "ProductosRed",
    "Terminales",
    "DesafiosAgencia",
    "MisCanales",
  ],
  "Admin.jsx": [
    "TabEventos",
    "DesafiosConfig",
    "IacoinPanel",
    "DisputasPanel",
    "ModeracionPanel",
    "LogosCasino",
    "ProveedoresCasino",
    "Integraciones",
    "RiesgoCasino",
    "TabTester",
    "TabResponsable",
    "TabSuperBono",
    "TabMonedas",
    "TabRecompensas",
    "TabProductosPermisos",
    "TabMensajes",
    "TabRiesgoSistema",
    "TabFlash",
    "TabMejora",
    "TabBoost",
    "TabBanners",
    "TabRiesgo",
  ],
};

// Admin.jsx also has toggle buttons that render a static "✅ Activo" /
// "⭕ Apagado" label off a boolean flag (never off `msg`) — unrelated
// decoration this change doesn't touch. The prefix-retirement check below
// is scoped to `setMsg(...)` call arguments specifically, not the whole
// component body, so it doesn't trip on those.
//
// Integraciones is the one deliberate exception even there: `sincronizar()`
// reports a batch of per-integration results in one string, and each
// item's own ✅/⚠️ is content — which integration worked and which didn't —
// not decoration a single top-level colour could replace. Only the
// batch-level colour (msg.ok = no failures) moved out of the text; the
// per-item glyphs inside that one summary stay.
const SETMSG_KEEPS_PREFIX_ON_PURPOSE = new Set(["Integraciones"]);

// Matches a status glyph appearing inside a setMsg(...) call's own
// argument — scoped narrower than the whole component body so it doesn't
// false-positive on unrelated static UI copy.
const SETMSG_CALL_HAS_STATUS_GLYPH = /setMsg\([^;]*?(?:✅|⚠️)/;

for (const [file, names] of Object.entries(BOTH_OUTCOMES)) {
  describe(`${file}: components whose message carries both outcomes`, () => {
    const source = sourceOf(file);

    test.each(names)("%s's message colour depends on msg.ok, not a fixed colour", (name) => {
      const body = componentBody(source, name);
      const colour = msgColourExpr(body);
      expect(colour).not.toBeNull();
      expect(colour).toMatch(/^msg\.ok\s*\?/);
    });

    test.each(names)("%s renders msg.text with a status icon, not the bare message", (name) => {
      const body = componentBody(source, name);
      expect(body).toMatch(/\{msg\.text\}/);
      expect(body).toMatch(/<Icon name=\{msg\.ok\?"circle-check":"triangle-alert"\}/);
    });

    test.each(names)("%s's state is {text, ok} | null, not a bare string", (name) => {
      // Not every component clears its message (MisDesafios/MisDesafiosWeb
      // never do), so a clear-to-null call is not required — only that no
      // call sets the old bare empty-string sentinel and every
      // content-carrying call sets the {text, ok} shape.
      const body = componentBody(source, name);
      expect(body).toMatch(/setMsg\(\{\s*text\s*:/);
      expect(body).not.toMatch(/setMsg\(""\)/);
    });

    test.each(names.filter((n) => !SETMSG_KEEPS_PREFIX_ON_PURPOSE.has(n)))(
      "%s no longer carries the ✅/⚠️ prefix inside a setMsg call — the colour and icon carry it now",
      (name) => {
        const body = componentBody(source, name);
        expect(body).not.toMatch(SETMSG_CALL_HAS_STATUS_GLYPH);
      }
    );
  });
}
