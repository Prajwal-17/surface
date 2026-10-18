import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPublicAddress,
  publicDestination,
  validateUrl,
} from "./destination.ts";
test("blocks loopback, private, mapped and reserved network destinations", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ]) {
    assert.equal(isPublicAddress(ip), false, ip);
    await assert.rejects(publicDestination(ip));
  }
  assert.equal(isPublicAddress("1.1.1.1"), true);
  await assert.rejects(publicDestination("localhost"));
});
test("rejects non-web protocols, credentials and nonstandard ports", () => {
  for (const url of [
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:pass@example.com",
    "https://example.com:4100",
  ])
    assert.throws(() => validateUrl(url));
  assert.equal(
    validateUrl("https://example.com/careers").hostname,
    "example.com",
  );
});
