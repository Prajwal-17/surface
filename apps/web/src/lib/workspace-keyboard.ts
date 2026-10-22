export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"]',
      ),
    )
  );
}

export function hasOpenOverlay(root: ParentNode = document): boolean {
  return Boolean(
    root.querySelector(
      '[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"]), [role="menu"][data-state="open"], [role="listbox"]:not([data-state="closed"]), [data-surface-overlay][data-state="open"]',
    ),
  );
}

export function shouldFocusJobSearch(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "defaultPrevented"
    | "ctrlKey"
    | "metaKey"
    | "altKey"
    | "isComposing"
  >,
  editable: boolean,
  overlay: boolean,
): boolean {
  return (
    event.key === "/" &&
    !event.defaultPrevented &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.isComposing &&
    !editable &&
    !overlay
  );
}

export function nextJobIndex(
  key: string,
  index: number,
  length: number,
): number | null {
  if (!length || !["ArrowDown", "ArrowUp"].includes(key)) return null;
  return Math.min(
    length - 1,
    Math.max(0, index + (key === "ArrowDown" ? 1 : -1)),
  );
}

export function handleJobListKeyDown(
  event: KeyboardEvent,
  region: HTMLElement,
): boolean {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    isEditableTarget(event.target) ||
    hasOpenOverlay() ||
    !(event.target instanceof Element)
  )
    return false;
  const titles = [
    ...region.querySelectorAll<HTMLButtonElement>("[data-job-id]"),
  ];
  const row = event.target.closest(".job-row");
  const index = titles.findIndex((title) => row?.contains(title));
  if (index < 0) return false;
  const next = nextJobIndex(event.key, index, titles.length);
  if (next === null) return false;
  event.preventDefault();
  titles[next]?.focus();
  return true;
}

export function shouldCloseJobReader(
  event: Pick<KeyboardEvent, "key" | "defaultPrevented" | "isComposing">,
  open: boolean,
  split: boolean,
  overlay: boolean,
): boolean {
  return (
    event.key === "Escape" &&
    open &&
    split &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !overlay
  );
}
