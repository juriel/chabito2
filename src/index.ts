// Punto de entrada principal
import "dotenv/config";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ChabitoHttpServer } from "./webserver/chabito_http_server.ts";

function isGraphicalSession(): boolean {
  if (process.env["CI"]) return false;
  if (process.env["NO_BROWSER"] || process.env["NO_OPEN"]) return false;
  if (process.env["FORCE_BROWSER"] === "1") return true;

  if (process.platform === "win32" || process.platform === "darwin") return true;

  const hasDisplay = Boolean(process.env["DISPLAY"] || process.env["WAYLAND_DISPLAY"]);
  const isSsh = Boolean(process.env["SSH_CONNECTION"] || process.env["SSH_TTY"]);

  // When on SSH without a display, opening a local browser is almost never possible.
  if (isSsh && !hasDisplay) return false;

  // Be optimistic: try opening even if DISPLAY isn't set (some environments still can).
  return true;
}

async function openInBrowser(url: string): Promise<boolean> {
  const debug = process.env["BROWSER_DEBUG"] === "1";
  const bunOpenUrl = (globalThis as any)?.Bun?.openURL as undefined | ((u: string) => Promise<void> | void);
  if (bunOpenUrl) {
    try {
      if (debug) console.log("[UI] open: using Bun.openURL");
      await bunOpenUrl(url);
      if (debug) console.log("[UI] open: Bun.openURL resolved");
      return true;
    } catch (err) {
      if (debug) console.log(`[UI] open: Bun.openURL failed: ${String(err)}`);
      // fall through
    }
  }

  const candidates =
    process.platform === "darwin"
      ? [{ bin: "open", args: [url] }]
      : process.platform === "win32"
        ? [{ bin: "cmd", args: ["/c", "start", "", url] }]
        : [
            { bin: "xdg-open", args: [url] },
            { bin: "gio", args: ["open", url] },
            { bin: "sensible-browser", args: [url] },
          ];

  for (const cmd of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      try {
        if (debug) console.log(`[UI] open: spawning ${cmd.bin} ${cmd.args.join(" ")}`);
        const child = spawn(cmd.bin, cmd.args, { stdio: "ignore" });
        child.once("error", (err) => {
          if (debug) console.log(`[UI] open: ${cmd.bin} error: ${String(err)}`);
          resolve(false);
        });
        child.once("spawn", () => {
          if (debug) console.log(`[UI] open: ${cmd.bin} spawned`);
          resolve(true);
        });
      } catch (err) {
        if (debug) console.log(`[UI] open: ${cmd.bin} threw: ${String(err)}`);
        resolve(false);
      }
    });
    if (ok) return true;
  }

  return false;
}

const port = Number(process.env["PORT"] || 3000);
const url = `http://localhost:${port}/dashboard`;
const debug = process.env["BROWSER_DEBUG"] === "1";

const server = new ChabitoHttpServer(port);
server.start();

console.log(`[UI] Abre en tu navegador: ${url}`);
const shouldOpen = isGraphicalSession();
if (process.env["BROWSER_DEBUG"] === "1") {
  console.log(
    `[UI] browser_debug platform=${process.platform} display=${Boolean(
      process.env["DISPLAY"],
    )} wayland=${Boolean(process.env["WAYLAND_DISPLAY"])} ssh=${Boolean(
      process.env["SSH_CONNECTION"] || process.env["SSH_TTY"],
    )} should_open=${shouldOpen}`,
  );
}

if (shouldOpen) {
  const debounceSeconds = Number(process.env["BROWSER_DEBOUNCE_SECONDS"] || 20);
  const lockPath = path.join(os.tmpdir(), `chabito-open-browser-${port}.lock`);
  const now = Date.now();
  let blockedByDebounce = false;

  try {
    const prev = fs.readFileSync(lockPath, "utf8").trim();
    const prevMs = Number(prev);
    if (Number.isFinite(prevMs) && now - prevMs < debounceSeconds * 1000) blockedByDebounce = true;
  } catch {
    // ignore
  }

  if (blockedByDebounce) {
    if (debug) console.log(`[UI] open: debounce active (${debounceSeconds}s), skip auto-open`);
    // Keep printing URL, but don't open new tabs repeatedly on restarts.
    process.exitCode = process.exitCode ?? 0;
  }

  console.log("[UI] Intentando abrir el navegador...");
  const ok = blockedByDebounce ? true : await openInBrowser(url);
  if (!blockedByDebounce) {
    try {
      fs.writeFileSync(lockPath, String(now), "utf8");
    } catch {
      // ignore
    }
  }
  if (!ok) console.log(`[UI] No pude abrir el navegador automáticamente. Abre manualmente: ${url}`);

  if (!blockedByDebounce && ok && process.platform === "linux" && process.env["BROWSER_FOCUS"] === "1") {
    // Best-effort focus (optional): requires `wmctrl` or `xdotool` installed.
    if (debug) console.log("[UI] open: trying to focus browser (BROWSER_FOCUS=1)");
    try {
      const child = spawn("wmctrl", ["-a", "localhost"], { stdio: "ignore" });
      child.unref();
    } catch {
      try {
        const child = spawn("xdotool", ["search", "--onlyvisible", "--name", "localhost", "windowactivate"], {
          stdio: "ignore",
        });
        child.unref();
      } catch {
        if (debug) console.log("[UI] open: focus helpers not available (wmctrl/xdotool)");
      }
    }
  }
}
