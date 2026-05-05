import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Security headers
  app.use(helmet());

  // Trust proxy — required for correct protocol detection behind load balancer / Vercel / AWS ALB
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Required for Twilio webhook signature validation (must be before JSON body parser)
  app.use(express.urlencoded({ extended: false }));

  // CORS — allow production frontend + Vercel preview deployments + local dev
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
  const allowedOrigins = [frontendUrl, 'http://localhost:3001', 'http://localhost:3000'];
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // Allow exact matches
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow any Vercel preview deployment for this project
      if (/^https:\/\/ryke-[a-z0-9]+-rykeai2026[^.]*\.vercel\.app$/.test(origin))
        return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-key'],
    credentials: true,
  });

  app.setGlobalPrefix('v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`RYKE AI backend running on port ${port}`);
}

bootstrap();
