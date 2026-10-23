import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Every secret and account used by the suite comes from web/.env.local (gitignored).
loadEnv({ path: path.resolve(__dirname, '../../.env.local'), quiet: true } as any);

export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Add it to web/.env.local (see .env.example).`);
  return v;
}

export const ENV = {
  get baseUrl() { return (process.env.E2E_BASE_URL || 'http://localhost:3011').replace(/\/$/, ''); },
  get supabaseUrl() { return need('NEXT_PUBLIC_SUPABASE_URL'); },
  get serviceKey() { return need('SUPABASE_SERVICE_ROLE_KEY'); },
  get resendKey() { return need('RESEND_API_KEY'); },
  get email() { return need('E2E_EMAIL'); },
  get password() { return need('E2E_PASSWORD'); },
  get bypass() { return process.env.VERCEL_PROTECTION_BYPASS || ''; },
};

/** Headers every request to a protected Vercel preview needs; empty otherwise. */
export function protectionHeaders(): Record<string, string> {
  return ENV.bypass ? { 'x-vercel-protection-bypass': ENV.bypass } : {};
}

/** Resend's own test mailboxes: always accepted, never bounce back to us. */
export const DUMMY_RECIPIENT = 'delivered@resend.dev';

/** Unique, greppable marker so test data is easy to find and remove. */
export const runTag = () => `e2e${Date.now().toString(36)}`;
