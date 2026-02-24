const axios = require('axios');

module.exports = async (req, res) => {
    // Cấu hình CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Thiếu query' });

    try {
        // ==================================================================
        // ĐÃ ĐIỀN TỰ ĐỘNG TỪ ẢNH SỐ 4 CỦA BẠN
        // Đây là chuỗi Cookie ghép từ: csrftoken + _b + sessionFunnel...
        const MY_COOKIE = 'csrftoken=3fb389ccd0f495ca9aa44607fd508db4; _b="AZEyrqBftCJGO5l1ZVGYjpX+Sdzs2hGxFbqGoQoWQUIB82893hNmOmZMKuVTeJMiUm4="; sessionFunnelEventLogged=1;';
        // ==================================================================

        // Đã lấy từ ảnh số 1 và 2 của bạn
        const MY_CSRF_TOKEN = '3fb389ccd0f495ca9aa44607fd508db4';
        const APP_VERSION = 'bf9ee36'; 

        const apiUrl = 'https://www.pinterest.com/resource/BaseSearchResource/get/';
        
        const dataPayload = JSON.stringify({
            options: {
                isPrefetch: false,
                query: q,
                scope: "pins",
                no_fetch_context_on_resource: false
            },
            context: {}
        });

        const response = await axios.get(apiUrl, {
            params: {
                source_url: `/search/pins/?q=${encodeURIComponent(q)}`,
                data: dataPayload,
                _: Date.now()
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.pinterest.com/',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                
                // Header xác thực (Từ ảnh của bạn)
                'X-APP-VERSION': APP_VERSION,
                'X-CSRFToken': MY_CSRF_TOKEN,
                'X-Pinterest-AppState': 'active',
                
                // Cookie (Từ ảnh số 4)
                'Cookie': MY_COOKIE
            }
        });

        const responseData = response.data;
        const results = [];

        if (responseData?.resource_response?.data?.results) {
            const pins = responseData.resource_response.data.results;
            
            pins.forEach(pin => {
                if (pin.images?.orig?.url) {
                    results.push(pin.images.orig.url);
                } else if (pin.images?.['736x']?.url) {
                    results.push(pin.images['736x'].url);
                }
            });
        }

        return res.status(200).json({
            success: true,
            count: results.length,
            query: q,
            images: results
        });

    } catch (error) {
        return res.status(error.response?.status || 500).json({
            success: false,
            message: error.message,
            // Nếu vẫn lỗi 403, nghĩa là Cookie trong ảnh 4 thiếu phần đăng nhập (_auth)
            // Lúc đó bạn cần cuộn xuống trong danh sách cookie để tìm dòng "_auth" hoặc "_pinterest_sess"
            hint: 'Nếu lỗi 403: Hãy kiểm tra lại ảnh danh sách Cookie, tìm dòng _auth hoặc _pinterest_sess và thêm vào.'
        });
    }
};
