/**
 * Path parameter builder with validation and encoding
 *
 * Provides a fluent API for building URL paths with validated and encoded parameters
 *
 * @example
 * ```typescript
 * const path = new PathParamBuilder()
 *   .add('ticker', ticker)
 *   .add('expiry', expiry)
 *   .build('/api/stock/{ticker}/greek-flow/{expiry}')
 * // Result: "/api/stock/AAPL/greek-flow/2024-01-19"
 * ```
 */
export class PathParamBuilder {
  private params: Map<string, string> = new Map()

  add(name: string, value: unknown, required: boolean = true): this {
    if (value === undefined || value === null) {
      if (required) {
        throw new Error(`${name} is required`)
      }
      return this
    }
    const str = String(value)
    if (str.includes("/") || str.includes("\\") || str.includes("..")) {
      throw new Error(`Invalid ${name}: contains path characters`)
    }
    if (str.length === 0) {
      throw new Error(`${name} cannot be empty`)
    }
    this.params.set(name, encodeURIComponent(str))
    return this
  }

  build(template: string): string {
    let path = template
    const placeholderRegex = /\{([^}]+)\}/g
    const matches = template.match(placeholderRegex)
    if (matches) {
      for (const match of matches) {
        const paramName = match.slice(1, -1)
        const value = this.params.get(paramName)
        if (value === undefined) {
          throw new Error(`Missing required parameter: ${paramName}`)
        }
        path = path.replace(match, value)
      }
    }
    return path
  }

  clear(): this {
    this.params.clear()
    return this
  }
}

export function encodePath(value: unknown): string {
  if (value === undefined || value === null) {
    throw new Error("Path parameter is required")
  }
  const str = String(value)
  if (str.includes("/") || str.includes("\\") || str.includes("..")) {
    throw new Error("Invalid path parameter")
  }
  return encodeURIComponent(str)
}
