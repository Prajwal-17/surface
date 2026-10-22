import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
function getTarget() {
  return document.getElementById("page-header-actions");
}

export function HeaderActions({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(subscribe, getTarget, () => null);
  return target ? createPortal(children, target) : null;
}
