Tools Reference | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Tools Reference

Relevant source files

- [README.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md)
- [docs/tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md)

This document provides a comprehensive reference for all 26 browser automation tools available in the chrome-devtools-mcp server. These tools enable MCP clients to perform input automation, navigation, performance analysis, debugging, network inspection, and browser emulation through the Chrome DevTools Protocol.

For information about the overall system architecture and how tools are implemented, see [Architecture Overview](#ChromeDevTools/chrome-devtools-mcp/3-architecture-overview). For guidance on creating new tools, see [Creating New Tools](#ChromeDevTools/chrome-devtools-mcp/5.2-creating-new-tools).

## Tool System Overview

The chrome-devtools-mcp server exposes 26 distinct tools organized into 6 functional categories. Each tool implements the `ToolDefinition` interface and is registered through the `defineTool()` factory function. Tools interact with Chrome browser instances via Puppeteer and return structured responses through the `McpResponse` system.

### Tool Architecture

```
```

Sources: [src/index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts) [src/lib/ToolDefinition.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/lib/ToolDefinition.ts) [src/lib/tools.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/lib/tools.ts) [src/lib/McpContext.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/lib/McpContext.ts) [src/lib/McpResponse.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/lib/McpResponse.ts)

### Tool Categories and Distribution

The 26 tools are organized into the following categories defined in the `ToolCategories` enum:

| Category                | Tool Count | Purpose                                             |
| ----------------------- | ---------- | --------------------------------------------------- |
| `INPUT_AUTOMATION`      | 7          | Mouse interactions, form filling, file uploads      |
| `NAVIGATION_AUTOMATION` | 7          | Page management, URL navigation, waiting            |
| `EMULATION`             | 3          | CPU throttling, network conditions, viewport sizing |
| `PERFORMANCE`           | 3          | Performance tracing and analysis                    |
| `NETWORK`               | 2          | Network request inspection                          |
| `DEBUGGING`             | 4          | Script execution, console logs, screenshots         |

```
```

Sources: [src/lib/ToolDefinition.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/lib/ToolDefinition.ts) [README.md119-154](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L119-L154)

## Tool Categories

### Input Automation Tools

Detailed in [Input Automation Tools](#ChromeDevTools/chrome-devtools-mcp/4.1-input-automation-tools), these 7 tools handle direct user interactions:

- `click`, `hover`, `drag` - Mouse interactions with page elements
- `fill`, `fill_form` - Text input and form completion
- `handle_dialog` - Browser dialog management
- `upload_file` - File upload automation

### Navigation and Page Management

Detailed in [Navigation and Page Management](#ChromeDevTools/chrome-devtools-mcp/4.2-navigation-and-page-management), these 7 tools manage browser pages and navigation:

- `list_pages`, `select_page`, `new_page`, `close_page` - Page lifecycle management
- `navigate_page`, `navigate_page_history` - URL navigation and history
- `wait_for` - Synchronization and waiting

### Performance Analysis Tools

Detailed in [Performance Analysis Tools](#ChromeDevTools/chrome-devtools-mcp/4.3-performance-analysis-tools), these 3 tools provide performance profiling:

- `performance_start_trace`, `performance_stop_trace` - Trace recording control
- `performance_analyze_insight` - Detailed performance analysis

### Debugging and Scripting Tools

Detailed in [Debugging and Scripting Tools](#ChromeDevTools/chrome-devtools-mcp/4.4-debugging-and-scripting-tools), these 4 tools enable page inspection:

- `evaluate_script` - JavaScript execution in browser context
- `take_screenshot`, `take_snapshot` - Visual and textual page capture
- `list_console_messages` - Console log inspection

### Network and Emulation Tools

Detailed in [Network and Emulation Tools](#ChromeDevTools/chrome-devtools-mcp/4.5-network-and-emulation-tools), these 5 tools handle network analysis and browser emulation:

- `list_network_requests`, `get_network_request` - Network traffic inspection
- `emulate_cpu`, `emulate_network`, `resize_page` - Browser condition emulation

## Tool Execution Flow

```
```

Sources: [src/index.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/index.ts) [src/lib/McpContext.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/lib/McpContext.ts) [src/lib/McpResponse.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/lib/McpResponse.ts)

## Common Usage Patterns

### Element Interaction Pattern

Most input automation tools follow this pattern:

1. Use `take_snapshot` to get current page state with element UIDs
2. Use element-specific tools (`click`, `fill`, `hover`) with UID parameters
3. Tools automatically wait for actions to complete and update page state

### Page Management Pattern

Navigation tools coordinate browser state:

1. Use `list_pages` to see available browser tabs
2. Use `select_page` to set context for subsequent operations
3. Use `new_page` or `close_page` to manage tab lifecycle
4. All subsequent tools operate on the currently selected page

### Performance Analysis Pattern

Performance tools require specific sequencing:

1. Use `performance_start_trace` with appropriate options
2. Perform actions to measure (navigation, interactions)
3. Use `performance_stop_trace` to complete recording
4. Use `performance_analyze_insight` for detailed analysis of specific metrics

### Error Handling and Synchronization

Tools provide built-in error handling and synchronization:

- All tools automatically wait for actions to complete
- Browser dialogs are detected and can be handled with `handle_dialog`
- Network requests are automatically tracked for inspection
- Console messages are captured for debugging

Sources: [docs/tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md) [src/lib/tools.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/lib/tools.ts)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Tools Reference](##tools-reference)
- [Tool System Overview](##tool-system-overview)
- [Tool Architecture](##tool-architecture)
- [Tool Categories and Distribution](##tool-categories-and-distribution)
- [Tool Categories](##tool-categories)
- [Input Automation Tools](##input-automation-tools)
- [Navigation and Page Management](##navigation-and-page-management)
- [Performance Analysis Tools](##performance-analysis-tools)
- [Debugging and Scripting Tools](##debugging-and-scripting-tools)
- [Network and Emulation Tools](##network-and-emulation-tools)
- [Tool Execution Flow](##tool-execution-flow)
- [Common Usage Patterns](##common-usage-patterns)
- [Element Interaction Pattern](##element-interaction-pattern)
- [Page Management Pattern](##page-management-pattern)
- [Performance Analysis Pattern](##performance-analysis-pattern)
- [Error Handling and Synchronization](##error-handling-and-synchronization)
