Building and Testing | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Building and Testing

Relevant source files

- [.github/workflows/presubmit.yml](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/presubmit.yml)
- [.github/workflows/run-tests.yml](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/run-tests.yml)
- [scripts/post-build.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts)
- [src/devtools.d.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/devtools.d.ts)
- [tests/setup.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/setup.ts)
- [tests/tools/screenshot.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/screenshot.test.ts)
- [tests/tools/script.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/script.test.ts)
- [tests/trace-processing/parse.test.js.snapshot](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/trace-processing/parse.test.js.snapshot)
- [tsconfig.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tsconfig.json)

This page covers the build process, TypeScript configuration, test framework setup, and CI/CD workflows for the chrome-devtools-mcp project. It explains how to compile the TypeScript source code, run tests, and understand the automated workflows that validate code changes.

For information about creating new tools and their testing requirements, see [Creating New Tools](#ChromeDevTools/chrome-devtools-mcp/5.2-creating-new-tools). For details about the release process, see [Release Process](#ChromeDevTools/chrome-devtools-mcp/5.3-release-process).

## Build System Overview

The project uses a TypeScript-based build system with custom post-processing to handle dependencies from the Chrome DevTools frontend. The build process compiles TypeScript source files and performs additional transformations to make the Chrome DevTools libraries compatible with the MCP server environment.

```
```

**Build Process Flow**

The build follows these key steps:

1. **TypeScript Compilation**: The TypeScript compiler processes source files according to `tsconfig.json` configuration
2. **Post-build Processing**: The `scripts/post-build.ts` script creates mock files and copies licenses
3. **Dependency Handling**: Chrome DevTools frontend dependencies are processed and made compatible

Sources: [tsconfig.json1-61](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tsconfig.json#L1-L61) [scripts/post-build.ts1-164](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts#L1-L164)

## TypeScript Configuration

The TypeScript configuration targets modern Node.js environments with strict type checking enabled. The project uses Node.js ESM modules and includes extensive Chrome DevTools frontend type definitions.

| Configuration      | Value      | Purpose                    |
| ------------------ | ---------- | -------------------------- |
| `target`           | `es2023`   | Modern JavaScript features |
| `module`           | `nodenext` | Node.js ESM support        |
| `moduleResolution` | `nodenext` | Node.js module resolution  |
| `outDir`           | `./build`  | Build output directory     |
| `strict`           | `true`     | Strict type checking       |

```
```

**TypeScript Compilation Setup**

The configuration includes Chrome DevTools frontend types for performance analysis, network handling, and AI assistance data formatters. Key included paths:

- Core SDK types for browser automation
- Trace processing models for performance analysis
- Network and logging models for debugging tools
- AI assistance formatters for performance insights

Sources: [tsconfig.json2-25](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tsconfig.json#L2-L25) [tsconfig.json26-61](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tsconfig.json#L26-L61)

## Test Framework and Setup

The project uses Node.js's built-in test runner with custom snapshot testing configuration. Tests are organized by tool categories and use shared utilities for browser automation testing.

```
```

**Test Configuration**

The test setup includes:

1. **Snapshot Path Resolution**: Custom resolver that places snapshots in the `tests/` directory instead of `build/`
2. **Snapshot Serialization**: String serializer for readable snapshot output instead of JSON.stringify
3. **Browser Test Utilities**: Shared `withBrowser()` helper for tool testing

Key test patterns:

- Tool handlers are tested with mock browser contexts
- Screenshot and response validation using snapshots
- Cross-platform browser automation testing

Sources: [tests/setup.ts1-21](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/setup.ts#L1-L21) [tests/tools/screenshot.test.ts1-114](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/screenshot.test.ts#L1-L114) [tests/tools/script.test.ts1-158](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/script.test.ts#L1-L158)

## CI/CD Workflows

The project uses GitHub Actions for continuous integration with two main workflows: testing and presubmit checks.

```
```

**Cross-Platform Testing Matrix**

The test workflow runs on multiple platforms and Node.js versions:

| Platform         | Node.js Versions | Special Handling                      |
| ---------------- | ---------------- | ------------------------------------- |
| `ubuntu-latest`  | 22, 24           | AppArmor disabled for browser testing |
| `windows-latest` | 22, 24           | Standard setup                        |
| `macos-latest`   | 22, 24           | Standard setup                        |

**Presubmit Validation**

The presubmit workflow ensures:

1. **Code formatting**: Validates consistent code style
2. **Documentation sync**: Verifies generated docs are up-to-date
3. **Diff detection**: Fails if generated documentation differs from committed files

Sources: [.github/workflows/run-tests.yml1-60](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/run-tests.yml#L1-L60) [.github/workflows/presubmit.yml1-65](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/presubmit.yml#L1-L65)

## Post-Build Processing

The build system includes a custom post-build script that handles Chrome DevTools frontend dependencies by creating mock implementations and copying license files.

```
```

**Mock File Creation**

The post-build script creates several mock files to make Chrome DevTools frontend code compatible:

1. **i18n Mock**: Provides internationalization functions that return strings verbatim
2. **CodeMirror Mock**: Empty export for code editor functionality
3. **Runtime Mock**: Stubs for Chrome runtime functions
4. **Protocol Client Patches**: Removes browser-specific global assignments

**License File Management**

The script ensures all third-party licenses are properly copied to the build directory, maintaining compliance with open source licenses from the Chrome DevTools frontend.

Sources: [scripts/post-build.ts41-59](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts#L41-L59) [scripts/post-build.ts67-107](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts#L67-L107) [scripts/post-build.ts120-161](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts#L120-L161)

## Development Workflow

For local development, the standard workflow involves TypeScript compilation followed by testing:

```
```

The build process creates a complete Node.js application in the `build/` directory that can be executed directly or published to npm.

Sources: [.github/workflows/run-tests.yml37-48](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/run-tests.yml#L37-L48) [.github/workflows/presubmit.yml27-31](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/presubmit.yml#L27-L31)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Building and Testing](##building-and-testing)
- [Build System Overview](##build-system-overview)
- [TypeScript Configuration](##typescript-configuration)
- [Test Framework and Setup](##test-framework-and-setup)
- [CI/CD Workflows](##cicd-workflows)
- [Post-Build Processing](##post-build-processing)
- [Development Workflow](##development-workflow)
