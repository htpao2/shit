#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPathContext, PluginError } from "./lib/paths.js";
import { createProjectService } from "./lib/projects.js";
import { createValidator } from "./lib/validator.js";
import { createExportService } from "./lib/processes.js";
import { createEditorManager } from "./lib/editor-manager.js";

const pluginDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(pluginDirectory, "..", "..");

function normalizeArguments(input) {
  const normalized = { ...input };
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (!(lower in normalized)) normalized[lower] = value;
  }
  return normalized;
}

function value(args, ...names) {
  for (const name of names) {
    if (args[name] !== undefined) return args[name];
    if (args[name.toLowerCase()] !== undefined) return args[name.toLowerCase()];
  }
  return undefined;
}

function booleanValue(input, fallback = false) {
  if (input === undefined || input === null || input === "") return fallback;
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  if (typeof input === "string") {
    if (["true", "1", "yes", "on"].includes(input.toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(input.toLowerCase())) return false;
  }
  throw new PluginError(`无法识别布尔值：${input}`, { code: "INVALID_BOOLEAN" });
}

function decodeData(data) {
  if (typeof data !== "string" || !data.trim()) {
    throw new PluginError("data 必须是非空 Base64 或 Data URI 字符串。", { code: "INVALID_MEDIA_DATA" });
  }
  const trimmed = data.trim();
  const match = trimmed.match(/^data:([^;,]+)?;base64,(.*)$/s);
  const base64 = match ? match[2] : trimmed;
  if (!/^[A-Za-z0-9+/\s]*={0,2}$/.test(base64)) {
    throw new PluginError("data 不是合法的 Base64/Data URI。", { code: "INVALID_MEDIA_DATA" });
  }
  const buffer = Buffer.from(base64.replace(/\s/g, ""), "base64");
  if (buffer.length === 0) {
    throw new PluginError("data 解码后为空。", { code: "INVALID_MEDIA_DATA" });
  }
  return buffer;
}

function sourceFilePath(sourcePath) {
  if (typeof sourcePath !== "string" || !sourcePath.trim()) {
    throw new PluginError("sourcePath 必须是非空字符串。", { code: "INVALID_SOURCE_FILE" });
  }
  if (sourcePath.startsWith("file://")) return fileURLToPath(sourcePath);
  return resolve(sourcePath);
}

function createReferenceReader() {
  const installedRoot = join(pluginDirectory, "resources");
  const sourceSkillRoot = join(packageRoot, "skills", "open-kimi-ppt");
  const installedReferenceRoot = join(installedRoot, "reference");
  const sourceReferenceRoot = join(sourceSkillRoot, "reference");
  const installed = (relativePath, sourcePath) => {
    const path = join(installedRoot, relativePath);
    try { readFileSync(path, "utf8"); return path; } catch { return sourcePath; }
  };
  const references = {
    skill: installed("SKILL.md", join(sourceSkillRoot, "SKILL.md")),
    pptd: installed(join("reference", "pptd.md"), join(sourceSkillRoot, "reference", "pptd.md")),
    slides_categories: installed(join("reference", "slides_categories.md"), join(sourceSkillRoot, "reference", "slides_categories.md")),
    themes: installed("theme.md", join(packageRoot, "theme.md")),
    fonts: installed(join("reference", "fonts.md"), join(sourceSkillRoot, "reference", "fonts.md")),
    shapes: installed(join("reference", "shapes.md"), join(sourceSkillRoot, "reference", "shapes.md")),
  };
  return ({ reference, referencePath }) => {
    if (referencePath !== undefined) {
      const normalized = String(referencePath).trim().replaceAll("\\", "/").replace(/^\.\//, "");
      if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..") || !normalized.toLowerCase().endsWith(".md")) {
        throw new PluginError("referencePath 必须是 reference/ 内安全的 .md 相对路径。", {
          code: "INVALID_REFERENCE_PATH",
        });
      }
      const installedPath = resolve(installedReferenceRoot, normalized);
      const sourcePath = resolve(sourceReferenceRoot, normalized);
      let path;
      try { readFileSync(installedPath, "utf8"); path = installedPath; } catch { path = sourcePath; }
      try {
        return { referencePath: normalized, path, content: readFileSync(path, "utf8") };
      } catch {
        throw new PluginError(`参考文件不存在：${normalized}`, { code: "REFERENCE_NOT_FOUND" });
      }
    }
    const key = String(reference || "").trim().toLowerCase();
    const path = references[key];
    if (!path) {
      throw new PluginError(`未知 reference：${reference}。可选：${Object.keys(references).join(", ")}`, {
        code: "UNKNOWN_REFERENCE",
      });
    }
    return { reference: key, path, content: readFileSync(path, "utf8") };
  };
}

export function createPlugin({ workspaceRoot } = {}) {
  const paths = createPathContext({ pluginDirectory, workspaceRoot });
  const projects = createProjectService({ paths });
  const validateProject = createValidator({ projects, paths });
  const exports = createExportService({ pluginDirectory, packageRoot, projects, paths });
  const editor = createEditorManager({ pluginDirectory, paths });
  const readReference = createReferenceReader();

  async function dispatch(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new PluginError("插件输入必须是 JSON 对象。", { code: "INVALID_REQUEST" });
    }
    const args = normalizeArguments(input);
    const command = String(value(args, "command") || "").trim();
    if (!command) throw new PluginError("缺少 command 参数。", { code: "MISSING_COMMAND" });
    const projectPath = value(args, "projectPath");

    switch (command.toLowerCase()) {
      case "checkenvironment":
        return exports.checkEnvironment();
      case "createproject":
        return projects.createProject({
          projectPath,
          title: value(args, "title"),
          width: value(args, "width") ?? 1920,
          height: value(args, "height") ?? 1080,
          overwrite: booleanValue(value(args, "overwrite"), false),
        });
      case "listprojects":
        return projects.listProjects();
      case "getprojectinfo":
        return projects.getProjectInfo({ projectPath });
      case "readmanifest":
        return projects.readManifest({ projectPath });
      case "writemanifest":
        return projects.writeManifest({
          projectPath,
          content: value(args, "content"),
          overwrite: booleanValue(value(args, "overwrite"), true),
        });
      case "listpages":
        return projects.listPages({ projectPath });
      case "readpage":
        return projects.readPage({ projectPath, pagePath: value(args, "pagePath") });
      case "writepage":
        return projects.writePage({
          projectPath,
          pagePath: value(args, "pagePath"),
          content: value(args, "content"),
          overwrite: booleanValue(value(args, "overwrite"), false),
        });
      case "readreference":
        return readReference({
          reference: value(args, "reference"),
          referencePath: value(args, "referencePath"),
        });
      case "listmedia":
        return projects.listMedia({ projectPath });
      case "importmedia": {
        const data = value(args, "data");
        const sourcePath = value(args, "sourcePath");
        const fileName = value(args, "fileName");
        const overwrite = booleanValue(value(args, "overwrite"), false);
        if (data !== undefined) {
          return projects.importMediaBuffer({ projectPath, fileName, buffer: decodeData(data), overwrite });
        }
        if (sourcePath !== undefined) {
          return projects.importMediaFile({
            projectPath,
            fileName,
            sourcePath: sourceFilePath(sourcePath),
            overwrite,
          });
        }
        throw new PluginError("ImportMedia 必须提供 sourcePath 或 data。", { code: "MISSING_MEDIA_SOURCE" });
      }
      case "validateproject":
        return validateProject({ projectPath });
      case "exportimages":
        return exports.exportImages({
          projectPath,
          outputPath: value(args, "outputPath") || ".qa-images",
          force: booleanValue(value(args, "force"), false),
        });
      case "exportpptx":
        return exports.exportPptx({
          projectPath,
          outputPath: value(args, "outputPath"),
          force: booleanValue(value(args, "force"), false),
          transition: String(value(args, "transition") || "fade").toLowerCase(),
          embedFonts: booleanValue(value(args, "embedFonts"), true),
        });
      case "starteditor":
        return editor.startEditor({
          port: value(args, "port"),
          openBrowser: booleanValue(value(args, "openBrowser"), false),
        });
      case "editorstatus":
        return editor.editorStatus();
      case "stopeditor":
        return editor.stopEditor();
      default:
        throw new PluginError(`未知 command：${command}`, { code: "UNKNOWN_COMMAND" });
    }
  }

  return { dispatch, paths, projects, validateProject, exports, editor };
}

function errorPayload(error) {
  const payload = {
    status: "error",
    error: error instanceof Error ? error.message : String(error),
  };
  if (error?.code) payload.code = error.code;
  if (error?.details !== undefined) payload.details = error.details;
  if (error?.fileUrl) payload.fileUrl = error.fileUrl;
  if (error?.failedParameter) payload.failedParameter = error.failedParameter;
  return payload;
}

async function readStdin() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) throw new PluginError("stdin 为空。", { code: "EMPTY_STDIN" });
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new PluginError(`stdin 不是合法 JSON：${error.message}`, { code: "INVALID_JSON" });
  }
}

async function main() {
  try {
    const request = await readStdin();
    const result = await createPlugin().dispatch(request);
    process.stdout.write(`${JSON.stringify({ status: "success", result })}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack || error}\n`);
    process.stdout.write(`${JSON.stringify(errorPayload(error))}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
