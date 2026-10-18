import type { LookupFunction } from "node:net";
import type { LookupAddress } from "node:dns";

// Reuse the validated address instead of resolving DNS again during connection.
export function pinnedLookup(address: LookupAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
}
