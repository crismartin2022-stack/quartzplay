// desktopShellLayout — shared way to ask whether the viewport is
// desktop-wide, used by the Admin and Agencia panels' shells (see
// odd/tasks/desktop-shell.md). At and above this width, each panel turns
// its horizontal tab bar into a 264px sidebar instead of forking a second
// tab list; below it, nothing changes.
//
// The width check mirrors the pattern already used in Web.jsx — a
// useState initialised from window.innerWidth, kept in sync with a
// resize listener — moved here so both panels share one implementation
// and align to the prototype's 1024px breakpoint (html/styles.css:1240)
// instead of the 1000px one screen happened to use.

import { useState, useEffect } from "react";

export const DESKTOP_SHELL_BREAKPOINT = 1024;

// Pure comparison, kept separate from the hook so the boundary itself can
// be unit-tested without a renderer — this project's test suite never
// mounts a component.
export function isDesktopShellWidth(width, breakpoint = DESKTOP_SHELL_BREAKPOINT) {
  return width >= breakpoint;
}

export function useDesktopShellWidth(breakpoint = DESKTOP_SHELL_BREAKPOINT) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? isDesktopShellWidth(window.innerWidth, breakpoint) : true
  );
  useEffect(() => {
    const onResize = () => setIsDesktop(isDesktopShellWidth(window.innerWidth, breakpoint));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isDesktop;
}
