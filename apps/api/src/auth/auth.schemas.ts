import { z } from 'zod';
import { PASSWORD_MAX } from './password.js';

const platform = z.enum(['WEB', 'ANDROID', 'IOS']).default('WEB');
const deviceName = z.string().trim().max(100).optional();
const email = z.email('Email không hợp lệ').max(254);
const token = z.string().min(20, 'Liên kết không hợp lệ').max(200);
const password = z.string().min(1, 'Nhập mật khẩu').max(PASSWORD_MAX, `Tối đa ${PASSWORD_MAX} ký tự`);

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Nhập họ tên').max(100),
  email,
  password,
  shopName: z.string().trim().min(2, 'Nhập tên cửa hàng').max(100),
  field: z.string().trim().max(60).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?84|0)\d{9,10}$/, 'Số điện thoại không hợp lệ')
    .optional(),
  acceptTerms: z.literal(true, { message: 'Bạn cần đồng ý Điều khoản & Chính sách quyền riêng tư' }),
  platform,
  deviceName,
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Nhập email').max(254),
  password,
  captcha: z.string().max(4096).optional(),
  platform,
  deviceName,
});

export const refreshSchema = z.object({ refreshToken: z.string().max(200).optional() });
export const emailSchema = z.object({ email });
export const tokenSchema = z.object({ token });
export const resetPasswordSchema = z.object({ token, password });
export const changePasswordSchema = z.object({ currentPassword: password, newPassword: password });
export const passwordConfirmSchema = z.object({ password });
