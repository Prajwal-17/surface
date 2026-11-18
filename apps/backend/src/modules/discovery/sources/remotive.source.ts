import {
  descriptionContent,
  explicitCountries,
} from "../../collection/extraction";
import {
  toIsoDate,
  toStringArray,
  toStringValue,
  type JobCandidate,
} from "../../../shared/normalization/job-normalization";
import { asArray, asRecord, type SourceAdapter } from "./source-adapter";

export const remotiveSource: SourceAdapter = {
  key: "remotive",

  extract(raw) {
    const payload = asRecord(raw);
    if (!Array.isArray(payload.jobs))
      throw new Error("Malformed remotive response.");
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
          companyWebsite:
            toStringValue(item.company_url || item.company_website) || null,
          location: toStringValue(item.candidate_required_location, "Remote"),
          isRemote: true,
          countries: explicitCountries(item.candidate_required_location),
          compensation: toStringValue(item.salary)
            ? {
                min: null,
                max: null,
                currency: null,
                period: null,
                original: toStringValue(item.salary),
              }
            : null,
          employmentType: toStringValue(item.job_type) || null,
          ...descriptionContent(toStringValue(item.description)),
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
