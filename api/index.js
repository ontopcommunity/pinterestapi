const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Hàm tạo chuỗi Random Token (giả lập CSRF Token)
function generateRandomToken(length = 32) {
    const chars = 'abcdef0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

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
            message: 'Thiếu từ khóa. Ví dụ: /api?q=avatar' 
        });
    }

    try {
        // --- BƯỚC 1: LẤY USER-AGENT NGẪU NHIÊN ---
        let userAgentToUse = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        try {
            const filePath = path.join(__dirname, 'user-agents.txt');
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const agents = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 10);
                if (agents.length > 0) {
                    userAgentToUse = agents[Math.floor(Math.random() * agents.length)];
                }
            }
        } catch (e) { console.error("Lỗi đọc UA:", e); }

        // --- BƯỚC 2: CẤU HÌNH GỌI API NỘI BỘ (QUAN TRỌNG) ---
        // Thay vì gọi trang HTML, ta gọi thẳng vào API lấy dữ liệu JSON của Pinterest
        const apiUrl = 'https://www.pinterest.com/resource/BaseSearchResource/get/';
        
        // Tạo Token giả
        const csrfToken = generateRandomToken();

        // Tham số data bắt buộc của Pinterest (Phải chuẩn JSON string)
        const dataPayload = JSON.stringify({
            options: {
                isPrefetch: false,
                query: q,
                scope: "pins",
                no_fetch_context_on_resource: false
            },
            context: {}
        });

        // --- BƯỚC 3: GỬI REQUEST ---
        const response = await axios.get(apiUrl, {
            params: {
                source_url: `/search/pins/?q=${encodeURIComponent(q)}`,
                data: dataPayload,
                _: Date.now() // Timestamp để tránh cache
            },
            headers: {
                'User-Agent': userAgentToUse,
                'Referer': 'https://www.pinterest.com/',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                // Mấu chốt để bypass: Cookie CSRF phải khớp với Header CSRF
                'Cookie': `csrftoken=${csrfToken};`,
                'X-CSRF-Token': csrfToken
            }
        });

        // --- BƯỚC 4: XỬ LÝ KẾT QUẢ TRẢ VỀ ---
        // Pinterest trả về JSON trực tiếp, không cần parse HTML nữa
        const responseData = response.data;
        const results = [];

        // Kiểm tra cấu trúc JSON trả về
        if (responseData && responseData.resource_response && responseData.resource_response.data && responseData.resource_response.data.results) {
            const pins = responseData.resource_response.data.results;

            pins.forEach(pin => {
                // Chỉ lấy item là Pin (có ảnh)
                if (pin.images && pin.images.orig) {
                    results.push(pin.images.orig.url);
                } 
                // Fallback nếu không có key 'orig' thì lấy size lớn nhất
                else if (pin.images && pin.images['736x']) {
                     results.push(pin.images['736x'].url); // Ảnh khá nét
                }
            });
        }

        // --- TRẢ VỀ ---
        if (results.length > 0) {
            return res.status(200).json({
                success: true,
                method: 'internal_api', // Đánh dấu là dùng API nội bộ
                query: q,
                count: results.length,
                images: results
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh hoặc API bị chặn.',
                debug_info: 'Empty results from BaseSearchResource'
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
