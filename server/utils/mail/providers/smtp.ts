import nodemailer, { type Transporter } from 'nodemailer';
import type { MailMessage, MailProvider, MailSettings } from '../core';

/**
 * SMTP delivery via nodemailer. Works with Mailjet, SendGrid, SES or a plain
 * relay — the credentials decide, not the code.
 *
 * Settings are passed in rather than read from `process.env`: in Nitro the
 * server env reaches handlers through `useRuntimeConfig(event)`, and a bare
 * `process.env` read returns undefined at request time in a built server.
 */
export function createSmtpProvider(settings: MailSettings): MailProvider {
  let transporter: Transporter | null = null;

  // Built on first send, not at construction: resolving a provider must not
  // require credentials, so a shop that never sends mail still boots.
  function getTransporter(): Transporter {
    if (transporter) return transporter;
    if (!settings.host) throw new Error('SMTP_HOST is not configured');
    transporter = nodemailer.createTransport({
      host: settings.host,
      port: Number(settings.port || 587),
      // true for 465, false for 587 (STARTTLS).
      secure: settings.secure === 'true',
      auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined,
    });
    return transporter;
  }

  return {
    name: 'smtp',
    async send(message: MailMessage): Promise<void> {
      if (!settings.fromEmail) throw new Error('SMTP_FROM_EMAIL is not configured');
      await getTransporter().sendMail({
        from: settings.fromName
          ? `"${settings.fromName}" <${settings.fromEmail}>`
          : settings.fromEmail,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        replyTo: message.replyTo || settings.replyTo || settings.fromEmail,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
