const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// --- 1. MIDDLEWARE ---
// Updated CORS to be more robust to prevent "Internet Connection Errors"
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 2. CONFIGURATION ---
const APP_URL = "https://mloans.onrender.com"; 
const MEGAPAY_API_KEY = "MGPYzVWZq4SG"; // Fixed variable usage below

// Temporary memory (resets if server restarts)
const transactionMemory = {};

app.get('/', (req, res) => res.send("MegaPay Gateway: Online"));

// --- 3. STK INITIATION ---
app.post('/api/deposit/stk', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        
        if (!phone || !amount) {
            return res.status(400).json({ error: "Missing phone or amount" });
        }

        let formattedPhone = phone.startsWith('0') ? '254' + phone.substring(1) : phone;
        const uniqueRef = "LOAN-" + Date.now();

        const payload = {
            api_key: "MGPYzVWZq4SG", // FIXED: Now uses the constant variable correctly
            amount: amount,
            msisdn: formattedPhone,
            email: "newtonmulti@gmail.com",
            callback_url: `${APP_URL}/webhook`,
            description: "Loan Processing Fee",
            reference: uniqueRef
        };

        console.log(`🚀 Requesting STK for ${formattedPhone} | Ref: ${uniqueRef}`);
        
        const response = await axios.post('https://megapay.co.ke/backend/v1/initiatestk', payload);
        
        console.log("MegaPay Response:", response.data);
        res.status(200).json({ status: "Sent", reference: uniqueRef });

    } catch (error) { 
        console.error("STK Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Gateway error", details: error.message }); 
    }
});

// --- 4. WEBHOOK (The "Listener") ---
app.post('/webhook', (req, res) => {
    // Send 200 OK to MegaPay immediately so they don't keep retrying
    res.status(200).send("OK"); 
    
    const data = req.body;
    console.log("📩 Webhook Data Received:", JSON.stringify(data));

    // Support multiple response formats from MegaPay
    const isSuccess = data.ResultCode == 0 || data.ResponseCode == 0 || data.status === "success";
    const ref = data.reference || data.Reference || data.BillRefNumber;

    if (isSuccess && ref) {
        transactionMemory[ref] = { 
            paid: true, 
            amount: data.amount || data.TransactionAmount || data.Amount,
            time: new Date().toISOString()
        };
        console.log(`✅ Payment verified in memory for Ref: ${ref}`);

        // Cleanup: Remove from memory after 20 minutes to save space
        setTimeout(() => {
            delete transactionMemory[ref];
        }, 1200000);
    }
});

// --- 5. POLLING STATUS ---
app.get('/api/payment/status', (req, res) => {
    const { reference } = req.query;
    
    if (!reference) {
        return res.status(400).json({ error: "Reference required" });
    }

    const payment = transactionMemory[reference];
    console.log(`Checking status for ${reference}: ${payment ? "PAID" : "PENDING"}`);
    
    res.json({ paid: !!(payment && payment.paid) });
});

// --- 6. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server active on port ${PORT}`);
    console.log(`🔗 Callback URL should be: ${APP_URL}/webhook`);
});