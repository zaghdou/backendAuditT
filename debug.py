# debug_groq.py
import os
from groq import Groq
from dotenv import load_dotenv

print("--- Début du script de débogage Groq ---")

# 1. Chargement des variables d'environnement
print("[Étape 1] Tentative de chargement du fichier .env...")
try:
    load_dotenv()
    print("-> load_dotenv() exécuté.")
except Exception as e:
    print(f"!! Erreur pendant load_dotenv(): {e}")

# 2. Récupération de la clé API
print("[Étape 2] Tentative de récupération de la clé GROQ_API_KEY...")
API_KEY = os.getenv("GROQ_API_KEY")

if not API_KEY:
    print("!! ERREUR FATALE : La variable d'environnement 'GROQ_API_KEY' n'a pas été trouvée.")
    print("   Vérifiez que le fichier .env est présent et contient bien la ligne GROQ_API_KEY=gsk_...")
    sys.exit(1) # On quitte le script proprement

print(f"-> Clé API trouvée, se terminant par '...{API_KEY[-4:]}'.")

# 3. Initialisation du client Groq
print("[Étape 3] Initialisation du client Groq...")
try:
    client = Groq(api_key=API_KEY)
    print("-> Client Groq initialisé avec succès.")
except Exception as e:
    print(f"!! ERREUR FATALE lors de l'initialisation du client Groq: {e}")
    sys.exit(1)

# 4. Appel simple à l'API
print("[Étape 4] Tentative d'appel à l'API Groq avec un modèle rapide...")
try:
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "Bonjour, qui es-tu ?",
            }
        ],
        model="llama3-8b-8192", # Un modèle léger et rapide
    )
    print("\n--- ✅ SUCCÈS ! ---")
    print("La connexion à l'API Groq et l'authentification ont réussi.")
    print("Réponse de l'IA :")
    print(chat_completion.choices[0].message.content)

except Exception as e:
    print("\n--- ❌ ÉCHEC ---")
    print(f"!! Une erreur est survenue lors de l'appel à l'API Groq :")
    print(f"   Type d'erreur: {type(e).__name__}")
    print(f"   Message: {e}")
    print("\nCela confirme un problème de connexion (pare-feu, antivirus) ou de clé API.")