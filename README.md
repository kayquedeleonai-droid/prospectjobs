# Prospect

App para mapear agências e produtoras no Brasil e em Portugal com estúdios de IA, 3D, VFX ou audiovisual, e acompanhar o envio de portfólio para as pessoas certas.

## O que tem no app

- **Início:** quem está pronto para receber portfólio (prioridade alta primeiro), follow-ups do dia e atrasados, e o funil.
- **Estúdios:** busca e filtros por país, prioridade e foco (IA, 3D, VFX, animação, audiovisual). Cada estúdio abre uma ficha com site, Instagram, LinkedIn e as pessoas.
- **Pipeline:** colunas por status. No computador, arraste a pessoa de uma coluna para outra.
- **Ajustes:** status da sincronização, cópia de segurança e como instalar no celular.

Ao marcar "Portfólio enviado", o app preenche a data de hoje e sugere um follow-up para 7 dias depois.

Funciona como app instalável (PWA): no iPhone, "Adicionar à Tela de Início"; no Android, "Instalar app".

## Estrutura

```
public/                 site estático
  index.html, app.css, app.js
  data/studios.json     estúdios, pessoas, links e fontes (a lista)
  sw.js, manifest.webmanifest, icons/
worker/index.js         API /api/progress (salva o progresso no KV)
wrangler.jsonc          configuração do Worker no Cloudflare
```

Sem etapa de build. O Worker serve `public/` e responde em `/api/progress`.

## Sincronização

O progresso (status, datas, notas) fica salvo no navegador e, quando o domínio está protegido pelo **Cloudflare Access**, também no KV `prospectjobs-progress`, por e-mail. Sem Access, a API responde 401 e o app funciona só no aparelho (o indicador na barra lateral fica amarelo).

## Deploy

1. Cloudflare → Workers & Pages → Create → Import a repository → `kayquedeleonai-droid/prospectjobs`. Deixe o build command vazio; o deploy command padrão (`npx wrangler deploy`) já lê o `wrangler.jsonc`.
2. No Worker, aba Domains → Add → o subdomínio que quiser.
3. Aba Access (ou Zero Trust → Access → Applications) → proteja o domínio e libere só o seu e-mail.

## Atualização da lista

Toda segunda, uma tarefa agendada pesquisa estúdios novos e mudanças de cargo, edita `public/data/studios.json` e faz commit em `main`. Regras:
- Cada estúdio tem pelo menos uma fonte em `sources`.
- Nunca inventar e-mail. Só entra e-mail publicado em fonte oficial.
- `confirmed: false` para estúdio cuja existência ou ligação com a agência não foi confirmada.
- Não apagar estúdios nem pessoas; se alguém saiu, registrar em `note`.

## Rodar localmente

```
npx wrangler dev
```
