const express = require('express');
const path = require('path');

const app = express();

// Serve static files (CSS, JS, images)
app.use('/media', express.static('/Users/ROMEO-bot/.clawdbot/media/inbound'));

// Serve the landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'landing-page.html'));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Landing page server running on port ${PORT}`);
    console.log(`Visit: http://localhost:${PORT}`);
});