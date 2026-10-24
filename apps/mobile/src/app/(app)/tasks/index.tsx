import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, Empty, Icon, Screen, s } from '@/components/ui';
import { customerOf, useApp } from '@/lib/store';
import { useLayout } from '@/lib/layout';
import { useNow } from '@/lib/time';
import type { Task } from '@/data/mock';
import { colors, space, STAGE_STYLE } from '@/theme';

function due(t: Task, now: number) {
  const d = new Date(t.due);
  const late = t.due < now;
  const mins = Math.round(Math.abs(t.due - now) / 60000);
  const rel = mins < 60 ? `${mins} phút` : mins < 1440 ? `${Math.round(mins / 60)} giờ` : `${Math.round(mins / 1440)} ngày`;
  return late ? `Quá hạn ${rel}` : `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function Tasks() {
  const { tasks, completeTask } = useApp();
  const { isTablet } = useLayout();
  const now = useNow();
  const open = tasks.filter((t) => !t.done).sort((a, b) => a.due - b.due);
  const groups: [string, Task[], string][] = [
    ['Quá hạn', open.filter((t) => t.due < now), colors.red],
    ['Trong 24 giờ tới', open.filter((t) => t.due >= now && t.due < now + 86400000), colors.orange],
    ['Sắp tới', open.filter((t) => t.due >= now + 86400000), colors.muted],
  ];

  return (
    <Screen>
      <Text style={s.h1}>Việc cần làm</Text>
      <Text style={s.muted}>{open.length} việc · gọi lead mới trong 15 phút · không nghe máy hệ thống tự hẹn gọi lại sau 4 giờ</Text>
      {open.length === 0 && <Empty icon="checkmark-done-circle-outline" text="Bạn đã hoàn thành mọi việc 🎉" />}
      {groups
        .filter(([, l]) => l.length)
        .map(([title, list, color]) => (
          <View key={title} style={{ gap: space.sm }}>
            <Text style={[s.sectionTitle, { color }]}>
              {title} ({list.length})
            </Text>
            <View style={{ flexDirection: isTablet ? 'row' : 'column', flexWrap: 'wrap', gap: space.sm }}>
              {list.map((t) => {
                const c = customerOf(t.customerId);
                const stage = STAGE_STYLE[c.stage];
                return (
                  <Card key={t.id} style={[{ gap: 10 }, isTablet && { width: '48.8%' }, t.due < now && { borderLeftWidth: 4, borderLeftColor: colors.red }]}>
                    <Pressable onPress={() => router.push(`/tasks/customer/${c.id}`)} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={s.h2} numberOfLines={1}>
                          {c.name}
                        </Text>
                        {stage && <Badge text={stage.label} color={stage.color} />}
                      </View>
                      <Text style={s.text}>{t.title}</Text>
                      <Text style={[s.mutedSm, t.due < now && { color: colors.red }]}>
                        {t.kind} · {due(t, now)}
                      </Text>
                    </Pressable>
                    <View style={st.actions}>
                      {t.type === 'call' ? (
                        <>
                          <ActionBtn icon="call" label="Gọi" color={colors.primary} onPress={() => Linking.openURL(`tel:${c.phone}`)} />
                          <ActionBtn icon="checkmark-circle" label="Gọi được" color={colors.green} onPress={() => completeTask(t.id, 'connected')} />
                          <ActionBtn icon="close-circle" label="Không nghe" color={colors.orange} onPress={() => completeTask(t.id, 'no_answer')} />
                        </>
                      ) : (
                        <ActionBtn icon="checkmark-done" label="Đã nhắn" color={colors.green} onPress={() => completeTask(t.id, 'done')} />
                      )}
                    </View>
                  </Card>
                );
              })}
            </View>
          </View>
        ))}
    </Screen>
  );
}

function ActionBtn({ icon, label, color, onPress }: { icon: 'call' | 'checkmark-circle' | 'close-circle' | 'checkmark-done'; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [st.action, { borderColor: `${color}55` }, pressed && { backgroundColor: `${color}14` }]}>
      <Icon name={icon} size={18} color={color} />
      <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 10, borderWidth: 1 },
});
