import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Avatar, Badge, Card, ListRow, Screen, Section, s } from '@/components/ui';
import { useApp } from '@/lib/store';
import { colors, space } from '@/theme';

export default function More() {
  const { user, notifications, signOut } = useApp();
  const unread = notifications.filter((n) => !n.read).length;
  if (!user) return null;

  return (
    <Screen>
      <Card onPress={() => router.push('/more/account')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={user.name} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.h2}>{user.name}</Text>
          <Text style={s.muted}>{user.email}</Text>
          <Badge text={`${user.role} · ${user.shop}`} color={colors.primary} />
        </View>
      </Card>
      <Section title="Vận hành">
        <ListRow icon="notifications" title="Thông báo" onPress={() => router.push('/more/notifications')} right={unread ? <Badge text={String(unread)} color="#fff" bg={colors.red} /> : undefined} />
        <ListRow icon="cube" iconColor={colors.orange} title="Kho & tồn kho" subtitle="Tra tồn theo kho, cảnh báo sắp hết" onPress={() => router.push('/more/inventory')} />
        <ListRow icon="barcode" iconColor="#0891b2" title="Quét mã vạch" subtitle="Tra nhanh sản phẩm bằng camera" onPress={() => router.push('/more/scan')} />
      </Section>
      <Section title="Tài khoản & bảo mật">
        <ListRow icon="shield-checkmark" iconColor={colors.green} title="Tài khoản, thiết bị & bảo mật" onPress={() => router.push('/more/account')} />
        <ListRow icon="document-text" iconColor={colors.muted} title="Điều khoản & chính sách bảo mật" onPress={() => router.push('/legal')} />
        <ListRow icon="help-buoy" iconColor={colors.purple} title="Hỗ trợ" subtitle="support@omnibot.vn" />
      </Section>
      <Section>
        <ListRow icon="log-out-outline" title="Đăng xuất" danger onPress={() => signOut()} />
      </Section>
      <Text style={[s.mutedSm, { textAlign: 'center' }]}>OmniBot 1.0.0 · Tính năng nâng cao (quảng cáo, báo cáo, cài đặt) dùng trên web</Text>
    </Screen>
  );
}
