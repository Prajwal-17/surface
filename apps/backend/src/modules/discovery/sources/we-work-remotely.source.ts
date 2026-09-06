import { sourceLabels } from "@repo/contracts";
import { XMLParser } from "fast-xml-parser";
import {
  cleanText,
  toIsoDate,
  toStringValue,
  type JobCandidate,
} from "../../../shared/normalization/job-normalization";
import {
  asArray,
  asRecord,
  fetchText,
  type SourceAdapter,
} from "./source-adapter";

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

export const weWorkRemotelySource: SourceAdapter = {
  key: "we-work-remotely",
  label: sourceLabels["we-work-remotely"],

  async search(_input, signal) {
    const xml = await fetchText(
      "https://weworkremotely.com/remote-jobs.rss",
      signal,
    );
    const document = asRecord(parser.parse(xml));
    const rss = asRecord(document.rss);
    const channel = asRecord(rss.channel);
    const items = asArray(channel.item);

    const jobs = items.flatMap<JobCandidate>((value) => {
      const item = asRecord(value);
      const link = toStringValue(item.link || item.guid);
      const rawTitle = toStringValue(item.title);
      if (!link || !rawTitle) return [];

      const separator = rawTitle.indexOf(":");
      const company =
        separator > 0 ? rawTitle.slice(0, separator).trim() : "Company not listed";
      const title =
        separator > 0 ? rawTitle.slice(separator + 1).trim() : rawTitle;

      return [{
        source: "we-work-remotely",
        externalId: toStringValue(item.guid) || link,
        title,
        company,
        location: toStringValue(item.region, "Remote"),
        isRemote: true,
        employmentType: toStringValue(item.type) || null,
        description: cleanText(item.description),
        applyUrl: link,
        sourceUrl: link,
        postedAt: toIsoDate(item.pubDate),
        tags: [toStringValue(item.category)].filter(Boolean),
      }];
    });

    return { jobs, fetchedCount: items.length };
  },
};
