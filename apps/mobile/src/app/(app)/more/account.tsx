import { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Alert, Button, Field, Header, ListRow, Screen, Section, ToggleRow, s, type IconName } from '@/components/ui';
import { DEMO, useApp } from '@/lib/store';
import { colors, space, timeAgo } from '@/theme';

const DEVICE_ICON: Record<string, IconName> = { web: 'desktop-outline', android: 'logo-android', ios: 'phone-portrait-outline' };

export default function Account() {
  const { user, devices, revokeDevice, biometrics, setBiometrics } = useApp();
  const [pw, setPw] = useState({ old: '', next: '' });
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  if (!user) return null;

  const changePassword = () => {
    if (pw.old !== DEMO.password) return setMsg({ tone: 'error', text: 'Mật khẩu hiện tại không đúng.' });
    if (pw.next.length < 8 || !/[A-Z]/.test(pw.next) || !/\d/.test(pw.next)) return setMsg({ tone: 'error', text: 'Mật khẩu mới cần ≥ 8 ký tự, có chữ hoa và chữ số.' });
    setPw({ old: '', next: '' });
    setMsg({ tone: 'info', text: 'Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.' });
  };

  return (
    <Screen padded={false}>
      <Header title="Tài khoản & bảo mật" onBack={() => (router.canGoBack() ? router.back() : router.replace('/more'))} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Section title="Hồ sơ">
          <ListRow icon="person-outline" title={user.name} subtitle="Họ tên" />
          <ListRow icon="mail-outline" title={user.email} subtitle="Email đăng nhập" />
          <ListRow icon="storefront-outline" title={user.shop} subtitle={`Cửa hàng · vai trò ${user.role}`} />
        </Section>

        <Section title="Đăng nhập">
          <ToggleRow title="Mở khóa bằng Face ID / vân tay" subtitle="Lưu phiên đăng nhập an toàn trên thiết bị" value={biometrics} onChange={setBiometrics} />
        </Section>

        <Section title={`Thiết bị đang đăng nhập (${devices.length})`}>
          {devices.map((d) => (
            <ListRow
              key={d.id}
              icon={DEVICE_ICON[d.platform]}
              title={d.name}
              subtitle={d.current ? 'Thiết bị này · đang hoạt động' : `Hoạt động ${timeAgo(d.lastActive)} trước`}
              right={d.current ? undefined : <Button title="Đăng xuất" kind="ghost" onPress={() => revokeDevice(d.id)} style={{ minHeight: 36, paddingHorizontal: 8 }} />}
            />
          ))}
        </Section>

        <Section title="Đổi mật khẩu">
          <View style={{ padding: space.lg, gap: space.md }}>
            {msg && <Alert tone={msg.tone} text={msg.text} />}
            <Field label="Mật khẩu hiện tại" secure value={pw.old} onChangeText={(t) => setPw({ ...pw, old: t })} textContentType="password" />
            <Field label="Mật khẩu mới" secure value={pw.next} onChangeText={(t) => setPw({ ...pw, next: t })} textContentType="newPassword" hint="≥ 8 ký tự, có chữ hoa và chữ số" />
            <Button title="Cập nhật mật khẩu" disabled={!pw.old || !pw.next} onPress={changePassword} />
          </View>
        </Section>

        <Section title="Vùng nguy hiểm">
          <ListRow icon="trash-outline" danger title="Xóa tài khoản" subtitle="Xóa vĩnh viễn tài khoản và dữ liệu cá nhân" onPress={() => router.push('/more/delete-account')} />
        </Section>
        <Text style={[s.mutedSm, { color: colors.muted }]}>Bạn cũng có thể yêu cầu xóa tài khoản trên web: omnibot.vn/xoa-tai-khoan</Text>
      </View>
    </Screen>
  );
}
