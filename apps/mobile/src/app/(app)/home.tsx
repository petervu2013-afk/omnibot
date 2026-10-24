import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Badge, Card, Icon, Screen, Section, Stat, ListRow, s } from '@/components/ui';
import { customerOf, useApp } from '@/lib/store';
import { useLayout } from '@/lib/layout';
import { useNow } from '@/lib/time';
import { kpis, risks } from '@/data/mock';
import { colors, compactMoney, money, STAGE_STYLE, space } from '@/theme';

export default function Home() {
  const { user, tasks, conversations, notifications } = useApp();
  const { isTablet } = useLayout();
  const now = useNow();
  const due = tasks.filter((t) => !t.done && t.due < now + 86400000);
  const overdue = tasks.filter((t) => !t.done && t.due < now).length;
  const unread = conversations.reduce((a, c) => a + c.unread, 0);
  const handoffs = conversations.filter((c) => c.handoff && !c.aiActive).length;
  const unreadNotif = notifications.filter((n) => !n.read).length;
  const progress = kpis.revenue / kpis.target;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text style={s.muted}>Xin chào,</Text>
          <Text style={s.h1}>{user?.name}</Text>
          <Text style={s.mutedSm}>
            {user?.shop} · {user?.role}
          </Text>
        </View>
        <Pressable accessibilityLabel="Thông báo" onPress={() => router.push('/more/notifications')} style={{ padding: 8 }}>
          <Icon name="notifications-outline" size={26} />
          {unreadNotif > 0 && <View style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red }} />}
        </Pressable>
      </View>

      <Card style={{ backgroundColor: colors.primary, gap: 8 }}>
        <Text style={{ color: '#dbe7ff', fontSize: 13 }}>Doanh thu 7 ngày</Text>
        <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800' }}>{money(kpis.revenue)}</Text>
        <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,.25)', borderRadius: 4 }}>
          <View style={{ width: `${Math.min(100, progress * 100)}%`, height: 8, backgroundColor: '#fff', borderRadius: 4 }} />
        </View>
        <Text style={{ color: '#dbe7ff', fontSize: 12 }}>
          {Math.round(progress * 100)}% mục tiêu {compactMoney(kpis.target)} · {kpis.orders} đơn · AI tự xử lý {Math.round(kpis.aiAutomation * 100)}% hội thoại
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <Stat label="Tin chưa đọc" value={String(unread)} sub={handoffs ? `${handoffs} cần nhân viên` : 'AI đang xử lý'} tone={handoffs ? 'bad' : undefined} />
        <Stat label="Việc quá hạn" value={String(overdue)} sub={`${due.length} việc trong 24h`} tone={overdue ? 'bad' : undefined} />
        {isTablet && <Stat label="Lead mới" value={String(kpis.newLeads)} sub={`${kpis.uncontacted} chưa liên hệ`} />}
        {isTablet && <Stat label="Quảng cáo" value={compactMoney(kpis.adSpend)} sub={`ROAS ${kpis.roas}`} tone="good" />}
      </View>

      <Section title="Cảnh báo sớm" action={<Badge text={`${risks.length}`} color={colors.red} />}>
        {risks.map((r) => {
          const c = customerOf(r.customerId);
          return (
            <ListRow
              key={r.customerId}
              icon="alert-circle"
              iconColor={colors.red}
              title={`${c.name} · ${money(c.expectedValue)}`}
              subtitle={`${STAGE_STYLE[c.stage]?.label} – ${r.reason}`}
              onPress={() => router.push(`/tasks/customer/${c.id}`)}
            />
          );
        })}
      </Section>

      <Section
        title="Việc cần làm hôm nay"
        action={
          <Pressable onPress={() => router.push('/tasks')}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Xem tất cả</Text>
          </Pressable>
        }
      >
        {due.slice(0, 4).map((t) => {
          const c = customerOf(t.customerId);
          const late = t.due < now;
          return (
            <ListRow
              key={t.id}
              icon={t.type === 'call' ? 'call' : 'chatbubble'}
              iconColor={late ? colors.red : colors.primary}
              title={t.title}
              subtitle={`${c.name} · ${late ? 'quá hạn' : 'đến hạn'} ${new Date(t.due).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}
              onPress={() => router.push(`/tasks/customer/${c.id}`)}
            />
          );
        })}
      </Section>

      <Section title="Hội thoại cần trả lời">
        {conversations
          .filter((c) => c.unread > 0)
          .map((v) => {
            const c = customerOf(v.customerId);
            return <ListRow key={v.id} title={c.name} subtitle={v.messages[v.messages.length - 1]?.text} right={<Avatar name={c.name} size={30} />} onPress={() => router.push(`/chats/${v.id}`)} />;
          })}
      </Section>
    </Screen>
  );
}
