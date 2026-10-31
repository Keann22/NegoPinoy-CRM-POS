'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { FormEvent, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import { isStaffUser } from '@/lib/auth/staff-roles';

// Staff log-in only. There is no public sign-up: owners create staff accounts in
// User Management, and roles are set by the server (app_metadata).
const NO_ACCESS = 'This account has no staff access. Ask the owner to add you in User Management.';

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [noAccess, setNoAccess] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Already logged in: staff go to the dashboard; anyone else is signed out here
  // (sending them to /dashboard would just bounce back).
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user && isStaffUser(data.user)) {
        router.push('/dashboard');
        return;
      }
      if (data.user) {
        await supabase.auth.signOut();
        setNoAccess(true);
      }
      setIsCheckingSession(false);
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ variant: 'destructive', title: 'Email and password are required.' });
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!isStaffUser(data.user)) {
        await supabase.auth.signOut();
        setNoAccess(true);
        return;
      }
      router.push('/dashboard');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Authentication Error',
        description: err?.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      toast({ variant: 'destructive', title: 'Email Required', description: 'Please enter your email address.' });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast({ title: 'Password Reset Sent', description: 'Check your inbox for the reset link.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return <div className="flex items-center justify-center min-h-screen bg-background">Loading...</div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <Logo className="w-10 h-10" />
          </div>
          <CardTitle className="text-2xl font-bold font-headline">Welcome to RetailFlow</CardTitle>
          <CardDescription>Enter your credentials to access your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          {noAccess && (
            <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {NO_ACCESS}
            </p>
          )}
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="m@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Please wait...' : 'Login'}
              </Button>
            </div>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New staff? Ask the owner to create your account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
