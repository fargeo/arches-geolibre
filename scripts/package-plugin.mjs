// Zips the built plugin for GeoLibre's Manage Plugins → Install from file.
import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const bundleDirectory = join(repositoryRoot, "geolibre-plugin");
const manifest = JSON.parse(
    await readFile(join(bundleDirectory, "plugin.json"), "utf8"),
);
const zipPath = join(repositoryRoot, `${manifest.id}-${manifest.version}.zip`);

await rm(zipPath, { force: true });
execFileSync("zip", ["-r", "-q", zipPath, "plugin.json", "dist"], {
    cwd: bundleDirectory,
});
console.log(`Packaged ${zipPath}`);
