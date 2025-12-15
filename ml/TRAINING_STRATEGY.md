# Träningsstrategi: Från Enkelt till Komplext

## 🎯 Målet

Modellen ska lära sig att **korrigera GPS-fel** så att spåren visar hur du faktiskt gick. Det är INTE att artificiellt matcha spår - det är att visa verkligheten.

---

## 📚 Steg 1: Grundläggande Träning (Nuvarande)

### Vad vi tränar på:
- Spår där hund och människa gick tillsammans
- Små GPS-fel som justeras för att visa verklig rörelse
- Spår som naturligt matchar varandra (eftersom de gick tillsammans)

### Vad modellen lär sig:
```
"GPS accuracy = 15m → Korrigera 5 meter"
"GPS accuracy = 20m → Korrigera 8 meter"
etc.
```

### Resultat:
- Modellen korrigerar GPS-fel bra
- När hund och människa gick tillsammans → spåren matchar naturligt efter korrigering
- Spåren ser ut som de faktiskt gick

---

## 🎓 Steg 2: Avancerad Träning (Framtida)

### Vad vi kommer träna på:
- Spår där hunden gick annorlunda än människan
- Spår där hunden valde egen väg
- Spår där hund och människa separerade

### Vad modellen kommer lära sig:
```
"GPS accuracy = 15m, hund gick annorlunda → Korrigera 5 meter (men inte matcha människaspår)"
"GPS accuracy = 20m, hund valde egen väg → Korrigera 8 meter (följ hundens faktiska rörelse)"
```

### Resultat:
- Modellen korrigerar GPS-fel även när hund och människa gick olika
- Spåren visar verkligheten: när de gick tillsammans matchar de, när de gick olika visar de det
- Modellen förstår skillnaden mellan GPS-fel och faktisk separation

---

## 💡 Varför Denna Strategi Är Bra

### 1. Grundläggande Förståelse Först
Modellen lär sig först:
- Hur GPS-fel ser ut
- Hur man korrigerar GPS-fel
- Vad "korrekt" position betyder

### 2. Komplexa Fall Senare
När grunderna är klara, lär sig modellen:
- När GPS-fel ska korrigeras (när hund och människa gick tillsammans)
- När separation är verklig (när hunden valde egen väg)
- Skillnaden mellan fel och verklighet

### 3. Naturlig Progression
- **Steg 1**: Lär sig korrigera GPS-fel → spår matchar när de gick tillsammans
- **Steg 2**: Lär sig identifiera verklig separation → spår visar när de gick olika

---

## 🔍 Hur Modellen Ser Dina Justeringar Nu

### När Du Justerar Spår Där Hund och Människa Gick Tillsammans:

**Vad du gör:**
```
Original GPS: Hundspår har "hopp" (GPS-fel)
Din justering: Korrigerar GPS-fel → spår matchar människaspår
Resultat: Spår visar hur ni faktiskt gick tillsammans
```

**Vad modellen ser:**
```
Position #10: GPS accuracy = 15m → Korrigera 3m
Position #11: GPS accuracy = 18m → Korrigera 5m
Position #12: GPS accuracy = 12m → Korrigera 2m
```

**Vad modellen lär sig:**
- "När GPS accuracy är ~15m, korrigera ~3-5 meter"
- Modellen ser INTE att du matchade människaspår
- Men när modellen korrigerar GPS-fel bra → spåren matchar naturligt!

---

## 🎯 Praktiskt Exempel

### Scenario: Du Gick Tillsammans med Hunden

**Original GPS-data:**
```
Människaspår: 59.3660, 17.9911 (korrekt)
Hundspår:     59.3665, 17.9918 (GPS-fel, ni gick faktiskt tillsammans)
```

**Din justering:**
```
Korrigerar hundspår till: 59.3661, 17.9912 (nära människaspår)
```

**Vad modellen lär sig:**
- "GPS accuracy = 15m → Korrigera till position nära människaspår"
- Modellen ser INTE att du matchade människaspår
- Men modellen lär sig korrigera GPS-fel → resultatet matchar naturligt!

**När modellen är tränad:**
```
Modellen ser: GPS accuracy = 15m, hundspår position
Modellen korrigerar: GPS-fel → position nära människaspår
Resultat: Spåren matchar (eftersom ni faktiskt gick tillsammans)
```

---

## 🚀 Framtida Scenario: Hunden Gick Annorlunda

### När Du Tränar på Spår Där Hunden Gick Annorlunda:

**Original GPS-data:**
```
Människaspår: 59.3660, 17.9911 (korrekt)
Hundspår:     59.3680, 17.9930 (korrekt - hunden gick faktiskt annorlunda)
```

**Din justering:**
```
Korrigerar bara små GPS-fel, behåller separationen
```

**Vad modellen kommer lära sig:**
- "När GPS accuracy är bra och separation är stor → separation är verklig"
- "När GPS accuracy är dålig och separation är stor → korrigera GPS-fel"
- Skillnaden mellan GPS-fel och verklig separation

---

## ✅ Sammanfattning

### Nuvarande Träning (Steg 1):
- ✅ Modellen lär sig korrigera GPS-fel
- ✅ När hund och människa gick tillsammans → spåren matchar naturligt efter korrigering
- ✅ Modellen behöver INTE lära sig att matcha spår - det händer automatiskt när GPS-fel korrigeras

### Framtida Träning (Steg 2):
- 🔜 Modellen lär sig identifiera verklig separation
- 🔜 Modellen förstår skillnaden mellan GPS-fel och faktisk separation
- 🔜 Spåren visar verkligheten: matchning när de gick tillsammans, separation när de gick olika

### Strategi:
1. **Nu**: Träna på enkla fall (gick tillsammans) → lära sig grunderna
2. **Senare**: Träna på komplexa fall (gick olika) → lära sig avancerat

**Detta är en smart strategi!** 🎯

