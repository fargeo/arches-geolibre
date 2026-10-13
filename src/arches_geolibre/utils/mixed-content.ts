const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Browsers block an HTTPS page, such as GeoLibre on the web, from calling a
 * plain-HTTP address. Loopback addresses are exempt, so a local Arches works.
 */
export function isBlockedAsMixedContent(
    instanceUrl: string,
    pageUrl: string,
): boolean {
    try {
        const instance = new URL(instanceUrl);
        return (
            new URL(pageUrl).protocol === "https:" &&
            instance.protocol === "http:" &&
            !LOOPBACK_HOSTS.has(instance.hostname)
        );
    } catch {
        return false;
    }
}
