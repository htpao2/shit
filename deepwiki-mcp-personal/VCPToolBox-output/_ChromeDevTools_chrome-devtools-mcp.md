ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Overview

Relevant source files

- [.release-please-manifest.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.release-please-manifest.json)
- [CHANGELOG.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CHANGELOG.md)
- [README.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md)
- [package.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json)

This document provides a high-level introduction to `chrome-devtools-mcp`, explaining its purpose as an MCP server for browser automation, its core architecture, and key capabilities. For detailed installation instructions, see [Installation and Setup](#ChromeDevTools/chrome-devtools-mcp/2-installation-and-setup). For comprehensive tool documentation, see [Tools Reference](#ChromeDevTools/chrome-devtools-mcp/4-tools-reference). For development guidance, see [Development and Contributing](#ChromeDevTools/chrome-devtools-mcp/5-development-and-contributing).

## Purpose and Scope

`chrome-devtools-mcp` is a Model Context Protocol (MCP) server that enables AI coding assistants to control and inspect live Chrome browser instances. It bridges the gap between AI agents and browser automation by exposing 26 specialized tools through the MCP protocol, allowing clients like Claude, Gemini, Cursor, and VS Code Copilot to perform reliable browser automation, debugging, and performance analysis.

The system serves as a intermediary layer that translates MCP tool calls into Chrome DevTools Protocol commands via Puppeteer, providing AI agents with comprehensive browser control capabilities while maintaining proper state management and response formatting.

Sources: [README.md1-8](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L1-L8) [package.json2-4](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L2-L4)

## What is chrome-devtools-mcp

`chrome-devtools-mcp` is a Node.js CLI application that implements the Model Context Protocol server specification. When launched, it creates a persistent Chrome browser instance and exposes browser automation capabilities through 26 categorized tools. The system uses `puppeteer-core` for browser control and integrates Chrome DevTools functionality for advanced debugging and performance analysis.

### System Architecture

```
```

Sources: [package.json6](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L6-L6) [package.json37-40](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L37-L40) [README.md5-8](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L5-L8)

## Core Components

The system consists of four primary components that work together to provide browser automation capabilities:

### CLI Entry Point and MCP Server

The `index.js` file serves as the main entry point, handling command-line arguments through `yargs` and initializing the MCP server using `@modelcontextprotocol/sdk`. The server communicates with MCP clients via stdio, processing tool requests and returning structured responses.

### Tool System

```
```

Each tool is defined using the `defineTool()` factory function and implements the `ToolDefinition` interface. Tools are organized into six categories using the `ToolCategories` enum, providing logical grouping for different automation capabilities.

Sources: [README.md119-154](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L119-L154)

### Browser Management

The `McpContext` class manages the browser lifecycle, including launching Chrome instances, maintaining page state, and handling emulation settings. It provides centralized access to the browser instance across all tools while managing configuration options like headless mode, custom executable paths, and isolated profiles.

### Response Formatting

The `McpResponse` class handles formatting tool responses with consistent structure, including browser state snapshots, screenshots, and performance data. It aggregates information from multiple browser sources to provide comprehensive feedback to MCP clients.

Sources: Based on system architecture understanding from diagrams and component relationships

## Tool Ecosystem

The system provides 26 tools across six functional categories:

| Category                  | Count | Primary Functions                                                                                           |
| ------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| **Input Automation**      | 7     | `click`, `drag`, `fill`, `fill_form`, `handle_dialog`, `hover`, `upload_file`                               |
| **Navigation Automation** | 7     | `close_page`, `list_pages`, `navigate_page`, `navigate_page_history`, `new_page`, `select_page`, `wait_for` |
| **Performance**           | 3     | `performance_analyze_insight`, `performance_start_trace`, `performance_stop_trace`                          |
| **Debugging**             | 4     | `evaluate_script`, `list_console_messages`, `take_screenshot`, `take_snapshot`                              |
| **Network**               | 2     | `get_network_request`, `list_network_requests`                                                              |
| **Emulation**             | 3     | `emulate_cpu`, `emulate_network`, `resize_page`                                                             |

Each tool provides specific browser automation capabilities while maintaining consistent interfaces and error handling patterns.

Sources: [README.md121-153](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L121-L153)

## Key Capabilities

### Browser Automation

Reliable automation using `puppeteer-core` with automatic waiting for action results. Supports complex interactions like form filling, drag-and-drop operations, and file uploads with built-in synchronization.

### Performance Analysis

Integration with Chrome DevTools for recording performance traces and extracting actionable insights. Provides detailed timing information, resource usage analysis, and performance bottleneck identification.

### Advanced Debugging

Comprehensive debugging capabilities including script evaluation, console message monitoring, screenshot capture, and accessibility tree snapshots. Enables deep inspection of browser state and page content.

### Network Monitoring

Full network request tracking and analysis, allowing inspection of HTTP requests, responses, and network conditions. Supports network emulation for testing various connection scenarios.

### Browser Emulation

CPU throttling, network condition simulation, and viewport resizing for testing applications under different performance constraints and device conditions.

Sources: [README.md10-19](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/README.md#L10-L19) [package.json37-40](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/package.json#L37-L40)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Overview](##overview)
- [Purpose and Scope](##purpose-and-scope)
- [What is chrome-devtools-mcp](##what-is-chrome-devtools-mcp)
- [System Architecture](##system-architecture)
- [Core Components](##core-components)
- [CLI Entry Point and MCP Server](##cli-entry-point-and-mcp-server)
- [Tool System](##tool-system)
- [Browser Management](##browser-management)
- [Response Formatting](##response-formatting)
- [Tool Ecosystem](##tool-ecosystem)
- [Key Capabilities](##key-capabilities)
- [Browser Automation](##browser-automation)
- [Performance Analysis](##performance-analysis)
- [Advanced Debugging](##advanced-debugging)
- [Network Monitoring](##network-monitoring)
- [Browser Emulation](##browser-emulation)
