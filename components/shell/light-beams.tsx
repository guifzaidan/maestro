"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";

/**
 * Feixes de luz de fundo — mesmos da home, mas coloridos pela paleta da
 * branch ativa. Renderizado no AppShell para aparecer em todas as telas.
 */
const BEAMS = [
  { left: "30%", angle: -26, width: 130, dur: 9,  delay: 0,    tone: 0 },
  { left: "42%", angle: -10, width: 90,  dur: 12, delay: 0.6,  tone: 1 },
  { left: "50%", angle: 2,   width: 150, dur: 8,  delay: 0.3,  tone: 2 },
  { left: "58%", angle: 14,  width: 100, dur: 11, delay: 0.9,  tone: 3 },
  { left: "68%", angle: 28,  width: 120, dur: 14, delay: 0.45, tone: 4 },
  { left: "46%", angle: -4,  width: 70,  dur: 10, delay: 1.2,  tone: 5 },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Interpola dois hex e devolve uma cor rgb() — gera variações da paleta. */
function mix(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const ch = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

// Paleta multicolorida (mesma da home) — usada quando "todas as branches" está ativa.
const MULTI = ["#f59e0b", "#22d3ee", "#10b981", "#3b82f6", "#a855f7", "#f97316"];

export function LightBeams() {
  const pathname = usePathname();
  const { allBranches, activeWorkspace: ws } = useWorkspace();

  // A home tem seus próprios feixes coloridos variados (não seguem a branch).
  if (pathname === "/") return null;
  const a = ws.accent;
  const b = ws.accent2;

  // Com todas as branches ativas → paleta multicolorida (indica visão unificada).
  // Caso contrário, 6 tons derivados de accent ↔ accent2 da branch ativa.
  const tones = allBranches
    ? MULTI
    : [a, mix(a, b, 0.5), b, mix(b, a, 0.35), a, mix(a, b, 0.75)];

  // Chave da seleção — ao mudar, o conjunto de feixes remonta e os novos
  // "surgem" (crossfade) na cor da branch, enquanto os antigos somem.
  const sel = allBranches ? "all" : ws.id;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <AnimatePresence>
        <motion.div
          key={sel}
          className="absolute inset-0"
          style={{ mixBlendMode: "screen" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {BEAMS.map((beam, i) => (
            <motion.div
              key={i}
              className="absolute top-[-15%] h-[150vh] origin-top"
              style={{
                left: beam.left,
                width: beam.width,
                background: `linear-gradient(to bottom, ${tones[beam.tone]}, transparent 96%)`,
                filter: "blur(45px)",
              }}
              animate={{ rotate: [beam.angle - 5, beam.angle + 5, beam.angle - 5], opacity: [0.16, 0.4, 0.16] }}
              transition={{ duration: beam.dur, delay: beam.delay, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </motion.div>
      </AnimatePresence>
      {/* Vinheta para suavizar as bordas */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(135% 100% at 50% 25%, transparent 55%, rgba(7,7,8,0.55) 100%)" }}
      />
    </div>
  );
}
