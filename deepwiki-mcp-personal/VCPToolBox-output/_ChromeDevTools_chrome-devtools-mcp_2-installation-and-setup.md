Installation and Setup | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Installation and Setup

Relevant source files

- [README.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md)
- [package.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json)
- [src/Mutex.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/Mutex.ts)
- [src/index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts)

This document covers the installation, configuration, and initial setup of the `chrome-devtools-mcp` server. It includes system requirements, installation methods, CLI configuration options, and MCP client integration steps.

For information about the overall system architecture, see [Architecture Overview](#ChromeDevTools/chrome-devtools-mcp/3-architecture-overview). For details about specific tools and their usage, see [Tools Reference](#ChromeDevTools/chrome-devtools-mcp/4-tools-reference).

## Prerequisites

The `chrome-devtools-mcp` server requires the following system components:

| Component          | Requirement                     | Purpose                                     |
| ------------------ | ------------------------------- | ------------------------------------------- |
| **Node.js**        | Version 22 or newer             | Runtime environment for the MCP server      |
| **Chrome Browser** | Current stable version or newer | Target browser for automation and debugging |
| **npm**            | Included with Node.js           | Package manager for installation            |
| **MCP Client**     | Any compatible client           | Interface for interacting with the server   |

### Supported MCP Clients

- Claude Code CLI
- Cline
- Microsoft Copilot (VS Code)
- Cursor
- Gemini CLI
- Gemini Code Assist

**Sources:** [README.md28-32](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L28-L32) [README.md52-102](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L52-L102)

## Installation Methods

### Method 1: Direct NPX Usage (Recommended)

The simplest installation method uses `npx` to run the latest version without local installation:

```
```

This approach ensures automatic updates and eliminates local dependency management.

### Method 2: Global Installation

For frequent usage, install globally:

```
```

### Installation Architecture

```
```

**Sources:** [package.json2-6](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L2-L6) [package.json36-41](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L36-L41) [package.json42-59](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L42-L59)

## CLI Configuration Options

The MCP server supports various configuration options defined in the `cliOptions` object:

### Browser Connection Options

| Option                   | Type   | Description                                            | Default       |
| ------------------------ | ------ | ------------------------------------------------------ | ------------- |
| `--browserUrl`, `-u`     | string | Connect to running Chrome instance via port forwarding | None          |
| `--executablePath`, `-e` | string | Path to custom Chrome executable                       | Auto-detected |
| `--channel`              | string | Chrome channel: `stable`, `canary`, `beta`, `dev`      | `stable`      |

### Browser Behavior Options

| Option       | Type    | Description                               | Default |
| ------------ | ------- | ----------------------------------------- | ------- |
| `--headless` | boolean | Run in headless (no UI) mode              | `false` |
| `--isolated` | boolean | Use temporary user-data-dir, auto-cleaned | `false` |

### Development Options

| Option                   | Type   | Description                      | Default |
| ------------------------ | ------ | -------------------------------- | ------- |
| `--customDevtools`, `-d` | string | Path to custom DevTools (hidden) | None    |
| `--logFile`              | string | Save logs to file (hidden)       | None    |

### CLI Argument Processing Flow

```
```

**Sources:** [src/index.ts38-85](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L38-L85) [src/index.ts104-132](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L104-L132) [src/index.ts150-164](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L150-L164)

## MCP Client Configuration

### Standard Configuration Format

All MCP clients use a similar JSON configuration structure:

```
```

### Configuration with CLI Options

To add CLI options, extend the `args` array:

```
```

### Client-Specific Setup Methods

| Client              | Setup Method                                                                                        | Reference                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Claude Code**     | `claude mcp add chrome-devtools npx chrome-devtools-mcp@latest`                                     | [README.md58-60](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L58-L60) |
| **VS Code Copilot** | `code --add-mcp '{"name":"chrome-devtools","command":"npx","args":["chrome-devtools-mcp@latest"]}'` | [README.md74-76](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L74-L76) |
| **Cursor**          | One-click install button or manual configuration                                                    | [README.md82-88](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L82-L88) |
| **Cline**           | Follow MCP configuration guide with standard config                                                 | [README.md65-67](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L65-L67) |
| **Gemini CLI**      | Standard MCP configuration process                                                                  | [README.md93-95](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L93-L95) |

**Sources:** [README.md36-46](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L36-L46) [README.md52-102](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L52-L102) [README.md187-203](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L187-L203)

## User Data Directory Configuration

### Default Directory Structure

The server uses persistent user data directories by default:

- **Linux/macOS:** `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- **Windows:** `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

### Isolation Mode

When `--isolated=true` is specified:

- Creates temporary user data directory
- Automatically cleaned up after browser closure
- No persistent state between sessions

**Sources:** [README.md210-221](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L210-L221)

## Setup Verification

### Initial Test Command

After configuration, verify the setup with this prompt in your MCP client:

```
Check the performance of https://developers.chrome.com
```

Expected behavior:

1. Browser launches automatically (if not already running)
2. Navigates to the specified URL
3. Records performance trace
4. Returns performance analysis

### MCP Server Startup Flow

```
```

### Connection Verification

The server logs startup information to stderr:

```
Starting Chrome DevTools MCP Server v{version}
Chrome DevTools MCP Server connected
chrome-devtools-mcp exposes content of the browser instance to the MCP clients...
```

**Sources:** [src/index.ts136](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L136-L136) [src/index.ts240](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L240-L240) [src/index.ts166-172](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L166-L172) [README.md114-115](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L114-L115)

## Troubleshooting Installation

### Common Issues

| Issue                      | Cause                      | Solution                                              |
| -------------------------- | -------------------------- | ----------------------------------------------------- |
| **Browser fails to start** | OS sandboxing restrictions | Use `--browserUrl` to connect to external browser     |
| **Permission denied**      | Chrome sandbox conflicts   | Disable MCP client sandboxing for this server         |
| **Tool execution timeout** | Network/performance issues | Check browser responsiveness and network connectivity |

### Debug Mode

Enable detailed logging:

```
```

Or save logs to file:

```
```

**Sources:** [package.json16](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L16-L16) [src/index.ts80-84](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L80-L84) [README.md224-231](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L224-L231)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Installation and Setup](##installation-and-setup)
- [Prerequisites](##prerequisites)
- [Supported MCP Clients](##supported-mcp-clients)
- [Installation Methods](##installation-methods)
- [Method 1: Direct NPX Usage (Recommended)](##method-1-direct-npx-usage-recommended)
- [Method 2: Global Installation](##method-2-global-installation)
- [Installation Architecture](##installation-architecture)
- [CLI Configuration Options](##cli-configuration-options)
- [Browser Connection Options](##browser-connection-options)
- [Browser Behavior Options](##browser-behavior-options)
- [Development Options](##development-options)
- [CLI Argument Processing Flow](##cli-argument-processing-flow)
- [MCP Client Configuration](##mcp-client-configuration)
- [Standard Configuration Format](##standard-configuration-format)
- [Configuration with CLI Options](##configuration-with-cli-options)
- [Client-Specific Setup Methods](##client-specific-setup-methods)
- [User Data Directory Configuration](##user-data-directory-configuration)
- [Default Directory Structure](##default-directory-structure)
- [Isolation Mode](##isolation-mode)
- [Setup Verification](##setup-verification)
- [Initial Test Command](##initial-test-command)
- [MCP Server Startup Flow](##mcp-server-startup-flow)
- [Connection Verification](##connection-verification)
- [Troubleshooting Installation](##troubleshooting-installation)
- [Common Issues](##common-issues)
- [Debug Mode](##debug-mode)
