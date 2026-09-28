import type { MailProvider, MailSettings } from './core';
import { createSmtpProvider } from './providers/smtp';

/**
 * Resolve a mail provider. Add HTTP-API providers (Resend, Mailjet REST,
 * SendGrid) beside smtp.
 *
 * Takes its settings from the caller rather than the environment: Nitro hands
 * server env to handlers through `useRuntimeConfig(event)`, so a module-level
 * `process.env` read is empty at request time in a built server.
 */

/**
 * No-op provider when mail is switched off. Throws rather than silently
 * discarding: a request the shopper believes was sent, that never arrives, is
 * worse than a visible error.
 */
function createNoneProvider(): MailProvider {
  return {
    name: 'none',
    async send() {
      throw new Error('MAIL_PROVIDER is "none" — no mail was sent');
    },
  };
}

export function getMailProvider(provider: string, settings: MailSettings): MailProvider {
  switch (provider || 'smtp') {
    case 'none':
      return createNoneProvider();
    case 'smtp':
      return createSmtpProvider(settings);
    default:
      throw new Error(`Unknown mail provider: "${provider}". Supported: none, smtp`);
  }
}
