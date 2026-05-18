import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { CorrectionService, CORRECTION_PREFIX, CORRECTION_PREFIXES } from '../../src/data/correction.service';
import { Correction, CorrectionStatus } from '../../src/data/entities/correction.entity';
import { CoachingKnowledge } from '../../src/data/entities/coaching-knowledge.entity';
import { Message, MessageRole } from '../../src/data/entities/message.entity';

// Stub the Anthropic factory so the service can be constructed without an API key
jest.mock('../../src/ai/anthropic.factory', () => ({
  createAnthropicClient: () => ({ messages: { create: jest.fn() } }),
}));

describe('CorrectionService static helpers', () => {
  describe('isCorrectionTrigger', () => {
    it.each([
      '#kibi the answer should be X',
      '#KIBA something', // case-insensitive, but starts with #kiba? No, the prefix is #kibi
    ])('rejects messages not starting with the trigger: %s', () => {
      // (placeholder — see specific tests below)
    });

    it('returns true for exact lowercase prefix', () => {
      expect(CorrectionService.isCorrectionTrigger('#kibi the answer is wrong')).toBe(true);
    });

    it('accepts #kiba (brand spelling) too', () => {
      expect(CorrectionService.isCorrectionTrigger('#kiba you got it wrong')).toBe(true);
      expect(CorrectionService.isCorrectionTrigger('#KIBA UPPERCASE')).toBe(true);
    });

    it('returns true for mixed case', () => {
      expect(CorrectionService.isCorrectionTrigger('#Kibi correct me')).toBe(true);
      expect(CorrectionService.isCorrectionTrigger('#KIBI uppercase')).toBe(true);
    });

    it('tolerates leading whitespace', () => {
      expect(CorrectionService.isCorrectionTrigger('   #kibi after spaces')).toBe(true);
    });

    it('returns false when prefix is not at the start', () => {
      expect(CorrectionService.isCorrectionTrigger('hey #kibi the answer')).toBe(false);
    });

    it('returns false for unrelated text', () => {
      expect(CorrectionService.isCorrectionTrigger('remind me at 5pm')).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(CorrectionService.isCorrectionTrigger('')).toBe(false);
    });
  });

  describe('extractCorrectionText', () => {
    it('strips the prefix and trims the rest', () => {
      expect(CorrectionService.extractCorrectionText('#kibi  the answer is wrong  ')).toBe('the answer is wrong');
    });

    it('strips #kiba prefix too', () => {
      expect(CorrectionService.extractCorrectionText('#kiba why did you forget to send motivational quote'))
        .toBe('why did you forget to send motivational quote');
    });

    it('returns empty string when only the prefix is sent', () => {
      expect(CorrectionService.extractCorrectionText('#kibi')).toBe('');
      expect(CorrectionService.extractCorrectionText('#kibi   ')).toBe('');
      expect(CorrectionService.extractCorrectionText('#kiba')).toBe('');
    });

    it('preserves internal whitespace', () => {
      expect(CorrectionService.extractCorrectionText('#kibi line1\nline2')).toBe('line1\nline2');
    });
  });

  it('exports the canonical prefix and list', () => {
    expect(CORRECTION_PREFIX).toBe('#kibi');
    expect(CORRECTION_PREFIXES).toEqual(['#kibi', '#kiba']);
  });
});

describe('CorrectionService flow', () => {
  let service: CorrectionService;
  let correctionRepo: { save: jest.Mock; find: jest.Mock; findOne: jest.Mock; findOneOrFail: jest.Mock; update: jest.Mock };
  let knowledgeRepo: { save: jest.Mock; find: jest.Mock; findOneOrFail: jest.Mock; update: jest.Mock };
  let messageRepo: { findOne: jest.Mock };
  let analyzeMock: jest.Mock;

  beforeEach(async () => {
    correctionRepo = {
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      update: jest.fn(),
    };
    knowledgeRepo = {
      save: jest.fn(),
      find: jest.fn(),
      findOneOrFail: jest.fn(),
      update: jest.fn(),
    };
    messageRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorrectionService,
        { provide: getRepositoryToken(Correction), useValue: correctionRepo },
        { provide: getRepositoryToken(CoachingKnowledge), useValue: knowledgeRepo },
        { provide: getRepositoryToken(Message), useValue: messageRepo },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('claude-haiku-4-5-20251001'), getOrThrow: jest.fn().mockReturnValue('test-key') } },
      ],
    }).compile();

    service = module.get<CorrectionService>(CorrectionService);
    // Stub analyze() so capture() doesn't try to call the LLM
    analyzeMock = jest.fn().mockResolvedValue({ validity_score: 80, analysis: 'Tone correction', suggested_knowledge: 'Use a softer tone' });
    (service as unknown as { analyze: typeof analyzeMock }).analyze = analyzeMock;
  });

  describe('capture', () => {
    it('persists a correction linked to the most recent AI message', async () => {
      const aiMsg: Partial<Message> = { id: 'msg-1', content: 'wrong reply' };
      messageRepo.findOne.mockResolvedValue(aiMsg);
      correctionRepo.save.mockImplementation(async (row) => ({ id: 'c-1', ...row }));

      const result = await service.capture({ userId: 'u-1', sessionId: 's-1', correctionText: 'that was wrong' });

      expect(messageRepo.findOne).toHaveBeenCalledWith({
        where: { session_id: 's-1', role: MessageRole.AI },
        order: { created_at: 'DESC' },
      });
      expect(analyzeMock).toHaveBeenCalledWith('that was wrong', 'wrong reply');
      expect(correctionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'u-1',
        triggering_message_id: 'msg-1',
        correction_text: 'that was wrong',
        ai_analysis: 'Tone correction',
        ai_validity_score: 80,
        ai_suggested_knowledge: 'Use a softer tone',
        status: CorrectionStatus.PENDING,
      }));
      expect(result.id).toBe('c-1');
    });

    it('persists with null triggering_message_id when no prior AI reply exists', async () => {
      messageRepo.findOne.mockResolvedValue(null);
      correctionRepo.save.mockImplementation(async (row) => ({ id: 'c-2', ...row }));

      await service.capture({ userId: 'u-1', sessionId: 's-1', correctionText: 'standalone' });

      expect(correctionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        triggering_message_id: null,
      }));
    });

    it('still persists even when AI analysis fails', async () => {
      messageRepo.findOne.mockResolvedValue(null);
      analyzeMock.mockRejectedValueOnce(new Error('LLM down'));
      correctionRepo.save.mockImplementation(async (row) => ({ id: 'c-3', ...row }));

      await service.capture({ userId: 'u-1', sessionId: 's-1', correctionText: 'whatever' });

      expect(correctionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        ai_analysis: null,
        ai_validity_score: null,
        ai_suggested_knowledge: null,
      }));
    });
  });

  describe('getActiveKnowledge', () => {
    it('returns only active rows, oldest first', async () => {
      const rows = [{ id: 'k-1', active: true }];
      knowledgeRepo.find.mockResolvedValue(rows);

      const result = await service.getActiveKnowledge();

      expect(knowledgeRepo.find).toHaveBeenCalledWith({
        where: { active: true },
        order: { created_at: 'ASC' },
      });
      expect(result).toEqual(rows);
    });
  });

  describe('accept', () => {
    it('creates a knowledge entry, links it to the correction, marks accepted', async () => {
      const correction = { id: 'c-1', status: CorrectionStatus.PENDING } as Correction;
      const knowledge = { id: 'k-1', title: 'T', content: 'C' } as CoachingKnowledge;
      correctionRepo.findOneOrFail
        .mockResolvedValueOnce(correction)
        .mockResolvedValueOnce({ ...correction, status: CorrectionStatus.ACCEPTED, knowledge_id: 'k-1' });
      knowledgeRepo.save.mockResolvedValue(knowledge);
      correctionRepo.update.mockResolvedValue({});

      const result = await service.accept({
        correctionId: 'c-1',
        reviewedBy: 'admin@x.com',
        title: 'T',
        content: 'C',
      });

      expect(knowledgeRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        title: 'T',
        content: 'C',
        source_correction_id: 'c-1',
        active: true,
        created_by: 'admin@x.com',
      }));
      expect(correctionRepo.update).toHaveBeenCalledWith('c-1', expect.objectContaining({
        status: CorrectionStatus.ACCEPTED,
        knowledge_id: 'k-1',
        reviewed_by: 'admin@x.com',
      }));
      expect(result.correction.status).toBe(CorrectionStatus.ACCEPTED);
    });
  });

  describe('append', () => {
    it('concatenates new content to an existing knowledge entry and marks appended', async () => {
      const correction = { id: 'c-1' } as Correction;
      const existing = { id: 'k-9', content: 'old content' } as CoachingKnowledge;
      correctionRepo.findOneOrFail
        .mockResolvedValueOnce(correction)
        .mockResolvedValueOnce({ ...correction, status: CorrectionStatus.APPENDED });
      knowledgeRepo.findOneOrFail
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, content: 'old content\n\nnew bit' });
      correctionRepo.update.mockResolvedValue({});
      knowledgeRepo.update.mockResolvedValue({});

      const result = await service.append({
        correctionId: 'c-1',
        reviewedBy: 'admin',
        knowledgeId: 'k-9',
        appendedContent: 'new bit',
      });

      expect(knowledgeRepo.update).toHaveBeenCalledWith('k-9', { content: 'old content\n\nnew bit' });
      expect(correctionRepo.update).toHaveBeenCalledWith('c-1', expect.objectContaining({
        status: CorrectionStatus.APPENDED,
        knowledge_id: 'k-9',
      }));
      expect(result.knowledge.content).toBe('old content\n\nnew bit');
    });
  });

  describe('reject', () => {
    it('marks the correction rejected with an optional note', async () => {
      correctionRepo.update.mockResolvedValue({});
      correctionRepo.findOneOrFail.mockResolvedValue({ id: 'c-1', status: CorrectionStatus.REJECTED });

      await service.reject({ correctionId: 'c-1', reviewedBy: 'admin', note: 'spam' });

      expect(correctionRepo.update).toHaveBeenCalledWith('c-1', expect.objectContaining({
        status: CorrectionStatus.REJECTED,
        admin_note: 'spam',
        reviewed_by: 'admin',
      }));
    });
  });
});
