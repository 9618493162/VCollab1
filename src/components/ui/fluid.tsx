import { motion, useReducedMotion } from "framer-motion";
import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Pressable — Apple-style instant response: the button reacts on      */
/* pointer-down, not after a transition. Springs are interruptible and */
/* collapse to nothing under prefers-reduced-motion.                   */
/* ------------------------------------------------------------------ */
export function Pressable({
  className,
  children,
  scale = 0.96,
  ...props
}: Omit<
    React.ComponentProps<"button">,
    | "onDrag"
    | "onDragEnd"
    | "onDragStart"
    | "onDragEnter"
    | "onDragLeave"
    | "onDragOver"
    | "onDrop"
    | "onAnimationStart"
    | "onAnimationEnd"
    | "onAnimationIteration"
    | "onAnimationCancel"
    | "onTransitionEnd"
    | "onTransitionRun"
    | "onTransitionStart"
    | "onTransitionCancel"
  > & { scale?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      whileHover={reduce ? undefined : { scale: 1.03 }}
      whileTap={reduce ? undefined : { scale }}
      transition={{ type: "spring", stiffness: 600, damping: 32 }}
      className={cn("outline-none", className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* GlassPanel — reusable material surface.                             */
/*   structural  → sidebar / large panels (heavier blur + depth)       */
/*   float       → chat, popovers, floating cards                      */
/*   interactive → buttons, toggles, compact cards                     */
/* ------------------------------------------------------------------ */
export function GlassPanel({
  variant = "float",
  depth,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "structural" | "float" | "interactive";
  depth?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "relative",
        variant === "structural" && "glass-strong",
        variant === "float" && "glass-float",
        variant === "interactive" && "glass-interactive",
        depth === 1 && "depth-1",
        depth === 2 && "depth-2",
        depth === 3 && "depth-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FluidPanel — spring slide-in sheet for the meeting room's side      */
/* panels. Spatial consistency: enters from the right, exits right.    */
/* ------------------------------------------------------------------ */
export function FluidPanel({
  className,
  children,
  from = "right",
  ...props
}: Omit<
    React.HTMLAttributes<HTMLDivElement>,
    | "onDrag"
    | "onDragEnd"
    | "onDragStart"
    | "onDragEnter"
    | "onDragLeave"
    | "onDragOver"
    | "onDrop"
    | "onAnimationStart"
    | "onAnimationEnd"
    | "onAnimationIteration"
    | "onAnimationCancel"
    | "onTransitionEnd"
    | "onTransitionRun"
    | "onTransitionStart"
    | "onTransitionCancel"
  > & { from?: "right" | "bottom" }) {
  const reduce = useReducedMotion();
  const dx = from === "right" ? 56 : 0;
  const dy = from === "right" ? 0 : 56;
  return (
    <motion.div
      initial={reduce ? false : { x: dx, y: dy, opacity: 0 }}
      animate={{ x: 0, y: 0, opacity: 1 }}
      exit={reduce ? undefined : { x: dx, y: dy, opacity: 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.9 }}
      className={cn("absolute inset-y-0 right-0 z-40 w-full sm:max-w-xs", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
