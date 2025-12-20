// server.js - backend proxy Gemini (CommonJS)

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch"); // v2.x per CommonJS

dotenv.config();

const app = express();
app.use(cors()); // in produzione limita a dominio front-end
app.use(express.json({ limit: "10mb" }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// healthcheck
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Gemini proxy attivo" });
});

app.post("/api/gemini", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY non configurata" });
    }

    const { prompt, imageBase64, imageMime } = req.body || {};
    if (!prompt && !imageBase64) {
      return res.status(400).json({ error: "prompt o immagine mancante" });
    }

    // usa un modello con quota free > 0 (es. 2.5 flash)
    const MODEL = "gemini-2.5-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const systemInstruction = `Sei un assistente AI educativo per simulazioni cliniche.
Devi SEMPRE rispondere con un testo completo di almeno 5-8 frasi in italiano,
spiegando:
1) che cosa si vede o quali sintomi sono descritti,
2) quali possibili cause generiche (ipotesi, non diagnosi definitive),
3) quando è importante rivolgersi subito a un medico o al pronto soccorso,
4) che questa risposta è solo a scopo didattico e non sostituisce un medico.
Non interrompere la risposta a metà frase e non lasciare frasi incomplete.`;



    const parts = [];

    if (imageBase64 && imageMime) {
      parts.push({
        inline_data: {
          mime_type: imageMime,
          data: imageBase64,
        },
      });
    }

    parts.push({ text: systemInstruction + "\n\n" + (prompt || "") });

    const body = {
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1200,
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      if (response.status === 429) {
        return res.status(429).json({
          error:
            "Quota Gemini esaurita o a 0 per questo modello. Controlla i rate limits in AI Studio o cambia modello.",
        });
      }

      return res.status(response.status).json({
        error: data.error?.message || "Errore Gemini",
        status: response.status,
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("\n") || "Nessuna risposta generata.";

    console.log("=== RISPOSTA GEMINI ===");
    console.log(text);
    console.log("LUNGHEZZA:", text.length);

    res.json({ text });
  } catch (err) {
    console.error("Errore /api/gemini:", err);
    res.status(500).json({ error: "Errore interno server" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gemini proxy in ascolto su http://localhost:${PORT}`);
});
