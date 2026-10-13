import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorBox } from '@/components/Field';

const inputCls =
  'h-12 rounded-none border-ink/70 bg-transparent px-3 text-lg font-semibold placeholder:font-semibold placeholder:text-ink/70';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md border border-ink bg-card/60">
        <div className="grunge px-5 py-4">
          <h1 className="font-display text-3xl tracking-wide">Department Inventory</h1>
        </div>

        <div className="space-y-4 p-5">
          <form onSubmit={submit} className="space-y-3" noValidate>
            <label className="sr-only" htmlFor="email">Email</label>
            <Input id="email" type="email" autoComplete="username" className={inputCls} placeholder="Email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="sr-only" htmlFor="password">Password</label>
            <Input id="password" type="password" autoComplete="current-password" className={inputCls} placeholder="Password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" disabled={busy} className="grunge h-12 w-full rounded-none font-display text-xl tracking-wide">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
