"use client";
import React from "react";

/**
 * Loading screen: the Bloomgard jaali lattice drawing itself, with a slowly turning mandala behind it.
 * Pure SVG + CSS so it paints immediately, before any data or fonts arrive.
 */
export default function JaaliLoader({ label = "Opening your workspace" }: { label?: string }) {
  return (
    <div className="jl" role="status" aria-live="polite">
      <div className="jl__art" aria-hidden>
        <svg viewBox="0 0 120 120" className="jl__mandala">
          {[18, 34, 50].map((r) => <circle key={r} cx="60" cy="60" r={r} />)}
          {Array.from({ length: 8 }).map((_, i) => (
            <path key={i} transform={`rotate(${i * 45} 60 60)`} d="M60 10 Q74 34 60 58 Q46 34 60 10" />
          ))}
        </svg>
        <svg viewBox="0 0 120 120" className="jl__lattice">
          {[[0, 0], [60, 0], [120, 0], [0, 60], [60, 60], [120, 60], [0, 120], [60, 120], [120, 120]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="30" style={{ animationDelay: `${i * 0.09}s` }} />
          ))}
        </svg>
      </div>
      <p className="jl__label">{label}</p>
    </div>
  );
}
