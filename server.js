const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// --- 1. MIDDLEWARE ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 2. CONFIGURATION ---
const APP_URL = "https://mloans.onrender.com"; 
const MEGAPAY_API_KEY = "MGPYzVWZq4SG"; 

const transactionMemory = {};

app.get('/', (req, res) => res.send("🚀 MegaPay Gateway is Online and Ready."));

// --- 3. STK INITIATION ---
app.post('/api/deposit/stk', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        if (!phone || !amount) return res.status(400).json({ error: "Details missing" });

        let formattedPhone = phone.startsWith('0') ? '254' + phone.substring(1) : phone;
        if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);

        const uniqueRef = "LOAN-" + Date.now();

        const payload = {
            api_key: MEGAPAY_API_KEY,
            amount: amount,
            msisdn: formattedPhone,
            email: "newtonmulti@gmail.com",
            callback_url: `${APP_URL}/webhook`,
            description: "Loan Processing Fee",
            reference: uniqueRef
        };

        console.log(`📡 Sending STK for ${formattedPhone}...`);
        const response = await axios.post('https://megapay.co.ke/backend/v1/initiatestk', payload, { timeout: 20000 });
        
        res.status(200).json({ status: "Sent", reference: uniqueRef });
    } catch (error) { 
        console.error("❌ STK Failed:", error.message);
        res.status(500).json({ error: "Gateway error" }); 
    }
});

// --- 4. WEBHOOK (FIXED FOR MEGAPAY LABELS) ---
app.post('/webhook', (req, res) => {
    res.status(200).send("OK"); // Respond to MegaPay immediately
    
    const data = req.body;
    console.log("📩 Webhook Received:", JSON.stringify(data));

    // MegaPay labels from your logs: ResponseCode 0 means success
    const isSuccess = data.ResponseCode == 0 || data.ResultCode == 0 || data.status === "success";
    
    // CRITICAL FIX: Your logs showed MegaPay uses "TransactionReference"
    const ref = data.TransactionReference || data.reference || data.Reference || data.BillRefNumber;

    if (isSuccess && ref) {
        transactionMemory[ref] = { 
            paid: true, 
            amount: data.TransactionAmount || data.amount,
            time: new Date().toISOString()
        };
        console.log(`✅ PAYMENT CONFIRMED: ${ref} is now PAID.`);

        // Auto-delete after 30 mins
        setTimeout(() => { delete transactionMemory[ref]; }, 1800000);
    } else {
        console.log(`⚠️ Payment not verified. Success: ${isSuccess}, Ref: ${ref}`);
    }
});

// --- 5. STATUS CHECK ---
app.get('/api/payment/status', (req, res) => {
    const { reference } = req.query;
    const payment = transactionMemory[reference];
    
    if (payment && payment.paid) {
        console.log(`🎯 Status check: ${reference} is PAID.`);
        res.json({ paid: true });
    } else {
        res.json({ paid: false });
    }
});

// --- 6. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Live on Port ${PORT}`);
});