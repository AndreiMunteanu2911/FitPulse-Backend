import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response } from 'express';

export type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, any>;
};

export type RequestContext = {
  req: Request;
  res: Response;
  cookiesToSet: CookieToSet[];
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  req: Request,
  res: Response,
  callback: () => T,
): T {
  return storage.run({ req, res, cookiesToSet: [] }, callback);
}

export function getRequestContext(): RequestContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error('No request context is active.');
  }

  return context;
}
