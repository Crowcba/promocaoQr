const express = require('express');
const sql = require('mssql');
const serverless = require('serverless-http');
const dbConfig = require('./dbConfig');

const app = express();
app.use(express.json());

// Configuração específica para Netlify
const netlifyConfig = {
    ...dbConfig,
    connectionTimeout: 30000,
    requestTimeout: 30000,
    pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool;

async function connectToDatabase() {
    if (pool && pool.connected) {
        console.log('Usando pool de conexão existente');
        return pool;
    }
    try {
        console.log('=== TENTATIVA DE CONEXÃO COM BANCO ===');
        console.log('Configuração do banco:', {
            server: netlifyConfig.server,
            port: netlifyConfig.port,
            database: netlifyConfig.database,
            user: netlifyConfig.user,
            connectionTimeout: netlifyConfig.connectionTimeout,
            requestTimeout: netlifyConfig.requestTimeout
        });
        
        console.log('Criando nova conexão...');
        pool = await new sql.ConnectionPool(netlifyConfig).connect();
        console.log('Conectado ao SQL Server com sucesso.');
        console.log('Pool criado:', pool.connected ? 'Conectado' : 'Desconectado');
        return pool;
    } catch (err) {
        console.error('=== ERRO NA CONEXÃO COM BANCO ===');
        console.error('Tipo do erro:', err.constructor.name);
        console.error('Mensagem do erro:', err.message);
        console.error('Stack trace:', err.stack);
        console.error('Código do erro:', err.code);
        console.error('Estado do erro:', err.state);
        console.error('Classe do erro:', err.class);
        console.error('Linha do erro:', err.lineNumber);
        console.error('Procedimento do erro:', err.procName);
        
        // Logs específicos para diferentes tipos de erro
        if (err.code === 'ECONNREFUSED') {
            console.error('ERRO: Conexão recusada pelo servidor');
        } else if (err.code === 'ETIMEDOUT') {
            console.error('ERRO: Timeout na conexão');
        } else if (err.code === 'ELOGIN') {
            console.error('ERRO: Falha na autenticação');
        } else if (err.code === 'EALREADYCONNECTED') {
            console.error('ERRO: Já existe uma conexão ativa');
        } else if (err.code === 'ENOTFOUND') {
            console.error('ERRO: Servidor não encontrado');
        }
        
        throw err;
    }
}

// Middleware para CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Rota de teste para verificar se a API está funcionando
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        message: 'API funcionando corretamente',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.post('/api/validate-code', async (req, res) => {
    console.log('=== INÍCIO DA REQUISIÇÃO /api/validate-code ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', req.headers);
    console.log('Body da requisição:', req.body);
    console.log('Content-Type:', req.get('Content-Type'));
    
    try {
        console.log('Tentando conectar ao banco de dados...');
        await connectToDatabase();
        console.log('Conexão com banco estabelecida com sucesso');
        
        const { promotor, code: codigo } = req.body;

        console.log('Dados extraídos:', { promotor, codigo });

        if (!promotor || !codigo) {
            console.log('Dados inválidos recebidos:', { promotor, codigo });
            return res.status(400).json({ 
                message: 'Promotor ou código não fornecido no formato correto.',
                received: { promotor, codigo }
            });
        }

        console.log('Validando código:', { promotor, codigo });

        const request = pool.request();
        console.log('Executando consulta SELECT...');
        
        // Verifica se o código já existe para evitar duplicatas
        let result = await request
            .input('codigo', sql.NVarChar, codigo)
            .query('SELECT * FROM promocoes WHERE codigo = @codigo');

        console.log('Resultado da consulta SELECT:', result.recordset);
        console.log('Número de registros encontrados:', result.recordset.length);

        if (result.recordset.length > 0) {
            // Se o código já existe, verifica se já foi clicado
            const record = result.recordset[0];
            console.log('Registro encontrado:', record);
            
            if (record.clicou) {
                console.log('Código já utilizado:', codigo);
                return res.status(200).json({ message: 'Este código já foi utilizado!' });
            } else {
                 // Atualiza o registro existente para marcar como clicado
                console.log('Atualizando registro existente...');
                await pool.request()
                    .input('codigo', sql.NVarChar, codigo)
                    .query('UPDATE promocoes SET clicou = 1 WHERE codigo = @codigo');
                console.log('Código atualizado com sucesso:', codigo);
                return res.status(200).json({ message: 'Código promocional validado e atualizado!' });
            }
        } else {
            // Se o código não existe, insere um novo registro
            console.log('Inserindo novo registro...');
            await pool.request()
                .input('promotor', sql.NVarChar, promotor)
                .input('codigo', sql.NVarChar, codigo)
                .query('INSERT INTO promocoes (promotor, codigo) VALUES (@promotor, @codigo)');
            console.log('Novo código registrado com sucesso:', { promotor, codigo });
            return res.status(201).json({ message: 'Código promocional registrado com sucesso!' });
        }
    } catch (err) {
        console.error('=== ERRO DETALHADO ===');
        console.error('Tipo do erro:', err.constructor.name);
        console.error('Mensagem do erro:', err.message);
        console.error('Stack trace completo:', err.stack);
        console.error('Código do erro:', err.code);
        console.error('Estado do erro:', err.state);
        console.error('Classe do erro:', err.class);
        console.error('Linha do erro:', err.lineNumber);
        console.error('Procedimento do erro:', err.procName);
        
        // Verificar se é um erro de conexão
        if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
            console.error('ERRO DE CONEXÃO COM BANCO DE DADOS');
            return res.status(500).json({ 
                message: 'Erro de conexão com o banco de dados. Tente novamente em alguns instantes.',
                error: 'Database connection error'
            });
        }
        
        // Verificar se é um erro de autenticação
        if (err.code === 'ELOGIN' || err.code === 'EALREADYCONNECTED') {
            console.error('ERRO DE AUTENTICAÇÃO NO BANCO DE DADOS');
            return res.status(500).json({ 
                message: 'Erro de autenticação no banco de dados.',
                error: 'Database authentication error'
            });
        }
        
        return res.status(500).json({ 
            message: 'Erro interno do servidor.',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Erro de processamento'
        });
    } finally {
        console.log('=== FIM DA REQUISIÇÃO /api/validate-code ===');
    }
});

app.post('/api/restore-database', async (req, res) => {
    await connectToDatabase();
    console.log('Iniciando a restauração dos dados via endpoint...');
    try {
        const backupFilePath = path.join(__dirname, '..', 'db_cluster-29-05-2025@11-23-51.backup');
        const data = fs.readFileSync(backupFilePath, 'utf8');
        const lines = data.split('\n');

        let copyStarted = false;
        const recordsToInsert = [];

        for (const line of lines) {
            if (!copyStarted) {
                if (line.startsWith('COPY public.promocoes')) {
                    copyStarted = true;
                }
                continue;
            }

            if (line.startsWith('\\.')) {
                break;
            }

            const columns = line.split('\t');
            if (columns.length === 5) {
                recordsToInsert.push({
                    id: columns[0],
                    promotor: columns[1],
                    codigo: columns[2].replace('%60', ''),
                    criado_em: new Date(columns[3].split('+')[0]),
                    clicou: columns[4] === 't'
                });
            }
        }

        if (recordsToInsert.length === 0) {
            console.log('Nenhum registro encontrado para restaurar.');
            return res.status(404).json({ message: 'Nenhum registro encontrado no arquivo de backup para restaurar.' });
        }

        console.log(`Encontrados ${recordsToInsert.length} registros para inserir.`);

        const transaction = pool.transaction();
        await transaction.begin();

        try {
            // Limpa a tabela antes de inserir novos dados
            console.log('Limpando a tabela `promocoes`...');
            const deleteRequest = new sql.Request(transaction);
            await deleteRequest.query('DELETE FROM promocoes');

            const request = new sql.Request(transaction);
            const table = new sql.Table('promocoes');
            table.create = false;

            table.columns.add('id', sql.UniqueIdentifier, { nullable: false, primary: true });
            table.columns.add('promotor', sql.NVarChar(255), { nullable: true });
            table.columns.add('codigo', sql.NVarChar(255), { nullable: true });
            table.columns.add('criado_em', sql.DateTime, { nullable: true });
            table.columns.add('clicou', sql.Bit, { nullable: true });

            for (const record of recordsToInsert) {
                table.rows.add(record.id, record.promotor, record.codigo, record.criado_em, record.clicou);
            }

            await request.bulk(table);
            await transaction.commit();
            console.log('Dados restaurados com sucesso!');
            res.status(200).json({ message: 'Dados restaurados com sucesso!' });
        } catch (err) {
            await transaction.rollback();
            console.error('Erro durante a transação de bulk insert:', err);
            res.status(500).json({ message: 'Erro durante a transação de restauração.' });
        }
    } catch (err) {
        console.error('Erro durante a restauração:', err);
        res.status(500).json({ message: 'Erro interno do servidor ao restaurar dados.' });
    }
});

module.exports.handler = serverless(app);