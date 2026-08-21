"use client";

import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "motion/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // reducedMotion="user" makes every framer motion component honor
  // prefers-reduced-motion automatically — transforms/layout animations are
  // skipped, state changes stay instant (§5). Pairs with the globals.css
  // media query that neutralises CSS transitions/animations.
  return (
    <MotionConfig reducedMotion="user">
      <SessionProvider>{children}</SessionProvider>
    </MotionConfig>
  );
}
