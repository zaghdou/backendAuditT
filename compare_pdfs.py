import os
import sys
import json
from groq import Groq
from dotenv import load_dotenv
import fitz  # PyMuPDF

# --- Étape 1: Configuration et Initialisation ---
try:
    load_dotenv()
    print("Fichier .env chargé.")
    API_KEY = os.getenv("GROQ_API_KEY")
    if not API_KEY:
        raise ValueError("ERREUR FATALE : La variable d'environnement 'GROQ_API_KEY' n'est pas définie.")
    client = Groq(api_key=API_KEY)
    print(f"Client Groq initialisé avec la clé se terminant par '...{API_KEY[-4:]}'.")
except Exception as e:
    print(f"ERREUR FATALE lors de l'initialisation : {e}")
    sys.exit(1)

# --- Étape 2: Définition des Prompts pour les Agents IA ---

# Agent 1 : Analyse la structure et le formatage d'un rapport d'audit
DOCUMENT_ANALYZER_PROMPT = """
Tu es un expert en analyse de documents d'audit avec une grande attention aux détails. Ta mission est de lire le texte brut d'un rapport et d'en extraire les caractéristiques structurelles et de formatage clés.

Basé sur le texte suivant, identifie :
1.  **library_type**: Trouve des mots-clés comme "SOC 2", "ISAE 3402", ou "SOC 1". Retourne "soc2" ou "isae3402/soc1". Si aucun n'est trouvé, retourne "unknown".
2.  **report_type**: Trouve des mots-clés comme "Type 2" ou "Type 1". Retourne "type 1" ou "type 2". Si aucun n'est trouvé, retourne "unknown".
3.  **sections**: Liste les titres des sections principales du document (ex: "Section I: Report of Independent Service Auditor", "Section II: Management of Teads's Statement", etc.).
4.  **has_aicpa_disclaimer**: Vérifie si une phrase similaire à "System and Organization Control, SOC 2® refers to a deposed branding from the American Institute of Certified Public Accountants (AICPA)" est présente. Retourne `true` ou `false`.
5.  **has_confidentiality_notice**: Vérifie si une phrase de confidentialité similaire à "This document is for the exclusive and confidential use..." est présente, souvent en pied de page. Retourne `true` ou `false`.

**Texte à analyser :**
{pdf_text}

Retourne **UNIQUEMENT** un objet JSON valide avec les clés "library_type", "report_type", "sections", "has_aicpa_disclaimer", et "has_confidentiality_notice".

**Exemple de réponse :**
{{
  "library_type": "soc2",
  "report_type": "type 2",
  "sections": [
    "Section I: ",
    "Section II: ",
    "Section III: ",
    "Section IV: "
  ],
  "has_aicpa_disclaimer": true,
  "has_confidentiality_notice": true
}}
"""
# Agent 2 (NOUVEAU) : Le LLM Juge qui compare et note
LLM_JUDGE_PROMPT = """
Tu es un auditeur senior et un expert en conformité, agissant en tant que juge impartial. Ta mission est de comparer un "rapport candidat" à un "rapport de référence" sur la base de leurs caractéristiques structurelles extraites.

Voici les données extraites :
- **Référence :** {reference_data}
- **Candidat :** {candidate_data}

Applique les règles de notation suivantes pour déterminer un score de conformité sur 100 :
1.  **Conformité du Type de Bibliothèque (Poids : 20 points)** : Si `library_type` est identique, accorde 20 points. Sinon, 0.
2.  **Conformité du Type de Rapport (Poids : 20 points)** : Si `report_type` est identique, accorde 20 points. Sinon, 0.
3.  **Conformité des Sections (Poids : 40 points)** : Compare la liste des sections. Pour chaque section de la référence qui est présente (même de manière approximative) dans le candidat, accorde 10 points (jusqu'à un maximum de 40).
4.  **Conformité de la Mise en Page (Poids : 20 points)** :
    - Si la clause AICPA (`has_aicpa_disclaimer`) est requise par la référence et présente dans le candidat, accorde 10 points.
    - Si l'avis de confidentialité (`has_confidentiality_notice`) est requis par la référence et présent dans le candidat, accorde 10 points.

Après avoir calculé le score, fournis ton analyse.

Retourne **UNIQUEMENT** un objet JSON valide avec les clés suivantes :
- **final_score**: Ton score calculé (un nombre entier entre 0 et 100).
- **positive_points**: Une liste de chaînes de caractères décrivant les points conformes.
- **issues_found**: Une liste de chaînes de caractères décrivant les points non conformes ou manquants.

**Exemple de réponse :**
{{
  "final_score": 85,
  "positive_points": [
    "Le type de bibliothèque 'soc2' est conforme.",
    "Le type de rapport 'type 2' est conforme.",
    "La clause de non-responsabilité de l'AICPA est présente comme attendu."
  ],
  "issues_found": [
    "Section obligatoire manquante : 'Section IV: Tests of Operating Effectiveness and Results of Tests'.",
    "Avis de confidentialité attendu mais manquant."
  ]
}}
"""

# Agent 3 : Rédige le rapport de comparaison final
COMPARISON_REPORTER_PROMPT = """
Tu es un consultant en conformité. Tu as reçu les résultats d'une comparaison entre un rapport d'audit et un template de référence.

**Données de la comparaison :**
- Score de conformité final : {final_score}/100
- Points de conformité (ce qui est correct) : {positive_points}
- Points de non-conformité (ce qui est incorrect ou manquant) : {issues_found}

**Ta mission :**
Rédige un rapport de synthèse clair et concis.
1.  **summary**: Un résumé exécutif de 2-3 phrases sur le niveau de conformité global du rapport.
2.  **positive_points**: Reformule les points de conformité sous forme de liste.
3.  **areas_for_improvement**: Reformule les points de non-conformité en tant que "domaines d'amélioration".

Retourne **UNIQUEMENT** un objet JSON valide avec les clés "summary", "positive_points", et "areas_for_improvement".
"""

# --- Étape 3: Fonctions Utilitaires ---

def call_groq_model(prompt, model_name):
    """Appelle un modèle Groq et retourne la réponse JSON."""
    try:
        chat_completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            response_format={"type": "json_object"},
        )
        return json.loads(chat_completion.choices[0].message.content)
    except Exception as e:
        print(f"    !! Erreur lors de l'appel à l'API Groq : {e}")
        return {"error": f"API call failed: {e}"}

def analyze_pdf_structure(pdf_path, model):
    """Extrait le texte d'un PDF et utilise l'IA pour en analyser la structure."""
    print(f"-> Analyse de la structure de : {os.path.basename(pdf_path)}...")
    try:
        doc = fitz.open(pdf_path)
        full_text = "".join(page.get_text() for page in doc)
        doc.close()
        if not full_text.strip():
            return {"error": "Le document PDF est vide ou ne contient pas de texte."}
    except Exception as e:
        return {"error": f"Impossible de lire le fichier PDF. Erreur: {e}"}
    
    analysis_prompt = DOCUMENT_ANALYZER_PROMPT.format(pdf_text=full_text[:20000]) # On limite à ~20k tokens pour la sécurité
    return call_groq_model(analysis_prompt, model)

def llm_as_a_judge(reference_data, candidate_data, model):
    """Utilise un LLM pour comparer les deux structures et retourner un score et une analyse."""
    print("\n[Phase 2] Soumission des données au LLM Juge pour comparaison et scoring...")
    
    judge_prompt = LLM_JUDGE_PROMPT.format(
        reference_data=json.dumps(reference_data),
        candidate_data=json.dumps(candidate_data)
    )
    
    result = call_groq_model(judge_prompt, model)
    
    if 'error' in result:
        print("!! Le LLM Juge a échoué. Impossible de calculer le score.")
        return 0, {"positive": [], "issues": ["L'analyse comparative par l'IA a échoué."]}

    # On s'assure que le format de la réponse est correct
    final_score = result.get("final_score", 0)
    findings = {
        "positive": result.get("positive_points", []),
        "issues": result.get("issues_found", [])
    }
    
    print(f"-> Le LLM Juge a retourné un score de : {final_score}/100")
    return final_score, findings


# --- Étape 4: Fonction Principale (main) ---

def main(reference_pdf_path, candidate_pdf_path):
    """Orchestre la comparaison de deux rapports PDF."""
    print("\n--- Lancement de la comparaison de conformité de rapports PDF ---")
    powerful_model = "llama-3.3-70b-versatile"

    # --- Phase 1: Analyse des deux PDF ---
    print("\n[Phase 1] Analyse des documents de référence et candidat...")
    reference_structure = analyze_pdf_structure(reference_pdf_path, powerful_model)
    if 'error' in reference_structure:
        print(f"!! ERREUR FATALE sur le PDF de référence : {reference_structure['error']}")
        return

    candidate_structure = analyze_pdf_structure(candidate_pdf_path, powerful_model)
    if 'error' in candidate_structure:
        print(f"!! ERREUR FATALE sur le PDF candidat : {candidate_structure['error']}")
        return

    print("-> Analyse structurelle des deux documents terminée.")
    
    # --- Phase 2: Comparaison et Scoring ---
    final_score, findings = llm_as_a_judge(reference_structure, candidate_structure, powerful_model)
    # --- Phase 3: Rapport Final par l'IA ---
    print("\n[Phase 3] Génération du rapport de synthèse par l'IA...")
    reporter_prompt = COMPARISON_REPORTER_PROMPT.format(
        final_score=final_score,
        positive_points=json.dumps(findings["positive"]),
        issues_found=json.dumps(findings["issues"])
    )
    final_report = call_groq_model(reporter_prompt, powerful_model)

    if 'error' in final_report:
        print("!! Échec de la génération du rapport de synthèse. Affichage des résultats bruts.")
        print(json.dumps({"score": final_score, "details": findings}, indent=4))
        return

    # On ajoute le score au rapport final pour être complet
    final_report['final_score'] = final_score

    print("\n\n--- ✅ COMPARAISON DE CONFORMITÉ TERMINÉE ---")
    print(json.dumps(final_report, indent=4, ensure_ascii=False))


# --- Étape 5: Point d'Entrée du Script ---
if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("\nUsage: python compare_pdfs.py \"/chemin/vers/reference.pdf\" \"/chemin/vers/candidat.pdf\"")
        sys.exit(1)
    
    ref_path = sys.argv[1]
    cand_path = sys.argv[2]

    if not os.path.exists(ref_path):
        print(f"Erreur: Le fichier de référence '{ref_path}' n'existe pas.")
        sys.exit(1)
    if not os.path.exists(cand_path):
        print(f"Erreur: Le fichier candidat '{cand_path}' n'existe pas.")
        sys.exit(1)
        
    main(ref_path, cand_path)