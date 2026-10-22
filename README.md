# ULTRON

Seu assistente pessoal de voz. Ele aparece como uma orbe de luz que muda de cor quando ouve, pensa e fala. Você conversa com ele falando, como numa ligação, e ele responde em voz alta. Ele também faz coisas no computador: abre sites e programas, pesquisa no Google, controla a música e o volume, e bloqueia a tela.

## Instalar no Windows (sem programar)

1. No GitHub, clique no botão verde **Code** e depois em **Download ZIP**. Extraia o ZIP numa pasta, por exemplo em `Documentos\Ultron`.
2. Dentro da pasta, clique duas vezes em **`instalar.bat`**. Ele vai:
   - pedir para instalar o **Node.js** se ainda não tiver (é grátis; depois de instalar, rode o `instalar.bat` de novo);
   - abrir a página do **Google AI Studio** para você criar uma chave grátis do Gemini (entre com sua conta Google, clique em *Create API key*, copie e cole na janela do instalador);
   - criar um atalho **Ultron** na Área de Trabalho;
   - perguntar se você quer que ele **abra sozinho quando ligar o computador**.
3. Na primeira vez, o Edge pede para usar o microfone. Clique em **Permitir**.

Pronto. Ao ligar o PC, ele abre e diz "Bom dia, Otávio". Se o navegador ainda segurar o som, aparece o botão **Despertar**. Clique nele uma vez.

## Como usar

- **Mãos livres** (ligado por padrão): você fala, ele responde e volta a ouvir sozinho.
- **Botão do microfone**: fala uma vez. Clicar enquanto ele fala interrompe.
- **Campo de texto**: digite e aperte Enter.
- Exemplos: "abre o YouTube", "pesquisa a previsão do tempo de amanhã", "abre o Spotify", "aumenta o volume", "pausa a música", "bloqueia o computador".

## O cérebro

| Chave no `.env` | Resultado |
|---|---|
| `GEMINI_API_KEY` | **Grátis.** Gemini do Google, com limite de uso por dia. Se um modelo estiver sobrecarregado, ele troca sozinho por outro. |
| `ANTHROPIC_API_KEY` | Pago por uso. Claude, mais inteligente. Se estiver preenchida, ela é usada no lugar do Gemini. |

## A voz

Por padrão, o Ultron fala com as vozes neurais da Microsoft (as mesmas do "Ler em voz alta" do Edge), que são grátis e soam humanas. Para trocar de voz, coloque `ULTRON_VOICE` no `.env` (por exemplo `pt-BR-FranciscaNeural`). Esse serviço não é oficial: se ele cair, o Ultron usa a voz do navegador até voltar. Para uma voz ainda mais realista, coloque uma `ELEVENLABS_API_KEY` (a ElevenLabs tem plano grátis com limite).

## Microfone

Qualquer microfone funciona: o do headset, o de uma webcam, ou o embutido de um notebook. Com **Mãos livres** ligado você não precisa clicar em nada. Ele escuta, responde e volta a escutar. Sem fone, ele para de ouvir enquanto fala, para não escutar a própria voz.

## Para quem programa

```bash
npm install
cp .env.example .env      # coloque GEMINI_API_KEY ou ANTHROPIC_API_KEY
npm start                 # http://localhost:3000
```

```
server.js         servidor HTTP: serve o app, faz streaming das respostas e da voz neural
brain.js          cérebro (Claude ou Gemini), personalidade e o laço de ferramentas
speech.js         voz gerada no servidor (Microsoft neural grátis ou ElevenLabs)
tools.js          ações no computador; para incluir um programa, edite PROGRAMAS
public/orb.js     orbe animada (WebGL puro, sem dependências)
public/voice.js   toca a voz (do servidor ou do navegador) e mede o volume para a orbe
public/app.js     conversa: microfone, streaming, legendas, estados, início automático
Ultron.vbs        abre o servidor escondido e a janela do Ultron no Edge (Windows)
windows/          instalador para Windows
```

A personalidade está no `SYSTEM_PROMPT` em `brain.js`.
