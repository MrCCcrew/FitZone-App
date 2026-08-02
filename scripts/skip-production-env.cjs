const fs = require("fs");
const path = require("path");

if (process.env.FITZONE_TEST_BUILD === "1") {
  const root = path.resolve(process.cwd());
  const blocked = new Set([
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.production"),
    path.join(root, ".env.production.local"),
  ].map((value) => path.resolve(value).toLowerCase()));
  const originalExistsSync = fs.existsSync;
  fs.existsSync = (target) => {
    if (typeof target === "string" && blocked.has(path.resolve(target).toLowerCase())) return false;
    return originalExistsSync(target);
  };
}
