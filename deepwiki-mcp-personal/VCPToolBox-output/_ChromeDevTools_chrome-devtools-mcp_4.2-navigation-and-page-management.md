Navigation and Page Management | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Navigation and Page Management

Relevant source files

- [docs/tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md)
- [src/tools/pages.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts)

This document covers the 7 navigation and page management tools available in chrome-devtools-mcp. These tools enable comprehensive control over browser tabs and pages, including creation, selection, navigation, and lifecycle management. For input automation tools like clicking and form filling, see [Input Automation Tools](#ChromeDevTools/chrome-devtools-mcp/4.1-input-automation-tools). For browser emulation and performance tools, see [Performance Analysis Tools](#ChromeDevTools/chrome-devtools-mcp/4.3-performance-analysis-tools) and [Network and Emulation Tools](#ChromeDevTools/chrome-devtools-mcp/4.5-network-and-emulation-tools).

## Overview

The navigation tools provide complete control over browser page management and navigation operations. All navigation tools operate within the context of the `McpContext` browser management system and use the selected page concept for targeting operations.

| Tool                    | Purpose                                   | Read-Only | Key Parameters            |
| ----------------------- | ----------------------------------------- | --------- | ------------------------- |
| `list_pages`            | List all open browser pages               | Yes       | None                      |
| `select_page`           | Set active page for subsequent operations | Yes       | `pageIdx`                 |
| `new_page`              | Create new browser tab/page               | No        | `url`                     |
| `close_page`            | Close a specific page                     | No        | `pageIdx`                 |
| `navigate_page`         | Navigate current page to URL              | No        | `url`                     |
| `navigate_page_history` | Navigate browser history                  | No        | `navigate` (back/forward) |
| `wait_for`              | Wait for text to appear on page           | No        | `text`                    |

Sources: [docs/tool-reference.md115-183](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L115-L183) [src/tools/pages.ts11-141](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L11-L141)

## Page Lifecycle and Management Flow

```
```

Sources: [src/tools/pages.ts11-141](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L11-L141) [docs/tool-reference.md115-183](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L115-L183)

## Page Discovery and Selection

### `list_pages`

Returns a list of all open browser pages with their indices and metadata. This is a read-only operation that includes pages in the response automatically.

**Implementation Details:**

- Defined in [src/tools/pages.ts11-22](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L11-L22)
- Sets `response.setIncludePages(true)` to include page information
- Category: `NAVIGATION_AUTOMATION`
- No parameters required

### `select_page`

Sets the active page context for all subsequent tool operations. This operation brings the selected page to the front and updates the browser context.

**Key Behaviors:**

- Calls `page.bringToFront()` to activate the page
- Updates `context.setSelectedPageIdx()` with the new selection
- Includes updated page list in response

**Implementation Details:**

- Defined in [src/tools/pages.ts24-44](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L24-L44)
- Uses `context.getPageByIdx()` to retrieve the page
- Validates page index exists before selection

Sources: [src/tools/pages.ts24-44](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L24-L44) [docs/tool-reference.md165-173](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L165-L173)

## Page Creation and Destruction

### `new_page`

Creates a new browser page and navigates it to the specified URL. The new page becomes the active context automatically.

**Key Behaviors:**

- Creates page via `context.newPage()`
- Navigates to URL using `page.goto()`
- Wraps navigation in `context.waitForEventsAfterAction()` for proper synchronization
- Includes updated page list in response

### `close_page`

Closes a specific page by index and resets the selected page to index 0 (the first remaining page).

**Key Behaviors:**

- Retrieves page using `context.getPageByIdx()`
- Resets selection to page 0 with `context.setSelectedPageIdx(0)`
- Closes page with `page.close({runBeforeUnload: false})`
- Skips before-unload handlers for clean closure

Sources: [src/tools/pages.ts68-87](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L68-L87) [src/tools/pages.ts46-66](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L46-L66) [docs/tool-reference.md155-163](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L155-L163) [docs/tool-reference.md117-125](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L117-L125)

## Navigation Operations

### `navigate_page`

Navigates the currently selected page to a new URL. This operation is wrapped in event synchronization to ensure proper loading completion.

**Implementation Pattern:**

```
```

### `navigate_page_history`

Performs browser history navigation (back or forward) on the currently selected page.

**Key Behaviors:**

- Supports `back` and `forward` navigation directions
- Uses `page.goBack()` and `page.goForward()` methods
- Includes error handling for invalid navigation attempts
- Gracefully handles cases where navigation is not possible

**Error Handling:**

- Catches navigation failures and provides user feedback
- Continues execution even if navigation fails

Sources: [src/tools/pages.ts89-108](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L89-L108) [src/tools/pages.ts110-141](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L110-L141) [docs/tool-reference.md135-143](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L135-L143) [docs/tool-reference.md145-153](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L145-L153)

## Content Synchronization

### `wait_for`

Waits for specified text content to appear on the currently selected page. This tool is essential for synchronizing automation workflows with dynamic content loading.

**Use Cases:**

- Waiting for AJAX content to load
- Ensuring form submissions complete
- Synchronizing with single-page application state changes
- Waiting for specific UI elements to appear

Sources: [docs/tool-reference.md175-183](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L175-L183)

## Tool Integration Patterns

```
```

Sources: [src/tools/pages.ts11-141](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L11-L141)

## Context Management Integration

All navigation tools integrate with the `McpContext` system for:

- **Page Index Management**: Consistent tracking of page indices across operations
- **Selected Page State**: Maintaining the current active page for tool operations
- **Event Synchronization**: Using `waitForEventsAfterAction()` for navigation operations
- **Response Formatting**: Automatic inclusion of updated page lists via `setIncludePages(true)`
- **Browser State**: Coordination with browser instance and page lifecycle

The navigation tools form the foundation for all browser automation workflows, providing the essential page management capabilities required by other tool categories.

Sources: [src/tools/pages.ts11-141](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/pages.ts#L11-L141) [docs/tool-reference.md115-183](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L115-L183)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Navigation and Page Management](##navigation-and-page-management)
- [Overview](##overview)
- [Page Lifecycle and Management Flow](##page-lifecycle-and-management-flow)
- [Page Discovery and Selection](##page-discovery-and-selection)
- [\`list\_pages\`](##list_pages)
- [\`select\_page\`](##select_page)
- [Page Creation and Destruction](##page-creation-and-destruction)
- [\`new\_page\`](##new_page)
- [\`close\_page\`](##close_page)
- [Navigation Operations](##navigation-operations)
- [\`navigate\_page\`](##navigate_page)
- [\`navigate\_page\_history\`](##navigate_page_history)
- [Content Synchronization](##content-synchronization)
- [\`wait\_for\`](##wait_for)
- [Tool Integration Patterns](##tool-integration-patterns)
- [Context Management Integration](##context-management-integration)
