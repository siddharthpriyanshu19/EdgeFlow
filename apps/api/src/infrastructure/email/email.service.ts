/**
 * Email Service
 *
 * Sends transactional emails via Nodemailer.
 * In development, uses a local SMTP server (Mailhog/MailDev).
 * Templates are inline HTML — a future phase will use proper templating.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { createLogger } from '@edgeflow/logger';
import { config } from '../config/env.js';

const logger = createLogger({ service: 'email' });

export class EmailService {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
          : undefined,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    displayName: string,
    token: string,
  ): Promise<void> {
    const resetUrl = `${config.APP_URL}/?reset=${token}`;

    await this.send({
      to,
      subject: 'Reset your EdgeFlow password',
      html: this.buildPasswordResetTemplate(displayName, resetUrl),
    });

    logger.info({ to }, 'Password reset email sent');
  }

  async sendWorkspaceInvitationEmail(
    to: string,
    inviterName: string,
    workspaceName: string,
    token: string,
  ): Promise<void> {
    const inviteUrl = `${config.APP_URL}/?invite=${token}`;

    await this.send({
      to,
      subject: `You've been invited to join ${workspaceName} on EdgeFlow`,
      html: this.buildInvitationTemplate(to, inviterName, workspaceName, inviteUrl),
    });

    logger.info({ to, workspaceName }, 'Invitation email sent');
  }

  private async send(options: { to: string; subject: string; html: string }): Promise<void> {
    await this.transporter.sendMail({
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_FROM}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  }

  private buildPasswordResetTemplate(displayName: string, resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Reset Your Password</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; margin: 0; padding: 40px 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: #1a1d2e; border-radius: 12px; padding: 40px; border: 1px solid #2d3748;">
          <h1 style="color: #6366f1; font-size: 24px; margin: 0 0 8px;">EdgeFlow</h1>
          <p style="color: #94a3b8; font-size: 13px; margin: 0 0 32px;">Real-Time Collaborative System Design</p>
          <h2 style="font-size: 20px; margin: 0 0 16px;">Reset your password</h2>
          <p style="color: #cbd5e1; line-height: 1.6;">Hi ${displayName}, we received a request to reset your password.</p>
          <a href="${resetUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
          <p style="color: #64748b; font-size: 13px;">This link expires in 1 hour. If you didn't request a reset, please ignore this email — your password will not change.</p>
        </div>
      </body>
      </html>
    `;
  }

  private buildInvitationTemplate(
    email: string,
    inviterName: string,
    workspaceName: string,
    inviteUrl: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Workspace Invitation</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e2e8f0; margin: 0; padding: 40px 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: #1a1d2e; border-radius: 12px; padding: 40px; border: 1px solid #2d3748;">
          <h1 style="color: #6366f1; font-size: 24px; margin: 0 0 8px;">EdgeFlow</h1>
          <p style="color: #94a3b8; font-size: 13px; margin: 0 0 32px;">Real-Time Collaborative System Design</p>
          <h2 style="font-size: 20px; margin: 0 0 16px;">You're invited!</h2>
          <p style="color: #cbd5e1; line-height: 1.6;"><strong>${inviterName}</strong> has invited <strong>${email}</strong> to join the <strong>${workspaceName}</strong> workspace on EdgeFlow.</p>
          <a href="${inviteUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Accept Invitation</a>
          <p style="color: #64748b; font-size: 13px;">This invitation expires in 7 days.</p>
        </div>
      </body>
      </html>
    `;
  }
}
