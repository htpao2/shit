Browser Management | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Browser Management

Relevant source files

- [src/McpContext.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts)
- [src/browser.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts)
- [src/logger.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/logger.ts)
- [tests/browser.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/browser.test.ts)
- [tests/index.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/index.test.ts)
- [tests/tools/emulation.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/emulation.test.ts)

This page covers the browser lifecycle management, state tracking, and configuration systems within the Chrome DevTools MCP Server. It explains how browsers are launched or connected to, how browser state is maintained across tool operations, and how emulation settings and profiles are managed.

For information about the tool system that uses these browser management capabilities, see [Tool System](#ChromeDevTools/chrome-devtools-mcp/3.3-tool-system). For details about the CLI entry point that initiates browser management, see [MCP Server and CLI](#ChromeDevTools/chrome-devtools-mcp/3.1-mcp-server-and-cli).

## Browser Lifecycle Management

The system provides two primary modes for browser management: launching new browser instances or connecting to existing ones. The `resolveBrowser()` function serves as the main entry point for establishing browser connections.

```
```

**Browser Connection Flow**

The browser connection process handles both remote debugging scenarios and local browser launching. When connecting to an existing browser, the system uses the Chrome DevTools Protocol over WebSocket connections.

Sources: [src/browser.ts45-55](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L45-L55) [src/browser.ts145-159](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L145-L159)

## McpContext: Central State Manager

The `McpContext` class serves as the central coordinator for all browser-related state and operations. It implements the `Context` interface and maintains browser state across tool executions.

```
```

**Context Initialization**

The `McpContext.from()` static factory method creates and initializes context instances. During initialization, it creates page snapshots, sets up event collectors, and establishes default page selection.

Sources: [src/McpContext.ts110-114](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L110-L114) [src/McpContext.ts103-108](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L103-L108)

## Page Management

The system maintains a snapshot of browser pages and tracks the currently selected page for tool operations. Page management includes creating new pages, switching between existing pages, and handling page lifecycle events.

```
```

**Page Selection and State Tracking**

The context maintains page selection state and automatically updates timeouts based on emulation settings when pages are switched. Each page can have independent network conditions and CPU throttling rates.

Sources: [src/McpContext.ts222-229](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L222-L229) [src/McpContext.ts192-203](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L192-L203) [src/McpContext.ts126-133](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L126-L133)

## Browser Configuration and Emulation

The system supports per-page emulation settings including network throttling and CPU throttling. These settings affect timeout values and are tracked independently for each browser page.

| Emulation Type     | Storage                 | Timeout Impact     | Default Value          |
| ------------------ | ----------------------- | ------------------ | ---------------------- |
| Network Conditions | `#networkConditionsMap` | Navigation timeout | `null` (no throttling) |
| CPU Throttling     | `#cpuThrottlingRateMap` | Default timeout    | `1` (no throttling)    |

**Timeout Calculation**

The system dynamically adjusts timeouts based on emulation settings:

```
```

**Network Condition Multipliers**

The system uses predefined multipliers for network throttling scenarios:

- Fast 4G: 1x
- Slow 4G: 2.5x
- Fast 3G: 5x
- Slow 3G: 10x

Sources: [src/McpContext.ts231-244](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L231-L244) [src/McpContext.ts40-55](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L40-L55) [src/McpContext.ts150-158](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L150-L158) [src/McpContext.ts165-174](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L165-L174)

## Profile and User Data Management

Browser profiles are managed through the `userDataDir` configuration, with support for multiple Chrome channels and isolation modes.

```
```

**Profile Directory Structure**

The system creates profile directories in the user's home directory under `.cache/chrome-devtools-mcp/`. Channel-specific profiles prevent conflicts when using multiple Chrome versions simultaneously.

**Multi-Instance Protection**

The browser launching system includes protection against multiple instances using the same profile, throwing descriptive errors when conflicts are detected.

Sources: [src/browser.ts67-85](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L67-L85) [src/browser.ts118-132](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/browser.ts#L118-L132) [tests/browser.test.ts14-42](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/browser.test.ts#L14-L42)

## Event Collection and Data Persistence

The `McpContext` manages event collectors for network requests and console messages, providing tools with access to browser events and state changes.

```
```

**Accessibility Snapshots**

The context system creates accessibility tree snapshots for element identification and interaction. These snapshots assign unique IDs to DOM elements and provide mapping between snapshot IDs and live element handles.

Sources: [src/McpContext.ts81-100](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L81-L100) [src/McpContext.ts289-323](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L289-L323) [src/McpContext.ts116-124](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L116-L124) [src/McpContext.ts135-148](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L135-L148)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Browser Management](##browser-management)
- [Browser Lifecycle Management](##browser-lifecycle-management)
- [McpContext: Central State Manager](##mcpcontext-central-state-manager)
- [Page Management](##page-management)
- [Browser Configuration and Emulation](##browser-configuration-and-emulation)
- [Profile and User Data Management](##profile-and-user-data-management)
- [Event Collection and Data Persistence](##event-collection-and-data-persistence)
