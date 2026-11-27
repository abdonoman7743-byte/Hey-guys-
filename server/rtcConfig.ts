export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RtcConfigResponse {
  iceServers: IceServerEntry[];
  hasTurn: boolean;
  iceTransportPolicy: 'all' | 'relay';
}

export function buildRtcConfig(env: NodeJS.ProcessEnv = process.env): RtcConfigResponse {
  const stunRaw =
    env.STUN_URLS?.trim() ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';

  const stunUrls = stunRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const iceServers: IceServerEntry[] = [];
  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }

  const turnRaw = env.TURN_URLS?.trim() || '';
  const turnUrls = turnRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let hasTurn = false;
  if (turnUrls.length > 0 && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: turnUrls,
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
    hasTurn = true;
  }

  return {
    iceServers,
    hasTurn,
    iceTransportPolicy: 'all',
  };
}
