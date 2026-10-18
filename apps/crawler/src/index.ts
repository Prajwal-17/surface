import type { AddressInfo } from "node:net";
import { log } from "crawlee";
import { createCrawler } from "./crawl/crawl-page.ts";
import { createEgressProxy } from "./network/egress-proxy.ts";
import { createCrawlerServer } from "./server/http-server.ts";

log.setLevel(log.LEVELS.ERROR);
const egress = createEgressProxy();
await new Promise<void>((resolve) => egress.listen(0, "127.0.0.1", resolve));
const proxyUrl = `http://127.0.0.1:${(egress.address() as AddressInfo).port}`;
const service = createCrawlerServer(createCrawler(proxyUrl));

service.server.listen(
  Number(process.env.CRAWLER_PORT || 4100),
  process.env.CRAWLER_HOST || "127.0.0.1",
  () => console.info("Crawlee service listening"),
);

for (const name of ["SIGINT", "SIGTERM"] as const) {
  process.on(name, () => {
    service.stop();
    egress.close();
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
