import { useMedusaSdk } from '@/contexts/auth';
import { useSettings } from '@/contexts/settings';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type CashCaptureResponse = { captured: boolean; newly_captured: boolean };
type FulfilOrderResponse = { fulfilled: boolean; already_fulfilled: boolean };
type FiscalReceiptResponse = { document: { id: string }; created: boolean; test_mode: boolean };

/**
 * Capture cash payment for an order (idempotent — safe to call even if already captured).
 * The button that calls this MUST be disabled while isPending.
 */
export const useCashCapture = (orderId: string) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['orders', orderId, 'cash-capture'],
    mutationFn: async () => {
      return sdk.client.fetch<CashCaptureResponse>(`/admin/orders/${orderId}/cash-capture`, { method: 'POST' });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', 'order', orderId] });
    },
    onError: (error: Error) => showErrorToast(error),
  });
};

/**
 * Fulfil an order from the configured stock location.
 * Reads stock_location_id from settings; throws a clear error if not yet configured.
 * The button that calls this MUST be disabled while isPending.
 */
export const useFulfilOrder = (orderId: string) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  const settings = useSettings();
  return useMutation({
    mutationKey: ['orders', orderId, 'fulfil'],
    mutationFn: async () => {
      const locationId = settings.data?.stock_location?.id;
      if (!locationId) {
        throw new Error('No stock location configured — finish Setup first');
      }
      return sdk.client.fetch<FulfilOrderResponse>(`/admin/orders/${orderId}/fulfil`, {
        method: 'POST',
        body: { location_id: locationId },
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', 'order', orderId] });
    },
    onError: (error: Error) => showErrorToast(error),
  });
};

/**
 * Create a fiscal receipt for an order and immediately email it to the customer.
 * Idempotent on the backend — safe to call if a receipt already exists.
 * The button that calls this MUST be disabled while isPending.
 */
export const useCreateAndEmailReceipt = (orderId: string) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['orders', orderId, 'create-and-email-receipt'],
    mutationFn: async () => {
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
    onError: (error: Error) => showErrorToast(error),
  });
};

/**
 * Orchestrated cash-register flow for the checkout success Dialog:
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
