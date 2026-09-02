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

Antes de analisar dado colado, confira se vieram as colunas que o método exige: **gasto, impressões, cliques, CTR, CPM, compras, receita e, se possível, visitas na página e checkouts iniciados**. Faltando as de funil, você consegue julgar o criativo mas não consegue apontar a etapa do gargalo. Peça o que faltar em vez de analisar pela metade.

## Setup do modo completo

```bash
node ~/.claude/skills/gestor-de-trafego/scripts/gt.mjs setup
```

Cria `~/.gestor-de-trafego/` com dois arquivos para preencher: `.env` (token da Meta e credenciais da plataforma) e `config.json` (nome e `act_id` de cada conta). Credencial nunca fica dentro da pasta da skill.

Não sabe o `act_id`? Preencha só o token e rode `gt.mjs contas`.

**Enquanto estiver no setup, resolva a UTM.** O `cruzar` mostra a faixa entre piso e teto, mas só fecha essa faixa se os links dos anúncios carregarem um parâmetro que identifique a campanha (`utm_campaign` ou o `sck` do checkout). Sem isso, o operador vai conviver para sempre com uma faixa larga. É o primeiro pedido a fazer numa conta nova.

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

**2a. Receita de plataforma quase nunca é o preço cobrado.** A API da Kiwify devolve só o
`net_amount`, que é o líquido do produtor depois da taxa. Uma venda de R$597 no cartão aparece como
R$542 a R$554. Isso é melhor para decidir escala, porque é o que entra no caixa, mas **nunca chame
esse número de faturamento bruto**, e não conclua que existe divergência de preço entre a página e
o checkout só porque os números não batem. Confira o preço no próprio checkout antes de afirmar.

**2. O ROAS real é uma faixa, não um número.** `gt.mjs cruzar` devolve os dois lados. O do pixel é piso, porque a atribuição perde venda. O da plataforma dividido pelo gasto é teto, porque inclui venda que veio do orgânico e da bio. O número verdadeiro está entre os dois, e só fecha quando os links carregarem UTM que identifique a campanha.

**3. Não ranqueie vencedor por ROAS puro.** R$23 gastos com uma venda de sorte dá ROAS 22 e não significa nada. Antes de ranquear, aplique o filtro de volume, e as duas condições valem juntas:

- gasto **maior que 3 vezes o CPA da conta** (não um valor fixo em reais, porque R$300 é muita amostra num CPA de R$40 e quase nenhuma num CPA de R$200), **e**
- **pelo menos 5 compras**, sempre **na mesma janela que você está analisando** (R$300 num dia e R$300 em trinta dias são situações opostas).

Abaixo de **10 conversões**, o criativo é hipótese, não campeão: chame de promissor e prove com mais volume antes de escalar. Campeão é bom ROAS com volume; 20 vendas a 3,3 valem mais que 1 venda a 22.

Antes de coroar qualquer vencedor, confira se ele não está rodando em **remarketing**. ROAS alto em público quente é esperado e não se repete no frio. Escalar remarketing achando que é criativo campeão é um dos erros mais caros da conta.

**4. Atribuição duplicada é ruído.** Várias linhas com o mesmo valor de receita, ou "1 compra, R$X" repetido igual, é o pixel espalhando a mesma venda. Nesse caso confie no agregado, não no ROAS por anúncio.

**5. Início de dia engana.** `today` de manhã mostra gasto sem venda porque a entrega concentra antes da conversão. Julgue campanha nova com o dia fechado, de preferência 2 a 3 dias.

**6. ROAS sem break-even não decide nada.** ROAS 2,2 pode ser lucro gordo ou prejuízo, depende do negócio. O break-even é `1 ÷ margem de contribuição`, contando taxa da plataforma, imposto, comissão de afiliado e custo de entrega. Produto com 70% de margem empata em 1,43; com 40%, empata em 2,5.

Peça esse número ao operador na primeira análise e guarde em `roas_minimo` no `config.json` da conta, junto com `ticket` e `cpa_alvo`. **Sem ele, não diga que uma campanha "vai bem" ou "vai mal"**, diga o número e explique que falta a régua.

O **CPA alvo** sai daí: `ticket ÷ roas_minimo`. Produto de R$500 com break-even 2,5 tem CPA alvo de R$200. É essa régua, e não o seu bom senso, que decide se um CPA está alto.

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

0. **Resolva de qual conta se está falando antes de puxar qualquer número.** Um token de agência enxerga dezenas de contas e o `config.json` costuma ter poucas. Se o pedido não nomear a conta, ou se o que o operador descreve (ticket, produto) não bater com a que está configurada, **pergunte**. Analisar a conta errada com confiança é o pior resultado possível.
1. Puxe no nível campanha. Desça para `ad` quando precisar isolar criativo.

   Se o operador pedir "criativo" e o dado vier em nível de campanha, **diga isso antes de responder**: dentro de uma campanha a ROAS 2 pode existir um criativo a 5 escondido atrás de três a 1,2. Rode `--nivel ad` antes de nomear campeão.
2. Monte a tabela campanha por campanha com gasto, compras, receita, ROAS, CPA, CTR e CPM, e um veredito em cada linha.
3. Compare com o período anterior de mesmo tamanho, métrica por métrica, com variação em porcentagem.
4. Rode `cruzar` e mostre ROAS de gerenciador e ROAS real lado a lado.
5. Aponte a etapa do funil onde está o gargalo.
6. Entregue o plano em quatro blocos: **escalar** (o quê, quanto por cento, por quê), **pausar** (com o critério), **ajustar** (com a hipótese) e **pedir** (o dado que falta).

**Critério de pausa padrão**, quando o operador não tiver o dele: numa janela fechada de pelo menos 3 dias, pause o que gastou mais de 3 vezes o CPA alvo sem nenhuma compra, ou o que ficou abaixo do ROAS de break-even já tendo passado no filtro de volume da regra 3.

Três checagens antes de matar qualquer criativo:

- **Ele gera checkout?** Se gera e não fecha, o problema é etapa 3 ou 5, não o criativo. Cortar não resolve e ainda tira volume.
- **A venda existe e o pixel não viu?** Se o criativo marca zero compra, confira na plataforma de pagamento antes de condenar. O mesmo pixel que infla também esconde.
- **O link está certo?** Destino errado imita criativo ruim.

E existe um meio-termo que o binário pausar-ou-escalar esconde: **cortar o orçamento pela metade em vez de matar**. Para de sangrar, mantém o histórico e o aprendizado vivos e você ainda tem o dado em três dias. Com cliente ansioso, costuma ser a melhor jogada.

## Escalar sem quebrar

Degraus de 20% a cada 24 ou 48 horas. Nunca dobre orçamento. **O que decide entre 24h e 48h é o volume de conversão:** com menos de 10 compras por dia, o dia sozinho não fecha amostra, então espere 48h. Acima disso, 24h serve.

**Teto de segurança:** não mais que cerca de 50% de aumento de gasto na semana, somando todos os degraus. Um pedido de triplicar vira uma rampa de duas semanas, ou vira abertura de público novo, que é outro caminho.

**Sinais de que o degrau saturou** e é hora de duplicar em público novo em vez de continuar subindo: frequência passando de 3 na janela de 7 dias, CPM subindo mais de 20% entre um degrau e outro, ou alcance parado mesmo com gasto maior. Quatro caminhos: subir o orçamento do vencedor (simples, satura), duplicar o vencedor em públicos novos (amplia sem saturar), juntar os vencedores num CBO só, ou abrir para Advantage quando o manual satura (volume sobe, ROAS cai um pouco).

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

## Quando pedem decisão na hora, sem dado

Acontece toda semana: o cliente está no telefone e quer o veredito agora. Não invente convicção e não ceda ao "corta logo". A resposta é sempre a mesma estrutura, e cabe em trinta segundos:

1. **Por que hoje não decide** (a atribuição amadurece de 3 a 5 dias).
2. **Quando você decide, com data** ("olho a janela fechada de 3 dias hoje ainda").
3. **Qual o critério exato**, dito em voz alta, para o cliente saber que existe régua.
4. **Uma ação de baixo risco agora**, para a ansiedade não virar decisão ruim: reduzir o orçamento, não zerar.

## Voz do relatório

Seco e direto, sem hype. Explique o porquê em vez de só dar o veredito. Use números com contexto. Se for mandar para o cliente, escreva no tom de quem assina, não no seu.
