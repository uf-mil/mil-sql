import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../../api';

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  border: '1px solid var(--stroke, #0a0d12)',
  borderRadius: '4px',
  fontSize: '1rem',
  boxSizing: 'border-box',
  backgroundColor: 'var(--room, #1b1f2a)',
  color: 'var(--text, #e6ebf4)',
};

const labelStyle = {
  display: 'block',
  marginBottom: '0.5rem',
  fontWeight: '500',
  color: 'var(--text, #e6ebf4)',
};

const SignUp = ({ onSignUpSuccess }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const result = await auth.register({
        firstName,
        lastName,
        email,
        password,
        confirmPassword,
      });
      if (result.success && onSignUpSuccess) {
        onSignUpSuccess(result.user);
      }
    } catch (err) {
      setError(err.message || 'Could not create account. Please try again.');
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
      overflow: 'auto',
      padding: '1.5rem',
      boxSizing: 'border-box',
    }}>
      <div style={{
        backgroundColor: 'var(--panel, #0e1116)',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 20px 60px rgba(0,0,0,.45)',
        width: '100%',
        maxWidth: '440px',
        border: '1px solid var(--stroke, #0a0d12)',
        margin: 'auto',
      }}>
        <h2 style={{
          marginTop: 0,
          marginBottom: '1.5rem',
          textAlign: 'center',
          color: 'var(--text, #e6ebf4)',
        }}>
          Create account
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                disabled={loading}
                autoComplete="given-name"
                style={inputStyle}
                placeholder="Ada"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                disabled={loading}
                autoComplete="family-name"
                style={inputStyle}
                placeholder="Lovelace"
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
              style={inputStyle}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="new-password"
              minLength={8}
              style={inputStyle}
              placeholder="At least 8 characters"
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="new-password"
              minLength={8}
              style={inputStyle}
              placeholder="Re-enter password"
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
            {loading ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p style={{
          marginTop: '1.5rem',
          marginBottom: 0,
          textAlign: 'center',
          fontSize: '0.95rem',
          color: 'var(--muted, #9aa8c2)',
        }}>
          Already have an account?{' '}
          <Link
            to="/"
            style={{ color: 'var(--accent, #9bb7ff)', fontWeight: 500 }}
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignUp;
