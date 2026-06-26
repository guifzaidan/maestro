"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";

/** Variantes de fundo da tela principal. Trocável por constante ou ?bg=. */
export type HeroBackgroundVariant = "aurora" | "colorbends" | "colorbends3";

// WebGL só no cliente — sem SSR (evita "window is not defined" e flash).
const ColorBends = dynamic(() => import("./color-bends"), { ssr: false });

interface ActiveWs { accent: string; accent2: string }

const BEAMS = [
  { color: "#f59e0b", left: "30%", angle: -26, width: 130, dur: 9,  delay: 0 },
  { color: "#22d3ee", left: "42%", angle: -10, width: 90,  dur: 12, delay: 0.6 },
  { color: "#10b981", left: "50%", angle: 2,   width: 150, dur: 8,  delay: 0.3 },
  { color: "#3b82f6", left: "58%", angle: 14,  width: 100, dur: 11, delay: 0.9 },
  { color: "#a855f7", left: "68%", angle: 28,  width: 120, dur: 14, delay: 0.45 },
  { color: "#f97316", left: "46%", angle: -4,  width: 70,  dur: 10, delay: 1.2 },
];

/** Casca de posicionamento compartilhada entre as variantes.
 *  `fixed inset-0` cobre a viewport inteira em todas as páginas (atrás do
 *  conteúdo, que fica em z-10), sem deixar faixa preta no rodapé. */
const WRAPPER =
  "pointer-events-none fixed inset-0 z-0 overflow-hidden";

/* ── Aurora + feixes (fundo original) ──────────────────────────── */
function AuroraBeams({ isMobile, activeWs }: { isMobile: boolean; activeWs: ActiveWs }) {
  if (isMobile) {
    // Versão leve no mobile: sem filter animado, blur menor, sem feixes/mix-blend.
    return (
      <div className={WRAPPER}>
        <motion.div className="absolute left-[28%] top-[18%] h-[52vh] w-[52vh] rounded-full will-change-transform"
          style={{ background: "radial-gradient(closest-side, #f59e0b, transparent 70%)", filter: "blur(55px)", opacity: 0.42 }}
          animate={{ x: ["-50%", "-25%", "-50%"], y: ["-12%", "8%", "-12%"], scale: [1, 1.12, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute left-[60%] top-[26%] h-[46vh] w-[46vh] rounded-full will-change-transform"
          style={{ background: "radial-gradient(closest-side, #22d3ee, transparent 70%)", filter: "blur(55px)", opacity: 0.34 }}
          animate={{ x: ["-55%", "-30%", "-55%"], y: ["4%", "-14%", "4%"], scale: [1.05, 0.92, 1.05] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute left-[45%] top-[40%] h-[50vh] w-[50vh] rounded-full will-change-transform"
          style={{ background: "radial-gradient(closest-side, #a855f7, transparent 70%)", filter: "blur(55px)", opacity: 0.32 }}
          animate={{ x: ["-40%", "-58%", "-40%"], y: ["0%", "-10%", "0%"], scale: [0.95, 1.15, 0.95] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(135% 100% at 50% 30%, transparent 55%, rgba(7,7,8,0.4) 100%)" }} />
      </div>
    );
  }

  return (
    <motion.div
      className={WRAPPER}
      animate={{ filter: ["hue-rotate(0deg)", "hue-rotate(360deg)"] }}
      transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
    >
      <motion.div className="absolute left-1/2 top-1/4 h-[65vh] w-[65vh] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${activeWs.accent}, transparent 68%)`, filter: "blur(80px)" }}
        animate={{ x: ["-62%", "-28%", "-68%", "-62%"], y: ["-22%", "12%", "-6%", "-22%"], scale: [1, 1.22, 0.92, 1], opacity: [0.5, 0.65, 0.42, 0.5] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute left-1/2 top-1/3 h-[52vh] w-[52vh] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${activeWs.accent2}, transparent 68%)`, filter: "blur(90px)" }}
        animate={{ x: ["-18%", "-58%", "-12%", "-18%"], y: ["2%", "-18%", "18%", "2%"], scale: [1.05, 0.88, 1.25, 1.05], opacity: [0.4, 0.55, 0.35, 0.4] }}
        transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute right-0 bottom-0 h-[48vh] w-[48vh] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.9), transparent 68%)", filter: "blur(95px)" }}
        animate={{ x: ["12%", "-12%", "18%", "12%"], y: ["12%", "-6%", "6%", "12%"], scale: [1, 1.2, 0.92, 1], opacity: [0.3, 0.42, 0.24, 0.3] }}
        transition={{ duration: 23, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute left-0 top-0 h-[42vh] w-[42vh] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${activeWs.accent}, transparent 70%)`, filter: "blur(100px)" }}
        animate={{ x: ["-20%", "10%", "-25%", "-20%"], y: ["-15%", "10%", "0%", "-15%"], scale: [0.95, 1.15, 1, 0.95], opacity: [0.28, 0.4, 0.22, 0.28] }}
        transition={{ duration: 21, repeat: Infinity, ease: "easeInOut" }} />
      <div className="absolute inset-0" style={{ mixBlendMode: "screen" }}>
        {BEAMS.map((b, i) => (
          <motion.div key={i} className="absolute top-[-15%] h-[150vh] origin-top"
            style={{ left: b.left, width: b.width, background: `linear-gradient(to bottom, ${b.color}, transparent 96%)`, filter: "blur(45px)" }}
            animate={{ rotate: [b.angle - 5, b.angle + 5, b.angle - 5], opacity: [0.18, 0.45, 0.18] }}
            transition={{ duration: b.dur, delay: b.delay, repeat: Infinity, ease: "easeInOut" }} />
        ))}
      </div>
      <div className="absolute inset-0" style={{ background: "radial-gradient(135% 100% at 50% 30%, transparent 55%, rgba(7,7,8,0.4) 100%)" }} />
    </motion.div>
  );
}

/** Paleta multicolor dos feixes originais — arco-íris fixo (variante colorbends). */
const BEND_COLORS = BEAMS.map((b) => b.color);

/* ── ColorBends (React Bits — shader WebGL) ────────────────────────
   Mesmas configurações nas duas variantes; só muda a paleta:
   - colorbends  → 6 cores (arco-íris dos feixes)
   - colorbends3 → 3 cores (accents da branch + índigo) */
function ColorBendsBg({ colors }: { colors: string[] }) {
  return (
    <div className={WRAPPER}>
      {/* Estilo stock do ColorBends (sem bandSeparation/preserveHue → defaults
          reproduzem o shader original). */}
      <ColorBends
        colors={colors}
        rotation={90}
        speed={0.2}
        scale={1}
        frequency={1}
        warpStrength={1}
        mouseInfluence={0}
        parallax={0}
        noise={0.15}
        iterations={1}
        intensity={1}
        bandWidth={6}
        autoRotate={0}
        transparent
      />
      {/* Vinheta pra escurecer as bordas e manter o conteúdo legível. */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(135% 100% at 50% 30%, transparent 50%, rgba(7,7,8,0.55) 100%)" }} />
    </div>
  );
}

export function HeroBackground({
  variant, isMobile, activeWs, colorsOverride,
}: {
  variant: HeroBackgroundVariant;
  isMobile: boolean;
  activeWs: ActiveWs;
  /** Sobrescreve a paleta das variantes ColorBends (ex: ciclo de cores na home). */
  colorsOverride?: string[];
}) {
  if (variant === "colorbends") return <ColorBendsBg colors={colorsOverride ?? BEND_COLORS} />;
  if (variant === "colorbends3") return <ColorBendsBg colors={colorsOverride ?? [activeWs.accent, activeWs.accent2, "#6366f1"]} />;
  return <AuroraBeams isMobile={isMobile} activeWs={activeWs} />;
}
