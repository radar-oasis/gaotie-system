import { PasswordService } from './password.service';
import { AuthService } from './auth.service';

type Row = Record<string, any>;

class FakeDatabaseService {
  users: Row[] = [];
  sessions: Row[] = [];

  async query<T extends Row = Row>(sql: string, params: any[] = []) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (
      normalized.startsWith('select') &&
      normalized.includes('from users') &&
      normalized.includes('lower(username)')
    ) {
      const username = String(params[0]).toLowerCase();
      const user = this.users.find(
        (row) => String(row.username).toLowerCase() === username,
      );
      return { rows: user ? [user as T] : [], rowCount: user ? 1 : 0 };
    }

    if (normalized.startsWith('insert into users')) {
      const [id, username, passwordHash, displayName] = params;
      const user = {
        id,
        username,
        password_hash: passwordHash,
        display_name: displayName,
        role: 'user',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.users.push(user);
      return { rows: [user as T], rowCount: 1 };
    }

    if (normalized.startsWith('insert into user_sessions')) {
      const [id, userId, tokenHash, expiresAt] = params;
      const session = {
        id,
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_at: new Date(),
      };
      this.sessions.push(session);
      return { rows: [session as T], rowCount: 1 };
    }

    if (normalized.startsWith('update users set last_login_at')) {
      return { rows: [], rowCount: 1 };
    }

    if (
      normalized.startsWith('select') &&
      normalized.includes('from user_sessions')
    ) {
      const tokenHash = params[0];
      const session = this.sessions.find((row) => row.token_hash === tokenHash);
      const user = session
        ? this.users.find((row) => row.id === session.user_id)
        : undefined;
      return { rows: user ? [user as T] : [], rowCount: user ? 1 : 0 };
    }

    if (normalized.startsWith('delete from user_sessions')) {
      const tokenHash = params[0];
      const before = this.sessions.length;
      this.sessions = this.sessions.filter(
        (row) => row.token_hash !== tokenHash,
      );
      return { rows: [], rowCount: before - this.sessions.length };
    }

    throw new Error(`Unhandled SQL: ${sql}`);
  }
}

describe('AuthService', () => {
  let db: FakeDatabaseService;
  let service: AuthService;

  beforeEach(() => {
    db = new FakeDatabaseService();
    service = new AuthService(db as any, new PasswordService());
  });

  it('registers a user and creates an opaque session token', async () => {
    const result = await service.register({
      username: 'designer',
      password: 'SensiblePass123',
      displayName: '高铁设计师',
    });

    expect(result.user).toMatchObject({
      username: 'designer',
      displayName: '高铁设计师',
      role: 'user',
    });
    expect(result.user.passwordHash).toBeUndefined();
    expect(result.sessionToken).toHaveLength(64);
    expect(db.sessions).toHaveLength(1);
    expect(db.sessions[0].token_hash).not.toBe(result.sessionToken);
  });

  it('rejects duplicate usernames', async () => {
    await service.register({
      username: 'designer',
      password: 'SensiblePass123',
    });

    await expect(
      service.register({ username: 'Designer', password: 'AnotherPass123' }),
    ).rejects.toThrow('用户名已存在');
  });

  it('logs in with the stored password and resolves the current user by token', async () => {
    await service.register({
      username: 'designer',
      password: 'SensiblePass123',
    });

    const login = await service.login({
      username: 'designer',
      password: 'SensiblePass123',
    });
    const currentUser = await service.getUserBySessionToken(login.sessionToken);

    expect(currentUser).toMatchObject({ username: 'designer' });
  });

  it('rejects invalid login credentials without revealing which field failed', async () => {
    await service.register({
      username: 'designer',
      password: 'SensiblePass123',
    });

    await expect(
      service.login({ username: 'designer', password: 'wrong-password' }),
    ).rejects.toThrow('用户名或密码错误');
  });
});
