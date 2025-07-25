const express = require('express');
const sql = require('mssql');
const serverless = require('serverless-http');
const dbConfig = require('./dbConfig');

const app = express();

// Rate limiting simples
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const RATE_LIMIT_MAX = 10; // máximo 10 requests por minuto

// Middleware de rate limiting
function rateLimit(req, res, next) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    if (!requestCounts.has(clientIP)) {
        requestCounts.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else {
        const clientData = requestCounts.get(clientIP);
        if (now > clientData.resetTime) {
            clientData.count = 1;
            clientData.resetTime = now + RATE_LIMIT_WINDOW;
        } else {
            clientData.count++;
        }
        
        if (clientData.count > RATE_LIMIT_MAX) {
            return res.status(429).json({
                message: 'Muitas requisições. Tente novamente em alguns instantes.',
                error: 'Rate limit exceeded'
            });
        }
    }
    next();
}

// Middleware de validação e sanitização
function validateInput(req, res, next) {
    const { promotor, code } = req.body;
    
    // Validação básica
    if (!promotor || !code) {
        return res.status(400).json({
            message: 'Promotor e código são obrigatórios.',
            error: 'Missing required fields'
        });
    }
    
    // Sanitização básica
    const sanitizedPromotor = String(promotor).trim().substring(0, 255);
    const sanitizedCode = String(code).trim().substring(0, 255);
    
    // Validação de formato
    if (sanitizedPromotor.length < 1 || sanitizedCode.length < 1) {
        return res.status(400).json({
            message: 'Promotor e código não podem estar vazios.',
            error: 'Invalid input format'
        });
    }
    
    // Verificar caracteres suspeitos
    const suspiciousPattern = /[<>\"'&]/;
    if (suspiciousPattern.test(sanitizedPromotor) || suspiciousPattern.test(sanitizedCode)) {
        return res.status(400).json({
            message: 'Caracteres inválidos detectados.',
            error: 'Invalid characters'
        });
    }
    
    // Adicionar dados sanitizados ao request
    req.sanitizedData = {
        promotor: sanitizedPromotor,
        code: sanitizedCode
    };
    
    next();
}

// Middleware de headers de segurança
function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
}

// Middleware de logging de segurança
function securityLog(req, res, next) {
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const timestamp = new Date().toISOString();
    
    // Log de tentativas de acesso
    console.log(`[SECURITY] ${timestamp} - IP: ${clientIP} - UA: ${userAgent} - Path: ${req.path}`);
    
    next();
}

app.use(express.json({ limit: '1mb' })); // Limitar tamanho do JSON
app.use(securityHeaders);
app.use(securityLog);
app.use(rateLimit);

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

// Rota para validar código (primeira entrada no site)
app.post('/api/validate-code', validateInput, async (req, res) => {
    try {
        await connectToDatabase();
        
        const { promotor, code: codigo } = req.sanitizedData;

        // Sempre tenta inserir um novo registro
        try {
            await pool.request()
                .input('promotor', sql.NVarChar, promotor)
                .input('codigo', sql.NVarChar, codigo)
                .input('clicou', sql.Bit, 0)
                .query('INSERT INTO promocoes (promotor, codigo, clicou) VALUES (@promotor, @codigo, @clicou)');
            
            return res.status(201).json({ 
                message: 'Código promocional registrado com sucesso! Clique no link para acessar o site.',
                canClick: true
            });
        } catch (insertErr) {
            // Se der erro de duplicata, significa que o código já existe
            if (insertErr.code === 'EREQUEST' && insertErr.message.includes('duplicate')) {
                return res.status(200).json({ 
                    message: 'Código promocional já registrado! Clique no link para acessar o site.',
                    canClick: true
                });
            }
            throw insertErr;
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

// Rota para marcar como clicado (quando clica no link da TecnoVida)
app.post('/api/mark-clicked', validateInput, async (req, res) => {
    try {
        await connectToDatabase();
        
        const { code: codigo } = req.sanitizedData;

        const request = pool.request();
        
        // Verifica se o código existe
        let result = await request
            .input('codigo', sql.NVarChar, codigo)
            .query('SELECT * FROM promocoes WHERE codigo = @codigo');

        if (result.recordset.length === 0) {
            return res.status(404).json({ 
                message: 'Código não encontrado no sistema.'
            });
        }

        // Atualiza o registro específico para marcar como clicado
        await pool.request()
            .input('codigo', sql.NVarChar, codigo)
            .query('UPDATE promocoes SET clicou = 1 WHERE codigo = @codigo');
        
        return res.status(200).json({ 
            message: 'Código utilizado com sucesso!'
        });

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