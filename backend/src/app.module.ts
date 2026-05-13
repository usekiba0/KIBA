import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import * as Joi from 'joi';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { DataModule } from './data/data.module';
import { MessagingModule } from './messaging/messaging.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AiModule } from './ai/ai.module';
import { SafetyModule } from './safety/safety.module';
import { HealthController } from './common/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        // App
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
        BETA_MODE: Joi.string().valid('true', 'false').default('false'),
        PORT: Joi.number().default(3000),
        APP_BASE_URL: Joi.string().uri().required(),
        FRONTEND_URL: Joi.string().uri().required(),
        SESSION_TIMEOUT_HOURS: Joi.number().default(4),

        // Database
        DATABASE_URL: Joi.string().uri().required(),

        // Redis (REDIS_URL takes precedence over REDIS_HOST/REDIS_PORT)
        REDIS_URL: Joi.string().uri().optional(),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),

        // Twilio
        TWILIO_ACCOUNT_SID: Joi.string().required(),
        TWILIO_AUTH_TOKEN: Joi.string().required(),
        TWILIO_PHONE_NUMBER: Joi.string().required(),

        // SendBlue
        SENDBLUE_API_KEY_ID: Joi.string().optional(),
        SENDBLUE_API_SECRET_KEY: Joi.string().optional(),

        // Stripe
        STRIPE_SECRET_KEY: Joi.string().required(),
        STRIPE_WEBHOOK_SECRET: Joi.string().required(),
        STRIPE_PRICE_ID_INDIVIDUAL: Joi.string().required(),
        STRIPE_TRIAL_DAYS: Joi.number().default(30),

        // Anthropic
        ANTHROPIC_API_KEY: Joi.string().required(),
        AI_MODEL: Joi.string().default('claude-haiku-4-5-20251001'),

        // Crisis Detection — REQUIRED for safety
        CRISIS_CONFIDENCE_THRESHOLD: Joi.number().default(0.65),
        CRISIS_COACH_ALERT_EMAIL: Joi.string().email().required(),
        CRISIS_COACH_ALERT_PHONE: Joi.string().required(),

        // Email (for coach alerts)
        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().default(587),
        SMTP_USER: Joi.string().optional(),
        SMTP_PASS: Joi.string().optional(),
        SMTP_FROM: Joi.string().optional(),

        // Internal API key for admin endpoints
        INTERNAL_API_KEY: Joi.string().min(32).required(),
      }),
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.getOrThrow<string>('DATABASE_URL');
        const isCloudDb = !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1');
        return {
          type: 'postgres',
          url: dbUrl,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/data/migrations/*{.ts,.js}'],
          synchronize: false,
          migrationsRun: true,
          logging: config.get('NODE_ENV') === 'development',
          ssl: isCloudDb ? { rejectUnauthorized: false } : false,
          extra: isCloudDb ? { family: 4 } : {},
        };
      },
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        // Required for Upstash (serverless Redis): maxRetriesPerRequest:null prevents
        // ioredis from throwing MaxRetriesPerRequestError when the blocking consumer
        // connection times out, which would silently kill Bull workers.
        const sharedOpts = {
          enableReadyCheck: false,
          maxRetriesPerRequest: null as unknown as number,
          connectTimeout: 10_000,
          retryStrategy: (times: number) => Math.min(times * 200, 5_000),
        };
        if (redisUrl) {
          const parsed = new URL(redisUrl);
          return {
            redis: {
              host: parsed.hostname,
              port: parseInt(parsed.port) || 6379,
              password: parsed.password || undefined,
              username:
                parsed.username && parsed.username !== 'default' ? parsed.username : undefined,
              tls: parsed.protocol === 'rediss:' ? {} : undefined,
              ...sharedOpts,
            },
          };
        }
        return {
          redis: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD'),
            ...sharedOpts,
          },
        };
      },
    }),

    // Rate limiting: 60 requests per minute per IP by default
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 60 },
      { name: 'strict', ttl: 60000, limit: 10 }, // for onboarding endpoints
    ]),

    DataModule,
    MessagingModule,
    OnboardingModule,
    AiModule,
    SafetyModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
