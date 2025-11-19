Response Formatting | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Response Formatting

Relevant source files

- [src/McpContext.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts)
- [src/McpResponse.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts)
- [tests/McpResponse.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/McpResponse.test.ts)
- [tests/tools/emulation.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/emulation.test.ts)

This document explains how the Chrome DevTools MCP server constructs and formats tool responses. The response formatting system aggregates browser state, execution results, and optional diagnostic information into structured MCP-compatible content that combines text and images.

For information about how tools are defined and executed, see [Tool System](#ChromeDevTools/chrome-devtools-mcp/3.3-tool-system). For details about browser state management, see [Browser Management](#ChromeDevTools/chrome-devtools-mcp/3.2-browser-management).

## Overview

The response formatting system is centered around the `McpResponse` class, which provides a configurable interface for building tool responses. Tools configure what information to include (pages, snapshots, network requests, console data), and the response formatter aggregates this data from the `McpContext` and formats it into structured content.

## Response Building Architecture

```
```

**Sources:** [src/McpResponse.ts17-241](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L17-L241) [src/McpContext.ts57-374](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L57-L374)

## Response Content Structure

The formatted response follows a consistent markdown structure with conditional sections based on configuration:

| Section                  | Trigger                           | Content                                  |
| ------------------------ | --------------------------------- | ---------------------------------------- |
| Tool Response Header     | Always                            | `# {toolName} response`                  |
| Custom Lines             | `appendResponseLine()` calls      | User-defined text                        |
| Network Emulation        | Network conditions set            | Current throttling settings              |
| CPU Emulation            | CPU throttling > 1x               | Current CPU slowdown                     |
| Open Dialog              | Dialog present                    | Dialog details and handling instructions |
| Pages List               | `setIncludePages(true)`           | Enumerated browser pages with selection  |
| Page Content             | `setIncludeSnapshot(true)`        | Accessibility tree snapshot              |
| Attached Network Request | `attachNetworkRequest()`          | Detailed request/response data           |
| Network Requests         | `setIncludeNetworkRequests(true)` | Summary of all requests                  |
| Console Messages         | `setIncludeConsoleData(true)`     | Formatted console output                 |

**Sources:** [src/McpResponse.ts107-194](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L107-L194) [tests/McpResponse.test.ts11-263](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/McpResponse.test.ts#L11-L263)

## Data Collection Flow

```
```

**Sources:** [src/McpResponse.ts82-105](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L82-L105) [src/McpResponse.ts196-236](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L196-L236)

## Core Response Components

### McpResponse Class

The `McpResponse` class implements the `Response` interface and provides the main formatting logic:

```
```

**Sources:** [src/McpResponse.ts17-76](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L17-L76)

### Text Snapshot Integration

Text snapshots are created from the accessibility tree and formatted for human readability:

```
```

The snapshot includes unique IDs for each element that can be used by other tools for interaction.

**Sources:** [src/McpContext.ts26-35](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L26-L35) [src/McpContext.ts289-323](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L289-L323)

## Specialized Formatters

### Network Request Formatting

Network requests are formatted using helper functions from `networkFormatter.js`:

- `getShortDescriptionForRequest()` - Single line summary
- `getStatusFromRequest()` - HTTP status or pending state
- `getFormattedHeaderValue()` - Header key-value pairs

**Sources:** [src/formatters/networkFormatter.js](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/formatters/networkFormatter.js) [src/McpResponse.ts196-236](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L196-L236)

### Console Message Formatting

Console messages are processed through `formatConsoleEvent()` which handles:

- Different console message types (log, error, warn, etc.)
- Error stack traces
- Source location information

**Sources:** [src/formatters/consoleFormatter.js](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/formatters/consoleFormatter.js) [src/McpResponse.ts94-102](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L94-L102)

### Accessibility Snapshot Formatting

Accessibility snapshots are formatted using `formatA11ySnapshot()` which creates a hierarchical text representation of the page structure with:

- Element roles and properties
- Unique identifiers for interaction
- Indented tree structure
- Focus and value states

**Sources:** [src/formatters/snapshotFormatter.js](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/formatters/snapshotFormatter.js) [src/McpResponse.ts150-157](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L150-L157)

## Image and File Handling

The response system supports including images and temporary files:

```
```

Images are attached via `attachImage()` and included as separate `ImageContent` objects in the final response array. The `McpContext` provides `saveTemporaryFile()` for creating temporary screenshot files.

**Sources:** [src/tools/ToolDefinition.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts) [src/McpContext.ts325-343](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L325-L343) [src/McpResponse.ts66-68](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L66-L68)

## State Aggregation

The response formatter aggregates various types of browser state:

- **Emulation State**: Network conditions and CPU throttling settings
- **Dialog State**: Open dialogs requiring user interaction
- **Page State**: List of open pages and current selection
- **Request State**: Network requests and responses
- **Console State**: JavaScript console output and errors

This state information provides context for tool execution results and helps users understand the current browser environment.

**Sources:** [src/McpResponse.ts115-137](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpResponse.ts#L115-L137) [src/McpContext.ts150-174](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L150-L174)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Response Formatting](##response-formatting)
- [Overview](##overview)
- [Response Building Architecture](##response-building-architecture)
- [Response Content Structure](##response-content-structure)
- [Data Collection Flow](##data-collection-flow)
- [Core Response Components](##core-response-components)
- [McpResponse Class](##mcpresponse-class)
- [Text Snapshot Integration](##text-snapshot-integration)
- [Specialized Formatters](##specialized-formatters)
- [Network Request Formatting](##network-request-formatting)
- [Console Message Formatting](##console-message-formatting)
- [Accessibility Snapshot Formatting](##accessibility-snapshot-formatting)
- [Image and File Handling](##image-and-file-handling)
- [State Aggregation](##state-aggregation)
