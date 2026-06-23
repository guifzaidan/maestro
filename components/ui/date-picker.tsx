"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/ui/icon";

const PT_MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const PT_DAYS = ["D","S","T","Q","Q","S","S"];

/**
 * DatePicker glass — suporta seleção de data única ou range (dd/mm/yyyy – dd/mm/yyyy).
 * onClose é chamado quando a seleção está completa (use para fechar dropdowns).
 * Em contexto inline, passe onClose como no-op.
 */
export function DatePicker({ value, onChange, onClose }: {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const parseDate = (s: string) => {
    const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const parseValue = (v: string): [Date | null, Date | null] => {
    const parts = v.split(" – ");
    return [parseDate(parts[0] ?? ""), parseDate(parts[1] ?? "")];
  };

  const [initStart, initEnd] = parseValue(value);
  const [rangeStart, setRangeStart] = useState<Date | null>(initStart);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(initEnd);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = initStart ?? today;
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

  const prev = () => setCursor(c => c.month === 0 ? { year: c.year-1, month: 11 } : { year: c.year, month: c.month-1 });
  const next = () => setCursor(c => c.month === 11 ? { year: c.year+1, month: 0 } : { year: c.year, month: c.month+1 });

  const dayDate = (day: number) => {
    const d = new Date(cursor.year, cursor.month, day);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const effectiveEnd = rangeEnd ?? (rangeStart && hoverDate && hoverDate > rangeStart ? hoverDate : null);
  const hasEffRange = !!(rangeStart && effectiveEnd);

  const pick = (day: number) => {
    const d = dayDate(day);
    if (!rangeStart || rangeEnd) {
      setRangeStart(d); setRangeEnd(null);
      onChange(fmt(d));
    } else if (d.getTime() === rangeStart.getTime()) {
      onChange(fmt(d)); onClose();
    } else if (d < rangeStart) {
      setRangeStart(d); setRangeEnd(null);
      onChange(fmt(d));
    } else {
      setRangeEnd(d);
      onChange(`${fmt(rangeStart)} – ${fmt(d)}`);
      onClose();
    }
  };

  const isSel   = (day: number) => { const t = dayDate(day).getTime(); return (!!rangeStart && t === rangeStart.getTime()) || (!!rangeEnd && t === rangeEnd.getTime()); };
  const isStart = (day: number) => !!rangeStart && dayDate(day).getTime() === rangeStart.getTime();
  const isEnd   = (day: number) => !!effectiveEnd && dayDate(day).getTime() === effectiveEnd.getTime();
  const inRange = (day: number) => { if (!rangeStart || !effectiveEnd) return false; const t = dayDate(day).getTime(); return t > rangeStart.getTime() && t < effectiveEnd.getTime(); };
  const isToday = (day: number) => dayDate(day).getTime() === today.getTime();

  const firstDow    = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const BAND = "rgba(255,255,255,0.10)";

  return (
    <div className="select-none">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <motion.button onClick={prev} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white">
          <Icon name="ChevronLeft" size={13} strokeWidth={2} />
        </motion.button>
        <span className="text-[12px] font-medium text-white/75">{PT_MONTHS[cursor.month]} {cursor.year}</span>
        <motion.button onClick={next} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white">
          <Icon name="ChevronRight" size={13} strokeWidth={2} />
        </motion.button>
      </div>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7">
        {PT_DAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-white/25">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="h-7" />;
          const sel   = isSel(day);
          const start = isStart(day);
          const end   = isEnd(day);
          const rang  = inRange(day);
          const tod   = isToday(day);
          return (
            <div key={i} className="relative flex h-7 items-center justify-center"
              onMouseEnter={() => setHoverDate(dayDate(day))}
              onMouseLeave={() => setHoverDate(null)}>
              {hasEffRange && start && <div className="absolute inset-y-1 left-1/2 right-0" style={{ background: BAND }} />}
              {hasEffRange && end   && <div className="absolute inset-y-1 left-0 right-1/2" style={{ background: BAND }} />}
              {rang                  && <div className="absolute inset-0 inset-y-1"          style={{ background: BAND }} />}
              <motion.button onClick={() => pick(day)} whileTap={{ scale: 0.88 }}
                className="relative z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-[12px]"
                style={{
                  background: sel ? "rgba(255,255,255,0.92)" : "transparent",
                  color:      sel ? "#0a0a0a" : tod ? "#fff" : "rgba(255,255,255,0.65)",
                  fontWeight: sel || tod ? 600 : 400,
                  boxShadow:  tod && !sel ? "0 0 0 1px rgba(255,255,255,0.22)" : undefined,
                }}>
                {day}
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-2.5">
        <button onClick={() => { setRangeStart(null); setRangeEnd(null); onChange(""); }}
          className="cursor-pointer text-[11px] text-white/25 transition-colors hover:text-white/50">
          Limpar
        </button>
        {rangeStart && !rangeEnd && (
          <span className="text-[10px] text-white/30">Selecione o dia final</span>
        )}
        <button onClick={() => { onChange(fmt(today)); onClose(); }}
          className="cursor-pointer text-[11px] text-white/35 transition-colors hover:text-white/70">
          Hoje
        </button>
      </div>
    </div>
  );
}
