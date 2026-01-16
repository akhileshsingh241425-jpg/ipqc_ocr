const express = require('express');
const router = express.Router();

// Hugging Face API proxy endpoint (avoids CORS)
router.post('/huggingface', async (req, res) => {
  try {
    const { prompt, apiKey } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const HF_API_KEY = apiKey || process.env.HUGGINGFACE_API_KEY || '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';
    const HF_API_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2';

    console.log('🤖 Calling Hugging Face API via backend proxy...');

    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 2000,
          temperature: 0.1,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Hugging Face API error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Hugging Face API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    console.log('✅ Hugging Face API response received');

    res.json({ 
      success: true, 
      data: data 
    });

  } catch (error) {
    console.error('❌ Backend proxy error:', error);
    res.status(500).json({ 
      error: 'Failed to call Hugging Face API',
      message: error.message 
    });
  }
});

module.exports = router;
