"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render a dialog or popover at the top of the themed app root, outside the page's own stacking
 * context: inside <main> (z-10) a fixed overlay still paints under the sidebar. The `.jaali` root
 * carries the theme's colour variables, so dark mode still applies.
 */
export default function Overlay({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setRoot((document.querySelector(".jaali") as HTMLElement) || document.body); }, []);
  return root ? createPortal(children, root) : null;
}
