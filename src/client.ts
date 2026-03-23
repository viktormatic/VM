import { logger } from "./logger.js"
import { SlidingWindowRateLimiter } from "./rate-limiter.js"
import { CircuitBreaker, CircuitBreakerError } from "./circuit-breaker.js"

const BASE_URL = "https://api.unusualwhales.com"
const REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120
const DEFAULT_MAX_RETRIES = 3
const BASE_RETRY_DELAY_MS = 1000

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}

const rateLimitPerMinute = parseInt(
  process.env.UW_RATE_LIMIT_PER_MINUTE || String(DEFAULT_RATE_LIMIT_PER_MINUTE),
  10,
)
const rateLimiter = new SlidingWindowRateLimiter(
  isNaN(rateLimitPerMinute) ? DEFAULT_RATE_LIMIT_PER_MINUTE : rateLimitPerMinute,
)

const maxRetries = parseInt(
  process.env.UW_MAX_RETRIES || String(DEFAULT_MAX_RETRIES),
  10,
)
const configuredMaxRetries = isNaN(maxRetries) ? DEFAULT_MAX_RETRIES : maxRetries

const circuitBreaker = new CircuitBreaker({
  failureThreshold: parseInt(process.env.UW_CIRCUIT_BREAKER_THRESHOLD || "5", 10),
  resetTimeout: parseInt(process.env.UW_CIRCUIT_BREAKER_RESET_TIMEOUT || "30000", 10),
  successThreshold: parseInt(process.env.UW_CIRCUIT_BREAKER_SUCCESS_THRESHOLD || "2", 10),
})

function isRetryableError(status: number | null, error?: Error): boolean {
  if (status === null) return true
  if (status >= 500) return true
  if (error?.name === "AbortError") return true
  return false
}

function getRetryDelay(attempt: number): number {
  return Math.pow(2, attempt) * BASE_RETRY_DELAY_MS
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function encodePath(value: unknown): string {
  if (value === undefined || value === null) throw new Error("Path parameter is required")
  const str = String(value)
  if (str.includes("/") || str.includes("\\") || str.includes("..")) throw new Error("Invalid path parameter")
  return encodeURIComponent(str)
}

export async function uwFetch<T = unknown>(
  endpoint: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
): Promise<ApiResponse<T>> {
  const apiKey = process.env.UW_API_KEY
  if (!apiKey) return { error: "UW_API_KEY environment variable is not set" }

  const rateCheck = rateLimiter.tryAcquire()
  if (!rateCheck.allowed) {
    const waitSeconds = Math.ceil((rateCheck.waitMs || 0) / 1000)
    return { error: `Rate limit exceeded (${rateLimitPerMinute}/min). Try again in ${waitSeconds} seconds.` }
  }

  const url = new URL(endpoint, BASE_URL)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "" || value === false) return
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)))
      } else {
        url.searchParams.append(key, String(value))
      }
    })
  }

  try {
    return await circuitBreaker.execute(async () => {
      let lastError: string | null = null
      for (let attempt = 0; attempt < configuredMaxRetries; attempt++) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        try {
          const response = await fetch(url.toString(), {
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
            signal: controller.signal,
          })
          clearTimeout(timeout)
          if (response.ok) {
            const text = await response.text()
            if (!text) return { data: {} as T }
            try { return { data: JSON.parse(text) as T } }
            catch { return { error: `Invalid JSON response: ${text.slice(0, 100)}` } }
          }
          if (response.status === 429) {
            const retryAfter = response.headers.get("retry-after")
            const waitInfo = retryAfter ? ` Retry after ${retryAfter} seconds.` : ""
            return { error: `API rate limit exceeded (429).${waitInfo} You may be approaching your daily limit.` }
          }
          const errorText = await response.text()
          lastError = `API error (${response.status}): ${errorText}`
          if (response.status >= 400 && response.status < 500) return { error: lastError }
          if (isRetryableError(response.status) && attempt < configuredMaxRetries - 1) {
            const retryDelay = getRetryDelay(attempt)
            logger.warn("Retrying request after server error", { endpoint, status: response.status, attempt: attempt + 1, maxRetries: configuredMaxRetries, delayMs: retryDelay })
            await delay(retryDelay)
            continue
          }
        } catch (error) {
          clearTimeout(timeout)
          const err = error instanceof Error ? error : new Error(String(error))
          lastError = err.name === "AbortError" ? "Request timed out" : `Request failed: ${err.message}`
          if (isRetryableError(null, err) && attempt < configuredMaxRetries - 1) {
            const retryDelay = getRetryDelay(attempt)
            logger.warn("Retrying request after network error", { endpoint, error: err.message, attempt: attempt + 1, maxRetries: configuredMaxRetries, delayMs: retryDelay })
            await delay(retryDelay)
            continue
          }
        }
      }
      return { error: lastError ?? "Max retries exceeded" }
    })
  } catch (error) {
    if (error instanceof CircuitBreakerError) return { error: error.message }
    throw error
  }
}

export function formatResponse<T>(result: ApiResponse<T>): string {
  if (result.error) return JSON.stringify({ error: result.error }, null, 2)
  return JSON.stringify(result.data, null, 2)
}

export function formatStructuredResponse<T>(result: ApiResponse<T>): { text: string; structuredContent?: T } {
  if (result.error) return { text: JSON.stringify({ error: result.error }, null, 2) }
  return { text: JSON.stringify(result.data, null, 2), structuredContent: result.data }
}

export function formatError(message: string): string {
  return JSON.stringify({ error: message })
}
