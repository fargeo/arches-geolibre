module.exports = {
    input: {
        path: "./src/arches_geolibre",
        include: ["**/*.vue", "**/*.ts"],
        exclude: ["**/*.test.ts"],
    },
    output: {
        path: "./src/arches_geolibre/locale",
        potPath: "./messages.pot",
        jsonPath: "./",
        locales: ["en"],
        flat: false,
        linguas: false,
        splitJson: true,
    },
};
