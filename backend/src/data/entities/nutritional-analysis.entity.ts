import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('nutritional_analyses')
export class NutritionalAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  message_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'text', array: true, default: '{}' })
  detected_foods: string[];

  @Column({ type: 'smallint', nullable: true })
  total_calories: number | null;

  @Column({ type: 'smallint', nullable: true })
  protein_grams: number | null;

  @Column({ type: 'smallint', nullable: true })
  carbs_grams: number | null;

  @Column({ type: 'smallint', nullable: true })
  fat_grams: number | null;

  @Column({ type: 'text', array: true, default: '{}' })
  health_flags: string[];

  @Column({ type: 'text', nullable: true })
  recommendation: string | null;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true })
  confidence_score: number | null;

  @Column({ type: 'boolean', default: true })
  food_identified: boolean;

  @CreateDateColumn()
  created_at: Date;
}
