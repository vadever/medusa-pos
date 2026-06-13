import { useMedusaSdk } from '@/contexts/auth';
import { useSettings } from '@/contexts/settings';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type CashCaptureResponse = { captured: boolean; newly_captured: boolean };
type FulfilOrderResponse = { fulfilled: boolean; already_fulfilled: boolean };
type FiscalReceiptResponse = { document: { id: string }; created: boolean; test_mode: boolean };
type ReceiptExistsResponse = { exists: boolean; document_id: string | null; number: string | null };
type InvoiceResponse = { document: { id: string; number: string } };

/**
 * Query whether a fiscal receipt (Beleg) already exists for the given order.
 * Use this to gate the "Create & email receipt" button across screen reopens.
 */
export const useReceiptExists = (orderId: string) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['orders', orderId, 'fiscal-receipt-exists'],
    queryFn: async () => {
      return sdk.client.fetch<ReceiptExistsResponse>(`/admin/orders/${orderId}/fiscal-receipt`);
    },
    enabled: !!orderId,
  });
};

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
 * Create a fiscal receipt for an order and (unless skipEmail is true) immediately email it.
 * Pass skipEmail=true for POS walk-in guest orders — the Beleg is still created and signed,
 * but the send step is skipped so no document lands at the noreply+pos-guest@agilo.com address.
 * Idempotent on the backend — safe to call if a receipt already exists.
 * The button that calls this MUST be disabled while isPending.
 */
export const useCreateAndEmailReceipt = (orderId: string, options?: { skipEmail?: boolean }) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  const skipEmail = options?.skipEmail ?? false;
  return useMutation({
    mutationKey: ['orders', orderId, 'create-and-email-receipt'],
    mutationFn: async () => {
      const receipt = await sdk.client.fetch<FiscalReceiptResponse>(`/admin/orders/${orderId}/fiscal-receipt`, {
        method: 'POST',
        body: { payment_method: 'cash' },
        headers: { 'Content-Type': 'application/json' },
      });
      // Only email when the receipt was newly created AND we have a real customer.
      // Skip if it already existed (backend is idempotent; created === false means receipt +
      // email already sent) OR if this is a POS walk-in guest order (skipEmail=true).
      if (receipt.created && !skipEmail) {
        await sdk.client.fetch<void>(`/admin/documents/${receipt.document.id}/send`, { method: 'POST' });
      }
      return { documentId: receipt.document.id, testMode: receipt.test_mode, emailSent: receipt.created && !skipEmail };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', 'order', orderId] });
      // Refetch receipt-exists so the button label flips to ✓ without a manual reload
      await queryClient.invalidateQueries({ queryKey: ['orders', orderId, 'fiscal-receipt-exists'] });
    },
    onError: (error: Error) => showErrorToast(error),
  });
};

/**
 * Orchestrated cash-register flow for the checkout success Dialog:
 *   cash-capture -> fulfil -> fiscal-receipt -> documents/:id/send (only when newly created).
 * Pass skipEmail=true for POS walk-in guest orders — the Beleg is still created and signed,
 * but the send step is skipped so no document lands at the noreply+pos-guest@agilo.com address.
 * The fulfil step decrements stock. If the backend returns already_fulfilled it is treated
 * as success and the flow continues; only a real HTTP error surfaces.
 * The button that calls this MUST be disabled while isPending — a concurrent
 * double-submit on a collection-less order could double-capture on the backend.
 */
export const useCashRegisterFlow = (
  orderId: string,
  options?: { skipEmail?: boolean; onSuccess?: (documentId: string, testMode: boolean, emailSent: boolean) => void; onError?: (error: Error) => void },
) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  const settings = useSettings();
  const skipEmail = options?.skipEmail ?? false;
  return useMutation({
    mutationKey: ['orders', orderId, 'cash-register-flow'],
    mutationFn: async () => {
      // Step 1: capture payment — stamp payment_method: cash so order metadata is set
      await sdk.client.fetch<CashCaptureResponse>(`/admin/orders/${orderId}/cash-capture`, {
        method: 'POST',
        body: { payment_method: 'cash' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Step 2: fulfil (stock decrement) — idempotent; already_fulfilled is not an error
      const locationId = settings.data?.stock_location?.id;
      if (!locationId) {
        throw new Error('No stock location configured — finish Setup first');
      }
      await sdk.client.fetch<FulfilOrderResponse>(`/admin/orders/${orderId}/fulfil`, {
        method: 'POST',
        body: { location_id: locationId },
        headers: { 'Content-Type': 'application/json' },
      });

      // Step 3: issue fiscal receipt (Beleg)
      const receipt = await sdk.client.fetch<FiscalReceiptResponse>(`/admin/orders/${orderId}/fiscal-receipt`, {
        method: 'POST',
        body: { payment_method: 'cash' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Step 4: email — only when receipt was newly created AND we have a real customer.
      // Skip if already existed (idempotent) OR if this is a POS walk-in guest (skipEmail=true).
      const emailSent = receipt.created && !skipEmail;
      if (emailSent) {
        await sdk.client.fetch<void>(`/admin/documents/${receipt.document.id}/send`, { method: 'POST' });
      }

      return { documentId: receipt.document.id, testMode: receipt.test_mode, emailSent };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', 'order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders', orderId, 'fiscal-receipt-exists'] });
    },
    onSuccess: (res) => options?.onSuccess?.(res.documentId, res.testMode, res.emailSent),
    onError: (error: Error) => { showErrorToast(error); options?.onError?.(error); },
  });
};

/**
 * Orchestrated bank-register flow for the checkout success Dialog:
 *   capture(bank) -> fulfil -> generate invoice -> send invoice.
 * Pass skipEmail=true for POS walk-in guest orders — the invoice is still generated,
 * but the send step is skipped so no document lands at the noreply+pos-guest@agilo.com address.
 * No Beleg is created — bank transfers are not subject to Austrian RKSV.
 * The button that calls this MUST be disabled while isPending.
 */
export const useBankRegisterFlow = (
  orderId: string,
  options?: { skipEmail?: boolean; onSuccess?: (documentId: string, emailSent: boolean) => void; onError?: (error: Error) => void },
) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  const settings = useSettings();
  const skipEmail = options?.skipEmail ?? false;
  return useMutation({
    mutationKey: ['orders', orderId, 'bank-register-flow'],
    mutationFn: async () => {
      // Step 1: capture payment — stamp payment_method: bank on order metadata
      await sdk.client.fetch<CashCaptureResponse>(`/admin/orders/${orderId}/cash-capture`, {
        method: 'POST',
        body: { payment_method: 'bank' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Step 2: fulfil (stock decrement) — idempotent; already_fulfilled is not an error
      const locationId = settings.data?.stock_location?.id;
      if (!locationId) {
        throw new Error('No stock location configured — finish Setup first');
      }
      await sdk.client.fetch<FulfilOrderResponse>(`/admin/orders/${orderId}/fulfil`, {
        method: 'POST',
        body: { location_id: locationId },
        headers: { 'Content-Type': 'application/json' },
      });

      // Step 3: generate the RG invoice document
      const invoice = await sdk.client.fetch<InvoiceResponse>(`/admin/orders/${orderId}/documents`, {
        method: 'POST',
        body: { type: 'invoice' },
        headers: { 'Content-Type': 'application/json' },
      });

      // Step 4: email the invoice PDF — skip for POS walk-in guests (skipEmail=true)
      if (!skipEmail) {
        await sdk.client.fetch<void>(`/admin/documents/${invoice.document.id}/send`, { method: 'POST' });
      }

      return { documentId: invoice.document.id, type: 'invoice' as const, emailSent: !skipEmail };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', 'order', orderId] });
    },
    onSuccess: (res) => options?.onSuccess?.(res.documentId, res.emailSent),
    onError: (error: Error) => { showErrorToast(error); options?.onError?.(error); },
  });
};

/**
 * Generate an RG invoice for an existing order and (unless skipEmail is true) email it.
 * Pass skipEmail=true for POS walk-in guest orders — the invoice is still generated,
 * but the send step is skipped so no document lands at the noreply+pos-guest@agilo.com address.
 * Use on the order-detail screen for bank orders (mirror of useCreateAndEmailReceipt for cash).
 * The button that calls this MUST be disabled while isPending.
 */
export const useCreateAndEmailInvoice = (orderId: string, options?: { skipEmail?: boolean }) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  const skipEmail = options?.skipEmail ?? false;
  return useMutation({
    mutationKey: ['orders', orderId, 'create-and-email-invoice'],
    mutationFn: async () => {
      const invoice = await sdk.client.fetch<InvoiceResponse>(`/admin/orders/${orderId}/documents`, {
        method: 'POST',
        body: { type: 'invoice' },
        headers: { 'Content-Type': 'application/json' },
      });
      // Skip the email send for POS walk-in guests
      if (!skipEmail) {
        await sdk.client.fetch<void>(`/admin/documents/${invoice.document.id}/send`, { method: 'POST' });
      }
      return { documentId: invoice.document.id, emailSent: !skipEmail };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders', 'order', orderId] });
    },
    onError: (error: Error) => showErrorToast(error),
  });
};
