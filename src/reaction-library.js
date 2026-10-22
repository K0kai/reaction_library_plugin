/*
 * Reaction Library shared client runtime
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { uploadFile, uploadVoice } from "./discord-sender.js";
import { folderDisplayName, folderPathLabel, uniqueFolderName } from "./folder-identity.js";
import { translate } from "./localization.js";
import { extractVideoAudio, prepareClip, prepareGif } from "./media-conversion.js";
import { contextMedia, firstDownload, mediaFilename, mediaKind, mediaTypeAllowed } from "./media-source.js";
import { prepareVoice } from "./voice-codec.js";

export function createReactionLibrary(host, options = {}) {
    const NAME = "Reaction Library";
    const KEY = "index";
    const FILE = id => `file:${id}`;
    const BUTTON_CLASS = "reaction-library-button";
    const ROOT_CLASS = "reaction-library";
    let root;
    let anchor;
    let entries = [];
    let query = "";
    let filter = "all";
    let sort = "newest";
    let editing = null;
    let previewObserver;
    let previewCleanup = [];
    let visibleLimit = 60;
    let importing = false;
    let loading = false;
    let importProgress;
    let folderFilter = "";
    let removing = false;
    let folderHandles = [];
    let defaultFolder;
    let saveQueue = Promise.resolve();
    const contextPatches = [];
    let accessWarning = false;
    let busy = false;
    let store;
    let renderId = 0;
    let panelSize;
    let playback;
    let playbackId = 0;
    let conversion;
    let lastStatus = "";
    const folderAccess = new Map();

    const css = `
        button.${BUTTON_CLASS} { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--icon-default, var(--interactive-icon-default, var(--interactive-normal, #b5bac1))); cursor: pointer; }
        button.${BUTTON_CLASS} svg { display: block; color: inherit; fill: none; }
        button.${BUTTON_CLASS}:hover { color: var(--icon-strong, var(--interactive-hover, #f2f3f5)); background: var(--background-modifier-hover, #ffffff14); }
        .${ROOT_CLASS} { --rl-text: var(--text-default, var(--text-normal, #f2f3f5)); --rl-muted: var(--text-muted, #aeb3bb); --rl-panel: var(--background-surface-high, var(--background-floating, #232428)); --rl-input: var(--input-background-default, var(--input-background, #16171a)); --rl-border: var(--border-subtle, #ffffff1f); --rl-card: var(--background-surface-higher, var(--background-secondary, #2b2d31)); position: fixed; z-index: 10000; width: min(440px, calc(100vw - 16px)); max-height: min(520px, 70vh); overflow: hidden; display: flex; flex-direction: column; border: 1px solid var(--rl-border); border-radius: 8px; background: var(--rl-panel); color: var(--rl-text); box-shadow: 0 8px 32px #0008; font: 14px/1.4 var(--font-primary, "Segoe UI", sans-serif); color-scheme: dark; }
        .theme-light .${ROOT_CLASS} { color-scheme: light; }
        .${ROOT_CLASS} * { box-sizing: border-box; }
        .${ROOT_CLASS} header { margin: 0; padding: 12px 14px; color: var(--rl-text); font-size: 15px; font-weight: 700; border-bottom: 1px solid var(--rl-border); }
        .${ROOT_CLASS} .rl-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
        .${ROOT_CLASS} input, .${ROOT_CLASS} select { display: block; min-width: 0; height: 36px; margin: 0; padding: 7px 10px; border: 1px solid var(--rl-border); border-radius: 5px; outline: 0; background: var(--rl-input); color: var(--rl-text); font: inherit; }
        .${ROOT_CLASS} input::placeholder { color: var(--rl-muted); opacity: 1; }
        .${ROOT_CLASS} input[type=search] { grid-column: 1 / -1; width: 100%; appearance: none; }
        .${ROOT_CLASS} input[hidden] { display: none; }
        .${ROOT_CLASS} select { width: 100%; cursor: pointer; }
        .${ROOT_CLASS} select option { background: var(--rl-panel); color: var(--rl-text); }
        .${ROOT_CLASS} input:focus-visible, .${ROOT_CLASS} select:focus-visible, .${ROOT_CLASS} button:focus-visible { outline: 2px solid var(--focus-primary, #7289ff); outline-offset: 1px; }
        .${ROOT_CLASS} .rl-import { margin: 0 10px 10px; align-self: flex-start; }
        .${ROOT_CLASS} button.rl-primary { padding: 7px 12px; border: 0; border-radius: 4px; background: var(--button-filled-brand-background, #5865f2); color: white; font: inherit; font-weight: 600; cursor: pointer; }
        .${ROOT_CLASS} .rl-scroll { min-height: 0; overflow-y: auto; padding: 0 12px 12px; }
        .${ROOT_CLASS} .rl-empty { padding: 38px 12px; color: var(--rl-muted); text-align: center; }
        .${ROOT_CLASS} .rl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .${ROOT_CLASS} .rl-item { min-width: 0; overflow: hidden; border-radius: 5px; background: var(--rl-card); }
        .${ROOT_CLASS} .rl-send { display: flex; position: relative; width: 100%; height: 105px; align-items: center; justify-content: center; overflow: hidden; padding: 0; border: 0; background: var(--rl-input); color: var(--rl-text); cursor: pointer; }
        .${ROOT_CLASS} .rl-send img { width: 100%; height: 100%; object-fit: cover; }
        .${ROOT_CLASS} .rl-send video { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
        .${ROOT_CLASS} .rl-video-badge { position: absolute; top: 5px; right: 5px; padding: 1px 5px; border-radius: 4px; background: #000a; color: white; font-size: 12px; }
        .${ROOT_CLASS} .rl-send .rl-symbol { font-size: 34px; }
        .${ROOT_CLASS} .rl-send strong { position: absolute; right: 0; bottom: 0; left: 0; overflow: hidden; padding: 6px; background: linear-gradient(transparent, #000a); color: white; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
        .${ROOT_CLASS} .rl-tags { display: flex; gap: 4px; padding: 5px; }
        .${ROOT_CLASS} .rl-tags input { flex: 1; width: 0; }
        .${ROOT_CLASS} .rl-edit { width: 100%; overflow: hidden; padding: 7px; border: 0; background: transparent; color: var(--rl-muted); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
        .${ROOT_CLASS} .rl-status { padding: 4px 12px 10px; color: var(--rl-muted); font-size: 12px; }
        .${ROOT_CLASS} .rl-status:empty { display: none; }
        .${ROOT_CLASS} .rl-progress { padding: 0 12px 10px; color: var(--rl-muted); font-size: 12px; }
        .${ROOT_CLASS} .rl-progress:empty { display: none; }
        .${ROOT_CLASS} progress { display: block; width: 100%; height: 6px; margin-top: 6px; accent-color: #7289ff; }
        .${ROOT_CLASS} button:disabled { opacity: .55; cursor: wait; }
        .${ROOT_CLASS} .rl-more { display: block; margin: 12px auto 0; }
        .${ROOT_CLASS} .rl-folders { display: flex; gap: 6px; padding: 0 12px 10px; }
        .${ROOT_CLASS} .rl-folders select { flex: 1; min-width: 0; }
        .${ROOT_CLASS} .rl-save-folder { display: flex; align-items: center; gap: 8px; padding: 0 12px 10px; color: var(--rl-muted); font-size: 12px; }
        .${ROOT_CLASS} .rl-save-folder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .${ROOT_CLASS} .rl-remove { border: 0; border-radius: 4px; padding: 5px 7px; background: #f23f431f; color: var(--text-danger, #ff858b); cursor: pointer; }
        .${ROOT_CLASS} .rl-item-footer { display: flex; align-items: center; }
        .${ROOT_CLASS} .rl-item-footer .rl-edit { flex: 1; min-width: 0; }
        .${ROOT_CLASS} > :not(.rl-scroll) { flex-shrink: 0; }
        .${ROOT_CLASS} .rl-scroll { flex: 1; }
        .${ROOT_CLASS} .rl-grid { grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); }
        .${ROOT_CLASS} .rl-resize { position: absolute; top: 0; left: 0; width: 18px; height: 18px; padding: 0; border: 0; background: transparent; color: var(--rl-muted); cursor: nwse-resize; touch-action: none; }
        .${ROOT_CLASS} .rl-resize::after { content: ""; position: absolute; top: 4px; left: 4px; width: 8px; height: 8px; border-top: 2px solid currentColor; border-left: 2px solid currentColor; }
        .${ROOT_CLASS} header { padding-left: 26px; }
        .${ROOT_CLASS} .rl-actions { display: flex; gap: 6px; padding: 5px; flex-wrap: wrap; }
        .${ROOT_CLASS} .rl-actions button { padding: 5px 8px; border: 1px solid var(--rl-border); border-radius: 4px; background: var(--rl-input); color: var(--rl-text); cursor: pointer; }
        .${ROOT_CLASS} .rl-actions .rl-action-preview { border-color: #5865f280; background: #5865f233; color: #c5cbff; }
        .${ROOT_CLASS} .rl-actions .rl-action-send { border-color: #23a55980; background: #23a55933; color: #a8e7c0; }
        .${ROOT_CLASS} .rl-actions .rl-action-voice { border-color: #a970db80; background: #a970db33; color: #e1bcfa; }
        .${ROOT_CLASS} .rl-actions .rl-action-gif { border-color: #e5963280; background: #e5963233; color: #f8cd91; }
        .${ROOT_CLASS} .rl-actions .rl-action-close { border-color: var(--rl-border); background: var(--rl-card); color: var(--rl-muted); }
        .${ROOT_CLASS} .rl-actions button:hover, .${ROOT_CLASS} .rl-remove:hover { filter: brightness(1.2); }
        .${ROOT_CLASS} .rl-options { position: relative; padding: 4px 6px; }
        .${ROOT_CLASS} .rl-options summary { cursor: pointer; padding: 2px 6px; border-radius: 4px; list-style: none; color: var(--rl-muted); text-align: right; font-size: 18px; line-height: 20px; }
        .${ROOT_CLASS} .rl-options summary::-webkit-details-marker { display: none; }
        .${ROOT_CLASS} .rl-options summary:hover, .${ROOT_CLASS} .rl-options[open] summary { background: var(--rl-input); color: var(--rl-text); }
        .${ROOT_CLASS} .rl-options[open] .rl-actions { display: flex; flex-direction: column; gap: 1px; padding: 3px 0 0; }
        .${ROOT_CLASS} .rl-options .rl-actions button { padding: 5px 6px; border: 0; background: transparent; color: var(--rl-text); text-align: left; }
        .${ROOT_CLASS} .rl-options .rl-actions button:hover { background: var(--rl-input); }
        .${ROOT_CLASS} .rl-clip { margin-top: 10px; }
        .${ROOT_CLASS} .rl-clip-track { position: relative; height: 54px; margin: 0 10px; border-radius: 4px; background: repeating-linear-gradient(90deg, #333841 0 16px, #252a33 16px 32px); touch-action: none; cursor: pointer; }
        .${ROOT_CLASS} .rl-clip-selection { position: absolute; top: 0; bottom: 0; border: 2px solid #00c8ee; background: #00c8ee18; pointer-events: none; }
        .${ROOT_CLASS} .rl-clip-playhead { position: absolute; top: -5px; bottom: -5px; width: 2px; background: white; box-shadow: 0 0 3px #000; pointer-events: none; transform: translateX(-50%); }
        .${ROOT_CLASS} .rl-clip-handle { position: absolute; top: 0; bottom: 0; width: 13px; padding: 0; border: 0; border-radius: 4px; background: #00c8ee; color: white; cursor: ew-resize; touch-action: none; transform: translateX(-50%); }
        .${ROOT_CLASS} .rl-clip-handle::after { content: '⋮'; }
        .${ROOT_CLASS} .rl-clip-times { display: flex; justify-content: space-between; margin: 5px 0 8px; color: #00c8ee; font-size: 12px; font-variant-numeric: tabular-nums; }
        .${ROOT_CLASS} .rl-clip-times span:nth-child(2) { color: var(--rl-muted); }
        .${ROOT_CLASS} .rl-clip-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .${ROOT_CLASS} .rl-preview { padding: 10px 12px; border-bottom: 1px solid var(--rl-border); }
        .${ROOT_CLASS} .rl-preview:empty { display: none; }
        .${ROOT_CLASS} .rl-preview video { display: block; width: 100%; max-height: min(220px, 25vh); background: black; }
        .${ROOT_CLASS} .rl-preview audio { display: block; width: 100%; }
        .${ROOT_CLASS} .rl-preview-title { margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .${ROOT_CLASS} .rl-cancel { position: absolute; top: 8px; right: 10px; border: 0; border-radius: 4px; background: var(--rl-input); color: var(--rl-text); padding: 4px 8px; cursor: pointer; }
        .${ROOT_CLASS} .rl-cancel[hidden] { display: none; }
        .${BUTTON_CLASS} { position: relative; display: inline-flex; }
        .${BUTTON_CLASS}.rl-working::after { content: ""; position: absolute; top: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background: #7289ff; }
        .${ROOT_CLASS} .rl-access { max-height: 130px; overflow-y: auto; padding: 8px 12px; border-top: 1px solid var(--rl-border); border-bottom: 1px solid var(--rl-border); color: var(--rl-text); background: var(--rl-card); font-size: 12px; }
        .${ROOT_CLASS} .rl-access:empty { display: none; }
        .${ROOT_CLASS} .rl-access-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; }
        .${ROOT_CLASS} .rl-access-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;

    function vencord() {
        return host ?? globalThis.Vencord;
    }

    function locale() {
        return vencord()?.Webpack?.Common?.LocaleStore?.locale ?? document.documentElement?.lang ?? "en-US";
    }

    function t(message) { return translate(message, locale()); }

    function dataStore() {
        const api = vencord()?.Api?.DataStore;
        if (!api) throw new Error("The client mod is not ready yet. Try opening the library again.");
        store ??= api.createStore("ReactionLibrary", "files");
        return { api, store };
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = t(text).replace(/^([◉♫▧▶] {2})(.+)$/, (_, icon, label) => icon + t(label));
        return node;
    }

    function status(message) {
        lastStatus = message;
        const line = root?.querySelector(".rl-status");
        if (line) line.textContent = t(message);
        syncSendState();
        position();
        if (message) console.info(`[${NAME}] ${message}`);
    }

    function close() {
        renderId++;
        closePlayback();
        clearPreviews();
        root?.remove();
        root = undefined;
        editing = null;
    }

    function syncSendState() {
        const cancel = root?.querySelector(".rl-cancel");
        if (cancel) cancel.hidden = !conversion;
        for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) {
            button.classList.toggle("rl-working", busy);
            button.setAttribute("aria-busy", String(busy));
            button.title = busy && lastStatus ? t(lastStatus) : t(NAME);
        }
    }

    async function load() {
        loading = true;
        updateProgress();
        try {
            if (!importing) {
                const { api, store } = dataStore();
                const cleaned = await cleanupLegacyCopies();
                entries = await api.get(KEY, store) ?? [];
                folderHandles = await api.get("folders", store) ?? [];
                defaultFolder = await api.get("defaultFolder", store) ?? undefined;
                updateSaveFolderLabel();
                await refreshFolderAccess();
                await restoreAccessOnOpen();
                if (!panelSize) {
                    const savedSize = await api.get("panelSize", store);
                    if (savedSize && Number.isFinite(savedSize.width) && Number.isFinite(savedSize.height)) resizePanel(savedSize.width, savedSize.height);
                }
                if (cleaned.count) status(`Removed ${cleaned.count.toLocaleString()} old stored copies. File references were preserved.`);
            }
            render();
        } finally {
            loading = false;
            updateProgress();
        }
    }

    async function cleanupLegacyCopies() {
        const { api, store } = dataStore();
        const marker = "legacy-copies-cleaned-v1";
        return store("readwrite", objectStore => {
            const complete = api.promisifyRequest(objectStore.transaction);
            const deleted = new Set();
            let bytes = 0;
            const checked = objectStore.get(marker);
            checked.onsuccess = () => {
                if (checked.result) return;
                const request = objectStore.openCursor();
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        if (typeof cursor.key === "string" && cursor.key.startsWith("file:") && cursor.value instanceof Blob) {
                            deleted.add(cursor.key.slice(5));
                            bytes += cursor.value.size;
                            cursor.delete();
                        }
                        cursor.continue();
                        return;
                    }
                    const index = objectStore.get(KEY);
                    index.onsuccess = () => {
                        if (deleted.size) objectStore.put((index.result ?? []).filter(entry => !deleted.has(entry.id)), KEY);
                        objectStore.put({ count: deleted.size, bytes, completed: Date.now() }, marker);
                    };
                };
            };
            return complete.then(() => ({ count: deleted.size, bytes }));
        });
    }

    async function pickFolder() {
        if (importing || removing) return;
        const native = vencord()?.Native;
        if (!native && !globalThis.showDirectoryPicker) {
            status("This client version does not support persistent folder references. No files were copied.");
            return;
        }
        let directory;
        try { directory = native ? await native.pickFolder() : await globalThis.showDirectoryPicker({ mode: "read" }); }
        catch (error) { if (error.name !== "AbortError") status(error.message); return; }
        if (!directory) return;
        importing = true;
        importProgress = { total: 0, processed: 0, imported: 0, skipped: 0, failed: 0, scanning: true };
        updateProgress();
        try {
            const files = [];
            async function scan(handle, path) {
                for await (const child of handle.values()) {
                    const childPath = `${path}/${child.name}`;
                    if (child.kind === "directory") await scan(child, childPath);
                    else {
                        files.push({ name: child.name, type: "", path: childPath, handle: child });
                        importProgress.total++;
                        if (files.length % 20 === 0) {
                            updateProgress();
                            await new Promise(resolve => setTimeout(resolve, 0));
                        }
                    }
                }
            }
            if (native) {
                for (const file of directory.files) files.push({ name: file.name, type: "", path: `${directory.name}/${file.relative}`, handle: { kind: "native-file", root: directory.root, relative: file.relative } });
                importProgress.total = files.length;
            } else await scan(directory, directory.name);
            const { api, store } = dataStore();
            const handle = native ? { kind: "native-directory", root: directory.root } : directory;
            folderHandles = [...folderHandles.filter(item => item.name !== directory.name), { name: directory.name, handle }];
            await api.set("folders", folderHandles, store);
            folderAccess.set(directory.name, "granted");
            importProgress.scanning = false;
            await importFolder(files);
        } catch (error) {
            importProgress.error = error.message;
            status(error.message);
        } finally {
            importing = false;
            importProgress.scanning = false;
            updateProgress();
            render();
        }
    }

    function updateSaveFolderLabel() {
        const label = root?.querySelector(".rl-save-folder-label");
        if (label) label.textContent = defaultFolder ? `${t("Save folder")}: ${folderDisplayName(defaultFolder)}` : t("No save folder selected");
    }

    async function chooseSaveFolder() {
        const native = vencord()?.Native;
        if (!native?.pickSaveFolder && !globalThis.showDirectoryPicker) return status("This client version does not support persistent folder references. No files were copied.");
        let selected;
        try { selected = native?.pickSaveFolder ? await native.pickSaveFolder() : await globalThis.showDirectoryPicker({ mode: "readwrite" }); }
        catch (error) { if (error.name !== "AbortError") status(error.message); return; }
        if (!selected) return;
        try {
            const { api, store } = dataStore();
            const saved = await api.get("folders", store) ?? [];
            const handle = native?.pickSaveFolder ? { kind: "native-directory", root: selected.root } : selected;
            const name = await uniqueFolderName(saved, selected.name, handle);
            const folder = { name, handle };
            const next = [...saved.filter(item => item.name !== name), folder];
            await api.setMany([["folders", next], ["defaultFolder", folder]], store);
            folderHandles = next;
            defaultFolder = folder;
            folderAccess.set(name, "granted");
            updateSaveFolderLabel();
            updateFolders();
            status(`${t("Save folder")}: ${folderDisplayName(folder)}`);
        } catch (error) { status(error.message); }
    }

    async function downloadBlob(url, limit, nativeFetch) {
        if (nativeFetch?.fetchFile && url.startsWith("https:")) {
            const result = await nativeFetch.fetchFile(url);
            if (!result?.success || !result.data) throw new Error(result?.error || "This media could not be downloaded.");
            return new Blob([result.data], { type: result.contentType ?? "" });
        }
        const response = await fetch(url, { credentials: "omit" });
        if (!response.ok) throw new Error("This media could not be downloaded.");
        if (Number(response.headers.get("content-length")) > limit) throw new Error("This media is too large to save (256 MiB limit).");
        return response.blob();
    }

    async function saveBrowserFile(folder, blob, name) {
        const extension = name.match(/\.[^.]+$/)?.[0] ?? "";
        const stem = name.slice(0, name.length - extension.length);
        try {
            for (let number = 1; number <= 10000; number++) {
                const candidate = number === 1 ? name : `${stem} (${number})${extension}`;
                let exists = false;
                try { await folder.handle.getFileHandle(candidate); exists = true; }
                catch (error) { if (error.name !== "NotFoundError") throw error; }
                if (exists) continue;
                const handle = await folder.handle.getFileHandle(candidate, { create: true });
                const writer = await handle.createWritable();
                try { await writer.write(blob); await writer.close(); }
                catch (error) { await writer.abort().catch(() => {}); throw error; }
                return { name: candidate, relative: candidate, handle };
            }
        } catch (error) {
            if (error.name === "NotFoundError") throw new Error("The save folder is unavailable. Open Reaction Library and set the save folder again.");
            throw error;
        }
        throw new Error("Could not find an available filename in the save folder.");
    }

    async function saveContextMedia(source) {
        const { api, store } = dataStore();
        const folder = await api.get("defaultFolder", store) ?? defaultFolder;
        if (!folder) throw new Error("Choose a default save folder in Reaction Library first.");
        const native = vencord()?.Native;
        if (!native?.saveMedia) {
            let permission;
            try { permission = await folder.handle.queryPermission({ mode: "readwrite" }); }
            catch (error) {
                if (error.name === "NotFoundError") throw new Error("The save folder is unavailable. Open Reaction Library and set the save folder again.");
                throw error;
            }
            if (permission !== "granted") throw new Error("Save folder access expired. Set the save folder again in Reaction Library.");
        }
        const urls = source.urls ?? [source.url];
        let saved;
        let kind;
        if (native?.downloadMedia && urls.some(url => url.startsWith("https:"))) {
            saved = await firstDownload(urls.filter(url => url.startsWith("https:")), url => native.downloadMedia(folder.handle.root, url, source.name));
            kind = mediaKind({ name: saved.name, type: saved.type });
            if (!kind) throw new Error("The selected file is not supported media.");
            saved.handle = { kind: "native-file", root: folder.handle.root, relative: saved.relative };
        } else {
            const limit = 256 * 1024 * 1024;
            const nativeFetch = globalThis.VencordNative?.pluginHelpers?.FileUpload;
            const blob = await firstDownload(urls, url => downloadBlob(url, limit, nativeFetch));
            if (!blob.size || blob.size > limit) throw new Error(blob.size ? "This media is too large to save (256 MiB limit)." : "This media could not be downloaded.");
            const type = blob.type.split(";")[0];
            if (!mediaTypeAllowed(type)) throw new Error("The selected file is not supported media.");
            const name = mediaFilename(source.name, type);
            kind = mediaKind({ name, type });
            if (!kind) throw new Error("The selected file is not supported media.");
            if (native?.saveMedia) {
                saved = await native.saveMedia(folder.handle.root, name, new Uint8Array(await blob.arrayBuffer()));
                saved.handle = { kind: "native-file", root: folder.handle.root, relative: saved.relative };
            } else {
                saved = await saveBrowserFile(folder, blob, name);
            }
        }
        const latest = await api.get(KEY, store) ?? [];
        const entry = { id: crypto.randomUUID(), name: saved.name, path: `${folder.name}/${saved.relative}`, kind, tags: [], added: Date.now(), reference: true };
        await api.setMany([[FILE(entry.id), saved.handle], [KEY, [...latest, entry]]], store);
        entries = [...latest, entry];
        defaultFolder = folder;
        render();
        const message = /^pt/i.test(locale()) ? `${saved.name} adicionado à biblioteca de reações.` : `Added ${saved.name} to Reaction Library.`;
        status(message);
        vencord()?.Webpack?.Common?.showToast?.({ text: message, variant: "success" });
    }

    function queueContextSave(source) {
        const job = saveQueue.then(() => saveContextMedia(source));
        saveQueue = job.catch(() => {});
        void job.catch(error => {
            status(error.message);
            vencord()?.Webpack?.Common?.showToast?.({ text: t(error.message), variant: "critical" });
        });
    }

    function attachContextMenus() {
        if (contextPatches.length) return;
        const common = vencord()?.Webpack?.Common;
        const api = vencord()?.Api?.ContextMenu;
        if (!api || !common?.Menu?.MenuItem || !common?.React?.createElement) return;
        const addItem = (navId, children, props) => {
            const source = contextMedia(navId, props, location.href);
            if (!source) return;
            children.push(common.React.createElement(common.Menu.MenuItem, {
                id: "reaction-library-add-media",
                label: t("Add to reaction library"),
                action: () => queueContextSave(source)
            }));
        };
        if (api.addGlobalContextMenuPatch && api.removeGlobalContextMenuPatch) {
            const patch = (navId, children, props) => addItem(navId, children, props);
            api.addGlobalContextMenuPatch(patch);
            contextPatches.push(() => api.removeGlobalContextMenuPatch(patch));
            return;
        }
        if (!api.addContextMenuPatch) return;
        for (const navId of ["message", "image-context", "audio-context"]) {
            const patch = (children, props) => addItem(navId, children, props);
            api.addContextMenuPatch(navId, patch);
            contextPatches.push(() => api.removeContextMenuPatch?.(navId, patch));
        }
    }

    async function importFolder(files) {
        const { api, store } = dataStore();
        updateProgress();
        const byPath = new Map(entries.map(entry => [entry.path, entry]));
        let batch = [];
        async function commit() {
            if (!batch.length) return;
            const next = new Map(entries.map(entry => [entry.id, entry]));
            for (const { entry } of batch) next.set(entry.id, entry);
            try {
                await api.setMany([...batch.map(({ entry, file }) => [FILE(entry.id), file.handle]), [KEY, [...next.values()]]], store);
                entries = [...next.values()];
                importProgress.imported += batch.length;
                batch.forEach(({ entry }) => byPath.set(entry.path, entry));
                render();
            } catch (error) {
                importProgress.failed += batch.length;
                importProgress.error = error instanceof Error ? error.message : "Storage write failed.";
                throw error;
            } finally {
                batch = [];
                updateProgress();
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        try {
            for (const file of files) {
                const kind = mediaKind(file);
                importProgress.processed++;
                if (!kind) {
                    importProgress.skipped++;
                    continue;
                }
                const { path } = file;
                const existing = byPath.get(path);
                const entry = { ...(existing ?? { id: crypto.randomUUID(), tags: [], added: Date.now() }), name: file.name, path, kind, reference: true };
                batch.push({ entry, file });
                if (batch.length >= 20) await commit();
            }
            await commit();
        } finally {
            updateProgress();
        }
    }

    function updateProgress() {
        const add = root?.querySelector(".rl-import");
        if (add) add.disabled = importing || loading || removing;
        root?.querySelectorAll(".rl-remove").forEach(button => { button.disabled = importing || removing; });
        const removeFolder = root?.querySelector(".rl-remove-folder");
        if (removeFolder) removeFolder.disabled = !folderFilter || importing || removing;
        const area = root?.querySelector(".rl-progress");
        if (!area) return;
        area.replaceChildren();
        if (loading && !importProgress) {
            area.textContent = t("Loading your library…");
        } else if (importProgress) {
            const p = importProgress;
            const prefix = p.scanning ? `${t("Scanning folder")} · ${p.total.toLocaleString()} ${t("files found")}` : importing ? `${t("Indexing")} ${p.processed.toLocaleString()} / ${p.total.toLocaleString()}` : p.error ? t("Import stopped") : t("Import complete");
            area.append(element("div", "", `${prefix} · ${p.imported.toLocaleString()} ${t("referenced")}${p.skipped ? ` · ${p.skipped} ${t("skipped")}` : ""}${p.failed ? ` · ${p.failed} ${t("failed")}` : ""}`));
            if (importing) {
                const progress = element("progress");
                progress.max = Math.max(1, p.total);
                if (!p.scanning) progress.value = p.imported + p.skipped;
                progress.setAttribute("aria-label", t("Folder import progress"));
                area.append(progress);
            }
            if (p.error) area.append(element("div", "", `${t(p.error)} ${t("Previously indexed items are still available.")}`));
        }
        position();
    }

    async function saveTags(entry, value) {
        if (importing || removing) return;
        const { api, store } = dataStore();
        const tags = [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean))];
        entries = entries.map(item => item.id === entry.id ? { ...item, tags } : item);
        await api.set(KEY, entries, store);
        editing = null;
        await render();
    }

    async function sendEntry(entry, format = "file", options = {}) {
        if (busy) return;
        busy = true;
        const initialRoot = root;
        const voice = format === "voice";
        if (format !== "file" || options.clip) conversion = new AbortController();
        const signal = conversion?.signal;
        status(`Sending ${entry.name}…`);
        try {
            const vc = vencord();
            const common = vc?.Webpack?.Common;
            if (!common) throw new Error("The client mod is not ready yet.");
            const channelId = common.SelectedChannelStore.getChannelId();
            const channel = common.ChannelStore.getChannel(channelId);
            if (!channel) throw new Error("Open a chat before sending a reaction.");
            let blob = await readMedia(entry, true);
            signal?.throwIfAborted();
            if (options.clip && !voice) {
                status("Preparing clip…");
                blob = await prepareClip(blob, entry.kind, options.clip, signal, status);
                signal?.throwIfAborted();
            }
            if (voice) {
                if (entry.kind !== "audio" && entry.kind !== "video") throw new Error("Choose audio or video to send as a voice message.");
                if (channel.guild_id && (!common.PermissionStore.can(common.PermissionsBits.SEND_VOICE_MESSAGES, channel) || !common.PermissionStore.can(common.PermissionsBits.SEND_MESSAGES, channel))) throw new Error("You cannot send voice messages in this channel.");
                status("Preparing voice message…");
                const prepared = await prepareVoice(blob, entry.kind === "video", signal, options.clip, { status, extractVideoAudio: (media, abort) => extractVideoAudio(media, abort, status) });
                signal.throwIfAborted();
                conversion = undefined;
                status("Uploading voice message…");
                await uploadVoice(common, channelId, prepared);
                finishSend(entry, initialRoot);
                return;
            }
            if (format === "gif") {
                if (entry.kind !== "video") throw new Error("Choose a video to send as a GIF.");
                blob = await prepareGif(blob, signal, status);
                signal.throwIfAborted();
                conversion = undefined;
                status("Uploading GIF…");
            }
            const baseName = format === "gif" ? entry.name.replace(/\.[^.]+$/, "") + ".gif" : options.clip ? entry.name.replace(/\.[^.]+$/, "") + "-clip.webm" : entry.name;
            const filename = options.spoiler ? `SPOILER_${baseName}` : baseName;
            const file = new File([blob], filename, { type: blob.type });
            await uploadFile(vc, common, channelId, channel, file, options.spoiler);
            finishSend(entry, initialRoot);
        } catch (error) {
            const message = signal?.aborted ? "Conversion cancelled." : error instanceof Error ? error.message : "Could not send this reaction.";
            status(message);
            if (!root) vencord()?.Webpack?.Common?.showToast?.({ text: t(message), variant: "critical" });
        } finally {
            busy = false;
            conversion = undefined;
            syncSendState();
        }
    }

    function finishSend(entry, initialRoot) {
        status(`Sent ${entry.name}.`);
        if (root && root === initialRoot) close();
        else vencord()?.Webpack?.Common?.showToast?.({ text: t(`Sent ${entry.name}.`), variant: "success" });
    }

    function closePlayback() {
        playbackId++;
        if (playback) {
            playback.media.pause();
            playback.media.removeAttribute("src");
            playback.media.load();
            URL.revokeObjectURL(playback.url);
            playback = undefined;
        }
        root?.querySelector(".rl-preview")?.replaceChildren();
    }

    async function previewEntry(entry) {
        closePlayback();
        const current = playbackId;
        try {
            const blob = await readMedia(entry, true);
            if (!root || current !== playbackId) return;
            const area = root.querySelector(".rl-preview");
            const media = element(entry.kind === "video" ? "video" : "audio");
            const url = URL.createObjectURL(blob);
            playback = { media, url };
            media.controls = true;
            media.preload = "metadata";
            media.playsInline = true;
            media.src = url;
            media.addEventListener("error", () => status("Your client cannot play this file's format. You can still send the original file."), { once: true });
            const actions = element("div", "rl-actions");
            for (const [label, className, action] of [
                ["Send file", "rl-action-send", () => void sendEntry(entry)],
                ["Send as spoiler", "", () => void sendEntry(entry, "file", { spoiler: true })],
                ["Send as voice", "rl-action-voice", () => void sendEntry(entry, "voice")],
                ...(entry.kind === "video" ? [["Send as GIF", "rl-action-gif", () => void sendEntry(entry, "gif")]] : []),
                ["Close preview", "rl-action-close", () => { closePlayback(); position(); }]
            ]) {
                const button = element("button", className, label);
                button.type = "button";
                button.addEventListener("click", action);
                actions.append(button);
            }
            area.append(element("div", "rl-preview-title", entry.name), media, actions);
            const clip = element("div", "rl-clip");
            const track = element("div", "rl-clip-track");
            const selection = element("div", "rl-clip-selection");
            const playhead = element("div", "rl-clip-playhead");
            const startHandle = element("button", "rl-clip-handle");
            const endHandle = element("button", "rl-clip-handle");
            const times = element("div", "rl-clip-times");
            const startTime = element("span");
            const durationTime = element("span");
            const endTime = element("span");
            let duration = 0;
            let start = 0;
            let end = 0;
            let playRequested = false;
            let seekTimer;
            const timeLabel = value => `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toFixed(1).padStart(4, "0")}`;
            const updatePlayhead = () => { playhead.style.left = `${duration ? Math.max(0, Math.min(100, media.currentTime / duration * 100)) : 0}%`; };
            const updateClip = () => {
                const left = duration ? start / duration * 100 : 0;
                const right = duration ? end / duration * 100 : 100;
                selection.style.left = `${left}%`;
                selection.style.width = `${right - left}%`;
                startHandle.style.left = `${left}%`;
                endHandle.style.left = `${right}%`;
                startTime.textContent = timeLabel(start);
                durationTime.textContent = timeLabel(end - start);
                endTime.textContent = timeLabel(end);
                startHandle.setAttribute("aria-valuenow", String(start.toFixed(1)));
                endHandle.setAttribute("aria-valuenow", String(end.toFixed(1)));
                updatePlayhead();
            };
            media.addEventListener("loadedmetadata", () => {
                if (!Number.isFinite(media.duration) || media.duration <= 0) return;
                duration = media.duration;
                end = duration;
                for (const handle of [startHandle, endHandle]) handle.setAttribute("aria-valuemax", String(duration));
                updateClip();
            }, { once: true });
            const resumeSelection = () => {
                if (!playRequested || playback?.media !== media || media.seeking) return;
                if (Math.abs(media.currentTime - start) >= 0.025) { media.currentTime = start; return; }
                clearTimeout(seekTimer);
                playRequested = false;
                void media.play().catch(error => status(error.message));
            };
            const playSelection = () => {
                if (!duration || playRequested) return;
                playRequested = true;
                media.pause();
                const needsSeek = media.seeking || Math.abs(media.currentTime - start) >= 0.025;
                if (Math.abs(media.currentTime - start) >= 0.025) media.currentTime = start;
                seekTimer = setTimeout(() => {
                    if (!playRequested) return;
                    playRequested = false;
                    status("The preview could not seek to the clip start. Try playing again.");
                }, 5000);
                if (needsSeek) setTimeout(resumeSelection, 50);
                else resumeSelection();
            };
            media.addEventListener("seeked", () => {
                updatePlayhead();
                resumeSelection();
            });
            media.addEventListener("emptied", () => { playRequested = false; clearTimeout(seekTimer); });
            media.addEventListener("play", () => {
                if (duration && !playRequested && (media.seeking || media.currentTime < start - 0.025 || media.currentTime >= end)) playSelection();
            });
            media.addEventListener("timeupdate", () => {
                if (!duration) return;
                if (!media.paused && !media.seeking && !playRequested) {
                    if (media.currentTime < start - 0.025) playSelection();
                    else if (media.currentTime >= end) media.pause();
                }
                updatePlayhead();
            });
            const moveHandle = (which, value) => {
                if (!duration) return;
                const minimum = Math.min(0.1, duration);
                if (which === "start") start = Math.max(0, Math.min(end - minimum, value));
                else end = Math.min(duration, Math.max(start + minimum, value));
                playRequested = false;
                clearTimeout(seekTimer);
                media.pause();
                if (which === "start" || media.currentTime < start || media.currentTime >= end) media.currentTime = start;
                updateClip();
            };
            for (const [handle, which, label] of [[startHandle, "start", "Clip start"], [endHandle, "end", "Clip end"]]) {
                handle.type = "button";
                handle.setAttribute("aria-label", t(label));
                handle.setAttribute("aria-valuemin", "0");
                handle.addEventListener("pointerdown", event => { event.preventDefault(); handle.setPointerCapture(event.pointerId); });
                handle.addEventListener("pointermove", event => { if (handle.hasPointerCapture(event.pointerId)) { const bounds = track.getBoundingClientRect(); moveHandle(which, (event.clientX - bounds.left) / bounds.width * duration); } });
                handle.addEventListener("keydown", event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveHandle(which, (which === "start" ? start : end) + (event.key === "ArrowRight" ? 0.1 : -0.1)); } });
            }
            track.addEventListener("pointerdown", event => { if (event.target !== track && event.target !== selection) return; const bounds = track.getBoundingClientRect(); const value = (event.clientX - bounds.left) / bounds.width * duration; moveHandle(Math.abs(value - start) < Math.abs(value - end) ? "start" : "end", value); });
            track.append(selection, playhead, startHandle, endHandle);
            times.append(startTime, durationTime, endTime);
            updateClip();
            const clipSend = element("button", "rl-primary", "Send clip");
            clipSend.type = "button";
            clipSend.addEventListener("click", () => void sendEntry(entry, "file", { clip: { start, end } }));
            const clipSpoiler = element("button", "rl-primary", "Send clip as spoiler");
            clipSpoiler.type = "button";
            clipSpoiler.addEventListener("click", () => void sendEntry(entry, "file", { spoiler: true, clip: { start, end } }));
            const clipVoice = element("button", "rl-primary", "Send clip as voice");
            clipVoice.type = "button";
            clipVoice.addEventListener("click", () => void sendEntry(entry, "voice", { clip: { start, end } }));
            const clipActions = element("div", "rl-clip-actions");
            clipActions.append(clipSend, clipSpoiler, clipVoice);
            clip.append(track, times, clipActions);
            area.append(clip);
            position();
        } catch (error) { status(error.message); }
    }

    async function readMedia(entry, request = false) {
        const folderName = entry.path?.split("/")[0];
        if (!request && entry.reference && folderAccess.has(folderName) && folderAccess.get(folderName) !== "granted") {
            const error = new Error("Restore folder access below to load your thumbnails. Your file references are still saved.");
            error.name = "NotAllowedError";
            throw error;
        }
        const { api, store } = dataStore();
        const saved = await api.get(FILE(entry.id), store);
        if (saved instanceof Blob) return saved;
        if (saved?.kind === "native-file") {
            const native = vencord()?.Native;
            if (!native) throw new Error("Desktop file access is unavailable. Restart your client to load the plugin's native helper.");
            const file = await native.readMedia(saved.root, saved.relative);
            return new File([file.data], file.name, { type: file.type });
        }
        if (!saved || saved.kind !== "file") throw new Error("This file is missing. Add its folder again to reconnect it.");
        let permission = await saved.queryPermission({ mode: "read" });
        if (permission !== "granted" && request) permission = await saved.requestPermission({ mode: "read" });
        if (permission !== "granted") {
            folderAccess.set(folderName, permission);
            renderFolderAccess();
            const error = new Error("Restore folder access below to load your thumbnails. Your file references are still saved.");
            error.name = "NotAllowedError";
            throw error;
        }
        return saved.getFile();
    }

    async function refreshFolderAccess() {
        await Promise.all(folderHandles.map(async folder => {
            try { folderAccess.set(folder.name, folder.handle.kind === "native-directory" ? "granted" : await folder.handle.queryPermission({ mode: "read" })); }
            catch { folderAccess.set(folder.name, "unavailable"); }
        }));
        for (const entry of entries) {
            const name = entry.path.split("/")[0];
            if (entry.reference && !folderHandles.some(folder => folder.name === name)) folderAccess.set(name, "unavailable");
        }
        renderFolderAccess();
    }

    function renderFolderAccess() {
        const area = root?.querySelector(".rl-access");
        if (!area) return;
        area.replaceChildren();
        const names = new Set(entries.filter(entry => entry.reference).map(entry => entry.path.split("/")[0]));
        const pending = [...names].filter(name => folderAccess.has(name) && folderAccess.get(name) !== "granted" && (!folderFilter || folderFilter.split("/")[0] === name));
        if (!pending.length) { position(); return; }
        area.append(element("div", "", "Folder access needs to be renewed after restarting your client. Your library and tags are still saved."));
        for (const name of pending) {
            const row = element("div", "rl-access-row");
            const missing = folderAccess.get(name) === "unavailable";
            const button = element("button", "rl-primary", missing ? "Select folder again" : "Restore access");
            button.type = "button";
            button.setAttribute("aria-label", `${t(missing ? "Select" : "Restore access to")} ${name}`);
            button.addEventListener("click", () => void (missing ? pickFolder() : reconnect(name)));
            row.append(element("span", "", name), button);
            area.append(row);
        }
        position();
    }

    async function restoreAccessOnOpen() {
        if (!root || !navigator.userActivation?.isActive) return;
        for (const folder of folderHandles) {
            if (folderAccess.get(folder.name) !== "prompt") continue;
            if (!navigator.userActivation.isActive) break;
            try {
                const permission = await folder.handle.requestPermission({ mode: "read" });
                folderAccess.set(folder.name, permission);
                if (permission !== "granted") break;
            } catch {
                break;
            }
        }
        renderFolderAccess();
    }

    async function reconnect(name = folderFilter.split("/")[0]) {
        if (!name) name = folderHandles.find(folder => folderAccess.get(folder.name) !== "granted")?.name;
        const folder = folderHandles.find(item => item.name === name);
        if (!folder) return status("Select a referenced folder first, or use Add folder to reconnect it.");
        try {
            if (folder.handle.kind === "native-directory") {
                folderAccess.set(folder.name, "granted");
                accessWarning = false;
                render();
                status(`Folder ${folder.name} reconnected.`);
                return;
            }
            const permission = await folder.handle.requestPermission({ mode: "read" });
            folderAccess.set(folder.name, permission);
            renderFolderAccess();
            if (permission !== "granted") return status("Folder access was not granted. Your references and tags are unchanged.");
            await refreshFolderAccess();
            accessWarning = false;
            render();
            status(`Access to ${folder.name} restored. Thumbnails are loading.`);
        } catch (error) { status(error.message); }
    }

    async function removeEntries(items) {
        if (importing || removing || !items.length) return;
        if (!confirm(/^pt/i.test(locale()) ? `Remover ${items.length === 1 ? items[0].name : `${items.length} itens`} da biblioteca? Os arquivos originais no computador não serão alterados.` : `Remove ${items.length === 1 ? items[0].name : `${items.length} items`} from the library? Original files on your computer will stay untouched.`)) return;
        removing = true;
        updateProgress();
        try {
            const ids = new Set(items.map(item => item.id));
            const next = entries.filter(entry => !ids.has(entry.id));
            const roots = new Set(next.filter(entry => entry.reference).map(entry => entry.path.split("/")[0]));
            const nextFolders = folderHandles.filter(folder => roots.has(folder.name));
            const { api, store } = dataStore();
            await store("readwrite", objectStore => {
                items.forEach(entry => objectStore.delete(FILE(entry.id)));
                objectStore.put(next, KEY);
                objectStore.put(nextFolders, "folders");
                return api.promisifyRequest(objectStore.transaction);
            });
            entries = next;
            folderHandles = nextFolders;
            render();
            status(/^pt/i.test(locale()) ? `${items.length} ${items.length === 1 ? "item removido" : "itens removidos"} da biblioteca.` : `${items.length} item${items.length === 1 ? "" : "s"} removed from the library.`);
        } catch (error) { status(error.message); }
        finally { removing = false; updateProgress(); }
    }

    function updateFolders() {
        const select = root?.querySelector(".rl-folder-select");
        if (!select) return;
        const folders = new Set();
        for (const entry of entries) {
            const parts = entry.path.split("/");
            for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/"));
        }
        if (folderFilter && !folders.has(folderFilter)) folderFilter = "";
        select.replaceChildren();
        const knownFolders = defaultFolder ? [...folderHandles, defaultFolder] : folderHandles;
        for (const folder of ["", ...[...folders].sort()]) {
            const option = element("option", "", folder ? folderPathLabel(folder, knownFolders) : "All folders");
            option.value = folder;
            select.append(option);
        }
        select.value = folderFilter;
        const remove = root.querySelector(".rl-remove-folder");
        remove.disabled = !folderFilter || importing || removing;
    }

    function clearPreviews() {
        previewObserver?.disconnect();
        previewCleanup.forEach(cleanup => cleanup());
        previewCleanup = [];
    }

    function observePreviews(cards, scroll, currentRender) {
        let active = 0;
        const queue = [];
        const states = new Map(cards.map(card => [card.button, { ...card, visible: false, queued: false, generation: 0, url: null, media: null }]));
        function release(state) {
            state.generation++;
            if (state.media?.tagName === "VIDEO") {
                state.media.removeAttribute("src");
                state.media.load();
            }
            state.media?.remove();
            state.media = null;
            if (state.url) URL.revokeObjectURL(state.url);
            state.url = null;
            state.symbol.hidden = false;
        }
        async function hydrate(state) {
            const generation = ++state.generation;
            try {
                const blob = await readMedia(state.entry);
                if (!state.visible || generation !== state.generation || currentRender !== renderId) return;
                state.url = URL.createObjectURL(blob);
                const media = element(state.entry.kind === "video" ? "video" : "img");
                state.media = media;
                if (state.entry.kind === "video") {
                    media.muted = true;
                    media.playsInline = true;
                    media.preload = "metadata";
                    media.addEventListener("loadedmetadata", () => {
                        if (Number.isFinite(media.duration) && media.duration > 0) media.currentTime = Math.min(0.2, media.duration / 2);
                    }, { once: true });
                } else {
                    media.alt = "";
                    media.decoding = "async";
                }
                media.addEventListener("error", () => release(state), { once: true });
                media.src = state.url;
                state.symbol.hidden = true;
                state.button.prepend(media);
            } catch (error) {
                if (error.name === "NotAllowedError") {
                    state.symbol.textContent = "🔒";
                    state.button.title = `${state.entry.name} · ${t("Restore folder access to load its thumbnail")}`;
                }
                if (currentRender === renderId && !accessWarning) {
                    accessWarning = true;
                    status(error.message);
                }
            }
        }
        function pump() {
            while (active < 3 && queue.length) {
                const state = queue.shift();
                state.queued = false;
                if (!state.visible || state.url || currentRender !== renderId) continue;
                active++;
                void hydrate(state).finally(() => { active--; pump(); });
            }
        }
        previewObserver = new IntersectionObserver(changes => {
            for (const change of changes) {
                const state = states.get(change.target);
                state.visible = change.isIntersecting;
                if (!state.visible) release(state);
                else if (!state.url && !state.queued) { state.queued = true; queue.push(state); }
            }
            pump();
        }, { root: scroll, rootMargin: "160px" });
        states.forEach(state => {
            previewObserver.observe(state.button);
            previewCleanup.push(() => { state.visible = false; release(state); });
        });
    }

    function render() {
        if (!root) return;
        const currentRender = ++renderId;
        clearPreviews();
        updateFolders();
        renderFolderAccess();
        const scroll = root.querySelector(".rl-scroll");
        const previousScroll = scroll.scrollTop;
        scroll.replaceChildren();
        const shown = entries.filter(entry =>
            (filter === "all" || entry.kind === filter) && (!folderFilter || entry.path.startsWith(`${folderFilter}/`)) &&
            `${entry.name} ${entry.path} ${entry.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())
        ).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "oldest" ? a.added - b.added : b.added - a.added);
        if (!entries.length || !shown.length) {
            scroll.append(element("div", "rl-empty", entries.length ? "No reactions match your search." : "Choose a folder to start your reaction library."));
            position();
            return;
        }
        const grid = element("div", "rl-grid");
        scroll.append(grid);
        const cards = [];
        for (const entry of shown.slice(0, visibleLimit)) {
            if (!root || currentRender !== renderId) return;
            const item = element("div", "rl-item");
            const sendButton = element("button", "rl-send");
            sendButton.type = "button";
            sendButton.title = `${t("Send")} ${entry.name}`;
            sendButton.addEventListener("click", () => void sendEntry(entry));
            const symbol = element("span", "rl-symbol", entry.kind === "video" ? "▶" : entry.kind === "audio" ? "♫" : "▧");
            sendButton.append(symbol);
            if (entry.kind !== "audio") cards.push({ button: sendButton, entry, symbol });
            if (entry.kind === "video") sendButton.append(element("span", "rl-video-badge", "▶"));
            sendButton.append(element("strong", "", entry.name));
            item.append(sendButton);
            {
                const menu = element("details", "rl-options");
                const summary = element("summary", "", "⋯");
                summary.setAttribute("aria-label", `${t("Options for")} ${entry.name}`);
                summary.title = `${t("Options for")} ${entry.name}`;
                const actions = element("div", "rl-actions");
                const spoiler = element("button", "", "◉  Send as spoiler");
                spoiler.type = "button";
                spoiler.addEventListener("click", () => void sendEntry(entry, "file", { spoiler: true }));
                actions.append(spoiler);
                if (entry.kind === "audio" || entry.kind === "video") {
                    if (entry.kind === "audio") {
                        const voice = element("button", "rl-action-voice", "♫  Send as voice");
                        voice.type = "button";
                        voice.addEventListener("click", () => void sendEntry(entry, "voice"));
                        actions.append(voice);
                    }
                    if (entry.kind === "video") {
                        const voice = element("button", "rl-action-voice", "♫  Send as voice");
                        voice.type = "button";
                        voice.addEventListener("click", () => void sendEntry(entry, "voice"));
                        const gif = element("button", "rl-action-gif", "▧  Send as GIF");
                        gif.type = "button";
                        gif.addEventListener("click", () => void sendEntry(entry, "gif"));
                        actions.append(voice, gif);
                    }
                    const preview = element("button", "rl-action-preview", "▶  Preview and trim");
                    preview.type = "button";
                    preview.setAttribute("aria-label", `${t("Preview")} ${entry.name}`);
                    preview.addEventListener("click", () => void previewEntry(entry));
                    actions.append(preview);
                }
                menu.append(summary, actions);
                item.append(menu);
            }
            if (editing === entry.id) {
                const row = element("div", "rl-tags");
                const input = element("input");
                input.placeholder = t("Tags, separated by commas");
                input.value = entry.tags.join(", ");
                input.addEventListener("keydown", event => { if (event.key === "Enter") void saveTags(entry, input.value); });
                const save = element("button", "rl-primary", "Save");
                save.type = "button";
                save.addEventListener("click", () => void saveTags(entry, input.value));
                row.append(input, save);
                item.append(row);
            } else {
                const edit = element("button", "rl-edit", entry.tags.length ? entry.tags.join(", ") : "Add tags");
                edit.type = "button";
                edit.disabled = importing || removing;
                edit.addEventListener("click", () => { editing = entry.id; void render(); });
                const footer = element("div", "rl-item-footer");
                const remove = element("button", "rl-remove", "Remove");
                remove.type = "button";
                remove.disabled = importing || removing;
                remove.setAttribute("aria-label", /^pt/i.test(locale()) ? `Remover ${entry.name} da biblioteca` : `Remove ${entry.name} from library`);
                remove.addEventListener("click", () => void removeEntries([entry]));
                footer.append(edit, remove);
                item.append(footer);
            }
            grid.append(item);
        }
        if (shown.length > visibleLimit) {
            const more = element("button", "rl-primary rl-more", `Show more (${Math.min(visibleLimit, shown.length)} / ${shown.length})`);
            more.type = "button";
            more.addEventListener("click", () => { visibleLimit += 60; render(); });
            scroll.append(more);
        }
        scroll.scrollTop = previousScroll;
        observePreviews(cards, scroll, currentRender);
        position();
    }

    function position() {
        if (!root || !anchor?.isConnected) return;
        if (panelSize) {
            root.style.width = `${Math.min(panelSize.width, Math.max(1, innerWidth - 16))}px`;
            root.style.height = `${Math.min(panelSize.height, Math.max(1, innerHeight - 16))}px`;
            root.style.maxHeight = "calc(100vh - 16px)";
        }
        const rect = anchor.getBoundingClientRect();
        root.style.left = `${Math.max(8, Math.min(rect.right - root.offsetWidth, innerWidth - root.offsetWidth - 8))}px`;
        root.style.top = `${Math.max(8, rect.top - root.offsetHeight - 8)}px`;
    }

    function resizePanel(width, height) {
        panelSize = {
            width: Math.max(Math.min(360, innerWidth - 16), Math.min(width, innerWidth - 16)),
            height: Math.max(Math.min(300, innerHeight - 16), Math.min(height, innerHeight - 16))
        };
        position();
    }

    function savePanelSize() {
        const { api, store } = dataStore();
        void api.set("panelSize", panelSize, store).catch(error => status(error.message));
    }

    async function open(button) {
        if (root) return close();
        visibleLimit = 60;
        accessWarning = false;
        anchor = button;
        root = element("div", ROOT_CLASS);
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-label", t(NAME));
        root.append(element("header", "", NAME));
        const resize = element("button", "rl-resize");
        resize.type = "button";
        resize.title = t("Drag the upper-left corner to resize. Arrow keys also work.");
        resize.setAttribute("aria-label", t("Resize library"));
        let drag;
        resize.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            event.preventDefault();
            drag = { x: event.clientX, y: event.clientY, width: root.offsetWidth, height: root.offsetHeight };
            resize.setPointerCapture(event.pointerId);
        });
        resize.addEventListener("pointermove", event => {
            if (drag) resizePanel(drag.width + drag.x - event.clientX, drag.height + drag.y - event.clientY);
        });
        resize.addEventListener("lostpointercapture", () => {
            if (!drag) return;
            drag = undefined;
            savePanelSize();
        });
        resize.addEventListener("keydown", event => {
            const changes = { ArrowLeft: [20, 0], ArrowRight: [-20, 0], ArrowUp: [0, 20], ArrowDown: [0, -20] };
            const change = changes[event.key];
            if (!change) return;
            event.preventDefault();
            resizePanel(root.offsetWidth + change[0], root.offsetHeight + change[1]);
            savePanelSize();
        });
        root.append(resize);
        const cancel = element("button", "rl-cancel", "Cancel conversion");
        cancel.type = "button";
        cancel.hidden = !conversion;
        cancel.addEventListener("click", () => conversion?.abort());
        root.append(cancel);
        const controls = element("div", "rl-controls");
        const search = element("input");
        search.type = "search";
        search.placeholder = t("Search names, folders, and tags");
        search.setAttribute("aria-label", t("Search reactions"));
        search.value = query;
        search.addEventListener("input", () => { query = search.value; visibleLimit = 60; root.querySelector(".rl-scroll").scrollTop = 0; render(); });
        const type = element("select");
        type.setAttribute("aria-label", t("Type"));
        for (const [value, label] of [["all", "All types"], ["image", "Images and GIFs"], ["video", "Videos"], ["audio", "Audio"]]) {
            const option = element("option", "", label);
            option.value = value;
            type.append(option);
        }
        type.value = filter;
        type.addEventListener("change", () => { filter = type.value; visibleLimit = 60; render(); });
        const order = element("select");
        order.setAttribute("aria-label", t("Sort"));
        for (const [value, label] of [["newest", "Newest"], ["oldest", "Oldest"], ["name", "Name"]]) {
            const option = element("option", "", label);
            option.value = value;
            order.append(option);
        }
        order.value = sort;
        order.addEventListener("change", () => { sort = order.value; void render(); });
        controls.append(search, type, order);
        root.append(controls);
        const add = element("button", "rl-primary rl-import", "Add folder");
        add.type = "button";
        add.addEventListener("click", () => void pickFolder());
        const folders = element("div", "rl-folders");
        const folderSelect = element("select", "rl-folder-select");
        folderSelect.setAttribute("aria-label", t("Library folder"));
        folderSelect.addEventListener("change", () => { folderFilter = folderSelect.value; visibleLimit = 60; accessWarning = false; render(); });
        const reconnectButton = element("button", "rl-primary", "Reconnect");
        reconnectButton.type = "button";
        reconnectButton.addEventListener("click", () => void reconnect());
        const removeFolder = element("button", "rl-remove rl-remove-folder", "Remove folder");
        removeFolder.type = "button";
        removeFolder.addEventListener("click", () => {
            if (folderFilter) void removeEntries(entries.filter(entry => entry.path.startsWith(`${folderFilter}/`)));
        });
        folders.append(folderSelect, reconnectButton, removeFolder);
        const saveFolderRow = element("div", "rl-save-folder");
        const saveFolderButton = element("button", "rl-primary", "Set save folder");
        saveFolderButton.type = "button";
        saveFolderButton.addEventListener("click", () => void chooseSaveFolder());
        const saveFolderLabel = element("span", "rl-save-folder-label");
        saveFolderRow.append(saveFolderButton, saveFolderLabel);
        updateSaveFolderLabel();
        const progress = element("div", "rl-progress");
        progress.setAttribute("role", "status");
        progress.setAttribute("aria-live", "polite");
        const access = element("div", "rl-access");
        access.setAttribute("role", "status");
        access.setAttribute("aria-live", "polite");
        root.append(add, folders, saveFolderRow, access, progress, element("div", "rl-preview"), element("div", "rl-scroll"), element("div", "rl-status"));
        updateSaveFolderLabel();
        document.body.append(root);
        if (lastStatus) status(lastStatus);
        else syncSendState();
        position();
        search.focus();
        try { await load(); } catch (error) { status(error.message); }
    }

    function mount() {
        const nextLocaleStore = vencord()?.Webpack?.Common?.LocaleStore;
        if (nextLocaleStore !== localeStore) {
            localeStore?.removeChangeListener?.(refreshLocale);
            localeStore = nextLocaleStore;
            localeStore?.addChangeListener?.(refreshLocale);
        }
        refreshLocale();
        for (const form of document.querySelectorAll("form")) {
            if (!form.querySelector('[role="textbox"][contenteditable="true"], [data-slate-editor="true"]')) continue;
            const host = form.querySelector('[class*="buttons_"]');
            if (!host || host.querySelector(`.${BUTTON_CLASS}`)) continue;
            const button = element("button", BUTTON_CLASS);
            button.type = "button";
            button.title = t(NAME);
            button.setAttribute("aria-label", t(NAME));
            button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="m5 16 5-5 3 3 3-3 3 3" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="8" r="1.5" fill="currentColor"/></svg>';
            button.addEventListener("click", () => void open(button));
            const gif = [...host.querySelectorAll("button")].find(item => /gif/i.test(item.getAttribute("aria-label") ?? ""));
            if (gif) gif.parentElement?.before(button);
            else host.append(button);
        }
        if (root && (!anchor?.isConnected || !document.body.contains(root))) close();
        else position();
        syncSendState();
    }

    let queued = false;
    let frame;
    let style;
    let started = false;
    let localeStore;
    let displayedLocale;
    function refreshLocale() {
        const current = locale();
        if (current === displayedLocale) return;
        displayedLocale = current;
        if (root) {
            const button = anchor;
            close();
            if (button?.isConnected) void open(button);
        }
        if (options.mountButton !== false) for (const button of document.querySelectorAll(`button.${BUTTON_CLASS}`)) {
            button.title = t(NAME);
            button.setAttribute("aria-label", t(NAME));
        }
    }
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        frame = requestAnimationFrame(() => { queued = false; mount(); });
    });
    function attach() {
        style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
        attachContextMenus();
        if (options.mountButton !== false) {
            observer.observe(document.body, { childList: true, subtree: true });
            mount();
        } else {
            localeStore = vencord()?.Webpack?.Common?.LocaleStore;
            localeStore?.addChangeListener?.(refreshLocale);
            refreshLocale();
        }
        document.addEventListener("pointerdown", outsideClick);
        document.addEventListener("keydown", keydown);
        window.addEventListener("resize", position);
    }
    function start() {
        if (started) return;
        started = true;
        if (document.body) attach();
        else document.addEventListener("DOMContentLoaded", attach, { once: true });
    }
    function outsideClick(event) {
        if (root && !root.contains(event.target) && !anchor?.contains(event.target)) close();
    }
    function keydown(event) { if (event.key === "Escape") close(); }
    function stop() {
        started = false;
        for (const removePatch of contextPatches.splice(0)) removePatch();
        localeStore?.removeChangeListener?.(refreshLocale);
        localeStore = undefined;
        conversion?.abort();
        close();
        observer.disconnect();
        if (frame !== undefined) cancelAnimationFrame(frame);
        queued = false;
        document.removeEventListener("DOMContentLoaded", attach);
        document.removeEventListener("pointerdown", outsideClick);
        document.removeEventListener("keydown", keydown);
        window.removeEventListener("resize", position);
        style?.remove();
        if (options.mountButton !== false) document.querySelectorAll(`button.${BUTTON_CLASS}`).forEach(button => button.remove());
    }
    return { start, stop, toggle: open };
}
