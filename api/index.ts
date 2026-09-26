import handler from '../functions/api.ts';

export default async function vercelHandler(request: any, response: any) {
  const protocol = request.headers['x-forwarded-proto'] || 'https';
  const host = request.headers.host;
  const url = protocol + '://' + host + request.url;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers || {})) {
    if (Array.isArray(value)) value.forEach(v => headers.append(key, String(v)));
    else if (value != null) headers.set(key, String(value));
  }
  let body: any = undefined;
  if (!['GET','HEAD'].includes(String(request.method || 'GET').toUpperCase())) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
  }
  const webRequest = new Request(url, { method: request.method, headers, body });
  const webResponse = await handler.fetch(webRequest);
  response.status(webResponse.status);
  webResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.send(Buffer.from(await webResponse.arrayBuffer()));
}
