import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { getDbErrorStatus } from "../utils/dbErrors";
import { getRequestId } from "./requestId";

import { sanitize } from "../utils/security/sanitize";

export function errorHandler(
    err: Error & { statusCode?: number; status?: number; code?: string },
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    let statusCode = err.statusCode || err.status || 500;

    if (err.code) {
        const dbStatus = getDbErrorStatus(err.code);
        if (dbStatus) {
            statusCode = dbStatus;
        }
    }

    const level = statusCode >= 500 ? "error" : "warn";

    const requestId = getRequestId();

    logger.log({
        level,
        message: `${req.method} ${req.originalUrl} - ${err.message}`,
        statusCode,
        stack: err.stack,
        body: req.body ? sanitize(req.body as Record<string, unknown>) : undefined,
        query: req.query,
        params: req.params,
        ...(requestId && { requestId }),
    });

    const isProduction = process.env.NODE_ENV === "production";
    const clientMessage = statusCode >= 500 ? "Internal Server Error" : err.message;

    res.status(statusCode).json({
        success: false,
        error: {
            message: clientMessage,
            ...(!isProduction && { stack: err.stack }),
        },
        ...(requestId && { requestId }),
    });
}
