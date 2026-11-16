// Prospect: app de prospecção de estúdios de IA/3D no Brasil e em Portugal.

const STATUSES = [
  { name: "A confirmar", c: "--st-confirmar" },
  { name: "A pesquisar contato", c: "--st-pesquisar" },
  { name: "Pronto p/ contato", c: "--st-pronto" },
  { name: "Portfólio enviado", c: "--st-enviado" },
  { name: "Respondeu", c: "--st-respondeu" },
  { name: "Reunião marcada", c: "--st-reuniao" },
  { name: "Sem retorno", c: "--st-sem" },
];
const ACTIVE = ["Portfólio enviado", "Respondeu", "Reunião marcada"];
const PRIORITIES = ["Alta", "Média", "Baixa"];
const COUNTRIES = { BR: { label: "Brasil", flag: "🇧🇷" }, PT: { label: "Portugal", flag: "🇵🇹" } };
const LOCAL_KEY = "prospectjobs.progress.v1";

const state = {
  data: { studios: [] },
  progress: {},
  sync: { mode: "connecting", email: null },
  filters: { q: "", country: new Set(), priority: new Set(), focus: new Set() },
};

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);
const statusColor = (name) => `var(${STATUSES.find((s) => s.name === name)?.c || "--muted"})`;
const fmtDate = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(/\.$/, "") : "");
const prioClass = (p) => norm(p || "");
const keyOf = (s, c) => `${s.id}::${c ? c.name : "_"}`;

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("#toasts").append(t);
  setTimeout(() => t.remove(), 2800);
}

// ---------- progress (local + cloud) ----------
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { return {}; }
}
function saveLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state.progress)); } catch {}
}
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    if (!out[k] || (v.updatedAt || "") > (out[k].updatedAt || "")) out[k] = v;
  }
  return out;
}

async function pullCloud() {
  try {
    const r = await fetch("/api/progress", { credentials: "same-origin", headers: { accept: "application/json" } });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.includes("json")) throw new Error(String(r.status));
    const body = await r.json();
    state.sync = { mode: "cloud", email: body.email };
    const merged = merge(state.progress, body.progress);
    const changed = JSON.stringify(merged) !== JSON.stringify(body.progress);
    state.progress = merged;
    saveLocal();
    if (changed) pushCloud();
  } catch {
    state.sync = { mode: "local", email: null };
  }
  paintSync();
}

let pushTimer;
function pushCloud() {
  if (state.sync.mode !== "cloud") return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const r = await fetch("/api/progress", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress: state.progress }),
      });
      if (!r.ok) throw new Error();
    } catch {
      toast("Não salvou na nuvem. Ficou guardado neste aparelho e tento de novo na próxima mudança.");
    }
  }, 600);
}

function setProgress(key, patch) {
  const cur = state.progress[key] || {};
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  for (const k of Object.keys(next)) if (next[k] === "" || next[k] == null) delete next[k];
  state.progress[key] = next;
  saveLocal();
  pushCloud();
}

function paintSync() {
  const el = $("#sync");
  el.dataset.mode = state.sync.mode;
  $(".sync__label", el).textContent =
    state.sync.mode === "cloud" ? "Sincronizado" : state.sync.mode === "local" ? "Só neste aparelho" : "Conectando…";
}

// ---------- model ----------
function defaultStatus(s, c) {
  if (!s.confirmed) return "A confirmar";
  return c ? "Pronto p/ contato" : "A pesquisar contato";
}
function entries() {
  const out = [];
  for (const s of state.data.studios) {
    const list = s.contacts.length ? s.contacts : [null];
    for (const c of list) {
      const key = keyOf(s, c);
      const p = state.progress[key] || {};
      out.push({ s, c, key, p, status: p.status || defaultStatus(s, c), priority: c?.priority || studioPriority(s) });
    }
  }
  return out;
}
function studioPriority(s) {
  const ps = s.contacts.map((c) => c.priority);
  return PRIORITIES.find((p) => ps.includes(p)) || "Média";
}
function studioStage(s) {
  const st = entries().filter((e) => e.s === s).map((e) => e.status);
  const order = ["Reunião marcada", "Respondeu", "Portfólio enviado", "Pronto p/ contato", "A pesquisar contato", "A confirmar", "Sem retorno"];
  return order.find((o) => st.includes(o)) || st[0];
}
const linkedinFor = (c, s) => {
  const org = /independente/i.test(s.group) ? s.name : s.group.replace(/\(.*?\)|\?/g, "").trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(c ? `${c.name} ${org}` : org)}`;
};
const focusBuckets = ["IA", "3D", "VFX", "Animação", "Audiovisual"];
const hasFocus = (s, f) => norm(s.focus.join(" ")).includes(norm(f));

// ---------- router ----------
const routes = { inicio: renderHome, estudios: renderStudios, pipeline: renderPipeline, ajustes: renderSettings };
function route() {
  const [, page = "inicio", id] = location.hash.split("/");
  const fn = routes[page] || renderHome;
  document.querySelectorAll(".nav a").forEach((a) => { if (a.dataset.route !== page) a.removeAttribute("aria-current"); else a.setAttribute("aria-current", "page"); });
  fn();
  if (id) openSheet(decodeURIComponent(id)); else closeSheet(false);
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
function rerender() {
  const [, page = "inicio"] = location.hash.split("/");
  (routes[page] || renderHome)();
}

// ---------- Início ----------
function renderHome() {
  const all = entries();
  const people = all.filter((e) => e.c);
  const count = (n) => all.filter((e) => e.status === n).length;
  const h = new Date().getHours();
  const hello = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";

  const next = people
    .filter((e) => e.status === "Pronto p/ contato")
    .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority))
    .slice(0, 8);
  const follow = people
    .filter((e) => e.p.followUp && !["Reunião marcada", "Sem retorno"].includes(e.status))
    .sort((a, b) => a.p.followUp.localeCompare(b.p.followUp))
    .slice(0, 8);
  const sentNoFollow = people.filter((e) => e.status === "Portfólio enviado" && !e.p.followUp).slice(0, 5);

  const row = (e, right) => `
    <li class="row" data-open="${esc(e.s.id)}">
      <span class="prio ${prioClass(e.priority)}" title="Prioridade ${esc(e.priority)}"></span>
      <div><b>${esc(e.c?.name || "Sem contato")}</b><small>${esc(e.c?.role || "")}${e.c ? " · " : ""}${esc(e.s.name)}</small></div>
      ${right}
    </li>`;

  const total = all.length || 1;
  const bar = STATUSES.map((s) => `<span style="width:${(count(s.name) / total) * 100}%;background:${statusColor(s.name)}" title="${esc(s.name)}"></span>`).join("");
  const legend = STATUSES.map((s) => `<li><i style="background:${statusColor(s.name)}"></i>${esc(s.name)}<b>${count(s.name)}</b></li>`).join("");

  $("#page").innerHTML = `
    <header class="page-head"><div>
      <h1>${hello}, Kayque</h1>
      <p class="lede"><b>${count("Pronto p/ contato")} pessoas</b> prontas para receber seu portfólio, em ${state.data.studios.length} estúdios.
      ${count("Portfólio enviado")} já receberam e ${count("Respondeu") + count("Reunião marcada")} responderam.</p>
    </div></header>
    <div class="home">
      <div class="col">
        <section class="block">
          <h2>Para enviar agora</h2>
          <p class="hint">Prioridade alta primeiro. Abra a ficha, mande o portfólio e marque como enviado.</p>
          ${next.length ? `<ul class="rows">${next.map((e) => row(e, `<span class="pill" style="--c:var(--signal)">${esc(e.priority)}</span>`)).join("")}</ul>` : `<p class="empty">Ninguém na fila. Veja os estúdios marcados "A pesquisar contato".</p>`}
        </section>
        <section class="block">
          <h2>Follow-ups</h2>
          <p class="hint">Quem você marcou para voltar a falar.</p>
          ${follow.length ? `<ul class="rows">${follow.map((e) => row(e, `<span class="when ${e.p.followUp <= today() ? "late" : ""}">${e.p.followUp < today() ? "Atrasado · " : e.p.followUp === today() ? "Hoje · " : ""}${fmtDate(e.p.followUp)}</span>`)).join("")}</ul>` : `<p class="empty">Nenhum follow-up marcado. Ao enviar um portfólio, defina uma data para voltar a falar.</p>`}
          ${sentNoFollow.length ? `<p class="hint" style="margin-top:12px">Enviados sem data de follow-up: ${sentNoFollow.map((e) => `<a href="#/inicio/${esc(e.s.id)}">${esc(e.c.name)}</a>`).join(", ")}.</p>` : ""}
        </section>
      </div>
      <div class="col">
        <section class="block">
          <h2>Seu funil</h2>
          <div class="funnel">${bar}</div>
          <ul class="legend">${legend}</ul>
        </section>
        <section class="block">
          <h2>Por país</h2>
          <ul class="legend">
            ${Object.entries(COUNTRIES).map(([k, v]) => `<li>${v.flag} ${v.label}<b>${state.data.studios.filter((s) => s.country === k || s.alsoCountry === k).length} estúdios</b></li>`).join("")}
          </ul>
          <p class="hint" style="margin:12px 0 0">Dados atualizados em ${fmtDate(state.data.updated)}. Novos estúdios entram toda segunda.</p>
        </section>
      </div>
    </div>`;
  bindOpeners();
}

// ---------- Estúdios ----------
function filteredStudios() {
  const f = state.filters;
  return state.data.studios.filter((s) => {
    const countries = [s.country, s.alsoCountry].filter(Boolean);
    if (f.country.size && !countries.some((c) => f.country.has(c))) return false;
    if (f.priority.size && !f.priority.has(studioPriority(s))) return false;
    if (f.focus.size && ![...f.focus].some((x) => hasFocus(s, x))) return false;
    if (f.q) {
      const hay = norm([s.name, s.group, s.city, s.focus.join(" "), s.notes, ...s.contacts.map((c) => `${c.name} ${c.role}`)].join(" "));
      if (!norm(f.q).split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

function renderStudios() {
  const f = state.filters;
  const chip = (group, value, label) => `<button class="chip" data-f="${group}" data-v="${esc(value)}" aria-pressed="${f[group].has(value)}">${esc(label)}</button>`;
  $("#page").innerHTML = `
    <header class="page-head"><div>
      <h1>Estúdios</h1>
      <p class="lede">Agências e produtoras com núcleo de IA, 3D ou audiovisual. Toque num estúdio para ver as pessoas e os links.</p>
    </div></header>
    <div class="toolbar">
      <label class="search"><svg><use href="#i-search"/></svg><span class="sr">Buscar</span>
        <input id="q" type="search" placeholder="Buscar estúdio, pessoa ou cidade" value="${esc(f.q)}"></label>
      <div class="chips">${Object.entries(COUNTRIES).map(([k, v]) => chip("country", k, `${v.flag} ${v.label}`)).join("")}</div>
      <div class="chips">${PRIORITIES.map((p) => chip("priority", p, `Prioridade ${p.toLowerCase()}`)).join("")}</div>
      <div class="chips">${focusBuckets.map((x) => chip("focus", x, x)).join("")}</div>
    </div>
    <div class="tiles" id="tiles"></div>`;

  const paint = () => {
    const list = filteredStudios().sort((a, b) =>
      (a.confirmed === b.confirmed ? 0 : a.confirmed ? -1 : 1) ||
      PRIORITIES.indexOf(studioPriority(a)) - PRIORITIES.indexOf(studioPriority(b)) ||
      a.name.localeCompare(b.name));
    $("#tiles").innerHTML = list.length ? list.map(tile).join("") : `<p class="empty">Nada com esses filtros. Limpe a busca ou desmarque um filtro.</p>`;
    bindOpeners();
  };
  paint();

  $("#q").addEventListener("input", (e) => { f.q = e.target.value.trim(); paint(); });
  document.querySelectorAll(".chip[data-f]").forEach((b) =>
    b.addEventListener("click", () => {
      const set = f[b.dataset.f];
      set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v);
      b.setAttribute("aria-pressed", String(set.has(b.dataset.v)));
      paint();
    }));
}

function tile(s) {
  const flags = [s.country, s.alsoCountry].filter(Boolean).map((c) => COUNTRIES[c].flag).join(" ");
  const stage = studioStage(s);
  return `
    <button class="tile ${studioPriority(s) === "Alta" ? "is-alta" : ""} ${s.confirmed ? "" : "is-unconfirmed"}" data-open="${esc(s.id)}">
      <div class="tile__top">
        <div><h3>${esc(s.name)}</h3><div class="group">${esc(s.group)}</div></div>
        <span class="flag" aria-label="${[s.country, s.alsoCountry].filter(Boolean).map((c) => COUNTRIES[c].label).join(" e ")}">${flags}</span>
      </div>
      <ul class="tags">${s.focus.slice(0, 4).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <div class="tile__foot">
        <span>${s.contacts.length ? `${s.contacts.length} ${s.contacts.length === 1 ? "pessoa" : "pessoas"}` : "Sem contato ainda"}${s.city ? ` · ${esc(s.city)}` : ""}</span>
        <span class="pill" style="--c:${statusColor(stage)}">${esc(stage)}</span>
      </div>
    </button>`;
}

// ---------- Pipeline ----------
function renderPipeline() {
  const all = entries();
  $("#page").innerHTML = `
    <header class="page-head"><div>
      <h1>Pipeline</h1>
      <p class="lede">Arraste uma pessoa para outra coluna quando o status mudar. No celular, toque no card e mude na ficha.</p>
    </div></header>
    <div class="board">
      ${STATUSES.map((st) => {
        const items = all.filter((e) => e.status === st.name);
        return `<section class="lane" data-status="${esc(st.name)}" style="--c:var(${st.c})">
          <h3>${esc(st.name)} <span>${items.length}</span></h3>
          ${items.map((e) => `
            <div class="card" draggable="true" data-key="${esc(e.key)}" data-open="${esc(e.s.id)}" tabindex="0">
              <b>${esc(e.c?.name || "Sem contato")}</b>
              <small>${esc(e.s.name)}</small>
              <div class="meta"><span class="prio ${prioClass(e.priority)}"></span>${esc(e.priority)}${e.p.followUp ? ` · volta ${fmtDate(e.p.followUp)}` : ""}</div>
            </div>`).join("")}
        </section>`;
      }).join("")}
    </div>`;

  let dragKey = null;
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("dragstart", (ev) => { dragKey = card.dataset.key; card.classList.add("is-dragging"); ev.dataTransfer.effectAllowed = "move"; });
    card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
  });
  document.querySelectorAll(".lane").forEach((lane) => {
    lane.addEventListener("dragover", (ev) => { ev.preventDefault(); lane.classList.add("is-over"); });
    lane.addEventListener("dragleave", () => lane.classList.remove("is-over"));
    lane.addEventListener("drop", (ev) => {
      ev.preventDefault();
      lane.classList.remove("is-over");
      if (!dragKey) return;
      changeStatus(dragKey, lane.dataset.status);
      dragKey = null;
      renderPipeline();
    });
  });
  bindOpeners();
}

function changeStatus(key, status) {
  const cur = state.progress[key] || {};
  const patch = { status };
  if (status === "Portfólio enviado" && !cur.lastContact) patch.lastContact = today();
  if (status === "Portfólio enviado" && !cur.followUp) {
    const d = new Date(); d.setDate(d.getDate() + 7);
    patch.followUp = d.toISOString().slice(0, 10);
  }
  setProgress(key, patch);
  if (patch.followUp) toast(`Marcado como enviado. Follow-up sugerido para ${fmtDate(patch.followUp)}.`);
}

// ---------- Ajustes ----------
function renderSettings() {
  const cloud = state.sync.mode === "cloud";
  $("#page").innerHTML = `
    <header class="page-head"><div><h1>Ajustes</h1></div></header>
    <section class="block">
      <h2>Sincronização</h2>
      ${cloud
        ? `<p class="hint">Seu progresso está salvo na nuvem e aparece igual em qualquer aparelho em que você entrar com <b>${esc(state.sync.email)}</b>.</p>`
        : `<p class="hint">Seu progresso está salvo só neste aparelho. Para sincronizar entre computador e celular, ative o Cloudflare Access neste domínio:</p>
           <ol class="steps">
             <li>No Cloudflare, abra o Worker <b>prospectjobs</b> e vá na aba <b>Access</b> (ou em Zero Trust → Access → Applications).</li>
             <li>Proteja o domínio do app e libere só o seu e-mail.</li>
             <li>Volte aqui e recarregue a página. O ponto ao lado de "Sincronizado" fica verde.</li>
           </ol>`}
    </section>
    <section class="block">
      <h2>Cópia de segurança</h2>
      <p class="hint">Baixe seu progresso (status, datas e notas) ou carregue um arquivo baixado antes.</p>
      <div class="links">
        <button class="btn" id="export">Baixar progresso</button>
        <label class="btn">Carregar progresso<input id="import" type="file" accept="application/json" hidden></label>
      </div>
    </section>
    <section class="block">
      <h2>Instalar no celular</h2>
      <p class="hint">No iPhone, abra no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início". No Android, abra no Chrome e toque em "Instalar app".</p>
    </section>
    <section class="block">
      <h2>Sobre os dados</h2>
      <dl class="kv">
        <dt>Estúdios</dt><dd>${state.data.studios.length}</dd>
        <dt>Pessoas</dt><dd>${state.data.studios.reduce((n, s) => n + s.contacts.length, 0)}</dd>
        <dt>Atualizado em</dt><dd>${fmtDate(state.data.updated)}</dd>
      </dl>
      <p class="hint" style="margin-top:12px">Toda segunda, uma pesquisa automática procura estúdios novos e mudanças de cargo e atualiza esta lista.</p>
    </section>`;

  $("#export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.progress, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prospect-progresso-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      if (typeof incoming !== "object" || Array.isArray(incoming)) throw new Error();
      state.progress = merge(state.progress, incoming);
      saveLocal();
      pushCloud();
      toast("Progresso carregado.");
    } catch {
      toast("Esse arquivo não é um progresso do Prospect. Use o arquivo baixado aqui.");
    }
    e.target.value = "";
  });
}

// ---------- Ficha (sheet) ----------
let lastFocus = null;
function bindOpeners() {
  document.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => {
      const [, page = "inicio"] = location.hash.split("/");
      go(`#/${page}/${encodeURIComponent(el.dataset.open)}`);
    });
    if (el.classList.contains("card") || el.classList.contains("row")) {
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") el.click(); });
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    }
  });
}

function openSheet(id) {
  const s = state.data.studios.find((x) => x.id === id);
  if (!s) return;
  lastFocus = document.activeElement;
  const flags = [s.country, s.alsoCountry].filter(Boolean).map((c) => `${COUNTRIES[c].flag} ${COUNTRIES[c].label}`).join(" e ");
  const people = s.contacts.length ? s.contacts : [null];

  const sheet = $("#sheet");
  sheet.innerHTML = `
    <button class="sheet__close" id="close" aria-label="Fechar"><svg><use href="#i-x"/></svg></button>
    <h2 id="sheet-title">${esc(s.name)}</h2>
    <p class="group">${esc(s.group)}</p>
    <p class="place">${flags}${s.city ? ` · ${esc(s.city)}` : ""}</p>
    <ul class="tags">${s.focus.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="links">
      ${s.site ? `<a class="btn solid" href="${esc(s.site)}" target="_blank" rel="noopener"><svg><use href="#i-globe"/></svg>${esc(new URL(s.site).hostname.replace(/^www\./, ""))}</a>` : ""}
      ${s.instagram ? `<a class="btn" href="https://www.instagram.com/${esc(s.instagram)}/" target="_blank" rel="noopener"><svg><use href="#i-ig"/></svg>@${esc(s.instagram)}</a>` : ""}
      ${(s.extraLinks || []).map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener"><svg><use href="#${l.url.includes("instagram") ? "i-ig" : "i-globe"}"/></svg>${esc(l.label)}</a>`).join("")}
      <a class="btn" href="${linkedinFor(null, s)}" target="_blank" rel="noopener"><svg><use href="#i-in"/></svg>Pessoas no LinkedIn</a>
    </div>
    ${s.confirmed ? "" : `<p class="warn">Estúdio ainda não confirmado. Confira antes de mandar portfólio.</p>`}
    ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ""}
    <h3>${s.contacts.length ? "Pessoas" : "Contato"}</h3>
    ${people.map((c) => personBlock(s, c)).join("")}
    ${s.sources.length ? `<p class="sources">Fontes: ${s.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join("")}</p>` : ""}`;

  $("#scrim").hidden = false;
  sheet.hidden = false;
  document.body.style.overflow = "hidden";
  $("#close").focus();
  $("#close").addEventListener("click", () => closeSheet(true));

  sheet.querySelectorAll("[data-key]").forEach((wrap) => {
    const key = wrap.dataset.key;
    const st = wrap.querySelector("select");
    st.addEventListener("change", () => {
      changeStatus(key, st.value);
      const p = state.progress[key] || {};
      wrap.querySelector('[name="lastContact"]').value = p.lastContact || "";
      wrap.querySelector('[name="followUp"]').value = p.followUp || "";
      rerender();
    });
    wrap.querySelectorAll("input[type=date]").forEach((inp) =>
      inp.addEventListener("change", () => { setProgress(key, { [inp.name]: inp.value }); rerender(); }));
    const note = wrap.querySelector("textarea");
    note.addEventListener("change", () => setProgress(key, { note: note.value }));
  });
}

function personBlock(s, c) {
  const key = keyOf(s, c);
  const p = state.progress[key] || {};
  const status = p.status || defaultStatus(s, c);
  return `
    <div class="person" data-key="${esc(key)}">
      <div class="person__top">
        <div class="person__who">
          <b>${esc(c?.name || "Ainda sem nome")}</b>
          <small>${esc(c ? `${c.role} · ${c.kind}` : "Procure quem coordena IA, 3D ou novos negócios.")}</small>
          ${c?.note ? `<small class="note">${esc(c.note)}</small>` : ""}
        </div>
        <div class="person__acts">
          ${c ? `<span class="pill" style="--c:var(--signal)">${esc(c.priority)}</span>` : ""}
          <a class="btn small" href="${linkedinFor(c, s)}" target="_blank" rel="noopener"><svg><use href="#i-in"/></svg>LinkedIn</a>
          ${c?.email ? `<a class="btn small" href="mailto:${esc(c.email)}"><svg><use href="#i-mail"/></svg>E-mail</a>` : ""}
        </div>
      </div>
      <div class="fields">
        <label>Status<select>${STATUSES.map((x) => `<option ${x.name === status ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
        <label>Último contato<input type="date" name="lastContact" value="${esc(p.lastContact || "")}"></label>
        <label>Voltar a falar em<input type="date" name="followUp" value="${esc(p.followUp || "")}"></label>
      </div>
      <textarea placeholder="Anotações: o que você mandou, o que responderam…" aria-label="Anotações sobre ${esc(c?.name || s.name)}">${esc(p.note || "")}</textarea>
    </div>`;
}

function closeSheet(updateHash) {
  const sheet = $("#sheet");
  if (sheet.hidden) return;
  sheet.hidden = true;
  $("#scrim").hidden = true;
  document.body.style.overflow = "";
  if (updateHash) {
    const [, page = "inicio"] = location.hash.split("/");
    history.pushState(null, "", `#/${page}`);
    rerender();
  }
  lastFocus?.focus?.();
}

// ---------- boot ----------
async function boot() {
  state.progress = loadLocal();
  paintSync();
  $("#scrim").addEventListener("click", () => closeSheet(true));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(true); });
  $("#sync").addEventListener("click", () => go("#/ajustes"));
  window.addEventListener("hashchange", route);

  try {
    const r = await fetch("/data/studios.json", { cache: "no-cache" });
    state.data = await r.json();
  } catch {
    $("#page").innerHTML = `<p class="empty">Não consegui carregar a lista de estúdios. Verifique a conexão e recarregue.</p>`;
    return;
  }
  if (!location.hash) history.replaceState(null, "", "#/inicio");
  route();
  await pullCloud();
  rerender();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}
boot();
