import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  researchEventSchema,
  type ResearchDetail,
  type ResearchEvent,
} from "@surface/contracts";

type ResearchRun = ResearchDetail["runs"][number];

export type ResearchPhase =
  | "idle"
  | "connecting"
  | "gathering"
  | "writing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface ResearchRunState {
  runId: string | null;
  draft: string;
  events: ResearchEvent[];
  phase: ResearchPhase;
}

const idle: ResearchRunState = {
  runId: null,
  draft: "",
  events: [],
  phase: "idle",
};

function terminalPhase(value: string): ResearchPhase {
  return value === "completed" ||
    value === "partial" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "interrupted"
    ? value
    : "failed";
}

function seed(run: ResearchRun): ResearchRunState {
  return {
    runId: run.id,
    draft: run.draft,
    events: [],
    phase:
      run.state === "running"
        ? run.draft
          ? "writing"
          : "connecting"
        : run.state,
  };
}

/**
 * Replayable domain-event state for one research run. The server owns the
 * durable lifecycle; this hook only deduplicates and shapes persisted events.
 */
export function useResearchRun(
  companyId: string,
  run: ResearchRun | undefined,
) {
  const client = useQueryClient();
  const [state, setState] = useState<ResearchRunState>(idle);
  const lastEventId = useRef(0);
  const seedDraft = useRef("");
  const activeId = run?.state === "running" ? run.id : null;
  const current =
    run && state.runId === run.id ? state : run ? seed(run) : idle;

  useEffect(() => {
    seedDraft.current = run?.draft ?? "";
  }, [run?.draft]);

  useEffect(() => {
    if (!activeId) return;
    lastEventId.current = 0;
    const runId = activeId;
    const stream = new EventSource(
      `/api/companies/${companyId}/research/runs/${runId}/events`,
    );
    let closed = false;
    const receive = (raw: MessageEvent) => {
      let value: unknown;
      try {
        value = JSON.parse(raw.data);
      } catch {
        return;
      }
      const parsed = researchEventSchema.safeParse(value);
      if (!parsed.success || parsed.data.runId !== runId) return;
      const event = parsed.data;
      if (event.id <= lastEventId.current) return;
      lastEventId.current = event.id;
      setState((previous) => {
        const base: ResearchRunState =
          previous.runId === runId
            ? previous
            : {
                runId,
                draft: seedDraft.current,
                events: [],
                phase: seedDraft.current ? "writing" : "connecting",
              };
        if (event.type === "text")
          return {
            ...base,
            draft: event.text,
            phase: event.text ? "writing" : "gathering",
          };
        if (event.type === "progress")
          return {
            ...base,
            phase: base.phase === "writing" ? "writing" : "gathering",
            events: [
              ...base.events.filter((item) => item.id !== event.id),
              event,
            ].slice(-30),
          };
        return { ...base, phase: terminalPhase(event.text) };
      });
      if (event.type === "done") finish();
    };
    const finish = () => {
      if (closed) return;
      closed = true;
      stream.close();
      void client.invalidateQueries({
        queryKey: ["company-research", companyId],
      });
      void client.invalidateQueries({ queryKey: ["company-opportunities"] });
      void client.invalidateQueries({
        queryKey: ["company-detail", companyId],
      });
    };
    const end = (raw: MessageEvent) => {
      try {
        const value = JSON.parse(raw.data) as { state?: string };
        if (value.state)
          setState((previous) =>
            previous.runId === runId
              ? { ...previous, phase: terminalPhase(value.state!) }
              : previous,
          );
      } catch {
        // A malformed terminal record still closes the replayable stream.
      }
      finish();
    };
    const error = () => {
      if (closed) return;
      setState((previous) =>
        previous.runId === runId && previous.phase !== "writing"
          ? { ...previous, phase: "connecting" }
          : previous,
      );
    };
    stream.addEventListener("progress", receive);
    stream.addEventListener("text", receive);
    stream.addEventListener("done", receive);
    stream.addEventListener("end", end);
    stream.addEventListener("error", error);
    return () => {
      closed = true;
      stream.close();
    };
  }, [activeId, client, companyId]);

  return current;
}

export function researchPhaseLabel(
  phase: ResearchPhase | ResearchRun["state"],
) {
  switch (phase) {
    case "connecting":
      return "Connecting to research stream";
    case "gathering":
      return "Gathering sources";
    case "writing":
      return "Writing answer";
    case "completed":
      return "Research completed";
    case "partial":
      return "Research finished partially";
    case "failed":
      return "Research failed";
    case "cancelled":
      return "Research stopped";
    case "interrupted":
      return "Research was interrupted";
    case "idle":
      return "Research";
    case "running":
      return "Researching";
  }
}
