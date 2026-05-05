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

export class SetupIntentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone_number must be E.164 format e.g. +12125551234' })
  phone_number: string;
}

export class OnboardingFormDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone_number must be E.164 format e.g. +12125551234' })
  phone_number: string;

  @IsEnum(CoachingFocus)
  coaching_focus: CoachingFocus;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1000)
  goals: string;

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

  @IsString()
  @IsNotEmpty()
  stripe_payment_method_id: string;

  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;
}
