import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
  handleJobListKeyDown,
  hasOpenOverlay,
  isEditableTarget,
  shouldCloseJobReader,
  shouldFocusJobSearch,
} from "../src/lib/workspace-keyboard";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "http://localhost/",
});
const priorElement = globalThis.Element;
const priorDocument = globalThis.document;
Object.assign(globalThis, {
  Element: dom.window.Element,
  document: dom.window.document,
});
afterAll(() => {
  Object.assign(globalThis, { Element: priorElement, document: priorDocument });
  dom.window.close();
});
beforeEach(() => {
  document.body.innerHTML = "";
});

function key(value: string, init: KeyboardEventInit = {}) {
  return new dom.window.KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

describe("search and overlay guards", () => {
  test.each([
    "<input>",
    "<textarea></textarea>",
    "<select></select>",
    '<div contenteditable="true"><span></span></div>',
    '<button role="combobox"></button>',
    '<div role="textbox"></div>',
  ])("slash preserves editing in %s", (markup) => {
    document.body.innerHTML = markup;
    const target =
      document.querySelector("span") ?? document.body.firstElementChild!;
    expect(isEditableTarget(target)).toBe(true);
    expect(
      shouldFocusJobSearch(key("/"), isEditableTarget(target), false),
    ).toBe(false);
  });
  test("slash from nonediting chrome focuses search, with no modifier shortcuts", () => {
    document.body.innerHTML =
      '<button>Refresh</button><div contenteditable="false"></div>';
    expect(isEditableTarget(document.querySelector("button"))).toBe(false);
    expect(isEditableTarget(document.querySelector("div"))).toBe(false);
    expect(shouldFocusJobSearch(key("/"), false, false)).toBe(true);
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true },
      { isComposing: true },
    ])
      expect(shouldFocusJobSearch(key("/", init), false, false)).toBe(false);
  });
  test.each([
    '<div role="dialog"></div>',
    '<div role="alertdialog"></div>',
    '<div role="listbox"></div>',
    '<div data-surface-overlay data-state="open"></div>',
  ])("an open overlay owns slash and Escape: %s", (markup) => {
    document.body.innerHTML = markup;
    expect(hasOpenOverlay()).toBe(true);
    expect(shouldFocusJobSearch(key("/"), false, hasOpenOverlay())).toBe(false);
    expect(
      shouldCloseJobReader(key("Escape"), true, true, hasOpenOverlay()),
    ).toBe(false);
  });
  test("Escape closes only the split reader when overlays are absent", () => {
    expect(shouldCloseJobReader(key("Escape"), true, true, false)).toBe(true);
    expect(shouldCloseJobReader(key("Escape"), true, false, false)).toBe(false);
    const consumed = key("Escape");
    consumed.preventDefault();
    expect(shouldCloseJobReader(consumed, true, true, false)).toBe(false);
  });
});

describe("job title navigation", () => {
  function setup() {
    document.body.innerHTML =
      '<div id="jobs"><article class="job-row"><button data-job-id="one">First role</button><button id="save">Save</button><input id="editing"></article><article class="job-row"><button data-job-id="two">Second role</button></article></div>';
    const region = document.getElementById("jobs")!;
    region.addEventListener("keydown", (event) =>
      handleJobListKeyDown(event, region),
    );
    return document.querySelectorAll<HTMLButtonElement>("[data-job-id]");
  }
  test("Down moves to the next title; Up and boundaries keep focus in the list", () => {
    const titles = setup();
    titles[0]!.focus();
    titles[0]!.dispatchEvent(key("ArrowDown"));
    expect(document.activeElement).toBe(titles[1]!);
    titles[1]!.dispatchEvent(key("ArrowDown"));
    expect(document.activeElement).toBe(titles[1]!);
    titles[1]!.dispatchEvent(key("ArrowUp"));
    expect(document.activeElement).toBe(titles[0]!);
    titles[0]!.dispatchEvent(key("ArrowUp"));
    expect(document.activeElement).toBe(titles[0]!);
  });
  test("navigation from row actions moves to a title without mutating a job", () => {
    const titles = setup();
    const save = document.getElementById("save")!;
    let mutations = 0;
    save.addEventListener("click", () => mutations++);
    save.focus();
    save.dispatchEvent(key("ArrowDown"));
    expect(document.activeElement).toBe(titles[1]!);
    expect(mutations).toBe(0);
  });
  test("editable fields and overlays retain their arrow keys", () => {
    const titles = setup();
    const input = document.getElementById("editing")!;
    input.focus();
    input.dispatchEvent(key("ArrowDown"));
    expect(document.activeElement).toBe(input);
    document.body.insertAdjacentHTML("beforeend", '<div role="dialog"></div>');
    titles[0]!.focus();
    titles[0]!.dispatchEvent(key("ArrowDown"));
    expect(document.activeElement).toBe(titles[0]!);
  });
  test("Enter and ordinary letters are left to the focused control", () => {
    const titles = setup();
    for (const value of ["Enter", "s", "d", "Escape"]) {
      titles[0]!.focus();
      const event = key(value);
      titles[0]!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(titles[0]!);
    }
  });
});
