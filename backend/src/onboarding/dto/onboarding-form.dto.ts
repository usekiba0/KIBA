import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  Matches,
  MinLength,
  MaxLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CoachingFocus } from '../../data/entities/user.entity';
import { SubscriptionPlan } from '../../data/entities/subscription.entity';
import { PressurePreference } from '../../data/entities/psychological-profile.entity';

export class SetupIntentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone_number must be E.164 format e.g. +12125551234' })
  phone_number: string;
}

export class OnboardingFormDto {
  // ── Identity ──────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone_number must be E.164 format e.g. +12125551234' })
  phone_number: string;

  // ── Goal ──────────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  goal_description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  goal_timeline: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  current_status: string;

  // ── Psychological intake ──────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  fears: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  avoidance_patterns: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  comparison_figure: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  public_failure_scenario: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  typical_failure_moment: string;

  @IsEnum(PressurePreference)
  pressure_preference: PressurePreference;

  // ── Check-in preference ───────────────────────────────────────────────────
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'checkin_time must be HH:MM format e.g. 08:00' })
  checkin_time: string;

  // ── Legacy fitness fields (optional, kept for backwards compat) ───────────
  @IsOptional()
  @IsEnum(CoachingFocus)
  coaching_focus?: CoachingFocus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  goals?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(280)
  height_cm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(500)
  weight_kg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(13)
  @Max(120)
  age?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  health_conditions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  dietary_restrictions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  injuries?: string;

  // ── Payment ───────────────────────────────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  stripe_payment_method_id: string;

  @IsOptional()
  @IsString()
  stripe_customer_id?: string;

  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;
}
