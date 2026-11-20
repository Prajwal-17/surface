import dns, { type LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for source fetching, modeled on firecrawl's
 * apps/playwright-service-ts/helpers/ssrf.ts. The plain fetch path used to
 * resolve, validate, and then let `fetch` re-resolve DNS (a TOCTOU gap). These
 * helpers resolve once, verify every address is public unicast, and hand
 * `fetch` a lookup that answers only with the checked addresses — so the
 * socket connects to an address the guard approved and DNS is never consulted
 * a second time by the connection itself.
 */

type Resolver = (hostname: string) => Promise<LookupAddress[]>;

const defaultResolver: Resolver = (hostname) => lookup(hostname, { all: true });

function isPrivateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(value: string) {
  const address = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (address === "::" || address === "::1") return true;
  if (address.startsWith("::ffff:")) {
    return isPrivateIpv4(address.slice("::ffff:".length));
  }
  return (
    address.startsWith("fc") ||
    address.startsWith("fd") ||
    address.startsWith("fe8") ||
    address.startsWith("fe9") ||
    address.startsWith("fea") ||
    address.startsWith("feb") ||
    address.startsWith("ff")
  );
}

export function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

/**
 * Resolves `hostname` once. Returns the addresses if all of them are public
 * unicast, or null if the host is empty, does not resolve, or has any
 * non-unicast address (private, loopback, link-local, IPv4-mapped IPv6, ...).
 */
export async function resolvePublicAddresses(
  hostname: string,
  resolve: Resolver = defaultResolver,
): Promise<LookupAddress[] | null> {
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (!host) return null;

  let addresses: LookupAddress[];
  if (isIP(host)) {
    if (isPrivateAddress(host)) return null;
    addresses = [{ address: host, family: isIP(host) }];
  } else {
    try {
      addresses = await resolve(host);
    } catch {
      return null;
    }
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    return null;
  }
  return addresses;
}

/**
 * A `dns.lookup` replacement that answers only with addresses that were
 * already checked, so the socket connects to an address the guard approved
 * and the runtime never resolves the host a second time.
 */
export const pinnedLookup = (addresses: LookupAddress[]): typeof dns.lookup =>
  ((
    _hostname: string,
    opts: dns.LookupOptions,
    cb: (
      err: NodeJS.ErrnoException | null,
      address?: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    const family = opts.family;
    const matches =
      family === 4 || family === 6
        ? addresses.filter((address) => address.family === family)
        : addresses;

    process.nextTick(() => {
      if (matches.length === 0) {
        const err: NodeJS.ErrnoException = new Error(
          `No pinned address for family ${family}`,
        );
        err.code = "ENOTFOUND";
        cb(err);
      } else if (opts.all) {
        cb(null, matches);
      } else {
        cb(null, matches[0]?.address, matches[0]?.family);
      }
    });
  }) as typeof dns.lookup;

/**
 * Validates a host and returns a lookup that pins every connection made with
 * it to the checked addresses. Shared by every hop of a redirect chain: each
 * new host is resolved and verified before it may be connected to.
 */
export async function validatedLookup(
  hostname: string,
): Promise<typeof dns.lookup | null> {
  const addresses = await resolvePublicAddresses(hostname);
  if (!addresses) return null;
  return pinnedLookup(addresses);
}
