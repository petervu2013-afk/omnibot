import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button, Card, ListRow, Section, s } from '@/components/ui';
import { customerOf, orderTotal, productOf, useApp } from '@/lib/store';
import type { OrderStatus } from '@/data/mock';
import { colors, money, space } from '@/theme';

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: string }> = {
  new: { label: 'Mới', color: colors.primary },
  confirmed: { label: 'Đã xác nhận', color: '#0891b2' },
  shipping: { label: 'Đang giao', color: colors.orange },
  done: { label: 'Hoàn thành', color: colors.green },
  cancelled: { label: 'Đã hủy', color: colors.red },
};
export const PAYMENT_LABEL = { cod: 'COD', paid: 'Đã thanh toán', unpaid: 'Chưa thanh toán' };

const NEXT: Partial<Record<OrderStatus, [OrderStatus, string]>> = {
  new: ['confirmed', 'Xác nhận đơn'],
  confirmed: ['shipping', 'Giao cho vận chuyển'],
  shipping: ['done', 'Đã giao thành công'],
};

export function OrderDetail({ id }: { id: string }) {
  const { orders, setOrderStatus } = useApp();
  const o = orders.find((x) => x.id === id);
  if (!o) return <Text style={[s.muted, { padding: space.lg }]}>Không tìm thấy đơn hàng.</Text>;
  const c = customerOf(o.customerId);
  const st = ORDER_STATUS[o.status];
  const next = NEXT[o.status];

  return (
    <View style={{ gap: space.md }}>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.h1}>#{o.id}</Text>
          <Badge text={st.label} color={st.color} />
        </View>
        <Text style={s.muted}>
          {new Date(o.createdAt).toLocaleString('vi-VN')} · {o.createdBy === 'ai' ? '✨ AI tự chốt' : 'Nhân viên tạo'}
        </Text>
        <Text style={[s.statValue, { color: colors.primary }]}>{money(orderTotal(o))}</Text>
        <Badge text={PAYMENT_LABEL[o.payment]} color={o.payment === 'unpaid' ? colors.red : colors.green} />
      </Card>

      <Section title="Khách hàng">
        <ListRow icon="person" title={c.name} subtitle={c.phone} onPress={() => router.push(`/tasks/customer/${c.id}`)} />
        <ListRow icon="location-outline" title={c.address || 'Chưa có địa chỉ – cần hỏi khách'} subtitle="Giao đến" />
      </Section>

      <Section title={`Sản phẩm (${o.items.length})`}>
        {o.items.map((it) => {
          const p = productOf(it.productId);
          return (
            <ListRow
              key={it.productId}
              icon="cube-outline"
              title={p.name}
              subtitle={`${p.sku} · ${money(p.price)} × ${it.qty}`}
              right={<Text style={{ fontWeight: '700' }}>{money(p.price * it.qty)}</Text>}
            />
          );
        })}
      </Section>

      {o.shipping && (
        <Section title="Vận chuyển">
          <ListRow icon="car-outline" title={`${o.shipping.carrier} · ${o.shipping.code}`} subtitle="Mã vận đơn" />
        </Section>
      )}

      <View style={{ gap: space.sm }}>
        {next && <Button title={next[1]} icon="checkmark-circle" onPress={() => setOrderStatus(o.id, next[0])} />}
        <Button title="Gọi khách" icon="call" kind="secondary" onPress={() => Linking.openURL(`tel:${c.phone}`)} />
        {(o.status === 'new' || o.status === 'confirmed') && <Button title="Hủy đơn" kind="ghost" onPress={() => setOrderStatus(o.id, 'cancelled')} />}
      </View>
    </View>
  );
}
