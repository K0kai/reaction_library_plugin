import { createRequire } from "node:module";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(root, "../Equicord/package.json"));
const { build } = require("esbuild");
const gifenc = require.resolve("gifenc");
const gifencSource = await readFile(gifenc, "utf8");
const license = await readFile(join(dirname(dirname(gifenc)), "LICENSE.md"), "utf8").catch(() => readFile(join(dirname(dirname(gifenc)), "LICENSE"), "utf8"));
const gifencPlugin = {
    name: "bundle-gifenc",
    setup(build) {
        build.onResolve({ filter: /^gifenc$/ }, () => ({ path: "gifenc", namespace: "bundled-gifenc" }));
        build.onLoad({ filter: /.*/, namespace: "bundled-gifenc" }, () => ({ contents: gifencSource, loader: "js" }));
    }
};
await build({
    entryPoints: [join(root, "src/dorion-entry.js")],
    outfile: join(root, "dorion/reaction-library.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
    plugins: [gifencPlugin],
    banner: { js: `/* Reaction Library for Dorion. SPDX-License-Identifier: GPL-3.0-or-later\n\nBundled gifenc license:\n${license.replaceAll("*/", "* /")}\n*/` },
    legalComments: "inline"
});
process.stdout.write("Built dorion/reaction-library.js with the GIF encoder included.\n");
await mkdir(join(root, "vencord/reactionLibrary"), { recursive: true });
await build({
    entryPoints: [join(root, "src/reaction-library.js")],
    outfile: join(root, "vencord/reactionLibrary/runtime.js"),
    bundle: true,
    format: "esm",
    target: "chrome120",
    plugins: [gifencPlugin],
    banner: { js: `/* SPDX-License-Identifier: GPL-3.0-or-later\nBundled gifenc license:\n${license.replaceAll("*/", "* /")}\n*/` },
    legalComments: "inline"
});
await copyFile(join(root, "LICENSE"), join(root, "vencord/reactionLibrary/LICENSE"));
process.stdout.write("Built vencord/reactionLibrary/runtime.js with the GIF encoder included.\n");
