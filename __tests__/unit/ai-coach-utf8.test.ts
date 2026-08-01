import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src", "lib", "ai-coach");
// These pairs are typical UTF-8-as-Windows-1252 mojibake signatures for Arabic.
const MOJIBAKE = ["\u0637\u00a7", "\u0638\u2026", "\u0637\u00a8", "\u0638\u201e"];

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

describe("AI Coach source encoding", () => {
  it("reads AI Coach source as UTF-8 without common Arabic mojibake signatures", () => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const files = collectTypeScriptFiles(ROOT);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = decoder.decode(readFileSync(file));
      for (const signature of MOJIBAKE) {
        expect(source, `${file} contains a mojibake signature`).not.toContain(signature);
      }
    }
  });
});
