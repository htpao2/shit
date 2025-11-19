Event Handling and Synchronization | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Event Handling and Synchronization

Relevant source files

- [src/McpContext.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts)
- [src/WaitForHelper.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts)
- [tests/tools/emulation.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/emulation.test.ts)

This page covers how the chrome-devtools-mcp system handles asynchronous browser events, waits for page state changes, and synchronizes operations across multiple browser contexts. The system must coordinate between user actions, DOM mutations, navigation events, and network requests to ensure tools execute at the right time and return accurate results.

For information about tool execution patterns, see [Tool System](#ChromeDevTools/chrome-devtools-mcp/3.3-tool-system). For details about browser lifecycle management, see [Browser Management](#ChromeDevTools/chrome-devtools-mcp/3.2-browser-management).

## Synchronization Overview

The chrome-devtools-mcp system uses a two-tier approach for event handling and synchronization:

1. **Action-level synchronization** - Waiting for events after user actions complete
2. **Browser-level event collection** - Continuous monitoring of network requests, console messages, and dialogs

```
```

**Sources:** [src/McpContext.ts361-373](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L361-L373) [src/WaitForHelper.ts126-160](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L126-L160)

## WaitForHelper: Core Synchronization Engine

The `WaitForHelper` class provides the primary synchronization mechanism for waiting after user actions. It handles three key scenarios: navigation detection, navigation completion, and DOM stabilization.

### Navigation and DOM Stability Detection

```
```

**Sources:** [src/WaitForHelper.ts84-114](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L84-L114) [src/WaitForHelper.ts35-82](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L35-L82) [src/WaitForHelper.ts126-160](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L126-L160)

### Timeout Calculation with Throttling

The system dynamically adjusts timeouts based on emulation settings to ensure reliable operation under different performance conditions:

| Timeout Type           | Base Duration | Multiplier                    | Purpose                           |
| ---------------------- | ------------- | ----------------------------- | --------------------------------- |
| DOM Stability          | 3000ms        | CPU throttling rate           | Wait for mutations to stop        |
| DOM Mutation Detection | 100ms         | CPU throttling rate           | Time between mutation checks      |
| Navigation Detection   | 100ms         | CPU throttling rate           | Time to wait for navigation start |
| Navigation Completion  | 3000ms        | Network throttling multiplier | Wait for navigation finish        |

```
```

**Sources:** [src/WaitForHelper.ts18-28](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L18-L28) [src/McpContext.ts40-55](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L40-L55) [src/McpContext.ts231-244](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L231-L244)

## Event Collection and Management

The `McpContext` class manages continuous event collection through specialized collector classes and handles page-level event coordination.

### Page-Level Event Coordination

```
```

**Sources:** [src/McpContext.ts222-229](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L222-L229) [src/McpContext.ts81-100](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L81-L100) [src/McpContext.ts69-72](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L69-L72)

### Dialog Event Handling

The system automatically captures browser dialogs (alerts, confirms, prompts) and makes them available to tools:

```
```

**Sources:** [src/McpContext.ts218-229](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L218-L229) [src/McpContext.ts184-190](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L184-L190)

## Cancellation and Cleanup Patterns

The system uses `AbortController` extensively to ensure clean cancellation of pending operations when errors occur or tools complete:

### AbortController Integration

```
```

**Sources:** [src/WaitForHelper.ts11](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L11-L11) [src/WaitForHelper.ts62-72](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L62-L72) [src/WaitForHelper.ts142-159](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L142-L159)

## Performance Optimization Strategies

The synchronization system includes several optimizations to minimize waiting time while ensuring reliability:

### Smart Navigation Detection

The system distinguishes between different types of navigation to avoid unnecessary waiting:

| Navigation Type            | Wait Required | Reason                    |
| -------------------------- | ------------- | ------------------------- |
| `historySameDocument`      | No            | Same page, different hash |
| `historyDifferentDocument` | No            | Back/forward navigation   |
| `sameDocument`             | No            | SPA navigation            |
| Other types                | Yes           | Full page load required   |

### DOM Mutation Batching

The `MutationObserver` uses a debouncing strategy where the stability timer resets on each mutation, only completing when no mutations occur for the specified period.

**Sources:** [src/WaitForHelper.ts88-101](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L88-L101) [src/WaitForHelper.ts36-60](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/WaitForHelper.ts#L36-L60)

## Integration with Tool System

The synchronization system integrates with the broader tool system through the `McpContext.waitForEventsAfterAction()` method, which serves as the primary interface for tools that need to wait for browser state changes:

```
```

**Sources:** [src/McpContext.ts361-373](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L361-L373) [src/McpContext.ts353-359](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/McpContext.ts#L353-L359)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Event Handling and Synchronization](##event-handling-and-synchronization)
- [Synchronization Overview](##synchronization-overview)
- [WaitForHelper: Core Synchronization Engine](##waitforhelper-core-synchronization-engine)
- [Navigation and DOM Stability Detection](##navigation-and-dom-stability-detection)
- [Timeout Calculation with Throttling](##timeout-calculation-with-throttling)
- [Event Collection and Management](##event-collection-and-management)
- [Page-Level Event Coordination](##page-level-event-coordination)
- [Dialog Event Handling](##dialog-event-handling)
- [Cancellation and Cleanup Patterns](##cancellation-and-cleanup-patterns)
- [AbortController Integration](##abortcontroller-integration)
- [Performance Optimization Strategies](##performance-optimization-strategies)
- [Smart Navigation Detection](##smart-navigation-detection)
- [DOM Mutation Batching](##dom-mutation-batching)
- [Integration with Tool System](##integration-with-tool-system)
