const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const promptText = `Jesteś profesjonalnym dziennikarzem sportowym. 
  Przygotuj analizę 5 meczów piłkarskich na dziś. 
  Dla każdego meczu podaj: godzinę, nazwy drużyn, przewidywany wynik (1, X lub 2), kurs oraz jedno zdanie uzasadnienia.
  Odpowiedz wyłącznie w formacie JSON:
  {
    "mecze": [
      {
        "godzina": "20:45",
        "mecz": "Drużyna A - Drużyna B",
        "typ": "1",
        "kurs": "1.95",
        "analiza": "Gospodarze wygrali 3 ostatnie mecze u siebie."
      }
    ]
  }`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        // Wyłączamy filtry, które mogą blokować "hazard"
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const resData = await response.json();
    console.log("LOG Z AI:", JSON.stringify(resData));

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const cleanJson = rawText.substring(start, end);
      
      fs.writeFileSync(filePath, cleanJson);
      console.log("✅ SUKCES: Analizy wygenerowane!");
    } else {
      // Jeśli AI zablokowało odpowiedź, dowiemy się dlaczego
      const reason = resData.promptFeedback?.blockReason || "Nieznany błąd filtrów";
      throw new Error("AI zablokowało odpowiedź: " + reason);
    }
  } catch (e) {
    console.error("❌ BŁĄD:", e.message);
    fs.writeFileSync(filePath, JSON.stringify({ 
      mecze: [], 
      error: e.message,
      status: "Problem z generowaniem analizy" 
    }));
  }
}

run();
