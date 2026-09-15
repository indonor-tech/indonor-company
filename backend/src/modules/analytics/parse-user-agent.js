export function parseUserAgent(userAgent = '') {
  const ua = String(userAgent || '');
  const isBot = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse|headless|wget|curl/i.test(ua);
  let deviceType = 'desktop';
  if (/iPad|Tablet/i.test(ua)) deviceType = 'tablet';
  else if (/Mobi|Android|iPhone|iPod/i.test(ua)) deviceType = 'mobile';
  let browser = 'Other';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  let os = 'Other';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  return { isBot, deviceType, browser, os };
}

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || '';
}

export function clientCountry(req) {
  return req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country-code'] || '';
}
