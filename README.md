# Cert Practicus

Sistema para geração de certificados em lote com assinatura digital.

## Funcionalidades

- Upload de template PDF com campos de formulário
- Upload de planilha Excel com lista de participantes
- Seleção de certificado digital para assinatura
- Geração de certificados em lote usando Web Worker
- Barra de progresso em tempo real
- Download automático do arquivo ZIP com todos os certificados

## Tecnologias

- Angular 17
- TypeScript
- PDF-lib para manipulação de PDFs
- XLSX para leitura de planilhas
- @zip.js/zip.js para criação de arquivos ZIP
- Angular Material para interface
- Web Workers para processamento assíncrono

## Estrutura do Projeto

```
src/
├── app/
│   ├── pages/
│   │   └── certificate-form/          # Formulário principal
│   ├── services/
│   │   ├── certificates.service.ts    # Serviço principal
│   │   ├── certificate-worker.service.ts  # Gerenciador do Web Worker
│   │   └── cryptography/
│   │       └── pdf-signing.service.ts # Serviço de assinatura
│   └── workers/
│       └── certificate-generator.worker.ts # Web Worker para processamento
└── components/
    └── digital-certificate/           # Componente de seleção de certificado
```

## Como Usar

### 1. Template PDF
O template deve conter dois campos de formulário:
- `nomeParticipante`: campo para o nome do participante
- `localEData`: campo para local e data do evento

### 2. Planilha Excel
A planilha deve ter:
- Uma coluna com cabeçalho `nomeParticipante`
- Lista de nomes dos participantes

### 3. Certificado Digital
Selecione um certificado digital válido para assinar os PDFs.

### 4. Local e Data
Digite o local e data no formato: "São Paulo, 15 de dezembro de 2024."

### 5. Geração
Clique em "Gerar certificados" e acompanhe o progresso em tempo real.

## Web Worker

O sistema utiliza um Web Worker para processar a geração dos certificados de forma assíncrona, evitando o travamento da interface do usuário. O worker:

1. Preenche cada PDF com os dados do participante
2. Assina cada PDF com o certificado digital
3. Cria um arquivo ZIP com todos os certificados
4. Retorna o progresso em tempo real para a interface

## Desenvolvimento

```bash
# Instalar dependências
yarn install

# Executar em modo desenvolvimento
yarn start

# Build para produção
yarn build
```

## Configuração do Web Worker

O projeto está configurado para suportar Web Workers com:
- `tsconfig.worker.json`: configuração TypeScript específica para workers
- `angular.json`: configuração do Angular CLI para workers
- Suporte a módulos ES6 nos workers
