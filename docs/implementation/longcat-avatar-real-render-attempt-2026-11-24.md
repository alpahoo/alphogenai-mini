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
