# Parallax #118 — premier lot Image

Ce lot réutilise le Studio MOSS existant. Il ne lance aucune génération et ne modifie aucun environnement hébergé.

Le périmètre vérifié localement est :

- manifest MOSS admin-only, texte-vers-image, sortie PNG originale conservée ;
- paramètres déclarés, options et bornes min/max ; les clés inconnues et les références ne correspondant pas au modèle sont exclues ;
- contrôle serveur par administrateur et propriétaire, avec URL signée pour un média privé ;
- réouverture de l’historique par identifiant de média, donc persistance du PNG après rechargement ;
- référence de bibliothèque permanente, conservée quand la génération est supprimée ;
- navigation Studio simulée sur petit écran via les onglets Create, Result et History.

À valider sur une Preview reliée à une base de test isolée : connexion admin, création d’une image MOSS sans fournisseur payant, vérification du PNG après rechargement, expiration puis renouvellement d’URL signée, suppression du résultat sans suppression de la référence, et parcours à 375 px avec un vrai compte admin. La cible Cinema doit rester séparée de la Preview commune avant toute migration ou fixture.

