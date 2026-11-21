// How every schema failure is reported, by scripts/check.ts and scripts/corpus.ts alike.
import type { ErrorObject } from 'ajv'

/** Formats one Ajv error the way every schema failure is reported: `<path>: <instancePath or "(root)"> <message>`, plus the offending field name for `additionalProperties`. */
export function formatSchemaError(path: string, error: ErrorObject): string {
  const where = error.instancePath === '' ? '(root)' : error.instancePath
  const extra =
    error.keyword === 'additionalProperties'
      ? ` "${(error.params as { additionalProperty: string }).additionalProperty}"`
      : error.keyword === 'enum'
        ? `: ${(error.params as { allowedValues: string[] }).allowedValues.join(', ')}`
        : ''
  return `${path}: ${where} ${error.message}${extra}`
}
