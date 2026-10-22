const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const source = readFileSync(require("node:path").join(__dirname, "../src/reaction-library.js"), "utf8");

function section(from, to) {
    return source.slice(source.indexOf(from), source.indexOf(to));
}

test("interface language follows Discord's locale with English fallback", () => {
    let selected = "pt-BR";
    const context = vm.createContext({ vencord: () => ({ Webpack: { Common: { LocaleStore: { get locale() { return selected; } } } } }), document: { documentElement: { lang: "en-US" } } });
    vm.runInContext(section("    const portuguese =", "    function dataStore(") + "globalThis.translate = t;", context);
    assert.equal(context.translate("Send clip as voice"), "Enviar trecho como voz");
    assert.equal(context.translate("Sent reaction.mp4."), "reaction.mp4 enviado.");
    selected = "pt-PT";
    assert.equal(context.translate("Add folder"), "Adicionar pasta");
    selected = "fr";
    assert.equal(context.translate("Add folder"), "Add folder");
});

function importer(failAt = Infinity) {
    const records = new Map();
    let writes = 0;
    let updates = 0;
    let renders = 0;
    const context = vm.createContext({
        Error,
        entries: [], KEY: "index", FILE: id => `file:${id}`,
        importProgress: { total: 1200, processed: 0, imported: 0, skipped: 0, failed: 0 },
        crypto: require("node:crypto").webcrypto,
        setTimeout: callback => callback(),
        updateProgress: () => updates++, render: () => renders++,
        dataStore: () => ({ store: null, api: { async setMany(pairs) {
            if (++writes === failAt) throw new Error("Storage unavailable");
            pairs.forEach(([key, value]) => records.set(key, value));
        } } })
    });
    vm.runInContext(section("    function mediaKind(", "    function element(") + section("    async function importFolder(", "    function updateProgress(") + "globalThis.run = importFolder;", context);
    return { context, records, stats: () => ({ writes, updates, renders }) };
}

const files = () => Array.from({ length: 1200 }, (_, i) => ({
    name: `${i}.mp4`, path: `Large folder/${i}.mp4`, type: "", handle: { kind: "file", name: `${i}.mp4` }
}));

test("1,200 file references commit progressively without reading or copying media", async () => {
    const harness = importer();
    harness.context.entries = [{ id: "tagged", path: "Large folder/0.mp4", name: "0.mp4", kind: "video", tags: ["favorite"], added: 1 }];
    await harness.context.run(files());
    assert.equal(harness.context.entries.length, 1200);
    assert.equal(harness.context.entries[0].id, "tagged");
    assert.deepEqual(harness.context.entries[0].tags, ["favorite"]);
    assert.equal(harness.records.get("file:tagged").kind, "file");
    assert.equal(harness.context.entries[0].reference, true);
    assert.equal(harness.context.importProgress.imported, 1200);
    assert.equal(harness.stats().writes, 60);
    assert.equal(harness.stats().renders, 60);
    assert.ok(harness.stats().updates >= 60);
});

test("an interrupted import preserves committed batches and reports the failure", async () => {
    const harness = importer(3);
    await assert.rejects(harness.context.run(files()), /Storage unavailable/);
    assert.equal(harness.records.get("index").length, 40);
    assert.equal(harness.context.entries.length, 40);
    assert.equal(harness.context.importProgress.imported, 40);
    assert.equal(harness.context.importProgress.failed, 20);
    assert.equal(harness.context.importProgress.error, "Storage unavailable");
});

test("previews read only intersecting items, limit concurrent reads, and release videos", async () => {
    const pending = [];
    const revoked = [];
    let observer;
    function node(tag) {
        return { tagName: tag.toUpperCase(), addEventListener() {}, removeAttribute() {}, load() { this.released = true; }, remove() {} };
    }
    const cards = Array.from({ length: 1200 }, () => ({ button: { prepend(media) { this.media = media; } }, entry: { kind: "video" }, symbol: { hidden: false } }));
    const context = vm.createContext({
        renderId: 1, previewCleanup: [], accessWarning: false,
        element: node, status() {},
        URL: { createObjectURL: () => `blob:${Math.random()}`, revokeObjectURL: url => revoked.push(url) },
        readMedia: () => new Promise(resolve => pending.push(resolve)),
        IntersectionObserver: class { constructor(callback) { this.callback = callback; observer = this; } observe() {} }
    });
    vm.runInContext(section("    function observePreviews(", "    function render(") + "globalThis.run = observePreviews;", context);
    context.run(cards, {}, 1);
    assert.equal(pending.length, 0);
    observer.callback(cards.slice(0, 5).map(card => ({ target: card.button, isIntersecting: true })));
    assert.equal(pending.length, 3);
    pending.splice(0).forEach(resolve => resolve({}));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pending.length, 2);
    assert.equal(cards[0].button.media.tagName, "VIDEO");
    observer.callback([{ target: cards[0].button, isIntersecting: false }]);
    assert.equal(cards[0].button.media.released, true);
    assert.equal(revoked.length, 1);
    context.previewCleanup.forEach(cleanup => cleanup());
    pending.splice(0).forEach(resolve => resolve({}));
    await new Promise(resolve => setImmediate(resolve));
});

test("library removal deletes index records and handles without touching originals", async () => {
    const removed = [];
    const records = new Map();
    const originalHandle = { remove() { throw new Error("Original must never be deleted"); } };
    const item = { id: "one", path: "Folder/a.mp4", reference: true, name: "a.mp4", handle: originalHandle };
    const context = vm.createContext({
        importing: false, removing: false, entries: [item], folderHandles: [{ name: "Folder", handle: originalHandle }],
        KEY: "index", FILE: id => `file:${id}`, confirm: () => true, locale: () => "en-US", updateProgress() {}, render() {}, status() {},
        dataStore: () => ({ api: { promisifyRequest: async () => {} }, store: async (_mode, callback) => callback({
            delete: key => removed.push(key), put: (value, key) => records.set(key, value), transaction: {}
        }) })
    });
    vm.runInContext(section("    async function removeEntries(", "    function updateFolders(") + "globalThis.run = removeEntries;", context);
    await context.run([item]);
    assert.deepEqual(removed, ["file:one"]);
    assert.equal(records.get("index").length, 0);
    assert.equal(records.get("folders").length, 0);
    assert.equal(context.removing, false);
});

test("legacy cleanup removes only copied media, including orphans, preserving handles and tags", async () => {
    const fileHandle = { kind: "file", name: "reference.mp4" };
    const folderHandle = { kind: "directory", name: "Folder" };
    const records = new Map([
        ["file:copy", new Blob(["old copied bytes"])],
        ["file:orphan", new File(["unfinished import"], "orphan.png")],
        ["file:reference", fileHandle],
        ["folders", [{ name: "Folder", handle: folderHandle }]],
        ["unrelated", new Blob(["leave this alone"])],
        ["index", [{ id: "copy", tags: ["old"] }, { id: "reference", reference: true, tags: ["favorite"] }]]
    ]);
    let cursorVisits = 0;
    const transaction = {};
    const objectStore = {
        transaction,
        get(key) {
            const request = {};
            queueMicrotask(() => { request.result = records.get(key); request.onsuccess(); });
            return request;
        },
        put: (value, key) => records.set(key, value),
        openCursor() {
            const request = {};
            const pairs = [...records];
            let i = 0;
            function advance() {
                queueMicrotask(() => {
                    const pair = pairs[i++];
                    request.result = pair ? {
                        key: pair[0], value: pair[1],
                        delete: () => records.delete(pair[0]),
                        continue: advance
                    } : null;
                    cursorVisits++;
                    request.onsuccess();
                });
            }
            advance();
            return request;
        }
    };
    const context = vm.createContext({
        Blob, KEY: "index",
        dataStore: () => ({
            api: { promisifyRequest: () => new Promise(resolve => setImmediate(resolve)) },
            store: async (_mode, callback) => callback(objectStore)
        })
    });
    vm.runInContext(section("    async function cleanupLegacyCopies(", "    async function pickFolder(") + "globalThis.run = cleanupLegacyCopies;", context);
    const result = await context.run();
    assert.equal(result.count, 2);
    assert.equal(records.has("file:copy"), false);
    assert.equal(records.has("file:orphan"), false);
    assert.equal(records.get("file:reference"), fileHandle);
    assert.equal(records.get("folders")[0].handle, folderHandle);
    assert.equal(records.has("unrelated"), true);
    assert.equal(records.get("index").length, 1);
    assert.equal(records.get("index")[0].id, "reference");
    assert.deepEqual(records.get("index")[0].tags, ["favorite"]);
    const visits = cursorVisits;
    assert.equal((await context.run()).count, 0);
    assert.equal(cursorVisits, visits);
});

test("voice preparation encodes mono Opus into Ogg with duration and waveform metadata", async () => {
    let config;
    let rejectVideo = false;
    let extractions = 0;
    const samples = new Float32Array(1920).fill(0.25);
    const context = vm.createContext({
        Blob, TextEncoder, TextDecoder, crypto: require("node:crypto").webcrypto,
        btoa: value => Buffer.from(value, "binary").toString("base64"),
        AudioContext: class {
            async decodeAudioData() {
                if (rejectVideo) { rejectVideo = false; throw new Error("Video container requires extraction"); }
                return { duration: 0.04 };
            }
            async close() {}
        },
        status() {},
        extractVideoAudio: async () => { extractions++; return new Blob(["extracted audio"]); },
        OfflineAudioContext: class {
            createBufferSource() { return { connect() {}, start() {} }; }
            async startRendering() { return { getChannelData: () => samples }; }
        },
        AudioData: class { close() {} },
        AudioEncoder: class {
            static async isConfigSupported() { return { supported: true }; }
            constructor(callbacks) { this.callbacks = callbacks; this.encodeQueueSize = 0; }
            configure(value) { config = value; }
            encode() { this.callbacks.output({ byteLength: 3, copyTo: target => target.set([0xf8, 0xff, 0xfe]) }); }
            async flush() { this.encode(); }
            close() {}
        }
    });
    vm.runInContext(section("    function waveform(", "    async function readMedia(") + "globalThis.prepare = prepareVoice; globalThis.page = oggPage;", context);
    const result = await context.prepare(new Blob(["pretend mp3"]));
    assert.equal(config.codec, "opus");
    assert.equal(config.numberOfChannels, 1);
    assert.equal(config.sampleRate, 48000);
    assert.equal(result.blob.type, "audio/ogg; codecs=opus");
    assert.equal(result.duration, 0.04);
    assert.equal(Buffer.from(result.waveform, "base64").length, 32);
    const encoded = Buffer.from(await result.blob.arrayBuffer());
    const pages = [];
    for (let offset = 0; offset < encoded.length;) {
        assert.equal(encoded.toString("ascii", offset, offset + 4), "OggS");
        const count = encoded[offset + 26];
        const length = [...encoded.subarray(offset + 27, offset + 27 + count)].reduce((sum, value) => sum + value, 0);
        pages.push({ flags: encoded[offset + 5], granule: encoded.readBigUInt64LE(offset + 6), packet: encoded.subarray(offset + 27 + count, offset + 27 + count + length) });
        offset += 27 + count + length;
    }
    assert.equal(pages[0].packet.toString("ascii", 0, 8), "OpusHead");
    assert.equal(pages[0].flags, 2);
    assert.equal(pages[1].packet.toString("ascii", 0, 8), "OpusTags");
    assert.equal(pages.at(-1).flags, 4);
    assert.equal(pages.at(-1).granule, 2232n);
    const boundary = context.page(new Uint8Array(255), 2, 960, 4, 1);
    assert.equal(boundary[26], 2);
    assert.equal(boundary[27], 255);
    assert.equal(boundary[28], 0);
    rejectVideo = true;
    const videoVoice = await context.prepare(new Blob(["video container"]), true, new AbortController().signal);
    assert.equal(extractions, 1);
    assert.equal(videoVoice.blob.type, "audio/ogg; codecs=opus");
    assert.equal(videoVoice.duration, 0.04);
});

test("voice upload sends Discord voice flags and clears a reply only after success", async () => {
    const events = [];
    const reply = { messageId: "reply" };
    const common = {
        PendingReplyStore: { getPendingReply: () => reply },
        CloudUploader: class {
            constructor(item, channelId) { assert.equal(item.file.name, "voice-message.ogg"); assert.equal(item.platform, 1); assert.equal(channelId, "channel"); this.listeners = {}; this.uploadedFilename = "uploaded.ogg"; }
            on(name, callback) { this.listeners[name] = callback; }
            async upload() { this.listeners.complete(); }
        },
        RestAPI: { async post(request) { events.push("sent"); assert.equal(request.body.flags, 8192); assert.equal(request.body.attachments[0].duration_secs, 2); assert.equal(request.body.attachments[0].waveform, "wave"); assert.equal(request.body.message_reference.message_id, "reply"); } },
        Constants: { Endpoints: { MESSAGES: id => `/channels/${id}/messages` } },
        SnowflakeUtils: { fromTimestamp: () => "nonce" },
        MessageActions: { getSendMessageOptionsForReply: () => ({ messageReference: { message_id: "reply" } }) },
        FluxDispatcher: { dispatch: () => events.push("reply cleared") }
    };
    const context = vm.createContext({ File });
    vm.runInContext(section("    async function uploadVoice(", "    async function readMedia(") + "globalThis.run = uploadVoice;", context);
    await context.run(common, "channel", { blob: new Blob(["ogg"]), duration: 2, waveform: "wave" });
    assert.deepEqual(events, ["sent", "reply cleared"]);
    events.length = 0;
    common.RestAPI.post = async () => { throw new Error("send rejected"); };
    await assert.rejects(context.run(common, "channel", { blob: new Blob(["ogg"]), duration: 2, waveform: "wave" }), /send rejected/);
    assert.deepEqual(events, []);
});

test("opening a preview does not send, and closing it pauses playback and releases its URL", async () => {
    const preview = { replaceChildren() {}, append(...nodes) { this.nodes = nodes; } };
    const made = [];
    const revoked = [];
    const context = vm.createContext({
        playbackId: 0, playback: undefined,
        root: { querySelector: () => preview },
        position() {}, status() {}, t: value => value,
        readMedia: async () => new Blob(["audio"]),
        sendEntry() { throw new Error("Preview must not send"); },
        URL: { createObjectURL: () => "blob:preview", revokeObjectURL: url => revoked.push(url) },
        element(tag, className, text) {
            const node = { tag, className, text, style: {}, currentTime: 0, append() {}, listeners: {}, addEventListener(name, action) { this.listeners[name] = action; }, setAttribute() {}, pause() { this.paused = true; }, removeAttribute() {}, load() {} };
            made.push(node);
            return node;
        }
    });
    vm.runInContext(section("    function closePlayback(", "    function waveform(") + "globalThis.preview = previewEntry; globalThis.closePreview = closePlayback;", context);
    await context.preview({ kind: "audio", name: "audio.mp3" });
    const audio = made.find(node => node.tag === "audio");
    assert.equal(audio.controls, true);
    assert.equal(audio.autoplay, undefined);
    assert.equal(audio.src, "blob:preview");
    assert.ok(made.some(node => node.text === "Send as voice"));
    audio.duration = 10;
    audio.listeners.loadedmetadata();
    const [startHandle, endHandle] = made.filter(node => node.className === "rl-clip-handle");
    for (let i = 0; i < 10; i++) startHandle.listeners.keydown({ key: "ArrowRight", preventDefault() {} });
    endHandle.listeners.keydown({ key: "ArrowLeft", preventDefault() {} });
    audio.currentTime = 0;
    audio.listeners.play();
    assert.ok(Math.abs(audio.currentTime - 1) < 0.0001);
    audio.currentTime = 10;
    audio.listeners.timeupdate();
    assert.equal(audio.paused, true);
    assert.ok(Math.abs(audio.currentTime - 9.9) < 0.0001);
    const playhead = made.find(node => node.className === "rl-clip-playhead");
    assert.equal(playhead.style.left, "99%");
    context.closePreview();
    assert.equal(audio.paused, true);
    assert.deepEqual(revoked, ["blob:preview"]);
});

test("video GIF conversion produces a decodable animation with timing and releases resources", async () => {
    const requireEquicord = require("node:module").createRequire(require("node:path").join(__dirname, "../../Equicord/package.json"));
    const { GIFEncoder, quantize, applyPalette } = requireEquicord("gifenc");
    const { parseGIF, decompressFrames } = requireEquicord("gifuct-js");
    let disposed = 0;
    const video = { duration: 0.2, videoWidth: 2, videoHeight: 2, currentTime: 0 };
    const canvas = { getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(Array.from({ length: 4 }, () => video.currentTime ? [0, 0, 255, 255] : [255, 0, 0, 255]).flat()) })
    }) };
    const progress = [];
    const context = vm.createContext({
        Blob, GIFEncoder, quantize, applyPalette, setTimeout,
        conversionVideo: async () => ({ video, dispose: () => disposed++ }),
        waitForMedia: async (_video, _event, signal, action) => { signal?.throwIfAborted(); action(); },
        element: () => canvas,
        status: message => progress.push(message)
    });
    vm.runInContext(section("    async function prepareGif(", "    async function extractVideoAudio(") + "globalThis.run = prepareGif;", context);
    const result = await context.run(new Blob(["video"]), new AbortController().signal);
    assert.equal(result.type, "image/gif");
    const frames = decompressFrames(parseGIF(await result.arrayBuffer()), true);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].delay, 100);
    assert.equal(frames[1].delay, 100);
    assert.equal(frames[0].dims.width, 2);
    assert.deepEqual([...frames[0].patch.slice(0, 4)], [255, 0, 0, 255]);
    assert.deepEqual([...frames[1].patch.slice(0, 4)], [0, 0, 255, 255]);
    assert.equal(disposed, 1);
    assert.equal(canvas.width, 0);
    assert.equal(progress.length, 2);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(context.run(new Blob(["video"]), controller.signal), /abort/i);
    assert.equal(disposed, 2);
});

test("video send options upload the selected conversion while main-card send keeps the original", async () => {
    const sent = [];
    const statuses = [];
    let uploads = [{ item: { file: new File(["draft"], "existing.txt") } }];
    const common = {
        SelectedChannelStore: { getChannelId: () => "channel" }, ChannelStore: { getChannel: () => ({}) },
        DraftType: { ChannelMessage: 0 },
        UploadHandler: { async promptToUpload(files) { uploads.push({ item: { file: files[0] } }); } },
        UploadAttachmentStore: { getUploads: () => uploads },
        UploadManager: { setUploads: value => { uploads = value.uploads; } },
        PendingReplyStore: { getPendingReply: () => null }, FluxDispatcher: { dispatch() {} },
        MessageActions: { getSendMessageOptionsForReply: () => ({}) }
    };
    const original = new Blob(["video"], { type: "video/mp4" });
    const clipped = new Blob(["clip"], { type: "video/webm" });
    const context = vm.createContext({
        Blob, File, Error, AbortController,
        busy: false, conversion: undefined, root: undefined, status: message => statuses.push(message), close() {}, syncSendState() {}, finishSend() {},
        vencord: () => ({ Webpack: { Common: common }, Util: { async sendMessage(_id, _data, _wait, options) { sent.push(options.attachmentsToUpload[0].item.file); } } }),
        readMedia: async () => original,
        prepareClip: async (blob, kind, range, signal) => { assert.equal(blob, original); assert.equal(kind, "video"); assert.equal(range.start, 1); assert.equal(range.end, 2); assert.equal(signal.aborted, false); return clipped; },
        prepareGif: async (blob, signal) => { assert.equal(blob, original); assert.equal(signal.aborted, false); return new Blob(["GIF89a"], { type: "image/gif" }); },
        prepareVoice: async (blob, isVideo, signal) => { assert.ok(blob === original || blob === clipped); assert.equal(isVideo, true); assert.equal(signal.aborted, false); return { voice: true, clipped: blob === clipped }; },
        uploadVoice: async (_common, id, prepared) => { assert.equal(id, "channel"); assert.equal(prepared.voice, true); sent.push(prepared.clipped ? "clip voice" : "voice"); }
    });
    vm.runInContext(section("    async function sendEntry(", "    function finishSend(") + "globalThis.run = sendEntry;", context);
    const entry = { kind: "video", name: "reaction.mp4" };
    await context.run(entry, "gif");
    assert.equal(sent[0].name, "reaction.gif");
    assert.equal(sent[0].type, "image/gif");
    await context.run(entry, "voice");
    assert.equal(sent[1], "voice");
    await context.run(entry, "voice", { clip: { start: 1, end: 2 } });
    assert.equal(sent[2], "clip voice", statuses.join(" | "));
    await context.run(entry);
    assert.equal(sent[3].name, "reaction.mp4");
    assert.equal(sent[3].type, "video/mp4");
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].item.file.name, "existing.txt");
});

test("closing the library leaves conversion running, reopening shows progress, and only explicit cancel aborts", async () => {
    function panel() {
        const cancel = { hidden: true };
        const line = { textContent: "" };
        return { cancel, line, querySelector: selector => selector === ".rl-cancel" ? cancel : line, remove() { this.removed = true; } };
    }
    const initial = panel();
    const button = { classList: { toggle() {} }, setAttribute(key, value) { this[key] = value; } };
    const sent = [];
    let selected = "original-channel";
    let resolveConversion;
    let currentSignal;
    let uploads = [];
    const common = {
        SelectedChannelStore: { getChannelId: () => selected }, ChannelStore: { getChannel: () => ({}) },
        DraftType: { ChannelMessage: 0 },
        UploadHandler: { async promptToUpload(files, channel) { uploads.push({ item: { file: files[0] }, channel }); } },
        UploadAttachmentStore: { getUploads: () => uploads },
        UploadManager: { setUploads: value => { uploads = value.uploads; } },
        PendingReplyStore: { getPendingReply: () => null }, FluxDispatcher: { dispatch() {} },
        MessageActions: { getSendMessageOptionsForReply: () => ({}) }, showToast() {}
    };
    const context = vm.createContext({
        Blob, File, Error, AbortController,
        busy: false, conversion: undefined, root: initial, lastStatus: "", renderId: 0, editing: null,
        NAME: "Reaction Library", BUTTON_CLASS: "library-button",
        document: { querySelectorAll: () => [button] }, t: message => message, position() {}, closePlayback() {}, clearPreviews() {},
        vencord: () => ({ Webpack: { Common: common }, Util: { async sendMessage(id) { sent.push(id); } } }),
        readMedia: async () => new Blob(["video"]),
        prepareGif: async (_blob, signal) => {
            currentSignal = signal;
            return new Promise((resolve, reject) => {
                resolveConversion = resolve;
                signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            });
        }
    });
    vm.runInContext(section("    function status(", "    async function load(") + section("    async function sendEntry(", "    function closePlayback(") + "globalThis.run = sendEntry; globalThis.hide = close; globalThis.update = status;", context);
    const entry = { kind: "video", name: "video.mp4" };
    const task = context.run(entry, "gif");
    await new Promise(resolve => setImmediate(resolve));
    context.hide();
    assert.equal(initial.removed, true);
    assert.equal(currentSignal.aborted, false);
    assert.equal(context.busy, true);
    const reopened = panel();
    context.root = reopened;
    context.update("Converting GIF · frame 20 / 50");
    assert.equal(reopened.cancel.hidden, false);
    assert.match(reopened.line.textContent, /frame 20/);
    assert.equal(button["aria-busy"], "true");
    selected = "different-channel";
    resolveConversion(new Blob(["GIF89a"], { type: "image/gif" }));
    await task;
    assert.deepEqual(sent, ["original-channel"]);
    assert.equal(reopened.removed, undefined);
    assert.equal(reopened.cancel.hidden, true);
    assert.equal(button["aria-busy"], "false");
    assert.match(reopened.line.textContent, /^Sent /);
    const cancelled = context.run(entry, "gif");
    await new Promise(resolve => setImmediate(resolve));
    context.conversion.abort();
    await cancelled;
    assert.equal(currentSignal.aborted, true);
    assert.equal(sent.length, 1);
    assert.equal(context.busy, false);
    assert.equal(context.lastStatus, "Conversion cancelled.");
});

test("after restart, expired folder permissions are detected and restored without reimporting", async () => {
    let permission = "prompt";
    let requests = 0;
    let reads = 0;
    let renders = 0;
    const original = new Blob(["original video"], { type: "video/mp4" });
    const entry = { id: "saved", name: "reaction.mp4", path: "Reactions/reaction.mp4", reference: true, tags: ["favorite"] };
    const directory = {
        async queryPermission() { return permission; },
        requestPermission() { requests++; permission = "granted"; return Promise.resolve(permission); }
    };
    const fileHandle = { kind: "file", async queryPermission() { return permission; }, async getFile() { reads++; return original; } };
    const context = vm.createContext({
        Blob, Error, root: undefined, folderFilter: "", folderAccess: new Map(),
        entries: [entry], folderHandles: [{ name: "Reactions", handle: directory }],
        FILE: id => `file:${id}`, accessWarning: true, status() {}, render() { renders++; },
        dataStore: () => ({ api: { get: async key => { assert.equal(key, "file:saved"); return fileHandle; }, set() { throw new Error("Restoring access must not write media or metadata"); } }, store: null })
    });
    vm.runInContext(section("    async function readMedia(", "    async function removeEntries(") + "globalThis.check = refreshFolderAccess; globalThis.read = readMedia; globalThis.restore = reconnect;", context);
    await context.check();
    assert.equal(context.folderAccess.get("Reactions"), "prompt");
    assert.equal(requests, 0);
    await assert.rejects(context.read(entry), error => error.name === "NotAllowedError");
    assert.equal(reads, 0);
    const restored = context.restore("Reactions");
    assert.equal(requests, 1, "permission request must start synchronously from the click");
    await restored;
    assert.equal(context.folderAccess.get("Reactions"), "granted");
    assert.equal(context.accessWarning, false);
    assert.equal(renders, 1);
    assert.equal(await context.read(entry), original);
    assert.equal(reads, 1);
    assert.equal(context.entries[0], entry);
    assert.deepEqual(entry.tags, ["favorite"]);
    permission = "prompt";
    await context.check();
    assert.equal(context.folderAccess.get("Reactions"), "prompt");
    assert.equal(requests, 1, "rechecking permission must not prompt automatically");
});

test("denied folder access leaves references intact and shows a restore button", async () => {
    const entry = { id: "saved", path: "Reactions/reaction.mp4", reference: true, tags: ["favorite"] };
    const area = { nodes: [], replaceChildren() { this.nodes = []; }, append(node) { this.nodes.push(node); } };
    const made = [];
    let requests = 0;
    const context = vm.createContext({
        Blob, Error, root: { querySelector: () => area }, folderFilter: "", folderAccess: new Map(),
        entries: [entry], folderHandles: [{ name: "Reactions", handle: { async queryPermission() { return "denied"; }, requestPermission() { requests++; return Promise.resolve("denied"); } } }],
        status() {}, t: message => message, position() {}, render() { throw new Error("Must not reload previews after access was denied"); },
        element(tag, _className, text) { const node = { tag, text, children: [], append(...nodes) { this.children.push(...nodes); }, setAttribute() {}, addEventListener(event, action) { this[event] = action; } }; made.push(node); return node; }
    });
    vm.runInContext(section("    async function refreshFolderAccess(", "    async function removeEntries(") + "globalThis.check = refreshFolderAccess;", context);
    await context.check();
    const restore = made.find(node => node.text === "Restore access");
    assert.ok(restore);
    restore.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 1);
    assert.equal(context.folderAccess.get("Reactions"), "denied");
    assert.equal(context.entries[0], entry);
    assert.deepEqual(entry.tags, ["favorite"]);
    assert.ok(area.nodes.length);
});

test("opening the library attempts restoration during its user gesture and stops after refusal", async () => {
    const asked = [];
    const permission = new Map([["remembered", "granted"], ["first", "prompt"], ["second", "prompt"], ["last", "prompt"]]);
    const context = vm.createContext({
        root: {}, navigator: { userActivation: { isActive: true } }, folderAccess: permission, renderFolderAccess() {},
        folderHandles: ["remembered", "first", "second", "last"].map(name => ({ name, handle: { async requestPermission() { asked.push(name); return name === "second" ? "denied" : "granted"; } } }))
    });
    vm.runInContext(section("    async function restoreAccessOnOpen(", "    async function reconnect(") + "globalThis.run = restoreAccessOnOpen;", context);
    await context.run();
    assert.deepEqual(asked, ["first", "second"]);
    assert.equal(permission.get("first"), "granted");
    assert.equal(permission.get("second"), "denied");
    assert.equal(permission.get("last"), "prompt");
    context.navigator.userActivation.isActive = false;
    await context.run();
    assert.equal(asked.length, 2);
});
