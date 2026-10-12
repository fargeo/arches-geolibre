import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// GeoLibre loads the plugin as a single self-contained ES module, so Vue and
// OpenVue are bundled rather than externalized.
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
        // OpenVue components are built on the Options API.
        __VUE_OPTIONS_API__: "true",
        __VUE_PROD_DEVTOOLS__: "false",
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
    build: {
        lib: {
            entry: fileURLToPath(
                new URL("./src/arches_geolibre/plugin.ts", import.meta.url),
            ),
            formats: ["es"],
            fileName: () => "index.js",
        },
        outDir: "geolibre-plugin/dist",
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
            output: {
                assetFileNames: () => "style.css",
            },
        },
    },
    test: {
        globals: true,
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    environment: "jsdom",
                    include: ["src/**/*.test.ts"],
                },
            },
            {
                // Runs against a live Arches; see test-instance/README.md.
                extends: true,
                test: {
                    name: "integration",
                    environment: "node",
                    include: ["tests/integration/**/*.test.ts"],
                    fileParallelism: false,
                    testTimeout: 120_000,
                },
            },
        ],
    },
});
