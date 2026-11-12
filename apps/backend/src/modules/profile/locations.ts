import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ProfileInput,
  ProfileLocation,
  LocationOption,
} from "@surface/contracts";
import { HttpError } from "../../shared/errors/http-error";
const dataFile = [
  process.env.LOCATIONS_DATA_FILE,
  fileURLToPath(new URL("./data/locations.json.gz", import.meta.url)),
  fileURLToPath(
    new URL("./modules/profile/data/locations.json.gz", import.meta.url),
  ),
  join(process.cwd(), "src/modules/profile/data/locations.json.gz"),
  join(process.cwd(), "apps/backend/src/modules/profile/data/locations.json.gz"),
].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
if (!dataFile) {
  throw new Error(
    "The bundled location catalog is missing. Set LOCATIONS_DATA_FILE to locations.json.gz.",
  );
}
const data = JSON.parse(
  gunzipSync(readFileSync(dataFile)).toString(),
) as {
  countries: { code: string; name: string }[];
  cities: [number, string, string, string][];
};
export const countries = data.countries.toSorted((a, b) =>
  a.name.localeCompare(b.name),
);
const names = new Map(countries.map((c) => [c.code, c.name]));
const cities = new Map(
  data.cities.map(([cityId, name, region, countryCode]) => [
    cityId,
    {
      cityId,
      countryCode,
      label: `${name}, ${region}, ${names.get(countryCode)}`,
    },
  ]),
);
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const searchRows = data.cities.map(([cityId, name, region, country]) => ({
  cityId,
  country,
  search: normalized(`${name} ${region}`),
}));
export function canonicalCountry(value: string) {
  return (
    countries.find(
      (c) =>
        c.code === value.toUpperCase() ||
        normalized(c.name) === normalized(value),
    )?.code ?? null
  );
}
export function cityOption(id: number): LocationOption {
  const city = cities.get(id);
  if (!city)
    throw new HttpError(
      404,
      "This city is not in the location catalog. Select a country or another city.",
    );
  return city;
}
export function locationLabel(location: ProfileLocation) {
  return location.cityId
    ? (cities.get(location.cityId)?.label ??
        `Unresolved city (${location.cityId}), ${location.countryCode}`)
    : (names.get(location.countryCode) ?? location.countryCode);
}
export function searchCities(country: string, query: string, offset = 0) {
  if (!names.has(country))
    throw new HttpError(400, "Choose a country from the list.");
  const words = normalized(query).split(/\s+/).filter(Boolean);
  const matching = searchRows.filter(
    (row) =>
      row.country === country &&
      words.every((word) => row.search.includes(word)),
  );
  return {
    items: matching
      .slice(offset, offset + 30)
      .map((row) => cities.get(row.cityId)!),
    more: matching.length > offset + 30,
  };
}
export function validateProfileLocations(
  input: ProfileInput,
  previous: ProfileInput | null,
) {
  const details = input.context.details;
  const check = (location: ProfileLocation) => {
    if (
      !names.has(location.countryCode) ||
      (location.cityId !== null &&
        cities.get(location.cityId)?.countryCode !== location.countryCode)
    )
      throw new HttpError(
        400,
        "Choose a valid country and city from the location list.",
      );
  };
  if (details?.residence) check(details.residence);
  details?.preferredLocations.forEach(check);
  if (details?.remoteCountries.some((c) => !names.has(c)))
    throw new HttpError(400, "Choose remote countries from the list.");
  if (
    details?.remoteScope === "selected-countries" &&
    !details.remoteCountries.length
  )
    throw new HttpError(
      400,
      "Select at least one remote country, or choose no remote location preference.",
    );
  input.context.constraints.countries = input.context.constraints.countries.map(
    (c) => {
      const known = canonicalCountry(c);
      if (known) return known;
      // Preserve an existing unresolved answer; newly submitted country values must be catalog entries.
      if (previous?.context.constraints.countries.includes(c)) return c;
      throw new HttpError(400, "Choose eligible countries from the list.");
    },
  );
  if (
    !Intl.supportedValuesOf("currency").includes(
      input.context.constraints.currency,
    )
  )
    throw new HttpError(400, "Choose a valid compensation currency.");
}

export function matchResumeLocation(
  city: string,
  region: string,
  country: string,
): ProfileLocation | null {
  const countryCode = canonicalCountry(country);
  if (!countryCode) return null;
  if (!city.trim()) return { countryCode, cityId: null };
  const matches = data.cities.filter(
    ([, name, state, code]) =>
      code === countryCode &&
      normalized(name) === normalized(city) &&
      (!region || normalized(state) === normalized(region)),
  );
  return matches.length === 1 ? { countryCode, cityId: matches[0]![0] } : null;
}
