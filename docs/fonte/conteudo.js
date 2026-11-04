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
  ['p', 'O objetivo deste trabalho é desenvolver o **Respira Urbana**, uma aplicação baseada em sistemas distribuídos, acessada por dispositivo móvel, que reúne em um único mapa interativo as principais informações ambientais de uma cidade: poluição do ar, trânsito e transporte público, risco de alagamento e inundação, inversão térmica, áreas de mananciais e desmatamento, além das condições do clima. A aplicação também vigia automaticamente um conjunto de cidades e gera alertas quando alguma delas apresenta uma situação ambiental relevante.'],
  ['p', 'Do ponto de vista técnico, o objetivo é aplicar na prática os conceitos da disciplina de Desenvolvimento de Sistemas Distribuídos. O sistema foi dividido em oito processos independentes (microsserviços), cada um em seu próprio container, que se comunicam por dois estilos diferentes: chamadas síncronas HTTP/REST e mensagens assíncronas no modelo publicação/assinatura (*publish/subscribe*). Somam-se a isso cache distribuído, tolerância a falhas parciais, isolamento de credenciais e consumo de serviços externos de dados abertos.'],
  ['p', 'São objetivos específicos:'],
  ['ul', [
    'permitir que o usuário localize a si mesmo pelo GPS do aparelho ou busque qualquer cidade pelo nome;',
    'exibir, sobre o mapa, camadas temáticas que podem ser ligadas ao mesmo tempo, cada uma com sua legenda;',
    'calcular indicadores próprios de risco de alagamento (chuva prevista combinada com a vazão dos rios) e de inversão térmica (perfil vertical de temperatura previsto);',
    'monitorar periodicamente cidades configuradas e publicar alertas sem intervenção do usuário;',
    'manter o aplicativo funcionando mesmo quando um dos serviços internos ou externos estiver indisponível, informando ao usuário o estado de cada parte.',
  ]],
  ['h2', '1.2 Motivação'],
  ['p', 'Os problemas ambientais urbanos raramente aparecem isolados. Um dia de inversão térmica com vento fraco retém poluentes perto do solo; uma chuva forte provoca alagamentos que, por sua vez, travam o trânsito e o transporte público. Apesar disso, as informações sobre cada tema costumam estar espalhadas em portais diferentes, com linguagens e formatos diferentes, o que dificulta para o cidadão comum perceber a situação do lugar onde está.'],
  ['p', 'A Organização Mundial da Saúde associa a poluição do ar a milhões de mortes prematuras por ano e, em 2021, tornou mais rígidos os seus valores de referência para material particulado e outros poluentes (WORLD HEALTH ORGANIZATION, 2021). No Brasil, a Política Nacional de Proteção e Defesa Civil reconhece a importância de sistemas de informação e monitoramento para a prevenção de desastres, incluindo os hidrológicos (BRASIL, 2012). Uma ferramenta que reúna dados abertos e os apresente de forma simples no celular contribui, em pequena escala, para essa cultura de prevenção.'],
  ['p', 'Escolhemos uma arquitetura distribuída porque o próprio problema é distribuído: os dados vêm de fontes independentes (Open-Meteo, OpenStreetMap, TomTom, Global Forest Watch), cada uma com sua latência, seus limites de uso e suas falhas. Separar cada fonte em um serviço próprio torna natural tratar essas diferenças, escalar apenas o que for necessário e impedir que a falha de uma fonte derrube o aplicativo inteiro.'],
  ['p', 'Por fim, o trabalho tem uma motivação formativa: ele exige que o grupo pense em problemas que não aparecem em programas executados em um único processo, como tempo limite de rede, respostas parciais, consistência de cache, mensagens entregues a quem não se conhece e segurança de chaves de acesso. Esses são problemas que encontraremos no mercado de trabalho.'],

  // =====================================================================
  ['h1', '2 INTRODUÇÃO'],
  ['p', 'A maior parte da população brasileira vive em áreas urbanas, e é nas cidades que se concentram os efeitos da emissão de poluentes por veículos e indústrias, da impermeabilização do solo, da ocupação de áreas de mananciais e da supressão da vegetação. Esses fenômenos afetam diretamente a saúde, a mobilidade e a segurança das pessoas, e por isso o acesso rápido à informação ambiental tem valor prático: decidir se é um bom dia para atividade física ao ar livre, evitar uma via alagada ou entender por que o céu da cidade amanheceu cinza.'],
  ['p', 'Ao mesmo tempo, nunca houve tantos dados ambientais abertos. Serviços como o Open-Meteo disponibilizam gratuitamente previsões meteorológicas, de qualidade do ar e de vazão de rios para qualquer coordenada do planeta; o OpenStreetMap mantém uma base colaborativa com estações de transporte, represas e áreas protegidas; o Global Forest Watch publica mapas de perda de cobertura arbórea baseados em imagens de satélite (HANSEN et al., 2013); e empresas como a TomTom oferecem dados de trânsito em tempo real. O desafio deixou de ser a falta de dados e passou a ser integrá-los de forma confiável.'],
  ['p', 'Integrar várias fontes remotas é, por definição, um problema de sistemas distribuídos. Coulouris et al. (2013) definem um sistema distribuído como aquele em que componentes localizados em computadores interligados em rede se comunicam e coordenam suas ações apenas pela troca de mensagens. Tanenbaum e Van Steen (2007) acrescentam que, para o usuário, esse conjunto deve parecer um sistema único e coerente. As consequências dessa definição são conhecidas: concorrência entre componentes, ausência de um relógio global e falhas independentes, isto é, uma parte pode falhar enquanto as demais continuam funcionando.'],
  ['p', 'Nos últimos anos, essas ideias ganharam forma prática na arquitetura de **microsserviços**, em que uma aplicação é composta por serviços pequenos, autônomos, implantados de forma independente e organizados em torno de capacidades de negócio (NEWMAN, 2021). Cada serviço pode ser desenvolvido, testado, reiniciado e escalado sem afetar os outros, desde que o contrato de comunicação entre eles seja respeitado. Ferramentas de conteinerização como o Docker tornaram esse modelo acessível até mesmo a projetos acadêmicos, pois todo o sistema pode ser iniciado com um único comando.'],
  ['p', 'Do lado do usuário, o dispositivo móvel é o meio natural para esse tipo de informação, porque o celular está com a pessoa no momento em que ela precisa decidir e conhece sua localização. O Respira Urbana foi construído como uma aplicação web móvel (*mobile web app*): uma interface responsiva, otimizada para telas pequenas e toque, executada no navegador do aparelho e que usa recursos nativos expostos pela plataforma web, como a geolocalização. Essa escolha dispensa a instalação por loja de aplicativos, funciona em Android e iOS com o mesmo código e permite a demonstração tanto em um celular real quanto no simulador de dispositivos dos navegadores.'],
  ['p', 'Este documento está organizado da seguinte forma: o Capítulo 3 apresenta os fundamentos das tecnologias escolhidas; o Capítulo 4, o plano de desenvolvimento, com requisitos, ferramentas e etapas; o Capítulo 5 descreve o projeto do programa, seus módulos e a comunicação entre eles; o Capítulo 6 traz o relatório com as principais linhas de código comentadas; o Capítulo 7 apresenta o programa em funcionamento e os testes realizados; o Capítulo 8 reúne as considerações finais, com dificuldades, aprendizados e a interdisciplinaridade envolvida; e, por fim, constam a bibliografia e a ficha de Atividades Práticas Supervisionadas.'],

  // =====================================================================
  ['h1', '3 FUNDAMENTOS DAS TECNOLOGIAS PARA DISPOSITIVOS MÓVEIS ESCOLHIDAS'],
  ['h2', '3.1 Sistemas distribuídos e o modelo cliente-servidor'],
  ['p', 'Um sistema distribuído é um conjunto de computadores independentes que se apresenta ao usuário como um sistema único (TANENBAUM; VAN STEEN, 2007). Seus objetivos clássicos são o compartilhamento de recursos, a transparência (esconder do usuário onde e como os recursos estão), a abertura (uso de interfaces padronizadas) e a escalabilidade. Coulouris et al. (2013) destacam três desafios que acompanham esses objetivos: a heterogeneidade das máquinas e redes, o tratamento de falhas parciais e a segurança da comunicação.'],
  ['p', 'O modelo mais usado para organizar esses sistemas é o **cliente-servidor**: o cliente envia uma requisição e o servidor devolve uma resposta. No Respira Urbana, o navegador do celular é o cliente e o *api-gateway* é o servidor com o qual ele conversa. Internamente, porém, o próprio gateway atua como cliente dos demais serviços, que por sua vez são clientes de APIs externas. Essa organização em camadas é o que Tanenbaum e Van Steen (2007) chamam de arquitetura multicamada (*multitiered*), em que um servidor também pode fazer o papel de cliente.'],
  ['h2', '3.2 Arquitetura de microsserviços e API Gateway'],
  ['p', 'Microsserviços são serviços pequenos e autônomos que trabalham juntos, cada um responsável por uma capacidade bem delimitada e com seu próprio ciclo de implantação (NEWMAN, 2021). Entre as vantagens estão o isolamento de falhas, a possibilidade de usar tecnologias diferentes em cada serviço e a escalabilidade seletiva. Entre as desvantagens estão a maior complexidade operacional e a necessidade de lidar explicitamente com a rede, que pode ser lenta ou falhar.'],
  ['p', 'Para que o cliente não precise conhecer o endereço de cada serviço, adota-se o padrão **API Gateway**: um ponto de entrada único que recebe as requisições externas, as encaminha aos serviços internos e, quando necessário, combina várias respostas em uma só (RICHARDSON, 2018). No projeto, o gateway também concentra o cache, a validação de parâmetros e a política de CORS, e é o único componente exposto ao navegador.'],
  ['h2', '3.3 Comunicação síncrona: HTTP, REST e JSON'],
  ['p', 'A comunicação síncrona do sistema usa o protocolo HTTP sobre TCP/IP, seguindo o estilo arquitetural **REST** (*Representational State Transfer*), proposto por Fielding (2000). No REST, cada recurso é identificado por uma URL, a interação é sem estado (cada requisição carrega tudo o que é necessário para ser atendida) e as respostas podem ser armazenadas em cache. Essas restrições favorecem a escalabilidade, pois qualquer instância de um serviço pode atender qualquer requisição.'],
  ['p', 'Os dados trafegam no formato **JSON** (*JavaScript Object Notation*), leve, legível e suportado nativamente por JavaScript, linguagem usada tanto no cliente quanto no servidor. Por exemplo, a requisição `GET /api/environment?lat=-23.55&lon=-46.63` devolve, em um único objeto JSON, o clima, a qualidade do ar, os riscos e o trânsito do ponto informado, junto com o estado de cada parte.'],
  ['h2', '3.4 Comunicação assíncrona: publicação/assinatura (Pub/Sub)'],
  ['p', 'Na comunicação assíncrona, quem envia não espera a resposta de quem recebe. No modelo **publicação/assinatura**, produtores publicam mensagens em canais e consumidores assinam os canais que lhes interessam; o intermediário (*broker*) entrega as mensagens a todos os assinantes. Eugster et al. (2003) mostram que esse modelo desacopla os participantes em três dimensões: espaço (um não conhece o outro), tempo (não precisam estar ativos ao mesmo tempo, quando há persistência) e sincronização (o produtor não fica bloqueado). No Respira Urbana, o *air-quality-service* publica no canal `air-quality-alerts` quando encontra um índice de qualidade do ar ruim, e o *alert-service* assina esse canal, sem que um serviço conheça o endereço do outro.'],
  ['h2', '3.5 Redis: cache distribuído e intermediário de mensagens'],
  ['p', 'O Redis é um banco de dados em memória do tipo chave-valor, conhecido pela baixa latência. No projeto ele cumpre dois papéis. O primeiro é de **cache distribuído**: respostas das APIs externas são guardadas com tempo de expiração (TTL), o que reduz a latência, economiza as cotas gratuitas das APIs e permite que várias instâncias do gateway compartilhem o mesmo cache, algo impossível se o cache estivesse na memória de cada processo. Kleppmann (2017) observa que manter dados derivados, como caches, é uma das principais técnicas para tornar aplicações orientadas a dados mais rápidas, desde que se aceite alguma defasagem.'],
  ['p', 'O segundo papel é de **broker Pub/Sub**, por meio dos comandos `PUBLISH` e `SUBSCRIBE`. O Redis também guarda a lista dos alertas mais recentes e as chaves de deduplicação, usando a operação atômica `SET ... NX EX`, que só grava uma chave se ela ainda não existir. Isso garante que um mesmo alerta não seja registrado duas vezes, mesmo que venha de dois caminhos diferentes.'],
  ['h2', '3.6 Node.js e Express'],
  ['p', 'Os serviços foram escritos em JavaScript sobre o **Node.js**, um ambiente de execução baseado no motor V8 que usa um modelo de entrada e saída não bloqueante orientado a eventos. Esse modelo é especialmente adequado para serviços que passam a maior parte do tempo esperando respostas de rede, como os deste projeto: enquanto uma chamada a uma API externa não retorna, o processo continua atendendo outras requisições. O recurso `Promise.allSettled` permite disparar várias chamadas ao mesmo tempo e tratar o resultado de cada uma de forma independente.'],
  ['p', 'Sobre o Node.js foi usado o **Express**, um framework mínimo para servidores HTTP que organiza o código em rotas e *middlewares*. Cada serviço expõe suas rotas REST e uma rota `/health`, usada para verificar se o processo está ativo.'],
  ['h2', '3.7 Conteinerização com Docker e Docker Compose'],
  ['p', 'Um container empacota a aplicação com suas dependências e a executa isolada do restante do sistema, compartilhando o núcleo do sistema operacional, o que o torna mais leve que uma máquina virtual. Burns (2018) aponta os containers como a unidade básica dos padrões modernos de sistemas distribuídos, por tornarem a implantação reproduzível. Cada serviço do projeto tem seu próprio `Dockerfile`, baseado na imagem `node:18-alpine`.'],
  ['p', 'O **Docker Compose** descreve, em um único arquivo `docker-compose.yml`, todos os containers, suas portas, variáveis de ambiente, dependências e verificações de saúde (*healthchecks*). Os containers se comunicam por uma rede virtual interna, na qual cada serviço é encontrado pelo próprio nome (por exemplo, `http://risk-service:3005`), uma forma simples de descoberta de serviços por DNS.'],
  ['h2', '3.8 Aplicação web móvel e design responsivo'],
  ['p', 'Há três abordagens principais para aplicações em dispositivos móveis: nativas (escritas para cada plataforma, como Kotlin no Android e Swift no iOS), híbridas ou multiplataforma (um código compilado ou empacotado para várias plataformas) e web móveis (executadas no navegador do aparelho). O grupo escolheu a abordagem **web móvel** porque o foco da disciplina é a arquitetura distribuída no servidor; com ela, o mesmo cliente funciona em qualquer celular, tablet ou computador, e a atualização é imediata, sem passar por lojas de aplicativos.'],
  ['p', 'Para que uma página web se comporte bem em telas pequenas, aplica-se o **design responsivo**, que combina layouts fluidos, imagens flexíveis e *media queries* do CSS para adaptar a interface ao tamanho da tela (MARCOTTE, 2011). O W3C (2010) recomenda, para aplicações web móveis, minimizar o volume de dados transferidos, usar cache e tratar a falta de conectividade, práticas adotadas no projeto. O cliente declara a *meta tag* `viewport`, usa botões dimensionados para o toque, uma barra de filtros com rolagem horizontal, tema claro e escuro que acompanha a preferência do sistema operacional e guarda as preferências do usuário no `localStorage` do navegador.'],
  ['p', 'A localização do usuário é obtida pela **API de Geolocalização** do navegador (`navigator.geolocation`), que no celular usa GPS, Wi-Fi e rede móvel. Por questões de privacidade, o navegador pede a permissão do usuário e só libera a API em contextos seguros (HTTPS ou `localhost`) (MDN WEB DOCS, 2026a). Caso a permissão seja negada, o aplicativo continua funcionando pela busca por nome de cidade.'],
  ['p', 'A abordagem também deixa aberto o caminho para empacotar o mesmo cliente como aplicativo instalável, seja como *Progressive Web App* (PWA), seja por meio de ferramentas como o Capacitor, que embutem a página em um aplicativo nativo.'],
  ['h2', '3.9 Mapas na web: Leaflet, tiles e grades'],
  ['p', 'O mapa é desenhado com o **Leaflet**, biblioteca JavaScript de código aberto para mapas interativos, leve e com suporte a gestos de toque (LEAFLET, 2026). Mapas web costumam ser formados por *tiles*: imagens quadradas de 256 × 256 pixels, organizadas por nível de zoom e coordenadas `z/x/y` na projeção Web Mercator. O fundo do mapa vem do OpenStreetMap; as camadas de trânsito (TomTom), clima (OpenWeatherMap) e desmatamento (Global Forest Watch) também são tiles sobrepostos.'],
  ['p', 'Para poluição, chuva e inversão térmica, o próprio sistema gera as camadas. A área visível é dividida em uma grade de, no máximo, cerca de 8 × 8 células, alinhada a passos fixos (0,05°, 0,1°, 0,2°, 0,5° e assim por diante). O valor do centro de cada célula é obtido em uma única chamada em lote à API e pintado como um retângulo colorido. O alinhamento faz com que pequenos movimentos do mapa reaproveitem as mesmas células já guardadas no cache.'],
  ['h2', '3.10 Fontes de dados ambientais'],
  ['p', 'A Tabela 1 resume as fontes externas consumidas pelo sistema e o serviço responsável por cada uma.'],
  ['table', ['Fonte', 'Dados utilizados', 'Serviço'], [
    ['Open-Meteo Forecast', 'Clima atual, chuva prevista por hora, perfil vertical de temperatura', 'weather, risk'],
    ['Open-Meteo Air Quality', 'IQA europeu, PM2,5, PM10, CO, NO₂, O₃, índice UV', 'air-quality'],
    ['Open-Meteo Flood (GloFAS)', 'Vazão diária dos rios (30 dias passados e 7 de previsão)', 'risk'],
    ['Open-Meteo Geocoding', 'Nome de cidade → coordenadas', 'geocoding'],
    ['OpenStreetMap (Overpass API)', 'Estações e pontos de transporte; represas, lagos e áreas protegidas', 'geodata'],
    ['TomTom Traffic', 'Fluxo em tempo real, incidentes, tiles de trânsito', 'traffic'],
    ['OpenWeatherMap', 'Camadas globais de temperatura, chuva, vento, nuvens e pressão', 'cliente'],
    ['Global Forest Watch (UMD/Hansen)', 'Perda de cobertura arbórea', 'cliente'],
  ], [3000, 4300, 1771], 'Tabela 1 – Fontes de dados externas'],
  ['p', 'O índice de qualidade do ar usado é o **IQA europeu** (*European Air Quality Index*), calculado a partir das concentrações de PM2,5, PM10, NO₂, O₃ e SO₂ e dividido em seis faixas, de “boa” a “extremamente ruim” (EUROPEAN ENVIRONMENT AGENCY, 2026). A **inversão térmica** ocorre quando a temperatura aumenta com a altitude perto do solo, ao contrário do normal (queda média de cerca de 6,5 °C por quilômetro). Nessa situação o ar frio e mais denso fica preso junto à superfície, e os poluentes não se dispersam, o que é agravado quando o vento é fraco.'],

  // =====================================================================
  ['h1', '4 PLANO DE DESENVOLVIMENTO DA APLICAÇÃO'],
  ['p', 'Este capítulo descreve como o desenvolvimento foi planejado: escopo, requisitos, decisões de arquitetura, ferramentas utilizadas, etapas de trabalho, estratégia de testes e riscos identificados.'],
  ['h2', '4.1 Escopo'],
  ['p', 'O Respira Urbana é uma aplicação de **consulta e monitoramento**, sem cadastro de usuários e sem registro de ocorrências. Todos os dados exibidos vêm de fontes públicas ou de cálculos feitos pelo próprio sistema. Os níveis de risco são estimativas de apoio baseadas em modelos de previsão e **não substituem** os alertas oficiais da Defesa Civil, do INMET e do CEMADEN, o que é informado na própria interface.'],
  ['p', 'Também deixamos claro o que está fora do escopo. As camadas de mananciais e de desmatamento são **referências** para contextualizar o mapa: mostram onde estão represas, áreas protegidas e as perdas de cobertura arbórea já registradas, mas não detectam nem registram invasões, o que exigiria processamento de imagens de satélite ou denúncias e fugiria ao objetivo da disciplina.'],
  ['h2', '4.2 Requisitos funcionais'],
  ['table', ['Código', 'Requisito'], [
    ['RF01', 'Localizar o usuário pelo GPS do aparelho e carregar automaticamente os dados do local.'],
    ['RF02', 'Buscar cidades pelo nome, com lista de sugestões.'],
    ['RF03', 'Exibir o resumo do local: clima, qualidade do ar com poluentes, índice UV, riscos e trânsito.'],
    ['RF04', 'Exibir camadas de clima (temperatura, chuva, vento, nuvens, pressão), uma por vez.'],
    ['RF05', 'Exibir os temas de monitoramento, vários ao mesmo tempo: poluição, trânsito, transporte público, alagamento, inversão térmica, mananciais e desmatamento.'],
    ['RF06', 'Mostrar uma legenda com as cores de todas as camadas ligadas.'],
    ['RF07', 'Ao tocar no mapa, mostrar os valores do ponto para as camadas ligadas.'],
    ['RF08', 'Marcar com pinos os pontos críticos (IQA alto, chuva de risco alto, inversão moderada ou forte, acidentes e interdições).'],
    ['RF09', 'Classificar o risco de alagamento em quatro níveis, com os motivos.'],
    ['RF10', 'Classificar a inversão térmica das próximas 24 horas, com horário do pico e aviso de poluentes retidos.'],
    ['RF11', 'Monitorar automaticamente cidades configuradas e gerar alertas sem duplicação.'],
    ['RF12', 'Exibir o feed de alertas, o painel das cidades monitoradas e a lista de incidentes de trânsito da área.'],
  ], [1300, 7771], 'Tabela 2 – Requisitos funcionais'],
  ['h2', '4.3 Requisitos não funcionais'],
  ['table', ['Código', 'Requisito'], [
    ['RNF01', 'Interface utilizável em telas a partir de 360 px de largura, com controles adequados ao toque.'],
    ['RNF02', 'Tolerância a falhas parciais: a indisponibilidade de um serviço não pode impedir a exibição dos demais dados.'],
    ['RNF03', 'Transparência de estado: o usuário deve ver se cada parte veio ao vivo, do cache ou está indisponível.'],
    ['RNF04', 'Todas as chamadas de rede devem ter tempo limite (timeout).'],
    ['RNF05', 'Chaves de API restritas (TomTom) nunca podem chegar ao navegador.'],
    ['RNF06', 'Uso de cache para respeitar os limites gratuitos das APIs externas.'],
    ['RNF07', 'Todo o sistema deve subir com um único comando (docker-compose up).'],
    ['RNF08', 'Testes automatizados executáveis sem internet e sem instalação de dependências.'],
  ], [1300, 7771], 'Tabela 3 – Requisitos não funcionais'],
  ['h2', '4.4 Decisões de arquitetura'],
  ['p', 'As principais decisões, e o motivo de cada uma, foram as seguintes:'],
  ['ul', [
    '**Um serviço por responsabilidade.** Cada fonte ou cálculo ficou em um serviço próprio: geocodificação, clima, qualidade do ar, riscos, dados geográficos, trânsito e alertas. Assim, uma falha ou lentidão da Overpass API, por exemplo, afeta apenas o *geodata-service*.',
    '**Gateway como ponto único de entrada.** O cliente conhece apenas um endereço. O gateway agrega as respostas, aplica o cache e é o único com CORS liberado.',
    '**Dois estilos de comunicação.** REST síncrono para consultas do usuário e Pub/Sub assíncrono para eventos (alertas), mostrando na prática as diferenças entre os modelos.',
    '**Promise.allSettled em vez de Promise.all.** Com `Promise.all`, uma única falha rejeitaria a resposta inteira; com `allSettled`, cada parte é avaliada separadamente e o cliente recebe o que estiver disponível.',
    '**Cache no Redis, não em memória.** O cache é compartilhado entre processos e sobrevive à reinicialização do gateway, permitindo no futuro várias réplicas atrás de um balanceador de carga.',
    '**Monitoramento ativo independente do usuário.** O *alert-service* consulta sozinho as cidades configuradas, de modo que os alertas existem mesmo que ninguém esteja usando o aplicativo.',
    '**Funções puras separadas da rede.** As regras de classificação (alagamento, inversão, alertas, grade) ficam em arquivos sem acesso à rede, o que permite testá-las isoladamente.',
  ]],
  ['h2', '4.5 Ferramentas e tecnologias'],
  ['table', ['Ferramenta', 'Uso no projeto'], [
    ['JavaScript (ES Modules)', 'Linguagem única no cliente e no servidor'],
    ['Node.js 18 (containers) / 22 (testes)', 'Ambiente de execução dos serviços e dos testes'],
    ['Express 4', 'Rotas HTTP de cada microsserviço'],
    ['ioredis 5', 'Cliente Redis: cache, Pub/Sub, listas e deduplicação'],
    ['cors', 'Liberação de acesso do navegador ao gateway'],
    ['Redis 7 (Alpine)', 'Cache distribuído e intermediário de mensagens'],
    ['Docker e Docker Compose', 'Containers e orquestração local dos 10 processos'],
    ['Nginx (Alpine)', 'Servidor estático do cliente web'],
    ['HTML5, CSS3 e JavaScript', 'Cliente web móvel responsivo'],
    ['Leaflet 1.9.4', 'Mapa interativo com suporte a toque'],
    ['node:test', 'Executor de testes nativo do Node.js'],
    ['Git e GitHub', 'Controle de versão e colaboração do grupo'],
    ['Visual Studio Code', 'Editor de código'],
    ['Chrome DevTools (modo dispositivo)', 'Simulação de celulares e inspeção de rede'],
  ], [3600, 5471], 'Tabela 4 – Ferramentas utilizadas'],
  ['h2', '4.6 Etapas de desenvolvimento'],
  ['p', 'O trabalho foi dividido em etapas incrementais. Cada etapa terminava com o sistema funcionando, o que permitiu demonstrar progresso ao professor orientador e corrigir o rumo cedo.'],
  ['table', ['Etapa', 'Atividades', 'Entregável'], [
    ['1. Concepção', 'Escolha do tema ambiental, pesquisa de APIs abertas, definição do escopo e submissão da proposta.', 'Proposta aprovada'],
    ['2. Arquitetura', 'Divisão em serviços, definição das rotas REST, do canal Pub/Sub e do docker-compose.', 'Diagrama de arquitetura'],
    ['3. Núcleo distribuído', 'Gateway, geocodificação, clima e qualidade do ar; cache no Redis; publicação de alertas.', 'Busca de cidade com clima e ar'],
    ['4. Cliente móvel', 'Interface responsiva, mapa Leaflet, geolocalização, indicadores de estado.', 'Aplicativo utilizável no celular'],
    ['5. Riscos', 'Serviço de riscos: alagamento (chuva + vazão) e inversão térmica; grades no mapa.', 'Camadas de alagamento e inversão'],
    ['6. Mobilidade e território', 'Trânsito (TomTom) com proteção da chave; transporte público e mananciais (OSM); desmatamento.', 'Todos os temas no mapa'],
    ['7. Alertas', 'Monitoramento ativo, deduplicação, feed de alertas e painel das cidades.', 'Alertas automáticos'],
    ['8. Qualidade', 'Testes automatizados, script de verificação das APIs reais, tratamento de erros.', '29 testes aprovados'],
    ['9. Documentação', 'Redação deste documento, prints, ficha APS e preparação da apresentação.', 'Trabalho final'],
  ], [2100, 4971, 2000], 'Tabela 5 – Etapas de desenvolvimento'],
  ['h2', '4.7 Divisão de tarefas'],
  ['p', '[PREENCHER: descrever o que cada integrante fez. Exemplo: Aluno 1 – gateway, Redis e alertas; Aluno 2 – cliente móvel e mapa; Aluno 3 – serviços de riscos, trânsito e dados geográficos, testes e documentação.]'],
  ['h2', '4.8 Configuração e execução'],
  ['p', 'As chaves de acesso e parâmetros ficam no arquivo `.env`, que não é enviado ao repositório (existe um modelo `.env.example`). As variáveis principais são `OPENWEATHER_API_KEY` (camadas de clima), `TOMTOM_API_KEY` (trânsito; vazia desativa só esse tema), `MONITOR_LOCATIONS` (cidades vigiadas, no formato `Nome:lat:lon;...`; vazia usa seis capitais brasileiras), `MONITOR_INTERVAL_SECONDS` (padrão de 900 s) e `AQI_ALERT_THRESHOLD` (padrão 80).'],
  ['p', 'Com o Docker instalado, todo o sistema é iniciado com `docker-compose up --build`. O aplicativo fica disponível em `http://localhost:8080` e o gateway em `http://localhost:3000`. Para acessar pelo celular, o aparelho deve estar na mesma rede Wi-Fi do computador e abrir `http://<IP-do-computador>:8080/?gateway=http://<IP-do-computador>:3000`; o parâmetro `gateway` indica ao cliente onde está o servidor. Durante o desenvolvimento, os volumes do Docker e o modo `node --watch` recarregam cada serviço automaticamente quando o código é salvo.'],
  ['h2', '4.9 Estratégia de testes'],
  ['p', 'Foram planejados três níveis de teste, todos executados com `npm test`, sem acesso à internet e sem instalar dependências (o Redis, o Express e as APIs externas são substituídos por simulações):'],
  ['ul', [
    '**Testes unitários** das funções puras: limiares de chuva, mediana da vazão, classificação de alagamento e de inversão, alinhamento da grade, interpretação das respostas da TomTom e da Overpass, geração e formato dos alertas.',
    '**Testes de ponta a ponta do backend**: todos os serviços são iniciados juntos, com Redis em memória e APIs externas simuladas, e são verificados o agregado `/environment`, a tolerância a falha parcial, o cache, as grades, a deduplicação de alertas, a proteção da chave da TomTom e o monitoramento ativo.',
    '**Teste do cliente**: a lógica da interface é executada com DOM e Leaflet simulados, verificando temas, legendas, riscos, alertas e painel de monitoramento.',
  ]],
  ['p', 'Como os testes usam respostas simuladas, foi criado também o script `scripts/check-apis.mjs`, que consulta de verdade cada API externa e o gateway local e indica, para cada uma, se respondeu no formato esperado.'],
  ['h2', '4.10 Riscos do projeto e mitigação'],
  ['table', ['Risco', 'Mitigação adotada'], [
    ['Limites de uso das APIs gratuitas', 'Cache no Redis com TTL; grade alinhada e chamadas em lote; deduplicação de alertas.'],
    ['Instabilidade de serviços externos', 'Timeout em todas as chamadas; Promise.allSettled; uso do último valor em cache; servidor Overpass alternativo.'],
    ['Exposição de chaves de acesso', 'Arquivo .env fora do Git; tiles da TomTom passam pelo servidor; mensagens de erro mascaram a chave.'],
    ['Área de consulta grande demais', 'Limite de área por tema (trânsito 0,8°, mananciais 1,5°, estações 2°, pontos de ônibus 0,2°) e aviso para aproximar o mapa.'],
    ['Interpretação equivocada dos riscos', 'Avisos na interface de que são estimativas e não substituem alertas oficiais.'],
  ], [3200, 5871], 'Tabela 6 – Riscos e mitigação'],

  // =====================================================================
  ['h1', '5 PROJETO DO PROGRAMA'],
  ['h2', '5.1 Visão geral da arquitetura'],
  ['p', 'O sistema é composto por dez processos, cada um em um container: o cliente web (servido pelo Nginx), o Redis, o *api-gateway* e sete microsserviços. A Figura 1 mostra os componentes e as comunicações entre eles. As setas contínuas representam chamadas HTTP/REST síncronas e as tracejadas representam mensagens assíncronas e o monitoramento periódico.'],
  ['fig', 'img/arq.png', 'Figura 1 – Arquitetura do Respira Urbana', 16],
  ['h2', '5.2 Módulos'],
  ['table', ['Módulo (porta)', 'Responsabilidade', 'Principais rotas'], [
    ['client (8080)', 'Interface web móvel: mapa, temas, resumo do local, alertas.', '—'],
    ['api-gateway (3000)', 'Ponto de entrada único; agrega serviços; cache; proxy de tiles.', '/api/environment, /api/point, /api/grid/*, /api/alerts'],
    ['geocoding-service (3001)', 'Converte nome de cidade em coordenadas.', '/geocode'],
    ['weather-service (3002)', 'Clima atual e grade de chuva prevista (24 h).', '/weather, /rain-grid'],
    ['air-quality-service (3003)', 'IQA, poluentes e UV; grade de poluição; publica alertas.', '/air-quality, /air-grid'],
    ['alert-service (3004)', 'Assina o canal de alertas; monitora cidades; guarda o feed.', '/alerts, /monitor'],
    ['risk-service (3005)', 'Risco de alagamento e inversão térmica; grade de inversão.', '/flood, /inversion, /inversion-grid'],
    ['geodata-service (3006)', 'Transporte público e mananciais via Overpass, com cache.', '/transit, /watersheds'],
    ['traffic-service (3008)', 'Trânsito TomTom: tiles, incidentes e fluxo; guarda a chave.', '/tiles/*, /incidents, /flow'],
    ['redis (6379)', 'Cache, Pub/Sub, lista de alertas, situação das cidades.', '—'],
  ], [2500, 3771, 2800], 'Tabela 7 – Módulos do sistema'],
  ['p', 'Todos os serviços expõem a rota `/health`, usada pelo Docker Compose para verificar se o container está saudável. Cada serviço tem seu próprio `package.json`, com apenas as dependências de que precisa: os serviços que não usam o Redis, por exemplo, dependem somente do Express.'],
  ['h2', '5.3 Fluxo de uma consulta'],
  ['p', 'A Figura 2 mostra o que acontece quando o usuário abre um local no celular. O cliente faz uma única chamada ao gateway, que consulta o cache e dispara em paralelo as chamadas aos serviços de clima, qualidade do ar, riscos e trânsito. Se o índice de qualidade do ar ultrapassar o limite, o *air-quality-service* publica um evento no Redis e segue seu fluxo normal, sem esperar o consumidor. O gateway monta a resposta com o que estiver disponível, grava no cache e devolve ao cliente o dado e o estado de cada parte.'],
  ['fig', 'img/seq.png', 'Figura 2 – Sequência de uma consulta de local (/api/environment)', 16],
  ['h2', '5.4 Tolerância a falhas'],
  ['p', 'Cada parte da resposta recebe um de três estados: `live` (veio do serviço agora), `cache` (o serviço falhou, mas havia um valor recente no Redis) ou `unavailable` (sem dado). O cliente mostra esse estado em uma faixa de indicadores coloridos (Localização, Clima, Qualidade do ar, Riscos, Trânsito e Alertas). Só quando nem o clima nem a qualidade do ar podem ser obtidos, nem ao vivo nem do cache, o gateway responde com erro HTTP 502.'],
  ['p', 'Além disso, todas as chamadas de rede usam `AbortController` para impor um tempo limite (5 s por padrão no gateway e até 40 s nas consultas à Overpass); o *geodata-service* tenta um segundo servidor Overpass quando o primeiro falha; e os serviços que usam Redis continuam respondendo, apenas sem cache, se ele estiver fora do ar.'],
  ['h2', '5.5 Cache e chaves'],
  ['table', ['Chave no Redis', 'Conteúdo', 'Validade'], [
    ['env:<lat>,<lon>', 'Resposta agregada de um local (2 casas decimais)', '300 s'],
    ['point:<lat>,<lon>:<partes>', 'Clique no mapa (0,1° ≈ 11 km)', '300 s'],
    ['grid:<tema>:<limites>,<passo>', 'Grades de poluição, chuva e inversão', '1.800 s'],
    ['geo:transit / geo:water', 'Consultas à Overpass', '1.800 s'],
    ['traffic:tile / inc / flow', 'Tiles, incidentes e fluxo da TomTom', '120 s'],
    ['alerts:recent', 'Lista dos 100 alertas mais recentes', 'permanente'],
    ['alerts:air / alerts:mon', 'Chaves de deduplicação de alertas', '30 min / 3 h'],
    ['monitor:status', 'Situação das cidades monitoradas', 'atualizada a cada ciclo'],
  ], [3300, 4071, 1700], 'Tabela 8 – Uso do Redis'],
  ['h2', '5.6 Regras de classificação'],
  ['p', '**Alagamento.** Os limiares foram inspirados nos critérios de aviso de chuva intensa do INMET: nível “atenção” a partir de 30 mm em 24 h ou 20 mm/h; “alto” a partir de 50 mm ou 30 mm/h; “muito alto” a partir de 100 mm ou 60 mm/h. A vazão do rio mais próximo é comparada com a mediana dos últimos 30 dias: se a previsão chegar ao dobro, o nível mínimo passa a ser “atenção”; se chegar ao triplo e já houver chuva relevante, o nível sobe mais um grau. Cada classificação vem acompanhada dos motivos em texto.'],
  ['p', '**Inversão térmica.** A intensidade é a maior diferença de temperatura “de cima menos de baixo” entre 2 m e 180 m de altura e entre níveis de pressão consecutivos acima da superfície (1000 a 850 hPa). Classifica-se como fraca (0,5 a 1,5 °C), moderada (1,5 a 3 °C) ou forte (acima de 3 °C). Há aviso de poluentes retidos quando a inversão é moderada ou forte e o vento está abaixo de 10 km/h.'],
  ['p', '**Alertas.** O monitoramento gera alerta para IQA a partir de 80, risco de alagamento alto ou muito alto, inversão forte (ou moderada com vento fraco) e trânsito com três ou mais incidentes graves ou duas ou mais vias interditadas. Situações apenas de “atenção” não geram alerta, para que o feed não vire ruído.'],
  ['h2', '5.7 Estrutura de diretórios'],
  ['code', `respira-urbana-distributed/
├── docker-compose.yml        orquestração dos 10 containers
├── .env / .env.example       chaves e configuração (o .env não vai ao Git)
├── nginx.conf                servidor do cliente
├── client/index.html         aplicativo web móvel (Leaflet)
├── scripts/check-apis.mjs    verificação das APIs reais
├── tests/                    testes automatizados (npm test)
└── services/
    ├── api-gateway/          :3000  entrada, cache, proxy de tiles
    ├── geocoding-service/    :3001  cidade → coordenadas
    ├── weather-service/      :3002  clima e grade de chuva
    ├── air-quality-service/  :3003  IQA, grade de poluição, publica alertas
    ├── alert-service/        :3004  feed de alertas e monitoramento
    ├── risk-service/         :3005  alagamento e inversão térmica
    ├── geodata-service/      :3006  transporte público e mananciais
    └── traffic-service/      :3008  trânsito TomTom`],
  ['p', 'Dentro de cada serviço, o arquivo `src/index.js` contém o servidor Express e as rotas, enquanto a lógica de domínio fica em arquivos separados (`flood.js`, `inversion.js`, `alerts.js`, `tomtom.js`, `overpass.js`, `grid.js`).'],

  // =====================================================================
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
  ['h2', '6.5 Consumidor de eventos e deduplicação'],
  ['p', 'O *alert-service* usa duas conexões com o Redis, pois uma conexão em modo de assinatura não pode executar outros comandos. A deduplicação usa `SET ... NX EX`: a chave só é criada se ainda não existir, de forma atômica.'],
  ['code', `const subscriber = new Redis(REDIS_URL, { retryStrategy: () => 2000 });
const store = new Redis(REDIS_URL, { retryStrategy: () => 2000 });

subscriber.subscribe('air-quality-alerts');

subscriber.on('message', async (channel, message) => {
  const data = JSON.parse(message);
  const key = \`alerts:air:\${Number(data.lat).toFixed(2)},\${Number(data.lon).toFixed(2)}\`;
  // NX: so grava se nao existir; EX: expira em 30 min -> 1 alerta por local
  const first = await store.set(key, '1', 'EX', AIR_DEDUP_SECONDS, 'NX');
  if (!first) return;
  const alert = buildAlert(channel, data);
  await store.lpush('alerts:recent', JSON.stringify(alert));
  await store.ltrim('alerts:recent', 0, MAX_ALERTS - 1);   // guarda os 100 ultimos
});`, 'Código 5 – services/alert-service/src/index.js (trecho)'],
  ['h2', '6.6 Monitoramento ativo'],
  ['code', `export async function checkLocation(loc) {
  const d = 0.15;   // ~16 km em volta do ponto
  const bbox = \`south=\${loc.lat - d}&west=\${loc.lon - d}&north=\${loc.lat + d}&east=\${loc.lon + d}\`;
  const [air, flood, inversion, traffic] = (await Promise.allSettled([
    getJson(\`\${AIR_URL}/air-quality?lat=\${loc.lat}&lon=\${loc.lon}&quiet=1\`),
    getJson(\`\${RISK_URL}/flood?lat=\${loc.lat}&lon=\${loc.lon}\`),
    getJson(\`\${RISK_URL}/inversion?lat=\${loc.lat}&lon=\${loc.lon}\`),
    getJson(\`\${TRAFFIC_URL}/incidents?\${bbox}\`)
  ])).map((r) => (r.status === 'fulfilled' ? r.value : null));
  return { air, flood, inversion, traffic };
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
  ['h2', '6.10 Cliente móvel: geolocalização e consulta ao gateway'],
  ['code', `function tryGeolocation(auto) {
  if (!navigator.geolocation) { /* navegador sem suporte: usa a busca */ return; }
  setDot('geo', 'pending');
  navigator.geolocation.getCurrentPosition(
    (pos) => { setDot('geo', 'ok');
               loadPlace(pos.coords.latitude, pos.coords.longitude, 'Sua localização'); },
    () => renderError('Não foi possível acessar sua localização. ...'),
    { timeout: 8000 }
  );
}

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
}`, 'Código 10 – client/index.html (trecho)'],
  ['h2', '6.11 Orquestração com Docker Compose'],
  ['code', `  air-quality-service:
    build: ./services/air-quality-service
    environment:
      - PORT=3003
      - REDIS_URL=redis://redis:6379        # o nome do servico vira endereco (DNS interno)
      - AQI_ALERT_THRESHOLD=80
    depends_on:
      redis:
        condition: service_healthy          # so sobe depois que o Redis responder
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3003/health"]
      interval: 10s`, 'Código 11 – docker-compose.yml (trecho)'],

  // =====================================================================
  ['h1', '7 APRESENTAÇÃO DO PROGRAMA EM FUNCIONAMENTO'],
  ['p', 'Esta seção mostra o aplicativo em execução em um dispositivo móvel. Para a demonstração, o sistema foi iniciado com `docker-compose up --build` em um computador e acessado pelo navegador de um celular na mesma rede Wi-Fi [ou: pelo modo de simulação de dispositivos do Google Chrome].'],
  ['h2', '7.1 Telas do aplicativo'],
  ['print', 'Figura 3 – Tela inicial: localização automática e resumo do local (clima, qualidade do ar, UV)'],
  ['print', 'Figura 4 – Busca de cidade com lista de sugestões'],
  ['print', 'Figura 5 – Tema Poluição: grade colorida do IQA europeu, legenda e pinos de pontos críticos'],
  ['print', 'Figura 6 – Temas Alagamento e Inversão térmica ligados ao mesmo tempo'],
  ['print', 'Figura 7 – Tema Trânsito: fluxo em tempo real e lista de incidentes da área'],
  ['print', 'Figura 8 – Temas Transporte público e Mananciais'],
  ['print', 'Figura 9 – Tema Desmatamento (perda de cobertura arbórea)'],
  ['print', 'Figura 10 – Pop-up ao tocar no mapa, com os valores do ponto'],
  ['print', 'Figura 11 – Cartão de riscos: alagamento com motivos, inversão com horário do pico e trânsito'],
  ['print', 'Figura 12 – Alertas ambientais e painel das cidades monitoradas'],
  ['print', 'Figura 13 – Tema escuro'],
  ['h2', '7.2 Demonstração da tolerância a falhas'],
  ['p', 'Para demonstrar o comportamento distribuído, um dos serviços foi interrompido com o sistema em funcionamento, por meio do comando `docker stop respira-weather`. O aplicativo continuou exibindo a qualidade do ar, os riscos e o trânsito; o indicador de Clima mudou de cor, mostrando que o dado veio do cache ou ficou indisponível. Ao reiniciar o serviço (`docker start respira-weather`), o indicador voltou ao estado normal sem que fosse necessário reiniciar o restante do sistema.'],
  ['print', 'Figura 14 – Indicadores de estado com o weather-service desligado'],
  ['h2', '7.3 Testes automatizados'],
  ['p', 'A suíte de testes foi executada com `npm test` (Node.js 22). Os 29 testes foram aprovados, sem falhas, em cerca de seis segundos. A Tabela 9 resume a cobertura.'],
  ['table', ['Arquivo', 'Testes', 'O que verifica'], [
    ['e2e.test.mjs', '12', 'Health de todos os serviços, /config, /environment com falha parcial, /point com cache, grades alinhadas, transporte e mananciais, deduplicação de alertas, CORS, tiles de trânsito sem expor a chave, incidentes e fluxo, monitoramento ativo'],
    ['risk.test.mjs', '6', 'Limiares de chuva, mediana da vazão, classificação de alagamento, intensidade e janelas de inversão'],
    ['geodata.test.mjs', '6', 'Consultas Overpass, classificação de paradas, interpretação de estações e polígonos, servidor alternativo'],
    ['units.test.mjs', '4', 'Alinhamento da grade, cidades monitoradas, geração de alertas, URLs e respostas da TomTom'],
    ['client.test.mjs', '1', 'Temas, legendas, riscos, alertas e monitoramento no cliente (DOM simulado)'],
    ['Total', '29', '29 aprovados, 0 falhas'],
  ], [2200, 1000, 5871], 'Tabela 9 – Resultado dos testes automatizados'],
  ['print', 'Figura 15 – Saída do comando npm test'],

  // =====================================================================
  ['h1', '8 CONSIDERAÇÕES FINAIS'],
  ['h2', '8.1 Resultados'],
  ['p', 'O Respira Urbana atende ao tema proposto: é uma aplicação de sistema distribuído, utilizável em dispositivo móvel, que reúne as informações ambientais urbanas pedidas no enunciado (poluição do ar, trânsito e transporte público, alagamentos e inundações, mananciais, desmatamento e inversão térmica), acrescentando alertas automáticos, painel de cidades monitoradas, camadas de clima e tema escuro como funções extras.'],
  ['h2', '8.2 Dificuldades encontradas'],
  ['ul', [
    '**Limites das APIs gratuitas.** Cada ponto de uma grade conta como uma chamada no limite diário do Open-Meteo, e a TomTom limita a área de consulta. A solução foi alinhar as grades a passos fixos, fazer chamadas em lote e guardar tudo no cache.',
    '**Falhas parciais.** No início o gateway usava `Promise.all`, e a falha do serviço de trânsito (sem chave configurada) derrubava a tela inteira. A troca por `Promise.allSettled` e a exibição do estado de cada parte resolveram o problema.',
    '**Geolocalização no celular.** Os navegadores só liberam o GPS em HTTPS ou em `localhost`. Ao acessar o computador pelo IP da rede local, a localização automática é bloqueada, e o aplicativo passa a depender da busca por nome. [Registrar aqui como o grupo contornou isso na apresentação.]',
    '**Alertas duplicados.** O mesmo IQA alto podia chegar pelo Pub/Sub e pelo monitoramento. Usar a mesma chave de deduplicação nos dois caminhos garantiu um único alerta por local.',
    '**Validação de dados ambientais.** Como os testes usam respostas simuladas, foi preciso criar um script separado para confirmar que as APIs reais respondem no formato esperado.',
  ]],
  ['h2', '8.3 Melhorias futuras'],
  ['p', 'Como evolução, o grupo identificou: notificações *push* ou por e-mail a partir do *alert-service*; integração com o sistema DETER do INPE para alertas de desmatamento na Amazônia; exibição das linhas de transporte, e não só das paradas; histórico de alertas em banco de dados; várias réplicas do gateway atrás de um balanceador de carga; e o empacotamento do cliente como aplicativo instalável (PWA ou Capacitor).'],
  ['h2', '8.4 Efeito do trabalho na formação'],
  ['p', 'O projeto mostrou na prática que distribuir um sistema muda a forma de programar. Problemas que não existem em um programa local, como tempo limite, falha parcial, cache que pode estar desatualizado, mensagens que chegam a quem não se conhece e chaves que não podem vazar, passaram a fazer parte de cada decisão. Também aprendemos a trabalhar com containers, a escrever testes que simulam a rede e a ler documentação de APIs de terceiros, competências diretamente aplicáveis ao mercado de trabalho.'],
  ['h2', '8.5 Interdisciplinaridade'],
  ['p', 'O trabalho integrou conhecimentos de várias disciplinas do curso:'],
  ['ul', [
    '**Redes de Computadores:** HTTP sobre TCP/IP, portas, DNS interno do Docker, CORS e acesso pela rede local.',
    '**Sistemas Operacionais:** processos independentes, isolamento por containers, variáveis de ambiente e E/S não bloqueante.',
    '**Engenharia de Software:** levantamento de requisitos, modularização, separação entre lógica e infraestrutura, testes automatizados e controle de versão.',
    '**Banco de Dados e Estruturas de Dados:** armazenamento chave-valor, listas, expiração de chaves e operações atômicas no Redis.',
    '**Segurança da Informação:** proteção de credenciais, uso de proxy para chaves restritas e mascaramento de dados sensíveis em logs.',
    '**Interface Humano-Computador:** design responsivo, controles para toque, legendas, acessibilidade e tema escuro.',
    '**Computação Gráfica e Geoprocessamento:** projeção Web Mercator, sistema de tiles e grades geográficas.',
    '**Estatística e Matemática:** mediana, limiares de classificação e gradiente vertical de temperatura.',
    '**Ciências Ambientais e Meteorologia:** índices de qualidade do ar, inversão térmica, chuva intensa e vazão de rios.',
  ]],

  // =====================================================================
  ['h1', 'BIBLIOGRAFIA'],
  ['ref', 'BRASIL. Lei nº 12.608, de 10 de abril de 2012. Institui a Política Nacional de Proteção e Defesa Civil – PNPDEC. **Diário Oficial da União**, Brasília, DF, 11 abr. 2012.'],
  ['ref', 'BURNS, B. **Designing distributed systems**: patterns and paradigms for scalable, reliable services. Sebastopol: O’Reilly Media, 2018.'],
  ['ref', 'COULOURIS, G.; DOLLIMORE, J.; KINDBERG, T.; BLAIR, G. **Sistemas distribuídos**: conceitos e projeto. 5. ed. Porto Alegre: Bookman, 2013.'],
  ['ref', 'DOCKER INC. **Docker Compose overview**. Disponível em: https://docs.docker.com/compose/. Acesso em: 1 nov. 2026.'],
  ['ref', 'EUGSTER, P. T.; FELBER, P. A.; GUERRAOUI, R.; KERMARREC, A.-M. The many faces of publish/subscribe. **ACM Computing Surveys**, v. 35, n. 2, p. 114-131, 2003.'],
  ['ref', 'EUROPEAN ENVIRONMENT AGENCY. **European Air Quality Index**. Disponível em: https://airindex.eea.europa.eu/. Acesso em: 1 nov. 2026.'],
  ['ref', 'FIELDING, R. T. **Architectural styles and the design of network-based software architectures**. 2000. Tese (Doutorado em Information and Computer Science) – University of California, Irvine, 2000.'],
  ['ref', 'HANSEN, M. C. et al. High-resolution global maps of 21st-century forest cover change. **Science**, v. 342, n. 6160, p. 850-853, 2013.'],
  ['ref', 'KLEPPMANN, M. **Designing data-intensive applications**. Sebastopol: O’Reilly Media, 2017.'],
  ['ref', 'LEAFLET. **Leaflet documentation**. Disponível em: https://leafletjs.com/reference.html. Acesso em: 1 nov. 2026.'],
  ['ref', 'MARCOTTE, E. **Responsive web design**. New York: A Book Apart, 2011.'],
  ['ref', 'MDN WEB DOCS. **Geolocation API**. 2026a. Disponível em: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API. Acesso em: 1 nov. 2026.'],
  ['ref', 'MDN WEB DOCS. **Using Fetch**. 2026b. Disponível em: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch. Acesso em: 1 nov. 2026.'],
  ['ref', 'NEWMAN, S. **Building microservices**: designing fine-grained systems. 2. ed. Sebastopol: O’Reilly Media, 2021.'],
  ['ref', 'OPEN-METEO. **Open-Meteo API documentation**. Disponível em: https://open-meteo.com/en/docs. Acesso em: 1 nov. 2026.'],
  ['ref', 'OPENJS FOUNDATION. **Node.js documentation**. Disponível em: https://nodejs.org/docs/latest/api/. Acesso em: 1 nov. 2026.'],
  ['ref', 'OPENJS FOUNDATION. **Express**: fast, unopinionated, minimalist web framework for Node.js. Disponível em: https://expressjs.com/. Acesso em: 1 nov. 2026.'],
  ['ref', 'OPENSTREETMAP WIKI. **Overpass API**. Disponível em: https://wiki.openstreetmap.org/wiki/Overpass_API. Acesso em: 1 nov. 2026.'],
  ['ref', 'REDIS. **Redis Pub/Sub**. Disponível em: https://redis.io/docs/latest/develop/interact/pubsub/. Acesso em: 1 nov. 2026.'],
  ['ref', 'RICHARDSON, C. **Microservices patterns**: with examples in Java. Shelter Island: Manning, 2018.'],
  ['ref', 'TANENBAUM, A. S.; VAN STEEN, M. **Sistemas distribuídos**: princípios e paradigmas. 2. ed. São Paulo: Pearson Prentice Hall, 2007.'],
  ['ref', 'TOMTOM. **Traffic API documentation**. Disponível em: https://developer.tomtom.com/traffic-api/documentation. Acesso em: 1 nov. 2026.'],
  ['ref', 'W3C. **Mobile Web Application Best Practices**. W3C Recommendation, 14 dez. 2010. Disponível em: https://www.w3.org/TR/mwabp/. Acesso em: 1 nov. 2026.'],
  ['ref', 'WORLD HEALTH ORGANIZATION. **WHO global air quality guidelines**: particulate matter (PM2.5 and PM10), ozone, nitrogen dioxide, sulfur dioxide and carbon monoxide. Geneva: WHO, 2021.'],
];

module.exports = { capa, secoes };
