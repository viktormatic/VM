import { z } from "zod"

export function toJsonSchema<T extends z.core.$ZodType>(schema: T): {
  type: "object"
  properties: Record<string, unknown>
  required: string[]
} {
  const jsonSchema = z.toJSONSchema(schema)
  const { $schema: _, ...rest } = jsonSchema as Record<string, unknown>
  return rest as { type: "object"; properties: Record<string, unknown>; required: string[] }
}

export function formatZodError<T>(error: z.ZodError<T>): string {
  return error.issues.map((issue) => issue.message).join(", ")
}

export { dateRegex, tickerSchema, dateSchema, expirySchema, limitSchema, optionTypeSchema, sideSchema, orderDirectionSchema, pageSchema, candleSizeSchema, timeframeSchema, timespanSchema, deltaSchema } from "./common.js"
export { flowGroupSchema, flowOutputSchema } from "./flow.js"
export { filterSchema } from "./stock.js"
export { stockScreenerOrderBySchema, optionContractScreenerOrderBySchema } from "./screener.js"
export { seasonalityOrderBySchema, minYearsSchema, sP500NasdaqOnlySchema, seasonalityLimitSchema, seasonalityOrderDirectionSchema } from "./seasonality.js"
export { institutionalActivityOrderBySchema, institutionalHoldingsOrderBySchema, institutionalListOrderBySchema, institutionalOwnershipOrderBySchema, latestInstitutionalFilingsOrderBySchema } from "./institutions.js"
