import { arbeitnowSource } from "./arbeitnow.source";
import { jobicySource } from "./jobicy.source";
import { remoteOkSource } from "./remote-ok.source";
import { remotiveSource } from "./remotive.source";
import type { SourceAdapter } from "./source-adapter";
import { weWorkRemotelySource } from "./we-work-remotely.source";

export const sourceAdapters: SourceAdapter[] = [
  remotiveSource,
  jobicySource,
  arbeitnowSource,
  remoteOkSource,
  weWorkRemotelySource,
];
