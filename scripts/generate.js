const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const rapidApiKey = process.env.RAPIDAPI_KEY; 
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiajPl = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const dataDlaApi = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD dla API-Football

  try {
    if (!rapidApiKey) {
        throw new Error("Brak klucza RAPIDAPI_KEY. Upewnij się, że dodałeś go w Settings -> Secrets na GitHubie.");
    }

    console.log(`Pobieram Prawdziwe Mecze z API na dzień: ${dataDlaApi}`);

    // KROK 1: POBIERANIE PRAWDZIWYCH MECZÓW Z API-FOOTBALL
    const responseAPI = await fetch(`https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${dataDlaApi}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
      }
    });
    
    const apiData = await responseAPI.json();
    
    if (!apiData.response || apiData.response.length === 0) {
      throw new Error("Brak jakichkolwiek meczów na dzisiaj w bazie API-Football.");
    }

    // ID najważniejszych lig (Top 5 Europy + Liga Mistrzów, Europy, Konferencji + Ekstraklasa)
    const dozwoloneLigi = [39, 140, 135, 78, 61, 2, 3, 848, 106]; 
    
    // Filtrujemy tylko topowe mecze i tworzymy czytelną listę
    const prawdziweMecze = apiData.response
        .filter(match => dozwoloneLigi.includes(match.league.id))
        .map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        });

    if (prawdziweMecze.length === 0) {
       fs.writeFileSync(filePath, JSON.stringify({
          mecze: [{ data: dzisiajPl, godzina: "INFO", mecz: "Brak Topowych Meczów", typ: "-", kurs: "-", analiza: "Dzisiaj nie gra żadna z najważniejszych lig europejskich. Zróbmy sobie przerwę!" }]
        }));
        return;
    }

    // Bierzemy max 15 meczów, żeby nie przebodźcować AI
    const listaDoAnalizy = prawdziweMecze.slice(0, 15).join('\n');
    console.log("Lista PRAWDZIWYCH meczów wysyłana do AI:\n", listaDoAnalizy);

    // KROK 2: WYSYŁAMY PRAWDZIWĄ LISTĘ DO GEMINI PO ANALIZĘ
    const promptText = `Jesteś elitarnym analitykiem sportowym. Dzisiejsza data to: ${dzisiajPl}.
    
    Oto OFICJALNA, PRAWDZIWA lista meczów, które odbywają się dzisiaj:
    ${listaDoAnalizy}
    
    Twoim zadaniem jest wybranie dokładnie 5 najciekawszych meczów WYŁĄCZNIE z tej listy powyżej. 
    KATEGORYCZNIE ZABRANIAM wymyślania innych meczów.
    
    Dla każdego wybranego meczu:
    1. Podaj pole "data" z wartością "${dzisiajPl}".
    2. Przepisz dokładną godzinę i nazwy drużyn z listy.
    3. Wskaż najciekawszy typ z rynków pobocznych (np. Rzuty rożne Powyżej 9.5, Gole Powyżej 2.5, BTTS - Obie strzelą, Faule).
    4. Oszacuj realistyczny kurs między 1.40 a 2.50.
    5. Napisz 3-4 zdania dogłębnej, profesjonalnej analizy dlaczego ten typ ma największe szanse (forma, taktyka, braki kadrowe).
    
    Zwróć odpowiedź WYŁĄCZNIE jako czysty kod JSON:
    {
      "mecze": [
        {
          "data": "${dzisiajPl}",
          "godzina": "21:00",
          "mecz": "Real Madryt vs Manchester City (UEFA Champions League)",
          "typ": "Powyżej 10.5 rzutów rożnych",
          "kurs": "1.85",
          "analiza": "Twoja szczegółowa analiza tutaj..."
        }
      ]
    }`;

    // Połączenie z Gemini 2.5 Flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const responseGemini = await fetch(url, {
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

    const resData = await responseGemini.json();

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      
      try {
        const start = rawText.indexOf('{');
        const end = rawText.lastIndexOf('}') + 1;
        const cleanJson = rawText.substring(start, end);
        JSON.parse(cleanJson);
        
        fs.writeFileSync(filePath, cleanJson);
        console.log(`✅ SUKCES! Raport wygenerowany w oparciu o PRAWDZIWE statystyki z API-Football.`);
      } catch (parseError) {
        fs.writeFileSync(filePath, JSON.stringify({
          mecze: [{ data: dzisiajPl, godzina: "INFO", mecz: "Błąd formatu", typ: "?", kurs: "-", analiza: "AI nie potrafiło zapisać analizy w odpowiednim formacie." }]
        }));
      }
    } else {
      throw new Error(resData.error?.message || "Brak danych od Gemini");
    }
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify({
      mecze: [{ data: dzisiajPl, godzina: "BŁĄD", mecz: "Błąd systemu statystyk", typ: "!", kurs: "0.00", analiza: e.message }]
    }));
  }
}
run();
