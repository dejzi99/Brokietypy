const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  // TEST: Prosimy o zwykłe, historyczne mecze, żeby sprawdzić czy AI w ogóle chce z nami gadać
  const promptText = `Wymień 5 historycznych meczów piłkarskich z Ligi Mistrzów.
  Odpowiedz tylko jako JSON:
  {
    "mecze": [
      {
        "godzina": "20:45",
        "mecz": "Real Madryt - Bayern",
        "typ": "1",
        "kurs": "Historyczny test",
        "analiza": "Krótki opis tego historycznego meczu."
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
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const resData = await response.json();

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const cleanJson = rawText.substring(start, end);
      
      fs.writeFileSync(filePath, cleanJson);
      console.log("✅ SUKCES! AI odpowiedziało.");
    } else {
      // Wyciągamy DOKŁADNY błąd z Google
      let exactError = "Nieznany błąd zablokowania.";
      if (resData.error) exactError = resData.error.message;
      else if (resData.promptFeedback) exactError = "Blokada filtrów (Safety): " + JSON.stringify(resData.promptFeedback);
      
      throw new Error(exactError);
    }
  } catch (e) {
    // POKAZUJEMY BŁĄD BEZPOŚREDNIO NA TWOJEJ STRONIE
    const diagnosticData = {
      mecze: [
        { 
          godzina: "BŁĄD", 
          mecz: "Odpowiedź od Google:", 
          typ: "!", 
          kurs: "0.00", 
          analiza: e.message // Tu wyświetli się prawdziwy powód!
        }
      ]
    };
    fs.writeFileSync(filePath, JSON.stringify(diagnosticData));
  }
}
run();
