/** Normalize backend media URLs to same-origin paths served via Vite/nginx proxy. */
export function resolveMediaUrl(url: string): string {
    if (!url) return url;
    if (url.startsWith("/media/")) return url;
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.pathname.startsWith("/media/")) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
    } catch {
        // keep as-is
    }
    return url;
}
