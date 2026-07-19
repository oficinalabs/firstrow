import { ENTIDADE_LEGAL, JANELA_VOD_DIAS, LINK_SUPORTE } from "@/lib/legal/decisoes";
import type { PaginaLegal } from "@/lib/legal/tipos";

/*
 * ============================================================================
 *  PÁGINAS LEGAIS — o texto, num sítio só
 * ============================================================================
 *
 * Transcrição de `docs/legal/CONTEUDO-PAGINAS.md`, secções 1 a 4. O documento
 * continua a ser a fonte: se um advogado mandar mudar uma frase, muda-se lá e
 * repercute-se aqui — não o contrário.
 *
 * ⚠️ Este texto **não é parecer jurídico**. Os blocos `advogado` são os pontos
 * que a pesquisa deixou por confirmar e que têm de ser revistos antes de a
 * FirstRow cobrar dinheiro a sério. Estão à vista de propósito.
 *
 * Os valores entre parêntesis retos que sobram (`[—]` para NIF e sede,
 * `[90] dias`, `[5 a 10 dias úteis]`…) são decisões de negócio ainda por tomar,
 * não texto por acabar. O renderizador mostra-os como marcador, para ninguém os
 * ler como se fossem factos. Os que já foram decididos (nome legal, email de
 * suporte, janela do VOD) vêm de `lib/legal/decisoes.ts`.
 */

/**
 * Data mostrada como "última atualização" nas quatro páginas.
 *
 * Não é a data de hoje calculada em runtime: uma página legal que se diz
 * atualizada todos os dias é uma página legal em que não se pode confiar. Sobe
 * à mão quando o texto muda — e é essa a única forma honesta.
 *
 * (A versão do texto do CHECKOUT é outra coisa e vive em
 * `lib/legal/consentimentos.ts`: essa entra na prova de cada compra.)
 */
export const ATUALIZADO_EM = "19 de julho de 2026";

const privacidade: PaginaLegal = {
  slug: "privacidade",
  titulo: "Política de Privacidade",
  resumo: "Que dados recolhemos, para quê, durante quanto tempo, e o que podes exigir de nós.",
  seccoes: [
    {
      id: "responsavel",
      titulo: "Quem trata os teus dados",
      blocos: [
        {
          t: "p",
          // ENTIDADE_LEGAL já decidido (Aresta); NIF e sede continuam `[—]`.
          texto: `A FirstRow é operada por **${ENTIDADE_LEGAL}**, NIF **[—]**, com sede em **[—]**. Para qualquer questão sobre privacidade, escreve para **[privacidade@arestadigital.pt]**. Respondemos em até 30 dias.`,
        },
        {
          t: "advogado",
          texto:
            "Não é obrigatório ter um Encarregado de Proteção de Dados (DPO) formal nesta fase — a FirstRow não faz controlo sistemático em grande escala. Ainda assim, o email acima serve como ponto de contacto de privacidade, o que a lei exige de qualquer forma.",
        },
      ],
    },
    {
      id: "dados",
      titulo: "Que dados tratamos e para quê",
      blocos: [
        { t: "sub", texto: "Conta" },
        {
          t: "p",
          texto:
            "Nome, email e password (guardada encriptada, nunca em texto simples). Servem para criares e geres a tua conta. Se entrares com Google, recebemos o teu nome e email através da conta Google que escolheres.",
        },
        { t: "nota", texto: "Base legal: execução do contrato contigo." },

        { t: "sub", texto: "Compras" },
        {
          t: "p",
          texto:
            "Histórico do que compraste — acesso a lives, VOD, bilhetes físicos — e os dados de faturação associados.",
        },
        {
          t: "nota",
          texto:
            "Base legal: execução do contrato + obrigação fiscal (temos de guardar dados de fatura por 10 anos, mesmo que fechares a conta).",
        },

        { t: "sub", texto: "Pagamento por MB WAY" },
        {
          t: "p",
          texto:
            "O pagamento é processado pela Eupago, o nosso parceiro de pagamentos em Portugal (instituição de pagamento autorizada e supervisionada pelo Banco de Portugal). Não vemos nem guardamos os dados da tua app bancária — só recebemos a confirmação de que o pagamento foi feito.",
        },
        { t: "nota", texto: "Base legal: execução do contrato + obrigação legal fiscal." },

        { t: "sub", texto: "Sessão e IP" },
        {
          t: "p",
          texto:
            "Registamos quando entras na conta e o IP de onde entras, e permitimos só **uma sessão ativa de cada vez**. Isto existe para impedir que uma conta seja partilhada por várias pessoas ao mesmo tempo — o que prejudica diretamente as ligas cujo trabalho estás a pagar para ver. Guardamos estes registos por um período curto (até **[90] dias**, a confirmar) e não os usamos para mais nada — não para perfilar os teus hábitos, não para marketing.",
        },
        {
          t: "nota",
          texto:
            "Base legal: interesse legítimo (segurança da conta e prevenção de fraude/partilha).",
        },

        { t: "sub", texto: "Marca de água com o teu email" },
        {
          t: "p",
          texto:
            "Enquanto vês um vídeo, o teu email aparece sobreposto à imagem. Não é um ficheiro que fica guardado — é gerado no momento em que estás a ver o conteúdo, e desaparece quando saíres. Mostramos só o email, nada mais (sem nome completo, sem IP, sem telefone). Serve exclusivamente para desincentivar a gravação e redistribuição ilegal do stream, o que protege o trabalho de quem cria o conteúdo.",
        },
        {
          t: "nota",
          texto:
            "Base legal: interesse legítimo (proteção anti-pirataria do conteúdo das ligas). Avisamos-te disto antes de comprares — não é surpresa só nesta política.",
        },

        { t: "sub", texto: "Bilhetes físicos" },
        {
          t: "p",
          texto:
            "Se compras um bilhete para um evento presencial, geramos um código QR único ligado à tua compra, para validação à entrada.",
        },
        { t: "nota", texto: "Base legal: execução do contrato." },

        { t: "sub", texto: "Emails transacionais" },
        {
          t: "p",
          texto: "Confirmações de compra, faturas, avisos de eventos — enviados via Resend.",
        },
        { t: "nota", texto: "Base legal: execução do contrato." },

        { t: "sub", texto: "Marketing (se subscreveres)" },
        {
          t: "p",
          texto:
            "Só se ativares essa opção. Podes retirar o consentimento a qualquer momento, sem afetar o resto da tua conta.",
        },
        { t: "nota", texto: "Base legal: consentimento." },
      ],
    },
    {
      id: "prazos",
      titulo: "Quanto tempo guardamos os dados",
      blocos: [
        {
          t: "tabela",
          colunas: ["Dado", "Prazo"],
          linhas: [
            ["Conta e perfil", "Enquanto a conta estiver ativa"],
            [
              "Faturação e histórico de compras",
              "10 anos após a emissão (obrigação fiscal), mesmo depois de fechares a conta",
            ],
            [
              "Sessões e IP",
              "Até **[90] dias** **[VERIFICAR COM ADVOGADO — confirmar prazo exato defensável]**",
            ],
            ["Marca de água", "Não é guardada — é gerada em tempo real, a cada visionamento"],
          ],
        },
        {
          t: "p",
          texto:
            "Se fechares a conta, apagamos os dados de perfil. Os registos de faturação ficam retidos, isolados, pelo prazo legal — não são usados para mais nada.",
        },
      ],
    },
    {
      id: "subcontratantes",
      titulo: "Com quem partilhamos dados",
      blocos: [
        {
          t: "p",
          texto:
            "Usamos os seguintes prestadores, todos vinculados por contrato a tratar os teus dados só segundo as nossas instruções:",
        },
        {
          t: "lista",
          itens: [
            "**Vercel** — alojamento da aplicação (EUA/UE)",
            "**Neon** — base de dados (região UE)",
            "**Cloudflare** — distribuição e proteção do vídeo em streaming (rede global)",
            "**Eupago** — processamento de pagamentos MB WAY (Portugal)",
            "**Resend** — envio de emails transacionais",
            '**Google** — só se usares "Entrar com Google"',
          ],
        },
        { t: "p", texto: "Não vendemos os teus dados a ninguém." },
        {
          t: "advogado",
          texto:
            "Confirmar que existe um contrato de subcontratação (DPA) assinado com cada um destes prestadores antes do lançamento comercial.",
        },
      ],
    },
    {
      id: "transferencias",
      titulo: "Transferências para fora da União Europeia",
      blocos: [
        {
          t: "p",
          texto:
            "Alguns destes prestadores têm infraestrutura ou sede nos EUA. Garantimos que existe um mecanismo legal de proteção — Cláusulas Contratuais-Tipo aprovadas pela Comissão Europeia e/ou certificação no EU-US Data Privacy Framework.",
        },
        {
          t: "advogado",
          texto:
            "Há incerteza jurídica crescente sobre a robustez do Data Privacy Framework em 2026, por causa de desenvolvimentos judiciais nos EUA. Recomenda-se não confiar só no DPF — manter Cláusulas Contratuais-Tipo como salvaguarda de reserva em todos os contratos, e rever esta secção a cada 6 meses enquanto a situação estiver instável.",
        },
      ],
    },
    {
      id: "direitos",
      titulo: "Os teus direitos",
      blocos: [
        {
          t: "p",
          texto:
            "Tens direito a aceder, corrigir, apagar, limitar ou pedir a portabilidade dos teus dados, e a opor-te a tratamentos baseados em interesse legítimo (por exemplo, à marca de água ou aos registos de sessão). Contacta **[privacidade@arestadigital.pt]** — respondemos em até 30 dias.",
        },
        {
          t: "p",
          texto:
            "Uma ressalva importante: o direito ao apagamento tem um limite quando existe obrigação fiscal de guardar dados de faturação (10 anos). Apagamos o teu perfil, mas não podemos apagar os registos de fatura antes desse prazo.",
        },
        {
          t: "p",
          texto:
            "Se não ficares satisfeito com a nossa resposta, podes reclamar junto da CNPD (Comissão Nacional de Proteção de Dados), em [www.cnpd.pt](https://www.cnpd.pt).",
        },
      ],
    },
    {
      id: "idade",
      titulo: "Idade mínima",
      blocos: [
        {
          t: "p",
          texto:
            "A FirstRow tem conteúdo com linguagem explícita. Só podes criar conta se tiveres 18 anos ou mais. Ver mais na [secção de idade mínima dos Termos e Condições](/legal/termos#idade).",
        },
      ],
    },
    {
      id: "alteracoes",
      titulo: "Alterações a esta política",
      blocos: [
        {
          t: "p",
          texto:
            "Podemos atualizar esta política. Avisamos por email ou na plataforma sempre que houver alterações relevantes.",
        },
      ],
    },
  ],
};

const termos: PaginaLegal = {
  slug: "termos",
  titulo: "Termos e Condições de Utilização",
  resumo: "O que a FirstRow é, o que compras quando pagas, e as regras de quem usa a plataforma.",
  seccoes: [
    {
      id: "o-que-e",
      titulo: "O que é a FirstRow",
      blocos: [
        {
          t: "p",
          texto:
            'A FirstRow é uma plataforma portuguesa que aloja e vende, em nome e por conta de terceiros ("Canais" — por exemplo, uma liga de batalhas de rap como o SmokingBars), acesso a transmissões em direto, vídeo a pedido (VOD) e bilhetes físicos para eventos presenciais.',
        },
        {
          t: "p",
          texto:
            "A FirstRow não produz o conteúdo. Quem organiza, transmite e é responsável pelo conteúdo de cada evento é o Canal identificado em cada página de compra. A FirstRow processa o pagamento, protege o acesso contra pirataria, e cobra uma comissão sobre cada venda.",
        },
        {
          t: "p",
          texto:
            "Isto não significa que ficamos de fora se algo correr mal. Por processarmos sempre o pagamento e definirmos os termos da compra, a lei portuguesa (Decreto-Lei n.º 84/2021) considera-nos responsáveis, junto com o Canal, perante ti caso o serviço não seja prestado como anunciado — por exemplo, evento cancelado sem aviso, live que nunca começa, ou VOD que fica indisponível. Nesses casos tens direito a reembolso pedindo-o à FirstRow; resolvemos depois internamente com o Canal.",
        },
      ],
    },
    {
      id: "conta",
      titulo: "A tua conta",
      blocos: [
        {
          t: "p",
          texto:
            'Precisas de criar conta — nome, email, password, ou login com Google — para comprar e aceder a conteúdo. Tens de ter 18 anos ou mais (ver secção "Idade mínima" abaixo).',
        },
        {
          t: "p",
          texto:
            "És responsável por manter os teus dados de acesso confidenciais e por tudo o que acontecer na tua conta.",
        },
      ],
    },
    {
      id: "uma-conta",
      titulo: "Uma conta, uma pessoa",
      blocos: [
        {
          t: "p",
          texto:
            "A tua conta é pessoal e intransmissível. Serve para veres o que compraste — não para partilhar com amigos, família ou desconhecidos, nem para vender ou emprestar.",
        },
        { t: "p", texto: "Por isso:" },
        {
          t: "lista",
          itens: [
            "Só podes ter **uma sessão aberta de cada vez**. Se entrares noutro dispositivo, a sessão anterior fecha automaticamente — sem penalização, é só o funcionamento normal do serviço.",
            "Os vídeos que vês trazem uma marca de água discreta com o teu email, para proteger o trabalho de quem cria o conteúdo e travar cópias ilegais.",
            "Guardamos registos técnicos (sessões, IPs) só para detetar utilização indevida da conta — nunca para outro fim. Mais detalhes na [Política de Privacidade](/legal/privacidade).",
          ],
        },
        {
          t: "p",
          texto:
            "Se detetarmos sinais de partilha ou de acesso simultâneo fora do normal, fazemos isto, por esta ordem:",
        },
        {
          t: "lista",
          numerada: true,
          itens: [
            "Avisamos-te por email, a explicar o que detetámos e a dar-te oportunidade de responder ou corrigir a situação.",
            "Se a situação persistir ou se repetir, suspendemos temporariamente o acesso até esclarecermos o caso.",
            "Só encerramos a conta em definitivo em caso grave ou reincidência — nunca sem te avisar antes, exceto em casos flagrantes de revenda ou distribuição organizada do conteúdo, em que podemos agir de imediato para proteger os outros utilizadores e os Canais.",
          ],
        },
        {
          t: "p",
          texto: `Achas que houve um engano (por exemplo, esqueceste-te de sair de uma sessão noutro sítio)? Contacta ${LINK_SUPORTE} — respondemos e corrigimos rapidamente. Nada disto tira qualquer direito que tenhas por lei como consumidor, incluindo recorrer a tribunal.`,
        },
      ],
    },
    {
      id: "proibido",
      titulo: "O que não podes fazer",
      blocos: [
        {
          t: "lista",
          itens: [
            "Partilhar a tua conta ou credenciais com terceiros.",
            "Gravar, transmitir, retransmitir, descarregar ou redistribuir por qualquer meio o conteúdo a que acedes.",
            "Tentar contornar a proteção de acesso ou a marca de água.",
            "Usar bots ou scripts para aceder ou comprar de forma automatizada.",
            "Revender um bilhete por valor superior ao que pagaste — em Portugal, isto pode ser crime de especulação.",
          ],
        },
      ],
    },
    {
      id: "licenca",
      titulo: "O que compras: acesso, não propriedade",
      blocos: [
        {
          t: "p",
          texto:
            "Quando pagas por uma live, um VOD ou um bilhete, estás a comprar uma licença pessoal, intransmissível e não exclusiva para aceder a esse conteúdo ou evento — não estás a comprar uma cópia, um ficheiro, nem qualquer direito sobre o conteúdo em si. Os direitos de autor e conexos pertencem ao Canal ou aos seus licenciadores.",
        },
        {
          t: "p",
          texto:
            "Um bilhete físico dá-te direito de entrada no evento identificado, validado por QR code à porta.",
        },
      ],
    },
    {
      id: "conteudo",
      titulo: "Regras de conteúdo",
      blocos: [
        {
          t: "p",
          texto:
            "Não produzimos o conteúdo das lives, mas isso não quer dizer que vale tudo. Se algo publicado num Canal for ilegal ou violar estas regras, podemos remover, restringir ou suspender.",
        },
        { t: "p", texto: "Não é permitido, mesmo em contexto de batalha:" },
        {
          t: "lista",
          itens: [
            "Ameaças reais e credíveis contra uma pessoa identificável, fora do jogo da batalha (isto não inclui o disse artístico normal do género — esse é permitido).",
            "Discurso de ódio, incitação à violência, ou assédio dirigido a alguém fora do palco.",
            "Conteúdo com abuso ou exploração de menores — proibido em qualquer circunstância; denunciamos às autoridades de imediato.",
            "Conteúdo que viole direitos de autor de terceiros (por exemplo, música com sample não licenciado).",
            "Burla, revenda fraudulenta ou falsificação de bilhetes.",
          ],
        },
        {
          t: "p",
          texto:
            "Decidimos com revisão humana, com apoio de ferramentas automáticas quando existirem (por exemplo, para detetar redistribuição ilegal do stream). Agimos de forma proporcional e explicamos sempre a decisão a quem for afetado.",
        },
        { t: "sub", texto: "Como denunciar conteúdo" },
        {
          t: "p",
          texto:
            "Achas que uma live, um vídeo ou parte de um vídeo é ilegal? Escreve para **[denuncias@]** com:",
        },
        {
          t: "lista",
          numerada: true,
          itens: [
            "Onde está o conteúdo — link exato da live/VOD e, se possível, o minuto.",
            'Porque achas que é ilegal — com factos, não só "não gosto".',
            "O teu nome e email, para te podermos responder.",
            "Confirmação de que acreditas de boa-fé que a informação é verdadeira e completa.",
          ],
        },
        {
          t: "p",
          texto: `Confirmamos a receção sem demora, analisamos, e dizemos-te o que decidimos e como podes recorrer se não concordares. Isto é diferente do suporte geral (${LINK_SUPORTE}) — usa este canal só para denunciar conteúdo.`,
        },
        {
          t: "p",
          texto:
            "Se removermos, restringirmos ou suspendermos um Canal por causa de conteúdo, explicamos sempre por escrito: o que fizemos, os factos, se a deteção foi automática ou humana, a base legal ou contratual, e como recorrer.",
        },
      ],
    },
    {
      id: "pagamento",
      titulo: "Pagamento e direito de resolução",
      blocos: [
        {
          t: "p",
          texto:
            "Pagas por MB WAY, processado pela Eupago. Não há subscrição — cada compra é um pagamento único.",
        },
        {
          t: "p",
          texto:
            '**Lives e VOD**: ao confirmar a compra, pedimos-te confirmação expressa de que queres que o acesso comece de imediato e de que sabes que, ao fazê-lo, perdes o direito de resolução de 14 dias que terias noutro tipo de compra online. Sem essa confirmação explícita, não processamos a compra como "início imediato". Guardamos o registo dessa confirmação, para tua proteção e nossa.',
        },
        {
          t: "p",
          texto:
            "**Bilhetes de eventos presenciais com data marcada**: por se tratar de um serviço de lazer com data específica, o direito de resolução de 14 dias não se aplica depois da compra confirmada, nos termos da lei. Se o evento for cancelado ou substancialmente alterado, tens direito a reembolso integral — ver a [Política de Reembolsos](/legal/reembolsos).",
        },
        {
          t: "advogado",
          texto:
            "A política aplicada a um PPV comprado dias antes de a live arrancar (se o direito de resolução se mantém até o stream começar, ou se a compra é logo definitiva por ter data marcada) precisa de confirmação jurídica antes do lançamento comercial — ver detalhe na Política de Reembolsos.",
        },
      ],
    },
    {
      id: "responsabilidade",
      titulo: "Limitação de responsabilidade",
      blocos: [
        {
          t: "p",
          texto:
            "Respondemos por danos diretos resultantes de incumprimento comprovado do serviço — por exemplo, falha técnica da nossa plataforma que impeça um acesso já pago — até ao limite do valor pago na compra em causa. Não respondemos por danos indiretos ou lucros cessantes.",
        },
        {
          t: "p",
          texto:
            "Nada nestes termos exclui responsabilidade que a lei portuguesa não permita excluir, nomeadamente por dolo ou negligência grave, nem a responsabilidade solidária que a lei nos atribui, junto com o Canal, por falhas na prestação do serviço vendido.",
        },
      ],
    },
    {
      id: "litigios",
      titulo: "Reclamações e resolução de litígios",
      blocos: [
        {
          t: "p",
          texto:
            "Tens à disposição o Livro de Reclamações Eletrónico da FirstRow, em **[link, registado em livroreclamacoes.pt]**.",
        },
        {
          t: "p",
          texto:
            "Se não ficares satisfeito com a nossa resposta, podes recorrer a uma entidade de Resolução Alternativa de Litígios de consumo (por exemplo, o CNIACC, [www.cniacc.pt](https://www.cniacc.pt), ou outra entidade territorialmente competente) ou à plataforma europeia de resolução de litígios online, em [webgate.ec.europa.eu/odr](https://webgate.ec.europa.eu/odr).",
        },
      ],
    },
    {
      id: "idade",
      titulo: "Idade mínima",
      blocos: [
        {
          t: "p",
          texto:
            "A FirstRow tem conteúdo com linguagem explícita, próprio do battle rap. Só podes criar conta se tiveres **18 anos ou mais**.",
        },
        {
          t: "p",
          texto:
            "Não aceitamos registos de menores, mesmo com autorização dos pais — não temos forma de validar essa autorização de forma segura, e preferimos manter a regra simples e clara para todos. Ao criar conta, confirmas que tens 18 anos ou mais. Se percebermos que uma conta pertence a um menor, podemos suspendê-la e cancelar compras associadas, sem reembolso, exceto quando a lei obrigue ao contrário.",
        },
        {
          t: "p",
          texto: `Se és pai, mãe ou encarregado de educação e achas que o teu filho criou conta na FirstRow, contacta ${LINK_SUPORTE}.`,
        },
        {
          t: "advogado",
          texto:
            "18 anos é uma escolha de negócio mais rigorosa do que o mínimo legal do RGPD em Portugal (13 anos). É proposital: simplifica a conformidade (sem fluxo de consentimento parental) e reduz o risco de um encarregado de educação pedir a anulação de uma compra feita por um menor.",
        },
      ],
    },
    {
      id: "lei",
      titulo: "Lei aplicável e foro",
      blocos: [
        {
          t: "p",
          texto:
            "Estes termos regem-se pela lei portuguesa. Se residires habitualmente noutro país da União Europeia, mantens as proteções imperativas que a lei desse país te confere como consumidor, independentemente desta escolha de lei.",
        },
        {
          t: "p",
          texto:
            "Para litígios com consumidores residentes em Portugal, é competente o tribunal do teu domicílio, salvo disposição legal imperativa em contrário.",
        },
      ],
    },
    {
      id: "alteracoes",
      titulo: "Alterações a estes termos",
      blocos: [
        {
          t: "p",
          texto:
            "Podemos atualizar estes termos para refletir alterações legais, novas funcionalidades ou ajustes ao serviço. Alterações relevantes são comunicadas por email e/ou aviso destacado na plataforma, com antecedência razoável. Continuar a usar a FirstRow depois dessa data equivale a aceitar os novos termos. Compras já feitas mantêm-se reguladas pelos termos em vigor no momento da compra.",
        },
      ],
    },
    {
      id: "contactos-autoridades",
      titulo: "Pontos de contacto (autoridades e utilizadores)",
      blocos: [
        {
          t: "lista",
          itens: [
            "**Contacto para autoridades** (Digital Services Act): **[dsa@]** — para comunicação com o Coordenador de Serviços Digitais em Portugal (ANACOM), a Comissão Europeia e outras autoridades. Aceitamos comunicações em português.",
            `**Contacto para utilizadores**: ${LINK_SUPORTE} — com resposta humana, não apenas automatizada.`,
            '**Denúncia de conteúdo ilegal**: **[denuncias@]** (ver secção "Como denunciar conteúdo" acima).',
          ],
        },
        {
          t: "p",
          texto:
            "Em Portugal, a autoridade coordenadora dos serviços digitais é a ANACOM. Para matérias de comunicação social, a autoridade competente é a ERC; para direitos de autor, a IGAC.",
        },
      ],
    },
    {
      id: "contactos",
      titulo: "Contactos",
      blocos: [
        {
          t: "p",
          texto: `**${ENTIDADE_LEGAL}**, NIF **[—]**, sede em **[—]**, contacto **[email/telefone]**. Para questões sobre um evento ou conteúdo específico, o contacto do Canal responsável está indicado na página desse evento.`,
        },
      ],
    },
  ],
};

const reembolsos: PaginaLegal = {
  slug: "reembolsos",
  titulo: "Política de Reembolsos e Cancelamentos",
  resumo:
    "As regras não são iguais para uma live, para o arquivo e para um bilhete físico. Aqui estão as três, separadas.",
  intro: [
    {
      t: "p",
      texto:
        "Esta página explica, separadamente, o que acontece em três situações diferentes: acesso a uma **live**, acesso a **arquivo/VOD**, e compra de **bilhete físico** para um evento presencial. As regras não são iguais para as três.",
    },
  ],
  seccoes: [
    {
      id: "regra-geral",
      titulo: 'Regra geral: sem "mudei de ideias"',
      blocos: [
        {
          t: "p",
          texto:
            "Por lei, tens normalmente 14 dias para desistir de uma compra online, sem dar explicações. A FirstRow enquadra-se nas exceções a essa regra — mas de forma diferente consoante o que compraste. Por isso, antes de cada compra, pedimos-te uma confirmação explícita, no próprio ecrã de pagamento. Sem essa confirmação, não conseguimos processar o pagamento.",
        },
        {
          t: "p",
          texto:
            "Isto não te tira direitos: se o problema for do nosso lado ou do Canal — evento cancelado, live que não arranca, stream que falha — continuas coberto pelas regras abaixo.",
        },
      ],
    },
    {
      id: "live",
      titulo: "Acesso a live (pay-per-view)",
      blocos: [
        {
          t: "p",
          texto:
            "Depois de confirmares a compra e aceitares o início imediato do acesso, não podes pedir reembolso por teres mudado de ideias.",
        },
        {
          t: "p",
          texto:
            "**Se a live for cancelada** antes de começar: reembolso total, incluindo qualquer taxa de serviço da FirstRow — não só o valor líquido que a liga recebe.",
        },
        {
          t: "p",
          texto:
            "**Se a live for adiada** para nova data: o teu acesso mantém-se válido para a nova data. Se não puderes assistir na nova data, podes pedir reembolso total dentro de **[definir prazo, ex.: 10 dias após o anúncio da nova data]**.",
        },
        {
          t: "p",
          texto:
            '**Se a stream falhar** (não arrancar, cair a meio, qualidade inaceitável) por um problema do lado da FirstRow ou do Canal: **[DEFINIR política de negócio, ex.: "se a falha durar mais de X minutos, tens direito a reembolso total ou parcial, pedido através do suporte até 48h depois do evento"]**. Isto não é imposto por nenhuma lei específica de streaming em Portugal — é uma política nossa, mas fica escrita e visível, não decidida caso a caso.',
        },
        {
          t: "advogado",
          texto:
            'Se compraste uma live com antecedência (dias antes do início), a lei pode ainda te dar o direito de resolução de 14 dias até o stream de facto começar — ou pode tratar-se logo de "serviço de lazer com data marcada" e a compra ser definitiva desde o início. Isto ainda não está confirmado juridicamente. Decisão de produto pendente: até quantas horas antes do início é possível cancelar uma live comprada com antecedência.',
        },
      ],
    },
    {
      id: "vod",
      titulo: "Acesso a arquivo / VOD",
      blocos: [
        {
          t: "p",
          texto:
            "Depois de confirmares o acesso imediato ao vídeo (checkbox obrigatória no checkout), perdes o direito de resolução de 14 dias assim que o vídeo ficar disponível para ti.",
        },
        {
          t: "p",
          texto: `Se o vídeo não carregar ou estiver corrompido por um erro do nosso lado, tens direito a reembolso total — contacta ${LINK_SUPORTE} com o comprovativo de compra.`,
        },
        {
          t: "p",
          // Janela do VOD decidida: 30 dias. Continua a ser decisão de produto,
          // não obrigação legal — mas agora está escrita e visível.
          texto: `**Janela de disponibilidade**: o VOD fica disponível na tua conta durante ${JANELA_VOD_DIAS} dias depois do evento ao vivo. Não é uma obrigação legal — é uma decisão nossa, mas fica escrita e visível.`,
        },
      ],
    },
    {
      id: "bilhete",
      titulo: "Bilhete físico para evento presencial",
      blocos: [
        {
          t: "p",
          texto:
            "Depois de confirmada a compra, não tens direito de resolução de 14 dias — é a mesma exceção legal que se aplica a bilhetes de concertos ou espetáculos com data marcada.",
        },
        {
          t: "p",
          texto:
            "**Se o evento for cancelado**: reembolso total do bilhete, incluindo qualquer taxa de serviço da FirstRow, no prazo de 30 dias.",
        },
        {
          t: "p",
          texto:
            "**Se o evento for adiado** para nova data: o teu bilhete mantém-se válido para a nova data — não precisas de fazer nada. Se não puderes ir à nova data, podes pedir reembolso total dentro de **[DEFINIR prazo, ex.: 10 dias após o anúncio da nova data]**.",
        },
        {
          t: "p",
          texto:
            "**Se houver alteração relevante** do cartaz ou do artista/liga principal anunciado: tens direito a reembolso total.",
        },
        {
          t: "p",
          texto:
            "**Exceção**: se o espetáculo for interrompido já depois de começado por motivo de força maior (incêndio, catástrofe natural ou outro acontecimento imprevisível fora do controlo do Canal), pode não haver lugar a reembolso.",
        },
        {
          t: "p",
          texto:
            "**Quem reembolsa**: é sempre a FirstRow quem processa o teu reembolso, mesmo quando a causa é do Canal (por exemplo, cancelamento do evento). Não precisas de negociar diretamente com o Canal — nós tratamos disso e ajustamos as contas com o Canal por trás.",
        },
      ],
    },
    {
      id: "como-funciona",
      titulo: "Como funciona o reembolso, na prática",
      blocos: [
        {
          t: "p",
          texto:
            "O MB WAY não tem estorno automático como um cartão de crédito. Os reembolsos são processados manualmente pela nossa equipa através da Eupago, para o mesmo número de telemóvel usado na compra.",
        },
        {
          t: "p",
          texto:
            "**Prazo**: normalmente entre **[5 a 10 dias úteis]** para falhas técnicas comprovadas; até 30 dias para cancelamento de eventos (bilhetes físicos), conforme a lei.",
        },
        {
          t: "p",
          texto: `**Como pedir**: contacta ${LINK_SUPORTE} com o comprovativo de compra e o motivo. Analisamos caso a caso.`,
        },
      ],
    },
    {
      id: "reclamacoes",
      titulo: "Reclamações",
      blocos: [
        {
          t: "p",
          texto:
            "Se não ficares satisfeito com a resposta ao teu pedido de reembolso, tens à disposição o Livro de Reclamações Eletrónico da FirstRow (link no rodapé do site) e, para questões específicas de cancelamento de eventos, podes também recorrer à IGAC (Inspeção-Geral das Atividades Culturais).",
        },
      ],
    },
  ],
};

const cookies: PaginaLegal = {
  slug: "cookies",
  titulo: "Política de Cookies",
  resumo:
    "Só usamos os cookies precisos para o serviço funcionar. Sem publicidade, sem rastreio entre sites.",
  intro: [
    {
      t: "p",
      texto:
        "A FirstRow usa cookies só para o que é preciso para o site e a app funcionarem. Não usamos cookies de publicidade, não vendemos dados a terceiros, e não temos (para já) nenhuma ferramenta de analytics que crie um identificador no teu telemóvel ou computador.",
    },
  ],
  seccoes: [
    {
      id: "o-que-usamos",
      titulo: "O que usamos",
      blocos: [
        {
          t: "lista",
          itens: [
            "**Cookie de sessão/autenticação** — mantém-te com sessão iniciada depois do login (incluindo quando entras com a tua conta Google). Sem ele não consegues comprar, ver o que já compraste, nem aceder ao teu histórico.",
            "**Cookie de sessão única** — é assim que garantimos que a tua conta só pode estar aberta num sítio de cada vez, o que faz parte de como protegemos o conteúdo das ligas contra partilha de acessos.",
            "**Cookies técnicos do pagamento** (Eupago/MB WAY) — só existem durante o processo de compra, para ligar o pagamento à tua conta.",
          ],
        },
        {
          t: "p",
          texto:
            "Estes cookies servem só para te dar o serviço que tu próprio pediste: criar conta, iniciar sessão, comprar e ver conteúdo. Por isso, a lei que regula cookies em Portugal (Lei n.º 41/2004) não exige que peçamos a tua autorização antes de os usar. O que a lei exige — e é o que estamos a fazer aqui — é explicar-te com clareza o que são e para que servem.",
        },
      ],
    },
    {
      id: "o-que-nao-fazemos",
      titulo: "O que não fazemos (para já)",
      blocos: [
        {
          t: "p",
          texto:
            "Não usamos Google Analytics, Meta Pixel, TikTok Pixel, nem qualquer ferramenta que siga o teu comportamento entre sites ou crie um perfil publicitário. Se isso mudar um dia, vais ver um aviso a pedir a tua autorização antes de qualquer cookie desse tipo ser ativado, com a opção de recusar tão fácil e visível como a de aceitar.",
        },
      ],
    },
    {
      id: "dados-pessoais",
      titulo: "Dados pessoais",
      blocos: [
        {
          t: "p",
          texto:
            "Esta página é só sobre cookies. Para saberes que dados pessoais tratamos (nome, email, telemóvel usado no MB WAY, histórico de compras, sessões e IP para segurança da conta, marca de água), com que finalidade e durante quanto tempo, consulta a [Política de Privacidade](/legal/privacidade).",
        },
      ],
    },
    {
      id: "duvidas",
      titulo: "Dúvidas",
      blocos: [
        {
          t: "p",
          texto:
            "Escreve para **[privacidade@arestadigital.pt]** se quiseres saber mais ou pedir para apagares a tua conta e os teus dados.",
        },
      ],
    },
  ],
};

/** As quatro páginas, pela ordem em que aparecem no rodapé e no sitemap. */
export const PAGINAS_LEGAIS: readonly PaginaLegal[] = [privacidade, termos, reembolsos, cookies];

/** A página de um slug, ou `null` — o que faz um URL inventado dar 404. */
export function paginaLegal(slug: string): PaginaLegal | null {
  return PAGINAS_LEGAIS.find((p) => p.slug === slug) ?? null;
}
