import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatThread } from '@/components/chat-thread';
import { colors } from '@/theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.card }}>
      <ChatThread id={id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/chats'))} />
    </SafeAreaView>
  );
}
