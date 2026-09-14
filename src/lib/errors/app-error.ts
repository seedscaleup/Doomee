/**
 * Every user-facing failure carries an i18n key, never a raw English string
 * (CLAUDE.md rule 6). `params` feeds ICU interpolation in the catalogue.
 */
export type AppErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'rate_limited'
  | 'internal'

const HTTP_STATUS: Record<AppErrorCode, number> = {
  unauthenticated: 401,
  // A client hitting an internal URL gets 404, never 403 — do not confirm existence.
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly messageKey: string
  readonly params: Record<string, string | number>
  readonly status: number

  constructor(
    code: AppErrorCode,
    messageKey: string,
    params: Record<string, string | number> = {},
  ) {
    super(`${code}: ${messageKey}`)
    this.name = 'AppError'
    this.code = code
    this.messageKey = messageKey
    this.params = params
    this.status = HTTP_STATUS[code]
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
