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

    // Retry logic for 410 (model loading) and 503 (overloaded) errors
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
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

        // 410 = Model is loading (wait and retry)
        // 503 = Service overloaded (wait and retry)
        if (response.status === 410 || response.status === 503) {
          const waitTime = (attempt + 1) * 10; // 10s, 20s, 30s
          console.log(`⏳ Model loading (attempt ${attempt + 1}/3), waiting ${waitTime}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Hugging Face API error: ${response.status}`, errorText);
          lastError = { status: response.status, message: errorText };
          continue;
        }

        const data = await response.json();
        console.log('✅ Hugging Face API response received');

        return res.json({ 
          success: true, 
          data: data 
        });

      } catch (fetchError) {
        lastError = fetchError;
        console.error(`❌ Attempt ${attempt + 1} failed:`, fetchError.message);
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retry
        }
      }
    }

    // All retries failed
    return res.status(lastError?.status || 500).json({ 
      error: 'Hugging Face API failed after retries',
      details: lastError?.message || lastError?.toString()
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
