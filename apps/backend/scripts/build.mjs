import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const outdir = join(appDir, "dist");

mkdirSync(outdir, { recursive: true });
for (const [entry, outfile] of [
  ["src/index.ts", "index.mjs"],
  ["scripts/desktop-data.ts", "data-cli.mjs"],
]) {
  await build({
    entryPoints: [join(appDir, entry)],
    outfile: join(outdir, outfile),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    sourcemap: true,
    external: ["@electric-sql/pglite"],
    banner: {
      js: "import { createRequire as __surfaceCreateRequire } from 'node:module'; var require = __surfaceCreateRequire(import.meta.url);",
    },
  });
}
cpSync(join(appDir, "drizzle"), join(outdir, "drizzle"), {
  recursive: true,
});
mkdirSync(join(outdir, "data"), { recursive: true });
cpSync(
  join(appDir, "src/modules/profile/data/locations.json.gz"),
  join(outdir, "data/locations.json.gz"),
);
console.info(`Backend Node build written to ${outdir}`);
