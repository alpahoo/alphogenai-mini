# Audit des refus de l’assistant Studio

Code examiné sur `main` au commit `03756db`.

- Le prompt système de `conversation.ts` décrit les opérations permises et renvoie aux limites réelles du workflow. Les consignes H3 et MOSS de `guidance.ts` portent sur les formats, les paramètres et la construction du prompt. Aucune de ces instructions n’interdit la nudité artistique.
- `POST /api/admin/studio/assistant` vérifie l’administration, la disponibilité du fournisseur, la forme de la requête et les quotas. Le parseur vérifie notamment la longueur des messages. Cette route ne modère pas le texte.
- C2a contrôle les clés, les types, les bornes et la variante du workflow. `refused` contient des erreurs de proposition C2a. La carte fait revalider les paramètres avant de les appliquer au formulaire. La soumission reste une action distincte de l’administrateur.
- L’adaptateur envoie le prompt système, les messages et les trois outils C2a à Groq pour `qwen/qwen3.8-27b`. La saisie directe dans le formulaire de génération ne passe pas par cette conversation. Le résultat du générateur ne permet donc pas de déduire la réponse du modèle conversationnel.

## Identifier le chemin d’un incident

| Signal | Origine observable |
| --- | --- |
| HTTP 200, `stop: answered` et réponse textuelle de refus | Texte de la complétion. Le cas usuel est `finish_reason: stop`. |
| HTTP 200, `stop: refusal` | L’adaptateur a détecté `message.refusal` ou `finish_reason: content_filter`. Le champ renvoyé au Studio ne distingue pas ces deux signaux. |
| HTTP 200, `stop: provider_error` | Échec du fournisseur, du transport ou du décodage. Les détails du corps Groq sont écartés. Un abandon est classé séparément sous `timeout`. |
| HTTP 200, `refused` contenant des erreurs | Échec de validation de la proposition C2a. |
| HTTP 400/413, 429 ou 503 sur la route Studio | Validation de requête, quota Studio ou assistant indisponible, respectivement. |

Relever uniquement le statut HTTP et `stop` dans la réponse réseau du Studio, ou le champ `stop` du journal structuré `studio_assistant` pour la requête concernée. Aucun prompt, texte de réponse ni corps d’erreur Groq n’est nécessaire pour cette première attribution. Sans ce signal, l’incident rapporté reste non attribué. [Codes HTTP Groq](https://console.groq.com/docs/errors)

## Critères fonctionnels

L’assistant doit pouvoir aider à composer des portraits d’adultes fictifs, des études anatomiques ou des nus artistiques non sexuels et non explicites, ainsi que des photographies de mode, de studio et de cinéma, dans les limites attestées du workflow. Les demandes d’exploitation sexuelle de mineurs, d’images intimes non consenties et de contenus sexuels illégaux doivent être refusées sans proposition.

Les tests simulent les réponses de Groq et vérifient le transport, la validation C2a et la restitution des refus. Les cas interdits emploient uniquement des libellés de catégorie. Cette couverture ne mesure pas les décisions de Qwen en production. L’audit ne montre aucune règle applicative à retirer. La comparaison du comportement réel nécessite le signal de l’incident ou une vérification textuelle dédiée avant d’ajuster les consignes.
