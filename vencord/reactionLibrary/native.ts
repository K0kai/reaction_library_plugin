/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, dialog, net } from "electron";
import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const configPath = () => join(app.getPath("userData"), "reaction-library-folders.json");
const saveConfigPath = () => join(app.getPath("userData"), "reaction-library-save-folder.json");

async function requireSaveFolder(selectedRoot: string) {
    const savedRoot: unknown = JSON.parse(await readFile(saveConfigPath(), "utf8"));
    if (typeof savedRoot !== "string" || selectedRoot !== savedRoot || await realpath(selectedRoot) !== savedRoot) throw new Error("Choose a default save folder in Reaction Library first.");
    return savedRoot;
}

async function allowedFolders(): Promise<string[]> {
    try {
        const value: unknown = JSON.parse(await readFile(configPath(), "utf8"));
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && isAbsolute(item)) : [];
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
        throw error;
    }
}

export async function pickFolder(_: unknown) {
    const selection = await dialog.showOpenDialog({ title: "Add a reaction library folder", properties: ["openDirectory"] });
    if (selection.canceled || !selection.filePaths.length) return null;
    const root = await realpath(selection.filePaths[0]);
    const allowed = await allowedFolders();
    if (!allowed.includes(root)) await writeFile(configPath(), JSON.stringify([...allowed, root]), "utf8");
    const files: { name: string; relative: string; }[] = [];
    async function scan(directory: string) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await scan(path);
            else if (entry.isFile()) files.push({ name: entry.name, relative: relative(root, path).split(sep).join("/") });
        }
    }
    await scan(root);
    return { name: basename(root), root, files };
}

export async function pickSaveFolder(_: unknown) {
    const selection = await dialog.showOpenDialog({ title: "Choose a folder for saved reactions", properties: ["openDirectory"] });
    if (selection.canceled || !selection.filePaths.length) return null;
    const root = await realpath(selection.filePaths[0]);
    const allowed = await allowedFolders();
    if (!allowed.includes(root)) await writeFile(configPath(), JSON.stringify([...allowed, root]), "utf8");
    await writeFile(saveConfigPath(), JSON.stringify(root), "utf8");
    return { name: basename(root), root };
}

export async function saveMedia(_: unknown, selectedRoot: string, filename: string, data: Uint8Array) {
    const savedRoot = await requireSaveFolder(selectedRoot);
    if (!filename || basename(filename) !== filename || /[\\/:*?"<>|\x00-\x1f]/.test(filename) || filename === "." || filename === "..") throw new Error("Invalid media filename.");
    if (!ArrayBuffer.isView(data) || data.BYTES_PER_ELEMENT !== 1 || !data.byteLength) throw new Error("The media file is empty.");
    const extension = extname(filename);
    const stem = filename.slice(0, filename.length - extension.length);
    for (let number = 1; number <= 10000; number++) {
        const candidate = number === 1 ? filename : `${stem} (${number})${extension}`;
        try {
            await writeFile(join(savedRoot, candidate), data, { flag: "wx" });
            return { name: candidate, relative: candidate };
        } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
        }
    }
    throw new Error("Could not find an available filename in the save folder.");
}

export async function downloadMedia(_: unknown, selectedRoot: string, sourceUrl: string, filename: string) {
    await requireSaveFolder(selectedRoot);
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:") throw new Error("This media could not be downloaded.");
    const response = await net.fetch(url.href);
    if (!response.ok || new URL(response.url).protocol !== "https:") throw new Error("This media could not be downloaded.");
    const limit = 256 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > limit) throw new Error("This media is too large to save (256 MiB limit).");
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (type && type !== "application/octet-stream" && !/^(image|video|audio)\//.test(type)) throw new Error("The selected file is not supported media.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!response.body) throw new Error("This media could not be downloaded.");
    for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > limit) throw new Error("This media is too large to save (256 MiB limit).");
        chunks.push(chunk);
    }
    if (!size) throw new Error("This media could not be downloaded.");
    const extensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm", "audio/mpeg": ".mp3", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/wav": ".wav" };
    let name = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 180) || `reaction-${Date.now()}`;
    if (!extname(name) && extensions[type]) name += extensions[type];
    const saved = await saveMedia(null, selectedRoot, name, Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size));
    return { ...saved, type };
}

export async function readMedia(_: unknown, selectedRoot: string, file: string) {
    const allowed = await allowedFolders();
    if (!allowed.includes(selectedRoot)) throw new Error("This folder has not been selected. Add it through Reaction Library first.");
    if (isAbsolute(file)) throw new Error("Only relative library paths are accepted.");
    const path = await realpath(resolve(selectedRoot, file));
    const inside = relative(selectedRoot, path);
    if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error("This file is outside the selected library folder.");
    const types: Record<string, string> = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".bmp": "image/bmp", ".svg": "image/svg+xml",
        ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
        ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".opus": "audio/ogg; codecs=opus", ".wav": "audio/wav", ".flac": "audio/flac", ".aac": "audio/aac"
    };
    return { data: new Uint8Array(await readFile(path)), name: basename(path), type: types[extname(path).toLowerCase()] ?? "application/octet-stream" };
}
