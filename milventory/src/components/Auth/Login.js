import React, { useState } from 'react';
import { auth } from '../../api';

const Login = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await auth.login(email, password);
      if (result.success && onLoginSuccess) {
        onLoginSuccess(result.user);
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(1200px 800px at 50% 0%, #0d0f14, #07080c)',
      width: '100%',
      height: '100%',
    }}>
      <div style={{
        backgroundColor: 'var(--panel, #0e1116)',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 20px 60px rgba(0,0,0,.45)',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid var(--stroke, #0a0d12)',
      }}>
        <h2 style={{ 
          marginTop: 0, 
          marginBottom: '1.5rem', 
          textAlign: 'center',
          color: 'var(--text, #e6ebf4)',
        }}>
          Milventory Login
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: 'var(--text, #e6ebf4)',
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--stroke, #0a0d12)',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                backgroundColor: 'var(--room, #1b1f2a)',
                color: 'var(--text, #e6ebf4)',
              }}
              placeholder="test@ufl.edu"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: '500',
              color: 'var(--text, #e6ebf4)',
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--stroke, #0a0d12)',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
                backgroundColor: 'var(--room, #1b1f2a)',
                color: 'var(--text, #e6ebf4)',
              }}
              placeholder="test"
            />
          </div>

          {error && (
            <div style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              backgroundColor: 'rgba(183, 42, 42, 0.2)',
              border: '1px solid rgba(183, 42, 42, 0.5)',
              color: '#ff6b6b',
              borderRadius: '4px',
              fontSize: '0.9rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: loading ? 'var(--muted, #9aa8c2)' : 'var(--accent, #9bb7ff)',
              color: loading ? 'var(--text, #e6ebf4)' : '#0d0f14',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.target.style.backgroundColor = '#b4c7ff';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.target.style.backgroundColor = 'var(--accent, #9bb7ff)';
              }
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          backgroundColor: 'var(--room, #1b1f2a)',
          border: '1px solid var(--stroke, #0a0d12)',
          borderRadius: '4px',
          fontSize: '0.85rem',
          color: 'var(--muted, #9aa8c2)',
        }}>
          <strong style={{ color: 'var(--text, #e6ebf4)' }}>Test Credentials:</strong><br />
          Email: test@ufl.edu<br />
          Password: test
        </div>
      </div>
    </div>
  );
};

export default Login;

