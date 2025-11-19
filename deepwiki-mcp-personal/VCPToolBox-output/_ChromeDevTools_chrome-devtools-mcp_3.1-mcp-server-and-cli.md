MCP Server and CLI | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# MCP Server and CLI

Relevant source files

- [package.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json)
- [src/Mutex.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/Mutex.ts)
- [src/index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts)

This document covers the main entry point and command-line interface of the chrome-devtools-mcp system. It explains how the CLI arguments are processed, how the MCP server is initialized, and how tools are registered and executed. For details about the browser management system, see [Browser Management](#ChromeDevTools/chrome-devtools-mcp/3.2-browser-management). For information about individual tool implementations, see [Tools Reference](#ChromeDevTools/chrome-devtools-mcp/4-tools-reference).

## CLI Configuration and Argument Processing

The chrome-devtools-mcp server is implemented as a Node.js CLI application with the main entry point at [src/index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts) The CLI uses `yargs` for argument parsing and provides several configuration options for browser management and debugging.

### CLI Arguments Structure

```
```

The CLI options are defined in the `cliOptions` object [src/index.ts38-85](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L38-L85) and include browser connection modes, execution settings, and debugging options. The system supports both launching new browser instances and connecting to existing ones via the `browserUrl` parameter.

**Sources:** [src/index.ts38-132](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L38-L132) [package.json6](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L6-L6)

### Browser Configuration Flow

```
```

The argument validation logic [src/index.ts107-114](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L107-L114) ensures that if no `channel` or `browserUrl` is specified, the system defaults to the `stable` Chrome channel.

**Sources:** [src/index.ts104-132](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L104-L132) [src/index.ts151-159](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L151-L159)

## MCP Server Initialization

The MCP server is created using the `@modelcontextprotocol/sdk` and configured with metadata and capabilities. The server handles the Model Context Protocol communication over stdio transport.

### Server Setup Process

```
```

The server initialization [src/index.ts137-144](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L137-L144) creates an `McpServer` instance with the project name and version read from `package.json`. The server supports logging capabilities and uses stdio transport for communication with MCP clients.

**Sources:** [src/index.ts87-100](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L87-L100) [src/index.ts137-147](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L137-L147) [src/index.ts238-241](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L238-L241)

## Tool Registration System

All available tools are imported from various modules and registered with the MCP server through a unified registration process. The system uses a mutex to ensure thread-safe tool execution.

### Tool Collection and Registration

```
```

The tool registration process [src/index.ts223-236](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L223-L236) collects all tool definitions from imported modules and registers each one with the MCP server using the `registerTool()` function.

**Sources:** [src/index.ts23-31](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L23-L31) [src/index.ts223-236](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L223-L236) [src/index.ts176-221](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L176-L221)

## Request Handling Flow

When a tool request is received, the system follows a structured flow that includes context resolution, mutex acquisition, tool execution, and response formatting.

### Tool Execution Pipeline

```
```

The request handling [src/index.ts184-219](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L184-L219) includes comprehensive error handling that catches exceptions and returns them as structured error responses to the MCP client.

**Sources:** [src/index.ts176-221](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L176-L221) [src/index.ts184-219](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L184-L219)

## Synchronization and Error Handling

The system uses a custom `Mutex` class to ensure that only one tool can execute at a time, preventing race conditions in browser automation operations.

### Mutex Implementation

| Component     | Purpose                    | Key Methods               |
| ------------- | -------------------------- | ------------------------- |
| `Mutex`       | Synchronization primitive  | `acquire()`, `release()`  |
| `Mutex.Guard` | RAII-style lock guard      | `dispose()`               |
| `toolMutex`   | Global tool execution lock | Used in all tool handlers |

The `Mutex` class [src/Mutex.ts7-46](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/Mutex.ts#L7-L46) implements a FIFO queue for lock acquisition and provides a guard pattern for automatic lock release.

```
```

The error handling system [src/index.ts202-215](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L202-L215) catches all exceptions during tool execution and converts them to MCP-compatible error responses with the `isError: true` flag.

**Sources:** [src/Mutex.ts7-46](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/Mutex.ts#L7-L46) [src/index.ts174](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L174-L174) [src/index.ts185](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L185-L185) [src/index.ts202-218](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L202-L218)

## Logging and Debugging

The system includes comprehensive logging capabilities with optional file output and debug mode support.

### Logging Configuration

The CLI supports debug logging through environment variables and file output through the `--logFile` option [src/index.ts134](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L134-L134) The system also displays security disclaimers [src/index.ts166-172](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L166-L172) warning users about data exposure to MCP clients.

**Sources:** [src/index.ts134](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L134-L134) [src/index.ts166-172](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L166-L172) [package.json16](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L16-L16)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [MCP Server and CLI](##mcp-server-and-cli)
- [CLI Configuration and Argument Processing](##cli-configuration-and-argument-processing)
- [CLI Arguments Structure](##cli-arguments-structure)
- [Browser Configuration Flow](##browser-configuration-flow)
- [MCP Server Initialization](##mcp-server-initialization)
- [Server Setup Process](##server-setup-process)
- [Tool Registration System](##tool-registration-system)
- [Tool Collection and Registration](##tool-collection-and-registration)
- [Request Handling Flow](##request-handling-flow)
- [Tool Execution Pipeline](##tool-execution-pipeline)
- [Synchronization and Error Handling](##synchronization-and-error-handling)
- [Mutex Implementation](##mutex-implementation)
- [Logging and Debugging](##logging-and-debugging)
- [Logging Configuration](##logging-configuration)
