import SplitFlap from "@/components/SplitFlap";
import { FoldButton } from "@/components/FoldButton";

const REPO = "https://github.com/rakxdev/RodeX";
const PROFILE = "https://github.com/rakxdev";

/**
 * CREDITS — the maker's section. Rendered on the landing section AND the full
 * /credits page. Color sense: the primary (GITHUB PROFILE) is red, the
 * secondary (SOURCE CODE) is neutral ghost — never two identical buttons.
 */
export default function CreditContent({ big = false }: { big?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className={`mb-4 ${big ? "" : ""}`}>
        <SplitFlap text="RAKXDEV" className={big ? "text-3xl sm:text-5xl" : "text-2xl"} />
      </div>
      <div className="font-mono text-[12px] sm:text-[13px] tracking-[0.08em] text-ink">
        RodeX DB — the database gateway for independent apps
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-inkdim mt-3 max-w-md">
        Built one project at a time by <span className="text-gold">RAKXDEV</span> — a personal gateway platform on
        DynamoDB's always-free tier, shipped through Cloudflare, designed in the Instrument-Packet language.
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-5">
        <FoldButton size="sm" onClick={() => window.open(PROFILE, "_blank")}>
          GITHUB PROFILE
        </FoldButton>
        <FoldButton variant="ghost" size="sm" onClick={() => window.open(REPO, "_blank")}>
          SOURCE CODE
        </FoldButton>
      </div>
      <div className="font-mono text-[9px] tracking-[0.2em] text-inkdim mt-5">
        REV F · INSTRUMENT PACKET · rodexdb.pages.dev
      </div>
    </div>
  );
}