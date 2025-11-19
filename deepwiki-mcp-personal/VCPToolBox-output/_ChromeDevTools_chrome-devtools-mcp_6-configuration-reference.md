Configuration Reference | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Configuration Reference

Relevant source files

- [.prettierrc.cjs](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.prettierrc.cjs)
- [README.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md)
- [src/Mutex.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/Mutex.ts)
- [src/index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts)

This document provides a complete reference for all configuration options available in the Chrome DevTools MCP server. It covers CLI arguments, environment considerations, and MCP client configuration patterns.

For information about individual tools and their parameters, see [Tools Reference](#ChromeDevTools/chrome-devtools-mcp/4-tools-reference). For troubleshooting configuration issues, see [Troubleshooting](#ChromeDevTools/chrome-devtools-mcp/7-troubleshooting).

## CLI Options Overview

The Chrome DevTools MCP server accepts configuration through command-line arguments when launched. These options control browser behavior, connection methods, and operational settings.

```
```

*Configuration Flow from CLI to Browser Instance*

Sources: [src/index.ts38-132](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L38-L132) [src/browser.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts)

## Primary CLI Options

### Browser Connection Options

| Option                   | Type   | Description                                               | Conflicts                      |
| ------------------------ | ------ | --------------------------------------------------------- | ------------------------------ |
| `--browserUrl`, `-u`     | string | Connect to existing Chrome instance via port forwarding   | `executablePath`, `channel`    |
| `--executablePath`, `-e` | string | Path to custom Chrome executable                          | `browserUrl`, `channel`        |
| `--channel`              | string | Chrome channel to use (`stable`, `canary`, `beta`, `dev`) | `browserUrl`, `executablePath` |

```
```

*Browser Connection Method Resolution*

Sources: [src/index.ts39-78](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L39-L78) [src/browser.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#LNaN-LNaN)

### Browser Behavior Options

| Option       | Type    | Default | Description                       |
| ------------ | ------- | ------- | --------------------------------- |
| `--headless` | boolean | `false` | Run browser without UI            |
| `--isolated` | boolean | `false` | Use temporary user data directory |

The `headless` option controls whether Chrome runs with a visible UI. The `isolated` option determines user data directory behavior:

- `isolated=false`: Uses persistent profile at `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- `isolated=true`: Creates temporary directory, automatically cleaned up on browser close

Sources: [src/index.ts49-64](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L49-L64) [README.md209-220](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L209-L220)

### Hidden/Development Options

| Option                   | Type   | Description                 | Status |
| ------------------------ | ------ | --------------------------- | ------ |
| `--customDevtools`, `-d` | string | Path to custom DevTools     | Hidden |
| `--logFile`              | string | Save logs to specified file | Hidden |

These options are marked as `hidden: true` in the yargs configuration and are intended for development or debugging purposes.

Sources: [src/index.ts66-84](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L66-L84)

## Configuration Validation and Defaults

The CLI configuration includes validation logic and automatic default assignment:

```
```

*Configuration Validation Flow*

The validation logic ensures:

1. Conflicting options cannot be used together
2. `browserUrl` values are valid URLs via `coerce` function
3. Default `channel` is set to `'stable'` when no `browserUrl` is provided

Sources: [src/index.ts44-47](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L44-L47) [src/index.ts107-114](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L107-L114)

## Environment and File System Configuration

### User Data Directory

The browser uses different user data directories based on configuration:

| Condition        | Directory Pattern                                          |
| ---------------- | ---------------------------------------------------------- |
| `isolated=false` | `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL` |
| `isolated=true`  | Temporary directory (auto-cleanup)                         |

Platform-specific paths:

- **Linux/macOS**: `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- **Windows**: `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

### Log File Configuration

When `--logFile` is specified, the `saveLogsToFile()` function is called to redirect logging output.

Sources: [README.md212-220](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L212-L220) [src/index.ts134](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L134-L134)

## MCP Client Configuration Patterns

### Basic Configuration Structure

```
```

### Configuration with Options

```
```

### Remote Browser Connection

```
```

Sources: [README.md38-203](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L38-L203)

## Command Line Examples

The yargs configuration includes built-in examples accessible via `--help`:

| Command                                                             | Purpose                     |
| ------------------------------------------------------------------- | --------------------------- |
| `npx chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222` | Connect to existing browser |
| `npx chrome-devtools-mcp@latest --channel beta`                     | Use Chrome Beta             |
| `npx chrome-devtools-mcp@latest --channel canary`                   | Use Chrome Canary           |
| `npx chrome-devtools-mcp@latest --logFile /tmp/log.txt`             | Save logs to file           |

```
```

*CLI Help and Version System*

Sources: [src/index.ts115-126](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L115-L126) [src/index.ts87-102](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L87-L102)

## Configuration Object Structure

The complete configuration is defined in the `cliOptions` object:

```
```

This object is consumed by the yargs parser and ultimately passed to the `resolveBrowser()` function for browser initialization.

Sources: [src/index.ts38-85](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L38-L85)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Configuration Reference](##configuration-reference)
- [CLI Options Overview](##cli-options-overview)
- [Primary CLI Options](##primary-cli-options)
- [Browser Connection Options](##browser-connection-options)
- [Browser Behavior Options](##browser-behavior-options)
- [Hidden/Development Options](##hiddendevelopment-options)
- [Configuration Validation and Defaults](##configuration-validation-and-defaults)
- [Environment and File System Configuration](##environment-and-file-system-configuration)
- [User Data Directory](##user-data-directory)
- [Log File Configuration](##log-file-configuration)
- [MCP Client Configuration Patterns](##mcp-client-configuration-patterns)
- [Basic Configuration Structure](##basic-configuration-structure)
- [Configuration with Options](##configuration-with-options)
- [Remote Browser Connection](##remote-browser-connection)
- [Command Line Examples](##command-line-examples)
- [Configuration Object Structure](##configuration-object-structure)
