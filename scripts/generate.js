const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiaj = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });

  // PROMPT: Wymuszamy pole "data" w JSON, aby zablokować halucynacje z przyszłości
  const promptText = `Jesteś zaawansowanym systemem detekcji anomalii rynkowych.
  Dzisiejsza data to dokładnie: ${dzisiaj}.
  
  ZASADA BEZWZGLĘDNA: Nie masz dostępu do internetu na żywo. Jeśli nie znasz w 100% prawdziwego terminarza na dzień ${dzisiaj}, musisz wygenerować wysoce realistyczną SYMULACJĘ rynkową na DZISIAJ. 
  KATEGORYCZNIE ZABRANIAM podawania prawdziwych meczów, które odbywają się w przyszłości (np. za tydzień lub w maju). 
  
  Wymagania:
  1. Wybierz 3 mecze z lig egzotycznych i 2 z Top 5 Europy. 
  2. Każdy mecz w formacie JSON MUSI zawierać pole "data" z wartością dokładnie "${dzisiaj}".
  3. Szukaj potężnych anomalii kursowych (rożne, gole, spadki).
  
  Zwróć odpowiedź WYŁĄCZNIE jako czysty kod JSON:
  {
    "mecze": [
      {
        "data": "${dzisiaj}",
        "godzina": "15:30",
        "mecz": "Drużyna A - Drużyna B (Nazwa Ligi)",
        "typ": "Powyżej 2.5 gola",
        "kurs": "2.10",
        "analiza": "System wykrył anomalię kursową..."
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
        console.log(`✅ SUKCES! Raport wygenerowany. Wymuszona data: ${dzisiaj}`);
      } catch (parseError) {
        fs.writeFileSync(filePath, JSON.stringify({
          mecze: [{ data: dzisiaj, godzina: "INFO", mecz: "Błąd formatowania", typ: "?", kurs: "-", analiza: rawText }]
        }));
      }
    } else {
      throw new Error(resData.error?.message || "Brak danych");
    }
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [{ data: dzisiaj, godzina: "BŁĄD", mecz: "Błąd skryptu", typ: "!", kurs: "0.00", analiza: e.message }]
    }));
  }
}
run();
