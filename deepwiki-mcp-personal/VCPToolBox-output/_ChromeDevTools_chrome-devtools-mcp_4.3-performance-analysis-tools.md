Performance Analysis Tools | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Performance Analysis Tools

Relevant source files

- [src/tools/performance.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts)
- [src/trace-processing/parse.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/trace-processing/parse.ts)
- [tests/tools/performance.test.js.snapshot](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/performance.test.js.snapshot)
- [tests/trace-processing/parse.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/trace-processing/parse.test.ts)

This document covers the three performance analysis tools that enable recording, processing, and analyzing Chrome browser performance traces. These tools provide comprehensive performance monitoring capabilities for web pages, including Core Web Vitals metrics, performance insights, and detailed trace analysis.

For general debugging and scripting tools, see [Debugging and Scripting Tools](#ChromeDevTools/chrome-devtools-mcp/4.4-debugging-and-scripting-tools). For network monitoring capabilities, see [Network and Emulation Tools](#ChromeDevTools/chrome-devtools-mcp/4.5-network-and-emulation-tools).

## Tool Overview

The performance analysis system consists of three interconnected tools that work together to capture and analyze browser performance data:

| Tool Name                     | Purpose                            | Key Features                                       |
| ----------------------------- | ---------------------------------- | -------------------------------------------------- |
| `performance_start_trace`     | Initiates performance recording    | Page reload control, auto-stop timer               |
| `performance_stop_trace`      | Ends recording and processes data  | Automatic trace parsing, insights generation       |
| `performance_analyze_insight` | Provides detailed insight analysis | Specific insight breakdowns, optimization guidance |

**Performance Trace Recording Flow**

```
```

Sources: [src/tools/performance.ts20-98](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts#L20-L98) [src/tools/performance.ts100-116](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts#L100-L116)

## Trace Recording

### Starting Performance Traces

The `performance_start_trace` tool initiates Chrome DevTools Protocol tracing with carefully selected categories that capture comprehensive performance data.

**Tool Configuration:**

```
```

**Trace Categories:** The tool uses a predefined set of Chrome tracing categories optimized for performance analysis, synchronized with Chrome DevTools and Lighthouse:

- Core timeline events: `devtools.timeline`, `blink.user_timing`
- V8 profiling: `v8.execute`, `disabled-by-default-v8.cpu_profiler`
- Screenshot capture: `disabled-by-default-devtools.screenshot`
- Loading events: `loading`, `latencyInfo`
- Frame analysis: `disabled-by-default-devtools.timeline.frame`

The recording process includes state management to prevent multiple concurrent traces and optional page reloading to capture clean load performance.

Sources: [src/tools/performance.ts20-98](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts#L20-L98) [src/tools/performance.ts61-78](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts#L61-L78)

### Stopping and Processing Traces

The `performance_stop_trace` tool handles trace termination and immediate processing through the Chrome DevTools Frontend trace engine.

**Trace Processing Pipeline**

```
```

The processing pipeline transforms raw Chrome trace events into structured performance data and actionable insights using the same engine that powers Chrome DevTools Performance panel.

Sources: [src/tools/performance.ts155-187](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts#L155-L187) [src/trace-processing/parse.ts30-74](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/trace-processing/parse.ts#L30-L74)

## Insight Analysis System

### Available Performance Insights

The trace analysis generates multiple insight types that identify specific performance optimization opportunities:

| Insight Name      | Focus Area                      | Optimization Target             |
| ----------------- | ------------------------------- | ------------------------------- |
| `LCPBreakdown`    | Largest Contentful Paint phases | Resource loading, render delays |
| `LCPDiscovery`    | LCP element discoverability     | HTML optimization, lazy loading |
| `RenderBlocking`  | Critical resource blocking      | Script/style deferring          |
| `DocumentLatency` | Initial document request        | Server response, redirects      |
| `ThirdParties`    | Third-party resource impact     | Script prioritization           |

### Detailed Insight Analysis

The `performance_analyze_insight` tool provides comprehensive breakdowns of specific performance issues identified during trace analysis.

**Insight Analysis Workflow**

```
```

**Example LCP Breakdown Analysis:**

- Time breakdown across 4 LCP phases (TTFB, Load Delay, Load Duration, Render Delay)
- Network request details for LCP resources
- Percentage contribution of each phase to total LCP time
- Specific optimization recommendations with external resources

Sources: [src/tools/performance.ts118-153](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts#L118-L153) [src/trace-processing/parse.ts87-129](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/trace-processing/parse.ts#L87-L129)

## Trace Storage and State Management

### Context Integration

Performance traces integrate with the `McpContext` system for persistent state management across tool invocations:

```
```

The context ensures only one trace runs at a time and maintains a history of recorded traces for analysis. The `performance_analyze_insight` tool operates on the most recent trace by default.

**Performance Context State**

```
```

### Error Handling

The performance tools implement comprehensive error handling for common failure scenarios:

- **Multiple concurrent traces**: Prevention with clear error messaging
- **Trace parsing failures**: Graceful degradation with error details
- **Missing insights**: Validation of insight names and availability
- **Empty trace buffers**: Detection and user-friendly error reporting

Sources: [src/tools/performance.ts40-45](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts#L40-L45) [src/tools/performance.ts177-186](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/tools/performance.ts#L177-L186) [src/trace-processing/parse.ts34-44](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/trace-processing/parse.ts#L34-L44)

## Integration with Chrome DevTools Frontend

The performance analysis system leverages Chrome DevTools Frontend libraries for trace processing and insight generation:

**Core Dependencies:**

- `TraceEngine.TraceModel.Model`: Main trace parsing engine
- `PerformanceTraceFormatter`: Summary formatting
- `PerformanceInsightFormatter`: Detailed insight analysis
- `TraceEngine.Insights`: Performance insight detection

This integration ensures the MCP server provides the same analysis capabilities as Chrome DevTools Performance panel, with consistent metrics calculation and insight detection algorithms.

Sources: [src/trace-processing/parse.ts7-13](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/trace-processing/parse.ts#L7-L13) [src/trace-processing/parse.ts76-82](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/trace-processing/parse.ts#L76-L82) [src/trace-processing/parse.ts124-128](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/trace-processing/parse.ts#L124-L128)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Performance Analysis Tools](##performance-analysis-tools)
- [Tool Overview](##tool-overview)
- [Trace Recording](##trace-recording)
- [Starting Performance Traces](##starting-performance-traces)
- [Stopping and Processing Traces](##stopping-and-processing-traces)
- [Insight Analysis System](##insight-analysis-system)
- [Available Performance Insights](##available-performance-insights)
- [Detailed Insight Analysis](##detailed-insight-analysis)
- [Trace Storage and State Management](##trace-storage-and-state-management)
- [Context Integration](##context-integration)
- [Error Handling](##error-handling)
- [Integration with Chrome DevTools Frontend](##integration-with-chrome-devtools-frontend)
