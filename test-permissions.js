const sql = require('mssql');
const dbConfig = require('./api/dbConfig');

async function testPermissions() {
    let pool;
    
    try {
        console.log('=== TESTE DE PERMISSÕES DO BANCO DE DADOS ===');
        
        // Conectar ao banco
        pool = await new sql.ConnectionPool(dbConfig).connect();
        console.log('✅ Conectado ao banco de dados');
        
        // Teste 1: SELECT
        console.log('\n1. Testando permissão SELECT...');
        const selectResult = await pool.request()
            .query('SELECT TOP 1 * FROM promocoes');
        console.log('✅ SELECT funcionando - Registros encontrados:', selectResult.recordset.length);
        
        // Teste 2: INSERT
        console.log('\n2. Testando permissão INSERT...');
        const testCode = `TESTE_${Date.now()}`;
        const insertResult = await pool.request()
            .input('promotor', sql.NVarChar, 'TESTE_PERMISSAO')
            .input('codigo', sql.NVarChar, testCode)
            .input('clicou', sql.Bit, 0)
            .query('INSERT INTO promocoes (promotor, codigo, clicou) VALUES (@promotor, @codigo, @clicou)');
        console.log('✅ INSERT funcionando - Código inserido:', testCode);
        
        // Teste 3: UPDATE
        console.log('\n3. Testando permissão UPDATE...');
        const updateResult = await pool.request()
            .input('codigo', sql.NVarChar, testCode)
            .query('UPDATE promocoes SET clicou = 1 WHERE codigo = @codigo');
        console.log('✅ UPDATE funcionando - Registros atualizados:', updateResult.rowsAffected[0]);
        
        // Teste 4: DELETE (limpeza)
        console.log('\n4. Testando permissão DELETE...');
        const deleteResult = await pool.request()
            .input('codigo', sql.NVarChar, testCode)
            .query('DELETE FROM promocoes WHERE codigo = @codigo');
        console.log('✅ DELETE funcionando - Registros removidos:', deleteResult.rowsAffected[0]);
        
        console.log('\n🎉 TODAS AS PERMISSÕES ESTÃO FUNCIONANDO CORRETAMENTE!');
        
    } catch (err) {
        console.error('\n❌ ERRO NO TESTE DE PERMISSÕES:');
        console.error('Tipo do erro:', err.constructor.name);
        console.error('Mensagem:', err.message);
        console.error('Código:', err.code);
        
        if (err.code === 'EREQUEST') {
            console.error('\n💡 DICA: Execute o script grant-permissions.sql como administrador do banco');
        }
    } finally {
        if (pool) {
            await pool.close();
            console.log('\n🔌 Conexão fechada');
        }
    }
}

// Executar o teste
testPermissions().catch(console.error); 