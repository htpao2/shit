/**
 * CLI 工具注册表 — 移植自 src-tauri/src/terminal_engine/default_members/registry.rs
 *
 * 管理所有支持的 AI CLI 工具的配置信息，包括：
 * - 默认命令
 * - unlimited access flag
 * - 会话恢复命令模板
 * - PostReady 步骤
 */

const CLI_TOOLS = {
  claude: {
    id: 'claude-code',
    terminalType: 'claude',
    defaultCommand: 'claude',
    unlimitedAccessFlag: '--dangerously-skip-permissions',
    resumeCommandTemplate: null,
    envKey: 'CLAUDE_CODE_PATH',
    postReadySteps: [{ type: 'introduction', promptType: 'ai_onboarding', requireStable: true }]
  },
  gemini: {
    id: 'gemini-cli',
    terminalType: 'gemini',
    defaultCommand: 'gemini',
    unlimitedAccessFlag: null,
    resumeCommandTemplate: null,
    envKey: 'GEMINI_CLI_PATH',
    postReadySteps: [{ type: 'introduction', promptType: 'ai_onboarding', requireStable: true }]
  },
  codex: {
    id: 'codex-cli',
    terminalType: 'codex',
    defaultCommand: 'codex',
    unlimitedAccessFlag: '--full-auto',
    resumeCommandTemplate: null,
    envKey: 'CODEX_CLI_PATH',
    postReadySteps: [{ type: 'introduction', promptType: 'ai_onboarding', requireStable: true }]
  },
  opencode: {
    id: 'opencode',
    terminalType: 'opencode',
    defaultCommand: 'opencode',
    unlimitedAccessFlag: null,
    resumeCommandTemplate: null,
    envKey: 'OPENCODE_PATH',
    postReadySteps: [{ type: 'introduction', promptType: 'ai_onboarding', requireStable: true }]
  },
  qwen: {
    id: 'qwen-code',
    terminalType: 'qwen',
    defaultCommand: 'qwen',
    unlimitedAccessFlag: null,
    resumeCommandTemplate: null,
    envKey: 'QWEN_CODE_PATH',
    postReadySteps: [{ type: 'introduction', promptType: 'ai_onboarding', requireStable: true }]
  },
  shell: {
    id: 'shell',
    terminalType: 'shell',
    defaultCommand: '',
    unlimitedAccessFlag: null,
    resumeCommandTemplate: null,
    envKey: 'DEFAULT_SHELL',
    postReadySteps: []
  }
};

/**
 * 根据终端类型查找工具配置
 * 移植自 registry.rs resolve_default_member()
 * @param {string} terminalType
 * @returns {object|null}
 */
function resolveDefaultMember(terminalType) {
  const normalized = (terminalType || '').trim().toLowerCase();
  return CLI_TOOLS[normalized] || null;
}

/**
 * 检查命令是否包含指定 flag
 * 移植自 registry.rs command_contains_flag()
 * @param {string} command
 * @param {string} flag
 * @returns {boolean}
 */
function commandContainsFlag(command, flag) {
  return command.split(/\s+/).some(part => part === flag);
}

/**
 * 应用 unlimited access flag 到命令
 * 移植自 registry.rs apply_unlimited_access_command()
 * @param {string} terminalType
 * @param {string|null} command
 * @param {boolean} unlimitedAccess
 * @returns {string|null}
 */
function applyUnlimitedAccessCommand(terminalType, command, unlimitedAccess) {
  const trimmed = command ? command.trim() : null;
  const normalizedCommand = trimmed && trimmed.length > 0 ? trimmed : null;

  if (!unlimitedAccess) {
    return normalizedCommand;
  }

  const member = resolveDefaultMember(terminalType);
  if (!member) return normalizedCommand;

  const flag = member.unlimitedAccessFlag;
  if (!flag) return normalizedCommand;

  const defaultCmd = member.defaultCommand;
  if (!defaultCmd || defaultCmd.trim().length === 0) return normalizedCommand;

  // 仅当命令为空或与默认命令相同时才应用
  const shouldApply = !normalizedCommand || normalizedCommand === defaultCmd;
  if (!shouldApply) return normalizedCommand;

  const base = normalizedCommand || defaultCmd;
  if (commandContainsFlag(base, flag)) {
    return base;
  }

  return `${base} ${flag}`;
}

/**
 * 应用会话恢复命令
 * 移植自 registry.rs apply_resume_command()
 * @param {string} terminalType
 * @param {string|null} command
 * @param {string|null} sessionId
 * @returns {string|null}
 */
function applyResumeCommand(terminalType, command, sessionId) {
  const trimmedSessionId = sessionId ? sessionId.trim() : null;
  if (!trimmedSessionId) return command;

  const member = resolveDefaultMember(terminalType);
  if (!member) return command;

  const template = member.resumeCommandTemplate;
  if (!template) return command;

  const resumeArgs = template.replace('{session_id}', trimmedSessionId);
  const trimmedCommand = command ? command.trim() : null;
  let base = trimmedCommand && trimmedCommand.length > 0 ? trimmedCommand : member.defaultCommand;

  // 已经包含 resume 或 session id 则跳过
  if (base.split(/\s+/).some(part => part.toLowerCase() === 'resume') || base.includes(trimmedSessionId)) {
    return base;
  }

  return `${base} ${resumeArgs}`;
}

/**
 * 构建指定工具的完整执行命令
 * 综合 unlimited access 和 resume 功能
 * @param {string} tool 工具名称
 * @param {object} options 选项
 * @returns {string}
 */
function buildCommand(tool, options = {}) {
  const member = resolveDefaultMember(tool);
  if (!member) {
    throw new Error(`Unknown CLI tool: ${tool}`);
  }

  // 从环境变量获取自定义路径，否则使用默认命令
  const envPath = process.env[member.envKey];
  let command = envPath && envPath.trim() ? envPath.trim() : member.defaultCommand;

  // 应用 unlimited access
  if (options.unlimitedAccess) {
    command = applyUnlimitedAccessCommand(tool, command, true) || command;
  }

  // 应用会话恢复
  if (options.resumeSessionId) {
    command = applyResumeCommand(tool, command, options.resumeSessionId) || command;
  }

  return command;
}

/**
 * 获取所有工具的列表及其当前配置
 * @returns {Array<object>}
 */
function listAllTools() {
  return Object.entries(CLI_TOOLS).map(([name, config]) => {
    const envPath = process.env[config.envKey];
    const resolvedPath = envPath && envPath.trim() ? envPath.trim() : config.defaultCommand;
    return {
      name,
      id: config.id,
      terminalType: config.terminalType,
      defaultCommand: config.defaultCommand,
      resolvedPath,
      hasUnlimitedAccess: Boolean(config.unlimitedAccessFlag),
      unlimitedAccessFlag: config.unlimitedAccessFlag,
      canResumeSession: Boolean(config.resumeCommandTemplate),
      postReadySteps: config.postReadySteps
    };
  });
}

/**
 * 获取指定工具的详细配置
 * @param {string} toolName
 * @returns {object}
 */
function getToolConfig(toolName) {
  const member = resolveDefaultMember(toolName);
  if (!member) {
    return { error: `Unknown tool: ${toolName}`, available: Object.keys(CLI_TOOLS) };
  }

  const envPath = process.env[member.envKey];
  return {
    name: toolName,
    id: member.id,
    terminalType: member.terminalType,
    defaultCommand: member.defaultCommand,
    resolvedPath: envPath && envPath.trim() ? envPath.trim() : member.defaultCommand,
    envKey: member.envKey,
    unlimitedAccessFlag: member.unlimitedAccessFlag,
    resumeCommandTemplate: member.resumeCommandTemplate,
    postReadySteps: member.postReadySteps
  };
}

module.exports = {
  CLI_TOOLS,
  resolveDefaultMember,
  applyUnlimitedAccessCommand,
  applyResumeCommand,
  buildCommand,
  listAllTools,
  getToolConfig
};
