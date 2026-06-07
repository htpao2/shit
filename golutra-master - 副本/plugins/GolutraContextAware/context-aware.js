/**
 * GolutraContextAware — VCP 同步插件入口
 *
 * 核心功能：项目上下文理解、智能补全和提示词注入
 * 移植自：
 *   - src/features/workspace/projectStore.ts (项目数据归一化)
 *   - src/features/terminal/terminalMemberStore.ts (终端路径/类型解析)
 */

const fs = require('fs');
const path = require('path');

const ANALYSIS_DEPTH = parseInt(process.env.ANALYSIS_DEPTH) || 3;
const MAX_FILE_SCAN = parseInt(process.env.MAX_FILE_SCAN) || 500;
const SUPPORTED_FRAMEWORKS = (process.env.SUPPORTED_FRAMEWORKS || 'react,vue,angular,express,django,flask,spring').split(',');

// ─── 框架检测规则 ────────────────────────────────────────────

const FRAMEWORK_INDICATORS = {
  react: { files: ['package.json'], markers: ['"react"', '"react-dom"'] },
  vue: { files: ['package.json', 'vue.config.js', 'vite.config.ts'], markers: ['"vue"'] },
  angular: { files: ['angular.json', 'package.json'], markers: ['"@angular/core"'] },
  express: { files: ['package.json'], markers: ['"express"'] },
  nextjs: { files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], markers: ['"next"'] },
  nuxt: { files: ['nuxt.config.js', 'nuxt.config.ts'], markers: ['"nuxt"'] },
  django: { files: ['manage.py', 'settings.py'], markers: ['django'] },
  flask: { files: ['app.py', 'wsgi.py'], markers: ['flask'] },
  spring: { files: ['pom.xml', 'build.gradle'], markers: ['spring-boot'] },
  rust: { files: ['Cargo.toml'], markers: [] },
  go: { files: ['go.mod'], markers: [] },
  tauri: { files: ['src-tauri/tauri.conf.json', 'tauri.conf.json'], markers: ['"@tauri-apps"'] }
};

const BUILD_TOOL_FILES = {
  'package.json': 'npm/pnpm/yarn',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'package-lock.json': 'npm',
  'Cargo.toml': 'cargo',
  'go.mod': 'go',
  'pom.xml': 'maven',
  'build.gradle': 'gradle',
  'Makefile': 'make',
  'CMakeLists.txt': 'cmake',
  'requirements.txt': 'pip',
  'Pipfile': 'pipenv',
  'pyproject.toml': 'poetry/pip'
};

// ─── 项目分析 ────────────────────────────────────────────────

function scanDirectory(dirPath, depth, maxFiles) {
  const result = { dirs: [], files: [] };
  let fileCount = 0;

  function scan(currentPath, currentDepth) {
    if (currentDepth > depth || fileCount >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (fileCount >= maxFiles) break;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === 'target' || entry.name === 'dist' || entry.name === 'build') continue;
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(dirPath, fullPath);
      if (entry.isDirectory()) {
        result.dirs.push(relativePath);
        scan(fullPath, currentDepth + 1);
      } else {
        result.files.push(relativePath);
        fileCount++;
      }
    }
  }

  scan(dirPath, 0);
  return result;
}

function detectFrameworks(projectPath, files) {
  const detected = [];
  for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
    let found = false;
    for (const file of indicators.files) {
      if (files.includes(file) || fs.existsSync(path.join(projectPath, file))) {
        if (indicators.markers.length === 0) {
          found = true;
          break;
        }
        try {
          const content = fs.readFileSync(path.join(projectPath, file), 'utf8');
          if (indicators.markers.some(m => content.includes(m))) {
            found = true;
            break;
          }
        } catch { /* ignore */ }
      }
    }
    if (found) detected.push(framework);
  }
  return detected;
}

function detectBuildTools(projectPath, files) {
  const tools = [];
  for (const [file, tool] of Object.entries(BUILD_TOOL_FILES)) {
    if (files.includes(file) || fs.existsSync(path.join(projectPath, file))) {
      tools.push({ file, tool });
    }
  }
  return tools;
}

function detectLanguages(files) {
  const extMap = {};
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext) {
      extMap[ext] = (extMap[ext] || 0) + 1;
    }
  }
  const langMap = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript/React', '.js': 'JavaScript',
    '.jsx': 'JavaScript/React', '.vue': 'Vue', '.py': 'Python',
    '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.kt': 'Kotlin',
    '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.cpp': 'C++',
    '.c': 'C', '.swift': 'Swift', '.dart': 'Dart'
  };
  const languages = [];
  for (const [ext, count] of Object.entries(extMap).sort((a, b) => b[1] - a[1])) {
    if (langMap[ext]) languages.push({ language: langMap[ext], ext, count });
  }
  return languages;
}

function handleAnalyzeProject(args) {
  const projectPath = args.projectPath || args.project_path;
  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!fs.existsSync(projectPath)) return { status: 'error', result: `项目路径不存在: ${projectPath}` };

  const depth = args.depth || ANALYSIS_DEPTH;
  const { dirs, files } = scanDirectory(projectPath, depth, MAX_FILE_SCAN);
  const frameworks = detectFrameworks(projectPath, files);
  const buildTools = detectBuildTools(projectPath, files);
  const languages = detectLanguages(files);

  return {
    status: 'success',
    result: {
      projectPath,
      structure: { directories: dirs.length, files: files.length, scanDepth: depth },
      frameworks,
      buildTools,
      languages: languages.slice(0, 10),
      keyFiles: files.filter(f => ['package.json', 'Cargo.toml', 'go.mod', 'pom.xml', 'README.md', 'tsconfig.json', '.gitignore'].includes(path.basename(f)))
    }
  };
}

function handleGetSmartCompletion(args) {
  const partial = args.partial || '';
  if (!partial) return { status: 'error', result: '必须提供 partial 参数' };

  // 基于常用命令模式的补全建议
  const suggestions = [];
  const lower = partial.toLowerCase();

  const commonCommands = [
    { pattern: 'git', completions: ['git add .', 'git commit -m ""', 'git push', 'git pull', 'git status', 'git log --oneline'] },
    { pattern: 'npm', completions: ['npm install', 'npm run build', 'npm run dev', 'npm test', 'npm run lint'] },
    { pattern: 'pnpm', completions: ['pnpm install', 'pnpm run build', 'pnpm run dev', 'pnpm test'] },
    { pattern: 'cargo', completions: ['cargo build', 'cargo run', 'cargo test', 'cargo clippy', 'cargo fmt'] },
    { pattern: 'docker', completions: ['docker build .', 'docker compose up', 'docker ps', 'docker images'] }
  ];

  for (const { pattern, completions } of commonCommands) {
    if (lower.startsWith(pattern)) {
      for (const completion of completions) {
        if (completion.toLowerCase().startsWith(lower)) {
          suggestions.push({ text: completion, confidence: 0.8, source: 'common-commands' });
        }
      }
    }
  }

  return {
    status: 'success',
    result: { partial, suggestions, count: suggestions.length }
  };
}

function handleInjectPrompt(args) {
  const projectPath = args.projectPath || args.project_path;
  const task = args.task;
  const targetTool = args.targetTool || 'claude';

  if (!projectPath) return { status: 'error', result: '必须提供 projectPath 参数' };
  if (!task) return { status: 'error', result: '必须提供 task 参数' };

  // 分析项目以获取上下文
  const { dirs, files } = scanDirectory(projectPath, 2, 200);
  const frameworks = detectFrameworks(projectPath, files);
  const languages = detectLanguages(files);

  const techStack = frameworks.join(', ') || '未检测到特定框架';
  const primaryLang = languages.length > 0 ? languages[0].language : '未知';

  const prompt = [
    `项目上下文：`,
    `- 路径: ${projectPath}`,
    `- 主要语言: ${primaryLang}`,
    `- 技术栈: ${techStack}`,
    `- 文件数量: ${files.length}`,
    `- 目录数量: ${dirs.length}`,
    ``,
    `任务: ${task}`,
    ``,
    `请基于上述项目上下文完成任务。注意使用项目中已有的技术栈和编码风格。`
  ].join('\n');

  return {
    status: 'success',
    result: { prompt, targetTool, projectContext: { frameworks, primaryLanguage: primaryLang, fileCount: files.length } }
  };
}

// ─── 主入口 ─────────────────────────────────────────────────

async function main() {
  let inputData = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) { inputData += chunk; }

  let request;
  try { request = JSON.parse(inputData.trim()); }
  catch (err) { console.log(JSON.stringify({ status: 'error', result: `Invalid JSON: ${err.message}` })); process.exit(1); }

  const command = request.command || request.command1;
  if (!command) {
    console.log(JSON.stringify({ status: 'error', result: '必须提供 command 参数。可用: analyzeProject, getSmartCompletion, injectPrompt' }));
    process.exit(1);
  }

  let result;
  switch (command) {
    case 'analyzeProject': result = handleAnalyzeProject(request); break;
    case 'getSmartCompletion': result = handleGetSmartCompletion(request); break;
    case 'injectPrompt': result = handleInjectPrompt(request); break;
    default: result = { status: 'error', result: `Unknown command: ${command}` };
  }

  console.log(JSON.stringify(result));
  process.exit(0);
}

main().catch(err => { console.log(JSON.stringify({ status: 'error', result: err.message })); process.exit(1); });
