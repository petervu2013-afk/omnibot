import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui';
import { colors, font, space } from '@/theme';

// Centered auth card: full width on phones, 460pt card on tablets.
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
          <View style={st.card}>
            <View style={st.brand}>
              <Icon name="chatbubble-ellipses" size={30} color={colors.primary} />
              <Text style={st.brandText}>OmniBot</Text>
            </View>
            <Text style={st.title}>{title}</Text>
            {subtitle ? <Text style={st.subtitle}>{subtitle}</Text> : null}
            <View style={{ gap: space.md, marginTop: space.md }}>{children}</View>
          </View>
          {footer ? <View style={{ alignItems: 'center', marginTop: space.lg }}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: space.xl,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.lg },
  brandText: { fontSize: 22, fontWeight: '800', color: colors.primary },
  title: { fontSize: font.xxl, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: font.md, color: colors.muted, marginTop: 4 },
});
