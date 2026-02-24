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
    if (!q) return res.status(400).json({ success: false, message: 'Thiếu query (?q=)' });

    try {
        // --- CẤU HÌNH ---
        // Token lấy từ ảnh của bạn
        const myCsrfToken = '3fb389ccd0f495ca9aa44607fd508db4';
        
        // Gọi thẳng vào API nội bộ của Pinterest (Không gọi trang web HTML nữa)
        // Đây là API mà Pinterest dùng để tải thêm ảnh khi bạn lướt web
        const apiUrl = 'https://www.pinterest.com/resource/BaseSearchResource/get/';

        // Payload dữ liệu bắt buộc phải có
        const dataPayload = JSON.stringify({
            options: {
                isPrefetch: false,
                query: q,
                scope: "pins",
                no_fetch_context_on_resource: false
            },
            context: {}
        });

        // 2. GỬI REQUEST GIẢ LẬP
        const response = await axios.get(apiUrl, {
            params: {
                source_url: `/search/pins/?q=${encodeURIComponent(q)}`,
                data: dataPayload,
                _: Date.now()
            },
            headers: {
                // Giả lập trình duyệt
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.pinterest.com/',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                
                // --- MẤU CHỐT Ở ĐÂY ---
                // CSRF Token phải có mặt ở cả trong Header và Cookie thì API mới nhận
                'X-CSRF-Token': myCsrfToken,
                'Cookie': `csrftoken=${myCsrfToken};` 
            }
        });

        // 3. XỬ LÝ KẾT QUẢ (JSON)
        // API này trả về JSON sạch, không cần parse HTML
        const responseData = response.data;
        const results = [];

        // Kiểm tra xem dữ liệu nằm ở đâu (Pinterest đôi khi đổi cấu trúc)
        if (responseData?.resource_response?.data?.results) {
            const pins = responseData.resource_response.data.results;
            
            pins.forEach(pin => {
                // Logic lấy ảnh chất lượng cao nhất
                if (pin.images?.orig?.url) {
                    results.push(pin.images.orig.url);
                } else if (pin.images?.['736x']?.url) {
                    results.push(pin.images['736x'].url);
                }
            });
        }

        // 4. TRẢ VỀ
        if (results.length > 0) {
            return res.status(200).json({
                success: true,
                method: 'internal_api_with_token',
                count: results.length,
                query: q,
                images: results
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh. Có thể token đã hết hạn hoặc cần thêm Cookie phiên đăng nhập (_pinterest_sess).',
                debug: responseData // Trả về để xem lỗi gì nếu có
            });
        }

    } catch (error) {
        // Xử lý lỗi 403 hoặc lỗi mạng
        return res.status(500).json({
            success: false,
            message: error.message,
            stack: error.stack
        });
    }
};

