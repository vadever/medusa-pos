import { StockLocationList } from '@/components/StockLocationList';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import React, { useState } from 'react';
import { View } from 'react-native';

interface StockLocationSelectionStepProps {
  onComplete: (stockLocationId: string) => void;
  initialValue?: string;
}

export const StockLocationSelectionStep: React.FC<StockLocationSelectionStepProps> = ({
  onComplete,
  initialValue = '',
}) => {
  const [selectedStockLocation, setSelectedStockLocation] = useState(initialValue);

  const handleStockLocationSelect = (stockLocationId: string) => {
    setSelectedStockLocation(stockLocationId);
  };

  return (
    <View className="flex-1 p-5">
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Select stock location</Text>
      <Text className="mb-6 text-gray-300">Select where inventory will be sourced from.</Text>

      <StockLocationList
        selectedStockLocationId={selectedStockLocation}
        onStockLocationSelect={handleStockLocationSelect}
      />

      <Button className="mt-6" onPress={() => onComplete(selectedStockLocation)} disabled={!selectedStockLocation}>
        Next
      </Button>
    </View>
  );
};
