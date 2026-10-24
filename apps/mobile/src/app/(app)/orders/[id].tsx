import { router, useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/ui';
import { OrderDetail } from '@/components/order-detail';
import { View } from 'react-native';
import { space } from '@/theme';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen padded={false}>
      <Header title={`Đơn #${id}`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/orders'))} />
      <View style={{ padding: space.lg }}>
        <OrderDetail id={id} />
      </View>
    </Screen>
  );
}
