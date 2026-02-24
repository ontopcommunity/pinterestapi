const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // 1. Cấu hình CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ 
            success: false, 
            message: 'Thiếu từ khóa tìm kiếm. Vui lòng dùng: /api?q=anime' 
        });
    }

    try {
        // --- RANDOM USER AGENT ---
        let userAgentToUse = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        try {
            const filePath = path.join(__dirname, 'user-agents.txt');
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const agents = fileContent.split('\n').map(line => line.trim()).filter(line => line.length > 10);
                if (agents.length > 0) {
                    userAgentToUse = agents[Math.floor(Math.random() * agents.length)];
                }
            }
        } catch (e) { console.error(e); }

        const encodedQuery = encodeURIComponent(q);
        const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodedQuery}&rs=typed`;

        // 2. Gửi Request
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': userAgentToUse,
                'Referer': 'https://www.pinterest.com/',
                // Header này quan trọng để lấy được HTML đầy đủ hơn
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            }
        });

        const html = response.data;
        const $ = cheerio.load(html);
        let results = new Set(); // Dùng Set để tự động lọc trùng
        let methodUsed = '';

        // --- CÁCH 1: JSON PARSER (Thử trước) ---
        try {
            const scriptData = $('#__PWS_DATA__').html();
            if (scriptData) {
                const jsonData = JSON.parse(scriptData);
                // Đào sâu vào cấu trúc dữ liệu nếu tồn tại
                const feeds = jsonData?.props?.initialReduxState?.feeds;
                if (feeds) {
                    Object.values(feeds).forEach(feed => {
                        if (feed.results && Array.isArray(feed.results)) {
                            feed.results.forEach(pin => {
                                if (pin.images?.orig?.url) {
                                    results.add(pin.images.orig.url);
                                }
                            });
                        }
                    });
                }
            }
        } catch (e) {
            console.log("JSON Parse failed, switching to Regex fallback");
        }

        // --- CÁCH 2: SMART REGEX SCAN (Chạy nếu Cách 1 ít kết quả) ---
        // Nếu cách 1 tìm được ít hơn 5 ảnh, ta kích hoạt quét thô HTML
        if (results.size < 5) {
            methodUsed = 'smart_regex';
            
            // Regex này tìm TẤT CẢ các size ảnh (236x, 474x, 564x, 736x, originals)
            // Loại bỏ các ảnh avatar (thường có /75x75_RS/ hoặc /30x30_RS/)
            const regex = /https:\/\/i\.pinimg\.com\/(?:originals|236x|474x|564x|736x)\/[a-zA-Z0-9\/\-_]+\.(?:jpg|png|webp|jpeg)/g;
            
            const matches = html.match(regex);
            
            if (matches) {
                matches.forEach(url => {
                    // Bỏ qua ảnh avatar nhỏ (thường chứa _RS hoặc link quá ngắn)
                    if (!url.includes('75x75_RS') && !url.includes('30x30_RS')) {
                        // Kỹ thuật: Thay thế mọi kích thước thành /originals/ để lấy ảnh nét nhất
                        const hdUrl = url.replace(/\/(?:236x|474x|564x|736x)\//, '/originals/');
                        results.add(hdUrl);
                    }
                });
            }
        } else {
            methodUsed = 'json_parser';
        }

        // Chuyển Set thành Array
        const finalResults = Array.from(results);

        return res.status(200).json({
            success: true,
            method: methodUsed,
            query: q,
            count: finalResults.length,
            images: finalResults
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.message
        });
    }
};
