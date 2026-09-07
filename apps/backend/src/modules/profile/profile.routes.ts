import { db } from "../../infrastructure/database/client";
import { profileRevisions } from "./profile.tables";
import { profileInputSchema } from "../../shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { findProfile, saveProfile } from "./profile.repository";

export const profileRoutes = new Hono();

profileRoutes.get("/context", (c) => c.json({ profile: findProfile() }));
profileRoutes.put("/context", zValidator("json", profileInputSchema), (c) =>
  c.json({ profile: saveProfile(c.req.valid("json")) }),
);

profileRoutes.get("/history", (c) =>
  c.json(db.select().from(profileRevisions).all()),
);
