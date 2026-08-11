import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PluginError } from "./paths.js";

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function urlResponds(url) {
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export function createEditorManager({ pluginDirectory, paths }) {
  const stateDirectory = join(paths.root, ".open-kimi-ppt");
  const statePath = join(stateDirectory, "editor.json");
  const serverPath = join(pluginDirectory, "editor-server.js");

  function readState() {
    if (!existsSync(statePath)) return undefined;
    try {
      return JSON.parse(readFileSync(statePath, "utf8"));
    } catch {
      rmSync(statePath, { force: true });
      return undefined;
    }
  }

  function saveState(state) {
    mkdirSync(stateDirectory, { recursive: true });
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async function editorStatus() {
    const state = readState();
    if (!state) return { running: false };
    const processRunning = processExists(state.pid);
    const responding = processRunning ? await urlResponds(state.url) : false;
    if (!processRunning) rmSync(statePath, { force: true });
    return {
      running: processRunning && responding,
      processRunning,
      responding,
      pid: state.pid,
      port: state.port,
      url: state.url,
      startedAt: state.startedAt,
    };
  }

  async function startEditor({ port, openBrowser = false } = {}) {
    const current = await editorStatus();
    if (current.running) return { ...current, reused: true };
    const selectedPort = Number(port || process.env.PPT_EDITOR_PORT || 55173);
    if (!Number.isInteger(selectedPort) || selectedPort < 1 || selectedPort > 65_535) {
      throw new PluginError("port 必须是 1 到 65535 的整数。", { code: "INVALID_PORT" });
    }
    const child = spawn(process.execPath, [serverPath, String(selectedPort)], {
      cwd: pluginDirectory,
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    });
    child.unref();
    const state = {
      pid: child.pid,
      port: selectedPort,
      url: `http://127.0.0.1:${selectedPort}/`,
      startedAt: new Date().toISOString(),
    };
    saveState(state);
    if (openBrowser) {
      const opener = process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", state.url], { detached: true, stdio: "ignore", windowsHide: true })
        : spawn(process.platform === "darwin" ? "open" : "xdg-open", [state.url], { detached: true, stdio: "ignore" });
      opener.unref();
    }
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      if (!processExists(child.pid)) break;
      if (await urlResponds(state.url)) return { running: true, responding: true, ...state, reused: false };
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
    rmSync(statePath, { force: true });
    throw new PluginError(`编辑器未能在端口 ${selectedPort} 启动，端口可能已被占用。`, {
      code: "EDITOR_START_FAILED",
      details: state,
    });
  }

  async function stopEditor() {
    const state = readState();
    if (!state) return { stopped: false, reason: "编辑器未由本插件启动。" };
    if (processExists(state.pid)) {
      if (process.platform === "win32") {
        const result = spawnSync("taskkill", ["/PID", String(state.pid), "/T", "/F"], {
          encoding: "utf8",
          windowsHide: true,
        });
        if (result.status !== 0 && processExists(state.pid)) {
          throw new PluginError(`停止编辑器失败：${result.stderr || result.stdout}`, {
            code: "EDITOR_STOP_FAILED",
          });
        }
      } else {
        process.kill(-state.pid, "SIGTERM");
      }
    }
    rmSync(statePath, { force: true });
    return { stopped: true, pid: state.pid, port: state.port, url: state.url };
  }

  return { startEditor, editorStatus, stopEditor };
}
