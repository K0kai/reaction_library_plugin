/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, dialog } from "electron";
import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const configPath = () => join(app.getPath("userData"), "reaction-library-folders.json");

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
