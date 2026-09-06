import { discoverySearchSchema } from "../../shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { runDiscovery } from "./discovery.service";

export const discoveryRoutes = new Hono();

discoveryRoutes.post(
  "/search",
  zValidator("json", discoverySearchSchema),
  async (context) => {
    const input = context.req.valid("json");
    const response = await runDiscovery(input);
    return context.json(response);
  },
);
