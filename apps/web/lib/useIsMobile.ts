"use client";

import { useEffect, useState } from "react";

// Reports whether the viewport should use the stacked (single-column) layout.
// The threshold covers phones AND tablets in portrait: the desktop layout places
// four floating panels in the corners and needs ~1000px to avoid collisions,
// so below that we fall back to the top-pill + bottom-dock layout.
// SSR-safe (false until mounted).
export function useIsMobile(breakpoint = 1000): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}
