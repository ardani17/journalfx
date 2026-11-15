import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

export const onboardSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(128)
    .regex(/[A-Za-z]/, "Password harus mengandung huruf")
    .regex(/[0-9]/, "Password harus mengandung angka"),
  timezone: z.string().default("Asia/Jakarta"),
  locale: z.enum(["id", "en"]).default("id"),
  initialCapital: z.coerce.number().positive("Modal awal harus positif"),
  targetAmount: z.coerce.number().positive("Target harus positif").default(1_000_000),
  accountName: z.string().trim().min(2).max(60).default("Akun Utama"),
  broker: z.string().trim().max(60).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
  newPassword: z
    .string()
    .min(8, "Password baru minimal 8 karakter")
    .regex(/[A-Za-z]/, "Password harus mengandung huruf")
    .regex(/[0-9]/, "Password harus mengandung angka"),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  timezone: z.string().min(1).max(64).optional(),
  locale: z.enum(["id", "en"]).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type OnboardInput = z.infer<typeof onboardSchema>;
