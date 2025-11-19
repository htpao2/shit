Tool System | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Tool System

Relevant source files

- [src/tools/ToolDefinition.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts)
- [src/tools/input.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts)
- [src/tools/script.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts)

This document describes the tool definition and execution system in chrome-devtools-mcp. This covers how browser automation capabilities are packaged as discrete tools, the `ToolDefinition` interface, the `defineTool` factory function, and how tools interact with the browser through the `Context` abstraction. For information about how tools are registered and exposed through the MCP server, see [MCP Server and CLI](#ChromeDevTools/chrome-devtools-mcp/3.1-mcp-server-and-cli). For details about specific tool implementations and their parameters, see [Tools Reference](#ChromeDevTools/chrome-devtools-mcp/4-tools-reference).

## Core Tool Architecture

The tool system is built around a standardized interface that separates tool definition from execution. Each tool defines its parameters using Zod schemas, implements a handler function, and specifies metadata through annotations.

### Tool Definition Interface

The `ToolDefinition` interface provides the foundation for all browser automation tools:

```
```

The `ToolDefinition` interface requires five key components:

| Component     | Type              | Purpose                                          |
| ------------- | ----------------- | ------------------------------------------------ |
| `name`        | `string`          | Unique identifier for the tool                   |
| `description` | `string`          | Human-readable explanation of tool functionality |
| `annotations` | `ToolAnnotations` | Metadata including category and read-only status |
| `schema`      | `ZodRawShape`     | Parameter validation schema                      |
| `handler`     | `Function`        | Async function that performs the automation      |

Sources: [src/tools/ToolDefinition.ts12-31](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts#L12-L31)

### Tool Factory Function

The `defineTool` function provides type-safe tool creation:

```
```

The factory function ensures compile-time type safety between the Zod schema and request parameters used in the handler.

Sources: [src/tools/ToolDefinition.ts76-80](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts#L76-L80)

## Tool Execution Flow

Tools execute through a standardized request-response cycle that integrates with browser state management:

```
```

### Context Abstraction

The `Context` interface provides tools with controlled access to browser state without exposing implementation details:

| Method Category       | Methods                                                  | Purpose                                   |
| --------------------- | -------------------------------------------------------- | ----------------------------------------- |
| Page Management       | `getSelectedPage()`, `newPage()`, `setSelectedPageIdx()` | Access and manipulate browser pages       |
| Element Access        | `getElementByUid()`                                      | Retrieve DOM elements from page snapshots |
| Event Synchronization | `waitForEventsAfterAction()`                             | Handle asynchronous browser operations    |
| Performance           | `isRunningPerformanceTrace()`, `recordedTraces()`        | Manage performance monitoring             |
| Emulation             | `setNetworkConditions()`, `setCpuThrottlingRate()`       | Configure browser emulation               |

Sources: [src/tools/ToolDefinition.ts52-74](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts#L52-L74)

## Tool Categories and Annotations

Tools are organized into functional categories that group related automation capabilities:

```
```

### Read-Only Hint System

The `readOnlyHint` annotation indicates whether a tool modifies the browser environment:

- `readOnlyHint: true` - Tool only reads state (e.g., `take_screenshot`, `list_pages`)
- `readOnlyHint: false` - Tool modifies state (e.g., `click`, `navigate_page`)

Sources: [src/tools/ToolDefinition.ts17-24](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts#L17-L24) [src/tools/script.ts16](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts#L16-L16) [src/tools/input.ts17](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L17-L17)

## Tool Implementation Examples

### Input Automation Pattern

Input automation tools follow a consistent pattern for element interaction:

```
```

Example implementation from the `click` tool:

```
```

Sources: [src/tools/input.ts12-48](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L12-L48)

### Script Evaluation Pattern

The `evaluate_script` tool demonstrates advanced parameter handling with element arguments:

```
```

This tool accepts a JavaScript function as a string and optional element references, then executes the function in the browser context with proper argument marshaling.

Sources: [src/tools/script.ts11-70](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts#L11-L70)

### Multi-Element Operations

Tools like `fill_form` demonstrate batch operations across multiple elements:

```
```

The handler iterates through elements, disposing of each handle after use to prevent memory leaks.

Sources: [src/tools/input.ts138-169](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L138-L169)

## Error Handling and Resource Management

### Element Handle Lifecycle

All tools that interact with DOM elements follow a strict lifecycle pattern:

1. Acquire `ElementHandle` via `context.getElementByUid()`
2. Perform operations within `try` block
3. Always dispose handle in `finally` block

### Event Synchronization

The `waitForEventsAfterAction()` method ensures tools properly handle asynchronous browser events like navigation, DOM updates, and network requests. This prevents race conditions where tools complete before the browser finishes processing the automation.

Sources: [src/tools/input.ts34-38](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L34-L38) [src/tools/script.ts53-65](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts#L53-L65)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Tool System](##tool-system)
- [Core Tool Architecture](##core-tool-architecture)
- [Tool Definition Interface](##tool-definition-interface)
- [Tool Factory Function](##tool-factory-function)
- [Tool Execution Flow](##tool-execution-flow)
- [Context Abstraction](##context-abstraction)
- [Tool Categories and Annotations](##tool-categories-and-annotations)
- [Read-Only Hint System](##read-only-hint-system)
- [Tool Implementation Examples](##tool-implementation-examples)
- [Input Automation Pattern](##input-automation-pattern)
- [Script Evaluation Pattern](##script-evaluation-pattern)
- [Multi-Element Operations](##multi-element-operations)
- [Error Handling and Resource Management](##error-handling-and-resource-management)
- [Element Handle Lifecycle](##element-handle-lifecycle)
- [Event Synchronization](##event-synchronization)
