import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const [command, ...args] = process.argv.slice(2);

if (!command || !["export", "import", "verify"].includes(command)) {
  console.error(
    [
      "Surface desktop data tool",
      "",
      "  export --output DIR [--data-dir DIR] [--database-url URL] [--allow-missing-assets]",
      "  import --input DIR --user-data DIR",
      "  verify --input DIR --user-data DIR",
      "",
      "The import format is Surface's own manifest/JSONL export, not pg_dump.",
    ].join("\n"),
  );
  process.exit(2);
}

const value = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const flag = (name: string): boolean => args.includes(name);
const required = (name: string): string => {
  const result = value(name);
  if (!result) throw new Error(`Missing ${name}.`);
  return resolve(result);
};

try {
  if (command === "export") {
    const output = required("--output");
    const databaseUrl =
      value("--database-url") ?? process.env.SURFACE_SOURCE_DATABASE_URL;
    if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
    delete process.env.PGLITE_DATA_DIR;
    process.env.APP_ENV = process.env.APP_ENV ?? "production";
    const dataDir = value("--data-dir");
    if (dataDir) process.env.DATA_DIR = resolve(dataDir);
    const { exportSurfaceData } = await import(
      "../src/modules/migration/export"
    );
    const { closeDatabase } = await import(
      "../src/infrastructure/database/client"
    );
    try {
      const manifest = await exportSurfaceData({
        output,
        allowMissingAssets: flag("--allow-missing-assets"),
      });
      console.info(
        JSON.stringify(
          {
            exportedAt: manifest.createdAt,
            output,
            tables: Object.fromEntries(
              manifest.tables.map((table) => [table.name, table.rowCount]),
            ),
            totalRows: manifest.tables.reduce(
              (sum, table) => sum + table.rowCount,
              0,
            ),
            snapshots: manifest.assets.snapshots,
            companyLogos: manifest.assets.companyLogos,
            format: `${manifest.format} v${manifest.formatVersion}`,
          },
          null,
          2,
        ),
      );
    } finally {
      await closeDatabase();
    }
  } else if (command === "import") {
    const input = required("--input");
    const userData = required("--user-data");
    const finalDatabase = join(userData, "pglite");
    const finalData = join(userData, "data");
    if (existsSync(finalDatabase)) {
      throw new Error(
        `${finalDatabase} already exists. Import never overwrites an existing database; move the current Surface data away first (do not delete it).`,
      );
    }
    if (existsSync(finalData) && readdirSync(finalData).length) {
      throw new Error(
        `${finalData} is not empty. Import into a fresh user-data directory so existing snapshots are preserved.`,
      );
    }
    mkdirSync(dirname(userData), { recursive: true });
    const stageRoot = `${userData}.surface-import-${Date.now()}`;
    const stageDatabase = join(stageRoot, "pglite");
    const stageData = join(stageRoot, "data");
    mkdirSync(stageRoot, { recursive: true, mode: 0o700 });
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    process.env.PGLITE_DATA_DIR = stageDatabase;
    process.env.DATA_DIR = stageData;
    const { importSurfaceData } = await import(
      "../src/modules/migration/import"
    );
    const { closeDatabase } = await import(
      "../src/infrastructure/database/client"
    );
    try {
      const report = await importSurfaceData({
        input,
        dataDir: stageData,
        destination: userData,
      });
      await closeDatabase();
      // Move only after every table, settings row, snapshot and asset check passed.
      mkdirSync(userData, { recursive: true, mode: 0o700 });
      if (existsSync(finalData)) rmdirSync(finalData);
      renameSync(stageDatabase, finalDatabase);
      renameSync(stageData, finalData);
      rmdirSync(stageRoot);
      console.info(JSON.stringify({ ...report, database: finalDatabase, data: finalData }, null, 2));
    } catch (error) {
      await closeDatabase().catch(() => {});
      console.error(
        `Import failed. Existing Surface data was not modified. The staged attempt remains at ${stageRoot} for inspection.`,
      );
      throw error;
    }
  } else {
    const input = required("--input");
    const userData = required("--user-data");
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    process.env.PGLITE_DATA_DIR = join(userData, "pglite");
    process.env.DATA_DIR = join(userData, "data");
    const { verifyImportedData } = await import(
      "../src/modules/migration/import"
    );
    const { closeDatabase } = await import(
      "../src/infrastructure/database/client"
    );
    try {
      const report = await verifyImportedData(input, join(userData, "data"));
      console.info(JSON.stringify(report, null, 2));
    } finally {
      await closeDatabase();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  // PGlite can retain WASM/event-loop handles after a handled error. Exit
  // explicitly so the Electron utility process and terminal command finish.
  process.exit(process.exitCode ?? 0);
}
