import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';
import helmet from 'helmet';
import { setGlobalDispatcher, Agent as UndiciAgent } from 'undici';

// Render's network stack drops idle keep-alive connections mid-request.
// Disable keep-alive globally for all fetch-based HTTP clients (Anthropic SDK, etc.)
setGlobalDispatcher(new UndiciAgent({ connect: { keepAlive: false, timeout: 30_000 } }));

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
      if (/^https:\/\/kiba-[a-z0-9]+[^.]*\.vercel\.app$/.test(origin))
        return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-key'],
    credentials: true,
  });

  app.setGlobalPrefix('v1');

  // Render and external uptime probes hit `/` — return 200 instead of 404 noise.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (_req: express.Request, res: express.Response) => res.status(200).send('ok'));
  expressApp.head('/', (_req: express.Request, res: express.Response) => res.status(200).end());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Kiba AI backend running on port ${port}`);
}

bootstrap();
