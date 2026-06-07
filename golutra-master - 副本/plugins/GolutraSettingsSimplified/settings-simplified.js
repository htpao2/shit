/**
 * GolutraSettingsSimplified — VCP 同步插件入口
 *
 * 核心功能：管理应用配置的读取、修改和持久化
 * 移植自：
 *   - src/features/global/settingsStore.ts:91-99 (SettingsState 类型)
 *   - src/features/global/settingsStore.ts:289-349 (normalizeSettings)
 *   - src/features/global/settingsStore.ts:368-373 (persistSettings)
 *   - src/features/global/settingsStore.ts:181-211 (normalizeCustomMember, buildCustomMembers)
 *   - src/features/global/settingsStore.ts:242-258 (normalizeTerminalPaths)
 *
 * 遵循 VCP 同步插件规范：
 *   1. 从 stdin 读取 JSON 参数
 *   2. 执行设置操作
 *   3. 将结果 JSON 打印到 stdout
 */

const fs = require('fs');
const path = require('path');

// ─── 配置 ───────────────────────────────────────────────────

const SETTINGS_FILE_PATH = process.env.SETTINGS_FILE_PATH || 'global-settings.json';
const CONFIG_BACKUP_ENABLED = process.env.CONFIG_BACKUP_ENABLED !== 'false';
const AUTO_SAVE_INTERVAL = parseInt(process.env.AUTO_SAVE_INTERVAL) || 300;

// ─── 默认设置模板 ────────────────────────────────────────────
// 移植自 settingsStore.ts:91-99 SettingsState 并展开各分类的默认值

const DEFAULT_SETTINGS = {
  appearance: {
    theme: 'dark',
    fontSize: 14,
    fontFamily: 'Be Vietnam Pro',
    sidebarWidth: 280,
    compactMode: false
  },
  locale: {
    language: 'en-US',
    timeZone: 'auto',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h'
  },
  account: {
    displayName: '',
    avatar: '',
    statusMessage: ''
  },
  notifications: {
    enabled: true,
    sound: true,
    desktop: true,
    mentionsOnly: false,
    quietHoursStart: '',
    quietHoursEnd: ''
  },
  keybinds: {
    profile: 'default',
    customBindings: {}
  },
  chat: {
    maxMessageLength: 1200,
    messagesPageLimit: 200,
    showTimestamps: true,
    enableMarkdown: true,
    compactMessages: false
  },
  members: {
    customMembers: [],
    terminalPaths: {},
    defaultUnlimitedAccess: false
  }
};

const VALID_CATEGORIES = ['appearance', 'locale', 'account', 'notifications', 'keybinds', 'chat', 'members'];

// ─── 工具函数 ───────────────────────────────────────────────

function resolveSettingsPath() {
  // 如果是绝对路径直接用，否则相对于 CWD
  if (path.isAbsolute(SETTINGS_FILE_PATH)) return SETTINGS_FILE_PATH;
  return path.resolve(process.cwd(), SETTINGS_FILE_PATH);
}

function loadSettings() {
  const filePath = resolveSettingsPath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch { /* ignore, return defaults */ }
  return null;
}

function saveSettings(settings) {
  const filePath = resolveSettingsPath();

  // 备份当前文件
  if (CONFIG_BACKUP_ENABLED && fs.existsSync(filePath)) {
    try {
      const backupPath = filePath + '.bak';
      fs.copyFileSync(filePath, backupPath);
    } catch { /* ignore backup errors */ }
  }

  // 确保目录存在
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * 归一化设置 — 确保所有分类和字段都存在且类型正确
 * 移植自 settingsStore.ts:289-349 normalizeSettings()
 */
function normalizeSettings(raw) {
  const result = {};

  for (const [category, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    const rawCategory = raw && raw[category] ? raw[category] : {};
    result[category] = {};

    for (const [key, defaultValue] of Object.entries(defaults)) {
      const rawValue = rawCategory[key];

      if (rawValue === undefined || rawValue === null) {
        result[category][key] = defaultValue;
      } else if (typeof defaultValue === 'boolean') {
        result[category][key] = Boolean(rawValue);
      } else if (typeof defaultValue === 'number') {
        const parsed = Number(rawValue);
        result[category][key] = isNaN(parsed) ? defaultValue : parsed;
      } else if (typeof defaultValue === 'string') {
        result[category][key] = String(rawValue);
      } else if (Array.isArray(defaultValue)) {
        result[category][key] = Array.isArray(rawValue) ? rawValue : defaultValue;
      } else if (typeof defaultValue === 'object') {
        result[category][key] = typeof rawValue === 'object' ? rawValue : defaultValue;
      } else {
        result[category][key] = rawValue;
      }
    }
  }

  // 归一化自定义成员
  if (result.members && Array.isArray(result.members.customMembers)) {
    result.members.customMembers = result.members.customMembers.map(normalizeCustomMember).filter(Boolean);
  }

  // 归一化终端路径
  if (result.members && result.members.terminalPaths) {
    result.members.terminalPaths = normalizeTerminalPaths(result.members.terminalPaths);
  }

  return result;
}

/**
 * 归一化自定义成员
 * 移植自 settingsStore.ts:181-211 normalizeCustomMember()
 */
function normalizeCustomMember(member) {
  if (!member || typeof member !== 'object') return null;
  if (!member.id || !member.terminalCommand) return null;

  return {
    id: String(member.id).trim(),
    displayName: String(member.displayName || member.id).trim(),
    terminalCommand: String(member.terminalCommand).trim(),
    terminalType: String(member.terminalType || '').trim() || null,
    avatar: member.avatar || null,
    description: String(member.description || '').trim(),
    unlimitedAccessFlag: member.unlimitedAccessFlag || null,
    enabled: member.enabled !== false
  };
}

/**
 * 归一化终端路径映射
 * 移植自 settingsStore.ts:242-258 normalizeTerminalPaths()
 */
function normalizeTerminalPaths(paths) {
  if (!paths || typeof paths !== 'object') return {};
  const result = {};
  for (const [key, value] of Object.entries(paths)) {
    const normalized = String(value || '').trim();
    if (normalized) result[key] = normalized;
  }
  return result;
}

/**
 * 通过点号路径获取嵌套值
 */
function getNestedValue(obj, keyPath) {
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * 通过点号路径设置嵌套值
 */
function setNestedValue(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

// ─── 命令处理 ────────────────────────────────────────────────

function handleGetSetting(args) {
  const key = args.key || args.Key;
  if (!key) return { status: 'error', result: '必须提供 key 参数' };

  // 加载并归一化设置
  const raw = loadSettings();
  const settings = normalizeSettings(raw || {});

  const value = getNestedValue(settings, key);
  if (value === undefined) {
    return { status: 'error', result: `配置项不存在: ${key}` };
  }

  return {
    status: 'success',
    result: {
      key,
      value,
      type: typeof value,
      category: key.split('.')[0]
    }
  };
}

function handleSetSetting(args) {
  const key = args.key || args.Key;
  const value = args.value !== undefined ? args.value : args.Value;

  if (!key) return { status: 'error', result: '必须提供 key 参数' };
  if (value === undefined) return { status: 'error', result: '必须提供 value 参数' };

  // 验证分类
  const category = key.split('.')[0];
  if (!VALID_CATEGORIES.includes(category)) {
    return {
      status: 'error',
      result: `无效的配置分类: ${category}。有效分类: ${VALID_CATEGORIES.join(', ')}`
    };
  }

  // 加载、修改、归一化、保存
  const raw = loadSettings() || {};
  setNestedValue(raw, key, value);
  const normalized = normalizeSettings(raw);

  try {
    saveSettings(normalized);
  } catch (err) {
    return { status: 'error', result: `保存设置失败: ${err.message}` };
  }

  const savedValue = getNestedValue(normalized, key);
  return {
    status: 'success',
    result: {
      key,
      value: savedValue,
      previousValue: getNestedValue(normalizeSettings(loadSettings() || {}), key),
      normalized: true,
      message: `配置项 ${key} 已更新`
    }
  };
}

function handleExportSettings(args) {
  const format = (args.format || 'json').toLowerCase();
  const categories = Array.isArray(args.categories) ? args.categories : null;

  const raw = loadSettings();
  const settings = normalizeSettings(raw || {});

  let exportData;
  if (categories && categories.length > 0) {
    exportData = {};
    for (const cat of categories) {
      if (settings[cat]) exportData[cat] = settings[cat];
    }
  } else {
    exportData = settings;
  }

  if (format === 'yaml') {
    // 简单的 YAML 序列化
    const yamlContent = jsonToSimpleYaml(exportData);
    return {
      status: 'success',
      result: {
        format: 'yaml',
        content: yamlContent,
        categories: Object.keys(exportData),
        exportedAt: new Date().toISOString()
      }
    };
  }

  return {
    status: 'success',
    result: {
      format: 'json',
      content: JSON.stringify(exportData, null, 2),
      categories: Object.keys(exportData),
      exportedAt: new Date().toISOString()
    }
  };
}

function handleImportSettings(args) {
  const configData = args.configData || args.config_data || args.data;
  const merge = args.merge !== false; // 默认合并

  if (!configData) return { status: 'error', result: '必须提供 configData 参数' };

  let importData;
  try {
    importData = typeof configData === 'string' ? JSON.parse(configData) : configData;
  } catch (err) {
    return { status: 'error', result: `解析导入数据失败: ${err.message}` };
  }

  const existing = loadSettings() || {};
  const conflicts = [];
  let merged;

  if (merge) {
    merged = { ...existing };
    for (const [category, values] of Object.entries(importData)) {
      if (VALID_CATEGORIES.includes(category)) {
        if (existing[category]) {
          // 检测冲突
          for (const [key, newValue] of Object.entries(values)) {
            if (existing[category][key] !== undefined &&
                JSON.stringify(existing[category][key]) !== JSON.stringify(newValue)) {
              conflicts.push({
                key: `${category}.${key}`,
                existingValue: existing[category][key],
                importedValue: newValue,
                resolution: 'overwritten'
              });
            }
          }
          merged[category] = { ...existing[category], ...values };
        } else {
          merged[category] = values;
        }
      }
    }
  } else {
    merged = importData;
  }

  const normalized = normalizeSettings(merged);

  try {
    saveSettings(normalized);
  } catch (err) {
    return { status: 'error', result: `保存导入设置失败: ${err.message}` };
  }

  return {
    status: 'success',
    result: {
      imported: true,
      mergeMode: merge,
      conflicts,
      conflictCount: conflicts.length,
      importedCategories: Object.keys(importData).filter(c => VALID_CATEGORIES.includes(c)),
      message: `设置已导入${conflicts.length > 0 ? `，有 ${conflicts.length} 个冲突已覆盖` : ''}`
    }
  };
}

function handleResetSettings(args) {
  const category = args.category || args.Category;

  if (category) {
    if (!VALID_CATEGORIES.includes(category)) {
      return {
        status: 'error',
        result: `无效的配置分类: ${category}。有效分类: ${VALID_CATEGORIES.join(', ')}`
      };
    }

    // 仅重置指定分类
    const raw = loadSettings() || {};
    raw[category] = DEFAULT_SETTINGS[category];
    const normalized = normalizeSettings(raw);

    try {
      saveSettings(normalized);
    } catch (err) {
      return { status: 'error', result: `保存重置设置失败: ${err.message}` };
    }

    return {
      status: 'success',
      result: {
        resetCategory: category,
        resetValues: DEFAULT_SETTINGS[category],
        message: `分类 ${category} 已恢复默认设置`
      }
    };
  }

  // 全量重置
  const normalized = normalizeSettings({});

  try {
    saveSettings(normalized);
  } catch (err) {
    return { status: 'error', result: `保存重置设置失败: ${err.message}` };
  }

  return {
    status: 'success',
    result: {
      resetAll: true,
      settings: normalized,
      message: '所有设置已恢复默认'
    }
  };
}

// ─── YAML 简易序列化 ────────────────────────────────────────

function jsonToSimpleYaml(obj, indent) {
  indent = indent || 0;
  const prefix = '  '.repeat(indent);
  const lines = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      lines.push(`${prefix}${key}: null`);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(jsonToSimpleYaml(value, indent + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        if (typeof item === 'object') {
          lines.push(`${prefix}  -`);
          lines.push(jsonToSimpleYaml(item, indent + 2));
        } else {
          lines.push(`${prefix}  - ${JSON.stringify(item)}`);
        }
      }
    } else if (typeof value === 'string') {
      lines.push(`${prefix}${key}: "${value}"`);
    } else {
      lines.push(`${prefix}${key}: ${value}`);
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
    case 'getSetting': return handleGetSetting(params);
    case 'setSetting': return handleSetSetting(params);
    case 'exportSettings': return handleExportSettings(params);
    case 'importSettings': return handleImportSettings(params);
    case 'resetSettings': return handleResetSettings(params);
    default:
      return { status: 'error', result: `Unknown command: ${command}. Available: getSetting, setSetting, exportSettings, importSettings, resetSettings` };
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
      result: '必须提供 command 参数。可用: getSetting, setSetting, exportSettings, importSettings, resetSettings'
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
