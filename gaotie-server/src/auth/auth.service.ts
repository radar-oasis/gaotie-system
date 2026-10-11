import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { PasswordService } from './password.service';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  status: string;
  createdAt?: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string | null;
  role: string;
  status: string;
  created_at?: Date | string;
}

interface AuthInput {
  username: string;
  password: string;
  displayName?: string;
}

export interface AuthResult {
  user: PublicUser;
  sessionToken: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly cookieName = process.env.SESSION_COOKIE_NAME ?? 'gaotie_session';

  constructor(
    private readonly db: DatabaseService,
    private readonly passwordService: PasswordService,
  ) {}

  getSessionCookieName(): string {
    return this.cookieName;
  }

  getSessionMaxAgeMs(): number {
    return this.getSessionTtlDays() * 24 * 60 * 60 * 1000;
  }

  async register(input: AuthInput): Promise<AuthResult> {
    const username = this.normalizeUsername(input.username);
    this.validatePassword(input.password);

    const existing = await this.findUserByUsername(username);

    if (existing) {
      throw new BadRequestException('用户名已存在');
    }

    const passwordHash = await this.passwordService.hashPassword(input.password);
    const userId = randomUUID();
    const user = await this.db.query<UserRow>(
      `
        INSERT INTO users (id, username, password_hash, display_name)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, password_hash, display_name, role, status, created_at
      `,
      [userId, username, passwordHash, input.displayName?.trim() || null],
    );

    return this.createSession(user.rows[0]);
  }

  async login(input: AuthInput): Promise<AuthResult> {
    const username = this.normalizeUsername(input.username);
    const user = await this.findUserByUsername(username);

    if (
      !user ||
      user.status !== 'active' ||
      !(await this.passwordService.verifyPassword(
        input.password,
        user.password_hash,
      ))
    ) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    await this.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [
      user.id,
    ]);

    return this.createSession(user);
  }

  async logout(sessionToken?: string): Promise<void> {
    if (!sessionToken) {
      return;
    }

    await this.db.query('DELETE FROM user_sessions WHERE token_hash = $1', [
      this.hashSessionToken(sessionToken),
    ]);
  }

  async getUserBySessionToken(sessionToken?: string): Promise<PublicUser | null> {
    if (!sessionToken) {
      return null;
    }

    const result = await this.db.query<UserRow>(
      `
        SELECT users.id,
               users.username,
               users.password_hash,
               users.display_name,
               users.role,
               users.status,
               users.created_at
          FROM user_sessions
          JOIN users ON users.id = user_sessions.user_id
         WHERE user_sessions.token_hash = $1
           AND user_sessions.expires_at > now()
           AND users.status = 'active'
         LIMIT 1
      `,
      [this.hashSessionToken(sessionToken)],
    );

    return result.rows[0] ? this.toPublicUser(result.rows[0]) : null;
  }

  getSessionTokenFromCookieHeader(cookieHeader?: string): string | undefined {
    if (!cookieHeader) {
      return undefined;
    }

    const cookies = cookieHeader.split(';').map((part) => part.trim());
    const sessionCookie = cookies.find((part) =>
      part.startsWith(`${this.cookieName}=`),
    );

    return sessionCookie
      ? decodeURIComponent(sessionCookie.slice(this.cookieName.length + 1))
      : undefined;
  }

  private async findUserByUsername(username: string): Promise<UserRow | null> {
    const result = await this.db.query<UserRow>(
      `
        SELECT id, username, password_hash, display_name, role, status, created_at
          FROM users
         WHERE lower(username) = lower($1)
         LIMIT 1
      `,
      [username],
    );

    return result.rows[0] ?? null;
  }

  private async createSession(user: UserRow): Promise<AuthResult> {
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.getSessionMaxAgeMs());

    await this.db.query(
      `
        INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), user.id, this.hashSessionToken(sessionToken), expiresAt],
    );

    return {
      user: this.toPublicUser(user),
      sessionToken,
      expiresAt,
    };
  }

  private normalizeUsername(username: string): string {
    const normalized = String(username ?? '').trim();

    if (normalized.length < 3 || normalized.length > 40) {
      throw new BadRequestException('用户名长度需要在 3 到 40 个字符之间');
    }

    if (!/^[A-Za-z0-9_.@-]+$/.test(normalized)) {
      throw new BadRequestException('用户名只能包含字母、数字、点、下划线、@ 和短横线');
    }

    return normalized;
  }

  private validatePassword(password: string): void {
    if (String(password ?? '').length < 8) {
      throw new BadRequestException('密码至少需要 8 个字符');
    }
  }

  private getSessionTtlDays(): number {
    return Math.max(1, Number(process.env.SESSION_TTL_DAYS ?? 30));
  }

  private hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(row: UserRow): PublicUser {
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name ?? null,
      role: row.role,
      status: row.status,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    };
  }
}
