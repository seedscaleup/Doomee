import pino from 'pino'

const level = process.env.LOG_LEVEL ?? 'info'
const isDevelopment = process.env.NODE_ENV === 'development'

/**
 * Structured JSON logs on stdout — collectable by any log pipeline (ADR-021).
 * Never log secrets, tokens, or personal data beyond an actor id.
 */
export const logger = pino({
  level,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'tokenHash'],
    remove: true,
  },
  ...(isDevelopment ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
})
