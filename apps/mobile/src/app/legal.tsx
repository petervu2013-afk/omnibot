// Terms + privacy summary, reachable signed-in or signed-out (stores require the policy to be accessible in-app).
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Card, Header, Screen, s } from '@/components/ui';
import { space } from '@/theme';

const SECTIONS: [string, string[]][] = [
  [
    'Dữ liệu chúng tôi thu thập',
    [
      'Thông tin tài khoản: họ tên, email, số điện thoại, cửa hàng.',
      'Dữ liệu vận hành do bạn kết nối: hội thoại kênh chat, khách hàng, đơn hàng, tồn kho.',
      'Thông tin thiết bị để quản lý phiên đăng nhập và gửi thông báo.',
    ],
  ],
  [
    'Mục đích sử dụng',
    [
      'Cung cấp dịch vụ chatbot, CRM, đơn hàng và báo cáo.',
      'AI dùng danh mục sản phẩm và lịch sử hội thoại của cửa hàng để trả lời khách; không dùng để quảng cáo cho bên thứ ba.',
      'Không bán dữ liệu cá nhân.',
    ],
  ],
  [
    'Quyền của bạn',
    [
      'Xem, sửa, xuất dữ liệu cá nhân.',
      'Xóa tài khoản ngay trong ứng dụng (Thêm → Tài khoản → Xóa tài khoản) hoặc tại omnibot.vn/xoa-tai-khoan.',
      'Rút lại quyền thông báo, camera bất cứ lúc nào trong cài đặt máy.',
    ],
  ],
  [
    'Bảo mật',
    [
      'Mã hóa đường truyền (TLS), mật khẩu băm Argon2, khóa tạm khi nhập sai nhiều lần.',
      'Token đăng nhập lưu trong SecureStore / Keychain.',
      'Tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.',
    ],
  ],
  ['Liên hệ', ['support@omnibot.vn · omnibot.vn/chinh-sach-bao-mat']],
];

export default function Legal() {
  return (
    <Screen padded={false}>
      <Header title="Điều khoản & chính sách" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <View style={{ padding: space.lg, gap: space.md, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <Text style={s.muted}>Bản tóm tắt – văn bản đầy đủ có hiệu lực tại omnibot.vn. Cập nhật 10/2026.</Text>
        {SECTIONS.map(([title, items]) => (
          <Card key={title} style={{ gap: 6 }}>
            <Text style={s.h2}>{title}</Text>
            {items.map((t) => (
              <Text key={t} style={s.text}>
                • {t}
              </Text>
            ))}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
