import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const script = path.join("scripts", "generate-docs.py");
const bundledPython = path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  "python.exe"
);

const candidates = [
  process.env.PYTHON,
  bundledPython,
  "python",
  "python3",
  "py"
].filter(Boolean);

let lastError = "";

for (const candidate of candidates) {
  const args = candidate === "py" ? ["-3", script] : [script];
  const result = spawnSync(candidate, args, { stdio: "inherit", shell: false });
  if (result.status === 0) process.exit(0);
  if (result.error) lastError = result.error.message;
}

console.error("Could not run scripts/generate-docs.py. Install Python with reportlab, pypdf, and pdfplumber, or set PYTHON to a working Python executable.");
if (lastError) console.error(lastError);
process.exit(1);
