// Inline <style> that survives hydration: React's SSR escapes quotes inside text nodes,
// but HTML <style> is RAWTEXT (entities are NOT decoded) → server/client textContent differ
// → hydration error. dangerouslySetInnerHTML skips that comparison — the standard fix.
import * as React from "react";

export function Style({ children }: { children: React.ReactNode }) {
  const css = typeof children === "string" ? children : String(children ?? "");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
