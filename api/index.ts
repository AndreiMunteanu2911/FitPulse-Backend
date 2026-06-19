import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { ApiRouterService } from '../src/api-router.service';
import { getAllowedOrigins } from '../src/config/runtime';

const server = express();
let bootstrapped = false;

async function bootstrap() {
  if (bootstrapped) return server;

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  const apiRouter = app.get(ApiRouterService);
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await apiRouter.handle(req, res);
    } catch (error) {
      console.error('[api] request failed', {
        method: req.method,
        path: req.originalUrl,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      next(error);
    }
  });

  await app.init();
  bootstrapped = true;
  return server;
}

export default async function handler(req: Request, res: Response) {
  const readyServer = await bootstrap();
  return readyServer(req, res);
}
