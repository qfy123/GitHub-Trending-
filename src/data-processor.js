const moment = require('moment');
const fs = require('fs-extra');
const path = require('path');

class DataProcessor {
    constructor() {
        this.dataDir = path.join(process.cwd(), 'data');
        this.archiveDir = path.join(process.cwd(), 'archives');
    }

    /**
     * 处理完整的项目数据
     * @param {Array} repos - 原始项目数据
     * @param {Array} aiSummaries - AI总结数据
     * @param {Array} imageData - 图片数据
     * @returns {Promise<Object>} 处理后的完整数据
     */
    async processCompleteData(repos, aiSummaries, imageData) {
        console.log('开始处理完整数据...');
        
        // 合并所有数据
        const mergedData = this.mergeAllData(repos, aiSummaries, imageData);
        
        // 计算排名和统计信息
        const rankedData = this.calculateRankings(mergedData);
        
        // 添加趋势分析
        const trendData = await this.addTrendAnalysis(rankedData);
        
        // 生成报告元数据
        const reportMeta = this.generateReportMetadata(trendData);
        
        // 构建最终数据结构
        const finalData = {
            metadata: reportMeta,
            repositories: trendData,
            statistics: this.calculateStatistics(trendData),
            generated_at: new Date().toISOString()
        };
        
        // 保存处理后的数据
        await this.saveProcessedData(finalData);
        
        console.log(`数据处理完成，共处理 ${trendData.length} 个项目`);
        return finalData;
    }

    /**
     * 合并所有数据源
     * @param {Array} repos - 仓库基础数据
     * @param {Array} aiSummaries - AI总结数据
     * @param {Array} imageData - 图片数据
     * @returns {Array} 合并后的数据
     */
    mergeAllData(repos, aiSummaries, imageData) {
        const merged = [];
        
        for (const repo of repos) {
            // 查找对应的AI总结
            const aiSummary = aiSummaries.find(ai => ai.full_name === repo.full_name);
            
            // 查找对应的图片数据
            const images = imageData.find(img => img.repo_name === repo.full_name);
            
            const mergedRepo = {
                // 基础信息
                rank: 0, // 稍后计算
                name: repo.name,
                full_name: repo.full_name,
                owner: repo.owner.login,
                avatar_url: repo.owner.avatar_url,
                
                // 项目统计
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                issues: repo.open_issues_count,
                watchers: repo.watchers_count,
                
                // 项目信息
                description: repo.description || '',
                homepage: repo.homepage,
                clone_url: repo.clone_url,
                ssh_url: repo.ssh_url,
                html_url: repo.html_url,
                
                // 技术信息
                language: repo.language,
                primary_language: repo.primary_language,
                languages: repo.languages || {},
                tech_stack: repo.tech_stack || [],
                topics: repo.topics || [],
                
                // 时间信息
                created_at: repo.created_at,
                updated_at: repo.updated_at,
                pushed_at: repo.pushed_at,
                
                // AI总结
                ai_summary: aiSummary ? aiSummary.ai_summary : null,
                
                // 图片信息
                images: images ? {
                    total_count: images.total_images,
                    image_list: images.images,
                    image_dir: images.image_dir,
                    representative_image: this.selectRepresentativeImage(images.images)
                } : {
                    total_count: 0,
                    image_list: [],
                    image_dir: null,
                    representative_image: null
                },
                
                // 计算得出的指标
                activity_score: this.calculateActivityScore(repo),
                popularity_score: this.calculatePopularityScore(repo),
                freshness_score: this.calculateFreshnessScore(repo),
                overall_score: 0 // 稍后计算
            };
            
            // 计算综合评分
            mergedRepo.overall_score = this.calculateOverallScore(mergedRepo);
            
            merged.push(mergedRepo);
        }
        
        return merged;
    }

    /**
     * 选择代表性图片
     * @param {Array} images - 图片列表
     * @returns {Object|null} 代表性图片信息
     */
    selectRepresentativeImage(images) {
        if (!images || images.length === 0) return null;
        
        // 优先选择包含logo、icon、banner等关键词的图片
        const keywords = ['logo', 'icon', 'banner', 'cover', 'preview', 'demo'];
        
        for (const keyword of keywords) {
            const found = images.find(img => 
                img.filename.toLowerCase().includes(keyword) ||
                img.original_url.toLowerCase().includes(keyword)
            );
            if (found) return found;
        }
        
        // 如果没有找到，返回第一张图片
        return images[0];
    }

    /**
     * 计算活跃度评分
     * @param {Object} repo - 仓库信息
     * @returns {number} 活跃度评分 (0-100)
     */
    calculateActivityScore(repo) {
        const now = moment();
        const lastPush = moment(repo.pushed_at);
        const daysSinceLastPush = now.diff(lastPush, 'days');
        
        // 最近推送得分 (50%)
        let pushScore = Math.max(0, 100 - daysSinceLastPush * 2);
        
        // Issues活跃度得分 (30%)
        const issuesScore = Math.min(100, repo.open_issues_count * 2);
        
        // Fork活跃度得分 (20%)
        const forkScore = Math.min(100, repo.forks_count / 10);
        
        return Math.round(pushScore * 0.5 + issuesScore * 0.3 + forkScore * 0.2);
    }

    /**
     * 计算受欢迎程度评分
     * @param {Object} repo - 仓库信息
     * @returns {number} 受欢迎程度评分 (0-100)
     */
    calculatePopularityScore(repo) {
        // Stars权重最高 (60%)
        const starsScore = Math.min(100, Math.log10(repo.stargazers_count + 1) * 20);
        
        // Forks得分 (25%)
        const forksScore = Math.min(100, Math.log10(repo.forks_count + 1) * 25);
        
        // Watchers得分 (15%)
        const watchersScore = Math.min(100, Math.log10(repo.watchers_count + 1) * 30);
        
        return Math.round(starsScore * 0.6 + forksScore * 0.25 + watchersScore * 0.15);
    }

    /**
     * 计算新鲜度评分
     * @param {Object} repo - 仓库信息
     * @returns {number} 新鲜度评分 (0-100)
     */
    calculateFreshnessScore(repo) {
        const now = moment();
        const created = moment(repo.created_at);
        const updated = moment(repo.updated_at);
        
        const daysSinceCreated = now.diff(created, 'days');
        const daysSinceUpdated = now.diff(updated, 'days');
        
        // 创建时间得分 - 新项目得分高
        const createdScore = daysSinceCreated < 365 ? 100 - (daysSinceCreated / 365) * 50 : 50;
        
        // 更新时间得分 - 最近更新得分高
        const updatedScore = Math.max(0, 100 - daysSinceUpdated * 3);
        
        return Math.round(createdScore * 0.3 + updatedScore * 0.7);
    }

    /**
     * 计算综合评分
     * @param {Object} repo - 仓库信息
     * @returns {number} 综合评分 (0-100)
     */
    calculateOverallScore(repo) {
        return Math.round(
            repo.popularity_score * 0.5 +
            repo.activity_score * 0.3 +
            repo.freshness_score * 0.2
        );
    }

    /**
     * 计算排名
     * @param {Array} repos - 仓库数组
     * @returns {Array} 排序后的仓库数组
     */
    calculateRankings(repos) {
        // 按综合评分排序
        repos.sort((a, b) => b.overall_score - a.overall_score);
        
        // 分配排名
        repos.forEach((repo, index) => {
            repo.rank = index + 1;
        });
        
        return repos;
    }

    /**
     * 添加趋势分析
     * @param {Array} repos - 仓库数组
     * @returns {Promise<Array>} 带趋势分析的仓库数组
     */
    async addTrendAnalysis(repos) {
        try {
            // 尝试加载上周数据进行对比
            const lastWeekData = await this.loadLastWeekData();
            
            for (const repo of repos) {
                repo.trend = this.calculateTrend(repo, lastWeekData);
            }
        } catch (error) {
            console.log('无法加载历史数据进行趋势分析:', error.message);
            // 如果没有历史数据，设置为新项目
            repos.forEach(repo => {
                repo.trend = {
                    status: 'new',
                    star_change: 0,
                    rank_change: 0,
                    is_new: true
                };
            });
        }
        
        return repos;
    }

    /**
     * 计算趋势变化
     * @param {Object} repo - 当前仓库数据
     * @param {Array} lastWeekData - 上周数据
     * @returns {Object} 趋势信息
     */
    calculateTrend(repo, lastWeekData) {
        if (!lastWeekData) {
            return {
                status: 'new',
                star_change: 0,
                rank_change: 0,
                is_new: true
            };
        }
        
        const lastWeekRepo = lastWeekData.find(r => r.full_name === repo.full_name);
        
        if (!lastWeekRepo) {
            return {
                status: 'new',
                star_change: 0,
                rank_change: 0,
                is_new: true
            };
        }
        
        const starChange = repo.stars - lastWeekRepo.stars;
        const rankChange = lastWeekRepo.rank - repo.rank; // 正值表示排名上升
        
        let status = 'stable';
        if (rankChange > 0) status = 'rising';
        else if (rankChange < 0) status = 'falling';
        
        return {
            status,
            star_change: starChange,
            rank_change: rankChange,
            is_new: false,
            last_week_rank: lastWeekRepo.rank,
            last_week_stars: lastWeekRepo.stars
        };
    }

    /**
     * 生成报告元数据
     * @param {Array} repos - 仓库数组
     * @returns {Object} 报告元数据
     */
    generateReportMetadata(repos) {
        const now = moment();
        const year = now.year();
        const week = now.week();
        
        return {
            report_title: `GitHub趋势排行榜 - ${year}年第${week}周`,
            year: year,
            week: week,
            week_range: {
                start: now.startOf('week').format('YYYY-MM-DD'),
                end: now.endOf('week').format('YYYY-MM-DD')
            },
            total_repositories: repos.length,
            generation_date: now.format('YYYY-MM-DD HH:mm:ss'),
            next_update: now.add(1, 'week').format('YYYY-MM-DD')
        };
    }

    /**
     * 计算统计信息
     * @param {Array} repos - 仓库数组
     * @returns {Object} 统计信息
     */
    calculateStatistics(repos) {
        if (repos.length === 0) return {};
        
        const languages = {};
        const topics = {};
        let totalStars = 0;
        let totalForks = 0;
        
        repos.forEach(repo => {
            // 统计语言
            if (repo.primary_language) {
                languages[repo.primary_language] = (languages[repo.primary_language] || 0) + 1;
            }
            
            // 统计话题
            repo.topics.forEach(topic => {
                topics[topic] = (topics[topic] || 0) + 1;
            });
            
            totalStars += repo.stars;
            totalForks += repo.forks;
        });
        
        return {
            total_stars: totalStars,
            total_forks: totalForks,
            average_stars: Math.round(totalStars / repos.length),
            average_forks: Math.round(totalForks / repos.length),
            top_languages: this.getTopItems(languages, 5),
            top_topics: this.getTopItems(topics, 10),
            score_distribution: this.calculateScoreDistribution(repos)
        };
    }

    /**
     * 获取排名前N的项目
     * @param {Object} items - 项目对象
     * @param {number} count - 数量
     * @returns {Array} 排序后的项目数组
     */
    getTopItems(items, count) {
        return Object.entries(items)
            .sort(([,a], [,b]) => b - a)
            .slice(0, count)
            .map(([name, count]) => ({ name, count }));
    }

    /**
     * 计算评分分布
     * @param {Array} repos - 仓库数组
     * @returns {Object} 评分分布
     */
    calculateScoreDistribution(repos) {
        const scores = repos.map(r => r.overall_score);
        
        return {
            min: Math.min(...scores),
            max: Math.max(...scores),
            average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            median: this.calculateMedian(scores)
        };
    }

    /**
     * 计算中位数
     * @param {Array} numbers - 数字数组
     * @returns {number} 中位数
     */
    calculateMedian(numbers) {
        const sorted = numbers.sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        
        if (sorted.length % 2 === 0) {
            return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
        }
        
        return sorted[middle];
    }

    /**
     * 保存处理后的数据
     * @param {Object} data - 处理后的数据
     */
    async saveProcessedData(data) {
        await fs.ensureDir(this.dataDir);
        
        const filePath = path.join(this.dataDir, 'trending-repos.json');
        await fs.writeJSON(filePath, data, { spaces: 2 });
        
        console.log(`数据已保存到: ${filePath}`);
    }

    /**
     * 加载上周数据
     * @returns {Promise<Array>} 上周数据
     */
    async loadLastWeekData() {
        const lastWeek = moment().subtract(1, 'week');
        const year = lastWeek.year();
        const week = lastWeek.week();
        
        const archiveFile = path.join(this.archiveDir, year.toString(), `week-${week}.json`);
        
        if (await fs.pathExists(archiveFile)) {
            const data = await fs.readJSON(archiveFile);
            return data.repositories || [];
        }
        
        throw new Error('没有找到上周数据');
    }

    /**
     * 格式化数据用于输出
     * @param {Object} data - 完整数据
     * @param {number} limit - 输出数量限制
     * @returns {Object} 格式化后的数据
     */
    formatForDisplay(data, limit = 10) {
        const topRepos = data.repositories.slice(0, limit);
        
        return {
            metadata: data.metadata,
            repositories: topRepos.map(repo => ({
                rank: repo.rank,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                stars: repo.stars.toLocaleString(),
                forks: repo.forks.toLocaleString(),
                language: repo.primary_language,
                tech_stack: repo.tech_stack.slice(0, 5),
                ai_summary: repo.ai_summary?.summary || '暂无AI总结',
                homepage: repo.homepage,
                github_url: repo.html_url,
                representative_image: repo.images.representative_image,
                trend: repo.trend,
                scores: {
                    overall: repo.overall_score,
                    popularity: repo.popularity_score,
                    activity: repo.activity_score,
                    freshness: repo.freshness_score
                }
            })),
            statistics: data.statistics
        };
    }
}

module.exports = DataProcessor;