import crypto from 'node:crypto';
import http2 from 'node:http2';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushDispatchTarget {
  token: string;
  provider: 'fcm' | 'apns' | 'webpush';
  platform: 'web' | 'ios' | 'android';
}

export interface PushDispatchInput {
  targets: PushDispatchTarget[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushDispatchResult {
  fcmConfigured: boolean;
  apnsConfigured: boolean;
  attempted: number;
  delivered: number;
  failed: number;
  errors: string[];
}

let fcmMessagingInstance: ReturnType<typeof getMessaging> | null = null;

function getFcmMessaging() {
  if (fcmMessagingInstance) return fcmMessagingInstance;
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const appName = 'fcm-push-app';
    const existing = getApps().find((a) => a.name === appName);
    const app = existing || initializeApp({ credential: cert(parsed) }, appName);
    fcmMessagingInstance = getMessaging(app);
    return fcmMessagingInstance;
  } catch (err) {
    console.error('Invalid FCM_SERVICE_ACCOUNT_JSON configuration:', err);
    return null;
  }
}

function createApnsJwt(keyId: string, teamId: string, privateKeyPem: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })
  ).toString('base64url');
  const unsigned = `${header}.${claims}`;
  const signer = crypto.createSign('SHA256');
  signer.update(unsigned);
  const signature = signer.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${unsigned}.${signature}`;
}

async function sendApnsNotification(
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
  config: {
    keyId: string;
    teamId: string;
    bundleId: string;
    privateKey: string;
    production: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const host = config.production
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';
    const client = http2.connect(host);
    client.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    try {
      const jwt = createApnsJwt(config.keyId, config.teamId, config.privateKey);
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${encodeURIComponent(deviceToken)}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': config.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });

      let responseData = '';
      let statusCode = 0;
      req.on('response', (headers) => {
        statusCode = Number(headers[':status'] || 0);
      });
      req.on('data', (chunk) => {
        responseData += chunk;
      });
      req.on('end', () => {
        client.close();
        if (statusCode >= 200 && statusCode < 300) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: `APNs ${statusCode}: ${responseData}` });
        }
      });
      req.write(
        JSON.stringify({
          aps: {
            alert: { title, body },
            sound: 'default',
            'content-available': 1,
          },
          ...data,
        })
      );
      req.end();
    } catch (err: any) {
      client.close();
      resolve({ ok: false, error: err?.message || 'APNs signing error' });
    }
  });
}

export async function dispatchPushNotifications(
  input: PushDispatchInput
): Promise<PushDispatchResult> {
  const fcm = getFcmMessaging();
  const apnsKeyId = process.env.APNS_KEY_ID?.trim() || '';
  const apnsTeamId = process.env.APNS_TEAM_ID?.trim() || '';
  const apnsBundleId = process.env.APNS_BUNDLE_ID?.trim() || '';
  const apnsPrivateKey = (process.env.APNS_PRIVATE_KEY?.trim() || '').replace(/\\n/g, '\n');
  const apnsConfigured = Boolean(apnsKeyId && apnsTeamId && apnsBundleId && apnsPrivateKey);

  const result: PushDispatchResult = {
    fcmConfigured: Boolean(fcm),
    apnsConfigured,
    attempted: 0,
    delivered: 0,
    failed: 0,
    errors: [],
  };

  const dataPayload = input.data || {};

  for (const target of input.targets) {
    if (target.provider === 'fcm' || target.provider === 'webpush') {
      if (!fcm) continue;
      result.attempted++;
      try {
        await fcm.send({
          token: target.token,
          notification: { title: input.title, body: input.body },
          data: dataPayload,
          webpush: {
            headers: { Urgency: 'high' },
          },
        });
        result.delivered++;
      } catch (err: any) {
        result.failed++;
        result.errors.push(err?.message || 'FCM send error');
      }
    } else if (target.provider === 'apns') {
      if (!apnsConfigured) continue;
      result.attempted++;
      const res = await sendApnsNotification(target.token, input.title, input.body, dataPayload, {
        keyId: apnsKeyId,
        teamId: apnsTeamId,
        bundleId: apnsBundleId,
        privateKey: apnsPrivateKey,
        production: process.env.APNS_PRODUCTION === 'true',
      });
      if (res.ok) {
        result.delivered++;
      } else {
        result.failed++;
        if (res.error) result.errors.push(res.error);
      }
    }
  }

  return result;
}
