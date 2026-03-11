const fs = require('fs');

async function run() {
  const SYSTEM_PROMPT = `Działasz jako analityk bukmacherski. Znajdź mecze na dziś i wygeneruj raport JSON...`; 
  
  const apiKey = process.env.GEMINI_API_KEY;
  const dzisiaj = new Date().toLocaleDateString('pl-PL');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Dzisiaj jest ${dzisiaj}. Przeszukaj internet i znajdź mecze piłkarskie na dziś. Wygeneruj raport jako JSON.` }] }],
        tools: [{ googleSearch: {} }],
        // Dodajemy obniżenie filtrów, żeby nie blokowało typów sportowych
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const data = await response.json();

    // Sprawdzamy, czy Gemini w ogóle coś odpowiedziało
    if (!data.candidates || data.candidates.length === 0) {
      console.error("❌ Gemini nie zwróciło odpowiedzi. Możliwy powód:", JSON.stringify(data.promptFeedback || data.error));
      process.exit(1);
    }

    const tekst = data.candidates[0].content.parts[0].text;
    const jsonMatch = tekst.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      if (!fs.existsSync('./public')) fs.mkdirSync('./public');
      fs.writeFileSync('./public/raport.json', jsonMatch[0]);
      console.log("✅ Raport zapisany pomyślnie!");
    } else {
      console.error("❌ Gemini wysłało tekst, ale nie było w nim JSON-a:", tekst);
      process.exit(1);
    }
  } catch (e) {
    console.error("❌ Krytyczny błąd skryptu:", e);
    process.exit(1);
  }
}

run();
