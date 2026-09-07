// Adapted from shadcn/ui use-mobile. Uses React's external-store subscription.
import { useSyncExternalStore } from "react";
function subscribe(callback: () => void) {
  const media = window.matchMedia("(max-width: 767px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}
