'use client';
import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 1500, startOnMount = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startOnMount) return;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    // Small delay for visual effect
    const timeout = setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick);
    }, 300);

    return () => {
      clearTimeout(timeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, startOnMount]);

  return value;
}
