"use client";

import { motion } from "framer-motion";

/**
 * Loader temático "maestro" — barras de regência/equalizador pulsando
 * com glow no accent ativo do workspace. Usado em transições de página
 * (loading.tsx) e em estados de carregamento inline.
 */

const BARS = [0, 1, 2, 3, 4];
// Alturas-alvo distintas por barra para um movimento orgânico (não uníssono).
const PEAKS = ["80%", "100%", "55%", "95%", "70%"];

export function Loader({
  label,
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-5 ${className}`}>
      <div className="relative flex h-10 items-end gap-[5px]">
        {/* halo de glow no accent */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.14), transparent 75%)",
          }}
        />
        {BARS.map((i) => (
          <motion.span
            key={i}
            className="relative w-[4px] rounded-full"
            style={{
              background: "linear-gradient(to top, rgba(255,255,255,0.55), #fff)",
              boxShadow: "0 0 10px -1px rgba(255,255,255,0.5)",
            }}
            initial={{ height: "30%" }}
            animate={{ height: ["28%", PEAKS[i], "28%"] }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.11,
            }}
          />
        ))}
      </div>

      {label && (
        <motion.p
          className="text-[13px] tracking-wide text-muted-2"
          animate={{ opacity: [0.35, 0.75, 0.35] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          {label}
        </motion.p>
      )}
    </div>
  );
}

/** Wrapper que centraliza o loader ocupando boa parte da viewport — para loading.tsx de rota. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[65vh] w-full items-center justify-center">
      <Loader label={label} />
    </div>
  );
}
