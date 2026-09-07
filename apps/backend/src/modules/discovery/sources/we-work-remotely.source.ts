import { descriptionContent } from "../../collection/extraction";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  toIsoDate,
  toStringValue,
  type JobCandidate,
} from "../../../shared/normalization/job-normalization";
import { asRecord, type SourceAdapter } from "./source-adapter";

const parser = new XMLParser({
  processEntities: false,
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

export const weWorkRemotelySource: SourceAdapter = {
  key: "we-work-remotely",

  extract(raw) {
    if (XMLValidator.validate(String(raw)) !== true)
      throw new Error("Malformed RSS response.");
    const document = asRecord(parser.parse(String(raw)));
    const rss = asRecord(document.rss);
    const channel = asRecord(rss.channel);
    if (!channel || !document.rss) throw new Error("Malformed RSS response.");
    const items = channel.item
      ? Array.isArray(channel.item)
        ? channel.item
        : [channel.item]
      : [];

    const jobs = items.flatMap<JobCandidate>((value) => {
      const item = asRecord(value);
      const link = toStringValue(item.link || item.guid);
      const rawTitle = toStringValue(item.title);
      if (!link || !rawTitle) return [];

      const separator = rawTitle.indexOf(":");
      const company =
        separator > 0
          ? rawTitle.slice(0, separator).trim()
          : "Company not listed";
      const title =
        separator > 0 ? rawTitle.slice(separator + 1).trim() : rawTitle;

      return [
        {
          source: "we-work-remotely",
          externalId: toStringValue(item.guid) || link,
          title,
          company,
          location: toStringValue(item.region, "Remote"),
          isRemote: true,
          employmentType: toStringValue(item.type) || null,
          ...descriptionContent(toStringValue(item.description)),
          applyUrl: link,
          sourceUrl: link,
          postedAt: toIsoDate(item.pubDate),
          tags: [toStringValue(item.category)].filter(Boolean),
        },
      ];
    });

    return { jobs, fetchedCount: items.length };
  },
};
