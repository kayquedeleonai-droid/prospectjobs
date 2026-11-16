// API do Prospect: guarda o progresso (status, notas, follow-ups) no KV.
// Só grava para quem passou pelo Cloudflare Access, que manda o e-mail no header abaixo.
// Sem Access, a API responde 401 e o app continua funcionando só no navegador.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function who(request) {
  return request.headers.get("cf-access-authenticated-user-email");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/progress") {
      const email = who(request);
      if (!email) return json({ error: "access", message: "Ative o Cloudflare Access neste domínio para sincronizar." }, 401);
      if (!env.PROGRESS) return json({ error: "storage", message: "Armazenamento não configurado." }, 503);
      const key = `progress:${email.toLowerCase()}`;

      if (request.method === "GET") {
        const data = (await env.PROGRESS.get(key, "json")) || {};
        return json({ email, progress: data });
      }

      if (request.method === "PUT") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "body", message: "Corpo inválido." }, 400);
        }
        if (!body || typeof body.progress !== "object" || Array.isArray(body.progress)) {
          return json({ error: "body", message: "Envie { progress: {...} }." }, 400);
        }
        const raw = JSON.stringify(body.progress);
        if (raw.length > 512 * 1024) return json({ error: "size", message: "Progresso grande demais." }, 413);
        await env.PROGRESS.put(key, raw);
        return json({ ok: true, savedAt: new Date().toISOString() });
      }

      return json({ error: "method" }, 405);
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
