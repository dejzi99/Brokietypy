const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const promptText = `Podaj 5 meczów piłkarskich na dziś. Odpowiedz TYLKO i WYŁĄCZNIE czystym kodem JSON (bez słowa json i bez znaczników): 
  {
    "mecze": [
      {
        "godzina": "20:45",
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
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    const resData = await response.json();
    console.log("LOG Z AI:", JSON.stringify(resData));

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const cleanJson = rawText.substring(start, end);
      fs.writeFileSync(filePath, cleanJson);
      console.log("✅ SUKCES: Dane zapisane.");
    } else {
      throw new Error("Błąd odpowiedzi AI");
    }
  } catch (e) {
    console.error("❌ BŁĄD:", e.message);
    fs.writeFileSync(filePath, JSON.stringify({ mecze: [], status: "Błąd: " + e.message }));
  }
}
run();
