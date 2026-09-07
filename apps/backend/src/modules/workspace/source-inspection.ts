import { canonicalizeUrl } from "../../shared/normalization/job-normalization";
import { publicUrlSchema, type SourceInspection } from "../../shared/contracts";
export function inspectSource(input: string): SourceInspection {
  const url = new URL(canonicalizeUrl(publicUrlSchema.parse(input)));
  url.hash = "";
  const host = url.hostname.toLowerCase(),
    parts = url.pathname.split("/").filter(Boolean);
  const result: SourceInspection = {
    url: url.href,
    endpoint: url.href,
    provider: "public-page",
    boardIdentity: null,
    support: "unverified",
    reason:
      "Direct page: collection must verify structured job data. Login or JavaScript-only pages are unavailable.",
  };
  const unsupported = [
    "linkedin.com",
    "indeed.com",
    "workday.com",
    "myworkdayjobs.com",
  ];
  if (unsupported.some((h) => host === h || host.endsWith(`.${h}`)))
    return {
      ...result,
      provider: "unsupported",
      support: "unsupported",
      reason:
        "This portal requires browser or authenticated collection, which is not supported. The link is saved for manual review.",
    };
  let board: string | undefined;
  if (
    ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(host) &&
    parts.length === 1
  ) {
    board = parts[0];
    result.provider = "greenhouse";
    result.endpoint = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
  }
  if (
    host === "boards-api.greenhouse.io" &&
    parts[0] === "v1" &&
    parts[1] === "boards" &&
    parts[3] === "jobs" &&
    parts.length === 4
  ) {
    board = parts[2];
    result.provider = "greenhouse";
    result.endpoint = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
  }
  if (
    ["jobs.lever.co", "jobs.eu.lever.co"].includes(host) &&
    parts.length === 1
  ) {
    board = parts[0];
    result.provider = "lever";
    result.endpoint = `https://api${host.includes(".eu.") ? ".eu" : ""}.lever.co/v0/postings/${board}?mode=json`;
  }
  if (
    ["api.lever.co", "api.eu.lever.co"].includes(host) &&
    parts[0] === "v0" &&
    parts[1] === "postings" &&
    parts.length === 3
  ) {
    board = parts[2];
    result.provider = "lever";
  }
  if (host === "jobs.ashbyhq.com" && parts.length === 1) {
    board = parts[0];
    result.provider = "ashby";
    result.endpoint = `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`;
  }
  if (
    host === "api.ashbyhq.com" &&
    parts[0] === "posting-api" &&
    parts[1] === "job-board" &&
    parts.length === 3
  ) {
    board = parts[2];
    result.provider = "ashby";
  }
  if (
    ["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(host) &&
    parts.length === 3 &&
    parts[1] === "jobs" &&
    /^\d+$/.test(parts[2]!)
  ) {
    board = parts[0];
    result.provider = "greenhouse";
    result.endpoint = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${parts[2]}?content=true&pay_transparency=true`;
  }
  if (
    host === "boards-api.greenhouse.io" &&
    parts[0] === "v1" &&
    parts[1] === "boards" &&
    parts[3] === "jobs" &&
    parts.length === 5 &&
    /^\d+$/.test(parts[4]!)
  ) {
    board = parts[2];
    result.provider = "greenhouse";
  }
  if (
    ["jobs.lever.co", "jobs.eu.lever.co"].includes(host) &&
    parts.length === 2
  ) {
    board = parts[0];
    result.provider = "lever";
    result.endpoint = `https://api${host.includes(".eu.") ? ".eu" : ""}.lever.co/v0/postings/${board}/${parts[1]}?mode=json`;
  }
  if (
    ["api.lever.co", "api.eu.lever.co"].includes(host) &&
    parts[0] === "v0" &&
    parts[1] === "postings" &&
    parts.length === 4
  ) {
    board = parts[2];
    result.provider = "lever";
  }
  const feeds = {
    "https://remotive.com/api/remote-jobs": "remotive",
    "https://jobicy.com/api/v2/remote-jobs": "jobicy",
    "https://www.arbeitnow.com/api/job-board-api": "arbeitnow",
    "https://remoteok.com/api": "remote-ok",
    "https://weworkremotely.com/remote-jobs.rss": "we-work-remotely",
  } as const;
  const feed =
    feeds[
      `${url.origin}${url.pathname.replace(/\/$/, "")}` as keyof typeof feeds
    ];
  if (feed) result.provider = feed;
  if (board || feed) {
    result.boardIdentity = board ?? null;
    result.support = "supported";
    result.reason = "Recognized public job endpoint.";
  }
  return result;
}
