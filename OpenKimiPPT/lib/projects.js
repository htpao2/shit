import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PluginError,
  assertMediaFileName,
  assertPagePath,
  assertProjectPath,
} from "./paths.js";

const MEDIA_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".mp4", ".webm", ".mp3", ".wav", ".m4a", ".ogg",
  ".ttf", ".otf", ".woff", ".woff2", ".pdf",
]);

function normalizeRelativePath(value) {
  if (typeof value !== "string") throw new PluginError("文件路径必须是字符串。", { code: "INVALID_PATH" });
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new PluginError(`不允许的绝对路径：${value}`, { code: "INVALID_PATH" });
  }
  const parts = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") throw new PluginError(`不允许越过项目目录：${value}`, { code: "INVALID_PATH" });
    parts.push(part);
  }
  if (parts.length === 0) throw new PluginError(`无效文件路径：${value}`, { code: "INVALID_PATH" });
  return parts.join("/");
}

function unquoteYamlScalar(value) {
  const text = value.trim();
  if (text.startsWith('"')) {
    const match = text.match(/^"(?:\\.|[^"\\])*"/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return match[0].slice(1, -1); }
    }
  }
  if (text.startsWith("'")) {
    const end = text.indexOf("'", 1);
    if (end !== -1) return text.slice(1, end).replaceAll("''", "'");
  }
  return text.replace(/\s+#.*$/, "").trim();
}

export function extractPagePaths(manifestText) {
  const trimmed = manifestText.trim();
  if (!trimmed) throw new PluginError("PPTD manifest 是空文件。", { code: "INVALID_MANIFEST" });
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed.pages)) throw new PluginError("PPTD manifest 缺少 pages 数组。", { code: "INVALID_MANIFEST" });
    return parsed.pages.map((path) => normalizeRelativePath(String(path)));
  }
  const lines = manifestText.replaceAll("\r\n", "\n").split("\n");
  const pageHeader = lines.findIndex((line) => /^(\s*)pages\s*:\s*(?:#.*)?$/.test(line));
  if (pageHeader === -1) throw new PluginError("PPTD manifest 缺少 pages 列表。", { code: "INVALID_MANIFEST" });
  const headerIndent = lines[pageHeader].match(/^\s*/)[0].length;
  const pages = [];
  for (let index = pageHeader + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= headerIndent && !/^\s*-/.test(line)) break;
    const match = line.match(/^\s*-\s*(.+?)\s*$/);
    if (!match) break;
    const path = unquoteYamlScalar(match[1]);
    if (path) pages.push(normalizeRelativePath(path));
  }
  if (pages.length === 0) throw new PluginError("PPTD manifest 的 pages 列表为空。", { code: "INVALID_MANIFEST" });
  return pages;
}

function titleFromManifest(manifestText, fallback) {
  const trimmed = manifestText.trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed).title || fallback; } catch { return fallback; }
  }
  const match = manifestText.match(/^title\s*:\s*(.+?)\s*$/m);
  return match ? unquoteYamlScalar(match[1]) : fallback;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, "utf8");
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function requireText(value, label) {
  if (typeof value !== "string") {
    throw new PluginError(`${label} 必须是字符串。`, { code: "INVALID_CONTENT" });
  }
  return value.replaceAll("\r\n", "\n");
}

function findManifests(projectDirectory) {
  if (!existsSync(projectDirectory) || !statSync(projectDirectory).isDirectory()) return [];
  return readdirSync(projectDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pptd"))
    .map((entry) => join(projectDirectory, entry.name))
    .sort();
}

export function createProjectService({ paths }) {
  function projectDirectory(projectPath, { mustExist = true } = {}) {
    const normalized = assertProjectPath(projectPath);
    const directory = paths.resolveWorkspacePath(normalized, {
      label: "projectPath",
      mustExist,
    });
    if (mustExist && !statSync(directory).isDirectory()) {
      throw new PluginError(`projectPath 不是目录：${projectPath}`, { code: "NOT_A_PROJECT_DIRECTORY" });
    }
    return directory;
  }

  function manifestPath(projectPath) {
    const directory = projectDirectory(projectPath);
    const manifests = findManifests(directory);
    if (manifests.length === 0) {
      throw new PluginError(`项目中没有 .pptd 清单：${projectPath}`, { code: "MANIFEST_NOT_FOUND" });
    }
    if (manifests.length > 1) {
      throw new PluginError(`项目中存在多个 .pptd 清单：${projectPath}`, {
        code: "MULTIPLE_MANIFESTS",
        details: manifests.map((path) => basename(path)),
      });
    }
    return manifests[0];
  }

  function getProjectInfo({ projectPath }) {
    const directory = projectDirectory(projectPath);
    const manifest = manifestPath(projectPath);
    const content = readFileSync(manifest, "utf8");
    let pages = [];
    let parseError;
    try {
      pages = /^\s*pages\s*:\s*\[\s*\]\s*(?:#.*)?$/m.test(content)
        ? []
        : extractPagePaths(content);
    } catch (error) {
      parseError = error.message;
    }
    const mediaDirectory = join(directory, "media");
    const media = existsSync(mediaDirectory)
      ? readdirSync(mediaDirectory, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort()
      : [];
    return {
      projectPath: paths.toWorkspaceRelative(directory),
      absolutePath: directory,
      manifestPath: paths.toWorkspaceRelative(manifest),
      title: titleFromManifest(content, basename(manifest, ".pptd")),
      pages,
      pageCount: pages.length,
      mediaCount: media.length,
      parseError,
    };
  }

  function createProject({ projectPath, title, width = 1920, height = 1080, overwrite = false }) {
    const normalized = assertProjectPath(projectPath);
    const directory = paths.resolveWorkspacePath(normalized, { label: "projectPath" });
    const projectName = basename(normalized).replace(/[^A-Za-z0-9._-]+/g, "-") || "presentation";
    if (!Number.isFinite(Number(width)) || Number(width) <= 0 || !Number.isFinite(Number(height)) || Number(height) <= 0) {
      throw new PluginError("width 和 height 必须是正数。", { code: "INVALID_CANVAS_SIZE" });
    }
    if (existsSync(directory)) {
      const entries = statSync(directory).isDirectory() ? readdirSync(directory) : [basename(directory)];
      if (entries.length > 0 && !overwrite) {
        throw new PluginError(`项目目录已存在且非空：${normalized}`, { code: "PROJECT_EXISTS" });
      }
      if (!statSync(directory).isDirectory()) {
        throw new PluginError(`projectPath 已存在但不是目录：${normalized}`, { code: "PROJECT_EXISTS" });
      }
      if (overwrite) rmSync(directory, { recursive: true, force: true });
    }
    mkdirSync(join(directory, "pages"), { recursive: true });
    mkdirSync(join(directory, "media"), { recursive: true });
    const manifest = join(directory, `${projectName}.pptd`);
    const content = [
      "version: v2",
      `title: ${yamlString(title || projectName)}`,
      `size: [${Number(width)}, ${Number(height)}]`,
      "pages: []",
      "",
    ].join("\n");
    atomicWrite(manifest, content);
    return getProjectInfo({ projectPath: normalized });
  }

  function listProjects() {
    const results = [];
    const walk = (directory, depth) => {
      if (depth > 4) return;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const child = join(directory, entry.name);
        const manifests = findManifests(child);
        if (manifests.length === 1) {
          const projectPath = paths.toWorkspaceRelative(child);
          try {
            results.push(getProjectInfo({ projectPath }));
          } catch (error) {
            results.push({ projectPath, error: error.message });
          }
        } else {
          walk(child, depth + 1);
        }
      }
    };
    walk(paths.root, 0);
    return { workspaceRoot: paths.root, projects: results };
  }

  function readManifest({ projectPath }) {
    const path = manifestPath(projectPath);
    return {
      projectPath: assertProjectPath(projectPath),
      manifestPath: paths.toWorkspaceRelative(path),
      content: readFileSync(path, "utf8"),
    };
  }

  function writeManifest({ projectPath, content, overwrite = true }) {
    const path = manifestPath(projectPath);
    if (existsSync(path) && overwrite === false) {
      throw new PluginError(`清单已存在：${paths.toWorkspaceRelative(path)}`, { code: "FILE_EXISTS" });
    }
    atomicWrite(path, requireText(content, "content"));
    return readManifest({ projectPath });
  }

  function listPages({ projectPath }) {
    const info = getProjectInfo({ projectPath });
    const directory = projectDirectory(projectPath);
    return {
      ...info,
      pageFiles: info.pages.map((pagePath) => ({
        pagePath,
        exists: existsSync(join(directory, pagePath)),
      })),
    };
  }

  function readPage({ projectPath, pagePath }) {
    const directory = projectDirectory(projectPath);
    const normalized = assertPagePath(pagePath);
    const path = resolve(directory, normalized);
    paths.resolveWorkspacePath(paths.toWorkspaceRelative(path), { label: "pagePath", mustExist: true });
    if (!statSync(path).isFile()) {
      throw new PluginError(`页面不是文件：${normalized}`, { code: "PAGE_NOT_FOUND" });
    }
    return { projectPath: assertProjectPath(projectPath), pagePath: normalized, content: readFileSync(path, "utf8") };
  }

  function writePage({ projectPath, pagePath, content, overwrite = false }) {
    const directory = projectDirectory(projectPath);
    const normalized = assertPagePath(pagePath);
    const path = resolve(directory, normalized);
    paths.resolveWorkspacePath(paths.toWorkspaceRelative(path), { label: "pagePath" });
    if (existsSync(path) && !overwrite) {
      throw new PluginError(`页面已存在；如需覆盖请传 overwrite=true：${normalized}`, { code: "FILE_EXISTS" });
    }
    atomicWrite(path, requireText(content, "content"));
    return readPage({ projectPath, pagePath: normalized });
  }

  function listMedia({ projectPath }) {
    const directory = projectDirectory(projectPath);
    const mediaDirectory = join(directory, "media");
    mkdirSync(mediaDirectory, { recursive: true });
    const files = readdirSync(mediaDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(mediaDirectory, entry.name);
        return { fileName: entry.name, mediaPath: `media/${entry.name}`, size: statSync(path).size };
      })
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
    return { projectPath: assertProjectPath(projectPath), files };
  }

  function importMediaBuffer({ projectPath, fileName, buffer, overwrite = false }) {
    const directory = projectDirectory(projectPath);
    const normalized = assertMediaFileName(fileName);
    if (!MEDIA_EXTENSIONS.has(extname(normalized).toLowerCase())) {
      throw new PluginError(`不支持的媒体扩展名：${extname(normalized) || "无扩展名"}`, {
        code: "UNSUPPORTED_MEDIA_TYPE",
      });
    }
    const maximum = Number(process.env.PPT_MAX_MEDIA_MB || 50) * 1024 * 1024;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new PluginError("媒体数据为空。", { code: "EMPTY_MEDIA" });
    }
    if (buffer.length > maximum) {
      throw new PluginError(`媒体文件超过大小限制：${buffer.length} > ${maximum} bytes`, {
        code: "MEDIA_TOO_LARGE",
      });
    }
    const path = join(directory, "media", normalized);
    paths.resolveWorkspacePath(paths.toWorkspaceRelative(path), { label: "fileName" });
    if (existsSync(path) && !overwrite) {
      throw new PluginError(`媒体文件已存在；如需覆盖请传 overwrite=true：${normalized}`, { code: "FILE_EXISTS" });
    }
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, buffer);
      renameSync(temporary, path);
    } finally {
      rmSync(temporary, { force: true });
    }
    return {
      projectPath: assertProjectPath(projectPath),
      fileName: normalized,
      mediaPath: `media/${normalized}`,
      absolutePath: path,
      size: buffer.length,
    };
  }

  function importMediaFile({ projectPath, fileName, sourcePath, overwrite = false }) {
    if (!existsSync(sourcePath)) {
      throw new PluginError("本地文件未找到，需要远程获取。", {
        code: "FILE_NOT_FOUND_LOCALLY",
        fileUrl: sourcePath,
        failedParameter: "sourcePath",
      });
    }
    const stats = statSync(sourcePath);
    if (!stats.isFile()) {
      throw new PluginError(`sourcePath 不是文件：${sourcePath}`, { code: "INVALID_SOURCE_FILE" });
    }
    const maximum = Number(process.env.PPT_MAX_MEDIA_MB || 50) * 1024 * 1024;
    if (stats.size > maximum) {
      throw new PluginError(`媒体文件超过大小限制：${stats.size} > ${maximum} bytes`, {
        code: "MEDIA_TOO_LARGE",
      });
    }
    const directory = projectDirectory(projectPath);
    const normalized = assertMediaFileName(fileName || basename(sourcePath));
    if (!MEDIA_EXTENSIONS.has(extname(normalized).toLowerCase())) {
      throw new PluginError(`不支持的媒体扩展名：${extname(normalized) || "无扩展名"}`, {
        code: "UNSUPPORTED_MEDIA_TYPE",
      });
    }
    const destination = join(directory, "media", normalized);
    paths.resolveWorkspacePath(paths.toWorkspaceRelative(destination), { label: "fileName" });
    if (existsSync(destination) && !overwrite) {
      throw new PluginError(`媒体文件已存在；如需覆盖请传 overwrite=true：${normalized}`, { code: "FILE_EXISTS" });
    }
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(sourcePath, destination);
    return {
      projectPath: assertProjectPath(projectPath),
      fileName: normalized,
      mediaPath: `media/${normalized}`,
      absolutePath: destination,
      size: stats.size,
    };
  }

  return {
    createProject,
    getProjectInfo,
    listProjects,
    manifestPath,
    projectDirectory,
    readManifest,
    writeManifest,
    listPages,
    readPage,
    writePage,
    listMedia,
    importMediaBuffer,
    importMediaFile,
  };
}
