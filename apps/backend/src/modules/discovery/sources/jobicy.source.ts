import {
  descriptionContent,
  explicitCountries,
  salary,
} from "../../collection/extraction";
import {
  toIsoDate,
  toStringArray,
  toStringValue,
  type JobCandidate,
} from "../../../shared/normalization/job-normalization";
import { asArray, asRecord, type SourceAdapter } from "./source-adapter";

export const jobicySource: SourceAdapter = {
  key: "jobicy",

  extract(raw) {
    const payload = asRecord(raw);
    if (!Array.isArray(payload.jobs))
      throw new Error("Malformed jobicy response.");
    const items = asArray(payload.jobs);

    const jobs = items.flatMap<JobCandidate>((value) => {
      const item = asRecord(value);
      const applyUrl = toStringValue(item.url);
      const title = toStringValue(item.jobTitle);
      if (!applyUrl || !title) return [];

      return [
        {
          source: "jobicy",
          externalId: toStringValue(item.id) || null,
          title,
          company: toStringValue(item.companyName, "Company not listed"),
          companyWebsite:
            toStringValue(item.companyWebsite || item.companyUrl) || null,
          location: toStringValue(item.jobGeo, "Remote"),
          isRemote: true,
          countries: explicitCountries(item.jobGeo),
          compensation: salary({
            min: item.salaryMin,
            max: item.salaryMax,
            currency: item.salaryCurrency,
            interval: item.salaryPeriod,
          }),
          employmentType: toStringValue(item.jobType) || null,
          ...descriptionContent(
            toStringValue(item.jobDescription || item.jobExcerpt),
          ),
          applyUrl,
          sourceUrl: applyUrl,
          postedAt: toIsoDate(item.pubDate),
          tags: [
            ...toStringArray(item.jobIndustry),
            ...toStringArray(item.jobLevel),
          ],
        },
      ];
    });

    return { jobs, fetchedCount: items.length };
  },
};
