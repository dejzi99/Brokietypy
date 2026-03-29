const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiSportsKey = process.env.APISPORTS_KEY; 
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');
  const historyPath = path.join(publicDir, 'historia.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  // Data dzisiejsza i jutrzejsza (kluczowe dla nocnych meczów NBA!)
  const dzisiaj = new Date();
  const dzisiajPl = dzisiaj.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const dataDlaApi = dzisiaj.toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).substring(0, 10);
  
  const jutro = new Date(dzisiaj);
  jutro.setDate(jutro.getDate() + 1);
  const jutroDlaApi = jutro.toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).substring(0, 10);

  let listaPilka = "";
  let listaNBA = "";

  async function fetchSports(url, options, maxRetries = 3) {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return await response.json();
      } catch (e) {
        if (i === maxRetries - 1) throw e;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; 
    }
    return null;
  }

  async function sendTelegramMessage(message) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!botToken || !chatId) return;
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      try {
          await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }) });
      } catch (e) {}
  }

  try {
    if (!apiSportsKey) throw new Error("Brak klucza APISPORTS_KEY!");
    
    // --- 1. POBIERANIE PIŁKI NOŻNEJ (Tylko dzisiaj) ---
    console.log("Pobieram Piłkę Nożną...");
    const apiFootball = await fetchSports(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApi}&timezone=Europe/Warsaw`, {
      method: 'GET',
      headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiFootball && apiFootball.response) {
        const szerokieLigi = [1, 2, 3, 4, 5, 9, 10, 15, 30, 32, 34, 39, 40, 61, 71, 78, 88, 94, 106, 135, 140, 203, 253, 848];
        let wybranePilka = apiFootball.response.filter(match => szerokieLigi.includes(match.league.id) && match.fixture.status.short === 'NS');
        if (wybranePilka.length === 0) wybranePilka = apiFootball.response.filter(match => match.fixture.status.short === 'NS'); 

        listaPilka = wybranePilka.slice(0, 30).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        }).join('\n');
    }

    // --- 2. POBIERANIE NBA (Dzisiaj + Jutro w nocy) ---
    console.log("Pobieram NBA...");
    const reqOptions = { method: 'GET', headers: { 'x-apisports-key': apiSportsKey } };
    
    const [apiBballToday, apiBballTomorrow] = await Promise.all([
        fetchSports(`https://v1.basketball.api-sports.io/games?date=${dataDlaApi}&timezone=Europe/Warsaw&league=12`, reqOptions),
        fetchSports(`https://v1.basketball.api-sports.io/games?date=${jutroDlaApi}&timezone=Europe/Warsaw&league=12`, reqOptions)
    ]);

    let wybraneNBA = [];
    if (apiBballToday && apiBballToday.response) {
        wybraneNBA = wybraneNBA.concat(apiBballToday.response.filter(match => match.status.short === 'NS'));
    }
    if (apiBballTomorrow && apiBballTomorrow.response) {
        wybraneNBA = wybraneNBA.concat(apiBballTomorrow.response.filter(match => match.status.short === 'NS'));
    }

    if (wybraneNBA.length > 0) {
        listaNBA = wybraneNBA.slice(0, 20).map(match => {
            const meczDataObj = new Date(match.date);
            const dataStr = meczDataObj.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
            const godzinaStr = meczDataObj.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.id} | Data: ${dataStr} ${godzinaStr} | ${match.teams.home.name} vs ${match.teams.away.name}`;
        }).join('\n');
    }

  } catch (e) { console.log("Problem z API-Sports:", e.message); }

  const promptText = `Jesteś elitarnym analitykiem bukmacherskim. Dzisiejsza data: ${dzisiajPl}.
  Oto dwie PRAWDZIWE listy nierozpoczętych meczów.
  
  PIŁKA NOŻNA:
  ${listaPilka || 'BRAK MECZÓW PIŁKI NOŻNEJ.'}
  
  NBA (KOSZYKÓWKA):
  ${listaNBA || 'BRAK MECZÓW NBA.'}
  
  ZASADY ABSOLUTNE:
  1. ZABRANIAM zmyślania meczów. Analizuj tylko te podane powyżej w listach.
  2. MUSISZ WYBRAĆ dokładnie 3 najciekawsze mecze z PIŁKI NOŻNEJ oraz dokładnie 2 mecze z NBA.
  3. Jeśli lista NBA jest pusta, dobierz brakujące mecze z piłki nożnej (łącznie ma być 5).
  4. W polu "typ" wpisz konkretny zakład bukmacherski (zakaz statusów typu "NS").
  5. W polu "sport" wpisz ZAWSZE: "Pilka_Nozna" dla piłki i "NBA" dla koszykówki.
  6. W polu "analiza" napisz analityczne uzasadnienie (3-4 zdania).
  7. Zwróć WYŁĄCZNIE CZYSTY OBIEKT JSON.
  
  Struktura: {"mecze": [{"sport": "NBA", "fixture_id": "123", "data": "${dzisiajPl}", "godzina": "02:00", "mecz": "Lakers vs Bulls", "typ": "Wynik", "kurs": "1.80", "analiza": "Opis...", "status": "oczekujący"}]}`;

  let cleanJson = null;

  try {
      const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`;
      const modelsRes = await fetch(modelsUrl);
      const modelsData = await modelsRes.json();
      let availableModels = (modelsData.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent")).map(m => m.name.replace('models/', ''));
      const preferredOrder = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-2.0-flash"];
      let modelsToTry = [...new Set([...preferredOrder, ...availableModels])];

      for (const model of modelsToTry) {
          try {
              const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
              const response = await fetch(generateUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
              });
              const resData = await response.json();
              if (response.ok && resData.candidates?.[0]?.content) {
                  let rawText = resData.candidates[0].content.parts[0].text;
                  cleanJson = rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1);
                  break; 
              }
          } catch (e) {}
      }

      if (!cleanJson) throw new Error("Brak odpowiedzi AI.");

      const generatedData = JSON.parse(cleanJson);
      fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
      
      let historia = [];
      if (fs.existsSync(historyPath)) { try { historia = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) { historia = []; } }
      const dzisiejszyIndex = historia.findIndex(h => h.data === dzisiajPl);
      const nowyWpis = { data: dzisiajPl, mecze: generatedData.mecze || [] }; 
      
      if (nowyWpis.mecze.length > 0) {
          if (dzisiejszyIndex !== -1) { historia[dzisiejszyIndex] = nowyWpis; } else { historia.push(nowyWpis); }
          fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));
      }

      if (generatedData.mecze && generatedData.mecze.length > 0) {
          let tgMessage = `🔥 <b>NOWE TYPY NA DZIŚ (${dzisiajPl})</b> 🔥\n\n`;
          generatedData.mecze.forEach(m => { 
              if(m.status !== 'błąd') {
                  const ikona = m.sport === 'NBA' ? '🏀' : '⚽';
                  tgMessage += `${ikona} <b>${m.mecz}</b>\n⏰ ${m.godzina}\n🎯 Typ: <b>${m.typ}</b>\n📈 Kurs: ${m.kurs}\n\n`; 
              }
          });
          await sendTelegramMessage(tgMessage);
      }

  } catch (e) {
      fs.writeFileSync(filePath, JSON.stringify({ error: e.message, mecze: [{ data: dzisiajPl, mecz: "Błąd Analizy", analiza: e.message, status: "błąd", sport: "Brak" }] }));
  }
}
run();
