import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(root, "../Equicord/package.json"));
const { build } = require("esbuild");
const gifenc = require.resolve("gifenc");
const license = await readFile(join(dirname(dirname(gifenc)), "LICENSE.md"), "utf8").catch(() => readFile(join(dirname(dirname(gifenc)), "LICENSE"), "utf8"));
await build({
    entryPoints: [join(root, "src/reaction-library.js")],
    outfile: join(root, "dorion/reaction-library.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
    alias: { gifenc },
    banner: { js: `/* Reaction Library for Dorion. SPDX-License-Identifier: GPL-3.0-or-later\n\nBundled gifenc license:\n${license.replaceAll("*/", "* /")}\n*/` },
    legalComments: "inline"
});
process.stdout.write("Built dorion/reaction-library.js with the GIF encoder included.\n");
