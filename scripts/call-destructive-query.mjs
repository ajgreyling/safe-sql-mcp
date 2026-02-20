#!/usr/bin/env node
/**
 * One-off script: start DBHub with dbhub-sams-staging config (HTTP), call
 * execute_sql with a destructive query, print the result. Used to verify
 * readonly enforcement (expect READONLY_VIOLATION when readonly=true).
 * Reads server args from .cursor/mcp.json; does not modify it.
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const mcpPath = path.join(rootDir, ".cursor", "mcp.json");
const port = 18643;
const baseUrl = `http://127.0.0.1:${port}`;

const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
const staging = mcp.mcpServers?.["dbhub-sams-staging"];
if (!staging) {
  console.error("dbhub-sams-staging not found in .cursor/mcp.json");
  process.exit(1);
}

const args = [...(staging.args || [])];
const stdioIdx = args.indexOf("--transport");
if (stdioIdx !== -1 && args[stdioIdx + 1] === "stdio") {
  args[stdioIdx + 1] = "http";
}
if (!args.includes("--port")) {
  args.push("--port", String(port));
}
const cwd = staging.cwd || rootDir;
const command = staging.command || "pnpm";
const spawnArgs = command === "npx" ? args : ["exec", ...args];

console.log("Starting server with dbhub-sams-staging config (HTTP)...");
const child = spawn(command, spawnArgs, {
  cwd,
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr?.on("data", (d) => {
  stderr += d;
});
child.stdout?.on("data", (d) => {
  if (process.env.DEBUG) process.stdout.write(d);
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const r = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "ping",
          method: "notifications/initialized",
        }),
      });
      if (r.status < 500) return;
    } catch (_) {}
  }
  throw new Error("Server did not become ready in time");
}

async function callExecuteSql(sql) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        name: "execute_sql",
        arguments: { sql },
      },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

(async () => {
  try {
    await waitForServer();
    console.log("Server ready. Calling execute_sql with: DELETE FROM __logging_log__");
    const response = await callExecuteSql("DELETE FROM __logging_log__");
    console.log(JSON.stringify(response, null, 2));
    if (response.result?.content?.[0]?.text) {
      const content = JSON.parse(response.result.content[0].text);
      console.log("\nParsed content:");
      console.log(JSON.stringify(content, null, 2));
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    child.kill("SIGTERM");
  }
})();
