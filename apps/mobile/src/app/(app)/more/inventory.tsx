import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, TextInput, View } from 'react-native';
import { Badge, Card, Empty, Header, Icon, Screen, s } from '@/components/ui';
import { useLayout } from '@/lib/layout';
import { products } from '@/data/mock';
import { colors, money, space } from '@/theme';

const LOW = 3;

export default function Inventory() {
  const params = useLocalSearchParams<{ q?: string }>();
  const { isTablet } = useLayout();
  const [q, setQ] = useState(params.q ?? '');
  const term = q.trim().toLowerCase();
  const list = products
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.barcode.includes(term))
    .sort((a, b) => a.stock.main + a.stock.showroom - (b.stock.main + b.stock.showroom));
  const low = products.filter((p) => p.stock.main + p.stock.showroom <= LOW).length;

  return (
    <Screen padded={false}>
      <Header
        title="Kho & tồn kho"
        subtitle={`${products.length} sản phẩm · ${low} sắp hết / hết hàng`}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/more'))}
        right={<Icon name="barcode-outline" size={24} color={colors.primary} />}
      />
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={[s.input, { backgroundColor: colors.card }]}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Tên, SKU hoặc mã vạch" placeholderTextColor="#9ca3af" style={s.inputText} autoCapitalize="none" />
        </View>
        {list.length === 0 && <Empty icon="cube-outline" text="Không tìm thấy sản phẩm" />}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {list.map((p) => {
            const total = p.stock.main + p.stock.showroom;
            const tone = total === 0 ? colors.red : total <= LOW ? colors.orange : colors.green;
            return (
              <Card key={p.id} style={[{ gap: 6 }, isTablet ? { width: '49.2%' } : { width: '100%' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[s.text, { fontWeight: '700', flex: 1 }]}>{p.name}</Text>
                  <Badge text={total === 0 ? 'Hết hàng' : total <= LOW ? 'Sắp hết' : `Còn ${total}`} color={tone} />
                </View>
                <Text style={s.mutedSm}>
                  {p.sku} · {p.barcode} · {p.category}
                </Text>
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <Text style={s.muted}>
                    Kho chính: <Text style={{ fontWeight: '700', color: colors.text }}>{p.stock.main}</Text>
                  </Text>
                  <Text style={s.muted}>
                    Showroom: <Text style={{ fontWeight: '700', color: colors.text }}>{p.stock.showroom}</Text>
                  </Text>
                  <Text style={[s.muted, { marginLeft: 'auto', color: colors.primary, fontWeight: '700' }]}>{money(p.price)}</Text>
                </View>
              </Card>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
