import { copyFeaturesForArches } from "@/arches_geolibre/utils/copy-features.ts";

describe("copyFeaturesForArches", () => {
    it("copies geometry only, with new ids, skipping what Arches can't store", () => {
        const survey = {
            type: "Feature" as const,
            id: "survey-1",
            geometry: { type: "Point" as const, coordinates: [-0.1, 51.5] },
            properties: { surveyor: "R. Smith" },
        };

        const { copies, skippedCount } = copyFeaturesForArches([
            survey,
            { type: "Feature", geometry: null, properties: {} },
            {
                type: "Feature",
                geometry: { type: "GeometryCollection", geometries: [] },
                properties: {},
            },
        ]);

        expect(skippedCount).toBe(2);
        expect(copies).toHaveLength(1);
        expect(copies[0]).toMatchObject({
            geometry: survey.geometry,
            properties: {},
        });
        expect(copies[0].id).not.toBe("survey-1");
        expect(copies[0].geometry).not.toBe(survey.geometry);
    });
});
