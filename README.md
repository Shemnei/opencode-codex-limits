# opencode-codex-limits

OpenCode V2 server/TUI plugin. Shows the active OpenAI ChatGPT subscription's
reported usage windows, remaining percentages, and reset countdowns in the sidebar.
`/codex-limits` refreshes usage and shows exact local reset times.

Requires OpenCode 2.0.18 or later and an OpenAI ChatGPT OAuth connection.
No API key, additional sign-in, or configuration is needed. OpenCode owns token refresh.

## Install

Clone into the global plugin discovery directory and install dependencies with Bun:

```sh
git clone https://github.com/Shemnei/opencode-codex-limits.git ~/.config/opencode/plugins/opencode-codex-limits
cd ~/.config/opencode/plugins/opencode-codex-limits
bun install --frozen-lockfile
```

OpenCode automatically discovers the server and terminal plugin. Reopen OpenCode
if the sidebar does not update. On systems using `XDG_CONFIG_HOME`, use
`$XDG_CONFIG_HOME/opencode/plugins/opencode-codex-limits` instead.
Do not also configure the same plugin in `cli.json` or `opencode.jsonc`.

Alternatively, install from GitHub using OpenCode's package manager:

```sh
opencode plugin add github:Shemnei/opencode-codex-limits
```

The package is not published to npm.

## Usage and privacy

The UI polls once a minute; the server deduplicates and caches requests for one minute.
Credentials remain server-side and are never persisted by this plugin or included in RPC responses.
Requests go only to `https://chatgpt.com/backend-api/wham/usage`, without redirects.
There are no model calls, browser scraping, or paid requests. This backend interface
is also used by Codex but is not a guaranteed-stable public API.

Team/Business results describe the selected account/workspace, not necessarily an
organization-wide allowance. Missing windows are shown as unavailable, never unlimited.
Temporary errors mark previous data stale; authentication failures clear previous usage.
Reset countdowns do not assume usage has reset until a successful refresh confirms it.

## Development

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
```

Tests use synthetic data and mocked requests; they need no credentials or network access.
The plugin SDK is pinned to OpenCode 2.0.18; newer OpenCode versions have not been verified.

## License

MIT. This is an independent plugin, not affiliated with OpenAI or OpenCode.
