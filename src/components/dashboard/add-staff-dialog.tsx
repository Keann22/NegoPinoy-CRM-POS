'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

// What each choice gives on the dashboard (same as the old single-role accounts).
const ROLE_CHOICES: Record<string, string[]> = {
  Admin: ['Admin', 'Sales', 'Inventory'],
  Inventory: ['Inventory'],
  Sales: ['Sales'],
};

interface AddStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddStaffDialog({ open, onOpenChange, onSuccess }: AddStaffDialogProps) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Inventory');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFirstName(''); setLastName(''); setEmail(''); setPassword(''); setRole('Inventory');
  };

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', firstName, lastName, email, password, roles: ROLE_CHOICES[role] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not create the account');
      toast({ title: 'Staff account created', description: `${email} can now log in with the password you set.` });
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>
            Creates a log-in for a team member. Give them the password; they can change it with
            &quot;Forgot password?&quot;.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="staff-first">First name</Label>
              <Input id="staff-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-last">Last name</Label>
              <Input id="staff-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-password">Password (at least 8 characters)</Label>
            <Input id="staff-password" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="staff-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Inventory">Inventory (warehouse)</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
                <SelectItem value="Admin">Admin (sees suppliers and costs)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !firstName || !email || password.length < 8}>
            {saving ? 'Creating...' : 'Create account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
