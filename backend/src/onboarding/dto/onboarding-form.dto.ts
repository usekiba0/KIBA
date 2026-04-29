import {
  IsString, IsNotEmpty, IsEnum, IsOptional, IsArray,
  IsNumberString, IsPhoneNumber, MinLength, MaxLength, IsNumber, Min, Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CoachingFocus } from '../../data/entities/user.entity';
import { SubscriptionPlan } from '../../data/entities/subscription.entity';

export class SetupIntentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsPhoneNumber()
  phone_number: string;
}

export class OnboardingFormDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsPhoneNumber()
  phone_number: string;

  @IsEnum(CoachingFocus)
  coaching_focus: CoachingFocus;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
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
  health_conditions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietary_restrictions?: string[];

  @IsOptional()
  @IsString()
  injuries?: string;

  @IsString()
  @IsNotEmpty()
  stripe_payment_method_id: string;

  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;
}
