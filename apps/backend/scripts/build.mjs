import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const outdir = join(appDir, "dist");

mkdirSync(outdir, { recursive: true });
await build({
  entryPoints: [join(appDir, "src/index.ts")],
  outfile: join(outdir, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  banner: {
    js: "import { createRequire as __surfaceCreateRequire } from 'node:module'; var require = __surfaceCreateRequire(import.meta.url);",
  },
});
for (const folder of ["drizzle", "drizzle-sqlite"]) {
  cpSync(join(appDir, folder), join(outdir, folder), { recursive: true });
}
mkdirSync(join(outdir, "data"), { recursive: true });
cpSync(
  join(appDir, "src/modules/profile/data/locations.json.gz"),
  join(outdir, "data/locations.json.gz"),
);
console.info(`Backend Node build written to ${outdir}`);
