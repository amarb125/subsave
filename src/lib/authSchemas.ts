import { z } from 'zod';

const email = z.string().trim().min(1, 'Enter your email').email('Enter a valid email address');

const newPassword = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use 72 characters or fewer');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
});

export const signupSchema = z
  .object({ email, password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords do not match' });

export const forgotSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The passwords do not match' });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type ForgotValues = z.infer<typeof forgotSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
