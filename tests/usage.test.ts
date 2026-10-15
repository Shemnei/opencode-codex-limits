import { describe, expect, test } from "bun:test"
import { accountID, parseUsage, resetIn, usageReader } from "../usage"

const payload = {
  plan_type: "pro",
  rate_limit: {
    primary_window: { used_percent: 25, limit_window_seconds: 18000, reset_at: 2000000000 },
    secondary_window: { used_percent: 60, limit_window_seconds: 604800, reset_at: 2000001000 },
  },
}

describe("usage parsing", () => {
  test("uses backend windows and converts reset seconds to milliseconds", () => {
    expect(parseUsage(payload, 123)).toEqual({
      plan: "pro",
      updatedAt: 123,
      error: null,
      windows: [
        { label: "5h", remaining: 75, resetsAt: 2000000000000 },
        { label: "Weekly", remaining: 40, resetsAt: 2000001000000 },
      ],
    })
  })
  test("missing team windows are unknown, not unlimited", () => {
    expect(parseUsage({ plan_type: "team" }).windows).toEqual([])
    expect(() => parseUsage({})).toThrow()
  })
  test("clamps percentages, handles additional limits and missing resets", () => {
    const status = parseUsage({
      plan_type: "team",
      additional_rate_limits: [
        {
          limit_name: "Review",
          rate_limit: { primary_window: { used_percent: 120, limit_window_seconds: 86400 } },
        },
      ],
    })
    expect(status.windows).toEqual([{ label: "Review · 1d", remaining: 0, resetsAt: null }])
  })
  test("formats resets without claiming expired snapshots have reset", () => {
    expect(resetIn(null, 0)).toBe("reset unknown")
    expect(resetIn(1, 2)).toBe("reset due")
    expect(resetIn(61 * 60000, 0)).toBe("resets in 1h 1m")
    expect(resetIn(25 * 3600000, 0)).toBe("resets in 1d 1h")
  })
  test("reads account routing without returning tokens", () => {
    const token = `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "workspace" } })).toString("base64url")}.signature`
    expect(accountID(token)).toBe("workspace")
    expect(accountID(token, { accountId: "selected" })).toBe("selected")
    expect(accountID("invalid")).toBeUndefined()
  })
})

describe("usage fetching", () => {
  test("caches, deduplicates requests, and supports forced refresh", async () => {
    let calls = 0
    const read = usageReader(async (url, init) => {
      calls++
      expect(url).toBe("https://chatgpt.com/backend-api/wham/usage")
      expect(init?.headers).toEqual({ Authorization: "Bearer secret", "ChatGPT-Account-Id": "workspace" })
      expect(init?.redirect).toBe("error")
      return Response.json(payload)
    })
    const results = await Promise.all([read("a", "secret", "workspace"), read("a", "secret", "workspace")])
    expect(calls).toBe(1)
    expect(JSON.stringify(results)).not.toContain("secret")
    await read("a", "secret", "workspace")
    expect(calls).toBe(1)
    await read("a", "secret", "workspace", true)
    expect(calls).toBe(2)
  })
  test("preserves stale data only for the same credential; clears on auth failure", async () => {
    let code = 200
    const read = usageReader(async () =>
      code === 200 ? Response.json(payload) : new Response("private response", { status: code }),
    )
    await read("a", "secret", undefined)
    code = 500
    const stale = await read("a", "secret", undefined, true)
    expect(stale.windows).toHaveLength(2)
    expect(stale.error).toContain("500")
    expect((await read("b", "other", undefined)).windows).toEqual([])
    code = 401
    expect((await read("a", "secret", undefined, true)).windows).toEqual([])
  })
  test("network failures and malformed responses never expose raw errors", async () => {
    const fail = usageReader(async () => {
      throw new Error("Bearer secret")
    })
    expect(JSON.stringify(await fail("a", "secret", undefined))).not.toContain("secret")
    const malformed = usageReader(async () => Response.json({ private: "secret" }))
    expect((await malformed("a", "secret", undefined)).error).toBe("Usage unavailable; retrying")
  })
})
