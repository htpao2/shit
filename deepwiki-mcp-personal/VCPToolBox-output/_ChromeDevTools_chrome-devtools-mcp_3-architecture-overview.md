Architecture Overview | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Architecture Overview

Relevant source files

- [src/McpContext.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts)
- [src/McpResponse.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts)
- [src/Mutex.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/Mutex.ts)
- [src/browser.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts)
- [src/index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts)
- [src/logger.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/logger.ts)
- [tests/McpResponse.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/McpResponse.test.ts)
- [tests/tools/emulation.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/emulation.test.ts)

This document provides a high-level technical overview of the chrome-devtools-mcp system architecture, including its core components, data flow, and how they work together to enable browser automation through the Model Context Protocol (MCP).

For detailed information about individual tools and their usage, see [Tools Reference](#ChromeDevTools/chrome-devtools-mcp/4-tools-reference). For build and development processes, see [Development and Contributing](#ChromeDevTools/chrome-devtools-mcp/5-development-and-contributing).

## System Overview

The chrome-devtools-mcp server is built around a central MCP server that orchestrates browser automation through a collection of specialized tools. The system maintains persistent browser state and provides standardized response formatting for all tool interactions.

```
```

**Sources**: [src/index.ts1-242](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L1-L242) [src/McpContext.ts1-375](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L1-L375) [src/McpResponse.ts1-242](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L1-L242) [src/browser.ts1-162](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L1-L162)

## Core Components

### MCP Server and CLI Entry Point

The `index.ts` file serves as the main entry point, setting up the MCP server and registering all available tools. It uses the `@modelcontextprotocol/sdk` to handle stdio communication with MCP clients.

```
```

The system uses a `Mutex` to ensure only one tool executes at a time, preventing race conditions in browser state management.

**Sources**: [src/index.ts38-132](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L38-L132) [src/index.ts174-221](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L174-L221) [src/Mutex.ts1-47](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/Mutex.ts#L1-L47)

### Browser State Management

The `McpContext` class is the central state manager that maintains browser instances, page collections, accessibility snapshots, and emulation settings. It implements the `Context` interface used by all tools.

```
```

Key methods include `getSelectedPage()`, `createTextSnapshot()`, `setNetworkConditions()`, and `waitForEventsAfterAction()` for coordinating asynchronous browser operations.

**Sources**: [src/McpContext.ts57-375](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L57-L375) [src/PageCollector.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/PageCollector.ts) [src/WaitForHelper.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts)

### Response Formatting System

The `McpResponse` class standardizes how tool results are formatted and returned to MCP clients. It supports text responses, images, snapshots, and various browser state information.

```
```

**Sources**: [src/McpResponse.ts17-241](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L17-L241) [src/formatters/snapshotFormatter.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/formatters/snapshotFormatter.ts) [src/formatters/networkFormatter.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/formatters/networkFormatter.ts) [src/formatters/consoleFormatter.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/formatters/consoleFormatter.ts)

## Tool Execution Flow

Every tool follows a standardized execution pattern that ensures consistent browser state management and response formatting.

```
```

The `registerTool()` function in `index.ts` wraps each tool handler with error handling, logging, and the mutex-based synchronization.

**Sources**: [src/index.ts176-221](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L176-L221) [src/tools/ToolDefinition.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts)

## Browser Connection and Management

The browser management system supports both launching new Chrome instances and connecting to existing ones, with configurable profiles and emulation settings.

```
```

The `targetFilter` function excludes internal Chrome pages like `chrome://` and `chrome-extension://` URLs from tool access.

**Sources**: [src/browser.ts45-159](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L45-L159) [src/browser.ts20-37](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L20-L37) [src/index.ts150-164](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts#L150-L164)

## State Synchronization and Event Handling

The system handles asynchronous browser operations through specialized helper classes that coordinate page events with tool execution.

```
```

The system dynamically adjusts timeouts based on CPU and network emulation settings to ensure reliable automation under various conditions.

**Sources**: [src/McpContext.ts231-249](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L231-L249) [src/McpContext.ts361-373](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L361-L373) [src/WaitForHelper.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts) [src/PageCollector.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/PageCollector.ts)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Architecture Overview](##architecture-overview)
- [System Overview](##system-overview)
- [Core Components](##core-components)
- [MCP Server and CLI Entry Point](##mcp-server-and-cli-entry-point)
- [Browser State Management](##browser-state-management)
- [Response Formatting System](##response-formatting-system)
- [Tool Execution Flow](##tool-execution-flow)
- [Browser Connection and Management](##browser-connection-and-management)
- [State Synchronization and Event Handling](##state-synchronization-and-event-handling)
