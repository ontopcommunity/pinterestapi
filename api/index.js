const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // 1. Cấu hình CORS để cho phép mọi nguồn truy cập
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Xử lý request OPTIONS (Preflight)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 2. Lấy tham số tìm kiếm từ URL
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ 
            success: false, 
            message: 'Thiếu từ khóa tìm kiếm. Vui lòng dùng: /api?q=từ_khóa_của_bạn' 
        });
    }

    try {
        // --- BẮT ĐẦU: XỬ LÝ USER AGENT ---
        // Biến chứa User-Agent mặc định phòng trường hợp lỗi đọc file
        let userAgentToUse = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        try {
            // Định vị file user-agents.txt trong cùng thư mục api
            const filePath = path.join(__dirname, 'user-agents.txt');
            
            if (fs.existsSync(filePath)) {
                // Đọc file
                const fileContent = fs.readFileSync(filePath, 'utf8');
                
                // Chuyển nội dung thành mảng, lọc bỏ dòng trống
                const agents = fileContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && line.length > 10); // Lọc dòng quá ngắn hoặc rỗng

                if (agents.length > 0) {
                    // Chọn ngẫu nhiên 1 User-Agent
                    const randomIndex = Math.floor(Math.random() * agents.length);
                    userAgentToUse = agents[randomIndex];
                }
            }
        } catch (fileError) {
            console.error("Lỗi đọc file User-Agent:", fileError);
            // Nếu lỗi vẫn dùng userAgentToUse mặc định
        }
        // --- KẾT THÚC: XỬ LÝ USER AGENT ---

        // 3. Mã hóa từ khóa (xử lý dấu cách, tiếng Việt)
        const encodedQuery = encodeURIComponent(q);
        // URL Search của Pinterest
        const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodedQuery}&rs=typed`;

        // 4. Gọi request tới Pinterest
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': userAgentToUse,
                'Referer': 'https://www.pinterest.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });

        // 5. Phân tích HTML trả về
        const html = response.data;
        const $ = cheerio.load(html);

        // Lấy dữ liệu JSON từ thẻ script id="__PWS_DATA__"
        const scriptData = $('#__PWS_DATA__').html();

        if (!scriptData) {
            return res.status(500).json({ 
                success: false, 
                message: 'Pinterest chặn truy cập hoặc không tìm thấy dữ liệu.',
                debug_ua: userAgentToUse // Trả về để kiểm tra xem đã dùng UA nào
            });
        }

        const jsonData = JSON.parse(scriptData);
        const results = [];

        // 6. Trích xuất dữ liệu ảnh từ JSON
        // Đường dẫn: props -> initialReduxState -> feeds
        const feeds = jsonData.props.initialReduxState.feeds;

        if (feeds) {
            // Tìm key chứa kết quả search (thường có dạng search_results_...)
            const searchKey = Object.keys(feeds).find(key => key.includes('search_results'));

            if (searchKey && feeds[searchKey].results) {
                const pins = feeds[searchKey].results;

                pins.forEach(pin => {
                    // Kiểm tra xem item có phải là ảnh không (có key images.orig)
                    if (pin.images && pin.images.orig) {
                        results.push(pin.images.orig.url);
                    }
                });
            }
        }

        // 7. Trả về kết quả JSON
        return res.status(200).json({
            success: true,
            query: q,
            count: results.length,
            images: results
        });

    } catch (error) {
        // Xử lý lỗi hệ thống
        return res.status(500).json({ 
            success: false, 
            message: error.message,
            stack: error.stack
        });
    }
};

