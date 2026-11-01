import { useState } from 'react';
import { Link, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { AuthShell } from '@/components/auth-shell';
import { Button, Field, Icon, s } from '@/components/ui';
import { useApp } from '@/lib/store';
import { colors } from '@/theme';

function issues(pw: string) {
  const out: string[] = [];
  if (pw.length < 8) out.push('ít nhất 8 ký tự');
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) out.push('có cả chữ và số');
  return out;
}

export default function Register() {
  const { register } = useApp();
  const [f, setF] = useState({ name: '', email: '', phone: '', shop: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const errors = {
    name: !f.name.trim() && 'Nhập họ tên',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim()) && 'Email không hợp lệ',
    phone: !!f.phone && !/^(0|\+84)\d{9}$/.test(f.phone.replace(/\s/g, '')) && 'Số điện thoại không hợp lệ',
    shop: !f.shop.trim() && 'Nhập tên cửa hàng',
    password: issues(f.password).length > 0 && `Mật khẩu cần ${issues(f.password).join(', ')}`,
    confirm: f.confirm !== f.password && 'Mật khẩu nhập lại không khớp',
  };
  const show = (k: keyof typeof errors) => (touched ? errors[k] : false);

  const submit = () => {
    setTouched(true);
    if (Object.values(errors).some(Boolean) || !agree) return;
    register(f.name.trim(), f.email.trim().toLowerCase(), f.shop.trim());
    router.replace('/home');
  };

  return (
    <AuthShell
      title="Tạo tài khoản chủ shop"
      subtitle="Nhân viên sẽ được bạn mời vào sau"
      footer={
        <Text style={s.muted}>
          Đã có tài khoản?{' '}
          <Link href="/login" style={{ color: colors.primary, fontWeight: '700' }}>
            Đăng nhập
          </Link>
        </Text>
      }
    >
      <Field label="Họ và tên" icon="person-outline" value={f.name} onChangeText={set('name')} autoCapitalize="words" autoComplete="name" error={show('name')} />
      <Field label="Email" icon="mail-outline" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoComplete="email" error={show('email')} />
      <Field label="Số điện thoại (không bắt buộc)" icon="call-outline" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" error={show('phone')} />
      <Field label="Tên cửa hàng" icon="storefront-outline" value={f.shop} onChangeText={set('shop')} autoCapitalize="words" error={show('shop')} />
      <Field
        label="Mật khẩu"
        icon="lock-closed-outline"
        value={f.password}
        onChangeText={set('password')}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        error={show('password')}
        hint="Ít nhất 8 ký tự, có cả chữ và số"
      />
      <Field label="Nhập lại mật khẩu" icon="lock-closed-outline" value={f.confirm} onChangeText={set('confirm')} secure autoComplete="new-password" error={show('confirm')} />
      <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}>
        <Icon name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? colors.primary : colors.muted} />
        <Text style={[s.muted, { flex: 1 }]}>
          Tôi đồng ý với{' '}
          <Link href="/legal" style={{ color: colors.primary }}>
            Điều khoản sử dụng
          </Link>{' '}
          và{' '}
          <Link href="/legal" style={{ color: colors.primary }}>
            Chính sách quyền riêng tư
          </Link>
          .
        </Text>
      </Pressable>
      {touched && !agree ? <Text style={s.error}>Bạn cần đồng ý điều khoản</Text> : null}
      <View style={{ height: 4 }} />
      <Button title="Tạo tài khoản" onPress={submit} />
    </AuthShell>
  );
}
