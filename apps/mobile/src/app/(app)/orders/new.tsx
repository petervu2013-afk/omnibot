import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Button, Card, Header, Icon, Screen, Section, s } from '@/components/ui';
import { orderTotal, useApp } from '@/lib/store';
import { customers, products } from '@/data/mock';
import { colors, money, space } from '@/theme';

export default function NewOrder() {
  const params = useLocalSearchParams<{ customerId?: string }>();
  const { createOrder } = useApp();
  const [customerId, setCustomerId] = useState(params.customerId ?? '');
  const [qty, setQty] = useState<Record<string, number>>({});
  const items = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([productId, n]) => ({ productId, qty: n }));
  const change = (id: string, d: number, max: number) => setQty((q) => ({ ...q, [id]: Math.min(max, Math.max(0, (q[id] ?? 0) + d)) }));

  const submit = () => {
    const id = createOrder(customerId, items);
    router.replace(`/orders/${id}`);
  };

  return (
    <Screen padded={false}>
      <Header title="Tạo đơn hàng" onBack={() => (router.canGoBack() ? router.back() : router.replace('/orders'))} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Section title="1. Khách hàng">
          {customers.map((c) => (
            <Pressable key={c.id} onPress={() => setCustomerId(c.id)} style={[s.row, customerId === c.id && { backgroundColor: colors.primarySoft }]}>
              <Avatar name={c.name} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{c.name}</Text>
                <Text style={s.mutedSm}>{c.phone}</Text>
              </View>
              {customerId === c.id && <Icon name="checkmark-circle" size={22} color={colors.primary} />}
            </Pressable>
          ))}
        </Section>
        <Section title="2. Sản phẩm">
          {products.map((p) => {
            const stock = p.stock.main + p.stock.showroom;
            const n = qty[p.id] ?? 0;
            return (
              <View key={p.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{p.name}</Text>
                  <Text style={[s.mutedSm, stock === 0 && { color: colors.red }]}>
                    {money(p.price)} · {stock ? `còn ${stock}` : 'hết hàng'}
                  </Text>
                </View>
                <Pressable accessibilityLabel={`Bớt ${p.name}`} disabled={!n} onPress={() => change(p.id, -1, stock)} hitSlop={8}>
                  <Icon name="remove-circle-outline" size={28} color={n ? colors.primary : '#cbd5e1'} />
                </Pressable>
                <Text style={{ width: 24, textAlign: 'center', fontWeight: '700' }}>{n}</Text>
                <Pressable accessibilityLabel={`Thêm ${p.name}`} disabled={n >= stock} onPress={() => change(p.id, 1, stock)} hitSlop={8}>
                  <Icon name="add-circle" size={28} color={n < stock ? colors.primary : '#cbd5e1'} />
                </Pressable>
              </View>
            );
          })}
        </Section>
        <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.muted}>Tạm tính ({items.reduce((a, i) => a + i.qty, 0)} SP)</Text>
          <Text style={[s.h2, { color: colors.primary }]}>{money(orderTotal({ items }))}</Text>
        </Card>
        <Button title="Tạo đơn" icon="checkmark" disabled={!customerId || items.length === 0} onPress={submit} />
      </View>
    </Screen>
  );
}
