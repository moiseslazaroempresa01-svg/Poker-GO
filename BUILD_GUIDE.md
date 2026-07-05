# Poker Trainer AI Mobile — Guia de Build (mobile-only, sem PC)

## Objetivo
Gerar um APK Android instalável, usando **só o celular** e **serviços gratuitos**.

## Pré-requisitos
- Uma conta grátis no [expo.dev](https://expo.dev) (login com GitHub/Google)
- Este projeto já pushado no GitHub (via botão "Save to GitHub" do Emergent)

## Passo a passo

### 1. Faça o push do código pro GitHub
No Emergent (do celular ou desktop):
1. Clique em **"Save to GitHub"** (canto superior direito da interface)
2. Autorize o GitHub e escolha o repositório que você criou
3. Faça o push da branch `main`

### 2. Conecte o repositório no Expo
No navegador do celular, abra [expo.dev](https://expo.dev):
1. Faça login (Google/GitHub)
2. Menu → **"Projects" → "Create a project"**
3. **"Import from GitHub"** → autorize o GitHub → escolha o repo
4. **IMPORTANTE**: em "Root directory" digite `/frontend` (nosso app Expo está lá)
5. Salve o projeto

### 3. Rode o primeiro build
No dashboard do projeto no expo.dev:
1. Aba **"Builds"** → **"Create build"**
2. **Platform**: `Android`
3. **Build profile**: `preview` (gera APK direto, sem precisar de Play Store)
4. Clique em **"Build"**
5. Aguarde 15-20 minutos (roda tudo na nuvem grátis do Expo)

### 4. Baixe e instale o APK
Quando o build ficar verde:
1. Aparece o botão **"Install"** ou **"Download APK"** direto no navegador
2. Baixe o arquivo `.apk`
3. Abra o arquivo no celular (talvez precise permitir "Instalar apps de fontes desconhecidas" nas Configurações)
4. App instalado ✅

### 5. Configurar o backend (importante!)
O APK precisa saber onde está a API. Duas opções:

**a) Manter o backend hospedado no Emergent (mais fácil)**
- O `EXPO_PUBLIC_BACKEND_URL` já aponta pro seu preview do Emergent
- Enquanto o preview estiver ativo, o app funciona
- Se você publicar via botão "Publish", vira uma URL permanente (usa créditos)

**b) Hospedar o backend em outro lugar**
- Edite `/frontend/.env` → altere `EXPO_PUBLIC_BACKEND_URL` pra sua URL
- Faça novo push no GitHub
- Rode novo build no expo.dev

## Perfis disponíveis (`eas.json`)

- **`preview`** → APK Android pra instalação direta (RECOMENDADO)
- **`production`** → AAB pra Google Play Store (precisa de conta de dev, US$25 uma vez)
- **`development`** → APK com Dev Client pra debug (ignore por enquanto)

## Troubleshooting

**"Root directory not found"** no expo.dev
→ Certifique-se de que colocou `/frontend` como root directory nas configurações do projeto.

**"Build failed: nitro-screen-recorder version conflict"**
→ Não deveria acontecer, mas se der: no expo.dev → Configuration → clear cache → rebuild.

**"App abre e trava/tela branca"**
→ Verifique se o `EXPO_PUBLIC_BACKEND_URL` no `.env` está apontando pra um backend acessível.

**"Modo Tela" ainda mostra "indisponível" no APK**
→ Não deveria acontecer no APK. Se acontecer, é porque o build não incluiu o módulo nativo — abra issue.

**MediaProjection permission dialog pede toda vez que aperta "Capturar"**
→ Isso é comportamento normal do Android. Não tem como pular.

## Custos
- Expo Free tier: **30 builds Android grátis / mês**. Mais que suficiente pra desenvolvimento.
- GitHub: grátis pra repos públicos e privados.
- MongoDB: seu backend usa MongoDB local no Emergent. Se hospedar backend fora, use MongoDB Atlas Free (512MB).

## Contato
Se der ruim, volta no Emergent e me chama. Boa sorte! 🚀
