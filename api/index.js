const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // 1. Cấu hình CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Thiếu query (?q=)' });

    try {
        // --- RANDOM USER AGENT ---
        let userAgentToUse = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        try {
            const filePath = path.join(__dirname, 'user-agents.txt');
            if (fs.existsSync(filePath)) {
                const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.length > 10);
                if (lines.length > 0) userAgentToUse = lines[Math.floor(Math.random() * lines.length)];
            }
        } catch (e) {}

        const encodedQuery = encodeURIComponent(q);
        
        // MẸO 1: Dùng domain phụ (ca.pinterest.com hoặc uk) để tránh rate limit của server chính
        const searchUrl = `https://ca.pinterest.com/search/pins/?q=${encodedQuery}&rs=typed`;

        // MẸO 2: Giả lập Cookie của người dùng mới (Guest)
        // Pinterest sẽ chặn nếu không có cookie, nhưng sẽ nới lỏng nếu có cookie "_auth=0"
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': userAgentToUse,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://ca.pinterest.com/',
                'Cookie': 'pw_loc=ca; _auth=0; _pinterest_sess=;', // Cookie giả lập guest
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            validateStatus: () => true // Không ném lỗi nếu gặp 403, để ta xử lý bên dưới
        });

        if (response.status === 403 || response.status === 429) {
            return res.status(403).json({
                success: false,
                message: 'Pinterest chặn IP Vercel. Giải pháp: Bạn cần tự lấy Cookie trình duyệt của mình dán vào code (Xem hướng dẫn bên dưới).',
                error_code: response.status
            });
        }

        const html = response.data;
        let results = new Set();

        // --- CÁCH 1: QUÉT JSON (HIỆU QUẢ NHẤT) ---
        // Pinterest giấu dữ liệu trong thẻ script id="__PWS_DATA__"
        // Ta dùng Regex để trích xuất JSON này ra mà không cần parse toàn bộ HTML
        const jsonMatch = html.match(/<script id="__PWS_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        
        if (jsonMatch && jsonMatch[1]) {
            try {
                const jsonData = JSON.parse(jsonMatch[1]);
                const feeds = jsonData?.props?.initialReduxState?.feeds;
                
                if (feeds) {
                    // Tìm tất cả các key chứa dữ liệu feed
                    Object.keys(feeds).forEach(key => {
                        const feed = feeds[key];
                        if (feed.results && Array.isArray(feed.results)) {
                            feed.results.forEach(pin => {
                                // Chỉ lấy các item là ảnh (bỏ qua user/board/quảng cáo)
                                if (pin.images?.orig?.url) {
                                    results.add(pin.images.orig.url);
                                } else if (pin.images?.['736x']?.url) {
                                    results.add(pin.images['736x'].url);
                                }
                            });
                        }
                    });
                }
            } catch (e) {
                console.log("JSON Parse Error");
            }
        }

        // --- CÁCH 2: QUÉT LINK ẢNH TRỰC TIẾP (DỰ PHÒNG) ---
        // Nếu JSON thất bại, quét thô toàn bộ HTML tìm link ảnh
        if (results.size < 2) {
            // Regex tìm link ảnh có định dạng Pinterest
            const urlRegex = /https:\/\/i\.pinimg\.com\/(?:originals|236x|474x|564x|736x)\/[a-zA-Z0-9\/\-_]+\.(?:jpg|png|webp|jpeg)/g;
            const matches = html.match(urlRegex);
            
            if (matches) {
                matches.forEach(url => {
                    // LỌC RÁC: Bỏ ảnh avatar, logo, icon nhỏ
                    if (!url.includes('75x75') && 
                        !url.includes('30x30') && 
                        !url.includes('profile_') && 
                        !url.includes('user_') &&
                        !url.includes('favicon')) {
                        
                        // Ép về ảnh gốc (HD)
                        const hdUrl = url.replace(/\/\d+x\//, '/originals/');
                        results.add(hdUrl);
                    }
                });
            }
        }

        const finalResults = Array.from(results);

        if (finalResults.length === 0) {
            // Trường hợp xấu nhất: Login Wall chặn hết
            return res.status(200).json({ // Trả về 200 nhưng rỗng để không crash app
                success: true,
                message: 'Login Wall Blocked. Vui lòng thử lại sau vài giây hoặc đổi từ khóa.',
                count: 0,
                images: []
            });
        }

        return res.status(200).json({
            success: true,
            query: q,
            count: finalResults.length,
            images: finalResults
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

