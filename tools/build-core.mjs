// Transpile lib/analyze.ts → lib/analyze.mjs so the plain-Node server can import the SAME
// source the Next.js frontend uses (single source of truth, no duplicated logic).
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(here, "..", "lib", "analyze.ts");
const outPath = path.join(here, "..", "lib", "analyze.mjs");

const src = fs.readFileSync(srcPath, "utf8");
const { outputText } = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    importHelpers: false,
    isolatedModules: true,
  },
  fileName: "analyze.ts",
});

const banner = "// AUTO-GENERATED from lib/analyze.ts by tools/build-core.mjs — do not edit by hand.\n";
fs.writeFileSync(outPath, banner + outputText, "utf8");
console.log(`[core] lib/analyze.ts → lib/analyze.mjs (${outputText.length} bytes)`);
