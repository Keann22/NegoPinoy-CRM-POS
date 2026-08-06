import { useState } from 'react';
import { useSupabase } from '@/lib/supabase/hooks';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePickerScanner } from './picker/usePickerScanner';
import { usePickerData } from './picker/usePickerData';

export function usePicker() {
  const supabase = useSupabase();
  const { toast } = useToast();
  const { userProfile } = useUserProfile();
  
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);

  const {
    orderDetails,
    orderItems,
    pickGroups,
    outOfStockQty,
    qtyDrafts,
    loading,
    viewingPhotoItem,
    setViewingPhotoItem,
    handleScanSuccess,
    toggleOutOfStock,
    handleQtyDraftChange,
    commitOutOfStockQty,
    handleSubmitPicking
  } = usePickerData(
    supabase,
    toast,
    userProfile,
    setScannedOrderId,
    scannedOrderId
  );

  const {
    scanner,
    scanning,
    startScanner,
    stopScanner
  } = usePickerScanner(handleScanSuccess);

  return {
    scanner,
    scanning,
    scannedOrderId,
    setScannedOrderId,
    orderDetails,
    orderItems,
    pickGroups,
    outOfStockQty,
    qtyDrafts,
    loading,
    viewingPhotoItem,
    setViewingPhotoItem,
    startScanner,
    stopScanner,
    toggleOutOfStock,
    handleQtyDraftChange,
    commitOutOfStockQty,
    handleSubmitPicking
  };
}
