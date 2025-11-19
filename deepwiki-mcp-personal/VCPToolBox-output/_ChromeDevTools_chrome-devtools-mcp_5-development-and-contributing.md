Development and Contributing | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Development and Contributing

Relevant source files

- [.github/workflows/run-tests.yml](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/run-tests.yml)
- [CONTRIBUTING.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CONTRIBUTING.md)
- [scripts/post-build.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts)
- [src/devtools.d.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/devtools.d.ts)
- [tests/setup.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/setup.ts)
- [tests/tools/screenshot.test.ts](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/screenshot.test.ts)
- [tests/trace-processing/parse.test.js.snapshot](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/trace-processing/parse.test.js.snapshot)
- [tsconfig.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tsconfig.json)

This document provides guidance for developers who want to contribute to the chrome-devtools-mcp project. It covers the development workflow, build system, testing infrastructure, and contribution process.

For detailed build and testing procedures, see [Building and Testing](#ChromeDevTools/chrome-devtools-mcp/5.1-building-and-testing). For creating new tools, see [Creating New Tools](#ChromeDevTools/chrome-devtools-mcp/5.2-creating-new-tools). For the automated release process, see [Release Process](#ChromeDevTools/chrome-devtools-mcp/5.3-release-process).

## Prerequisites and Setup

The project requires Node.js and follows Google's contribution guidelines. All contributions must be accompanied by a signed Contributor License Agreement (CLA) and follow conventional commit standards.

### Development Environment Setup

```
```

### Testing with MCP Inspector

```
```

Sources: [CONTRIBUTING.md42-53](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CONTRIBUTING.md#L42-L53)

## Development Workflow

The following diagram shows the complete development workflow from code changes to deployment:

**Development and CI/CD Pipeline**

```
```

Sources: [CONTRIBUTING.md1-88](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CONTRIBUTING.md#L1-L88) [.github/workflows/run-tests.yml1-60](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/run-tests.yml#L1-L60) [scripts/post-build.ts1-164](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts#L1-L164)

## Build System Architecture

The build system transforms TypeScript source code and integrates Chrome DevTools frontend components:

**TypeScript Build and Post-Processing Pipeline**

```
```

Sources: [tsconfig.json1-62](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tsconfig.json#L1-L62) [scripts/post-build.ts1-164](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts#L1-L164)

## Testing Infrastructure

The testing system uses Node.js native test runner with custom snapshot configuration:

**Test Setup and Execution Flow**

```
```

Sources: [tests/setup.ts1-21](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/setup.ts#L1-L21) [tests/tools/screenshot.test.ts1-114](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/tests/tools/screenshot.test.ts#L1-L114) [.github/workflows/run-tests.yml25-48](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/run-tests.yml#L25-L48)

## Key Development Files

| File                              | Purpose                  | Key Functions                                    |
| --------------------------------- | ------------------------ | ------------------------------------------------ |
| `tsconfig.json`                   | TypeScript configuration | Compiler options, includes 58 DevTools modules   |
| `scripts/post-build.ts`           | Build post-processing    | `copyThirdPartyLicenseFiles()`, mock creation    |
| `tests/setup.ts`                  | Test environment setup   | Snapshot path resolution, serializers            |
| `.github/workflows/run-tests.yml` | CI/CD pipeline           | Cross-platform testing on 3 OS × 2 Node versions |
| `CONTRIBUTING.md`                 | Contribution guidelines  | CLA, conventional commits, testing procedures    |

## Development Commands

| Command                               | Purpose                | Output                               |
| ------------------------------------- | ---------------------- | ------------------------------------ |
| `npm ci`                              | Install dependencies   | Clean install from package-lock.json |
| `npm run build`                       | Compile TypeScript     | Builds to `build/` directory         |
| `npm run test`                        | Run test suite         | Executes tests with Node.js runner   |
| `npm run docs`                        | Generate documentation | Updates tool reference documentation |
| `npx @modelcontextprotocol/inspector` | Test MCP server        | Interactive tool testing interface   |

## DevTools Integration Mocks

The build system creates several mocks to integrate Chrome DevTools frontend code without browser dependencies:

```
```

These mocks enable the use of DevTools trace analysis and performance insights in a Node.js environment.

Sources: [scripts/post-build.ts67-128](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/scripts/post-build.ts#L67-L128) [src/devtools.d.ts1-12](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/src/devtools.d.ts#L1-L12)

## Contributing Guidelines

All contributions must follow these requirements:

1. **CLA**: Sign the Google Contributor License Agreement
2. **Conventional Commits**: Use conventional commit format for PR titles
3. **Code Review**: All submissions require GitHub PR review
4. **Testing**: Ensure tests pass on all supported platforms
5. **Documentation**: Run `npm run docs` when adding/modifying tools

For debugging, use the `--log-file` option with the MCP inspector to write debug logs to a specified path.

Sources: [CONTRIBUTING.md8-88](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CONTRIBUTING.md#L8-L88)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Development and Contributing](##development-and-contributing)
- [Prerequisites and Setup](##prerequisites-and-setup)
- [Development Environment Setup](##development-environment-setup)
- [Testing with MCP Inspector](##testing-with-mcp-inspector)
- [Development Workflow](##development-workflow)
- [Build System Architecture](##build-system-architecture)
- [Testing Infrastructure](##testing-infrastructure)
- [Key Development Files](##key-development-files)
- [Development Commands](##development-commands)
- [DevTools Integration Mocks](##devtools-integration-mocks)
- [Contributing Guidelines](##contributing-guidelines)
