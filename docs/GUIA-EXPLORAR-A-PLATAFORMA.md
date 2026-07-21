# Guia — explorar a plataforma de ponta a ponta

> Escrito a 21/07/2026. Um passeio pelo produto todo, pela ordem em que uma liga
> real o usaria. Cada passo diz **o que devias ver** — se vires outra coisa, é
> um bug e vale a pena dizeres.
>
> Produção: **https://firstrow.arestadigital.pt**

## Antes de começar: as contas que existem

| Conta | Papel | Serve para |
|---|---|---|
| `ruicosta607@gmail.com` | `platform_admin` | tu — vês tudo, todos os canais |
| `ruiclaro998@gmail.com` | `viewer` **com acesso comprado** ao SB Clash #14 | ver o produto como um cliente que pagou |
| `rui.teste.authconta@gmail.com` | `viewer` com acesso | segundo cliente (útil para testar o chat a dois) |
| `porta@firstrow.pt`, `admin.teste@firstrow.dev` | `viewer` sem acesso | ver o que um não-comprador vê |

Para testar o **staff** da porta, tens de promover uma dessas contas a `staff` do
canal em `/admin/canais` → SmokingBars → Membros.

---

## Parte 1 — O lado do espectador (faz isto primeiro)

### 1.1 Chega como um estranho
Abre a **home** numa janela anónima. Deves ver a visão geral da plataforma, **não**
um canal — foi uma correção pedida: a página inicial não é a SmokingBars.

Clica no canal. Vês a página da liga, com as cores dela, os eventos e o arquivo.

**Repara:** não há botão "Backoffice" em lado nenhum. Não está escondido por CSS —
não existe no HTML. Podes confirmar com Ctrl+U.

### 1.2 Tenta ver sem pagar
Entra num evento terminado e carrega em ver. Vais ser mandado para a página pública.
O chat também não aparece — **decisão tua: quem não comprou não vê o chat.**

### 1.3 Agora como cliente que pagou
Entra com `ruiclaro998@gmail.com` e abre o **SB Clash #14**.

O que devias ver:
- O vídeo a tocar (é a gravação real do teu teste com o OBS, 219 segundos)
- **A tua marca de água a mover-se continuamente** por cima do vídeo, com o email
- O **chat/comentários** ao lado
- **Gosto** e **partilha**

### 1.4 Ataca a marca de água (é o teste mais divertido)
Abre o inspetor e tenta apagar o `<span>` da marca de água.

**O vídeo pára** e aparece "Reprodução interrompida". A sessão é revogada no
servidor e fica registada com motivo `watermark` — para poderes banir a conta.

Tenta também: pôr `opacity: 0`, ou tapar com um `<div>` por cima sem lhe tocar.
Apanha as três, entre 0 e 4 segundos.

### 1.5 Ecrã inteiro
Carrega no botão de ecrã inteiro (ou tecla `f`). **A marca de água vai com ele** —
foi preciso pedir ecrã inteiro à moldura em vez de ao iframe.

Repara que o player da Cloudflare **já não tem botão de ecrã inteiro próprio**, e
que o Picture-in-Picture está desligado: ambos eram portas de saída para um vídeo
sem marca.

**No iPhone o botão não aparece** — de propósito. Lá o vídeo usa o leitor nativo do
sistema, fora do nosso alcance, e não se bloqueia o que não se consegue ver.

### 1.6 Uma sessão por conta
Com o vídeo a tocar, abre o mesmo evento **noutro browser** com a mesma conta.
O primeiro pára. É a regra anti-partilha.

Mas **recarregar a página no mesmo browser não conta como bloqueio** — isso foi
corrigido depois de a régie mostrar 7 "sessões cortadas" que eram só recargas tuas.

### 1.7 Telemóvel
Repete o essencial no telemóvel. Houve uma auditoria a 375/768/1280 em 31 páginas:
zero scroll horizontal, alvos de toque ≥44px, e o chat funciona **com o teclado
aberto** — que estava partido e foi corrigido.

---

## Parte 2 — O lado da liga (o backoffice)

Entra com a tua conta em `/admin`.

### 2.1 A vista de dono
Vês dashboard, eventos, subscritores, ganhos, pagamentos, canais.
**Clica no nome de um evento** — abre a régie dele.

### 2.2 Criar um evento
`/admin/eventos` → criar. Repara em três coisas que custaram a aprender:
- **Uma data impossível avisa antes de submeteres**
- **Se falhar validação, não perdes o que escreveste** (foi assim que nasceram 16
  eventos duplicados em produção)
- O botão desativa ao primeiro clique

Se tiveres dois canais, aparece um **seletor de canal sem valor por omissão** —
pré-escolher seria a forma mais barata de criar o evento na liga errada.

### 2.3 A régie
Na página de transmissão tens as credenciais do OBS, o contador de espectadores ao
vivo, e as sessões cortadas.

**A chave é deste evento**, não da conta. No dia de um evento, copia a chave *desse*
evento.

### 2.4 Editar um evento
Repara no que **não** deixa mudar depois de haver vendas: o preço PPV fecha-se,
porque a receita é lida de `events.price_cents` a cada pergunta — mudá-lo
reescrevia o que as pessoas já pagaram. Já o preço do **bilhete** muda sempre,
porque é copiado por bilhete na compra.

Mudar a hora de um evento vendido mostra as consequências **antes** de confirmares.

### 2.5 Canais e imagens
`/admin/canais` → editar. Podes carregar **logo e banner**, com validação a sério no
servidor (tipo real por magic bytes, dimensões, peso). Experimenta enviar um
ficheiro que não é imagem com extensão `.png` — é recusado.

Escolhe também as **cores da liga**: o sistema garante contraste AA e corrige a
luminosidade se a cor escolhida for ilegível.

### 2.6 Ganhos e pagamentos
`/admin/ganhos` — extrato por mês e canal, com a tua comissão de 10%.
`/admin/pagamentos` — **dinheiro em risco**: compras a meio, com a referência da
Eupago ao lado para poderes perguntar-lhes.

### 2.7 A tua vista global
`/admin/plataforma` — só tu a vês. Receita por canal, curva de espectadores,
**custo de vídeo vs comissão** (o rácio que decide o negócio), conversão
registo→compra, e a saúde dos pagamentos.

---

## Parte 3 — O dia de um evento (a sequência real)

1. **Cria o evento** com antecedência, define preço PPV e de bilhete
2. **Divulga** o link da página pública do evento
3. **No dia**: abre a régie, copia servidor e chave para o OBS
4. **Intervalo de keyframe = 2** no OBS — é o que mais gente erra
5. Carrega em **Go Live** no OBS, depois marca o evento como **no ar** na app
6. Vê o contador de espectadores subir
7. À porta: a equipa usa **`/admin/scanner`** para validar os QR dos bilhetes
8. No fim, marca **Terminar**
9. A gravação liga-se sozinha e aparece no arquivo (se demorar, recarrega a régie —
   a Cloudflare precisa de tempo a processar)

---

## O que ainda não podes fazer

- **Receber dinheiro a sério.** Falta o split da Eupago: as `externKey` dos
  beneficiários só o suporte deles as dá, e cada beneficiário precisa de conta
  Eupago própria — a liga tem de abrir a dela. Em produção, sem isso, as compras
  são **recusadas de propósito** para nunca reteres a parte da liga.
- **Lançar comercialmente.** Falta o NIF nos documentos legais, e os 11 pontos
  marcados `[VERIFICAR COM ADVOGADO]` em `docs/legal/CONTEUDO-PAGINAS.md`.

## O que a plataforma NÃO promete (e não deves prometer a uma liga)

- A marca de água **não sobrevive a quem edita o nosso JavaScript**. Protege contra
  a remoção casual e identifica quem partilhou — não contra um atacante técnico.
- Em **iPhone**, o ecrã inteiro usa o leitor nativo e a marca não lá chega.
- O limite de pedidos por IP **não defende contra um atacante distribuído por
  muitos IPs**. É inerente a limitar por IP.
