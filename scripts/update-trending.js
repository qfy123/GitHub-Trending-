#!/usr/bin/env node

const GitHubAPI = require('../src/github-api');
const AISummarizer = require('../src/ai-summarizer');
const ImageCrawler = require('../src/image-crawler');
const DataProcessor = require('../src/data-processor');
const FileManager = require('../src/file-manager');
const ReadmeUpdater = require('../src/readme-updater');
const moment = require('moment');
require('dotenv').config();

class TrendingUpdater {
    constructor() {
        this.github = new GitHubAPI();
        this.aiSummarizer = new AISummarizer();
        this.imageCrawler = new ImageCrawler();
        this.dataProcessor = new DataProcessor();
        this.fileManager = new FileManager();
        this.readmeUpdater = new ReadmeUpdater();
        
        this.config = {
            repoLimit: 10,
            since: 'weekly',
            language: '',
            retryAttempts: 3,
            retryDelay: 5000
        };
    }

    /**
     * 主执行流程
     */
    async run(options = {}) {
        const startTime = Date.now();
        console.log('🚀 开始执行GitHub趋势排行榜更新...');
        console.log(`⏰ 开始时间: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
        
        try {
            // 合并配置
            this.config = { ...this.config, ...options };
            
            // 初始化文件结构
            await this.fileManager.initializeDirectories();
            
            // 获取当前周信息
            const weekInfo = this.fileManager.getCurrentWeekInfo();
            console.log(`📅 当前处理: ${weekInfo.year}年第${weekInfo.week}周 (${weekInfo.week_start} ~ ${weekInfo.week_end})`);
            
            // 步骤1: 获取GitHub trending数据
            console.log('\\n📡 步骤1: 获取GitHub trending数据...');
            const repos = await this.fetchTrendingRepos();
            console.log(`✅ 获取到 ${repos.length} 个trending项目`);
            
            // 步骤2: 获取详细信息
            console.log('\\n🔍 步骤2: 获取项目详细信息...');
            const detailedRepos = await this.github.getReposFullInfo(repos);
            console.log(`✅ 完成 ${detailedRepos.length} 个项目详细信息获取`);
            
            // 步骤3: AI总结
            console.log('\\n🤖 步骤3: 生成AI项目总结...');
            const aiSummaries = await this.aiSummarizer.batchSummarize(detailedRepos);
            console.log(`✅ 完成 ${aiSummaries.length} 个项目AI总结`);
            
            // 步骤4: 爬取图片
            console.log('\\n🖼️ 步骤4: 爬取项目图片...');
            const imageData = await this.imageCrawler.batchCrawlImages(
                detailedRepos, 
                weekInfo.year.toString(), 
                weekInfo.week.toString()
            );
            console.log(`✅ 完成图片爬取，共处理 ${imageData.length} 个项目`);
            
            // 步骤5: 数据处理和排名
            console.log('\\n📊 步骤5: 数据处理和排名计算...');
            const processedData = await this.dataProcessor.processCompleteData(
                detailedRepos,
                aiSummaries,
                imageData
            );
            console.log(`✅ 数据处理完成，生成排行榜`);
            
            // 步骤6: 保存周报数据
            console.log('\\n💾 步骤6: 保存周报数据...');
            await this.fileManager.saveWeeklyReport(processedData);
            console.log(`✅ 周报数据已保存`);
            
            // 步骤7: 更新README
            console.log('\\n📝 步骤7: 更新README.md...');
            const historyList = await this.fileManager.getHistoryList();
            await this.readmeUpdater.updateReadme(processedData, historyList);
            console.log(`✅ README.md 更新完成`);
            
            // 完成统计
            const endTime = Date.now();
            const duration = Math.round((endTime - startTime) / 1000);
            
            console.log('\\n🎉 排行榜更新完成!');
            console.log(`⏱️ 总耗时: ${duration} 秒`);
            console.log(`📋 处理项目: ${processedData.repositories.length} 个`);
            console.log(`📅 更新周期: ${weekInfo.year}年第${weekInfo.week}周`);
            
            // 显示排名前5的项目
            console.log('\\n🏆 本周前5名:');
            processedData.repositories.slice(0, 5).forEach(repo => {
                console.log(`  ${repo.rank}. ${repo.name} (⭐ ${repo.stars.toLocaleString()})`);
            });
            
            return processedData;
            
        } catch (error) {
            console.error('\\n❌ 执行失败:', error.message);
            console.error('📍 错误堆栈:', error.stack);
            
            // 发送通知（如果配置了）
            await this.sendErrorNotification(error);
            
            throw error;
        }
    }

    /**
     * 获取trending repositories
     */
    async fetchTrendingRepos() {
        let attempt = 0;
        
        while (attempt < this.config.retryAttempts) {
            try {
                const repos = await this.github.getTrendingRepos(
                    this.config.since,
                    this.config.language,
                    this.config.repoLimit
                );
                
                if (repos.length === 0) {
                    throw new Error('没有获取到任何trending项目');
                }
                
                return repos;
                
            } catch (error) {
                attempt++;
                console.warn(`获取trending repos失败 (第${attempt}次尝试):`, error.message);
                
                if (attempt >= this.config.retryAttempts) {
                    throw error;
                }
                
                console.log(`等待 ${this.config.retryDelay}ms 后重试...`);
                await this.delay(this.config.retryDelay);
            }
        }
    }

    /**
     * 发送错误通知
     */
    async sendErrorNotification(error) {
        // 这里可以实现邮件通知、Webhook通知等
        console.log('📧 错误通知功能待实现');
    }

    /**
     * 延迟函数
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 检查API配置
     */
    async checkConfiguration() {
        const issues = [];
        
        // 检查GitHub Token
        if (!process.env.GITHUB_TOKEN) {
            issues.push('缺少 GITHUB_TOKEN 环境变量');
        } else {
            try {
                await this.github.checkRateLimit();
                console.log('✅ GitHub API 配置正常');
            } catch (error) {
                issues.push(`GitHub API 测试失败: ${error.message}`);
            }
        }
        
        // 检查AI配置
        if (!process.env.SILICONFLOW_API_KEY) {
            issues.push('缺少 SILICONFLOW_API_KEY 环境变量');
        }
        
        // 检查README
        const readmeValidation = await this.readmeUpdater.validateReadme();
        if (!readmeValidation.valid) {
            issues.push(`README验证失败: ${readmeValidation.errors.join(', ')}`);
        }
        
        return {
            valid: issues.length === 0,
            issues: issues
        };
    }

    /**
     * 清理过期数据
     */
    async cleanup(keepWeeks = 52) {
        console.log('🧹 开始清理过期数据...');
        
        try {
            // 清理过期的归档数据
            await this.fileManager.cleanupOldData(keepWeeks);
            
            // 清理过期的图片
            await this.imageCrawler.cleanupOldImages(keepWeeks * 7);
            
            console.log('✅ 数据清理完成');
            
        } catch (error) {
            console.error('清理数据失败:', error.message);
        }
    }

    /**
     * 创建备份
     */
    async backup() {
        console.log('💾 创建数据备份...');
        
        try {
            const backupPath = await this.fileManager.createBackup();
            console.log(`✅ 备份创建完成: ${backupPath}`);
            return backupPath;
            
        } catch (error) {
            console.error('创建备份失败:', error.message);
            throw error;
        }
    }

    /**
     * 显示统计信息
     */
    async showStats() {
        try {
            console.log('📊 系统统计信息:');
            
            // 历史数据统计
            const historyList = await this.fileManager.getHistoryList();
            console.log(`📚 历史周报数量: ${historyList.length} 个`);
            
            if (historyList.length > 0) {
                const latest = historyList[0];
                console.log(`📅 最新报告: ${latest.year}年第${latest.week}周`);
            }
            
            // 存储使用情况
            const storage = await this.fileManager.getStorageUsage();
            console.log(`💾 存储使用情况:`);
            console.log(`   归档数据: ${storage.formatted.archives}`);
            console.log(`   图片文件: ${storage.formatted.images}`);
            console.log(`   临时数据: ${storage.formatted.data}`);
            console.log(`   备份文件: ${storage.formatted.backups}`);
            console.log(`   总计: ${storage.formatted.total}`);
            
            // AI缓存统计
            const cacheStats = this.aiSummarizer.getCacheStats();
            console.log(`🤖 AI缓存: ${cacheStats.size} 个项目`);
            
        } catch (error) {
            console.error('获取统计信息失败:', error.message);
        }
    }
}

// 命令行处理
async function main() {
    const args = process.argv.slice(2);
    const updater = new TrendingUpdater();
    
    try {
        if (args.includes('--help') || args.includes('-h')) {
            showHelp();
            return;
        }
        
        if (args.includes('--check')) {
            console.log('🔍 检查系统配置...');
            const config = await updater.checkConfiguration();
            
            if (config.valid) {
                console.log('✅ 配置检查通过');
            } else {
                console.error('❌ 配置检查失败:');
                config.issues.forEach(issue => console.error(`  - ${issue}`));
                process.exit(1);
            }
            return;
        }
        
        if (args.includes('--stats')) {
            await updater.showStats();
            return;
        }
        
        if (args.includes('--cleanup')) {
            const keepWeeks = parseInt(args[args.indexOf('--cleanup') + 1]) || 52;
            await updater.cleanup(keepWeeks);
            return;
        }
        
        if (args.includes('--backup')) {
            await updater.backup();
            return;
        }
        
        // 解析其他参数
        const options = {};
        
        if (args.includes('--limit')) {
            options.repoLimit = parseInt(args[args.indexOf('--limit') + 1]) || 10;
        }
        
        if (args.includes('--language')) {
            options.language = args[args.indexOf('--language') + 1] || '';
        }
        
        if (args.includes('--since')) {
            options.since = args[args.indexOf('--since') + 1] || 'weekly';
        }
        
        // 执行主流程
        await updater.run(options);
        
    } catch (error) {
        console.error('程序执行失败:', error.message);
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
GitHub Trending 排行榜更新工具

用法: node scripts/update-trending.js [选项]

选项:
  --help, -h          显示帮助信息
  --check             检查系统配置
  --stats             显示统计信息
  --cleanup [周数]     清理过期数据 (默认保留52周)
  --backup            创建数据备份
  --limit <数量>       限制项目数量 (默认10)
  --language <语言>    按语言过滤
  --since <时间>       时间范围 (daily/weekly/monthly)

示例:
  node scripts/update-trending.js                    # 执行周更新
  node scripts/update-trending.js --check           # 检查配置
  node scripts/update-trending.js --limit 20        # 获取20个项目
  node scripts/update-trending.js --language python # 只获取Python项目
  node scripts/update-trending.js --cleanup 26      # 清理26周前的数据
`);
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = TrendingUpdater;