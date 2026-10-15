import { Plugin } from "@opencode/plugin"
import { CodexLimits } from "./rpc"
import { accountID, emptyStatus, usageReader } from "./usage"

export default Plugin.define({
  id: "codex-limits",
  async setup(ctx) {
    const read = usageReader()
    await ctx.rpc.register(CodexLimits, {
      status: async (input) => {
        try {
          const connection = await ctx.integration.connection.active("openai")
          if (!connection) return emptyStatus("Connect OpenAI with ChatGPT")
          const credential = await ctx.integration.connection.resolve(connection)
          if (credential?.type !== "oauth") return emptyStatus("Requires ChatGPT subscription login")
          const account = accountID(credential.access, credential.metadata)
          const key = JSON.stringify([connection, account])
          return await read(
            key,
            credential.access,
            account,
            (input as { refresh?: boolean }).refresh === true,
          )
        } catch {
          return emptyStatus("OpenAI sign-in unavailable")
        }
      },
    })
  },
})
