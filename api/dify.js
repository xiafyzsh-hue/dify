// api/dify.js
// 适配 Dify Cloud 的「聊天应用」(POST /v1/chat-messages)

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // 正式环境可改成你的域名
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
  const DIFY_API_URL =
    (process.env.DIFY_API_URL || '').trim() ||
    'https://api.dify.ai/v1/chat-messages';

  if (!DIFY_API_KEY) {
    return res.status(500).json({
      code: 500,
      msg: 'Missing env var: DIFY_API_KEY'
    });
  }

  try {
    const { query, userId, extra } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ code: 400, msg: 'Missing "query" in body' });
    }

    // Dify chat-messages 通用请求体
    const payload = {
      inputs: extra || {},       // 额外参数按需传
      query,                     // 主问题
      response_mode: 'blocking', // 简单起见用非流式
      user: userId || 'wx_user'
      // conversation_id: 可选，前端要多轮对话的话可以传同一个 id
    };

    const difyResp = await fetch(DIFY_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await difyResp.json().catch(() => ({}));

    if (!difyResp.ok) {
      // 把 Dify 返回透出，方便你排查
      return res.status(difyResp.status).json({
        code: difyResp.status,
        msg: 'Dify API error',
        detail: data
      });
    }

    // 从常见字段里抽取回答内容
    let answer = '';

    // 1) 如果是 messages 结构（chat-messages 常见）
    if (Array.isArray(data.messages)) {
      const last = data.messages[data.messages.length - 1];
      answer = last?.content || last?.answer || '';
    }

    // 2) workflow-style outputs 兜底
    if (!answer && data.outputs) {
      answer = data.outputs.text || data.outputs.answer || '';
    }

    // 3) 还不行就把 data 串起来，方便调试
    if (!answer) {
      const src = data.answer || data.message || data;
      answer =
        typeof src === 'string'
          ? src
          : JSON.stringify(src || {});
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
