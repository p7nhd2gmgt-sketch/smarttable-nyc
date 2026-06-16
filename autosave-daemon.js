import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(__filename);
const backupRoot = path.join(projectRoot, "backups");
const pidPath = path.join(projectRoot, ".autosave.pid");
const heartbeatPath = path.join(projectRoot, ".autosave.heartbeat");
const logPath = path.join(projectRoot, "autosave.log");

const intervalArgIndex = process.argv.indexOf("--interval");
const intervalSeconds = intervalArgIndex >= 0 ? Number(process.argv[intervalArgIndex + 1]) : 30;
const intervalMs = Math.max(5, Number.isFinite(intervalSeconds) ? intervalSeconds : 30) * 1000;

const excludedNames = new Set(["backups", ".autosave.pid", ".autosave.heartbeat", "autosave.log"]);

function timestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

function archiveTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("") + "-" + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
}

async function log(message) {
  await appendFile(logPath, `${timestamp()} ${message}\n`, "utf8");
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (excludedNames.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function fileHash(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function projectSignature() {
  const files = (await listFiles(projectRoot)).sort();
  const rows = [];

  for (const filePath of files) {
    const info = await stat(filePath);
    const relative = path.relative(projectRoot, filePath);
    rows.push(`${relative}|${info.size}|${await fileHash(filePath)}`);
  }

  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

async function copySnapshot(reason) {
  await mkdir(backupRoot, { recursive: true });
  const snapshotName = `smarttable-${archiveTimestamp()}-${reason}`;
  const snapshotPath = path.join(backupRoot, snapshotName);

  await cp(projectRoot, snapshotPath, {
    recursive: true,
    filter: (source) => {
      const name = path.basename(source);
      return !excludedNames.has(name);
    }
  });

  await writeFile(
    path.join(backupRoot, "latest.txt"),
    [
      `createdAt=${timestamp()}`,
      `reason=${reason}`,
      `archive=${snapshotPath}`
    ].join("\n"),
    "utf8"
  );

  await log(`saved snapshot=${snapshotPath}`);
  return snapshotPath;
}

async function heartbeat() {
  await writeFile(heartbeatPath, timestamp(), "utf8");
}

async function main() {
  await mkdir(backupRoot, { recursive: true });
  await writeFile(
    pidPath,
    [
      `pid=${process.pid}`,
      `startedAt=${timestamp()}`,
      `intervalSeconds=${Math.round(intervalMs / 1000)}`
    ].join("\n"),
    "utf8"
  );
  await log(`started pid=${process.pid} intervalSeconds=${Math.round(intervalMs / 1000)}`);

  let lastSignature = await projectSignature();
  await heartbeat();

  setInterval(async () => {
    try {
      await heartbeat();
      const currentSignature = await projectSignature();
      if (currentSignature !== lastSignature) {
        await copySnapshot("autosave");
        lastSignature = await projectSignature();
      }
    } catch (error) {
      await log(`error=${error.message}`);
    }
  }, intervalMs);
}

process.on("SIGTERM", async () => {
  try {
    await rm(pidPath, { force: true });
    await rm(heartbeatPath, { force: true });
    await log(`stopped pid=${process.pid}`);
  } finally {
    process.exit(0);
  }
});

main().catch(async (error) => {
  try {
    await log(`fatal=${error.message}`);
  } finally {
    process.exit(1);
  }
});
