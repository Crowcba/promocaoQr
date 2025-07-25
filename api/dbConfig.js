const config = {
    user: 'promocao_user',
    password: 'T3cN0!@#',
    server: '201.71.178.65',
    port: 6565,
    database: 'Aleatorio',
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