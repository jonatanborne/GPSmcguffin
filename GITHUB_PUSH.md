# Pusha till GitHub - Instruktioner

## Efter att du har skapat repo på GitHub:

### 1. Kopiera din repo URL
GitHub ger dig en URL som ser ut så här:
- HTTPS: `https://github.com/ditt-användarnamn/GPSmcguffin.git`
- SSH: `git@github.com:ditt-användarnamn/GPSmcguffin.git`

### 2. Kör dessa kommandon:

```bash
# Lägg till remote (ersätt med din riktiga URL)
git remote add origin https://github.com/ditt-användarnamn/GPSmcguffin.git

# Pusha till GitHub
git branch -M main
git push -u origin main
```

### 3. Om du behöver autentisera:
- GitHub kommer be om användarnamn och lösenord
- För lösenord: Använd ett Personal Access Token (inte ditt vanliga lösenord)
- Skaffa token här: https://github.com/settings/tokens
  - Klicka "Generate new token (classic)"
  - Ge den "repo" permissions
  - Kopiera token och använd som lösenord

## Alternativt: GitHub CLI (enklare)

Om du har GitHub CLI installerat:
```bash
gh repo create GPSmcguffin --public --source=. --remote=origin --push
```

