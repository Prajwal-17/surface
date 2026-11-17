import { and, eq, inArray, isNull } from "drizzle-orm";
import { transaction } from "../../infrastructure/database/client";
import { duplicateDecisions } from "../collection/collection.tables";
import { jobs, jobSources } from "./jobs.tables";
import { HttpError } from "../../shared/errors/http-error";
export async function decideDuplicate(
  id: string,
  action: "merge" | "separate" | "undo",
) {
  return await transaction(async (tx) => {
    let decision = (
      await tx
        .select()
        .from(duplicateDecisions)
        .where(eq(duplicateDecisions.id, id))
        .limit(1)
    )[0];
    if (!decision) throw new HttpError(404, "Duplicate review not found.");
    const now = new Date().toISOString();
    if (action === "undo") {
      if (decision.state !== "merged")
        throw new HttpError(409, "Only an active merge can be undone.");
      const target = (
        await tx
          .select()
          .from(jobs)
          .where(eq(jobs.id, decision.leftId))
          .limit(1)
      )[0];
      if (target?.mergedInto)
        throw new HttpError(409, "Undo the later merge first.");
      await tx
        .update(jobSources)
        .set({ jobId: decision.rightId })
        .where(
          and(
            eq(jobSources.jobId, decision.leftId),
            inArray(jobSources.id, decision.sourceIds),
          ),
        );
      await tx
        .update(jobs)
        .set({ mergedInto: null })
        .where(eq(jobs.id, decision.rightId));
      await tx
        .update(duplicateDecisions)
        .set({ state: "undone", updatedAt: now })
        .where(eq(duplicateDecisions.id, id));
    } else if (action === "separate") {
      if (decision.state === "merged")
        throw new HttpError(
          409,
          "Undo this merge before keeping the jobs separate.",
        );
      await tx
        .update(duplicateDecisions)
        .set({ state: "separate", updatedAt: now })
        .where(eq(duplicateDecisions.id, id));
    } else {
      const available = await tx
        .select()
        .from(jobs)
        .where(
          and(
            inArray(jobs.id, [decision.leftId, decision.rightId]),
            isNull(jobs.mergedInto),
          ),
        );
      if (available.length !== 2)
        throw new HttpError(
          409,
          "A job is already merged. Undo that merge first.",
        );
      const authoritative = async (jobId: string) =>
        (
          await tx.select().from(jobSources).where(eq(jobSources.jobId, jobId))
        ).some((ref) => ["greenhouse", "lever", "ashby"].includes(ref.source));
      if (
        !(await authoritative(decision.leftId)) &&
        (await authoritative(decision.rightId))
      ) {
        const leftId = decision.rightId,
          rightId = decision.leftId;
        await tx
          .update(duplicateDecisions)
          .set({ leftId, rightId })
          .where(eq(duplicateDecisions.id, id));
        decision = { ...decision, leftId, rightId };
      }
      const sourceIds = (
        await tx
          .select()
          .from(jobSources)
          .where(eq(jobSources.jobId, decision.rightId))
      ).map((s) => s.id);
      await tx
        .update(jobSources)
        .set({ jobId: decision.leftId })
        .where(eq(jobSources.jobId, decision.rightId));
      await tx
        .update(jobs)
        .set({ mergedInto: decision.leftId })
        .where(eq(jobs.id, decision.rightId));
      await tx
        .update(duplicateDecisions)
        .set({ state: "merged", sourceIds, updatedAt: now })
        .where(eq(duplicateDecisions.id, id));
    }
    return (
      await tx
        .select()
        .from(duplicateDecisions)
        .where(eq(duplicateDecisions.id, id))
        .limit(1)
    )[0]!;
  });
}
