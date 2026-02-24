const axios = require('axios');

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

    if (!q) {
        return res.status(400).json({ 
            success: false, 
            message: 'Thiếu từ khóa. Ví dụ: /api?q=anime' 
        });
    }

    try {
        const encodedQuery = encodeURIComponent(q);
        const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodedQuery}&rs=typed`;

        // 2. GIẢ DANH GOOGLEBOT (Chìa khóa để bypass)
        const response = await axios.get(searchUrl, {
            headers: {
                // Pinterest rất sợ mất SEO nên luôn trả content cho Googlebot
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Referer': 'https://www.google.com/',
            }
        });

        const htmlData = response.data;
        
        // 3. QUÉT THÔ (BRUTE FORCE REGEX)
        // Tìm mọi chuỗi bắt đầu bằng https://i.pinimg.com/... và kết thúc bằng jpg/png/webp
        // Cách này lấy được ảnh kể cả khi nó nằm trong JSON, HTML attribute hay JS variable
        const regex = /https:\/\/i\.pinimg\.com\/[a-zA-Z0-9\/\-_]+\.(?:jpg|png|webp|jpeg)/g;
        const matches = htmlData.match(regex);

        let finalResults = [];

        if (matches) {
            const uniqueImages = new Set();
            
            matches.forEach(url => {
                // Lọc rác: Bỏ ảnh avatar (75x75, 30x30) và các icon nhỏ
                if (!url.includes('75x75') && !url.includes('30x30') && !url.includes('profile_')) {
                    
                    // CHUYỂN ĐỔI SANG ẢNH GỐC (HD)
                    // Thay thế các size nhỏ (236x, 474x...) bằng /originals/
                    const hdUrl = url.replace(/\/\d+x\//, '/originals/');
                    
                    uniqueImages.add(hdUrl);
                }
            });

            // Chuyển Set thành Array
            finalResults = Array.from(uniqueImages);
        }

        // Nếu vẫn không có ảnh, có thể do từ khóa không có kết quả
        if (finalResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh nào (Pinterest có thể đã chặn IP Vercel tạm thời).',
                query: q
            });
        }

        return res.status(200).json({
            success: true,
            count: finalResults.length,
            query: q,
            images: finalResults
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};
