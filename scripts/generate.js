const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const today = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });

  // PROMPT Z BLOKADĄ CZASOWĄ: Kategoryczny zakaz podawania innych dat.
  const promptText = `Jesteś zaawansowanym systemem detekcji anomalii rynkowych.
  Dzisiejsza data to dokładnie: ${today}.
  
  ZASADA NUMER 1: KATEGORYCZNIE ZABRANIAM podawania meczów, które odbywają się w inne dni. WSZYSTKIE 5 meczów musi dotyczyć wyłącznie dzisiejszego dnia (${today}). Jeśli podasz mecz z przyszłości (z jutra, z przyszłego tygodnia lub miesiąca), system ulegnie awarii.
  
  Wymagania:
  1. Wybierz 3 mecze z lig egzotycznych (Afryka, Azja) oraz 2 mecze z Top 5 lig europejskich na DZISIAJ.
  2. Szukaj potężnych anomalii kursowych i wartościowych zdarzeń (rożne, gole, spadki kursów).
  3. Jeśli nie masz w swojej bazie dokładnego terminarza niszowych lig na dzień ${today}, wygeneruj wysoce prawdopodobną, analityczną SYMULACJĘ rynkową dla prawdziwych drużyn z tych lig, ale ZAWSZE przypisuj ją do dnia dzisiejszego.
  4. Analiza (3-4 zdania) musi profesjonalnie opisywać powód wykrycia anomalii.
  
  Zwróć odpowiedź WYŁĄCZNIE jako czysty kod JSON, bez znaczników markdown:
  {
    "mecze": [
      {
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
        console.log(`✅ SUKCES! Raport na ${today} zapisany. Blokada czasowa aktywna.`);
      } catch (parseError) {
        fs.writeFileSync(filePath, JSON.stringify({
          mecze: [{ godzina: "INFO", mecz: "Błąd formatowania AI", typ: "?", kurs: "-", analiza: rawText }]
        }));
      }
    } else {
      throw new Error(resData.error?.message || "Brak danych");
    }
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [{ godzina: "BŁĄD", mecz: "Błąd skryptu", typ: "!", kurs: "0.00", analiza: e.message }]
    }));
  }
}
run();
