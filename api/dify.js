// api/dify.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // 以后可改成你小程序的域名
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 405, msg: 'Method Not Allowed' });
  }

  const DIFY_API_KEY = process.env.DIFY_API_KEY;
  const DIFY_API_URL = process.env.DIFY_API_URL;           // 推荐：直接用这个
  const DIFY_BASE_URL = process.env.DIFY_BASE_URL;         // 兼容老方式
  const DIFY_WORKFLOW_ID = process.env.DIFY_WORKFLOW_ID;   // 兼容老方式

  if (!DIFY_API_KEY) {
    return res.status(500).json({
      code: 500,
      msg: 'Missing env var: DIFY_API_KEY'
    });
  }

  // 1️⃣ 优先使用你在 DIFY_API_URL 中填的完整地址
  let targetUrl = (DIFY_API_URL || '').trim();

  // 2️⃣ 如果没填 DIFY_API_URL，则退回到 workflow 模式
  if (!targetUrl) {
    if (!DIFY_BASE_URL || !DIFY_WORKFLOW_ID) {
      return res.status(500).json({
        code: 500,
        msg: 'Missing env vars: DIFY_API_URL or (DIFY_BASE_URL + DIFY_WORKFLOW_ID)'
      });
    }
    targetUrl =
      `${DIFY_BASE_URL.replace(/\/+$/, '')}` +
      `/v1/workflows/${DIFY_WORKFLOW_ID}/run`;
  }

  try {
    const { query, userId, extra } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ code: 400, msg: 'Missing "query" in body' });
    }

    // 通用 Dify 请求体（workflow / chat-messages 都兼容这种写法）
    const payload = {
      inputs: { ...(extra || {}), query },
      query,
      response_mode: 'blocking',
      user: userId || 'wx_user'
    };

    const difyResp = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await difyResp.json().catch(() => ({}));

    if (!difyResp.ok) {
      return res.status(difyResp.status).json({
        code: difyResp.status,
        msg: 'Dify API error',
        detail: data
      });
    }

    // 尝试从常见字段中抽取最终答案
    let answer =
      data.outputs?.text ||
      data.outputs?.answer ||
      data.answer ||
      data.message ||
      '';

    if (!answer) {
      // 实在没有就把 outputs 或整个 data 转成字符串返回，方便调试
      const src = data.outputs || data;
      answer = typeof src === 'string' ? src : JSON.stringify(src);
    }

    return res.status(200).json({
      code: 0,
      data: {
        answer,
        raw: data
      }
    });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({
      code: 500,
      msg: 'Internal Server Error',
      detail: err?.message || String(err)
    });
  }
}
