import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Icon, s } from '@/components/ui';
import { customerOf, productOf, useApp } from '@/lib/store';
import { PLATFORM_LABEL } from '@/data/mock';
import { colors, space } from '@/theme';

const QUICK = [
  ['/chao', 'Dạ em chào anh/chị, em có thể hỗ trợ gì ạ?'],
  ['/ship', 'Shop giao toàn quốc, miễn phí nội thành cho đơn từ 5 triệu ạ.'],
  ['/stk', 'STK: 0123456789 – Ngân hàng ABC – CTY GO VIET'],
];

export function ChatThread({ id, onBack }: { id: string; onBack?: () => void }) {
  const { conversations, sendMessage, setAi } = useApp();
  const [text, setText] = useState('');
  const scroll = useRef<ScrollViewInstance>(null);
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return null;
  const c = customerOf(conv.customerId);
  const ch = PLATFORM_LABEL[conv.channel];
  const quick = text.startsWith('/') ? QUICK.filter(([k]) => k.startsWith(text.trim())) : [];
  const send = () => {
    if (text.trim()) {
      sendMessage(conv.id, text.trim());
      setText('');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={st.head}>
        {onBack && (
          <Pressable onPress={onBack} accessibilityLabel="Quay lại" hitSlop={12}>
            <Icon name="chevron-back" size={26} color={colors.primary} />
          </Pressable>
        )}
        <Avatar name={c.name} size={36} />
        <Pressable style={{ flex: 1 }} onPress={() => router.push(`/tasks/customer/${c.id}`)}>
          <Text style={s.h2} numberOfLines={1}>
            {c.name}
          </Text>
          <Text style={s.mutedSm} numberOfLines={1}>
            {ch.label} · {conv.channelName}
          </Text>
        </Pressable>
        <Pressable accessibilityLabel={`Gọi ${c.name}`} onPress={() => Linking.openURL(`tel:${c.phone}`)} hitSlop={10}>
          <Icon name="call" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View style={st.aiBar}>
        <Icon name="sparkles" size={16} color={conv.aiActive ? colors.purple : colors.muted} />
        <Text style={[s.mutedSm, { flex: 1 }]}>{conv.aiActive ? 'AI đang tự động trả lời' : conv.handoff ? `AI đã chuyển cho bạn: ${conv.handoff}` : 'Bạn đang trả lời (AI tắt)'}</Text>
        <Switch value={conv.aiActive} onValueChange={(v) => setAi(conv.id, v)} trackColor={{ true: colors.purple, false: '#d1d5db' }} />
      </View>

      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ padding: space.md, gap: 8 }}>
        {conv.messages.map((m) => {
          const mine = m.from !== 'customer';
          return (
            <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
              <View style={[st.bubble, mine ? (m.from === 'ai' ? st.ai : st.agent) : st.customer]}>
                <Text style={{ color: m.from === 'agent' ? '#fff' : m.from === 'ai' ? '#3b0764' : colors.text, fontSize: 15, lineHeight: 21 }}>{m.text}</Text>
              </View>
              {m.productIds?.map((pid) => {
                const p = productOf(pid);
                return (
                  <View key={pid} style={st.product}>
                    <Text style={{ fontWeight: '600' }}>{p.name}</Text>
                    <Text style={{ color: colors.primary, fontWeight: '700' }}>{p.price.toLocaleString('vi-VN')}đ</Text>
                  </View>
                );
              })}
              <Text style={s.mutedSm}>
                {m.from === 'ai' ? '✨ AI · ' : m.from === 'agent' ? 'Bạn · ' : ''}
                {new Date(m.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {quick.length > 0 && (
        <View style={st.quick}>
          {quick.map(([k, v]) => (
            <Pressable key={k} onPress={() => setText(v)} style={st.quickItem}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{k}</Text>
              <Text style={s.mutedSm} numberOfLines={1}>
                {v}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={st.composer}>
        <Pressable accessibilityLabel="Đính kèm ảnh" hitSlop={8}>
          <Icon name="image-outline" size={24} color={colors.muted} />
        </Pressable>
        <TextInput value={text} onChangeText={setText} placeholder="Nhập tin nhắn… (gõ / để dùng mẫu)" placeholderTextColor="#9ca3af" style={st.input} multiline />
        <Pressable accessibilityLabel="Gửi" onPress={send} disabled={!text.trim()} style={[st.send, !text.trim() && { opacity: 0.4 }]}>
          <Icon name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  aiBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, paddingVertical: 6, backgroundColor: '#faf5ff' },
  bubble: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  customer: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  agent: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  ai: { backgroundColor: '#ede9fe', borderBottomRightRadius: 4 },
  product: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, minWidth: 180 },
  quick: { backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  quickItem: { paddingHorizontal: space.md, paddingVertical: 8, gap: 2 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 10, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, minHeight: 40, fontSize: 15, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.bg, borderRadius: 20, color: colors.text },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
