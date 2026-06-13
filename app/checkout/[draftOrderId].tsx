import {
  DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL,
  useCompleteDraftOrder,
  useCurrentDraftOrder,
  useDraftOrderOrOrder,
} from '@/api/hooks/draft-orders';
import { useBankRegisterFlow, useCashRegisterFlow } from '@/api/hooks/fiscal';
import { ShoppingCart } from '@/components/icons/shopping-cart';
import { InfoBanner } from '@/components/InfoBanner';
import { CheckoutSkeleton } from '@/components/skeletons/CheckoutSkeleton';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { formatDate } from '@/utils/date';
import { AdminOrderLineItem } from '@medusajs/types';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import React from 'react';
import { Image, View } from 'react-native';

const DraftOrderItem: React.FC<{ item: AdminOrderLineItem }> = ({ item }) => {
  const settings = useSettings();
  const draftOrder = useCurrentDraftOrder();
  const thumbnail = item.thumbnail || item.product?.thumbnail || item.product?.images?.[0]?.url;

  return (
    <View className="flex-row gap-4 bg-white py-6">
      <View className="h-[5.25rem] w-[5.25rem] overflow-hidden rounded-xl bg-gray-200">
        {thumbnail && <Image source={{ uri: thumbnail }} className="h-full w-full object-cover" />}
      </View>
      <View className="flex-1 flex-col gap-2">
        <Text>{item.product_title}</Text>
        {item.variant && item.variant.options && item.variant.options.length > 0 && (
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            {item.variant.options.map((option) => (
              <View className="flex-row gap-1" key={option.id}>
                <Text className="text-sm text-gray-400">{option.option?.title || option.option_id}:</Text>
                <Text className="text-sm">{option.value}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Text className="ml-auto">
        {item.unit_price.toLocaleString('en-US', {
          style: 'currency',
          currency: draftOrder.data?.draft_order.region?.currency_code || settings.data?.region?.currency_code,
          currencyDisplay: 'narrowSymbol',
        })}
      </Text>
    </View>
  );
};

export default function CheckoutScreen() {
  const pathName = usePathname();
  const { draftOrderId } = useLocalSearchParams<{ draftOrderId: string }>();
  const settings = useSettings();
  const draftOrder = useDraftOrderOrOrder(draftOrderId);
  const completeOrder = useCompleteDraftOrder(draftOrderId);
  // Derive guest status early so we can pass skipEmail to the flow hooks unconditionally
  // (hooks must be called before any conditional returns). Defaults to true (guest) when
  // data is not yet loaded — safe because the payment buttons are disabled while loading.
  const earlyCustomerEmail = draftOrder.data?.customer?.email;
  const isPosDefaultCustomer = !earlyCustomerEmail || earlyCustomerEmail === DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL;
  const cashRegister = useCashRegisterFlow(draftOrderId, { skipEmail: isPosDefaultCustomer });
  const bankRegister = useBankRegisterFlow(draftOrderId, { skipEmail: isPosDefaultCustomer });
  const [selectedMethod, setSelectedMethod] = React.useState<'cash' | 'bank' | null>(null);

  const renderItem = React.useCallback<ListRenderItem<AdminOrderLineItem>>(
    ({ item }) => <DraftOrderItem item={item} />,
    [],
  );

  const items = draftOrder.data?.items || [];

  if (draftOrder.isLoading || settings.isLoading) {
    return <CheckoutSkeleton />;
  }

  if (draftOrder.isError || settings.isError) {
    return (
      <Layout>
        <Text className="text-4xl">Checkout</Text>
        <View className="flex-1 items-center justify-center gap-2">
          <InfoBanner variant="ghost" colorScheme="error" className="w-40">
            Failed to load cart
          </InfoBanner>
          <Button
            onPress={() => {
              draftOrder.refetch();
              settings.refetch();
            }}
            isPending={draftOrder.isRefetching || settings.isRefetching}
            variant="outline"
          >
            Try Again
          </Button>
        </View>
      </Layout>
    );
  }

  if (!draftOrder.data?.items.length) {
    return (
      <Layout>
        <Text className="text-4xl">Checkout</Text>
        <View className="flex-1 items-center justify-center gap-1">
          <ShoppingCart size={24} />
          <Text className="text-xl">Your cart is empty</Text>
          <Text className="text-center text-gray-300">
            It seems you have no items in your cart.{'\n'}Please add items to your cart before{'\n'}proceeding to
            checkout.
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onPress={() => router.back()}>
            Back to Cart
          </Button>
          <Button className="flex-1" disabled>
            Complete Order
          </Button>
        </View>
      </Layout>
    );
  }

  const isDraftOrder = draftOrder.data.status === 'draft';
  const customerEmail = draftOrder.data.customer?.email;
  const customerName = [draftOrder.data.customer?.first_name, draftOrder.data.customer?.last_name]
    .filter(Boolean)
    .join(' ');
  const customerPhone = draftOrder.data.customer?.phone;
  // isPosDefaultCustomer was derived before the hooks above; customerEmail is re-derived here
  // for the conditional rendering below — value is the same.

  return (
    <>
      <Layout>
        <Text className="mb-6 text-4xl">Checkout</Text>

        <FlashList
          data={items}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View className="h-hairline bg-gray-200" />}
          ListHeaderComponent={() => <Text className="text-2xl">Cart Items</Text>}
          ListFooterComponent={() =>
            !isPosDefaultCustomer ? (
              <View className="mb-10 mt-4">
                <Text className="mb-6 text-2xl">Information</Text>

                {customerName && (
                  <View className="mb-4 flex-row">
                    <Text className="w-24 text-gray-300">Full Name</Text>
                    <View className="flex-1">
                      <Text>{customerName}</Text>
                    </View>
                  </View>
                )}
                <View className="mb-4 flex-row">
                  <Text className="w-24 text-gray-300">E-Mail</Text>
                  <View className="flex-1">
                    <Text>{customerEmail}</Text>
                  </View>
                </View>
                {customerPhone && (
                  <View className="flex-row">
                    <Text className="w-24 text-gray-300">Phone</Text>
                    <View className="flex-1">
                      <Text>{customerPhone}</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : null
          }
          keyboardDismissMode="on-drag"
        />

        <View className="mb-6 gap-y-2 border-y border-gray-200 py-4">
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-400">Taxes</Text>
            <Text className="text-sm text-gray-400">
              {draftOrder.data.tax_total?.toLocaleString('en-US', {
                style: 'currency',
                currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-400">Subtotal</Text>
            <Text className="text-sm text-gray-400">
              {draftOrder.data.subtotal?.toLocaleString('en-US', {
                style: 'currency',
                currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
          {typeof draftOrder.data.discount_total === 'number' && draftOrder.data.discount_total > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-400">Discount</Text>
              <Text className="text-sm text-gray-400">
                {(draftOrder.data.discount_total * -1)?.toLocaleString('en-US', {
                  style: 'currency',
                  currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
                  currencyDisplay: 'narrowSymbol',
                })}
              </Text>
            </View>
          )}
        </View>

        <View className="mb-6 flex-row justify-between">
          <Text className="text-lg">Total</Text>
          <Text className="text-lg">
            {draftOrder.data.total?.toLocaleString('en-US', {
              style: 'currency',
              currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
              currencyDisplay: 'narrowSymbol',
            })}
          </Text>
        </View>

        <View className="pb-safe flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => router.back()}
            disabled={!isDraftOrder || completeOrder.isPending}
          >
            Back to Cart
          </Button>
          <Button
            className="flex-1"
            onPress={() => completeOrder.mutate()}
            disabled={!isDraftOrder}
            isPending={completeOrder.isPending}
          >
            Complete Order
          </Button>
        </View>
      </Layout>

      <Dialog
        visible={!isDraftOrder && pathName === `/checkout/${draftOrderId}`}
        showCloseButton={false}
        dismissOnOverlayPress={false}
        onRequestClose={(event) => {
          event.preventDefault();
        }}
        onOverlayPress={(event) => {
          event.preventDefault();
        }}
        onCloseIconPress={(event) => {
          event.preventDefault();
        }}
        title="Order confirmed!"
        contentClassName="flex-shrink"
      >
        <InfoBanner colorScheme="success" className="mb-4">
          The order has been placed successfully. You can track the order status on Orders screen.
        </InfoBanner>

        <Button
          className="mb-2"
          onPress={() => {
            router.replace('/orders');
            router.push({
              pathname: '/orders/[orderId]',
              params: {
                orderId: draftOrderId,
                orderNumber: draftOrder.data.display_id,
                orderDate: formatDate(draftOrder.data.created_at),
              },
            });
          }}
        >
          View Order
        </Button>

        {/* Payment method selection — choose before confirming */}
        {!cashRegister.isSuccess && !bankRegister.isSuccess && (
          <View className="mb-2 flex-row gap-2">
            <Button
              className="flex-1"
              variant={selectedMethod === 'cash' ? 'solid' : 'outline'}
              onPress={() => setSelectedMethod('cash')}
              disabled={cashRegister.isPending || bankRegister.isPending}
            >
              Cash
            </Button>
            <Button
              className="flex-1"
              variant={selectedMethod === 'bank' ? 'solid' : 'outline'}
              onPress={() => setSelectedMethod('bank')}
              disabled={cashRegister.isPending || bankRegister.isPending}
            >
              Bank
            </Button>
          </View>
        )}

        <Button
          className="mb-2"
          onPress={() => {
            if (selectedMethod === 'bank') {
              bankRegister.mutate();
            } else {
              cashRegister.mutate();
            }
          }}
          disabled={
            selectedMethod === null ||
            cashRegister.isPending ||
            bankRegister.isPending ||
            cashRegister.isSuccess ||
            bankRegister.isSuccess
          }
          isPending={cashRegister.isPending || bankRegister.isPending}
        >
          {cashRegister.isSuccess || bankRegister.isSuccess
            ? selectedMethod === 'bank'
              ? bankRegister.data?.emailSent
                ? 'Invoice sent ✓'
                : 'Invoice created (walk-in — not emailed) ✓'
              : cashRegister.data?.emailSent
                ? 'Receipt sent ✓'
                : 'Receipt created (walk-in — not emailed) ✓'
            : selectedMethod === 'bank'
              ? isPosDefaultCustomer
                ? 'Record bank payment & create invoice'
                : 'Record bank payment & email invoice'
              : isPosDefaultCustomer
                ? 'Take cash & create receipt'
                : 'Take cash & send receipt'}
        </Button>

        <Button
          variant="outline"
          onPress={() => {
            router.replace('/products');
          }}
        >
          Back to shop
        </Button>
      </Dialog>
    </>
  );
}
