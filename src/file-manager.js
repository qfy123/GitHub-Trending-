const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

class FileManager {
    constructor() {
        this.baseDir = process.cwd();
        this.archivesDir = path.join(this.baseDir, 'archives');
        this.imagesDir = path.join(this.baseDir, 'images');
        this.dataDir = path.join(this.baseDir, 'data');
        this.backupDir = path.join(this.baseDir, 'backups');
    }

    /**
     * 初始化文件夹结构
     */
    async initializeDirectories() {
        const dirs = [
            this.archivesDir,
            this.imagesDir,
            this.dataDir,
            this.backupDir
        ];

        for (const dir of dirs) {
            await fs.ensureDir(dir);
        }

        console.log('文件夹结构初始化完成');
    }

    /**
     * 获取当前年份和周数
     * @returns {Object} 包含年份和周数的对象
     */
    getCurrentWeekInfo() {
        const now = moment();
        return {
            year: now.year(),
            week: now.week(),
            date: now.format('YYYY-MM-DD'),
            week_start: now.startOf('week').format('YYYY-MM-DD'),
            week_end: now.endOf('week').format('YYYY-MM-DD')
        };
    }

    /**
     * 创建年份文件夹
     * @param {number} year - 年份
     */
    async createYearDirectory(year) {
        const yearPath = path.join(this.archivesDir, year.toString());
        await fs.ensureDir(yearPath);
        
        const imageYearPath = path.join(this.imagesDir, year.toString());
        await fs.ensureDir(imageYearPath);
        
        return yearPath;
    }

    /**
     * 创建周数文件夹
     * @param {number} year - 年份
     * @param {number} week - 周数
     */
    async createWeekDirectory(year, week) {
        await this.createYearDirectory(year);
        
        const weekPath = path.join(this.archivesDir, year.toString(), `week-${week}`);
        await fs.ensureDir(weekPath);
        
        const imageWeekPath = path.join(this.imagesDir, year.toString(), `week-${week}`);
        await fs.ensureDir(imageWeekPath);
        
        return {
            archivePath: weekPath,
            imagePath: imageWeekPath
        };
    }

    /**
     * 保存周报数据
     * @param {Object} data - 完整的报告数据
     * @param {number} year - 年份（可选，默认当前年）
     * @param {number} week - 周数（可选，默认当前周）
     */
    async saveWeeklyReport(data, year = null, week = null) {
        const weekInfo = this.getCurrentWeekInfo();
        const targetYear = year || weekInfo.year;
        const targetWeek = week || weekInfo.week;

        console.log(`保存 ${targetYear}年第${targetWeek}周的报告数据...`);

        // 创建目录
        const { archivePath } = await this.createWeekDirectory(targetYear, targetWeek);

        // 保存JSON数据
        const jsonPath = path.join(archivePath, 'data.json');
        await fs.writeJSON(jsonPath, data, { spaces: 2 });

        // 保存Markdown报告
        const markdownPath = path.join(archivePath, 'report.md');
        const markdownContent = this.generateMarkdownReport(data);
        await fs.writeFile(markdownPath, markdownContent, 'utf8');

        // 保存简化的归档文件到archives根目录
        const archiveFilePath = path.join(this.archivesDir, targetYear.toString(), `week-${targetWeek}.json`);
        const archiveData = {
            metadata: data.metadata,
            repositories: data.repositories.map(repo => ({
                full_name: repo.full_name,
                rank: repo.rank,
                stars: repo.stars,
                forks: repo.forks,
                overall_score: repo.overall_score
            })),
            generated_at: data.generated_at
        };
        await fs.writeJSON(archiveFilePath, archiveData, { spaces: 2 });

        console.log(`报告已保存到: ${archivePath}`);
        return archivePath;
    }

    /**
     * 生成Markdown报告
     * @param {Object} data - 报告数据
     * @returns {string} Markdown内容
     */
    generateMarkdownReport(data) {
        const { metadata, repositories, statistics } = data;
        
        let markdown = `# ${metadata.report_title}\n\n`;
        markdown += `**生成时间**: ${metadata.generation_date}\n`;
        markdown += `**统计期间**: ${metadata.week_range.start} 至 ${metadata.week_range.end}\n`;
        markdown += `**项目总数**: ${metadata.total_repositories}\n\n`;

        // 统计信息
        markdown += `## 📊 本周统计\n\n`;
        markdown += `- **总Star数**: ${statistics.total_stars.toLocaleString()}\n`;
        markdown += `- **总Fork数**: ${statistics.total_forks.toLocaleString()}\n`;
        markdown += `- **平均Star数**: ${statistics.average_stars.toLocaleString()}\n`;
        markdown += `- **平均Fork数**: ${statistics.average_forks.toLocaleString()}\n\n`;

        // 热门语言
        markdown += `### 🔥 热门编程语言\n\n`;
        statistics.top_languages.forEach((lang, index) => {
            markdown += `${index + 1}. **${lang.name}** (${lang.count} 个项目)\n`;
        });
        markdown += '\n';

        // 项目排行榜
        markdown += `## 🏆 项目排行榜\n\n`;
        
        repositories.forEach((repo, index) => {
            markdown += `### ${index + 1}. ${repo.name} ⭐ ${repo.stars.toLocaleString()}\n\n`;
            
            // 项目图片
            if (repo.images.representative_image) {
                const imagePath = repo.images.representative_image.filepath.replace(process.cwd(), '.');
                markdown += `![${repo.name}](${imagePath})\n\n`;
            }
            
            // AI总结
            if (repo.ai_summary && repo.ai_summary.summary) {
                markdown += `**项目简介**: ${repo.ai_summary.summary}\n\n`;
                
                if (repo.ai_summary.highlights && repo.ai_summary.highlights.length > 0) {
                    markdown += `**主要特点**:\n`;
                    repo.ai_summary.highlights.forEach(highlight => {
                        markdown += `- ${highlight}\n`;
                    });
                    markdown += '\n';
                }
            } else {
                markdown += `**项目简介**: ${repo.description || '暂无描述'}\n\n`;
            }
            
            // 基本信息
            markdown += `**基本信息**:\n`;
            markdown += `- **GitHub**: [${repo.full_name}](${repo.html_url})\n`;
            markdown += `- **主要语言**: ${repo.primary_language || '未知'}\n`;
            markdown += `- **Star数**: ${repo.stars.toLocaleString()}\n`;
            markdown += `- **Fork数**: ${repo.forks.toLocaleString()}\n`;
            
            if (repo.homepage) {
                markdown += `- **官网**: [${repo.homepage}](${repo.homepage})\n`;
            }
            
            // 技术栈
            if (repo.tech_stack.length > 0) {
                markdown += `- **技术栈**: ${repo.tech_stack.slice(0, 6).join(', ')}\n`;
            }
            
            // 趋势信息
            if (repo.trend && !repo.trend.is_new) {
                const trendEmoji = repo.trend.status === 'rising' ? '📈' : 
                                repo.trend.status === 'falling' ? '📉' : '➡️';
                markdown += `- **趋势**: ${trendEmoji} `;
                
                if (repo.trend.star_change > 0) {
                    markdown += `本周新增 ${repo.trend.star_change.toLocaleString()} stars`;
                }
                if (repo.trend.rank_change !== 0) {
                    const direction = repo.trend.rank_change > 0 ? '上升' : '下降';
                    markdown += ` 排名${direction} ${Math.abs(repo.trend.rank_change)} 位`;
                }
                markdown += '\n';
            } else if (repo.trend && repo.trend.is_new) {
                markdown += `- **趋势**: 🆕 新上榜项目\n`;
            }
            
            markdown += '\n---\n\n';
        });

        markdown += `## 📈 数据说明\n\n`;
        markdown += `本排行榜基于以下指标综合评估:\n`;
        markdown += `- **受欢迎程度** (50%): 基于 Star、Fork、Watch 数量\n`;
        markdown += `- **活跃程度** (30%): 基于最近提交、Issues 活跃度\n`;
        markdown += `- **新鲜程度** (20%): 基于项目创建和更新时间\n\n`;
        markdown += `排行榜每周更新，数据来源于 GitHub API，由 AI 生成项目描述。\n\n`;
        markdown += `---\n`;
        markdown += `*本报告由 [GitHub-Trending](https://github.com/your-username/GitHub-Trending) 自动生成*`;

        return markdown;
    }

    /**
     * 加载指定周的数据
     * @param {number} year - 年份
     * @param {number} week - 周数
     * @returns {Promise<Object>} 周数据
     */
    async loadWeeklyData(year, week) {
        const filePath = path.join(this.archivesDir, year.toString(), `week-${week}.json`);
        
        if (await fs.pathExists(filePath)) {
            return await fs.readJSON(filePath);
        }
        
        throw new Error(`未找到 ${year}年第${week}周的数据`);
    }

    /**
     * 获取历史数据列表
     * @returns {Promise<Array>} 历史数据列表
     */
    async getHistoryList() {
        const history = [];
        
        try {
            const years = await fs.readdir(this.archivesDir);
            
            for (const year of years) {
                const yearPath = path.join(this.archivesDir, year);
                const stat = await fs.stat(yearPath);
                
                if (stat.isDirectory() && /^\d{4}$/.test(year)) {
                    const weeks = await fs.readdir(yearPath);
                    
                    for (const week of weeks) {
                        if (week.startsWith('week-') && week.endsWith('.json')) {
                            const weekNum = parseInt(week.replace('week-', '').replace('.json', ''));
                            
                            try {
                                const data = await this.loadWeeklyData(parseInt(year), weekNum);
                                history.push({
                                    year: parseInt(year),
                                    week: weekNum,
                                    title: data.metadata?.report_title || `${year}年第${weekNum}周`,
                                    date: data.metadata?.generation_date || '',
                                    total_repos: data.repositories?.length || 0
                                });
                            } catch (error) {
                                console.warn(`加载历史数据失败 ${year}/week-${weekNum}:`, error.message);
                            }
                        }
                    }
                }
            }
            
            // 按时间倒序排列
            history.sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                return b.week - a.week;
            });
            
        } catch (error) {
            console.warn('获取历史数据列表失败:', error.message);
        }
        
        return history;
    }

    /**
     * 创建数据备份
     * @returns {Promise<string>} 备份文件路径
     */
    async createBackup() {
        const now = moment();
        const backupName = `backup-${now.format('YYYY-MM-DD-HH-mm-ss')}`;
        const backupPath = path.join(this.backupDir, backupName);
        
        await fs.ensureDir(backupPath);
        
        // 备份archives目录
        if (await fs.pathExists(this.archivesDir)) {
            await fs.copy(this.archivesDir, path.join(backupPath, 'archives'));
        }
        
        // 备份data目录
        if (await fs.pathExists(this.dataDir)) {
            await fs.copy(this.dataDir, path.join(backupPath, 'data'));
        }
        
        // 创建备份信息文件
        const backupInfo = {
            created_at: now.toISOString(),
            backup_name: backupName,
            directories: ['archives', 'data'],
            size: await this.calculateDirectorySize(backupPath)
        };
        
        await fs.writeJSON(path.join(backupPath, 'backup-info.json'), backupInfo, { spaces: 2 });
        
        console.log(`备份创建完成: ${backupPath}`);
        return backupPath;
    }

    /**
     * 计算目录大小
     * @param {string} dirPath - 目录路径
     * @returns {Promise<number>} 目录大小（字节）
     */
    async calculateDirectorySize(dirPath) {
        let totalSize = 0;
        
        try {
            const items = await fs.readdir(dirPath);
            
            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stats = await fs.stat(itemPath);
                
                if (stats.isDirectory()) {
                    totalSize += await this.calculateDirectorySize(itemPath);
                } else {
                    totalSize += stats.size;
                }
            }
        } catch (error) {
            console.warn(`计算目录大小失败 ${dirPath}:`, error.message);
        }
        
        return totalSize;
    }

    /**
     * 清理过期数据
     * @param {number} keepWeeks - 保留周数（默认52周，一年）
     */
    async cleanupOldData(keepWeeks = 52) {
        try {
            const cutoffDate = moment().subtract(keepWeeks, 'weeks');
            console.log(`清理 ${cutoffDate.format('YYYY-MM-DD')} 之前的数据...`);
            
            const years = await fs.readdir(this.archivesDir);
            let cleanedCount = 0;
            
            for (const year of years) {
                if (!/^\d{4}$/.test(year)) continue;
                
                const yearNum = parseInt(year);
                const yearPath = path.join(this.archivesDir, year);
                
                if (yearNum < cutoffDate.year()) {
                    // 整年都过期了
                    await fs.remove(yearPath);
                    cleanedCount++;
                    console.log(`删除整年数据: ${year}`);
                } else if (yearNum === cutoffDate.year()) {
                    // 检查年内的周数据
                    const weeks = await fs.readdir(yearPath);
                    
                    for (const week of weeks) {
                        if (week.startsWith('week-')) {
                            const weekNum = parseInt(week.replace('week-', '').replace('.json', ''));
                            
                            if (weekNum < cutoffDate.week()) {
                                const weekPath = path.join(yearPath, week);
                                await fs.remove(weekPath);
                                cleanedCount++;
                                console.log(`删除过期周数据: ${year}/week-${weekNum}`);
                            }
                        }
                    }
                }
            }
            
            console.log(`清理完成，共删除 ${cleanedCount} 个过期数据文件`);
            
        } catch (error) {
            console.error('清理过期数据失败:', error.message);
        }
    }

    /**
     * 获取存储空间使用情况
     * @returns {Promise<Object>} 存储使用情况
     */
    async getStorageUsage() {
        const usage = {
            archives: 0,
            images: 0,
            data: 0,
            backups: 0,
            total: 0
        };
        
        try {
            if (await fs.pathExists(this.archivesDir)) {
                usage.archives = await this.calculateDirectorySize(this.archivesDir);
            }
            
            if (await fs.pathExists(this.imagesDir)) {
                usage.images = await this.calculateDirectorySize(this.imagesDir);
            }
            
            if (await fs.pathExists(this.dataDir)) {
                usage.data = await this.calculateDirectorySize(this.dataDir);
            }
            
            if (await fs.pathExists(this.backupDir)) {
                usage.backups = await this.calculateDirectorySize(this.backupDir);
            }
            
            usage.total = usage.archives + usage.images + usage.data + usage.backups;
            
            // 转换为可读格式
            const formatSize = (bytes) => {
                const units = ['B', 'KB', 'MB', 'GB'];
                let size = bytes;
                let unitIndex = 0;
                
                while (size >= 1024 && unitIndex < units.length - 1) {
                    size /= 1024;
                    unitIndex++;
                }
                
                return `${size.toFixed(2)} ${units[unitIndex]}`;
            };
            
            return {
                raw: usage,
                formatted: {
                    archives: formatSize(usage.archives),
                    images: formatSize(usage.images),
                    data: formatSize(usage.data),
                    backups: formatSize(usage.backups),
                    total: formatSize(usage.total)
                }
            };
            
        } catch (error) {
            console.error('获取存储使用情况失败:', error.message);
            return usage;
        }
    }
}

module.exports = FileManager;