import { Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import type { Request, Response as ExpressResponse } from 'express';
import { runWithRequestContext } from './compat/request-context';
import { NextRequest } from './compat/next-server';
import { routeManifest, type RouteManifestEntry } from './route-manifest';

type RouteModule = Record<string, unknown>;
const MAX_REQUEST_BODY_BYTES = 15 * 1024 * 1024;

@Injectable()
export class ApiRouterService {
  private readonly routes = routeManifest;

  async handle(req: Request, res: ExpressResponse): Promise<void> {
    await runWithRequestContext(req, res, async () => {
      const requestPath = `/api${req.path === '/' ? '' : req.path}`;
      const match = this.matchRoute(requestPath);

      if (!match) {
        throw new NotFoundException('Endpoint not found.');
      }

      const mod = (await match.entry.load()) as RouteModule;
      const handler = mod[req.method.toUpperCase()];

      if (typeof handler !== 'function') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const request = await this.toNextRequest(req);
      const response = (await handler(request, {
        params: Promise.resolve(match.params),
      })) as globalThis.Response;

      await this.writeResponse(res, response);
    });
  }

  private matchRoute(pathname: string): { entry: RouteManifestEntry; params: Record<string, string> } | null {
    const pathSegments = pathname.split('/').filter(Boolean);

    for (const entry of this.routes) {
      if (entry.segments.length !== pathSegments.length) continue;

      const params: Record<string, string> = {};
      let matched = true;

      for (let index = 0; index < entry.segments.length; index += 1) {
        const routeSegment = entry.segments[index];
        const pathSegment = decodeURIComponent(pathSegments[index]);

        if (routeSegment.startsWith('[') && routeSegment.endsWith(']')) {
          params[routeSegment.slice(1, -1)] = pathSegment;
          continue;
        }

        if (routeSegment !== pathSegment) {
          matched = false;
          break;
        }
      }

      if (matched) return { entry, params };
    }

    return null;
  }

  private async toNextRequest(req: Request): Promise<NextRequest> {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const url = `${protocol}://${host}${req.originalUrl}`;
    const method = req.method.toUpperCase();
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        value.forEach((item) => headers.append(key, item));
      } else if (typeof value === 'string') {
        headers.set(key, value);
      }
    }

    const body = ['GET', 'HEAD'].includes(method)
      ? undefined
      : await this.readBody(req);

    return new NextRequest(url, {
      method,
      headers,
      body,
      duplex: body ? 'half' : undefined,
    } as RequestInit & { duplex?: 'half' });
  }

  private readBody(req: Request): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      req.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_REQUEST_BODY_BYTES) {
          reject(new PayloadTooLargeException('Request body exceeds the 15 MB limit.'));
          req.pause();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  private async writeResponse(res: ExpressResponse, response: globalThis.Response): Promise<void> {
    res.status(response.status);

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const context = await import('./compat/request-context').then((mod) => mod.getRequestContext());
    for (const cookie of context.cookiesToSet) {
      res.cookie(cookie.name, cookie.value, cookie.options ?? {});
    }

    if (!response.body) {
      res.end();
      return;
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  }
}
