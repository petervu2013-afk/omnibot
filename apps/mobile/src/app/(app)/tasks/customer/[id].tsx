import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { Avatar, Badge, Button, Card, Header, ListRow, Screen, Section, s } from '@/components/ui';
import { customerOf, orderTotal, useApp } from '@/lib/store';
import { useNow } from '@/lib/time';
import { colors, money, space, STAGE_STYLE, timeAgo } from '@/theme';

export default function CustomerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conversations, orders, tasks } = useApp();
  const now = useNow();
  const c = customerOf(id);
  if (!c) return null;
  const conv = conversations.find((v) => v.customerId === c.id);
  const myOrders = orders.filter((o) => o.customerId === c.id);
  const myTasks = tasks.filter((t) => t.customerId === c.id && !t.done);
  const stage = STAGE_STYLE[c.stage];
  const history = [
    ...(conv?.messages ?? []).map((m) => ({
      at: m.at,
      icon: m.from === 'customer' ? ('person' as const) : m.from === 'ai' ? ('sparkles' as const) : ('chatbubble' as const),
      text: m.text,
      who: m.from === 'customer' ? 'Khách' : m.from === 'ai' ? 'AI' : 'Nhân viên',
    })),
    ...myOrders.map((o) => ({ at: o.createdAt, icon: 'cart' as const, text: `Đơn #${o.id} · ${money(orderTotal(o))}`, who: o.createdBy === 'ai' ? 'AI chốt' : 'Nhân viên' })),
  ].sort((a, b) => b.at - a.at);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen edges={['top']} padded={false}>
        <Header title="Hồ sơ khách hàng" onBack={() => (router.canGoBack() ? router.back() : router.replace('/tasks'))} />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Card style={{ alignItems: 'center', gap: 6 }}>
            <Avatar name={c.name} size={64} />
            <Text style={s.h1}>{c.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {stage && <Badge text={stage.label} color={stage.color} />}
              {c.tags.map((t) => (
                <Badge key={t} text={t} color="#4338ca" />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 8, alignSelf: 'stretch' }}>
              <Button title="Gọi" icon="call" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${c.phone}`)} />
              {conv && <Button title="Nhắn tin" icon="chatbubbles" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/chats/${conv.id}`)} />}
              <Button title="Tạo đơn" icon="cart" kind="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/orders/new', params: { customerId: c.id } })} />
            </View>
          </Card>
          <Section title="Thông tin">
            <ListRow icon="call-outline" title={c.phone} subtitle="Số điện thoại" />
            <ListRow icon="location-outline" title={c.address || 'Chưa có địa chỉ'} subtitle="Địa chỉ giao hàng" />
            <ListRow icon="person-circle-outline" title={c.owner} subtitle="Sale phụ trách" />
            <ListRow icon="cash-outline" title={money(c.expectedValue)} subtitle="Giá trị cơ hội" />
            {c.source && <ListRow icon="megaphone-outline" title={c.source} subtitle="Nguồn quảng cáo" />}
          </Section>
          {myTasks.length > 0 && (
            <Section title={`Việc cần làm (${myTasks.length})`}>
              {myTasks.map((t) => (
                <ListRow key={t.id} icon={t.type === 'call' ? 'call' : 'chatbubble'} iconColor={t.due < now ? colors.red : colors.primary} title={t.title} subtitle={t.kind} />
              ))}
            </Section>
          )}
          <Section title="Lịch sử tương tác">
            {history.map((h, i) => (
              <ListRow
                key={i}
                icon={h.icon}
                iconColor={h.icon === 'sparkles' ? colors.purple : h.icon === 'cart' ? colors.green : colors.primary}
                title={h.text}
                subtitle={`${h.who} · ${timeAgo(h.at)} trước`}
              />
            ))}
          </Section>
        </View>
      </Screen>
    </View>
  );
}
