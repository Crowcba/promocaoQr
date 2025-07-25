const sql = require('mssql');

// Configuração do banco de dados usando variáveis de ambiente
const config = {
    user: process.env.DB_USER || 'promocao_user',
    password: process.env.DB_PASSWORD || 'T3cN0!@#',
    server: process.env.DB_SERVER || '201.71.178.65',
    port: parseInt(process.env.DB_PORT) || 6565,
    database: process.env.DB_NAME || 'Aleatorio',
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 30000,
        connectionTimeout: 30000
    },
    pool: {
        max: 5, // Reduzido para ambiente serverless
        min: 0,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200
    }
};

module.exports = config;