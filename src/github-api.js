const axios = require('axios');
require('dotenv').config();

class GitHubAPI {
    constructor() {
        this.baseURL = 'https://api.github.com';
        this.token = process.env.GITHUB_TOKEN;
        this.headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitHub-Trending-Bot'
        };
        
        if (this.token) {
            this.headers['Authorization'] = `token ${this.token}`;
        }

        this.client = axios.create({
            baseURL: this.baseURL,
            headers: this.headers,
            timeout: 30000
        });
    }

    /**
     * 获取GitHub trending repositories
     * @param {string} since - 时间范围: daily, weekly, monthly
     * @param {string} language - 编程语言过滤
     * @param {number} limit - 返回数量限制
     * @returns {Promise<Array>} 趋势项目列表
     */
    async getTrendingRepos(since = 'weekly', language = '', limit = 10) {
        try {
            // 构建搜索查询
            const today = new Date();
            const date = new Date(today);
            
            if (since === 'weekly') {
                date.setDate(today.getDate() - 7);
            } else if (since === 'monthly') {
                date.setDate(today.getDate() - 30);
            } else {
                date.setDate(today.getDate() - 1);
            }

            const dateStr = date.toISOString().split('T')[0];
            let query = `created:>${dateStr}`;
            
            if (language) {
                query += ` language:${language}`;
            }

            const response = await this.client.get('/search/repositories', {
                params: {
                    q: query,
                    sort: 'stars',
                    order: 'desc',
                    per_page: limit
                }
            });

            return response.data.items;
        } catch (error) {
            console.error('获取trending repos失败:', error.message);
            throw error;
        }
    }

    /**
     * 获取仓库详细信息
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @returns {Promise<Object>} 仓库详细信息
     */
    async getRepoDetails(owner, repo) {
        try {
            const response = await this.client.get(`/repos/${owner}/${repo}`);
            return response.data;
        } catch (error) {
            console.error(`获取仓库详情失败 ${owner}/${repo}:`, error.message);
            throw error;
        }
    }

    /**
     * 获取仓库README内容
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @returns {Promise<string>} README内容
     */
    async getRepoReadme(owner, repo) {
        try {
            const response = await this.client.get(`/repos/${owner}/${repo}/readme`);
            
            // 解码base64内容
            const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
            return content;
        } catch (error) {
            console.error(`获取README失败 ${owner}/${repo}:`, error.message);
            return '';
        }
    }

    /**
     * 获取仓库的主要编程语言
     * @param {string} owner - 仓库所有者
     * @param {string} repo - 仓库名称
     * @returns {Promise<Object>} 语言统计
     */
    async getRepoLanguages(owner, repo) {
        try {
            const response = await this.client.get(`/repos/${owner}/${repo}/languages`);
            return response.data;
        } catch (error) {
            console.error(`获取语言统计失败 ${owner}/${repo}:`, error.message);
            return {};
        }
    }

    /**
     * 批量获取仓库完整信息
     * @param {Array} repos - 基础仓库信息数组
     * @returns {Promise<Array>} 完整的仓库信息数组
     */
    async getReposFullInfo(repos) {
        const fullInfoRepos = [];

        for (const repo of repos) {
            try {
                console.log(`正在获取 ${repo.full_name} 的详细信息...`);
                
                // 获取详细信息、README和语言统计
                const [details, readme, languages] = await Promise.all([
                    this.getRepoDetails(repo.owner.login, repo.name),
                    this.getRepoReadme(repo.owner.login, repo.name),
                    this.getRepoLanguages(repo.owner.login, repo.name)
                ]);

                const fullInfo = {
                    ...details,
                    readme_content: readme,
                    languages: languages,
                    // 计算主要语言
                    primary_language: this.getPrimaryLanguage(languages),
                    // 提取技术栈标签
                    tech_stack: this.extractTechStack(details, languages, readme)
                };

                fullInfoRepos.push(fullInfo);
                
                // 添加延迟避免API限制
                await this.delay(1000);
                
            } catch (error) {
                console.error(`处理仓库 ${repo.full_name} 时出错:`, error.message);
                // 即使出错也要继续处理其他仓库
                fullInfoRepos.push({
                    ...repo,
                    readme_content: '',
                    languages: {},
                    primary_language: repo.language || 'Unknown',
                    tech_stack: []
                });
            }
        }

        return fullInfoRepos;
    }

    /**
     * 获取主要编程语言
     * @param {Object} languages - 语言统计对象
     * @returns {string} 主要语言
     */
    getPrimaryLanguage(languages) {
        if (!languages || Object.keys(languages).length === 0) {
            return 'Unknown';
        }
        
        return Object.keys(languages).reduce((a, b) => 
            languages[a] > languages[b] ? a : b
        );
    }

    /**
     * 提取技术栈信息
     * @param {Object} repo - 仓库信息
     * @param {Object} languages - 语言统计
     * @param {string} readme - README内容
     * @returns {Array} 技术栈数组
     */
    extractTechStack(repo, languages, readme) {
        const techStack = new Set();
        
        // 从语言统计中添加
        Object.keys(languages).forEach(lang => techStack.add(lang));
        
        // 从topics中添加
        if (repo.topics) {
            repo.topics.forEach(topic => techStack.add(topic));
        }
        
        // 从README中提取常见技术栈关键词
        const techKeywords = [
            'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Django', 'Flask',
            'Spring', 'Docker', 'Kubernetes', 'Redis', 'MongoDB', 'PostgreSQL',
            'MySQL', 'TypeScript', 'GraphQL', 'REST API', 'Microservices',
            'AWS', 'Azure', 'GCP', 'Terraform', 'Ansible'
        ];
        
        const readmeUpper = readme.toUpperCase();
        techKeywords.forEach(keyword => {
            if (readmeUpper.includes(keyword.toUpperCase())) {
                techStack.add(keyword);
            }
        });
        
        return Array.from(techStack).slice(0, 8); // 限制数量
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 检查API限制状态
     * @returns {Promise<Object>} API限制信息
     */
    async checkRateLimit() {
        try {
            const response = await this.client.get('/rate_limit');
            return response.data;
        } catch (error) {
            console.error('检查API限制失败:', error.message);
            throw error;
        }
    }
}

module.exports = GitHubAPI;