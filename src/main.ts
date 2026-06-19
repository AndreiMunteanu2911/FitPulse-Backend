import { NestFactory } from '@nestjs/core';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { ApiRouterService } from './api-router.service';
import { getAllowedOrigins } from './config/runtime';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
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
      next(error);
    }
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
