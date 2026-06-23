"use client";

import { useEffect, useRef } from "react";

export function Sparkline({
  data,
  width = 120,
  height = 40,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d - min) / range) * (height - 6) - 3;
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  const [lastX, lastY] = points[points.length - 1];
  const gid = `spark-${Math.abs(data.reduce((a, b) => a + b, 0))}`;

  const lineRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = String(len);
    el.style.strokeDashoffset = String(len);
    el.getBoundingClientRect();
    el.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.25,0.46,0.45,0.94)";
    el.style.strokeDashoffset = "0";
  }, []);

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        ref={lineRef}
        points={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point pulse */}
      <circle cx={lastX} cy={lastY} r="3" fill="var(--accent)" />
      <circle cx={lastX} cy={lastY} r="3" fill="var(--accent)" opacity="0.35">
        <animate attributeName="r" values="3;8;3" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0;0.35" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
