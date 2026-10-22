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

## Como usar

- **Diga "Jarvis"** e o pedido, numa frase só: "Jarvis, abre o YouTube". Ou só "Jarvis" (ou "ativar Jarvis"), espere o bipe e fale.
- Depois que ele responde, você tem uns 20 segundos para continuar a conversa sem repetir o nome. Passado esse tempo, ou se você disser "obrigado, Jarvis" ou "pode descansar", ele volta a esperar o nome (bipe de descida).
- Fora disso, ele ignora o que ouve: conversa no ambiente, TV, música.
- **"Jarvis, desativar"** (ou "modo silencioso", "para de me ouvir"): ele para de reagir a tudo, até ao nome, e só volta quando você diz **"ativar Jarvis"** (ou clica no núcleo).
- **"Jarvis, desligar"** (ou "fechar o Jarvis"): fecha a janela e o Jarvis de vez. Para abrir de novo, use o atalho.
- **Minimizado ele continua ouvindo.** Só não feche a janela. "Jarvis, se esconde" minimiza; "Jarvis, aparece" traz de volta. **F11** sai da tela cheia.
- **"Jarvis, para"** (ou "chega", "já entendi", "para de falar") enquanto ele fala: corta a fala na hora. Sem o nome também funciona, desde que a palavra não esteja na frase que ele está dizendo; com o nome é garantido.
- **Clicar no reator** também chama. Clicar enquanto ele fala corta a fala.
- **Chat** (canto superior direito): mostra a conversa escrita e um campo para digitar. Fica escondido por padrão.
- Exemplos: "abre o YouTube", "fecha o Discord", "toca lofi na Alexa", "LED azul", "modo game", "abre o Telegram", "pesquisa a previsão do tempo de amanhã", "aumenta o volume", "pausa a música", "bloqueia o computador".

## Modos (trabalho, game...)

No botão **Modos** (canto superior direito) você cria seus próprios modos sem programar: dê um nome (por exemplo `trabalho`), adicione o que ele deve fazer (abrir um site, abrir qualquer programa instalado, fechar um programa) e clique em **Salvar modo**. Depois é só dizer "Jarvis, modo trabalho". O botão **Testar** roda o modo na hora. Os modos ficam salvos no arquivo `modos.json` da pasta e não se perdem quando você atualiza o Jarvis.

Ele também abre qualquer programa do menu Iniciar pelo nome: "Jarvis, abre o Photoshop".

## Spotify (no PC ou na Alexa)

Com Spotify **Premium**, o Jarvis toca músicas, artistas e playlists e controla o player: "Jarvis, toca Back in Black", "Jarvis, toca lofi na Alexa", "Jarvis, passa a música para o PC", "Jarvis, volume 30". A caixinha Echo da Alexa aparece no Spotify como um aparelho, então ele toca nela também. Para ligar, abra **Modos** e siga os 5 passos do quadro Spotify (criar um app grátis no painel de desenvolvedor do Spotify, colar o Client ID e clicar em Conectar). A conexão fica salva em `spotify.json`.

## LED do PC (ASUS Aura / Armoury Crate)

Com o Armoury Crate instalado (com o Aura), o Jarvis muda a cor dos LEDs ligados à placa-mãe ASUS (os do gabinete, fans, fitas): "Jarvis, LED azul", "Jarvis, apaga o LED", "Jarvis, devolve o LED" (volta ao efeito que estava no Armoury Crate). Dá para colocar a cor do LED num modo, por exemplo o modo game acendendo vermelho. Isso usa o kit do Aura que o próprio Armoury Crate instala; se ele não estiver lá, o Jarvis avisa e diz o motivo. Quando dá certo, ele diz quantos aparelhos e luzes mudou.

Se a cor não mudar:
- Veja se o próprio Armoury Crate (aba Aura Sync) consegue mudar a cor do gabinete. Se nem ele consegue, o Jarvis também não.
- No Windows 11, a **Iluminação Dinâmica** pode tomar o controle dos LEDs: em Configurações > Personalização > Iluminação dinâmica, desligue "Usar a Iluminação Dinâmica nos meus dispositivos" (ou coloque o Armoury Crate em primeiro na lista).
- Não precisa abrir o Aura Creator: ele é só para criar efeitos.

## A rotina de quando o PC liga

Quando o Jarvis abre junto com o Windows, ele segue o arquivo `rotina.txt` da pasta dele (criado na primeira vez a partir do `rotina.exemplo.txt`). Abra no Bloco de Notas: cada linha é uma ação, como `fechar discord`, `abrir youtube.com`, `abrir whatsapp` ou `modo trabalho`. Linhas com `#` no começo ficam desligadas. Por padrão ele só fecha o Discord.

## O cérebro

| Chave no `.env` | Resultado |
|---|---|
| `GROQ_API_KEY` | **Grátis e recomendado.** Usa a Kimi K2 (IA chinesa da Moonshot) e responde em menos de um segundo. Se ela bater no limite grátis do dia, passa sozinho para a GPT-OSS. |
| `GEMINI_API_KEY` | Grátis, porém mais lento. |
| `ANTHROPIC_API_KEY` | Pago por uso. Claude, o mais inteligente. Se estiver preenchida, ela é usada no lugar das outras. |

## A voz

Por padrão, o Jarvis fala com as vozes neurais da Microsoft (as mesmas do "Ler em voz alta" do Edge), que são grátis e soam humanas. Para trocar de voz, coloque `JARVIS_VOICE` no `.env` (por exemplo `pt-BR-FranciscaNeural`). Esse serviço não é oficial: se ele cair, o Jarvis usa a voz do navegador até voltar. Para uma voz ainda mais realista, coloque uma `ELEVENLABS_API_KEY`. O plano grátis da ElevenLabs dá uns 20 minutos de fala por mês; quando acabar, o Jarvis volta sozinho para a voz da Microsoft. A voz da ElevenLabs é escolhida com `JARVIS_VOZ`: `daniel` (britânico e sério, o padrão, o mais perto do mordomo do filme), `george`, `brian`, `alice` ou `lily` (estas duas femininas). O instalador pergunta qual você quer. No canto superior esquerdo da tela aparece qual cérebro e qual voz estão em uso. Se a ElevenLabs recusar (chave sem permissão de Text to Speech, créditos acabados, conta bloqueada), o Jarvis mostra o motivo na tela e fala com a voz reserva.

## Microfone

Qualquer microfone funciona: o do headset, o de uma webcam, ou o embutido de um notebook. O reconhecimento de voz é o do próprio Edge (serviço da Microsoft), então o microfone fica aberto o tempo todo enquanto o Jarvis estiver rodando, mas ele só age quando ouve o nome dele. Enquanto fala, ele só aceita "para", para não obedecer à própria voz saindo na caixa de som.

No botão **Áudio** (canto superior direito) dá para escolher, só para o Jarvis, o microfone (por exemplo o do headset) e por onde sai a voz dele (por exemplo a soundbar), sem mexer no som do Windows. A escolha fica salva. Se o Edge for antigo e não aceitar o microfone escolhido, ele usa o microfone padrão do Windows. A voz reserva do navegador (a que só aparece quando as outras falham) sempre sai no som padrão do Windows.

## Para quem programa

```bash
npm install
cp .env.example .env      # coloque GROQ_API_KEY (ou GEMINI_API_KEY / ANTHROPIC_API_KEY)
npm start                 # http://127.0.0.1:3000
```

```
server.js         servidor HTTP: serve o app, faz streaming das respostas e da voz neural
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
