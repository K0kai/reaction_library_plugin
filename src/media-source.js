// Shared media rules for Discord context-menu items and downloaded files.

export const MEDIA_EXTENSIONS = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp",
    "video/mp4": ".mp4", "video/webm": ".webm", "audio/mpeg": ".mp3", "audio/ogg": ".ogg",
    "audio/mp4": ".m4a", "audio/wav": ".wav"
};

export function mediaKind(file) {
    const type = file.type ?? "";
    if (type.startsWith("image/") || /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name)) return "image";
    if (type.startsWith("video/") || /\.(?:avi|m4v|mkv|mov|mp4|webm)$/i.test(file.name)) return "video";
    if (type.startsWith("audio/") || /\.(?:aac|flac|m4a|mp3|ogg|opus|wav)$/i.test(file.name)) return "audio";
    return null;
}

export function mediaTypeAllowed(type) {
    return !type || type === "application/octet-stream" || /^(image|video|audio)\//.test(type);
}

export function mediaFilename(filename, type) {
    let name = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 180) || `reaction-${Date.now()}`;
    if (!mediaKind({ name }) && MEDIA_EXTENSIONS[type]) name += MEDIA_EXTENSIONS[type];
    return name;
}

function attachmentKey(value) {
    try {
        const path = new URL(value).pathname;
        const match = path.match(/\/attachments\/\d+\/(\d+)\//);
        return match?.[1] ?? path;
    } catch { return ""; }
}

export function contextMedia(navId, props, baseHref) {
    if (!props || (navId === "image-context" && "href" in props && !props.src)) return null;
    const media = props.target?.closest?.("img,video,audio");
    const candidates = [props.itemSrc, props.src, props.itemHref, props.href, media?.currentSrc, media?.src];
    const candidate = candidates.find(value => typeof value === "string" && mediaKind({ name: value.split("?")[0] }))
        ?? (media && candidates.find(value => typeof value === "string"));
    if (!candidate) return null;
    let url;
    try { url = new URL(candidate, baseHref); } catch { return null; }
    if (url.protocol !== "https:" && url.protocol !== "blob:") return null;
    let filename;
    try { filename = decodeURIComponent(url.pathname.split("/").pop() ?? ""); }
    catch { filename = url.pathname.split("/").pop() ?? ""; }
    filename = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_");
    const key = attachmentKey(candidate);
    const attachment = props.message?.attachments?.find(item =>
        [item.url, item.proxy_url].some(value => value && attachmentKey(value) === key));
    const name = attachment?.filename ?? filename;
    if (!mediaKind({ name }) && !media) return null;
    const urls = [...new Set([attachment?.url, attachment?.proxy_url, url.href].filter(value => typeof value === "string"))];
    return { urls, name };
}

export async function firstDownload(urls, download) {
    let lastError;
    for (const url of urls) {
        try { return await download(url); }
        catch (error) {
            if (/too large|not supported|default save folder/i.test(error.message)) throw error;
            lastError = error;
        }
    }
    throw lastError ?? new Error("This media could not be downloaded.");
}
