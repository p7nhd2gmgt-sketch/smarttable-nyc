import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const maxTextFileBytes = 5 * 1024 * 1024;

const detectors = [
  {
    name: "Stripe secret key",
    pattern: /(?:^|[^A-Za-z0-9_])sk_(?:live|test)_[A-Za-z0-9]{16,}/g
  },
  {
    name: "Resend API key",
    pattern: /(?:^|[^A-Za-z0-9_])re_[A-Za-z0-9_]{20,}/g
  },
  {
    name: "GitHub token",
    pattern: /(?:^|[^A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{20,}/g
  },
  {
    name: "JWT-like credential",
    pattern: /(?:^|[^A-Za-z0-9_])eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g
  },
  {
    name: "Private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  }
];

function repositoryFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", windowsHide: true }
  );
  return output.split("\0").filter(Boolean);
}

function isTextFile(filePath) {
  const size = statSync(filePath).size;
  if (size > maxTextFileBytes) return false;
  const sample = readFileSync(filePath).subarray(0, 8_192);
  return !sample.includes(0);
}

function lineNumberAt(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

const findings = [];
for (const relativePath of repositoryFiles()) {
  const filePath = path.join(root, relativePath);
  if (!isTextFile(filePath)) continue;
  const source = readFileSync(filePath, "utf8");
  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (const match of source.matchAll(detector.pattern)) {
      findings.push({
        file: relativePath.replaceAll("\\", "/"),
        line: lineNumberAt(source, match.index || 0),
        category: detector.name
      });
    }
  }
}

if (findings.length) {
  console.error("Potential credential values detected. Values are intentionally suppressed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.category}]`);
  }
  process.exit(1);
}

console.log(`Repository secret-pattern scan passed (${repositoryFiles().length} files checked).`);
