# Snabbstart - Testa GPS-spårning

## Steg 1: Starta Backend

Öppna en terminal och kör:

```bash
cd backend
pip install fastapi uvicorn pydantic
uvicorn main:app --host 0.0.0.0 --reload
```

**Vänta tills du ser:** `Uvicorn running on http://0.0.0.0:8000`

✅ Backend körs nu på port 8000

---

## Steg 2: Starta Frontend

Öppna en NY terminal och kör:

```bash
cd frontend
npm install
npm run dev
```

**Vänta tills du ser:** `Local: http://localhost:3000`

✅ Frontend körs nu på port 3000

---

## Steg 3: Hitta din dators IP-adress

**Windows:**
```bash
ipconfig
```
Leta efter "IPv4 Address" (t.ex. `192.168.1.100`)

**Mac/Linux:**
```bash
ifconfig
```
eller
```bash
ip addr
```

---

## Steg 4: Öppna på telefonen

1. **Se till att telefonen är på samma WiFi som datorn**
2. **Öppna webbläsaren på telefonen**
3. **Gå till:** `http://[DIN_IP]:3000`
   - Exempel: `http://192.168.1.100:3000`

---

## Steg 5: Testa GPS-spårning

### Testa spår 1 (Människa):

1. På telefonen, gå till "GPS Spårning"-sektionen
2. Välj "Spåra som: Människa 🚶"
3. Klicka "▶ Starta spårning"
4. **Bevilja GPS-tillstånd** när telefonen frågar
5. **Gå runt** - spåret visas i **röd linje** på kartan
6. Klicka "⏹ Stoppa spårning"

### Testa spår 2 (Hund):

1. Välj "Spåra som: Hund 🐕"
2. Klicka "▶ Starta spårning"
3. **Gå runt igen** - spåret visas i **lila streckad linje** på kartan
4. Klicka "⏹ Stoppa spårning"

### Resultat:

- ✅ Båda spåren ska synas på kartan samtidigt
- ✅ Röd linje = människans spår
- ✅ Lila streckad linje = hundens spår
- ✅ Startmarkörer (🚶 och 🐕) visar var varje spår började

---

## Felsökning

### Telefonen kan inte nå appen
- ✅ Kontrollera att telefonen är på samma WiFi
- ✅ Kontrollera att backend körs (`--host 0.0.0.0`)
- ✅ Kontrollera att frontend körs (`host: true` i vite.config.js)
- ✅ Testa att öppna `http://[DIN_IP]:8000/ping` i telefonens webbläsare

### GPS fungerar inte
- ✅ Kontrollera att du beviljade GPS-tillstånd i webbläsaren
- ✅ Kontrollera att GPS är aktiverat på telefonen
- ✅ Försök utomhus för bättre GPS-signal

### Spåren syns inte
- ✅ Klicka "Uppdatera" i "Befintliga spår"-sektionen
- ✅ Kontrollera att du gick minst några meter (behöver 2+ positioner)
- ✅ Kontrollera Developer Tools (F12) för fel i webbläsaren

---

## Tips

- 🌳 **Testa utomhus** för bästa GPS-precision
- 📍 **Gå minst 10-20 meter** för att få ett tydligt spår
- 🗺️ **Zoom in/ut** på kartan för att se spåren bättre
- 🔄 **Uppdatera sidan** om något inte fungerar

