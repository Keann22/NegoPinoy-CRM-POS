
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { useAuth, useUser, useFirestore } from '@/firebase';
import { initiateEmailSignIn, initiatePasswordReset, initiateEmailSignUp } from '@/firebase/non-blocking-login';
import { FormEvent, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function LoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading, userError } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  // State to toggle between Login and Sign Up
  const [isSignUp, setIsSignUp] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('Sales');


  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
    if(userError) {
        toast({
            variant: "destructive",
            title: "Uh oh! Something went wrong.",
            description: userError.message,
        });
    }
  }, [user, isUserLoading, router, userError, toast]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (isSignUp) {
        // Handle Sign Up
        if (!email || !password || !firstName || !lastName || !role) {
            toast({
                variant: "destructive",
                title: "All fields are required.",
                description: "Please fill out all fields to create an account.",
            });
            return;
        }
        initiateEmailSignUp(auth, firestore, email, password, firstName, lastName, role);

    } else {
        // Handle Login
        if (!email || !password) {
            toast({
                variant: "destructive",
                title: "Uh oh! Something went wrong.",
                description: "Email and password are required.",
            });
            return;
        }
        initiateEmailSignIn(auth, email, password);
    }
  };
  
  const handlePasswordReset = () => {
    if (!email) {
      toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter your email address to reset your password.',
      });
      return;
    }
    initiatePasswordReset(auth, email);
  };

  if (isUserLoading || (!isUserLoading && user)) {
    return <div className="flex items-center justify-center min-h-screen bg-background">Loading...</div>
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="mx-auto max-w-sm w-full">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-2">
            <Logo className="w-10 h-10" />
          </div>
          <CardTitle className="text-2xl font-bold font-headline">
            {isSignUp ? 'Create an Account' : 'Welcome to RetailFlow'}
          </CardTitle>
          <CardDescription>
            {isSignUp ? 'Enter your details to get started.' : 'Enter your credentials to access your dashboard'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {isSignUp && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input id="firstName" placeholder="Keneth" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input id="lastName" placeholder="Owner" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Assign Your Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Owner">Owner (Full Access)</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Inventory">Inventory (Fulfillment)</SelectItem>
                        <SelectItem value="Sales">Sales</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="m@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {!isSignUp && (
                        <button
                            type="button"
                            onClick={handlePasswordReset}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            Forgot password?
                        </button>
                    )}
                 </div>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full">
                {isSignUp ? 'Sign Up' : 'Login'}
              </Button>
            </div>
          </form>
          <div className="mt-4 text-center text-sm">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-medium text-primary hover:underline"
            >
              {isSignUp ? 'Login' : 'Sign Up'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
