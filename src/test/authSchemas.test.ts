import { describe, it, expect } from 'vitest';
import { forgotSchema, loginSchema, newPasswordSchema, signupSchema } from '@/lib/authSchemas';

const msgs = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : (r.error?.issues.map((i) => i.message) ?? []);

describe('auth form validation', () => {
  it('login needs a valid email and a password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(msgs(loginSchema.safeParse({ email: 'nope', password: 'x' }))).toContain('Enter a valid email address');
    expect(msgs(loginSchema.safeParse({ email: 'a@b.co', password: '' }))).toContain('Enter your password');
  });
  it('signup requires 8+ characters and matching passwords', () => {
    expect(signupSchema.safeParse({ email: 'a@b.co', password: 'longenough', confirm: 'longenough' }).success).toBe(true);
    expect(msgs(signupSchema.safeParse({ email: 'a@b.co', password: 'short', confirm: 'short' }))).toContain('Use at least 8 characters');
    expect(msgs(signupSchema.safeParse({ email: 'a@b.co', password: 'longenough', confirm: 'different1' }))).toContain(
      'The passwords do not match',
    );
  });
  it('trims the email before validating it', () => {
    const r = forgotSchema.safeParse({ email: '  a@b.co  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('a@b.co');
  });
  it('new password needs the same rules', () => {
    expect(newPasswordSchema.safeParse({ password: 'longenough', confirm: 'longenough' }).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password: 'longenough', confirm: 'nope' }).success).toBe(false);
  });
});
