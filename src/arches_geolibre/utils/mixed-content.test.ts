import { isBlockedAsMixedContent } from "@/arches_geolibre/utils/mixed-content.ts";

describe("isBlockedAsMixedContent", () => {
    const webGeoLibre = "https://web.geolibre.app/";

    it("blocks plain-HTTP Arches from an HTTPS page", () => {
        expect(
            isBlockedAsMixedContent("http://arches.example.org", webGeoLibre),
        ).toBe(true);
    });

    it("allows HTTPS Arches, local Arches, and non-HTTPS pages", () => {
        expect(
            isBlockedAsMixedContent("https://arches.example.org", webGeoLibre),
        ).toBe(false);
        expect(
            isBlockedAsMixedContent("http://localhost:8002", webGeoLibre),
        ).toBe(false);
        expect(
            isBlockedAsMixedContent(
                "http://arches.example.org",
                "tauri://localhost/",
            ),
        ).toBe(false);
    });

    it("ignores a URL that's still being typed", () => {
        expect(isBlockedAsMixedContent("arches.exa", webGeoLibre)).toBe(false);
    });
});
