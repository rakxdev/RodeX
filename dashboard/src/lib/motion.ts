import type { MotionProps, Variants } from "framer-motion";

/** Shared motion language — clean, fast, no-lag. Durations stay short;
 *  MotionConfig reducedMotion="user" disables these for OS-level users. */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger = (delay = 0.04): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: delay } },
});

/** Sheet-panel fold-in: subtle rotateX like a crease settling flat. */
export const foldIn: Variants = {
  hidden: { opacity: 0, y: 10, rotateX: -4 },
  show: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Whole-page enter/exit (AnimatePresence). */
export const pageTransition: MotionProps = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.1, ease: [0.7, 0, 0.84, 0] } },
};

/** Soft spring for hovers/lifts. */
export const springLift = { type: "spring" as const, stiffness: 260, damping: 24 };
