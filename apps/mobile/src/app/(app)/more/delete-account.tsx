// In-app account deletion: required by App Store guideline 5.1.1(v) and Google Play's account deletion policy.
import { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Alert, Button, Card, Field, Header, Icon, Screen, s } from '@/components/ui';
import { DEMO, useApp } from '@/lib/store';
import { colors, space } from '@/theme';

const CONFIRM = 'XOA';

export default function DeleteAccount() {
  const { signOut } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (password !== DEMO.password) return setError('Mật khẩu không đúng.');
    signOut('Yêu cầu xóa tài khoản đã được ghi nhận. Tài khoản sẽ bị xóa vĩnh viễn sau 30 ngày; đăng nhập lại trong thời gian này để hủy yêu cầu.');
    router.replace('/login');
  };

  return (
    <Screen padded={false}>
      <Header title="Xóa tài khoản" onBack={() => (router.canGoBack() ? router.back() : router.replace('/more/account'))} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Card style={{ gap: space.sm, borderTopWidth: 3, borderTopColor: colors.red }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="warning" size={22} color={colors.red} />
            <Text style={s.h2}>Điều gì sẽ xảy ra?</Text>
          </View>
          {[
            'Bạn bị đăng xuất khỏi mọi thiết bị ngay lập tức.',
            'Sau 30 ngày, hồ sơ, mật khẩu và thiết bị đăng nhập của bạn bị xóa vĩnh viễn.',
            'Hội thoại, đơn hàng thuộc cửa hàng được giữ lại cho chủ cửa hàng nhưng ẩn danh tên bạn.',
            'Hóa đơn, chứng từ kế toán được lưu theo thời hạn luật định.',
            'Nếu bạn là chủ sở hữu duy nhất, cần chuyển quyền chủ sở hữu trước trên web.',
          ].map((t) => (
            <Text key={t} style={s.text}>
              • {t}
            </Text>
          ))}
        </Card>
        {error ? <Alert text={error} /> : null}
        <Field
          label="Nhập mật khẩu để xác nhận"
          secure
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError('');
          }}
          textContentType="password"
        />
        <Field label={`Gõ "${CONFIRM}" để xác nhận`} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
        <Button title="Xóa vĩnh viễn tài khoản" kind="danger" icon="trash" disabled={!password || confirm.trim().toUpperCase() !== CONFIRM} onPress={submit} />
        <Button title="Hủy" kind="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
