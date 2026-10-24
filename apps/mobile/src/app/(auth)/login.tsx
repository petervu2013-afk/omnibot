import { useState } from 'react';
import { Link, router } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Button, Field, s } from '@/components/ui';
import { DEMO, useApp } from '@/lib/store';
import { colors } from '@/theme';

export default function Login() {
  const { signIn, notice } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Email không hợp lệ.');
    if (!password) return setError('Vui lòng nhập mật khẩu.');
    const err = signIn(email, password);
    if (err) return setError(err);
    router.replace('/home');
  };

  return (
    <AuthShell
      title="Đăng nhập"
      subtitle="Chào mừng bạn quay lại"
      footer={
        <Text style={s.muted}>
          Chưa có tài khoản?{' '}
          <Link href="/register" style={{ color: colors.primary, fontWeight: '700' }}>
            Đăng ký
          </Link>
        </Text>
      }
    >
      {notice ? <Alert tone="info" text={notice} /> : null}
      <Field label="Email" icon="mail-outline" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="username" placeholder="ban@congty.vn" />
      <Field
        label="Mật khẩu"
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="password"
        textContentType="password"
        placeholder="Mật khẩu"
        onSubmitEditing={submit}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Switch value={remember} onValueChange={setRemember} trackColor={{ true: colors.primary, false: '#d1d5db' }} />
          <Text style={s.muted}>Ghi nhớ đăng nhập</Text>
        </View>
        <Link href="/forgot" style={{ color: colors.primary, fontWeight: '600' }}>
          Quên mật khẩu?
        </Link>
      </View>
      {error ? <Alert text={error} /> : null}
      <Button title="Đăng nhập" onPress={submit} />
      <Pressable
        onPress={() => {
          setEmail(DEMO.email);
          setPassword(DEMO.password);
        }}
        style={{ padding: 10, borderRadius: 8, backgroundColor: '#f1f5f9' }}
      >
        <Text style={s.mutedSm}>
          Tài khoản demo: {DEMO.email} / {DEMO.password} – chạm để điền sẵn
        </Text>
      </Pressable>
    </AuthShell>
  );
}
