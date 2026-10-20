import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./button";

function subscribe(callback: () => void) {
  window.addEventListener("surface-theme", callback);
  return () => window.removeEventListener("surface-theme", callback);
}

export function useTheme() {
  return useSyncExternalStore<"dark" | "light">(
    subscribe,
    () =>
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    () => "dark",
  );
}

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="ghost"
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        document.documentElement.classList.toggle("dark", next === "dark");
        try {
          localStorage.setItem("surface-theme", next);
        } catch {
          /* Theme still works when storage is unavailable. */
        }
        window.dispatchEvent(new Event("surface-theme"));
      }}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
      <span className="hidden sm:inline">
        {next === "light" ? "Light" : "Dark"} mode
      </span>
    </Button>
  );
}
