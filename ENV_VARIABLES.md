# Variáveis de Ambiente - Projeto Promoção QR Code

## Configurações Necessárias

### Banco de Dados SQL Server
```bash
DB_USER=promocao_user
DB_PASSWORD=T3cN0!@#
DB_SERVER=201.71.178.65
DB_PORT=6565
DB_NAME=Aleatorio
```

### Ambiente
```bash
NODE_ENV=production
DB_TYPE=sqlserver
```

## Como Configurar

### 1. Netlify (Recomendado)
- Acesse o painel do Netlify
- Vá em **Site settings** > **Environment variables**
- Adicione cada variável acima

### 2. Arquivo .env (Desenvolvimento Local)
- Crie um arquivo `.env` na raiz do projeto
- Adicione as variáveis acima
- **IMPORTANTE**: Nunca commite o arquivo `.env` no Git

### 3. netlify.toml (Já configurado)
- As variáveis já estão configuradas no `netlify.toml`
- Funciona automaticamente no deploy

## Segurança

✅ **Credenciais protegidas** por variáveis de ambiente
✅ **Não expostas** no código fonte
✅ **Configuração flexível** por ambiente
✅ **Fácil manutenção** e atualização

## Backup de Segurança

As credenciais atuais estão como fallback no código para garantir que o sistema continue funcionando, mas é recomendado configurar as variáveis de ambiente no Netlify para maior segurança. 