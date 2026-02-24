const axios = require('axios');

// Danh sách User-Agent "cứng" (Không cần file txt nữa)
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0"
];

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
        return res.status(400).json({ success: false, message: 'Thiếu query (?q=)' });
    }

    try {
        // Chọn ngẫu nhiên UA
        const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

        // 2. Tìm kiếm qua Google Images với cú pháp site:pinterest.com
        // &tbm=isch : Chế độ tìm ảnh
        // &gbv=1 : Chế độ Google cơ bản (ít Javascript, dễ cào hơn)
        const googleUrl = `https://www.google.com/search?q=site:pinterest.com+${encodeURIComponent(q)}&tbm=isch&gbv=1`;

        const response = await axios.get(googleUrl, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Referer': 'https://www.google.com/'
            }
        });

        const html = response.data;
        const results = new Set();

        // 3. Regex siêu đơn giản: Tìm mọi chuỗi bắt đầu bằng http... và chứa .pinimg.com
        // Regex này bắt được cả link trong thẻ <img src="..."> lẫn link trong JSON
        const regex = /https?:\/\/[^"' \s<>]*\.pinimg\.com\/[^"' \s<>]*\.(?:jpg|png|jpeg|webp)/gi;
        
        const matches = html.match(regex);

        if (matches) {
            matches.forEach(url => {
                // Làm sạch URL (Google hay mã hóa \u003d hoặc \x3d)
                let cleanUrl = url.replace(/\\u003d/g, '=').replace(/\\/g, '');

                // Chỉ lấy ảnh, bỏ qua các icon nhỏ hoặc ảnh profile
                if (!cleanUrl.includes('75x75') && !cleanUrl.includes('30x30')) {
                    // Mẹo: Google thường trả về link ảnh nhỏ (tbn:...) hoặc ảnh cache
                    // Ta cố gắng convert nó về dạng gốc của Pinterest nếu có thể
                    
                    // Nếu link chứa /xxx/ (kích thước), thay bằng /originals/
                    if (cleanUrl.match(/\/\d+x\//)) {
                        cleanUrl = cleanUrl.replace(/\/\d+x\//, '/originals/');
                    }
                    
                    results.add(cleanUrl);
                }
            });
        }

        const finalResults = Array.from(results);

        if (finalResults.length > 0) {
            return res.status(200).json({
                success: true,
                source: 'google_search_basic',
                query: q,
                count: finalResults.length,
                images: finalResults
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh (Google chặn hoặc không có kết quả).',
            });
        }

    } catch (error) {
        // Bắt lỗi toàn cục để Server không bao giờ crash (500)
        console.error(error);
        return res.status(200).json({ // Trả về 200 kèm thông báo lỗi để frontend không sập
            success: false,
            message: 'Lỗi hệ thống đã được xử lý',
            error_detail: error.message
        });
    }
};

