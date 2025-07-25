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
        pool = await new sql.ConnectionPool(netlifyConfig).connect();
        return pool;
    } catch (err) {
        throw err;
    }
}

// Middleware para CORS
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://promocaoqr.netlify.app',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:5500'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    } else {
        res.header('Access-Control-Allow-Origin', '*');
    }
    
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    
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
    try {
        await connectToDatabase();
        
        const { promotor, code: codigo } = req.body;

        if (!promotor || !codigo) {
            return res.status(400).json({ 
                message: 'Promotor ou código não fornecido no formato correto.',
                received: { promotor, codigo }
            });
        }

        const request = pool.request();
        
        // Verifica se o código já existe
        let result = await request
            .input('codigo', sql.NVarChar, codigo)
            .query('SELECT * FROM promocoes WHERE codigo = @codigo');

        if (result.recordset.length > 0) {
            // Se o código já existe, verifica se já foi clicado
            const record = result.recordset[0];
            
            if (record.clicou) {
                return res.status(200).json({ message: 'Este código já foi utilizado!' });
            } else {
                // Atualiza o registro para marcar como clicado
                await pool.request()
                    .input('codigo', sql.NVarChar, codigo)
                    .query('UPDATE promocoes SET clicou = 1 WHERE codigo = @codigo');
                
                return res.status(200).json({ message: 'Código promocional validado com sucesso!' });
            }
        } else {
            // Se o código não existe, insere um novo registro
            try {
                await pool.request()
                    .input('promotor', sql.NVarChar, promotor)
                    .input('codigo', sql.NVarChar, codigo)
                    .query('INSERT INTO promocoes (promotor, codigo, clicou) VALUES (@promotor, @codigo, 1)');
                
                return res.status(201).json({ message: 'Código promocional registrado e validado com sucesso!' });
            } catch (insertErr) {
                // Se der erro de duplicata, significa que o código já existe
                if (insertErr.code === 'EREQUEST' && insertErr.message.includes('duplicate')) {
                    return res.status(200).json({ message: 'Código promocional já registrado!' });
                }
                throw insertErr;
            }
        }
    } catch (err) {
        // Verificar se é um erro de conexão
        if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
            return res.status(500).json({ 
                message: 'Erro de conexão com o banco de dados. Tente novamente em alguns instantes.',
                error: 'Database connection error'
            });
        }
        
        // Verificar se é um erro de autenticação
        if (err.code === 'ELOGIN' || err.code === 'EALREADYCONNECTED') {
            return res.status(500).json({ 
                message: 'Erro de autenticação no banco de dados.',
                error: 'Database authentication error'
            });
        }
        
        // Verificar se é um erro de SQL
        if (err.code === 'EREQUEST' || err.code === 'ESQL') {
            return res.status(500).json({ 
                message: 'Erro na consulta ao banco de dados.',
                error: 'SQL error'
            });
        }
        
        return res.status(500).json({ 
            message: 'Erro interno do servidor.',
            error: 'Erro de processamento'
        });
    }
});

// Middleware de tratamento de erros global
app.use((err, req, res, next) => {
    // Garantir que os headers CORS estejam presentes mesmo em caso de erro
    const origin = req.headers.origin;
    if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
    } else {
        res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    // Retornar erro 500 com mensagem adequada
    res.status(500).json({
        message: 'Erro interno do servidor',
        error: 'Erro de processamento',
        timestamp: new Date().toISOString()
    });
});

module.exports.handler = serverless(app);