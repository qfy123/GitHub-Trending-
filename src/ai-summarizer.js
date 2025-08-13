const axios = require('axios');
require('dotenv').config();

class AISummarizer {
    constructor() {
        this.apiKey = process.env.SILICONFLOW_API_KEY;
        this.baseURL = process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1';
        this.model = process.env.AI_MODEL || 'deepseek-chat';
        
        if (!this.apiKey) {
            throw new Error('请设置 SILICONFLOW_API_KEY 环境变量');
        }

        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });

        // 缓存已总结的项目，避免重复调用
        this.cache = new Map();
    }

    /**
     * 为GitHub项目生成AI总结
     * @param {Object} repo - 项目信息
     * @returns {Promise<Object>} 包含总结信息的对象
     */
    async summarizeProject(repo) {
        const cacheKey = `${repo.full_name}-${repo.updated_at}`;
        
        // 检查缓存
        if (this.cache.has(cacheKey)) {
            console.log(`使用缓存的总结: ${repo.full_name}`);
            return this.cache.get(cacheKey);
        }

        try {
            console.log(`正在为 ${repo.full_name} 生成AI总结...`);
            
            const prompt = this.buildPrompt(repo);
            const summary = await this.callAI(prompt);
            
            const result = this.parseAIResponse(summary, repo);
            
            // 缓存结果
            this.cache.set(cacheKey, result);
            
            return result;
            
        } catch (error) {
            console.error(`AI总结失败 ${repo.full_name}:`, error.message);
            
            // 返回备用总结
            return this.getFallbackSummary(repo);
        }
    }

    /**
     * 构建AI提示词
     * @param {Object} repo - 项目信息
     * @returns {string} 提示词
     */
    buildPrompt(repo) {
        const readmePreview = this.extractReadmePreview(repo.readme_content);
        const techStack = repo.tech_stack ? repo.tech_stack.join(', ') : '未知';
        
        return `你是一个专业的GitHub项目分析师。请基于以下信息，用简洁的中文总结这个开源项目：

项目名称: ${repo.name}
完整名称: ${repo.full_name}
主要语言: ${repo.primary_language || repo.language || '未知'}
Star数量: ${repo.stargazers_count.toLocaleString()}
Fork数量: ${repo.forks_count.toLocaleString()}
项目描述: ${repo.description || '暂无描述'}
技术栈: ${techStack}
主要话题: ${repo.topics ? repo.topics.join(', ') : '无'}
README预览: ${readmePreview}

请按以下JSON格式返回（只返回JSON，不要其他文字）：
{
  "summary": "项目核心功能的简洁描述（40-80字）",
  "highlights": ["特点1", "特点2", "特点3"],
  "tech_summary": "主要技术栈总结（10-20字）",
  "use_case": "主要应用场景（15-30字）"
}

要求：
1. 语言简洁专业，突出项目价值
2. 避免过于技术化的描述
3. 重点说明项目解决什么问题
4. 如果是热门项目要说明其受欢迎的原因`;
    }

    /**
     * 提取README预览内容
     * @param {string} readme - README完整内容
     * @returns {string} 预览内容
     */
    extractReadmePreview(readme) {
        if (!readme) return '暂无README';
        
        // 移除markdown语法和多余空白
        let preview = readme
            .replace(/!\[.*?\]\(.*?\)/g, '') // 移除图片
            .replace(/\[.*?\]\(.*?\)/g, '$1') // 移除链接格式保留文字
            .replace(/#{1,6}\s*/g, '') // 移除标题符号
            .replace(/\*\*(.+?)\*\*/g, '$1') // 移除粗体格式
            .replace(/\*(.+?)\*/g, '$1') // 移除斜体格式
            .replace(/`(.+?)`/g, '$1') // 移除代码格式
            .replace(/```[\s\S]*?```/g, '[代码示例]') // 移除代码块
            .replace(/\n+/g, ' ') // 合并换行
            .trim();
        
        // 取前500字符
        return preview.substring(0, 500);
    }

    /**
     * 调用AI API
     * @param {string} prompt - 提示词
     * @returns {Promise<string>} AI响应
     */
    async callAI(prompt) {
        try {
            const response = await this.client.post('/chat/completions', {
                model: this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1000
            });

            return response.data.choices[0].message.content.trim();
        } catch (error) {
            if (error.response) {
                throw new Error(`AI API错误: ${error.response.status} - ${error.response.data.error?.message || error.response.statusText}`);
            }
            throw error;
        }
    }

    /**
     * 解析AI响应
     * @param {string} response - AI响应内容
     * @param {Object} repo - 原始项目信息
     * @returns {Object} 解析后的总结对象
     */
    parseAIResponse(response, repo) {
        try {
            // 尝试解析JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    summary: parsed.summary || this.generateFallbackSummary(repo),
                    highlights: parsed.highlights || [],
                    tech_summary: parsed.tech_summary || repo.primary_language || '多种技术',
                    use_case: parsed.use_case || '开发工具',
                    source: 'ai'
                };
            }
        } catch (error) {
            console.warn('解析AI响应失败，使用文本模式');
        }

        // 如果JSON解析失败，尝试从文本中提取信息
        return {
            summary: this.extractSummaryFromText(response, repo),
            highlights: [],
            tech_summary: repo.primary_language || '多种技术',
            use_case: '开发工具',
            source: 'ai_text'
        };
    }

    /**
     * 从文本中提取总结
     * @param {string} text - AI响应文本
     * @param {Object} repo - 项目信息
     * @returns {string} 提取的总结
     */
    extractSummaryFromText(text, repo) {
        // 简单的文本处理逻辑
        const sentences = text.split(/[。！？.!?]/);
        const validSentences = sentences.filter(s => s.trim().length > 10 && s.trim().length < 200);
        
        if (validSentences.length > 0) {
            return validSentences[0].trim();
        }
        
        return this.generateFallbackSummary(repo);
    }

    /**
     * 生成备用总结
     * @param {Object} repo - 项目信息
     * @returns {string} 备用总结
     */
    generateFallbackSummary(repo) {
        const language = repo.primary_language || repo.language || '多种语言';
        const stars = repo.stargazers_count.toLocaleString();
        
        if (repo.description) {
            return `一个使用${language}开发的开源项目：${repo.description}，已获得${stars}个star。`;
        }
        
        return `一个热门的${language}开源项目，在GitHub上获得了${stars}个star，值得关注。`;
    }

    /**
     * 获取备用总结对象
     * @param {Object} repo - 项目信息
     * @returns {Object} 备用总结对象
     */
    getFallbackSummary(repo) {
        return {
            summary: this.generateFallbackSummary(repo),
            highlights: [`${repo.stargazers_count.toLocaleString()} stars`, `${repo.primary_language || '多语言'}`],
            tech_summary: repo.primary_language || '多种技术',
            use_case: '开发工具',
            source: 'fallback'
        };
    }

    /**
     * 批量处理项目总结
     * @param {Array} repos - 项目数组
     * @returns {Promise<Array>} 带总结的项目数组
     */
    async batchSummarize(repos) {
        const results = [];
        
        for (let i = 0; i < repos.length; i++) {
            const repo = repos[i];
            try {
                const summary = await this.summarizeProject(repo);
                results.push({
                    ...repo,
                    ai_summary: summary
                });
                
                console.log(`完成 ${i + 1}/${repos.length}: ${repo.full_name}`);
                
                // 添加延迟避免API限制
                if (i < repos.length - 1) {
                    await this.delay(2000);
                }
                
            } catch (error) {
                console.error(`批量处理失败 ${repo.full_name}:`, error.message);
                results.push({
                    ...repo,
                    ai_summary: this.getFallbackSummary(repo)
                });
            }
        }
        
        return results;
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * 获取缓存状态
     * @returns {Object} 缓存统计信息
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

module.exports = AISummarizer;