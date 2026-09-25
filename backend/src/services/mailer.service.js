import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let cachedTransporter = null;
let cachedKey = '';

export function mailStatus() {
  const { provider, host, port, user } = env.mail;
  return {
    provider,
    configured: isMailConfigured(),
    host: provider === 'json' ? '' : host,
    port: provider === 'json' ? null : port,
    account: user,
    from: fromAddress()
  };
}

export function isMailConfigured() {
  const { provider, host, user, password, from } = env.mail;
  if (provider === 'json') return true;
  return Boolean(host && user && password && from);
}

export function fromAddress() {
  const { from, fromName, user } = env.mail;
  const address = from || user;
  if (!address) return '';
  if (address.includes('<')) return address;
  return fromName ? `"${fromName.replace(/"/g, '')}" <${address}>` : address;
}

function transporter() {
  const { provider, host, port, secure, user, password } = env.mail;
  const key = [provider, host, port, secure, user, password].join('|');
  if (cachedTransporter && cachedKey === key) return cachedTransporter;
  cachedTransporter = provider === 'json'
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000
    });
  cachedKey = key;
  return cachedTransporter;
}

export function friendlyMailError(error) {
  const code = error?.code || '';
  const responseCode = Number(error?.responseCode || 0);
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) {
    return env.mail.provider === 'gmail'
      ? 'Gmail rejected the sign-in. Turn on 2-Step Verification for the Gmail account and use a 16-character App Password as SMTP_PASS / GMAIL_APP_PASSWORD.'
      : 'The mail server rejected the username or password.';
  }
  if (['ESOCKET', 'ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ECONNREFUSED'].includes(code)) {
    return `Could not reach the mail server (${env.mail.host}:${env.mail.port}). Check the network or hosting provider SMTP restrictions.`;
  }
  if (responseCode === 550 || responseCode === 553) return 'The recipient address was rejected by the mail server.';
  if (responseCode === 421 || responseCode === 454 || /daily user sending limit/i.test(error?.message || '')) {
    return 'Gmail sending limit reached or temporarily unavailable. Please try again later.';
  }
  return error?.message || 'Email could not be sent.';
}

export async function sendMail(message) {
  if (!isMailConfigured()) {
    const error = new Error('Email is not configured. Set SMTP_USER and SMTP_PASS (Gmail App Password) in the backend environment.');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }
  return transporter().sendMail({ from: fromAddress(), ...message });
}

export async function verifyMailConnection() {
  if (!isMailConfigured()) return false;
  if (env.mail.provider === 'json') return true;
  await transporter().verify();
  return true;
}

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function textToHtml(text) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((block) => `<p style="margin:0 0 14px">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1f2937">${paragraphs}</div>`;
}
