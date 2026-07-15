import type { ActivityItem } from "../../lib/vault/data";

function humanize(item: ActivityItem): { title: string; description: string } {
  switch (item.kind) {
    case "deposit":
    case "deposited":
      return { title: "Deposit", description: item.detail };
    case "withdraw":
    case "withdrew":
      return { title: "Withdraw", description: item.detail };
    case "allocated":
      return { title: "Put to work", description: "Your deposit is now earning." };
    case "compounded":
      return { title: "Rewards added", description: "Your rewards were added back automatically." };
    case "rebalanced":
      return { title: "Moved to better yield", description: "Your money was moved to a stronger earning option." };
    case "froze":
      return { title: "Paused earning", description: "Earning was paused to protect your money." };
    case "proposed-exit":
      return { title: "Review needed", description: "Review a suggested move for your money." };
    case "sign-mandate":
    case "consented":
      return { title: "Automation enabled", description: "Automatic earning moves are now enabled." };
    case "approve-exit":
      return { title: "Move approved", description: "You approved the suggested move." };
    case "auto-compound":
      return { title: "Auto reinvest updated", description: item.detail };
    default:
      return { title: item.detail, description: "" };
  }
}

function ActivityIcon({ kind }: { kind: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (kind) {
    case "deposit":
    case "deposited":
      return <svg {...common}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
    case "withdraw":
    case "withdrew":
      return <svg {...common}><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></svg>;
    case "allocated":
      return <svg {...common}><path d="M12 3v18" /><path d="M17 7.5c0-1.7-2.1-2.8-5-2.8s-5 1.1-5 2.8 2.1 2.8 5 2.8 5 1.1 5 2.8-2.1 2.8-5 2.8-5-1.1-5-2.8" /></svg>;
    case "compounded":
      return <svg {...common}><path d="M21 12a9 9 0 0 1-15.5 6.2" /><path d="M3 12A9 9 0 0 1 18.5 5.8" /><path d="M18 2v4h4" /><path d="M6 22v-4H2" /></svg>;
    case "rebalanced":
      return <svg {...common}><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></svg>;
    case "froze":
      return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M10 9v6" /><path d="M14 9v6" /></svg>;
    case "proposed-exit":
      return <svg {...common}><path d="M12 3 20 7v5c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V7l8-4Z" /><path d="M12 8v5" /><path d="M12 17h.01" /></svg>;
    case "sign-mandate":
    case "consented":
    case "approve-exit":
      return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
    default:
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  }
}

export function ActivityRow({ item, first, onReview, reviewed, divider = true }: { item: ActivityItem; first: boolean; onReview?: () => void; reviewed?: boolean; divider?: boolean }) {
  const copy = humanize(item);
  return (
    <div className={`flex items-center gap-[13px] py-3.5 ${first || !divider ? "" : "border-t border-line"}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pill text-pill-ink">
        <ActivityIcon kind={item.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[13.5px] font-semibold">{copy.title}</div>
          {item.when && <div className="shrink-0 text-xs font-medium text-muted">{item.when}</div>}
        </div>
        {copy.description && <div className="mt-0.5 text-xs text-muted">{copy.description}</div>}
      </div>
      {item.review ? (
        reviewed ? (
          <span className="flex h-[30px] shrink-0 items-center rounded-full bg-[#ECECEC] px-3.5 text-[12.5px] font-semibold text-faint">
            Reviewed
          </span>
        ) : onReview ? (
          <button onClick={onReview} className="h-[30px] shrink-0 rounded-full bg-[#1a1a1a] px-3.5 text-[12.5px] font-semibold text-[#f8f8f8]">Review</button>
        ) : null
      ) : null}
    </div>
  );
}
