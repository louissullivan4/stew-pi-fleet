import React, { useState } from 'react';
import { Button, TextInput, PasswordInput, InlineNotification } from '@carbon/react';
import { useAuth } from '../../App';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-card__title">Pi Fleet</p>
        <p className="login-card__subtitle">Sign in to manage your Raspberry Pi cluster</p>

        {error && (
          <InlineNotification
            kind="error"
            title="Authentication failed"
            subtitle={error}
            style={{ marginBottom: '1.5rem' }}
            lowContrast
          />
        )}

        <form onSubmit={handleSubmit}>
          <TextInput
            id="username"
            labelText="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            style={{ marginBottom: '1rem' }}
          />
          <PasswordInput
            id="password"
            labelText="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ marginBottom: '1.5rem' }}
          />
          <Button
            type="submit"
            disabled={loading || !username || !password}
            style={{ width: '100%' }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
