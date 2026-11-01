import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Empty, Header, Icon, Screen, Section, ToggleRow, s, type IconName } from '@/components/ui';
import { useApp } from '@/lib/store';
import type { Notification } from '@/data/mock';
import { colors, space, timeAgo } from '@/theme';

const KIND: Record<Notification['kind'], { icon: IconName; color: string; label: string }> = {
  message: { icon: 'chatbubble', color: colors.primary, label: 'Tin nhắn khách cần nhân viên' },
  lead: { icon: 'person-add', color: colors.green, label: 'Lead mới được giao' },
  task: { icon: 'alarm', color: colors.red, label: 'Việc bám đuổi đến hạn / quá hạn' },
  order: { icon: 'cart', color: colors.purple, label: 'Đơn hàng mới (AI chốt)' },
  stock: { icon: 'cube', color: colors.orange, label: 'Cảnh báo tồn kho' },
};

export default function Notifications() {
  const { notifications, readNotification, readAll, pushPrefs, setPushPref } = useApp();
  const open = (n: Notification) => {
    readNotification(n.id);
    if (n.link) router.push(n.link as Href);
  };

  return (
    <Screen padded={false}>
      <Header
        title="Thông báo"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/more'))}
        right={
          <Pressable onPress={readAll} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Đọc hết</Text>
          </Pressable>
        }
      />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Section>
          {notifications.length === 0 && <Empty icon="notifications-off-outline" text="Chưa có thông báo" />}
          {[...notifications]
            .sort((a, b) => b.at - a.at)
            .map((n) => {
              const k = KIND[n.kind];
              return (
                <Pressable key={n.id} onPress={() => open(n)} style={({ pressed }) => [s.row, { alignItems: 'flex-start' }, !n.read && { backgroundColor: '#f5f9ff' }, pressed && { opacity: 0.8 }]}>
                  <View style={[s.rowIcon, { backgroundColor: `${k.color}1a` }]}>
                    <Icon name={k.icon} size={18} color={k.color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.rowTitle, !n.read && { fontWeight: '700' }]}>{n.title}</Text>
                    <Text style={s.muted} numberOfLines={2}>
                      {n.body}
                    </Text>
                    <Text style={s.mutedSm}>{timeAgo(n.at)} trước</Text>
                  </View>
                  {!n.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 }} />}
                </Pressable>
              );
            })}
        </Section>
        <Section title="Nhận thông báo đẩy">
          {(Object.keys(KIND) as Notification['kind'][]).map((k) => (
            <ToggleRow key={k} title={KIND[k].label} value={!!pushPrefs[k]} onChange={(v) => setPushPref(k, v)} />
          ))}
        </Section>
        <Text style={s.mutedSm}>Ứng dụng chỉ xin quyền thông báo sau khi bạn đăng nhập và bật mục tương ứng (đúng quy định App Store / Google Play).</Text>
      </View>
    </Screen>
  );
}
