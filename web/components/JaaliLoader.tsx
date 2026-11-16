"use client";
import React from "react";

/**
 * Loading screen: the Bloomgard mark alone, large, filled with the same live gradient the AI orb runs on —
 * Neelam → Sindoor → Marigold turning inside the flower, over a soft glow in the same colours.
 *
 * The mark is a CSS mask, so the spinning gradient underneath shows through its shape. Pure CSS: it paints
 * before any data or font arrives. `label` is announced to screen readers but never drawn.
 */
export default function JaaliLoader({ label = "Opening your workspace" }: { label?: string }) {
  return (
    <div className="jl" role="status" aria-live="polite">
      <span className="jl__glow" aria-hidden />
      <span className="jl__mark" aria-hidden><i /></span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
