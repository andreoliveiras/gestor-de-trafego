# gestor-de-trafego

Uma skill de Claude Code que lê sua conta de Meta Ads, cruza com as vendas aprovadas na sua plataforma de pagamento e devolve **decisão**: o que escalar, o que pausar, o que ajustar, e em que etapa do funil está o vazamento.

Feita para infoproduto de venda direta e funil perpétuo.

## Por que ela existe

O ROAS do gerenciador infla. Ele conta compra que o pixel atribuiu e que nunca virou dinheiro: boleto não pago, cartão recusado, atribuição duplicada. Em contas reais o pixel enxerga entre 55% e 70% das vendas.

Quem escala pelo número do gerenciador escala no escuro. Esta skill mostra os dois lados, o piso e o teto, e diz onde está o número verdadeiro.

## Instalar

Precisa de Node 18 ou mais novo e do Claude Code.

```bash
git clone https://github.com/SEU-USUARIO/gestor-de-trafego.git ~/.claude/skills/gestor-de-trafego
node ~/.claude/skills/gestor-de-trafego/scripts/gt.mjs setup
```

O `setup` cria `~/.gestor-de-trafego/` com dois arquivos para preencher:

- **`.env`**: seu token da Meta (permissão `ads_read`) e, se for cruzar venda, as credenciais da Kiwify ou da Hotmart.
- **`config.json`**: o nome e o `act_id` de cada conta de anúncio sua.

Credencial nunca fica dentro da pasta da skill, então `git pull` nunca sobrescreve e nada vaza em commit.

Não sabe o `act_id`? Preencha só o token e rode `node ~/.claude/skills/gestor-de-trafego/scripts/gt.mjs contas`.

## Usar

Depois de instalada, é conversa. Abra o Claude Code e peça:

```
analisa minha conta dos últimos 30 dias e me diz o que escalar
qual criativo está queimando verba?
cruza com a Kiwify e me dá o ROAS real
em que etapa o meu funil está vazando?
```

Ou rode os comandos direto:

```bash
node ~/.claude/skills/gestor-de-trafego/scripts/gt.mjs relatorio --conta "Minha Conta" --preset last_30d
node ~/.claude/skills/gestor-de-trafego/scripts/gt.mjs relatorio --conta "Minha Conta" --nivel ad --preset last_14d
node ~/.claude/skills/gestor-de-trafego/scripts/gt.mjs vendas --conta "Minha Conta" --since 2026-08-01 --until 2026-08-16
node ~/.claude/skills/gestor-de-trafego/scripts/gt.mjs cruzar --conta "Minha Conta" --since 2026-08-01 --until 2026-08-16
```

## Não tem token da Meta?

A skill funciona no modo colar: você exporta o relatório do gerenciador, cola no chat e o método continua valendo inteiro. Só o cruzamento automático com a plataforma exige as credenciais.

## O que tem dentro

| Arquivo | O que é |
|---|---|
| `SKILL.md` | o método: as cinco regras de leitura, o procedimento de análise, como escalar sem quebrar |
| `referencias/grimorio-perpetuos.md` | a matriz de diagnóstico: gargalo, causa provável e solução, nas cinco etapas do funil |
| `scripts/gt.mjs` | a CLI de leitura da Meta API, Kiwify e Hotmart |
| `config.exemplo.json` | modelo do arquivo de contas |

## Segurança

**Somente leitura.** Nenhum comando cria, edita, pausa ou escala campanha. Nada gasta dinheiro. O token pode ter apenas `ads_read`.

## Plataformas de pagamento

Kiwify e Hotmart saem funcionando. Outras plataformas caem no modo colar: exporte o CSV de vendas aprovadas e cole no chat, que o método de cruzamento é o mesmo.

## Licença

MIT. Use, modifique, distribua. Se melhorar, manda o PR.

---

Feito por [André de Oliveira](https://instagram.com/andreoliveira.ai), da Taos Mídia, a partir do sistema que roda a gestão de tráfego dos clientes da agência todos os dias.
