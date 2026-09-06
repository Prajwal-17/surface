import { sourceLabels } from "../../../shared/contracts";
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

export const remotiveSource: SourceAdapter = {
  key: "remotive",
  label: sourceLabels.remotive,

  async search(input, signal) {
    const url = new URL("https://remotive.com/api/remote-jobs");
    url.searchParams.set("search", input.query);

    const payload = asRecord(await fetchJson(url.toString(), signal));
    const items = asArray(payload.jobs);

    const jobs = items.flatMap<JobCandidate>((value) => {
      const item = asRecord(value);
      const applyUrl = toStringValue(item.url);
      const title = toStringValue(item.title);
      if (!applyUrl || !title) return [];

      return [
        {
          source: "remotive",
          externalId: toStringValue(item.id) || null,
          title,
          company: toStringValue(item.company_name, "Company not listed"),
          location: toStringValue(item.candidate_required_location, "Remote"),
          isRemote: true,
          employmentType: toStringValue(item.job_type) || null,
          description: cleanText(item.description),
          applyUrl,
          sourceUrl: applyUrl,
          postedAt: toIsoDate(item.publication_date),
          tags: toStringArray(item.tags),
        },
      ];
    });

    return { jobs, fetchedCount: items.length };
  },
};
