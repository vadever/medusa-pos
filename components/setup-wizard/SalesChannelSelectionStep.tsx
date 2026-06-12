import { SalesChannelList } from '@/components/SalesChannelList';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import React, { useState } from 'react';
import { View } from 'react-native';

interface SalesChannelSelectionStepProps {
  onComplete: (salesChannelId: string) => void;
  initialValue?: string;
}

export const SalesChannelSelectionStep: React.FC<SalesChannelSelectionStepProps> = ({
  onComplete,
  initialValue = '',
}) => {
  const [selectedSalesChannel, setSelectedSalesChannel] = useState(initialValue);

  const handleSalesChannelSelect = (salesChannelId: string) => {
    setSelectedSalesChannel(salesChannelId);
  };

  return (
    <View className="flex-1 p-5">
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Choose a sales channel</Text>
      <Text className="mb-6 text-gray-300">Select an existing sales channel from the list to proceed.</Text>

      <SalesChannelList selectedSalesChannelId={selectedSalesChannel} onSalesChannelSelect={handleSalesChannelSelect} />

      <Button onPress={() => onComplete(selectedSalesChannel)} disabled={!selectedSalesChannel} className="mt-6">
        Next
      </Button>
    </View>
  );
};
