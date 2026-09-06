"use client";

import type { DiscoverySearchInput } from "backend/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      className="search-panel rounded-2xl border p-4 sm:p-6"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.8fr)_auto] lg:items-end">
        <label className="block">
          <span className="mb-2.5 block text-xs font-medium text-muted-foreground">
            Role or keywords
          </span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...register("query")}
              placeholder="e.g. frontend engineer"
              aria-invalid={Boolean(errors.query)}
              aria-describedby={errors.query ? "query-error" : undefined}
              className="h-12 bg-background/70 pl-10"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-2.5 block text-xs font-medium text-muted-foreground">
            Location
          </span>
          <span className="relative block">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              {...register("location")}
              placeholder="Anywhere"
              className="h-12 bg-background/70 pl-10"
            />
          </span>
        </label>

        <Button
          type="submit"
          size="lg"
          disabled={isSearching}
          aria-busy={isSearching}
          className="h-12 min-w-40"
        >
          {isSearching ? (
            <>
              <LoaderCircle className="animate-spin" />
              Searching
            </>
          ) : (
            <>
              Find opportunities
              <ArrowRight />
            </>
          )}
        </Button>
      </div>

      {errors.query?.message ? (
        <p
          id="query-error"
          role="alert"
          className="pt-3 text-xs text-[#ffd2ca]"
        >
          {errors.query.message}
        </p>
      ) : null}
    </form>
  );
}
