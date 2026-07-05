# Poker Trainer AI Mobile — PRD

## Visão
Assistente de treino Texas Hold'em em português brasileiro. Analisa
screenshots de simuladores de poker (imagem/câmera/tela) OU input manual e
recomenda a jogada ideal (Fold/Call/Raise/All-in) com voz TTS.

## Público-alvo
Jogadores de poker que treinam em simuladores offline e querem aprimorar
decisões com feedback instantâneo.

## Arquitetura
- **Frontend**: Expo Router (React Native) + expo-image-picker + expo-speech + expo-camera + AsyncStorage
- **Screen Capture nativo**: `react-native-nitro-screen-recorder` (MediaProjection API) + `expo-video-thumbnails` para extrair frames
- **Backend**: FastAPI + MongoDB + Claude Sonnet 4.5 (vision) via emergentintegrations
- **Motor de decisão local (offline)**: Chen formula preflop + Monte Carlo equity postflop

## Fluxos principais
1. **Onboarding**: Disclaimer obrigatório (uso apenas em simuladores offline) → salva flag no AsyncStorage
2. **Modo Ao Vivo (câmera)**: Aponta câmera do celular para simulador em outro dispositivo → captura periódica → `/api/analyze-image` → `/api/decide` → TTS
3. **Modo Tela (mesmo celular)**: Grava a própria tela via MediaProjection por N segundos → extrai último frame → `/api/analyze-image` → `/api/decide` → TTS. **Exige APK/dev-build, não roda em Expo Go.**
4. **Galeria (imagem única)**: Seleciona screenshot da galeria → `/api/analyze-image` → recomendação + TTS
5. **Manual**: Selector de cartas + posição + stacks/pote → `/api/decide` → recomendação + TTS
6. **Histórico**: Lista de análises salvas (MongoDB) com badge colorido por ação
7. **Ajustes**: Toggle TTS, perfil (Conservador/Equilibrado/Agressivo), reset disclaimer

## Endpoints
- `GET /api/` — health
- `POST /api/decide` — motor de decisão local
- `POST /api/analyze-image` — visão computacional via Claude Sonnet 4.5
- `POST/GET/DELETE /api/history` — CRUD de sessões

## Traduções
- FOLD → DESISTIR (vermelho)
- CALL → PAGAR (amarelo)
- RAISE → AUMENTAR (verde)
- ALL-IN → TUDO (âmbar/dourado)

## Status
- v1.1.0 — MVP + Modo Tela nativo (screen capture MediaProjection)
- v1.0.0 — MVP completo com backend testado (15/15 casos pytest passando)

## Limitações Conhecidas
- **Modo Tela só funciona após gerar APK/dev-build.** No Expo Go/web preview, mostra tela informativa com instruções.
- Cada ciclo de captura de tela dispara o diálogo MediaProjection do Android (pode incomodar se usado em loop rápido).
