import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export class PluginError extends Error {
  constructor(message, { code = "PLUGIN_ERROR", details, fileUrl, failedParameter } = {}) {
    super(message);
    this.name = "PluginError";
    this.code = code;
    this.details = details;
    this.fileUrl = fileUrl;
    this.failedParameter = failedParameter;
  }
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function assertRelativePath(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PluginError(`${label} 必须是非空字符串。`, { code: "INVALID_PATH" });
  }
  const normalized = value.trim().replaceAll("\\", "/");
  if (
    normalized.includes("\0")
    || normalized.startsWith("/")
    || /^[A-Za-z]:\//.test(normalized)
    || normalized.split("/").includes("..")
  ) {
    throw new PluginError(`${label} 必须是工作目录内的安全相对路径：${value}`, {
      code: "PATH_OUTSIDE_WORKSPACE",
    });
  }
  return normalized;
}

function nearestExistingParent(path) {
  let current = path;
  while (!existsSync(current)) {
    const parent = resolve(current, "..");
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export function createPathContext({ pluginDirectory, workspaceRoot } = {}) {
  const configuredRoot = workspaceRoot || process.env.PPT_WORKSPACE_ROOT || "./workspace";
  const baseDirectory = pluginDirectory ? resolve(pluginDirectory) : process.cwd();
  const root = isAbsolute(configuredRoot)
    ? resolve(configuredRoot)
    : resolve(baseDirectory, configuredRoot);

  mkdirSync(root, { recursive: true });
  const realRoot = realpathSync(root);

  function resolveWorkspacePath(value, { label = "path", mustExist = false } = {}) {
    const normalized = assertRelativePath(value, label);
    const candidate = resolve(realRoot, normalized);
    if (!isInside(realRoot, candidate)) {
      throw new PluginError(`${label} 超出工作根目录：${value}`, {
        code: "PATH_OUTSIDE_WORKSPACE",
      });
    }

    const existingParent = nearestExistingParent(candidate);
    const realParent = realpathSync(existingParent);
    if (!isInside(realRoot, realParent)) {
      throw new PluginError(`${label} 通过符号链接指向工作根目录之外：${value}`, {
        code: "SYMLINK_ESCAPE",
      });
    }

    if (existsSync(candidate)) {
      const stats = lstatSync(candidate);
      const realCandidate = realpathSync(candidate);
      if (!isInside(realRoot, realCandidate)) {
        throw new PluginError(`${label} 通过符号链接指向工作根目录之外：${value}`, {
          code: "SYMLINK_ESCAPE",
        });
      }
      if (stats.isSymbolicLink() && !isInside(realRoot, realCandidate)) {
        throw new PluginError(`${label} 是不安全的符号链接：${value}`, {
          code: "SYMLINK_ESCAPE",
        });
      }
    } else if (mustExist) {
      throw new PluginError(`${label} 不存在：${value}`, { code: "PATH_NOT_FOUND" });
    }

    return candidate;
  }

  function toWorkspaceRelative(path) {
    const absolute = resolve(path);
    if (!isInside(realRoot, absolute)) {
      throw new PluginError(`路径不在工作根目录内：${path}`, {
        code: "PATH_OUTSIDE_WORKSPACE",
      });
    }
    return relative(realRoot, absolute).split(sep).join("/") || ".";
  }

  return {
    root: realRoot,
    resolveWorkspacePath,
    toWorkspaceRelative,
  };
}

export function assertProjectPath(value) {
  const normalized = assertRelativePath(value, "projectPath").replace(/\/+$/, "");
  if (!normalized || normalized === ".") {
    throw new PluginError("projectPath 不能指向工作根目录本身。", { code: "INVALID_PROJECT_PATH" });
  }
  return normalized;
}

export function assertPagePath(value) {
  const normalized = assertRelativePath(value, "pagePath");
  if (!normalized.startsWith("pages/") || !normalized.toLowerCase().endsWith(".page")) {
    throw new PluginError("pagePath 必须是 pages/ 目录下的 .page 文件。", {
      code: "INVALID_PAGE_PATH",
    });
  }
  return normalized;
}

export function assertMediaFileName(value) {
  const normalized = assertRelativePath(value, "fileName");
  if (normalized.includes("/")) {
    throw new PluginError("fileName 只能是 media/ 下的单个文件名，不能包含目录。", {
      code: "INVALID_MEDIA_NAME",
    });
  }
  return normalized;
}
