import { RegionList } from '@/components/RegionList';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import React, { useState } from 'react';
import { View } from 'react-native';

interface RegionSelectionStepProps {
  onComplete: (regionId: string) => void;
  initialValue?: string;
}

export const RegionSelectionStep: React.FC<RegionSelectionStepProps> = ({
  onComplete,
  initialValue = '',
}) => {
  const [selectedRegion, setSelectedRegion] = useState(initialValue);

  const handleRegionSelect = (regionId: string) => {
    setSelectedRegion(regionId);
  };

  return (
    <View className="flex-1 p-5">
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Choose a region</Text>
      <Text className="mb-6 text-gray-300">
        Select a region that defines your market area, currency, and tax settings.
      </Text>

      <RegionList selectedRegionId={selectedRegion} onRegionSelect={handleRegionSelect} />

      <Button className="mt-6" onPress={() => onComplete(selectedRegion)} disabled={!selectedRegion}>
        Next
      </Button>
    </View>
  );
};
