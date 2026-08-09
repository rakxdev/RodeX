import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, type HTMLMotionProps } from "framer-motion";

/**
 * FoldButton — the RodeX action surface. A pressed-metal plate with a Miura-ori
 * fold: a diagonal facet crease, a dog-eared corner flap, and a zigzag crease
 * line. The fold lifts on hover and flattens on press.
 *
 * Color roles are strict: red = action, gold = seal/reveal only, ghost = neutral.
 */
type Variant = "red" | "ghost" | "gold" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  red: "fold-red",
  ghost: "fold-ghost",
  gold: "fold-gold",
  danger: "fold-danger",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-2 text-[10px] tracking-[0.14em]",
  md: "px-5 py-3 text-[12px] tracking-[0.14em]",
  lg: "px-6 py-3.5 text-[13px] tracking-[0.16em]",
};

interface FoldBase {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
}

interface FoldButtonProps extends Omit<HTMLMotionProps<"button">, "children">, FoldBase {}

export function FoldButton({ variant = "red", size = "md", className = "", children, ...rest }: FoldButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      className={`fold-btn ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      <span className="fold-surface" aria-hidden="true" />
      <span className="fold-flap" aria-hidden="true" />
      <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}

interface FoldLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children">, FoldBase {
  to?: string; // when set, renders a router Link
  href?: string; // otherwise a plain anchor
}

export function FoldLink({ variant = "red", size = "md", className = "", to, href, children, ...rest }: FoldLinkProps) {
  const cls = `fold-btn ${VARIANTS[variant]} ${SIZES[size]} inline-flex items-center justify-center ${className}`;
  const inner = (
    <>
      <span className="fold-surface" aria-hidden="true" />
      <span className="fold-flap" aria-hidden="true" />
      <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {inner}
      </Link>
    );
  }
  return (
    <a href={href} className={cls} {...rest}>
      {inner}
    </a>
  );
}
