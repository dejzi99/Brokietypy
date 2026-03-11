const fs = require('fs');
const path = require('path');

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiaj = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });

  // PROMPT TOP 5 LIG: Ograniczamy AI tylko do najlepszych rozgrywek europejskich
  const promptText = `Jesteś elitarnym analitykiem piłkarskim. Dzisiejsza data to dokładnie: ${dzisiaj}.
  
  Twoim zadaniem jest wygenerowanie zestawienia 5 meczów o najwyższym prawdopodobieństwie trafienia.
  
  ZASADA 1: Skup się WYŁĄCZNIE na najpopularniejszych rozgrywkach. Dozwolone ligi to TYLKO: Top 5 lig europejskich (Premier League, La Liga, Serie A, Bundesliga, Ligue 1) oraz europejskie puchary (Liga Mistrzów, Liga Europy, Liga Konferencji).
  ZASADA 2: Wybierz mecze, które z największym prawdopodobieństwem odbywają się w okolicach tej daty w rzeczywistości (np. we wtorki i środy gra Liga Mistrzów, w czwartki Liga Europy, w weekendy ligi krajowe).
  ZASADA 3: Każdy obiekt MUSI zawierać pole "data" z wartością dokładnie "${dzisiaj}".
  ZASADA 4: Zamiast prostych wygranych (1X2), szukaj rynków pobocznych: Rzuty rożne (np. Powyżej 9.5), Liczba goli (Powyżej 2.5, Poniżej 3.5), Obie drużyny strzelą (BTTS) lub Faule.
  ZASADA 5: Analiza (3-4 zdania) musi być merytoryczna, oparta na ogólnie znanych stylach gry tych drużyn, taktyce i trendach.
  
  Zwróć odpowiedź WYŁĄCZNIE jako czysty kod JSON:
  {
    "mecze": [
      {
        "data": "${dzisiaj}",
        "godzina": "21:00",
        "mecz": "Real Madryt - Manchester City (Liga Mistrzów)",
        "typ": "Powyżej 10.5 rzutów rożnych",
        "kurs": "1.85",
        "analiza": "Obie drużyny preferują ofensywny styl z dużą ilością dośrodkowań. Statystyki pokazują..."
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
        console.log(`✅ SUKCES! Raport Top 5 na ${dzisiaj} wygenerowany.`);
      } catch (parseError) {
        fs.writeFileSync(filePath, JSON.stringify({
          mecze: [{ data: dzisiaj, godzina: "INFO", mecz: "Błąd formatu", typ: "?", kurs: "-", analiza: "AI zwróciło tekst zamiast kodu." }]
        }));
      }
    } else {
      throw new Error(resData.error?.message || "Brak danych z API");
    }
  } catch (e) {
    const errorMsg = e.message.toLowerCase();
    let userFriendlyMessage = e.message;

    // Przechwytujemy limit darmowych zapytań (np. "quota exceeded")
    if (errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('429')) {
      userFriendlyMessage = "Wyczerpano darmowy limit zapytań do sztucznej inteligencji. Trwa resetowanie serwerów. Zapraszamy po nowe analizy jutro!";
    }

    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [{ data: dzisiaj, godzina: "PRZERWA", mecz: "Osiągnięto limit zapytań AI", typ: "-", kurs: "0.00", analiza: userFriendlyMessage }]
    }));
  }
}
run();
