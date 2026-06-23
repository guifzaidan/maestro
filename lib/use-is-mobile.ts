"use client";

import { useEffect, useState } from "react";

/**
 * Detecta viewport mobile via matchMedia. SSR-safe (começa em false e
 * resolve no mount). Use para servir versões mais leves de efeitos pesados
 * (blur grande, filter animado, mix-blend) que travam em GPUs de celular.
 */
export function useIsMobile(maxWidth = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);

  return isMobile;
}
