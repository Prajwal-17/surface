import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../infrastructure/database/client";
import { duplicateDecisions } from "../collection/collection.tables";
import { jobs, jobSources } from "./jobs.tables";
import { HttpError } from "../../shared/errors/http-error";
export function decideDuplicate(
  id: string,
  action: "merge" | "separate" | "undo",
) {
  return db.transaction((tx) => {
    let decision = tx
      .select()
      .from(duplicateDecisions)
      .where(eq(duplicateDecisions.id, id))
      .get();
    if (!decision) throw new HttpError(404, "Duplicate review not found.");
    const now = new Date().toISOString();
    if (action === "undo") {
      if (decision.state !== "merged")
        throw new HttpError(409, "Only an active merge can be undone.");
      const target = tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, decision.leftId))
        .get();
      if (target?.mergedInto)
        throw new HttpError(409, "Undo the later merge first.");
      tx.update(jobSources)
        .set({ jobId: decision.rightId })
        .where(
          and(
            eq(jobSources.jobId, decision.leftId),
            inArray(jobSources.id, decision.sourceIds),
          ),
        )
        .run();
      tx.update(jobs)
        .set({ mergedInto: null })
        .where(eq(jobs.id, decision.rightId))
        .run();
      tx.update(duplicateDecisions)
        .set({ state: "undone", updatedAt: now })
        .where(eq(duplicateDecisions.id, id))
        .run();
    } else if (action === "separate") {
      if (decision.state === "merged")
        throw new HttpError(
          409,
          "Undo this merge before keeping the jobs separate.",
        );
      tx.update(duplicateDecisions)
        .set({ state: "separate", updatedAt: now })
        .where(eq(duplicateDecisions.id, id))
        .run();
    } else {
      const available = tx
        .select()
        .from(jobs)
        .where(
          and(
            inArray(jobs.id, [decision.leftId, decision.rightId]),
            isNull(jobs.mergedInto),
          ),
        )
        .all();
      if (available.length !== 2)
        throw new HttpError(
          409,
          "A job is already merged. Undo that merge first.",
        );
      const authoritative = (id: string) =>
        tx
          .select()
          .from(jobSources)
          .where(eq(jobSources.jobId, id))
          .all()
          .some((ref) => ["greenhouse", "lever", "ashby"].includes(ref.source));
      if (!authoritative(decision.leftId) && authoritative(decision.rightId)) {
        const leftId = decision.rightId,
          rightId = decision.leftId;
        tx.update(duplicateDecisions)
          .set({ leftId, rightId })
          .where(eq(duplicateDecisions.id, id))
          .run();
        decision = { ...decision, leftId, rightId };
      }
      const sourceIds = tx
        .select()
        .from(jobSources)
        .where(eq(jobSources.jobId, decision.rightId))
        .all()
        .map((s) => s.id);
      tx.update(jobSources)
        .set({ jobId: decision.leftId })
        .where(eq(jobSources.jobId, decision.rightId))
        .run();
      tx.update(jobs)
        .set({ mergedInto: decision.leftId })
        .where(eq(jobs.id, decision.rightId))
        .run();
      tx.update(duplicateDecisions)
        .set({ state: "merged", sourceIds, updatedAt: now })
        .where(eq(duplicateDecisions.id, id))
        .run();
    }
    return tx
      .select()
      .from(duplicateDecisions)
      .where(eq(duplicateDecisions.id, id))
      .get()!;
  });
}
