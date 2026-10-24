import { useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Empty, Icon, Segmented, s } from '@/components/ui';
import { ORDER_STATUS, OrderDetail } from '@/components/order-detail';
import { customerOf, orderTotal, useApp } from '@/lib/store';
import { useLayout } from '@/lib/layout';
import { colors, money, space, timeAgo } from '@/theme';

type Filter = 'open' | 'shipping' | 'closed';

export default function Orders() {
  const { orders } = useApp();
  const { isTablet } = useLayout();
  const [filter, setFilter] = useState<Filter>('open');
  const [selected, setSelected] = useState<string | null>(orders[0]?.id ?? null);

  const list = orders.filter((o) =>
    filter === 'open' ? o.status === 'new' || o.status === 'confirmed' : filter === 'shipping' ? o.status === 'shipping' : o.status === 'done' || o.status === 'cancelled',
  );
  const open = (id: string) => (isTablet ? setSelected(id) : router.push(`/orders/${id}`));

  const listView = (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.md, gap: space.sm, backgroundColor: colors.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.h1}>Đơn hàng</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Tạo đơn" onPress={() => router.push('/orders/new')} style={st.add}>
            <Icon name="add" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>Tạo đơn</Text>
          </Pressable>
        </View>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            ['open', 'Cần xử lý'],
            ['shipping', 'Đang giao'],
            ['closed', 'Đã đóng'],
          ]}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(o) => o.id}
        ListEmptyComponent={<Empty icon="receipt-outline" text="Không có đơn hàng" />}
        renderItem={({ item: o }) => {
          const c = customerOf(o.customerId);
          const stt = ORDER_STATUS[o.status];
          return (
            <Pressable onPress={() => open(o.id)} style={({ pressed }) => [st.item, isTablet && selected === o.id && { backgroundColor: colors.primarySoft }, pressed && { opacity: 0.8 }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[s.text, { fontWeight: '700' }]}>#{o.id}</Text>
                  <Text style={[s.text, { fontWeight: '700', color: colors.primary }]}>{money(orderTotal(o))}</Text>
                </View>
                <Text style={s.muted} numberOfLines={1}>
                  {c.name} · {o.items.length} sản phẩm · {timeAgo(o.createdAt)} trước
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Badge text={stt.label} color={stt.color} />
                  {o.createdBy === 'ai' && <Badge text="✨ AI chốt" color={colors.purple} />}
                  {o.payment === 'unpaid' && <Badge text="Chưa TT" color={colors.red} />}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );

  if (!isTablet)
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.card }}>
        {listView}
      </SafeAreaView>
    );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <View style={{ width: 380, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, backgroundColor: colors.card }}>{listView}</View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg }}>
        {selected ? <OrderDetail id={selected} /> : <Empty icon="receipt-outline" text="Chọn một đơn hàng" />}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 12, minHeight: 36, borderRadius: 18 },
  item: { flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: 12, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
