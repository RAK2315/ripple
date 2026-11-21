"use client";
import { useEffect, useRef, useState } from "react";

/** Animates a number to its new value: 350ms ease-out, on mount and on every change. Display only, never feeds arithmetic. */
export function useCountUp(target: number, duration = 350): number {
  const [value, setValue] = useState(target);
  const from = useRef(0);
  const shown = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(target)) {
      shown.current = target;
      setValue(target);
      return;
    }
    from.current = shown.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from.current + (target - from.current) * eased;
      shown.current = v;
      setValue(t === 1 ? target : v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}
