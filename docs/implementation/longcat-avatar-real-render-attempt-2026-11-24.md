# Premier rendu GPU reel sur le staging (2026-11-24, Claude) : ECHEC, cause identifiee, corrige, non rejoue

Autorise par le proprietaire (un seul rendu, attendu ~0,55 USD, plafond ~0,96 USD). Lance depuis `/admin/studio/avatar` sur la Preview de #125
par `tools/avatar-staging/real-render-luz.mjs --confirm-gpu-spend` (portrait Luz 1152x1536, voix FR 9,68 s, prompt valide du POC).

## Ce qui s'est passe
- Compte jetable, app Modal du staging sans simulation, Preview verifiee (bundle staging seul), porte ouverte pour 1 run : tout correct.
- Run `9bd11681` : **failed / GENERATION_FAILED**, aucun MP4. **Un seul run** a ete cree (aucune execution en double), 0,75 USD reserves,
  `finance_status = awaiting_reconciliation`.
- Journal Modal (lecture seule) : le conteneur `execute_avatar` demarre ~14:07:36 UTC, puis
  `Runner killed (SIGKILL), exit code: 137. Most often this happens when the process runs out of memory`, entre 14:09:06 et 14:10:06,
  c'est-a-dire pendant le chargement des ~47 Go de poids (le chargement dure ~170 s au POC). L'application constate l'echec a ~14:11
  (`comfy_run_failed ... GENERATION_FAILED`), sans nouvel essai.
- Le script a attendu 12 minutes avant de conclure (il attendait une video) : c'est un defaut du script, pas du rendu. Corrige : il s'arrete
  des que le run est terminal.

## Cout reellement engage (estimation, a confirmer sur le tableau de bord Modal)
Conteneur GPU actif environ 2,5 minutes au plus : au plus ~0,16 USD de GPU + ~0,04 USD de CPU/memoire, soit **~0,2 USD maximum**, sous le plafond annonce.
Aucun conteneur ne reste actif (`modal app list` : 0 tache), la porte est fermee, 0 compte jetable, 0 run actif, 0 secret de contournement.

## Cause probable et correctif (non deploye, non rejoue)
`modal_app/comfy/app.py` : `execute_avatar` declarait `memory=(65536, 65536)` = demande ET **limite stricte** de 64 Gio de RAM hote. Le POC, qui avait
reussi, passait une simple demande (`memory=65536`, sans limite stricte). Le chargement des poids depasse tres probablement 64 Gio de memoire
hote. Correctif : `memory=(65536, 131072)` (demande inchangee, limite portee a 128 Gio), uniquement pour l'executeur Avatar (celui de H3 n'est pas touche).
La cause est la plus probable d'apres le code de sortie 137 et la difference avec le POC ; elle n'est pas prouvee tant qu'un rendu n'a pas ete rejoue.

## Suite
Un second rendu necessite un nouvel accord explicite (meme cout attendu ~0,55 USD, plafond ~0,96 USD). Apres lui, l'app Modal repasse en simulation.
Tests Python : `test_avatar` et `test_moss_executor_select` echouent dans le venv de recette (paquet `supabase` absent) avec ou sans ce changement ;
a rejouer dans l'environnement CI.

---

# Essai 2 (meme jour, autorise une seule fois) : ECHEC `GPU_EXECUTION_TIMEOUT`, arret apres cet essai

Conditions posees par le proprietaire, verifiees avant le lancement : tests Python (71/71, 0 ignore, dependances de la CI, Python 3.13 au lieu de 3.12, ffmpeg du depot dans le PATH ;
`test_avatar` n'est pas dans le workflow CI, non modifie), plafond recalcule, reservation du premier run sans effet sur l'admission (l'admission ne lit que la ligne de la porte ;
total `awaiting_reconciliation` = 0 car la ligne du run 1 a ete supprimee avec le compte jetable ; la porte est rouverte a `committed_usd = 0`).
Changement fait pour tenir le plafond : `AVATAR_EXECUTOR_TIMEOUT_SECONDS` 720 -> 640 s (avec la limite de 128 Gio, le pire cas theorique passait a ~1,07 USD ; a 640 s : ~0,95 USD).

## Observe
- Run `70fbbbdc` : **failed / GPU_EXECUTION_TIMEOUT**, aucun MP4, un seul run (pas de doublon), duree murale 693 s (= delai de 640 s + marge d'attente de la page).
- **Plus de `SIGKILL` / code 137** : le correctif de memoire a tres probablement leve l'arret par manque de memoire. Le conteneur est reste actif jusqu'au delai.
- Le journal Modal ne contient que la banniere CUDA : la sortie du rendu n'est pas relayee, on ne sait donc pas dans quelle phase le temps est passe
  (chargement des ~47 Go, pretraitement audio, ou segments de debruitage). Le POC mesurait 354 a 408 s au total (chargement 169 a 223 s + 3 segments ~185 s).

## Cout observe (facturation Modal, environnement `comfy-staging`, heure 14:00-15:00 UTC, resolution horaire, la plus fine)
**1,456 USD** pour les DEUX essais (plus de petits couts CPU/deploiement du meme intervalle). Le detail par essai n'est pas disponible a cette resolution.
C'est plus que mes estimations (essai 1 <= ~0,25 ; essai 2 ~0,86-0,95, soit ~1,1-1,2 au total) : l'ecart d'environ 0,25-0,35 USD vient probablement du demarrage du conteneur et de la
fenetre de 60 s avant arret (`scaledown_window`), facturables en plus du delai. **Formule de plafond corrigee** pour la suite :
(delai + 60 s de fenetre + demarrage) x 0,001486 USD/s : a 640 s, > 1,04 USD avant demarrage. Aucun autre essai n'a ete lance.

## Etat laisse
Porte fermee, 0 compte jetable, 0 run actif, 0 secret de contournement, Preview reconstruite, app Modal remise en mode simulation (aucun conteneur actif).

## Hypotheses a verifier avant tout nouvel essai (non testees)
1. **Limite CPU stricte** : `cpu=(8, 8)` fixe une limite dure de 8 coeurs ; le POC passait `cpu=8` (demande seule, la limite par defaut etant plus haute). Des bibliotheques qui ouvrent beaucoup de fils (torch, numpy, preparation audio) peuvent etre etranglees.
2. **Lecture du volume** : le montage `read_only` / sans reseau pourrait etre plus lent que le montage du POC ; le POC avait lu 47 Go en 169 a 223 s.
3. Un blocage dans une phase (pas seulement de la lenteur) : non distinguable sans traces.
Proposition (sans GPU, a decider) : relayer la sortie du processus avec des horodatages par phase dans les journaux, aligner `cpu`/`memory` sur le POC (`cpu=8`, `memory=(65536, 131072)`),
puis ne rejouer qu'avec un accord explicite, un plafond recalcule avec la formule ci-dessus et un delai assez large pour finir la mesure.

---

# Preparation d'un troisieme essai (aucun GPU, rien deploye, rien lance)

## Ce qui a change (commit suivant `9ce5337`)
1. **Traces du rendu** (`modal_app/comfy/avatar.py`, `run_traced`) : la sortie du processus allait a `DEVNULL`. Elle est maintenant relayee dans le journal du conteneur, avec un temps relatif
   (`[avatar +123s] ...`), un battement toutes les 30 s (memoire courante et pic du conteneur, **temps de limitation CPU** du cgroup, charge, utilisation du GPU et VRAM), et les marqueurs
   `inputs ready`, `start`, `exited code=...`, `timeout after ...`. Confidentialite : le prompt et le repertoire prive sont masques (`[redacted]`), lignes coupees a 200 caracteres, 400 lignes au plus.
   Comportement inchange : memes codes d'erreur fixes, meme nettoyage, meme delai de 540 s, arret de tout le groupe de processus au delai.
2. **CPU aligne sur le POC** (`modal_app/comfy/app.py`) : `cpu=8` (demande seule) au lieu de `cpu=(8, 8)` (limite dure de 8 coeurs, hypothese 1 de l'essai 2). Memoire inchangee : `(65536, 131072)`.
3. **Script de rendu** : apres le run, il recupere les lignes `[avatar ...]` du journal Modal (`tmp/avatar-staging/luz/modal-traces.txt`) et en resume les marqueurs dans le rapport.
4. **Tests** : 80 tests Python OK avec les dependances de la CI (ffmpeg du depot dans le PATH, 0 ignore), dont 9 nouveaux : sortie relayee et horodatee, prompt et repertoire masques, echec sans ligne de commande,
   delai qui tue le processus, plafond de lignes, lignes longues, battement, lecture cgroup v2, et un garde-fou de plafond de cout (ressources de l'executeur, CPU 8 sans limite, memoire 128 Gio).
   Import des definitions `modal_app.comfy.app` / `broker` : OK. Test a blanc du script : OK.

## Plafond de cout recalcule (formule corrigee)
Taux pire cas : H100 0,001097 + RAM 128 Gio 0,000284 + 8 CPU 0,000105 = **0,001486 USD/s**.
| Variante | Duree comptee | Plafond |
|---|---|---|
| Essai complet, delai 640 s (+60 s de fenetre d'arret, +~60 s de demarrage) | 760 s | **~1,13 USD** |
| Sonde courte, delai 300 s (traces de chargement seulement, pas de clip) | 420 s | ~0,62 USD |
Cout deja constate : 1,456 USD (deux essais). Aucune des deux variantes n'est lancee ; la sonde courte demanderait un parametre de delai supplementaire non implemente.

## Point structurel a surveiller
Le collecteur de l'application abandonne 660 s apres la soumission, delai qui inclut le demarrage a froid du conteneur ; le delai propre de l'executeur (640 s) ne court qu'apres. Les traces
(`inputs ready after ...s` compare a l'heure de soumission) diront si le demarrage a froid consomme une part notable du budget.

## Attempt 3 (traced run, 2026-11-24 16:1x-16:29 UTC)

Result: **failed GPU_EXECUTION_TIMEOUT, but the render itself succeeded.**

- The traces show the avatar process exiting with **code 0 after 375 s** (3 segments x 8 denoising steps, about 54 s per segment, 6.8 s/it, VRAM peak 51.8 GiB, GPU 100 %). Attempt 2 was therefore not a hang or a CPU limit: nothing was wrong with the render.
- Timeline inside the container: weights load 0-45 s, INT8 DiT + LoRAs 45-142 s (slow, GPU idle: this is the read-only volume), first segment starts at 198 s, exit at 375 s.
- The run still failed because the collector deadline (660 s from submission) also counts the **cold start before the container executes anything**: the UI wall time was 693 s while the render only started about 290 s after submission. 290 s + 375 s > 660 s, so the collector gave up just after the render finished and the video was not collected.
- Observed cost (Modal billing, env comfy-staging, hour 16:00 UTC): **1.124 USD**, under the 1.13 USD ceiling. Total spent over the three attempts: 1.456 + 1.124 = 2.58 USD.
- Cleanup verified: gate closed (enabled false, 0 runs, budget 0), no active run, disposable account deleted, Vercel bypass revoked, Preview admin list restored, Modal back to simulation.

Not yet done (needs a decision and a new GPU approval): the fix is in the deadlines, not the render. The collector deadline must cover cold start + render (about 290 + 375 + margin), with the executor timeout and the cost ceiling re-derived from that. A second lever is the 290 s cold start itself (volume mount, image start).
