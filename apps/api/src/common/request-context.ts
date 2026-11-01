// Request id + access log. The id comes from the caller's X-Request-Id (e.g. nginx) when it looks safe,
// otherwise a new UUID; it is echoed in the response header, error bodies and every log line of the request.
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & { id?: string };

const SAFE_ID = /^[\w.-]{8,128}$/;
const logger = new Logger('HTTP');

export function requestContext(req: RequestWithId, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms [${req.id}]`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else logger.log(line);
  });
  next();
}
