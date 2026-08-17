---
name: gestor-de-trafego
description: Use quando o usuário pedir análise de campanha de Meta Ads, quiser decidir o que escalar ou pausar, desconfiar do ROAS do gerenciador, precisar cruzar anúncio com venda aprovada na Hotmart ou Kiwify, quiser achar o criativo vencedor, ou perguntar em que etapa o funil está vazando.
---

# Gestor de tráfego

Transforma o número cru da conta de anúncio em decisão: o que escalar, o que pausar, o que ajustar, com a causa apontada e a etapa do funil onde está o gargalo.

**Princípio central:** toda recomendação nasce de duas coisas juntas, o dado real da conta e a matriz de diagnóstico de funil em `referencias/grimorio-perpetuos.md`. Nunca recomende escalar ou pausar sem dizer por quê e em qual etapa está o gargalo.

## Dois modos de trabalhar

**Modo completo (com a API).** Requer Node 18+ e um token da Meta com permissão `ads_read`. Puxa os números direto da conta e cruza com a plataforma de pagamento.

**Modo colar (sem código).** O usuário exporta o relatório do gerenciador e cola no chat. Todo o método abaixo continua valendo. É o caminho de quem não tem token ainda.

## Setup do modo completo

```bash
node ~/.claude/skills/gestor-de-trafego/scripts/gt.mjs setup
```

Cria `~/.gestor-de-trafego/` com dois arquivos para preencher: `.env` (token da Meta e credenciais da plataforma) e `config.json` (nome e `act_id` de cada conta). Credencial nunca fica dentro da pasta da skill.

Não sabe o `act_id`? Preencha só o token e rode `gt.mjs contas`.

Se faltar token, permissão ou conta no config, **avise e peça**. Não invente `act_id`, pixel, página ou público.

## Comandos

| Comando | O que devolve |
|---|---|
| `gt.mjs contas` | as contas de anúncio que o token enxerga, com o `act_id` de cada |
| `gt.mjs relatorio --conta "Nome"` | gasto, compras, receita, ROAS, CPA, CTR, CPM e o funil da conta |
| `gt.mjs relatorio --conta "Nome" --nivel ad --preset last_30d` | o mesmo por anúncio, para isolar criativo |
| `gt.mjs vendas --conta "Nome" --since AAAA-MM-DD --until AAAA-MM-DD` | vendas pagas de verdade na plataforma |
| `gt.mjs cruzar --conta "Nome" --since ... --until ...` | o ROAS real: gasto da Meta contra venda aprovada, dia a dia |

Níveis: `account`, `campaign`, `adset`, `ad`. Presets: `today`, `yesterday`, `last_7d`, `last_14d`, `last_30d`, `this_month`, `last_month`.

Tudo é somente leitura. Nenhum comando cria, edita ou pausa campanha.

## As cinco regras de leitura

Sem elas, o número engana e a decisão sai errada.

**1. O ROAS do gerenciador infla.** Ele conta compra que o pixel atribuiu mas que nunca virou dinheiro: boleto não pago, cartão recusado, atribuição duplicada. Chame sempre de ROAS de gerenciador. Escala grande só com ROAS real.

**2. O ROAS real é uma faixa, não um número.** `gt.mjs cruzar` devolve os dois lados. O do pixel é piso, porque a atribuição perde venda. O da plataforma dividido pelo gasto é teto, porque inclui venda que veio do orgânico e da bio. O número verdadeiro está entre os dois, e só fecha quando os links carregarem UTM que identifique a campanha.

**3. Não ranqueie vencedor por ROAS puro.** R$23 gastos com uma venda de sorte dá ROAS 22 e não significa nada. Filtre volume antes de ranquear: gasto acima de R$300 ou pelo menos 3 compras. Campeão é bom ROAS com volume; 20 vendas a 3,3 valem mais que 1 venda a 22.

**4. Atribuição duplicada é ruído.** Várias linhas com o mesmo valor de receita, ou "1 compra, R$X" repetido igual, é o pixel espalhando a mesma venda. Nesse caso confie no agregado, não no ROAS por anúncio.

**5. Início de dia engana.** `today` de manhã mostra gasto sem venda porque a entrega concentra antes da conversão. Julgue campanha nova com o dia fechado, de preferência 2 a 3 dias.

## Onde o funil vaza

Cinco etapas. Descubra em qual está o gargalo e leia o diagnóstico completo em `referencias/grimorio-perpetuos.md`.

| Etapa | Sintoma no número | Onde olhar |
|---|---|---|
| 1. Custo por sessão | custo por visita subindo, CTR baixo, CPM alto | criativo, público, posicionamento, velocidade do site |
| 2. Conversão do site | muita visita, pouco checkout | promessa, VSL, prova social, credibilidade, mobile |
| 3. Taxa de pagamento | muito checkout, pouca venda aprovada | boleto contra PIX, cartão recusado, recuperação |
| 4. Página para checkout | visita não vira clique no botão | botão, convencimento, peso da página |
| 5. Conversão do checkout | chega no checkout e desiste | preço, objeção, informação divergente |

**Fronteira honesta:** o gerenciador diagnostica CTR, CPM, CPC, link, público e frequência. Site, checkout e gateway não vêm na API. Nesses casos levante hipótese e peça o dado, não invente.

## O procedimento

1. Puxe no nível campanha. Desça para `ad` quando precisar isolar criativo.
2. Monte a tabela campanha por campanha com gasto, compras, receita, ROAS, CPA, CTR e CPM, e um veredito em cada linha.
3. Compare com o período anterior de mesmo tamanho, métrica por métrica, com variação em porcentagem.
4. Rode `cruzar` e mostre ROAS de gerenciador e ROAS real lado a lado.
5. Aponte a etapa do funil onde está o gargalo.
6. Entregue o plano em quatro blocos: **escalar** (o quê, quanto por cento, por quê), **pausar** (com o critério), **ajustar** (com a hipótese) e **pedir** (o dado que falta).

## Escalar sem quebrar

Degraus de 20% a cada 24 ou 48 horas. Nunca dobre orçamento. Quatro caminhos: subir o orçamento do vencedor (simples, satura), duplicar o vencedor em públicos novos (amplia sem saturar), juntar os vencedores num CBO só, ou abrir para Advantage quando o manual satura (volume sobe, ROAS cai um pouco).

Remarketing é a camada de maior ROAS e menor volume. Ele não escala sozinho: quem alimenta é a campanha de descoberta.

## Erros comuns

| Erro | O que fazer |
|---|---|
| Cortar criativo pelo resultado de ontem | a atribuição amadurece por 3 a 5 dias; use janela fechada |
| Escalar pelo ROAS do gerenciador | cruze com a plataforma antes |
| Chamar de vencedor quem teve uma venda | aplique o filtro de volume |
| Confundir renovação com venda nova | o Meta só vê a primeira; `gt.mjs` já separa |
| Julgar campanha de descoberta por venda direta | ela alimenta o remarketing, o retorno aparece lá |
| Comparar páginas pelo nome da campanha | confira o link real do anúncio, LP às vezes fica em subdomínio |

## Voz do relatório

Seco e direto, sem hype. Explique o porquê em vez de só dar o veredito. Use números com contexto. Se for mandar para o cliente, escreva no tom de quem assina, não no seu.
