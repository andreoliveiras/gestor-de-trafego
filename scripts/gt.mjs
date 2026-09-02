#!/usr/bin/env node
// gestor-de-trafego: CLI de leitura da Meta Ads API + plataformas de pagamento.
//
//   node gt.mjs setup                     cria ~/.gestor-de-trafego/ com config e .env
//   node gt.mjs contas                    lista as contas de anuncio que o token acessa
//   node gt.mjs relatorio --conta "Nome"  insights da conta (campanha por padrao)
//   node gt.mjs vendas    --conta "Nome"  vendas pagas na plataforma de pagamento
//   node gt.mjs cruzar    --conta "Nome"  ROAS real: gasto da Meta x venda aprovada
//
// Tudo aqui e somente leitura. Nenhum comando cria, edita ou pausa campanha.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(homedir(), ".gestor-de-trafego");
const CONFIG = join(RAIZ, "config.json");
const ENVFILE = join(RAIZ, ".env");
const SKILLDIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ base */

function carregarEnv() {
  if (!existsSync(ENVFILE)) return;
  for (const linha of readFileSync(ENVFILE, "utf8").split("\n")) {
    const l = linha.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i === -1) continue;
    const chave = l.slice(0, i).trim();
    const valor = l.slice(i + 1).trim();
    if (!process.env[chave]) process.env[chave] = valor;
  }
}

function carregarConfig() {
  if (!existsSync(CONFIG)) {
    erro(`Nao encontrei ${CONFIG}.\nRode primeiro:  node ${process.argv[1]} setup`);
  }
  return JSON.parse(readFileSync(CONFIG, "utf8"));
}

function acharConta(config, nome) {
  const lista = config.contas || [];
  if (!lista.length) erro("Nenhuma conta em config.json. Edite o arquivo e cadastre a sua.");
  if (!nome) return lista[0];
  const achada = lista.find((c) => c.nome.toLowerCase().includes(nome.toLowerCase()));
  if (!achada) erro(`Conta "${nome}" nao existe no config. Cadastradas: ${lista.map((c) => c.nome).join(", ")}`);
  return achada;
}

function erro(msg) {
  console.error("\n" + msg + "\n");
  process.exit(1);
}

function args() {
  const a = process.argv.slice(3);
  const out = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) out[a[i].slice(2)] = a[i + 1]?.startsWith("--") ? true : a[++i];
  }
  return out;
}

const BRL = (n) => "R$" + (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const BRL2 = (n) => "R$" + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const limpo = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const N2 = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s, n) => limpo(s).slice(0, n).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

/* ------------------------------------------------------------- meta api */

async function graphGet(path, params = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || token.startsWith("cole_")) {
    erro(`META_ACCESS_TOKEN nao configurado em ${ENVFILE}.\nGere um token em developers.facebook.com com a permissao ads_read.`);
  }
  const versao = process.env.META_API_VERSION || "v21.0";
  const url = new URL(`https://graph.facebook.com/${versao}/${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

  let dados = [];
  let proxima = url.toString();
  while (proxima) {
    const resp = await fetch(proxima);
    const json = await resp.json();
    if (json.error) erro(`Meta API (codigo ${json.error.code}): ${json.error.message}`);
    if (!Array.isArray(json.data)) return json;
    dados = dados.concat(json.data);
    proxima = json.paging?.next || null;
  }
  return { data: dados };
}

const CAMPOS = "campaign_name,adset_name,ad_name,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas";

function acao(lista, tipos) {
  if (!Array.isArray(lista)) return 0;
  for (const t of tipos) {
    const m = lista.find((x) => x.action_type === t);
    if (m) return Number(m.value) || 0;
  }
  return 0;
}

function enriquecer(row) {
  const gasto = Number(row.spend) || 0;
  const compras = acao(row.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
  const leads = acao(row.actions, ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"]);
  const receita = acao(row.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
  const roasMeta = acao(row.purchase_roas, ["purchase", "omni_purchase"]);
  return {
    nome: row.ad_name || row.adset_name || row.campaign_name || "conta",
    campanha: row.campaign_name,
    data: row.date_start,
    gasto,
    impressoes: Number(row.impressions) || 0,
    cliques: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    cpc: Number(row.cpc) || 0,
    cpm: Number(row.cpm) || 0,
    frequencia: Number(row.frequency) || 0,
    lpv: acao(row.actions, ["landing_page_view"]),
    checkouts: acao(row.actions, ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"]),
    leads,
    compras,
    receita,
    cpa: compras ? gasto / compras : null,
    roas: roasMeta || (gasto ? receita / gasto : null),
  };
}

async function insights(accountId, { nivel = "campaign", preset, since, until, porDia = false } = {}) {
  const p = { level: nivel, fields: CAMPOS, limit: 200 };
  if (since && until) p.time_range = JSON.stringify({ since, until });
  else p.date_preset = preset || "last_7d";
  if (porDia) p.time_increment = 1;
  const { data } = await graphGet(`${accountId}/insights`, p);
  return data.map(enriquecer);
}

/* -------------------------------------------------- plataformas de venda */

const cacheToken = new Map();

// O dia de uma venda tem que ser o dia no fuso da conta de anuncio, nao em UTC.
// Sem isso, venda da noite cai no dia seguinte e o cruzamento com a Meta desalinha.
const FUSO_PADRAO = "America/Sao_Paulo";
const diaLocal = (iso, fuso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: fuso || FUSO_PADRAO });
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
const somarDias = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

async function tokenKiwify(conta) {
  const id = process.env[conta.env_client_id];
  const secret = process.env[conta.env_client_secret];
  if (!id || !secret) erro(`Credenciais da Kiwify faltando no .env: ${conta.env_client_id} e ${conta.env_client_secret}`);
  const cache = cacheToken.get(id);
  if (cache && cache.exp > Date.now()) return cache.tk;
  const body = new URLSearchParams({ client_id: id, client_secret: secret });
  const resp = await fetch("https://public-api.kiwify.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) erro(`Kiwify OAuth (${resp.status}): ${JSON.stringify(json)}`);
  cacheToken.set(id, { tk: json.access_token, exp: Date.now() + (json.expires_in || 3600) * 1000 - 30000 });
  return json.access_token;
}

// A API da Kiwify devolve no maximo cerca de uma semana por chamada: pedir 30 dias
// retorna so o final do periodo, e o cruzamento sai com menos vendas do que existe.
// Por isso a janela e fatiada em pedacos de 7 dias e as transacoes sao deduplicadas.
async function vendasKiwify(conta, { since, until }) {
  const PASSO = 7;
  if (diasEntre(since, until) > PASSO) {
    const vistas = new Map();
    let ini = since;
    while (ini <= until) {
      const fim = somarDias(ini, PASSO - 1) > until ? until : somarDias(ini, PASSO - 1);
      for (const v of await vendasKiwify(conta, { since: ini, until: fim })) vistas.set(v.id, v);
      ini = somarDias(fim, 1);
    }
    return [...vistas.values()];
  }
  // A API da Kiwify trata end_date como exclusivo: pedimos um dia a mais e recortamos depois.
  const untilApi = somarDias(until, 1);
  const tk = await tokenKiwify(conta);
  const accountId = process.env[conta.env_account_id];
  if (!accountId) erro(`Falta ${conta.env_account_id} no .env (o account id da Kiwify).`);
  let itens = [];
  let page = 1;
  let total = 1;
  do {
    const q = new URLSearchParams({ start_date: somarDias(since, -1), end_date: untilApi, page_size: "100", page_number: String(page) });
    const resp = await fetch(`https://public-api.kiwify.com/v1/sales?${q}`, {
      headers: { Authorization: `Bearer ${tk}`, "x-kiwify-account-id": accountId },
    });
    const json = await resp.json();
    if (!resp.ok) erro(`Kiwify API (${resp.status}): ${JSON.stringify(json)}`);
    itens = itens.concat(json.data || json.sales || []);
    total = json.pagination?.total_pages || 1;
    page++;
  } while (page <= total);
  // ATENCAO: a API da Kiwify devolve apenas net_amount, que e o LIQUIDO do produtor,
  // ja descontada a taxa da plataforma. Nao e o preco pago pelo cliente. Numa venda de
  // R$597 no cartao, o net_amount fica por volta de R$542 a R$554 conforme o parcelamento.
  // O ROAS calculado aqui e sobre o que entra no caixa, que e mais conservador e melhor
  // para decidir escala. Nunca chame esse numero de faturamento bruto.
  return itens.map((v) => ({
    id: v.id,
    dia: diaLocal(v.created_at, conta.fuso),
    preco: (v.net_amount || 0) / 100,
    status: v.status,
    pago: v.status === "paid",
    nova: true,
    produto: v.product?.name || "",
  })).filter((v) => v.dia >= since && v.dia <= until);
}

async function vendasHotmart(conta, { since, until }) {
  const id = process.env[conta.env_client_id];
  const secret = process.env[conta.env_client_secret];
  if (!id || !secret) erro(`Credenciais da Hotmart faltando no .env: ${conta.env_client_id} e ${conta.env_client_secret}`);
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const resp = await fetch(
    `https://api-sec-vlc.hotmart.com/security/oauth/token?grant_type=client_credentials&client_id=${id}&client_secret=${secret}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } }
  );
  const json = await resp.json();
  if (!resp.ok || !json.access_token) erro(`Hotmart OAuth (${resp.status}): ${JSON.stringify(json)}`);
  const tk = json.access_token;

  const ini = new Date(`${since}T00:00:00-03:00`).getTime();
  const fim = new Date(`${until}T23:59:59-03:00`).getTime();
  let itens = [];
  let pageToken;
  do {
    const q = new URLSearchParams({ start_date: String(ini), end_date: String(fim), max_results: "500" });
    if (pageToken) q.set("page_token", pageToken);
    const r = await fetch(`https://developers.hotmart.com/payments/api/v1/sales/history?${q}`, {
      headers: { Authorization: `Bearer ${tk}` },
    });
    const j = await r.json();
    if (!r.ok) erro(`Hotmart API (${r.status}): ${JSON.stringify(j)}`);
    itens = itens.concat(j.items || []);
    pageToken = j.page_info?.next_page_token;
  } while (pageToken);

  return itens.map((v) => {
    const rec = v.purchase.recurrency_number;
    return {
      id: v.purchase.transaction,
      dia: diaLocal(v.purchase.order_date, conta.fuso),
      preco: v.purchase.price.value,
      status: v.purchase.status,
      pago: v.purchase.status === "APPROVED" || v.purchase.status === "COMPLETE",
      // renovacao de assinatura nao e venda nova: o Meta so ve a primeira
      nova: rec == null || rec <= 1,
      produto: v.product.name,
    };
  });
}

async function buscarVendas(conta, periodo) {
  if (!conta.plataforma) erro(`A conta "${conta.nome}" nao tem plataforma de pagamento no config.json.`);
  if (conta.plataforma === "kiwify") return vendasKiwify(conta, periodo);
  if (conta.plataforma === "hotmart") return vendasHotmart(conta, periodo);
  erro(`Plataforma "${conta.plataforma}" nao suportada aqui. Use kiwify ou hotmart, ou exporte o CSV e cole os numeros no chat.`);
}

/* ------------------------------------------------------------- comandos */

async function cmdSetup() {
  mkdirSync(RAIZ, { recursive: true });
  if (!existsSync(CONFIG)) {
    writeFileSync(CONFIG, readFileSync(join(SKILLDIR, "config.exemplo.json"), "utf8"));
  }
  if (!existsSync(ENVFILE)) {
    writeFileSync(
      ENVFILE,
      `# Meta Ads: token com permissao ads_read (developers.facebook.com)\n` +
        `META_ACCESS_TOKEN=cole_seu_token_aqui\n\n` +
        `# Kiwify (opcional): App em Apps > API\n` +
        `KIWIFY_CLIENT_ID=\nKIWIFY_CLIENT_SECRET=\nKIWIFY_ACCOUNT_ID=\n\n` +
        `# Hotmart (opcional): Ferramentas > Credenciais Hotmart\n` +
        `HOTMART_CLIENT_ID=\nHOTMART_CLIENT_SECRET=\n`
    );
  }
  console.log(`
Pronto. Agora preencha os dois arquivos:

  ${ENVFILE}
     META_ACCESS_TOKEN e, se for cruzar venda, as credenciais da plataforma.

  ${CONFIG}
     o nome e o act_id de cada conta de anuncio sua.

Nao sabe o act_id? Preencha so o token e rode:
  node ${process.argv[1]} contas
`);
}

async function cmdContas() {
  const { data } = await graphGet("me/adaccounts", { fields: "name,account_id,account_status,currency", limit: 200 });
  if (!data.length) return console.log("O token nao enxerga nenhuma conta de anuncio.");
  console.log("");
  for (const c of data) {
    const st = c.account_status === 1 ? "ativa" : `status ${c.account_status}`;
    console.log(`  ${pad("act_" + c.account_id, 24)}${pad(c.name, 42)}${c.currency}  ${st}`);
  }
  console.log(`\n${data.length} conta(s). Copie o act_id certo para o config.json.\n`);
}

async function cmdRelatorio() {
  const a = args();
  const conta = acharConta(carregarConfig(), a.conta);
  const nivel = a.nivel || "campaign";
  const linhas = await insights(conta.account_id, { nivel, preset: a.preset, since: a.since, until: a.until });
  const periodo = a.since ? `${a.since} a ${a.until}` : a.preset || "last_7d";

  const t = linhas.reduce((s, r) => ({ gasto: s.gasto + r.gasto, compras: s.compras + r.compras, receita: s.receita + r.receita, cliques: s.cliques + r.cliques, imp: s.imp + r.impressoes, lpv: s.lpv + r.lpv, ck: s.ck + r.checkouts }), { gasto: 0, compras: 0, receita: 0, cliques: 0, imp: 0, lpv: 0, ck: 0 });

  console.log(`\n${conta.nome} · ${nivel} · ${periodo}\n`);
  console.log(`  ${pad("", 54)}${padL("gasto", 10)}${padL("compras", 9)}${padL("receita", 11)}${padL("ROAS", 7)}${padL("CPA", 9)}${padL("CTR", 7)}${padL("CPM", 8)}`);
  for (const r of linhas.sort((x, y) => y.gasto - x.gasto)) {
    console.log(`  ${pad(r.nome, 54)}${padL(BRL(r.gasto), 10)}${padL(r.compras, 9)}${padL(BRL(r.receita), 11)}${padL(r.roas ? N2(r.roas) : "-", 7)}${padL(r.cpa ? BRL(r.cpa) : "-", 9)}${padL(N2(r.ctr) + "%", 7)}${padL(BRL2(r.cpm), 9)}`);
  }
  console.log(`\n  ${pad("TOTAL", 54)}${padL(BRL(t.gasto), 10)}${padL(t.compras, 9)}${padL(BRL(t.receita), 11)}${padL(t.gasto ? N2(t.receita / t.gasto) : "-", 7)}${padL(t.compras ? BRL(t.gasto / t.compras) : "-", 9)}`);
  if (t.lpv) {
    console.log(`\n  Funil: ${t.lpv} visitas na pagina · ${t.ck} checkouts (${N2((t.ck / t.lpv) * 100)}% da visita) · ${t.compras} compras (${t.ck ? N2((t.compras / t.ck) * 100) : "0"}% do checkout)`);
    console.log(`  Custo por visita: ${BRL2(t.gasto / t.lpv)}`);
  }
  console.log(`\n  Lembre: este ROAS e o do gerenciador. Ele infla. Rode "cruzar" antes de decidir escala.\n`);
}

async function cmdVendas() {
  const a = args();
  const conta = acharConta(carregarConfig(), a.conta);
  if (!a.since || !a.until) erro("Informe o periodo: --since AAAA-MM-DD --until AAAA-MM-DD");
  const vendas = (await buscarVendas(conta, { since: a.since, until: a.until })).filter((v) => v.pago);
  const novas = vendas.filter((v) => v.nova);
  const receita = novas.reduce((s, v) => s + v.preco, 0);
  console.log(`\n${conta.nome} · ${conta.plataforma} · ${a.since} a ${a.until}\n`);
  console.log(`  Vendas pagas novas: ${novas.length}`);
  console.log(`  Receita liquida:    ${BRL(receita)}  (ja sem a taxa da plataforma)`);
  console.log(`  Liquido por venda:  ${novas.length ? BRL(receita / novas.length) : "-"}  (o preco cobrado e maior)`);
  if (vendas.length - novas.length > 0) console.log(`  Renovacoes (fora da conta acima): ${vendas.length - novas.length}`);
  const porProduto = {};
  for (const v of novas) porProduto[v.produto] = (porProduto[v.produto] || 0) + 1;
  console.log("\n  Por produto:");
  for (const [p, n] of Object.entries(porProduto).sort((x, y) => y[1] - x[1])) console.log(`    ${padL(n, 4)}  ${p}`);
  console.log("");
}

async function cmdCruzar() {
  const a = args();
  const conta = acharConta(carregarConfig(), a.conta);
  if (!a.since || !a.until) erro("Informe o periodo: --since AAAA-MM-DD --until AAAA-MM-DD");

  const dias = await insights(conta.account_id, { nivel: "account", since: a.since, until: a.until, porDia: true });
  const vendas = (await buscarVendas(conta, { since: a.since, until: a.until })).filter((v) => v.pago && v.nova);

  const porDia = {};
  for (const v of vendas) {
    porDia[v.dia] = porDia[v.dia] || { n: 0, receita: 0 };
    porDia[v.dia].n++;
    porDia[v.dia].receita += v.preco;
  }

  console.log(`\n${conta.nome} · ROAS do gerenciador contra venda aprovada · ${a.since} a ${a.until}\n`);
  console.log(`  ${pad("dia", 12)}${padL("gasto", 10)}${padL("cp pixel", 10)}${padL("ROAS pixel", 12)}${padL("vendas reais", 14)}${padL("receita liq.", 14)}${padL("ROAS liq.", 11)}`);
  let tg = 0, tcp = 0, trecPix = 0, tv = 0, trec = 0;
  for (const d of dias.sort((x, y) => x.data.localeCompare(y.data))) {
    const real = porDia[d.data] || { n: 0, receita: 0 };
    tg += d.gasto; tcp += d.compras; trecPix += d.receita; tv += real.n; trec += real.receita;
    console.log(`  ${pad(d.data, 12)}${padL(BRL(d.gasto), 10)}${padL(d.compras, 10)}${padL(d.gasto ? N2(d.receita / d.gasto) : "-", 12)}${padL(real.n, 14)}${padL(BRL(real.receita), 14)}${padL(d.gasto ? N2(real.receita / d.gasto) : "-", 11)}`);
  }
  console.log(`\n  ${pad("TOTAL", 12)}${padL(BRL(tg), 10)}${padL(tcp, 10)}${padL(tg ? N2(trecPix / tg) : "-", 12)}${padL(tv, 14)}${padL(BRL(trec), 14)}${padL(tg ? N2(trec / tg) : "-", 11)}`);

  if (tv && tg) {
    const cobertura = (tcp / tv) * 100;
    console.log(`\n  O pixel enxergou ${Math.round(cobertura)}% das vendas e ${Math.round((trecPix / trec) * 100)}% da receita.`);
    console.log(`  Custo por venda paga de verdade: ${BRL(tg / tv)}`);
    console.log(`\n  Leia assim: a coluna da direita usa a receita LIQUIDA da plataforma, ja sem a`);
    console.log(`  taxa dela, e joga toda ela (inclusive organico e bio) contra o gasto de midia,`);
    console.log(`  entao e TETO de atribuicao e PISO de faturamento. O ROAS do pixel e piso dos dois.`);
    console.log(`  O numero verdadeiro esta entre os dois. Para fechar a faixa, parametrize os links.\n`);
  }
}

/* ---------------------------------------------------------------- rotas */

carregarEnv();
const comando = process.argv[2];
const rotas = { setup: cmdSetup, contas: cmdContas, relatorio: cmdRelatorio, vendas: cmdVendas, cruzar: cmdCruzar };

if (!rotas[comando]) {
  console.log(`
gestor-de-trafego · leitura de Meta Ads e plataforma de pagamento

  node gt.mjs setup                                          prepara a configuracao
  node gt.mjs contas                                         lista suas contas de anuncio
  node gt.mjs relatorio --conta "Nome" [--nivel ad] [--preset last_30d]
  node gt.mjs vendas    --conta "Nome" --since AAAA-MM-DD --until AAAA-MM-DD
  node gt.mjs cruzar    --conta "Nome" --since AAAA-MM-DD --until AAAA-MM-DD

  niveis:  account | campaign | adset | ad
  presets: today | yesterday | last_7d | last_14d | last_30d | this_month | last_month

Somente leitura: nenhum comando cria, edita ou pausa campanha.
`);
  process.exit(comando ? 1 : 0);
}

await rotas[comando]();
