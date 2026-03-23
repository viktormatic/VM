import { z } from "zod"

export const seasonalityOrderBySchema = z.enum([
  "month", "positive_closes", "years", "positive_months_perc",
  "median_change", "avg_change", "max_change", "min_change",
]).describe("Column to order seasonality results by")

export const minYearsSchema = z.number().int().min(1).describe("Minimum years of data required").default(10)

export const sP500NasdaqOnlySchema = z.boolean().describe("Only return tickers in S&P 500 or Nasdaq 100").default(false)

export const seasonalityLimitSchema = z.number().int("Limit must be an integer").min(1).describe("Maximum number of results").default(50)

export const seasonalityOrderDirectionSchema = z.enum(["asc", "desc"]).describe("Order direction").default("desc")
