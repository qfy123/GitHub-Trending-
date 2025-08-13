const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

class ReadmeUpdater {
    constructor() {
        this.readmePath = path.join(process.cwd(), 'README.md');
        this.templatePath = path.join(process.cwd(), 'README-template.md');
        
        // 定义更新区域的标记
        this.startMarker = '<!-- TRENDING-START -->';
        this.endMarker = '<!-- TRENDING-END -->';
        this.historyStartMarker = '<!-- HISTORY-START -->';
        this.historyEndMarker = '<!-- HISTORY-END -->';
    }

    /**
     * 更新README文件
     * @param {Object} data - 完整的报告数据
     * @param {Array} historyList - 历史数据列表
     */
    async updateReadme(data, historyList = []) {
        try {
            console.log('开始更新README.md...');
            
            // 确保README文件存在
            await this.ensureReadmeExists();
            
            // 读取当前README内容
            let readmeContent = await fs.readFile(this.readmePath, 'utf8');
            
            // 更新趋势排行榜部分
            readmeContent = this.updateTrendingSection(readmeContent, data);
            
            // 更新历史数据部分
            readmeContent = this.updateHistorySection(readmeContent, historyList);
            
            // 写回文件
            await fs.writeFile(this.readmePath, readmeContent, 'utf8');
            
            console.log('README.md 更新完成');
            
        } catch (error) {
            console.error('更新README失败:', error.message);
            throw error;
        }
    }

    /**
     * 确保README文件存在
     */
    async ensureReadmeExists() {
        if (!(await fs.pathExists(this.readmePath))) {
            // 如果有模板文件，使用模板
            if (await fs.pathExists(this.templatePath)) {
                await fs.copy(this.templatePath, this.readmePath);
            } else {
                // 创建默认README
                const defaultContent = this.generateDefaultReadme();
                await fs.writeFile(this.readmePath, defaultContent, 'utf8');
            }
        }
    }

    /**
     * 生成默认README内容
     * @returns {string} 默认README内容
     */
    generateDefaultReadme() {
        return `# GitHub Trending 排行榜

🔥 每周自动更新GitHub最受欢迎的开源项目排行榜

## 📈 本周排行榜

${this.startMarker}
<!-- 排行榜内容将自动更新到这里 -->
${this.endMarker}

## 📚 历史数据

${this.historyStartMarker}
<!-- 历史数据链接将自动更新到这里 -->
${this.historyEndMarker}

## 🤖 项目说明

本项目每周自动爬取GitHub上最受欢迎的开源项目，并使用AI生成项目描述。

### 特性

- 🔄 每周自动更新
- 🤖 AI智能总结项目特点
- 📊 多维度排名算法
- 🖼️ 自动爬取项目图片
- 📈 趋势分析对比
- 🗂️ 完整历史归档

### 排名算法

综合考虑以下因素：
- **受欢迎程度** (50%): Star、Fork、Watch数量
- **活跃程度** (30%): 最近提交、Issues活跃度  
- **新鲜程度** (20%): 项目创建和更新时间

---

*本项目由 [GitHub Actions](https://github.com/features/actions) 自动维护，数据每周更新*
`;
    }

    /**
     * 更新趋势排行榜部分
     * @param {string} content - README内容
     * @param {Object} data - 报告数据
     * @returns {string} 更新后的内容
     */
    updateTrendingSection(content, data) {
        const trendingContent = this.generateTrendingContent(data);
        
        return this.replaceBetweenMarkers(
            content,
            this.startMarker,
            this.endMarker,
            trendingContent
        );
    }

    /**
     * 更新历史数据部分
     * @param {string} content - README内容
     * @param {Array} historyList - 历史数据列表
     * @returns {string} 更新后的内容
     */
    updateHistorySection(content, historyList) {
        const historyContent = this.generateHistoryContent(historyList);
        
        return this.replaceBetweenMarkers(
            content,
            this.historyStartMarker,
            this.historyEndMarker,
            historyContent
        );
    }

    /**
     * 在标记之间替换内容
     * @param {string} content - 原始内容
     * @param {string} startMarker - 开始标记
     * @param {string} endMarker - 结束标记
     * @param {string} newContent - 新内容
     * @returns {string} 替换后的内容
     */
    replaceBetweenMarkers(content, startMarker, endMarker, newContent) {
        const startIndex = content.indexOf(startMarker);
        const endIndex = content.indexOf(endMarker);
        
        if (startIndex === -1 || endIndex === -1) {
            console.warn(`未找到标记 ${startMarker} 或 ${endMarker}，将追加内容`);
            return content + '\n\n' + startMarker + '\n' + newContent + '\n' + endMarker;
        }
        
        const beforeMarker = content.substring(0, startIndex + startMarker.length);
        const afterMarker = content.substring(endIndex);
        
        return beforeMarker + '\n' + newContent + '\n' + afterMarker;
    }

    /**
     * 生成趋势排行榜内容
     * @param {Object} data - 报告数据
     * @returns {string} Markdown内容
     */
    generateTrendingContent(data) {
        const { metadata, repositories, statistics } = data;
        
        let content = `### ${metadata.report_title}\n\n`;
        content += `**📅 统计周期**: ${metadata.week_range.start} ~ ${metadata.week_range.end}  \n`;
        content += `**📊 项目总数**: ${metadata.total_repositories} 个  \n`;
        content += `**⭐ 总Star数**: ${statistics.total_stars.toLocaleString()}  \n`;
        content += `**🔄 更新时间**: ${metadata.generation_date}  \n\n`;

        // 前10名项目表格
        content += `| 排名 | 项目 | 描述 | Star | Fork | 语言 | 趋势 |\n`;
        content += `|------|------|------|------|------|------|------|\n`;
        
        repositories.slice(0, 10).forEach(repo => {
            const name = `[${repo.name}](${repo.html_url})`;
            const description = this.truncateText(
                repo.ai_summary?.summary || repo.description || '暂无描述', 
                60
            );
            const stars = repo.stars.toLocaleString();
            const forks = repo.forks.toLocaleString();
            const language = repo.primary_language || '-';
            const trend = this.getTrendEmoji(repo.trend);
            
            content += `| ${repo.rank} | ${name} | ${description} | ${stars} | ${forks} | ${language} | ${trend} |\n`;
        });
        
        content += '\n';
        
        // 详细项目信息
        content += `### 🔥 详细介绍\n\n`;
        
        repositories.slice(0, 10).forEach((repo, index) => {
            content += `#### ${index + 1}. [${repo.name}](${repo.html_url}) ![Star](https://img.shields.io/github/stars/${repo.full_name}?style=social)\n\n`;
            
            // 项目图片
            if (repo.images.representative_image) {
                const imagePath = this.getRelativeImagePath(repo.images.representative_image.filepath);
                content += `<img src="${imagePath}" alt="${repo.name}" width="500"/>\n\n`;
            }
            
            // AI总结
            if (repo.ai_summary && repo.ai_summary.summary) {
                content += `**📝 项目简介**: ${repo.ai_summary.summary}\n\n`;
                
                if (repo.ai_summary.highlights && repo.ai_summary.highlights.length > 0) {
                    content += `**✨ 核心特性**:\n`;
                    repo.ai_summary.highlights.slice(0, 3).forEach(highlight => {
                        content += `- ${highlight}\n`;
                    });
                    content += '\n';
                }
            } else {
                content += `**📝 项目简介**: ${repo.description || '暂无描述'}\n\n`;
            }
            
            // 项目统计
            content += `**📊 项目统计**:\n`;
            content += `- **⭐ Star数**: ${repo.stars.toLocaleString()}\n`;
            content += `- **🔀 Fork数**: ${repo.forks.toLocaleString()}\n`;
            content += `- **👀 Watch数**: ${repo.watchers.toLocaleString()}\n`;
            content += `- **📝 语言**: ${repo.primary_language || '未知'}\n`;
            
            if (repo.homepage) {
                content += `- **🌐 官网**: [${repo.homepage}](${repo.homepage})\n`;
            }
            
            // 技术栈
            if (repo.tech_stack && repo.tech_stack.length > 0) {
                content += `- **💻 技术栈**: ${repo.tech_stack.slice(0, 6).map(tech => `${tech}`).join(', ')}\n`;
            }
            
            // 趋势信息
            if (repo.trend) {
                content += `- **📈 趋势**: ${this.getTrendDescription(repo.trend)}\n`;
            }
            
            content += '\n---\n\n';
        });
        
        // 统计信息
        content += `### 📈 本周统计\n\n`;
        
        if (statistics.top_languages && statistics.top_languages.length > 0) {
            content += `**🔥 热门语言**:\n`;
            statistics.top_languages.slice(0, 5).forEach((lang, index) => {
                content += `${index + 1}. **${lang.name}** (${lang.count} 个项目)\n`;
            });
            content += '\n';
        }
        
        if (statistics.top_topics && statistics.top_topics.length > 0) {
            content += `**🏷️ 热门话题**:\n`;
            statistics.top_topics.slice(0, 8).forEach((topic, index) => {
                content += `${index + 1}. ${topic.name} (${topic.count})\n`;
            });
            content += '\n';
        }
        
        return content;
    }

    /**
     * 生成历史数据内容
     * @param {Array} historyList - 历史数据列表
     * @returns {string} Markdown内容
     */
    generateHistoryContent(historyList) {
        if (!historyList || historyList.length === 0) {
            return `暂无历史数据`;
        }
        
        let content = `| 时间 | 周期 | 项目数 | 链接 |\n`;
        content += `|------|------|--------|------|\n`;
        
        historyList.slice(0, 20).forEach(item => {
            const date = moment(item.date).format('MM-DD') || `第${item.week}周`;
            const period = `${item.year}年第${item.week}周`;
            const repos = `${item.total_repos} 个`;
            const link = `[查看详情](./archives/${item.year}/week-${item.week}/report.md)`;
            
            content += `| ${date} | ${period} | ${repos} | ${link} |\n`;
        });
        
        if (historyList.length > 20) {
            content += '\n[查看完整历史数据](./archives/)';
        }
        
        return content;
    }

    /**
     * 获取趋势emoji
     * @param {Object} trend - 趋势对象
     * @returns {string} 趋势emoji
     */
    getTrendEmoji(trend) {
        if (!trend) return '-';
        
        if (trend.is_new) return '🆕';
        
        switch (trend.status) {
            case 'rising': return '📈';
            case 'falling': return '📉';
            default: return '➡️';
        }
    }

    /**
     * 获取趋势描述
     * @param {Object} trend - 趋势对象
     * @returns {string} 趋势描述
     */
    getTrendDescription(trend) {
        if (!trend) return '无趋势数据';
        
        if (trend.is_new) {
            return '🆕 新上榜项目';
        }
        
        let description = '';
        
        if (trend.star_change > 0) {
            description += `本周新增 ${trend.star_change.toLocaleString()} stars`;
        }
        
        if (trend.rank_change !== 0) {
            const direction = trend.rank_change > 0 ? '上升' : '下降';
            const change = Math.abs(trend.rank_change);
            description += `${description ? ', ' : ''}排名${direction} ${change} 位`;
        }
        
        if (!description) {
            description = '排名稳定';
        }
        
        const statusEmoji = this.getTrendEmoji(trend);
        return `${statusEmoji} ${description}`;
    }

    /**
     * 截断文本
     * @param {string} text - 原始文本
     * @param {number} maxLength - 最大长度
     * @returns {string} 截断后的文本
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        
        text = text.replace(/\n/g, ' ').trim();
        
        if (text.length <= maxLength) return text;
        
        return text.substring(0, maxLength - 3) + '...';
    }

    /**
     * 获取相对图片路径
     * @param {string} absolutePath - 绝对路径
     * @returns {string} 相对路径
     */
    getRelativeImagePath(absolutePath) {
        const projectRoot = process.cwd();
        return absolutePath.replace(projectRoot, '.').replace(/\\/g, '/');
    }

    /**
     * 创建README模板文件
     */
    async createTemplate() {
        const templateContent = this.generateDefaultReadme();
        await fs.writeFile(this.templatePath, templateContent, 'utf8');
        console.log(`README模板已创建: ${this.templatePath}`);
    }

    /**
     * 验证README格式
     * @returns {Promise<Object>} 验证结果
     */
    async validateReadme() {
        try {
            if (!(await fs.pathExists(this.readmePath))) {
                return {
                    valid: false,
                    errors: ['README.md 文件不存在']
                };
            }
            
            const content = await fs.readFile(this.readmePath, 'utf8');
            const errors = [];
            
            if (content.indexOf(this.startMarker) === -1) {
                errors.push(`缺少开始标记: ${this.startMarker}`);
            }
            
            if (content.indexOf(this.endMarker) === -1) {
                errors.push(`缺少结束标记: ${this.endMarker}`);
            }
            
            if (content.indexOf(this.historyStartMarker) === -1) {
                errors.push(`缺少历史开始标记: ${this.historyStartMarker}`);
            }
            
            if (content.indexOf(this.historyEndMarker) === -1) {
                errors.push(`缺少历史结束标记: ${this.historyEndMarker}`);
            }
            
            return {
                valid: errors.length === 0,
                errors: errors
            };
            
        } catch (error) {
            return {
                valid: false,
                errors: [`验证失败: ${error.message}`]
            };
        }
    }
}

module.exports = ReadmeUpdater;