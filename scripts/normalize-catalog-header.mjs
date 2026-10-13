// msginit fills Project-Id-Version from its environment (older versions guess
// it from the folder name), so set it here to keep the catalog identical on
// every machine, including CI.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(
    repositoryRoot,
    "src/arches_geolibre/locale/en/app.po",
);

const catalog = await readFile(catalogPath, "utf8");
await writeFile(
    catalogPath,
    catalog.replace(
        /^"Project-Id-Version: .*\\n"$/m,
        '"Project-Id-Version: arches-geolibre\\n"',
    ),
);
