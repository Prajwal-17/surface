import { sourceLabels } from "@repo/contracts";
import {
  cleanText,
  toIsoDate,
  toStringArray,
  toStringValue,
  type JobCandidate,
} from "../../../shared/normalization/job-normalization";
import {
  asArray,
  asRecord,
  fetchJson,
  type SourceAdapter,
} from "./source-adapter";

export const remoteOkSource: SourceAdapter = {
  key: "remote-ok",
  label: sourceLabels["remote-ok"],

  async search(_input, signal) {
    const items = asArray(await fetchJson("https://remoteok.com/api", signal));
    const jobItems = items.filter((value) => {
      const item = asRecord(value);
      return Boolean(item.position && item.url);
    });

    const jobs = jobItems.flatMap<JobCandidate>((value) => {
      const item = asRecord(value);
      const applyUrl = toStringValue(item.apply_url || item.url);
      const sourceUrl = toStringValue(item.url, applyUrl);
      const title = toStringValue(item.position);
      if (!applyUrl || !title) return [];

      return [{
        source: "remote-ok",
        externalId: toStringValue(item.id) || null,
        title,
        company: toStringValue(item.company, "Company not listed"),
        location: toStringValue(item.location, "Remote"),
        isRemote: true,
        employmentType: null,
        description: cleanText(item.description),
        applyUrl,
        sourceUrl,
        postedAt: toIsoDate(item.date || item.epoch),
        tags: toStringArray(item.tags),
      }];
    });

    return { jobs, fetchedCount: jobItems.length };
  },
};
