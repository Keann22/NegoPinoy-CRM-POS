import { useEffect, useRef, useState } from 'react';
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
    foundKeys,
    productMemories,
    loading,
    viewingPhotoItem,
    setViewingPhotoItem,
    handleScanSuccess,
    markFound,
    markOutOfStock,
    unmarkedRows,
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
    cameraError,
    startScanner,
    stopScanner
  } = usePickerScanner(handleScanSuccess);

  // Allow deep-linking into the normal Picker workflow via /dashboard/pick?order=<id>.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!supabase || autoLoadedRef.current || typeof window === 'undefined') return;
    const orderParam = new URLSearchParams(window.location.search).get('order')?.trim();
    if (!orderParam) return;
    autoLoadedRef.current = true;
    void handleScanSuccess(orderParam);
  }, [supabase, handleScanSuccess]);

  return {
    scanner,
    scanning,
    cameraError,
    scannedOrderId,
    setScannedOrderId,
    orderDetails,
    orderItems,
    pickGroups,
    outOfStockQty,
    qtyDrafts,
    foundKeys,
    productMemories,
    loading,
    viewingPhotoItem,
    setViewingPhotoItem,
    startScanner,
    stopScanner,
    markFound,
    markOutOfStock,
    unmarkedRows,
    handleQtyDraftChange,
    commitOutOfStockQty,
    handleSubmitPicking
  };
}
