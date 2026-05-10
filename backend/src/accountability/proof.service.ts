import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proof, ProofType, ProofValidationStatus } from '../data/entities/proof.entity';
import { DailyTask, TaskStatus } from '../data/entities/daily-task.entity';
import { AntiGhostService } from './anti-ghost.service';
import { ScoreService } from './score.service';
import { structuredLog } from '../common/logger';

export interface SubmitProofDto {
  userId: string;
  taskId: string;
  type: ProofType;
  mediaUrl?: string;
  content?: string;
}

@Injectable()
export class ProofService {
  private readonly logger = new Logger(ProofService.name);

  constructor(
    @InjectRepository(Proof) private readonly proofRepo: Repository<Proof>,
    @InjectRepository(DailyTask) private readonly taskRepo: Repository<DailyTask>,
    private readonly antiGhostService: AntiGhostService,
    private readonly scoreService: ScoreService,
  ) {}

  async submitProof(dto: SubmitProofDto): Promise<Proof> {
    const task = await this.taskRepo.findOne({ where: { id: dto.taskId, user_id: dto.userId } });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found for user ${dto.userId}`);

    const proof = await this.proofRepo.save(
      this.proofRepo.create({
        task_id: dto.taskId,
        user_id: dto.userId,
        proof_type: dto.type,
        media_url: dto.mediaUrl ?? null,
        content: dto.content ?? null,
        validation_status: ProofValidationStatus.ACCEPTED,
        validated_at: new Date(),
      }),
    );

    task.status = TaskStatus.COMPLETED;
    task.proof_id = proof.id;
    task.completion_timestamp = new Date();
    await this.taskRepo.save(task);

    await this.antiGhostService.onUserResponse(dto.userId);
    await this.scoreService.updateScore(dto.userId);

    structuredLog(this.logger, 'log', {
      service: 'accountability',
      operation: 'proof_submitted',
      userId: dto.userId,
      taskId: dto.taskId,
      proofType: dto.type,
    });

    return proof;
  }
}
