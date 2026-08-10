import { animate } from "framer-motion";
import { useEffect, useRef } from "react";

/** Animated number that counts up to `to` when mounted / changed. */
export function CountUp({
  to,
  duration = 1.1,
  suffix = "",
}: {
  to: number;
  duration?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, to, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = `${Math.round(v).toLocaleString()}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [to, duration, suffix]);

  return <span ref={ref}>{`${to.toLocaleString()}${suffix}`}</span>;
}
