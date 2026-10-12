import { defineConfig, devices } from "@playwright/test";

// Drives GeoLibre's web build with this plugin bundled in. Prepare it with
// scripts/prepare-geolibre-web.sh and start the Arches test instance first;
// see test-instance/README.md.
const GEOLIBRE_PORT = Number(process.env.GEOLIBRE_PORT ?? 4173);
const GEOLIBRE_URL = `http://localhost:${GEOLIBRE_PORT}`;

export default defineConfig({
    testDir: "./e2e",
    timeout: 180_000,
    expect: { timeout: 30_000 },
    workers: 1,
    reporter: [["list"]],
    use: {
        ...devices["Desktop Chrome"],
        baseURL: GEOLIBRE_URL,
        viewport: { width: 1440, height: 900 },
        // Skip GeoLibre's first-launch onboarding wizard.
        storageState: {
            cookies: [],
            origins: [
                {
                    origin: GEOLIBRE_URL,
                    localStorage: [
                        {
                            name: "geolibre.desktopSettings",
                            value: JSON.stringify({
                                uiProfile: { onboarded: true },
                            }),
                        },
                    ],
                },
            ],
        },
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    webServer: {
        command: `npm run preview -w geolibre-desktop -- --port ${GEOLIBRE_PORT} --strictPort`,
        cwd: process.env.GEOLIBRE_DIR ?? ".geolibre",
        url: GEOLIBRE_URL,
        reuseExistingServer: true,
    },
});
