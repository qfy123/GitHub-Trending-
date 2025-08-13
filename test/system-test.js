#!/usr/bin/env node

/**
 * GitHub Trending 项目测试脚本
 * 用于验证所有功能模块是否正常工作
 */

const path = require('path');
const fs = require('fs-extra');

class SystemTester {
    constructor() {
        this.testResults = [];
        this.errors = [];
    }

    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('🧪 开始系统功能测试...\n');
        
        const tests = [
            () => this.testDependencies(),
            () => this.testFileStructure(),
            () => this.testEnvironmentConfig(),
            () => this.testModules(),
            () => this.testConfigFiles(),
            () => this.testGitHubActions()
        ];

        for (const test of tests) {
            try {
                await test();
            } catch (error) {
                this.errors.push(error.message);
            }
        }

        this.printResults();
        return this.errors.length === 0;
    }

    /**
     * 测试依赖包
     */
    async testDependencies() {
        console.log('📦 测试依赖包...');
        
        const packagePath = path.join(process.cwd(), 'package.json');
        
        if (!(await fs.pathExists(packagePath))) {
            throw new Error('package.json 文件不存在');
        }

        const packageData = await fs.readJSON(packagePath);
        const requiredDeps = ['axios', 'dotenv', 'cheerio', 'fs-extra', 'moment'];
        
        for (const dep of requiredDeps) {
            if (!packageData.dependencies[dep]) {
                throw new Error(`缺少必需依赖: ${dep}`);
            }
        }

        // 检查是否安装了依赖
        const nodeModulesPath = path.join(process.cwd(), 'node_modules');
        if (!(await fs.pathExists(nodeModulesPath))) {
            console.log('⚠️  node_modules 不存在，请运行: npm install');
        }

        this.testResults.push('✅ 依赖包检查通过');
    }

    /**
     * 测试文件结构
     */
    async testFileStructure() {
        console.log('📁 测试文件结构...');
        
        const requiredDirs = [
            'src',
            'data', 
            'images',
            'archives',
            'scripts',
            'config',
            '.github/workflows'
        ];

        const requiredFiles = [
            'src/github-api.js',
            'src/ai-summarizer.js',
            'src/image-crawler.js',
            'src/data-processor.js',
            'src/file-manager.js',
            'src/readme-updater.js',
            'scripts/update-trending.js',
            '.env.example',
            '.gitignore',
            'package.json'
        ];

        for (const dir of requiredDirs) {
            if (!(await fs.pathExists(path.join(process.cwd(), dir)))) {
                throw new Error(`缺少目录: ${dir}`);
            }
        }

        for (const file of requiredFiles) {
            if (!(await fs.pathExists(path.join(process.cwd(), file)))) {
                throw new Error(`缺少文件: ${file}`);
            }
        }

        this.testResults.push('✅ 文件结构检查通过');
    }

    /**
     * 测试环境配置
     */
    async testEnvironmentConfig() {
        console.log('⚙️ 测试环境配置...');
        
        const envExamplePath = path.join(process.cwd(), '.env.example');
        const envPath = path.join(process.cwd(), '.env');
        
        if (!(await fs.pathExists(envExamplePath))) {
            throw new Error('.env.example 文件不存在');
        }

        const envExample = await fs.readFile(envExamplePath, 'utf8');
        const requiredVars = [
            'GITHUB_TOKEN',
            'SILICONFLOW_API_KEY',
            'AI_BASE_URL',
            'AI_MODEL'
        ];

        for (const varName of requiredVars) {
            if (!envExample.includes(varName)) {
                throw new Error(`环境变量模板缺少: ${varName}`);
            }
        }

        if (await fs.pathExists(envPath)) {
            console.log('✅ 找到 .env 文件');
        } else {
            console.log('⚠️  .env 文件不存在，请复制 .env.example 并配置');
        }

        this.testResults.push('✅ 环境配置检查通过');
    }

    /**
     * 测试模块导入
     */
    async testModules() {
        console.log('🔧 测试模块导入...');
        
        const modules = [
            'src/github-api.js',
            'src/ai-summarizer.js', 
            'src/image-crawler.js',
            'src/data-processor.js',
            'src/file-manager.js',
            'src/readme-updater.js'
        ];

        for (const modulePath of modules) {
            try {
                const fullPath = path.join(process.cwd(), modulePath);
                delete require.cache[fullPath]; // 清除缓存
                require(fullPath);
            } catch (error) {
                throw new Error(`模块导入失败 ${modulePath}: ${error.message}`);
            }
        }

        this.testResults.push('✅ 模块导入检查通过');
    }

    /**
     * 测试配置文件
     */
    async testConfigFiles() {
        console.log('📋 测试配置文件...');
        
        const gitignorePath = path.join(process.cwd(), '.gitignore');
        if (await fs.pathExists(gitignorePath)) {
            const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
            if (!gitignoreContent.includes('.env')) {
                throw new Error('.gitignore 文件应该包含 .env');
            }
        }

        const packagePath = path.join(process.cwd(), 'package.json');
        const packageData = await fs.readJSON(packagePath);
        
        if (!packageData.scripts || !packageData.scripts.start) {
            console.log('⚠️  建议在 package.json 中添加 start 脚本');
        }

        this.testResults.push('✅ 配置文件检查通过');
    }

    /**
     * 测试GitHub Actions配置
     */
    async testGitHubActions() {
        console.log('🤖 测试GitHub Actions配置...');
        
        const workflowPath = path.join(process.cwd(), '.github/workflows/update-trending.yml');
        
        if (!(await fs.pathExists(workflowPath))) {
            throw new Error('GitHub Actions工作流文件不存在');
        }

        const workflowContent = await fs.readFile(workflowPath, 'utf8');
        
        const requiredElements = [
            'schedule:',
            'workflow_dispatch:',
            'GITHUB_TOKEN',
            'SILICONFLOW_API_KEY',
            'node scripts/update-trending.js'
        ];

        for (const element of requiredElements) {
            if (!workflowContent.includes(element)) {
                throw new Error(`工作流配置缺少: ${element}`);
            }
        }

        this.testResults.push('✅ GitHub Actions配置检查通过');
    }

    /**
     * 打印测试结果
     */
    printResults() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 测试结果汇总');
        console.log('='.repeat(50));
        
        if (this.testResults.length > 0) {
            console.log('\n✅ 通过的测试:');
            this.testResults.forEach(result => console.log(`  ${result}`));
        }

        if (this.errors.length > 0) {
            console.log('\n❌ 失败的测试:');
            this.errors.forEach(error => console.log(`  ❌ ${error}`));
            console.log('\n请修复上述问题后重新测试。');
        } else {
            console.log('\n🎉 所有测试通过！系统已准备就绪。');
            this.printNextSteps();
        }
    }

    /**
     * 打印下一步操作指南
     */
    printNextSteps() {
        console.log('\n' + '='.repeat(50));
        console.log('🚀 下一步操作');
        console.log('='.repeat(50));
        console.log('');
        console.log('1. 配置环境变量:');
        console.log('   cp .env.example .env');
        console.log('   # 编辑 .env 文件，填入真实的API密钥');
        console.log('');
        console.log('2. 安装依赖:');
        console.log('   npm install');
        console.log('');
        console.log('3. 检查配置:');
        console.log('   node scripts/update-trending.js --check');
        console.log('');
        console.log('4. 测试运行 (小数据量):');
        console.log('   node scripts/update-trending.js --limit 3');
        console.log('');
        console.log('5. 正式运行:');
        console.log('   node scripts/update-trending.js');
        console.log('');
        console.log('6. 查看其他命令:');
        console.log('   node scripts/update-trending.js --help');
        console.log('');
        console.log('📖 详细文档请查看:');
        console.log('   - config/README.md (环境配置)');
        console.log('   - .github/README.md (GitHub Actions)');
    }

    /**
     * 快速诊断
     */
    async quickDiagnosis() {
        console.log('🔍 快速诊断系统状态...\n');
        
        const checks = [
            {
                name: 'Node.js版本',
                check: () => {
                    const version = process.version;
                    const major = parseInt(version.slice(1).split('.')[0]);
                    return major >= 14 ? `✅ ${version}` : `❌ ${version} (需要 >= 14)`;
                }
            },
            {
                name: 'package.json',
                check: async () => {
                    return (await fs.pathExists('package.json')) ? '✅ 存在' : '❌ 不存在';
                }
            },
            {
                name: '.env.example',
                check: async () => {
                    return (await fs.pathExists('.env.example')) ? '✅ 存在' : '❌ 不存在';
                }
            },
            {
                name: '.env配置',
                check: async () => {
                    return (await fs.pathExists('.env')) ? '✅ 已配置' : '⚠️  未配置';
                }
            },
            {
                name: 'node_modules',
                check: async () => {
                    return (await fs.pathExists('node_modules')) ? '✅ 已安装' : '⚠️  需要 npm install';
                }
            },
            {
                name: 'GitHub Actions',
                check: async () => {
                    return (await fs.pathExists('.github/workflows/update-trending.yml')) ? '✅ 已配置' : '❌ 未配置';
                }
            }
        ];

        for (const { name, check } of checks) {
            const result = await check();
            console.log(`${name.padEnd(20)} ${result}`);
        }
    }
}

// 命令行处理
async function main() {
    const args = process.argv.slice(2);
    const tester = new SystemTester();

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
GitHub Trending 系统测试工具

用法: node test/system-test.js [选项]

选项:
  --help, -h     显示帮助信息
  --quick, -q    快速诊断
  --full         完整测试 (默认)

示例:
  node test/system-test.js          # 运行完整测试
  node test/system-test.js --quick  # 快速诊断
`);
        return;
    }

    try {
        if (args.includes('--quick') || args.includes('-q')) {
            await tester.quickDiagnosis();
        } else {
            const success = await tester.runAllTests();
            process.exit(success ? 0 : 1);
        }
    } catch (error) {
        console.error('测试执行失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = SystemTester;