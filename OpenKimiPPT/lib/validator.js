import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { extractPagePaths } from "./projects.js";

function issue(code, message, path, details) {
  return { code, message, ...(path ? { path } : {}), ...(details ? { details } : {}) };
}

function scalar(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*:\\s*([^#\\n]+)`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : undefined;
}

function numeric(text, key) {
  const value = scalar(text, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function manifestSize(text) {
  const match = text.match(/^size\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*(?:#.*)?$/m);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : {};
}

function pageElements(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const elementsIndex = lines.findIndex((line) => /^(\s*)elements\s*:\s*(?:#.*)?$/.test(line));
  if (elementsIndex < 0) return [];
  const headerIndent = lines[elementsIndex].match(/^\s*/)[0].length;
  const itemIndent = headerIndent + 2;
  const propertyIndent = itemIndent + 2;
  const elements = [];
  let current;
  for (let index = elementsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= headerIndent) break;
    const item = line.match(new RegExp(`^\\s{${itemIndent}}-\\s+elementId\\s*:\\s*(.+?)\\s*$`));
    if (item) {
      if (current) elements.push(current);
      current = {
        line: index + 1,
        elementId: item[1].replace(/\s+#.*$/, "").trim().replace(/^['"]|['"]$/g, ""),
      };
      continue;
    }
    if (!current || indent !== propertyIndent) continue;
    const property = line.match(/^\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.+?)\s*$/);
    if (!property) continue;
    const [, key, raw] = property;
    const value = raw.replace(/\s+#.*$/, "").trim().replace(/^['"]|['"]$/g, "");
    if (key === "elementType") current.elementType = value;
    if (key === "bounds") {
      const bounds = value.match(/^\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]$/);
      if (bounds) [current.x, current.y, current.width, current.height] = bounds.slice(1).map(Number);
    }
  }
  if (current) elements.push(current);
  return elements;
}

function localResourcePaths(text) {
  const paths = new Set();
  const patterns = [
    /^\s*(?:src|url|path|image|poster)\s*:\s*([^#\n]+)$/gim,
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/gim,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1].trim().replace(/^['"]|['"]$/g, "");
      if (!value || /^(?:https?:|data:|blob:|#|\$)/i.test(value)) continue;
      if (/\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|m4a|ogg|ttf|otf|woff2?|pdf)(?:\?.*)?$/i.test(value)) {
        paths.add(value.replaceAll("\\", "/"));
      }
    }
  }
  return [...paths];
}

function safeProjectResource(projectDirectory, value) {
  if (!value || value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:\//.test(value)) return null;
  const parts = value.split("/");
  if (parts.includes("..")) return null;
  const path = resolve(projectDirectory, value);
  return path.startsWith(`${projectDirectory}${process.platform === "win32" ? "\\" : "/"}`) ? path : null;
}

export function createValidator({ projects, paths }) {
  return function validateProject({ projectPath }) {
    const errors = [];
    const warnings = [];
    const directory = projects.projectDirectory(projectPath);
    const manifest = projects.manifestPath(projectPath);
    const manifestText = readFileSync(manifest, "utf8");
    const manifestRelative = paths.toWorkspaceRelative(manifest);
    const size = manifestSize(manifestText);

    if (scalar(manifestText, "version") !== "v2") {
      errors.push(issue("UNSUPPORTED_PPTD_VERSION", "本地图片/PPTX 导出要求清单 version: v2。", manifestRelative));
    }
    if (!size.width || !size.height || size.width <= 0 || size.height <= 0) {
      errors.push(issue("INVALID_CANVAS_SIZE", "清单缺少有效的 size.width/size.height。", manifestRelative));
    }
    if (!scalar(manifestText, "title")) {
      warnings.push(issue("MISSING_TITLE", "清单未声明 title。", manifestRelative));
    }

    let pagePaths = [];
    try {
      pagePaths = /^\s*pages\s*:\s*\[\s*\]\s*(?:#.*)?$/m.test(manifestText)
        ? []
        : extractPagePaths(manifestText);
    } catch (error) {
      errors.push(issue("INVALID_PAGE_LIST", error.message, manifestRelative));
    }
    const duplicates = pagePaths.filter((path, index) => pagePaths.indexOf(path) !== index);
    for (const path of new Set(duplicates)) {
      errors.push(issue("DUPLICATE_PAGE", `清单重复引用页面：${path}`, manifestRelative));
    }

    const pages = [];
    for (const pagePath of pagePaths) {
      if (!pagePath.startsWith("pages/") || !pagePath.toLowerCase().endsWith(".page")) {
        errors.push(issue("INVALID_PAGE_PATH", `页面路径必须位于 pages/ 且以 .page 结尾：${pagePath}`, manifestRelative));
        continue;
      }
      const absolute = safeProjectResource(directory, pagePath);
      if (!absolute) {
        errors.push(issue("UNSAFE_PAGE_PATH", `页面路径越过项目目录：${pagePath}`, manifestRelative));
        continue;
      }
      if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        errors.push(issue("PAGE_NOT_FOUND", `页面文件不存在：${pagePath}`, pagePath));
        continue;
      }
      const text = readFileSync(absolute, "utf8");
      const page = { pagePath, elements: 0, resources: [] };
      if (!/^elements\s*:/m.test(text)) {
        errors.push(issue("MISSING_ELEMENTS", "页面缺少 elements 列表。", pagePath));
      }
      const elements = pageElements(text);
      page.elements = elements.length;
      const ids = new Set();
      for (const element of elements) {
        if (!element.elementId) {
          warnings.push(issue("MISSING_ELEMENT_ID", `第 ${element.line} 行附近的元素缺少 elementId。`, pagePath));
        } else if (ids.has(element.elementId)) {
          errors.push(issue("DUPLICATE_ELEMENT_ID", `重复的 elementId：${element.elementId}`, pagePath));
        } else {
          ids.add(element.elementId);
        }
        const values = [element.x, element.y, element.width, element.height];
        if (values.some((value) => value !== undefined && !Number.isFinite(value))) {
          errors.push(issue("INVALID_ELEMENT_GEOMETRY", `元素几何属性不是有效数字：${element.elementId || element.line}`, pagePath));
        }
        if (element.width !== undefined && element.width < 0 || element.height !== undefined && element.height < 0) {
          errors.push(issue("NEGATIVE_ELEMENT_SIZE", `元素宽高不能为负数：${element.elementId || element.line}`, pagePath));
        }
        if (size.width && size.height && element.x !== undefined && element.y !== undefined) {
          const right = element.x + (element.width || 0);
          const bottom = element.y + (element.height || 0);
          if (element.x < 0 || element.y < 0 || right > size.width || bottom > size.height) {
            warnings.push(issue("ELEMENT_OUT_OF_BOUNDS", `元素可能超出画布：${element.elementId || element.line}`, pagePath, {
              x: element.x, y: element.y, width: element.width, height: element.height,
            }));
          }
        }
      }
      page.resources = localResourcePaths(text);
      for (const resource of page.resources) {
        const resourcePath = safeProjectResource(directory, resource);
        if (!resourcePath) {
          errors.push(issue("UNSAFE_RESOURCE_PATH", `资源路径越过项目目录：${resource}`, pagePath));
        } else if (!existsSync(resourcePath)) {
          errors.push(issue("RESOURCE_NOT_FOUND", `本地资源不存在：${resource}`, pagePath));
        }
      }
      pages.push(page);
    }

    if (pagePaths.length === 0) {
      warnings.push(issue("EMPTY_DECK", "项目尚未包含页面。", manifestRelative));
    }

    return {
      valid: errors.length === 0,
      projectPath: paths.toWorkspaceRelative(directory),
      manifestPath: manifestRelative,
      canvas: size,
      pageCount: pagePaths.length,
      pages,
      errors,
      warnings,
      summary: `${errors.length} 个错误，${warnings.length} 个警告`,
    };
  };
}
