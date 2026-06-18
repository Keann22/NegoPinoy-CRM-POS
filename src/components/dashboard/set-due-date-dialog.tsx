'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addMonths } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupabase } from "@/lib/supabase/hooks";
import { useToast } from "@/hooks/use-toast";

interface SetDueDateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    onSuccess?: () => void;
}

export function SetDueDateDialog({ open, onOpenChange, orderId, onSuccess }: SetDueDateDialogProps) {
    const [date, setDate] = useState<Date | undefined>(addMonths(new Date(), 1));
    const [isSaving, setIsSaving] = useState(false);
    const supabase = useSupabase();
    const { toast } = useToast();

    const handleSave = async () => {
        if (!date) return;
        if (!supabase) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('orders')
                .update({ next_due_date: date.toISOString(), status: 'Completed' })
                .eq('id', orderId);

            if (error) throw error;

            toast({
                title: "Status Updated",
                description: "The order is now Completed and the next due date is set.",
            });
            onOpenChange(false);
            if (onSuccess) {
                onSuccess();
            }
        } catch (error: any) {
            console.error("Failed to set due date:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not set the due date. Please try again.",
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Set Next Due Date</DialogTitle>
                    <DialogDescription>
                        You are marking this order as Completed. When is the first payment due?
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 flex flex-col space-y-4">
                    <p className="text-sm font-medium">Select Due Date:</p>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? format(date, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={setDate}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={!date || isSaving}>
                        {isSaving ? "Saving..." : "Save Due Date"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
