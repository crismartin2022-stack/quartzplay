import {
  DESKTOP_SHELL_BREAKPOINT,
  isDesktopShellWidth,
  useDesktopShellWidth,
} from "./desktopShellLayout";

// desktopShellLayout — the shared way Admin.jsx and Agencia.jsx ask
// whether the viewport is desktop-wide, per odd/tasks/desktop-shell.md T1.
// The pure comparison is tested directly here, without a renderer, since
// this project's test suite never mounts a component (see
// jsxTagsAreBound.test.js and bottomNavSixItems.test.js for the same
// constraint solved with source-text guards instead).

describe("isDesktopShellWidth — the pure boundary check", () => {
  test("the default breakpoint matches the prototype's 1024px rule", () => {
    expect(DESKTOP_SHELL_BREAKPOINT).toBe(1024);
  });

  test("just below the breakpoint stays in the mobile shape", () => {
    expect(isDesktopShellWidth(1023)).toBe(false);
  });

  test("exactly at the breakpoint switches to the desktop shape", () => {
    expect(isDesktopShellWidth(1024)).toBe(true);
  });

  test("well above the breakpoint is desktop", () => {
    expect(isDesktopShellWidth(1600)).toBe(true);
  });

  test("a phone width is unambiguously mobile", () => {
    expect(isDesktopShellWidth(390)).toBe(false);
  });

  test("a custom breakpoint overrides the default instead of being ignored", () => {
    // Positive control for the second argument: if it were silently
    // dropped, both of these would collapse to the default-breakpoint
    // answer and this test would still pass by accident.
    expect(isDesktopShellWidth(900, 800)).toBe(true);
    expect(isDesktopShellWidth(700, 800)).toBe(false);
  });
});

describe("useDesktopShellWidth — shared by both panels", () => {
  test("is exported as a function the panels can call", () => {
    expect(typeof useDesktopShellWidth).toBe("function");
  });
});
