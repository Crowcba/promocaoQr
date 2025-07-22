const express = require('express');
const sql = require('mssql');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Importa a configuração do banco de dados
const dbConfig = require('./dbConfig');

app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

let pool;

async function initializeDatabase() {
    try {
        console.log('Tentando conectar com a configuração:', JSON.stringify(dbConfig, null, 2));
        pool = await new sql.ConnectionPool(dbConfig).connect();
        console.log('Conectado ao SQL Server.');

        const checkTableQuery = `
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='promocoes' and xtype='U')
            CREATE TABLE promocoes (
                id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                promotor NVARCHAR(255) NOT NULL,
                codigo NVARCHAR(255) NOT NULL,
                criado_em DATETIME DEFAULT GETDATE(),
                clicou BIT DEFAULT 0
            );
        `;

        await pool.request().query(checkTableQuery);
        console.log('Tabela `promocoes` verificada/criada com sucesso.');

    } catch (err) {
        console.error('Erro na inicialização do banco de dados:', err);
        process.exit(1); // Encerra a aplicação se a conexão com o BD falhar
    }
}

initializeDatabase().then(() => {
    app.listen(port, () => {
        console.log(`Servidor rodando na porta ${port}`);
    });
});

app.post('/api/validate-code', async (req, res) => {
    console.log('Requisição recebida em /api/validate-code:', req.body);
    const { code } = req.body;

    if (!code || !code.includes('/')) {
        return res.status(400).json({ message: 'O formato do código é inválido. Use o formato promotor/codigo.' });
    }

    const [promotor, codigo] = code.split('/');

    if (!promotor || !codigo) {
        return res.status(400).json({ message: 'Promotor ou código não fornecido no formato correto.' });
    }

    try {
        const request = pool.request();
        // Verifica se o código já existe para evitar duplicatas
        let result = await request
            .input('codigo', sql.NVarChar, codigo)
            .query('SELECT * FROM promocoes WHERE codigo = @codigo');

        if (result.recordset.length > 0) {
            // Se o código já existe, verifica se já foi clicado
            const record = result.recordset[0];
            if (record.clicou) {
                return res.status(200).json({ message: 'Este código já foi utilizado!' });
            } else {
                 // Atualiza o registro existente para marcar como clicado
                await pool.request()
                    .input('codigo', sql.NVarChar, codigo)
                    .query('UPDATE promocoes SET clicou = 1 WHERE codigo = @codigo');
                return res.status(200).json({ message: 'Código promocional validado e atualizado!' });
            }
        } else {
            // Se o código não existe, insere um novo registro
            await pool.request()
                .input('promotor', sql.NVarChar, promotor)
                .input('codigo', sql.NVarChar, codigo)
                .query('INSERT INTO promocoes (promotor, codigo) VALUES (@promotor, @codigo)');
            return res.status(201).json({ message: 'Código promocional registrado com sucesso!' });
        }
    } catch (err) {
        console.error('Erro detalhado no banco de dados:', err);
        return res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

app.post('/api/restore-database', async (req, res) => {
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