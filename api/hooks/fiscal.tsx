import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type CashCaptureResponse = { captured: boolean; newly_captured: boolean };
type FiscalReceiptResponse = { document: { id: string }; created: boolean; test_mode: boolean };

/**
 * Orchestrated cash-register flow for an order:
 *   cash-capture -> fiscal-receipt -> documents/:id/send (email the Beleg).
 * The button that calls this MUST be disabled while isPending — a concurrent
 * double-submit on a collection-less order could double-capture on the backend.
 */
export const useCashRegisterFlow = (
  orderId: string,
  options?: { onSuccess?: (documentId: string, testMode: boolean) => void; onError?: (error: Error) => void },
) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['orders', orderId, 'cash-register-flow'],
    mutationFn: async () => {
      await sdk.client.fetch<CashCaptureResponse>(`/admin/orders/${orderId}/cash-capture`, { method: 'POST' });
      const receipt = await sdk.client.fetch<FiscalReceiptResponse>(`/admin/orders/${orderId}/fiscal-receipt`, {
        method: 'POST',
        body: { payment_method: 'cash' },
        headers: { 'Content-Type': 'application/json' },
      });
      await sdk.client.fetch<void>(`/admin/documents/${receipt.document.id}/send`, { method: 'POST' });
      return { documentId: receipt.document.id, testMode: receipt.test_mode };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', 'order', orderId] });
    },
    onSuccess: (res) => options?.onSuccess?.(res.documentId, res.testMode),
    onError: (error: Error) => { showErrorToast(error); options?.onError?.(error); },
  });
};
