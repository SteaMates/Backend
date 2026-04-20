import "dotenv/config";
import Groq from 'groq-sdk';

const apiKey = process.env.GROQ_API_KEY;
console.log("API Key:", apiKey ? "Loaded" : "Not loaded");

const groq = new Groq({ apiKey });

async function test() {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: "Hello" },
            {
              type: 'image_url',
              image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" }
            }
          ]
        }
      ],
    });
    console.log("llama-3.2-11b-vision-preview SUCCESS:", completion.choices[0].message.content);
  } catch (e) {
    console.error("llama-3.2-11b-vision-preview ERROR:", e.message);
  }

  try {
    const completion2 = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: "Hello" },
            {
              type: 'image_url',
              image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" }
            }
          ]
        }
      ],
    });
    console.log("llama-4-scout SUCCESS:", completion2.choices[0].message.content);
  } catch (e) {
    console.error("llama-4-scout ERROR:", e.message);
  }
}

test();
