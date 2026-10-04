# Mode plan pour Pi

> 🌐 Disponible en : [English](../README.md) | [Español](README.es.md) | [Português](README.pt.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md).

Extension TypeScript qui ajoute la planification conversationnelle à **Pi Agent 1.0.1** : explorer un projet, clarifier les décisions, suggérer des améliorations utiles et présenter un plan avant l'implémentation. Paquet : `pi-plan-claude-codex`, version `0.1.1`.

Le workflow s'inspire de la [planification de Codex](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) et de la [revue et approbation de plans de Claude Code](https://code.claude.com/docs/en/permission-modes#review-and-approve-a-plan). L'implémentation utilise les API publiques et la documentation d'une installation locale de Pi 1.0.1 ; revérifiez ces contrats avant d'utiliser d'autres versions.

## Installation et utilisation

Installez le paquet une fois :

```sh
pi install npm:pi-plan-claude-codex
```

Puis lancez Pi comme d'habitude, depuis n'importe quel projet :

```sh
pi
```

Activez le mode dans la conversation :

```text
/plan
```

Décrivez ensuite votre objectif dans un message ordinaire, par exemple : « Je veux ajouter une recherche au catalogue ; étudiez son fonctionnement et suggérez des améliorations avant de décider. »

L'installation enregistre le paquet dans la configuration personnelle de Pi. Il se charge automatiquement lors des lancements suivants, ce qui rend `/plan` disponible. Activez le mode avec cette commande ; aucun chemin ni option n'est nécessaire au démarrage. `/plan <demande>` est également pris en charge comme raccourci.

Pour installer une copie locale, y compris avant la première publication npm, exécutez :

```sh
pi install /absolute/path/to/pi-plan-claude-codex
```

Utilisez ensuite le même flux `pi` → `/plan`.

Nécessite Pi 1.0.1 et Node.js `>=22.19.0`. Pi charge le TypeScript directement sans étape de compilation préalable et fournit les dépendances déclarées dans `peerDependencies`.

## Déroulement

1. **Explorer.** Lisez les instructions du projet et explorez son implémentation. Cherchez d'abord les faits que l'agent peut découvrir par lui-même.
2. **Discuter.** Clarifiez l'objectif, la portée, les contraintes et les critères de succès. Suggérez des améliorations utiles d'UX, de simplicité ou de comportement, expliquez leurs compromis et demandez s'il faut les inclure.
3. **Trancher les décisions.** Fixez les interfaces, l'approche, les erreurs, la compatibilité et la validation. L'entretien s'adapte à la tâche : en général une décision par question, jusqu'à trois questions liées, sans nombre minimal de tours ni questions de remplissage.
4. **Réviser.** Présentez un plan Markdown complet avec les décisions acceptées, des étapes vérifiables, des tests et des hypothèses. L'utilisateur choisit la suite.

Les questions peuvent proposer des options avec compromis et recommandation, ainsi qu'une réponse libre. Annuler laisse la décision sans réponse et arrête le tour. Le modèle est instruit de préserver les décisions antérieures et de ne pas élargir la portée sans approbation. La qualité de l'entretien et l'exhaustivité du plan dépendent aussi du modèle sélectionné.

Lorsque le plan est présenté, ces actions sont disponibles :

- **Continuer à planifier :** conserve la proposition en attente et les restrictions de lecture seule.
- **Affiner le plan :** demande des commentaires et génère une nouvelle révision.
- **Exécuter dans cette conversation :** restaure les outils précédents et commence l'implémentation en suivant le plan approuvé.
- **Exécuter dans une session propre :** crée une session sans l'historique de l'entretien et transmet le plan complet, sa provenance, le modèle, le niveau de raisonnement et les outils précédents.

Annuler la révision maintient le mode actif. Une approbation ne vaut que pour cette proposition et cette session. Toute nouvelle information invalide la proposition précédente ; une réponse tardive à un dialogue invalidé ne peut pas démarrer l'exécution. Si la création d'une session propre est annulée, la planification reprend.

## Commandes

| Commande | Résultat |
| --- | --- |
| `/plan` | Active ou désactive le mode plan. |
| `/plan <demande>` | Active le mode et commence à planifier cette demande. |
| `/plan on` | Active sans envoyer de demande au modèle. |
| `/plan off` | Désactive le mode et restaure les outils précédents. |
| `/plan status` | Affiche le mode, la révision, le statut et le fichier Markdown. |
| `/plan review` | Affiche de nouveau la proposition et le sélecteur ; réessaie une exportation échouée. |
| `/plan execute` | Ouvre le même sélecteur de révision ; une action doit être choisie. |
| `/plan refine [commentaires]` | Affine la proposition avec des commentaires ou ouvre une invite pour les saisir. |
| `--plan` | Démarre en mode plan si la branche n'a aucun état enregistré. |

Les changements de mode ont lieu lorsque l'agent est inactif. Écrire « implémente le plan » comme un message ordinaire maintient l'agent en mode planification : la transition passe par les commandes ou le choix explicite d'exécution. `/plan off` met fin aux restrictions du mode sans démarrer automatiquement l'implémentation.

## Exploration autorisée

Lorsqu'il est actif, `read`, `grep`, `find`, `ls` et trois outils intégrés sont activés :

| Outil | Fonction |
| --- | --- |
| `plan_ask` | Poser des questions avec options ou réponse libre. |
| `plan_submit` | Enregistre et présente une proposition ; n'approuve pas son exécution. |
| `plan_inspect` | Requêtes Git fixes : `status`, `diff`, `log` et `show`. |

Les outils externes déjà actifs peuvent rester disponibles s'ils déclarent `readOnlyHint: true` et ne déclarent pas `destructiveHint: true`. Les outils inconnus ou mutants sont bloqués, y compris les appels imbriqués, de même que `bash`, `powershell`, `codemode`, `write`, `edit` et les commandes utilisateur `!`/`!!`.

`plan_inspect` utilise des arguments directs, sans shell, avec des opérations fixes, des références validées, des options qui désactivent les diffs externes et textconv, un délai de dix secondes et une sortie bornée. Les tests, builds, scripts et installations doivent attendre l'exécution approuvée. Si le plan nécessite des preuves qui dépendent de ces opérations, il doit reconnaître cette limite.

Il s'agit d'une politique au sein de Pi, et non d'un bac à sable du système d'exploitation. Les annotations des outils externes sont des déclarations de leurs auteurs ; les autres extensions exécutent du code avec les permissions de Pi. Les propres écritures du mode sont limitées aux instantanés de session et aux exports de propositions.

## État et fichiers

L'état et la dernière proposition sont enregistrés comme entrées personnalisées sur la **branche actuelle de la session**. Ils sont restaurés lors de la reprise, du rechargement, du changement de session ou de la navigation dans l'arbre. Une nouvelle branche n'hérite que des instantanés présents chez ses ancêtres.

Chaque proposition crée un fichier `.pi/plans/<uuid>.md` séparé dans le projet sans écraser les révisions précédentes. La session est la source de vérité ; modifier le Markdown exporté ne modifie ni n'approuve automatiquement la proposition. Utilisez `/plan refine` pour intégrer des changements. `.pi/plans/` est exclu de Git dans ce dépôt.

En cas d'échec d'exportation, la proposition reste dans la session, le sélecteur d'exécution n'est pas ouvert et `/plan review` permet de réessayer. Les répertoires `.pi` et `plans` ne peuvent pas être des liens symboliques. Les fichiers sont créés en exclusivité avec les permissions `0600` sur les systèmes pris en charge. `--no-session` conserve l'état uniquement pour le processus, tandis que les fichiers Markdown restent sur le disque.

## TUI, RPC, print et JSON

La TUI utilise des dialogues natifs et un indicateur de mode. `regular` et `fullscreen`, Unicode et le redimensionnement vers un terminal étroit ont été testés.

RPC utilise les requêtes natives `extension_ui_request` (`select` et `input`), des widgets de texte et des notifications. Le client doit afficher la proposition et répondre aux dialogues avec `extension_ui_response`, ou les annuler. Les réponses et approbations ne sont jamais déduites d'un délai d'attente. L'implémentation commence après la fin du tour de planification.

Print/texte et JSON conservent les restrictions sans dialogues ni exécution automatique. Les questions en attente sont incluses dans la réponse finale ; lorsque le plan est terminé, il est exporté et le modèle doit inclure son Markdown dans la réponse finale. JSON/RPC gardent stdout réservé au protocole.

```sh
pi --plan -p 'Plan a catalog search'
pi --plan --mode json -p 'Plan a catalog search'
pi --mode rpc
```

## Développement et vérification

Pour tester la copie de travail sans la publier, installez son chemin avec `pi install /absolute/path/to/pi-plan-claude-codex` ; puis utilisez `pi` et `/plan` comme avec le paquet npm. Pour le charger le temps d'une seule invocation de développement, utilisez `pi -e /absolute/path/to/pi-plan-claude-codex`.

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

Le vérificateur réutilise les dépendances de l'installation de Pi. Les tests de distribution empaquettent l'extension, servent l'archive depuis un registre npm local et exécutent `pi install npm:pi-plan-claude-codex` dans un profil temporaire. Ils démarrent ensuite `pi` sans arguments et activent `/plan` dans un vrai terminal. Ils ne modifient pas la configuration personnelle de l'utilisateur et ne téléchargent pas de dépendances tierces.

`check` nécessite `tsc` sur le PATH. Vous pouvez spécifier `PI_PLAN_HOST_ROOT` (la racine du paquet Pi) et `PI_PLAN_TSC` (l'exécutable du vérificateur). Les tests utilisent l'élimination native des types de Node et ont été vérifiés avec Node `24.18.0`. Les tests de terminal Unix nécessitent Python 3 et sont ignorés sous Windows.

La suite vérifie l'installation et le chargement automatique, la politique d'outils, les instantanés de branches, les exports, les erreurs et l'annulation, l'approbation dans les deux sessions, la préservation du modèle/raisonnement, l'invalidation des dialogues, l'affinement, le rechargement, l'isolation de l'historique, les appels imbriqués, les modes sans UI et un vrai terminal. Elle utilise le runtime Pi installé avec un fournisseur déterministe, sans appels de modèles ni identifiants réels. Les fixtures ne sont pas incluses dans le paquet distribuable.

Ces tests vérifient les mécanismes et le comportement du protocole. Ils ne constituent pas une évaluation conversationnelle avec un modèle réel ni une validation de clients RPC spécifiques.
