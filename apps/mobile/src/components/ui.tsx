// Shared building blocks for the OmniBot mobile templates.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, font, radius, space } from '@/theme';

export type IconName = keyof typeof Ionicons.glyphMap;
export const Icon = ({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) => <Ionicons name={name} size={size} color={color} />;

export function Screen({ children, scroll = true, edges = ['top'], style, padded = true }: { children: ReactNode; scroll?: boolean; edges?: Edge[]; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const inner = padded ? { padding: space.lg, gap: space.md } : undefined;
  return (
    <SafeAreaView edges={edges} style={[s.screen, style]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, right, onBack }: { title: string; subtitle?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={s.header}>
      {onBack && (
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={onBack} hitSlop={12} style={s.iconBtn}>
          <Icon name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.h1} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.muted} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  return <View style={[s.card, style]}>{children}</View>;
}

type BtnKind = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: BtnKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.primary, secondary: colors.card, danger: colors.red, ghost: 'transparent' }[kind];
  const fg = kind === 'primary' || kind === 'danger' ? colors.white : kind === 'ghost' ? colors.primary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, borderWidth: kind === 'secondary' ? 1 : 0 }, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, secure, icon, ...props }: TextInputProps & { label: string; error?: string | false; hint?: string; secure?: boolean; icon?: IconName }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={[s.input, !!error && { borderColor: colors.red }]}>
        {icon && <Icon name={icon} size={18} color={colors.muted} />}
        <TextInput placeholderTextColor="#9ca3af" style={s.inputText} secureTextEntry={secure && !show} autoCapitalize="none" {...props} />
        {secure && (
          <Pressable accessibilityLabel={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onPress={() => setShow(!show)} hitSlop={10}>
            <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.mutedSm}>{hint}</Text> : null}
    </View>
  );
}

export function Badge({ text, color = colors.muted, bg }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: bg ?? `${color}1f` }]}>
      <Text style={[s.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

const AVATAR = ['#0b66ff', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const bg = AVATAR[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function ListRow({
  icon,
  iconColor = colors.primary,
  title,
  subtitle,
  right,
  onPress,
  danger,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [s.row, pressed && { backgroundColor: '#f8fafc' }]}>
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: `${danger ? colors.red : iconColor}1a` }]}>
          <Icon name={icon} size={18} color={danger ? colors.red : iconColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, danger && { color: colors.red }]}>{title}</Text>
        {subtitle ? <Text style={s.mutedSm}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color="#9ca3af" /> : null)}
    </Pressable>
  );
}

export function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  return <ListRow title={title} subtitle={subtitle} right={<Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: '#d1d5db' }} />} />;
}

export function Section({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      {(title || action) && (
        <View style={s.sectionHead}>
          {title ? <Text style={s.sectionTitle}>{title}</Text> : <View />}
          {action}
        </View>
      )}
      <View style={s.group}>{children}</View>
    </View>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'good' }) {
  return (
    <View style={[s.card, { flex: 1, minWidth: 140, gap: 4 }, tone === 'bad' && { borderTopWidth: 3, borderTopColor: colors.red }]}>
      <Text style={s.mutedSm}>{label}</Text>
      <Text style={[s.statValue, tone === 'bad' && { color: colors.red }, tone === 'good' && { color: colors.green }]}>{value}</Text>
      {sub ? <Text style={s.mutedSm}>{sub}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.segment}>
      {options.map(([k, l]) => (
        <Pressable key={k} onPress={() => onChange(k)} style={[s.segItem, value === k && s.segActive]} accessibilityRole="tab" accessibilityState={{ selected: value === k }}>
          <Text style={[s.segText, value === k && { color: colors.primary, fontWeight: '700' }]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Empty({ icon = 'file-tray-outline', text }: { icon?: IconName; text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 40, gap: 10 }}>
      <Icon name={icon} size={40} color="#cbd5e1" />
      <Text style={s.muted}>{text}</Text>
    </View>
  );
}

export function Alert({ text, tone = 'error' }: { text: string; tone?: 'error' | 'info' | 'warn' }) {
  const c = { error: [colors.redSoft, '#991b1b'], info: [colors.greenSoft, '#065f46'], warn: [colors.orangeSoft, '#92400e'] }[tone];
  return (
    <View style={[s.alert, { backgroundColor: c[0] }]}>
      <Icon name={tone === 'info' ? 'checkmark-circle' : 'alert-circle'} size={18} color={c[1]} />
      <Text style={{ color: c[1], flex: 1, fontSize: font.sm }}>{text}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconBtn: { padding: 4, marginLeft: -6 },
  h1: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  h2: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  text: { fontSize: font.md, color: colors.text },
  muted: { fontSize: font.sm, color: colors.muted },
  mutedSm: { fontSize: font.xs, color: colors.muted },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  error: { fontSize: font.xs, color: colors.red },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.lg, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.md, borderColor: colors.border },
  btnText: { fontSize: font.md, fontWeight: '700' },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  inputText: { flex: 1, fontSize: font.md, color: colors.text, paddingVertical: 10 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 11.5, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    minHeight: 56,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: font.md, color: colors.text, fontWeight: '500' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  sectionTitle: { fontSize: font.sm, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  group: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.card },
  statValue: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: '#e4e7ec', borderRadius: 10, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segActive: { backgroundColor: colors.card },
  segText: { fontSize: font.sm, color: colors.muted, fontWeight: '600' },
  alert: { flexDirection: 'row', gap: 8, padding: space.md, borderRadius: radius.sm, alignItems: 'flex-start' },
});
