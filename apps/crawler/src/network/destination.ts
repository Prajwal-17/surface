import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";

const blocked = new BlockList();
const blocked6 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] satisfies Array<[string, number]>)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] satisfies Array<[string, number]>)
  blocked6.addSubnet(address, prefix, "ipv6");
export function isPublicAddress(address: string) {
  const family = isIP(address);
  return (
    Boolean(family) &&
    (family !== 6 || /^[23]/.test(address)) &&
    !(family === 6 ? blocked6 : blocked).check(
      address,
      family === 6 ? "ipv6" : "ipv4",
    )
  );
}

export async function publicDestination(hostname: string) {
  hostname = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || /\.(local|localhost)$/.test(hostname))
    throw new Error("Private destination blocked.");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Private or reserved destination blocked.");
  return addresses[0]!;
}
export function validateUrl(input: string) {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Only public HTTP(S) pages on standard ports are supported.",
    );
  return url;
}
