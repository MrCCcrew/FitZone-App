import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { TextDecoder } from "node:util";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "prisma", "scripts", "public", "__tests__", "tests"];
const ROOT_FILES = [
  "package.json",
  "next.config.ts",
  "tailwind.config.ts",
  "tsconfig.json",
  "middleware.ts",
];
const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".sql", ".css", ".html",
]);

// Add only reviewed, documented exceptions. The scanner remains read-only.
const ALLOWLIST = new Map();
const replacementCharacter = String.fromCodePoint(0xfffd);

const mojibakePatterns = [
  /(?:\u00c3.|\u00c2.|\u00e2\u20ac.|\u00ef\u00bf\u00bd)/u,
  /(?:\u0637[\u0622\u00a3\u00a5\u00a2\u00a9\u00a7\u0661]|\u0638[\u0661])/u,
  /(?:\u0623\u00a2\u00e2\u201a\u00ac(?:\u00e2\u20ac\u0153|\u00e2\u20ac\u200c|\u0625\u201c)?)/u,
];

function collectFiles(directory, files) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
    } else if (TEXT_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function report(file, line, message) {
  const key = `${relative(ROOT, file)}:${line}:${message}`;
  if (!ALLOWLIST.has(key)) {
    console.error(`${relative(ROOT, file)}:${line} ${message}`);
    return true;
  }
  return false;
}

const files = [];
for (const directory of SOURCE_ROOTS) collectFiles(join(ROOT, directory), files);
for (const file of ROOT_FILES) {
  const fullPath = join(ROOT, file);
  try {
    if (statSync(fullPath).isFile()) files.push(fullPath);
  } catch {
    // Optional root configuration file.
  }
}

let hasProblems = false;
const decoder = new TextDecoder("utf-8", { fatal: true });
for (const file of files) {
  const bytes = readFileSync(file);
  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    hasProblems = report(file, 1, "is not valid UTF-8") || hasProblems;
    continue;
  }

  const replacementIndex = text.indexOf(replacementCharacter);
  if (replacementIndex !== -1) {
    hasProblems = report(file, lineNumber(text, replacementIndex), "contains a Unicode replacement character") || hasProblems;
  }

  for (const pattern of mojibakePatterns) {
    const match = pattern.exec(text);
    if (match) {
      hasProblems = report(file, lineNumber(text, match.index), "contains a likely mojibake sequence") || hasProblems;
    }
  }
}

if (hasProblems) process.exitCode = 1;
else console.log(`Encoding check passed (${files.length} UTF-8 text files scanned).`);
