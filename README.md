# ULTRON

Um rosto de IA em 3D — crânio metálico, olhos vermelhos incandescentes, mandíbula que se move quando ele fala — com quem você conversa por voz ou texto. O cérebro é o Claude (Anthropic); a voz é grave, metálica e com reverb.

## Como rodar

Precisa do **Node.js 22+**.

```bash
npm install
cp .env.example .env      # e coloque sua ANTHROPIC_API_KEY
npm start
```

Abra **http://localhost:3000** no **Chrome ou Edge** (são os navegadores com reconhecimento de voz), clique em **DESPERTAR** e permita o microfone.

## Como usar

- **Mãos livres** (ligado por padrão): você fala, ele responde e volta a ouvir sozinho. É uma conversa contínua.
- **Botão do microfone**: fala uma vez. Se clicar enquanto ele fala, ele é interrompido.
- **Campo de texto**: digite e aperte Enter.
- **Histórico**: botão no canto superior direito.
- A cabeça segue o mouse.

## A voz

| Configuração | Resultado |
|---|---|
| Só `ANTHROPIC_API_KEY` | Voz do navegador em pt-BR, no tom mais grave que ele permite, com um ronco sub-grave sintetizado por baixo. |
| + `ELEVENLABS_API_KEY` | **Recomendado.** Voz neural masculina grave, rebaixada de tom e passada por modulação em anel (timbre metálico), saturação e reverb de catedral. Bem mais aterrorizante. |

Para trocar a voz da ElevenLabs, coloque outro `ELEVENLABS_VOICE_ID` no `.env`. Os efeitos ficam em `public/voice.js` (`playbackRate` = quão grave; `carrier.frequency` e `ringMix` = quão robótico; `wet` = quanto reverb).

## Estrutura

```
server.js         servidor HTTP: serve o app, faz streaming das respostas do Claude e da voz neural
public/face.js    rosto 3D (Three.js): crânio esculpido, mandíbula articulada, olhos, bloom
public/voice.js   síntese de voz e cadeia de efeitos (Web Audio)
public/app.js     conversa: microfone, streaming, legendas, estados
```

A personalidade está no `SYSTEM_PROMPT` em `server.js` — é só editar para mudar o jeito dele.
