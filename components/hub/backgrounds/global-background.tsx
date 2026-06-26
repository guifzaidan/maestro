"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { HeroBackground, type HeroBackgroundVariant } from "./hero-background";

/**
 * Fundo da aplicação inteira — montado uma única vez no AppShell (root layout),
 * então o canvas WebGL persiste entre navegações. Aparece em todas as telas.
 *
 * Troque o padrão aqui, ou em runtime via ?bg=aurora|colorbends|colorbends3.
 */
const DEFAULT_BG: HeroBackgroundVariant = "colorbends3";

export function GlobalBackground() {
  const { activeWorkspace: activeWs } = useWorkspace();
  const isMobile = useIsMobile();
  // Inicia no default (estável no SSR) e só aplica a query após montar — senão
  // o HTML do servidor diverge do cliente e dá erro de hidratação.
  const [variant, setVariant] = useState<HeroBackgroundVariant>(DEFAULT_BG);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("bg");
    if (q === "aurora" || q === "colorbends" || q === "colorbends3") setVariant(q);
  }, []);

  // Mesma variante (ColorBends) também no mobile.
  return <HeroBackground variant={variant} isMobile={isMobile} activeWs={activeWs} />;
}
