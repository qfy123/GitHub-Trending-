const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');
const url = require('url');

class ImageCrawler {
    constructor() {
        this.supportedFormats = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.timeout = 30000; // 30秒
        this.baseImagesDir = path.join(process.cwd(), 'images');
    }

    /**
     * 为项目爬取图片
     * @param {Object} repo - 项目信息
     * @param {string} year - 年份
     * @param {string} week - 周数
     * @returns {Promise<Object>} 包含图片信息的对象
     */
    async crawlProjectImages(repo, year, week) {
        try {
            console.log(`正在爬取 ${repo.full_name} 的图片...`);
            
            const projectDir = this.getProjectImageDir(repo.name, year, week);
            await fs.ensureDir(projectDir);
            
            const images = await this.extractImagesFromReadme(repo, projectDir);
            
            return {
                repo_name: repo.full_name,
                total_images: images.length,
                images: images,
                image_dir: projectDir
            };
            
        } catch (error) {
            console.error(`爬取图片失败 ${repo.full_name}:`, error.message);
            return {
                repo_name: repo.full_name,
                total_images: 0,
                images: [],
                image_dir: null,
                error: error.message
            };
        }
    }

    /**
     * 获取项目图片存储目录
     * @param {string} repoName - 项目名称
     * @param {string} year - 年份
     * @param {string} week - 周数
     * @returns {string} 目录路径
     */
    getProjectImageDir(repoName, year, week) {
        const safeName = this.sanitizeFileName(repoName);
        return path.join(this.baseImagesDir, year, `week-${week}`, safeName);
    }

    /**
     * 从README中提取并下载图片
     * @param {Object} repo - 项目信息
     * @param {string} targetDir - 目标目录
     * @returns {Promise<Array>} 图片信息数组
     */
    async extractImagesFromReadme(repo, targetDir) {
        const images = [];
        const readme = repo.readme_content;
        
        if (!readme) {
            console.log(`${repo.full_name} 没有README内容`);
            return images;
        }

        // 解析Markdown中的图片
        const markdownImages = this.parseMarkdownImages(readme);
        
        // 解析HTML中的图片（如果README包含HTML）
        const htmlImages = this.parseHtmlImages(readme);
        
        // 合并并去重
        const allImageUrls = [...new Set([...markdownImages, ...htmlImages])];
        
        console.log(`发现 ${allImageUrls.length} 个图片链接在 ${repo.full_name}`);
        
        // 只处理第一张图片
        if (allImageUrls.length > 0) {
            const imageUrl = allImageUrls[0];
            try {
                const absoluteUrl = this.resolveImageUrl(imageUrl, repo);
                const imageInfo = await this.downloadImage(absoluteUrl, targetDir, 0);
                
                if (imageInfo) {
                    images.push({
                        ...imageInfo,
                        original_url: imageUrl,
                        absolute_url: absoluteUrl
                    });
                    console.log(`✅ 成功下载项目代表图片: ${imageInfo.filename}`);
                }
                
            } catch (error) {
                console.warn(`下载图片失败 ${imageUrl}:`, error.message);
            }
        } else {
            console.log(`${repo.full_name} 的README中没有找到图片`);
        }
        
        return images;
    }

    /**
     * 解析Markdown中的图片
     * @param {string} content - Markdown内容
     * @returns {Array} 图片URL数组
     */
    parseMarkdownImages(content) {
        const images = [];
        
        // 匹配 ![alt](url) 格式
        const markdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        
        while ((match = markdownRegex.exec(content)) !== null) {
            const imageUrl = match[2].trim();
            if (this.isValidImageUrl(imageUrl)) {
                images.push(imageUrl);
            }
        }
        
        return images;
    }

    /**
     * 解析HTML中的图片
     * @param {string} content - HTML内容
     * @returns {Array} 图片URL数组
     */
    parseHtmlImages(content) {
        const images = [];
        
        try {
            const $ = cheerio.load(content);
            
            $('img').each((i, elem) => {
                const src = $(elem).attr('src');
                if (src && this.isValidImageUrl(src)) {
                    images.push(src.trim());
                }
            });
            
        } catch (error) {
            console.warn('解析HTML图片失败:', error.message);
        }
        
        return images;
    }

    /**
     * 解析图片URL为绝对URL
     * @param {string} imageUrl - 图片URL
     * @param {Object} repo - 项目信息
     * @returns {string} 绝对URL
     */
    resolveImageUrl(imageUrl, repo) {
        // 如果已经是绝对URL
        if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            return imageUrl;
        }
        
        // 处理GitHub相对路径
        const baseUrl = `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch || 'main'}`;
        
        if (imageUrl.startsWith('./')) {
            return `${baseUrl}/${imageUrl.substring(2)}`;
        } else if (imageUrl.startsWith('/')) {
            return `${baseUrl}${imageUrl}`;
        } else {
            return `${baseUrl}/${imageUrl}`;
        }
    }

    /**
     * 验证是否为有效的图片URL
     * @param {string} url - URL
     * @returns {boolean} 是否有效
     */
    isValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        
        // 排除base64图片
        if (url.startsWith('data:')) return false;
        
        // 检查文件扩展名
        const ext = path.extname(url.split('?')[0]).toLowerCase();
        return this.supportedFormats.includes(ext) || url.includes('githubusercontent.com');
    }

    /**
     * 下载图片
     * @param {string} imageUrl - 图片URL
     * @param {string} targetDir - 目标目录
     * @param {number} index - 图片索引
     * @returns {Promise<Object|null>} 图片信息
     */
    async downloadImage(imageUrl, targetDir, index) {
        try {
            console.log(`正在下载图片: ${imageUrl}`);
            
            const response = await axios({
                method: 'GET',
                url: imageUrl,
                responseType: 'stream',
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            // 检查内容类型
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                throw new Error(`无效的内容类型: ${contentType}`);
            }
            
            // 检查文件大小
            const contentLength = parseInt(response.headers['content-length'] || '0');
            if (contentLength > this.maxFileSize) {
                throw new Error(`文件过大: ${contentLength} bytes`);
            }
            
            // 生成文件名
            const fileName = this.generateFileName(imageUrl, index, contentType);
            const filePath = path.join(targetDir, fileName);
            
            // 保存文件
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            // 验证文件大小
            const stats = await fs.stat(filePath);
            
            return {
                filename: fileName,
                filepath: filePath,
                size: stats.size,
                content_type: contentType,
                downloaded_at: new Date().toISOString()
            };
            
        } catch (error) {
            throw new Error(`下载失败: ${error.message}`);
        }
    }

    /**
     * 生成文件名
     * @param {string} imageUrl - 图片URL
     * @param {number} index - 索引
     * @param {string} contentType - 内容类型
     * @returns {string} 文件名
     */
    generateFileName(imageUrl, index, contentType) {
        // 尝试从URL获取原始文件名
        const urlPath = url.parse(imageUrl).pathname;
        const originalName = path.basename(urlPath);
        
        // 如果有有效的原始文件名且包含扩展名
        if (originalName && path.extname(originalName)) {
            const safeName = this.sanitizeFileName(originalName);
            return `${index + 1}_${safeName}`;
        }
        
        // 根据内容类型生成扩展名
        const extMap = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/gif': '.gif',
            'image/svg+xml': '.svg',
            'image/webp': '.webp'
        };
        
        const ext = extMap[contentType] || '.png';
        return `image_${index + 1}${ext}`;
    }

    /**
     * 清理文件名
     * @param {string} fileName - 原始文件名
     * @returns {string} 清理后的文件名
     */
    sanitizeFileName(fileName) {
        return fileName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_{2,}/g, '_')
            .toLowerCase();
    }

    /**
     * 批量处理项目图片
     * @param {Array} repos - 项目数组
     * @param {string} year - 年份
     * @param {string} week - 周数
     * @returns {Promise<Array>} 图片信息数组
     */
    async batchCrawlImages(repos, year, week) {
        const results = [];
        
        for (let i = 0; i < repos.length; i++) {
            const repo = repos[i];
            try {
                const imageInfo = await this.crawlProjectImages(repo, year, week);
                results.push(imageInfo);
                
                console.log(`完成图片爬取 ${i + 1}/${repos.length}: ${repo.full_name}`);
                
                // 添加延迟
                if (i < repos.length - 1) {
                    await this.delay(1000);
                }
                
            } catch (error) {
                console.error(`批量爬取失败 ${repo.full_name}:`, error.message);
                results.push({
                    repo_name: repo.full_name,
                    total_images: 0,
                    images: [],
                    image_dir: null,
                    error: error.message
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
     * 清理过期图片
     * @param {number} daysToKeep - 保留天数
     */
    async cleanupOldImages(daysToKeep = 90) {
        try {
            const now = Date.now();
            const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
            
            const years = await fs.readdir(this.baseImagesDir);
            
            for (const year of years) {
                const yearPath = path.join(this.baseImagesDir, year);
                const weeks = await fs.readdir(yearPath);
                
                for (const week of weeks) {
                    const weekPath = path.join(yearPath, week);
                    const stats = await fs.stat(weekPath);
                    
                    if (now - stats.mtime.getTime() > maxAge) {
                        await fs.remove(weekPath);
                        console.log(`清理过期图片目录: ${weekPath}`);
                    }
                }
            }
        } catch (error) {
            console.error('清理图片失败:', error.message);
        }
    }
}

module.exports = ImageCrawler;