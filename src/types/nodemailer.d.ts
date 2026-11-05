declare module "nodemailer" {
  interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
    [key: string]: unknown;
  }
  interface MailOptions {
    from?: string;
    to?: string;
    subject?: string;
    html?: string;
    text?: string;
    [key: string]: unknown;
  }
  interface Transporter {
    sendMail(options: MailOptions): Promise<unknown>;
  }
  function createTransport(options: TransportOptions): Transporter;
  export { createTransport };
  export default { createTransport };
}
