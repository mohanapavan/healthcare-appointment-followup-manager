"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
  animate,
  type Transition,
} from "motion/react";

export { motion, AnimatePresence, LayoutGroup, useReducedMotion };

/* Motion tokens (§5). Interactive → spring; reveals → a short ease. Nothing
   over 400ms, only transform + opacity ever animate. */
export const SPRING: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.9 };
export const EASE_OUT: Transition = { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] };

/** One-shot entrance: opacity 0→1 + y 8→0. Never on re-render, never on scroll. */
export function Reveal({
  children,
  delay = 0,
  y = 8,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Staggered list entry, 30ms apart, capped at the first 8 items (§5.5). */
export function Stagger({ children, className = "" }: { children: ReactNode[]; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={className}>
      {children.map((child, i) =>
        reduce ? (
          <div key={i}>{child}</div>
        ) : (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...EASE_OUT, delay: Math.min(i, 7) * 0.03 }}
          >
            {child}
          </motion.div>
        )
      )}
    </div>
  );
}

/** A large tabular numeral that rolls to its new value rather than swapping (§5.6). */
export function AnimatedNumber({
  value,
  className = "",
  format = (n: number) => String(Math.round(n)),
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const reduce = useReducedMotion();
  // Start at 0 so the focal numerals count up into place on mount (§5.6),
  // and roll from the previous value whenever it changes thereafter.
  const [display, setDisplay] = useState(reduce ? value : 0);
  const ref = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      return;
    }
    const controls = animate(ref.current, value, {
      duration: 0.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => setDisplay(v),
    });
    ref.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span className={className}>{format(display)}</span>;
}

/** Right-hand sheet (§6.3/§6.5). Slides in on a spring, backdrop fades, Esc
    closes, focus moves in and returns to the opener on close. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const titleId = useId();
  // Portal to <body> so a transformed ancestor (route/stagger motion) can't
  // scope this fixed overlay to itself. Mount-gated for SSR safety.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
      // move focus into the panel
      requestAnimationFrame(() => panelRef.current?.focus());
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = "";
      };
    }
    // returning focus when closing
    (openerRef.current as HTMLElement | null)?.focus?.();
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={false}>
          <motion.div
            className="absolute inset-0 bg-ink-900/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_OUT}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="absolute right-0 top-0 h-full w-full max-w-[92vw] overflow-y-auto bg-surface-overlay shadow-elev-3 outline-none"
            style={{ width }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={SPRING}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-ink-line bg-surface-overlay px-6 py-4">
              <h2 id={titleId} className="font-display text-lg font-semibold text-ink-900">
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1.5 text-ink-500 hover:bg-surface-base hover:text-ink-900"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
