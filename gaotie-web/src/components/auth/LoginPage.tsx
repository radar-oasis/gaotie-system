import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password, displayName);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '操作失败，请稍后重试',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-panel" onSubmit={handleSubmit}>
        <div>
          <p className="auth-kicker">Gaotie Design System</p>
          <h1>{mode === 'login' ? '登录工作台' : '创建账号'}</h1>
        </div>

        <label>
          用户名
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="designer"
            required
          />
        </label>

        {mode === 'register' && (
          <label>
            显示名称
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              placeholder="高铁设计师"
            />
          </label>
        )}

        <label>
          密码
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
            minLength={8}
            type="password"
            required
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}
        </button>

        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setError('');
            setMode(mode === 'login' ? 'register' : 'login');
          }}
        >
          {mode === 'login' ? '没有账号，创建一个' : '已有账号，返回登录'}
        </button>
      </form>
    </div>
  );
}
