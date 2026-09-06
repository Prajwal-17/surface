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

export const jobicySource: SourceAdapter = {
  key: "jobicy",
  label: sourceLabels.jobicy,

  async search(input, signal) {
    const url = new URL("https://jobicy.com/api/v2/remote-jobs");
    url.searchParams.set("count", "50");
    url.searchParams.set("tag", input.query);

    const payload = asRecord(await fetchJson(url.toString(), signal));
    const items = asArray(payload.jobs);

    const jobs = items.flatMap<JobCandidate>((value) => {
      const item = asRecord(value);
      const applyUrl = toStringValue(item.url);
      const title = toStringValue(item.jobTitle);
      if (!applyUrl || !title) return [];

      return [{
        source: "jobicy",
        externalId: toStringValue(item.id) || null,
        title,
        company: toStringValue(item.companyName, "Company not listed"),
        location: toStringValue(item.jobGeo, "Remote"),
        isRemote: true,
        employmentType: toStringValue(item.jobType) || null,
        description: cleanText(item.jobDescription || item.jobExcerpt),
        applyUrl,
        sourceUrl: applyUrl,
        postedAt: toIsoDate(item.pubDate),
        tags: [
          ...toStringArray(item.jobIndustry),
          ...toStringArray(item.jobLevel),
        ],
      }];
    });

    return { jobs, fetchedCount: items.length };
  },
};
