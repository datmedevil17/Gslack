// Update this URL each time you restart `cloudflared tunnel --url http://localhost:8080`
// The URL must NOT have a trailing slash or spaces.
export const API_BASE_URL = 'https://becomes-lesson-val-coding.trycloudflare.com'.trim();

async function request(
  path: string,
  options: RequestInit,
): Promise<unknown> {
  const url = `${API_BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err: any) {
    // fetch itself failed — server not reachable or tunnel down
    const detail = err?.message ?? 'unknown';
    throw new Error(
      `Cannot reach server (${detail}). Make sure the backend is running and the cloudflared URL in api.ts is current.`,
    );
  }

  if (!res.ok) {
    let message = `API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      else if (body?.message) message = body.message;
    } catch {
      // response body not JSON — use status-based message
    }
    throw new Error(message);
  }

  return res.json();
}

function authHeaders(token?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const api = {
  get: (path: string, token: string) =>
    request(path, { headers: authHeaders(token) }),

  post: (path: string, body: unknown, token?: string) =>
    request(path, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),

  put: (path: string, body: unknown, token: string) =>
    request(path, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }),

  delete: (path: string, token: string) =>
    request(path, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),

  ws: (token: string): WebSocket => {
    const wsUrl = API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    return new WebSocket(`${wsUrl}/api/v1/ws?token=${token}`);
  },
};
