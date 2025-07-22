const config = {
    user: 'promocao_user',
    password: 'T3cN0!@#',
    server: '201.71.178.65',
    port: 6565,
    database: 'Aleatorio',
    options: {
        encrypt: true, // Para Azure
        trustServerCertificate: true // Para desenvolvimento local
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

module.exports = config;