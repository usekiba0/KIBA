import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1745000000000 implements MigrationInterface {
  name = 'InitialSchema1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(`CREATE TYPE "coaching_focus_enum" AS ENUM('fitness','nutrition','wellness','combined')`);
    await queryRunner.query(`CREATE TYPE "user_status_enum" AS ENUM('trial','active','paused','cancelled')`);
    await queryRunner.query(`CREATE TYPE "subscription_plan_enum" AS ENUM('individual','coach_pro','coach_elite')`);
    await queryRunner.query(`CREATE TYPE "subscription_status_enum" AS ENUM('trialing','active','past_due','cancelled')`);
    await queryRunner.query(`CREATE TYPE "session_status_enum" AS ENUM('active','completed','crisis_hold')`);
    await queryRunner.query(`CREATE TYPE "message_role_enum" AS ENUM('user','ai')`);
    await queryRunner.query(`CREATE TYPE "message_type_enum" AS ENUM('text','mms')`);
    await queryRunner.query(`CREATE TYPE "detection_method_enum" AS ENUM('keyword','ml_classifier','hybrid')`);
    await queryRunner.query(`CREATE TYPE "alert_channel_enum" AS ENUM('sms','email')`);
    await queryRunner.query(`CREATE TYPE "alert_status_enum" AS ENUM('open','acknowledged','resolved')`);
    await queryRunner.query(`CREATE TYPE "summary_trigger_enum" AS ENUM('session_expiry','message_count','token_budget')`);

    // Users
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "phone_number" varchar(20) NOT NULL,
        "name" varchar(100) NOT NULL,
        "coaching_focus" "coaching_focus_enum" NOT NULL,
        "goals" text NOT NULL,
        "height_cm" smallint,
        "weight_kg" decimal(5,2),
        "age" smallint,
        "health_conditions" text[] NOT NULL DEFAULT '{}',
        "dietary_restrictions" text[] NOT NULL DEFAULT '{}',
        "injuries" text,
        "status" "user_status_enum" NOT NULL DEFAULT 'trial',
        "crisis_hold" boolean NOT NULL DEFAULT false,
        "registered_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_active_at" TIMESTAMPTZ,
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone_number")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_status" ON "users" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_last_active" ON "users" ("last_active_at")`);

    // Subscriptions
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "stripe_customer_id" varchar(50) NOT NULL,
        "stripe_subscription_id" varchar(50) NOT NULL,
        "plan" "subscription_plan_enum" NOT NULL,
        "status" "subscription_status_enum" NOT NULL DEFAULT 'trialing',
        "trial_start" TIMESTAMPTZ NOT NULL,
        "trial_end" TIMESTAMPTZ NOT NULL,
        "current_period_end" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscriptions_user" UNIQUE ("user_id"),
        CONSTRAINT "UQ_subscriptions_stripe_customer" UNIQUE ("stripe_customer_id"),
        CONSTRAINT "UQ_subscriptions_stripe_sub" UNIQUE ("stripe_subscription_id")
      )
    `);

    // Conversation Sessions
    await queryRunner.query(`
      CREATE TABLE "conversation_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "status" "session_status_enum" NOT NULL DEFAULT 'active',
        "message_count" integer NOT NULL DEFAULT 0,
        "summary_generated" boolean NOT NULL DEFAULT false,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_message_at" TIMESTAMPTZ,
        "ended_at" TIMESTAMPTZ,
        CONSTRAINT "PK_conversation_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_user" ON "conversation_sessions" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_status" ON "conversation_sessions" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_sessions_last_message" ON "conversation_sessions" ("last_message_at")`);

    // Messages
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" "message_role_enum" NOT NULL,
        "message_type" "message_type_enum" NOT NULL DEFAULT 'text',
        "content" text NOT NULL,
        "media_url" text,
        "media_content_type" varchar(50),
        "twilio_sid" varchar(50),
        "token_count" integer,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_messages_twilio_sid" UNIQUE ("twilio_sid")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_messages_session" ON "messages" ("session_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_messages_user_created" ON "messages" ("user_id", "created_at")`);

    // Nutritional Analyses
    await queryRunner.query(`
      CREATE TABLE "nutritional_analyses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "message_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "detected_foods" text[] NOT NULL DEFAULT '{}',
        "total_calories" smallint,
        "protein_grams" smallint,
        "carbs_grams" smallint,
        "fat_grams" smallint,
        "health_flags" text[] NOT NULL DEFAULT '{}',
        "recommendation" text,
        "confidence_score" decimal(4,3),
        "food_identified" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_nutritional_analyses" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_nutritional_analyses_message" UNIQUE ("message_id")
      )
    `);

    // Crisis Alerts
    await queryRunner.query(`
      CREATE TABLE "crisis_alerts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "triggering_message_id" uuid NOT NULL,
        "detection_method" "detection_method_enum" NOT NULL,
        "confidence_score" decimal(4,3),
        "holding_message_sent" boolean NOT NULL DEFAULT false,
        "holding_message_sent_at" TIMESTAMPTZ,
        "coach_alerted" boolean NOT NULL DEFAULT false,
        "coach_alerted_at" TIMESTAMPTZ,
        "coach_alert_channel" "alert_channel_enum",
        "status" "alert_status_enum" NOT NULL DEFAULT 'open',
        "resolved_by" varchar(100),
        "resolved_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_crisis_alerts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_crisis_alerts_user" ON "crisis_alerts" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_crisis_alerts_status" ON "crisis_alerts" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_crisis_alerts_created" ON "crisis_alerts" ("created_at")`);

    // Session Summaries
    await queryRunner.query(`
      CREATE TABLE "session_summaries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "summary" text NOT NULL,
        "message_count_summarised" integer NOT NULL,
        "trigger" "summary_trigger_enum" NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_session_summaries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_session_summaries_user" ON "session_summaries" ("user_id")`);

    // Processed Stripe Events (idempotency)
    await queryRunner.query(`
      CREATE TABLE "processed_stripe_events" (
        "stripe_event_id" varchar(50) NOT NULL,
        "event_type" varchar(100) NOT NULL,
        "processed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_processed_stripe_events" PRIMARY KEY ("stripe_event_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "processed_stripe_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "session_summaries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crisis_alerts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "nutritional_analyses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "summary_trigger_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "alert_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "alert_channel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "detection_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "message_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "message_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "session_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_plan_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "coaching_focus_enum"`);
  }
}
