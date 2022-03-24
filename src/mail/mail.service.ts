import { Inject, Injectable } from '@nestjs/common';
import got from 'got';
import * as FormData from 'form-data';

import { CONFIG_OPTIONS } from '../common/common.constants';
import { EmailVar, MailModuleOptions } from "./mail.interfaces";

@Injectable()
export class MailService {
  constructor(@Inject(CONFIG_OPTIONS) private readonly options: MailModuleOptions) {}

  async sendEmail(subject: string, template: string, emailVars: EmailVar[], to: string = process.env.MAILGUN_FROM_EMAIL): Promise<boolean> {
    const form = new FormData();
    form.append('from', `Nuber Eats <mailgun@${this.options.domain}>`);
    form.append('to', to);
    form.append('subject', subject);
    form.append('template', template);

    emailVars.forEach(({ key, value }) => form.append(`v:${key}`, value));

    try {
      await got.post(`https://api.mailgun.net/v3/${this.options.domain}/messages`, {
        headers: {
          "Authorization": `Basic ${Buffer.from(`api:${this.options.apiKey}`).toString('base64')}`,
        },
        body: form,
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  sendVerificationEmail(email: string, code: string): Promise<boolean> {
    return this.sendEmail('Verify Your Email', 'verify-email', [
      { key: 'code', value: code },
      { key: 'username', value: email },
    ])
  }
}
