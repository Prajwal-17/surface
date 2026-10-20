import { useDeferredValue, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { z } from "zod";
import { locationOptionSchema, type ProfileLocation } from "backend/contracts";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const optionLabel = (value: string) =>
  ({
    any: "Any arrangement",
    "full-time": "Full-time",
    "part-time": "Part-time",
    contract: "Contract",
    internship: "Internship",
    temporary: "Temporary",
    remote: "Remote",
    hybrid: "Hybrid",
    onsite: "On-site",
    unspecified: "Not specified",
    worldwide: "Worldwide",
    "selected-countries": "Specific countries",
    year: "Per year",
    month: "Per month",
    hour: "Per hour",
  })[value as "any"] ?? value;
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="profile-field">
      <label id={id}>{label}</label>
      {hint && <p>{hint}</p>}
      <Select
        value={value || "__empty"}
        onValueChange={(v) => onChange((v === "__empty" ? "" : v) as T)}
      >
        <SelectTrigger aria-labelledby={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option || "__empty"}>
              {optionLabel(option) || "Not specified"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function SearchChoices<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
  single = false,
}: {
  label: string;
  options: readonly (T | { value: T; label: string })[];
  value: readonly T[];
  onChange: (v: T[]) => void;
  hint?: string;
  single?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const id = useId();
  const all = options.map((o) =>
    typeof o === "string"
      ? {
          value: o,
          label:
            (
              {
                "full-time": "Full-time",
                "part-time": "Part-time",
                contract: "Contract",
                internship: "Internship",
                temporary: "Temporary",
              } as Record<string, string>
            )[o] ?? o,
        }
      : o,
  );
  const results = all.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.value.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="profile-field">
      <label id={id}>{label}</label>
      {hint && <p>{hint}</p>}
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            aria-labelledby={id}
          >
            {single && value.length
              ? (all.find((o) => o.value === value[0])?.label ?? value[0])
              : `Select ${label.toLowerCase()}`}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="p-2"
          aria-label={`${label} options`}
        >
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder="Search options…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div
            className="mt-2 max-h-64 overflow-y-auto"
            role="group"
            aria-label={label}
          >
            {single && (
              <button
                type="button"
                className="profile-option"
                onClick={() => {
                  onChange([]);
                  setOpen(false);
                }}
              >
                Not specified
              </button>
            )}
            {results.map((o) => (
              <button
                type="button"
                key={o.value}
                aria-pressed={value.includes(o.value)}
                className="profile-option"
                onClick={() => {
                  onChange(
                    single
                      ? [o.value]
                      : value.includes(o.value)
                        ? value.filter((v) => v !== o.value)
                        : [...value, o.value],
                  );
                  if (single) setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 text-left">{o.label}</span>
                {value.includes(o.value) && (
                  <Check className="size-4 shrink-0 text-brand" />
                )}
              </button>
            ))}
            {!results.length && (
              <p className="p-3 text-xs text-muted-foreground">
                No matching options. Try a different search.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {!single && value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="profile-chip">
              {all.find((o) => o.value === v)?.label ?? v}
              <button
                type="button"
                aria-label={`Remove ${all.find((o) => o.value === v)?.label ?? v}`}
                onClick={() => onChange(value.filter((x) => x !== v))}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
const catalogsSchema = z.object({
  countries: z.array(z.object({ code: z.string(), name: z.string() })),
  currencies: z.array(z.string()),
  timezones: z.array(z.string()),
});
export function useLocationCatalogs() {
  return useQuery({
    queryKey: ["profile-catalogs"],
    queryFn: async () =>
      catalogsSchema.parse(await apiClient("/api/profile/catalogs")),
    staleTime: Infinity,
  });
}
export function LocationLabel({ value }: { value: ProfileLocation }) {
  const catalogs = useLocationCatalogs();
  const city = useQuery({
    queryKey: ["profile-city", value.cityId],
    enabled: value.cityId !== null,
    queryFn: async () =>
      locationOptionSchema.parse(
        await apiClient(`/api/profile/locations/${value.cityId}`),
      ),
    staleTime: Infinity,
  });
  return (
    <>
      {value.cityId
        ? (city.data?.label ??
          (city.error ? "Location unavailable" : "Loading location…"))
        : (catalogs.data?.countries.find((c) => c.code === value.countryCode)
            ?.name ?? value.countryCode)}
    </>
  );
}
export function LocationPicker({
  label,
  value,
  onChange,
  multiple = false,
}: {
  label: string;
  value: ProfileLocation[];
  onChange: (v: ProfileLocation[]) => void;
  multiple?: boolean;
}) {
  const catalogs = useLocationCatalogs();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const cities = useQuery({
    queryKey: ["profile-city-search", country, deferredSearch, offset],
    enabled: !!country && open,
    queryFn: async ({ signal }) =>
      z
        .object({ items: z.array(locationOptionSchema), more: z.boolean() })
        .parse(
          await apiClient(
            `/api/profile/locations?country=${country}&q=${encodeURIComponent(deferredSearch)}&offset=${offset}`,
            { signal },
          ),
        ),
  });
  function choose(location: ProfileLocation) {
    onChange(
      multiple
        ? [
            ...value.filter(
              (v) =>
                !(
                  v.countryCode === location.countryCode &&
                  v.cityId === location.cityId
                ),
            ),
            location,
          ]
        : [location],
    );
    setOpen(false);
  }
  return (
    <div className="profile-field">
      <span className="font-medium">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="justify-between font-normal"
            aria-label={`Choose ${label.toLowerCase()}`}
          >
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" />
              Choose country or city
            </span>
            <ChevronDown className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="space-y-3" aria-label={label}>
          <SearchChoices
            label="Country"
            single
            options={
              catalogs.data?.countries.map((c) => ({
                value: c.code,
                label: c.name,
              })) ?? []
            }
            value={country ? [country] : []}
            onChange={(v) => {
              setCountry(v[0] ?? "");
              setOffset(0);
              setSearch("");
            }}
          />
          {catalogs.error && (
            <p role="alert">
              Could not load countries.{" "}
              <button type="button" onClick={() => void catalogs.refetch()}>
                Retry
              </button>
            </p>
          )}
          {country && (
            <>
              <button
                type="button"
                className="profile-option text-brand"
                onClick={() => choose({ countryCode: country, cityId: null })}
              >
                Use{" "}
                {catalogs.data?.countries.find((c) => c.code === country)?.name}{" "}
                (any city)
              </button>
              <Input
                aria-label="Search cities"
                placeholder="Search cities…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
              <div
                className="max-h-48 overflow-y-auto"
                aria-label="City results"
              >
                {cities.isFetching && (
                  <p
                    role="status"
                    className="p-2 text-xs text-muted-foreground"
                  >
                    Searching…
                  </p>
                )}
                {cities.error && (
                  <p role="alert" className="p-2 text-xs">
                    City search failed.{" "}
                    <button type="button" onClick={() => void cities.refetch()}>
                      Retry
                    </button>
                  </p>
                )}
                {!cities.isFetching &&
                  cities.data?.items.map((city) => (
                    <button
                      type="button"
                      key={city.cityId}
                      className="profile-option text-left"
                      onClick={() => choose(city)}
                    >
                      {city.label}
                    </button>
                  ))}
                {!cities.isFetching &&
                  !cities.error &&
                  cities.data?.items.length === 0 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      No matching cities. You can select the country above.
                    </p>
                  )}
              </div>
              <div className="flex justify-between">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!offset || cities.isFetching}
                  onClick={() => setOffset(Math.max(0, offset - 30))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!cities.data?.more || cities.isFetching}
                  onClick={() => setOffset(offset + 30)}
                >
                  More cities
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span className="profile-chip" key={`${v.countryCode}-${v.cityId}`}>
              <LocationLabel value={v} />
              <button
                type="button"
                aria-label={`Remove ${label.toLowerCase()} selection`}
                onClick={() => onChange(value.filter((x) => x !== v))}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p>
          {multiple ? "No location preference specified." : "Not specified."}
        </p>
      )}
    </div>
  );
}
