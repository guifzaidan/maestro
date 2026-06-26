"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * Navegação por swipe horizontal — só no mobile.
 * Ordem das páginas: Home → Tarefas → Configurações.
 *   - arrastar pra ESQUERDA → próxima página (avança na ordem)
 *   - arrastar pra DIREITA  → página anterior
 * Nas pontas (Home à esquerda, Configurações à direita) não faz nada.
 */
const PAGES = ["/", "/tasks", "/settings"];
const MIN_DX = 60; // distância horizontal mínima (px)
const H_OVER_V = 1.5; // o gesto tem que ser claramente horizontal

export function MobileSwipeNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { tracking = false; return; }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Precisa ser um swipe horizontal decisivo (senão é scroll vertical).
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * H_OVER_V) return;
      const i = PAGES.indexOf(pathname);
      if (i === -1) return;
      const next = dx < 0 ? i + 1 : i - 1; // arrastar pra esquerda = próxima; direita = anterior
      if (next < 0 || next >= PAGES.length) return;
      router.push(PAGES[next]);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isMobile, pathname, router]);

  return null;
}
