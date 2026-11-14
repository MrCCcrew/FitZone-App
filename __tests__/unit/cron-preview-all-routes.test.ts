import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const routes = [
  "cancel-pending-payments",
  "cancel-pending-orders",
  "paymob-auto-recovery",
  "send-reminders",
  "cleanup-voice-sessions",
];

describe("all cron routes preview isolation", () => {
  it.each(routes)("%s blocks preview jobs as first GET statement", (name) => {
    const file = resolve("src/app/api/cron", name, "route.ts");
    const source = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

    expect(ast.statements.length).toBeGreaterThan(0);

    const handler = ast.statements.find(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "GET" &&
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) === true,
    );

    expect(handler?.body).toBeDefined();

    const first = handler!.body!.statements[0];

    expect(ts.isIfStatement(first)).toBe(true);

    if (!ts.isIfStatement(first)) {
      return;
    }

    expect(first.expression.getText(ast)).toBe(
      'process.env.FITZONE_DISABLE_BACKGROUND_JOBS === "1"',
    );

    const branch = first.thenStatement.getText(ast);
    expect(branch).toContain('Background jobs disabled');
    expect(branch).toMatch(/status:\s*403/);
    expect(branch).toMatch(/\breturn\b/);
  });
});