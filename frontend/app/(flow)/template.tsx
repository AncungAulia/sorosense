import type { ReactNode } from "react";

// A template re-mounts on every navigation (unlike a layout), so the .page-enter
// CSS animation replays each time a sub-screen opens — the new page slides in
// from the right. See .page-enter in globals.css.
export default function FlowTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
