import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { ApiRouterService } from '../src/api-router.service';

const server = express();
let bootstrapped = false;

async function bootstrap() {
  if (bootstrapped) return server;

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? true,
    credentials: true,
  });

  const apiRouter = app.get(ApiRouterService);
  app.use('/api', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await apiRouter.handle(req, res);
    } catch (error) {
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
