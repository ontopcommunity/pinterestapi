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
            message: 'Thiếu từ khóa tìm kiếm. Vui lòng dùng: /api?q=từ_khóa' 
        });
    }

    try {
        // --- XỬ LÝ USER AGENT ---
        let userAgentToUse = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        try {
            const filePath = path.join(__dirname, 'user-agents.txt');
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const agents = fileContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && line.length > 10);

                if (agents.length > 0) {
                    const randomIndex = Math.floor(Math.random() * agents.length);
                    userAgentToUse = agents[randomIndex];
                }
            }
        } catch (e) {
            console.error("Lỗi đọc file UA:", e);
        }

        const encodedQuery = encodeURIComponent(q);
        const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodedQuery}&rs=typed`;

        // 2. Gửi Request
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': userAgentToUse,
                'Referer': 'https://www.pinterest.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        const html = response.data;
        const $ = cheerio.load(html);
        let results = [];
        let methodUsed = '';

        // --- CÁCH 1: PARSE JSON CHUẨN (ƯU TIÊN) ---
        try {
            const scriptData = $('#__PWS_DATA__').html();
            if (scriptData) {
                const jsonData = JSON.parse(scriptData);
                
                // Kiểm tra an toàn từng lớp dữ liệu để tránh lỗi "undefined"
                if (jsonData && jsonData.props && jsonData.props.initialReduxState && jsonData.props.initialReduxState.feeds) {
                    const feeds = jsonData.props.initialReduxState.feeds;
                    const searchKey = Object.keys(feeds).find(key => key.includes('search_results'));
                    
                    if (searchKey && feeds[searchKey].results) {
                        const pins = feeds[searchKey].results;
                        pins.forEach(pin => {
                            if (pin.images && pin.images.orig) {
                                results.push(pin.images.orig.url);
                            }
                        });
                        methodUsed = 'json_parser';
                    }
                }
            }
        } catch (parseError) {
            console.log("JSON Parse Error, switching to Regex...", parseError.message);
        }

        // --- CÁCH 2: REGEX FALLBACK (DỰ PHÒNG MẠNH MẼ) ---
        // Nếu cách 1 thất bại hoặc không tìm thấy ảnh nào, dùng Regex quét toàn bộ HTML
        if (results.length === 0) {
            // Regex tìm tất cả link bắt đầu bằng https://i.pinimg.com/originals/ và kết thúc bằng đuôi ảnh
            const regex = /https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\-_]+\.(?:jpg|png|webp|jpeg)/g;
            const foundMatches = html.match(regex);
            
            if (foundMatches) {
                // Loại bỏ trùng lặp bằng Set
                results = [...new Set(foundMatches)];
                methodUsed = 'regex_fallback';
            }
        }

        // Trả về kết quả
        if (results.length > 0) {
            return res.status(200).json({
                success: true,
                method: methodUsed, // Cho biết đã dùng cách nào để lấy ảnh
                query: q,
                count: results.length,
                images: results
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh nào. Pinterest có thể đã chặn IP hoặc thay đổi cấu trúc.',
                debug_ua: userAgentToUse
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.message,
            stack: error.stack 
        });
    }
};
