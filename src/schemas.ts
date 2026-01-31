/**
 * Zod schemas for MCP tool inputs and outputs.
 * @internal
 */

import { z } from 'zod'

const uri = z.string().describe('The relative file path')

const symbol_name = z.string().describe('The text of the symbol to find')

const line_hint = z
  .number()
  .int()
  .positive()
  .describe('Approximate 1-based line number where the symbol is expected')

const order_hint = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe(
    '0-based index of which occurrence to target if symbol appears multiple times',
  )

export const FuzzyPositionSchema = z.object({
  uri,
  symbol_name,
  line_hint,
  order_hint,
})

export const ApplyEditSchema = z.object({
  uri,
  search_text: z
    .string()
    .describe('Exact text to replace (must exist uniquely in the file)'),
  replace_text: z.string().describe('New text to insert'),
  description: z.string().describe('Rationale for the edit'),
})

export const CallHierarchySchema = z.object({
  uri: z.string().describe('The file URI or path'),
  symbol_name,
  line_hint,
  order_hint,
  direction: z
    .enum(['incoming', 'outgoing'])
    .describe('Direction of the call hierarchy'),
})

const query = z.string().describe('The search query')

const case_sensitive = z
  .boolean()
  .default(false)
  .describe('Whether the search is case-sensitive')

const exact_match = z
  .boolean()
  .default(false)
  .describe('Whether to match exact words only')

const regex_mode = z
  .boolean()
  .default(false)
  .describe('Whether the query is a regular expression')

export const GlobalFindSchema = z.object({
  query,
  case_sensitive,
  exact_match,
  regex_mode,
})

export const GlobalReplaceSchema = z.object({
  query,
  case_sensitive,
  exact_match,
  regex_mode,
  replace_with: z.string().describe('The replacement text'),
})

export const AddLinkSchema = z.object({
  path: z.string().describe('The path to the document to modify'),
  pattern: z
    .string()
    .describe('The text pattern to find and replace with a link'),
  link_to: z.string().describe('The target URI the link should point to'),
})
