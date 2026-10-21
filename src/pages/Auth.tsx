import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, Input, Notice, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import {
  forgotSchema,
  loginSchema,
  newPasswordSchema,
  signupSchema,
  type ForgotValues,
  type LoginValues,
  type NewPasswordValues,
  type SignupValues,
} from '@/lib/authSchemas';

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#1a7c70" />
          <path
            d="M10 21c1.5 1.4 3.6 2 5.8 2 3 0 5.2-1.2 5.2-3.4 0-5-10.4-2.2-10.4-6.6 0-2 1.9-3.2 4.8-3.2 1.8 0 3.3.5 4.4 1.3"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-xl font-semibold tracking-tight text-ink">SubSave</span>
      </div>
      <div className="card p-5 sm:p-6">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      <p className="mt-4 text-center text-xs text-ink-soft">SubSave never asks for card numbers, CVVs or UPI PINs.</p>
    </div>
  );
}

function useRedirectIfSignedIn() {
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const signedIn = auth.mode === 'demo' || (auth.user !== null && !auth.passwordRecovery);
  return { signedIn, from, auth };
}

export function Login() {
  const { signedIn, from, auth } = useRedirectIfSignedIn();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  if (auth.loading) return <Spinner label="Loading" />;
  if (signedIn) return <Navigate to={from} replace />;

  const submit = async (v: LoginValues) => {
    setError(null);
    const res = await auth.signIn(v.email, v.password);
    if (res.error) setError(res.error);
    else navigate(from, { replace: true });
  };

  return (
    <Shell title="Welcome back" subtitle="Sign in to see your subscriptions.">
      {auth.sessionExpired && (
        <Notice tone="warn" className="mb-4">
          Your session ended, so we signed you out to keep your data safe. Please sign in again.
        </Notice>
      )}
      {!auth.configured && (
        <Notice tone="warn" title="Not connected to a database" className="mb-4">
          Accounts need Supabase credentials. <Link to="/setup" className="font-medium underline">See setup</Link>, or try the demo below.
        </Notice>
      )}
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Field label="Email" error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="email" autoComplete="email" inputMode="email" {...register('email')} />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="password" autoComplete="current-password" {...register('password')} />
          )}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" className="w-full" loading={isSubmitting} disabled={!auth.configured}>
          Sign in
        </Button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <Link to="/forgot-password" className="font-medium text-brand-700 underline">
          Forgot password?
        </Link>
        <Link to="/signup" className="font-medium text-brand-700 underline">
          Create an account
        </Link>
      </div>
      <div className="mt-5 border-t border-paper-line pt-4">
        <p className="text-xs text-ink-soft">Just looking? Demo mode uses sample data kept only in this browser. It is never mixed with a real account.</p>
        <Button
          variant="secondary"
          className="mt-2 w-full"
          onClick={() => {
            auth.enterDemo();
            navigate('/', { replace: true });
          }}
        >
          Try the demo
        </Button>
      </div>
    </Shell>
  );
}

export function Signup() {
  const { signedIn, auth } = useRedirectIfSignedIn();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  if (signedIn) return <Navigate to="/" replace />;

  const submit = async (v: SignupValues) => {
    setError(null);
    const res = await auth.signUp(v.email, v.password);
    if (res.error) setError(res.error);
    else if (res.needsVerification) setSentTo(v.email.trim());
  };

  if (sentTo) {
    return (
      <Shell title="Check your email">
        <p className="text-sm text-ink-soft">
          We sent a verification link to <strong className="text-ink">{sentTo}</strong>. Open it to activate your account, then sign in. It
          can take a minute, and it may land in spam.
        </p>
        <Link to="/login" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
          Back to sign in
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title="Create your account" subtitle="Free. We will email you a link to verify your address.">
      {!auth.configured && (
        <Notice tone="warn" title="Not connected to a database" className="mb-4">
          Sign-up needs Supabase credentials. <Link to="/setup" className="font-medium underline">See setup</Link>.
        </Notice>
      )}
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Field label="Email" error={errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="email" autoComplete="email" inputMode="email" {...register('email')} />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters.">
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="password" autoComplete="new-password" {...register('password')} />
          )}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="password" autoComplete="new-password" {...register('confirm')} />
          )}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" className="w-full" loading={isSubmitting} disabled={!auth.configured}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-sm text-ink-soft">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-700 underline">
          Sign in
        </Link>
      </p>
    </Shell>
  );
}

export function ForgotPassword() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  const submit = async (v: ForgotValues) => {
    setError(null);
    const res = await auth.sendPasswordReset(v.email);
    if (res.error) setError(res.error);
    else setSent(true);
  };

  return (
    <Shell title="Reset your password" subtitle="Enter your email and we will send you a reset link.">
      {sent ? (
        <Notice tone="success">If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.</Notice>
      ) : (
        <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
          <Field label="Email" error={errors.email?.message}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} invalid={invalid} type="email" autoComplete="email" inputMode="email" {...register('email')} />
            )}
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button type="submit" className="w-full" loading={isSubmitting} disabled={!auth.configured}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/login" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
        Back to sign in
      </Link>
    </Shell>
  );
}

export function UpdatePassword() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema) });

  if (auth.loading) return <Spinner label="Checking your reset link" />;
  if (!auth.user) {
    return (
      <Shell title="This link has expired">
        <p className="text-sm text-ink-soft">Reset links work once and expire quickly. Ask for a new one.</p>
        <Link to="/forgot-password" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
          Send a new link
        </Link>
      </Shell>
    );
  }

  const submit = async (v: NewPasswordValues) => {
    setError(null);
    const res = await auth.updatePassword(v.password);
    if (res.error) setError(res.error);
    else navigate('/', { replace: true });
  };

  return (
    <Shell title="Choose a new password">
      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Field label="New password" error={errors.password?.message} hint="At least 8 characters.">
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="password" autoComplete="new-password" {...register('password')} />
          )}
        </Field>
        <Field label="Confirm new password" error={errors.confirm?.message}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} invalid={invalid} type="password" autoComplete="new-password" {...register('confirm')} />
          )}
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Save password
        </Button>
      </form>
    </Shell>
  );
}
