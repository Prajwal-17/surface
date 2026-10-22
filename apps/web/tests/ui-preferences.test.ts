import { describe, expect, test } from "bun:test";
import {
  DEFAULT_UI_PREFERENCES,
  UI_PREFERENCES_KEY,
  parseUiPreferences,
  readUiPreferences,
  writeUiPreferences,
  readerGeometry,
  resizeReaderByKey,
  SPLIT_MIN_WIDTH,
} from "../src/lib/ui-preferences";

describe("local UI preference recovery", () => {
  test.each([
    null,
    "",
    "not json",
    "null",
    "[]",
    "42",
    '{"version":2,"sidebarExpanded":false}',
    '{"version":"1"}',
  ])("recovers safe defaults from %p", (value) => {
    expect(parseUiPreferences(value)).toEqual(DEFAULT_UI_PREFERENCES);
  });
  test("recovers individual fields without discarding valid siblings", () => {
    expect(
      parseUiPreferences(
        '{"version":1,"sidebarExpanded":false,"readerWidth":-400}',
      ),
    ).toEqual({ version: 1, sidebarExpanded: false, readerWidth: null });
    expect(
      parseUiPreferences(
        '{"version":1,"sidebarExpanded":"false","readerWidth":560}',
      ),
    ).toEqual({ version: 1, sidebarExpanded: true, readerWidth: 560 });
  });
  test("storage denial does not disable layout controls", () => {
    const denied = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("quota");
      },
    };
    expect(readUiPreferences(denied)).toEqual(DEFAULT_UI_PREFERENCES);
    expect(() =>
      writeUiPreferences({ sidebarExpanded: false }, denied),
    ).not.toThrow();
  });
  test("sidebar and reader writes preserve each other's settings across reloads", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    writeUiPreferences({ sidebarExpanded: false }, storage);
    writeUiPreferences({ readerWidth: 588 }, storage);
    expect(readUiPreferences(storage)).toEqual({
      version: 1,
      sidebarExpanded: false,
      readerWidth: 588,
    });
    writeUiPreferences({ readerWidth: null }, storage);
    expect(JSON.parse(values.get(UI_PREFERENCES_KEY)!)).toEqual({
      version: 1,
      sidebarExpanded: false,
      readerWidth: null,
    });
  });
});

describe("reader geometry at resize, sidebar, and zoom boundaries", () => {
  test("split starts only when the reader and usable list minimums fit", () => {
    expect(readerGeometry(SPLIT_MIN_WIDTH - 1, null).split).toBe(false);
    const minimum = readerGeometry(SPLIT_MIN_WIDTH, null);
    expect(minimum.split).toBe(true);
    expect(minimum.width).toBe(420);
    expect(SPLIT_MIN_WIDTH - minimum.width - 1 - 32).toBe(480);
  });
  test("default is 44% with both minimums enforced", () => {
    expect(readerGeometry(1232, null).width).toBe(542);
    expect(readerGeometry(1072, null).width).toBe(472);
    expect(readerGeometry(933, null).width).toBe(420);
  });
  test("a stored width is clamped when the workspace shrinks", () => {
    expect(readerGeometry(1232, 680).width).toBe(680);
    expect(readerGeometry(1072, 680).width).toBe(559);
    expect(readerGeometry(892, 680).split).toBe(false);
    expect(readerGeometry(1052, 680).width).toBe(539);
  });
  test("nonfinite or extreme values never produce an invalid grid", () => {
    for (const width of [
      -1,
      0,
      390,
      933,
      1072,
      1232,
      2000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      for (const preferred of [
        null,
        -20,
        0,
        420,
        9000,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ]) {
        const result = readerGeometry(width, preferred);
        expect(Number.isFinite(result.width)).toBe(true);
        expect(result.width).toBeGreaterThanOrEqual(420);
        expect(result.width).toBeLessThanOrEqual(result.max);
      }
    }
  });
  test("arrow keys move 16px, clamp at edges, and Home resets", () => {
    expect(resizeReaderByKey("ArrowLeft", 542, 1232)).toBe(558);
    expect(resizeReaderByKey("ArrowRight", 542, 1232)).toBe(526);
    expect(resizeReaderByKey("ArrowRight", 420, 1232)).toBe(420);
    expect(resizeReaderByKey("ArrowLeft", 719, 1232)).toBe(719);
    expect(resizeReaderByKey("Home", 700, 1232)).toBe(542);
    expect(resizeReaderByKey("Enter", 542, 1232)).toBeNull();
  });
});
