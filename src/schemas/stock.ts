import { z } from "zod"

export const filterSchema = z.enum(["NetPremium", "Volume", "Trades"]).describe("Filter type for intraday flow").default("NetPremium")
