import type { ApiResponse } from "../../client.js"

export interface ToolResponse {
  text: string
  structuredContent?: unknown
}

export function formatToolResponse(result: ApiResponse): ToolResponse {
  if (result.error) {
    return {
      text: JSON.stringify({ error: result.error }, null, 2),
    }
  }
  return {
    text: JSON.stringify(result.data, null, 2),
    structuredContent: result.data,
  }
}

export function formatToolError(message: string): ToolResponse {
  return {
    text: JSON.stringify({ error: message }, null, 2),
  }
}
