import os
import sys
import requests
import json
import google.generativeai as genai
from dotenv import load_dotenv

# Charger les variables d'environnement (pour la clé API)
load_dotenv()

# --- Configuration ---
FLASK_API_BASE_URL = os.getenv("API_URL", "http://localhost:5000")
API_KEY = os.getenv("GOOGLE_API_KEY")

if not API_KEY:
    raise ValueError("La variable d'environnement 'GOOGLE_API_KEY' n'est pas définie.")

genai.configure(api_key=API_KEY)

# --- Définition des Prompts pour les Agents IA ---

# Agent 1 : Analyse une seule section (rapide et économique)
SECTION_ANALYZER_PROMPT = """
Tu es un auditeur IT junior. Ton objectif est d'évaluer la conformité d'une seule section d'un rapport d'audit.

**Informations de la section :**
- Titre : {title}
- Contenu/Description : {content}
- Type d'exigence : {requirement_type}

**Critères de notation :**
- **90-100 (Conforme)**: Preuves complètes, aucune lacune.
- **50-89 (Partiellement conforme)**: Des lacunes mineures existent, des améliorations sont recommandées.
- **0-49 (Non conforme)**: Risque significatif, action corrective urgente requise.
- **"N/A" (Non applicable)**: L'exigence ne s'applique pas.

Retourne **UNIQUEMENT** un objet JSON valide avec les clés "score" (un entier ou "N/A"), "justification" (une phrase expliquant le score), et "titre" (le titre de la section).

**Exemple de réponse :**
{
  "score": 45,
  "justification": "La politique de mots de passe n'est pas appliquée de manière cohérente sur tous les serveurs.",
  "titre": "Politique de gestion des mots de passe"
}
"""

# Agent 2 : Synthétise les résultats du rapport (puissant et analytique)
REPORT_SYNTHESIZER_PROMPT = """
Tu es un auditeur IT senior et un directeur de mission. Tu as reçu les analyses de conformité de toutes les sections d'un rapport d'audit.

**Analyses des sections :**
{section_analyses}

**Ta mission :**
1.  **Calculer le score de conformité final** du rapport. Il s'agit de la moyenne des scores numériques. Ignore les "N/A" dans le calcul.
2.  **Rédiger un résumé exécutif** (2-3 phrases) qui donne une vue d'ensemble de l'état de conformité.
3.  **Identifier les 3 principaux domaines à risque** (basés sur les scores les plus bas).
4.  **Proposer des recommandations générales** pour améliorer la conformité globale.

Retourne **UNIQUEMENT** un objet JSON valide avec les clés suivantes : "score_final", "resume_executif", "domaines_a_risque" (une liste de chaînes), et "recommandations" (une liste de chaînes).
"""

def get_data_from_api(endpoint):
    """Interroge l'API Flask pour obtenir des données."""
    try:
        response = requests.get(f"{FLASK_API_BASE_URL}{endpoint}")
        response.raise_for_status()  # Lève une exception pour les codes d'erreur HTTP
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Erreur de communication avec l'API Flask à l'endpoint {endpoint}: {e}")
        return None

def analyze_single_section(section, model):
    """Utilise l'agent IA pour analyser une seule section."""
    print(f"  -> Analyse de la section : '{section['title']}'...")
    prompt = SECTION_ANALYZER_PROMPT.format(
        title=section.get('title', 'Sans titre'),
        content=section.get('content', 'Aucun contenu'),
        requirement_type=section.get('requirement_type', 'Non spécifié')
    )
    try:
        response = model.generate_content(prompt)
        # Nettoyage pour extraire le JSON pur
        cleaned_text = response.text.strip().replace('```json', '').replace('```', '').strip()
        return json.loads(cleaned_text)
    except (json.JSONDecodeError, Exception) as e:
        print(f"    !! Erreur lors de l'analyse de la section '{section['title']}': {e}")
        return {
            "score": 0,
            "justification": "Erreur lors de l'analyse par l'IA.",
            "titre": section.get('title', 'Sans titre')
        }

def main(report_id):
    """Fonction principale pour orchestrer l'analyse du rapport."""
    print(f"--- Lancement de l'analyse de conformité pour le rapport ID: {report_id} ---")

    # --- MODIFICATION CLÉ : Récupérer dynamiquement le library_id ---
    print(f"\n[Étape 1] Récupération des informations du rapport ID: {report_id}...")
    report_data = get_data_from_api(f"/api/reports/{report_id}")
    if not report_data:
        print("Impossible de récupérer les informations du rapport. Annulation.")
        return

    library_id = report_data.get('library_id')
    if not library_id:
        print("Le rapport n'est associé à aucune bibliothèque. Annulation.")
        return
    # --- FIN DE LA MODIFICATION ---

    print(f"\n[Étape 2] Récupération et analyse individuelle des sections de la bibliothèque ID: {library_id}...")
    
    sections_data = get_data_from_api(f"/api/sections?library_id={library_id}")
    if not sections_data or not sections_data.get('sections'):
        print("Aucune section trouvée pour ce rapport. Fin de l'analyse.")
        return

    sections = sections_data['sections']
    section_analyses = []
    
    section_analyzer_model = genai.GenerativeModel('gemini-1.5-flash-latest')

    for section in sections:
        analysis = analyze_single_section(section, section_analyzer_model)
        section_analyses.append(analysis)

    print(f"\n[Étape 3] Toutes les {len(section_analyses)} sections ont été analysées. Synthèse en cours...")

    report_synthesizer_model = genai.GenerativeModel('gemini-1.5-pro-latest')
    
    final_prompt = REPORT_SYNTHESIZER_PROMPT.format(
        section_analyses=json.dumps(section_analyses, indent=2, ensure_ascii=False)
    )

    try:
        final_response = report_synthesizer_model.generate_content(final_prompt)
        cleaned_final_text = final_response.text.strip().replace('```json', '').replace('```', '').strip()
        final_report = json.loads(cleaned_final_text)

        print("\n--- ✅ Analyse de Conformité du Rapport Terminée ---")
        print(json.dumps(final_report, indent=4, ensure_ascii=False))

    except (json.JSONDecodeError, Exception) as e:
        print(f"\n--- ❌ Erreur lors de la synthèse finale du rapport ---")
        print(f"Erreur: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python analyse_rapport.py <report_id>")
        sys.exit(1)
    
    try:
        report_id_to_analyze = int(sys.argv[1])
        main(report_id_to_analyze)
    except ValueError:
        print("Erreur: <report_id> doit être un nombre entier.")
        sys.exit(1)