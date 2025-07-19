import os
import sys
import json
from groq import Groq
from dotenv import load_dotenv
import fitz  # PyMuPDF

# --- Étape 1: Configuration et Initialisation ---

# Charger les variables d'environnement du fichier .env
try:
    load_dotenv()
    print("Fichier .env chargé.")
except Exception as e:
    print(f"Avertissement : Impossible de charger le fichier .env. Erreur : {e}")

# Récupérer la clé API et quitter si elle n'est pas trouvée
API_KEY = os.getenv("GROQ_API_KEY")
if not API_KEY:
    raise ValueError("ERREUR FATALE : La variable d'environnement 'GROQ_API_KEY' n'est pas définie. Vérifiez votre fichier .env.")

# Initialiser le client Groq avec la clé
try:
    client = Groq(api_key=API_KEY)
    print(f"Client Groq initialisé avec la clé se terminant par '...{API_KEY[-4:]}'.")
except Exception as e:
    print(f"ERREUR FATALE lors de l'initialisation du client Groq: {e}")
    sys.exit(1)


# --- Étape 2: Définition des Prompts pour les Agents IA ---

# Agent 1 : Extrait les contrôles d'un petit morceau de texte
PDF_CONTROL_EXTRACTOR_PROMPT = """
Tu es un assistant d'audit spécialisé dans la lecture de rapports SOC 2. Ta mission est de lire le texte brut extrait d'un rapport d'audit et d'extraire CHAQUE point de contrôle individuel listé.

Pour chaque contrôle, tu dois extraire :
1. L'identifiant du contrôle (ex: "CC1.1.1", "CC1.1.2").
2. La description de l'activité de contrôle (Control Activity).
3. Le résultat du test (Test Results).

Si aucun contrôle n'est trouvé dans le texte fourni, retourne un objet JSON avec une liste "controls" vide.

**Texte à analyser :**
{text_chunk}

Retourne **UNIQUEMENT** un objet JSON valide contenant une seule clé "controls". La valeur doit être une liste d'objets.

**Exemple de réponse si des contrôles sont trouvés :**
{{
  "controls": [
    {{
      "control_id": "CC1.1.1",
      "control_activity": "Teads maintains an organizational chart...",
      "test_result": "No deviation identified."
    }}
  ]
}}

**Exemple de réponse si aucun contrôle n'est trouvé :**
{{
  "controls": []
}}
"""

# Agent 2 : Analyse le résultat d'un seul contrôle
CONTROL_ANALYZER_PROMPT = """
Tu es un auditeur IT qui évalue le résultat d'un test de contrôle unique.

**Informations du contrôle :**
- Identifiant : {control_id}
- Activité de contrôle : {control_activity}
- Résultat du test par l'auditeur : {test_result}

**Ta mission :**
Attribue un score de conformité et une justification basés **uniquement sur le `test_result`**.
- Si le `test_result` est "No deviation identified", "Aucune déviation identifiée", ou une phrase similaire indiquant un succès total, le score doit être **100**. La justification doit confirmer que le contrôle est efficace.
- Si le `test_result` mentionne une "exception", un "échec" ou une déviation, attribue un score plus bas (entre 40 et 70) et explique la nature de l'échec dans la justification.
- Si le `test_result` n'est pas clair, attribue un score de 50.

Retourne **UNIQUEMENT** un objet JSON valide avec les clés "control_id", "score", et "justification".
"""

# Agent 3 : Synthétise les résultats du rapport
REPORT_SYNTHESIZER_PROMPT = """
Tu es un directeur d'audit. Tu as reçu les scores de conformité pour tous les contrôles d'un rapport.

**Analyses des contrôles :**
{control_analyses}

**Ta mission :**
1.  **Calculer le score de conformité final** (moyenne de tous les scores).
2.  **Rédiger un résumé exécutif** (2-3 phrases) qui reflète le score. Si le score est élevé (ex: >95), indique que les contrôles sont globalement efficaces.
3.  **Identifier les 3 principaux domaines à risque**. S'il n'y a pas de risque (tous les scores sont à 100), retourne une liste vide [].
4.  **Proposer des recommandations générales**. S'il n'y a pas de risque, mentionne simplement de "Maintenir le niveau de contrôle actuel".

Retourne **UNIQUEMENT** un objet JSON valide avec les clés : "score_final", "resume_executif", "domaines_a_risque" (liste), et "recommandations" (liste).
"""


# --- Étape 3: Définition des Fonctions Utilitaires ---

def call_groq_model(prompt, model_name):
    """Fonction générique pour appeler un modèle Groq et parser la réponse JSON."""
    try:
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            response_format={"type": "json_object"},
        )
        response_content = chat_completion.choices[0].message.content
        return json.loads(response_content)
    except Exception as e:
        print(f"    !! Une erreur est survenue lors de l'appel à l'API Groq : {type(e).__name__} - {e}")
        return {"error": "Failed to get valid JSON from Groq API"}


# --- Étape 4: Fonction Principale (main) ---

def main(pdf_path):
    """Orchestre l'analyse du rapport d'audit avec Groq en utilisant le morcellement."""
    print(f"\n--- Lancement de l'analyse de conformité via Groq ---")
    print(f"Fichier cible : {pdf_path}")

    # Définition des modèles à utiliser
    powerful_model = "llama-3.3-70b-versatile"
    fast_model = "llama-3.1-8b-instant"

    # --- Phase 1: Extraction des contrôles PAGE PAR PAGE ---
    print("\n[Phase 1] Extraction des contrôles du PDF, page par page...")
    
    all_controls_found = []
    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        print(f"-> Document ouvert. Nombre de pages : {total_pages}.")

        for i, page in enumerate(doc):
            page_text = page.get_text("text")
            # On ne traite que les pages qui contiennent des mots-clés pertinents pour éviter les appels inutiles
            if "Ctrl #" in page_text or "Control Activity" in page_text or "CC" in page_text:
                print(f"  -> Analyse de la page {i + 1}/{total_pages} (page pertinente)...")
                
                extractor_prompt = PDF_CONTROL_EXTRACTOR_PROMPT.format(text_chunk=page_text)
                structured_data = call_groq_model(extractor_prompt, powerful_model)
                
                if 'error' in structured_data:
                    print(f"    !! Échec de l'extraction pour la page {i + 1}. On continue...")
                    continue

                page_controls = structured_data.get('controls', [])
                if page_controls:
                    print(f"    -> {len(page_controls)} contrôle(s) trouvé(s) sur cette page.")
                    all_controls_found.extend(page_controls)
        
        doc.close()

    except Exception as e:
        print(f"!! ERREUR FATALE lors de la lecture du PDF : {e}")
        return

    if not all_controls_found:
        print("\n!! FIN DU SCRIPT : Aucun contrôle n'a pu être extrait du document.")
        print("   Vérifiez que le PDF est bien un rapport de type SOC 2 avec des tableaux de contrôles.")
        return
        
    print(f"\n[Phase 1 Terminée] Total de {len(all_controls_found)} contrôles trouvés dans le document.")

    # --- Phase 2: Analyse individuelle de chaque contrôle ---
    print(f"\n[Phase 2] Analyse individuelle de chaque contrôle (Modèle: {fast_model})...")
    control_analyses = []
    for control in all_controls_found:
        print(f"  -> Analyse du contrôle : '{control.get('control_id', 'N/A')}'...")
        analyzer_prompt = CONTROL_ANALYZER_PROMPT.format(
            control_id=control.get('control_id', 'N/A'),
            control_activity=control.get('control_activity', ''),
            test_result=control.get('test_result', '')
        )
        analysis = call_groq_model(analyzer_prompt, fast_model)
        if 'error' not in analysis:
            control_analyses.append(analysis)

    # --- Phase 3: Synthèse finale ---
    if not control_analyses:
        print("!! FIN DU SCRIPT : Aucune analyse de contrôle n'a pu être complétée.")
        return

    print(f"\n[Phase 3] Synthèse finale en cours (Modèle: {powerful_model})...")
    synthesizer_prompt = REPORT_SYNTHESIZER_PROMPT.format(
        control_analyses=json.dumps(control_analyses, indent=2, ensure_ascii=False)
    )
    final_report = call_groq_model(synthesizer_prompt, powerful_model)

    if 'error' in final_report:
        print("!! FIN DU SCRIPT : Échec de la synthèse finale.")
        return

    print("\n\n--- ✅ ANALYSE DE CONFORMITÉ TERMINÉE ---")
    print(json.dumps(final_report, indent=4, ensure_ascii=False))


# --- Étape 5: Point d'Entrée du Script ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyse_pdf.py \"/chemin/vers/votre/rapport.pdf\"")
        sys.exit(1)
    
    pdf_file_path = sys.argv[1]
    if not os.path.exists(pdf_file_path):
        print(f"Erreur: Le fichier '{pdf_file_path}' n'existe pas.")
        sys.exit(1)
        
    main(pdf_file_path)