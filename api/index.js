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
    if (!q) {
        return res.status(400).json({ 
            success: false, 
            message: 'Thiếu từ khóa. Ví dụ: /api?q=naruto' 
        });
    }

    try {
        // --- BƯỚC 1: CHỌN USER-AGENT NGẪU NHIÊN ---
        let userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        try {
            const filePath = path.join(__dirname, 'user-agents.txt');
            if (fs.existsSync(filePath)) {
                // Đọc file, lọc bỏ các dòng [source...] rác nếu có
                const lines = fs.readFileSync(filePath, 'utf8')
                    .split('\n')
                    .map(l => l.replace(/\/g, '').trim()) // Xóa rác 
                    .filter(l => l.length > 20); // Chỉ lấy dòng UA hợp lệ
                
                if (lines.length > 0) {
                    userAgent = lines[Math.floor(Math.random() * lines.length)];
                }
            }
        } catch (e) { 
            console.error("Lỗi đọc UA:", e.message); 
        }

        // --- BƯỚC 2: TẠO URL GOOGLE IMAGES ---
        // Cú pháp: site:pinterest.com + từ khóa
        const query = `site:pinterest.com ${q}`;
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&ie=UTF-8`;

        // --- BƯỚC 3: GỬI REQUEST ---
        const response = await axios.get(googleUrl, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                // Header này giúp Google trả về phiên bản Desktop dễ parse hơn
                'sec-ch-ua-platform': '"Windows"',
                'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
                'sec-ch-ua-mobile': '?0'
            }
        });

        const html = response.data;

        // --- BƯỚC 4: TRÍCH XUẤT LINK ẢNH PINTEREST ---
        // Google chứa link ảnh gốc trong các đoạn script JSON.
        // Pattern tìm kiếm: "http...pinimg.com..." theo sau là các thông số kích thước
        
        // Regex này tìm các link bắt đầu bằng http, chứa pinimg.com và kết thúc bằng đuôi ảnh
        // Nó quét trong toàn bộ source HTML của Google
        const regex = /"(https:\/\/i\.pinimg\.com\/[^"]+?\.jpg)"/g;
        
        let matches;
        const results = new Set();

        while ((matches = regex.exec(html)) !== null) {
            let url = matches[1];
            
            // Link lấy được từ Google JSON thường bị mã hóa unicode (\u003d)
            // Ta cần decode lại cho chuẩn
            url = JSON.parse(`"${url}"`); 

            // Chỉ lấy ảnh chất lượng cao (originals hoặc 736x)
            // Google thường lưu link ảnh gốc, ta ưu tiên lấy nó
            if (!url.includes('s-media-cache')) { // Bỏ qua link cache cũ nếu có
                 results.add(url);
            }
        }

        // --- BƯỚC 5: XỬ LÝ NẾU KHÔNG CÓ KẾT QUẢ (FALLBACK) ---
        // Nếu Regex trên trượt, thử Regex quét thô đơn giản hơn
        if (results.size === 0) {
            const simpleRegex = /https:\/\/i\.pinimg\.com\/[a-zA-Z0-9\/\-_]+\.jpg/g;
            const simpleMatches = html.match(simpleRegex);
            if (simpleMatches) {
                simpleMatches.forEach(u => results.add(u));
            }
        }

        const finalResults = Array.from(results);

        // --- TRẢ VỀ JSON ---
        if (finalResults.length > 0) {
            return res.status(200).json({
                success: true,
                source: 'Google Images (site:pinterest.com)',
                query: q,
                count: finalResults.length,
                images: finalResults
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy ảnh nào từ Google. Có thể Google đang hiện Captcha với IP này.',
                debug_ua: userAgent
            });
        }

    } catch (error) {
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};
