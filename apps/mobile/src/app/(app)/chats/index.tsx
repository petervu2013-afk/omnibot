import { useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Badge, Empty, Icon, Segmented, s } from '@/components/ui';
import { ChatThread } from '@/components/chat-thread';
import { customerOf, useApp } from '@/lib/store';
import { useLayout } from '@/lib/layout';
import { PLATFORM_LABEL } from '@/data/mock';
import { colors, space, timeAgo } from '@/theme';

type Filter = 'all' | 'unread' | 'handoff';

export default function Chats() {
  const { conversations, openConversation } = useApp();
  const { isTablet } = useLayout();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(conversations[0]?.id ?? null);

  const list = conversations
    .filter((v) => (filter === 'unread' ? v.unread > 0 : filter === 'handoff' ? !!v.handoff && !v.aiActive : true))
    .filter((v) => customerOf(v.customerId).name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.messages[b.messages.length - 1]?.at ?? 0) - (a.messages[a.messages.length - 1]?.at ?? 0));

  const open = (id: string) => {
    openConversation(id);
    if (isTablet) setSelected(id);
    else router.push(`/chats/${id}`);
  };

  const listView = (
    <View style={{ flex: 1 }}>
      <View style={{ padding: space.md, gap: space.sm, backgroundColor: colors.card }}>
        <Text style={s.h1}>Hội thoại</Text>
        <View style={st.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Tìm tên khách" placeholderTextColor="#9ca3af" style={{ flex: 1, fontSize: 15, paddingVertical: 8 }} />
        </View>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            ['all', 'Tất cả'],
            ['unread', 'Chưa đọc'],
            ['handoff', 'Cần NV'],
          ]}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(v) => v.id}
        ListEmptyComponent={<Empty icon="chatbubbles-outline" text="Không có hội thoại" />}
        renderItem={({ item: v }) => {
          const c = customerOf(v.customerId);
          const last = v.messages[v.messages.length - 1];
          const ch = PLATFORM_LABEL[v.channel];
          const active = isTablet && selected === v.id;
          return (
            <Pressable onPress={() => open(v.id)} style={({ pressed }) => [st.item, active && { backgroundColor: colors.primarySoft }, pressed && { opacity: 0.8 }]}>
              <View>
                <Avatar name={c.name} size={48} />
                <View style={[st.channel, { backgroundColor: ch.color }]}>
                  <Icon name={ch.icon as never} size={10} color="#fff" />
                </View>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[s.text, { fontWeight: v.unread ? '700' : '600' }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={s.mutedSm}>{last ? timeAgo(last.at) : ''}</Text>
                </View>
                <Text style={[s.muted, v.unread > 0 && { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                  {last?.from === 'ai' ? '✨ ' : last?.from === 'agent' ? 'Bạn: ' : ''}
                  {last?.text}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {v.aiActive ? <Badge text="AI" color={colors.purple} /> : v.handoff ? <Badge text="Cần nhân viên" color={colors.orange} /> : null}
                  {v.unread > 0 && <Badge text={`${v.unread} mới`} color="#fff" bg={colors.red} />}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );

  if (!isTablet)
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.card }}>
        {listView}
      </SafeAreaView>
    );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.card }}>
      <View style={{ width: 360, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }}>{listView}</View>
      <View style={{ flex: 1 }}>{selected ? <ChatThread id={selected} /> : <Empty icon="chatbubbles-outline" text="Chọn một hội thoại" />}</View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 10 },
  item: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  channel: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
