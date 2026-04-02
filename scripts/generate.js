const fs = require('fs');
const path = require('path');

async function run() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiSportsKey = process.env.APISPORTS_KEY; 
  const publicDir = path.join(process.cwd(), 'public');
  const filePath = path.join(publicDir, 'raport.json');
  const historyPath = path.join(publicDir, 'historia.json');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const dzisiaj = new Date();
  const dzisiajPl = dzisiaj.toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const dataDlaApiFootball = dzisiaj.toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw' }).substring(0, 10);
  const jutro = new Date(dzisiaj);
  jutro.setDate(jutro.getDate() + 1);

  const getEspnDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
  };

  async function fetchSports(url, options = {}, maxRetries = 3) {
    let delay = 1000;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) return await response.json();
      } catch (e) { if (i === maxRetries - 1) throw e; }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; 
    }
    return null;
  }

  // --- AUTOMATYCZNY SĘDZIA (ROZLICZANIE PIŁKI I NBA) ---
  async function settleHistory() {
    if (!fs.existsSync(historyPath)) return;
    console.log("🔍 Sprawdzam wyniki oczekujących meczów w historii...");
    let historia = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    let meczeDoOceny = [];

    // Krok 1: Pobieramy suche wyniki zakończonych meczów
    for (let dzien of historia) {
      for (let m of dzien.mecze) {
        if (m.status === 'oczekujący' || m.status === 'NS') {
          try {
            if (m.sport === 'Pilka_Nozna' && m.fixture_id) {
              const res = await fetchSports(`https://v3.football.api-sports.io/fixtures?id=${m.fixture_id}`, {
                headers: { 'x-apisports-key': apiSportsKey }
              });
              if (res?.response?.[0]?.fixture?.status?.short === 'FT' || res?.response?.[0]?.fixture?.status?.short === 'AET' || res?.response?.[0]?.fixture?.status?.short === 'PEN') {
                const f = res.response[0];
                m.wynik = `${f.goals.home}-${f.goals.away}`;
                meczeDoOceny.push(m);
              }
            } else if (m.sport === 'NBA' && m.fixture_id) {
              const res = await fetchSports(`https://v2.nba.api-sports.io/games?id=${m.fixture_id}`, {
                headers: { 'x-apisports-key': apiSportsKey }
              });
              // Status 3 to "Finished" w nowym API NBA
              if (res?.response?.[0]?.status?.short === 3 || res?.response?.[0]?.status?.short === 'FT') {
                const s = res.response[0].scores;
                m.wynik = `${s.home.points}-${s.away.points}`;
                meczeDoOceny.push(m);
              }
            }
          } catch(e) { console.log("Błąd sprawdzania wyniku dla ID:", m.fixture_id); }
        }
      }
    }

    // Krok 2: Prosimy AI o rozliczenie kuponów (wygrana/przegrana) na podstawie wyników
    if (meczeDoOceny.length > 0) {
      console.log(`🤖 AI Sędzia ocenia ${meczeDoOceny.length} starych meczów...`);
      const prompt = `Jesteś sędzią bukmacherskim. Poniżej masz listę meczów. Znasz typ bukmacherski oraz oficjalny, końcowy wynik.
      Rozlicz każdy z tych typów - czy jest wygrany czy przegrany.
      Dane: ${JSON.stringify(meczeDoOceny.map(m => ({id: m.fixture_id, typ: m.typ, wynik: m.wynik})))}
      Zwróć TYLKO czysty obiekt JSON w formacie: {"oceny": [{"id": "123", "status": "wygrana"}, {"id": "456", "status": "przegrana"}]}`;

      try {
        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const aiRes = await fetch(generateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
        const aiData = await aiRes.json();
        
        if (aiData.candidates && aiData.candidates[0].content) {
            const rawText = aiData.candidates[0].content.parts[0].text;
            const cleanJson = JSON.parse(rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1));

            for (let dzien of historia) {
                for (let m of dzien.mecze) {
                    const ocena = cleanJson.oceny?.find(o => o.id == m.fixture_id);
                    if (ocena && m.wynik) {
                        m.status = ocena.status;
                        m.analiza += ` [Wynik: ${m.wynik}]`; // Dokleja wynik do analizy, żeby ładnie wyglądało
                    }
                }
            }
            fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));
            console.log("✅ Pomyślnie zaktualizowano statusy w historii!");
        }
      } catch(e) { console.log("Błąd AI podczas oceniania kuponów:", e.message); }
    }
  }

  // Odpalenie sędziego przed generowaniem nowych typów
  await settleHistory();

  try {
    // --- POBIERANIE PIŁKI (ROZSZERZONE LIGI - W tym mecze Reprezentacji) ---
    console.log("⚽ Pobieram Piłkę Nożną...");
    const apiFootball = await fetchSports(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApiFootball}&timezone=Europe/Warsaw`, {
      method: 'GET', headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiFootball && apiFootball.response) {
        // ID: 10 (Towarzyskie), 468 (Eliminacje MŚ Europa), 5 (Liga Narodów), 4 (ME), 1 (MŚ), 34 (World Cup Qualifiers)
        const szerokieLigi = [1, 2, 3, 4, 5, 9, 10, 15, 30, 32, 34, 39, 40, 61, 71, 78, 88, 94, 106, 135, 140, 203, 253, 468, 848];
        let wybranePilka = apiFootball.response.filter(match => szerokieLigi.includes(match.league.id) && match.fixture.status.short === 'NS');
        if (wybranePilka.length < 5) wybranePilka = apiFootball.response.filter(match => match.fixture.status.short === 'NS'); 

        listaPilka = wybranePilka.slice(0, 40).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        }).join('\n');
    }

    // --- POBIERANIE NBA (ESPN) ---
    console.log(`🏀 Pobieram NBA z ESPN...`);
    const [espnToday, espnTomorrow] = await Promise.all([
        fetchSports(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${getEspnDate(dzisiaj)}`),
        fetchSports(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${getEspnDate(jutro)}`)
    ]);

    let wybraneNBA = [];
    if (espnToday?.events) wybraneNBA = wybraneNBA.concat(espnToday.events.filter(e => e.status.type.state === 'pre'));
    if (espnTomorrow?.events) wybraneNBA = wybraneNBA.concat(espnTomorrow.events.filter(e => e.status.type.state === 'pre'));

    if (wybraneNBA.length > 0) {
        listaNBA = wybraneNBA.slice(0, 15).map(match => {
            const meczObj = new Date(match.date);
            const godzinaStr = meczObj.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.id} | ${godzinaStr} | ${match.name}`;
        }).join('\n');
    }

    console.log("🧠 Wysyłam dane do analizy AI...");
    const promptText = `Jesteś elitarnym analitykiem. Dzisiejsza data: ${dzisiajPl}. 
    Analizuj TYLKO mecze z list:
    PIŁKA: ${listaPilka || 'Brak'}
    NBA: ${listaNBA || 'Brak'}
    
    ZASADY: 
    1. Wybierz dokładnie 3 mecze piłkarskie i 2 z NBA.
    2. Jeśli na którejś liście jest "Brak", dobierz mecze z drugiej, tak by było ich łącznie 5.
    3. W polu "sport" MUSISZ wpisać dokładnie "Pilka_Nozna" dla piłki i "NBA" dla koszykówki.
    4. Podaj konkretny typ bukmacherski.
    5. Napisz 3-4 zdania uzasadnienia w polu "analiza".
    
    Zwróć TYLKO czysty JSON: {"mecze": [{"sport": "Pilka_Nozna", "fixture_id": "123", "mecz": "A vs B", "typ": "X", "kurs": "1.90", "analiza": "...", "status": "oczekujący", "data": "${dzisiajPl}", "godzina": "HH:MM"}]}`;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    const response = await fetch(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });
    
    const resData = await response.json();
    if (resData.candidates && resData.candidates[0].content) {
        const rawText = resData.candidates[0].content.parts[0].text;
        const cleanJson = rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1);
        const generatedData = JSON.parse(cleanJson);

        fs.writeFileSync(filePath, JSON.stringify(generatedData, null, 2));
        
        let historia = [];
        if (fs.existsSync(historyPath)) historia = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        
        // Zapis do historii (sprawdzamy czy dzisiejszy wpis już istnieje, żeby nie duplikować)
        const dzisiejszyIndex = historia.findIndex(h => h.data === dzisiajPl);
        if (dzisiejszyIndex !== -1) {
            historia[dzisiejszyIndex] = { data: dzisiajPl, mecze: generatedData.mecze };
        } else {
            historia.push({ data: dzisiajPl, mecze: generatedData.mecze });
        }
        
        fs.writeFileSync(historyPath, JSON.stringify(historia.slice(-30), null, 2)); // Trzymaj ostatnie 30 dni
        console.log("✅ NOWE TYPY ZOSTAŁY ZAPISANE!");
    } else {
        console.error("❌ Błąd AI:", resData.error?.message || "Pusta odpowiedź");
    }

  } catch (e) {
    console.error("❌ Błąd Skryptu:", e.message);
  }
}
run();
