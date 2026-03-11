const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiaj = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });

  // PROMPT ZABEZPIECZAJĄCY: Wyjaśniamy modelowi, że nie ma dostępu do internetu i ma wymusić pole "data"
  const promptText = `Jesteś zaawansowanym systemem symulacji rynkowych. Dzisiejsza data to: ${dzisiaj}.
  
  UWAGA KRYTYCZNA: Jako AI nie masz dostępu do live feedów (jak Sofascore) i Twoja baza danych o przyszłych meczach jest niekompletna.
  Dlatego wygeneruj 5 WYSOCE REALISTYCZNYCH SYMULACJI meczów i rynków (3 ligi egzotyczne, 2 z Top 5), tak jakby odbywały się dokładnie dzisiaj. Użyj prawdziwych nazw drużyn, ale symuluj rynki i anomalie (np. potężne spadki kursów).
  
  Każdy obiekt w tablicy MUSI ZACZYNAĆ SIĘ od pola "data" z wartością "${dzisiaj}".
  
  Zwróć odpowiedź WYŁĄCZNIE jako czysty kod JSON:
  {
    "mecze": [
      {
        "data": "${dzisiaj}",
        "godzina": "15:30",
        "mecz": "Drużyna A - Drużyna B (Nazwa Ligi)",
        "typ": "Powyżej 2.5 gola",
        "kurs": "2.10",
        "analiza": "System wykrył potężną anomalię kursową..."
      }
    ]
  }`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
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
      
      try {
        const start = rawText.indexOf('{');
        const end = rawText.lastIndexOf('}') + 1;
        const cleanJson = rawText.substring(start, end);
        JSON.parse(cleanJson);
        
        fs.writeFileSync(filePath, cleanJson);
        console.log(`✅ SUKCES! Raport (symulacja rynkowa) na ${dzisiaj} wygenerowany.`);
      } catch (parseError) {
        fs.writeFileSync(filePath, JSON.stringify({
          mecze: [{ data: dzisiaj, godzina: "INFO", mecz: "Błąd formatu", typ: "?", kurs: "-", analiza: rawText }]
        }));
      }
    } else {
      throw new Error(resData.error?.message || "Brak danych z API");
    }
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [{ data: dzisiaj, godzina: "BŁĄD", mecz: "Błąd skryptu", typ: "!", kurs: "0.00", analiza: e.message }]
    }));
  }
}
run();
