# seed_database.py
import requests
import json

BASE_URL = "http://127.0.0.1:5000/api"

def create_resource(endpoint, data):
    """Fonction générique pour créer une ressource via l'API."""
    try:
        response = requests.post(f"{BASE_URL}{endpoint}", json=data)
        response.raise_for_status()
        print(f"-> Succès : Création de la ressource à '{endpoint}'. ID: {response.json().get('id')}")
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"!! Erreur lors de la création à '{endpoint}': {e}")
        print(f"   Réponse du serveur: {e.response.text if e.response else 'N/A'}")
        return None

def main():
    print("--- Lancement du script de création des données de test ---")

    # 1. Créer un Client
    client_data = {"company_name": "SecureBank Inc.", "status": "active", "secteur_d_activite": "Finance"}
    client = create_resource("/clients", client_data)
    if not client: return

    # 2. Créer une Mission
    mission_data = {"mission_name": "Audit de Sécurité Annuel 2025", "client_id": client['id'], "client_name": client['company_name'], "status": "active"}
    mission = create_resource("/missions", mission_data)
    if not mission: return

    # 3. Créer une Bibliothèque de contrôles
    library_data = {"name": "Contrôles de Sécurité ISO 27001", "type": "securite"}
    library = create_resource("/libraries", library_data)
    if not library: return

    # 4. Créer des Sections dans la bibliothèque (avec du contenu varié)
    sections_to_create = [
        {"title": "Politique de Mots de Passe", "content": "La politique actuelle exige 8 caractères, mais pas de caractères spéciaux. La rotation est annuelle.", "type": "texte", "requirement_type": "critique"},
        {"title": "Gestion des Accès", "content": "Les accès sont créés sur demande validée par le manager. Une revue trimestrielle des comptes est effectuée et documentée.", "type": "texte", "requirement_type": "majeur"},
        {"title": "Sauvegardes des Serveurs", "content": "Les sauvegardes sont effectuées chaque nuit, mais les tests de restauration ne sont pas formalisés et ont été faits pour la dernière fois il y a 18 mois.", "type": "texte", "requirement_type": "critique"},
        {"title": "Journalisation et Surveillance", "content": "Les logs de connexion sont activés sur tous les systèmes critiques et centralisés. Des alertes automatiques sont en place pour les tentatives d'accès échouées.", "type": "texte", "requirement_type": "majeur"},
        {"title": "Sécurité Physique des Datacenters", "content": "Non applicable, l'infrastructure est entièrement hébergée sur un cloud public (AWS).", "type": "texte", "requirement_type": "mineur"}
    ]
    
    # Note: L'API /api/sections attend du 'multipart/form-data'. Pour simplifier, nous allons la modifier pour accepter du JSON.
    # Modifiez la route create_section dans app.py : enlevez la vérification 'multipart/form-data' et utilisez request.get_json()
    # Si vous ne voulez pas modifier l'API, ce script de seeding doit être adapté pour envoyer du multipart.
    # Pour cet exemple, nous supposons que vous avez adapté l'API pour accepter du JSON pour la création de section sans fichier.
    
    print("\nCréation des sections...")
    for section_payload in sections_to_create:
        section_payload['library_id'] = library['id']
        # L'API /sections attend du multipart/form-data, ce qui complique ce script.
        # Pour un test simple, vous pouvez créer les sections manuellement via Postman
        # ou modifier temporairement l'API pour accepter du JSON.
        # Ici, nous simulons la création.
        print(f"-> Section '{section_payload['title']}' à créer pour la bibliothèque {library['id']}.")
    
    print("\n!! ACTION MANUELLE REQUISE !!")
    print("L'API de création de section attend du 'multipart/form-data' à cause des fichiers.")
    print("Veuillez utiliser Postman ou un outil similaire pour créer les 5 sections ci-dessus dans la bibliothèque avec l'ID:", library['id'])
    input("Appuyez sur Entrée lorsque vous avez créé manuellement les sections pour continuer...")


    # 5. Créer un Rapport lié à la mission et à la bibliothèque
    report_data = {
        "audit_subject": "Revue de la Conformité Générale",
        "mission_id": mission['id'],
        "library_id": library['id'], # Lien crucial
        "status": "encours",
        "type": "securite"
    }
    report = create_resource("/reports", report_data)
    if not report: return

    print("\n--- ✅ Données de test créées avec succès ! ---")
    print(f"Vous pouvez maintenant analyser le rapport avec l'ID : {report['id']}")

if __name__ == "__main__":
    main()