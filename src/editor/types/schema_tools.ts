import { ParseResult, Schema } from 'effect'

export function decodeUnknownSync<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  value: unknown
): Schema.Schema.Type<S> {
  return Schema.decodeUnknownSync(schema)(value)
}

export function decodeUnknownEither<S extends Schema.Schema.AnyNoContext>(
  schema: S,
  value: unknown
): { ok: true; value: Schema.Schema.Type<S> } | { ok: false; error: string } {
  const decoded = Schema.decodeUnknownEither(schema)(value)
  if (decoded._tag === 'Right') {
    return { ok: true, value: decoded.right }
  }

  return {
    ok: false,
    error: ParseResult.TreeFormatter.formatErrorSync(decoded.left),
  }
}
