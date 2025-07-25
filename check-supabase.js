#!/usr/bin/env node

/**
 * Script para verificar se há tentativas de conexão com Supabase
 * Execute: node check-supabase.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 VERIFICANDO TENTATIVAS DE CONEXÃO COM SUPABASE\n');

// Verificar arquivos de configuração
const configFiles = [
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    'netlify.toml',
    'vercel.json',
    'package.json',
    'api/package.json'
];

console.log('📁 Verificando arquivos de configuração:');
configFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const supabaseMatches = content.match(/supabase/gi);
        if (supabaseMatches) {
            console.log(`⚠️  ${file}: ${supabaseMatches.length} referência(s) ao Supabase encontrada(s)`);
        } else {
            console.log(`✅ ${file}: Sem referências ao Supabase`);
        }
    } else {
        console.log(`❌ ${file}: Arquivo não encontrado`);
    }
});

// Verificar variáveis de ambiente
console.log('\n🌍 Verificando variáveis de ambiente:');
const supabaseVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'REACT_APP_SUPABASE_URL',
    'REACT_APP_SUPABASE_ANON_KEY'
];

supabaseVars.forEach(varName => {
    if (process.env[varName]) {
        console.log(`⚠️  ${varName}: DEFINIDA (${process.env[varName].substring(0, 20)}...)`);
    } else {
        console.log(`✅ ${varName}: Não definida`);
    }
});

// Verificar todas as variáveis que contêm 'supabase'
console.log('\n🔎 Verificando todas as variáveis de ambiente:');
Object.keys(process.env).forEach(key => {
    if (key.toLowerCase().includes('supabase')) {
        console.log(`⚠️  VARIÁVEL SUPABASE ENCONTRADA: ${key}`);
    }
});

// Verificar dependências
console.log('\n📦 Verificando dependências:');
const packageFiles = ['package.json', 'api/package.json'];
packageFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            
            Object.keys(deps).forEach(dep => {
                if (dep.includes('supabase')) {
                    console.log(`⚠️  ${file}: Dependência Supabase encontrada: ${dep}`);
                }
            });
        } catch (error) {
            console.log(`❌ ${file}: Erro ao ler arquivo`);
        }
    }
});

console.log('\n✅ Verificação concluída!');
console.log('\n📋 PRÓXIMOS PASSOS:');
console.log('1. Se encontrou variáveis Supabase, remova-as do painel do Netlify');
console.log('2. Se encontrou dependências Supabase, remova-as dos package.json');
console.log('3. Faça um novo deploy após as correções'); 