const fs = require('fs');

async function run() {
  const SYSTEM_PROMPT = `Działasz jako analityk bukmacherski. Znajdź mecze na dziś i wygeneruj raport JSON...`; // (skróciłem dla czytelności, użyj swojego promptu)
  
  const apiKey = process.env.GEMINI_API_KEY;
  const dzisiaj = new Date().toLocaleDateString('pl-PL');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Dzisiaj jest ${dzisiaj}. Znajdź mecze i daj JSON.` }] }],
        tools: [{ googleSearch: {} }]
      })
    });

    const data = await response.json();
    const tekst = data.candidates[0].content.parts[0].text;
    const jsonMatch = tekst.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      // Zapisujemy raport jako plik w folderze public
      if (!fs.existsSync('./public')) fs.mkdirSync('./public');
      fs.writeFileSync('./public/raport.json', jsonMatch[0]);
      console.log("✅ Raport zapisany w public/raport.json");
    }
  } catch (e) {
    console.error("❌ Błąd:", e);
    process.exit(1);
  }
}

run();
