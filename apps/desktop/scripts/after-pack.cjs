const { cpSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

/**
 * electron-builder omits nested node_modules from extraResources. The crawler
 * is a real Node process, so its staged production dependencies must live next
 * to dist/index.js in the packaged resources directory.
 */
module.exports = async function afterPack(context) {
  copyDependencies(context, "crawler");
  copyDependencies(context, "backend");
};

function copyDependencies(context, name) {
  const source = join(
    context.packager.projectDir,
    "build",
    name,
    "node_modules",
  );
  if (!existsSync(source)) {
    throw new Error(`${name} dependencies are missing at ${source}`);
  }
  const target = join(context.appOutDir, "resources", name, "node_modules");
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true, dereference: true });
}
