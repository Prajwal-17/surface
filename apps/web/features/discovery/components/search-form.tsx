"use client";

import type { DiscoverySearchInput } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { ArrowRight, LoaderCircle, MapPin, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { searchFormSchema } from "../schemas/search-form.schema";

interface SearchFormProps {
  onSubmit: (input: DiscoverySearchInput) => Promise<void>;
  isSearching: boolean;
}

type SearchFormValues = z.input<typeof searchFormSchema>;

export function SearchForm({ onSubmit, isSearching }: SearchFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SearchFormValues, unknown, DiscoverySearchInput>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      query: "frontend engineer",
      location: "",
    },
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-md border border-border bg-accent p-3 sm:p-4"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.8fr)_auto] lg:items-end">
        <label className="block">
          <span className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-accent-foreground/70">
            Role or keywords
          </span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...register("query")}
              placeholder="e.g. frontend engineer"
              className="border-white/15 bg-background pl-10"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block font-mono text-xs uppercase tracking-[0.1em] text-accent-foreground/70">
            Location
          </span>
          <span className="relative block">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...register("location")}
              placeholder="Anywhere"
              className="border-white/15 bg-background pl-10"
            />
          </span>
        </label>

        <Button
          type="submit"
          size="lg"
          disabled={isSearching}
          aria-busy={isSearching}
          className="min-w-36"
        >
          {isSearching ? (
            <>
              <LoaderCircle className="animate-spin" />
              Searching
            </>
          ) : (
            <>
              Search feeds
              <ArrowRight />
            </>
          )}
        </Button>
      </div>

      {errors.query?.message ? (
        <p role="alert" className="pt-3 text-xs text-[#ffd2ca]">
          {errors.query.message}
        </p>
      ) : null}
    </form>
  );
}
