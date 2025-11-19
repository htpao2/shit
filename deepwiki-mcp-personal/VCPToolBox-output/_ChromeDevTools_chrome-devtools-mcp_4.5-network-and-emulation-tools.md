Network and Emulation Tools | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Network and Emulation Tools

Relevant source files

- [docs/tool-reference.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md)
- [src/tools/emulation.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/emulation.ts)
- [tests/McpContext.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/McpContext.test.ts)

This document covers the 5 tools for network monitoring and browser environment emulation in chrome-devtools-mcp. Network tools provide access to HTTP request/response data captured during page interactions, while emulation tools modify browser conditions like CPU performance, network speed, and viewport dimensions.

For performance tracing and analysis capabilities, see [Performance Analysis Tools](#ChromeDevTools/chrome-devtools-mcp/4.3-performance-analysis-tools). For debugging tools that work with browser state, see [Debugging and Scripting Tools](#ChromeDevTools/chrome-devtools-mcp/4.4-debugging-and-scripting-tools).

## Network Monitoring Tools

The network tools provide access to HTTP traffic captured by the Chrome DevTools Protocol during page interactions. These tools enable analysis of request patterns, response data, and network performance characteristics.

### Network Request Listing

The `list_network_requests` tool returns all HTTP requests made by the currently selected page. This includes XHR requests, fetch calls, resource loads, and navigation requests captured since the page was loaded or refreshed.

**Parameters:** None

**Returns:** Array of network request objects with URL, method, status, timing, and response data.

### Individual Request Retrieval

The `get_network_request` tool retrieves detailed information about a specific network request by its URL. Use `list_network_requests` first to identify available request URLs.

**Parameters:**

- `url` (string): The exact URL of the request to retrieve

**Returns:** Detailed request object including headers, body, timing metrics, and response data.

```
```

**Network Tools Architecture**

Sources: [docs/tool-reference.md249-267](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L249-L267)

## Browser Environment Emulation

The emulation tools modify browser execution conditions to simulate different device capabilities and network environments. These tools directly affect how pages render and execute, enabling testing under constrained conditions.

### CPU Performance Emulation

The `emulate_cpu` tool throttles JavaScript execution speed by applying a slowdown multiplier to the selected page. This simulates slower device performance for testing responsiveness.

**Parameters:**

- `throttlingRate` (number): CPU slowdown factor from 1-20x (1 = no throttling, 20 = 20x slower)

The tool calls `page.emulateCPUThrottling()` and updates the `McpContext` to adjust default timeouts proportionally to the throttling rate.

### Network Condition Emulation

The `emulate_network` tool applies predefined network throttling profiles to simulate different connection speeds and latencies.

**Parameters:**

- `throttlingOption` (enum): Network profile including "No emulation", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G"

Available throttling options are derived from `PredefinedNetworkConditions` in puppeteer-core. Setting "No emulation" disables network throttling.

### Viewport Resizing

The `resize_page` tool changes the browser window dimensions to test responsive layouts and viewport-dependent functionality.

**Parameters:**

- `width` (number): Page width in pixels
- `height` (number): Page height in pixels

```
```

**Emulation Tool Flow and State Management**

Sources: [src/tools/emulation.ts17-75](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/emulation.ts#L17-L75) [docs/tool-reference.md185-216](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L185-L216)

## Browser Context Integration

The emulation tools integrate with `McpContext` to maintain consistent browser state and automatically adjust timeout values based on performance constraints.

### Timeout Adjustment Mechanism

When CPU or network throttling is applied, the context automatically increases default timeouts to account for slower execution:

| Emulation Type     | Timeout Impact       | Multiplier Source                   |
| ------------------ | -------------------- | ----------------------------------- |
| CPU Throttling     | Default page timeout | `throttlingRate` value              |
| Network Conditions | Navigation timeout   | Predefined multiplier per condition |
| Combined           | Both timeouts        | Product of individual multipliers   |

The `waitForEventsAfterAction` method uses these multipliers to extend wait times appropriately for throttled conditions.

### State Persistence

Emulation settings persist across tool calls within the same browser session:

- **CPU throttling rate**: Stored in `McpContext` and applied to all new pages
- **Network conditions**: Applied to the current page and maintained for subsequent operations
- **Viewport size**: Affects the selected page only until manually changed

```
```

**Network and Emulation Tools Integration with Browser Context**

Sources: [tests/McpContext.test.ts43-75](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/McpContext.test.ts#L43-L75) [src/tools/emulation.ts31-49](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/emulation.ts#L31-L49)

## Tool Implementation Details

All network and emulation tools follow the standard `defineTool` pattern with category annotation:

- **Network tools**: Category `ToolCategories.NETWORK`, read-only operations
- **Emulation tools**: Category `ToolCategories.EMULATION`, state-modifying operations

The emulation tools validate parameters using Zod schemas and interact directly with Puppeteer's Chrome DevTools Protocol bindings for `emulateCPUThrottling`, `emulateNetworkConditions`, and viewport manipulation.

Network tools access request data captured automatically by the Chrome DevTools Protocol's Network domain, which is enabled when pages are loaded through the MCP server.

Sources: [src/tools/emulation.ts8-10](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/emulation.ts#L8-L10) [docs/tool-reference.md21-31](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/docs/tool-reference.md#L21-L31)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Network and Emulation Tools](##network-and-emulation-tools)
- [Network Monitoring Tools](##network-monitoring-tools)
- [Network Request Listing](##network-request-listing)
- [Individual Request Retrieval](##individual-request-retrieval)
- [Browser Environment Emulation](##browser-environment-emulation)
- [CPU Performance Emulation](##cpu-performance-emulation)
- [Network Condition Emulation](##network-condition-emulation)
- [Viewport Resizing](##viewport-resizing)
- [Browser Context Integration](##browser-context-integration)
- [Timeout Adjustment Mechanism](##timeout-adjustment-mechanism)
- [State Persistence](##state-persistence)
- [Tool Implementation Details](##tool-implementation-details)
