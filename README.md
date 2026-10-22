# JARVIS

Seu assistente pessoal de voz, no estilo do Jarvis dos filmes. Ele aparece como uma interface holográfica laranja em 3D: anéis que giram em planos diferentes, aceleram quando ele pensa e se separam e voltam a se encaixar no ritmo da voz quando ele fala. Você chama dizendo "Jarvis", ele responde em voz alta, e funciona mesmo com a janela minimizada. Ele também faz coisas no computador: abre e fecha programas, abre sites, pesquisa no Google, controla a música e o volume, e bloqueia a tela.

## Instalar no Windows (sem programar)

1. No GitHub, clique no botão verde **Code** e depois em **Download ZIP**. Extraia o ZIP numa pasta, por exemplo em `Documentos\Jarvis`.
2. Dentro da pasta, clique duas vezes em **`instalar.bat`**. Ele vai:
   - pedir para instalar o **Node.js** se ainda não tiver (é grátis; depois de instalar, rode o `instalar.bat` de novo);
   - abrir a página do **Groq** para você criar uma chave grátis (entre com sua conta Google, clique em *Create API Key*, copie e cole na janela do instalador);
   - perguntar se você quer a voz mais realista da **ElevenLabs** (opcional, plano grátis com limite) e qual voz usar;
   - criar um atalho **Jarvis** na Área de Trabalho;
   - perguntar se você quer que ele **abra sozinho quando ligar o computador**.
3. Na primeira vez, o Edge pede para usar o microfone. Clique em **Permitir**.

Pronto. Ao ligar o PC, ele abre em tela cheia, diz "Bom dia, senhor" e roda a sua rotina. Se o navegador ainda segurar o som, aparece o botão **Despertar**. Clique nele uma vez.

### Atualizações e seus dados

Você só baixa o ZIP uma vez. Toda vez que o Jarvis abre pelo atalho, ele confere se tem versão nova no GitHub e, se tiver, se atualiza sozinho antes de abrir (e avisa na tela). Sem internet, ele só abre a versão que já tem. Para pegar uma atualização na hora, diga "Jarvis, desligar" e abra pelo atalho de novo.

Suas coisas (chaves, modos, conexão do Spotify e a rotina) ficam numa pasta separada, `%APPDATA%\Jarvis` (cole isso na barra do Explorador de Arquivos para abrir). As atualizações nunca mexem nela. Se você já tinha extraído o Jarvis em outra pasta antes, o `instalar.bat` procura essas cópias antigas (em Downloads, Área de Trabalho e Documentos) e traz os modos, o Spotify e as chaves que achar.

## Como usar

- **Diga "Jarvis"** e o pedido, numa frase só: "Jarvis, abre o YouTube". Ou só "Jarvis" (ou "ativar Jarvis"), espere o bipe e fale.
- Depois que ele responde, você tem uns 20 segundos para continuar a conversa sem repetir o nome. Passado esse tempo, ou se você disser "obrigado, Jarvis" ou "pode descansar", ele volta a esperar o nome (bipe de descida).
- Fora disso, ele ignora o que ouve: conversa no ambiente, TV, música.
- **"Jarvis, desativar"** (ou "modo silencioso", "para de me ouvir"): ele para de reagir a tudo, até ao nome, e só volta quando você diz **"ativar Jarvis"** (ou clica no núcleo).
- **"Jarvis, desligar"** (ou "fechar o Jarvis"): fecha a janela e o Jarvis de vez. Para abrir de novo, use o atalho.
- **Janelas de qualquer programa:** "Jarvis, minimiza o bloco de notas", "maximiza o Chrome", "traz o WhatsApp para a frente", "fecha o AdsPower" (se o programa perguntar "deseja sair?", ele encerra de vez), "passa o bloco de notas para o monitor 1" (o 1 é o principal), "minimiza tudo". Vale o nome do programa ou um pedaço do título da janela, como "fecha o YouTube".
- **Escrever:** "Jarvis, escreve meu nome" escreve na janela que está na frente (ou "escreve ... no bloco de notas"). Para ditar um texto longo, diga **"Jarvis, modo ditado"** (ou "escreve o que eu falar"): tudo que você falar vai sendo escrito, sem precisar dizer "Jarvis". Fale "vírgula", "ponto final", "interrogação", "nova linha" ou "novo parágrafo" para pontuar. Para parar, **"Jarvis, parar ditado"**.
- **Minimizado ele continua ouvindo.** Só não feche a janela. "Jarvis, se esconde" minimiza; "Jarvis, aparece" traz de volta. **F11** sai da tela cheia.
- **"Jarvis, para"** (ou "chega", "já entendi", "para de falar") enquanto ele fala: corta a fala na hora. Sem o nome também funciona, desde que a palavra não esteja na frase que ele está dizendo; com o nome é garantido.
- **Modo Ultron:** "Jarvis, virar Ultron" (ou "modo fúria"). A tela e a orbe ficam vermelhas e instáveis, a voz fica grave e metálica e ele responde com outra personalidade: frio, intenso, mas ainda faz tudo que o Jarvis faz. Nesse modo ele também atende por "Ultron". Para voltar: **"Ultron, voltar ao normal"** (ou "modo Jarvis"). Ele lembra o modo quando você abre de novo.
- **Clicar no reator** também chama. Clicar enquanto ele fala corta a fala.
- **Chat** (canto superior direito): mostra a conversa escrita e um campo para digitar. Fica escondido por padrão.
- Exemplos: "abre o YouTube", "fecha o Discord", "toca lofi na Alexa", "LED azul", "modo game", "abre o Telegram", "pesquisa a previsão do tempo de amanhã", "aumenta o volume", "pausa a música", "bloqueia o computador".

## Modos (trabalho, game...)

No botão **Modos** (canto superior direito) você cria seus próprios modos sem programar: dê um nome (por exemplo `trabalho`), adicione o que ele deve fazer (abrir um site, abrir qualquer programa instalado, fechar um programa) e clique em **Salvar modo**. Depois é só dizer "Jarvis, modo trabalho". O botão **Testar** roda o modo na hora. Os modos ficam salvos em `%APPDATA%\Jarvis\modos.json` e não se perdem quando o Jarvis se atualiza.

Ele também abre qualquer programa do menu Iniciar pelo nome: "Jarvis, abre o Photoshop".

## Spotify (no PC ou na Alexa)

Com Spotify **Premium**, o Jarvis toca músicas, artistas e playlists e controla o player: "Jarvis, toca Back in Black", "Jarvis, toca lofi na Alexa", "Jarvis, passa a música para o PC", "Jarvis, volume 30". A caixinha Echo da Alexa aparece no Spotify como um aparelho, então ele toca nela também. Para ligar, abra **Modos** e siga os 5 passos do quadro Spotify (criar um app grátis no painel de desenvolvedor do Spotify, colar o Client ID e clicar em Conectar). A conexão fica salva em `%APPDATA%\Jarvis\spotify.json`.

## LED do PC (ASUS Aura / Armoury Crate)

Com o Armoury Crate instalado (com o Aura), o Jarvis muda a cor dos LEDs ligados à placa-mãe ASUS (os do gabinete, fans, fitas): "Jarvis, LED azul", "Jarvis, apaga o LED", "Jarvis, devolve o LED" (volta ao efeito que estava no Armoury Crate). Dá para colocar a cor do LED num modo, por exemplo o modo game acendendo vermelho. Isso usa o kit do Aura que o próprio Armoury Crate instala; se ele não estiver lá, o Jarvis avisa e diz o motivo. Quando dá certo, ele diz quantos aparelhos e luzes mudou.

Se a cor não mudar:
- Veja se o próprio Armoury Crate (aba Aura Sync) consegue mudar a cor do gabinete. Se nem ele consegue, o Jarvis também não.
- No Windows 11, a **Iluminação Dinâmica** pode tomar o controle dos LEDs: em Configurações > Personalização > Iluminação dinâmica, desligue "Usar a Iluminação Dinâmica nos meus dispositivos" (ou coloque o Armoury Crate em primeiro na lista).
- Não precisa abrir o Aura Creator: ele é só para criar efeitos.
- Rode o **Diagnóstico** (em Ajustes): a linha "LED (Aura)" diz quantos aparelhos e luzes o kit do Aura enxerga. Se der 0, o Armoury Crate não está expondo os fans para outros programas.

## A rotina de quando o PC liga

Quando o Jarvis abre junto com o Windows, ele segue o arquivo `rotina.txt` da pasta `%APPDATA%\Jarvis` (criado na primeira vez a partir do `rotina.exemplo.txt`). Abra no Bloco de Notas: cada linha é uma ação, como `fechar discord`, `abrir youtube.com`, `abrir whatsapp` ou `modo trabalho`. Linhas com `#` no começo ficam desligadas. Por padrão ele só fecha o Discord.

## O cérebro

| Chave no `.env` | Resultado |
|---|---|
| `GROQ_API_KEY` | **Grátis e recomendado.** Usa a Kimi K2 (IA chinesa da Moonshot) e responde em menos de um segundo. Se ela bater no limite grátis do dia, passa sozinho para a GPT-OSS. |
| `GEMINI_API_KEY` | Grátis, porém mais lento. |
| `ANTHROPIC_API_KEY` | Pago por uso. Claude, o mais inteligente. Se estiver preenchida, ela é usada no lugar das outras. |

## Ajustes e diagnóstico

No botão **Ajustes** (canto superior direito):
- **Rodar diagnóstico** testa a versão do Jarvis (avisa se falta atualizar), a internet, o cérebro, cada voz, o Spotify, as janelas e monitores que ele enxerga e o LED, e mostra em português o que falhou e por quê (internet lenta, antivírus interceptando a conexão, chave recusada...). Se algo der errado, é a primeira coisa a olhar.
- **Chaves e voz**: cole uma chave nova (Groq, ElevenLabs, Azure) ou troque a voz da ElevenLabs sem abrir arquivo nenhum. Ao salvar, o Jarvis reinicia sozinho.
- **Som**: por onde sai a voz dele.

Se o antivírus vigia conexões HTTPS (Kaspersky, Avast, ESET e outros fazem isso), o Jarvis usa os certificados do Windows para não ser bloqueado. Se o Windows usa um proxy, o Jarvis usa o mesmo.

## A voz

Por padrão, o Jarvis fala com as vozes neurais da Microsoft (as mesmas do "Ler em voz alta" do Edge), que são grátis e soam humanas. Para trocar de voz, coloque `JARVIS_VOICE` no `.env` (por exemplo `pt-BR-FranciscaNeural`). Esse serviço não é oficial: se ele cair, o Jarvis usa a voz do navegador até voltar. Para uma voz ainda mais realista, coloque uma `ELEVENLABS_API_KEY`. O plano grátis da ElevenLabs dá uns 20 minutos de fala por mês; quando acabar, o Jarvis volta sozinho para a voz da Microsoft. A voz da ElevenLabs é escolhida com `JARVIS_VOZ`: `daniel` (britânico e sério, o padrão, o mais perto do mordomo do filme), `george`, `brian`, `alice` ou `lily` (estas duas femininas). O instalador pergunta qual você quer. No canto superior esquerdo da tela aparece qual cérebro e qual voz estão em uso. Se a ElevenLabs recusar (chave sem permissão de Text to Speech, créditos acabados, conta bloqueada), o Jarvis mostra o motivo na tela e fala com a voz reserva.

Frases curtas que ele fala muito ("Feito, senhor.", o bom-dia) ficam guardadas no PC depois da primeira vez, então saem na hora e com a mesma voz mesmo com a internet lenta. No modo Ultron ele usa outra voz da ElevenLabs (Callum, grave e rouca; troque com `ULTRON_VOICE_ID` no `.env`) com um efeito metálico feito no próprio PC; sem ElevenLabs, usa a voz da Microsoft mais grave.

Ordem das vozes: ElevenLabs (se tiver chave) → **Azure Speech** (se tiver chave) → Microsoft grátis → voz do navegador. A Azure é a voz oficial da Microsoft: o plano grátis (F0) dá 500 mil caracteres por mês, umas 9 horas de fala, e não cai como o serviço não oficial. Para usar, crie um recurso **Speech** no plano **Free F0** em [portal.azure.com](https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices) (pede cartão só para confirmar a conta; o F0 não cobra) e cole a "Chave 1" e a região em Ajustes.

## Microfone

Qualquer microfone funciona: o do headset, o de uma webcam, ou o embutido de um notebook. O reconhecimento de voz é o do próprio Edge (serviço da Microsoft), então o microfone fica aberto o tempo todo enquanto o Jarvis estiver rodando, mas ele só age quando ouve o nome dele. Enquanto fala, ele só aceita "para", para não obedecer à própria voz saindo na caixa de som.

No botão **Ajustes** (canto superior direito) dá para escolher, só para o Jarvis, por onde sai a voz dele (por exemplo a soundbar), sem mexer no som do Windows. A escolha fica salva. A voz reserva do navegador (a que só aparece quando as outras falham, por exemplo com a internet ruim) sempre sai no som padrão do Windows.

O microfone não dá para escolher dentro do Jarvis: o reconhecimento de voz do Edge sempre usa o microfone padrão do Windows. Para usar o do headset, vá em Configurações > Sistema > Som > **Entrada** e escolha o headset. Isso muda só o microfone; o som continua saindo onde já estava.

## Para quem programa

```bash
npm install
cp .env.example .env      # coloque GROQ_API_KEY (ou GEMINI_API_KEY / ANTHROPIC_API_KEY)
npm start                 # http://127.0.0.1:3000
```

Na primeira vez, o `.env` da pasta é copiado para a pasta de dados (`%APPDATA%\Jarvis` no Windows, `~/.jarvis` nos outros; `JARVIS_DADOS` muda isso), e de lá em diante vale o de lá. O `atualizar.js` não faz nada numa pasta com `.git`.

```
server.js         servidor HTTP: serve o app, faz streaming das respostas e da voz neural
dados.js          pasta de dados do usuário (.env, modos, Spotify, rotina) fora da pasta do programa
atualizar.js      atualização automática pelo GitHub, rodada pelo atalho antes de abrir
rede.js           ajustes de conexão para redes lentas e motivo das falhas em português
diagnostico.js    botão Rodar diagnóstico (testa internet, cérebro, vozes e Spotify)
chaves.js         trocar chaves pela tela Ajustes e reiniciar o servidor
brain.js          cérebro (Claude, Groq ou Gemini), personalidade e o laço de ferramentas
speech.js         voz gerada no servidor (Microsoft neural grátis ou ElevenLabs)
tools.js          ações no computador; para incluir um programa, edite PROGRAMAS e FECHAVEIS
rotina.js         rotina de quando o PC liga (lê rotina.txt)
modos.js          modos criados na tela Modos (salvos em modos.json)
apps.js           programas instalados no Windows (menu Iniciar)
spotify.js        Spotify: conexão (OAuth PKCE), tocar e controlar em qualquer aparelho
led.js            LED pelo ASUS Aura SDK (COM aura.sdk.1, via PowerShell)
public/orb.js     interface holográfica 3D animada (WebGL puro, sem dependências)
public/voice.js   toca a voz (do servidor ou do navegador) e mede o volume para a orbe
public/app.js     conversa: palavra "Jarvis", microfone, streaming, chat, estados, início automático
public/modos.js   tela Modos
windows.js        roda os scripts do PowerShell da pasta windows/
windows/          instalador e scripts do Windows (abrir.ps1 abre o servidor escondido e a
                  janela do Jarvis no Edge; os outros são as ações: janela, mídia, LED...)
```

A personalidade está no `SYSTEM_PROMPT` em `brain.js`.
