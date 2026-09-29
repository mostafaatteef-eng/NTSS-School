import http from 'node:http';
import { ntssHandler } from '../api/index.ts';

const port = Number(process.env.PORT || 8787);

const server = http.createServer(async (req, res) => {
  try {
    const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url || '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach(v => headers.append(key, String(v)));
      else if (value != null) headers.set(key, String(value));
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(url, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase()) ? undefined : body,
    });

    const response = await ntssHandler.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('NTSS standalone API error', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'error', code: 'INTERNAL_ERROR' }));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`NTSS canonical API listening on :${port}`);
});
