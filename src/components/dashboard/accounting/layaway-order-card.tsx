'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Clock,
  User,
  Phone,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  History,
  Save,
  Truck,
  Check,
  XCircle,
  ExternalLink,
  FileText,
  PlusCircle,
  Send
} from 'lucide-react';
import type { LayawayReviewOrder } from '@/types/accounting.types';

interface LayawayOrderCardProps {
  order: LayawayReviewOrder;
  isUpdating: boolean;
  authorName: string;
  onSaveNotes: (orderId: string, notes: string) => Promise<boolean>;
  onAppendNote: (orderId: string, newNoteText: string, authorName: string) => Promise<boolean>;
  onUpdateStatus: (orderId: string, status: string, reason?: string) => Promise<boolean>;
  onViewHistory: (customerId?: string, customerName?: string) => void;
}

export function LayawayOrderCard({
  order,
  isUpdating,
  authorName,
  onSaveNotes,
  onAppendNote,
  onUpdateStatus,
  onViewHistory,
}: LayawayOrderCardProps) {
  // Existing notes edit state
  const [isEditingRawNotes, setIsEditingRawNotes] = useState(false);
  const [rawNotes, setRawNotes] = useState(order.notes || '');
  const [isSavingRawNotes, setIsSavingRawNotes] = useState(false);

  // New note append state
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  const formatMoney = (val: number) =>
    '₱' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSaveRawNotes = async () => {
    setIsSavingRawNotes(true);
    const success = await onSaveNotes(order.id, rawNotes);
    if (success) {
      setIsEditingRawNotes(false);
    }
    setIsSavingRawNotes(false);
  };

  const handleAddNewNote = async () => {
    if (!newNote.trim()) return;
    setIsAddingNote(true);
    const success = await onAppendNote(order.id, newNote, authorName);
    if (success) {
      setNewNote('');
      setRawNotes((prev) => (prev ? `${prev}\n\n[Note]: ${newNote}` : newNote));
    }
    setIsAddingNote(false);
  };

  const getDormantBadge = () => {
    if (order.activityStatus === 'dormant') {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 font-semibold text-[11px]">
          <AlertTriangle className="h-3 w-3" />
          Dormant ({order.daysSinceLastPayment ?? order.orderAgeDays}d no pay)
        </Badge>
      );
    }
    if (order.activityStatus === 'active_paying') {
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1 text-[11px]">
          <CheckCircle2 className="h-3 w-3" />
          Active Paying (last: {order.daysSinceLastPayment ?? 0}d ago)
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[11px] text-amber-600 border-amber-400">
        No payment record
      </Badge>
    );
  };

  return (
    <Card className="overflow-hidden border border-border/80 shadow-sm transition-all hover:border-primary/40">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border">
          
          {/* LEFT & CENTER: Order details & Financials (Cols 1 - 7) */}
          <div className="lg:col-span-7 p-4 sm:p-5 space-y-3">
            {/* Top row: Order ID, Age, Dormancy Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/orders/${order.id}`}
                  target="_blank"
                  className="font-mono font-bold text-sm bg-muted px-2 py-0.5 rounded text-foreground hover:text-primary hover:underline flex items-center gap-1"
                  title="Click to open full order form"
                >
                  #{order.id.substring(0, 8)}
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </Link>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {order.orderDate ? format(parseISO(order.orderDate), 'MMM d, yyyy') : '-'}
                  <span className="font-semibold text-foreground/80">({order.orderAgeDays} days old)</span>
                </span>
              </div>
              <div>{getDormantBadge()}</div>
            </div>

            {/* Customer & Agent info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-muted/40 p-2.5 rounded-md">
              <div className="flex items-center gap-1.5 truncate">
                <User className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className="font-semibold text-foreground truncate">{order.customerName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                {order.customerPhone && order.customerPhone !== '-' ? (
                  <a href={`tel:${order.customerPhone}`} className="text-primary hover:underline font-mono">
                    {order.customerPhone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">No phone</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground sm:col-span-2">
                <UserCheck className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Agent: <strong className="text-foreground">{order.salesPersonName}</strong></span>
              </div>
            </div>

            {/* Ordered Items */}
            <div className="text-xs space-y-1">
              <span className="text-muted-foreground font-medium uppercase text-[10px] tracking-wider">
                Items Ordered ({order.items.length})
              </span>
              <div className="flex flex-wrap gap-1">
                {order.items.length > 0 ? (
                  order.items.map((it, idx) => (
                    <Badge key={idx} variant="outline" className="text-[11px] font-normal bg-background py-0.5">
                      {it.name} <strong className="ml-1 text-primary">x{it.quantity}</strong>
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground italic text-xs">No items listed</span>
                )}
              </div>
            </div>

            {/* Financials & Last Payment */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60 text-xs">
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">Total</span>
                <p className="font-bold text-foreground text-sm">{formatMoney(order.totalAmount)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">Paid in Cash</span>
                <p className="font-bold text-emerald-600 text-sm">{formatMoney(order.amountPaid)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">Remaining</span>
                <p className="font-bold text-rose-600 text-sm">{formatMoney(order.balanceDue)}</p>
              </div>
            </div>

            {/* Last payment info chip */}
            {order.lastPaymentDate && (
              <div className="text-[11px] text-muted-foreground bg-muted/30 px-2 py-1 rounded flex items-center justify-between">
                <span>
                  Last Payment: <strong>{format(parseISO(order.lastPaymentDate), 'MMM d, yyyy')}</strong> ({order.lastPaymentMethod || 'Cash'})
                </span>
                <span className="font-semibold text-emerald-600">
                  {order.lastPaymentAmount ? formatMoney(order.lastPaymentAmount) : ''}
                </span>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Notes & Quick Actions (Cols 8 - 12) */}
          <div className="lg:col-span-5 p-4 sm:p-5 bg-muted/10 flex flex-col justify-between space-y-3">
            <div className="space-y-3">
              {/* Header: Title and link to full order form */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Order Notes
                </span>
                <Link
                  href={`/dashboard/orders/${order.id}`}
                  target="_blank"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  Open Order Form
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {/* SECTION 1: "Their Note" (Existing note from order form) */}
              <div className="bg-background rounded-md border border-border/80 p-2.5 text-xs space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/50 pb-1">
                  <span className="font-semibold text-foreground/90">Sales / Order Form Note:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingRawNotes(!isEditingRawNotes);
                      setRawNotes(order.notes || '');
                    }}
                    className="text-primary hover:underline text-[10px] font-medium"
                  >
                    {isEditingRawNotes ? 'Cancel' : 'Edit Note'}
                  </button>
                </div>

                {isEditingRawNotes ? (
                  <div className="space-y-1.5 pt-1">
                    <Textarea
                      value={rawNotes}
                      onChange={(e) => setRawNotes(e.target.value)}
                      rows={3}
                      className="text-xs font-mono bg-muted/30"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={isSavingRawNotes || isUpdating}
                        onClick={handleSaveRawNotes}
                        className="h-6 text-[11px] px-2.5 flex items-center gap-1"
                      >
                        <Save className="h-3 w-3" />
                        {isSavingRawNotes ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-24 overflow-y-auto text-muted-foreground whitespace-pre-wrap font-mono text-[11px] leading-relaxed pt-0.5">
                    {order.notes ? (
                      order.notes
                    ) : (
                      <span className="italic text-muted-foreground/60">No notes written on this order yet.</span>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 2: Add New Note (Connected to Order Form) */}
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                    <PlusCircle className="h-3 w-3 text-emerald-600" />
                    Add New Note:
                  </label>
                  <span className="text-[10px] text-muted-foreground">Syncs to order form</span>
                </div>
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Type update note (e.g. 'Checked with Tess, shipped via Lalamove', 'Customer promised to pay on 15th')..."
                  rows={2}
                  className="text-xs bg-background resize-none min-h-[50px]"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!newNote.trim() || isAddingNote || isUpdating}
                    onClick={handleAddNewNote}
                    className="h-7 text-xs px-2.5 flex items-center gap-1"
                  >
                    <Send className="h-3 w-3" />
                    {isAddingNote ? 'Saving...' : 'Add Note to Order'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="pt-2 border-t border-border/60 space-y-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onViewHistory(order.customerId, order.customerName)}
                className="w-full text-xs h-7 text-primary border-primary/30 hover:bg-primary/10 flex items-center justify-center gap-1.5"
              >
                <History className="h-3.5 w-3.5" />
                Check Customer History
              </Button>

              {/* Status change actions */}
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUpdating}
                  onClick={() => {
                    const reason = window.prompt(
                      `Mark Order #${order.id.substring(0, 8)} as SHIPPED?\nEnter tracking or shipping details (e.g. 'Lalamove c/o Ma'am Tess'):`,
                      order.trackingNumber || 'Lalamove'
                    );
                    if (reason !== null) {
                      onUpdateStatus(order.id, 'Shipped', reason);
                    }
                  }}
                  className="h-7 px-1 text-[11px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-blue-200"
                >
                  <Truck className="h-3 w-3 mr-1" />
                  Shipped
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUpdating}
                  onClick={() => {
                    if (window.confirm(`Mark Order #${order.id.substring(0, 8)} as COMPLETED?`)) {
                      onUpdateStatus(order.id, 'Completed', 'Manually marked completed by owner');
                    }
                  }}
                  className="h-7 px-1 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-200"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Complete
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUpdating}
                  onClick={() => {
                    const reason = window.prompt(
                      `Cancel Order #${order.id.substring(0, 8)}?\nEnter reason (e.g. 'Customer abandoned lay-away'):`,
                      'Abandoned lay-away (>90 days)'
                    );
                    if (reason !== null) {
                      onUpdateStatus(order.id, 'Cancelled', reason);
                    }
                  }}
                  className="h-7 px-1 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
