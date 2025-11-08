// api/dify.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ code: 405, msg: 'Method Not Allowed' });

  const DIFY_BASE_URL = process.env.DIFY_BASE_URL;
  const DIFY_API_KEY = process.env.DIFY_API_KEY;
  const DIFY_WORKFLOW_ID = process.env.DIFY_WORKFLOW_ID;

  if (!DIFY_BASE_URL || !DIFY_API_KEY || !DIFY_WORKFLOW_ID) {
    return res.status(500).json({
      code: 500,
      msg: 'Missing env vars: DIFY_BASE_URL / DIFY_API_KEY / DIFY_WORKFLOW_ID'
    });
  }

  try {
    const { query, userId, extra } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ code: 400, msg: 'Missing "query" in body' });
    }

    const payload = {
      inputs: { query, ...(extra || {}) },
      response_mode: 'blocking',
      user: userId || 'wx_user'
    };

    const url = `${DIFY_BASE_URL.replace(/\/+$/, '')}/v1/workflows/${DIFY_WORKFLOW_ID}/run`;

    const difyResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await difyResp.json();
    if (!difyResp.ok) return res.status(difyResp.status).json({ code: difyResp.status, msg: 'Dify API error', detail: data });

    let answer = data.outputs?.text || data.outputs?.answer || JSON.stringify(data.outputs || {});

    res.status(200).json({ code: 0, data: { answer, raw: data } });
  } catch (err) {
    res.status(500).json({ code: 500, msg: 'Internal Server Error', detail: err.message });
  }
}
