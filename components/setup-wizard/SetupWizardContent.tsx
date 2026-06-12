import { useUpdateSettings } from '@/contexts/settings';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from '../KeyboardAvoidingView';
import { RegionSelectionStep } from './RegionSelectionStep';
import { SalesChannelSelectionStep } from './SalesChannelSelectionStep';
import { StockLocationSelectionStep } from './StockLocationSelectionStep';
import { WelcomeStep } from './WelcomeStep';

// Staff can only SELECT existing channels/regions/locations — no creation flow.
type SetupStep = 'sales-channel-selection' | 'region-selection' | 'stock-location-selection' | 'welcome';

export const SetupWizardContent: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<SetupStep>('sales-channel-selection');
  const [salesChannelId, setSalesChannelId] = useState<string>('');
  const [regionId, setRegionId] = useState<string>('');
  const [stockLocationId, setStockLocationId] = useState<string>('');

  const updateSettings = useUpdateSettings({
    onSuccess: () => {
      router.replace('/(tabs)/products');
    },
  });

  const handleSalesChannelComplete = (id: string) => {
    setSalesChannelId(id);
    setCurrentStep('region-selection');
  };

  const handleRegionComplete = (id: string) => {
    setRegionId(id);
    setCurrentStep('stock-location-selection');
  };

  const handleStockLocationComplete = (id: string) => {
    setStockLocationId(id);
    setCurrentStep('welcome');
  };

  const handleWelcomeComplete = async () => {
    updateSettings.mutate({
      sales_channel_id: salesChannelId,
      region_id: regionId,
      stock_location_id: stockLocationId,
    });
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'sales-channel-selection':
        return (
          <SalesChannelSelectionStep
            onComplete={handleSalesChannelComplete}
            initialValue={salesChannelId}
          />
        );
      case 'region-selection':
        return (
          <RegionSelectionStep
            onComplete={handleRegionComplete}
            initialValue={regionId}
          />
        );
      case 'stock-location-selection':
        return (
          <StockLocationSelectionStep
            onComplete={handleStockLocationComplete}
            initialValue={stockLocationId}
          />
        );
      case 'welcome':
        return <WelcomeStep onComplete={handleWelcomeComplete} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1">{renderCurrentStep()}</KeyboardAvoidingView>
    </SafeAreaView>
  );
};
