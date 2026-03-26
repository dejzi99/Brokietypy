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
  const dataDlaApi = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).substring(0, 10);

  let listaDoAnalizy = "";

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
      } catch (e) { console.error("Błąd Telegrama:", e.message); }
  }

  try {
    if (!apiSportsKey) throw new Error("Brak klucza APISPORTS_KEY!");
    
    const apiData = await fetchSports(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApi}&timezone=Europe/Warsaw`, {
      method: 'GET',
      headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiData && apiData.response && apiData.response.length > 0) {
        const szerokieLigi = [1, 2, 3, 4, 5, 9, 10, 15, 30, 32, 34, 39, 40, 61, 71, 78, 88, 94, 106, 135, 140, 203, 253, 848];
        
        // SZTYWNY FILTR: Tylko mecze ze statusem 'NS' (Nierozpoczęte) trafiają do AI!
        let wybraneMecze = apiData.response.filter(match => szerokieLigi.includes(match.league.id) && match.fixture.status.short === 'NS');
        if (wybraneMecze.length === 0) wybraneMecze = apiData.response.filter(match => match.fixture.status.short === 'NS'); 

        const topLigi = [1, 2, 3, 4, 5, 9, 10, 30, 32, 34, 39, 61, 78, 135, 140];
        wybraneMecze.sort((a, b) => {
            const aTop = topLigi.includes(a.league.id) ? 0 : 1;
            const bTop = topLigi.includes(b.league.id) ? 0 : 1;
            return aTop - bTop;
        });

        listaDoAnalizy = wybraneMecze.slice(0, 45).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        }).join('\n');
    }
  } catch (e) { console.log("Problem z API-Sports:", e.message); }

  // ULEPSZONY PROMPT: Zakaz wpisywania statusów!
  const promptText = `Jesteś elitarnym analitykiem bukmacherskim. Dzisiejsza data: ${dzisiajPl}.
  Oto PRAWDZIWA i JEDYNA lista meczów na dzisiaj (tylko nierozpoczęte):
  ${listaDoAnalizy || 'BRAK MECZÓW.'}
  
  ZASADY ABSOLUTNE:
  1. Wybierz 5 najciekawszych meczów.
  2. W polu "typ" MUSISZ wpisać konkretny zakład (np. "Wygrana 1", "Powyżej 2.5 gola", "Obie strzelą"). ZABRANIAM wpisywania skrótów takich jak "NS", "FT" czy "1H"!
  3. Pole "analiza" MUSI być szczegółowe (3-4 zdania z argumentami).
  4. Zwróć WYŁĄCZNIE czysty JSON.
  
  Struktura: {"mecze": [{"fixture_id": "123", "data": "${dzisiajPl}", "godzina": "21:00", "mecz": "Drużyna A vs B", "typ": "Wynik", "kurs": "1.80", "analiza": "Opis...", "status": "oczekujący"}]}`;

  let cleanJson = null;

  try {
      const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`;
      const modelsRes = await fetch(modelsUrl);
      const modelsData = await modelsRes.json();
      let availableModels = (modelsData.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent")).map(m => m.name.replace('models/', ''));
      const preferredOrder = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro"];
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

      if (!cleanJson) throw new Error("Wszystkie modele mają zablokowane limity.");

      const generatedData = JSON.parse(cleanJson);
      fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
      
      let historia = [];
      if (fs.existsSync(historyPath)) { try { historia = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) { historia = []; } }
      const dzisiejszyIndex = historia.findIndex(h => h.data === dzisiajPl);
      const nowyWpis = { data: dzisiajPl, mecze: generatedData.mecze };
      if (dzisiejszyIndex !== -1) { historia[dzisiejszyIndex] = nowyWpis; } else { historia.push(nowyWpis); }
      fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));

      if (generatedData.mecze && generatedData.mecze.length > 0) {
          let tgMessage = `🔥 <b>NOWE TYPY NA DZIŚ (${dzisiajPl})</b> 🔥\n\n`;
          generatedData.mecze.forEach(m => { if(m.status !== 'błąd') tgMessage += `⚽ <b>${m.mecz}</b>\n🎯 Typ: <b>${m.typ}</b>\n📈 Kurs: ${m.kurs}\n\n`; });
          await sendTelegramMessage(tgMessage);
      }

  } catch (e) {
      fs.writeFileSync(filePath, JSON.stringify({ error: e.message, mecze: [{ data: dzisiajPl, mecz: "Błąd Analizy", analiza: e.message, status: "błąd" }] }));
  }
}
run();
