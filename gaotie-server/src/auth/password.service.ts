import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = (await scryptAsync(
      password,
      salt,
      KEY_LENGTH,
    )) as Buffer;

    return `scrypt$${salt.toString('base64url')}$${derivedKey.toString(
      'base64url',
    )}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split('$');

    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }

    try {
      const salt = Buffer.from(parts[1], 'base64url');
      const expected = Buffer.from(parts[2], 'base64url');
      const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;

      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    } catch {
      return false;
    }
  }
}
