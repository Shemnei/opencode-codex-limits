import { Plugin } from "@opencode/plugin/tui"
import { For, Show, createSignal } from "solid-js"
import { CodexLimits } from "./rpc"
import { emptyStatus, resetIn, type Status } from "./usage"

export default Plugin.define({
  id: "codex-limits.tui",
  setup(ctx) {
    const rpc = ctx.client.rpc(CodexLimits)
    const [status, setStatus] = createSignal<Status>(emptyStatus("Loading usage…"))
    const [now, setNow] = createSignal(Date.now())
    const controller = new AbortController()
    let loading = false
    async function refresh(force = false) {
      if (loading) return
      loading = true
      try {
        const result = await rpc.status(
          { refresh: force },
          {
            location: ctx.location ?? ctx.data.location.default(),
            signal: controller.signal,
          },
        )
        if (!controller.signal.aborted) setStatus(result as Status)
      } catch {
        if (!controller.signal.aborted) setStatus((old) => ({ ...old, error: "Usage unavailable; retrying" }))
      } finally {
        loading = false
      }
    }
    void refresh()
    const timer = setInterval(() => {
      setNow(Date.now())
      void refresh()
    }, 60_000)
    const disposeCommands = ctx.ui.slot({
      append: "app",
      render: () => {
        ctx.keymap.layer(() => ({
          commands: [
            {
              id: "codex-limits.refresh",
              title: "Show Codex limits",
              group: "OpenAI",
              palette: true,
              slash: { name: "codex-limits" },
              run: async () => {
                await refresh(true)
                const current = status()
                await ctx.ui.dialog.alert({
                  title: `Codex limits${current.plan ? ` · ${current.plan}` : ""}`,
                  message: [
                    ...current.windows.map(
                      (window) =>
                        `${window.label}: ${Math.round(window.remaining)}% left\n  Reset: ${window.resetsAt ? new Date(window.resetsAt).toLocaleString() : "unknown"}`,
                    ),
                    current.error,
                    current.updatedAt ? `Updated: ${new Date(current.updatedAt).toLocaleString()}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n"),
                })
              },
            },
          ],
        }))
        return null
      },
    })
    const dispose = ctx.ui.slot({
      append: "sidebar.content",
      render: () => (
        <box flexDirection="column" gap={0} marginTop={1}>
          <text fg={ctx.theme.text.base}>
            <b>Codex{status().plan ? ` · ${status().plan}` : ""}</b>
          </text>
          <For each={status().windows}>
            {(window) => (
              <box flexDirection="column">
                <text fg={ctx.theme.text.base}>
                  {window.label}: {Math.round(window.remaining)}% left
                </text>
                <text fg={ctx.theme.text.muted}>{resetIn(window.resetsAt, now())}</text>
              </box>
            )}
          </For>
          <Show when={!status().error && status().windows.length === 0}>
            <text fg={ctx.theme.text.muted}>No usage windows reported</text>
          </Show>
          <Show when={status().error}>
            <text fg={ctx.theme.text.muted}>
              {status().updatedAt ? "Stale · " : ""}
              {status().error}
            </text>
          </Show>
        </box>
      ),
    })
    return () => {
      clearInterval(timer)
      controller.abort()
      dispose()
      disposeCommands()
    }
  },
})
