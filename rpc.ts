import { Rpc } from "@opencode/plugin/rpc"

export const CodexLimits = Rpc.define({
  id: "codex-limits",
  events: {},
  methods: {
    status: {
      input: {
        type: "object",
        properties: { refresh: { type: "boolean" } },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          plan: { type: ["string", "null"] },
          updatedAt: { type: ["number", "null"] },
          error: { type: ["string", "null"] },
          windows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                remaining: { type: "number" },
                resetsAt: { type: ["number", "null"] },
              },
              required: ["label", "remaining", "resetsAt"],
              additionalProperties: false,
            },
          },
        },
        required: ["plan", "updatedAt", "error", "windows"],
        additionalProperties: false,
      },
    },
  },
})
