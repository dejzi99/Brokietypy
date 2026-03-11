const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const promptText = `Wciel się w rolę Głównego Analityka Danych Sportowych. 
  Przygotuj zaawansowany raport 5 najbardziej prawdopodobnych zdarzeń piłkarskich na dziś.
  
  Wymagania:
  1. Wybierz 3 mecze z Top 5 lig europejskich oraz 2 mecze z lig egzotycznych/niszowych.
  2. Szukaj wartościowych zdarzeń: rzuty rożne (np. Powyżej 9.5), liczba goli (Powyżej/Poniżej), rzuty karne, faule, lub "Obie drużyny strzelą". Nie tylko proste wygrane.
  3. Analiza musi być bardzo rozbudowana (3-4 zdania). Opisz formę obu drużyn, braki w kadrach, motywację i statystyki. Uzasadnij, dlaczego ten typ ma szanse matematyczne.
  
  Zwróć odpowiedź WYŁĄCZNIE jako czysty kod JSON:
  {
    "mecze": [
      {
        "godzina": "20:45",
        "mecz": "Nazwa Drużyny A - Nazwa B (Liga)",
        "typ": "Powyżej 10.5 rzutów rożnych",
        "kurs": "1.85",
        "analiza": "Szczegółowa analiza formy..."
      }
    ]
  }`;

  try {
    // KLUCZOWA ZMIANA: Uniwersalny model "gemini-pro", który działa na 100% kluczy
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    
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
      console.log("✅ SUKCES! Model gemini-pro wygenerował analizy.");
    } else {
      const errMsg = resData.error?.message || "Brak treści od Google";
      throw new Error(errMsg);
    }
  } catch (e) {
    console.error("❌ BŁĄD:", e.message);
    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [
        { godzina: "BŁĄD", mecz: "Błąd połączenia", typ: "!", kurs: "0.00", analiza: e.message }
      ]
    }));
  }
}
run();
