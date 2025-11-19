Input Automation Tools | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Input Automation Tools

Relevant source files

- [docs/tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md)
- [src/tools/input.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts)
- [tests/tools/input.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/input.test.ts)

This document covers the 7 input automation tools that enable programmatic interaction with web page elements through the Chrome DevTools MCP Server. These tools handle user input simulation including clicking, typing, dragging, and file uploads.

For navigation and page management operations, see [Navigation and Page Management](#ChromeDevTools/chrome-devtools-mcp/4.2-navigation-and-page-management). For performance monitoring during interactions, see [Performance Analysis Tools](#ChromeDevTools/chrome-devtools-mcp/4.3-performance-analysis-tools).

## Overview

The input automation tools provide fundamental user interaction capabilities for browser automation workflows. All tools operate on elements identified by unique identifiers (`uid`) from page snapshots and automatically wait for DOM stabilization after actions.

| Tool            | Primary Function                | Key Parameters         |
| --------------- | ------------------------------- | ---------------------- |
| `click`         | Click or double-click elements  | `uid`, `dblClick`      |
| `hover`         | Mouse hover over elements       | `uid`                  |
| `fill`          | Type text into inputs/textareas | `uid`, `value`         |
| `drag`          | Drag and drop between elements  | `from_uid`, `to_uid`   |
| `fill_form`     | Fill multiple form fields       | `elements[]`           |
| `handle_dialog` | Respond to browser dialogs      | `action`, `promptText` |
| `upload_file`   | Upload files through inputs     | `uid`, `filePath`      |

Sources: [docs/tool-reference.md5-12](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L5-L12) [src/tools/input.ts12-217](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L12-L217)

## Tool Architecture

```
```

Sources: [src/tools/input.ts8-217](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L8-L217) [src/tools/ToolDefinition.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts)

## Element Identification and Interaction Flow

```
```

Sources: [src/tools/input.ts30-48](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L30-L48) [tests/tools/input.test.ts115-152](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/input.test.ts#L115-L152)

## Core Input Tools

### Click Tool

The `click` tool performs single or double-click actions on page elements with automatic navigation and DOM stabilization waiting.

**Implementation Details:**

- Uses `handle.asLocator().click()` with configurable click count
- Waits for navigation events and DOM stability via `waitForEventsAfterAction()`
- Supports both single clicks (`count: 1`) and double clicks (`count: 2`)

**Parameters:**

- `uid` (required): Element identifier from page snapshot
- `dblClick` (optional): Boolean flag for double-click behavior

Sources: [src/tools/input.ts12-49](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L12-L49) [tests/tools/input.test.ts26-153](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/input.test.ts#L26-L153)

### Fill Tool

The `fill` tool handles text input for form elements including `<input>`, `<textarea>`, and `<select>` elements.

**Implementation Details:**

- Uses Puppeteer's `fill()` method which clears existing content before typing
- Automatically handles different input types and select options
- Triggers appropriate DOM events during text entry

Sources: [src/tools/input.ts80-107](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L80-L107) [tests/tools/input.test.ts182-206](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/input.test.ts#L182-L206)

### Drag Tool

The `drag` tool implements drag-and-drop functionality between two page elements.

**Implementation Details:**

- Coordinates between source (`from_uid`) and target (`to_uid`) elements
- Uses `fromHandle.drag(toHandle)` followed by `toHandle.drop(fromHandle)`
- Includes 50ms delay between drag and drop operations for browser compatibility
- Properly disposes of both element handles after completion

Sources: [src/tools/input.ts109-136](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L109-L136) [tests/tools/input.test.ts208-250](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/input.test.ts#L208-L250)

### Upload File Tool

The `uploadFile` tool handles file uploads through both direct file inputs and proxy elements that trigger file choosers.

**Implementation Details:**

- Primary approach: Direct upload via `handle.uploadFile(filePath)`
- Fallback approach: Click element to trigger file chooser, then `page.waitForFileChooser()`
- Supports both `<input type="file">` elements and custom upload buttons
- 3-second timeout for file chooser detection

**Error Handling:**

```
Failed to upload file. The element could not accept the file directly, 
and clicking it did not trigger a file chooser.
```

Sources: [src/tools/input.ts171-217](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L171-L217) [tests/tools/input.test.ts301-405](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/input.test.ts#L301-L405)

## Batch Operations

### Fill Form Tool

The `fillForm` tool enables efficient batch filling of multiple form elements in a single operation.

**Implementation Details:**

- Iterates through array of `{uid, value}` objects
- Each element filled individually with proper handle disposal
- Uses same `waitForEventsAfterAction()` pattern for each field
- Single snapshot generated after all fields completed

**Parameters:**

- `elements`: Array of objects containing `uid` and `value` properties

Sources: [src/tools/input.ts138-169](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L138-L169) [tests/tools/input.test.ts252-299](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/input.test.ts#L252-L299)

## Event Synchronization

All input automation tools use the `waitForEventsAfterAction()` pattern to ensure proper timing and state consistency:

**Synchronization Behavior:**

- Waits for navigation events to complete
- Monitors DOM mutations for stability
- Ensures page state is consistent before tool completion
- Automatically generates updated snapshots when `includeSnapshot` is enabled

**Code Pattern:**

```
```

Sources: [src/tools/input.ts34-38](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L34-L38) [src/tools/input.ts69-71](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L69-L71) [tests/tools/input.test.ts76-112](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/input.test.ts#L76-L112)

## Error Handling and Resource Management

All input tools follow consistent error handling and resource management patterns:

**Resource Management:**

- Element handles always disposed in `finally` blocks
- Multiple handles (drag tool) disposed individually
- Prevents memory leaks in long-running automation sessions

**Error Patterns:**

- Element not found: Handled by `getElementByUid()`
- Upload failures: Graceful fallback to file chooser approach
- Timeout errors: Configurable timeouts for file operations

Sources: [src/tools/input.ts45-47](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L45-L47) [src/tools/input.ts132-134](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L132-L134) [src/tools/input.ts192-216](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L192-L216)

## Tool Category Integration

Input automation tools are registered under `ToolCategories.INPUT_AUTOMATION` and integrate with the broader tool ecosystem:

**Integration Points:**

- Automatic snapshot generation via `response.setIncludeSnapshot(true)`
- Browser state management through `McpContext`
- Consistent response formatting via `response.appendResponseLine()`
- Category-based tool discovery and documentation

Sources: [src/tools/input.ts16](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/input.ts#L16-L16) [src/tools/categories.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/categories.ts) [src/tools/ToolDefinition.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/ToolDefinition.ts)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Input Automation Tools](##input-automation-tools)
- [Overview](##overview)
- [Tool Architecture](##tool-architecture)
- [Element Identification and Interaction Flow](##element-identification-and-interaction-flow)
- [Core Input Tools](##core-input-tools)
- [Click Tool](##click-tool)
- [Fill Tool](##fill-tool)
- [Drag Tool](##drag-tool)
- [Upload File Tool](##upload-file-tool)
- [Batch Operations](##batch-operations)
- [Fill Form Tool](##fill-form-tool)
- [Event Synchronization](##event-synchronization)
- [Error Handling and Resource Management](##error-handling-and-resource-management)
- [Tool Category Integration](##tool-category-integration)
