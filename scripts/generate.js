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

  // --- 1. DYNAMICZNE POBIERANIE DOSTĘPNYCH MODELI AI ---
  console.log("🔎 Skanuję dostępne modele Google Gemini...");
  let modeleDoTestu = [];
  try {
      const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      const modelsData = await modelsRes.json();
      if (modelsData.models) {
          // Pobiera tylko te modele, które potrafią generować tekst
          modeleDoTestu = modelsData.models
              .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
              .map(m => m.name.replace('models/', ''));
          console.log(`✅ Znaleziono ${modeleDoTestu.length} aktywnych modeli AI na Twoim koncie.`);
      }
  } catch (e) {
      console.log("⚠️ Błąd pobierania listy modeli. Używam trybu awaryjnego.");
  }
  
  // Jeśli Google nie odda listy, mamy spadochron
  if (modeleDoTestu.length === 0) {
      modeleDoTestu = ["gemini-pro", "gemini-1.0-pro"];
  }

  // --- 2. AUTOMATYCZNY SĘDZIA (ROZLICZANIE PIŁKI I NBA) ---
  async function settleHistory() {
    if (!fs.existsSync(historyPath)) return;
    console.log("🔍 Sprawdzam wyniki oczekujących meczów w historii...");
    let historia = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    let meczeDoOceny = [];

    for (let dzien of historia) {
      if (!dzien.mecze) continue;
      for (let m of dzien.mecze) {
        const status = m.status ? m.status.toLowerCase() : '';
        if (status === 'oczekujący' || status === 'ns') {
          try {
            const sportType = m.sport || 'Pilka_Nozna';
            console.log(`⏱ Sprawdzam: ${m.mecz} (${sportType})`);

            if (sportType === 'Pilka_Nozna' && m.fixture_id && m.fixture_id !== "0") {
              const res = await fetchSports(`https://v3.football.api-sports.io/fixtures?id=${m.fixture_id}`, {
                headers: { 'x-apisports-key': apiSportsKey }
              });
              const statusShort = res?.response?.[0]?.fixture?.status?.short;
              if (['FT', 'AET', 'PEN'].includes(statusShort)) {
                const f = res.response[0];
                m.wynik = `${f.goals.home}-${f.goals.away}`;
                meczeDoOceny.push(m);
                console.log(`⚽ Znaleziono wynik piłki: ${m.wynik}`);
              }
            } else if (sportType === 'NBA' && m.fixture_id && m.fixture_id !== "0") {
              let dateQuery = "";
              const parts = m.data.match(/\d+/g);
              if (parts && parts.length >= 3) {
                  const d = parts[0].padStart(2, '0');
                  const mo = parts[1].padStart(2, '0');
                  const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                  dateQuery = `${y}${mo}${d}`;
              }
              
              if (dateQuery) {
                  const dateObj = new Date(dateQuery.substring(0,4), parseInt(dateQuery.substring(4,6))-1, dateQuery.substring(6,8));
                  const dateObjPrev = new Date(dateObj);
                  dateObjPrev.setDate(dateObjPrev.getDate() - 1);
                  const dateQueryPrev = `${dateObjPrev.getFullYear()}${String(dateObjPrev.getMonth()+1).padStart(2,'0')}${String(dateObjPrev.getDate()).padStart(2,'0')}`;
                  dateObj.setDate(dateObj.getDate() + 1);
                  const dateQueryNext = `${dateObj.getFullYear()}${String(dateObj.getMonth()+1).padStart(2,'0')}${String(dateObj.getDate()).padStart(2,'0')}`;

                  const [resPrev, res1, res2] = await Promise.all([
                      fetchSports(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateQueryPrev}`),
                      fetchSports(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateQuery}`),
                      fetchSports(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateQueryNext}`)
                  ]);

                  const getTeamKey = (teamStr) => {
                      const words = teamStr.trim().split(' ');
                      return words[words.length - 1].toLowerCase();
                  };

                  const isMatch = (e) => {
                      if (String(e.id) === String(m.fixture_id)) return true;
                      const n = e.name.toLowerCase();
                      const matchParts = m.mecz.toLowerCase().replace(/at/g, 'vs').split('vs').map(p => p.trim());
                      if (matchParts.length >= 2) {
                          const t1 = getTeamKey(matchParts[0]);
                          const t2 = getTeamKey(matchParts[1]);
                          return n.includes(t1) && n.includes(t2);
                      }
                      return false;
                  };

                  const allEvents = [...(resPrev?.events || []), ...(res1?.events || []), ...(res2?.events || [])];
                  const event = allEvents.find(isMatch);

                  if (event && event.status.type.state === 'post') {
                      const s = event.competitions[0].competitors;
                      const homeScore = s.find(c => c.homeAway === 'home')?.score || s[0].score;
                      const awayScore = s.find(c => c.homeAway === 'away')?.score || s[1].score;
                      m.wynik = `${homeScore}-${awayScore}`;
                      meczeDoOceny.push(m);
                      console.log(`🏀 Znaleziono wynik NBA: ${m.wynik}`);
                  }
              }
            }
          } catch(e) { console.log(`⚠️ Błąd sprawdzania wyniku dla ID ${m.fixture_id}:`, e.message); }
        }
      }
    }

    if (meczeDoOceny.length > 0) {
      console.log(`🤖 AI Sędzia ocenia ${meczeDoOceny.length} rozegranych meczów...`);
      const prompt = `Jesteś matematycznym sędzią bukmacherskim. Poniżej masz listę zakończonych meczów. Znasz typ bukmacherski oraz oficjalny wynik meczu (Gospodarz-Gość).
      Rozlicz każdy typ matematycznie, czy jest wygrany czy przegrany.
      Dane: ${JSON.stringify(meczeDoOceny.map(m => ({id: m.fixture_id, typ: m.typ, wynik: m.wynik})))}
      Zwróć TYLKO czysty obiekt JSON: {"oceny": [{"id": "ID_MECZU", "status": "wygrana"}, {"id": "INNE_ID", "status": "przegrana"}]}`;

      let zaktualizowano = false;

      for (const model of modeleDoTestu) {
          try {
            const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
            const aiRes = await fetch(generateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
            const aiData = await aiRes.json();
            
            if (aiData.candidates && aiData.candidates[0].content) {
                let rawText = aiData.candidates[0].content.parts[0].text;
                let cleanJson = JSON.parse(rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1));

                for (let dzien of historia) {
                    if (!dzien.mecze) continue;
                    for (let m of dzien.mecze) {
                        const ocena = cleanJson.oceny?.find(o => String(o.id) === String(m.fixture_id));
                        if (ocena && m.wynik) {
                            m.status = ocena.status;
                            if(!m.analiza.includes('[Wynik:')) m.analiza += ` [Wynik: ${m.wynik}]`;
                            zaktualizowano = true;
                            console.log(`✅ Zmieniono status meczu ${m.mecz} na: ${m.status}`);
                        }
                    }
                }
                break; // Skoro ocenił poprawnie, przerywamy pętlę modeli
            }
          } catch(e) {}
      }
      if (zaktualizowano) {
          fs.writeFileSync(historyPath, JSON.stringify(historia, null, 2));
          console.log("💾 Zapisano nową historię z rozliczonymi kuponami.");
      }
    } else {
      console.log("ℹ️ Żaden z oczekujących meczów nie został jeszcze zakończony (lub API nie podało wyniku).");
    }
  }

  // Odpalamy sędziego zanim pobierzemy nowe mecze
  await settleHistory();

  try {
    // --- 3. POBIERANIE PIŁKI I NBA NA DZIŚ ---
    console.log("⚽ Pobieram Piłkę Nożną...");
    const apiFootball = await fetchSports(`https://v3.football.api-sports.io/fixtures?date=${dataDlaApiFootball}&timezone=Europe/Warsaw`, {
      method: 'GET', headers: { 'x-apisports-key': apiSportsKey }
    });

    if (apiFootball && apiFootball.response) {
        const szerokieLigi = [1, 2, 3, 4, 5, 9, 10, 15, 30, 32, 34, 39, 40, 61, 71, 78, 88, 94, 106, 135, 140, 203, 253, 468, 848];
        let wybranePilka = apiFootball.response.filter(match => szerokieLigi.includes(match.league.id) && match.fixture.status.short === 'NS');
        if (wybranePilka.length < 5) wybranePilka = apiFootball.response.filter(match => match.fixture.status.short === 'NS'); 

        listaPilka = wybranePilka.slice(0, 40).map(match => {
            const godzina = new Date(match.fixture.date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
            return `ID: ${match.fixture.id} | ${godzina} | ${match.teams.home.name} vs ${match.teams.away.name} (${match.league.name})`;
        }).join('\n');
    }

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

    let zapisanoNowe = false;

    // Próbujemy wszystkie dostępne modele po kolei
    for (const model of modeleDoTestu) {
        try {
            const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
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
                
                const dzisiejszyIndex = historia.findIndex(h => h.data === dzisiajPl);
                if (dzisiejszyIndex !== -1) {
                    historia[dzisiejszyIndex] = { data: dzisiajPl, mecze: generatedData.mecze };
                } else {
                    historia.push({ data: dzisiajPl, mecze: generatedData.mecze });
                }
                
                fs.writeFileSync(historyPath, JSON.stringify(historia.slice(-30), null, 2)); 
                console.log(`✅ NOWE TYPY ZOSTAŁY ZAPISANE! (Sukces na modelu: ${model})`);
                zapisanoNowe = true;
                break; // Mamy to, wychodzimy z pętli!
            } else {
                console.log(`❌ Model ${model} zawiódł, sprawdzam następny...`);
            }
        } catch (e) {
            console.log(`❌ Błąd połączenia z modelem ${model}...`);
        }
    }
    
    if (!zapisanoNowe) {
        console.error("❌ WSZYSTKIE pobrane modele AI zawiodły.");
    }

  } catch (e) {
    console.error("❌ Błąd Skryptu:", e.message);
  }
}
run();
