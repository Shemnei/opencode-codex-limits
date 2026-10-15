export interface Window {
  label: string
  remaining: number
  resetsAt: number | null
}

export interface Status {
  plan: string | null
  windows: Window[]
  updatedAt: number | null
  error: string | null
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function accountID(access: string, metadata?: Record<string, unknown>): string | undefined {
  if (typeof metadata?.accountId === "string") return metadata.accountId
  try {
    const claims = JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString())
    const id = record(claims["https://api.openai.com/auth"]).chatgpt_account_id
    return typeof id === "string" ? id : undefined
  } catch {
    return undefined
  }
}

export function parseUsage(payload: unknown, now = Date.now()): Status {
  const data = record(payload)
  if (typeof data.plan_type !== "string") throw new Error("Invalid usage response")
  const windows: Window[] = []
  function addWindows(limit: unknown, prefix = "") {
    const details = record(limit)
    for (const key of ["primary_window", "secondary_window"]) {
      const window = record(details[key])
      if (typeof window.used_percent !== "number" || !Number.isFinite(window.used_percent)) continue
      const seconds = window.limit_window_seconds
      const label =
        typeof seconds !== "number" || seconds <= 0
          ? key === "primary_window"
            ? "Primary"
            : "Secondary"
          : seconds === 604800
            ? "Weekly"
            : seconds % 86400 === 0
              ? `${seconds / 86400}d`
              : seconds % 3600 === 0
                ? `${seconds / 3600}h`
                : `${Math.ceil(seconds / 60)}m`
      windows.push({
        label: prefix + label,
        remaining: Math.max(0, Math.min(100, 100 - window.used_percent)),
        resetsAt:
          typeof window.reset_at === "number" && Number.isFinite(window.reset_at) && window.reset_at > 0
            ? window.reset_at * 1000
            : null,
      })
    }
  }
  addWindows(data.rate_limit)
  if (Array.isArray(data.additional_rate_limits)) {
    for (const entry of data.additional_rate_limits) {
      const extra = record(entry)
      if (typeof extra.limit_name === "string") addWindows(extra.rate_limit, `${extra.limit_name} · `)
    }
  }
  return { plan: data.plan_type, windows, updatedAt: now, error: null }
}

export function resetIn(timestamp: number | null, now = Date.now()): string {
  if (timestamp === null) return "reset unknown"
  if (timestamp <= now) return "reset due"
  const minutes = Math.ceil((timestamp - now) / 60_000)
  if (minutes < 60) return `resets in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24
    ? `resets in ${hours}h ${minutes % 60}m`
    : `resets in ${Math.floor(hours / 24)}d ${hours % 24}h`
}

export const emptyStatus = (error: string): Status => ({ plan: null, windows: [], updatedAt: null, error })

// One cache per plugin location, partitioned by active credential. No credentials are persisted.
export function usageReader(request: (url: string, init: RequestInit) => Promise<Response> = fetch) {
  let cache: { key: string; status: Status; attemptedAt: number } | undefined
  let pending: { key: string; promise: Promise<Status> } | undefined
  return async (key: string, access: string, account: string | undefined, force = false): Promise<Status> => {
    if (pending?.key === key) return pending.promise
    if (!force && cache?.key === key && Date.now() - cache.attemptedAt < 60_000) return cache.status
    const promise = (async () => {
      let status: Status
      try {
        const response = await request("https://chatgpt.com/backend-api/wham/usage", {
          headers: {
            Authorization: `Bearer ${access}`,
            ...(account ? { "ChatGPT-Account-Id": account } : {}),
          },
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        })
        if (!response.ok) {
          const error =
            response.status === 401 || response.status === 403
              ? "OpenAI sign-in required"
              : response.status === 429
                ? "Usage requests throttled"
                : `Usage unavailable (HTTP ${response.status})`
          status = emptyStatus(error)
          if (response.status !== 401 && response.status !== 403 && cache?.key === key)
            status = { ...cache.status, error }
        } else status = parseUsage(await response.json())
      } catch {
        status = {
          ...(cache?.key === key ? cache.status : emptyStatus("")),
          error: "Usage unavailable; retrying",
        }
      }
      cache = { key, status, attemptedAt: Date.now() }
      return status
    })()
    pending = { key, promise }
    try {
      return await promise
    } finally {
      if (pending?.promise === promise) pending = undefined
    }
  }
}
