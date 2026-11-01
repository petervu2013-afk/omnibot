// Signed-in shell. Phones: bottom tab bar. Tablets (≥ 768pt, e.g. iPad): left side rail with labels.
import { Redirect } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/lib/store';
import { useLayout } from '@/lib/layout';
import { useNow } from '@/lib/time';
import { Icon, type IconName } from '@/components/ui';
import { colors } from '@/theme';

const TABS: { name: string; href: '/home' | '/chats' | '/tasks' | '/orders' | '/more'; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'home', href: '/home', label: 'Tổng quan', icon: 'speedometer-outline', iconActive: 'speedometer' },
  { name: 'chats', href: '/chats', label: 'Hội thoại', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'tasks', href: '/tasks', label: 'Việc cần làm', icon: 'checkbox-outline', iconActive: 'checkbox' },
  { name: 'orders', href: '/orders', label: 'Đơn hàng', icon: 'cart-outline', iconActive: 'cart' },
  { name: 'more', href: '/more', label: 'Thêm', icon: 'grid-outline', iconActive: 'grid' },
];

type TabButtonProps = TabTriggerSlotProps & { label: string; icon: IconName; iconActive: IconName; badge?: number; rail: boolean };
function TabButton({ isFocused, label, icon, iconActive, badge, rail, ref, ...props }: TabButtonProps) {
  const color = isFocused ? colors.primary : colors.muted;
  return (
    <Pressable
      {...props}
      ref={ref as never}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={[rail ? st.railItem : st.tabItem, rail && isFocused && { backgroundColor: colors.primarySoft }]}
    >
      <View>
        <Icon name={isFocused ? iconActive : icon} size={rail ? 22 : 24} color={color} />
        {!!badge && (
          <View style={st.dot}>
            <Text style={st.dotText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[rail ? st.railLabel : st.tabLabel, { color }, isFocused && { fontWeight: '700' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AppLayout() {
  const { user, conversations, tasks, notifications } = useApp();
  const { isTablet } = useLayout();
  const insets = useSafeAreaInsets();
  const now = useNow();
  if (!user) return <Redirect href="/login" />;

  const badges: Record<string, number> = {
    chats: conversations.reduce((s, c) => s + c.unread, 0),
    tasks: tasks.filter((t) => !t.done && t.due < now).length,
    more: notifications.filter((n) => !n.read).length,
  };

  const triggers = TABS.map((t) => (
    <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
      <TabButton label={t.label} icon={t.icon} iconActive={t.iconActive} badge={badges[t.name]} rail={isTablet} />
    </TabTrigger>
  ));

  return (
    <Tabs style={{ flex: 1, flexDirection: isTablet ? 'row-reverse' : 'column', backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        <TabSlot />
      </View>
      <TabList style={isTablet ? [st.rail, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }] : [st.tabBar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {isTablet && (
          <View style={st.brand}>
            <Icon name="chatbubble-ellipses" size={26} color={colors.primary} />
            <Text style={st.brandText}>OmniBot</Text>
          </View>
        )}
        {triggers}
      </TabList>
    </Tabs>
  );
}

const st = StyleSheet.create({
  tabBar: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6 },
  tabItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, minHeight: 50 },
  tabLabel: { fontSize: 11 },
  rail: {
    width: 200,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, minHeight: 48 },
  railLabel: { fontSize: 15 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 18 },
  brandText: { fontSize: 20, fontWeight: '800', color: colors.primary },
  dot: { position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dotText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
