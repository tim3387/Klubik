# data/ — fichier de prospection (jamais commité)

Placez ici **l'unique** version vivante du fichier, sous ce nom exact :

    data/klubik-prospection-master.xlsx

(ou indiquez un autre chemin avec la variable d'environnement `KLUBIK_CRM_FICHIER`).

L'outil crée à côté :
- `sauvegardes/` — une copie horodatée du fichier avant chaque écriture ;
- `journal-crm.jsonl` — le journal des modifications (club, avant → après, sauvegarde associée).

Tout le contenu de ce dossier, sauf ce README, est exclu de git : il contient des données de prospection.
Pour revenir en arrière : fermer Excel, copier la sauvegarde voulue à la place du fichier.
