import crypto from 'node:crypto';

import { smsEnv } from '@/envs/sms';

const ENDPOINT = 'https://dysmsapi.aliyuncs.com/';

const percentEncode = (value: string): string =>
  encodeURIComponent(value).replaceAll('+', '%20').replaceAll('*', '%2A').replaceAll('%7E', '~');

const sign = (params: Record<string, string>, secret: string): string => {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key]!)}`)
    .join('&');

  const stringToSign = `GET&${percentEncode('/')}&${percentEncode(sorted)}`;
  return crypto.createHmac('sha1', `${secret}&`).update(stringToSign).digest('base64');
};

export async function sendAliyunSms(params: { phoneNumber: string; code: string }): Promise<void> {
  const accessKeyId = smsEnv.SMS_ACCESS_KEY_ID;
  const accessKeySecret = smsEnv.SMS_ACCESS_KEY_SECRET;
  const signName = smsEnv.SMS_SIGN_NAME;
  const templateCode = smsEnv.SMS_TEMPLATE_CODE;

  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    throw new Error('SMS provider credentials are not configured');
  }

  const phoneDigits = params.phoneNumber.replace(/^\+86/, '');

  const query: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phoneDigits,
    RegionId: 'cn-hangzhou',
    SignName: signName,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: templateCode,
    TemplateParam: JSON.stringify({ code: params.code }),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
  };

  query.Signature = sign(query, accessKeySecret);

  const url = `${ENDPOINT}?${new URLSearchParams(query).toString()}`;
  const response = await fetch(url, { method: 'GET' });
  const body = (await response.json()) as { Code?: string; Message?: string };

  if (!response.ok || body.Code !== 'OK') {
    console.error('[sms] aliyun send failed', { code: body.Code, message: body.Message });
    throw new Error('SMS_SEND_FAILED');
  }
}
