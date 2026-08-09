import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Mark } from "@/App";
import { FoldLink } from "@/components/FoldButton";

/** Public chrome for documentation surfaces (docs + usage) — readable without signing in. */
export function PublicHeader({ tag }: { tag: string }) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-line bg-bg/85 backdrop-blur">
      <Link to="/" className="flex items-center gap-3">
        <Mark />
        <span className="font-mono font-bold tracking-[0.22em] text-sm">
          RODEX<em className="text-gold not-italic">DB</em>
        </span>
      </Link>
      <span className="ml-2 font-mono text-[9px] tracking-[0.22em] text-inkdim hidden sm:inline">{tag}</span>
      <div className="ml-auto">
        <FoldLink to="/login" variant="ghost" size="sm">
          ENTER CONSOLE
        </FoldLink>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="px-4 sm:px-5 py-4 border-t border-line flex flex-wrap gap-x-6 gap-y-1 justify-between font-mono text-[9.5px] sm:text-[10px] tracking-[0.16em] text-inkdim">
      <span>RODEX DB — GATEWAY CONSOLE</span>
      <span className="hidden md:inline">REV F · INSTRUMENT PACKET</span>
      <span>rodexdb.pages.dev</span>
    </footer>
  );
}

/** Full public page wrapper: header + content + footer. */
export default function PublicShell({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader tag={tag} />
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-5 py-8 flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
