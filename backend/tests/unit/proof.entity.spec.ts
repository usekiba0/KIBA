import { Proof, ProofType, ProofValidationStatus } from '../../src/data/entities/proof.entity';

describe('Proof entity', () => {
  function makeProof(overrides: Partial<Proof> = {}): Proof {
    const p = new Proof();
    p.id = 'proof-1';
    p.task_id = 'task-1';
    p.user_id = 'user-1';
    p.proof_type = ProofType.PHOTO;
    p.media_url = 'https://api.twilio.com/media/proof.jpg';
    p.content = null;
    p.validation_status = ProofValidationStatus.PENDING;
    p.validated_at = null;
    p.created_at = new Date();
    Object.assign(p, overrides);
    return p;
  }

  it('has ProofType enum with photo and text values', () => {
    expect(ProofType.PHOTO).toBe('photo');
    expect(ProofType.TEXT).toBe('text');
  });

  it('has ProofValidationStatus enum with pending, accepted, rejected', () => {
    expect(ProofValidationStatus.PENDING).toBe('pending');
    expect(ProofValidationStatus.ACCEPTED).toBe('accepted');
    expect(ProofValidationStatus.REJECTED).toBe('rejected');
  });

  it('creates a photo proof with media_url', () => {
    const proof = makeProof();
    expect(proof.proof_type).toBe(ProofType.PHOTO);
    expect(proof.media_url).toBeDefined();
    expect(proof.content).toBeNull();
  });

  it('creates a text proof with content', () => {
    const proof = makeProof({
      proof_type: ProofType.TEXT,
      media_url: null,
      content: 'Done — ran 1K in 8 minutes',
    });
    expect(proof.proof_type).toBe(ProofType.TEXT);
    expect(proof.content).toBe('Done — ran 1K in 8 minutes');
    expect(proof.media_url).toBeNull();
  });

  it('defaults validation_status to pending', () => {
    const proof = makeProof();
    expect(proof.validation_status).toBe(ProofValidationStatus.PENDING);
  });

  it('can be accepted with a validated_at timestamp', () => {
    const now = new Date();
    const proof = makeProof({ validation_status: ProofValidationStatus.ACCEPTED, validated_at: now });
    expect(proof.validation_status).toBe(ProofValidationStatus.ACCEPTED);
    expect(proof.validated_at).toBe(now);
  });
});
