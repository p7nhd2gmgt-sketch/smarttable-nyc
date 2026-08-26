import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { ensureRoleTestCredentialEnv } from "./test-account-credentials.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = String(process.env.PLAYWRIGHT_PORT || process.env.PORT || 4174);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const useExternalServices = process.env.PLAYWRIGHT_USE_EXTERNAL_SERVICES === "1";
ensureRoleTestCredentialEnv(process.env);
const env = {
  ...process.env,
  PORT: port,
  PUBLIC_BASE_URL: baseURL,
  SMARTTABLE_ENV: useExternalServices ? (process.env.SMARTTABLE_ENV || "development") : "development",
  APP_ENV: useExternalServices ? (process.env.APP_ENV || "") : "development",
  VERCEL_ENV: useExternalServices ? (process.env.VERCEL_ENV || "") : "",
  SUPABASE_URL: useExternalServices ? (process.env.SUPABASE_URL || "") : "",
  NEXT_PUBLIC_SUPABASE_URL: useExternalServices ? (process.env.NEXT_PUBLIC_SUPABASE_URL || "") : "",
  VITE_SUPABASE_URL: useExternalServices ? (process.env.VITE_SUPABASE_URL || "") : "",
  SUPABASE_ANON_KEY: useExternalServices ? (process.env.SUPABASE_ANON_KEY || "") : "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: useExternalServices ? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "") : "",
  VITE_SUPABASE_ANON_KEY: useExternalServices ? (process.env.VITE_SUPABASE_ANON_KEY || "") : "",
  SUPABASE_SERVICE_ROLE_KEY: useExternalServices ? (process.env.SUPABASE_SERVICE_ROLE_KEY || "") : "",
  RESEND_API_KEY: useExternalServices ? (process.env.RESEND_API_KEY || "") : "",
  RESEND_WEBHOOK_SECRET: useExternalServices ? (process.env.RESEND_WEBHOOK_SECRET || "") : "",
  PLAYWRIGHT_BASE_URL: baseURL,
  PLAYWRIGHT_PORT: port
};

let server;

function requestUrl(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode || 0);
    });
    request.setTimeout(1_000, () => {
      request.destroy(new Error("Timed out waiting for the app."));
    });
    request.on("error", reject);
  });
}

async function waitForApp(url, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const status = await requestUrl(url);
      if (status >= 200 && status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError.message})` : ""}`);
}

function stopServer() {
  if (!server || server.killed) return;
  server.kill();
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const executable = process.platform === "win32" ? "cmd.exe" : command;
    const executableArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", [command, ...args].join(" ")]
      : args;
    const child = spawn(executable, executableArgs, {
      cwd: root,
      env,
      stdio: options.stdio || "inherit",
      windowsHide: true
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopServer();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

try {
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[WebServer] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[WebServer] ${chunk}`));
  server.on("exit", (code) => {
    if (code && code !== 0) {
      process.stderr.write(`[WebServer] exited with code ${code}\n`);
    }
  });

  await waitForApp(baseURL);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const code = await run(npx, ["playwright", "test", ...process.argv.slice(2)]);
  stopServer();
  process.exit(code);
} catch (error) {
  stopServer();
  console.error(error.message);
  process.exit(1);
}
