import { taxas } from "@/components/marketing/dados";
import { JANELA_VOD_DIAS, LINK_SUPORTE } from "@/lib/legal/decisoes";
import type { Bloco } from "@/lib/legal/tipos";

/*
 * FAQ — secção 5 de `docs/legal/CONTEUDO-PAGINAS.md`, transcrita.
 *
 * Duas partes com públicos diferentes (quem compra e quem vende), por isso duas
 * âncoras próprias: quem manda o link a uma liga não a faz passar por doze
 * perguntas de espectador para chegar às dela.
 *
 * As respostas marcadas `[DEFINIR …]` ficam assim de propósito. Uma FAQ que
 * inventa uma resposta para parecer completa é pior do que uma que assume o que
 * ainda não está decidido — sobretudo quando o que falta decidir é dinheiro
 * (comissão, prazos de pagamento) ou uma promessa técnica (que dispositivos
 * suportamos mesmo).
 */

export type Pergunta = {
  /** Âncora estável — entra em links de suporte. */
  id: string;
  pergunta: string;
  resposta: readonly Bloco[];
};

export type ParteFaq = {
  id: string;
  titulo: string;
  /** Para quem é esta parte, numa linha. */
  resumo: string;
  perguntas: readonly Pergunta[];
};

const espectadores: ParteFaq = {
  id: "espectadores",
  titulo: "Espectadores",
  resumo: "Quem compra acesso a uma live, ao arquivo ou um bilhete.",
  perguntas: [
    {
      id: "pagamento",
      pergunta: "Como é que eu pago? É seguro pagar por MB WAY?",
      resposta: [
        {
          t: "p",
          texto:
            "Pagas por MB WAY, processado pela Eupago, instituição de pagamento registada e supervisionada pelo Banco de Portugal. Não guardamos os dados do teu cartão nem da tua app bancária — a confirmação é feita diretamente no teu telemóvel.",
        },
      ],
    },
    {
      id: "dispositivos",
      pergunta: "Posso ver na TV ou noutro dispositivo, além do telemóvel?",
      resposta: [
        {
          t: "p",
          texto:
            "**[DEFINIR conforme suporte técnico real]** — não prometer suporte a dispositivos ou apps que ainda não existem (ex. Chromecast/AirPlay).",
        },
      ],
    },
    {
      id: "sessao-unica",
      pergunta: "Posso ver ao mesmo tempo no telemóvel e no computador?",
      resposta: [
        {
          t: "p",
          texto:
            'Não. Cada conta só permite uma sessão ativa de cada vez — é assim que protegemos o conteúdo das ligas contra partilha de acessos. Se entrares num dispositivo novo, a sessão anterior fecha automaticamente. Se achas que foste bloqueado por engano (por exemplo, trocaste de wifi ou de telemóvel), podes terminar a sessão antiga na tua conta, em "Dispositivos ativos".',
        },
      ],
    },
    {
      id: "falha-transmissao",
      pergunta: "E se a transmissão falhar ou cortar durante a live?",
      resposta: [
        {
          t: "p",
          texto:
            "**[DEFINIR política concreta]** — ver detalhe na [Política de Reembolsos](/legal/reembolsos). Não existe lei específica de compensação para streaming em Portugal; a nossa política tem de estar escrita e visível, não decidida caso a caso.",
        },
      ],
    },
    {
      id: "entrada-bilhete",
      pergunta: "Comprei bilhete físico — como funciona a entrada?",
      resposta: [
        {
          t: "p",
          texto:
            "O teu bilhete é validado à porta por QR code, associado à tua conta. Não precisas de imprimir nada — basta teres o QR na app ou no email, no telemóvel.",
        },
      ],
    },
    {
      id: "arrependimento",
      pergunta: "Posso pedir reembolso se mudar de ideias depois de comprar?",
      resposta: [
        {
          t: "p",
          texto:
            "Não, depois de confirmares a compra e aceitares que o acesso é imediato. Tanto o acesso a lives/VOD como os bilhetes para eventos com data marcada estão isentos do prazo geral de 14 dias que existe noutras compras online — é uma exceção prevista na lei portuguesa de proteção do consumidor, para conteúdo digital consumido de imediato e para eventos de lazer com data específica.",
        },
      ],
    },
    {
      id: "cancelado-adiado",
      pergunta: "E se o evento for cancelado ou adiado?",
      resposta: [
        {
          t: "p",
          texto:
            "Cancelado: reembolsamos o valor total, incluindo a comissão, assim que soubermos que o evento não se vai realizar.",
        },
        {
          t: "p",
          texto:
            "Adiado: o teu bilhete ou acesso mantém-se válido para a nova data — não precisas de fazer nada. Se não puderes comparecer na nova data, podes pedir reembolso dentro do prazo indicado na [Política de Reembolsos](/legal/reembolsos).",
        },
      ],
    },
    {
      id: "marca-de-agua",
      pergunta: "Porque é que o meu email aparece por cima do vídeo?",
      resposta: [
        {
          t: "p",
          texto:
            "É a nossa marca de água anti-pirataria: cada vídeo que vês tem o teu email sobreposto, para desincentivar gravações e partilhas ilegais e proteger o trabalho da liga que pagaste para ver. Usamos só o teu email — nada mais aparece no ecrã. Mais detalhe na [Política de Privacidade](/legal/privacidade).",
        },
      ],
    },
    {
      id: "janela-vod",
      pergunta: "Posso rever o combate depois? Durante quanto tempo fica disponível?",
      resposta: [
        {
          t: "p",
          // Janela do VOD decidida: 30 dias (ver lib/legal/decisoes.ts).
          texto: `Sim. O combate fica no teu arquivo, para reveres, durante ${JANELA_VOD_DIAS} dias depois do direto. Não há norma legal a impor um prazo — é uma decisão nossa, mas fica escrita e visível.`,
        },
      ],
    },
    {
      id: "password",
      pergunta: "Esqueci-me da password / perdi o acesso à conta.",
      resposta: [
        {
          t: "p",
          texto:
            'Usa o link "Esqueci-me da password" no ecrã de login, ou entra com a tua conta Google se a associaste. Por segurança, não recuperamos o acesso só por pedido de email sem verificação de identidade.',
        },
      ],
    },
    {
      id: "fatura",
      pergunta: "Recebo fatura da compra?",
      resposta: [
        {
          t: "p",
          texto:
            'Sim, gerada automaticamente e disponível na tua área de cliente, em "As minhas compras" — é obrigação legal emitirmos fatura para qualquer venda em Portugal.',
        },
      ],
    },
    {
      id: "reclamar",
      pergunta: "Onde reclamo se algo correr mal?",
      resposta: [
        {
          t: "p",
          texto: `No suporte da FirstRow (${LINK_SUPORTE}) ou no Livro de Reclamações Eletrónico, disponível no rodapé do site.`,
        },
      ],
    },
  ],
};

const ligas: ParteFaq = {
  id: "ligas",
  titulo: "Canais / Ligas",
  resumo: "Quem organiza os eventos e vende através da FirstRow.",
  perguntas: [
    {
      id: "quando-recebo",
      pergunta: "Quando é que recebo o dinheiro das vendas?",
      resposta: [
        {
          t: "p",
          texto:
            '**[DEFINIR no contrato com cada liga, ex.: "D+15 após o evento" ou pagamento mensal]** — não há prazo imposto por lei para isto; é o que acordamos por contrato, escrito antes do primeiro evento.',
        },
      ],
    },
    {
      id: "comissao",
      pergunta: "Que comissão fica para a FirstRow?",
      resposta: [
        {
          t: "p",
          // Comissão decidida: 10%. Fonte única do número: marketing/dados.ts
          // (documentado em docs/VISAO-E-NEGOCIO.md), para não divergir do que o
          // site diz nas comparações de taxa. NÃO dizer "MB WAY incluído": o
          // processamento (~2%) é à parte da comissão — juntos dão o ~12% da
          // tabela do /criadores.
          texto: `**${taxas.comissao}** sobre cada venda, definida no contrato de parceria. O processamento MB WAY (cerca de 2%) é cobrado à parte — a tabela em /criadores mostra as duas parcelas ao lado uma da outra.`,
        },
      ],
    },
    {
      id: "validacao-porta",
      pergunta: "Como funciona a validação de bilhetes físicos à porta?",
      resposta: [
        {
          t: "p",
          texto:
            "Cada bilhete gera um QR único ligado à conta do comprador. Disponibilizamos **[app/leitor]** para validar à entrada e ver em tempo real quantos já entraram.",
        },
      ],
    },
    {
      id: "cancelar-evento",
      pergunta:
        "Se eu, como liga, tiver de cancelar ou adiar o evento, quem reembolsa e quem fica com a comissão perdida?",
      resposta: [
        {
          t: "p",
          texto:
            "A FirstRow reembolsa sempre o espectador, incluindo a comissão que ele pagou. **[DEFINIR no contrato FirstRow-Liga se a comissão da FirstRow é devolvida ou retida nesse caso]** — tem de estar claro antes do primeiro evento, para não haver surpresas.",
        },
      ],
    },
    {
      id: "lista-compradores",
      pergunta: "Posso ver quem comprou bilhete/PPV do meu evento?",
      resposta: [
        {
          t: "p",
          texto:
            "**[DEFINIR conforme política de dados]** — regra geral do RGPD: só partilhamos o estritamente necessário (por exemplo, validação à entrada), não a lista completa de emails, salvo acordo específico com base legal própria.",
        },
      ],
    },
    {
      id: "antipirataria",
      pergunta: "Como é que a FirstRow impede a pirataria do meu conteúdo?",
      resposta: [
        {
          t: "p",
          texto:
            "Acesso preso à conta (sem links partilháveis), uma sessão em simultâneo por conta, e marca de água com o email de cada espectador sobreposta ao vídeo — o que torna qualquer gravação partilhada rastreável até a conta de origem.",
        },
      ],
    },
    {
      id: "faturacao",
      pergunta: "Tenho de emitir fatura eu próprio, ou a FirstRow trata disso?",
      resposta: [
        {
          t: "p",
          texto:
            "**[DEFINIR conforme modelo fiscal/contratual — a confirmar com contabilista]**. Modelo provável: a FirstRow emite a fatura ao espectador pelo valor total (comissionista, nos termos do Código do IVA), e a liga fatura só a sua parte à FirstRow.",
        },
      ],
    },
    {
      id: "falha-da-liga",
      pergunta: "E se a transmissão falhar por um problema meu (da liga), não da FirstRow?",
      resposta: [
        {
          t: "p",
          texto:
            "**[DEFINIR no contrato FirstRow-Liga]** — distinguir falhas técnicas da FirstRow de falhas do lado da produção do evento, e quem absorve o custo do reembolso ao espectador nesse caso.",
        },
      ],
    },
  ],
};

export const FAQ: readonly ParteFaq[] = [espectadores, ligas];

/**
 * Nota de fecho da FAQ, tal como no documento de origem. Fica visível porque é
 * exatamente o ponto: o que falta decidir está assumido, não escondido.
 */
export const NOTA_DEFINIR =
  "Os pontos marcados [DEFINIR] são decisões de produto/negócio, não exigências legais — mas, uma vez decididos, têm de ficar escritos e visíveis. É a falta de clareza, não a regra em si, que gera reclamações.";
