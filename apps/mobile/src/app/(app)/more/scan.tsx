// Barcode scanner template. The live camera (expo-camera, needs a development build) is added in Step 17.
import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Alert, Button, Field, Header, Icon, Screen } from '@/components/ui';
import { products } from '@/data/mock';
import { space } from '@/theme';

export default function Scan() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const lookup = () => {
    const p = products.find((x) => x.barcode === code.trim() || x.sku.toLowerCase() === code.trim().toLowerCase());
    if (!p) return setError('Không tìm thấy sản phẩm có mã này.');
    router.replace({ pathname: '/more/inventory', params: { q: p.sku } });
  };

  return (
    <Screen padded={false}>
      <Header title="Quét mã vạch" onBack={() => (router.canGoBack() ? router.back() : router.replace('/more'))} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={st.camera} accessibilityLabel="Khung camera">
          <View style={st.frame} />
          <Icon name="scan-outline" size={56} color="#ffffffaa" />
          <Text style={{ color: '#fff', opacity: 0.8 }}>Đưa mã vạch vào khung</Text>
        </View>
        <Alert tone="warn" text="Bản mẫu: camera thật cần quyền Camera (NSCameraUsageDescription / android.permission.CAMERA). Tạm thời nhập mã bên dưới." />
        <Field
          label="Mã vạch hoặc SKU"
          icon="barcode-outline"
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setError('');
          }}
          placeholder="VD: 8930000000011"
          error={error}
          keyboardType="default"
          onSubmitEditing={lookup}
        />
        <Button title="Tra tồn kho" icon="search" disabled={!code.trim()} onPress={lookup} />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  camera: { height: 260, borderRadius: 16, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', gap: 8 },
  frame: { position: 'absolute', width: '70%', height: 120, borderWidth: 2, borderColor: '#22d3ee', borderRadius: 12 },
});
