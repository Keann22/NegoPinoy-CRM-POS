'use client';

import { Control, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { type OrderFormValues, type Customer } from '@/lib/schemas/order';
import { FormField, FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload } from '@/components/ui/file-upload';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CalendarIcon, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface OrderLeftPanelProps {
  control: Control<OrderFormValues>;
  watch: UseFormWatch<OrderFormValues>;
  setValue: UseFormSetValue<OrderFormValues>;
  isEditing: boolean;
  selectedCustomer: Customer | null;
  onClearCustomer: () => void;
  customerSearch: string;
  onCustomerSearchChange: (value: string) => void;
  customerResults: Customer[];
  isSearchingCustomers: boolean;
  onCustomerSelect: (customer: Customer) => void;
  onAddCustomerClick: () => void;
  totalAmount: number;
  overpaymentApplied: number;
}

export function OrderLeftPanel({
  control,
  watch,
  isEditing,
  selectedCustomer,
  onClearCustomer,
  customerSearch,
  onCustomerSearchChange,
  customerResults,
  isSearchingCustomers,
  onCustomerSelect,
  onAddCustomerClick,
}: OrderLeftPanelProps) {
  const paymentType = watch('paymentType');
  const amountPaid = watch('amountPaid');
  const isDownpaymentCOD = watch('isDownpaymentCOD');

  return (
    <div className="md:col-span-1 space-y-4">
      {/* Customer selector */}
      <FormField
        control={control}
        name="customerId"
        render={() => (
          <FormItem className="flex flex-col">
            <FormLabel>Customer</FormLabel>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-md border border-input bg-background p-2 text-sm h-10">
                <p>{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                <Button type="button" variant="ghost" size="sm" onClick={onClearCustomer}>Change</Button>
              </div>
            ) : (
              <Command className="rounded-lg border h-auto" shouldFilter={false}>
                <CommandInput
                  placeholder="Search customers by first name..."
                  value={customerSearch}
                  onValueChange={onCustomerSearchChange}
                />
                {customerSearch.length > 0 && (
                  <CommandList>
                    {isSearchingCustomers && <CommandItem disabled>Searching...</CommandItem>}
                    {customerResults.length > 0 && (
                      <CommandGroup>
                        {customerResults.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.firstName} ${c.lastName}`.toLowerCase()}
                            onSelect={() => onCustomerSelect(c)}
                          >
                            {c.firstName} {c.lastName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {customerSearch.length > 0 && !isSearchingCustomers && (
                      <CommandGroup>
                        <CommandItem
                          value={(customerSearch + ' add_new').toLowerCase()}
                          onSelect={onAddCustomerClick}
                          className="text-primary font-medium cursor-pointer"
                        >
                          <PlusCircle className="mr-2 h-4 w-4" /> Add new customer &quot;{customerSearch}&quot;
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {!isSearchingCustomers && customerResults.length === 0 && customerSearch.length > 1 && <CommandEmpty>No customers found.</CommandEmpty>}
                  </CommandList>
                )}
              </Command>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Order date */}
      <FormField
        control={control}
        name="orderDate"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Order Date</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                    {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Payment type */}
      <FormField
        control={control}
        name="paymentType"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormLabel>Payment Type</FormLabel>
            <FormControl>
              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                {['Full Payment', 'Lay-away', 'Installment', 'COD', 'Pending'].map((pt) => (
                  <FormItem key={pt} className="flex items-center space-x-3 space-y-0">
                    <FormControl><RadioGroupItem value={pt} /></FormControl>
                    <FormLabel className="font-normal">{pt === 'Lay-away' ? 'Lay-away (Hulugan)' : pt === 'COD' ? 'Cash on Delivery (COD)' : pt === 'Pending' ? 'Pending / Undecided' : pt}</FormLabel>
                  </FormItem>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Installment fields */}
      {paymentType === 'Installment' && (
        <div className="grid grid-cols-2 gap-4">
          <FormField control={control} name="installmentMonths" render={({ field }) => (
            <FormItem><FormLabel>Installment Months</FormLabel><FormControl><Input type="number" placeholder="e.g., 3" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={control} name="monthlyPayment" render={({ field }) => (
            <FormItem><FormLabel>Monthly Payment (₱)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
          )} />
        </div>
      )}

      {/* First-timer installment checkbox */}
      {paymentType === 'Installment' && (
        <div className="flex items-start space-x-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
          <FormField control={control} name="isInstallmentFirstTimer" render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="text-amber-800 dark:text-amber-300 font-semibold">First-time installment customer</FormLabel>
                <p className="text-xs text-amber-700 dark:text-amber-400">Check this to apply the higher installment prices to eligible products when adding them below.</p>
              </div>
            </FormItem>
          )} />
        </div>
      )}

      {/* Downpayment + COD flag */}
      {paymentType !== 'Full Payment' && paymentType !== 'COD' && paymentType !== 'Pending' && (
        <div className="space-y-4">
          <FormField control={control} name="amountPaid" render={({ field }) => (
            <FormItem>
              <FormLabel>Downpayment (₱)</FormLabel>
              <FormControl><Input type="number" step="0.01" placeholder="0.00" disabled={isEditing} {...field} /></FormControl>
              {isEditing && <p className="text-xs text-muted-foreground mt-1">Amount Paid is managed through the Payment History log after order creation.</p>}
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={control} name="isDownpaymentCOD" render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Downpayment is Pending (To Be Collected)</FormLabel>
                <p className="text-xs text-muted-foreground">Check this if you are waiting for the customer to send the payment or if it will be collected on delivery.</p>
              </div>
            </FormItem>
          )} />
        </div>
      )}

      {/* Proof of payment */}
      {!isEditing && (paymentType === 'Full Payment' || (amountPaid !== undefined && amountPaid! > 0 && !isDownpaymentCOD)) && (
        <FormField control={control} name="proofOfPayment" render={({ field }) => (
          <FormItem>
            <FormLabel>Proof of Payment <span className="text-destructive">*</span></FormLabel>
            <FormControl><FileUpload value={field.value} onChange={field.onChange} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      )}
    </div>
  );
}
