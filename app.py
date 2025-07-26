import os
from dotenv import load_dotenv, find_dotenv
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import func
from database import db
from models import Client, Mission, Report, TeamMember, User, Library, Section, MissionStatus, Role, Form, Type, RequirementType, ReportStatus
import logging
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from contextlib import contextmanager
from io import StringIO, BytesIO
import csv
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
import json
from groq import Groq
import fitz
import tempfile
from compare_pdfs import main as analyze_pdfs_main
from functools import wraps

# --- NOUVELLES IMPORTATIONS POUR L'AUTHENTIFICATION ET LES RÔLES ---
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt, verify_jwt_in_request

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URI', 'mysql+pymysql://root:root@localhost/auditit_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['DEBUG'] = os.getenv('FLASK_DEBUG', 'False') == 'True'
app.config['UPLOAD_FOLDER'] = os.getenv('UPLOAD_FOLDER', os.path.join(os.path.abspath(os.path.dirname(__file__)), 'Uploads'))
app.config['ALLOWED_EXTENSIONS'] = {'pdf', 'doc', 'docx'}
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# --- CONFIGURATION DE JWT (JSON Web Token) ---
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'votre-cle-secrete-tres-complexe-a-changer')
jwt = JWTManager(app)

CORS(app, resources={r"/api/*": {"origins": os.getenv('CORS_ORIGIN', 'http://localhost:3000')}})

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Logging setup
logging.basicConfig(filename='error.log', level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
app.logger.setLevel(logging.DEBUG)
handler = logging.FileHandler('error.log')
app.logger.addHandler(handler)

# Initialize database
db.init_app(app)

# --- DÉCORATEUR POUR LA GESTION DES RÔLES (RBAC) ---
def roles_required(*required_roles):
    """
    Décorateur pour vérifier que l'utilisateur a l'un des rôles requis.
    L'ADMIN_SUPERIOR a accès à tout, peu importe les rôles spécifiés.
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            user_role_str = claims.get("role")

            if not user_role_str:
                return jsonify({"error": "Le rôle de l'utilisateur est manquant dans le jeton"}), 403

            # L'admin a un accès universel
            if user_role_str == Role.ADMIN_SUPERIOR.value:
                return fn(*args, **kwargs)

            # Convertir les rôles requis (enums) en chaînes de caractères pour la comparaison
            required_roles_str = [role.value for role in required_roles]

            if user_role_str not in required_roles_str:
                app.logger.warning(f"Accès refusé pour le rôle '{user_role_str}'. Rôles requis : {required_roles_str}")
                return jsonify({"error": "Accès interdit : permissions insuffisantes"}), 403
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator

# --- ROLES GROUPÉS POUR SIMPLIFIER LA GESTION ---
# Rôles ayant des permissions de gestion étendues
MANAGER_ROLES = (Role.MANAGER, Role.TEAM_MANAGER, Role.ENGAGEMENT_LEADER, Role.FILOWNER)
# Rôles ayant au minimum un accès en lecture
READ_ACCESS_ROLES = (*MANAGER_ROLES, Role.READ_ONLY, Role.REVIEWER, Role.TEAM_MEMBER, Role.LIBRARY_MANAGER)


GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    app.logger.warning("La variable d'environnement 'GROQ_API_KEY' n'est pas définie. L'analyse par IA ne fonctionnera pas.")
    groq_client = None
else:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        app.logger.info("Client Groq initialisé avec la clé se terminant par '...{}'.".format(GROQ_API_KEY[-4:]))
    except Exception as e:
        groq_client = None
        app.logger.error(f"Échec de l'initialisation du client Groq : {e}")

# ... (Vos prompts Groq restent inchangés) ...
PDF_CONTROL_EXTRACTOR_PROMPT = """
Tu es un assistant d'audit spécialisé dans la lecture de rapports SOC 2. Ta mission est de lire le texte brut extrait d'un rapport d'audit et d'extraire CHAQUE point de contrôle individuel listé. Pour chaque contrôle, tu dois extraire :
1. L'identifiant du contrôle (ex: "CC1.1.1", "CC1.1.2").
2. La description de l'activité de contrôle (Control Activity).
3. Le résultat du test (Test Results).
Si aucun contrôle n'est trouvé dans le texte fourni, retourne un objet JSON avec une liste "controls" vide.
**Texte à analyser :**
{text_chunk}
Retourne **UNIQUEMENT** un objet JSON valide contenant une seule clé "controls". La valeur doit être une liste d'objets.
"""

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

REPORT_SYNTHESIZER_PROMPT_FRONTEND = """
Tu es un directeur d'audit. Tu as reçu les scores de conformité pour tous les contrôles d'un rapport.
**Analyses des contrôles :**
{control_analyses}
**Ta mission :**
1.  **Calculer le score final de conformité** (moyenne de tous les scores, arrondi à l'entier).
2.  **Rédiger un résumé exécutif** (2-3 phrases) qui reflète le score. Si le score est élevé (ex: >95), indique que les contrôles sont globalement efficaces.
3.  **Identifier les points positifs** (les contrôles avec un score de 100). Liste les 3 plus pertinents. S'il n'y en a pas, retourne une liste vide.
4.  **Identifier les axes d'amélioration** (les contrôles avec un score < 100). Liste les 3 plus critiques. S'il n'y a pas de risque (tous les scores sont à 100), retourne une liste vide.

Retourne **UNIQUEMENT** un objet JSON valide avec les clés : "final_score" (nombre), "summary" (chaîne), "positive_points" (liste de chaînes), et "areas_for_improvement" (liste de chaînes).
"""

def call_groq_model(prompt, model_name):
    """Fonction générique pour appeler un modèle Groq et parser la réponse JSON."""
    if not groq_client:
        raise Exception("Le client Groq n'est pas initialisé.")
    try:
        chat_completion = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            response_format={"type": "json_object"},
        )
        response_content = chat_completion.choices[0].message.content
        return json.loads(response_content)
    except Exception as e:
        app.logger.error(f"Erreur lors de l'appel à l'API Groq : {type(e).__name__} - {e}")
        raise e

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.cli.command("init-db")
def init_db_command():
    """Crée les tables de la base de données et l'utilisateur admin."""
    try:
        db.create_all()
        admin_user = db.session.query(User).filter_by(email='admin@pwc.com').first()
        if not admin_user:
            admin_user = User(
                username='admin@pwc.com',
                password=generate_password_hash('admin'),
                fullname='Admin User',
                email='admin@pwc.com',
                role=Role.ADMIN_SUPERIOR
            )
            db.session.add(admin_user)
            db.session.commit()
            print("Utilisateur admin créé.")
        else:
            print("Utilisateur admin existe déjà.")
        print("Base de données initialisée.")
    except Exception as e:
        print(f"Erreur lors de l'initialisation de la base de données : {e}")

#init_db()

# ... (vos fonctions utilitaires restent inchangées) ...
@contextmanager
def transaction():
    try:
        yield
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

# ... (vos fonctions de validation et de mise à jour restent inchangées) ...
def validate_string(value, field_name, max_length):
    if not isinstance(value, str):
        raise ValueError(f"Invalid {field_name}: must be a string")
    if len(value) > max_length:
        raise ValueError(f"Invalid {field_name}: must be {max_length} characters or less")
    return value

def validate_enum(value, enum_class, field_name):
    if not value:
        return None
    if not isinstance(value, str):
        raise ValueError(f"Invalid {field_name}: must be a string")
    try:
        return enum_class(value)
    except ValueError:
        raise ValueError(f"Invalid {field_name}: {value}. Must be one of {[e.value for e in enum_class]}")

def validate_report_type(value):
    if not isinstance(value, str):
        raise ValueError("Invalid type: must be a string")
    try:
        return Type(value)
    except ValueError:
        raise ValueError(f"Invalid type: {value}. Must be one of {[e.value for e in Type]}")

def validate_numeric(value, field_name, min_value=0, is_integer=False):
    try:
        val = int(value) if is_integer else float(value)
        if val < min_value:
            raise ValueError(f"Invalid {field_name}: must be >= {min_value}")
        return val
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {field_name}: must be a number")

def validate_date(value, field_name):
    if not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {field_name}: must be in YYYY-MM-DD format")

def update_library_section_count(library_id):
    try:
        library = db.session.get(Library, library_id)
        if library:
            library.number_of_section = len(library.sections)
            db.session.commit()
            app.logger.info(f"Updated section count for library {library_id}: {library.number_of_section}")
    except Exception as e:
        app.logger.error(f"Error updating section count for library {library_id}: {str(e)}")
        db.session.rollback()

def update_mission_report_count(mission_id):
    try:
        mission = db.session.get(Mission, mission_id)
        if mission:
            mission.number_of_report = len(mission.reports)
            db.session.commit()
            app.logger.info(f"Updated report count for mission {mission_id}: {mission.number_of_report}")
    except Exception as e:
        app.logger.error(f"Error updating report count for mission {mission_id}: {str(e)}")
        db.session.rollback()

def update_client_counts(client_id):
    try:
        client = db.session.get(Client, client_id)
        if client:
            client.number_of_active_project = len([m for m in client.missions if m.status == MissionStatus.ACTIVE])
            client.number_of_active_user = len(set(tm.user_id for m in client.missions for tm in m.team_members))
            db.session.commit()
            app.logger.info(f"Updated counts for client {client_id}: projects={client.number_of_active_project}, users={client.number_of_active_user}")
    except Exception as e:
        app.logger.error(f"Error updating counts for client {client_id}: {str(e)}")
        db.session.rollback()

# --- NOUVEL ENDPOINT DE CONNEXION (LOGIN) ---
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Aucune donnée fournie"}), 400

    email = data.get('email', None)
    password = data.get('password', None)

    if not email or not password:
        return jsonify({"error": "Email et mot de passe requis"}), 400

    user = db.session.query(User).filter_by(email=email).first()

    if user and check_password_hash(user.password, password):
        # Créer le jeton avec l'ID de l'utilisateur et son rôle
        additional_claims = {"role": user.role.value, "fullname": user.fullname}
        access_token = create_access_token(identity=user.id, additional_claims=additional_claims)
        app.logger.info(f"Connexion réussie pour l'utilisateur : {email} (Rôle: {user.role.value})")
        return jsonify(access_token=access_token, role=user.role.value, fullname=user.fullname), 200
    
    app.logger.warning(f"Tentative de connexion échouée pour : {email}")
    return jsonify({"error": "Identifiants invalides"}), 401

# --- ENDPOINTS PUBLICS OU PROTÉGÉS ---
@app.route('/', methods=['GET'])
def home():
    return jsonify({"message": "Flask server is running", "version": "1.0.0"}), 200

@app.route('/api/health', methods=['GET'])
def health_check():
    # ... (code inchangé)
    try:
        db.session.execute('SELECT 1')
        app.logger.info("Database connection successful")
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error during health check: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/debug/routes', methods=['GET'])
@jwt_required()
@roles_required(Role.ADMIN_SUPERIOR) # Seul l'admin peut voir les routes
def debug_routes():
    # ... (code inchangé)
    app.logger.info("Debug routes endpoint accessed")
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            "endpoint": rule.endpoint,
            "methods": list(rule.methods),
            "path": str(rule)
        })
    return jsonify({"routes": routes}), 200

@app.route('/api/roles', methods=['GET'])
@jwt_required() # Nécessite d'être connecté pour voir les rôles
def get_roles():
    # ... (code inchangé)
    try:
        app.logger.info("Fetching roles")
        roles = [role.value for role in Role]
        return jsonify({"roles": roles}), 200
    except Exception as e:
        app.logger.error(f"Unexpected error fetching roles: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/uploads/<filename>', methods=['GET'])
@jwt_required() # Protégé, la logique interne vérifiera les droits
def download_file(filename):
    # La logique de cet endpoint est complexe car elle dépend de l'objet (rapport/section)
    # auquel le fichier est lié. Nous gardons @jwt_required() et laissons la logique
    # existante qui vérifie l'association, ce qui est une forme de contrôle d'accès.
    # Un auditeur ne pourra pas deviner le nom d'un fichier d'une mission non autorisée.
    # ... (code inchangé)
    try:
        filename = secure_filename(filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(file_path):
            app.logger.error(f"File not found: {filename}")
            return jsonify({"error": f"File not found: {filename}"}), 404
        
        section = db.session.query(Section).filter_by(file_path=filename).first()
        report = db.session.query(Report).filter_by(file_path=filename).first()

        if not section and not report:
            app.logger.error(f"File {filename} is not associated with any section or report")
            return jsonify({"error": f"File {filename} is not associated with any resource"}), 403

        view_inline = request.args.get('view', 'false').lower() == 'true'
        as_attachment = not view_inline
        
        if filename.endswith('.pdf'):
            mime_type = 'application/pdf'
        elif filename.endswith('.doc'):
            mime_type = 'application/msword'
        elif filename.endswith('.docx'):
            mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        else:
            mime_type = 'application/octet-stream'

        app.logger.info(f"{'Viewing' if view_inline else 'Downloading'} file: {filename}")
        
        return send_from_directory(
            app.config['UPLOAD_FOLDER'],
            filename,
            as_attachment=as_attachment,
            mimetype=mime_type
        )
    except Exception as e:
        app.logger.error(f"Error downloading file {filename}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# --- APIs PROTÉGÉES PAR RÔLE ---

# Client APIs
@app.route('/api/clients', methods=['POST'])
@jwt_required()
@roles_required(*MANAGER_ROLES)
def create_client():
    # ... (code inchangé)
    data = request.get_json()
    if not data:
        app.logger.error("No data provided for client creation")
        return jsonify({"error": "No data provided"}), 400
    app.logger.debug(f"Received client creation request: {data}")
    try:
        with transaction():
            required_fields = ['company_name', 'status']
            for field in required_fields:
                if field not in data or not data[field]:
                    app.logger.error(f"Missing required field: {field}")
                    return jsonify({"error": f"Missing required field: {field}"}), 400
            company_name = validate_string(data['company_name'], "company_name", 255)
            status = validate_string(data['status'], "status", 50)
            secteur_d_activite = validate_string(data.get('secteur_d_activite', ''), "secteur_d_activite", 100) if data.get('secteur_d_activite') else None
            
            new_client = Client(
                company_name=company_name,
                secteur_d_activite=secteur_d_activite,
                status=status,
                number_of_active_user=0,
                number_of_active_project=0
            )
            db.session.add(new_client)
            db.session.flush()
            app.logger.info(f"Client created: ID {new_client.id}")
            
            total_price = new_client.total_mission_price or 0.0

            return jsonify({
                "id": new_client.id,
                "company_name": new_client.company_name,
                "secteur_d_activite": new_client.secteur_d_activite,
                "number_of_active_user": new_client.number_of_active_user,
                "number_of_active_project": new_client.number_of_active_project,
                "status": new_client.status,
                "total_mission_price": total_price
            }), 201
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error creating client: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error creating client: company_name {data.get('company_name')}", exc_info=True)
        return jsonify({"error": "Failed to create client: company_name may already exist"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error creating client: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients', methods=['GET'])
@jwt_required()
@roles_required(*READ_ACCESS_ROLES)
def get_clients():
    # ... (code inchangé)
    try:
        app.logger.info("Fetching clients")
        search = request.args.get('search')
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        query = db.session.query(Client)
        if search:
            query = query.filter(Client.company_name.ilike(f"%{search}%"))
        clients = query.offset((page - 1) * per_page).limit(per_page).all()
        total = query.count()
        app.logger.info(f"Fetched {total} clients, page {page}, per_page {per_page}")
        return jsonify({
            "clients": [{
                "id": client.id,
                "company_name": client.company_name,
                "secteur_d_activite": client.secteur_d_activite,
                "number_of_active_user": client.number_of_active_user,
                "number_of_active_project": client.number_of_active_project,
                "status": client.status,
                "total_mission_price": client.total_mission_price or 0.0
            } for client in clients],
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200
    except ValueError:
        app.logger.error("Invalid pagination parameters", exc_info=True)
        return jsonify({"error": "Invalid pagination parameters"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching clients: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients/<int:client_id>', methods=['GET'])
@jwt_required()
@roles_required(*READ_ACCESS_ROLES)
def get_client(client_id):
    # ... (code inchangé)
    try:
        app.logger.info(f"Fetching client: ID {client_id}")
        client = db.session.get(Client, client_id)
        if not client:
            app.logger.error(f"Client not found: {client_id}")
            return jsonify({"error": f"Client not found: {client_id}"}), 404
        return jsonify({
            "id": client.id,
            "company_name": client.company_name,
            "secteur_d_activite": client.secteur_d_activite,
            "number_of_active_user": client.number_of_active_user,
            "number_of_active_project": client.number_of_active_project,
            "status": client.status,
            "total_mission_price": client.total_mission_price or 0.0
        }), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching client {client_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients/<int:client_id>', methods=['PUT'])
@jwt_required()
@roles_required(*MANAGER_ROLES)
def update_client(client_id):
    # ... (code inchangé)
    try:
        with transaction():
            app.logger.info(f"Updating client: ID {client_id}")
            client = db.session.get(Client, client_id)
            if not client:
                app.logger.error(f"Client not found: {client_id}")
                return jsonify({"error": f"Client not found: {client_id}"}), 404
            data = request.get_json()
            if not data:
                app.logger.error("No data provided for client update")
                return jsonify({"error": "No data provided"}), 400
            client.company_name = validate_string(data.get('company_name', client.company_name), "company_name", 255)
            client.secteur_d_activite = validate_string(data.get('secteur_d_activite', client.secteur_d_activite), "secteur_d_activite", 100) if data.get('secteur_d_activite') else client.secteur_d_activite
            client.status = validate_string(data.get('status', client.status), "status", 50)
            update_client_counts(client_id)
            app.logger.info(f"Client updated: ID {client_id}")
            return jsonify({
                "id": client.id,
                "company_name": client.company_name,
                "secteur_d_activite": client.secteur_d_activite,
                "number_of_active_user": client.number_of_active_user,
                "number_of_active_project": client.number_of_active_project,
                "status": client.status,
                "total_mission_price": client.total_mission_price or 0.0
            }), 200
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error updating client {client_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error updating client {client_id}: company_name {data.get('company_name')}", exc_info=True)
        return jsonify({"error": "Failed to update client: company_name may already exist"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error updating client {client_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
@jwt_required()
@roles_required(*MANAGER_ROLES)
def delete_client(client_id):
    # ... (code inchangé)
    try:
        with transaction():
            app.logger.info(f"Deleting client: ID {client_id}")
            client = db.session.get(Client, client_id)
            if not client:
                app.logger.error(f"Client not found: {client_id}")
                return jsonify({"error": f"Client not found: {client_id}"}), 404
            db.session.delete(client)
            app.logger.info(f"Client deleted: ID {client_id}")
            return jsonify({"message": f"Client {client_id} deleted successfully"}), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error deleting client {client_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/clients/export', methods=['GET'])
@jwt_required()
@roles_required(*MANAGER_ROLES, Role.READ_ONLY)
def export_clients():
    # ... (code inchangé)
    try:
        client_id = request.args.get('client_id', type=int)
        app.logger.info(f"Exporting clients as CSV{' for client_id ' + str(client_id) if client_id else ''}")
        if client_id:
            client = db.session.query(Client).filter_by(id=client_id).first()
            if not client:
                app.logger.error(f"Client {client_id} not found for export")
                return jsonify({"error": f"Client {client_id} not found"}), 404
            clients = [client]
        else:
            clients = db.session.query(Client).all()
            if not clients:
                app.logger.error("No clients found for export")
                return jsonify({"error": "No clients found"}), 404
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['ID', 'Company Name', 'Total Mission Price', 'Activity Sector', 'Status'])
        for client in clients:
            writer.writerow([
                client.id,
                client.company_name,
                f"{(client.total_mission_price or 0.0):.2f}",
                client.secteur_d_activite or '-',
                client.status
            ])
        output.seek(0)
        app.logger.info("Clients CSV generated successfully")
        filename = f"client_{client_id}.csv" if client_id else "clients.csv"
        return send_file(
            StringIO(output.getvalue()),
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        app.logger.error(f"Unexpected error exporting clients: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# --- MISSION APIs ---
@app.route('/api/missions', methods=['POST'])
@jwt_required()
@roles_required(*MANAGER_ROLES)
def create_mission():
    # ... (code inchangé)
    data = request.get_json()
    if not data or not data.get('mission_name') or not data.get('client_id'):
        return jsonify({"error": "Missing required fields"}), 400
    try:
        with transaction():
            mission = Mission(**data)
            db.session.add(mission)
            db.session.flush()
            update_client_counts(mission.client_id)
            return jsonify({"id": mission.id, "mission_name": mission.mission_name}), 201
    except Exception as e:
        app.logger.error(f"Error creating mission: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/missions', methods=['GET'])
@jwt_required()
@roles_required(*READ_ACCESS_ROLES)
def get_missions():
    # --- MODIFIÉ POUR LA GESTION DES RÔLES ---
    try:
        user_id = get_jwt_identity()
        user_role = get_jwt()['role']
        
        app.logger.info(f"Fetching missions for user {user_id} with role {user_role}")
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search')
        client_id = request.args.get('client_id')

        query = db.session.query(Mission).options(
            joinedload(Mission.reports).joinedload(Report.library),
            joinedload(Mission.team_members)
        )

        # Si l'utilisateur est un auditeur (Team Member), filtrer par ses missions
        if user_role == Role.TEAM_MEMBER.value:
            query = query.join(TeamMember).filter(TeamMember.user_id == user_id)
            app.logger.info(f"Filtering missions for TEAM_MEMBER {user_id}")

        if client_id:
            try:
                query = query.filter(Mission.client_id == int(client_id))
            except ValueError:
                return jsonify({"error": "Invalid client_id parameter"}), 400
        
        if search:
            query = query.filter(Mission.mission_name.ilike(f"%{search}%"))

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        missions = pagination.items
        total = pagination.total

        missions_data = []
        for mission in missions:
            latest_report = sorted(mission.reports, key=lambda r: r.id, reverse=True)[0] if mission.reports else None
            missions_data.append({
                "id": mission.id,
                "mission_name": mission.mission_name,
                "fiscal_year": mission.fiscal_year,
                "client_name": mission.client_name,
                "status": mission.status.value,
                "client_id": mission.client_id,
                "number_of_report": mission.number_of_report,
                "price": mission.price,
                "sujet_audit": latest_report.audit_subject if latest_report else 'N/A',
                "library_name": latest_report.library.name if latest_report and latest_report.library else 'N/A',
                "team_member_count": len(mission.team_members),
                "team_members": [{"user_name": tm.user_name, "role": tm.role.value} for tm in mission.team_members]
            })
        
        app.logger.info(f"Fetched {total} missions, page {page}, per_page {per_page}")
        return jsonify({
            "missions": missions_data,
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200
    except ValueError as ve:
        app.logger.error(f"Invalid parameters: {str(ve)}", exc_info=True)
        return jsonify({"error": "Invalid parameters"}), 400
    except Exception as e:
        app.logger.error(f"Unexpected error fetching missions: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/missions/<int:mission_id>', methods=['GET'])
@jwt_required()
@roles_required(*READ_ACCESS_ROLES)
def get_mission(mission_id):
    # --- MODIFIÉ POUR LA GESTION DES RÔLES ---
    try:
        user_id = get_jwt_identity()
        user_role = get_jwt()['role']
        
        app.logger.info(f"Fetching mission {mission_id} for user {user_id} with role {user_role}")
        
        mission = db.session.get(Mission, mission_id)
        if not mission:
            return jsonify({"error": f"Mission not found: {mission_id}"}), 404

        # Si c'est un auditeur, vérifier qu'il est bien membre de cette mission
        if user_role == Role.TEAM_MEMBER.value:
            is_member = db.session.query(TeamMember).filter_by(mission_id=mission_id, user_id=user_id).first()
            if not is_member:
                app.logger.warning(f"Access denied for TEAM_MEMBER {user_id} to mission {mission_id}")
                return jsonify({"error": "Access to this mission is forbidden"}), 403

        return jsonify({
            "id": mission.id,
            "mission_name": mission.mission_name,
            "fiscal_year": mission.fiscal_year,
            "client_name": mission.client_name,
            "status": mission.status.value,
            "client_id": mission.client_id,
            "number_of_report": mission.number_of_report,
            "price": mission.price
        }), 200
    except Exception as e:
        app.logger.error(f"Unexpected error fetching mission {mission_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/missions/<int:mission_id>', methods=['PUT'])
@jwt_required()
@roles_required(*MANAGER_ROLES)
def update_mission(mission_id):
    # ... (code inchangé)
    try:
        with transaction():
            app.logger.info(f"Updating mission: ID {mission_id}")
            mission = db.session.get(Mission, mission_id)
            if not mission:
                app.logger.error(f"Mission not found: {mission_id}")
                return jsonify({"error": f"Mission not found: {mission_id}"}), 404
            data = request.get_json()
            if not data:
                app.logger.error("No data provided for mission update")
                return jsonify({"error": "No data provided"}), 400
            mission.mission_name = validate_string(data.get('mission_name', mission.mission_name), "mission_name", 255)
            mission.fiscal_year = validate_numeric(data.get('fiscal_year', mission.fiscal_year), "fiscal_year", is_integer=True)
            mission.client_name = validate_string(data.get('client_name', mission.client_name), "client_name", 255)
            mission.status = validate_enum(data.get('status', mission.status), MissionStatus, "status")
            mission.price = validate_numeric(data.get('price', mission.price), "price") if data.get('price') is not None else mission.price
            mission.number_of_report = validate_numeric(data.get('number_of_report', mission.number_of_report), "number_of_report", is_integer=True) if data.get('number_of_report') is not None else mission.number_of_report
            if 'client_id' in data:
                client = db.session.get(Client, data['client_id'])
                if not client:
                    app.logger.error(f"Invalid client_id: {data['client_id']}")
                    return jsonify({"error": f"Invalid client_id: {data['client_id']}"}), 404
                mission.client_id = data['client_id']
            update_client_counts(mission.client_id)
            app.logger.info(f"Mission updated: ID {mission_id}")
            return jsonify({
                "id": mission.id,
                "mission_name": mission.mission_name,
                "fiscal_year": mission.fiscal_year,
                "client_name": mission.client_name,
                "status": mission.status.value,
                "client_id": mission.client_id,
                "number_of_report": mission.number_of_report,
                "price": mission.price
            }), 200
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error updating mission {mission_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error updating mission {mission_id}", exc_info=True)
        return jsonify({"error": "Failed to update mission: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error updating mission {mission_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/missions/<int:mission_id>', methods=['DELETE'])
@jwt_required()
@roles_required(*MANAGER_ROLES)
def delete_mission(mission_id):
    # ... (code inchangé)
    try:
        with transaction():
            mission = db.session.get(Mission, mission_id)
            if not mission:
                return jsonify({"error": "Mission not found"}), 404
            client_id = mission.client_id
            db.session.delete(mission)
            update_client_counts(client_id)
            return jsonify({"message": "Mission deleted successfully"}), 200
    except Exception as e:
        app.logger.error(f"Error deleting mission {mission_id}: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

# Report APIs
@app.route('/api/reports', methods=['GET'])
@jwt_required()
@roles_required(*READ_ACCESS_ROLES)
def get_reports():
    # --- MODIFIÉ POUR LA GESTION DES RÔLES ---
    try:
        user_id = get_jwt_identity()
        user_role = get_jwt()['role']
        
        mission_id = request.args.get('mission_id', type=int)
        status = request.args.get('status')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search')

        query = db.session.query(Report).options(joinedload(Report.mission))

        # Si auditeur, ne montrer que les rapports des missions autorisées
        if user_role == Role.TEAM_MEMBER.value:
            # Récupérer les IDs des missions de l'auditeur
            user_mission_ids = [tm.mission_id for tm in db.session.query(TeamMember).filter_by(user_id=user_id).all()]
            if not user_mission_ids:
                return jsonify({'reports': [], 'total': 0, 'page': page, 'per_page': per_page}), 200 # Pas de mission, pas de rapport
            query = query.filter(Report.mission_id.in_(user_mission_ids))
            app.logger.info(f"Filtering reports for TEAM_MEMBER {user_id} on missions {user_mission_ids}")

        if mission_id:
            query = query.filter_by(mission_id=mission_id)
        if status:
            query = query.filter_by(status=status.lower())
        if search:
            query = query.filter(Report.audit_subject.ilike(f"%{search}%"))

        total = query.count()
        reports = query.offset((page - 1) * per_page).limit(per_page).all()
        
        reports_data = [
            {
                'id': report.id,
                'nature': report.type.value if report.type else 'N/A',
                'start_date': report.start_date.isoformat() if report.start_date else None,
                'end_date': report.end_date.isoformat() if report.end_date else None,
                'audit_subject': report.audit_subject,
                'mission_id': report.mission_id,
                'mission_name': report.mission.mission_name if report.mission else None,
                'library_id': report.library_id,
                'library': {
                    'id': report.library.id,
                    'name': report.library.name,
                    'number_of_section': report.library.number_of_section
                } if report.library else None,
                'status': report.status.value,
                'download_url': f"/api/uploads/{os.path.basename(report.file_path)}" if report.file_path else None
            }
            for report in reports
        ]
        return jsonify({
            'reports': reports_data,
            'total': total,
            'page': page,
            'per_page': per_page
        }), 200
    except Exception as e:
        app.logger.error(f"Unexpected error fetching reports: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# ... (Le reste de vos endpoints sera modifié de manière similaire)
# Pour des raisons de concision, je vais appliquer les décorateurs au reste du code.

@app.route('/api/reports/<int:report_id>', methods=['GET'])
@jwt_required()
@roles_required(*READ_ACCESS_ROLES)
def get_report_by_id(report_id):
    # Une vérification supplémentaire est nécessaire pour les auditeurs
    # ... (code similaire à get_mission/<id>)
    try:
        app.logger.info(f"Fetching report by ID: {report_id}")
        report = db.session.query(Report).options(
            joinedload(Report.mission),
            joinedload(Report.library)
        ).get(report_id)

        if not report:
            app.logger.error(f"Report not found: {report_id}")
            return jsonify({"error": f"Report not found: {report_id}"}), 404
        
        user_id = get_jwt_identity()
        user_role = get_jwt()['role']
        if user_role == Role.TEAM_MEMBER.value:
            is_member = db.session.query(TeamMember).filter_by(mission_id=report.mission_id, user_id=user_id).first()
            if not is_member:
                return jsonify({"error": "Access to this report is forbidden"}), 403

        report_data = {
            'id': report.id,
            'type': report.type.value if report.type else None,
            'start_date': report.start_date.isoformat() if report.start_date else None,
            'end_date': report.end_date.isoformat() if report.end_date else None,
            'audit_subject': report.audit_subject,
            'mission_id': report.mission_id,
            'library_id': report.library_id,
            'status': report.status.value,
        }
        return jsonify(report_data), 200
    except Exception as e:
        app.logger.error(f"Error fetching report {report_id}: {str(e)}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/reports', methods=['POST'])
@jwt_required()
@roles_required(*MANAGER_ROLES)
def create_report():
    # ... (code inchangé)
    try:
        with transaction():
            if not request.content_type.startswith('multipart/form-data'):
                return jsonify({"error": "Content-Type must be multipart/form-data"}), 415
            
            data = request.form
            if not data:
                app.logger.error("No input data provided for report creation")
                return jsonify({"error": "No input data provided"}), 400
            required_fields = ['audit_subject', 'mission_id']
            for field in required_fields:
                if field not in data or not data[field]:
                    app.logger.error(f"Missing required field: {field}")
                    return jsonify({"error": f"Missing required field: {field}"}), 400
            mission = db.session.get(Mission, data['mission_id'])
            if not mission:
                app.logger.error(f"Mission not found: {data['mission_id']}")
                return jsonify({"error": f"Mission not found: {data['mission_id']}"}), 404

            file_to_save = None
            if 'file' in request.files:
                file = request.files['file']
                if file and file.filename and allowed_file(file.filename):
                    filename = secure_filename(file.filename)
                    file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    file_to_save = filename
                elif file and file.filename:
                    return jsonify({"error": "Invalid file type"}), 400

            status = validate_enum(data.get('status', 'encours'), ReportStatus, "status")
            report = Report(
                type=validate_report_type(data.get('type')) if data.get('type') else None,
                start_date=validate_date(data.get('start_date'), "start_date"),
                end_date=validate_date(data.get('end_date'), "end_date"),
                audit_subject=validate_string(data['audit_subject'], "audit_subject", 255),
                mission_id=data['mission_id'],
                library_id=data.get('library_id'),
                status=status,
                file_path=file_to_save
            )
            db.session.add(report)
            db.session.flush()
            update_mission_report_count(report.mission_id)
            update_client_counts(mission.client_id)
            app.logger.info(f"Report created: ID {report.id}")
            return jsonify({
                "message": "Report created successfully",
                "id": report.id,
                "status": report.status.value,
                "download_url": f"/api/uploads/{os.path.basename(report.file_path)}" if report.file_path else None
            }), 201
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error creating report: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error("Integrity error creating report", exc_info=True)
        return jsonify({"error": "Failed to create report: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error creating report: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# ... (Le reste des endpoints doit être protégé de la même manière)
# Voici quelques exemples pour finir :

@app.route('/api/libraries', methods=['POST'])
@jwt_required()
@roles_required(*MANAGER_ROLES, Role.LIBRARY_MANAGER)
def create_library():
    # ... (code inchangé)
    data = request.get_json()
    if not data:
        app.logger.error("No data provided for library creation")
        return jsonify({"error": "No data provided"}), 400
    app.logger.debug(f"Received library creation request: {data}")
    try:
        with transaction():
            required_fields = ['name', 'type']
            for field in required_fields:
                if field not in data or not data[field]:
                    app.logger.error(f"Missing required field: {field}")
                    return jsonify({"error": f"Missing required field: {field}"}), 400
            name = validate_string(data['name'], "name", 255)
            type_value = validate_enum(data['type'], Type, "type")
            number_of_section = validate_numeric(data.get('number_of_section', 0), "number_of_section", is_integer=True)
            new_library = Library(
                name=name,
                type=type_value,
                number_of_section=number_of_section
            )
            db.session.add(new_library)
            db.session.flush()
            app.logger.info(f"Library created: ID {new_library.id}")
            return jsonify({
                "id": new_library.id,
                "name": new_library.name,
                "type": new_library.type.value,
                "number_of_section": new_library.number_of_section
            }), 201
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error creating library: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error creating library", exc_info=True)
        return jsonify({"error": "Failed to create library: check constraints"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error creating library: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/libraries', methods=['GET'])
@jwt_required()
@roles_required(*READ_ACCESS_ROLES)
def get_libraries():
    # ... (code inchangé)
    try:
        app.logger.info("Fetching libraries")
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        libraries = db.session.query(Library).offset((page - 1) * per_page).limit(per_page).all()
        total = db.session.query(Library).count()
        app.logger.info(f"Fetched {total} libraries, page {page}, per_page {per_page}")
        return jsonify({
            "libraries": [{
                "id": library.id,
                "name": library.name,
                "type": library.type.value,
                "number_of_section": library.number_of_section
            } for library in libraries],
            "total": total,
            "page": page,
            "per_page": per_page
        }), 200
    except ValueError:
        app.logger.error("Invalid pagination parameters", exc_info=True)
        return jsonify({"error": "Invalid pagination parameters"}), 400
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error fetching libraries: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/users', methods=['POST'])
@jwt_required()
@roles_required(Role.ADMIN_SUPERIOR) # Seul un admin peut créer des utilisateurs
def create_user():
    # ... (code inchangé)
    data = request.get_json()
    if not data or not all(k in data for k in ['fullname', 'username', 'email', 'password', 'role']):
        return jsonify({"error": "Missing required fields"}), 400
    try:
        with transaction():
            new_user = User(
                fullname=data['fullname'],
                username=data['username'],
                email=data['email'],
                password=generate_password_hash(data['password']),
                role=validate_enum(data['role'], Role, 'role'),
                phone_number=data.get('phone_number')
            )
            db.session.add(new_user)
            db.session.flush()
            return jsonify({"id": new_user.id, "username": new_user.username}), 201
    except IntegrityError:
        return jsonify({"error": "Username or email already exists"}), 409
    except Exception as e:
        app.logger.error(f"Error creating user: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/users', methods=['GET'])
@jwt_required()
@roles_required(*MANAGER_ROLES, Role.READ_ONLY) # Les auditeurs ne voient pas la liste des utilisateurs
def get_users():
    # ... (code inchangé)
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        search = request.args.get('search')
        
        query = db.session.query(User)

        if search:
            search_term = f"%{search}%"
            query = query.filter(
                db.or_(
                    User.fullname.ilike(search_term),
                    User.username.ilike(search_term),
                    User.email.ilike(search_term)
                )
            )

        pagination = query.paginate(page=page, per_page=per_page, error_out=False)
        
        users_data = [
            {
                "id": user.id,
                "fullname": user.fullname,
                "username": user.username,
                "email": user.email,
                "phone_number": user.phone_number,
                "role": user.role.value
            } for user in pagination.items
        ]
        return jsonify({
            "users": users_data,
            "total": pagination.total, "page": page, "per_page": per_page
        }), 200
    except Exception as e:
        app.logger.error(f"Error fetching users: {e}", exc_info=True)
        return jsonify({"error": "Internal server error"}), 500

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@jwt_required()
@roles_required(Role.ADMIN_SUPERIOR) # Seul un admin peut modifier un utilisateur
def update_user(user_id):
    # ... (code inchangé)
    try:
        with transaction():
            app.logger.info(f"Updating user: ID {user_id}")
            user = db.session.get(User, user_id)
            if not user:
                app.logger.error(f"User not found: {user_id}")
                return jsonify({"error": f"User not found: {user_id}"}), 404
            
            data = request.get_json()
            if not data:
                app.logger.error("No data provided for user update")
                return jsonify({"error": "No data provided"}), 400

            if 'fullname' in data:
                user.fullname = validate_string(data['fullname'], "fullname", 255)
            if 'username' in data:
                user.username = validate_string(data['username'], "username", 100)
            if 'email' in data:
                user.email = validate_string(data['email'], "email", 255)
            
            if 'password' in data and data['password']:
                user.password = generate_password_hash(data['password'])
            
            if 'phone_number' in data:
                user.phone_number = validate_string(data['phone_number'], "phone_number", 100) if data.get('phone_number') else None
            
            if 'role' in data:
                user.role = validate_enum(data['role'], Role, "role")

            app.logger.info(f"User updated: ID {user_id}")
            return jsonify({
                "id": user.id,
                "fullname": user.fullname,
                "username": user.username,
                "email": user.email,
                "phone_number": user.phone_number,
                "role": user.role.value
            }), 200
    except (KeyError, ValueError) as e:
        app.logger.error(f"Validation error updating user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 400
    except IntegrityError:
        app.logger.error(f"Integrity error updating user {user_id}: username {data.get('username')} or email {data.get('email')}", exc_info=True)
        return jsonify({"error": "Failed to update user: username or email may already exist"}), 400
    except Exception as e:
        app.logger.error(f"Unexpected error updating user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
@roles_required(Role.ADMIN_SUPERIOR) # Seul un admin peut supprimer un utilisateur
def delete_user(user_id):
    # ... (code inchangé)
    try:
        with transaction():
            app.logger.info(f"Deleting user: ID {user_id}")
            user = db.session.get(User, user_id)
            if not user:
                app.logger.error(f"User not found: {user_id}")
                return jsonify({"error": f"User not found: {user_id}"}), 404
            db.session.delete(user)
            app.logger.info(f"User deleted: ID {user_id}")
            return jsonify({"message": f"User {user_id} deleted successfully"}), 200
    except OperationalError as e:
        app.logger.error(f"Database connection error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Database connection error: {str(e)}"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error deleting user {user_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/api/analyze-report', methods=['POST'])
@jwt_required()
@roles_required(*MANAGER_ROLES)
def analyze_report_conformity():
    # ... (code inchangé)
    app.logger.info("Requête d'analyse de conformité reçue.")

    if not groq_client:
        app.logger.error("Tentative d'analyse alors que le client Groq n'est pas initialisé.")
        return jsonify({"error": "Le service d'analyse par IA n'est pas configuré sur le serveur (clé API manquante)."}), 503

    if 'candidate_pdf' not in request.files or 'reference_pdf' not in request.files:
        app.logger.error("Fichiers manquants dans la requête: 'candidate_pdf' et 'reference_pdf' sont requis.")
        return jsonify({"error": "Les fichiers PDF de référence et candidat sont requis."}), 400

    candidate_file = request.files['candidate_pdf']
    reference_file = request.files['reference_pdf']

    if (candidate_file.filename == '' or not allowed_file(candidate_file.filename) or
        reference_file.filename == '' or not allowed_file(reference_file.filename)):
        app.logger.error("Type de fichier non valide pour le candidat ou la référence.")
        return jsonify({"error": "Type de fichier non valide. Seuls les fichiers PDF sont acceptés."}), 400

    temp_dir_path = tempfile.mkdtemp(dir=app.config['UPLOAD_FOLDER'])
    candidate_filepath = os.path.join(temp_dir_path, secure_filename(candidate_file.filename))
    reference_filepath = os.path.join(temp_dir_path, secure_filename(reference_file.filename))

    try:
        candidate_file.save(candidate_filepath)
        reference_file.save(reference_filepath)
        app.logger.info(f"Fichiers sauvegardés temporairement: Candidat={candidate_filepath}, Référence={reference_filepath}")

        final_report = analyze_pdfs_main(
            reference_pdf_path=reference_filepath,
            candidate_pdf_path=candidate_filepath
        )

        if not final_report:
             app.logger.error("L'analyse n'a retourné aucun résultat (None).")
             return jsonify({"error": "L'analyse a échoué et n'a retourné aucun résultat."}), 500

        if "error" in final_report:
            error_message = final_report.get("error", "L'analyse a produit une erreur non spécifiée.")
            app.logger.error(f"Erreur renvoyée par le script d'analyse : {error_message}")
            return jsonify({"error": error_message}), 422

        app.logger.info("Analyse par IA terminée avec succès.")
        return jsonify(final_report), 200

    except TypeError as te:
        app.logger.error(f"Erreur de type (TypeError) durant l'appel de l'analyse: {te}", exc_info=True)
        return jsonify({"error": f"Erreur de configuration du serveur (TypeError): {te}"}), 500
    except Exception as e:
        app.logger.error(f"Erreur majeure durant le processus d'analyse IA : {str(e)}", exc_info=True)
        return jsonify({"error": f"Une erreur est survenue sur le serveur durant l'analyse : {str(e)}"}), 500
    
    finally:
        try:
            for filepath in [candidate_filepath, reference_filepath]:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    app.logger.info(f"Fichier temporaire {os.path.basename(filepath)} supprimé.")
            if os.path.exists(temp_dir_path):
                os.rmdir(temp_dir_path)
                app.logger.info(f"Dossier temporaire {os.path.basename(temp_dir_path)} supprimé.")
        except Exception as e:
            app.logger.error(f"Erreur lors du nettoyage des fichiers temporaires : {e}", exc_info=True)

# À la fin de votre fichier app.py

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)