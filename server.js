const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

// --- 1. MIDDLEWARE ---
// Explicitly allowing your frontend domains to prevent "Internet Issues" (CORS)
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

// Temporary memory to track confirmed payments
const transactionMemory = {};

// Health Check
app.get('/', (req, res) => res.send("🚀 MegaPay Gateway is Online and Ready."));

// --- 3. STK INITIATION ---
app.post('/api/deposit/stk', async (req, res) => {
    try {
        const { phone, amount } = req.body;
        
        if (!phone || !amount) {
            return res.status(400).json({ error: "Phone number and amount are required." });
        }

        // Standardize phone format (Ensure it starts with 254)
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

        console.log(`📡 Sending STK Request to MegaPay for ${formattedPhone}...`);
        
        // Added 20-second timeout to handle slow API responses
        const response = await axios.post('https://megapay.co.ke/backend/v1/initiatestk', payload, {
            timeout: 20000,
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log("✅ MegaPay Response:", response.data);
        
        // Return success to frontend
        res.status(200).json({ 
            status: "Sent", 
            reference: uniqueRef,
            gateway_message: response.data.message || "Prompt sent to phone"
        });

    } catch (error) { 
        const errorDetail = error.response ? error.response.data : error.message;
        console.error("❌ STK Push Failed:", errorDetail);
        res.status(500).json({ 
            error: "Gateway error", 
            message: "Failed to trigger M-PESA prompt. Please try again.",
            details: errorDetail 
        }); 
    }
});

// --- 4. WEBHOOK (MegaPay Callback) ---
app.post('/webhook', (req, res) => {
    // IMPORTANT: Return 200 OK immediately so MegaPay doesn't keep retrying
    res.status(200).send("OK"); 
    
    const data = req.body;
    console.log("📩 Webhook Data Received:", JSON.stringify(data));

    // Handle different success formats from MegaPay
    const isSuccess = data.ResultCode == 0 || data.ResponseCode == 0 || data.status === "success" || data.ResultDesc?.includes("Success");
    const ref = data.reference || data.Reference || data.BillRefNumber;

    if (isSuccess && ref) {
        transactionMemory[ref] = { 
            paid: true, 
            amount: data.amount || data.TransactionAmount || data.Amount,
            time: new Date().toISOString()
        };
        console.log(`💰 PAYMENT CONFIRMED: Ref ${ref} is now PAID.`);

        // Clean up memory after 30 minutes
        setTimeout(() => {
            delete transactionMemory[ref];
            console.log(`🧹 Memory cleared for ref ${ref}`);
        }, 1800000);
    } else {
        console.log(`⚠️ Webhook received but payment failed or ref missing for: ${ref}`);
    }
});

// --- 5. STATUS CHECK (Polling) ---
app.get('/api/payment/status', (req, res) => {
    const { reference } = req.query;
    
    if (!reference) {
        return res.status(400).json({ error: "Reference is required for status check." });
    }

    const payment = transactionMemory[reference];
    
    if (payment && payment.paid) {
        console.log(`🎯 Status check: ${reference} is PAID.`);
        res.json({ paid: true, amount: payment.amount });
    } else {
        res.json({ paid: false });
    }
});

// --- 6. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    🚀 SERVER IS LIVE
    -------------------------------------------
    Port: ${PORT}
    URL: ${APP_URL}
    Callback: ${APP_URL}/webhook
    -------------------------------------------
    `);
});