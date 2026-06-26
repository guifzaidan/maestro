"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { HeroBackground, type HeroBackgroundVariant } from "./hero-background";

/**
 * Fundo da aplicação inteira — montado uma única vez no AppShell (root layout),
 * então o canvas WebGL persiste entre navegações. Aparece em todas as telas.
 *
 * Comportamento por página:
 *  - home ("/")  → cicla suavemente entre as paletas de TODAS as branches
 *  - demais      → usa a paleta da branch ativa (colorbends3)
 *
 * Troque o padrão aqui, ou em runtime via ?bg=aurora|colorbends|colorbends3.
 */
const DEFAULT_BG: HeroBackgroundVariant = "colorbends3";
const THIRD = "#6366f1"; // terceiro tom fixo (mesmo da colorbends3)

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Interpola dois hex (canal a canal) e devolve um hex. */
function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const to2 = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${to2(ca[0] + (cb[0] - ca[0]) * t)}${to2(ca[1] + (cb[1] - ca[1]) * t)}${to2(ca[2] + (cb[2] - ca[2]) * t)}`;
}

/**
 * Quando habilitado, percorre as paletas em loop com crossfade suave
 * (smoothstep). Atualiza ~14fps — o shader segue renderizando a 60fps.
 */
function useCyclingColors(palettes: string[][], enabled: boolean, secondsPerBranch = 7): string[] | undefined {
  const [colors, setColors] = useState<string[] | undefined>(undefined);
  const ref = useRef(palettes);
  ref.current = palettes;
  const n = palettes.length;

  useEffect(() => {
    if (!enabled || n === 0) {
      setColors(undefined);
      return;
    }
    let raf = 0;
    let start = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      if (now - last > 70) {
        last = now;
        const pals = ref.current;
        const m = pals.length;
        const pos = ((now - start) / (secondsPerBranch * 1000)) % m;
        const i = Math.floor(pos);
        const frac = pos - i;
        const e = frac * frac * (3 - 2 * frac); // smoothstep
        const a = pals[i];
        const b = pals[(i + 1) % m];
        setColors(a.map((c, k) => lerpHex(c, b[k] ?? c, e)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, n, secondsPerBranch]);

  return colors;
}

export function GlobalBackground() {
  const pathname = usePathname();
  const { activeWorkspace: activeWs, branches } = useWorkspace();
  const isMobile = useIsMobile();

  // Inicia no default (estável no SSR) e só aplica a query após montar — senão
  // o HTML do servidor diverge do cliente e dá erro de hidratação.
  const [variant, setVariant] = useState<HeroBackgroundVariant>(DEFAULT_BG);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("bg");
    if (q === "aurora" || q === "colorbends" || q === "colorbends3") setVariant(q);
  }, []);

  // Na home, cicla entre as paletas de todas as branches; fora dela, branch ativa.
  const isHome = pathname === "/";
  const palettes = branches.map((b) => [b.accent, b.accent2, THIRD]);
  const cycling = useCyclingColors(palettes, isHome);

  return (
    <HeroBackground
      variant={variant}
      isMobile={isMobile}
      activeWs={activeWs}
      colorsOverride={isHome ? cycling : undefined}
    />
  );
}
