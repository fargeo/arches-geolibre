// Copies the built plugin into GeoLibre Desktop's auto-scanned plugins folder.
// Restart GeoLibre Desktop afterwards to load the new build.
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const bundleDirectory = join(repositoryRoot, "geolibre-plugin");
const manifest = JSON.parse(
    await readFile(join(bundleDirectory, "plugin.json"), "utf8"),
);

const pluginsDirectory =
    process.env.GEOLIBRE_PLUGINS_DIR ?? defaultPluginsDirectory();
const targetDirectory = join(pluginsDirectory, manifest.id);

await mkdir(pluginsDirectory, { recursive: true });
await rm(targetDirectory, { recursive: true, force: true });
await cp(bundleDirectory, targetDirectory, { recursive: true });

console.log(
    `Installed ${manifest.id}@${manifest.version} to ${targetDirectory}`,
);
console.log("Restart GeoLibre Desktop to load the plugin.");

function defaultPluginsDirectory() {
    const applicationIdentifier = "org.geolibre.desktop";
    switch (platform()) {
        case "darwin":
            return join(
                homedir(),
                "Library",
                "Application Support",
                applicationIdentifier,
                "plugins",
            );
        case "win32":
            return join(
                process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
                applicationIdentifier,
                "plugins",
            );
        default:
            return join(
                process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
                applicationIdentifier,
                "plugins",
            );
    }
}
