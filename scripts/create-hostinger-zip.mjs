import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";

const projectRoot = process.cwd();
const outputPath = path.join(projectRoot, "fitzone-hostinger-posix.zip");

const includePaths = [
  "src",
  "prisma",
  "public",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "next-env.d.ts",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "tsconfig.json",
  "components.json",
  "prisma.config.ts",
  ".env.example",
  "DEPLOY_FINAL_CHECKLIST.md",
  "HOSTINGER_DEPLOY.md",
  "eslint.config.mjs",
  ".gitignore",
];

const excludedRelativePaths = new Set([
  "prisma/dev.db",
]);

function shouldExclude(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (excludedRelativePaths.has(normalized)) return true;
  if (normalized === "public/uploads" || normalized.startsWith("public/uploads/")) return true;
  return false;
}

function addPathToArchive(archive, absolutePath, relativePath) {
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  if (shouldExclude(normalizedRelativePath)) return;

  const stats = fs.statSync(absolutePath);

  if (stats.isDirectory()) {
    archive.append("", { name: `${normalizedRelativePath}/`, mode: 0o755 });

    for (const childName of fs.readdirSync(absolutePath)) {
      addPathToArchive(
        archive,
        path.join(absolutePath, childName),
        path.posix.join(normalizedRelativePath, childName),
      );
    }

    return;
  }

  archive.file(absolutePath, {
    name: normalizedRelativePath,
    mode: 0o644,
  });
}

const output = fs.createWriteStream(outputPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`Created: ${outputPath}`);
  console.log(`Bytes: ${archive.pointer()}`);
});

archive.on("warning", (err) => {
  if (err.code === "ENOENT") {
    console.warn(err.message);
    return;
  }
  throw err;
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

for (const relativePath of includePaths) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  addPathToArchive(archive, absolutePath, relativePath);
}

await archive.finalize();
