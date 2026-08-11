import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { PluginError } from "./paths.js";

function commandVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, timeout: 15_000 });
  return {
    available: !result.error && result.status === 0,
    version: (result.stdout || result.stderr || "").trim().split(/\r?\n/)[0] || undefined,
    error: result.error?.message || (result.status !== 0 ? (result.stderr || `exit ${result.status}`).trim() : undefined),
  };
}

function parseLastJson(stdout) {
  const text = stdout.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines.slice(index).join("\n"));
      } catch {
        // Continue searching for the last JSON payload.
      }
    }
    return undefined;
  }
}

export function runProcess(command, args, { cwd, timeout = 1_800_000, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      reject(new PluginError(`外部进程执行超时：${command}`, {
        code: "PROCESS_TIMEOUT",
        details: { command, args, timeout },
      }));
    }, timeout);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new PluginError(`无法启动外部进程 ${command}：${error.message}`, {
        code: "PROCESS_START_FAILED",
        details: { command, args },
      }));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const parsed = parseLastJson(stdout);
      if (code !== 0) {
        reject(new PluginError(`外部进程执行失败：${command} (exit ${code ?? signal})`, {
          code: "PROCESS_FAILED",
          details: {
            command,
            args,
            exitCode: code,
            signal,
            stdout: stdout.slice(-8_000),
            stderr: stderr.slice(-8_000),
          },
        }));
        return;
      }
      resolvePromise({ parsed, stdout, stderr, exitCode: code });
    });
  });
}

export function createExportService({ pluginDirectory, packageRoot, projects, paths }) {
  const installedScripts = join(pluginDirectory, "resources", "scripts");
  const sourceScripts = join(packageRoot, "skills", "open-kimi-ppt", "scripts");
  const scriptsDirectory = existsSync(join(installedScripts, "export_pptx.py")) ? installedScripts : sourceScripts;
  const exportPptxScript = join(scriptsDirectory, "export_pptx.py");
  const exportImagesScript = join(scriptsDirectory, "export_images.py");
  const python = process.env.PPT_PYTHON_COMMAND || "python";

  function checkEnvironment() {
    const node = commandVersion(process.execPath);
    const npm = commandVersion(process.platform === "win32" ? "npm.cmd" : "npm");
    const pythonStatus = commandVersion(python);
    const browsers = process.platform === "win32"
      ? [
          join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
          join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
          join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
        ]
      : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    const browser = browsers.find((path) => path && existsSync(path));
    const resources = {
      exportPptxScript: { path: exportPptxScript, available: existsSync(exportPptxScript) },
      exportImagesScript: { path: exportImagesScript, available: existsSync(exportImagesScript) },
      editor: { path: join(pluginDirectory, "resources", "editor", "index.html"), available: existsSync(join(pluginDirectory, "resources", "editor", "index.html")) || existsSync(join(packageRoot, "editor", "index.html")) },
      reference: { path: join(pluginDirectory, "resources", "reference", "pptd.md"), available: existsSync(join(pluginDirectory, "resources", "reference", "pptd.md")) || existsSync(join(packageRoot, "skills", "open-kimi-ppt", "reference", "pptd.md")) },
    };
    return {
      ready: node.available && npm.available && pythonStatus.available && Object.values(resources).every((item) => item.available),
      workspaceRoot: paths.root,
      node,
      npm,
      python: pythonStatus,
      chromium: { detected: Boolean(browser), path: browser, note: browser ? undefined : "未在常见路径检测到；agent-browser 仍可能自行找到浏览器。" },
      resources,
      networkRequiredForExport: ["https://www.kimi.com", "https://statics.moonshot.cn"],
    };
  }

  async function exportImages({ projectPath, outputPath = ".qa-images", force = false }) {
    const directory = projects.projectDirectory(projectPath);
    const manifest = projects.manifestPath(projectPath);
    const output = paths.resolveWorkspacePath(`${paths.toWorkspaceRelative(directory)}/${outputPath}`, { label: "outputPath" });
    const args = [exportImagesScript, manifest, "--output", output];
    if (force) args.push("--force");
    const result = await runProcess(python, args, { cwd: scriptsDirectory });
    if (!result.parsed) {
      throw new PluginError("图片导出成功但未返回可解析的 JSON 摘要。", {
        code: "INVALID_EXPORT_RESULT",
        details: { stdout: result.stdout.slice(-8_000) },
      });
    }
    return {
      ...result.parsed,
      projectPath: paths.toWorkspaceRelative(directory),
      outputPath: paths.toWorkspaceRelative(output),
      overviewPath: existsSync(join(output, "overview.jpg")) ? paths.toWorkspaceRelative(join(output, "overview.jpg")) : result.parsed.overview,
    };
  }

  async function exportPptx({ projectPath, outputPath, force = false, transition = "fade", embedFonts = true }) {
    if (!["fade", "none"].includes(transition)) {
      throw new PluginError("transition 仅支持 fade 或 none。", { code: "INVALID_TRANSITION" });
    }
    const directory = projects.projectDirectory(projectPath);
    const manifest = projects.manifestPath(projectPath);
    const defaultName = `${basename(manifest, ".pptd")}.pptx`;
    const relativeOutput = outputPath || defaultName;
    if (!relativeOutput.toLowerCase().endsWith(".pptx")) {
      throw new PluginError("outputPath 必须以 .pptx 结尾。", { code: "INVALID_OUTPUT_PATH" });
    }
    const output = paths.resolveWorkspacePath(`${paths.toWorkspaceRelative(directory)}/${relativeOutput}`, { label: "outputPath" });
    const args = [exportPptxScript, manifest, "--output", output, "--transition", transition];
    if (!embedFonts) args.push("--no-embed-fonts");
    if (force) args.push("--force");
    const result = await runProcess(python, args, { cwd: scriptsDirectory });
    if (!result.parsed) {
      throw new PluginError("PPTX 导出成功但未返回可解析的 JSON 摘要。", {
        code: "INVALID_EXPORT_RESULT",
        details: { stdout: result.stdout.slice(-8_000) },
      });
    }
    return {
      ...result.parsed,
      projectPath: paths.toWorkspaceRelative(directory),
      outputPath: paths.toWorkspaceRelative(output),
      absolutePath: output,
    };
  }

  return { checkEnvironment, exportImages, exportPptx };
}
