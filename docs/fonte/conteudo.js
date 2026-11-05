// Conteúdo do documento da APS (Respira Urbana).
// Para atualizar o documento quando o aplicativo mudar, edite este arquivo e rode: node gerar.js
// Tipos de bloco: h1, h2, h3, p, ul, ol, code, fig, table, print (lugar para print de tela), pb (quebra de página)
// Em textos: **negrito**, *itálico*, `código`.

const capa = {
  instituicao: 'UNIVERSIDADE PAULISTA – UNIP',
  curso: 'CIÊNCIA DA COMPUTAÇÃO – 7º/8º SEMESTRE',
  disciplina: 'Atividades Práticas Supervisionadas (APS) – Desenvolvimento de Sistemas Distribuídos (DSD)',
  titulo: 'RESPIRA URBANA',
  subtitulo: 'Desenvolvimento de uma aplicação de sistema distribuído para dispositivo móvel voltada ao monitoramento de informações ambientais urbanas',
  alunos: [
    ['[NOME DO ALUNO 1]', '[RA]'],
    ['[NOME DO ALUNO 2]', '[RA]'],
    ['[NOME DO ALUNO 3]', '[RA]'],
  ],
  local: '[CAMPUS] – [CIDADE]',
  ano: '2026',
};

const secoes = [
  // =====================================================================
  ['h1', '1 OBJETIVO E MOTIVAÇÃO DO TRABALHO'],
  ['h2', '1.1 Objetivo'],
  ['p', 'O objetivo deste trabalho é desenvolver o **Respira Urbana**, uma aplicação baseada em sistemas distribuídos para dispositivo móvel que reúne em um único mapa interativo as principais informações ambientais de uma cidade: poluição do ar, trânsito e transporte público, risco de alagamento e inundação, inversão térmica, áreas de mananciais e desmatamento, além das condições do clima. O aplicativo roda como app Android e também no navegador. Ele vigia automaticamente um conjunto de cidades, gera alertas quando alguma delas apresenta uma situação ambiental relevante e envia esses alertas ao celular do usuário como notificações *push*.'],
  ['p', 'Do ponto de vista técnico, o objetivo é aplicar na prática os conceitos da disciplina de Desenvolvimento de Sistemas Distribuídos. O servidor foi dividido em nove processos independentes (um gateway e oito microsserviços), cada um em seu próprio container, que se comunicam de duas formas: chamadas síncronas HTTP/REST e mensagens assíncronas no modelo publicação/assinatura (*publish/subscribe*). Somam-se a isso cache distribuído, tolerância a falhas parciais, isolamento de credenciais, integração com o serviço de notificações do Google (Firebase Cloud Messaging) e implantação em servidor na nuvem com HTTPS.'],
  ['p', 'São objetivos específicos:'],
  ['ul', [
    'permitir que o usuário localize a si mesmo pelo GPS do aparelho ou busque qualquer cidade pelo nome;',
    'exibir, sobre o mapa, camadas temáticas que podem ser ligadas ao mesmo tempo, cada uma com sua legenda;',
    'calcular indicadores próprios de risco de alagamento (chuva prevista combinada com a vazão dos rios) e de inversão térmica (perfil vertical de temperatura previsto);',
    'informar se um ponto está dentro, perto ou fora de uma área de manancial e cruzar essas áreas com alertas de desmatamento por satélite, sinalizando possíveis invasões;',
    'monitorar periodicamente cidades configuradas, gerar alertas sem duplicação e entregá-los como notificações no celular, conforme o nível e a área escolhidos pelo usuário;',
    'manter o aplicativo funcionando mesmo quando um dos serviços internos ou externos estiver indisponível, informando ao usuário o estado de cada parte.',
  ]],
  ['h2', '1.2 Motivação'],
  ['p', 'Os problemas ambientais urbanos raramente aparecem isolados. Um dia de inversão térmica com vento fraco retém poluentes perto do solo; uma chuva forte provoca alagamentos que, por sua vez, travam o trânsito e o transporte público; a ocupação irregular das margens de represas reduz a vegetação que protege a água que a cidade consome. Apesar disso, as informações sobre cada tema costumam estar espalhadas em portais diferentes, com linguagens e formatos diferentes, o que dificulta para o cidadão comum perceber a situação do lugar onde está.'],
  ['p', 'A Organização Mundial da Saúde associa a poluição do ar a milhões de mortes prematuras por ano e, em 2021, tornou mais rígidos os seus valores de referência para material particulado e outros poluentes (WORLD HEALTH ORGANIZATION, 2021). No Brasil, a Política Nacional de Proteção e Defesa Civil reconhece a importância de sistemas de informação e monitoramento para a prevenção de desastres, incluindo os hidrológicos (BRASIL, 2012). Uma ferramenta que reúna dados abertos e avise o cidadão no celular contribui, em pequena escala, para essa cultura de prevenção.'],
  ['p', 'Escolhemos uma arquitetura distribuída porque o próprio problema é distribuído: os dados vêm de fontes independentes (Open-Meteo, OpenStreetMap, TomTom, Global Forest Watch), cada uma com sua latência, seus limites de uso e suas falhas, e os alertas precisam chegar a aparelhos espalhados pela cidade. Separar cada fonte e cada responsabilidade em um serviço próprio torna natural tratar essas diferenças, escalar apenas o que for necessário e impedir que a falha de uma parte derrube o aplicativo inteiro.'],
  ['p', 'Por fim, o trabalho tem uma motivação formativa: ele exige que o grupo pense em problemas que não aparecem em programas executados em um único processo, como tempo limite de rede, respostas parciais, consistência de cache, mensagens entregues a quem não se conhece, segurança de chaves de acesso e entrega de notificações a dispositivos móveis. Esses são problemas que encontraremos no mercado de trabalho.'],

  // =====================================================================
  ['h1', '2 INTRODUÇÃO'],
  ['p', 'A maior parte da população brasileira vive em áreas urbanas, e é nas cidades que se concentram os efeitos da emissão de poluentes por veículos e indústrias, da impermeabilização do solo, da ocupação de áreas de mananciais e da supressão da vegetação. Esses fenômenos afetam diretamente a saúde, a mobilidade e a segurança das pessoas, e por isso o acesso rápido à informação ambiental tem valor prático: decidir se é um bom dia para atividade física ao ar livre, evitar uma via alagada ou entender por que o céu da cidade amanheceu cinza.'],
  ['p', 'Ao mesmo tempo, nunca houve tantos dados ambientais abertos. Serviços como o Open-Meteo disponibilizam gratuitamente previsões meteorológicas, de qualidade do ar e de vazão de rios para qualquer coordenada do planeta; o OpenStreetMap mantém uma base colaborativa com estações de transporte, represas e áreas protegidas; o Global Forest Watch publica mapas de perda de cobertura arbórea (HANSEN et al., 2013) e alertas semanais de desmatamento detectados por satélite (HANSEN et al., 2016; REICHE et al., 2021); e empresas como a TomTom oferecem dados de trânsito em tempo real. O desafio deixou de ser a falta de dados e passou a ser integrá-los de forma confiável.'],
  ['p', 'Integrar várias fontes remotas é, por definição, um problema de sistemas distribuídos. Coulouris et al. (2013) definem um sistema distribuído como aquele em que componentes localizados em computadores interligados em rede se comunicam e coordenam suas ações apenas pela troca de mensagens. Tanenbaum e Van Steen (2007) acrescentam que, para o usuário, esse conjunto deve parecer um sistema único e coerente. As consequências dessa definição são conhecidas: concorrência entre componentes, ausência de um relógio global e falhas independentes, isto é, uma parte pode falhar enquanto as demais continuam funcionando.'],
  ['p', 'Nos últimos anos, essas ideias ganharam forma prática na arquitetura de **microsserviços**, em que uma aplicação é composta por serviços pequenos, autônomos, implantados de forma independente e organizados em torno de capacidades de negócio (NEWMAN, 2021). Cada serviço pode ser desenvolvido, testado, reiniciado e escalado sem afetar os outros, desde que o contrato de comunicação entre eles seja respeitado. Ferramentas de conteinerização como o Docker tornaram esse modelo acessível até mesmo a projetos acadêmicos, pois todo o sistema pode ser iniciado com um único comando, tanto no computador do desenvolvedor quanto em um servidor na nuvem.'],
  ['p', 'Do lado do usuário, o dispositivo móvel é o meio natural para esse tipo de informação, porque o celular está com a pessoa no momento em que ela precisa decidir, conhece sua localização e pode avisá-la mesmo com o aplicativo fechado. O Respira Urbana adota uma abordagem **híbrida**: a interface foi escrita uma única vez com tecnologias web (HTML, CSS e JavaScript), de forma responsiva, e empacotada como aplicativo Android nativo com o Capacitor. O app usa recursos do sistema operacional, como a permissão nativa de localização e as notificações *push*, e a mesma interface continua disponível no navegador de qualquer aparelho.'],
  ['p', 'Este documento está organizado da seguinte forma: o Capítulo 3 apresenta os fundamentos das tecnologias escolhidas; o Capítulo 4, o plano de desenvolvimento, com requisitos, ferramentas e etapas; o Capítulo 5 descreve o projeto do programa, seus módulos e a comunicação entre eles; o Capítulo 6 traz o relatório com as principais linhas de código comentadas; o Capítulo 7 apresenta o programa em funcionamento e os testes realizados; o Capítulo 8 reúne as considerações finais, com dificuldades, aprendizados e a interdisciplinaridade envolvida; e, por fim, consta a bibliografia.'],

  // =====================================================================
  ['h1', '3 FUNDAMENTOS DAS TECNOLOGIAS PARA DISPOSITIVOS MÓVEIS ESCOLHIDAS'],
  ['h2', '3.1 Sistemas distribuídos e o modelo cliente-servidor'],
  ['p', 'Um sistema distribuído é um conjunto de computadores independentes que se apresenta ao usuário como um sistema único (TANENBAUM; VAN STEEN, 2007). Seus objetivos clássicos são o compartilhamento de recursos, a transparência (esconder do usuário onde e como os recursos estão), a abertura (uso de interfaces padronizadas) e a escalabilidade. Coulouris et al. (2013) destacam três desafios que acompanham esses objetivos: a heterogeneidade das máquinas e redes, o tratamento de falhas parciais e a segurança da comunicação.'],
  ['p', 'O modelo mais usado para organizar esses sistemas é o **cliente-servidor**: o cliente envia uma requisição e o servidor devolve uma resposta. No Respira Urbana, o aplicativo no celular é o cliente e o *api-gateway* é o servidor com o qual ele conversa. Internamente, porém, o próprio gateway atua como cliente dos demais serviços, que por sua vez são clientes de APIs externas. Essa organização em camadas é o que Tanenbaum e Van Steen (2007) chamam de arquitetura multicamada (*multitiered*), em que um servidor também pode fazer o papel de cliente.'],
  ['h2', '3.2 Arquitetura de microsserviços e API Gateway'],
  ['p', 'Microsserviços são serviços pequenos e autônomos que trabalham juntos, cada um responsável por uma capacidade bem delimitada e com seu próprio ciclo de implantação (NEWMAN, 2021). Entre as vantagens estão o isolamento de falhas, a possibilidade de usar tecnologias diferentes em cada serviço e a escalabilidade seletiva. Entre as desvantagens estão a maior complexidade operacional e a necessidade de lidar explicitamente com a rede, que pode ser lenta ou falhar.'],
  ['p', 'Para que o cliente não precise conhecer o endereço de cada serviço, adota-se o padrão **API Gateway**: um ponto de entrada único que recebe as requisições externas, as encaminha aos serviços internos e, quando necessário, combina várias respostas em uma só (RICHARDSON, 2018). No projeto, o gateway também concentra o cache, a validação de parâmetros, a política de CORS e um limite de requisições para o cadastro de aparelhos, e é o único componente exposto ao aplicativo.'],
  ['h2', '3.3 Comunicação síncrona: HTTP, REST e JSON'],
  ['p', 'A comunicação síncrona do sistema usa o protocolo HTTP sobre TCP/IP, seguindo o estilo arquitetural **REST** (*Representational State Transfer*), proposto por Fielding (2000). No REST, cada recurso é identificado por uma URL, a interação é sem estado (cada requisição carrega tudo o que é necessário para ser atendida) e as respostas podem ser armazenadas em cache. Essas restrições favorecem a escalabilidade, pois qualquer instância de um serviço pode atender qualquer requisição.'],
  ['p', 'Os dados trafegam no formato **JSON** (*JavaScript Object Notation*), leve, legível e suportado nativamente por JavaScript, linguagem usada tanto no cliente quanto no servidor. Por exemplo, a requisição `GET /api/environment?lat=-23.55&lon=-46.63` devolve, em um único objeto JSON, o clima, a qualidade do ar, os riscos e o trânsito do ponto informado, junto com o estado de cada parte.'],
  ['h2', '3.4 Comunicação assíncrona: publicação/assinatura (Pub/Sub)'],
  ['p', 'Na comunicação assíncrona, quem envia não espera a resposta de quem recebe. No modelo **publicação/assinatura**, produtores publicam mensagens em canais e consumidores assinam os canais que lhes interessam; o intermediário (*broker*) entrega as mensagens a todos os assinantes. Eugster et al. (2003) mostram que esse modelo desacopla os participantes em três dimensões: espaço (um não conhece o outro), tempo (não precisam estar ativos ao mesmo tempo, quando há persistência) e sincronização (o produtor não fica bloqueado).'],
  ['p', 'O Respira Urbana usa dois canais. No primeiro, `air-quality-alerts`, o *air-quality-service* publica quando encontra um índice de qualidade do ar ruim e o *alert-service* consome. No segundo, `alerts-new`, o *alert-service* publica cada alerta novo e o *push-service* consome para enviar as notificações. Nenhum desses serviços conhece o endereço do outro; foi possível acrescentar o envio de notificações sem alterar quem produz os alertas, o que ilustra bem o desacoplamento descrito por Eugster et al. (2003).'],
  ['h2', '3.5 Redis: cache distribuído e intermediário de mensagens'],
  ['p', 'O Redis é um banco de dados em memória do tipo chave-valor, conhecido pela baixa latência. No projeto ele cumpre três papéis. O primeiro é de **cache distribuído**: respostas das APIs externas são guardadas com tempo de expiração (TTL), o que reduz a latência, economiza as cotas gratuitas das APIs e permite que várias instâncias do gateway compartilhem o mesmo cache. Kleppmann (2017) observa que manter dados derivados, como caches, é uma das principais técnicas para tornar aplicações orientadas a dados mais rápidas, desde que se aceite alguma defasagem.'],
  ['p', 'O segundo papel é de **broker Pub/Sub**, por meio dos comandos `PUBLISH` e `SUBSCRIBE`. O terceiro é de **armazenamento persistente leve**: a lista dos alertas recentes, a situação das cidades monitoradas e os aparelhos cadastrados para notificação ficam no Redis, gravados em disco pelo modo AOF (*append-only file*), e por isso sobrevivem à reinicialização dos containers. A deduplicação de alertas usa a operação atômica `SET ... NX EX`, que só grava uma chave se ela ainda não existir.'],
  ['h2', '3.6 Node.js e Express'],
  ['p', 'Os serviços foram escritos em JavaScript sobre o **Node.js**, um ambiente de execução baseado no motor V8 que usa um modelo de entrada e saída não bloqueante orientado a eventos. Esse modelo é especialmente adequado para serviços que passam a maior parte do tempo esperando respostas de rede, como os deste projeto: enquanto uma chamada a uma API externa não retorna, o processo continua atendendo outras requisições. O recurso `Promise.allSettled` permite disparar várias chamadas ao mesmo tempo e tratar o resultado de cada uma de forma independente.'],
  ['p', 'Sobre o Node.js foi usado o **Express**, um framework mínimo para servidores HTTP que organiza o código em rotas e *middlewares*. Cada serviço expõe suas rotas REST e uma rota `/health`, usada para verificar se o processo está ativo.'],
  ['h2', '3.7 Conteinerização, implantação e HTTPS'],
  ['p', 'Um container empacota a aplicação com suas dependências e a executa isolada do restante do sistema, compartilhando o núcleo do sistema operacional, o que o torna mais leve que uma máquina virtual. Burns (2018) aponta os containers como a unidade básica dos padrões modernos de sistemas distribuídos, por tornarem a implantação reproduzível. Cada serviço do projeto tem seu próprio `Dockerfile`, baseado na imagem `node:18-alpine`.'],
  ['p', 'O **Docker Compose** descreve, em um único arquivo, todos os containers, suas portas, variáveis de ambiente, dependências e verificações de saúde (*healthchecks*). Os containers se comunicam por uma rede virtual interna, na qual cada serviço é encontrado pelo próprio nome (por exemplo, `http://risk-service:3005`), uma forma simples de descoberta de serviços por DNS. O projeto tem dois arquivos: um de desenvolvimento, que expõe as portas de cada serviço e recarrega o código ao salvar, e um de produção, para um servidor virtual (VPS) na nuvem.'],
  ['p', 'Na produção, apenas o **Caddy** fica exposto à internet. Ele é um servidor web que atua como proxy reverso: entrega os arquivos do cliente e encaminha as chamadas `/api/*` ao gateway, enquanto o Redis e os microsserviços ficam inacessíveis de fora. O Caddy obtém e renova automaticamente certificados TLS da autoridade Let’s Encrypt, de modo que a comunicação entre o celular e o servidor é cifrada por HTTPS sem configuração manual (CADDY, 2026).'],
  ['h2', '3.8 Plataforma móvel: abordagem híbrida com Capacitor'],
  ['p', 'Há três abordagens principais para aplicações em dispositivos móveis: **nativas**, escritas para cada plataforma (Kotlin ou Java no Android, Swift no iOS), com acesso total ao sistema, mas com um código por plataforma; **web móveis**, executadas no navegador, sem instalação, mas com acesso limitado aos recursos do aparelho; e **híbridas**, em que uma interface web é executada dentro de um componente nativo (*WebView*) e ganha acesso aos recursos do sistema por meio de *plugins*.'],
  ['p', 'O grupo escolheu a abordagem híbrida com o **Capacitor**, ferramenta de código aberto mantida pela Ionic que empacota uma aplicação web em um projeto Android ou iOS e expõe recursos nativos a ela por uma ponte JavaScript (CAPACITOR, 2026). A escolha se justifica por três motivos: o foco da disciplina é a arquitetura distribuída no servidor, e não a reescrita da interface para cada plataforma; o mesmo código atende o app Android e o navegador, com correções aplicadas uma só vez; e os recursos que realmente exigiam o app nativo, a localização e as notificações *push*, estão disponíveis como *plugins* oficiais (`@capacitor/geolocation` e `@capacitor/push-notifications`).'],
  ['p', 'Essa decisão também resolveu um problema prático. Nos navegadores, a API de Geolocalização só funciona em contextos seguros, isto é, HTTPS ou `localhost` (MDN WEB DOCS, 2026a); acessando o servidor de desenvolvimento pelo IP da rede local, a localização era bloqueada. No app Android, a permissão é pedida pelo próprio sistema operacional, e a localização funciona mesmo com o servidor local em HTTP.'],
  ['p', 'Para que a mesma interface se comporte bem em telas pequenas, aplica-se o **design responsivo**, que combina layouts fluidos, imagens flexíveis e *media queries* do CSS (MARCOTTE, 2011). O W3C (2010) recomenda, para aplicações web móveis, minimizar o volume de dados transferidos, usar cache e tratar a falta de conectividade, práticas adotadas no projeto. O cliente declara a *meta tag* `viewport`, usa botões dimensionados para o toque, uma barra de filtros com rolagem horizontal, tema claro e escuro que acompanha a preferência do sistema operacional e guarda as preferências do usuário no `localStorage`.'],
  ['h2', '3.9 Notificações push e Firebase Cloud Messaging'],
  ['p', 'Notificação *push* é uma mensagem que o servidor envia ao aparelho sem que o usuário tenha aberto o aplicativo. Como o sistema operacional não permite que cada app mantenha sua própria conexão aberta com a internet, por economia de bateria, as mensagens passam por um serviço da plataforma; no Android, esse serviço é o **Firebase Cloud Messaging (FCM)**, do Google (FIREBASE, 2026).'],
  ['p', 'O funcionamento tem três etapas. Primeiro, o app pede permissão ao usuário e se registra no FCM, recebendo um *token*, um identificador único daquele aparelho. Segundo, o app envia esse *token* ao servidor do Respira Urbana, que o guarda junto com as preferências do usuário. Terceiro, quando há um alerta, o servidor chama a API HTTP v1 do FCM informando o *token* de destino, e o FCM entrega a mensagem ao aparelho. Para chamar essa API, o servidor se autentica com uma conta de serviço: assina um *JSON Web Token* (JWT) com o algoritmo RS256 (JONES; BRADLEY; SAKIMURA, 2015) e o troca por um token de acesso OAuth 2.0 no Google.'],
  ['h2', '3.10 Mapas na web e geometria computacional'],
  ['p', 'O mapa é desenhado com o **Leaflet**, biblioteca JavaScript de código aberto para mapas interativos, leve e com suporte a gestos de toque (LEAFLET, 2026). Mapas web costumam ser formados por *tiles*: imagens quadradas de 256 × 256 pixels, organizadas por nível de zoom e coordenadas `z/x/y` na projeção Web Mercator. O fundo do mapa vem do OpenStreetMap; as camadas de trânsito (TomTom), clima (OpenWeatherMap) e desmatamento histórico (Global Forest Watch) também são tiles sobrepostos.'],
  ['p', 'Para poluição, chuva e inversão térmica, o próprio sistema gera as camadas. A área visível é dividida em uma grade de, no máximo, cerca de 8 × 8 células, alinhada a passos fixos (0,05°, 0,1°, 0,2°, 0,5° e assim por diante). O valor do centro de cada célula é obtido em uma única chamada em lote à API e pintado como um retângulo colorido. O alinhamento faz com que pequenos movimentos do mapa reaproveitem as mesmas células já guardadas no cache.'],
  ['p', 'A verificação de mananciais usa algoritmos clássicos de geometria computacional: o teste de **ponto em polígono** por lançamento de raio, que conta quantas vezes uma semirreta a partir do ponto cruza a borda da área; a **distância do ponto ao segmento** mais próximo da borda, para o caso “perto”; o **recorte de polígonos** de Sutherland e Hodgman (1974), que limita cada área à região de interesse antes de consultá-la; e a **fórmula de haversine** (SINNOTT, 1984), que calcula a distância entre duas coordenadas sobre a esfera terrestre e é usada para escolher quais aparelhos recebem cada alerta.'],
  ['h2', '3.11 Fontes de dados ambientais'],
  ['p', 'A Tabela 1 resume as fontes externas consumidas pelo sistema e o serviço responsável por cada uma.'],
  ['table', ['Fonte', 'Dados utilizados', 'Serviço'], [
    ['Open-Meteo Forecast', 'Clima atual, chuva prevista por hora, perfil vertical de temperatura', 'weather, risk'],
    ['Open-Meteo Air Quality', 'IQA europeu, PM2,5, PM10, CO, NO₂, O₃, índice UV', 'air-quality'],
    ['Open-Meteo Flood (GloFAS)', 'Vazão diária dos rios (30 dias passados e 7 de previsão)', 'risk'],
    ['Open-Meteo Geocoding', 'Nome de cidade → coordenadas', 'geocoding'],
    ['OpenStreetMap (Overpass API)', 'Estações e pontos de transporte; contornos de represas, lagos e áreas protegidas', 'geodata'],
    ['Global Forest Watch Data API', 'Alertas integrados de desmatamento (GLAD-L, GLAD-S2, RADD) dos últimos 30 dias', 'geodata'],
    ['Global Forest Watch (tiles)', 'Perda de cobertura arbórea histórica (UMD/Hansen)', 'cliente'],
    ['TomTom Traffic', 'Fluxo em tempo real, incidentes, tiles de trânsito', 'traffic'],
    ['OpenWeatherMap', 'Camadas globais de temperatura, chuva, vento, nuvens e pressão', 'cliente'],
    ['Firebase Cloud Messaging', 'Entrega das notificações push aos aparelhos Android', 'push'],
  ], [3000, 4300, 1771], 'Tabela 1 – Fontes de dados e serviços externos'],
  ['p', 'O índice de qualidade do ar usado é o **IQA europeu** (*European Air Quality Index*), calculado a partir das concentrações de PM2,5, PM10, NO₂, O₃ e SO₂ e dividido em seis faixas, de “boa” a “extremamente ruim” (EUROPEAN ENVIRONMENT AGENCY, 2026). A **inversão térmica** ocorre quando a temperatura aumenta com a altitude perto do solo, ao contrário do normal (queda média de cerca de 6,5 °C por quilômetro); o ar frio e mais denso fica preso junto à superfície e os poluentes não se dispersam, o que é agravado quando o vento é fraco. Os **alertas integrados do GFW** combinam três sistemas de detecção por satélite: GLAD-L, baseado em imagens Landsat (HANSEN et al., 2016), GLAD-S2, baseado no Sentinel-2, e RADD, baseado no radar do Sentinel-1, que enxerga através das nuvens (REICHE et al., 2021).'],

  // =====================================================================
  ['h1', '4 PLANO DE DESENVOLVIMENTO DA APLICAÇÃO'],
  ['p', 'Este capítulo descreve como o desenvolvimento foi planejado: escopo, requisitos, decisões de arquitetura, ferramentas utilizadas, etapas de trabalho, estratégia de testes e riscos identificados.'],
  ['h2', '4.1 Escopo'],
  ['p', 'O Respira Urbana é uma aplicação de **consulta, monitoramento e alerta**, sem login e sem registro de ocorrências pelos usuários. Todos os dados exibidos vêm de fontes públicas ou de cálculos feitos pelo próprio sistema. O único dado guardado sobre o usuário é o cadastro do aparelho para notificações (o *token*, o nível e, se ele escolher “perto de mim”, a posição arredondada para cerca de 1 km). Os níveis de risco são estimativas de apoio baseadas em modelos de previsão e **não substituem** os alertas oficiais da Defesa Civil, do INMET e do CEMADEN, o que é informado na própria interface.'],
  ['p', 'Sobre invasões de áreas de mananciais, deixamos claro o limite do sistema: ele **não confirma invasões**. O que ele faz é cruzar o contorno de represas e áreas protegidas, obtido do OpenStreetMap, com os alertas de desmatamento por satélite do Global Forest Watch, e avisar quando há sinais de supressão de vegetação dentro delas. Isso é um indício, que precisa de conferência em campo pelos órgãos competentes.'],
  ['h2', '4.2 Requisitos funcionais'],
  ['table', ['Código', 'Requisito'], [
    ['RF01', 'Localizar o usuário pelo GPS do aparelho e carregar automaticamente os dados do local.'],
    ['RF02', 'Buscar cidades pelo nome, com lista de sugestões.'],
    ['RF03', 'Exibir o resumo do local: clima, qualidade do ar com poluentes, índice UV, riscos, trânsito, mananciais e desmatamento.'],
    ['RF04', 'Exibir camadas de clima (temperatura, chuva, vento, nuvens, pressão), uma por vez.'],
    ['RF05', 'Exibir os temas de monitoramento, vários ao mesmo tempo: poluição, trânsito, transporte público, alagamento, inversão térmica, mananciais e desmatamento.'],
    ['RF06', 'Mostrar uma legenda com as cores de todas as camadas ligadas.'],
    ['RF07', 'Ao tocar no mapa, mostrar os valores do ponto para as camadas ligadas, incluindo a estação de transporte mais próxima e se o ponto está em área de manancial.'],
    ['RF08', 'Marcar com pinos os pontos críticos de cada tema e os alertas ativos.'],
    ['RF09', 'Classificar o risco de alagamento em quatro níveis, com os motivos.'],
    ['RF10', 'Classificar a inversão térmica das próximas 24 horas, com horário do pico e aviso de poluentes retidos.'],
    ['RF11', 'Informar se um ponto está dentro, perto (até 500 m) ou fora de uma represa, lago ou área protegida.'],
    ['RF12', 'Mostrar alertas de desmatamento dos últimos 30 dias e detectar desmatamento dentro de áreas de manancial.'],
    ['RF13', 'Monitorar automaticamente cidades configuradas e gerar alertas sem duplicação de ar, alagamento, inversão, trânsito, transporte público, calor, frio, vento, tempestade, desmatamento e desmatamento em manancial.'],
    ['RF14', 'Exibir o feed de alertas, o painel das cidades monitoradas e a lista de incidentes de trânsito da área.'],
    ['RF15', 'Enviar os alertas como notificação push, filtrados pelo nível (todos ou só graves) e pela área (todas as cidades ou até 100 km do usuário); tocar na notificação abre o local no mapa.'],
    ['RF16', 'No app Android, permitir informar e testar o endereço do servidor.'],
  ], [1300, 7771], 'Tabela 2 – Requisitos funcionais'],
  ['h2', '4.3 Requisitos não funcionais'],
  ['table', ['Código', 'Requisito'], [
    ['RNF01', 'App Android 7 ou superior; interface utilizável em telas a partir de 360 px de largura, com controles adequados ao toque.'],
    ['RNF02', 'Tolerância a falhas parciais: a indisponibilidade de um serviço não pode impedir a exibição dos demais dados.'],
    ['RNF03', 'Transparência de estado: o usuário deve ver se cada parte veio ao vivo, do cache ou está indisponível.'],
    ['RNF04', 'Todas as chamadas de rede devem ter tempo limite (timeout).'],
    ['RNF05', 'Chaves de API restritas (TomTom, GFW, conta de serviço do Firebase) nunca podem chegar ao aparelho nem ao repositório.'],
    ['RNF06', 'Uso de cache para respeitar os limites gratuitos das APIs externas.'],
    ['RNF07', 'Privacidade: posição do usuário guardada só se ele escolher “perto de mim”, e arredondada para cerca de 1 km.'],
    ['RNF08', 'Proteção contra abuso: limite de 20 cadastros de aparelho por IP a cada 10 minutos e corpo das requisições limitado a 8 KB.'],
    ['RNF09', 'Em produção, comunicação por HTTPS e apenas as portas 80 e 443 expostas.'],
    ['RNF10', 'Todo o sistema deve subir com um único comando, em desenvolvimento e em produção.'],
    ['RNF11', 'Testes automatizados executáveis sem internet e sem instalação de dependências.'],
  ], [1300, 7771], 'Tabela 3 – Requisitos não funcionais'],
  ['h2', '4.4 Decisões de arquitetura'],
  ['p', 'As principais decisões, e o motivo de cada uma, foram as seguintes:'],
  ['ul', [
    '**Um serviço por responsabilidade.** Cada fonte ou cálculo ficou em um serviço próprio: geocodificação, clima, qualidade do ar, riscos, dados geográficos, trânsito, alertas e notificações. Assim, uma falha ou lentidão da Overpass API, por exemplo, afeta apenas o *geodata-service*.',
    '**Gateway como ponto único de entrada.** O app conhece apenas um endereço. O gateway agrega as respostas, aplica o cache e é o único com CORS liberado.',
    '**Dois estilos de comunicação.** REST síncrono para consultas do usuário e Pub/Sub assíncrono para eventos (alertas e notificações), mostrando na prática as diferenças entre os modelos.',
    '**Promise.allSettled em vez de Promise.all.** Com `Promise.all`, uma única falha rejeitaria a resposta inteira; com `allSettled`, cada parte é avaliada separadamente e o cliente recebe o que estiver disponível.',
    '**Notificações em um serviço separado.** O *push-service* apenas assina o canal `alerts-new`. Se o Firebase estiver fora do ar ou não configurado, os alertas continuam sendo gerados e exibidos no app.',
    '**App híbrido em vez de nativo.** O Capacitor reaproveita a interface web; a camada específica do Android (`mobile.js`) só acrescenta a configuração do servidor, a permissão de localização e as notificações, sem alterar o cliente web.',
    '**Cliente FCM próprio, sem a biblioteca firebase-admin.** A autenticação JWT e o envio foram implementados com o módulo `crypto` do Node.js, mantendo o serviço leve e testável sem rede.',
    '**Funções puras separadas da rede.** As regras de classificação (alagamento, inversão, alertas, geometria, destinatários das notificações) ficam em arquivos sem acesso à rede, o que permite testá-las isoladamente.',
  ]],
  ['h2', '4.5 Ferramentas e tecnologias'],
  ['table', ['Ferramenta', 'Uso no projeto'], [
    ['JavaScript (ES Modules)', 'Linguagem única no app e no servidor'],
    ['Node.js 18 (containers) / 20+ (app) / 22 (testes)', 'Execução dos serviços, scripts do app e testes'],
    ['Express 4', 'Rotas HTTP de cada microsserviço'],
    ['ioredis 5', 'Cliente Redis: cache, Pub/Sub, listas e deduplicação'],
    ['Redis 7 (Alpine, com AOF)', 'Cache, intermediário de mensagens e dados persistentes leves'],
    ['Docker e Docker Compose', 'Containers e orquestração (desenvolvimento e produção)'],
    ['Caddy 2', 'Proxy reverso e HTTPS automático em produção'],
    ['Nginx (Alpine)', 'Servidor estático do cliente em desenvolvimento'],
    ['HTML5, CSS3 e JavaScript', 'Interface responsiva'],
    ['Leaflet 1.9.4', 'Mapa interativo com suporte a toque'],
    ['Capacitor 7', 'Empacotamento do app Android e plugins nativos'],
    ['Android Studio e Android SDK', 'Compilação, emulador e instalação do APK'],
    ['Firebase Cloud Messaging', 'Entrega das notificações push'],
    ['node:test', 'Executor de testes nativo do Node.js'],
    ['Git e GitHub', 'Controle de versão e colaboração do grupo'],
    ['Visual Studio Code', 'Editor de código'],
  ], [3800, 5271], 'Tabela 4 – Ferramentas utilizadas'],
  ['h2', '4.6 Etapas de desenvolvimento'],
  ['p', 'O trabalho foi dividido em etapas incrementais. Cada etapa terminava com o sistema funcionando, o que permitiu demonstrar progresso ao professor orientador e corrigir o rumo cedo.'],
  ['table', ['Etapa', 'Atividades', 'Entregável'], [
    ['1. Concepção', 'Escolha do tema ambiental, pesquisa de APIs abertas, definição do escopo e submissão da proposta.', 'Proposta aprovada'],
    ['2. Arquitetura', 'Divisão em serviços, definição das rotas REST, dos canais Pub/Sub e do docker-compose.', 'Diagrama de arquitetura'],
    ['3. Núcleo distribuído', 'Gateway, geocodificação, clima e qualidade do ar; cache no Redis; publicação de alertas.', 'Busca de cidade com clima e ar'],
    ['4. Interface', 'Interface responsiva, mapa Leaflet, geolocalização, indicadores de estado.', 'Interface utilizável no celular'],
    ['5. Riscos', 'Serviço de riscos: alagamento (chuva + vazão) e inversão térmica; grades no mapa.', 'Camadas de alagamento e inversão'],
    ['6. Mobilidade e território', 'Trânsito (TomTom) com proteção da chave; transporte público e mananciais (OSM); desmatamento histórico.', 'Todos os temas no mapa'],
    ['7. Alertas', 'Monitoramento ativo, deduplicação, feed de alertas e painel das cidades; alertas de clima e de transporte público.', 'Alertas automáticos'],
    ['8. Mananciais e desmatamento', 'Ponto dentro/perto/fora de manancial; alertas do GFW; desmatamento dentro de mananciais.', 'Indícios de invasão'],
    ['9. App Android e push', 'Empacotamento com Capacitor, tela de servidor, permissões; push-service e Firebase.', 'APK com notificações'],
    ['10. Produção', 'Compose de produção, Caddy com HTTPS, scripts de instalação e atualização da VPS.', 'Servidor na nuvem'],
    ['11. Qualidade', 'Testes automatizados, script de verificação das APIs reais, tratamento de erros.', '68 testes aprovados'],
    ['12. Documentação', 'Redação deste documento, prints, ficha APS e preparação da apresentação.', 'Trabalho final'],
  ], [2300, 4771, 2000], 'Tabela 5 – Etapas de desenvolvimento'],
  ['h2', '4.7 Configuração e execução'],
  ['p', 'As chaves de acesso e parâmetros ficam no arquivo `.env`, que não é enviado ao repositório (existe um modelo `.env.example`). As variáveis principais são `OPENWEATHER_API_KEY` (camadas de clima), `TOMTOM_API_KEY` (trânsito), `GFW_API_KEY` e `GFW_ORIGIN` (alertas de desmatamento), `FCM_SERVICE_ACCOUNT_B64` (conta de serviço do Firebase, em Base64), `MONITOR_LOCATIONS` (cidades vigiadas, no formato `Nome:lat:lon;...`; vazia usa seis capitais brasileiras), `MONITOR_INTERVAL_SECONDS` (padrão de 900 s) e os limites dos alertas (`AQI_ALERT_THRESHOLD`, `MANANCIAL_ALERT_MIN` e `FOREST_ALERT_MIN`). Cada chave ausente desativa apenas a parte que depende dela.'],
  ['p', '**Desenvolvimento.** Com o Docker instalado, o servidor sobe com `docker-compose up --build`; o cliente web fica em `http://localhost:8080` e o gateway em `http://localhost:3000`. Os serviços rodam sob o script `dev-runner.mjs`, que reinicia cada serviço quando o código é salvo.'],
  ['p', '**App Android.** Na pasta `mobile/`, os comandos `npm install`, `npm run setup` e `npm run sync` geram o projeto Android a partir do cliente web; `npm run open` abre o Android Studio e `npm run apk` gera o arquivo de instalação. Na primeira abertura, o app pede o endereço do servidor (o IP do computador na mesma rede Wi-Fi ou o domínio de produção) e oferece um botão para testar a conexão. As notificações exigem o arquivo `google-services.json` do projeto Firebase no app e a conta de serviço no servidor.'],
  ['p', '**Produção.** Em uma VPS Linux, o script `deploy/bootstrap.sh` instala o Docker e configura o *firewall*; depois, `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build` sobe todo o sistema, e o Caddy obtém o certificado HTTPS para o domínio configurado. O script `deploy/update.sh` atualiza o servidor para a versão mais nova do repositório.'],
  ['h2', '4.8 Estratégia de testes'],
  ['p', 'Foram planejados quatro níveis de teste, todos executados com `npm test`, sem acesso à internet e sem instalar dependências (o Redis, o Express, as APIs externas, o Firebase e o Capacitor são substituídos por simulações):'],
  ['ul', [
    '**Testes unitários** das funções puras: limiares de chuva e de clima, mediana da vazão, classificação de alagamento e de inversão, alinhamento da grade, geometria dos mananciais, agregação dos alertas do GFW, escolha dos destinatários das notificações e assinatura JWT.',
    '**Testes de ponta a ponta do backend**: todos os serviços são iniciados juntos, com Redis em memória e APIs externas simuladas, verificando o agregado `/environment`, a tolerância a falha parcial, o cache, a deduplicação, a proteção das chaves, o monitoramento ativo e o caminho completo de um alerta até o envio da notificação.',
    '**Testes do cliente e do app**: a lógica da interface é executada com DOM e Leaflet simulados; a camada do Android é testada quanto ao endereço do servidor, às permissões do manifesto e ao fluxo de ativação das notificações.',
    '**Teste do ambiente de desenvolvimento**: o `dev-runner` é verificado reiniciando um serviço após mudança de arquivo e sobrevivendo a erro de sintaxe.',
  ]],
  ['p', 'Como os testes usam respostas simuladas, foi criado também o script `scripts/check-apis.mjs`, que consulta de verdade cada API externa e o gateway local e indica, para cada uma, se respondeu no formato esperado. A compilação do APK é feita no Android Studio de cada integrante.'],
  ['h2', '4.9 Riscos do projeto e mitigação'],
  ['table', ['Risco', 'Mitigação adotada'], [
    ['Limites de uso das APIs gratuitas', 'Cache no Redis com TTL; grade alinhada e chamadas em lote; deduplicação de alertas.'],
    ['Instabilidade de serviços externos', 'Timeout em todas as chamadas; Promise.allSettled; uso do último valor em cache; servidor Overpass alternativo.'],
    ['Exposição de chaves de acesso', 'Arquivos .env e chaves do Firebase fora do Git; tiles da TomTom passam pelo servidor; mensagens de erro mascaram a chave.'],
    ['Falsos positivos de desmatamento', 'Alertas de baixa confiança descartados; alerta só a partir de um número mínimo de confirmados; texto sempre fala em “indício”.'],
    ['Excesso de notificações', 'Deduplicação por 3 horas; filtro de nível e de área escolhido pelo usuário; aparelhos com token inválido removidos.'],
    ['Abuso da API pública', 'Limite de cadastros por IP, limite de tamanho do corpo e limite de 10 mil aparelhos.'],
    ['Interpretação equivocada dos riscos', 'Avisos na interface de que são estimativas e não substituem alertas oficiais.'],
  ], [3200, 5871], 'Tabela 6 – Riscos e mitigação'],

  // =====================================================================
  ['h1', '5 PROJETO DO PROGRAMA'],
  ['h2', '5.1 Visão geral da arquitetura'],
  ['p', 'Em desenvolvimento, o sistema é composto por onze containers: o cliente web (servido pelo Nginx), o Redis, o *api-gateway* e oito microsserviços. A Figura 1 mostra os componentes e as comunicações entre eles. As setas contínuas representam chamadas HTTP/REST síncronas e as tracejadas representam as mensagens assíncronas trocadas pelo Redis. Em produção, o Nginx dá lugar ao Caddy, que serve o cliente e encaminha as chamadas ao gateway por HTTPS.'],
  ['fig', 'img/arq.png', 'Figura 1 – Arquitetura do Respira Urbana', 16],
  ['h2', '5.2 Módulos'],
  ['table', ['Módulo (porta)', 'Responsabilidade', 'Principais rotas'], [
    ['client e mobile', 'Interface web e app Android (Capacitor): mapa, temas, resumo do local, alertas, configuração do servidor e das notificações.', '—'],
    ['api-gateway (3000)', 'Ponto de entrada único; agrega serviços; cache; proxy de tiles; limite de cadastros.', '/api/environment, /api/point, /api/grid/*, /api/push/*'],
    ['geocoding-service (3001)', 'Converte nome de cidade em coordenadas.', '/geocode'],
    ['weather-service (3002)', 'Clima atual e grade de chuva prevista (24 h).', '/weather, /rain-grid'],
    ['air-quality-service (3003)', 'IQA, poluentes e UV; grade de poluição; publica alertas.', '/air-quality, /air-grid'],
    ['alert-service (3004)', 'Assina o canal de ar; monitora cidades; guarda o feed; publica alertas novos.', '/alerts, /monitor'],
    ['risk-service (3005)', 'Risco de alagamento e inversão térmica; grade de inversão.', '/flood, /inversion, /inversion-grid'],
    ['geodata-service (3006)', 'Transporte público, mananciais e desmatamento (Overpass e GFW), com cache.', '/transit, /manancial, /manancial/watch, /forest/alerts'],
    ['traffic-service (3008)', 'Trânsito TomTom: tiles, incidentes e fluxo; guarda a chave.', '/tiles/*, /incidents, /flow'],
    ['push-service (3009)', 'Cadastro de aparelhos e envio das notificações pelo FCM.', '/register, /unregister, /status'],
    ['redis (6379)', 'Cache, Pub/Sub, alertas, situação das cidades e aparelhos.', '—'],
  ], [2500, 3971, 2600], 'Tabela 7 – Módulos do sistema'],
  ['p', 'Todos os serviços expõem a rota `/health`, usada pelo Docker Compose para verificar se o container está saudável. Cada serviço tem seu próprio `package.json`, com apenas as dependências de que precisa: nenhum deles depende de bibliotecas além do Express, do ioredis e do cors.'],
  ['h2', '5.3 Fluxo de uma consulta'],
  ['p', 'A Figura 2 mostra o que acontece quando o usuário abre um local no celular. O app faz uma única chamada ao gateway, que consulta o cache e dispara em paralelo as chamadas aos serviços de clima, qualidade do ar, riscos e trânsito. Se o índice de qualidade do ar ultrapassar o limite, o *air-quality-service* publica um evento no Redis e segue seu fluxo normal, sem esperar o consumidor. O gateway monta a resposta com o que estiver disponível, grava no cache e devolve ao app o dado e o estado de cada parte. Em seguida, o app pede separadamente a situação de mananciais e desmatamento do local, que depende de consultas mais lentas ao Overpass e ao GFW e por isso não atrasa o restante da tela.'],
  ['fig', 'img/seq.png', 'Figura 2 – Sequência de uma consulta de local (/api/environment)', 16],
  ['h2', '5.4 Fluxo de um alerta até o celular'],
  ['p', 'A Figura 3 mostra o caminho de um alerta. A cada 15 minutos, o *alert-service* consulta oito fontes para cada cidade monitorada (ar, alagamento, inversão, trânsito, clima, transporte público, desmatamento e mananciais), gera os alertas, descarta os repetidos e grava os novos no Redis, publicando cada um no canal `alerts-new`. O *push-service* recebe a mensagem, seleciona os aparelhos cujo nível, tipo de alerta e distância combinam com o alerta e envia a notificação pelo FCM, em lotes de cinco envios paralelos. Aparelhos cujo *token* foi invalidado são removidos automaticamente.'],
  ['fig', 'img/push.png', 'Figura 3 – Sequência de um alerta até a notificação no celular', 15],
  ['h2', '5.5 Tolerância a falhas'],
  ['p', 'Cada parte da resposta recebe um de três estados: `live` (veio do serviço agora), `cache` (o serviço falhou, mas havia um valor recente no Redis) ou `unavailable` (sem dado). O app mostra esse estado em uma faixa de indicadores coloridos (Localização, Clima, Qualidade do ar, Riscos, Trânsito e Alertas). Só quando nem o clima nem a qualidade do ar podem ser obtidos, nem ao vivo nem do cache, o gateway responde com erro HTTP 502.'],
  ['p', 'Além disso, todas as chamadas de rede usam `AbortController` para impor um tempo limite (5 s por padrão no gateway e até 60 s na vigilância de mananciais); o *geodata-service* tenta um segundo servidor Overpass quando o primeiro falha e, na vigilância de mananciais, uma área com problema não derruba as outras; os serviços que usam Redis continuam respondendo, apenas sem cache, se ele estiver fora do ar; e a ausência de uma chave (TomTom, GFW ou Firebase) desativa apenas o recurso correspondente, que o app informa ao usuário.'],
  ['h2', '5.6 Cache e chaves no Redis'],
  ['table', ['Chave no Redis', 'Conteúdo', 'Validade'], [
    ['env:<lat>,<lon>', 'Resposta agregada de um local (2 casas decimais)', '300 s'],
    ['point:<lat>,<lon>:<partes>', 'Toque no mapa (0,1° ≈ 11 km)', '300 s'],
    ['grid:<tema>:<limites>,<passo>', 'Grades de poluição, chuva e inversão', '1.800 s'],
    ['geo:transit / water / mancpoint', 'Consultas à Overpass', '1.800 s'],
    ['geo:forest / mancwatch', 'Alertas do GFW e vigilância de mananciais', '3 h'],
    ['traffic:tile / inc / flow', 'Tiles, incidentes e fluxo da TomTom', '120 s'],
    ['alerts:recent', 'Lista dos 100 alertas mais recentes', 'persistente'],
    ['alerts:air / alerts:mon', 'Chaves de deduplicação de alertas', '30 min / 3 h'],
    ['monitor:status', 'Situação das cidades monitoradas', 'a cada ciclo'],
    ['push:devices', 'Aparelhos cadastrados e suas preferências', 'persistente (90 dias sem uso)'],
  ], [3300, 3971, 1800], 'Tabela 8 – Uso do Redis'],
  ['h2', '5.7 Regras de classificação e alertas'],
  ['p', '**Alagamento.** Os limiares foram inspirados nos critérios de aviso de chuva intensa do INMET: nível “atenção” a partir de 30 mm em 24 h ou 20 mm/h; “alto” a partir de 50 mm ou 30 mm/h; “muito alto” a partir de 100 mm ou 60 mm/h. A vazão do rio mais próximo é comparada com a mediana dos últimos 30 dias: se a previsão chegar ao dobro, o nível mínimo passa a ser “atenção”; se chegar ao triplo e já houver chuva relevante, o nível sobe mais um grau.'],
  ['p', '**Inversão térmica.** A intensidade é a maior diferença de temperatura “de cima menos de baixo” entre 2 m e 180 m de altura e entre níveis de pressão consecutivos acima da superfície (1000 a 850 hPa). Classifica-se como fraca (0,5 a 1,5 °C), moderada (1,5 a 3 °C) ou forte (acima de 3 °C). Há aviso de poluentes retidos quando a inversão é moderada ou forte e o vento está abaixo de 10 km/h.'],
  ['p', '**Mananciais e desmatamento.** Um ponto está “dentro” se cair no contorno de uma represa, lago ou área protegida do OpenStreetMap, e “perto” se estiver a até 500 m da borda. Para a vigilância, cada área num raio de 15 km é recortada na janela de busca (represas usam o espelho d’água com cerca de 1 km de margem, onde o desmatamento afeta o manancial) e enviada ao GFW. Alertas de confiança baixa, mais sujeitos a nuvens e sombras, são descartados.'],
  ['p', 'A Tabela 9 resume quando cada tipo de alerta é gerado. Situações apenas de “atenção” não geram alerta, para que o feed e as notificações não virem ruído.'],
  ['table', ['Tipo', 'Quando alerta (nível alto entre parênteses)'], [
    ['Qualidade do ar', 'IQA europeu ≥ 80 (≥ 100)'],
    ['Alagamento', 'Risco alto (muito alto)'],
    ['Inversão térmica', 'Moderada com vento fraco (forte)'],
    ['Trânsito', '≥ 3 incidentes graves ou ≥ 2 vias interditadas'],
    ['Transporte público', 'Estação ou terminal a até 400 m de via interditada, alagamento ou incidente grave (interdição ou ≥ 3 estações)'],
    ['Calor / frio', 'Sensação ≥ 38 °C (≥ 42 °C) / temperatura ≤ 3 °C (≤ 0 °C)'],
    ['Vento / tempestade', 'Rajadas ≥ 60 km/h (≥ 90 km/h) / tempestade com raios (com granizo)'],
    ['Desmatamento', '≥ 50 alertas confirmados em 10 km em 30 dias (≥ 200)'],
    ['Desmatamento em manancial', '≥ 5 alertas confirmados dentro de uma área de manancial (≥ 30)'],
  ], [2600, 6471], 'Tabela 9 – Regras dos alertas automáticos'],
  ['h2', '5.8 Estrutura de diretórios'],
  ['code', `respira-urbana-distributed/
├── docker-compose.yml        orquestração de desenvolvimento (11 containers)
├── .env / .env.example       chaves e configuração (o .env não vai ao Git)
├── client/index.html         interface (Leaflet), usada na web e no app
├── mobile/                   app Android (Capacitor)
│   ├── src/mobile.js         servidor, permissões e notificações
│   ├── scripts/              build-web, patch-android, apk
│   └── android/              projeto Android gerado
├── deploy/                   produção: compose, Caddyfile, bootstrap, update
├── scripts/                  check-apis, dev-runner, gfw-key, fcm-env
├── tests/                    68 testes automatizados (npm test)
└── services/
    ├── api-gateway/          :3000  entrada, cache, proxy de tiles
    ├── geocoding-service/    :3001  cidade → coordenadas
    ├── weather-service/      :3002  clima e grade de chuva
    ├── air-quality-service/  :3003  IQA, grade de poluição, publica alertas
    ├── alert-service/        :3004  feed de alertas e monitoramento
    ├── risk-service/         :3005  alagamento e inversão térmica
    ├── geodata-service/      :3006  transporte, mananciais, desmatamento
    ├── traffic-service/      :3008  trânsito TomTom
    └── push-service/         :3009  notificações (FCM)`],
  ['p', 'Dentro de cada serviço, o arquivo `src/index.js` contém o servidor Express e as rotas, enquanto a lógica de domínio fica em arquivos separados (`flood.js`, `inversion.js`, `alerts.js`, `areas.js`, `forest.js`, `targeting.js`, `fcm.js`, `tomtom.js`, `overpass.js`, `grid.js`).'],

  ['h1', '6 RELATÓRIO COM AS LINHAS DE CÓDIGO DO PROGRAMA'],
  ['p', 'Este capítulo apresenta os trechos mais representativos do código, comentados. O código completo está no repositório do grupo (https://github.com/OttavioBasques/APS).'],
  ['h2', '6.1 Gateway: agregação tolerante a falhas'],
  ['p', 'A rota `/api/environment` dispara cinco chamadas em paralelo. Cada resultado é avaliado de forma independente pela função `pick`, que usa o valor ao vivo ou, em caso de falha, o último valor guardado no cache.'],
  ['code', `router.get('/environment', async (req, res) => {
  const p = parseLatLon(req.query);
  if (!p) return res.status(400).json({ error: 'parametros "lat" e "lon" ...' });
  const key = envKey(p.lat, p.lon);
  const cached = await getCached(key);

  // as cinco chamadas saem ao mesmo tempo; uma falha nao derruba as outras
  const [weatherResult, airResult, floodResult, inversionResult, trafficResult] =
    await Promise.allSettled([
      POINT_PARTS.weather(p),
      callService(AIR_QUALITY_URL, \`/air-quality?lat=\${p.lat}&lon=\${p.lon}&place=...\`),
      POINT_PARTS.flood(p), POINT_PARTS.inversion(p), POINT_PARTS.traffic(p)
    ]);

  // valor ao vivo, ou o do cache, ou nenhum - e o estado correspondente
  const pick = (result, fallback, name) => {
    if (result.status === 'fulfilled') return { value: result.value, state: 'live' };
    console.error(\`[api-gateway] \${name} falhou:\`, result.reason.message);
    return { value: fallback ?? null, state: fallback ? 'cache' : 'unavailable' };
  };
  const weather = pick(weatherResult, cached?.weather, 'weather-service');
  const air = pick(airResult, cached?.airQuality, 'air-quality-service');
  // ... (flood, inversion e traffic seguem o mesmo padrao)

  if (!weather.value && !air.value)
    return res.status(502).json({ error: 'nenhum servico respondeu ...', status });

  await setCached(key, { weather: weather.value, airQuality: air.value, risks, traffic: traffic.value });
  res.json({ place, weather: weather.value, airQuality: air.value, risks,
             traffic: traffic.value, status, servedAt: Date.now() });
});`, 'Código 1 – services/api-gateway/src/routes.js (trecho)'],
  ['h2', '6.2 Cliente HTTP com tempo limite'],
  ['p', 'Toda chamada entre serviços passa por `callService`, que cancela a requisição se ela demorar mais que o limite. Sem isso, um serviço travado manteria a requisição do usuário presa indefinidamente.'],
  ['code', `const DEFAULT_TIMEOUT_MS = 5000;

function fetchWithTimeout(url, init = {}, ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);   // cancela apos ms
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// cada chamada e independente: timeout proprio, sem estado compartilhado
export async function callService(baseUrl, path) {
  const res = await fetchWithTimeout(\`\${baseUrl}\${path}\`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(\`\${baseUrl}\${path} respondeu \${res.status}: \${body}\`);
  }
  return res.json();
}`, 'Código 2 – services/api-gateway/src/serviceClients.js (trecho)'],
  ['h2', '6.3 Cache distribuído no Redis'],
  ['code', `// cache compartilhado entre requisicoes e entre instancias do gateway
export const redis = new Redis(REDIS_URL, { retryStrategy: () => 2000 });

export function envKey(lat, lon) {          // 2 casas decimais (~1 km)
  return \`env:\${Number(lat).toFixed(2)},\${Number(lon).toFixed(2)}\`;
}
export async function getCached(key) {
  try { const raw = await redis.get(key); return raw ? JSON.parse(raw) : null; }
  catch (err) { return null; }              // Redis fora do ar: segue sem cache
}
export async function setCached(key, value, ttlSeconds = TTL) {
  try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); }
  catch (err) { console.error('[api-gateway] falha ao gravar cache:', err.message); }
}`, 'Código 3 – services/api-gateway/src/cache.js (trecho)'],
  ['h2', '6.4 Produtor de eventos (Pub/Sub)'],
  ['p', 'O *air-quality-service* publica o alerta e responde ao gateway imediatamente, sem aguardar o consumidor. O parâmetro `quiet=1` evita que simples toques no mapa gerem alertas.'],
  ['code', `const publisher = new Redis(REDIS_URL, { retryStrategy: () => 2000, lazyConnect: true });

app.get('/air-quality', async (req, res) => {
  const { lat, lon, place, quiet } = req.query;
  // ... consulta a Open-Meteo Air Quality com timeout de 5 s ...
  const aqi = data.current?.european_aqi;
  if (quiet !== '1' && typeof aqi === 'number' && aqi >= ALERT_THRESHOLD) {
    // "dispara e esquece": a resposta ao gateway nao espera a publicacao
    publishAlert({ lat, lon, place: place || null, aqi }).catch(...);
  }
  res.json({ current: data.current });
});

async function publishAlert(payload) {
  if (publisher.status !== 'ready') return;
  await publisher.publish('air-quality-alerts', JSON.stringify({ ...payload, ts: Date.now() }));
}`, 'Código 4 – services/air-quality-service/src/index.js (trecho)'],
  ['h2', '6.5 Consumidor de eventos, deduplicação e repasse'],
  ['p', 'O *alert-service* usa duas conexões com o Redis, pois uma conexão em modo de assinatura não pode executar outros comandos. A deduplicação usa `SET ... NX EX`: a chave só é criada se ainda não existir, de forma atômica. Cada alerta novo é guardado e, em seguida, publicado no canal `alerts-new`, que o *push-service* assina; uma falha nessa publicação não perde o alerta.'],
  ['code', `const subscriber = new Redis(REDIS_URL, { retryStrategy: () => 2000 });
const store = new Redis(REDIS_URL, { retryStrategy: () => 2000 });

subscriber.subscribe('air-quality-alerts');

subscriber.on('message', async (channel, message) => {
  const data = JSON.parse(message);
  const key = \`alerts:air:\${Number(data.lat).toFixed(2)},\${Number(data.lon).toFixed(2)}\`;
  // NX: so grava se nao existir; EX: expira em 30 min -> 1 alerta por local
  const first = await store.set(key, '1', 'EX', AIR_DEDUP_SECONDS, 'NX');
  if (!first) return;
  await remember(buildAlert(channel, data));
});

async function remember(alert) {
  await store.lpush('alerts:recent', JSON.stringify(alert));
  await store.ltrim('alerts:recent', 0, MAX_ALERTS - 1);   // guarda os 100 ultimos
  // avisa quem quiser reagir a alertas novos (hoje: push-service)
  try { await store.publish('alerts-new', JSON.stringify(alert)); }
  catch (e) { console.error('[alert-service] publish alerts-new:', e.message); }
}`, 'Código 5 – services/alert-service/src/index.js (trecho)'],
  ['h2', '6.6 Monitoramento ativo'],
  ['p', 'A cada ciclo, oito consultas a quatro serviços diferentes saem em paralelo para cada cidade. Os tempos limite são maiores para as consultas ao Overpass e ao GFW, que são mais lentas.'],
  ['code', `export async function checkLocation(loc) {
  const d = 0.15;   // ~16 km em volta do ponto
  const bbox = \`south=\${loc.lat - d}&west=\${loc.lon - d}&north=\${loc.lat + d}&east=\${loc.lon + d}\`;
  const q = \`lat=\${loc.lat}&lon=\${loc.lon}\`;
  const [air, flood, inversion, traffic, watch, forest, weather, transit] =
    (await Promise.allSettled([
      getJson(\`\${AIR_URL}/air-quality?\${q}&quiet=1\`),
      getJson(\`\${RISK_URL}/flood?\${q}\`),
      getJson(\`\${RISK_URL}/inversion?\${q}\`),
      getJson(\`\${TRAFFIC_URL}/incidents?\${bbox}&max=300\`),
      getJson(\`\${GEODATA_URL}/manancial/watch?\${q}&radiusKm=15&days=30\`, 60000),
      getJson(\`\${GEODATA_URL}/forest/alerts?\${q}&radiusKm=10&days=30\`, 45000),
      getJson(\`\${WEATHER_URL}/weather?\${q}\`),
      getJson(\`\${GEODATA_URL}/transit?\${bbox}&scope=stations\`, 45000)
    ])).map((r) => (r.status === 'fulfilled' ? r.value : null));   // falha vira null
  return { air, flood, inversion, traffic, watch, forest, weather, transit };
}

// primeira verificacao 5 s apos subir; depois a cada MONITOR_INTERVAL_SECONDS
setTimeout(() => {
  runMonitor();
  setInterval(runMonitor, MONITOR_INTERVAL_MS);
}, MONITOR_STARTUP_MS);`, 'Código 6 – services/alert-service/src/index.js (trecho)'],
  ['h2', '6.7 Classificação do risco de alagamento'],
  ['code', `export function rainLevel({ next24hMm, maxHourlyMm }) {
  const a = isNum(next24hMm) ? next24hMm : 0;
  const h = isNum(maxHourlyMm) ? maxHourlyMm : 0;
  if (a >= 100 || h >= 60) return 3;   // muito alto
  if (a >= 50 || h >= 30) return 2;    // alto
  if (a >= 30 || h >= 20) return 1;    // atencao
  return 0;                            // baixo
}

export function classifyFlood({ rain, river }) {
  const reasons = [];
  const byRain = rainLevel(rain);
  let score = byRain;
  // ... motivos ligados a chuva ...
  // a vazao so eleva o nivel: compara a previsao com a mediana do proprio rio
  if (river && river.available && isNum(river.ratio) && river.ratio >= 2) {
    reasons.push(\`Vazão do rio prevista em até \${fmt(river.ratio)}× a mediana dos últimos 30 dias\`);
    score = Math.max(score, 1);
    if (byRain >= 1 && river.ratio >= 3) score = Math.min(3, score + 1);
  }
  return { score, level: LEVELS[score], reasons };
}`, 'Código 7 – services/risk-service/src/flood.js (trecho)'],
  ['h2', '6.8 Intensidade da inversão térmica'],
  ['code', `export function hourStrength(h, i) {
  const t2 = h.temperature_2m?.[i];
  const t180 = h.temperature_180m?.[i];
  let best = isNum(t2) && isNum(t180) ? t180 - t2 : null;   // camada de superficie
  const sp = h.surface_pressure?.[i];
  if (isNum(sp)) {
    for (let k = 0; k < PRESSURE_LEVELS.length - 1; k++) {  // 1000 ... 850 hPa
      const pa = PRESSURE_LEVELS[k], pb = PRESSURE_LEVELS[k + 1];
      if (pa > sp - 20) continue;           // nivel abaixo do solo: ignora
      const ta = h[\`temperature_\${pa}hPa\`]?.[i], tb = h[\`temperature_\${pb}hPa\`]?.[i];
      if (isNum(ta) && isNum(tb)) best = best == null ? tb - ta : Math.max(best, tb - ta);
    }
  }
  return best == null ? null : Math.round(best * 10) / 10;
}`, 'Código 8 – services/risk-service/src/inversion.js (trecho)'],
  ['h2', '6.9 Proteção da chave da TomTom'],
  ['p', 'O navegador pede os tiles de trânsito ao gateway, que os pede ao *traffic-service*. Somente este último conhece a chave, e o cache no Redis faz com que vários usuários olhando a mesma região gerem uma única chamada por tile.'],
  ['code', `app.get('/tiles/:kind/:z/:x/:y', async (req, res) => {
  if (!KEY) return res.status(503).json({ error: 'transito desabilitado' });
  // ... valida kind e coordenadas z/x/y ...
  const ck = \`traffic:tile:\${kind}:\${style}:\${z}/\${x}/\${y}\`;
  const hit = await cacheGet(ck);
  if (hit) { res.set('x-cache', 'HIT'); return res.end(Buffer.from(hit, 'base64')); }
  const up = await fetchWithTimeout(tileUrl(kind, style, z, x, y, KEY), 8000);
  const buf = Buffer.from(await up.arrayBuffer());
  await cacheSet(ck, buf.toString('base64'), TILE_TTL);   // imagem guardada em base64
  res.set('x-cache', 'MISS'); res.end(buf);
});

// mensagens de erro nunca exibem a chave (a URL contem "key=...")
const safe = (msg) => String(msg).replace(/key=[^&\\s]+/g, 'key=***');`, 'Código 9 – services/traffic-service/src/index.js (trecho)'],
  ['h2', '6.10 Mananciais: o ponto está dentro da área?'],
  ['p', 'O teste de ponto em polígono lança uma semirreta horizontal a partir do ponto e conta quantas arestas ela cruza: número ímpar significa “dentro”. Se o ponto estiver fora, calcula-se a menor distância até a borda para decidir se está “perto”.'],
  ['code', `export function pointInRing(lat, lon, ring) {       // ring: [[lat, lon], ...]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    // a aresta (j -> i) cruza a horizontal do ponto, a direita dele?
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export function classifyPoint(json, lat, lon, nearKm = 0.5) {
  const areas = [];
  for (const el of json?.elements || []) {             // represas, lagos e areas protegidas
    const rings = elementRings(el);
    if (!rings.length) continue;
    let inside = false, dist = Infinity;
    for (const r of rings) {
      if (pointInRing(lat, lon, r)) inside = true;
      dist = Math.min(dist, distanceToRingKm(lat, lon, r));
    }
    areas.push({ ...describeElement(el), inside, distanceKm: inside ? 0 : dist });
  }
  const status = areas.some((a) => a.inside) ? 'inside'
    : areas.some((a) => a.distanceKm <= nearKm) ? 'near' : 'outside';
  return { status, areas /* ... */ };
}`, 'Código 10 – services/geodata-service/src/areas.js (trecho)'],
  ['h2', '6.11 Notificações: quem recebe cada alerta'],
  ['p', 'A escolha dos destinatários é uma função pura: compara o nível do alerta com o nível mínimo escolhido, filtra pelos tipos e, se o aparelho informou uma posição, calcula a distância pela fórmula de haversine. No cadastro, a posição é arredondada para duas casas decimais (cerca de 1 km), para que o servidor não guarde a localização exata do usuário.'],
  ['code', `export function distanceKm(lat1, lon1, lat2, lon2) {   // formula de haversine
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));   // raio da Terra: 6371 km
}

// aparelho sem posicao recebe os alertas de todas as cidades monitoradas
export function shouldReceive(device, alert) {
  const rank = (l) => LEVELS.indexOf(l);                    // ['media', 'alta']
  if (rank(alert.level) < rank(device.minLevel || 'media')) return false;
  if (Array.isArray(device.kinds) && !device.kinds.includes(alert.kind)) return false;
  if (device.lat != null && device.lon != null) {
    if (distanceKm(device.lat, device.lon, alert.lat, alert.lon) > (device.radiusKm ?? 100))
      return false;
  }
  return true;
}`, 'Código 11 – services/push-service/src/targeting.js (trecho)'],
  ['h2', '6.12 Envio pelo Firebase Cloud Messaging'],
  ['p', 'O *push-service* assina o canal `alerts-new` e, para cada alerta, envia as notificações em lotes de cinco requisições paralelas. A autenticação no Google usa um JWT assinado com a chave privada da conta de serviço, sem bibliotecas externas.'],
  ['code', `export function signJwt(sa, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.clientEmail, scope: SCOPE,
    aud: sa.tokenUri, iat: nowSec, exp: nowSec + 3600 }));          // vale 1 hora
  const sig = crypto.createSign('RSA-SHA256').update(\`\${head}.\${claims}\`)
    .sign(sa.privateKey).toString('base64url');
  return \`\${head}.\${claims}.\${sig}\`;   // trocado por um token OAuth2 no Google
}

subscriber.subscribe('alerts-new');
subscriber.on('message', (channel, message) => dispatch(JSON.parse(message)));

export async function dispatch(alert) {
  const all = await loadDevices();
  const targets = Object.entries(all).filter(([, d]) => shouldReceive(d, alert));
  const dead = []; let sent = 0;
  for (let i = 0; i < targets.length; i += 5) {             // 5 envios em paralelo
    await Promise.all(targets.slice(i, i + 5).map(async ([key, d]) => {
      const r = await fcm.send(buildMessage(d.token, alert));
      if (r.ok) sent++; else if (r.dead) dead.push(key);    // token invalido
    }));
  }
  await removeDead(dead);                                   // limpa aparelhos mortos
  return { sent, removed: dead.length };
}`, 'Código 12 – services/push-service/src/fcm.js e index.js (trechos)'],
  ['h2', '6.13 App Android: servidor e notificações'],
  ['p', 'O arquivo `mobile.js` é carregado antes da interface apenas no app Android. Ele lê o endereço do servidor salvo no aparelho e, quando o usuário liga as notificações, pede a permissão, cria o canal de notificações do Android, registra o aparelho no Firebase e envia o *token* ao servidor.'],
  ['code', `// "192.168.0.10" -> http://192.168.0.10:3000 ; endereco invalido -> null
function normalizeUrl(input) {
  var t = String(input == null ? '' : input).trim();
  if (!t) return null;
  var hasScheme = /^[a-z][a-z0-9+.-]*:\\/\\//i.test(t);
  if (!hasScheme) t = 'http://' + t;
  var u; try { u = new URL(t); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!hasScheme && !u.port) u.port = '3000';          // porta do gateway
  return u.protocol + '//' + u.host + u.pathname.replace(/\\/+$/, '');
}

async function enablePush() {
  var P = plugin();                                      // @capacitor/push-notifications
  var perm = await P.requestPermissions();               // Android 13+ pergunta ao usuario
  if (!perm || perm.receive !== 'granted') return { ok: false, message: 'Permissão negada.' };
  await P.createChannel({ id: 'alerts', name: 'Alertas ambientais', importance: 4 });
  attachListeners(P);  // "registration" -> POST /api/push/register com o token
  await P.register();  // pede o token ao Firebase
  return { ok: true, message: 'Registrando…' };
}`, 'Código 13 – mobile/src/mobile.js (trecho)'],
  ['h2', '6.14 Interface: escolha do servidor e consulta ao gateway'],
  ['p', 'A mesma interface funciona no navegador, no app e no servidor de produção. O endereço do gateway é escolhido nesta ordem: parâmetro na URL, endereço salvo pelo app Android, a própria origem (quando o Caddy serve o site e a API no mesmo domínio) e, por fim, o endereço local de desenvolvimento.'],
  ['code', `const SAME_ORIGIN = (/^https?:$/.test(location.protocol) && location.port === ''
                     && !window.Capacitor) ? location.origin : null;
const GATEWAY_URL = params.get('gateway') || window.RESPIRA_GATEWAY
                    || SAME_ORIGIN || 'http://localhost:3000';

async function loadPlace(lat, lon, label) {
  try {
    const res = await fetch(GATEWAY_URL + '/api/environment?lat=' + lat + '&lon=' + lon
                            + '&place=' + encodeURIComponent(label));
    const body = await res.json();
    if (!res.ok) { renderError(body.error); return; }
    setDot('weather', statusToDot(body.status.weather));   // verde, amarelo ou vermelho
    setDot('air', statusToDot(body.status.airQuality));
    renderPlace(label, body.weather, body.airQuality, body.status, body.risks, body.traffic);
  } catch (err) {
    renderError('Não foi possível carregar os dados agora. Verifique se o servidor está rodando.');
  }
}`, 'Código 14 – client/index.html (trecho)'],

  // =====================================================================
  ['h1', '7 APRESENTAÇÃO DO PROGRAMA EM FUNCIONAMENTO'],
  ['p', 'Esta seção mostra o aplicativo em execução em um aparelho Android. Para a demonstração, o servidor foi iniciado com `docker-compose up --build` em um computador [ou: publicado em uma VPS com HTTPS], e o app foi instalado no celular a partir do APK gerado no Android Studio [ou: executado no emulador do Android Studio]. A mesma interface também foi aberta no navegador para comparação.'],
  ['h2', '7.1 Telas do aplicativo'],
  ['print', 'Figura 4 – Configuração do servidor no app (endereço, botão Testar e Salvar)'],
  ['print', 'Figura 5 – Tela inicial: localização automática e resumo do local (clima, qualidade do ar, UV)'],
  ['print', 'Figura 6 – Busca de cidade com lista de sugestões'],
  ['print', 'Figura 7 – Tema Poluição: grade colorida do IQA europeu, legenda e pinos de pontos críticos'],
  ['print', 'Figura 8 – Temas Alagamento e Inversão térmica ligados ao mesmo tempo'],
  ['print', 'Figura 9 – Tema Trânsito: fluxo em tempo real e lista de incidentes da área'],
  ['print', 'Figura 10 – Tema Transporte público, com a estação mais próxima no pop-up'],
  ['print', 'Figura 11 – Tema Mananciais: ponto dentro de uma área de manancial'],
  ['print', 'Figura 12 – Tema Desmatamento: perda histórica e pinos de alertas dos últimos 30 dias'],
  ['print', 'Figura 13 – Cartões de riscos e de mananciais e desmatamento do local'],
  ['print', 'Figura 14 – Alertas ambientais e painel das cidades monitoradas'],
  ['print', 'Figura 15 – Preferências de notificação (nível e área)'],
  ['print', 'Figura 16 – Notificação push recebida no celular'],
  ['print', 'Figura 17 – Tema escuro'],
  ['h2', '7.2 Demonstração da tolerância a falhas'],
  ['p', 'Para demonstrar o comportamento distribuído, um dos serviços foi interrompido com o sistema em funcionamento, por meio do comando `docker stop respira-weather`. O aplicativo continuou exibindo a qualidade do ar, os riscos e o trânsito; o indicador de Clima mudou de cor, mostrando que o dado veio do cache ou ficou indisponível. Ao reiniciar o serviço (`docker start respira-weather`), o indicador voltou ao estado normal sem que fosse necessário reiniciar o restante do sistema. Da mesma forma, desligar o *push-service* não impede que os alertas apareçam no app: apenas as notificações deixam de ser enviadas.'],
  ['print', 'Figura 18 – Indicadores de estado com o weather-service desligado'],
  ['h2', '7.3 Testes automatizados'],
  ['p', 'A suíte de testes foi executada com `npm test` (Node.js 22). Os 68 testes foram aprovados, sem falhas, em cerca de 16 segundos. A Tabela 10 resume a cobertura.'],
  ['table', ['Arquivo', 'Testes', 'O que verifica'], [
    ['e2e.test.mjs', '21', 'Todos os serviços juntos: health, /environment com falha parcial, /point com cache, grades, transporte, mananciais e desmatamento pelo gateway, deduplicação, CORS, chave da TomTom protegida, monitoramento ativo, cadastro de aparelhos e entrega de notificações por área e nível'],
    ['forest.test.mjs', '11', 'Consulta Overpass por raio, ponto em polígono, montagem de anéis, dentro/perto/fora, recorte de polígonos, consulta e agregação dos alertas do GFW, alertas de manancial'],
    ['mobile.test.mjs', '11', 'Endereço do servidor, teste de conexão, empacotamento do app, permissões do manifesto, ativação das notificações e tratamento de permissão negada'],
    ['units.test.mjs', '7', 'Grade, cidades monitoradas, alertas, TomTom, cadastro de aparelhos, destinatários e assinatura JWT do FCM'],
    ['risk.test.mjs', '6', 'Limiares de chuva, mediana da vazão, alagamento, intensidade e janelas de inversão'],
    ['geodata.test.mjs', '6', 'Consultas Overpass, classificação de paradas, estações e polígonos, servidor alternativo'],
    ['alerts-clima-transporte.test.mjs', '4', 'Alertas de calor, frio, vento, tempestade e transporte público'],
    ['client.test.mjs', '1', 'Temas, legendas, riscos, alertas e monitoramento na interface (DOM simulado)'],
    ['dev-runner.test.mjs', '1', 'Recarga por verificação periódica dos arquivos'],
    ['Total', '68', '68 aprovados, 0 falhas'],
  ], [2700, 900, 5471], 'Tabela 10 – Resultado dos testes automatizados'],
  ['print', 'Figura 19 – Saída do comando npm test'],

  // =====================================================================
  ['h1', '8 CONSIDERAÇÕES FINAIS'],
  ['h2', '8.1 Resultados'],
  ['p', 'O Respira Urbana atende ao tema proposto: é uma aplicação de sistema distribuído para dispositivo móvel, entregue como app Android, que reúne as informações ambientais urbanas pedidas no enunciado (poluição do ar, trânsito e transporte público, alagamentos e inundações, invasões das áreas de mananciais, desmatamento e inversão térmica). Como funções extras, oferece alertas automáticos de onze tipos com notificações *push* configuráveis, painel de cidades monitoradas, camadas de clima, tema escuro, versão web e implantação em servidor na nuvem com HTTPS.'],
  ['h2', '8.2 Dificuldades encontradas'],
  ['ul', [
    '**Limites das APIs gratuitas.** Cada ponto de uma grade conta como uma chamada no limite diário do Open-Meteo, e a TomTom limita a área de consulta. A solução foi alinhar as grades a passos fixos, fazer chamadas em lote e guardar tudo no cache.',
    '**Falhas parciais.** No início o gateway usava `Promise.all`, e a falha do serviço de trânsito (sem chave configurada) derrubava a tela inteira. A troca por `Promise.allSettled` e a exibição do estado de cada parte resolveram o problema.',
    '**Geolocalização no celular.** Os navegadores só liberam o GPS em HTTPS ou em `localhost`, e o servidor local era acessado pelo IP da rede. O empacotamento com o Capacitor resolveu isso no app, com a permissão nativa do Android; no navegador, a solução foi publicar o servidor com HTTPS pelo Caddy.',
    '**Recarga automática no Docker Desktop.** O `node --watch` não detectava as alterações feitas no Windows dentro dos containers, porque o sistema de arquivos do host não gera eventos ali. Foi criado o `dev-runner.mjs`, que verifica os arquivos periodicamente.',
    '**Integração com APIs de terceiros.** A TomTom recusava o parâmetro de idioma usado nos incidentes, e o GFW exige uma chave vinculada a um domínio, enviada no cabeçalho `Origin`. Passamos a registrar no log o motivo exato devolvido por cada API e criamos scripts para gerar e conferir as chaves.',
    '**Desmatamento em mananciais.** As áreas do OpenStreetMap chegam em trechos soltos e podem ser muito grandes. Foi preciso juntar os trechos em polígonos fechados, recortá-los na região de interesse e simplificá-los antes de consultar o GFW.',
    '**Alertas duplicados.** O mesmo IQA alto podia chegar pelo Pub/Sub e pelo monitoramento. Usar a mesma chave de deduplicação nos dois caminhos garantiu um único alerta, e uma única notificação, por local.',
  ]],
  ['h2', '8.3 Melhorias futuras'],
  ['p', 'Como evolução, o grupo identificou: versão iOS do app, aproveitando o mesmo projeto Capacitor; alertas por e-mail ou *webhook*; integração com o sistema DETER do INPE para alertas de desmatamento na Amazônia; exibição das linhas de transporte e de dados de operação em tempo real; histórico de alertas em banco de dados; limite de requisições no Caddy; e várias réplicas do gateway atrás de um balanceador de carga, com o limite de cadastros movido para o Redis.'],
  ['h2', '8.4 Efeito do trabalho na formação'],
  ['p', 'O projeto mostrou na prática que distribuir um sistema muda a forma de programar. Problemas que não existem em um programa local, como tempo limite, falha parcial, cache que pode estar desatualizado, mensagens que chegam a quem não se conhece, chaves que não podem vazar e dispositivos que deixam de existir sem avisar, passaram a fazer parte de cada decisão. Também aprendemos a trabalhar com containers, a publicar um sistema na nuvem com HTTPS, a empacotar um app Android, a integrar um serviço de notificações, a escrever testes que simulam a rede e a ler documentação de APIs de terceiros, competências diretamente aplicáveis ao mercado de trabalho.'],
  ['h2', '8.5 Interdisciplinaridade'],
  ['p', 'O trabalho integrou conhecimentos de várias disciplinas do curso:'],
  ['ul', [
    '**Redes de Computadores:** HTTP sobre TCP/IP, portas, DNS interno do Docker, proxy reverso, TLS e acesso pela rede local.',
    '**Sistemas Operacionais:** processos independentes, isolamento por containers, variáveis de ambiente, E/S não bloqueante e permissões do Android.',
    '**Engenharia de Software:** levantamento de requisitos, modularização, separação entre lógica e infraestrutura, testes automatizados e controle de versão.',
    '**Banco de Dados e Estruturas de Dados:** armazenamento chave-valor, listas, expiração de chaves, operações atômicas e persistência AOF no Redis.',
    '**Segurança da Informação:** proteção de credenciais, assinatura digital RSA em JWT, OAuth 2.0, limite de requisições e minimização de dados pessoais.',
    '**Desenvolvimento para Dispositivos Móveis e IHC:** app híbrido, permissões em tempo de execução, notificações, design responsivo e tema escuro.',
    '**Computação Gráfica e Geometria Computacional:** projeção Web Mercator, tiles, ponto em polígono, recorte de polígonos e distância geodésica.',
    '**Estatística e Matemática:** mediana, limiares de classificação, gradiente vertical de temperatura e trigonometria esférica.',
    '**Ciências Ambientais e Meteorologia:** qualidade do ar, inversão térmica, chuva intensa, vazão de rios, mananciais e sensoriamento remoto do desmatamento.',
  ]],

  // =====================================================================
  ['h1', 'BIBLIOGRAFIA'],
  ['ref', 'BRASIL. Lei nº 12.608, de 10 de abril de 2012. Institui a Política Nacional de Proteção e Defesa Civil – PNPDEC. **Diário Oficial da União**, Brasília, DF, 11 abr. 2012.'],
  ['ref', 'BURNS, B. **Designing distributed systems**: patterns and paradigms for scalable, reliable services. Sebastopol: O’Reilly Media, 2018.'],
  ['ref', 'CADDY. **Automatic HTTPS**. Disponível em: https://caddyserver.com/docs/automatic-https. Acesso em: 4 nov. 2026.'],
  ['ref', 'CAPACITOR. **Capacitor documentation**. Disponível em: https://capacitorjs.com/docs. Acesso em: 4 nov. 2026.'],
  ['ref', 'COULOURIS, G.; DOLLIMORE, J.; KINDBERG, T.; BLAIR, G. **Sistemas distribuídos**: conceitos e projeto. 5. ed. Porto Alegre: Bookman, 2013.'],
  ['ref', 'DOCKER INC. **Docker Compose overview**. Disponível em: https://docs.docker.com/compose/. Acesso em: 4 nov. 2026.'],
  ['ref', 'EUGSTER, P. T.; FELBER, P. A.; GUERRAOUI, R.; KERMARREC, A.-M. The many faces of publish/subscribe. **ACM Computing Surveys**, v. 35, n. 2, p. 114-131, 2003.'],
  ['ref', 'EUROPEAN ENVIRONMENT AGENCY. **European Air Quality Index**. Disponível em: https://airindex.eea.europa.eu/. Acesso em: 4 nov. 2026.'],
  ['ref', 'FIELDING, R. T. **Architectural styles and the design of network-based software architectures**. 2000. Tese (Doutorado em Information and Computer Science) – University of California, Irvine, 2000.'],
  ['ref', 'FIREBASE. **Firebase Cloud Messaging**. Disponível em: https://firebase.google.com/docs/cloud-messaging. Acesso em: 4 nov. 2026.'],
  ['ref', 'GLOBAL FOREST WATCH. **GFW Data API**. Disponível em: https://data-api.globalforestwatch.org/. Acesso em: 4 nov. 2026.'],
  ['ref', 'HANSEN, M. C. et al. High-resolution global maps of 21st-century forest cover change. **Science**, v. 342, n. 6160, p. 850-853, 2013.'],
  ['ref', 'HANSEN, M. C. et al. Humid tropical forest disturbance alerts using Landsat data. **Environmental Research Letters**, v. 11, n. 3, 034008, 2016.'],
  ['ref', 'JONES, M.; BRADLEY, J.; SAKIMURA, N. **RFC 7519**: JSON Web Token (JWT). Internet Engineering Task Force, 2015. Disponível em: https://www.rfc-editor.org/rfc/rfc7519. Acesso em: 4 nov. 2026.'],
  ['ref', 'KLEPPMANN, M. **Designing data-intensive applications**. Sebastopol: O’Reilly Media, 2017.'],
  ['ref', 'LEAFLET. **Leaflet documentation**. Disponível em: https://leafletjs.com/reference.html. Acesso em: 4 nov. 2026.'],
  ['ref', 'MARCOTTE, E. **Responsive web design**. New York: A Book Apart, 2011.'],
  ['ref', 'MDN WEB DOCS. **Geolocation API**. 2026a. Disponível em: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API. Acesso em: 4 nov. 2026.'],
  ['ref', 'MDN WEB DOCS. **Using Fetch**. 2026b. Disponível em: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch. Acesso em: 4 nov. 2026.'],
  ['ref', 'NEWMAN, S. **Building microservices**: designing fine-grained systems. 2. ed. Sebastopol: O’Reilly Media, 2021.'],
  ['ref', 'OPEN-METEO. **Open-Meteo API documentation**. Disponível em: https://open-meteo.com/en/docs. Acesso em: 4 nov. 2026.'],
  ['ref', 'OPENJS FOUNDATION. **Node.js documentation**. Disponível em: https://nodejs.org/docs/latest/api/. Acesso em: 4 nov. 2026.'],
  ['ref', 'OPENJS FOUNDATION. **Express**: fast, unopinionated, minimalist web framework for Node.js. Disponível em: https://expressjs.com/. Acesso em: 4 nov. 2026.'],
  ['ref', 'OPENSTREETMAP WIKI. **Overpass API**. Disponível em: https://wiki.openstreetmap.org/wiki/Overpass_API. Acesso em: 4 nov. 2026.'],
  ['ref', 'REDIS. **Redis Pub/Sub**. Disponível em: https://redis.io/docs/latest/develop/interact/pubsub/. Acesso em: 4 nov. 2026.'],
  ['ref', 'REICHE, J. et al. Forest disturbance alerts for the Congo Basin using Sentinel-1. **Environmental Research Letters**, v. 16, n. 2, 024005, 2021.'],
  ['ref', 'RICHARDSON, C. **Microservices patterns**: with examples in Java. Shelter Island: Manning, 2018.'],
  ['ref', 'SINNOTT, R. W. Virtues of the Haversine. **Sky and Telescope**, v. 68, n. 2, p. 159, 1984.'],
  ['ref', 'SUTHERLAND, I. E.; HODGMAN, G. W. Reentrant polygon clipping. **Communications of the ACM**, v. 17, n. 1, p. 32-42, 1974.'],
  ['ref', 'TANENBAUM, A. S.; VAN STEEN, M. **Sistemas distribuídos**: princípios e paradigmas. 2. ed. São Paulo: Pearson Prentice Hall, 2007.'],
  ['ref', 'TOMTOM. **Traffic API documentation**. Disponível em: https://developer.tomtom.com/traffic-api/documentation. Acesso em: 4 nov. 2026.'],
  ['ref', 'W3C. **Mobile Web Application Best Practices**. W3C Recommendation, 14 dez. 2010. Disponível em: https://www.w3.org/TR/mwabp/. Acesso em: 4 nov. 2026.'],
  ['ref', 'WORLD HEALTH ORGANIZATION. **WHO global air quality guidelines**: particulate matter (PM2.5 and PM10), ozone, nitrogen dioxide, sulfur dioxide and carbon monoxide. Geneva: WHO, 2021.'],
];

module.exports = { capa, secoes };
