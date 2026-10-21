import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, Notice } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

/**
 * Shown when Supabase credentials are missing or unsafe. It never pretends data is being saved:
 * the only way past it without credentials is the clearly labelled demo mode.
 */
export default function Setup() {
  const auth = useAuth();
  const navigate = useNavigate();
  if (auth.configured) return <Navigate to="/login" replace />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Connect SubSave to Supabase</h1>
      <p className="mt-2 text-sm text-ink-soft">
        SubSave stores your subscriptions in your own Supabase project. Nothing is saved anywhere until you connect one.
      </p>

      <Notice tone="warn" title="What is wrong" className="mt-5">
        {auth.configProblem ?? 'Supabase credentials are missing.'}
      </Notice>

      <ol className="mt-6 list-decimal space-y-4 pl-5 text-sm text-ink">
        <li>
          Create a free project at <span className="font-medium">supabase.com</span>.
        </li>
        <li>
          In the SQL editor, run the two files in <code className="rounded bg-white px-1 py-0.5">supabase/migrations</code>, in order
          (schema first, then rls).
        </li>
        <li>
          Copy <code className="rounded bg-white px-1 py-0.5">.env.example</code> to <code className="rounded bg-white px-1 py-0.5">.env.local</code>{' '}
          and fill in <code className="rounded bg-white px-1 py-0.5">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-white px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code> from Project Settings, then API. Use the anon (publishable) key,
          never a secret key.
        </li>
        <li>Restart the dev server (or redeploy) so the new values are picked up.</li>
      </ol>

      <div className="mt-8 rounded-2xl border border-paper-line bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">Just want to look around?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Demo mode shows sample data stored only in this browser. It is not saved to any account and is never mixed with real records.
        </p>
        <Button
          className="mt-3"
          onClick={() => {
            auth.enterDemo();
            navigate('/', { replace: true });
          }}
        >
          Open demo mode
        </Button>
        <Link to="/login" className="ml-4 text-sm font-medium text-brand-700 underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
