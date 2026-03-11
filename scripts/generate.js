const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Zapytanie do AI - używamy backticków (``), żeby uniknąć błędów SyntaxError
  const promptText = `Podaj 5 meczów piłkarskich na dziś (${new Date().toLocaleDateString()}). 
  Odpowiedz TYLKO i WYŁĄCZNIE czystym kodem JSON (bez słowa json i bez znaczników): 
  {
    "mecze": [
      {
        "godzina": "18:00",
        "mecz": "Drużyna A vs Drużyna B",
        "typ": "1",
        "kurs": "1.80",
        "analiza": "Krótkie uzasadnienie."
      }
    ]
  }`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });

    const resData = await response.json();
    console.log("LOG Z AI:", JSON.stringify(resData));

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      
      // Wyciągamy czysty JSON (znajdujemy pierwszą klamrę i ostatnią)
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      
      if (start === -1 || end === 0) throw new Error("AI nie zwróciło poprawnego formatu JSON");
      
      const cleanJson = rawText.substring(start, end);
      fs.writeFileSync(filePath, cleanJson);
      console.log("✅ SUKCES! Raport zapisany.");
    } else {
      throw new Error(resData.error?.message || "Brak danych w odpowiedzi Google");
    }
  } catch (e) {
    console.error("❌ BŁĄD SKRYPTU:", e.message);
    // Zapisujemy błąd, żeby strona wiedziała co się dzieje
    fs.writeFileSync(filePath, JSON.stringify({ status: "Błąd: " + e.message, mecze: [] }));
  }
}

run();
