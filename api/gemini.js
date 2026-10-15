// ============================================================
// VERCEL SERVERLESS FUNCTION: /api/gemini
// Securely proxies requests to Google Gemini using GEMINI_API_KEY
// from Vercel Environment Variables (Zero client-side leak)
// ============================================================

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Get GEMINI_API_KEY from Vercel Environment Variables
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            error: 'GEMINI_API_KEY is missing in Vercel Environment Variables. Please set GEMINI_API_KEY in your Vercel Project Settings > Environment Variables.'
        });
    }

    try {
        const { prompt, context } = req.body || {};
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt in request body' });
        }

        const summary = context?.database_summary || {};
        const systemInstruction = `You are ERA AI, the executive financial co-pilot of Credit Card Management System (CCMS) for Gretex Group.
You have direct, real-time access to the user's COMPLETE credit card database across all entities and banking partners.
Current Live Portfolio Database Snapshot:
- Total Cards Tracked: ${summary.total_cards || context?.all_cards?.length || 0} (${summary.active_cards || 0} Active)
- Total Sanctioned Credit Limit: ₹${(summary.total_sanctioned_limit || 0).toLocaleString('en-IN')}
- Total Current Balance (Outstanding): ₹${(summary.total_current_balance || 0).toLocaleString('en-IN')}
- Total Available Credit Headroom: ₹${(summary.total_available_credit || 0).toLocaleString('en-IN')}
- Overall Portfolio Utilization: ${summary.portfolio_utilization_percent || 0}%
- Pending Statement Dues: ₹${(summary.total_pending_statement_dues || 0).toLocaleString('en-IN')}
- Unbilled Swipes: ${summary.total_unbilled_transactions || 0} txns (₹${(summary.total_unbilled_amount || 0).toLocaleString('en-IN')})
- Total Transactions in Database: ${summary.total_transactions_in_db || 0}

Full Database Snapshot (JSON):
${JSON.stringify(context || {}, null, 2)}

Instructions:
1. Provide accurate, professional, concise, executive-level financial analysis using the live database snapshot above.
2. Format financial figures in Indian Rupees (₹) with standard Indian comma grouping (e.g. ₹1,72,20,999).
3. Use markdown with bullet points, bold highlights, and clean structure.
4. If asked about specific cards, check the 'all_cards' list (HDFC, ICICI, SBI, Axis, HSBC, etc.) and report exact limits, balances, and due dates.
5. If asked about spends, refer to 'category_wise_spending' and 'recent_transactions_sample'.
6. If asked to perform app actions (navigate to a page, sync cloud, export database, record payment), inform the user that ERA AI can execute those actions directly via voice or quick action buttons.
7. Answer in English or Hinglish according to user tone.`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: `${systemInstruction}\n\nUser Question: ${prompt}` }]
                        }
                    ]
                })
            }
        );

        const data = await geminiRes.json();
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            return res.status(200).json({ text: data.candidates[0].content.parts[0].text });
        } else {
            const errMsg = data.error?.message || 'Gemini API returned an empty or restricted response';
            return res.status(502).json({ error: errMsg });
        }
    } catch(err) {
        console.error('Vercel Gemini Serverless Handler Error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error while contacting Gemini' });
    }
}
