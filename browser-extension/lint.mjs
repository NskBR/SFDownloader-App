import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const project = dirname(root);
const webExt = join(project, "node_modules", "web-ext", "bin", "web-ext.js");
const sourceDir = join(root, "dist", "firefox");

execFileSync(process.execPath, [webExt, "lint", "--source-dir", sourceDir], {
  stdio: "inherit",
  env: { ...process.env, NO_UPDATE_NOTIFIER: "1" },
});
