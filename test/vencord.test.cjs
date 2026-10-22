const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createRequire } = require("node:module");
const vm = require("node:vm");
const { test } = require("node:test");
const requireTools = createRequire(path.join(__dirname, "../../Equicord/package.json"));
const { transformSync } = requireTools("esbuild");

test("Vencord runtime starts and stops without injecting a duplicate chat button", () => {
    const documentListeners = new Map();
    const windowListeners = new Map();
    const styles = [];
    const menuPatches = new Map();
    let observes = 0;
    const source = readFileSync(path.join(__dirname, "../src/reaction-library.js"), "utf8");
    const compiled = transformSync(source, { format: "cjs", loader: "js" }).code;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
        module, exports: module.exports, require: requireTools, URL,
        location: { href: "https://discord.com/channels/1/2" },
        document: {
            body: {}, head: { append: style => styles.push(style) },
            createElement: () => ({ remove() { this.removed = true; } }),
            addEventListener: (name, action) => documentListeners.set(name, action),
            removeEventListener: name => documentListeners.delete(name),
            querySelectorAll() { throw new Error("Native mode must use Vencord's chat button API"); }
        },
        window: { addEventListener: (name, action) => windowListeners.set(name, action), removeEventListener: name => windowListeners.delete(name) },
        MutationObserver: class { observe() { observes++; } disconnect() {} }
    });
    const runtime = module.exports.createReactionLibrary({
        Api: { ContextMenu: {
            addContextMenuPatch: (id, patch) => menuPatches.set(id, patch),
            removeContextMenuPatch: id => menuPatches.delete(id)
        } },
        Webpack: { Common: { Menu: { MenuItem: "item" }, React: { createElement: (type, props) => ({ type, props }) } } }
    }, { mountButton: false });
    assert.equal(styles.length, 0);
    runtime.start();
    runtime.start();
    assert.equal(styles.length, 1);
    assert.deepEqual([...menuPatches.keys()], ["message", "image-context"]);
    const items = [];
    menuPatches.get("message")(items, { itemSrc: "https://cdn.discordapp.com/attachments/1/2/clip.mp4" });
    assert.equal(items[0].props.label, "Add to reaction library");
    const unrelated = [];
    menuPatches.get("message")(unrelated, { itemSrc: "https://example.com/page" });
    assert.equal(unrelated.length, 0);
    assert.equal(documentListeners.size, 2);
    assert.equal(windowListeners.size, 1);
    assert.equal(observes, 0);
    runtime.stop();
    assert.equal(menuPatches.size, 0);
    assert.equal(styles[0].removed, true);
    assert.equal(documentListeners.size, 0);
    assert.equal(windowListeners.size, 0);
    runtime.start();
    assert.equal(styles.length, 2);
    runtime.stop();
});

test("native references survive restarts and reject unselected and escaping paths", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "reaction-library-native-"));
    try {
        const userData = path.join(tempRoot, "profile");
        const selected = path.join(tempRoot, "Reactions");
        await fs.mkdir(userData);
        await fs.mkdir(path.join(selected, "subfolder"), { recursive: true });
        const media = Buffer.from("original media bytes");
        await fs.writeFile(path.join(selected, "subfolder", "video.mp4"), media);
        await fs.writeFile(path.join(tempRoot, "outside.mp4"), "not selected");
        const source = readFileSync(path.join(__dirname, "../vencord/reactionLibrary/native.ts"), "utf8");
        const compiled = transformSync(source, { format: "cjs", loader: "ts" }).code;
        let cancelled = true;
        function nativeModule() {
            const module = { exports: {} };
            vm.runInNewContext(compiled, {
                module, exports: module.exports, URL, Buffer,
                require: name => name === "electron" ? {
                    app: { getPath: () => userData },
                    dialog: { showOpenDialog: async () => ({ canceled: cancelled, filePaths: cancelled ? [] : [selected] }) },
                    net: { fetch: async url => {
                        const response = new Response(media, { headers: { "content-type": "video/mp4" } });
                        Object.defineProperty(response, "url", { value: url });
                        return response;
                    } }
                } : require(name)
            });
            return module.exports;
        }
        const native = nativeModule();
        assert.equal(await native.pickFolder(null), null);
        cancelled = false;
        const picked = await native.pickFolder(null);
        assert.equal(picked.name, "Reactions");
        assert.equal(picked.files.length, 1);
        assert.equal(picked.files[0].relative, "subfolder/video.mp4");
        const afterRestart = nativeModule();
        const read = await afterRestart.readMedia(null, picked.root, "subfolder/video.mp4");
        assert.equal(read.type, "video/mp4");
        assert.deepEqual(Buffer.from(read.data), media);
        await assert.rejects(afterRestart.readMedia(null, tempRoot, "outside.mp4"), /has not been selected/);
        await assert.rejects(afterRestart.readMedia(null, picked.root, "../outside.mp4"), /outside the selected/);
        await assert.rejects(afterRestart.readMedia(null, picked.root, path.join(tempRoot, "outside.mp4")), /relative library paths/);
        assert.equal((await fs.readdir(userData)).length, 1);
        const remembered = JSON.parse(await fs.readFile(path.join(userData, "reaction-library-folders.json"), "utf8"));
        assert.deepEqual(remembered, [picked.root]);
        assert.deepEqual(await fs.readFile(path.join(selected, "subfolder", "video.mp4")), media);
        const saveFolder = await afterRestart.pickSaveFolder(null);
        assert.equal(saveFolder.root, picked.root);
        const savedOnce = await afterRestart.saveMedia(null, picked.root, "clip.mp4", new Uint8Array(media));
        const savedTwice = await nativeModule().saveMedia(null, picked.root, "clip.mp4", new Uint8Array(media));
        assert.equal(savedOnce.name, "clip.mp4");
        assert.equal(savedTwice.name, "clip (2).mp4");
        assert.deepEqual(await fs.readFile(path.join(selected, savedOnce.relative)), media);
        const downloaded = await afterRestart.downloadMedia(null, picked.root, "https://cdn.discordapp.com/attachments/1/2/remote.mp4", "remote.mp4");
        assert.equal(downloaded.name, "remote.mp4");
        assert.deepEqual(await fs.readFile(path.join(selected, downloaded.relative)), media);
        await assert.rejects(afterRestart.saveMedia(null, tempRoot, "bad.mp4", new Uint8Array(media)), /default save folder/);
        await assert.rejects(afterRestart.saveMedia(null, picked.root, "../bad.mp4", new Uint8Array(media)), /Invalid media filename/);
    } finally {
        const resolvedTemp = await fs.realpath(tempRoot);
        const allowedTemp = await fs.realpath(os.tmpdir());
        assert.ok(resolvedTemp.startsWith(allowedTemp + path.sep));
        assert.ok(path.basename(resolvedTemp).startsWith("reaction-library-native-"));
        await fs.rm(resolvedTemp, { recursive: true, force: true });
    }
});
