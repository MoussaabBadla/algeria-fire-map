"use client";

import { useEffect, useState } from "react";

// Reports whether the viewport is phone-sized. SSR-safe (false until mounted).
export function useIsMobile(breakpoint = 720): boolean {
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
