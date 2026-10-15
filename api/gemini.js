// ============================================================
// VERCEL SERVERLESS FUNCTION: /api/gemini
// Standard CommonJS handler compatible with all Vercel Node runtimes
// Securely proxies to Google Gemini using process.env.GEMINI_API_KEY
// ============================================================

module.exports = async function handler(req, res) {
    // Enable CORS
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
    const apiKey = (process.env.GEMINI_API_KEY || process.env.gemini_api_key || '').trim();
    if (!apiKey) {
        return res.status(500).json({
            error: 'GEMINI_API_KEY is not configured in Vercel Environment Variables. Please ensure GEMINI_API_KEY is added under Vercel Settings > Environment Variables and redeploy.'
        });
    }

    try {
        // Handle body whether parsed as object or passed as JSON string
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) {}
        }
        const { prompt, context } = body || {};

        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt in request' });
        }

        const summary = context?.database_summary || {};
        const allCards = context?.all_cards || [];

        const systemInstruction = `You are ERA AI, the executive financial co-pilot of Credit Card Management System (CCMS) for Gretex Group.
You have direct, real-time access to the user's COMPLETE credit card database across all entities and banking partners.

Current Live Portfolio Database Snapshot:
- Total Cards Tracked: ${summary.total_cards || allCards.length || 0} (${summary.active_cards || 0} Active)
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
3. Use markdown with bullet points, bold highlights, and clean tables.
4. If asked about all credit cards with limits or spends, provide a clear table or list with Bank, Last 4 digits, Cardholder, Limit, and Balance.
5. If asked to perform app actions (navigate to a page, sync cloud, export database, record payment), inform the user that ERA AI can execute those actions directly via voice or quick action buttons.
6. Answer in English or Hinglish according to user tone.`;

        // Try primary model (gemini-1.5-flash), with fallback to gemini-pro if needed
        const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
        let lastError = null;

        for (const model of models) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const geminiRes = await fetch(geminiUrl, {
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
                });

                const data = await geminiRes.json();
                if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                    return res.status(200).json({ text: data.candidates[0].content.parts[0].text });
                } else if (data.error) {
                    lastError = data.error.message || JSON.stringify(data.error);
                    console.warn(`[Vercel Serverless] Gemini ${model} error:`, lastError);
                }
            } catch(modelErr) {
                lastError = modelErr.message;
                console.warn(`[Vercel Serverless] Failed calling ${model}:`, lastError);
            }
        }

        return res.status(502).json({
            error: `Gemini API call failed: ${lastError || 'Empty response from Google API'}`
        });

    } catch(err) {
        console.error('[Vercel Serverless] Internal Error:', err);
        return res.status(500).json({ error: err.message || 'Server error processing request' });
    }
};
