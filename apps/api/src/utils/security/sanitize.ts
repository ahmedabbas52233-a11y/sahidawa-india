export const SENSITIVE_FIELDS = [
    "password",
    "apiKey",
    "api_key",
    "token",
    "secret",
    "authorization",
    "cookie",
];

/**
 * Recursively redacts sensitive fields from an object before it is logged
 * or sent to an external service (e.g. Sentry). Used by both the request
 * error handler and Sentry's beforeSend hook so redaction stays consistent
 * across every place we might leak request data.
 */
export function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field))) {
            sanitized[key] = "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
            sanitized[key] = sanitize(value as Record<string, unknown>);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
