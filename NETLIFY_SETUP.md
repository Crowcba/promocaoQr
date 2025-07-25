# Configuração do Netlify para SQL Server

## Variáveis de Ambiente Necessárias

Para configurar o Netlify corretamente para usar SQL Server ao invés do Supabase, siga estas instruções:

### 1. Acesse o Painel do Netlify

1. Vá para [netlify.com](https://netlify.com) e faça login
2. Selecione seu site `promocaoqr`
3. Vá para **Site Settings** > **Environment Variables**

### 2. Configure as Variáveis de Ambiente

Adicione as seguintes variáveis:

| Nome da Variável | Valor | Descrição |
|------------------|-------|-----------|
| `NODE_ENV` | `production` | Ambiente de produção |
| `DB_TYPE` | `sqlserver` | Tipo de banco de dados |

### 3. Remova Variáveis do Supabase (se existirem)

Se houver variáveis relacionadas ao Supabase, remova-as:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Qualquer outra variável que comece com `SUPABASE_`

### 4. Verifique as Configurações de Build

No painel do Netlify, vá para **Site Settings** > **Build & Deploy** e verifique:

- **Build command**: Deve estar vazio (usando o padrão)
- **Publish directory**: Deve ser `.` (raiz do projeto)
- **Functions directory**: Deve ser `api/`

### 5. Redeploy

Após configurar as variáveis:

1. Vá para **Deploys**
2. Clique em **Trigger deploy** > **Deploy site**
3. Aguarde o deploy ser concluído

### 6. Verificação

Após o deploy, teste:

1. **Health Check**: `https://promocaoqr.netlify.app/api/health`
2. **Validação de Código**: Use um QR code válido

## Problemas Comuns

### Erro 500
- Verifique se as variáveis de ambiente estão configuradas corretamente
- Verifique os logs da função no painel do Netlify

### Erro de Conexão com Banco
- Verifique se o IP do Netlify não está bloqueado pelo firewall do SQL Server
- Verifique se as credenciais no `dbConfig.js` estão corretas

### Build Falha
- Verifique se o `package.json` na pasta `api/` existe e está correto
- Verifique se todas as dependências estão listadas 