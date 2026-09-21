import fs from "fs";
import path from "path";

// T3 of odd/tasks/sidebar-groups.md: Agencia.jsx and Admin.jsx each
// declare a desktop-only TAB_GROUPS structure that rearranges the panel's
// flat TABS list into a menu. This is the guard that stops a tab from
// silently disappearing from the desktop sidebar (or from the mobile
// strip, since both read the same TABS) when someone adds or renames one
// later: every TABS key must land in exactly one group, and no group may
// invent a key that TABS does not have.
//
// Structural, source-based assertions — no DOM renderer for these panels
// here (see jsxTagsAreBound.test.js / agenciaDesktopSidebar.test.js for
// the same constraint solved the same way). Reads the actual source, not
// a hardcoded copy of either list, so a real edit to TABS or TAB_GROUPS is
// what this test sees.
const SRC = path.resolve(__dirname);

// Slices `source` from `startMarker` (unique in the file) up to the next
// `endMarker` that follows it. TAB_GROUPS sits before TABS in Agencia.jsx
// (module scope, ahead of the function that declares TABS) and after it
// in Admin.jsx (both at module scope) — each marker is searched from the
// start of the file rather than chained off the other's position, so
// this does not depend on which one comes first.
function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function keysFromTabsArray(arrayText) {
  return [...arrayText.matchAll(/k:\s*"(\w+)"/g)].map((m) => m[1]);
}

function keysFromGroupsArray(arrayText) {
  const groups = [...arrayText.matchAll(/\{\s*label:\s*"[^"]+",\s*keys:\s*\[([^\]]*)\]\s*\}/g)];
  return groups.flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((k) => k[1]));
}

function loadPanel(file, tabsEnd) {
  const source = fs.readFileSync(path.join(SRC, file), "utf8");
  const tabsText = sliceBetween(source, "const TABS=[", tabsEnd);
  const groupsText = sliceBetween(source, "const TAB_GROUPS = [", "];");
  return {
    tabKeys: keysFromTabsArray(tabsText),
    groupKeys: keysFromGroupsArray(groupsText),
  };
}

const PANELS = {
  "Agencia.jsx": loadPanel("Agencia.jsx", "].filter("),
  "Admin.jsx": loadPanel("Admin.jsx", "];"),
};

describe("the matcher can see TABS and TAB_GROUPS keys at all", () => {
  test.each(Object.keys(PANELS))("%s has tab keys and group keys to check", (file) => {
    expect(PANELS[file].tabKeys.length).toBeGreaterThan(0);
    expect(PANELS[file].groupKeys.length).toBeGreaterThan(0);
  });
});

describe("every panel's flat tab list maps onto its groups one-to-one", () => {
  test.each(Object.keys(PANELS))("%s: every TABS key is in exactly one group", (file) => {
    const { tabKeys, groupKeys } = PANELS[file];
    // No key appears in more than one group (or twice in the same one).
    expect(new Set(groupKeys).size).toBe(groupKeys.length);
    // The set of grouped keys is exactly the set of TABS keys — same
    // members, same count, in both directions: no TABS key is missing
    // from the groups, and no group key is invented.
    expect([...groupKeys].sort()).toEqual([...tabKeys].sort());
  });
});

describe("positive control: the guard actually detects a missing key", () => {
  test("a group list short one key no longer matches the flat list", () => {
    const tabKeys = ["codigo", "envivo", "manual"];
    const groupKeysMissingOne = ["codigo", "envivo"]; // "manual" dropped
    expect([...groupKeysMissingOne].sort()).not.toEqual([...tabKeys].sort());
  });

  test("a group list with an invented key no longer matches the flat list", () => {
    const tabKeys = ["codigo", "envivo", "manual"];
    const groupKeysWithExtra = ["codigo", "envivo", "manual", "inventado"];
    expect([...groupKeysWithExtra].sort()).not.toEqual([...tabKeys].sort());
  });

  test("a key duplicated across two groups is caught by the no-duplicates check", () => {
    const groupKeysWithDuplicate = ["codigo", "envivo", "envivo"];
    expect(new Set(groupKeysWithDuplicate).size).not.toBe(groupKeysWithDuplicate.length);
  });
});
