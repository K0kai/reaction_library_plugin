import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const equicord = resolve(root, "../Equicord");
const require = createRequire(join(equicord, "package.json"));
const ts = require("typescript");
const configPath = join(equicord, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, equicord);
const virtual = join(equicord, "src/userplugins/reactionLibrary/index.tsx");
const source = readFileSync(join(root, "index.tsx"), "utf8");
const host = ts.createCompilerHost({ ...parsed.options, noEmit: true });
const readFile = host.readFile.bind(host);
const fileExists = host.fileExists.bind(host);
host.readFile = path => resolve(path) === virtual ? source : readFile(path);
host.fileExists = path => resolve(path) === virtual || fileExists(path);
const program = ts.createProgram([...parsed.fileNames, virtual], { ...parsed.options, noEmit: true }, host);
const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.file?.fileName === virtual);
if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: path => path,
        getCurrentDirectory: () => equicord,
        getNewLine: () => "\n"
    }));
    process.exitCode = 1;
} else {
    process.stdout.write("Reaction Library type check passed.\n");
}
