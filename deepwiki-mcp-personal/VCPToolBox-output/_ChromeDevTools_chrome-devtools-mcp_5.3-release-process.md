Release Process | ChromeDevTools/chrome-devtools-mcp | DeepWiki

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

# Release Process

Relevant source files

- [.github/workflows/publish-to-npm-on-tag.yml](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/publish-to-npm-on-tag.yml)
- [.release-please-manifest.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.release-please-manifest.json)
- [CHANGELOG.md](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CHANGELOG.md)
- [server.json](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/server.json)

This document describes the automated release process for chrome-devtools-mcp, including version management, changelog generation, and publishing to both npm and MCP registries. The process uses release-please for automated releases based on conventional commits and GitHub Actions for CI/CD pipeline execution.

For information about the build process and testing that occurs before release, see [Building and Testing](#ChromeDevTools/chrome-devtools-mcp/5.1-building-and-testing). For details about contributing code changes that trigger releases, see [Creating New Tools](#ChromeDevTools/chrome-devtools-mcp/5.2-creating-new-tools).

## Automated Release Workflow Overview

The release process is fully automated using release-please and GitHub Actions. When conventional commits are merged to the main branch, release-please analyzes the commit history to determine if a new release is needed and what type of version bump is required.

```
```

Sources: [.github/workflows/publish-to-npm-on-tag.yml1-77](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/publish-to-npm-on-tag.yml#L1-L77) [CHANGELOG.md1-55](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CHANGELOG.md#L1-L55) [.release-please-manifest.json1-4](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.release-please-manifest.json#L1-L4)

## Version Management with release-please

The project uses release-please to automate version management based on conventional commit messages. The current version is tracked in the release-please manifest file.

### Release Please Configuration

The release-please manifest contains the current version number:

| File                            | Purpose                                   | Current Version |
| ------------------------------- | ----------------------------------------- | --------------- |
| `.release-please-manifest.json` | Tracks current version for release-please | 0.2.2           |

### Conventional Commit Analysis

release-please analyzes commit messages to determine version bumps:

- **feat:** triggers minor version bump (0.2.0 → 0.3.0)
- **fix:** triggers patch version bump (0.2.0 → 0.2.1)
- **BREAKING CHANGE:** triggers major version bump (0.2.0 → 1.0.0)

The changelog shows examples of how commits map to releases:

```
```

Sources: [.release-please-manifest.json1-4](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.release-please-manifest.json#L1-L4) [CHANGELOG.md3-55](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CHANGELOG.md#L3-L55)

## Publishing Pipeline

When a release PR is merged, a git tag is created that triggers the publishing workflow. The pipeline publishes to both npm and the MCP registry.

### GitHub Actions Workflow

The `publish-to-npm-on-tag.yml` workflow handles the entire publishing process:

```
```

### Publishing Steps

The workflow executes these key steps:

1. **Environment Setup**: Node.js environment with npm cache
2. **Dependency Installation**: `npm ci` for clean dependency install
3. **Build Process**: `npm run build` compiles TypeScript and generates documentation
4. **npm Publishing**: Uses OIDC for provenance attestation
5. **MCP Registry**: Uses `mcp-publisher` tool for registry submission

Sources: [.github/workflows/publish-to-npm-on-tag.yml1-77](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/publish-to-npm-on-tag.yml#L1-L77)

## Registry Configuration

The project publishes to two registries with different configuration requirements.

### npm Registry

| Configuration | Value                        |
| ------------- | ---------------------------- |
| Registry URL  | `https://registry.npmjs.org` |
| Package Name  | `chrome-devtools-mcp`        |
| Access Level  | `public`                     |
| Provenance    | Enabled with OIDC            |

### MCP Registry

The MCP registry configuration is defined in `server.json`:

```
```

Sources: [server.json1-24](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/server.json#L1-L24) [.github/workflows/publish-to-npm-on-tag.yml42-77](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/publish-to-npm-on-tag.yml#L42-L77)

## Changelog Generation

The changelog is automatically maintained by release-please based on conventional commits. Each release section includes categorized changes with commit links and issue references.

### Changelog Structure

The `CHANGELOG.md` follows this format:

- **Features**: New functionality (`feat:` commits)
- **Bug Fixes**: Issue resolutions (`fix:` commits)
- **Breaking Changes**: API changes (`BREAKING CHANGE:` commits)

Each entry includes:

- Issue number with GitHub link
- Commit hash with GitHub link
- Descriptive commit message

### Recent Release Example

```
## [0.2.2] (2025-09-23)

### Bug Fixes
* cli version being reported as unknown (#74)
* remove unnecessary waiting for navigation (#83) 
* rework performance parsing & error handling (#75)
```

Sources: [CHANGELOG.md1-55](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/CHANGELOG.md#L1-L55)

## Manual Intervention Points

While the release process is automated, there are specific points where manual intervention may be required:

### Release PR Review

1. **Release PR Creation**: release-please creates a PR with version bump and changelog
2. **Review Process**: Maintainers review the generated changelog and version number
3. **Merge Decision**: Manual merge of the release PR triggers tag creation and publishing

### Emergency Procedures

| Scenario                    | Action Required                                    |
| --------------------------- | -------------------------------------------------- |
| Failed npm publish          | Re-run workflow or manual `npm publish`            |
| Failed MCP registry publish | Re-run MCP publisher or manual registry submission |
| Incorrect version bump      | Manual edit of release PR before merge             |
| Missing changelog entries   | Manual edit of CHANGELOG.md in release PR          |

### Workflow Permissions

The publishing workflow requires specific GitHub permissions:

- `id-token: write` - For OIDC authentication with npm
- `contents: read` - For repository checkout and tag access

Sources: [.github/workflows/publish-to-npm-on-tag.yml8-11](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/publish-to-npm-on-tag.yml#L8-L11) [.github/workflows/publish-to-npm-on-tag.yml38-76](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/1ed7e45f/.github/workflows/publish-to-npm-on-tag.yml#L38-L76)

Dismiss

Refresh this wiki

This wiki was recently refreshed. Please wait 3 days to refresh again.

### On this page

- [Release Process](##release-process)
- [Automated Release Workflow Overview](##automated-release-workflow-overview)
- [Version Management with release-please](##version-management-with-release-please)
- [Release Please Configuration](##release-please-configuration)
- [Conventional Commit Analysis](##conventional-commit-analysis)
- [Publishing Pipeline](##publishing-pipeline)
- [GitHub Actions Workflow](##github-actions-workflow)
- [Publishing Steps](##publishing-steps)
- [Registry Configuration](##registry-configuration)
- [npm Registry](##npm-registry)
- [MCP Registry](##mcp-registry)
- [Changelog Generation](##changelog-generation)
- [Changelog Structure](##changelog-structure)
- [Recent Release Example](##recent-release-example)
- [Manual Intervention Points](##manual-intervention-points)
- [Release PR Review](##release-pr-review)
- [Emergency Procedures](##emergency-procedures)
- [Workflow Permissions](##workflow-permissions)
