Creating New Tools | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Creating New Tools

Relevant source files

- [scripts/generate-docs.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/generate-docs.ts)
- [src/tools/ToolDefinition.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts)
- [src/tools/input.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts)

This document provides a tutorial for creating new tools in the Chrome DevTools MCP server. It covers the `defineTool` pattern, schema definition, handler implementation, testing, and documentation generation. This guide is specifically for adding new browser automation capabilities to the tool registry.

For information about the overall tool system architecture, see [Tool System](#ChromeDevTools/chrome-devtools-mcp/3.3-tool-system). For testing and build processes, see [Building and Testing](#ChromeDevTools/chrome-devtools-mcp/5.1-building-and-testing).

## Tool Definition Anatomy

All tools in the Chrome DevTools MCP server follow a standardized pattern using the `defineTool` function. Each tool consists of five core components that define its behavior, validation, and integration.

```
```

**Sources:** [src/tools/ToolDefinition.ts12-31](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts#L12-L31) [src/tools/input.ts12-49](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L12-L49)

## Core Components and Interfaces

The tool definition system provides several key interfaces and utilities that new tools must implement. Understanding these components is essential for creating well-integrated tools.

| Component                | Purpose                             | Key Methods/Properties                                                 |
| ------------------------ | ----------------------------------- | ---------------------------------------------------------------------- |
| `ToolDefinition<Schema>` | Base interface for tool structure   | `name`, `description`, `annotations`, `schema`, `handler`              |
| `defineTool()`           | Factory function for creating tools | Returns typed `ToolDefinition`                                         |
| `Request<Schema>`        | Validated input parameters          | `params` (typed based on schema)                                       |
| `Response`               | Tool output formatting              | `appendResponseLine()`, `setIncludeSnapshot()`, `attachImage()`        |
| `Context`                | Browser interaction interface       | `getSelectedPage()`, `getElementByUid()`, `waitForEventsAfterAction()` |

```
```

**Sources:** [src/tools/ToolDefinition.ts52-74](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts#L52-L74) [src/tools/ToolDefinition.ts76-80](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts#L76-L80)

## Step-by-Step Tool Creation Process

### Step 1: Define Tool Structure

Create a new tool using the `defineTool` function with proper typing and categorization:

```
```

**Sources:** [src/tools/input.ts12-18](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L12-L18) [src/tools/ToolDefinition.ts76-80](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts#L76-L80)

### Step 2: Schema Definition with Zod

Define input validation using Zod schemas that will be automatically converted to JSON Schema for MCP clients:

```
```

**Sources:** [src/tools/input.ts19-29](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L19-L29) [src/tools/input.ts58-64](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L58-L64) [src/tools/input.ts145-154](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L145-L154)

### Step 3: Handler Implementation

Implement the tool handler following established patterns for browser interaction:

| Pattern             | Usage                                                | Example                                                                                                                   |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Element interaction | Use `context.getElementByUid()`                      | [src/tools/input.ts32](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L32-L32)    |
| Event waiting       | Wrap actions in `context.waitForEventsAfterAction()` | [src/tools/input.ts34-38](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L34-L38) |
| Resource cleanup    | Always dispose element handles                       | [src/tools/input.ts45-47](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L45-L47) |
| Response formatting | Use `response.appendResponseLine()`                  | [src/tools/input.ts39-43](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L39-L43) |
| Snapshot inclusion  | Set `response.setIncludeSnapshot(true)`              | [src/tools/input.ts44](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L44-L44)    |

**Sources:** [src/tools/input.ts30-48](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L30-L48) [src/tools/input.ts65-77](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L65-L77)

### Step 4: Error Handling and Fallbacks

Implement proper error handling with fallback mechanisms when needed:

```
```

**Sources:** [src/tools/input.ts192-210](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L192-L210) [src/tools/input.ts45-47](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L45-L47)

## Testing New Tools

Test new tools by integrating them into the tool registry and using the MCP server's development mode. The testing process involves both unit-level validation and integration testing with real browser instances.

```
```

**Sources:** [src/tools/input.ts1-218](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L1-L218) [scripts/generate-docs.ts163-190](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/generate-docs.ts#L163-L190)

## Documentation Generation

Tool documentation is automatically generated from tool definitions using the `generate-docs.ts` script. This ensures documentation stays synchronized with actual tool implementations.

The documentation generation process extracts information from several sources:

| Source                      | Information Extracted              |
| --------------------------- | ---------------------------------- |
| Tool `name`                 | Tool identifier and anchor links   |
| Tool `description`          | Primary documentation text         |
| Tool `schema`               | Parameter documentation with types |
| Tool `annotations.category` | Grouping and organization          |
| Zod schema descriptions     | Parameter descriptions             |

```
```

**Sources:** [scripts/generate-docs.ts163-332](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/generate-docs.ts#L163-L332) [scripts/generate-docs.ts60-80](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/generate-docs.ts#L60-L80) [scripts/generate-docs.ts240-305](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/generate-docs.ts#L240-L305)

## Integration into Tool Registry

New tools must be properly integrated into the tool registry system to be discoverable by MCP clients. This involves both code registration and build system integration.

The integration process follows these steps:

1. **Export from tool module**: Export the tool from its source file
2. **Import in registry**: Add import statement to tool registry
3. **Add to tools array**: Include in the comprehensive tools list
4. **Build and validate**: Ensure the tool appears in `listTools()` output

```
```

**Sources:** [src/tools/input.ts12](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L12-L12) [scripts/generate-docs.ts188-190](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/generate-docs.ts#L188-L190) [scripts/generate-docs.ts315-316](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/generate-docs.ts#L315-L316)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Creating New Tools](##creating-new-tools)
- [Tool Definition Anatomy](##tool-definition-anatomy)
- [Core Components and Interfaces](##core-components-and-interfaces)
- [Step-by-Step Tool Creation Process](##step-by-step-tool-creation-process)
- [Step 1: Define Tool Structure](##step-1-define-tool-structure)
- [Step 2: Schema Definition with Zod](##step-2-schema-definition-with-zod)
- [Step 3: Handler Implementation](##step-3-handler-implementation)
- [Step 4: Error Handling and Fallbacks](##step-4-error-handling-and-fallbacks)
- [Testing New Tools](##testing-new-tools)
- [Documentation Generation](##documentation-generation)
- [Integration into Tool Registry](##integration-into-tool-registry)
