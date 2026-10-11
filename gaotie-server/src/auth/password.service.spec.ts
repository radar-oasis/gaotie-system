import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('hashes and verifies a password without storing it in plaintext', async () => {
    const hash = await service.hashPassword('SensiblePass123');

    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('SensiblePass123');
    await expect(service.verifyPassword('SensiblePass123', hash)).resolves.toBe(
      true,
    );
    await expect(service.verifyPassword('wrong-password', hash)).resolves.toBe(
      false,
    );
  });

  it('returns false for malformed stored hashes', async () => {
    await expect(
      service.verifyPassword('SensiblePass123', 'not-a-valid-hash'),
    ).resolves.toBe(false);
  });
});
