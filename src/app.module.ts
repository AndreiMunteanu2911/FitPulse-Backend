import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ApiRouterService } from './api-router.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, ApiRouterService],
})
export class AppModule {}
