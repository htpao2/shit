Troubleshooting | ChromeDevTools/chrome-devtools-mcp | DeepWiki

[Index your code with Devin](#private-repo)

[DeepWiki](https://deepwiki.com)

[DeepWiki](#)

[ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)

[Index your code with](#private-repo)

[Devin](#private-repo)

Share

Last indexed: 24 September 2025 ([1ed7e4](https://github.com/ChromeDevTools/chrome-devtools-mcp/commits/1ed7e45f))

- [Overview](#ChromeDevTools/chrome-devtools-mcp/1-overview)
- [Installation and Setup](#ChromeDevTools/chrome-devtools-mcp/2-installation-and-setup)
- [Architecture Overview](#ChromeDevTools/chrome-devtools-mcp/3-architecture-overview)
- [MCP Server and CLI](#ChromeDevTools/chrome-devtools-mcp/3.1-mcp-server-and-cli)
- [Browser Management](#ChromeDevTools/chrome-devtools-mcp/3.2-browser-management)
- [Tool System](#ChromeDevTools/chrome-devtools-mcp/3.3-tool-system)
- [Response Formatting](#ChromeDevTools/chrome-devtools-mcp/3.4-response-formatting)
- [Event Handling and Synchronization](#ChromeDevTools/chrome-devtools-mcp/3.5-event-handling-and-synchronization)
- [Tools Reference](#ChromeDevTools/chrome-devtools-mcp/4-tools-reference)
- [Input Automation Tools](#ChromeDevTools/chrome-devtools-mcp/4.1-input-automation-tools)
- [Navigation and Page Management](#ChromeDevTools/chrome-devtools-mcp/4.2-navigation-and-page-management)
- [Performance Analysis Tools](#ChromeDevTools/chrome-devtools-mcp/4.3-performance-analysis-tools)
- [Debugging and Scripting Tools](#ChromeDevTools/chrome-devtools-mcp/4.4-debugging-and-scripting-tools)
- [Network and Emulation Tools](#ChromeDevTools/chrome-devtools-mcp/4.5-network-and-emulation-tools)
- [Development and Contributing](#ChromeDevTools/chrome-devtools-mcp/5-development-and-contributing)
- [Building and Testing](#ChromeDevTools/chrome-devtools-mcp/5.1-building-and-testing)
- [Creating New Tools](#ChromeDevTools/chrome-devtools-mcp/5.2-creating-new-tools)
- [Release Process](#ChromeDevTools/chrome-devtools-mcp/5.3-release-process)
- [Configuration Reference](#ChromeDevTools/chrome-devtools-mcp/6-configuration-reference)
- [Troubleshooting](#ChromeDevTools/chrome-devtools-mcp/7-troubleshooting)

Menu

# Troubleshooting

Relevant source files

- [CONTRIBUTING.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CONTRIBUTING.md)
- [README.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md)
- [src/browser.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts)
- [src/logger.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/logger.ts)

This page provides solutions for common issues encountered when using the Chrome DevTools MCP server, debugging techniques, and guidance for diagnosing problems. It covers browser connection failures, configuration issues, timeout problems, and development setup issues.

For configuration reference, see [Configuration Reference](#ChromeDevTools/chrome-devtools-mcp/6-configuration-reference). For development setup guidance, see [Development and Contributing](#ChromeDevTools/chrome-devtools-mcp/5-development-and-contributing).

## Common Issues and Quick Solutions

### Browser Launch Failures

The most common issue is browser launch failure due to user data directory conflicts or sandboxing restrictions.

**Problem**: Error message "The browser is already running" **Solution**: Use the `--isolated` flag to create a temporary user data directory:

```
```

**Problem**: Browser fails to start in sandboxed environments **Solution**: Use `--browserUrl` to connect to an externally launched Chrome instance:

```
```

### Connection and Timeout Issues

**Problem**: `protocolTimeout` errors during tool execution **Cause**: The 10-second CDP command timeout defined in [src/browser.ts42](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L42-L42) **Solution**: Check network conditions and page complexity; consider using performance tools to identify bottlenecks.

**Problem**: Target connection failures **Cause**: Target filtering logic in [src/browser.ts27-37](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L27-L37) excludes certain URLs **Solution**: Verify the target URL is not prefixed with excluded patterns (`chrome://`, `chrome-extension://`, etc.)

### Tool Execution Problems

| Problem                    | Likely Cause                      | Solution                                        |
| -------------------------- | --------------------------------- | ----------------------------------------------- |
| Tool returns empty results | Browser not fully loaded          | Use `wait_for` tool before other operations     |
| Performance trace fails    | DevTools not properly initialized | Restart browser with `--isolated` flag          |
| Screenshot/snapshot empty  | Page not rendered                 | Add wait conditions or check console for errors |
| Network requests missing   | Timing issue                      | Enable network domain before navigation         |

Sources: [src/browser.ts27-37](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L27-L37) [src/browser.ts42](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L42-L42) [README.md224-232](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L224-L232)

## Diagnostic Flow

```
```

Sources: [src/browser.ts20-25](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L20-L25) [src/browser.ts42](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L42-L42) [src/browser.ts119-132](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L119-L132)

## Debug Logging and Analysis

### Enabling Debug Logs

Use the `--log-file` argument to capture detailed execution logs:

```
```

The logging system in [src/logger.ts10-15](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/logger.ts#L10-L15) enables the `mcp:log` namespace by default and respects the `DEBUG` environment variable for additional categories.

### Log Analysis Checklist

1. **Browser Process Logs**: Check if Chrome stderr/stdout is captured ([src/browser.ts113-115](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L113-L115))
2. **Protocol Timeout**: Look for CDP command timeouts (10-second limit)
3. **Target Filtering**: Verify targets aren't excluded by `targetFilter`
4. **Connection State**: Check `browser?.connected` status

### Common Log Patterns

| Pattern                          | Meaning                              | Action                                |
| -------------------------------- | ------------------------------------ | ------------------------------------- |
| `Target closed`                  | Browser tab/page closed unexpectedly | Check page stability                  |
| `Connection closed`              | Browser process terminated           | Check browser launch parameters       |
| `protocolTimeout`                | CDP command exceeded 10s             | Investigate page performance          |
| `The browser is already running` | User data directory conflict         | Use `--isolated` or different profile |

Sources: [src/logger.ts10-15](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/logger.ts#L10-L15) [src/browser.ts113-115](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L113-L115) [src/browser.ts119-132](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L119-L132)

## Browser Connection Troubleshooting

### Connection Methods and Issues

```
```

### Fixing Connection Issues

**External Browser Connection (`--browserUrl`)**:

- Ensure Chrome is started with `--remote-debugging-port=9222`
- Verify the debugging port is accessible
- Check firewall settings for port forwarding

**Managed Browser Launch**:

- User data directory conflicts: Use `--isolated` flag
- Missing executable: Specify `--executablePath` or `--channel`
- Sandbox restrictions: Launch Chrome manually and connect via `--browserUrl`

Sources: [src/browser.ts45-55](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L45-L55) [src/browser.ts135-143](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L135-L143) [src/browser.ts145-159](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L145-L159)

## Configuration and Environment Issues

### Chrome Channel Problems

The system supports multiple Chrome channels through the `--channel` option:

| Channel  | Puppeteer Channel | Common Issues                     |
| -------- | ----------------- | --------------------------------- |
| `stable` | `chrome`          | Default, most stable              |
| `canary` | `chrome-canary`   | May have compatibility issues     |
| `beta`   | `chrome-beta`     | Intermediate stability            |
| `dev`    | `chrome-dev`      | Development features, less stable |

Channel resolution logic is in [src/browser.ts91-97](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L91-L97) If a channel fails to launch, try:

1. Verify the channel is installed
2. Use `--executablePath` to specify exact binary location
3. Fall back to `stable` channel

### User Data Directory Management

The default user data directory pattern ([src/browser.ts69-85](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L69-L85)):

- Linux/macOS: `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- Windows: `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

**Multiple Instance Conflicts**: Use `--isolated` to create temporary directories that are automatically cleaned up.

Sources: [src/browser.ts69-85](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L69-L85) [src/browser.ts91-97](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L91-L97)

## Performance and Timeout Analysis

### Protocol Timeout Debugging

```
```

### Timeout Resolution Strategies

1. **Check Page Performance**: Use performance tracing tools to identify bottlenecks
2. **Network Conditions**: Verify emulated network settings aren't too restrictive
3. **CPU Throttling**: Check if CPU emulation is causing excessive delays
4. **Page Complexity**: Complex pages may require longer processing times

### Memory and Resource Issues

**High Memory Usage**: Chrome instances accumulate memory over time

- Solution: Use `--isolated` for fresh browser instances
- Monitor: Check browser process memory via system tools

**Too Many Targets**: Target filtering helps manage resource usage

- Filtered prefixes: `chrome://`, `chrome-extension://`, `chrome-untrusted://`, `devtools://`
- Custom filtering: Modify `targetFilter` function if needed

Sources: [src/browser.ts20-25](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L20-L25) [src/browser.ts27-37](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L27-L37) [src/browser.ts39-43](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L39-L43)

## Development and Testing Issues

### Local Development Setup

When testing changes locally, common issues include:

**Build Problems**: Ensure TypeScript compilation succeeds

```
```

**Inspector Connection**: When using `@modelcontextprotocol/inspector`, both ports 6274 and 6277 need to be accessible. In VS Code SSH environments, manually forward port 6277.

**Log File Permissions**: Ensure the log file path is writable when using `--log-file` option.

### Testing with MCP Inspector

```
```

Common inspector issues:

- Port forwarding in SSH environments
- Node.js version compatibility (requires Node.js 22+)
- File path resolution for built artifacts

Sources: [CONTRIBUTING.md70-74](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CONTRIBUTING.md#L70-L74) [CONTRIBUTING.md77-81](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CONTRIBUTING.md#L77-L81) [src/logger.ts17-31](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/logger.ts#L17-L31)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Troubleshooting](##troubleshooting)
- [Common Issues and Quick Solutions](##common-issues-and-quick-solutions)
- [Browser Launch Failures](##browser-launch-failures)
- [Connection and Timeout Issues](##connection-and-timeout-issues)
- [Tool Execution Problems](##tool-execution-problems)
- [Diagnostic Flow](##diagnostic-flow)
- [Debug Logging and Analysis](##debug-logging-and-analysis)
- [Enabling Debug Logs](##enabling-debug-logs)
- [Log Analysis Checklist](##log-analysis-checklist)
- [Common Log Patterns](##common-log-patterns)
- [Browser Connection Troubleshooting](##browser-connection-troubleshooting)
- [Connection Methods and Issues](##connection-methods-and-issues)
- [Fixing Connection Issues](##fixing-connection-issues)
- [Configuration and Environment Issues](##configuration-and-environment-issues)
- [Chrome Channel Problems](##chrome-channel-problems)
- [User Data Directory Management](##user-data-directory-management)
- [Performance and Timeout Analysis](##performance-and-timeout-analysis)
- [Protocol Timeout Debugging](##protocol-timeout-debugging)
- [Timeout Resolution Strategies](##timeout-resolution-strategies)
- [Memory and Resource Issues](##memory-and-resource-issues)
- [Development and Testing Issues](##development-and-testing-issues)
- [Local Development Setup](##local-development-setup)
- [Testing with MCP Inspector](##testing-with-mcp-inspector)
