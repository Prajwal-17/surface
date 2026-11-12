try {
  const theme = localStorage.getItem("surface-theme");
  document.documentElement.classList.toggle(
    "dark",
    theme
      ? theme !== "light"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    (event) => {
      try {
        if (localStorage.getItem("surface-theme")) return;
      } catch {}
      document.documentElement.classList.toggle("dark", event.matches);
      window.dispatchEvent(new Event("surface-theme"));
    },
  );
} catch {
  document.documentElement.classList.toggle(
    "dark",
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
}
