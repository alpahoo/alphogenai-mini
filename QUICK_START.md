# 🚀 AlphoGenAI Mini - Démarrage Rapide

## En 5 minutes

### 1. Installation (2 min)

```bash
# Dépendances Next.js
npm install

# Dépendances Python
cd workers
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 2. Configuration (1 min)

```bash
# Copier et éditer .env.local
cp .env.example .env.local
```

**Minimum requis:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE=your-service-key
DASHSCOPE_API_KEY=sk-xxx
ELEVENLABS_API_KEY=el-xxx
REMOTION_SITE_ID=site-xxx
REMOTION_SECRET_KEY=sk-xxx
VIDEO_ENGINE=wan
```

### 3. Base de Données (1 min)

Ouvrir Supabase SQL Editor et exécuter:
```sql
-- Fichier: supabase/migrations/20251004_jobs_table.sql
```

### 4. Démarrage (1 min)

```bash
# Terminal 1
npm run dev

# Terminal 2
cd workers
./start_worker.sh
```

### 5. Premier Test (< 1 min)

```
1. Ouvrir: http://localhost:3000/generate
2. Saisir: "Un robot explique la lune à un enfant"
3. Cliquer: "Générer ma vidéo"
4. Attendre: 4-9 minutes
5. Regarder: Votre vidéo ! 🎉
```

---

## ⚡ Démarrage Express (avec test)

```bash
# One-liner
npm install && cd workers && pip install -r requirements.txt && cd .. && npm run dev
```

Puis dans un autre terminal:
```bash
cd workers && ./start_worker.sh
```

---

## 📖 Documentation Complète

- **Installation:** `FINAL_SYSTEM_COMPLETE.md`
- **Architecture:** `INTEGRATION_COMPLETE.md`
- **Workers:** `workers/README.md`
- **UI:** `UI_PAGES_INTEGRATION.md`

---

## 🆘 Aide Rapide

**Problème:** Worker ne démarre pas  
**Solution:** `cd workers && python -m workers.test_setup`

**Problème:** Vidéo ne se génère pas  
**Solution:** Vérifier logs worker et job status dans Supabase

**Problème:** Erreur API  
**Solution:** Vérifier toutes les clés dans `.env.local`

---

## 🎯 Fonctionnalités

- ✅ Génération vidéo IA complète
- ✅ Interface utilisateur moderne
- ✅ Cache intelligent
- ✅ Polling temps réel
- ✅ Sous-titres français
- ✅ Multi-engine vidéo

**Temps total:** 4-9 minutes (ou < 1s si cache)

---

Bon développement ! 🚀
