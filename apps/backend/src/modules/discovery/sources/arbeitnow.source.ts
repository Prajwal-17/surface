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

export const arbeitnowSource: SourceAdapter = {
  key: "arbeitnow",
  label: sourceLabels.arbeitnow,

  async search(_input, signal) {
    const payload = asRecord(
      await fetchJson("https://www.arbeitnow.com/api/job-board-api", signal),
    );
    const items = asArray(payload.data);

    const jobs = items.flatMap<JobCandidate>((value) => {
      const item = asRecord(value);
      const applyUrl = toStringValue(item.url);
      const title = toStringValue(item.title);
      if (!applyUrl || !title) return [];

      return [
        {
          source: "arbeitnow",
          externalId: toStringValue(item.slug) || null,
          title,
          company: toStringValue(item.company_name, "Company not listed"),
          location: toStringValue(item.location, "Location not listed"),
          isRemote: item.remote === true,
          employmentType: toStringArray(item.job_types).join(", ") || null,
          description: cleanText(item.description),
          applyUrl,
          sourceUrl: applyUrl,
          postedAt: toIsoDate(item.created_at),
          tags: toStringArray(item.tags),
        },
      ];
    });

    return { jobs, fetchedCount: items.length };
  },
};
