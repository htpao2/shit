/**
 * GolutraProjectAnalyzer — VCP 同步插件入口
 *
 * 核心功能：分析项目结构、依赖关系和技术栈
 * 移植自：
 *   - src/features/workspace/projectStore.ts:271-294 (normalizeProjectData)
 *   - GolutraContextAware 的框架检测逻辑（增强版）
 *
 * 遵循 VCP 同步插件规范：
 *   1. 从 stdin 读取 JSON 参数
 *   2. 执行分析操作
 *   3. 将结果 JSON 打印到 stdout
 */

const fs = require('fs');
const path = require('path');

// ─── 配置 ───────────────────────────────────────────────────

const MAX_DEPTH = parseInt(process.env.MAX_DEPTH) || 5;
const MAX_FILE_SCAN = parseInt(process.env.MAX_FILE_SCAN) || 1000;
const IGNORE_DIRS = (process.env.IGNORE_DIRS || 'node_modules,.git,dist,build,target,__pycache__,.tmp').split(',').map(d => d.trim());

// ─── 框架检测规则 ────────────────────────────────────────────

const FRAMEWORK_INDICATORS = {
  react: {
    files: ['package.json'],
    markers: ['"react"', '"react-dom"'],
    category: 'frontend'
  },
  vue: {
    files: ['package.json', 'vue.config.js', 'vite.config.ts', 'vite.config.js'],
    markers: ['"vue"'],
    category: 'frontend'
  },
  angular: {
    files: ['angular.json', 'package.json'],
    markers: ['"@angular/core"'],
    category: 'frontend'
  },
  svelte: {
    files: ['svelte.config.js', 'package.json'],
    markers: ['"svelte"'],
    category: 'frontend'
  },
  nextjs: {
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    markers: ['"next"'],
    category: 'fullstack'
  },
  nuxt: {
    files: ['nuxt.config.js', 'nuxt.config.ts'],
    markers: ['"nuxt"'],
    category: 'fullstack'
  },
  express: {
    files: ['package.json'],
    markers: ['"express"'],
    category: 'backend'
  },
  fastify: {
    files: ['package.json'],
    markers: ['"fastify"'],
    category: 'backend'
  },
  nestjs: {
    files: ['package.json', 'nest-cli.json'],
    markers: ['"@nestjs/core"'],
    category: 'backend'
  },
  django: {
    files: ['manage.py', 'settings.py'],
    markers: ['django'],
    category: 'backend'
  },
  flask: {
    files: ['app.py', 'wsgi.py'],
    markers: ['flask'],
    category: 'backend'
  },
  spring: {
    files: ['pom.xml', 'build.gradle'],
    markers: ['spring-boot'],
    category: 'backend'
  },
  tauri: {
    files: ['src-tauri/tauri.conf.json', 'tauri.conf.json'],
    markers: ['"@tauri-apps"'],
    category: 'desktop'
  },
  electron: {
    files: ['package.json'],
    markers: ['"electron"'],
    category: 'desktop'
  },
  rust: {
    files: ['Cargo.toml'],
    markers: [],
    category: 'system'
  },
  go: {
    files: ['go.mod'],
    markers: [],
    category: 'system'
  }
};

const PACKAGE_MANAGER_FILES = {
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
  'bun.lockb': 'bun'
};

const BUILD_TOOL_FILES = {
  'package.json': 'npm/node',
  'Cargo.toml': 'cargo',
  'go.mod': 'go',
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  'build.gradle.kts': 'gradle-kotlin',
  'Makefile': 'make',
  'CMakeLists.txt': 'cmake',
  'requirements.txt': 'pip',
  'Pipfile': 'pipenv',
  'pyproject.toml': 'poetry/pip',
  'setup.py': 'setuptools',
  'Dockerfile': 'docker',
  'docker-compose.yml': 'docker-compose',
  'docker-compose.yaml': 'docker-compose'
};

const LANGUAGE_MAP = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript/React', '.js': 'JavaScript',
  '.jsx': 'JavaScript/React', '.mjs': 'JavaScript/ESM', '.cjs': 'JavaScript/CJS',
  '.vue': 'Vue', '.svelte': 'Svelte',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go',
  '.java': 'Java', '.kt': 'Kotlin', '.scala': 'Scala',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.fs': 'F#',
  '.cpp': 'C++', '.cc': 'C++', '.c': 'C', '.h': 'C/C++ Header',
  '.swift': 'Swift', '.dart': 'Dart',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
  '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML',
  '.md': 'Markdown', '.sql': 'SQL', '.sh': 'Shell', '.bash': 'Bash',
  '.ps1': 'PowerShell', '.bat': 'Batch', '.cmd': 'Batch'
};

// ─── 工具函数 ───────────────────────────────────────────────

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function safeParseJSON(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

// ─── 目录扫描 ────────────────────────────────────────────────

function scanProject(projectPath, maxDepth, maxFiles) {
  const result = { dirs: [], files: [], totalSize: 0 };
  let fileCount = 0;

  function scan(currentPath, depth) {
    if (depth > maxDepth || fileCount >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (fileCount >= maxFiles) break;
      if (IGNORE_DIRS.includes(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.gitignore') continue;

      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(projectPath, fullPath);

      if (entry.isDirectory()) {
        result.dirs.push(relativePath);
        scan(fullPath, depth + 1);
      } else if (entry.isFile()) {
        let size = 0;
        try { size = fs.statSync(fullPath).size; } catch { /* ignore */ }
        result.files.push(relativePath);
        result.totalSize += size;
        fileCount++;
      }
    }
  }

  scan(projectPath, 0);
  return result;
}

// ─── 依赖分析 ────────────────────────────────────────────────

/**
 * 分析 Node.js 项目依赖
 * 移植自 projectStore.ts normalizeProjectData 对 package.json 的处理
 */
function analyzeNodeDependencies(projectPath) {
  const pkgPath = path.join(projectPath, 'package.json');
  const content = safeReadFile(pkgPath);
  if (!content) return null;

  const pkg = safeParseJSON(content);
  if (!pkg) return null;

  const dependencies = [];
  const devDependencies = [];
  const peerDependencies = [];

  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      dependencies.push({ name, version, type: 'production' });
    }
  }

  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      devDependencies.push({ name, version, type: 'development' });
    }
  }

  if (pkg.peerDependencies) {
    for (const [name, version] of Object.entries(pkg.peerDependencies)) {
      peerDependencies.push({ name, version, type: 'peer' });
    }
  }

  // 检测包管理器
  let packageManager = 'npm';
  for (const [file, manager] of Object.entries(PACKAGE_MANAGER_FILES)) {
    if (fileExists(path.join(projectPath, file))) {
      packageManager = manager;
      break;
    }
  }

  // 检查 scripts
  const scripts = pkg.scripts ? Object.keys(pkg.scripts) : [];

  return {
    name: pkg.name || path.basename(projectPath),
    version: pkg.version || '0.0.0',
    description: pkg.description || '',
    packageManager,
    dependencies,
    devDependencies,
    peerDependencies,
    scripts,
    totalDeps: dependencies.length + devDependencies.length + peerDependencies.length
  };
}

/**
 * 分析 Rust 项目依赖
 */
function analyzeRustDependencies(projectPath) {
  const cargoPath = path.join(projectPath, 'Cargo.toml');
  const content = safeReadFile(cargoPath);
  if (!content) return null;

  const dependencies = [];
  const devDependencies = [];
  let currentSection = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      currentSection = trimmed.replace(/[\[\]]/g, '').trim();
      continue;
    }

    if (trimmed.includes('=') && !trimmed.startsWith('#')) {
      const [name, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim().replace(/"/g, '');

      if (currentSection === 'dependencies') {
        dependencies.push({ name: name.trim(), version: value, type: 'production' });
      } else if (currentSection === 'dev-dependencies') {
        devDependencies.push({ name: name.trim(), version: value, type: 'development' });
      }
    }
  }

  // 获取 package 信息
  let projectName = path.basename(projectPath);
  let projectVersion = '0.1.0';
  const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
  const versionMatch = content.match(/^\s*version\s*=\s*"([^"]+)"/m);
  if (nameMatch) projectName = nameMatch[1];
  if (versionMatch) projectVersion = versionMatch[1];

  return {
    name: projectName,
    version: projectVersion,
    packageManager: 'cargo',
    dependencies,
    devDependencies,
    peerDependencies: [],
    scripts: [],
    totalDeps: dependencies.length + devDependencies.length
  };
}

/**
 * 分析 Python 项目依赖
 */
function analyzePythonDependencies(projectPath) {
  const dependencies = [];

  // requirements.txt
  const reqPath = path.join(projectPath, 'requirements.txt');
  const reqContent = safeReadFile(reqPath);
  if (reqContent) {
    for (const line of reqContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/[>=<~!]+/);
      const name = parts[0].trim();
      const version = parts.length > 1 ? trimmed.replace(name, '').trim() : '*';
      if (name) dependencies.push({ name, version, type: 'production' });
    }
  }

  // pyproject.toml (简单解析)
  const pyprojectPath = path.join(projectPath, 'pyproject.toml');
  const pyContent = safeReadFile(pyprojectPath);
  if (pyContent) {
    let projectName = path.basename(projectPath);
    const nameMatch = pyContent.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (nameMatch) projectName = nameMatch[1];

    return {
      name: projectName,
      version: '0.1.0',
      packageManager: 'pip/poetry',
      dependencies,
      devDependencies: [],
      peerDependencies: [],
      scripts: [],
      totalDeps: dependencies.length
    };
  }

  if (dependencies.length > 0) {
    return {
      name: path.basename(projectPath),
      version: '0.1.0',
      packageManager: 'pip',
      dependencies,
      devDependencies: [],
      peerDependencies: [],
      scripts: [],
      totalDeps: dependencies.length
    };
  }

  return null;
}

/**
 * 分析 Go 项目依赖
 */
function analyzeGoDependencies(projectPath) {
  const goModPath = path.join(projectPath, 'go.mod');
  const content = safeReadFile(goModPath);
  if (!content) return null;

  const dependencies = [];
  let moduleName = path.basename(projectPath);
  let goVersion = '';
  let inRequire = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('module ')) {
      moduleName = trimmed.replace('module ', '').trim();
    } else if (trimmed.startsWith('go ')) {
      goVersion = trimmed.replace('go ', '').trim();
    } else if (trimmed === 'require (') {
      inRequire = true;
    } else if (trimmed === ')') {
      inRequire = false;
    } else if (inRequire && trimmed && !trimmed.startsWith('//')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        dependencies.push({ name: parts[0], version: parts[1], type: 'production' });
      }
    } else if (trimmed.startsWith('require ') && !trimmed.includes('(')) {
      const parts = trimmed.replace('require ', '').trim().split(/\s+/);
      if (parts.length >= 2) {
        dependencies.push({ name: parts[0], version: parts[1], type: 'production' });
      }
    }
  }

  return {
    name: moduleName,
    version: goVersion || '0.0.0',
    packageManager: 'go',
    dependencies,
    devDependencies: [],
    peerDependencies: [],
    scripts: [],
    totalDeps: dependencies.length
  };
}

// ─── 框架和语言检测 ──────────────────────────────────────────

function detectFrameworks(projectPath, files) {
  const detected = [];

  for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
    let found = false;

    for (const file of indicators.files) {
      const fullPath = path.join(projectPath, file);
      if (files.includes(file) || fileExists(fullPath)) {
        if (indicators.markers.length === 0) {
          found = true;
          break;
        }
        const content = safeReadFile(fullPath);
        if (content && indicators.markers.some(m => content.includes(m))) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      detected.push({ name: framework, category: indicators.category });
    }
  }

  return detected;
}

function detectBuildTools(projectPath, files) {
  const tools = [];
  for (const [file, tool] of Object.entries(BUILD_TOOL_FILES)) {
    if (files.includes(file) || fileExists(path.join(projectPath, file))) {
      tools.push({ file, tool });
    }
  }
  return tools;
}

function detectLanguages(files) {
  const extStats = {};
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext && LANGUAGE_MAP[ext]) {
      if (!extStats[ext]) extStats[ext] = { language: LANGUAGE_MAP[ext], ext, count: 0 };
      extStats[ext].count++;
    }
  }

  return Object.values(extStats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function detectEntryFiles(projectPath, files) {
  const entryPatterns = [
    'src/main.ts', 'src/main.js', 'src/index.ts', 'src/index.js',
    'src/app.ts', 'src/app.js', 'src/App.vue', 'src/App.tsx',
    'index.html', 'index.ts', 'index.js', 'main.ts', 'main.js',
    'app.py', 'main.py', 'main.go', 'cmd/main.go',
    'src/main.rs', 'src/lib.rs'
  ];

  return entryPatterns.filter(p => files.includes(p) || fileExists(path.join(projectPath, p)));
}

// ─── 命令处理 ────────────────────────────────────────────────

function handleAnalyzeDependencies(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  const deep = Boolean(args.deep);

  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!fileExists(projectPath)) return { status: 'error', result: `项目路径不存在: ${projectPath}` };

  // 尝试各种项目类型的依赖分析
  const results = {};
  let mainResult = null;

  const nodeDeps = analyzeNodeDependencies(projectPath);
  if (nodeDeps) { results.node = nodeDeps; mainResult = nodeDeps; }

  const rustDeps = analyzeRustDependencies(projectPath);
  if (rustDeps) { results.rust = rustDeps; if (!mainResult) mainResult = rustDeps; }

  const pythonDeps = analyzePythonDependencies(projectPath);
  if (pythonDeps) { results.python = pythonDeps; if (!mainResult) mainResult = pythonDeps; }

  const goDeps = analyzeGoDependencies(projectPath);
  if (goDeps) { results.go = goDeps; if (!mainResult) mainResult = goDeps; }

  // Tauri 项目同时有 Node 和 Rust
  if (results.node && results.rust) {
    results.projectType = 'tauri/hybrid';
  }

  // 深度分析：检查子目录
  if (deep) {
    const subDirs = [];
    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !IGNORE_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
          const subPath = path.join(projectPath, entry.name);
          if (fileExists(path.join(subPath, 'package.json')) ||
              fileExists(path.join(subPath, 'Cargo.toml')) ||
              fileExists(path.join(subPath, 'go.mod'))) {
            subDirs.push({ name: entry.name, path: subPath });
          }
        }
      }
    } catch { /* ignore */ }

    if (subDirs.length > 0) {
      results.workspaces = subDirs.map(sub => ({
        name: sub.name,
        ...({ node: analyzeNodeDependencies(sub.path), rust: analyzeRustDependencies(sub.path) })
      }));
    }
  }

  if (!mainResult) {
    return { status: 'error', result: '未找到可识别的依赖配置文件 (package.json/Cargo.toml/go.mod/requirements.txt)' };
  }

  return {
    status: 'success',
    result: {
      projectPath,
      ...results,
      summary: {
        totalProduction: Object.values(results).reduce((sum, r) => sum + (r.dependencies ? r.dependencies.length : 0), 0),
        totalDev: Object.values(results).reduce((sum, r) => sum + (r.devDependencies ? r.devDependencies.length : 0), 0),
        ecosystems: Object.keys(results).filter(k => k !== 'projectType' && k !== 'workspaces')
      }
    }
  };
}

function handleDetectFramework(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!fileExists(projectPath)) return { status: 'error', result: `项目路径不存在: ${projectPath}` };

  const { files } = scanProject(projectPath, 2, 500);
  const frameworks = detectFrameworks(projectPath, files);
  const buildTools = detectBuildTools(projectPath, files);
  const languages = detectLanguages(files);
  const entryFiles = detectEntryFiles(projectPath, files);

  return {
    status: 'success',
    result: {
      projectPath,
      frameworks,
      buildTools,
      languages,
      entryFiles,
      summary: {
        frameworkCount: frameworks.length,
        primaryFramework: frameworks.length > 0 ? frameworks[0].name : null,
        primaryLanguage: languages.length > 0 ? languages[0].language : null
      }
    }
  };
}

function handleGenerateProjectReport(args) {
  const projectPath = args.projectPath || args.project_path || args.path;
  const format = (args.format || 'json').toLowerCase();

  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!fileExists(projectPath)) return { status: 'error', result: `项目路径不存在: ${projectPath}` };

  // 综合分析
  const { dirs, files, totalSize } = scanProject(projectPath, MAX_DEPTH, MAX_FILE_SCAN);
  const frameworks = detectFrameworks(projectPath, files);
  const buildTools = detectBuildTools(projectPath, files);
  const languages = detectLanguages(files);
  const entryFiles = detectEntryFiles(projectPath, files);

  // 依赖分析
  const nodeDeps = analyzeNodeDependencies(projectPath);
  const rustDeps = analyzeRustDependencies(projectPath);
  const pythonDeps = analyzePythonDependencies(projectPath);
  const goDeps = analyzeGoDependencies(projectPath);

  const report = {
    projectPath,
    projectName: (nodeDeps && nodeDeps.name) || (rustDeps && rustDeps.name) || path.basename(projectPath),
    generatedAt: new Date().toISOString(),
    structure: {
      totalDirectories: dirs.length,
      totalFiles: files.length,
      totalSize,
      totalSizeHuman: formatSize(totalSize),
      scanDepth: MAX_DEPTH
    },
    techStack: {
      frameworks,
      buildTools,
      primaryLanguage: languages.length > 0 ? languages[0].language : 'Unknown',
      languages
    },
    entryFiles,
    dependencies: {
      node: nodeDeps,
      rust: rustDeps,
      python: pythonDeps,
      go: goDeps
    },
    keyFiles: files.filter(f => [
      'package.json', 'Cargo.toml', 'go.mod', 'pom.xml',
      'README.md', 'readme.md', 'LICENSE', 'Dockerfile',
      'tsconfig.json', '.gitignore', '.editorconfig',
      'docker-compose.yml', 'docker-compose.yaml'
    ].includes(path.basename(f)))
  };

  if (format === 'markdown') {
    const md = generateMarkdownReport(report);
    return { status: 'success', result: { format: 'markdown', report: md, data: report } };
  }

  return { status: 'success', result: { format: 'json', report } };
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function generateMarkdownReport(report) {
  const lines = [
    `# 项目分析报告: ${report.projectName}`,
    ``,
    `> 生成时间: ${report.generatedAt}`,
    `> 项目路径: ${report.projectPath}`,
    ``,
    `## 项目结构`,
    `- 目录数: ${report.structure.totalDirectories}`,
    `- 文件数: ${report.structure.totalFiles}`,
    `- 总大小: ${report.structure.totalSizeHuman}`,
    ``
  ];

  if (report.techStack.frameworks.length > 0) {
    lines.push(`## 技术栈`);
    lines.push(`| 框架 | 类别 |`);
    lines.push(`|------|------|`);
    for (const fw of report.techStack.frameworks) {
      lines.push(`| ${fw.name} | ${fw.category} |`);
    }
    lines.push('');
  }

  if (report.techStack.languages.length > 0) {
    lines.push(`## 编程语言`);
    lines.push(`| 语言 | 文件数 |`);
    lines.push(`|------|--------|`);
    for (const lang of report.techStack.languages) {
      lines.push(`| ${lang.language} | ${lang.count} |`);
    }
    lines.push('');
  }

  if (report.techStack.buildTools.length > 0) {
    lines.push(`## 构建工具`);
    for (const bt of report.techStack.buildTools) {
      lines.push(`- **${bt.tool}** (${bt.file})`);
    }
    lines.push('');
  }

  if (report.entryFiles.length > 0) {
    lines.push(`## 入口文件`);
    for (const ef of report.entryFiles) {
      lines.push(`- \`${ef}\``);
    }
    lines.push('');
  }

  const deps = report.dependencies;
  const allDeps = [
    ...(deps.node ? [{ eco: 'Node.js', data: deps.node }] : []),
    ...(deps.rust ? [{ eco: 'Rust', data: deps.rust }] : []),
    ...(deps.python ? [{ eco: 'Python', data: deps.python }] : []),
    ...(deps.go ? [{ eco: 'Go', data: deps.go }] : [])
  ];

  if (allDeps.length > 0) {
    lines.push(`## 依赖概览`);
    for (const { eco, data } of allDeps) {
      lines.push(`### ${eco} (${data.packageManager})`);
      lines.push(`- 生产依赖: ${data.dependencies.length}`);
      lines.push(`- 开发依赖: ${data.devDependencies.length}`);
      if (data.scripts.length > 0) {
        lines.push(`- 可用脚本: ${data.scripts.join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── 批量调用支持 ───────────────────────────────────────────

function extractParamsForIndex(request, index) {
  const params = {};
  const suffix = String(index);
  for (const [key, value] of Object.entries(request)) {
    if (key === `command${suffix}`) continue;
    if (key.endsWith(suffix)) {
      const baseKey = key.slice(0, -suffix.length);
      if (baseKey) params[baseKey] = value;
    }
  }
  return params;
}

function handleSingleCommand(command, params) {
  switch (command) {
    case 'analyzeDependencies': return handleAnalyzeDependencies(params);
    case 'detectFramework': return handleDetectFramework(params);
    case 'generateProjectReport': return handleGenerateProjectReport(params);
    default: return { status: 'error', result: `Unknown command: ${command}. Available: analyzeDependencies, detectFramework, generateProjectReport` };
  }
}

// ─── 主入口 ─────────────────────────────────────────────────

async function main() {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  let request;
  try {
    request = JSON.parse(inputData.trim());
  } catch (err) {
    console.log(JSON.stringify({ status: 'error', result: `Invalid JSON input: ${err.message}` }));
    process.exit(1);
  }

  const command = request.command || request.command1;

  if (!command) {
    console.log(JSON.stringify({
      status: 'error',
      result: '必须提供 command 参数。可用: analyzeDependencies, detectFramework, generateProjectReport'
    }));
    process.exit(1);
  }

  // 批量调用
  if (request.command1 && request.command2) {
    const results = [];
    let index = 1;
    while (request[`command${index}`]) {
      const cmd = request[`command${index}`];
      const params = extractParamsForIndex(request, index);
      results.push({ command: cmd, index, ...handleSingleCommand(cmd, params) });
      index++;
    }
    console.log(JSON.stringify({
      status: 'success',
      result: { batchResults: results, totalCommands: index - 1 }
    }));
    process.exit(0);
  }

  // 单命令
  const result = handleSingleCommand(command, request);
  console.log(JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.log(JSON.stringify({ status: 'error', result: `Plugin execution failed: ${err.message}` }));
  process.exit(1);
});
