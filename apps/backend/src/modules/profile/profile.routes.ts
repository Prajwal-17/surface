import { db } from "../../infrastructure/database/client";
import { profileRevisions } from "./profile.tables";
import { profileInputSchema } from "@surface/contracts";
import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  countries,
  searchCities,
  cityOption,
  validateProfileLocations,
} from "./locations";
import { pdfText, prefillResume } from "./resume";
import { HttpError } from "../../shared/errors/http-error";
import { Hono } from "hono";

import { findProfile, saveProfile } from "./profile.repository";

export const profileRoutes = new Hono();

profileRoutes.get("/context", async (c) =>
  c.json({ profile: await findProfile() }),
);
profileRoutes.put(
  "/context",
  zValidator(
    "json",
    profileInputSchema.extend({
      expectedRevision: z.number().int().nonnegative().optional(),
    }),
  ),
  async (c) => {
    const { expectedRevision, ...input } = c.req.valid("json");
    const previous = await findProfile();
    if (
      expectedRevision !== undefined &&
      expectedRevision !== (previous?.revision ?? 0)
    )
      throw new HttpError(
        409,
        "Your profile changed in another tab. Reload the page to review the latest version before saving.",
      );
    validateProfileLocations(input, previous);
    return c.json({ profile: await saveProfile(input) });
  },
);

profileRoutes.get("/history", async (c) =>
  c.json(await db.select().from(profileRevisions)),
);

profileRoutes.get("/catalogs", (c) =>
  c.json({
    countries,
    currencies: Intl.supportedValuesOf("currency"),
    timezones: [
      ...new Set([
        "UTC",
        ...Intl.supportedValuesOf("timeZone"),
        "Asia/Kolkata",
      ]),
    ].toSorted(),
  }),
);
profileRoutes.get("/locations", (c) => {
  const query = z
    .object({
      country: z.string().regex(/^[A-Z]{2}$/),
      q: z.string().max(200).default(""),
      offset: z.coerce.number().int().min(0).max(200000).default(0),
    })
    .safeParse(c.req.query());
  if (!query.success) throw new HttpError(400, "Invalid location search.");
  return c.json(
    searchCities(query.data.country, query.data.q, query.data.offset),
  );
});
profileRoutes.get("/locations/:id", (c) => {
  const id = z.coerce.number().int().positive().safeParse(c.req.param("id"));
  if (!id.success) throw new HttpError(400, "Invalid city identifier.");
  return c.json(cityOption(id.data));
});
profileRoutes.post(
  "/resume",
  bodyLimit({
    maxSize: 11 * 1024 * 1024,
    onError: (c) =>
      c.json(
        {
          error: "Choose a PDF smaller than 10 MB, or paste your résumé text.",
        },
        413,
      ),
  }),
  async (c) => {
    let text: string;
    if (c.req.header("content-type")?.includes("multipart/form-data")) {
      const body = await c.req.parseBody().catch(() => ({ file: undefined }));
      if (!(body.file instanceof File))
        throw new HttpError(400, "Choose a PDF file.");
      text = await pdfText(body.file);
    } else {
      const input = z
        .object({ text: z.string().min(40).max(100000) })
        .safeParse(await c.req.json().catch(() => null));
      if (!input.success)
        throw new HttpError(
          400,
          "Paste between 40 and 100,000 characters of résumé text.",
        );
      text = input.data.text;
    }
    return c.json(await prefillResume(text));
  },
);
