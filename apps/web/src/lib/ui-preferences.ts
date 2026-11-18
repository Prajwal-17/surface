export const UI_PREFERENCES_KEY = "surface-ui-preferences";
export const UI_PREFERENCES_VERSION = 1;

export interface UiPreferences {
  version: 1;
  sidebarExpanded: boolean;
  readerWidth: number | null;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  version: UI_PREFERENCES_VERSION,
  sidebarExpanded: false,
  readerWidth: null,
};

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function parseUiPreferences(value: string | null): UiPreferences {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== 1
    )
      return { ...DEFAULT_UI_PREFERENCES };
    const record = parsed as Record<string, unknown>;
    return {
      version: 1,
      sidebarExpanded:
        typeof record.sidebarExpanded === "boolean"
          ? record.sidebarExpanded
          : DEFAULT_UI_PREFERENCES.sidebarExpanded,
      readerWidth:
        typeof record.readerWidth === "number" &&
        Number.isFinite(record.readerWidth) &&
        record.readerWidth >= 420 &&
        record.readerWidth <= 10000
          ? record.readerWidth
          : null,
    };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function readUiPreferences(storage?: PreferenceStorage): UiPreferences {
  try {
    return parseUiPreferences(
      (storage ?? window.localStorage).getItem(UI_PREFERENCES_KEY),
    );
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function writeUiPreferences(
  patch: Partial<Omit<UiPreferences, "version">>,
  storage?: PreferenceStorage,
) {
  try {
    const target = storage ?? window.localStorage;
    target.setItem(
      UI_PREFERENCES_KEY,
      JSON.stringify({ ...readUiPreferences(target), ...patch, version: 1 }),
    );
  } catch {
    // Layout controls still work when storage is blocked or full.
  }
}

export const READER_MIN_WIDTH = 420;
export const LIST_MIN_WIDTH = 480;
export const LIST_GUTTERS = 32;
export const DIVIDER_WIDTH = 1;
export const SPLIT_MIN_WIDTH =
  READER_MIN_WIDTH + LIST_MIN_WIDTH + LIST_GUTTERS + DIVIDER_WIDTH;

export function readerGeometry(
  workspaceWidth: number,
  preferredWidth: number | null,
) {
  const available = Number.isFinite(workspaceWidth)
    ? Math.max(0, workspaceWidth)
    : 0;
  const split = available >= SPLIT_MIN_WIDTH;
  const max = Math.max(
    READER_MIN_WIDTH,
    available - LIST_MIN_WIDTH - LIST_GUTTERS - DIVIDER_WIDTH,
  );
  const preferred =
    preferredWidth !== null && Number.isFinite(preferredWidth)
      ? preferredWidth
      : available * 0.44;
  return {
    split,
    min: READER_MIN_WIDTH,
    max,
    width: Math.round(Math.min(max, Math.max(READER_MIN_WIDTH, preferred))),
  };
}

export function resizeReaderByKey(
  key: string,
  width: number,
  workspaceWidth: number,
): number | null {
  if (key === "Home") return readerGeometry(workspaceWidth, null).width;
  if (key === "ArrowLeft")
    return readerGeometry(workspaceWidth, width + 16).width;
  if (key === "ArrowRight")
    return readerGeometry(workspaceWidth, width - 16).width;
  return null;
}
