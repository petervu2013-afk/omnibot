import { useState } from 'react';
import { Link } from 'expo-router';
import { Text } from 'react-native';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, s } from '@/components/ui';
import { colors } from '@/theme';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Email không hợp lệ.');
    setError('');
    setSent(true);
  };
  return (
    <AuthShell
      title="Quên mật khẩu"
      subtitle="Nhập email đăng ký để nhận liên kết đặt lại mật khẩu"
      footer={
        <Link href="/login" style={{ color: colors.primary, fontWeight: '700' }}>
          Quay lại đăng nhập
        </Link>
      }
    >
      {sent ? (
        <>
          {/* Same message whether or not the email exists, so accounts can't be discovered. */}
          <Alert tone="info" text={`Nếu ${email} đã đăng ký, bạn sẽ nhận được email có liên kết đặt lại mật khẩu (hiệu lực 30 phút, dùng 1 lần). Liên kết mở thẳng vào app.`} />
          <Button title="Gửi lại" kind="secondary" onPress={() => setSent(false)} />
        </>
      ) : (
        <>
          <Field label="Email" icon="mail-outline" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" error={error} />
          <Button title="Gửi liên kết đặt lại" onPress={submit} />
          <Text style={s.mutedSm}>Bản mẫu chưa gửi email thật – sẽ hoạt động khi có backend.</Text>
        </>
      )}
    </AuthShell>
  );
}
