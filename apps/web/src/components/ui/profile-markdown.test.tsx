import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileMarkdown } from "./profile-markdown";

test("profile Markdown renders structure without executing HTML or loading images", () => {
  const source =
    "## My work\n\n- Built **APIs** with `TypeScript`\n- [Project](https://example.com)\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n![Diagram](https://example.com/tracker.png)";
  const html = renderToStaticMarkup(
    createElement(ProfileMarkdown, { children: source }),
  );
  assert.ok(html.includes("<h4>My work</h4>"));
  assert.ok(html.includes("<ul>"));
  assert.ok(html.includes("<strong>APIs</strong>"));
  assert.ok(html.includes("<code>TypeScript</code>"));
  assert.ok(html.includes('href="https://example.com"'));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("Diagram"));
});
