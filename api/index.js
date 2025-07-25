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
        return pool;
    }
    try {
        console.log('Conectando ao banco de dados...');
        console.log('Configuração do banco:', {
            server: netlifyConfig.server,
            port: netlifyConfig.port,
            database: netlifyConfig.database,
            user: netlifyConfig.user
        });
        
        pool = await new sql.ConnectionPool(netlifyConfig).connect();
        console.log('Conectado ao SQL Server com sucesso.');
        return pool;
    } catch (err) {
        console.error('Erro detalhado ao conectar com o banco de dados:', err);
        console.error('Stack trace:', err.stack);
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
    console.log('Requisição recebida em /api/validate-code');
    console.log('Body da requisição:', req.body);
    
    try {
        await connectToDatabase();
        
        const { promotor, code: codigo } = req.body;

        if (!promotor || !codigo) {
            console.log('Dados inválidos recebidos:', { promotor, codigo });
            return res.status(400).json({ 
                message: 'Promotor ou código não fornecido no formato correto.',
                received: { promotor, codigo }
            });
        }

        console.log('Validando código:', { promotor, codigo });

        const request = pool.request();
        // Verifica se o código já existe para evitar duplicatas
        let result = await request
            .input('codigo', sql.NVarChar, codigo)
            .query('SELECT * FROM promocoes WHERE codigo = @codigo');

        console.log('Resultado da consulta:', result.recordset);

        if (result.recordset.length > 0) {
            // Se o código já existe, verifica se já foi clicado
            const record = result.recordset[0];
            if (record.clicou) {
                console.log('Código já utilizado:', codigo);
                return res.status(200).json({ message: 'Este código já foi utilizado!' });
            } else {
                 // Atualiza o registro existente para marcar como clicado
                await pool.request()
                    .input('codigo', sql.NVarChar, codigo)
                    .query('UPDATE promocoes SET clicou = 1 WHERE codigo = @codigo');
                console.log('Código atualizado com sucesso:', codigo);
                return res.status(200).json({ message: 'Código promocional validado e atualizado!' });
            }
        } else {
            // Se o código não existe, insere um novo registro
            await pool.request()
                .input('promotor', sql.NVarChar, promotor)
                .input('codigo', sql.NVarChar, codigo)
                .query('INSERT INTO promocoes (promotor, codigo) VALUES (@promotor, @codigo)');
            console.log('Novo código registrado com sucesso:', { promotor, codigo });
            return res.status(201).json({ message: 'Código promocional registrado com sucesso!' });
        }
    } catch (err) {
        console.error('Erro detalhado no banco de dados:', err);
        console.error('Stack trace:', err.stack);
        return res.status(500).json({ 
            message: 'Erro interno do servidor.',
            error: process.env.NODE_ENV === 'development' ? err.message : 'Erro de conexão com banco de dados'
        });
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