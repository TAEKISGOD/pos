"use client";

import { useRef, useEffect } from "react";

export function useSpreadsheetNav() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "INPUT" || (target as HTMLInputElement).type === "file") return;

      const inputs = Array.from(
        container.querySelectorAll<HTMLInputElement>("input:not([type='file']):not([type='hidden'])")
      );
      const idx = inputs.indexOf(target as HTMLInputElement);
      if (idx === -1) return;

      if (e.key === "Tab") {
        e.preventDefault();
        const next = e.shiftKey ? inputs[idx - 1] : inputs[idx + 1];
        if (next) {
          next.focus();
          next.select();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const next = inputs[idx + 1];
        if (next) {
          next.focus();
          next.select();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, []);

  return containerRef;
}

export function parsePasteData(e: React.ClipboardEvent): number[][] | null {
  const text = e.clipboardData.getData("text/plain");
  if (!text.includes("\t") && !text.includes("\n")) return null;

  e.preventDefault();
  return text
    .split(/\r?\n/)
    .filter((r) => r.trim())
    .map((r) => r.split("\t").map((c) => Number(c) || 0));
}
