declare namespace NodeJS {
  interface ProcessEnv {
    EMAIL_PROVIDER: 'postal' | 'resend';
    POSTAL_SMTP_HOST: string;
    POSTAL_SMTP_PORT: string;
    POSTAL_SMTP_USER: string;
    POSTAL_SMTP_PASS: string;
    POSTAL_SMTP_SECURE: string;
    RESEND_API_KEY: string;
  }
}
