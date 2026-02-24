const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // 1. Cấu hình CORS (Để web khác gọi vào được)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    // 2. Lấy từ khóa từ URL (ví dụ: ?q=mèo cute)
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ 
            success: false, 
            message: 'Vui lòng nhập từ khóa! Ví dụ: /api?q=anime wallpaper' 
        });
    }

    try {
        // --- QUAN TRỌNG: MÃ HÓA TỪ KHÓA ---
        // encodeURIComponent sẽ đổi "mèo cute" thành "m%C3%A8o%20cute"
        // Giúp Pinterest hiểu được tiếng Việt và khoảng trắng
        const encodedQuery = encodeURIComponent(q);
        
        const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodedQuery}&rs=typed`;

        // 3. Giả lập trình duyệt (Headers)
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.pinterest.com/',
        };

        const { data } = await axios.get(searchUrl, { headers });
        const $ = cheerio.load(data);

        // 4. Lấy dữ liệu JSON ẩn trong thẻ script
        const scriptData = $('#__PWS_DATA__').html();
        if (!scriptData) {
            return res.status(500).json({ success: false, message: 'Pinterest chặn hoặc không tìm thấy dữ liệu.' });
        }

        const jsonData = JSON.parse(scriptData);
        const results = [];

        // 5. Đào dữ liệu trong cấu trúc JSON của Pinterest
        // Cấu trúc: props -> initialReduxState -> feeds -> [search_results_...]
        const feeds = jsonData.props.initialReduxState.feeds;
        
        if (feeds) {
            // Pinterest tạo key động cho kết quả search, thường chứa chữ "search_results"
            const searchKey = Object.keys(feeds).find(key => key.includes('search_results'));
            
            if (searchKey && feeds[searchKey].results) {
                const pins = feeds[searchKey].results;

                pins.forEach(pin => {
                    // Chỉ lấy item là ảnh (có key images và orig)
                    if (pin.images && pin.images.orig) {
                        results.push(pin.images.orig.url); // Chỉ lấy link ảnh gốc
                    }
                });
            }
        }

        // Trả về kết quả
        return res.status(200).json({
            success: true,
            query: q,           // Từ khóa gốc
            encoded_query: encodedQuery, // Từ khóa đã mã hóa (để bạn kiểm tra)
            count: results.length,
            images: results     // Mảng chứa danh sách link ảnh
        });

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

