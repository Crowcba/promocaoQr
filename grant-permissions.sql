-- Script para dar permissões necessárias ao usuário promocao_user
-- Execute este script como administrador do banco de dados

USE [Aleatorio]
GO

-- Dar permissão SELECT na tabela promocoes
GRANT SELECT ON [dbo].[promocoes] TO [promocao_user]
GO

-- Dar permissão INSERT na tabela promocoes
GRANT INSERT ON [dbo].[promocoes] TO [promocao_user]
GO

-- Dar permissão UPDATE na tabela promocoes
GRANT UPDATE ON [dbo].[promocoes] TO [promocao_user]
GO

-- Dar permissão DELETE na tabela promocoes (opcional, para limpeza)
GRANT DELETE ON [dbo].[promocoes] TO [promocao_user]
GO

-- Verificar as permissões concedidas
SELECT 
    dp.name AS DatabaseUser,
    dp.type_desc AS UserType,
    o.name AS ObjectName,
    o.type_desc AS ObjectType,
    p.permission_name AS Permission,
    p.state_desc AS PermissionState
FROM sys.database_permissions p
JOIN sys.objects o ON p.major_id = o.object_id
JOIN sys.database_principals dp ON p.grantee_principal_id = dp.principal_id
WHERE dp.name = 'promocao_user' 
    AND o.name = 'promocoes'
ORDER BY p.permission_name
GO

PRINT 'Permissões concedidas com sucesso para o usuário promocao_user!'
GO 