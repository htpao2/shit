Debugging and Scripting Tools | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Debugging and Scripting Tools

Relevant source files

- [.github/workflows/run-tests.yml](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/run-tests.yml)
- [src/tools/screenshot.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/screenshot.ts)
- [src/tools/script.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts)
- [tests/formatters/snapshotFormatter.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/formatters/snapshotFormatter.test.ts)
- [tests/setup.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/setup.ts)
- [tests/tools/screenshot.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/screenshot.test.ts)

This page covers the debugging and scripting tools available in chrome-devtools-mcp, which enable direct JavaScript execution, visual inspection, and runtime analysis of web pages. These tools provide essential capabilities for troubleshooting automation scripts, inspecting page state, and gathering debugging information during browser automation workflows.

The debugging tools complement the other tool categories by providing introspection capabilities. For automation and interaction tools, see [Input Automation Tools](#ChromeDevTools/chrome-devtools-mcp/4.1-input-automation-tools) and [Navigation and Page Management](#ChromeDevTools/chrome-devtools-mcp/4.2-navigation-and-page-management). For performance analysis capabilities, see [Performance Analysis Tools](#ChromeDevTools/chrome-devtools-mcp/4.3-performance-analysis-tools).

## Available Debugging Tools

The debugging category includes four primary tools that enable different aspects of page inspection and script execution:

| Tool Name               | Purpose                            | Key Capabilities                                            |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `evaluate_script`       | Execute JavaScript in page context | Function execution, element interaction, JSON serialization |
| `take_screenshot`       | Capture visual page state          | Viewport, full page, and element-specific screenshots       |
| `list_console_messages` | Retrieve console output            | Error tracking, log collection, debugging output            |
| `take_snapshot`         | Generate accessibility snapshot    | DOM structure, element UIDs, accessibility tree             |

## Script Evaluation Tool

### Tool Overview

The `evaluate_script` tool executes JavaScript functions within the browser page context and returns JSON-serialized results. This tool is essential for custom page inspection, data extraction, and dynamic interaction with page elements.

```
```

*Sources: [src/tools/script.ts11-70](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts#L11-L70)*

### Function Execution

The tool accepts JavaScript functions as strings and executes them in the page context using Puppeteer's `page.evaluateHandle()` and `page.evaluate()` methods. Functions can be synchronous or asynchronous:

**Basic function execution:**

```
```

**Element-based functions:**

```
```

The tool resolves element arguments using the UID system from page snapshots, enabling direct interaction with specific DOM elements identified in previous tool calls.

*Sources: [src/tools/script.ts19-43](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts#L19-L43)*

### Implementation Details

The tool implementation follows this execution pattern:

```
```

The tool ensures proper cleanup of JavaScript handles using `Promise.allSettled()` to dispose of all created handles, preventing memory leaks in the browser context.

*Sources: [src/tools/script.ts45-69](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts#L45-L69)*

## Screenshot Tool

### Tool Overview

The `take_screenshot` tool captures visual representations of the current page state, supporting multiple capture modes and output formats. This tool is crucial for visual debugging, automated testing, and documentation generation.

```
```

*Sources: [src/tools/screenshot.ts12-81](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/screenshot.ts#L12-L81)*

### Screenshot Modes

The tool supports three distinct screenshot modes:

**Viewport Screenshot** - Captures the currently visible area of the page:

```
```

**Full Page Screenshot** - Captures the entire scrollable page content:

```
```

**Element Screenshot** - Captures a specific element identified by UID:

```
```

The tool prevents conflicting parameters by validating that `uid` and `fullPage` are not specified simultaneously.

*Sources: [src/tools/screenshot.ts37-47](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/screenshot.ts#L37-L47)*

### File Size Management

The tool implements intelligent file size handling to optimize response delivery:

```
```

Large screenshots (>= 2MB) are saved to temporary files using `context.saveTemporaryFile()`, while smaller screenshots are returned as base64-encoded image data directly in the MCP response.

*Sources: [src/tools/screenshot.ts68-79](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/screenshot.ts#L68-L79)*

## Tool Integration Architecture

### Context Integration

Both debugging tools integrate deeply with the `McpContext` system to access browser state and element references:

```
```

*Sources: [src/tools/script.ts46-53](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts#L46-L53) [src/tools/screenshot.ts44-46](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/screenshot.ts#L44-L46)*

### Response Formatting

The debugging tools use consistent response formatting patterns through the `McpResponse` system:

```
```

The `evaluate_script` tool formats JavaScript results in JSON code blocks, while `take_screenshot` provides descriptive status messages and either embedded images or file references.

*Sources: [src/tools/script.ts61-64](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/script.ts#L61-L64) [src/tools/screenshot.ts55-73](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/screenshot.ts#L55-L73)*

## Testing and Validation

### Test Coverage

The debugging tools include comprehensive test coverage validating different execution scenarios:

```
```

*Sources: [tests/tools/screenshot.test.ts14-113](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/screenshot.test.ts#L14-L113) [tests/formatters/snapshotFormatter.test.ts13-149](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/formatters/snapshotFormatter.test.ts#L13-L149)*

### Cross-Platform Testing

The debugging tools undergo cross-platform validation across multiple Node.js versions and operating systems through automated CI/CD workflows, ensuring consistent behavior across different deployment environments.

*Sources: [.github/workflows/run-tests.yml13-24](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/run-tests.yml#L13-L24)*

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Debugging and Scripting Tools](##debugging-and-scripting-tools)
- [Available Debugging Tools](##available-debugging-tools)
- [Script Evaluation Tool](##script-evaluation-tool)
- [Tool Overview](##tool-overview)
- [Function Execution](##function-execution)
- [Implementation Details](##implementation-details)
- [Screenshot Tool](##screenshot-tool)
- [Tool Overview](##tool-overview-1)
- [Screenshot Modes](##screenshot-modes)
- [File Size Management](##file-size-management)
- [Tool Integration Architecture](##tool-integration-architecture)
- [Context Integration](##context-integration)
- [Response Formatting](##response-formatting)
- [Testing and Validation](##testing-and-validation)
- [Test Coverage](##test-coverage)
- [Cross-Platform Testing](##cross-platform-testing)
