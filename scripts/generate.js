const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiSportsKey = process.env.APISPORTS_KEY; 
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');
  const historyPath = path.join(publicDir, 'historia.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiajPl = new Date().toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const dataDlaApi = new Date().toISOString().split('T')[0];

  let listaDoAnalizy = "";

  // Funkcja obsługująca powtórki (retry)
  async function fetchWithRetry(url, options, maxRetries = 5) {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        const resJson = await response.json();
        
        if (response.ok) return resJson;
        
        console.log(`Próba ${i+1}/${maxRetries} nieudana. Status: ${response.status}.`);

        if (response.status !== 429 && response.status < 500) {
            throw new Error(resJson.error?.message || `Błąd HTTP ${response.status}`);
        }
      } catch (e) {
        if (i === maxRetries - 1) throw e;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; 
    }
  }

  try {
    if (!apiSportsKey) throw new Error("Brak klucza APISPORTS_KEY!");

    console.log(`Pobieram mecze na dzień: ${dataDlaApi}`);
    const apiData = await fetchWithRetry(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApi}`, {
      method: 'GET',
      headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiData.response && apiData.response.length > 0) {
        const szerokieLigi = [2, 3, 848, 15, 39, 40, 140, 135, 78, 61, 88, 94, 106, 71, 253, 203];
        let wybraneMecze = apiData.response.filter(match => szerokieLigi.includes(match.league.id));
        if (wybraneMecze.length === 0) wybraneMecze = apiData.response; 

        listaDoAnalizy = wybraneMecze.slice(0, 25).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        }).join('\n');
    } else {
        throw new Error("API-Sports nie zwróciło meczów.");
    }
  } catch (e) {
    console.log("Problem z danymi sportowymi:", e.message);
  }

  const promptText = `Jesteś elitarnym analitykiem. Dzisiaj: ${dzisiajPl}.
  Mecze do analizy:
  ${listaDoAnalizy || 'Brak danych z API, wygeneruj realistyczne symulacje.'}
  
  Wybierz 5 typów. Zwróć WYŁĄCZNIE JSON. Podaj fixture_id i bukmacherów (STS, Superbet, Fortuna).
  Struktura: {"mecze": [{"fixture_id": "123", "data": "${dzisiajPl}", "godzina": "21:00", "mecz": "Drużyna A vs B", "typ": "Wynik", "kurs": "1.80", "analiza": "Opis", "status": "oczekujący", "bukmacherzy": [{"nazwa": "STS", "kurs": "1.75"}, {"nazwa": "Superbet", "kurs": "1.80"}, {"nazwa": "Fortuna", "kurs": "1.78"}]}]}`;

  try {
    // POWRÓT DO SPRAWDZONEGO ENDPOINTU v1beta I MODELU gemini-1.5-flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    const resData = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    if (resData.candidates && resData.candidates[0].content) {
      let rawText = resData.candidates[0].content.parts[0].text;
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}') + 1;
      const cleanJson = rawText.substring(start, end);
      const generatedData = JSON.parse(cleanJson);
      
      fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
      
      let historia = [];
      if (fs.existsSync(historyPath)) {
          try { historia = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) {}
      }
      const dzisiejszyIndex = historia.findIndex(h => h.data === dzisiajPl);
      if (dzisiejszyIndex !== -1) historia[dzisiejszyIndex] = { data: dzisiajPl, mecze: generatedData.mecze };
      else historia.push({ data: dzisiajPl, mecze: generatedData.mecze });

      fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));
      console.log("✅ Raport gotowy.");
    } else {
      throw new Error("Błąd odpowiedzi AI.");
    }
  } catch (e) {
    fs.writeFileSync(filePath, JSON.stringify({
      error: e.message,
      mecze: [{ data: dzisiajPl, mecz: "Błąd Analizy AI", analiza: "Błąd modelu: " + e.message, status: "błąd" }]
    }));
  }
}
run();
